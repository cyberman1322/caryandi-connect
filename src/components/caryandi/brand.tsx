import { Link } from '@tanstack/react-router';
import { CarFront } from 'lucide-react';
import { cn } from '@/lib/utils';
export function Brand({compact=false,className}:{compact?:boolean;className?:string}){return <Link to="/" className={cn('inline-flex items-center gap-2 font-bold text-foreground',className)} aria-label="Caryandi home"><span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><CarFront className="size-5"/></span>{!compact&&<span className="text-xl">Caryandi<span className="text-primary">.</span></span>}</Link>}
