// assign-member — Supabase Edge Function
// Assigns an existing BizDocs user (by email) to the caller's company with a given role.
// Requires the caller to be authenticated with role admin or finance.
// Uses service role client to:
//   1. Look up the target user in auth.users by email
//   2. Update their profile: set company_id and role

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

  // ── 5. Look up the target user in auth.users by email ─────────────────────
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: listData, error: listError } = await serviceClient.auth.admin.listUsers();
  if (listError) {
    return new Response(
      JSON.stringify({ error: "Failed to list users: " + listError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const targetAuthUser = listData.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );

  if (!targetAuthUser) {
    return new Response(
      JSON.stringify({ error: "not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 6. Update the target user's profile ───────────────────────────────────
  const fullName =
    (targetAuthUser.user_metadata?.full_name as string | undefined) ||
    targetAuthUser.email ||
    null;

  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({
      company_id: companyId,
      role: targetRole,
      full_name: fullName,
      email: targetAuthUser.email ?? null,
    })
    .eq("id", targetAuthUser.id);

  if (updateError) {
    return new Response(
      JSON.stringify({ error: "Failed to update profile: " + updateError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ success: true, userId: targetAuthUser.id }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
