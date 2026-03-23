import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchItems, type Item } from "@/lib/items-api";
import { Input } from "@/components/ui/input";

interface ItemSuggestProps {
  value: string;
  onSelect: (item: Item) => void;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const TYPE_SHORT: Record<string, string> = {
  raw_material: "RM",
  component: "COMP",
  sub_assembly: "SA",
  bought_out: "BO",
  finished_good: "FG",
  consumable: "CONS",
  job_work: "JW",
  service: "SVC",
};

export function ItemSuggest({
  value,
  onSelect,
  onChange,
  placeholder = "Type to search items...",
  className,
}: ItemSuggestProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["items-suggest", search],
    queryFn: () => fetchItems({ search, status: "active", pageSize: 10 }),
    enabled: search.length >= 2,
    staleTime: 30_000,
  });

  const items = data?.data ?? [];

  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      onSelect(items[activeIndex]);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (value) {
            setSearch(value);
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
      />
      {open && items.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {items.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-border last:border-0 ${
                idx === activeIndex ? "bg-accent" : "hover:bg-accent"
              }`}
              onMouseDown={() => {
                onSelect(item);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <div className="flex items-center gap-2 min-w-0">
                {item.drawing_revision && (
                  <span className="font-mono text-xs font-semibold text-blue-600 shrink-0">
                    {item.drawing_revision}
                  </span>
                )}
                <span className="font-medium text-foreground truncate flex-1">
                  {item.description}
                </span>
                {item.item_type && (
                  <span className="shrink-0 text-[10px] font-mono bg-muted text-muted-foreground px-1 py-0.5 rounded">
                    {TYPE_SHORT[item.item_type] ?? item.item_type}
                  </span>
                )}
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                <span className="font-mono">{item.item_code}</span>
                <span>{item.unit}</span>
                {(item.standard_cost ?? 0) > 0 && <span>₹{item.standard_cost}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
