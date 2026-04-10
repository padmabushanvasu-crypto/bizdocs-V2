import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getRoleAccess, type AppRole, type PageAccess } from "@/lib/role-access";

const VALID_ROLES: AppRole[] = [
  'admin', 'purchase_team', 'inward_team',
  'qc_team', 'storekeeper', 'assembly_team', 'finance',
];

/**
 * Returns the current user's typed AppRole.
 * Falls back to 'admin' if the profile role is missing or unrecognised —
 * this keeps the app fully usable for the primary admin account.
 */
export function useCurrentRole(): AppRole {
  const { role } = useAuth();
  return VALID_ROLES.includes(role as AppRole) ? (role as AppRole) : 'admin';
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
