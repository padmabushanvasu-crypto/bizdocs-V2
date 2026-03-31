import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, CheckCircle, XCircle, AlertTriangle, Table, Users, Package, GitFork, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";
import {
  resolveColumns, extractRow, buildMappingSummary,
  normaliseHeader, fieldDisplayName,
  parseExcelSmart,
  PARTY_FIELD_MAP, ITEM_FIELD_MAP, BOM_FIELD_MAP, STOCK_FIELD_MAP, VENDOR_SHEET_FIELD_MAP, REORDER_FIELD_MAP,
  type ColumnMappingSummary, type SkipReason,
} from "@/lib/import-utils";
import { importItemsBatch } from "@/lib/items-api";
import { importPartiesBatch } from "@/lib/parties-api";
import { useImportQueue, type BatchImportFn } from "@/lib/import-queue";

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

  // ── Sheet 1: BOM Lines ──
  const bomHeaders = [
    "Finished Item Code *", "Finished Item Description", "Component Code *",
    "Component Description", "Quantity Per Unit *", "Unit", "BOM Level", "Notes"
  ];
  const noteRow = ["Add vendor information on the Vendors sheet (no limit on vendors per component)", "", "", "", "", "", "", ""];
  const examples = [
    ["PROD-001", "Main Product", "COMP-A", "Steel Bracket", "2", "NOS", "1", "Main structural component"],
    ["PROD-001", "Main Product", "COMP-B", "Copper Wire", "0.5", "KG", "1", ""],
    ["PROD-002", "Sub Assembly", "COMP-A", "Steel Bracket", "4", "NOS", "2", "Used in sub-assembly"],
  ];
  const aoa1 = [bomHeaders, noteRow, ...examples];
  const ws1 = (XLSX as any).utils.aoa_to_sheet(aoa1);

  const BOLD_HEADER: Record<string, unknown> = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "2D3282" } }, alignment: { horizontal: "center" } };
  const NOTE_STYLE: Record<string, unknown> = { font: { italic: true, sz: 9, color: { rgb: "374151" } }, fill: { fgColor: { rgb: "FEF9C3" } } };
  const EXAMPLE_STYLE: Record<string, unknown> = { fill: { fgColor: { rgb: "F3F4F6" } }, font: { sz: 10 } };

  bomHeaders.forEach((_h, i) => {
    const cell = (XLSX as any).utils.encode_cell({ r: 0, c: i });
    if (ws1[cell]) ws1[cell].s = BOLD_HEADER;
  });
  bomHeaders.forEach((_h, i) => {
    const cell = (XLSX as any).utils.encode_cell({ r: 1, c: i });
    if (!ws1[cell]) ws1[cell] = { v: i === 0 ? noteRow[0] : "", t: "s" };
    ws1[cell].s = NOTE_STYLE;
  });
  for (let r = 2; r < aoa1.length; r++) {
    bomHeaders.forEach((_h, c) => {
      const cell = (XLSX as any).utils.encode_cell({ r, c });
      if (!ws1[cell]) ws1[cell] = { v: "", t: "s" };
      ws1[cell].s = EXAMPLE_STYLE;
    });
  }
  ws1["!cols"] = bomHeaders.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  ws1["!rows"] = [{ hpt: 20 }, { hpt: 32 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 }];
  ws1["!freeze"] = { xSplit: 0, ySplit: 2 };
  (XLSX as any).utils.book_append_sheet(wb, ws1, "BOM Lines");

  // ── Sheet 2: Vendors ──
  const vendorHeaders = [
    "Component Code *", "Vendor Code *", "Process Name", "Lead Time Days", "Preference Order", "Notes"
  ];
  const vendorInstructionRow = [
    "Add one row per vendor per component. Component Code must match Sheet 1. Vendor Code must match your Parties master. Preference Order: 1 = preferred, 2 = second choice.",
    "", "", "", "", ""
  ];
  const vendorExamples = [
    ["COMP-A", "VEND-001", "CNC Machining", "7", "1", "Primary machining vendor"],
    ["COMP-A", "VEND-002", "CNC Machining", "10", "2", "Backup vendor"],
    ["COMP-B", "VEND-003", "Wire Drawing", "14", "1", ""],
  ];
  const aoa2 = [vendorHeaders, vendorInstructionRow, ...vendorExamples];
  const ws2 = (XLSX as any).utils.aoa_to_sheet(aoa2);

  const NAVY_HEADER: Record<string, unknown> = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 }, fill: { fgColor: { rgb: "1E3A5F" } }, alignment: { horizontal: "center" } };
  const AMBER_INSTRUCTION: Record<string, unknown> = { font: { italic: true, sz: 9, color: { rgb: "92400E" } }, fill: { fgColor: { rgb: "FEF3C7" } }, alignment: { wrapText: true } };
  const VENDOR_EXAMPLE: Record<string, unknown> = { fill: { fgColor: { rgb: "EFF6FF" } }, font: { sz: 10 } };

  vendorHeaders.forEach((_h, i) => {
    const cell = (XLSX as any).utils.encode_cell({ r: 0, c: i });
    if (ws2[cell]) ws2[cell].s = NAVY_HEADER;
  });
  vendorHeaders.forEach((_h, i) => {
    const cell = (XLSX as any).utils.encode_cell({ r: 1, c: i });
    if (!ws2[cell]) ws2[cell] = { v: i === 0 ? vendorInstructionRow[0] : "", t: "s" };
    ws2[cell].s = AMBER_INSTRUCTION;
  });
  for (let r = 2; r < aoa2.length; r++) {
    vendorHeaders.forEach((_h, c) => {
      const cell = (XLSX as any).utils.encode_cell({ r, c });
      if (!ws2[cell]) ws2[cell] = { v: "", t: "s" };
      ws2[cell].s = VENDOR_EXAMPLE;
    });
  }
  ws2["!cols"] = vendorHeaders.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  ws2["!rows"] = [{ hpt: 20 }, { hpt: 40 }, { hpt: 16 }, { hpt: 16 }, { hpt: 16 }];
  ws2["!freeze"] = { xSplit: 0, ySplit: 2 };
  ws2["!merges"] = [{ s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }];
  (XLSX as any).utils.book_append_sheet(wb, ws2, "Vendors");

  (XLSX as any).writeFile(wb, "BOM_Import_Template.xlsx");
}

