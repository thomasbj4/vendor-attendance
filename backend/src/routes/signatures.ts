import { Router, Response } from 'express';
import { getPool } from '../database/db';
import { authenticateToken } from '../middleware/auth';
import { AuthenticatedRequest, Signature } from '../types';
import { parseId } from '../utils/validate';

const router = Router();
router.use(authenticateToken);

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { rows } = await getPool().query(
      'SELECT id, user_id, name, data, is_default, created_at FROM signatures WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [req.user!.userId],
    );
    res.json({ signatures: rows });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const sigId = parseId(req.params.id);
  if (!sigId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  try {
    const { rows: [sig] } = await getPool().query<Signature>(
      'SELECT * FROM signatures WHERE id = $1',
      [sigId],
    );
    if (!sig) { res.status(404).json({ error: 'Not found.' }); return; }
    if (req.user!.role === 'user' && sig.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'Access denied.' }); return;
    }
    res.json({ signature: sig });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const { data, name, set_default } = req.body;
  if (!data) { res.status(400).json({ error: 'Signature data is required.' }); return; }

  const pool = getPool();
  try {
    if (set_default) {
      await pool.query('UPDATE signatures SET is_default = 0 WHERE user_id = $1', [req.user!.userId]);
    }

    const { rows: [sig] } = await pool.query(
      `INSERT INTO signatures (user_id, name, data, is_default) VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, name, is_default, created_at`,
      [req.user!.userId, name || 'My Signature', data, set_default ? 1 : 0],
    );
    res.status(201).json({ signature: sig });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.put('/:id/default', async (req: AuthenticatedRequest, res: Response) => {
  const sigId = parseId(req.params.id);
  if (!sigId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();
  try {
    const { rows: [sig] } = await pool.query<Signature>('SELECT * FROM signatures WHERE id = $1', [sigId]);
    if (!sig || sig.user_id !== req.user!.userId) { res.status(404).json({ error: 'Not found.' }); return; }

    await pool.query('UPDATE signatures SET is_default = 0 WHERE user_id = $1', [req.user!.userId]);
    await pool.query('UPDATE signatures SET is_default = 1 WHERE id = $1', [sigId]);
    res.json({ message: 'Default signature set.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const sigId = parseId(req.params.id);
  if (!sigId) { res.status(400).json({ error: 'Invalid ID.' }); return; }

  const pool = getPool();
  try {
    const { rows: [sig] } = await pool.query<Signature>('SELECT * FROM signatures WHERE id = $1', [sigId]);
    if (!sig || sig.user_id !== req.user!.userId) { res.status(404).json({ error: 'Not found.' }); return; }

    const { rows: [inUse] } = await pool.query('SELECT id FROM timesheets WHERE signature_id = $1', [sigId]);
    if (inUse) { res.status(400).json({ error: 'Signature is attached to a timesheet.' }); return; }

    await pool.query('DELETE FROM signatures WHERE id = $1', [sigId]);
    res.json({ message: 'Signature deleted.' });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

export default router;
