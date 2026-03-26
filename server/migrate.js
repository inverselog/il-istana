/**
 * Database migration runner.
 * Usage: node server/migrate.js
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'db', 'migrations');

async function migrate() {
  console.log('Running migrations...');
  
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  for (const file of files) {
    console.log(`  → ${file}`);
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    await pool.query(sql);
  }
  
  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
