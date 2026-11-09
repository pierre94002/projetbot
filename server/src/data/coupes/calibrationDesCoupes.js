/**
 * calibrationDesCoupes.js — LE SEUL REGARD DE L'ÉTAPE 36 : la calibration de la chance de qualification (lot 1,
 * 09/11/2026), RAPPORTÉE avec des bornes fixées d'avance — jamais un verdict, jamais de vert à l'écran.
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge ; le hasard SEMÉ seulement (graine 36). Imports : les constantes, la
 * formule (qualification.js) et la grille de goalModel.js (lecture).
 *
 * Ce que la fiche exige (« la chance de qualification est calibrée sur les matchs retour passés ») et ce que la critique
 * a corrigé (constats 1 et 2) : AUCUN banc de pronostic (rien n'est comparé à rien, K = 1 : la fiche coupes-v1) ; la chance
 * v1 de chaque confrontation jugée, calculée sur la BASE STATISTIQUE au jour J (forces de la candidate 27, sans cote ;
 * aucune cote de coupe au passé) RECALÉE sur l'autre pli (deux niveaux en forme fermée de Poisson, sur les unités dont le
 * score à la 90e est connu), puis :
 *   - LE MOT sur toutes les unités (régression de Cox, fourchettes par 1 000 tirages, écart moyen par dixième) ;
 *   - à côté, sans mot : les retours seuls, chaque nature, et le 1N2 À 90 MINUTES de la même base sur les mêmes matchs
 *     (il ne mêle pas la base et la règle d'après 90 minutes, que la chance mêle : critique, constat 15) ;
 *   - « annoncé / réalisé » : la chance moyenne de la favorite de chaque confrontation, la part qu'elle a gagnée.
 * Rien n'entre dans le moteur : hors de l'empreinte (data/coupes/), aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { grilleDesButs } from '../../core/engine/goalModel.js';
import { CALIBRATION, MOTS_DE_LA_CALIBRATION, PERIODES_DU_BANC, BASE_STATISTIQUE } from './reglagesCoupes.js';
import { chanceDeQualification, unNDeuxDeLaGrille } from './qualification.js';

/** La forme de la sortie de la calibration et de la note recopiée. */
export const VERSION_DE_LA_CALIBRATION = 1;

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const dans = (jour, p) => jour >= p.de && jour <= p.a;
const borne = (x) => Math.min(BASE_STATISTIQUE.bornes[1], Math.max(BASE_STATISTIQUE.bornes[0], x));
const arrondi = (x, d = 6) => (fini(x) ? Number(x.toFixed(d)) : null);

/** Générateur à graine (mulberry32), le même que celui des autres bancs du projet. */
export function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le pli JUGÉ d'un jour (0 : 2025-07 → 2026-09-23 ; 1 : 2023-07 → 2025-06), ou null hors des deux. */
export function pliDuJour(jour, periodes = PERIODES_DU_BANC) {
  const i = periodes.plis.findIndex((p) => dans(jour, p.juger));
  return i < 0 ? null : i;
}

/**
 * LES RECALAGES des deux plis : pour le pli f (jugé sur plis[f].juger), les niveaux appris sur plis[f].apprendre —
 * c_dom = ln(Σ buts du club qui reçoit à la 90e / Σ λS), c_ext de même, sur les unités dont le score à la 90e est connu.
 * `unites` : [{ date, lambdaS, muS, buts90: { dom, ext } | null }]. Rend [{ pli, cDom, cExt, n }].
 */
export function recalagesDesPlis(unites, periodes = PERIODES_DU_BANC) {
  return periodes.plis.map((p, f) => {
    let bd = 0;
    let be = 0;
    let ld = 0;
    let le = 0;
    let n = 0;
    for (const u of unites) {
      if (!dans(u.date, p.apprendre) || !u.buts90 || !fini(u.lambdaS) || !fini(u.muS)) continue;
      bd += u.buts90.dom;
      be += u.buts90.ext;
      ld += u.lambdaS;
      le += u.muS;
      n++;
    }
    return { pli: f, cDom: n && bd > 0 && ld > 0 ? Math.log(bd / ld) : 0, cExt: n && be > 0 && le > 0 ? Math.log(be / le) : 0, n };
  });
}

/** La chance v1 d'une unité sur la base recalée de son pli : { lambda, mu, chanceDom, unNDeux }. */
export function chanceDeLUnite(u, recalage) {
  const lambda = borne(u.lambdaS * Math.exp(recalage.cDom));
  const mu = borne(u.muS * Math.exp(recalage.cExt));
  const grille = grilleDesButs(lambda, mu, BASE_STATISTIQUE.rho);
  const c = chanceDeQualification({ grille, avance: u.avance ?? 0 });
  return { lambda, mu, chanceDom: c.dom.total, unNDeux: unNDeuxDeLaGrille(grille) };
}

