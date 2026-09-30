/**
 * autoAiAnalysisRepository.js — combien d'analyses IA automatiques ont
 * tourné AUJOURD'HUI (jour civil à Paris), avant-match et après-match
 * confondues.
 * -----------------------------------------------------------------------
 * Seul but : faire respecter `env.autoAiAnalysis.dailyLimit` sans jamais
 * dépasser le budget d'un jour sur la passe suivante — remis à zéro au
 * changement de jour, jamais cumulé. Ce qui n'a pas pu tourner (plafond
 * atteint) est compté à part (`skippedPreMatch`/`skippedPostMatch`), jamais
 * perdu en silence : Réglages doit pouvoir montrer qu'un jour chargé a laissé
 * des matchs de côté, pas seulement ceux qui sont passés.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.resolve(__dirname, '../../../data/runtime/auto-ai-analysis-status.json');

const vide = (jour) => ({ day: jour, count: 0, preMatch: 0, postMatch: 0, skippedPreMatch: 0, skippedPostMatch: 0 });

function lire(jour) {
  const etat = readJsonFile(FILE_PATH, null);
  if (!etat || etat.day !== jour) return vide(jour);
  return { ...vide(jour), ...etat };
}

/** Combien d'analyses restent permises aujourd'hui (jamais négatif). */
export function budgetRestant(jour, plafond) {
  return Math.max(0, plafond - lire(jour).count);
}

/** État du jour, pour Réglages ou pour décider un partage avant/après-match. */
export function statutDuJour(jour) {
  return lire(jour);
}

/** Enregistre ce qui a tourné (et ce qui a été laissé de côté) à cette passe. */
export function enregistrerUsage(jour, { preMatch = 0, postMatch = 0, skippedPreMatch = 0, skippedPostMatch = 0 } = {}) {
  const etat = lire(jour);
  const maj = {
    day: jour,
    count: etat.count + preMatch + postMatch,
    preMatch: etat.preMatch + preMatch,
    postMatch: etat.postMatch + postMatch,
    skippedPreMatch: etat.skippedPreMatch + skippedPreMatch,
    skippedPostMatch: etat.skippedPostMatch + skippedPostMatch
  };
  writeJsonAtomic(FILE_PATH, maj);
  return maj;
}
