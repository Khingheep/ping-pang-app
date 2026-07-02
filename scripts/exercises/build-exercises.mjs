// Pipeline de conversion « banque d'exercices vidéo ».
//
// Source : 3 migrations Cloudflare-D1 (SQLite) du monorepo hackathon bdd_pingpang,
// copiées dans ./source/ :
//   028_drills_library.sql     -> ~56 drills FFTT (table daily_drills)
//   035_drills_video_bank.sql  -> +12 drills « pros » + 1res vidéos YouTube
//   036_drills_youtube_bank.sql-> +47 UPDATE video_url YouTube (oEmbed-vérifiées)
//
// On parse ces fichiers, on rejoue les UPDATE, puis on MAPPE chaque drill sur la
// taxonomie de l'app freelance (STROKES de src/lib/training/sessions.ts) + un
// niveau 4-paliers, et on émet un seed Postgres : supabase/migrations/0039_exercises_seed.sql
//
// Usage : node scripts/exercises/build-exercises.mjs
// (déterministe, pas de réseau — les URLs ont déjà été oEmbed-vérifiées : 50/50 OK)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'source');
const OUT = join(HERE, '..', '..', 'supabase', 'migrations', '0040_exercises_seed.sql');

// ───────────────────────── mini-parseur SQL (quote-aware) ─────────────────────────

/** Retire les commentaires ligne `-- …` (hors chaînes) — sinon les `(tier 3-5)`
 *  des commentaires entre tuples sont parsés comme de faux exercices. */
function stripComments(sql) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      out += c;
      if (c === "'") {
        if (sql[i + 1] === "'") {
          out += sql[++i];
        } else inStr = false;
      }
    } else if (c === "'") {
      inStr = true;
      out += c;
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      out += '\n';
    } else out += c;
  }
  return out;
}

/** Découpe le contenu d'un tuple en champs (split top-level), puis interprète
 *  chaque champ : 'chaîne' (avec '' échappés), nombre, ou NULL. */
function parseTuple(inner) {
  return splitTopLevelCommas(inner).map(interpretField);
}

/** Split par virgules de niveau 0 (hors chaîne, hors parenthèses). */
function splitTopLevelCommas(s) {
  const out = [];
  let buf = '';
  let inStr = false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      buf += c;
      if (c === "'") {
        if (s[i + 1] === "'") buf += s[++i];
        else inStr = false;
      }
    } else if (c === "'") {
      inStr = true;
      buf += c;
    } else if (c === '(') {
      depth++;
      buf += c;
    } else if (c === ')') {
      depth--;
      buf += c;
    } else if (c === ',' && depth === 0) {
      out.push(buf);
      buf = '';
    } else buf += c;
  }
  out.push(buf);
  return out;
}

function interpretField(raw) {
  const t = raw.trim();
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  if (t === '' || t.toUpperCase() === 'NULL') return null;
  if (/^-?\d+$/.test(t)) return Number(t);
  return t;
}

/** Découpe un blob `(...),(...),...` en tuples top-level (quote+paren aware). */
function splitTuples(blob) {
  const tuples = [];
  let depth = 0;
  let inStr = false;
  let start = -1;
  for (let i = 0; i < blob.length; i++) {
    const c = blob[i];
    if (inStr) {
      if (c === "'") {
        if (blob[i + 1] === "'") i++;
        else inStr = false;
      }
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === '(') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (c === ')') {
      depth--;
      if (depth === 0) tuples.push(blob.slice(start, i));
    }
  }
  return tuples;
}

/** Trouve la fin (`;` top-level) d'un INSERT à partir de l'index de VALUES. */
function readUntilSemicolon(sql, from) {
  let inStr = false;
  for (let i = from; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      if (c === "'") {
        if (sql[i + 1] === "'") i++;
        else inStr = false;
      }
    } else if (c === "'") inStr = true;
    else if (c === ';') return i;
  }
  return sql.length;
}

