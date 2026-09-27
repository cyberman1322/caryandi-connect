import {createFileRoute} from '@tanstack/react-router'; import {OAuthCallbackPage} from '@/components/caryandi/auth-return-pages';
const str=(v:unknown)=>typeof v==='string'&&v.length<=500?v:undefined;
export const Route=createFileRoute('/auth/callback')({validateSearch:(s:Record<string,unknown>):{error?:string}=>{const error=str(s['error_description'])??str(s['error']); return error?{error}:{}},head:()=>({meta:[{title:'Signing in — My Car Zambia'},{name:'robots',content:'noindex'}]}),component:CallbackRoute});
function CallbackRoute(){const {error}=Route.useSearch(); return <OAuthCallbackPage error={error}/>}
