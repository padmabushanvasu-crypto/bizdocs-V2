import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  PackageCheck,
  CheckCircle2,
  Clock,
  Truck,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import {
  fetchPendingStoreGRNs,
  fetchConfirmedGRNs,
  type QueueGRN,
} from "@/lib/grn-api";

type Tab = "pending" | "confirmed";

function applyClientSearch(grns: QueueGRN[], search: string): QueueGRN[] {
  const q = search.trim().toLowerCase();
  if (!q) return grns;
  return grns.filter((g) => {
    const n = (g.grn_number ?? "").toLowerCase();
    const v = (g.vendor_name ?? "").toLowerCase();
    return n.includes(q) || v.includes(q);
  });
}

function fmtDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "—";
  try {
    const d = parseISO(iso);
    return withTime ? format(d, "dd MMM yyyy, HH:mm") : format(d, "dd MMM yyyy");
  } catch {
    return "—";
  }
}

function GrnCard({
  grn,
  variant,
  onClick,
}: {
  grn: QueueGRN;
  variant: "pending" | "confirmed";
  onClick: () => void;
}) {
  const lineCount = grn.line_items?.length ?? 0;
  const lines = grn.line_items ?? [];
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white dark:bg-[#0f1525] border border-slate-200 dark:border-white/10 rounded-xl p-4 hover:border-primary/50 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-sm font-mono text-slate-900 dark:text-slate-100">
              {grn.grn_number}
            </span>
            {variant === "pending" ? (
              <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-800/50">
                Awaiting Store
              </Badge>
            ) : (
              <Badge className="text-[10px] bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 border-green-200 dark:border-green-800/50">
                Confirmed
              </Badge>
            )}
            {grn.grn_type === "dc_grn" && (
              <Badge variant="outline" className="text-[10px]">
                DC GRN
              </Badge>
            )}
          </div>

          <p className="text-sm text-foreground truncate">
            {grn.vendor_name ?? "—"}
          </p>

          {variant === "confirmed" && grn.store_confirmed_at && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
              Confirmed on {fmtDate(grn.store_confirmed_at, true)}
              {grn.store_confirmed_by ? ` by ${grn.store_confirmed_by}` : ""}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {fmtDate(grn.grn_date)}
            </span>
            {grn.vehicle_number && (
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3" /> {grn.vehicle_number}
              </span>
            )}
            <span>
              {lineCount} item{lineCount !== 1 ? "s" : ""}
            </span>
          </div>

          {lines.length > 0 && (
            <ul className="mt-2 border-t border-slate-100 dark:border-white/10 pt-2 space-y-1">
              {lines.slice(0, 5).map((li) => (
                <li
                  key={li.id}
                  className="flex items-baseline gap-2 text-xs text-slate-700 dark:text-slate-300"
                >
                  {li.drawing_number && (
                    <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0">
                      {li.drawing_number}
                    </span>
                  )}
                  <span className="flex-1 truncate">
                    {li.description ?? "—"}
                  </span>
                  <span className="font-mono text-slate-600 dark:text-slate-300 shrink-0">
                    {li.accepted_qty ?? 0} {li.unit ?? ""}
                  </span>
                </li>
              ))}
              {lines.length > 5 && (
                <li className="text-[11px] text-muted-foreground italic">
                  + {lines.length - 5} more line{lines.length - 5 !== 1 ? "s" : ""}
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </button>
  );
}

function StatBox({
  active,
  variant,
  count,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  variant: "amber" | "green";
  count: number;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}) {
  const palette =
    variant === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-100"
      : "bg-green-50 border-green-200 text-green-900 dark:bg-green-950/30 dark:border-green-800 dark:text-green-100";
  const ringColor =
    variant === "amber"
      ? "ring-amber-400 dark:ring-amber-500"
      : "ring-green-500 dark:ring-green-400";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-left rounded-xl border p-4 transition-all hover:shadow-sm ${palette} ${
        active ? `ring-2 ring-offset-1 ${ringColor}` : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 opacity-80" />
        <div className="min-w-0">
          <p className="text-2xl font-bold leading-tight tabular-nums">{count}</p>
          <p className="text-xs opacity-80 mt-0.5">{label}</p>
        </div>
      </div>
    </button>
  );
}

export default function GrnQueue() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("pending");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: pendingGRNs = [], isLoading: pendingLoading } = useQuery({
    queryKey: ["grn-queue-pending"],
    queryFn: fetchPendingStoreGRNs,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: confirmedGRNs = [], isLoading: confirmedLoading } = useQuery({
    queryKey: ["grn-queue-confirmed", { search, dateFrom, dateTo }],
    queryFn: () => fetchConfirmedGRNs({ search, dateFrom, dateTo }),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: tab === "confirmed",
  });

  const filteredPending = useMemo(
    () => applyClientSearch(pendingGRNs, search),
    [pendingGRNs, search]
  );

  const list = tab === "pending" ? filteredPending : confirmedGRNs;
  const loading = tab === "pending" ? pendingLoading : confirmedLoading;

  const clearDateRange = () => {
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Inward Receipt Queue
        </h1>
        <p className="text-sm text-muted-foreground">
          Track GRNs from QC to store confirmation
        </p>
      </div>

      {/* Stat boxes act as tab triggers */}
      <div className="flex gap-3 mb-5">
        <StatBox
          active={tab === "pending"}
          variant="amber"
          count={pendingGRNs.length}
          label="GRNs awaiting store receipt"
          Icon={PackageCheck}
          onClick={() => setTab("pending")}
        />
        <StatBox
          active={tab === "confirmed"}
          variant="green"
          count={confirmedGRNs.length}
          label="GRNs received in store"
          Icon={CheckCircle2}
          onClick={() => setTab("confirmed")}
        />
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search GRN#, vendor..."
            className="pl-9 dark:bg-[#0a0e1a] dark:border-white/20 dark:text-slate-100"
          />
        </div>

        {tab === "confirmed" && (
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0a0e1a] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Confirmed Date Range
              </Label>
              {(dateFrom || dateTo) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={clearDateRange}
                >
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 text-sm dark:bg-[#0a0e1a] dark:border-white/20 dark:text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 text-sm dark:bg-[#0a0e1a] dark:border-white/20 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {!loading && list.length === 0 && tab === "pending" && (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-500/70" />
          <p className="font-medium text-slate-700 dark:text-slate-200">All received!</p>
          <p className="text-sm mt-1">No GRNs awaiting store confirmation</p>
        </div>
      )}

      {!loading && list.length === 0 && tab === "confirmed" && (
        <div className="text-center py-16 text-muted-foreground">
          <PackageCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium text-slate-700 dark:text-slate-200">No confirmed GRNs found</p>
          <p className="text-sm mt-1">Try adjusting the date range or search</p>
        </div>
      )}

      <div className="space-y-3">
        {list.map((grn) => (
          <GrnCard
            key={grn.id}
            grn={grn}
            variant={tab === "pending" ? "pending" : "confirmed"}
            onClick={() => navigate(`/grn/${grn.id}`)}
          />
        ))}
      </div>
    </div>
  );
}
