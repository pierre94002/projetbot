/**
 * gardeFousRepository.js — le réglage des GARDE-FOUS de Pierre (étape 11 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * data/runtime/garde-fous.json : { miseMaxParPari, perteMaxParSemaine, majLe }
 * (montants en euros ; null = pas de plafond). Absent : AUCUN plafond — c'est
 * Pierre qui les fixe, dans Réglages › Gestion du risque. Un réglage non
 * secret, écrit par l'appli seulement (atomicJson : jamais un fichier à
 * moitié écrit, OneDrive compris).
 *
 * Un fichier présent mais illisible n'est JAMAIS pris pour « pas de plafond » :
 * la lecture échoue (503 à l'écran) et rien n'est écrit par-dessus ; le
 * coupe-circuit, lui, reste enclenché par prudence tant qu'il l'est
 * (tiltState.js). Un PUT qui ne change rien n'écrit rien (idempotent).
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { REGLAGE_GARDE_FOUS_DEFAUT, CHAMPS_GARDE_FOUS, BORNES_GARDE_FOUS, ErreurGardeFous, validerReglageGardeFous, reglageLu } from '../../core/risk/gardeFous.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FICHIER = path.resolve(__dirname, '../../../data/runtime/garde-fous.json');

export const fichierGardeFous = () => FICHIER;

/**
 * Le réglage en vigueur.
 * @returns {{ reglage: object, source: 'defaut'|'enregistre', majLe: string|null, fichier: string, bornes: object }}
 * @throws {ErreurGardeFous} (503) fichier présent mais illisible ou de forme inattendue
 */
export function lireReglageGardeFous() {
  let brut;
  try {
    brut = readJsonFile(FICHIER, null);
  } catch (error) {
    throw new ErreurGardeFous(`Réglage des garde-fous illisible (${FICHIER}) : ${error.message}`, 503);
  }
  if (brut === null) return { reglage: { ...REGLAGE_GARDE_FOUS_DEFAUT }, source: 'defaut', majLe: null, fichier: FICHIER, bornes: BORNES_GARDE_FOUS };
  try {
    return { reglage: reglageLu(brut), source: 'enregistre', majLe: typeof brut.majLe === 'string' ? brut.majLe : null, fichier: FICHIER, bornes: BORNES_GARDE_FOUS };
  } catch (error) {
    throw new ErreurGardeFous(`Réglage des garde-fous illisible (${FICHIER}) : ${error.message} — rien n'est écrit tant qu'il ne l'est pas.`, 503);
  }
}

/**
 * Enregistre les champs donnés (null = plus de plafond) ; les autres restent.
 * @returns {{ reglage, source, majLe, fichier, bornes, ecrit: boolean }}
 */
export function enregistrerReglageGardeFous(changement) {
  const valide = validerReglageGardeFous(changement);
  const actuel = lireReglageGardeFous();
  const suivant = { ...actuel.reglage, ...valide };
  if (CHAMPS_GARDE_FOUS.every((k) => suivant[k] === actuel.reglage[k])) return { ...actuel, ecrit: false };
  const majLe = new Date().toISOString();
  writeJsonAtomic(FICHIER, { ...Object.fromEntries(CHAMPS_GARDE_FOUS.map((k) => [k, suivant[k]])), majLe });
  return { reglage: suivant, source: 'enregistre', majLe, fichier: FICHIER, bornes: BORNES_GARDE_FOUS, ecrit: true };
}
