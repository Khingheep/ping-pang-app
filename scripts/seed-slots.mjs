// Seed de créneaux de démo (hôtes = joueurs démo, horaires futurs) au lieu curaté du club.
// Les triggers ajoutent l'hôte en participant + notifient les joueurs (dont Walid).
// Usage: node scripts/seed-slots.mjs "<conn>"
import pg from 'pg';
const conn = process.argv[2];
if (!conn) { console.error('need conn'); process.exit(2); }
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

function at(daysFromNow, hour, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, min, 0, 0);
  return d;
}

await c.connect();
try {
  const venue = (await c.query("select id, name from venues where source='manuel' order by name limit 1")).rows[0]
    ?? (await c.query('select id, name from venues limit 1')).rows[0];
  const { rows } = await c.query('select id, handle from players');
  const id = Object.fromEntries(rows.map((r) => [r.handle, r.id]));

  // on repart propre (évite les doublons si on relance)
  await c.query("delete from slots where host_id = any($1::uuid[])", [[id.lucas, id.ana, id.maxime]]);

  const slots = [
    { host: 'lucas', start: at(1, 19, 0), dur: 60, format: '3sets', min: null, max: null },
    { host: 'ana', start: at(1, 18, 0), dur: 90, format: '2sets', min: 1200, max: null },
    { host: 'maxime', start: at(2, 20, 0), dur: 90, format: 'ntt', min: null, max: null },
  ];
  for (const s of slots) {
    const end = new Date(s.start.getTime() + s.dur * 60000);
    await c.query(
      'insert into slots (venue_id, host_id, starts_at, ends_at, format, level_min, level_max) values ($1,$2,$3,$4,$5,$6,$7)',
      [venue.id, id[s.host], s.start.toISOString(), end.toISOString(), s.format, s.min, s.max],
    );
  }

  const n = (await c.query("select count(*)::int n from slots where status='open'")).rows[0].n;
  const parts = (await c.query('select count(*)::int n from slot_participants')).rows[0].n;
  const notifs = (await c.query("select count(*)::int n from notifications where type in ('slot','slot_join') and player_id=$1", [id.dev])).rows[0].n;
  console.log(`lieu: ${venue.name}`);
  console.log(`créneaux ouverts: ${n} | participants (auto-hôtes): ${parts} | notifs créneau pour Walid: ${notifs}`);
  console.log('SEED_SLOTS_OK');
} catch (e) {
  console.error('SEED_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
