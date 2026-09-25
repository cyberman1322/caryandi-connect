import {createFileRoute} from '@tanstack/react-router'; import {HomePage} from '@/components/caryandi/home-page'; import {getLatestVehicles,type VehicleCardData} from '@/lib/vehicles/vehicle-service';
import {listProviders,type Provider} from '@/lib/directory/provider-service';
/** Up to two mechanics/servicing companies and one import agent; the section hides when there are none. */
async function featuredProviders():Promise<Provider[]>{const [services,agents]=await Promise.all([listProviders('services',{},2).catch(()=>[]),listProviders('agents',{},1).catch(()=>[])]); return [...services,...agents];}
export const Route=createFileRoute('/')({
  loader:async():Promise<{latest:VehicleCardData[]|null;providers:Provider[]}>=>{const [latest,providers]=await Promise.all([getLatestVehicles(8).catch(()=>null),featuredProviders()]); return {latest,providers};},
  head:()=>({meta:[{title:'Caryandi Zambia — Vehicles, Parts & Automotive Services'},{name:'description',content:'Find vehicles, trusted sellers, mechanics, parts and import support across Zambia.'},{property:'og:title',content:'Caryandi Zambia Automotive Marketplace'},{property:'og:description',content:'Find vehicles, trusted sellers, mechanics, parts and import support across Zambia.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:HomeRoute});
function HomeRoute(){const {latest,providers}=Route.useLoaderData(); return <HomePage latest={latest} providers={providers}/>}
