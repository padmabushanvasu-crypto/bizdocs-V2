import { useRef, useState } from "react";
import { CheckCircle, Download, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  parseExcelSmart, resolveColumns, extractRow, buildMappingSummary, generateTemplate,
  fieldDisplayName,
  type ImportConfig, type SkipReason,
} from "@/lib/import-utils";
import { useImportQueue, type BatchImportFn } from "@/lib/import-queue";

interface BackgroundImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dialog title e.g. "Import Items" */
  title: string;
  /** Short name for toast e.g. "items" */
  entityName: string;
  /** Field map from import-utils (ITEM_FIELD_MAP etc.) */
  fieldMap: Record<string, string[]>;
  /** Required field keys — used for mapping warnings */
  requiredFields?: string[];
  /** If provided, "Download Template" button appears */
  importConfig?: ImportConfig;
  /** The batch import function — called by the queue worker */
  batchFn: BatchImportFn;
  /** React Query keys to invalidate on completion */
  invalidateKeys?: string[][];
}

export default function BackgroundImportDialog({
  open,
  onOpenChange,
  title,
  entityName,
  fieldMap,
  requiredFields = [],
  importConfig,
  batchFn,
  invalidateKeys,
}: BackgroundImportDialogProps) {
  const { toast } = useToast();
  const { addJob } = useImportQueue();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [mappedCount, setMappedCount] = useState<number | null>(null);
  const [missingRequired, setMissingRequired] = useState<string[]>([]);
  const [pendingRows, setPendingRows] = useState<Record<string, string>[] | null>(null);
  const [pendingRowNums, setPendingRowNums] = useState<number[] | null>(null);

  const resetState = () => {
    setParsing(false);
    setParseError(null);
    setRowCount(null);
    setMappedCount(null);
    setMissingRequired([]);
    setPendingRows(null);
    setPendingRowNums(null);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setParseError(null);
    setPendingRows(null);
    setRowCount(null);

    try {
      // parseExcelSmart returns rows keyed by ORIGINAL HEADER NAMES
      const { rows: raw, rowNums, skipped } = await parseExcelSmart(file, fieldMap);

      if (raw.length === 0) {
        setParseError("No data rows found. Check that your file has the correct columns.");
        return;
      }

      // Remap to field-name keys for the batch function
      const headers = Object.keys(raw[0]);
      const colMap = resolveColumns(headers, fieldMap);
      const fieldRows = raw.map((r) => extractRow(r, headers, colMap));

      // Mapping summary
      const summary = buildMappingSummary(headers, colMap, fieldMap, requiredFields);
      setMappedCount(summary.found.length);
      setMissingRequired(summary.missingRequired);

      setPendingRows(fieldRows);
      setPendingRowNums(rowNums);
      setRowCount(fieldRows.length);

      if (skipped.length > 0) {
        // silently drop example/hint rows — they're expected
      }
    } catch (err: any) {
      setParseError(`Failed to read file: ${err.message ?? "unknown error"}`);
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const handleImport = () => {
    if (!pendingRows || !pendingRowNums || pendingRows.length === 0) return;

    addJob(title, pendingRows, pendingRowNums, batchFn, {
      onComplete: () => {
        invalidateKeys?.forEach((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        );
      },
    });

    toast({
      title: `Importing ${entityName} in background`,
      description: `${rowCount} rows queued — keep working, you'll be notified when done`,
    });

    resetState();
    onOpenChange(false);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {importConfig && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => generateTemplate(importConfig)}
            >
              <Download className="h-4 w-4" /> Download Template
            </Button>
          )}

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-border rounded-xl py-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            onClick={() => !parsing && fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            {parsing ? (
              <p className="text-sm text-muted-foreground">Reading file…</p>
            ) : parseError ? (
              <p className="text-sm text-red-600 px-4">{parseError}</p>
            ) : rowCount != null ? (
              <>
                <p className="text-sm font-medium text-green-700 flex items-center justify-center gap-1.5">
                  <CheckCircle className="h-4 w-4" />
                  {rowCount} rows ready to import
                </p>
                <p className="text-xs text-muted-foreground mt-1">Click to choose a different file</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-muted-foreground">Click to choose Excel file</p>
                <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />

          {/* Column mapping summary */}
          {rowCount != null && mappedCount != null && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
              <p className="font-medium">{mappedCount} column{mappedCount !== 1 ? "s" : ""} matched</p>
              {missingRequired.length > 0 && (
                <p className="text-amber-700">
                  Missing required: {missingRequired.map((f) => fieldDisplayName(f)).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!pendingRows || pendingRows.length === 0}
          >
            Import {rowCount != null ? `${rowCount} rows` : ""} in background
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
