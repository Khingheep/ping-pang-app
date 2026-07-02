-- Ping Pang Paris — Banque d'exercices vidéo (onglet Train).
--
-- Catalogue public en lecture seule (comme venues/events) : contenu pédagogique
-- partagé par tous, écriture réservée au service_role (seed / back-office).
-- Données issues de la méthode FFTT + vidéos YouTube (PingSkills, Tom Lodziak…),
-- chaque exercice rattaché à un `stroke` de la taxo training (cf. STROKES dans
-- src/lib/training/sessions.ts) pour pouvoir recommander selon les coups travaillés.

create table if not exists public.exercises (
  id            text primary key,                    -- ex "drill_service_regl_cd"
  name          text not null,
  description   text,
  category      text not null,                       -- taxo source : service|drive|topspin|push|block…
  stroke        text not null,                       -- coup de la taxo app (STROKES)
  fftt_stage    text,                                -- prepaping|baseping|jeuping|techniping|excelping
  stage_label   text,                                -- libellé FFTT : Balle Blanche / Orange / Bronze / Argent / Or
  level         text not null,                       -- Débutant | Intermédiaire | Avancé | Expert
  difficulty    text,                                -- easy|medium|hard (drills pros)
  lieu          text,                                -- maison|mur|table_solo|table_duo|table_robot
  duration_min  int not null default 5,
  video_id      text,                                -- id YouTube embeddable (NULL = pas de vidéo)
  video_url     text,                                -- URL source (YouTube watch ou article externe)
  video_source  text,                                -- chaîne / auteur (PingSkills, Tom Lodziak…)
  pro_id        text,                                -- coup signature d'un pro (NULL sinon)
  tags          text[] not null default '{}',
  sort          int not null default 0,              -- ordre d'affichage (prépaping d'abord)
  created_at    timestamptz not null default now()
);

alter table public.exercises enable row level security;

drop policy if exists "exercises read all" on public.exercises;
create policy "exercises read all" on public.exercises for select using (true);

create index if not exists idx_exercises_stroke on public.exercises (stroke, sort);
create index if not exists idx_exercises_level  on public.exercises (level, sort);
