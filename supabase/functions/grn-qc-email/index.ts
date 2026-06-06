// GRN → QC Inspection Alert — Supabase Edge Function (event-triggered)
//
// Fired by the app (supabase.functions.invoke) when a GRN enters the
// 'quality_pending' stage. Accepts { grn_id } and sends ONE HTML email to the
// company's QC recipients listing the line items to inspect.
//
// Guards (any → exit without sending):
//   - company_settings.grn_qc_email_enabled is false
//   - grn_qc_email_recipients is empty
//   - grns.qc_email_sent_at is already set (dedup)
//
// On a successful send it stamps grns.qc_email_sent_at = now().
//
// Reuses the same infra as the weekly-*-email functions: Deno + Resend,
// RESEND_API_KEY, FROM_EMAIL, and a service-role Supabase client.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@bizdocs.in";
// App base URL for the "Open GRN" link. Override per-deploy; falls back to prod.
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "https://app.bizdocs.in").replace(/\/+$/, "");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function esc(value: unknown): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtNum(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-IN");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST required" }, 405);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const grnId: string | undefined = body?.grn_id;
    if (!grnId) return jsonResponse({ error: "grn_id is required" }, 400);

    // ── Load GRN header ──────────────────────────────────────────────────────
    const { data: grn, error: grnErr } = await supabase
      .from("grns")
      .select(
        "id, company_id, grn_number, inward_sl_no, vendor_name, po_number, grn_date, grn_stage, qc_email_sent_at"
      )
      .eq("id", grnId)
      .single();
    if (grnErr || !grn) return jsonResponse({ error: "GRN not found", detail: grnErr?.message }, 404);

    const g = grn as any;

    // Dedup — already notified for this cycle.
    if (g.qc_email_sent_at) {
      return jsonResponse({ status: "skipped_already_sent", grn_id: grnId });
    }

    // ── Company QC-email settings ────────────────────────────────────────────
    const { data: cs } = await supabase
      .from("company_settings")
      .select("company_name, grn_qc_email_enabled, grn_qc_email_recipients")
      .eq("company_id", g.company_id)
      .maybeSingle();
    const c = (cs ?? {}) as any;

    if (!c.grn_qc_email_enabled) {
      return jsonResponse({ status: "disabled", grn_id: grnId });
    }
    const recipients: string[] = Array.isArray(c.grn_qc_email_recipients)
      ? c.grn_qc_email_recipients.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (recipients.length === 0) {
      return jsonResponse({ status: "no_recipients", grn_id: grnId });
    }

    // ── Line items to inspect ────────────────────────────────────────────────
    const { data: lines } = await supabase
      .from("grn_line_items")
      .select("serial_number, description, drawing_number, received_qty, received_now, unit, ordered_qty_2, received_now_2, unit_2")
      .eq("grn_id", grnId)
      .order("serial_number", { ascending: true });

    const lineRows = (lines ?? []) as any[];
    const hasAlt = lineRows.some((l) => l.unit_2);

    const rowsHtml = lineRows
      .map((l) => {
        const rcv = l.received_qty ?? l.received_now ?? 0;
        const altCell = hasAlt
          ? `<td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;text-align:right;">${
              l.received_now_2 != null ? `${esc(fmtNum(l.received_now_2))} ${esc(l.unit_2 ?? "")}` : "—"
            }</td>`
          : "";
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;">${esc(l.description ?? "")}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;font-family:monospace;">${esc(l.drawing_number ?? "—")}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;text-align:right;">${esc(fmtNum(rcv))} ${esc(l.unit ?? "")}</td>
          ${altCell}
        </tr>`;
      })
      .join("");

    const altHead = hasAlt
      ? `<th style="padding:6px 10px;text-align:right;border-bottom:2px solid #CBD5E1;">Alt. Qty</th>`
      : "";

    const grnLink = `${APP_BASE_URL}/grn/${encodeURIComponent(grnId)}`;
    const title = `GRN ${g.grn_number ?? grnId} ready for QC inspection`;

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif;color:#0F172A;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#1E40AF;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
      <h2 style="margin:0;font-size:18px;">QC Inspection Required</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:.9;">${esc(c.company_name ?? "")}</p>
    </div>
    <div style="background:#fff;padding:20px;border:1px solid #E2E8F0;border-top:0;border-radius:0 0 8px 8px;">
      <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:3px 0;color:#64748B;width:140px;">GRN Number</td><td style="padding:3px 0;font-weight:bold;">${esc(g.grn_number ?? "—")}</td></tr>
        <tr><td style="padding:3px 0;color:#64748B;">Inward Sl. No</td><td style="padding:3px 0;font-weight:bold;">${esc(g.inward_sl_no ?? "—")}</td></tr>
        <tr><td style="padding:3px 0;color:#64748B;">Vendor</td><td style="padding:3px 0;">${esc(g.vendor_name ?? "—")}</td></tr>
        <tr><td style="padding:3px 0;color:#64748B;">PO Number</td><td style="padding:3px 0;">${esc(g.po_number ?? "—")}</td></tr>
        <tr><td style="padding:3px 0;color:#64748B;">GRN Date</td><td style="padding:3px 0;">${esc(fmtDate(g.grn_date))}</td></tr>
      </table>

      <p style="font-size:13px;font-weight:bold;margin:0 0 8px;">Items to inspect</p>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead>
          <tr style="background:#F8FAFC;">
            <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #CBD5E1;">Description</th>
            <th style="padding:6px 10px;text-align:left;border-bottom:2px solid #CBD5E1;">Drawing No.</th>
            <th style="padding:6px 10px;text-align:right;border-bottom:2px solid #CBD5E1;">Received Qty</th>
            ${altHead}
          </tr>
        </thead>
        <tbody>${rowsHtml || `<tr><td colspan="${hasAlt ? 4 : 3}" style="padding:10px;color:#94A3B8;">No line items.</td></tr>`}</tbody>
      </table>

      <div style="margin-top:20px;">
        <a href="${esc(grnLink)}" style="display:inline-block;background:#1E40AF;color:#fff;text-decoration:none;font-size:13px;font-weight:bold;padding:10px 18px;border-radius:6px;">Open GRN to Inspect →</a>
      </div>
      <p style="margin-top:16px;font-size:11px;color:#94A3B8;">— BizDocs automated QC alert</p>
    </div>
  </div>
</body></html>`;

    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not set — skipping send for GRN", g.grn_number);
      return jsonResponse({ status: "skipped_no_key", grn_id: grnId });
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
        subject: title,
        html,
      }),
    });

    const emailData = await emailRes.json().catch(() => ({}));
    if (!emailRes.ok) {
      return jsonResponse(
        { status: "send_failed", grn_id: grnId, emailStatus: emailRes.status, detail: emailData },
        502
      );
    }

    // Stamp dedup flag only after a confirmed send.
    await supabase
      .from("grns")
      .update({ qc_email_sent_at: new Date().toISOString() })
      .eq("id", grnId);

    return jsonResponse({
      status: "sent",
      grn_id: grnId,
      recipients: recipients.length,
      emailId: (emailData as any)?.id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("grn-qc-email error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
