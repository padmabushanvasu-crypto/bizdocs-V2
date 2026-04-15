// get-company-users — Supabase Edge Function
// Returns all profiles for the caller's company.
// Requires the caller to be authenticated and have role admin or finance.
// Uses service role client to bypass RLS for the company-wide query.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── 1. Verify the caller is authenticated ──────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Missing Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // User-scoped client — inherits the caller's JWT so RLS applies normally
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

  // ── 3. Enforce admin / finance only ───────────────────────────────────────
  const { role: callerRole, company_id: companyId } = callerProfile as {
    role: string | null;
    company_id: string | null;
  };

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

  // ── 4. Fetch all company profiles via service role (bypasses RLS) ──────────
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: users, error: usersError } = await serviceClient
    .from("profiles")
    .select("id, full_name, display_name, email, role, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (usersError) {
    return new Response(
      JSON.stringify({ error: usersError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 5. Enrich with auth metadata to detect pending invites ────────────────
  // An invited user who has not yet accepted has email_confirmed_at = null.
  // We fetch auth users once, filter to this company's user IDs, and merge
  // is_pending + email fallback (for invites sent before email was stored in profiles).
  const profileIds = new Set((users ?? []).map((u: any) => u.id as string));

  const { data: authList } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
  const authMap = new Map(
    (authList?.users ?? [])
      .filter((u) => profileIds.has(u.id))
      .map((u) => [u.id, u]),
  );

  const enriched = (users ?? []).map((p: any) => {
    const authUser = authMap.get(p.id);
    return {
      ...p,
      // Fallback to auth email so Resend Invite works for pre-fix invites
      email: p.email ?? authUser?.email ?? null,
      is_pending: !authUser?.email_confirmed_at,
    };
  });

  // ── 6. Return results ──────────────────────────────────────────────────────
  return new Response(
    JSON.stringify({ users: enriched }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
