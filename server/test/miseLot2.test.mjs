/**
 * LA MISE — LE LOT 2 (étape 39 « La mise juste ») : « à faire » au lot 1a (04/11/2026). Le branchement de la règle dans le
 * moteur attend le verdict de l'étape 27 (vers le 14-17/11), la question Q-J et l'accord de Pierre (conception §4).
 *   node --test test/miseLot2.test.mjs        (depuis server/)
 */
import { test } from 'node:test';

const AU_LOT_2 = 'lot 2 de l’étape 39 : après le verdict de l’étape 27, Q-J et l’accord de Pierre';

test('T-L2-0 core/engine/stakeSizing.js = data/mise/regleDeMise.js recopié à l’identité (sha1 du corps)', { todo: AU_LOT_2 }, () => {});
test('T-L2-1 P2 rejoué avec stakeSizing.js : identique à l’octet à la note de départ', { todo: AU_LOT_2 }, () => {});
test('T-L2-2 une nuit d’engine_picks rejouée avec les bases 1 000 et 50 000 : identique', { todo: AU_LOT_2 }, () => {});
test('T-L2-3 la mise ne lit aucun fichier (le capital, les attentes, le livre, le plancher passés par l’appelant)', { todo: AU_LOT_2 }, () => {});
test('T-L2-4 core/risk/staking.js absent ; la fixture historique engine-versions-27-en-essai.json intacte', { todo: AU_LOT_2 }, () => {});
test('T-L2-5 maxExpectedRateGap absent partout (engineConfig, engine-config.json, engineVersions, regles.js, l’écran)', { todo: AU_LOT_2 }, () => {});
test('T-PA1 un changement des seuls réglages de pari ne change aucune probabilité', { todo: AU_LOT_2 }, () => {});
