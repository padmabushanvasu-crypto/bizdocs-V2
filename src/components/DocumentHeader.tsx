import { useQuery } from "@tanstack/react-query";
import { fetchCompanySettings } from "@/lib/settings-api";
import { supabase } from "@/integrations/supabase/client";

export function DocumentHeader() {
  const { data: company } = useQuery({
    queryKey: ["company-settings"],
    queryFn: fetchCompanySettings,
    staleTime: 5 * 60 * 1000,
  });

  if (!company) return null;

  const logoUrl = company.logo_url
    ? supabase.storage.from("company-assets").getPublicUrl(company.logo_url).data.publicUrl
    : null;

  const addressParts = [
    company.address_line1,
    company.address_line2,
    [company.city, company.state].filter(Boolean).join(", "),
    company.pin_code ? `PIN: ${company.pin_code}` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-4 border-b border-border pb-4 mb-4">
      {logoUrl && (
        <img
          src={logoUrl}
          alt="Company Logo"
          className="h-16 w-16 object-contain rounded print:h-14 print:w-14"
        />
      )}
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-display font-bold text-foreground">
          {company.company_name || "—"}
        </h2>
        {addressParts.map((line, i) => (
          <p key={i} className="text-sm text-muted-foreground leading-tight">{line}</p>
        ))}
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
          {company.gstin && <span className="font-mono">GSTIN: {company.gstin}</span>}
          {company.phone && <span>Ph: {company.phone}</span>}
          {company.email && <span>{company.email}</span>}
          {company.website && <span>{company.website}</span>}
        </div>
      </div>
    </div>
  );
}
