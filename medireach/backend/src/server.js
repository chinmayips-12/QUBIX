import './config.js';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { matchDoctors } from './services/matching.js';
import { loadDatabase, saveDatabase } from './services/persistence.js';
import { readStoredFile, removeStoredFile, storeDataUrl } from './services/fileStorage.js';
import { verifyDoctorRegistration } from './services/doctorVerification.js';
import { sendEmergencyAlerts } from './services/emergencyNotifications.js';
import { sendEmailOtp } from './services/email.js';
import { sendPhoneOtp } from './services/sms.js';
import { validCoordinates } from './services/tracking.js';
import { createOtp, decryptOtp, matchesOtp } from './services/otp.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '16mb' }));
app.use((req, _res, next) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) req.body = {};
  next();
});

const uid = () => crypto.randomUUID();
const passwordHash = password => {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(password, salt, 32).toString('hex')}`;
};
const passwordMatches = (stored, password) => {
  const [, saltHex, hashHex] = stored.split('$');
  const actual = saltHex && hashHex
    ? crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 32).toString('hex')
    : crypto.scryptSync(password, 'medireach-demo-salt', 32).toString('hex');
  const expected = saltHex && hashHex ? hashHex : stored;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && crypto.timingSafeEqual(actualBytes, expectedBytes);
};
const initialDatabase = () => {
  const users = [];
  const addUser = (role, name, email, fields = {}) => users.push({
    id: uid(), role, name, email, phone: '', passwordHash: passwordHash('demo1234'), ...fields,
  });
  addUser('patient', 'Demo Patient', 'patient@demo.com', {
    medicalInfo: '', demo: true,
  });
  addUser('admin', 'Demo Admin', 'admin@demo.com', { demo: true });
  addUser('doctor', 'Dr. Asha Rao (DEMO)', 'doctor@demo.com', {
    specialization: 'Cardiologist', councilRegNo: 'DEMO-001', verified: false,
    verificationStatus: 'Demo', available: false, demo: true, lat: 12.98, lng: 77.6,
  });
  addUser('doctor', 'Dr. Ravi Kumar (DEMO)', 'ravi@demo.com', {
    specialization: 'General Physician', councilRegNo: 'DEMO-002', verified: false,
    verificationStatus: 'Demo', available: false, demo: true, lat: 12.95, lng: 77.58,
  });
  addUser('doctor', 'Dr. Meena S (DEMO)', 'meena@demo.com', {
    specialization: 'Emergency Medicine', councilRegNo: 'DEMO-003', verified: false,
    verificationStatus: 'Demo', available: false, demo: true, lat: 12.97, lng: 77.62,
  });
  addUser('doctor', 'Dr. New Applicant', 'newdoc@demo.com', {
    specialization: 'Cardiologist', councilRegNo: 'PENDING-9', verified: false,
    verificationStatus: 'Pending', available: false, demo: true, lat: 12.96, lng: 77.59,
  });
  return { users, requests: [], contacts: [], history: [], notes: [], authOtps: [], otpSecret: crypto.randomBytes(32).toString('hex') };
};

const storedDatabase = loadDatabase();
const db = storedDatabase || initialDatabase();
if (!Array.isArray(db.authOtps)) db.authOtps = [];
const tokens = new Map();
const guestSosRateLimits = new Map();
if (!db.otpSecret) db.otpSecret = crypto.randomBytes(32).toString('hex');
if (!storedDatabase) saveDatabase(db);
const publicUser = user => {
  const { passwordHash: _, ...safe } = user;
  return safe;
};
const publicDoctor = doctor => ({
  id: doctor.id, name: doctor.name, specialization: doctor.specialization,
  qualification: doctor.qualification, photoId: doctor.photoId, verified: doctor.verified,
  available: doctor.available, demo: !!doctor.demo, lat: doctor.lat ?? null, lng: doctor.lng ?? null,
});
const fail = (res, status, message) => res.status(status).json({ error: message });
const auth = (...roles) => (req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const user = db.users.find(candidate => candidate.id === tokens.get(token));
  if (!user) return fail(res, 401, 'Please log in');
  if (roles.length && !roles.includes(user.role)) return fail(res, 403, 'Not allowed');
  req.user = user;
  req.token = token;
  next();
};
const addNote = (userId, body) => db.notes.push({ id: uid(), userId, body, at: Date.now() });
const logStatus = (request, status, by) => {
  request.status = status;
  db.history.push({ requestId: request.id, status, by, at: Date.now() });
};
const required = (body, fields) => fields.filter(field => !String(body[field] ?? '').trim());
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPhone = value => /^\+?\d{10,15}$/.test(value || '');
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const persist = () => {
  try {
    saveDatabase(db);
  } catch (error) {
    try {
      const previous = loadDatabase();
      if (previous) Object.assign(db, previous);
    } catch (recoveryError) {
      error.recoveryError = recoveryError;
    }
    throw error;
  }
};
const secureHash = value => crypto.createHmac('sha256', db.otpSecret).update(String(value || '')).digest('hex');
const sameHash = (provided, expected) => {
  const providedBytes = Buffer.from(provided || '', 'hex');
  const expectedBytes = Buffer.from(expected || '', 'hex');
  return providedBytes.length === expectedBytes.length
    && providedBytes.length > 0
    && crypto.timingSafeEqual(providedBytes, expectedBytes);
};
const allowGuestSos = ip => {
  const now = Date.now();
  const entry = guestSosRateLimits.get(ip);
  if (!entry || now - entry.startedAt >= 15 * 60 * 1000) {
    guestSosRateLimits.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count += 1;
  return true;
};
const configuredOtpProvider = channel => channel === 'email'
  ? (!!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
    || !!(process.env.EMAIL_PROVIDER_URL && process.env.EMAIL_PROVIDER_TOKEN))
  : (!!(process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID)
    || !!(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_TOKEN));

app.get('/api/health', (_req, res) => res.json({ ok: true, persistence: 'sqlite' }));

app.post('/api/auth/otp/send', asyncHandler(async (req, res) => {
  const rawIdentifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim() : '';
  const channel = rawIdentifier.includes('@') ? 'email' : 'phone';
  const identifier = channel === 'email' ? rawIdentifier.toLowerCase() : rawIdentifier;
  if (!identifier || (channel === 'email' ? !validEmail(identifier) : !validPhone(identifier))) {
    return fail(res, 400, 'Enter a valid email address or mobile number');
  }
  if (db.users.some(user => user.email?.toLowerCase() === identifier || user.phone === identifier)) {
    return fail(res, 409, 'This email or mobile number is already registered');
  }
  const hasOtpProvider = configuredOtpProvider(channel);
  const demoEmailOtp = channel === 'email' && !hasOtpProvider && process.env.NODE_ENV !== 'production';
  if (!hasOtpProvider && !demoEmailOtp) {
    return fail(res, 503, `${channel === 'email' ? 'Email' : 'SMS'} OTP delivery is not configured. Please contact support.`);
  }
  const now = Date.now();
  const previous = db.authOtps.find(record => record.identifier === identifier);
  if (previous && now - previous.sentAt < 30_000) return fail(res, 429, 'Please wait before requesting another code');
  const sameWindow = previous && now - previous.windowStartedAt < 15 * 60 * 1000;
  const sendCount = sameWindow ? previous.sendCount + 1 : 1;
  if (sendCount > 3) return fail(res, 429, 'OTP request limit reached; try again later');
  const otp = demoEmailOtp ? createOtp(db.otpSecret, '123456') : createOtp(db.otpSecret);
  const record = {
    identifier, channel, hash: otp.hash, expiresAt: now + 5 * 60 * 1000,
    attempts: 0, sentAt: now, windowStartedAt: sameWindow ? previous.windowStartedAt : now, sendCount,
  };
  db.authOtps = db.authOtps.filter(item => item.identifier !== identifier).concat(record);
  persist();
  let delivery;
  try {
    delivery = demoEmailOtp
      ? { status: 'demo_not_sent' }
      : channel === 'email'
        ? await sendEmailOtp(identifier, otp.code)
        : await sendPhoneOtp(identifier, otp.code);
  } catch {
    console.error('Registration OTP delivery failed');
    db.authOtps = db.authOtps.filter(item => item.identifier !== identifier);
    persist();
    return fail(res, 502, 'The OTP provider could not deliver your code');
  }
  if (delivery.status === 'demo_not_sent' && demoEmailOtp) {
    return res.json({ mode: 'demo', message: 'Demo Mode: Use test OTP 123456', expiresAt: record.expiresAt });
  }
  if (delivery.status !== 'sent') {
    db.authOtps = db.authOtps.filter(item => item.identifier !== identifier);
    persist();
    if (delivery.status === 'provider_not_configured') {
      return fail(res, 503, `${channel === 'email' ? 'Email' : 'SMS'} OTP delivery is not configured. Please contact support.`);
    }
    return fail(res, 502, 'The OTP provider could not deliver your code');
  }
  res.json({ message: `OTP sent to your ${channel}.`, expiresAt: record.expiresAt });
}));

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const identifier = String(body.identifier || body.email || body.phone || '').trim();
  const isEmail = identifier.includes('@');
  const email = (typeof body.email === 'string' && body.email.trim()) || (isEmail ? identifier.toLowerCase() : '');
  const phone = (typeof body.phone === 'string' && body.phone.trim()) || (!isEmail ? identifier : '');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!name || !identifier || !password) return fail(res, 400, 'Name, email or mobile number, and password are required');
  if (!['patient', 'doctor'].includes(body.role)) return fail(res, 400, 'Invalid role');
  if (password.length < 8 || password.length > 200) return fail(res, 400, 'Password must be 8 to 200 characters');
  if ((email && !validEmail(email)) || (phone && !validPhone(phone))) {
    return fail(res, 400, 'Enter a valid email address or mobile number');
  }
  if (db.users.some(user => (email && user.email?.toLowerCase() === email.toLowerCase())
    || (phone && user.phone === phone))) return fail(res, 409, 'Email or phone already registered');
  const otpIdentifier = isEmail ? identifier.toLowerCase() : identifier;
  const authOtp = db.authOtps.find(record => record.identifier === otpIdentifier);
  if (!authOtp) return fail(res, 400, 'Request a verification code for your email or mobile number first');
  if (Date.now() > authOtp.expiresAt) return fail(res, 410, 'Verification code expired; request a new code');
  if (authOtp.attempts >= 5) return fail(res, 429, 'Verification attempt limit reached; request a new code');
  if (!matchesOtp(body.otp, authOtp.hash, db.otpSecret)) {
    authOtp.attempts += 1;
    persist();
    return fail(res, 400, 'Invalid verification code');
  }

  let doctorFields = {};
  if (body.role === 'doctor') {
    const needed = ['specialization', 'councilRegNo', 'qualification', 'medicalCollege', 'medicalCouncil', 'photoData', 'certificateData'];
    if (required(body, needed).length) return fail(res, 400, 'Complete the doctor profile and upload both required files');
    const submittedSpecialization = typeof body.specialization === 'string' ? body.specialization.trim() : '';
    const councilRegNo = String(body.councilRegNo).trim();
    const qualification = String(body.qualification).trim();
    const medicalCollege = String(body.medicalCollege).trim();
    const medicalCouncil = String(body.medicalCouncil).trim();
    const experience = body.experience === undefined || body.experience === '' ? 0 : Number(body.experience);
    if (!Number.isInteger(experience) || experience < 0 || experience > 70) {
      return fail(res, 400, 'Enter experience from 0 to 70 years');
    }
    const specialization = submittedSpecialization === 'Other'
      ? String(body.customSpecialization || '').trim() : submittedSpecialization;
    if (!specialization) return fail(res, 400, 'Enter the custom specialization');
    if (db.users.some(user => user.role === 'doctor' && user.councilRegNo?.toLowerCase() === councilRegNo.toLowerCase())) {
      return fail(res, 409, 'Medical council registration number already registered');
    }

    let photo;
    let certificate;
    try {
      photo = storeDataUrl(body.photoData, 'photo');
      certificate = storeDataUrl(body.certificateData, 'certificate');
    } catch (error) {
      if (photo) removeStoredFile(photo.id);
      if (certificate) removeStoredFile(certificate.id);
      return fail(res, 400, error.message);
    }
    if (db.users.some(user => user.role === 'doctor' && user.certificateHash === certificate.sha256)) {
      removeStoredFile(photo.id);
      removeStoredFile(certificate.id);
      return fail(res, 409, 'This registration certificate has already been submitted');
    }
    const applicant = {
      name,
      councilRegNo,
      medicalCouncil,
      certificateHash: certificate.sha256,
    };
    const verification = await verifyDoctorRegistration(applicant);
    doctorFields = {
      specialization,
      customSpecialization: body.specialization === 'Other' ? specialization : '',
      qualification,
      medicalCollege,
      medicalCouncil,
      experience,
      councilRegNo,
      photoId: photo.id,
      certificateId: certificate.id,
      certificateHash: certificate.sha256,
      verificationStatus: verification.status,
      verificationNote: verification.note,
      verified: verification.status === 'Verified',
      available: false,
    };
  }

  const user = {
    id: uid(), role: body.role, name, email: email || '',
    phone: phone || '', passwordHash: passwordHash(password),
    medicalInfo: String(body.medicalInfo || '').slice(0, 1000),
    ...(body.role === 'doctor' ? doctorFields : {}),
  };
  db.users.push(user);
  db.authOtps = db.authOtps.filter(record => record.identifier !== otpIdentifier);
  const token = uid();
  tokens.set(token, user.id);
  try {
    persist();
  } catch (error) {
    tokens.delete(token);
    if (user.photoId) removeStoredFile(user.photoId);
    if (user.certificateId) removeStoredFile(user.certificateId);
    throw error;
  }
  res.json({ token, user: publicUser(user) });
}));

app.post('/api/auth/login', (req, res) => {
  const body = req.body || {};
  const identifier = String(body.identifier || body.email || body.phone || '').trim();
  const password = typeof body.password === 'string' ? body.password : '';
  const user = db.users.find(candidate => candidate.email?.toLowerCase() === identifier.toLowerCase()
    || candidate.phone === identifier);
  if (!user || password.length > 200 || !passwordMatches(user.passwordHash, password)) {
    return fail(res, 401, 'Wrong email/mobile number or password');
  }
  const token = uid();
  tokens.set(token, user.id);
  res.json({ token, user: publicUser(user) });
});
app.post('/api/auth/logout', auth(), (req, res) => {
  tokens.delete(req.token);
  res.json({ ok: true });
});
app.get('/api/me', auth(), (req, res) => res.json(publicUser(req.user)));
app.patch('/api/me', auth('patient'), (req, res) => {
  req.user.medicalInfo = String(req.body.medicalInfo || '').slice(0, 1000);
  persist();
  res.json(publicUser(req.user));
});

app.get('/api/doctors', auth('patient', 'admin'), (req, res) => {
  const doctors = db.users.filter(user => user.role === 'doctor'
    && (req.user.role === 'admin' || (user.verified && user.verificationStatus === 'Verified' && !user.demo)))
    .filter(user => !req.query.specialization || user.specialization === req.query.specialization);
  res.json(doctors.map(publicDoctor));
});
app.patch('/api/doctors/me/availability', auth('doctor'), (req, res) => {
  if (req.body.available && (!req.user.verified || req.user.verificationStatus !== 'Verified' || req.user.demo)) {
    return fail(res, 403, 'Only approved, verified doctors can go online');
  }
  req.user.available = !!req.body.available;
  persist();
  res.json(publicUser(req.user));
});

const requestView = (request, viewer) => {
  const patient = db.users.find(user => user.id === request.patientId);
  const doctor = db.users.find(user => user.id === request.doctorId);
  const {
    otpHash: _, otpEncrypted: __, otpExpiresAt: ___, otpAttempts: ____,
    otp: _____, rejectedBy: ______, guestAccessHash: _______, guestEmergencyContact: ________,
    guestPatient: guestProfile, ...safeRequest
  } = request;
  return {
    ...safeRequest,
    patient: guestProfile
      ? { name: guestProfile.name, phone: guestProfile.phone, medicalInfo: guestProfile.medicalInfo }
      : viewer.role === 'patient' ? undefined : {
        name: patient?.name, email: patient?.email, phone: patient?.phone, medicalInfo: patient?.medicalInfo,
      },
    doctor: doctor ? {
      id: doctor.id, name: doctor.name, phone: doctor.phone,
      specialization: doctor.specialization, photoId: doctor.photoId,
      verified: doctor.verified && doctor.verificationStatus === 'Verified',
      demo: !!doctor.demo, lat: doctor.lat ?? null, lng: doctor.lng ?? null,
    } : null,
  };
};

async function createRequest(patient, body, emergency = false, guestDetails = null) {
  const lat = validCoordinates(body.lat, body.lng) ? body.lat : patient.lat ?? null;
  const lng = validCoordinates(body.lat, body.lng) ? body.lng : patient.lng ?? null;
  if (!emergency && !body.address && lat == null) {
    const error = new Error('Location or address required');
    error.statusCode = 400;
    throw error;
  }
  const request = {
    id: uid(), patientId: patient.id, concern: emergency ? 'emergency' : body.concern,
    notes: String(body.notes || '').slice(0, 1000), medicalInfo: patient.medicalInfo || '',
    address: String(body.address || '').slice(0, 500), lat, lng,
    priority: emergency ? 'high' : 'normal', isEmergency: emergency,
    status: 'submitted', doctorId: null, rejectedBy: [],
    createdAt: Date.now(), locationUpdatedAt: null,
    patientLocationUpdatedAt: guestDetails && lat != null ? Date.now() : null,
    reassignments: 0,
    ...(guestDetails ? {
      guestPatient: guestDetails.patient,
      guestEmergencyContact: guestDetails.emergencyContact,
      guestAccessHash: guestDetails.accessHash,
    } : {}),
  };
  db.requests.push(request);
  logStatus(request, 'submitted', patient.id);
  const matches = matchDoctors(db.users.filter(user => user.role === 'doctor'), request);
  matches.forEach(match => addNote(match.id, emergency ? 'High-priority emergency request available' : 'New patient request'));
  persist();
  let alertDelivery;
  if (emergency) {
    alertDelivery = await sendEmergencyAlerts({
      patient,
      contacts: guestDetails
        ? (guestDetails.emergencyContact ? [{ phone: guestDetails.emergencyContact }] : [])
        : db.contacts.filter(contact => contact.patientId === patient.id),
      request,
      location: lat == null ? null : { lat, lng },
    }).catch(error => {
      console.error('Emergency notification provider failed:', error.message);
      return { status: 'provider_error', recipients: 0 };
    });
  }
  return {
    request: requestView(request, { role: guestDetails ? 'guest' : 'patient' }),
    matches, matchedDoctorCount: matches.length, noMatch: matches.length === 0, alertDelivery,
  };
}

app.post('/api/requests', auth('patient'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (!['chest', 'breathing', 'fever', 'injury', 'general', 'other'].includes(body.concern)) {
    return fail(res, 400, 'Choose a concern');
  }
  res.json(await createRequest(req.user, body));
}));
app.post('/api/requests/sos', auth('patient'), asyncHandler(async (req, res) => {
  res.json(await createRequest(req.user, req.body || {}, true));
}));
app.post('/api/requests/guest-sos', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const emergencyContact = typeof body.emergencyContact === 'string' ? body.emergencyContact.trim() : '';
  const medicalInfo = typeof body.medicalInfo === 'string' ? body.medicalInfo.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const hasCoordinates = body.lat !== undefined || body.lng !== undefined;
  if (name.length > 100 || (phone && !validPhone(phone))) {
    return fail(res, 400, 'Enter a valid name and callback mobile number');
  }
  if (emergencyContact && !validPhone(emergencyContact)) {
    return fail(res, 400, 'Enter a valid alternate contact number');
  }
  if (emergencyContact && body.contactConsent !== true) {
    return fail(res, 400, 'Consent is required before alerting an alternate contact');
  }
  if (medicalInfo.length > 1000 || address.length > 500) {
    return fail(res, 400, 'Medical information or address is too long');
  }
  if (hasCoordinates && !validCoordinates(body.lat, body.lng)) {
    return fail(res, 400, 'Enter a valid GPS location');
  }
  if (!allowGuestSos(req.socket.remoteAddress || 'unknown')) {
    return fail(res, 429, 'Too many guest emergency requests; try again in 15 minutes');
  }
  const guestAccessToken = crypto.randomBytes(32).toString('base64url');
  const lat = hasCoordinates ? body.lat : null;
  const lng = hasCoordinates ? body.lng : null;
  const guestPatient = {
    name: name || 'Guest patient',
    phone,
    medicalInfo: medicalInfo.slice(0, 1000),
  };
  const patient = { id: `guest:${uid()}`, ...guestPatient, lat, lng };
  const result = await createRequest(patient, { address: address.slice(0, 500), lat, lng }, true, {
    patient: guestPatient,
    emergencyContact: body.contactConsent === true ? emergencyContact : '',
    accessHash: secureHash(guestAccessToken),
  });
  res.status(201).json({ ...result, guestAccessToken });
}));
app.get('/api/guest/requests/:id', (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id);
  if (!request || !request.guestAccessHash
    || !sameHash(secureHash(req.get('X-Guest-Token')), request.guestAccessHash)) {
    return fail(res, 401, 'Guest request access is invalid or expired');
  }
  const matchedDoctorCount = request.status === 'submitted' && !request.doctorId
    ? matchDoctors(db.users.filter(user => user.role === 'doctor'), request).length : 0;
  res.json({
    ...requestView(request, { role: 'guest' }),
    noMatch: request.status === 'submitted' && !request.doctorId && matchedDoctorCount === 0,
    matchedDoctorCount,
    trackingMode: request.locationUpdatedAt ? 'live-gps' : 'demo-no-live-gps',
  });
});
app.patch('/api/guest/requests/:id/location', (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id);
  if (!request || !request.guestAccessHash
    || !sameHash(secureHash(req.get('X-Guest-Token')), request.guestAccessHash)) {
    return fail(res, 401, 'Guest request access is invalid or expired');
  }
  if (!validCoordinates(req.body.lat, req.body.lng)) return fail(res, 400, 'Enter a valid GPS location');
  request.lat = req.body.lat;
  request.lng = req.body.lng;
  request.patientLocationUpdatedAt = Date.now();
  persist();
  res.json({ ok: true, locationUpdatedAt: request.patientLocationUpdatedAt });
});
app.get('/api/requests', auth(), (req, res) => {
  const user = req.user;
  let requests = db.requests;
  if (user.role === 'patient') requests = requests.filter(request => request.patientId === user.id);
  else if (user.role === 'doctor') {
    const matches = requests.filter(request => request.status === 'submitted'
      && user.verified && user.verificationStatus === 'Verified' && user.available && !user.demo
      && matchDoctors([user], request).length);
    requests = requests.filter(request => request.doctorId === user.id).concat(matches);
  }
  for (const request of requests) {
    if (request.status === 'accepted' && !request.travelAlertedAt
      && Date.now() - request.acceptedAt > 5 * 60 * 1000) {
      request.travelAlertedAt = Date.now();
      addNote(request.patientId, 'Your doctor has not started travelling yet.');
      persist();
    }
  }
  res.json(requests.map(request => ({
    ...requestView(request, user),
    notTravellingYet: request.status === 'accepted' && Date.now() - request.acceptedAt > 5 * 60 * 1000,
    trackingMode: request.locationUpdatedAt ? 'live-gps' : 'demo-no-live-gps',
  })).sort((a, b) => b.createdAt - a.createdAt));
});
app.get('/api/requests/:id/arrival-otp', auth('patient'), (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id && item.patientId === req.user.id);
  if (!request || !request.otpEncrypted) return fail(res, 404, 'Arrival OTP is unavailable');
  res.json({ otp: decryptOtp(request.otpEncrypted, db.otpSecret), expiresAt: request.otpExpiresAt });
});
app.post('/api/requests/:id/accept', auth('doctor'), (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id);
  if (!request) return fail(res, 404, 'Not found');
  if (!req.user.verified || req.user.verificationStatus !== 'Verified' || req.user.demo || !req.user.available) {
    return fail(res, 403, 'Only approved, verified doctors who are online can accept requests');
  }
  if (request.status !== 'submitted' || request.doctorId) return fail(res, 409, 'Already accepted by another doctor');
  if (!matchDoctors([req.user], request).length) return fail(res, 403, 'This request does not match your verified specialization');
  request.doctorId = req.user.id;
  request.acceptedAt = Date.now();
  const arrivalOtp = createOtp(db.otpSecret);
  request.otpEncrypted = arrivalOtp.encrypted;
  request.otpHash = arrivalOtp.hash;
  request.otpExpiresAt = arrivalOtp.expiresAt;
  request.otpAttempts = arrivalOtp.attempts;
  logStatus(request, 'accepted', req.user.id);
  addNote(request.patientId, 'A verified doctor accepted your request.');
  persist();
  res.json(requestView(request, req.user));
});
app.post('/api/requests/:id/reject', auth('doctor'), (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id && item.status === 'submitted');
  if (!request) return fail(res, 409, 'Cannot reject');
  if (!req.user.verified || req.user.verificationStatus !== 'Verified' || !req.user.available
    || !matchDoctors([req.user], request).length) return fail(res, 403, 'Only eligible verified doctors can reject this request');
  request.rejectedBy ||= [];
  request.rejectedBy.push(req.user.id);
  persist();
  res.json({ ok: true });
});
app.post('/api/requests/:id/status', auth('doctor', 'patient'), (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id);
  if (!request) return fail(res, 404, 'Not found');
  const status = req.body.status;
  if (req.user.role === 'patient') {
    if (request.patientId !== req.user.id || status !== 'cancelled'
      || ['completed', 'cancelled', 'arrived'].includes(request.status)) return fail(res, 400, 'Invalid status');
    logStatus(request, 'cancelled', req.user.id);
    persist();
    return res.json(requestView(request, req.user));
  }
  if (request.doctorId !== req.user.id) return fail(res, 403, 'Not your request');
  if (status === 'cancelled' && ['accepted', 'travelling'].includes(request.status)) {
    request.rejectedBy ||= [];
    request.rejectedBy.push(req.user.id);
    request.doctorId = null;
    request.otpEncrypted = null;
    request.otpHash = null;
    request.otpExpiresAt = null;
    request.locationUpdatedAt = null;
    request.reassignments += 1;
    logStatus(request, 'submitted', req.user.id);
    addNote(request.patientId, 'Your doctor cancelled; the request is available for reassignment.');
    persist();
    return res.json(requestView(request, req.user));
  }
  const allowed = { travelling: 'accepted', completed: 'arrived' };
  if (allowed[status] !== request.status) return fail(res, 400, `Cannot go from ${request.status} to ${status}`);
  logStatus(request, status, req.user.id);
  addNote(request.patientId, `Request status: ${status}`);
  if (status === 'completed') {
    db.history.push({
      requestId: request.id, summary: 'Visit completed', fee: 500,
      at: Date.now(), doctorId: req.user.id, patientId: request.patientId, consult: true,
    });
  }
  persist();
  res.json(requestView(request, req.user));
});
app.post('/api/requests/:id/feedback', auth('patient'), (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id && item.patientId === req.user.id);
  if (!request) return fail(res, 404, 'Not found');
  if (request.status !== 'completed') return fail(res, 409, 'Feedback is available after the service is completed');
  if (request.feedback) return fail(res, 409, 'Feedback has already been submitted for this service');
  const rating = req.body?.rating;
  const comment = req.body?.comment === undefined ? '' : req.body.comment;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5
    || typeof comment !== 'string' || comment.trim().length > 1000) {
    return fail(res, 400, 'Choose a rating from 1 to 5 and keep feedback under 1000 characters');
  }
  request.feedback = { rating, comment: comment.trim(), createdAt: Date.now() };
  persist();
  res.status(201).json({ feedback: request.feedback });
});
app.patch('/api/requests/:id/location', auth('doctor', 'patient'), asyncHandler(async (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id);
  if (!request) return fail(res, 404, 'Request not found');
  if (req.user.role === 'patient'
    ? request.patientId !== req.user.id || !request.isEmergency || ['completed', 'cancelled'].includes(request.status)
    : request.doctorId !== req.user.id || request.status !== 'travelling') {
    return fail(res, 403, 'Not allowed to update this request location');
  }
  if (!validCoordinates(req.body.lat, req.body.lng)) return fail(res, 400, 'Valid GPS coordinates required');
  if (req.user.role === 'doctor') {
    req.user.lat = req.body.lat;
    req.user.lng = req.body.lng;
    request.locationUpdatedAt = Date.now();
  } else {
    request.lat = req.body.lat;
    request.lng = req.body.lng;
    request.patientLocationUpdatedAt = Date.now();
  }
  persist();
  if (req.user.role === 'patient') {
    const alertDelivery = await sendEmergencyAlerts({
      patient: req.user,
      contacts: db.contacts.filter(contact => contact.patientId === req.user.id),
      request,
      location: { lat: request.lat, lng: request.lng },
    }).catch(error => {
      console.error('Emergency location notification failed:', error.message);
      return { status: 'provider_error', recipients: 0 };
    });
    return res.json({ ok: true, alertDelivery });
  }
  res.json({ ok: true, locationUpdatedAt: request.locationUpdatedAt });
}));
app.post('/api/requests/:id/otp', auth('doctor'), (req, res) => {
  const request = db.requests.find(item => item.id === req.params.id && item.doctorId === req.user.id);
  if (!request || request.status !== 'travelling') return fail(res, 400, 'Invalid arrival request');
  if (Date.now() > request.otpExpiresAt) return fail(res, 400, 'Arrival OTP expired; contact support');
  if (request.otpAttempts >= 5) return fail(res, 429, 'Arrival OTP attempt limit reached');
  request.otpAttempts += 1;
  if (!matchesOtp(req.body.otp, request.otpHash, db.otpSecret)) {
    persist();
    return fail(res, 400, 'Wrong OTP');
  }
  request.otpEncrypted = null;
  request.otpHash = null;
  request.otpExpiresAt = null;
  logStatus(request, 'arrived', req.user.id);
  addNote(request.patientId, 'Your doctor has arrived.');
  persist();
  res.json(requestView(request, req.user));
});

app.get('/api/contacts', auth('patient'), (req, res) => res.json(db.contacts.filter(contact => contact.patientId === req.user.id)));
app.post('/api/contacts', auth('patient'), (req, res) => {
  const body = req.body || {};
  if (typeof body.name !== 'string' || typeof body.phone !== 'string'
    || required(body, ['name', 'phone']).length || !validPhone(body.phone)) {
    return fail(res, 400, 'Valid name and phone required');
  }
  const contact = {
    id: uid(), patientId: req.user.id, name: body.name.trim(),
    phone: body.phone, consent: !!body.consent,
  };
  db.contacts.push(contact);
  persist();
  res.json(contact);
});
app.delete('/api/contacts/:id', auth('patient'), (req, res) => {
  db.contacts = db.contacts.filter(contact => !(contact.id === req.params.id && contact.patientId === req.user.id));
  persist();
  res.json({ ok: true });
});
app.get('/api/history', auth(), (req, res) => res.json(db.history.filter(item => item.consult
  && (item.patientId === req.user.id || item.doctorId === req.user.id || req.user.role === 'admin'))));
app.get('/api/notifications', auth(), (req, res) => res.json(db.notes.filter(note => note.userId === req.user.id).reverse()));

app.get('/api/admin/stats', auth('admin'), (req, res) => {
  const doctors = db.users.filter(user => user.role === 'doctor' && !user.demo);
  res.json({
    patients: db.users.filter(user => user.role === 'patient' && !user.demo).length,
    doctors: doctors.length,
    verified: doctors.filter(user => user.verificationStatus === 'Verified').length,
    pending: doctors.filter(user => user.verificationStatus === 'Pending').length,
    demoAccounts: db.users.filter(user => user.demo).length,
    active: db.requests.filter(request => !['completed', 'cancelled'].includes(request.status)).length,
    completed: db.requests.filter(request => request.status === 'completed').length,
  });
});
app.get('/api/admin/doctors', auth('admin'), (req, res) => res.json(
  db.users.filter(user => user.role === 'doctor').map(publicUser),
));
app.get('/api/admin/patients', auth('admin'), (req, res) => res.json(
  db.users.filter(user => user.role === 'patient').map(publicUser),
));
app.patch('/api/admin/patients/:id', auth('admin'), (req, res) => {
  const patient = db.users.find(user => user.id === req.params.id && user.role === 'patient');
  if (!patient) return fail(res, 404, 'Patient not found');
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : patient.name;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : patient.email;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : patient.phone;
  if (!name || name.length > 100) return fail(res, 400, 'Enter a valid patient name');
  if (email && !validEmail(email)) return fail(res, 400, 'Enter a valid patient email');
  if (phone && !validPhone(phone)) return fail(res, 400, 'Enter a valid patient phone');
  if (!email && !phone) return fail(res, 400, 'A patient email or phone number is required');
  if (db.users.some(user => user.id !== patient.id && (
    (email && user.email?.toLowerCase() === email) || (phone && user.phone === phone)
  ))) return fail(res, 409, 'Email or phone already registered');
  patient.name = name;
  patient.email = email || '';
  patient.phone = phone || '';
  if (Object.hasOwn(body, 'medicalInfo')) patient.medicalInfo = String(body.medicalInfo || '').slice(0, 1000);
  patient.updatedAt = Date.now();
  persist();
  res.json(publicUser(patient));
});
app.get('/api/admin/contacts', auth('admin'), (req, res) => res.json(db.contacts));
app.get('/api/admin/requests', auth('admin'), (req, res) => res.json(
  db.requests.map(request => requestView(request, req.user)).sort((a, b) => b.createdAt - a.createdAt),
));
app.post('/api/admin/doctors/:id/verify', auth('admin'), (req, res) => {
  const doctor = db.users.find(user => user.id === req.params.id && user.role === 'doctor');
  if (!doctor) return fail(res, 404, 'Not found');
  const decision = req.body.decision || (req.body.approve ? 'Verified' : 'Requires Review/Rejected');
  if (!['Verified', 'Requires Review/Rejected'].includes(decision)) return fail(res, 400, 'Invalid verification decision');
  doctor.verificationStatus = decision;
  doctor.verified = decision === 'Verified';
  doctor.available = false;
  doctor.reviewedAt = Date.now();
  doctor.reviewedBy = req.user.id;
  addNote(doctor.id, doctor.verified ? 'Your profile was manually verified by an admin.' : 'Your profile requires review or was rejected.');
  persist();
  res.json(publicUser(doctor));
});

app.get('/api/files/:id', auth('patient', 'doctor', 'admin'), (req, res) => {
  const fileOwner = db.users.find(user => user.photoId === req.params.id || user.certificateId === req.params.id);
  const authorized = req.user.role === 'admin'
    || fileOwner?.id === req.user.id
    || (req.user.role === 'patient' && fileOwner?.role === 'doctor' && fileOwner.verified
      && fileOwner.verificationStatus === 'Verified' && fileOwner.photoId === req.params.id);
  if (!authorized) return fail(res, 403, 'Not allowed');
  const file = readStoredFile(req.params.id);
  if (!file) return fail(res, 404, 'File not found');
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(file.path);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (error.type === 'entity.too.large') return fail(res, 413, 'Uploaded data exceeds the allowed size');
  if (error instanceof SyntaxError && 'body' in error) return fail(res, 400, 'Invalid JSON body');
  if (Number.isInteger(error.statusCode)) return fail(res, error.statusCode, error.message);
  fail(res, 500, 'Server error');
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`MediReach API on :${port}`));
