import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Truck, PackageCheck } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockHealth {
  critical: number;
  actioned: number;
  healthy: number;
  total: number;
}

interface POPipeline {
  total: number;
  draft: number;
  issued: number;
  partial: number;
}

interface DCStatus {
  total: number;
  issued: number;
  draft: number;
  overdue: number;
}

interface GRNPending {
  total: number;
  fullyPending: number;
  partial: number;
}

interface OperationalData {
  stockHealth: StockHealth;
  poPipeline: POPipeline;
  dcStatus: DCStatus;
  grnPending: GRNPending;
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchOperationalData(companyId: string): Promise<OperationalData> {
  const today = new Date().toISOString().split("T")[0];

  const [itemsRes, openPOsRes, openDCsRes, grnPendingRes] = await Promise.all([
    (supabase as any)
      .from("items")
      .select("id, current_stock, stock_free, min_stock")
      .eq("company_id", companyId)
      .gt("min_stock", 0)
      .neq("item_type", "service"),

    (supabase as any)
      .from("purchase_orders")
      .select("id, status")
      .eq("company_id", companyId)
      .not("status", "in", '("cancelled","completed","deleted")'),

    (supabase as any)
      .from("delivery_challans")
      .select("id, status, expected_return_date")
      .eq("company_id", companyId)
      .in("status", ["draft", "issued"]),

    (supabase as any)
      .from("purchase_orders")
      .select("id, status")
      .eq("company_id", companyId)
      .in("status", ["issued", "partially_received"]),
  ]);

  // PO item IDs for stock-health "actioned" detection
  const openPOs = (openPOsRes.data ?? []) as { id: string; status: string }[];
  const openPOIds = openPOs.map((p) => p.id);
  let poItemIds = new Set<string>();

  if (openPOIds.length > 0) {
    const { data: poLines } = await (supabase as any)
      .from("po_line_items")
      .select("item_id")
      .in("po_id", openPOIds)
      .not("item_id", "is", null);
    (poLines ?? []).forEach((l: any) => {
      if (l.item_id) poItemIds.add(l.item_id);
    });
  }

  // Stock health
  const items = (itemsRes.data ?? []) as { id: string; current_stock: number; stock_free: number | null; min_stock: number }[];
  const belowMin = items.filter((i) => (i.stock_free ?? i.current_stock ?? 0) < (i.min_stock ?? 0));
  const critical = belowMin.filter((i) => !poItemIds.has(i.id)).length;
  const actioned = belowMin.filter((i) => poItemIds.has(i.id)).length;
  const healthy  = items.length - belowMin.length;

  // PO Pipeline
  const poDraft   = openPOs.filter((p) => p.status === "draft").length;
  const poIssued  = openPOs.filter((p) => p.status === "issued").length;
  const poPartial = openPOs.filter((p) => p.status === "partially_received").length;

  // DC Status
  const openDCs  = (openDCsRes.data ?? []) as { id: string; status: string; expected_return_date: string | null }[];
  const dcIssued  = openDCs.filter((d) => d.status === "issued").length;
  const dcDraft   = openDCs.filter((d) => d.status === "draft").length;
  const dcOverdue = openDCs.filter(
    (d) => d.status === "issued" && d.expected_return_date && d.expected_return_date < today
  ).length;

  // GRN Pending
  const grnRows       = (grnPendingRes.data ?? []) as { id: string; status: string }[];
  const grnFullyPending = grnRows.filter((p) => p.status === "issued").length;
  const grnPartialRow   = grnRows.filter((p) => p.status === "partially_received").length;

  return {
    stockHealth: { critical, actioned, healthy, total: items.length },
    poPipeline:  { total: openPOs.length, draft: poDraft, issued: poIssued, partial: poPartial },
    dcStatus:    { total: openDCs.length, issued: dcIssued, draft: dcDraft, overdue: dcOverdue },
    grnPending:  { total: grnRows.length, fullyPending: grnFullyPending, partial: grnPartialRow },
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SubRow({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className={`text-[10px] font-mono font-semibold tabular-nums ${highlight ? "text-destructive" : "text-slate-600"}`}>
        {value}
      </span>
    </div>
  );
}

function AllClear() {
  return <p className="text-[10px] text-green-600 font-medium mt-1">All clear</p>;
}

// Donut slice colours — recharts requires concrete colour values in SVG fill attrs,
// so we use the standard Tailwind palette values rather than CSS variables.
const DONUT_COLOURS = {
  critical: "#ef4444", // red-500
  actioned: "#f59e0b", // amber-500
  healthy:  "#22c55e", // green-500
  empty:    "#e2e8f0", // slate-200
};

function StockHealthCard({ data }: { data: StockHealth }) {
  const hasData = data.total > 0;

  const donutData = hasData
    ? [
        { name: "Critical", value: data.critical, color: DONUT_COLOURS.critical },
        { name: "Actioned", value: data.actioned, color: DONUT_COLOURS.actioned },
        { name: "Healthy",  value: data.healthy,  color: DONUT_COLOURS.healthy },
      ].filter((d) => d.value > 0)
    : [{ name: "Empty", value: 1, color: DONUT_COLOURS.empty }];

  return (
    <div className="bg-card rounded-lg border border-border border-l-4 border-l-primary shadow-subtle p-4 flex flex-col gap-2 overflow-hidden">
      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-display font-semibold">
        Stock Health
      </p>

      {/* Donut — centred */}
      <div className="flex justify-center">
        <div className="relative" style={{ width: 80, height: 80 }}>
          <PieChart width={80} height={80} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={donutData}
              cx={40}
              cy={40}
              innerRadius={22}
              outerRadius={34}
              dataKey="value"
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
            >
              {donutData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] font-mono font-bold text-slate-800 tabular-nums">
              {data.total}
            </span>
          </div>
        </div>
      </div>

      {/* Legend — 3-column grid */}
      <div className="grid grid-cols-3 gap-x-1 gap-y-0.5">
        <div className="flex flex-col items-center gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: DONUT_COLOURS.critical }} />
          <span className="text-[9px] text-muted-foreground leading-none">Critical</span>
          <span className="text-[10px] font-mono font-bold text-destructive tabular-nums">{data.critical}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: DONUT_COLOURS.actioned }} />
          <span className="text-[9px] text-muted-foreground leading-none">Actioned</span>
          <span className="text-[10px] font-mono font-bold text-amber-600 tabular-nums">{data.actioned}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: DONUT_COLOURS.healthy }} />
          <span className="text-[9px] text-muted-foreground leading-none">Healthy</span>
          <span className="text-[10px] font-mono font-bold text-green-600 tabular-nums">{data.healthy}</span>
        </div>
      </div>
    </div>
  );
}

