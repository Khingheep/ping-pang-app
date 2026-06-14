-- Ping Pang Paris — Feed social global (activité du club)
-- Table dénormalisée world-readable, alimentée par des fonctions/triggers SECURITY DEFINER.
-- On n'expose JAMAIS la table matches en lecture publique : seuls les feed_events le sont.

create table if not exists public.feed_events (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,                 -- match | newcomer
  actor_id    uuid references public.players (id) on delete cascade,
  actor_name  text,                          -- snapshot (le feed reste lisible même si le profil change)
  target_name text,                          -- adversaire (matchs)
  title       text not null,
  body        text,
  elo_delta   int,
  created_at  timestamptz not null default now()
);
alter table public.feed_events enable row level security;
drop policy if exists "feed read all" on public.feed_events;
create policy "feed read all" on public.feed_events for select using (true);
create index if not exists idx_feed_created on public.feed_events (created_at desc);

-- Règle un match + publie l'événement de feed (remplace la version de 0010 en ajoutant le feed).
create or replace function public._settle_match(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m       matches%rowtype;
  v_a_elo int; v_b_elo int; v_exp_a numeric; v_delta_a int; v_k int := 32;
  v_win_name text; v_lose_name text; v_loser uuid; v_win_score text; v_win_delta int;
begin
  select * into m from matches where id = p_match;
  if m.id is null or m.status <> 'pending' then return; end if;
  if not (m.confirmed_by_a and m.confirmed_by_b) then return; end if;

  if m.is_ranked then
    select elo into v_a_elo from players where id = m.player_a;
    select elo into v_b_elo from players where id = m.player_b;
    v_exp_a   := 1.0 / (1.0 + power(10, (v_b_elo - v_a_elo) / 400.0));
    v_delta_a := round(v_k * ((case when m.winner = m.player_a then 1 else 0 end) - v_exp_a));
    update players set elo = greatest(0, elo + v_delta_a) where id = m.player_a;
    update players set elo = greatest(0, elo - v_delta_a) where id = m.player_b;
    update matches set elo_delta_a = v_delta_a, elo_delta_b = -v_delta_a, status = 'confirmed' where id = p_match;
  else
    v_delta_a := 0;
    update matches set elo_delta_a = 0, elo_delta_b = 0, status = 'confirmed' where id = p_match;
  end if;

  -- Feed : "<gagnant> a battu <perdant> <score> (+delta)"
  v_loser := case when m.winner = m.player_a then m.player_b else m.player_a end;
  select display_name into v_win_name  from players where id = m.winner;
  select display_name into v_lose_name from players where id = v_loser;
  if m.winner = m.player_a then
    v_win_score := m.score;                                  -- score stocké côté player_a
    v_win_delta := v_delta_a;
  else
    v_win_score := split_part(m.score, '-', 2) || '-' || split_part(m.score, '-', 1);
    v_win_delta := -v_delta_a;
  end if;

  insert into feed_events (type, actor_id, actor_name, target_name, title, body, elo_delta)
  values ('match', m.winner, v_win_name, v_lose_name,
          coalesce(v_win_name, 'Un joueur') || ' a battu ' || coalesce(v_lose_name, 'un joueur'),
          v_win_score || ' · ' || case when m.is_ranked then 'Classé' else 'Amical' end,
          case when m.is_ranked then v_win_delta else null end);
end; $$;

-- Feed : nouveau membre.
create or replace function public.feed_newcomer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into feed_events (type, actor_id, actor_name, title, body)
    values ('newcomer', new.id, new.display_name,
            coalesce(new.display_name, 'Un joueur') || ' a rejoint Ping Pang Paris', 'Souhaite-lui la bienvenue 🏓');
  return new;
end; $$;
drop trigger if exists trg_feed_newcomer on public.players;
create trigger trg_feed_newcomer after insert on public.players
  for each row execute function feed_newcomer();
