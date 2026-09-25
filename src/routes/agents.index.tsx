import {createFileRoute} from '@tanstack/react-router'; import {ProvidersDirectory} from '@/components/caryandi/listing-pages';
import {listProviders,parseProviderFilters,type Provider,type ProviderFilters} from '@/lib/directory/provider-service';
export const Route=createFileRoute('/agents/')({
  validateSearch:(search:Record<string,unknown>):ProviderFilters=>{const {mobile:_,...rest}=parseProviderFilters(search); return rest;},
  loaderDeps:({search})=>search,
  loader:async({deps}):Promise<{providers:Provider[]|null;error?:string}>=>{try{return {providers:await listProviders('agents',deps)}}catch(e){return {providers:null,error:e instanceof Error?e.message:'We couldn’t load import agents right now.'}}},
  head:()=>({meta:[{title:'Vehicle Import Agents — Caryandi Zambia'},{name:'description',content:'Compare vehicle import routes, services, pricing and verified agents.'},{property:'og:title',content:'Vehicle Import Agents — Caryandi Zambia'},{property:'og:description',content:'Compare vehicle import routes, services, pricing and verified agents.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:AgentsRoute});
function AgentsRoute(){const search=Route.useSearch(); const {providers,error}=Route.useLoaderData(); return <ProvidersDirectory kind="agents" search={search} providers={providers} {...(error?{error}:{})}/>}
