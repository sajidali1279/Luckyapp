import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = process.env.FROM_EMAIL || 'Lucky Stop <noreply@luckystop.cliffindus.com>';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return; // silently skip if not configured
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    console.error('[email] send failed:', err);
  }
}

/** Notify the DevAdmin inbox about a new job application. */
export async function notifyNewApplication(data: {
  name: string;
  phone: string;
  email?: string | null;
  position: string;
  storeName?: string | null;
}): Promise<void> {
  if (!ADMIN_EMAIL) return;
  const store = data.storeName ? ` — ${data.storeName}` : '';
  await sendEmail(
    ADMIN_EMAIL,
    `New Job Application: ${data.position}${store}`,
    `
      <h2 style="color:#CC2936;">New Job Application</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Name</td><td><strong>${data.name}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Phone</td><td>${data.phone}</td></tr>
        ${data.email ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Email</td><td>${data.email}</td></tr>` : ''}
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Position</td><td>${data.position.replace(/_/g, ' ')}</td></tr>
        ${data.storeName ? `<tr><td style="padding:4px 12px 4px 0;color:#666;">Store</td><td>${data.storeName}</td></tr>` : ''}
      </table>
      <p style="margin-top:16px;"><a href="https://admin.luckystop.cliffindus.com/careers" style="background:#CC2936;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;">Review in Admin</a></p>
    `,
  );
}

/** Email the applicant when their application status changes. */
export async function notifyApplicationStatusChange(data: {
  applicantEmail: string;
  applicantName: string;
  position: string;
  status: string;
}): Promise<void> {
  const messages: Record<string, string> = {
    REVIEWED: 'Your application has been reviewed by our team.',
    INTERVIEW: 'Congratulations! We would like to schedule an interview with you. Our team will be in touch shortly.',
    HIRED: 'We are pleased to offer you a position with Lucky Stop. Our team will contact you with next steps.',
    REJECTED: 'After careful consideration, we have decided to move forward with other candidates at this time. We appreciate your interest.',
  };
  const msg = messages[data.status];
  if (!msg) return;

  await sendEmail(
    data.applicantEmail,
    `Your Lucky Stop Application — ${data.position.replace(/_/g, ' ')}`,
    `
      <h2 style="color:#CC2936;">Application Update</h2>
      <p style="font-family:sans-serif;font-size:15px;">Hi ${data.applicantName},</p>
      <p style="font-family:sans-serif;font-size:15px;">${msg}</p>
      <p style="font-family:sans-serif;font-size:13px;color:#666;">Position applied for: <strong>${data.position.replace(/_/g, ' ')}</strong></p>
      <p style="font-family:sans-serif;font-size:13px;color:#888;">— Lucky Stop Team</p>
    `,
  );
}

/** Email a monthly billing invoice to a SuperAdmin. */
export async function sendBillingInvoiceEmail(to: string, data: {
  period: string;
  storeName: string;
  amount: number;
  isPaid: boolean;
}): Promise<void> {
  await sendEmail(
    to,
    `Lucky Stop Invoice — ${data.period} — ${data.storeName}`,
    `
      <h2 style="color:#CC2936;">Monthly Invoice</h2>
      <p style="font-family:sans-serif;font-size:15px;">Your billing statement for <strong>${data.period}</strong> is ready.</p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Store</td><td><strong>${data.storeName}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Amount Due</td><td><strong>$${data.amount.toFixed(2)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Status</td><td style="color:${data.isPaid ? '#2DC653' : '#CC2936'}">${data.isPaid ? 'PAID' : 'UNPAID'}</td></tr>
      </table>
      <p style="font-family:sans-serif;font-size:13px;color:#888;margin-top:16px;">Questions? Reply to this email or contact your Lucky Stop representative.</p>
    `,
  );
}
