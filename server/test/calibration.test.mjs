/**
 * La calibration et le suivi mensuel (étape 20 du plan, 13/10/2026) : ses règles et son calcul.
 *   node --test test/calibration.test.mjs        (depuis server/)
 *
 * Deux sortes de vérifications :
 *  1. les RÈGLES PURES de src/data/calibration.js, sur des cas écrits à la main : les tranches (bornes
 *     [de ; a[), la révision retenue face au coup d'envoi, le règlement (prolongation, attribué, 0-0), la
 *     tranche maigre, le « 1er du mois à 6 h » de Paris ;
 *  2. le CALCUL RÉEL dans une copie isolée (test/aides/script-calibration.mjs, phase « tout ») : la base
 *     d'essai, des pronostics gelés et des pièges plantés par SQL, l'heure figée au 05/10/2026 — et les
 *     valeurs attendues recalculées par un SECOND chemin (SQL et règles réécrites dans le script, puis ici
 *     avec removeMargin et comparer pris à part), jamais recopiées de la sortie de l'appli : les lignes de
 *     chaque lecture, les tranches, les juges, la valeur de clôture des pronostics et des paris, le gel du
 *     mois écoulé (une fois, jamais réécrit), le mois en cours (jamais figé), la route.
 * Le rendu de l'écran est vérifié à part (calibrationEcran.test.mjs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as C from '../src/data/calibration.js';
import { TRANCHES_DIXIEMES, calibrationParTranche } from '../src/bench/metrics.js';
import { comparer } from '../src/bench/guard.js';
import { removeMargin } from '../src/core/market/marginRemoval.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-calibration.mjs');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);

/** Le calcul réel, une fois pour tout le fichier (≈ 6 s) : une copie isolée, les scripts du serveur avec (la passe les importe). */
let sortie = null;
function reel() {
  if (sortie) return sortie;
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: ['tout'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `sortie illisible : ${r.sortie.slice(-500)}`);
    sortie = r.json;
    return sortie;
  } finally {
    copie.nettoyer();
  }
}

/** Les cases d'une liste de lignes { p, realise, fixtureKey }, recomptées ici : dixièmes, [de ; a[, 1 dans la dernière. */
function tranchesALaMain(lignes) {
  const t = Array.from({ length: 10 }, () => ({ n: 0, matchs: new Set(), sp: 0, sr: 0 }));
  for (const l of lignes) {
    const i = Math.min(9, Math.floor(l.p * 10 + 1e-12));
    t[i].n++;
    t[i].matchs.add(l.fixtureKey);
    t[i].sp += l.p;
    if (l.realise) t[i].sr++;
  }
  return t.map((x) => ({ n: x.n, matchs: x.matchs.size, annonce: x.n ? x.sp / x.n : null, realise: x.n ? x.sr / x.n : null }));
}

const lignesDe = (attendus) => Object.entries(attendus.lignes).map(([cle, l]) => ({ cle, ...l }));

// ============================================================ 1. les règles pures

test('tranches : les dixièmes du banc d’essai (metrics.js), [de ; a[ — 0,6 dans 60-70 %, 0,5999 dans 50-60 %, 1 dans la dernière ; chaque tranche dit ses pronostics et ses matchs ; la somme retombe sur le total', () => {
  assert.equal(C.TRANCHES, TRANCHES_DIXIEMES, 'les mêmes bornes que le banc, pas une copie');
  const lignes = [
    { fixtureKey: 'm1', cle: 'm1|a', p: 0.6, realise: true, choice: 'x', issue: 'x' },
    { fixtureKey: 'm1', cle: 'm1|b', p: 0.6999, realise: false, choice: 'x', issue: 'y' },
    { fixtureKey: 'm2', cle: 'm2|a', p: 0.5999, realise: true, choice: 'x', issue: 'x' },
    { fixtureKey: 'm3', cle: 'm3|a', p: 1, realise: true, choice: 'x', issue: 'x' },
    { fixtureKey: 'm4', cle: 'm4|a', p: 0, realise: false, choice: 'x', issue: 'y' },
    { fixtureKey: 'm4', cle: 'm4|b', p: 0.05, realise: true, choice: 'x', issue: 'x' }
  ].map((l) => ({ ...l, marketId: 'result', league: 'EPL' }));
  const it = C.agregerLaVue(lignes);
  let e = it.next();
  while (!e.done) e = it.next();
  const g = e.value.global;
  const t = g.tranches;
  assert.deepEqual(t.map((x) => x.pronostics), [2, 0, 0, 0, 0, 1, 2, 0, 0, 1]);
  assert.deepEqual(t.map((x) => x.matchs), [1, 0, 0, 0, 0, 1, 1, 0, 0, 1], 'deux pronostics d’un même match = un match');
  proche(t[6].annonce, (0.6 + 0.6999) / 2, 1e-12, 'annoncé de 60-70 %');
  assert.equal(t[6].realise, 0.5);
  proche(t[6].ecart, 0.5 - (0.6 + 0.6999) / 2, 1e-12, 'écart = réalisé − annoncé');
  assert.equal(t[1].annonce, null, 'une tranche vide n’a ni annoncé ni réalisé (jamais 0)');
  assert.equal(t[1].realise, null);
  assert.equal(t.reduce((s, x) => s + x.pronostics, 0), g.pronostics);
  assert.equal(g.matchs, 4);
  // Les comptes de chaque tranche sont ceux de calibrationParTranche (metrics.js), au bit près.
  const ref = calibrationParTranche(lignes, { tranches: TRANCHES_DIXIEMES });
  assert.deepEqual(t.map((x) => [x.de, x.a, x.pronostics, x.annonce, x.realise, x.ecart]), ref.map((x) => [x.de, x.a, x.n, x.annonce, x.realise, x.ecart]));
  assert.equal(g.justes, 4, 'les justes : choix = issue (tauxDeJustes)');
  assert.equal(e.value.parChampionnat.length, 1);
  assert.equal(e.value.parMarche[0].libelle, 'Résultat (1N2)');
});

