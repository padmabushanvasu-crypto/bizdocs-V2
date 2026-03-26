import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { SegmentedControl } from "@/components/SegmentedControl";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/gst-utils";
import { format } from "date-fns";

const today = () => format(new Date(), "yyyy-MM-dd");

async function fetchOpenDCs() {
  const { data } = await supabase
    .from("delivery_challans")
    .select("*")
    .in("status", ["issued", "partially_returned"])
    .order("return_due_date", { ascending: true });
  return data ?? [];
}

async function fetchOpenPOs() {
  const { data } = await supabase
    .from("purchase_orders")
    .select("*")
    .in("status", ["issued", "partially_received"])
    .order("po_date", { ascending: true });
  return data ?? [];
}

async function fetchUnpaidInvoices() {
  const { data } = await supabase
    .from("invoices")
    .select("*")
    .neq("status", "cancelled")
    .gt("amount_outstanding", 0)
    .order("due_date", { ascending: true });
  return data ?? [];
}

function daysDiff(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function rowBg(daysUntilDue: number | null): string {
  if (daysUntilDue === null) return "";
  if (daysUntilDue < 0) return "bg-rose-50/60";
  if (daysUntilDue <= 7) return "bg-amber-50/60";
  return "";
}

export default function OpenItems() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("dcs");

  const { data: dcs } = useQuery({ queryKey: ["open-dcs"], queryFn: fetchOpenDCs });
  const { data: pos } = useQuery({ queryKey: ["open-pos"], queryFn: fetchOpenPOs });
  const { data: invs } = useQuery({ queryKey: ["open-invs"], queryFn: fetchUnpaidInvoices });

  const overdueDCs = (dcs ?? []).filter((d) => d.return_due_date && d.return_due_date < today()).length;
  const dcApproxValue = (dcs ?? []).reduce((s, d) => s + (d.approximate_value ?? 0), 0);

  const poValue = (pos ?? []).reduce((s, p) => s + (p.grand_total ?? 0), 0);

  const totalOutstanding = (invs ?? []).reduce((s, i) => s + (i.amount_outstanding ?? 0), 0);
  const overdueAmt = (invs ?? []).filter((i) => i.due_date && i.due_date < today()).reduce((s, i) => s + (i.amount_outstanding ?? 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Open Items</h1>
        <p className="text-sm text-slate-500 mt-1">Track all pending deliveries, returns, and payments</p>
      </div>

      <SegmentedControl
        options={[
          { value: "dcs", label: "Pending DCs", count: dcs?.length ?? 0 },
          { value: "pos", label: "Pending POs", count: pos?.length ?? 0 },
          { value: "invs", label: "Unpaid Invoices", count: invs?.length ?? 0 },
        ]}
        value={tab}
        onChange={setTab}
      />

        {/* Pending DCs */}
        {tab === "dcs" && <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {dcs?.length ?? 0} DCs open | {overdueDCs} overdue | {formatCurrency(dcApproxValue)} of goods outside
          </p>
          <div className="paper-card !p-0 overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>DC No.</th><th>Date</th><th>Party</th><th className="text-right">Items</th>
                  <th className="text-right">Qty Sent</th><th>Return Due</th><th>Days</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(dcs ?? []).length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No open DCs</td></tr>
                ) : (
                  (dcs ?? []).map((dc) => {
                    const days = daysDiff(dc.return_due_date);
                    return (
                      <tr key={dc.id} onClick={() => navigate(`/delivery-challans/${dc.id}`)} className={`hover:bg-muted/50 cursor-pointer transition-colors ${rowBg(days)}`}>
                        <td className="font-mono text-sm font-medium">{dc.dc_number}</td>
                        <td className="text-muted-foreground">{dc.dc_date}</td>
                        <td className="font-medium">{dc.party_name}</td>
                        <td className="text-right">{dc.total_items ?? 0}</td>
                        <td className="text-right font-mono tabular-nums">{dc.total_qty ?? 0}</td>
                        <td className="text-muted-foreground">{dc.return_due_date || "—"}</td>
                        <td className={days !== null && days < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                          {days !== null ? (days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`) : "—"}
                        </td>
                        <td><span className={dc.status === "partially_returned" ? "status-overdue" : "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full"}>{dc.status?.replace("_", " ")}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>}

        {/* Pending POs */}
        {tab === "pos" && <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {pos?.length ?? 0} POs awaiting full delivery | {formatCurrency(poValue)} worth of goods pending
          </p>
          <div className="paper-card !p-0 overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>PO No.</th><th>Date</th><th>Vendor</th><th className="text-right">Value</th>
                  <th>PO Date</th><th>Days Open</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(pos ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No open POs</td></tr>
                ) : (
                  (pos ?? []).map((po) => {
                    const daysOpen = po.issued_at ? Math.floor((Date.now() - new Date(po.issued_at).getTime()) / 86400000) : null;
                    return (
                      <tr key={po.id} onClick={() => navigate(`/purchase-orders/${po.id}`)} className="hover:bg-muted/50 cursor-pointer transition-colors">
                        <td className="font-mono text-sm font-medium">{po.po_number}</td>
                        <td className="text-muted-foreground">{po.po_date}</td>
                        <td className="font-medium">{po.vendor_name}</td>
                        <td className="text-right font-mono tabular-nums">{formatCurrency(po.grand_total ?? 0)}</td>
                        <td className="text-muted-foreground">{po.po_date}</td>
                        <td className={daysOpen !== null && daysOpen > 30 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                          {daysOpen !== null ? `${daysOpen}d` : "—"}
                        </td>
                        <td><span className={po.status === "partially_received" ? "status-overdue" : "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full"}>{po.status?.replace("_", " ")}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>}

        {/* Unpaid Invoices */}
        {tab === "invs" && <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {formatCurrency(totalOutstanding)} unpaid | {formatCurrency(overdueAmt)} overdue
          </p>
          <div className="paper-card !p-0 overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Invoice No.</th><th>Date</th><th>Customer</th><th className="text-right">Total</th>
                  <th className="text-right">Paid</th><th className="text-right">Outstanding</th>
                  <th>Due Date</th><th>Days</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(invs ?? []).length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">All invoices paid!</td></tr>
                ) : (
                  (invs ?? []).map((inv) => {
                    const days = daysDiff(inv.due_date);
                    return (
                      <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className={`hover:bg-muted/50 cursor-pointer transition-colors ${rowBg(days)}`}>
                        <td className="font-mono text-sm font-medium">{inv.invoice_number}</td>
                        <td className="text-muted-foreground">{inv.invoice_date}</td>
                        <td className="font-medium">{inv.customer_name}</td>
                        <td className="text-right font-mono tabular-nums">{formatCurrency(inv.grand_total ?? 0)}</td>
                        <td className="text-right font-mono tabular-nums">{formatCurrency(inv.amount_paid ?? 0)}</td>
                        <td className="text-right font-mono tabular-nums font-semibold text-amber-600">{formatCurrency(inv.amount_outstanding ?? 0)}</td>
                        <td className="text-muted-foreground">{inv.due_date || "—"}</td>
                        <td className={days !== null && days < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                          {days !== null ? (days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`) : "—"}
                        </td>
                        <td><span className={inv.status === "partially_paid" ? "status-overdue" : "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full"}>{inv.status?.replace("_", " ")}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>}
    </div>
  );
}
