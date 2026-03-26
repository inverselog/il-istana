import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

export async function getOne(text, params) {
  const res = await pool.query(text, params);
  return res.rows[0] || null;
}

export async function getMany(text, params) {
  const res = await pool.query(text, params);
  return res.rows;
}

export default pool;
