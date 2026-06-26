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
  const recipient = req.user!.email;
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

export default router;
