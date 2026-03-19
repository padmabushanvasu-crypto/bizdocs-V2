import { Printer, Share2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentActionsProps {
  documentNumber: string;
  documentType: string;
  partyName?: string;
  partyEmail?: string;
  amount?: number;
  date?: string;
  companyName?: string;
}

export function DocumentActions({
  documentNumber,
  documentType,
  partyName,
  partyEmail,
  amount,
  date,
  companyName,
}: DocumentActionsProps) {
  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    const lines: string[] = [];
    if (companyName) lines.push(`From: ${companyName}`);
    lines.push(`${documentType}: ${documentNumber}`);
    if (date) lines.push(`Date: ${date}`);
    if (partyName) lines.push(`To: ${partyName}`);
    if (amount != null) lines.push(`Amount: ₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    lines.push(`\nView: ${window.location.href}`);
    const text = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`${documentType} ${documentNumber}${partyName ? ` — ${partyName}` : ""}`);
    const bodyLines: string[] = [];
    if (partyName) bodyLines.push(`Dear ${partyName},`);
    bodyLines.push(`\nPlease find ${documentType} ${documentNumber} details below.`);
    if (date) bodyLines.push(`Date: ${date}`);
    if (amount != null) bodyLines.push(`Amount: ₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    bodyLines.push(`\nLink: ${window.location.href}`);
    if (companyName) bodyLines.push(`\nRegards,\n${companyName}`);
    const body = encodeURIComponent(bodyLines.join("\n"));
    const to = partyEmail ? encodeURIComponent(partyEmail) : "";
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="flex gap-1.5 print:hidden">
      <Button variant="outline" size="sm" onClick={handlePrint} title="Print">
        <Printer className="h-3.5 w-3.5 mr-1" /> Print
      </Button>
      <Button variant="outline" size="sm" onClick={handleWhatsApp} title="Share via WhatsApp">
        <Share2 className="h-3.5 w-3.5 mr-1" /> WhatsApp
      </Button>
      <Button variant="outline" size="sm" onClick={handleEmail} title="Email">
        <Mail className="h-3.5 w-3.5 mr-1" /> Email
      </Button>
    </div>
  );
}
