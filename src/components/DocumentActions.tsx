import { Printer, Share2, Mail, Copy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { fetchCompanySettings } from "@/lib/settings-api";
import {
  formatDocumentText,
  formatWhatsAppMessage,
  formatEmailSubject,
  generateHTMLSummary,
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
    window.print();
  };

  // Same as Print but with a tooltip nudging users toward "Save as PDF" option
  const handleSavePDF = () => {
    window.print();
  };

  // Opens a standalone print-ready HTML summary in a new tab.
  // User can then Ctrl+P / Cmd+P → "Save as PDF" to download and attach.
  const handleDownloadSummary = () => {
    const html = documentData
      ? generateHTMLSummary(documentType, documentData, companyName)
      : `<!DOCTYPE html><html><body><pre style="font-family:monospace;padding:20px">${getRichText().replace(/</g, "&lt;")}</pre></body></html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const tab = window.open(url, "_blank");
    if (!tab) {
      // Popup blocked — fall back to direct download
      const a = document.createElement("a");
      a.href = url;
      a.download = `${documentNumber}.html`;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast({ title: "Opened in new tab", description: "Ctrl+P / Cmd+P → Save as PDF to download." });
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

  const handleCopy = () => {
    const richText = getRichText();
    navigator.clipboard
      .writeText(richText)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: "Paste into any email or WhatsApp message.",
        });
      })
      .catch(() => {
        toast({
          title: "Copy failed",
          description: "Please copy manually.",
          variant: "destructive",
        });
      });
  };

  return (
    <div className="flex gap-1.5 print:hidden">
      <Button variant="outline" size="sm" onClick={handlePrint} title="Print">
        <Printer className="h-3.5 w-3.5 mr-1" /> Print
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleSavePDF}
        title="Opens print dialog — choose 'Save as PDF' to download"
      >
        <FileDown className="h-3.5 w-3.5 mr-1" /> Save PDF
      </Button>
      <Button variant="outline" size="sm" onClick={handleWhatsApp} title="Share via WhatsApp">
        <Share2 className="h-3.5 w-3.5 mr-1" /> WhatsApp
      </Button>
      <Button variant="outline" size="sm" onClick={handleEmail} title="Send via email">
        <Mail className="h-3.5 w-3.5 mr-1" /> Email
      </Button>
      <Button variant="outline" size="sm" onClick={handleCopy} title="Copy document content to clipboard">
        <Copy className="h-3.5 w-3.5 mr-1" /> Copy
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownloadSummary}
        title="Open print-ready summary in new tab — save as PDF from there"
      >
        <FileDown className="h-3.5 w-3.5 mr-1" /> Summary
      </Button>
    </div>
  );
}
