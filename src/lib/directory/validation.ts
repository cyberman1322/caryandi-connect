import { z } from 'zod';
import type { Json } from '@/lib/supabase/database.types';
import { parseMoney, parseWholeNumber } from '@/lib/vehicles/validation';

/* ------------------------------------------------------------------ shared */

const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters`).transform((v) => (v ? v : null));

const optionalPrice = (max = 5_000_000) =>
  z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const n = parseMoney(v);
    if (n === null || n < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter an amount in kwacha, e.g. 450' });
      return z.NEVER;
    }
    if (n > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'That amount looks too high — check the number of zeros' });
      return z.NEVER;
    }
    return n;
  });

const optionalWhole = (min: number, max: number, message: string) =>
  z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const n = parseWholeNumber(v);
    if (n === null || n < min || n > max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      return z.NEVER;
    }
    return n;
  });

/* ------------------------------------------------------------------ services (mechanics, servicing companies) */

export const serviceFormSchema = z.object({
  name: z.string().trim().min(2, 'Name the service, e.g. Brake repair').max(120),
  description: optionalText(2000),
  priceFrom: optionalPrice(),
  priceNote: optionalText(120),
  durationMinutes: optionalWhole(5, 10080, 'Enter the usual time in minutes (5 to 10,080)'),
});

export type ServiceFormInput = z.input<typeof serviceFormSchema>;
export type ServiceFormValues = z.output<typeof serviceFormSchema>;
export const emptyServiceForm: ServiceFormInput = { name: '', description: '', priceFrom: '', priceNote: '', durationMinutes: '' };

export function toServiceColumns(v: ServiceFormValues) {
  return { name: v.name, description: v.description, price_from: v.priceFrom, price_note: v.priceNote, duration_minutes: v.durationMinutes };
}

/* ------------------------------------------------------------------ import routes (agents) */

/** Services an agent can tick on a route; free text is still allowed so the list never limits agents. */
export const ROUTE_SERVICE_SUGGESTIONS = [
  'Vehicle sourcing', 'Auction bidding', 'Pre-shipment inspection', 'Shipping', 'Port clearing', 'Customs & duty processing',
  'Transit to Zambia', 'ZRA registration', 'Number plates', 'Insurance', 'Delivery to your door',
] as const;

export const routeFormSchema = z
  .object({
    originCountry: z.string().trim().min(2, 'Where do vehicles come from? e.g. Japan').max(60),
    transitPort: z.string().trim().max(80).transform((v, ctx) => {
      if (!v) return null;
      if (v.length < 2) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter the port name, e.g. Durban' });
        return z.NEVER;
      }
      return v;
    }),
    destinationCity: z.string().trim().min(2, 'Where in Zambia is the vehicle delivered? e.g. Lusaka').max(80),
    services: z.array(z.string().trim().min(2).max(60)).max(20, 'Choose at most 20 services')
      .transform((list) => Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)))),
    priceFrom: optionalPrice(),
    priceNote: optionalText(120),
    estDaysMin: optionalWhole(1, 365, 'Enter days between 1 and 365'),
    estDaysMax: optionalWhole(1, 365, 'Enter days between 1 and 365'),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    if (v.estDaysMin !== null && v.estDaysMax !== null && v.estDaysMax < v.estDaysMin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['estDaysMax'], message: 'Must be the same as or more than the minimum' });
    }
  });

export type RouteFormInput = z.input<typeof routeFormSchema>;
export type RouteFormValues = z.output<typeof routeFormSchema>;
export const emptyRouteForm: RouteFormInput = {
  originCountry: '', transitPort: '', destinationCity: 'Lusaka', services: [], priceFrom: '', priceNote: '', estDaysMin: '', estDaysMax: '', notes: '',
};

export function toRouteColumns(v: RouteFormValues) {
  return {
    origin_country: v.originCountry,
    transit_port: v.transitPort,
    destination_city: v.destinationCity,
    services: v.services,
    price_from: v.priceFrom,
    price_note: v.priceNote,
    est_days_min: v.estDaysMin,
    est_days_max: v.estDaysMax,
    notes: v.notes,
  };
}

export function routeLabel(r: { origin_country: string; transit_port: string | null; destination_city: string }): string {
  return [r.origin_country, r.transit_port, r.destination_city].filter(Boolean).join(' → ');
}

/* ------------------------------------------------------------------ opening hours */

export const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
] as const;
export type Day = (typeof DAYS)[number][0];
export type DayHours = { open: string; close: string } | null;
export type OpeningHours = Record<Day, DayHours>;

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Reads the stored JSON defensively; anything malformed is treated as "not set". */
export function parseOpeningHours(value: Json | null | undefined): OpeningHours | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {} as OpeningHours;
  let any = false;
  for (const [day] of DAYS) {
    const v = (value as Record<string, Json | undefined>)[day];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const open = v['open'];
      const close = v['close'];
      if (typeof open === 'string' && typeof close === 'string' && TIME.test(open) && TIME.test(close) && open < close) {
        out[day] = { open, close };
        any = true;
        continue;
      }
    }
    out[day] = null;
  }
  return any ? out : null;
}

export function validateOpeningHours(hours: OpeningHours): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [day, label] of DAYS) {
    const h = hours[day];
    if (!h) continue;
    if (!TIME.test(h.open) || !TIME.test(h.close)) errors[day] = `${label}: enter times like 08:00`;
    else if (h.open >= h.close) errors[day] = `${label}: closing time must be after opening time`;
  }
  return errors;
}

/** Zambia is UTC+2 all year (no daylight saving). */
function lusakaNow(now: Date): { day: Day; time: string } {
  const d = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const days: Day[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return { day: days[d.getUTCDay()] ?? 'mon', time: `${hh}:${mm}` };
}

export function openStatus(hours: OpeningHours | null, now = new Date()): { open: boolean; label: string } | null {
  if (!hours) return null;
  const { day, time } = lusakaNow(now);
  const today = hours[day];
  if (today && time >= today.open && time < today.close) return { open: true, label: `Open now · until ${today.close}` };
  if (today && time < today.open) return { open: false, label: `Closed · opens ${today.open}` };
  return { open: false, label: 'Closed now' };
}

export function formatDayHours(h: DayHours): string {
  return h ? `${h.open} – ${h.close}` : 'Closed';
}
