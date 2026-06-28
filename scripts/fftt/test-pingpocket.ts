/**
 * Harnais de test pour l'adaptateur PingPocket de l'Edge Function.
 * Lance : `npx tsx test-pingpocket.ts`
 *
 * Phase A — OFFLINE : `fetch` est mocké avec les fixtures réelles du HAR
 *   (www.pingpocket.fr.har), pour tester le mapping de façon déterministe.
 * Phase B — LIVE : 2 appels réels (gentle, anti-429) pour confirmer le bout-en-bout.
 */
import { readFileSync } from 'node:fs';
import {
  searchFftt,
  getDetailFftt,
  getHistoryFftt,
  getCommonOpponentsFftt,
} from '../../supabase/functions/fftt/pingpocket.ts';

const HAR = 'C:/Users/walid/Desktop/THE BRADERY/pocscrappingean/www.pingpocket.fr.har';
const ID = '7519477';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name}`, extra !== undefined ? extra : '');
  }
}

// ─────────── Extraction des fixtures depuis le HAR ───────────
type HarEntry = { request: { url: string }; response: { content: { text?: string } } };
const har = JSON.parse(readFileSync(HAR, 'utf-8')) as { log: { entries: HarEntry[] } };
const find = (pred: (u: string) => boolean) =>
  har.log.entries.find((e) => pred(e.request.url))?.response.content.text ?? '';

const profileJson = find((u) => u.endsWith(`/api/licensees/${ID}`));
const matchesJson = find((u) => u.endsWith(`/api/licensees/${ID}/matches`));
const searchHtml = find((u) => u.includes('form/resultats'));

// ─────────── Phase A : OFFLINE (fetch mocké) ───────────
const realFetch = globalThis.fetch;
function mockFetchWith(map: (url: string) => { body: string; status?: number } | null) {
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    const hit = map(url);
    if (!hit) return Promise.resolve(new Response('not found', { status: 404 }));
    return Promise.resolve(new Response(hit.body, { status: hit.status ?? 200 }));
  }) as typeof fetch;
}

async function phaseA() {
  console.log('\n── Phase A : OFFLINE (fixtures HAR) ──');
  check('fixtures chargées', !!profileJson && !!matchesJson, {
    profile: profileJson.length,
    matches: matchesJson.length,
  });

  mockFetchWith((url) => {
    if (url.endsWith(`/api/licensees/${ID}/matches`)) return { body: matchesJson };
    if (url.endsWith(`/api/licensees/${ID}`)) return { body: profileJson };
    if (url.includes('form/resultats')) return { body: searchHtml };
    return null;
  });

  // search par licence → 1 joueur mappé depuis le JSON profil
  const byLic = await searchFftt(null, { licence: ID });
  check('search(licence) → 1 résultat', byLic.length === 1, byLic.length);
  const p = byLic[0];
  check('nom = GHEERAERT', p?.nom === 'GHEERAERT', p?.nom);
  check('prenom = Paul', p?.prenom === 'Paul', p?.prenom);
  check('pointsOfficiels = 2228', p?.pointsOfficiels === 2228, p?.pointsOfficiels);
  check('pointsMensuels = 2268.59', p?.pointsMensuels === 2268.59, p?.pointsMensuels);
  check('club nom', p?.club?.nom === 'ENTENTE SAINT PIERRAISE TT', p?.club?.nom);
  check('sexe = H', p?.sexe === 'H', p?.sexe);

  // détail → profil + matchs + stats calculées
  const d = await getDetailFftt(null, ID);
  check('detail.pointsOfficiels = 2228', d.pointsOfficiels === 2228, d.pointsOfficiels);
  check('detail.pointsMensuels = 2268.59', d.pointsMensuels === 2268.59, d.pointsMensuels);
  check('detail a des matchs', d.matchs.length > 0, d.matchs.length);
  check(
    'partiesDisputees = nb matchs',
    d.partiesDisputees === d.matchs.length,
    `${d.partiesDisputees} vs ${d.matchs.length}`,
  );
  const m0 = d.matchs[0];
  check('match date format JJ/MM/AA', /^\d{2}\/\d{2}\/\d{2}$/.test(m0?.date ?? ''), m0?.date);
  check('1er match = 13/09/25 (epoch→Paris)', m0?.date === '13/09/25', m0?.date);
  check('match.victoire booléen', typeof m0?.victoire === 'boolean', m0?.victoire);
  check('match.adversaire.numberId présent', !!m0?.adversaire.numberId, m0?.adversaire);
  check(
    'pctVictoires cohérent (0–100)',
    d.pctVictoires != null && d.pctVictoires >= 0 && d.pctVictoires <= 100,
    d.pctVictoires,
  );
  check('evolutionMois calculée', d.evolutionMois != null, d.evolutionMois);
  // Nouveaux champs enrichis
  check('detail.pointsTempsReel = 2273.25', d.pointsTempsReel === 2273.25, d.pointsTempsReel);
  check('detail.pointsDebutSaison = 2241', d.pointsDebutSaison === 2241, d.pointsDebutSaison);
  check('detail.pointsMensuelsPrecedents = 2270.59', d.pointsMensuelsPrecedents === 2270.59, d.pointsMensuelsPrecedents);
  check('match.competition rempli', !!m0?.competition?.nom, m0?.competition);
  check('match.pointAccuracy = OFFICIAL', m0?.pointAccuracy === 'OFFICIAL', m0?.pointAccuracy);
  check('player(licence).pointsTempsReel', p?.pointsTempsReel === 2273.25, p?.pointsTempsReel);

  // search par nom → parse HTML. Le HTML du HAR est une page profil (résultat
  // UNIQUE) : le parseur doit en extraire 1 seul joueur, pas les liens de menu.
  const byName = await searchFftt(null, { nom: 'Gheeraert' });
  check('search(nom) résultat unique → 1 joueur (pas le menu)', byName.length === 1, byName.length);
  check('search(nom) → GHEERAERT Paul', byName[0]?.nom === 'GHEERAERT' && byName[0]?.prenom === 'Paul', byName[0]);
  check(
    'search(nom) ids numériques',
    byName.every((x) => /^\d+$/.test(x.numberId)),
    byName.map((x) => x.numberId),
  );

  globalThis.fetch = realFetch;
}

// ─────────── Phase B : LIVE (2 appels max) ───────────
async function phaseB() {
  console.log('\n── Phase B : LIVE (réseau réel, gentle) ──');
  try {
    const results = await searchFftt(null, { nom: 'Gheeraert' });
    check('LIVE search(nom) ≥ 5 résultats', results.length >= 5, results.length);
    const paul = results.find((r) => r.numberId === ID);
    check('LIVE trouve Paul (7519477)', !!paul, paul?.prenom);
    check(
      'LIVE classement parsé (Paul=N531→rang 531)',
      paul?.rangNational === 531,
      { rang: paul?.rangNational, cl: paul?.classementOfficiel },
    );

    const detail = await getDetailFftt(null, ID);
    check('LIVE detail points', detail.pointsOfficiels != null, detail.pointsOfficiels);
    check('LIVE detail matchs', detail.matchs.length > 0, detail.matchs.length);
    console.log(
      `     → ${paul?.nom} ${paul?.prenom} | off=${detail.pointsOfficiels} men=${detail.pointsMensuels} | ${detail.matchs.length} matchs | ${detail.partiesDisputees} parties, ${detail.pctVictoires}% V`,
    );

    // Résultat unique (nom + prénom restreints) → 1 joueur, pas le menu profil.
    const one = await searchFftt(null, { nom: 'Gh', prenom: 'Paul' });
    check('LIVE résultat unique → 1 joueur', one.length === 1, one.length);
    check('LIVE résultat unique = Paul (7519477)', one[0]?.numberId === ID, one[0]);

    // Femmes : la recherche n'est pas filtrée par sexe.
    const fem = await searchFftt(null, { nom: 'Pavade', prenom: 'Prithika' });
    check('LIVE femme trouvée (Pavade Prithika)', fem.length >= 1, fem.map((f) => `${f.nom} ${f.prenom}`));
    if (fem[0]) {
      const fd = await getDetailFftt(null, fem[0].numberId);
      check('LIVE femme : fiche récupérée', fd.pointsOfficiels != null || fd.matchs.length >= 0, fd.pointsOfficiels);
    }

    // #3 Historique de classement (page Highcharts).
    const hist = await getHistoryFftt(null, ID);
    check('LIVE historique non vide', hist.length > 0, hist.length);
    check('LIVE historique trié dates ISO', hist.every((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.date)), hist[0]);
    check('LIVE historique points numériques', hist.every((h) => typeof h.points === 'number'), hist[0]);
    console.log(`     → historique: ${hist.length} pts, de ${hist[0]?.date} (${hist[0]?.points}) à ${hist.at(-1)?.date} (${hist.at(-1)?.points})`);

    // #3 Adversaires communs (intersection des historiques de matchs).
    const common = await getCommonOpponentsFftt(null, ID, '7519476');
    check('LIVE adversaires communs = tableau', Array.isArray(common), typeof common);
    check(
      'LIVE adversaires communs : shape OK',
      common.every((c) => c.opponent?.numberId && Array.isArray(c.a) && Array.isArray(c.b)),
      common.length,
    );
    console.log(`     → ${common.length} adversaire(s) commun(s) Paul/Leo GHEERAERT`);
  } catch (err) {
    check('LIVE sans erreur', false, err instanceof Error ? err.message : err);
  }
}

await phaseA();
await phaseB();

console.log(`\n${'='.repeat(40)}\nRésultat : ${pass} ✅  /  ${fail} ❌`);
process.exit(fail ? 1 : 0);
