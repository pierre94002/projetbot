/**
 * fraicheurCotesRepository.js — le réglage de fraîcheur des cotes de vos bookmakers (étape 7 du plan).
 * -----------------------------------------------------------------------
 * data/runtime/fraicheur-cotes.json : { maxAgeMinutes, avantCompos, enregistreLe }.
 * Un réglage NON SECRET, enregistré depuis Réglages › « Cotes de vos
 * bookmakers » (PUT /api/odds/fraicheur, idempotent : les mêmes valeurs ne
 * réécrivent rien). Tant que rien n'est enregistré : 3 heures, et « relevée
 * avant l'annonce des compositions » compte comme à rafraîchir (la
 * proposition de l'étape 7, cf. core/engine/fraicheurCotes.js).
 *
 * Un fichier illisible n'est jamais écrasé en silence : la règle par défaut
 * s'applique, l'état le dit, et le prochain enregistrement le met de côté
 * (renommé, jamais supprimé) avant d'écrire. Exclu de l'empreinte des données
 * (dataVersionRepository.js) : enregistrer un réglage n'annonce pas
 * « nouvelles données » partout.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { REGLAGE_FRAICHEUR_DEFAUT, BORNES_DELAI_MINUTES } from '../../core/engine/fraicheurCotes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_FRAICHEUR = path.resolve(__dirname, '../../../data/runtime/fraicheur-cotes.json');

/** Une demande refusée (400), à distinguer d'une panne (500 : disque, fichier tenu). */
export class ReglageFraicheurInvalide extends Error {}

/** Contrôle une demande complète. Lève ReglageFraicheurInvalide sinon. */
export function validerReglageFraicheur(demande) {
  if (!demande || typeof demande !== 'object' || Array.isArray(demande)) {
    throw new ReglageFraicheurInvalide('Corps attendu : { maxAgeMinutes, avantCompos }.');
  }
  const { maxAgeMinutes, avantCompos } = demande;
  if (typeof maxAgeMinutes !== 'number' || !Number.isInteger(maxAgeMinutes)) {
    throw new ReglageFraicheurInvalide('« maxAgeMinutes » doit être un nombre entier de minutes.');
  }
  if (maxAgeMinutes < BORNES_DELAI_MINUTES.min || maxAgeMinutes > BORNES_DELAI_MINUTES.max) {
    throw new ReglageFraicheurInvalide(`« maxAgeMinutes » doit être entre ${BORNES_DELAI_MINUTES.min} minutes et ${BORNES_DELAI_MINUTES.max / 60} heures.`);
  }
  if (typeof avantCompos !== 'boolean') throw new ReglageFraicheurInvalide('« avantCompos » vaut true ou false.');
  return { maxAgeMinutes, avantCompos };
}

/**
 * Le réglage en vigueur : { reglage: { maxAgeMinutes, avantCompos },
 * source: 'defaut' | 'enregistre' | 'illisible', fichier, enregistreLe, probleme? }.
 */
export function lireReglageFraicheur() {
  const defaut = (source, probleme = null) => ({ reglage: { ...REGLAGE_FRAICHEUR_DEFAUT }, source, fichier: FICHIER_FRAICHEUR, enregistreLe: null, ...(probleme ? { probleme } : {}) });
  let brut;
  try {
    brut = readJsonFile(FICHIER_FRAICHEUR, null);
  } catch (error) {
    return defaut('illisible', error.message);
  }
  if (brut === null) return defaut('defaut');
  try {
    return { reglage: validerReglageFraicheur(brut), source: 'enregistre', fichier: FICHIER_FRAICHEUR, enregistreLe: brut.enregistreLe ?? null };
  } catch (error) {
    return defaut('illisible', `forme inattendue (${error.message})`);
  }
}

/**
 * Enregistre le réglage voulu. Idempotent : les mêmes valeurs que celles déjà
 * enregistrées ne réécrivent rien (`change: false`). Lève ReglageFraicheurInvalide.
 * @returns {{ change: boolean, fichier: string, etat: object, misDeCote?: string }}
 */
export function enregistrerReglageFraicheur(demande) {
  const voulu = validerReglageFraicheur(demande);
  const actuel = lireReglageFraicheur();
  if (actuel.source === 'enregistre' && actuel.reglage.maxAgeMinutes === voulu.maxAgeMinutes && actuel.reglage.avantCompos === voulu.avantCompos) {
    return { change: false, fichier: FICHIER_FRAICHEUR, etat: actuel };
  }
  let misDeCote;
  if (actuel.source === 'illisible' && fs.existsSync(FICHIER_FRAICHEUR)) {
    misDeCote = FICHIER_FRAICHEUR.replace(/\.json$/, `.illisible-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.renameSync(FICHIER_FRAICHEUR, misDeCote);
  }
  writeJsonAtomic(FICHIER_FRAICHEUR, { ...voulu, enregistreLe: new Date().toISOString() });
  return { change: true, fichier: FICHIER_FRAICHEUR, etat: lireReglageFraicheur(), ...(misDeCote ? { misDeCote } : {}) };
}
