/**
 * Upload d'une session FFTT validée vers Supabase (table `fftt_session`),
 * consommée ensuite par l'Edge Function `fftt`.
 *
 * Lit `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` dans l'environnement
 * (cf. scripts/fftt/.env). La service_role est requise : la table n'a aucune
 * policy RLS publique.
 */

import { createClient } from '@supabase/supabase-js';

export async function uploadSession(
  phpsessid: string,
  opts: { ttlHours?: number } = {},
): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants — renseigne scripts/fftt/.env (cf. .env.example).',
    );
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (opts.ttlHours ?? 6) * 3600 * 1000);

  const { error } = await supabase.from('fftt_session').upsert({
    id: 1,
    phpsessid,
    validated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    updated_at: now.toISOString(),
  });
  if (error) throw new Error(`upsert fftt_session: ${error.message}`);
}
