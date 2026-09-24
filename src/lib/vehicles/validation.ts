import { z } from 'zod';
import {
  CONDITIONS, DUTY_STATUSES, FUEL_TYPES, IMPORT_STATUSES, PROVINCES, REGISTRATION_STATUSES, TRANSMISSIONS,
  VEHICLE_FEATURES, isVehicleFeature, parseEngineSize, type VehicleFeature,
} from './vehicle-options';

const enumOf = <T extends string>(options: ReadonlyArray<readonly [T, string]>, message: string) =>
  z.string().refine((v): v is T => options.some(([o]) => o === v), { message }).transform((v) => v as T);

/** "485,000", "K485 000", "485000.00" → 485000 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[kK\s,]/g, '').replace(/zmw/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "48,200 km" → 48200 */
export function parseWholeNumber(input: string): number | null {
  const cleaned = input.replace(/[\s,]|km/gi, '');
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters`).transform((v) => (v ? v : null));

export const currentYear = () => new Date().getFullYear();

/** Raw form values (all strings, as typed) → validated database fields. */
export const vehicleFormSchema = z.object({
  make: z.string().trim().min(1, 'Enter the make, e.g. Toyota').max(60),
  model: z.string().trim().min(1, 'Enter the model, e.g. Harrier').max(60),
  variant: optionalText(80),
  year: z.string().transform((v, ctx) => {
    const n = parseWholeNumber(v);
    if (n === null || n < 1950 || n > currentYear() + 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Enter a year between 1950 and ${currentYear() + 1}` });
      return z.NEVER;
    }
    return n;
  }),
  price: z.string().transform((v, ctx) => {
    const n = parseMoney(v);
    if (n === null || n <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter the price in kwacha, e.g. 485,000' });
      return z.NEVER;
    }
    if (n > 50_000_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'That price looks too high — check the number of zeros' });
      return z.NEVER;
    }
    return n;
  }),
  mileage: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const n = parseWholeNumber(v);
    if (n === null || n > 3_000_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter mileage in km, e.g. 48,200' });
      return z.NEVER;
    }
    return n;
  }),
  engineSize: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const cc = parseEngineSize(v);
    if (cc === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter engine size like 2.0 or 1998cc' });
      return z.NEVER;
    }
    return cc;
  }),
  condition: enumOf(CONDITIONS, 'Choose the condition'),
  transmission: enumOf(TRANSMISSIONS, 'Choose the transmission'),
  fuel: enumOf(FUEL_TYPES, 'Choose the fuel type'),
  registration: enumOf(REGISTRATION_STATUSES, 'Is the vehicle registered in Zambia?'),
  duty: enumOf(DUTY_STATUSES, 'Has import duty been paid?'),
  importStatus: enumOf(IMPORT_STATUSES, 'Choose local or imported'),
  bodyType: optionalText(40),
  colour: optionalText(40),
  province: enumOf(PROVINCES, 'Choose the province'),
  city: z.string().trim().min(2, 'Enter the town or city').max(80),
  area: optionalText(120),
  description: optionalText(5000),
  // Ticked features; unknown codes are dropped and the list is de-duplicated in catalogue order.
  features: z.array(z.string()).max(VEHICLE_FEATURES.length).transform((codes): VehicleFeature[] => {
    const chosen = new Set(codes.filter(isVehicleFeature));
    return VEHICLE_FEATURES.map(([code]) => code).filter((code) => chosen.has(code));
  }),
});

export type VehicleFormInput = z.input<typeof vehicleFormSchema>;
export type VehicleFormValues = z.output<typeof vehicleFormSchema>;

export const emptyVehicleForm: VehicleFormInput = {
  make: '', model: '', variant: '', year: '', price: '', mileage: '', engineSize: '',
  condition: '', transmission: '', fuel: '', registration: '', duty: '', importStatus: 'local',
  bodyType: '', colour: '', province: '', city: '', area: '', description: '', features: [],
};

/** Form values → columns for insert/update (owner, business and status are set by the service). */
export function toVehicleColumns(v: VehicleFormValues) {
  return {
    make: v.make,
    model: v.model,
    variant: v.variant,
    year: v.year,
    price: v.price,
    mileage_km: v.mileage,
    engine_size_cc: v.engineSize,
    condition: v.condition,
    transmission: v.transmission,
    fuel_type: v.fuel,
    registration_status: v.registration,
    duty_status: v.duty,
    import_status: v.importStatus,
    body_type: v.bodyType,
    colour: v.colour,
    province: v.province,
    city: v.city,
    area: v.area,
    description: v.description,
    features: v.features,
  };
}
