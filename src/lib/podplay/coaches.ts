import { supabase } from '@/lib/supabase/client';

export type Coach = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  slug: string | null;
  picture_url: string | null;
  tier_name: string | null;
  hourly_rate: number | null;
};

export async function fetchCoaches(): Promise<Coach[]> {
  const { data } = await supabase
    .from('podplay_coaches')
    .select('id, first_name, last_name, slug, picture_url, tier_name, hourly_rate')
    .order('hourly_rate', { ascending: false });
  return (data as Coach[] | null) ?? [];
}

/** Lien vers la fiche/réservation du coach sur PodPlay. */
export function coachUrl(slug: string): string {
  return `https://pingpangparis.podplay.app/coach/${encodeURIComponent(slug)}`;
}
