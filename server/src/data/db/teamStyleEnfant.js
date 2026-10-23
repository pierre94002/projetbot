/**
 * teamStyleEnfant.js — le calcul des STYLES DE JEU dans un PROCESSUS À PART (étape 37 du plan, 22/10/2026). Lancé
 * par teamStyle.calculerAPart (fork, sérialisation « avancée ») ; ce n'est pas un script à lancer à la main (pour
 * cela : scripts/team-style.mjs).
 *
 * Reçoit { chemin, precedente, force, graine } par le canal du processus parent, ouvre la base EN LECTURE SEULE
 * (jamais un second écrivain : c'est le serveur qui range), relit les seules rencontres nouvelles ou changées (la
 * carte des tirs comprise), calcule les styles, la différence et le contrôle, envoie les lignes à écrire par morceaux
 * ({ morceau: { table, lignes } }), puis la fin (sans les lignes) ou { erreur }, et s'arrête.
 */

import { DatabaseSync } from 'node:sqlite';
import { calculerLesStyles, LIGNES_PAR_MORCEAU, TABLES_DU_CALCUL } from './teamStyle.js';

process.once('message', ({ chemin, precedente, force, graine }) => {
  let db = null;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    let rssMax = process.memoryUsage.rss();
    const travail = calculerLesStyles({ database: db, precedente: precedente ?? null, force: Boolean(force), graine: graine ?? null });
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
    for (const table of TABLES_DU_CALCUL) {
      const lignes = r[table].ecrire;
      for (let i = 0; i < lignes.length; i += LIGNES_PAR_MORCEAU) process.send({ morceau: { table, lignes: lignes.slice(i, i + LIGNES_PAR_MORCEAU) } });
    }
    const fin = { ...r, ...Object.fromEntries(TABLES_DU_CALCUL.map((t) => [t, { retirer: r[t].retirer, ecrire: [] }])) };
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
