// Test e2e du système d'amis : RLS (rôle authenticated + GUC), triggers notif, statuts.
// Puis seed réel (commit) : Walid <-> Wei amis + Lucas -> Walid en attente (pour tester en solo).
// Usage: node scripts/test-friends.mjs "<conn>"
import pg from 'pg';

const conn = process.argv[2];
if (!conn) { console.error('need conn'); process.exit(2); }
const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
const asUser = (id) => `set local role authenticated; set local request.jwt.claims = '${JSON.stringify({ sub: id, role: 'authenticated' })}';`;

await c.connect();
try {
  const { rows } = await c.query('select id, handle from players');
  const id = Object.fromEntries(rows.map((r) => [r.handle, r.id]));

  // ---------- A) RLS (rollback) ----------
  await c.query('begin');
  await c.query(asUser(id.dev)); // Walid
  await c.query('insert into friendships(requester,addressee,status) values($1,$2,$3)', [id.dev, id.wei, 'pending']);
  console.log('RLS insert (requester=moi) -> OK');

  let blocked = false;
  await c.query('savepoint sp');
  try {
    await c.query('insert into friendships(requester,addressee,status) values($1,$2,$3)', [id.lucas, id.wei, 'pending']);
    await c.query('release savepoint sp');
  } catch {
    blocked = true;
    await c.query('rollback to savepoint sp'); // sinon la transaction reste avortée
  }
  console.log('RLS insert (requester=autre) bloqué ->', blocked ? 'OK ✅' : 'NON ❌');

  await c.query('reset role');
  await c.query(asUser(id.wei)); // Wei accepte
  const upd = await c.query("update friendships set status='accepted' where requester=$1 and addressee=$2", [id.dev, id.wei]);
  console.log('RLS accept (addressee) -> lignes maj:', upd.rowCount);

  await c.query('reset role');
  await c.query(asUser(id.thomas)); // tiers
  const seen = await c.query('select count(*)::int n from friendships where requester=$1 and addressee=$2', [id.dev, id.wei]);
  console.log('RLS read tiers (doit voir 0) ->', seen.rows[0].n === 0 ? 'OK ✅' : `NON ❌ (${seen.rows[0].n})`);
  await c.query('reset role');
  await c.query('rollback');

  // ---------- B) Seed réel (commit, superuser) ----------
  await c.query('begin');
  // Walid <-> Wei : pending puis accepted (déclenche les 2 notifs)
  await c.query("insert into friendships(requester,addressee,status) values($1,$2,'pending') on conflict do nothing", [id.dev, id.wei]);
  await c.query("update friendships set status='accepted' where requester=$1 and addressee=$2", [id.dev, id.wei]);
  // Lucas -> Walid : demande en attente (Walid pourra accepter sur le profil de Lucas)
  await c.query("insert into friendships(requester,addressee,status) values($1,$2,'pending') on conflict do nothing", [id.lucas, id.dev]);
  await c.query('commit');

  const friends = await c.query(
    "select status, requester, addressee from friendships where requester=$1 or addressee=$1",
    [id.dev],
  );
  const accepted = friends.rows.filter((r) => r.status === 'accepted').length;
  const pendingIn = friends.rows.filter((r) => r.status === 'pending' && r.addressee === id.dev).length;
  console.log(`\nWalid : ${accepted} ami(s) accepté(s), ${pendingIn} demande(s) entrante(s)`);
  const notifs = await c.query("select type from notifications where player_id=$1 and type like 'friend%'", [id.dev]);
  console.log('notifs amis pour Walid:', notifs.rows.map((r) => r.type).join(', ') || 'aucune');
  console.log('SEED_OK');
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('TEST_ERROR:', e.message);
  process.exitCode = 1;
} finally {
  await c.end().catch(() => {});
}
