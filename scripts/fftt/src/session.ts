/**
 * Gestion de la session FFTT.
 *
 * www2.fftt.com protège ses pages par un CAPTCHA : toute première requête est
 * redirigée vers une page de validation, et un cookie `PHPSESSID` est posé.
 * Une fois le CAPTCHA résolu UNE fois, ce même PHPSESSID devient « validé » et
 * débloque l'endpoint AJAX de recherche jusqu'à expiration de la session.
 *
 * Stratégie : obtenir un PHPSESSID, résoudre le CAPTCHA 4 chiffres (OCR + retry),
 * puis réutiliser la session pour toutes les recherches. On persiste le
 * PHPSESSID validé sur disque pour éviter de re-résoudre à chaque exécution.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solveCaptcha } from './captcha.ts';

export const BASE = 'https://www2.fftt.com';

/** User-agent iPhone : reproduit le contexte de capture (app mobile FFTT). */
export const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const CAPTCHA_BASE = `${BASE}/site/webroot/views/public/captcha`;
const CLASSEMENT_URL = `${BASE}/site/competition/classement/classement-national`;
const AJAX_URL = `${BASE}/site/ajax1?plugins_controller=personsRemoteClassement&plugins_action=plugin_index_ajax`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, '..', '.fftt-session.json');

export interface Session {
  phpsessid: string;
}

export function cookie(phpsessid: string): string {
  return `PHPSESSID=${phpsessid}`;
}

/** En-têtes communs envoyés sur chaque requête FFTT. */
export function baseHeaders(phpsessid?: string): Record<string, string> {
  const h: Record<string, string> = { 'user-agent': UA };
  if (phpsessid) h.cookie = cookie(phpsessid);
  return h;
}

/** Démarre une session neuve et récupère le PHPSESSID posé par le serveur. */
async function freshPhpsessid(): Promise<string> {
  const res = await fetch(CLASSEMENT_URL, {
    headers: baseHeaders(),
    redirect: 'manual',
  });
  const setCookies = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const m = c.match(/PHPSESSID=([^;]+)/);
    if (m) return m[1];
  }
  throw new Error('FFTT: aucun PHPSESSID renvoyé par le serveur.');
}

/**
 * Teste si une session est déjà validée : on lance une recherche minimale et
 * on vérifie que la réponse n'est PAS la page « Validation CAPTCHA ».
 */
export async function isValidated(phpsessid: string): Promise<boolean> {
  const body = new URLSearchParams({
    'pagination-current': '1',
    'pagination-total': '0',
    classement_type: 'off',
    persons_sexe: 'Hommes',
    nom: 'AAAAAA', // nom improbable : 0 résultat suffit à prouver l'accès
    'pagination-items': '1',
    pagination_key: '2101138195',
  }).toString();

  const res = await fetch(AJAX_URL, {
    method: 'POST',
    headers: {
      ...baseHeaders(phpsessid),
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      origin: BASE,
      referer: CLASSEMENT_URL,
    },
    body,
  });
  const text = await res.text();
  return res.status === 200 && !text.includes('Validation CAPTCHA');
}

/**
 * Résout le CAPTCHA pour un PHPSESSID donné, jusqu'à `maxTries` tentatives.
 * Chaque tentative regénère une image (donc un nouveau code côté serveur).
 */
async function solveSessionCaptcha(
  phpsessid: string,
  maxTries: number,
  log: (m: string) => void,
): Promise<boolean> {
  for (let i = 0; i < maxTries; i++) {
    const imgRes = await fetch(`${CAPTCHA_BASE}/captcha_image.php?${i}`, {
      headers: baseHeaders(phpsessid),
    });
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const code = await solveCaptcha(buf);
    if (code.length !== 4) {
      log(`  tentative ${i + 1}: OCR="${code}" (rejetée, ≠ 4 chiffres)`);
      continue;
    }
    await fetch(`${CAPTCHA_BASE}/captcha_validate.php`, {
      method: 'POST',
      headers: {
        ...baseHeaders(phpsessid),
        'content-type': 'application/x-www-form-urlencoded',
        referer: `${CAPTCHA_BASE}/captcha.php`,
      },
      body: `captcha=${code}`,
      redirect: 'manual',
    });
    // On ne se fie pas au code de redirection : on vérifie l'accès réel.
    if (await isValidated(phpsessid)) {
      log(`  tentative ${i + 1}: code "${code}" ✓ session validée`);
      return true;
    }
    log(`  tentative ${i + 1}: code "${code}" rejeté par le serveur`);
  }
  return false;
}

async function loadCached(): Promise<string | null> {
  try {
    const raw = await readFile(SESSION_FILE, 'utf8');
    return (JSON.parse(raw) as Session).phpsessid ?? null;
  } catch {
    return null;
  }
}

async function saveCached(phpsessid: string): Promise<void> {
  await writeFile(SESSION_FILE, JSON.stringify({ phpsessid }, null, 2));
}

export interface CreateSessionOptions {
  /** PHPSESSID à réutiliser (sinon on lit le cache disque, sinon on en crée un). */
  phpsessid?: string;
  /** Nombre max de tentatives OCR du CAPTCHA (défaut 10). */
  maxTries?: number;
  /** Ignorer la session en cache et forcer une nouvelle validation. */
  forceNew?: boolean;
  log?: (m: string) => void;
}

/**
 * Retourne une session FFTT prête à l'emploi (PHPSESSID validé).
 * Réutilise une session existante si elle est encore valide, sinon résout
 * le CAPTCHA et persiste la nouvelle session.
 */
export async function createSession(opts: CreateSessionOptions = {}): Promise<Session> {
  const log = opts.log ?? (() => {});
  const maxTries = opts.maxTries ?? 10;

  // 1) Tenter de réutiliser une session (fournie ou en cache).
  if (!opts.forceNew) {
    const candidate = opts.phpsessid ?? (await loadCached());
    if (candidate && (await isValidated(candidate))) {
      log(`Session réutilisée (PHPSESSID validé en cache).`);
      return { phpsessid: candidate };
    }
  }

  // 2) Nouvelle session + résolution du CAPTCHA.
  const phpsessid = opts.phpsessid ?? (await freshPhpsessid());
  log(`Nouveau PHPSESSID=${phpsessid} — résolution du CAPTCHA…`);
  const ok = await solveSessionCaptcha(phpsessid, maxTries, log);
  if (!ok) {
    throw new Error(`FFTT: échec de validation du CAPTCHA après ${maxTries} tentatives.`);
  }
  await saveCached(phpsessid);
  return { phpsessid };
}
