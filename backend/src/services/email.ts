import nodemailer from 'nodemailer';
import { getPool } from '../database/db';

interface SmtpRow {
  id: number;
  host: string;
  port: number;
  connection_type: string;
  auth_user: string;
  auth_pass: string;
  from_name: string;
  from_email: string;
}

export async function getSmtpSettings(): Promise<SmtpRow | null> {
  const { rows: [row] } = await getPool().query('SELECT * FROM smtp_settings WHERE id = 1');
  return row || null;
}

export async function sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  const s = await getSmtpSettings();
  if (!s || !s.host) throw new Error('SMTP not configured. Please set up SMTP in Admin Settings.');

  const isSmtps  = s.connection_type === 'smtps';
  const isRelay  = s.connection_type === 'relay';

  const transportConfig: nodemailer.TransportOptions = {
    host: s.host,
    port: s.port,
    secure: isSmtps,
    ...(!isRelay && s.auth_user ? { auth: { user: s.auth_user, pass: s.auth_pass } } : {}),
    ...(s.connection_type === 'starttls' ? { requireTLS: true } : {}),
    tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
  } as nodemailer.TransportOptions;

  const transporter = nodemailer.createTransport(transportConfig);
  await transporter.sendMail({
    from: `"${s.from_name || process.env.APP_NAME || 'Vendor Attendance'}" <${s.from_email || s.auth_user}>`,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}
