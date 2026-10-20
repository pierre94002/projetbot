/**
 * bancEnfant.js — le REJEU DU BANC D'ESSAI dans un PROCESSUS À PART (étape 19 du plan, correction du 19/10/2026).
 * Lancé par bancAPart.rejouerAPart (fork) ; ce n'est pas un script à lancer à la main (pour cela :
 * scripts/bench.mjs, qui rejoue dans son propre processus).
 *
 * POURQUOI : dans le serveur, le rejeu de la configuration de Pierre ajoutait 0,9 à 1 Go de RSS, encore tenus
 * après coup (V8 ne rend pas cette mémoire au système dans un processus qui vit), sur un PC de 7,9 Go dont
 * 2,9 Go libres ; et sa boucle d'événements était retenue jusqu'à 0,44 s. Ici, la mémoire part avec l'enfant,
 * et le serveur attend la réponse sans rien bloquer (le patron de l'étape 18 : valeurStatsEnfant.js).
 *
 * Reçoit { chemin, options } par le canal du processus parent, ouvre la base EN LECTURE SEULE (jamais un second
 * écrivain : c'est le serveur qui range le rejeu dans bench_runs), envoie son avancement ({ avancement }),
 * puis { bilan, resume } ou { erreur }, et s'arrête.
 */

import { DatabaseSync } from 'node:sqlite';
import { rejouer } from '../../bench/runner.js';

process.once('message', async ({ chemin, options }) => {
  let db = null;
  let reponse;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    // La main rendue toutes les ~25 ms : pour que l'avancement parte au fil du rejeu (le canal ne s'écrit qu'entre deux tâches).
    const r = await rejouer({ ...(options ?? {}), database: db, rendreLaMain: (fin) => setImmediate(fin), avancement: (a) => process.send({ avancement: a }) });
    reponse = { bilan: { ...r.bilan, aPart: { pid: process.pid, rssMaxOctets: r.bilan.rssMax ?? null, rssFinOctets: process.memoryUsage().rss } }, resume: r.resume };
  } catch (error) {
    reponse = { erreur: `${error?.name && error.name !== 'Error' ? `${error.name} : ` : ''}${String(error?.message ?? error)}` };
  } finally {
    try {
      db?.close();
    } catch {
      // déjà fermée
    }
  }
  process.send(reponse, () => process.exit(0));
});
