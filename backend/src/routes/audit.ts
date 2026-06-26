import { Router, Response } from 'express';
import { getPool } from '../database/db';
import { authenticateToken, requireRole } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import { parseId } from '../utils/validate';

const router = Router();
router.use(authenticateToken);
router.use(requireRole('admin'));

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  const { action, user_id, start, end, limit = '200' } = req.query;

  const params: unknown[] = [];
  let idx = 1;
  let query = 'SELECT * FROM audit_logs WHERE 1=1';

  if (action) {
    query += ` AND action = $${idx++}`;
    params.push(action as string);
  }
  if (user_id) {
    const parsed = parseId(user_id as string);
    if (!parsed) { res.status(400).json({ error: 'Invalid user_id.' }); return; }
    query += ` AND user_id = $${idx++}`;
    params.push(parsed);
  }
  if (start) { query += ` AND created_at >= $${idx++}`; params.push(start as string); }
  if (end)   { query += ` AND created_at <= $${idx++}`; params.push(`${end as string} 23:59:59`); }

  const parsedLimit = Math.min(parseInt(limit as string, 10) || 200, 1000);
  query += ` ORDER BY created_at DESC LIMIT $${idx}`;
  params.push(parsedLimit);

  try {
    const { rows: logs } = await getPool().query(query, params);
    res.json({ logs });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed.' }); }
});

export default router;
