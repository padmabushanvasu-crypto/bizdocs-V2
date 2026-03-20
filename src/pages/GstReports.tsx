import { useState } from "react";
import { FileSpreadsheet, Download, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { exportToExcel } from "@/lib/export-utils";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter } from "date-fns";

type DateRange = "this_month" | "last_month" | "this_quarter" | "this_fy";

function getDateBounds(range: DateRange): { start: string; end: string; label: string } {
  const now = new Date();
  if (range === "this_month") {
    return {
      start: format(startOfMonth(now), "yyyy-MM-dd"),
      end: format(now, "yyyy-MM-dd"),
      label: format(now, "MMMM yyyy"),
    };
  }
  if (range === "last_month") {
    const prev = subMonths(now, 1);
    return {
      start: format(startOfMonth(prev), "yyyy-MM-dd"),
      end: format(endOfMonth(prev), "yyyy-MM-dd"),
      label: format(prev, "MMMM yyyy"),
    };
  }
  if (range === "this_quarter") {
    return {
      start: format(startOfQuarter(now), "yyyy-MM-dd"),
      end: format(now, "yyyy-MM-dd"),
      label: `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`,
    };
  }
  // this_fy
  const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    start: `${fy}-04-01`,
    end: format(now, "yyyy-MM-dd"),
    label: `FY ${String(fy).slice(2)}-${String(fy + 1).slice(2)}`,
  };
}

function slugLabel(label: string): string {
  return label.replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "");
}

// ── Report Card ───────────────────────────────────────────────────────────────

interface ReportCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onDownload: (range: DateRange) => Promise<void>;
}