const logit = (p) => Math.log(p / (1 - p));
const sigma = (z) => 1 / (1 + Math.exp(-z));
const plancher = (p) => Math.min(1 - CALIBRATION.plancher, Math.max(CALIBRATION.plancher, p));

/**
 * LA RÉGRESSION DE COX sur des points [{ p, y }] : logit(q) = α + β · logit(p), Newton depuis (0, 1). Rend { alpha, beta }
 * ou null (moins de 2 points, ou une matrice dégénérée).
 */
export function cox(points, { indices = null } = {}) {
  const n = indices ? indices.length : points.length;
  if (n < 2) return null;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const pt = points[indices ? indices[k] : k];
    xs[k] = logit(plancher(pt.p));
    ys[k] = pt.y;
  }
  let a = 0;
  let b = 1;
  for (let it = 0; it < CALIBRATION.newton.iterations; it++) {
    let g0 = 0;
    let g1 = 0;
    let h00 = 0;
    let h01 = 0;
    let h11 = 0;
    for (let k = 0; k < n; k++) {
      const s = sigma(a + b * xs[k]);
      const w = s * (1 - s);
      const r = ys[k] - s;
      g0 += r;
      g1 += r * xs[k];
      h00 += w;
      h01 += w * xs[k];
      h11 += w * xs[k] * xs[k];
    }
    const det = h00 * h11 - h01 * h01;
    if (!(Math.abs(det) > 1e-12)) return null;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a += da;
    b += db;
    if (!fini(a) || !fini(b)) return null;
    if (Math.max(Math.abs(da), Math.abs(db)) < CALIBRATION.newton.arret) break;
  }
  return { alpha: a, beta: b };
}

/** Les DIXIÈMES : les points rangés par p (puis par clé), dix groupes de tailles égales à un près ; { groupes, ecartMoyen }. */
export function dixiemes(points, k = CALIBRATION.dixiemes) {
  const tries = [...points].sort((x, y) => x.p - y.p || (x.cle < y.cle ? -1 : x.cle > y.cle ? 1 : 0));
  const n = tries.length;
  const groupes = [];
  for (let g = 0; g < k; g++) {
    const de = Math.floor((g * n) / k);
    const a = Math.floor(((g + 1) * n) / k);
    const part = tries.slice(de, a);
    if (!part.length) continue;
    const chance = part.reduce((s, x) => s + x.p, 0) / part.length;
    const frequence = part.reduce((s, x) => s + x.y, 0) / part.length;
    groupes.push({ n: part.length, chance: arrondi(chance), frequence: arrondi(frequence) });
  }
  const ecartMoyen = groupes.length ? groupes.reduce((s, x) => s + Math.abs(x.chance - x.frequence), 0) / groupes.length : null;
  return { groupes, ecartMoyen: arrondi(ecartMoyen) };
}

/** Le percentile d'une liste TRIÉE (2,5 % : l'indice ⌊0,025 B⌋ ; 97,5 % : ⌈0,975 B⌉ − 1). */
const percentiles = (tries) => [tries[Math.floor(0.025 * tries.length)], tries[Math.ceil(0.975 * tries.length) - 1]];

/** LE MOT de la calibration, fixé d'avance (reglagesCoupes.js, CALIBRATION.bornes). */
export function motDeLaCalibration({ n, beta, alphaIc, betaIc, ecartMoyen }) {
  const B = CALIBRATION.bornes;
  if (!(n >= CALIBRATION.minUnites) || !fini(beta) || !betaIc || !alphaIc) return MOTS_DE_LA_CALIBRATION.pasAssez;
  const dansB = betaIc[0] >= B.beta[0] && betaIc[1] <= B.beta[1];
  const dansA = alphaIc[0] >= B.alpha[0] && alphaIc[1] <= B.alpha[1];
  if (dansB && dansA && fini(ecartMoyen) && ecartMoyen <= B.ecartMoyenMax) return MOTS_DE_LA_CALIBRATION.calibree;
  if (beta < B.beta[0]) return MOTS_DE_LA_CALIBRATION.tropSure;
  if (beta > B.beta[1]) return MOTS_DE_LA_CALIBRATION.pasAssezSure;
  return MOTS_DE_LA_CALIBRATION.nonTranche;
}

/**
 * LA CALIBRATION de points [{ cle, p, y }] : Cox et ses fourchettes (1 000 tirages des points, graine 36), les dixièmes,
 * l'écart moyen, et — `avecMot` — le mot fixé d'avance. Rend { n, alpha, beta, alphaIc, betaIc, dixiemes, ecartMoyen,
 * mot | null, tirages }.
 */
