import type { FuelType, Province, RegistrationStatus, DutyStatus, ImportStatus, Transmission, VehicleCondition } from './vehicle-options';
import { CONDITIONS, DUTY_STATUSES, FUEL_TYPES, IMPORT_STATUSES, PROVINCES, REGISTRATION_STATUSES, TRANSMISSIONS } from './vehicle-options';

export const SORTS = [
  ['newest', 'Newest listings'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
  ['year_desc', 'Year: newest first'],
  ['mileage_asc', 'Mileage: lowest first'],
] as const;
export type VehicleSort = (typeof SORTS)[number][0];

export const PAGE_SIZE = 24;

/** Everything the /vehicles page can filter on. All optional; lives in the URL. */
export type VehicleFilters = {
  q?: string;
  make?: string;
  province?: Province;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  maxMileage?: number;
  transmission?: Transmission;
  fuel?: FuelType;
  condition?: VehicleCondition;
  registration?: RegistrationStatus;
  duty?: DutyStatus;
  import?: ImportStatus;
  verified?: boolean;
  sort?: VehicleSort;
  page?: number;
};

const oneOf = <T extends string>(options: ReadonlyArray<readonly [T, string]>, value: unknown): T | undefined =>
  typeof value === 'string' && options.some(([v]) => v === value) ? (value as T) : undefined;

const int = (value: unknown, min: number, max: number): number | undefined => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

const text = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const t = value.trim().slice(0, maxLength);
  return t ? t : undefined;
};

/**
 * Parse untrusted URL search params into clean filters. Unknown or invalid
 * values are dropped rather than causing errors.
 */
export function parseVehicleFilters(search: Record<string, unknown>): VehicleFilters {
  const out: VehicleFilters = {};
  const set = <K extends keyof VehicleFilters>(key: K, value: VehicleFilters[K] | undefined) => {
    if (value !== undefined) out[key] = value;
  };
  set('q', text(search['q'], 80));
  set('make', text(search['make'], 60));
  set('province', oneOf(PROVINCES, search['province']));
  set('minPrice', int(search['minPrice'], 0, 100_000_000));
  set('maxPrice', int(search['maxPrice'], 0, 100_000_000));
  set('minYear', int(search['minYear'], 1950, 2100));
  set('maxYear', int(search['maxYear'], 1950, 2100));
  set('maxMileage', int(search['maxMileage'], 0, 3_000_000));
  set('transmission', oneOf(TRANSMISSIONS, search['transmission']));
  set('fuel', oneOf(FUEL_TYPES, search['fuel']));
  set('condition', oneOf(CONDITIONS, search['condition']));
  set('registration', oneOf(REGISTRATION_STATUSES, search['registration']));
  set('duty', oneOf(DUTY_STATUSES, search['duty']));
  set('import', oneOf(IMPORT_STATUSES, search['import']));
  if (search['verified'] === true || search['verified'] === 'true' || search['verified'] === '1') out.verified = true;
  set('sort', oneOf(SORTS, search['sort']));
  const page = int(search['page'], 1, 1000);
  if (page && page > 1) out.page = page;
  return out;
}

/** Number of filters in use (for the "Filters (3)" badge). Search text and sort don't count. */
export function activeFilterCount(f: VehicleFilters): number {
  const keys: Array<keyof VehicleFilters> = [
    'make', 'province', 'minPrice', 'maxPrice', 'minYear', 'maxYear', 'maxMileage', 'transmission',
    'fuel', 'condition', 'registration', 'duty', 'import', 'verified',
  ];
  return keys.filter((k) => f[k] !== undefined).length;
}

/**
 * Make free text safe to embed in a PostgREST filter expression: strips the
 * characters that have meaning in its syntax (commas, parentheses, wildcards,
 * quotes, backslashes) and collapses whitespace.
 */
export function sanitizeSearchText(q: string): string {
  return q.replace(/[,()*%\\"'.:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/** Price buckets offered by the quick search on the home page. */
export const PRICE_BUCKETS = [
  ['', 'Any price'],
  ['100000', 'Under K100,000'],
  ['250000', 'Under K250,000'],
  ['500000', 'Under K500,000'],
  ['1000000', 'Under K1,000,000'],
] as const;
