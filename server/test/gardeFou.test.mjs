/**
 * Le garde-fou de la mesure (étape 16 du plan) : le JUGE, les MESURES, l'ADAPTATEUR — pur, en mémoire.
 *   node --test test/gardeFou.test.mjs        (depuis server/)
 *
 * Tout tourne dans le processus du test : ni sous-processus, ni base, ni réseau, ni fichier écrit.
 * Les valeurs attendues sont recalculées à la main ici, jamais recopiées de la sortie du code testé.
 * Les matchs simulés viennent du générateur à graine : chaque passage rejoue exactement les mêmes.
 *
 * Données simulées (§ 10 de la conception) : pour chaque match, de vraies probabilités 1N2
 * p = normaliser([0,25 + 0,40·u₁, 0,20 + 0,15·u₂, 0,15 + 0,35·u₃]), une issue tirée selon p, et deux
 * versions pA, pB = p déformée en logit par un bruit normal (Box-Muller) d'écart-type σA, σB, renormalisée ;
 * une ligne { bloc: le match, a: perteLog(pA, issue), b: perteLog(pB, issue) }. Même σ des deux côtés :
 * rien n'a changé (hypothèse nulle). σB plus petit : B est vraiment meilleure.
 *
 *  1. Les mesures par ligne, calculées à la main ; l'écrêtage ; les valeurs absentes refusées.
 *  2. La loi normale et le z de la correction.
 *  3. Le CALIBRAGE sous l'hypothèse nulle (le critère « fini quand ») : 1 à 9 % de faux verdicts.
 *  4. La PUISSANCE : une vraie amélioration est retenue, une vraie dégradation est « moins bonne ».
 *  5. La CORRÉLATION (le piège n° 1 du plan) : trois lignes d'un même match tirées ensemble.
 *  6. La reproductibilité ; aucun hasard non semé, aucune base ni réseau dans src/bench.
 *  7. La correction pour le nombre de variantes (lignes déterministes, sans bruit).
 *  8. Le mode rendement (paris à mise fixe) et son calibrage.
 *  9. La validation et les cas limites.
 * 11. L'adaptateur des pronostics gelés (et le lecteur d'appoint, sur une fausse base qui répond).
 * (10, 12 et 13 : registreMesure.test.mjs ; 14 et 15 : preuveEcran.test.mjs.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { comparer, generateur, loiNormale, zPour, LignesInvalides } from '../src/bench/guard.js';
import { perteLog, perteLogBinaire, brier, rps, gainMiseFixe, valeurCloture, MESURES, PROBA_MIN } from '../src/bench/metrics.js';
import { apparierPronostics, resultatsDuMagasin, cleAppariement, blocParMatch, blocParJournee } from '../src/bench/lignesEnginePicks.js';

const proche = (x, attendu, tolerance, message) => assert.ok(Math.abs(x - attendu) <= tolerance, `${message ?? ''} : ${x} au lieu de ${attendu} (± ${tolerance})`);

// ------------------------------------------------------- les données simulées

const normaliser = (v) => {
  const s = v.reduce((x, y) => x + y, 0);
  return v.map((x) => x / s);
};

/** Un tirage reproductible : uniformes, normales (Box-Muller), un match, une déformation en logit. */
function hasard(graine) {
  const u = generateur(graine);
  const normale = () => {
    let x = 0;
    while (x === 0) x = u();
    return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u());
  };
  return {
    u,
    deformer: (p, sigma) => normaliser(p.map((x) => x * Math.exp(sigma * normale()))),
    match: () => {
      const p = normaliser([0.25 + 0.4 * u(), 0.2 + 0.15 * u(), 0.15 + 0.35 * u()]);
      const r = u();
      return { p, issue: r < p[0] ? 0 : r < p[0] + p[1] ? 1 : 2 };
    }
  };
}

/** Une ligne par match, perte log de chaque version. */
function simuler({ graine, matchs, sigmaA, sigmaB }) {
  const h = hasard(graine);
  const lignes = [];
  for (let i = 0; i < matchs; i++) {
    const { p, issue } = h.match();
    const pA = h.deformer(p, sigmaA);
    const pB = h.deformer(p, sigmaB);
    lignes.push({ bloc: `m${i}`, cle: `m${i}|1n2`, a: perteLog(pA, issue).valeur, b: perteLog(pB, issue).valeur });
  }
  return lignes;
}

const FAUX = (r) => r.verdict === 'retenu' || r.verdict === 'moins-bon';

// ------------------------------------------------------------- 1. les mesures

test('mesures : perte log, Brier et RPS calculés à la main ; écrêtage à 1e−6 ; gain à mise fixe ; valeur de clôture ; valeurs absentes refusées', () => {
  // p = [0,5 ; 0,3 ; 0,2], le nul s'est produit.
  const p = [0.5, 0.3, 0.2];
  proche(perteLog(p, 1).valeur, -Math.log(0.3), 1e-12, 'perte log = −ln 0,3');
  proche(perteLog(p, 1).valeur, 1.204, 1e-4, 'perte log ≈ 1,2040');
  assert.equal(perteLog(p, 1).ecretee, false);
  proche(brier(p, 1), 0.25 + 0.49 + 0.04, 1e-12, 'Brier = 0,25 + 0,49 + 0,04');
  proche(rps(p, 1), 0.5 * (0.5 ** 2 + (0.8 - 1) ** 2), 1e-12, 'RPS = ½[(0,5)² + (0,8 − 1)²]');
  proche(rps(p, 1), 0.145, 1e-12, 'RPS = 0,145');
  // Même chose avec les clés d'un 1N2.
  const o = { home: 0.5, draw: 0.3, away: 0.2 };
  assert.equal(perteLog(o, 'draw').valeur, perteLog(p, 1).valeur);
  assert.equal(brier(o, 'draw'), brier(p, 1));
  assert.equal(rps(o, 'draw'), rps(p, 1));
  // Le RPS compte la distance : domicile gagne, annoncer l'extérieur coûte plus qu'annoncer le nul.
  proche(rps([0.2, 0.3, 0.5], 0), 0.5 * (0.8 ** 2 + 0.5 ** 2), 1e-12, 'RPS, masse sur l’extérieur');
  proche(rps([0.2, 0.5, 0.3], 0), 0.5 * (0.8 ** 2 + 0.3 ** 2), 1e-12, 'RPS, masse sur le nul');
  assert.throws(() => rps({ yes: 0.6, no: 0.4 }, 'yes'), RangeError, 'l’ordre n’est connu que pour un 1N2');
  // Écrêtage : une probabilité nulle coûte −ln(1e−6) = 13,8155, et la ligne le dit.
  assert.equal(PROBA_MIN, 1e-6);
  const zero = perteLog([0, 0.6, 0.4], 0);
  proche(zero.valeur, 13.8155, 1e-4, 'écrêtée');
  assert.equal(zero.ecretee, true);
  assert.equal(perteLog([5e-7, 0.6, 0.4 - 5e-7], 0).ecretee, true);
  assert.equal(perteLog([2e-6, 0.6, 0.4 - 2e-6], 0).ecretee, false);
  // Perte log binaire d'une affirmation.
  proche(perteLogBinaire(0.55, true).valeur, -Math.log(0.55), 1e-12);
  proche(perteLogBinaire(0.55, false).valeur, -Math.log(0.45), 1e-12);
  assert.deepEqual(perteLogBinaire(1, false), { valeur: -Math.log(1e-6), ecretee: true });
  // Gain à mise fixe et valeur de clôture.
  proche(gainMiseFixe({ cote: 2.5, gagne: true }), 1.5, 1e-12);
  assert.equal(gainMiseFixe({ cote: 2.5, gagne: false }), -1);
  assert.equal(gainMiseFixe({ cote: 2.5, gagne: true, rembourse: true }), 0);
  proche(valeurCloture({ cotePrise: 2.1, probaCloture: 0.5 }), 0.05, 1e-12, '2,10 × 0,50 − 1');
  // Valeurs absentes : jamais Number(null) = 0.
  for (const mauvais of [null, undefined, NaN, Infinity, -0.1, 1.5, '0.3']) {
    assert.throws(() => perteLog([0.5, mauvais, 0.2], 0), RangeError, `perteLog avec ${String(mauvais)}`);
    assert.throws(() => perteLogBinaire(mauvais, true), RangeError, `perteLogBinaire avec ${String(mauvais)}`);
  }
  assert.throws(() => perteLog(p, 3), RangeError);
  assert.throws(() => perteLog(o, 'nul'), RangeError);
  assert.throws(() => perteLogBinaire(0.5, 1), TypeError);
  assert.throws(() => gainMiseFixe({ cote: null, gagne: true }), RangeError);
  assert.throws(() => gainMiseFixe({ cote: 2, gagne: null }), TypeError);
  assert.throws(() => valeurCloture({ cotePrise: 2, probaCloture: null }), RangeError);
  // La table des mesures : un seul juge par jugement, le sens écrit pour chacune.
  assert.deepEqual(Object.keys(MESURES), ['perte-log', 'perte-log-binaire', 'brier', 'rps', 'valeur-cloture', 'gain']);
  assert.deepEqual([MESURES['perte-log'].mode, MESURES['perte-log'].sens, MESURES['perte-log'].relatif], ['moyenne', 'min', true]);
  assert.deepEqual([MESURES['valeur-cloture'].sens, MESURES['valeur-cloture'].relatif], ['max', false]);
  assert.deepEqual([MESURES.gain.mode, MESURES.gain.relatif, MESURES.gain.quoi], ['rendement', false, 'par unité misée']);
  assert.equal(MESURES['perte-log'].quoi, 'de perte log en moins');
});

