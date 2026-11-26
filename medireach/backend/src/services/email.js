export async function sendEmailOtp(recipient, code) {
  if (process.env.RESEND_API_KEY || process.env.RESEND_FROM_EMAIL) {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return { status: 'provider_error' };
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL,
        to: [recipient],
        subject: 'Your MediReach verification code',
        text: `Your MediReach verification code is ${code}. It expires in five minutes.`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    return { status: response.ok && !result.error ? 'sent' : 'provider_error' };
  }
  if (!!process.env.EMAIL_PROVIDER_URL !== !!process.env.EMAIL_PROVIDER_TOKEN) {
    return { status: 'provider_error' };
  }
  if (!process.env.EMAIL_PROVIDER_URL || !process.env.EMAIL_PROVIDER_TOKEN) {
    return { status: 'provider_not_configured' };
  }
  const response = await fetch(process.env.EMAIL_PROVIDER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.EMAIL_PROVIDER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: recipient,
      subject: 'Your MediReach verification code',
      text: `Your MediReach verification code is ${code}. It expires in five minutes.`,
    }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json().catch(() => ({}));
  return { status: response.ok && !result.error ? 'sent' : 'provider_error' };
}
