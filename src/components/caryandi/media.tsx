import { Car, Package, Ship, Store, UserRound, Wrench } from 'lucide-react';
import { publicStorageUrl } from '@/lib/storage/images';
import vehicleGrid from '@/assets/vehicle-grid.jpg';
import serviceGrid from '@/assets/service-grid.jpg';
const positions=['0% 0%','100% 0%','0% 100%','100% 100%'];
export function VehicleImage({index=0,className='',alt='Vehicle'}:{index?:number;className?:string;alt?:string}){return <div role="img" aria-label={alt} className={`bg-cover ${className}`} style={{backgroundImage:`url(${vehicleGrid})`,backgroundSize:'200% 200%',backgroundPosition:positions[index%4]}}/>}
export function ServiceImage({index=0,className='',alt='Automotive service'}:{index?:number;className?:string;alt?:string}){return <div role="img" aria-label={alt} className={`bg-cover ${className}`} style={{backgroundImage:`url(${serviceGrid})`,backgroundSize:'200% 200%',backgroundPosition:positions[index%4]}}/>}

/* ---- Real listing photos (Stage 3) ---- */

/** A seller's uploaded photo, or a neutral "no photo" tile — never a stock image that could mislead buyers. */
export function ListingPhoto({ path, alt, className = '', eager = false }: { path: string | null | undefined; alt: string; className?: string; eager?: boolean }) {
  const src = publicStorageUrl('vehicle-images', path);
  if (!src) {
    return (
      <div role="img" aria-label={`${alt} (no photo yet)`} className={`grid place-items-center bg-muted text-muted-foreground ${className}`}>
        <div className="text-center"><Car className="mx-auto size-8 opacity-60" /><span className="mt-1 block text-xs">No photo yet</span></div>
      </div>
    );
  }
  return <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className={`bg-muted object-cover ${className}`} />;
}

/** Dealer logo (business-media) or private seller avatar (avatars), with an icon fallback. */
export function SellerImage({ kind, path, alt, className = '' }: { kind: string | null | undefined; path: string | null | undefined; alt: string; className?: string }) {
  const src = publicStorageUrl(kind === 'business' ? 'business-media' : 'avatars', path);
  if (!src) {
    const Icon = kind === 'business' ? Store : UserRound;
    return <div role="img" aria-label={alt} className={`grid place-items-center bg-accent text-primary ${className}`}><Icon className="size-1/3 min-h-8 min-w-8" /></div>;
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={`bg-muted object-cover ${className}`} />;
}

/** A part seller's uploaded photo, or a neutral "no photo" tile. */
export function PartPhoto({ path, alt, className = '', eager = false }: { path: string | null | undefined; alt: string; className?: string; eager?: boolean }) {
  const src = publicStorageUrl('part-images', path);
  if (!src) {
    return (
      <div role="img" aria-label={`${alt} (no photo yet)`} className={`grid place-items-center bg-muted text-muted-foreground ${className}`}>
        <div className="text-center"><Package className="mx-auto size-8 opacity-60" /><span className="mt-1 block text-xs">No photo yet</span></div>
      </div>
    );
  }
  return <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" className={`bg-muted object-cover ${className}`} />;
}

/** Mechanic / servicing company / import agent cover or logo, with an icon fallback (never a stock photo). */
export function ProviderImage({ type, path, alt, className = '' }: { type: string | null | undefined; path: string | null | undefined; alt: string; className?: string }) {
  const src = publicStorageUrl('business-media', path);
  if (!src) {
    const Icon = type === 'import_agent' ? Ship : Wrench;
    return <div role="img" aria-label={alt} className={`grid place-items-center bg-accent text-primary ${className}`}><Icon className="size-1/4 min-h-8 min-w-8" /></div>;
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={`bg-muted object-cover ${className}`} />;
}
