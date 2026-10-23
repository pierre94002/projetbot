/**
 * L'indice de force des équipes (étape 29 du plan, 14/10/2026).
 *   node --test test/indiceForce.test.mjs        (depuis server/)
 *
 * Deux sortes de vérifications :
 *  1. les RÈGLES de src/data/db/teamStrength.js et de teamStrengthBanc.js dans le processus du test, sur des
 *     championnats FABRIQUÉS dont la vraie force est connue d'avance : la correction des adversaires la
 *     retrouve (et l'itération converge), la pondération dans le temps (2^(−k/demi-vie), k compté sur tous les
 *     matchs relevés, coupes comprises) et la règle du jour J (un match futur 9-0 ne change rien avant lui, deux
 *     matchs le même jour ne se voient pas, le désordre lève), domicile et extérieur, les percentiles DANS le
 *     championnat, le repli sans xG, les coupes et les barrages entre deux championnats, les poids appris
 *     (ridge) et le lien « écart → 1N2 » retrouvés ;
 *  2. la NUIT, la LECTURE et la ROUTE dans une copie isolée (test/aides/script-indice-force.mjs) : la table du
 *     jour J construite dans la copie, le premier calcul par l'étape de la passe (processus à part, comme chez
 *     Pierre), « rien » sans rien écrire, une rencontre modifiée → seul son championnat rejoué, et EXACTEMENT
 *     les lignes d'un calcul complet, une rencontre retirée, une table du jour J pas à jour, un échec,
 *     les homonymes par identifiant, GET /api/match-stats/team-strength, le banc sur un registre d'essai.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as F from '../src/data/db/teamStrength.js';
import * as B from '../src/data/db/teamStrengthBanc.js';
import { poidsDemiVie, VUES_DE_L_ETAPE_18 } from '../src/bench/statValue.js';
import { verifierLancements, LANCEMENTS } from '../src/bench/lancements.js';
import { generateur } from '../src/bench/guard.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-indice-force.mjs');
const proche = (a, b, eps, quoi) => assert.ok(Math.abs(a - b) <= eps, `${quoi} : ${a} ≠ ${b} (± ${eps})`);
const { IDX_COTE, C, LARGEUR, NUL } = F.__pourLesTests;
const XG_P = IDX_COTE.xg_p;
const XG_C = IDX_COTE.xg_c;
const INFINI = Object.fromEntries(F.STATISTIQUES_INDICE.map((s) => [s.id, Infinity]));

/** Une rencontre du rejeu : seules les statistiques données sont relevées. */
function rencontre({ jour, dom, ext, league = 'L1', cle = null, coupe = false, compte = true, attribue = false, prolongation = false, ...stats }) {
  const valeurs = { xg: null, tirs: null, cadres: null, occasions: null, buts: null, corners: null, possession: null, ...stats };
  return { jour, cle: cle ?? `${jour}-${dom}-${ext}`, league, coupe, compte, attribue, prolongation, dom, ext, valeurs };
}

/** Rejoue des rencontres (rangées ici) et rend le rejeu. */
function rejouer(rencontres, options = {}) {
  const triees = [...rencontres].sort((a, b) => a.jour - b.jour || (a.cle < b.cle ? -1 : 1));
  const rejeu = new F.RejeuDeForce({ ...options });
  const gen = F.rejouer(rejeu, triees);
  let e = gen.next();
  while (!e.done) e = gen.next();
  return rejeu;
}

/** Les écarts « tous » / dom / ext d'un club, résolus au lendemain du dernier jour (tolérance fine). */
function ecartsDe(rejeu, league, club, jour, { aPriori = 0, brut = false } = {}) {
  const s = rejeu.systemes.get(league);
  s.resoudre(jour, { corriger: rejeu.corriger, unites: rejeu.unites(s), aPriori });
  const c = s.composantes(s.index.get(club), { brut });
  return { tous: c[0].ecarts, dom: c[1].ecarts, ext: c[2].ecarts, valeurs: c[0].valeurs, n: c[0].n };
}

/** Les lignes émises par le rejeu, décodées : { club, jour, lieu, actuel, league, … } (valeurs ÷100). */
function lignesDe(rejeu) {
  const out = [];
  const t = rejeu.lignes.t;
  for (let o = 0; o < rejeu.lignes.n * LARGEUR; o += LARGEUR) {
    const v = (k) => (t[o + k] === NUL ? null : t[o + k]);
    out.push({
      club: t[o + C.club], jour: t[o + C.jour], lieu: F.LIEUX[t[o + C.lieu]], actuel: t[o + C.actuel], league: rejeu.ligues[t[o + C.ligue]],
      formule: F.FORMULE_DE_CODE[t[o + C.formule]] ?? null, n: v(C.n), force: v(C.force), rang: v(C.rang), equipes: v(C.equipes), pctForce: v(C.pct_force),
      xg_p: v(C.xg_p), xg_c: v(C.xg_c), pct_xg_p: v(C.pct_xg_p), pct_xg_c: v(C.pct_xg_c)
    });
  }
  return out;
}

// Un championnat FABRIQUÉ : 8 clubs, deux groupes de niveaux différents, qui se rencontrent surtout entre eux
// (4 fois dans le groupe, 2 fois hors du groupe, autant à domicile qu'à l'extérieur) — les moyennes brutes
// sont faussées par le calendrier ; la vraie force (attaque a, défense d en xG) est connue d'avance.
const VRAIS = new Map([
  [101, { a: 0.6, d: 0.4 }], [102, { a: 0.3, d: 0.5 }], [103, { a: 0.5, d: 0.1 }], [104, { a: 0.2, d: 0.3 }],
  [105, { a: -0.3, d: -0.2 }], [106, { a: -0.5, d: -0.4 }], [107, { a: -0.2, d: -0.5 }], [108, { a: -0.6, d: -0.2 }]
]);
const MU = { dom: 1.5, ext: 1.2 };
function calendrierDesGroupes({ bruit = null, debut = 1000 } = {}) {
  const clubs = [...VRAIS.keys()];
  const groupe = (c) => (c <= 104 ? 0 : 1);
  const matchs = [];
  for (const h of clubs) {
    for (const a of clubs) {
      if (h === a) continue;
      const fois = groupe(h) === groupe(a) ? 2 : 1;
      for (let k = 0; k < fois; k++) matchs.push([h, a]);
    }
  }
  // Un ordre fixe et mêlé (le générateur à graine du juge) : un match par jour.
  const u = generateur(29);
  for (let i = matchs.length - 1; i > 0; i--) {
    const j = Math.floor(u() * (i + 1));
    [matchs[i], matchs[j]] = [matchs[j], matchs[i]];
  }
  return matchs.map(([h, a], i) => {
    const vh = VRAIS.get(h);
    const va = VRAIS.get(a);
    const e = bruit ? [bruit(), bruit()] : [0, 0];
    return rencontre({ jour: debut + i, dom: h, ext: a, xg: [MU.dom + vh.a - va.d + e[0], MU.ext + va.a - vh.d + e[1]] });
  });
}
const centre = (m) => {
  const v = [...m.values()];
  const moy = v.reduce((s, x) => s + x, 0) / v.length;
  return new Map([...m].map(([k, x]) => [k, x - moy]));
};

// ------------------------------------------------------------ 1. la correction des adversaires

