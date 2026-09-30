#!/usr/bin/env node
/**
 * audit-score-consistency.mjs
 * -----------------------------------------------------------------------
 * Relit les scores déjà enregistrés et vérifie qu'ils tiennent debout face
 * à ce qu'on sait par ailleurs du même match. Complément du garde-fou des
 * scripts de fusion : celui-là empêche qu'un score connu soit REMPLACÉ en
 * silence, mais ne peut rien contre une PREMIÈRE écriture déjà fausse.
 *
 * C'est exactement ce qui est arrivé à Cadiz - Girona du 19 septembre 2026,
 * enregistré 0-0 alors que le match s'était terminé 1-2. Aucun remplacement,
 * donc aucun conflit : la valeur était fausse dès le départ. Ce qui l'a
 * trahie, ce sont les statistiques du match — deux buteurs et deux gardiens
 * à 2 et 1 buts encaissés, sous un score annoncé vierge.
 *
 * Quatre contrôles, du plus révélateur au plus mécanique :
 *
 *   1. GARDIENS — les buts encaissés des gardiens d'une équipe doivent
 *      égaler le score de l'adversaire. C'est le contrôle qui détecte un
 *      score faux, parce que les deux chiffres viennent de sources
 *      différentes : le score d'une feuille de résultats, les encaissés
 *      d'une feuille de statistiques.
 *   2. BUTEURS — la somme des buts des joueurs d'une équipe ne peut pas
 *      dépasser son score. En dessous, un écart d'exactement 1 est normal :
 *      c'est un but contre son camp, crédité à aucun joueur. Un écart de 2
 *      ou plus est suspect et signalé.
 *   3. TROIS FICHIERS — match-stats, season-calendar et match-results
 *      doivent annoncer le même score pour le même match.
 *   4. CALENDRIER vs RÉSULTATS — même comparaison, étendue aux matchs qui
 *      n'ont pas de statistiques détaillées.
 *
 * Un contrôle qui ne peut pas s'appuyer sur une donnée absente ne dit rien :
 * pas de gardien renseigné, pas de contrôle 1. L'audit ne signale que ce
 * qu'il peut réellement contredire.
 *
 * Usage (depuis server/, tous les arguments sont optionnels) :
 *   node scripts/audit-score-consistency.mjs
 *   node scripts/audit-score-consistency.mjs [season-calendar.json] [match-results.json] [--since AAAA-MM-JJ]
 *
 * Sortie : le détail sur stderr, un résumé JSON sur stdout (même convention
 * que les scripts de fusion). Le code de sortie reste 0 même en cas
 * d'anomalie — c'est un rapport, pas une barrière ; lis `anomalies`.

 * La logique vit dans src/data/db/scoreAudit.js, que l'actualisation de
 * l'appli lance aussi chaque jour sur les trente derniers jours. La base est
 * ouverte en LECTURE SEULE : l'audit ne touche ni au schéma ni aux données.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { auditScores } from '../src/data/db/scoreAudit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const iSince = args.indexOf('--since');
const since = iSince >= 0 ? args[iSince + 1] : null;
const positionnels = args.filter((a, i) => a !== '--since' && !(iSince >= 0 && i === iSince + 1));
const calendarPath = positionnels[0] ?? path.resolve(__dirname, '../data/runtime/season-calendar.json');
const resultsPath = positionnels[1] ?? path.resolve(__dirname, '../data/runtime/match-results.json');

const database = new DatabaseSync(resolveDbPath(), { readOnly: true });
const bilan = auditScores({
  database,
  since,
  calendarPath,
  resultsPath,
  onAnomaly: (a) => console.error(`[${a.kind}] ${a.label} — ${a.detail}`)
});
// Une seule ligne JSON sur stdout, exemples d'anomalies compris : c'est ce
// que lit l'actualisation de l'appli, qui lance ce script à part pour ne
// pas bloquer le serveur pendant l'agrégation.
console.log(JSON.stringify(bilan));
