// Loads .env.local then .env for CLI scripts (Next.js does this itself for the app).
const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env.local"), quiet: true });
dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });
function client() {
  const { Client } = require("pg");
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("✖ DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."); process.exit(1); }
  const local = /localhost|127\.0\.0\.1/.test(url);
  return new Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
}
module.exports = { client };
