import 'dotenv/config';
import app from './app';
import { initSchema } from './database/db';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret === 'change-me' || jwtSecret.length < 32) {
  console.error('FATAL: JWT_SECRET must be set to a random string of at least 32 characters.');
  process.exit(1);
}
const pgPassword = process.env.POSTGRES_PASSWORD;
if (!pgPassword || pgPassword === 'change-me') {
  console.error('FATAL: POSTGRES_PASSWORD must be set to a non-default value.');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
