/**
 * valeurStatsAPart.js — lancer le calcul de la VALEUR DE CHAQUE STATISTIQUE
 * dans un processus à part et attendre sa réponse (étape 18 du plan,
 * 13/10/2026). Le patron du contrôle anti-fuite de la table du jour J
 * (dayTable.js, controleAPart) : fork de valeurStatsEnfant.js, base en LECTURE
 * SEULE dans l'enfant, réponse par le canal du processus, délai au bout duquel
 * l'enfant est arrêté. L'appelant (le serveur, ou scripts/stat-value.mjs) tient
 * le verrou d'actualisation pendant ce temps, puis RANGE lui-même le résultat
 * (finirCalcul) : un seul écrivain.
 *
 * Mêmes options de Node que le parent (fork) : dans les essais, le même
 * garde-fou (réseau coupé, heure figée, base contrôlée).
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commencerCalculLourd } from '../../utils/calculLourd.js';

const ENFANT = fileURLToPath(new URL('./valeurStatsEnfant.js', import.meta.url));
/** Le calcul complet prend 3 à 4 min sur la base du bac (13/10/2026) : au-delà de 30 min, l'enfant est arrêté. */
export const DELAI_CALCUL_MS = 30 * 60_000;

/**
 * Le calcul dans un processus à part. Rend une promesse de { lignes, bilan } ; rejette (enfant arrêté) si
 * l'enfant ne répond pas dans `delaiMs`, s'il échoue ({ erreur }), ou s'il s'arrête sans répondre.
 * `avancement(a)` reçoit l'avancement que l'enfant envoie (partie, fait, total).
 */
export function calculerAPart({ chemin, options = {}, delaiMs = DELAI_CALCUL_MS, avancement = null }) {
  // Étape 27 : un calcul lourd à la fois (utils/calculLourd.js) — un autre en cours, celui-ci est refusé (reporté).
  let rendre;
  try {
    rendre = commencerCalculLourd('valeur des statistiques');
  } catch (error) {
    return Promise.reject(error);
  }
  return calculerSousJeton({ chemin, options, delaiMs, avancement }).finally(rendre);
}

function calculerSousJeton({ chemin, options, delaiMs, avancement }) {
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const enfant = fork(ENFANT, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    // `fini` est posé AVANT d'arrêter l'enfant : sa sortie, qui suit, ne rejette pas une seconde fois.
    const minuterie = setTimeout(() => {
      if (fini) return;
      fini = true;
      try {
        enfant.kill();
      } catch {
        // déjà arrêté
      }
      reject(new Error(`calcul à part arrêté : aucune réponse en ${delaiMs < 1000 ? `${delaiMs} ms` : `${Math.round(delaiMs / 60_000)} min`}`));
    }, delaiMs);
    minuterie.unref?.();
    enfant.stderr?.on('data', (d) => {
      erreurs = (erreurs + d).slice(-2000);
    });
    enfant.on('message', (m) => {
      if (m?.avancement) {
        avancement?.(m.avancement);
        return;
      }
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(m);
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!fini) reject(error);
      fini = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!fini) reject(new Error(`calcul à part arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      fini = true;
    });
    enfant.send({ chemin, options });
  });
}
