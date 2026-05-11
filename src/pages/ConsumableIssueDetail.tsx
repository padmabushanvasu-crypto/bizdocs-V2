import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Wrench, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchConsumableIssue,
  fetchConsumableItems,
  createConsumableIssue,
  type ConsumableIssueLine,
  type ConsumableIssueLineInput,
  type ConsumableItem,
} from "@/lib/consumables-api";
import { formatNumber } from "@/lib/gst-utils";
import { format, parseISO } from "date-fns";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineFormRow {
  _key: string;
  item_id: string;
  item_code: string;
  item_description: string;
  drawing_number: string;
  unit: string;
  stock_free: number;
  qty_issued: number;
  return_status: "returned" | "not_returned";
  qty_returned: number;
  return_reason: string;
  disposition: "scrap" | "";
}

function emptyLine(): LineFormRow {
  return {
    _key: crypto.randomUUID(),
    item_id: "",
    item_code: "",
    item_description: "",
    drawing_number: "",
    unit: "NOS",
    stock_free: 0,
    qty_issued: 1,
    return_status: "not_returned",
    qty_returned: 0,
    return_reason: "",
    disposition: "",
  };
}

function returnStatusBadge(status: string) {
  if (status === "returned") {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Returned</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">Not Returned</Badge>;
}

function issuedStatusBadge(status: string) {
  if (status === "issued") {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">Issued</Badge>;
  }
  return <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Draft</Badge>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ConsumableIssueDetail() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { profile } = useAuth();

  // ── VIEW mode ─────────────────────────────────────────────────────────────
  const { data: issue, isLoading } = useQuery({
    queryKey: ["consumable-issue", id],
    queryFn: () => fetchConsumableIssue(id!),
    enabled: !isNew,
  });

  // ── Items for combobox ────────────────────────────────────────────────────
  const { data: allItems = [] } = useQuery({
    queryKey: ["consumable-items"],
    queryFn: fetchConsumableItems,
    enabled: isNew,
  });

  // ── CREATE form state ─────────────────────────────────────────────────────
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [issuedTo, setIssuedTo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineFormRow[]>([emptyLine()]);
  const [openComboKey, setOpenComboKey] = useState<string | null>(null);

  const DRAFT_KEY = 'bizdocs_draft_consumable';

  // Restore draft (once on mount, create mode only)
  useEffect(() => {
    if (!isNew) return;
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.issueDate) setIssueDate(draft.issueDate);
      if (draft.issuedTo !== undefined) setIssuedTo(draft.issuedTo);
      if (draft.notes !== undefined) setNotes(draft.notes);
      if (draft.lines?.length) setLines(draft.lines as LineFormRow[]);
    } catch {
      sessionStorage.removeItem(DRAFT_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save draft (debounced 500ms, create mode only)
  useEffect(() => {
    if (!isNew) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ issueDate, issuedTo, notes, lines }));
    }, 500);
    return () => clearTimeout(timer);
  }, [isNew, issueDate, issuedTo, notes, lines]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => {
      if (!issuedTo.trim()) throw new Error("Issued To is required");
      const validLines = lines.filter((l) => l.item_id && l.qty_issued > 0);
      if (validLines.length === 0) throw new Error("Add at least one line item with qty > 0");
      const missingReason = validLines.filter(
        (l) => l.return_status === "not_returned" && !l.return_reason.trim()
      );
      if (missingReason.length > 0)
        throw new Error(`Line ${missingReason.map((l) => lines.indexOf(l) + 1).join(", ")}: reason required for items not returned`);

      const lineInputs: ConsumableIssueLineInput[] = validLines.map((l) => ({
        item_id: l.item_id,
        item_code: l.item_code || null,
        item_description: l.item_description || null,
        drawing_number: l.drawing_number || null,
        unit: l.unit,
        qty_issued: l.qty_issued,
        return_status: l.return_status,
        qty_returned: l.return_status === "returned" ? l.qty_returned : 0,
        return_reason: l.return_reason || null,
        disposition: l.return_status === "returned" && l.disposition === "scrap" ? "scrap" : null,
      }));

      return createConsumableIssue({
        issue_date: issueDate,
        issued_to: issuedTo.trim(),
        issued_by: profile?.full_name ?? null,
        notes: notes.trim() || null,
        lines: lineInputs,
      });
    },
    onSuccess: (created) => {
      sessionStorage.removeItem(DRAFT_KEY);
      queryClient.invalidateQueries({ queryKey: ["consumable-issues"] });
      queryClient.invalidateQueries({ queryKey: ["consumable-stats"] });
      toast({ title: `${created.issue_number} created successfully` });
      navigate(`/consumables/${created.id}`);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Line helpers ──────────────────────────────────────────────────────────
  function selectItem(key: string, item: ConsumableItem) {
    setLines((prev) =>
      prev.map((l) =>
        l._key === key
          ? {
              ...l,
              item_id: item.id,
              item_code: item.item_code,
              item_description: item.description,
              drawing_number: item.drawing_number ?? "",
              unit: item.unit,
              stock_free: item.stock_free,
            }
          : l
      )
    );
    setOpenComboKey(null);
  }

  function updateLine<K extends keyof LineFormRow>(key: string, field: K, value: LineFormRow[K]) {
    setLines((prev) => prev.map((l) => (l._key === key ? { ...l, [field]: value } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l._key !== key));
  }

  // ── Loading state (VIEW) ──────────────────────────────────────────────────
  if (!isNew && isLoading) {
    return <div className="p-6 text-center text-muted-foreground">Loading…</div>;
  }

  // ── VIEW mode render ──────────────────────────────────────────────────────
  if (!isNew && issue) {
    return (
      <div className="p-4 md:p-6 space-y-5 max-w-4xl">
        {/* Back + header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate("/consumables")}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <Wrench className="w-5 h-5 text-primary" />
            <span className="font-mono font-bold text-lg">{issue.issue_number}</span>
            {issuedStatusBadge(issue.status)}
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
          <span>Date: <b className="text-foreground">{format(parseISO(issue.issue_date), "dd MMM yyyy")}</b></span>
          <span>Issued To: <b className="text-foreground">{issue.issued_to}</b></span>
          {issue.issued_by && <span>Issued By: <b className="text-foreground">{issue.issued_by}</b></span>}
          {issue.notes && <span>Notes: <b className="text-foreground">{issue.notes}</b></span>}
        </div>

        {/* Lines table */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/60">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Drawing No</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Item</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Qty Issued</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Return Status</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Qty Returned</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase border-b border-slate-200 dark:border-slate-700">Reason / Disposition</th>
                </tr>
              </thead>
              <tbody>
                {(issue.lines ?? []).map((line: ConsumableIssueLine) => (
                  <tr key={line.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2.5 font-mono text-blue-700 dark:text-blue-400">
                      {line.drawing_number ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{line.item_code ?? "—"}</p>
                      {line.item_description && (
                        <p className="text-xs text-muted-foreground">{line.item_description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono">
                      {line.qty_issued} {line.unit}
                    </td>
                    <td className="px-3 py-2.5">
                      {returnStatusBadge(line.return_status)}
                      {line.return_status === "not_returned" && line.return_reason && (
                        <p className="mt-1 text-xs text-muted-foreground">{line.return_reason}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-mono">
                      {line.return_status === "returned" ? `${line.qty_returned} ${line.unit}` : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">
                      {line.return_reason && <span>{line.return_reason}</span>}
                      {line.disposition === "scrap" && (
                        <Badge className="ml-1 bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">Scrap</Badge>
                      )}
                      {!line.return_reason && !line.disposition && "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── CREATE mode render ────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => { sessionStorage.removeItem(DRAFT_KEY); navigate("/consumables"); }}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">New Consumable Issue</h1>
        </div>
      </div>

      {/* Header fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="space-y-1.5">
          <Label htmlFor="issue-date">Issue Date</Label>
          <Input
            id="issue-date"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issued-to">Issued To <span className="text-red-500">*</span></Label>
          <Input
            id="issued-to"
            placeholder="Name or department"
            value={issuedTo}
            onChange={(e) => setIssuedTo(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="issued-by">Issued By</Label>
          <Input
            id="issued-by"
            value={profile?.full_name ?? ""}
            readOnly
            className="bg-muted text-muted-foreground"
          />
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Optional notes…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Lines */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-slate-500">Line Items</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLines((prev) => [...prev, emptyLine()])}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Line
          </Button>
        </div>

        {lines.map((line, idx) => (
          <div
            key={line._key}
            className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 space-y-3"
          >
            {/* Row header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Line {idx + 1}</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={() => removeLine(line._key)}
                disabled={lines.length === 1}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {/* Item combobox */}
            <div className="space-y-1.5">
              <Label>Item <span className="text-red-500">*</span></Label>
              <Popover
                open={openComboKey === line._key}
                onOpenChange={(open) => setOpenComboKey(open ? line._key : null)}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-start font-normal text-left"
                  >
                    {line.item_code ? (
                      <span>
                        <span className="font-mono font-medium">{line.item_code}</span>
                        {line.item_description && (
                          <span className="text-muted-foreground ml-2 text-xs">{line.item_description}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Select item…</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search item code or description…" />
                    <CommandList>
                      <CommandEmpty>No items found.</CommandEmpty>
                      <CommandGroup>
                        {allItems.map((item: ConsumableItem) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.item_code} ${item.description}`}
                            onSelect={() => selectItem(line._key, item)}
                          >
                            <div className="flex flex-col">
                              <span className="font-mono font-medium text-sm">{item.item_code}</span>
                              <span className="text-xs text-muted-foreground">{item.description}</span>
                            </div>
                            <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                              Free: {formatNumber(item.stock_free ?? 0)}
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {line.item_id && (
                <p className="text-xs text-muted-foreground">
                  {line.drawing_number && <span className="font-mono mr-3">{line.drawing_number}</span>}
                  Free stock: <span className={line.stock_free < line.qty_issued ? "text-amber-600 font-medium" : "text-green-600 font-medium"}>{formatNumber(line.stock_free ?? 0)}</span>
                </p>
              )}
            </div>

            {/* Qty + return status */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Qty Issued</Label>
                <Input
                  type="number"
                  min={1}
                  value={line.qty_issued}
                  onChange={(e) =>
                    updateLine(line._key, "qty_issued", Math.max(0, Number(e.target.value)))
                  }
                  className="tabular-nums"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Unit</Label>
                <Input value={line.unit} readOnly className="bg-muted text-muted-foreground" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Return Status</Label>
                <Select
                  value={line.return_status}
                  onValueChange={(v) =>
                    updateLine(line._key, "return_status", v as "returned" | "not_returned")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_returned">Not Returned</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Return details — only when returned */}
            {line.return_status === "returned" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label>Qty Returned</Label>
                  <Input
                    type="number"
                    min={0}
                    max={line.qty_issued}
                    value={line.qty_returned}
                    onChange={(e) =>
                      updateLine(
                        line._key,
                        "qty_returned",
                        Math.min(line.qty_issued, Math.max(0, Number(e.target.value)))
                      )
                    }
                    className="tabular-nums"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Disposition</Label>
                  <Select
                    value={line.disposition || "none"}
                    onValueChange={(v) =>
                      updateLine(line._key, "disposition", v === "scrap" ? "scrap" : "")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="scrap">Scrap</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Return Reason</Label>
                  <Input
                    placeholder="Why was it returned?"
                    value={line.return_reason}
                    onChange={(e) => updateLine(line._key, "return_reason", e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Not-returned reason — required when item is not coming back */}
            {line.return_status === "not_returned" && (
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label>
                    Reason <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Reason for not returning (e.g. Worn out, Lost in process)"
                    value={line.return_reason}
                    onChange={(e) => updateLine(line._key, "return_reason", e.target.value)}
                    className="dark:bg-[#0a0e1a] dark:border-white/20 dark:text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-2">
        <Button
          className="bg-green-600 hover:bg-green-700 text-white"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          {createMutation.isPending ? "Saving…" : "Save Issue"}
        </Button>
      </div>
    </div>
  );
}
