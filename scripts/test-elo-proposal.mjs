// Banc d'essai des paramètres ELO proposés par Paul (06/07/2026).
// Miroir JS de src/lib/elo/proposal.ts (même pattern que glicko-ref.mjs vs PL/pgSQL).
// Usage : node scripts/test-elo-proposal.mjs
//
//   ELO départ = points FFTT + 500, sinon 1000
//   ELO' = ELO + K * Poids * (Résultat - P) ; P = 1/(1+10^((adv-moi)/400))
//   K = 80 (0-5 matchs app) · 50 (6-10) · 30 (11+) ; Poids app 1 · FFTT 1.2
//
// 4 scénarios : convergence d'un nouveau · correction d'un seed FFTT faux ·
// inflation d'un pool fermé · volatilité d'un joueur 100% FFTT (piège du
// compteur "matchs app").

import { glickoSingle } from './glicko-ref.mjs';

// ---------- formule proposée (miroir de proposal.ts) ----------
const expected = (me, opp) => 1 / (1 + Math.pow(10, (opp - me) / 400));
const kPaul = (appMatches) => (appMatches <= 5 ? 80 : appMatches <= 10 ? 50 : 30);
const step = (rating, opp, result, k, weight = 1) => rating + k * weight * (result - expected(rating, opp));

// ---------- RNG déterministe (reproductible) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rng) => {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const std = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

// Un match contre le pool : adversaire "établi" (rating = vrai niveau) proche
// du rating courant (matchmaking ±150), issue tirée sur les VRAIS niveaux.
function playOne(rng, myTrue, myRating) {
  const oppTrue = Math.max(800, Math.min(2600, myRating + 150 * gauss(rng)));
  const win = rng() < expected(myTrue, oppTrue) ? 1 : 0;
  return { oppTrue, win };
}

const N_SIM = 2000;
const line = (label, vals) => console.log(label.padEnd(34) + vals.map((v) => String(v).padStart(9)).join(''));

// ---------- Scénario A : convergence d'un nouveau (vrai 1400, départ 1000) ----------
console.log('\n=== A. Convergence nouveau joueur — vrai niveau 1400, départ 1000 ===');
console.log('(erreur médiane |ELO - 1400| après N matchs app, sur ' + N_SIM + ' simulations)\n');
const CHECKPOINTS = [5, 10, 15, 20, 30, 50];
{
  const systems = {
    'Paul K=80/50/30': (s, opp, win, n) => step(s.r, opp, win, kPaul(n)),
    'App actuelle K=32': (s, opp, win) => step(s.r, opp, win, 32),
    'Glicko-2 (prod)': (s, opp, win) => {
      const g = glickoSingle(s.r, s.rd, s.vol, opp, 60, win);
      s.rd = g.rd;
      s.vol = g.vol;
      return g.rating;
    },
  };
  const errs = {};
  const firstHit = {};
  for (const name of Object.keys(systems)) {
    if (!systems[name]) continue;
    errs[name] = CHECKPOINTS.map(() => []);
    firstHit[name] = [];
    const rng = mulberry32(42);
    for (let i = 0; i < N_SIM; i++) {
      const s = { r: 1000, rd: 350, vol: 0.06 };
      let hit = null;
      for (let n = 0; n < 50; n++) {
        const { oppTrue, win } = playOne(rng, 1400, s.r);
        s.r = systems[name](s, oppTrue, win, n);
        if (hit === null && Math.abs(s.r - 1400) <= 50) hit = n + 1;
        const ci = CHECKPOINTS.indexOf(n + 1);
        if (ci >= 0) errs[name][ci].push(Math.abs(s.r - 1400));
      }
      firstHit[name].push(hit ?? 51);
    }
  }
  line('après N matchs →', CHECKPOINTS);
  for (const name of Object.keys(errs)) {
    line(name, errs[name].map((e) => Math.round(median(e))));
  }
  console.log();
  for (const name of Object.keys(errs)) {
    console.log(`1er passage à ±50 pts (médiane) — ${name} : ${median(firstHit[name])} matchs`);
  }
}

