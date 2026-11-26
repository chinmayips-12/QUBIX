export type Loc={lat:number;lng:number};
const locationError=(error:GeolocationPositionError)=>new Error(error.code===1?'Location permission denied':'Location unavailable');
const options:PositionOptions={enableHighAccuracy:true,maximumAge:0,timeout:15000};
export const locationService={
detect:()=>new Promise<Loc>((res,rej)=>{
if(!navigator.geolocation)return rej(new Error('Location not supported'));
navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude}),e=>rej(locationError(e)),options)}),
watch:(onLocation:(location:Loc)=>void,onError:(error:Error)=>void)=>{
if(!navigator.geolocation){onError(new Error('Location not supported'));return null}
return navigator.geolocation.watchPosition(
position=>onLocation({lat:position.coords.latitude,lng:position.coords.longitude}),
error=>onError(locationError(error)),options)},
clearWatch:(watchId:number|null)=>{if(watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId)},
};
