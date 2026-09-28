import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { Role } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';
import cloudinary from '../config/cloudinary';
import { sendPushToStoreManagers } from '../utils/push';
import { storeDateKey, addStoreDays, isRealDateKey } from '../utils/storeTime';

// A number from the report form: empty means not filled in; text, a negative or an impossible value is refused with the field's
// name (text used to be saved as NaN, which the pages then showed)
// A phone set to Spanish types a comma: in a price it is the decimal point ("3,19"), in gallons and counts it groups thousands
// ("1,250"). The old code read "3,19" as 3.
function reportNumber(v: unknown, name: string, max: number, whole = false, commaIsDecimal = false): number | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const raw = String(v).trim().replace(/\s/g, '');
  const n = Number(commaIsDecimal && !raw.includes('.') ? raw.replace(',', '.') : raw.replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > max || (whole && !Number.isInteger(n))) {
    throw new Error(`${name} must be ${whole ? 'a whole number' : 'a number'} from 0 to ${max.toLocaleString('en-US')}.`);
  }
  return n;
}

async function uploadImage(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'luckystop/daily-reports', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve((result as { secure_url: string }).secure_url))
    ).end(buffer);
  });
}

// POST /daily-reports
export async function createReport(req: AuthRequest, res: Response) {
  const user = req.user!;
  const userId = user.id;
  const requestedStoreId: string | undefined = req.body.storeId;
  // A client-supplied storeId must actually belong to this employee — don't
  // trust it blindly, only fall back to their own store if none was sent.
  // SuperAdmin+ are exempt (no UserStoreRole assignments of their own),
  // matching getReportsByDate/getTodayReports below.
  const userStoreIds: string[] = (user as any).storeIds ?? [];
  const storeId = hasMinRole(user.role, Role.SUPER_ADMIN)
    ? requestedStoreId
    : (requestedStoreId && userStoreIds.includes(requestedStoreId) ? requestedStoreId : userStoreIds[0]);

  if (!storeId) {
    res.status(400).json({ success: false, error: 'No store assigned to your account' });
    return;
  }

  const { reportDate, gasPrice, dieselPrice, regGasGal, midGradeGasGal, premiumGasGal, cigsCount, notes } = req.body;

  // The store day it is for: a real date, from a month back (a late report) to today at the store
  const today = storeDateKey();
  if (typeof reportDate !== 'string' || !isRealDateKey(reportDate)) {
    res.status(400).json({ success: false, error: 'Pick the day this report is for.' });
    return;
  }
  if (reportDate > today || reportDate < addStoreDays(today, -31)) {
    res.status(400).json({ success: false, error: 'A report can be for today or a day in the last month.' });
    return;
  }
  let nums;
  try {
    nums = {
      gasPrice: reportNumber(gasPrice, 'The gas price', 20, false, true),
      dieselPrice: reportNumber(dieselPrice, 'The diesel price', 20, false, true),
      regGasGal: reportNumber(regGasGal, 'Regular gallons', 100_000),
      midGradeGasGal: reportNumber(midGradeGasGal, 'Mid-grade gallons', 100_000),
      premiumGasGal: reportNumber(premiumGasGal, 'Premium gallons', 100_000),
      cigsCount: reportNumber(cigsCount, 'The cigarette count', 100_000, true),
    };
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
    return;
  }
  if (typeof notes === 'string' && notes.trim().length > 1000) {
    res.status(400).json({ success: false, error: 'Keep the notes under 1,000 characters.' });
    return;
  }

  let imageUrl: string | null = null;
  if (req.file) {
    imageUrl = await uploadImage(req.file.buffer);
  }

  const report = await prisma.dailyReport.create({
    data: {
      storeId,
      submittedById: userId,
      reportDate,
      ...nums,
      notes:         typeof notes === 'string' ? notes.trim() || null : null,
      imageUrl,
    },
    include: {
      submittedBy: { select: { id: true, name: true, phone: true } },
      store:       { select: { id: true, name: true } },
    },
  });

  const submitterName = report.submittedBy.name || report.submittedBy.phone || 'An employee';
  sendPushToStoreManagers(storeId, '📋 Daily Report Submitted', `${submitterName} submitted a daily report for ${reportDate}`);

  res.status(201).json({ success: true, data: report });
}

// GET /daily-reports/today?storeId=xxx&date=YYYY-MM-DD
export async function getTodayReports(req: AuthRequest, res: Response) {
  const user = req.user!;
  const requestedStoreId = req.query.storeId as string | undefined;
  // A client-supplied storeId must actually belong to this employee — don't
  // trust it blindly, only fall back to their own store if none was sent.
  // SuperAdmin+ have no UserStoreRole assignments of their own (chain-wide
  // access comes from role hierarchy instead), so they're exempt from the
  // ownership check, same as getReportsByDate below already does.
  const userStoreIds: string[] = (user as any).storeIds ?? [];
  const storeId = hasMinRole(user.role, Role.SUPER_ADMIN)
    ? requestedStoreId
    : (requestedStoreId && userStoreIds.includes(requestedStoreId) ? requestedStoreId : userStoreIds[0]);
  // Today at the store (Central): the server runs in UTC, where after 7 pm it is already tomorrow and today's reports went missing
  const asked = req.query.date as string | undefined;
  const date = asked && isRealDateKey(asked) ? asked : storeDateKey();

  if (!storeId) {
    res.status(400).json({ success: false, error: 'storeId required' });
    return;
  }

  const reports = await prisma.dailyReport.findMany({
    where: { storeId, reportDate: date },
    include: {
      submittedBy: { select: { id: true, name: true, phone: true } },
      store:       { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: reports });
}

// GET /daily-reports?storeId=xxx&date=YYYY-MM-DD  (manager view — any date)
export async function getReportsByDate(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { storeId, date } = req.query as { storeId?: string; date?: string };

  const where: any = {};
  if (date) where.reportDate = date;

  // A Store Manager (below SuperAdmin) can only ever see their own store's
  // reports — ignore any other storeId they pass and fall back to their own.
  if (hasMinRole(user.role, Role.SUPER_ADMIN)) {
    if (storeId) where.storeId = storeId;
  } else {
    const ownStoreId = storeId && (user as any).storeIds?.includes(storeId) ? storeId : (user as any).storeIds?.[0];
    if (!ownStoreId) { res.status(400).json({ success: false, error: 'No store assigned to your account' }); return; }
    where.storeId = ownStoreId;
  }

  const reports = await prisma.dailyReport.findMany({
    where,
    include: {
      submittedBy: { select: { id: true, name: true, phone: true } },
      store:       { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  res.json({ success: true, data: reports });
}
