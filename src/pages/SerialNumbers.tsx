import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Hash, CheckCircle2, Clock, Shield, AlertTriangle, Search, ClipboardCheck, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import {
  fetchSerialNumbers,
  fetchSerialStats,
  createFatCertificate,
  fetchFatForSerial,
  type SerialNumberRecord,
} from "@/lib/fat-api";
import { MetricCard } from "@/components/MetricCard";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  in_production: "bg-amber-50 text-amber-700 border border-amber-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  in_stock: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  dispatched: "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  under_warranty: "bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  scrapped: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  cancelled: "bg-slate-100 text-slate-500 border border-slate-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};
const statusLabels: Record<string, string> = {
  in_production: "In Production",
  in_stock: "In Stock",
  dispatched: "Dispatched",
  under_warranty: "Under Warranty",
  scrapped: "Scrapped",
  cancelled: "Cancelled",
};

function FatBadge({ fatCompleted }: { fatCompleted: boolean }) {
  if (fatCompleted) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="h-3 w-3" /> FAT Passed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      <Clock className="h-3 w-3" /> FAT Pending
    </span>
  );
}

function WarrantyDate({ expiry }: { expiry: string | null }) {
  if (!expiry) return <span className="text-muted-foreground">—</span>;
  const today = new Date().toISOString().split("T")[0];
  const in30 = new Date();
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().split("T")[0];

  const cls =
    expiry < today
      ? "text-red-600 font-semibold"
      : expiry <= in30Str
      ? "text-amber-600 font-semibold"
      : "text-foreground";

  return (
    <span className={cls}>
      {format(new Date(expiry), "dd MMM yyyy")}
      {expiry < today && " ✗"}
      {expiry >= today && expiry <= in30Str && " ⚠"}
    </span>
  );
}

export default function SerialNumbers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canEdit } = useRoleAccess();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSerial, setSelectedSerial] = useState<SerialNumberRecord | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["serial-stats"],
    queryFn: fetchSerialStats,
    refetchInterval: 300000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["serial-numbers", statusFilter, search],
    queryFn: () => fetchSerialNumbers({ status: statusFilter, search, pageSize: 200 }),
    refetchInterval: 300000,
  });

  const rows = data?.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.serial_number.toLowerCase().includes(q) ||
        (r.item_code ?? "").toLowerCase().includes(q) ||
        (r.item_description ?? "").toLowerCase().includes(q) ||
        (r.customer_name ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const createFatMutation = useMutation({
    mutationFn: () =>
      createFatCertificate({
        serial_number_id: selectedSerial!.id,
        serial_number: selectedSerial!.serial_number,
        item_id: selectedSerial!.item_id,
        item_code: selectedSerial!.item_code,
        item_description: selectedSerial!.item_description,
        assembly_order_id: selectedSerial!.assembly_order_id,
      }),
    onSuccess: (fat) => {
      queryClient.invalidateQueries({ queryKey: ["serial-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["fat-certificates"] });
      setCreateOpen(false);
      setSelectedSerial(null);
      toast({ title: "FAT Certificate created", description: fat.fat_number });
      navigate(`/fat-certificates/${fat.id}`);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openCreateFat = (serial: SerialNumberRecord) => {
    setSelectedSerial(serial);
    setCreateOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Serial Numbers</h1>
          <p className="text-sm text-slate-500 mt-1">Track every finished unit from assembly to dispatch</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="In Production"
          value={String(stats?.inProduction ?? "—")}
          icon={Hash}
          className={(stats?.inProduction ?? 0) > 0 ? "border-l-4 border-l-amber-500 bg-amber-50/30" : "border-l-4 border-l-slate-200"}
        />
        <MetricCard
          title="In Stock"
          value={String(stats?.inStock ?? "—")}
          icon={Hash}
          className="border-l-4 border-l-blue-500"
        />
        <MetricCard
          title="Dispatched"
          value={String(stats?.dispatched ?? "—")}
          icon={CheckCircle2}
          className="border-l-4 border-l-green-500"
        />
        <MetricCard
          title="Under Warranty"
          value={String(stats?.underWarranty ?? "—")}
          icon={Shield}
          className="border-l-4 border-l-teal-500"
        />
        <MetricCard
          title="Expiring Soon"
          value={String(stats?.expiringSoon ?? "—")}
          icon={AlertTriangle}
          className={(stats?.expiringSoon ?? 0) > 0 ? "border-l-4 border-l-amber-500 bg-amber-50/40" : "border-l-4 border-l-green-500"}
        />
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="in_production">In Production</SelectItem>
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="dispatched">Dispatched</SelectItem>
            <SelectItem value="under_warranty">Under Warranty</SelectItem>
            <SelectItem value="scrapped">Scrapped</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0 overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        ) : isError ? (
          <div className="py-12 text-center">
            <Hash className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">Unable to load serial numbers</p>
            <p className="text-xs text-muted-foreground mt-1">The database table may not be set up yet. Run the Phase 8 migration to enable this feature.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Hash className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No serial numbers found</p>
            <p className="text-xs text-muted-foreground mt-1">Serial numbers are generated automatically when a Production Run is started.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Serial Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Item</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Production Run</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">FAT</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Customer</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Dispatch Date</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Warranty Expiry</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-semibold text-primary">{row.serial_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    <p className="font-medium">{row.item_description ?? "—"}</p>
                    {row.item_code && (
                      <p className="font-mono text-xs text-muted-foreground">{row.item_code}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono text-muted-foreground">
                    {row.assembly_order_id ? (
                      <span className="text-primary text-xs">{row.assembly_order_id.slice(0, 8)}…</span>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <span className={statusClass[row.status] || "status-draft"}>
                      {statusLabels[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <FatBadge fatCompleted={row.fat_completed} />
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{row.customer_name ?? "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left tabular-nums font-mono">
                    {row.dispatch_date
                      ? format(new Date(row.dispatch_date), "dd MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">
                    <WarrantyDate expiry={row.warranty_expiry} />
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center print:hidden">
                    <div className="flex gap-1.5 justify-center">
                      {row.fat_completed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => navigate("/fat-certificates")}
                        >
                          <ClipboardCheck className="h-3 w-3 mr-1" /> View FAT
                        </Button>
                      ) : canEdit ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openCreateFat(row)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Create FAT
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create FAT Dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { setCreateOpen(v); if (!v) setSelectedSerial(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create FAT Certificate</DialogTitle>
            <DialogDescription>
              Create a Factory Acceptance Test certificate for serial number{" "}
              <span className="font-mono font-semibold">{selectedSerial?.serial_number}</span>.
              Default OLTC test parameters will be pre-loaded.
            </DialogDescription>
          </DialogHeader>
          {selectedSerial && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Serial Number</span>
                <span className="font-mono font-semibold">{selectedSerial.serial_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item</span>
                <span>{selectedSerial.item_description ?? selectedSerial.item_code ?? "—"}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createFatMutation.mutate()} disabled={createFatMutation.isPending}>
              {createFatMutation.isPending ? "Creating..." : "Create FAT Certificate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