// ---------- Scénario B : seed FFTT faux de ±300 ----------
console.log('\n=== B. Seed FFTT décalé — vrai 1400, départ 1700 (surcoté) ou 1100 (sous-coté) ===');
console.log('(erreur médiane après N matchs, K de Paul)\n');
{
  line('après N matchs →', CHECKPOINTS);
  for (const [label, start] of [['surcoté +300 (départ 1700)', 1700], ['sous-coté -300 (départ 1100)', 1100]]) {
    const errs = CHECKPOINTS.map(() => []);
    const rng = mulberry32(7);
    for (let i = 0; i < N_SIM; i++) {
      let r = start;
      for (let n = 0; n < 50; n++) {
        const { oppTrue, win } = playOne(rng, 1400, r);
        r = step(r, oppTrue, win, kPaul(n));
        const ci = CHECKPOINTS.indexOf(n + 1);
        if (ci >= 0) errs[ci].push(Math.abs(r - 1400));
      }
    }
    line(label, errs.map((e) => Math.round(median(e))));
  }
}

// ---------- Scénario C : inflation d'un pool fermé ----------
console.log('\n=== C. Déflation — pool de 60 joueurs, un nouveau sous-coté (départ 1000) arrive tous les 50 matchs ===');
console.log('(dérive = ELO - vrai niveau, après 6000 matchs, moyenne sur 20 pools ; les nouveaux');
console.log(' sous-cotés "siphonnent" les points des établis en montant)\n');
{
  for (const [label, kFn] of [
    ['Paul K=80/50/30', (n) => kPaul(n)],
    ['K=32 fixe', () => 32],
  ]) {
    const driftAll = [];
    const driftEstablished = [];
    for (let p = 0; p < 20; p++) {
      const rng = mulberry32(1000 + p);
      const pool = Array.from({ length: 60 }, () => {
        const t = 1400 + 200 * gauss(rng);
        return { true: t, r: t, n: 20, founder: true }; // établis : bien cotés d'entrée
      });
      for (let m = 0; m < 6000; m++) {
        if (m % 50 === 0) pool.push({ true: 1400 + 200 * gauss(rng), r: 1000, n: 0, founder: false });
        const a = pool[Math.floor(rng() * pool.length)];
        let b = pool[Math.floor(rng() * pool.length)];
        if (a === b) continue;
        const winA = rng() < expected(a.true, b.true) ? 1 : 0;
        const ra = step(a.r, b.r, winA, kFn(a.n));
        const rb = step(b.r, a.r, 1 - winA, kFn(b.n));
        a.r = ra;
        b.r = rb;
        a.n++;
        b.n++;
      }
      driftAll.push(mean(pool.map((x) => x.r - x.true)));
      driftEstablished.push(mean(pool.filter((x) => x.founder).map((x) => x.r - x.true)));
    }
    const fmt = (xs) => `${mean(xs) >= 0 ? '+' : ''}${mean(xs).toFixed(1)} pts (±${std(xs).toFixed(1)})`;
    console.log(`${label.padEnd(20)} pool entier : ${fmt(driftAll).padEnd(22)} établis seuls : ${fmt(driftEstablished)}`);
  }
}

// ---------- Scénario D : joueur 100% FFTT — le compteur K ne bouge jamais ----------
console.log('\n=== D. Joueur 100% FFTT, déjà bien coté (1800) — 40 matchs FFTT contre niveau équivalent ===');
console.log('(spec littérale : K dépend des matchs APP → reste à 80×1.2=96/match pour toujours)\n');
{
  for (const [label, countsTowardK] of [
    ['Spec littérale (K figé à 80)', false],
    ['Variante : FFTT compte dans K', true],
  ]) {
    const finals = [];
    const rng = mulberry32(99);
    for (let i = 0; i < N_SIM; i++) {
      let r = 1800;
      for (let n = 0; n < 40; n++) {
        const { oppTrue, win } = playOne(rng, 1800, r);
        r = step(r, oppTrue, win, kPaul(countsTowardK ? n : 0), 1.2);
      }
      finals.push(r);
    }
    console.log(`${label.padEnd(34)} écart-type final : ±${std(finals).toFixed(0)} pts (extrêmes ${Math.round(Math.min(...finals))} / ${Math.round(Math.max(...finals))})`);
  }
}

console.log('\nAnalyse complète + recommandations : taches/elo-params-paul.md');
