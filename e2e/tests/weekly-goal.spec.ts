import { test, expect, type Page } from '@playwright/test';

/**
 * TC-04 — Objectif hebdo configurable (la feature du jour).
 * Le hero de l'ecran Entrainement est tappable -> feuille avec un slider -> on change
 * l'objectif -> il se met a jour dans le hero -> et il PERSISTE apres rechargement.
 * Le test est idempotent : la cible est choisie differente de la valeur initiale.
 */

// Deplace le thumb du slider a une fraction [0..1] de sa largeur. Un vrai drag
// (down -> move par paliers -> up) exerce le PanResponder react-native-web (le snap se
// fait sur pageX), la ou un simple clic ne suffit pas.
async function setSlider(page: Page, frac: number) {
  // La feuille peut rendre sous la ligne de flottaison : on l'amene dans le viewport,
  // sinon les coordonnees souris tombent hors ecran et le geste n'atteint pas la track.
  await page.getByTestId('goal-slider').scrollIntoViewIfNeeded();
  const box = await page.getByTestId('goal-slider').boundingBox();
  if (!box) throw new Error('slider introuvable');
  const y = box.y + box.height / 2;
  const targetX = box.x + Math.max(3, Math.min(box.width - 3, box.width * frac));
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(targetX, y, { steps: 20 });
  await page.mouse.up();
}

test('TC-04 objectif hebdo : editer + persister', async ({ page }) => {
  await page.goto('/train');

  const hero = page.getByTestId('train-hero');
  const heroGoal = page.getByTestId('hero-goal');
  await expect(hero).toBeVisible({ timeout: 30_000 });

  // Ouvre l'editeur.
  await hero.click();
  await expect(page.getByText('Objectif hebdomadaire')).toBeVisible();
  const value = page.getByTestId('goal-value');
  const initial = (await value.innerText()).trim();

  // Cible differente de l'initiale : max (10h) sinon min (30 min).
  const target = initial === '10h' ? { frac: 0, text: '30 min' } : { frac: 1, text: '10h' };
  await setSlider(page, target.frac);
  await expect(value).toHaveText(target.text);

  // Enregistre -> le hero reflete la nouvelle valeur, la feuille se ferme.
  await page.getByTestId('goal-save').click();
  await expect(heroGoal).toContainText(target.text, { timeout: 20_000 });
  await expect(page.getByText('Objectif hebdomadaire')).toBeHidden();

  // Persistance : rechargement complet de la page.
  await page.goto('/train');
  await expect(heroGoal).toContainText(target.text, { timeout: 30_000 });
});