test('correction des adversaires : sur un championnat fabriqué au calendrier déséquilibré, la vraie force est RETROUVÉE (attaque et défense, à 1e-6), l’itération converge en peu de tours ; sans correction, les moyennes brutes sont faussées ; la fonction en clair et le rejeu donnent la même chose', () => {
  const rencontres = calendrierDesGroupes();
  const vraiA = centre(new Map([...VRAIS].map(([k, v]) => [k, v.a])));
  const vraiD = centre(new Map([...VRAIS].map(([k, v]) => [k, v.d])));
  // 1. La fonction en clair (poids 1, μ connues).
  const enClair = F.corrigerDesAdversaires(rencontres.map((r) => ({ dom: r.dom, ext: r.ext, yDom: r.valeurs.xg[0], yExt: r.valeurs.xg[1] })), { mu: MU, aPriori: 0, tolerance: 1e-12 });
  assert.equal(enClair.converge, true);
  assert.ok(enClair.tours > 1 && enClair.tours < 200, `tours : ${enClair.tours}`);
  for (const [club, a] of vraiA) proche(enClair.attaque.get(club), a, 1e-6, `attaque ${club}`);
  for (const [club, d] of vraiD) proche(enClair.defense.get(club), d, 1e-6, `défense ${club}`);
  // L'itération 0 (le classement brut) est faussée par le calendrier : les forts, qui se rencontrent, paraissent moins forts.
  const brut = enClair.iteration0.attaque;
  assert.ok(brut.get(101) < vraiA.get(101) - 0.03, `l’attaque brute du meilleur club est sous-estimée (${brut.get(101)} contre ${vraiA.get(101)})`);
  assert.ok(brut.get(108) > vraiA.get(108) + 0.03, `l’attaque brute du plus faible est surestimée (${brut.get(108)} contre ${vraiA.get(108)})`);
  const sans = F.corrigerDesAdversaires(rencontres.map((r) => ({ dom: r.dom, ext: r.ext, yDom: r.valeurs.xg[0], yExt: r.valeurs.xg[1] })), { mu: MU, corriger: false });
  proche(sans.attaque.get(101), brut.get(101), 1e-12, 'corriger: false = l’itération 0');
  // 2. Le rejeu (le chemin de l'appli) : poids 1 (demi-vies infinies), sans match fictif — la même vérité.
  const rejeu = rejouer(rencontres, { demiVies: INFINI, aPriori: 0, ecrire: false, actuelles: false });
  assert.equal(rejeu.bilan.nonConvergees, 0);
  assert.ok(rejeu.bilan.toursMax < 200, `au plus ${rejeu.bilan.toursMax} tours`);
  const fin = rencontres.at(-1).jour + 1;
  for (const club of VRAIS.keys()) {
    const e = ecartsDe(rejeu, 'L1', club, fin);
    proche(e.tous[XG_P], vraiA.get(club), 1e-6, `rejeu : attaque ${club}`);
    proche(e.tous[XG_C], vraiD.get(club), 1e-6, `rejeu : défense ${club}`);
    proche(e.tous[XG_P], enClair.attaque.get(club), 1e-6, `rejeu = fonction en clair (${club})`);
  }
  // 3. Avec du bruit (graine fixe) : retrouvée à peu près, toujours convergente ; le match fictif rapproche de la moyenne.
  const u = generateur(7);
  const bruitees = calendrierDesGroupes({ bruit: () => (u() - 0.5) * 0.6 });
  const r2 = rejouer(bruitees, { demiVies: INFINI, aPriori: 0, ecrire: false, actuelles: false });
  const r3 = rejouer(bruitees, { demiVies: INFINI, aPriori: 1, ecrire: false, actuelles: false });
  assert.equal(r2.bilan.nonConvergees + r3.bilan.nonConvergees, 0);
  for (const club of VRAIS.keys()) {
    const e2 = ecartsDe(r2, 'L1', club, fin);
    const e3 = ecartsDe(r3, 'L1', club, fin, { aPriori: 1 });
    proche(e2.tous[XG_P], vraiA.get(club), 0.15, `bruit : attaque ${club}`);
    assert.ok(Math.abs(e3.tous[XG_P]) <= Math.abs(e2.tous[XG_P]) + 0.02, `le match fictif ne fait que rapprocher de la moyenne (${club})`);
  }
});

test('le lieu et le match fictif : un club qui a joué surtout à domicile n’est pas avantagé (la moyenne de chaque lieu est retirée) ; un club de trois matchs est rapproché de la moyenne d’un quart (un match fictif face à un adversaire moyen), un club de huit presque pas ; les valeurs relevées d’une rencontre (xG des deux côtés ou rien, 0-0 « non relevé », possession des deux camps)', () => {
  // Quatre clubs de même force ; l'avantage du terrain vaut 0,6 xG. Le club 1 joue 6 fois chez lui, 2 fois dehors.
  const rencontres = [];
  let jour = 1;
  const jouer = (h, a) => rencontres.push(rencontre({ jour: jour++, dom: h, ext: a, xg: [1.6, 1.0] }));
  for (const a of [2, 3, 4, 2, 3, 4]) jouer(1, a);
  jouer(2, 1);
  jouer(3, 1);
  for (const [h, a] of [[2, 3], [3, 2], [2, 4], [4, 2], [3, 4], [4, 3], [2, 3], [3, 4], [4, 2]]) jouer(h, a);
  const rejeu = rejouer(rencontres, { demiVies: INFINI, aPriori: 0, ecrire: false, actuelles: false });
  for (const c of [1, 2, 3, 4]) {
    const e = ecartsDe(rejeu, 'L1', c, jour + 1);
    proche(e.tous[XG_P], 0, 1e-6, `club ${c} : attaque « tous » = la moyenne`);
    proche(e.tous[XG_C], 0, 1e-6, `club ${c} : défense « tous » = la moyenne`);
  }
  // Le match fictif : le club 9 n'a joué que 3 fois (3,6 xG chez lui face à des adversaires moyens).
  const avec9 = [...rencontres, ...[2, 3, 4].map((a, k) => rencontre({ jour: jour + 1 + k, dom: 9, ext: a, xg: [3.6, 1.0] }))];
  const sans = rejouer(avec9, { demiVies: INFINI, aPriori: 0, ecrire: false, actuelles: false });
  const avec = rejouer(avec9, { demiVies: INFINI, ecrire: false, actuelles: false });
  const e0 = ecartsDe(sans, 'L1', 9, jour + 5, { aPriori: 0 }).tous[XG_P];
  const e1 = ecartsDe(avec, 'L1', 9, jour + 5, { aPriori: F.SEUILS_INDICE.aPriori }).tous[XG_P];
  assert.equal(F.SEUILS_INDICE.aPriori, 1);
  assert.ok(e0 > 1.2, `sans match fictif : ${e0}`);
  proche(e1, (e0 * 3) / 4, 0.15, 'trois matchs : un quart du chemin vers la moyenne');
  // Un club de 24 matchs (le championnat des deux groupes) : le match fictif ne le rapproche que de quelques %.
  const groupes = calendrierDesGroupes();
  const finG = groupes.at(-1).jour + 1;
  const g0 = ecartsDe(rejouer(groupes, { demiVies: INFINI, aPriori: 0, ecrire: false, actuelles: false }), 'L1', 101, finG, { aPriori: 0 }).tous[XG_P];
  const g1 = ecartsDe(rejouer(groupes, { demiVies: INFINI, ecrire: false, actuelles: false }), 'L1', 101, finG, { aPriori: 1 }).tous[XG_P];
  assert.ok(Math.abs(g1) < Math.abs(g0) && Math.abs(g1 - g0) < 0.05, `beaucoup de matchs : presque rien (${g0} → ${g1})`);
  // Les valeurs relevées d'une rencontre (la table du jour J → le rejeu).
  const v = F.valeursDUneRencontre({ xg_p: 1.2, xg_c: null, tirs_p: 0, tirs_c: 0, cadres_p: 3, cadres_c: 0, occasions_p: null, occasions_c: 2, corners_p: 5, corners_c: 4, bp: 2, bc: 0, possession_p: 58, possession_c: 42 });
  assert.deepEqual(v, { xg: null, tirs: null, cadres: [3, 0], occasions: null, buts: [2, 0], corners: [5, 4], possession: [58, 42] });
  assert.equal(F.valeursDUneRencontre({ bp: 1, bc: 1, possession_p: 50, possession_c: null }).possession, null);
});

