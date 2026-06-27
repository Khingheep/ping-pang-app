-- Ping Pang Paris — le feed se remplit TOUT SEUL : résultats de tournoi + créneaux ouverts.
-- (Avant : le feed dépendait du logging manuel de séances → cold start / feed vide.)

-- ───────────────────────── Résultat de tournoi → feed ─────────────────────────
-- Quand le match de FINALE (seul match de son tour) reçoit un vainqueur, on poste le champion.
-- Bonus : on force status='done' ici (SECURITY DEFINER) → fiable même si c'est un NON-organisateur
-- qui saisit le dernier score (la RLS de `tournaments` est owner-only côté client).
create or replace function public._on_bracket_match_decided() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_final_count int; v_champ text; v_name text;
begin
  if new.phase <> 'bracket' or new.winner is null or old.winner is not null then
    return new;
  end if;
  -- Finale = un seul match dans ce tour.
  select count(*) into v_final_count from tournament_matches
    where tournament_id = new.tournament_id and phase = 'bracket' and round = new.round;
  if v_final_count <> 1 then return new; end if;

  select display_name into v_champ from players where id = new.winner;
  select name into v_name from tournaments where id = new.tournament_id;
  update tournaments set status = 'done' where id = new.tournament_id and status <> 'done';

  insert into feed_events (type, actor_id, actor_name, title, body)
    values ('tournament', new.winner, v_champ,
            coalesce(v_champ, 'Un joueur') || ' remporte ' || coalesce(v_name, 'le tournoi') || ' 🏆',
            'Tournoi terminé');
  return new;
end; $$;

drop trigger if exists trg_bracket_decided on public.tournament_matches;
create trigger trg_bracket_decided after update on public.tournament_matches
  for each row execute function _on_bracket_match_decided();

-- ───────────────────────── Créneau ouvert → feed ─────────────────────────
-- On enrichit le trigger existant (notifications) pour POSTER AUSSI un événement de feed.
create or replace function public.on_slot_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text; v_venue text; v_when text;
begin
  insert into slot_participants (slot_id, player_id) values (new.id, new.host_id) on conflict do nothing;
  select display_name into v_name  from players where id = new.host_id;
  select name         into v_venue from venues  where id = new.venue_id;
  v_when := to_char(new.starts_at at time zone 'Europe/Paris', 'DD/MM à HH24hMI');

  -- Notif ciblée aux joueurs de la tranche de niveau (inchangé).
  insert into notifications (player_id, type, title, body)
    select p.id, 'slot', 'Nouveau créneau',
           coalesce(v_name, 'Un joueur') || ' propose un créneau à ' || coalesce(v_venue, 'un lieu') || ' (' || v_when || ').'
    from players p
    where p.id <> new.host_id
      and (new.level_min is null or p.elo >= new.level_min)
      and (new.level_max is null or p.elo <= new.level_max);

  -- Feed public : invitation ouverte à rejoindre.
  insert into feed_events (type, actor_id, actor_name, target_name, title, body)
    values ('slot', new.host_id, v_name, v_venue,
            coalesce(v_name, 'Un joueur') || ' propose un créneau à ' || coalesce(v_venue, 'un lieu') || ' 📅',
            v_when || ' · rejoins la partie !');
  return new;
end; $$;
-- (le trigger trg_on_slot_created existe déjà et pointe sur cette fonction)
