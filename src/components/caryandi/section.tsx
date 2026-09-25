import {useEffect,useId,useState,type ReactNode} from 'react'; import {Link} from '@tanstack/react-router'; import {ArrowRight,ChevronDown} from 'lucide-react'; import {BackButton} from './back-button';
export function PageHero({eyebrow,title,body,children}:{eyebrow?:string;title:string;body?:string;children?:ReactNode}){return <div className="border-b bg-muted/35"><div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14"><BackButton to="/" label="Back"/><div className="mt-3"/>{eyebrow&&<p className="text-sm font-semibold text-primary">{eyebrow}</p>}<h1 className="mt-1 max-w-3xl text-3xl font-bold sm:text-4xl">{title}</h1>{body&&<p className="mt-3 max-w-2xl text-muted-foreground">{body}</p>}{children&&<div className="mt-6">{children}</div>}</div></div>}
export function Section({title,description,action,children}:{title:string;description?:string;action?:{label:string;to:string};children:ReactNode}){return <section className="py-10 sm:py-14"><div className="mx-auto max-w-7xl px-4 sm:px-6"><div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4"><div className="min-w-0"><h2 className="text-2xl font-bold">{title}</h2>{description&&<p className="mt-1 text-sm text-muted-foreground">{description}</p>}</div>{action&&<Link to={action.to as never} className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary">{action.label}<ArrowRight className="size-4"/></Link>}</div>{children}</div></section>}

/** Remembers whether a home-page section is open, per browser. The server always renders `defaultOpen`
 *  and the saved choice is applied after hydration, so server and client markup match. */
function useRememberedOpen(key:string,defaultOpen:boolean):[boolean,(open:boolean)=>void]{
  const storageKey=`caryandi:section:${key}`;
  const [open,setOpen]=useState(defaultOpen);
  useEffect(()=>{try{const saved=window.localStorage.getItem(storageKey); if(saved==='1'||saved==='0') setOpen(saved==='1');}catch{/* storage unavailable: keep default */}},[storageKey]);
  const update=(next:boolean)=>{setOpen(next); try{window.localStorage.setItem(storageKey,next?'1':'0');}catch{/* ignore */}};
  return [open,update];
}

/** A Section the visitor can minimise. When closed it keeps its heading (and an optional `preview`) so it
 *  is still easy to find; the content stays in the page (hidden) for search engines and screen readers. */
export function CollapsibleSection({id,title,description,action,preview,defaultOpen=true,children}:{id:string;title:string;description?:string;action?:{label:string;to:string};preview?:ReactNode;defaultOpen?:boolean;children:ReactNode}){
  const [open,setOpen]=useRememberedOpen(id,defaultOpen);
  const contentId=useId();
  return <section className={open?'py-10 sm:py-14':'py-6 sm:py-8'}><div className="mx-auto max-w-7xl px-4 sm:px-6">
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 ${open?'mb-6':''}`}>
      <button type="button" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls={contentId} className="group flex min-w-0 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <span className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary"><ChevronDown className={`size-4 transition-transform duration-200 ${open?'':'-rotate-90'}`}/></span>
        <span className="min-w-0"><span className="block text-2xl font-bold">{title}</span>{description&&<span className="mt-1 block text-sm text-muted-foreground">{description}</span>}</span>
      </button>
      <div className="flex shrink-0 items-center gap-3">
        {action&&open&&<Link to={action.to as never} className="hidden items-center gap-1 text-sm font-semibold text-primary sm:flex">{action.label}<ArrowRight className="size-4"/></Link>}
        <button type="button" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls={contentId} className="rounded-md border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">{open?'Minimise':'Show'}</button>
      </div>
    </div>
    {!open&&preview&&<div className="mt-4 pl-10">{preview}</div>}
    <div id={contentId} hidden={!open}>
      {children}
      {action&&<Link to={action.to as never} className="mt-5 flex items-center gap-1 text-sm font-semibold text-primary sm:hidden">{action.label}<ArrowRight className="size-4"/></Link>}
    </div>
  </div></section>;
}
