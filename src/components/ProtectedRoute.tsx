import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Paths that are part of the setup flow — never redirect to setup from these
const SETUP_PATHS = ["/setup", "/settings/company"];

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children, requireCompany = true }: { children: React.ReactNode; requireCompany?: boolean }) {
  const { session, loading, companyId } = useAuth();
  const location = useLocation();

  // Step 1: Auth (+ profile) still loading → spinner, never redirect
  if (loading) {
    return <LoadingScreen />;
  }

  // Step 2: No session → go to login
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (requireCompany) {
    // Fast path: localStorage confirms company was set up — skip the DB-derived check.
    // Handles cases where profile fetch failed transiently after auth resolved.
    const setupDone = localStorage.getItem("bizdocs_company_setup_done") === "true";

    // Safety: never redirect if already on a setup path (prevents redirect loops)
    const onSetupPath = SETUP_PATHS.includes(location.pathname);

    // Step 3+4: Auth loaded, profile loaded, no company confirmed anywhere → redirect
    if (!setupDone && !companyId && !onSetupPath) {
      return <Navigate to="/setup" replace />;
    }
  }

  // Step 5: Everything confirmed → render app
  return <>{children}</>;
}
