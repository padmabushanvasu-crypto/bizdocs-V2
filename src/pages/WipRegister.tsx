import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
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
import { SegmentedControl } from "@/components/SegmentedControl";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchInProgressAOsWithLines,
  type AssemblyOrderWithLines,
} from "@/lib/assembly-orders-api";
import { exportToExcel } from "@/lib/export-utils";
import { format, differenceInDays, parseISO } from "date-fns";

type WipTab = "all" | "component" | "subassembly" | "finished_good";

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

// ── Stage progress dots ───────────────────────────────────────────────────────

function StageProgressBar({ current, total }: { current: number | null; total: number | null }) {
  if (!total || total <= 1) return <span className="text-muted-foreground text-xs">—</span>;
  const cur = current ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: total }).map((_, i) => {
        const stageNum = i + 1;
        const done = stageNum < cur;
        const active = stageNum === cur;
        return (
          <div key={i} className="flex items-center">
            <div
              className={`h-2 w-2 rounded-full shrink-0 ${
                done   ? "bg-blue-500" :
                active ? "bg-amber-500 animate-pulse" :
                         "bg-slate-200"
              }`}
            />
            {i < total - 1 && (
              <div className={`h-px w-2 ${done ? "bg-blue-300" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
      <span className="ml-1 text-[10px] text-muted-foreground font-mono">{cur}/{total}</span>
    </div>
  );
}

// ── DC type display ────────────────────────────────────────────────────────────

function dcTypeLabel(dcType: string) {
  if (dcType === "job_work_143") return "Returnable — Section 143";
  if (dcType === "job_work_out") return "Returnable — Processing";
  if (dcType === "returnable")   return "Returnable";
  return dcType;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function WipRegister() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<WipTab>("all");
  const [search, setSearch] = useState("");

  // DC-based WIP
  const { data: wipData = [], isLoading: dcLoading, dataUpdatedAt } = useQuery({
    queryKey: ['wip-dcs'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('delivery_challans')
        .select(`
          id,
          dc_number,
          dc_date,
          dc_type,
          status,
          party_name,
          return_before_date,
          dc_line_items (
            id,
            drawing_number,
            description,
            quantity,
            unit,
            nature_of_process,
            stage_number,
            stage_name,
            total_stages,
            is_rework,
            rework_cycle,
            qty_received,
            qty_accepted,
            qty_rejected,
            return_status
          )
        `)
        .in('dc_type', ['returnable', 'job_work_143', 'job_work_out'])
        .in('status', ['issued', 'partially_returned'])
        .order('dc_date', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Sub-assembly WIP (legacy assembly orders in progress)
  const { data: aoRows = [], isLoading: aoLoading } = useQuery({
    queryKey: ["wip-assembly-orders"],
    queryFn: fetchInProgressAOsWithLines,
    refetchInterval: 30000,
  });

  // Sub-assembly WIP (new AWO system — pending_materials + in_progress)
  const { data: saWorkOrders = [] } = useQuery({
    queryKey: ["sa-work-orders-wip"],
    queryFn: async () => {
      const { supabase: sb } = await import("@/integrations/supabase/client");
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return [];
      const { data: profile } = await sb.from("profiles").select("company_id").eq("id", user.id).single();
      if (!profile?.company_id) return [];
      const { data } = await (sb as any)
        .from("assembly_work_orders")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("awo_type", "sub_assembly")
        .in("status", ["pending_materials", "in_progress"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Finished Good WIP (new AWO system)
  const { data: fgWorkOrders = [] } = useQuery({
    queryKey: ["fg-work-orders-wip"],
    queryFn: async () => {
      const { supabase: sb } = await import("@/integrations/supabase/client");
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return [];
      const { data: profile } = await sb.from("profiles").select("company_id").eq("id", user.id).single();
      if (!profile?.company_id) return [];
      const { data } = await (sb as any)
        .from("assembly_work_orders")
        .select("*")
        .eq("company_id", profile.company_id)
        .eq("awo_type", "finished_good")
        .in("status", ["pending_materials", "in_progress"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Filtered DC WIP
  const filteredDcs = useMemo(() => {
    const rows = wipData as any[];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r: any) =>
        r.dc_number?.toLowerCase().includes(q) ||
        r.party_name?.toLowerCase().includes(q) ||
        r.dc_line_items?.some((li: any) =>
          li.drawing_number?.toLowerCase().includes(q) ||
          li.description?.toLowerCase().includes(q)
        )
    );
  }, [wipData, search]);

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
  const today = new Date().toISOString().split("T")[0];
  const overdueCount = (wipData as any[]).filter((r: any) => r.return_before_date && r.return_before_date < today).length;
  const aoOverdue = aoRows.filter((ao) => ao.planned_date && ao.planned_date < today).length;

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { timeStyle: "short" })
    : "—";

  const handleExport = () => {
    exportToExcel(
      [
        {
          sheetName: "DC WIP",
          columns: [
            { key: "dc_number",          label: "DC Number",       type: "text",   width: 14 },
            { key: "dc_date",            label: "DC Date",          type: "date",   width: 12 },
            { key: "dc_type",            label: "Type",             type: "text",   width: 20 },
            { key: "party_name",         label: "Vendor",           type: "text",   width: 24 },
            { key: "status",             label: "Status",           type: "text",   width: 14 },
            { key: "return_before_date", label: "Return Due",       type: "date",   width: 14 },
          ],
          data: filteredDcs,
        },
        {
          sheetName: "Production WIP",
          columns: [
            { key: "ao_number",          label: "Run Number",       type: "text",   width: 14 },
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
  const showAssembly  = tab === "all" || tab === "subassembly";
  const showFinishedGood = tab === "finished_good";

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="h-5 w-5" />
            WIP Register
            <span className="flex items-center gap-1 text-xs font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Live view of all work in progress — components and sub-assemblies
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* Tab bar + Search */}
      <div className="flex items-center gap-4 flex-wrap">
        <SegmentedControl
          options={[
            { value: "all",          label: "All WIP",           color: "#0F172A", count: (wipData as any[]).length + aoRows.length + saWorkOrders.length },
            { value: "component",    label: "Component WIP",     color: "#2563EB", count: (wipData as any[]).length },
            { value: "subassembly",  label: "Sub-Assembly WIP",  color: "#0F766E", count: aoRows.length + saWorkOrders.length },
            { value: "finished_good", label: "Finished Good WIP", color: "#6366F1", count: fgWorkOrders.length },
          ]}
          value={tab}
          onChange={(v) => setTab(v as WipTab)}
        />

        <Input
          placeholder="Search DC number, vendor, drawing, description…"
          className="h-9 w-72 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Section 1: DC WIP ── */}
      {showComponent && (
        <div className="space-y-3">
          {/* Section header */}
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">DC WIP (Returnable)</h2>
            <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
              {(wipData as any[]).length}
            </span>
          </div>

          {/* Inline stat chips */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium text-xs ${
              (wipData as any[]).length > 0 ? "bg-blue-50 border border-blue-200 text-blue-800 shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600"
            }`}>
              <Truck className="h-3 w-3" /> {(wipData as any[]).length} at vendors
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${
              overdueCount > 0 ? "bg-red-50 border border-red-200 text-red-800 font-bold shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 font-medium"
            }`}>
              <AlertTriangle className="h-3 w-3" /> {overdueCount} overdue
            </span>
          </div>

          {/* DC WIP table */}
          <div className="paper-card !p-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
              <table className="w-full data-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>DC Number</th>
                    <th>Drawing No</th>
                    <th>Description</th>
                    <th>Stage</th>
                    <th>Progress</th>
                    <th>Process</th>
                    <th>Vendor</th>
                    <th className="text-right">Qty Sent</th>
                    <th className="text-right">Returned</th>
                    <th className="text-right">Pending</th>
                    <th className="text-right">Due Date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dcLoading ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-muted-foreground">
                        Loading DC WIP…
                      </td>
                    </tr>
                  ) : filteredDcs.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="text-center py-10 text-muted-foreground">
                        {(wipData as any[]).length === 0
                          ? "No open returnable DCs. All clear!"
                          : "No DCs match current search."}
                      </td>
                    </tr>
                  ) : (
                    filteredDcs.flatMap((row: any) => {
                      const lineItems: any[] = row.dc_line_items ?? [];
                      const isOverdue = row.return_before_date && row.return_before_date < today;
                      const rowBg = isOverdue ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-muted/30";

                      if (lineItems.length === 0) {
                        return [(
                          <tr key={row.id} className={`cursor-pointer transition-colors ${rowBg}`}
                              onClick={() => navigate(`/delivery-challans/${row.id}`)}>
                            <td className="font-mono text-xs font-medium">{row.dc_number}</td>
                            <td colSpan={9} className="text-sm text-muted-foreground">No line items</td>
                            <td className="text-right text-sm">
                              {row.return_before_date ? (() => {
                                const days = differenceInDays(new Date(row.return_before_date), new Date());
                                return (
                                  <span className={`text-xs font-medium ${days < 0 ? "text-red-600" : days <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                                  </span>
                                );
                              })() : '—'}
                            </td>
                            <td></td>
                          </tr>
                        )];
                      }

                      return lineItems.map((li: any, liIdx: number) => {
                        const qtySent = li.quantity ?? 0;
                        const qtyReturned = li.qty_received ?? 0;
                        const qtyPending = Math.max(0, qtySent - qtyReturned);
                        const isRework = li.is_rework;
                        const statusBadge = isRework
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">Rework Cycle {li.rework_cycle ?? 1}</span>
                          : isOverdue
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">Overdue</span>
                          : li.return_status === 'partially_returned'
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">Partial Return</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">At Vendor</span>;

                        const handleRowClick = () => {
                          if (li.item_id) {
                            navigate(`/component-journey?item_id=${li.item_id}&dc_ref=${row.dc_number}`);
                          } else {
                            navigate(`/delivery-challans/${row.id}`);
                          }
                        };

                        return (
                          <tr key={`${row.id}-${liIdx}`} className={`cursor-pointer transition-colors ${rowBg}`} onClick={handleRowClick}>
                            <td className="font-mono text-xs font-medium text-foreground">
                              {liIdx === 0 ? row.dc_number : ''}
                            </td>
                            <td className="font-mono text-xs text-blue-700">{li.drawing_number ?? '—'}</td>
                            <td className="text-sm max-w-[160px] truncate">{li.description ?? '—'}</td>
                            <td className="text-xs text-muted-foreground">
                              {li.stage_number ? `Stage ${li.stage_number}${li.stage_name ? `: ${li.stage_name}` : ''}` : '—'}
                            </td>
                            <td>
                              <StageProgressBar current={li.stage_number ?? null} total={li.total_stages ?? null} />
                            </td>
                            <td className="text-xs">{li.nature_of_process ?? '—'}</td>
                            <td className="text-sm">{liIdx === 0 ? (row.party_name ?? '—') : ''}</td>
                            <td className="text-right font-mono tabular-nums text-sm">{qtySent}</td>
                            <td className="text-right font-mono tabular-nums text-sm">{qtyReturned || '—'}</td>
                            <td className="text-right font-mono tabular-nums text-sm font-medium">{qtyPending}</td>
                            <td className="text-right">
                              {liIdx === 0 && row.return_before_date ? (() => {
                                const days = differenceInDays(new Date(row.return_before_date), new Date());
                                return (
                                  <span className={`text-xs font-medium ${days < 0 ? "text-red-600" : days <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                                    {days < 0 && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                                  </span>
                                );
                              })() : liIdx === 0 ? <span className="text-muted-foreground text-sm">—</span> : null}
                            </td>
                            <td>{statusBadge}</td>
                          </tr>
                        );
                      });
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
            <h2 className="text-sm font-semibold text-foreground">Production Runs</h2>
            <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
              {aoRows.length + saWorkOrders.length}
            </span>
          </div>

          {/* Sub-Assembly stat chips */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium text-xs ${
              aoRows.length > 0 ? "bg-blue-50 border border-blue-200 text-blue-800 shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600"
            }`}>
              <Layers className="h-3 w-3" /> {aoRows.length} in progress
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${
              aoOverdue > 0 ? "bg-red-50 border border-red-200 text-red-800 font-bold shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 font-medium"
            }`}>
              <AlertTriangle className="h-3 w-3" /> {aoOverdue} overdue
            </span>
          </div>

          {/* Sub-Assembly table */}
          <div className="paper-card !p-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
              <table className="w-full data-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>Run #</th>
                    <th>Item Being Built</th>
                    <th className="text-right">Qty to Build</th>
                    <th className="text-right">Serials</th>
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
                      <td colSpan={9} className="text-center py-10 text-muted-foreground">
                        Loading production runs…
                      </td>
                    </tr>
                  ) : filteredAo.length === 0 && saWorkOrders.filter((awo: any) => {
                      if (!search.trim()) return true;
                      const q = search.toLowerCase();
                      return awo.awo_number?.toLowerCase().includes(q) || awo.item_code?.toLowerCase().includes(q) || awo.item_description?.toLowerCase().includes(q);
                    }).length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10">
                        {aoRows.length === 0 && saWorkOrders.length === 0 ? (
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Layers className="h-8 w-8 opacity-30" />
                            <p>No production runs in progress.</p>
                            <Link
                              to="/assembly-orders"
                              className="text-primary text-sm flex items-center gap-1 hover:underline"
                            >
                              Go to Production <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">No production runs match current search.</span>
                        )}
                      </td>
                    </tr>
                  ) : (
                    <>
                    {filteredAo.map((ao) => (
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
                        <td className="text-right">
                          {(ao as any).serial_numbers_generated ? (
                            <span className="text-xs font-mono text-amber-700 font-medium">
                              {ao.quantity_to_build}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
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
                    ))}
                    {saWorkOrders.filter((awo: any) => {
                      if (!search.trim()) return true;
                      const q = search.toLowerCase();
                      return awo.awo_number?.toLowerCase().includes(q) || awo.item_code?.toLowerCase().includes(q) || awo.item_description?.toLowerCase().includes(q);
                    }).map((awo: any) => (
                      <tr
                        key={awo.id}
                        className="cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => navigate(`/assembly-work-orders/${awo.id}`)}
                      >
                        <td className="font-mono text-xs font-medium text-foreground">{awo.awo_number}</td>
                        <td>
                          <p className="font-medium text-sm leading-tight">{awo.item_code ?? "—"}</p>
                          {awo.item_description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[180px]">{awo.item_description}</p>
                          )}
                        </td>
                        <td className="text-right font-mono tabular-nums text-sm">{awo.quantity_to_build}</td>
                        <td className="text-right"><span className="text-muted-foreground text-sm">—</span></td>
                        <td className="font-mono text-sm text-muted-foreground">{awo.work_order_ref ?? "—"}</td>
                        <td className="text-sm">
                          {awo.planned_date ? format(parseISO(awo.planned_date), "dd MMM yyyy") : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="text-right">
                          <DaysInProgress createdAt={awo.created_at} />
                        </td>
                        <td><span className="text-muted-foreground text-sm">—</span></td>
                        <td>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${awo.status === 'pending_materials' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-blue-50 text-blue-800 border-blue-200'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${awo.status === 'pending_materials' ? 'bg-amber-500' : 'bg-blue-500 animate-pulse'}`} />
                            {awo.status === 'pending_materials' ? 'Pending Materials' : 'In Progress'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Finished Good WIP ── */}
      {showFinishedGood && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Factory className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Finished Good Work Orders</h2>
            <span className="bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
              {(fgWorkOrders as any[]).length}
            </span>
          </div>
          <div className="paper-card !p-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
              <table className="w-full data-table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th>WO Number</th>
                    <th>Serial Number</th>
                    <th>Item</th>
                    <th className="text-right">Qty</th>
                    <th>Raised By</th>
                    <th>Status</th>
                    <th>Planned Date</th>
                    <th className="text-right">Days Open</th>
                  </tr>
                </thead>
                <tbody>
                  {(fgWorkOrders as any[]).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-10">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Layers className="h-8 w-8 opacity-30" />
                          <p>No finished good work orders in progress.</p>
                          <Link
                            to="/finished-good-work-orders"
                            className="text-primary text-sm flex items-center gap-1 hover:underline"
                          >
                            Go to Finished Goods <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    (fgWorkOrders as any[]).map((awo: any) => {
                      const statusMap: Record<string, { label: string; cls: string }> = {
                        pending_materials: { label: "Pending Materials", cls: "bg-amber-100 text-amber-800 border-amber-200" },
                        in_progress: { label: "In Progress", cls: "bg-blue-100 text-blue-800 border-blue-200" },
                      };
                      const s = statusMap[awo.status] ?? { label: awo.status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
                      return (
                        <tr
                          key={awo.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => navigate(`/assembly-work-orders/${awo.id}`)}
                        >
                          <td className="font-mono text-xs font-medium text-foreground">{awo.awo_number}</td>
                          <td className="font-mono text-xs">{awo.serial_number ?? "—"}</td>
                          <td>
                            <p className="font-medium text-sm">{awo.item_code ?? "—"}</p>
                            {awo.item_description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{awo.item_description}</p>
                            )}
                          </td>
                          <td className="text-right font-mono tabular-nums text-sm">{awo.quantity_to_build}</td>
                          <td className="text-sm">{awo.raised_by ?? "—"}</td>
                          <td>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>
                              {s.label}
                            </span>
                          </td>
                          <td className="text-sm">
                            {awo.planned_date
                              ? format(parseISO(awo.planned_date), "dd MMM yyyy")
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="text-right">
                            <span className="flex items-center justify-end gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3.5 w-3.5 shrink-0" />
                              {differenceInDays(new Date(), parseISO(awo.created_at))}d
                            </span>
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

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center">
        Auto-refreshing every 30 seconds · Last updated: {lastRefreshed} · Click any row to open detail
      </p>
    </div>
  );
}
