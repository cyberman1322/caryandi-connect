import { z } from 'zod';
import type { Enums } from '@/lib/supabase/database.types';
import { PROVINCES } from '@/lib/vehicles/vehicle-options';
import { parseMoney, parseWholeNumber } from '@/lib/vehicles/validation';

export type PartCondition = Enums<'part_condition'>;

export const PART_CONDITIONS: ReadonlyArray<readonly [PartCondition, string]> = [
  ['new', 'New'],
  ['used', 'Used – tested'],
  ['reconditioned', 'Reconditioned'],
];

const optionalText = (max: number) =>
  z.string().trim().max(max, `Keep this under ${max} characters`).transform((v) => (v ? v : null));

/** Raw form values (strings, as typed) → validated database fields. */
export const partFormSchema = z.object({
  title: z.string().trim().min(3, 'Name the part, e.g. Front brake pads').max(120),
  categoryId: z.string().transform((v, ctx) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a category' });
      return z.NEVER;
    }
    return n;
  }),
  condition: z.string().refine((v): v is PartCondition => PART_CONDITIONS.some(([c]) => c === v), { message: 'Choose the condition' })
    .transform((v) => v as PartCondition),
  price: z.string().transform((v, ctx) => {
    const n = parseMoney(v);
    if (n === null || n <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter the price in kwacha, e.g. 2,850' });
      return z.NEVER;
    }
    if (n > 5_000_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'That price looks too high — check the number of zeros' });
      return z.NEVER;
    }
    return n;
  }),
  quantity: z.string().transform((v, ctx) => {
    if (!v.trim()) return 1;
    const n = parseWholeNumber(v);
    if (n === null || n > 100_000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter how many you have in stock' });
      return z.NEVER;
    }
    return n;
  }),
  compatibility: optionalText(500),
  province: z.string().refine((v) => PROVINCES.some(([p]) => p === v), { message: 'Choose the province' })
    .transform((v) => v as (typeof PROVINCES)[number][0]),
  city: z.string().trim().min(2, 'Enter the town or city').max(80),
  description: optionalText(3000),
});

export type PartFormInput = z.input<typeof partFormSchema>;
export type PartFormValues = z.output<typeof partFormSchema>;

export const emptyPartForm: PartFormInput = {
  title: '', categoryId: '', condition: '', price: '', quantity: '1', compatibility: '', province: '', city: '', description: '',
};

export function toPartColumns(v: PartFormValues) {
  return {
    title: v.title,
    category_id: v.categoryId,
    condition: v.condition,
    price: v.price,
    quantity: v.quantity,
    compatibility_note: v.compatibility,
    province: v.province,
    city: v.city,
    description: v.description,
  };
}
