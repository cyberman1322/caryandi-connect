import { Link } from '@tanstack/react-router'; import { Heart, MapPin, Star, ShieldCheck, Gauge, Fuel, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button'; import { Badge } from '@/components/ui/badge'; import { ServiceImage, ListingPhoto, SellerImage } from './media'; import type {DirectoryItem,Part} from '@/data/mock-data';
import type { VehicleCardData } from '@/lib/vehicles/vehicle-service'; import { FUEL_TYPES, PROVINCES, TRANSMISSIONS, formatMileage, formatPrice, labelOf, vehicleTitle } from '@/lib/vehicles/vehicle-options'; import { SELLER_TYPE_LABELS, sellerParam, type SellerSummary } from '@/lib/marketplace/seller-service';
export function Rating({value,count}:{value:number;count:number}){return <span className="inline-flex items-center gap-1 text-sm"><Star className="size-4 fill-warning text-warning"/><b>{Number.isInteger(value)?value:value.toFixed(1)}</b><span className="text-muted-foreground">({count})</span></span>}
export function VerifiedBadge(){return <Badge variant="secondary" className="gap-1 text-primary"><ShieldCheck className="size-3.5"/> Verified</Badge>}
/** Listing card for real marketplace data. */
export function VehicleCard({v,saved,onSave}:{v:VehicleCardData;saved?:boolean;onSave?:()=>void}){
  const id=v.id??'';
  const title=vehicleTitle({make:v.make,model:v.model,variant:v.variant});
  const location=[v.city,labelOf(PROVINCES,v.province)].filter(x=>x&&x!=='—').join(', ');
  return <article className="group overflow-hidden rounded-lg border bg-card shadow-xs">
    <div className="relative">
      <Link to="/vehicles/$vehicleId" params={{vehicleId:id}} className="block overflow-hidden">
        <ListingPhoto path={v.primary_image_path} alt={`${v.year??''} ${title}`.trim()} className="aspect-[4/3] w-full transition-transform duration-300 group-hover:scale-[1.02]"/>
      </Link>
      {onSave&&<Button variant="secondary" size="icon" onClick={onSave} className="absolute right-3 top-3 rounded-full" aria-label={saved?'Remove saved vehicle':'Save vehicle'} aria-pressed={saved}><Heart className={saved?'fill-primary text-primary':''}/></Button>}
      {v.listing_status==='sold'&&<span className="absolute left-3 top-3"><Badge>Sold</Badge></span>}
      {v.is_verified&&<span className="absolute bottom-3 left-3"><VerifiedBadge/></span>}
    </div>
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/vehicles/$vehicleId" params={{vehicleId:id}} className="font-semibold hover:text-primary"><h3 className="truncate">{title}</h3></Link>
          <p className="mt-1 text-xl font-bold">{formatPrice(v.price)}</p>
        </div>
        {v.year&&<Badge variant="outline">{v.year}</Badge>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-y py-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1"><Gauge className="size-3.5 shrink-0"/><span className="truncate">{v.mileage_km==null?'—':formatMileage(v.mileage_km)}</span></span>
        <span className="flex min-w-0 items-center gap-1"><Settings2 className="size-3.5 shrink-0"/><span className="truncate">{labelOf(TRANSMISSIONS,v.transmission)}</span></span>
        <span className="flex min-w-0 items-center gap-1"><Fuel className="size-3.5 shrink-0"/><span className="truncate">{labelOf(FUEL_TYPES,v.fuel_type)}</span></span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-sm">
        <span className="flex min-w-0 items-center gap-1 text-muted-foreground"><MapPin className="size-4 shrink-0"/><span className="truncate">{location||'Zambia'}</span></span>
        <span className="truncate font-medium">{v.seller_name}</span>
      </div>
    </div>
  </article>}

/** Dealer / private seller card for the sellers directory. */
export function SellerCard({s}:{s:SellerSummary}){
  const param=sellerParam(s);
  const location=[s.area,s.city,labelOf(PROVINCES,s.province)].filter(x=>x&&x!=='—').join(', ');
  const count=s.active_vehicle_count??0;
  return <article className="overflow-hidden rounded-lg border bg-card">
    <SellerImage kind={s.seller_kind} path={s.image_path} alt={s.name??'Seller'} className="aspect-[16/9] w-full"/>
    <div className="p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase text-primary">{SELLER_TYPE_LABELS[s.seller_type??'']??'Seller'}</p><h3 className="mt-1 truncate text-lg font-semibold">{s.name}</h3></div>
        {s.is_verified&&<VerifiedBadge/>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {(s.rating_count??0)>0?<Rating value={Number(s.rating_avg??0)} count={s.rating_count??0}/>:<span className="text-sm text-muted-foreground">No reviews yet</span>}
        <span className="text-sm font-semibold">{count} {count===1?'vehicle':'vehicles'}</span>
      </div>
      {s.about&&<p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{s.about}</p>}
      <p className="mt-4 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4 shrink-0"/><span className="truncate">{location||'Zambia'}</span></p>
      <Button className="mt-4 w-full" variant="outline" asChild><Link to="/sellers/$sellerId" params={{sellerId:param}}>View profile</Link></Button>
    </div>
  </article>}
export function DirectoryCard({item,kind='service'}:{item:DirectoryItem;kind?:'service'|'agent'}){const to=kind==='agent'?'/agents/$agentId':'/services/$serviceId'; const params=kind==='agent'?{agentId:item.id}:{serviceId:item.id}; return <article className="overflow-hidden rounded-lg border bg-card"><ServiceImage index={item.image} alt={item.name} className="aspect-[16/9]"/><div className="p-5"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase text-primary">{item.type}</p><h3 className="mt-1 text-lg font-semibold">{item.name}</h3></div>{item.verified&&<VerifiedBadge/>}</div><div className="mt-2 flex items-center justify-between"><Rating value={item.rating} count={item.reviews}/><span className="text-sm font-semibold">{item.price}</span></div><p className="mt-3 text-sm text-muted-foreground">{item.detail}</p><div className="mt-3 flex flex-wrap gap-1.5">{item.tags.map(t=><Badge key={t} variant="outline">{t}</Badge>)}</div><p className="mt-4 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4"/>{item.location}</p><Button className="mt-4 w-full" variant="outline" asChild><Link to={to as never} params={params as never}>View profile</Link></Button></div></article>}
export function PartCard({part}:{part:Part}){return <article className="overflow-hidden rounded-lg border bg-card"><ServiceImage index={part.image} alt={part.name} className="aspect-[4/3]"/><div className="p-4"><div className="flex justify-between"><Badge variant="outline">{part.condition}</Badge><span className="text-xs text-muted-foreground">{part.category}</span></div><Link to="/parts/$partId" params={{partId:part.id}}><h3 className="mt-3 font-semibold hover:text-primary">{part.name}</h3></Link><p className="mt-1 text-lg font-bold">K{part.price.toLocaleString()}</p><p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5"/>{part.location} · {part.seller}</p></div></article>}
