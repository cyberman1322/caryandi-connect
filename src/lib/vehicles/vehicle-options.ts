import type { Enums } from '@/lib/supabase/database.types';

export type VehicleCondition = Enums<'vehicle_condition'>;
export type Transmission = Enums<'transmission_type'>;
export type FuelType = Enums<'fuel_type'>;
export type RegistrationStatus = Enums<'registration_status'>;
export type DutyStatus = Enums<'duty_status'>;
export type ImportStatus = Enums<'import_status'>;
export type ListingStatus = Enums<'listing_status'>;
export type Province = Enums<'zambia_province'>;

/** Ordered [value, label] pairs used by forms, filters and display. */
export const CONDITIONS: ReadonlyArray<readonly [VehicleCondition, string]> = [
  ['new', 'New'],
  ['used_excellent', 'Used – excellent'],
  ['used_good', 'Used – good'],
  ['used_fair', 'Used – fair'],
  ['needs_repair', 'Needs repair'],
];

export const TRANSMISSIONS: ReadonlyArray<readonly [Transmission, string]> = [
  ['automatic', 'Automatic'],
  ['manual', 'Manual'],
];

export const FUEL_TYPES: ReadonlyArray<readonly [FuelType, string]> = [
  ['petrol', 'Petrol'],
  ['diesel', 'Diesel'],
  ['hybrid', 'Hybrid'],
  ['electric', 'Electric'],
  ['other', 'Other'],
];

export const REGISTRATION_STATUSES: ReadonlyArray<readonly [RegistrationStatus, string]> = [
  ['registered', 'Registered'],
  ['unregistered', 'Unregistered'],
];

export const DUTY_STATUSES: ReadonlyArray<readonly [DutyStatus, string]> = [
  ['paid', 'Duty paid'],
  ['unpaid', 'Duty not paid'],
];

export const IMPORT_STATUSES: ReadonlyArray<readonly [ImportStatus, string]> = [
  ['local', 'Local (bought in Zambia)'],
  ['imported', 'Imported'],
];

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: 'Draft',
  pending: 'Under review',
  active: 'Live',
  sold: 'Sold',
  archived: 'Archived',
  rejected: 'Rejected',
};

export const PROVINCES: ReadonlyArray<readonly [Province, string]> = [
  ['central', 'Central'],
  ['copperbelt', 'Copperbelt'],
  ['eastern', 'Eastern'],
  ['luapula', 'Luapula'],
  ['lusaka', 'Lusaka'],
  ['muchinga', 'Muchinga'],
  ['northern', 'Northern'],
  ['north_western', 'North-Western'],
  ['southern', 'Southern'],
  ['western', 'Western'],
];

/** Suggestions for the make field (free text is still allowed). */
export const COMMON_MAKES = [
  'Toyota', 'Nissan', 'Honda', 'Mazda', 'Mitsubishi', 'Subaru', 'Isuzu', 'Suzuki', 'Hyundai', 'Kia',
  'Ford', 'Volkswagen', 'Mercedes-Benz', 'BMW', 'Audi', 'Lexus', 'Land Rover', 'Jeep', 'Peugeot',
  'Renault', 'Tata', 'Mahindra', 'Chevrolet', 'Daihatsu', 'Hino', 'Scania', 'Volvo', 'MAN',
] as const;

export const BODY_TYPES = [
  'Sedan', 'Hatchback', 'SUV', 'Pickup / Double cab', 'Single cab', 'Station wagon', 'Minibus',
  'Van', 'Coupe', 'Convertible', 'Truck', 'Bus', 'Other',
] as const;

export function labelOf<T extends string>(options: ReadonlyArray<readonly [T, string]>, value: T | null | undefined): string {
  if (!value) return '—';
  return options.find(([v]) => v === value)?.[1] ?? value;
}

/**
 * 485000 → "485,000". Hand-rolled rather than toLocaleString so the server
 * render and the browser always produce identical text (no hydration mismatch).
 */
export function formatNumber(n: number): string {
  const whole = Math.round(n);
  const sign = whole < 0 ? '-' : '';
  return sign + String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "K485,000" — Zambian kwacha, rounded to whole kwacha. */
export function formatPrice(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return `K${formatNumber(amount)}`;
}

export function formatMileage(km: number | null | undefined): string {
  if (km == null) return 'Not stated';
  return `${formatNumber(km)} km`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Calendar date in Zambian time (UTC+2, no daylight saving), identical on server and browser. */
function lusakaDate(iso: string): Date {
  return new Date(new Date(iso).getTime() + 2 * 3600_000);
}
/** "12 Sep 2026" */
export function formatDate(iso: string): string {
  const d = lusakaDate(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** "September 2026" */
export function formatMonthYear(iso: string): string {
  const d = lusakaDate(iso);
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** 1998 → "2.0 L". */
export function formatEngine(cc: number | null | undefined): string {
  if (!cc) return 'Not stated';
  return `${(cc / 1000).toFixed(1)} L`;
}

/**
 * Accepts "2.0", "2.0L", "2 L", "1998", "1998cc" and returns cubic centimetres.
 * Values under 20 are treated as litres.
 */
export function parseEngineSize(input: string): number | null {
  const cleaned = input.trim().toLowerCase().replace(/,/g, '.').replace(/\s+/g, '');
  if (!cleaned) return null;
  const match = cleaned.match(/^(\d+(?:\.\d+)?)(l|litres?|liters?|cc)?$/);
  if (!match || !match[1]) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cc = match[2] === 'cc' || n >= 20 ? Math.round(n) : Math.round(n * 1000);
  return cc >= 50 && cc <= 20000 ? cc : null;
}

export function vehicleTitle(v: { year?: number | null; make?: string | null; model?: string | null; variant?: string | null }): string {
  return [v.year, v.make, v.model, v.variant].filter(Boolean).join(' ');
}
