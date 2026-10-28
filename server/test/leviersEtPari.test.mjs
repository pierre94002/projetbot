/**
 * La boucle de correction (étape 26 du plan, 27/10/2026) — T-PA1 : les 7 RÉGLAGES DE PARI ne changent aucune
 * probabilité du moteur ; c'est ce qui met dans une même lignée deux versions qui ne diffèrent que par eux (les
 * versions 4 et 5 de Pierre : vos bookmakers seuls). Calcul réel dans une copie isolée (aides/script-boucle-pari.mjs) :
 * 20 matchs de la base d'essai (12 avec cotes, 8 sans), SANS puis AVEC le modèle de buts unique de l'étape 27.
 * Partie B (28/10/2026) : T-PR3 (chaque levier ne change que ses marchés déclarés) et T-PR4 (le sens de ρ), par le vrai
 * moteur dans une autre copie (aides/script-boucle-leviers.mjs) ; T-PR2 (l'objet modeleDeButs entier) est dans
 * boucleCorrectionPropositions.test.mjs.
 *   node --test test/leviersEtPari.test.mjs        (depuis server/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, MANIFESTE_ECHANTILLON } from './aides/isolement.mjs';
import { REGLAGES_DE_PARI, LEVIERS } from '../src/data/correction/regles.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-boucle-pari.mjs');
const SCRIPT_LEVIERS = path.join(SERVEUR, 'test', 'aides', 'script-boucle-leviers.mjs');

let sortie = null;
function reel() {
  if (sortie) return sortie;
  const copie = preparerCopie({});
  try {
    const r = executer(copie, SCRIPT, { args: [MANIFESTE_ECHANTILLON], timeout: 600_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `sortie illisible : ${r.sortie.slice(-500)}`);
    sortie = r.json;
    return sortie;
  } finally {
    copie.nettoyer();
  }
}

test('T-PA1 : chacun des 7 réglages de pari (seuils de value, vos bookmakers, cote maximale, Kelly, mise maximale, garde-fou des buts attendus) laisse IDENTIQUES toutes les probabilités du moteur — distributions, attendus, cotes justes, 1N2, pronostics et leur distribution gelée —, avec et sans le modèle de buts unique', (t) => {
  const r = reel();
  assert.deepEqual(r.cles, [...REGLAGES_DE_PARI]);
  assert.equal(r.cibles.avecCotes, 12);
  assert.equal(r.cibles.sansCotes, 8);
  for (const [nom, x] of Object.entries(r.regimes)) {
    t.diagnostic(`${nom} : ${x.analyses} matchs, ${x.pronostics} pronostics, témoin changé sur ${x.temoinChange}`);
    assert.equal(x.analyses, 20, nom);
    assert.ok(x.pronostics >= 100, `${nom} : ${x.pronostics} pronostics`);
    for (const cle of REGLAGES_DE_PARI) {
      assert.deepEqual(x.differents[cle], [], `${nom} : ${cle} change une probabilité`);
      assert.equal(x.identiques[cle], 20, `${nom} : ${cle}`);
    }
  }
});

test('T-PA1, le témoin : la comparaison voit bien un changement de probabilité (defaultCorrelation sans le modèle de buts, rho avec) — sinon « identique » ne prouverait rien ; avec le modèle de buts, les distributions gelées portent leur régime', () => {
  const r = reel();
  assert.ok(r.regimes.ancienModele.temoinChange >= 5, `ancien modèle : ${r.regimes.ancienModele.temoinChange}`);
  assert.equal(r.regimes.modeleDeButs.temoinChange, 20);
  assert.equal(r.regimes.modeleDeButs.avecProvenance, 20, 'chaque match calculé par le modèle de buts gèle son régime');
  assert.equal(r.regimes.ancienModele.avecProvenance, 0);
});

test('les réglages de pari ne sont LUS que par la mise, la value, la cote minimale et le verdict d’un pari (staking.js, valueFinder.js, coteMinimale.js, verdictPari.js) — jamais par le calcul des probabilités', () => {
  const SRC = path.join(SERVEUR, 'src');
  const fichiers = fs.readdirSync(SRC, { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => String(f).split(path.sep).join('/'));
  const lire = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const moteur = fichiers.filter((f) => /^(core\/(engine|market|model|signals|xg)|sports)\//.test(f) && !/engineVersions|engineConfig|valueFinder|coteMinimale|verdictPari|vosBookmakers|tiltState/.test(f));
  for (const f of moteur) {
    const texte = lire(f);
    for (const cle of REGLAGES_DE_PARI) assert.doesNotMatch(texte, new RegExp(`\\b${cle}\\b`), `${f} lit ${cle}`);
  }
});

// ============================================================ partie B : T-PR3 et T-PR4

let leviers = null;
function lesLeviers() {
  if (leviers) return leviers;
  const copie = preparerCopie({});
  try {
    const r = executer(copie, SCRIPT_LEVIERS, { args: [MANIFESTE_ECHANTILLON], timeout: 600_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `sortie illisible : ${r.sortie.slice(-500)}`);
    leviers = r.json;
    return leviers;
  } finally {
    copie.nettoyer();
  }
}

test('T-PR3 : chaque levier du formulaire (une sous-clé du modèle de buts) ne change QUE les familles que sa correction déclare (les 4 familles de buts) et son témoin (le score exact) — jamais le 1N2, ni les corners, ni les tirs ; et chacun change bien quelque chose (dans son régime : avec plus/moins, 1N2 seul, ou partout)', (t) => {
  const r = lesLeviers();
  assert.deepEqual(r.matchs, { total: 20, avecCotes: 12, avecPlusMoins: 6 });
  assert.deepEqual(r.provenances, { 'cotes-plusmoins-xg': 6, 'cotes-1n2-xg': 6, 'xg-seuls': 8 }, 'les trois régimes du modèle de buts jouent');
  assert.deepEqual(Object.keys(r.leviers), Object.keys(LEVIERS));
  for (const [levier, x] of Object.entries(r.leviers)) {
    t.diagnostic(`${levier} : ${x.familles.join(', ')} sur ${x.matchsChanges} matchs`);
    const permises = new Set([...x.declares, ...x.temoins]);
    for (const f of x.familles) assert.ok(permises.has(f), `${levier} change « ${f} », qu’il ne déclare pas`);
    assert.ok(!x.familles.includes('result'), `${levier} : le 1N2 ne bouge pas`);
    assert.ok(x.matchsChanges >= 6, `${levier} : il change quelque chose (${x.matchsChanges} matchs)`);
    assert.deepEqual(x.declares, ['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal']);
  }
  for (const levier of ['modeleDeButs.melange.avecPlusMoins.wT', 'modeleDeButs.melange.avecPlusMoins.wS', 'modeleDeButs.melange.sans.wT', 'modeleDeButs.melange.sans.wS']) assert.equal(r.leviers[levier].matchsChanges, 6, `${levier} : dans son seul régime`);
});

test('T-PR4 : le sens de ρ — « les deux équipes marquent » annoncé trop haut : la règle propose ρ −0,05 → −0,02 et P(oui) BAISSE sur chaque match ; annoncé trop bas : ρ → −0,08 et P(oui) MONTE sur chaque match', () => {
  const r = lesLeviers().sensDeRho;
  assert.deepEqual([r.tropHaut.avant, r.tropHaut.apres, r.tropHaut.baisses, r.tropHaut.hausses], [-0.05, -0.02, 20, 0]);
  assert.deepEqual([r.tropBas.avant, r.tropBas.apres, r.tropBas.hausses, r.tropBas.baisses], [-0.05, -0.08, 20, 0]);
});
