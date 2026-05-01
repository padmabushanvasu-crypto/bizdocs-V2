// Weekly PO Summary Email — Supabase Edge Function
//
// Schedule: triggered daily (e.g. via Supabase Cron at the configured time
// in your project). For each company we read po_email_day from
// company_settings and only send if today matches that day name.
//
// Output: a real .xlsx workbook with 4 sheets (line-level POs raised in the
// last 7 days, open POs, partially received POs, POs open >30 days), styled
// with header fills, zebra stripes, and overdue/due-soon row colouring.
//
// xlsx-js-style is used instead of the community xlsx package because the
// community edition silently drops cell styling on write.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx-js-style@1.2.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@bizdocs.in";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Style constants ─────────────────────────────────────────────────────────

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
  fill: { patternType: "solid", fgColor: { rgb: "1E40AF" } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: thinBorder("1E40AF"),
};
const ZEBRA_LIGHT = { patternType: "solid", fgColor: { rgb: "FFFFFF" } };
const ZEBRA_DARK  = { patternType: "solid", fgColor: { rgb: "F8F9FA" } };
const OVERDUE_FILL = { patternType: "solid", fgColor: { rgb: "FEE2E2" } };
const DUE_SOON_FILL = { patternType: "solid", fgColor: { rgb: "FEF3C7" } };

function thinBorder(rgb = "E2E8F0") {
  const side = { style: "thin", color: { rgb } };
  return { top: side, bottom: side, left: side, right: side };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function diffDays(targetIso: string | null | undefined, fromMs: number): number | null {
  if (!targetIso) return null;
  const t = new Date(targetIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - fromMs) / 86400000);
}

interface ColSpec {
  key: string;
  header: string;
  width: number;
  // Optional per-cell numeric format (currency, number, date)
  numFmt?: string;
  align?: "left" | "right" | "center";
}

interface RowMeta {
  // Optional row-level fill (overdue / due-soon) overrides zebra
  fill?: typeof OVERDUE_FILL;
  // Zebra group key — rows with the same key share a stripe band
  groupKey?: string;
}

