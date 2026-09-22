import 'dotenv/config';
import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import prisma from './config/prisma';
import { startBillingCron } from './utils/billing-cron';
import { startExpiryCron } from './utils/expiry-cron';
import { startTierResetCron } from './utils/tier-reset-cron';
import { startCatalogExpiryCron } from './utils/catalog-expiry-cron';
import { startDailyReportReminderCron } from './utils/daily-report-reminder-cron';
import { startLabelPriceExpiryCron } from './utils/label-price-expiry-cron';
import { startNotificationRetentionCron } from './utils/notification-retention-cron';
import { startOfferAnnounceCron } from './utils/offerAnnounce';
import { startMorningSummaryCron } from './utils/morning-summary';
import { startPendingExpiryCron } from './utils/pending-expiry-cron';
import { clientKey } from './utils/rateLimitKey';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (required when running behind Render/load balancer)
app.set('trust proxy', 1);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());

// CORS — allow only known origins (mobile app has no origin, so passes through)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // No origin = React Native / Postman / server-to-server — always allow
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow any Vercel preview/production deployment for this project
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Handle preflight for all routes (required for DELETE/PATCH with custom headers)
app.options('*' as string, cors(corsOptions));
app.use(cors(corsOptions));

// Rate limiting — prevent brute force
// Most sensitive: login and PIN reset (brute-force targets)
// NOTE: dispute-submission rate limiting lives on the specific POST /api/disputes
// route in routes/index.ts, not here — app.use('/api/disputes', ...) would match
// every method/sub-path under that prefix (GET /disputes/all, /pending-count,
// /mine, etc.), starving normal admin reads on the same 5-per-hour budget meant
// only for customer submission abuse.
// Limits are per person, keyed by the real client address (see utils/rateLimitKey.ts), and sized for a store's shared
// Wi-Fi where several staff and customers share one address. Guessing PINs is stopped per ACCOUNT by the database
// lockout (5 wrong PINs, 15 minutes); these limits stop floods. A signup also needs a Firebase SMS code.
const limiter = (windowMs: number, max: number, message?: { success: boolean; error: string }) =>
  rateLimit({ windowMs, max, keyGenerator: clientKey, ...(message ? { message } : {}) });
app.use('/api/auth/login',    limiter(15 * 60 * 1000, 30, { success: false, error: 'Too many login attempts. Try again in 15 minutes.' }));
app.use('/api/auth/register', limiter(60 * 60 * 1000, 30, { success: false, error: 'Too many registrations from this connection. Try again in a while.' }));
// General auth routes: 150 per 15 min (covers /auth/me, push-token, etc.)
app.use('/api/auth', limiter(15 * 60 * 1000, 150));
// All other API routes: 400 per minute (generous for normal use, several devices can share one address)
app.use('/api', limiter(1 * 60 * 1000, 400));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// Health check — public, used by UptimeRobot and monitoring
app.get('/health', async (_, res) => {
  let db = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'error';
  }
  const status = db === 'ok' ? 'ok' : 'degraded';
  res.status(db === 'ok' ? 200 : 503).json({
    status,
    version: '1.1.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    db,
  });
});

// Root
app.get('/', (_, res) => res.json({ success: true, message: 'Lucky Stop API is running', version: '1.0.0' }));

// 404 handler
app.use((_, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

app.listen(PORT, () => {
  console.log(`Lucky Stop API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  startBillingCron();
  startExpiryCron();
  startTierResetCron();
  startCatalogExpiryCron();
  startDailyReportReminderCron();
  startLabelPriceExpiryCron();
  startNotificationRetentionCron();
  startOfferAnnounceCron();
  startMorningSummaryCron();
  startPendingExpiryCron();
});

export default app;
