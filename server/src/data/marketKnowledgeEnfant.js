/**
 * marketKnowledgeEnfant.js — le calcul de CONNAÎTRE LE MARCHÉ dans un PROCESSUS À PART (étape 22 du plan,
 * 13/10/2026). Lancé par marketKnowledge.calculerAPart (fork) ; ce n'est pas un script à lancer à la main
 * (pour cela : scripts/market-knowledge.mjs).
 *
 * POURQUOI : le calcul relit toutes les cotes archivées (fd_history depuis 2000, odds_quotes) et juge
 * des centaines de milliers de lignes appariées ; dans le serveur, même en rendant la main, il ajouterait
 * des centaines de Mo de mémoire pendant deux minutes, et le juge synchrone de l'étape 16 tiendrait
 * jusqu'à une seconde d'un seul tenant — même l'empreinte des sources (des balayages de tables) tiendrait
 * le serveur une demi-seconde à froid. Ici, la mémoire est rendue au système à la fin, et le serveur
 * attend la réponse sans rien bloquer.
 *
 * Reçoit { chemin, options, empreintePrecedente } par le canal du processus parent, ouvre la base EN
 * LECTURE SEULE (jamais un second écrivain : c'est le serveur qui range le résultat), lit l'empreinte des
 * sources — inchangée : { rien: true, empreinte } —, sinon calcule, envoie son avancement ({ avancement }),
 * puis { lignes, resume, bilan, empreinte } ou { erreur }, et s'arrête.
 */

import { DatabaseSync } from 'node:sqlite';
import { calculerSiBesoin } from './marketKnowledge.js';

process.once('message', async ({ chemin, options, empreintePrecedente }) => {
  let db = null;
  let reponse;
  try {
    db = new DatabaseSync(chemin, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 15000;');
    const r = await calculerSiBesoin({ database: db, options: options ?? {}, empreintePrecedente: empreintePrecedente ?? null, avancement: (a) => process.send({ avancement: a }) });
    reponse = r.rien ? r : { lignes: r.lignes, resume: r.resume, empreinte: r.empreinte, bilan: { ...r.bilan, aPart: { pid: process.pid, rssFinOctets: process.memoryUsage().rss } } };
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
