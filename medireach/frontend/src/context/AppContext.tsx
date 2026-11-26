import {createContext,useContext,useState,useEffect,ReactNode} from 'react';
import {Lang} from '../translations';import {translationService} from '../services/translationService';import {authService} from '../services/authService';
const Ctx=createContext<any>(null);export const useApp=()=>useContext(Ctx);
export function AppProvider({children}:{children:ReactNode}){
const [lang,setLang]=useState<Lang>('en'),[user,setUser]=useState<any>(()=>JSON.parse(localStorage.getItem('mr_user')||'null')),[size,setSize]=useState(16);
useEffect(()=>{document.documentElement.style.setProperty('--fs',size+'px');document.documentElement.lang=lang},[size,lang]);
const t=(k:string)=>translationService.t(lang,k);
const signIn=(r:any)=>{localStorage.setItem('mr_token',r.token);localStorage.setItem('mr_user',JSON.stringify(r.user));setUser(r.user)};
const signOut=async()=>{try{await authService.logout()}finally{localStorage.removeItem('mr_token');localStorage.removeItem('mr_user');setUser(null)}};
return <Ctx.Provider value={{lang,setLang,t,user,signIn,signOut,size,setSize}}>{children}</Ctx.Provider>}
