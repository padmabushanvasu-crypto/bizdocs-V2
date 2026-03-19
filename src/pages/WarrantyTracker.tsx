import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchSerialNumbers } from "@/lib/fat-api";
import { exportMultiSheet } from "@/lib/export-utils";
import { format, differenceInDays } from "date-fns";

type WarrantyFilter = "all" | "active" | "expiring" | "expired";

export default function WarrantyTracker() {
  const [search, setSearch] = useState("");
  const [warrantyFilter, setWarrantyFilter] = useState<WarrantyFilter>("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["warranty-serial-numbers"],
    queryFn: () => fetchSerialNumbers({ pageSize: 500 }),
    refetchInterval: 60000,
  });

  const today = new Date().toISOString().split("T")[0];
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().split("T")[0];

  const allRows = (data?.data ?? []).filter((s) => s.dispatch_date || s.warranty_expiry);

  const filtered = useMemo(() => {
    let rows = allRows;
    if (warrantyFilter === "active") {
      rows = rows.filter((r) => r.warranty_expiry && r.warranty_expiry >= today);
    } else if (warrantyFilter === "expiring") {
      rows = rows.filter(
        (r) => r.warranty_expiry && r.warranty_expiry >= today && r.warranty_expiry <= in30Str
      );
    } else if (warrantyFilter === "expired") {
      rows = rows.filter((r) => r.warranty_expiry && r.warranty_expiry < today);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.serial_number.toLowerCase().includes(q) ||
          (r.item_code ?? "").toLowerCase().includes(q) ||
          (r.item_description ?? "").toLowerCase().includes(q) ||
          (r.customer_name ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [allRows, warrantyFilter, search, today, in30Str]);

  const handleExport = () => {
    exportMultiSheet(
      [
        {
          sheetName: "Warranty Tracker",
          columns: [
            { key: "serial_number", label: "Serial Number" },
            { key: "item_code", label: "Item Code" },
            { key: "item_description", label: "Description" },
            { key: "customer_name", label: "Customer" },
            { key: "dispatch_date", label: "Dispatch Date", type: "date" },
            { key: "warranty_months", label: "Warranty (Months)", type: "number" },
            { key: "warranty_expiry", label: "Expiry Date", type: "date" },
            { key: "status", label: "Status" },
          ],
          data: filtered.map((r) => ({ ...r })),
        },
      ],
      "Warranty_Tracker.xlsx"
    );
  };

  const getRowStyle = (expiry: string | null) => {
    if (!expiry) return "";
    if (expiry < today) return "bg-red-50/70";
    if (expiry <= in30Str) return "bg-amber-50/60";
    return "";
  };

  const getDaysRemaining = (expiry: string | null): string => {
    if (!expiry) return "—";
    const days = differenceInDays(new Date(expiry), new Date());
    if (days < 0) return `Expired ${Math.abs(days)}d ago`;
    if (days === 0) return "Expires today";
    return `${days}d remaining`;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">Warranty Tracker</h1>
            <p className="text-sm text-muted-foreground">
              {allRows.length} dispatched unit{allRows.length !== 1 ? "s" : ""} under warranty tracking
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-3.5 w-3.5 mr-1" /> Export Excel
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search serial number, item, customer..."
            className="pl-9"
          />
        </div>
        <Select value={warrantyFilter} onValueChange={(v) => setWarrantyFilter(v as WarrantyFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Units</SelectItem>
            <SelectItem value="active">Active Warranty</SelectItem>
            <SelectItem value="expiring">Expiring in 30 Days</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0 overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        ) : isError ? (
          <div className="py-12 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Unable to load warranty data</p>
            <p className="text-xs text-muted-foreground mt-1">The database table may not be set up yet. Run the Phase 8 migration to enable this feature.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No units found</p>
            <p className="text-xs text-muted-foreground mt-1">Dispatched serial numbers appear here once they have dispatch dates.</p>
          </div>
        ) : (
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Item</th>
                <th>Customer</th>
                <th>Dispatch Date</th>
                <th className="text-right">Warranty</th>
                <th>Expiry Date</th>
                <th>Status</th>
                <th>Days Remaining</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isExpired = row.warranty_expiry && row.warranty_expiry < today;
                const isExpiring = row.warranty_expiry && row.warranty_expiry >= today && row.warranty_expiry <= in30Str;
                return (
                  <tr key={row.id} className={getRowStyle(row.warranty_expiry)}>
                    <td className="font-mono font-semibold">{row.serial_number}</td>
                    <td>
                      <p className="font-medium text-sm">{row.item_description ?? "—"}</p>
                      {row.item_code && (
                        <p className="text-xs text-muted-foreground font-mono">{row.item_code}</p>
                      )}
                    </td>
                    <td className="text-sm">{row.customer_name ?? "—"}</td>
                    <td className="text-sm">
                      {row.dispatch_date ? format(new Date(row.dispatch_date), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="text-right text-sm">{row.warranty_months} months</td>
                    <td className="text-sm">
                      {row.warranty_expiry ? (
                        <span className={isExpired ? "text-red-700 font-semibold" : isExpiring ? "text-amber-700 font-semibold" : ""}>
                          {format(new Date(row.warranty_expiry), "dd MMM yyyy")}
                        </span>
                      ) : "—"}
                    </td>
                    <td>
                      {isExpired ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          Expired
                        </span>
                      ) : isExpiring ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          Expiring Soon
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          Active
                        </span>
                      )}
                    </td>
                    <td className={`text-sm font-mono ${isExpired ? "text-red-700" : isExpiring ? "text-amber-700" : "text-muted-foreground"}`}>
                      {getDaysRemaining(row.warranty_expiry)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
