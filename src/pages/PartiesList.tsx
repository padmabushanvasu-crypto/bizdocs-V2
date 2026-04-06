import { useState, useEffect } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Edit, Eye, MoreHorizontal, UserX, Users as UsersIcon, Upload, Download, CheckSquare, Square, XCircle, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { fetchParties, deactivateParty, deleteParty, bulkDeleteParties, safeDeleteAllParties, importPartiesBatch, type PartiesFilters, type VendorType } from "@/lib/parties-api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import BackgroundImportDialog from "@/components/BackgroundImportDialog";
import { PARTIES_IMPORT_CONFIG, PARTY_FIELD_MAP } from "@/lib/import-utils";
import { exportToExcel, PARTIES_EXPORT_COLS } from "@/lib/export-utils";

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

const vendorTypeFilters: { label: string; value: VendorType | "all" }[] = [
  { label: "All Types", value: "all" },
  { label: "Raw Material", value: "raw_material_supplier" },
  { label: "Processor", value: "processor" },
  { label: "Both", value: "both" },
];

const vendorTypeBadgeClass: Record<VendorType, string> = {
  raw_material_supplier: "bg-teal-50 text-teal-700 border border-teal-200",
  processor: "bg-purple-50 text-purple-700 border border-purple-200",
  both: "bg-slate-100 text-slate-600 border border-slate-200",
};

const vendorTypeLabel: Record<VendorType, string> = {
  raw_material_supplier: "RAW MAT",
  processor: "PROCESSOR",
  both: "BOTH",
};