/** Parse tous les `INSERT ... INTO daily_drills (cols) VALUES (...)` d'un fichier. */
function parseInserts(sql) {
  const rows = [];
  const re = /INSERT\s+OR\s+IGNORE\s+INTO\s+daily_drills\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    // colonnes : du '(' courant jusqu'au ')' correspondant
    let i = m.index + m[0].length;
    let depth = 1;
    const colStart = i;
    for (; i < sql.length && depth > 0; i++) {
      if (sql[i] === '(') depth++;
      else if (sql[i] === ')') depth--;
    }
    const cols = sql
      .slice(colStart, i - 1)
      .split(',')
      .map((c) => c.trim());
    const vIdx = sql.indexOf('VALUES', i);
    const end = readUntilSemicolon(sql, vIdx + 6);
    const blob = sql.slice(vIdx + 6, end);
    for (const tup of splitTuples(blob)) {
      const vals = parseTuple(tup);
      const row = {};
      cols.forEach((c, k) => (row[c] = vals[k] ?? null));
      rows.push(row);
    }
    re.lastIndex = end;
  }
  return rows;
}

/** Parse tous les `UPDATE daily_drills SET ... WHERE id ...` (video_url/provider/source). */
function applyUpdates(sql, byId) {
  const re = /UPDATE\s+daily_drills\s+SET\s+([\s\S]*?)\s+WHERE\s+id\s*(IN\s*\(([\s\S]*?)\)|=\s*'([^']*)')\s*;/gi;
  let m;
  while ((m = re.exec(sql))) {
    const setPart = m[1];
    const ids = m[4]
      ? [m[4]]
      : m[3].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    const assigns = {};
    for (const pair of splitAssignments(setPart)) {
      const eq = pair.indexOf('=');
      const col = pair.slice(0, eq).trim();
      let val = pair.slice(eq + 1).trim();
      val = val.replace(/^'|'$/g, '');
      assigns[col] = val;
    }
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue;
      if (assigns.video_url !== undefined) row.video_url = assigns.video_url;
      if (assigns.video_provider !== undefined) row.video_provider = assigns.video_provider;
      if (assigns.video_source !== undefined) row.video_source = assigns.video_source;
    }
  }
}

function splitAssignments(s) {
  const out = [];
  let buf = '';
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      buf += c;
      if (c === "'") inStr = false;
    } else if (c === "'") {
      inStr = true;
      buf += c;
    } else if (c === ',') {
      out.push(buf);
      buf = '';
    } else buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

// ───────────────────────── mapping vers la taxo de l'app ─────────────────────────

// fftt_stage -> niveau 4-paliers + libellé « raquette » FFTT.
const STAGE = {
  prepaping: { level: 'Débutant', label: 'Balle Blanche' },
  baseping: { level: 'Débutant', label: 'Balle Orange' },
  jeuping: { level: 'Intermédiaire', label: 'Bronze' },
  techniping: { level: 'Avancé', label: 'Argent' },
  excelping: { level: 'Expert', label: 'Or' },
};

