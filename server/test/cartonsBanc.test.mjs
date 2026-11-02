/**
 * LES CARTONS (étape 33, lot 1a, partie B, 02/11/2026) — le banc (sur des MONDES TIRÉS AU HASARD : aucune donnée réelle,
 * aucune base ; le passage unique sur le magasin n'est pas rejoué ici).
 *   node --test test/cartonsBanc.test.mjs        (depuis server/)
 *
 * T-L6    les moments (dispersions) retrouvent un 1/k planté à 0,08 sur 50 000 matchs (à 0,01 près) ; ils rendent une valeur
 *         NÉGATIVE sur des comptes binomiaux ;
 * T-B1    effets plantés (pris 0,10, provoqués 0,06, arbitre 0,08) → « retenu » pour les équipes et l'arbitre, exposants
 *         appris dans l'intervalle attendu ; effets nuls → jamais « retenu » ;
 * T-B2    le faux arbitre n'est jamais « retenu » (20 graines), même quand le vrai arbitre a un effet fort ;
 * T-B2bis un attendu bruité mais juste en moyenne face à une variante qui baisse tout de 2 % sur la moitié des matchs :
 *         jamais « retenu » avec la perte de la loi entière (20 graines) ; avec les seules lignes binaires, le z moyen est
 *         rapporté (la démonstration du piège) ;
 * T-B3    par championnat : des championnats identiques sont ramenés au commun (τ² = 0) ; un écart planté de 5 % sur la
 *         moitié des championnats est retrouvé et « retenu » ; le faux championnat n'est jamais « retenu » ;
 * T-B3bis (critique, constat 1 ; bug 47) des constantes du moteur décalées (tirs : 0,9 % / 0,5 %), AUCUN écart entre
 *         championnats → jamais « retenu » sur 12 graines sur 12 : le bras A est le commun du PLI, jamais les constantes ;
 * T-B4    K = VARIANTES_DE_L_ETAPE_33.length = 8 ; une variante non déclarée est refusée ; z = 2,7344 ;
 * T-B5    les lignes { bloc, date, a, b } : la somme des trois pertes (équipes et total), plancher 1e-6 ; le juge de l'étape
 *         16 les accepte ; un match sans arbitre connu n'est pas dans cartons-arbitre ;
 * T-B6    chaque ligne est jugée avec ce qui a été appris sur l'AUTRE pli ; aucune ligne de la mise en route ; une
 *         rencontre d'après le 23/09/2026 fait lever ;
 * T-B8    l'ampleur se calcule sans résultat (les comptes remplacés par des NaN : même valeur) ;
 * T-B9    les comptes ne calculent ni attendu ni perte : comptesDesCartons.js n'importe pas le banc, n'appelle ni
 *         attendusDesCartons ni perteDesComptes ; sa sortie n'a aucune moyenne par équipe ni par arbitre ;
 * T-B11   les valeurs finales sont apprises sur les deux plis réunis ; l'horizon de la preuve suit sa formule ;
 * T-B12   (critique, constat 3, réécrit honnêtement) les arbitres désignés selon l'intensité VRAIE des matchs, AUCUN effet
 *         d'arbitre : l'indice face aux attendus des équipes est nettement plus petit que face à la moyenne de la
 *         compétition ; ce qu'il en reste est rapporté (le banc ne sépare pas la sévérité des matchs confiés) ;
 * T-B13   (critique, constat 2 ; bug 48) le niveau de chaque championnat dérive (marche aléatoire, 10 % par saison),
 *         AUCUN effet d'équipe → cartons-equipes jamais « retenu » : le repère suit la tendance des 60 derniers matchs (sans
 *         elle, « retenu » à z 4 à 13 dans ces mondes : la démonstration de la critique) ;
 * T-B14   (critique, constat 10 ; bug 54) les deux bras de cartons-arbitre (et du placebo) sont appris sur les MÊMES
 *         matchs ;
 * T-B15   « utile » : retenu, 200 matchs, ampleur, et le placebo de SA famille pas « retenu » ;
 * T-B16   le passage entier, rapports compris, sans lever ; une note null donne « pas encore mesuré » partout ;
 * T-B7    noteDesCartons.js = texteDeLaNote(aRecopier(test/fixtures/banc-cartons-etape33.json)) À L'OCTET (recopiée par script,
 *         jamais à la main), les règles gardées = celles scellées (sha1 cfd5ad07…) ;
 * T-B10   le script (un seul regard : K, règles par sha1, passe de Pierre, verrou avant la lecture, sortie jamais écrasée,
 *         second passage refusé sans raison) et la recopie de la note par script.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { mondeDesCartons, lignesDeStatistique, generateur, binomialeNegative } from './aides/cartonsMondes.mjs';
import { executerSansPause } from '../src/utils/travailCooperatif.js';
import { VARIANTES_DE_L_ETAPE_33 } from '../src/bench/lancements.js';
import { zPour } from '../src/bench/guard.js';
import * as BANC from '../src/data/cartons/bancDesCartons.js';
import { comptesDesCartons } from '../src/data/cartons/comptesDesCartons.js';
import { CartonsAuJourJ, passerLesRencontres } from '../src/data/cartons/cartonsAuJourJ.js';
import { indiceDArbitre, cleDArbitre, perteDesComptes, probabilitePlusDe } from '../src/data/cartons/formulesDesCartons.js';
import { PREUVE } from '../src/data/cartons/reglagesCartons.js';

const SRC = path.join(SERVEUR, 'src');
const donnees = (monde) => executerSansPause(BANC.donneesDuBanc(monde));
const vide = { cartons: [], stats: { corners: [], tirs: [], cadres: [] } };
/** Un arbitre jamais vu avant, sur deux matchs de 2024 (son premier match n'a pas d'indice ; le placebo garde son faux arbitre). */
const avecUnInconnu = (monde) => {
  const k = monde.findIndex((r) => r.date >= '2024-03-01');
  return monde.map((r, i) => (i === k || i === k + 40 ? { ...r, arbitre: { nom: 'Arbitre Inconnu', pays: 'Ailleurs' } } : r));
};
const juger = (d, variantes, options = {}) => BANC.jugerLesVariantes(d, { variantes, rapports: false, ...options });
const verdictDe = (b, id) => b.variantes.find((v) => v.id === id);

