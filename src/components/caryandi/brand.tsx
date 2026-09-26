import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

/** The brand colour stays fixed (it doesn't follow the light/dark theme). */
export const BRAND_BLUE = '#186BEC';

/** My Car Zambia mark: a forward-pointing "C" (for Car) on a blue tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill={BRAND_BLUE} />
      <path d="M41 19.5 A15.5 15.5 0 1 0 41 44.5" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
      <path d="M33 25 L41 32 L33 39" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2 font-extrabold tracking-tight text-foreground', className)} aria-label="My Car Zambia home">
      <LogoMark className="size-9 shrink-0" />
      {!compact && <span className="whitespace-nowrap text-lg sm:text-xl">My Car <span className="text-primary">Zambia</span></span>}
    </Link>
  );
}
