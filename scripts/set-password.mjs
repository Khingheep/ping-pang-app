// Réinitialise le mot de passe d'un compte (test) à une valeur connue.
// Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/set-password.mjs <email> <password>

const SVC = process.env.SUPABASE_SERVICE_ROLE;
const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const [, , email, password] = process.argv;
if (!SVC || !BASE || !email || !password) {
  console.error('Usage: SUPABASE_SERVICE_ROLE=... EXPO_PUBLIC_SUPABASE_URL=... node scripts/set-password.mjs <email> <password>');
  process.exit(2);
}
const h = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };

const res = await fetch(`${BASE}/auth/v1/admin/users?per_page=200`, { headers: h });
const { users } = await res.json();
const u = (users ?? []).find((x) => (x.email ?? '').toLowerCase() === email.toLowerCase());
if (!u) {
  console.error(`Compte introuvable : ${email}`);
  process.exit(1);
}

const r = await fetch(`${BASE}/auth/v1/admin/users/${u.id}`, {
  method: 'PUT',
  headers: h,
  body: JSON.stringify({ password, email_confirm: true }),
});
console.log(r.ok ? `✓ mot de passe de ${email} = ${password}` : `✗ ${r.status} ${await r.text()}`);
