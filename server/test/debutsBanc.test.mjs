/**
 * LE BANC DES DÉBUTS DE SAISON (étape 35, lot 1a, partie B, 09/11/2026), sur des MONDES TIRÉS AU HASARD (aides/debutsMondes.mjs,
 * petits pour la vitesse : la mesure à taille réelle, 50 graines, vit dans les fixtures) et sur des sorties fabriquées :
 *   T-B1  un monde où les forces sautent fort à la trêve (ρ 0,5) → rappel « retenu », d > 0 ; sans saut (ρ 1) → « pas prouvé » ;
 *   T-B2  un effet de promu planté fort → « retenu » à football-data ; sans effet (nul pur) → jamais « retenu » ;
 *   T-B2bis football-data fabriqué SANS effet de promu : la forme retenue (FORME_FD) ne sort jamais « retenu » ; la mesure à
 *         taille réelle (50 + 50 graines, fixture) applique la règle écrite avant (> 5 % → le commun des remis à zéro seul) ;
 *   T-B3  les contrôles sous un effet nul : jamais « retenu » ; le faux promu ne remet RIEN à zéro et a la taille comptée ;
 *   T-B4  K = VARIANTES_DE_L_ETAPE_35.length = 11 ; une variante non déclarée refusée ; z = 2,8376 ;
 *   T-B5  la perte du score exact, les 13 témoins et FNV-1a = ceux de la 32, à l'octet (1 000 cas, au-delà de 20 buts) ;
 *   T-B6  chaque ligne du magasin jugée avec ce qui est appris sur l'AUTRE pli ; P2 avec P1 seulement ; rien de la mise en
 *         route ; rien après le 23/09/2026 (le juge lève) ; rien de P2 dans l'apprentissage (lève) ;
 *   T-B7  noteDesDebuts.js refaite à l'octet depuis la sortie gardée du passage unique (test/fixtures/banc-debuts-etape35.json)
 *         et les règles scellées (banc-regles-etape35.md) ; les contrôles « pas prouvé », aucun banc faux, les statuts, la
 *         limite de la forme retenue dite ; null → « pas encore mesuré » partout ;
 *   T-B8  l'ampleur se calcule sans les résultats des matchs jugés (scores changés : même ampleur) ;
 *   T-B9  --comptes ne calcule aucune perte ni aucun réglage : comptesDesDebuts.js n'importe pas le banc, ses sorties n'en ont pas ;
 *   T-B10 le script : K, règles par sha1, modules scellés, verrou posé avant de lire, passe attendue, sortie jamais écrasée,
 *         second passage refusé sans raison ; --note-nulle (refusée sur une note qui porte un passage ; sur une note nulle,
 *         réécrite à l'octet — dans la copie, jamais la note du bac) ;
 *   T-B11 les deux bras recalés sur le MÊME ensemble (chacun ses niveaux) ; la même moyenne de ligue ;
 *   T-B12 réglages neutres → le bras B prend le chemin du bras A : gain exactement 0 ;
 *   T-B13 « avec cotes » jamais calculé ; « 1N2 seul » rapporté, jamais jugé ; un match sans 1N2 hors de ses lignes ;
 *   T-B14 la règle « utile » par fenêtre : « moins bon » ailleurs → pas utile ; contrôle retenu → banc faux SUR SA fenêtre ;
 *         moins de 200 matchs → pas utile ; la force de l'effectif : toujours « prudent » ;
 *   T-B15 les valeurs finales apprises sur A ∪ B ; l'horizon de la preuve suit la formule du §5.10 ;
 *   T-B16 la force de l'effectif STANDARDISÉE (x d'écart-type 1 sur A ∪ B), a priori 0,05 sur le coefficient standardisé ;
 *   T-B17 le k0 du commun fd appris sur P1 SEULEMENT, le même dans les deux bras ;
 *   T-B18 les contrôles des comptes corrigés avant le regard (09/11) : le faux point compté sur les saisons dont le jour est
 *         lu ; une division-saison football-data vérifiée à part, seulement avec EXACTEMENT ses numéros ;
 *   T-B19 la fin du processus à part (le correctif des coupes du 09/11/2026) : le script attend « close », jamais « exit »
 *         (sous Windows, « exit » peut arriver avant le dernier message) ; une grosse réponse suivie d'un arrêt immédiat
 *         arrive entière ; un processus à part muet est refusé « sans réponse », avec son code.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { mondeDesDebuts, effectifDuMonde } from './aides/debutsMondes.mjs';
import { passeDesDebuts, seuilDuFauxPromuDe, ecartTypeDeLEffectif, marquerLesRecords } from '../src/data/debutsDeSaison/passeDesDebuts.js';
import * as B from '../src/data/debutsDeSaison/bancDesDebuts.js';
import * as F from '../src/data/debutsDeSaison/formulesDebuts.js';
import * as C32 from '../src/data/contexte/bancDuContexte.js';
import { comptesDUnePasse, controlesDesComptes } from '../src/data/debutsDeSaison/comptesDesDebuts.js';
import { PERIODES_DU_BANC, FORME_FD, PRIOR_EFFECTIF, NIVEAUX, NIVEAUX_FD } from '../src/data/debutsDeSaison/reglagesDebuts.js';
import { DEBUTS_AU_BANC } from '../src/data/debutsDeSaison/noteDesDebuts.js';
import { VARIANTES_DE_L_ETAPE_35 } from '../src/bench/lancements.js';
import { zPour } from '../src/bench/guard.js';
import { grilleDesButs } from '../src/core/engine/goalModel.js';
import { executerSansPause } from '../src/utils/travailCooperatif.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const M5 = { pa: -0.14, pd: 0.07, ra: 0.07, rd: -0.1 };
const ZERO = { pa: 0, pd: 0, ra: 0, rd: 0 };

/** Le banc sur un monde : la passe avec résultats, le seuil du faux promu, l'écart-type des Δ, puis le juge (200 tirages). */
function bancDuMonde(monde, { fd = false, variantes, formeFd = FORME_FD, effectif = false, tirages = 200 }) {
  const passe = executerSansPause(passeDesDebuts({ rencontres: monde.rencontres, avecForces: true, fd, effectifAuJourJ: effectif ? effectifDuMonde(monde) : null }));
  const seuil = seuilDuFauxPromuDe(passe.comptes.clubsSaisons, fd ? ['P1', 'P2'] : ['A', 'B']);
  const ecartType = effectif ? ecartTypeDeLEffectif(passe.records) : null;
  marquerLesRecords(passe.records, { seuilFauxPromu: seuil.seuil, ecartType });
  return { passe, seuil, ecartType, banc: B.jugerLesVariantes(passe.records, { variantes, formeFd, tirages }) };
}
const verdict = (b, id) => b.banc.variantes.find((v) => v.id === id);

