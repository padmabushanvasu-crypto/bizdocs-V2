import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import type { AppRole } from "@/lib/roles";

export function FocusedLayout() {
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();

  const displayName = (profile as any)?.display_name || profile?.full_name || "User";
  const roleLabel = ROLE_LABELS[role as AppRole] ?? role;

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-12 flex items-center justify-between border-b border-border bg-card px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="h-7 w-7 flex items-center justify-center shrink-0 rounded-lg"
            style={{ background: 'linear-gradient(135deg, #1D4ED8, #2563EB)' }}
          >
            <span className="text-white text-xs font-bold">B</span>
          </div>
          <span className="font-bold text-foreground text-sm">BizDocs</span>
          <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5">{roleLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground hidden sm:block">{displayName}</span>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
