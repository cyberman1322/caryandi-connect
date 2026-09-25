import {createFileRoute} from '@tanstack/react-router'; import {PartsDirectory,type PartsPageData} from '@/components/caryandi/listing-pages';
import {listPartCategories,parsePartFilters,searchParts,type PartFilters} from '@/lib/parts/parts-service';
export const Route=createFileRoute('/parts/')({
  validateSearch:(search:Record<string,unknown>):PartFilters=>parsePartFilters(search),
  loaderDeps:({search})=>search,
  loader:async({deps}):Promise<PartsPageData>=>{
    const categories=await listPartCategories().catch(()=>[]);
    try{return {result:await searchParts(deps),categories}}catch(e){return {result:null,categories,error:e instanceof Error?e.message:'We couldn’t load parts right now.'}}},
  head:()=>({meta:[{title:'Automotive Parts Marketplace — Caryandi'},{name:'description',content:'Find new, used and reconditioned vehicle parts in Zambia.'},{property:'og:title',content:'Automotive Parts Marketplace — Caryandi'},{property:'og:description',content:'Find new, used and reconditioned vehicle parts in Zambia.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:PartsRoute});
function PartsRoute(){const filters=Route.useSearch(); const data=Route.useLoaderData(); return <PartsDirectory filters={filters} data={data}/>}
