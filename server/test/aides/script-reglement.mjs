/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-reglement.mjs <serveur de la copie>
 *
 * Passe de règlement automatique (settlementService.settlePending, avec
 * écriture) sur les FAUX journaux que le test a posés dans le data/runtime de
 * la copie, contre la copie de la base d'essai ; puis une seconde passe, qui
 * ne doit plus rien régler. Sortie : une ligne JSON.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { resolveDbPath, openDb } = await imp('data/db/matchStatsDb.js');
const chemin = path.resolve(resolveDbPath());
if (chemin.toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error(`Base inattendue : ${chemin}`);

const { settlePending } = await imp('data/providers/settlementService.js');
const { listPredictions } = await imp('data/repositories/predictionsRepository.js');
const { listBets } = await imp('data/repositories/betsRepository.js');

const database = openDb();
const rapport = settlePending({ apply: true, database });
const second = settlePending({ apply: true, database });
console.log(JSON.stringify({ ok: true, rapport, second, predictions: listPredictions(), bets: listBets() }));
