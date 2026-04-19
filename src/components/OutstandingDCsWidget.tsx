import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OutstandingDC {
  id: string;
  dc_number: string;
  status: string;
  created_at: string;
  party_name: string | null;
  party_email: string | null;
  party_phone: string | null;
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

async function fetchOutstandingDCs(companyId: string): Promise<OutstandingDC[]> {
  // delivery_challans uses party_id as FK to parties
  const { data: dcs, error } = await (supabase as any)
    .from("delivery_challans")
    .select(`
      id, dc_number, status, created_at, party_name,
      parties:party_id ( email1, phone1 )
    `)
    .eq("company_id", companyId)
    .in("status", ["draft", "issued"])
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (dcs ?? []).map((row: any) => ({
    id: row.id,
    dc_number: row.dc_number,
    status: row.status,
    created_at: row.created_at,
    party_name: row.party_name ?? null,
    party_email: row.parties?.email1 ?? null,
    party_phone: row.parties?.phone1 ?? null,
  }));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, string> = {
  draft:   "bg-slate-100 text-slate-600",
  issued:  "bg-blue-100 text-blue-700",
};

const STATUS_LABEL: Record<string, string> = {
  draft:   "Draft",
  issued:  "Issued",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
}

async function exportToExcel(rows: OutstandingDC[]) {
  const XLSX = await import("xlsx-js-style");
  const sheetData = [
    ["DC Number", "Job Worker", "Email", "Phone", "Status", "Created Date"],
    ...rows.map((r) => [
      r.dc_number,
      r.party_name ?? "",
      r.party_email ?? "",
      r.party_phone ?? "",
      STATUS_LABEL[r.status] ?? r.status,
      formatDate(r.created_at),
    ]),
  ];
  const ws = (XLSX as any).utils.aoa_to_sheet(sheetData);
  const wb = (XLSX as any).utils.book_new();
  (XLSX as any).utils.book_append_sheet(wb, ws, "Outstanding DCs");
  (XLSX as any).writeFile(wb, `outstanding_dcs_${new Date().toISOString().slice(0, 10)}.xlsx`);
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

export function OutstandingDCsWidget({ companyId }: Props) {
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
    queryKey: ["outstanding-dcs", companyId],
    queryFn: () => fetchOutstandingDCs(companyId),
    staleTime: 5 * 60 * 1000,
    enabled: !!companyId,
  });

  return (
    <div className="rounded-xl flex flex-col relative overflow-hidden" style={glowBox(16, 185, 129, isDark)}>
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-display font-semibold text-foreground">
          Outstanding Job Work Orders
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
          No outstanding job work orders
        </div>
      ) : (
        <div className="relative max-h-72 overflow-y-auto overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ background: isDark ? "#0A0F1C" : "white" }}>DC #</th>
                <th className="sticky top-0 z-10 border-b border-border px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide" style={{ background: isDark ? "#0A0F1C" : "white" }}>Job Worker</th>
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
                      onClick={() => navigate(`/delivery-challans/${row.id}`)}
                    >
                      {row.dc_number}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs font-body text-foreground max-w-[120px] truncate">
                    {row.party_name ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs font-body">
                    {row.party_email ? (
                      <a href={`mailto:${row.party_email}`} className="text-primary hover:underline">{row.party_email}</a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs font-body">
                    {row.party_phone ? (
                      <a href={`tel:${row.party_phone}`} className="text-primary hover:underline">{row.party_phone}</a>
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
