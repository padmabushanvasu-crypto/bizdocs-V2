import { useRoleAccess } from './useRoleAccess';

export function useCanEdit(page: string): boolean {
  const { canEdit } = useRoleAccess(page);
  return canEdit ?? false;
}