test('révision retenue : la première valeur (révision 1, si elle a été gelée AVANT le coup d’envoi) et la dernière d’avant ; sans heure, seulement les révisions d’avant le jour du match ; l’ordre des révisions reçues n’y change rien', () => {
  const ko = '2026-09-12T15:00:00.000Z';
  const r = (version, recordedAt) => ({ version, recordedAt });
  const a = C.revisionsRetenues([r(3, '2026-09-12T15:10:00.000Z'), r(1, '2026-09-11T05:00:00.000Z'), r(2, '2026-09-12T14:00:00.000Z')], { coupDEnvoi: ko, jour: '2026-09-12' });
  assert.equal(a.premiere.version, 1);
  assert.equal(a.derniere.version, 2, 'la révision d’après le coup d’envoi n’est jamais retenue');
  assert.equal(a.raisonPremiere, null);
  const b = C.revisionsRetenues([r(1, '2026-09-12T15:00:00.000Z'), r(2, '2026-09-12T16:00:00.000Z')], { coupDEnvoi: ko, jour: '2026-09-12' });
  assert.equal(b.premiere, null, 'gelée À l’heure du coup d’envoi : déjà trop tard');
  assert.equal(b.raisonPremiere, 'apresCoupDEnvoi');
  assert.equal(b.derniere, null);
  assert.equal(b.raisonDerniere, 'apresCoupDEnvoi');
  const c = C.revisionsRetenues([r(1, '2026-09-11T22:00:00.000Z'), r(2, '2026-09-12T08:00:00.000Z')], { coupDEnvoi: null, jour: '2026-09-12' });
  assert.equal(c.premiere.version, 1);
  assert.equal(c.derniere.version, 1, 'sans heure : une révision du jour même ne compte pas');
  const d = C.revisionsRetenues([r(1, '2026-09-12T08:00:00.000Z')], { coupDEnvoi: null, jour: '2026-09-12' });
  assert.equal(d.raisonPremiere, 'heureInconnue');
  assert.equal(d.raisonDerniere, 'heureInconnue');
  const e = C.revisionsRetenues([r(2, '2026-09-11T05:00:00.000Z')], { coupDEnvoi: ko, jour: '2026-09-12' });
  assert.equal(e.raisonPremiere, 'sansPremiere');
  assert.equal(e.derniere.version, 2);
});

test('règlement : comme au banc — la 90e minute d’un match prolongé (but de la 105e ignoré), sans déroulé complet non réglable ; corners d’un match prolongé non réglables ; 0-0 = non relevé ; attribué écarté ; l’issue par settlementRules', () => {
  const stats = (hc, ac) => ({ home: { total_shots: 12, shots_on_goal: 5, corner_kicks: hc }, away: { total_shots: 9, shots_on_goal: 3, corner_kicks: ac } });
  const base = { date: '2026-09-12', league: 'DFB Pokal - Germany' };
  const prolonge = C.reglementDeLaRencontre(
    { ...base, hg: 2, ag: 1, meta: JSON.stringify({ reason: 'afterextra' }), events: JSON.stringify([{ type: 'goal', minute: 30, side: 'home' }, { type: 'goal', minute: 60, side: 'away' }, { type: 'goal', minute: 105, side: 'home' }]) },
    stats(6, 4)
  );
  const pick = (marketId, choice, extra = {}) => ({ marketId, choice, market: extra.market ?? '', label: extra.label ?? '', params: JSON.stringify(extra.params ?? {}), homeName: 'A', awayName: 'B' });
  assert.deepEqual(prolonge.buts, { home: 1, away: 1 }, 'le score de la 90e minute');
  assert.deepEqual(C.issueDuPronostic(pick('result', 'home', { market: 'Résultat' }), prolonge), { issue: 'draw', realise: false }, 'jamais le score de la 120e');
  assert.deepEqual(C.issueDuPronostic(pick('totalCorners', 'over', { params: { line: 8.5, side: 'over' } }), prolonge), { raison: 'prolongationStats' });
  const sansDeroule = C.reglementDeLaRencontre({ ...base, hg: 1, ag: 1, meta: JSON.stringify({ reason: 'afterpenalties' }), events: null }, stats(5, 5));
  assert.deepEqual(C.issueDuPronostic(pick('bothTeamsScore', 'yes', { market: 'Les 2 équipes marquent' }), sansDeroule), { raison: 'prolongationSansScore90' });
  const attribue = C.reglementDeLaRencontre({ ...base, hg: 3, ag: 0, meta: JSON.stringify({ awarded: 1 }) }, stats(5, 5));
  assert.deepEqual(C.issueDuPronostic(pick('result', 'home', { market: 'Résultat' }), attribue), { raison: 'attribue' });
  const ordinaire = C.reglementDeLaRencontre({ ...base, league: 'EPL', hg: 2, ag: 2, meta: '{}' }, stats(0, 0));
  assert.deepEqual(C.issueDuPronostic(pick('teamCorners', 'over', { params: { line: 3.5, side: 'over', team: 'home' } }), ordinaire), { raison: 'statNonRelevee' }, 'un 0-0 de corners = non relevé');
  assert.deepEqual(C.issueDuPronostic(pick('totalGoals', 'over', { market: 'Total buts', label: 'Plus de 2.5 buts', params: { line: 2.5, side: 'over' } }), ordinaire), { issue: 'over', realise: true });
  assert.deepEqual(C.issueDuPronostic(pick('teamGoals', 'under', { market: 'Buts — B', label: 'B — Moins de 1.5 buts', params: { line: 1.5, side: 'under', team: 'away' } }), ordinaire), { issue: 'over', realise: false });
  const releve = C.reglementDeLaRencontre({ ...base, league: 'EPL', hg: 0, ag: 1, meta: '{}' }, stats(7, 2));
  assert.deepEqual(C.issueDuPronostic(pick('teamCorners', 'over', { params: { line: 6.5, side: 'over', team: 'home' } }), releve), { issue: 'over', realise: true });
  assert.deepEqual(C.issueDuPronostic(pick('result', null, { market: 'Résultat' }), releve), { raison: 'sansChoix' });
  assert.deepEqual(C.issueDuPronostic({ ...pick('result', 'home', { market: 'Résultat' }), params: '{illisible' }, releve), { raison: 'nonReglable' });
});

