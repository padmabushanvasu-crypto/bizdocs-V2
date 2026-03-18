import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Edit, Eye, MoreHorizontal, UserX, Users as UsersIcon, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchParties, deactivateParty, createParty, type PartiesFilters } from "@/lib/parties-api";
import { useToast } from "@/hooks/use-toast";
import ImportDialog from "@/components/ImportDialog";
import { PARTIES_IMPORT_CONFIG, type ValidatedRow } from "@/lib/import-utils";
import { exportToExcel, PARTIES_EXPORT_COLS } from "@/lib/export-utils";
import { validateGSTIN } from "@/lib/indian-states";
import { INDIAN_STATES } from "@/lib/indian-states";

const typeFilters = [
  { label: "All", value: "all" as const },
  { label: "Vendors", value: "vendor" as const },
  { label: "Customers", value: "customer" as const },
  { label: "Both", value: "both" as const },
];

const statusFilters = [
  { label: "Active", value: "active" as const },
  { label: "Inactive", value: "inactive" as const },
  { label: "All", value: "all" as const },
];

const typeBadge: Record<string, string> = {
  vendor: "bg-blue-50 text-blue-700 border border-blue-200",
  customer: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  both: "bg-violet-50 text-violet-700 border border-violet-200",
};

export default function PartiesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);
  const [filters, setFilters] = useState<PartiesFilters>({
    search: "",
    type: "all",
    status: "active",
    page: 1,
    pageSize: 20,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["parties", filters],
    queryFn: () => fetchParties(filters),
  });

  const parties = data?.data ?? [];
  const totalCount = data?.count ?? 0;
  const totalPages = Math.ceil(totalCount / (filters.pageSize || 20));

  const handleDeactivate = async (id: string) => {
    try {
      await deactivateParty(id);
      toast({ title: "Party deactivated" });
      queryClient.invalidateQueries({ queryKey: ["parties"] });
    } catch {
      toast({ title: "Failed to deactivate party", variant: "destructive" });
    }
  };

  const existingPartyNames = (data?.data ?? []).map((p) => p.name);

  const handleImport = async (rows: ValidatedRow[]) => {
    let imported = 0, warnings = 0;
    const dupeNames = new Set(existingPartyNames.map((n) => n.toLowerCase()));

    for (const row of rows) {
      const d = row.data;
      const name = d["Company Name"];
      if (dupeNames.has(name.toLowerCase())) continue;

      const gstResult = d["GSTIN"] ? validateGSTIN(d["GSTIN"]) : null;
      const stateFromGstin = gstResult?.stateCode;
      const stateEntry = d["State"] ? INDIAN_STATES.find((s) => s.name.toLowerCase() === d["State"].toLowerCase()) : null;

      try {
        await createParty({
          name,
          party_type: (d["Party Type"] || "both").toLowerCase(),
          contact_person: d["Contact Person"] || null,
          address_line1: d["Address Line 1"] || null,
          address_line2: d["Address Line 2"] || null,
          address_line3: d["Address Line 3"] || null,
          city: d["City"] || null,
          state: d["State"] || null,
          state_code: stateFromGstin || stateEntry?.code || null,
          pin_code: d["PIN Code"] || null,
          phone1: d["Phone 1"] || null,
          phone2: d["Phone 2"] || null,
          email1: d["Email"] || null,
          gstin: d["GSTIN"] || null,
          pan: d["PAN"] || null,
          payment_terms: d["Payment Terms"] || null,
          credit_limit: d["Credit Limit"] ? parseFloat(d["Credit Limit"]) : null,
          notes: d["Notes"] || null,
        } as any);
        imported++;
        if (row.status === "warning") warnings++;
      } catch {
        // skip failed rows
      }
    }
    queryClient.invalidateQueries({ queryKey: ["parties"] });
    return { imported, warnings, skipped: rows.length - imported };
  };

  const updateFilter = (key: keyof PartiesFilters, value: string | number) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: key === "page" ? Number(value) : 1 }));
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Parties</h1>
          <p className="text-sm text-muted-foreground">Manage vendors and customers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportToExcel(parties, PARTIES_EXPORT_COLS, `Parties_${new Date().toISOString().split("T")[0]}.xlsx`, "Parties")} disabled={parties.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Button onClick={() => navigate("/parties/new")} className="active:scale-[0.98] transition-transform">
            <Plus className="h-4 w-4 mr-1" /> Add New Party
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, GSTIN, phone, city..."
            className="pl-9"
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5 bg-secondary">
          {typeFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => updateFilter("type", f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                filters.type === f.value
                  ? "bg-card text-foreground shadow-subtle"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5 bg-secondary">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => updateFilter("status", f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                filters.status === f.value
                  ? "bg-card text-foreground shadow-subtle"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="paper-card space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : parties.length === 0 ? (
        <div className="paper-card flex flex-col items-center justify-center py-16 text-center">
          <UsersIcon className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-display font-semibold text-foreground mb-1">No parties yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Add your first vendor or customer to get started.</p>
          <Button onClick={() => navigate("/parties/new")}>
            <Plus className="h-4 w-4 mr-1" /> Add New Party
          </Button>
        </div>
      ) : (
        <div className="paper-card !p-0">
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th className="hidden md:table-cell">City</th>
                  <th className="hidden lg:table-cell">State</th>
                  <th className="hidden lg:table-cell font-mono">GSTIN</th>
                  <th className="hidden md:table-cell">Phone</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr
                    key={party.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/parties/${party.id}`)}
                  >
                    <td>
                      <div>
                        <span className="font-medium text-foreground">{party.name}</span>
                        {party.contact_person && (
                          <p className="text-xs text-muted-foreground">{party.contact_person}</p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeBadge[party.party_type] || typeBadge.both}`}>
                        {party.party_type === "both" ? "Both" : party.party_type === "vendor" ? "Vendor" : "Customer"}
                      </span>
                    </td>
                    <td className="hidden md:table-cell text-muted-foreground">{party.city || "—"}</td>
                    <td className="hidden lg:table-cell text-muted-foreground">{party.state || "—"}</td>
                    <td className="hidden lg:table-cell font-mono text-xs">{party.gstin || "—"}</td>
                    <td className="hidden md:table-cell">{party.phone1 || "—"}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            party.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40"
                          }`}
                        />
                        <span className="text-xs text-muted-foreground capitalize">{party.status}</span>
                      </div>
                    </td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/parties/${party.id}/edit`)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => navigate(`/parties/${party.id}`)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDeactivate(party.id)}>
                              <UserX className="h-4 w-4 mr-2" />
                              Deactivate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Showing {((filters.page || 1) - 1) * (filters.pageSize || 20) + 1}–
                {Math.min((filters.page || 1) * (filters.pageSize || 20), totalCount)} of {totalCount}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.page || 1) <= 1}
                  onClick={() => updateFilter("page", (filters.page || 1) - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(filters.page || 1) >= totalPages}
                  onClick={() => updateFilter("page", (filters.page || 1) + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        config={PARTIES_IMPORT_CONFIG}
        onImport={handleImport}
        existingNames={existingPartyNames}
      />
    </div>
  );
}
