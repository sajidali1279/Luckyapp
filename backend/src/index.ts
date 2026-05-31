import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { startBillingCron } from './utils/billing-cron';
import { startExpiryCron } from './utils/expiry-cron';
import { startTierResetCron } from './utils/tier-reset-cron';
import { startCatalogExpiryCron } from './utils/catalog-expiry-cron';

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
app.use('/api/disputes',        rateLimit({ windowMs: 60 * 60 * 1000, max:  5, message: { success: false, error: 'Too many dispute submissions — try again in 1 hour' } }));
app.use('/api/auth/login',      rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, error: 'Too many login attempts — try again in 15 minutes' } }));
app.use('/api/auth/register',   rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { success: false, error: 'Too many registrations from this IP' } }));
// General auth routes: 30 per 15min (covers /auth/me, push-token, etc.)
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
// All other API routes: 200 per minute (generous for normal use)
app.use('/api', rateLimit({ windowMs: 1 * 60 * 1000, max: 200 }));

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// Health check — public, used by UptimeRobot and monitoring
app.get('/health', async (_, res) => {
  let db = 'ok';
  try {
    // Lightweight ping — just confirms DB connection is alive
    const { PrismaClient } = await import('@prisma/client');
    const p = new PrismaClient();
    await p.$queryRaw`SELECT 1`;
    await p.$disconnect();
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

app.listen(PORT, () => {
  console.log(`Lucky Stop API running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  startBillingCron();
  startExpiryCron();
  startTierResetCron();
  startCatalogExpiryCron();
});

export default app;
