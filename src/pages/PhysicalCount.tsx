import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Search, ChevronLeft, ArrowDownUp, Upload } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/gst-utils";
import { PhysicalCountImportDialog } from "@/components/PhysicalCountImportDialog";
import {
  fetchCountWorklist,
  submitPhysicalCount,
  type CountWorklistRow,
} from "@/lib/physical-count-api";

type SortKey = "item_code" | "description" | "system_free";

export default function PhysicalCount() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [hideCounted, setHideCounted] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("item_code");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Rows with a live pending submission show a read-only "Pending approval"
  // state instead of the input; toggling this reveals the input again to
  // let the user resubmit (which supersedes the old pending row server-side).
  const [revising, setRevising] = useState<Record<string, boolean>>({});

  // Fetch the FULL list so "X of N counted" is accurate; filter client-side.
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["count-worklist"],
    queryFn: () => fetchCountWorklist(),
  });

  const totalCount = rows.length;
  const countedCount = rows.filter((r) => r.counted).length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (hideCounted && r.counted) return false;
      if (!term) return true;
      return r.item_code.toLowerCase().includes(term) || r.description.toLowerCase().includes(term);
    });
    out = [...out].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "system_free") cmp = a.system_free - b.system_free;
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, search, hideCounted, sortKey, sortDir]);

  const submitMutation = useMutation({
    mutationFn: ({ itemId, counted }: { itemId: string; counted: number }) =>
      submitPhysicalCount(itemId, counted),
    onSuccess: (row) => {
      setInputs((prev) => { const n = { ...prev }; delete n[row.item_id]; return n; });
      setRevising((prev) => { const n = { ...prev }; delete n[row.item_id]; return n; });
      queryClient.invalidateQueries({ queryKey: ["count-worklist"] });
      toast({
        title: "Count submitted for approval",
        description: `${formatNumber(row.counted_qty)} submitted — awaiting qc_team/admin review.`,
      });
    },
    onError: (err: any) => toast({ title: "Could not submit count", description: err.message, variant: "destructive" }),
  });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sortArrow = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "↕");

  const Th = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th className={`px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-${align}`}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-700">
        {label} <span className="text-[9px]">{sortArrow(k)}</span>
      </button>
    </th>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-blue-600" /> Physical Count
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter the actual on-shelf (free) quantity per item. Submitting sends it for
            qc_team/admin approval — stock isn't affected until it's approved.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5">
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Progress</p>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{countedCount} <span className="text-sm font-normal text-slate-400">of {totalCount} counted</span></p>
          </div>
        </div>
      </div>

      <PhysicalCountImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        worklist={rows}
        onApplied={() => {
          queryClient.invalidateQueries({ queryKey: ["count-worklist"] });
          queryClient.invalidateQueries({ queryKey: ["item-locations"] });
        }}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search code or description…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant={hideCounted ? "default" : "outline"} size="sm" onClick={() => setHideCounted((v) => !v)} className="gap-1.5">
          {hideCounted ? "Showing uncounted" : "Hide already-counted"}
        </Button>
        <span className="text-sm text-muted-foreground ml-auto flex items-center gap-1">
          <ArrowDownUp className="h-3.5 w-3.5 opacity-60" /> {filtered.length} shown
        </span>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)]">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <Th k="item_code" label="Item Code" />
                <Th k="description" label="Description" />
                <Th k="system_free" label="System Free" align="right" />
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Counted Free</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Variance</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Submit</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">No items</td></tr>
              ) : (
                filtered.map((r: CountWorklistRow) => {
                  const inputVal = inputs[r.id] ?? "";
                  const busy = savingId === r.id && submitMutation.isPending;
                  const canSubmit = inputVal.trim() !== "" && Number(inputVal) >= 0;
                  const isPending = !!r.pending_count_id;
                  const showInput = !isPending || revising[r.id];
                  const pendingVariance = isPending ? (r.pending_qty as number) - r.system_free : null;

                  const submit = () => {
                    setSavingId(r.id);
                    submitMutation.mutate({ itemId: r.id, counted: Number(inputVal) });
                  };

                  return (
                    <tr key={r.id} className={`hover:bg-muted/30 transition-colors ${isPending ? "bg-amber-50/40" : r.counted ? "bg-green-50/30" : ""}`}>
                      <td className="px-3 py-2 border-b border-slate-100 font-mono text-xs text-slate-700">
                        {r.item_code}
                        {r.counted && r.last_counted_at && (
                          <span className="ml-2 text-[10px] text-green-600">✓ {format(new Date(r.last_counted_at), "dd MMM")}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-slate-800 max-w-[280px] truncate">{r.description}</td>
                      <td className="px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums text-slate-600">
                        {formatNumber(r.system_free)} <span className="text-xs text-slate-400">{r.unit}</span>
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-right">
                        {showInput ? (
                          <Input
                            type="number"
                            min={0}
                            value={inputVal}
                            placeholder="—"
                            onChange={(e) => setInputs((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && canSubmit) submit();
                            }}
                            className="w-24 text-right ml-auto"
                          />
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-mono tabular-nums text-slate-700">{formatNumber(r.pending_qty as number)}</span>
                            <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Pending approval</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums">
                        {pendingVariance != null ? (
                          <span className={pendingVariance === 0 ? "text-slate-400" : pendingVariance > 0 ? "text-green-600" : "text-red-600"}>
                            {pendingVariance > 0 ? "+" : ""}{formatNumber(pendingVariance)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-slate-100 text-center">
                        {showInput ? (
                          <Button size="sm" variant="outline" disabled={!canSubmit || busy} onClick={submit}>
                            {busy ? "Submitting…" : "Submit"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRevising((prev) => ({ ...prev, [r.id]: true }));
                              setInputs((prev) => ({ ...prev, [r.id]: String(r.pending_qty ?? "") }));
                            }}
                          >
                            Revise
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