// ----------------------------------------------------------- 2. loi normale et z

test('loi normale et z : Φ(0), Φ(1,96), Φ(−1) ; z pour 1, 5, 10 et 50 variantes ; 0 variante compte pour 1', () => {
  const { phi, quantile } = loiNormale;
  proche(phi(0), 0.5, 1e-6, 'Φ(0)');
  proche(phi(1.96), 0.975, 2e-4, 'Φ(1,96)');
  proche(phi(-1), 0.1587, 2e-4, 'Φ(−1)');
  proche(phi(1) + phi(-1), 1, 1e-9, 'symétrie');
  // z(α) = Φ⁻¹(1 − α / 2) : les valeurs des tables.
  proche(quantile(1 - 0.05 / 2), 1.96, 1e-3, 'z(0,05)');
  proche(quantile(1 - 0.01 / 2), 2.5758, 1e-3, 'z(0,01)');
  proche(quantile(1 - 0.005 / 2), 2.807, 1e-3, 'z(0,005)');
  proche(quantile(1 - 0.001 / 2), 3.2905, 1e-3, 'z(0,001)');
  proche(quantile(0.025), -1.96, 1e-3, 'Φ⁻¹(0,025)');
  // Bonferroni : α / m, bilatéral.
  proche(zPour(0.05, 1), 1.96, 1e-3, 'm = 1');
  proche(zPour(0.05, 5), 2.576, 1e-3, 'm = 5');
  proche(zPour(0.05, 10), 2.807, 1e-3, 'm = 10');
  proche(zPour(0.05, 50), 3.291, 1e-3, 'm = 50');
  assert.equal(zPour(0.05, 0), zPour(0.05, 1));
  assert.throws(() => quantile(0), RangeError);
  assert.throws(() => quantile(1), RangeError);
});

// -------------------------------------------- 3. calibrage sous l'hypothèse nulle

/** Le juge sur `reps` jeux simulés où rien n'a changé : les comptes de verdicts et les gains. */
function calibrer({ sigma, reps, depart }) {
  const comptes = { retenu: 0, 'moins-bon': 0, 'pas-prouve': 0, 'pas-assez-de-matchs': 0 };
  const gains = [];
  for (let r = 1; r <= reps; r++) {
    const lignes = simuler({ graine: depart + r, matchs: 300, sigmaA: sigma, sigmaB: sigma });
    const j = comparer(lignes, { sens: 'min', tirages: 300, graine: 1000 + depart + r, minBlocs: 50 });
    comptes[j.verdict]++;
    gains.push(j.gain);
  }
  return { comptes, gains, faux: (comptes.retenu + comptes['moins-bon']) / reps };
}

test('calibrage : quand rien n’a changé, « pas prouvé » sort ~95 % du temps — 400 jeux de 300 matchs, puis deux autres tailles de bruit', () => {
  // σ = 0,15 : graines 1 à 400, graine du juge 1 000 + r.
  const { comptes, gains, faux } = calibrer({ sigma: 0.15, reps: 400, depart: 0 });
  assert.equal(comptes['pas-assez-de-matchs'], 0);
  assert.ok(faux >= 0.01 && faux <= 0.09, `faux verdicts : ${(faux * 100).toFixed(2)} % (attendu 1 à 9 %)`);
  // Le gain moyen est proche de zéro : à moins de deux écarts-types de la moyenne.
  const moyenne = gains.reduce((s, g) => s + g, 0) / gains.length;
  const ecart = Math.sqrt(gains.reduce((s, g) => s + (g - moyenne) ** 2, 0) / (gains.length - 1));
  assert.ok(Math.abs(moyenne) < (2 * ecart) / Math.sqrt(gains.length), `gain moyen ${moyenne} (écart-type de la moyenne ${ecart / Math.sqrt(gains.length)})`);
  // Les faux « retenu » et les faux « moins bon » sont du même ordre (2,5 % attendus de chaque côté).
  assert.ok(comptes.retenu <= 0.06 * 400 && comptes['moins-bon'] <= 0.06 * 400, JSON.stringify(comptes));
  assert.ok(Math.abs(comptes.retenu - comptes['moins-bon']) <= 0.05 * 400, JSON.stringify(comptes));
  // Deux autres tailles de bruit, sur d'autres matchs (graines 401 à 600, puis 601 à 800) : toujours dans la fenêtre.
  for (const [sigma, depart] of [[0.05, 400], [0.4, 600]]) {
    const c = calibrer({ sigma, reps: 200, depart });
    assert.equal(c.comptes['pas-assez-de-matchs'], 0);
    assert.ok(c.faux >= 0.01 && c.faux <= 0.09, `σ = ${sigma} : faux verdicts ${(c.faux * 100).toFixed(2)} %`);
  }
});

// ------------------------------------------------------------------ 4. puissance

test('puissance : une vraie amélioration (σ 0,40 → 0,05, 600 matchs) est retenue au moins 36 fois sur 40 ; à l’envers, « moins bon » au moins 36 fois', () => {
  let retenus = 0;
  let moinsBons = 0;
  for (let r = 1; r <= 40; r++) {
    if (comparer(simuler({ graine: 2000 + r, matchs: 600, sigmaA: 0.4, sigmaB: 0.05 }), { sens: 'min', tirages: 300, graine: 3000 + r }).verdict === 'retenu') retenus++;
    if (comparer(simuler({ graine: 2000 + r, matchs: 600, sigmaA: 0.05, sigmaB: 0.4 }), { sens: 'min', tirages: 300, graine: 3000 + r }).verdict === 'moins-bon') moinsBons++;
  }
  assert.ok(retenus >= 36, `${retenus} retenus sur 40`);
  assert.ok(moinsBons >= 36, `${moinsBons} « moins bon » sur 40`);
});

// ---------------------------------------------------------------- 5. corrélation

/** Trois lignes par match : des copies (même a, même b), ou trois marchés liés au même score. */
function troisLignesParMatch({ graine, matchs, sigma, liees }) {
  const h = hasard(graine);
  const lignes = [];
  for (let i = 0; i < matchs; i++) {
    const { p, issue } = h.match();
    const pA = h.deformer(p, sigma);
    const pB = h.deformer(p, sigma);
    if (!liees) {
      const a = perteLog(pA, issue).valeur;
      const b = perteLog(pB, issue).valeur;
      for (let k = 0; k < 3; k++) lignes.push({ bloc: `m${i}`, cle: `m${i}|copie${k}`, a, b });
    } else {
      // 1N2, « domicile ou nul » et « domicile » : trois marchés, un seul score.
      lignes.push({ bloc: `m${i}`, cle: `m${i}|1n2`, a: perteLog(pA, issue).valeur, b: perteLog(pB, issue).valeur });
      lignes.push({ bloc: `m${i}`, cle: `m${i}|1x`, a: perteLogBinaire(pA[0] + pA[1], issue !== 2).valeur, b: perteLogBinaire(pB[0] + pB[1], issue !== 2).valeur });
      lignes.push({ bloc: `m${i}`, cle: `m${i}|1`, a: perteLogBinaire(pA[0], issue === 0).valeur, b: perteLogBinaire(pB[0], issue === 0).valeur });
    }
  }
  return lignes;
}

/** La part de faux verdicts en tirant par match, puis en tirant chaque ligne seule (le naïf). */
function fauxParMatchEtNaif({ liees, depart }) {
  let parMatch = 0;
  let naif = 0;
  for (let r = 1; r <= 200; r++) {
    const lignes = troisLignesParMatch({ graine: depart + r, matchs: 300, sigma: 0.15, liees });
    const options = { sens: 'min', tirages: 300, graine: 5000 + depart + r, minBlocs: 50 };
    if (FAUX(comparer(lignes, options))) parMatch++;
    if (FAUX(comparer(lignes.map((l) => ({ ...l, bloc: l.cle })), options))) naif++;
  }
  return { parMatch: parMatch / 200, naif: naif / 200 };
}

