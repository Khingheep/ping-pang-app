/**
 * Types du scraper FFTT.
 *
 * Un `FfttPlayer` correspond à une ligne de la recherche classement
 * (`personsRemoteClassement`) sur www2.fftt.com. C'est la donnée minimale
 * nécessaire à la mission 01 (import du classement officiel).
 */

export interface FfttClub {
  /** number_id FFTT de la structure (clé interne FFTT du club). */
  numberId: string | null;
  /** Nom du club, ex. "ST PHILBERT T.T." */
  nom: string;
}

export interface FfttPlayer {
  /** number_id FFTT du joueur — la clé stable pour identifier un licencié. */
  numberId: string;
  nom: string;
  prenom: string;
  /** Rang national (entier), null si non classé / absent. */
  rangNational: number | null;
  /**
   * Points mensuels / glissants (décimal, ex. 1717.8). null pour les numérotés
   * nationaux dont la cellule affiche un libellé non numérique.
   */
  pointsMensuels: number | null;
  /**
   * Classement officiel sur l'échelle FFTT, conservé en chaîne : entier "5"–"20"
   * pour la plupart, ou "N1"/"N2"… pour les numérotés nationaux.
   */
  classementOfficiel: string | null;
  /** Points officiels (entier, ex. 1699) — valeur de force canonique. */
  pointsOfficiels: number | null;
  /** Catégorie d'âge FFTT (ex. "S", "V40", "J18"), null si absente. */
  categorie: string | null;
  /** Nationalité affichée dans la colonne "natio." (souvent vide pour FRA). */
  nationalite: string | null;
  /** Sexe déduit du filtre de recherche utilisé. */
  sexe: 'H' | 'F';
  club: FfttClub | null;
}

export type Sexe = 'Hommes' | 'Femmes';

/** Type de classement utilisé pour le tri/filtre de la recherche FFTT. */
export type ClassementType = 'off' | 'cl';

export interface SearchParams {
  /** Nom de famille (filtre principal). */
  nom?: string;
  prenom?: string;
  /** Numéro de licence (filtre exact). */
  licence?: string;
  /** Nom du club. */
  club?: string;
  /** Numéro du club. */
  nclub?: string;
  /**
   * Sexe à interroger. `persons_sexe` est REQUIS côté FFTT (vide = 0 résultat).
   * Si omis, le scraper interroge Hommes puis Femmes et fusionne les résultats.
   */
  sexe?: Sexe;
  /**
   * 'cl' = tous les licenciés (défaut, recommandé pour un lookup générique).
   * 'off' = uniquement les numérotés nationaux (~top 1700).
   */
  classementType?: ClassementType;
  /** Catégorie d'âge ('all' par défaut). */
  categorie?: string;
  /** Nombre max de lignes par page (défaut 100). */
  limit?: number;
}
