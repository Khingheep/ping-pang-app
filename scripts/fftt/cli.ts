/**
 * CLI de test du scraper FFTT.
 *
 *   npm run fftt -- search LEBRUN
 *   npm run fftt -- search --nom LEBRUN --prenom Felix
 *   npm run fftt -- search --licence 3421810
 *   npm run fftt -- search --nom POULAIN --sexe Hommes --json
 *   npm run fftt -- player 3421810            (fiche détaillée + matchs)
 *   npm run fftt -- player 3421810 --json
 *   npm run fftt -- refresh-session           (résout le CAPTCHA → upload vers Supabase)
 *
 * Options :
 *   --nom, --prenom, --licence, --club, --nclub
 *   --sexe Hommes|Femmes   (sinon les deux)
 *   --type off|cl          (classement officiel par défaut)
 *   --limit N
 *   --json                 (sortie JSON brute)
 *   --fresh                (ignore la session en cache, re-résout le CAPTCHA)
 */

import 'dotenv/config';
import { FfttClient } from './src/client.ts';
import { closeOcr } from './src/captcha.ts';
import { uploadSession } from './src/refresh.ts';
import type { SearchParams, Sexe } from './src/types.ts';

interface Cli {
  command: string;
  /** Argument positionnel : nom (search) ou numberId (player). */
  target?: string;
  params: SearchParams;
  json: boolean;
  fresh: boolean;
}

function parseArgs(argv: string[]): Cli {
  const command = argv[0] ?? 'search';
  const params: SearchParams = {};
  let target: string | undefined;
  let json = false;
  let fresh = false;

  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--fresh') fresh = true;
    else if (a === '--nom') params.nom = argv[++i];
    else if (a === '--prenom') params.prenom = argv[++i];
    else if (a === '--licence') params.licence = argv[++i];
    else if (a === '--club') params.club = argv[++i];
    else if (a === '--nclub') params.nclub = argv[++i];
    else if (a === '--sexe') params.sexe = argv[++i] as Sexe;
    else if (a === '--type') params.classementType = argv[++i] as 'off' | 'cl';
    else if (a === '--limit') params.limit = Number(argv[++i]);
    else if (!a.startsWith('--') && !target) target = a; // nom (search) ou numberId (player)
  }
  if (command === 'search' && target && !params.nom) params.nom = target;
  return { command, target, params, json, fresh };
}

function pad(s: string, n: number): string {
  return (s + ' '.repeat(n)).slice(0, n);
}

async function main() {
  const { command, target, params, json, fresh } = parseArgs(process.argv.slice(2));

  if (command !== 'search' && command !== 'player' && command !== 'refresh-session') {
    console.error(`Commande inconnue: ${command}. Utilise "search", "player" ou "refresh-session".`);
    process.exit(1);
  }

  const t0 = Date.now();
  const client = await FfttClient.create({
    forceNew: fresh,
    log: (m) => console.error(`[session] ${m}`),
  });

  if (command === 'refresh-session') {
    await uploadSession(client.phpsessid);
    console.error(`[refresh] session uploadée vers Supabase (fftt_session) en ${Date.now() - t0} ms.`);
    await closeOcr();
    return;
  }

  if (command === 'player') {
    if (!target) {
      console.error('Usage: player <numberId>');
      process.exit(1);
    }
    const detail = await client.getDetail(target);
    const ms = Date.now() - t0;
    if (json) {
      console.log(JSON.stringify(detail, null, 2));
    } else {
      console.error(`\nFiche ${target} — ${ms} ms\n`);
      console.log(
        `Clt mensuel: ${detail.classementMensuel ?? '-'}   ` +
          `Pts officiels: ${detail.pointsOfficiels ?? '-'}   ` +
          `Parties: ${detail.partiesDisputees ?? '-'}   ` +
          `%V: ${detail.pctVictoires ?? '-'}\n`,
      );
      console.log(`${detail.matchs.length} match(s) :`);
      console.log(
        `${pad('DATE', 9)} ${pad('R', 2)} ${pad('ADVERSAIRE', 22)} ${pad('CLT', 5)} ` +
          `${pad('J', 4)} ${pad('COEFF', 6)} GAIN`,
      );
      for (const m of detail.matchs) {
        console.log(
          `${pad(m.date, 9)} ${pad(m.victoire ? 'V' : m.victoire === false ? 'D' : '?', 2)} ` +
            `${pad(m.adversaire.nom, 22)} ${pad(m.adversaire.classement ?? '-', 5)} ` +
            `${pad(String(m.journee ?? '-'), 4)} ${pad(String(m.coefficient ?? '-'), 6)} ` +
            `${m.gainPerte ?? '-'}`,
        );
      }
    }
    await closeOcr();
    return;
  }

  const players = await client.search(params);
  const ms = Date.now() - t0;

  if (json) {
    console.log(JSON.stringify(players, null, 2));
  } else {
    console.error(`\n${players.length} joueur(s) — ${ms} ms\n`);
    console.log(
      `${pad('LICENCE', 9)} ${pad('NOM', 18)} ${pad('PRÉNOM', 14)} ` +
        `${pad('CLT', 4)} ${pad('PTS', 7)} ${pad('RANG', 6)} ${pad('CAT', 4)} CLUB`,
    );
    for (const p of players) {
      console.log(
        `${pad(p.numberId, 9)} ${pad(p.nom, 18)} ${pad(p.prenom, 14)} ` +
          `${pad(String(p.classementOfficiel ?? '-'), 4)} ` +
          `${pad(String(p.pointsOfficiels ?? '-'), 7)} ` +
          `${pad(String(p.rangNational ?? '-'), 6)} ` +
          `${pad(p.categorie ?? '-', 4)} ${p.club?.nom ?? ''}`,
      );
    }
  }

  await closeOcr();
}

main().catch(async (err) => {
  console.error('Erreur:', err instanceof Error ? err.message : err);
  await closeOcr();
  process.exit(1);
});
