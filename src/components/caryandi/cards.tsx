import { Link } from '@tanstack/react-router'; import { Heart, MapPin, Star, ShieldCheck, Gauge, Fuel, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button'; import { Badge } from '@/components/ui/badge'; import { ListingPhoto, PartPhoto, ProviderImage, SellerImage } from './media';
import type { VehicleCardData } from '@/lib/vehicles/vehicle-service'; import { FUEL_TYPES, PROVINCES, TRANSMISSIONS, formatMileage, formatPrice, labelOf, vehicleTitle } from '@/lib/vehicles/vehicle-options'; import { SELLER_TYPE_LABELS, sellerParam, type SellerSummary } from '@/lib/marketplace/seller-service';
import { PROVIDER_TYPE_LABELS, providerParam, type Provider } from '@/lib/directory/provider-service'; import { PART_CONDITIONS } from '@/lib/parts/validation'; import type { PartCardData } from '@/lib/parts/parts-service';
export function Rating({value,count}:{value:number;count:number}){return <span className="inline-flex items-center gap-1 text-sm"><Star className="size-4 fill-warning text-warning"/><b>{Number.isInteger(value)?value:value.toFixed(1)}</b><span className="text-muted-foreground">({count})</span></span>}
/** "Verified vehicle" = this car's documents were checked; "Verified dealer/business" = the business was checked. */
export function VerifiedBadge({label='Verified',subtle=false}:{label?:string;subtle?:boolean}){return <Badge variant={subtle?'outline':'secondary'} className={`gap-1 ${subtle?'bg-card text-foreground':'text-primary'}`}><ShieldCheck className="size-3.5"/> {label}</Badge>}
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
      {(v.is_verified||v.seller_is_verified)&&<span className="absolute bottom-3 left-3">{v.is_verified?<VerifiedBadge label="Verified vehicle"/>:<VerifiedBadge label="Verified dealer" subtle/>}</span>}
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
        {s.is_verified&&<VerifiedBadge label={s.seller_type==='dealer'?'Verified dealer':'Verified business'}/>}
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

/** Mechanic, servicing company or import agent card (real directory data). */
export function DirectoryCard({p}:{p:Provider}){
  const isAgent=p.business_type==='import_agent';
  const param=providerParam(p);
  const location=[p.area,p.city,labelOf(PROVINCES,p.province)].filter(x=>x&&x!=='—').join(', ');
  const from=p.price_from??(isAgent?p.min_route_price:p.min_service_price);
  const tags=(isAgent?p.route_labels:p.service_names)??[];
  const ratingCount=p.rating_count??0;
  return <article className="flex flex-col overflow-hidden rounded-lg border bg-card">
    <ProviderImage type={p.business_type} path={p.cover_path??p.logo_path} alt={p.name??'Service provider'} className="aspect-[16/9] w-full"/>
    <div className="flex flex-1 flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-xs font-semibold uppercase text-primary">{PROVIDER_TYPE_LABELS[p.business_type??'']??'Service provider'}</p><h3 className="mt-1 truncate text-lg font-semibold">{p.name}</h3></div>
        {p.is_verified&&<VerifiedBadge label="Verified business"/>}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {ratingCount>0?<Rating value={Number(p.rating_avg??0)} count={ratingCount}/>:<span className="text-sm text-muted-foreground">No reviews yet</span>}
        {from!=null&&<span className="text-sm font-semibold">From {formatPrice(from)}</span>}
      </div>
      {p.description&&<p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
      {(tags.length>0||p.is_mobile_service)&&<div className="mt-3 flex flex-wrap gap-1.5">{p.is_mobile_service&&<Badge variant="secondary">Comes to you</Badge>}{tags.slice(0,3).map(t=><Badge key={t} variant="outline" className="max-w-full truncate">{t}</Badge>)}</div>}
      <p className="mt-4 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="size-4 shrink-0"/><span className="truncate">{location||'Zambia'}</span></p>
      <div className="mt-auto pt-4"><Button className="w-full" variant="outline" asChild>{isAgent
        ?<Link to="/agents/$agentId" params={{agentId:param}}>View profile</Link>
        :<Link to="/services/$serviceId" params={{serviceId:param}}>View profile</Link>}</Button></div>
    </div>
  </article>}

/** Part listing card (real marketplace data). */
export function PartCard({part}:{part:PartCardData}){
  const id=part.id??'';
  const location=[part.city,labelOf(PROVINCES,part.province)].filter(x=>x&&x!=='—').join(', ');
  return <article className="overflow-hidden rounded-lg border bg-card">
    <Link to="/parts/$partId" params={{partId:id}} className="block overflow-hidden"><PartPhoto path={part.primary_image_path} alt={part.title??'Part'} className="aspect-[4/3] w-full"/></Link>
    <div className="p-4">
      <div className="flex justify-between gap-2"><Badge variant="outline">{labelOf(PART_CONDITIONS,part.condition)}</Badge><span className="truncate text-xs text-muted-foreground">{part.category_name}</span></div>
      <Link to="/parts/$partId" params={{partId:id}}><h3 className="mt-3 line-clamp-2 font-semibold hover:text-primary">{part.title}</h3></Link>
      <p className="mt-1 text-lg font-bold">{formatPrice(part.price)}</p>
      <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3.5 shrink-0"/><span className="truncate">{location||'Zambia'} · {part.seller_name}</span></p>
      {part.is_verified&&<div className="mt-2"><VerifiedBadge label="Verified seller" subtle/></div>}
    </div>
  </article>}
