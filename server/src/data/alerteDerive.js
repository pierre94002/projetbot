/**
 * alerteDerive.js — l'ALERTE DE DÉRIVE telle qu'elle est rangée (étape 25 du plan, seconde moitié, 14/10/2026).
 * -----------------------------------------------------------------------
 * La règle et son calcul vivent dans data/deriveMoteur.js ; l'alerte durable,
 * dans le système d'alertes de l'actualisation (refresh-status.json, clé
 * « deriveMoteur »), posée ou levée par l'étape « calibrationMensuelle ».
 * Ce fichier LÉGER (ni base, ni calcul) la relit pour la feuille de route,
 * qui n'ouvre jamais la base : une lecture sans effet — un fichier illisible
 * rend null, il n'est jamais déplacé ni réécrit d'ici (readRefreshStatus, lui,
 * met de côté un fichier illisible : on ne s'en sert pas ici).
 * -----------------------------------------------------------------------
 */

import { readJsonFile } from '../utils/atomicJson.js';
import { REFRESH_STATUS_FILE } from './repositories/refreshStatusRepository.js';

/** La clé de l'alerte dans refresh-status.json (alerts.deriveMoteur). */
export const CLE_ALERTE_DERIVE = 'deriveMoteur';

/** L'alerte durable (alerts.deriveMoteur), ou null. `fichier` : un fichier d'essai. */
export function lireAlerteDerive({ fichier = REFRESH_STATUS_FILE } = {}) {
  try {
    const etat = readJsonFile(fichier, null);
    const a = etat?.alerts?.[CLE_ALERTE_DERIVE] ?? null;
    return a && typeof a === 'object' && !Array.isArray(a) ? a : null;
  } catch {
    return null;
  }
}
