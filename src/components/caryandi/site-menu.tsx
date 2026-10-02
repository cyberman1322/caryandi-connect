import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle, BookOpen, Car, CirclePlus, LayoutDashboard, LifeBuoy, LogIn, MapPinned, Menu, Package, Ship, Store, UserPlus, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/lib/auth/auth-context';
import { Brand } from './brand';

type Feature = { icon: LucideIcon; title: string; body: string; to: string };

/** Everything the site offers besides browsing cars. The home page stays cars-only; these live here. */
export const SITE_FEATURES: Feature[] = [
  { icon: Car, title: 'Vehicles', body: 'Search every car for sale', to: '/vehicles' },
  { icon: Store, title: 'Dealers & sellers', body: 'Browse dealerships and sellers', to: '/sellers' },
  { icon: Wrench, title: 'Mechanics & servicing', body: 'Compare skills, prices and reviews', to: '/services' },
  { icon: Package, title: 'Parts', body: 'Find automotive parts', to: '/parts' },
  { icon: Ship, title: 'Import agents', body: 'Import routes into Zambia', to: '/agents' },
  { icon: MapPinned, title: 'Near me', body: 'Services by location', to: '/locations' },
  { icon: BookOpen, title: 'Car information', body: 'Registration, duty and papers', to: '/information' },
  { icon: AlertTriangle, title: 'Warning lights', body: 'What dashboard symbols mean', to: '/warning-lights' },
  { icon: LifeBuoy, title: 'Help centre', body: 'Safety tips and support', to: '/help' },
];

/**
 * The site menu: a slide-out panel with every feature as a large, tappable tile.
 * Pass `trigger` to open it from somewhere other than the header button.
 */
export function SiteMenu({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const auth = useAuth();
  const close = () => setOpen(false);
  const row = 'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" className="gap-2 px-2.5" aria-label="Open menu">
            <Menu /><span className="hidden sm:inline">Menu</span>
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="left" className="flex w-[92%] flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle><Brand /></SheetTitle>
          <SheetDescription>Everything on My Car Zambia</SheetDescription>
        </SheetHeader>
        <nav aria-label="Features" className="mt-5 grid grid-cols-2 gap-2">
          {SITE_FEATURES.map(({ icon: Icon, title, body, to }) => (
            <Link key={to} to={to as never} onClick={close}
              className="group rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
              activeProps={{ className: 'border-primary/50 bg-accent/60' }}>
              <Icon className="size-6 text-primary" />
              <span className="mt-2 block text-sm font-semibold leading-tight">{title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{body}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-4 grid gap-1 border-t pt-4">
          <Link to="/dashboard/add-vehicle" onClick={close} className={`${row} text-primary`}><CirclePlus className="size-4" />Sell a car</Link>
          {auth.status === 'signed-in' ? (
            <Link to="/dashboard" onClick={close} className={row}><LayoutDashboard className="size-4" />My dashboard</Link>
          ) : (
            <>
              <Link to="/login" onClick={close} className={row}><LogIn className="size-4" />Sign in</Link>
              <Link to="/register" onClick={close} className={row}><UserPlus className="size-4" />Create account</Link>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
