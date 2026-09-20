import { useMemo, useState } from 'react';
import { vehicles } from '@/data/mock-data';
export function useVehicleSearch() {
 const [query,setQuery]=useState(''); const [sort,setSort]=useState('recommended');
 const results=useMemo(()=>{const q=query.toLowerCase(); const list=vehicles.filter(v=>`${v.name} ${v.location} ${v.fuel}`.toLowerCase().includes(q)); return [...list].sort((a,b)=>sort==='price-low'?a.price-b.price:sort==='newest'?b.year-a.year:0)},[query,sort]);
 return {query,setQuery,sort,setSort,results};
}
export function useMockAction(){ const [state,setState]=useState<'idle'|'loading'|'success'|'error'>('idle'); const run=(ok=true)=>{setState('loading'); window.setTimeout(()=>setState(ok?'success':'error'),650)}; return {state,run,reset:()=>setState('idle')}; }
export function useFavourites(){ const [saved,setSaved]=useState<string[]>(['honda-grace-2018']); const toggle=(id:string)=>setSaved(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]); return {saved,toggle}; }
