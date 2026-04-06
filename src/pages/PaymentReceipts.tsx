import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Receipt, Search, Download, Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fetchPayments,
  fetchUnpaidInvoices,
  createReceipt,
  getNextReceiptNumber,
} from "@/lib/invoices-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel, PAYMENT_EXPORT_COLS } from "@/lib/export-utils";
import { useToast } from "@/hooks/use-toast";

const PAYMENT_MODES = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "cheque", label: "Cheque" },
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
];

function today() {
  return new Date().toISOString().split("T")[0];
}

export default function PaymentReceipts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // Form state
  const [receiptNumber, setReceiptNumber] = useState("");
  const [receiptDate, setReceiptDate] = useState(today());
  const [selectedInvoice, setSelectedInvoice] = useState<null | {
    id: string;
    invoice_number: string;
    customer_name: string;
    grand_total: number;
    amount_outstanding: number;
  }>(null);
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");

  // List query
  const { data, isLoading } = useQuery({
    queryKey: ["payment-receipts", search],
    queryFn: () => fetchPayments({ search }),
  });
  const receipts = data?.data ?? [];

  // Unpaid invoices for the search dropdown
  const { data: unpaidInvoices = [] } = useQuery({
    queryKey: ["unpaid-invoices-for-receipt"],
    queryFn: fetchUnpaidInvoices,
    enabled: dialogOpen,
  });

  // Open dialog: pre-fetch next receipt number
  const openDialog = async () => {
    try {
      const num = await getNextReceiptNumber();
      setReceiptNumber(num);
    } catch {
      setReceiptNumber("");
    }
    setReceiptDate(today());
    setSelectedInvoice(null);
    setAmount("");
    setPaymentMode("bank_transfer");
    setReference("");
    setBankName("");
    setNotes("");
    setDialogOpen(true);
  };

  const handleInvoiceSelect = (inv: typeof unpaidInvoices[0]) => {
    setSelectedInvoice(inv);
    setAmount(String(inv.amount_outstanding));
    setInvoiceOpen(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoice) throw new Error("Select an invoice");
      const amtNum = parseFloat(amount);
      if (!amtNum || amtNum <= 0) throw new Error("Enter a valid amount");
      if (amtNum > selectedInvoice.amount_outstanding + 0.01) {
        throw new Error(`Amount exceeds outstanding balance of ${formatCurrency(selectedInvoice.amount_outstanding)}`);
      }
      await createReceipt({
        receipt_number: receiptNumber,
        receipt_date: receiptDate,
        invoice_id: selectedInvoice.id,
        invoice_number: selectedInvoice.invoice_number,
        customer_name: selectedInvoice.customer_name,
        amount: amtNum,
        payment_mode: paymentMode,
        reference_number: reference || undefined,
        bank_name: bankName || undefined,
        notes: notes || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
      queryClient.invalidateQueries({ queryKey: ["unpaid-invoices-for-receipt"] });
      toast({ title: "Receipt recorded", description: `${receiptNumber} saved successfully.` });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Receipts</h1>
          <p className="text-sm text-slate-500 mt-1">All recorded payment receipts</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            onClick={() => exportToExcel(receipts, PAYMENT_EXPORT_COLS, `Payment_Receipts_${new Date().toISOString().split("T")[0]}.xlsx`, "Payment Receipts")}
            disabled={receipts.length === 0}
          >
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button onClick={openDialog}>
            <Plus className="h-4 w-4 mr-1" /> New Receipt
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search receipts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Receipt #</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Customer</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Amount</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Mode</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Reference / UTR</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">Loading...</td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">No receipts found.</td></tr>
              ) : (
                receipts.map((r: any) => (
                  <tr
                    key={r.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => r.invoice_id && navigate(`/invoices/${r.invoice_id}`)}
                  >
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{r.receipt_number}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">{r.payment_date}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-medium">{r.customer_name}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-semibold">{formatCurrency(r.amount)}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left capitalize">{(r.payment_mode ?? "").replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-muted-foreground">{r.reference_number || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-blue-600">{r.invoice_number || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Receipt Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Payment Receipt</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Receipt number + date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">Receipt Number</Label>
                <Input
                  value={receiptNumber}
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  className="mt-1 font-mono"
                  placeholder="RCP-25-26/001"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Receipt Date</Label>
                <Input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Invoice search */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Invoice *</Label>
              <Popover open={invoiceOpen} onOpenChange={setInvoiceOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between mt-1 font-normal">
                    {selectedInvoice
                      ? `${selectedInvoice.invoice_number} — ${selectedInvoice.customer_name}`
                      : "Search unpaid invoices..."}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by invoice number or customer..." />
                    <CommandList>
                      <CommandEmpty>No unpaid invoices found.</CommandEmpty>
                      <CommandGroup>
                        {unpaidInvoices.map((inv) => (
                          <CommandItem
                            key={inv.id}
                            value={`${inv.invoice_number} ${inv.customer_name}`}
                            onSelect={() => handleInvoiceSelect(inv)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-mono text-sm font-medium text-blue-600">{inv.invoice_number}</p>
                              <p className="text-xs text-muted-foreground truncate">{inv.customer_name}</p>
                            </div>
                            <span className="ml-3 text-sm font-semibold text-slate-700 shrink-0">
                              {formatCurrency(inv.amount_outstanding)} due
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Outstanding balance info */}
            {selectedInvoice && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm flex justify-between items-center">
                <span className="text-blue-700">Invoice Total</span>
                <span className="font-mono font-semibold text-blue-900">{formatCurrency(selectedInvoice.grand_total)}</span>
                <span className="text-blue-700">Outstanding</span>
                <span className="font-mono font-bold text-blue-900">{formatCurrency(selectedInvoice.amount_outstanding)}</span>
              </div>
            )}

            {/* Amount */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Amount Received (₹) *</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 font-mono text-right"
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>

            {/* Payment mode */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reference / UTR + Bank */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">UTR / Reference No.</Label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="mt-1"
                  placeholder="Optional"
                />
              </div>
              <div>
                <Label className="text-sm font-medium text-slate-700">Bank Name</Label>
                <Input
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="mt-1"
                  placeholder="Optional"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-sm font-medium text-slate-700">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1"
                rows={2}
                placeholder="Optional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Record Receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