test('T-B1 un saut fort à la trêve → le rappel « retenu » (d > 0) ; sans saut → « pas prouvé »', () => {
  const fort = bancDuMonde(mondeDesDebuts({ type: 'magasin', graine: 11, petit: true, rho: 0.5, promo: ZERO }), { variantes: ['magasin-rappel-sans-cote'] });
  const v = verdict(fort, 'magasin-rappel-sans-cote');
  assert.equal(v.verdict, 'retenu', JSON.stringify({ z: v.zObserve, appris: v.appris.map((a) => a.appris) }));
  for (const a of v.appris) assert.ok(a.appris.d >= 8, `d appris ${a.appris.d}`);
  const nul = bancDuMonde(mondeDesDebuts({ type: 'magasin', graine: 12, petit: true, rho: 1, promo: ZERO }), { variantes: ['magasin-rappel-sans-cote'] });
  const w = verdict(nul, 'magasin-rappel-sans-cote');
  assert.notEqual(w.verdict, 'retenu');
  for (const a of w.appris) assert.ok(a.appris.d <= 4, `d appris ${a.appris.d}`);
});

const MONDE_FD = (graine, o) => mondeDesDebuts({ type: 'fd', graine, petit: true, saisons: 12, ...o });

test('T-B2 un effet de promu planté fort → « retenu » à football-data ; le nul pur → jamais « retenu »', () => {
  const fort = bancDuMonde(MONDE_FD(21, { rho: 0.95, promo: { pa: -0.35, pd: 0.2, ra: 0.2, rd: -0.25 } }), { fd: true, variantes: ['fd-promus-sans-cote'] });
  assert.equal(verdict(fort, 'fd-promus-sans-cote').verdict, 'retenu', JSON.stringify(verdict(fort, 'fd-promus-sans-cote').appris));
  for (let g = 1; g <= 4; g++) {
    const nul = bancDuMonde(MONDE_FD(2200 + g, { rho: 1, promo: ZERO, couplage: 0 }), { fd: true, variantes: ['fd-promus-sans-cote', 'fd-nouveaux-sans-cote'] });
    for (const id of ['fd-promus-sans-cote', 'fd-nouveaux-sans-cote']) assert.notEqual(verdict(nul, id).verdict, 'retenu', `graine ${g} ${id}`);
  }
  // les nouveaux venus PRENNENT les centres des promus du même pli (jamais appris sur eux-mêmes) : bras A = leur commun c0,
  // bras B = leur dirigé θ, tels quels
  const ctx = { k0: null, promus: { c0: [0.11, -0.07], theta: [-0.23, 0.17] } };
  const Ln = fort.passe.records.filter((r) => r.ens.nouveaux && r.buts && r.ligue && r.fenetre === 'P1');
  assert.ok(Ln.length > 0, 'des nouveaux venus à apprendre');
  const mn = B.apprendreLaVariante('fd-nouveaux-sans-cote', Ln, ctx);
  assert.equal(mn.A.sorte, 'nouveauxCommun');
  assert.deepEqual(mn.A.v.c0, ctx.promus.c0, 'bras A : le c0 des promus');
  assert.equal(mn.B.sorte, 'nouveauxDirige');
  assert.deepEqual(mn.B.v.theta, ctx.promus.theta, 'bras B : le θ des promus');
  assert.deepEqual(mn.appris, ctx.promus);
});

test('T-B2bis football-data fabriqué SANS effet de promu : la forme retenue jamais « retenu » ; la mesure de 50 graines applique la règle écrite avant', () => {
  for (let g = 1; g <= 4; g++) {
    const nul = bancDuMonde(MONDE_FD(2300 + g, { rho: 1, promo: ZERO }), { fd: true, variantes: ['fd-promus-sans-cote', 'fd-nouveaux-sans-cote', 'fd-placebo-faux-promu'] });
    for (const v of nul.banc.variantes) assert.notEqual(v.verdict, 'retenu', `graine ${g} ${v.id} z ${v.zObserve}`);
    if (g > 1) continue;
    // la forme mesurée : bras A des promus = le COMMUN des remis à zéro (critique, constat 4 : jamais la candidate seule),
    // bras B = le dirigé ; tous deux remis à zéro au 1er match, avec ce qu'ils ont appris
    const Lp = nul.passe.records.filter((r) => r.ens.promus && r.buts && r.ligue && r.fenetre === 'P1');
    const mp = B.apprendreLaVariante('fd-promus-sans-cote', Lp, { k0: null });
    assert.deepEqual([mp.A.sorte, mp.B.sorte, mp.A.remise, mp.B.remise], ['commun', 'dirige', true, true]);
    assert.deepEqual([mp.A.v.c0, mp.B.v.theta], [mp.appris.c0, mp.appris.theta]);
  }
  const mesure = JSON.parse(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 't-b2bis-etape35.json'), 'utf8'));
  assert.equal(mesure.graines, 50);
  const taux = (m) => Math.max(m.bilan['k0-commun']['fd-promus-sans-cote'].retenu, m.bilan['k0-commun']['fd-nouveaux-sans-cote'].retenu);
  const attendu = mesure.mondes.some((m) => taux(m) > 0.05) ? 'remis-a-zero-seul' : 'k0-commun';
  assert.equal(FORME_FD, attendu, 'FORME_FD = la règle écrite avant appliquée à la mesure');
  assert.equal(mesure.decision, FORME_FD);
});

