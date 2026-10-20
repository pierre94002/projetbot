/**
 * Étape 19 — le BANC D'ESSAI (src/bench : periodes, prix, entrees, runner, resume, simulateBets, apparier,
 * depotBanc ; scripts/bench.mjs ; GET/POST /api/bench).
 *
 * Deux sortes d'essais :
 *   - PURS, dans ce processus (aucune base) : mesures, périodes, « déjà vu », prix football-data, grille des
 *     scores et loi des comptes, repère courant, règlement, juge du résumé, paris, appariement ;
 *   - dans des COPIES ISOLÉES (isolement.mjs) de la base d'essai, la table du jour J construite et
 *     football-data planté par test/aides/script-banc.mjs : le rejeu (et l'oracle de la copie tronquée : les
 *     lecteurs « maintenant » de l'appli sur une base où tout ce qui suit J a été supprimé redonnent EXACTEMENT
 *     le banc), l'anti-fuite, les paris et le règlement, les cotes archivées, la route, le script du bac.
 * Les valeurs attendues sont recalculées ICI (SQL sur la copie, removeMargin à la main), jamais recopiées.
 * Les seuils de preuve sont baissés dans les copies (20 blocs, 200 tirages) : le banc, lui, ne les baisse jamais.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
import * as P from '../src/bench/periodes.js';
import { calibrationParTranche, tauxDeJustes, TRANCHES_DIXIEMES, TRANCHES_FIABILITE, perteLog, PROBA_MIN, gainMiseFixe } from '../src/bench/metrics.js';
import { DONNEES_VUES, LANCEMENTS, verifierLancements, fenetresDeclarees } from '../src/bench/lancements.js';
import { prixFd, colonne, probaCloture, plusMoins25, lectureDirecte } from '../src/bench/prix.js';
import { ReperesCourants, contributionAuRepere, reglementDuMatch, distributionsDuRepere, REPERE_PAR_DEFAUT, loiDuCompte } from '../src/bench/entrees.js';
import { Accumulateurs, resumer, compterLesCases, MIN_BLOCS } from '../src/bench/resume.js';
import { parisDUnMatch, resumeDesParis, decisionsDesVariantes } from '../src/bench/simulateBets.js';
import { apparierRejeux, comparerDesFichiers, ecrivainDEchange } from '../src/bench/apparier.js';
import { perteLogDesComptes, indiceDuScore } from '../src/bench/runner.js';
import { zPour } from '../src/bench/guard.js';
import { removeMargin } from '../src/core/market/marginRemoval.js';
import { grilleDesScores, predictScore } from '../src/core/engine/scorePrediction.js';
import { loiDesComptes, probabilitesLigne } from '../src/sports/football/statMarkets.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-banc.mjs');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);
const issue1N2 = (h, a) => (h > a ? 'home' : h === a ? 'draw' : 'away');
const cote = (v) => (v === null || v === undefined ? null : v / 100);

/** Une phase du script dans une copie neuve ; `verifier(db, json)` lit la copie (lecture seule) avant qu'elle soit effacée. */
function lancer(phase, { runtime = {}, verifier = null, scripts = false } = {}) {
  const copie = preparerCopie({ runtime });
  try {
    if (scripts) fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 300_000 });
    assert.equal(r.code, 0, `phase ${phase} : ${r.erreurs.slice(-3000)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `phase ${phase} : sortie illisible ${r.sortie.slice(-500)}`);
    let sql = null;
    if (verifier) {
      const db = new DatabaseSync(copie.base, { readOnly: true });
      try {
        sql = verifier(db, r.json);
      } finally {
        db.close();
      }
    }
    return { ...r.json, sql };
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (f) => {
  let v;
  return () => (v ??= f());
};

// ==================================================================== 1. pur : mesures et périodes

test('mesures : calibration par tranche (bornes [de ; a[, 1,01 dans la dernière), dixièmes, % de justes', () => {
  const lignes = [
    { p: 0.35, realise: true },
    { p: 0.39, realise: false },
    { p: 0.45, realise: true },
    { p: 0.5, realise: false },
    { p: 0.85, realise: true },
    { p: 1.01, realise: true }
  ];
  const c = calibrationParTranche(lignes);
  assert.deepEqual(c.map((t) => t.n), [2, 1, 1, 0, 0, 2]);
  proche(c[0].annonce, 0.37, 1e-12, 'annoncé 0-40');
  proche(c[0].realise, 0.5, 1e-12, 'réalisé 0-40');
  proche(c[0].ecart, 0.13, 1e-12, 'écart 0-40');
  assert.equal(c[3].annonce, null);
  proche(c[5].annonce, 0.93, 1e-12, 'annoncé 80-101');
  assert.equal(TRANCHES_DIXIEMES.length, 10);
  assert.deepEqual([TRANCHES_DIXIEMES[0].de, TRANCHES_DIXIEMES[9].a], [0, 1.01]);
  assert.equal(calibrationParTranche(lignes, { tranches: TRANCHES_DIXIEMES }).reduce((s, t) => s + t.n, 0), 6);
  assert.deepEqual(TRANCHES_FIABILITE.map((t) => t.de), [0, 0.4, 0.5, 0.6, 0.7, 0.8]);
  assert.deepEqual(tauxDeJustes([{ choix: 'home', issue: 'home' }, { choix: 'draw', issue: 'away' }, { choix: 'away', issue: 'away' }]), { n: 3, justes: 2, taux: 2 / 3 });
  assert.deepEqual(tauxDeJustes([]), { n: 0, justes: 0, taux: null });
});

test('périodes : la source décide (15/03/2023 = P2 football-data, P3 magasin), bornes, P4a/P4b, huis clos, les quatre décisions de Pierre', () => {
  assert.equal(P.periodeDe('2019-06-30', 'fd'), 'P1');
  assert.equal(P.periodeDe('2019-07-01', 'fd'), 'P2');
  assert.equal(P.periodeDe('2023-03-15', 'fd'), 'P2');
  assert.equal(P.periodeDe('2023-03-15', 'magasin'), 'P3');
  assert.equal(P.periodeDe('2023-01-01', 'magasin'), 'P3');
  assert.equal(P.periodeDe('2023-07-01', 'fd'), 'P3');
  assert.equal(P.periodeDe('2024-06-30', 'magasin'), 'P3');
  assert.equal(P.periodeDe('2026-09-23', 'magasin'), 'P4');
  assert.equal(P.periodeDe('2026-09-24', 'magasin'), 'P5');
  assert.deepEqual([P.trancheDuResume('2025-06-30', 'magasin'), P.trancheDuResume('2025-07-01', 'magasin')], ['P4a', 'P4b']);
  assert.throws(() => P.periodeDe('2023-3-1', 'fd'), RangeError);
  assert.throws(() => P.periodeDe('2023-03-01', 'odds'), RangeError);
  assert.deepEqual([P.sourceDeLaPeriode('P2'), P.sourceDeLaPeriode('P4b')], ['fd', 'magasin']);
  assert.deepEqual(P.HUIS_CLOS, { de: '2020-03-14', a: '2021-05-31' });
  assert.equal(P.PERIODES.P2.apprentissageInterdit, true);
  assert.equal(P.PERIODES.P1.moteurDepuis, '2005-07-29');
  // Aucun jeu d'avant-match ne peut lire une colonne de clôture ; la clôture ne décide jamais.
  assert.ok(P.JEUX_DE_PRIX['fd-avant-match'].colonnes.every((c) => !/_c/.test(c)), 'aucune colonne de clôture dans l’avant-match');
  assert.equal(P.JEUX_DE_PRIX['fd-cloture'].decision, false);
  assert.equal(P.JEUX_DE_PRIX['gratuites-avant-match'].decision, false);
  assert.equal(P.JEUX_DE_PRIX['vos-bookmakers'].decision, true);
  assert.equal(P.MARCHES_DU_BANC.length, 27, 'les 27 lignes de marché d’une rencontre');
  assert.deepEqual(P.MARCHES_DU_BANC.filter((m) => m.marche).map((m) => `${m.marketKey}|${m.ligne ?? '-'}`), ['result|-', 'totalGoals|2.5']);
  // Les quatre décisions de Pierre, au même endroit.
  assert.deepEqual({ ...P.DECISIONS_DE_PIERRE, dureeAcceptee: undefined, phraseParisP5: undefined }, { parisDeP5: 'tous', uneCaseParLigne: true, dureeAcceptee: undefined, secondJugementParis: '2027-03-31', phraseParisP5: undefined, lien4: 'ecarter' });
  assert.match(P.DECISIONS_DE_PIERRE.phraseParisP5, /fin mars 2027/);
  assert.deepEqual([0, 1, 2, 3, 4].map(P.regleDuLien), ['rejouer-fd', 'prix-du-magasin', 'scoreDifferent', 'rattachementIncertain', 'sansRencontreAuMagasin']);
  // La coupure : une heure avant le coup d'envoi ; sans heure, strictement avant minuit du jour.
  const c = P.coupureDe({ date: '2026-03-14', kickoff: '2026-03-14T19:00:00.000Z' });
  assert.deepEqual([c.instant, c.heureSure], ['2026-03-14T18:00:00.000Z', true]);
  assert.ok(P.avantLaCoupure('2026-03-14T18:00:00.000Z', c) && !P.avantLaCoupure('2026-03-14T18:00:01.000Z', c));
  const s = P.coupureDe({ date: '2026-03-14' });
  assert.ok(!s.heureSure && !P.avantLaCoupure('2026-03-14T00:00:00.000Z', s) && P.avantLaCoupure('2026-03-13T23:59:59.000Z', s));
});

test('déjà vu : trois fenêtres contiguës et ordonnées, les déclarations de toutes les étapes, les vues d’un rejeu, l’étiquette d’un jour', () => {
  assert.deepEqual(DONNEES_VUES.map((f) => f.id), ['regle-de-value-23-09', 'apprentissage-23-09', 'mesures-du-23-09']);
  for (let i = 1; i < DONNEES_VUES.length; i++) {
    const veille = new Date(`${DONNEES_VUES[i].de}T00:00:00Z`);
    veille.setUTCDate(veille.getUTCDate() - 1);
    assert.equal(veille.toISOString().slice(0, 10), DONNEES_VUES[i - 1].a, 'contiguës');
  }
  assert.equal(verifierLancements(LANCEMENTS), true);
  const fabrique = [{ etape: '27', version: 'v1', quoi: 'essai', le: null, variantes: [{ id: 'v1' }], vues: [{ de: '2019-07-01', a: '2023-06-30' }] }];
  const f = fenetresDeclarees({ lancements: fabrique });
  assert.deepEqual(f.map((x) => x.id), ['regle-de-value-23-09', 'apprentissage-23-09', 'mesures-du-23-09', '27:v1:1']);
  // Une ligne de P2 n'est « vue » que si une étape l'a déclarée — le juge de preuve, lui, ne la voit jamais.
  assert.deepEqual(P.fenetresDuJour('2021-01-10', f), ['27:v1:1']);
  const banc = P.fenetresDuBanc({ vues: [{ de: '2026-10-01', a: '2026-10-31', quoi: 'candidate' }] });
  assert.deepEqual(banc.map((x) => x.id).slice(-1), ['rejeu:1']);
  assert.deepEqual(['2023-03-15', '2023-10-01', '2024-10-01', '2025-10-01', '2026-10-15'].map((j) => P.fenetresDuJour(j, banc)), [[], ['regle-de-value-23-09'], ['apprentissage-23-09'], ['mesures-du-23-09'], ['rejeu:1']]);
  assert.equal(P.texteDesVues([]), 'jamais vues');
  assert.match(P.texteDesVues(['regle-de-value-23-09']), /livre de référence et la règle de pari/);
  assert.match(P.texteDesVues(['mesures-du-23-09']), /vérification du 23\/09/);
});

// ==================================================================== 2. pur : les prix football-data

const LIGNE_FD = { moy_1: 210, moy_n: 340, moy_2: 360, max_1: 225, max_n: 360, max_2: 390, pin_1: 215, pin_n: 345, pin_2: 375, wh_1: 205, wh_n: 330, wh_2: 350, b365_1: 208, b365_n: 335, b365_2: 355, moy_c1: 200, moy_cn: 350, moy_c2: 380, pin_c1: 205, pin_cn: 355, pin_c2: 390, moy_p25: 190, moy_m25: 195, moy_cp25: 185, moy_cm25: 200 };

test('prix football-data : la moyenne pour le marché, les clés du moteur, le maximum jamais dans byBookmaker, la clôture seule, une ligne de pays, aucune colonne de clôture lue avant le match', () => {
  const m = prixFd(LIGNE_FD, { jeu: 'fd-avant-match' });
  assert.deepEqual([m.odds1, m.oddsDraw, m.odds2], [2.1, 3.4, 3.6]);
  assert.deepEqual(m.byBookmaker.map((b) => b.key), ['pinnacle', 'williamhill', 'b365', 'fd_moyenne']);
  assert.deepEqual(m.byBookmaker.map((b) => Boolean(b.referenceOnly)), [false, false, false, true]);
  assert.ok(!m.byBookmaker.some((b) => /max/i.test(b.key)), 'le maximum n’entre jamais dans byBookmaker');
  assert.deepEqual(m.affichage.maximum, { odds1: 2.25, oddsDraw: 3.6, odds2: 3.9 });
  const sansPin = prixFd({ ...LIGNE_FD, pin_1: null }, { jeu: 'fd-avant-match' });
  assert.ok(!sansPin.byBookmaker.some((b) => b.key === 'pinnacle'), 'un Pinnacle incomplet n’est pas un livre');
  const cl = prixFd(LIGNE_FD, { jeu: 'fd-cloture' });
  assert.deepEqual(cl.byBookmaker.map((b) => [b.key, b.referenceOnly]), [['fd_moyenne', true]], 'la clôture : la moyenne seule (jamais la clé pinnacle)');
  assert.deepEqual([cl.odds1, cl.oddsDraw, cl.odds2], [2.0, 3.5, 3.8]);
  // Une ligne de pays : la clôture seulement.
  const pays = { moy_c1: 190, moy_cn: 340, moy_c2: 420 };
  assert.equal(prixFd(pays, { jeu: 'fd-avant-match' }), null);
  assert.ok(prixFd(pays, { jeu: 'fd-cloture' }));
  // Une ligne qui LÈVE sur toute lecture d'une colonne de clôture : l'avant-match ne la touche jamais.
  const piege = new Proxy(LIGNE_FD, { get: (o, k) => { if (typeof k === 'string' && /_c(1|n|2|p25|m25)$/.test(k)) throw new Error(`clôture lue : ${k}`); return o[k]; } });
  assert.ok(prixFd(piege, { jeu: 'fd-avant-match' }));
  assert.throws(() => colonne(LIGNE_FD, 'moy_c1', 'fd-avant-match'), /n'appartient pas au jeu/);
  // La probabilité de clôture : Pinnacle, sinon la moyenne, sinon null ; jamais le maximum.
  const pin = removeMargin([2.05, 3.55, 3.9]).probabilities;
  proche(probaCloture(LIGNE_FD, { issue: 'home' }), pin[0], 1e-15, 'Pinnacle clôture');
  const moy = removeMargin([2.0, 3.5, 3.8]).probabilities;
  proche(probaCloture({ ...LIGNE_FD, pin_c1: null }, { issue: 'away' }), moy[2], 1e-15, 'moyenne de clôture sans Pinnacle');
  assert.equal(probaCloture({ max_c1: 300, max_cn: 300, max_c2: 300 }, { issue: 'home' }), null, 'jamais le maximum');
  // Un maximum d'avant-match COHÉRENT (somme > 100 %) ne change rien : la clôture reste celle de Pinnacle (bug volontaire 4).
  const maxCoherent = { ...LIGNE_FD, max_1: 205, max_n: 330, max_2: 350 };
  assert.equal(probaCloture(maxCoherent, { issue: 'home' }), probaCloture(LIGNE_FD, { issue: 'home' }));
  assert.equal(probaCloture({ ...maxCoherent, pin_c1: null }, { issue: 'away' }), probaCloture({ ...LIGNE_FD, pin_c1: null }, { issue: 'away' }), 'sans Pinnacle : la moyenne, jamais le maximum');
  const ou = removeMargin([1.9, 1.95]).probabilities;
  const pm = plusMoins25(LIGNE_FD, { jeu: 'fd-avant-match' });
  proche(pm.over, Number(ou[0].toFixed(6)), 1e-12, 'plus de 2,5 avant-match');
  assert.equal(plusMoins25(LIGNE_FD, { jeu: 'gratuites-avant-match' }), null);
  const ld = lectureDirecte(m);
  const attendu = removeMargin([2.1, 3.4, 3.6]).probabilities.map((p) => Number(p.toFixed(6)));
  assert.deepEqual([ld.distribution.home, ld.distribution.draw, ld.distribution.away], attendu);
});

// ==================================================================== 3. pur : grille des scores, loi des comptes

test('score exact : la grille complète (81 cases, home × 9 + away, somme 1) est celle de predictScore ; la loi des comptes et sa queue font 1', () => {
  const inputs = null;
  for (const fair of [[0.5, 0.27, 0.23], [0.2, 0.25, 0.55]]) {
    const g = grilleDesScores({ inputs, fair });
    assert.equal(g.cases.length, 81);
    g.cases.forEach((c, i) => assert.equal(indiceDuScore(c.home, c.away), i, `case ${i} à sa place`));
    proche(g.cases.reduce((s, c) => s + c.p, 0), 1, 1e-9, 'somme');
    const sp = predictScore({ inputs, fair, predictedOutcome: 'home' });
    assert.deepEqual([Number(g.lambda.toFixed(2)), Number(g.mu.toFixed(2))], [sp.expectedGoals.home, sp.expectedGoals.away]);
    const triee = [...g.cases].sort((a, b) => b.p - a.p);
    assert.deepEqual(sp.top.map((c) => [c.home, c.away]), triee.slice(0, 5).map((c) => [c.home, c.away]));
    assert.equal(g.cases[0].home, 0, 'la grille rendue n’est jamais triée');
  }
  assert.equal(grilleDesScores({ inputs: null, fair: null }), null);
  for (const [mu, invK] of [[10.3, 0.0205], [4.2, 0.1048], [25, 0.0138], [3, 0]]) {
    const loi = loiDesComptes(mu, invK, 41);
    proche(loi.pmf.reduce((s, p) => s + p, 0) + loi.queue, 1, 1e-9, `Σ pmf + queue (${mu})`);
    // Le cumul de la loi redonne probabilitesLigne (le même calcul que cdf).
    const pl = probabilitesLigne(mu, invK, 9.5);
    proche(loi.pmf.slice(0, 10).reduce((s, p) => s + p, 0), pl.under, 1e-15, 'moins de 9,5');
  }
  // Un compte au-delà de la grille : la queue, au plancher.
  const loi = loiDuCompte(10, 0.0205);
  assert.ok(loi.pmf.length >= 41);
  const loin = perteLogDesComptes(loi, 400);
  assert.ok(Number.isFinite(loin.valeur) && loin.valeur <= -Math.log(PROBA_MIN) + 1e-12);
  proche(perteLogDesComptes(loi, 7).valeur, -Math.log(loi.pmf[7]), 1e-12, 'compte dans la grille');
});

// ==================================================================== 4. pur : repère courant et règlement

test('repère courant : la saison si 30 matchs, sinon 365 jours si 10, sinon le défaut ; la journée J jamais comptée ; parts à la main', () => {
  const r = new ReperesCourants();
  const jour = (i) => new Date(Date.UTC(2021, 0, 1 + i)).toISOString().slice(0, 10);
  // 40 journées, un match par jour : 3-0 les jours pairs, 1-1 les impairs (saison 2020).
  for (let i = 0; i < 40; i++) r.ajouterJournee('L', jour(i), [contributionAuRepere({ buts: i % 2 ? { home: 1, away: 1 } : { home: 3, away: 0 }, stats: { corners: { home: 5, away: 3 } } })], { saison: 2020 });
  const avant = r.avant('L', jour(31), { saison: 2020 });
  assert.equal(avant.source, 'courant:saison');
  assert.equal(avant.n, 31, 'les journées 0 à 30, jamais la 31e');
  proche(avant.parts.plus[2.5], 16 / 31, 1e-15, 'plus de 2,5 : les 3-0');
  proche(avant.parts.draw, 15 / 31, 1e-15, 'nuls');
  proche(avant.goals.home, (16 * 3 + 15) / 31, 1e-12, 'buts à domicile');
  assert.equal(avant.stats.corners.parEquipe, 4);
  // Moins de 30 dans la saison : les 365 jours ; moins de 10 : le défaut.
  assert.equal(r.avant('L', jour(20), { saison: 2020 }).source, 'courant:365');
  assert.equal(r.avant('L', jour(5), { saison: 2020 }).source, 'defaut');
  assert.equal(r.avant('Autre', jour(5), { saison: 2020 }), REPERE_PAR_DEFAUT);
  // Une journée qui arrive en arrière : refusée (les journées s'ajoutent dans l'ordre).
  assert.throws(() => r.ajouterJournee('L', jour(3), [], { saison: 2020 }), /dans l'ordre/);
  const d = distributionsDuRepere(avant);
  proche(d.resultAndTotal[2.5].homeOver, avant.parts.home * avant.parts.plus[2.5], 1e-15, 'combiné = produit');
  assert.equal(d.scoreExact.length, 81);
  assert.ok(d.stats.corners.total > 0 && d.stats.corners.home > d.stats.corners.away, 'facteur de terrain du moteur');
});

test('règlement : 90e minute pour un match prolongé (jamais la 120e), sans score à 90 : non réglable ; statistiques prolongées non réglables ; 0-0 du magasin non relevé, vrai zéro chez football-data ; attribué écarté', () => {
  const base = { source: 'magasin', attribue: false, prolongation: false, coupe: true, bp: 3, bc: 2, bp90: null, bc90: null, stats: { corners: [4, 6], shots: [0, 0], shotsOnTarget: [null, 2] } };
  const prolonge = reglementDuMatch({ ...base, prolongation: true, bp90: 2, bc90: 2 });
  assert.deepEqual(prolonge.buts, { home: 2, away: 2 }, 'le 2-2 de la 90e, pas le 3-2 de la 120e');
  assert.equal(prolonge.nonReglableStats, 'prolongationStats');
  assert.deepEqual(Object.values(prolonge.stats), [null, null, null]);
  assert.equal(reglementDuMatch({ ...base, prolongation: true }).nonReglableButs, 'prolongationSansScore90');
  const normal = reglementDuMatch({ ...base, bp90: 0, bc90: 0 });
  assert.deepEqual(normal.buts, { home: 3, away: 2 }, 'un match non prolongé : bp, jamais bp90');
  assert.deepEqual(normal.stats, { corners: { home: 4, away: 6 }, shots: null, shotsOnTarget: null });
  const fd = reglementDuMatch({ ...base, source: 'fd', coupe: false, stats: { corners: [0, 0], shots: [7, 3], shotsOnTarget: [null, 1] } });
  assert.deepEqual(fd.stats.corners, { home: 0, away: 0 }, 'chez football-data, 0 est un vrai zéro');
  assert.equal(reglementDuMatch({ ...base, attribue: true }).attribue, true);
  assert.deepEqual(contributionAuRepere({ buts: null, stats: null }).every((x) => x === 0), true, 'un match non réglable n’entre pas dans le repère');
});

// ==================================================================== 5. pur : le juge du résumé, les paris, l'appariement

/** Des lignes compactes fabriquées : `n` matchs, la perte du moteur, du marché et du repère. */
function verserFabrique(acc, { tranche = 'P3', prix = 'fd-avant-match', n, moteur, marche = null, repere, marketKey = 'result', ligne = null, mesure = 'categorie', famille = 'result', league = 'L', debut = 0 }) {
  for (let i = 0; i < n; i++) {
    const l = { marketKey, famille, ligne, mesure, pl: moteur(i), ecr: false, brier: null, rps: null, plM: marche ? marche(i) : null, plR: repere(i), sourceR: 'courant:saison', plT: null, justes: null, top3: null, un11: null, calib: null, horsGrille: false, sansMoyenneDeLigue: false };
    acc.ajouterLigne({ tranche, prix, bloc: debut + i, l, vues: [] });
    acc.ajouterALaCarte({ tranche, prix, league, bloc: debut + i, l });
  }
}

test('juge du résumé : K compte toutes les cases jugées avant le premier verdict ; perte log en sens « min » (a = marché ou repère, b = moteur) ; carte à K′ et 200 blocs', async () => {
  const acc = new Accumulateurs();
  const bruit = (i) => ((i * 7919) % 101) / 1000;
  // 600 matchs : le moteur PIRE que le marché de 0,05 ; égal au repère.
  verserFabrique(acc, { n: 600, moteur: (i) => 1.05 + bruit(i), marche: (i) => 1.0 + bruit(i), repere: (i) => 1.05 + bruit(i) });
  // Une petite case de la carte (30 matchs, un autre championnat).
  verserFabrique(acc, { n: 30, moteur: (i) => 2.2 + bruit(i), repere: (i) => 2.4 + bruit(i), marketKey: 'scoreExact', mesure: 'grille', famille: 'scoreExact', league: 'Petit', debut: 1000 });
  const { K, Kc } = compterLesCases(acc);
  assert.equal(K, 3, 'le 1N2 face au marché et au repère, le score exact face au repère');
  assert.equal(Kc, 2, 'la carte : le 1N2 du championnat L (marché), le score exact du petit (repère)');
  const r = await resumer(acc, { tirages: 200 });
  assert.equal(r.juge.variantes, K);
  assert.equal(r.juge.minBlocs, MIN_BLOCS, 'le banc ne baisse jamais le seuil de preuve');
  const c = r.tranches.P3.cases.find((x) => x.marketKey === 'result' && x.sousTable === 'tout');
  assert.equal(c.marche.juge.verdict, 'moins-bon', 'le moteur pire que le marché');
  assert.ok(c.marche.juge.gain < 0);
  assert.equal(c.marche.juge.variantes, K);
  proche((c.marche.juge.fourchette[1] - c.marche.juge.fourchette[0]) / 2, zPour(0.05, K) * c.marche.juge.ecartType, 1e-12, 'demi-largeur = z(K) × écart-type');
  assert.equal(c.repere.juge.verdict, 'pas-prouve');
  assert.deepEqual(c.repere.juge.fourchette, [0, 0], 'deux pertes égales : [0 ; 0]');
  assert.equal(c.marche.n, c.n);
  assert.equal(c.repere.n, c.n);
  // La carte : K′ cases, 200 blocs exigés (30 matchs → pas assez de matchs, jamais « retenu »).
  assert.equal(r.juge.variantesCarte, Kc);
  const petite = r.carte.find((x) => x.league === 'Petit');
  assert.equal(petite.juge.verdict, 'pas-assez-de-matchs');
  assert.equal(petite.juge.variantes, Kc);
  // Une ligne sans mesure ne crée aucune case.
  const vide = new Accumulateurs();
  vide.ajouterLigne({ tranche: 'P3', prix: 'fd-avant-match', bloc: 1, l: { marketKey: 'result', famille: 'result', ligne: null, mesure: 'categorie', pl: null } });
  assert.equal(vide.cases.size, 0);
});

test('juge à part (fil du serveur) : le même verdict que sur place, au bit près ; une erreur du juge remonte nommée ; le fil se ferme', async () => {
  const bruit = (i) => ((i * 7919) % 101) / 1000;
  const remplir = () => {
    const acc = new Accumulateurs();
    verserFabrique(acc, { n: 600, moteur: (i) => 1.05 + bruit(i), marche: (i) => 1.0 + bruit(i), repere: (i) => 1.04 + bruit((i * 3) % 600) });
    verserFabrique(acc, { n: 30, moteur: (i) => 2.2 + bruit(i), repere: (i) => 2.4 + bruit(i), marketKey: 'scoreExact', mesure: 'grille', famille: 'scoreExact', league: 'Petit', debut: 1000 });
    return acc;
  };
  const surPlace = await resumer(remplir(), { tirages: 200 });
  const aPart = await resumer(remplir(), { tirages: 200, aPart: true });
  assert.deepEqual(aPart, surPlace, 'résumé identique, verdicts et fourchettes compris');
  // Un appel direct au fil : mêmes lignes (les cases vides sautées des deux côtés), même résultat que comparer.
  const { ouvrirJugeAPart, lignesDuJuge } = await import('../src/bench/jugeAPart.js');
  const { comparer, LignesInvalides } = await import('../src/bench/guard.js');
  const n = 500;
  const blocs = Int32Array.from({ length: n }, (_, i) => Math.floor(i / 2));
  const a = Float32Array.from({ length: n }, (_, i) => (i % 17 === 0 ? NaN : 1 + bruit(i)));
  const b = Float32Array.from({ length: n }, (_, i) => 0.99 + bruit(i + 3));
  const juge = ouvrirJugeAPart();
  try {
    const options = { sens: 'min', tirages: 300, graine: 7, variantes: 4, minBlocs: 20 };
    assert.deepEqual(await juge.comparer({ blocs, a, b, n }, options), comparer(lignesDuJuge(blocs, a, b, n), options));
    assert.ok(Number.isNaN(a[0]), 'les tableaux de la case restent les siens (copiés, pas transférés)');
    await assert.rejects(juge.comparer({ blocs, a, b, n }, { tirages: 100 }), (e) => e instanceof LignesInvalides && /sens de la mesure est obligatoire/.test(e.message), 'sans sens : l’erreur du juge, de sa classe');
  } finally {
    await juge.fermer();
  }
  await assert.rejects(juge.comparer({ blocs, a, b, n }, { sens: 'min' }), /fermé/);
});

test('paris : mise fixe sur la cote nette, valeur de clôture = cote prise × probabilité de clôture − 1, refus comptés ; résumé : rendement sans verdict, clôture avec verdict, journée pour bloc, pire série', () => {
  const ligneFd = { pin_c1: 205, pin_cn: 355, pin_c2: 390 };
  const staking = { action: 'RECOMMENDED', outcome: 'home', bookmaker: 'williamhill', odds: 2.26, displayedOdds: 2.3, fairOdds: 2.14, ev: 0.056, stake: 4.1 };
  const r = parisDUnMatch({ staking, issue: 'home', ligneFd, fixtureKey: 'f1', date: '2021-04-11', league: 'EPL' });
  assert.equal(r.pari.gain, gainMiseFixe({ cote: 2.26, gagne: true }), 'la cote NETTE, jamais la cote affichée');
  const pc = removeMargin([2.05, 3.55, 3.9]).probabilities[0];
  proche(r.pari.valeurCloture, 2.26 * pc - 1, 1e-15, 'valeur de clôture à la main');
  assert.equal(r.pari.bloc, '2021-04-11|EPL', 'la journée d’un championnat, jamais la date seule');
  assert.equal(r.pari.cle, 'f1|result|home');
  assert.equal(parisDUnMatch({ staking: { action: 'PASS', reason: 'trop_peu_de_bookmakers' }, issue: 'home' }).refus, 'trop_peu_de_bookmakers');
  assert.equal(parisDUnMatch({ staking, issue: null, nonReglable: 'prolongationSansScore90' }).nonReglable, 'prolongationSansScore90');
  // 300 paris fabriqués : gagnés un sur deux à cote 2, valeur de clôture +0,03.
  const paris = Array.from({ length: 300 }, (_, i) => ({ fixtureKey: `f${i}`, date: `2021-0${1 + (i % 9)}-1${i % 10}`, league: `L${i % 3}`, bloc: `x${i}`, cle: `f${i}|result|home`, issue: 'home', cote: 2, coteJuste: 2, gagne: i % 2 === 0, gain: i % 2 === 0 ? 1 : -1, miseKelly: 2, valeurCloture: 0.03, livreCloture: 'pinnacle', fraicheur: null }));
  paris[0].valeurCloture = null;
  const s = resumeDesParis(paris, { decisions: 400, refus: { pas_de_value: 100 }, tirages: 200, variantes: 7 });
  assert.equal(s.n, 300);
  assert.ok(!('verdict' in s.rendement.juge), 'le rendement rapporte, il ne juge pas');
  assert.ok(Number.isFinite(s.rendement.juge.ecartDetectable));
  assert.equal(s.valeurCloture.n, 299);
  assert.equal(s.valeurCloture.juge.variantes, 7);
  assert.equal(s.valeurCloture.juge.verdict, 'retenu');
  assert.equal(s.parTranche.find((t) => t.cle === '2-00-2-99').n, 300);
  assert.ok(Number.isInteger(s.pireSerie) && s.pireSerie >= 1);
  assert.ok(Number.isInteger(s.zoneNormale));
  proche(s.kelly.rendement, 0, 1e-12, 'Kelly : témoin');
});

test('variantes de prix : la moyenne en repli seulement avant Pinnacle (29/07/2005 → 26/07/2012), Bet365 comme prix ; jamais dans les paris de la règle', () => {
  const config = { edgeThresholdMin: 0.02, edgeThresholdMax: 0.25, maxValueOdds: 5, valueBookmakers: ['williamhill'], kellyFraction: 0.125, maxStakePercent: 0.02 };
  const match = (date, livres) => ({ home: 'A', away: 'B', bankroll: 1000, marketOdds: { odds1: 2.1, oddsDraw: 3.4, odds2: 3.6, byBookmaker: livres } });
  const moyenne = { key: 'fd_moyenne', title: 'moyenne', odds1: 2.1, oddsDraw: 3.4, odds2: 3.6, referenceOnly: true };
  const wh = { key: 'williamhill', title: 'William Hill', odds1: 2.4, oddsDraw: 3.2, odds2: 3.3 };
  const b365 = { key: 'b365', title: 'Bet365', odds1: 2.35, oddsDraw: 3.2, odds2: 3.3 };
  const avant = decisionsDesVariantes({ match: match('2010-01-01', [wh, b365, moyenne]), config, date: '2010-01-01' });
  assert.equal(avant['v-repli-moyenne'].action, 'RECOMMENDED');
  assert.equal(avant['v-repli-moyenne'].bookmaker, 'williamhill');
  assert.equal(avant['v-proxy-bet365'].bookmaker, 'b365', 'Bet365 : permis pour la variante seulement');
  const apres = decisionsDesVariantes({ match: match('2014-01-01', [wh, b365, moyenne]), config, date: '2014-01-01' });
  assert.equal(apres['v-repli-moyenne'], null, 'après le 26/07/2012 : pas de repli');
});

test('appariement : deux rejeux par la clé complète (match | marché | ligne | prix), lignes différentes et sans paire comptées ; --comparer : même format exigé, pas de verdict sans variantes', async () => {
  const ligne = (fixtureKey, marketKey, ligneDeButs, prix, pl) => ({ type: 'ligne', cle: P.cleDeLigne({ fixtureKey, marketKey, ligne: ligneDeButs, prix }), fixtureKey, marketKey, ligne: ligneDeButs, prix, date: '2021-01-01', league: 'L', mesures: { moteur: { perteLog: pl } } });
  const A = [ligne('m1', 'result', null, 'fd-avant-match', 1), ligne('m1', 'totalCorners', 9.5, 'fd-avant-match', 2.5), ligne('m2', 'result', null, 'fd-avant-match', 1.1), ligne('m3', 'result', null, 'fd-avant-match', 0.9)];
  const B = [ligne('m1', 'result', null, 'fd-avant-match', 0.95), ligne('m1', 'totalCorners', 10.5, 'fd-avant-match', 2.4), ligne('m2', 'result', null, 'fd-avant-match', null)];
  const r = apparierRejeux({ lignesA: A, lignesB: B });
  assert.equal(r.lignes.length, 1);
  assert.deepEqual(r.lignes[0], { bloc: 'm1', match: 'm1', cle: 'm1|result|-|fd-avant-match', date: '2021-01-01', a: 1, b: 0.95 });
  assert.deepEqual(r.ecartees, { sansPaire: 1, lignesDifferentes: 2, nonReglable: 1 });
  // Les fichiers d'échange.
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const dossier = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-banc-'));
  try {
    const ecrire = (nom, lignes, entete = null) => {
      const f = path.join(dossier, nom);
      const e = ecrivainDEchange(f, { moteur: { empreinte: nom.repeat(2), empreinteCode: 'c', version: null }, options: {} });
      lignes.forEach((l) => e.ecrire(l));
      e.fermer();
      if (entete) {
        const t = fs.readFileSync(f, 'utf8').split('\n');
        t[0] = JSON.stringify(entete);
        fs.writeFileSync(f, t.join('\n'));
      }
      return f;
    };
    const lignes = (decalage) => Array.from({ length: 250 }, (_, i) => ligne(`m${i}`, 'result', null, 'fd-avant-match', 1 + ((i * 37) % 11) / 20 + decalage));
    const fa = ecrire('a', lignes(0));
    const fb = ecrire('b', lignes(0.01));
    const sans = await comparerDesFichiers({ fichierA: fa, fichierB: fb, tirages: 200 });
    assert.equal(sans.verdict, null, 'sans --variantes ni --etapes : pas de verdict');
    assert.equal(sans.paires, 250);
    assert.deepEqual(sans.empreintes, { a: { empreinte: 'aa', empreinteCode: 'c', version: null }, b: { empreinte: 'bb', empreinteCode: 'c', version: null } });
    const avec = await comparerDesFichiers({ fichierA: fa, fichierB: fb, variantes: 3, tirages: 200 });
    assert.equal(avec.verdict, 'moins-bon');
    const f2 = ecrire('c', lignes(0), { formatEchange: 2, reglement: 'bp90' });
    await assert.rejects(() => comparerDesFichiers({ fichierA: fa, fichierB: f2 }), /format d’échange 2/);
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});

test('moteur (amendement A1) : la clé leagueGoalAverages — absente, le magasin d’aujourd’hui (l’appli inchangée) ; posée à cette moyenne, le même résultat champ pour champ ; nulle, le barème et jamais le magasin ; avec et sans cotes', () => {
  const j = lancer('moteur');
  assert.notDeepEqual(j.moyennes.reel, j.moyennes.bareme, 'un championnat dont la moyenne du magasin diffère du barème');
  for (const [nom, c] of Object.entries(j.cle)) {
    assert.deepEqual(c.reelle, c.absente, `${nom} : la moyenne posée = celle que le moteur lisait lui-même`);
    assert.deepEqual(c.nulle, c.bareme, `${nom} : nulle = le barème posé`);
    assert.notDeepEqual(c.nulle.distributions.totalGoals, c.absente.distributions.totalGoals, `${nom} : nulle ne relit jamais le magasin`);
  }
});

// ==================================================================== 6. copies : le rejeu

const rejeu = uneFois(() =>
  lancer('rejeu', {
    verifier: (db, j) => {
      const fd = db.prepare(`SELECT * FROM fd_history`).all();
      const parCle = new Map(fd.map((r) => [`fd:${r.code}|${r.date_fichier}|${r.dom}|${r.ext}`, r]));
      const parMatch = new Map(fd.filter((r) => r.match_key && r.lien === 1).map((r) => [r.match_key, r]));
      return {
        liens: Object.fromEntries(db.prepare('SELECT lien, COUNT(*) n FROM fd_history GROUP BY lien').all().map((r) => [r.lien, r.n])),
        lien0P2: db.prepare("SELECT COUNT(*) n FROM fd_history WHERE lien = 0 AND date BETWEEN '2019-07-01' AND '2023-06-30'").get().n,
        lignes1N2: j.r1.lignes1N2.map((l) => ({ l, fd: parCle.get(l.fixtureKey) })),
        cloture: j.r2.lignesCloture.map((l) => ({ l, fd: parMatch.get(l.matchKey) })),
        e0: fd.filter((r) => r.code === 'E0' && r.lien === 0 && r.date < '2022-01-01').map((r) => ({ date: r.date, saison: r.saison, bd: r.bd, be: r.be, cle: `fd:E0|${r.date_fichier}|${r.dom}|${r.ext}` })),
        // Par le jour de football-data (l'oracle, à la fin de la phase, a supprimé les rencontres du magasin d'après ses cibles).
        attachesP4b: db.prepare("SELECT COUNT(*) n FROM fd_history WHERE lien = 1 AND date >= '2026-08-01' AND moy_c1 IS NOT NULL").get().n,
        incoherentes: fd.filter((r) => r.lien === 1 && r.date >= '2026-08-01' && r.moy_c1 && removeMargin([r.moy_c1, r.moy_cn, r.moy_c2].map(cote)).anomaly).length
      };
    }
  })
);

test('rejeu : une ligne par rencontre × marché × jeu, clés uniques ; une rencontre un rejeu — lien 0 par football-data, 1 et 2 par le magasin, 3 et 4 écartées et comptées', () => {
  const j = rejeu();
  for (const r of [j.r1, j.r2]) {
    assert.equal(r.erreur, null);
    assert.equal(r.lignes, r.clesUniques, 'aucune clé en double');
    assert.equal(r.bilan.referenceDifferente, 0, 'le moteur rejoué prend la référence recalculée (A16)');
    assert.equal(r.bilan.grilleDifferente, 0, 'la grille du banc est celle du pronostic du score');
  }
  // P2 : chaque ligne lien = 0 rejouée une fois (plantées, le 9-0 et la ligne de 2023-03), la lien = 4 jamais.
  const fd = Object.keys(j.r1.parMatch).filter((k) => k.endsWith('|fd-avant-match'));
  assert.equal(fd.length, j.sql.lien0P2, 'une fois chacune');
  assert.equal(j.r1.bilan.rencontres.rejouees, j.sql.lien0P2);
  assert.equal(j.r1.comptes.P2.sansRencontreAuMagasin, 1, 'lien = 4 : écartée, comptée (décision de Pierre)');
  assert.ok(!Object.keys(j.r1.parMatch).some((k) => k.startsWith('fd:E0|2023-06-30|')), 'lien = 1 datée de P2 : jamais rejouée par football-data (le magasin la rejoue)');
  // Les 27 lignes d'une rencontre réglable, la clé du moteur et sa ligne.
  const unMatch = Object.values(j.r1.parMatch).find((l) => l.length === 27);
  assert.ok(unMatch, 'une rencontre à 27 lignes');
  for (const attendu of ['result|-', 'totalGoals|0.5', 'totalGoals|3.5', 'bothTeamsScore|-', 'teamGoals:home|1.5', 'teamGoals:away|2.5', 'resultAndTotal|1.5', 'scoreExact|-']) assert.ok(unMatch.includes(attendu), attendu);
  assert.ok(Object.values(j.r1.parMatch).some((l) => l.some((k) => /^totalCorners\|\d+\.5$/.test(k))), 'les comptes portent la demi-ligne du pronostic retenu');
  // P4 : les lignes rattachées (lien 1) jamais rejouées par football-data ; lien 2 et 3 comptées.
  assert.ok(Object.keys(j.r2.parMatch).every((k) => !k.startsWith('fd:')), 'aucune rencontre du magasin rejouée deux fois');
  assert.equal(j.r2.comptes.P4b.scoreDifferent, 1);
  assert.equal(j.r2.comptes.P4b.rattachementIncertain, 1);
  assert.ok(j.r2.comptes.P4b.parPrix['gratuites-avant-match'].sansPrix > 0, 'sans cote gratuite : compté par jeu');
  // Une case de prix 1N2 ne garde que des pronostics SUR LES COTES (moteur.source) : la clôture incohérente plantée est comptée, pas versée.
  assert.ok(j.r2.comptes.P4b.parPrix['fd-cloture']?.cotesIncoherentes >= 1, 'la cote incohérente comptée dans son jeu');
  const caseCloture = j.r2.cases.find((c) => c.cle === 'P4b|fd-cloture|result|-|tout');
  const lignesCloture = j.r2.lignesCloture.filter((l) => l.moteur.source === 'cotes').length;
  assert.equal(caseCloture.n, lignesCloture, 'la case du 1N2 à la clôture : exactement ses lignes « sur les cotes »');
  assert.deepEqual(j.sansFd, { erreur: null, rejouees: j.sansFd.rejouees });
  assert.ok(j.sansFd.rejouees > 0, 'sans football-data : aucune erreur');
  // L'avancement lu par la page : la passe football-data (la plus longue chez Pierre) et le juge, chacun avec son total.
  assert.ok(j.avancement.includes('football-data|total'), `avancement : ${j.avancement.join(', ')}`);
  assert.ok(j.avancement.includes('juge|total'));
  assert.ok(j.mainRendue > 10, `la main rendue ${j.mainRendue} fois`);
});

test('rejeu : le 1N2 du moteur est Pinnacle quand il cote (à 1e-6, perte log à 1e-5), sinon la moyenne des lignes saines ; le marché est la moyenne ; la clôture se lit à part', () => {
  const j = rejeu();
  let avecPin = 0;
  let sansPin = 0;
  for (const { l, fd } of j.sql.lignes1N2.filter((x) => x.l.marketKey === 'result' && x.l.prix === 'fd-avant-match')) {
    const d = l.moteur.distribution;
    let attendu;
    if (fd.pin_1) {
      attendu = removeMargin([fd.pin_1, fd.pin_n, fd.pin_2].map(cote)).probabilities;
      assert.equal(l.moteur.reference.palier, 'Pinnacle');
      avecPin++;
    } else {
      const lus = [['wh_1', 'wh_n', 'wh_2'], ['b365_1', 'b365_n', 'b365_2'], ['moy_1', 'moy_n', 'moy_2']]
        .map((cols) => cols.map((c) => cote(fd[c])))
        .filter((o) => o.every((x) => x > 1))
        .map((o) => removeMargin(o))
        .filter((r) => !r.anomaly)
        .map((r) => r.probabilities);
      const s = [0, 1, 2].map((k) => lus.reduce((a, p) => a + p[k], 0) / lus.length);
      const t = s[0] + s[1] + s[2];
      attendu = s.map((x) => x / t);
      assert.equal(l.moteur.reference.palier, 'moyenne-saine');
      sansPin++;
    }
    ['home', 'draw', 'away'].forEach((k, i) => proche(d[k], attendu[i], 1e-6, `${l.fixtureKey} ${k}`));
    proche(l.mesures.moteur.perteLog, -Math.log(attendu[['home', 'draw', 'away'].indexOf(l.issue)]), 1e-5, 'perte log');
    // Le marché : la moyenne d'avant-match, marge retirée.
    const m = removeMargin([fd.moy_1, fd.moy_n, fd.moy_2].map(cote)).probabilities;
    proche(l.mesures.marche.perteLog, -Math.log(Number(m[['home', 'draw', 'away'].indexOf(l.issue)].toFixed(6))), 1e-9, 'perte log du marché');
    assert.equal(l.issue, issue1N2(fd.bd, fd.be));
  }
  assert.ok(avecPin > 50 && sansPin > 50, `${avecPin} avec Pinnacle, ${sansPin} sans`);
});

test('reproduction : le chemin du moteur (moyenne de clôture SEULE, même quand Pinnacle clôture existe) égale la lecture directe ; la marge incohérente est comptée, pas corrigée', () => {
  const j = rejeu();
  const rp = j.r2.reproduction;
  assert.equal(rp.lectureDirecte.matchs, j.sql.attachesP4b, 'la lecture directe : toutes les lignes rattachées à clôture complète');
  assert.equal(rp.moteur.cotesIncoherentes, j.sql.incoherentes);
  assert.equal(rp.moteur.matchs + rp.moteur.cotesIncoherentes, rp.lectureDirecte.matchs);
  assert.equal(rp.moteur.maxEcartP, 0);
  assert.ok(rp.moteur.maxEcartPerteLog <= 1e-5);
  for (const { l, fd } of j.sql.cloture) {
    const m = removeMargin([fd.moy_c1, fd.moy_cn, fd.moy_c2].map(cote));
    if (m.anomaly) continue;
    ['home', 'draw', 'away'].forEach((k, i) => proche(l.moteur.distribution[k], m.probabilities[i], 1e-6, `${l.matchKey} ${k} (moyenne de clôture, jamais Pinnacle)`));
  }
  assert.ok(j.sql.cloture.some(({ fd }) => fd.pin_c1), 'des lignes ont une clôture Pinnacle : elle n’est pas prise');
});

test('repère courant : la part de plus de 2,5 d’avant J, recomptée à la main (saison ≥ 30, sinon 365 jours ≥ 10, sinon défaut) ; jamais le jour J', () => {
  const j = rejeu();
  const lignes = j.sql.lignes1N2.filter((x) => x.l.marketKey === 'totalGoals' && x.l.league === 'EPL' && x.l.prix === 'fd-avant-match' && x.l.date < '2022-01-01');
  let verifiees = 0;
  for (const { l } of lignes) {
    const J = l.date;
    const saison = Number(j.sql.e0.find((r) => r.cle === l.fixtureKey).saison.slice(0, 4));
    const avant = j.sql.e0.filter((r) => r.date < J);
    const enSaison = avant.filter((r) => Number(r.saison.slice(0, 4)) === saison);
    const unAn = new Date(`${J}T00:00:00Z`);
    unAn.setUTCDate(unAn.getUTCDate() - 365);
    const fenetre = enSaison.length >= 30 ? enSaison : avant.filter((r) => r.date >= unAn.toISOString().slice(0, 10));
    if (fenetre.length < 10) {
      assert.equal(l.repere.source, 'defaut');
      continue;
    }
    assert.equal(l.repere.source, enSaison.length >= 30 ? 'courant:saison' : 'courant:365');
    const part = fenetre.filter((r) => r.bd + r.be > 2.5).length / fenetre.length;
    proche(l.repere.perteLog, -Math.log(l.issue === 'over' ? part : 1 - part), 1e-9, `${l.fixtureKey}`);
    verifiees++;
  }
  assert.ok(verifiees > 100, `${verifiees} lignes vérifiées`);
});

test('déjà vu : P2 jamais vue (une ligne de 2023-03 aussi), P3 vue par la règle de pari, P4a apprise, P4b vérifiée — comptées par fenêtre', () => {
  const j = rejeu();
  const p2 = j.r1.cases.find((c) => c.cle === 'P2|fd-avant-match|result|-|tout');
  assert.deepEqual(p2.vues.parFenetre, {});
  assert.ok(j.sql.lignes1N2.some(({ l }) => l.date === '2023-03-11' && l.vues.length === 0 && l.periode === 'P2'));
  const vues = (cle) => j.r3.vues.find((c) => c.cle.startsWith(cle))?.vues;
  assert.ok(vues('P3|')?.parFenetre['regle-de-value-23-09'] > 0, 'P3');
  assert.ok(vues('P4a|')?.parFenetre['apprentissage-23-09'] > 0, 'P4a');
  const p4b = j.r2.cases.find((c) => c.cle.startsWith('P4b|') && c.sousTable === 'tout');
  assert.equal(p4b.vues.parFenetre['mesures-du-23-09'], p4b.vues.total);
  // Le huis clos : P2 a sa sous-table « hors huis clos ».
  assert.ok(j.r1.cases.some((c) => c.sousTable === 'horsHuisClos' && c.n > 0 && c.n < p2.n));
});

test('hors grille et comptes extrêmes : un 9-0 est réglé (perte log au plancher, compté, jamais écarté) ; 45 tirs : perte log finie ; mémoire : moins de +50 Mo', () => {
  const j = rejeu();
  const score = j.r1.neufZero.find((l) => l.marketKey === 'scoreExact');
  assert.equal(score.horsGrille, true);
  assert.equal(score.issue, '9-0');
  proche(score.mesures.moteur.perteLog, -Math.log(PROBA_MIN), 1e-12, 'perte au plancher');
  assert.ok(j.r1.bilan.horsGrille >= 1);
  assert.ok(j.r1.cases.some((c) => c.cle.includes('scoreExact') && c.horsGrille >= 1));
  const tirs = j.r1.neufZero.find((l) => l.marketKey === 'totalShots');
  assert.equal(tirs.issue, 45);
  assert.ok(Number.isFinite(tirs.mesures.moteur.perteLog) && tirs.mesures.moteur.perteLog > 0);
  assert.ok(j.tasAjouteMo < 50, `${j.tasAjouteMo} Mo`);
});

test('ORACLE : sur une copie tronquée (tout ce qui suit J supprimé), le chemin de l’appli — enrichMatchWithRealAverages puis analyzeMatch, mêmes prix — redonne EXACTEMENT les distributions du banc', () => {
  const j = rejeu();
  assert.ok(j.oracle.length >= 4, `${j.oracle.length} rencontres`);
  for (const o of j.oracle) {
    assert.equal(o.comparees, 47, `${o.matchKey} : 1N2, 4 + 1 + 8 lignes binaires, 3 combinés`);
    assert.ok(o.ecartMax <= 1e-6, `${o.matchKey} : écart ${o.ecartMax}`);
    assert.equal(o.corners.banc, o.corners.appli, `${o.matchKey} : corners attendus`);
  }
});
