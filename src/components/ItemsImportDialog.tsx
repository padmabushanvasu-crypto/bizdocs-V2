import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import {
  resolveColumns, extractRow,
  normalizeItemType, normalizeUnit,
  generateTemplate, ITEMS_IMPORT_CONFIG, ITEM_FIELD_MAP,
  type SkipReason,
} from "@/lib/import-utils";
import { useImportQueue, type BatchImportFn } from "@/lib/import-queue";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ItemsImportDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { addJob } = useImportQueue();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [pendingRows, setPendingRows] = useState<Record<string, string>[] | null>(null);
  const [pendingRowNums, setPendingRowNums] = useState<number[] | null>(null);
  const [parsing, setParsing] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    try {
      const XLSX = await import("xlsx-js-style");
      const buffer = await file.arrayBuffer();
      const wb = (XLSX as any).read(new Uint8Array(buffer), { type: "array", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows = (XLSX as any).utils.sheet_to_json(ws, {
        header: 1, defval: "", raw: false,
      }) as string[][];

      if (allRows.length < 2) {
        toast({ title: "No data", description: "The file has no data rows.", variant: "destructive" });
        return;
      }

      // Find header row: score first 10 rows against known field aliases
      const allAliases = Object.values(ITEM_FIELD_MAP).flat().map((a) => a.toLowerCase().replace(/\s+/g, " ").trim());
      const scanLimit = Math.min(10, allRows.length);
      let headerRowIdx = 0;
      let bestScore = -1;
      for (let i = 0; i < scanLimit; i++) {
        let score = 0;
        for (const cell of allRows[i]) {
          const norm = String(cell).toLowerCase().replace(/\s+/g, " ").trim();
          if (norm.length >= 2 && allAliases.some((a) => norm === a || a.includes(norm) || norm.includes(a))) score++;
        }
        if (score > bestScore) { bestScore = score; headerRowIdx = i; }
      }

      const headers = allRows[headerRowIdx].map((c) => String(c).trim());
      const colMap = resolveColumns(headers, ITEM_FIELD_MAP);

      const rows: Record<string, string>[] = [];
      const rowNums: number[] = [];
      for (let i = headerRowIdx + 1; i < allRows.length; i++) {
        const extracted = extractRow(allRows[i] as any, headers, colMap);
        if (!extracted["description"]?.trim() && !extracted["drawing_revision"]?.trim()) continue;
        rows.push(extracted);
        rowNums.push(i + 1);
      }

      setPendingRows(rows);
      setPendingRowNums(rowNums);
      setRowCount(rows.length);
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const handleImport = () => {
    if (!pendingRows || !pendingRowNums || pendingRows.length === 0) return;

    const importFn: BatchImportFn = async (rows, rowNums, onProgress) => {
      const companyId = await getCompanyId();

      const { data: existingItems } = await supabase
        .from("items").select("id, item_code, drawing_revision").eq("company_id", companyId);

      const byCode = new Map<string, string>(
        (existingItems ?? [])
          .filter((i: any) => i.item_code)
          .map((i: any) => [(i.item_code as string).toLowerCase(), i.id as string])
      );
      const byDrawing = new Map<string, { id: string; item_code: string }>(
        (existingItems ?? [])
          .filter((i: any) => i.drawing_revision)
          .map((i: any) => [
            (i.drawing_revision as string).toLowerCase(),
            { id: i.id as string, item_code: i.item_code as string },
          ])
      );

      let imported = 0;
      let updatedCount = 0;
      let skipped = 0;
      let autoIdx = 1;
      const errors: string[] = [];
      const skipReasons: SkipReason[] = [];
      const toInsert: any[] = [];
      const toUpdate: any[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const excelRow = rowNums[i] ?? (i + 2);
        const code = row["item_code"]?.trim() || "";
        const drawingNum = row["drawing_revision"]?.trim() || "";
        const desc = row["description"]?.trim() || "";

        if (!desc) {
          skipped++;
          skipReasons.push({ row: excelRow, value: code || drawingNum, reason: "Description was blank" });
          continue;
        }

        let existingId: string | null = null;
        let resolvedCode = code;

        if (code) {
          existingId = byCode.get(code.toLowerCase()) ?? null;
        } else if (drawingNum) {
          const match = byDrawing.get(drawingNum.toLowerCase());
          if (match) { existingId = match.id; resolvedCode = match.item_code || drawingNum; }
          else resolvedCode = drawingNum;
        } else {
          const words = desc.split(/\s+/).slice(0, 3)
            .map((w) => w.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
          resolvedCode = `${words.join("-")}-${String(autoIdx).padStart(4, "0")}`;
          autoIdx++;
        }

        const itemData: any = {
          company_id: companyId,
          item_code: resolvedCode || null,
          description: desc,
          item_type: normalizeItemType(row["item_type"] || "raw_material"),
          unit: normalizeUnit(row["unit"] || "NOS"),
          hsn_sac_code: row["hsn_sac_code"] || null,
          gst_rate: parseFloat(row["gst_rate"] || "18") || 18,
          min_stock: parseFloat(row["min_stock"] || "0") || 0,
          notes: row["notes"] || null,
          drawing_number: drawingNum || null,
          drawing_revision: drawingNum || null,
          standard_cost: parseFloat(row["standard_cost"] || "0") || 0,
          purchase_price: parseFloat(row["purchase_price"] || "0") || 0,
          sale_price: parseFloat(row["sale_price"] || "0") || 0,
        };

        if (existingId) toUpdate.push({ id: existingId, ...itemData });
        else toInsert.push(itemData);
      }

      const totalOps = toInsert.length + toUpdate.length;

      // Bulk insert new items in chunks of 50
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        try {
          const { error } = await supabase.from("items").insert(chunk);
          if (error) throw error;
          imported += chunk.length;
        } catch {
          for (const item of chunk) {
            try {
              const { error } = await supabase.from("items").insert(item);
              if (error) throw error;
              imported++;
            } catch (err: any) {
              skipped++;
              errors.push(`${item.description}: ${err?.message ?? "unknown error"}`);
            }
          }
        }
        if (totalOps > 0) onProgress?.(Math.round(((imported + updatedCount) / totalOps) * 100));
      }

      // Bulk upsert existing items in chunks of 50
      for (let i = 0; i < toUpdate.length; i += 50) {
        const chunk = toUpdate.slice(i, i + 50);
        try {
          const { error } = await supabase.from("items").upsert(chunk, { onConflict: "id" });
          if (error) throw error;
          updatedCount += chunk.length;
        } catch {
          for (const item of chunk) {
            const { id, ...rest } = item;
            try {
              const { error } = await supabase.from("items").update(rest).eq("id", id);
              if (error) throw error;
              updatedCount++;
            } catch (err: any) {
              skipped++;
              errors.push(`${rest.description}: ${err?.message ?? "unknown error"}`);
            }
          }
        }
        if (totalOps > 0) onProgress?.(Math.round(((imported + updatedCount) / totalOps) * 100));
      }

      return { imported, skipped, errors, skipReasons, updated: updatedCount };
    };

    addJob("Items", pendingRows, pendingRowNums, importFn, {
      onComplete: () => {
        queryClient.invalidateQueries({ queryKey: ["items"] });
      },
    });

    toast({
      title: "Importing items in background",
      description: `${rowCount} rows queued — keep working, we'll notify you when done`,
    });

    // Reset and close immediately
    setPendingRows(null);
    setPendingRowNums(null);
    setRowCount(null);
    onOpenChange(false);
  };

  const handleClose = () => {
    setPendingRows(null);
    setPendingRowNums(null);
    setRowCount(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import Items</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => generateTemplate(ITEMS_IMPORT_CONFIG)}
          >
            <Download className="h-4 w-4" /> Download Template
          </Button>

          <div
            className="border-2 border-dashed border-border rounded-xl py-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            {parsing ? (
              <p className="text-sm text-muted-foreground">Reading file…</p>
            ) : rowCount != null ? (
              <>
                <p className="text-sm font-medium text-green-700">{rowCount} rows ready to import</p>
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
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
