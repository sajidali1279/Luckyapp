import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import cloudinary from '../config/cloudinary';
import { sendPushToStoreManagers } from '../utils/push';

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
  const userId = req.user!.id;
  const storeId = req.body.storeId || (req.user as any).storeIds?.[0];

  if (!storeId) {
    res.status(400).json({ success: false, error: 'No store assigned to your account' });
    return;
  }

  const { reportDate, gasPrice, dieselPrice, regGasGal, midGradeGasGal, premiumGasGal, cigsCount, notes } = req.body;

  if (!reportDate) {
    res.status(400).json({ success: false, error: 'reportDate is required' });
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
      gasPrice:      gasPrice      ? parseFloat(gasPrice)      : null,
      dieselPrice:   dieselPrice   ? parseFloat(dieselPrice)   : null,
      regGasGal:     regGasGal     ? parseFloat(regGasGal)     : null,
      midGradeGasGal: midGradeGasGal ? parseFloat(midGradeGasGal) : null,
      premiumGasGal: premiumGasGal ? parseFloat(premiumGasGal) : null,
      cigsCount:     cigsCount     ? parseInt(cigsCount)       : null,
      notes:         notes?.trim() || null,
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
  const storeId = (req.query.storeId as string) || (user as any).storeIds?.[0];
  const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

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
  const { storeId, date } = req.query as { storeId?: string; date?: string };

  const where: any = {};
  if (storeId) where.storeId = storeId;
  if (date)    where.reportDate = date;

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
