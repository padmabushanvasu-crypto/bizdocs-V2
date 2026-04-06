import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchJigMaster, createJigRecord, updateJigRecord, deleteJigRecord,
  fetchMouldItems, createMouldItem, updateMouldItem, deleteMouldItem,
  type JigMasterRecord, type MouldItem,
} from "@/lib/dc-intelligence-api";

// ── Jig Status Badge ───────────────────────────────────────────────────────────

function JigStatusBadge({ status }: { status: string }) {
  if (status === "to_be_made")
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">To Be Made</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">OK</span>;
}

// ── Jig Tab ────────────────────────────────────────────────────────────────────

function JigTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JigMasterRecord | null>(null);
  const [form, setForm] = useState<Partial<JigMasterRecord>>({});

  const { data: jigs = [], isLoading } = useQuery({
    queryKey: ["jig-master-settings"],
    queryFn: () => fetchJigMaster(),
  });

  const filtered = jigs.filter(j =>
    !search.trim() ||
    j.drawing_number.toLowerCase().includes(search.toLowerCase()) ||
    (j.jig_number ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.drawing_number?.trim()) throw new Error("Drawing Number is required");
      if (editing) {
        await updateJigRecord(editing.id, form);
      } else {
        await createJigRecord({
          drawing_number: form.drawing_number ?? "",
          jig_number: form.jig_number ?? "",
          status: (form.status as 'ok' | 'to_be_made') ?? "ok",
          associated_process: null,
          notes: form.notes ?? null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jig-master-settings"] });
      setDialogOpen(false);
      toast({ title: editing ? "Jig updated" : "Jig added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteJigRecord(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["jig-master-settings"] });
      const prev = queryClient.getQueryData<JigMasterRecord[]>(["jig-master-settings"]);
      queryClient.setQueryData<JigMasterRecord[]>(["jig-master-settings"], (old) =>
        (old ?? []).filter((j) => j.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["jig-master-settings"], ctx.prev);
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Jig deleted" });
    },
  });

  function openAdd() {
    setEditing(null);
    setForm({ status: "ok" });
    setDialogOpen(true);
  }

  function openEdit(jig: JigMasterRecord) {
    setEditing(jig);
    setForm({ drawing_number: jig.drawing_number, jig_number: jig.jig_number, status: jig.status, notes: jig.notes ?? "" });
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input placeholder="Search drawing or jig number..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm h-9 text-sm" />
        <Button size="sm" className="gap-1" onClick={openAdd}><Plus className="h-4 w-4" /> Add Jig</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No jig records found</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Jig Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Notes</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(jig => (
                <tr key={jig.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{jig.drawing_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{jig.jig_number || "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center"><JigStatusBadge status={jig.status} /></td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-slate-500 max-w-[200px] truncate">{jig.notes || "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(jig)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(jig.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Jig" : "Add Jig"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-medium">Drawing Number *</Label>
              <Input value={form.drawing_number ?? ""} onChange={e => setForm(f => ({ ...f, drawing_number: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium">Jig Number</Label>
              <Input value={form.jig_number ?? ""} onChange={e => setForm(f => ({ ...f, jig_number: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium">Status</Label>
              <select
                value={form.status ?? "ok"}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as 'ok' | 'to_be_made' }))}
                className="mt-1 w-full border border-input rounded-md h-8 px-3 text-sm bg-background"
              >
                <option value="ok">OK</option>
                <option value="to_be_made">To Be Made</option>
              </select>
            </div>
            <div>
              <Label className="text-xs font-medium">Notes</Label>
              <Input value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Mould Tab ──────────────────────────────────────────────────────────────────

function MouldTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MouldItem | null>(null);
  const [form, setForm] = useState<Partial<MouldItem>>({});

  const { data: moulds = [], isLoading } = useQuery({
    queryKey: ["mould-items-settings"],
    queryFn: () => fetchMouldItems(),
  });

  const filtered = moulds.filter(m =>
    !search.trim() ||
    m.drawing_number.toLowerCase().includes(search.toLowerCase()) ||
    m.description.toLowerCase().includes(search.toLowerCase()) ||
    m.vendor_name.toLowerCase().includes(search.toLowerCase())
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.drawing_number?.trim()) throw new Error("Drawing Number is required");
      if (!form.description?.trim()) throw new Error("Description is required");
      if (!form.vendor_name?.trim()) throw new Error("Vendor Name is required");
      if (editing) {
        await updateMouldItem(editing.id, form);
      } else {
        await createMouldItem({
          drawing_number: form.drawing_number ?? "",
          drawing_revision: form.drawing_revision ?? null,
          description: form.description ?? "",
          vendor_name: form.vendor_name ?? "",
          vendor_id: null,
          notes: form.notes ?? null,
          alert_message: form.alert_message ?? null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mould-items-settings"] });
      setDialogOpen(false);
      toast({ title: editing ? "Mould item updated" : "Mould item added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMouldItem(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["mould-items-settings"] });
      const prev = queryClient.getQueryData<MouldItem[]>(["mould-items-settings"]);
      queryClient.setQueryData<MouldItem[]>(["mould-items-settings"], (old) =>
        (old ?? []).filter((m) => m.id !== id)
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["mould-items-settings"], ctx.prev);
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Mould item deleted" });
    },
  });

  function openAdd() {
    setEditing(null);
    setForm({});
    setDialogOpen(true);
  }

  function openEdit(m: MouldItem) {
    setEditing(m);
    setForm({ drawing_number: m.drawing_number, drawing_revision: m.drawing_revision ?? "", description: m.description, vendor_name: m.vendor_name, notes: m.notes ?? "", alert_message: m.alert_message ?? "" });
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input placeholder="Search drawing, description or vendor..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm h-9 text-sm" />
        <Button size="sm" className="gap-1" onClick={openAdd}><Plus className="h-4 w-4" /> Add Mould Item</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No mould items found</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing Number</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Description</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Vendor</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Alert Message</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(m => (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{m.drawing_number}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left max-w-[180px] truncate">{m.description}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-slate-600">{m.vendor_name}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-slate-500 max-w-[200px] truncate">{m.alert_message || "—"}</td>
                  <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteMutation.mutate(m.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Mould Item" : "Add Mould Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Drawing Number *</Label>
                <Input value={form.drawing_number ?? ""} onChange={e => setForm(f => ({ ...f, drawing_number: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs font-medium">Drawing Revision</Label>
                <Input value={form.drawing_revision ?? ""} onChange={e => setForm(f => ({ ...f, drawing_revision: e.target.value }))} className="mt-1 h-8 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs font-medium">Description *</Label>
              <Input value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium">Vendor Name *</Label>
              <Input value={form.vendor_name ?? ""} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium">Alert Message</Label>
              <Input value={form.alert_message ?? ""} onChange={e => setForm(f => ({ ...f, alert_message: e.target.value }))} placeholder="Custom alert — leave blank for default" className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium">Notes</Label>
              <Input value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1 h-8 text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

type TabKey = "jig" | "mould";

export default function JigMouldSettings() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("jig");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Back to Settings
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Jig & Mould Master</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage drilling jigs and mould-dependent items. Alerts auto-trigger on Delivery Challans.
        </p>
      </div>

      <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden w-fit">
        {(["jig", "mould"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-r border-slate-200 last:border-r-0 ${
              activeTab === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t === "jig" ? "Jig Master" : "Mould Items"}
          </button>
        ))}
      </div>

      <div className="paper-card">
        {activeTab === "jig" ? <JigTab /> : <MouldTab />}
      </div>
    </div>
  );
}
