/**
 * dataHealthRepository.js — l'état préparé du carnet de santé des données.
 * -----------------------------------------------------------------------
 * Étape 12 du plan (06/10/2026). Le contrôle (scripts/data-health.mjs) écrit
 * ici son résultat ; la route GET /api/match-stats/health le lit tel quel,
 * sans rien recalculer.
 *
 * Pourquoi un fichier et pas une table : le contrôle n'écrit JAMAIS dans la
 * base (il l'ouvre en lecture seule), ce qui écarte d'emblée tout risque pour
 * le journal WAL et toute écriture pendant un import. L'état se recalcule
 * entièrement depuis le magasin : le perdre ne coûte qu'un contrôle complet.
 *
 * data/runtime est sous OneDrive : écriture d'un bloc (utils/atomicJson.js),
 * et un fichier présent mais illisible n'est jamais pris pour « pas de
 * carnet » ni écrasé en silence — il est mis de côté sous un autre nom.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CARNET_FILE = path.resolve(__dirname, '../../../data/runtime/carnet-sante.json');

let cache = { mtimeMs: null, taille: null, valeur: null };

/**
 * L'état du carnet : { etat: 'absent' } (jamais contrôlé), { etat: 'pret',
 * carnet } ou { etat: 'illisible', erreur }. Gardé en mémoire tant que le
 * fichier ne change pas (il pèse quelques centaines de Ko).
 */
export function lireCarnet({ fichier = CARNET_FILE } = {}) {
  let info;
  try {
    info = fs.statSync(fichier);
  } catch {
    return { etat: 'absent', fichier };
  }
  if (fichier === CARNET_FILE && cache.valeur && cache.mtimeMs === info.mtimeMs && cache.taille === info.size) return { etat: 'pret', fichier, carnet: cache.valeur };
  try {
    const carnet = readJsonFile(fichier, null);
    if (!carnet || typeof carnet !== 'object' || !Array.isArray(carnet.carnet) || !Array.isArray(carnet.anomalies)) {
      return { etat: 'illisible', fichier, erreur: 'forme inattendue (ni carnet ni liste d’anomalies)' };
    }
    if (fichier === CARNET_FILE) cache = { mtimeMs: info.mtimeMs, taille: info.size, valeur: carnet };
    return { etat: 'pret', fichier, carnet, modifieLe: new Date(info.mtimeMs).toISOString() };
  } catch (error) {
    return { etat: 'illisible', fichier, erreur: error.message };
  }
}

/** Met de côté un carnet illisible (jamais effacé) ; rend le nouveau nom, ou null. */
export function mettreDeCote({ fichier = CARNET_FILE } = {}) {
  const cote = fichier.replace(/\.json$/, `.illisible-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  try {
    fs.renameSync(fichier, cote);
    return cote;
  } catch {
    return null;
  }
}

/** Écrit l'état d'un bloc (compact : il pèse plusieurs centaines de Ko). */
export function ecrireCarnet(etat, { fichier = CARNET_FILE } = {}) {
  writeJsonAtomic(fichier, etat, { indent: 0 });
  if (fichier === CARNET_FILE) cache = { mtimeMs: null, taille: null, valeur: null };
  return fichier;
}
