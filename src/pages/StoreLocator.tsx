import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MapPin, Search, ChevronLeft, Boxes, PackageOpen } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/gst-utils";
import { RackVisual } from "@/components/RackVisual";
import {
  fetchItemsWithLocations,
  setItemLocation,
  fetchItemLedger,
  type ItemWithLocation,
} from "@/lib/item-locations-api";
import {
  ledgerTypeLabel,
  ledgerTypeFlow,
  FLOW_BADGE_CLS,
  REFERENCE_ROUTES,
} from "@/lib/inventory-ledger-api";

function locationLabel(item: { rack: string | null; shelf: string | null }): string {
  if (!item.rack && !item.shelf) return "— unplaced";
  return `Rack ${item.rack ?? "—"} · Shelf ${item.shelf ?? "—"}`;
}

export default function StoreLocator() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [unplacedOnly, setUnplacedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Set/relocate dialog
  const [setOpen, setSetOpen] = useState(false);
  const [rackInput, setRackInput] = useState("");
  const [shelfInput, setShelfInput] = useState("");

  // History / detail "box"
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["item-locations", unplacedOnly],
    queryFn: () => fetchItemsWithLocations({ unplacedOnly }),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) =>
        i.item_code.toLowerCase().includes(term) ||
        i.description.toLowerCase().includes(term)
    );
  }, [items, search]);

  const selected: ItemWithLocation | undefined = useMemo(
    () => items.find((i) => i.id === selectedId),
    [items, selectedId]
  );

  // Per-item history — reused wholesale from the inventory ledger. Loaded when
  // the detail box opens.
  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ["store-locator-history", selectedId],
    queryFn: () => fetchItemLedger(selectedId!),
    enabled: !!selectedId && detailOpen,
  });

  const saveMutation = useMutation({
    mutationFn: () => setItemLocation(selectedId!, rackInput, shelfInput),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["item-locations"] });
      setSetOpen(false);
      toast({ title: "Location saved" });
    },
    onError: (err: any) => toast({ title: "Could not save location", description: err.message, variant: "destructive" }),
  });

  const openSetDialog = () => {
    setRackInput(selected?.rack ?? "");
    setShelfInput(selected?.shelf ?? "");
    setSetOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <MapPin className="h-5 w-5 text-blue-600" /> Store Locator
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Find an item, see where it lives, and set or relocate its rack &amp; shelf.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-4">
        {/* ── LEFT: searchable item list ─────────────────────────────────── */}
        <div className="paper-card !p-0 flex flex-col max-h-[calc(100vh-220px)]">
          <div className="p-3 space-y-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search code or description…"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={unplacedOnly}
                onChange={(e) => setUnplacedOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-600"
              />
              Show only unplaced
            </label>
          </div>

          <div className="overflow-y-auto divide-y divide-slate-100">
            {isLoading ? (
              <div className="px-3 py-8 text-center text-sm text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-400">No items found</div>
            ) : (
              filtered.map((it) => {
                const placed = !!(it.rack || it.shelf);
                return (
                  <button
                    key={it.id}
                    onClick={() => setSelectedId(it.id)}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors ${selectedId === it.id ? "bg-blue-50" : ""}`}
                  >
                    <p className="font-mono text-xs font-medium text-slate-700">{it.item_code}</p>
                    <p className="text-sm text-slate-800 truncate">{it.description}</p>
                    <p className={`text-xs mt-0.5 ${placed ? "text-blue-600" : "text-amber-600"}`}>
                      {placed ? locationLabel(it) : "— unplaced"}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ── RIGHT: selected item ───────────────────────────────────────── */}
        <div className="paper-card">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Boxes className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground font-medium">Select an item</p>
              <p className="text-sm text-muted-foreground">Pick an item on the left to view and set its location.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-slate-900">{selected.item_code}</p>
                  <p className="text-sm text-slate-600">{selected.description}</p>
                </div>
                <Button onClick={openSetDialog} className="gap-1.5">
                  <MapPin className="h-4 w-4" />
                  {selected.rack || selected.shelf ? "Relocate" : "Set location"}
                </Button>
              </div>

              {/* Current-location block */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Current location</p>
                {selected.rack || selected.shelf ? (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                    <span className="text-sm">Rack <b className="font-mono">{selected.rack ?? "—"}</b></span>
                    <span className="text-sm">Shelf <b className="font-mono">{selected.shelf ?? "—"}</b></span>
                    {selected.located_updated_at && (
                      <span className="text-xs text-slate-400">
                        updated {format(new Date(selected.located_updated_at), "dd MMM yyyy")}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-amber-600 flex items-center gap-1.5">
                    <PackageOpen className="h-4 w-4" /> Not placed yet
                  </p>
                )}
              </div>

              {/* Rack visual */}
              <div className="max-w-sm">
                <RackVisual
                  rack={selected.rack}
                  shelf={selected.shelf}
                  onOpenDetail={() => setDetailOpen(true)}
                  onSetLocation={openSetDialog}
                />
                {(selected.rack || selected.shelf) && (
                  <p className="text-xs text-slate-400 mt-2 text-center">
                    Click the highlighted shelf to open full details &amp; movement history.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Set / Relocate dialog ───────────────────────────────────────── */}
      <Dialog open={setOpen} onOpenChange={setSetOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{selected?.rack || selected?.shelf ? "Relocate item" : "Set location"}</DialogTitle>
            <DialogDescription>
              {selected?.item_code} — {selected?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Rack <span className="text-destructive">*</span></Label>
              <Input value={rackInput} onChange={(e) => setRackInput(e.target.value)} placeholder="e.g. A" />
            </div>
            <div className="space-y-1.5">
              <Label>Shelf <span className="text-destructive">*</span></Label>
              <Input value={shelfInput} onChange={(e) => setShelfInput(e.target.value)} placeholder="e.g. 3" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSetOpen(false)} disabled={saveMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !rackInput.trim() || !shelfInput.trim()}
            >
              {saveMutation.isPending ? "Saving…" : "Save location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Detail "box": location + full in/out history ────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-600" /> {selected?.item_code}
            </DialogTitle>
            <DialogDescription>{selected?.description}</DialogDescription>
          </DialogHeader>

          {/* Location summary */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-sm">
            <span>Rack <b className="font-mono">{selected?.rack ?? "—"}</b></span>
            <span>Shelf <b className="font-mono">{selected?.shelf ?? "—"}</b></span>
            {selected?.located_updated_at && (
              <span className="text-xs text-slate-400">
                updated {format(new Date(selected.located_updated_at), "dd MMM yyyy")}
              </span>
            )}
          </div>

          {/* History table */}
          <div className="mt-2 max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Date</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Type</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">In</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Out</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Source Doc</th>
                </tr>
              </thead>
              <tbody>
                {historyLoading ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">No movements recorded</td></tr>
                ) : (
                  history.map((r) => {
                    const route = r.reference_type ? REFERENCE_ROUTES[r.reference_type] : null;
                    const flow = ledgerTypeFlow(r.transaction_type);
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 border-b border-slate-100 whitespace-nowrap">
                          {format(new Date(r.transaction_date), "dd MMM yyyy")}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-center">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${FLOW_BADGE_CLS[flow]}`}>
                            {ledgerTypeLabel(r.transaction_type)}
                          </span>
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums">
                          {r.qty_in > 0 ? <span className="text-green-600 font-semibold">+{formatNumber(r.qty_in)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-right font-mono tabular-nums">
                          {r.qty_out > 0 ? <span className="text-red-600 font-semibold">−{formatNumber(r.qty_out)}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100">
                          {r.reference_number && route && r.reference_id ? (
                            <button
                              className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
                              onClick={() => navigate(`${route}/${r.reference_id}`)}
                            >
                              {r.reference_number}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">{r.reference_number ?? "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
