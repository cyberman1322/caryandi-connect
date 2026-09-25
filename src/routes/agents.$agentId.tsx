import {createFileRoute} from '@tanstack/react-router'; import {ProfileDetail,type ProviderRouteData} from '@/components/caryandi/detail-pages';
import {getProviderPage} from '@/lib/directory/provider-service'; import {publicStorageUrl} from '@/lib/storage/images';
const FALLBACK={title:'Import Agent Profile — Caryandi',description:'View routes, services, pricing and reviews for a vehicle import agent.'};
export const Route=createFileRoute('/agents/$agentId')({
  loader:async({params}):Promise<ProviderRouteData>=>{try{return {page:await getProviderPage('agents',params.agentId)}}catch(e){return {page:null,error:e instanceof Error?e.message:'We couldn’t load this profile.'}}},
  head:({loaderData})=>{const p=loaderData?.page?.provider; if(!p) return {meta:[{title:FALLBACK.title},{name:'description',content:FALLBACK.description},{property:'og:title',content:FALLBACK.title},{property:'og:description',content:FALLBACK.description},{property:'og:type',content:'profile'},{name:'twitter:card',content:'summary_large_image'}]};
    const routes=(p.route_labels??[]).slice(0,3).join('; ');
    const description=`${p.name} — vehicle import agent${p.city?` in ${p.city}`:''}${routes?`. Routes: ${routes}`:''}. Prices and reviews on Caryandi.`;
    const image=publicStorageUrl('business-media',p.cover_path??p.logo_path);
    return {meta:[{title:`${p.name} — Import agent | Caryandi`},{name:'description',content:description},{property:'og:title',content:`${p.name} on Caryandi`},{property:'og:description',content:description},{property:'og:type',content:'profile'},...(image?[{property:'og:image',content:image}]:[]),{name:'twitter:card',content:'summary'}]};},
  component:AgentRoute});
function AgentRoute(){const {agentId}=Route.useParams(); const data=Route.useLoaderData(); return <ProfileDetail key={agentId} kind="agents" data={data}/>}
