export async function sendSms(recipients, message, requestId) {
  if (!recipients.length) return { status: 'no_contacts', recipients: 0 };
  if (!process.env.SMS_PROVIDER_URL || !process.env.SMS_PROVIDER_TOKEN) {
    return { status: 'demo_not_sent', recipients: recipients.length };
  }
  const response = await fetch(process.env.SMS_PROVIDER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SMS_PROVIDER_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipients, message, requestId }),
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.ok ? 'sent' : 'provider_error', recipients: recipients.length };
}

export async function sendPhoneOtp(phone, code) {
  if (process.env.MSG91_AUTH_KEY || process.env.MSG91_TEMPLATE_ID) {
    if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_TEMPLATE_ID) return { status: 'provider_error' };
    const digits = String(phone).replace(/\D/g, '');
    const countryCode = String(process.env.MSG91_DEFAULT_COUNTRY_CODE || '91').replace(/\D/g, '');
    const mobile = String(phone).startsWith('+') || digits.length > 10 ? digits : `${countryCode}${digits}`;
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', process.env.MSG91_TEMPLATE_ID);
    url.searchParams.set('mobile', mobile);
    url.searchParams.set('otp', code);
    const response = await fetch(url, {
      method: 'GET',
      headers: { authkey: process.env.MSG91_AUTH_KEY },
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    return { status: response.ok && result.type !== 'error' ? 'sent' : 'provider_error' };
  }
  if (!!process.env.SMS_PROVIDER_URL !== !!process.env.SMS_PROVIDER_TOKEN) {
    return { status: 'provider_error' };
  }
  if (!process.env.SMS_PROVIDER_URL || !process.env.SMS_PROVIDER_TOKEN) {
    return { status: 'provider_not_configured' };
  }
  return sendSms([phone], `Your MediReach registration code is ${code}. It expires in five minutes.`);
}
