import { z } from 'zod';
import { getSupabase } from '@/lib/supabase/client';
import type { Enums, Tables } from '@/lib/supabase/database.types';
import { normalizePhone } from '@/lib/auth/validation';
import { checkImageFile, compressPhoto, extensionFor, storagePath } from '@/lib/storage/images';
import { PROVINCES } from '@/lib/vehicles/vehicle-options';
import type { AccountType } from '@/lib/auth/account-types';

export type Business = Tables<'businesses'>;
export type BusinessContacts = Pick<Tables<'business_contacts'>, 'phone' | 'whatsapp_number' | 'email' | 'website'>;
export type BusinessType = Enums<'business_type'>;
export type MemberRole = Enums<'business_member_role'>;

export type MyBusiness = { business: Business; contacts: BusinessContacts; role: MemberRole };

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  dealer: 'Vehicle dealer',
  mechanic: 'Mechanic',
  servicing_company: 'Servicing company',
  parts_seller: 'Parts seller',
  import_agent: 'Import agent',
};

export function businessTypeFor(accountType: AccountType): BusinessType | null {
  switch (accountType) {
    case 'dealer':
    case 'mechanic':
    case 'servicing_company':
    case 'parts_seller':
    case 'import_agent':
      return accountType;
    default:
      return null;
  }
}

const phoneField = (required: boolean) =>
  z.string().transform((value, ctx) => {
    if (!value.trim()) {
      if (required) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a business phone number' });
      return null;
    }
    const n = normalizePhone(value);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid phone number, e.g. 097 123 4567' });
      return z.NEVER;
    }
    return n;
  });

const optional = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).transform((v) => v || null);

export const businessFormSchema = z.object({
  name: z.string().trim().min(2, 'Enter your business name').max(120),
  description: optional(3000),
  province: z.string().refine((v) => PROVINCES.some(([p]) => p === v), 'Choose the province')
    .transform((v) => v as Enums<'zambia_province'>),
  city: z.string().trim().min(2, 'Enter the town or city').max(80),
  area: optional(120),
  address: optional(300),
  phone: phoneField(true),
  whatsappNumber: phoneField(false),
  email: z.string().trim().toLowerCase().max(254).transform((v, ctx) => {
    if (!v) return null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid email address' });
      return z.NEVER;
    }
    return v;
  }),
  website: z.string().trim().max(200).transform((v, ctx) => {
    if (!v) return null;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const url = new URL(withScheme);
      if (!url.hostname.includes('.')) throw new Error('bad host');
      return url.toString();
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid website, e.g. autoworld.co.zm' });
      return z.NEVER;
    }
  }),
});

export type BusinessFormInput = z.input<typeof businessFormSchema>;
export type BusinessFormValues = z.output<typeof businessFormSchema>;

export const emptyBusinessForm: BusinessFormInput = {
  name: '', description: '', province: '', city: '', area: '', address: '',
  phone: '', whatsappNumber: '', email: '', website: '',
};

export function businessToForm(b: MyBusiness): BusinessFormInput {
  return {
    name: b.business.name,
    description: b.business.description ?? '',
    province: b.business.province ?? '',
    city: b.business.city ?? '',
    area: b.business.area ?? '',
    address: b.business.address ?? '',
    phone: b.contacts.phone ?? '',
    whatsappNumber: b.contacts.whatsapp_number ?? '',
    email: b.contacts.email ?? '',
    website: b.contacts.website ?? '',
  };
}

/** The business the signed-in user belongs to (owner, manager or staff), if any. */
export async function getMyBusiness(): Promise<MyBusiness | null> {
  const supabase = getSupabase();
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return null;

  const membership = await supabase
    .from('business_members')
    .select('business_id, role')
    .eq('profile_id', uid)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membership.error) throw new Error('We couldn’t load your business profile.');
  if (!membership.data) return null;

  const [biz, contacts] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', membership.data.business_id).is('deleted_at', null).maybeSingle(),
    supabase.from('business_contacts').select('phone, whatsapp_number, email, website').eq('business_id', membership.data.business_id).maybeSingle(),
  ]);
  // A failed request must not look like "no business yet", or the user would be invited to create a second one.
  if (biz.error || contacts.error) throw new Error('We couldn’t load your business profile. Check your connection and try again.');
  if (!biz.data) return null;
  return {
    business: biz.data,
    contacts: contacts.data ?? { phone: null, whatsapp_number: null, email: null, website: null },
    role: membership.data.role,
  };
}

