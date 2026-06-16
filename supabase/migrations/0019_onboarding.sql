-- Ping Pang Paris — onboarding v2 (flow Figma) : type de joueur, centres d'intérêt,
-- drapeau onboarded, + bucket Storage pour les photos de profil.

alter table public.players
  add column if not exists player_type text,                   -- occasionnel | regulier | competitif | licencie
  add column if not exists interests   text[] not null default '{}',
  add column if not exists onboarded   boolean not null default false;

-- Les comptes existants sont déjà "onboardés" (ne pas les renvoyer dans le flow).
update public.players set onboarded = true where onboarded = false and play_style is not null;

-- Bucket public pour les avatars (chemin = <user_id>/avatar.jpg).
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

drop policy if exists "avatar read"       on storage.objects;
drop policy if exists "avatar insert own" on storage.objects;
drop policy if exists "avatar update own" on storage.objects;
create policy "avatar read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar insert own" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update own" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
