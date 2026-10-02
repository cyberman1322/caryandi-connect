import {useState,type ReactNode} from 'react';
import {PageHero} from './section';

type LightSize='compact'|'comfortable'|'spacious';
const sizeConfig:Record<LightSize,{card:string;icon:string;title:string;body:string;gap:string;cols:string}>={
  compact:{card:'p-3',icon:'h-7 w-9',title:'text-sm font-semibold',body:'text-xs',gap:'gap-2',cols:'md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4'},
  comfortable:{card:'p-5',icon:'h-10 w-12',title:'font-semibold',body:'text-sm',gap:'gap-3',cols:'md:grid-cols-2 lg:grid-cols-4'},
  spacious:{card:'p-7',icon:'h-14 w-16',title:'text-lg font-bold',body:'text-base',gap:'gap-5',cols:'md:grid-cols-2 lg:grid-cols-3'},
};

type WarningIconCmp=({className}:{className?:string|undefined})=>ReactNode;
type WarningLight = {
  name:string;
  meaning:string;
  action:string;
  level:'red'|'amber';
  icon:WarningIconCmp;
};

const warningLights: WarningLight[] = [
  {name:'Engine oil pressure',meaning:'The engine may not be getting enough oil pressure.',action:'Stop safely and switch off the engine. Check the oil level; get help if the light stays on.',level:'red',icon:OilWarningIcon},
  {name:'Brake system',meaning:'The parking brake may be on, brake fluid may be low, or the braking system may have a fault.',action:'Release the parking brake. If the light remains on, stop safely and seek assistance.',level:'red',icon:BrakeWarningIcon},
  {name:'Coolant temperature',meaning:'The engine is overheating.',action:'Stop safely, switch off the engine and let it cool. Never open a hot coolant cap.',level:'red',icon:CoolantWarningIcon},
  {name:'Battery charge',meaning:'The battery is not charging while the engine is running.',action:'Switch off unnecessary electrical equipment and have the charging system checked promptly.',level:'red',icon:BatteryWarningIcon},
  {name:'Check engine',meaning:'The engine or emissions system has detected a fault.',action:'Arrange a diagnostic check. If it flashes or the car loses power, stop safely and get help.',level:'amber',icon:EngineWarningIcon},
  {name:'Tyre pressure',meaning:'One or more tyres may be underinflated or punctured.',action:'Slow down and check all tyre pressures as soon as it is safe.',level:'amber',icon:TyreWarningIcon},
  {name:'ABS',meaning:'The anti-lock braking system has a fault.',action:'Normal braking may remain, but ABS may not work. Drive carefully and arrange a check soon.',level:'amber',icon:AbsWarningIcon},
  {name:'Airbag / SRS',meaning:'The airbags or seat-belt pretensioners may not work correctly.',action:'Have the restraint system checked as soon as possible.',level:'amber',icon:AirbagWarningIcon},
];

function WarningSvg({children,label,className='h-10 w-12'}:{children:ReactNode;label:string;className?:string|undefined}) {
  return <svg viewBox="0 0 48 48" role="img" aria-label={label} className={`${className} fill-none stroke-current`} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>;
}

export function WarningLights(){
  const [size,setSize]=useState<LightSize>('comfortable');
  const cfg=sizeConfig[size];
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-destructive"/>Red: stop safely and act now</span>
        <span className="inline-flex items-center gap-2"><span className="size-2.5 rounded-full bg-warning"/>Amber: check the vehicle soon</span>
      </div>
      <div role="group" aria-label="Warning light card size" className="inline-flex rounded-md border bg-card p-0.5">
        {(['compact','comfortable','spacious'] as const).map(s=>{
          const active=s===size;
          return <button key={s} type="button" onClick={()=>setSize(s)} aria-pressed={active} className={`rounded-[5px] px-2.5 py-1 text-xs font-medium capitalize transition-colors ${active?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground'}`}>{s}</button>;
        })}
      </div>
    </div>
    <div className={`grid ${cfg.gap} ${cfg.cols}`}>
      {warningLights.map(light=>{
        const Icon=light.icon;
        return <article key={light.name} className={`rounded-lg border bg-card ${cfg.card} transition-[padding] duration-200`}>
          <div className={light.level==='red'?'text-destructive':'text-warning-foreground'}><Icon className={cfg.icon}/></div>
          <h3 className={`mt-4 ${cfg.title}`}>{light.name}</h3>
          <p className={`mt-2 ${cfg.body} text-muted-foreground`}>{light.meaning}</p>
          <p className={`mt-3 border-t pt-3 ${cfg.body}`}><strong>What to do:</strong> {light.action}</p>
        </article>;
      })}
    </div>
    <p className="mt-5 text-xs text-muted-foreground">Symbols and advice can vary by make and model. Always check your vehicle owner's manual.</p>
  </>;
}

