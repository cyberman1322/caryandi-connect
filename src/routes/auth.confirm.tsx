import {createFileRoute} from '@tanstack/react-router'; import {ConfirmEmailPage} from '@/components/caryandi/auth-return-pages';
const str=(v:unknown)=>typeof v==='string'&&v.length<=300?v:undefined;
export const Route=createFileRoute('/auth/confirm')({validateSearch:(s:Record<string,unknown>):{token_hash?:string;type?:string}=>{const token_hash=str(s['token_hash']); const type=str(s['type']); return {...(token_hash?{token_hash}:{}),...(type?{type}:{})}},head:()=>({meta:[{title:'Confirm your email — My Car Zambia'},{name:'robots',content:'noindex'}]}),component:ConfirmRoute});
function ConfirmRoute(){const {token_hash,type}=Route.useSearch(); return <ConfirmEmailPage tokenHash={token_hash} type={type}/>}
