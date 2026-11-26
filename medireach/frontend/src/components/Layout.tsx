import {useState} from 'react';import {Link,Outlet,useNavigate} from 'react-router-dom';import {HeartPulse,LogOut,Siren} from 'lucide-react';import {useApp} from '../context/AppContext';
export default function Layout(){const {t,lang,setLang,user,signOut,size,setSize}=useApp();const nav=useNavigate();
const [logoutError,setLogoutError]=useState('');
return <div className="min-h-screen font-sans"><a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
<header className="bg-teal text-ivory"><nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 p-3">
<Link to="/" className="mr-auto flex items-center gap-2 text-xl font-extrabold"><HeartPulse/>MediReach</Link>
<button aria-label={t('textSize')} className="rounded-lg bg-white/10 px-3" onClick={()=>setSize(size>=22?16:size+3)}>A+</button>
<select aria-label="Language" value={lang} onChange={e=>setLang(e.target.value)} className="rounded-lg bg-white/10 px-2 text-ivory"><option value="en" className="text-black">English</option><option value="kn" className="text-black">ಕನ್ನಡ</option></select>
<Link to="/guest-emergency" className="btn-r"><Siren size={16}/>Guest SOS</Link>
{user?<><Link className="btn-s" to={'/'+user.role}>{user.name.split(' ')[0]}</Link><button className="btn-s" onClick={async()=>{setLogoutError('');try{await signOut()}catch(e:any){setLogoutError(e.message)}finally{nav('/')}}}><LogOut size={18}/>{t('logout')}</button></>
:<><Link to="/login" className="btn-s">{t('login')}</Link><Link to="/login?role=admin" className="btn-s">Admin Login</Link><Link to="/login?mode=register" className="btn-p border border-champagne">{t('start')}</Link></>}</nav></header>
<main id="main" className="mx-auto max-w-6xl p-4"><Outlet/></main>
{logoutError&&<p role="alert" className="mx-auto max-w-6xl px-4 font-semibold text-emergency">{logoutError}</p>}
<footer className="mt-10 bg-charcoal p-6 text-center text-sm text-ivory">MediReach · Demo build – simulated data, not medical advice.</footer></div>}