test('T-L6 les moments retrouvent un 1/k planté à 0,08 (50 000 matchs) ; ils rendent une valeur négative sur des comptes binomiaux', () => {
  const u = generateur(6);
  const paires = [];
  for (let i = 0; i < 50_000; i++) {
    const muh = 3 + 4 * u();
    const mua = 2 + 4 * u();
    paires.push({ xh: binomialeNegative(u, muh, 0.08), xa: binomialeNegative(u, mua, 0.08), muh, mua });
  }
  const d = BANC.dispersions(paires);
  assert.ok(Math.abs(d.equipe.valeur - 0.08) < 0.01, `1/k équipe ${d.equipe.valeur}`);
  // La formule même : 1/k = Σ [(x − μ)² − μ] / Σ μ² (les deux camps, le match comme unité), autour des attendus DONNÉS ; le
  // total de même avec x_h + x_a et μ_h + μ_a.
  let na = 0;
  let nb = 0;
  let ta = 0;
  let tb = 0;
  for (const q of paires) {
    na += (q.xh - q.muh) ** 2 - q.muh + (q.xa - q.mua) ** 2 - q.mua;
    nb += q.muh ** 2 + q.mua ** 2;
    ta += (q.xh + q.xa - q.muh - q.mua) ** 2 - (q.muh + q.mua);
    tb += (q.muh + q.mua) ** 2;
  }
  assert.ok(Math.abs(d.equipe.valeur - na / nb) < 1e-12, `${d.equipe.valeur} / ${na / nb}`);
  assert.ok(Math.abs(d.total.valeur - ta / tb) < 1e-12);
  const b = [];
  for (let i = 0; i < 50_000; i++) {
    const tire = () => Array.from({ length: 10 }, () => (u() < 0.2 ? 1 : 0)).reduce((s, x) => s + x, 0);
    b.push({ xh: tire(), xa: tire(), muh: 2, mua: 2 });
  }
  const db = BANC.dispersions(b);
  assert.ok(db.equipe.valeur < -0.05 && db.equipe.valeur > -0.15, `binomiale(10 ; 0,2) : 1/k = −1/10 (${db.equipe.valeur})`);
});

test('T-B1 effets plantés → « retenu » pour les équipes et l’arbitre, exposants dans l’intervalle attendu ; effets nuls → jamais « retenu »', () => {
  const avec = juger(donnees(mondeDesCartons({ graine: 11, sdPris: 0.1, sdProvoques: 0.06, sdArbitre: 0.08 })), ['cartons-equipes', 'cartons-arbitre', 'cartons-placebo'], { tirages: 300 });
  assert.equal(verdictDe(avec, 'cartons-equipes').verdict, 'retenu', JSON.stringify(verdictDe(avec, 'cartons-equipes').fourchetteRelative));
  assert.equal(verdictDe(avec, 'cartons-arbitre').verdict, 'retenu');
  assert.notEqual(verdictDe(avec, 'cartons-placebo').verdict, 'retenu');
  for (const p of verdictDe(avec, 'cartons-equipes').plis) {
    assert.ok(p.B.parametres.alpha > 0.2 && p.B.parametres.alpha < 1.6, `α ${p.B.parametres.alpha}`);
    assert.ok(p.B.parametres.gamma > -0.5 && p.B.parametres.gamma < 2, `γ ${p.B.parametres.gamma} (effet planté faible : 0,06)`);
  }
  for (const p of verdictDe(avec, 'cartons-arbitre').plis) assert.ok(p.B.parametres.beta > 0.3 && p.B.parametres.beta < 2, `β ${p.B.parametres.beta}`);
  const sans = juger(donnees(mondeDesCartons({ graine: 12, sdPris: 0, sdProvoques: 0, sdArbitre: 0 })), ['cartons-equipes', 'cartons-arbitre', 'cartons-placebo'], { tirages: 300 });
  for (const v of sans.variantes) assert.notEqual(v.verdict, 'retenu', `${v.id} sous un effet nul`);
  assert.equal(avec.K, 8);
});

test('T-B2 le faux arbitre n’est jamais « retenu » (20 graines), même quand le vrai arbitre a un effet fort', () => {
  for (let g = 0; g < 20; g++) {
    const b = juger(donnees(mondeDesCartons({ graine: 100 + g, ligues: 3, sdPris: 0.05, sdProvoques: 0.05, sdArbitre: 0.15 })), ['cartons-placebo'], { tirages: 200 });
    assert.notEqual(verdictDe(b, 'cartons-placebo').verdict, 'retenu', `graine ${100 + g}`);
  }
});

