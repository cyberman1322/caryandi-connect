import {createFileRoute} from '@tanstack/react-router'; import {VehicleDetail,type VehicleRouteData} from '@/components/caryandi/vehicle-detail';
import {loadVehiclePage} from '@/lib/vehicles/vehicle-service'; import {formatPrice,labelOf,PROVINCES,vehicleTitle} from '@/lib/vehicles/vehicle-options'; import {publicStorageUrl} from '@/lib/storage/images';
const FALLBACK={title:'Vehicle Details — Caryandi',description:'View vehicle condition, specifications, seller and documentation details.'};
export const Route=createFileRoute('/vehicles/$vehicleId')({
  // Server-rendered so listings are indexable and show a rich preview when shared on WhatsApp.
  loader:async({params}):Promise<VehicleRouteData>=>{try{return {page:await loadVehiclePage(params.vehicleId)}}catch(e){return {page:null,error:e instanceof Error?e.message:'We couldn’t load this vehicle.'}}},
  head:({loaderData})=>{const v=loaderData?.page?.listing; if(!v) return {meta:[{title:FALLBACK.title},{name:'description',content:FALLBACK.description},{property:'og:title',content:FALLBACK.title},{property:'og:description',content:FALLBACK.description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]};
    const title=`${v.year??''} ${vehicleTitle({make:v.make,model:v.model,variant:v.variant})} for ${formatPrice(v.price)}`.trim();
    const place=[v.city,labelOf(PROVINCES,v.province)].filter(x=>x&&x!=='—').join(', ');
    const description=`${title}${place?` in ${place}`:''}. Sold by ${v.seller_name??'a Caryandi seller'}. View photos, specifications and contact the seller on Caryandi.`;
    const image=publicStorageUrl('vehicle-images',loaderData?.page?.images[0]?.storage_path??v.primary_image_path);
    return {meta:[{title:`${title} — Caryandi`},{name:'description',content:description},{property:'og:title',content:title},{property:'og:description',content:description},{property:'og:type',content:'product'},...(image?[{property:'og:image',content:image}]:[]),{name:'twitter:card',content:'summary_large_image'}]};},
  component:VehicleRoute});
function VehicleRoute(){const {vehicleId}=Route.useParams(); const data=Route.useLoaderData(); return <VehicleDetail key={vehicleId} id={vehicleId} data={data}/>}
