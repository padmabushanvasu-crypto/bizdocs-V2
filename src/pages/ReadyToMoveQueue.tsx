import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PackageCheck, ArrowRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { fetchAwaitingStoreLineItems, type AwaitingStoreLineItem } from "@/lib/grn-api";

export default function ReadyToMoveQueue() {
  const navigate = useNavigate();

  const { data: lineItemsData, isLoading } = useQuery({
    queryKey: ["awaiting-store-line-items"],
    queryFn: fetchAwaitingStoreLineItems,
    staleTime: 30_000,
  });
  const lineItems = useMemo(() => lineItemsData ?? [], [lineItemsData]);

  // Group by GRN
  const grouped = useMemo(
    () =>
      lineItems.reduce<Record<string, AwaitingStoreLineItem[]>>((acc, item) => {
        if (!acc[item.grn_id]) acc[item.grn_id] = [];
        acc[item.grn_id].push(item);
        return acc;
      }, {}),
    [lineItems]
  );

  const pendingGrnCount = Object.keys(grouped).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <PackageCheck className="h-6 w-6 text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ready to Move to Store</h1>
          <p className="text-xs text-slate-500">
            GRNs cleared by QC — move these to the store and notify the storekeeper
          </p>
        </div>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl px-5 py-4">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wide">
            Awaiting Physical Transfer
          </p>
          <p className="text-3xl font-bold text-emerald-900 mt-1 tabular-nums">{pendingGrnCount}</p>
          <p className="text-xs text-emerald-600 mt-0.5">GRNs ready to move to store</p>
        </div>
        <div className="border border-slate-200 bg-slate-50 rounded-xl px-5 py-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Items</p>
          <p className="text-3xl font-bold text-slate-800 mt-1 tabular-nums">{lineItems.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">line items across all GRNs</p>
        </div>
      </div>

      {/* Queue */}
      {isLoading ? (
        <p className="text-sm text-slate-400 animate-pulse">Loading…</p>
      ) : pendingGrnCount === 0 ? (
        <div className="border border-dashed border-emerald-200 bg-emerald-50/40 rounded-xl p-14 text-center">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-500" />
          <p className="text-sm font-semibold text-emerald-800">All items transferred</p>
          <p className="text-xs text-emerald-600 mt-1">No items pending store transfer</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([grnId, items]) => {
            const first = items[0];
            return (
              <div key={grnId} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                {/* GRN header */}
                <div className="bg-emerald-800 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      className="font-mono font-bold text-white text-sm hover:underline"
                      onClick={() => navigate(`/grn/${grnId}`)}
                    >
                      {first.grn_number}
                    </button>
                    {first.vendor_name && (
                      <span className="text-xs text-emerald-200">{first.vendor_name}</span>
                    )}
                    {first.grn_date && (
                      <span className="text-xs text-emerald-300">
                        {format(new Date(first.grn_date), "dd MMM yyyy")}
                      </span>
                    )}
                    <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full font-medium tabular-nums">
                      {items.length} item{items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-emerald-200 hover:text-white hover:bg-emerald-700"
                    onClick={() => navigate(`/grn/${grnId}`)}
                  >
                    View GRN <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>

                {/* Items table */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                          Description
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-left">
                          Drawing No.
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">
                          QC Accepted Qty
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b border-slate-100 last:border-0 bg-white">
                          <td className="px-3 py-2.5 text-slate-800 font-medium">
                            {item.description}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 font-mono text-xs">
                            {item.drawing_number || "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-mono font-semibold text-emerald-800">
                            {item.conforming_qty != null ? (
                              <>
                                {item.conforming_qty}
                                {item.unit && (
                                  <span className="text-xs text-slate-400 ml-1 font-normal">
                                    {item.unit}
                                  </span>
                                )}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Card footer */}
                <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5">
                  <p className="text-xs text-slate-500">
                    QC cleared — move items to store and notify storekeeper to confirm receipt via the
                    <button
                      className="ml-1 text-primary underline underline-offset-2 hover:text-primary/80"
                      onClick={() => navigate("/storekeeper-queue")}
                    >
                      Inward Receipt Queue
                    </button>
                    .
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
