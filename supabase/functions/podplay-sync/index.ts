/**
 * Edge Function `podplay-sync` — synchronise les événements Ping Pang Paris
 * depuis PodPlay vers la table `events_ppp`.
 *
 * Auth : Firebase anonymous sign-in (clé web publique du tenant), puis
 * GET /apis/v2/events. cf. le reverse-engineering du monorepo hackathon.
 * Appelable à la main ou via pg_cron (quotidien).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const FIREBASE_API_KEY = 'AIzaSyCC-lxXf8J4BA8JdXDt_auJegsBJ0sG9iM';
const PODPLAY = 'https://pingpangparis.podplay.app/apis/v2';

type PodEvent = { id: string; name: string; subtype?: string; customType?: string; startTime?: string; endTime?: string };

async function anonToken(): Promise<string> {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!r.ok) throw new Error(`firebase ${r.status}`);
  return ((await r.json()) as { idToken: string }).idToken;
}

Deno.serve(async () => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const token = await anonToken();
    const r = await fetch(`${PODPLAY}/events?excludeUnlisted=true&ipp=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return Response.json({ ok: false, error: `events ${r.status}` }, { status: 502 });

    const items = (((await r.json()) as { items?: PodEvent[] }).items ?? []);
    const nowIso = new Date().toISOString();
    const rows = items
      .filter((e) => e.startTime && e.startTime >= nowIso)
      .map((e) => ({
        external_id: e.id,
        title: e.name,
        starts_at: e.startTime ?? null,
        spots_left: null,
        url: 'https://pingpangparis.podplay.app/book',
      }));

    // Retire les events de démo (placeholders) puis upsert les vrais.
    await supabase.from('events_ppp').delete().like('external_id', 'ppp-%');
    if (rows.length) {
      await supabase.from('events_ppp').upsert(rows, { onConflict: 'external_id' });
    }
    return Response.json({ ok: true, fetched: items.length, synced: rows.length });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
