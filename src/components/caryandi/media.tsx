import vehicleGrid from '@/assets/vehicle-grid.jpg';
import serviceGrid from '@/assets/service-grid.jpg';
const positions=['0% 0%','100% 0%','0% 100%','100% 100%'];
export function VehicleImage({index=0,className='',alt='Vehicle'}:{index?:number;className?:string;alt?:string}){return <div role="img" aria-label={alt} className={`bg-cover ${className}`} style={{backgroundImage:`url(${vehicleGrid})`,backgroundSize:'200% 200%',backgroundPosition:positions[index%4]}}/>}
export function ServiceImage({index=0,className='',alt='Automotive service'}:{index?:number;className?:string;alt?:string}){return <div role="img" aria-label={alt} className={`bg-cover ${className}`} style={{backgroundImage:`url(${serviceGrid})`,backgroundSize:'200% 200%',backgroundPosition:positions[index%4]}}/>}
