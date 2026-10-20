/**
 * controleQuotidienRepository.js — l'état du contrôle quotidien des données.
 * -----------------------------------------------------------------------
 * Étape 14 du plan (07/10/2026). L'étape « controleQuotidien » de
 * l'actualisation (dernière de chaque passe) écrit ici son résultat :
 * data/runtime/controle-quotidien.json — les contrôles, leurs constats avec
 * leur date de découverte, l'index « à vérifier » des pronostics et
 * l'historique des feux. La route GET /api/health/checks, la puce du haut de
 * l'appli (GET /api/refresh) et le badge « à vérifier » le LISENT, sans rien
 * recalculer (les sources, elles, se relisent à chaque lecture).
 *
 * Pourquoi un fichier et pas une table : le contrôle n'écrit JAMAIS dans la
 * base. L'état se refait entièrement à la passe suivante : le perdre ne
 * coûte que les dates de découverte (un constat rouge redeviendrait
 * « nouveau » pour 24 h).
 *
 * data/runtime est sous OneDrive : écriture d'un bloc (utils/atomicJson.js),
 * et un fichier présent mais illisible n'est jamais pris pour « jamais
 * contrôlé » ni écrasé en silence : il est mis de côté sous un autre nom.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONTROLE_FILE = path.resolve(__dirname, '../../../data/runtime/controle-quotidien.json');

let cache = { mtimeMs: null, taille: null, valeur: null };

/**
 * L'état : { etat: 'absent' } (jamais contrôlé), { etat: 'pret', controle,
 * modifieLe } ou { etat: 'illisible', erreur }. Gardé en mémoire tant que le
 * fichier ne change pas : la puce du haut le relit chaque minute.
 */
export function lireControle({ fichier = CONTROLE_FILE } = {}) {
  let info;
  try {
    info = fs.statSync(fichier);
  } catch {
    return { etat: 'absent', fichier };
  }
  const modifieLe = new Date(info.mtimeMs).toISOString();
  if (fichier === CONTROLE_FILE && cache.valeur && cache.mtimeMs === info.mtimeMs && cache.taille === info.size) return { etat: 'pret', fichier, controle: cache.valeur, modifieLe };
  try {
    const controle = readJsonFile(fichier, null);
    if (!controle || typeof controle !== 'object' || !Array.isArray(controle.controles) || !controle.le) {
      return { etat: 'illisible', fichier, erreur: 'forme inattendue (ni contrôles ni date)' };
    }
    if (fichier === CONTROLE_FILE) cache = { mtimeMs: info.mtimeMs, taille: info.size, valeur: controle };
    return { etat: 'pret', fichier, controle, modifieLe };
  } catch (error) {
    return { etat: 'illisible', fichier, erreur: error.message };
  }
}

/** Met de côté un état illisible (jamais effacé) ; rend le nouveau nom, ou null. */
export function mettreDeCote({ fichier = CONTROLE_FILE } = {}) {
  const cote = fichier.replace(/\.json$/, `.illisible-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  try {
    fs.renameSync(fichier, cote);
    return cote;
  } catch {
    return null;
  }
}

/** Écrit l'état d'un bloc (compact). */
export function ecrireControle(etat, { fichier = CONTROLE_FILE } = {}) {
  writeJsonAtomic(fichier, etat, { indent: 0 });
  if (fichier === CONTROLE_FILE) cache = { mtimeMs: null, taille: null, valeur: null };
  return fichier;
}