// ------------------------------------------------------------ 2. le temps, sans fuite

test('pondération dans le temps, sans fuite : 2^(−k/demi-vie) (la fonction de l’étape 18), k compté sur TOUS les matchs relevés du club — coupes comprises — ; un match futur 9-0 ne change aucune ligne d’avant lui ; deux matchs le même jour ne se voient pas ; une rencontre dans le désordre LÈVE', () => {
  assert.equal(F.poids(0, 13), 1);
  proche(F.poids(13, 13), 0.5, 1e-15, 'une demi-vie');
  proche(F.poids(26, 13), 0.25, 1e-15, 'deux demi-vies');
  assert.equal(F.poids(40, Infinity), poidsDemiVie(40, Infinity));
  // Le club 1 joue 6 fois à domicile contre 2, puis une coupe contre un club d'un autre championnat, puis 2 fois encore.
  const h = 10;
  const hc = 4; // « xG concédés » : sa propre demi-vie
  const demiVies = { ...INFINI, xg_p: h, xg_c: hc };
  const xg = [1, 2, 3, 4, 5, 6, 7, 8];
  const concedes = [0.5, 0.7, 0.9, 1.1, 1.3, 1.5, 1.7, 1.9];
  const rencontres = [];
  for (let i = 0; i < 6; i++) rencontres.push(rencontre({ jour: 100 + i, dom: 1, ext: 2, xg: [xg[i], concedes[i]] }));
  rencontres.push(rencontre({ jour: 50, dom: 3, ext: 4, league: 'L2', xg: [1, 1] }));
  rencontres.push(rencontre({ jour: 106, dom: 1, ext: 3, league: 'Coupe', coupe: true, xg: [9, 9] }));
  for (let i = 6; i < 8; i++) rencontres.push(rencontre({ jour: 101 + i, dom: 1, ext: 2, xg: [xg[i], concedes[i]] }));
  const rejeu = rejouer(rencontres, { demiVies, aPriori: 0, ecrire: false, actuelles: false });
  assert.equal(rejeu.bilan.ecartees.championnatsDifferents, 1, 'la coupe contre un club d’un autre championnat n’entre pas');
  const s = rejeu.systemes.get('L1');
  const i = s.index.get(1);
  const k = IDX_COTE.xg_p * 2; // côté « xG créés », à domicile
  // À la main : les 8 matchs du club 1 dans L1, du plus récent au plus ancien ; la coupe (relevée) compte dans k.
  const ks = [0, 1, 3, 4, 5, 6, 7, 8];
  const valeurs = [8, 7, 6, 5, 4, 3, 2, 1];
  const attendu = valeurs.reduce((x, v, j) => x + v * poidsDemiVie(ks[j], h), 0) / ks.reduce((x, kk) => x + poidsDemiVie(kk, h), 0);
  proche(s.Y[k][i] / s.S[k][i], attendu, 1e-12, 'moyenne pondérée des xG créés (k compte la coupe)');
  // Les xG concédés : la même règle, avec LEUR demi-vie.
  const kc = IDX_COTE.xg_c * 2;
  const vc = [1.9, 1.7, 1.5, 1.3, 1.1, 0.9, 0.7, 0.5];
  const attenduC = vc.reduce((x, v, j) => x + v * poidsDemiVie(ks[j], hc), 0) / ks.reduce((x, kk) => x + poidsDemiVie(kk, hc), 0);
  proche(s.Y[kc][i] / s.S[kc][i], attenduC, 1e-12, 'moyenne pondérée des xG concédés (sa demi-vie à elle)');
  // La garde du jour J : une rencontre dans le désordre lève.
  const r = new F.RejeuDeForce({ ecrire: false });
  r.jour(10, [rencontre({ jour: 10, dom: 1, ext: 2, xg: [1, 1] })]);
  assert.throws(() => r.jour(10, [rencontre({ jour: 10, dom: 1, ext: 2, xg: [1, 1] })]), /fuite refusée/);
  assert.throws(() => r.jour(9, [rencontre({ jour: 9, dom: 1, ext: 2, xg: [1, 1] })]), /fuite refusée/);
  // Un match futur absurde (9-0 en xG, le jour 1 100 + 20) : aucune ligne d'avant ce jour ne change ; la ligne du jour non plus.
  const base = calendrierDesGroupes();
  const futur = rencontre({ jour: base[20].jour, dom: 101, ext: 108, cle: 'zz-futur', xg: [9, 0] });
  const sans = lignesDe(rejouer(base.filter((x) => x.jour !== futur.jour), { actuelles: false }));
  const avec = lignesDe(rejouer([...base.filter((x) => x.jour !== futur.jour), futur], { actuelles: false }));
  const cle = (l) => `${l.club}|${l.jour}|${l.lieu}`;
  const sansParCle = new Map(sans.map((l) => [cle(l), l]));
  let comparees = 0;
  for (const l of avec) {
    if (l.jour > futur.jour) continue;
    if (sansParCle.has(cle(l))) {
      assert.deepEqual(l, sansParCle.get(cle(l)), `ligne ${cle(l)} identique`);
      comparees++;
    }
  }
  assert.ok(comparees > 30, `${comparees} lignes comparées`);
  const apres = avec.filter((l) => l.jour > futur.jour && (l.club === 101 || l.club === 108) && l.lieu === 'tous');
  assert.ok(apres.some((l) => l.xg_p !== sansParCle.get(cle(l))?.xg_p || l.xg_c !== sansParCle.get(cle(l))?.xg_c), 'après lui, le match compte');
  // Deux matchs le même jour pour un club : sa ligne de ce jour ne lit ni l'un ni l'autre (= un seul match, banal, ce jour-là).
  const deux = [...base.slice(0, 30), rencontre({ jour: 2000, dom: 101, ext: 102, xg: [5, 0] }), rencontre({ jour: 2000, dom: 103, ext: 101, cle: '2000-zz', xg: [0, 5] })];
  const unSeul = [...base.slice(0, 30), rencontre({ jour: 2000, dom: 101, ext: 102, xg: [1, 1] })];
  const l1 = lignesDe(rejouer(deux, { actuelles: false })).filter((l) => l.club === 101 && l.jour === 2000);
  const l2 = lignesDe(rejouer(unSeul, { actuelles: false })).filter((l) => l.club === 101 && l.jour === 2000);
  assert.equal(l1.length, 3, 'une ligne par lieu, une seule fois pour les deux matchs');
  for (const lieu of F.LIEUX) assert.deepEqual(l1.find((l) => l.lieu === lieu), l2.find((l) => l.lieu === lieu), `ce jour-là, ce qu’on savait la veille (${lieu})`);
});

// ------------------------------------------------------------ 3. domicile et extérieur

