import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { printWithLightMode } from "@/lib/print-utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Download, Edit, XCircle, IndianRupee, CheckCircle2, Truck, Printer } from "lucide-react";
import { EditableSection } from "@/components/EditableSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { fetchInvoice, fetchInvoicePayments, cancelInvoice, recordPayment, getNextReceiptNumber } from "@/lib/invoices-api";
import { fetchCompanySettings } from "@/lib/settings-api";
import { formatCurrency, amountInWords } from "@/lib/gst-utils";
import { format } from "date-fns";
import { DocumentHeader } from "@/components/DocumentHeader";
import { DocumentActions } from "@/components/DocumentActions";
import { AuditTimeline } from "@/components/AuditTimeline";
import { DocumentSignature } from "@/components/DocumentSignature";

const statusLabels: Record<string, string> = {
  draft: "Draft", sent: "Sent", partially_paid: "Partially Paid", fully_paid: "Fully Paid", cancelled: "Cancelled",
};
const statusClass: Record<string, string> = {
  draft: "status-draft",
  sent: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  partially_paid: "status-overdue",
  fully_paid: "status-paid",
  cancelled: "status-cancelled",
};

const PAYMENT_MODES = ["Cash", "Cheque", "NEFT", "RTGS", "UPI", "Other"];

