import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { fetchItems, type Item } from "@/lib/items-api";
import { fetchProcessingRouteAll, type ProcessingRoute } from "@/lib/dc-intelligence-api";
import { openJobCard } from "@/lib/job-works-api";

interface OpenJobCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// New-model job card creation (DC_STAGE_FLOW_REDESIGN.md §4.4) — calls
// rpc_open_job_card. This is a standalone flow: the job card is opened
// first (moving qty free -> in_process at its entry stage), and a DC is
// raised against it afterwards. This dialog does not create or touch a DC.
export function OpenJobCardDialog({ open, onOpenChange }: OpenJobCardDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [itemOpen, setItemOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [qty, setQty] = useState<number | undefined>();
  const [entryStage, setEntryStage] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setSelectedItem(null);
    setItemSearch("");
    setQty(undefined);
    setEntryStage(null);
    setReason("");
    setNotes("");
  };

  const { data: itemResults } = useQuery({
    queryKey: ["open-job-card-item-search", itemSearch],
    queryFn: () => fetchItems({ search: itemSearch, pageSize: 20 }),
    enabled: open && itemSearch.trim().length > 0,
  });

  const { data: routes = [], isLoading: routesLoading } = useQuery({
    queryKey: ["processing-routes-all", selectedItem?.id],
    queryFn: () => fetchProcessingRouteAll(selectedItem!.id),
    enabled: !!selectedItem,
  });

  const minStage = routes.length > 0 ? Math.min(...routes.map((r) => r.stage_number)) : null;

  // Default to the item's minimum active stage as soon as routes load.
  useEffect(() => {
    if (routes.length > 0 && entryStage === null) {
      setEntryStage(minStage);
    }
  }, [routes]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPastMin = minStage != null && entryStage != null && entryStage > minStage;

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedItem) throw new Error("Select an item first.");
      if (!qty || qty <= 0) throw new Error("Enter a quantity greater than zero.");
      if (entryStage == null) throw new Error("Select an entry stage.");
      if (isPastMin && !reason.trim()) {
        throw new Error(
          `A reason is required when opening a job card past stage ${minStage} (skipping ${minStage} to ${entryStage - 1}).`
        );
      }
      return openJobCard({
        item_id: selectedItem.id,
        qty,
        entry_stage: entryStage,
        reason: reason.trim() || null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["job-works"] });
      toast({ title: "Job card opened", description: result.jc_number });
      onOpenChange(false);
      reset();
    },
    // Surface the RPC's exception message verbatim — it's written to be read
    // by a human (e.g. "Stage 6 (Milling - VMC) is not marked as an entry
    // point for item 230206"). Do not reword or re-derive it here.
    onError: (e: any) => toast({ title: "Could not open job card", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!mutation.isPending) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Open Job Card</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Item *</Label>
            <Popover open={itemOpen} onOpenChange={setItemOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selectedItem ? `${selectedItem.item_code} — ${selectedItem.description}` : "Search item..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder="Search item code / description..." value={itemSearch} onValueChange={setItemSearch} />
                  <CommandList>
                    <CommandEmpty>{itemSearch.trim() ? "No item found." : "Type to search..."}</CommandEmpty>
                    <CommandGroup>
                      {(itemResults?.data ?? []).map((it) => (
                        <CommandItem
                          key={it.id}
                          value={it.id}
                          onSelect={() => {
                            setSelectedItem(it);
                            setEntryStage(null);
                            setItemOpen(false);
                          }}
                        >
                          <span className="font-mono text-xs text-muted-foreground mr-2">{it.item_code}</span>
                          {it.description}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Quantity *</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={qty ?? ""}
                onChange={(e) => setQty(e.target.value ? Number(e.target.value) : undefined)}
                className="flex-1"
              />
              {selectedItem?.unit && <span className="text-sm text-muted-foreground">{selectedItem.unit}</span>}
            </div>
          </div>

          {selectedItem && (
            <div className="space-y-1.5">
              <Label>Entry Stage *</Label>
              {routesLoading ? (
                <p className="text-xs text-muted-foreground">Loading route...</p>
              ) : routes.length === 0 ? (
                <p className="text-xs text-red-600">This item has no active processing route — a job card cannot be opened.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {routes.map((r: ProcessingRoute) => {
                    const isSelected = entryStage === r.stage_number;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setEntryStage(r.stage_number)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        {r.stage_number}. {r.process_name || "(unnamed)"}
                        <span className="ml-1 opacity-60">{r.stage_type === "internal" ? "(internal)" : "(vendor)"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {minStage != null && (
                <p className="text-[11px] text-muted-foreground">Minimum active stage for this item: {minStage}.</p>
              )}
            </div>
          )}

          {isPastMin && (
            <div className="space-y-1.5">
              <Label>Reason for skipping to stage {entryStage} *</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder={`e.g. stages ${minStage}–${(entryStage ?? 1) - 1} already done outside BizDocs`}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!selectedItem || !qty || entryStage == null || (isPastMin && !reason.trim()) || mutation.isPending}
          >
            {mutation.isPending ? "Opening..." : "Open Job Card"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