test('domicile et extérieur : un club fort chez lui et faible ailleurs — les lignes « dom » et « ext » retrouvent ses deux forces (à 1e-6), « tous » est entre les deux ; le système dom/ext oppose l’attaque à domicile à la défense à l’extérieur de l’adversaire', () => {
  const vrai = new Map([
    [1, { ad: 0.8, ae: -0.4, dd: 0.2, de: -0.1 }], [2, { ad: 0.1, ae: 0.2, dd: 0.0, de: 0.3 }], [3, { ad: -0.3, ae: 0.1, dd: -0.2, de: 0.1 }],
    [4, { ad: -0.2, ae: -0.1, dd: 0.1, de: -0.2 }], [5, { ad: 0.0, ae: 0.3, dd: -0.3, de: 0.0 }], [6, { ad: -0.4, ae: -0.1, dd: 0.2, de: -0.1 }]
  ]);
  const rencontres = [];
  let jour = 1;
  for (let tour = 0; tour < 3; tour++) {
    for (const h of vrai.keys()) {
      for (const a of vrai.keys()) {
        if (h === a) continue;
        const vh = vrai.get(h);
        const va = vrai.get(a);
        rencontres.push(rencontre({ jour: jour++, dom: h, ext: a, xg: [MU.dom + vh.ad - va.de, MU.ext + va.ae - vh.dd] }));
      }
    }
  }
  const rejeu = rejouer(rencontres, { demiVies: INFINI, aPriori: 0, ecrire: false, actuelles: false });
  const fin = jour + 1;
  const cDe = (k) => centre(new Map([...vrai].map(([c, v]) => [c, v[k]])));
  const [ad, ae, dd, de] = ['ad', 'ae', 'dd', 'de'].map(cDe);
  for (const c of vrai.keys()) {
    const e = ecartsDe(rejeu, 'L1', c, fin);
    proche(e.dom[XG_P], ad.get(c), 1e-6, `attaque à domicile ${c}`);
    proche(e.ext[XG_P], ae.get(c), 1e-6, `attaque à l’extérieur ${c}`);
    proche(e.dom[XG_C], dd.get(c), 1e-6, `défense à domicile ${c}`);
    proche(e.ext[XG_C], de.get(c), 1e-6, `défense à l’extérieur ${c}`);
  }
  const e1 = ecartsDe(rejeu, 'L1', 1, fin);
  assert.ok(e1.tous[XG_P] < e1.dom[XG_P] && e1.tous[XG_P] > e1.ext[XG_P], '« tous » entre domicile et extérieur');
  // Les valeurs par match : à domicile face à une défense moyenne à l'extérieur (μ dom + a), à l'extérieur (μ ext + a).
  const s = rejeu.systemes.get('L1');
  const comp = s.composantes(s.index.get(1));
  proche(comp[1].valeurs[XG_P], s.mu[0] + comp[1].ecarts[XG_P], 1e-12, 'valeur dom = μ dom + a dom');
  proche(comp[2].valeurs[XG_C], s.mu[0] - comp[2].ecarts[XG_C], 1e-12, 'concédé à l’extérieur = μ dom (l’adversaire reçoit) − d ext');
});

// ------------------------------------------------------------ 4. les percentiles

test('percentiles : dans SON championnat (un club moyen d’un championnat fort est bas, le meilleur d’un championnat faible est haut), plus haut = mieux même pour ce qu’on concède, égalités à mi-chemin ; rang et percentile de la note', () => {
  assert.equal(F.percentileDans(3, [1, 2, 3, 4]), 63);
  assert.equal(F.percentileDans(4, [1, 2, 3, 4]), 88);
  assert.equal(F.percentileDans(1, [1, 2, 3, 4], -1), 88, 'ce qu’on concède : le plus petit est le meilleur');
  assert.equal(F.percentileDans(2, [2, 2, 2, 2]), 50, 'tous égaux : 50');
  assert.equal(F.percentileDans(null, [1, 2]), null);
  // Deux championnats : L1 (fort, ~2 xG) et L2 (faible, ~1 xG).
  const rencontres = [];
  let jour = 1;
  const niveaux = { L1: [2.4, 2.2, 2.0, 1.8], L2: [1.3, 1.1, 0.9, 0.7] };
  const defense = [0.1, 0.0, -0.1, 0.2];
  for (const [L, n] of Object.entries(niveaux)) {
    const clubs = n.map((_, i) => (L === 'L1' ? 11 : 21) + i);
    for (let tour = 0; tour < 2; tour++) {
      for (const [i, h] of clubs.entries()) {
        for (const [j, a] of clubs.entries()) {
          if (h === a) continue;
          rencontres.push(rencontre({ jour: jour++, league: L, dom: h, ext: a, xg: [n[i] - defense[j], n[j] * 0.8 - defense[i]], tirs: [10 + i, 10 + j], cadres: [4, 4], buts: [1, 1], corners: [5, 5], possession: [50, 50] }));
        }
      }
    }
  }
  const lignes = lignesDe(rejouer(rencontres)).filter((l) => l.actuel === 1 && l.lieu === 'tous');
  const de = (club) => lignes.find((l) => l.club === club);
  const moyenFort = de(14); // le dernier de L1 : 1,8 xG créés
  const meilleurFaible = de(21); // le premier de L2 : 1,3 xG créés
  assert.ok(moyenFort.xg_p > meilleurFaible.xg_p, 'en valeur, le club du championnat fort crée plus');
  assert.ok(moyenFort.pct_xg_p < 30 && meilleurFaible.pct_xg_p > 70, `percentiles dans leur championnat : ${moyenFort.pct_xg_p} et ${meilleurFaible.pct_xg_p}`);
  assert.equal(moyenFort.league, 'L1');
  assert.equal(meilleurFaible.league, 'L2');
  // Le club qui concède le moins a le percentile le plus haut sur « xG concédés ».
  const l1 = lignes.filter((l) => l.league === 'L1');
  const moinsConcede = l1.reduce((m, l) => (l.xg_c < m.xg_c ? l : m));
  assert.equal(moinsConcede.pct_xg_c, Math.max(...l1.map((l) => l.pct_xg_c)));
  // Le rang de la note : 1 pour la meilleure, sur les 4 clubs du championnat.
  const meilleure = l1.reduce((m, l) => (l.force > m.force ? l : m));
  assert.deepEqual([meilleure.rang, meilleure.equipes], [1, 4]);
  assert.ok(meilleure.pctForce > 80);
  // Le nombre de matchs de chaque ligne : 12 en tout (deux tours, chaque paire deux fois par tour), 6 à domicile, 6 à l'extérieur.
  for (const l of lignesDe(rejouer(rencontres)).filter((x) => x.actuel === 1)) assert.equal(l.n, l.lieu === 'tous' ? 12 : 6, `${l.club} ${l.lieu}`);
  // Les clubs d'un championnat : ceux de la SAISON (dès que 6 l'ont jouée), sinon ceux de la saison d'avant.
  // Sept clubs en 2024-25 ; le club 77 descend dans une division absente du magasin : il n'y joue plus en 2025-26.
  const saisons = [];
  let d = F.numeroDuJour('2024-08-01');
  const clubs24 = [71, 72, 73, 74, 75, 76, 77];
  for (const h of clubs24) for (const a of clubs24) if (h !== a) saisons.push(rencontre({ jour: d++, league: 'EPL', dom: h, ext: a, xg: [1.4, 1.1], tirs: [12, 10], cadres: [4, 3], buts: [1, 1], corners: [5, 4], possession: [52, 48] }));
  const intersaison = lignesDe(rejouer(saisons, { jusquA: F.numeroDuJour('2025-07-15') })).filter((l) => l.actuel === 1 && l.lieu === 'tous');
  assert.deepEqual(intersaison.map((l) => l.club).sort(), clubs24, 'à l’intersaison : les clubs de la saison d’avant');
  d = F.numeroDuJour('2025-08-01');
  const clubs25 = [71, 72, 73, 74, 75, 76];
  for (const h of clubs25) for (const a of clubs25) if (h !== a) saisons.push(rencontre({ jour: d++, league: 'EPL', dom: h, ext: a, xg: [1.4, 1.1], tirs: [12, 10], cadres: [4, 3], buts: [1, 1], corners: [5, 4], possession: [52, 48] }));
  const enSaison = lignesDe(rejouer(saisons)).filter((l) => l.actuel === 1 && l.lieu === 'tous');
  assert.deepEqual(enSaison.map((l) => l.club).sort(), clubs25, 'en saison : le descendu n’en est plus');
  assert.ok(enSaison.every((l) => l.equipes === 6 || l.equipes === null));
});

