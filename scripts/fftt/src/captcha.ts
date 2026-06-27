/**
 * Résolution du CAPTCHA FFTT.
 *
 * Le CAPTCHA de www2.fftt.com est une simple image PNG de 4 chiffres nets
 * (générée par GD côté serveur). On la lit avec tesseract.js en restreignant
 * la reconnaissance aux chiffres — taux de réussite très élevé, et de toute
 * façon on retente (image regénérée) tant que la validation échoue.
 */

import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        // PSM 7 = traiter l'image comme une seule ligne de texte.
        tessedit_pageseg_mode: '7' as never,
      });
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Lit les chiffres d'une image CAPTCHA. Retourne la chaîne de chiffres
 * détectée (idéalement 4 caractères). L'appelant vérifie la longueur.
 */
export async function solveCaptcha(png: Buffer): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(png);
  return (data.text || '').replace(/\D/g, '');
}

/** Libère le worker tesseract (sinon le process Node ne se termine pas). */
export async function closeOcr(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