// drill_id -> coup de la taxo app (src/lib/training/sessions.ts STROKES).
// Mapping explicite = le plus fiable ; fallback par catégorie en dessous.
const STROKE_BY_ID = {
  // prépaping
  drill_jonglage_base: 'Toucher de balle',
  drill_jonglage_cd: 'Coup droit',
  drill_jonglage_revers: 'Revers',
  drill_jonglage_alterne: 'Toucher de balle',
  drill_jonglage_hauteurs: 'Toucher de balle',
  drill_parcours_balle: 'Toucher de balle',
  drill_mur_cd: 'Coup droit',
  drill_mur_revers: 'Revers',
  drill_mur_alterne: 'Technique de déplacement',
  drill_service_regl_cd: 'Service',
  drill_service_regl_revers: 'Service',
  drill_renvoi_cd_demi: 'Coup droit',
  drill_renvoi_revers_demi: 'Revers',
  drill_deplacement_lateral: 'Technique de déplacement',
  drill_echauffement_hors_table: 'Vitesse de déplacement',
  // baseping
  drill_cd_50_echanges: 'Coup droit',
  drill_revers_regularite: 'Revers',
  drill_placement_lateral_cd: 'Coup droit',
  drill_liaison_cd_revers_1_1: 'Technique de déplacement',
  drill_service_court_sans_effet: 'Service',
  drill_service_long_rapide: 'Service',
  drill_retour_service_place: 'Remise de service',
  drill_deplacement_pivot: 'Technique de déplacement',
  drill_cd_croise_ligne: 'Coup droit',
  drill_cd_deplacement_aleatoire: 'Technique de déplacement',
  drill_panier_contre_attaque_cd: 'Coup droit',
  drill_jeux_comptes: 'Lecture de jeu',
  drill_educatifs_pied: 'Vitesse de déplacement',
  // jeuping
  drill_topspin_cd_coupe: 'Coup droit',
  drill_topspin_revers_coupe: 'Revers',
  drill_poussette_cd: 'Poussette',
  drill_poussette_revers: 'Poussette',
  drill_bloc_revers: 'Bloc revers',
  drill_bloc_cd: 'Bloc coup droit',
  drill_service_attaque_3e_balle: 'Service',
  drill_play_opening_up: 'Lecture de jeu',
  drill_topspin_sur_bloc: 'Coup droit',
  drill_falkenberg: 'Technique de déplacement',
  drill_match_theme_cd: 'Coup droit',
  // techniping
  drill_play_flicking_out: 'Lecture de jeu',
  drill_play_short_topspin: 'Lecture de jeu',
  drill_play_touch_open_up: 'Lecture de jeu',
  drill_play_dig_counter: 'Lecture de jeu',
  drill_defense_coupee: 'Défense coup droit',
  drill_defense_haute_liftee: 'Défense revers',
  drill_poussette_courte_longue: 'Poussette',
  drill_flip_balle_courte: 'Flip coup droit',
  drill_jeu_de_contre: 'Top sur top',
  drill_gainage_posture: 'Vitesse de déplacement',
  drill_gestion_temps_repos: 'Lecture de jeu',
  // excelping
  drill_play_long_pendulum: 'Lecture de jeu',
  drill_play_down_the_line: 'Lecture de jeu',
  drill_play_topspin_counter: 'Lecture de jeu',
  drill_play_topspin_topspin: 'Lecture de jeu',
  drill_irregularite_4e_balle: 'Réactivité',
  drill_variation_rythme_rotation: 'Toucher de balle',
  drill_coup_terminal_systeme: 'Coup droit',
  drill_service_relance_signature: 'Service',
  // pros (035)
  ex_lebrun_felix_serve: 'Service',
  ex_lebrun_alexis_block: 'Bloc revers',
  ex_ma_long_topspin_cd: 'Coup droit',
  ex_fan_zhendong_revers: 'Revers',
  ex_wang_chuqin_pivot: 'Technique de déplacement',
  ex_truls_moregard_banane: 'Flip revers',
  ex_harimoto_explosif: 'Coup droit',
  ex_calderano_lefty_attack: 'Coup droit',
  ex_ovtcharov_allround: 'Technique de déplacement',
  ex_boll_classic_european: 'Coup droit',
  ex_gauzy_defense: 'Défense revers',
  ex_gatien_legend: 'Coup droit',
};

const STROKE_BY_CATEGORY = {
  juggling: 'Toucher de balle',
  service: 'Service',
  return: 'Remise de service',
  drive: 'Coup droit',
  topspin: 'Coup droit',
  push: 'Poussette',
  block: 'Bloc revers',
  counter: 'Top sur top',
  defense: 'Défense revers',
  footwork: 'Technique de déplacement',
  tactic: 'Lecture de jeu',
  match: 'Lecture de jeu',
  mental: 'Lecture de jeu',
  fitness: 'Vitesse de déplacement',
  skill: 'Toucher de balle',
};

// Réplique le back-fill `lieu` de la migration 035 (drills 028 sans lieu explicite).
function deriveLieu(row) {
  if (row.lieu) return row.lieu;
  if (row.requires_wall) return 'mur';
  if (row.requires_robot) return 'table_robot';
  if (row.requires_partner) return 'table_duo';
  if (['juggling', 'fitness', 'mental'].includes(row.category)) return 'maison';
  if (['footwork', 'skill'].includes(row.category) && !row.requires_partner && !row.requires_robot && !row.requires_wall)
    return 'maison';
  return 'table_solo';
}

function youtubeId(row) {
  if (row.video_provider !== 'youtube' || !row.video_url) return null;
  const m = /[?&]v=([A-Za-z0-9_-]+)/.exec(row.video_url);
  return m ? m[1] : null;
}

