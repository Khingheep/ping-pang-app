// Référence Glicko-2 (Glickman 2013). Sert à valider l'implémentation PL/pgSQL.
// 1) vérifie l'exemple canonique (batch 3 jeux) -> r'≈1464.06, RD'≈151.52, σ'≈0.05999
// 2) expose un update mono-jeu (1 rating period = 1 match) utilisé par l'app.
const SCALE = 173.7178;
const TAU = 0.5;
const EPS = 1e-6;

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const E = (mu, muj, phij) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

// Update Glicko-2 pour une LISTE d'adversaires (rating period), retourne {rating,rd,vol}.
export function glickoBatch(r, rd, vol, games) {
  const mu = (r - 1500) / SCALE;
  const phi = rd / SCALE;

  let vInv = 0;
  let dSum = 0;
  for (const { rj, rdj, s } of games) {
    const muj = (rj - 1500) / SCALE;
    const phij = rdj / SCALE;
    const gj = g(phij);
    const Ej = E(mu, muj, phij);
    vInv += gj * gj * Ej * (1 - Ej);
    dSum += gj * (s - Ej);
  }
  if (vInv === 0) {
    // aucun jeu : seul le RD enfle (inactivité) — non utilisé ici
    const phiStar = Math.sqrt(phi * phi + vol * vol);
    return { rating: r, rd: phiStar * SCALE, vol };
  }
  const v = 1 / vInv;
  const delta = v * dSum;

  // volatilité (algo Illinois)
  const a = Math.log(vol * vol);
  const f = (x) =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) /
      (2 * Math.pow(phi * phi + v + Math.exp(x), 2)) -
    (x - a) / (TAU * TAU);

  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * TAU) < 0) k += 1;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPS) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const newVol = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newVol * newVol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * dSum;

  return { rating: SCALE * newMu + 1500, rd: SCALE * newPhi, vol: newVol };
}

// 1 match = 1 rating period à un seul adversaire.
export function glickoSingle(r, rd, vol, rj, rdj, s) {
  return glickoBatch(r, rd, vol, [{ rj, rdj, s }]);
}

// Validation de l'exemple canonique si exécuté directement.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const res = glickoBatch(1500, 200, 0.06, [
    { rj: 1400, rdj: 30, s: 1 },
    { rj: 1550, rdj: 100, s: 0 },
    { rj: 1700, rdj: 300, s: 0 },
  ]);
  console.log(`r'=${res.rating.toFixed(2)} (attendu ~1464.06)`);
  console.log(`RD'=${res.rd.toFixed(2)} (attendu ~151.52)`);
  console.log(`vol'=${res.vol.toFixed(6)} (attendu ~0.059996)`);
}