test('corrélation : trois lignes d’un même match tirées ENSEMBLE gardent ~5 % de faux verdicts ; tirées chacune seule, l’écart-type est sous-estimé et le juge se trompe bien plus', () => {
  const copies = fauxParMatchEtNaif({ liees: false, depart: 3000 });
  assert.ok(copies.parMatch <= 0.09, `copies, par match : ${(copies.parMatch * 100).toFixed(1)} %`);
  // Attendu ≈ 26 % : l'écart-type est sous-estimé d'un facteur √3.
  assert.ok(copies.naif > 0.15, `copies, ligne par ligne : ${(copies.naif * 100).toFixed(1)} %`);
  const liees = fauxParMatchEtNaif({ liees: true, depart: 4000 });
  assert.ok(liees.parMatch <= 0.09, `marchés liés, par match : ${(liees.parMatch * 100).toFixed(1)} %`);
  assert.ok(liees.naif > liees.parMatch + 0.05, `marchés liés : naïf ${(liees.naif * 100).toFixed(1)} %, par match ${(liees.parMatch * 100).toFixed(1)} %`);
});

// ---------------------------------------------------------- 6. reproductibilité

test('reproductibilité : mêmes lignes et même graine → exactement le même résultat ; autre graine → même gain, écart-type à moins de 10 % ; témoin à 95 % proche de la fourchette', () => {
  const lignes = simuler({ graine: 77, matchs: 400, sigmaA: 0.3, sigmaB: 0.2 });
  const r1 = comparer(lignes, { sens: 'min', graine: 5 });
  assert.deepEqual(comparer(lignes, { sens: 'min', graine: 5 }), r1);
  const r2 = comparer(lignes, { sens: 'min', graine: 6 });
  assert.equal(r2.gain, r1.gain);
  assert.notEqual(r2.ecartType, r1.ecartType);
  assert.ok(Math.abs(r2.ecartType / r1.ecartType - 1) < 0.1, `écart-type ${r1.ecartType} puis ${r2.ecartType}`);
  // Le gain est la différence des moyennes, recalculée ici (positif = B meilleure : la perte de B est plus petite).
  const moyA = lignes.reduce((s, l) => s + l.a, 0) / lignes.length;
  const moyB = lignes.reduce((s, l) => s + l.b, 0) / lignes.length;
  proche(r1.gain, moyA - moyB, 1e-12, 'gain = moyenne de A − moyenne de B');
  proche(r1.a.moyenne, moyA, 1e-12);
  proche(r1.b.moyenne, moyB, 1e-12);
  // Le témoin par percentiles (95 %) est proche de la fourchette à m = 1 : chaque borne à moins de 5 % de la largeur
  // (la conception dit 10 % ; mesuré ~1 à 2 % — à 5 %, des percentiles 5 / 95 au lieu de 2,5 / 97,5 se voient).
  const largeur = r1.fourchette[1] - r1.fourchette[0];
  assert.ok(Math.abs(r1.controle.percentile95[0] - r1.fourchette[0]) < 0.05 * largeur, 'borne basse');
  assert.ok(Math.abs(r1.controle.percentile95[1] - r1.fourchette[1]) < 0.05 * largeur, 'borne haute');
  assert.deepEqual([r1.tirages, r1.graine, r1.mode, r1.sens], [1000, 5, 'moyenne', 'min']);
});

test('écart-type des tirages : sur un petit cas, celui du calcul exact — K blocs tirés AVEC remise, ni un de moins, ni sans remise, ni redivisé', () => {
  // 5 blocs d'une ligne, d = 1 à 5 : la moyenne de K tirages avec remise a pour variance σ² / K, σ² = Σ(d − 3)² / 5 = 2.
  // (Avec K − 1 tirages : √(2/4), +12 % ; sans remise : 0 ; redivisé par √K : √(2/5) / √5.)
  const exact = Math.sqrt(2 / 5);
  const lignes = [1, 2, 3, 4, 5].map((d, i) => ({ bloc: `b${i}`, a: 0, b: d }));
  const r = comparer(lignes, { sens: 'max', tirages: 100_000, minBlocs: 2 });
  assert.equal(r.gain, 3);
  proche(r.ecartType, exact, 0.01 * exact, 'écart-type exact √(2/5)');
  // Deux lignes par bloc (copies) : même moyenne par ligne, même écart-type — le bloc se tire en entier.
  proche(comparer(lignes.flatMap((l) => [l, { ...l }]), { sens: 'max', tirages: 100_000, minBlocs: 2 }).ecartType, exact, 0.01 * exact, 'blocs de deux lignes');
  // En rendement : A ne gagne ni ne perd rien, B gagne −1, −0,5, 0, +0,5, +1 pour une unité misée — σ² = 0,5, écart-type √(0,5/5).
  const paris5 = [-1, -0.5, 0, 0.5, 1].map((g, i) => ({ bloc: `b${i}`, gainA: 0, miseA: 1, gainB: g, miseB: 1 }));
  const rend = comparer(paris5, { mode: 'rendement', tirages: 100_000, minBlocs: 2, minParis: 1 });
  assert.equal(rend.gain, 0);
  proche(rend.ecartType, Math.sqrt(0.5 / 5), 0.01 * Math.sqrt(0.5 / 5), 'rendement : écart-type exact √(0,5/5)');
});

/**
 * Étape 19 (13/10/2026) : le banc d'essai vit aussi dans src/bench. Deux de ses fichiers LISENT la base de
 * l'appelant (prix.js : les cotes archivées ; entrees.js : la table du jour J et football-data) et
 * apparier.js lit les pronostics gelés : ils importent ces lecteurs, nommés ici un par un — jamais une base
 * ouverte (openDb, DatabaseSync), jamais le réseau ni Claude, jamais le hasard du navigateur ou de Node.
 * Étape 18 (13/10/2026) : statValue.js (la valeur de chaque statistique) lit la table du jour J et
 * football-data par la base de l'appelant, avec les règles de relevé des repères (paireFd).
 * Étape 25 (seconde moitié, 14/10/2026) : bancCandidate.js (le banc avant l'essai : deux rejeux du banc, sur la base de
 * l'appelant), essaiCandidate.js (les lignes de l'essai à blanc, réglées par les règles PURES de la calibration) et
 * horizonEssai.js (sans import).
 */
const LECTEURS_PERMIS_AU_BANC = Object.freeze({
  'prix.js': ['../data/db/oddsQuotesRepository.js', '../data/freeMarketOdds.js'],
  // Étape 27 : l'accumulateur des forces de buts (pur, celui de la nuit) — le banc ne lit jamais la table forces_buts.
  'entrees.js': ['../data/db/dayTable.js', '../data/db/identityRegistry.js', '../data/db/leagueBenchmarks.js', '../data/enregistreurs/gelPronostics.js', '../data/providers/footballDataOdds.js', '../data/db/forcesButs.js'],
  'apparier.js': ['../data/enregistreurs/gelPronostics.js', '../data/enregistreurs/depot.js'],
  'statValue.js': ['../data/db/dayTable.js', '../data/db/leagueBenchmarks.js']
});