export function calibrer(points, { avecMot = false, tirages = CALIBRATION.tirages, graine = CALIBRATION.graine } = {}) {
  const n = points.length;
  const base = cox(points);
  const { groupes, ecartMoyen } = dixiemes(points);
  let alphaIc = null;
  let betaIc = null;
  let valides = 0;
  if (base && n >= 2) {
    const alea = generateur(graine);
    const as = [];
    const bs = [];
    const indices = new Array(n);
    for (let t = 0; t < tirages; t++) {
      for (let k = 0; k < n; k++) indices[k] = Math.floor(alea() * n);
      const f = cox(points, { indices });
      if (!f) continue;
      as.push(f.alpha);
      bs.push(f.beta);
    }
    valides = as.length;
    if (valides) {
      as.sort((x, y) => x - y);
      bs.sort((x, y) => x - y);
      alphaIc = percentiles(as).map((x) => arrondi(x));
      betaIc = percentiles(bs).map((x) => arrondi(x));
    }
  }
  const sortie = { n, alpha: arrondi(base?.alpha), beta: arrondi(base?.beta), alphaIc, betaIc, dixiemes: groupes, ecartMoyen, tirages: { demandes: tirages, valides, graine } };
  return { ...sortie, mot: avecMot ? motDeLaCalibration({ n, beta: base?.beta ?? null, alphaIc, betaIc, ecartMoyen }) : null };
}

/** « Annoncé / réalisé » : la chance moyenne de la FAVORITE de chaque confrontation, et la part de celles qu'elle a gagnées. */
export function annonceRealise(points) {
  if (!points.length) return { n: 0, annonce: null, realise: null };
  let a = 0;
  let r = 0;
  for (const x of points) {
    const favDom = x.p >= 0.5;
    a += favDom ? x.p : 1 - x.p;
    r += favDom ? x.y : 1 - x.y;
  }
  return { n: points.length, annonce: arrondi(a / points.length), realise: arrondi(r / points.length) };
}

/**
 * LA CALIBRATION COMPLÈTE (le passage unique). `unites` : les unités jugées [{ cle, date, league, nature, avance, lambdaS,
 * muS, qualifieDom (0/1), buts90 | null }] (dans les deux plis, rien après le dernier jour lu). Rend { recalages, toutes,
 * retours, parNature, unNDeuxA90, annonceRealise, unites (n par pli) }.
 */
export function calibrationDesCoupes(unites, { periodes = PERIODES_DU_BANC, tirages = CALIBRATION.tirages } = {}) {
  for (const u of unites) if (u.date > periodes.dernierJourLu) throw new Error(`calibration : une unité après le dernier jour lu (${u.date})`);
  const recalages = recalagesDesPlis(unites, periodes);
  const points = [];
  const points90 = { home: [], draw: [], away: [] };
  const parPli = [0, 0];
  for (const u of unites) {
    const f = pliDuJour(u.date, periodes);
    if (f === null) continue;
    const c = chanceDeLUnite(u, recalages[f]);
    points.push({ cle: u.cle, p: c.chanceDom, y: u.qualifieDom ? 1 : 0, nature: u.nature, pli: f });
    parPli[f]++;
    if (u.buts90) {
      const issue = u.buts90.dom > u.buts90.ext ? 'home' : u.buts90.dom < u.buts90.ext ? 'away' : 'draw';
      for (const k of ['home', 'draw', 'away']) points90[k].push({ cle: u.cle, p: c.unNDeux[k], y: issue === k ? 1 : 0 });
    }
  }
  const toutes = calibrer(points, { avecMot: true, tirages });
  const retours = calibrer(points.filter((x) => x.nature === 'retour'), { tirages });
  const parNature = Object.fromEntries(['retour', 'match-unique', 'finale'].map((n) => [n, { ...calibrer(points.filter((x) => x.nature === n), { tirages }), ...annonceRealise(points.filter((x) => x.nature === n)) }]));
  const unNDeuxA90 = Object.fromEntries(['home', 'draw', 'away'].map((k) => [k, calibrer(points90[k], { tirages })]));
  return {
    recalages: recalages.map((r) => ({ pli: r.pli, cDom: arrondi(r.cDom), cExt: arrondi(r.cExt), n: r.n })),
    toutes: { ...toutes, ...annonceRealise(points) },
    retours: { ...retours, ...annonceRealise(points.filter((x) => x.nature === 'retour')) },
    parNature,
    unNDeuxA90: { n: points90.home.length, ...unNDeuxA90 },
    unitesParPli: parPli
  };
}

/** Les lignes du tableau « Ce que dit le banc d'essai » (critique, Lot L : cinq lignes) et ce qui les porte. */
export const LIGNES_DU_TABLEAU = Object.freeze(['chance', 'prolongation', 'tirsAuBut', 'terrainNeutre', 'avanceAuCumul']);

