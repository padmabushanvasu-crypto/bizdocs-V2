// Weekly PO Summary Email — Supabase Edge Function
// Schedule: Monday 02:30 UTC (08:00 IST)
// Sends a 3-sheet Excel report to purchase team recipients

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@bizdocs.in";

serve(async (_req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Fetch all companies with PO email enabled
    const { data: companies } = await supabase
      .from("company_settings")
      .select("id, company_id, company_name, po_email_enabled, po_email_recipients");

    if (!companies || companies.length === 0) {
      return new Response(JSON.stringify({ message: "No companies found" }), { status: 200 });
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // Last week: Monday to Sunday
    const dayOfWeek = now.getDay(); // 0=Sun,1=Mon,...
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - daysToLastMonday - 7);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    const lastMondayStr = lastMonday.toISOString().split("T")[0];
    const lastSundayStr = lastSunday.toISOString().split("T")[0];

    const results = [];

    for (const company of companies) {
      if (!company.po_email_enabled) continue;

      const recipients: string[] = Array.isArray(company.po_email_recipients)
        ? company.po_email_recipients
        : [];

      if (recipients.length === 0) continue;

      const companyId = company.company_id;

      // ── Fetch POs ────────────────────────────────────────────────────────
      const { data: lastWeekPOs } = await supabase
        .from("purchase_orders")
        .select("po_number, vendor_name, grand_total, po_date, status")
        .eq("company_id", companyId)
        .gte("po_date", lastMondayStr)
        .lte("po_date", lastSundayStr)
        .order("po_date", { ascending: true });

      const { data: openPOs } = await supabase
        .from("purchase_orders")
        .select("po_number, vendor_name, grand_total, delivery_date, po_date, status, parties(email, phone)")
        .eq("company_id", companyId)
        .not("status", "in", '("cancelled","closed","received")')
        .order("delivery_date", { ascending: true, nullsLast: true });

      const overduePOs = (openPOs ?? []).filter(
        (po: any) => po.delivery_date && po.delivery_date < todayStr
      );

      // ── Build Excel CSV-style data (simple TSV for email attachment) ──
      // Since we can't use xlsx in edge functions easily, we build a CSV with sheet markers
      const weekLabel = `${lastMondayStr} to ${lastSundayStr}`;

      const csvSheets: string[] = [];

      // Sheet 1: Last Week's POs
      const s1rows = (lastWeekPOs ?? []).map((po: any) => {
        const daysRemaining = po.delivery_date
          ? Math.ceil((new Date(po.delivery_date).getTime() - now.getTime()) / 86400000)
          : null;
        return `${po.po_number}\t${po.vendor_name ?? ""}\t${po.po_date}\t${po.grand_total ?? 0}\t${po.status}`;
      });
      csvSheets.push(
        `=== SHEET 1: POs Raised Last Week (${weekLabel}) ===\n` +
        `PO Number\tVendor\tDate Raised\tTotal Value (INR)\tStatus\n` +
        s1rows.join("\n")
      );

      // Sheet 2: Open POs
      const s2rows = (openPOs ?? []).map((po: any) => {
        const daysRemaining = po.delivery_date
          ? Math.ceil((new Date(po.delivery_date).getTime() - now.getTime()) / 86400000)
          : "—";
        const flag = typeof daysRemaining === "number"
          ? (daysRemaining < 0 ? "⚠ OVERDUE" : daysRemaining <= 7 ? "⚑ Due Soon" : "")
          : "";
        const vendorEmail = po.parties?.email ?? "";
        const vendorPhone = po.parties?.phone ?? "";
        return `${po.po_number}\t${po.vendor_name ?? ""}\t${vendorEmail}\t${vendorPhone}\t${po.delivery_date ?? "—"}\t${daysRemaining}\t${po.grand_total ?? 0}\t${po.status}\t${flag}`;
      });
      csvSheets.push(
        `=== SHEET 2: Open POs ===\n` +
        `PO Number\tVendor\tVendor Email\tVendor Phone\tDue Date\tDays Remaining\tValue (INR)\tStatus\tAlert\n` +
        s2rows.join("\n")
      );

      // Sheet 3: Overdue POs
      const s3rows = overduePOs.map((po: any) => {
        const daysOverdue = Math.abs(
          Math.ceil((new Date(po.delivery_date).getTime() - now.getTime()) / 86400000)
        );
        const vendorEmail = po.parties?.email ?? "";
        const vendorPhone = po.parties?.phone ?? "";
        return `${po.po_number}\t${po.vendor_name ?? ""}\t${vendorEmail}\t${vendorPhone}\t${po.delivery_date}\t${daysOverdue}\t${po.grand_total ?? 0}`;
      });
      csvSheets.push(
        `=== SHEET 3: Overdue POs ===\n` +
        `PO Number\tVendor\tVendor Email\tVendor Phone\tDue Date\tDays Overdue\tValue (INR)\n` +
        s3rows.join("\n")
      );

      const attachmentContent = csvSheets.join("\n\n");
      const attachmentBase64 = btoa(unescape(encodeURIComponent(attachmentContent)));

      // ── Summary numbers ──────────────────────────────────────────────
      const poRaisedCount = (lastWeekPOs ?? []).length;
      const poRaisedValue = (lastWeekPOs ?? []).reduce((s: number, p: any) => s + (p.grand_total ?? 0), 0);
      const openCount = (openPOs ?? []).length;
      const dueSoonCount = (openPOs ?? []).filter((po: any) => {
        if (!po.delivery_date) return false;
        const days = Math.ceil((new Date(po.delivery_date).getTime() - now.getTime()) / 86400000);
        return days >= 0 && days <= 7;
      }).length;
      const overdueCount = overduePOs.length;

      const emailBody = `Weekly PO Summary — Week of ${weekLabel}

This Week:
- POs raised: ${poRaisedCount} (Total value: ₹${poRaisedValue.toLocaleString("en-IN")})

Open POs: ${openCount} total
- Approaching due date (within 7 days): ${dueSoonCount}
- Already overdue: ${overdueCount}

Please find the detailed report attached.

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
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: recipients,
          subject: `Weekly PO Summary — ${company.company_name} — ${weekLabel}`,
          text: emailBody,
          attachments: [
            {
              filename: `PO_Summary_${lastMondayStr}.txt`,
              content: attachmentBase64,
            },
          ],
        }),
      });

      const emailData = await emailRes.json();
      results.push({
        company: company.company_name,
        recipients: recipients.length,
        poRaised: poRaisedCount,
        openPOs: openCount,
        overdue: overdueCount,
        emailStatus: emailRes.status,
        emailId: emailData?.id,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("weekly-po-email error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
