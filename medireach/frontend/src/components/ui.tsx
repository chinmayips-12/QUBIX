import {useEffect,useState} from 'react';import {useApp} from '../context/AppContext';import {apiBlob} from '../services/api';
export const Err=({m}:{m:string})=>m?<p role="alert" className="rounded-xl bg-emergency/10 p-3 font-semibold text-emergency">{m}</p>:null;
export const Status=({s}:{s:string})=>{const {t}=useApp();return <span className="rounded-full bg-champagne px-3 py-1 text-sm font-bold">{t(s)}</span>};
export const DoctorBadge=({d}:{d:any})=>{const {t}=useApp();return <p className="text-sm">{d.verified?'✔ '+t('verified'):'⏳'} {d.demo&&<b className="text-emergency"> · {t('demo')}</b>}</p>};
export function FileImage({id,alt,className=''}:{id?:string;alt:string;className?:string}){const [src,setSrc]=useState(''),[failed,setFailed]=useState(false);
useEffect(()=>{let active=true,objectUrl='';setSrc('');setFailed(false);if(id)apiBlob(`/files/${encodeURIComponent(id)}`).then(url=>{objectUrl=url;if(active)setSrc(url);else URL.revokeObjectURL(url)}).catch(()=>{if(active)setFailed(true)});
return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[id]);
return src?<img src={src} alt={alt} className={className}/>:<span role="img" aria-label={alt} className={className}>{failed||!id?'Image unavailable':'Loading image…'}</span>}
export function FileDocument({id,label}:{id?:string;label:string}){const [src,setSrc]=useState('');
useEffect(()=>{let active=true,objectUrl='';setSrc('');if(id)apiBlob(`/files/${encodeURIComponent(id)}`).then(url=>{objectUrl=url;if(active)setSrc(url);else URL.revokeObjectURL(url)}).catch(()=>{if(active)setSrc('')});
return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}},[id]);
return src?<a className="underline" href={src} target="_blank" rel="noreferrer">{label}</a>:<span>{label}: {id?'Loading or unavailable':'Not uploaded'}</span>}
