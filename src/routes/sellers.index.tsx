import {createFileRoute} from '@tanstack/react-router'; import {SellersDirectory} from '@/components/caryandi/listing-pages';
import {listSellers,type SellerSummary} from '@/lib/marketplace/seller-service'; import {PROVINCES,type Province} from '@/lib/vehicles/vehicle-options';
type SellersSearch={q?:string;province?:Province};
export const Route=createFileRoute('/sellers/')({
  validateSearch:(search:Record<string,unknown>):SellersSearch=>{const out:SellersSearch={}; const q=typeof search['q']==='string'?search['q'].trim().slice(0,80):''; if(q) out.q=q; const p=PROVINCES.find(([v])=>v===search['province'])?.[0]; if(p) out.province=p; return out;},
  loaderDeps:({search})=>search,
  loader:async({deps}):Promise<{sellers:SellerSummary[]|null;error?:string}>=>{try{return {sellers:await listSellers(deps)}}catch(e){return {sellers:null,error:e instanceof Error?e.message:'We couldn’t load sellers right now.'}}},
  head:()=>({meta:[{title:'Vehicle Sellers & Dealers — Caryandi'},{name:'description',content:'Browse dealer and private seller profiles in Zambia.'},{property:'og:title',content:'Vehicle Sellers & Dealers — Caryandi'},{property:'og:description',content:'Browse dealer and private seller profiles in Zambia.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:SellersRoute});
function SellersRoute(){const search=Route.useSearch(); const {sellers,error}=Route.useLoaderData(); return <SellersDirectory search={search} sellers={sellers} {...(error?{error}:{})}/>}
