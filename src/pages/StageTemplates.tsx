import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GitBranch, Plus, Search, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchStageTemplates,
  createStageTemplate,
  updateStageTemplate,
  deleteStageTemplate,
  type StageTemplate,
} from "@/lib/job-cards-api";

const CATEGORIES = ["Manufacturing", "Logistics", "Quality", "Packaging", "Other"] as const;

const emptyTemplate = {
  name: "",
  category: "Manufacturing",
  description: "",
  default_cost: 0,
  sort_order: 0,
};

export default function StageTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<StageTemplate | null>(null);
  const [form, setForm] = useState(emptyTemplate);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["stage-templates", search, categoryFilter],
    queryFn: () => fetchStageTemplates({ search, category: categoryFilter }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        default_cost: form.default_cost || 0,
        sort_order: form.sort_order || 0,
      };
      if (editingTemplate) return updateStageTemplate(editingTemplate.id, payload);
      return createStageTemplate(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stage-templates"] });
      setFormOpen(false);
      toast({ title: editingTemplate ? "Template updated" : "Template created" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteStageTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stage-templates"] });
      toast({ title: "Template deactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openNew = () => {
    setEditingTemplate(null);
    setForm(emptyTemplate);
    setFormOpen(true);
  };

  const openEdit = (tmpl: StageTemplate) => {
    setEditingTemplate(tmpl);
    setForm({
      name: tmpl.name,
      category: tmpl.category,
      description: tmpl.description ?? "",
      default_cost: tmpl.default_cost ?? 0,
      sort_order: tmpl.sort_order ?? 0,
    });
    setFormOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate();
  };

  const categoryColor: Record<string, string> = {
    Manufacturing: "bg-blue-50 text-blue-700 border-blue-200",
    Logistics: "bg-amber-50 text-amber-700 border-amber-200",
    Quality: "bg-green-50 text-green-700 border-green-200",
    Packaging: "bg-purple-50 text-purple-700 border-purple-200",
    Other: "bg-gray-50 text-gray-600 border-gray-200",
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GitBranch className="h-5 w-5" /> Stage Templates
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Reusable process stages for Job Cards
          </p>
        </div>
        <Button onClick={openNew} className="active:scale-[0.98] transition-transform flex-shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Add Template
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="paper-card !p-0">
        <div className="overflow-x-auto">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Description</th>
                <th className="text-right">Default Cost (₹)</th>
                <th className="text-right">Sort Order</th>
                <th className="w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12">
                    <GitBranch className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground font-medium">No stage templates yet</p>
                    <p className="text-sm text-muted-foreground">
                      Add templates to reuse across Job Cards
                    </p>
                  </td>
                </tr>
              ) : (
                templates.map((tmpl) => (
                  <tr
                    key={tmpl.id}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => openEdit(tmpl)}
                  >
                    <td className="font-medium">{tmpl.name}</td>
                    <td>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                          categoryColor[tmpl.category] ?? categoryColor.Other
                        }`}
                      >
                        {tmpl.category}
                      </span>
                    </td>
                    <td className="text-muted-foreground text-sm max-w-xs truncate">
                      {tmpl.description || "—"}
                    </td>
                    <td className="text-right font-mono tabular-nums">
                      {tmpl.default_cost > 0 ? `₹${tmpl.default_cost.toLocaleString("en-IN")}` : "—"}
                    </td>
                    <td className="text-right text-muted-foreground">{tmpl.sort_order}</td>
                    <td>
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(tmpl)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            if (confirm("Deactivate this template?"))
                              deleteMutation.mutate(tmpl.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Add Stage Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. CNC Machining"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Optional description"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default Cost (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.default_cost || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, default_cost: parseFloat(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.sort_order || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))
                  }
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {editingTemplate ? "Update" : "Create"} Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
