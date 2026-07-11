// One-shot : crée un match confirmé « Walid (test) bat 🤖 Léo 3-1 » via le vrai flux.
//  1. jeton utilisateur Walid via admin generate_link (magiclink OTP) -> verify
//  2. propose_match(Léo, 3, 1) en tant que Walid  -> match 'pending'
//  3. service_role : confirmed_by_b = true + _settle_match  (= confirmation de Léo, qui n'a pas de compte auth)
// Usage: URL=.. ANON=.. SVC=.. node scripts/create-match-walid.mjs
const URL = process.env.URL, ANON = process.env.ANON, SVC = process.env.SVC;
if (!URL || !ANON || !SVC) { console.error('URL + ANON + SVC requis'); process.exit(2); }

const WALID = { id: '08575652-1a3e-4862-82b0-be8effbf9ecb', email: 'test@gmail.com', name: 'Walid Bouzidane' };
const LEO   = { id: '2c68d3cb-a244-44b3-ac2e-2bea7f2ed953', name: '🤖 Léo (test)' };

const svcH  = { apikey: SVC,  Authorization: `Bearer ${SVC}`,  'Content-Type': 'application/json' };
const anonH = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' };

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };

// ELO avant
const before = await fetch(`${URL}/rest/v1/players?id=in.(${WALID.id},${LEO.id})&select=id,display_name,elo`, { headers: svcH }).then(j);
console.log('AVANT :', before.map((p) => `${p.display_name}=${p.elo}`).join('  |  '));

// 1. jeton Walid
const link = await fetch(`${URL}/auth/v1/admin/generate_link`, {
  method: 'POST', headers: svcH, body: JSON.stringify({ type: 'magiclink', email: WALID.email }),
}).then(j);
const otp = link?.email_otp ?? link?.properties?.email_otp;
if (!otp) { console.error('pas d OTP:', JSON.stringify(link).slice(0, 300)); process.exit(1); }

let verify = await fetch(`${URL}/auth/v1/verify`, {
  method: 'POST', headers: anonH, body: JSON.stringify({ type: 'magiclink', email: WALID.email, token: otp }),
}).then(j);
let token = verify?.access_token;
if (!token) {
  verify = await fetch(`${URL}/auth/v1/verify`, {
    method: 'POST', headers: anonH, body: JSON.stringify({ type: 'email', email: WALID.email, token: otp }),
  }).then(j);
  token = verify?.access_token;
}
if (!token) { console.error('verify KO:', JSON.stringify(verify).slice(0, 300)); process.exit(1); }
const walidH = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
console.log('jeton Walid obtenu ✓');

// 2. propose_match (Walid gagne 3-1)
const prop = await fetch(`${URL}/rest/v1/rpc/propose_match`, {
  method: 'POST', headers: walidH,
  body: JSON.stringify({ p_opponent: LEO.id, p_my_sets: 3, p_opp_sets: 1, p_best_of: 5, p_is_ranked: true, p_set_scores: '11-7,9-11,11-8,11-6' }),
}).then(j);
const matchId = prop?.match_id;
if (!matchId) { console.error('propose KO:', JSON.stringify(prop).slice(0, 300)); process.exit(1); }
console.log('propose ✓ match', matchId, '| preview_delta', prop.preview_delta);

// 3. confirmation « côté Léo » via service_role (Léo n'a pas de compte auth)
const patch = await fetch(`${URL}/rest/v1/matches?id=eq.${matchId}`, {
  method: 'PATCH', headers: { ...svcH, Prefer: 'return=minimal' }, body: JSON.stringify({ confirmed_by_b: true }),
});
if (!patch.ok) { console.error('patch KO', patch.status, await patch.text()); process.exit(1); }
const settle = await fetch(`${URL}/rest/v1/rpc/_settle_match`, {
  method: 'POST', headers: svcH, body: JSON.stringify({ p_match: matchId }),
});
if (!settle.ok) { console.error('settle KO', settle.status, await settle.text()); process.exit(1); }
console.log('confirm + settle ✓');

// vérif
const match = await fetch(`${URL}/rest/v1/matches?id=eq.${matchId}&select=score,status,is_ranked,winner,elo_delta_a,elo_delta_b,created_at`, { headers: svcH }).then(j);
const after = await fetch(`${URL}/rest/v1/players?id=in.(${WALID.id},${LEO.id})&select=id,display_name,elo,level`, { headers: svcH }).then(j);
const feed = await fetch(`${URL}/rest/v1/feed_events?actor_id=eq.${WALID.id}&type=eq.match&order=created_at.desc&limit=1&select=title,body,elo_delta`, { headers: svcH }).then(j);
console.log('\nMATCH :', JSON.stringify(match[0]));
console.log('APRÈS :', after.map((p) => `${p.display_name}=${p.elo} (${p.level})`).join('  |  '));
console.log('FEED  :', feed[0] ? `${feed[0].title} — ${feed[0].body} (${feed[0].elo_delta > 0 ? '+' : ''}${feed[0].elo_delta})` : 'aucun');
console.log('\nDONE');
