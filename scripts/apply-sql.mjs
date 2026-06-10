// Applique un fichier .sql à la base via une connexion Postgres directe.
// Usage: node scripts/apply-sql.mjs "<connection-string>" <fichier.sql>
// (outil de dev ponctuel — pg installé en --no-save)
import { readFileSync } from 'node:fs';
import pg from 'pg';

const [, , connectionString, file] = process.argv;
if (!connectionString || !file) {
  console.error('Usage: node scripts/apply-sql.mjs "<conn>" <file.sql>');
  process.exit(2);
}

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();
  await client.query(sql);
  console.log('SCHEMA_APPLIED_OK');
} catch (e) {
  console.error('SCHEMA_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
