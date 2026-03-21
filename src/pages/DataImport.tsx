import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, CheckCircle, XCircle, AlertTriangle, Table, Users, Package, GitFork, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { createParty } from "@/lib/parties-api";
import { createItem } from "@/lib/items-api";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import {
  resolveColumns, extractRow, buildMappingSummary,
  normalizePartyType, normalizeItemType, normaliseHeader, fieldDisplayName,
  PARTY_FIELD_MAP, ITEM_FIELD_MAP, BOM_FIELD_MAP, STOCK_FIELD_MAP,
  type ColumnMappingSummary, type SkipReason,
} from "@/lib/import-utils";
import { useImportQueue, type BatchImportFn } from "@/lib/import-queue";

// Returns true if the given primary-key cell value looks like a hint/instruction.
// Only applied to the first 3 rows after the detected header row.
function isHintRow(primaryCell: string): boolean {
  const lower = primaryCell.toLowerCase().trim();
  if (!lower) return false;
  const HINT_PHRASES = [
    "e.g.", "example", "required", "optional", "code of", "full ",
    "company legal", "vendor / customer", "raw_material /", "drawing number or",
    "enter ", "type here", "fill in", "same as", "description",
  ];
  if (lower.length > 80) return true;
  if (/ \/ /.test(primaryCell)) return true; // "vendor / customer / both"
  if (HINT_PHRASES.some((p) => lower.includes(p))) return true;
  return false;
}

// Smart Excel parser: auto-detects header row by scoring the first 10 rows against
// known field aliases. Returns parsed data rows, their 1-based Excel row numbers,
// and a list of rows that were automatically skipped (with reasons).
async function parseExcelSmart(
  file: File,
  fieldMap: Record<string, string[]>
): Promise<{ rows: Record<string, string>[]; rowNums: number[]; skipped: SkipReason[] }> {
  const XLSX = await import("xlsx-js-style");
  const buffer = await file.arrayBuffer();
  const wb = (XLSX as any).read(new Uint8Array(buffer), { type: "array", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const allRows = (XLSX as any).utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];

  if (allRows.length === 0) return { rows: [], rowNums: [], skipped: [] };

  const allAliases = Object.values(fieldMap).flat().map(normaliseHeader).filter((a) => a.length >= 3);

  // Score first 10 rows to find the header row
  const scanLimit = Math.min(10, allRows.length);
  let headerRowIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < scanLimit; i++) {
    let score = 0;
    for (const cell of allRows[i]) {
      const norm = normaliseHeader(String(cell));
      if (norm.length < 2) continue;
      if (allAliases.some((a) => norm === a || norm.includes(a) || a.includes(norm))) score++;
    }
    if (score > bestScore) { bestScore = score; headerRowIdx = i; }
  }

  const headers = allRows[headerRowIdx].map((c) => String(c).trim());

  // Find the primary-key column (first field that resolved to a column index)
  const colMap = resolveColumns(headers, fieldMap);
  const primaryKeyColIdx = Object.keys(colMap).length > 0 ? Object.values(colMap)[0] : 0;

  // Phrases that universally indicate example/instruction rows
  const SKIP_PHRASES = ["required field", "example data", "how to use", "instructions", "sample only", "do not change", "delete this row"];

  const rows: Record<string, string>[] = [];
  const rowNums: number[] = [];
  const skipped: SkipReason[] = [];

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    const excelRowNum = i + 1; // 1-based
    const positionAfterHeader = i - headerRowIdx - 1; // 0-based offset from first post-header row
    const primaryCell = String(row[primaryKeyColIdx] ?? "").trim();

    // Universal skip: SKIP_PHRASES in any cell
    const rowText = row.map((c) => String(c)).join(" ").toLowerCase();
    if (SKIP_PHRASES.some((p) => rowText.includes(p))) {
      skipped.push({ row: excelRowNum, value: primaryCell, reason: "Example data row — skipped automatically" });
      continue;
    }

    // Hint-row check: only apply to first 3 positions after header
    if (positionAfterHeader < 3 && isHintRow(primaryCell)) {
      skipped.push({ row: excelRowNum, value: primaryCell, reason: "Instruction row — skipped automatically" });
      continue;
    }

    const mapped: Record<string, string> = {};
    let hasData = false;
    headers.forEach((header, idx) => {
      const val = String(row[idx] ?? "").trim();
      if (header) {
        mapped[header] = val;
        if (val) hasData = true;
      }
    });
    if (hasData) {
      rows.push(mapped);
      rowNums.push(excelRowNum);
    }
  }

  return { rows, rowNums, skipped };
}


// ── Template download helpers ──────────────────────────────────────────────

async function downloadTemplate(sheetName: string, headers: string[]) {
  const XLSX = await import("xlsx-js-style");
  const wb = (XLSX as any).utils.book_new();
  const ws = (XLSX as any).utils.aoa_to_sheet([headers]);
  (XLSX as any).utils.book_append_sheet(wb, ws, sheetName);
  (XLSX as any).writeFile(wb, `${sheetName.replace(/\s/g, "_")}_Template.xlsx`);
}