function ReportCard({ icon, title, description, onDownload }: ReportCardProps) {
  const [range, setRange] = useState<DateRange>("this_month");
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      await onDownload(range);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="paper-card flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-50 p-2 shrink-0">{icon}</div>
        <div>
          <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-auto">
        <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this_month">This Month</SelectItem>
            <SelectItem value="last_month">Last Month</SelectItem>
            <SelectItem value="this_quarter">This Quarter</SelectItem>
            <SelectItem value="this_fy">This Financial Year</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
          onClick={handleDownload}
          disabled={loading}
        >
          <Download className="h-3.5 w-3.5" />
          {loading ? "Generating…" : "Download"}
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function GstReports() {
  const { toast } = useToast();

  const handleError = (title: string) => {
    toast({ title, description: "Check console for details.", variant: "destructive" });
  };

  // 1. GSTR-1 Summary
  const downloadGstr1 = async (range: DateRange) => {
    const { start, end, label } = getDateBounds(range);
    const { data: invoices, error: invErr } = await supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, customer_name, customer_gstin, place_of_supply, taxable_value, cgst_amount, sgst_amount, igst_amount, total_gst, grand_total")
      .gte("invoice_date", start)
      .lte("invoice_date", end)
      .neq("status", "cancelled")
      .order("invoice_date", { ascending: true });
    if (invErr) { handleError("Failed to fetch invoices"); return; }

    const invData = invoices ?? [];
    const invIds = invData.map((i: any) => i.id);
    let lineItems: any[] = [];
    if (invIds.length > 0) {
      const { data: li } = await (supabase as any)
        .from("invoice_line_items")
        .select("invoice_id, serial_number, description, hsn_sac_code, quantity, unit, unit_price, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount, line_total")
        .in("invoice_id", invIds)
        .order("invoice_id")
        .order("serial_number");
      lineItems = li ?? [];
    }

    const invMap = new Map(invData.map((i: any) => [i.id, i]));
    const rows = lineItems.map((li: any) => {
      const inv = invMap.get(li.invoice_id) as any;
      return {
        invoice_number: inv?.invoice_number ?? "",
        invoice_date: inv?.invoice_date ?? "",
        customer_name: inv?.customer_name ?? "",
        customer_gstin: inv?.customer_gstin ?? "",
        place_of_supply: inv?.place_of_supply ?? "",
        hsn_sac_code: li.hsn_sac_code ?? "",
        description: li.description ?? "",
        quantity: li.quantity,
        unit: li.unit,
        taxable_amount: li.taxable_amount,
        gst_rate: li.gst_rate,
        cgst_amount: li.cgst_amount,
        sgst_amount: li.sgst_amount,
        igst_amount: li.igst_amount,
        line_total: li.line_total,
      };
    });

    exportToExcel(
      rows,
      [
        { key: "invoice_number", label: "Invoice No", width: 14 },
        { key: "invoice_date", label: "Date", type: "date", width: 12 },
        { key: "customer_name", label: "Customer Name", width: 24 },
        { key: "customer_gstin", label: "Customer GSTIN", width: 18 },
        { key: "place_of_supply", label: "Place of Supply", width: 16 },
        { key: "hsn_sac_code", label: "HSN/SAC", width: 12 },
        { key: "description", label: "Description", width: 28 },
        { key: "quantity", label: "Qty", type: "number", width: 8 },
        { key: "unit", label: "Unit", width: 8 },
        { key: "gst_rate", label: "GST %", type: "number", width: 8 },
        { key: "taxable_amount", label: "Taxable Value", type: "currency", width: 14 },
        { key: "cgst_amount", label: "CGST", type: "currency", width: 12 },
        { key: "sgst_amount", label: "SGST", type: "currency", width: 12 },
        { key: "igst_amount", label: "IGST", type: "currency", width: 12 },
        { key: "line_total", label: "Invoice Value", type: "currency", width: 14 },
      ],
      `BizDocs_GSTR1_${slugLabel(label)}.xlsx`,
      "GSTR-1"
    );
  };

  // 2. GSTR-2 / ITC from GRNs
  const downloadGstr2 = async (range: DateRange) => {
    const { start, end, label } = getDateBounds(range);
    const { data: grns, error } = await (supabase as any)
      .from("grns")
      .select("id, grn_number, grn_date, vendor_name, vendor_gstin, vendor_invoice_number, status")
      .gte("grn_date", start)
      .lte("grn_date", end)
      .neq("status", "cancelled")
      .order("grn_date", { ascending: true });
    if (error) { handleError("Failed to fetch GRNs"); return; }

    const grnData = grns ?? [];
    const grnIds = grnData.map((g: any) => g.id);
    let lineItems: any[] = [];
    if (grnIds.length > 0) {
      const { data: li } = await (supabase as any)
        .from("grn_line_items")
        .select("grn_id, description, accepting_now, unit, unit_price, gst_rate")
        .in("grn_id", grnIds);
      lineItems = li ?? [];
    }

    const grnMap = new Map(grnData.map((g: any) => [g.id, g]));
    const rows = lineItems.map((li: any) => {
      const grn = grnMap.get(li.grn_id) as any;
      const taxable = (li.accepting_now ?? 0) * (li.unit_price ?? 0);
      const gstRate = li.gst_rate ?? 0;
      const totalGst = taxable * (gstRate / 100);
      const cgst = totalGst / 2;
      return {
        grn_number: grn?.grn_number ?? "",
        grn_date: grn?.grn_date ?? "",
        vendor_name: grn?.vendor_name ?? "",
        vendor_gstin: grn?.vendor_gstin ?? "",
        vendor_invoice: grn?.vendor_invoice_number ?? "",
        description: li.description ?? "",
        taxable_value: taxable,
        gst_rate: gstRate,
        cgst_amount: cgst,
        sgst_amount: cgst,
        igst_amount: 0,
        total_gst: totalGst,
      };
    });

    exportToExcel(
      rows,
      [
        { key: "grn_number", label: "GRN No", width: 14 },
        { key: "grn_date", label: "Date", type: "date", width: 12 },
        { key: "vendor_name", label: "Vendor Name", width: 24 },
        { key: "vendor_gstin", label: "Vendor GSTIN", width: 18 },
        { key: "vendor_invoice", label: "Vendor Invoice", width: 16 },
        { key: "description", label: "Description", width: 28 },
        { key: "taxable_value", label: "Taxable Value", type: "currency", width: 14 },
        { key: "gst_rate", label: "GST Rate %", type: "number", width: 10 },
        { key: "cgst_amount", label: "CGST", type: "currency", width: 12 },
        { key: "sgst_amount", label: "SGST", type: "currency", width: 12 },
        { key: "igst_amount", label: "IGST", type: "currency", width: 12 },
        { key: "total_gst", label: "Total GST", type: "currency", width: 12 },
      ],
      `BizDocs_GSTR2_${slugLabel(label)}.xlsx`,
      "GSTR-2"
    );
  };

  // 3. HSN Summary
  const downloadHsn = async (range: DateRange) => {
    const { start, end, label } = getDateBounds(range);
    const { data: invs } = await supabase
      .from("invoices")
      .select("id")
      .gte("invoice_date", start)
      .lte("invoice_date", end)
      .neq("status", "cancelled");
    const invIds = (invs ?? []).map((i: any) => i.id);
    if (invIds.length === 0) {
      toast({ title: "No invoices in this period" });
      return;
    }
    const { data: li, error } = await (supabase as any)
      .from("invoice_line_items")
      .select("hsn_sac_code, description, unit, quantity, taxable_amount, cgst_amount, sgst_amount, igst_amount")
      .in("invoice_id", invIds);
    if (error) { handleError("Failed to fetch line items"); return; }

    // Group by HSN
    const hsnMap = new Map<string, {
      hsn_sac_code: string; description: string; unit: string;
      total_qty: number; total_taxable: number;
      cgst: number; sgst: number; igst: number;
    }>();
    for (const row of (li ?? []) as any[]) {
      const key = row.hsn_sac_code ?? "—";
      const existing = hsnMap.get(key);
      if (existing) {
        existing.total_qty += row.quantity ?? 0;
        existing.total_taxable += row.taxable_amount ?? 0;
        existing.cgst += row.cgst_amount ?? 0;
        existing.sgst += row.sgst_amount ?? 0;
        existing.igst += row.igst_amount ?? 0;
      } else {
        hsnMap.set(key, {
          hsn_sac_code: key,
          description: row.description ?? "",
          unit: row.unit ?? "",
          total_qty: row.quantity ?? 0,
          total_taxable: row.taxable_amount ?? 0,
          cgst: row.cgst_amount ?? 0,
          sgst: row.sgst_amount ?? 0,
          igst: row.igst_amount ?? 0,
        });
      }
    }

    const rows = [...hsnMap.values()].map((r) => ({
      ...r,
      total_gst: r.cgst + r.sgst + r.igst,
    }));

    exportToExcel(
      rows,
      [
        { key: "hsn_sac_code", label: "HSN/SAC Code", width: 14 },
        { key: "description", label: "Description", width: 28 },
        { key: "unit", label: "UOM", width: 8 },
        { key: "total_qty", label: "Total Qty", type: "number", width: 10 },
        { key: "total_taxable", label: "Taxable Value", type: "currency", width: 14 },
        { key: "cgst", label: "CGST", type: "currency", width: 12 },
        { key: "sgst", label: "SGST", type: "currency", width: 12 },
        { key: "igst", label: "IGST", type: "currency", width: 12 },
        { key: "total_gst", label: "Total GST", type: "currency", width: 12 },
      ],
      `BizDocs_HSN_${slugLabel(label)}.xlsx`,
      "HSN Summary"
    );
  };

  // 4. ITC Register from POs
  const downloadItc = async (range: DateRange) => {
    const { start, end, label } = getDateBounds(range);
    const { data: pos, error } = await supabase
      .from("purchase_orders")
      .select("id, po_number, po_date, vendor_name, vendor_gstin")
      .gte("po_date", start)
      .lte("po_date", end)
      .neq("status", "cancelled")
      .order("po_date", { ascending: true });
    if (error) { handleError("Failed to fetch POs"); return; }

    const poData = pos ?? [];
    const poIds = poData.map((p: any) => p.id);
    let lineItems: any[] = [];
    if (poIds.length > 0) {
      const { data: li } = await (supabase as any)
        .from("po_line_items")
        .select("po_id, description, quantity, unit_price, gst_rate, line_total")
        .in("po_id", poIds);
      lineItems = li ?? [];
    }

    const poMap = new Map(poData.map((p: any) => [p.id, p]));
    const rows = lineItems.map((li: any) => {
      const po = poMap.get(li.po_id) as any;
      const taxable = li.line_total ?? (li.quantity ?? 0) * (li.unit_price ?? 0);
      const gstRate = li.gst_rate ?? 0;
      const itcAmount = taxable * (gstRate / 100);
      return {
        po_number: po?.po_number ?? "",
        po_date: po?.po_date ?? "",
        vendor_name: po?.vendor_name ?? "",
        vendor_gstin: po?.vendor_gstin ?? "",
        description: li.description ?? "",
        taxable_value: taxable,
        gst_rate: gstRate,
        itc_amount: itcAmount,
      };
    });

    exportToExcel(
      rows,
      [
        { key: "po_number", label: "PO No", width: 14 },
        { key: "po_date", label: "Date", type: "date", width: 12 },
        { key: "vendor_name", label: "Vendor", width: 24 },
        { key: "vendor_gstin", label: "GSTIN", width: 18 },
        { key: "description", label: "Description", width: 28 },
        { key: "taxable_value", label: "Taxable Value", type: "currency", width: 14 },
        { key: "gst_rate", label: "GST Rate %", type: "number", width: 10 },
        { key: "itc_amount", label: "ITC Amount", type: "currency", width: 14 },
      ],
      `BizDocs_ITC_${slugLabel(label)}.xlsx`,
      "ITC Register"
    );
  };

  // 5. E-way Bill Data
  const downloadEway = async (range: DateRange) => {
    const { start, end, label } = getDateBounds(range);
    const { data: dcs, error } = await supabase
      .from("delivery_challans")
      .select("id, dc_number, dc_date, party_name, party_gstin, from_state, to_state, vehicle_number, approximate_value")
      .gte("dc_date", start)
      .lte("dc_date", end)
      .neq("status", "cancelled")
      .order("dc_date", { ascending: true });
    if (error) { handleError("Failed to fetch DCs"); return; }

    const dcData = dcs ?? [];
    const dcIds = dcData.map((d: any) => d.id);
    let lineItems: any[] = [];
    if (dcIds.length > 0) {
      const { data: li } = await (supabase as any)
        .from("dc_line_items")
        .select("dc_id, description, hsn_sac_code, qty_nos, approximate_value")
        .in("dc_id", dcIds);
      lineItems = li ?? [];
    }

    const dcMap = new Map(dcData.map((d: any) => [d.id, d]));
    const rows = lineItems.map((li: any) => {
      const dc = dcMap.get(li.dc_id) as any;
      return {
        dc_number: dc?.dc_number ?? "",
        dc_date: dc?.dc_date ?? "",
        party_name: dc?.party_name ?? "",
        party_gstin: dc?.party_gstin ?? "",
        from_state: dc?.from_state ?? "",
        to_state: dc?.to_state ?? "",
        vehicle_number: dc?.vehicle_number ?? "",
        description: li.description ?? "",
        hsn_sac_code: li.hsn_sac_code ?? "",
        qty: li.qty_nos ?? 0,
        value: li.approximate_value ?? 0,
      };
    });

    exportToExcel(
      rows,
      [
        { key: "dc_number", label: "DC No", width: 14 },
        { key: "dc_date", label: "Date", type: "date", width: 12 },
        { key: "party_name", label: "Party Name", width: 24 },
        { key: "party_gstin", label: "GSTIN", width: 18 },
        { key: "from_state", label: "From State", width: 16 },
        { key: "to_state", label: "To State", width: 16 },
        { key: "description", label: "Description", width: 28 },
        { key: "hsn_sac_code", label: "HSN", width: 12 },
        { key: "qty", label: "Qty", type: "number", width: 8 },
        { key: "value", label: "Value", type: "currency", width: 14 },
        { key: "vehicle_number", label: "Vehicle No", width: 14 },
      ],
      `BizDocs_EwayBill_${slugLabel(label)}.xlsx`,
      "E-way Bill"
    );
  };

  // 6. Job Work Register
  const downloadJobWork = async (range: DateRange) => {
    const { start, end, label } = getDateBounds(range);
    const { data: dcs, error } = await supabase
      .from("delivery_challans")
      .select("id, dc_number, dc_date, party_name, party_gstin, return_due_date, status")
      .eq("dc_type" as any, "returnable")
      .gte("dc_date", start)
      .lte("dc_date", end)
      .order("dc_date", { ascending: true });
    if (error) { handleError("Failed to fetch job work DCs"); return; }

    const dcData = dcs ?? [];
    const dcIds = dcData.map((d: any) => d.id);
    let lineItems: any[] = [];
    if (dcIds.length > 0) {
      const { data: li } = await (supabase as any)
        .from("dc_line_items")
        .select("dc_id, description, qty_nos, returned_qty_nos")
        .in("dc_id", dcIds);
      lineItems = li ?? [];
    }

    const dcMap = new Map(dcData.map((d: any) => [d.id, d]));
    const rows = lineItems.map((li: any) => {
      const dc = dcMap.get(li.dc_id) as any;
      const qtySent = li.qty_nos ?? 0;
      const qtyReturned = li.returned_qty_nos ?? 0;
      const daysOut = dc?.dc_date
        ? Math.max(0, Math.floor((Date.now() - new Date(dc.dc_date).getTime()) / 86400000))
        : 0;
      return {
        dc_number: dc?.dc_number ?? "",
        dc_date: dc?.dc_date ?? "",
        vendor_name: dc?.party_name ?? "",
        vendor_gstin: dc?.party_gstin ?? "",
        description: li.description ?? "",
        qty_sent: qtySent,
        qty_returned: qtyReturned,
        pending_qty: Math.max(0, qtySent - qtyReturned),
        days_out: daysOut,
      };
    });

    exportToExcel(
      rows,
      [
        { key: "dc_number", label: "DC No", width: 14 },
        { key: "dc_date", label: "Date", type: "date", width: 12 },
        { key: "vendor_name", label: "Vendor Name", width: 24 },
        { key: "vendor_gstin", label: "Vendor GSTIN", width: 18 },
        { key: "description", label: "Component", width: 28 },
        { key: "qty_sent", label: "Qty Sent", type: "number", width: 10 },
        { key: "qty_returned", label: "Qty Returned", type: "number", width: 12 },
        { key: "pending_qty", label: "Pending Qty", type: "number", width: 12 },
        { key: "days_out", label: "Days Out", type: "number", width: 10 },
      ],
      `BizDocs_JobWork_${slugLabel(label)}.xlsx`,
      "Job Work Register"
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-blue-600" />
          GST Reports
        </h1>
        <p className="text-sm text-slate-500 mt-1">Download GST-ready Excel files for CA filing</p>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800 text-sm">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
        <p>
          These reports are supporting documents to assist GST filing. They are not direct portal integrations.
          Please share with your CA or accountant for filing.
        </p>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ReportCard
          icon={<FileSpreadsheet className="h-4 w-4 text-blue-600" />}
          title="GSTR-1 Summary (Outward Supplies)"
          description="All sales invoices with customer GSTIN, taxable value, and GST breakup by rate. Required for monthly/quarterly GSTR-1 filing."
          onDownload={downloadGstr1}
        />
        <ReportCard
          icon={<FileSpreadsheet className="h-4 w-4 text-blue-600" />}
          title="GSTR-2 Summary (Inward Supplies / ITC)"
          description="All purchase receipts for input tax credit reconciliation. Cross-reference with vendor GSTR-1 data."
          onDownload={downloadGstr2}
        />
        <ReportCard
          icon={<FileSpreadsheet className="h-4 w-4 text-blue-600" />}
          title="HSN Summary"
          description="Goods sold grouped by HSN code — required in GSTR-1 above the threshold turnover. Aggregated by HSN/SAC across the period."
          onDownload={downloadHsn}
        />
        <ReportCard
          icon={<FileSpreadsheet className="h-4 w-4 text-blue-600" />}
          title="ITC Register"
          description="Full input tax credit register from all purchase orders. Use for monthly ITC tracking and 2A reconciliation."
          onDownload={downloadItc}
        />
        <ReportCard
          icon={<FileSpreadsheet className="h-4 w-4 text-blue-600" />}
          title="E-way Bill Data"
          description="DC and invoice data formatted for e-way bill portal upload. Includes vehicle number, states, HSN, and values."
          onDownload={downloadEway}
        />
        <ReportCard
          icon={<FileSpreadsheet className="h-4 w-4 text-blue-600" />}
          title="Job Work Register (GST-relevant)"
          description="All components sent for job work under returnable DCs — required for job work GST compliance under Section 143."
          onDownload={downloadJobWork}
        />
      </div>
    </div>
  );
}