function POPipelineCard({ data }: { data: POPipeline }) {
  return (
    <div className="bg-card rounded-lg border border-border border-l-4 border-l-blue-500 shadow-subtle p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-display font-semibold">
          PO Pipeline
        </p>
        <ShoppingCart className="h-3.5 w-3.5 text-blue-400" />
      </div>
      <p className={`text-2xl font-mono font-extrabold tabular-nums leading-none ${data.total > 0 ? "text-blue-600" : "text-slate-400"}`}>
        {data.total}
      </p>
      {data.total === 0 ? (
        <AllClear />
      ) : (
        <div className="space-y-0.5">
          <SubRow label="Draft"              value={data.draft}   />
          <SubRow label="Issued"             value={data.issued}  />
          <SubRow label="Partially received" value={data.partial} />
        </div>
      )}
    </div>
  );
}

function DCStatusCard({ data }: { data: DCStatus }) {
  return (
    <div className="bg-card rounded-lg border border-border border-l-4 border-l-amber-500 shadow-subtle p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-display font-semibold">
          DC / Job Work
        </p>
        <Truck className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <p className={`text-2xl font-mono font-extrabold tabular-nums leading-none ${data.total > 0 ? "text-amber-600" : "text-slate-400"}`}>
        {data.total}
      </p>
      {data.total === 0 ? (
        <AllClear />
      ) : (
        <div className="space-y-0.5">
          <SubRow label="Out with job workers" value={data.issued}  />
          <SubRow label="Draft (not sent)"     value={data.draft}   />
          <SubRow label="Overdue"              value={data.overdue} highlight={data.overdue > 0} />
        </div>
      )}
    </div>
  );
}

function GRNPendingCard({ data }: { data: GRNPending }) {
  return (
    <div className="bg-card rounded-lg border border-border border-l-4 border-l-emerald-500 shadow-subtle p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-display font-semibold">
          GRN Pending
        </p>
        <PackageCheck className="h-3.5 w-3.5 text-emerald-400" />
      </div>
      <p className={`text-2xl font-mono font-extrabold tabular-nums leading-none ${data.total > 0 ? "text-emerald-600" : "text-slate-400"}`}>
        {data.total}
      </p>
      {data.total === 0 ? (
        <AllClear />
      ) : (
        <div className="space-y-0.5">
          <SubRow label="Awaiting first delivery" value={data.fullyPending} />
          <SubRow label="Partially received"      value={data.partial}      />
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card rounded-lg border border-border shadow-subtle p-4 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-12" />
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-4/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  companyId: string;
}

export function OperationalSummaryStrip({ companyId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["operational-summary", companyId],
    queryFn: () => fetchOperationalData(companyId),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: !!companyId,
  });

  if (isLoading) return <LoadingSkeleton />;
  if (!data) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StockHealthCard data={data.stockHealth} />
      <POPipelineCard  data={data.poPipeline}  />
      <DCStatusCard    data={data.dcStatus}    />
      <GRNPendingCard  data={data.grnPending}  />
    </div>
  );
}
