/**
 * valeurStatsEnfant.js — le calcul de la VALEUR DE CHAQUE STATISTIQUE dans un
 * PROCESSUS À PART (étape 18 du plan, 13/10/2026). Lancé par
 * valeurStatsAPart.calculerAPart (fork) ; ce n'est pas un script à lancer à la
 * main (pour cela : scripts/stat-value.mjs).
 *
 * POURQUOI : le calcul lit 1,7 million de lignes joueur et juge des centaines
 * de milliers de lignes appariées ; dans le serveur, même en rendant la main,
 * il ajouterait 400 à 650 Mo de mémoire pendant trois minutes (mesuré le
 * 13/10/2026 sur la base du bac), et le juge synchrone de l'étape 16 tiendrait
 * jusqu'à ~0,7 s d'un seul tenant. Ici, la mémoire est rendue au système à la
 * fin, et le serveur attend la réponse sans rien bloquer.
 *
 * Reçoit { chemin, options } par le canal du processus parent, ouvre la base
 * EN LECTURE SEULE (jamais un second écrivain : c'est le serveur qui range le
 * résultat), envoie son avancement ({ avancement }), puis { lignes, bilan } ou
 * { erreur }, et s'arrête.
 */

import { DatabaseSync } from 'node:sqlite';
import { calculerValeurDesStatistiques } from '../../bench/statValue.js';

process.once('message', async ({ chemin, options }) => {
  let db = null;
  let reponse;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    const r = await calculerValeurDesStatistiques({ database: db, options: options ?? {}, avancement: (a) => process.send({ avancement: a }) });
    reponse = { lignes: r.lignes, bilan: { ...r.bilan, aPart: { pid: process.pid, rssFinOctets: process.memoryUsage().rss } } };
  } catch (error) {
    reponse = { erreur: String(error?.message ?? error) };
  } finally {
    try {
      db?.close();
    } catch {
      // déjà fermée
    }
  }
  process.send(reponse, () => process.exit(0));
});
