import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Edit, Phone, Mail, MapPin, Building2, FileText, StickyNote, Star, AlertTriangle, CheckCircle, Eye, Clock, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchParty } from "@/lib/parties-api";
import { getStateByName } from "@/lib/indian-states";
import { fetchVendorScorecard, fetchVendorJobWorkSteps } from "@/lib/job-works-api";
import { formatCurrency } from "@/lib/gst-utils";
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

  const { data: scorecard } = useQuery({
    queryKey: ["vendor-scorecard", id],
    queryFn: () => fetchVendorScorecard(id!),
    enabled: Boolean(id) && isVendor,
  });

  const { data: vendorSteps = [] } = useQuery({
    queryKey: ["vendor-job-work-steps", id],
    queryFn: () => fetchVendorJobWorkSteps(id!),
    enabled: Boolean(id) && isVendor,
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
            <TabsTrigger value="job_work">
              <Star className="h-3.5 w-3.5 mr-1.5" /> Job Work Performance
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
          <TabsContent value="job_work" className="mt-4 space-y-4">
            {/* Scorecard stat grid */}
            {scorecard ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="paper-card !p-4">
                  <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">Total Steps</p>
                  <p className="text-2xl font-bold font-mono mt-1">{Number(scorecard.total_steps)}</p>
                </div>
                <div className="paper-card !p-4">
                  <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">Rejection Rate</p>
                  <p className={`text-2xl font-bold font-mono mt-1 ${Number(scorecard.rejection_rate_pct) > 5 ? "text-red-600" : Number(scorecard.rejection_rate_pct) > 3 ? "text-amber-600" : "text-green-600"}`}>
                    {Number(scorecard.rejection_rate_pct).toFixed(1)}%
                  </p>
                </div>
                <div className="paper-card !p-4">
                  <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">On-Time Rate</p>
                  <p className={`text-2xl font-bold font-mono mt-1 ${scorecard.on_time_rate_pct == null ? "text-muted-foreground" : Number(scorecard.on_time_rate_pct) >= 85 ? "text-green-600" : Number(scorecard.on_time_rate_pct) >= 70 ? "text-amber-600" : "text-red-600"}`}>
                    {scorecard.on_time_rate_pct != null ? `${Number(scorecard.on_time_rate_pct).toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div className="paper-card !p-4">
                  <p className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">Rating</p>
                  <div className="mt-2">
                    {scorecard.performance_rating === "reliable" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                        <CheckCircle className="h-3 w-3" /> Reliable
                      </span>
                    )}
                    {scorecard.performance_rating === "watch" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                        <Eye className="h-3 w-3" /> Watch
                      </span>
                    )}
                    {scorecard.performance_rating === "review" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                        <AlertTriangle className="h-3 w-3" /> Review
                      </span>
                    )}
                    {scorecard.performance_rating === "new" && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        New
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="paper-card text-center py-8">
                <Star className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No job work data yet</p>
              </div>
            )}

            {/* Steps table */}
            <div className="paper-card !p-0">
              <div className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Job Work Step History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full data-table">
                  <thead>
                    <tr>
                      <th>JC Number</th>
                      <th>Component</th>
                      <th>Step</th>
                      <th className="text-right">Qty Sent</th>
                      <th className="text-right">Accepted</th>
                      <th className="text-right">Rejected</th>
                      <th className="text-right">Charges</th>
                      <th>Status</th>
                      <th className="text-right">Expected Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorSteps.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                          No job work steps recorded for this vendor.
                        </td>
                      </tr>
                    ) : (
                      vendorSteps.map((step) => (
                        <tr
                          key={step.id}
                          className={`cursor-pointer hover:bg-muted/30 transition-colors ${
                            step.status !== "done" && step.expected_return_date && step.expected_return_date < new Date().toISOString().slice(0, 10)
                              ? "bg-red-50/50"
                              : ""
                          }`}
                          onClick={() => navigate(`/job-works/${step.job_card_id}`)}
                        >
                          <td className="font-mono text-xs font-medium text-blue-600">{step.jc_number}</td>
                          <td>
                            <p className="text-sm font-medium truncate max-w-[140px]">
                              {step.item_description ?? step.item_code ?? "—"}
                            </p>
                          </td>
                          <td className="text-sm">{step.name}</td>
                          <td className="text-right font-mono tabular-nums text-sm">{step.qty_sent ?? "—"}</td>
                          <td className="text-right font-mono tabular-nums text-sm text-green-700">{step.qty_accepted ?? "—"}</td>
                          <td className="text-right font-mono tabular-nums text-sm text-red-600">{step.qty_rejected ?? "—"}</td>
                          <td className="text-right font-mono tabular-nums text-sm">{formatCurrency(step.job_work_charges)}</td>
                          <td>
                            {step.status === "done" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                <CheckCircle className="h-3 w-3" /> Done
                              </span>
                            ) : step.status === "in_progress" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                <Truck className="h-3 w-3" /> At Vendor
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                <Clock className="h-3 w-3" /> Pending
                              </span>
                            )}
                          </td>
                          <td className="text-right text-sm text-muted-foreground">
                            {step.expected_return_date
                              ? format(new Date(step.expected_return_date), "dd MMM yyyy")
                              : "—"}
                          </td>
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
