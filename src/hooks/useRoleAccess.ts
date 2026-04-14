import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getRoleAccess, type AppRole, type PageAccess } from "@/lib/role-access";

const VALID_ROLES: AppRole[] = [
  'admin', 'purchase_team', 'inward_team',
  'qc_team', 'storekeeper', 'assembly_team', 'finance',
];

// Sentinel for unknown roles — not a real AppRole entry.
// getRoleAccess handles it the same as any unrecognised role: returns NO_ACCESS.
// AppSidebar also correctly hides everything for this value.
const UNKNOWN_ROLE = '__unknown__' as AppRole;

/**
 * Returns the current user's typed AppRole.
 * Returns UNKNOWN_ROLE (→ NO_ACCESS) if the profile role is missing or
 * unrecognised, and warns in development. Never falls back to admin.
 */
export function useCurrentRole(): AppRole {
  const { role } = useAuth();
  if (!VALID_ROLES.includes(role as AppRole)) {
    if (import.meta.env.DEV) {
      console.warn(`Unknown role: "${role}", defaulting to no access`);
    }
    return UNKNOWN_ROLE;
  }
  return role as AppRole;
}

/**
 * Returns the PageAccess object for the current user + current page.
 *
 * @param overridePage - explicit page key (e.g. "purchase-orders").
 *   When omitted the page is derived from the first URL path segment,
 *   so /purchase-orders/123/edit → "purchase-orders".
 *   The root path / maps to "dashboard".
 */
export function useRoleAccess(overridePage?: string): PageAccess {
  const role = useCurrentRole();
  const location = useLocation();

  const page = overridePage ?? (() => {
    const stripped = location.pathname.slice(1); // remove leading /
    const segment = stripped.split('/')[0];
    return segment || 'dashboard';
  })();

  return getRoleAccess(role, page);
}
