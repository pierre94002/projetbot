/**
 * LE CONTEXTE DU MATCH (étape 32, partie B, 29/10/2026) — le banc d'essai :
 *   node --test test/contexteBanc.test.mjs        (depuis server/)
 *
 * Données SIMULÉES ou magasin FABRIQUÉ seulement (aucun résultat réel : le banc n'a droit qu'à UN regard, fait une fois par
 * le script dans le bac) ; jamais la base du bac ni la vraie base (copies isolées, base neuve).
 * T-B1    le contraste « concerné / non concerné » sur une base recalée (niveaux fixés) : « −4 % » sur 20 % des camps vu à
 *         ≈ −3,2 % ; retrouvé à 2 écarts-types ; un effet nul reste petit ;
 * T-B2    le recalage sert (base qui surestime de 5 %) ;
 * T-B2bis le juge (perte du score exact) ne récompense pas l'artefact d'une base bruitée ; les 13 marchés, si ;
 * T-B3    le faux facteur : FNV-1a, 15 %, « pas prouvé » sur des données nulles, « retenu » sur un effet fort ; s'il est
 *         « retenu », le banc est faux et rien n'est utile ;
 * T-B4    K = le nombre de variantes déclarées (9) ; une variante non déclarée est refusée ; z = 2,773 ;
 * T-B5    les lignes : une par match concerné, { bloc, date, a, b }, plancher 1e-6, acceptées par le juge ;
 * T-B6    deux plis : chaque ligne jugée avec les coefficients appris sur l'AUTRE période ; rien hors des plis ; rien après
 *         le dernier jour lu ; la mise en route ni apprise ni jugée ;
 * T-B7    noteDuContexte.js est écrit PAR SCRIPT : refait à l'octet depuis la sortie gardée ; sans note, « pas encore
 *         mesuré » partout ;
 * T-B8    la pelouse : un club en désaccord (base, export, venues.json) est écarté, rien d'autre ne bouge ;
 * T-B9    l'ampleur : la plus grande des 13 moyennes, pas « plus de 2,5 » seul ;
 * T-B10   la météo des matchs passés n'est jamais lue par le banc ;
 * T-B11   la base = celle du banc de l'étape 27 ; une seule chaîne (le flux de la nuit, la fiche) ;
 * T-B12   les comptes ne lisent aucun résultat ;
 * T-B13   la frontière : hors de l'empreinte, purs, enfant en lecture seule ;
 * T-B14   le script : un seul regard (verrou, règles et pelouses par sha1, K, passe de Pierre), et la recopie.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import * as B from '../src/data/contexte/bancDuContexte.js';
import { VARIANTES_DE_L_ETAPE_32 } from '../src/bench/lancements.js';
import { zPour, comparer } from '../src/bench/guard.js';
import { grilleDesButs, marchesDeLaGrille, reglagesDuModeleDeButs, empreinteDesForces } from '../src/core/engine/goalModel.js';
import { CANDIDATE_EN_ESSAI, fichiersDuMoteur, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';
import { PERIODES_DU_BANC, JUGE_DU_BANC, AMPLEUR, PRIOR_SD } from '../src/data/contexte/reglagesContexte.js';

const SRC = path.join(SERVEUR, 'src');
const AIDE = path.join(SERVEUR, 'test', 'aides', 'script-contexte-banc.mjs');
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// ------------------------------------------------------------ des matchs simulés (aucun résultat réel)
function gen(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const poisson = (u, l) => {
  let k = 0;
  let p = Math.exp(-l);
  let s = p;
  const x = u();
  while (x > s && k < 40) {
    k++;
    p *= l / k;
    s += p;
  }
  return k;
};
const normale = (u) => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
const VIDE = () => ({ reposCourt: { dom: 0, ext: 0 }, serre: { dom: 0, ext: 0 }, lnKm: null, altitude: 0, synthetique: 0, nouveau: { dom: 0, ext: 0 }, placebo: { dom: 0, ext: 0 }, arbitre: null, zArbitre: null });
/** Un jour de chaque période des deux plis (alternés), ou de la mise en route. */
const JOURS = ['2024-01-15', '2025-10-15'];

/**
 * `n` matchs simulés : base λ, μ, buts tirés (ou leur espérance), un drapeau `cle` par camp (« camp ») ou par match
 * (« lieu ») avec la probabilité `part`, un effet planté (`effetSes`/`effetAdverse` pour un camp, `effetDom`/`effetExt`
 * pour un lieu), une base qui surestime (`biais`), un bruit de base (`sigma`, juste en moyenne).
 */
function simuler({ n, graine = 1, cle = 'reposCourt', sorte = 'camp', part = 0.2, effetSes = 0, effetAdverse = 0, effetDom = 0, effetExt = 0, biais = 0, sigma = 0, attendu = false, lambda = null, mu = null, jours = JOURS }) {
  const u = gen(graine);
  const out = [];
  for (let k = 0; k < n; k++) {
    const l0 = lambda ?? 0.9 + 1.1 * u();
    const m0 = mu ?? 0.7 + 0.9 * u();
    const x = VIDE();
    let ed = 0;
    let ee = 0;
    if (sorte === 'camp') {
      const cd = u() < part ? 1 : 0;
      const ce = u() < part ? 1 : 0;
      x[cle] = { dom: cd, ext: ce };
      ed = effetSes * cd + effetAdverse * ce;
      ee = effetSes * ce + effetAdverse * cd;
    } else {
      const c = u() < part ? 1 : 0;
      x[cle] = c;
      ed = effetDom * c;
      ee = effetExt * c;
    }
    const bd = sigma ? sigma * normale(u) - (sigma * sigma) / 2 : 0;
    const be = sigma ? sigma * normale(u) - (sigma * sigma) / 2 : 0;
    const vd = l0 * Math.exp(ed + bd);
    const ve = m0 * Math.exp(ee + be);
    out.push({ cle: `s${graine}-${k}`, date: jours[k % jours.length], base: { lambda: l0 * Math.exp(biais), mu: m0 * Math.exp(biais) }, buts: attendu ? { dom: vd, ext: ve } : { dom: poisson(u, vd), ext: poisson(u, ve) }, x });
  }
  return out;
}

