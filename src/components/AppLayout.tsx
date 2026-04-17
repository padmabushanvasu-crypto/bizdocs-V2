import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileNav } from "@/components/MobileNav";
import { NotificationBell } from "@/components/NotificationBell";
import { Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Settings, User, LayoutDashboard, KeyRound } from "lucide-react";
import { ChangePasswordDialog } from "@/components/ChangePasswordDialog";
import { generateStockAlerts, generateOverdueDCAlerts } from "@/lib/notifications-api";
import { FOCUSED_ROLES, FOCUSED_ROLE_REDIRECT, ROLE_LABELS } from "@/lib/roles";
import type { AppRole } from "@/lib/roles";

export function AppLayout() {
  const { user, profile, signOut, role } = useAuth();
  const navigate = useNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);

  const isFocused = FOCUSED_ROLES.includes(role as AppRole);
  const isAdminOrFinance = role === 'admin' || role === 'finance';

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || null;
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;
  const initials = displayName
    ? displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.slice(0, 2).toUpperCase() ?? "U";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  // Generate fresh in-app notifications on every app load
  useEffect(() => {
    generateStockAlerts();
    generateOverdueDCAlerts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect focused roles to their queue on root path
  useEffect(() => {
    if (FOCUSED_ROLES.includes(role as AppRole)) {
      const target = FOCUSED_ROLE_REDIRECT[role];
      if (target) {
        const currentPath = window.location.pathname;
        if (currentPath === '/') {
          navigate(target, { replace: true });
        }
      }
    }
  }, [role]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full overflow-hidden">
        {!isFocused && (
          <div className="hidden md:block print:hidden">
            <AppSidebar />
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between border-b border-border bg-card px-4 shrink-0 print:hidden">
            <div className="flex items-center gap-2">
              <div className="md:hidden flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
                <div
                  className="h-7 w-7 flex items-center justify-center shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
                    borderRadius: '7px',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
                  }}
                >
                  <LayoutDashboard className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold text-foreground" style={{ letterSpacing: '-0.3px' }}>BizDocs</span>
              </div>
              {isFocused && (
                <span className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 hidden md:inline">
                  {ROLE_LABELS[role as AppRole] ?? role}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                  <Avatar className="h-8 w-8">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName || "User"} />}
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-2">
                  {displayName && <p className="text-sm font-medium text-foreground">{displayName}</p>}
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                {isAdminOrFinance && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate("/settings/company")}>
                      <User className="mr-2 h-4 w-4" /> My Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/settings")}>
                      <Settings className="mr-2 h-4 w-4" /> Company Settings
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowChangePassword(true)}>
                  <KeyRound className="mr-2 h-4 w-4" /> Change Password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <ChangePasswordDialog open={showChangePassword} onClose={() => setShowChangePassword(false)} />
            </div>
          </header>

          <main className="flex-1 overflow-hidden bg-white">
            <div className="animate-fade-in h-full overflow-y-auto pb-24">
              <Outlet />
            </div>
          </main>
        </div>

        {!isFocused && <div className="print:hidden"><MobileNav /></div>}
      </div>
    </SidebarProvider>
  );
}
