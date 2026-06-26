import { Pool } from 'pg';

export async function logAudit(
  pool: Pool,
  userId: number | null,
  actorName: string,
  action: string,
  entityType: string | null = null,
  entityId: number | null = null,
  details?: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (user_id, actor_name, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, actorName, action, entityType, entityId, details ? JSON.stringify(details) : null],
  );
}
