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
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  companyId: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (user: User) => {
    try {
      const sb = supabase as any;
      let { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
      if (error && error.code === "PGRST116") {
        // Profile doesn't exist, create one
        const { data: newProfile } = await sb.from("profiles").insert({
          id: user.id,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          email: user.email,
        }).select().single();
        data = newProfile;
      }
      if (data) {
        setProfile(data as Profile);
        if (data.company_id) {
          setCompanyId(data.company_id);
        } else {
          clearCompanyId();
        }
      }
    } catch (err) {
      console.error("Failed to load profile:", err);
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
      }
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
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
