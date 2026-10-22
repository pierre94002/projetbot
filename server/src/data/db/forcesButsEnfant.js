/**
 * forcesButsEnfant.js — le calcul des FORCES DE BUTS dans un PROCESSUS À PART (étape 27 du plan, 21/10/2026).
 * Lancé par forcesButs.calculerAPart (fork, sérialisation « avancée ») ; ce n'est pas un script à lancer à la main
 * (pour cela : scripts/forces-buts.mjs).
 *
 * Reçoit { chemin, empreintes, precedente, force, graine } par le canal du processus parent, ouvre la base EN
 * LECTURE SEULE (jamais un second écrivain : c'est le serveur qui range), lit l'empreinte des rencontres — rien de
 * changé : { rien: true } —, sinon calcule tout, fait la différence avec la table rangée et le contrôle anti-fuite,
 * envoie les lignes à écrire par morceaux ({ morceau: Float64Array }), puis la fin ({ fin… } sans les lignes) ou
 * { erreur }, et s'arrête. La mémoire est rendue au système à la fin.
 */

import { DatabaseSync } from 'node:sqlite';
import { calculerLesForces } from './forcesButs.js';

process.once('message', ({ chemin, empreintes, precedente, force, graine }) => {
  let db = null;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    let rssMax = process.memoryUsage.rss();
    const travail = calculerLesForces({ database: db, empreintes: empreintes ?? [], precedente: precedente ?? null, force: Boolean(force), graine: graine ?? null });
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
