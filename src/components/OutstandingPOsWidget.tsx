import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutstandingPO {
  id: string;
  po_number: string;
  status: string;
  created_at: string;
  vendor_name: string | null;
  vendor_email: string | null;
  vendor_phone: string | null;
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchOutstandingPOs(companyId: string): Promise<OutstandingPO[]> {
  // Fetch open POs with party contact details via vendor_id → parties join
  const { data: pos, error } = await (supabase as any)
    .from("purchase_orders")
    .select(`
      id, po_number, status, created_at, vendor_name,
      parties:vendor_id ( email1, phone1 )
    `)
    .eq("company_id", companyId)
    .in("status", ["draft", "approved", "issued", "partially_received"])
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (pos ?? []).map((row: any) => ({
    id: row.id,
    po_number: row.po_number,
    status: row.status,
    created_at: row.created_at,
    vendor_name: row.vendor_name ?? null,
    vendor_email: row.parties?.email1 ?? null,
    vendor_phone: row.parties?.phone1 ?? null,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:               "bg-slate-100 text-slate-600",
  issued:              "bg-blue-100 text-blue-700",
  partially_received:  "bg-amber-100 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  draft:               "Draft",
  issued:              "Issued",
  partially_received:  "Partial",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

async function exportToExcel(rows: OutstandingPO[]) {
  const XLSX = await import("xlsx-js-style");
  const sheetData = [
    ["PO Number", "Vendor", "Email", "Phone", "Status", "Created Date"],
    ...rows.map((r) => [
      r.po_number,
      r.vendor_name ?? "",
      r.vendor_email ?? "",
      r.vendor_phone ?? "",
      STATUS_LABEL[r.status] ?? r.status,
      formatDate(r.created_at),
    ]),
  ];
  const ws = (XLSX as any).utils.aoa_to_sheet(sheetData);
  const wb = (XLSX as any).utils.book_new();
  (XLSX as any).utils.book_append_sheet(wb, ws, "Outstanding POs");
  (XLSX as any).writeFile(wb, `outstanding_pos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ─── Glow-box card style ──────────────────────────────────────────────────────

function glowBox(r: number, g: number, b: number, dark: boolean) {
  if (dark) {
    return {
      background: "#0A0F1C",
      backgroundImage: [
        `radial-gradient(140% 90% at 100% 100%, rgba(${r},${g},${b},0.22), transparent 55%)`,
        "linear-gradient(180deg, rgba(255,255,255,0.025), transparent 30%)",
      ].join(", "),
      boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset, 0 10px 30px -12px rgba(0,0,0,0.6)",
      border: "1px solid rgba(255,255,255,0.06)",
    };
  }
  return {
    background: "white",
    backgroundImage: [
      `radial-gradient(140% 90% at 100% 100%, rgba(${r},${g},${b},0.10), transparent 55%)`,
      `linear-gradient(180deg, rgba(${r},${g},${b},0.04), transparent 30%)`,
    ].join(", "),
    boxShadow: `0 1px 3px rgba(0,0,0,0.08), 0 4px 16px -4px rgba(${r},${g},${b},0.15)`,
    border: "1px solid rgba(148,163,184,0.8)",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  companyId: string;
}

export function OutstandingPOsWidget({ companyId }: Props) {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["outstanding-pos", companyId],
    queryFn: () => fetchOutstandingPOs(companyId),
    staleTime: 5 * 60 * 1000,
    enabled: !!companyId,
  });

  return (
    <div className="rounded-xl flex flex-col relative overflow-hidden" style={glowBox(59, 130, 246, isDark)}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-display font-semibold text-foreground">
          Outstanding Purchase Orders
          {!isLoading && rows.length > 0 && (
            <span className="ml-2 text-xs font-mono font-normal text-muted-foreground">({rows.length})</span>
          )}
        </h2>
        {rows.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2 gap-1"
            onClick={() => exportToExcel(rows)}
          >
            <Download className="h-3 w-3" />
            Export
          </Button>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          No outstanding purchase orders
        </div>
      ) : (
        <div className="relative max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ background: isDark ? "#0A0F1C" : "white" }}>PO #</th>
                <th className="sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ background: isDark ? "#0A0F1C" : "white" }}>Vendor</th>
                <th className="sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ background: isDark ? "#0A0F1C" : "white" }}>Email</th>
                <th className="sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ background: isDark ? "#0A0F1C" : "white" }}>Phone</th>
                <th className="sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ background: isDark ? "#0A0F1C" : "white" }}>Status</th>
                <th className="sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ background: isDark ? "#0A0F1C" : "white" }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={row.id} className={`border-b border-border/50 ${idx % 2 === 1 ? "bg-muted/30" : ""}`}>
                  <td className="px-3 py-2">
                    <button
                      className="font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors text-left"
                      onClick={() => navigate(`/purchase-orders/${row.id}`)}
                    >
                      {row.po_number}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs font-body text-foreground max-w-[120px] truncate">
                    {row.vendor_name ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs font-body">
                    {row.vendor_email ? (
                      <a href={`mailto:${row.vendor_email}`} className="text-primary hover:underline">{row.vendor_email}</a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs font-body">
                    {row.vendor_phone ? (
                      <a href={`tel:${row.vendor_phone}`} className="text-primary hover:underline">{row.vendor_phone}</a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${STATUS_BADGE[row.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-muted-foreground tabular-nums">
                    {formatDate(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
