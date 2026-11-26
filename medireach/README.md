# MediReach – Healthcare, Closer When It Matters.
Bilingual (English/Kannada) location-based healthcare coordination platform. Demo doctors are simulated, not genuinely verified. The backend persists records in a native SQLite database at `backend/data/medireach.sqlite`; uploaded profiles and certificates are stored privately under `backend/private-files/`. Set up an official registry, SMS provider, map and realtime services before production use.

## Run
```
cd backend && npm i && npm start      # http://localhost:4000
cd frontend && npm i && npm run dev   # http://localhost:5173
```
Demo logins (password `demo1234`): patient@demo.com, doctor@demo.com (demo account; cannot receive requests), newdoc@demo.com, admin@demo.com. Use the separate Admin Login link for the admin account.

## Journey
Patient: SOS/Request → verified doctors can accept (first wins) → travelling → patient shares a private, expiring OTP on arrival → completed → patient may submit one rating and optional comment for that service. Guest patients can submit a one-tap high-priority request without registering; GPS is requested automatically and real location updates are shared while the browser page is open and permission remains enabled.
Admin: inspect and edit patient details, review doctors and submitted documents, view request statuses, and approve or reject doctor verification.
Registration accepts either an email address or mobile number and requires a one-time verification code. Doctor registration separates account details from medical credentials and records experience. When email delivery is unconfigured in non-production mode, the UI clearly shows the demo OTP `123456`; this fallback is disabled in production. Mobile registration always requires a configured SMS provider.

## Architecture / future APIs
`frontend/src/services/*` are the only layer UI talks to. Guest SOS progress animation is development-only and explicitly simulated; actual assignment comes only from the backend. Maps and tracking are labelled demo mode until connected. For real mobile OTP delivery, set `MSG91_AUTH_KEY`, an approved `MSG91_TEMPLATE_ID`, and the correct `MSG91_DEFAULT_COUNTRY_CODE` in the backend `.env` file; never put credentials in frontend code or share them publicly. For email OTP, set `RESEND_API_KEY` and a verified `RESEND_FROM_EMAIL`. Generic HTTP adapters remain available through `SMS_PROVIDER_URL`/`SMS_PROVIDER_TOKEN` and `EMAIL_PROVIDER_URL`/`EMAIL_PROVIDER_TOKEN`. Configure `MEDICAL_REGISTRY_URL` and `MEDICAL_REGISTRY_TOKEN` only for an authorized registry. The schema and row-level policies in `database/migrations/001_schema.sql` prepare a future Supabase integration. Node.js 22.5 or later is required for the built-in SQLite module.

## Not done yet (honest list)
Supabase wiring, provider-specific registry/SMS adapters, Google Maps directions, socket-based tracking, full Kannada coverage on every string, automated tests, complaint management UI, polished analytics charts.
