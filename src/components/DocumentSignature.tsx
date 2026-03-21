import { useQuery } from "@tanstack/react-query";
import { fetchCompanySettings } from "@/lib/settings-api";

interface DocumentSignatureProps {
  /** Override URL; if provided, takes precedence over company default */
  overrideUrl?: string | null;
  label?: string;
  showCompanyName?: boolean;
}

export function DocumentSignature({ overrideUrl, label = "Authorised Signatory", showCompanyName }: DocumentSignatureProps) {
  const { data: settings } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 60_000,
  });

  const signatureUrl = overrideUrl ?? settings?.signature_url ?? null;

  return (
    <div className="text-center">
      <div className="min-h-[60px] flex items-end justify-center mb-1">
        {signatureUrl ? (
          <img
            src={signatureUrl}
            alt="Signature"
            className="h-14 max-w-[180px] object-contain print:h-12"
          />
        ) : (
          <p className="text-sm font-medium mt-6">__________________</p>
        )}
      </div>
      <div className="border-t border-border pt-1">
        {showCompanyName && settings?.company_name && (
          <p className="text-xs text-muted-foreground">for {settings.company_name}</p>
        )}
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
      </div>
    </div>
  );
}
