import { Response, NextFunction, Request } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest } from '../types';

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
const JWT_SECRET: string = process.env.JWT_SECRET;

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = (req as Request & { cookies: Record<string, string> }).cookies?.token;

  if (!token) {
    res.status(401).json({ error: 'Access denied. No token provided.' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as { userId: number; role: string; email: string };
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions.' });
      return;
    }
    next();
  };
}
