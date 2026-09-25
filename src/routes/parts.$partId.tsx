import {createFileRoute} from '@tanstack/react-router'; import {PartDetail,type PartRouteData} from '@/components/caryandi/detail-pages';
import {getPartPage} from '@/lib/parts/parts-service'; import {publicStorageUrl} from '@/lib/storage/images'; import {formatPrice} from '@/lib/vehicles/vehicle-options';
const FALLBACK={title:'Part Details — Caryandi',description:'View automotive part condition, price, compatibility and seller information.'};
export const Route=createFileRoute('/parts/$partId')({
  loader:async({params}):Promise<PartRouteData>=>{try{return {page:await getPartPage(params.partId)}}catch(e){return {page:null,error:e instanceof Error?e.message:'We couldn’t load this part.'}}},
  head:({loaderData})=>{const page=loaderData?.page; const p=page?.part; if(!page||!p) return {meta:[{title:FALLBACK.title},{name:'description',content:FALLBACK.description},{property:'og:title',content:FALLBACK.title},{property:'og:description',content:FALLBACK.description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]};
    const title=`${p.title} — ${formatPrice(p.price)} | Caryandi`; const description=`${p.title}${p.city?` in ${p.city}`:''} for ${formatPrice(p.price)}.${p.compatibility_note?` Fits: ${p.compatibility_note.slice(0,120)}`:''}`;
    const image=publicStorageUrl('part-images',page.images[0]?.storage_path);
    return {meta:[{title},{name:'description',content:description},{property:'og:title',content:title},{property:'og:description',content:description},{property:'og:type',content:'website'},...(image?[{property:'og:image',content:image}]:[]),{name:'twitter:card',content:image?'summary_large_image':'summary'},...(p.listing_status==='active'?[]:[{name:'robots',content:'noindex'}])]};},
  component:PartRoute});
function PartRoute(){const {partId}=Route.useParams(); const data=Route.useLoaderData(); return <PartDetail key={partId} data={data}/>}
