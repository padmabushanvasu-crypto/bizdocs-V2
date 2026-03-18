import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Receipt, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchPayments } from "@/lib/invoices-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel, PAYMENT_EXPORT_COLS } from "@/lib/export-utils";

export default function PaymentReceipts() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["payment-receipts", search],
    queryFn: () => fetchPayments({ search }),
  });

  const receipts = data?.data ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Payment Receipts</h1>
          <p className="text-sm text-muted-foreground">All recorded payment receipts</p>
        </div>
        <Button variant="outline" onClick={() => exportToExcel(receipts, PAYMENT_EXPORT_COLS, `Payment_Receipts_${new Date().toISOString().split("T")[0]}.xlsx`, "Payment Receipts")} disabled={receipts.length === 0}>
          <Download className="h-4 w-4 mr-1" /> Export
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search receipts..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="text-right">Amount</th>
                <th>Mode</th>
                <th>Reference</th>
                <th>Invoice</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : receipts.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">No receipts found.</td></tr>
              ) : (
                receipts.map((r: any) => (
                  <tr key={r.id} className="hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => r.invoice_id && navigate(`/invoices/${r.invoice_id}`)}>
                    <td className="font-mono text-sm font-medium">{r.receipt_number}</td>
                    <td className="text-muted-foreground">{r.payment_date}</td>
                    <td className="font-medium">{r.customer_name}</td>
                    <td className="text-right font-mono tabular-nums font-semibold">{formatCurrency(r.amount)}</td>
                    <td className="capitalize">{r.payment_mode}</td>
                    <td className="text-muted-foreground">{r.reference_number || "—"}</td>
                    <td className="font-mono text-sm">{r.invoice_number || "—"}</td>
                    <td><span className="status-paid">Recorded</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
