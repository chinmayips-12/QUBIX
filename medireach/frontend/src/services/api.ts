export const API_BASE=import.meta.env.VITE_API_URL||'http://localhost:4000/api';
export async function api<T=any>(path:string,method='GET',body?:unknown,guestToken?:string):Promise<T>{
const token=localStorage.getItem('mr_token');
const r=await fetch(API_BASE+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(guestToken?{'X-Guest-Token':guestToken}:{})},body:body?JSON.stringify(body):undefined}).catch(()=>{throw new Error('Network unavailable. Please try again.')});
const contentType=r.headers.get('content-type')||'';
const j=contentType.includes('application/json')?await r.json().catch(()=>({})):{};if(!r.ok){const message=j.error||(r.status===404?'MediReach API endpoint not found. Restart the backend so it loads the latest version.':`MediReach API returned HTTP ${r.status}. Check that the backend is running.`);throw new Error(message)}return j}
export async function apiBlob(path:string):Promise<string>{
const token=localStorage.getItem('mr_token');
const response=await fetch(API_BASE+path,{headers:token?{Authorization:'Bearer '+token}:{}});
if(!response.ok)throw new Error('File unavailable');
return URL.createObjectURL(await response.blob())}
