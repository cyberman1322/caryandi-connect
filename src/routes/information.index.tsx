import {createFileRoute} from '@tanstack/react-router'; import {InformationPage,type InformationData} from '@/components/caryandi/content-pages';
import {listPublishedArticles} from '@/lib/admin/admin-service';
export const Route=createFileRoute('/information/')({
  loader:async():Promise<InformationData>=>{try{return {articles:await listPublishedArticles()}}catch{return {articles:null}}},
  head:()=>({meta:[{title:'Vehicle Information Guides — Caryandi Zambia'},{name:'description',content:'Read simple guides to vehicle registration, imports, duty and documents.'},{property:'og:title',content:'Vehicle Information Guides — Caryandi Zambia'},{property:'og:description',content:'Read simple guides to vehicle registration, imports, duty and documents.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]}),
  component:InformationRoute});
function InformationRoute(){const data=Route.useLoaderData(); return <InformationPage data={data}/>}
