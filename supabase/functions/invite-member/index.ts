// invite-member — Supabase Edge Function
// Sends a Supabase auth invite email to a new user and pre-assigns their role and company.
// Requires the caller to be authenticated with role admin or finance.
// Uses service role client to:
//   1. Send the invite via auth.admin.inviteUserByEmail
//   2. Immediately update the new profile row with company_id and role

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── 1. Verify caller is authenticated ─────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: sessionError } = await userClient.auth.getUser();
  if (sessionError || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired session" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 2. Get caller's profile — confirms role and company_id ─────────────────
  const { data: callerProfile, error: profileError } = await userClient
    .from("profiles")
    .select("role, company_id")
    .eq("id", user.id)
    .single();

  if (profileError || !callerProfile) {
    return new Response(
      JSON.stringify({ error: "Could not load caller profile" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { role: callerRole, company_id: companyId } = callerProfile as {
    role: string | null;
    company_id: string | null;
  };

  // ── 3. Enforce admin / finance only ───────────────────────────────────────
  if (callerRole !== "admin" && callerRole !== "finance") {
    return new Response(
      JSON.stringify({ error: "Forbidden: admin or finance role required" }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!companyId) {
    return new Response(
      JSON.stringify({ error: "Caller has no company_id" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 4. Parse request body ─────────────────────────────────────────────────
  let body: { email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { email, role: targetRole } = body;

  if (!email || typeof email !== "string") {
    return new Response(
      JSON.stringify({ error: "email is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const validRoles = [
    "admin", "purchase_team", "inward_team", "qc_team",
    "storekeeper", "assembly_team", "finance",
  ];
  if (!targetRole || !validRoles.includes(targetRole)) {
    return new Response(
      JSON.stringify({ error: "Valid role is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 5. Send the invite ─────────────────────────────────────────────────────
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: inviteData, error: inviteError } = await serviceClient.auth.admin
    .inviteUserByEmail(email, {
      data: {
        company_id: companyId,
        role: targetRole,
      },
    });

  if (inviteError) {
    // Supabase returns a 422 with "already registered" when the email exists
    const msg = inviteError.message ?? "";
    if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already been registered")) {
      return new Response(
        JSON.stringify({ error: "already registered" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: "Failed to send invite: " + msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 6. Pre-assign company_id and role on the new profile row ─────────────
  // Supabase creates a profile row via trigger on auth.users insert.
  // We update it immediately so the user is associated with the right company.
  if (inviteData?.user?.id) {
    const { error: updateError } = await serviceClient
      .from("profiles")
      .update({ company_id: companyId, role: targetRole })
      .eq("id", inviteData.user.id);

    if (updateError) {
      // Non-fatal: invite was sent, profile update failed. Log and continue.
      console.error("Profile update after invite failed:", updateError.message);
    }
  }

  return new Response(
    JSON.stringify({ success: true, userId: inviteData?.user?.id ?? null }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
