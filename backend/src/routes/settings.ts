import { Router, Response } from 'express';
import { getPool } from '../database/db';
import { sendEmail, getSmtpSettings } from '../services/email';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { logAudit } from '../services/audit';

const router = Router();
router.use(authenticateToken);
router.use(requireRole('admin'));

router.get('/smtp', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = await getSmtpSettings();
    const base = settings || {
      host: '', port: 587, connection_type: 'starttls',
      auth_user: '', auth_pass: '', from_name: process.env.APP_NAME || 'Vendor Attendance', from_email: '',
    };
    res.json({
      settings: { ...base, auth_pass: base.auth_pass ? '********' : '' },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.put('/smtp', async (req: AuthenticatedRequest, res: Response) => {
  const { host, port, connection_type, auth_user, auth_pass, from_name, from_email } = req.body;
  const pool = getPool();

  try {
    const { rows: [exists] } = await pool.query('SELECT id FROM smtp_settings WHERE id = 1');

    if (exists) {
      await pool.query(
        `UPDATE smtp_settings SET
           host = $1, port = $2, connection_type = $3,
           auth_user = $4, auth_pass = $5,
           from_name = $6, from_email = $7, updated_at = NOW()
         WHERE id = 1`,
        [host || '', port || 587, connection_type || 'starttls',
         auth_user || '', auth_pass || '', from_name || process.env.APP_NAME || 'Vendor Attendance', from_email || ''],
      );
    } else {
      await pool.query(
        `INSERT INTO smtp_settings (id, host, port, connection_type, auth_user, auth_pass, from_name, from_email)
         VALUES (1, $1, $2, $3, $4, $5, $6, $7)`,
        [host || '', port || 587, connection_type || 'starttls',
         auth_user || '', auth_pass || '', from_name || process.env.APP_NAME || 'Vendor Attendance', from_email || ''],
      );
    }

    await logAudit(pool, req.user!.userId, req.user!.email, 'settings.smtp.update',
      'settings', null, { host, port, connection_type });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/smtp/test', async (req: AuthenticatedRequest, res: Response) => {
  const to = (req.body.to || '').trim();
  const recipient = to || req.user!.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    res.status(400).json({ error: 'Invalid recipient email address.' }); return;
  }
  try {
    await sendEmail(
      recipient,
      'SMTP Test — Vendor Attendance',
      'This is a test email from your Vendor Attendance system. SMTP is configured correctly!',
      '<p>This is a test email from your <strong>Vendor Attendance</strong> system.</p><p style="color:#16a34a">✓ SMTP is configured correctly!</p>',
    );
    res.json({ success: true, message: `Test email sent to ${recipient}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to send test email';
    res.status(500).json({ error: msg });
  }
});

const BRANDING_IMAGE_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const FAVICON_MAX_BYTES = 1024 * 1024;      // 1 MB
const LOGO_MAX_BYTES    = 5 * 1024 * 1024;  // 5 MB

router.put('/branding', async (req: AuthenticatedRequest, res: Response) => {
  const { favicon, logo } = req.body;
  const pool = getPool();

  try {
    if (favicon !== undefined) {
      if (!favicon) {
        await pool.query("DELETE FROM app_settings WHERE key = 'favicon'");
      } else {
        if (!BRANDING_IMAGE_RE.test(favicon)) {
          res.status(400).json({ error: 'Invalid favicon format.' }); return;
        }
        if (Buffer.byteLength(favicon, 'utf8') > FAVICON_MAX_BYTES) {
          res.status(400).json({ error: 'Favicon too large (max 256 KB).' }); return;
        }
        await pool.query(
          "INSERT INTO app_settings (key, value) VALUES ('favicon', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
          [favicon],
        );
      }
    }

    if (logo !== undefined) {
      if (!logo) {
        await pool.query("DELETE FROM app_settings WHERE key = 'logo'");
      } else {
        if (!BRANDING_IMAGE_RE.test(logo)) {
          res.status(400).json({ error: 'Invalid logo format.' }); return;
        }
        if (Buffer.byteLength(logo, 'utf8') > LOGO_MAX_BYTES) {
          res.status(400).json({ error: 'Logo too large (max 1 MB).' }); return;
        }
        await pool.query(
          "INSERT INTO app_settings (key, value) VALUES ('logo', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
          [logo],
        );
      }
    }

    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

export default router;
