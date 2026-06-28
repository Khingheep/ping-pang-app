/**
 * Edge Function `podplay-sync` — synchronise les événements Ping Pang Paris
 * depuis PodPlay vers `events_ppp`.
 *
 * Auth : Firebase anonymous sign-in (clé web publique du tenant), puis
 * GET /apis/v2/events. cf. reverse-eng du monorepo hackathon.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FIREBASE_API_KEY = 'AIzaSyCC-lxXf8J4BA8JdXDt_auJegsBJ0sG9iM';
const PODPLAY = 'https://pingpangparis.podplay.app/apis/v2';

type PodEvent = { id: string; name: string; startTime?: string };

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

    return Response.json({ ok: true, events: eRows.length });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
