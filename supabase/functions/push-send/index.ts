/**
 * Edge Function `push-send` — envoie les notifications en attente via Expo Push Service.
 * Appelée :
 *   - en POST { notification_id } par le trigger pg_net (livraison instantanée), ou
 *   - sans body (scan des notifications non envoyées, filet de sécurité).
 * Récupère les tokens Expo du joueur, POST vers https://exp.host/--/api/v2/push/send, marque `pushed`.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

type Notif = { id: string; player_id: string; title: string; body: string | null };

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let notificationId: string | null = null;
  try {
    const b = await req.json();
    notificationId = b?.notification_id ?? null;
  } catch {
    /* pas de body → mode scan */
  }

  try {
    const base = supabase.from('notifications').select('id, player_id, title, body').eq('pushed', false);
    const { data: notifs } = notificationId
      ? await base.eq('id', notificationId)
      : await base.order('created_at', { ascending: true }).limit(50);

    const list = (notifs as Notif[] | null) ?? [];
    if (list.length === 0) return Response.json({ ok: true, sent: 0 });

    // tokens de tous les joueurs concernés
    const playerIds = [...new Set(list.map((n) => n.player_id))];
    const { data: tokenRows } = await supabase.from('push_tokens').select('player_id, token').in('player_id', playerIds);
    const byPlayer = new Map<string, string[]>();
    for (const t of (tokenRows as { player_id: string; token: string }[] | null) ?? []) {
      byPlayer.set(t.player_id, [...(byPlayer.get(t.player_id) ?? []), t.token]);
    }

    // messages Expo
    const messages = list.flatMap((n) =>
      (byPlayer.get(n.player_id) ?? []).map((to) => ({
        to,
        title: n.title,
        body: n.body ?? '',
        sound: 'default',
        priority: 'high',
      })),
    );

    let sent = 0;
    if (messages.length > 0) {
      // Expo accepte des lots de 100
      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        const r = await fetch(EXPO_PUSH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(chunk),
        });
        if (r.ok) sent += chunk.length;
      }
    }

    // marquer toutes les notifs traitées (même sans token → évite de re-scanner indéfiniment)
    await supabase.from('notifications').update({ pushed: true }).in('id', list.map((n) => n.id));

    return Response.json({ ok: true, notifs: list.length, sent });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
