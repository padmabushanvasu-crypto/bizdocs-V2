import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DEFAULT_OPTIONS = [25, 50, 100];

/**
 * Reusable "rows per page" control for list/table headers. Compact (h-8) so it
 * sits in a header action group beside Export/New. Layout-only — the parent
 * owns the pageSize state and re-fetch; this just reports the new value.
 */
export function TablePageSize({
  value,
  onChange,
  options = DEFAULT_OPTIONS,
}: {
  value: number;
  onChange: (v: number) => void;
  options?: number[];
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground whitespace-nowrap">Per page</span>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="w-[80px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={String(o)}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
