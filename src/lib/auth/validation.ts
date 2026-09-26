import { z } from 'zod';
import { SELF_SERVICE_ACCOUNT_TYPES } from './account-types';

/**
 * Normalise a Zambian (or international) phone number to E.164, e.g.
 *   "097 123 4567" → "+260971234567"
 *   "260971234567" → "+260971234567"
 *   "+27 82 123 4567" → "+27821234567"
 * Returns null when the input can't be a valid number.
 * The database checks the same E.164 format, so this is for friendlier
 * input and error messages, not the only line of defence.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (!hasPlus && digits.startsWith('0') && digits.length === 10) digits = `260${digits.slice(1)}`;
  else if (!hasPlus && digits.length === 9 && /^[79]/.test(digits)) digits = `260${digits}`;
  const e164 = `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(e164) ? e164 : null;
}

const phone = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number, e.g. 097 123 4567' });
      return z.NEVER;
    }
    return normalized;
  });

const optionalPhone = z
  .string()
  .transform((value, ctx) => {
    if (!value.trim()) return null;
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number, e.g. 097 123 4567' });
      return z.NEVER;
    }
    return normalized;
  });

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

/** Supabase's own minimum is 6; we ask for a little more. */
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Use at most 72 characters')
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), 'Use letters and at least one number');

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean(),
});

export const signUpSchema = z
  .object({
    accountType: z.enum(SELF_SERVICE_ACCOUNT_TYPES),
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    email,
    phone,
    password,
    confirmPassword: z.string(),
    acceptTerms: z.boolean().refine((v) => v, 'You must be 18 or older and accept the Terms of Use and Privacy Policy'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const ZAMBIA_PROVINCES = [
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
] as const;

const provinceIds = ZAMBIA_PROVINCES.map(([id]) => id) as [
  (typeof ZAMBIA_PROVINCES)[number][0],
  ...(typeof ZAMBIA_PROVINCES)[number][0][],
];

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  phone: optionalPhone,
  whatsappNumber: optionalPhone,
  province: z.union([z.enum(provinceIds), z.literal('')]).transform((v) => (v === '' ? null : v)),
  city: z.string().trim().max(80).transform((v) => v || null),
  bio: z.string().trim().max(1000, 'Keep this under 1,000 characters').transform((v) => v || null),
});

export type SignInInput = z.input<typeof signInSchema>;
export type SignUpInput = z.input<typeof signUpSchema>;
export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileValues = z.output<typeof profileSchema>;

/** Turn a zod error into { field: firstMessage } for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    out[key] ??= issue.message;
  }
  return out;
}
