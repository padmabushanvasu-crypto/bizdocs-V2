import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Activity,
  Factory,
  Truck,
  AlertTriangle,
  Download,
  Clock,
  Wrench,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWipRegister, type WipEntry } from "@/lib/job-cards-api";
import {
  fetchInProgressAOsWithLines,
  type AssemblyOrderWithLines,
} from "@/lib/assembly-orders-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel } from "@/lib/export-utils";
import { format, differenceInDays } from "date-fns";

type WipTab = "all" | "component" | "assembly";

// ── Status badge (component WIP) ─────────────────────────────────────────────

function StatusBadge({ status }: { status: WipEntry["status"] }) {
  if (status === "on_hold") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-amber-50 text-amber-800 border-amber-200">
        On Hold
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-800 border-blue-200">
      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
      In Progress
    </span>
  );
}

// ── Days-in-progress cell for AOs ────────────────────────────────────────────

function DaysInProgress({ createdAt }: { createdAt: string }) {
  const days = differenceInDays(new Date(), new Date(createdAt));
  const colour =
    days > 14 ? "text-destructive font-semibold" :
    days > 7  ? "text-amber-600 font-medium" :
                "text-muted-foreground";
  return (
    <span className={`flex items-center justify-end gap-1 text-sm ${colour}`}>
      <Clock className="h-3.5 w-3.5 shrink-0" />
      {days}d
    </span>
  );
}

// ── Components-ready cell for AOs ────────────────────────────────────────────

