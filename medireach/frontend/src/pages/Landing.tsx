import {Link} from 'react-router-dom';import {MapPin,ShieldCheck,Stethoscope,Siren} from 'lucide-react';import {useApp} from '../context/AppContext';
export default function Landing(){const {t}=useApp();
const faq=[['Are the doctors real?','Demo doctors are simulated. Only approved and verified doctors can accept requests.'],['Is doctor tracking live?','Only when a doctor shares GPS and location services are connected; otherwise the dashboard labels tracking as demo mode.']];
return <div className="space-y-12 py-6"><section className="grid items-center gap-8 md:grid-cols-2"><div className="space-y-5">
<h1 className="text-4xl font-extrabold text-teal md:text-5xl">{t('tagline')}</h1><p className="text-lg">{t('desc')}</p>
<div className="flex flex-wrap gap-3"><Link className="btn-r" to="/guest-emergency"><Siren size={18}/>Emergency SOS as guest</Link><Link className="btn-p" to="/login?mode=register">{t('reqHelp')}</Link><Link className="btn-p" to="/login?mode=register&role=doctor">{t('joinDoc')}</Link></div></div>
<div className="card flex min-h-64 flex-col justify-center gap-6 bg-teal p-6 text-ivory sm:flex-row sm:items-center sm:justify-between">
<div className="flex items-center justify-center gap-4"><MapPin size={44}/><Stethoscope size={44}/><ShieldCheck size={44}/></div>
<ul className="space-y-4">{[[Siren,'One-tap Emergency SOS'],[ShieldCheck,'Verified specialists'],[MapPin,'Nearby request matching']].map(([Icon,label]:any)=><li key={label} className="flex items-center gap-3"><Icon size={20}/><span className="font-semibold">{label}</span></li>)}</ul></div></section>
<section id="how" className="grid gap-4 md:grid-cols-3">{[[Siren,'1. Tell us what is wrong'],[MapPin,'2. We find nearby verified doctors'],[ShieldCheck,'3. Confirm arrival with OTP']].map(([I,x]:any)=><div key={x} className="card"><I className="text-teal"/><p className="mt-2 font-bold">{x}</p></div>)}</section>
<section className="card"><h2 className="mb-2 text-2xl font-bold">FAQ</h2>{faq.map(([q,a])=><details key={q} className="border-t py-2"><summary className="cursor-pointer font-semibold">{q}</summary><p>{a}</p></details>)}</section></div>}