async function downloadBOMTemplate() {
  const XLSX = await import("xlsx-js-style");
  const wb = (XLSX as any).utils.book_new();
  const headers = ["Finished Item Code *", "Component Code *", "Quantity *", "Unit", "Scrap Factor %", "Variant Name", "Notes"];
  const examples = [
    ["PROD-001", "COMP-A", "2", "NOS", "5", "", "Main component"],
    ["PROD-001", "COMP-B", "1", "KG", "0", "Variant-1", "Optional variant"],
    ["PROD-002", "COMP-A", "4", "NOS", "2", "", "Sub-assembly use"],
  ];
  const ws = (XLSX as any).utils.aoa_to_sheet([headers, ...examples]);
  // Style header row bold
  headers.forEach((_h, i) => {
    const cell = String.fromCharCode(65 + i) + "1";
    if (ws[cell]) ws[cell].s = { font: { bold: true } };
  });
  (XLSX as any).utils.book_append_sheet(wb, ws, "BOM Import");
  (XLSX as any).writeFile(wb, "BOM_Import_Template.xlsx");
}

const PARTY_HEADERS = ["Party Name *", "Party Type (vendor/customer/both) *", "Contact Person", "Address Line 1", "City", "State", "PIN Code", "Phone 1", "Email", "GSTIN", "PAN", "Payment Terms", "Notes"];
const ITEM_HEADERS = ["Item Code *", "Description *", "Item Type *", "Unit", "HSN/SAC Code", "Sale Price", "Purchase Price", "GST Rate %", "Min Stock", "Notes"];
const BOM_HEADERS = ["Finished Item Code *", "Component Code *", "Quantity *", "Unit", "Scrap Factor %", "Variant Name", "Notes"];
// BOM template is handled by downloadBOMTemplate() with example rows
const STOCK_HEADERS = ["Item Code *", "Opening Stock Qty *", "Notes"];

// ── Column Mapping Summary ─────────────────────────────────────────────────

function MappingSummaryBar({ summary, columnWarnings }: { summary: ColumnMappingSummary; columnWarnings?: string[] }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        {summary.found.map(({ originalHeader, field }) => (
          <span key={field} className="inline-flex items-center gap-1 text-green-700">
            <CheckCircle className="h-3 w-3 shrink-0" />
            <span className="font-medium">{originalHeader}</span>
            <span className="text-slate-400">→</span>
            <span className="text-slate-600">{fieldDisplayName(field)}</span>
          </span>
        ))}
        {summary.missingOptional.length > 0 && (
          <span className="text-slate-400">
            — {summary.missingOptional.length} optional column{summary.missingOptional.length !== 1 ? "s" : ""} not found (skipped)
          </span>
        )}
      </div>
      {columnWarnings && columnWarnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          <span className="font-semibold">Column warning: </span>
          {columnWarnings.join(" · ")}
          {" "}Rows missing these values will be skipped.
        </div>
      )}
    </div>
  );
}

// ── Preview Table ──────────────────────────────────────────────────────────

