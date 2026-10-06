import "server-only";
import { Pool, types } from "pg";

// Keep DATE columns as 'YYYY-MM-DD' strings (no timezone shifting) and numerics as numbers.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));

const url = process.env.DATABASE_URL;
const local = !url || /localhost|127\.0\.0\.1/.test(url);

const g = globalThis;
export const pool =
  g.__pgPool ||
  (g.__pgPool = new Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 10000,
  }));

// Always use parameterised queries ($1, $2…). Never concatenate user input into SQL.
export async function query(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}
export async function one(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}
