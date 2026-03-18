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

export function ItemSuggest({ value, onSelect, onChange, placeholder = "Type to search items...", className }: ItemSuggestProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["items-suggest", search],
    queryFn: () => fetchItems({ search, status: "active", pageSize: 20 }),
    enabled: search.length >= 1,
    staleTime: 30_000,
  });

  const items = data?.data ?? [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => { if (value) { setSearch(value); setOpen(true); } }}
        placeholder={placeholder}
        className={className}
      />
      {open && items.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b border-border last:border-0"
              onMouseDown={() => {
                onSelect(item);
                setOpen(false);
              }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">{item.item_code}</span>
                <span className="text-xs text-muted-foreground">{item.hsn_sac_code || ""}</span>
              </div>
              <div className="font-medium text-foreground">{item.description}</div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{item.unit}</span>
                <span>₹{item.sale_price}</span>
                <span>GST {item.gst_rate}%</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
