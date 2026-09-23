import {createFileRoute} from '@tanstack/react-router'; import {SellerProfile,type SellerRouteData} from '@/components/caryandi/seller-profile';
import {getSellerPage,SELLER_TYPE_LABELS} from '@/lib/marketplace/seller-service'; import {publicStorageUrl} from '@/lib/storage/images';
const FALLBACK={title:'Seller Profile — Caryandi',description:'View vehicle inventory, seller verification and customer reviews.'};
export const Route=createFileRoute('/sellers/$sellerId')({
  loader:async({params}):Promise<SellerRouteData>=>{try{return {page:await getSellerPage(params.sellerId)}}catch(e){return {page:null,error:e instanceof Error?e.message:'We couldn’t load this seller.'}}},
  head:({loaderData})=>{const s=loaderData?.page?.seller; if(!s) return {meta:[{title:FALLBACK.title},{name:'description',content:FALLBACK.description},{property:'og:title',content:FALLBACK.title},{property:'og:description',content:FALLBACK.description},{property:'og:type',content:'profile'},{name:'twitter:card',content:'summary_large_image'}]};
    const kind=SELLER_TYPE_LABELS[s.seller_type??'']??'Seller'; const count=s.active_vehicle_count??0;
    const description=`${s.name} — ${kind.toLowerCase()}${s.city?` in ${s.city}`:''} with ${count} ${count===1?'vehicle':'vehicles'} for sale on Caryandi.`;
    const image=publicStorageUrl(s.seller_kind==='business'?'business-media':'avatars',s.image_path);
    return {meta:[{title:`${s.name} — ${kind} | Caryandi`},{name:'description',content:description},{property:'og:title',content:`${s.name} on Caryandi`},{property:'og:description',content:description},{property:'og:type',content:'profile'},...(image?[{property:'og:image',content:image}]:[]),{name:'twitter:card',content:'summary'}]};},
  component:SellerRoute});
function SellerRoute(){const {sellerId}=Route.useParams(); const data=Route.useLoaderData(); return <SellerProfile key={sellerId} data={data}/>}