// ------------------------------------------------------------ 5. le repli sans xG

test('repli sans xG : un championnat sans aucun xG a la formule « sans-xg » (buts, tirs, cadrés, corners, possession), dite sur chaque ligne ; la note = Σ poids × écarts, celle de POIDS_DE_LA_NOTE ; un club avec moins de 3 matchs avec xG retombe aussi sur le repli ; sans composantes, pas de note', () => {
  const rencontres = [];
  let jour = 1;
  for (const L of ['AvecXg', 'SansXg']) {
    const clubs = L === 'AvecXg' ? [31, 32, 33, 34] : [41, 42, 43, 44];
    for (let tour = 0; tour < 2; tour++) {
      for (const [i, h] of clubs.entries()) {
        for (const [j, a] of clubs.entries()) {
          if (h === a) continue;
          rencontres.push(rencontre({ jour: jour++, league: L, dom: h, ext: a, xg: L === 'AvecXg' ? [1.2 + 0.1 * i, 1 + 0.1 * j] : null, tirs: [12 + i, 10 + j], cadres: [4 + i, 3 + j], occasions: L === 'AvecXg' ? [2, 1] : null, buts: [1 + (i % 2), j % 2], corners: [5 + i, 4], possession: [50 + i, 50 - i] }));
        }
      }
    }
  }
  const rejeu = rejouer(rencontres);
  const lignes = lignesDe(rejeu).filter((l) => l.actuel === 1);
  for (const l of lignes.filter((x) => x.league === 'SansXg')) {
    assert.equal(l.formule, 'sans-xg');
    assert.equal(l.xg_p, null, 'pas de xG : null, jamais 0');
  }
  for (const l of lignes.filter((x) => x.league === 'AvecXg' && x.lieu === 'tous')) assert.equal(l.formule, 'xg');
  // La note : Σ poids × écarts, recalculée ici depuis les écarts du système.
  const s = rejeu.systemes.get('SansXg');
  s.resoudre(jour + 1, { corriger: true, unites: rejeu.unites(s), aPriori: F.SEUILS_INDICE.aPriori });
  const e = s.composantes(s.index.get(41))[0].ecarts;
  const attendue = F.FORMULES['sans-xg'].reduce((x, id) => x + F.POIDS_DE_LA_NOTE['sans-xg'][id] * e[IDX_COTE[id]], 0);
  proche(F.noteDe(e).force, attendue, 1e-12, 'note sans xG');
  assert.equal(F.noteDe(e).formule, 'sans-xg');
  proche(lignes.find((l) => l.club === 41 && l.lieu === 'tous').force / 1000, attendue, 0.0011, 'la ligne écrite');
  // noteDe : avec tout, la formule xg ; sans xG, le repli ; sans rien, pas de note ; sans poids, la formule sans note.
  const plein = new Float64Array(F.STATISTIQUES_INDICE.length).fill(0.1);
  assert.equal(F.noteDe(plein).formule, 'xg');
  const sansXg = Float64Array.from(plein);
  sansXg[XG_P] = Number.NaN;
  assert.equal(F.noteDe(sansXg).formule, 'sans-xg');
  assert.deepEqual(F.noteDe(new Float64Array(F.STATISTIQUES_INDICE.length).fill(Number.NaN)), { force: null, formule: null });
  assert.deepEqual(F.noteDe(plein, { xg: null, 'sans-xg': null }), { force: null, formule: 'xg' });
  // Un club avec moins de 3 matchs avec xG dans un championnat qui en a : composante xG non mesurée → repli.
  // (Ses grosses occasions sont relevées : seul le minimum de matchs avec xG décide.)
  const autres = { tirs: [10, 10], cadres: [3, 3], occasions: [2, 1], buts: [1, 1], corners: [4, 4], possession: [50, 50] };
  const peu = rejouer([...rencontres, rencontre({ jour: jour + 10, league: 'AvecXg', dom: 35, ext: 31, xg: [1, 1], ...autres }), rencontre({ jour: jour + 11, league: 'AvecXg', dom: 32, ext: 35, xg: null, ...autres }), rencontre({ jour: jour + 12, league: 'AvecXg', dom: 35, ext: 33, xg: null, ...autres })]);
  const l35 = lignesDe(peu).find((l) => l.actuel === 1 && l.club === 35 && l.lieu === 'tous');
  assert.equal(l35.formule, 'sans-xg');
  assert.equal(l35.xg_p, null, 'un seul match avec xG : la composante n’est pas mesurée');
});

// ------------------------------------------------------------ 6. les coupes

test('coupes et barrages : une rencontre entre deux championnats (coupe, barrage de promotion) n’entre JAMAIS dans la correction — comptée, et les forces sont celles d’un rejeu sans elle — ; une coupe entre deux clubs du MÊME championnat y entre ; un barrage rangé sous la division du dessus entre deux clubs du dessous va chez eux ; un promu reste dans son ancien championnat jusqu’à son premier match dans le nouveau', () => {
  const base = [];
  let jour = 1;
  for (const [L, clubs] of [['L1', [1, 2, 3, 4]], ['L2', [5, 6, 7, 8]]]) {
    for (let tour = 0; tour < 2; tour++) {
      for (const h of clubs) {
        for (const a of clubs) {
          if (h === a) continue;
          const f = L === 'L1' ? 1.5 : 0.9;
          base.push(rencontre({ jour: jour++, league: L, dom: h, ext: a, xg: [f + 0.05 * h, f - 0.03 * a] }));
        }
      }
    }
  }
  const fin = jour + 5;
  const coupe = rencontre({ jour: jour + 1, league: 'Coupe', coupe: true, dom: 8, ext: 1, xg: [0.2, 4.0] });
  const sansCoupe = rejouer(base, { ecrire: false, actuelles: false, aPriori: 0 });
  const avecCoupe = rejouer([...base, coupe], { ecrire: false, actuelles: false, aPriori: 0 });
  assert.equal(avecCoupe.bilan.ecartees.championnatsDifferents, 1);
  assert.deepEqual(avecCoupe.bilan.ecarteesParCompetition, { Coupe: 1 });
  for (const c of [1, 8]) {
    const L = c === 1 ? 'L1' : 'L2';
    const a = ecartsDe(sansCoupe, L, c, fin);
    const b = ecartsDe(avecCoupe, L, c, fin);
    // Le match de coupe fait avancer k (tous les poids du club baissent d'autant) : les moyennes ne bougent pas
    // (sans match fictif ; avec lui, le club a un match de plus « depuis », et sa moyenne se rapproche à peine de la moyenne).
    proche(b.tous[XG_P], a.tous[XG_P], 1e-6, `club ${c} : la coupe entre deux championnats ne change rien`);
  }
  // Une coupe entre deux clubs de L1 : elle entre.
  const interne = rencontre({ jour: jour + 1, league: 'Coupe', coupe: true, dom: 2, ext: 3, xg: [3.5, 0.1] });
  const avecInterne = rejouer([...base, interne], { ecrire: false, actuelles: false });
  assert.equal(avecInterne.bilan.utilisees, sansCoupe.bilan.utilisees + 1);
  assert.ok(ecartsDe(avecInterne, 'L1', 2, fin).tous[XG_P] > ecartsDe(sansCoupe, 'L1', 2, fin).tous[XG_P] + 0.01, 'elle compte');
  // Un barrage rangé sous L1 (hors classement) entre le dernier de L1 et un club de L2 : écarté.
  const barrage = rencontre({ jour: jour + 2, league: 'L1', compte: false, dom: 4, ext: 5, xg: [0.5, 3.0] });
  // Un barrage rangé sous L1 entre deux clubs de L2 (le cas « Rodez – Paris FC ») : il va chez eux, dans L2.
  const entreL2 = rencontre({ jour: jour + 3, league: 'L1', compte: false, dom: 6, ext: 7, xg: [2.5, 0.5] });
  const avecBarrages = rejouer([...base, barrage, entreL2], { ecrire: false, actuelles: false });
  assert.equal(avecBarrages.bilan.ecartees.championnatsDifferents, 1);
  assert.equal(avecBarrages.bilan.utilisees, sansCoupe.bilan.utilisees + 1);
  const domicile = IDX_COTE.xg_p * 2;
  const nDom = (r, L, c) => r.systemes.get(L).N[domicile][r.systemes.get(L).index.get(c)];
  assert.equal(nDom(avecBarrages, 'L2', 6), nDom(sansCoupe, 'L2', 6) + 1, 'le barrage entre deux clubs de L2 compte dans L2');
  assert.equal(avecBarrages.systemes.get('L1').index.has(6), false, 'jamais dans le système de L1');
  assert.equal(nDom(avecBarrages, 'L1', 4), nDom(sansCoupe, 'L1', 4), 'le barrage entre deux championnats ne compte nulle part');
  // Un promu : le club 5 monte en L1 ; sa ligne du jour de son premier match en L1 est encore celle de L2.
  const promu = [...base, rencontre({ jour: jour + 10, league: 'L1', dom: 5, ext: 1, xg: [1, 1] }), rencontre({ jour: jour + 11, league: 'L1', dom: 2, ext: 5, xg: [1, 1] })];
  const lignes = lignesDe(rejouer(promu, { actuelles: false })).filter((l) => l.club === 5 && l.lieu === 'tous');
  assert.equal(lignes.find((l) => l.jour === jour + 10).league, 'L2', 'la veille de son premier match en L1 : encore L2');
  assert.equal(lignes.find((l) => l.jour === jour + 11).league, 'L1', 'ensuite : L1');
});

