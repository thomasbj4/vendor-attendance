import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { getPool } from './database/db';
import authRoutes from './routes/auth';
import setupRoutes from './routes/setup';
import userRoutes from './routes/users';
import attendanceRoutes from './routes/attendance';
import timesheetRoutes from './routes/timesheets';
import signatureRoutes from './routes/signatures';
import exportRoutes from './routes/export';
import settingsRoutes from './routes/settings';
import auditRoutes from './routes/audit';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(Boolean);
if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  throw new Error('CORS_ORIGIN must be set in production');
}

app.use(helmet());
app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : ['http://localhost:5173', 'http://localhost'],
  credentials: true,
  maxAge: 86400,
}));
app.use(cookieParser());
app.use(express.json({ limit: (process.env.CLIENT_MAX_BODY_SIZE || '20m') + 'b' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/setup', setupRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/timesheets', timesheetRoutes);
app.use('/api/signatures', signatureRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit', auditRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

export default app;
