/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-simulation-pure.mjs <serveur de la copie>
 *
 * Étape 28 : la simulation d'un match, sa table jointe, ses marchés de déroulé et une petite fin de saison, calculés
 * dans la copie (réseau coupé, heure figée par CM_TEST_MAINTENANT). Sortie : une ligne JSON avec les empreintes
 * (sha1) de ce qui est calculé — test/simulationMatch.test.mjs lance ce script à deux heures différentes et compare
 * les octets entre eux et à l'appel direct.
 */

import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const SM = await imp('data/simulation/simulationMatch.js');
const R = await imp('data/simulation/reglages.js');
const S = await imp('data/simulation/saisons.js');
const { grilleDesButs } = await imp('core/engine/goalModel.js');
const sha1 = (x) => crypto.createHash('sha1').update(x).digest('hex');

const g = grilleDesButs(1.37, 1.21, -0.05);
const ch = SM.simulerMatch({ lambda: 1.37, mu: 1.21, grille: g, params: R.PARAMS, n: 3000, seed: SM.graineDuMatch({ cle: 'isole', role: 'candidate', lambda: 1.37, mu: 1.21, rho: -0.05 }) });
const ligne = (id, rank, points) => ({ teamId: `fotmob-${id}`, teamName: `Club ${id}`, rank, played: 2, points, goalsFor: 3, goalsAgainst: 2, goalDiff: 1, description: rank === 1 ? 'Champions League' : rank === 4 ? 'Relegation' : null, home: { played: 1, goalsFor: 2 }, away: { played: 1, goalsFor: 1 } });
const rows = [ligne(1, 1, 6), ligne(2, 2, 4), ligne(3, 3, 1), ligne(4, 4, 0)];
const r = S.restants({ table: { clubs: rows.map((x) => ({ id: S.idFotMob(x.teamId), played: 2 })), tables: 1, journees: 6 }, joues: ['1|2', '3|4', '2|3', '4|1'], calendrier: [], k: 2, jourD: '2026-10-05' });
const saison = S.simulerSaison({ table: { tables: [{ name: 'Essai', rows }] }, restants: r.liste, loi: S.loiTable(rows), n: 2000, seed: 28, rencontresAEnjeu: [0, 1] });
console.log(JSON.stringify({ ok: true, empreintes: { table: sha1(SM.tableJointe(ch)), marches: sha1(JSON.stringify(SM.marchesDesChemins(ch))), saison: sha1(JSON.stringify(saison)) } }));
