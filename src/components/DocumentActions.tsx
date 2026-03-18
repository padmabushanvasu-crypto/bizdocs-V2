import { Printer, Download, Share2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DocumentActionsProps {
  documentNumber: string;
  documentType: string;
}

export function DocumentActions({ documentNumber, documentType }: DocumentActionsProps) {
  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(
      `Here is your ${documentType}: ${documentNumber}. View it here: ${window.location.href}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`${documentType} - ${documentNumber}`);
    const body = encodeURIComponent(
      `Please find the ${documentType} ${documentNumber} at the following link:\n\n${window.location.href}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
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
