// Seed de matchs réalistes via le VRAI flux propose_match -> confirm_match (peuple
// matches confirmés + feed_events + applique l'ELO), plus 2 matchs laissés EN ATTENTE
// adressés au dev user (Walid) pour tester la section "À confirmer" en solo.
// Usage: node scripts/seed-matches.mjs "<conn>"
import pg from 'pg';
const conn = process.argv[2];
if (!conn) { console.error('need conn'); process.exit(2); }
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
const asUser = (id) => `set local request.jwt.claims = '${JSON.stringify({ sub: id, role: 'authenticated' })}';`;

await c.connect();
try {
  const { rows } = await c.query('select id, handle from players');
  const id = Object.fromEntries(rows.map((r) => [r.handle, r.id]));

  // [proposeur(gagnant), perdant, sets_gagnant, sets_perdant, classé]
  const confirmed = [
    ['wei', 'lucas', 3, 1, true],
    ['lucas', 'ana', 3, 2, true],
    ['ana', 'emma', 3, 0, true],
    ['yuki', 'maxime', 3, 1, true],
    ['dev', 'thomas', 3, 2, true],   // Walid gagne
    ['emma', 'yuki', 3, 2, true],
    ['wei', 'ana', 3, 0, true],
    ['thomas', 'maxime', 3, 2, false],
    ['lucas', 'emma', 3, 1, true],
    ['maxime', 'dev', 3, 1, true],   // Walid perd (il était player_b, on confirme pour lui)
  ];

  for (const [w, l, ws, ls, ranked] of confirmed) {
    await c.query('begin');
    await c.query(asUser(id[w]));
    const p = await c.query('select propose_match($1,$2,$3,5,$4,null) as r', [id[l], ws, ls, ranked]);
    const mid = p.rows[0].r.match_id;
    await c.query(asUser(id[l]));
    await c.query('select confirm_match($1)', [mid]);
    await c.query('commit');
  }
  console.log(`confirmés: ${confirmed.length}`);

  // En attente, adressés à Walid (player_b) -> apparaissent dans "À confirmer"
  // proposeur = adversaire ; on n'appelle PAS confirm.
  const pending = [
    ['emma', 1, 3],   // Emma saisit sa défaite 1-3 -> Walid a gagné 3-1 (à confirmer)
    ['yuki', 3, 0],   // Yuki saisit sa victoire 3-0 -> Walid a perdu 0-3 (à confirmer/contester)
  ];
  for (const [opp, os, ws] of pending) {
    await c.query('begin');
    await c.query(asUser(id[opp]));
    await c.query('select propose_match($1,$2,$3,5,true,null)', [id['dev'], os, ws]);
    await c.query('commit');
  }
  console.log(`en attente pour Walid: ${pending.length}`);

  const f = await c.query('select count(*)::int n from feed_events');
  const pend = await c.query("select count(*)::int n from matches where status='pending' and player_b=$1", [id['dev']]);
  console.log('feed_events:', f.rows[0].n, '| pending pour Walid:', pend.rows[0].n);
  console.log('SEED_OK');
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('SEED_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
