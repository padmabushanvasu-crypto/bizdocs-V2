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
  in_stock: "bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  dispatched: "bg-green-50 text-green-700 border border-green-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  under_warranty: "bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
  scrapped: "bg-red-50 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full",
};
const statusLabels: Record<string, string> = {
  in_stock: "In Stock",
  dispatched: "Dispatched",
  under_warranty: "Under Warranty",
  scrapped: "Scrapped",
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
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSerial, setSelectedSerial] = useState<SerialNumberRecord | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["serial-stats"],
    queryFn: fetchSerialStats,
    refetchInterval: 60000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["serial-numbers", statusFilter, search],
    queryFn: () => fetchSerialNumbers({ status: statusFilter, search, pageSize: 200 }),
    refetchInterval: 30000,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Hash className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold text-foreground">Serial Numbers</h1>
            <p className="text-sm text-muted-foreground">Track every finished unit from assembly to dispatch</p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="In Stock"
          value={stats?.inStock ?? "—"}
          icon={<Hash className="h-5 w-5 text-blue-600" />}
          className="border-l-4 border-l-blue-500"
        />
        <MetricCard
          title="Dispatched"
          value={stats?.dispatched ?? "—"}
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          className="border-l-4 border-l-green-500"
        />
        <MetricCard
          title="Under Warranty"
          value={stats?.underWarranty ?? "—"}
          icon={<Shield className="h-5 w-5 text-teal-600" />}
          className="border-l-4 border-l-teal-500"
        />
        <MetricCard
          title="Expiring Soon"
          value={stats?.expiringSoon ?? "—"}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
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
            <SelectItem value="in_stock">In Stock</SelectItem>
            <SelectItem value="dispatched">Dispatched</SelectItem>
            <SelectItem value="under_warranty">Under Warranty</SelectItem>
            <SelectItem value="scrapped">Scrapped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0 overflow-x-auto">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Hash className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground font-medium">No serial numbers found</p>
            <p className="text-xs text-muted-foreground mt-1">Serial numbers are created when Assembly Orders are confirmed.</p>
          </div>
        ) : (
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Item</th>
                <th>Assembly Order</th>
                <th>Status</th>
                <th>FAT</th>
                <th>Customer</th>
                <th>Dispatch Date</th>
                <th>Warranty Expiry</th>
                <th className="print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="font-mono font-semibold text-primary">{row.serial_number}</td>
                  <td>
                    <p className="font-medium text-sm">{row.item_description ?? "—"}</p>
                    {row.item_code && (
                      <p className="font-mono text-xs text-muted-foreground">{row.item_code}</p>
                    )}
                  </td>
                  <td className="font-mono text-sm text-muted-foreground">
                    {row.assembly_order_id ? (
                      <span className="text-primary text-xs">{row.assembly_order_id.slice(0, 8)}…</span>
                    ) : "—"}
                  </td>
                  <td>
                    <span className={statusClass[row.status] || "status-draft"}>
                      {statusLabels[row.status] ?? row.status}
                    </span>
                  </td>
                  <td>
                    <FatBadge fatCompleted={row.fat_completed} />
                  </td>
                  <td className="text-sm">{row.customer_name ?? "—"}</td>
                  <td className="text-sm font-mono">
                    {row.dispatch_date
                      ? format(new Date(row.dispatch_date), "dd MMM yyyy")
                      : "—"}
                  </td>
                  <td>
                    <WarrantyDate expiry={row.warranty_expiry} />
                  </td>
                  <td className="print:hidden">
                    <div className="flex gap-1.5">
                      {row.fat_completed ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => navigate("/fat-certificates")}
                        >
                          <ClipboardCheck className="h-3 w-3 mr-1" /> View FAT
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => openCreateFat(row)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Create FAT
                        </Button>
                      )}
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
