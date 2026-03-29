import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not set — skipping email delivery');
    return;
  }
  await resend.emails.send({
    from: 'Lucky Stop <noreply@luckystop.app>',
    to,
    subject: 'Your Lucky Stop PIN reset code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1a2340;margin-bottom:8px">Lucky Stop PIN Reset</h2>
        <p style="color:#555;margin-bottom:24px">Use the code below to reset your PIN. It expires in <strong>10 minutes</strong>.</p>
        <div style="background:#f4f6fa;border-radius:12px;padding:24px;text-align:center;letter-spacing:8px;font-size:36px;font-weight:800;color:#1a2340">
          ${otp}
        </div>
        <p style="color:#999;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}
