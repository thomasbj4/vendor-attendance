import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { getPool } from '../database/db';
import { sendEmail } from '../services/email';
import { authenticateToken } from '../middleware/auth';
import { AuthenticatedRequest, User } from '../types';
import { logAudit } from '../services/audit';

const router = Router();

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
const JWT_SECRET: string = process.env.JWT_SECRET;

const isProduction = process.env.NODE_ENV === 'production';
// COOKIE_SECURE defaults to true in production; set to "false" only for local HTTP dev
const COOKIE_SECURE = process.env.COOKIE_SECURE !== undefined
  ? process.env.COOKIE_SECURE === 'true'
  : isProduction;

const APP_NAME             = process.env.APP_NAME || 'Vendor Attendance';
const JWT_EXPIRY_HOURS     = parseInt(process.env.JWT_EXPIRY_HOURS || '8', 10);
const OTP_EXPIRY_MINUTES   = parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10);
const LOGIN_RATE_LIMIT_MAX = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10);
const LOGIN_RATE_WINDOW_MS = parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '900000', 10);
const OTP_RATE_LIMIT_MAX   = parseInt(process.env.OTP_RATE_LIMIT_MAX || '3', 10);
const OTP_RATE_WINDOW_MS   = parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS || '60000', 10);

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: COOKIE_SECURE,
  sameSite: 'strict' as const,
  maxAge: JWT_EXPIRY_HOURS * 60 * 60 * 1000,
  path: '/',
};

const loginLimiter = rateLimit({
  windowMs: LOGIN_RATE_WINDOW_MS,
  max: LOGIN_RATE_LIMIT_MAX,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: OTP_RATE_WINDOW_MS,
  max: OTP_RATE_LIMIT_MAX,
  message: { error: 'Too many OTP requests. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password change attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function signToken(user: User): string {
  return jwt.sign(
    { userId: user.id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: `${JWT_EXPIRY_HOURS}h` },
  );
}

router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const pool = getPool();
  try {
    const { rows: [user] } = await pool.query<User>(
      'SELECT * FROM users WHERE email = $1 AND is_active = 1',
      [email],
    );

    if (!user || !bcrypt.compareSync(password, user.password)) {
      if (user) await logAudit(pool, user.id, email, 'auth.login_failed', 'user', user.id, { email });
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    await logAudit(pool, user.id, user.email, 'auth.login', 'user', user.id, { role: user.role });
    const { password: _, ...safeUser } = user;
    const expiresAt = new Date(Date.now() + JWT_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    res.cookie('token', signToken(user), COOKIE_OPTIONS);
    res.json({ user: safeUser, expiresAt });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

router.post('/send-otp', otpLimiter, async (req: Request, res: Response) => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'Email is required.' }); return; }

  const pool = getPool();
  try {
    const { rows: [user] } = await pool.query<User>(
      'SELECT * FROM users WHERE email = $1 AND is_active = 1',
      [email],
    );
    if (!user) {
      res.json({ message: 'If this email is registered, an OTP has been sent.' });
      return;
    }

    await pool.query('UPDATE otp_tokens SET used = 1 WHERE user_id = $1 AND used = 0', [user.id]);

    const token = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
    await pool.query(
      'INSERT INTO otp_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt],
    );

    await sendEmail(
      user.email,
      `Your Login OTP — ${APP_NAME}`,
      `Hi ${user.name},\n\nYour one-time login code is: ${token}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not request this, please ignore this email.`,
      `<p>Hi <strong>${user.name}</strong>,</p><p>Your one-time login code is:</p><h2 style="letter-spacing:8px;font-size:36px;color:#4f46e5">${token}</h2><p>This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.</p><p style="color:#9ca3af;font-size:12px">If you did not request this, please ignore this email.</p>`,
    );
    res.json({ message: 'If this email is registered, an OTP has been sent.' });
  } catch (err) {
    console.error('send-otp error', err);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

router.post('/verify-otp', otpLimiter, async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  if (!email || !otp) { res.status(400).json({ error: 'Email and OTP are required.' }); return; }

  const pool = getPool();
  try {
    const { rows: [user] } = await pool.query<User>(
      'SELECT * FROM users WHERE email = $1 AND is_active = 1',
      [email],
    );
    if (!user) { res.status(401).json({ error: 'Invalid or expired OTP.' }); return; }

    const { rows: [row] } = await pool.query(
      'SELECT id FROM otp_tokens WHERE user_id = $1 AND token = $2 AND used = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1',
      [user.id, otp],
    );
    if (!row) { res.status(401).json({ error: 'Invalid or expired OTP.' }); return; }

    await pool.query('UPDATE otp_tokens SET used = 1 WHERE id = $1', [row.id]);

    const { password: _, ...safeUser } = user;
    const expiresAt = new Date(Date.now() + JWT_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
    res.cookie('token', signToken(user), COOKIE_OPTIONS);
    res.json({ user: safeUser, expiresAt });
  } catch (err) {
    console.error('verify-otp error', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

router.put('/password', passwordChangeLimiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { new_password, confirm_password } = req.body;

  if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' }); return;
  }
  if (new_password !== confirm_password) {
    res.status(400).json({ error: 'Passwords do not match.' }); return;
  }

  const pool = getPool();
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  try {
    const hashed = await bcrypt.hash(new_password, rounds);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user!.userId]);
    await logAudit(pool, req.user!.userId, req.user!.email, 'user.password_change', 'user', req.user!.userId, {});
    res.json({ success: true });
  } catch (err) {
    console.error('password change error', err);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token', { path: '/' });
  res.json({ message: 'Logged out.' });
});

router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rows: [user] } = await getPool().query(
      'SELECT id, name, email, role, department, vendor_id, is_active, created_at FROM users WHERE id = $1',
      [req.user!.userId],
    );
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
    const rawToken = (req as Request & { cookies: Record<string, string> }).cookies?.token;
    const decoded = jwt.decode(rawToken) as { exp?: number } | null;
    const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null;
    res.json({ user, expiresAt });
  } catch (err) {
    console.error('me error', err);
    res.status(500).json({ error: 'Failed.' });
  }
});

router.post('/refresh', authenticateToken, (_req: AuthenticatedRequest, res: Response) => {
  const { userId, role, email } = _req.user!;
  const token = jwt.sign({ userId, role, email }, JWT_SECRET, { expiresIn: `${JWT_EXPIRY_HOURS}h` });
  const expiresAt = new Date(Date.now() + JWT_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({ expiresAt });
});

export default router;
