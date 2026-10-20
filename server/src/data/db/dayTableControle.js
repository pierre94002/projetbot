/**
 * dayTableControle.js — le contrôle anti-fuite de la TABLE DU JOUR J dans un
 * PROCESSUS À PART (étape 17 du plan, 12/10/2026). Lancé par
 * dayTable.construireTableJourJ (fork) ; ce n'est pas un script à lancer à la
 * main (pour cela : scripts/build-day-table.mjs --controle N).
 *
 * POURQUOI : le contrôle recalcule des lignes tirées au hasard par les
 * lecteurs du moteur eux-mêmes (statInputsRead, scoreFormRead), qui tiennent
 * ~0,1 à 0,5 s par ligne sur la base de Pierre, et jusqu'à 6 s sur une base
 * froide (mesuré le 12/10/2026 juste après une reconstruction). Dans le
 * serveur, ce serait autant de secondes sans répondre ; ici, le serveur
 * attend la réponse sans rien bloquer.
 *
 * Reçoit { chemin, lignes, graine } par le canal du processus parent, ouvre
 * la base EN LECTURE SEULE (jamais un second écrivain), rend { lignes,
 * ecarts, verifiees, rssMaxOctets, dureeMs } ou { erreur }, puis s'arrête.
 */

import { DatabaseSync } from 'node:sqlite';
import { controleAntiFuite } from './dayTable.js';

process.once('message', ({ chemin, lignes, graine }) => {
  const debut = performance.now();
  let db = null;
  let reponse;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    const r = controleAntiFuite({ database: db, lignes, graine });
    reponse = { lignes: r.lignes, ecarts: r.ecarts, verifiees: r.verifiees, rssMaxOctets: process.memoryUsage().rss, dureeMs: Math.round(performance.now() - debut) };
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
