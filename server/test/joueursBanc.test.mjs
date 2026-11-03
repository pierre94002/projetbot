/**
 * LES CHIFFRES DES JOUEURS (étape 34, lot 1a, partie B, 03/11/2026) — le banc, sur des MONDES TIRÉS AU HASARD (aucun
 * résultat réel : le banc ne lit son passage qu'une fois, au temps 2).
 *   node --test test/joueursBanc.test.mjs        (depuis server/)
 *
 * T-B1   des parts propres au joueur plantées (écart de 0,4 en log, tireur désigné) → les cinq variantes « retenu » ; un
 *        monde sans écart entre joueurs ni tireur → rien n'est retenu ; les κ appris sont dans la grille ;
 * T-B2   les cinq faux joueurs ne sont JAMAIS « retenu », dans aucun des quatre mondes (planté, nul, contexte, dérive) ;
 * T-B3   K = VARIANTES_DE_L_ETAPE_34.length = 11 ; z = 2,8376 ; une variante non déclarée, ou un K faux, est refusé ;
 * T-B4   les lignes { bloc: clé du match, date, a, b } passent controlerLigne ; plancher 1e-6 ; un titulaire qui n'a pas
 *        joué n'est pas une ligne ; une seule ligne par titulaire jugé et par variante ;
 * T-B5   chaque pli est jugé avec les paramètres appris sur l'AUTRE (apprisSur) ; changer les issues du pli jugé ne change
 *        aucun de ses paramètres ; aucune ligne de la mise en route n'est jugée ; une rencontre d'après le 23/09/2026 est
 *        refusée ;
 * T-B6   noteDesJoueurs.js = texteDeLaNote(null) à l'octet (pas encore mesuré : le passage unique est au temps 2) ;
 * T-B7   l'ampleur se calcule sans aucun résultat : les issues des lignes jugées brouillées → même ampleur ;
 * T-B8   --comptes ne calcule aucune perte : comptesDesJoueurs.js n'importe ni bancDesJoueurs.js ni perteDUneLigne ;
 * T-B9   le script : un seul regard — K, règles par sha1, sceau de data/cartons/ (critique, constat 7), verrou obligatoire,
 *        passe de Pierre attendue, verrou posé avant la lecture, sortie jamais écrasée, second passage refusé sans raison ;
 *        --comptes sans perte ni attendu ; --recopier écrit la note par script ;
 * T-B10  « calibré » : le modèle retenu de chaque famille (bras B si utile, sinon A), recalé par dixièmes appris sur l'autre
 *        pli, avec la règle de calibrationDe ; le recalage est appris sur l'AUTRE pli (critique, constat 5) ;
 * T-B11  une dérive des parts des attaquants (+12 % par saison), aucun écart entre joueurs → aucune variante de parts retenue ;
 * T-B11bis un écart de CONTEXTE compétition × poste (0,15 en log), aucun écart propre au joueur → aucune variante de parts
 *        retenue (critique, constat 8 : le bras A = repère du poste × rapport de la compétition) ;
 * T-B12  le recalage niveau et pente retrouve c et β plantés (Newton) ; les deux bras d'une variante reçoivent la même base ;
 * T-B13  les valeurs finales apprises sur A ∪ B ; l'horizon de la preuve selon sa formule ;
 * T-B14  les rapports ne changent aucun verdict : le banc rejoué donne les mêmes variantes, et les rapports ne touchent pas
 *        aux données ;
 * T-B15  « utile » et « banc faux » sur des résultats fabriqués (placebo retenu, ampleur, 200 matchs, seuil du tireur) ;
 * T-B16  la garde de la base S comptée sur la fenêtre où les tirs cadrés sont jugés (pli A : dès le 01/01/2024), à 80 %.
 * (T-B6 lit la note du passage unique du 03/11/2026 ; T-B10 vérifie aussi que les tirs cadrés de A d'avant 2024 ne sont
 * pas jugés.)
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { donneesDuMonde, generateur } from './aides/joueursMondes.mjs';
import { VARIANTES_DE_L_ETAPE_34 } from '../src/bench/lancements.js';
import { zPour } from '../src/bench/guard.js';
import * as BANC from '../src/data/joueurs/bancDesJoueurs.js';
import { GRILLE_KAPPA, PERIODES_DU_BANC, PREUVE } from '../src/data/joueurs/reglagesJoueurs.js';
import { calibrationDe, perteDUneLigne, recaler } from '../src/data/joueurs/formulesDesJoueurs.js';

const SRC = path.join(SERVEUR, 'src');
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const OPTIONS = { tirages: 200 };
const monde = (o) => uneFois(() => {
  const D = donneesDuMonde({ ligues: 3, clubs: 12, ...o });
  return { D, banc: BANC.jugerLesVariantes(D, OPTIONS) };
});
const PLANTE = monde({ graine: 34, ecart: 0.4, tireur: true });
const NUL = monde({ graine: 7, ecart: 0, tireur: false });
const CONTEXTE = monde({ graine: 8, ecart: 0, ligueParPoste: 0.15, tireur: false });
const DERIVE = monde({ graine: 9, ecart: 0, derive: 0.12, tireur: false });
const verdict = (b, id) => b.variantes.find((v) => v.id === id).verdict;
const PARTS = ['buteur-parts', 'cadres-parts', 'averti-parts', 'passeur-parts'];

test('T-B1 des parts propres au joueur plantées → les cinq variantes « retenu » ; un monde nul → rien ; les κ appris dans la grille', () => {
  const { banc } = PLANTE();
  for (const id of [...PARTS, 'buteur-tireur']) assert.equal(verdict(banc, id), 'retenu', id);
  for (const id of [...PARTS, 'buteur-tireur']) assert.equal(banc.variantes.find((v) => v.id === id).utile, true, id);
  for (const p of Object.values(banc.parametres)) for (const km of Object.values(p.kappaMatchs)) assert.ok(GRILLE_KAPPA.includes(km), `κ ${km} dans la grille`);
  const nul = NUL().banc;
  for (const id of [...PARTS, 'buteur-tireur']) assert.notEqual(verdict(nul, id), 'retenu', `monde nul : ${id}`);
});

test('T-B2 les cinq faux joueurs ne sont jamais « retenu », dans les quatre mondes', () => {
  for (const [nom, m] of [['planté', PLANTE], ['nul', NUL], ['contexte', CONTEXTE], ['dérive', DERIVE]]) {
    const b = m().banc;
    for (const id of ['placebo-parts', 'placebo-tireur', 'placebo-cadres', 'placebo-averti', 'placebo-passeur']) assert.notEqual(verdict(b, id), 'retenu', `${nom} : ${id}`);
    assert.ok(Object.values(b.bancFaux).every((x) => x === false), `${nom} : aucun banc faux`);
  }
});

test('T-B3 K = 11 (VARIANTES_DE_L_ETAPE_34.length), z = 2,8376 ; une variante non déclarée ou un K faux est refusé', () => {
  assert.equal(VARIANTES_DE_L_ETAPE_34.length, 11);
  const { banc, D } = PLANTE();
  assert.equal(banc.K, 11);
  assert.ok(Math.abs(banc.z - 2.8376) < 1e-4, String(banc.z));
  assert.equal(banc.z, zPour(0.05, 11));
  assert.deepEqual(banc.variantes.map((v) => v.id), [...BANC.VARIANTES_JUGEES]);
  for (const v of banc.variantes) assert.equal(v.variantes, 11, `${v.id} jugée à K = 11`);
  assert.throws(() => BANC.jugerLesVariantes(D, { ...OPTIONS, K: 10 }), /K \(10\) doit valoir/);
  assert.throws(() => BANC.jugerLesVariantes(D, { ...OPTIONS, variantes: ['buteur-parts', 'premier-buteur'] }), /n'est pas déclarée/);
});

test('T-B4 les lignes : { bloc, date, a, b } finies, plancher 1e-6 ; un titulaire qui n’a pas joué n’est pas une ligne', () => {
  const { D, banc } = PLANTE();
  const params = { A: BANC.apprendreLePli(D, D.campsDu('B')), B: BANC.apprendreLePli(D, D.campsDu('A')) };
  const v = BANC.lignesDUneVariante(D, 'buteur-parts', params);
  assert.ok(v.lignes.length > 10000);
  for (const l of v.lignes.slice(0, 2000)) {
    assert.equal(typeof l.bloc, 'string');
    assert.match(l.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Number.isFinite(l.a) && Number.isFinite(l.b) && l.a >= 0 && l.b >= 0 && l.a <= -Math.log(1e-6) + 1e-9);
  }
  // Une ligne par titulaire identifié qui a joué, issue relevée : jamais un titulaire sans minute.
  let joues = 0;
  for (let c = 0; c < D.nCamps; c++) for (let j = 0; j < D.camp.n.v[c]; j++) if (D.ligne.joue.v[D.camp.debut.v[c] + j] && D.ligne.id.v[D.camp.debut.v[c] + j] > 0) joues += 1;
  assert.ok(v.lignes.length <= joues);
  assert.equal(banc.variantes.find((x) => x.id === 'buteur-parts').lignes, v.lignes.length);
  // La perte est celle de la LOI ENTIÈRE du compte (jamais la seule ligne « au moins un ») : marque et tirs cadrés.
  let vus = { marque: 0, cadres: 0 };
  for (const c of D.campsDu('A')) {
    for (const x of BANC.lignesDuCamp(D, c, 'marque', BANC.FORMES['buteur-parts'].B, params.A) ?? []) {
      assert.equal(x.perte, perteDUneLigne('marque', { lambdaG: x.lam * x.g, k: D.ligne.K.v[x.i] }));
      if (D.ligne.K.v[x.i] >= 2) vus.marque += 1;
    }
    for (const x of BANC.lignesDuCamp(D, c, 'cadres', BANC.FORMES['cadres-parts'].B, params.A) ?? []) {
      assert.equal(x.perte, perteDUneLigne('cadres', { x: D.ligne.sot.v[x.i], mu: x.mu, invK: params.A.invK['sot:B'] }));
      if (D.ligne.sot.v[x.i] >= 2) vus.cadres += 1;
    }
    if (vus.marque > 20 && vus.cadres > 20) break;
  }
  assert.ok(vus.marque > 0 && vus.cadres > 0, JSON.stringify(vus));
  // Chaque ligne jugée est celle d'un titulaire qui a JOUÉ (le monde a des titulaires forfaits : 3 % des camps).
  let forfaits = 0;
  for (const c of D.campsDu('A')) {
    for (let j = 0; j < D.camp.n.v[c]; j++) if (!D.ligne.joue.v[D.camp.debut.v[c] + j]) forfaits += 1;
    for (const x of BANC.lignesDuCamp(D, c, 'marque', BANC.FORMES['buteur-parts'].B, params.A) ?? []) assert.equal(D.ligne.joue.v[x.i], 1, 'un titulaire qui n’a pas joué n’est jamais une ligne');
  }
  assert.ok(forfaits > 20, `${forfaits} titulaires forfaits dans le monde`);
  // Aucun gardien jugé (GARDIENS_JUGES = false) ; il reste dans la composition.
  for (const c of D.campsDu('B').slice(0, 300)) for (const x of BANC.lignesDuCamp(D, c, 'cadres', BANC.FORMES['cadres-parts'].A, params.B) ?? []) assert.notEqual(D.ligne.poste.v[x.i], 1);
});

test('T-B15 « utile » et « banc faux » (fixés avant le regard) : un placebo « retenu » rend sa variante inutile ; l’ampleur sous son seuil aussi (0,3 point pour le tireur) ; moins de 200 matchs aussi', () => {
  const r = (id, o = {}) => ({ id, famille: 'marque', placebo: id.startsWith('placebo'), verdict: 'retenu', matchsJuges: 500, ampleur: 0.01, ...o });
  const a = [r('buteur-parts'), r('placebo-parts', { verdict: 'retenu' }), r('buteur-tireur', { ampleur: 0.004 }), r('placebo-tireur', { verdict: 'pas-prouve' }), r('cadres-parts', { matchsJuges: 150 }), r('placebo-cadres', { verdict: 'pas-prouve' }), r('averti-parts', { ampleur: 0.004 }), r('placebo-averti', { verdict: 'pas-prouve' })];
  const d = BANC.decider(a);
  assert.equal(d.bancFaux['buteur-parts'], true);
  assert.equal(a[0].utile, false, 'son faux joueur est « retenu »');
  assert.equal(a[2].utile, true, 'le tireur : 0,4 point ≥ 0,3');
  assert.equal(a[4].utile, false, 'moins de 200 matchs');
  assert.equal(a[6].utile, false, 'ampleur sous 0,5 point');
  assert.equal(a[1].utile, false, 'un placebo n’est jamais utile');
});

test('T-B5 chaque pli jugé avec les paramètres de l’AUTRE ; les issues du pli jugé ne changent pas ses paramètres ; rien de la mise en route jugé ; P5 refusé', () => {
  const { banc, D } = NUL();
  assert.equal(banc.parametres.A.apprisSur, 'B');
  assert.equal(banc.parametres.B.apprisSur, 'A');
  const pA = JSON.stringify(BANC.resumeDesParametres(BANC.apprendreLePli(D, D.campsDu('B'))));
  // Les issues du pli A brouillées : les paramètres qui jugent A (appris sur B) ne bougent pas.
  const sauve = { K: D.ligne.K.v.slice(), sot: D.ligne.sot.v.slice() };
  for (const c of D.campsDu('A')) for (let j = 0; j < D.camp.n.v[c]; j++) {
    const i = D.camp.debut.v[c] + j;
    if (D.ligne.K.v[i] >= 0) D.ligne.K.v[i] = (D.ligne.K.v[i] + 1) % 3;
    if (D.ligne.sot.v[i] >= 0) D.ligne.sot.v[i] = 4;
  }
  const pA2 = JSON.stringify(BANC.resumeDesParametres(BANC.apprendreLePli(D, D.campsDu('B'))));
  D.ligne.K.v.set(sauve.K);
  D.ligne.sot.v.set(sauve.sot);
  assert.equal(pA2, pA);
  assert.ok(D.miseEnRoute > 0, 'la mise en route est lue');
  for (let c = 0; c < D.nCamps; c++) assert.ok(D.camp.date[c] >= '2023-07-01', 'aucun camp de la mise en route dans les données jugées');
  const D2 = new BANC.DonneesDuBanc();
  assert.throws(() => D2.ajouterLObservation({ r: { matchKey: 'p5', date: '2026-09-24', joue: true, camps: {} }, entrees: {}, base: {} }), /après le dernier jour lu/);
});

test('T-B6 noteDesJoueurs.js = texteDeLaNote(aRecopier(la sortie du passage unique)) à l’octet ; les règles gardées = les règles scellées ; texteDeLaNote(null) pour « pas encore mesuré »', async () => {
  const fichier = path.join(SRC, 'data', 'joueurs', 'noteDesJoueurs.js');
  const fixture = path.join(SERVEUR, 'test', 'fixtures', 'banc-joueurs-etape34.json');
  const regles = path.join(SERVEUR, 'test', 'fixtures', 'banc-regles-etape34.md');
  const sha1f = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
  assert.equal(sha1f(regles), '7cba00d04147df7a6fb43b823b4384ff937f0c28', 'les règles scellées le 03/11/2026');
  const sortie = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  assert.equal(sortie.regles.sha1, '7cba00d04147df7a6fb43b823b4384ff937f0c28');
  assert.equal(sortie.empreinteDuMoteur.sha1, '16f2459db183a99576365047da98b7777687ef05');
  const attendu = BANC.texteDeLaNote(BANC.aRecopier(sortie, { sortie: { fichier: 'test/fixtures/banc-joueurs-etape34.json', sha1: sha1f(fixture) } }));
  assert.equal(fs.readFileSync(fichier, 'utf8'), attendu, 'la note est la recopie PAR SCRIPT de la sortie, à l’octet');
  const { JOUEURS_AU_BANC } = await import('../src/data/joueurs/noteDesJoueurs.js');
  assert.ok(Object.isFrozen(JOUEURS_AU_BANC));
  assert.equal(JOUEURS_AU_BANC.K, 11);
  assert.deepEqual(JOUEURS_AU_BANC.variantes.map((v) => v.id), [...BANC.VARIANTES_JUGEES]);
  for (const [famille, s] of Object.entries(JOUEURS_AU_BANC.statuts)) {
    const v = JOUEURS_AU_BANC.variantes.find((x) => x.id === s.variante);
    assert.equal(s.statut, v.utile ? 'mesure' : 'poste', famille);
  }
  assert.match(BANC.texteDeLaNote(null), /export const JOUEURS_AU_BANC = null;/);
});

test('T-B7 l’ampleur se calcule sans aucun résultat : les issues des lignes jugées brouillées → la même ampleur', () => {
  const { D } = PLANTE();
  const params = { A: BANC.apprendreLePli(D, D.campsDu('B')), B: BANC.apprendreLePli(D, D.campsDu('A')) };
  const avant = PARTS.map((id) => { const v = BANC.lignesDUneVariante(D, id, params); return BANC.ampleur(v.PA, v.PB); });
  const sauve = { K: D.ligne.K.v.slice(), sot: D.ligne.sot.v.slice(), av: D.ligne.av.v.slice(), passes: D.ligne.passes.v.slice() };
  const u = generateur(77);
  for (let i = 0; i < D.nLignes; i++) {
    if (D.ligne.K.v[i] >= 0) D.ligne.K.v[i] = Math.floor(u() * 3);
    if (D.ligne.sot.v[i] >= 0) D.ligne.sot.v[i] = Math.floor(u() * 4);
    if (D.ligne.av.v[i] >= 0) D.ligne.av.v[i] = u() < 0.5 ? 1 : 0;
    if (D.ligne.passes.v[i] >= 0) D.ligne.passes.v[i] = Math.floor(u() * 2);
  }
  const apres = PARTS.map((id) => { const v = BANC.lignesDUneVariante(D, id, params); return BANC.ampleur(v.PA, v.PB); });
  D.ligne.K.v.set(sauve.K);
  D.ligne.sot.v.set(sauve.sot);
  D.ligne.av.v.set(sauve.av);
  D.ligne.passes.v.set(sauve.passes);
  assert.deepEqual(apres, avant);
});

test('T-B8 --comptes ne calcule aucune perte : comptesDesJoueurs.js n’importe ni le banc ni perteDUneLigne, et n’appelle aucune loi', () => {
  // Le code seulement (l'en-tête DIT ce qui n'est jamais importé).
  const t = fs.readFileSync(path.join(SRC, 'data', 'joueurs', 'comptesDesJoueurs.js'), 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:])//.*$', 'gm'), '$1');
  assert.doesNotMatch(t, /bancDesJoueurs|perteDUneLigne|perteDesComptes|perteLogBinaire|probaMarque|loiDesTirsCadres|partRappelee|normaliser\(/);
});

test('T-B10 « calibré » : le modèle retenu de chaque famille, recalé par dixièmes appris sur l’autre pli, avec la règle de calibrationDe', () => {
  const { banc, D } = PLANTE();
  for (const [famille, m] of Object.entries(banc.modeleRetenu)) {
    const v = banc.variantes.find((x) => x.id === m.variante);
    assert.equal(m.bras, v.utile ? 'B' : 'A', famille);
    const recale = m.bras === 'B' ? v.calibration.Brecale : v.calibration.Arecale;
    assert.equal(banc.calibre[famille].calibre, recale.calibre, famille);
    assert.equal(banc.calibre[famille].ecartMoyenPoints, recale.ecartMoyenPoints, `${famille} : « calibré » se lit sur le P RECALÉ`);
  }
  assert.deepEqual(Object.keys(banc.modeleRetenu), ['marque', 'cadres', 'averti', 'passeur']);
  // Le recalage est appris sur l'AUTRE pli : les tables qui jugent A viennent de l'apprentissage sur B.
  const surB = BANC.apprendreLePli(D, D.campsDu('B'));
  const surA = BANC.apprendreLePli(D, D.campsDu('A'));
  assert.deepEqual(BANC.resumeDesParametres(surB).dixiemes, banc.parametres.A.dixiemes);
  // … et c'est bien la table de l'autre pli qui est APPLIQUÉE à chaque ligne jugée.
  const v = BANC.lignesDUneVariante(D, 'cadres-parts', { A: surB, B: surA });
  let compares = 0;
  v.lignes.forEach((l, k) => {
    const table = l.date <= '2025-06-30' ? surB.dixiemes['cadres-parts:B'] : surA.dixiemes['cadres-parts:B'];
    if (k % 50 === 0) {
      assert.equal(v.PBr[k], recaler(table, v.PB[k]));
      compares += 1;
    }
  });
  assert.ok(compares > 100);
  // Les tirs cadrés du pli A ne sont JUGÉS qu'à partir du 01/01/2024 (décision du 03/11, la base S naissante) ; les autres
  // familles gardent tout le pli.
  assert.ok(v.lignes.every((l) => l.date >= '2024-01-01'), 'aucune ligne « tirs cadrés » jugée avant le 01/01/2024');
  const marque = BANC.lignesDUneVariante(D, 'buteur-parts', { A: surB, B: surA });
  assert.ok(marque.lignes.some((l) => l.date < '2024-01-01'), 'la marque garde le 2e semestre 2023');
  // La règle elle-même sur des lignes fabriquées.
  assert.equal(calibrationDe([[0.3, 1], [0.3, 0], [0.3, 0]].flatMap((x) => Array(400).fill(x))).calibre, false);
});

test('T-B11 une dérive des parts des attaquants (+12 % par saison), aucun écart entre joueurs → aucune variante de parts retenue', () => {
  const b = DERIVE().banc;
  for (const id of PARTS) assert.notEqual(verdict(b, id), 'retenu', id);
});

test('T-B11bis un écart de contexte compétition × poste (0,15), aucun écart propre au joueur → aucune variante de parts retenue (critique, constat 8)', () => {
  const b = CONTEXTE().banc;
  for (const id of PARTS) assert.notEqual(verdict(b, id), 'retenu', id);
});

test('T-B12 le recalage niveau et pente retrouve c et β plantés ; les deux bras d’une variante reçoivent la même base', () => {
  const u = generateur(12);
  const obs = [];
  for (let i = 0; i < 40000; i++) {
    const dom = i % 2 === 0;
    const base = 0.4 + 2.4 * u();
    const mu = Math.exp((dom ? 0.08 : -0.05) + 0.85 * Math.log(base));
    let k = 0;
    let p = Math.exp(-mu);
    let s = p;
    const x = u();
    while (x > s && k < 30) {
      k++;
      p *= mu / k;
      s += p;
    }
    obs.push({ dom, base, y: k });
  }
  const r = BANC.recalage(obs);
  assert.ok(Math.abs(r.cDom - 0.08) < 0.03 && Math.abs(r.cExt + 0.05) < 0.03 && Math.abs(r.beta - 0.85) < 0.03, JSON.stringify(r));
  const { D } = PLANTE();
  const p = BANC.apprendreLePli(D, D.campsDu('B'));
  const c = D.campsDu('A').find((x) => (D.camp.releves.v[x] & 1) !== 0);
  const a = BANC.lignesDuCamp(D, c, 'marque', BANC.FORMES['buteur-parts'].A, p);
  const b = BANC.lignesDuCamp(D, c, 'marque', BANC.FORMES['buteur-parts'].B, p);
  assert.ok(a.length > 0);
  for (let k = 0; k < a.length; k++) assert.equal(a[k].lam, b[k].lam, 'la même base λ dans les deux bras');
  // … et c'est la base RECALÉE (niveau et pente appris sur l'autre pli), jamais λS brut.
  assert.equal(a[0].lam, BANC.baseRecalee(p.recalageLambda, D.camp.dom.v[c] === 1, D.camp.lambdaS.v[c], [0.2, 6]));
  assert.notEqual(a[0].lam, D.camp.lambdaS.v[c]);
});

test('T-B13 les valeurs finales apprises sur A ∪ B ; l’horizon de la preuve selon sa formule', () => {
  const { D } = NUL();
  const f = BANC.valeursFinales(D);
  assert.equal(f.apprisSur, 'A ∪ B');
  assert.equal(f.camps, D.nCamps);
  const h = BANC.horizonDeLaPreuve({ nBanc: 3000, zBanc: 12, K: 11, parJour: 40 });
  const attendu = Math.ceil(3000 * ((zPour(0.05, 11) + PREUVE.zPuissance) / 12) ** 2);
  assert.equal(h.matchs, attendu);
  assert.equal(h.jours, Math.max(60, Math.ceil(attendu / 40)));
  assert.equal(BANC.horizonDeLaPreuve({ nBanc: 3000, zBanc: -1, parJour: 40 }), null);
});

test('T-B14 les rapports ne changent aucun verdict : le banc rejoué donne les mêmes variantes ; les rapports ne touchent pas aux données', () => {
  const { D, banc } = NUL();
  const empreinte = () => crypto.createHash('sha1').update(Buffer.from(D.ligne.K.v.buffer)).update(Buffer.from(D.ligne.X[0].v.buffer)).update(Buffer.from(D.camp.lambdaS.v.buffer)).digest('hex');
  const avant = empreinte();
  BANC.rapportsDuBanc(D, { A: BANC.apprendreLePli(D, D.campsDu('B')), B: BANC.apprendreLePli(D, D.campsDu('A')) });
  assert.equal(empreinte(), avant);
  const encore = BANC.jugerLesVariantes(D, OPTIONS);
  assert.equal(JSON.stringify(encore.variantes), JSON.stringify(banc.variantes));
});

// ======================================================================= T-B9 (le script)
fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-joueurs-banc-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');

test('T-B9 le script : UN SEUL regard — K, règles par sha1, sceau de data/cartons/, verrou obligatoire, passe attendue, verrou avant la lecture, sortie jamais écrasée, second passage refusé sans raison ; --comptes sans perte ; --recopier par script', () => {
  const copie = preparerCopie({ base: false });
  try {
    const cli = path.join(copie.serveur, 'scripts', 'joueurs-a-blanc.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'scripts', 'joueurs-a-blanc.mjs'), cli);
    const fab = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-joueurs.mjs'), { args: ['fabriquer', JSON.stringify({ debut: '2025-03-01', jours: 220 })], timeout: 300_000 });
    assert.equal(fab.code, 0, fab.erreurs.slice(-3000));
    const d = (n) => path.join(copie.dossier, n);
    const cartons = path.join(copie.serveur, 'src', 'data', 'cartons');
    const sceau = fs.readdirSync(cartons).sort().map((f) => `- ${sha1(fs.readFileSync(path.join(cartons, f)))} data/cartons/${f}`).join('\n');
    fs.writeFileSync(d('regles.md'), `# Règles du banc (essai)\nK = 11\n\n## Le code de l'étape 33 scellé\n${sceau}\n`);
    fs.writeFileSync(d('regles-sans-sceau.md'), '# Règles du banc (essai)\nK = 11\n');
    fs.writeFileSync(d('passe-libre.json'), JSON.stringify({ running: null }));
    fs.writeFileSync(d('passe-occupee.json'), JSON.stringify({ running: { reason: 'au démarrage' } }));
    const sR = sha1(fs.readFileSync(d('regles.md')));
    const banc = (sortie, enPlus = [], { k = '11', regles = sR, fichierRegles = 'regles.md', passe = 'passe-libre.json', verrou = true } = {}) => executer(copie, cli, { args: ['--banc', '--regles', d(fichierRegles), '--sha1-regles', regles, '--k', k, ...(verrou ? ['--verrou', d('banc.lock')] : []), '--passe', d(passe), '--attente-minutes', '0', '--sortie', d(sortie), ...enPlus], timeout: 600_000 });
    assert.match(banc('a.json', [], { k: '10' }).json.refus, /K doit valoir le nombre de variantes déclarées \(11/);
    assert.match(banc('a.json', [], { regles: '0'.repeat(40) }).json.refus, /les règles ont changé/);
    assert.match(banc('a.json', [], { fichierRegles: 'regles-sans-sceau.md', regles: sha1(fs.readFileSync(d('regles-sans-sceau.md'))) }).json.refus, /ne scellent aucun fichier de data\/cartons/);
    assert.match(banc('a.json', [], { verrou: false }).json.refus, /--verrou <fichier> est obligatoire/);
    assert.match(banc('a.json', [], { passe: 'passe-occupee.json' }).json.refus, /la passe de Pierre tourne/);
    fs.writeFileSync(d('existe.json'), '{}');
    assert.match(banc('existe.json').json.refus, /jamais écrasée/);
    // Le sceau : un fichier de data/cartons/ retouché dans la copie → refus.
    const f0 = path.join(cartons, 'reglagesCartons.js');
    const original = fs.readFileSync(f0, 'utf8');
    fs.writeFileSync(f0, `${original}\n// retouche\n`);
    assert.match(banc('a.json').json.refus, /n’a plus le sha1 scellé/);
    fs.writeFileSync(f0, original);
    assert.ok(!fs.existsSync(d('banc.lock')), 'aucun verrou posé par un refus');
    const premier = banc('premier.json');
    assert.equal(premier.code, 0, `${premier.erreurs.slice(-3000)}\n${premier.sortie.slice(-1500)}`);
    const verrou = JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8'));
    assert.match(verrou.pose, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(verrou.regles.sha1, sR);
    const sortie = JSON.parse(fs.readFileSync(d('premier.json'), 'utf8'));
    assert.equal(sortie.premierRegard, verrou.pose);
    assert.equal(sortie.banc.K, 11);
    assert.equal(sortie.base.lectureSeule, true);
    assert.equal(sortie.empreinteDuMoteur.sha1, '16f2459db183a99576365047da98b7777687ef05');
    assert.equal(sortie.empreinteDuMoteur.candidate, 'f01dd8496f56a415');
    assert.deepEqual(sortie.banc.variantes.map((x) => x.id), [...BANC.VARIANTES_JUGEES]);
    assert.equal(Object.keys(sortie.cartons.scelles).length, fs.readdirSync(cartons).length);
    assert.match(banc('second.json').json.refus, /DÉJÀ été passé/);
    const rejeu = banc('rejeu.json', ['--rejouer-apres-correction', 'correction technique X']);
    assert.equal(rejeu.code, 0, rejeu.erreurs.slice(-3000));
    assert.equal(JSON.parse(fs.readFileSync(d('rejeu.json'), 'utf8')).rejeu.raison, 'correction technique X');
    const rec = executer(copie, cli, { args: ['--recopier', d('premier.json')], timeout: 120_000 });
    assert.equal(rec.code, 0, rec.erreurs.slice(-3000));
    const note = path.join(copie.serveur, 'src', 'data', 'joueurs', 'noteDesJoueurs.js');
    const fixture = path.join(copie.serveur, 'test', 'fixtures', 'banc-joueurs-etape34.json');
    assert.equal(sha1(fs.readFileSync(fixture)), sha1(fs.readFileSync(d('premier.json'))));
    assert.equal(sha1(fs.readFileSync(path.join(copie.serveur, 'test', 'fixtures', 'banc-regles-etape34.md'))), sR);
    const attendu = BANC.texteDeLaNote(BANC.aRecopier(JSON.parse(fs.readFileSync(fixture, 'utf8')), { sortie: { fichier: 'test/fixtures/banc-joueurs-etape34.json', sha1: sha1(fs.readFileSync(fixture)) } }));
    assert.equal(fs.readFileSync(note, 'utf8'), attendu);
    assert.match(executer(copie, cli, { args: ['--note-nulle'], timeout: 60_000 }).json.refus, /jamais remise à null/);
    const c = executer(copie, cli, { args: ['--comptes', '--sortie', d('comptes.json'), '--passe', d('passe-libre.json')], timeout: 300_000 });
    assert.equal(c.code, 0, c.erreurs.slice(-3000));
    const comptes = JSON.parse(fs.readFileSync(d('comptes.json'), 'utf8'));
    assert.equal(comptes.aucunAttenduNiPerte, true);
    assert.doesNotMatch(JSON.stringify(comptes), /"(perte|perteA|perteB|attendu|lambdaG|kappa)"/);
    assert.match(executer(copie, cli, { args: ['--comptes', '--sortie', d('comptes.json')], timeout: 120_000 }).json.refus, /jamais écrasée/);
  } finally {
    copie.nettoyer();
  }
});

test('T-B16 la garde de la base S (80 %) est comptée sur la fenêtre où les tirs cadrés sont JUGÉS (pli A : à partir du 01/01/2024, décision du 03/11) ; les tirs cadrés jugeables aussi', async () => {
  const { comptesDesJoueurs } = await import('../src/data/joueurs/comptesDesJoueurs.js');
  const ligne = (id) => ({ id, titulaire: true, poste: 3, minutes: 90, entre: false, xg: null, xgnp: null, shotsOnTarget: 1, assists: null, xa: null, rating: 7, touches: 30, passes: 20 });
  const obs = (date, avecS) => ({
    r: { matchKey: `k-${date}`, date, league: 'L', home: 1, away: 2, joue: true, attribue: false, prolongation: false, cartonsReleves: false, evenements: [], camps: { home: { club: 1, buts: 0, cadresDEquipe: 1, lignes: [ligne(11)] }, away: { club: 2, buts: 0, cadresDEquipe: 1, lignes: [ligne(21)] } } },
    base: { lambda: true, cadres: avecS, cartons: false },
    dernieres: {}
  });
  const c = comptesDesJoueurs([obs('2023-09-01', false), obs('2023-10-01', false), obs('2024-02-01', true), obs('2024-03-01', true)]);
  const g = c.controles.find((x) => x.id === 'baseCadresMin' && x.pli === 'A');
  assert.equal(g.valeur, 1, 'les deux matchs de 2023 (sans base S) hors de la fenêtre jugée');
  assert.equal(g.seuil, 0.8, 'la garde n’est pas relâchée');
  assert.equal(c.parPli.A.jugeables.cadres, 4, 'deux titulaires jugeables par match, matchs de 2024 seulement');
});
