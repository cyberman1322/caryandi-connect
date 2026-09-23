import { useState } from 'react';
import { Flag, Loader2, MessageCircle, Phone, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth/auth-context';
import { useSignInRedirect } from '@/lib/marketplace/hooks';
import {
  REPORT_CATEGORIES, fileReport, formatPhone, getContact, whatsappLinkWithMessage,
  type ContactDetails, type ContactTarget, type ReportCategory, type ReportTarget,
} from '@/lib/marketplace/engagement-service';

/**
 * "Show contact": reveals the seller's phone and WhatsApp to signed-in users.
 * Each reveal is logged and rate-limited by the database, which is what keeps
 * sellers' numbers away from scrapers.
 */
export function ContactPanel({ target, id, whatsappMessage, label = 'Show contact details' }: { target: ContactTarget; id: string; whatsappMessage: string; label?: string }) {
  const auth = useAuth();
  const goToSignIn = useSignInRedirect();
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'loading' } | { kind: 'shown'; contact: ContactDetails } | { kind: 'error'; message: string }>({ kind: 'idle' });

  const reveal = async () => {
    if (auth.status === 'loading') return;
    if (auth.status !== 'signed-in') {
      toast('Sign in to contact sellers', { description: 'This keeps sellers’ numbers safe from spam.' });
      goToSignIn();
      return;
    }
    setState({ kind: 'loading' });
    try {
      const contact = await getContact(target, id);
      setState(contact.phone || contact.whatsappLink ? { kind: 'shown', contact } : { kind: 'error', message: 'This seller hasn’t added contact details yet.' });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'We couldn’t load the contact details.' });
    }
  };

  if (state.kind === 'shown') {
    const { contact } = state;
    return (
      <div className="mt-5 grid gap-2">
        {contact.displayName && <p className="text-sm text-muted-foreground">Contact <b className="text-foreground">{contact.displayName}</b></p>}
        {contact.phone && (
          <Button asChild className="w-full"><a href={`tel:${contact.phone}`}><Phone />Call {formatPhone(contact.phone)}</a></Button>
        )}
        {contact.whatsappLink && (
          <Button asChild variant="outline" className="w-full">
            <a href={whatsappLinkWithMessage(contact.whatsappLink, whatsappMessage)} target="_blank" rel="noopener noreferrer"><MessageCircle />Message on WhatsApp</a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-2">
      <Button className="w-full" onClick={() => void reveal()} disabled={state.kind === 'loading'}>
        {state.kind === 'loading' ? <Loader2 className="animate-spin" /> : <Phone />}{label}
      </Button>
      {state.kind === 'error' && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    </div>
  );
}

/** Native share sheet on phones; copies the link elsewhere. */
export function ShareButton({ title, text }: { title: string; text?: string }) {
  const share = async () => {
    const url = window.location.href;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, ...(text ? { text } : {}), url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Couldn’t copy the link. Copy it from the address bar instead.');
    }
  };
  return <Button variant="ghost" size="icon" aria-label="Share" onClick={() => void share()}><Share2 /></Button>;
}

/** Report a listing or seller to the Caryandi team. */
export function ReportDialog({ target, id, subject }: { target: ReportTarget; id: string; subject: string }) {
  const auth = useAuth();
  const goToSignIn = useSignInRedirect();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>('scam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onOpenChange = (next: boolean) => {
    if (next && auth.status !== 'signed-in') {
      toast('Sign in to report a problem', { description: 'Reports are linked to an account so our team can follow up.' });
      goToSignIn();
      return;
    }
    setOpen(next);
    if (!next) setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await fileReport({ target, targetId: id, category, details });
      setOpen(false);
      setDetails('');
      toast.success('Thank you. Our team will review your report.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We couldn’t send your report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground"><Flag className="size-3.5" />Report this {target === 'vehicle' ? 'listing' : 'seller'}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {subject}</DialogTitle>
          <DialogDescription>Tell us what’s wrong. Reports are private — the seller won’t see who sent them.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>What’s the problem?</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ReportCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REPORT_CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="report-details">Details</Label>
            <Textarea id="report-details" rows={5} maxLength={3000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened? Include dates, amounts or messages if you can." />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || details.trim().length < 10}>{busy && <Loader2 className="animate-spin" />}Send report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
