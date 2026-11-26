import {dict,Lang} from '../translations';
export const translationService={t:(l:Lang,k:string)=>dict[l][k]??dict.en[k]??k,speak(text:string,l:Lang){if(!('speechSynthesis' in window))return;const u=new SpeechSynthesisUtterance(text);u.lang=l==='kn'?'kn-IN':'en-IN';speechSynthesis.cancel();speechSynthesis.speak(u)}};
