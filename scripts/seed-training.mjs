// Seed de séances d'entraînement pour le dev user (Walid) — réparties sur l'année,
// avec plus de séances dans les 8 dernières semaines (pour stats + graphe d'activité).
// Usage: node scripts/seed-training.mjs "<conn>"
import pg from 'pg';
const conn = process.argv[2];
if (!conn) { console.error('need conn'); process.exit(2); }
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

const STROKES_WEIGHTED = [
  'Coup droit', 'Coup droit', 'Coup droit',
  'Revers', 'Revers', 'Revers',
  'Service', 'Service', 'Contre', 'Contre', 'Smash', 'Touche',
];
const DURATIONS = [30, 60, 60, 90, 90, 120];
const FEELINGS = ['Difficile', 'Moyen', 'Bien', 'Bien', 'Excellent'];
const PARTNERS = ['Débutant', 'ELO 900-1200', 'Mon niveau', 'Meilleur que moi', null];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

await c.connect();
try {
  const dev = (await c.query("select id from players where handle='dev'")).rows[0].id;
  const venues = (await c.query("select id from venues where source='manuel'")).rows.map((r) => r.id);
  await c.query('delete from training_sessions where player_id=$1', [dev]); // repart propre

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  const eightWeeksAgo = now.getTime() - 8 * 7 * 86400000;

  const rows = [];
  for (let i = 0; i < 48; i++) {
    // 60% des séances dans les 8 dernières semaines, 40% plus tôt dans l'année
    const recent = Math.random() < 0.6;
    const t = recent
      ? eightWeeksAgo + Math.random() * (now.getTime() - eightWeeksAgo)
      : yearStart + Math.random() * (eightWeeksAgo - yearStart);
    const nStrokes = 1 + Math.floor(Math.random() * 3);
    const strokes = [...new Set(Array.from({ length: nStrokes }, () => pick(STROKES_WEIGHTED)))];
    rows.push({
      created_at: new Date(t).toISOString(),
      duration: pick(DURATIONS),
      strokes,
      feeling: pick(FEELINGS),
      partner: pick(PARTNERS),
      venue: venues.length ? pick(venues) : null,
    });
  }

  for (const r of rows) {
    await c.query(
      'insert into training_sessions (player_id, duration_min, strokes, partner_level, venue_id, feeling, created_at) values ($1,$2,$3,$4,$5,$6,$7)',
      [dev, r.duration, r.strokes, r.partner, r.venue, r.feeling, r.created_at],
    );
  }

  const tot = (await c.query('select coalesce(sum(duration_min),0)::int m, count(*)::int n from training_sessions where player_id=$1', [dev])).rows[0];
  console.log(`séances: ${tot.n} | total: ${Math.round(tot.m / 60)}h`);
  console.log('SEED_TRAINING_OK');
} catch (e) {
  console.error('SEED_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
