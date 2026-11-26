import { sendSms } from './sms.js';

export async function sendEmergencyAlerts({ patient, contacts, request, location }) {
  const recipients = contacts.filter(contact => contact.phone);
  const message = [
    `Emergency request from ${patient.name}.`,
    patient.medicalInfo ? `Medical information: ${patient.medicalInfo}` : '',
    location ? `Location: https://maps.google.com/?q=${location.lat},${location.lng}` : 'Location unavailable.',
  ].filter(Boolean).join(' ');
  return sendSms(recipients.map(contact => contact.phone), message, request.id);
}
