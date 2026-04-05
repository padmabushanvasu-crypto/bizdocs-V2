import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchGrnInspectionLines, type GRN, type GrnInspectionLine } from "@/lib/grn-api";
import { DocumentHeader } from "@/components/DocumentHeader";

interface Props {
  grn: GRN;
}

const MIN_ROWS = 10;

export function GrnPrintButton({ grnId }: { grnId: string }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.open(`/grn/${grnId}/print`, "_blank")}
    >
      <Printer className="h-3.5 w-3.5 mr-1" /> Print Inspection Report
    </Button>
  );
}

export default function GrnPrintView({ grn }: Props) {
  const { data: inspectionLines = [] } = useQuery({
    queryKey: ["grn-inspection-lines", grn.id],
    queryFn: () => fetchGrnInspectionLines(grn.id),
  });

  const items = grn.line_items ?? [];
  const g = grn as any;

  // Pad inspection lines to MIN_ROWS
  const paddedLines: (GrnInspectionLine | null)[] = [
    ...inspectionLines,
    ...Array(Math.max(0, MIN_ROWS - inspectionLines.length)).fill(null),
  ];

  const checkedQty = inspectionLines.reduce((s, l) => s + (l.qty_checked ?? 0), 0);
  const acceptedCount = inspectionLines.filter((l) => l.result === "pass").length;
  const failedCount = inspectionLines.filter((l) => l.result === "fail").length;

  return (
    <div className="print-page bg-white text-black p-8 max-w-[210mm] mx-auto text-[11px] font-sans">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-page, .print-page * { visibility: visible; }
          .print-page { position: absolute; left: 0; top: 0; width: 210mm; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      {/* Header */}
      <div className="border-2 border-black">
        {/* Company header */}
        <div className="p-3 border-b border-black">
          <DocumentHeader />
        </div>

        {/* Title */}
        <div className="text-center py-2 border-b border-black bg-slate-50">
          <h1 className="text-sm font-bold uppercase tracking-wider">
            Goods Receipt Cum Inspection Report
          </h1>
          <p className="text-[10px] text-slate-500">Doc No: INS/GRIR/04</p>
        </div>

        {/* GRIN details */}
        <div className="grid grid-cols-2 border-b border-black text-[11px]">
          <div className="p-3 space-y-1 border-r border-black">
            <div className="flex gap-2">
              <span className="font-semibold w-28 shrink-0">GRN No.</span>
              <span className="font-mono">{grn.grn_number}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold w-28 shrink-0">GRN Date</span>
              <span>{new Date(grn.grn_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold w-28 shrink-0">Vendor</span>
              <span>{grn.vendor_name || "—"}</span>
            </div>
            {grn.vendor_invoice_number && (
              <div className="flex gap-2">
                <span className="font-semibold w-28 shrink-0">Invoice No.</span>
                <span className="font-mono">{grn.vendor_invoice_number}</span>
              </div>
            )}
          </div>
          <div className="p-3 space-y-1">
            {grn.po_number && (
              <div className="flex gap-2">
                <span className="font-semibold w-28 shrink-0">PO No.</span>
                <span className="font-mono">{grn.po_number}</span>
              </div>
            )}
            {grn.vehicle_number && (
              <div className="flex gap-2">
                <span className="font-semibold w-28 shrink-0">Vehicle No.</span>
                <span>{grn.vehicle_number}</span>
              </div>
            )}
            {g.driver_name && (
              <div className="flex gap-2">
                <span className="font-semibold w-28 shrink-0">Driver</span>
                <span>{g.driver_name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Received items */}
        <div className="border-b border-black">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-r border-black px-1.5 py-1 text-left w-8">#</th>
                <th className="border-r border-black px-1.5 py-1 text-left">Description</th>
                <th className="border-r border-black px-1.5 py-1 text-left w-20">Drawing No.</th>
                <th className="border-r border-black px-1.5 py-1 text-right w-14">PO Qty</th>
                <th className="border-r border-black px-1.5 py-1 text-right w-14">Received</th>
                <th className="border-r border-black px-1.5 py-1 text-right w-14">Accepted</th>
                <th className="border-r border-black px-1.5 py-1 text-right w-14">Rejected</th>
                <th className="px-1.5 py-1 text-left w-8">Unit</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.serial_number} className="border-t border-slate-200">
                  <td className="border-r border-black px-1.5 py-1 text-center">{item.serial_number}</td>
                  <td className="border-r border-black px-1.5 py-1">{item.description}</td>
                  <td className="border-r border-black px-1.5 py-1 font-mono">{item.drawing_number || "—"}</td>
                  <td className="border-r border-black px-1.5 py-1 text-right tabular-nums">{item.po_quantity}</td>
                  <td className="border-r border-black px-1.5 py-1 text-right tabular-nums">{item.receiving_now}</td>
                  <td className="border-r border-black px-1.5 py-1 text-right tabular-nums">{item.accepted_quantity}</td>
                  <td className="border-r border-black px-1.5 py-1 text-right tabular-nums">{item.rejected_quantity}</td>
                  <td className="px-1.5 py-1">{item.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* QC Inspection table */}
        <div className="border-b border-black">
          <div className="bg-slate-50 px-3 py-1 border-b border-black">
            <span className="text-[10px] font-bold uppercase tracking-wider">Quality / Inspection Details</span>
          </div>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-r border-black px-1.5 py-1 text-left w-8">Sl.</th>
                <th className="border-r border-black px-1.5 py-1 text-left">Characteristic</th>
                <th className="border-r border-black px-1.5 py-1 text-left w-24">Specification</th>
                <th className="border-r border-black px-1.5 py-1 text-right w-16">Qty Checked</th>
                <th className="border-r border-black px-1.5 py-1 text-center w-18">Result</th>
                <th className="border-r border-black px-1.5 py-1 text-left w-28">Measuring Instrument</th>
                <th className="px-1.5 py-1 text-left">NC Reason</th>
              </tr>
            </thead>
            <tbody>
              {paddedLines.map((line, idx) => (
                <tr key={idx} className="border-t border-slate-200">
                  <td className="border-r border-black px-1.5 py-1 text-center">{line ? line.sl_no : idx + 1}</td>
                  <td className="border-r border-black px-1.5 py-1">{line?.characteristic || ""}</td>
                  <td className="border-r border-black px-1.5 py-1">{line?.specification || ""}</td>
                  <td className="border-r border-black px-1.5 py-1 text-right tabular-nums">{line?.qty_checked ?? ""}</td>
                  <td className="border-r border-black px-1.5 py-1 text-center">
                    {line?.result === "pass" ? "Pass" : line?.result === "fail" ? "FAIL" : line?.result === "conditional" ? "Cond." : ""}
                  </td>
                  <td className="border-r border-black px-1.5 py-1">{line?.measuring_instrument || ""}</td>
                  <td className="px-1.5 py-1">{line?.non_conformance_reason || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary + Remarks */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className="p-3 border-r border-black space-y-1">
            <p className="font-bold text-[10px] uppercase mb-2">Inspection Summary</p>
            <div className="flex gap-2">
              <span className="w-32">Total Qty Checked</span>
              <span className="font-mono font-semibold">{checkedQty}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-32">Accepted (Pass)</span>
              <span className="font-mono font-semibold">{acceptedCount}</span>
            </div>
            <div className="flex gap-2">
              <span className="w-32">Not Accepted (Fail)</span>
              <span className="font-mono font-semibold">{failedCount}</span>
            </div>
          </div>
          <div className="p-3">
            <p className="font-bold text-[10px] uppercase mb-2">Remarks</p>
            <p className="text-[10px] leading-relaxed">{g.qc_remarks || ""}</p>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-3 text-center">
          {[
            { label: "Prepared By", value: g.qc_prepared_by },
            { label: "Inspected By", value: g.qc_inspected_by },
            { label: "Approved By", value: g.qc_approved_by },
          ].map((sig, i) => (
            <div key={i} className={`p-4 ${i < 2 ? "border-r border-black" : ""}`}>
              <div className="h-8 border-b border-slate-300 mb-1 flex items-end justify-center pb-0.5">
                {sig.value && <span className="text-[11px] font-medium">{sig.value}</span>}
              </div>
              <p className="text-[10px] text-slate-500">{sig.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
