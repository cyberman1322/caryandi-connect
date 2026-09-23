import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { CheckCircle2, Loader2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-context';
import { ACCOUNT_TYPE_LABELS } from '@/lib/auth/account-types';
import { updateMyProfile } from '@/lib/auth/profile-service';
import { changePassword, signOutEverywhere } from '@/lib/auth/auth-service';
import { fieldErrors, newPasswordSchema, profileSchema, ZAMBIA_PROVINCES, type ProfileInput } from '@/lib/auth/validation';

export function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5 grid gap-5">{children}</div>
    </section>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string | undefined; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Status({ kind, children }: { kind: 'success' | 'error'; children: ReactNode }) {
  return kind === 'success'
    ? <div role="status" className="flex items-start gap-2 rounded-md bg-success/10 p-3 text-sm text-success"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{children}</div>
    : <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{children}</p>;
}

/** Personal profile + private contact details. Phone and WhatsApp are only shown to signed-in buyers who tap "Show contact". */
export function ProfileForm() {
  const auth = useAuth();
  const account = auth.status === 'signed-in' ? auth.account : null;
  const [values, setValues] = useState<ProfileInput>({ fullName: '', phone: '', whatsappNumber: '', province: '', city: '', bio: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!account) return;
    setValues({
      fullName: account.profile.full_name,
      phone: account.contacts.phone ?? '',
      whatsappNumber: account.contacts.whatsapp_number ?? '',
      province: account.profile.province ?? '',
      city: account.profile.city ?? '',
      bio: account.profile.bio ?? '',
    });
  }, [account]);

  if (!account || auth.status !== 'signed-in') return null;
  const set = (key: keyof ProfileInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!account) return;
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); setStatus(null); return; }
    setErrors({}); setStatus(null); setBusy(true);
    try {
      await updateMyProfile(account.profile.id, parsed.data);
      await auth.refreshAccount();
      setStatus({ kind: 'success', text: 'Your profile has been saved.' });
    } catch {
      setStatus({ kind: 'error', text: 'We couldn’t save your profile. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <Card title="Your details" description="How you appear to buyers and sellers on Caryandi.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" error={errors['fullName']}>
            {(id) => <Input id={id} autoComplete="name" value={values.fullName} onChange={set('fullName')} />}
          </Field>
          <Field label="Email address" hint="Used to sign in. Never shown publicly.">
            {(id) => <Input id={id} type="email" value={auth.session.user.email ?? ''} disabled readOnly />}
          </Field>
          <Field label="Province" error={errors['province']}>
            {(id) => (
              <Select value={values.province} onValueChange={(v) => setValues((s) => ({ ...s, province: v as ProfileInput['province'] }))}>
                <SelectTrigger id={id}><SelectValue placeholder="Select province" /></SelectTrigger>
                <SelectContent>{ZAMBIA_PROVINCES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Town or city" error={errors['city']}>
            {(id) => <Input id={id} autoComplete="address-level2" placeholder="e.g. Lusaka" value={values.city} onChange={set('city')} />}
          </Field>
        </div>
        <Field label="About" error={errors['bio']}>
          {(id) => <Textarea id={id} rows={4} maxLength={1000} placeholder="A short introduction buyers will see" value={values.bio} onChange={set('bio')} />}
        </Field>
      </Card>

      <Card title="Contact numbers" description="Buyers must be signed in to see these, and every view is recorded to protect you from scammers. A phone number is required before you can publish a listing.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Phone number" error={errors['phone']} hint="e.g. 097 123 4567">
            {(id) => <Input id={id} type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} />}
          </Field>
          <Field label="WhatsApp number" error={errors['whatsappNumber']} hint="Leave empty if you don’t use WhatsApp">
            {(id) => (
              <div className="grid gap-2">
                <Input id={id} type="tel" value={values.whatsappNumber} onChange={set('whatsappNumber')} />
                {values.phone && values.whatsappNumber !== values.phone && (
                  <button type="button" className="w-fit text-xs text-primary" onClick={() => setValues((s) => ({ ...s, whatsappNumber: s.phone }))}>
                    Same as phone number
                  </button>
                )}
              </div>
            )}
          </Field>
        </div>
      </Card>

      {status && <Status kind={status.kind}>{status.text}</Status>}
      <Button type="submit" className="w-full sm:w-auto sm:justify-self-start" disabled={busy}>
        {busy && <Loader2 className="animate-spin" />}{busy ? 'Saving…' : 'Save profile'}
      </Button>
    </form>
  );
}

export function SettingsPanel() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ currentPassword: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<'password' | 'everywhere' | null>(null);

  if (auth.status !== 'signed-in') return null;
  const { profile } = auth.account;
  const email = auth.session.user.email ?? '';
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = newPasswordSchema.safeParse({ password: values.password, confirmPassword: values.confirmPassword });
    const errs = parsed.success ? {} : fieldErrors(parsed.error);
    if (!values.currentPassword) errs['currentPassword'] = 'Enter your current password';
    if (Object.keys(errs).length || !parsed.success) { setErrors(errs); return; }
    setErrors({}); setStatus(null); setBusy('password');
    const result = await changePassword(email, values.currentPassword, parsed.data.password);
    setBusy(null);
    if (result.ok) {
      setValues({ currentPassword: '', password: '', confirmPassword: '' });
      setStatus({ kind: 'success', text: 'Your password has been changed.' });
    } else {
      setStatus({ kind: 'error', text: result.error });
    }
  }

  return (
    <div className="grid gap-6">
      <Card title="Account">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium">{email}</dd></div>
          <div><dt className="text-muted-foreground">Account type</dt><dd className="font-medium">{ACCOUNT_TYPE_LABELS[profile.account_type]}</dd></div>
          <div><dt className="text-muted-foreground">Member since</dt><dd className="font-medium">{new Date(profile.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
        </dl>
      </Card>

      <form onSubmit={submit} noValidate>
        <Card title="Change password" description="Use at least 8 characters with letters and a number.">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Current password" error={errors['currentPassword']}>
              {(id) => <Input id={id} type="password" autoComplete="current-password" value={values.currentPassword} onChange={set('currentPassword')} />}
            </Field>
            <Field label="New password" error={errors['password']}>
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />}
            </Field>
            <Field label="Confirm new password" error={errors['confirmPassword']}>
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={values.confirmPassword} onChange={set('confirmPassword')} />}
            </Field>
          </div>
          {status && <Status kind={status.kind}>{status.text}</Status>}
          <Button type="submit" className="w-full sm:w-auto sm:justify-self-start" disabled={busy !== null}>
            {busy === 'password' && <Loader2 className="animate-spin" />}{busy === 'password' ? 'Changing…' : 'Change password'}
          </Button>
        </Card>
      </form>

      <Card title="Sign out" description="If you used Caryandi on a shared or lost phone, sign out everywhere to end all sessions.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={async () => { await auth.signOut(); void navigate({ to: '/' }); }}><LogOut />Sign out</Button>
          <Button variant="outline" disabled={busy !== null}
            onClick={async () => { setBusy('everywhere'); await signOutEverywhere(); await auth.signOut(); void navigate({ to: '/login' }); }}>
            {busy === 'everywhere' && <Loader2 className="animate-spin" />}Sign out of all devices
          </Button>
        </div>
      </Card>
    </div>
  );
}
