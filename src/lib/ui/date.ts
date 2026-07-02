/** Helpers de date pour l'UI (feed, scoreboard…). */

/**
 * Date relative courte pour un horodatage de feed :
 * « Aujourd'hui » / « Hier » / « Il y a 3j » puis « 12 juin » au-delà d'une semaine.
 * Renvoie '' si la date est absente.
 */
export function relativeDate(iso?: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Aujourd'hui";
  if (days === 1) return 'Hier';
  if (days < 7) return `Il y a ${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
