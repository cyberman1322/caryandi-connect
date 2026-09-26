import {useEffect,useState} from 'react';
import {useRouter,useRouterState} from '@tanstack/react-router';

/**
 * Thin bar at the top of the screen while the next page loads, so a tap on a slow phone
 * gets instant feedback. Fast navigations (under ~150 ms) never show it.
 */
export function NavigationProgress(){
  const loading=useRouterState({select:s=>s.isLoading});
  const [phase,setPhase]=useState<'idle'|'start'|'run'|'done'>('idle');

  useEffect(()=>{
    if(loading){
      const show=window.setTimeout(()=>{setPhase('start'); requestAnimationFrame(()=>requestAnimationFrame(()=>setPhase('run')));},150);
      return ()=>window.clearTimeout(show);
    }
    setPhase(p=>p==='idle'?'idle':'done');
    const hide=window.setTimeout(()=>setPhase('idle'),350);
    return ()=>window.clearTimeout(hide);
  },[loading]);

  if(phase==='idle') return null;
  const width=phase==='start'?'0%':phase==='run'?'85%':'100%';
  const transition=phase==='run'?'width 8s cubic-bezier(.1,.7,.2,1)':phase==='done'?'width 150ms ease-out, opacity 200ms ease 150ms':'none';
  return <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
    <div className="h-full bg-primary" style={{width,transition,opacity:phase==='done'?0:1}}/>
  </div>;
}

/** Main public sections whose page code is fetched in the background after the first page settles. */
const WARM_PATHS=['/vehicles','/parts','/services','/agents','/information','/sellers'];

type LooseRouter={
  matchRoutes?:(pathname:string)=>Array<{routeId:string}>;
  looseRoutesById?:Record<string,unknown>;
  loadRouteChunk?:(route:unknown)=>Promise<unknown>;
};

/**
 * Downloads the code (not the data) for the main sections once the browser is idle, so the
 * first visit to each of them doesn't wait for a script download. Skipped when the visitor
 * has Data Saver on or is on a 2G connection.
 */
export function RouteCodeWarmup(){
  const router=useRouter();
  useEffect(()=>{
    const conn=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    if(conn?.saveData||/(^|-)2g$/.test(conn?.effectiveType??'')) return;
    const r=router as unknown as LooseRouter;
    if(!r.matchRoutes||!r.looseRoutesById||!r.loadRouteChunk) return;
    const warm=()=>{
      const seen=new Set<string>();
      for(const path of WARM_PATHS){
        try{
          for(const m of r.matchRoutes!(path)){
            if(seen.has(m.routeId)) continue; seen.add(m.routeId);
            const route=r.looseRoutesById![m.routeId];
            if(route) r.loadRouteChunk!(route).catch(()=>{});
          }
        }catch{/* warming is best-effort */}
      }
    };
    const w=window as Window&{requestIdleCallback?:(cb:()=>void,o?:{timeout:number})=>number;cancelIdleCallback?:(id:number)=>void};
    let idle:number|undefined;
    const start=window.setTimeout(()=>{idle=w.requestIdleCallback?w.requestIdleCallback(warm,{timeout:4000}):window.setTimeout(warm,0);},2500);
    return ()=>{window.clearTimeout(start); if(idle!==undefined){if(w.cancelIdleCallback) w.cancelIdleCallback(idle); else window.clearTimeout(idle);}};
  },[router]);
  return null;
}