export default function InvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
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

  // Payment form state
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [payMode, setPayMode] = useState("NEFT");
  const [payRef, setPayRef] = useState("");
  const [payBank, setPayBank] = useState("");
  const [payReceivedBy, setPayReceivedBy] = useState("");
  const [payNotes, setPayNotes] = useState("");

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

  const { data: payments } = useQuery({
    queryKey: ["invoice-payments", id],
    queryFn: () => fetchInvoicePayments(id!),
    enabled: !!id,
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelInvoice(id!, cancelReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      setCancelOpen(false);
      toast({ title: "Invoice cancelled" });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async () => {
      const receiptNum = await getNextReceiptNumber();
      return recordPayment({
        receipt_number: receiptNum,
        payment_date: payDate,
        invoice_id: id,
        invoice_number: inv?.invoice_number,
        customer_id: inv?.customer_id,
        customer_name: inv?.customer_name,
        amount: payAmount,
        payment_mode: payMode.toLowerCase(),
        reference_number: payRef || null,
        bank_name: payBank || null,
        received_by: payReceivedBy || null,
        notes: payNotes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoice-payments", id] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
      setPaymentOpen(false);
      toast({ title: "Payment recorded", description: `Invoice updated to ${(inv?.amount_outstanding ?? 0) - payAmount <= 0 ? "Fully Paid" : "Partially Paid"}` });
    },
    onError: (err: any) => {
      toast({ title: "Error recording payment", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || !data) return <div className="p-6 text-muted-foreground">Loading...</div>;

  const inv = data.invoice;
  const items = data.lineItems;
  // Determine tax type from the saved amounts — never hardcode state codes
  const hasCGST = (inv.cgst_amount ?? 0) > 0;
  const hasIGST = (inv.igst_amount ?? 0) > 0;
  const outstanding = inv.amount_outstanding ?? 0;
  const isFullyPaid = inv.status === "fully_paid";
  const isCancelled = inv.status === "cancelled";

  const openPayment = () => {
    setPayAmount(outstanding);
    setPayDate(format(new Date(), "yyyy-MM-dd"));
    setPayRef("");
    setPayBank("");
    setPayReceivedBy("");
    setPayNotes("");
    setPaymentOpen(true);
  };

  // Auto-condensing: detect empty columns to hide in print
  const allDiscountsZero = items.every((li: any) => !li.discount_percent || li.discount_percent === 0);

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
        Back to Invoices
      </button>
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-display font-bold text-foreground font-mono">{inv.invoice_number}</h1>
            <span className={statusClass[inv.status] || "status-draft"}>{statusLabels[inv.status] || inv.status}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setInvPrintDialogOpen(true)}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print Options
          </Button>
          <DocumentActions
            documentNumber={inv.invoice_number}
            documentType="Tax Invoice"
            documentData={{ ...inv, line_items: items } as Record<string, unknown>}
          />
          {!isFullyPaid && !isCancelled && (
            <Button onClick={openPayment}><IndianRupee className="h-4 w-4 mr-1" /> Record Payment</Button>
          )}
          {inv.status === "draft" && (
            <Button variant="outline" onClick={() => navigate(`/invoices/${id}/edit`)}><Edit className="h-4 w-4 mr-1" /> Edit</Button>
          )}
          {!isCancelled && (
            <Button
              variant="outline"
              onClick={() => navigate(`/dispatch-notes/new?invoice_id=${id}`)}
            >
              <Truck className="h-4 w-4 mr-1" /> Create Dispatch Note
            </Button>
          )}
          {!isCancelled && !isFullyPaid && (
            <Button variant="outline" onClick={() => setCancelOpen(true)}><XCircle className="h-4 w-4 mr-1" /> Cancel</Button>
          )}
        </div>
      </div>

      {/* Fully paid banner */}
      {isFullyPaid && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 flex items-center gap-2 text-emerald-700 font-medium print:hidden">
          <CheckCircle2 className="h-5 w-5" /> PAID IN FULL
        </div>
      )}

      {/* Outstanding banner */}
      {outstanding > 0 && !isCancelled && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-amber-700 font-medium print:hidden">
          Outstanding: {formatCurrency(outstanding)}
        </div>
      )}

      {/* Document preview */}
      <div className="paper-card space-y-4 po-print-wrapper">
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
              <div style={{ fontWeight: '700', fontSize: '9pt' }}>Invoice No: {inv.invoice_number}</div>
              <div style={{ fontSize: '9pt' }}>Date: {inv.invoice_date}</div>
              {inv.due_date && <div style={{ fontSize: '9pt' }}>Due: {inv.due_date}</div>}
              {inv.payment_terms && <div style={{ fontSize: '9pt' }}>Terms: {inv.payment_terms}</div>}
              {inv.place_of_supply && <div style={{ fontSize: '9pt' }}>Place of Supply: {inv.place_of_supply}</div>}
              {inv.customer_po_reference && <div style={{ fontSize: '9pt' }}>PO Ref: {inv.customer_po_reference}</div>}
            </div>
          </div>
        </div>

        <EditableSection
          editable={inv.status === "draft"}
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
              <div><span className="text-muted-foreground">Invoice No:</span> <span className="font-mono font-medium">{inv.invoice_number}</span></div>
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
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '4%' }}>#</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: allDiscountsZero ? '28%' : '24%' }}>Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '8%' }}>HSN/SAC</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '6%' }}>Qty</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left" style={{ width: '5%' }}>Unit</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '12%' }}>Rate</th>
                {/* Hide Disc% column in print when all zero */}
                <th className={`px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right${allDiscountsZero ? " print:hidden" : ""}`} style={{ width: allDiscountsZero ? undefined : '7%' }}>Disc%</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: allDiscountsZero ? '14%' : '12%' }}>Taxable</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: '6%' }}>GST%</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right" style={{ width: allDiscountsZero ? '17%' : '14%' }}>Amount</th>
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
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.quantity}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{li.unit}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(li.unit_price)}</td>
                  <td className={`px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right${allDiscountsZero ? " print:hidden" : ""}`}>
                    {li.discount_percent > 0 ? `${li.discount_percent}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{formatCurrency(li.taxable_amount)}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{li.gst_rate}%</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">{formatCurrency(li.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
            <div className="text-xs text-muted-foreground italic">{amountInWords(inv.grand_total)}</div>
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

      {/* Payment History */}
      <div className="paper-card space-y-4 print:hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-foreground">Payment History</h2>
          {!isFullyPaid && !isCancelled && (
            <Button size="sm" onClick={openPayment}><IndianRupee className="h-4 w-4 mr-1" /> Record Payment</Button>
          )}
        </div>
        {(!payments || payments.length === 0) ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Receipt #</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Mode</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Reference</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Amount</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{p.receipt_number}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{p.payment_date}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left capitalize">{p.payment_mode}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">{p.reference_number || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">{formatCurrency(p.amount)}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">{p.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Trail */}
      <div className="print:hidden">
        <AuditTimeline documentId={id!} />
      </div>

      {/* Payment Modal */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Against Invoice {inv.invoice_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Amount Received *</Label>
              <Input type="number" value={payAmount || ""} onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">
                Outstanding: {formatCurrency(outstanding)} → After payment: {formatCurrency(Math.max(0, outstanding - payAmount))}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Date *</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Mode *</Label>
              <Select value={payMode} onValueChange={setPayMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference (UTR / Cheque No.)</Label>
              <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} />
            </div>
            {["Cheque", "NEFT", "RTGS"].includes(payMode) && (
              <div className="space-y-1.5">
                <Label>Bank Name</Label>
                <Input value={payBank} onChange={(e) => setPayBank(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Received By</Label>
              <Input value={payReceivedBy} onChange={(e) => setPayReceivedBy(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>Cancel</Button>
            <Button onClick={() => paymentMutation.mutate()} disabled={paymentMutation.isPending || payAmount <= 0}>
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Invoice</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Reason for cancellation</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Keep Invoice</Button>
            <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>Cancel Invoice</Button>
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
