/**
 * LA COMBINAISON — LE LOT 2 (étape 38), ÉCRITS D'AVANCE, « à faire » au lot 1 (conception §8.1) : ils deviendront de vrais
 * tests avec la candidate du lot 2, après le verdict de l'essai 27 et l'accord de Pierre. Aucun ne tourne au lot 1.
 *   node --test test/combinaisonLot2.test.mjs        (depuis server/)
 */
import { test } from 'node:test';

test('T-L2-1 l’identité après le retrait des vestiges : une nuit d’engine_picks rejouée sur une copie, distributions identiques à l’octet ; `referenceDifferente` du banc compté comme avant (runner.js lit weights.market)', { todo: 'lot 2 de l’étape 38 (après le verdict de la 27)' });
test('T-L2-2 aucun poids de la combinaison lu en base : les β vivent dans l’empreinte (poidsDeLaCombinaison.js recopié par script)', { todo: 'lot 2' });
test('T-L2-3 l’identifiant d’une candidate de famille n’est jamais celui d’un lancement', { todo: 'lot 2' });
test('T-L2-4 les vues « moteur » recopiées dans LANCEMENTS après l’adoption seulement', { todo: 'lot 2' });
test('T-L2-5 une candidate qui change le 1N2 et ne déclare que « result » est refusée par validerCandidate (critique, constat 2)', { todo: 'lot 2' });
test('T-PA1 un réglage de pari (seuil par classe) ne change aucune probabilité', { todo: 'lot 2' });
