import { getSupabase } from '@/lib/supabase/client';
import type { Tables } from '@/lib/supabase/database.types';
import type { ProfileValues } from './validation';

export type Profile = Tables<'profiles'>;
export type ProfileContacts = Pick<Tables<'profile_contacts'>, 'phone' | 'whatsapp_number'>;

export type MyAccount = {
  profile: Profile;
  contacts: ProfileContacts;
};

/** The signed-in user's own profile and private contact details (RLS: own row only). */
export async function fetchMyAccount(userId: string): Promise<MyAccount> {
  const supabase = getSupabase();
  const [profileRes, contactsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('profile_contacts').select('phone, whatsapp_number').eq('profile_id', userId).maybeSingle(),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (!profileRes.data) throw new Error('Your profile could not be found.');
  if (contactsRes.error) throw contactsRes.error;
  return {
    profile: profileRes.data,
    contacts: contactsRes.data ?? { phone: null, whatsapp_number: null },
  };
}

export async function updateMyProfile(userId: string, values: ProfileValues): Promise<void> {
  const supabase = getSupabase();
  const profile = await supabase
    .from('profiles')
    .update({ full_name: values.fullName, province: values.province, city: values.city, bio: values.bio })
    .eq('id', userId);
  if (profile.error) throw profile.error;

  const contacts = await supabase
    .from('profile_contacts')
    .update({ phone: values.phone, whatsapp_number: values.whatsappNumber })
    .eq('profile_id', userId);
  if (contacts.error) throw contacts.error;
}

/** A buyer who wants to sell their own car switches to a private-seller account. */
export async function becomePrivateSeller(userId: string): Promise<void> {
  const { error } = await getSupabase().from('profiles').update({ account_type: 'private_seller' }).eq('id', userId);
  if (error) throw error;
}

/** How complete the profile is, for the dashboard "Account readiness" panel. */
export function profileCompleteness(account: MyAccount): { percent: number; missing: string[] } {
  const checks: Array<[boolean, string]> = [
    [account.profile.full_name.trim().length >= 2, 'your name'],
    [Boolean(account.contacts.phone), 'a phone number'],
    [Boolean(account.contacts.whatsapp_number), 'a WhatsApp number'],
    [Boolean(account.profile.city), 'your town or city'],
    [Boolean(account.profile.province), 'your province'],
    [Boolean(account.profile.bio), 'a short bio'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter(([ok]) => !ok).map(([, label]) => label),
  };
}
