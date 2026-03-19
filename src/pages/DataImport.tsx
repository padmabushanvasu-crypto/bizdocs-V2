import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, Download, CheckCircle, XCircle, AlertTriangle, Table, Users, Package, GitFork } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { createParty } from "@/lib/parties-api";
import { createItem } from "@/lib/items-api";
import { supabase } from "@/integrations/supabase/client";
import { getCompanyId } from "@/lib/auth-helpers";

// Lazy-load xlsx to keep bundle light
async function parseExcel(file: File): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx-js-style");
  const buffer = await file.arrayBuffer();
  const wb = (XLSX as any).read(new Uint8Array(buffer), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return (XLSX as any).utils.sheet_to_json(ws, { defval: "" }) as Record<string, string>[];
}

// ── Template download helpers ──────────────────────────────────────────────

async function downloadTemplate(sheetName: string, headers: string[]) {
  const XLSX = await import("xlsx-js-style");
  const wb = (XLSX as any).utils.book_new();
  const ws = (XLSX as any).utils.aoa_to_sheet([headers]);
  (XLSX as any).utils.book_append_sheet(wb, ws, sheetName);
  (XLSX as any).writeFile(wb, `${sheetName.replace(/\s/g, "_")}_Template.xlsx`);
}

const PARTY_HEADERS = ["Company Name *", "Party Type (vendor/customer/both) *", "Contact Person", "Address Line 1", "City", "State", "PIN Code", "Phone 1", "Email", "GSTIN", "PAN", "Payment Terms", "Notes"];
const ITEM_HEADERS = ["Item Code *", "Description *", "Item Type *", "Unit", "HSN/SAC Code", "Sale Price", "Purchase Price", "GST Rate %", "Min Stock", "Notes"];
const BOM_HEADERS = ["Parent Item Code *", "Child Item Code *", "Quantity *", "Unit"];
const STOCK_HEADERS = ["Item Code *", "Opening Stock Qty *", "Notes"];

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

// ── Import Tab Component ───────────────────────────────────────────────────

