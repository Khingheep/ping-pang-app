// Envoie un défi à Walid (compte dev) depuis un autre joueur, via le vrai flux RLS
// (insert dans `challenges` en se faisant passer pour l'expéditeur). Pour tester la
// réception d'un défi en solo.
// Usage: node scripts/send-challenge.mjs "<conn>" [formatBoX]
import pg from 'pg';

const conn = process.argv[2];
const format = process.argv[3] ?? 'bo5';
if (!conn) {
  console.error('need conn: node scripts/send-challenge.mjs "<conn>" [bo3|bo5|bo7]');
  process.exit(2);
}

const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });
const asUser = (id) => `set local request.jwt.claims = '${JSON.stringify({ sub: id, role: 'authenticated' })}';`;

await c.connect();
try {
  // Cible = Walid : handle 'dev' sinon nom contenant « walid ».
  const target = await c.query(
    `select id, display_name from players
       where handle = 'dev' or display_name ilike '%walid%'
       order by (handle = 'dev') desc limit 1`,
  );
  if (!target.rows.length) throw new Error('Joueur Walid introuvable (ni handle=dev, ni nom ~ walid)');
  const me = target.rows[0];

  // Expéditeur = le joueur au plus haut ELO qui n'est pas Walid (un défi « qui en jette »).
  const sender = await c.query(
    `select id, display_name from players where id <> $1 order by elo desc nulls last limit 1`,
    [me.id],
  );
  if (!sender.rows.length) throw new Error('Aucun autre joueur pour envoyer le défi');
  const from = sender.rows[0];

  await c.query('begin');
  await c.query(asUser(from.id));
  await c.query(
    `insert into challenges (from_player, to_player, format, message, status)
       values ($1, $2, $3, $4, 'sent')`,
    [from.id, me.id, format, `Défi ${format.toUpperCase()} — on se fait un match ?`],
  );
  await c.query('commit');

  console.log(`Défi envoyé : ${from.display_name} → ${me.display_name} (format ${format})`);
} catch (e) {
  await c.query('rollback').catch(() => {});
  console.error('Échec:', e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
