// Test e2e du flux de confirmation de match (propose -> confirm -> ELO), au niveau DB.
// Simule auth.uid() via le GUC request.jwt.claims, puis ROLLBACK pour ne rien polluer.
// Usage: node scripts/test-confirm-flow.mjs "<conn>"
import pg from 'pg';

const conn = process.argv[2];
if (!conn) { console.error('need conn'); process.exit(2); }
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

const asUser = (id) => `set local request.jwt.claims = '${JSON.stringify({ sub: id, role: 'authenticated' })}';`;

await c.connect();
try {
  const { rows: players } = await c.query('select id, display_name, elo from players order by elo desc limit 2');
  if (players.length < 2) throw new Error('need >=2 players');
  const [A, B] = players;
  console.log(`A=${A.display_name} (${A.elo})  B=${B.display_name} (${B.elo})`);

  await c.query('begin');
  // A propose un match gagné 3-1 contre B
  await c.query(asUser(A.id));
  const prop = await c.query('select propose_match($1,3,1,5,true,null) as r', [B.id]);
  const matchId = prop.rows[0].r.match_id;
  console.log('propose ->', JSON.stringify(prop.rows[0].r));

  // état pending : ELO inchangé ?
  let st = await c.query('select status, confirmed_by_a, confirmed_by_b, elo_delta_a from matches where id=$1', [matchId]);
  let eloA1 = (await c.query('select elo from players where id=$1', [A.id])).rows[0].elo;
  console.log(`after propose: status=${st.rows[0].status}  A.elo=${eloA1} (attendu ${A.elo}, inchangé)`);

  // B confirme
  await c.query(asUser(B.id));
  const conf = await c.query('select confirm_match($1) as r', [matchId]);
  console.log('confirm  ->', JSON.stringify(conf.rows[0].r));

  st = await c.query('select status, elo_delta_a, elo_delta_b from matches where id=$1', [matchId]);
  const eloA2 = (await c.query('select elo from players where id=$1', [A.id])).rows[0].elo;
  const eloB2 = (await c.query('select elo from players where id=$1', [B.id])).rows[0].elo;
  console.log(`after confirm: status=${st.rows[0].status}  deltaA=${st.rows[0].elo_delta_a} deltaB=${st.rows[0].elo_delta_b}`);
  console.log(`A.elo ${A.elo}->${eloA2}   B.elo ${B.elo}->${eloB2}   (somme delta=${st.rows[0].elo_delta_a + st.rows[0].elo_delta_b})`);

  // notif créée pour B (match_confirm) ?
  const n = await c.query("select type,title from notifications where player_id=$1 and type like 'match%' order by created_at desc limit 1", [B.id]);
  console.log('notif B:', n.rows[0] ? `${n.rows[0].type} — ${n.rows[0].title}` : 'aucune');

  await c.query('rollback');
  console.log('OK (rollback — données intactes)');
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('TEST_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
