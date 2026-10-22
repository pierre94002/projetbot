/**
 * playerRatingsEnfant.js — le calcul des FICHES DES JOUEURS dans un PROCESSUS À PART (étape 30 du plan,
 * 22/10/2026). Lancé par playerRatings.calculerAPart (fork, sérialisation « avancée ») ; ce n'est pas un script à
 * lancer à la main (pour cela : scripts/player-ratings.mjs).
 *
 * Reçoit { chemin, precedente, force, graine, depuis } par le canal du processus parent, ouvre la base EN LECTURE
 * SEULE (jamais un second écrivain : c'est le serveur qui range), lit l'empreinte de la table du jour J — rien de
 * changé : { rien: true } —, sinon rejoue tout, fait la différence avec les tables rangées, le contrôle anti-fuite
 * et la mesure à blanc depuis le lancement, envoie les lignes à écrire par morceaux ({ morceau: { table, lignes } }),
 * puis la fin (sans les lignes) ou { erreur }, et s'arrête. La mémoire est rendue au système à la fin.
 */

import { DatabaseSync } from 'node:sqlite';
import { calculerLesFiches, LIGNES_PAR_MORCEAU } from './playerRatings.js';
import { mesureABlanc } from './playerRatingsBanc.js';

process.once('message', ({ chemin, precedente, force, graine, depuis }) => {
  let db = null;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    let rssMax = process.memoryUsage.rss();
    const travail = calculerLesFiches({ database: db, precedente: precedente ?? null, force: Boolean(force), graine: graine ?? null, depuis: depuis ?? null, mesureABlanc });
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
    for (const table of ['fiches', 'equipes']) {
      const lignes = r[table].ecrire;
      for (let i = 0; i < lignes.length; i += LIGNES_PAR_MORCEAU) process.send({ morceau: { table, lignes: lignes.slice(i, i + LIGNES_PAR_MORCEAU) } });
    }
    const fin = { ...r, fiches: { retirer: r.fiches.retirer, ecrire: [] }, equipes: { retirer: r.equipes.retirer, ecrire: [] } };
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
