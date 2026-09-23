import type { Enums } from '@/lib/supabase/database.types';

export type AccountType = Enums<'account_type'>;

/** Role ids used by the existing UI (dashboard navigation, role picker). */
export type UiRole =
  | 'buyer'
  | 'private-seller'
  | 'dealer'
  | 'mechanic'
  | 'servicing-company'
  | 'parts-seller'
  | 'import-agent';

/** Account types a person can choose when signing up. 'admin' is never selectable. */
export const SELF_SERVICE_ACCOUNT_TYPES = [
  'buyer',
  'private_seller',
  'dealer',
  'mechanic',
  'servicing_company',
  'parts_seller',
  'import_agent',
] as const satisfies readonly AccountType[];

export type SelfServiceAccountType = (typeof SELF_SERVICE_ACCOUNT_TYPES)[number];

const TO_UI: Record<SelfServiceAccountType, UiRole> = {
  buyer: 'buyer',
  private_seller: 'private-seller',
  dealer: 'dealer',
  mechanic: 'mechanic',
  servicing_company: 'servicing-company',
  parts_seller: 'parts-seller',
  import_agent: 'import-agent',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  buyer: 'Buyer',
  private_seller: 'Private seller',
  dealer: 'Dealer',
  mechanic: 'Mechanic',
  servicing_company: 'Servicing company',
  parts_seller: 'Parts seller',
  import_agent: 'Import agent',
  admin: 'Administrator',
};

/** Admins use the buyer workspace for their own account, plus the admin area. */
export function toUiRole(type: AccountType): UiRole {
  return type === 'admin' ? 'buyer' : TO_UI[type];
}

export function fromUiRole(role: string): SelfServiceAccountType | null {
  const match = (Object.entries(TO_UI) as Array<[SelfServiceAccountType, UiRole]>).find(([, ui]) => ui === role);
  return match ? match[0] : null;
}

export function isBusinessAccount(type: AccountType): boolean {
  return (
    type === 'dealer' ||
    type === 'mechanic' ||
    type === 'servicing_company' ||
    type === 'parts_seller' ||
    type === 'import_agent'
  );
}

/** Dashboard pages every signed-in account can open. */
const COMMON_DASHBOARD_PATHS = [
  '/dashboard',
  '/dashboard/profile',
  '/dashboard/settings',
  '/dashboard/notifications',
  '/dashboard/messages',
  '/dashboard/saved',
  '/dashboard/reviews',
];

/** Extra dashboard pages per account type (matches the dashboard navigation). */
const ROLE_DASHBOARD_PATHS: Record<UiRole, string[]> = {
  buyer: [],
  'private-seller': ['/dashboard/listings', '/dashboard/add-vehicle', '/dashboard/edit-vehicle', '/dashboard/enquiries', '/dashboard/verification'],
  dealer: ['/dashboard/inventory', '/dashboard/listings', '/dashboard/add-vehicle', '/dashboard/edit-vehicle', '/dashboard/enquiries', '/dashboard/team', '/dashboard/verification'],
  mechanic: ['/dashboard/services', '/dashboard/pricing', '/dashboard/availability', '/dashboard/requests', '/dashboard/verification'],
  'servicing-company': ['/dashboard/services', '/dashboard/pricing', '/dashboard/availability', '/dashboard/requests', '/dashboard/verification'],
  'parts-seller': ['/dashboard/parts', '/dashboard/add-part', '/dashboard/categories', '/dashboard/enquiries', '/dashboard/verification'],
  'import-agent': ['/dashboard/routes', '/dashboard/services', '/dashboard/pricing', '/dashboard/enquiries', '/dashboard/verification', '/dashboard/add-vehicle', '/dashboard/edit-vehicle', '/dashboard/listings'],
};

export function canOpenDashboardPath(type: AccountType, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/dashboard')) return true;
  return COMMON_DASHBOARD_PATHS.includes(path) || ROLE_DASHBOARD_PATHS[toUiRole(type)].includes(path);
}