test('T-B2bis attendu bruité mais juste en moyenne face à « tout −2 % sur la moitié des matchs » : jamais « retenu » avec la loi entière ; le z moyen des seules lignes binaires est rapporté', () => {
  const zLoi = [];
  const zBin = [];
  for (let g = 0; g < 20; g++) {
    const u = generateur(500 + g);
    const loi = [];
    const bin = [];
    for (let i = 0; i < 4000; i++) {
      const vrai = { home: 1.5 + 2 * u(), away: 1.5 + 2 * u() };
      const x = { home: binomialeNegative(u, vrai.home, 0), away: binomialeNegative(u, vrai.away, 0) };
      const s = 0.3;
      const bruit = () => Math.exp(s * Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u()) - (s * s) / 2);
      const muA = { home: vrai.home * bruit(), away: vrai.away * bruit() };
      const f = i % 2 ? 0.98 : 1;
      const muB = { home: muA.home * f, away: muA.away * f };
      const pa = BANC.perteDuMatch(x, muA, 0, 0);
      const pb = BANC.perteDuMatch(x, muB, 0, 0);
      const d = i < 2000 ? '2024-01-01' : '2025-08-01';
      loi.push({ bloc: `m${i}`, date: d, a: pa.somme, b: pb.somme });
      // Les seules lignes binaires « plus de ℓ » autour de l'attendu du total.
      const t = muA.home + muA.away;
      for (const l of [Math.floor(t) - 0.5, Math.floor(t) + 0.5, Math.floor(t) + 1.5].filter((y) => y > 0)) {
        const r = x.home + x.away > l;
        const p1 = probabilitePlusDe(t, 0, l);
        const p2 = probabilitePlusDe(muB.home + muB.away, 0, l);
        bin.push({ bloc: `m${i}`, date: d, a: -Math.log(Math.max(1e-6, r ? p1 : 1 - p1)), b: -Math.log(Math.max(1e-6, r ? p2 : 1 - p2)) });
      }
    }
    const jl = BANC.jugerDesLignes(loi, { K: 8, tirages: 200 });
    const jb = BANC.jugerDesLignes(bin, { K: 8, tirages: 200 });
    assert.notEqual(jl.verdict, 'retenu', `graine ${500 + g} : la loi entière ne récompense jamais une baisse injustifiée`);
    zLoi.push(jl.zObserve);
    zBin.push(jb.zObserve);
  }
  const moy = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  assert.ok(moy(zLoi) < 0, `z moyen de la loi entière négatif (${moy(zLoi)})`);
  // La démonstration est RAPPORTÉE (son signe dépend des attendus simulés : constat 1 de la critique de la 32).
  console.log(`T-B2bis : z moyen loi entière ${moy(zLoi).toFixed(2)} ; lignes binaires ${moy(zBin).toFixed(2)}`);
});

test('T-B3 par championnat : identiques → ramenés au commun ; 5 % plantés sur la moitié → retrouvés et « retenu » ; le faux championnat jamais « retenu »', () => {
  const pareils = lignesDeStatistique({ graine: 31, ligues: 20, parLigue: 300 });
  const a = BANC.apprendreParChampionnat(pareils.filter((l) => l.pli === 'A'));
  assert.ok(a.tau2.dom < 1e-3 && a.tau2.ext < 1e-3, `τ² ≈ 0 (${JSON.stringify(a.tau2)})`);
  for (const r of a.parLigue.values()) {
    assert.ok(Math.abs(r.dom - a.commun.dom) < 0.02, `ramené vers le commun : ${r.dom} / ${a.commun.dom}`);
  }
  // Le retour vers le commun : chaque valeur retenue est entre le commun et sa mesure brute, et nettement plus près en tout.
  let brut = 0;
  let retenu = 0;
  for (const r of a.parLigue.values()) {
    assert.ok(Math.abs(r.dom - a.commun.dom) <= Math.abs(r.mesure.dom - a.commun.dom) + 1e-12);
    brut += Math.abs(r.mesure.dom - a.commun.dom);
    retenu += Math.abs(r.dom - a.commun.dom);
  }
  assert.ok(retenu < 0.9 * brut, `ramenés vers le commun (${retenu} contre ${brut})`);
  // Un championnat de moins de 30 matchs au pli d'apprentissage reçoit EXACTEMENT le commun (le bras A).
  const mini = [...pareils.filter((l) => l.pli === 'A'), ...pareils.filter((l) => l.pli === 'A').slice(0, 12).map((l, i) => ({ ...l, cle: `mini-${i}`, league: 'Ligue Mini', xh: l.xh + 3 }))];
  const am = BANC.apprendreParChampionnat(mini).parLigue.get('Ligue Mini');
  const cm = BANC.apprendreParChampionnat(mini).commun;
  assert.deepEqual([am.propre, am.dom, am.ext, am.invKEquipe, am.invKTotal], [false, cm.dom, cm.ext, cm.invKEquipe, cm.invKTotal]);
  const ecarts = new Map(Array.from({ length: 10 }, (_, i) => [`Ligue ${i + 1}`, 1.05]));
  const plantes = lignesDeStatistique({ graine: 32, ligues: 20, parLigue: 300, ecarts });
  const b = BANC.apprendreParChampionnat(plantes.filter((l) => l.pli === 'A'));
  const moyenne = (f) => [...b.parLigue].filter(([k]) => f(k)).reduce((s, [, r]) => s + r.dom, 0) / 10;
  const ecart = moyenne((k) => ecarts.has(k)) / moyenne((k) => !ecarts.has(k));
  assert.ok(ecart > 1.03 && ecart < 1.07, `l’écart planté de 5 % retrouvé (${ecart})`);
  const j = juger({ ...vide, stats: { ...vide.stats, corners: plantes } }, ['corners-championnat', 'championnat-placebo'], { tirages: 300 });
  assert.equal(verdictDe(j, 'corners-championnat').verdict, 'retenu');
  assert.notEqual(verdictDe(j, 'championnat-placebo').verdict, 'retenu');
  for (let g = 0; g < 10; g++) {
    const l = lignesDeStatistique({ graine: 40 + g, ligues: 20, parLigue: 200 });
    assert.notEqual(verdictDe(juger({ ...vide, stats: { ...vide.stats, corners: l } }, ['championnat-placebo'], { tirages: 200 }), 'championnat-placebo').verdict, 'retenu', `graine ${40 + g}`);
  }
});

