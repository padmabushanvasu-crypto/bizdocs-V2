import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { setCompanyId, clearCompanyId } from "@/lib/auth-helpers";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  company_id: string | null;
  tour_completed: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  companyId: string | null;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  companyId: null,
  loading: true,
  authError: null,
  clearAuthError: () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

// ─── Safety-net repair ────────────────────────────────────────────────────────
// Called when loadProfile detects a missing profile or null company_id.
// Uses the same setup_company RPC that CompanySetup.tsx uses — it runs as
// SECURITY DEFINER so it bypasses RLS and works for Google OAuth users who
// never explicitly went through the setup flow.
async function repairMissingCompany(user: User): Promise<Profile | null> {
  console.warn(
    "[BizDocs auth] Trigger appears to have failed for user",
    user.id,
    "— auto-repairing via setup_company RPC",
  );
  const sb = supabase as any;

  const { error: rpcError } = await sb.rpc("setup_company", {
    _company_name: "My Company",
    _gstin: null,
    _state: null,
    _state_code: null,
    _phone: null,
  });

  if (rpcError) {
    console.error("[BizDocs auth] Auto-repair failed:", rpcError);
    return null;
  }

  // Re-fetch profile after repair
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data ?? null;
}
// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const loadProfile = useCallback(async (user: User) => {
    try {
      const sb = supabase as any;
      let { data, error } = await sb
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      // ── Case 1: No profile at all (trigger failed on first sign-up) ──────────
      if (error && error.code === "PGRST116") {
        data = await repairMissingCompany(user);
        // If repair also failed, fall through with null — user goes to /setup
      }

      // ── Case 2: Profile exists but company_id is null (partial trigger fail) ──
      if (data && !data.company_id) {
        console.warn(
          "[BizDocs auth] Profile exists but company_id is null for user",
          user.id,
          "— attempting auto-repair",
        );
        const repaired = await repairMissingCompany(user);
        if (repaired?.company_id) data = repaired;
        // If repair failed, fall through — user goes to /setup
      }

      // ── Case 3: Profile + company_id look fine — check for shared company ────
      // NOTE: RLS prevents querying other users' profiles, so a direct count query
      // would always return 0 and give a false-negative. The real guard against
      // shared company_ids is the updated handle_new_user trigger (Step 1 SQL).
      // Log a developer warning here only if somehow we can detect the conflict.
      if (data?.company_id) {
        // This check is included as a belt-and-suspenders measure.
        // In practice, RLS will prevent seeing other users' rows, so conflict
        // detection must be done via the diagnostic SQL queries (Step 5).
        console.debug("[BizDocs auth] Loaded company_id:", data.company_id, "for user:", user.id);
      }

      if (data) {
        setProfile(data as Profile);
        if (data.company_id) {
          setCompanyId(data.company_id);
          localStorage.setItem("bizdocs_company_setup_done", "true");
        } else {
          clearCompanyId();
          localStorage.removeItem("bizdocs_company_setup_done");
        }
      }
    } catch (err) {
      console.error("[BizDocs auth] Failed to load profile:", err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadProfile(user);
  }, [loadProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          // Defer to avoid Supabase auth deadlock, but keep loading=true until profile resolves
          setTimeout(() => loadProfile(session.user).finally(() => setLoading(false)), 0);
        } else {
          setProfile(null);
          clearCompanyId();
          setLoading(false);
        }
      },
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        loadProfile(session.user).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signOut = async () => {
    clearCompanyId();
    localStorage.removeItem("bizdocs_company_setup_done");
    setProfile(null);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      companyId: profile?.company_id ?? null,
      loading,
      authError,
      clearAuthError,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
