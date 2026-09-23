import {createFileRoute} from '@tanstack/react-router'; import {VehiclesPage,type VehiclesPageData} from '@/components/caryandi/listing-pages';
import {parseVehicleFilters} from '@/lib/vehicles/filters'; import {searchVehicles} from '@/lib/vehicles/vehicle-service';
export const Route=createFileRoute('/vehicles/')({
  validateSearch:(search:Record<string,unknown>)=>parseVehicleFilters(search),
  loaderDeps:({search})=>search,
  // Runs on the server for the first page load (fast first paint, indexable) and in the browser afterwards.
  loader:async({deps}):Promise<VehiclesPageData>=>{try{return {result:await searchVehicles(deps)}}catch(e){return {result:null,error:e instanceof Error?e.message:'We couldn’t load vehicles right now.'}}},
  head:()=>({meta:[{title:'Vehicles for Sale in Zambia — Caryandi'},{name:'description',content:'Search dealer and private vehicle listings across Zambia.'},{property:'og:title',content:'Vehicles for Sale in Zambia — Caryandi'},{property:'og:description',content:'Search dealer and private vehicle listings across Zambia.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:VehiclesRoute});
function VehiclesRoute(){const filters=Route.useSearch(); const data=Route.useLoaderData(); return <VehiclesPage filters={filters} data={data}/>}
