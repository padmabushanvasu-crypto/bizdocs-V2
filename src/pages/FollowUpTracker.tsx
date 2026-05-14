import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import {
  Phone, Mail, CheckCircle2, AlertTriangle, Clock, BellRing, RefreshCw,
  Calendar as CalendarIcon, Search, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  fetchFollowUpPOs, fetchFollowUpDCs, fetchPartiallyReturnedDCs,
  upsertFollowUpLog, markManualReceived, fetchCompletedTodayCount,
  emptyLog,
  type FollowUpLog, type FollowUpPO, type FollowUpDC, type FollowUpType,
} from "@/lib/follow-up-api";

// ── Helpers ───────────────────────────────────────────────────────────────────

type Urgency = "overdue" | "due2" | "due7" | "ok" | "none";

function getDueDateInfo(dueDate: string | null): {
  urgency: Urgency;
  borderClass: string;
  badgeClass: string;
  label: string;
} {
  if (!dueDate) return {
    urgency: "none",
    borderClass: "border-l-gray-200",
    badgeClass: "bg-gray-100 text-gray-500 dark:bg-gray-500/20 dark:text-gray-300",
    label: "No due date",
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  const daysUntil = Math.floor((due.getTime() - today.getTime()) / 86_400_000);

  if (daysUntil < 0) return {
    urgency: "overdue",
    borderClass: "border-l-red-500",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    label: `Overdue by ${Math.abs(daysUntil)}d`,
  };
  if (daysUntil <= 2) return {
    urgency: "due2",
    borderClass: "border-l-orange-500",
    badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    label: daysUntil === 0 ? "Due today" : `Due in ${daysUntil}d`,
  };
  if (daysUntil <= 7) return {
    urgency: "due7",
    borderClass: "border-l-amber-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    label: `Due in ${daysUntil}d`,
  };
  return {
    urgency: "ok",
    borderClass: "border-l-green-400",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300",
    label: `Due in ${daysUntil}d`,
  };
}

function getFollowUpCount(log: FollowUpLog | null): number {
  if (!log) return 0;
  return [log.follow_up_1_at, log.follow_up_2_at, log.follow_up_3_at, log.follow_up_4_at]
    .filter(Boolean).length;
}

function getProgressColor(count: number): string {
  if (count === 0) return "bg-gray-200";
  if (count === 1) return "bg-red-400";
  if (count === 2) return "bg-amber-500";
  if (count === 3) return "bg-amber-400";
  return "bg-green-500";
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

const TYPE_LABELS: Record<FollowUpType, string> = {
  phone: "Phone", email: "Email", whatsapp: "WhatsApp",
};

// ── FollowUpRow ───────────────────────────────────────────────────────────────

interface FollowUpRowProps {
  id: string;
  docNumber: string;
  docType: "po" | "dc";
  docPath: string;
  vendorName: string | null;
  phone: string | null;
  email: string | null;
  dueDate: string | null;
  log: FollowUpLog;
  onLogChange: (id: string, log: FollowUpLog) => void;
  onMarkReceived: (id: string) => void;
  saving: boolean;
}

function FollowUpRow({
  id, docNumber, docType, docPath,
  vendorName, phone, email, dueDate,
  log, onLogChange, onMarkReceived, saving,
}: FollowUpRowProps) {
  const { urgency, borderClass, badgeClass, label } = getDueDateInfo(dueDate);
  const count = getFollowUpCount(log);
  const progress = count * 25;
  const progressColor = getProgressColor(count);

  const handleCheckbox = (n: 1 | 2 | 3 | 4) => {
    const atKey = `follow_up_${n}_at` as keyof FollowUpLog;
    const typeKey = `follow_up_${n}_type` as keyof FollowUpLog;
    const noteKey = `follow_up_${n}_note` as keyof FollowUpLog;
    const alreadySet = !!log[atKey];
    onLogChange(id, {
      ...log,
      [atKey]: alreadySet ? null : new Date().toISOString(),
      [typeKey]: alreadySet ? null : "phone",
      [noteKey]: alreadySet ? null : log[noteKey],
    });
  };

  const handleType = (n: 1 | 2 | 3 | 4, val: FollowUpType) => {
    const key = `follow_up_${n}_type` as keyof FollowUpLog;
    onLogChange(id, { ...log, [key]: val });
  };

  const handleNote = (n: 1 | 2 | 3 | 4, val: string) => {
    const key = `follow_up_${n}_note` as keyof FollowUpLog;
    onLogChange(id, { ...log, [key]: val });
  };

  return (
    <div className={`bg-white dark:bg-[#0f1525] border border-slate-200 dark:border-white/10 border-l-4 ${borderClass} rounded-lg p-4 flex gap-4 shadow-sm`}>
      {/* Left — doc info */}
      <div className="min-w-[160px] max-w-[180px] shrink-0 space-y-1">
        <Link
          to={docPath}
          className="font-mono font-bold text-sm text-primary hover:underline"
        >
          {docNumber}
        </Link>
        <div>
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}>
            {label}
          </span>
        </div>
        {dueDate && (
          <p className="text-xs text-muted-foreground">
            {new Date(dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        )}
        <p className="font-semibold text-sm text-foreground leading-tight mt-1">{vendorName || "—"}</p>
        {phone && (
          <a
            href={`tel:${phone}`}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <Phone className="h-3 w-3" />
            {phone}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 break-all"
          >
            <Mail className="h-3 w-3" />
            {email}
          </a>
        )}
      </div>

      {/* Middle — follow-up checkboxes */}
      <div className="flex-1 min-w-0">
        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{progress}%</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([1, 2, 3, 4] as const).map((n) => {
            const atKey = `follow_up_${n}_at` as keyof FollowUpLog;
            const typeKey = `follow_up_${n}_type` as keyof FollowUpLog;
            const noteKey = `follow_up_${n}_note` as keyof FollowUpLog;
            const isChecked = !!log[atKey];
            const atVal = log[atKey] as string | null;
            const typeVal = (log[typeKey] ?? "phone") as FollowUpType;
            const noteVal = (log[noteKey] ?? "") as string;

            return (
              <div key={n} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-fu${n}`}
                    checked={isChecked}
                    onCheckedChange={() => handleCheckbox(n)}
                    className={isChecked ? "border-green-500 data-[state=checked]:bg-green-500" : ""}
                  />
                  <label
                    htmlFor={`${id}-fu${n}`}
                    className={`text-xs font-semibold cursor-pointer ${isChecked ? "text-green-700" : "text-slate-600"}`}
                  >
                    Follow-up {n}
                  </label>
                </div>

                {isChecked && (
                  <div className="space-y-1 pl-6">
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      {fmtDateTime(atVal)}
                    </p>
                    <select
                      value={typeVal}
                      onChange={(e) => handleType(n, e.target.value as FollowUpType)}
                      className="w-full text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      {(Object.keys(TYPE_LABELS) as FollowUpType[]).map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={noteVal}
                      onChange={(e) => handleNote(n, e.target.value)}
                      placeholder="Add note…"
                      className="w-full text-xs border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right — mark received */}
      <div className="flex flex-col items-end justify-start gap-2 shrink-0">
        {saving && (
          <span className="text-[10px] text-muted-foreground">Saving…</span>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onMarkReceived(id)}
          className="text-xs whitespace-nowrap"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Mark Received
        </Button>
        <p className="text-[10px] text-muted-foreground text-right leading-tight">
          GRN will auto-close this
        </p>
      </div>
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-[#0f1525] border border-slate-200 dark:border-white/10 rounded-lg p-3 text-center shadow-sm">
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-300 mt-0.5">{label}</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type FilterType = "all" | "overdue" | "due2" | "due7" | "followed";

const FILTER_LABELS: Record<FilterType, string> = {
  all: "All",
  overdue: "Overdue",
  due2: "Due within 2 days",
  due7: "Due this week",
  followed: "Followed up",
};

type TabKey = "po" | "dc" | "partial_po" | "partial_dc";
type PageSize = 25 | 50 | 100;

// Build a compact page-number sequence with ellipses (max ~7 buttons).
// Returns an array of numbers (1-indexed) or '…' tokens.
function buildPageList(totalPages: number, current: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "…")[] = [];
  pages.push(1);
  if (current <= 3) {
    pages.push(2, 3, 4, "…", totalPages);
  } else if (current >= totalPages - 2) {
    pages.push("…", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
  } else {
    pages.push("…", current - 1, current, current + 1, "…", totalPages);
  }
  return pages;
}

function isoDay(d: Date | undefined | null): string | null {
  if (!d) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function FollowUpTracker() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabKey>("po");
  const [filter, setFilter] = useState<FilterType>("all");

  // New filters (compound with urgency filter above).
  // Preserved across tab switches.
  const [dateFilter, setDateFilter] = useState<Date | undefined>(undefined);
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [docNumberFilter, setDocNumberFilter] = useState("");

  // Pagination — page size is global, current page is per-tab.
  const [pageSize, setPageSize] = useState<PageSize>(25);
  const [pageByTab, setPageByTab] = useState<Record<TabKey, number>>({
    po: 0, dc: 0, partial_po: 0, partial_dc: 0,
  });
  const setPageForTab = (t: TabKey, page: number) =>
    setPageByTab((prev) => ({ ...prev, [t]: page }));
  const resetAllPages = () =>
    setPageByTab({ po: 0, dc: 0, partial_po: 0, partial_dc: 0 });

  // Reset all tabs' pages whenever a filter / page-size changes — the
  // current page on each tab may no longer have rows after a filter
  // narrows the list.
  useEffect(() => {
    resetAllPages();
  }, [filter, dateFilter, docNumberFilter, pageSize]);

  // Local log state — optimistic updates
  const [localLogs, setLocalLogs] = useState<Map<string, FollowUpLog>>(new Map());
  // Tracks which rows have pending saves
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // Hidden rows (mark received — optimistically removed)
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  // Debounce timers for note field saves
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Queries ──────────────────────────────────────────────────────────────────
  const poQuery = useQuery({
    queryKey: ["follow-up-pos"],
    queryFn: fetchFollowUpPOs,
    staleTime: 60_000,
  });

  const dcQuery = useQuery({
    queryKey: ["follow-up-dcs"],
    queryFn: fetchFollowUpDCs,
    staleTime: 60_000,
  });

  const poCompletedQuery = useQuery({
    queryKey: ["follow-up-completed-today-po"],
    queryFn: () => fetchCompletedTodayCount("po"),
    staleTime: 60_000,
  });

  const dcCompletedQuery = useQuery({
    queryKey: ["follow-up-completed-today-dc"],
    queryFn: () => fetchCompletedTodayCount("dc"),
    staleTime: 60_000,
  });

  const partialDcQuery = useQuery({
    queryKey: ["follow-up-partial-dcs"],
    queryFn: fetchPartiallyReturnedDCs,
    staleTime: 60_000,
  });

  // Seed localLogs from query data (do not overwrite rows currently being saved)
  useEffect(() => {
    const docType: "po" | "dc" = tab === "partial_po" ? "po" : tab === "partial_dc" ? "dc" : tab;
    const items =
      tab === "po" ? (poQuery.data ?? []) :
      tab === "dc" ? [...(dcQuery.data ?? []), ...(partialDcQuery.data ?? [])] :
      tab === "partial_po" ? (poQuery.data ?? []).filter((p) => p.status === "partially_received") :
      (partialDcQuery.data ?? []);
    setLocalLogs((prev) => {
      const m = new Map(prev);
      for (const item of items) {
        if (!m.has(item.id) && item.log) m.set(item.id, item.log);
        else if (!m.has(item.id)) m.set(item.id, emptyLog(item.id, docType));
      }
      return m;
    });
  }, [poQuery.data, dcQuery.data, partialDcQuery.data, tab]);

  // ── Save functions ───────────────────────────────────────────────────────────

  const persistLog = useCallback(async (id: string, docType: "po" | "dc", docNumber: string, log: FollowUpLog) => {
    setSavingIds((prev) => new Set(prev).add(id));
    try {
      await upsertFollowUpLog(id, docType, docNumber, log);
    } catch (err: any) {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSavingIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [toast]);

  const handleLogChange = useCallback((id: string, newLog: FollowUpLog, immediate = false) => {
    // Find the source data to get docNumber
    const allItems = [...(poQuery.data ?? []), ...(dcQuery.data ?? []), ...(partialDcQuery.data ?? [])];
    const item = allItems.find((i) => i.id === id);
    const docNumber = "po_number" in (item ?? {})
      ? (item as FollowUpPO).po_number
      : (item as FollowUpDC | undefined)?.dc_number ?? "";
    const docType = newLog.document_type;

    setLocalLogs((prev) => { const m = new Map(prev); m.set(id, newLog); return m; });

    // Clear any existing save timer
    clearTimeout(saveTimers.current.get(id));

    if (immediate) {
      persistLog(id, docType, docNumber, newLog);
    } else {
      // Debounce note saves by 800ms
      saveTimers.current.set(id, setTimeout(() => {
        persistLog(id, docType, docNumber, newLog);
      }, 800));
    }
  }, [poQuery.data, dcQuery.data, partialDcQuery.data, persistLog]);

  // Checkbox and type changes save immediately; notes use debounce
  const handleLogChangeImmediate = useCallback((id: string, newLog: FollowUpLog) => {
    handleLogChange(id, newLog, true);
  }, [handleLogChange]);

  // ── Mark received ─────────────────────────────────────────────────────────────

  const markMutation = useMutation({
    mutationFn: async (id: string) => {
      const allItems = [...(poQuery.data ?? []), ...(dcQuery.data ?? []), ...(partialDcQuery.data ?? [])];
      const item = allItems.find((i) => i.id === id);
      const docNumber = "po_number" in (item ?? {})
        ? (item as FollowUpPO).po_number
        : (item as FollowUpDC | undefined)?.dc_number ?? "";
      const docType: "po" | "dc" = "po_number" in (item ?? {}) ? "po" : "dc";
      const userName = profile?.display_name ?? profile?.full_name ?? profile?.email ?? "Unknown";
      await markManualReceived(id, docType, docNumber, userName);
    },
    onSuccess: (_, id) => {
      setHiddenIds((prev) => new Set(prev).add(id));
      toast({ title: "Marked as received" });
      queryClient.invalidateQueries({ queryKey: ["follow-up-pos"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-dcs"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-partial-dcs"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-completed-today-po"] });
      queryClient.invalidateQueries({ queryKey: ["follow-up-completed-today-dc"] });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Derived data ──────────────────────────────────────────────────────────────

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function applyFilter<T extends { id: string; due_date: string | null; log: FollowUpLog | null }>(
    items: T[]
  ): T[] {
    let visible = items.filter((i) => !hiddenIds.has(i.id));

    // Urgency filter (existing).
    if (filter === "followed") {
      visible = visible.filter((i) => {
        const log = localLogs.get(i.id) ?? i.log;
        return getFollowUpCount(log) > 0;
      });
    } else if (filter === "overdue") {
      visible = visible.filter((i) => getDueDateInfo(i.due_date).urgency === "overdue");
    } else if (filter === "due2") {
      visible = visible.filter((i) => getDueDateInfo(i.due_date).urgency === "due2");
    } else if (filter === "due7") {
      // due7: everything due within the next 7 days (includes due2)
      visible = visible.filter((i) => {
        const u = getDueDateInfo(i.due_date).urgency;
        return u === "due7" || u === "due2";
      });
    }
    // filter === 'all' → no-op

    // Date filter — exact due_date match (YYYY-MM-DD).
    const dateStr = isoDay(dateFilter ?? null);
    if (dateStr) {
      visible = visible.filter((i) => i.due_date === dateStr);
    }

    // Doc number filter — case-insensitive substring match across
    // whichever number field the row carries.
    const needle = docNumberFilter.trim().toLowerCase();
    if (needle) {
      visible = visible.filter((i) => {
        const num = ((i as any).po_number ?? (i as any).dc_number ?? "") as string;
        return num.toLowerCase().includes(needle);
      });
    }

    return visible;
  }

  // All items for each tab — no status exclusions, full dataset
  const poItems      = applyFilter(poQuery.data ?? []);
  const dcItems      = applyFilter([...(dcQuery.data ?? []), ...(partialDcQuery.data ?? [])]);
  const partialPoItems = applyFilter((poQuery.data ?? []).filter((p) => p.status === "partially_received"));
  const partialDcItems = applyFilter(partialDcQuery.data ?? []);

  const activeItems =
    tab === "po"         ? poItems :
    tab === "dc"         ? dcItems :
    tab === "partial_po" ? partialPoItems :
    partialDcItems;

  // allSource: full tab dataset (unfiltered, unhidden) — used for stat cards
  const allSource =
    tab === "po"         ? (poQuery.data ?? []) :
    tab === "dc"         ? [...(dcQuery.data ?? []), ...(partialDcQuery.data ?? [])] :
    tab === "partial_po" ? (poQuery.data ?? []).filter((p) => p.status === "partially_received") :
    (partialDcQuery.data ?? []);
  const visibleSource = allSource.filter((i) => !hiddenIds.has(i.id));

  const statsOverdue = visibleSource.filter((i) => getDueDateInfo(i.due_date).urgency === "overdue").length;
  const statsDue7 = visibleSource.filter((i) => {
    const u = getDueDateInfo(i.due_date).urgency;
    return u === "due2" || u === "due7";
  }).length;
  const statsCompleted = (tab === "po" || tab === "partial_po")
    ? (poCompletedQuery.data ?? 0)
    : (dcCompletedQuery.data ?? 0);

  const isLoading =
    tab === "po"         ? poQuery.isLoading :
    tab === "dc"         ? (dcQuery.isLoading || partialDcQuery.isLoading) :
    tab === "partial_po" ? poQuery.isLoading :
    partialDcQuery.isLoading;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["follow-up-pos"] });
    queryClient.invalidateQueries({ queryKey: ["follow-up-dcs"] });
    queryClient.invalidateQueries({ queryKey: ["follow-up-partial-dcs"] });
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BellRing className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-display font-bold text-foreground">Follow-Up Tracker</h1>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="po">Purchase Orders</TabsTrigger>
          <TabsTrigger value="dc">Delivery Challans</TabsTrigger>
          <TabsTrigger value="partial_po">Partial PO Receipts</TabsTrigger>
          <TabsTrigger value="partial_dc">Partial DC Returns</TabsTrigger>
        </TabsList>

        {(["po", "dc", "partial_po", "partial_dc"] as const).map((t) => {
          const currentPage = pageByTab[t];
          const totalItems = activeItems.length;
          const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
          const safePage = Math.min(currentPage, totalPages - 1);
          const pageStart = safePage * pageSize;
          const pageEnd = Math.min(pageStart + pageSize, totalItems);
          const pageItems = activeItems.slice(pageStart, pageEnd);
          const pageList = buildPageList(totalPages, safePage + 1);

          return (
          <TabsContent key={t} value={t} className="space-y-4 mt-4">
            {/* Stats — derived from the FULL unfiltered tab dataset
                (only soft-hides marked-received rows). Date / doc-number
                / urgency filters narrow the list below but never the
                cards above; the cards always show the overall picture. */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total Open" value={visibleSource.length} color="text-foreground" />
              <StatCard label="Overdue" value={statsOverdue} color="text-red-600" />
              <StatCard label="Due This Week" value={statsDue7} color="text-amber-600" />
              <StatCard label="Completed Today" value={statsCompleted} color="text-green-600" />
            </div>

            {/* New filters: date + doc-number search */}
            <div className="flex flex-wrap items-center gap-2">
              <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                    {dateFilter
                      ? dateFilter.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
                      : "Filter by due date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFilter}
                    onSelect={(d) => { setDateFilter(d ?? undefined); setDatePopoverOpen(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {dateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateFilter(undefined)}
                  className="text-xs"
                  aria-label="Clear date filter"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={docNumberFilter}
                  onChange={(e) => setDocNumberFilter(e.target.value)}
                  placeholder="Search by PO/DC number"
                  className="pl-8 h-8 text-xs"
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rows</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v) as PageSize)}
                >
                  <SelectTrigger className="h-8 w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Urgency filter (existing) */}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(FILTER_LABELS) as FilterType[]).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  onClick={() => setFilter(f)}
                  className="text-xs"
                >
                  {FILTER_LABELS[f]}
                </Button>
              ))}
            </div>

            {/* Rows */}
            {isLoading ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
            ) : totalItems === 0 ? (
              <div className="text-center py-12 border border-dashed border-slate-200 rounded-lg">
                <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-600">
                  {filter === "all" && !dateFilter && !docNumberFilter.trim()
                    ? t === "po"         ? "No open Purchase Orders — all clear."
                    : t === "dc"         ? "No open Delivery Challans — all clear."
                    : t === "partial_po" ? "No partially received POs — all clear."
                    :                     "No partially returned DCs — all clear."
                    : "No items match the current filters."
                  }
                </p>
                {(filter !== "all" || dateFilter || docNumberFilter.trim()) && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => { setFilter("all"); setDateFilter(undefined); setDocNumberFilter(""); }}
                    className="mt-1"
                  >
                    Clear all filters
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {pageItems.map((item) => {
                    const isPO = t === "po" || t === "partial_po";
                    const docType: "po" | "dc" = isPO ? "po" : "dc";
                    const log = localLogs.get(item.id) ?? item.log ?? emptyLog(item.id, docType);
                    const docNumber = isPO ? (item as FollowUpPO).po_number : (item as FollowUpDC).dc_number;
                    const docPath = isPO
                      ? `/purchase-orders/${item.id}`
                      : `/delivery-challans/${item.id}`;
                    const phone = isPO ? (item as FollowUpPO).vendor_phone : (item as FollowUpDC).party_phone;
                    const email = isPO ? (item as FollowUpPO).vendor_email : (item as FollowUpDC).party_email;
                    const vendorName = isPO ? (item as FollowUpPO).vendor_name : (item as FollowUpDC).party_name;

                    return (
                      <FollowUpRow
                        key={item.id}
                        id={item.id}
                        docNumber={docNumber}
                        docType={docType}
                        docPath={docPath}
                        vendorName={vendorName}
                        phone={phone}
                        email={email}
                        dueDate={item.due_date}
                        log={log}
                        onLogChange={(id, newLog) => handleLogChangeImmediate(id, newLog)}
                        onMarkReceived={(id) => markMutation.mutate(id)}
                        saving={savingIds.has(item.id)}
                      />
                    );
                  })}
                </div>

                {/* Pagination bar */}
                <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-slate-200 dark:border-white/10">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Showing {pageStart + 1}–{pageEnd} of {totalItems}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPageForTab(t, safePage - 1)}
                      disabled={safePage === 0}
                      className="text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                      Prev
                    </Button>
                    {pageList.map((p, idx) =>
                      p === "…" ? (
                        <span key={`ellipsis-${idx}`} className="px-2 text-xs text-muted-foreground">
                          …
                        </span>
                      ) : (
                        <Button
                          key={p}
                          size="sm"
                          variant={safePage + 1 === p ? "default" : "outline"}
                          onClick={() => setPageForTab(t, p - 1)}
                          className="text-xs min-w-[2rem]"
                        >
                          {p}
                        </Button>
                      )
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPageForTab(t, safePage + 1)}
                      disabled={safePage + 1 >= totalPages}
                      className="text-xs"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
