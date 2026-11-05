/**
 * LA NUIT DE LA COMBINAISON FABRIQUÉE (étape 38, lot 1b) — ce n'est PAS un fichier de test : script-combinaison-nuit.mjs
 * lancé une fois par fichier de test, dans une copie isolée (base neuve, réseau coupé, heure figée), sa sortie gardée.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-combinaison-nuit.mjs');
let memo;
export function nuitFabriquee() {
  if (memo) return memo;
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, SCRIPT, { args: ['{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `nuit :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    memo = r.json;
    return memo;
  } finally {
    copie.nettoyer();
  }
}