// ------------------------------------------------------------ 7. le banc (pur)

test('banc : les poids (ridge) et le lien « écart → 1N2 » (logit ordonné) retrouvent des valeurs connues ; les probabilités font 100 % ; les variantes et les vues déclarées (celles de l’étape 18 comprises) tiennent la forme de lancements.js ; LANCEMENTS n’est pas touché ; l’empreinte des réglages change avec un poids', () => {
  const u = generateur(11);
  const X = [];
  const y = [];
  for (let i = 0; i < 4000; i++) {
    const x = [u() * 2 - 1, u() * 2 - 1, u() * 2 - 1];
    X.push(x);
    y.push(0.3 + 0.8 * x[0] - 0.5 * x[1] + 0.0 * x[2] + (u() - 0.5) * 0.2);
  }
  const p = B.apprendrePoids(X, y, ['a', 'b', 'c'], { lambda: 0 });
  proche(p.poids.a, 0.8, 0.01, 'poids a');
  proche(p.poids.b, -0.5, 0.01, 'poids b');
  proche(p.poids.c, 0, 0.01, 'poids c');
  proche(p.constante, 0.3, 0.01, 'constante');
  // Un logit ordonné connu : s1 = −0,9, s2 = 0,3, pente 1,2.
  const vrai = { s1: -0.9, s2: 0.3, pente: 1.2 };
  const ecarts = [];
  const issues = [];
  for (let i = 0; i < 20000; i++) {
    const s = u() * 3 - 1.5;
    const pr = B.probabilitesDuLien(vrai, s);
    const t = u();
    ecarts.push(s);
    issues.push(t < pr[0] ? 0 : t < pr[0] + pr[1] ? 1 : 2);
  }
  const lien = B.apprendreLien(ecarts, issues);
  proche(lien.s1, vrai.s1, 0.06, 's1');
  proche(lien.s2, vrai.s2, 0.06, 's2');
  proche(lien.pente, vrai.pente, 0.06, 'pente');
  for (const s of [-3, 0, 2.5]) proche(B.probabilitesDuLien(lien, s).reduce((a, b) => a + b, 0), 1, 1e-12, 'Σ = 1');
  assert.ok(B.probabilitesDuLien(lien, 2)[0] > B.probabilitesDuLien(lien, 0)[0], 'plus d’écart, plus de victoires à domicile');
  // Le lancement de l'étape (dans LANCEMENTS depuis le 19/10, daté du 14/10) : les vues de l'étape 18 dedans, toutes de portée « indice ».
  const declaration = B.LANCEMENT;
  assert.equal(verifierLancements([declaration]), true);
  const sansPortee = (vues) => vues.map(({ pour, ...f }) => f);
  assert.deepEqual(sansPortee(declaration.vues.slice(0, VUES_DE_L_ETAPE_18.length)), [...VUES_DE_L_ETAPE_18], 'les vues de l’étape 18, dont elle lit les demi-vies');
  assert.deepEqual(sansPortee(declaration.vues.slice(VUES_DE_L_ETAPE_18.length)), [...F.VUES_DE_L_ETAPE_29]);
  assert.ok(declaration.vues.every((f) => f.pour.length === 1 && f.pour[0] === 'indice'), 'portée « indice » : jamais « déjà vu » pour le moteur');
  assert.deepEqual(declaration.variantes.map((x) => x.id), ['indice-v1', 'indice-dom-ext', 'sans-correction', 'demi-vie-18']);
  assert.equal(declaration.le, '2026-10-14', 'en service chez Pierre depuis le 14/10');
  assert.equal(LANCEMENTS.filter((l) => l.etape === '29').length, 1);
  assert.equal(B.COMPARAISONS.filter((c) => c.principale).length, 1);
  assert.equal(B.COMPARAISONS[0].variante, 'indice-v1', 'la comparaison principale : la version retenue AVANT de regarder');
  assert.deepEqual(B.PERIODES_DU_BANC.preuve, { de: '2023-01-01', a: '2024-06-30', tranches: ['P3'] });
  assert.deepEqual(B.PERIODES_DU_BANC.apprentissage, { de: '2024-07-01', a: '2025-06-30', tranches: ['P4a'] });
  // Les réglages versionnés : les demi-vies de l'étape 18, recopiées ; une empreinte qui suit leur contenu.
  assert.deepEqual(F.REGLAGES_INDICE_FORCE.demiVies, { xg_p: 25, xg_c: 13, tirs_p: 25, tirs_c: 13, cadres_p: 25, cadres_c: 18, occasions_p: 25, occasions_c: 13, buts_p: 35, buts_c: 25, corners_p: 25, corners_c: 25, possession: 10 });
  const e0 = F.empreinteDesReglages();
  assert.equal(F.empreinteDesReglages(), e0);
  assert.notEqual(F.empreinteDesReglages({ ...F.REGLAGES_INDICE_FORCE, poids: { ...F.POIDS_DE_LA_NOTE, xg: { ...F.POIDS_DE_LA_NOTE.xg, xg_p: 0.4 } } }), e0);
  // L'empreinte des rencontres : une case par compétition et par mois ; une mise à jour la change.
  assert.deepEqual(F.casesChangees({ cases: { 'L1|2026-10': [3, 10] } }, { cases: { 'L1|2026-10': [3, 10], 'L2|2026-09': [1, 4] } }), [{ league: 'L2', mois: '2026-09' }]);
  assert.deepEqual(F.casesChangees({ cases: { 'L1|2026-10': [3, 10] } }, { cases: {} }), [{ league: 'L1', mois: '2026-10' }]);
});

