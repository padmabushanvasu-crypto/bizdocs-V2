import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, CheckCircle, Eye, AlertTriangle } from "lucide-react";
import { fetchVendorScorecards, fetchVendorDCHistory, fetchVendorGRNHistory } from "@/lib/parties-api";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";

function RatingBadge({ rating }: { rating: string }) {
  if (rating === "reliable") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-200">
      <CheckCircle className="h-3.5 w-3.5" /> Reliable
    </span>
  );
  if (rating === "watch") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 border border-amber-200">
      <Eye className="h-3.5 w-3.5" /> Watch
    </span>
  );
  if (rating === "review") return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-200">
      <AlertTriangle className="h-3.5 w-3.5" /> Review
    </span>
  );
  return <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-slate-100 text-slate-600 border border-slate-200">New</span>;
}

function pct(val: number | null) {
  if (val === null) return "—";
  return `${Number(val).toFixed(1)}%`;
}

const DC_ACTION_LABELS: Record<string, string> = {
  rework_same_vendor: "Returned for rework",
  rework_different_vendor: "Sent to other vendor",
  next_stage: "Advanced to next stage",
  scrap: "Scrapped",
  hold: "Held for inspection",
};

const GRN_ACTION_LABELS: Record<string, string> = {
  return_to_supplier: "Returned to Vendor",
  replacement_requested: "Replacement Requested",
  scrap: "Scrapped",
  hold: "Hold for Inspection",
};

