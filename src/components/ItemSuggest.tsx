import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
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
  raw_material: "RAW",
  component: "COMP",
  sub_assembly: "SA",
  bought_out: "BO",
  finished_good: "FG",
  consumable: "CONS",
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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["items-suggest", search],
    queryFn: () => fetchItems({ search, status: "active", pageSize: 10 }),
    enabled: search.length >= 2,
    staleTime: 30_000,
  });

  // Server-side fetchItems already searches across item_code / description /
  // drawing_number / drawing_revision / hsn_sac_code via OR ilike. Re-sort
  // client-side so rows whose drawing number / revision contains the query
  // float to the top — drawings are the primary identifier here.
  const rawItems = data?.data ?? [];
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rawItems;
    const matchesDrawing = (i: Item) => {
      const dn = (i.drawing_number ?? "").toLowerCase();
      const dr = (i.drawing_revision ?? "").toLowerCase();
      return dn.includes(q) || dr.includes(q);
    };
    return [...rawItems].sort((a, b) => {
      const aRank = matchesDrawing(a) ? 0 : 1;
      const bRank = matchesDrawing(b) ? 0 : 1;
      return aRank - bRank;
    });
  }, [rawItems, search]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [search]);

  // Recalculate position whenever open state changes or items arrive
  const updatePosition = () => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 300),
      zIndex: 9999,
      maxHeight: 300,
      overflowY: "auto",
    });
  };

  useEffect(() => {
    if (open) updatePosition();
  }, [open, items.length]);

  // Keep dropdown aligned on scroll / resize
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  // Close on outside click — must not close when clicking inside the portal
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const inContainer = containerRef.current?.contains(e.target as Node);
      const inDropdown = dropdownRef.current?.contains(e.target as Node);
      if (!inContainer && !inDropdown) setOpen(false);
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

  const dropdown =
    open && items.length > 0
      ? createPortal(
          <div
            ref={dropdownRef}
            style={dropdownStyle}
            className="bg-popover border border-border rounded-md shadow-xl"
          >
            {items.map((item, idx) => {
              const drawing = item.drawing_number || item.drawing_revision || "";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`w-full text-left px-3 py-2.5 text-sm transition-colors border-b border-border last:border-0 ${
                    idx === activeIndex ? "bg-accent" : "hover:bg-accent"
                  }`}
                  onMouseDown={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium font-mono text-foreground shrink-0">
                      {item.item_code}
                    </span>
                    <span className="text-sm text-foreground truncate flex-1">
                      {item.description}
                    </span>
                    {drawing && (
                      <span className="text-xs text-muted-foreground font-mono shrink-0">
                        DRW: {drawing}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.item_type && (
                        <span className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                          {TYPE_SHORT[item.item_type] ?? item.item_type}
                        </span>
                      )}
                      {item.unit && (
                        <span className="text-xs text-muted-foreground">{item.unit}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
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
      {dropdown}
    </div>
  );
}