test('banc sur trois saisons fabriquées (20 clubs, forces connues) : les poids et les liens appris sur P4a SEULEMENT (2024-25 : 320 matchs à au moins 6 matchs dans la saison), la preuve jugée sur P3 SEULEMENT (2023-01 → 2024-06), rien après ; la veille de chaque match sans lui ; une réponse rendue', () => {
  const u = generateur(2929);
  const force = (c) => (c - 210.5) / 10; // de −0,95 à +0,95
  const clubs = Array.from({ length: 20 }, (_, i) => 201 + i);
  const poisson = (l) => {
    let k = 0;
    let p = Math.exp(-l);
    let s = p;
    const x = u();
    while (x > s && k < 15) {
      k++;
      p *= l / k;
      s += p;
    }
    return k;
  };
  // Le calendrier en cercle : chaque journée, chaque club joue une fois.
  const journees = (aller) => {
    const t = [...clubs];
    const out = [];
    for (let r = 0; r < t.length - 1; r++) {
      const j = [];
      for (let i = 0; i < t.length / 2; i++) j.push(aller === (r % 2 === 0) ? [t[i], t[t.length - 1 - i]] : [t[t.length - 1 - i], t[i]]);
      out.push(j);
      t.splice(1, 0, t.pop());
    }
    return out;
  };
  const rencontres = [];
  const lignesDb = [];
  const saisons = [
    { debut: '2023-01-07', tours: journees(true) }, // la fin de 2022-23 : la moitié d'une saison
    { debut: '2023-08-12', tours: [...journees(true), ...journees(false)] },
    { debut: '2024-08-10', tours: [...journees(true), ...journees(false)] }
  ];
  for (const s of saisons) {
    s.tours.forEach((tour, r) => {
      const date = new Date(Date.parse(`${s.debut}T00:00:00Z`) + r * 7 * 86_400_000).toISOString().slice(0, 10);
      for (const [h, a] of tour) {
        const xh = Math.max(0.1, 1.4 + 0.5 * (force(h) - force(a)) + (u() - 0.5) * 0.4);
        const xa = Math.max(0.1, 1.1 + 0.5 * (force(a) - force(h)) + (u() - 0.5) * 0.4);
        const bh = poisson(xh);
        const ba = poisson(xa);
        const th = Math.max(1, Math.round(12 + 4 * (force(h) - force(a)) + (u() - 0.5) * 4));
        const ta = Math.max(1, Math.round(10 + 4 * (force(a) - force(h)) + (u() - 0.5) * 4));
        const ph = Math.round(52 + 8 * (force(h) - force(a)));
        const cle = `${date}-${h}-${a}`;
        rencontres.push({ jour: F.numeroDuJour(date), cle, league: 'EPL', coupe: false, compte: true, attribue: false, prolongation: false, dom: h, ext: a, valeurs: { xg: [xh, xa], tirs: [th, ta], cadres: [Math.round(th * 0.35), Math.round(ta * 0.35)], occasions: [Math.round(xh * 1.2), Math.round(xa * 1.2)], buts: [bh, ba], corners: [Math.round(th / 2.5), Math.round(ta / 2.5)], possession: [ph, 100 - ph] } });
        lignesDb.push({ match_key: cle, date, league: 'EPL', home_id: `fotmob-${h}`, away_id: `fotmob-${a}`, hg: bh, ag: ba, meta: '{}', shotmap: null, xh, xa });
      }
    });
  }
  rencontres.sort((x, y) => x.jour - y.jour || (x.cle < y.cle ? -1 : 1));
  // Une base FACTICE pour les classements de la veille (le magasin : une ligne par match).
  const base = { prepare: () => ({ iterate: () => lignesDb[Symbol.iterator](), all: () => lignesDb, get: () => null }) };
  const gen = B.mesurerAuBanc({ database: base, rencontres, declarer: false, tirages: 200 });
  let e = gen.next();
  while (!e.done) e = gen.next();
  const r = e.value;
  assert.equal(r.jugements.length, 14);
  // Le lien du classement corrigé xG : appris sur les 320 matchs de 2024-25 où les deux clubs ont déjà 6 matchs.
  assert.equal(r.liens.xg.n, 320, 'appris sur P4a seulement');
  assert.equal(r.liens.reel.n, 320);
  assert.ok(r.poids['indice-v1'].xg.n > 250 && r.poids['indice-v1'].xg.n <= 380, `poids appris sur P4a : ${r.poids['indice-v1'].xg.n}`);
  for (const j of r.jugements) {
    if (j.preuve && j.id === 'v1-reel-sans-xg') assert.equal(j.n, 0, 'tous les clubs ont leurs xG : aucune ligne du repli');
    else if (j.preuve) {
      assert.ok(j.n > 200, `${j.id} : ${j.n} matchs de P3`);
      assert.ok(j.fenetre.de >= '2023-01-01' && j.fenetre.a <= '2024-06-30', `${j.id} : jugé du ${j.fenetre.de} au ${j.fenetre.a}`);
    } else assert.equal(j.n, 0, `${j.id} : rien après 2025-07-01`);
  }
  assert.ok(['retenu', 'pas-prouve', 'moins-bon'].includes(r.reponse.verdict));
  assert.equal(r.variantes.K, 7);
});

// ------------------------------------------------------------ 8. la nuit, la lecture, la route (copie isolée)

let nuit = null;
function laNuit() {
  if (nuit) return nuit;
  const copie = preparerCopie({});
  try {
    // Les scripts du serveur avec : l'actualisation (dont l'étape est essayée ici) en importe.
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: ['nuit'], timeout: 240_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `sortie illisible : ${r.sortie.slice(-500)}`);
    nuit = r.json;
    return nuit;
  } finally {
    copie.nettoyer();
  }
}

