/**
 * travailCooperatif.js — rendre la main à la boucle d'événements pendant un
 * long calcul, sans écrire ce calcul deux fois.
 * -----------------------------------------------------------------------
 * Node n'a qu'un fil : un calcul de plusieurs secondes qui ne rend jamais la
 * main fige tout ce qui tourne dans le même processus (le serveur, ses
 * routes, ses boucles). Le contrôle complet du carnet de santé des données
 * (étape 12) a pris 77 s d'une seule traite sur la base du bac (07/10/2026).
 *
 * La solution du reste du code (repères, contrôle quotidien) : `await
 * new Promise((fin) => setImmediate(fin))` entre deux morceaux. Ici, UNE seule
 * écriture du calcul : un GÉNÉRATEUR, qui `yield` aux endroits où il peut
 * s'interrompre (entre deux tranches de lignes, tous les n tours d'une
 * boucle…), et deux façons de l'exécuter :
 *
 *   - `executerSansPause`  jusqu'au bout, sans jamais rendre la main : pour
 *                          l'appelant synchrone d'avant (un script, un test,
 *                          dailyChecks.js) — mêmes résultats, mêmes appels ;
 *   - `executerEnRendantLaMain`  en laissant la boucle d'événements respirer
 *                          aux points d'arrêt, au plus toutes les PAS_MS
 *                          millisecondes de travail (`creerPauses`).
 *
 * Ce que `yield` ne coupe pas : un appel unique qui dure (un JSON.parse, une
 * seule requête SQLite qui ne rend rien avant la fin). Les requêtes qui
 * rendent leurs lignes au fil de l'eau se lisent avec `.iterate()` et un
 * `yield` tous les n tours ; les autres se découpent par plages de clés.
 *
 * Le plus long moment passé sans rendre la main est mesuré (`bilan`) : c'est
 * la preuve que le processus n'est jamais tenu plus de quelques dizaines de
 * millisecondes — « le serveur jamais tenu plus de X ms d'affilée » dans le
 * résumé des étapes de l'actualisation.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { readJsonFile } from './atomicJson.js';

/** Un calcul rend la main au plus toutes les 25 ms de travail (comme leagueBenchmarks.js). */
export const PAS_MS = 25;

/** Rend la main : les autres tâches du processus passent avant la suite. */
export const rendreLaMainParDefaut = () => new Promise((fin) => setImmediate(fin));

/** L'horloge du processus, jamais celle du calendrier (elle est figée dans les essais : cf. test/aides/garde.mjs). */
const chrono = () => performance.now();

/**
 * Exécute un générateur jusqu'au bout, sans jamais rendre la main, et rend sa
 * valeur de retour. Les `yield` ne sont que des points d'arrêt : ignorés.
 */
export function executerSansPause(travail) {
  let etape = travail.next();
  while (!etape.done) etape = travail.next();
  return etape.value;
}

/**
 * Exécute un générateur en appelant `pause(ou)` à chacun de ses points d'arrêt
 * (`ou` : ce que le générateur a donné à `yield`, pour dire où l'on en est) ;
 * `pause` décide de rendre la main ou non (cf. `creerPauses`). Rend sa valeur
 * de retour. Si `pause` échoue, le générateur est refermé (ses requêtes en
 * cours le sont aussi) avant que l'erreur ne remonte.
 */
export async function executerEnRendantLaMain(travail, pause) {
  try {
    let etape = travail.next();
    while (!etape.done) {
      await pause(etape.value);
      etape = travail.next();
    }
    return etape.value;
  } finally {
    travail.return?.();
  }
}

/**
 * Les pauses d'un calcul : `pause(ou)` rend TOUJOURS la main (entre deux
 * grandes étapes) ; `siLongtemps(ou)` seulement si `pasMs` de travail se sont
 * écoulés depuis la dernière (aux points d'arrêt des boucles) ; `bilan()` dit
 * le plus long moment passé sans rendre la main, et où il s'est terminé.
 * `attendre(promesse, ou)` (étape 19, le juge du banc dans un fil à part) :
 * attendre un travail fait AILLEURS sans tenir la main — le tronçon d'avant
 * est mesuré comme par `pause`, l'attente elle-même ne compte pas.
 * `rendreLaMain(ou)` est remplaçable (les essais y mettent un compteur).
 */
export function creerPauses({ rendreLaMain = rendreLaMainParDefaut, pasMs = PAS_MS } = {}) {
  let derniere = chrono();
  let blocMax = { ms: 0, ou: null };
  let pauses = 0;
  const pause = async (ou) => {
    const ms = chrono() - derniere;
    if (ms > blocMax.ms) blocMax = { ms, ou: ou ?? null };
    pauses++;
    await rendreLaMain(ou);
    derniere = chrono();
  };
  const siLongtemps = async (ou) => {
    if (chrono() - derniere >= pasMs) await pause(ou);
  };
  const attendre = async (promesse, ou) => {
    const ms = chrono() - derniere;
    if (ms > blocMax.ms) blocMax = { ms, ou: ou ?? null };
    pauses++;
    try {
      return await promesse;
    } finally {
      derniere = chrono();
    }
  };
  const bilan = () => {
    // Le dernier tronçon, jusqu'à maintenant, compte aussi.
    const dernier = chrono() - derniere;
    const max = dernier > blocMax.ms ? { ms: dernier, ou: 'bilan' } : blocMax;
    return { blocMaxMs: Math.round(max.ms), blocMaxOu: max.ou, pauses };
  };
  return { pause, siLongtemps, attendre, bilan };
}

/**
 * Le contenu d'un fichier JSON, `valeurSiAbsent` s'il n'existe pas, lu en DEUX
 * temps — le texte (un `yield`), puis le JSON.parse — : un fichier de 18 Mo
 * (le calendrier de saison) demande ~60 ms de lecture et ~90 ms d'analyse,
 * d'une traite 150 ms. Si la lecture ou l'analyse échoue (OneDrive tient le
 * fichier, écriture en cours), on retombe sur `readJsonFile` : mêmes nouvelles
 * tentatives, même erreur finale — rien n'est pris pour un fichier vide.
 */
export function* lireJsonEnDeuxTemps(chemin, valeurSiAbsent, ou = 'lecture d’un fichier JSON') {
  if (!fs.existsSync(chemin)) return valeurSiAbsent;
  // Un point d'arrêt avant la lecture, un autre entre la lecture et l'analyse : chacune tient seule.
  yield ou;
  let texte;
  try {
    texte = fs.readFileSync(chemin, 'utf8');
  } catch {
    return readJsonFile(chemin, valeurSiAbsent);
  }
  yield ou;
  try {
    return JSON.parse(texte);
  } catch {
    return readJsonFile(chemin, valeurSiAbsent);
  }
}