function ComponentsReady({ lines }: { lines: AssemblyOrderWithLines["lines"] }) {
  if (lines.length === 0) {
    return <span className="text-muted-foreground text-sm">No BOM</span>;
  }
  const ready = lines.filter((l) => l.available_qty >= l.required_qty).length;
  const total = lines.length;
  const colour =
    ready === total ? "text-emerald-600 font-medium" :
    ready === 0     ? "text-destructive font-medium" :
                      "text-amber-600 font-medium";
  return (
    <span className={`text-sm ${colour}`}>
      {ready} of {total} ready
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WipRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<WipTab>("all");
  const [search, setSearch] = useState("");

  // Component WIP (job cards)
  const { data: rows = [], isLoading: jcLoading, dataUpdatedAt } = useQuery({
    queryKey: ["wip-register"],
    queryFn: () => fetchWipRegister(),
    refetchInterval: 30000,
  });

  // Sub-assembly WIP (assembly orders in progress)
  const { data: aoRows = [], isLoading: aoLoading } = useQuery({
    queryKey: ["wip-assembly-orders"],
    queryFn: fetchInProgressAOsWithLines,
    refetchInterval: 30000,
  });

  // Filtered component WIP
  const filteredJc = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.jc_number?.toLowerCase().includes(q) ||
        r.item_code?.toLowerCase().includes(q) ||
        r.item_description?.toLowerCase().includes(q) ||
        r.current_vendor_name?.toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Filtered assembly WIP
  const filteredAo = useMemo(() => {
    if (!search.trim()) return aoRows;
    const q = search.toLowerCase();
    return aoRows.filter(
      (ao) =>
        ao.ao_number?.toLowerCase().includes(q) ||
        ao.item_code?.toLowerCase().includes(q) ||
        ao.item_description?.toLowerCase().includes(q) ||
        ao.work_order_ref?.toLowerCase().includes(q)
    );
  }, [aoRows, search]);

  // Summary stats
  const atVendor = rows.filter((r) => r.current_location === "at_vendor").length;
  const inHouse  = rows.filter((r) => r.current_location === "in_house").length;
  const overdueCount = rows.filter((r) => r.is_overdue).length;

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { timeStyle: "short" })
    : "—";

  const handleExport = () => {
    exportToExcel(
      [
        {
          sheetName: "Component WIP",
          columns: [
            { key: "jc_number",           label: "JC Number",       type: "text",     width: 14 },
            { key: "item_code",            label: "Item Code",        type: "text",     width: 12 },
            { key: "item_description",     label: "Description",      type: "text",     width: 28 },
            { key: "status",               label: "Status",           type: "text",     width: 12 },
            { key: "current_location",     label: "Location",         type: "text",     width: 12 },
            { key: "current_vendor_name",  label: "Vendor",           type: "text",     width: 20 },
            { key: "current_step_name",    label: "Current Step",     type: "text",     width: 22 },
            { key: "expected_return_date", label: "Expected Return",  type: "date",     width: 16 },
            { key: "days_at_vendor",       label: "Days at Vendor",   type: "number",   width: 14 },
            { key: "days_overdue",         label: "Days Overdue",     type: "number",   width: 13 },
            { key: "quantity_accepted",    label: "Qty",              type: "number",   width: 8  },
            { key: "total_cost",           label: "Running Cost",     type: "currency", width: 14 },
            { key: "days_active",          label: "Days Active",      type: "number",   width: 12 },
          ],
          data: filteredJc,
        },
        {
          sheetName: "Sub-Assembly WIP",
          columns: [
            { key: "ao_number",          label: "AO Number",        type: "text",   width: 14 },
            { key: "item_code",          label: "Item Code",         type: "text",   width: 12 },
            { key: "item_description",   label: "Item Being Built",  type: "text",   width: 28 },
            { key: "quantity_to_build",  label: "Qty to Build",      type: "number", width: 12 },
            { key: "work_order_ref",     label: "Work Order Ref",    type: "text",   width: 16 },
            { key: "planned_date",       label: "Planned Date",      type: "date",   width: 14 },
          ],
          data: filteredAo,
        },
      ],
      "WIP_Register"
    );
  };

  const showComponent = tab === "all" || tab === "component";
  const showAssembly  = tab === "all" || tab === "assembly";

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5" />
            WIP Register
            <span className="flex items-center gap-1 text-xs font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Live view of all work in progress — components and sub-assemblies
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* Tab bar + Search */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["all", "component", "assembly"] as const).map((t) => {
            const labels: Record<WipTab, string> = {
              all:       "All WIP",
              component: "Component WIP",
              assembly:  "Sub-Assembly WIP",
            };
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  tab === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {labels[t]}
              </button>
            );
          })}
        </div>

        <Input
          placeholder="Search JC number, AO number, item, vendor…"
          className="h-9 w-72 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Section 1: Component WIP ── */}
      {showComponent && (
        <div className="space-y-3">
          {/* Section header */}
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Component WIP</h2>
            <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
              {rows.length}
            </span>
          </div>

          {/* 3 mini summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="paper-card py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Truck className="h-3.5 w-3.5 text-amber-600" />
                <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">At Vendors</p>
              </div>
              <p className="text-xl font-bold font-mono text-amber-700">{atVendor}</p>
              <p className="text-[11px] text-muted-foreground">Job Cards</p>
            </div>
            <div className="paper-card py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Factory className="h-3.5 w-3.5 text-blue-600" />
                <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">Internal Processing</p>
              </div>
              <p className="text-xl font-bold font-mono text-blue-700">{inHouse}</p>
              <p className="text-[11px] text-muted-foreground">Job Cards</p>
            </div>
            <div className={`paper-card py-3 ${overdueCount > 0 ? "border-l-4 border-l-destructive" : ""}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className={`h-3.5 w-3.5 ${overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                <p className="text-[11px] uppercase text-muted-foreground font-bold tracking-wider">Overdue Returns</p>
              </div>
              <p className={`text-xl font-bold font-mono ${overdueCount > 0 ? "text-destructive" : ""}`}>{overdueCount}</p>
              <p className="text-[11px] text-muted-foreground">Past expected date</p>
            </div>
          </div>

          {/* Component WIP table */}
          <div className="paper-card !p-0">
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>JC Number</th>
                    <th>Item</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Current Step</th>
                    <th className="text-right">Expected Return</th>
                    <th className="text-right">Days Overdue</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Running Cost</th>
                    <th className="text-right">Days Active</th>
                  </tr>
                </thead>
                <tbody>
                  {jcLoading ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-muted-foreground">
                        Loading component WIP…
                      </td>
                    </tr>
                  ) : filteredJc.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-muted-foreground">
                        {rows.length === 0
                          ? "No active job cards. All clear!"
                          : "No job cards match current search."}
                      </td>
                    </tr>
                  ) : (
                    filteredJc.map((row) => {
                      const rowBg = row.is_overdue
                        ? "bg-red-50/60 hover:bg-red-50"
                        : row.status === "on_hold"
                        ? "bg-muted/40 hover:bg-muted/60"
                        : "hover:bg-muted/30";

                      return (
                        <tr
                          key={row.id}
                          className={`cursor-pointer transition-colors ${rowBg}`}
                          onClick={() => navigate(`/job-cards/${row.id}`)}
                        >
                          <td className="font-mono text-xs font-medium text-foreground">
                            {row.jc_number}
                          </td>
                          <td>
                            <p className="font-medium text-sm leading-tight">{row.item_code ?? "—"}</p>
                            {row.item_description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                                {row.item_description}
                              </p>
                            )}
                            {row.batch_ref && (
                              <p className="text-[10px] text-muted-foreground/70">Batch: {row.batch_ref}</p>
                            )}
                          </td>
                          <td>
                            <StatusBadge status={row.status} />
                          </td>
                          <td>
                            {row.current_location === "at_vendor" ? (
                              <div className="flex items-center gap-1.5">
                                <Truck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                <span className="text-sm text-blue-600 font-medium">{row.current_vendor_name ?? "Vendor"}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <Factory className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                <span className="text-sm text-muted-foreground">In House</span>
                              </div>
                            )}
                          </td>
                          <td>
                            {row.current_step_name ? (
                              <div>
                                <p className="text-sm">{row.current_step_name}</p>
                                {row.current_step_number != null && (
                                  <p className="text-xs text-muted-foreground">Step {row.current_step_number}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </td>
                          <td className="text-right">
                            {row.expected_return_date ? (
                              <span className={row.is_overdue ? "text-destructive font-medium text-sm" : "text-sm"}>
                                {new Date(row.expected_return_date).toLocaleDateString("en-IN", {
                                  day: "2-digit", month: "short", year: "numeric",
                                })}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </td>
                          <td className="text-right">
                            {row.is_overdue && row.days_overdue != null ? (
                              <span className="text-destructive font-medium text-sm flex items-center justify-end gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {row.days_overdue}d
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </td>
                          <td className="text-right font-mono tabular-nums text-sm">
                            {row.quantity_accepted}
                          </td>
                          <td className="text-right font-mono tabular-nums text-sm font-medium">
                            {formatCurrency(row.total_cost)}
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              {row.days_active}d
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 2: Sub-Assembly WIP ── */}
      {showAssembly && (
        <div className="space-y-3">
          {/* Section header */}
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Sub-Assembly WIP</h2>
            <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
              {aoRows.length}
            </span>
          </div>

          {/* Sub-Assembly table */}
          <div className="paper-card !p-0">
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr>
                    <th>AO Number</th>
                    <th>Item Being Built</th>
                    <th className="text-right">Qty to Build</th>
                    <th>Work Order Ref</th>
                    <th>Planned Date</th>
                    <th className="text-right">Days in Progress</th>
                    <th>Components Ready</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {aoLoading ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-muted-foreground">
                        Loading assembly orders…
                      </td>
                    </tr>
                  ) : filteredAo.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10">
                        {aoRows.length === 0 ? (
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Layers className="h-8 w-8 opacity-30" />
                            <p>No assembly orders in progress.</p>
                            <Link
                              to="/assembly-orders"
                              className="text-primary text-sm flex items-center gap-1 hover:underline"
                            >
                              Go to Assembly Orders <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No assembly orders match current search.</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredAo.map((ao) => (
                      <tr
                        key={ao.id}
                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => navigate(`/assembly-orders/${ao.id}`)}
                      >
                        <td className="font-mono text-xs font-medium text-foreground">
                          {ao.ao_number}
                        </td>
                        <td>
                          <p className="font-medium text-sm leading-tight">{ao.item_code ?? "—"}</p>
                          {ao.item_description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {ao.item_description}
                            </p>
                          )}
                        </td>
                        <td className="text-right font-mono tabular-nums text-sm">
                          {ao.quantity_to_build}
                        </td>
                        <td className="font-mono text-sm text-muted-foreground">
                          {ao.work_order_ref ?? "—"}
                        </td>
                        <td className="text-sm">
                          {ao.planned_date
                            ? format(new Date(ao.planned_date), "dd MMM yyyy")
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right">
                          <DaysInProgress createdAt={ao.created_at} />
                        </td>
                        <td>
                          <ComponentsReady lines={ao.lines} />
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-blue-50 text-blue-800 border-blue-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                            In Progress
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center">
        Auto-refreshing every 30 seconds · Last updated: {lastRefreshed} · Click any row to open detail
      </p>
    </div>
  );
}
