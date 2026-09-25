import {createFileRoute} from '@tanstack/react-router'; import {ProfileDetail,type ProviderRouteData} from '@/components/caryandi/detail-pages';
import {getProviderPage,PROVIDER_TYPE_LABELS} from '@/lib/directory/provider-service'; import {publicStorageUrl} from '@/lib/storage/images';
const FALLBACK={title:'Automotive Service Profile — Caryandi',description:'View services, availability, pricing and customer reviews.'};
export const Route=createFileRoute('/services/$serviceId')({
  loader:async({params}):Promise<ProviderRouteData>=>{try{return {page:await getProviderPage('services',params.serviceId)}}catch(e){return {page:null,error:e instanceof Error?e.message:'We couldn’t load this profile.'}}},
  head:({loaderData})=>{const p=loaderData?.page?.provider; if(!p) return {meta:[{title:FALLBACK.title},{name:'description',content:FALLBACK.description},{property:'og:title',content:FALLBACK.title},{property:'og:description',content:FALLBACK.description},{property:'og:type',content:'profile'},{name:'twitter:card',content:'summary_large_image'}]};
    const kind=PROVIDER_TYPE_LABELS[p.business_type??'']??'Service provider'; const top=(p.service_names??[]).slice(0,3).join(', ');
    const description=`${p.name} — ${kind.toLowerCase()}${p.city?` in ${p.city}`:''}${top?`. ${top}`:''}. Prices, opening hours and reviews on Caryandi.`;
    const image=publicStorageUrl('business-media',p.cover_path??p.logo_path);
    return {meta:[{title:`${p.name} — ${kind} | Caryandi`},{name:'description',content:description},{property:'og:title',content:`${p.name} on Caryandi`},{property:'og:description',content:description},{property:'og:type',content:'profile'},...(image?[{property:'og:image',content:image}]:[]),{name:'twitter:card',content:'summary'}]};},
  component:ServiceRoute});
function ServiceRoute(){const {serviceId}=Route.useParams(); const data=Route.useLoaderData(); return <ProfileDetail key={serviceId} kind="services" data={data}/>}
