/**
 * Email utility — STUB for development.
 * On deployment day, replace the body with Resend.com (or SendGrid) API call.
 * The function signature and return value must stay the same.
 */

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  // TODO (deployment day): wire up Resend.com
  //   import { Resend } from 'resend';
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({ from: 'noreply@luckystop.app', to, subject: 'Your Lucky Stop PIN reset code', html: `<p>Your code is <strong>${otp}</strong>. It expires in 10 minutes.</p>` });
  console.log(`[EMAIL STUB] OTP to ${to}: ${otp}`);
}