test('T-B3 les contrôles sous un effet nul : jamais « retenu » ; le faux promu ne remet rien à zéro et a la taille comptée', () => {
  const mondes = [mondeDesDebuts({ type: 'magasin', graine: 31, petit: true, rho: 0.9, promo: ZERO, rEff: 0 }), mondeDesDebuts({ type: 'magasin', graine: 32, petit: true, rho: 1, promo: ZERO, rEff: 0 })];
  for (const m of mondes) {
    const b = bancDuMonde(m, { variantes: ['magasin-placebo-fausse-rentree', 'magasin-placebo-faux-promu', 'magasin-placebo-faux-effectif'], effectif: true });
    for (const v of b.banc.variantes) assert.notEqual(v.verdict, 'retenu', `${v.id} z ${v.zObserve}`);
    // la taille du faux promu : le seuil compté (promus et relégués ÷ débuts), à 30 % près sur un petit monde
    const fauxPromus = new Set(b.passe.records.flatMap((r) => [r.h, r.a]).filter((c) => c.fauxPromu && ['A', 'B'].includes(b.passe.comptes.clubsSaisons.get(`${c.club}|${c.saison}|${''}`)?.fenetre ?? 'A')).map((c) => `${c.club}|${c.saison}`));
    assert.ok(fauxPromus.size > 0.5 * b.seuil.mouvements && fauxPromus.size < 1.6 * b.seuil.mouvements, `${fauxPromus.size} faux promus pour ${b.seuil.mouvements} vrais`);
  }
  // le faux promu ne remet RIEN à zéro : son bras lit ses sommes telles quelles (seuls les clubs qui changent de championnat sont remis) ;
  // des sommes loin de la moyenne (une remise ramènerait ses forces à 1 : la campagne l'a montré avec des sommes neutres)
  const debut = { valide: true, statut: 'debut', remise: false, fauxPromu: true, rang: 1, sommes: { tot: Float64Array.from([26, 20, 15, 21, 25, 20, 14, 22]), sai: new Float64Array(8), n: 20, nx: 20 } };
  const autre = { valide: true, statut: 'debut', remise: false, fauxPromu: false, rang: 1, sommes: { tot: Float64Array.from([10, 12, 10, 12, 10, 12, 10, 12]), sai: new Float64Array(8), n: 20, nx: 20 } };
  const ligue = { buts: { home: 1.4, away: 1.1 }, xg: { home: 1.4, away: 1.1 } };
  const A = B.attendusDuBras({ h: debut, a: autre, ligue }, B.bras('fauxPromu', { c0: [0, 0], m: null }, { remise: true }));
  const cand = B.attendusDuBras({ h: debut, a: autre, ligue }, B.bras('candidate'));
  assert.deepEqual(A, cand, 'pas de remise pour un club qui reste dans son championnat');
  const Bm = B.attendusDuBras({ h: debut, a: autre, ligue }, B.bras('fauxPromu', { c0: [0, 0], m: [-0.2, 0] }, { remise: true }));
  assert.ok(Math.abs(Bm.lambda / A.lambda - Math.exp(-0.2)) < 1e-12, 'au 1er match de la saison (W_saison = 0) : le déplacement entier');
});

