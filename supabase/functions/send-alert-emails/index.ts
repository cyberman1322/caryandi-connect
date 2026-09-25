// Caryandi · send-alert-emails (Supabase Edge Function, Deno)
//
// Sends the e-mails queued in public.email_outbox (e.g. urgent scam reports)
// through a configurable provider. No provider or key is hardcoded: everything
// comes from the function's secrets.
//
// Required secrets (Supabase dashboard → Edge Functions → Secrets):
//   EMAIL_PROVIDER   resend | sendgrid | postmark
//   EMAIL_API_KEY    the provider's API key
//   EMAIL_FROM       verified sender, e.g. "Caryandi Alerts <alerts@caryandi.co.zm>"
//   ALERTS_EMAIL     where platform alerts go (comma-separated for several)
//   CRON_SECRET      shared secret the scheduler/webhook sends as  x-cron-secret
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// Run it every few minutes with a Supabase Cron job (pg_cron + pg_net) or a
// Database Webhook on email_outbox inserts, sending the x-cron-secret header.

import { createClient } from 'npm:@supabase/supabase-js@2';

type OutboxRow = { id: string; to_email: string | null; subject: string; body_text: string };
type Email = { to: string[]; subject: string; text: string };

const env = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
};

async function send(email: Email): Promise<void> {
  const provider = env('EMAIL_PROVIDER').toLowerCase();
  const key = env('EMAIL_API_KEY');
  const from = env('EMAIL_FROM');
  let res: Response;
  if (provider === 'resend') {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text }),
    });
  } else if (provider === 'sendgrid') {
    const match = /^(.*)<(.+)>$/.exec(from);
    res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: email.to.map((e) => ({ email: e })) }],
        from: match ? { name: match[1]?.trim(), email: match[2] } : { email: from },
        subject: email.subject,
        content: [{ type: 'text/plain', value: email.text }],
      }),
    });
  } else if (provider === 'postmark') {
    res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'X-Postmark-Server-Token': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ From: from, To: email.to.join(','), Subject: email.subject, TextBody: email.text }),
    });
  } else {
    throw new Error(`Unknown EMAIL_PROVIDER: ${provider}`);
  }
  if (!res.ok) throw new Error(`${provider} responded ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response('Forbidden', { status: 403 });
  }

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const alerts = env('ALERTS_EMAIL').split(',').map((s) => s.trim()).filter(Boolean);

  const { data, error } = await supabase.rpc('claim_email_batch', { p_limit: 20 });
  if (error) return new Response(`Queue error: ${error.message}`, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as OutboxRow[]) {
    try {
      await send({ to: row.to_email ? [row.to_email] : alerts, subject: row.subject, text: row.body_text });
      await supabase.rpc('complete_email', { p_id: row.id, p_sent: true });
      sent += 1;
    } catch (e) {
      await supabase.rpc('complete_email', { p_id: row.id, p_sent: false, p_error: e instanceof Error ? e.message : String(e) });
      failed += 1;
    }
  }
  return Response.json({ sent, failed });
});