function friendlyError(error: { message: string; code?: string }): string {
  if (error.code === '23505' && error.message.includes('one_per_owner')) return 'You already have a business profile. Refresh the page to edit it.';
  if (error.code === '23505' && error.message.includes('slug')) return 'That business name is already taken. Try adding your town.';
  if (error.code === '42501' || error.message.includes('row-level security')) return 'You don’t have permission to change this business.';
  return 'We couldn’t save your business profile. Please try again.';
}

/** Create the business (first time) or update it; contact details are saved alongside. */
export async function saveMyBusiness(values: BusinessFormValues, type: BusinessType, existing: Business | null): Promise<void> {
  const supabase = getSupabase();
  const fields = {
    name: values.name,
    description: values.description,
    province: values.province,
    city: values.city,
    area: values.area,
    address: values.address,
  };

  let businessId: string;
  if (existing) {
    const { error } = await supabase.from('businesses').update(fields).eq('id', existing.id);
    if (error) throw new Error(friendlyError(error));
    businessId = existing.id;
  } else {
    const { data: session } = await supabase.auth.getSession();
    const uid = session.session?.user.id;
    if (!uid) throw new Error('Please sign in to continue.');
    const { data, error } = await supabase
      .from('businesses')
      .insert({ ...fields, owner_id: uid, business_type: type, slug: '' })
      .select('id')
      .single();
    if (error) throw new Error(friendlyError(error));
    businessId = data.id;
  }

  const { error: contactError } = await supabase.from('business_contacts').upsert(
    { business_id: businessId, phone: values.phone, whatsapp_number: values.whatsappNumber, email: values.email, website: values.website },
    { onConflict: 'business_id' },
  );
  if (contactError) throw new Error('Your business was saved, but the contact details were not. Please try again.');
}

export async function uploadBusinessLogo(businessId: string, file: File): Promise<void> {
  const check = checkImageFile(file);
  if (!check.ok) throw new Error(check.error);
  const supabase = getSupabase();
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) throw new Error('Please sign in to continue.');
  let blob: Blob;
  try {
    blob = await compressPhoto(file, 800, 0.85);
  } catch {
    throw new Error('The logo couldn’t be processed. Try a different image (JPG or PNG).');
  }
  const contentType = blob.type || file.type;
  const path = storagePath(uid, 'business', extensionFor(contentType));
  const upload = await supabase.storage.from('business-media').upload(path, blob, { contentType, cacheControl: '31536000' });
  if (upload.error) throw new Error('The logo could not be uploaded. Please try again.');
  const { error } = await supabase.from('businesses').update({ logo_path: path }).eq('id', businessId);
  if (error) {
    await supabase.storage.from('business-media').remove([path]);
    throw new Error('The logo could not be saved.');
  }
}

export type TeamMember = { profileId: string; name: string; role: MemberRole; joinedAt: string };

/** The signed-in user's business team (members can see their own team). */
export async function listMyTeam(businessId: string): Promise<TeamMember[]> {
  const supabase = getSupabase();
  const members = await supabase.from('business_members').select('profile_id, role, created_at').eq('business_id', businessId).order('created_at');
  if (members.error) throw new Error('We couldn’t load your team.');
  const ids = (members.data ?? []).map((m) => m.profile_id);
  if (!ids.length) return [];
  const profiles = await supabase.from('profiles').select('id, full_name').in('id', ids);
  if (profiles.error) throw new Error('We couldn’t load your team.');
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
  return (members.data ?? []).map((m) => ({ profileId: m.profile_id, name: names.get(m.profile_id) ?? 'Team member', role: m.role, joinedAt: m.created_at }));
}
