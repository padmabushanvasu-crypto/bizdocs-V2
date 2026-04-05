import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Package2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

interface AssetRow {
  id: string;
  item_code: string;
  description: string;
  classification_name: string;
  classification_color: string;
  standard_cost: number | null;
  created_at: string;
  status: string;
}

async function fetchAssets(): Promise<AssetRow[]> {
  const companyId = await getCompanyId();
  if (!companyId) return [];
  // Fetch items whose custom_classification has affects_stock = false
  const { data: classifData, error: classifError } = await (supabase as any)
    .from("item_classifications")
    .select("id, name, color")
    .eq("affects_stock", false)
    .or(`is_system.eq.true,company_id.eq.${companyId}`);
  if (classifError) throw classifError;
  const classifIds = (classifData ?? []).map((c: any) => c.id as string);
  if (classifIds.length === 0) return [];
  const classifMap = Object.fromEntries((classifData ?? []).map((c: any) => [c.id, { name: c.name, color: c.color }]));

  const { data, error } = await (supabase as any)
    .from("items")
    .select("id, item_code, description, standard_cost, created_at, status, custom_classification_id")
    .eq("company_id", companyId)
    .in("custom_classification_id", classifIds)
    .order("item_code", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    id: item.id,
    item_code: item.item_code,
    description: item.description,
    classification_name: classifMap[item.custom_classification_id]?.name ?? "Asset",
    classification_color: classifMap[item.custom_classification_id]?.color ?? "64748B",
    standard_cost: item.standard_cost,
    created_at: item.created_at,
    status: item.status,
  }));
}

const STATUS_OPTIONS = ["Ordered", "Received", "In Use", "Retired"];
const statusClass: Record<string, string> = {
  "Ordered": "bg-amber-50 text-amber-700 border border-amber-200",
  "Received": "bg-green-50 text-green-700 border border-green-200",
  "In Use": "bg-blue-50 text-blue-700 border border-blue-200",
  "Retired": "bg-slate-100 text-slate-500 border border-slate-200",
};

export default function AssetsRegister() {
  const navigate = useNavigate();
  const [assetStatus, setAssetStatus] = useState<Record<string, string>>({});

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["assets-register"],
    queryFn: fetchAssets,
  });

  const getStatus = (id: string) => assetStatus[id] ?? "Received";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package2 className="h-6 w-6" /> Assets Register
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Items classified as assets — tools, equipment, and other non-stock items
          </p>
        </div>
      </div>

      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Item Code</th>
                <th>Description</th>
                <th>Classification</th>
                <th className="text-right">Cost ₹</th>
                <th>Added</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
              ) : assets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <Package2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No assets found</p>
                    <p className="text-xs text-muted-foreground mt-1">Items with a classification where Affects Stock = No will appear here.</p>
                  </td>
                </tr>
              ) : (
                assets.map(asset => (
                  <tr key={asset.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/items`)}>
                    <td className="font-mono text-xs font-medium">{asset.item_code}</td>
                    <td className="font-medium">{asset.description}</td>
                    <td>
                      <span className="flex items-center gap-1.5 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: `#${asset.classification_color}` }} />
                        {asset.classification_name}
                      </span>
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {asset.standard_cost != null ? `₹${Number(asset.standard_cost).toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="text-muted-foreground text-sm">
                      {new Date(asset.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <select
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer ${statusClass[getStatus(asset.id)]}`}
                        value={getStatus(asset.id)}
                        onChange={e => setAssetStatus(prev => ({ ...prev, [asset.id]: e.target.value }))}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
