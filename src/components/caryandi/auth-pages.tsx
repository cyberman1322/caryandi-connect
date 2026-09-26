import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Car, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole, Mail, Phone, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import hero from '@/assets/caryandi-hero-1024.webp';
import { Brand } from './brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { roles } from '@/data/mock-data';
import { useAuth } from '@/lib/auth/auth-context';
import { requestPasswordReset, resendConfirmation, signIn, signUp, updatePassword } from '@/lib/auth/auth-service';
import { ACCOUNT_TYPE_LABELS, fromUiRole, type SelfServiceAccountType } from '@/lib/auth/account-types';
import { fieldErrors, forgotPasswordSchema, newPasswordSchema, signInSchema, signUpSchema } from '@/lib/auth/validation';
import { safeRedirectPath } from '@/lib/auth/redirect';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const TITLES: Record<Mode, [string, string]> = {
  login: ['Welcome back', 'Sign in to continue to your account.'],
  register: ['Create your Caryandi account', 'Choose how you plan to use Caryandi.'],
  forgot: ['Reset your password', 'We’ll email you a secure link to choose a new password.'],
  reset: ['Choose a new password', 'Enter a new password for your Caryandi account.'],
};

export function AuthPage({ mode, redirect }: { mode: Mode; redirect?: string | undefined }) {
  const [title, subtitle] = TITLES[mode];
  const [heading, setHeading] = useState<[string, string] | null>(null);
  return (
    <main className="min-h-screen bg-muted/40 p-4 sm:grid sm:place-items-center sm:p-8">
      <div className="mx-auto grid min-h-[680px] w-full max-w-5xl overflow-hidden rounded-xl border bg-card shadow-lg md:grid-cols-[.9fr_1.1fr]">
        <section className="relative hidden overflow-hidden bg-accent/60 p-10 md:flex md:flex-col">
          <Brand />
          <div className="relative z-10 mt-16">
            <h1 className="text-4xl font-bold">Find it. Check it.<br />Drive it.</h1>
            <p className="mt-4 max-w-sm text-muted-foreground">Vehicles, parts and automotive services from sellers across Zambia.</p>
          </div>
          <img src={hero} width={1024} height={683} alt="Silver SUV" loading="lazy" decoding="async" className="absolute inset-x-0 bottom-0 h-72 w-full object-cover object-center" />
        </section>
        <section className="flex flex-col justify-center p-6 sm:p-10 lg:p-16">
          <div className="md:hidden"><Brand /></div>
          <Link to="/" className="mt-8 inline-flex items-center gap-1 text-sm text-muted-foreground md:mt-0"><ArrowLeft className="size-4" />Back home</Link>
          <h2 className="mt-8 text-3xl font-bold">{heading?.[0] ?? title}</h2>
          <p className="mt-2 text-muted-foreground">{heading?.[1] ?? subtitle}</p>
          {mode === 'login' && <LoginForm redirect={redirect} />}
          {mode === 'register' && <RegisterFlow onHeading={setHeading} />}
          {mode === 'forgot' && <ForgotForm />}
          {mode === 'reset' && <ResetForm />}
          <p className="mt-8 text-center text-sm text-muted-foreground">
            {mode === 'login' ? <>New to Caryandi? <Link to="/register" className="font-medium text-primary">Create account</Link></>
              : mode === 'register' ? <>Already registered? <Link to="/login" className="font-medium text-primary">Sign in</Link></>
              : <Link to="/login" className="font-medium text-primary">Return to sign in</Link>}
          </p>
        </section>
      </div>
    </main>
  );
}

/* ----------------------------------------------------------------- shared bits */

