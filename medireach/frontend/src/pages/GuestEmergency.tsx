import {FormEvent,useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {MapPin,Phone,Siren} from 'lucide-react';
import {Err,Status} from '../components/ui';
import {guestService} from '../services/guestService';
import {locationService,Loc} from '../services/locationService';
import {distanceKm,mapService} from '../services/mapService';

type GuestTracking={requestId:string;token:string};
const STORAGE_KEY='mr_guest_emergency';
const demoProgressSteps=['Request dispatched','Locating nearest responder','Responder assigned (demo only)'];
const validPhone=(value:string)=>/^\+?[0-9]{10,15}$/.test(value.trim());
function savedTracking():GuestTracking|null{
  try{
    const saved=sessionStorage.getItem(STORAGE_KEY);
    if(!saved)return null;
    const value=JSON.parse(saved);
    return typeof value.requestId==='string'&&typeof value.token==='string'?value:null;
  }catch{return null}
}

export default function GuestEmergency(){
  const [form,setForm]=useState({name:'',phone:'',emergencyContact:'',contactConsent:false,medicalInfo:'',address:''});
  const [location,setLocation]=useState<Loc|null>(null);
  const [tracking,setTracking]=useState<GuestTracking|null>(savedTracking);
  const [request,setRequest]=useState<any>(null);
  const [error,setError]=useState('');
  const [locationNotice,setLocationNotice]=useState('');
  const [gpsStatus,setGpsStatus]=useState<'idle'|'requesting'|'tracking'|'unavailable'>('idle');
  const [gpsRetry,setGpsRetry]=useState(0);
  const [busy,setBusy]=useState(false);
  const [demoProgress,setDemoProgress]=useState(0);
  const requestId=tracking?.requestId;
  const accessToken=tracking?.token;
  const requestStatus=request?.status;
  const finished=['completed','cancelled','arrived'].includes(requestStatus||'');

  useEffect(()=>{
    if(!import.meta.env.DEV||!requestId||request?.status!=='submitted'||request?.doctor)return;
    setDemoProgress(0);
    const timer=window.setInterval(()=>setDemoProgress(step=>Math.min(step+1,demoProgressSteps.length-1)),2500);
    return()=>window.clearInterval(timer);
  },[requestId,request?.status,request?.doctor?.id]);

  useEffect(()=>{
    if(!requestId||!accessToken)return;
    let active=true;
    const refresh=()=>guestService.getRequest(requestId,accessToken)
      .then(result=>{if(active)setRequest((previous:any)=>({...result,alertDelivery:previous?.alertDelivery??result.alertDelivery}))})
      .catch(reason=>{if(active)setError(reason.message)});
    refresh();
    const timer=window.setInterval(refresh,5000);
    return()=>{active=false;window.clearInterval(timer)};
  },[requestId,accessToken]);

  useEffect(()=>{
    if(!requestId||!accessToken||finished)return;
    let active=true;
    let lastSent=location;
    let lastSentAt=location?Date.now():0;
    let pending=false;
    setGpsStatus('requesting');
    const watchId=locationService.watch(next=>{
      setLocation(next);
      setGpsStatus('tracking');
      const moved=lastSent?distanceKm(lastSent,next):null;
      if(pending||(moved!==null&&moved<0.05&&Date.now()-lastSentAt<30000))return;
      pending=true;
      guestService.updateLocation(requestId,accessToken,next.lat,next.lng)
        .then(()=>{
          lastSent=next;
          lastSentAt=Date.now();
          if(active)setRequest((previous:any)=>previous?{...previous,lat:next.lat,lng:next.lng,patientLocationUpdatedAt:lastSentAt}:previous);
        })
        .catch(reason=>{if(active)setError(`Live GPS update failed: ${reason.message}`)})
        .finally(()=>{pending=false});
    },reason=>{
      if(!active)return;
      setGpsStatus('unavailable');
      setError(`Live GPS sharing is unavailable: ${reason.message}`);
    });
    return()=>{active=false;locationService.clearWatch(watchId)};
  },[requestId,accessToken,finished,gpsRetry]);

  async function submit(event:FormEvent){
    event.preventDefault();
    setError('');
    setLocationNotice('');
    setBusy(true);
    setGpsStatus('idle');
    let initialLocation:Loc|undefined;
    const notices:string[]=[];
    const phone=validPhone(form.phone)?form.phone.trim():'';
    const consentedContact=form.contactConsent&&validPhone(form.emergencyContact)
      ?form.emergencyContact.trim():'';
    if(form.phone&&!phone)notices.push('The callback number was invalid and has been omitted.');
    if(form.emergencyContact&&!consentedContact)notices.push('The alternate contact was omitted because it was invalid or consent was not given.');
    try{
      try{
        initialLocation=await locationService.detect();
        setLocation(initialLocation);
        setGpsStatus('tracking');
      }catch(reason:any){
        setGpsStatus('unavailable');
        notices.push(`${reason.message}. SOS will still be sent, but nearby matching may be less precise without GPS.`);
      }
      setLocationNotice(notices.join(' '));
      const result:any=await guestService.createEmergency({
        ...form,name:form.name||'Guest patient',phone,
        emergencyContact:consentedContact,contactConsent:!!consentedContact,
        lat:initialLocation?.lat,lng:initialLocation?.lng,
      });
      const saved={requestId:result.request.id,token:result.guestAccessToken};
      try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(saved))}
      catch{notices.push('This browser could not save guest tracking access. Keep this page open to follow the request.');setLocationNotice(notices.join(' '))}
      setTracking(saved);
      setRequest({...result.request,alertDelivery:result.alertDelivery,noMatch:result.noMatch,matchedDoctorCount:result.matchedDoctorCount});
    }catch(reason:any){setError(reason.message)}
    finally{setBusy(false)}
  }

  function startNewRequest(){
    sessionStorage.removeItem(STORAGE_KEY);
    setTracking(null);
    setRequest(null);
    setLocation(null);
    setLocationNotice('');
    setGpsStatus('idle');
    setError('');
  }

  const doctor=request?.doctor;
  const distance=doctor?.lat!=null&&request?.lat!=null
    ? distanceKm({lat:doctor.lat,lng:doctor.lng},{lat:request.lat,lng:request.lng})
    : null;

  return <div className="mx-auto max-w-2xl space-y-5 py-4">
    <section className="card border-emergency space-y-3">
      <h1 className="flex items-center gap-2 text-3xl font-extrabold"><Siren className="text-emergency"/>Emergency SOS as guest</h1>
      <p>Tap once to request emergency help without creating an account. MediReach will request your GPS location, send a high-priority request to nearby verified, available emergency doctors, and share GPS updates while this page is open and the request is active.</p>
      <p className="font-semibold">For immediate danger, contact your local emergency services.</p>
    </section>
    <Err m={error}/>

    {!tracking?<form className="card space-y-4" onSubmit={submit}>
      <button className="btn-r w-full py-4 text-xl" disabled={busy}><Siren/>{busy?'Getting GPS and sending SOS…':'Send emergency SOS now'}</button>
      <p role="status">GPS permission is requested automatically when you tap SOS. If GPS is unavailable, the emergency request is still sent, but nearby matching may be less precise.</p>
      {locationNotice&&<p role="status" className="rounded-lg bg-champagne p-3">{locationNotice}</p>}
      <details className="rounded-xl border p-3">
        <summary className="cursor-pointer font-semibold">Optional details for the doctor</summary>
        <div className="mt-3 space-y-3">
          <label className="block font-semibold">Your name<input maxLength={100} autoComplete="name" className="inp" value={form.name} onChange={event=>setForm({...form,name:event.target.value})}/></label>
          <label className="block font-semibold">Callback mobile number<input type="tel" inputMode="tel" autoComplete="tel" className="inp" value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})} placeholder="+919876543210"/></label>
          <label className="block font-semibold">Alternate contact number<input type="tel" inputMode="tel" className="inp" value={form.emergencyContact} onChange={event=>setForm({...form,emergencyContact:event.target.value})}/></label>
          {form.emergencyContact&&<label className="flex items-start gap-2"><input type="checkbox" checked={form.contactConsent} onChange={event=>setForm({...form,contactConsent:event.target.checked})}/><span>I consent to sending this emergency contact an SMS with my name, available medical information, and location.</span></label>}
          <label className="block font-semibold">Medical information<textarea maxLength={1000} rows={3} className="inp" value={form.medicalInfo} onChange={event=>setForm({...form,medicalInfo:event.target.value})} placeholder="Allergies, conditions or medication"/></label>
          <label className="block font-semibold">Address or landmark<input maxLength={500} className="inp" value={form.address} onChange={event=>setForm({...form,address:event.target.value})}/></label>
        </div>
      </details>
      <p className="text-sm">No registration or OTP is needed. Your emergency request is saved in the backend.</p>
    </form>:<section className="card space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">Emergency request sent</h2><Status s={request?.status||'submitted'}/></div>
      <p>{request?.status==='submitted'&&request?.matchedDoctorCount>0
        ?request?.lat!=null
          ?`SOS sent to ${request.matchedDoctorCount} verified, available doctors, nearest locations first. Waiting for one to accept.`
          :`SOS sent to ${request.matchedDoctorCount} verified, available emergency doctors. GPS was unavailable, so nearest locations could not be ranked.`
        :request?.status==='submitted'&&request?.noMatch
          ?request?.lat!=null
            ?'No nearby verified emergency doctor is available right now. Your high-priority request remains pending.'
            :'No verified, available emergency doctor is online right now. Your high-priority request remains pending.'
          :!request?.doctor
            ?'Your high-priority request is pending while nearby doctors are checked.'
        :'A doctor has accepted your request. Request status updates automatically.'}</p>
      {import.meta.env.DEV&&request?.status==='submitted'&&<div className="space-y-2 rounded-xl border border-teal/20 bg-champagne/40 p-3">
        <p className="text-sm font-semibold">Demo progress (simulated only; this does not mean a responder has accepted).</p>
        <ol className="grid gap-2 sm:grid-cols-3">{demoProgressSteps.map((step,index)=><li key={step} aria-current={index===demoProgress?'step':undefined} className={`rounded-lg border p-2 text-sm ${index<=demoProgress?'border-teal bg-white font-semibold text-teal':'border-transparent opacity-60'}`}><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal text-white">{index+1}</span>{step}</li>)}</ol>
      </div>}
      <p>Alternate contact alert: {request?.alertDelivery?.status==='sent'?'SMS sent.':request?.alertDelivery?.status==='demo_not_sent'?'Demo mode — no SMS was sent.':request?.alertDelivery?.status==='no_contacts'?'No alternate contact was provided.':request?.alertDelivery?.status==='provider_error'?'SMS provider error; delivery could not be confirmed.':'No alternate contact alert was requested, or its delivery status is unavailable.'}</p>
      {doctor&&<div className="rounded-xl bg-champagne/40 p-4">
        <h3 className="text-xl font-bold">{doctor.name} {doctor.verified&&<span className="text-teal">✓ Verified</span>}</h3>
        <p>{doctor.specialization}</p>
        {doctor.phone&&<a className="btn-s mt-2" href={`tel:${doctor.phone}`}><Phone size={16}/>Call doctor</a>}
        <p className="mt-2">Doctor location: {doctor.lat!=null?mapService.label({lat:doctor.lat,lng:doctor.lng}):'Not shared yet.'}</p>
        <p>Patient destination: {request?.lat!=null?mapService.label({lat:request.lat,lng:request.lng}):'No GPS location provided.'}</p>
        {distance!=null&&<p>Distance remaining: {distance} km · ETA {mapService.eta(distance)}</p>}
        <p className="text-sm">Live GPS is shown only when the doctor shares a location. No simulated movement is displayed.</p>
      </div>}
      <div className="rounded-xl bg-champagne/40 p-3">
        <p><MapPin size={16} className="mr-1 inline"/>{gpsStatus==='tracking'?'Live GPS tracking is active; your latest position is shared with the emergency request.':gpsStatus==='requesting'?'Connecting to GPS for live location updates…':'Live GPS is unavailable. The request remains high priority, but doctors may not receive your current position.'}</p>
        {locationNotice&&<p className="text-sm">{locationNotice}</p>}
        {location&&<p className="text-sm">Last known position: {mapService.label(location)}</p>}
        {gpsStatus==='unavailable'&&<button type="button" className="btn-s mt-2" onClick={()=>{setError('');setGpsRetry(value=>value+1)}}>Retry GPS tracking</button>}
      </div>
      <button type="button" className="btn-p" onClick={startNewRequest}>Start another guest request</button>
      <p className="text-sm">This request remains saved in the backend. Its private tracking access is kept in this browser session; do not share this device while the request is active.</p>
    </section>}
    <p className="text-sm">Already have an account? <Link className="underline" to="/login">Sign in</Link>. Need to register? <Link className="underline" to="/login?mode=register">Create an account</Link>.</p>
  </div>;
}