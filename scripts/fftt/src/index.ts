/** API publique du scraper FFTT. */

export { FfttClient } from './client.ts';
export { createSession, isValidated, type Session } from './session.ts';
export { closeOcr } from './captcha.ts';
export { parsePlayerList } from './parse.ts';
export { getPlayerDetail, type FfttPlayerDetail, type FfttMatch } from './player.ts';
export type {
  FfttPlayer,
  FfttClub,
  SearchParams,
  Sexe,
  ClassementType,
} from './types.ts';