async function downloadOpeningStockTemplate() {
  const XLSX = await import("xlsx-js-style");
  const companyId = await getCompanyId();

  const { data: itemsRaw } = await supabase
    .from("items")
    .select("item_code, description, drawing_revision, item_type, unit, current_stock")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("description", { ascending: true });

  const items = (itemsRaw ?? []).slice().sort((a: any, b: any) => {
    const ad = (a.drawing_revision ?? "").trim();
    const bd = (b.drawing_revision ?? "").trim();
    // Items with no drawing number go to the end
    if (!ad && bd) return 1;
    if (ad && !bd) return -1;
    return ad.localeCompare(bd);
  });

  const titleRow  = ["BizDocs — Opening Stock", "", "", "", "", "", "", "", ""];
  const noteRow   = ["Fill in columns G and H only. Do not edit other columns.", "", "", "", "", "", "", "", ""];
  const headerRow = ["Drawing Number", "Item Code", "Description", "Item Type", "Unit", "Current Stock", "Opening Stock Qty *", "Cost Per Unit ₹", "Notes"];
  const dataRows  = items.map((item: any) => [
    item.drawing_revision ?? "",
    item.item_code ?? "",
    item.description ?? "",
    item.item_type ?? "",
    item.unit ?? "",
    item.current_stock ?? 0,  // F: read-only reference
    "",   // G: client fills
    "",   // H: client fills
    "",   // I: optional notes
  ]);

  const aoa = [titleRow, noteRow, headerRow, ...dataRows];
  const wb  = (XLSX as any).utils.book_new();
  const ws  = (XLSX as any).utils.aoa_to_sheet(aoa);

  // Merges
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
  ];

  // Freeze top 3 rows
  ws["!freeze"] = { xSplit: 0, ySplit: 3 };

  // Column widths
  ws["!cols"] = [
    { wch: 18 }, // A: Drawing Number
    { wch: 16 }, // B: Item Code
    { wch: 32 }, // C: Description
    { wch: 14 }, // D: Item Type
    { wch: 8  }, // E: Unit
    { wch: 14 }, // F: Current Stock (ref)
    { wch: 20 }, // G: Opening Stock Qty *
    { wch: 18 }, // H: Cost Per Unit ₹
    { wch: 22 }, // I: Notes
  ];

  // Row heights
  ws["!rows"] = [{ hpt: 26 }, { hpt: 18 }, { hpt: 18 }];

  // Styles
  const titleStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "1E3A5F" } },
    font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const noteStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "FFF3CD" } },
    font: { italic: true, sz: 10, color: { rgb: "856404" } },
    alignment: { horizontal: "left", vertical: "center" },
  };
  const hdrGrey = {
    fill: { patternType: "solid", fgColor: { rgb: "374151" } },
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center" },
    border: { bottom: { style: "medium", color: { rgb: "000000" } } },
  };
  const hdrYellow = {
    fill: { patternType: "solid", fgColor: { rgb: "7C4D00" } },
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center" },
    border: { bottom: { style: "medium", color: { rgb: "000000" } } },
  };
  const greyCell = {
    fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
    font: { sz: 10 },
    border: {
      top: { style: "thin", color: { rgb: "D1D5DB" } },
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
      left: { style: "thin", color: { rgb: "D1D5DB" } },
      right: { style: "thin", color: { rgb: "D1D5DB" } },
    },
  };
  const yellowCell = {
    fill: { patternType: "solid", fgColor: { rgb: "FEFCE8" } },
    font: { sz: 10 },
    border: {
      top: { style: "thin", color: { rgb: "D1D5DB" } },
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
      left: { style: "thin", color: { rgb: "D1D5DB" } },
      right: { style: "thin", color: { rgb: "D1D5DB" } },
    },
  };
  const whiteCell = {
    font: { sz: 10 },
    border: {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } },
    },
  };

  const cols = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

  // Row 1: title (only A1 for the merged cell)
  if (ws["A1"]) ws["A1"].s = titleStyle;
  // Row 2: note
  if (ws["A2"]) ws["A2"].s = noteStyle;
  // Row 3: headers — A-F grey (read-only), G-H yellow (editable), I grey (notes)
  cols.forEach((col, i) => {
    const ref = `${col}3`;
    if (ws[ref]) ws[ref].s = i < 6 ? hdrGrey : i < 8 ? hdrYellow : hdrGrey;
  });
  // Data rows
  for (let r = 0; r < items.length; r++) {
    const excelRow = r + 4;
    cols.forEach((col, c) => {
      const ref = `${col}${excelRow}`;
      if (!ws[ref]) ws[ref] = { v: "", t: "s" };
      ws[ref].s = c < 6 ? greyCell : c < 8 ? yellowCell : whiteCell;
    });
  }

  (XLSX as any).utils.book_append_sheet(wb, ws, "Opening Stock");
  (XLSX as any).writeFile(wb, "Opening_Stock_Template.xlsx");
}

