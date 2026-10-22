/**
 * Étape 27 du plan — LA CLÉ ÉTEINTE NE CHANGE RIEN (conception §3.7, première couche de la preuve).
 *   node --test test/moteurCleEteinte.test.mjs        (depuis server/)
 *
 * Avant de toucher au moteur, le résultat ENTIER de analyzeMatch a été figé avec l'ancien code
 * (node scripts/test-figer.mjs --complet → test/fixtures/moteur-complet-figes.json) : l'empreinte sha1 du JSON
 * normalisé (sans engineVersion ni comparateur.calculeLe) de chacune des ~200 cibles de la base d'essai, et le
 * JSON entier de cinq. Ici, le moteur ACTUEL recalcule chaque cible (copie isolée, réseau coupé, heure figée) avec
 * les réglages en service — SANS la clé `modeleDeButs` —, pour quatre variantes d'entrée : le chemin de l'appli,
 * `entreesButs` posée nulle, `entreesButs` posée remplie (comme le banc), `modeleDeButs: null`. Chacune doit
 * redonner l'empreinte figée, à l'octet : aucune ligne nouvelle du modèle de buts ne s'exécute sans la clé, et
 * rien ne s'ajoute aux sorties (ni provenance, ni modeleDeButs, ni distributions.scoreExact).
 *
 * Ce test N'ÉCRIT JAMAIS le fichier figé.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculerMoteurComplet, lireComplet, ecartsDuComplet, FICHIER_COMPLET } from './aides/pronostics.mjs';
import { ECHANTILLON, MAINTENANT_FIGE, sha1Fichier } from './aides/isolement.mjs';

const court = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

/** Les clés qu'un JSON contient, à toute profondeur. */
function cles(v, out = new Set()) {
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      out.add(k);
      cles(x, out);
    }
  }
  return out;
}

test('clé éteinte : le moteur actuel redonne, à l’octet, le résultat entier figé avec l’ancien code — chaque cible, quatre variantes d’entrée (appli, entreesButs nulle, entreesButs remplie, modeleDeButs: null)', () => {
  const figes = lireComplet();
  assert.ok(figes, `Aucun résultat entier figé (${FICHIER_COMPLET}) : node scripts/test-figer.mjs --complet (AVANT de toucher au moteur)`);
  assert.equal(figes.echantillon?.sha1, sha1Fichier(ECHANTILLON), "La base d'essai a changé depuis le figeage du résultat entier.");
  const avant = fs.statSync(FICHIER_COMPLET);
  const calcul = calculerMoteurComplet();
  assert.equal(calcul.reseau, false, 'aucun appel réseau');
  assert.equal(calcul.maintenant, MAINTENANT_FIGE, 'heure figée');
  const ecarts = ecartsDuComplet(figes, calcul.complets);
  assert.equal(
    ecarts.length,
    0,
    `Sans la clé modeleDeButs, le moteur ne redonne plus le résultat figé : ${ecarts.length} écart(s)\n${ecarts.slice(0, 30).map((e) => `  - ${e.cle} · ${e.quoi} : ${court(e.avant)} → ${court(e.apres)}`).join('\n')}`
  );
  for (const c of calcul.complets) assert.deepEqual(Object.keys(c.variantes).sort(), ['brut', 'cleNulle', 'entreesButsNulle', 'entreesButsPosee'], `${c.cle} : les quatre variantes`);
  // Les distributions gelées avec chaque pronostic (gelPronostics, markets.distributionDuMarche) : jamais de provenance sans la clé.
  const gelees = calcul.complets.filter((c) => c.gelAvecProvenance !== false);
  assert.deepEqual(gelees.map((c) => c.cle), [], 'une provenance dans une distribution gelée sans la clé modeleDeButs');
  // Rien d'ajouté aux sorties : ni le résumé du modèle, ni sa provenance, ni le score exact des distributions.
  const gardes = calcul.complets.filter((c) => c.json);
  assert.ok(gardes.length >= 5, 'cinq résultats gardés en entier');
  for (const c of gardes) {
    const k = cles(c.json);
    for (const interdite of ['modeleDeButs', 'provenance', 'scoreExact', 'autreScore', 'grille']) assert.equal(k.has(interdite), false, `${c.cle} : « ${interdite} » dans la sortie sans la clé`);
  }
  // Le test lit, il n'écrit pas.
  const apres = fs.statSync(FICHIER_COMPLET);
  assert.equal(apres.mtimeMs, avant.mtimeMs);
  assert.equal(apres.size, avant.size);
});

test('clé éteinte : ce qui est figé couvre les cas voulus — matchs à cotes et sans cote, coupes, plusieurs championnats ; figé avec l’ANCIEN code (avant la première retouche du moteur de l’étape 27)', () => {
  const figes = lireComplet();
  assert.ok(figes.complets.length >= 190 && figes.complets.length <= 230, `${figes.complets.length} cibles`);
  assert.ok(figes.complets.filter((c) => c.avecCotes).length >= 100, 'matchs à cotes');
  assert.ok(figes.complets.filter((c) => !c.avecCotes).length >= 20, 'matchs sans cote');
  assert.ok(figes.complets.filter((c) => c.json).length >= 5, 'JSON entier de cinq cibles');
  for (const c of figes.complets) assert.match(c.sha1, /^[0-9a-f]{40}$/);
  // Les cinq gardées en entier : sans aucune trace du modèle de buts unique.
  for (const c of figes.complets.filter((x) => x.json)) assert.equal(JSON.stringify(c.json).includes('modeleDeButs'), false);
  assert.ok(Date.parse(figes.figeLe) < Date.parse('2026-10-21T11:30:00Z'), `figé le ${figes.figeLe} : avant la première retouche du moteur (21/10, fin de matinée)`);
});