export default function PartiesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { companyId } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<PartiesFilters>({
    search: "",
    type: "all",
    vendor_type: "all",
    status: "active",
    pageSize: 100,
  });

  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["parties", filters],
    queryFn: ({ pageParam }) => fetchParties({ ...filters, page: pageParam, pageSize: 100 }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.data.length === 100 ? allPages.length + 1 : undefined,
    enabled: !!companyId,
  });

  const parties = data?.pages.flatMap((p) => p.data) ?? [];
  const totalCount = data?.pages[0]?.count ?? 0;

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        fetchNextPage();
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const deletePartyMutation = useMutation({
    mutationFn: (id: string) => deleteParty(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["parties", filters] });
      const prev = queryClient.getQueryData(["parties", filters]);
      queryClient.setQueryData(["parties", filters], (old: any) =>
        old ? {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            data: p.data.filter((party: any) => party.id !== id),
          })),
        } : old
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["parties", filters], ctx.prev);
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSuccess: (result) => {
      if (result.deactivated) {
        toast({ title: "Party marked inactive", description: "This party has existing transactions and cannot be fully deleted." });
      } else {
        toast({ title: "Party deleted" });
      }
      queryClient.invalidateQueries({ queryKey: ["parties"] });
    },
  });

  const handleDeactivate = async (id: string) => {
    // Optimistic update
    const prev = queryClient.getQueryData(["parties", filters]);
    queryClient.setQueryData(["parties", filters], (old: any) =>
      old ? {
        ...old,
        pages: old.pages.map((p: any) => ({
          ...p,
          data: p.data.filter((party: any) => party.id !== id),
        })),
      } : old
    );
    try {
      await deactivateParty(id);
      toast({ title: "Party deactivated" });
      queryClient.invalidateQueries({ queryKey: ["parties"] });
    } catch {
      if (prev) queryClient.setQueryData(["parties", filters], prev);
      toast({ title: "Failed to deactivate party", variant: "destructive" });
    }
  };

  const bulkDeactivateMutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteParties(ids),
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: ["parties", filters] });
      const prev = queryClient.getQueryData(["parties", filters]);
      const idSet = new Set(ids);
      queryClient.setQueryData(["parties", filters], (old: any) =>
        old ? {
          ...old,
          pages: old.pages.map((p: any) => ({
            ...p,
            data: p.data.filter((party: any) => !idSet.has(party.id)),
          })),
        } : old
      );
      setSelected(new Set());
      return { prev };
    },
    onError: (_err, _ids, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["parties", filters], ctx.prev);
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSuccess: (result) => {
      const parts: string[] = [];
      if (result.deleted > 0) parts.push(`${result.deleted} deleted`);
      if (result.deactivated > 0) parts.push(`${result.deactivated} deactivated`);
      toast({ title: parts.join(", ") || "Done" });
      queryClient.invalidateQueries({ queryKey: ["parties"] });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => safeDeleteAllParties(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      const parts: string[] = [];
      if (result.deleted > 0) parts.push(`${result.deleted} deleted`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped (linked to existing documents)`);
      toast({ title: parts.join(". ") || "No unlinked parties to delete" });
    },
    onError: (err: any) => {
      console.error("[PartiesList] deleteAll error:", err);
      toast({ title: "Delete all failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === parties.length) setSelected(new Set());
    else setSelected(new Set(parties.map((p) => p.id)));
  };

  const allSelected = parties.length > 0 && selected.size === parties.length;


  const updateFilter = (key: keyof PartiesFilters, value: string | number) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Parties</h1>
          <p className="text-sm text-slate-500 mt-1">
            {totalCount > 0
              ? `Showing ${parties.length} of ${totalCount} parties`
              : "Manage vendors and customers"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button variant="outline" onClick={() => exportToExcel(parties, PARTIES_EXPORT_COLS, `Parties_${new Date().toISOString().split("T")[0]}.xlsx`, "Parties")} disabled={parties.length === 0}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
          <Button
            variant="outline"
            className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
            disabled={totalCount === 0 || deleteAllMutation.isPending}
            onClick={() => setClearAllOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Clear All
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
        {(filters.type === "vendor" || filters.type === "all" || filters.type === "both") && (
          <div className="flex gap-1 rounded-md border border-border p-0.5 bg-secondary">
            {vendorTypeFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => updateFilter("vendor_type", f.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                  filters.vendor_type === f.value
                    ? "bg-card text-foreground shadow-subtle"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bulk action toolbar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
            onClick={() => setBulkDeleteOpen(true)}
            disabled={bulkDeactivateMutation.isPending}
          >
            <Trash2 className="h-3 w-3 mr-1" /> Delete Selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setSelected(new Set())}
          >
            <XCircle className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>
      )}

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
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center w-8">
                    <button onClick={toggleAll} className="flex items-center justify-center">
                      {allSelected
                        ? <CheckSquare className="h-4 w-4 text-blue-600" />
                        : <Square className="h-4 w-4 text-slate-400" />
                      }
                    </button>
                  </th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Name</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Type</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left hidden md:table-cell">City</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left hidden lg:table-cell">State</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left hidden lg:table-cell font-mono">GSTIN</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left hidden md:table-cell">Phone</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                  <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((party) => (
                  <tr
                    key={party.id}
                    className={`hover:bg-muted/50 cursor-pointer transition-colors ${selected.has(party.id) ? "bg-blue-50/60" : ""}`}
                    onClick={() => navigate(`/parties/${party.id}`)}
                  >
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center" onClick={(e) => { e.stopPropagation(); toggleSelect(party.id); }}>
                      {selected.has(party.id)
                        ? <CheckSquare className="h-4 w-4 text-blue-600 mx-auto" />
                        : <Square className="h-4 w-4 text-slate-300 mx-auto" />
                      }
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                      <div>
                        <span className="font-medium text-foreground">{party.name}</span>
                        {party.contact_person && (
                          <p className="text-xs text-muted-foreground">{party.contact_person}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                      <div className="flex items-center gap-1.5 flex-wrap justify-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeBadge[party.party_type] || typeBadge.both}`}>
                          {party.party_type === "both" ? "Both" : party.party_type === "vendor" ? "Vendor" : "Customer"}
                        </span>
                        {party.vendor_type && (party.party_type === "vendor" || party.party_type === "both") && (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${vendorTypeBadgeClass[party.vendor_type as VendorType]}`}>
                            {vendorTypeLabel[party.vendor_type as VendorType]}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left hidden md:table-cell">{party.city || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left hidden lg:table-cell">{party.state || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left hidden lg:table-cell font-mono">{party.gstin || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left hidden md:table-cell">{party.phone1 || "—"}</td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                      <div className="flex items-center gap-1.5 justify-center">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            party.status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40"
                          }`}
                        />
                        <span className="text-xs text-muted-foreground capitalize">{party.status}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          disabled={deletePartyMutation.isPending}
                          onClick={() => deletePartyMutation.mutate(party.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

        </div>
      )}

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Clear All confirmation dialog */}
      <Dialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all {totalCount} parties?</DialogTitle>
            <DialogDescription>
              Parties linked to existing documents (POs, DCs, GRNs, invoices, etc.) will be skipped.
              Only unlinked parties will be permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearAllOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteAllMutation.isPending}
              onClick={() => {
                setClearAllOpen(false);
                deleteAllMutation.mutate();
              }}
            >
              {deleteAllMutation.isPending ? "Deleting…" : "Delete unlinked parties"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk delete confirmation */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selected.size} part{selected.size !== 1 ? "ies" : "y"}?</DialogTitle>
            <DialogDescription>
              Parties with transaction history will be deactivated instead of deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                bulkDeactivateMutation.mutate([...selected]);
                setBulkDeleteOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BackgroundImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Parties"
        entityName="parties"
        fieldMap={PARTY_FIELD_MAP}
        requiredFields={["name"]}
        importConfig={PARTIES_IMPORT_CONFIG}
        batchFn={importPartiesBatch}
        invalidateKeys={[["parties"]]}
      />
    </div>
  );
}
