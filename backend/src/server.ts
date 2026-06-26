import 'dotenv/config';
import app from './app';
import { initSchema } from './database/db';

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