// ======================================================================= T-B1
test('T-B1 le banc mesure le CONTRASTE « concerné / non concerné » sur une base recalée (niveaux fixés) : un « −4 % » planté sur 20 % des camps est vu à ≈ −3,2 %, jamais à −4 % ; retrouvé à 2 écarts-types sur 20 000 matchs tirés ; un effet nul reste sous 3 %', () => {
  const forme = B.FORMES['repos-court'];
  // Le calcul exact (les buts = leur espérance, 200 000 matchs) : le recalage absorbe la part moyenne de l'effet.
  const exact = simuler({ n: 200_000, part: 0.2, effetSes: -0.04, attendu: true });
  const rc = B.recalerLaBase(exact);
  const a = B.apprendre(forme, exact, { recalage: rc });
  const niveau = Math.log(0.8 + 0.2 * Math.exp(-0.04));
  assert.ok(a.converge && a.iterations <= B.NEWTON.iterations);
  assert.ok(Math.abs(rc.cDom - niveau) < 1e-3, `le niveau absorbe la part moyenne : ${rc.cDom} contre ${niveau}`);
  // ≈ −0,04 − niveau (≈ −3,2 %) ; le cas des deux camps concernés à la fois le tire un peu plus bas (régression jointe).
  assert.ok(Math.abs(a.coefficients.sesButs - (-0.04 - niveau)) < 3e-3, `vu à ${a.coefficients.sesButs}, attendu ≈ ${-0.04 - niveau}`);
  assert.ok(Math.abs(a.coefficients.sesButs - -0.04) > 0.006, 'jamais −4 % : le banc mesure le contraste');
  assert.ok(Math.abs(a.coefficients.butsAdverses - -niveau) < 3e-3, `adversaire : ${a.coefficients.butsAdverses}`);
  // Tiré (20 000 matchs) : à 2 écarts-types de la valeur exacte ; un effet nul reste petit.
  for (const graine of [11, 12, 13]) {
    const t = simuler({ n: 20_000, graine, part: 0.2, effetSes: -0.04 });
    const at = B.apprendre(forme, t, { recalage: B.recalerLaBase(t) });
    const info = t.reduce((s, m) => s + (m.x.reposCourt.dom ? m.base.lambda : 0) + (m.x.reposCourt.ext ? m.base.mu : 0), 0);
    const et = 1 / Math.sqrt(info);
    assert.ok(Math.abs(at.coefficients.sesButs - a.coefficients.sesButs) < 2 * et + 0.002, `graine ${graine} : ${at.coefficients.sesButs} (écart-type ${et})`);
    const nul = simuler({ n: 20_000, graine: 100 + graine, part: 0.2 });
    const an = B.apprendre(forme, nul, { recalage: B.recalerLaBase(nul) });
    assert.ok(Math.abs(an.coefficients.sesButs) < 0.03 && Math.abs(an.coefficients.butsAdverses) < 0.03, JSON.stringify(an.coefficients));
  }
});

// ======================================================================= T-B2
test('T-B2 le recalage sert : une base qui surestime les buts de 5 % partout et un facteur posé au hasard sur la moitié des matchs sortent « pas prouvé » avec le recalage, « retenu » sans lui', () => {
  const matchs = simuler({ n: 40_000, graine: 21, cle: 'altitude', sorte: 'lieu', part: 0.5, biais: 0.05 });
  const r = B.jugerLesVariantes(matchs, { variantes: ['deplacement-altitude'] });
  const v = r.variantes[0];
  assert.notEqual(v.verdict, 'retenu', JSON.stringify({ verdict: v.verdict, gain: v.gainRelatif, coefficients: v.coefficients.map((c) => c.coefficients) }));
  assert.ok(r.recalages.every((x) => Math.abs(x.cDom + 0.05) < 0.02 && Math.abs(x.cExt + 0.05) < 0.02), JSON.stringify(r.recalages));
  for (const c of v.coefficients) assert.ok(Math.abs(c.coefficients.domicile) < 0.03 && Math.abs(c.coefficients.visiteur) < 0.03, JSON.stringify(c.coefficients));
  // Sans recalage (la démonstration) : le facteur « corrige » la base sur son sous-ensemble et sort « retenu ».
  const plis = B.plisDuBanc(matchs).map((p) => ({ ...p, recalage: { cDom: 0, cExt: 0 } }));
  const sans = B.lignesDUneVariante({ forme: B.FORMES['deplacement-altitude'], plis });
  for (const c of sans.coefficients) assert.ok(c.coefficients.domicile < -0.03 && c.coefficients.visiteur < -0.03, JSON.stringify(c.coefficients));
  assert.equal(B.jugerDesLignes(sans.lignes, { K: 9 }).verdict, 'retenu');
});

// ======================================================================= T-B2bis
test('T-B2bis le juge ne récompense pas l’artefact d’une base bruitée : σ = 0,3 (juste en moyenne), une variante qui baisse le total de 2 % sur la moitié des matchs → jamais « retenu » en 50 graines avec la perte du score exact (gain moyen négatif) ; avec les 13 marchés, le gain moyen devient positif', () => {
  const graines = Array.from({ length: 50 }, (_, i) => 500 + i);
  const bilan = { score: { retenu: 0, pasProuve: 0, moinsBon: 0, z: 0 }, m13: { retenu: 0, z: 0 } };
  const moins2 = Math.exp(-0.02);
  for (const g of graines) {
    const ms = simuler({ n: 6000, graine: g, cle: 'altitude', sorte: 'lieu', part: 0.5, sigma: 0.3 });
    const mult = (m) => (m.x.altitude ? { dom: moins2, ext: moins2 } : null);
    const rc = { cDom: 0, cExt: 0 };
    const s = B.jugerDesMultiplicateurs({ matchs: ms, multiplicateurDe: mult, recalage: rc, K: 9 });
    if (s.verdict === 'retenu') bilan.score.retenu += 1;
    else if (s.verdict === 'moins-bon') bilan.score.moinsBon += 1;
    else bilan.score.pasProuve += 1;
    bilan.score.z += s.gain / s.ecartType / graines.length;
    const m = B.jugerDesMultiplicateurs({ matchs: ms, multiplicateurDe: mult, recalage: rc, K: 9, mesure: 'marches-13' });
    if (m.verdict === 'retenu') bilan.m13.retenu += 1;
    bilan.m13.z += m.gain / m.ecartType / graines.length;
  }
  assert.equal(bilan.score.retenu, 0, JSON.stringify(bilan));
  assert.ok(bilan.score.z < -0.3, `le juge du score exact voit le coût de la variante fausse : ${JSON.stringify(bilan)}`);
  assert.ok(bilan.score.pasProuve >= 40, JSON.stringify(bilan));
  assert.ok(bilan.m13.z > 0 && bilan.m13.z > bilan.score.z + 0.8, `les 13 marchés récompensent la baisse des buts : ${JSON.stringify(bilan)}`);
});