async function downloadReorderRulesTemplate() {
  const XLSX = await import("xlsx-js-style");
  const companyId = await getCompanyId();

  const { data: itemsRaw } = await supabase
    .from("items")
    .select("item_code, description, drawing_revision, item_type, unit")
    .eq("company_id", companyId)
    .eq("status", "active")
    .order("drawing_revision", { ascending: true, nullsFirst: false });

  const items = (itemsRaw ?? []).slice().sort((a: any, b: any) => {
    const ad = (a.drawing_revision ?? "").trim();
    const bd = (b.drawing_revision ?? "").trim();
    if (!ad && bd) return 1;
    if (ad && !bd) return -1;
    return ad.localeCompare(bd);
  });

  const titleRow  = ["BizDocs — Reorder Rules", "", "", "", "", "", "", "", "", ""];
  const noteRow   = [
    "Fill in Reorder Point, Reorder Qty and Lead Time for each item. Preferred Vendor Code must match your Parties master. Leave blank to skip an item.",
    "", "", "", "", "", "", "", "", "",
  ];
  const headerRow = [
    "Drawing Number", "Item Code", "Description", "Item Type", "Unit",
    "Reorder Point", "Reorder Qty", "Lead Time Days", "Preferred Vendor Code", "Notes",
  ];
  const dataRows = items.map((item: any) => [
    item.drawing_revision ?? "",
    item.item_code ?? "",
    item.description ?? "",
    item.item_type ?? "",
    item.unit ?? "",
    "", "", "", "", "",
  ]);

  const aoa = [titleRow, noteRow, headerRow, ...dataRows];
  const wb  = (XLSX as any).utils.book_new();
  const ws  = (XLSX as any).utils.aoa_to_sheet(aoa);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 3 };
  ws["!cols"] = [
    { wch: 18 }, // A: Drawing Number
    { wch: 16 }, // B: Item Code
    { wch: 32 }, // C: Description
    { wch: 14 }, // D: Item Type
    { wch: 8  }, // E: Unit
    { wch: 16 }, // F: Reorder Point
    { wch: 14 }, // G: Reorder Qty
    { wch: 16 }, // H: Lead Time Days
    { wch: 22 }, // I: Preferred Vendor Code
    { wch: 22 }, // J: Notes
  ];
  ws["!rows"] = [{ hpt: 26 }, { hpt: 36 }, { hpt: 18 }];

  const titleStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "1E3A5F" } },
    font: { bold: true, sz: 13, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const noteStyle = {
    fill: { patternType: "solid", fgColor: { rgb: "FFF3CD" } },
    font: { italic: true, sz: 10, color: { rgb: "856404" } },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
  };
  const hdrGrey = {
    fill: { patternType: "solid", fgColor: { rgb: "374151" } },
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center" },
    border: { bottom: { style: "medium", color: { rgb: "000000" } } },
  };
  const hdrYellow = {
    fill: { patternType: "solid", fgColor: { rgb: "7C4D00" } },
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center" },
    border: { bottom: { style: "medium", color: { rgb: "000000" } } },
  };
  const hdrWhite = {
    fill: { patternType: "solid", fgColor: { rgb: "374151" } },
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
    alignment: { horizontal: "center" },
    border: { bottom: { style: "medium", color: { rgb: "000000" } } },
  };
  const greyCell = {
    fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
    font: { sz: 10 },
    border: {
      top: { style: "thin", color: { rgb: "D1D5DB" } },
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
      left: { style: "thin", color: { rgb: "D1D5DB" } },
      right: { style: "thin", color: { rgb: "D1D5DB" } },
    },
  };
  const yellowCell = {
    fill: { patternType: "solid", fgColor: { rgb: "FEFCE8" } },
    font: { sz: 10 },
    border: {
      top: { style: "thin", color: { rgb: "D1D5DB" } },
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
      left: { style: "thin", color: { rgb: "D1D5DB" } },
      right: { style: "thin", color: { rgb: "D1D5DB" } },
    },
  };
  const whiteCell = {
    font: { sz: 10 },
    border: {
      top: { style: "thin", color: { rgb: "E5E7EB" } },
      bottom: { style: "thin", color: { rgb: "E5E7EB" } },
      left: { style: "thin", color: { rgb: "E5E7EB" } },
      right: { style: "thin", color: { rgb: "E5E7EB" } },
    },
  };

  const cols = ["A","B","C","D","E","F","G","H","I","J"];

  if (ws["A1"]) ws["A1"].s = titleStyle;
  if (ws["A2"]) ws["A2"].s = noteStyle;
  // A-E grey (read-only), F-I yellow (editable), J white (notes)
  cols.forEach((col, i) => {
    const ref = `${col}3`;
    if (ws[ref]) ws[ref].s = i < 5 ? hdrGrey : i < 9 ? hdrYellow : hdrWhite;
  });
  for (let r = 0; r < items.length; r++) {
    const excelRow = r + 4;
    cols.forEach((col, c) => {
      const ref = `${col}${excelRow}`;
      if (!ws[ref]) ws[ref] = { v: "", t: "s" };
      ws[ref].s = c < 5 ? greyCell : c < 9 ? yellowCell : whiteCell;
    });
  }

  (XLSX as any).utils.book_append_sheet(wb, ws, "Reorder Rules");
  (XLSX as any).writeFile(wb, "Reorder_Rules_Template.xlsx");
}

