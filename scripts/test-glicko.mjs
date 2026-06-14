// Cross-test : la fonction SQL _glicko_update doit matcher la référence Node (scripts/glicko-ref.mjs).
// Usage: node scripts/test-glicko.mjs "<conn>"
import pg from 'pg';
import { glickoSingle } from './glicko-ref.mjs';

const conn = process.argv[2];
if (!conn) { console.error('need conn'); process.exit(2); }
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

// cas déterministes (pas de Math.random pour reproductibilité)
const cases = [
  [1500, 350, 0.06, 1500, 350, 1],
  [1500, 350, 0.06, 1500, 350, 0],
  [1200, 200, 0.06, 1800, 60, 1],   // gros upset
  [1800, 60, 0.06, 1200, 200, 0],   // favori battu
  [2340, 45, 0.05, 2180, 70, 1],
  [1500, 350, 0.06, 1400, 30, 0.5], // nul
  [1000, 350, 0.09, 1000, 350, 1],
  [2600, 40, 0.04, 1500, 350, 0],   // énorme surprise
];

await c.connect();
let maxDiff = 0, fails = 0;
try {
  for (const [r, rd, vol, rj, rdj, s] of cases) {
    const sql = (await c.query('select * from _glicko_update($1,$2,$3,$4,$5,$6)', [r, rd, vol, rj, rdj, s])).rows[0];
    const ref = glickoSingle(r, rd, vol, rj, rdj, s);
    const dR = Math.abs(sql.rating - ref.rating);
    const dRd = Math.abs(sql.rd_out - ref.rd);
    const dV = Math.abs(sql.vol_out - ref.vol);
    const d = Math.max(dR, dRd, dV);
    maxDiff = Math.max(maxDiff, d);
    const ok = d < 1e-6;
    if (!ok) fails++;
    console.log(`${ok ? 'OK ' : 'XX '} r=${r} vs ${rj} s=${s} -> SQL ${sql.rating.toFixed(2)}/${sql.rd_out.toFixed(1)} | Node ${ref.rating.toFixed(2)}/${ref.rd.toFixed(1)}  (Δ=${d.toExponential(1)})`);
  }
  console.log(`\nmaxDiff=${maxDiff.toExponential(2)}  fails=${fails}/${cases.length}`);
  console.log(fails === 0 ? 'GLICKO_SQL_OK' : 'GLICKO_SQL_MISMATCH');
  if (fails) process.exitCode = 1;
} catch (e) {
  console.error('TEST_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
