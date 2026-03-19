import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, Printer, ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  fetchFatCertificate,
  updateFatCertificate,
  completeFatCertificate,
  bulkUpdateFatTestResults,
  type FatTestResult,
} from "@/lib/fat-api";
import { DocumentHeader } from "@/components/DocumentHeader";
import { format } from "date-fns";

const statusClass: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  passed: "bg-green-50 text-green-700 border border-green-200",
  failed: "bg-red-50 text-red-700 border border-red-200",
  conditional: "bg-blue-50 text-blue-700 border border-blue-200",
};
const statusLabels: Record<string, string> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
  conditional: "Conditional",
};

const resultBtnCls = (active: boolean, variant: string) => {
  if (!active) return "border border-border bg-background text-muted-foreground hover:bg-muted text-xs px-3 py-1 rounded font-medium transition-colors";
  if (variant === "pass") return "border border-green-500 bg-green-50 text-green-700 text-xs px-3 py-1 rounded font-semibold";
  if (variant === "fail") return "border border-red-500 bg-red-50 text-red-700 text-xs px-3 py-1 rounded font-semibold";
  return "border border-slate-400 bg-slate-100 text-slate-700 text-xs px-3 py-1 rounded font-semibold";
};

type OverallResult = "pass" | "fail" | "conditional";
type TestResultValue = "pass" | "fail" | "na" | "pending";

