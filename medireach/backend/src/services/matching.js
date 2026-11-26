const MAP={emergency:['General Physician','Emergency Medicine'],chest:['Cardiologist','Emergency Medicine'],breathing:['Pulmonologist','Emergency Medicine','General Physician'],fever:['General Physician'],injury:['Emergency Medicine','Orthopedist'],general:['General Physician'],other:['General Physician']};
export const km=(a,b,c,d)=>{if([a,b,c,d].some(v=>v==null))return null;const r=x=>x*Math.PI/180,h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return +(12742*Math.asin(Math.sqrt(h))).toFixed(1)};
// Only verified + online doctors with a relevant specialization. Ranked by specialization priority, then distance.
export function matchDoctors(doctors,req){const specs=MAP[req.concern]||MAP.other;
return doctors.filter(d=>d.verified&&d.verificationStatus==='Verified'&&!d.demo&&d.available&&specs.includes(d.specialization)&&!(req.rejectedBy||[]).includes(d.id))
.map(d=>({d,rank:specs.indexOf(d.specialization),dist:km(req.lat,req.lng,d.lat,d.lng)}))
.sort((a,b)=>req.isEmergency
? (a.dist??1e9)-(b.dist??1e9)||a.rank-b.rank
: a.rank-b.rank||(a.dist??1e9)-(b.dist??1e9))
.map(({d,dist})=>({id:d.id,name:d.name,specialization:d.specialization,photoId:d.photoId,verified:d.verified,demo:!!d.demo,distanceKm:dist}))}
