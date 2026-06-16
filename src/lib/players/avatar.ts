import { supabase } from '@/lib/supabase/client';

/** Upload une photo de profil (chemin <userId>/avatar.jpg) et renvoie l'URL publique. */
export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`; // cache-bust pour rafraîchir l'affichage
}
