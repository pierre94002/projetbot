/**
 * Les ~200 pronostics figés (étape 3 du plan).
 *   node --test test/pronostics-figes.test.mjs        (depuis server/)
 *
 * Recalcule, avec le code ACTUEL du moteur, le pronostic de chaque match
 * cible de la base d'essai (copie isolée, réseau coupé, heure figée — cf.
 * test/aides/pronostics.mjs) et le compare, champ par champ et marché par
 * marché, à test/fixtures/pronostics-figes.json. Toute différence est
 * signalée avec le match et le marché concernés.
 *
 * Ce test N'ÉCRIT JAMAIS le fichier figé. Si la différence est voulue (moteur
 * changé exprès), on refige à la main : node scripts/test-figer.mjs --refiger
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculerPronostics, comparer, decrire, lireFiges, FICHIER_FIGES } from './aides/pronostics.mjs';
import { ECHANTILLON, MAINTENANT_FIGE, sha1Fichier } from './aides/isolement.mjs';

test('pronostics figés : le moteur donne exactement les mêmes pronostics sur la base d\'essai', () => {
  const figes = lireFiges();
  assert.ok(figes, `Aucun pronostic figé (${FICHIER_FIGES}) : node scripts/test-figer.mjs --refiger`);
  assert.equal(
    figes.echantillon?.sha1,
    sha1Fichier(ECHANTILLON),
    "La base d'essai a changé depuis le figeage : refiger VOLONTAIREMENT (node scripts/test-figer.mjs --refiger) après avoir vérifié pourquoi."
  );
  const avant = fs.statSync(FICHIER_FIGES);
  const calcul = calculerPronostics();
  assert.equal(calcul.reseau, false, 'aucun appel réseau pendant le calcul');
  assert.equal(calcul.maintenant, MAINTENANT_FIGE, 'heure figée');
  const diffs = comparer(figes.pronostics, calcul.resultats);
  assert.equal(diffs.length, 0, `Le moteur ne donne plus les pronostics figés.\n${decrire(diffs)}\nSi c'est voulu : node scripts/test-figer.mjs --refiger`);
  // Le test lit, il n'écrit pas.
  const apres = fs.statSync(FICHIER_FIGES);
  assert.equal(apres.mtimeMs, avant.mtimeMs);
  assert.equal(apres.size, avant.size);
});

test('pronostics figés : ce qui est figé couvre les cas voulus', () => {
  const { pronostics } = lireFiges();
  assert.ok(pronostics.length >= 190 && pronostics.length <= 230, `${pronostics.length} matchs`);
  assert.ok(new Set(pronostics.map((p) => p.league)).size >= 12, 'plusieurs compétitions');
  const sur = (source) => pronostics.filter((p) => p.resultat.source === source).length;
  assert.ok(sur('cotes') >= 100, 'résultats tirés des cotes');
  assert.ok(sur('statistiques') >= 20, 'résultats sans cote (modèle de buts tempéré)');
  assert.ok(pronostics.filter((p) => p.stats).length >= 150, 'corners et tirs attendus');
  assert.ok(pronostics.filter((p) => p.score).length >= 190, 'pronostic du score');
  const ids = new Set(pronostics.flatMap((p) => p.marches.map((m) => m.id)));
  for (const id of ['result', 'totalGoals', 'bothTeamsScore', 'resultAndTotal', 'teamGoals', 'totalCorners', 'teamCorners', 'totalShots', 'teamShots', 'totalShotsOnTarget', 'teamShotsOnTarget']) {
    assert.ok(ids.has(id), `marché ${id} absent des pronostics figés`);
  }
  for (const p of pronostics) {
    if (p.resultat.p) assert.ok(Math.abs(p.resultat.p.reduce((s, x) => s + x, 0) - 1) <= 0.0002, `${p.cle} : 1N2 ≠ 100 %`);
    for (const m of p.marches) assert.ok(m.cote >= 1.2, `${p.cle} ${m.id} : cote ${m.cote} sous 1,20`);
  }
});
