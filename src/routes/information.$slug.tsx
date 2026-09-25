import {createFileRoute} from '@tanstack/react-router'; import {InformationPage,type InformationData} from '@/components/caryandi/content-pages';
import {getPublishedArticle} from '@/lib/admin/admin-service';
const FALLBACK={title:'Automotive Guide — Caryandi Zambia',description:'Practical information for vehicle owners and buyers in Zambia.'};
export const Route=createFileRoute('/information/$slug')({
  loader:async({params}):Promise<InformationData>=>{try{return {articles:null,article:await getPublishedArticle(params.slug)}}catch{return {articles:null,article:null}}},
  head:({loaderData})=>{const a=loaderData?.article; const title=a?`${a.title} — Caryandi Zambia`:FALLBACK.title; const description=a?.summary??FALLBACK.description;
    return {meta:[{title},{name:'description',content:description},{property:'og:title',content:title},{property:'og:description',content:description},{property:'og:type',content:'article'},{name:'twitter:card',content:'summary_large_image'}]};},
  component:ArticleRoute});
function ArticleRoute(){const {slug}=Route.useParams(); const data=Route.useLoaderData(); return <InformationPage key={slug} slug={slug} data={data}/>}