function buildStyledSheet(
  cols: ColSpec[],
  rows: Array<Record<string, unknown>>,
  meta: RowMeta[] = [],
  emptyMessage = "No data"
) {
  // Header row + data rows (or single No-data row)
  const aoa: unknown[][] = [cols.map((c) => c.header)];
  if (rows.length === 0) {
    aoa.push([emptyMessage, ...new Array(cols.length - 1).fill("")]);
  } else {
    for (const r of rows) aoa.push(cols.map((c) => r[c.key] ?? ""));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws["!cols"] = cols.map((c) => ({ wch: c.width }));

  // Freeze top row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!frozen"] = ws["!freeze"];

  // Walk every cell and style it
  // Build zebra band map: alternating fills per groupKey occurrence
  const bandByGroup: Record<string, "light" | "dark"> = {};
  let bandToggle = false;
  for (let i = 0; i < meta.length; i++) {
    const key = meta[i]?.groupKey;
    if (!key) continue;
    if (!(key in bandByGroup)) {
      bandByGroup[key] = bandToggle ? "dark" : "light";
      bandToggle = !bandToggle;
    }
  }

  const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[ref];
      if (!cell) continue;
      const col = cols[C];
      // Always include a cell style object so xlsx-js-style emits styles
      cell.s = { border: thinBorder(), alignment: { vertical: "center" } };

      if (R === 0) {
        // Header row
        cell.s = { ...HEADER_STYLE };
      } else {
        // Data rows — fill priority: row-meta > zebra > white
        const dataIdx = R - 1;
        const m = meta[dataIdx];
        const fill = m?.fill
          ? m.fill
          : m?.groupKey
            ? (bandByGroup[m.groupKey] === "dark" ? ZEBRA_DARK : ZEBRA_LIGHT)
            : ZEBRA_LIGHT;

        cell.s = {
          fill,
          border: thinBorder(),
          alignment: {
            vertical: "center",
            horizontal: col?.align ?? (typeof cell.v === "number" ? "right" : "left"),
            wrapText: false,
          },
          font: { sz: 10 },
        };
        if (col?.numFmt) {
          cell.s.numFmt = col.numFmt;
          cell.z = col.numFmt;
        }
      }
    }
  }

  return ws;
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: companies } = await supabase
      .from("company_settings")
      .select(
        "id, company_id, company_name, po_email_enabled, po_email_recipients, po_email_day"
      );

    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies found" }), { status: 200 });
    }

    const now = new Date();
    const todayMs = now.getTime();
    const todayStr = now.toISOString().split("T")[0];
    const todayName = DAY_NAMES[now.getUTCDay()];
    const sevenDaysAgo = new Date(todayMs - 7 * 86400000).toISOString().split("T")[0];
    const thirtyDaysAgoIso = new Date(todayMs - 30 * 86400000).toISOString();

    const results: Array<Record<string, unknown>> = [];

    for (const company of companies as any[]) {
      if (!company.po_email_enabled) {
        results.push({ company: company.company_name, status: "disabled" });
        continue;
      }

      const configuredDay: string = company.po_email_day ?? "Monday";
      if (configuredDay !== todayName) {
        results.push({
          company: company.company_name,
          status: "not_today",
          configured: configuredDay,
          today: todayName,
        });
        continue;
      }

      const recipients: string[] = Array.isArray(company.po_email_recipients)
        ? company.po_email_recipients
        : [];
      if (recipients.length === 0) {
        results.push({ company: company.company_name, status: "no_recipients" });
        continue;
      }

      const companyId = company.company_id;

      // ── Fetch POs (last 7 days raised + all open) ──────────────────────
      const { data: lastWeekPOs } = await supabase
        .from("purchase_orders")
        .select(
          "id, po_number, po_date, vendor_name, status, line_items:po_line_items(drawing_number, description, quantity, unit, unit_price, line_total, serial_number)"
        )
        .eq("company_id", companyId)
        .gte("po_date", sevenDaysAgo)
        .lte("po_date", todayStr)
        .order("po_date", { ascending: true });

      const { data: openPOs } = await supabase
        .from("purchase_orders")
        .select(
          "id, po_number, po_date, vendor_name, status, issued_at, vendor_phone, line_items:po_line_items(drawing_number, description, quantity, unit, unit_price, line_total, serial_number, delivery_date, received_quantity, pending_quantity)"
        )
        .eq("company_id", companyId)
        .in("status", ["issued", "partially_received"])
        .order("po_date", { ascending: false });

      // ── Sheet 1 — POs Raised (Last 7 Days) ─────────────────────────────
      const s1Cols: ColSpec[] = [
        { key: "po_number", header: "PO Number", width: 16 },
        { key: "po_date", header: "PO Date", width: 14 },
        { key: "vendor", header: "Vendor", width: 28 },
        { key: "drawing", header: "Drawing No.", width: 16 },
        { key: "description", header: "Item Description", width: 36 },
        { key: "qty", header: "Qty", width: 8, numFmt: "#,##0", align: "right" },
        { key: "unit", header: "Unit", width: 8, align: "center" },
        { key: "unit_price", header: "Unit Price", width: 12, numFmt: "#,##0.00", align: "right" },
        { key: "line_total", header: "Line Total", width: 14, numFmt: "#,##0.00", align: "right" },
        { key: "po_status", header: "PO Status", width: 18 },
      ];
      const s1Rows: Array<Record<string, unknown>> = [];
      const s1Meta: RowMeta[] = [];
      for (const po of (lastWeekPOs ?? []) as any[]) {
        const lines = (po.line_items ?? []) as any[];
        if (lines.length === 0) {
          s1Rows.push({
            po_number: po.po_number,
            po_date: fmtDate(po.po_date),
            vendor: po.vendor_name ?? "",
            drawing: "",
            description: "(no line items)",
            qty: "",
            unit: "",
            unit_price: "",
            line_total: "",
            po_status: po.status,
          });
          s1Meta.push({ groupKey: po.id });
        } else {
          for (const li of lines) {
            s1Rows.push({
              po_number: po.po_number,
              po_date: fmtDate(po.po_date),
              vendor: po.vendor_name ?? "",
              drawing: li.drawing_number ?? "",
              description: li.description ?? "",
              qty: li.quantity ?? 0,
              unit: li.unit ?? "",
              unit_price: li.unit_price ?? 0,
              line_total: li.line_total ?? 0,
              po_status: po.status,
            });
            s1Meta.push({ groupKey: po.id });
          }
        }
      }

      // ── Sheet 2 — Open POs ─────────────────────────────────────────────
      const s2Cols: ColSpec[] = [
        { key: "po_number", header: "PO Number", width: 16 },
        { key: "po_date", header: "PO Date", width: 14 },
        { key: "vendor", header: "Vendor", width: 28 },
        { key: "vendor_phone", header: "Vendor Phone", width: 16 },
        { key: "drawing", header: "Drawing No.", width: 16 },
        { key: "description", header: "Item Description", width: 36 },
        { key: "qty", header: "Qty", width: 8, numFmt: "#,##0", align: "right" },
        { key: "unit", header: "Unit", width: 8, align: "center" },
        { key: "delivery_date", header: "Expected Delivery", width: 16 },
        { key: "days_remaining", header: "Days Remaining", width: 14, align: "right" },
        { key: "line_total", header: "Line Total", width: 14, numFmt: "#,##0.00", align: "right" },
        { key: "alert", header: "Alert", width: 14, align: "center" },
      ];
      const s2Rows: Array<Record<string, unknown>> = [];
      const s2Meta: RowMeta[] = [];
      for (const po of (openPOs ?? []) as any[]) {
        const lines = (po.line_items ?? []) as any[];
        const baseRow = {
          po_number: po.po_number,
          po_date: fmtDate(po.po_date),
          vendor: po.vendor_name ?? "",
          vendor_phone: po.vendor_phone ?? "",
        };
        if (lines.length === 0) {
          s2Rows.push({
            ...baseRow,
            drawing: "",
            description: "(no line items)",
            qty: "",
            unit: "",
            delivery_date: "",
            days_remaining: "",
            line_total: "",
            alert: "",
          });
          s2Meta.push({ groupKey: po.id });
        } else {
          for (const li of lines) {
            const days = diffDays(li.delivery_date, todayMs);
            let alert = "";
            let fill: typeof OVERDUE_FILL | undefined;
            if (days != null) {
              if (days < 0) {
                alert = "⚠ OVERDUE";
                fill = OVERDUE_FILL;
              } else if (days <= 7) {
                alert = "⚑ Due Soon";
                fill = DUE_SOON_FILL;
              }
            }
            s2Rows.push({
              ...baseRow,
              drawing: li.drawing_number ?? "",
              description: li.description ?? "",
              qty: li.quantity ?? 0,
              unit: li.unit ?? "",
              delivery_date: fmtDate(li.delivery_date),
              days_remaining: days ?? "",
              line_total: li.line_total ?? 0,
              alert,
            });
            s2Meta.push({ groupKey: po.id, fill });
          }
        }
      }

      // ── Sheet 3 — Partially Received POs ───────────────────────────────
      const partialPOs = (openPOs ?? []).filter((p: any) => p.status === "partially_received");
      const s3Cols: ColSpec[] = [
        { key: "po_number", header: "PO Number", width: 16 },
        { key: "po_date", header: "PO Date", width: 14 },
        { key: "vendor", header: "Vendor", width: 28 },
        { key: "drawing", header: "Drawing No.", width: 16 },
        { key: "description", header: "Item Description", width: 36 },
        { key: "qty_ordered", header: "Qty Ordered", width: 12, numFmt: "#,##0", align: "right" },
        { key: "qty_received", header: "Qty Received", width: 12, numFmt: "#,##0", align: "right" },
        { key: "qty_pending", header: "Qty Pending", width: 12, numFmt: "#,##0", align: "right" },
        { key: "unit", header: "Unit", width: 8, align: "center" },
        { key: "line_total", header: "Line Total", width: 14, numFmt: "#,##0.00", align: "right" },
      ];
      const s3Rows: Array<Record<string, unknown>> = [];
      const s3Meta: RowMeta[] = [];
      for (const po of partialPOs as any[]) {
        for (const li of (po.line_items ?? []) as any[]) {
          const qOrd = Number(li.quantity ?? 0);
          const qRec = Number(li.received_quantity ?? 0);
          const qPen = li.pending_quantity != null ? Number(li.pending_quantity) : Math.max(0, qOrd - qRec);
          s3Rows.push({
            po_number: po.po_number,
            po_date: fmtDate(po.po_date),
            vendor: po.vendor_name ?? "",
            drawing: li.drawing_number ?? "",
            description: li.description ?? "",
            qty_ordered: qOrd,
            qty_received: qRec,
            qty_pending: qPen,
            unit: li.unit ?? "",
            line_total: li.line_total ?? 0,
          });
          s3Meta.push({ groupKey: po.id });
        }
      }

      // ── Sheet 4 — Overdue (issued > 30 days ago, still open) ───────────
      const overduePOs = (openPOs ?? []).filter(
        (p: any) => p.issued_at && p.issued_at < thirtyDaysAgoIso
      );
      const s4Cols: ColSpec[] = [
        { key: "po_number", header: "PO Number", width: 16 },
        { key: "issued_at", header: "Date Issued", width: 14 },
        { key: "vendor", header: "Vendor", width: 28 },
        { key: "vendor_phone", header: "Vendor Phone", width: 16 },
        { key: "drawing", header: "Drawing No.", width: 16 },
        { key: "description", header: "Item Description", width: 36 },
        { key: "qty", header: "Qty", width: 8, numFmt: "#,##0", align: "right" },
        { key: "unit", header: "Unit", width: 8, align: "center" },
        { key: "days_overdue", header: "Days Overdue", width: 14, align: "right" },
        { key: "line_total", header: "Line Total", width: 14, numFmt: "#,##0.00", align: "right" },
      ];
      const s4Rows: Array<Record<string, unknown>> = [];
      const s4Meta: RowMeta[] = [];
      for (const po of overduePOs as any[]) {
        const issuedMs = new Date(po.issued_at).getTime();
        const daysOpen = Math.floor((todayMs - issuedMs) / 86400000);
        for (const li of (po.line_items ?? []) as any[]) {
          s4Rows.push({
            po_number: po.po_number,
            issued_at: fmtDate(po.issued_at),
            vendor: po.vendor_name ?? "",
            vendor_phone: po.vendor_phone ?? "",
            drawing: li.drawing_number ?? "",
            description: li.description ?? "",
            qty: li.quantity ?? 0,
            unit: li.unit ?? "",
            days_overdue: daysOpen,
            line_total: li.line_total ?? 0,
          });
          s4Meta.push({ groupKey: po.id, fill: OVERDUE_FILL });
        }
      }

      // ── Build workbook ─────────────────────────────────────────────────
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, buildStyledSheet(s1Cols, s1Rows, s1Meta), "POs Raised");
      XLSX.utils.book_append_sheet(wb, buildStyledSheet(s2Cols, s2Rows, s2Meta), "Open POs");
      XLSX.utils.book_append_sheet(wb, buildStyledSheet(s3Cols, s3Rows, s3Meta), "Partially Received");
      XLSX.utils.book_append_sheet(wb, buildStyledSheet(s4Cols, s4Rows, s4Meta), "Overdue (>30d)");

      const xlsxBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });
      const xlsxBytes = new Uint8Array(xlsxBuffer as ArrayBuffer);
      // Base64 encode
      let binary = "";
      for (let i = 0; i < xlsxBytes.length; i++) binary += String.fromCharCode(xlsxBytes[i]);
      const attachmentBase64 = btoa(binary);

      // ── Summary numbers ────────────────────────────────────────────────
      const poRaisedCount = (lastWeekPOs ?? []).length;
      const poRaisedValue = (lastWeekPOs ?? []).reduce((s: number, p: any) => {
        const total = ((p.line_items ?? []) as any[]).reduce((ls: number, li: any) => ls + (Number(li.line_total) || 0), 0);
        return s + total;
      }, 0);
      const openCount = (openPOs ?? []).length;
      const openValue = (openPOs ?? []).reduce((s: number, p: any) => {
        const total = ((p.line_items ?? []) as any[]).reduce((ls: number, li: any) => ls + (Number(li.line_total) || 0), 0);
        return s + total;
      }, 0);
      const partialCount = partialPOs.length;
      const overdueCount = overduePOs.length;

      const fmtINR = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
      const fileName = `PO_Weekly_${todayStr}.xlsx`;
      const emailBody = `Weekly PO Summary — ${company.company_name ?? ""}

POs raised in the last 7 days: ${poRaisedCount} (${fmtINR(poRaisedValue)})
Open POs: ${openCount} (${fmtINR(openValue)})
Partially received: ${partialCount}
Open more than 30 days: ${overdueCount}

Attached: ${fileName}

— BizDocs`;

      // ── Send email via Resend ─────────────────────────────────────────
      if (!RESEND_API_KEY) {
        console.log("RESEND_API_KEY not set — skipping email for", company.company_name);
        results.push({ company: company.company_name, status: "skipped_no_key" });
        continue;
      }

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: recipients,
          subject: `Weekly PO Summary — ${company.company_name ?? ""} — ${todayStr}`,
          text: emailBody,
          attachments: [
            {
              filename: fileName,
              content: attachmentBase64,
            },
          ],
        }),
      });

      const emailData = await emailRes.json().catch(() => ({}));
      results.push({
        company: company.company_name,
        status: "sent",
        recipients: recipients.length,
        poRaised: poRaisedCount,
        openPOs: openCount,
        partial: partialCount,
        overdue: overdueCount,
        emailStatus: emailRes.status,
        emailId: emailData?.id,
      });
    }

    return new Response(JSON.stringify({ success: true, todayName, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("weekly-po-email error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
