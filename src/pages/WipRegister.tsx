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
import { exportMultiSheet } from "@/lib/export-utils";
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

// ── Stage progress dots ───────────────────────────────────────────────────────

function StageProgressBar({
  current,
  total,
  stageName,
}: {
  current: number | null;
  total: number | null;
  stageName?: string | null;
}) {
  if (!total || total <= 1) return <span className="text-muted-foreground text-xs">—</span>;
  const cur = current ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: total }).map((_, i) => {
        const stageNum = i + 1;
        const done   = stageNum < cur;
        const active = stageNum === cur;
        const tooltip =
          active && stageName
            ? `Step ${stageNum} of ${total} — ${stageName}`
            : `Step ${stageNum} of ${total}`;
        return (
          <div key={i} className="flex items-center" title={tooltip}>
            <div
              className={`h-2 w-2 rounded-full shrink-0 cursor-default ${
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

  // Sub-assembly WIP (new AWO system — draft + pending_materials + in_progress)
  const { data: saWorkOrders = [], isLoading: saLoading } = useQuery({
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
        .in("status", ["draft", "pending_materials", "in_progress"])
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

  // Filtered sub-assembly WIP
  const filteredSaWorkOrders = useMemo(() => {
    if (!search.trim()) return saWorkOrders as any[];
    const q = search.toLowerCase();
    return (saWorkOrders as any[]).filter(
      (awo: any) =>
        awo.awo_number?.toLowerCase().includes(q) ||
        awo.item_code?.toLowerCase().includes(q) ||
        awo.item_description?.toLowerCase().includes(q) ||
        awo.work_order_ref?.toLowerCase().includes(q)
    );
  }, [saWorkOrders, search]);

  // Summary stats
  const today = new Date().toISOString().split("T")[0];
  const overdueCount = (wipData as any[]).filter((r: any) => r.return_before_date && r.return_before_date < today).length;
  const saOverdue = (saWorkOrders as any[]).filter((awo: any) => awo.planned_date && awo.planned_date < today).length;

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { timeStyle: "short" })
    : "—";

  const handleExport = () => {
    exportMultiSheet(
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
            { key: "awo_number",         label: "WO Number",         type: "text",   width: 14 },
            { key: "item_code",          label: "Item Code",         type: "text",   width: 12 },
            { key: "item_description",   label: "Item Being Built",  type: "text",   width: 28 },
            { key: "quantity_to_build",  label: "Qty to Build",      type: "number", width: 12 },
            { key: "status",             label: "Status",            type: "text",   width: 18 },
            { key: "work_order_ref",     label: "Work Order Ref",    type: "text",   width: 16 },
            { key: "planned_date",       label: "Planned Date",      type: "date",   width: 14 },
          ],
          data: filteredSaWorkOrders,
        },
      ],
      "WIP_Register.xlsx"
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
            { value: "all",          label: "All WIP",           color: "#0F172A", count: (wipData as any[]).length + (saWorkOrders as any[]).length },
            { value: "component",    label: "Component WIP",     color: "#2563EB", count: (wipData as any[]).length },
            { value: "subassembly",  label: "Sub-Assembly WIP",  color: "#0F766E", count: (saWorkOrders as any[]).length },
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
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">DC Number</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Stage</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Progress</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Process</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Vendor</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty Sent</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Returned</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Pending</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Due Date</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dcLoading ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-8 text-center text-sm text-slate-400">
                        Loading DC WIP…
                      </td>
                    </tr>
                  ) : filteredDcs.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-8 text-center text-sm text-slate-400">
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
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{row.dc_number}</td>
                            <td colSpan={9} className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">No line items</td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right">
                              {row.return_before_date ? (() => {
                                const days = differenceInDays(new Date(row.return_before_date), new Date());
                                return (
                                  <span className={`text-xs font-medium ${days < 0 ? "text-red-600" : days <= 7 ? "text-amber-600" : "text-slate-600"}`}>
                                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                                  </span>
                                );
                              })() : '—'}
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center"></td>
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
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">
                              {liIdx === 0 ? row.dc_number : ''}
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-blue-700">{li.drawing_number ?? '—'}</td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left max-w-[160px] truncate">{li.description ?? '—'}</td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">
                              {li.stage_number ? `Stage ${li.stage_number}${li.stage_name ? `: ${li.stage_name}` : ''}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                              <StageProgressBar current={li.stage_number ?? null} total={li.total_stages ?? null} stageName={li.stage_name} />
                            </td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{li.nature_of_process ?? '—'}</td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{liIdx === 0 ? (row.party_name ?? '—') : ''}</td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{qtySent}</td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{qtyReturned || '—'}</td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono font-medium">{qtyPending}</td>
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right">
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
                            <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">{statusBadge}</td>
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
              {(saWorkOrders as any[]).length}
            </span>
          </div>

          {/* Sub-Assembly stat chips */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-medium text-xs ${
              (saWorkOrders as any[]).filter((a: any) => a.status === 'in_progress').length > 0 ? "bg-blue-50 border border-blue-200 text-blue-800 shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600"
            }`}>
              <Layers className="h-3 w-3" /> {(saWorkOrders as any[]).filter((a: any) => a.status === 'in_progress').length} in progress
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${
              saOverdue > 0 ? "bg-red-50 border border-red-200 text-red-800 font-bold shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600 font-medium"
            }`}>
              <AlertTriangle className="h-3 w-3" /> {saOverdue} overdue
            </span>
          </div>

          {/* Sub-Assembly table */}
          <div className="paper-card !p-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Run #</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item Being Built</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty to Build</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Serials</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Work Order Ref</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Planned Date</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Days in Progress</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Components Ready</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {saLoading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">
                        Loading production runs…
                      </td>
                    </tr>
                  ) : filteredSaWorkOrders.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10">
                        {(saWorkOrders as any[]).length === 0 ? (
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Layers className="h-8 w-8 opacity-30" />
                            <p>No production runs in progress.</p>
                            <Link
                              to="/sub-assembly-work-orders"
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
                    filteredSaWorkOrders.map((awo: any) => {
                      const statusCls =
                        awo.status === 'draft'
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : awo.status === 'pending_materials'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-blue-50 text-blue-800 border-blue-200';
                      const dotCls =
                        awo.status === 'draft'
                          ? 'bg-slate-400'
                          : awo.status === 'pending_materials'
                          ? 'bg-amber-500'
                          : 'bg-blue-500 animate-pulse';
                      const statusLabel =
                        awo.status === 'draft'
                          ? 'Draft'
                          : awo.status === 'pending_materials'
                          ? 'Pending Materials'
                          : 'In Progress';
                      return (
                        <tr
                          key={awo.id}
                          className="cursor-pointer hover:bg-muted/30 transition-colors"
                          onClick={() => navigate(`/assembly-work-orders/${awo.id}`)}
                        >
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{awo.awo_number}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                            <p className="font-medium leading-tight">{awo.item_code ?? "—"}</p>
                            {awo.item_description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[180px]">{awo.item_description}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{awo.quantity_to_build}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right"><span className="text-muted-foreground text-sm">—</span></td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-muted-foreground">{awo.work_order_ref ?? "—"}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                            {awo.planned_date ? format(parseISO(awo.planned_date), "dd MMM yyyy") : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right">
                            <DaysInProgress createdAt={awo.created_at} />
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left"><span className="text-muted-foreground text-sm">—</span></td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCls}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${dotCls}`} />
                              {statusLabel}
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
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">WO Number</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial Number</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Qty</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Raised By</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Planned Date</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-right">Days Open</th>
                  </tr>
                </thead>
                <tbody>
                  {(fgWorkOrders as any[]).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">
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
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{awo.awo_number}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{awo.serial_number ?? "—"}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                            <p className="font-medium">{awo.item_code ?? "—"}</p>
                            {awo.item_description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[160px]">{awo.item_description}</p>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right tabular-nums font-mono">{awo.quantity_to_build}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{awo.raised_by ?? "—"}</td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>
                              {s.label}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                            {awo.planned_date
                              ? format(parseISO(awo.planned_date), "dd MMM yyyy")
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-right">
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
