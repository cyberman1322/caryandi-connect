import {useRouter} from '@tanstack/react-router'; import {ArrowLeft} from 'lucide-react'; import {Button} from '@/components/ui/button';

/** Returns to the previous page in the user's history; falls back to `to` when there is none. */
export function BackButton({to,label='Back'}:{to:string;label?:string}){
  const router=useRouter();
  return <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={()=>{if(window.history.length>1) router.history.back(); else router.navigate({to});}}><ArrowLeft className="size-4"/>{label}</Button>;
}