test('src/bench : aucun hasard non semé, aucune base ouverte, ni réseau, ni Claude ; seuls les lecteurs nommés du banc d’essai', () => {
  const dossier = path.join(SERVEUR, 'src', 'bench');
  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.js'));
  assert.deepEqual(fichiers.sort(), [
    'apparier.js', 'bancCandidate.js', 'depotBanc.js', 'entrees.js', 'essaiCandidate.js', 'guard.js', 'horizonEssai.js', 'jugeAPart.js', 'jugeAPartFil.js', 'lancements.js', 'libellesDesCases.js', 'lignesEnginePicks.js', 'metrics.js', 'noteDeDepart.js', 'periodes.js', 'prix.js', 'resume.js', 'runner.js', 'simulateBets.js', 'statValue.js', 'trialsRegistry.js'
  ]);
  // Étape 27 (21/10/2026) : le nom des cases du banc pour Pierre, léger et sans aucun import (la porte 1 et la feuille de route).
  assert.doesNotMatch(fs.readFileSync(path.join(dossier, 'libellesDesCases.js'), 'utf8'), /^\s*import\s/m, 'libellesDesCases.js : aucun import');
  for (const f of fichiers) {
    const source = fs.readFileSync(path.join(dossier, f), 'utf8');
    assert.doesNotMatch(source, /Math\.random/, `${f} : seul le générateur à graine de guard.js tire au sort`);
    const importes = [...source.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const spec of importes) {
      if ((LECTEURS_PERMIS_AU_BANC[f] ?? []).includes(spec)) continue;
      assert.doesNotMatch(spec, /matchStatsDb|[\\/]db[\\/]|node:sqlite|claude|anthropic|fotmob|provider|enregistreurs|\bjobs?\b|node:(http|https|net|tls|dns|child_process)/i, `${f} importe ${spec}`);
    }
    assert.doesNotMatch(source, /\bfetch\s*\(|\bopenDb\s*\(|callClaude|callAnthropic|new\s+DatabaseSync/, `${f} : un appel interdit`);
  }
  // Le rejeu, le résumé, l'appariement et les périodes n'importent aucun fournisseur (conception §7.3).
  // Étape 25 (seconde moitié, 14/10/2026) : le banc avant l'essai, les lignes de l'essai à blanc et son horizon non plus.
  for (const f of ['runner.js', 'resume.js', 'apparier.js', 'periodes.js', 'noteDeDepart.js', 'jugeAPart.js', 'jugeAPartFil.js', 'statValue.js', 'bancCandidate.js', 'essaiCandidate.js', 'horizonEssai.js']) {
    const source = fs.readFileSync(path.join(dossier, f), 'utf8');
    assert.doesNotMatch(source, /from\s+['"][^'"]*providers\//, `${f} importe un fournisseur`);
  }
});

// ------------------------------------------------- 7. correction des variantes

test('variantes : lignes déterministes à 2,4 écarts-types — retenu pour 1 variante, pas prouvé pour 5 et 10 ; la fourchette s’élargit de 2,807 / 1,960', () => {
  // 600 blocs, d_i = μ + σ · Φ⁻¹((i + 0,5) / 600) : aucune chance de tomber à côté de la cible.
  const sigma = 0.03;
  const mu = (2.4 * sigma) / Math.sqrt(600);
  const lignes = Array.from({ length: 600 }, (_, i) => ({ bloc: `b${i}`, a: 0, b: mu + sigma * loiNormale.quantile((i + 0.5) / 600) }));
  const r1 = comparer(lignes, { sens: 'max', variantes: 1 });
  const r5 = comparer(lignes, { sens: 'max', variantes: 5 });
  const r10 = comparer(lignes, { sens: 'max', variantes: 10 });
  proche(r1.gain, mu, 1e-9, 'gain = μ (les quantiles sont symétriques)');
  const rapport = r1.gain / r1.ecartType;
  assert.ok(rapport > 2.2 && rapport < 2.55, `gain / écart-type = ${rapport}`);
  assert.deepEqual([r1.verdict, r5.verdict, r10.verdict], ['retenu', 'pas-prouve', 'pas-prouve']);
  // Même graine : même écart-type, seul z change ; p ne dépend pas de m (bilatéral : 2 × la queue).
  assert.equal(r10.ecartType, r1.ecartType);
  proche(r1.p, 2 * (1 - loiNormale.phi(rapport)), 1e-12, 'p = 2 × (1 − Φ(gain / écart-type))');
  assert.ok(r1.p > 0.01 && r1.p < 0.02, `p = ${r1.p} (≈ 0,014 pour 2,46 écarts-types)`);
  assert.equal(r10.p, r1.p);
  const largeur = (r) => r.fourchette[1] - r.fourchette[0];
  proche(largeur(r10) / largeur(r1), 2.807 / 1.96, 0.002, 'largeur à m = 10 / largeur à m = 1');
  proche(r10.seuil.alphaCorrige, 0.005, 1e-12, 'α corrigé à m = 10');
  assert.deepEqual([r10.seuil.alpha, r10.seuil.variantes, r5.seuil.variantes], [0.05, 10, 5]);
  proche(r5.seuil.z, 2.5758, 1e-3, 'z à m = 5');
  assert.match(r5.raison, /La fourchette contient zéro : l’écart peut venir du hasard \(600 matchs, 5 variantes essayées\)\./);
  assert.match(r1.raison, /entièrement au-dessus de zéro \(600 matchs, 1 variante essayée\)/);
});

// --------------------------------------------------------------- 8. rendement

/** 400 lignes : A mise sur toutes, B une sur deux (les paires) ; cotes et gains fabriqués, déterministes. */
function paris({ miseB = (i) => (i % 2 === 0 ? 1 : 0), miseA = () => 1 } = {}) {
  return Array.from({ length: 400 }, (_, i) => {
    const cote = 1.5 + (i % 7) * 0.25;
    const g = i % 3 === 0 ? cote - 1 : -1;
    return { bloc: `m${i}`, gainA: miseA(i) ? g : 0, miseA: miseA(i), gainB: miseB(i) ? g : 0, miseB: miseB(i) };
  });
}

test('rendement : le rendement de chaque version par unité misée, recalculé à la main ; les paris comptés de chaque côté ; « pas assez » nomme la version qui manque de paris', () => {
  const lignes = paris();
  let gA = 0;
  let mA = 0;
  let gB = 0;
  let mB = 0;
  for (const l of lignes) {
    gA += l.gainA;
    mA += l.miseA;
    gB += l.gainB;
    mB += l.miseB;
  }
  const r = comparer(lignes, { mode: 'rendement' });
  assert.deepEqual(r.n, { lignes: 400, blocs: 400, matchs: 400, parisA: 400, parisB: 200 });
  proche(r.a.moyenne, gA / mA, 1e-12, 'rendement de A');
  proche(r.b.moyenne, gB / mB, 1e-12, 'rendement de B');
  proche(r.gain, gB / mB - gA / mA, 1e-12, 'gain = rendement de B − rendement de A');
  assert.equal(r.sens, 'max');
  assert.equal(r.controle.tiragesIgnores, 0);
  assert.notEqual(r.verdict, 'pas-assez-de-matchs');
  // B ne mise jamais : pas de gain, « pas assez de matchs », et la raison nomme B.
  const sansB = comparer(paris({ miseB: () => 0 }), { mode: 'rendement' });
  assert.equal(sansB.verdict, 'pas-assez-de-matchs');
  assert.equal(sansB.gain, null);
  assert.match(sansB.raison, /La nouvelle version \(B\) n’a que 0 pari, 100 nécessaires\./);
  // Le minimum de paris, à un pari près, de chaque côté.
  const bSur99 = comparer(paris({ miseB: (i) => (i < 99 ? 1 : 0) }), { mode: 'rendement' });
  assert.equal(bSur99.verdict, 'pas-assez-de-matchs');
  assert.match(bSur99.raison, /nouvelle version \(B\) n’a que 99 paris, 100 nécessaires/);
  assert.notEqual(comparer(paris({ miseB: (i) => (i < 100 ? 1 : 0) }), { mode: 'rendement' }).verdict, 'pas-assez-de-matchs');
  const aSur50 = comparer(paris({ miseA: (i) => (i < 50 ? 1 : 0) }), { mode: 'rendement' });
  assert.match(aSur50.raison, /L’ancienne version \(A\) n’a que 50 paris, 100 nécessaires\./);
  assert.match(comparer(paris({ miseA: () => 0, miseB: () => 0 }), { mode: 'rendement' }).raison, /\(A\) n’a que 0 pari et la nouvelle \(B\) 0 pari, 100 nécessaires de chaque côté/);
  // Un tirage sans aucune mise de B ne compte pas (dénominateur nul) : ignoré, compté ; au-delà de 5 %, pas assez.
  const deuxParis = comparer(paris({ miseB: (i) => (i === 3 || i === 200 ? 1 : 0) }), { mode: 'rendement', minParis: 1 });
  assert.ok(deuxParis.controle.tiragesIgnores > 50, `${deuxParis.controle.tiragesIgnores} tirages ignorés sur 1 000 (≈ 135 attendus)`);
  assert.equal(deuxParis.verdict, 'pas-assez-de-matchs');
  assert.match(deuxParis.raison, /Trop de tirages sans aucune mise d’un côté/);
  assert.ok(Number.isFinite(deuxParis.ecartType), 'l’écart-type des tirages gardés reste un nombre');
  // Une mise négative, un gain sans mise, une perte plus grande que la mise : refusés.
  assert.throws(() => comparer([{ bloc: 'x', gainA: 0, miseA: -1, gainB: 0, miseB: 1 }], { mode: 'rendement' }), LignesInvalides);
  assert.throws(() => comparer([{ bloc: 'x', gainA: 0.5, miseA: 0, gainB: 0, miseB: 1 }], { mode: 'rendement' }), LignesInvalides);
  assert.throws(() => comparer([{ bloc: 'x', gainA: -2, miseA: 1, gainB: 0, miseB: 1 }], { mode: 'rendement' }), LignesInvalides);
  assert.throws(() => comparer(lignes, { mode: 'rendement', sens: 'min' }), LignesInvalides, 'en rendement, plus grand est toujours mieux');
});

test('rendement : à la cote juste (aucun avantage), A mise sur chaque issue, B sur une issue sur deux tirée au sort — 300 jeux de 400 matchs, 1 à 9 % de faux verdicts, aucun tirage ignoré', () => {
  let faux = 0;
  let ignores = 0;
  for (let r = 1; r <= 300; r++) {
    const h = hasard(7000 + r);
    const lignes = [];
    for (let i = 0; i < 400; i++) {
      const { p, issue } = h.match();
      for (let j = 0; j < 3; j++) {
        const gain = j === issue ? 1 / p[j] - 1 : -1;
        const miseB = h.u() < 0.5 ? 1 : 0;
        lignes.push({ bloc: `m${i}`, gainA: gain, miseA: 1, gainB: miseB ? gain : 0, miseB });
      }
    }
    const res = comparer(lignes, { mode: 'rendement', tirages: 300, graine: 8000 + r });
    if (FAUX(res)) faux++;
    ignores += res.controle.tiragesIgnores;
  }
  assert.ok(faux / 300 >= 0.01 && faux / 300 <= 0.09, `faux verdicts : ${((faux / 300) * 100).toFixed(2)} %`);
  assert.equal(ignores, 0);
});

// --------------------------------------------------------------- 9. validation

test('validation : une ligne fautive lève LignesInvalides avec son indice et sa clé ; options absurdes refusées ; 150 matchs → pas assez ; deux versions identiques → [0 ; 0] ; tout égal et positif → retenu', () => {
  const bonnes = Array.from({ length: 5 }, (_, i) => ({ bloc: `m${i}`, cle: `cle-${i}`, a: 1, b: 0.9 }));
  const avec = (i, modif) => bonnes.map((l, k) => (k === i ? { ...l, ...modif } : l));
  const leve = (lignes, options, motif) =>
    assert.throws(
      () => comparer(lignes, options),
      (e) => e instanceof LignesInvalides && motif.test(e.message),
      `attendu : ${motif}`
    );
  // Ligne sans bloc : l'indice et la clé.
  assert.throws(
    () => comparer(avec(3, { bloc: undefined }), { sens: 'min' }),
    (e) => e instanceof LignesInvalides && e.indice === 3 && e.cle === 'cle-3' && /Ligne 3 \(clé « cle-3 »\)/.test(e.message) && /bloc/.test(e.message)
  );
  leve(avec(2, { bloc: '' }), { sens: 'min' }, /Ligne 2.*bloc/);
  // Valeurs absentes ou non finies : jamais Number(null) = 0.
  for (const mauvais of [null, undefined, NaN, Infinity, -Infinity, '0.5']) {
    leve(avec(1, { a: mauvais }), { sens: 'min' }, /Ligne 1 \(clé « cle-1 »\) : « a » n’est pas un nombre fini/);
    leve(avec(4, { b: mauvais }), { sens: 'min' }, /Ligne 4 \(clé « cle-4 »\) : « b »/);
  }
  leve([...bonnes, null], { sens: 'min' }, /Ligne 5 : un objet est attendu/);
  leve(bonnes, {}, /sens de la mesure est obligatoire/);
  leve(bonnes, { sens: 'plus-petit' }, /sens de la mesure est obligatoire/);
  leve(bonnes, { sens: 'min', tirages: 10 }, /tirages absurde/);
  leve(bonnes, { sens: 'min', tirages: 1.5e5 }, /tirages absurde/);
  leve(bonnes, { sens: 'min', mode: 'mediane' }, /Mode inconnu/);
  leve(bonnes, { sens: 'min', minbloc: 50 }, /Option inconnue : minbloc/);
  leve(bonnes, { sens: 'min', alpha: 0 }, /alpha/);
  leve(bonnes, { sens: 'min', variantes: -1 }, /variantes/);
  leve(bonnes, { sens: 'min', graine: 1.5 }, /Graine/);
  leve(bonnes, { sens: 'min', minBlocs: 1 }, /Minimum de blocs/);
  leve('pas une liste', { sens: 'min' }, /liste/);
  // 150 matchs (deux lignes chacun : 300 lignes) : pas assez — le minimum compte les BLOCS, pas les lignes.
  const cent50 = Array.from({ length: 300 }, (_, i) => ({ bloc: `m${i % 150}`, a: 1, b: 0.5 }));
  const pasAssez = comparer(cent50, { sens: 'min' });
  assert.equal(pasAssez.verdict, 'pas-assez-de-matchs');
  assert.equal(pasAssez.raison, '150 matchs jugés, 200 nécessaires.');
  assert.deepEqual(pasAssez.n, { lignes: 300, blocs: 150, matchs: 150 });
  // Pile 200 blocs : jugé.
  assert.equal(comparer(Array.from({ length: 200 }, (_, i) => ({ bloc: `m${i}`, a: 1, b: 0.5 })), { sens: 'min' }).verdict, 'retenu');
  // Des blocs qui sont des journées : la raison le dit.
  const journees = Array.from({ length: 60 }, (_, i) => ({ bloc: `2026-11-${String((i % 20) + 1).padStart(2, '0')}|EPL`, match: `m${i}`, a: 1, b: 1 }));
  assert.equal(comparer(journees, { sens: 'min' }).raison, '20 blocs de matchs jugés (60 matchs), 200 nécessaires.');
  // Deux versions identiques : tous les d = 0, écart-type nul, fourchette [0 ; 0], pas prouvé.
  const identiques = Array.from({ length: 250 }, (_, i) => ({ bloc: `m${i}`, a: 0.3 + (i % 10) / 10, b: 0.3 + (i % 10) / 10 }));
  const memes = comparer(identiques, { sens: 'min' });
  assert.deepEqual([memes.gain, memes.ecartType, memes.fourchette, memes.p, memes.verdict], [0, 0, [0, 0], 1, 'pas-prouve']);
  assert.ok(Object.is(memes.gain, 0) && Object.is(memes.fourchette[0], 0), 'jamais −0');
  // Toutes les différences égales et positives : écart-type nul, gain > 0 → retenu (p = 0).
  const egales = Array.from({ length: 250 }, (_, i) => ({ bloc: `m${i}`, a: 0, b: 0.5 }));
  const toutes = comparer(egales, { sens: 'max' });
  assert.deepEqual([toutes.gain, toutes.ecartType, toutes.fourchette, toutes.p, toutes.verdict], [0.5, 0, [0.5, 0.5], 0, 'retenu']);
  // Le sens : « plus petit est mieux » retourne la différence (B à 0,5 de perte contre 1 : B meilleure).
  assert.equal(comparer(Array.from({ length: 250 }, (_, i) => ({ bloc: `m${i}`, a: 1, b: 0.5 })), { sens: 'min' }).gain, 0.5);
  assert.equal(comparer(Array.from({ length: 250 }, (_, i) => ({ bloc: `m${i}`, a: 1, b: 0.5 })), { sens: 'max' }).verdict, 'moins-bon');
  // Aucune ligne : pas assez, sans planter.
  const vide = comparer([], { sens: 'min' });
  assert.deepEqual([vide.verdict, vide.gain, vide.fourchette, vide.raison], ['pas-assez-de-matchs', null, null, '0 match jugé, 200 nécessaires.']);
});

test('moyenne par LIGNE, jamais la moyenne des moyennes de blocs ; les blocs gardent l’ordre d’apparition', () => {
  // Un bloc de 3 lignes à d = 0,3 et 297 blocs d'une ligne à d = 0 : moyenne par ligne = 0,9 / 300 = 0,003.
  const lignes = [
    ...Array.from({ length: 3 }, () => ({ bloc: 'gros', a: 0, b: 0.3 })),
    ...Array.from({ length: 297 }, (_, i) => ({ bloc: `p${i}`, a: 0, b: 0 }))
  ];
  const r = comparer(lignes, { sens: 'max' });
  proche(r.gain, 0.9 / 300, 1e-15, 'moyenne par ligne');
  assert.deepEqual(r.n, { lignes: 300, blocs: 298, matchs: 298 });
  // Mêmes lignes, autre ordre des blocs : même gain (l'ordre ne change que l'attribution des tirages).
  const melange = [...lignes.slice(3), ...lignes.slice(0, 3)];
  proche(comparer(melange, { sens: 'max' }).gain, r.gain, 1e-15);
});

// ------------------------------------------------------------ 11. l'adaptateur

const F1 = 'fotmob:10|20|2026-11-12';
const F2 = 'fotmob:30|40|2026-11-13';
const F3 = 'fotmob:50|60|2026-11-14';
/** Un pronostic gelé, à la forme de pronosticsGeles() (depot.js). */
const pick = (fixtureKey, marketKey, o = {}) => ({
  fixtureKey,
  marketKey,
  version: 1,
  recordedAt: '2026-11-11T02:00:00.000Z',
  origin: 'nuit',
  league: 'Premier League',
  date: fixtureKey.slice(-10),
  homeName: 'Arsenal',
  awayName: 'Chelsea',
  marketOdds: null,
  ...o
});
const resultat = pick.bind(null, F1, 'result');
const RESULTATS = new Map([
  [F1, { homeGoals: 2, awayGoals: 1, date: '2026-11-12', stats: { home: { corners: 6, shots: 14, shotsOnTarget: 5 }, away: { corners: 3, shots: 9, shotsOnTarget: 2 } } }],
  [F2, { homeGoals: 0, awayGoals: 0, date: '2026-11-13', stats: null }]
]);

function deuxListes() {
  const A = [
    resultat({ marketId: 'result', market: 'Résultat', params: '{"outcome":"home"}', choice: 'home', label: 'Arsenal gagne', probability: 0.55, marketOdds: 1.9 }),
    pick(F1, 'totalGoals', { marketId: 'totalGoals', market: 'Total buts', params: '{"line":2.5,"side":"over"}', choice: 'over', label: 'Plus de 2.5 buts', probability: 0.52 }),
    pick(F1, 'bothTeamsScore', { marketId: 'bothTeamsScore', market: 'Les 2 équipes marquent', params: '{"outcome":"yes"}', choice: 'yes', label: 'Oui', probability: 0.58 }),
    pick(F1, 'totalCorners', { marketId: 'totalCorners', market: 'Total corners', params: '{"line":9.5,"side":"over"}', choice: 'over', label: 'Plus de 9.5 corners', probability: 0.5 }),
    pick(F2, 'result', { marketId: 'result', market: 'Résultat', params: '{"outcome":"home"}', choice: 'home', label: 'Arsenal gagne', probability: 0.5, marketOdds: 2.1 }),
    pick(F2, 'totalCorners', { marketId: 'totalCorners', market: 'Total corners', params: '{"line":9.5,"side":"over"}', choice: 'over', label: 'Plus de 9.5 corners', probability: 0.5 }),
    pick(F2, 'totalGoals', { marketId: 'totalGoals', market: 'Total buts', params: '{"line":1.5,"side":"over"}', choice: 'over', label: 'Plus de 1.5 buts', probability: 0.7 }),
    pick(F2, 'bothTeamsScore', { marketId: 'bothTeamsScore', market: 'Les 2 équipes marquent', params: '{"outcome":"yes"}', choice: 'yes', label: 'Oui', probability: 1 }),
    pick(F3, 'result', { marketId: 'result', market: 'Résultat', params: '{"outcome":"away"}', choice: 'away', label: 'Chelsea gagne', probability: 0.4, marketOdds: 2.6 }),
    pick(F1, 'teamGoals:home', { marketId: 'teamGoals', market: 'Buts — Arsenal', params: '{"line":0.5,"side":"over","team":"home"}', choice: 'over', label: 'Arsenal — Plus de 0.5 buts', probability: 0.75 }),
    pick(F1, 'seulementA', { marketId: 'totalShots', market: 'Total tirs', params: '{"line":20.5,"side":"over"}', choice: 'over', label: 'Plus de 20.5 tirs', probability: 0.6 })
  ];
  const B = [
    resultat({ marketId: 'result', market: 'Résultat', params: '{"outcome":"home"}', choice: 'home', label: 'Arsenal gagne', probability: 0.6, marketOdds: 1.9 }),
    pick(F1, 'totalGoals', { marketId: 'totalGoals', market: 'Total buts', params: '{"side":"over","line":2.5}', choice: 'over', label: 'Plus de 2.5 buts', probability: 0.48 }),
    pick(F1, 'bothTeamsScore', { marketId: 'bothTeamsScore', market: 'Les 2 équipes marquent', params: '{"outcome":"yes"}', choice: 'yes', label: 'Oui', probability: 0.61 }),
    pick(F1, 'totalCorners', { marketId: 'totalCorners', market: 'Total corners', params: '{"line":9.5,"side":"over"}', choice: 'over', label: 'Plus de 9.5 corners', probability: 0.55 }),
    pick(F2, 'result', { marketId: 'result', market: 'Résultat', params: '{"outcome":"draw"}', choice: 'draw', label: 'Match nul', probability: 0.3, marketOdds: 3.2 }),
    pick(F2, 'totalCorners', { marketId: 'totalCorners', market: 'Total corners', params: '{"line":9.5,"side":"over"}', choice: 'over', label: 'Plus de 9.5 corners', probability: 0.52 }),
    pick(F2, 'totalGoals', { marketId: 'totalGoals', market: 'Total buts', params: '{"line":2.5,"side":"over"}', choice: 'over', label: 'Plus de 2.5 buts', probability: 0.5 }),
    pick(F2, 'bothTeamsScore', { marketId: 'bothTeamsScore', market: 'Les 2 équipes marquent', params: '{"outcome":"yes"}', choice: 'yes', label: 'Oui', probability: 0.45 }),
    pick(F3, 'result', { marketId: 'result', market: 'Résultat', params: '{"outcome":"away"}', choice: 'away', label: 'Chelsea gagne', probability: 0.42, marketOdds: 2.6 }),
    pick(F1, 'teamGoals:home', { marketId: 'teamGoals', market: 'Buts — Arsenal', params: null, choice: null, label: 'plus de pronostic', probability: null }),
    pick(F2, 'seulementB', { marketId: 'totalShots', market: 'Total tirs', params: '{"line":20.5,"side":"over"}', choice: 'over', label: 'Plus de 20.5 tirs', probability: 0.6 })
  ];
  return { A, B };
}

test('adaptateur, perte log binaire : même affirmation seulement (même choix ET même ligne), réglée par settlementRules ; chaque paire écartée comptée une fois, pour sa raison', () => {
  const { A, B } = deuxListes();
  const { lignes, ecartees, ecretees } = apparierPronostics({ picksA: A, picksB: B, resultats: RESULTATS, mesure: 'perte-log-binaire' });
  // F1 (2-1, 9 corners) : Résultat domicile, plus de 2,5 buts (paramètres dans un autre ordre : même affirmation), les deux marquent, plus de 9,5 corners (raté).
  const attendu = [
    { cle: `${F1}|result`, a: -Math.log(0.55), b: -Math.log(0.6) },
    { cle: `${F1}|totalGoals`, a: -Math.log(0.52), b: -Math.log(0.48) },
    { cle: `${F1}|bothTeamsScore`, a: -Math.log(0.58), b: -Math.log(0.61) },
    { cle: `${F1}|totalCorners`, a: -Math.log(0.5), b: -Math.log(0.45) },
    // F2 (0-0) : « les deux marquent » annoncé à 100 % par A et raté — écrêté à 1e−6.
    { cle: `${F2}|bothTeamsScore`, a: -Math.log(1e-6), b: -Math.log(0.55) }
  ];
  assert.deepEqual(lignes.map((l) => l.cle), attendu.map((l) => l.cle));
  lignes.forEach((l, i) => {
    proche(l.a, attendu[i].a, 1e-12, `${l.cle} : a`);
    proche(l.b, attendu[i].b, 1e-12, `${l.cle} : b`);
    assert.equal(l.bloc, l.cle.split('|').slice(0, 3).join('|'), 'bloc = le match');
    assert.equal(l.match, l.bloc);
    assert.equal(l.date, l.bloc.slice(-10));
  });
  assert.deepEqual(ecretees, { a: 1, b: 0 });
  // Écartées : F2 Résultat (domicile contre nul) et F2 Total buts (1,5 contre 2,5) = choix différents ; F2 corners sans statistiques = non réglable ;
  // F3 sans résultat ; la 2e équipe à « plus de pronostic » chez B ; un marché seulement chez A, un seulement chez B.
  assert.deepEqual(ecartees, { sansPaire: 2, plusDePronostic: 1, sansResultat: 1, choixDifferents: 2, nonReglable: 1, sansProbabilite: 0, sansCote: 0 });
  // Les lignes vont telles quelles au juge.
  assert.equal(comparer(lignes, { sens: 'min', minBlocs: 2 }).n.blocs, 2);
  // Une probabilité absente d'un côté : comptée, jamais lue comme 0.
  const sansProba = apparierPronostics({ picksA: A.map((p) => (p.marketKey === 'bothTeamsScore' ? { ...p, probability: null } : p)), picksB: B, resultats: RESULTATS, mesure: 'perte-log-binaire' });
  assert.equal(sansProba.ecartees.sansProbabilite, 2);
  assert.equal(sansProba.lignes.length, 3);
});

test('adaptateur, gain : chaque version mise 1 sur SON choix quand elle a une cote de marché ; sans cote des deux côtés, la paire est comptée « sans cote » ; bloc par journée', () => {
  const { A, B } = deuxListes();
  const { lignes, ecartees, ecretees } = apparierPronostics({ picksA: A, picksB: B, resultats: RESULTATS, mesure: 'gain', bloc: blocParJournee });
  assert.equal(ecretees, undefined);
  // F1 Résultat : les deux sur domicile à 1,9, gagné → +0,9 chacun. F2 Résultat (0-0) : A domicile à 2,1 perdu → −1 ; B nul à 3,2 gagné → +2,2.
  assert.deepEqual(lignes.map((l) => l.cle), [`${F1}|result`, `${F2}|result`]);
  proche(lignes[0].gainA, 0.9, 1e-12);
  proche(lignes[0].gainB, 0.9, 1e-12);
  assert.deepEqual([lignes[1].gainA, lignes[1].miseA, lignes[1].miseB], [-1, 1, 1]);
  proche(lignes[1].gainB, 2.2, 1e-12);
  assert.deepEqual(lignes.map((l) => l.bloc), ['2026-11-12|Premier League', '2026-11-13|Premier League']);
  // Les marchés sans cote de marché (tout sauf le Résultat aujourd'hui) : « sans cote » ; F2 corners sans statistiques : non réglable.
  assert.deepEqual(ecartees, { sansPaire: 2, plusDePronostic: 1, sansResultat: 1, choixDifferents: 0, nonReglable: 1, sansProbabilite: 0, sansCote: 5 });
  // Une cote d'un seul côté : l'autre ne mise pas (0), la ligne reste.
  const seulA = apparierPronostics({ picksA: A, picksB: B.map((p) => (p.marketKey === 'result' && p.fixtureKey === F1 ? { ...p, marketOdds: null } : p)), resultats: RESULTATS, mesure: 'gain' });
  assert.deepEqual([seulA.lignes[0].miseA, seulA.lignes[0].miseB, seulA.lignes[0].gainB], [1, 0, 0]);
  assert.equal(seulA.lignes[0].bloc, F1, 'bloc par match par défaut');
  // Les clés et les blocs.
  assert.equal(cleAppariement(A[0]), `${F1}|result`);
  assert.equal(blocParMatch(A[0]), F1);
  assert.equal(blocParJournee({ date: '2026-11-12', league: null }), '2026-11-12|');
});

test('adaptateur : deux pronostics pour une même clé, une mesure qu’il ne sait pas faire, des résultats qui ne sont pas une Map — refusés', () => {
  const { A, B } = deuxListes();
  assert.throws(() => apparierPronostics({ picksA: [...A, A[0]], picksB: B, resultats: RESULTATS, mesure: 'gain' }), (e) => e instanceof LignesInvalides && /deux pronostics pour/.test(e.message));
  assert.throws(() => apparierPronostics({ picksA: A, picksB: B, resultats: RESULTATS, mesure: 'perte-log' }), LignesInvalides);
  assert.throws(() => apparierPronostics({ picksA: A, picksB: B, resultats: {}, mesure: 'gain' }), LignesInvalides);
  assert.throws(() => apparierPronostics({ picksA: [{ marketKey: 'result' }], picksB: B, resultats: RESULTATS, mesure: 'gain' }), LignesInvalides);
});

test('adaptateur : des paramètres illisibles sont comptés « non réglable », jamais « choix différents » — perte log binaire comme gain, d’un côté comme de l’autre', () => {
  const bon = resultat({ marketId: 'result', market: 'Résultat', params: '{"outcome":"home"}', choice: 'home', label: 'Arsenal gagne', probability: 0.6, marketOdds: 1.9 });
  for (const illisibles of ['{"outcome":"home"', '[1,2]', '42']) {
    const mauvais = { ...bon, params: illisibles, probability: 0.55 };
    for (const mesure of ['perte-log-binaire', 'gain']) {
      for (const [picksA, picksB] of [[[mauvais], [bon]], [[bon], [mauvais]]]) {
        const r = apparierPronostics({ picksA, picksB, resultats: RESULTATS, mesure });
        assert.deepEqual([r.lignes.length, r.ecartees.nonReglable, r.ecartees.choixDifferents], [0, 1, 0], `${mesure}, paramètres « ${illisibles} »`);
      }
    }
  }
  // Les mêmes paramètres lisibles des deux côtés : la ligne est là.
  assert.equal(apparierPronostics({ picksA: [bon], picksB: [{ ...bon, probability: 0.55 }], resultats: RESULTATS, mesure: 'perte-log-binaire' }).lignes.length, 1);
});

test('lecteur d’appoint : par identifiants FotMob et jour, seulement les matchs qui ont un score, un 0 des deux côtés = « non relevé », jamais une rencontre prise au hasard — sur une fausse base qui répond, sans base', () => {
  const vues = [];
  const lignesDeLaFausseBase = {
    '10|20|2026-11-12': [{ homeGoals: 2, awayGoals: 1, date: '2026-11-12', hc: 6, ac: 3, hs: 14, as_: 9, hsot: 5, asot: 2 }],
    '50|60|2026-11-13': [{ homeGoals: 0, awayGoals: 0, date: '2026-11-13', hc: 0, ac: 0, hs: null, as_: 8, hsot: 3, asot: 2 }],
    '70|80|2026-11-14': [
      { homeGoals: 1, awayGoals: 1, date: '2026-11-14' },
      { homeGoals: 2, awayGoals: 2, date: '2026-11-14' }
    ]
  };
  const fausseBase = {
    prepare(sql) {
      assert.match(sql, /FROM matches m/);
      assert.match(sql, /m\.home_goals IS NOT NULL AND m\.away_goals IS NOT NULL/);
      return {
        all: (domicile, exterieur, jour) => {
          vues.push(`${domicile}|${exterieur}|${jour}`);
          return lignesDeLaFausseBase[`${domicile}|${exterieur}|${jour}`] ?? [];
        }
      };
    }
  };
  const r = resultatsDuMagasin(['fotmob:10|20|2026-11-12', 'fotmob:10|20|2026-11-12', 'fotmob:50|60|2026-11-13', 'fotmob:70|80|2026-11-14', 'nom:premier league|arsenal|chelsea|2026-11-12', 'fotmob:1|2|2026-11-15'], { database: fausseBase });
  assert.deepEqual(vues, ['10|20|2026-11-12', '50|60|2026-11-13', '70|80|2026-11-14', '1|2|2026-11-15'], 'chaque clé lue une fois ; la clé par les noms jamais');
  assert.deepEqual([...r.keys()], ['fotmob:10|20|2026-11-12', 'fotmob:50|60|2026-11-13']);
  assert.deepEqual(r.get('fotmob:10|20|2026-11-12'), { homeGoals: 2, awayGoals: 1, date: '2026-11-12', stats: { home: { corners: 6, shots: 14, shotsOnTarget: 5 }, away: { corners: 3, shots: 9, shotsOnTarget: 2 } } });
  assert.deepEqual(r.get('fotmob:50|60|2026-11-13').stats, { home: { corners: null, shots: null, shotsOnTarget: 3 }, away: { corners: null, shots: null, shotsOnTarget: 2 } });
  assert.throws(() => resultatsDuMagasin(['fotmob:10|20|2026-11-12']), TypeError, 'la base vient toujours de l’appelant');
});

// ---------------------------------------- 16. étape 27 : le modèle de buts unique, sur le texte du code

/** Le texte d'un fichier sans ses commentaires (les phrases qui EXPLIQUENT une règle ne sont pas du code). */
const sansCommentaires = (texte) => texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const lire = (rel) => fs.readFileSync(path.join(SERVEUR, 'src', ...rel.split('/')), 'utf8');

test('étape 27 : aucune horloge lue dans le modèle de buts, son lecteur du direct et les forces de la nuit (Date.now(), new Date() sans argument) — « maintenant » passé par l’appelant ; seul analyzeMatch a un défaut, en bout de chaîne', () => {
  for (const rel of ['core/engine/goalModel.js', 'data/db/entreesButs.js', 'data/db/forcesButs.js', 'data/db/forcesButsEnfant.js']) {
    const code = sansCommentaires(lire(rel));
    assert.doesNotMatch(code, /Date\.now\s*\(/, `${rel} : Date.now()`);
    assert.doesNotMatch(code, /new Date\(\s*\)/, `${rel} : new Date() sans argument`);
    assert.doesNotMatch(code, /Math\.random/, `${rel} : du hasard`);
  }
  assert.match(lire('core/engine/oddsEngine.js'), /export async function analyzeMatch\(match, config, tiltState, sport, \{ maintenant = Date\.now\(\) \} = \{\}\)/);
});

test('étape 27 : dans oddsEngine.js, le modèle de buts (modeleDeButs, resolveGoalInputs) n’est appelé QUE dans la branche `if (reglagesButs)` — sans la clé, aucune ligne nouvelle ne s’exécute', () => {
  const code = sansCommentaires(lire('core/engine/oddsEngine.js'));
  const debut = code.indexOf('if (reglagesButs) {');
  assert.ok(debut > 0, 'la branche if (reglagesButs) existe');
  let profondeur = 0;
  let fin = -1;
  for (let i = code.indexOf('{', debut); i < code.length; i++) {
    if (code[i] === '{') profondeur++;
    else if (code[i] === '}' && --profondeur === 0) {
      fin = i;
      break;
    }
  }
  assert.ok(fin > debut);
  for (const appel of [/\bmodeleDeButs\(/g, /\.resolveGoalInputs\(/g]) {
    const positions = [...code.matchAll(appel)].map((m) => m.index);
    assert.ok(positions.length >= 1, `${appel} : appelé`);
    for (const p of positions) assert.ok(p > debut && p < fin, `${appel} hors de la branche if (reglagesButs) (position ${p})`);
  }
  // Les autres usages ne lisent que `buts`, nul sans la clé.
  assert.match(code, /let buts = null;\s*if \(reglagesButs\) \{/);
  assert.match(code, /const reglagesButs = reglagesDuModeleDeButs\(config\);/);
});

test('étape 27 : le chemin du moteur (les fichiers de son empreinte) n’importe ni l’indice de force, ni la valeur des statistiques, ni la table du jour J ; le modèle de buts est PUR (aucun module de données) ; son lecteur du direct ne lit ni stat_value ni team_strength, n’écrit jamais', async () => {
  const { fichiersDuMoteur, MODULES_DU_MOTEUR } = await import('../src/core/engine/engineVersions.js');
  const fichiers = fichiersDuMoteur();
  assert.ok(fichiers.includes('core/engine/goalModel.js') && fichiers.includes('data/db/entreesButs.js'), 'goalModel.js et entreesButs.js DANS l’empreinte');
  for (const dehors of ['data/db/forcesButs.js', 'data/db/forcesButsEnfant.js', 'core/engine/noteDuModeleDeButs.js', 'core/engine/motsDuModeleDeButs.js']) assert.ok(!fichiers.includes(dehors), `${dehors} HORS de l’empreinte`);
  assert.ok(MODULES_DU_MOTEUR.horsEmpreinte.includes('core/engine/noteDuModeleDeButs.js'));
  for (const rel of fichiers) {
    const importes = [...lire(rel).matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const spec of importes) assert.doesNotMatch(spec, /teamStrength|statValue|dayTable/, `${rel} importe ${spec}`);
  }
  const imports = (rel) => [...lire(rel).matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  for (const spec of imports('core/engine/goalModel.js')) assert.match(spec, /^\.\.?\/(\.\.\/)?(model|market|engine)?\/?[A-Za-z]+\.js$|^\.\/[A-Za-z]+\.js$|^\.\.\/(model|market)\/[A-Za-z]+\.js$/, `goalModel.js importe ${spec}`);
  for (const spec of imports('core/engine/goalModel.js')) assert.doesNotMatch(spec, /data\/|node:|db/, `goalModel.js importe ${spec}`);
  const lecteur = sansCommentaires(lire('data/db/entreesButs.js'));
  assert.doesNotMatch(lecteur, /stat_value|team_strength/i, 'entreesButs.js lit l’indice de force ou la valeur des statistiques');
  assert.doesNotMatch(lecteur, /\b(INSERT|UPDATE|DELETE|CREATE|DROP|BEGIN)\b|\.run\(|(database|db)\.exec\(/, 'entreesButs.js écrit');
  assert.match(lecteur, /if \(instant\(maintenant\) === null\) throw/, '« maintenant » obligatoire');
  assert.match(lecteur, /q\.kind <> 'live'/, 'jamais le direct');
});

test('étape 27 — LES MOTS du modèle de buts vivent HORS de l’empreinte (motsDuModeleDeButs.js) : changer une phrase ne change ni l’empreinte du code du moteur ni celle de la candidate ; changer une formule de goalModel.js les change ; goalModel.js ne garde que des codes', async () => {
  const { empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI, MODULES_DU_MOTEUR, fichiersDuMoteur } = await import('../src/core/engine/engineVersions.js');
  assert.ok(MODULES_DU_MOTEUR.horsEmpreinte.includes('core/engine/motsDuModeleDeButs.js'));
  assert.ok(!fichiersDuMoteur().includes('core/engine/motsDuModeleDeButs.js'), 'les mots HORS de l’empreinte');
  assert.ok(fichiersDuMoteur().includes('core/engine/goalModel.js'), 'le modèle DANS l’empreinte');
  // goalModel.js ne garde que des codes : aucune phrase pour Pierre.
  const code = sansCommentaires(lire('core/engine/goalModel.js'));
  assert.doesNotMatch(code, /court:|phrase:|pas d’xG|moyenne du marché\)|réglages fautifs|un objet est attendu|attendue/, 'goalModel.js : des mots pour Pierre');
  assert.match(code, /from '\.\/motsDuModeleDeButs\.js'/);
  // Aucune chaîne de mots non plus : seulement des codes (champs, régimes, sources, « 365 jours » / « défaut » des moyennes).
  const chaines = [...code.matchAll(/'([^'\n]*)'|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2]).filter((s) => / [a-zà-ü’]{3,} [a-zà-ü’]{3,}/i.test(s));
  assert.deepEqual(chaines, [], 'goalModel.js : une phrase restée dans le code');
  assert.doesNotMatch(lire('core/engine/motsDuModeleDeButs.js'), /^\s*import\s/m, 'les mots : aucun import');
  // Les messages déplacés sont rendus tels quels (le comportement ne change pas).
  const { faitsDeLaRencontre, reglagesDuModeleDeButs, ReglagesDuModeleDeButsInvalides } = await import('../src/core/engine/goalModel.js');
  const { MOTS_DES_ERREURS, MOTS_DES_REGLAGES } = await import('../src/core/engine/motsDuModeleDeButs.js');
  assert.throws(() => faitsDeLaRencontre({ club: 1, adversaire: 2, camp: 2, date: '2026-10-01', league: 47, saison: 2026, bp: 1, bc: 0 }), { message: MOTS_DES_ERREURS.pasLeCampQuiRecoit });
  assert.equal(MOTS_DES_ERREURS.pasLeCampQuiRecoit, 'faitsDeLaRencontre : la ligne du camp qui reçoit est attendue.');
  assert.throws(() => reglagesDuModeleDeButs({ modeleDeButs: 42 }), (e) => e instanceof ReglagesDuModeleDeButsInvalides && e.message === MOTS_DES_REGLAGES.objetAttendu);
  // Une copie de src (dans le dossier d'essais) : la référence, une phrase changée, puis une formule changée.
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const dossier = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-mots-'));
  try {
    fs.cpSync(path.join(SERVEUR, 'src'), dossier, { recursive: true });
    const avant = empreinteDuCode({ racine: dossier, rafraichir: true }).empreinte;
    assert.equal(avant, empreinteDuCode({ rafraichir: true }).empreinte, 'la copie = le code');
    const candidateAvant = empreinteDeLaCandidate(CANDIDATE_EN_ESSAI, { racine: dossier });
    const mots = path.join(dossier, 'core', 'engine', 'motsDuModeleDeButs.js');
    const texteMots = fs.readFileSync(mots, 'utf8');
    assert.ok(texteMots.includes("court: 'cotes + xG'"));
    fs.writeFileSync(mots, texteMots.replace("court: 'cotes + xG'", "court: 'cotes et xG'"));
    assert.equal(empreinteDuCode({ racine: dossier, rafraichir: true }).empreinte, avant, 'une phrase changée : même empreinte du moteur');
    assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI, { racine: dossier }), candidateAvant, 'une phrase changée : même empreinte de la candidate (l’essai continue)');
    const modele = path.join(dossier, 'core', 'engine', 'goalModel.js');
    const texteModele = fs.readFileSync(modele, 'utf8');
    assert.ok(texteModele.includes('const RESOLU = 1e-24;'));
    fs.writeFileSync(modele, texteModele.replace('const RESOLU = 1e-24;', 'const RESOLU = 1e-23;'));
    assert.notEqual(empreinteDuCode({ racine: dossier, rafraichir: true }).empreinte, avant, 'une formule changée : une autre empreinte du moteur');
    assert.notEqual(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI, { racine: dossier }), candidateAvant, 'une formule changée : une autre empreinte de la candidate');
  } finally {
    fs.rmSync(dossier, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
