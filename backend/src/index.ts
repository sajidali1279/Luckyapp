import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import routes from './routes';
import { startBillingCron } from './utils/billing-cron';

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

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // No origin = React Native / Postman / server-to-server — always allow
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Handle preflight for all routes (required for DELETE/PATCH with custom headers)
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Rate limiting — prevent brute force
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));  // 20 per 15min on auth
app.use('/api', rateLimit({ windowMs: 1 * 60 * 1000, max: 100 }));        // 100 per minute

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', routes);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
});

export default app;