// ======================================================================= T-B3
test('T-B3 le faux facteur : FNV-1a de « clé:camp » mod 100 sous 15 (≈ 15 % des camps, toujours les mêmes) ; « pas prouvé » sur des données nulles ; « retenu » sur un effet fort planté ; s’il est « retenu », le banc est faux et AUCUN facteur n’est utile', () => {
  assert.equal(B.fnv1a(''), 0x811c9dc5);
  assert.equal(B.fnv1a('a'), 0xe40c292c);
  assert.equal(B.fnv1a('foobar'), 0xbf9cf968);
  let n = 0;
  for (let k = 0; k < 20_000; k++) n += B.placeboConcerne(`m-${k}`, k % 2) ? 1 : 0;
  assert.ok(n / 20_000 > 0.14 && n / 20_000 < 0.16, String(n));
  for (let k = 0; k < 400; k++) {
    for (const camp of [0, 1]) assert.equal(B.placeboConcerne(`2025-09-01-club-${k}`, camp), B.fnv1a(`2025-09-01-club-${k}:${camp}`) % 100 < 15, 'toujours les mêmes camps (aucun hasard)');
  }
  // Des données nulles : les drapeaux du faux facteur viennent des clés.
  const nul = simuler({ n: 30_000, graine: 31, cle: 'placebo', part: 0 }).map((m) => ({ ...m, x: { ...m.x, placebo: { dom: B.placeboConcerne(m.cle, 1) ? 1 : 0, ext: B.placeboConcerne(m.cle, 0) ? 1 : 0 } } }));
  const r = B.jugerLesVariantes(nul, { variantes: ['placebo'] });
  assert.notEqual(r.variantes[0].verdict, 'retenu');
  assert.equal(r.bancFaux, false);
  // Un effet fort planté sur les camps « concernés » : retenu ; le banc est alors déclaré faux, et une autre variante
  // pourtant « retenue » n'est pas utile.
  const u = gen(32);
  const fort = nul.map((m) => {
    const ed = m.x.placebo.dom ? -0.4 : 0;
    const ee = m.x.placebo.ext ? -0.4 : 0;
    const alt = u() < 0.5 ? 1 : 0;
    const vd = m.base.lambda * Math.exp(ed + 0.3 * alt);
    const ve = m.base.mu * Math.exp(ee);
    return { ...m, x: { ...m.x, altitude: alt }, buts: { dom: poisson(u, vd), ext: poisson(u, ve) } };
  });
  const f = B.jugerLesVariantes(fort, { variantes: ['deplacement-altitude', 'placebo'] });
  assert.equal(f.variantes.find((v) => v.id === 'placebo').verdict, 'retenu');
  assert.equal(f.variantes.find((v) => v.id === 'deplacement-altitude').verdict, 'retenu');
  assert.equal(f.bancFaux, true);
  assert.deepEqual(f.utiles, []);
  assert.ok(f.variantes.every((v) => v.utile === false));
  assert.ok(f.variantes.find((v) => v.id === 'deplacement-altitude').raisons.some((x) => /faux facteur/.test(x)));
});

