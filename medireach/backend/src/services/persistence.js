import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const file = path.resolve(process.env.MEDIREACH_DB_PATH || path.join(defaultRoot, 'medireach.sqlite'));
const root = path.dirname(file);
let connection;

function database() {
  if (connection) return connection;
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  connection = new DatabaseSync(file);
  connection.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, role TEXT NOT NULL, email TEXT, phone TEXT,
      council_reg_no TEXT, certificate_hash TEXT, payload TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
      ON users(email) WHERE email IS NOT NULL AND email <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
      ON users(phone) WHERE phone IS NOT NULL AND phone <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS users_council_reg_unique
      ON users(council_reg_no) WHERE council_reg_no IS NOT NULL AND council_reg_no <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS users_certificate_hash_unique
      ON users(certificate_hash) WHERE certificate_hash IS NOT NULL AND certificate_hash <> '';
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, doctor_id TEXT, status TEXT NOT NULL,
      priority TEXT NOT NULL, is_emergency INTEGER NOT NULL, created_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS requests_patient_idx ON requests(patient_id);
    CREATE INDEX IF NOT EXISTS requests_doctor_idx ON requests(doctor_id);
    CREATE INDEX IF NOT EXISTS requests_status_idx ON requests(status);
    CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, patient_id TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS contacts_patient_idx ON contacts(patient_id);
    CREATE TABLE IF NOT EXISTS history (row_id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notes_user_idx ON notes(user_id);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_otps (
      identifier TEXT PRIMARY KEY, channel TEXT NOT NULL, otp_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL,
      sent_at INTEGER NOT NULL, window_started_at INTEGER NOT NULL, send_count INTEGER NOT NULL
    );
  `);
  fs.chmodSync(file, 0o600);
  return connection;
}

const parsed = rows => rows.map(row => JSON.parse(row.payload));

export function loadDatabase() {
  if (!fs.existsSync(file)) return null;
  const db = database();
  const users = parsed(db.prepare('SELECT payload FROM users').all());
  if (!users.length) return null;
  const metadata = db.prepare('SELECT value FROM metadata WHERE key = ?').get('otpSecret');
  return {
    users,
    requests: parsed(db.prepare('SELECT payload FROM requests').all()),
    contacts: parsed(db.prepare('SELECT payload FROM contacts').all()),
    history: parsed(db.prepare('SELECT payload FROM history ORDER BY row_id').all()),
    notes: parsed(db.prepare('SELECT payload FROM notes').all()),
    authOtps: db.prepare('SELECT identifier, channel, otp_hash AS hash, expires_at AS expiresAt, attempts, sent_at AS sentAt, window_started_at AS windowStartedAt, send_count AS sendCount FROM auth_otps').all(),
    otpSecret: metadata?.value,
  };
}

export function saveDatabase(data) {
  const db = database();
  const statements = {
    user: db.prepare('INSERT INTO users (id, role, email, phone, council_reg_no, certificate_hash, payload) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    request: db.prepare('INSERT INTO requests (id, patient_id, doctor_id, status, priority, is_emergency, created_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    contact: db.prepare('INSERT INTO contacts (id, patient_id, payload) VALUES (?, ?, ?)'),
    history: db.prepare('INSERT INTO history (row_id, payload) VALUES (?, ?)'),
    note: db.prepare('INSERT INTO notes (id, user_id, payload) VALUES (?, ?, ?)'),
    metadata: db.prepare('INSERT INTO metadata (key, value) VALUES (?, ?)'),
    authOtp: db.prepare('INSERT INTO auth_otps (identifier, channel, otp_hash, expires_at, attempts, sent_at, window_started_at, send_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM users; DELETE FROM requests; DELETE FROM contacts; DELETE FROM history; DELETE FROM notes; DELETE FROM metadata; DELETE FROM auth_otps;');
    for (const user of data.users) statements.user.run(
      user.id, user.role, user.email || null, user.phone || null,
      user.councilRegNo || null, user.certificateHash || null, JSON.stringify(user),
    );
    for (const request of data.requests) statements.request.run(
      request.id, request.patientId, request.doctorId || null, request.status,
      request.priority || 'normal', request.isEmergency ? 1 : 0, request.createdAt, JSON.stringify(request),
    );
    data.contacts.forEach(contact => statements.contact.run(contact.id, contact.patientId, JSON.stringify(contact)));
    data.history.forEach((item, index) => statements.history.run(index + 1, JSON.stringify(item)));
    data.notes.forEach(note => statements.note.run(note.id, note.userId, JSON.stringify(note)));
    data.authOtps.forEach(otp => statements.authOtp.run(
      otp.identifier, otp.channel, otp.hash, otp.expiresAt, otp.attempts,
      otp.sentAt, otp.windowStartedAt, otp.sendCount,
    ));
    if (data.otpSecret) statements.metadata.run('otpSecret', data.otpSecret);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
