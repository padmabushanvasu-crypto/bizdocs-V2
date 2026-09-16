import { Receipt } from "lucide-react";

export default function PaymentReceipts() {
  return (
    <div className="p-4 md:p-6">
      <div className="paper-card flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Receipt className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-display font-bold text-foreground">Payment Receipts</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          Coming soon — payment receipts are being rebuilt against the new Sales flow.
        </p>
      </div>
    </div>
  );
}
