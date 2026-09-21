// Email to HQ for the things that should not wait for someone to open the admin: a large sale held for review, a missing-points report, a
// high-priority store alert, and a short morning summary. Before, the only alerts for admins were an inbox the admin web never shows and a
// list that exists only while the page is open.
//
// Sent through Resend (utils/email.ts, silently skipped when RESEND_API_KEY is not set). Recipients: every active Super Admin and Dev Admin who has
// an email address on file, plus ADMIN_EMAIL.

import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { sendEmail } from './email';

export const URGENT_SALE_AMOUNT = 500;
export const ADMIN_URL = 'https://admin.luckystop.cliffindus.com';

export const escapeHtml = (text: unknown) =>
  String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function hqEmailAddresses(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: { in: [Role.SUPER_ADMIN, Role.DEV_ADMIN] }, isActive: true, email: { not: null } },
    select: { email: true },
  });
  const all = new Set(rows.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean));
  if (process.env.ADMIN_EMAIL) all.add(process.env.ADMIN_EMAIL.trim().toLowerCase());
  return [...all];
}

/** A short email with a heading, a few lines and a button into the admin. Never throws: an email problem must not fail the sale or the report that caused it. */
export async function emailHQ(subject: string, heading: string, lines: string[], link: { path: string; label: string }): Promise<void> {
  try {
    const to = await hqEmailAddresses();
    if (to.length === 0) return;
    const html = `
      <h2 style="color:#1D3557;font-family:sans-serif;">${escapeHtml(heading)}</h2>
      <div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#111827;">${lines.map((l) => `<p style="margin:4px 0;">${escapeHtml(l)}</p>`).join('')}</div>
      <p style="margin-top:16px;"><a href="${ADMIN_URL}${link.path}" style="background:#1D3557;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-family:sans-serif;">${escapeHtml(link.label)}</a></p>`;
    await sendEmail(to, subject, html);
  } catch (err) {
    console.error('[adminEmail] failed:', (err as Error).message);
  }
}
