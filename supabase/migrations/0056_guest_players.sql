-- Ping Pang Paris — Joueurs « invités » (sans compte) pour les tournois.
--
-- Contexte : lors d'un event, l'organisateur veut inscrire des participants qui n'ont PAS
-- de compte dans l'app (« rajouter un participant »). Comme tout le moteur de tournoi
-- (poules, tableau, matchs) est clé sur des lignes `players`, un invité DOIT être une vraie
-- ligne `players` — mais sans utilisateur auth associé.
--
-- 1) On découple `players.id` de `auth.users` : les vrais joueurs gardent leur uid auth,
--    les invités reçoivent un uuid aléatoire sans compte. Les lignes existantes restent
--    valides ; la RLS `insert own player` (auth.uid() = id) empêche toujours un utilisateur
--    de forger un joueur → la création d'invités passe par la fonction sécurisée ci-dessous.
-- 2) Un invité n'affecte AUCUN classement : masqué du leaderboard côté app (filtre is_guest),
--    et la saisie d'un score de tournoi n'écrit jamais l'ELO.

alter table public.players drop constraint if exists players_id_fkey;

alter table public.players
  add column if not exists is_guest   boolean not null default false,
  add column if not exists created_by uuid;   -- organisateur ayant créé l'invité (info)

-- Création d'un invité + inscription au tournoi, atomique. Réservée à l'organisateur du
-- tournoi ; SECURITY DEFINER pour contourner la RLS `insert own player`. ELO optionnel (1200).
create or replace function public.create_tournament_guest(
  t_id uuid,
  guest_name text,
  guest_elo int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  t      public.tournaments;
  new_id uuid := gen_random_uuid();
  n      int;
  clean  text := btrim(coalesce(guest_name, ''));
begin
  select * into t from public.tournaments where id = t_id;
  if t.id is null then
    raise exception 'tournoi introuvable';
  end if;
  if auth.uid() <> t.owner_id then
    raise exception 'non autorisé : réservé à l''organisateur';
  end if;
  if t.status <> 'open' then
    raise exception 'le tournoi a déjà commencé';
  end if;
  if clean = '' then
    raise exception 'nom d''invité vide';
  end if;

  select count(*) into n from public.tournament_players where tournament_id = t_id;
  if n >= t.max_players then
    raise exception 'le tournoi est complet';
  end if;

  insert into public.players (id, handle, display_name, elo, is_guest, created_by)
  values (
    new_id,
    'invite_' || replace(new_id::text, '-', ''),
    clean,
    greatest(0, coalesce(guest_elo, 1200)),
    true,
    auth.uid()
  );

  insert into public.tournament_players (tournament_id, player_id)
  values (t_id, new_id);

  return new_id;
end;
$$;

grant execute on function public.create_tournament_guest(uuid, text, int) to authenticated;