test('juge : une tranche maigre dit « trop peu » sans tirage, jamais un écart (199 matchs) ; à 200, le juge de l’étape 16 rend son verdict, la fourchette élargie pour les cases jugées ensemble ; deux pronostics d’un même match = un seul match', () => {
  const lignes = (n, { p = 0.9, partReussie = 0.5, parMatch = 1 } = {}) =>
    Array.from({ length: n * parMatch }, (_, i) => ({ fixtureKey: `m${Math.floor(i / parMatch)}`, cle: `c${i}`, p, realise: Math.floor(i / parMatch) % Math.round(1 / partReussie) === 0 }));
  const maigre = C.jugerLaCase(lignes(199));
  assert.deepEqual(maigre, { verdict: 'trop-peu', matchs: 199, minimum: 200, ecart: null, fourchette: null, variantes: 1 });
  assert.equal(C.jugerLaCase(lignes(150, { parMatch: 2 })).verdict, 'trop-peu', '300 pronostics mais 150 matchs');
  const juge = C.jugerLaCase(lignes(200), { variantes: 4 });
  assert.equal(juge.verdict, 'trop-haut', 'annoncé 90 %, réalisé 50 %');
  const ref = comparer(lignes(200).map((l) => ({ bloc: l.fixtureKey, match: l.fixtureKey, cle: l.cle, a: l.p, b: l.realise ? 1 : 0 })), { mode: 'moyenne', sens: 'max', tirages: 1000, graine: 20, variantes: 4, minBlocs: 200 });
  assert.deepEqual([juge.ecart, juge.fourchette, juge.matchs, juge.variantes], [ref.gain, ref.fourchette, 200, 4], 'le juge de l’étape 16, tel quel');
  proche(juge.ecart, -0.4, 1e-12, 'écart = réalisé − annoncé');
  assert.equal(C.jugerLaCase(lignes(400, { p: 0.5 })).verdict, 'dans-le-hasard');
  assert.equal(C.jugerLaCase(lignes(400, { p: 0.2 })).verdict, 'trop-bas');
});

test('le gel du mois écoulé : à partir du 1er du mois suivant à 6 h, heure de Paris (heure d’hiver comme d’été) ; jamais le mois en cours ; mois et bornes', () => {
  assert.equal(C.moisEcoule('2026-10', Date.parse('2026-11-01T04:59:00Z')), false, '05 h 59 à Paris (heure d’hiver)');
  assert.equal(C.moisEcoule('2026-10', Date.parse('2026-11-01T05:00:00Z')), true, '06 h 00 à Paris');
  assert.equal(C.moisEcoule('2026-08', Date.parse('2026-09-01T03:59:00Z')), false, '05 h 59 à Paris (heure d’été)');
  assert.equal(C.moisEcoule('2026-08', Date.parse('2026-09-01T04:00:00Z')), true);
  assert.equal(C.moisEcoule('2026-09', Date.parse('2026-10-31T23:00:00Z')), true);
  assert.equal(C.moisEcoule('2026-10', Date.parse('2026-10-31T22:59:00Z')), false, 'le mois en cours n’est jamais écoulé');
  assert.equal(C.moisEcoule('2026-12', Date.parse('2027-01-01T05:00:00Z')), true, 'passage de l’année');
  assert.equal(C.moisEcoule('2026-09', Date.parse('2026-10-02T01:00:00Z')), true, 'le 2 du mois, même avant 6 h');
  assert.deepEqual(C.bornesDuMois('2026-02'), { du: '2026-02-01', au: '2026-02-28' });
  assert.deepEqual(C.bornesDuMois('2028-02'), { du: '2028-02-01', au: '2028-02-29' });
  assert.equal(C.moisSuivant('2026-12'), '2027-01');
  assert.equal(C.moisPrecedent('2027-01'), '2026-12');
  assert.equal(C.moisDeParis(Date.parse('2026-10-31T23:30:00Z')), '2026-11', 'minuit passé à Paris');
  assert.throws(() => C.bornesDuMois('2026-13'), C.CalibrationInvalide);
});

