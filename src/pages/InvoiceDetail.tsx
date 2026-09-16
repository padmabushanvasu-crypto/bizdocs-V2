import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Edit, XCircle, CheckCircle2, Printer, Trash2, AlertTriangle, PackageSearch } from "lucide-react";
import { EditableSection } from "@/components/EditableSection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fetchInvoice, completeSale, cancelSale, softDeleteInvoice, fetchSaleShortfalls } from "@/lib/invoices-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { formatCurrency, formatNumber, amountInWords } from "@/lib/gst-utils";
import { format } from "date-fns";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { AuditTimeline } from "@/components/AuditTimeline";
import { DocumentSignature } from "@/components/DocumentSignature";

const statusLabels: Record<string, string> = {
  draft: "Draft", sale_complete: "Sale Complete", cancelled: "Cancelled", deleted: "Deleted",
};
const statusClass: Record<string, string> = {
  draft: "status-draft",
  sale_complete: "status-paid",
  cancelled: "status-cancelled",
  deleted: "bg-gray-100 text-gray-500 border border-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full line-through",
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelUnbuild, setCancelUnbuild] = useState(false);
  const [invCopyLabel, setInvCopyLabel] = useState("");
  const [invPrintDialogOpen, setInvPrintDialogOpen] = useState(false);
  const [invPrintCopies, setInvPrintCopies] = useState(3);
  const INV_COPY_LABELS = ["ORIGINAL FOR RECIPIENT", "DUPLICATE FOR TRANSPORTER", "TRIPLICATE FOR SUPPLIER"];
  const triggerInvPrint = (totalCopies: number, index = 0, darkWasActive = false) => {
    // On first call capture dark state and remove it; pass it through all recursive calls
    const isDark = index === 0
      ? document.documentElement.classList.contains("dark")
      : darkWasActive;
    if (index === 0 && isDark) document.documentElement.classList.remove("dark");

    if (index >= totalCopies) {
      setInvCopyLabel("");
      if (isDark) document.documentElement.classList.add("dark");
      return;
    }
    setInvCopyLabel(INV_COPY_LABELS[index]);
    setTimeout(() => {
      const handler = () => {
        window.removeEventListener("afterprint", handler);
        setTimeout(() => triggerInvPrint(totalCopies, index + 1, isDark), 50);
      };
      window.addEventListener("afterprint", handler);
      window.print();
    }, 100);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => fetchInvoice(id!),
    enabled: !!id,
  });

  const { data: company } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });

  const inv = data?.invoice;

  const { data: shortfalls } = useQuery({
    queryKey: ["sale-shortfalls", id],
    queryFn: () => fetchSaleShortfalls(id!),
    enabled: !!id && !!inv && inv.status !== "draft",
  });

  const completeMutation = useMutation({
    mutationFn: () => completeSale(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
      queryClient.invalidateQueries({ queryKey: ["sale-shortfalls", id] });
      setCompleteOpen(false);
      toast({ title: "Sale complete", description: `Invoice ${result.invoice_number} issued.` });
    },
    onError: (err: any) => {
      toast({ title: "Error completing sale", description: err.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelSale(id!, cancelReason, cancelUnbuild),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
      queryClient.invalidateQueries({ queryKey: ["sale-shortfalls", id] });
      setCancelOpen(false);
      toast({ title: "Sale cancelled" });
    },
    onError: (err: any) => {
      toast({ title: "Error cancelling sale", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => softDeleteInvoice(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Draft deleted" });
      navigate("/invoices");
    },
    onError: (err: any) => {
      toast({ title: "Error deleting draft", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !data || !inv) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const items = data.lineItems;
  const isDraft = inv.status === "draft";
  const isComplete = inv.status === "sale_complete";
  const isCancelled = inv.status === "cancelled";
  const hasCGST = (inv.cgst_amount ?? 0) > 0;
  const hasIGST = (inv.igst_amount ?? 0) > 0;

  // Auto-condensing: detect empty columns to hide in print
  const allDiscountsZero = items.every((li: any) => !li.discount_percent || li.discount_percent === 0);
  const showStockCol = !isDraft;

  // GST breakdown by rate
  const gstByRate: Record<number, { taxable: number; cgst: number; sgst: number; igst: number }> = {};
  items.forEach((li: any) => {
    const rate = li.gst_rate ?? 18;
    if (!gstByRate[rate]) gstByRate[rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    gstByRate[rate].taxable += li.taxable_amount ?? 0;
    gstByRate[rate].cgst += li.cgst ?? 0;
    gstByRate[rate].sgst += li.sgst ?? 0;
    gstByRate[rate].igst += li.igst ?? 0;
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <button
        onClick={() => navigate("/invoices")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3 print:hidden"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Sales
      </button>
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-display font-bold text-foreground font-mono">{inv.invoice_number || "DRAFT"}</h1>
            <span className={statusClass[inv.status] || "status-draft"}>{statusLabels[inv.status] || inv.status}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isDraft && (
            <>
              <Button variant="outline" size="sm" onClick={() => setInvPrintDialogOpen(true)}>
                <Printer className="h-3.5 w-3.5 mr-1" /> Print Options
              </Button>
              <DocumentActions
                documentNumber={inv.invoice_number || ""}
                documentType="Tax Invoice"
                documentData={{ ...inv, line_items: items } as Record<string, unknown>}
              />
            </>
          )}
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => navigate(`/invoices/${id}/edit`)}><Edit className="h-4 w-4 mr-1" /> Edit</Button>
              <Button onClick={() => setCompleteOpen(true)}><CheckCircle2 className="h-4 w-4 mr-1" /> Sale complete</Button>
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                <Trash2 className="h-4 w-4 mr-1" /> Delete
              </Button>
            </>
          )}
          {isComplete && (
            <Button variant="outline" onClick={() => setCancelOpen(true)}><XCircle className="h-4 w-4 mr-1" /> Cancel sale</Button>
          )}
        </div>
      </div>

      {/* Sale complete banner */}
      {isComplete && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-center gap-2 text-emerald-700 font-medium print:hidden">
          <CheckCircle2 className="h-5 w-5" /> SALE COMPLETE
        </div>
      )}

      {/* Cancellation banner */}
      {isCancelled && (
        <div className="bg-rose-50 border border-rose-200 rounded-md p-3 text-rose-700 print:hidden space-y-0.5">
          <div className="font-medium flex items-center gap-2"><XCircle className="h-5 w-5" /> SALE CANCELLED</div>
          {inv.cancellation_reason && <div className="text-sm">Reason: {inv.cancellation_reason}</div>}
          {inv.cancelled_at && <div className="text-xs text-rose-600">Cancelled on {format(new Date(inv.cancelled_at), "dd MMM yyyy, HH:mm")}</div>}
        </div>
      )}

      {/* Document preview */}
      <div className="paper-card space-y-4 po-print-wrapper relative">
        {/* Print-only cancellation watermark */}
        {isCancelled && (
          <div className="hidden print:flex absolute inset-0 items-center justify-center pointer-events-none z-10">
            <span style={{ fontSize: '72pt', fontWeight: 800, color: 'rgba(220,38,38,0.28)', transform: 'rotate(-30deg)', letterSpacing: '0.1em' }}>
              CANCELLED
            </span>
          </div>
        )}
        {/* ── SCREEN header ── */}
        <div className="print:hidden">
          <DocumentHeader />
          <div className="text-center font-bold text-lg uppercase tracking-wide text-foreground border-b border-border pb-3">TAX INVOICE</div>
        </div>

        {/* ── PRINT: compact 2-col header ── */}
        <div className="hidden print:block po-section" style={{ borderBottom: '0.5pt solid #CBD5E1', paddingBottom: '4mm' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 58%' }}>
              {company?.logo_url && (
                <img src={company.logo_url} alt="Logo" style={{ height: '32px', marginBottom: '3px', objectFit: 'contain' }} />
              )}
              <div style={{ fontWeight: '700', fontSize: '11pt', lineHeight: 1.2 }}>{company?.company_name}</div>
              <div style={{ fontSize: '8pt', color: '#475569', lineHeight: 1.4 }}>
                {[company?.address_line1, company?.address_line2, [company?.city, company?.state].filter(Boolean).join(', '), company?.pin_code ? `PIN ${company.pin_code}` : ''].filter(Boolean).join(', ')}
              </div>
              {company?.gstin && <div style={{ fontSize: '8pt', fontFamily: 'monospace' }}>GSTIN: {company.gstin}</div>}
              {company?.phone && <div style={{ fontSize: '8pt', color: '#475569' }}>Ph: {company.phone}</div>}
            </div>
            <div style={{ flex: '0 0 42%', textAlign: 'right' }}>
              <div style={{ fontWeight: '700', fontSize: '13pt', color: '#1E3A5F', letterSpacing: '0.04em' }}>TAX INVOICE</div>
              {invCopyLabel && <div style={{ fontSize: '8pt', fontWeight: '700', border: '1pt solid currentColor', display: 'inline-block', padding: '1px 6px', marginBottom: '2px' }}>{invCopyLabel}</div>}
              <div style={{ fontWeight: '700', fontSize: '9pt' }}>Invoice No: {inv.invoice_number || "DRAFT"}</div>
              <div style={{ fontSize: '9pt' }}>Date: {inv.invoice_date}</div>
              {inv.due_date && <div style={{ fontSize: '9pt' }}>Due: {inv.due_date}</div>}
              {inv.payment_terms && <div style={{ fontSize: '9pt' }}>Terms: {inv.payment_terms}</div>}
              {inv.place_of_supply && <div style={{ fontSize: '9pt' }}>Place of Supply: {inv.place_of_supply}</div>}
              {inv.customer_po_reference && <div style={{ fontSize: '9pt' }}>PO Ref: {inv.customer_po_reference}</div>}
            </div>
          </div>
        </div>

        <EditableSection
          editable={isDraft}
          onEdit={() => navigate(`/invoices/${id}/edit`)}
          label="Click to edit"
          className="p-4 -mx-4"
        >
          <div className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <div className="text-xs font-bold uppercase text-muted-foreground mb-1">Bill To</div>
              <div className="font-medium">{inv.customer_name}</div>
              {inv.customer_address && <div className="text-muted-foreground">{inv.customer_address}</div>}
              {inv.customer_gstin && <div>GSTIN: {inv.customer_gstin}</div>}
              {inv.customer_phone && <div>Phone: {inv.customer_phone}</div>}
            </div>
            <div className="text-right space-y-1">
              <div><span className="text-muted-foreground">Invoice No:</span> <span className="font-mono font-medium">{inv.invoice_number || "DRAFT"}</span></div>
              <div><span className="text-muted-foreground">Date:</span> {inv.invoice_date}</div>
              <div><span className="text-muted-foreground">Due Date:</span> {inv.due_date || "—"}</div>
              {inv.place_of_supply && <div><span className="text-muted-foreground">Place of Supply:</span> {inv.place_of_supply}</div>}
              {inv.customer_po_reference && <div><span className="text-muted-foreground">PO Ref:</span> {inv.customer_po_reference}</div>}
              {inv.payment_terms && <div><span className="text-muted-foreground">Terms:</span> {inv.payment_terms}</div>}
            </div>
          </div>
        </EditableSection>

        {/* Line items */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 po-section">
          <table className="w-full border-collapse text-sm po-line-items-table">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">#</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">HSN/SAC</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Rate</th>
                {/* Hide Disc% column in print when all zero */}
                <th className={`px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right${allDiscountsZero ? " print:hidden" : ""}`}>Disc%</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Taxable</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">GST%</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Amount</th>
                {showStockCol && (
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left print:hidden">Stock</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((li: any) => (
                <tr key={li.id}>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{li.serial_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">
                    {li.description}
                    {li.drawing_number && <div className="text-xs text-muted-foreground font-normal">Dwg: {li.drawing_number}</div>}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">{li.hsn_sac_code || "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatNumber(li.quantity ?? 0)}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{li.unit}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(li.unit_price)}</td>
                  <td className={`px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right${allDiscountsZero ? " print:hidden" : ""}`}>
                    {li.discount_percent > 0 ? `${li.discount_percent}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(li.taxable_amount)}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.gst_rate}%</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">{formatCurrency(li.line_total)}</td>
                  {showStockCol && (
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left print:hidden">
                      drained {formatNumber(li.drained_qty ?? 0)} / built {formatNumber(li.backflushed_qty ?? 0)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Backflush shortfalls */}
        {!isDraft && shortfalls && shortfalls.length > 0 && (
          <div className="print:hidden bg-amber-50 border border-amber-200 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 font-medium text-sm">
              <AlertTriangle className="h-4 w-4" /> Backflush shortfalls — count required
            </div>
            <ul className="space-y-1">
              {shortfalls.map((s) => (
                <li key={s.id} className="text-sm flex items-center justify-between gap-2">
                  <span>
                    <span className="font-mono font-medium">{s.item_code}</span> short {formatNumber(s.qty_short)} (position now {formatNumber(s.position_after)})
                  </span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 underline text-xs shrink-0"
                    onClick={() => navigate("/reorder-intelligence")}
                  >
                    <PackageSearch className="h-3.5 w-3.5" /> Reorder
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-full max-w-sm space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="font-mono tabular-nums">{formatCurrency(inv.sub_total)}</span></div>
            {(inv.total_discount ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-600"><span>Discount</span><span className="font-mono tabular-nums">-{formatCurrency(inv.total_discount)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Taxable Value</span><span className="font-mono tabular-nums">{formatCurrency(inv.taxable_value)}</span></div>
            <div className="border-t border-border my-2" />
            {Object.entries(gstByRate)
              .filter(([_, v]) => v.taxable > 0)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([rate, vals]) => (
                <div key={rate}>
                  {vals.cgst > 0 || (hasCGST && !hasIGST) ? (
                    <>
                      {vals.cgst > 0 && (
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">CGST @ {Number(rate) / 2}%</span><span className="font-mono">{formatCurrency(vals.cgst)}</span></div>
                      )}
                      {vals.sgst > 0 && (
                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">SGST @ {Number(rate) / 2}%</span><span className="font-mono">{formatCurrency(vals.sgst)}</span></div>
                      )}
                    </>
                  ) : vals.igst > 0 ? (
                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">IGST @ {rate}%</span><span className="font-mono">{formatCurrency(vals.igst)}</span></div>
                  ) : null}
                </div>
              ))}
            <div className="border-t border-border my-2" />
            {(inv.round_off ?? 0) !== 0 && (
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Round Off</span><span className="font-mono">{inv.round_off > 0 ? "+" : ""}{inv.round_off?.toFixed(2)}</span></div>
            )}
            <div className="flex justify-between text-lg font-bold"><span>Grand Total</span><span className="font-mono tabular-nums">{formatCurrency(inv.grand_total)}</span></div>
            <div className="text-xs text-muted-foreground italic">{amountInWords(inv.grand_total ?? 0)}</div>
          </div>
        </div>

        {/* Bank details */}
        {inv.bank_name && (
          <div className="border-t border-border pt-4 text-sm">
            <div className="text-xs font-bold uppercase text-muted-foreground mb-1">Bank Details for Payment</div>
            <div>Bank: {inv.bank_name}</div>
            {inv.bank_account_number && <div>A/C No: {inv.bank_account_number}</div>}
            {inv.bank_ifsc && <div>IFSC: {inv.bank_ifsc}</div>}
            {inv.bank_branch && <div>Branch: {inv.bank_branch}</div>}
          </div>
        )}

        {inv.terms_and_conditions && (
          <div className="border-t border-border pt-4 text-sm">
            <div className="text-xs font-bold uppercase text-muted-foreground mb-1">Terms & Conditions</div>
            <pre className="whitespace-pre-wrap text-muted-foreground font-sans text-xs">{inv.terms_and_conditions}</pre>
          </div>
        )}

        {/* Signature Block */}
        <div className="border-t border-border pt-4 po-footer">
          <div className="flex justify-end">
            <DocumentSignature label="Authorised Signatory" showCompanyName />
          </div>
        </div>
      </div>

      {/* Audit Trail */}
      <div className="print:hidden">
        <AuditTimeline documentId={id!} />
      </div>

      {/* Sale Complete Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sale complete</DialogTitle>
            <DialogDescription>This assigns the invoice number and posts stock; it cannot be edited afterwards.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-64 overflow-y-auto border border-border rounded-md divide-y divide-border">
            {items.map((li: any) => (
              <div key={li.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="font-medium">{li.description}</span>
                <span className="font-mono text-muted-foreground">{formatNumber(li.quantity)} {li.unit}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
              {completeMutation.isPending ? "Completing…" : "Confirm Sale complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Sale Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Sale</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reason for cancellation *</Label>
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Required" />
            </div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox checked={cancelUnbuild} onCheckedChange={(v) => setCancelUnbuild(v === true)} className="mt-0.5" />
              <span>Unbuild — reverse the component backflush too <span className="text-muted-foreground">(use only if the unit was never built)</span></span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep Sale</Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 3}
            >
              Cancel Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Options Dialog */}
      <Dialog open={invPrintDialogOpen} onOpenChange={setInvPrintDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Print Options</DialogTitle>
            <DialogDescription>Select number of copies to print.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-center py-2">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setInvPrintCopies(n)}
                className={`w-14 h-14 rounded-lg border-2 font-semibold text-sm transition-colors ${invPrintCopies === n ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 hover:border-slate-400'}`}
              >
                {n}<br /><span className="text-[10px] font-normal">{n === 1 ? 'copy' : 'copies'}</span>
              </button>
            ))}
          </div>
          <div className="text-xs text-center text-muted-foreground">
            {INV_COPY_LABELS.slice(0, invPrintCopies).join(" + ")}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvPrintDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { setInvPrintDialogOpen(false); triggerInvPrint(invPrintCopies); }}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
