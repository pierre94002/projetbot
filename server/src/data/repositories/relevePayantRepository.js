/**
 * relevePayantRepository.js — le bilan du dernier relevé payant The Odds API (étape 7 du plan).
 * -----------------------------------------------------------------------
 * data/runtime/releve-payant.json, écrit par liveDataSync.refreshLiveOdds À LA
 * FIN d'un relevé que Pierre a lancé (Réglages › Données › « Actualiser ») :
 *   { version, at, clesDemandees, clesRelevees, echecs, matchs,
 *     quota: { restants, utilises }, cout, coutParCle, matchsParCle }
 * `quota` : les en-têtes x-requests-remaining / x-requests-used de la DERNIÈRE
 * réponse (les crédits restants et consommés depuis la remise à zéro du mois,
 * selon The Odds API) ; `cout` : la somme des x-requests-last (le coût de
 * chaque requête), null si une réponse ne l'a pas donné. Avant ce fichier,
 * le quota ne vivait que dans la mémoire de l'onglet qui avait cliqué.
 *
 * Lu par le conseil de relevé (data/conseilReleve.js) : « crédits restants »
 * ne s'affiche que s'ils sont CONNUS — jamais un chiffre deviné.
 * Écrit par le serveur seul, en JSON atomique (OneDrive) ; un échec
 * d'écriture ne fait jamais échouer le relevé lui-même.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_RELEVE_PAYANT = path.resolve(__dirname, '../../../data/runtime/releve-payant.json');
export const VERSION_RELEVE_PAYANT = 1;

const entierOuNull = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Math.trunc(Number(x)));

/**
 * Le bilan d'un relevé, mis en forme pour le fichier. `reponses` : une entrée
 * par compétition demandée, { sportKey, ok, matchs, quota: { remaining, used, last }, message }.
 */
export function bilanDuReleve({ at, reponses = [] }) {
  const reussies = reponses.filter((r) => r.ok);
  const derniere = [...reponses].reverse().find((r) => r.quota && (r.quota.remaining != null || r.quota.used != null)) ?? null;
  const couts = reponses.map((r) => entierOuNull(r.quota?.last));
  const coutConnu = reponses.length > 0 && couts.every((c) => c !== null);
  return {
    version: VERSION_RELEVE_PAYANT,
    at,
    clesDemandees: reponses.length,
    clesRelevees: reussies.map((r) => r.sportKey),
    echecs: reponses.filter((r) => !r.ok).map((r) => ({ sportKey: r.sportKey, message: String(r.message ?? '').slice(0, 200) })),
    matchs: reussies.reduce((n, r) => n + (Number(r.matchs) || 0), 0),
    quota: derniere ? { restants: entierOuNull(derniere.quota.remaining), utilises: entierOuNull(derniere.quota.used) } : { restants: null, utilises: null },
    cout: coutConnu ? couts.reduce((a, b) => a + b, 0) : null,
    coutParCle: Object.fromEntries(reponses.map((r, i) => [r.sportKey, couts[i]])),
    // Les matchs rendus par compétition (null : la requête a échoué) — une compétition « hors saison » en rend 0.
    matchsParCle: Object.fromEntries(reponses.map((r) => [r.sportKey, r.ok ? Number(r.matchs) || 0 : null]))
  };
}

/** Garde le bilan du relevé. Ne lève jamais : rend { ecrit, erreur? }. */
export function noterRelevePayant(bilan) {
  try {
    writeJsonAtomic(FICHIER_RELEVE_PAYANT, bilan);
    return { ecrit: true };
  } catch (error) {
    console.warn(`[relevé payant] bilan non gardé (${error.message}) : le relevé, lui, est fait.`);
    return { ecrit: false, erreur: error.message };
  }
}

/**
 * Le dernier bilan : { source: 'absent' | 'enregistre' | 'illisible', fichier, bilan, probleme? }.
 * Un fichier illisible n'est jamais pris pour « aucun relevé » sans le dire.
 */
export function lireDernierRelevePayant() {
  let brut;
  try {
    brut = readJsonFile(FICHIER_RELEVE_PAYANT, null);
  } catch (error) {
    return { source: 'illisible', fichier: FICHIER_RELEVE_PAYANT, bilan: null, probleme: error.message };
  }
  if (brut === null) return { source: 'absent', fichier: FICHIER_RELEVE_PAYANT, bilan: null };
  if (typeof brut !== 'object' || Array.isArray(brut) || !brut.at || !Number.isFinite(Date.parse(brut.at))) {
    return { source: 'illisible', fichier: FICHIER_RELEVE_PAYANT, bilan: null, probleme: 'forme inattendue' };
  }
  return {
    source: 'enregistre',
    fichier: FICHIER_RELEVE_PAYANT,
    bilan: {
      at: new Date(Date.parse(brut.at)).toISOString(),
      clesDemandees: entierOuNull(brut.clesDemandees),
      clesRelevees: Array.isArray(brut.clesRelevees) ? brut.clesRelevees.map(String) : [],
      echecs: Array.isArray(brut.echecs) ? brut.echecs : [],
      matchs: entierOuNull(brut.matchs),
      quota: { restants: entierOuNull(brut.quota?.restants), utilises: entierOuNull(brut.quota?.utilises) },
      cout: entierOuNull(brut.cout),
      coutParCle: brut.coutParCle && typeof brut.coutParCle === 'object' ? brut.coutParCle : {},
      matchsParCle: brut.matchsParCle && typeof brut.matchsParCle === 'object' ? brut.matchsParCle : {}
    }
  };
}
