/**
 * La boucle de correction (étape 26 du plan, 27/10/2026) — LES RÈGLES, pures : les 22 cases, les deux mesures,
 * la décision d'une case, la confiance d'abord, les réglages visés, les transitions d'une proposition, la lignée
 * des versions, et la propriété statistique de la règle « vrai défaut » sur des années simulées (T-ST1, T-ST2).
 *   node --test test/boucleCorrectionRegles.test.mjs        (depuis server/)
 * Aucune base, aucun fichier écrit ; le registre des versions de Pierre est lu en FIXTURE (copie figée du 27/10).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../src/data/correction/regles.js';
import * as M from '../src/data/correction/mesures.js';
import * as L from '../src/data/correction/lignee.js';
import { Z_DU_TRI } from '../src/data/correction/tri.js';
import { MARCHES, JUGE } from '../src/data/calibration.js';
import { zPour } from '../src/bench/guard.js';
import { CANDIDATE_EN_ESSAI, empreinteDesReglages } from '../src/core/engine/engineVersions.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';
import { reglagesDuModeleDeButs } from '../src/core/engine/goalModel.js';
import { simulerDesAnnees } from './aides/correctionAnnees.mjs';
import { versionFabriquee, registreFabrique } from './aides/correctionFabrique.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ICI, '..', 'src');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);
const geler = (o) => {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) geler(v);
    Object.freeze(o);
  }
  return o;
};

// ============================================================ 1. les cases et les seuils

test('les 22 cases : 11 familles (mêmes identifiants, mêmes noms, même ordre que la calibration) × niveau et confiance ; les familles de buts = les marchés de la candidate de l’étape 27', () => {
  assert.deepEqual(R.FAMILLES.map((f) => f.id), MARCHES.map((m) => m.id));
  assert.deepEqual(R.FAMILLES.map((f) => f.libelle), MARCHES.map((m) => m.libelle));
  assert.equal(R.CASES_DU_TRI.length, 22);
  assert.deepEqual(R.CASES_DU_TRI.slice(0, 4), ['result|niveau', 'result|confiance', 'totalGoals|niveau', 'totalGoals|confiance']);
  assert.equal(new Set(R.CASES_DU_TRI).size, 22);
  assert.deepEqual([...R.FAMILLES_DE_BUTS].sort(), [...CANDIDATE_EN_ESSAI.marches].sort());
  assert.deepEqual(R.MARCHES_DU_MODELE_DE_BUTS, R.FAMILLES_DE_BUTS);
  assert.deepEqual(R.FAMILLES.filter((f) => f.lignesParMatch === 2).map((f) => f.id), ['teamGoals', 'teamCorners', 'teamShots', 'teamShotsOnTarget']);
  for (const f of R.FAMILLES) assert.deepEqual(Object.keys(R.ISSUES_DE_LA_FAMILLE).includes(f.id), true, f.id);
});

test('le juge du tri : celui de l’étape 16 tel quel (200 matchs, 5 %, 1 000 tirages) ; 264 regards par an = 22 cases × 12 mois ; z = Φ⁻¹(1 − 0,05 / 528) ≈ 3,733 ; seuil 2 points ; fenêtre 2-3 mois ; mois partiels', () => {
  assert.equal(R.REGARDS_PAR_AN, 264);
  assert.equal(R.REGARDS_PAR_AN, R.CASES_DU_TRI.length * 12);
  proche(Z_DU_TRI, 3.7328, 5e-4, 'z du tri');
  assert.equal(Z_DU_TRI, zPour(0.05, 264));
  assert.equal(R.JUGE_DU_TRI.minBlocs, JUGE.minBlocs);
  assert.equal(R.JUGE_DU_TRI.alpha, JUGE.alpha);
  assert.equal(R.JUGE_DU_TRI.tirages, JUGE.tirages);
  assert.equal(R.JUGE_DU_TRI.graine, 26);
  assert.equal(R.MATCHS_MIN_PAR_MOIS, 200);
  assert.equal(R.SEUIL_D_AMPLEUR, 0.02);
  assert.equal(R.MOIS_DE_LA_FENETRE, 3);
  assert.equal(R.MOIS_MIN_DE_LA_FENETRE, 2);
  assert.equal(R.PREMIER_MOIS_DU_TRI, '2026-10');
  assert.equal(R.MOIS_PARTIELS, true, 'décision de l’orchestrateur : les mois partiels comptent par défaut');
  assert.deepEqual(Object.keys(R.STATUTS), ['en-essai', 'mois-de-changement', 'trop-tot', 'trop-peu', 'dans-la-marge', 'petit-ecart', 'a-surveiller', 'vrai-defaut']);
  assert.ok(!Object.values(R.STATUTS).some((s) => /positi|vert|gain/i.test(String(s.ton))), 'jamais le vert');
  assert.match(R.STATUTS['dans-la-marge'].dit, /^malchance/);
  assert.match(R.STATUTS['vrai-defaut'].dit, /^vrai défaut/);
});

// ============================================================ 2. les mesures d'une ligne

test('contributions : NIVEAU = l’issue de référence de la famille (domicile, plus, oui ; les trois « plus » du combiné), CONFIANCE = l’issue la plus probable de la distribution (à égalité, la première dans l’ordre fixe), jamais le choix gelé', () => {
  const c = (familleId, issues, issue, extra = {}) => M.contributions(familleId, M.lireDistribution(familleId, { issues, ...extra }), issue);
  assert.deepEqual(c('result', { home: 0.5, draw: 0.3, away: 0.2 }, 'home'), { niveau: { a: 0.5, b: 1 }, confiance: { a: 0.5, b: 1, favori: 'home' } });
  assert.deepEqual(c('result', { home: 0.25, draw: 0.25, away: 0.5 }, 'draw'), { niveau: { a: 0.25, b: 0 }, confiance: { a: 0.5, b: 0, favori: 'away' } });
  // Égalité : la première dans l'ordre fixe (home, draw, away).
  assert.equal(c('result', { home: 0.4, draw: 0.2, away: 0.4 }, 'away').confiance.favori, 'home');
  assert.deepEqual(c('bothTeamsScore', { yes: 0.55, no: 0.45 }, 'no'), { niveau: { a: 0.55, b: 0 }, confiance: { a: 0.55, b: 0, favori: 'yes' } });
  assert.deepEqual(c('bothTeamsScore', { yes: 0.4, no: 0.6 }, 'no'), { niveau: { a: 0.4, b: 0 }, confiance: { a: 0.6, b: 1, favori: 'no' } });
  assert.deepEqual(c('totalGoals', { over: 0.42, under: 0.58 }, 'over', { ligne: 2.5 }), { niveau: { a: 0.42, b: 1 }, confiance: { a: 0.58, b: 0, favori: 'under' } });
  assert.deepEqual(c('teamGoals', { over: 0.66, under: 0.34 }, 'over', { ligne: 0.5, equipe: 'away' }), { niveau: { a: 0.66, b: 1 }, confiance: { a: 0.66, b: 1, favori: 'over' } });
  assert.deepEqual(c('totalCorners', { over: 0.53, under: 0.47 }, 'under', { ligne: 9.5, attendu: 10.1 }), { niveau: { a: 0.53, b: 0 }, confiance: { a: 0.53, b: 0, favori: 'over' } });
  // Le combiné : le choix gelé « Domicile & Plus de 2,5 » n'est PAS le favori de la distribution (« Extérieur & Moins »).
  const rt = c('resultAndTotal', { homeOver: 0.3, homeUnder: 0.2, drawOver: 0.05, drawUnder: 0.05, awayOver: 0.05, awayUnder: 0.35 }, 'homeOver', { ligne: 2.5 });
  proche(rt.niveau.a, 0.4, 1e-12, 'les trois « plus » ensemble');
  assert.equal(rt.niveau.b, 1);
  assert.deepEqual(rt.confiance, { a: 0.35, b: 0, favori: 'awayUnder' });
  assert.equal(c('resultAndTotal', { homeOver: 0.3, homeUnder: 0.2, drawOver: 0.05, drawUnder: 0.05, awayOver: 0.05, awayUnder: 0.35 }, 'drawUnder', { ligne: 2.5 }).niveau.b, 0);
  // Ce qui ne se compte pas : dit, jamais en silence.
  assert.deepEqual(c('result', { home: 0.5, draw: 0.3, away: 0.2 }, 'yes'), { raison: 'issueAbsente' });
  assert.equal(M.lireDistribution('result', { issues: { home: 0.5, away: 0.5 } }), null, 'une issue manque');
  assert.equal(M.lireDistribution('result', { issues: { home: 1.2, draw: 0, away: 0 } }), null, 'probabilité hors de [0 ; 1]');
  assert.equal(M.lireDistribution('result', 'pas du JSON'), null);
  assert.equal(M.lireDistribution('result', null), null);
  assert.deepEqual(M.contributions('result', null, 'home'), { raison: 'sansDistribution' });
  assert.deepEqual(M.contributions('scoreExact', { issues: {} }, '1-0'), { raison: 'marcheInconnu' });
  assert.deepEqual(M.lireDistribution('totalGoals', '{"ligne":2.5,"issues":{"over":0.6,"under":0.4},"provenance":"cotes-1n2-xg"}'), { issues: { over: 0.6, under: 0.4 }, ligne: 2.5, equipe: null, provenance: 'cotes-1n2-xg' });
});

// ============================================================ 3. la décision d'une case

const juge = (verdict, gain) => ({ verdict, gain, fourchette: [gain - 0.01, gain + 0.01], ecartType: 0.003 });
const courant = (matchs = 1400, partiel = false, ecart = -0.03) => ({ mois: '2027-01', lignes: matchs, matchs, ecart, partiel });

test('decisionDeLaCase : les 8 statuts dans leur ordre — en essai, mois de changement (partiel sous 200 matchs), trop peu, trop tôt (un mois), malchance, petit écart (1,5 point), à surveiller (les deux derniers mois divergent), vrai défaut', () => {
  const f3 = [{ mois: '2026-11', ecart: 0.01 }, { mois: '2026-12', ecart: -0.03 }, { mois: '2027-01', ecart: -0.04 }];
  const vrai = { courant: courant(), fenetre: f3, juge: juge('moins-bon', -0.031) };
  assert.deepEqual(M.decisionDeLaCase(vrai), { statut: 'vrai-defaut', sens: 'trop-haut' });
  assert.equal(M.decisionDeLaCase({ ...vrai, enEssai: { candidate: 'modele-buts-v1', etape: '27' } }).statut, 'en-essai', 'en essai passe avant tout');
  assert.equal(M.decisionDeLaCase({ ...vrai, courant: courant(150, true) }).statut, 'mois-de-changement');
  assert.equal(M.decisionDeLaCase({ ...vrai, courant: courant(150, false) }).statut, 'trop-peu');
  assert.equal(M.decisionDeLaCase({ ...vrai, courant: courant(250, true), fenetre: [{ mois: '2027-01', ecart: -0.04 }], juge: null }).statut, 'trop-tot', 'un mois partiel assez fourni compte (mais seul : trop tôt)');
  assert.equal(M.decisionDeLaCase({ ...vrai, juge: juge('pas-assez-de-matchs', -0.03) }).statut, 'trop-peu');
  assert.equal(M.decisionDeLaCase({ ...vrai, juge: juge('pas-prouve', -0.03) }).statut, 'dans-la-marge');
  assert.equal(M.decisionDeLaCase({ ...vrai, juge: juge('moins-bon', -0.015) }).statut, 'petit-ecart', '1,5 point : réel mais petit');
  assert.equal(M.decisionDeLaCase({ ...vrai, juge: juge('moins-bon', -0.02) }).statut, 'vrai-defaut', '2 points pile : à corriger');
  assert.equal(M.decisionDeLaCase({ ...vrai, fenetre: [{ mois: '2026-12', ecart: -0.02 }, { mois: '2027-01', ecart: 0.004 }] }).statut, 'a-surveiller');
  assert.equal(M.decisionDeLaCase({ ...vrai, fenetre: [{ mois: '2026-12', ecart: 0 }, { mois: '2027-01', ecart: -0.05 }] }).statut, 'a-surveiller', 'un mois à zéro n’est dans aucun sens');
  assert.deepEqual(M.decisionDeLaCase({ courant: courant(1400, false, 0.03), fenetre: [{ mois: '2026-12', ecart: 0.03 }, { mois: '2027-01', ecart: 0.02 }], juge: juge('retenu', 0.025) }), { statut: 'vrai-defaut', sens: 'trop-bas' });
  assert.equal(M.statutDit('vrai-defaut'), 'vrai défaut : à corriger');
});

test('sensDit : le sens d’un écart en mots, sans jargon', () => {
  assert.equal(M.sensDit('bothTeamsScore|niveau', -0.03), 'annonce trop souvent « les deux équipes marquent »');
  assert.equal(M.sensDit('totalCorners|niveau', 0.03), 'n’annonce pas assez souvent « plus de corners que la ligne »');
  assert.equal(M.sensDit('result|niveau', -0.05), 'annonce trop souvent « victoire de l’équipe qui reçoit »');
  assert.match(M.sensDit('teamGoals|confiance', -0.03), /^trop sûr de lui/);
  assert.match(M.sensDit('teamGoals|confiance', 0.03), /^pas assez sûr de lui/);
  assert.equal(M.sensDit('teamGoals|confiance', 0), null);
  for (const cas of R.CASES_DU_TRI) for (const x of [-0.03, 0.03]) assert.doesNotMatch(M.sensDit(cas, x), /\bK\b|lignée|variante|\bz\b|canonique/i);
});

// ============================================================ 4. la confiance d'abord

const uneCase = (cas, statut, sens = null, ecart = null) => {
  const { famille, mesure } = R.lireLaCase(cas);
  return { cas, famille, mesure, statut, sens, fenetre: ecart === null ? null : { ecart } };
};

test('confiance d’abord (constat 6) : une confiance de famille de buts « trop sûr » en vrai défaut met le NIVEAU des familles de buts en attente (aucun réglage de niveau ce mois-là) ; « pas assez sûr » ne bloque rien ; corners et tirs : leur propre confiance seulement ; les cases reçues ne sont jamais modifiées', () => {
  const cases = geler([
    uneCase('totalGoals|confiance', 'vrai-defaut', 'trop-haut', -0.04),
    uneCase('bothTeamsScore|niveau', 'vrai-defaut', 'trop-bas', 0.026),
    uneCase('teamGoals|niveau', 'vrai-defaut', 'trop-bas', 0.021),
    uneCase('result|niveau', 'vrai-defaut', 'trop-haut', -0.03),
    uneCase('teamCorners|niveau', 'vrai-defaut', 'trop-bas', 0.036),
    uneCase('teamCorners|confiance', 'dans-la-marge', 'trop-haut', -0.004)
  ]);
  const r = M.confianceDAbord(cases);
  const parCas = Object.fromEntries(r.map((c) => [c.cas, c.aRevoir]));
  assert.equal(parCas['bothTeamsScore|niveau'], 'apres-la-confiance');
  assert.equal(parCas['teamGoals|niveau'], 'apres-la-confiance');
  assert.equal(parCas['result|niveau'], null, 'le 1N2 n’est pas une famille de buts');
  assert.equal(parCas['teamCorners|niveau'], null, 'la confiance des corners n’est pas un vrai défaut');
  assert.equal(parCas['totalGoals|confiance'], null);
  assert.deepEqual(R.levierDeLaCase(r.find((c) => c.cas === 'bothTeamsScore|niveau'), { avecModeleDeButs: true }), { attente: 'confiance', phrase: R.A_REVOIR_APRES_LA_CONFIANCE });
  // « Pas assez sûr » : rien en attente.
  const pasAssez = M.confianceDAbord([uneCase('totalGoals|confiance', 'vrai-defaut', 'trop-bas', 0.04), uneCase('bothTeamsScore|niveau', 'vrai-defaut', 'trop-bas', 0.03)]);
  assert.equal(pasAssez[1].aRevoir, null);
  // Corners : leur propre confiance « trop sûr » met leur niveau en attente, pas celui des buts.
  const corners = M.confianceDAbord([uneCase('totalCorners|confiance', 'vrai-defaut', 'trop-haut', -0.05), uneCase('totalCorners|niveau', 'vrai-defaut', 'trop-bas', 0.04), uneCase('bothTeamsScore|niveau', 'vrai-defaut', 'trop-haut', -0.03)]);
  assert.equal(corners[1].aRevoir, 'apres-la-confiance');
  assert.equal(corners[2].aRevoir, null);
  assert.notEqual(r[1], cases[1], 'des cases neuves');
});

// ============================================================ 5. les réglages visés

const vraiDefaut = (cas, ecart, extra = {}) => ({ ...uneCase(cas, 'vrai-defaut', ecart < 0 ? 'trop-haut' : 'trop-bas', ecart), aRevoir: null, ...extra });

test('levierDeLaCase : rho pour le niveau des deux marquent (trop haut → monte), prior pour la confiance des familles de buts (trop sûr → monte), melange.sans.wT seulement si l’écart vient des matchs cotés en 1N2 (constat 16) ; sinon « demande du code » ; rien sans le modèle de buts ; rien hors d’un vrai défaut', () => {
  assert.equal(R.levierDeLaCase(uneCase('bothTeamsScore|niveau', 'a-surveiller', 'trop-haut', -0.03), { avecModeleDeButs: true }), null);
  assert.deepEqual(R.levierDeLaCase(vraiDefaut('bothTeamsScore|niveau', -0.03), { avecModeleDeButs: true }).cle, 'modeleDeButs.rho');
  assert.equal(R.levierDeLaCase(vraiDefaut('bothTeamsScore|niveau', -0.03), { avecModeleDeButs: true }).sens, 'monter');
  assert.equal(R.levierDeLaCase(vraiDefaut('bothTeamsScore|niveau', 0.03), { avecModeleDeButs: true }).sens, 'descendre');
  for (const f of R.FAMILLES_DE_BUTS) {
    assert.equal(R.levierDeLaCase(vraiDefaut(`${f}|confiance`, -0.03), { avecModeleDeButs: true }).cle, 'modeleDeButs.prior');
    assert.equal(R.levierDeLaCase(vraiDefaut(`${f}|confiance`, -0.03), { avecModeleDeButs: true }).sens, 'monter');
    assert.equal(R.levierDeLaCase(vraiDefaut(`${f}|confiance`, 0.03), { avecModeleDeButs: true }).sens, 'descendre');
  }
  // wT : seulement depuis les régimes « cotes-1n2-* ».
  const regimes1n2 = { 'cotes-1n2-xg': { lignes: 400, matchs: 400, sa: 200, sb: 180 }, 'cotes-plusmoins-xg': { lignes: 900, matchs: 900, sa: 450, sb: 449 } };
  const w = R.levierDeLaCase(vraiDefaut('totalGoals|niveau', -0.02), { avecModeleDeButs: true, regimes: regimes1n2 });
  assert.equal(w.cle, 'modeleDeButs.melange.sans.wT');
  assert.equal(w.sens, 'descendre');
  proche(w.regimes.ecart1n2, -0.05, 1e-12, 'écart des matchs cotés en 1N2');
  const ailleurs = { 'cotes-1n2-xg': { lignes: 400, matchs: 400, sa: 200, sb: 199 }, 'cotes-plusmoins-xg': { lignes: 900, matchs: 900, sa: 450, sb: 423 } };
  assert.deepEqual(R.levierDeLaCase(vraiDefaut('teamGoals|niveau', -0.02), { avecModeleDeButs: true, regimes: ailleurs }).code, true);
  const tropPeu = { 'cotes-1n2-buts': { lignes: 150, matchs: 150, sa: 75, sb: 60 } };
  assert.equal(R.levierDeLaCase(vraiDefaut('resultAndTotal|niveau', -0.1), { avecModeleDeButs: true, regimes: tropPeu }).code, true, 'moins de 200 matchs cotés en 1N2 : on ne sait pas');
  assert.equal(R.levierDeLaCase(vraiDefaut('totalGoals|niveau', -0.02), { avecModeleDeButs: true, regimes: { 'cotes-1n2-xg': { lignes: 400, matchs: 400, sa: 200, sb: 220 } } }).code, true, 'les matchs cotés en 1N2 vont dans l’autre sens');
  // Sans levier : dit.
  assert.deepEqual(R.levierDeLaCase(vraiDefaut('result|niveau', -0.03), { avecModeleDeButs: true }), { code: true, phrase: R.DEMANDES_DU_CODE.result });
  assert.deepEqual(R.levierDeLaCase(vraiDefaut('teamShots|confiance', -0.03), { avecModeleDeButs: true }), { code: true, phrase: R.DEMANDES_DU_CODE.statistiques });
  assert.deepEqual(R.levierDeLaCase(vraiDefaut('bothTeamsScore|niveau', -0.03), { avecModeleDeButs: false }), { code: true, phrase: R.DEMANDES_DU_CODE.ancienModele }, 'sans le modèle de buts : plus de defaultCorrelation (décision 5)');
  assert.deepEqual(R.levierDeLaCase(vraiDefaut('bothTeamsScore|niveau', -0.03, { aRevoir: 'apres-la-confiance' }), { avecModeleDeButs: true }).attente, 'confiance');
});

test('les leviers (décision 5) : des sous-clés du modèle de buts SEULEMENT — ni defaultCorrelation ni homeAdvantage ; chacune existe dans la candidate de l’étape 27 et ses bornes passent la validation du modèle ; les règles ne visent que rho, prior et melange.sans.wT', () => {
  const cles = Object.keys(R.LEVIERS);
  for (const retire of ['defaultCorrelation', 'homeAdvantage']) {
    assert.ok(!cles.includes(retire), retire);
    assert.ok(R.LEVIERS_RETIRES.includes(retire), retire);
  }
  const base = CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs;
  const lire = (o, chemin) => chemin.split('.').reduce((x, k) => x?.[k], o);
  for (const cle of cles) {
    assert.match(cle, /^modeleDeButs\./, cle);
    const sous = cle.slice('modeleDeButs.'.length);
    assert.equal(typeof lire(base, sous), 'number', `${cle} existe dans la candidate de l’étape 27`);
    const l = R.LEVIERS[cle];
    for (const v of l.ouvertes ? [l.min + l.pas, l.max - l.pas] : [l.min, l.max]) {
      const copie = JSON.parse(JSON.stringify(base));
      const parties = sous.split('.');
      parties.slice(0, -1).reduce((x, k) => x[k], copie)[parties.at(-1)] = v;
      assert.doesNotThrow(() => reglagesDuModeleDeButs({ modeleDeButs: copie }), `${cle} = ${v}`);
    }
  }
  assert.deepEqual(Object.values(R.REGLES_DE_PROPOSITION).map((r) => r.cle).sort(), ['modeleDeButs.melange.sans.wT', 'modeleDeButs.prior', 'modeleDeButs.rho']);
  for (const r of Object.values(R.REGLES_DE_PROPOSITION)) assert.ok(cles.includes(r.cle), r.cle);
  assert.deepEqual(new Set(Object.values(R.LEVIERS).map((l) => l.court)).size, cles.length, 'un mot court par levier');
});

// ============================================================ 6. les transitions d'une proposition

test('transitionPermise : chaque transition de la machine à états, et les interdites (accepter sans banc, mettre à l’essai sans accord, refuser une adoptée, rien depuis un état final) ; un banc interrompu revient à « proposee » (constat 2) ; la reprise « acceptee → a-blanc » (constat 3)', () => {
  for (const [evenement, t] of Object.entries(R.TRANSITIONS)) for (const etat of t.depuis) assert.equal(R.transitionPermise(etat, evenement), t.vers, `${etat} --${evenement}-->`);
  assert.equal(R.transitionPermise('au-banc', 'banc-interrompu'), 'proposee');
  assert.equal(R.transitionPermise('acceptee', 'mise-a-l-essai'), 'a-blanc');
  assert.equal(R.transitionPermise('proposee', 'acceptee'), null, 'pas d’accord avant le banc');
  assert.equal(R.transitionPermise('bancee', 'mise-a-l-essai'), null, 'jamais à blanc sans l’accord de Pierre');
  assert.equal(R.transitionPermise('proposee', 'refusee'), 'refusee', 'refuser avant le banc');
  assert.equal(R.transitionPermise('a-blanc', 'adoptee'), null, 'jamais adoptée sans jugement');
  assert.equal(R.transitionPermise('adoptee', 'refusee'), null);
  assert.equal(R.transitionPermise('jugee', 'mise-a-l-essai'), null);
  for (const fin of R.ETATS_FINAUX) for (const e of Object.keys(R.TRANSITIONS)) assert.equal(R.transitionPermise(fin, e), null, `${fin} est final (${e})`);
  assert.equal(R.transitionPermise('proposee', 'tri'), null);
  for (const t of Object.values(R.TRANSITIONS)) {
    assert.ok(R.ETATS_DE_PROPOSITION.includes(t.vers));
    for (const e of t.depuis) assert.ok(R.ETATS_DE_PROPOSITION.includes(e));
  }
});

// ============================================================ 7. la lignée

const DEFAUTS = DEFAULT_ENGINE_CONFIG_BY_SPORT.football;
const MDB = CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs;
const CODE_A = 'a'.repeat(40);
const CODE_B = 'b'.repeat(40);
function registreDEssai() {
  const v1 = versionFabriquee(1, { code: CODE_A, reglages: DEFAUTS, creeeLe: '2026-09-20T10:00:00.000Z', origine: 'premier-demarrage' });
  const v2 = versionFabriquee(2, { code: CODE_A, reglages: { ...DEFAUTS, valueBookmakers: ['pinnacle'], kellyFraction: 0.5 }, creeeLe: '2026-10-10T08:00:00.000Z', origine: 'reglages' });
  const v3 = versionFabriquee(3, { code: CODE_B, reglages: DEFAUTS, creeeLe: '2026-11-01T01:00:00.000Z' });
  const v4 = versionFabriquee(4, { code: CODE_B, reglages: { ...DEFAUTS, modeleDeButs: MDB }, creeeLe: '2026-12-05T00:00:00.000Z', origine: 'adoption' });
  const v5 = versionFabriquee(5, { code: CODE_B, reglages: { ...DEFAUTS, defaultCorrelation: -0.1 }, creeeLe: '2027-01-02T00:00:00.000Z', origine: 'reglages' });
  return registreFabrique({
    versions: [v1, v2, v3, v4, v5],
    pile: [1, 2, 3],
    journal: [
      { le: '2026-09-20T10:00:00.000Z', action: 'creation', version: 1, origine: 'premier-demarrage' },
      { le: '2026-10-10T08:00:00.000Z', action: 'creation', version: 2, depuis: 1, origine: 'reglages' },
      { le: '2026-11-01T01:00:00.000Z', action: 'creation', version: 3, depuis: 2, origine: 'code' },
      { le: '2026-12-05T00:00:00.000Z', action: 'creation', version: 4, depuis: 3, origine: 'adoption' },
      { le: '2026-12-05T00:00:00.000Z', action: 'adoption', version: 4, depuis: 3, candidate: 'essai', etape: '27' },
      { le: '2026-12-20T12:00:00.000Z', action: 'retour', version: 3, depuis: 4 },
      { le: '2027-01-02T00:00:00.000Z', action: 'creation', version: 5, depuis: 3, origine: 'reglages' },
      { le: '2027-01-02T06:00:00.000Z', action: 'remise-en-service', version: 3, depuis: 5 }
    ]
  });
}

test('la lignée : mêmes probabilités = même code et mêmes réglages hors réglages de PARI (vos bookmakers, Kelly…) ; un réglage du modèle (defaultCorrelation, modeleDeButs) fait une autre lignée ; la copie des réglages est profonde (rien de reçu n’est modifié)', () => {
  const brut = registreDEssai();
  assert.deepEqual(L.ligneeDe(brut, 1).versions, [1, 2]);
  assert.deepEqual(L.ligneeDe(brut, 2).versions, [1, 2]);
  assert.deepEqual(L.ligneeDe(brut, 3).versions, [3], 'autre code');
  assert.deepEqual(L.ligneeDe(brut, 4).versions, [4], 'le modèle de buts change les probabilités');
  assert.equal(L.ligneeDe(brut, 4).avecModeleDeButs, true);
  assert.equal(L.ligneeDe(brut, 3).avecModeleDeButs, false);
  assert.deepEqual(L.ligneeDe(brut, 5).versions, [5], 'defaultCorrelation n’est pas un réglage de pari');
  assert.equal(L.ligneeDe(brut, 99), null);
  for (const cle of R.REGLAGES_DE_PARI) {
    const autre = versionFabriquee(9, { code: CODE_A, reglages: { ...DEFAUTS, [cle]: cle === 'valueBookmakers' ? ['unibet_fr'] : 0.123 }, creeeLe: '2026-10-01T00:00:00.000Z' });
    assert.equal(L.empreinteDesPronostics(autre), L.empreinteDesPronostics(brut.versions[0]), `${cle} ne change pas la lignée`);
  }
  const fige = geler(JSON.parse(JSON.stringify({ ...DEFAUTS, modeleDeButs: MDB })));
  const avant = empreinteDesReglages(fige);
  const sans = L.sansReglagesDePari(fige);
  assert.equal(empreinteDesReglages(fige), avant, 'les réglages reçus ne bougent pas (B43)');
  for (const cle of R.REGLAGES_DE_PARI) assert.ok(!(cle in sans), cle);
  assert.ok('modeleDeButs' in sans && 'defaultCorrelation' in sans);
  sans.modeleDeButs.rho = 0.2;
  assert.equal(fige.modeleDeButs.rho, MDB.rho, 'copie profonde');
});

test('la chronologie et le mois : la version en service à la FIN du mois fait la lignée jugée ; couvert du 1er à 00:00 UTC au dernier jour à 24:00 UTC, sinon PARTIEL (un changement le 1er à 01:00 UTC suffit) ; un retour arrière découpe le mois ; rien avant la première version ; un journal absent ou incohérent n’est jamais deviné', () => {
  const brut = registreDEssai();
  const c = L.chronologie(brut);
  assert.equal(c.probleme, null);
  assert.deepEqual(c.periodes.map((p) => [p.version, p.de.slice(0, 16), p.a?.slice(0, 16) ?? null]), [
    [1, '2026-09-20T10:00', '2026-10-10T08:00'],
    [2, '2026-10-10T08:00', '2026-11-01T01:00'],
    [3, '2026-11-01T01:00', '2026-12-05T00:00'],
    [4, '2026-12-05T00:00', '2026-12-20T12:00'],
    [3, '2026-12-20T12:00', '2027-01-02T00:00'],
    [5, '2027-01-02T00:00', '2027-01-02T06:00'],
    [3, '2027-01-02T06:00', null]
  ]);
  const oct = L.ligneeALaFinDu(brut, '2026-10');
  assert.equal(oct.versionEnService, 2);
  assert.deepEqual(oct.versions, [1, 2]);
  assert.equal(oct.couverture.complet, true, 'v1 puis v2 : la même lignée tout le mois');
  const nov = L.ligneeALaFinDu(brut, '2026-11');
  assert.deepEqual([nov.versionEnService, nov.versions, nov.couverture.partiel, nov.couverture.depuis], [3, [3], true, '2026-11-01T01:00:00.000Z']);
  const dec = L.ligneeALaFinDu(brut, '2026-12');
  assert.deepEqual([dec.versionEnService, dec.couverture.partiel, dec.couverture.depuis, dec.couverture.jours], [3, true, '2026-12-20T12:00:00.000Z', 15.5]);
  assert.deepEqual(dec.couverture.periodes.map((p) => p.version), [3, 3]);
  const jan = L.ligneeALaFinDu(brut, '2027-01');
  assert.equal(jan.couverture.partiel, true, 'six heures de la version 5 le 2 janvier');
  assert.equal(jan.enServiceDepuis, '2027-01-02T06:00:00.000Z');
  assert.equal(L.ligneeALaFinDu(brut, '2026-09').couverture.depuis, '2026-09-20T10:00:00.000Z');
  assert.equal(L.ligneeALaFinDu(brut, '2026-08'), null, 'aucune version encore');
  assert.equal(L.moisCouvert(brut, '2026-10', oct), true);
  assert.equal(L.moisCouvert(brut, '2026-11', nov), false);
  assert.match(L.chronologie({ ...brut, journal: [] }).probleme, /journal/);
  assert.match(L.ligneeALaFinDu({ ...brut, journal: undefined }, '2026-10').probleme, /journal/);
  assert.match(L.chronologie({ ...brut, enService: 5, pile: [1, 2, 3, 5] }).probleme, /finit sur la version 3/);
  assert.match(L.chronologie({ ...brut, journal: [...brut.journal, { le: '2027-02-01T00:00:00.000Z', action: 'creation', version: 7 }] }).probleme, /version 7, absente/);
  assert.throws(() => L.ligneeALaFinDu(brut, '2026-13'), RangeError);
});

test('le registre de Pierre (copie figée du 27/10) : les versions 4 (code, 22/10) et 5 (vos bookmakers seuls, 23/10) forment UNE lignée ; 1, 2 et 3 chacune la leur ; octobre 2026 est un mois PARTIEL de la lignée {4, 5}, en service depuis le 22/10 à 15:45 UTC', () => {
  const brut = JSON.parse(fs.readFileSync(path.join(ICI, 'fixtures', 'engine-versions-27-en-essai.json'), 'utf8'));
  assert.deepEqual(L.ligneeDe(brut, 5).versions, [4, 5]);
  assert.deepEqual(L.ligneeDe(brut, 3).versions, [3]);
  assert.deepEqual(L.ligneeDe(brut, 1).versions, [1]);
  assert.equal(new Set([1, 2, 3, 4].map((n) => L.empreinteDesPronostics(brut.versions.find((v) => v.numero === n)))).size, 4);
  const oct = L.ligneeALaFinDu(brut, '2026-10');
  assert.equal(oct.versionEnService, 5);
  assert.deepEqual(oct.versions, [4, 5]);
  assert.equal(oct.couverture.partiel, true);
  assert.equal(oct.couverture.depuis, '2026-10-22T15:45:40.528Z');
  assert.equal(oct.avecModeleDeButs, false, 'le modèle de buts unique n’est pas en service (il est en essai)');
});

// ============================================================ 8. la propriété statistique de la règle (T-ST1, T-ST2)

const SIGMA = Object.fromEntries(R.CASES_DU_TRI.map((c) => [c, R.familleDe(R.lireLaCase(c).famille).lignesParMatch === 2 ? 0.35 : R.lireLaCase(c).mesure === 'niveau' ? 0.48 : 0.45]));
const PART = Object.fromEntries(R.CASES_DU_TRI.map((c) => [c, 0.9]));
const LPM = Object.fromEntries(R.CASES_DU_TRI.map((c) => [c, R.familleDe(R.lireLaCase(c).famille).lignesParMatch]));

test('T-ST1 : 2 000 années SANS défaut (22 cases indépendantes, volumes réels du calendrier), jugées par le code du tri (fenêtre, juge à m = 264 en loi normale, seuil, même sens) — au plus 8 % des années ont un faux « vrai défaut »', (t) => {
  const r = simulerDesAnnees({ annees: 2000, graine: 2601, profil: 'reel', sigma: SIGMA, part: PART, lpm: LPM });
  t.diagnostic(JSON.stringify({ anneesAvecAuMoinsUnVraiDefaut: r.anneesAvecAuMoinsUnVraiDefaut, vraisDefautsParAn: r.vraisDefautsParAn }));
  assert.ok(r.anneesAvecAuMoinsUnVraiDefaut <= 0.08, JSON.stringify(r));
  assert.ok(r.anneesAvecAuMoinsUnVraiDefaut >= 0.005, `la règle n’est pas muette : ${JSON.stringify(r)}`);
});

test('T-ST2 : un vrai défaut de 6 points sur une case (« Les 2 équipes marquent », niveau) est trouvé en 3 mois au plus dans au moins 90 % des essais', (t) => {
  const r = simulerDesAnnees({ annees: 500, graine: 2602, profil: 'reel', sigma: SIGMA, part: PART, lpm: LPM, defaut: { cas: 'bothTeamsScore|niveau', delta: -0.06 } });
  t.diagnostic(JSON.stringify(r.detecteAuPlusTardEn));
  assert.ok(r.detecteAuPlusTardEn['3 mois'] >= 0.9, JSON.stringify(r));
});

// ============================================================ 9. qui écrit quoi

test('qui écrit : depotCorrections.js est le SEUL module qui écrit les tables correction_* (leur DDL dans matchStatsDb.js seulement) ; les règles, les mesures, la lignée et le tri n’écrivent rien ; aucun module de la boucle n’écrit les réglages ni n’adopte ; aucun ne lit predictions.json ; aucun test n’appelle un écrivain de la boucle dans son processus', () => {
  const fichiers = fs.readdirSync(SRC, { recursive: true }).filter((f) => String(f).endsWith('.js')).map((f) => String(f).split(path.sep).join('/'));
  const lire = (f) => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const avec = (motif) => fichiers.filter((f) => motif.test(lire(f))).sort();
  assert.deepEqual(avec(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+correction_/), ['data/correction/depotCorrections.js']);
  assert.deepEqual(avec(/CREATE\s+(TABLE|TRIGGER|INDEX)\s+IF\s+NOT\s+EXISTS\s+(idx_)?correction_/), ['data/db/matchStatsDb.js']);
  const boucle = fichiers.filter((f) => f.startsWith('data/correction/'));
  // Partie B (28/10/2026) : six fichiers de plus (propositions, mise à l'essai, banc et son enfant, boucle, état lu).
  // Partie D (28/10/2026) : un de plus, la fiche du résumé du mois (ficheDuMois.js).
  assert.deepEqual(boucle, [
    'data/correction/bancCorrectionEnfant.js',
    'data/correction/bancDesCorrections.js',
    'data/correction/boucle.js',
    'data/correction/depotCorrections.js',
    'data/correction/etatDesCorrections.js',
    'data/correction/ficheDuMois.js',
    'data/correction/lignee.js',
    'data/correction/mesures.js',
    'data/correction/miseALEssai.js',
    'data/correction/propositions.js',
    'data/correction/regles.js',
    'data/correction/tri.js'
  ]);
  // Partie D (28/10/2026) : la fiche du résumé du mois (ficheDuMois.js) n’écrit rien non plus.
  for (const f of ['data/correction/regles.js', 'data/correction/mesures.js', 'data/correction/lignee.js', 'data/correction/tri.js', 'data/correction/propositions.js', 'data/correction/etatDesCorrections.js', 'data/correction/ficheDuMois.js']) {
    assert.doesNotMatch(lire(f), /writeJsonAtomic|writeFileSync|\.run\(|(database|db)\.exec\(|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/, f);
  }
  for (const f of boucle) {
    assert.doesNotMatch(lire(f), /\b(updateEngineConfig|resetEngineConfig|remplacerReglagesDuMoteur|adopterLaCandidate|revenirALaVersionPrecedente|declarerVariantes|noterLEssai)\b/, f);
    // Partie B : miseALEssai.js est le SEUL module de la boucle qui met une candidate en essai ou compte une correction.
    if (f !== 'data/correction/miseALEssai.js') assert.doesNotMatch(lire(f), /\b(proposerUneCandidate|mettreLaCandidateEnEssai|declarerVariante)\s*\(/, f);
    assert.doesNotMatch(lire(f), /predictions\.json|predictionsRepository/, f);
  }
  const ecrivains = ['ecrireLeTri', 'creerUneProposition', 'changerLEtat', 'ajouterAuJournal', 'ecrireUnResume', 'noterUnEssaiDeResume', 'faireLaBoucle', 'mettreALEssaiLaSuivante', 'libererLaPlace', 'declarerAvantLeBanc', 'synchroniserAvecLesVersions', 'lancerLeBancDUneCorrection'];
  for (const nom of fs.readdirSync(ICI).filter((f) => f.endsWith('.test.mjs'))) {
    const source = fs.readFileSync(path.join(ICI, nom), 'utf8').replace(/const ecrivains = \[[^\]]*\];/, '');
    for (const f of ecrivains) assert.doesNotMatch(source, new RegExp(`\\b${f}\\s*\\(`), `${nom} appelle ${f} dans le processus des tests`);
  }
});
