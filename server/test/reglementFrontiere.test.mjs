/**
 * Le correctif du règlement (02/11/2026) ne touche pas l'essai 27 : T-G1.
 *   node --test test/reglementFrontiere.test.mjs        (depuis server/)
 *
 * Le carnet de paris est lu par la nuit de l'essai 27 (getTiltState : coupe-circuit, garde-fous). Le correctif règle des
 * paris plus tôt (à la 90e) : il peut donc enclencher plus tôt un garde-fou. Ce test prouve que cela ne change RIEN de ce
 * que l'essai enregistre. Deux copies isolées de la base d'essai (aides/script-reglement-frontiere.mjs), mêmes garde-fous
 * réglés, même heure figée : l'une avec un carnet vide, l'autre avec 60 € perdus cette semaine.
 *   1. Le témoin D'ABORD : le coupe-circuit est enclenché dans la seconde seulement, et la mise conseillée ou les verdicts
 *      d'une analyse DIFFÈRENT (sans cela, le test passerait à vide).
 *   2. Puis ce que la nuit ÉCRIT — les pronostics gelés (engine_picks) et les lignes à blanc d'une candidate d'essai
 *      (engine_candidate_picks) — est identique à l'octet, colonnes d'heure mises à part.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-reglement-frontiere.mjs');
const R = {};

function lancer(carnet) {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, SCRIPT, { args: [carnet], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, `${carnet} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-2000)}`);
    assert.ok(r.json?.ok, `${carnet} : sortie illisible\n${r.sortie.slice(-2000)}`);
    assert.equal(r.reseau, false, `${carnet} : un appel réseau a été tenté`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

before(() => {
  R.vide = lancer('vide');
  R.coupe = lancer('coupe-circuit');
});

test('T-G1 (témoin) : le carnet change bien le coupe-circuit, et la mise conseillée ou les verdicts d’une analyse', () => {
  assert.equal(R.vide.temoin.coupeCircuit, false, 'carnet vide : pas de coupe-circuit');
  assert.equal(R.coupe.temoin.coupeCircuit, true, '60 € perdus cette semaine pour 50 € permis : coupe-circuit');
  assert.equal(R.vide.temoin.analyse.code, 200);
  assert.equal(R.coupe.temoin.analyse.code, 200);
  assert.notDeepEqual(
    [R.vide.temoin.analyse.staking, R.vide.temoin.analyse.verdicts],
    [R.coupe.temoin.analyse.staking, R.coupe.temoin.analyse.verdicts],
    'le témoin : la mise conseillée ou les verdicts diffèrent'
  );
});

test('T-G1 : ce que la nuit de l’essai 27 écrit (gel, lignes à blanc) est identique à l’octet, quel que soit le carnet', () => {
  assert.ok(R.vide.ecrit.engine_picks.length > 0, 'des pronostics gelés');
  assert.ok(R.vide.ecrit.engine_candidate_picks.length > 0, 'des lignes à blanc');
  assert.deepEqual(R.coupe.colonnes, R.vide.colonnes);
  assert.deepEqual(R.coupe.ecrit.engine_picks, R.vide.ecrit.engine_picks);
  assert.deepEqual(R.coupe.ecrit.engine_candidate_picks, R.vide.ecrit.engine_candidate_picks);
  assert.equal(R.coupe.nuit.lignes, R.vide.nuit.lignes);
});
