/**
 * LA COMBINAISON, LA CONFIANCE ET LE SEUIL — les formules et les règles (étape 38, lot 1a, 03-04/11/2026), sur des
 * valeurs et des mondes FABRIQUÉS (aucun résultat réel : le banc ne lit son passage qu'une fois, au temps 2).
 *   node --test test/combinaisonRegles.test.mjs        (depuis server/)
 *
 * T-M1  E1 à β = 0 rend P_M À L'OCTET (une copie, sans renormaliser), avec un ou deux signaux ;
 * T-M2  E1 à trois issues renormalisé ; en binaire, la forme ℓ(P) = ℓ(P_M) + Σ β (ℓ(P_k) − ℓ(P_M)) ;
 * T-M3  Cox : l'identité à (0, 1) ; α et β plantés retrouvés ;
 * T-M4  les dixièmes : 20 lignes fictives (peu de données → presque l'identité), MONOTONES même sur une bosse, ramenés vers
 *       une table de référence quand on la donne ; le recalage est croissant ;
 * T-M5  Newton à a priori : un β planté retrouvé sur beaucoup de matchs ; rétréci vers 0 sur peu ; β appris ENSEMBLE ;
 *       le β sans a priori rapporté ; le recalage du marché (E2) retrouve α et β plantés ;
 * T-C1  l'étiquette : « fragile » à un degré 2 ou à une somme ≥ 2, « sur » sinon (jamais « sûr ») ;
 * T-C2  aucun ingrédient ne lit `probability` ni `distribution` (lecture statique, commentaires ôtés) ;
 * T-C3  « ce qui manque » : phrase, provenance, heure ; la fraîcheur en EXPLICATION seulement (degré null) ;
 * T-C4  un contrôle hors vigueur (absent) → « inconnu », degré 0 ;
 * T-C8  une classe corrélée à l'ORIGINE (0,9 / 0,05), sans aucun effet : jugée DANS chaque origine, jamais « retenu » sur
 *       50 graines ; jugée sans la strate (le bug n° 49), « retenu » le plus souvent (critique, constat 1) ;
 * T-S1  configSousRegle : une copie avec SON seuil ; repli et sans cote → null ;
 * T-S2  à 2 % partout = la décision de stakingDuMatch (200 matchs fabriqués) ;
 * T-S3  « aucune value » (dispersé, accord-disperse-aucune) ;
 * T-S4  le placebo permuté garde, dans chaque journée, les mêmes étiquettes ; il est déterministe ;
 * T-S7  la règle de fraîcheur de Pierre (60 min, avant compos) refuse un relevé de 61 min à la coupure (l'ombre, lot 1c) ;
 * T-B17 les emboîtées : 1 % et 1,5 % retenus → 1,5 % (la plus proche de la règle en service).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR } from './aides/isolement.mjs';
import { generateur, mondeP5, decisionsFabriquees } from './aides/combinaisonMondes.mjs';
import * as F from '../src/data/combinaison/formulesDeLaCombinaison.js';
import * as C from '../src/data/combinaison/reglesDeConfiance.js';
import * as S from '../src/data/combinaison/reglesDeSeuil.js';
import { ingredientsDe, palierDesReleves } from '../src/data/combinaison/ingredientsDUneLigne.js';
import { varianteConfianceParOrigine, jugeDUneClasse, juger, decisionSousRegle } from '../src/data/combinaison/bancDeLaCombinaison.js';
import { decisionsDuMatch, permuterLaCoteHaute, TILT_NEUTRE } from '../src/data/combinaison/bancFd.js';
import { CONFIG_DE_LA_REGLE, REGLE_DE_CONFIANCE, DECISIONS_DE_PIERRE } from '../src/data/combinaison/reglagesCombinaison.js';
import { stakingDuMatch, referenceDuMatch } from '../src/core/engine/verdictPari.js';
import { fraicheurCote } from '../src/core/engine/fraicheurCotes.js';
import { TILT_NEUTRE as TILT_DU_BANC } from '../src/bench/entrees.js';

const SRC = path.join(SERVEUR, 'src');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const normale = (u) => Math.sqrt(-2 * Math.log(Math.max(1e-12, u()))) * Math.cos(2 * Math.PI * u());
const softmax = (l) => {
  const m = Math.max(...l);
  const e = l.map((x) => Math.exp(x - m));
  const t = e.reduce((s, x) => s + x, 0);
  return e.map((x) => x / t);
};

test('T-M1 E1 à β = 0 rend P_M à l’octet (une copie, jamais renormalisée)', () => {
  const pM = [0.4123456789, 0.2876543211, 0.3];
  const r = F.melangerEnLogCotes(pM, [[0.5, 0.2, 0.3], [0.1, 0.1, 0.8]], [0, 0]);
  assert.deepEqual(r, pM);
  assert.notEqual(r, pM, 'une copie');
  for (let i = 0; i < 3; i++) assert.ok(Object.is(r[i], pM[i]));
  assert.deepEqual(F.melangerEnLogCotes([0.37, 0.63], [], []), [0.37, 0.63]);
  assert.throws(() => F.melangerEnLogCotes(pM, [[0.3, 0.3, 0.4]], []), /un β par signal/);
});

test('T-M2 E1 renormalisé à trois issues ; en binaire, la forme en log-cotes', () => {
  const pM = [0.5, 0.3, 0.2];
  const r = F.melangerEnLogCotes(pM, [[0.6, 0.25, 0.15]], [0.4]);
  assert.ok(Math.abs(r.reduce((s, x) => s + x, 0) - 1) < 1e-12);
  const brut = pM.map((p, i) => p * ([0.6, 0.25, 0.15][i] / p) ** 0.4);
  const t = brut.reduce((s, x) => s + x, 0);
  r.forEach((x, i) => assert.ok(Math.abs(x - brut[i] / t) < 1e-12));
  const b = F.melangerEnLogCotes([0.62, 0.38], [[0.7, 0.3], [0.55, 0.45]], [0.3, -0.2]);
  const attendu = F.sigmoide(F.logit(0.62) + 0.3 * (F.logit(0.7) - F.logit(0.62)) - 0.2 * (F.logit(0.55) - F.logit(0.62)));
  assert.ok(Math.abs(b[0] - attendu) < 1e-12);
});

test('T-M3 Cox : identité à (0, 1) ; α et β plantés retrouvés', () => {
  for (const p of [0.03, 0.4, 0.97]) assert.ok(Math.abs(F.recalerParCox(p, { alpha: 0, beta: 1 }) - p) < 1e-12);
  const u = generateur(3);
  const pts = [];
  for (let i = 0; i < 40000; i++) {
    const p = 0.05 + 0.9 * u();
    const vrai = F.sigmoide(0.2 + 0.8 * F.logit(p));
    pts.push({ p, y: u() < vrai ? 1 : 0 });
  }
  const c = F.apprendreCox(pts);
  assert.ok(Math.abs(c.alpha - 0.2) < 0.05, JSON.stringify(c));
  assert.ok(Math.abs(c.beta - 0.8) < 0.05, JSON.stringify(c));
});

test('T-M4 les dixièmes : 20 lignes fictives, monotones, ramenés vers une référence ; le recalage croît', () => {
  const peu = F.tableDesDixiemes([{ p: 0.45, y: 1 }, { p: 0.46, y: 1 }]);
  assert.equal(peu.centres.length, 1);
  assert.ok(Math.abs(peu.frequences[0] - (2 + 20 * 0.455) / 22) < 1e-12, 'Σy + 20 × centre');
  // Une bosse : les fréquences en désordre sont regroupées (monotones).
  const pts = [];
  for (let k = 0; k < 10; k++) for (let i = 0; i < 400; i++) pts.push({ p: (k + 0.5) / 10, y: (k === 4 ? 0.9 : k === 5 ? 0.2 : (k + 0.5) / 10) > (i % 100) / 100 ? 1 : 0 });
  const t = F.tableDesDixiemes(pts);
  for (let i = 1; i < t.frequences.length; i++) assert.ok(t.frequences[i] >= t.frequences[i - 1] - 1e-12, `monotone : ${t.frequences}`);
  let avant = -1;
  for (let p = 0.001; p < 1; p += 0.007) {
    const r = F.recalerParDixiemes(p, t);
    assert.ok(r >= avant - 1e-12, `croissant en ${p}`);
    avant = r;
  }
  // Vers une référence : sans données propres, la table rend la référence au centre.
  const ref = { centres: [0.2, 0.8], frequences: [0.1, 0.9] };
  const v = F.tableDesDixiemes([{ p: 0.2, y: 0.1 }], { vers: ref });
  assert.ok(Math.abs(v.frequences[0] - 0.1) < 1e-12);
});

test('T-M5 Newton à a priori : β planté retrouvé, rétréci sur peu de matchs, appris ensemble ; E2 retrouve α et β', () => {
  const u = generateur(5);
  const monde = (n, beta) => {
    const obs = [];
    for (let i = 0; i < n; i++) {
      const pM = softmax([0.3 + normale(u) * 0.8, 0, -0.2 + normale(u) * 0.3]);
      const s = softmax(pM.map((p) => Math.log(p) + 0.6 * normale(u)));
      const vrai = F.melangerEnLogCotes(pM, [s], [beta]);
      const r = u();
      obs.push({ pM, signaux: [s], y: r < vrai[0] ? 0 : r < vrai[0] + vrai[1] ? 1 : 2 });
    }
    return obs;
  };
  const gros = F.apprendreLesBetas(monde(40000, 0.3));
  assert.ok(Math.abs(gros.betas[0] - 0.3) < 0.05, JSON.stringify(gros));
  assert.ok(gros.converge);
  const petit = monde(60, 0.3);
  const p = F.apprendreLesBetas(petit, { sigma0: 0.25 });
  assert.ok(Math.abs(p.betas[0]) < Math.abs(p.sansAPriori[0]), 'rétréci vers 0 sur peu de matchs');
  // Deux signaux appris ENSEMBLE : un signal en double partage le poids (jamais deux fois le même).
  const double = monde(30000, 0.3).map((o) => ({ ...o, signaux: [o.signaux[0], o.signaux[0]] }));
  const d = F.apprendreLesBetas(double);
  assert.ok(Math.abs(d.betas[0] + d.betas[1] - 0.3) < 0.06, JSON.stringify(d.betas));
  // E2 binaire : α = 0,1, β = 0,9 plantés.
  const e2 = [];
  for (let i = 0; i < 40000; i++) {
    const m = 0.15 + 0.7 * u();
    e2.push({ pM: [m, 1 - m], y: u() < F.sigmoide(0.1 + 0.9 * F.logit(m)) ? 0 : 1 });
  }
  const r = F.apprendreLeRecalageDuMarche(e2);
  assert.ok(Math.abs(r.alpha - 0.1) < 0.05 && Math.abs(r.beta - 0.9) < 0.06, JSON.stringify(r));
  const sansEcart = F.apprendreLeRecalageDuMarche(e2.map((o) => ({ ...o, pM: [o.pM[0], o.pM[1], 0].slice(0, 2) })));
  assert.ok(sansEcart.converge);
});

test('T-C1 l’étiquette : « fragile » à un degré 2 ou à une somme ≥ 2 ; « sur » sinon', () => {
  assert.equal(C.etiquetteDe({ A: 2, C: 0, D: null, E: 0, F: 0, G: 0 }), 'fragile');
  assert.equal(C.etiquetteDe({ A: 1, C: 1, D: null, E: 0, F: 0, G: 0 }), 'fragile');
  assert.equal(C.etiquetteDe({ A: 1, C: 0, D: 0, E: 0, F: 0, G: 0 }), 'sur');
  assert.equal(C.etiquetteDe({ A: 0, C: null, D: null, E: 0, F: 0, G: 0 }), 'sur');
  assert.equal(REGLE_DE_CONFIANCE.fragileSiSomme, 2);
  // Par famille : le 1N2 ne lit ni la compo ni la couverture ; un 1N2 ancré sur un prix a C = 0 forcé.
  const d = C.degresDUneLigne({ ancre: 'pinnacle', compo: 'pas-publiee', nMin: 2, aVerifier: { etat: 'rien' }, ancreSurUnPrix: true }, '1n2');
  assert.deepEqual(d, { A: 0, C: null, D: null, E: 0, F: 0, G: 0 });
  const b = C.degresDUneLigne({ ancre: 'repli', compo: 'pas-publiee', nMin: 2, aVerifier: { etat: 'constat-rouge' } }, 'buts');
  assert.deepEqual(b, { A: 2, C: 1, D: 1, E: 2, F: 0, G: 0 });
  for (const f of ['reglesDeConfiance.js', 'reglagesCombinaison.js', 'ingredientsDUneLigne.js']) assert.doesNotMatch(sansCommentaires(path.join(SRC, 'data', 'combinaison', f)), /sûr/, `${f} n’écrit jamais « sûr »`);
});

test('T-C2 aucun ingrédient ne lit `probability` ni `distribution` (lecture statique)', () => {
  for (const f of ['reglesDeConfiance.js', 'ingredientsDUneLigne.js', 'reglesDeSeuil.js']) {
    const code = sansCommentaires(path.join(SRC, 'data', 'combinaison', f));
    assert.doesNotMatch(code, /probability|distribution/, f);
  }
  // L'ingrédient F reçoit le VERDICT de sa case, jamais le pourcentage.
  assert.equal(C.degreDeF('trop-haut'), 2);
  assert.equal(C.degreDeF(0.62), 0);
});

test('T-C3 « ce qui manque » : phrase, provenance, heure ; la fraîcheur en explication seulement', () => {
  const ing = { ancre: 'repli', ancreDetail: { lignes: 4, releveA: '2026-11-02T22:12:00Z', source: 'cotes gratuites' }, compo: 'pas-publiee', compoA: null, fraicheur: { ageMinutes: 26 * 60, releveA: '2026-11-02T22:12:00Z' }, aVerifier: { etat: 'rien' } };
  const d = C.degresDUneLigne(ing, 'buts');
  const m = C.manquesDe(d, ing);
  assert.match(m[0].phrase, /ni de Pinnacle ni du palier 2/);
  assert.match(m[0].phrase, /moyenne de 4 lignes, relevé le 02\/11 à 23 h 12/);
  assert.equal(m.find((x) => x.code === 'C').phrase, 'composition pas encore publiée');
  const b = m.find((x) => x.code === 'B');
  assert.equal(b.degre, null, 'B : une explication, jamais un degré');
  assert.equal(b.phrase, 'cotes relevées il y a 26 h');
  assert.deepEqual(C.manquesDe({ A: 0, C: 0, D: 0, E: 0, F: 0, G: 0 }, { ancre: 'pinnacle' }), []);
});

test('T-C4 un contrôle absent ou hors vigueur → « inconnu », degré 0 (compté, hors variante)', () => {
  const i = ingredientsDe({ ligne: { market_id: 'result', origin: 'nuit', odds_source: 'cotes gratuites : espn', odds_at: '2026-10-10T08:00:00Z', recorded_at: '2026-10-10T09:00:00Z', lineup_state: 'inconnue (non relue)' }, controle: null });
  assert.equal(i.aVerifier.etat, 'inconnu');
  assert.equal(C.degreDeE(i.aVerifier.etat), 0);
  assert.equal(i.ancre, 'repli');
  assert.equal(i.palierReconstruit, true);
});

test('T-C8 une classe corrélée à l’origine, sans effet : jugée DANS chaque origine → jamais « retenu » (50 graines) ; sans la strate → « retenu »', () => {
  let retenusAvec = 0;
  let retenusSans = 0;
  let jugees = 0;
  for (let g = 1; g <= 50; g++) {
    const L = mondeP5({ graine: 1000 + g, nNuit: 7000, nCoup: 3400 });
    const v = varianteConfianceParOrigine('confiance-v1', L, (l) => l.classe, { tirages: 200 });
    // Chaque strate ne juge que SES lignes (les deux plis de son origine) : jamais les lignes de l'autre origine.
    for (const o of ['nuit', 'coup-d-envoi']) if (v.strates[o].lignes !== undefined) assert.equal(v.strates[o].lignes, L.filter((l) => l.origine === o && l.q).length, `strate ${o}`);
    for (const s of Object.values(v.strates)) {
      if (s.verdict !== 'non-jugeable-ici') jugees++;
      if (s.verdict === 'retenu') retenusAvec++;
    }
    // Le bug n° 49 : la classe jugée sans l'origine (les deux bras ignorent l'origine).
    const tous = L.map((l) => ({ cle: l.cle, p: l.p, q: l.q, c: l.classe, pli: F.fnv1a(l.cle) % 2 }));
    const lignes = [];
    for (const pli of [0, 1]) lignes.push(...(jugeDUneClasse({ apprendre: tous.filter((l) => l.pli !== pli), juger: tous.filter((l) => l.pli === pli), minoritaire: 0 }).lignes ?? []));
    if (juger(lignes, { sens: 'min', graine: 38, tirages: 200 }).verdict === 'retenu') retenusSans++;
  }
  assert.ok(jugees >= 60, `${jugees} strates jugées (la classe minoritaire a 300 lignes)`);
  assert.ok(retenusAvec <= Math.ceil(0.05 * jugees), `${retenusAvec} « retenu » avec la strate sur ${jugees}`);
  assert.ok(retenusSans >= 40, `sans la strate : ${retenusSans} « retenu » sur 50 (le piège du constat 1)`);
});

test('T-S1 configSousRegle : une copie avec son seuil ; repli et sans cote → aucune value', () => {
  const classe = S.classeDeSeuil({ ancre: 'pinnacle', accord: 0.01 });
  const c = S.configSousRegle(CONFIG_DE_LA_REGLE, classe, 'pinnacle-1-5pc');
  assert.equal(c.edgeThresholdMin, 0.015);
  assert.notEqual(c.valueBookmakers, CONFIG_DE_LA_REGLE.valueBookmakers);
  assert.equal(CONFIG_DE_LA_REGLE.edgeThresholdMin, 0.02, 'la règle d’origine intacte');
  assert.equal(S.configSousRegle(CONFIG_DE_LA_REGLE, S.classeDeSeuil({ ancre: 'repli' }), 'seuil-v1'), null);
  assert.equal(S.configSousRegle(CONFIG_DE_LA_REGLE, S.classeDeSeuil({ ancre: 'sans-cote' }), 'pinnacle-1pc'), null);
  assert.equal(S.seuilDe(S.classeDeSeuil({ ancre: 'palier3' }), 'palier3-aucune'), null);
  assert.equal(S.seuilDe(S.classeDeSeuil({ ancre: 'pinnacle', livre: 'betclic_fr' }), 'francais-aucune'), null);
  assert.equal(S.classeDeSeuil({ livre: 'unibet_fr' }).livre, 'francais');
  assert.throws(() => S.seuilDe(classe, 'seuil-optimal'), /non déclarée/);
});

test('T-S2 à 2 % partout = la décision de stakingDuMatch (200 matchs fabriqués) ; le coupe-circuit neutre est celui du banc', () => {
  assert.deepEqual(TILT_NEUTRE, TILT_DU_BANC);
  const u = generateur(9);
  for (let i = 0; i < 200; i++) {
    const fair = softmax([0.3 + normale(u), 0, -0.2 + normale(u) * 0.5]);
    const livre = (k, m) => ({ key: k, title: k, odds1: (1 / (fair[0] * m)) * Math.exp(0.05 * normale(u)), oddsDraw: (1 / (fair[1] * m)) * Math.exp(0.05 * normale(u)), odds2: (1 / (fair[2] * m)) * Math.exp(0.05 * normale(u)) });
    const by = [livre('pinnacle', 1.025), livre('williamhill', 1.06), { ...livre('fd_moyenne', 1.05), referenceOnly: true }];
    const prix = { odds1: by[2].odds1, oddsDraw: by[2].oddsDraw, odds2: by[2].odds2, byBookmaker: by };
    const match = { home: 'Domicile', away: 'Extérieur', marketOdds: prix, bankroll: 1000 };
    const ref = referenceDuMatch(match, CONFIG_DE_LA_REGLE);
    const direct = stakingDuMatch(match, ref, { ...CONFIG_DE_LA_REGLE }, TILT_NEUTRE);
    const { dec } = decisionsDuMatch(prix, ref.reference);
    if (direct.action === 'RECOMMENDED') assert.deepEqual([dec[0.02].o, dec[0.02].c], [['home', 'draw', 'away'].indexOf(direct.outcome), direct.odds]);
    else assert.equal(dec[0.02], null);
    // La règle seuil-v1 lue par le banc = la décision du moteur à 2 % (Pinnacle).
    const ligne = { regime: 'r1', g: 0, coteHaute: false, coteHautePermutee: false, coteHautePermutee2: false, dec };
    assert.deepEqual(decisionSousRegle(ligne, 'seuil-v1'), dec[0.02]);
  }
});

test('T-S3 « aucune value » : un match dispersé sous accord-disperse-aucune ; 4 % sous accord-disperse-4pc', () => {
  const disperse = S.classeDeSeuil({ ancre: 'pinnacle', accord: 0.05 });
  assert.equal(disperse.accord, 'disperse');
  assert.equal(S.seuilDe(disperse, 'accord-disperse-aucune'), null);
  assert.equal(S.seuilDe(disperse, 'accord-disperse-4pc'), 0.04);
  assert.equal(S.seuilDe(S.classeDeSeuil({ ancre: 'pinnacle', accord: 0.01 }), 'accord-disperse-aucune'), 0.02);
});

test('T-S4 le placebo permuté : dans chaque journée, les mêmes étiquettes « cote haute », redistribuées entre les matchs qui ont un pari ; déterministe', () => {
  const u = generateur(4);
  const jour = (j) => Array.from({ length: 15 }, (_, i) => {
    const pari = u() < 0.6;
    return { cle: `${j}:${i}`, dec: { 0.02: pari ? { o: 0, c: 2 } : null }, coteHaute: pari && u() < 0.4, coteHautePermutee: false };
  });
  for (const j of ['2020-01-01', '2020-01-02', '2021-05-05']) {
    const a = jour(j);
    const b = a.map((x) => ({ ...x }));
    permuterLaCoteHaute(a, j);
    permuterLaCoteHaute(b, j);
    assert.deepEqual(a.map((x) => x.coteHautePermutee), b.map((x) => x.coteHautePermutee), 'déterministe');
    assert.equal(a.filter((x) => x.coteHautePermutee).length, a.filter((x) => x.coteHaute).length, 'mêmes étiquettes dans la journée');
    assert.ok(a.every((x) => x.dec[0.02] || !x.coteHautePermutee), 'seulement parmi les matchs qui ont un pari');
    assert.equal(a.filter((x) => x.coteHautePermutee2).length, a.filter((x) => x.coteHaute).length, 'la seconde permutation aussi');
    assert.deepEqual(a.map((x) => x.coteHautePermutee2), b.map((x) => x.coteHautePermutee2));
  }
});

test('T-S7 la fraîcheur réelle de Pierre (60 min, avant compos) refuse un relevé de 61 min à la coupure ; la décision de l’ombre suit findValueBetFraiche', () => {
  const coupDEnvoi = '2026-10-20T19:00:00.000Z';
  const coupure = Date.parse(coupDEnvoi) - 60 * 60_000;
  const reglage = { maxAgeMinutes: 60, avantCompos: true };
  const vieux = fraicheurCote({ releveAt: new Date(coupure - 61 * 60_000).toISOString(), maintenant: coupure, coupDEnvoi, heureSure: true, reglage });
  assert.equal(vieux.etat, 'a-rafraichir');
  assert.equal(vieux.code, 'trop-vieille');
  // À la coupure H−1, l'annonce des compos est atteinte : tout relevé d'AVANT elle est « à rafraîchir » (R24 : 0 « fraîche »).
  const jeune = fraicheurCote({ releveAt: new Date(coupure - 10 * 60_000).toISOString(), maintenant: coupure, coupDEnvoi, heureSure: true, reglage });
  assert.equal(jeune.etat, 'a-rafraichir');
  assert.equal(jeune.code, 'avant-compos');
  // Un match à la fraîcheur posée : la décision passe par findValueBetFraiche (stakingDuMatch), et refuse.
  const fair = [0.5, 0.27, 0.23];
  const by = [{ key: 'pinnacle', title: 'Pinnacle', odds1: 1.95, oddsDraw: 3.6, odds2: 4.2 }, { key: 'williamhill', title: 'WH', odds1: 2.3, oddsDraw: 3.4, odds2: 3.9 }];
  const match = { home: 'A', away: 'B', marketOdds: { odds1: 2, oddsDraw: 3.5, odds2: 4, byBookmaker: by }, bankroll: 1000, fraicheurCotes: { parBookmaker: { williamhill: { releveAt: new Date(coupure - 61 * 60_000).toISOString() } }, maintenant: coupure, coupDEnvoi, heureSure: true, reglage } };
  const ref = referenceDuMatch(match, CONFIG_DE_LA_REGLE);
  assert.ok(ref.reference && fair);
  const d = stakingDuMatch(match, ref, { ...CONFIG_DE_LA_REGLE }, TILT_NEUTRE);
  assert.notEqual(d.action, 'RECOMMENDED', JSON.stringify(d).slice(0, 300));
});

test('T-B17 les emboîtées : 1 % et 1,5 % retenus → 1,5 % ; « aucune value » est la plus loin', () => {
  assert.equal(S.choisirParmiLesEmboitees(['pinnacle-1pc', 'pinnacle-1-5pc']), 'pinnacle-1-5pc');
  assert.equal(S.choisirParmiLesEmboitees(['pinnacle-5pc', 'pinnacle-3pc']), 'pinnacle-3pc');
  assert.equal(S.choisirParmiLesEmboitees(['accord-disperse-aucune', 'accord-disperse-4pc'], { classe: 'disperse' }), 'accord-disperse-4pc');
  assert.equal(S.choisirParmiLesEmboitees([]), null);
  // Les décisions de Pierre : Q-H répondue (Unibet, Betclic), les autres au défaut prudent.
  assert.deepEqual([DECISIONS_DE_PIERRE.qA, DECISIONS_DE_PIERRE.qB, DECISIONS_DE_PIERRE.qC, DECISIONS_DE_PIERRE.qG], [null, null, null, null]);
  assert.deepEqual([...DECISIONS_DE_PIERRE.qH.livres], ['unibet_fr', 'betclic_fr']);
  // Un palier reconstruit : decisionsFabriquees (aide) suit la même règle que findValueBet.
  assert.equal(decisionsFabriquees([0.5, 0.3, 0.2], [2.2, 3.0, 4.0]).dec[0.02].o, 0);
  assert.equal(palierDesReleves([], '2026-10-10T00:00:00Z').ancre, 'repli');
});