const PARTY_HEADERS = ["Party Name *", "Party Type (vendor/customer/both) *", "Contact Person", "Address Line 1", "City", "State", "PIN Code", "Phone 1", "Email", "GSTIN", "PAN", "Payment Terms", "Notes"];
const ITEM_HEADERS = ["Item Code *", "Description *", "Item Type *", "Unit", "HSN/SAC Code", "Sale Price", "Purchase Price", "GST Rate %", "Min Stock", "Notes"];
const BOM_HEADERS = ["Finished Item Code *", "Component Code *", "Quantity *", "Unit", "Scrap Factor %", "Variant Name", "Notes"];
// BOM template is handled by downloadBOMTemplate() with example rows
const STOCK_HEADERS = ["Item Code *", "Description", "Drawing Number", "Item Type", "Unit", "Opening Stock Qty *", "Cost Per Unit ₹", "Notes"];

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
  const { addJob, jobs } = useImportQueue();
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
  // FIX 6: track the queued job
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [vendorSheetRows, setVendorSheetRows] = useState<Record<string, string>[]>([]);
  const [vendorCount, setVendorCount] = useState(0);

  // Clear job tracking when done (Provider handles the completion toast)
  useEffect(() => {
    if (!currentJobId) return;
    const job = jobs.find((j) => j.id === currentJobId);
    if (!job) return;
    if (job.status === "completed" || job.status === "failed") {
      setCurrentJobId(null);
    }
  }, [jobs, currentJobId]);

  const clearAll = () => {
    setRows([]); setValidRows([]); setValidRowNums([]); setErrors([]);
    setErrorRows(new Set()); setErrorMessages(new Map()); setResult(null);
    setMappingSummary(null); setColumnWarnings([]); setSkipReasons([]);
    setVendorSheetRows([]); setVendorCount(0);
  };

  async function parseNamedSheet(file: File, sheetName: string, fieldMap: Record<string, string[]>): Promise<Record<string, string>[]> {
    const XLSX = await import("xlsx-js-style");
    const buffer = await file.arrayBuffer();
    const wb = (XLSX as any).read(new Uint8Array(buffer), { type: "array", raw: false });
    const normalizedNames = wb.SheetNames.map((n: string) => n.toLowerCase());
    const idx = normalizedNames.indexOf(sheetName.toLowerCase());
    if (idx === -1) return [];
    const ws = wb.Sheets[wb.SheetNames[idx]];
    const allRows = (XLSX as any).utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }) as string[][];
    if (allRows.length < 2) return [];
    const allAliases = Object.values(fieldMap).flat().map(normaliseHeader).filter((a: string) => a.length >= 3);
    let headerIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < Math.min(5, allRows.length); i++) {
      let score = 0;
      for (const cell of allRows[i]) {
        const norm = normaliseHeader(String(cell));
        if (allAliases.some((a: string) => norm === a || norm.includes(a) || a.includes(norm))) score++;
      }
      if (score > bestScore) { bestScore = score; headerIdx = i; }
    }
    const headers = allRows[headerIdx].map((c: string) => String(c).trim());
    const colMap = resolveColumns(headers, fieldMap);
    const result: Record<string, string>[] = [];
    for (let i = headerIdx + 1; i < allRows.length; i++) {
      const row = allRows[i];
      const mapped: Record<string, string> = {};
      let hasData = false;
      headers.forEach((header, idx) => {
        const val = String(row[idx] ?? "").trim();
        if (header) { mapped[header] = val; if (val) hasData = true; }
      });
      if (hasData) {
        const extracted = extractRow(mapped, headers, colMap);
        if (extracted.component_code || extracted.vendor_code) result.push(extracted);
      }
    }
    return result;
  }

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
    // Check for Vendors sheet
    try {
      const file2 = e.target.files?.[0];
      if (file2) {
        const vendorRows = await parseNamedSheet(file2, "vendors", VENDOR_SHEET_FIELD_MAP);
        setVendorSheetRows(vendorRows);
        setVendorCount(vendorRows.length);
      }
    } catch {
      setVendorSheetRows([]);
      setVendorCount(0);
    }
    e.target.value = "";
  };

  const bomImportFn: BatchImportFn = async (rows, rowNums) => {
    const companyId = await getCompanyId();

    // Pre-fetch ALL items in one query
    const { data: allItems } = await supabase
      .from("items").select("id, item_code, drawing_revision").eq("company_id", companyId);
    const codeToId = new Map<string, string>();
    const drawingToId = new Map<string, string>();
    for (const item of (allItems ?? []) as any[]) {
      if (item.item_code) codeToId.set((item.item_code as string).toLowerCase(), item.id as string);
      if (item.drawing_revision) drawingToId.set((item.drawing_revision as string).toLowerCase(), item.id as string);
    }

    // Pre-fetch parties (vendors) for vendor lookup
    const { data: allParties } = await (supabase as any)
      .from("parties")
      .select("id, name, party_code")
      .in("party_type", ["vendor", "both"])
      .eq("company_id", companyId);
    const partyCodeToVendor = new Map<string, { id: string; name: string }>();
    for (const p of (allParties ?? []) as any[]) {
      if (p.party_code) partyCodeToVendor.set((p.party_code as string).toLowerCase(), { id: p.id, name: p.name });
    }

    let skipped = 0;
    const errors: string[] = [];
    const skipReasons: SkipReason[] = [];

    // Resolve parent/child IDs in memory
    type VendorEntry = { code: string; process: string; leadDays: number };
    type ResolvedRow = {
      parentId: string; childId: string; qty: number; unit: string;
      scrapFactor: number; notes: string | null; variantName: string | null; excelRow: number;
      vendors: VendorEntry[];
    };
    const resolvedRows: ResolvedRow[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = rowNums[i] ?? (i + 2);
      const parentCode = row["finished_item_code"]?.trim() ?? "";
      const childCode = row["component_code"]?.trim() ?? "";
      const qty = parseFloat(row["quantity"] || "0");
      const parentId = codeToId.get(parentCode.toLowerCase()) ?? drawingToId.get(parentCode.toLowerCase());
      const childId = codeToId.get(childCode.toLowerCase()) ?? drawingToId.get(childCode.toLowerCase());
      if (!parentId || !childId) {
        skipped++;
        const missingCode = !parentId ? parentCode : childCode;
        skipReasons.push({ row: excelRow, value: parentCode, reason: `Item '${missingCode}' not found — checked both item code and drawing number` });
        continue;
      }
      // Collect vendor entries (1-3) from row
      const vendors: VendorEntry[] = [];
      for (const n of [1, 2, 3] as const) {
        const code = row[`vendor${n}_code`]?.trim();
        if (code) {
          vendors.push({
            code,
            process: row[`vendor${n}_process`]?.trim() || "",
            leadDays: parseInt(row[`vendor${n}_lead_days`] || "7", 10) || 7,
          });
        }
      }
      resolvedRows.push({
        parentId, childId, qty, unit: row["unit"]?.trim() || "NOS",
        scrapFactor: parseFloat(row["scrap_factor"] || "0") || 0,
        notes: row["notes"]?.trim() || null,
        variantName: row["variant_name"]?.trim() || null,
        excelRow,
        vendors,
      });
    }

    if (resolvedRows.length === 0) {
      return { imported: 0, skipped, errors, skipReasons };
    }

    // Pre-fetch existing variants + BOM lines in two queries
    const [{ data: existingVariants }, { data: existingBomLines }] = await Promise.all([
      (supabase as any).from("bom_variants").select("id, parent_item_id, variant_name").eq("company_id", companyId),
      (supabase as any).from("bom_lines").select("id, parent_item_id, child_item_id").eq("company_id", companyId),
    ]);

    const variantMap = new Map<string, string>(
      (existingVariants ?? []).map((v: any) => [`${v.parent_item_id}:${v.variant_name}`, v.id as string])
    );
    const bomLineMap = new Map<string, string>(
      (existingBomLines ?? []).map((b: any) => [`${b.parent_item_id}:${b.child_item_id}`, b.id as string])
    );

    // Bulk insert any new variants needed
    const newVariantsNeeded = new Map<string, { parent_item_id: string; variant_name: string }>();
    for (const r of resolvedRows) {
      if (r.variantName) {
        const key = `${r.parentId}:${r.variantName}`;
        if (!variantMap.has(key)) {
          newVariantsNeeded.set(key, { parent_item_id: r.parentId, variant_name: r.variantName });
        }
      }
    }
    if (newVariantsNeeded.size > 0) {
      const toInsertVariants = [...newVariantsNeeded.values()].map((v) => ({ ...v, company_id: companyId }));
      const { data: insertedVariants } = await (supabase as any)
        .from("bom_variants").insert(toInsertVariants).select("id, parent_item_id, variant_name");
      for (const v of (insertedVariants ?? []) as any[]) {
        variantMap.set(`${v.parent_item_id}:${v.variant_name}`, v.id as string);
      }
    }

    // Split BOM lines into insert vs update, tracking vendors per row
    type InsertRow = { payload: any; vendors: VendorEntry[]; parentId: string; childId: string };
    type UpdateRow = { id: string; payload: any; vendors: VendorEntry[] };
    const toInsert: InsertRow[] = [];
    const toUpdate: UpdateRow[] = [];
    for (const r of resolvedRows) {
      const variantId = r.variantName ? (variantMap.get(`${r.parentId}:${r.variantName}`) ?? null) : null;
      const payload: any = {
        company_id: companyId, parent_item_id: r.parentId, child_item_id: r.childId,
        quantity: r.qty, unit: r.unit, scrap_factor: r.scrapFactor, notes: r.notes,
      };
      if (variantId) payload.variant_id = variantId;
      const existingId = bomLineMap.get(`${r.parentId}:${r.childId}`);
      if (existingId) {
        toUpdate.push({ id: existingId, payload, vendors: r.vendors });
      } else {
        toInsert.push({ payload, vendors: r.vendors, parentId: r.parentId, childId: r.childId });
      }
    }

    let imported = 0;
    // bomLineId lookup for vendor insertion: parentId:childId → bomLineId
    const insertedLineIds = new Map<string, string>();

    // Insert new BOM lines (with .select() to get IDs for vendor insertion)
    if (toInsert.length > 0) {
      try {
        const { data: inserted, error } = await (supabase as any)
          .from("bom_lines").insert(toInsert.map((r) => r.payload)).select("id, parent_item_id, child_item_id");
        if (error) throw error;
        imported += toInsert.length;
        for (const row of (inserted ?? []) as any[]) {
          insertedLineIds.set(`${row.parent_item_id}:${row.child_item_id}`, row.id as string);
        }
      } catch {
        for (const line of toInsert) {
          try {
            const { data: ins, error } = await (supabase as any)
              .from("bom_lines").insert(line.payload).select("id, parent_item_id, child_item_id").single();
            if (error) throw error;
            imported++;
            if (ins) insertedLineIds.set(`${(ins as any).parent_item_id}:${(ins as any).child_item_id}`, (ins as any).id);
          } catch (err: any) {
            skipped++;
            skipReasons.push({ row: 0, value: "", reason: `DB error: ${err?.message ?? "unknown"}` });
          }
        }
      }
    }

    // Upsert updated BOM lines in chunks of 100
    for (let i = 0; i < toUpdate.length; i += 100) {
      const chunk = toUpdate.slice(i, i + 100);
      try {
        const upsertPayloads = chunk.map((r) => ({ id: r.id, ...r.payload }));
        const { error } = await (supabase as any).from("bom_lines").upsert(upsertPayloads, { onConflict: "id" });
        if (error) throw error;
        imported += chunk.length;
      } catch {
        for (const line of chunk) {
          try {
            const { error } = await (supabase as any).from("bom_lines").update(line.payload).eq("id", line.id);
            if (error) throw error;
            imported++;
          } catch (err: any) {
            skipped++;
            skipReasons.push({ row: 0, value: "", reason: `DB error: ${err?.message ?? "unknown"}` });
          }
        }
      }
    }

    // Insert vendors for each resolved row that has vendor data
    const allRowsWithVendors = [
      ...toInsert.map((r) => ({ lineId: insertedLineIds.get(`${r.parentId}:${r.childId}`) ?? null, vendors: r.vendors })),
      ...toUpdate.map((r) => ({ lineId: r.id, vendors: r.vendors })),
    ];

    for (const { lineId, vendors } of allRowsWithVendors) {
      if (!lineId || vendors.length === 0) continue;
      for (let vi = 0; vi < vendors.length; vi++) {
        const ve = vendors[vi];
        const found = partyCodeToVendor.get(ve.code.toLowerCase());
        if (!found) {
          skipReasons.push({ row: 0, value: ve.code, reason: `Vendor code '${ve.code}' not found in Parties master` });
          continue;
        }
        try {
          await (supabase as any).from("bom_line_vendors").insert({
            company_id: companyId,
            bom_line_id: lineId,
            vendor_id: found.id,
            vendor_name: found.name,
            vendor_code: ve.code,
            notes: ve.process || null,
            lead_time_days: ve.leadDays,
            currency: "INR",
            is_preferred: vi === 0,
            preference_order: vi + 1,
          });
        } catch {
          // Non-fatal — vendor insert failure doesn't fail the BOM line
        }
      }
    }

    // Process vendor sheet rows (if any) — adds vendors to ALL BOM lines containing the component
    let vendorMappingsCount = 0;
    if (vendorSheetRows.length > 0) {
      // Build childId → all lineIds map
      const childToLineIds = new Map<string, string[]>();
      for (const [key, lineId] of insertedLineIds) {
        const childId = key.split(":")[1];
        if (childId) {
          const arr = childToLineIds.get(childId) ?? [];
          arr.push(lineId);
          childToLineIds.set(childId, arr);
        }
      }
      for (const [key, lineId] of bomLineMap) {
        const childId = key.split(":")[1];
        if (childId) {
          const arr = childToLineIds.get(childId) ?? [];
          if (!arr.includes(lineId)) { arr.push(lineId); childToLineIds.set(childId, arr); }
        }
      }

      for (const vRow of vendorSheetRows) {
        const compCode = vRow["component_code"]?.trim() ?? "";
        const vendCode = vRow["vendor_code"]?.trim() ?? "";
        if (!compCode || !vendCode) continue;
        const childId = codeToId.get(compCode.toLowerCase()) ?? drawingToId.get(compCode.toLowerCase());
        if (!childId) continue;
        const found = partyCodeToVendor.get(vendCode.toLowerCase());
        if (!found) {
          skipReasons.push({ row: 0, value: vendCode, reason: `Vendor code '${vendCode}' not found in Parties master` });
          continue;
        }
        const lineIds = childToLineIds.get(childId) ?? [];
        const prefOrder = parseInt(vRow["preference_order"] || "1", 10) || 1;
        for (const lineId of lineIds) {
          try {
            await (supabase as any).from("bom_line_vendors").insert({
              company_id: companyId,
              bom_line_id: lineId,
              vendor_id: found.id,
              vendor_name: found.name,
              vendor_code: vendCode,
              notes: vRow["process_name"]?.trim() || vRow["notes"]?.trim() || null,
              lead_time_days: parseInt(vRow["lead_time_days"] || "7", 10) || 7,
              currency: "INR",
              is_preferred: prefOrder === 1,
              preference_order: prefOrder,
            });
            vendorMappingsCount++;
          } catch { /* non-fatal */ }
        }
      }
    }

    return { imported, skipped, errors, skipReasons, vendorMappings: vendorMappingsCount } as any;
  };

  // FIX 6: queue the import instead of awaiting directly
  const handleImport = () => {
    if (validRows.length === 0) return;
    const rowsToImport = validRows;
    const rowNumsToImport = validRowNums;
    const parseSkips = skipReasons.filter((s) => s.reason.includes("skipped automatically"));
    setRows([]); setValidRows([]); setValidRowNums([]);

    addJob("BOM lines", rowsToImport, rowNumsToImport, bomImportFn, {
      onComplete: (res) => {
        setResult({ imported: res.imported, skipped: res.skipped });
        setSkipReasons([...parseSkips, ...res.skipReasons]);
        queryClient.invalidateQueries({ queryKey: ["bom-lines"] });
      },
    });
    toast({ title: "Import started — you can keep working" });
  };

  return (
    <div className="space-y-4">
      {/* Result Banner */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              {result.imported} BOM lines imported · {result.skipped} skipped
              {(result as any).vendorMappings > 0 && ` · ${(result as any).vendorMappings} vendor mappings created`}
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

      {vendorCount > 0 && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-800">
          <Users className="h-3 w-3 shrink-0" />
          {vendorCount} vendor row{vendorCount !== 1 ? "s" : ""} detected from Vendors sheet — will be imported after BOM lines
        </div>
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
  onDownloadTemplate,
  invalidateOnComplete,
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
  onDownloadTemplate?: () => void | Promise<void>;
  /** Query keys to invalidate after the job completes (e.g. [["parties"], ["items"]]) */
  invalidateOnComplete?: string[][];
}) {
  const { toast } = useToast();
  const { addJob, jobs } = useImportQueue();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [validRows, setValidRows] = useState<Record<string, string>[]>([]);
  const [validRowNums, setValidRowNums] = useState<number[]>([]);
  const [errorRows, setErrorRows] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ imported: number; skipped: number; updated?: number } | null>(null);
  const [mappingSummary, setMappingSummary] = useState<ColumnMappingSummary | null>(null);
  const [columnWarnings, setColumnWarnings] = useState<string[]>([]);
  const [skipReasons, setSkipReasons] = useState<SkipReason[]>([]);
  // FIX 6: track the queued job so we can show completion toast
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // FIX 6: watch for job completion and show toast
  useEffect(() => {
    if (!currentJobId) return;
    const job = jobs.find((j) => j.id === currentJobId);
    if (!job) return;
    if (job.status === "completed" || job.status === "failed") {
      setCurrentJobId(null);
    }
  }, [jobs, currentJobId]);

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

  // FIX 6: queue the import instead of awaiting directly
  const handleImport = async () => {
    if (validRows.length === 0) return;

    // Verify session before queueing
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast({ title: "Session expired", description: "Please sign out and sign in again before importing.", variant: "destructive" });
      return;
    }
    try {
      await getCompanyId();
    } catch {
      toast({ title: "Company not found", description: "Please complete company setup before importing.", variant: "destructive" });
      return;
    }

    const rowsToImport = validRows;
    const rowNumsToImport = validRowNums;
    const parseSkips = skipReasons.filter((s) => s.reason.includes("skipped automatically"));
    setRows([]); setValidRows([]); setValidRowNums([]); setErrorRows(new Set());

    const id = addJob(title, rowsToImport, rowNumsToImport, onImport, {
      onComplete: (res) => {
        setResult({ imported: res.imported, skipped: res.skipped, updated: res.updated });
        setSkipReasons([...parseSkips, ...res.skipReasons]);
        // Invalidate queries once — after the full job finishes, not per batch
        invalidateOnComplete?.forEach((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        );
      },
    });
    setCurrentJobId(id);
    toast({ title: "Import started — you can keep working" });
  };

  return (
    <div className="space-y-4">
      {/* Result Banner */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              {result.updated != null
                ? `${result.imported} new · ${result.updated} updated · ${result.skipped} skipped`
                : `${result.imported} imported · ${result.skipped} skipped`}
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
          onClick={() => onDownloadTemplate ? onDownloadTemplate() : downloadTemplate(templateSheetName, templateHeaders)}
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

// ── Reorder Rules Import Tab ──────────────────────────────────────────────

function ReorderRulesTab() {
  const { toast } = useToast();
  const { addJob, jobs } = useImportQueue();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [validRows, setValidRows] = useState<Record<string, string>[]>([]);
  const [validRowNums, setValidRowNums] = useState<number[]>([]);
  const [errorRows, setErrorRows] = useState<Set<number>>(new Set());
  const [errorMessages, setErrorMessages] = useState<Map<number, string>>(new Map());
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{
    imported: number; updated: number; skipped: number; vendorNotFound: number;
  } | null>(null);
  const [mappingSummary, setMappingSummary] = useState<ColumnMappingSummary | null>(null);
  const [columnWarnings, setColumnWarnings] = useState<string[]>([]);
  const [skipReasons, setSkipReasons] = useState<SkipReason[]>([]);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!currentJobId) return;
    const job = jobs.find((j) => j.id === currentJobId);
    if (!job) return;
    if (job.status === "completed" || job.status === "failed") setCurrentJobId(null);
  }, [jobs, currentJobId]);

  const clearAll = () => {
    setRows([]); setValidRows([]); setValidRowNums([]); setErrors([]);
    setErrorRows(new Set()); setErrorMessages(new Map()); setResult(null);
    setMappingSummary(null); setColumnWarnings([]); setSkipReasons([]);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows: raw, rowNums: rawRowNums, skipped: parsedSkips } = await parseExcelSmart(file, REORDER_FIELD_MAP);

      if (raw.length === 0) {
        toast({ title: "No data found", description: "The file is empty or contains only column headers.", variant: "destructive" });
        e.target.value = "";
        return;
      }

      const headers = Object.keys(raw[0]);
      const colMap = resolveColumns(headers, REORDER_FIELD_MAP);
      const summary = buildMappingSummary(headers, colMap, REORDER_FIELD_MAP, ["reorder_point", "reorder_qty"]);
      setMappingSummary(summary);
      setColumnWarnings(summary.missingRequired.map((f) => `"${fieldDisplayName(f)}" column not found`));

      const parsed = raw.map((r) => extractRow(r, headers, colMap));

      const newErrorRows = new Set<number>();
      const newErrorMessages = new Map<number, string>();
      const newErrors: string[] = [];
      const newValidRows: Record<string, string>[] = [];
      const newValidRowNums: number[] = [];
      const newSkipReasons: SkipReason[] = [...parsedSkips];

      parsed.forEach((row, i) => {
        const excelRow = rawRowNums[i] ?? (i + 2);
        const code = row["item_code"]?.trim() || "";
        const drawing = row["drawing_revision"]?.trim() || "";
        const rpStr = row["reorder_point"]?.trim() || "";
        const rqStr = row["reorder_qty"]?.trim() || "";
        const ref = drawing || code;

        if (!rpStr && !rqStr) {
          newSkipReasons.push({ row: excelRow, value: ref, reason: "Both Reorder Point and Qty blank — skipped" });
          return;
        }
        if (!code && !drawing) {
          const msg = "Item Code or Drawing Number is required";
          newErrorRows.add(i); newErrorMessages.set(i, msg);
          newErrors.push(`Row ${excelRow}: ${msg}`);
          newSkipReasons.push({ row: excelRow, value: "", reason: msg });
          return;
        }
        if (rpStr && (isNaN(parseFloat(rpStr)) || parseFloat(rpStr) < 0)) {
          const msg = "Reorder Point must be a positive number";
          newErrorRows.add(i); newErrorMessages.set(i, msg);
          newErrors.push(`Row ${excelRow} (${code}): ${msg}`);
          newSkipReasons.push({ row: excelRow, value: code, reason: msg });
          return;
        }
        if (rqStr && (isNaN(parseFloat(rqStr)) || parseFloat(rqStr) < 0)) {
          const msg = "Reorder Qty must be a positive number";
          newErrorRows.add(i); newErrorMessages.set(i, msg);
          newErrors.push(`Row ${excelRow} (${code}): ${msg}`);
          newSkipReasons.push({ row: excelRow, value: code, reason: msg });
          return;
        }
        newValidRows.push(row);
        newValidRowNums.push(excelRow);
      });

      setRows(parsed); setValidRows(newValidRows); setValidRowNums(newValidRowNums);
      setErrorRows(newErrorRows); setErrorMessages(newErrorMessages);
      setErrors(newErrors); setSkipReasons(newSkipReasons); setResult(null);
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleImport = () => {
    if (validRows.length === 0) return;
    const rowsToImport = validRows;
    const rowNumsToImport = validRowNums;
    const parseSkips = skipReasons.filter((s) => s.reason.includes("blank"));
    setRows([]); setValidRows([]); setValidRowNums([]);
    setErrorRows(new Set()); setErrorMessages(new Map());

    // Mutable counters shared between batchFn and onComplete via closure
    let importedNew = 0, updatedCount = 0, vendorNotFound = 0;

    const batchFn: BatchImportFn = async (bRows, bRowNums, onProgress) => {
      const companyId = await getCompanyId();

      const { data: itemsRaw } = await supabase
        .from("items")
        .select("id, item_code, drawing_revision")
        .eq("company_id", companyId)
        .eq("status", "active");
      const codeToId = new Map<string, string>(
        (itemsRaw ?? []).map((i: any) => [String(i.item_code).toLowerCase(), String(i.id)])
      );
      const drawingToId = new Map<string, string>();
      for (const i of (itemsRaw ?? [])) {
        if ((i as any).drawing_revision) drawingToId.set(String((i as any).drawing_revision).toLowerCase(), String(i.id));
      }

      const { data: partiesRaw } = await (supabase as any)
        .from("parties")
        .select("id, name")
        .eq("company_id", companyId);
      const vendorByName = new Map<string, string>();
      for (const p of (partiesRaw ?? [])) vendorByName.set(String(p.name).toLowerCase(), p.id);

      const { data: existingRules } = await (supabase as any)
        .from("reorder_rules")
        .select("id, item_id")
        .eq("company_id", companyId);
      const existingByItemId = new Map<string, string>();
      for (const r of (existingRules ?? [])) existingByItemId.set(r.item_id, r.id);

      let skipped = 0;
      const errors: string[] = [];
      const skipReasons: SkipReason[] = [];
      const total = bRows.length;

      for (let i = 0; i < bRows.length; i++) {
        const row = bRows[i];
        const excelRow = bRowNums[i] ?? (i + 2);
        const code = row["item_code"]?.trim() || "";
        const drawing = row["drawing_revision"]?.trim() || "";
        const ref = drawing || code;
        const itemId = (drawing ? drawingToId.get(drawing.toLowerCase()) : undefined) ?? (code ? codeToId.get(code.toLowerCase()) : undefined);

        if (!itemId) {
          skipped++;
          errors.push(`Row ${excelRow} (${ref}): Item not found in Items master`);
          skipReasons.push({ row: excelRow, value: ref, reason: `Item '${ref}' not found` });
          if (total > 0) onProgress?.(Math.round(((i + 1) / total) * 100));
          continue;
        }

        const reorderPoint = parseFloat(row["reorder_point"] || "0") || 0;
        const reorderQty = parseFloat(row["reorder_qty"] || "0") || 0;
        const ltStr = row["lead_time_days"]?.trim();
        const leadTimeDays = ltStr ? (Math.max(1, parseInt(ltStr) || 7)) : 7;

        let preferred_vendor_id: string | null = null;
        const vendorCode = row["preferred_vendor_code"]?.trim();
        if (vendorCode) {
          const vid = vendorByName.get(vendorCode.toLowerCase());
          if (vid) {
            preferred_vendor_id = vid;
          } else {
            vendorNotFound++;
          }
        }

        const ruleData: any = {
          company_id: companyId,
          item_id: itemId,
          reorder_point: reorderPoint,
          reorder_qty: reorderQty,
          lead_time_days: leadTimeDays,
          preferred_vendor_id,
          notes: row["notes"] || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        };

        try {
          const existingId = existingByItemId.get(itemId);
          if (existingId) {
            const { error } = await (supabase as any).from("reorder_rules").update(ruleData).eq("id", existingId);
            if (error) throw error;
            updatedCount++;
          } else {
            const { error } = await (supabase as any).from("reorder_rules").insert(ruleData);
            if (error) throw error;
            importedNew++;
          }
          await (supabase as any).from("items").update({ min_stock: reorderPoint }).eq("id", itemId);
        } catch (err: any) {
          skipped++;
          errors.push(`Row ${excelRow} (${ref}): ${err?.message ?? "DB error"}`);
          skipReasons.push({ row: excelRow, value: ref, reason: `DB error: ${err?.message ?? "unknown"}` });
        }

        if (total > 0) onProgress?.(Math.round(((i + 1) / total) * 100));
      }

      return { imported: importedNew + updatedCount, skipped, errors, skipReasons };
    };

    const id = addJob("Reorder Rules", rowsToImport, rowNumsToImport, batchFn, {
      onComplete: (res) => {
        setResult({ imported: importedNew, updated: updatedCount, skipped: res.skipped, vendorNotFound });
        setSkipReasons([...parseSkips, ...res.skipReasons]);
        queryClient.invalidateQueries({ queryKey: ["reorder-rules"] });
        queryClient.invalidateQueries({ queryKey: ["stock_status"] });
        queryClient.invalidateQueries({ queryKey: ["count", "reorder_rules"] });
        queryClient.invalidateQueries({ queryKey: ["items"] });
      },
    });
    setCurrentJobId(id);
    toast({ title: "Import started — you can keep working" });
  };

  return (
    <div className="space-y-4">
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
            <span className="text-sm text-green-800 font-medium">
              {result.imported} new · {result.updated} updated · {result.skipped} skipped
              {result.vendorNotFound > 0 && ` · ${result.vendorNotFound} vendor code${result.vendorNotFound !== 1 ? "s" : ""} not found (rules imported without vendor)`}
            </span>
          </div>
          <SkipReasonsPanel reasons={skipReasons} />
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadReorderRulesTemplate}>
          <Download className="h-4 w-4" /> Download Template
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" /> Choose Excel File
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls,.csv" className="hidden" onChange={handleFile} />
        {validRows.length > 0 && (
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleImport}>
            Import {validRows.length} Row{validRows.length !== 1 ? "s" : ""}
          </Button>
        )}
        {rows.length > 0 && <Button size="sm" variant="ghost" onClick={clearAll}>Clear</Button>}
      </div>

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

      {errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            {errors.length} validation issue(s) — these rows will be skipped
          </div>
          {errors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-amber-700 pl-5">{e}</p>)}
          {errors.length > 5 && <p className="text-xs text-amber-600 pl-5">…and {errors.length - 5} more</p>}
        </div>
      )}

      {mappingSummary && rows.length > 0 && (
        <MappingSummaryBar summary={mappingSummary} columnWarnings={columnWarnings} />
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">Preview — {rows.length} rows</p>
          <PreviewTableWithErrors rows={rows.slice(0, 20)} errorRows={errorRows} errorMessages={errorMessages} />
          {rows.length > 20 && <p className="text-xs text-muted-foreground">Showing first 20 of {rows.length} rows</p>}
        </div>
      )}

      {rows.length === 0 && !result && (
        <div className="border-2 border-dashed border-border rounded-xl py-12 text-center">
          <Table className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-medium">Upload an Excel file to preview and import Reorder Rules</p>
          <p className="text-xs text-muted-foreground mt-1">Download the template above to get started</p>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type ClearTarget = { type: "parties" | "items" | "bom" | "stock" | "reorder_rules"; noun: string; count: number };

export default function DataImport() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState((location.state as any)?.tab ?? "parties");

  useEffect(() => {
    if ((location.state as any)?.tab) {
      setActiveTab((location.state as any).tab);
      window.history.replaceState({}, "");
    }
  }, [location.state]);
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

  const { data: reorderRulesCount = 0, refetch: refetchReorderRulesCount } = useQuery({
    queryKey: ["count", "reorder_rules"],
    queryFn: async () => {
      const companyId = await getCompanyId();
      const { count } = await (supabase as any).from("reorder_rules").select("id", { count: "exact", head: true }).eq("company_id", companyId);
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
        reorder_rules: "clear_all_reorder_rules",
      };
      const { data, error } = await (supabase as any).rpc(rpcMap[clearTarget.type], { p_company_id: companyId });
      if (error) throw error;
      const count = (data as number) ?? 0;
      if (clearTarget.type === "parties") { queryClient.invalidateQueries({ queryKey: ["parties"] }); refetchPartiesCount(); }
      else if (clearTarget.type === "items") { queryClient.invalidateQueries({ queryKey: ["items"] }); refetchItemsCount(); }
      else if (clearTarget.type === "bom") { queryClient.invalidateQueries({ queryKey: ["bom-lines"] }); refetchBomCount(); }
      else if (clearTarget.type === "stock") { queryClient.invalidateQueries({ queryKey: ["items"] }); queryClient.invalidateQueries({ queryKey: ["stock_status"] }); refetchStockCount(); }
      else { queryClient.invalidateQueries({ queryKey: ["reorder-rules"] }); queryClient.invalidateQueries({ queryKey: ["stock_status"] }); refetchReorderRulesCount(); }
      toast({ title: `All ${count} ${clearTarget.noun} cleared successfully` });
      setClearTarget(null);
    } catch (err: any) {
      const isFkError = String(err?.message ?? "").includes("violates foreign key constraint");
      const isItemsOrParties = clearTarget?.type === "items" || clearTarget?.type === "parties";
      const description = isFkError && isItemsOrParties
        ? "Cannot delete — some records are linked to existing DCs, POs or other documents. Clear those documents first, or contact support."
        : err.message;
      toast({ title: "Clear failed", description, variant: "destructive" });
    } finally {
      setClearLoading(false);
    }
  };

  const handleStockImport: BatchImportFn = async (rows, rowNums) => {
    const companyId = await getCompanyId();

    // Pre-fetch all items — support lookup by item_code or drawing_revision
    const { data: itemsData } = await supabase
      .from("items").select("id, item_code, drawing_revision").eq("company_id", companyId);
    const codeToId = new Map<string, string>((itemsData ?? []).map((i: any) => [String(i.item_code).toLowerCase(), i.id]));
    const drawingToId = new Map<string, string>();
    for (const i of (itemsData ?? [])) {
      if ((i as any).drawing_revision) drawingToId.set(String((i as any).drawing_revision).toLowerCase(), (i as any).id);
    }

    let skipped = 0;
    const errors: string[] = [];
    const skipReasons: SkipReason[] = [];
    const toUpdate: Array<{ id: string; current_stock: number; standard_cost?: number }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = rowNums[i] ?? (i + 2);
      const code = row["item_code"]?.trim();
      const drawing = row["drawing_revision"]?.trim();
      const qty = parseFloat(row["current_stock"] || "");
      if (!code && !drawing) {
        skipped++;
        errors.push(`Row ${excelRow}: Item Code or Drawing Number was blank or missing`);
        skipReasons.push({ row: excelRow, value: "", reason: "Item Code or Drawing Number was blank or missing" });
        continue;
      }
      if (isNaN(qty)) {
        const ref = drawing || code || "";
        skipped++;
        errors.push(`Row ${excelRow} (${ref}): Opening Stock Qty is not a valid number`);
        skipReasons.push({ row: excelRow, value: ref, reason: "Opening Stock Qty is not a valid number" });
        continue;
      }
      // Try drawing_revision first, then item_code
      const itemId = (drawing ? drawingToId.get(drawing.toLowerCase()) : undefined) ?? (code ? codeToId.get(code.toLowerCase()) : undefined);
      const ref = drawing || code || "";
      if (!itemId) {
        skipped++;
        errors.push(`Row ${excelRow} (${ref}): Item not found in Items master`);
        skipReasons.push({ row: excelRow, value: ref, reason: `Item '${ref}' not found in Items master` });
        continue;
      }
      const costPerUnit = parseFloat(row["standard_cost"] || "");
      const entry: { id: string; current_stock: number; standard_cost?: number } = { id: itemId, current_stock: qty };
      if (!isNaN(costPerUnit) && costPerUnit >= 0) entry.standard_cost = costPerUnit;
      toUpdate.push(entry);
    }

    let imported = 0;

    // Bulk upsert current_stock (and standard_cost if provided) in chunks of 100
    for (let i = 0; i < toUpdate.length; i += 100) {
      const chunk = toUpdate.slice(i, i + 100);
      try {
        const { error } = await supabase.from("items").upsert(chunk as any, { onConflict: "id" });
        if (error) throw error;
        imported += chunk.length;
      } catch {
        for (const item of chunk) {
          try {
            const { id, ...updateFields } = item;
            const { error } = await supabase.from("items").update(updateFields as any).eq("id", id);
            if (error) throw error;
            imported++;
          } catch (err: any) {
            skipped++;
            skipReasons.push({ row: 0, value: item.id, reason: `DB error: ${err?.message ?? "unknown"}` });
          }
        }
      }
    }

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
          { value: "reorder_rules", label: "Reorder Rules" },
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
            onImport={importPartiesBatch}
            invalidateOnComplete={[["parties"]]}
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
            onImport={importItemsBatch}
            invalidateOnComplete={[["items"]]}
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
            requiredFields={["current_stock"]}
            primaryKeyField="item_code"
            onImport={handleStockImport}
            invalidateOnComplete={[["items"], ["stock_status"]]}
            validate={(row) => {
              if (!row["item_code"]?.trim()) return "Item Code is required";
              if (isNaN(parseFloat(row["current_stock"] || ""))) return "Quantity must be a number";
              return null;
            }}
            onDownloadTemplate={downloadOpeningStockTemplate}
          />
        </div>
      )}

      {activeTab === "reorder_rules" && (
        <div className="paper-card mt-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-900">Import Reorder Rules</h2>
            {reorderRulesCount > 0 && (
              <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
                onClick={() => setClearTarget({ type: "reorder_rules", noun: "reorder rules", count: reorderRulesCount })}>
                <Trash2 className="h-3.5 w-3.5" /> Clear All ({reorderRulesCount})
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Set reorder points, reorder quantities and lead times for each item. Updates items' minimum stock level for Stock Register alerts.
          </p>
          <ReorderRulesTab />
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
