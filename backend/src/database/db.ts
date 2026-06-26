import { Pool, types } from 'pg';
import bcrypt from 'bcryptjs';

// Return date/time values as raw strings (consistent with SQLite behaviour the rest of the code expects)
types.setTypeParser(1082, (v: string) => v);   // DATE
types.setTypeParser(1114, (v: string) => v);   // TIMESTAMP
types.setTypeParser(1184, (v: string) => v);   // TIMESTAMPTZ

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000', 10),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECT_TIMEOUT || '5000', 10),
    });
    pool.on('error', (err) => console.error('pg pool error', err));
  }
  return pool;
}

export async function initSchema(): Promise<void> {
  const p = getPool();

  await p.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user')),
      department  TEXT,
      vendor_id   TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS signatures (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      name       TEXT NOT NULL DEFAULT 'My Signature',
      data       TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id),
      date           DATE NOT NULL,
      clock_in       TEXT,
      clock_out      TEXT,
      break_minutes  INTEGER NOT NULL DEFAULT 0,
      extra_hours    DOUBLE PRECISION NOT NULL DEFAULT 0,
      extra_start    TEXT,
      extra_end      TEXT,
      status         TEXT NOT NULL DEFAULT 'present' CHECK(status IN ('present','absent','half-day','leave')),
      notes          TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS timesheets (
      id                   SERIAL PRIMARY KEY,
      user_id              INTEGER NOT NULL REFERENCES users(id),
      period_start         DATE NOT NULL,
      period_end           DATE NOT NULL,
      total_regular_hours  DOUBLE PRECISION NOT NULL DEFAULT 0,
      total_extra_hours    DOUBLE PRECISION NOT NULL DEFAULT 0,
      notes                TEXT,
      status               TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','signed')),
      signature_id         INTEGER REFERENCES signatures(id),
      submitted_at         TIMESTAMPTZ,
      signed_by            INTEGER REFERENCES users(id),
      signed_at            TIMESTAMPTZ,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS smtp_settings (
      id              INTEGER PRIMARY KEY DEFAULT 1,
      host            TEXT NOT NULL DEFAULT '',
      port            INTEGER NOT NULL DEFAULT 587,
      connection_type TEXT NOT NULL DEFAULT 'starttls',
      auth_user       TEXT NOT NULL DEFAULT '',
      auth_pass       TEXT NOT NULL DEFAULT '',
      from_name       TEXT NOT NULL DEFAULT 'Vendor Attendance',
      from_email      TEXT NOT NULL DEFAULT '',
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS otp_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id),
      token      TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER,
      actor_name  TEXT NOT NULL,
      action      TEXT NOT NULL,
      entity_type TEXT,
      entity_id   INTEGER,
      details     TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await p.query(`
    CREATE INDEX IF NOT EXISTS idx_signatures_user_id  ON signatures(user_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_user_id  ON attendance(user_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_date     ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_timesheets_user_id  ON timesheets(user_id);
    CREATE INDEX IF NOT EXISTS idx_timesheets_status   ON timesheets(status);
    CREATE INDEX IF NOT EXISTS idx_otp_tokens_user_id  ON otp_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id  ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
  `);

  // Add ON DELETE CASCADE to existing FKs if not already present (idempotent via DO block)
  await p.query(`
    DO $$
    DECLARE
      c RECORD;
    BEGIN
      FOR c IN
        SELECT tc.constraint_name, tc.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name IN ('signatures','attendance','timesheets','otp_tokens')
          AND kcu.column_name = 'user_id'
          AND rc.delete_rule != 'CASCADE'
      LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', c.table_name, c.constraint_name);
        EXECUTE format(
          'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE CASCADE',
          c.table_name, c.constraint_name, c.column_name
        );
      END LOOP;
    END;
    $$;
  `);

  if (process.env.NODE_ENV === 'development') {
    await seedData(p);
  }
}

async function seedData(p: Pool): Promise<void> {
  const { rows: [{ count }] } = await p.query('SELECT COUNT(*) AS count FROM users');
  if (parseInt(count as string) > 0) return;

  const adminPw = bcrypt.hashSync('admin123', parseInt(process.env.BCRYPT_ROUNDS || '10', 10));
  const userPw  = bcrypt.hashSync('user123', parseInt(process.env.BCRYPT_ROUNDS || '10', 10));

  await p.query(
    'INSERT INTO users (name, email, password, role, department, vendor_id) VALUES ($1,$2,$3,$4,$5,$6)',
    ['System Admin', 'admin@vendor.com', adminPw, 'admin', 'IT', 'V001'],
  );
  await p.query(
    'INSERT INTO users (name, email, password, role, department, vendor_id) VALUES ($1,$2,$3,$4,$5,$6)',
    ['Jane Smith', 'jane@vendor.com', userPw, 'user', 'Operations', 'V001'],
  );
  await p.query(
    'INSERT INTO users (name, email, password, role, department, vendor_id) VALUES ($1,$2,$3,$4,$5,$6)',
    ['Bob Wilson', 'bob@vendor.com', userPw, 'user', 'Logistics', 'V002'],
  );

  console.log('Dev seed data created (admin@vendor.com, jane@vendor.com, bob@vendor.com)');
}
