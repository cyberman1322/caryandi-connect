import {createFileRoute} from '@tanstack/react-router'; import {HomePage} from '@/components/caryandi/home-page'; import {getLatestVehicles,type VehicleCardData} from '@/lib/vehicles/vehicle-service';
export const Route=createFileRoute('/')({
  loader:async():Promise<{latest:VehicleCardData[]|null}>=>{try{return {latest:await getLatestVehicles(8)}}catch{return {latest:null}}},
  head:()=>({meta:[{title:'Caryandi Zambia — Vehicles, Parts & Automotive Services'},{name:'description',content:'Find vehicles, trusted sellers, mechanics, parts and import support across Zambia.'},{property:'og:title',content:'Caryandi Zambia Automotive Marketplace'},{property:'og:description',content:'Find vehicles, trusted sellers, mechanics, parts and import support across Zambia.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:HomeRoute});
function HomeRoute(){const {latest}=Route.useLoaderData(); return <HomePage latest={latest}/>}
