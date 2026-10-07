import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  fetchItemJigSuggestions,
  fetchJigMasterOptions,
  type PickedJig,
} from "@/lib/dc-jigs-api";

interface Props {
  itemId: string;
  value: PickedJig[];
  onChange: (next: PickedJig[]) => void;
}

// Jigs are picked from the Jig Master — never typed. Suggestions for the
// item come first; below them is a searchable list of every jig. Jigs that
// are not ready (status to_be_made) cannot be picked.
export function DcJigPicker({ itemId, value, onChange }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: suggestions = [], error: sugErr } = useQuery({
    queryKey: ["item-jig-suggestions", itemId],
    queryFn: () => fetchItemJigSuggestions(itemId),
  });
  const { data: allJigs = [], error: allErr } = useQuery({
    queryKey: ["jig-master-options"],
    queryFn: fetchJigMasterOptions,
  });

  const pickedIds = new Set(value.map((v) => v.jig_id));
  const statusById = useMemo(() => new Map(allJigs.map((j) => [j.id, j.status])), [allJigs]);

  const add = (jig_id: string, jig_number: string) => {
    if (pickedIds.has(jig_id)) return;
    onChange([...value, { jig_id, jig_number, qty: 1 }]);
  };
  const setQty = (jig_id: string, raw: string) => {
    const n = Math.max(1, Math.trunc(Number(raw) || 1));
    onChange(value.map((v) => (v.jig_id === jig_id ? { ...v, qty: n } : v)));
  };
  const remove = (jig_id: string) => onChange(value.filter((v) => v.jig_id !== jig_id));

  const q = search.trim().toLowerCase();
  const filtered = allJigs.filter(
    (j) =>
      !pickedIds.has(j.id) &&
      (!q || j.jig_number.toLowerCase().includes(q) || (j.drawing_number ?? "").toLowerCase().includes(q)),
  );
  const pendingSuggestions = suggestions.filter((s) => !pickedIds.has(s.jig_id));
  const notReady = (id: string) => statusById.get(id) === "to_be_made";

  return (
    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
        <Wrench className="h-3.5 w-3.5" /> Jigs sent with this item
      </p>
      {(sugErr || allErr) && (
        <p className="text-xs text-red-600">{((sugErr || allErr) as Error).message}</p>
      )}

      {value.length > 0 && (
        <div className="space-y-1">
          {value.map((v) => (
            <div key={v.jig_id} className="flex items-center gap-2 text-sm">
              <span className="font-medium text-amber-900 min-w-[5rem]">{v.jig_number}</span>
              <span className="text-xs text-slate-500">Qty</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={v.qty}
                onChange={(e) => setQty(v.jig_id, e.target.value)}
                className="h-7 w-16 text-xs"
              />
              <button
                type="button"
                onClick={() => remove(v.jig_id)}
                className="text-slate-400 hover:text-red-600"
                aria-label={`Remove ${v.jig_number}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {pendingSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Suggested:</span>
          {pendingSuggestions.map((s) => (
            <Button
              key={s.jig_id}
              type="button"
              size="sm"
              variant="outline"
              disabled={notReady(s.jig_id)}
              title={notReady(s.jig_id) ? "Jig not ready — cannot be sent" : s.associated_process ?? undefined}
              className="h-6 px-2 text-xs"
              onClick={() => add(s.jig_id, s.jig_number)}
            >
              <Plus className="h-3 w-3 mr-1" />
              {s.jig_number}
            </Button>
          ))}
        </div>
      )}

      <div>
        <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setOpen((o) => !o)}>
          {open ? "Hide jig list" : "Add another jig…"}
        </Button>
        {open && (
          <div className="mt-1 space-y-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jig no. or drawing"
              className="h-7 text-xs max-w-xs"
            />
            <div className="max-h-40 overflow-y-auto border rounded bg-white divide-y">
              {filtered.length === 0 && <p className="p-2 text-xs text-slate-500">No matching jigs.</p>}
              {filtered.slice(0, 100).map((j) => {
                const blocked = j.status === "to_be_made";
                return (
                  <button
                    key={j.id}
                    type="button"
                    disabled={blocked}
                    onClick={() => add(j.id, j.jig_number)}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="font-medium">{j.jig_number}</span>
                    {j.drawing_number && <span className="text-slate-500"> · {j.drawing_number}</span>}
                    {blocked && <span className="text-red-600"> · not ready</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