function PreviewTable({ rows, errorRows }: { rows: Record<string, string>[]; errorRows: Set<number> }) {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);
  return (
    <div className="overflow-auto max-h-64 border border-border rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-muted sticky top-0">
          <tr>
            <th className="px-2 py-1.5 text-left text-muted-foreground font-semibold">#</th>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1.5 text-left text-muted-foreground font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={errorRows.has(i) ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
              <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
              {headers.map((h) => (
                <td key={h} className="px-2 py-1 max-w-[160px] truncate">{String(row[h] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Preview Table with per-row error tooltip ───────────────────────────────

function PreviewTableWithErrors({
  rows,
  errorRows,
  errorMessages,
}: {
  rows: Record<string, string>[];
  errorRows: Set<number>;
  errorMessages: Map<number, string>;
}) {
  if (rows.length === 0) return null;
  const headers = Object.keys(rows[0]);
  return (
    <div className="overflow-auto max-h-64 border border-border rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-muted sticky top-0">
          <tr>
            <th className="px-2 py-1.5 text-left text-muted-foreground font-semibold">#</th>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1.5 text-left text-muted-foreground font-semibold whitespace-nowrap">
                {h}
              </th>
            ))}
            <th className="px-2 py-1.5 text-left text-muted-foreground font-semibold">Issue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const hasError = errorRows.has(i);
            return (
              <tr key={i} className={hasError ? "bg-red-50" : i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                {headers.map((h) => (
                  <td key={h} className="px-2 py-1 max-w-[140px] truncate">{String(row[h] ?? "")}</td>
                ))}
                <td className="px-2 py-1 text-red-700 text-[10px] max-w-[160px]">
                  {hasError ? errorMessages.get(i) : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Skip Reasons Panel ─────────────────────────────────────────────────────

function SkipReasonsPanel({ reasons }: { reasons: SkipReason[] }) {
  const [open, setOpen] = useState(false);
  if (reasons.length === 0) return null;
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 text-slate-700 font-medium text-left hover:bg-slate-100 transition-colors"
      >
        <span>{open ? "▼" : "▶"}</span>
        <span>{reasons.length} row{reasons.length !== 1 ? "s" : ""} skipped — click to see reasons</span>
      </button>
      {open && (
        <div className="overflow-auto max-h-56">
          <table className="w-full">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground w-12">Row</th>
                <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground w-32">Value</th>
                <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Reason</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((r, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-muted/20"}>
                  <td className="px-2 py-1 text-muted-foreground">{r.row}</td>
                  <td className="px-2 py-1 font-medium max-w-[8rem] truncate">{r.value || "(blank)"}</td>
                  <td className="px-2 py-1 text-slate-600">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── BOM Import Tab (async validation + upsert + variant support) ───────────

function BOMImportTab() {
  const { toast } = useToast();
  const { addJob } = useImportQueue();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [validRows, setValidRows] = useState<Record<string, string>[]>([]);
  const [validRowNums, setValidRowNums] = useState<number[]>([]);
  const [errorRows, setErrorRows] = useState<Set<number>>(new Set());
  const [errorMessages, setErrorMessages] = useState<Map<number, string>>(new Map());
  const [errors, setErrors] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [mappingSummary, setMappingSummary] = useState<ColumnMappingSummary | null>(null);
  const [columnWarnings, setColumnWarnings] = useState<string[]>([]);
  const [skipReasons, setSkipReasons] = useState<SkipReason[]>([]);

  const clearAll = () => {
    setRows([]); setValidRows([]); setValidRowNums([]); setErrors([]);
    setErrorRows(new Set()); setErrorMessages(new Map()); setResult(null);
    setMappingSummary(null); setColumnWarnings([]); setSkipReasons([]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows: raw, rowNums: rawRowNums, skipped: parsedSkips } = await parseExcelSmart(file, BOM_FIELD_MAP);

      if (raw.length === 0) {
        toast({ title: "No data found", description: "The file is empty or contains only column headers.", variant: "destructive" });
        e.target.value = "";
        return;
      }

      const bomHeaders = Object.keys(raw[0]);
      const bomColMap = resolveColumns(bomHeaders, BOM_FIELD_MAP);
      const bomSummary = buildMappingSummary(bomHeaders, bomColMap, BOM_FIELD_MAP, ["finished_item_code", "component_code", "quantity"]);
      setMappingSummary(bomSummary);

      const warnings = bomSummary.missingRequired.map((f) => `"${fieldDisplayName(f)}" column not found`);
      setColumnWarnings(warnings);

      const parsed = raw.map((r) => extractRow(r, bomHeaders, bomColMap));

      setRows(parsed);
      setValidating(true);
      setResult(null);

      // Collect all codes for batch existence check
      const allCodes = [
        ...new Set(
          parsed.flatMap((r) =>
            [r["finished_item_code"]?.trim(), r["component_code"]?.trim()].filter(Boolean)
          )
        ),
      ];
      const { data: itemsByCode } = await supabase
        .from("items").select("id, item_code, drawing_revision").in("item_code", allCodes);
      // resolvedCodes stores normalized (lowercase) versions of every code that matched an item
      const resolvedCodes = new Set<string>(
        (itemsByCode ?? []).map((i: any) => (i.item_code as string).toLowerCase())
      );

      // For codes not found by item_code, try drawing_revision ILIKE (case-insensitive)
      const missingCodes = allCodes.filter((c) => !resolvedCodes.has(c.toLowerCase()));
      if (missingCodes.length > 0) {
        const ilikeFilter = missingCodes.map((c) => `drawing_revision.ilike.${c}`).join(",");
        const { data: itemsByRev } = await supabase
          .from("items").select("id, item_code, drawing_revision").or(ilikeFilter);
        for (const item of (itemsByRev ?? []) as any[]) {
          if (item.drawing_revision) {
            // Mark whichever missing code this item's drawing_revision matches
            const matched = missingCodes.find(
              (c) => c.toLowerCase() === (item.drawing_revision as string).toLowerCase()
            );
            if (matched) resolvedCodes.add(matched.toLowerCase());
          }
        }
      }

      const newErrorRows = new Set<number>();
      const newErrorMsgs = new Map<number, string>();
      const newErrors: string[] = [];
      const newValidRows: Record<string, string>[] = [];
      const newValidRowNums: number[] = [];
      const newSkipReasons: SkipReason[] = [...parsedSkips];

      parsed.forEach((row, i) => {
        const excelRow = rawRowNums[i] ?? (i + 2);
        const parentCode = row["finished_item_code"]?.trim();
        const childCode = row["component_code"]?.trim();
        const qty = parseFloat(row["quantity"] || "0");

        let rowError = "";
        if (!parentCode) rowError = "Finished Item Code was blank or missing";
        else if (!childCode) rowError = "Component Code was blank or missing";
        else if (isNaN(qty) || qty <= 0) rowError = "Quantity must be a number greater than 0";
        else if (parentCode === childCode) rowError = "Parent and component cannot be the same item";
        else if (!resolvedCodes.has(parentCode.toLowerCase())) rowError = `Item '${parentCode}' not found — checked both item code and drawing number`;
        else if (!resolvedCodes.has(childCode.toLowerCase())) rowError = `Item '${childCode}' not found — checked both item code and drawing number`;

        if (rowError) {
          newErrorRows.add(i);
          newErrorMsgs.set(i, rowError);
          newErrors.push(`Row ${excelRow} (${parentCode || "blank"}): ${rowError}`);
          newSkipReasons.push({ row: excelRow, value: parentCode || "", reason: rowError });
        } else {
          newValidRows.push(row);
          newValidRowNums.push(excelRow);
        }
      });

      setErrorRows(newErrorRows);
      setErrorMessages(newErrorMsgs);
      setErrors(newErrors);
      setValidRows(newValidRows);
      setValidRowNums(newValidRowNums);
      setSkipReasons(newSkipReasons);
      setValidating(false);
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
      setValidating(false);
    }
    e.target.value = "";
  };

  // Extracted as BatchImportFn so addJob can call it in batches of 50
  const bomImportFn: BatchImportFn = async (batchRows, batchRowNums) => {
    const companyId = await getCompanyId();
    const codes = [
      ...new Set(
        batchRows.flatMap((r) =>
          [r["finished_item_code"]?.trim(), r["component_code"]?.trim()].filter(Boolean)
        )
      ),
    ];
    const { data: itemsData } = await supabase.from("items").select("id, item_code, drawing_revision").in("item_code", codes);
    // codeToId keys are lowercased input codes for case-insensitive lookup
    const codeToId = new Map<string, string>(
      (itemsData ?? []).map((i: any) => [(i.item_code as string).toLowerCase(), i.id as string])
    );

    // For codes not resolved by item_code, try drawing_revision ILIKE
    const missingCodes = codes.filter((c) => !codeToId.has(c.toLowerCase()));
    if (missingCodes.length > 0) {
      const ilikeFilter = missingCodes.map((c) => `drawing_revision.ilike.${c}`).join(",");
      const { data: byRevData } = await supabase.from("items").select("id, item_code, drawing_revision").or(ilikeFilter);
      for (const item of (byRevData ?? []) as any[]) {
        if (item.drawing_revision) {
          const matched = missingCodes.find(
            (c) => c.toLowerCase() === (item.drawing_revision as string).toLowerCase()
          );
          if (matched) codeToId.set(matched.toLowerCase(), item.id as string);
        }
      }
    }

    let imported = 0, skipped = 0;
    const errors: string[] = [];
    const skipReasons: SkipReason[] = [];

    for (let i = 0; i < batchRows.length; i++) {
      const row = batchRows[i];
      const excelRow = batchRowNums[i] ?? (i + 2);
      const parentCode = row["finished_item_code"]?.trim();
      const childCode = row["component_code"]?.trim();
      const qty = parseFloat(row["quantity"] || "0");
      const parentId = codeToId.get(parentCode.toLowerCase());
      const childId = codeToId.get(childCode.toLowerCase());
      if (!parentId || !childId) {
        skipped++;
        const missingCode = !parentId ? parentCode : childCode;
        skipReasons.push({ row: excelRow, value: parentCode || "", reason: `Item '${missingCode}' not found — checked both item code and drawing number` });
        continue;
      }

      // Variant find-or-create
      const variantName = row["variant_name"]?.trim();
      let variantId = null;
      if (variantName) {
        const { data: existingVariant } = await (supabase as any)
          .from("bom_variants").select("id")
          .eq("parent_item_id", parentId).eq("variant_name", variantName).maybeSingle();
        if (existingVariant) {
          variantId = existingVariant.id;
        } else {
          const { data: newVariant } = await (supabase as any)
            .from("bom_variants")
            .insert({ parent_item_id: parentId, variant_name: variantName, company_id: companyId })
            .select("id").single();
          variantId = newVariant?.id ?? null;
        }
      }

      const payload: any = {
        quantity: qty,
        unit: row["unit"]?.trim() || "NOS",
        scrap_factor: parseFloat(row["scrap_factor"] || "0") || 0,
        notes: row["notes"]?.trim() || null,
      };
      if (variantId) payload.variant_id = variantId;

      try {
        const { data: existing } = await (supabase as any)
          .from("bom_lines").select("id")
          .eq("company_id", companyId).eq("parent_item_id", parentId).eq("child_item_id", childId).maybeSingle();

        if (existing) {
          await (supabase as any).from("bom_lines").update(payload).eq("id", existing.id);
        } else {
          await (supabase as any).from("bom_lines").insert({
            ...payload, company_id: companyId, parent_item_id: parentId, child_item_id: childId,
          });
        }
        imported++;
      } catch (err: any) {
        skipped++;
        skipReasons.push({ row: excelRow, value: parentCode || "", reason: `DB error: ${err?.message ?? "unknown"}` });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["bom-lines"] });
    return { imported, skipped, errors, skipReasons };
  };

  const handleImport = () => {
    if (validRows.length === 0) return;
    const rowsToImport = validRows;
    const rowNumsToImport = validRowNums;
    const parseSkips = skipReasons.filter((s) => s.reason.includes("skipped automatically"));

    // Clear the form immediately
    setRows([]); setValidRows([]); setValidRowNums([]);

    addJob("BOM lines", rowsToImport, rowNumsToImport, bomImportFn, {
      onComplete: (res) => {
        setResult({ imported: res.imported, skipped: res.skipped });
        setSkipReasons([...parseSkips, ...res.skipReasons]);
      },
    });

    toast({ title: "Importing BOM lines in background — you can keep working" });
  };

  return (
    <div className="space-y-4">
      {/* Result Banner */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              {result.imported} imported · {result.skipped} skipped
            </span>
          </div>
          <SkipReasonsPanel reasons={skipReasons} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadBOMTemplate}>
          <Download className="h-4 w-4" /> Download Template
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Choose Excel File
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" className="hidden" onChange={handleFile} />
        {validRows.length > 0 && (
          <Button
            size="sm"
            className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleImport}
            disabled={validating}
          >
            Import {validRows.length} Valid Row{validRows.length !== 1 ? "s" : ""}
          </Button>
        )}
        {rows.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>Clear</Button>
        )}
      </div>

      {/* Summary chips */}
      {rows.length > 0 && !validating && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-xs font-medium">
            <CheckCircle className="h-3 w-3" /> {validRows.length} ready to import
          </span>
          {errorRows.size > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
              <XCircle className="h-3 w-3" /> {errorRows.size} errors — will be skipped
            </span>
          )}
        </div>
      )}
      {rows.length > 0 && validating && (
        <p className="text-xs text-muted-foreground">Validating item codes…</p>
      )}

      {/* Validation Error List */}
      {errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {errors.length} issue{errors.length !== 1 ? "s" : ""} found — affected rows highlighted in red
          </div>
          {errors.slice(0, 5).map((e, i) => (
            <p key={i} className="text-xs text-amber-700 pl-5">{e}</p>
          ))}
          {errors.length > 5 && <p className="text-xs text-amber-600 pl-5">…and {errors.length - 5} more</p>}
        </div>
      )}

      {/* Column Mapping Summary */}
      {mappingSummary && rows.length > 0 && (
        <MappingSummaryBar summary={mappingSummary} columnWarnings={columnWarnings} />
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Preview — {rows.length} rows</p>
          <PreviewTableWithErrors
            rows={rows.slice(0, 20)}
            errorRows={errorRows}
            errorMessages={errorMessages}
          />
          {rows.length > 20 && (
            <p className="text-xs text-muted-foreground">Showing first 20 of {rows.length} rows</p>
          )}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !result && (
        <div className="border-2 border-dashed border-border rounded-xl py-12 text-center">
          <GitFork className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Upload an Excel file to preview and import BOM Lines</p>
          <p className="text-xs text-muted-foreground mt-1">Download the template above to get started · 7 columns with 3 example rows</p>
        </div>
      )}
    </div>
  );
}

// ── Import Tab Component ───────────────────────────────────────────────────

function ImportTab({
  title,
  icon: Icon,
  templateHeaders,
  templateSheetName,
  fieldMap,
  requiredFields,
  primaryKeyField,
  onImport,
  validate,
}: {
  title: string;
  icon: React.ComponentType<any>;
  templateHeaders: string[];
  templateSheetName: string;
  fieldMap: Record<string, string[]>;
  requiredFields: string[];
  primaryKeyField?: string;
  onImport: BatchImportFn;
  validate?: (row: Record<string, string>, i: number) => string | null;
}) {
  const { toast } = useToast();
  const { addJob } = useImportQueue();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [validRows, setValidRows] = useState<Record<string, string>[]>([]);
  const [validRowNums, setValidRowNums] = useState<number[]>([]);
  const [errorRows, setErrorRows] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [mappingSummary, setMappingSummary] = useState<ColumnMappingSummary | null>(null);
  const [columnWarnings, setColumnWarnings] = useState<string[]>([]);
  const [skipReasons, setSkipReasons] = useState<SkipReason[]>([]);

  const clearAll = () => {
    setRows([]); setValidRows([]); setValidRowNums([]); setErrorRows(new Set()); setErrors([]); setResult(null);
    setMappingSummary(null); setColumnWarnings([]); setSkipReasons([]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows: raw, rowNums: rawRowNums, skipped: parsedSkips } = await parseExcelSmart(file, fieldMap);

      if (raw.length === 0) {
        toast({ title: "No data found", description: "The file is empty or contains only column headers.", variant: "destructive" });
        e.target.value = "";
        return;
      }

      const headers = Object.keys(raw[0]);
      const colMap = resolveColumns(headers, fieldMap);
      const summary = buildMappingSummary(headers, colMap, fieldMap, requiredFields);
      setMappingSummary(summary);

      const warnings = summary.missingRequired.map((f) => `"${fieldDisplayName(f)}" column not found`);
      setColumnWarnings(warnings);

      const parsed = raw.map((r) => extractRow(r, headers, colMap));

      const newErrorRows = new Set<number>();
      const newErrors: string[] = [];
      const newValidRows: Record<string, string>[] = [];
      const newValidRowNums: number[] = [];
      const newSkipReasons: SkipReason[] = [...parsedSkips];

      if (validate) {
        parsed.forEach((row, i) => {
          const excelRow = rawRowNums[i] ?? (i + 2);
          const pkVal = primaryKeyField ? (row[primaryKeyField] || "") : "";
          const err = validate(row, i);
          if (err) {
            newErrorRows.add(i);
            newErrors.push(`Row ${excelRow}${pkVal ? ` (${pkVal})` : ""}: ${err}`);
            newSkipReasons.push({ row: excelRow, value: pkVal, reason: err });
          } else {
            newValidRows.push(row);
            newValidRowNums.push(excelRow);
          }
        });
      } else {
        newValidRows.push(...parsed);
        newValidRowNums.push(...rawRowNums);
      }

      setRows(parsed);
      setValidRows(newValidRows);
      setValidRowNums(newValidRowNums);
      setErrorRows(newErrorRows);
      setErrors(newErrors);
      setSkipReasons(newSkipReasons);
      setResult(null);
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleImport = () => {
    if (validRows.length === 0) return;
    // Snapshot the rows before clearing the form
    const rowsToImport = validRows;
    const rowNumsToImport = validRowNums;
    const parseSkips = skipReasons.filter((s) => s.reason.includes("skipped automatically"));

    // Clear the form immediately so user can start something else
    setRows([]); setValidRows([]); setValidRowNums([]); setErrorRows(new Set());

    addJob(title, rowsToImport, rowNumsToImport, onImport, {
      onComplete: (res) => {
        setResult({ imported: res.imported, skipped: res.skipped });
        setSkipReasons([...parseSkips, ...res.skipReasons]);
      },
    });

    toast({ title: `Importing ${title} in background — you can keep working` });
  };

  return (
    <div className="space-y-4">
      {/* Result Banner */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              {result.imported} imported, {result.skipped} skipped
            </span>
          </div>
          <SkipReasonsPanel reasons={skipReasons} />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => downloadTemplate(templateSheetName, templateHeaders)}
        >
          <Download className="h-4 w-4" /> Download Template
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-4 w-4" /> Choose Excel File
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" className="hidden" onChange={handleFile} />
        {validRows.length > 0 && (
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleImport}>
            Import {validRows.length} Row{validRows.length !== 1 ? "s" : ""}
          </Button>
        )}
        {rows.length > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>Clear</Button>
        )}
      </div>

      {/* Summary chips */}
      {rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-800 text-xs font-medium">
            <CheckCircle className="h-3 w-3" /> {validRows.length} ready to import
          </span>
          {errorRows.size > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
              <XCircle className="h-3 w-3" /> {errorRows.size} errors — will be skipped
            </span>
          )}
        </div>
      )}

      {/* Validation Errors */}
      {errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {errors.length} validation issue(s) — these rows will be skipped
          </div>
          {errors.slice(0, 5).map((e, i) => (
            <p key={i} className="text-xs text-amber-700 pl-5">{e}</p>
          ))}
          {errors.length > 5 && <p className="text-xs text-amber-600 pl-5">…and {errors.length - 5} more</p>}
        </div>
      )}

      {/* Column Mapping Summary */}
      {mappingSummary && rows.length > 0 && (
        <MappingSummaryBar summary={mappingSummary} columnWarnings={columnWarnings} />
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Preview — {rows.length} rows</p>
          <PreviewTable rows={rows.slice(0, 20)} errorRows={errorRows} />
          {rows.length > 20 && (
            <p className="text-xs text-muted-foreground">Showing first 20 of {rows.length} rows</p>
          )}
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && !result && (
        <div className="border-2 border-dashed border-border rounded-xl py-12 text-center">
          <Icon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Upload an Excel file to preview and import {title}</p>
          <p className="text-xs text-muted-foreground mt-1">Download the template above to get started</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type ClearTarget = { type: "parties" | "items" | "bom" | "stock"; noun: string; count: number };

export default function DataImport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("parties");
  const [clearTarget, setClearTarget] = useState<ClearTarget | null>(null);
  const [clearLoading, setClearLoading] = useState(false);

  const { data: partiesCount = 0, refetch: refetchPartiesCount } = useQuery({
    queryKey: ["count", "parties"],
    queryFn: async () => {
      const companyId = await getCompanyId();
      const { count } = await supabase.from("parties").select("id", { count: "exact", head: true }).eq("company_id", companyId);
      return count ?? 0;
    },
  });

  const { data: itemsCount = 0, refetch: refetchItemsCount } = useQuery({
    queryKey: ["count", "items"],
    queryFn: async () => {
      const companyId = await getCompanyId();
      const { count } = await supabase.from("items").select("id", { count: "exact", head: true }).eq("company_id", companyId);
      return count ?? 0;
    },
  });

  const { data: bomLinesCount = 0, refetch: refetchBomCount } = useQuery({
    queryKey: ["count", "bom_lines"],
    queryFn: async () => {
      const companyId = await getCompanyId();
      const { count } = await (supabase as any).from("bom_lines").select("id", { count: "exact", head: true }).eq("company_id", companyId);
      return count ?? 0;
    },
  });

  const { data: stockEntriesCount = 0, refetch: refetchStockCount } = useQuery({
    queryKey: ["count", "opening_stock"],
    queryFn: async () => {
      const companyId = await getCompanyId();
      const { count } = await (supabase as any).from("stock_ledger").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("transaction_type", "opening_stock");
      return count ?? 0;
    },
  });

  const doClear = async () => {
    if (!clearTarget) return;
    setClearLoading(true);
    try {
      const companyId = await getCompanyId();
      const rpcMap: Record<ClearTarget["type"], string> = {
        parties: "clear_all_parties",
        items: "clear_all_items",
        bom: "clear_all_bom_lines",
        stock: "clear_opening_stock",
      };
      const { data, error } = await (supabase as any).rpc(rpcMap[clearTarget.type], { p_company_id: companyId });
      if (error) throw error;
      const count = (data as number) ?? 0;
      if (clearTarget.type === "parties") { queryClient.invalidateQueries({ queryKey: ["parties"] }); refetchPartiesCount(); }
      else if (clearTarget.type === "items") { queryClient.invalidateQueries({ queryKey: ["items"] }); refetchItemsCount(); }
      else if (clearTarget.type === "bom") { queryClient.invalidateQueries({ queryKey: ["bom-lines"] }); refetchBomCount(); }
      else { queryClient.invalidateQueries({ queryKey: ["items"] }); queryClient.invalidateQueries({ queryKey: ["stock_status"] }); refetchStockCount(); }
      toast({ title: `All ${count} ${clearTarget.noun} cleared successfully` });
      setClearTarget(null);
    } catch (err: any) {
      toast({ title: "Clear failed", description: err.message, variant: "destructive" });
    } finally {
      setClearLoading(false);
    }
  };

  const handlePartyImport = async (rows: Record<string, string>[], rowNums: number[]) => {
    let imported = 0, skipped = 0;
    const errors: string[] = [];
    const skipReasons: SkipReason[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = rowNums[i] ?? (i + 2);
      const name = row["name"]?.trim();
      if (!name) {
        skipped++;
        errors.push(`Row ${excelRow}: Party Name was blank or missing`);
        skipReasons.push({ row: excelRow, value: "", reason: "Party Name was blank or missing" });
        continue;
      }
      try {
        const gstin = row["gstin"] || null;
        const state_code = row["state_code"] || (gstin && gstin.length >= 2 ? gstin.substring(0, 2) : null);
        await createParty({
          name,
          party_type: normalizePartyType(row["party_type"] || "") as any,
          contact_person: row["contact_person"] || null,
          address_line1: row["address_line1"] || null,
          city: row["city"] || null,
          state: row["state"] || null,
          pin_code: row["pin_code"] || null,
          phone1: row["phone1"] || null,
          email1: row["email1"] || null,
          gstin,
          pan: row["pan"] || null,
          payment_terms: row["payment_terms"] || null,
          notes: row["notes"] || null,
          state_code,
        } as any);
        imported++;
      } catch (err: any) {
        skipped++;
        const isDup = err?.code === "23505" || String(err?.message ?? "").toLowerCase().includes("duplicate") || String(err?.message ?? "").toLowerCase().includes("unique");
        const reason = isDup ? `Duplicate — party with name "${name}" already exists` : `DB error: ${err?.message ?? "unknown"}`;
        errors.push(`Row ${excelRow} (${name}): ${reason}`);
        skipReasons.push({ row: excelRow, value: name, reason });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["parties"] });
    return { imported, skipped, errors, skipReasons };
  };

  const handleItemImport = async (rows: Record<string, string>[], rowNums: number[]) => {
    let imported = 0, skipped = 0;
    const errors: string[] = [];
    const skipReasons: SkipReason[] = [];
    let autoCodeIndex = 1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = rowNums[i] ?? (i + 2);
      const code = row["item_code"]?.trim() || "";
      // "Drawing Number" column maps to field key drawing_number; stored in both DB columns
      const drawingNum = row["drawing_number"]?.trim() || "";
      const desc = row["description"]?.trim() || "";
      // Best identifier for skip reason display (FIX 3)
      const displayKey = code || drawingNum || "";

      if (!desc) {
        skipped++;
        errors.push(`Row ${excelRow}${displayKey ? ` (${displayKey})` : ""}: Description was blank or missing`);
        skipReasons.push({ row: excelRow, value: displayKey, reason: "Description was blank or missing" });
        continue;
      }

      try {
        // ── Determine lookup key and whether item already exists ──────────
        let existingId: string | null = null;
        let resolvedCode = code;

        if (code) {
          // 1. Lookup by item_code (exact match)
          const { data } = await supabase
            .from("items").select("id").eq("item_code", code).limit(1);
          existingId = (data as any[])?.[0]?.id ?? null;
        } else if (drawingNum) {
          // 2. Lookup by drawing_revision (case-insensitive)
          const { data } = await supabase
            .from("items").select("id, item_code").ilike("drawing_revision", drawingNum).limit(1);
          existingId = (data as any[])?.[0]?.id ?? null;
          // Use existing item_code if found, otherwise fall back to drawing number
          resolvedCode = (data as any[])?.[0]?.item_code || drawingNum;
        } else {
          // 3. Auto-generate item_code from description (first 3 words, uppercase, hyphenated)
          const words = desc.trim().split(/\s+/).slice(0, 3)
            .map((w) => w.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
          resolvedCode = `${words.join("-")}-${String(autoCodeIndex).padStart(4, "0")}`;
          autoCodeIndex++;
          // Check if the auto-generated code already exists
          const { data } = await supabase
            .from("items").select("id").eq("item_code", resolvedCode).limit(1);
          existingId = (data as any[])?.[0]?.id ?? null;
        }

        const itemPayload: any = {
          item_code: resolvedCode || null,
          description: desc,
          item_type: normalizeItemType(row["item_type"] || ""),
          unit: row["unit"] || "NOS",
          hsn_sac_code: row["hsn_sac_code"] || null,
          sale_price: parseFloat(row["sale_price"] || "0") || 0,
          purchase_price: parseFloat(row["purchase_price"] || "0") || 0,
          gst_rate: parseFloat(row["gst_rate"] || "18") || 18,
          min_stock: parseFloat(row["min_stock"] || "0") || 0,
          notes: row["notes"] || null,
          drawing_number: drawingNum || null,
          drawing_revision: drawingNum || null, // always populate from Drawing Number column
        };

        if (existingId) {
          const { error } = await supabase.from("items").update(itemPayload).eq("id", existingId);
          if (error) throw error;
        } else {
          await createItem(itemPayload);
        }
        imported++;
      } catch (err: any) {
        skipped++;
        const isDup = err?.code === "23505" || String(err?.message ?? "").toLowerCase().includes("duplicate") || String(err?.message ?? "").toLowerCase().includes("unique");
        const reason = isDup
          ? `Duplicate — item "${displayKey || desc}" already exists`
          : `DB error: ${err?.message ?? "unknown"}`;
        errors.push(`Row ${excelRow}${displayKey ? ` (${displayKey})` : ""}: ${reason}`);
        skipReasons.push({ row: excelRow, value: displayKey, reason });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["items"] });
    return { imported, skipped, errors, skipReasons };
  };

  const handleStockImport = async (rows: Record<string, string>[], rowNums: number[]) => {
    let imported = 0, skipped = 0;
    const errors: string[] = [];
    const skipReasons: SkipReason[] = [];
    const codes = rows.map((r) => r["item_code"]?.trim()).filter(Boolean);
    const { data: itemsData } = await supabase.from("items").select("id, item_code").in("item_code", codes);
    const codeToId = new Map((itemsData ?? []).map((i: any) => [i.item_code, i.id]));

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = rowNums[i] ?? (i + 2);
      const code = row["item_code"]?.trim();
      const qty = parseFloat(row["current_stock"] || "");
      if (!code) {
        skipped++;
        errors.push(`Row ${excelRow}: Item Code was blank or missing`);
        skipReasons.push({ row: excelRow, value: "", reason: "Item Code was blank or missing" });
        continue;
      }
      if (isNaN(qty)) {
        skipped++;
        errors.push(`Row ${excelRow} (${code}): Opening Stock Qty is not a valid number`);
        skipReasons.push({ row: excelRow, value: code, reason: "Opening Stock Qty is not a valid number" });
        continue;
      }
      const itemId = codeToId.get(code);
      if (!itemId) {
        skipped++;
        errors.push(`Row ${excelRow} (${code}): Item Code '${code}' not found in Items master`);
        skipReasons.push({ row: excelRow, value: code, reason: `Item Code '${code}' not found in Items master` });
        continue;
      }
      try {
        await supabase.from("items").update({ current_stock: qty } as any).eq("id", itemId);
        imported++;
      } catch (err: any) {
        skipped++;
        skipReasons.push({ row: excelRow, value: code, reason: `DB error: ${err?.message ?? "unknown"}` });
      }
    }
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["stock_status"] });
    return { imported, skipped, errors, skipReasons };
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-3"
      >
        <ChevronLeft className="h-4 w-4" />
        Back
      </button>
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Data Import</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Import master data and opening balances from Excel. Download each template, fill it in, then upload.
        </p>
      </div>

      <SegmentedControl
        options={[
          { value: "parties", label: "Parties" },
          { value: "items", label: "Items" },
          { value: "bom", label: "Bill of Materials" },
          { value: "stock", label: "Opening Stock" },
        ]}
        value={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "parties" && (
        <div className="paper-card mt-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-900">Import Parties</h2>
            {partiesCount > 0 && (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                onClick={() => setClearTarget({ type: "parties", noun: "parties", count: partiesCount })}>
                <Trash2 className="h-3.5 w-3.5" /> Clear All ({partiesCount})
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Import vendors, customers, and sub-contractors. Duplicate names will be skipped.
          </p>
          <ImportTab
            title="Parties"
            icon={Users}
            templateHeaders={PARTY_HEADERS}
            templateSheetName="Parties Import"
            fieldMap={PARTY_FIELD_MAP}
            requiredFields={["name"]}
            primaryKeyField="name"
            onImport={handlePartyImport}
            validate={(row) => {
              if (!row["name"]?.trim()) return "Party Name is required";
              return null;
            }}
          />
        </div>
      )}

      {activeTab === "items" && (
        <div className="paper-card mt-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-900">Import Items</h2>
            {itemsCount > 0 && (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                onClick={() => setClearTarget({ type: "items", noun: "items", count: itemsCount })}>
                <Trash2 className="h-3.5 w-3.5" /> Clear All ({itemsCount})
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Import your product, component, and material master list.
          </p>
          <ImportTab
            title="Items"
            icon={Package}
            templateHeaders={ITEM_HEADERS}
            templateSheetName="Items Import"
            fieldMap={ITEM_FIELD_MAP}
            requiredFields={["description", "item_type", "unit"]}
            primaryKeyField="drawing_number"
            onImport={handleItemImport}
            validate={(row) => {
              if (!row["description"]?.trim()) return "Description is required";
              return null;
            }}
          />
        </div>
      )}

      {activeTab === "bom" && (
        <div className="paper-card mt-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-900">Import Bill of Materials</h2>
            {bomLinesCount > 0 && (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                onClick={() => setClearTarget({ type: "bom", noun: "BOM lines", count: bomLinesCount })}>
                <Trash2 className="h-3.5 w-3.5" /> Clear All ({bomLinesCount})
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Define finished item–component relationships. Both items must already exist. Existing BOM lines are updated (upsert).
            Supports Variant Name and Scrap Factor columns.
          </p>
          <BOMImportTab />
        </div>
      )}

      {activeTab === "stock" && (
        <div className="paper-card mt-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-900">Import Opening Stock</h2>
            {stockEntriesCount > 0 && (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                onClick={() => setClearTarget({ type: "stock", noun: "opening stock entries", count: stockEntriesCount })}>
                <Trash2 className="h-3.5 w-3.5" /> Clear All ({stockEntriesCount})
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Set the opening stock quantity for each item. Items must already exist in the system.
            This will overwrite the current_stock value.
          </p>
          <ImportTab
            title="Opening Stock"
            icon={Table}
            templateHeaders={STOCK_HEADERS}
            templateSheetName="Opening Stock"
            fieldMap={STOCK_FIELD_MAP}
            requiredFields={["item_code", "current_stock"]}
            primaryKeyField="item_code"
            onImport={handleStockImport}
            validate={(row) => {
              if (!row["item_code"]?.trim()) return "Item Code is required";
              if (isNaN(parseFloat(row["current_stock"] || ""))) return "Quantity must be a number";
              return null;
            }}
          />
        </div>
      )}

      {/* Clear All Confirmation Dialog */}
      <Dialog open={!!clearTarget} onOpenChange={(open) => { if (!open && !clearLoading) setClearTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear All {clearTarget?.noun}</DialogTitle>
            <DialogDescription>
              You are about to delete all {clearTarget?.count} {clearTarget?.noun}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearTarget(null)} disabled={clearLoading}>Cancel</Button>
            <Button variant="destructive" onClick={doClear} disabled={clearLoading}>
              {clearLoading ? "Clearing…" : `Delete All ${clearTarget?.count}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
