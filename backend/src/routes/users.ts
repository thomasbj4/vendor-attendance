import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPool } from '../database/db';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AuthenticatedRequest, User } from '../types';
import { logAudit } from '../services/audit';
import { parseId } from '../utils/validate';

const router = Router();
router.use(authenticateToken);

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

router.get('/', requireRole('admin'), async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { rows } = await getPool().query(
      'SELECT id, name, email, role, department, vendor_id, is_active, created_at FROM users ORDER BY name',
    );
    res.json({ users: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const targetId = parseId(req.params.id);
  if (!targetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  if (req.user!.role === 'user' && req.user!.userId !== targetId) {
    res.status(403).json({ error: 'Access denied.' }); return;
  }
  try {
    const { rows: [user] } = await getPool().query(
      'SELECT id, name, email, role, department, vendor_id, is_active, created_at FROM users WHERE id = $1',
      [targetId],
    );
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
    res.json({ user });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const { name, email, password, role, department, vendor_id } = req.body;
  if (!name || !email || !password || !role) {
    res.status(400).json({ error: 'Name, email, password, and role are required.' }); return;
  }
  if (!['admin', 'user'].includes(role)) {
    res.status(400).json({ error: 'Invalid role.' }); return;
  }

  const pool = getPool();
  const hashed = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  try {
    const { rows: [user] } = await pool.query<User>(
      `INSERT INTO users (name, email, password, role, department, vendor_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, role, department, vendor_id, is_active, created_at`,
      [name, email, hashed, role, department || null, vendor_id || null],
    );
    await logAudit(pool, req.user!.userId, req.user!.email, 'user.create', 'user', user.id, { name, email, role });
    res.status(201).json({ user });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === '23505') res.status(409).json({ error: 'Email already exists.' });
    else { console.error(err); res.status(500).json({ error: 'Failed to create user.' }); }
  }
});

router.put('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const targetId = parseId(req.params.id);
  if (!targetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const { name, email, password, role, department, vendor_id, is_active } = req.body;
  const pool = getPool();

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (name       !== undefined) { setClauses.push(`name = $${idx++}`);      values.push(name); }
  if (email      !== undefined) { setClauses.push(`email = $${idx++}`);     values.push(email); }
  if (password   !== undefined) { setClauses.push(`password = $${idx++}`);  values.push(bcrypt.hashSync(password, BCRYPT_ROUNDS)); }
  if (role       !== undefined) { setClauses.push(`role = $${idx++}`);      values.push(role); }
  if (department !== undefined) { setClauses.push(`department = $${idx++}`);values.push(department); }
  if (vendor_id  !== undefined) { setClauses.push(`vendor_id = $${idx++}`); values.push(vendor_id); }
  if (is_active  !== undefined) { setClauses.push(`is_active = $${idx++}`); values.push(is_active ? 1 : 0); }

  if (setClauses.length === 0) { res.status(400).json({ error: 'No fields to update.' }); return; }

  values.push(targetId);
  try {
    await pool.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
    const { rows: [user] } = await pool.query(
      'SELECT id, name, email, role, department, vendor_id, is_active, created_at FROM users WHERE id = $1',
      [targetId],
    );
    await logAudit(pool, req.user!.userId, req.user!.email, 'user.update', 'user', targetId,
      { fields: setClauses.map(c => c.split(' =')[0]) });
    res.json({ user });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/:id', requireRole('admin'), async (req: AuthenticatedRequest, res: Response) => {
  const targetId = parseId(req.params.id);
  if (!targetId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  if (targetId === req.user!.userId) {
    res.status(400).json({ error: 'Cannot deactivate yourself.' }); return;
  }
  const pool = getPool();
  try {
    const { rows: [target] } = await pool.query('SELECT name, email FROM users WHERE id = $1', [targetId]);
    await pool.query('UPDATE users SET is_active = 0 WHERE id = $1', [targetId]);
    await logAudit(pool, req.user!.userId, req.user!.email, 'user.deactivate', 'user', targetId,
      { name: target?.name, email: target?.email });
    res.json({ message: 'User deactivated.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

export default router;