/**
 * LA NOTE à recopier (par script) depuis la sortie du passage unique : la calibration rapportée (le mot, les chiffres, les
 * retours et le 1N2 à 90 minutes à côté) et les lignes « non mesuré » du tableau. Jamais un statut « mesuré » : la chance
 * de la page part de son 1N2 et n'est vérifiée que sur les matchs de Pierre (fiches figées par la nuit).
 */
export function aRecopier(sortieDeLaCalibration, { sortie = null } = {}) {
  const c = sortieDeLaCalibration?.calibration;
  if (!c || sortieDeLaCalibration.format !== VERSION_DE_LA_CALIBRATION) throw new Error('aRecopier : ce n’est pas une sortie de la calibration des coupes (format 1)');
  const resume = (x) => ({ n: x.n, alpha: x.alpha, beta: x.beta, alphaIc: x.alphaIc, betaIc: x.betaIc, ecartMoyen: x.ecartMoyen, annonce: x.annonce ?? null, realise: x.realise ?? null, mot: x.mot ?? null });
  return {
    format: VERSION_DE_LA_CALIBRATION,
    calculeLe: String(sortieDeLaCalibration.premierRegard ?? '').slice(0, 10),
    premierRegard: sortieDeLaCalibration.premierRegard ?? null,
    ou: 'bac à sable',
    regles: { fichier: sortieDeLaCalibration.regles?.copie ?? null, sha1: sortieDeLaCalibration.regles?.sha1 ?? null, ecritesAvantLeRegard: true },
    sortie,
    empreinteDuMoteur: sortieDeLaCalibration.empreinteDuMoteur ?? null,
    K: 1,
    periodes: { de: PERIODES_DU_BANC.plis[1].juger.de, a: PERIODES_DU_BANC.dernierJourLu },
    unites: (c.unitesParPli ?? []).reduce((s, x) => s + x, 0),
    calibration: {
      toutes: { ...resume(c.toutes), dixiemes: c.toutes.dixiemes },
      retours: resume(c.retours),
      parNature: Object.fromEntries(Object.entries(c.parNature).map(([k, v]) => [k, resume(v)])),
      unNDeuxA90: { n: c.unNDeuxA90.n, ...Object.fromEntries(['home', 'draw', 'away'].map((k) => [k, resume(c.unNDeuxA90[k])])) },
      recalages: c.recalages
    },
    lignes: {
      chance: { statut: 'rapporte', mot: c.toutes.mot },
      prolongation: { statut: 'non-mesure', raison: 'pile-ou-face' },
      tirsAuBut: { statut: 'non-mesure', raison: 'pile-ou-face' },
      terrainNeutre: { statut: 'non-mesurable', raison: 'trop-peu-de-matchs' },
      avanceAuCumul: { statut: 'non-mesure', raison: 'trop-peu-de-retours' }
    }
  };
}

/** Le TEXTE de noteDesCoupes.js (écrit par script ; T-B7 le refait à l'octet). `note` null : « pas encore mesuré ». */
export function texteDeLaNote(note) {
  return [
    '/**',
    ' * noteDesCoupes.js — CE QUE DIT LA CALIBRATION DE LA CHANCE DE QUALIFICATION (étape 36 du plan, lot 1).',
    ' * -----------------------------------------------------------------------',
    ' * RECOPIÉ PAR SCRIPT (server/scripts/coupes.mjs --recopier, sur la sortie du passage unique), jamais retapé à la main :',
    ' * le test T-B7 (coupesCalibration.test.mjs) refait ce texte à l’octet depuis la sortie gardée dans test/fixtures',
    ' * (calibration-coupes-etape36.json, et les règles écrites avant le regard : banc-regles-etape36.md).',
    ' * COUPES_AU_BANC : la calibration RAPPORTÉE (le mot fixé d’avance, les chiffres, les retours et le 1N2 à 90 minutes à',
    ' * côté) et les lignes « non mesuré » du tableau de l’écran. Jamais un statut « mesuré » : la chance de la page part de',
    ' * son 1N2 et ne sera vérifiée que sur vos matchs (les fiches figées de la nuit).',
    ' * Hors de l’empreinte du moteur (data/coupes/) : aucun chiffre du moteur n’en dépend. Pur : ne lit rien.',
    ' * -----------------------------------------------------------------------',
    ' */',
    '',
    '/** Gèle un objet et tout ce qu’il contient : la note ne se modifie pas en mémoire. */',
    'const gele = (o) => {',
    "  if (o && typeof o === 'object' && !Object.isFrozen(o)) {",
    '    Object.freeze(o);',
    '    for (const v of Object.values(o)) gele(v);',
    '  }',
    '  return o;',
    '};',
    '',
    '/** La calibration de la chance de qualification (null = pas encore mesurée). */',
    `export const COUPES_AU_BANC = ${note === null ? 'null' : `gele(${JSON.stringify(note)})`};`,
    ''
  ].join('\n');
}