function ImportTab({
  title,
  icon: Icon,
  templateHeaders,
  templateSheetName,
  onImport,
  validate,
}: {
  title: string;
  icon: React.ComponentType<any>;
  templateHeaders: string[];
  templateSheetName: string;
  onImport: (rows: Record<string, string>[]) => Promise<{ imported: number; skipped: number; errors: string[] }>;
  validate?: (row: Record<string, string>, i: number) => string | null;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [errorRows, setErrorRows] = useState<Set<number>>(new Set());
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseExcel(file);
      const newErrorRows = new Set<number>();
      const newErrors: string[] = [];
      if (validate) {
        parsed.forEach((row, i) => {
          const err = validate(row, i);
          if (err) { newErrorRows.add(i); newErrors.push(`Row ${i + 1}: ${err}`); }
        });
      }
      setRows(parsed);
      setErrorRows(newErrorRows);
      setErrors(newErrors);
      setResult(null);
    } catch (err: any) {
      toast({ title: "Failed to parse file", description: err.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleImport = async () => {
    if (rows.length === 0) return;
    setLoading(true);
    try {
      const res = await onImport(rows);
      setResult({ imported: res.imported, skipped: res.skipped });
      if (res.errors.length > 0) setErrors((prev) => [...prev, ...res.errors]);
      toast({ title: `Imported ${res.imported} row(s)` });
      setRows([]);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Result Banner */}
      {result && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-sm text-green-800 font-medium">
            {result.imported} imported, {result.skipped} skipped
          </span>
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
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
        {rows.length > 0 && (
          <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white" onClick={handleImport} disabled={loading}>
            {loading ? "Importing…" : `Import ${rows.length} Rows`}
          </Button>
        )}
        {rows.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => { setRows([]); setErrors([]); setResult(null); }}>
            Clear
          </Button>
        )}
      </div>

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

export default function DataImport() {
  const queryClient = useQueryClient();

  const handlePartyImport = async (rows: Record<string, string>[]) => {
    let imported = 0, skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const name = row["Company Name *"]?.trim();
      if (!name) { skipped++; continue; }
      try {
        await createParty({
          name,
          party_type: ((row["Party Type (vendor/customer/both) *"] || "both").toLowerCase()) as any,
          contact_person: row["Contact Person"] || null,
          address_line1: row["Address Line 1"] || null,
          city: row["City"] || null,
          state: row["State"] || null,
          pin_code: row["PIN Code"] || null,
          phone1: row["Phone 1"] || null,
          email1: row["Email"] || null,
          gstin: row["GSTIN"] || null,
          pan: row["PAN"] || null,
          payment_terms: row["Payment Terms"] || null,
          notes: row["Notes"] || null,
        } as any);
        imported++;
      } catch {
        skipped++;
        errors.push(`Failed to import: ${name}`);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["parties"] });
    return { imported, skipped, errors };
  };

  const handleItemImport = async (rows: Record<string, string>[]) => {
    let imported = 0, skipped = 0;
    const errors: string[] = [];
    for (const row of rows) {
      const code = row["Item Code *"]?.trim();
      const desc = row["Description *"]?.trim();
      if (!code || !desc) { skipped++; continue; }
      try {
        await createItem({
          item_code: code,
          description: desc,
          item_type: (row["Item Type *"] || "finished_good").toLowerCase().replace(/ /g, "_"),
          unit: row["Unit"] || "NOS",
          hsn_sac_code: row["HSN/SAC Code"] || null,
          sale_price: parseFloat(row["Sale Price"] || "0") || 0,
          purchase_price: parseFloat(row["Purchase Price"] || "0") || 0,
          gst_rate: parseFloat(row["GST Rate %"] || "18") || 18,
          min_stock: parseFloat(row["Min Stock"] || "0") || 0,
          notes: row["Notes"] || null,
        } as any);
        imported++;
      } catch {
        skipped++;
        errors.push(`Failed to import: ${code}`);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["items"] });
    return { imported, skipped, errors };
  };

  const handleBOMImport = async (rows: Record<string, string>[]) => {
    const companyId = await getCompanyId();
    let imported = 0, skipped = 0;
    const errors: string[] = [];

    // Resolve item codes to IDs
    const codes = [...new Set(rows.flatMap((r) => [r["Parent Item Code *"], r["Child Item Code *"]]).filter(Boolean))];
    const { data: itemsData } = await supabase.from("items").select("id, item_code").in("item_code", codes);
    const codeToId = new Map((itemsData ?? []).map((i: any) => [i.item_code, i.id]));

    for (const row of rows) {
      const parentCode = row["Parent Item Code *"]?.trim();
      const childCode = row["Child Item Code *"]?.trim();
      const qty = parseFloat(row["Quantity *"] || "0");
      if (!parentCode || !childCode || !qty) { skipped++; continue; }
      const parentId = codeToId.get(parentCode);
      const childId = codeToId.get(childCode);
      if (!parentId || !childId) {
        skipped++;
        errors.push(`Item codes not found: ${parentCode} → ${childCode}`);
        continue;
      }
      try {
        await (supabase as any).from("bom_lines").insert({
          company_id: companyId,
          parent_item_id: parentId,
          child_item_id: childId,
          quantity: qty,
          unit: row["Unit"] || "NOS",
        });
        imported++;
      } catch {
        skipped++;
      }
    }
    return { imported, skipped, errors };
  };

  const handleStockImport = async (rows: Record<string, string>[]) => {
    let imported = 0, skipped = 0;
    const errors: string[] = [];
    const codes = rows.map((r) => r["Item Code *"]?.trim()).filter(Boolean);
    const { data: itemsData } = await supabase.from("items").select("id, item_code").in("item_code", codes);
    const codeToId = new Map((itemsData ?? []).map((i: any) => [i.item_code, i.id]));

    for (const row of rows) {
      const code = row["Item Code *"]?.trim();
      const qty = parseFloat(row["Opening Stock Qty *"] || "0");
      if (!code || isNaN(qty)) { skipped++; continue; }
      const itemId = codeToId.get(code);
      if (!itemId) { skipped++; errors.push(`Item not found: ${code}`); continue; }
      try {
        await supabase.from("items").update({ current_stock: qty } as any).eq("id", itemId);
        imported++;
      } catch {
        skipped++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ["items"] });
    queryClient.invalidateQueries({ queryKey: ["stock_status"] });
    return { imported, skipped, errors };
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Data Import</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Import master data and opening balances from Excel. Download each template, fill it in, then upload.
        </p>
      </div>

      <Tabs defaultValue="parties">
        <TabsList className="flex-wrap">
          <TabsTrigger value="parties" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Parties
          </TabsTrigger>
          <TabsTrigger value="items" className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Items
          </TabsTrigger>
          <TabsTrigger value="bom" className="gap-1.5">
            <GitFork className="h-3.5 w-3.5" /> Bill of Materials
          </TabsTrigger>
          <TabsTrigger value="stock" className="gap-1.5">
            <Table className="h-3.5 w-3.5" /> Opening Stock
          </TabsTrigger>
        </TabsList>

        <TabsContent value="parties" className="paper-card mt-4">
          <h2 className="font-semibold text-slate-900 mb-1">Import Parties</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Import vendors, customers, and sub-contractors. Duplicate names will be skipped.
          </p>
          <ImportTab
            title="Parties"
            icon={Users}
            templateHeaders={PARTY_HEADERS}
            templateSheetName="Parties Import"
            onImport={handlePartyImport}
            validate={(row) => {
              if (!row["Company Name *"]?.trim()) return "Company Name is required";
              const type = (row["Party Type (vendor/customer/both) *"] || "").toLowerCase();
              if (!["vendor", "customer", "both", ""].includes(type)) return `Invalid party type: ${type}`;
              return null;
            }}
          />
        </TabsContent>

        <TabsContent value="items" className="paper-card mt-4">
          <h2 className="font-semibold text-slate-900 mb-1">Import Items</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Import your product, component, and material master list.
          </p>
          <ImportTab
            title="Items"
            icon={Package}
            templateHeaders={ITEM_HEADERS}
            templateSheetName="Items Import"
            onImport={handleItemImport}
            validate={(row) => {
              if (!row["Item Code *"]?.trim()) return "Item Code is required";
              if (!row["Description *"]?.trim()) return "Description is required";
              return null;
            }}
          />
        </TabsContent>

        <TabsContent value="bom" className="paper-card mt-4">
          <h2 className="font-semibold text-slate-900 mb-1">Import Bill of Materials</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Define parent-child relationships between items. Both items must already exist in the system.
          </p>
          <ImportTab
            title="BOM Lines"
            icon={GitFork}
            templateHeaders={BOM_HEADERS}
            templateSheetName="BOM Import"
            onImport={handleBOMImport}
            validate={(row) => {
              if (!row["Parent Item Code *"]?.trim()) return "Parent Item Code is required";
              if (!row["Child Item Code *"]?.trim()) return "Child Item Code is required";
              if (!parseFloat(row["Quantity *"] || "0")) return "Quantity must be > 0";
              return null;
            }}
          />
        </TabsContent>

        <TabsContent value="stock" className="paper-card mt-4">
          <h2 className="font-semibold text-slate-900 mb-1">Import Opening Stock</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Set the opening stock quantity for each item. Items must already exist in the system.
            This will overwrite the current_stock value.
          </p>
          <ImportTab
            title="Opening Stock"
            icon={Table}
            templateHeaders={STOCK_HEADERS}
            templateSheetName="Opening Stock"
            onImport={handleStockImport}
            validate={(row) => {
              if (!row["Item Code *"]?.trim()) return "Item Code is required";
              if (isNaN(parseFloat(row["Opening Stock Qty *"] || ""))) return "Quantity must be a number";
              return null;
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