function sqlStr(v) {
  if (v === null || v === undefined) return 'NULL';
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sqlTags(tags) {
  if (!tags) return "'{}'";
  const arr = String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `"${t.replace(/"/g, '')}"`);
  return `'{${arr.join(',')}}'`;
}

// ───────────────────────── build ─────────────────────────

const sql028 = stripComments(readFileSync(join(SRC, '028_drills_library.sql'), 'utf8'));
const sql035 = stripComments(readFileSync(join(SRC, '035_drills_video_bank.sql'), 'utf8'));
const sql036 = stripComments(readFileSync(join(SRC, '036_drills_youtube_bank.sql'), 'utf8'));

const rows = [...parseInserts(sql028), ...parseInserts(sql035)];
const byId = new Map(rows.map((r) => [r.id, r]));
applyUpdates(sql035, byId);
applyUpdates(sql036, byId);

const exercises = rows.map((row, idx) => {
  const stage = STAGE[row.fftt_stage] ?? { level: 'Intermédiaire', label: row.fftt_stage ?? '' };
  const stroke = STROKE_BY_ID[row.id] ?? STROKE_BY_CATEGORY[row.category] ?? 'Toucher de balle';
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    stroke,
    fftt_stage: row.fftt_stage,
    stage_label: stage.label,
    level: stage.level,
    difficulty: row.difficulty ?? null,
    lieu: deriveLieu(row),
    duration_min: row.duration_min ?? 5,
    video_id: youtubeId(row),
    video_url: row.video_url ?? null,
    video_source: row.video_source ?? null,
    pro_id: row.pro_id ?? null,
    tags: row.tags ?? null,
    sort: idx,
  };
});

// stats console
const withVideo = exercises.filter((e) => e.video_id).length;
const byLevel = exercises.reduce((a, e) => ((a[e.level] = (a[e.level] ?? 0) + 1), a), {});
console.log(`Exercices: ${exercises.length} | avec vidéo YouTube embeddable: ${withVideo}`);
console.log('Par niveau:', byLevel);
const unmapped = exercises.filter((e) => !STROKE_BY_ID[e.id]);
if (unmapped.length) console.log('⚠ stroke via fallback catégorie:', unmapped.map((e) => e.id).join(', '));

// émission du seed Postgres
const cols =
  '(id, name, description, category, stroke, fftt_stage, stage_label, level, difficulty, lieu, duration_min, video_id, video_url, video_source, pro_id, tags, sort)';
const values = exercises
  .map(
    (e) =>
      `  (${sqlStr(e.id)}, ${sqlStr(e.name)}, ${sqlStr(e.description)}, ${sqlStr(e.category)}, ${sqlStr(e.stroke)}, ` +
      `${sqlStr(e.fftt_stage)}, ${sqlStr(e.stage_label)}, ${sqlStr(e.level)}, ${sqlStr(e.difficulty)}, ${sqlStr(e.lieu)}, ` +
      `${e.duration_min}, ${sqlStr(e.video_id)}, ${sqlStr(e.video_url)}, ${sqlStr(e.video_source)}, ${sqlStr(e.pro_id)}, ` +
      `${sqlTags(e.tags)}, ${e.sort})`,
  )
  .join(',\n');

const header = `-- Ping Pang Paris — Seed banque d'exercices vidéo (GÉNÉRÉ, ne pas éditer à la main).
-- Source : monorepo hackathon bdd_pingpang (migrations D1 028/035/036), converti par
-- scripts/exercises/build-exercises.mjs vers la taxo STROKES de l'app + niveau 4-paliers.
-- ${exercises.length} exercices, ${withVideo} avec vidéo YouTube oEmbed-vérifiée.
-- Régénérer : node scripts/exercises/build-exercises.mjs

insert into public.exercises
  ${cols}
values
${values}
on conflict (id) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  stroke = excluded.stroke, fftt_stage = excluded.fftt_stage, stage_label = excluded.stage_label,
  level = excluded.level, difficulty = excluded.difficulty, lieu = excluded.lieu,
  duration_min = excluded.duration_min, video_id = excluded.video_id, video_url = excluded.video_url,
  video_source = excluded.video_source, pro_id = excluded.pro_id, tags = excluded.tags, sort = excluded.sort;
`;

writeFileSync(OUT, header);
console.log(`✓ écrit ${OUT}`);