export default function VendorScorecardDetail() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const navigate = useNavigate();

  const { data: scorecards = [] } = useQuery({
    queryKey: ["vendor-scorecards"],
    queryFn: () => fetchVendorScorecards(),
    staleTime: 60000,
  });
  const vendor = scorecards.find((s) => s.vendor_id === vendorId);

  const { data: dcHistory = [], isLoading: dcLoading } = useQuery({
    queryKey: ["vendor-dc-history", vendorId],
    queryFn: () => fetchVendorDCHistory(vendorId!),
    enabled: !!vendorId,
  });

  const { data: grnHistory = [], isLoading: grnLoading } = useQuery({
    queryKey: ["vendor-grn-history", vendorId],
    queryFn: () => fetchVendorGRNHistory(vendorId!),
    enabled: !!vendorId,
  });

  if (!vendor && scorecards.length > 0) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={() => navigate("/vendor-scorecards")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ChevronLeft className="h-4 w-4" /> Back to Scorecards
        </button>
        <p className="text-muted-foreground">Vendor not found.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      <button onClick={() => navigate("/vendor-scorecards")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ChevronLeft className="h-4 w-4" /> Back to Scorecards
      </button>

      {/* Header */}
      {vendor && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{vendor.vendor_name}</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {[vendor.city, vendor.gstin].filter(Boolean).join(" · ")}
              </p>
            </div>
            <RatingBadge rating={vendor.performance_rating} />
          </div>

          {/* Summary metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "GRN Non-Conformance Rate", value: pct(vendor.grn_rejection_rate_pct), bad: (vendor.grn_rejection_rate_pct ?? 0) > 5 },
              { label: "DC First Pass Yield", value: pct(vendor.first_pass_yield_pct), bad: (vendor.first_pass_yield_pct ?? 100) < 80 },
              { label: "Rework Rate", value: pct(vendor.rework_rate_pct), bad: (vendor.rework_rate_pct ?? 0) > 10 },
              { label: "Replacement Rate", value: pct(vendor.replacement_rate_pct), bad: (vendor.replacement_rate_pct ?? 0) > 5 },
            ].map((m) => (
              <div key={m.label} className="paper-card">
                <p className="text-xs text-slate-500 font-medium">{m.label}</p>
                <p className={`text-xl font-bold font-mono mt-1 ${m.bad ? "text-red-600" : "text-slate-800"}`}>{m.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tabs */}
      <Tabs defaultValue="dc">
        <TabsList>
          <TabsTrigger value="dc">DC Quality ({dcHistory.length} DCs)</TabsTrigger>
          <TabsTrigger value="grn">GRN Quality ({grnHistory.length} GRNs)</TabsTrigger>
        </TabsList>

        {/* Tab 1: DC Quality */}
        <TabsContent value="dc" className="mt-4 space-y-4">
          {dcLoading ? (
            <p className="text-muted-foreground text-sm">Loading DC history…</p>
          ) : dcHistory.length === 0 ? (
            <div className="paper-card text-center py-10 text-muted-foreground">No DC job work history found for this vendor.</div>
          ) : (
            dcHistory.map((dc: any) => {
              const items: any[] = dc.dc_line_items ?? [];
              const totalSent = items.reduce((s: number, i: any) => s + (i.quantity ?? i.qty_nos ?? 0), 0);
              const totalAccepted = items.reduce((s: number, i: any) => s + (i.qty_accepted ?? 0), 0);
              const totalRejected = items.reduce((s: number, i: any) => s + (i.qty_rejected ?? 0), 0);
              const acceptancePct = totalSent > 0 ? Math.round((totalAccepted / totalSent) * 100) : null;
              const reworkItems = items.filter((i: any) => i.is_rework);
              return (
                <div key={dc.id} className="paper-card space-y-3">
                  {/* DC header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-blue-700">{dc.dc_number}</span>
                      <span className="text-sm text-slate-500">{dc.dc_date ? format(new Date(dc.dc_date), "dd MMM yyyy") : "—"}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{dc.dc_type?.replace(/_/g, " ")}</span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {totalSent > 0 && (
                        <span>
                          {totalSent} sent → <span className="text-green-700 font-medium">{totalAccepted} accepted</span>, <span className="text-red-600 font-medium">{totalRejected} rejected</span>
                          {acceptancePct !== null && <span className="ml-1 text-slate-400">({acceptancePct}% acceptance)</span>}
                        </span>
                      )}
                    </div>
                  </div>
                  {reworkItems.length > 0 && (
                    <p className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded px-2 py-1">
                      ↳ Rework: {reworkItems.reduce((s: number, i: any) => s + (i.quantity ?? 0), 0)} units returned for rework
                    </p>
                  )}
                  {/* Line items */}
                  {items.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No.</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty Sent</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Accepted</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Rejected</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Rejection Reason</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Action Taken</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Stage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item: any) => (
                            <tr key={item.id} className={`${item.is_rework ? "bg-orange-50/50" : ""}`}>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-blue-700">{item.drawing_number || "—"}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{item.description}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{item.quantity ?? item.qty_nos ?? 0}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono text-green-700">{item.qty_accepted ?? "—"}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono text-red-600">{item.qty_rejected ?? "—"}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{item.rejection_reason || "—"}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                                {item.rejection_action ? (
                                  <span className="text-slate-600">{DC_ACTION_LABELS[item.rejection_action] ?? item.rejection_action}</span>
                                ) : "—"}
                              </td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                                <div className="flex items-center gap-1.5">
                                  {item.stage_number && (
                                    <span className="text-slate-500">Stage {item.stage_number}{item.stage_name ? `: ${item.stage_name}` : ""}{item.nature_of_process ? ` (${item.nature_of_process})` : ""}</span>
                                  )}
                                  {(item.rework_cycle ?? 1) > 1 && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                      Rework {item.rework_cycle}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>

        {/* Tab 2: GRN Quality */}
        <TabsContent value="grn" className="mt-4 space-y-4">
          {grnLoading ? (
            <p className="text-muted-foreground text-sm">Loading GRN history…</p>
          ) : grnHistory.length === 0 ? (
            <div className="paper-card text-center py-10 text-muted-foreground">No GRN history found for this vendor.</div>
          ) : (
            grnHistory.map((grn: any) => {
              const items: any[] = grn.grn_line_items ?? [];
              const totalReceived = items.reduce((s: number, i: any) => s + (i.receiving_now ?? 0), 0);
              const totalAccepted = items.reduce((s: number, i: any) => s + (i.accepted_quantity ?? 0), 0);
              const totalRejected = items.reduce((s: number, i: any) => s + (i.rejected_quantity ?? 0), 0);
              return (
                <div key={grn.id} className="paper-card space-y-3">
                  {/* GRN header */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-blue-700">{grn.grn_number}</span>
                      <span className="text-sm text-slate-500">{grn.grn_date ? format(new Date(grn.grn_date), "dd MMM yyyy") : "—"}</span>
                      {grn.po_number && <span className="text-xs text-slate-500 font-mono">PO: {grn.po_number}</span>}
                    </div>
                    <div className="text-xs text-slate-600">
                      {totalReceived > 0 && (
                        <span>
                          {totalReceived} received → <span className="text-green-700 font-medium">{totalAccepted} accepted</span>, <span className="text-red-600 font-medium">{totalRejected} non-conforming</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Line items */}
                  {items.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No.</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Received</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Accepted</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Non-Conforming</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">NC Reason</th>
                            <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Action Taken</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item: any) => (
                            <tr key={item.id} className={`${(item.replacement_cycle ?? 1) > 1 ? "bg-orange-50/50" : ""}`}>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-blue-700">{item.drawing_number || "—"}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{item.description}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{item.receiving_now ?? 0}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono text-green-700">{item.accepted_quantity ?? "—"}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono text-red-600">{item.rejected_quantity ?? "—"}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{item.rejection_reason || "—"}</td>
                              <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                                <div className="flex items-center gap-1.5">
                                  {item.rejection_action ? (
                                    <span className="text-slate-600">{GRN_ACTION_LABELS[item.rejection_action] ?? item.rejection_action}</span>
                                  ) : "—"}
                                  {(item.replacement_cycle ?? 1) > 1 && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                      Replacement {item.replacement_cycle}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
