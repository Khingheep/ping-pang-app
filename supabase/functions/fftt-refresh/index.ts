/**
 * Edge Function `fftt-refresh` — rafraîchit la session FFTT côté cloud.
 *
 * Réplique la logique du script Node `scripts/fftt` (fetch + OCR tesseract.js)
 * mais en Deno, pour être appelée par un cron Supabase (pg_cron) → 100% serverless.
 *
 * Réutilise la session si encore valide (cheap), sinon résout le CAPTCHA 4 chiffres
 * et upsert le PHPSESSID validé dans `fftt_session`.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createWorker } from 'npm:tesseract.js@5';

const BASE = 'https://www2.fftt.com';
const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const CAPTCHA_BASE = `${BASE}/site/webroot/views/public/captcha`;
const CLASSEMENT_URL = `${BASE}/site/competition/classement/classement-national`;
const AJAX_URL = `${BASE}/site/ajax1?plugins_controller=personsRemoteClassement&plugins_action=plugin_index_ajax`;

function baseHeaders(phpsessid?: string): Record<string, string> {
  const h: Record<string, string> = { 'user-agent': UA };
  if (phpsessid) h.cookie = `PHPSESSID=${phpsessid}`;
  return h;
}

async function freshPhpsessid(): Promise<string> {
  const res = await fetch(CLASSEMENT_URL, { headers: baseHeaders(), redirect: 'manual' });
  const arr = res.headers.getSetCookie?.() ?? [];
  for (const c of arr) {
    const m = c.match(/PHPSESSID=([^;]+)/);
    if (m) return m[1];
  }
  const single = res.headers.get('set-cookie') ?? '';
  const m = single.match(/PHPSESSID=([^;]+)/);
  if (m) return m[1];
  throw new Error('aucun PHPSESSID renvoyé');
}

async function isValidated(phpsessid: string): Promise<boolean> {
  const body = new URLSearchParams({
    'pagination-current': '1',
    'pagination-total': '0',
    classement_type: 'off',
    persons_sexe: 'Hommes',
    nom: 'AAAAAA',
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workerP: Promise<any> | null = null;
function getWorker() {
  if (!workerP) {
    workerP = (async () => {
      const w = await createWorker('eng');
      await w.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '7' });
      return w;
    })();
  }
  return workerP;
}
async function solveCaptcha(png: Uint8Array): Promise<string> {
  const w = await getWorker();
  const { data } = await w.recognize(png);
  return (data.text || '').replace(/\D/g, '');
}

async function solveSession(phpsessid: string, maxTries: number): Promise<boolean> {
  for (let i = 0; i < maxTries; i++) {
    const img = await fetch(`${CAPTCHA_BASE}/captcha_image.php?${i}`, { headers: baseHeaders(phpsessid) });
    const buf = new Uint8Array(await img.arrayBuffer());
    const code = await solveCaptcha(buf);
    if (code.length !== 4) continue;
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
    if (await isValidated(phpsessid)) return true;
  }
  return false;
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  try {
    const { data: cur } = await supabase.from('fftt_session').select('phpsessid').eq('id', 1).maybeSingle();
    if (cur?.phpsessid && (await isValidated(cur.phpsessid))) {
      return Response.json({ ok: true, reused: true });
    }
    const phpsessid = await freshPhpsessid();
    const ok = await solveSession(phpsessid, 12);
    if (!ok) return Response.json({ ok: false, error: 'captcha_failed' }, { status: 502 });
    await supabase
      .from('fftt_session')
      .upsert({ id: 1, phpsessid, validated_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return Response.json({ ok: true, refreshed: true });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
});
