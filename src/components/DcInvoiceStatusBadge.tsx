import type { DcInvoiceStatus } from "@/lib/processor-invoices-api";

const STYLES: Record<DcInvoiceStatus, string> = {
  "Invoice pending": "bg-amber-50 text-amber-700 border-amber-200",
  "Invoice partly received": "bg-blue-50 text-blue-700 border-blue-200",
  "Invoice received": "bg-green-50 text-green-700 border-green-200",
};

/** Processor invoice status chip for a DC. Renders nothing when status is undefined. */
export function DcInvoiceStatusBadge({ status }: { status?: DcInvoiceStatus | null }) {
  if (!status) return null;
  return (
    <span
      className={`inline-block whitespace-nowrap border text-[10px] font-medium px-2 py-0.5 rounded-full print:hidden ${
        STYLES[status] ?? "bg-slate-50 text-slate-600 border-slate-200"
      }`}
    >
      {status}
    </span>
  );
}
