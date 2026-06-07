// Partial-issue reminder Email — Supabase Edge Function
//
// Daily digest: for each company with partial_issue_enabled and recipients,
// emails the list of MIRs that are partially issued and still outstanding for
// more than `minDays` (default 7). No outstanding → no email.
//
// Mirrors the existing email functions:
//   - weekly-po-email: service-role client (SUPABASE_URL + SERVICE_ROLE_KEY),
//     per-company iteration over company_settings, results[] JSON summary.
//   - grn-qc-email: html-only inline Resend send (POST api.resend.com/emails,
//     Bearer RESEND_API_KEY, from FROM_EMAIL, body {from,to,subject,html}).
//
// Body (optional JSON):
//   minDays (number, default 7)    — age threshold override (test affordance)
//   dryRun  (boolean, default false) — build + RETURN digests, do NOT send

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@bizdocs.in";
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

function daysSince(dateStr: string | null, todayMs: number): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr + "T00:00:00Z").getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((todayMs - t) / 86400000);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── Body parse (safe defaults) ──────────────────────────────────────
    let minDays = 7;
    let dryRun = false;
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        if (Number.isFinite(Number(body.minDays))) minDays = Math.max(0, Number(body.minDays));
        if (typeof body.dryRun === "boolean") dryRun = body.dryRun;
      }
    } catch { /* no/invalid body → defaults */ }

    const now = new Date();
    const todayMs = now.getTime();
    // Age cutoff date (YYYY-MM-DD): MIRs whose anchor date is strictly before this.
    const cutoff = new Date(todayMs - minDays * 86400000).toISOString().split("T")[0];

    const { data: companies } = await supabase
      .from("company_settings")
      .select("id, company_id, company_name, partial_issue_enabled, partial_issue_recipients");

    if (!companies || companies.length === 0) {
      return jsonResponse({ success: true, message: "No companies found", processed: 0, emailsSent: 0, skippedEmpty: 0, results: [] });
    }

    const results: Array<Record<string, unknown>> = [];
    let processed = 0;
    let emailsSent = 0;
    let skippedEmpty = 0;

    for (const company of companies as any[]) {
      if (!company.partial_issue_enabled) {
        results.push({ company: company.company_name, status: "disabled" });
        continue;
      }
      const recipients: string[] = Array.isArray(company.partial_issue_recipients)
        ? company.partial_issue_recipients.filter((x: unknown): x is string => typeof x === "string")
        : [];
      if (recipients.length === 0) {
        results.push({ company: company.company_name, status: "no_recipients" });
        continue;
      }

      processed++;

      // ── Outstanding partial MIRs (company-scoped) ─────────────────────
      const { data: mirs, error: mirErr } = await supabase
        .from("material_issue_requests")
        .select(
          "id, mir_number, status, issue_date, created_at, requested_by, awo_id, " +
          "mir_line_items(item_code, item_description, shortage_qty), " +
          "assembly_work_orders(awo_number, awo_type)"
        )
        .eq("company_id", company.company_id)
        .eq("status", "partially_issued");

      if (mirErr) {
        results.push({ company: company.company_name, status: "query_error", detail: mirErr.message });
        continue;
      }

      // Keep MIRs with at least one short line whose age anchor predates cutoff.
      // Anchor = issue_date (last partial-issue date) else created_at::date.
      const outstanding = (mirs ?? [])
        .map((m: any) => {
          const anchor: string | null = m.issue_date
            ? String(m.issue_date)
            : (m.created_at ? String(m.created_at).split("T")[0] : null);
          const shortLines = (m.mir_line_items ?? []).filter((l: any) => Number(l.shortage_qty ?? 0) > 0);
          return { m, anchor, shortLines };
        })
        .filter(({ anchor, shortLines }) => anchor !== null && anchor < cutoff && shortLines.length > 0);

      if (outstanding.length === 0) {
        results.push({ company: company.company_name, status: "no_outstanding" });
        skippedEmpty++;
        continue;
      }

      // ── Build HTML digest ─────────────────────────────────────────────
      const rowsHtml = outstanding
        .sort((a, b) => (a.anchor! < b.anchor! ? -1 : 1)) // oldest first
        .map(({ m, anchor, shortLines }) => {
          const awo = m.assembly_work_orders;
          const days = daysSince(anchor, todayMs);
          const awoLink = m.awo_id ? `${APP_BASE_URL}/assembly-work-orders/${encodeURIComponent(m.awo_id)}` : null;
          const mirLink = `${APP_BASE_URL}/storekeeper`;
          const awoCell = awo
            ? (awoLink
                ? `<a href="${awoLink}">${esc(awo.awo_number ?? "")}</a> <span style="color:#64748b">(${esc(awo.awo_type ?? "")})</span>`
                : `${esc(awo.awo_number ?? "")} <span style="color:#64748b">(${esc(awo.awo_type ?? "")})</span>`)
            : "<span style=\"color:#94a3b8\">—</span>";
          const itemsCell = (shortLines as any[])
            .map((l) => `${esc([l.item_code, l.item_description].filter(Boolean).join(" "))} <b>(short ${fmtNum(l.shortage_qty)})</b>`)
            .join("<br/>");
          return `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0"><a href="${mirLink}">${esc(m.mir_number ?? "")}</a></td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0">${awoCell}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(m.requested_by ?? "")}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0">${itemsCell}</td>
              <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:${(days ?? 0) >= 14 ? "#dc2626" : "#b45309"};font-weight:600">${days ?? ""} d</td>
            </tr>`;
        })
        .join("");

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:760px">
          <h2 style="margin:0 0 4px">Outstanding partial issues — ${esc(company.company_name ?? "")}</h2>
          <p style="color:#64748b;margin:0 0 16px">
            ${outstanding.length} MIR(s) partially issued and outstanding for more than ${minDays} day(s) (as of ${fmtDate(now.toISOString())}).
          </p>
          <table style="border-collapse:collapse;width:100%;font-size:13px">
            <thead>
              <tr style="background:#1e40af;color:#fff;text-align:left">
                <th style="padding:8px">MIR No.</th>
                <th style="padding:8px">Work Order</th>
                <th style="padding:8px">Requested By</th>
                <th style="padding:8px">Short Item(s)</th>
                <th style="padding:8px;text-align:right">Outstanding</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="color:#94a3b8;font-size:12px;margin-top:16px">— BizDocs · issue the balance from the Assembly Issue Queue.</p>
        </div>`;

      const subject = `Outstanding partial issues — ${outstanding.length} MIR(s) awaiting completion`;

      // ── Dry run: return the digest, do NOT send ───────────────────────
      if (dryRun) {
        results.push({
          company: company.company_name,
          status: "dry_run",
          mirs: outstanding.length,
          recipients,
          subject,
          html,
        });
        continue;
      }

      if (!RESEND_API_KEY) {
        console.log("RESEND_API_KEY not set — skipping send for", company.company_name);
        results.push({ company: company.company_name, status: "skipped_no_key", mirs: outstanding.length });
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
          subject,
          html,
        }),
      });
      const emailData = await emailRes.json().catch(() => ({}));
      emailsSent++;
      results.push({
        company: company.company_name,
        status: "sent",
        mirs: outstanding.length,
        recipients: recipients.length,
        emailStatus: emailRes.status,
        emailId: emailData?.id,
      });
    }

    return jsonResponse({ success: true, processed, emailsSent, skippedEmpty, minDays, dryRun, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("partial-issue-email error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
