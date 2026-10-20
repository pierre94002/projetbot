/**
 * bancAPart.js — lancer le REJEU DU BANC D'ESSAI dans un processus à part et attendre sa réponse (étape 19 du
 * plan, correction du 19/10/2026). Le patron de l'étape 18 (valeurStatsAPart.js) : fork de bancEnfant.js, base
 * en LECTURE SEULE dans l'enfant, réponse par le canal du processus, délai au bout duquel l'enfant est arrêté.
 * L'appelant (le serveur, route POST /api/bench/run) tient le verrou d'actualisation (nom « banc ») pendant ce
 * temps, puis RANGE lui-même le rejeu (finirRejeu) : un seul écrivain.
 *
 * Pendant le rejeu, le SERVEUR est mesuré ici : le retard réel de sa boucle d'événements (monitorEventLoopDelay)
 * et sa RSS (avant, au plus haut, après) — rendus dans `serveur`, rangés dans le bilan du rejeu.
 *
 * Mêmes options de Node que le parent (fork) : dans les essais, le même garde-fou (réseau coupé, heure figée,
 * base contrôlée).
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const ENFANT = fileURLToPath(new URL('./bancEnfant.js', import.meta.url));
/** Le rejeu de la configuration de Pierre prend 11 à 12 min sur la base du bac (13/10/2026) : au-delà de 45 min, l'enfant est arrêté. */
export const DELAI_REJEU_MS = 45 * 60_000;

/**
 * Le rejeu dans un processus à part. Rend une promesse de { bilan, resume, serveur } ; rejette (enfant arrêté) si
 * l'enfant ne répond pas dans `delaiMs`, s'il échoue ({ erreur }), ou s'il s'arrête sans répondre — l'erreur
 * porte alors `serveur` (la mesure du serveur jusque-là). `avancement(a)` reçoit ce que l'enfant envoie.
 */
export function rejouerAPart({ chemin, options = {}, delaiMs = DELAI_REJEU_MS, avancement = null }) {
  const boucle = monitorEventLoopDelay({ resolution: 10 });
  boucle.enable();
  const rssAvantOctets = process.memoryUsage.rss();
  let rssMaxOctets = rssAvantOctets;
  const releve = setInterval(() => {
    rssMaxOctets = Math.max(rssMaxOctets, process.memoryUsage.rss());
  }, 1000);
  releve.unref?.();
  const mesure = () => {
    clearInterval(releve);
    boucle.disable();
    const rssApresOctets = process.memoryUsage.rss();
    return {
      pid: process.pid,
      retardBoucleMaxMs: Math.round(boucle.max / 1e6),
      retardBoucleP99Ms: Math.round(boucle.percentile(99) / 1e6),
      rssAvantOctets,
      rssMaxOctets: Math.max(rssMaxOctets, rssApresOctets),
      rssApresOctets
    };
  };
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const echec = (error) => {
      error.serveur = mesure();
      reject(error);
    };
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
      echec(new Error(`rejeu à part arrêté : aucune réponse en ${delaiMs < 1000 ? `${delaiMs} ms` : `${Math.round(delaiMs / 60_000)} min`}`));
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
      if (m?.erreur) echec(new Error(m.erreur));
      else resolve({ bilan: m.bilan, resume: m.resume ?? null, serveur: mesure() });
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!fini) echec(error);
      fini = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!fini) echec(new Error(`rejeu à part arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      fini = true;
    });
    enfant.send({ chemin, options });
  });
}
