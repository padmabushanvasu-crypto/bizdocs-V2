import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Cog, Plus, Search, ChevronLeft, ChevronDown, ChevronRight,
  Pencil, Trash2, Star, X, Check, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchProcessCodes, createProcessCode, updateProcessCode, deleteProcessCode,
  addProcessCodeVendor, removeProcessCodeVendor,
  type ProcessCode, type ProcessCodeVendor,
} from "@/lib/process-library-api";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// ── Types ──────────────────────────────────────────────────────────────────

interface DialogVendor {
  vendorId: string | null;
  vendorName: string;
  isPreferred: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: "internal" | "external" }) {
  return (
    <span
      className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
        type === "internal"
          ? "bg-slate-50 border-slate-200 text-slate-600"
          : "bg-blue-50 border-blue-200 text-blue-700"
      }`}
    >
      {type === "internal" ? "Internal" : "External"}
    </span>
  );
}

function VendorChips({ vendors }: { vendors?: ProcessCodeVendor[] }) {
  if (!vendors || vendors.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const shown = vendors.slice(0, 3);
  const rest = vendors.length - 3;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((v) => (
        <span
          key={v.id}
          className={`text-xs px-1.5 py-0.5 rounded border ${
            v.is_preferred
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-slate-50 border-slate-200 text-slate-600"
          }`}
        >
          {v.vendor_name}
          {v.is_preferred && <Star className="h-2.5 w-2.5 inline ml-0.5 fill-amber-400 text-amber-400" />}
        </span>
      ))}
      {rest > 0 && (
        <span className="text-xs text-muted-foreground">+{rest} more</span>
      )}
    </div>
  );
}

function ActiveToggle({
  active,
  onChange,
}: {
  active: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`relative h-5 w-9 rounded-full transition-colors focus:outline-none ${
        active ? "bg-emerald-500" : "bg-slate-200"
      }`}
      aria-label={active ? "Active" : "Inactive"}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
          active ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ProcessLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── List state ──
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "internal" | "external">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Dialog state ──
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProcessCode | null>(null);
  const [pcCode, setPcCode] = useState("");
  const [pcName, setPcName] = useState("");
  const [stageType, setStageType] = useState<"internal" | "external">("external");
  const [notes, setNotes] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [dialogVendors, setDialogVendors] = useState<DialogVendor[]>([]);
  const [saving, setSaving] = useState(false);

  // ── Queries ──

  const { data: processCodes = [], isLoading } = useQuery({
    queryKey: ["process-codes"],
    queryFn: () => fetchProcessCodes(false), // fetch all including inactive for library page
  });

  const { data: allVendors = [] } = useQuery({
    queryKey: ["vendors-for-process-lib"],
    queryFn: async () => {
      const companyId = await getCompanyId();
      if (!companyId) return [];
      const { data } = await (supabase as any)
        .from("parties")
        .select("id, name")
        .eq("company_id", companyId)
        .in("party_type", ["vendor", "both"])
        .eq("status", "active")
        .order("name")
        .limit(500);
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // ── Filtered list ──

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return processCodes.filter((pc) => {
      const matchSearch =
        !q ||
        pc.process_name.toLowerCase().includes(q) ||
        (pc.process_code ?? "").toLowerCase().includes(q);
      const matchType =
        typeFilter === "all" || pc.stage_type === typeFilter;
      return matchSearch && matchType;
    });
  }, [processCodes, search, typeFilter]);

  // ── Summary counts (active only) ──
  const activeCodes = processCodes.filter((pc) => pc.is_active);
  const internalCount = activeCodes.filter((pc) => pc.stage_type === "internal").length;
  const externalCount = activeCodes.filter((pc) => pc.stage_type === "external").length;

  // ── Vendor search in dialog ──
  const filteredVendors = useMemo(() => {
    const q = vendorSearch.toLowerCase();
    return q
      ? allVendors.filter((v) => v.name.toLowerCase().includes(q))
      : allVendors;
  }, [allVendors, vendorSearch]);

  // ── Mutations ──

  const toggleActiveMutation = useMutation({
    mutationFn: (pc: ProcessCode) =>
      updateProcessCode(pc.id, { is_active: !pc.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-codes"] });
      queryClient.invalidateQueries({ queryKey: ["count", "process_codes"] });
    },
    onError: (err: any) =>
      toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProcessCode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-codes"] });
      queryClient.invalidateQueries({ queryKey: ["count", "process_codes"] });
      toast({ title: "Process code deleted" });
    },
    onError: (err: any) =>
      toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  // ── Dialog helpers ──

  const openAdd = () => {
    setEditTarget(null);
    setPcCode("");
    setPcName("");
    setStageType("external");
    setNotes("");
    setVendorSearch("");
    setDialogVendors([]);
    setDialogOpen(true);
  };

  const openEdit = (pc: ProcessCode, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(pc);
    setPcCode(pc.process_code ?? "");
    setPcName(pc.process_name);
    setStageType(pc.stage_type);
    setNotes(pc.notes ?? "");
    setVendorSearch("");
    setDialogVendors(
      (pc.vendors ?? []).map((v) => ({
        vendorId: v.vendor_id ?? null,
        vendorName: v.vendor_name,
        isPreferred: v.is_preferred,
      }))
    );
    setDialogOpen(true);
  };

  const toggleDialogVendor = (vendor: { id: string; name: string }) => {
    setDialogVendors((prev) => {
      const idx = prev.findIndex((v) => v.vendorId === vendor.id);
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return [
        ...prev,
        {
          vendorId: vendor.id,
          vendorName: vendor.name,
          isPreferred: prev.length === 0,
        },
      ];
    });
  };

  const setPreferred = (index: number) => {
    setDialogVendors((prev) =>
      prev.map((v, i) => ({ ...v, isPreferred: i === index }))
    );
  };

  const removeDialogVendor = (index: number) => {
    setDialogVendors((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // If removed was preferred and there are others, make first preferred
      if (prev[index].isPreferred && next.length > 0) {
        next[0] = { ...next[0], isPreferred: true };
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!pcName.trim()) {
      toast({ title: "Process Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let pcId: string;
      if (editTarget) {
        await updateProcessCode(editTarget.id, {
          process_code: pcCode.trim() || null,
          process_name: pcName.trim(),
          stage_type: stageType,
          notes: notes.trim() || null,
        });
        pcId = editTarget.id;
        // Remove all existing vendors and re-add
        for (const v of editTarget.vendors ?? []) {
          await removeProcessCodeVendor(v.id);
        }
      } else {
        const created = await createProcessCode({
          process_code: pcCode.trim() || undefined,
          process_name: pcName.trim(),
          stage_type: stageType,
          notes: notes.trim() || undefined,
        });
        pcId = created.id;
      }
      // Insert new vendor list
      for (const v of dialogVendors) {
        await addProcessCodeVendor(
          pcId,
          v.vendorId ?? undefined,
          v.vendorName,
          v.isPreferred
        );
      }
      queryClient.invalidateQueries({ queryKey: ["process-codes"] });
      queryClient.invalidateQueries({ queryKey: ["count", "process_codes"] });
      toast({ title: editTarget ? "Process code updated" : "Process code added" });
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──

  const typeFilterOptions = [
    { value: "all" as const, label: "All" },
    { value: "internal" as const, label: "Internal" },
    { value: "external" as const, label: "External" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Settings
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Cog className="h-5 w-5 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Process Library
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Standard process codes and approved vendors used across all manufacturing operations
            </p>
          </div>
        </div>
        <Button onClick={openAdd} className="shrink-0">
          <Plus className="h-4 w-4 mr-1" /> Add Process Code
        </Button>
      </div>

      {/* Summary chips */}
      {activeCodes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {activeCodes.length} process code{activeCodes.length !== 1 ? "s" : ""}
          </span>
          {internalCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
              {internalCount} internal
            </span>
          )}
          {externalCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {externalCount} external
            </span>
          )}
        </div>
      )}

      {/* Search + Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5 bg-secondary">
          {typeFilterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                typeFilter === opt.value
                  ? "bg-card text-foreground shadow-subtle"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table or empty state */}
      {isLoading ? (
        <div className="paper-card space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : processCodes.length === 0 ? (
        <div className="paper-card flex flex-col items-center justify-center py-16 text-center">
          <Cog className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-display font-semibold text-foreground mb-1">
            No process codes yet
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-sm">
            Import from{" "}
            <button
              className="underline hover:text-foreground"
              onClick={() => navigate("/settings/import")}
            >
              Data Import → Process Code Master
            </button>{" "}
            or add manually.
          </p>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add Process Code
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="paper-card py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No process codes match your search.
          </p>
        </div>
      ) : (
        <div className="paper-card !p-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-200px)]">
            <table className="w-full data-table">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="w-6" />
                  <th>Code</th>
                  <th>Process Name</th>
                  <th>Type</th>
                  <th className="hidden md:table-cell">Approved Vendors</th>
                  <th>Active</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((pc) => {
                  const isExpanded = expandedId === pc.id;
                  return (
                    <>
                      <tr
                        key={pc.id}
                        className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                          !pc.is_active ? "opacity-50" : ""
                        } ${isExpanded ? "bg-muted/30" : ""}`}
                        onClick={() =>
                          setExpandedId(isExpanded ? null : pc.id)
                        }
                      >
                        <td className="text-center text-muted-foreground">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 mx-auto" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 mx-auto" />
                          )}
                        </td>
                        <td>
                          <span className="font-mono text-sm font-medium text-slate-700">
                            {pc.process_code || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </td>
                        <td>
                          <span className="font-medium text-foreground">
                            {pc.process_name}
                          </span>
                        </td>
                        <td>
                          <TypeBadge type={pc.stage_type} />
                        </td>
                        <td className="hidden md:table-cell">
                          <VendorChips vendors={pc.vendors} />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <ActiveToggle
                            active={pc.is_active}
                            onChange={() => toggleActiveMutation.mutate(pc)}
                          />
                        </td>
                        <td
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => openEdit(pc, e)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    `Delete "${pc.process_name}"? This will deactivate it.`
                                  )
                                ) {
                                  deleteMutation.mutate(pc.id);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {/* Expanded row */}
                      {isExpanded && (
                        <tr key={`${pc.id}-expanded`} className="bg-slate-50/60">
                          <td />
                          <td colSpan={6} className="py-3 pr-4">
                            <div className="space-y-3">
                              {/* Full vendor list */}
                              {(pc.vendors?.length ?? 0) > 0 ? (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                                    Approved Vendors
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {pc.vendors!.map((v) => (
                                      <span
                                        key={v.id}
                                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${
                                          v.is_preferred
                                            ? "bg-amber-50 border-amber-200 text-amber-800"
                                            : "bg-white border-slate-200 text-slate-600"
                                        }`}
                                      >
                                        {v.vendor_name}
                                        {v.is_preferred && (
                                          <span className="text-[9px] font-bold text-amber-600 uppercase">
                                            preferred
                                          </span>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  No approved vendors linked.
                                </p>
                              )}
                              {/* Notes */}
                              {pc.notes && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">
                                    Notes
                                  </p>
                                  <p className="text-sm text-slate-600">{pc.notes}</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !saving) setDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? "Edit Process Code" : "Add Process Code"}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? "Update process code details and approved vendors."
                : "Add a standard process code to your Process Library."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Process Code + Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pc-code">Process Code</Label>
                <Input
                  id="pc-code"
                  placeholder="e.g. 65"
                  value={pcCode}
                  onChange={(e) => setPcCode(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-name">
                  Process Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="pc-name"
                  placeholder="e.g. CNC Turning"
                  value={pcName}
                  onChange={(e) => setPcName(e.target.value)}
                />
              </div>
            </div>

            {/* Stage Type */}
            <div className="space-y-1.5">
              <Label>Stage Type</Label>
              <div className="flex gap-2">
                {(["external", "internal"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setStageType(t)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      stageType === t
                        ? t === "external"
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-slate-700 border-slate-700 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {t === "external" ? "External" : "Internal"}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="pc-notes">Notes</Label>
              <Textarea
                id="pc-notes"
                placeholder="Optional notes about this process…"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Approved Vendors */}
            <div className="space-y-2">
              <Label>Approved Vendors</Label>

              {/* Search vendor list */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search vendors…"
                  className="pl-8 h-8 text-sm"
                  value={vendorSearch}
                  onChange={(e) => setVendorSearch(e.target.value)}
                />
              </div>

              {/* Vendor checkbox list */}
              {allVendors.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No vendors found. Add vendors in Parties first.
                </p>
              ) : (
                <div className="border rounded-md max-h-36 overflow-y-auto">
                  {filteredVendors.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-3 py-2">
                      No vendors match "{vendorSearch}"
                    </p>
                  ) : (
                    filteredVendors.map((v) => {
                      const isSelected = dialogVendors.some(
                        (dv) => dv.vendorId === v.id
                      );
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => toggleDialogVendor(v)}
                          className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors hover:bg-muted ${
                            isSelected ? "bg-blue-50/60" : ""
                          }`}
                        >
                          <div
                            className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                              isSelected
                                ? "bg-blue-600 border-blue-600"
                                : "border-slate-300"
                            }`}
                          >
                            {isSelected && (
                              <Check className="h-3 w-3 text-white" />
                            )}
                          </div>
                          <span className="truncate">{v.name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Selected vendors with preferred toggle */}
              {dialogVendors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">
                    Selected — click ☆ to mark preferred
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {dialogVendors.map((dv, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                          dv.isPreferred
                            ? "bg-amber-50 border-amber-300 text-amber-800"
                            : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        <span className="max-w-[120px] truncate">
                          {dv.vendorName}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreferred(i)}
                          title={
                            dv.isPreferred ? "Preferred" : "Mark as preferred"
                          }
                          className="shrink-0"
                        >
                          <Star
                            className={`h-3 w-3 ${
                              dv.isPreferred
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-300 hover:text-amber-400"
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeDialogVendor(i)}
                          className="shrink-0 text-slate-300 hover:text-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : editTarget ? (
                "Save Changes"
              ) : (
                "Add Process Code"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