// ======================================================================= T-B4
test('T-B4 K = le nombre de variantes DÉCLARÉES (9, la fiche retenue et le faux facteur compris) ; z = Φ⁻¹(1 − 0,05/18) ≈ 2,773 ; une variante non déclarée est refusée ; un autre K est refusé', () => {
  assert.equal(VARIANTES_DE_L_ETAPE_32.length, 9);
  assert.deepEqual([...B.VARIANTES_JUGEES], VARIANTES_DE_L_ETAPE_32.map((v) => v.id).filter((id) => id !== 'contexte-v1'));
  for (const id of B.VARIANTES_JUGEES) assert.ok(B.FORMES[id], id);
  assert.deepEqual(Object.keys(B.FORMES).sort(), [...B.VARIANTES_JUGEES].sort());
  const ms = simuler({ n: 2000, graine: 41, part: 0.3 });
  const r = B.jugerLesVariantes(ms);
  assert.equal(r.K, 9);
  assert.equal(r.z, zPour(0.05, 9));
  assert.ok(r.z > 2.772 && r.z < 2.774, String(r.z));
  assert.deepEqual(r.variantes.map((v) => v.id), [...B.VARIANTES_JUGEES]);
  for (const v of r.variantes) if (v.lignes) assert.equal(v.variantes, 9, v.id);
  assert.throws(() => B.jugerLesVariantes(ms, { K: 8 }), /K \(8\) doit valoir le nombre de variantes déclarées \(9/);
  assert.throws(() => B.jugerLesVariantes(ms, { variantes: ['repos-ecart'] }), /n'est pas déclarée/);
  // Une variante qui a une forme mais n'est pas déclarée (une déclaration sans le faux facteur) : refusée.
  const sansPlacebo = VARIANTES_DE_L_ETAPE_32.filter((v) => v.id !== 'placebo');
  assert.throws(() => B.jugerLesVariantes(ms, { declarees: sansPlacebo, K: sansPlacebo.length, variantes: ['placebo'] }), /« placebo » n'est pas déclarée/);
});

// ======================================================================= T-B5
test('T-B5 les lignes du juge : UNE par match concerné (jamais les autres), { bloc, date, a, b } (et le pli), perte log du score exact sur la grille 0-20 avec le plancher 1e-6, acceptées par le juge de l’étape 16 ; les 13 marchés ne sont jamais jugés', () => {
  const ms = simuler({ n: 400, graine: 51, cle: 'nouveau', part: 0.25 });
  ms.push({ cle: 'hors-grille', date: JOURS[0], base: { lambda: 1.4, mu: 1.1 }, buts: { dom: 21, ext: 0 }, x: { ...VIDE(), nouveau: { dom: 1, ext: 0 } } });
  const rc = { cDom: 0.01, cExt: -0.02 };
  const forme = B.FORMES['entraineur-nouveau'];
  const l = B.lignesDuJuge({ matchs: ms, multiplicateurDe: (m) => B.multiplicateurs(forme, m.x, [0.05, -0.03]), recalage: rc });
  const concernes = ms.filter((m) => m.x.nouveau.dom || m.x.nouveau.ext);
  assert.equal(l.lignes.length, concernes.length);
  assert.equal(l.concernes, concernes.length);
  assert.deepEqual(new Set(l.lignes.map((x) => x.bloc)).size, l.lignes.length, 'une ligne par match');
  for (const x of l.lignes) {
    assert.deepEqual(Object.keys(x).sort(), ['a', 'b', 'bloc', 'date']);
    assert.ok(Number.isFinite(x.a) && Number.isFinite(x.b) && x.a > 0 && x.b > 0);
  }
  const m0 = concernes[0];
  const g = grilleDesButs(m0.base.lambda * Math.exp(rc.cDom), m0.base.mu * Math.exp(rc.cExt), -0.05);
  assert.equal(l.lignes[0].a, -Math.log(Math.max(g[m0.buts.dom * 21 + m0.buts.ext], 1e-6)));
  const hors = l.lignes.find((x) => x.bloc === 'hors-grille');
  assert.equal(hors.a, -Math.log(1e-6));
  assert.equal(hors.b, -Math.log(1e-6));
  assert.doesNotThrow(() => comparer(l.lignes, { mode: 'moyenne', sens: 'min', variantes: 9, tirages: 1000, graine: 32, minBlocs: 2 }));
  assert.equal(B.MESURE_DU_JUGE, 'perte-log-score-exact');
  assert.equal(JUGE_DU_BANC.mesure, B.MESURE_DU_JUGE);
  assert.deepEqual([JUGE_DU_BANC.tirages, JUGE_DU_BANC.graine, JUGE_DU_BANC.minBlocs, JUGE_DU_BANC.plancher], [1000, 32, 200, 1e-6]);
  // Le banc entier : les lignes jugées sont celles du score exact (une par match), les 13 marchés restent des témoins.
  const r = B.jugerLesVariantes(simuler({ n: 1200, graine: 52, cle: 'nouveau', part: 0.3 }), { variantes: ['entraineur-nouveau'] });
  const v = r.variantes[0];
  assert.equal(v.lignes, v.matchsConcernes);
  assert.equal(r.mesure, 'perte-log-score-exact');
  assert.equal(v.temoins.juge, false);
  assert.equal(v.temoins.marches, 13);
});

// ======================================================================= T-B6
test('T-B6 deux plis : chaque ligne est jugée avec des coefficients appris sur l’AUTRE période (2023-07 → 2025-06 contre 2025-07 → 2026-09-23) ; aucune ligne hors des plis ; la mise en route ni apprise ni jugée ; rien après le 23/09/2026 n’est lu', () => {
  assert.deepEqual(PERIODES_DU_BANC.plis.map((p) => [p.apprendre.de, p.apprendre.a, p.juger.de, p.juger.a]), [['2023-07-01', '2025-06-30', '2025-07-01', '2026-09-23'], ['2025-07-01', '2026-09-23', '2023-07-01', '2025-06-30']]);
  // Un effet opposé dans chaque période : +30 % sur l'une, −30 % sur l'autre ; et des matchs de la mise en route.
  const a = simuler({ n: 6000, graine: 61, cle: 'altitude', sorte: 'lieu', part: 0.4, effetDom: 0.3, jours: ['2024-03-01'] });
  const b = simuler({ n: 6000, graine: 62, cle: 'altitude', sorte: 'lieu', part: 0.4, effetDom: -0.3, jours: ['2026-03-01'] });
  const mer = simuler({ n: 3000, graine: 63, cle: 'altitude', sorte: 'lieu', part: 0.4, effetDom: 2, jours: ['2023-03-01'] });
  const ms = [...mer, ...a, ...b];
  const plis = B.plisDuBanc(ms);
  assert.deepEqual(plis.map((p) => [p.apprendre.length, p.juger.length]), [[6000, 6000], [6000, 6000]], 'la mise en route n’entre dans aucun pli');
  const forme = B.FORMES['deplacement-altitude'];
  const v = B.lignesDUneVariante({ forme, plis });
  // (le contraste : le niveau du pli absorbe la part moyenne de l'effet)
  assert.ok(v.coefficients[0].coefficients.domicile > 0.1, 'le pli 0 apprend sur 2023-07 → 2025-06 (+30 %)');
  assert.ok(v.coefficients[1].coefficients.domicile < -0.1, 'le pli 1 apprend sur 2025-07 → 2026-09-23 (−30 %)');
  const parCle = new Map(ms.map((m) => [m.cle, m]));
  for (const l of v.lignes) {
    const m = parCle.get(l.bloc);
    const p = PERIODES_DU_BANC.plis[l.pli];
    assert.ok(l.date >= p.juger.de && l.date <= p.juger.a, `${l.bloc} jugé hors de son pli`);
    assert.ok(!(l.date >= p.apprendre.de && l.date <= p.apprendre.a), 'jamais jugé sur la période où il a appris');
    const rc = plis[l.pli].recalage;
    const mult = B.multiplicateurs(forme, m.x, v.coefficients[l.pli].vecteur);
    const g = grilleDesButs(Math.min(6, Math.max(0.2, m.base.lambda * Math.exp(rc.cDom) * mult.dom)), Math.min(6, Math.max(0.2, m.base.mu * Math.exp(rc.cExt) * mult.ext)), -0.05);
    assert.equal(l.b, -Math.log(Math.max(g[m.buts.dom * 21 + m.buts.ext], 1e-6)), 'b = la perte avec les coefficients appris sur l’autre période');
  }
  assert.ok(v.lignes.every((l) => l.date !== '2023-03-01'), 'la mise en route n’est jamais jugée');
  // Les deux plis sont réunis dans UN juge : le jugement porte sur toutes les lignes.
  const r = B.jugerLesVariantes(ms, { variantes: ['deplacement-altitude'] });
  assert.equal(r.variantes[0].lignes, v.lignes.length);
  assert.equal(r.variantes[0].verdict, 'moins-bon', 'deux effets opposés : appris sur l’un, jugé sur l’autre, il fait moins bien');
  // Rien après le dernier jour lu : une rencontre du 24/09/2026 fait lever.
  assert.throws(() => B.jugerLesVariantes([...ms, { ...a[0], cle: 'p5', date: '2026-09-24' }], { variantes: ['deplacement-altitude'] }), /après le dernier jour lu \(2026-09-23\)/);
  // Le passage entier sur un magasin fabriqué (périodes d'essai) : la lecture s'arrête au dernier jour lu.
  const copie = preparerCopie({ base: false });
  try {
    const x = executer(copie, AIDE, { args: ['banc', '{}'], timeout: 300_000 });
    assert.equal(x.code, 0, `${x.erreurs.slice(-3000)}\n${x.sortie.slice(-1500)}`);
    const s = x.json;
    assert.ok(s.apresLeDernierJour > 0, 'le magasin a des matchs après le dernier jour lu');
    assert.ok(s.comptes.dernierJourLu <= '2026-09-20', s.comptes.dernierJourLu);
    assert.equal(s.comptes.rencontresLues, s.matchsFabriques - s.apresLeDernierJour);
    assert.equal(s.K, 9);
    for (const v2 of s.variantes) {
      assert.deepEqual(v2.coefficients.map((c) => [c.apprisSur.de, c.jugeSur.de]), [['2026-08-11', '2026-09-03'], ['2026-09-03', '2026-08-11']], v2.id);
    }
  } finally {
    copie.nettoyer();
  }
});

// ======================================================================= T-B7
const NOTE = path.join(SRC, 'data', 'contexte', 'noteDuContexte.js');
const FIXTURE = path.join(SERVEUR, 'test', 'fixtures', 'banc-contexte-etape32.json');
const REGLES = path.join(SERVEUR, 'test', 'fixtures', 'banc-regles-etape32.md');
test('T-B7 noteDuContexte.js est écrit PAR SCRIPT : refait à l’octet depuis la sortie du passage gardée dans test/fixtures (et ses règles, par sha1) ; sans note, chaque facteur est « pas encore mesuré »', () => {
  for (const f of Object.keys(B.FACTEURS_DU_BANC)) assert.equal(B.statutDuFacteur(null, f), 'pas-encore-mesure', f);
  assert.equal(B.texteDeLaNote(null).includes('export const CONTEXTE_AU_BANC = null;'), true);
  assert.throws(() => B.statutDuFacteur(null, 'inconnu'));
  if (!fs.existsSync(NOTE)) {
    assert.ok(!fs.existsSync(FIXTURE), 'une sortie gardée sans note recopiée');
    return;
  }
  assert.ok(fs.existsSync(FIXTURE), 'la note existe : la sortie du passage doit être gardée dans test/fixtures');
  assert.ok(fs.existsSync(REGLES), 'la note existe : les règles du passage doivent être gardées dans test/fixtures');
  const json = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const note = B.aRecopier(json, { sortie: { fichier: 'test/fixtures/banc-contexte-etape32.json', sha1: sha1(fs.readFileSync(FIXTURE)) } });
  assert.equal(fs.readFileSync(NOTE, 'utf8'), B.texteDeLaNote(note), 'noteDuContexte.js = texteDeLaNote(aRecopier(sortie)), à l’octet');
  assert.equal(sha1(fs.readFileSync(REGLES)), json.regles.sha1, 'les règles gardées sont celles écrites avant le regard');
  assert.equal(note.regles.sha1, json.regles.sha1);
  assert.equal(note.K, 9);
  assert.equal(note.mesure, 'perte-log-score-exact');
  assert.doesNotMatch(JSON.stringify(note), /scratchpad|AppData|OneDrive/i, 'aucun chemin temporaire dans la note');
  for (const [f, id] of Object.entries(B.FACTEURS_DU_BANC)) {
    const st = B.statutDuFacteur(note, f);
    if (id === null) assert.equal(st, 'non-mesurable', f);
    else assert.equal(st, json.banc.variantes.find((v) => v.id === id).utile && !json.banc.bancFaux ? 'effet-mesure' : 'explication-seulement', f);
  }
});

// ======================================================================= T-B8
test('T-B8 la pelouse : un club qui reçoit vu sur deux pelouses (la base, l’export gelé du 22/09, venues.json) est ÉCARTÉ — sa pelouse vaut null au banc — et rien d’autre ne bouge ; un club d’accord partout est gardé', () => {
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, AIDE, { args: ['pelouse', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    const s = r.json;
    assert.deepEqual(s.clubsEcartes.map((c) => c.club), [s.synthetique]);
    assert.deepEqual(s.clubsEcartes[0].export, ['naturelle']);
    assert.equal(s.rattachement.rattachees, s.attenduesRattachees, 'l’export rattaché au club qui reçoit par la clé de la rencontre');
    assert.ok(s.rattachement.absentesDuMagasin >= 1, 'une clé inconnue du magasin est comptée, jamais rapprochée');
    assert.ok(s.syntheticGarde.length > 0 && s.syntheticGarde.every((x) => x === 1), 'sans désaccord : synthétique');
    assert.ok(s.syntheticEcarte.length > 0 && s.syntheticEcarte.every((x) => x === null), 'en désaccord : écarté (null)');
    assert.ok(s.ordinaireEcarte.every((x) => x === 0), 'le club d’accord partout reste « naturelle »');
    assert.equal(s.autresIdentiques, true);
  } finally {
    copie.nettoyer();
  }
  // La forme : une pelouse null n'est jamais « concernée ».
  assert.equal(B.lignesDeLaForme(B.FORMES['pelouse-synthetique'], { ...VIDE(), synthetique: null }), null);
  assert.ok(B.lignesDeLaForme(B.FORMES['pelouse-synthetique'], { ...VIDE(), synthetique: 1 }));
  const f = { repos: { home: { classe: 'normal' }, away: { classe: 'normal' } }, enchainement: { home: { serre: false }, away: { serre: null } }, deplacement: { lnKm: 1 }, altitude: { concerne: false }, pelouse: { surface: 'synthetique' }, entraineur: { home: { nouveau: false }, away: { nouveau: false } }, arbitre: null };
  assert.equal(B.caracteristiquesDeLaFiche(f, { matchKey: 'k', pelouseEcartee: true }).synthetique, null);
  assert.equal(B.caracteristiquesDeLaFiche(f, { matchKey: 'k', pelouseEcartee: false }).synthetique, 1);
  assert.equal(B.caracteristiquesDeLaFiche({ ...f, pelouse: { surface: 'hybride' } }, { matchKey: 'k' }).synthetique, 0, 'hybride = naturelle');
});

// ======================================================================= T-B9
test('T-B9 l’ampleur d’une variante : la PLUS GRANDE des moyennes absolues de changement des 13 marchés témoins (sans résultat), pas « plus de 2,5 » seul — un effet d’équilibre qui bouge peu le total reste ample', () => {
  // Domicile × 1,10, visiteur × 0,874 sur 30 % des matchs (λ 1,45, μ 1,15) : le total ne bouge presque pas.
  const ms = simuler({ n: 60_000, graine: 91, cle: 'altitude', sorte: 'lieu', part: 0.3, effetDom: Math.log(1.1), effetExt: Math.log(0.874), lambda: 1.45, mu: 1.15 });
  const r = B.jugerLesVariantes(ms, { variantes: ['deplacement-altitude'] });
  const a = r.variantes[0].ampleur;
  const valeurs = Object.values(a.parMarche);
  assert.equal(valeurs.length, 13);
  assert.equal(a.max, Math.max(...valeurs));
  assert.notEqual(a.marche, 'plus25');
  assert.ok(a.max > 2 * a.parMarche.plus25, `plus de 2,5 bouge peu face aux marchés d'équipe : ${a.parMarche.plus25} contre ${a.max}`);
  assert.ok(a.max >= AMPLEUR.seuil, `un marché d'équipe bouge d'au moins 0,5 point : ${a.max} (${a.marche})`);
  assert.deepEqual([AMPLEUR.seuil, AMPLEUR.sur], [0.005, 'plus-grand-des-13-marches']);
  assert.ok(!r.variantes[0].raisons.includes('ampleur sous 0,5 point'));
  // Les 13 probabilités témoins sont EXACTEMENT celles de marchesDeLaGrille.
  const u = gen(92);
  for (let k = 0; k < 2000; k++) {
    const g = grilleDesButs(0.2 + 5.8 * u(), 0.2 + 5.8 * u(), -0.05);
    const m = marchesDeLaGrille(g);
    assert.deepEqual(B.probabilitesTemoins(g), [m.over05, m.over15, m.over25, m.over35, m.bothTeamsScore, m.homeTeamGoals.over05, m.homeTeamGoals.over15, m.homeTeamGoals.over25, m.homeTeamGoals.over35, m.awayTeamGoals.over05, m.awayTeamGoals.over15, m.awayTeamGoals.over25, m.awayTeamGoals.over35]);
  }
});

// ======================================================================= T-B10
const ENFANT = path.join(SRC, 'data', 'contexte', 'contexteBancEnfant.js');
const METEO = path.join(SRC, 'data', 'db', 'diagnosticMeteoEnfant.js');
test('T-B10 la météo des matchs passés n’est JAMAIS lue par le banc ni par les comptes (ni les moyennes d’arbitre de FotMob) : une météo absurde plantée (99 °C, ouragan) ne change pas un octet du banc', async () => {
  const E = await import('../src/data/contexte/contexteBancEnfant.js');
  for (const [nom, sql] of [['SQL_DU_BANC', E.SQL_DU_BANC], ['SQL_DES_COMPTES', E.SQL_DES_COMPTES]]) {
    assert.doesNotMatch(sql, /temperature|windSpeed|weather|precipitation|humidity/i, `${nom} lit la météo`);
    assert.doesNotMatch(sql, /yellowCardsPerMatch|foulsPerMatch|redCards|referee\.matches|referee\.penalties/i, `${nom} lit les moyennes d'arbitre de FotMob`);
  }
  // La météo ne se lit qu'au diagnostic, HORS de data/contexte/ (où elle n'est que comparée à la prévision) : jamais dans
  // l'enfant du banc ; aucun fichier du contexte n'importe le diagnostic.
  assert.equal((sansCommentaires(ENFANT).match(/\$\.temperature/g) ?? []).length, 0, 'l’enfant du banc ne lit jamais la température');
  assert.equal((sansCommentaires(METEO).match(/\$\.temperature/g) ?? []).length, 1, 'une seule lecture de la température : le diagnostic');
  for (const g of fs.readdirSync(path.join(SRC, 'data', 'contexte'))) assert.doesNotMatch(sansCommentaires(path.join(SRC, 'data', 'contexte', g)), /diagnosticMeteo/, `${g} importe le diagnostic de la météo`);
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, AIDE, { args: ['meteo', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.ok(r.json.meteoPlantee > 0);
    assert.equal(r.json.memePasse, true, 'les rencontres du banc, à l’octet');
    assert.equal(r.json.memeBanc, true, 'le banc entier, à l’octet');
  } finally {
    copie.nettoyer();
  }
});

// ======================================================================= T-B11
test('T-B11 la base du banc : les réglages de la candidate de l’étape 27 (recopiés et figés), la base au jour J = celle du banc de l’étape 27 (ForcesCourantes, modeleDeButs sans cote) à l’octet ; une seule chaîne : les rencontres du flux de la nuit, la même fiche avec ou sans les résultats', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(B.BASE_STATISTIQUE)), JSON.parse(JSON.stringify(CANDIDATE_EN_ESSAI.modifications.football.modeleDeButs)));
  assert.doesNotThrow(() => reglagesDuModeleDeButs({ modeleDeButs: B.BASE_STATISTIQUE }));
  assert.equal(empreinteDesForces(B.BASE_STATISTIQUE), B.EMPREINTE_DE_LA_BASE);
  assert.equal(B.RHO_DU_BANC, -0.05);
  assert.ok(Object.isFrozen(B.BASE_STATISTIQUE) && Object.isFrozen(B.BASE_STATISTIQUE.demiVies));
  assert.equal(PRIOR_SD, 0.1);
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, AIDE, { args: ['passe', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    const s = r.json;
    assert.ok(s.base.comparees > 40);
    assert.equal(s.base.ecartMax, 0, 'la base du banc = celle du banc de l’étape 27, à l’octet');
    assert.equal(s.memeFlux, true, 'les rencontres = celles du flux de la nuit (rencontresChronologiques)');
    assert.equal(s.memesCaracteristiques, true, 'les mêmes caractéristiques avec et sans les résultats');
    assert.equal(s.avec.dernier <= '2026-09-20', true);
    assert.deepEqual([s.sans.avecBase, s.sans.avecButs, s.sans.cartons, s.sans.penalties], [0, 0, 0, 0], 'sans résultat : ni base, ni buts, ni cartons, ni penalties');
  } finally {
    copie.nettoyer();
  }
});

// ======================================================================= T-B12
test('T-B12 les comptes ne lisent AUCUN résultat : leur lecture ne prend ni score, ni but, ni carton, ni déroulé (seule la présence d’un score à la 90e) ; des scores, cartons et déroulés changés ne changent pas un octet des comptes', async () => {
  const E = await import('../src/data/contexte/contexteBancEnfant.js');
  const sql = E.SQL_DES_COMPTES;
  assert.doesNotMatch(sql, /home_goals|away_goals|events|lineups|shotmap|jaunes|rouges|fautes|xg_|t\.bp\b|t\.bc\b|l_bd|l_be/, 'les comptes lisent un résultat');
  assert.match(sql, /CASE WHEN t\.bp90 IS NOT NULL AND t\.bc90 IS NOT NULL THEN 1 ELSE 0 END AS a_score90/);
  const copie = preparerCopie({ base: false });
  try {
    const r = executer(copie, AIDE, { args: ['resultats', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.json.memesComptes, true);
    assert.equal(r.json.comptes.aucunResultatLu, true);
    assert.ok(r.json.comptes.parFenetre.periodeA.jugeables > 0);
  } finally {
    copie.nettoyer();
  }
});

// ======================================================================= T-B13
test('T-B13 la frontière : le banc est hors de l’empreinte du moteur et le moteur ne l’atteint pas ; bancDuContexte.js est pur ; l’enfant du banc ouvre la base EN LECTURE SEULE, n’écrit rien et ne lit pas l’horloge ; le script garde le bac', () => {
  const neufs = ['data/contexte/bancDuContexte.js', 'data/contexte/contexteBancEnfant.js', 'data/db/diagnosticMeteoEnfant.js', ...(fs.existsSync(NOTE) ? ['data/contexte/noteDuContexte.js'] : [])];
  const empreinte = fichiersDuMoteur();
  for (const f of neufs) assert.ok(!empreinte.includes(f), `${f} dans l’empreinte`);
  assert.ok(!MODULES_DU_MOTEUR.fichiers.some((f) => /contexte/i.test(f)));
  // Aucun fichier du moteur n'importe le banc (même de loin) : le graphe des imports relatifs.
  const vus = new Set();
  const pile = empreinte.map((rel) => path.join(SRC, rel));
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) pile.push(path.resolve(path.dirname(f), m[1]));
  }
  const graphe = [...vus].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  for (const f of neufs) assert.ok(!graphe.includes(f), `${f} atteint depuis le moteur`);
  const pur = sansCommentaires(path.join(SRC, 'data', 'contexte', 'bancDuContexte.js'));
  assert.doesNotMatch(pur, /Date\.now\(|new Date\(\)|Math\.random|performance\.now|openDb|DatabaseSync|fetch\(|node:fs|from 'fs'|readFileSync|writeFileSync|child_process/, 'bancDuContexte.js : pur');
  const enfant = sansCommentaires(ENFANT);
  assert.match(enfant, /openDb\(\{ file: m\.chemin, readonly: true \}\)/);
  assert.doesNotMatch(enfant, /Date\.now\(|new Date\(\)|Math\.random|fetch\(|node:fs|writeFileSync|writeJsonAtomic/);
  assert.doesNotMatch(enfant, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|\.exec\(/, 'l’enfant du banc : aucune écriture');
  const meteo = sansCommentaires(METEO);
  assert.match(meteo, /openDb\(\{ file: m\.chemin, readonly: true \}\)/);
  assert.doesNotMatch(meteo, /Date\.now\(|new Date\(\)|Math\.random|fetch\(|node:fs|writeFileSync|writeJsonAtomic|\.run\(|INSERT\s|UPDATE\s|DELETE\s|\.exec\(/, 'le diagnostic : lecture seule, sans horloge');
  assert.doesNotMatch(meteo, /home_goals|away_goals|events|lineups|team_day/, 'le diagnostic ne lit aucun résultat');
  const script = sansCommentaires(path.join(SERVEUR, 'scripts', 'match-context.mjs'));
  assert.match(script, /fork\(fichier, \[argument\]/);
  assert.match(script, /argument = '--enfant-contexte-banc'/);
  assert.match(script, /\{ fichier: ENFANT_METEO, argument: '--enfant-diagnostic-meteo' \}/);
  assert.match(script, /refuser\("c'est la vraie base\."\)/);
  assert.match(script, /if \(sousOneDrive\(SERVEUR\)\)/);
  assert.match(script, /if \(K !== VARIANTES_DE_L_ETAPE_32\.length\)/);
  assert.doesNotMatch(script, /openDb\(|DatabaseSync/, 'le script n’ouvre jamais la base : le processus à part, en lecture seule');
  assert.doesNotMatch(script, /writeFileSync\(NOTE, [^)]*CONTEXTE_AU_BANC/, 'la note vient de texteDeLaNote, jamais d’un texte à part');
});

// ======================================================================= T-B14
fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-contexte-banc-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

test('T-B14 le script : UN SEUL regard — K, règles et pelouses vérifiés par sha1, passe de Pierre attendue, verrou posé AVANT de lire (heure, pid, sha1), second --banc refusé sans --rejouer-apres-correction (puis les deux verdicts côte à côte), sortie jamais sous OneDrive ni écrasée ; --comptes et --diagnostic-meteo sans résultat ; --recopier écrit la note par script', () => {
  const copie = preparerCopie({ base: false });
  try {
    const cli = path.join(copie.serveur, 'scripts', 'match-context.mjs');
    fs.mkdirSync(path.dirname(cli), { recursive: true });
    fs.copyFileSync(path.join(SERVEUR, 'scripts', 'match-context.mjs'), cli);
    // Un magasin fabriqué à cheval sur les deux périodes du banc (juin et juillet 2025).
    const fab = executer(copie, AIDE, { args: ['fabriquer', JSON.stringify({ debut: '2025-06-01', jours: 60 })], timeout: 300_000 });
    assert.equal(fab.code, 0, fab.erreurs.slice(-3000));
    const d = (n) => path.join(copie.dossier, n);
    fs.writeFileSync(d('regles.md'), '# Règles du banc (essai)\nK = 9\n');
    fs.writeFileSync(d('pelouses.json'), JSON.stringify({ format: 1, clubs: [] }));
    fs.writeFileSync(d('passe-libre.json'), JSON.stringify({ running: null }));
    fs.writeFileSync(d('passe-occupee.json'), JSON.stringify({ running: { reason: 'au démarrage' } }));
    const sR = sha1(fs.readFileSync(d('regles.md')));
    const sP = sha1(fs.readFileSync(d('pelouses.json')));
    const banc = (sortie, enPlus = [], { k = '9', regles = sR, passe = 'passe-libre.json' } = {}) => executer(copie, cli, { args: ['--banc', '--regles', d('regles.md'), '--sha1-regles', regles, '--pelouses', d('pelouses.json'), '--sha1-pelouses', sP, '--k', k, '--verrou', d('banc.lock'), '--passe', d(passe), '--attente-minutes', '0', '--sortie', d(sortie), ...enPlus], timeout: 300_000 });
    // Refus AVANT tout regard : K, règles changées, passe de Pierre en cours — aucun verrou posé.
    assert.match(banc('a.json', [], { k: '8' }).json.refus, /K doit valoir le nombre de variantes déclarées \(9/);
    assert.match(banc('a.json', [], { regles: '0'.repeat(40) }).json.refus, /les règles ont changé/);
    assert.match(banc('a.json', [], { passe: 'passe-occupee.json' }).json.refus, /la passe de Pierre tourne/);
    assert.ok(!fs.existsSync(d('banc.lock')), 'aucun verrou posé par un refus');
    const sousOneDrive = executer(copie, cli, { args: ['--banc', '--sortie', path.join(copie.dossier, 'OneDrive', 'x.json')], timeout: 120_000 });
    assert.match(sousOneDrive.json.refus, /sous OneDrive est refusée/);
    // Le passage.
    const premier = banc('premier.json');
    assert.equal(premier.code, 0, `${premier.erreurs.slice(-3000)}\n${premier.sortie.slice(-1500)}`);
    const verrou = JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8'));
    assert.match(verrou.pose, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(Number.isInteger(verrou.pid) && verrou.pid > 0);
    assert.equal(verrou.regles.sha1, sR);
    const sortie = JSON.parse(fs.readFileSync(d('premier.json'), 'utf8'));
    assert.equal(sortie.premierRegard, verrou.pose);
    assert.equal(sortie.banc.K, 9);
    assert.equal(sortie.regles.sha1, sR);
    assert.equal(sortie.base.lectureSeule, true);
    assert.equal(sortie.empreinteDuMoteur.sha1, '16f2459db183a99576365047da98b7777687ef05');
    assert.ok(sortie.comptes.dernierJourLu <= '2026-09-23');
    // Un second passage : refusé ; puis rejoué avec une raison, les deux verdicts côte à côte.
    assert.match(banc('second.json').json.refus, /DÉJÀ été passé/);
    assert.match(banc('premier.json', ['--rejouer-apres-correction', 'essai']).json.refus, /jamais écrasée/);
    const rejeu = banc('rejeu.json', ['--rejouer-apres-correction', 'correction de la définition X']);
    assert.equal(rejeu.code, 0, rejeu.erreurs.slice(-3000));
    const s2 = JSON.parse(fs.readFileSync(d('rejeu.json'), 'utf8'));
    assert.equal(s2.rejeu.raison, 'correction de la définition X');
    assert.deepEqual(s2.rejeu.precedent.map((v) => v.id), sortie.banc.variantes.map((v) => v.id));
    assert.equal(JSON.parse(fs.readFileSync(d('banc.lock'), 'utf8')).rejeux.length, 1);
    // La recopie, par script : la note et les deux pièces gardées.
    const rec = executer(copie, cli, { args: ['--recopier', d('premier.json')], timeout: 120_000 });
    assert.equal(rec.code, 0, rec.erreurs.slice(-3000));
    const note = path.join(copie.serveur, 'src', 'data', 'contexte', 'noteDuContexte.js');
    const fixture = path.join(copie.serveur, 'test', 'fixtures', 'banc-contexte-etape32.json');
    assert.equal(sha1(fs.readFileSync(fixture)), sha1(fs.readFileSync(d('premier.json'))));
    assert.equal(sha1(fs.readFileSync(path.join(copie.serveur, 'test', 'fixtures', 'banc-regles-etape32.md'))), sR);
    const attendu = B.texteDeLaNote(B.aRecopier(JSON.parse(fs.readFileSync(fixture, 'utf8')), { sortie: { fichier: 'test/fixtures/banc-contexte-etape32.json', sha1: sha1(fs.readFileSync(fixture)) } }));
    assert.equal(fs.readFileSync(note, 'utf8'), attendu);
    // Les comptes et le diagnostic de la météo (sans résultat).
    fs.mkdirSync(d('export'));
    fs.writeFileSync(d('export/2025-06.json'), JSON.stringify([{ date: '2025-06-03', homeId: `fotmob-${fab.json.clubs[0].id}`, meta: { surface: 'grass' } }]));
    const c = executer(copie, cli, { args: ['--comptes', '--export', d('export'), '--sortie', d('comptes.json'), '--pelouses', d('pelouses-comptes.json'), '--passe', d('passe-libre.json')], timeout: 300_000 });
    assert.equal(c.code, 0, c.erreurs.slice(-3000));
    const comptes = JSON.parse(fs.readFileSync(d('comptes.json'), 'utf8'));
    assert.equal(comptes.aucunResultatLu, true);
    assert.equal(comptes.exportGele.rencontres, 1);
    assert.ok(Array.isArray(JSON.parse(fs.readFileSync(d('pelouses-comptes.json'), 'utf8')).clubs));
    fs.writeFileSync(d('analyses.json'), JSON.stringify([{ matchId: 'x', commenceTime: '2025-06-03T19:00:00.000Z', analysis: { secret: 'jamais lu' }, lineupSnapshot: { fotmobMatchId: '9000003', fetchedAt: '2025-06-03T17:00:00.000Z', matchInfo: { temperature: 21, windSpeed: 3, weather: 'Fair', precipitation: 0 } } }]));
    const m = executer(copie, cli, { args: ['--diagnostic-meteo', '--analyses', d('analyses.json'), '--sortie', d('meteo.json')], timeout: 300_000 });
    assert.equal(m.code, 0, m.erreurs.slice(-3000));
    const meteo = JSON.parse(fs.readFileSync(d('meteo.json'), 'utf8'));
    assert.equal(meteo.aucunResultatLu, true);
    assert.equal(meteo.instantanesAvecIdentifiant, 1);
    assert.doesNotMatch(JSON.stringify(meteo), /jamais lu/);
  } finally {
    copie.nettoyer();
  }
});
