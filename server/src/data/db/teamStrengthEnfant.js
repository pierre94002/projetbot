/**
 * teamStrengthEnfant.js — le calcul de L'INDICE DE FORCE DES ÉQUIPES dans un PROCESSUS À PART (étape 29 du
 * plan, 14/10/2026). Lancé par teamStrength.calculerAPart (fork, sérialisation « avancée ») ; ce n'est pas
 * un script à lancer à la main (pour cela : scripts/team-strength.mjs).
 *
 * POURQUOI : le rejeu relit les 60 000 rencontres de la table du jour J et résout, pour chaque championnat
 * et chaque jour de match, la correction des adversaires de treize statistiques ; dans le serveur, même en
 * rendant la main, il ajouterait des dizaines de Mo de mémoire et des secondes de calcul. Ici, la mémoire est
 * rendue au système à la fin, et le serveur attend la réponse sans rien bloquer.
 *
 * Reçoit { chemin, precedente, force, options } par le canal du processus parent, ouvre la base EN LECTURE
 * SEULE (jamais un second écrivain : c'est le serveur qui range), lit l'empreinte des rencontres — rien de
 * changé : { rien: true } —, sinon rejoue, envoie les lignes par morceaux ({ morceau: Int32Array }), puis la
 * fin ({ fin… } sans les lignes) ou { erreur }, et s'arrête.
 */

import { DatabaseSync } from 'node:sqlite';
import { calculerLesIndices } from './teamStrength.js';

process.once('message', ({ chemin, precedente, force, options }) => {
  let db = null;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    // Le calcul d'une traite (rien d'autre ne tourne ici), la mémoire relevée à chaque point d'arrêt.
    let rssMax = process.memoryUsage.rss();
    const travail = calculerLesIndices({ database: db, precedente: precedente ?? null, force: Boolean(force), options: options ?? {} });
    let etape = travail.next();
    while (!etape.done) {
      rssMax = Math.max(rssMax, process.memoryUsage.rss());
      etape = travail.next();
    }
    const r = etape.value;
    rssMax = Math.max(rssMax, process.memoryUsage.rss());
    try {
      db.close();
    } catch {
      // déjà fermée
    }
    db = null;
    if (r.rien) {
      process.send(r, () => process.exit(0));
      return;
    }
    for (const morceau of r.lignes) process.send({ morceau });
    const { lignes, ...fin } = r;
    process.send({ ...fin, bilan: { ...fin.bilan, aPart: { pid: process.pid, rssMaxOctets: rssMax, rssFinOctets: process.memoryUsage.rss() } } }, () => process.exit(0));
  } catch (error) {
    try {
      db?.close();
    } catch {
      // déjà fermée
    }
    process.send({ erreur: String(error?.message ?? error) }, () => process.exit(0));
  }
});
