import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wrench, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchJigMaster,
  createJigRecord,
  updateJigRecord,
  deleteJigRecord,
  type JigMasterRecord,
} from "@/lib/dc-intelligence-api";

type JigStatus = 'ok' | 'to_be_made' | 'in_progress' | 'damaged';

const STATUS_LABELS: Record<JigStatus, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-green-100 text-green-800 border border-green-200" },
  to_be_made: { label: "To Be Made", className: "bg-amber-100 text-amber-800 border border-amber-200" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-800 border border-blue-200" },
  damaged: { label: "Damaged", className: "bg-red-100 text-red-800 border border-red-200" },
};

const EMPTY_FORM = { drawing_number: "", jig_number: "", status: "ok" as JigStatus, associated_process: "", notes: "" };

export default function JigMaster() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [jigToDelete, setJigToDelete] = useState<JigMasterRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const { data: jigs = [], isLoading } = useQuery({
    queryKey: ["jig-master", search],
    queryFn: () => fetchJigMaster({ search: search || undefined }),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => createJigRecord({
      drawing_number: data.drawing_number,
      jig_number: data.jig_number,
      status: data.status,
      associated_process: data.associated_process || null,
      notes: data.notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jig-master"] });
      toast({ title: "Jig added" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) => updateJigRecord(editingId!, {
      drawing_number: data.drawing_number,
      jig_number: data.jig_number,
      status: data.status,
      associated_process: data.associated_process || null,
      notes: data.notes || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jig-master"] });
      toast({ title: "Jig updated" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteJigRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jig-master"] });
      toast({ title: "Jig deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openAdd = () => { setEditingId(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true); };
  const openEdit = (jig: JigMasterRecord) => {
    setEditingId(jig.id);
    setForm({
      drawing_number: jig.drawing_number,
      jig_number: jig.jig_number,
      status: jig.status,
      associated_process: jig.associated_process ?? "",
      notes: jig.notes ?? "",
    });
    setDialogOpen(true);
  };
  const closeDialog = () => { setDialogOpen(false); setEditingId(null); setForm({ ...EMPTY_FORM }); };

  const handleSubmit = () => {
    if (!form.drawing_number.trim() || !form.jig_number.trim()) {
      toast({ title: "Drawing number and jig number are required", variant: "destructive" });
      return;
    }
    if (editingId) updateMutation.mutate(form);
    else createMutation.mutate(form);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">Jig Master</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage jigs and fixtures associated with component drawings</p>
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Jig
        </Button>
      </div>

      {/* Search */}
      <Input
        placeholder="Search by drawing number or jig number…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)] rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Drawing No</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Jig No</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Associated Process</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">Notes</th>
                <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : jigs.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-400">No data found</td></tr>
              ) : (
                jigs.map((jig) => {
                  const badge = STATUS_LABELS[jig.status] ?? STATUS_LABELS.ok;
                  return (
                    <tr key={jig.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono font-medium">{jig.drawing_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left font-mono">{jig.jig_number}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left">{jig.associated_process ?? "—"}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground max-w-[200px] truncate">{jig.notes ?? "—"}</td>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => openEdit(jig)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setJigToDelete(jig)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Jig" : "Add Jig"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Drawing Number *</Label>
                <Input
                  value={form.drawing_number}
                  onChange={(e) => setForm(f => ({ ...f, drawing_number: e.target.value }))}
                  className="mt-1 font-mono"
                  placeholder="e.g. DRW-001"
                />
              </div>
              <div>
                <Label className="text-sm">Jig Number *</Label>
                <Input
                  value={form.jig_number}
                  onChange={(e) => setForm(f => ({ ...f, jig_number: e.target.value }))}
                  className="mt-1 font-mono"
                  placeholder="e.g. JIG-001"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v as JigStatus }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ok">OK</SelectItem>
                  <SelectItem value="to_be_made">To Be Made</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Associated Process</Label>
              <Input
                value={form.associated_process}
                onChange={(e) => setForm(f => ({ ...f, associated_process: e.target.value }))}
                className="mt-1"
                placeholder="e.g. CNC Turning"
              />
            </div>
            <div>
              <Label className="text-sm">Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                className="mt-1"
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingId ? "Update" : "Add Jig"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!jigToDelete} onOpenChange={(open) => { if (!open) setJigToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete jig <strong>{jigToDelete?.jig_number}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (jigToDelete) { deleteMutation.mutate(jigToDelete.id); setJigToDelete(null); } }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