test('T-B3bis des constantes du moteur décalées (tirs : 0,9 % et 0,5 %), aucun écart entre championnats → jamais « retenu » (12 graines) : le bras A est le commun du pli', () => {
  const moteur = BANC.reglageDuMoteur('tirs');
  let retenus = 0;
  for (let g = 0; g < 12; g++) {
    const l = lignesDeStatistique({ graine: 700 + g, ligues: 20, parLigue: 300, facteurs: { dom: moteur.dom * 1.009, ext: moteur.ext * 1.005 }, invKVrai: moteur.invKEquipe, moyenne: 12 });
    const v = verdictDe(juger({ ...vide, stats: { ...vide.stats, tirs: l } }, ['tirs-championnat'], { tirages: 200 }), 'tirs-championnat');
    if (v.verdict === 'retenu') retenus++;
  }
  assert.equal(retenus, 0, 'aucun « retenu » sans écart entre championnats');
});

test('T-B4 K = 8 exigé ; une variante non déclarée est refusée ; z = 2,7344', () => {
  assert.equal(VARIANTES_DE_L_ETAPE_33.length, 8);
  assert.deepEqual([...BANC.VARIANTES_JUGEES], VARIANTES_DE_L_ETAPE_33.map((v) => v.id).slice(1));
  assert.equal(Number(zPour(0.05, 8).toFixed(4)), 2.7344);
  assert.throws(() => BANC.jugerLesVariantes(vide, { K: 7 }), /K \(7\) doit valoir le nombre de variantes déclarées \(8/);
  assert.throws(() => BANC.jugerLesVariantes(vide, { variantes: ['cartons-enjeu'] }), /n'est pas déclarée/);
  const b = BANC.jugerLesVariantes(vide, { rapports: false });
  assert.equal(Number(b.z.toFixed(4)), 2.7344);
  // Chaque variante jugée l'est à K = 8 (jamais au nombre de variantes retenues ou jugées).
  const d = donnees(mondeDesCartons({ graine: 20, ligues: 2 }));
  const j = juger(d, ['cartons-equipes'], { tirages: 100, minBlocs: 10 });
  assert.deepEqual([j.variantes[0].variantes, Number(j.variantes[0].z.toFixed(4))], [8, 2.7344]);
  for (const id of Object.keys(BANC.FORMES)) assert.ok(VARIANTES_DE_L_ETAPE_33.some((v) => v.id === id), id);
});

test('T-B5 les lignes : la somme des trois pertes, plancher 1e-6 ; le juge les accepte ; un match sans arbitre connu n’est pas dans cartons-arbitre', () => {
  const p = BANC.perteDuMatch({ home: 3, away: 1 }, { home: 2.1, away: 2.6 }, -0.05, 0.02);
  assert.equal(p.somme, p.home + p.away + p.total);
  assert.equal(p.home, perteDesComptes(3, 2.1, -0.05));
  assert.equal(p.total, perteDesComptes(4, 4.7, 0.02));
  assert.equal(BANC.perteDuMatch({ home: 60, away: 0 }, { home: 1, away: 1 }, 0, 0).home, -Math.log(1e-6), 'plancher');
  const d = donnees(avecUnInconnu(mondeDesCartons({ graine: 21, ligues: 3 })));
  const sans = d.cartons.find((m) => m.nArb === 0);
  assert.ok(sans, 'un match à arbitre sans match d’avant');
  const v = BANC.lignesDesCartons(d.cartons, BANC.FORMES['cartons-arbitre']);
  assert.ok(!v.lignes.some((l) => l.bloc === sans.cle));
  for (const l of v.lignes.slice(0, 50)) assert.deepEqual(Object.keys(l).sort(), ['a', 'b', 'bloc', 'date', 'pli']);
  assert.doesNotThrow(() => BANC.jugerDesLignes(v.lignes, { K: 8, tirages: 100 }));
  // Chaque ligne = la somme des trois pertes du match sous chaque bras (la loi entière : jamais des lignes binaires).
  for (const [i, q] of v.pourAmpleur.slice(0, 20).entries()) {
    assert.equal(v.lignes[i].a, BANC.perteDuMatch(q.x, q.muA, q.dispA.equipe, q.dispA.total).somme);
    assert.equal(v.lignes[i].b, BANC.perteDuMatch(q.x, q.muB, q.dispB.equipe, q.dispB.total).somme);
  }
});

test('T-B6 chaque ligne jugée avec ce qui a été appris sur l’AUTRE pli ; rien de la mise en route ; une rencontre d’après le 23/09/2026 fait lever', () => {
  const d = donnees(mondeDesCartons({ graine: 22, ligues: 3 }));
  assert.ok(d.miseEnRoute > 0);
  assert.ok(d.cartons.every((m) => m.date >= '2023-07-01' && m.date <= '2026-09-23'));
  const v = BANC.lignesDesCartons(d.cartons, BANC.FORMES['cartons-equipes']);
  const A = d.cartons.filter((m) => m.pli === 'A').length;
  const B = d.cartons.filter((m) => m.pli === 'B').length;
  assert.deepEqual(v.plis.map((p) => [p.apprisSur, p.jugeSur, p.matchsAppris, p.matchsJuges]), [['A', 'B', A, B], ['B', 'A', B, A]]);
  for (const l of v.lignes) assert.equal(l.pli === 0 ? l.date >= '2025-07-01' : l.date <= '2025-06-30', true, `${l.bloc} (pli ${l.pli})`);
  // Appris sur l'autre pli : changer les cartons du pli JUGÉ ne change pas les paramètres qui le jugent.
  const autre = d.cartons.map((m) => (m.pli === 'B' ? { ...m, C: { home: m.C.home + 3, away: m.C.away, total: m.C.total + 3 } } : m));
  const w = BANC.lignesDesCartons(autre, BANC.FORMES['cartons-equipes']);
  assert.deepEqual(w.plis[0].B.parametres, v.plis[0].B.parametres, 'le pli 0 (juge B) ne voit pas les cartons de B');
  assert.notDeepEqual(w.plis[1].B.parametres, v.plis[1].B.parametres);
  const apres = mondeDesCartons({ graine: 23, ligues: 1, fin: '2026-09-30' });
  assert.throws(() => donnees(apres), /après le dernier jour lu/);
  assert.throws(() => BANC.jugerLesVariantes({ ...d, cartons: [...d.cartons, { ...d.cartons[0], cle: 'x', date: '2026-09-24' }] }, { rapports: false }), /après le dernier jour lu/);
});

test('T-B8 l’ampleur se calcule sans résultat : les comptes remplacés par des NaN donnent la même valeur', () => {
  const d = donnees(mondeDesCartons({ graine: 24, ligues: 3 }));
  const v = BANC.lignesDesCartons(d.cartons, BANC.FORMES['cartons-equipes']);
  const a = BANC.ampleur(v.pourAmpleur);
  const b = BANC.ampleur(v.pourAmpleur.map((q) => ({ ...q, x: { home: Number.NaN, away: Number.NaN } })));
  assert.deepEqual(b, a);
  assert.ok(a.max > 0 && ['total', 'home', 'away'].includes(a.portee));
});

test('T-B9 les comptes ne calculent ni attendu ni perte, n’importent pas le banc ; leur sortie n’a aucune moyenne par équipe ni par arbitre', () => {
  const texte = fs.readFileSync(path.join(SRC, 'data', 'cartons', 'comptesDesCartons.js'), 'utf8');
  const imports = [...texte.matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, ['./cartonsAuJourJ.js', './formulesDesCartons.js', './reglagesCartons.js']);
  assert.doesNotMatch(texte.replace(/\/\*[\s\S]*?\*\//g, ''), /bancDesCartons|attendusDesCartons|perteDesComptes|attendusParChampionnat|loiDesCartons|\.rho\b|\.pi\b|\.pris\b|\.provoques\b|\.z\b/);
  const c = executerSansPause(comptesDesCartons(mondeDesCartons({ graine: 25, ligues: 2 })));
  const cles = new Set();
  const parcourir = (o) => {
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      cles.add(k);
      parcourir(v);
    }
  };
  parcourir(c);
  for (const interdite of ['rho', 'pi', 'pris', 'provoques', 'O', 'E', 'z', 'm', 'moyenne', 'attendu', 'perte']) assert.ok(!cles.has(interdite), interdite);
  assert.ok(c.plis.A.releves > 0 && c.plis.B.releves > 0);
});

test('T-B11 les valeurs finales sont apprises sur les deux plis réunis ; l’horizon de la preuve suit sa formule', () => {
  const d = donnees(mondeDesCartons({ graine: 26, ligues: 3 }));
  const f = BANC.valeursFinales(d);
  const tous = BANC.bras(d.cartons, 'equipes');
  assert.equal(f.cartons.matchs, d.cartons.length);
  assert.equal(f.cartons.equipes.parametres.alpha, Number(tous.parametres.alpha.toFixed(6)));
  assert.equal(f.cartons.complet.matchs, d.cartons.filter((m) => m.nArb >= 1 && Number.isFinite(m.z)).length);
  const h = BANC.horizonDeLaPreuve({ nBanc: 34_800, zBanc: 8.5, K: 8, parJour: 70 });
  assert.equal(h.matchs, Math.ceil(34_800 * ((zPour(0.05, 8) + PREUVE.zPuissance) / 8.5) ** 2));
  assert.equal(h.jours, Math.max(60, Math.ceil(h.matchs / 70)));
  assert.equal(BANC.horizonDeLaPreuve({ nBanc: 100, zBanc: 3, parJour: 70 }).jours, 60, '60 jours au moins');
  assert.equal(BANC.horizonDeLaPreuve({ nBanc: 100, zBanc: -1 }), null);
});

test('T-B12 arbitres désignés selon l’intensité VRAIE, aucun effet d’arbitre : l’indice face aux attendus des équipes est nettement plus petit que face à la moyenne de la compétition ; le reste est rapporté', () => {
  const monde = mondeDesCartons({ graine: 27, ligues: 4, sdPris: 0.15, sdProvoques: 0.15, sdArbitre: 0, affectation: 'intensite' });
  // Face aux attendus « équipes » : l'indice de la passe (CartonsAuJourJ). Face à la moyenne : O / (m_dom + m_ext).
  const acc = new CartonsAuJourJ();
  const faceMoyenne = new Map();
  executerSansPause(passerLesRencontres(acc, monde, {
    avantLaJournee: (jour, inst, du) => {
      for (const r of du) {
        const x = inst.get(r.matchKey);
        if (!x.m) continue;
        const cle = cleDArbitre(r.arbitre);
        const s = faceMoyenne.get(cle) ?? { O: 0, E: 0, n: 0 };
        s.O += r.valeur.total;
        s.E += x.m.dom + x.m.ext;
        s.n += 1;
        faceMoyenne.set(cle, s);
      }
    }
  }));
  const dispersion = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
  const equipes = acc.clesDesArbitres().map((c) => acc.etatDeLArbitre(c).z);
  const moyenne = [...faceMoyenne.values()].map((s) => indiceDArbitre(s.O, s.E, s.n));
  const zE = dispersion(equipes);
  const zM = dispersion(moyenne);
  assert.ok(zM > 0.05, `face à la moyenne, les arbitres « des matchs chauds » paraissent sévères (${zM})`);
  assert.ok(zE < 0.6 * zM, `face aux attendus des équipes, nettement moins (${zE} contre ${zM})`);
  console.log(`T-B12 : écart des indices face à la moyenne ${zM.toFixed(3)}, face aux équipes ${zE.toFixed(3)} (le reste : la désignation, que le banc ne sépare pas)`);
});

test('T-B13 une dérive de 10 % par saison, aucun effet d’équipe → cartons-equipes jamais « retenu » : le repère suit la tendance', () => {
  for (let g = 0; g < 4; g++) {
    const b = juger(donnees(mondeDesCartons({ graine: 900 + g, ligues: 8, sdPris: 0, sdProvoques: 0, sdArbitre: 0, derive: 0.1 })), ['cartons-equipes'], { tirages: 200 });
    const v = verdictDe(b, 'cartons-equipes');
    assert.notEqual(v.verdict, 'retenu', `graine ${900 + g} (z ${v.zObserve})`);
  }
});

test('T-B14 les deux bras de cartons-arbitre (et du placebo) sont appris sur les MÊMES matchs', () => {
  const d = donnees(avecUnInconnu(mondeDesCartons({ graine: 28, ligues: 3 })));
  for (const id of ['cartons-arbitre', 'cartons-placebo']) {
    const forme = BANC.FORMES[id];
    const v = BANC.lignesDesCartons(d.cartons, forme);
    const sous = BANC.sousEnsemble(d.cartons, forme);
    for (const p of v.plis) {
      assert.equal(p.A.matchs, p.B.matchs, `${id}, pli ${p.pli}`);
      assert.equal(p.A.matchs, sous.filter((m) => m.pli === p.apprisSur).length);
    }
    if (id === 'cartons-arbitre') assert.ok(sous.length < d.cartons.length, 'le sous-ensemble (arbitre avec un match d’avant) est plus petit que tous les matchs');
  }
});

test('T-B15 « utile » : retenu, 200 matchs, ampleur d’au moins 0,5 point, et le placebo de SA famille pas « retenu » (sinon le banc de la famille est faux) ; un placebo n’est jamais utile', () => {
  const v = (id, famille, verdict, { n = 5000, amp = 0.02, placebo = false } = {}) => ({ id, famille, placebo, verdict, matchsJuges: n, ampleur: { max: amp } });
  const r1 = [v('cartons-equipes', 'cartons', 'retenu'), v('cartons-arbitre', 'cartons', 'retenu', { amp: 0.004 }), v('cartons-placebo', 'cartons', 'pas-prouve', { placebo: true }), v('tirs-championnat', 'championnat', 'retenu', { n: 150 }), v('corners-championnat', 'championnat', 'pas-prouve'), v('championnat-placebo', 'championnat', 'pas-prouve', { placebo: true })];
  const d1 = BANC.decider(r1);
  assert.deepEqual(r1.map((x) => x.utile), [true, false, false, false, false, false]);
  assert.deepEqual(d1.bancFaux, { cartons: false, championnat: false });
  assert.match(r1[1].raisons.join(), /ampleur sous 0,5 point/);
  assert.match(r1[3].raisons.join(), /150 matchs jugés/);
  const r2 = [v('cartons-equipes', 'cartons', 'retenu'), v('cartons-placebo', 'cartons', 'retenu', { placebo: true }), v('tirs-championnat', 'championnat', 'retenu'), v('championnat-placebo', 'championnat', 'pas-prouve', { placebo: true })];
  const d2 = BANC.decider(r2);
  assert.deepEqual(d2.bancFaux, { cartons: true, championnat: false });
  assert.deepEqual(r2.map((x) => x.utile), [false, false, true, false], 'le banc des cartons est faux ; celui du championnat ne l’est pas');
  assert.match(r2[0].raisons.join(), /le banc de cette famille est faux/);
});

test('T-B16 le passage entier, rapports compris (calibration, conventions, recentrage commun, sous-fenêtre jamais vue par les constantes), se calcule sans lever ; valeurs finales, note et statuts ; une note null donne « pas encore mesuré » partout', () => {
  const d = donnees(mondeDesCartons({ graine: 29, ligues: 3 }));
  d.stats.corners = lignesDeStatistique({ graine: 30, ligues: 8, parLigue: 120 });
  d.stats.tirs = lignesDeStatistique({ graine: 31, ligues: 8, parLigue: 120, moyenne: 12 });
  d.stats.cadres = lignesDeStatistique({ graine: 32, ligues: 8, parLigue: 120, moyenne: 4 });
  const b = BANC.jugerLesVariantes(d, { tirages: 100 });
  assert.deepEqual(b.variantes.map((v) => v.id), [...BANC.VARIANTES_JUGEES]);
  for (const v of b.variantes) assert.ok(Number.isFinite(v.calibration.A.ecartMoyenPoints) && Number.isFinite(v.calibration.B.ecartMoyenPoints), v.id);
  assert.deepEqual(Object.keys(b.recentrageCommun), ['corners', 'tirs', 'cadres']);
  for (const s of ['corners', 'tirs', 'cadres']) {
    const j = b.jamaisVue[s];
    assert.deepEqual(j.fenetre, { de: '2023-07-01', a: '2024-06-30' });
    assert.ok(j.parChampionnatFaceAuCommun.lignes > 0 && j.communFaceAuxConstantes.lignes > 0, s);
    assert.ok(j.parChampionnatFaceAuCommun.lignes < b.variantes.find((v) => v.id === `${s}-championnat`).matchsJuges, s);
  }
  assert.ok(b.conventions.C.matchs > 0 && Number.isFinite(b.conventions.un.invKEquipe) && Number.isFinite(b.conventions.trois.invKTotal));
  const f = BANC.valeursFinales(d);
  assert.ok(f.cartons.complet && f.parChampionnat.tirs.commun && Object.keys(f.parChampionnat.tirs.championnats).length === 8);
  const note = BANC.aRecopier({ format: 1, premierRegard: '2026-11-02T20:00:00.000Z', banc: b, final: f, horizons: {} });
  assert.deepEqual(Object.keys(note.statuts), Object.keys(BANC.LIGNES_DU_BANC));
  assert.equal(BANC.statutDeLaLigne(note, 'enjeu'), 'non-mesurable');
  assert.ok(BANC.texteDeLaNote(note).startsWith('/**'));
  assert.ok(BANC.texteDeLaNote(note).includes(' * noteDesCartons.js — CE QUE DIT LE BANC'));
  for (const l of Object.keys(BANC.LIGNES_DU_BANC)) assert.equal(BANC.statutDeLaLigne(null, l), 'pas-encore-mesure', l);
});

test('T-B7 noteDesCartons.js est la note recopiée PAR SCRIPT, à l’octet, depuis la sortie du passage unique gardée dans test/fixtures ; les règles gardées sont celles scellées ; statuts et valeurs finales lus tels quels', async () => {
  const FIX = path.join(SERVEUR, 'test', 'fixtures');
  const brut = fs.readFileSync(path.join(FIX, 'banc-cartons-etape33.json'));
  const sortie = JSON.parse(brut.toString('utf8'));
  assert.equal(sha1(fs.readFileSync(path.join(FIX, 'banc-regles-etape33.md'))), 'cfd5ad07b0e6e45090a6698c11e10dacb7ff19ac', 'les règles scellées avant le regard');
  assert.equal(sortie.regles.sha1, 'cfd5ad07b0e6e45090a6698c11e10dacb7ff19ac');
  const attendu = BANC.texteDeLaNote(BANC.aRecopier(sortie, { sortie: { fichier: 'test/fixtures/banc-cartons-etape33.json', sha1: sha1(brut) } }));
  assert.equal(fs.readFileSync(path.join(SRC, 'data', 'cartons', 'noteDesCartons.js'), 'utf8'), attendu, 'la note à l’octet');
  const { CARTONS_AU_BANC: note } = await import('../src/data/cartons/noteDesCartons.js');
  assert.ok(Object.isFrozen(note) && Object.isFrozen(note.statuts));
  assert.deepEqual([note.K, note.z, note.convention.valeur, note.empreinteDuMoteur.sha1, note.empreinteDuMoteur.candidate], [8, 2.7344, 'C', '16f2459db183a99576365047da98b7777687ef05', 'f01dd8496f56a415']);
  assert.deepEqual(note.variantes.map((v) => v.id), [...BANC.VARIANTES_JUGEES]);
  for (const v of note.variantes) {
    const ligne = Object.entries(BANC.LIGNES_DU_BANC).find(([, id]) => id === v.id)[0];
    assert.equal(BANC.statutDeLaLigne(note, ligne), v.utile && !note.bancFaux[v.famille] ? 'effet-mesure' : 'explication-seulement', v.id);
    if (v.utile) assert.ok(v.horizon && v.horizon.jours >= 60, v.id);
  }
  assert.equal(BANC.statutDeLaLigne(note, 'enjeu'), 'non-mesurable');
  assert.deepEqual(note.final, sortie.final, 'les valeurs finales (A ∪ B) recopiées telles quelles');
});

// ======================================================================= T-B10 (le script)
fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-cartons-banc-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');

test('T-B10 le script : UN SEUL regard — K, règles vérifiées par sha1, verrou obligatoire, passe de Pierre attendue, verrou posé AVANT de lire (heure, pid, sha1), sortie jamais écrasée, second --banc refusé sans --rejouer-apres-correction (puis côte à côte) ; --comptes sans attendu ni perte ; --recopier écrit la note par script', () => {
  const copie = preparerCopie({ base: false });
  try {
    const cli = path.join(copie.serveur, 'scripts', 'cartons-corners.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'scripts', 'cartons-corners.mjs'), cli);
    // Un magasin fabriqué à cheval sur les deux plis du banc.
    const fab = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-cartons.mjs'), { args: ['fabriquer', JSON.stringify({ debut: '2025-03-01', jours: 200 })], timeout: 300_000 });
    assert.equal(fab.code, 0, fab.erreurs.slice(-3000));
    const d = (n) => path.join(copie.dossier, n);
    fs.writeFileSync(d('regles.md'), '# Règles du banc (essai)\nK = 8\n');
    fs.writeFileSync(d('passe-libre.json'), JSON.stringify({ running: null }));
    fs.writeFileSync(d('passe-occupee.json'), JSON.stringify({ running: { reason: 'au démarrage' } }));
    const sR = sha1(fs.readFileSync(d('regles.md')));
    const banc = (sortie, enPlus = [], { k = '8', regles = sR, passe = 'passe-libre.json', verrou = true } = {}) => executer(copie, cli, { args: ['--banc', '--regles', d('regles.md'), '--sha1-regles', regles, '--k', k, ...(verrou ? ['--verrou', d('banc.lock')] : []), '--passe', d(passe), '--attente-minutes', '0', '--sortie', d(sortie), ...enPlus], timeout: 300_000 });
    // Refus AVANT tout regard : K, règles changées, verrou absent, passe de Pierre en cours, sortie existante — aucun verrou posé.
    assert.match(banc('a.json', [], { k: '7' }).json.refus, /K doit valoir le nombre de variantes déclarées \(8/);
    assert.match(banc('a.json', [], { regles: '0'.repeat(40) }).json.refus, /les règles ont changé/);
    assert.match(banc('a.json', [], { verrou: false }).json.refus, /--verrou <fichier> est obligatoire/);
    assert.match(banc('a.json', [], { passe: 'passe-occupee.json' }).json.refus, /la passe de Pierre tourne/);
    fs.writeFileSync(d('existe.json'), '{}');
    assert.match(banc('existe.json').json.refus, /jamais écrasée/);
    assert.ok(!fs.existsSync(d('banc.lock')), 'aucun verrou posé par un refus');
    // Le passage.
    const premier = banc('premier.json');
    assert.equal(premier.code, 0, `${premier.erreurs.slice(-3000)}\n${premier.sortie.slice(-1500)}`);
    const verrou = JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8'));
    assert.match(verrou.pose, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Number.isInteger(verrou.pid) && verrou.pid > 0);
    assert.equal(verrou.regles.sha1, sR);
    const sortie = JSON.parse(fs.readFileSync(d('premier.json'), 'utf8'));
    assert.equal(sortie.premierRegard, verrou.pose);
    assert.equal(sortie.banc.K, 8);
    assert.equal(sortie.regles.sha1, sR);
    assert.equal(sortie.base.lectureSeule, true);
    assert.deepEqual([sortie.convention.valeur, sortie.convention.date, sortie.convention.expulsionApresDeuxJaunes], ['C', '2026-11-02', 2]);
    assert.equal(sortie.empreinteDuMoteur.sha1, '16f2459db183a99576365047da98b7777687ef05');
    assert.equal(sortie.empreinteDuMoteur.candidate, 'f01dd8496f56a415');
    assert.deepEqual(sortie.banc.variantes.map((x) => x.id), [...BANC.VARIANTES_JUGEES]);
    assert.ok(sortie.comptes.cartons.A + sortie.comptes.cartons.B > 0, JSON.stringify(sortie.comptes));
    // Un second passage : refusé ; puis rejoué avec une raison, les deux verdicts côte à côte.
    assert.match(banc('second.json').json.refus, /DÉJÀ été passé/);
    const rejeu = banc('rejeu.json', ['--rejouer-apres-correction', 'correction technique X']);
    assert.equal(rejeu.code, 0, rejeu.erreurs.slice(-3000));
    const s2 = JSON.parse(fs.readFileSync(d('rejeu.json'), 'utf8'));
    assert.equal(s2.rejeu.raison, 'correction technique X');
    assert.deepEqual(s2.rejeu.precedent.map((x) => x.id), sortie.banc.variantes.map((x) => x.id));
    assert.equal(JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8')).rejeux.length, 1);
    // La recopie, par script : la note et les deux pièces gardées.
    const rec = executer(copie, cli, { args: ['--recopier', d('premier.json')], timeout: 120_000 });
    assert.equal(rec.code, 0, rec.erreurs.slice(-3000));
    const note = path.join(copie.serveur, 'src', 'data', 'cartons', 'noteDesCartons.js');
    const fixture = path.join(copie.serveur, 'test', 'fixtures', 'banc-cartons-etape33.json');
    assert.equal(sha1(fs.readFileSync(fixture)), sha1(fs.readFileSync(d('premier.json'))));
    assert.equal(sha1(fs.readFileSync(path.join(copie.serveur, 'test', 'fixtures', 'banc-regles-etape33.md'))), sR);
    const attendu = BANC.texteDeLaNote(BANC.aRecopier(JSON.parse(fs.readFileSync(fixture, 'utf8')), { sortie: { fichier: 'test/fixtures/banc-cartons-etape33.json', sha1: sha1(fs.readFileSync(fixture)) } }));
    assert.equal(fs.readFileSync(note, 'utf8'), attendu);
    // Les comptes : aucun attendu, aucune perte ; la sortie n'est jamais écrasée.
    const c = executer(copie, cli, { args: ['--comptes', '--sortie', d('comptes.json'), '--passe', d('passe-libre.json')], timeout: 300_000 });
    assert.equal(c.code, 0, c.erreurs.slice(-3000));
    const comptes = JSON.parse(fs.readFileSync(d('comptes.json'), 'utf8'));
    assert.equal(comptes.aucunAttenduNiPerte, true);
    assert.equal(comptes.archiveDAvantMatch.rencontres, 0, 'l’archive d’avant-match de l’étape 32 est comptée (vide dans la copie)');
    assert.ok(comptes.comptes.plis.A.rencontres + comptes.comptes.plis.B.rencontres > 0);
    assert.doesNotMatch(JSON.stringify(comptes), /"(rho|pi|pris|provoques|perte|attendu)"/);
    assert.match(executer(copie, cli, { args: ['--comptes', '--sortie', d('comptes.json')], timeout: 120_000 }).json.refus, /jamais écrasée/);
  } finally {
    copie.nettoyer();
  }
});
