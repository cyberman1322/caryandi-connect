import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { PROVINCES, type Province } from '@/lib/vehicles/vehicle-options'; import { PRICE_BUCKETS } from '@/lib/vehicles/filters';
import { Bell, ChevronDown, Heart, Search, UserRound } from 'lucide-react';
import { Brand } from './brand'; import { Button } from '@/components/ui/button'; import { AccountMenu } from './account-menu'; import { useAuth } from '@/lib/auth/auth-context';
import { SiteMenu } from './site-menu';
/** Quick links on wide screens; every feature (these included) is in the site menu. */
const links=[['Vehicles','/vehicles'],['Dealers','/sellers'],['Services','/services'],['Parts','/parts']] as const;
export function PublicHeader(){const path=useRouterState({select:s=>s.location.pathname}); const auth=useAuth(); if(path.startsWith('/dashboard')||path.startsWith('/admin')||path==='/login'||path==='/register'||path==='/forgot-password'||path==='/reset-password') return null; return <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur"><div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6"><div className="flex min-w-0 items-center gap-1 lg:gap-3"><SiteMenu/><Brand compact className="lg:hidden"/><Brand className="hidden lg:inline-flex"/></div><nav className="hidden items-center justify-center gap-1 lg:flex">{links.map(([x,to])=><Link key={to} to={to} className={`rounded-md px-3 py-2 text-sm font-medium ${path.startsWith(to)?'bg-accent text-primary':'text-muted-foreground hover:text-foreground'}`}>{x}</Link>)}</nav><div className="flex items-center justify-end gap-1"><Button variant="ghost" size="icon" aria-label="Saved vehicles" asChild><Link to="/dashboard/saved"><Heart/></Link></Button><Button variant="ghost" size="icon" aria-label="Notifications" asChild><Link to="/dashboard/notifications"><Bell/></Link></Button>{auth.status==='signed-in'?<span className="hidden sm:inline-flex"><AccountMenu/></span>:<><Button variant="outline" className={`hidden sm:inline-flex ${auth.status==='loading'?'invisible':''}`} asChild><Link to="/login"><UserRound/> Sign in</Link></Button><Button variant="ghost" className={`hidden sm:inline-flex ${auth.status==='loading'?'invisible':''}`} asChild><Link to="/register">Create account</Link></Button></>}<Button asChild><Link to="/dashboard/add-vehicle">Sell a car</Link></Button></div></div></header>}
const footerLinks=[
  ['Marketplace',[['Vehicles','/vehicles'],['Parts','/parts'],['Services','/services']]],
  ['Support',[['Help centre','/help'],['Vehicle information','/information'],['Warning lights','/warning-lights']]],
  ['Legal',[['Terms of Use','/terms'],['Privacy Policy','/privacy'],['Cookie Policy','/cookies']]],
] as const;
export function Footer(){return <footer className="border-t bg-muted/40"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-4 sm:px-6"><div className="sm:col-span-1"><Brand/><p className="mt-3 text-sm text-muted-foreground">Zambia's practical marketplace for vehicles, parts and trusted automotive services.</p></div>{footerLinks.map(([h,items])=><div key={h}><h3 className="text-sm font-semibold">{h}</h3><div className="mt-3 grid gap-2 text-sm text-muted-foreground">{items.map(([label,to])=><Link key={label} to={to} className="w-fit hover:text-foreground">{label}</Link>)}</div></div>)}</div><div className="border-t py-4 text-center text-xs text-muted-foreground">© 2026 My Car Zambia · For users aged 18 and over.</div></footer>}
/** Quick vehicle search: sends the visitor to /vehicles with the chosen filters in the URL. */
export function SearchBar({compact=false}:{compact?:boolean}){
  const navigate=useNavigate();
  const [q,setQ]=useState(''); const [province,setProvince]=useState(''); const [maxPrice,setMaxPrice]=useState('');
  const submit=(e:FormEvent)=>{e.preventDefault(); const text=q.trim().slice(0,80); void navigate({to:'/vehicles',search:{...(text?{q:text}:{}),...(isProvince(province)?{province}:{}),...(maxPrice?{maxPrice:Number(maxPrice)}:{})}});};
  const selectClass='h-10 w-full appearance-none bg-transparent pl-3 pr-9 text-sm outline-none';
  return <form role="search" className={`grid gap-2 rounded-lg border bg-background p-2 shadow-sm ${compact?'sm:grid-cols-[1fr_auto]':'sm:grid-cols-[1.3fr_.8fr_.8fr_auto]'}`} onSubmit={submit}>
    <label className="flex min-w-0 items-center gap-2 px-3"><Search className="size-4 shrink-0 text-muted-foreground"/><input value={q} onChange={e=>setQ(e.target.value)} maxLength={80} aria-label="Search vehicles" className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search make, model or keyword"/></label>
    {!compact&&<>
      <div className="relative border-t sm:border-l sm:border-t-0"><select aria-label="Location" value={province} onChange={e=>setProvince(e.target.value)} className={selectClass}><option value="">Any location</option>{PROVINCES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 size-4"/></div>
      <div className="relative border-t sm:border-l sm:border-t-0"><select aria-label="Maximum price" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} className={selectClass}>{PRICE_BUCKETS.map(([v,l])=><option key={l} value={v}>{l}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 size-4"/></div>
    </>}
    <Button type="submit" className="h-10"><Search/> Search</Button>
  </form>}
const isProvince=(v:string):v is Province=>PROVINCES.some(([p])=>p===v);
