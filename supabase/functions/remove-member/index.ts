// remove-member — Supabase Edge Function
// Removes a user from the caller's company by setting their company_id and role to NULL.
// Does NOT delete the user's Supabase Auth account.
// Requires the caller to be authenticated with role admin or finance.

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
  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { userId } = body;

  if (!userId || typeof userId !== "string") {
    return new Response(
      JSON.stringify({ error: "userId is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 5. Prevent self-removal ───────────────────────────────────────────────
  if (userId === user.id) {
    return new Response(
      JSON.stringify({ error: "Cannot remove yourself from the company" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 6. Verify target is in the same company ───────────────────────────────
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: targetProfile, error: targetError } = await serviceClient
    .from("profiles")
    .select("id, company_id")
    .eq("id", userId)
    .single();

  if (targetError || !targetProfile) {
    return new Response(
      JSON.stringify({ error: "User not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if ((targetProfile as { id: string; company_id: string | null }).company_id !== companyId) {
    return new Response(
      JSON.stringify({ error: "User is not a member of your company" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── 7. Remove the user from the company ───────────────────────────────────
  const { error: updateError } = await serviceClient
    .from("profiles")
    .update({ company_id: null, role: null })
    .eq("id", userId);

  if (updateError) {
    return new Response(
      JSON.stringify({ error: "Failed to remove member: " + updateError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
