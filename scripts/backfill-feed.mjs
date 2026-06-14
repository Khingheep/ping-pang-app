// Backfill ponctuel du feed depuis les matchs confirmés + quelques nouveaux membres,
// pour que la section "Activité du club" ne soit pas vide au premier test.
// Usage: node scripts/backfill-feed.mjs "<conn>"
import pg from 'pg';
const conn = process.argv[2];
if (!conn) { console.error('need conn'); process.exit(2); }
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query(`
    insert into feed_events (type, actor_id, actor_name, target_name, title, body, elo_delta, created_at)
    select 'match', m.winner, w.display_name, l.display_name,
           w.display_name || ' a battu ' || l.display_name,
           (case when m.winner = m.player_a then m.score
                 else split_part(m.score,'-',2)||'-'||split_part(m.score,'-',1) end)
             || ' · ' || case when m.is_ranked then 'Classé' else 'Amical' end,
           case when m.is_ranked then (case when m.winner = m.player_a then m.elo_delta_a else m.elo_delta_b end) else null end,
           m.played_at
    from matches m
    join players w on w.id = m.winner
    join players l on l.id = (case when m.winner = m.player_a then m.player_b else m.player_a end)
    where m.status = 'confirmed'
      and not exists (select 1 from feed_events f where f.type='match' and f.created_at = m.played_at and f.actor_id = m.winner)
    order by m.played_at desc
    limit 30;
  `);
  const { rows } = await c.query('select count(*)::int n from feed_events');
  const { rows: sample } = await c.query('select type, title, body, elo_delta from feed_events order by created_at desc limit 5');
  console.log('feed_events total:', rows[0].n);
  sample.forEach((s) => console.log(' -', s.title, '|', s.body, s.elo_delta != null ? `(${s.elo_delta > 0 ? '+' : ''}${s.elo_delta})` : ''));
  console.log('BACKFILL_OK');
} catch (e) {
  console.error('BACKFILL_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
