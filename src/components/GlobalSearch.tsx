import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { globalSearch, type SearchHit } from "@/lib/global-search-api";

/** Open the palette from anywhere (header button, shortcuts). */
export const OPEN_GLOBAL_SEARCH_EVENT = "bizdocs:open-global-search";

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

/**
 * Ctrl/Cmd+K command palette ("/" also opens it when not typing). Searches
 * items, dispatch records, serials, POs, GRNs, DCs, work orders, invoices and parties.
 */
export function GlobalSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_GLOBAL_SEARCH_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_GLOBAL_SEARCH_EVENT, onOpen);
    };
  }, []);

  // Debounce so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTerm(input.trim()), 200);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (!open) {
      setInput("");
      setTerm("");
    }
  }, [open]);

  const { data: hits = [], isFetching, error } = useQuery({
    queryKey: ["global-search", term],
    queryFn: () => globalSearch(term),
    enabled: open && term.length >= 2,
    staleTime: 15_000,
  });

  const groups = useMemo(() => {
    const out: { name: string; hits: SearchHit[] }[] = [];
    for (const h of hits) {
      const g = out.find((x) => x.name === h.group);
      if (g) g.hits.push(h);
      else out.push({ name: h.group, hits: [h] });
    }
    return out;
  }, [hits]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    navigate(hit.url);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      {/* Server-side matching; cmdk's own fuzzy filter would hide valid results. */}
        <CommandInput
          placeholder="Search items, drawing no., DR, PO, GRN, DC, serial, party…"
          value={input}
          onValueChange={setInput}
        />
        <CommandList>
          {term.length < 2 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters. Use several words to narrow, e.g. <span className="font-mono">11kv 17 pos</span>.
            </p>
          ) : error ? (
            <p className="px-4 py-6 text-center text-sm text-red-600">
              Search failed: {error instanceof Error ? error.message : "unknown error"}
            </p>
          ) : isFetching && hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <CommandEmpty>No results for “{term}”.</CommandEmpty>
          ) : (
            groups.map((g) => (
              <CommandGroup key={g.name} heading={g.name}>
                {g.hits.map((h) => (
                  <CommandItem key={`${h.group}-${h.id}`} value={`${h.group}-${h.id}`} onSelect={() => go(h)}>
                    <div className="flex flex-col min-w-0">
                      <span className="font-mono text-sm font-medium truncate">{h.title}</span>
                      {h.subtitle && <span className="text-xs text-muted-foreground truncate">{h.subtitle}</span>}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))
          )}
        </CommandList>
        <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ navigate · ↵ open · esc close</span>
          <span className="inline-flex items-center gap-1">
            <Search className="h-3 w-3" /> Ctrl K or /
          </span>
        </div>
    </CommandDialog>
  );
}
