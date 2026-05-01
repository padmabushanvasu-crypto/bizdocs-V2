// Weekly DC Summary Email — Supabase Edge Function
//
// Two modes:
//   1. Scheduled email (default): triggered daily, iterates companies, only
//      sends for companies whose dc_email_day matches today, range = last 7
//      days. Returnable DCs only.
//   2. On-demand download: GET ?download=true&from=YYYY-MM-DD&to=YYYY-MM-DD
//      &company_id=<uuid> — returns the .xlsx binary directly.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx-js-style@1.2.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@bizdocs.in";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

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
  numFmt?: string;
  align?: "left" | "right" | "center";
}

interface RowMeta {
  fill?: typeof OVERDUE_FILL;
  groupKey?: string;
}

function buildStyledSheet(
  cols: ColSpec[],
  rows: Array<Record<string, unknown>>,
  meta: RowMeta[] = [],
  emptyMessage = "No data"
) {
  const aoa: unknown[][] = [cols.map((c) => c.header)];
  if (rows.length === 0) {
    aoa.push([emptyMessage, ...new Array(cols.length - 1).fill("")]);
  } else {
    for (const r of rows) aoa.push(cols.map((c) => r[c.key] ?? ""));
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map((c) => ({ wch: c.width }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!frozen"] = ws["!freeze"];

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

      if (R === 0) {
        cell.s = { ...HEADER_STYLE };
      } else {
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

interface DCReportTotals {
  dcRaisedCount: number;
  openCount: number;
  overdueCount: number;
  partialCount: number;
}

async function buildDCWorkbook(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  dateFromStr: string,
  dateToStr: string
): Promise<{ bytes: Uint8Array; totals: DCReportTotals }> {
  const todayMs = new Date(dateToStr + "T23:59:59Z").getTime();
  const todayStr = dateToStr;

  const lineItemSelect =
    "drawing_number, description, qty_nos, returned_qty_nos, unit, nature_of_process, serial_number";

  const { data: rangeDCs } = await supabase
    .from("delivery_challans")
    .select(
      `id, dc_number, dc_date, dc_type, party_name, party_phone, nature_of_job_work, status, return_due_date, issued_at, line_items:dc_line_items(${lineItemSelect})`
    )
    .eq("company_id", companyId)
    .eq("dc_type", "returnable")
    .gte("dc_date", dateFromStr)
    .lte("dc_date", dateToStr)
    .order("dc_date", { ascending: true });

  const { data: openDCs } = await supabase
    .from("delivery_challans")
    .select(
      `id, dc_number, dc_date, dc_type, party_name, party_phone, nature_of_job_work, status, return_due_date, issued_at, line_items:dc_line_items(${lineItemSelect})`
    )
    .eq("company_id", companyId)
    .eq("dc_type", "returnable")
    .in("status", ["issued", "partially_returned"])
    .order("return_due_date", { ascending: true, nullsLast: true });

  // ── Sheet 1 — DCs Raised in Range ──────────────────────────────────────
  const s1Cols: ColSpec[] = [
    { key: "dc_number", header: "DC Number", width: 16 },
    { key: "dc_date", header: "DC Date", width: 14 },
    { key: "party", header: "Party", width: 28 },
    { key: "nature_job", header: "Nature of Job Work", width: 24 },
    { key: "drawing", header: "Drawing No.", width: 16 },
    { key: "description", header: "Item Description", width: 36 },
    { key: "stage", header: "Stage", width: 24 },
    { key: "qty", header: "Qty", width: 8, numFmt: "#,##0", align: "right" },
    { key: "unit", header: "Unit", width: 8, align: "center" },
    { key: "dc_status", header: "DC Status", width: 18 },
  ];
  const s1Rows: Array<Record<string, unknown>> = [];
  const s1Meta: RowMeta[] = [];
  for (const dc of (rangeDCs ?? []) as any[]) {
    const lines = (dc.line_items ?? []) as any[];
    if (lines.length === 0) {
      s1Rows.push({
        dc_number: dc.dc_number,
        dc_date: fmtDate(dc.dc_date),
        party: dc.party_name ?? "",
        nature_job: dc.nature_of_job_work ?? "",
        drawing: "",
        description: "(no line items)",
        stage: "",
        qty: "",
        unit: "",
        dc_status: dc.status,
      });
      s1Meta.push({ groupKey: dc.id });
    } else {
      for (const li of lines) {
        s1Rows.push({
          dc_number: dc.dc_number,
          dc_date: fmtDate(dc.dc_date),
          party: dc.party_name ?? "",
          nature_job: dc.nature_of_job_work ?? "",
          drawing: li.drawing_number ?? "",
          description: li.description ?? "",
          stage: li.nature_of_process ?? "",
          qty: li.qty_nos ?? 0,
          unit: li.unit ?? "NOS",
          dc_status: dc.status,
        });
        s1Meta.push({ groupKey: dc.id });
      }
    }
  }

  // ── Sheet 2 — Open DCs (Awaiting Return) ───────────────────────────────
  const s2Cols: ColSpec[] = [
    { key: "dc_number", header: "DC Number", width: 16 },
    { key: "issued_at", header: "Date Issued", width: 14 },
    { key: "party", header: "Party", width: 28 },
    { key: "party_phone", header: "Party Phone", width: 16 },
    { key: "nature_job", header: "Nature of Job Work", width: 24 },
    { key: "drawing", header: "Drawing No.", width: 16 },
    { key: "description", header: "Item Description", width: 36 },
    { key: "stage", header: "Stage", width: 24 },
    { key: "qty_sent", header: "Qty Sent", width: 10, numFmt: "#,##0", align: "right" },
    { key: "qty_returned", header: "Qty Returned", width: 12, numFmt: "#,##0", align: "right" },
    { key: "qty_pending", header: "Qty Pending", width: 12, numFmt: "#,##0", align: "right" },
    { key: "unit", header: "Unit", width: 8, align: "center" },
    { key: "due_date", header: "Return Due Date", width: 16 },
    { key: "days_remaining", header: "Days Remaining", width: 14, align: "right" },
    { key: "alert", header: "Alert", width: 14, align: "center" },
  ];
  const s2Rows: Array<Record<string, unknown>> = [];
  const s2Meta: RowMeta[] = [];
  for (const dc of (openDCs ?? []) as any[]) {
    const days = diffDays(dc.return_due_date, todayMs);
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

    const lines = (dc.line_items ?? []) as any[];
    const baseRow = {
      dc_number: dc.dc_number,
      issued_at: fmtDate(dc.issued_at ?? dc.dc_date),
      party: dc.party_name ?? "",
      party_phone: dc.party_phone ?? "",
      nature_job: dc.nature_of_job_work ?? "",
      due_date: fmtDate(dc.return_due_date),
      days_remaining: days ?? "",
      alert,
    };
    if (lines.length === 0) {
      s2Rows.push({
        ...baseRow,
        drawing: "",
        description: "(no line items)",
        stage: "",
        qty_sent: "",
        qty_returned: "",
        qty_pending: "",
        unit: "",
      });
      s2Meta.push({ groupKey: dc.id, fill });
    } else {
      for (const li of lines) {
        const sent = Number(li.qty_nos ?? 0);
        const ret = Number(li.returned_qty_nos ?? 0);
        const pend = Math.max(0, sent - ret);
        s2Rows.push({
          ...baseRow,
          drawing: li.drawing_number ?? "",
          description: li.description ?? "",
          stage: li.nature_of_process ?? "",
          qty_sent: sent,
          qty_returned: ret,
          qty_pending: pend,
          unit: li.unit ?? "NOS",
        });
        s2Meta.push({ groupKey: dc.id, fill });
      }
    }
  }

  // ── Sheet 3 — Overdue Returns ──────────────────────────────────────────
  const overdueDCs = (openDCs ?? []).filter(
    (d: any) => d.return_due_date && d.return_due_date < todayStr
  );
  const s3Cols: ColSpec[] = [
    { key: "dc_number", header: "DC Number", width: 16 },
    { key: "issued_at", header: "Date Issued", width: 14 },
    { key: "party", header: "Party", width: 28 },
    { key: "party_phone", header: "Party Phone", width: 16 },
    { key: "nature_job", header: "Nature of Job Work", width: 24 },
    { key: "drawing", header: "Drawing No.", width: 16 },
    { key: "description", header: "Item Description", width: 36 },
    { key: "stage", header: "Stage", width: 24 },
    { key: "qty", header: "Qty", width: 8, numFmt: "#,##0", align: "right" },
    { key: "unit", header: "Unit", width: 8, align: "center" },
    { key: "due_date", header: "Return Due Date", width: 16 },
    { key: "days_overdue", header: "Days Overdue", width: 14, align: "right" },
  ];
  const s3Rows: Array<Record<string, unknown>> = [];
  const s3Meta: RowMeta[] = [];
  for (const dc of overdueDCs as any[]) {
    const dDays = diffDays(dc.return_due_date, todayMs);
    const overdue = dDays != null ? Math.abs(dDays) : "";
    for (const li of (dc.line_items ?? []) as any[]) {
      s3Rows.push({
        dc_number: dc.dc_number,
        issued_at: fmtDate(dc.issued_at ?? dc.dc_date),
        party: dc.party_name ?? "",
        party_phone: dc.party_phone ?? "",
        nature_job: dc.nature_of_job_work ?? "",
        drawing: li.drawing_number ?? "",
        description: li.description ?? "",
        stage: li.nature_of_process ?? "",
        qty: li.qty_nos ?? 0,
        unit: li.unit ?? "NOS",
        due_date: fmtDate(dc.return_due_date),
        days_overdue: overdue,
      });
      s3Meta.push({ groupKey: dc.id, fill: OVERDUE_FILL });
    }
  }

  // ── Sheet 4 — Partially Returned DCs ───────────────────────────────────
  const partialDCs = (openDCs ?? []).filter((d: any) => d.status === "partially_returned");
  const s4Cols: ColSpec[] = [
    { key: "dc_number", header: "DC Number", width: 16 },
    { key: "dc_date", header: "Date", width: 14 },
    { key: "party", header: "Party", width: 28 },
    { key: "drawing", header: "Drawing No.", width: 16 },
    { key: "description", header: "Item Description", width: 36 },
    { key: "stage", header: "Stage", width: 24 },
    { key: "qty_sent", header: "Qty Sent", width: 10, numFmt: "#,##0", align: "right" },
    { key: "qty_returned", header: "Qty Returned", width: 12, numFmt: "#,##0", align: "right" },
    { key: "qty_pending", header: "Qty Pending", width: 12, numFmt: "#,##0", align: "right" },
    { key: "unit", header: "Unit", width: 8, align: "center" },
  ];
  const s4Rows: Array<Record<string, unknown>> = [];
  const s4Meta: RowMeta[] = [];
  for (const dc of partialDCs as any[]) {
    for (const li of (dc.line_items ?? []) as any[]) {
      const sent = Number(li.qty_nos ?? 0);
      const ret = Number(li.returned_qty_nos ?? 0);
      const pend = Math.max(0, sent - ret);
      s4Rows.push({
        dc_number: dc.dc_number,
        dc_date: fmtDate(dc.dc_date),
        party: dc.party_name ?? "",
        drawing: li.drawing_number ?? "",
        description: li.description ?? "",
        stage: li.nature_of_process ?? "",
        qty_sent: sent,
        qty_returned: ret,
        qty_pending: pend,
        unit: li.unit ?? "NOS",
      });
      s4Meta.push({ groupKey: dc.id });
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildStyledSheet(s1Cols, s1Rows, s1Meta), "DCs Raised");
  XLSX.utils.book_append_sheet(wb, buildStyledSheet(s2Cols, s2Rows, s2Meta), "Open DCs");
  XLSX.utils.book_append_sheet(wb, buildStyledSheet(s3Cols, s3Rows, s3Meta), "Overdue Returns");
  XLSX.utils.book_append_sheet(wb, buildStyledSheet(s4Cols, s4Rows, s4Meta), "Partially Returned");

  const xlsxBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });
  const bytes = new Uint8Array(xlsxBuffer as ArrayBuffer);

  const totals: DCReportTotals = {
    dcRaisedCount: (rangeDCs ?? []).length,
    openCount: (openDCs ?? []).length,
    overdueCount: overdueDCs.length,
    partialCount: partialDCs.length,
  };

  return { bytes, totals };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const url = new URL(req.url);
    const isDownload = url.searchParams.get("download") === "true";

    if (isDownload) {
      const dateFrom = url.searchParams.get("from");
      const dateTo = url.searchParams.get("to");
      const companyId = url.searchParams.get("company_id");

      if (!dateFrom || !dateTo || !companyId) {
        return new Response(
          JSON.stringify({ error: "from, to, and company_id are required for download" }),
          { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
        );
      }

      const { bytes } = await buildDCWorkbook(supabase, companyId, dateFrom, dateTo);
      return new Response(bytes, {
        headers: {
          ...CORS_HEADERS,
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="DC_Report_${dateFrom}_to_${dateTo}.xlsx"`,
        },
      });
    }

    const { data: companies } = await supabase
      .from("company_settings")
      .select(
        "id, company_id, company_name, dc_email_enabled, dc_email_recipients, dc_email_day"
      );

    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies found" }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const todayMs = now.getTime();
    const todayStr = now.toISOString().split("T")[0];
    const todayName = DAY_NAMES[now.getUTCDay()];
    const sevenDaysAgo = new Date(todayMs - 7 * 86400000).toISOString().split("T")[0];

    const results: Array<Record<string, unknown>> = [];

    for (const company of companies as any[]) {
      if (!company.dc_email_enabled) {
        results.push({ company: company.company_name, status: "disabled" });
        continue;
      }

      const configuredDay: string = company.dc_email_day ?? "Monday";
      if (configuredDay !== todayName) {
        results.push({
          company: company.company_name,
          status: "not_today",
          configured: configuredDay,
          today: todayName,
        });
        continue;
      }

      const recipients: string[] = Array.isArray(company.dc_email_recipients)
        ? company.dc_email_recipients
        : [];
      if (recipients.length === 0) {
        results.push({ company: company.company_name, status: "no_recipients" });
        continue;
      }

      const { bytes, totals } = await buildDCWorkbook(
        supabase,
        company.company_id,
        sevenDaysAgo,
        todayStr
      );
      const attachmentBase64 = bytesToBase64(bytes);

      const fileName = `DC_Weekly_${todayStr}.xlsx`;
      const emailBody = `Weekly DC Summary — ${company.company_name ?? ""}

Returnable DCs raised in the last 7 days: ${totals.dcRaisedCount}
Open DCs awaiting return: ${totals.openCount}
Overdue returns: ${totals.overdueCount}
Partially returned: ${totals.partialCount}

Attached: ${fileName}

— BizDocs`;

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
          subject: `Weekly DC Summary — ${company.company_name ?? ""} — ${todayStr}`,
          text: emailBody,
          attachments: [{ filename: fileName, content: attachmentBase64 }],
        }),
      });

      const emailData = await emailRes.json().catch(() => ({}));
      results.push({
        company: company.company_name,
        status: "sent",
        recipients: recipients.length,
        dcRaised: totals.dcRaisedCount,
        openDCs: totals.openCount,
        overdue: totals.overdueCount,
        partial: totals.partialCount,
        emailStatus: emailRes.status,
        emailId: emailData?.id,
      });
    }

    return new Response(JSON.stringify({ success: true, todayName, results }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("weekly-dc-email error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