function FormAlert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'}
       className={`rounded-md p-3 text-sm ${tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
      {children}
    </p>
  );
}

function TextField({ label, icon: Icon, error, trailing, labelAside, ...input }: {
  label: string; icon?: LucideIcon; error?: string | undefined; trailing?: ReactNode; labelAside?: ReactNode;
} & React.ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <div className="flex justify-between"><Label htmlFor={id}>{label}</Label>{labelAside}</div>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-3 size-4 text-muted-foreground" />}
        <Input id={id} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
               className={`${Icon ? 'pl-10' : ''} ${trailing ? 'pr-10' : ''}`} {...input} />
        {trailing}
      </div>
      {error && <p id={`${id}-error`} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PasswordField(props: { label: string; value: string; onChange: (v: string) => void; error?: string | undefined;
  autoComplete: string; labelAside?: ReactNode; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <TextField label={props.label} icon={LockKeyhole} type={show ? 'text' : 'password'} value={props.value}
      onChange={(e) => props.onChange(e.target.value)} error={props.error} autoComplete={props.autoComplete}
      placeholder={props.placeholder ?? 'Your password'} labelAside={props.labelAside} required
      trailing={<button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-2.5 text-muted-foreground" aria-label="Toggle password visibility">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>} />
  );
}

function SubmitButton({ busy, children, busyLabel }: { busy: boolean; children: ReactNode; busyLabel: string }) {
  return (
    <Button type="submit" disabled={busy} className="mt-2 h-11">
      {busy && <Loader2 className="animate-spin" />}{busy ? busyLabel : children}
    </Button>
  );
}

/* ----------------------------------------------------------------------- login */

function LoginForm({ redirect }: { redirect?: string | undefined }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);
  const target = safeRedirectPath(redirect) ?? '/dashboard';

  // Already signed in (or just signed in): go straight on.
  useEffect(() => {
    if (auth.status === 'signed-in') void navigate({ to: target, replace: true });
  }, [auth.status, navigate, target]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = signInSchema.safeParse({ email, password, remember });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({}); setFormError(null); setResent(false); setBusy(true);
    const result = await signIn(parsed.data);
    setBusy(false);
    if (!result.ok) setFormError(result.error);
    // On success the auth listener loads the account and the effect above redirects.
  }

  const unconfirmed = formError?.startsWith('Please confirm your email');

  return (
    <form className="mt-8 grid gap-5" onSubmit={submit} noValidate>
      <TextField label="Email address" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com"
        value={email} onChange={(e) => setEmail(e.target.value)} error={errors['email']} required />
      <div className="grid gap-2">
        <PasswordField label="Password" value={password} onChange={setPassword} error={errors['password']} autoComplete="current-password"
          labelAside={<Link to="/forgot-password" className="text-xs text-primary">Forgot password?</Link>} />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />Remember me
        </label>
      </div>
      {formError && (
        <FormAlert>
          {formError}
          {unconfirmed && !resent && (
            <button type="button" className="ml-1 font-medium underline"
              onClick={async () => { const r = await resendConfirmation(email.trim().toLowerCase()); if (r.ok) setResent(true); else setFormError(r.error); }}>
              Resend the link
            </button>
          )}
        </FormAlert>
      )}
      {resent && <FormAlert tone="success">We’ve sent a new confirmation link to {email}.</FormAlert>}
      <SubmitButton busy={busy || auth.status === 'signed-in'} busyLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------------- register */

type RegisterStep = { step: 'role' } | { step: 'details'; accountType: SelfServiceAccountType } | { step: 'check-email'; email: string };

function RegisterFlow({ onHeading }: { onHeading: (h: [string, string] | null) => void }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<RegisterStep>({ step: 'role' });

  useEffect(() => {
    if (auth.status === 'signed-in') void navigate({ to: '/dashboard', replace: true });
  }, [auth.status, navigate]);

  useEffect(() => {
    if (state.step === 'details') onHeading(['Create your Caryandi account', `You’re signing up as a ${ACCOUNT_TYPE_LABELS[state.accountType].toLowerCase()}.`]);
    else if (state.step === 'check-email') onHeading(['Check your email', 'One more step to activate your account.']);
    else onHeading(null);
  }, [state, onHeading]);

  if (state.step === 'role') return <RolePicker onContinue={(accountType) => setState({ step: 'details', accountType })} />;
  if (state.step === 'check-email') return <CheckEmail email={state.email} />;
  return <RegisterForm accountType={state.accountType} onBack={() => setState({ step: 'role' })}
    onNeedsConfirmation={(email) => setState({ step: 'check-email', email })} />;
}

function RolePicker({ onContinue }: { onContinue: (type: SelfServiceAccountType) => void }) {
  const [selected, setSelected] = useState('buyer');
  const selectedType = fromUiRole(selected);
  return (
    <div className="mt-7">
      <div className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2" role="radiogroup" aria-label="Account type">
        {roles.map((r) => (
          <button key={r.id} type="button" role="radio" aria-checked={selected === r.id} onClick={() => setSelected(r.id)}
            className={`rounded-lg border p-3 text-left transition-colors ${selected === r.id ? 'border-primary bg-accent' : 'hover:border-primary/40'}`}>
            <span className="flex items-center gap-2 font-semibold">
              {r.id === 'buyer' ? <UserRound className="size-4" /> : r.id.includes('seller') ? <Car className="size-4" /> : <ShieldCheck className="size-4" />}{r.label}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{r.description}</span>
          </button>
        ))}
      </div>
      <Button className="mt-5 h-11 w-full" disabled={!selectedType} onClick={() => selectedType && onContinue(selectedType)}>
        Continue as {roles.find((r) => r.id === selected)?.label}
      </Button>
    </div>
  );
}

function RegisterForm({ accountType, onBack, onNeedsConfirmation }: {
  accountType: SelfServiceAccountType; onBack: () => void; onNeedsConfirmation: (email: string) => void;
}) {
  const [values, setValues] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const isBusiness = accountType !== 'buyer' && accountType !== 'private_seller';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = signUpSchema.safeParse({ ...values, accountType, acceptTerms });
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({}); setFormError(null); setBusy(true);
    const result = await signUp(parsed.data);
    setBusy(false);
    if (!result.ok) { setFormError(result.error); return; }
    if (result.data.needsEmailConfirmation) onNeedsConfirmation(parsed.data.email);
    // Otherwise the new session signs them in and RegisterFlow redirects to the dashboard.
  }

  return (
    <form className="mt-7 grid gap-4" onSubmit={submit} noValidate>
      <button type="button" onClick={onBack} className="inline-flex w-fit items-center gap-1 text-sm text-primary">
        <ArrowLeft className="size-4" />Change account type
      </button>
      <TextField label={isBusiness ? 'Your full name (account owner)' : 'Full name'} icon={UserRound} autoComplete="name"
        placeholder="e.g. Mulenga Banda" value={values.fullName} onChange={set('fullName')} error={errors['fullName']} required />
      <TextField label="Email address" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com"
        value={values.email} onChange={set('email')} error={errors['email']} required />
      <TextField label="Phone number" icon={Phone} type="tel" autoComplete="tel" placeholder="e.g. 097 123 4567"
        value={values.phone} onChange={set('phone')} error={errors['phone']} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField label="Password" value={values.password} onChange={(v) => setValues((s) => ({ ...s, password: v }))}
          error={errors['password']} autoComplete="new-password" placeholder="At least 8 characters" />
        <PasswordField label="Confirm password" value={values.confirmPassword} onChange={(v) => setValues((s) => ({ ...s, confirmPassword: v }))}
          error={errors['confirmPassword']} autoComplete="new-password" placeholder="Repeat password" />
      </div>
      {isBusiness && <p className="text-xs text-muted-foreground">You’ll add your business name, location and contact details from your dashboard after signing up.</p>}
      <div className="grid gap-1">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox className="mt-0.5" checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(v === true)} aria-invalid={Boolean(errors['acceptTerms'])} />
          <span>I am 18 or older and I agree to the <Link to="/terms" target="_blank" className="font-medium text-primary hover:underline">Terms of Use</Link> and <Link to="/privacy" target="_blank" className="font-medium text-primary hover:underline">Privacy Policy</Link>.</span>
        </label>
        {errors['acceptTerms'] && <p className="text-xs text-destructive">{errors['acceptTerms']}</p>}
      </div>
      {formError && <FormAlert>{formError}</FormAlert>}
      <SubmitButton busy={busy} busyLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}

function CheckEmail({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-8 grid gap-4">
      <div className="flex gap-3 rounded-lg border bg-success/5 p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
        <p className="text-sm">We’ve sent a confirmation link to <b>{email}</b>. Open it on this device to activate your account, then you’ll be signed in.</p>
      </div>
      <p className="text-sm text-muted-foreground">Can’t find it? Check your spam folder.</p>
      {error && <FormAlert>{error}</FormAlert>}
      <Button variant="outline" className="h-11" disabled={status !== 'idle'}
        onClick={async () => { setStatus('sending'); const r = await resendConfirmation(email); if (r.ok) setStatus('sent'); else { setError(r.error); setStatus('idle'); } }}>
        {status === 'sent' ? 'Link sent again' : status === 'sending' ? 'Sending…' : 'Resend confirmation email'}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------- forgot / reset */

function ForgotForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) { setError(fieldErrors(parsed.error)['email']); return; }
    setError(undefined); setFormError(null); setBusy(true);
    const result = await requestPasswordReset(parsed.data.email);
    setBusy(false);
    if (result.ok) setSentTo(parsed.data.email); else setFormError(result.error);
  }

  if (sentTo) {
    return (
      <div className="mt-8 grid gap-4">
        <FormAlert tone="success">If an account exists for {sentTo}, we’ve emailed a link to reset the password. The link expires after one hour.</FormAlert>
      </div>
    );
  }
  return (
    <form className="mt-8 grid gap-5" onSubmit={submit} noValidate>
      <TextField label="Email address" icon={Mail} type="email" autoComplete="email" placeholder="you@example.com"
        value={email} onChange={(e) => setEmail(e.target.value)} error={error} required />
      {formError && <FormAlert>{formError}</FormAlert>}
      <SubmitButton busy={busy} busyLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

function ResetForm() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (auth.status === 'loading') {
    return <p className="mt-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Checking your reset link…</p>;
  }
  if (auth.status === 'signed-out') {
    return (
      <div className="mt-8 grid gap-4">
        <FormAlert>This reset link is invalid or has expired.</FormAlert>
        <Button asChild className="h-11"><Link to="/forgot-password">Request a new link</Link></Button>
      </div>
    );
  }
  if (done) {
    return (
      <div className="mt-8 grid gap-4">
        <FormAlert tone="success">Your password has been updated.</FormAlert>
        <Button className="h-11" onClick={() => void navigate({ to: '/dashboard' })}>Go to your dashboard</Button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = newPasswordSchema.safeParse(values);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({}); setFormError(null); setBusy(true);
    const result = await updatePassword(parsed.data.password);
    setBusy(false);
    if (result.ok) setDone(true); else setFormError(result.error);
  }

  return (
    <form className="mt-8 grid gap-5" onSubmit={submit} noValidate>
      <PasswordField label="New password" value={values.password} onChange={(v) => setValues((s) => ({ ...s, password: v }))}
        error={errors['password']} autoComplete="new-password" placeholder="At least 8 characters" />
      <PasswordField label="Confirm new password" value={values.confirmPassword} onChange={(v) => setValues((s) => ({ ...s, confirmPassword: v }))}
        error={errors['confirmPassword']} autoComplete="new-password" placeholder="Repeat password" />
      {formError && <FormAlert>{formError}</FormAlert>}
      <SubmitButton busy={busy} busyLabel="Saving…">Save new password</SubmitButton>
    </form>
  );
}
