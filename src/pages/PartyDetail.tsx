import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Edit, Phone, Mail, MapPin, Building2, FileText, StickyNote, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchParty } from "@/lib/parties-api";
import { getStateByName } from "@/lib/indian-states";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

const typeBadge: Record<string, string> = {
  vendor: "bg-blue-50 text-blue-700 border border-blue-200",
  customer: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  both: "bg-violet-50 text-violet-700 border border-violet-200",
};

export default function PartyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: party, isLoading } = useQuery({
    queryKey: ["party", id],
    queryFn: () => fetchParty(id!),
    enabled: Boolean(id),
  });

  const isVendor = party?.party_type === "vendor" || party?.party_type === "both";

  const { data: vendorDCs = [] } = useQuery({
    queryKey: ['vendor-dcs', id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('delivery_challans')
        .select(`
          id, dc_number, dc_date, dc_type, status, return_before_date,
          dc_line_items ( drawing_number, description, quantity, qty_accepted, qty_rejected, nature_of_job_work )
        `)
        .eq('party_id', id)
        .order('dc_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="paper-card space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-6 bg-muted animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-muted-foreground">Party not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/parties")}>
          Back to Parties
        </Button>
      </div>
    );
  }

  const stateInfo = party.state ? getStateByName(party.state) : null;
  const companyStateCode = "33"; // TN for now
  const isSameState = stateInfo?.code === companyStateCode;
  const address = [party.address_line1, party.address_line2, party.address_line3, party.city, party.state, party.pin_code]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/parties")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-display font-bold text-foreground">{party.name}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeBadge[party.party_type] || typeBadge.both}`}>
                {party.party_type === "both" ? "Both" : party.party_type === "vendor" ? "Vendor" : "Customer"}
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${party.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
                <span className="text-xs text-muted-foreground capitalize">{party.status}</span>
              </div>
            </div>
            {party.contact_person && (
              <p className="text-sm text-muted-foreground">{party.contact_person}</p>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`/parties/${id}/edit`)} className="active:scale-[0.98] transition-transform">
          <Edit className="h-4 w-4 mr-1" /> Edit
        </Button>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Contact */}
        <div className="paper-card space-y-3">
          <h3 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-3">Contact</h3>
          {party.phone1 && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{party.phone1}</span>
            </div>
          )}
          {party.phone2 && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{party.phone2}</span>
            </div>
          )}
          {party.email1 && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{party.email1}</span>
            </div>
          )}
          {party.email2 && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{party.email2}</span>
            </div>
          )}
          {!party.phone1 && !party.email1 && (
            <p className="text-sm text-muted-foreground">No contact info</p>
          )}
        </div>

        {/* Address */}
        <div className="paper-card space-y-3">
          <h3 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-3">Address</h3>
          {address ? (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <span>{address}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No address</p>
          )}
        </div>

        {/* GST & Tax */}
        <div className="paper-card space-y-3">
          <h3 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-3">GST & Tax</h3>
          {party.gstin && (
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-xs">{party.gstin}</span>
            </div>
          )}
          {party.pan && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs w-3.5 text-center font-bold">P</span>
              <span className="font-mono text-xs">{party.pan}</span>
            </div>
          )}
          {stateInfo && (
            <p className="text-xs text-muted-foreground">
              GST Type: <strong>{isSameState ? "CGST + SGST" : "IGST"}</strong>
              {isSameState ? " (Intra-state)" : " (Inter-state)"}
            </p>
          )}
          {!party.gstin && !party.pan && (
            <p className="text-sm text-muted-foreground">No tax info</p>
          )}
        </div>
      </div>

      {/* Business Terms */}
      {(party.payment_terms || party.credit_limit) && (
        <div className="paper-card">
          <h3 className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground mb-3">Business Terms</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {party.payment_terms && (
              <div>
                <span className="text-muted-foreground">Payment Terms:</span>
                <p className="font-medium">{party.payment_terms}</p>
              </div>
            )}
            {party.credit_limit && (
              <div>
                <span className="text-muted-foreground">Credit Limit:</span>
                <p className="font-mono font-medium">₹{Number(party.credit_limit).toLocaleString("en-IN")}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="documents">
        <TabsList>
          <TabsTrigger value="documents">
            <FileText className="h-3.5 w-3.5 mr-1.5" /> All Documents
          </TabsTrigger>
          {isVendor && (
            <TabsTrigger value="dc_history">
              <Truck className="h-3.5 w-3.5 mr-1.5" /> DC History
            </TabsTrigger>
          )}
          <TabsTrigger value="notes">
            <StickyNote className="h-3.5 w-3.5 mr-1.5" /> Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          <div className="paper-card text-center py-12">
            <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No documents linked yet</p>
            <p className="text-xs text-muted-foreground mt-1">Documents will appear here when you create invoices, DCs, or POs for this party.</p>
          </div>
        </TabsContent>

        {isVendor && (
          <TabsContent value="dc_history" className="mt-4 space-y-4">
            <div className="paper-card !p-0">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">DC History</h3>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">DC Number</th>
                      <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                      <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Type</th>
                      <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                      <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(vendorDCs as any[]).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">No data found</td>
                      </tr>
                    ) : (
                      (vendorDCs as any[]).map((dc: any) => (
                        <tr
                          key={dc.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => navigate(`/delivery-challans/${dc.id}`)}
                        >
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium text-blue-600">{dc.dc_number}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{dc.dc_date ? format(new Date(dc.dc_date), "dd MMM yyyy") : "—"}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{dc.dc_type}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">{dc.status}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{(dc.dc_line_items ?? []).length}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="notes" className="mt-4">
          <div className="paper-card">
            {party.notes ? (
              <p className="text-sm whitespace-pre-wrap">{party.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No internal notes</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
