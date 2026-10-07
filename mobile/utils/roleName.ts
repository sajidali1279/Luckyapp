import type { TFunction } from 'i18next';

// A role's name for people (and in their language): "Employee" / "Empleado", not the code EMPLOYEE.
const KEYS: Record<string, string> = {
  CUSTOMER: 'roleTour.customer',
  EMPLOYEE: 'roleTour.employee',
  STORE_MANAGER: 'roleTour.manager',
  SUPER_ADMIN: 'roleTour.hq',
  DEV_ADMIN: 'roleTour.dev',
};

export function roleName(role: string | null | undefined, t: TFunction): string {
  if (!role) return '';
  const key = KEYS[role];
  return key ? t(key) : role.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}
