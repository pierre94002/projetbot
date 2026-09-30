/**
 * atomicJson.js — lire et écrire les journaux JSON sans jamais les perdre.
 * -----------------------------------------------------------------------
 * Deux défauts ont longtemps cohabité dans les dépôts de fichiers :
 *
 *   - un fichier illisible (lu en pleine écriture, verrouillé par OneDrive)
 *     était relu comme VIDE, et l'écriture suivante repartait de rien :
 *     un pari saisi à ce moment-là réécrivait le carnet avec ce seul pari ;
 *   - l'écriture se faisait en place : un lecteur pouvait tomber sur un
 *     fichier à moitié écrit, et une coupure au milieu le laissait tronqué.
 *
 * Ici, l'écriture passe par un fichier temporaire renommé ensuite (le
 * renommage remplace d'un bloc), avec quelques nouvelles tentatives quand
 * OneDrive tient le fichier ; et un fichier présent mais illisible fait
 * ÉCHOUER la lecture, après autant de nouvelles tentatives, au lieu de
 * passer pour un fichier vide. OneDrive le tient juste après chaque
 * écriture, le temps de l'envoyer : Windows répond alors EBUSY, EPERM ou
 * « UNKNOWN: unknown error » (errno -4094).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';

const TENTATIVES = 5;

function pause(ms) {
  // Attente synchrone courte : les dépôts sont synchrones de bout en bout.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Contenu d'un fichier JSON, `fallback` s'il n'existe pas. Un fichier présent
 * mais illisible est relu pendant ~1,5 s (OneDrive le tient, écriture
 * concurrente en cours), puis lève une erreur : mieux vaut une requête en
 * échec qu'un journal effacé.
 */
export function readJsonFile(filePath, fallback) {
  for (let essai = 1; ; essai++) {
    if (!fs.existsSync(filePath)) return fallback;
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      if (essai >= TENTATIVES) {
        throw new Error(`${path.basename(filePath)} illisible (${error.message}) : rien n'est écrit tant qu'il ne l'est pas.`);
      }
      pause(150 * essai);
    }
  }
}

/**
 * Écrit `data` en JSON dans `filePath`, d'un bloc, sans état intermédiaire
 * visible. `finalNewline` garde le saut de ligne final des fichiers qui en
 * avaient un, pour ne pas changer leur contenu octet pour octet.
 */
export function writeJsonAtomic(filePath, data, { indent = 2, finalNewline = false } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const texte = `${JSON.stringify(data, null, indent)}${finalNewline ? '\n' : ''}`;
  const temporaire = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaire, texte, 'utf8');
  let derniere;
  for (let essai = 1; essai <= TENTATIVES; essai++) {
    try {
      fs.renameSync(temporaire, filePath);
      return;
    } catch (error) {
      derniere = error;
      // EPERM / EBUSY / EACCES : OneDrive ou un antivirus tient le fichier.
      pause(120 * essai);
    }
  }
  try {
    fs.rmSync(temporaire, { force: true });
  } catch {
    // Tenu lui aussi : la prochaine écriture de ce processus l'écrasera. Ne
    // doit pas masquer l'erreur qui compte, celle du renommage.
  }
  throw derniere;
}

/** Supprime `filePath` s'il existe, avec les mêmes nouvelles tentatives quand OneDrive le tient. */
export function removeFileWithRetry(filePath) {
  for (let essai = 1; ; essai++) {
    try {
      fs.rmSync(filePath, { force: true });
      return;
    } catch (error) {
      if (essai >= TENTATIVES) throw error;
      pause(120 * essai);
    }
  }
}

const REPRISES_MS = [2000, 5000, 10000];

/**
 * Pour une donnée qui a coûté cher à obtenir (analyse Claude, réponse d'une
 * API payante) : si OneDrive tient encore le fichier au-delà des nouvelles
 * tentatives immédiates ci-dessus (~2 s), l'enregistrement est retenté
 * quelques secondes plus tard, ~20 s en tout, sans bloquer le serveur
 * entre-temps, plutôt que de jeter la donnée. Le 30/09/2026, une analyse IA
 * s'est perdue ainsi sur « UNKNOWN: unknown error, open ». `enregistrer` est
 * l'écriture synchrone d'un dépôt ; son résultat est rendu tel quel.
 */
export async function enregistrerSansPerdre(enregistrer, libelle) {
  for (const attente of REPRISES_MS) {
    try {
      return enregistrer();
    } catch (error) {
      console.warn(`[${libelle}] enregistrement impossible (${error.message}), nouvel essai dans ${attente / 1000} s.`);
      await new Promise((resolve) => setTimeout(resolve, attente));
    }
  }
  return enregistrer();
}
