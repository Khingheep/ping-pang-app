/**
 * Edge Function `podplay-sync` — synchronise événements + coachs Ping Pang Paris
 * depuis PodPlay vers `events_ppp` et `podplay_coaches`.
 *
 * Auth : Firebase anonymous sign-in (clé web publique du tenant), puis
 * GET /apis/v2/events et /apis/v2/coaches. cf. reverse-eng du monorepo hackathon.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FIREBASE_API_KEY = 'AIzaSyCC-lxXf8J4BA8JdXDt_auJegsBJ0sG9iM';
const PODPLAY = 'https://pingpangparis.podplay.app/apis/v2';

const TIERS: Record<string, [string, number]> = {
  '7782d1dd-9a17-4ce6-8191-3dcbfe8c33b3': ['Enfants & Amateurs', 50],
  'a0b24e9c-43f7-441d-abbe-4d212ca9ffb9': ['National', 80],
  'a897ce62-57e4-484d-b13c-08bd2d7109eb': ['Olympic', 100],
  'd2a1c986-aa28-4646-8585-95fef2760071': ['International', 90],
  'e9594342-ccfd-464b-ae62-86212fcb300f': ['Club', 50],
};

type PodEvent = { id: string; name: string; startTime?: string };
type PodCoach = {
  id: string;
  firstName?: string;
  lastName?: string;
  slug?: string;
  description?: string | null;
  picture?: { small?: { href: string }; medium?: { href: string } };
  tierSettings?: { id: string };
};

async function anonToken(): Promise<string> {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!r.ok) throw new Error(`firebase ${r.status}`);
  return ((await r.json()) as { idToken: string }).idToken;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(token: string, path: string): Promise<any> {
  const r = await fetch(`${PODPLAY}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const token = await anonToken();

    // --- Événements ---
    const events = ((await get(token, '/events?excludeUnlisted=true&ipp=100')).items ?? []) as PodEvent[];
    const nowIso = new Date().toISOString();
    const eRows = events
      .filter((e) => e.startTime && e.startTime >= nowIso)
      .map((e) => ({
        external_id: e.id,
        title: e.name,
        starts_at: e.startTime ?? null,
        spots_left: null,
        url: 'https://pingpangparis.podplay.app/book',
      }));
    await supabase.from('events_ppp').delete().like('external_id', 'ppp-%');
    if (eRows.length) await supabase.from('events_ppp').upsert(eRows, { onConflict: 'external_id' });

    // --- Coachs ---
    const coaches = ((await get(token, '/coaches')).items ?? []) as PodCoach[];
    const cRows = coaches
      .filter((c) => !((c.firstName ?? '').toLowerCase() === 'account' && (c.lastName ?? '').toLowerCase().startsWith('deleted')))
      .map((c) => {
        const [tierName, rate] = TIERS[c.tierSettings?.id ?? ''] ?? ['Club', 50];
        return {
          id: c.id,
          first_name: (c.firstName ?? '').trim() || null,
          last_name: (c.lastName ?? '').trim() || null,
          slug: c.slug ?? null,
          picture_url: c.picture?.medium?.href ?? c.picture?.small?.href ?? null,
          description: c.description ?? null,
          tier_name: tierName,
          hourly_rate: rate,
          synced_at: new Date().toISOString(),
        };
      });
    if (cRows.length) await supabase.from('podplay_coaches').upsert(cRows, { onConflict: 'id' });

    return Response.json({ ok: true, events: eRows.length, coaches: cRows.length });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
