// Email to HQ for the things that should not wait for someone to open the admin: a large sale held for review, a missing-points report, a
// high-priority store alert, and a short morning summary. Before, the only alerts for admins were an inbox the admin web never shows and a
// list that exists only while the page is open.
//
// Sent through Resend (utils/email.ts, silently skipped when RESEND_API_KEY is not set). Recipients: every active Super Admin and Dev Admin who has
// an email address on file, plus ADMIN_EMAIL.

import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { sendEmail } from './email';

// The amount from which a held sale is also emailed is HQ's (Settings > Sales review, rule reviewEmailHQAmount, 2026-10-17); it was a fixed $500 here
export const ADMIN_URL = 'https://admin.luckystop.cliffindus.com';

export const escapeHtml = (text: unknown) =>
  String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The HQ emails, each of which a person can switch off on their admin profile. */
export const HQ_EMAIL_KINDS = ['MORNING_SUMMARY', 'WEEKLY_SUMMARY', 'LARGE_SALE', 'MISSING_POINTS', 'STORE_ALERT'] as const;
export type HqEmailKind = typeof HQ_EMAIL_KINDS[number];

/** Who gets this kind of email: every active Super Admin and Dev Admin with an address who has not switched it off, plus ADMIN_EMAIL. */
export async function hqEmailAddresses(kind?: HqEmailKind): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: {
      role: { in: [Role.SUPER_ADMIN, Role.DEV_ADMIN] }, isActive: true, email: { not: null },
      ...(kind ? { NOT: { emailAlertsOff: { has: kind } } } : {}),
    },
    select: { email: true },
  });
  const all = new Set(rows.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean));
  if (process.env.ADMIN_EMAIL) all.add(process.env.ADMIN_EMAIL.trim().toLowerCase());
  return [...all];
}

/** More of an email (2026-10-16, the morning summary): titled groups of lines, and a small table. Everything in them is escaped. */
export interface EmailExtras {
  sections?: { title: string; lines: string[]; tone?: 'warning' }[];
  table?: { title: string; head: string[]; rows: (string | number)[][]; foot?: (string | number)[] };
}

function extrasHtml(x?: EmailExtras): string {
  if (!x) return '';
  const cell = 'padding:6px 10px;border-bottom:1px solid #e4e7ec;font-family:sans-serif;font-size:13px;';
  const sections = (x.sections ?? []).filter((s) => s.lines.length).map((s) => `
      <h3 style="color:${s.tone === 'warning' ? '#8a5300' : '#1D3557'};font-family:sans-serif;font-size:15px;margin:18px 0 6px;">${escapeHtml(s.title)}</h3>
      <div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#111827;">${s.lines.map((l) => `<p style="margin:4px 0;">${escapeHtml(l)}</p>`).join('')}</div>`).join('');
  const t = x.table && x.table.rows.length ? `
      <h3 style="color:#1D3557;font-family:sans-serif;font-size:15px;margin:18px 0 6px;">${escapeHtml(x.table.title)}</h3>
      <table style="border-collapse:collapse;width:100%;max-width:640px;">
        <tr>${x.table.head.map((h, i) => `<th style="${cell}text-align:${i ? 'right' : 'left'};color:#5a6472;font-weight:600;">${escapeHtml(h)}</th>`).join('')}</tr>
        ${x.table.rows.map((r) => `<tr>${r.map((v, i) => `<td style="${cell}text-align:${i ? 'right' : 'left'};">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}
        ${x.table.foot ? `<tr>${x.table.foot.map((v, i) => `<td style="${cell}text-align:${i ? 'right' : 'left'};font-weight:700;">${escapeHtml(v)}</td>`).join('')}</tr>` : ''}
      </table>` : '';
  return sections + t;
}

/** A short email with a heading, a few lines and a button into the admin. Never throws: an email problem must not fail the sale or the report that caused it. */
export async function emailHQ(subject: string, heading: string, lines: string[], link: { path: string; label: string }, kind?: HqEmailKind, extras?: EmailExtras): Promise<void> {
  try {
    const to = await hqEmailAddresses(kind);
    if (to.length === 0) return;
    const html = `
      <h2 style="color:#1D3557;font-family:sans-serif;">${escapeHtml(heading)}</h2>
      <div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#111827;">${lines.map((l) => `<p style="margin:4px 0;">${escapeHtml(l)}</p>`).join('')}</div>
      ${extrasHtml(extras)}
      <p style="margin-top:16px;"><a href="${ADMIN_URL}${link.path}" style="background:#1D3557;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-family:sans-serif;">${escapeHtml(link.label)}</a></p>`;
    await sendEmail(to, subject, html);
  } catch (err) {
    console.error('[adminEmail] failed:', (err as Error).message);
  }
}
