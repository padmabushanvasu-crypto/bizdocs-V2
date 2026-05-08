import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import * as Sentry from "@sentry/react";
import { supabase } from "@/integrations/supabase/client";
import { setCompanyId, clearCompanyId } from "@/lib/auth-helpers";
import { toast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  company_id: string | null;
  tour_completed: boolean;
  role: string | null;
  display_name: string | null;
  is_active: boolean | null;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  companyId: string | null;
  role: string | null;
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
  role: 'admin',
  loading: true,
  authError: null,
  clearAuthError: () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

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
        // data stays null — fall through, user goes to /setup
      }

      // ── Case 2: Profile exists but company_id is null (partial trigger fail) ──
      // Attempt auto-fix: call setup_company RPC (SECURITY DEFINER) to create a
      // company and link it to the profile without requiring user interaction.
      if (data && !data.company_id) {
        try {
          const { data: fixedId, error: fixErr } = await (supabase as any).rpc("setup_company", {
            _company_name: "My Company",
          });
          if (!fixErr && fixedId) {
            data = { ...data, company_id: fixedId };
          }
        } catch { /* silent — handled below */ }

        if (!data.company_id) {
          setAuthError("Account setup incomplete. Please contact your administrator or refresh the page.");
        }
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
        // Set Sentry user context so error reports show which user was affected
        Sentry.setUser({ id: user.id, email: user.email ?? undefined });
      }
    } catch (err) {
      console.error("[BizDocs auth] Failed to load profile:", err);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await loadProfile(user);
  }, [loadProfile]);

  // Track the last seen session so we can detect a real expiry (had session, now
  // null) versus an initial no-session render. Without this, the toast would
  // fire on every fresh page-load when the user isn't logged in.
  const prevSessionRef = useRef<Session | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (session?.user) {
          // Real sign-in / user update / first hydrate — re-fetch profile and
          // hold the loading flag until that finishes. TOKEN_REFRESHED arrives
          // every ~50 minutes and would otherwise flash the loading screen and
          // wipe in-page state (open dialogs, half-typed forms). For those we
          // just swap the session quietly.
          if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
            setSession(session);
            setLoading(true);
            // Defer to avoid Supabase auth deadlock, but keep loading=true until profile resolves
            setTimeout(() => loadProfile(session.user).finally(() => setLoading(false)), 0);
          } else {
            setSession(session);
          }
          prevSessionRef.current = session;
        } else {
          // Session went null. If we previously had a session, the user was just
          // signed out (token expired, session cleared, etc.) — surface a toast
          // rather than a silent redirect. Skip when this is the initial
          // no-session render (no prior session ever).
          if (prevSessionRef.current && event !== "INITIAL_SESSION") {
            toast({
              title: "Session expired",
              description: "You have been signed out. Please log in again.",
              variant: "destructive",
            });
          }
          prevSessionRef.current = null;
          setSession(null);
          setProfile(null);
          clearCompanyId();
          setLoading(false);
        }
      },
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        prevSessionRef.current = session;
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
    Sentry.setUser(null);
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      companyId: profile?.company_id ?? null,
      role: (profile as any)?.role ?? null,
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