test('mêmes notes que le banc : calibration.js prend tranches, justes, perte log binaire et valeur de clôture dans metrics.js, le juge dans guard.js, le règlement dans bench/entrees.js et settlementRules.js — rien n’y est réécrit ; aucune écriture hors de calibration_monthly', () => {
  const texte = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'calibration.js'), 'utf8');
  // Le code seul (les commentaires disent pourquoi predictions.json n'est PAS la source : ils ne comptent pas).
  const source = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(source, /import \{ TRANCHES_DIXIEMES, calibrationParTranche, trancheDe, tauxDeJustes, perteLogBinaire, valeurCloture \} from '\.\.\/bench\/metrics\.js';/);
  assert.match(source, /import \{ comparer \} from '\.\.\/bench\/guard\.js';/);
  assert.match(source, /import \{ faitsDuMagasin, reglementDuMatch \} from '\.\.\/bench\/entrees\.js';/);
  assert.match(source, /import \{ deriveActualOutcome \} from '\.\.\/core\/settlement\/settlementRules\.js';/);
  for (const interdit of [/function perteLog/, /Math\.log\(/, /function brier/, /function comparer/, /predictions\.json/, /listPredictions/, /writeJson(?!Atomic\b)/, /fs\./]) assert.doesNotMatch(source, interdit, String(interdit));
  // Étape 24 : la seule écriture de FICHIER est le bilan du mois en cours, préparé par la nuit (jamais bets.json ni predictions.json).
  assert.deepEqual([...source.matchAll(/writeJsonAtomic\(([^,]+),/g)].map((m) => m[1].trim()), ['fichier'], 'une seule écriture de fichier : le mois préparé');
  assert.match(source, /FICHIER_DU_MOIS_EN_COURS = path\.resolve\(__dirname, '\.\.\/\.\.\/data\/runtime\/calibration-en-cours\.json'\);/);
  // La seule écriture : l'INSERT du gel, « DO NOTHING » si le mois est déjà là.
  const ecritures = [...source.matchAll(/\b(INSERT|UPDATE|DELETE|REPLACE)\b[^`]*/g)].map((m) => m[1]);
  assert.deepEqual(ecritures, ['INSERT'], 'une seule écriture : l’INSERT du gel');
  assert.match(source, /ON CONFLICT\(mois\) DO NOTHING/);
  // La table : son DDL et son déclencheur, dans matchStatsDb.js seulement.
  const ddl = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'db', 'matchStatsDb.js'), 'utf8');
  assert.match(ddl, /CREATE TRIGGER IF NOT EXISTS calibration_monthly_jamais_reecrit BEFORE UPDATE ON calibration_monthly/);
});

// ============================================================ 2. le calcul réel (copie isolée)

test('lignes : dans chaque lecture, l’appli retrouve EXACTEMENT les lignes du second chemin (révision, probabilité, issue, réalisé) et ses écartés, raison par raison ; à venir + écartés + réglés = pronostics gelés', () => {
  const s = reel();
  for (const mois of ['septembre', 'octobre']) {
    const a = s.attendus[mois];
    const b = s.appli[mois];
    assert.equal(b.geles, a.geles, `${mois} : pronostics gelés`);
    assert.equal(b.aVenir.pronostics, a.aVenir, `${mois} : à venir`);
    for (const vue of ['premiere', 'derniere']) {
      assert.deepEqual(b[vue].lignes, a[vue].lignes, `${mois}, ${vue} : les lignes`);
      assert.deepEqual(b[vue].ecartees, a[vue].ecartees, `${mois}, ${vue} : les écartés`);
      const ecartes = Object.values(b[vue].ecartees).reduce((t, n) => t + n, 0);
      assert.equal(Object.keys(b[vue].lignes).length + ecartes + b.aVenir.pronostics, b.geles, `${mois}, ${vue} : les comptes retombent sur le total`);
    }
  }
  const sept = s.appli.septembre;
  assert.ok(Object.keys(sept.premiere.lignes).length > 1500, 'environ 1 600 pronostics réglés en septembre');
  // Les pièges plantés, chacun compté pour sa raison (4 marchés par match ; 3 marchés de buts par match prolongé sans déroulé).
  assert.deepEqual(
    Object.fromEntries(['attribue', 'rencontreAmbigue', 'sansResultat', 'sansIdentifiant', 'statNonRelevee', 'prolongationStats', 'prolongationSansScore90', 'heureInconnue', 'sansProbabilite'].map((k) => [k, sept.premiere.ecartees[k]])),
    { attribue: 4, rencontreAmbigue: 4, sansResultat: 4, sansIdentifiant: 4, statNonRelevee: 1, prolongationStats: 4, prolongationSansScore90: 6, heureInconnue: 4, sansProbabilite: 1 }
  );
  assert.equal(sept.derniere.ecartees.sansProbabilite, 1, 'sans probabilité dans les deux lectures');
  assert.equal(sept.premiere.ecartees.apresCoupDEnvoi, s.plantes.revisions.premiereApres.length);
  // Octobre : les matchs joués sans statistiques (corners non relevés), un match d'aujourd'hui pas joué et un à venir.
  assert.deepEqual(s.appli.octobre.premiere.ecartees, { statNonRelevee: 13 });
  assert.ok(Object.keys(s.appli.octobre.premiere.lignes).some((k) => k.endsWith('|2026-10-05|result')), 'un match joué ce matin est réglé, jamais « à venir »');
  assert.deepEqual(s.appli.octobre.aVenir, { pronostics: 8, matchs: 2 });
});

test('révision 1 contre dernière avant le coup d’envoi : une révision d’avant change la seconde lecture seulement (autre probabilité, le nul au lieu du domicile) ; une révision d’après n’est jamais retenue ; une première valeur gelée après le coup d’envoi est écartée des deux', () => {
  const s = reel();
  const { premiere, derniere } = s.appli.septembre;
  assert.ok(s.plantes.revisions.avant.length >= 40 && s.plantes.revisions.apres.length >= 40);
  for (const cle of s.plantes.revisions.avant) {
    if (!premiere.lignes[cle]) continue;
    assert.equal(premiere.lignes[cle].version, 1, cle);
    assert.equal(derniere.lignes[cle].version, 2, cle);
    proche(derniere.lignes[cle].p, Math.max(0.05, Math.round((premiere.lignes[cle].p - 0.1) * 10000) / 10000), 1e-9, cle);
  }
  const resultat = s.plantes.revisions.avant.filter((c) => c.endsWith('|result') && premiere.lignes[c]);
  assert.ok(resultat.length > 10);
  for (const cle of resultat) assert.equal(derniere.lignes[cle].realise, derniere.lignes[cle].issue === 'draw', `${cle} : la dernière valeur a choisi le nul`);
  for (const cle of s.plantes.revisions.apres) if (premiere.lignes[cle]) assert.deepEqual([premiere.lignes[cle].version, derniere.lignes[cle].version, derniere.lignes[cle].p !== 0.99], [1, 1, true], cle);
  for (const cle of s.plantes.revisions.premiereApres) assert.ok(!premiere.lignes[cle] && !derniere.lignes[cle], cle);
  // Le bilan garde les deux lectures, chacune avec ses chiffres.
  const v = s.bilans.septembre.vues;
  assert.ok(v.premiere.global.annonce > v.derniere.global.annonce, 'la seconde lecture, plus prudente, annonce moins');
  assert.equal(v.premiere.libelle, C.VUES.premiere);
  assert.equal(v.derniere.libelle, C.VUES.derniere);
});

test('règlement réel : le match prolongé avec un but à la 105e se règle sur le 1-1 de la 90e ; le match au jour décalé d’un jour est trouvé ; le match sans heure retient la première valeur dans les deux lectures', () => {
  const s = reel();
  const { premiere, derniere } = s.appli.septembre;
  const k = s.plantes.cles;
  // Final 2-1 après prolongation, 1-1 à la 90e : nul, moins de 2,5 buts, les deux marquent ; corners non réglables.
  assert.deepEqual(
    ['result', 'totalGoals', 'bothTeamsScore', 'teamCorners:home'].map((m) => premiere.lignes[`${k.prolongeeA105}|${m}`]?.issue ?? null),
    ['draw', 'under', 'yes', null]
  );
  assert.equal(premiere.lignes[`${k.prolongeeA105}|result`].realise, false, 'le domicile n’a pas gagné à la 90e');
  // Le jour décalé (gelé le lendemain du jour du magasin) : trouvé à un jour près, réglé.
  assert.equal(['result', 'totalGoals', 'bothTeamsScore', 'teamCorners:home'].filter((m) => premiere.lignes[`${k.decale}|${m}`]).length, 4);
  // Sans heure : la révision du jour même (0,97) n'est pas retenue ; gelé le jour même sans heure : écarté.
  for (const m of ['result', 'totalGoals', 'bothTeamsScore', 'teamCorners:home']) {
    assert.equal(derniere.lignes[`${k.sansHeure}|${m}`].version, 1, m);
    assert.equal(premiere.lignes[`${k.sansHeureJourMeme}|${m}`], undefined, m);
  }
  assert.ok(!Object.values(derniere.lignes).some((l) => l.p === 0.97), 'aucune ligne à 0,97');
  // Attribué, ambigu, corners 0-0 : rien de réglé pour eux (sauf les buts du match aux corners non relevés).
  for (const m of ['result', 'totalGoals', 'bothTeamsScore', 'teamCorners:home']) {
    assert.equal(premiere.lignes[`${k.attribue}|${m}`], undefined);
    assert.equal(premiere.lignes[`${k.ambigu}|${m}`], undefined);
  }
  assert.equal(premiere.lignes[`${k.corners00}|teamCorners:home`], undefined);
  // Le coup d'envoi du MAGASIN fait foi : gelé 3 h trop tard, une révision d'une heure après le vrai coup d'envoi n'est pas retenue.
  for (const m of ['result', 'totalGoals', 'bothTeamsScore', 'teamCorners:home']) assert.equal(derniere.lignes[`${k.koDecale}|${m}`].version, 1, `koDecale ${m}`);
  assert.ok(!Object.values(derniere.lignes).some((l) => l.p === 0.98), 'aucune ligne à 0,98');
  // La même affiche rejouée le lendemain : le jour exact l'emporte (jamais « ambigu »), score du jour exact.
  assert.equal(['result', 'totalGoals', 'bothTeamsScore', 'teamCorners:home'].filter((m) => premiere.lignes[`${k.voisin}|${m}`]).length, 4);
  assert.deepEqual(premiere.lignes[`${k.voisin}|result`], s.attendus.septembre.premiere.lignes[`${k.voisin}|result`]);
  assert.equal(premiere.lignes[`${k.sansProba}|totalGoals`], undefined);
  assert.ok(premiere.lignes[`${k.corners00}|result`]);
});

test('bilan : les tranches, les marchés et les championnats recomptés à la main depuis les lignes du second chemin ; chaque tranche dit son nombre de matchs ; m = les cases d’au moins 200 matchs, le verdict de chacune celui de comparer', () => {
  const s = reel();
  const b = s.bilans.septembre.vues.premiere;
  const lignes = lignesDe(s.attendus.septembre.premiere);
  const main = tranchesALaMain(lignes);
  b.global.tranches.forEach((t, i) => {
    assert.equal(t.pronostics, main[i].n, `tranche ${i}`);
    assert.equal(t.matchs, main[i].matchs, `tranche ${i} : matchs`);
    if (main[i].n) {
      proche(t.annonce, main[i].annonce, 1e-12, `tranche ${i} : annoncé`);
      proche(t.realise, main[i].realise, 1e-12, `tranche ${i} : réalisé`);
    } else assert.equal(t.annonce, null);
  });
  assert.equal(b.global.pronostics, lignes.length);
  // Par marché et par championnat.
  const parMarche = new Map();
  const parLigue = new Map();
  for (const l of lignes) {
    parMarche.set(l.marketId, [...(parMarche.get(l.marketId) ?? []), l]);
    parLigue.set(l.league, [...(parLigue.get(l.league) ?? []), l]);
  }
  assert.deepEqual(b.parMarche.map((m) => m.marche), ['result', 'totalGoals', 'bothTeamsScore', 'teamCorners'], 'l’ordre de l’écran');
  // Annoncé = la moyenne des probabilités, réalisé = la part arrivée, écart = l'un moins l'autre, perte log binaire
  // = −ln(p) arrivé, −ln(1 − p) sinon — recalculés ici, case par case.
  const notes = (ls) => {
    const annonce = ls.reduce((t, l) => t + l.p, 0) / ls.length;
    const realise = ls.filter((l) => l.realise).length / ls.length;
    return { annonce, realise, ecart: realise - annonce, perteLog: ls.reduce((t, l) => t - Math.log(l.realise ? l.p : 1 - l.p), 0) / ls.length, matchs: new Set(ls.map((l) => l.fixtureKey)).size };
  };
  const memesNotes = (cas, ls, quoi) => {
    const n = notes(ls);
    for (const k of ['annonce', 'realise', 'ecart', 'perteLog']) proche(cas[k], n[k], 1e-9, `${quoi} : ${k}`);
    assert.equal(cas.matchs, n.matchs, `${quoi} : matchs`);
  };
  memesNotes(b.global, lignes, 'tous les marchés');
  for (const m of b.parMarche) {
    const ls = parMarche.get(m.marche);
    assert.equal(m.pronostics, ls.length);
    memesNotes(m, ls, m.marche);
    assert.deepEqual(m.tranches.map((t) => t.pronostics), tranchesALaMain(ls).map((t) => t.n), `${m.marche} : tranches`);
  }
  assert.equal(b.parChampionnat.length, parLigue.size);
  for (const l of b.parChampionnat) {
    assert.equal(l.pronostics, parLigue.get(l.league).length, l.league);
    memesNotes(l, parLigue.get(l.league), l.league);
  }
  assert.deepEqual(b.parChampionnat.map((l) => l.pronostics), [...b.parChampionnat.map((l) => l.pronostics)].sort((x, y) => y - x), 'du plus fourni au moins fourni');
  // Le juge : m = toutes les cases (tous marchés, marchés, tranches, championnats) d'au moins 200 matchs.
  const cases = [lignes, ...[...parMarche.values()], ...[...parLigue.values()]];
  for (const ls of [lignes, ...parMarche.values()]) {
    const parT = new Map();
    for (const l of ls) {
      const i = Math.min(9, Math.floor(l.p * 10 + 1e-12));
      parT.set(i, [...(parT.get(i) ?? []), l]);
    }
    cases.push(...parT.values());
  }
  const m = cases.filter((ls) => new Set(ls.map((l) => l.fixtureKey)).size >= 200).length;
  assert.equal(b.variantes, m);
  assert.ok(m >= 5, `${m} cases jugées`);
  const juge = comparer(lignes.map((l) => ({ bloc: l.fixtureKey, match: l.fixtureKey, cle: l.cle, a: l.p, b: l.realise ? 1 : 0 })), { mode: 'moyenne', sens: 'max', tirages: 1000, graine: 20, variantes: m, minBlocs: 200 });
  assert.deepEqual([b.global.juge.ecart, b.global.juge.fourchette, b.global.juge.variantes], [juge.gain, juge.fourchette, m]);
  const resultat = b.parMarche.find((x) => x.marche === 'result');
  assert.equal(resultat.juge.verdict, 'trop-haut', 'le domicile annoncé à 55 % n’arrive que 4 fois sur 10 : le juge le dit');
  for (const t of b.global.tranches) if (t.matchs < 200) assert.deepEqual([t.juge.verdict, t.juge.ecart], ['trop-peu', null], 'tranche maigre');
  assert.equal(s.rejeuIdentique, true, 'deux calculs du même mois : au bit près');
});

test('valeur de clôture : pour le 1N2, le plus/moins et les deux marquent, la cote juste du gel face à la clôture (removeMargin à la main) ; les autres marchés comptés « sans cote gratuite » ; les paris simples à la cote prise, le combiné à part, le pari à venir à part', () => {
  const s = reel();
  const c = s.bilans.septembre.vues.premiere.cloture;
  const proba = (prix, issue) => {
    const cles = Object.keys(prix);
    return removeMargin(cles.map((k) => prix[k])).probabilities[cles.indexOf(issue)];
  };
  const attendu = { result: [], totalGoals: [], bothTeamsScore: [] };
  for (const cote of s.plantes.cotes) {
    attendu.result.push(proba(cote.prix['1x2'].close, 'home') / proba(cote.prix['1x2'].snapshot, 'home') - 1);
    attendu.totalGoals.push(proba(cote.prix.ou.close, 'over') / proba(cote.prix.ou.snapshot, 'over') - 1);
    attendu.bothTeamsScore.push(proba(cote.prix.btts.close, 'yes') / proba(cote.prix.btts.snapshot, 'yes') - 1);
  }
  const moyenne = (xs) => xs.reduce((t, x) => t + x, 0) / xs.length;
  for (const m of c.parMarche) {
    assert.equal(m.mesures, 3, m.marche);
    proche(m.moyenne, moyenne(attendu[m.marche]) * 100, 1e-9, m.marche);
  }
  proche(c.moyenne, moyenne([...attendu.result, ...attendu.totalGoals, ...attendu.bothTeamsScore]) * 100, 1e-9, 'moyenne');
  assert.equal(c.mesures, 9);
  assert.equal(c.approx, 0, 'le prix du gel est celui relevé AVANT lui, pas l’ouverture');
  const choisis = s.appli.septembre.premiere.choisis;
  assert.equal(c.sansCoteGratuite + c.eligibles, choisis);
  assert.equal(c.sansCoteGratuite, Object.values(s.appli.septembre.premiere.lignes).filter((l) => l.marketId === 'teamCorners').length + 1 + 4 + 1, 'les corners des matchs joués : réglés, plus l’attribué, les quatre prolongés et le 0-0');
  assert.deepEqual(c.raisons.map((r) => r.raison), ['releve']);
  assert.equal(c.juge.verdict, 'trop-peu');
  // Les paris de Pierre : cote prise × probabilité de clôture − 1.
  const p = s.bilans.septembre.paris.cloture;
  const [a, b] = s.plantes.cotes;
  const vA = 2.3 * proba(a.prix['1x2'].close, 'home') - 1;
  const vB = 1.95 * proba(b.prix.ou.close, 'over') - 1;
  assert.deepEqual([p.paris, p.combines, p.aVenir, p.mesures, p.positifs], [3, 1, 0, 2, [vA, vB].filter((x) => x > 0).length]);
  proche(p.moyenne, ((vA + vB) / 2) * 100, 1e-9, 'valeur de clôture moyenne des paris');
  assert.deepEqual(p.raisons.map((r) => [r.raison, r.n]), [['releve', 1]]);
  assert.deepEqual([s.bilans.octobre.paris.cloture.paris, s.bilans.octobre.paris.cloture.aVenir, s.bilans.octobre.paris.cloture.mesures], [1, 1, 0], 'octobre : le pari à venir, sans clôture');
});

test('mois figé jamais réécrit : la passe fige septembre une fois (une ligne, son résumé), puis n’a plus rien à faire ; un pronostic de plus et un score changé ne le changent pas ; figerLeMois rend « pas écrit » et le bilan de la base ; un UPDATE est refusé par la base ; la route rend le bilan figé tel quel', () => {
  const s = reel();
  const e = s.etape;
  assert.deepEqual([e.dueAvant, e.aFigerAvant, e.dueApres], [true, ['2026-09'], false]);
  // Étape 25 (seconde moitié, 14/10/2026) : les pronostics plantés font un 1N2 annoncé trop haut au-delà du hasard (le
  // juge de la calibration le dit lui-même « trop-haut ») ; l'écart de départ (note de départ, +0,1 point) sort de sa
  // fourchette et l'écart a grandi : l'alerte de dérive est posée, l'étape dit « à regarder » en une phrase de plus.
  assert.equal(e.premiere.status, 'warn');
  assert.match(e.premiere.summary.replace(/[\u202f\u00a0]/g, ' '), /^septembre 2026 figé : 1 \d{3} pronostics réglés sur 1 764 pronostics gelés \(première valeur, \d+ matchs\), annoncé \d+,\d %, réalisé \d+,\d % \(écart [+−]\d+,\d points, écart dans le hasard\) ; valeur de clôture des pronostics [+−]\d+,\d % sur 9 pronostics, de vos paris [+−]\d+,\d % sur 2 paris ; en .* \(le serveur jamais tenu plus de \d+ ms d'affilée\)\. Le détail est dans Historique moteur › Calibration du mois\. Dérive du moteur en septembre 2026 \(Résultat \(1N2\)\) : voir Réglages › Versions du moteur\.$/);
  assert.equal(e.premiere.alert.key, 'deriveMoteur');
  assert.deepEqual(e.premiere.alert.value.signaux.map((x) => [x.type, x.marche, x.statut, x.sens]), [['calibration', 'result', 'derive', 'trop-haut']]);
  assert.equal(e.premiere.changed, false);
  assert.ok(e.premiere.details.blocMaxMs < 250, `le serveur rendu : ${e.premiere.details.blocMaxMs} ms au plus`);
  assert.deepEqual(e.seconde.figes, []);
  const f = s.figee;
  assert.deepEqual([f.mois, f.version, f.du, f.au, f.pronostics, f.paris], ['2026-09', 1, '2026-09-01', '2026-09-30', 1764, 3]);
  assert.equal(f.figeLe, '2026-10-05T12:00:00.000Z');
  assert.equal(f.bilan.fige, true);
  assert.equal(f.bilan.enCours, false);
  assert.deepEqual(f.resume, C.resumeDuBilan(f.bilan));
  const sansHeure = (b) => ({ ...b, calculeLe: null, dureeMs: null, fige: null, figeLe: null, enCours: null });
  assert.deepEqual(sansHeure(f.bilan), sansHeure(s.bilans.septembre), 'le bilan figé = le bilan calculé juste avant');
  const j = s.jamaisReecrit;
  assert.equal(j.recalculDiffere, true, 'le même mois recalculé maintenant serait différent…');
  assert.deepEqual([j.ecrit, j.bilanRendu, j.sha1Apres, j.sha1Final, j.figeLeApres], [false, 1764, f.sha1, f.sha1, f.figeLe], '… mais le mois figé ne bouge pas');
  assert.equal(j.update, 'calibration_monthly : un mois figé ne se réécrit jamais');
  assert.equal(s.route.septembre.egalALaBase, true);
  assert.equal(s.route.septembre.geles, 1764);
});

test('mois en cours non figé : octobre n’est jamais dans la table ; son bilan est PRÉPARÉ par la passe de la nuit, marqué « en cours » ; le figer est refusé ; la route le rend par défaut (lu, jamais calculé), avec les mois figés et le prochain gel', () => {
  const s = reel();
  assert.equal(s.octobreFige, null);
  assert.deepEqual([s.bilans.octobre.fige, s.bilans.octobre.enCours, s.bilans.octobre.jusquAu], [false, true, '2026-10-05']);
  assert.match(s.jamaisReecrit.octobre, /^CalibrationInvalide : Le mois 2026-10 n’est pas écoulé : il ne se fige pas\.$/);
  const r = s.route.defaut;
  assert.deepEqual([r.code, r.mois, r.moisEnCours, r.fige, r.enCours, r.geles], [200, '2026-10', '2026-10', false, true, 60]);
  assert.deepEqual(r.disponibles.map((d) => [d.mois, d.etat]), [['2026-10', 'en-cours'], ['2026-09', 'fige']]);
  assert.deepEqual(r.prochainGel, { mois: '2026-10', le: '2026-11-01', heure: 6 });
  assert.deepEqual(r.aFiger, []);
  assert.deepEqual(r.figes.map((m) => [m.mois, m.fige, m.figeLe, m.version, m.geles]), [['2026-09', true, '2026-10-05T12:00:00.000Z', 1, 1764]]);
  assert.deepEqual(r.juge, { minBlocs: 200, alpha: 0.05, tirages: 1000, graine: 20 });
  assert.deepEqual(Object.keys(r.provenance), ['pronostics', 'resultats', 'cloture', 'paris']);
});

test('route : GET /api/predictions/calibration — mois illisible, mois à venir, mois en double : 400 avec la raison, rien calculé', () => {
  const s = reel();
  assert.equal(s.route.illisible.code, 400);
  assert.match(s.route.illisible.corps.error, /Mois illisible : « 2026-13 »/);
  assert.equal(s.route.aVenir.code, 400);
  assert.match(s.route.aVenir.corps.error, /n’a pas commencé/);
  assert.equal(s.route.double.code, 400);
  assert.match(s.route.double.corps.error, /un seul mois/);
  const routes = fs.readFileSync(path.join(SERVEUR, 'src', 'api', 'routes', 'predictions.routes.js'), 'utf8');
  assert.match(routes, /router\.get\('\/calibration', asyncHandler\(getCalibration\)\);/);
  assert.doesNotMatch(routes, /router\.(post|put|patch|delete)\('\/calibration/, 'aucune route n’écrit : le gel est une étape de l’actualisation');
});