test('T-B4 K = 11 = VARIANTES_DE_L_ETAPE_35.length ; une variante non déclarée refusée ; z = 2,8376', () => {
  assert.equal(VARIANTES_DE_L_ETAPE_35.length, 11);
  assert.equal(B.VARIANTES_JUGEES.length, 10, 'la fiche retenue est comptée, jamais jugée');
  assert.deepEqual(Object.keys(B.FORMES).sort(), [...B.VARIANTES_JUGEES].sort());
  assert.ok(Math.abs(zPour(0.05, 11) - 2.8376) < 1e-4);
  assert.throws(() => B.jugerLesVariantes([], { K: 10 }), /K \(10\) doit valoir/);
  assert.throws(() => B.jugerLesVariantes([], { variantes: ['magasin-continuite-sans-cote'] }), /n'est pas déclarée/);
  assert.throws(() => B.jugerLesVariantes([], { variantes: ['debuts-de-saison-v1'] }), /n'a pas de forme/);
});

test('T-B5 la perte du score exact, les 13 témoins et FNV-1a = ceux de la 32, à l’octet', () => {
  let n = 0;
  for (let i = 0; i < 1000; i++) {
    const l = 0.2 + (i % 37) * 0.15;
    const m = 0.2 + (i % 23) * 0.2;
    const g = grilleDesButs(l, m, -0.05);
    const buts = { dom: i % 25, ext: (i * 7) % 23 };
    assert.equal(F.perteDuScore(g, buts), C32.perteDuScore(g, buts));
    if (i % 10 === 0) assert.deepEqual(F.probabilitesTemoins(g), C32.probabilitesTemoins(g));
    assert.deepEqual(F.issuesTemoins(buts), C32.issuesTemoins(buts));
    assert.equal(F.fnv1a(`club:${i}:p`), C32.fnv1a(`club:${i}:p`));
    n += 1;
  }
  assert.equal(n, 1000);
  assert.equal(F.perteDuScore(grilleDesButs(1, 1, -0.05), { dom: 21, ext: 0 }), -Math.log(1e-6), 'au-delà de 20 buts : le plancher');
  assert.deepEqual([...F.MARCHES_TEMOINS], [...C32.MARCHES_TEMOINS]);
});

test('T-B6 chaque ligne jugée avec ce qui est appris sur l’AUTRE pli ; P2 avec P1 seulement ; rien après le 23/09/2026 ; rien de P2 dans l’apprentissage', () => {
  const b = bancDuMonde(mondeDesDebuts({ type: 'magasin', graine: 61, petit: true, rho: 0.8 }), { variantes: ['magasin-rappel-sans-cote', 'magasin-promus-sans-cote'] });
  for (const v of b.banc.variantes) {
    for (const a of v.appris) assert.ok(a.apprisSur.a < a.jugeSur.de || a.jugeSur.a < a.apprisSur.de, `${v.id} pli ${a.pli} : appris et jugé disjoints`);
    assert.deepEqual(v.appris.map((a) => [a.apprisSur.de, a.jugeSur.de]), [['2023-07-01', '2025-07-01'], ['2025-07-01', '2023-07-01']]);
  }
  const fd = bancDuMonde(MONDE_FD(62, { rho: 0.9 }), { fd: true, variantes: ['fd-promus-sans-cote'] });
  assert.deepEqual(fd.banc.variantes[0].appris.map((a) => [a.apprisSur.de, a.apprisSur.a, a.jugeSur.de, a.jugeSur.a]), [['2005-07-01', '2019-06-30', '2019-07-01', '2023-06-30']]);
  assert.ok(b.passe.records.every((r) => r.fenetre !== 'miseEnRoute'), 'rien de la mise en route');
  const tard = { ...b.passe.records.find((r) => r.fenetre === 'B'), date: '2026-09-24', cle: 'tard' };
  assert.throws(() => B.jugerLesVariantes([...b.passe.records, tard], { variantes: ['magasin-rappel-sans-cote'], tirages: 100 }), /après le dernier jour lu/);
  const p2Appris = { ...PERIODES_DU_BANC, fd: { ...PERIODES_DU_BANC.fd, apprendre: { de: '2005-07-01', a: '2020-06-30' } } };
  assert.throws(() => B.jugerLesVariantes(b.passe.records, { variantes: ['magasin-rappel-sans-cote'], periodes: p2Appris, tirages: 100 }), /P2 dans l’apprentissage/);
});

test('T-B7 noteDesDebuts.js = la note refaite à l’octet depuis la sortie gardée du passage unique et les règles scellées ; null → « pas encore mesuré »', () => {
  const fixtures = path.join(SERVEUR, 'test', 'fixtures');
  const sortie = fs.readFileSync(path.join(fixtures, 'banc-debuts-etape35.json'));
  const regles = fs.readFileSync(path.join(fixtures, 'banc-regles-etape35.md'));
  assert.equal(sha1(regles), '49364bc1db9793a5c2bf3b8bd8f06668186df9e6', 'les règles scellées le 09/11/2026 (temps 2)');
  const json = JSON.parse(sortie.toString('utf8'));
  assert.equal(json.regles.sha1, sha1(regles), 'la sortie cite les règles scellées');
  assert.equal(json.premierRegard, '2026-11-09T19:17:49.765Z', 'le passage unique (l’heure du verrou)');
  const note = B.aRecopier(json, { sortie: { fichier: 'test/fixtures/banc-debuts-etape35.json', sha1: sha1(sortie) } });
  assert.equal(fs.readFileSync(path.join(SRC, 'data', 'debutsDeSaison', 'noteDesDebuts.js'), 'utf8'), B.texteDeLaNote(note), 'la note à l’octet, jamais retouchée à la main');
  // ce que dit le passage unique (lu dans la sortie gardée, jamais choisi après) : K 11, la forme du commun fd, les contrôles
  assert.equal(DEBUTS_AU_BANC.K, 11);
  assert.equal(DEBUTS_AU_BANC.formeFd, FORME_FD);
  const controles = DEBUTS_AU_BANC.variantes.filter((v) => v.placebo);
  assert.equal(controles.length, 4);
  for (const v of controles) assert.equal(v.verdict, 'pas-prouve', `le contrôle ${v.id}`);
  assert.deepEqual(DEBUTS_AU_BANC.bancFaux, { rappel: { magasin: false }, promus: { magasin: false, fd: false }, nouveaux: { magasin: false, fd: false }, effectif: { magasin: false } });
  assert.deepEqual(DEBUTS_AU_BANC.statuts, { rappel: 'explication-seulement', promus: 'explication-seulement', nouveaux: 'effet-mesure-prudent', effectif: 'explication-seulement' });
  assert.ok(DEBUTS_AU_BANC.limites.some((l) => /environ 6 % de chances/.test(l) && /jamais une utilité à tort/.test(l)), 'la limite de la forme retenue est dite');
  for (const f of ['rappel', 'promus', 'nouveaux', 'effectif']) assert.equal(B.statutDeLaFamille(DEBUTS_AU_BANC, f), DEBUTS_AU_BANC.statuts[f]);
  // null (avant le passage) → « pas encore mesuré » ; une famille inconnue lève
  for (const f of ['rappel', 'promus', 'nouveaux', 'effectif']) assert.equal(B.statutDeLaFamille(null, f), 'pas-encore-mesure');
  assert.throws(() => B.statutDeLaFamille(null, 'continuite'), /famille inconnue/);
});

test('T-B8 l’ampleur se calcule sans les résultats des matchs jugés', () => {
  const m = mondeDesDebuts({ type: 'magasin', graine: 81, petit: true, rho: 0.8 });
  const a = bancDuMonde(m, { variantes: ['magasin-promus-sans-cote'] });
  // mêmes records, les scores des matchs JUGÉS changés (l'apprentissage, lui, garde les siens : chaque pli juge l'autre — on change donc
  // seulement les scores d'une fenêtre et on lit l'ampleur du pli qui la juge)
  const passe = executerSansPause(passeDesDebuts({ rencontres: m.rencontres, avecForces: true }));
  marquerLesRecords(passe.records, { seuilFauxPromu: a.seuil.seuil });
  const ctx = { magasin: B.plisDe('magasin').map((pl) => B.contexteDuPli(passe.records, 'magasin', pl)), fd: [] };
  const v1 = B.jugerUneVariante('magasin-promus-sans-cote', passe.records, { K: 11, contextes: ctx, tirages: 100 });
  for (const r of passe.records) if (r.fenetre === 'B') r.buts = { dom: 0, ext: 0 };
  // le pli 0 apprend sur A (inchangé) et juge B (scores changés) : son ampleur ne bouge pas
  const ctx2 = { magasin: [B.contexteDuPli(passe.records, 'magasin', B.plisDe('magasin')[0])], fd: [] };
  const seulPli0 = { ...PERIODES_DU_BANC, magasin: { ...PERIODES_DU_BANC.magasin, plis: [PERIODES_DU_BANC.magasin.plis[0]] } };
  const avant = B.jugerUneVariante('magasin-promus-sans-cote', a.passe.records, { K: 11, contextes: { magasin: [ctx.magasin[0]], fd: [] }, periodes: seulPli0, tirages: 100 });
  const apres = B.jugerUneVariante('magasin-promus-sans-cote', passe.records, { K: 11, contextes: ctx2, periodes: seulPli0, tirages: 100 });
  assert.ok(v1.ampleur.max > 0);
  assert.equal(apres.ampleur.max, avant.ampleur.max, 'les scores jugés changés : même ampleur');
  assert.notEqual(apres.gain, avant.gain, 'mais la perte, elle, change');
});

test('T-B9 --comptes ne calcule aucune perte ni aucun réglage', () => {
  const imports = [...fs.readFileSync(path.join(SRC, 'data', 'debutsDeSaison', 'comptesDesDebuts.js'), 'utf8').matchAll(/^import [^;]* from ['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  assert.ok(!imports.some((i) => /bancDesDebuts/.test(i)), 'les comptes n’importent jamais le banc');
  const m = mondeDesDebuts({ type: 'magasin', graine: 91, petit: true });
  const sansResultat = m.rencontres.map((r) => ({ ...r, faitDom: null, buts90: null }));
  const passe = executerSansPause(passeDesDebuts({ rencontres: sansResultat, avecForces: false }));
  assert.ok(passe.records.every((r) => r.buts === null && r.ligue === null && r.h.sommes === null), 'aucun score, aucune force');
  const c = comptesDUnePasse(passe, { source: 'magasin', niveaux: NIVEAUX });
  const cles = new Set();
  JSON.stringify(c, (k, v) => {
    cles.add(k);
    return v;
  });
  for (const interdit of ['d', 'dF', 'theta', 'c0', 'perte', 'gain', 'verdict', 'b', 'k0', 'recalage']) assert.ok(!cles.has(interdit), `les comptes rendent « ${interdit} »`);
  assert.ok(c.parFenetre.A.ensembles.rappel > 100);
});

test('T-B10 le script : K, règles par sha1, modules scellés, verrou posé avant de lire, passe attendue, sortie jamais écrasée, second passage sur raison ; --note-nulle', () => {
  const copie = preparerCopie({ base: false });
  try {
    const cli = path.join(copie.serveur, 'scripts', 'debuts-de-saison.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'scripts', 'debuts-de-saison.mjs'), cli);
    const fab = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-debuts.mjs'), { args: ['fabriquer', '{}'], timeout: 300_000 });
    assert.equal(fab.code, 0, fab.erreurs.slice(-3000));
    const d = (n) => path.join(copie.dossier, n);
    const sMod = sha1(fs.readFileSync(path.join(copie.serveur, 'src', 'data', 'debutsDeSaison', 'bancDesDebuts.js')));
    fs.writeFileSync(d('regles.md'), `# Règles (essai)\n- ${sMod} src/data/debutsDeSaison/bancDesDebuts.js\n`);
    fs.writeFileSync(d('regles-faux.md'), `# Règles (essai)\n- ${'0'.repeat(40)} src/data/debutsDeSaison/bancDesDebuts.js\n`);
    fs.writeFileSync(d('regles-vides.md'), '# Règles (essai) sans module\n');
    fs.writeFileSync(d('passe-libre.json'), JSON.stringify({ running: null }));
    fs.writeFileSync(d('passe-occupee.json'), JSON.stringify({ running: { reason: 'au démarrage' } }));
    const sR = (f) => sha1(fs.readFileSync(d(f)));
    const banc = (sortie, enPlus = [], { k = '11', regles = 'regles.md', sr = sR(regles), passe = 'passe-libre.json', verrou = true } = {}) =>
      executer(copie, cli, { args: ['--banc', '--regles', d(regles), '--sha1-regles', sr, '--k', k, ...(verrou ? ['--verrou', d('banc.lock')] : []), '--passe', d(passe), '--attente-minutes', '0', '--sortie', d(sortie), ...enPlus], timeout: 600_000 });
    assert.match(banc('a.json', [], { k: '17' }).json.refus, /K doit valoir le nombre de variantes déclarées \(11/);
    assert.match(banc('a.json', [], { sr: '0'.repeat(40) }).json.refus, /les règles ont changé/);
    assert.match(banc('a.json', [], { regles: 'regles-faux.md' }).json.refus, /n’a plus le sha1 scellé/);
    assert.match(banc('a.json', [], { regles: 'regles-vides.md' }).json.refus, /aucun module/);
    assert.match(banc('a.json', [], { verrou: false }).json.refus, /--verrou <fichier> est obligatoire/);
    assert.match(banc('a.json', [], { passe: 'passe-occupee.json' }).json.refus, /la passe de Pierre tourne/);
    fs.writeFileSync(d('existe.json'), '{}');
    assert.match(banc('existe.json').json.refus, /jamais écrasée/);
    assert.ok(!fs.existsSync(d('banc.lock')), 'aucun verrou posé par un refus');
    const premier = banc('premier.json');
    assert.equal(premier.code, 0, `${premier.erreurs.slice(-3000)}\n${(premier.sortie ?? '').slice(-1500)}`);
    const verrou = JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8'));
    assert.match(verrou.pose, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(verrou.regles.sha1, sR('regles.md'));
    assert.equal(verrou.K, 11);
    const sortie = JSON.parse(fs.readFileSync(d('premier.json'), 'utf8'));
    assert.equal(sortie.premierRegard, verrou.pose, 'le verrou posé AVANT la lecture');
    assert.equal(sortie.base.lectureSeule, true);
    assert.equal(sortie.empreinteDuMoteur.sha1, '16f2459db183a99576365047da98b7777687ef05');
    assert.equal(sortie.empreinteDuMoteur.candidate, 'f01dd8496f56a415');
    assert.equal(sortie.banc.K, 11);
    assert.equal(sortie.banc.variantes.length, 10);
    assert.match(banc('second.json').json.refus, /DÉJÀ été passé/);
    // --note-nulle : jamais sur une note qui porte un passage ; sur une note nulle, réécrite à l'octet (la note de la COPIE est
    // remplacée pour l'essai : celle du bac n'est jamais touchée)
    const noteCopie = path.join(copie.serveur, 'src', 'data', 'debutsDeSaison', 'noteDesDebuts.js');
    const portee = '/** une note qui porte un passage (essai) */\nexport const DEBUTS_AU_BANC = Object.freeze({ K: 11 });\n';
    fs.writeFileSync(noteCopie, portee);
    const refusNote = executer(copie, cli, { args: ['--note-nulle'] });
    assert.match(refusNote.json?.refus ?? '', /jamais remise à null/);
    assert.equal(fs.readFileSync(noteCopie, 'utf8'), portee, 'la note du passage gardée');
    fs.writeFileSync(noteCopie, B.texteDeLaNote(null));
    const note = executer(copie, cli, { args: ['--note-nulle'] });
    assert.equal(note.code, 0, note.erreurs.slice(-2000));
    assert.equal(note.json.mode, 'note-nulle');
    assert.equal(fs.readFileSync(noteCopie, 'utf8'), B.texteDeLaNote(null));
  } finally {
    copie.nettoyer();
  }
});

test('T-B11 les deux bras recalés sur le MÊME ensemble (chacun ses niveaux) ; la même moyenne de ligue', () => {
  const b = bancDuMonde(mondeDesDebuts({ type: 'magasin', graine: 111, petit: true, rho: 0.8 }), { variantes: ['magasin-promus-sans-cote', 'magasin-rappel-sans-cote'] });
  for (const v of b.banc.variantes) {
    for (const r of v.recalages) {
      assert.equal(r.A.matchs, r.B.matchs, `${v.id} : le même ensemble`);
      assert.equal(r.A.matchs, v.appris.find((a) => a.pli === r.pli).matchsAppris, 'celui de la période d’apprentissage');
    }
  }
  const promus = verdict(b, 'magasin-promus-sans-cote');
  assert.ok(promus.recalages.some((r) => r.A.cDom !== r.B.cDom), 'chaque bras a SES niveaux');
  // la moyenne de ligue : celle de la candidate, la même pour les deux bras (un seul champ lu, r.ligue)
  const corps = fs.readFileSync(path.join(SRC, 'data', 'debutsDeSaison', 'bancDesDebuts.js'), 'utf8').match(/export function attendusDuBras[^]*?\n}/)[0];
  assert.deepEqual(corps.match(/ligue\s*:\s*[\w.]+/g), ['ligue: r.ligue'], 'aucun bras ne lit une autre moyenne');
});

test('T-B12 réglages neutres → le bras B prend le chemin du bras A : gain exactement 0', () => {
  const passe = executerSansPause(passeDesDebuts({ rencontres: mondeDesDebuts({ type: 'magasin', graine: 121, petit: true, rho: 1 }).rencontres, avecForces: true }));
  marquerLesRecords(passe.records, { seuilFauxPromu: 100 });
  const ens = passe.records.filter((r) => r.ens.promus && r.buts && r.ligue);
  const L = ens.filter((r) => r.fenetre === 'A');
  const J = ens.filter((r) => r.fenetre === 'B');
  for (const [A, Bb] of [
    [B.bras('candidate'), B.bras('rappel', { d: 0 })],
    [B.bras('commun', { c0: [0, 0] }, { remise: true }), B.bras('dirige', { theta: [0, 0] }, { remise: true })],
    [B.bras('rappel', { d: 0 }), B.bras('effectif', { d: 0, b: [0, 0] })]
  ]) {
    const ra = B.recaler(L, A);
    const rb = B.recaler(L, Bb);
    assert.deepEqual(ra, rb);
    for (const r of J) assert.deepEqual(B.attendusDuBras(r, A), B.attendusDuBras(r, Bb));
  }
});

test('T-B13 « avec cotes » jamais calculé ; « 1N2 seul » rapporté, jamais jugé ; un match sans 1N2 hors de ses lignes', () => {
  const b = bancDuMonde(mondeDesDebuts({ type: 'magasin', graine: 131, petit: true, rho: 0.8 }), { variantes: ['magasin-promus-sans-cote'] });
  const v = verdict(b, 'magasin-promus-sans-cote');
  assert.ok(v.rapporte.unDeuxSeul.matchs > 0, 'rapporté');
  assert.ok(!('verdict' in v.rapporte.unDeuxSeul), 'jamais jugé');
  const avec1n2 = b.passe.records.filter((r) => r.ens.promus && r.prix1n2 && r.buts && r.fenetre).length;
  assert.ok(v.rapporte.unDeuxSeul.matchs <= avec1n2, 'seulement les matchs qui ont un 1N2');
  assert.ok(!Object.keys(B.FORMES).some((id) => /avec-cotes|1n2/.test(id)));
  assert.ok(!/plusMoins\s*:\s*(?!null)\S/.test(fs.readFileSync(path.join(SRC, 'data', 'debutsDeSaison', 'bancDesDebuts.js'), 'utf8')), 'aucun plus/moins (« avec cotes ») au lot 1');
});

test('T-B14 la règle « utile » par fenêtre', () => {
  const v = (id, verdictV, matchs = 500, ampleur = 0.01) => ({ id, verdict: verdictV, matchsJuges: matchs, ampleur: { max: ampleur } });
  const base = (sur) => ['magasin-rappel-sans-cote', 'magasin-placebo-fausse-rentree', 'magasin-promus-sans-cote', 'magasin-nouveaux-sans-cote', 'magasin-placebo-faux-promu', 'magasin-force-effectif-sans-cote', 'magasin-placebo-faux-effectif', 'fd-promus-sans-cote', 'fd-nouveaux-sans-cote', 'fd-placebo-faux-promu'].map((id) => sur[id] ?? v(id, 'pas-prouve'));
  let u = B.utileParFamille(base({ 'fd-promus-sans-cote': v('fd-promus-sans-cote', 'retenu') }));
  assert.equal(u.promus.utile, true);
  assert.equal(u.promus.fenetre, 'fd');
  assert.equal(u.promus.prudent, false, 'retenu sur une fenêtre neuve');
  u = B.utileParFamille(base({ 'fd-promus-sans-cote': v('fd-promus-sans-cote', 'retenu'), 'magasin-promus-sans-cote': v('magasin-promus-sans-cote', 'moins-bon') }));
  assert.equal(u.promus.utile, false, '« moins bon » sur une autre fenêtre');
  u = B.utileParFamille(base({ 'fd-promus-sans-cote': v('fd-promus-sans-cote', 'retenu'), 'fd-placebo-faux-promu': v('fd-placebo-faux-promu', 'retenu') }));
  assert.equal(u.promus.utile, false);
  assert.deepEqual(u.promus.bancFaux, { magasin: false, fd: true }, 'le banc est faux SUR SA fenêtre seulement');
  u = B.utileParFamille(base({ 'fd-promus-sans-cote': v('fd-promus-sans-cote', 'retenu'), 'fd-placebo-faux-promu': v('fd-placebo-faux-promu', 'retenu'), 'magasin-promus-sans-cote': v('magasin-promus-sans-cote', 'retenu') }));
  assert.equal(u.promus.utile, true, 'le contrôle de football-data ne tue pas le verdict du magasin');
  assert.equal(u.promus.fenetre, 'magasin');
  assert.equal(u.promus.prudent, true);
  u = B.utileParFamille(base({ 'magasin-rappel-sans-cote': v('magasin-rappel-sans-cote', 'retenu', 150) }));
  assert.equal(u.rappel.utile, false, 'moins de 200 matchs');
  u = B.utileParFamille(base({ 'magasin-rappel-sans-cote': v('magasin-rappel-sans-cote', 'retenu', 500, 0.004) }));
  assert.equal(u.rappel.utile, false, 'ampleur sous 0,5 point');
  u = B.utileParFamille(base({ 'magasin-force-effectif-sans-cote': v('magasin-force-effectif-sans-cote', 'retenu') }));
  assert.equal(u.effectif.utile, true);
  assert.equal(u.effectif.prudent, true, 'la force de l’effectif : toujours prudent');
  // « toujours » : même sans verdict retenu (ses fiches ont été réglées sur la fenêtre jugée) ; une autre famille, non
  u = B.utileParFamille(base({}));
  assert.deepEqual([u.effectif.utile, u.effectif.prudent], [false, true], 'la force de l’effectif : prudente même sans rien de retenu');
  assert.deepEqual([u.rappel.utile, u.rappel.prudent], [false, false]);
});

test('T-B15 les valeurs finales apprises sur A ∪ B ; l’horizon de la preuve suit la formule du §5.10', () => {
  const passe = executerSansPause(passeDesDebuts({ rencontres: mondeDesDebuts({ type: 'magasin', graine: 151, petit: true, rho: 0.6 }).rencontres, avecForces: true }));
  marquerLesRecords(passe.records, { seuilFauxPromu: 100 });
  const f = B.valeursFinales(passe.records);
  const tout = passe.records.filter((r) => r.ens.rappel && r.buts && r.ligue && r.date >= '2023-07-01' && r.date <= '2026-09-23');
  const attendu = B.apprendreSurLaGrille(tout, (x) => B.bras('rappel', { d: x }));
  assert.equal(f.magasin.dRappel, attendu);
  assert.equal(B.horizonDeLaPreuve({ matchsJuges: 1000, zObserve: 4 }, 11), Math.ceil(1000 * ((zPour(0.05, 11) + 0.8416) / 4) ** 2));
  assert.equal(B.horizonDeLaPreuve({ matchsJuges: 1000, zObserve: -1 }, 11), null);
});

test('T-B16 la force de l’effectif standardisée (x d’écart-type 1 sur A ∪ B) et l’a priori 0,05 sur le coefficient standardisé', () => {
  const m = mondeDesDebuts({ type: 'magasin', graine: 161, petit: true, rho: 0.8, rEff: 0.5 });
  const b = bancDuMonde(m, { variantes: ['magasin-force-effectif-sans-cote'], effectif: true });
  const xs = b.passe.records.filter((r) => r.fenetre === 'A' || r.fenetre === 'B').flatMap((r) => [r.h, r.a]).filter((c) => c.x).map((c) => c.x.off);
  const moy = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - moy) ** 2, 0) / (xs.length - 1));
  assert.ok(Math.abs(sd - 1) < 1e-9, `écart-type des x ${sd}`);
  assert.equal(PRIOR_EFFECTIF, 0.05);
  // l'a priori 0,05 rapetisse le coefficient face à un a priori large
  const ens = b.passe.records.filter((r) => r.ens.effectif && r.buts && r.ligue && r.fenetre === 'A');
  const f = (x) => B.vraisemblance(ens, B.bras('effectif', { d: 0, b: x })).ll;
  const serre = B.newton(f, [0, 0], PRIOR_EFFECTIF).x;
  const large = B.newton(f, [0, 0], 1).x;
  assert.ok(Math.abs(serre[0]) <= Math.abs(large[0]) + 1e-12 && Math.abs(serre[1]) <= Math.abs(large[1]) + 1e-12, JSON.stringify({ serre, large }));
  assert.ok(large[0] > 0, 'dans ce monde, le signal offensif aide');
  const v = verdict(b, 'magasin-force-effectif-sans-cote');
  assert.ok(v.appris.every((a) => a.appris.b.length === 2));
});

test('T-B17 le k0 du commun fd appris sur P1 SEULEMENT, le même dans les deux bras', () => {
  const passe = executerSansPause(passeDesDebuts({ rencontres: MONDE_FD(171, { rho: 1, promo: ZERO }).rencontres, avecForces: true, fd: true }));
  marquerLesRecords(passe.records, { seuilFauxPromu: 200 });
  const k = B.apprendreLeK0Fd(passe.records);
  assert.ok([8, 11, 16, 24].includes(k.k0));
  // des matchs de P2 aux scores absurdes ne changent pas le k0 (appris sur P1 seulement)
  const fous = passe.records.map((r) => (r.fenetre === 'P2' ? { ...r, buts: { dom: 9, ext: 9 } } : r));
  assert.equal(B.apprendreLeK0Fd(fous).k0, k.k0);
  assert.equal(B.apprendreLeK0Fd(fous).matchs, k.matchs);
  // le même k0 dans les deux bras de chaque variante de football-data
  const b = B.jugerLesVariantes(passe.records, { variantes: ['fd-promus-sans-cote'], formeFd: 'k0-commun', tirages: 100 });
  assert.equal(b.k0Fd.k0, k.k0);
  assert.equal(b.contextes.fd[0].k0, k.k0);
  const ctx = { k0: 16, promus: { c0: [0.1, 0], theta: [0.1, 0] } };
  const L = passe.records.filter((r) => r.ens.promus && r.buts && r.ligue && r.fenetre === 'P1');
  const a = B.apprendreLaVariante('fd-promus-sans-cote', L, ctx);
  const r = L[0];
  const kDe = (br) => br.pDe(r.h, r).k0;
  assert.equal(kDe(a.A), 16);
  assert.equal(kDe(a.B), 16);
  const seul = B.jugerLesVariantes(passe.records, { variantes: ['fd-promus-sans-cote'], formeFd: 'remis-a-zero-seul', tirages: 100 });
  assert.equal(seul.k0Fd.k0, 8, 'le commun des remis à zéro seul : k0 = 8, celui de la base');
});

test('T-B18 les contrôles des comptes corrigés avant le regard (09/11) : le faux point sur les saisons dont le jour est lu ; une division-saison vérifiée à part, avec EXACTEMENT ses numéros', () => {
  // le magasin : 9 clubs-saisons avec leur faux point, 1 sans alors que son jour est lu, 30 coupés par la fin de la fenêtre
  const clubsDeLaFenetre = new Map();
  const fauxPoints = new Map();
  for (let c = 1; c <= 9; c++) {
    clubsDeLaFenetre.set(`${c}|2024`, { fenetre: 'A', league: 'EPL', civile: null });
    fauxPoints.set(`${c}|2024`, '2025-03-20');
  }
  clubsDeLaFenetre.set('10|2025', { fenetre: 'B', league: 'EPL', civile: null });
  for (let c = 11; c <= 40; c++) clubsDeLaFenetre.set(`${c}|2026`, { fenetre: 'B', league: 'EPL', civile: null });
  const vide = { championnat: 0, sansScore90: 0 };
  const passe = { records: [], comptes: { lues: 0, deChampionnat: 0, attribuees: 0, clubsSaisons: new Map(), clubsDeLaFenetre, fauxPoints, parFenetre: { A: vide, B: vide } } };
  const m = comptesDUnePasse(passe, { source: 'magasin', dernierJourLu: PERIODES_DU_BANC.magasin.dernierJourLu });
  const f = m.fauxPoints;
  assert.deepEqual([f.sansFauxPoint, f.clubsSaisonsQuiJouent, f.coupeesParLaFin, f.jourLu.sansFauxPoint, f.jourLu.clubsSaisons], [31, 40, 30, 1, 10]);
  const fp = controlesDesComptes({ magasin: m }).find((c) => c.id === 'faux-point-manquant');
  assert.deepEqual([fp.valeur, fp.casse], [0.1, false], 'les saisons coupées par la fin de la fenêtre ne comptent pas');
  // football-data : G1 2011-12 et ses cinq nouveaux venus vérifiés un par un (NOUVEAUX_VERIFIES_FD) : à part ; un seul autre numéro → cassé
  const fdPasse = (nouveaux) => {
    const clubsSaisons = new Map();
    for (const c of [...nouveaux, ...Array.from({ length: 11 }, (_, i) => 2000 + i)]) clubsSaisons.set(`${c}|2011|G1`, { club: c, saison: 2011, league: 'G1', statut: nouveaux.includes(c) ? 'nouveau' : 'debut', fenetre: 'P1' });
    const v = { championnat: 0, sansScore90: 0 };
    return { records: [], comptes: { lues: 0, deChampionnat: 0, attribuees: 0, clubsSaisons, clubsDeLaFenetre: new Map(), fauxPoints: new Map(), parFenetre: { P1: v, P2: v } } };
  };
  const controle = (nouveaux) => controlesDesComptes({ fd: comptesDUnePasse(fdPasse(nouveaux), { source: 'fd', paysDesClubs: new Map(), niveaux: NIVEAUX_FD }) }).find((c) => c.id === 'nouveaux-max-fd');
  const verifiee = controle([901, 902, 982, 1107, 1142]);
  assert.equal(verifiee.casse, false, 'G1 2011-12 vérifiée : à part');
  assert.match(verifiee.quoi, /vérifiées une par une, à part : G1 2011/);
  const autre = controle([901, 902, 982, 1107, 1143]);
  assert.deepEqual([autre.valeur, autre.casse], [0.3125, true], 'un autre numéro : plus vérifiée, cassée (5 / 16)');
});

test('T-B19 la fin du processus à part : « close », jamais « exit » (correctif du 09/11/2026) ; une grosse réponse arrive entière ; un muet est refusé avec son code', () => {
  // 1. le texte du script : lancerLEnfant écoute « close » (une fois), et c'est « close » qui conclut « sans réponse » ; aucune
  //    écoute de « exit » nulle part (sous Windows, « exit » peut arriver AVANT le dernier message : vu aux coupes le 09/11)
  const texte = fs.readFileSync(path.join(SERVEUR, 'scripts', 'debuts-de-saison.mjs'), 'utf8');
  const corps = texte.match(/\nfunction lancerLEnfant\([^]*?\n}\n/)?.[0] ?? '';
  assert.ok(corps, 'lancerLEnfant introuvable');
  assert.equal(corps.split("enfant.on('close', (code) => {").length - 1, 1, 'une écoute de « close » dans lancerLEnfant');
  assert.ok(!/\.(on|once|addListener|prependListener|prependOnceListener)\(\s*['"`]exit['"`]/.test(texte), 'aucune écoute de « exit »');
  const surClose = corps.slice(corps.indexOf("enfant.on('close'"));
  assert.match(surClose.slice(0, surClose.indexOf('\n    });')), /sans réponse/, '« close » conclut « sans réponse »');
  // 2. dans une copie : un faux processus à part envoie une grosse réponse et s'arrête aussitôt (exit 0 dans le rappel de
  //    l'envoi, comme debutsBancEnfant.js), trois fois de suite ; puis un processus à part muet (exit 3 sans rien envoyer)
  const copie = preparerCopie({ base: false });
  try {
    const cli = path.join(copie.serveur, 'scripts', 'debuts-de-saison.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'scripts', 'debuts-de-saison.mjs'), cli);
    fs.mkdirSync(path.dirname(copie.base), { recursive: true });
    fs.writeFileSync(copie.base, ''); // jamais ouverte : le faux processus à part ne lit rien
    const enfant = path.join(copie.serveur, 'src', 'data', 'debutsDeSaison', 'debutsBancEnfant.js');
    fs.writeFileSync(
      enfant,
      [
        "process.once('message', (m) => {",
        "  const gros = Array.from({ length: 100 }, (_, i) => ({ i, grille: new Float64Array(2000).fill(i / 7), t: 'ligne ' + i }));",
        '  process.send({ fin: true, mode: m.mode, resultat: { controles: [], casse: false, gros } }, () => process.exit(0));',
        '});',
        ''
      ].join('\n')
    );
    for (let essai = 1; essai <= 3; essai++) {
      const sortie = path.join(copie.dossier, `fin-${essai}.json`);
      const r = executer(copie, cli, { args: ['--comptes', '--sortie', sortie] });
      assert.equal(r.code, 0, `essai ${essai} : ${r.erreurs.slice(-1500)}`);
      assert.equal(r.json?.ok, true);
      const gros = JSON.parse(fs.readFileSync(sortie, 'utf8')).gros;
      assert.equal(gros.length, 100, `essai ${essai} : la réponse entière`);
      assert.equal(gros[99].grille.length, 2000);
      assert.equal(gros[99].t, 'ligne 99');
    }
    fs.writeFileSync(enfant, "process.once('message', () => process.exit(3));\n");
    const muet = executer(copie, cli, { args: ['--comptes', '--sortie', path.join(copie.dossier, 'muet.json')] });
    assert.equal(muet.code, 2, muet.erreurs.slice(-1500));
    assert.match(muet.json?.refus ?? '', /sorti \(code 3\) sans réponse/);
    assert.ok(!fs.existsSync(path.join(copie.dossier, 'muet.json')), 'rien écrit');
  } finally {
    copie.nettoyer();
  }
});
