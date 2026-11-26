import {api} from './api';
export const requestService={create:(b:any)=>api('/requests','POST',b),sos:(b:any)=>api('/requests/sos','POST',b),list:()=>api('/requests'),accept:(id:string)=>api(`/requests/${id}/accept`,'POST'),reject:(id:string)=>api(`/requests/${id}/reject`,'POST'),
status:(id:string,status:string)=>api(`/requests/${id}/status`,'POST',{status}),otp:(id:string,otp:string)=>api(`/requests/${id}/otp`,'POST',{otp}),arrivalOtp:(id:string)=>api(`/requests/${id}/arrival-otp`),updateLocation:(id:string,lat:number,lng:number)=>api(`/requests/${id}/location`,'PATCH',{lat,lng}),
feedback:(id:string,rating:number,comment:string)=>api<{feedback:{rating:number;comment:string;createdAt:number}}>(`/requests/${id}/feedback`,'POST',{rating,comment}),
contacts:()=>api('/contacts'),addContact:(b:any)=>api('/contacts','POST',b),delContact:(id:string)=>api('/contacts/'+id,'DELETE'),history:()=>api('/history')};
