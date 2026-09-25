import {createFileRoute} from '@tanstack/react-router'; import {ProvidersDirectory} from '@/components/caryandi/listing-pages';
import {listProviders,parseProviderFilters,type Provider,type ProviderFilters} from '@/lib/directory/provider-service';
export const Route=createFileRoute('/services/')({
  validateSearch:(search:Record<string,unknown>):ProviderFilters=>parseProviderFilters(search),
  loaderDeps:({search})=>search,
  loader:async({deps}):Promise<{providers:Provider[]|null;error?:string}>=>{try{return {providers:await listProviders('services',deps)}}catch(e){return {providers:null,error:e instanceof Error?e.message:'We couldn’t load service providers right now.'}}},
  head:()=>({meta:[{title:'Mechanics & Vehicle Servicing — Caryandi'},{name:'description',content:'Compare mechanics and servicing companies across Zambia.'},{property:'og:title',content:'Mechanics & Vehicle Servicing — Caryandi'},{property:'og:description',content:'Compare mechanics and servicing companies across Zambia.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:ServicesRoute});
function ServicesRoute(){const search=Route.useSearch(); const {providers,error}=Route.useLoaderData(); return <ProvidersDirectory kind="services" search={search} providers={providers} {...(error?{error}:{})}/>}
