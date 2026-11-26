import type {Loc} from './locationService';
// Swap this mock for Google Maps (VITE_GOOGLE_MAPS_API_KEY) without touching UI components.
export interface MapService{label(p?:Loc|null):string;eta(km:number|null):string;route(from?:Loc|null,to?:Loc|null):string}
export const mapService:MapService={label:p=>p?`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)} (map placeholder)`:'Map placeholder – Google Maps not connected',eta:km=>km==null?'—':`~${Math.max(5,Math.round(km*4))} min (demo estimate)`,route:(from,to)=>from&&to?'Demo mode — route directions are unavailable until Maps is connected.':'Route unavailable until GPS and Maps are connected.'};
export function distanceKm(a?:Loc|null,b?:Loc|null){if(!a||!b)return null;const r=(v:number)=>v*Math.PI/180,h=Math.sin(r(b.lat-a.lat)/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(r(b.lng-a.lng)/2)**2;return +(12742*Math.asin(Math.sqrt(h))).toFixed(1)}
