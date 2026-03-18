import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  Factory,
  Truck,
  AlertTriangle,
  Download,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWipRegister, type WipEntry } from "@/lib/job-cards-api";
import { formatCurrency } from "@/lib/gst-utils";
import { exportToExcel } from "@/lib/export-utils";

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

export default function WipRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<"all" | "in_house" | "at_vendor">(
    (searchParams.get("location") as "in_house" | "at_vendor") ?? "all"
  );
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get("overdue") === "true");

  const { data: rows = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["wip-register"],
    queryFn: () => fetchWipRegister(),
    refetchInterval: 30000,
  });

  // Client-side filter (search, location, overdue)
  const filtered = useMemo(() => {
    let result = rows;
    if (locationFilter !== "all") {
      result = result.filter((r) => r.current_location === locationFilter);
    }
    if (overdueOnly) {
      result = result.filter((r) => r.is_overdue);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.jc_number?.toLowerCase().includes(q) ||
          r.item_code?.toLowerCase().includes(q) ||
          r.item_description?.toLowerCase().includes(q) ||
          r.current_vendor_name?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, locationFilter, overdueOnly, search]);

  const totalActive = rows.length;
  const atVendor = rows.filter((r) => r.current_location === "at_vendor").length;
  const overdueCount = rows.filter((r) => r.is_overdue).length;
  const inHouse = rows.filter((r) => r.current_location === "in_house").length;

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { timeStyle: "short" })
    : "—";

  const handleExport = () => {
    exportToExcel(
      [
        {
          sheetName: "WIP Register",
          columns: [
            { key: "jc_number", label: "JC Number", type: "text", width: 14 },
            { key: "item_code", label: "Item Code", type: "text", width: 12 },
            { key: "item_description", label: "Description", type: "text", width: 28 },
            { key: "status", label: "Status", type: "text", width: 12 },
            { key: "current_location", label: "Location", type: "text", width: 12 },
            { key: "current_vendor_name", label: "Vendor", type: "text", width: 20 },
            { key: "current_step_name", label: "Current Step", type: "text", width: 22 },
            { key: "expected_return_date", label: "Expected Return", type: "date", width: 16 },
            { key: "days_at_vendor", label: "Days at Vendor", type: "number", width: 14 },
            { key: "days_overdue", label: "Days Overdue", type: "number", width: 13 },
            { key: "quantity_accepted", label: "Qty", type: "number", width: 8 },
            { key: "total_cost", label: "Running Cost", type: "currency", width: 14 },
            { key: "days_active", label: "Days Active", type: "number", width: 12 },
          ],
          data: filtered,
        },
      ],
      "WIP_Register"
    );
  };

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
            Work in progress — active job cards only
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          className="paper-card cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => setLocationFilter("all")}
        >
          <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Total Active</p>
          <p className="text-2xl font-bold font-mono mt-1">{totalActive}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Job Cards</p>
        </div>
        <div
          className="paper-card cursor-pointer hover:border-amber-400 transition-colors"
          onClick={() => setLocationFilter("at_vendor")}
        >
          <div className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-amber-600" />
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider">At Vendors</p>
          </div>
          <p className="text-2xl font-bold font-mono mt-1 text-amber-700">{atVendor}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Job Cards</p>
        </div>
        <div
          className={`paper-card cursor-pointer transition-colors ${overdueCount > 0 ? "border-l-4 border-l-destructive hover:border-destructive/70" : "hover:border-primary/40"}`}
          onClick={() => { setOverdueOnly(true); setLocationFilter("all"); }}
        >
          <div className="flex items-center gap-1.5">
            <AlertTriangle className={`h-3.5 w-3.5 ${overdueCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Overdue Returns</p>
          </div>
          <p className={`text-2xl font-bold font-mono mt-1 ${overdueCount > 0 ? "text-destructive" : ""}`}>{overdueCount}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Past expected date</p>
        </div>
        <div
          className="paper-card cursor-pointer hover:border-blue-300 transition-colors"
          onClick={() => setLocationFilter("in_house")}
        >
          <div className="flex items-center gap-1.5">
            <Factory className="h-3.5 w-3.5 text-blue-600" />
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider">In House</p>
          </div>
          <p className="text-2xl font-bold font-mono mt-1 text-blue-700">{inHouse}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Job Cards</p>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search JC number, item, vendor…"
          className="h-9 w-64 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {/* Location pills */}
        <div className="flex gap-1.5">
          {(["all", "in_house", "at_vendor"] as const).map((loc) => {
            const labels = { all: "All", in_house: "In House", at_vendor: "At Vendor" };
            const colours = {
              all: "bg-muted text-foreground",
              in_house: "bg-blue-100 text-blue-800 border border-blue-200",
              at_vendor: "bg-amber-100 text-amber-800 border border-amber-200",
            };
            return (
              <button
                key={loc}
                onClick={() => setLocationFilter(loc)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${colours[loc]} ${locationFilter === loc ? "ring-2 ring-offset-1 ring-foreground/30" : "opacity-70 hover:opacity-100"}`}
              >
                {labels[loc]}
              </button>
            );
          })}
        </div>

        {/* Overdue toggle */}
        <button
          onClick={() => setOverdueOnly(!overdueOnly)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${overdueOnly ? "bg-red-100 text-red-800 border-red-200 ring-2 ring-offset-1 ring-red-400/40" : "bg-muted text-foreground border-border opacity-70 hover:opacity-100"}`}
        >
          Overdue only {overdueCount > 0 && `(${overdueCount})`}
        </button>
      </div>

      {/* Table */}
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
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-muted-foreground">
                    Loading WIP register…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-muted-foreground">
                    {rows.length === 0
                      ? "No active job cards. All clear!"
                      : "No job cards match current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
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
                          <p className="text-[10px] text-muted-foreground/70">
                            Batch: {row.batch_ref}
                          </p>
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
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
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

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center">
        Auto-refreshing every 30 seconds · Last updated: {lastRefreshed} · Click any row to open Job Card
      </p>
    </div>
  );
}
