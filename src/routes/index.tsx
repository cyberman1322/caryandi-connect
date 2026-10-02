import {createFileRoute} from '@tanstack/react-router'; import {HomePage,HOME_VEHICLE_COUNT} from '@/components/caryandi/home-page'; import {getLatestVehicles,type VehicleCardData} from '@/lib/vehicles/vehicle-service';
export const Route=createFileRoute('/')({
  loader:async():Promise<{latest:VehicleCardData[]|null}>=>({latest:await getLatestVehicles(HOME_VEHICLE_COUNT).catch(()=>null)}),
  head:()=>({meta:[{title:'My Car Zambia — Cars for Sale in Zambia'},{name:'description',content:'Browse the latest cars for sale across Zambia, plus trusted sellers, mechanics, parts and import support.'},{property:'og:title',content:'My Car Zambia — Cars for Sale in Zambia'},{property:'og:description',content:'Browse the latest cars for sale across Zambia, plus trusted sellers, mechanics, parts and import support.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:HomeRoute});
function HomeRoute(){const {latest}=Route.useLoaderData(); return <HomePage latest={latest}/>}
