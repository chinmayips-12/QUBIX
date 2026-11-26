import {api} from './api';
export const doctorService={list:(spec?:string)=>api('/doctors'+(spec?`?specialization=${encodeURIComponent(spec)}`:'')),setAvailability:(available:boolean)=>api('/doctors/me/availability','PATCH',{available}),
adminStats:()=>api('/admin/stats'),adminDoctors:()=>api('/admin/doctors'),adminPatients:()=>api('/admin/patients'),adminUpdatePatient:(id:string,b:any)=>api(`/admin/patients/${id}`,'PATCH',b),adminContacts:()=>api('/admin/contacts'),adminRequests:()=>api('/admin/requests'),
verify:(id:string,decision:string)=>api(`/admin/doctors/${id}/verify`,'POST',{decision})};
