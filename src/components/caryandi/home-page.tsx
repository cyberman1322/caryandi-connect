import {Link} from '@tanstack/react-router';
import {ArrowRight,LayoutGrid} from 'lucide-react';
import hero from '@/assets/caryandi-hero.webp';
import heroSmall from '@/assets/caryandi-hero-1024.webp';
import {Button} from '@/components/ui/button';
import {SearchBar} from './public-shell';
import {VehicleCard} from './cards';
import {SiteMenu} from './site-menu';
import {useFavourites} from '@/lib/marketplace/hooks';
import type {VehicleCardData} from '@/lib/vehicles/vehicle-service';

/** How many of the newest cars the home page shows. */
export const HOME_VEHICLE_COUNT=24;

/** Home page: a short search header, then cars. Everything else (services, parts, import agents,
 *  guides, warning lights…) lives in the site menu so the page stays about vehicles. */
export function HomePage({latest}:{latest:VehicleCardData[]|null}) {
  return <main>
    <section className="relative overflow-hidden bg-foreground">
      <picture><source media="(max-width: 767px)" srcSet={heroSmall} type="image/webp"/><img src={hero} width={1536} height={1024} alt="" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover object-center opacity-55"/></picture>
      <div className="absolute inset-0 bg-hero-overlay"/>
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-3xl font-bold leading-tight text-primary-foreground sm:text-5xl">Cars for sale in Zambia</h1>
        <p className="mt-2 max-w-xl text-sm text-primary-foreground/85 sm:text-base">Search by make, model, location and price.</p>
        <div className="mt-5 max-w-4xl"><SearchBar/></div>
      </div>
    </section>

    <section className="py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-2xl font-bold">Latest cars</h2><p className="mt-1 text-sm text-muted-foreground">Newly listed across Zambia</p></div>
          <div className="flex items-center gap-2">
            <SiteMenu trigger={<Button variant="outline" size="sm"><LayoutGrid/>Services, parts &amp; more</Button>}/>
            <Button size="sm" variant="ghost" className="text-primary" asChild><Link to="/vehicles">View all<ArrowRight/></Link></Button>
          </div>
        </div>
        <LatestVehicles items={latest}/>
      </div>
    </section>
  </main>;
}

/** Newest live listings (loaded on the server with the page). */
function LatestVehicles({items}:{items:VehicleCardData[]|null}){
  const {isSaved,toggle}=useFavourites();
  if(!items) return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">We couldn’t load the latest vehicles. <Link to="/vehicles" className="font-semibold text-primary">Browse all vehicles</Link></p>;
  if(!items.length) return <div className="rounded-lg border border-dashed p-10 text-center"><h3 className="font-semibold">No vehicles listed yet</h3><p className="mt-1 text-sm text-muted-foreground">Be one of the first sellers on My Car Zambia.</p><Button className="mt-4" asChild><Link to="/dashboard/add-vehicle">Sell a car</Link></Button></div>;
  return <>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map(v=><VehicleCard key={v.id} v={v} saved={isSaved(v.id)} onSave={()=>v.id&&toggle(v.id)}/>)}</div>
    {items.length>=HOME_VEHICLE_COUNT&&<div className="mt-8 text-center"><Button size="lg" asChild><Link to="/vehicles">See all vehicles<ArrowRight/></Link></Button></div>}
  </>;
}
