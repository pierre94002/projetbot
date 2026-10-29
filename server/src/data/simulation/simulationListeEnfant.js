/**
 * simulationListeEnfant.js — LA LISTE DES MATCHS À VENIR de la nuit des déroulés, dans un PROCESSUS À PART (correctif C
 * du 28/10/2026). Lancé par simulationNuit.js (fork, sérialisation « avancée », argument « --enfant-simulation ») ; ce
 * n'est pas un script à lancer à la main.
 *
 * Pourquoi : la liste de la page Matchs (gelPronostics.matchsAVenir, qui lit matchSources.listAdaptedMatches — ni l'un
 * ni l'autre n'est touché) se calcule D'UNE TRAITE : le calendrier de saison (18 Mo), l'instantané de cotes, les
 * reports, les noms à rapprocher, les cotes gratuites de chaque rencontre du calendrier. Dans le serveur, l'étape
 * « simulationMatchs » en était tenue 797 ms la nuit du 28/10 et 2 570 ms à la passe de démarrage du 27/10 (à froid).
 * Ici, c'est l'ENFANT qui la paie ; le serveur l'attend en gardant la main.
 *
 * La MÊME liste que dans le serveur : la même fonction, au même instant (`instant`, l'heure de la passe), sur les mêmes
 * fichiers et la même base. La base est ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true }) : la
 * connexion gardée sert ensuite à chaque lecture de la liste ; jamais un second écrivain, c'est le serveur seul — une
 * écriture lèverait). Renvoie la liste par morceaux ({ morceau: [...] }), puis la fin ({ fin: true, matchs, ms, aPart })
 * ou { erreur }, et s'arrête. Ni horloge (les durées : performance.now), ni hasard, ni réseau.
 */

import { openDb } from '../db/matchStatsDb.js';
import { matchsAVenir } from '../enregistreurs/gelPronostics.js';

/** Matchs par morceau renvoyé au serveur : chaque morceau s'y lit en une fraction de milliseconde. */
export const MATCHS_PAR_MORCEAU = 100;

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-simulation') && typeof process.send === 'function') {
  process.once('message', ({ instant }) => {
    try {
      const t0 = performance.now();
      openDb({ readonly: true });
      const liste = matchsAVenir(instant);
      const ms = Math.round(performance.now() - t0);
      for (let i = 0; i < liste.length; i += MATCHS_PAR_MORCEAU) process.send({ morceau: liste.slice(i, i + MATCHS_PAR_MORCEAU) });
      process.send({ fin: true, matchs: liste.length, ms, aPart: { pid: process.pid, rssOctets: process.memoryUsage.rss() } }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.message ?? error) }, () => process.exit(0));
    }
  });
}
