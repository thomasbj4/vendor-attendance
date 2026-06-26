import { Router, Response } from 'express';
import { getPool } from '../database/db';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AuthenticatedRequest, AttendanceRecord } from '../types';
import { logAudit } from '../services/audit';
import { parseId, parsePositiveInt } from '../utils/validate';

const router = Router();
router.use(authenticateToken);

function calcRegularHours(record: AttendanceRecord): number {
  if (!record.clock_in || !record.clock_out) return 0;
  const [inH, inM]   = record.clock_in.split(':').map(Number);
  const [outH, outM] = record.clock_out.split(':').map(Number);
  const mins = (outH * 60 + outM) - (inH * 60 + inM) - (record.break_minutes || 0);
  return Math.max(0, mins / 60);
}

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const { user_id, start_date, end_date, month, year } = req.query;

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
    SELECT a.*, u.name AS user_name, u.email AS user_email
    FROM attendance a
    JOIN users u ON u.id = a.user_id
    WHERE 1=1
  `;

  if (targetUserId) { query += ` AND a.user_id = $${idx++}`; params.push(targetUserId); }
  if (start_date)   { query += ` AND a.date >= $${idx++}`;   params.push(start_date as string); }
  if (end_date)     { query += ` AND a.date <= $${idx++}`;   params.push(end_date as string); }
  if (month && year) {
    const m = parseInt(month as string, 10);
    const y = parseInt(year  as string, 10);
    if (isNaN(m) || isNaN(y) || m < 1 || m > 12 || y < 2000 || y > 2100) {
      res.status(400).json({ error: 'Invalid month or year.' }); return;
    }
    query += ` AND EXTRACT(MONTH FROM a.date) = $${idx++} AND EXTRACT(YEAR FROM a.date) = $${idx++}`;
    params.push(m, y);
  }

  query += ' ORDER BY a.date DESC';

  try {
    const { rows } = await getPool().query<AttendanceRecord>(query, params);
    res.json({ records: rows.map(r => ({ ...r, regular_hours: calcRegularHours(r) })) });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.get('/today', async (req: AuthenticatedRequest, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const { rows: [record] } = await getPool().query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [req.user!.userId, today],
    );
    res.json({ record: record ? { ...record, regular_hours: calcRegularHours(record) } : null, date: today });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const { date, clock_in, clock_out, break_minutes, extra_hours, extra_start, extra_end, status, notes, user_id } = req.body;
  if (!date) { res.status(400).json({ error: 'Date is required.' }); return; }

  let targetUserId = req.user!.userId;
  if (req.user!.role !== 'user' && user_id !== undefined) {
    const parsed = parseId(user_id);
    if (!parsed) { res.status(400).json({ error: 'Invalid user_id.' }); return; }
    targetUserId = parsed;
  }

  const pool = getPool();

  try {
    const { rows: [existing] } = await pool.query(
      'SELECT id FROM attendance WHERE user_id = $1 AND date = $2',
      [targetUserId, date],
    );

    if (existing) {
      await pool.query(`
        UPDATE attendance SET
          clock_in      = COALESCE($1, clock_in),
          clock_out     = COALESCE($2, clock_out),
          break_minutes = COALESCE($3, break_minutes),
          extra_hours   = COALESCE($4, extra_hours),
          extra_start   = COALESCE($5, extra_start),
          extra_end     = COALESCE($6, extra_end),
          status        = COALESCE($7, status),
          notes         = COALESCE($8, notes),
          updated_at    = NOW()
        WHERE user_id = $9 AND date = $10
      `, [
        clock_in ?? null, clock_out ?? null,
        break_minutes ?? null, extra_hours ?? null,
        extra_start ?? null, extra_end ?? null,
        status ?? null, notes ?? null,
        targetUserId, date,
      ]);
    } else {
      await pool.query(`
        INSERT INTO attendance (user_id, date, clock_in, clock_out, break_minutes, extra_hours, extra_start, extra_end, status, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        targetUserId, date,
        clock_in ?? null, clock_out ?? null,
        break_minutes ?? 0, extra_hours ?? 0,
        extra_start ?? null, extra_end ?? null,
        status ?? 'present', notes ?? null,
      ]);
    }

    const { rows: [record] } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [targetUserId, date],
    );
    await logAudit(pool, req.user!.userId, req.user!.email,
      existing ? 'attendance.update' : 'attendance.create',
      'attendance', record.id, { date, target_user_id: targetUserId, status: record.status });
    res.json({ record: { ...record, regular_hours: calcRegularHours(record) } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/clock-in', async (req: AuthenticatedRequest, res: Response) => {
  const pool = getPool();
  const today = new Date().toISOString().split('T')[0];
  const now   = new Date().toTimeString().slice(0, 5);

  try {
    const { rows: [existing] } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [req.user!.userId, today],
    );

    if (existing?.clock_in) { res.status(400).json({ error: 'Already clocked in today.' }); return; }

    if (existing) {
      await pool.query(
        'UPDATE attendance SET clock_in = $1, status = $2, updated_at = NOW() WHERE user_id = $3 AND date = $4',
        [now, 'present', req.user!.userId, today],
      );
    } else {
      await pool.query(
        'INSERT INTO attendance (user_id, date, clock_in, status) VALUES ($1, $2, $3, $4)',
        [req.user!.userId, today, now, 'present'],
      );
    }

    const { rows: [record] } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [req.user!.userId, today],
    );
    res.json({ record: { ...record, regular_hours: calcRegularHours(record) } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/clock-out', async (req: AuthenticatedRequest, res: Response) => {
  const pool = getPool();
  const today = new Date().toISOString().split('T')[0];
  const now   = new Date().toTimeString().slice(0, 5);

  try {
    const { rows: [existing] } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [req.user!.userId, today],
    );

    if (!existing?.clock_in)  { res.status(400).json({ error: 'Must clock in first.' }); return; }
    if (existing.clock_out)   { res.status(400).json({ error: 'Already clocked out today.' }); return; }

    await pool.query(
      'UPDATE attendance SET clock_out = $1, updated_at = NOW() WHERE user_id = $2 AND date = $3',
      [now, req.user!.userId, today],
    );
    const { rows: [record] } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE user_id = $1 AND date = $2',
      [req.user!.userId, today],
    );
    res.json({ record: { ...record, regular_hours: calcRegularHours(record) } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const recordId = parseId(req.params.id);
  if (!recordId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();

  try {
    const { rows: [record] } = await pool.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE id = $1',
      [recordId],
    );
    if (!record) { res.status(404).json({ error: 'Record not found.' }); return; }
    if (req.user!.role === 'user' && record.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' }); return;
    }

    const { clock_in, clock_out, break_minutes, extra_hours, extra_start, extra_end, status, notes } = req.body;
    await pool.query(`
      UPDATE attendance SET
        clock_in      = $1, clock_out     = $2,
        break_minutes = $3, extra_hours   = $4,
        extra_start   = $5, extra_end     = $6,
        status        = $7, notes         = $8,
        updated_at    = NOW()
      WHERE id = $9
    `, [
      clock_in      ?? record.clock_in,
      clock_out     ?? record.clock_out,
      break_minutes ?? record.break_minutes,
      extra_hours   ?? record.extra_hours,
      extra_start   ?? record.extra_start ?? null,
      extra_end     ?? record.extra_end   ?? null,
      status        ?? record.status,
      notes         ?? record.notes,
      recordId,
    ]);

    const { rows: [updated] } = await pool.query<AttendanceRecord>('SELECT * FROM attendance WHERE id = $1', [recordId]);
    await logAudit(pool, req.user!.userId, req.user!.email, 'attendance.update',
      'attendance', recordId, { date: updated.date, target_user_id: updated.user_id });
    res.json({ record: { ...updated, regular_hours: calcRegularHours(updated) } });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const recordId = parseId(req.params.id);
  if (!recordId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();
  try {
    const { rows: [rec] } = await pool.query('SELECT * FROM attendance WHERE id = $1', [recordId]);
    await pool.query('DELETE FROM attendance WHERE id = $1', [recordId]);
    await logAudit(pool, req.user!.userId, req.user!.email, 'attendance.delete',
      'attendance', recordId, rec ? { date: rec.date, target_user_id: rec.user_id } : {});
    res.json({ message: 'Record deleted.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

export default router;