function OilWarningIcon({className}:{className?:string|undefined}){return <WarningSvg label="Oil pressure warning symbol" className={className}><path d="M6 26h23l7-8h5v14H12a6 6 0 0 1-6-6Z"/><path d="M12 26V16h13l4 10M38 36c0 2-1.8 4-4 4s-4-2-4-4 4-6 4-6 4 4 4 6Z"/></WarningSvg>}
function BrakeWarningIcon({className}:{className?:string|undefined}){return <WarningSvg label="Brake system warning symbol" className={className}><circle cx="24" cy="24" r="14"/><path d="M5 14a22 22 0 0 0 0 20M43 14a22 22 0 0 1 0 20M24 15v12M24 33h.01"/></WarningSvg>}
function CoolantWarningIcon({className}:{className?:string|undefined}){return <WarningSvg label="Engine coolant temperature warning symbol" className={className}><path d="M21 8v20a7 7 0 1 0 6 0V8a3 3 0 0 0-6 0Z"/><path d="M24 18v14M6 38c3-3 6 3 9 0s6 3 9 0 6 3 9 0 6 3 9 0"/></WarningSvg>}
function BatteryWarningIcon({className}:{className?:string|undefined}){return <WarningSvg label="Battery charge warning symbol" className={className}><rect x="6" y="14" width="36" height="25" rx="2"/><path d="M14 10h6M28 10h6M15 26h8M19 22v8M29 26h8"/></WarningSvg>}
function EngineWarningIcon({className}:{className?:string|undefined}){return <WarningSvg label="Check engine warning symbol" className={className}><path d="M7 19h7l4-6h17l3 6h4v17H10V24H6v7M20 13V8M30 13V8"/></WarningSvg>}
function TyreWarningIcon({className}:{className?:string|undefined}){return <WarningSvg label="Tyre pressure warning symbol" className={className}><path d="M11 10C7 17 6 26 9 36M37 10c4 7 5 16 2 26M9 36c9 4 21 4 30 0M24 16v12M24 34h.01"/></WarningSvg>}
function AbsWarningIcon({className}:{className?:string|undefined}){return <WarningSvg label="ABS warning symbol" className={className}><circle cx="24" cy="24" r="14"/><path d="M5 14a22 22 0 0 0 0 20M43 14a22 22 0 0 1 0 20"/><text x="24" y="28" textAnchor="middle" className="fill-current stroke-none text-[11px] font-bold">ABS</text></WarningSvg>}
function AirbagWarningIcon({className}:{className?:string|undefined}){return <WarningSvg label="Airbag warning symbol" className={className}><circle cx="13" cy="11" r="4"/><path d="m10 38 3-15 8 5 4 10M13 20l8 3M27 13c7 0 13 5 13 12-7 0-13-5-13-12Z"/></WarningSvg>}


/** /warning-lights: common dashboard warning symbols, what they mean and what to do. */
export function WarningLightsPage(){
  return <main>
    <PageHero eyebrow="Car information" title="Dashboard warning lights" body="Common symbols, what they mean and what to do next."/>
    <section className="py-10 sm:py-14"><div className="mx-auto max-w-7xl px-4 sm:px-6"><WarningLights/></div></section>
  </main>;
}
