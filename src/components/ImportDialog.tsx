import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet } from "lucide-react";
import {
  type ImportConfig, type ValidatedRow,
  generateTemplate, parseExcelFile, validateRows, generateErrorReport,
} from "@/lib/import-utils";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ImportConfig;
  onImport: (rows: ValidatedRow[]) => Promise<{ imported: number; warnings: number; skipped: number }>;
  existingNames?: string[];
}

const STEPS = ["Download Template", "Upload File", "Preview & Validate", "Import Complete"];

export default function ImportDialog({ open, onOpenChange, config, onImport, existingNames = [] }: ImportDialogProps) {
  const [step, setStep] = useState(0);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; warnings: number; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep(0);
    setValidatedRows([]);
    setResult(null);
    setImporting(false);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) throw new Error("No data rows found in file.");

      // Check for duplicates against existing names
      let validated = validateRows(rows, config);
      if (existingNames.length > 0) {
        const nameCol = config.columns.find((c) => c.key === "name" || c.label === "Company Name");
        if (nameCol) {
          const lowerNames = new Set(existingNames.map((n) => n.toLowerCase()));
          validated = validated.map((r) => {
            const name = r.data[nameCol.label]?.toLowerCase();
            if (name && lowerNames.has(name)) {
              return {
                ...r,
                status: r.status === "error" ? "error" : "warning",
                messages: [...r.messages, "Party already exists, will be skipped"],
              } as ValidatedRow;
            }
            return r;
          });
        }
      }

      setValidatedRows(validated);
      setStep(2);
    } catch (err: any) {
      alert(err.message || "Failed to parse file");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const validCount = validatedRows.filter((r) => r.status !== "error").length;
  const warningCount = validatedRows.filter((r) => r.status === "warning").length;
  const errorCount = validatedRows.filter((r) => r.status === "error").length;

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await onImport(validatedRows.filter((r) => r.status !== "error"));
      setResult(res);
      setStep(3);
    } catch (err: any) {
      alert(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import {config.label}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i < step ? "bg-primary text-primary-foreground"
                  : i === step ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}>{i + 1}</div>
              <span className={`text-xs truncate hidden sm:block ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s}</span>
              {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 0: Download Template */}
        {step === 0 && (
          <div className="space-y-4 text-center py-6">
            <FileSpreadsheet className="h-16 w-16 text-primary mx-auto" />
            <div>
              <h3 className="font-display font-bold text-foreground">Step 1: Download Template</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Download the Excel template, fill in your data (delete example rows), then come back to upload.
              </p>
            </div>
            <Button onClick={() => generateTemplate(config)} className="mx-auto">
              <Download className="h-4 w-4 mr-1" /> Download {config.label} Template
            </Button>
            <Button variant="outline" onClick={() => setStep(1)} className="mx-auto ml-2">
              I already have a file →
            </Button>
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-4 text-center py-6">
            <Upload className="h-16 w-16 text-muted-foreground mx-auto" />
            <div>
              <h3 className="font-display font-bold text-foreground">Step 2: Upload Your File</h3>
              <p className="text-sm text-muted-foreground mt-1">Upload the filled Excel file (.xlsx or .xls)</p>
            </div>
            <div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> Choose File
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setStep(0)}>← Back</Button>
          </div>
        )}

        {/* Step 2: Preview & Validate */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium">Ready: {validCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Warnings: {warningCount}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium">Errors: {errorCount}</span>
              </div>
            </div>

            {errorCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Fix errors before importing, or skip error rows and import the rest.
              </p>
            )}

            <div className="overflow-x-auto rounded-lg border border-slate-200 max-h-[300px] overflow-y-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">#</th>
                    {config.columns.slice(0, 6).map((c) => (
                      <th key={c.key} className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-left">{c.label}</th>
                    ))}
                    <th className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-slate-50 border-b border-slate-200 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validatedRows.map((row, i) => (
                    <tr key={i} className={
                      row.status === "error" ? "bg-destructive/5" :
                      row.status === "warning" ? "bg-amber-50" : ""
                    }>
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left text-muted-foreground">{i + 1}</td>
                      {config.columns.slice(0, 6).map((c) => (
                        <td key={c.key} className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-left max-w-[120px] truncate">{row.data[c.label] || "—"}</td>
                      ))}
                      <td className="px-3 py-2 text-sm text-slate-700 border-b border-slate-100 text-center">
                        {row.status === "valid" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                        {row.status === "warning" && (
                          <span className="flex items-center gap-1" title={row.messages.join(", ")}>
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                            <span className="text-amber-600 truncate max-w-[150px]">{row.messages[0]}</span>
                          </span>
                        )}
                        {row.status === "error" && (
                          <span className="flex items-center gap-1" title={row.messages.join(", ")}>
                            <XCircle className="h-3.5 w-3.5 text-destructive" />
                            <span className="text-destructive truncate max-w-[150px]">{row.messages[0]}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter className="flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setStep(1); setValidatedRows([]); }}>
                Fix in Excel and Re-upload
              </Button>
              <Button onClick={handleImport} disabled={importing || validCount === 0}>
                {importing ? "Importing..." : `Import Valid Rows (${validCount})`}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Complete */}
        {step === 3 && result && (
          <div className="space-y-4 text-center py-6">
            <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto" />
            <h3 className="font-display font-bold text-foreground">Import Complete!</h3>
            <div className="space-y-1 text-sm">
              <p className="text-emerald-700">✓ {result.imported} {config.label.toLowerCase()} imported successfully</p>
              {result.warnings > 0 && <p className="text-amber-600">⚠ {result.warnings} imported with warnings</p>}
              {result.skipped > 0 && <p className="text-destructive">✗ {result.skipped} skipped due to errors</p>}
            </div>
            {errorCount > 0 && (
              <Button variant="outline" size="sm" onClick={() => generateErrorReport(validatedRows, config)}>
                <Download className="h-4 w-4 mr-1" /> Download Error Report
              </Button>
            )}
            <div>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
