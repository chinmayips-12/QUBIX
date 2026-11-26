import {api} from './api';

export const guestService = {
  createEmergency: (body: {
    name: string;
    phone: string;
    emergencyContact?: string;
    contactConsent?: boolean;
    medicalInfo?: string;
    address?: string;
    lat?: number;
    lng?: number;
  }) => api('/requests/guest-sos', 'POST', body),
  getRequest: (id: string, token: string) =>
    api(`/guest/requests/${encodeURIComponent(id)}`, 'GET', undefined, token),
  updateLocation: (id: string, token: string, lat: number, lng: number) =>
    api(`/guest/requests/${encodeURIComponent(id)}/location`, 'PATCH', {lat, lng}, token),
};
