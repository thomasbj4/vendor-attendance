import { Router, Response } from 'express';
import { getPool } from '../database/db';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AuthenticatedRequest, Timesheet, AttendanceRecord } from '../types';
import { logAudit } from '../services/audit';
import { parseId } from '../utils/validate';

const router = Router();
router.use(authenticateToken);

function calcRegularHours(r: AttendanceRecord): number {
  if (!r.clock_in || !r.clock_out) return 0;
  const [inH, inM]   = r.clock_in.split(':').map(Number);
  const [outH, outM] = r.clock_out.split(':').map(Number);
  return Math.max(0, ((outH * 60 + outM) - (inH * 60 + inM) - (r.break_minutes || 0)) / 60);
}

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const { user_id, status } = req.query;

  let targetUserId: number | undefined;
  if (req.user!.role === 'user') {
    targetUserId = req.user!.userId;
  } else if (user_id) {
    const parsed = parseId(user_id as string);
    if (!parsed) { res.status(400).json({ error: 'Invalid user_id.' }); return; }
    targetUserId = parsed;
  }

  const params: unknown[] = [];
  let idx = 1;
  let query = `
    SELECT t.*, u.name AS user_name, u.email AS user_email, u.department,
           s.data AS signature_data
    FROM timesheets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN signatures s ON s.id = t.signature_id
    WHERE 1=1
  `;

  if (targetUserId) { query += ` AND t.user_id = $${idx++}`; params.push(targetUserId); }
  if (status)       { query += ` AND t.status = $${idx++}`;  params.push(status as string); }

  query += ' ORDER BY t.period_start DESC';

  try {
    const { rows } = await getPool().query(query, params);
    res.json({ timesheets: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const timesheetId = parseId(req.params.id);
  if (!timesheetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();

  try {
    const { rows: [timesheet] } = await pool.query<Timesheet & { user_name: string }>(
      `SELECT t.*, u.name AS user_name, u.email AS user_email, u.department,
              s.data AS signature_data, s.name AS signature_name
       FROM timesheets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN signatures s ON s.id = t.signature_id
       WHERE t.id = $1`,
      [timesheetId],
    );

    if (!timesheet) { res.status(404).json({ error: 'Timesheet not found.' }); return; }
    if (req.user!.role === 'user' && timesheet.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' }); return;
    }

    const { rows: records } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date ASC',
      [timesheet.user_id, timesheet.period_start, timesheet.period_end],
    );

    res.json({ timesheet, records: records.map(r => ({ ...r, regular_hours: calcRegularHours(r) })) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const { period_start, period_end, notes, user_id } = req.body;
  if (!period_start || !period_end) {
    res.status(400).json({ error: 'period_start and period_end are required.' }); return;
  }
  if (new Date(period_start) > new Date(period_end)) {
    res.status(400).json({ error: 'period_start must be before period_end.' }); return;
  }

  let targetUserId = req.user!.userId;
  if (req.user!.role !== 'user' && user_id !== undefined) {
    const parsed = parseId(user_id);
    if (!parsed) { res.status(400).json({ error: 'Invalid user_id.' }); return; }
    targetUserId = parsed;
  }

  const pool = getPool();

  try {
    const { rows: records } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date >= $2 AND date <= $3',
      [targetUserId, period_start, period_end],
    );

    const isWeekendSheet = new Date(period_start + 'T00:00:00').getDay() === 6;
    const total_regular_hours = isWeekendSheet ? 0
      : records.reduce((s, r) => s + calcRegularHours(r), 0);
    const total_extra_hours = isWeekendSheet
      ? records.reduce((s, r) => s + calcRegularHours(r) + (r.extra_hours || 0), 0)
      : records.reduce((s, r) => s + (r.extra_hours || 0), 0);

    const { rows: [ts] } = await pool.query(
      `INSERT INTO timesheets (user_id, period_start, period_end, total_regular_hours, total_extra_hours, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [targetUserId, period_start, period_end, total_regular_hours, total_extra_hours, notes ?? null],
    );

    await logAudit(pool, req.user!.userId, req.user!.email, 'timesheet.create',
      'timesheet', ts.id, { period_start, period_end, target_user_id: targetUserId });
    res.status(201).json({ timesheet: ts });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const timesheetId = parseId(req.params.id);
  if (!timesheetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();

  try {
    const { rows: [ts] } = await pool.query<Timesheet>('SELECT * FROM timesheets WHERE id = $1', [timesheetId]);
    if (!ts) { res.status(404).json({ error: 'Not found.' }); return; }
    if (req.user!.role === 'user' && ts.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' }); return;
    }

    const { notes, extra_hours } = req.body;
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (notes       !== undefined) { setClauses.push(`notes = $${idx++}`);             values.push(notes); }
    if (extra_hours !== undefined) { setClauses.push(`total_extra_hours = $${idx++}`); values.push(extra_hours); }

    if (setClauses.length > 0) {
      setClauses.push(`updated_at = NOW()`);
      values.push(timesheetId);
      await pool.query(`UPDATE timesheets SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    }

    const { rows: [updated] } = await pool.query('SELECT * FROM timesheets WHERE id = $1', [timesheetId]);
    res.json({ timesheet: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/:id/submit', async (req: AuthenticatedRequest, res: Response) => {
  const timesheetId = parseId(req.params.id);
  if (!timesheetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();

  try {
    const { rows: [ts] } = await pool.query<Timesheet>('SELECT * FROM timesheets WHERE id = $1', [timesheetId]);
    if (!ts) { res.status(404).json({ error: 'Not found.' }); return; }
    if (req.user!.role === 'user' && ts.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' }); return;
    }

    const { signature_id } = req.body;
    await pool.query(
      `UPDATE timesheets SET status = 'submitted', signature_id = $1, submitted_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [signature_id ?? null, timesheetId],
    );

    const { rows: [updated] } = await pool.query(
      `SELECT t.*, u.name AS user_name, s.data AS signature_data
       FROM timesheets t JOIN users u ON u.id = t.user_id
       LEFT JOIN signatures s ON s.id = t.signature_id
       WHERE t.id = $1`,
      [timesheetId],
    );
    await logAudit(pool, req.user!.userId, req.user!.email, 'timesheet.submit',
      'timesheet', timesheetId, { period_start: ts.period_start, period_end: ts.period_end, target_user_id: ts.user_id });
    res.json({ timesheet: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/:id/sign', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const timesheetId = parseId(req.params.id);
  if (!timesheetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();

  try {
    const { rows: [ts] } = await pool.query<Timesheet>('SELECT * FROM timesheets WHERE id = $1', [timesheetId]);
    if (!ts) { res.status(404).json({ error: 'Not found.' }); return; }
    if (ts.status !== 'submitted') {
      res.status(400).json({ error: 'Only submitted timesheets can be signed.' }); return;
    }

    await pool.query(
      `UPDATE timesheets SET status = 'signed', signed_by = $1, signed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user!.userId, timesheetId],
    );

    const { rows: [updated] } = await pool.query('SELECT * FROM timesheets WHERE id = $1', [timesheetId]);
    await logAudit(pool, req.user!.userId, req.user!.email, 'timesheet.sign',
      'timesheet', timesheetId, { period_start: updated.period_start, period_end: updated.period_end, target_user_id: updated.user_id });
    res.json({ timesheet: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/:id/recalculate', async (req: AuthenticatedRequest, res: Response) => {
  const timesheetId = parseId(req.params.id);
  if (!timesheetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();

  try {
    const { rows: [ts] } = await pool.query<Timesheet>('SELECT * FROM timesheets WHERE id = $1', [timesheetId]);
    if (!ts) { res.status(404).json({ error: 'Not found.' }); return; }
    if (req.user!.role === 'user' && ts.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' }); return;
    }
    if (ts.status === 'signed') {
      res.status(400).json({ error: 'Cannot recalculate a signed timesheet.' }); return;
    }

    const { rows: records } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date >= $2 AND date <= $3',
      [ts.user_id, ts.period_start, ts.period_end],
    );

    const total_regular_hours = records.reduce((s, r) => s + calcRegularHours(r), 0);
    const total_extra_hours   = records.reduce((s, r) => s + (r.extra_hours || 0), 0);

    await pool.query(
      'UPDATE timesheets SET total_regular_hours = $1, total_extra_hours = $2, updated_at = NOW() WHERE id = $3',
      [total_regular_hours, total_extra_hours, timesheetId],
    );

    const { rows: [updated] } = await pool.query('SELECT * FROM timesheets WHERE id = $1', [timesheetId]);
    res.json({ timesheet: updated });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const timesheetId = parseId(req.params.id);
  if (!timesheetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();

  try {
    const { rows: [ts] } = await pool.query<Timesheet>('SELECT * FROM timesheets WHERE id = $1', [timesheetId]);
    if (!ts) { res.status(404).json({ error: 'Not found.' }); return; }
    if (req.user!.role === 'user' && ts.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' }); return;
    }
    if (ts.status === 'signed') {
      res.status(400).json({ error: 'Cannot delete a signed timesheet.' }); return;
    }

    await pool.query('DELETE FROM timesheets WHERE id = $1', [timesheetId]);
    res.json({ message: 'Timesheet deleted.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

export default router;
