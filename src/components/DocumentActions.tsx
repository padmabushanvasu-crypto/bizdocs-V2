import { Printer, Share2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchCompanySettings } from "@/lib/settings-api";
import { printWithLightMode } from "@/lib/print-utils";
import {
  formatDocumentText,
  formatWhatsAppMessage,
  formatEmailSubject,
} from "@/lib/email-service";

interface DocumentActionsProps {
  documentNumber: string;
  documentType: string;
  partyName?: string;
  partyEmail?: string;
  amount?: number;
  date?: string;
  companyName?: string;
  /** @deprecated Pass documentData instead for rich formatting */
  customMessage?: string;
  /** Full document object — enables rich WhatsApp/email/copy formatting */
  documentData?: Record<string, unknown>;
}

export function DocumentActions({
  documentNumber,
  documentType,
  partyName,
  partyEmail,
  amount,
  date,
  companyName: companyNameProp,
  customMessage,
  documentData,
}: DocumentActionsProps) {
  const { toast } = useToast();

  const { data: companySettings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 60_000,
  });

  const companyName = companyNameProp ?? companySettings?.company_name ?? undefined;

  const getRichText = (): string => {
    if (documentData) {
      return formatDocumentText(documentType, documentData, companyName);
    }
    if (customMessage) {
      return customMessage;
    }
    // Basic fallback for callers that don't yet pass documentData
    const lines: string[] = [];
    if (companyName) lines.push(`From: ${companyName}`);
    lines.push(`${documentType}: ${documentNumber}`);
    if (date) lines.push(`Date: ${date}`);
    if (partyName) lines.push(`To: ${partyName}`);
    if (amount != null) {
      lines.push(`Amount: ₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    }
    return lines.join("\n");
  };

  const handlePrint = () => {
    printWithLightMode();
  };

  const handleWhatsApp = () => {
    const message = documentData
      ? formatWhatsAppMessage(documentType, documentData, companyName) + `\n\nView: ${window.location.href}`
      : getRichText() + `\n\nView: ${window.location.href}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank");
  };

  const handleEmail = () => {
    const subject = documentData
      ? formatEmailSubject(documentType, documentData, companyName)
      : `${documentType} ${documentNumber}${partyName ? ` — ${partyName}` : ""}`;
    // Strip WhatsApp *bold* markers for plain-text email
    const msgBody = documentData
      ? formatWhatsAppMessage(documentType, documentData, companyName).replace(/\*/g, "")
      : getRichText();
    const to = partyEmail ? encodeURIComponent(partyEmail) : "";
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msgBody)}`;

    // Also copy to clipboard so user can paste into any client
    navigator.clipboard
      .writeText(msgBody)
      .then(() => toast({ title: "Email client opened. Document summary copied to clipboard." }))
      .catch(() => toast({ title: "Email client opened." }));
  };

  return (
    <div className="flex gap-1.5 print:hidden">
      <Button variant="outline" size="sm" onClick={handlePrint} title="Print">
        <Printer className="h-3.5 w-3.5 mr-1" /> Print
      </Button>
      <Button variant="outline" size="sm" onClick={handleWhatsApp} title="Share via WhatsApp">
        <Share2 className="h-3.5 w-3.5 mr-1" /> WhatsApp
      </Button>
      <Button variant="outline" size="sm" onClick={handleEmail} title="Send via email">
        <Mail className="h-3.5 w-3.5 mr-1" /> Email
      </Button>
    </div>
  );
}