export default function FatCertificateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [localResults, setLocalResults] = useState<FatTestResult[]>([]);
  const [overallResult, setOverallResult] = useState<OverallResult | null>(null);
  const [notes, setNotes] = useState("");
  const [testedBy, setTestedBy] = useState("");
  const [witnessedBy, setWitnessedBy] = useState("");
  const [testDate, setTestDate] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const { data: fat, isLoading, isError } = useQuery({
    queryKey: ["fat-certificate", id],
    queryFn: () => fetchFatCertificate(id!),
    enabled: !!id,
    retry: 1,
  });

  useEffect(() => {
    if (fat) {
      setLocalResults(fat.test_results ?? []);
      setOverallResult(fat.overall_result as OverallResult | null);
      setNotes(fat.notes ?? "");
      setTestedBy(fat.tested_by ?? "");
      setWitnessedBy(fat.witnessed_by ?? "");
      setTestDate(fat.test_date ?? "");
    }
  }, [fat]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await bulkUpdateFatTestResults(
        localResults.map((r) => ({
          id: r.id,
          required_value: r.required_value,
          actual_value: r.actual_value,
          unit: r.unit,
          result: r.result,
          remarks: r.remarks,
        }))
      );
      await updateFatCertificate(id!, {
        tested_by: testedBy || null,
        witnessed_by: witnessedBy || null,
        test_date: testDate || null,
        notes: notes || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fat-certificate", id] });
      setDirty(false);
      toast({ title: "Progress saved" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      // Save latest test results first
      await bulkUpdateFatTestResults(
        localResults.map((r) => ({
          id: r.id,
          required_value: r.required_value,
          actual_value: r.actual_value,
          unit: r.unit,
          result: r.result,
          remarks: r.remarks,
        }))
      );
      await updateFatCertificate(id!, {
        tested_by: testedBy || null,
        witnessed_by: witnessedBy || null,
        test_date: testDate || null,
        notes: notes || null,
      });
      await completeFatCertificate(id!, overallResult!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fat-certificate", id] });
      queryClient.invalidateQueries({ queryKey: ["fat-certificates"] });
      queryClient.invalidateQueries({ queryKey: ["fat-stats"] });
      queryClient.invalidateQueries({ queryKey: ["serial-numbers"] });
      queryClient.invalidateQueries({ queryKey: ["serial-stats"] });
      setCompleteOpen(false);
      toast({ title: "FAT Certificate completed", description: `Result: ${overallResult?.toUpperCase()}` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateResult = (idx: number, field: keyof FatTestResult, value: string) => {
    setLocalResults((prev) => {
      const next = [...prev];
      (next[idx] as any)[field] = value;
      return next;
    });
    setDirty(true);
  };

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  if (isError) return (
    <div className="p-6 text-center">
      <ClipboardCheck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground font-medium">Unable to load FAT certificate</p>
      <p className="text-xs text-muted-foreground mt-1">The database table may not be set up yet. Run the Phase 8 migration.</p>
    </div>
  );
  if (!fat) return <div className="p-6 text-center text-muted-foreground">FAT Certificate not found.</div>;

  const isCompleted = fat.status !== "pending";
  const allTested = localResults.length > 0 && localResults.every((r) => r.result !== "pending");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate("/fat-certificates")} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> FAT Certificates
        </Button>
        <div className="flex gap-2">
          {!isCompleted && dirty && (
            <Button variant="outline" size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Progress"}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
          </Button>
        </div>
      </div>

      {/* Document */}
      <div className="paper-card space-y-6">
        {/* Company Header (print only) */}
        <div className="print:block hidden">
          <DocumentHeader />
        </div>

        {/* Certificate Title */}
        <div className="text-center border-b border-border pb-4">
          <h2 className="text-lg font-display font-bold text-primary uppercase tracking-wider">
            Factory Acceptance Test Certificate
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            This certificate is valid only for the serial number stated below
          </p>
        </div>

        {/* Status + FAT Number */}
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <h1 className="text-xl font-mono font-bold text-foreground">{fat.fat_number}</h1>
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${statusClass[fat.status]}`}>
            {statusLabels[fat.status]}
          </span>
        </div>

        {/* Header Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div className="border border-border rounded-lg p-4 space-y-2">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Certificate Details</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">FAT Number</span>
              <span className="font-mono font-semibold">{fat.fat_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{format(new Date(fat.fat_date), "dd MMM yyyy")}</span>
            </div>
            {fat.serial_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Serial Number</span>
                <span className="font-mono font-semibold">{fat.serial_number}</span>
              </div>
            )}
            {fat.assembly_order_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assembly Order</span>
                <span className="font-mono">{fat.assembly_order_number}</span>
              </div>
            )}
          </div>

          <div className="border border-border rounded-lg p-4 space-y-2">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-2">Item Details</p>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Item</span>
              <span className="font-medium text-right">{fat.item_description ?? "—"}</span>
            </div>
            {fat.item_code && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item Code</span>
                <span className="font-mono">{fat.item_code}</span>
              </div>
            )}
            {fat.drawing_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Drawing No</span>
                <span className="font-mono">{fat.drawing_number}{fat.drawing_revision ? ` Rev.${fat.drawing_revision}` : ""}</span>
              </div>
            )}
            {fat.customer_name && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{fat.customer_name}</span>
              </div>
            )}
            {fat.customer_po_ref && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer PO</span>
                <span className="font-mono">{fat.customer_po_ref}</span>
              </div>
            )}
          </div>
        </div>

        {/* Test Details Fields (editable when pending) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Test Date</Label>
            {isCompleted ? (
              <p className="text-sm">{fat.test_date ? format(new Date(fat.test_date), "dd MMM yyyy") : "—"}</p>
            ) : (
              <Input
                type="date"
                value={testDate}
                onChange={(e) => { setTestDate(e.target.value); setDirty(true); }}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Tested By</Label>
            {isCompleted ? (
              <p className="text-sm">{fat.tested_by ?? "—"}</p>
            ) : (
              <Input
                value={testedBy}
                onChange={(e) => { setTestedBy(e.target.value); setDirty(true); }}
                placeholder="Name of engineer"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Witnessed By (Customer)</Label>
            {isCompleted ? (
              <p className="text-sm">{fat.witnessed_by ?? "—"}</p>
            ) : (
              <Input
                value={witnessedBy}
                onChange={(e) => { setWitnessedBy(e.target.value); setDirty(true); }}
                placeholder="Customer representative"
              />
            )}
          </div>
        </div>

        {/* Test Results Table */}
        <div>
          <h3 className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-3">Test Results</h3>
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-secondary text-muted-foreground text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left min-w-[160px]">Test Parameter</th>
                  <th className="px-3 py-2 text-left w-28">Standard</th>
                  <th className="px-3 py-2 text-left w-28">Required</th>
                  <th className="px-3 py-2 text-left w-28">Actual</th>
                  <th className="px-3 py-2 text-left w-16">Unit</th>
                  <th className="px-3 py-2 text-left w-36 print:hidden">Result</th>
                  <th className="px-3 py-2 text-left hidden print:table-cell">Result</th>
                  <th className="px-3 py-2 text-left min-w-[100px]">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {localResults.map((r, i) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.test_name}</td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{r.test_standard ?? "—"}</td>
                    <td className="px-3 py-2">
                      {isCompleted ? (
                        <span>{r.required_value ?? "—"}</span>
                      ) : (
                        <Input
                          value={r.required_value ?? ""}
                          onChange={(e) => updateResult(i, "required_value", e.target.value)}
                          className="h-7 text-xs"
                          placeholder="Spec"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isCompleted ? (
                        <span className="font-mono font-semibold">{r.actual_value ?? "—"}</span>
                      ) : (
                        <Input
                          value={r.actual_value ?? ""}
                          onChange={(e) => updateResult(i, "actual_value", e.target.value)}
                          className="h-7 text-xs font-mono"
                          placeholder="Measured"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isCompleted ? (
                        <span className="text-muted-foreground">{r.unit ?? "—"}</span>
                      ) : (
                        <Input
                          value={r.unit ?? ""}
                          onChange={(e) => updateResult(i, "unit", e.target.value)}
                          className="h-7 text-xs"
                          placeholder="—"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2 print:hidden">
                      {isCompleted ? (
                        <span
                          className={
                            r.result === "pass"
                              ? "text-green-700 font-semibold"
                              : r.result === "fail"
                              ? "text-red-700 font-semibold"
                              : r.result === "na"
                              ? "text-muted-foreground"
                              : "text-amber-600"
                          }
                        >
                          {r.result === "pass" ? "PASS" : r.result === "fail" ? "FAIL" : r.result === "na" ? "N/A" : "Pending"}
                        </span>
                      ) : (
                        <div className="flex gap-1">
                          {(["pass", "fail", "na"] as TestResultValue[]).map((v) => (
                            <button
                              key={v}
                              className={resultBtnCls(r.result === v, v)}
                              onClick={() => updateResult(i, "result", v)}
                            >
                              {v === "pass" ? "Pass" : v === "fail" ? "Fail" : "N/A"}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 hidden print:table-cell text-xs font-medium">
                      {r.result === "pass" ? "PASS" : r.result === "fail" ? "FAIL" : r.result === "na" ? "N/A" : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {isCompleted ? (
                        <span className="text-muted-foreground text-xs">{r.remarks ?? "—"}</span>
                      ) : (
                        <Input
                          value={r.remarks ?? ""}
                          onChange={(e) => updateResult(i, "remarks", e.target.value)}
                          className="h-7 text-xs"
                          placeholder="—"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Completion Banner (when done) */}
        {isCompleted && fat.completed_at && (
          <div className={`rounded-lg px-4 py-3 flex items-center gap-3 ${fat.status === "passed" ? "bg-green-50 border border-green-200" : fat.status === "failed" ? "bg-red-50 border border-red-200" : "bg-blue-50 border border-blue-200"}`}>
            {fat.status === "passed" ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            ) : fat.status === "failed" ? (
              <XCircle className="h-5 w-5 text-red-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-blue-600 shrink-0" />
            )}
            <div>
              <p className={`font-semibold text-sm ${fat.status === "passed" ? "text-green-800" : fat.status === "failed" ? "text-red-800" : "text-blue-800"}`}>
                Overall Result: {fat.overall_result?.toUpperCase() ?? fat.status.toUpperCase()}
              </p>
              <p className="text-xs text-muted-foreground">
                Completed {format(new Date(fat.completed_at), "dd MMM yyyy, h:mm a")}
                {fat.tested_by ? ` by ${fat.tested_by}` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Overall Result + Complete (only when pending) */}
        {!isCompleted && (
          <div className="border-t border-border pt-4 space-y-4 print:hidden">
            <div>
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-3 block">
                Overall Result
              </Label>
              <div className="flex gap-3">
                {(["pass", "fail", "conditional"] as OverallResult[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setOverallResult(v)}
                    className={`px-4 py-2 rounded-lg border-2 font-semibold text-sm transition-all ${
                      overallResult === v
                        ? v === "pass"
                          ? "border-green-500 bg-green-50 text-green-700"
                          : v === "fail"
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-border text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {v === "pass" ? "✓ PASS" : v === "fail" ? "✗ FAIL" : "⚠ CONDITIONAL"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground font-bold tracking-wider">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
                placeholder="Any additional notes or observations..."
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !dirty}
              >
                Save Progress
              </Button>
              <Button
                className="bg-primary"
                disabled={!allTested || !overallResult || completeMutation.isPending}
                onClick={() => setCompleteOpen(true)}
              >
                <ClipboardCheck className="h-4 w-4 mr-1" />
                Complete FAT Certificate
              </Button>
            </div>
            {!allTested && (
              <p className="text-xs text-amber-600 text-right">
                All tests must have a result (Pass / Fail / N/A) before completing.
              </p>
            )}
          </div>
        )}

        {/* Notes (read-only when completed) */}
        {isCompleted && fat.notes && (
          <div className="border-t border-border pt-4">
            <p className="text-xs uppercase text-muted-foreground font-bold tracking-wider mb-1">Notes</p>
            <p className="text-sm">{fat.notes}</p>
          </div>
        )}

        {/* Signature Block (print) */}
        <div className="grid grid-cols-2 gap-8 border-t border-border pt-6 text-center text-sm mt-4">
          <div>
            <p className="mb-14 text-muted-foreground font-medium">{fat.tested_by ?? ""}</p>
            <div className="border-t border-border pt-1">
              <p className="text-xs text-muted-foreground font-medium">Tested By — {fat.tested_by ?? "________________"}</p>
            </div>
          </div>
          <div>
            <p className="mb-14 text-muted-foreground font-medium">{fat.witnessed_by ?? ""}</p>
            <div className="border-t border-border pt-1">
              <p className="text-xs text-muted-foreground font-medium">
                Witnessed By (Customer) — {fat.witnessed_by ?? "________________"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Completion Confirm Dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete FAT Certificate?</DialogTitle>
            <DialogDescription>
              Mark this FAT as{" "}
              <strong className={overallResult === "pass" ? "text-green-700" : overallResult === "fail" ? "text-red-700" : "text-blue-700"}>
                {overallResult?.toUpperCase()}
              </strong>
              ? This action cannot be undone. The certificate will become read-only.
              {overallResult === "pass" && fat.serial_number && (
                <span className="block mt-2 text-green-700">
                  Serial number <strong>{fat.serial_number}</strong> will be marked as FAT Passed.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Go Back</Button>
            <Button
              className={overallResult === "pass" ? "bg-green-600 hover:bg-green-700 text-white" : overallResult === "fail" ? "bg-destructive text-white" : ""}
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? "Completing..." : `Confirm — ${overallResult?.toUpperCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