test('la nuit : l’étape « indiceForce » après « connaitreMarche » et avant le gel ; premier calcul complet (processus à part) ; « rien » sans rien écrire ; une rencontre modifiée → seul son championnat rejoué, à partir du 1er du mois, et EXACTEMENT les lignes d’un calcul complet ; une rencontre retirée → ses lignes retirées ; table du jour J pas à jour → rien ; un échec n’écrit rien', () => {
  const n = laNuit();
  const i = n.etapes.indexOf('indiceForce');
  assert.equal(n.etapes[i - 1], 'connaitreMarche');
  // Étape 27 (21/10/2026) : les forces de buts juste après, toujours avant le gel.
  assert.equal(n.etapes[i + 1], 'forcesButs');
  // Étape 30 (22/10/2026) : les fiches des joueurs juste après les forces, toujours avant le gel.
  assert.equal(n.etapes[i + 2], 'fichesJoueurs');
  // Étape 37 (22/10/2026) : les styles de jeu juste après les fiches, toujours avant le gel.
  assert.equal(n.etapes[i + 3], 'stylesDeJeu');
  assert.equal(n.etapes[i + 4], 'gelPronostics');
  assert.ok(n.etapes.indexOf('tableJourJ') < i && n.etapes.indexOf('sauvegarde') > i);
  assert.equal(n.etapes.filter((k) => k === 'indiceForce').length, 1);
  assert.deepEqual(n.dueAvant, { jamais: true, aujourdhui: true });
  // Le premier calcul.
  assert.equal(n.premier.details.mode, 'premier');
  assert.equal(n.premier.status, 'ok');
  // Les nombres de fr-FR séparent les milliers par une espace fine insécable (U+202F) : \s la couvre.
  assert.match(n.premier.summary, /^Premier calcul : \d+ championnats, [\d\s]+ lignes écrites \([\d\s]+ lignes actuelles\), 0 retirée en .* \(rejeu à part .*, \d+ Mo chez lui ; rangement .*, le serveur jamais tenu plus de \d+ ms d'affilée\) ; [\d\s]+ rencontres utilisées, .*\. Proposé seulement : le moteur ne lit pas l’indice\.$/u);
  assert.ok(n.premier.lignes > 1000, `${n.premier.lignes} lignes`);
  assert.equal(n.premier.lignes, n.comptes.premier.lignes, 'les lignes écrites sont dans la table');
  assert.deepEqual(n.due, { aujourdhui: false, hier: true, clic: true, autresReglages: true, enCours: true });
  // Rien de neuf : rien écrit, la base identique.
  assert.equal(n.rien.details.mode, 'rien');
  assert.match(n.rien.summary, /^Rien à refaire : aucune rencontre de la table du jour J n’a bougé/);
  assert.equal(n.rienEcritures, 0);
  // Une rencontre modifiée : son championnat, à partir du 1er de son mois ; le reste intact ; = calcul complet.
  assert.equal(n.modifiee.details.mode, 'nuit');
  assert.deepEqual(Object.keys(n.modifiee.details.portee), [n.modifiee.league]);
  assert.equal(n.modifiee.details.portee[n.modifiee.league], `${n.modifiee.mois}-01`);
  assert.match(n.modifiee.summary, /^1 championnat rejoué \(/);
  assert.ok(n.modifiee.lignesChangees > 0, 'des lignes changent');
  assert.equal(n.modifiee.autresChampionnatsIdentiques, true, 'les autres championnats : pas une ligne touchée');
  assert.equal(n.modifiee.avantLeMoisIdentiques, true, 'avant le 1er du mois : pas une ligne touchée');
  assert.equal(n.modifiee.actuellePerimeeRetiree, true, 'la ligne actuelle d’un club qui n’est plus du championnat est retirée');
  assert.equal(n.nuitEgaleComplet, true, 'la nuit rend exactement les lignes d’un calcul complet');
  // Le chargement depuis la table du jour J : une rencontre par rencontre du registre, rangées, la possession des deux camps.
  assert.equal(n.chargement.rencontres, n.chargement.registre);
  assert.equal(n.chargement.rangees, true);
  assert.deepEqual(n.chargement.possession, n.chargement.camps);
  // Une rencontre retirée : ses deux lignes du jour disparaissent (aucun autre match ce jour-là pour ses clubs).
  assert.deepEqual(n.retiree.avant, 6);
  assert.deepEqual(n.retiree.apres, 0);
  assert.equal(n.retireeEgaleComplet, true);
  // La table du jour J pas à jour : l'étape attend, rien d'écrit.
  assert.equal(n.tablePasAJour.status, 'warn');
  assert.match(n.tablePasAJour.summary, /^La table du jour J n’est pas à jour \(passe interrompue\) : l’indice de force n’est pas recalculé/);
  assert.equal(n.tablePasAJourEcritures, 0);
  // Un échec du calcul à part : rien d'écrit, l'indice précédent reste lu.
  assert.equal(n.echec.status, 'error');
  assert.match(n.echec.summary, /^En échec : .* rien d’avancé, l’indice précédent reste lu/);
  assert.equal(n.echecEcritures, 0);
  assert.equal(n.apresEchecLu, true);
});

test('la lecture pour 31, 27 et 30 et la route GET /api/match-stats/team-strength : jamais calculé → « jamais » ; un championnat rangé par note ; un club aux trois lieux, avec ses points forts (≥ 75) et faibles (≤ 25) ; « avant ce jour » sans jamais une ligne d’après ; l’historique ; les HOMONYMES par identifiant ; 400 sur un nom, un lieu ou un jour illisible ; rien n’est écrit', () => {
  const n = laNuit();
  assert.equal(n.routeJamais.code, 200);
  assert.equal(n.routeJamais.corps.etat, 'jamais');
  assert.equal(n.routeJamais.corps.lecture, null);
  const r = n.routes;
  assert.equal(r.etat.corps.etat, 'a-jour');
  assert.ok(r.etat.corps.lecture.championnats.length >= 3);
  // Un championnat : ses clubs, rangés par note, chacun avec sa formule et ses percentiles.
  const L = r.ligue.corps.lecture;
  assert.ok(L.clubs.length >= 6);
  for (let k = 1; k < L.clubs.length; k++) assert.ok((L.clubs[k - 1].force ?? -Infinity) >= (L.clubs[k].force ?? -Infinity), 'rangés par note');
  assert.ok(L.clubs.every((c) => c.actuel && c.lieu === 'tous' && c.championnat === L.championnat));
  assert.ok(L.clubs.some((c) => c.pointsForts.length) && L.clubs.some((c) => c.pointsFaibles.length));
  for (const c of L.clubs) {
    for (const p of c.pointsForts) assert.ok(p.percentile >= 75);
    for (const p of c.pointsFaibles) assert.ok(p.percentile <= 25);
  }
  // Un club : trois lieux, et son historique (la note dans le temps, du plus ancien au plus récent).
  const club = r.club.corps.lecture;
  assert.deepEqual(Object.keys(club.lignes), ['tous', 'dom', 'ext']);
  assert.ok(club.lignes.tous && club.lignes.dom && club.lignes.ext);
  assert.ok(club.historique.length >= 3);
  assert.ok(club.historique.every((h, k) => k === 0 || h.jour >= club.historique[k - 1].jour));
  assert.equal(club.historique.at(-1).actuel, true);
  // « Avant ce jour » : la ligne du jour s'il a joué, sinon la dernière d'avant — jamais une d'après.
  assert.equal(r.avantJour.corps.lecture.lignes.tous.jour, n.jourDeMatch);
  assert.ok(r.avantJourSansMatch.corps.lecture.lignes.tous.jour < n.jourSansMatch, 'un jour sans match : la dernière ligne d’avant');
  // Les homonymes : deux clubs nommés pareil, deux identifiants, deux lignes à eux.
  assert.equal(n.homonymes.nom1, n.homonymes.nom2);
  assert.notEqual(n.homonymes.club1, n.homonymes.club2);
  assert.notEqual(n.homonymes.championnat1, n.homonymes.championnat2);
  assert.equal(n.homonymes.lu1, n.homonymes.club1);
  assert.equal(n.homonymes.lu2, n.homonymes.club2);
  // Les refus.
  for (const k of ['nom', 'lieu', 'jour']) assert.equal(r.refus[k].code, 400, k);
  assert.equal(n.routesEcritures, 0, 'la route n’écrit rien');
});

test('le banc sur la copie : les variantes comptées (4, celles du lancement de 29 au code) avant de juger, K = 7 comparaisons ; la veille de chaque match sans le match lui-même ; la forme du résumé', () => {
  const n = laNuit();
  const b = n.banc;
  assert.equal(b.variantes.auRegistre, 4);
  assert.equal(b.variantes.K, 7);
  // Depuis le 19/10, les quatre variantes sont celles du lancement de 29 dans le CODE : rien à redéclarer au registre d'essai.
  assert.deepEqual(B.LANCEMENT.variantes.map((v) => v.id), B.VARIANTES_INDICE.map((v) => v.id));
  assert.deepEqual([b.registre.existe, b.registre.ids], [false, []]);
  assert.equal(b.jugements, 14, 'sept comparaisons, P3 et P4b + P5');
  assert.equal(b.fenetresDansLaPeriode, true, `chaque jugement dans sa période : ${b.lignesJugees.join(', ')}`);
  assert.ok(['retenu', 'pas-prouve', 'moins-bon', 'pas-assez-de-matchs'].includes(b.principal));
  // La veille : le premier match de la saison d'un club n'a rien derrière lui.
  assert.deepEqual(b.premierMatch, { nDom: 0, nExt: 0 });
  assert.equal(b.veilleSansLeMatch, true);
});
