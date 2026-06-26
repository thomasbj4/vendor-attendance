import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getPool } from '../database/db';

const router = Router();

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const { rows: [{ count }] } = await getPool().query('SELECT COUNT(*) AS count FROM users');
    res.json({ required: parseInt(count as string, 10) === 0 });
  } catch (err) {
    console.error('setup status error', err);
    res.status(500).json({ error: 'Failed.' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: 'Name, email and password are required.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const pool = getPool();
  try {
    const { rows: [{ count }] } = await pool.query('SELECT COUNT(*) AS count FROM users');
    if (parseInt(count as string, 10) > 0) {
      res.status(403).json({ error: 'Setup already completed.' });
      return;
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
    const hashed = bcrypt.hashSync(password, rounds);
    await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1, $2, $3, $4)',
      [name, email, hashed, 'admin'],
    );
    res.status(201).json({ message: 'Admin account created. You can now log in.' });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Email already exists.' });
    } else {
      console.error('setup error', err);
      res.status(500).json({ error: 'Setup failed.' });
    }
  }
});

export default router;
