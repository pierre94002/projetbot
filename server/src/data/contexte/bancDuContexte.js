/**
 * bancDuContexte.js — LE BANC DU CONTEXTE DU MATCH (étape 32 du plan, partie B, 29/10/2026).
 * -----------------------------------------------------------------------
 * Le calcul du banc, PUR : ni base, ni fichier, ni horloge, ni hasard (le seul hasard est le générateur à graine du juge
 * de l'étape 16). Les rencontres lui sont apportées par le processus à part (contexteBancEnfant.js, base en lecture
 * seule) ; il rend les verdicts. Ce qu'il applique a été FIXÉ AVANT LE REGARD UNIQUE (reglagesContexte.js : PRIOR_SD,
 * PERIODES_DU_BANC, JUGE_DU_BANC, AMPLEUR ; bench/lancements.js : VARIANTES_DE_L_ETAPE_32 ; ici : les formes des
 * variantes, la base statistique, le faux facteur) — décisions de l'orchestrateur du 29/10/2026 et critique :
 *   - LA BASE : le modèle statistique des buts de la candidate de l'étape 27 (régime « sans cote » de modeleDeButs,
 *     BASE_STATISTIQUE, copie figée de ses réglages), RECALÉE par pli : deux niveaux en forme fermée de Poisson,
 *     c_dom = ln(Σ buts dom. à la 90e / Σ λS), c_ext de même, sur la période d'apprentissage du pli. Les niveaux sont
 *     FIXÉS (constat 3) : seuls les coefficients du facteur sont appris ; le banc mesure donc le CONTRASTE « concerné /
 *     non concerné » sur une base juste en moyenne ;
 *   - L'APPRENTISSAGE : régression de Poisson pénalisée (a priori gaussien d'écart-type 0,1 sur chaque coefficient),
 *     méthode de Newton (25 itérations au plus, arrêt à 1e-10), buts à la 90e ; ρ ignoré pour apprendre ;
 *   - LE JUGE (constat 1) : la perte log du SCORE EXACT à la 90e, −ln p(score), sur la grille 0-20 de grilleDesButs
 *     (ρ de la base), plancher 1e-6 ; une ligne par match CONCERNÉ, bloc = le match ; DEUX PLIS : apprendre sur
 *     2023-07 → 2025-06 et juger 2025-07 → 2026-09-23, puis l'inverse ; les lignes des deux plis réunies dans UN SEUL
 *     comparer (le juge de l'étape 16, inchangé : moyenne, min, 1 000 tirages, graine 32, 200 blocs au moins), chaque
 *     ligne jugée avec des coefficients appris sur l'AUTRE pli ; K = le nombre de variantes déclarées ;
 *   - LES TÉMOINS : les 13 marchés binaires de buts (plus de 0,5 à 3,5, les deux marquent, buts de chaque équipe +0,5 à
 *     +3,5), rapportés, JAMAIS jugés ; ils donnent aussi l'AMPLEUR d'une variante (la plus grande des moyennes absolues
 *     de changement parmi les 13, sur les matchs jugés concernés, sans résultat — constat 10) ;
 *   - UTILE : « retenu » sur au moins 200 matchs concernés, ampleur d'au moins 0,5 point, et le faux facteur pas
 *     « retenu » (sinon le banc est faux : aucun facteur n'est utile, et c'est dit).
 * Rien ici n'entre dans le moteur : hors de l'empreinte (data/contexte/), aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { comparer, zPour } from '../../bench/guard.js';
import { VARIANTES_DE_L_ETAPE_32 } from '../../bench/lancements.js';
import { grilleDesButs, N_CALCUL } from '../../core/engine/goalModel.js';
import { PRIOR_SD, PERIODES_DU_BANC, JUGE_DU_BANC, AMPLEUR } from './reglagesContexte.js';
import { ArbitresAuJourJ, cleDeLArbitre, indicesDeLArbitre } from '../db/refereeRead.js';

/** La forme de la sortie du banc et de la note recopiée. */
export const VERSION_DU_BANC = 1;

/** Gèle un objet et tout ce qu'il contient. */
const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * LA BASE STATISTIQUE : les réglages `modeleDeButs` de la candidate de l'étape 27 (modele-buts-v1), recopiés et figés
 * le 29/10/2026 AVANT le regard (un test les compare à CANDIDATE_EN_ESSAI) : le banc reste défini même si la candidate
 * change ou est refusée. Seul le régime « sans cote » sert (fair: null) : λS, μS des forces et du démarrage à froid.
 */
export const BASE_STATISTIQUE = gele({
  version: 1,
  rho: -0.05,
  demiVies: { attaque: 35, defense: 25 },
  prior: 8,
  statistique: 'mix',
  poidsXg: 0.7,
  changementDeChampionnat: 'remise-a-zero',
  ancrage: { ligne: 2.5, methode: 'total-equilibre' },
  melange: { avecPlusMoins: { wT: 0.1, wS: 0.1 }, sans: { wT: 0.55, wS: 0.1 } },
  demarrageAFroid: { matchs: 8 },
  bornes: [0.2, 6]
});
/** L'empreinte des sommes des forces de cette base (empreinteDesForces de goalModel.js ; un test la recalcule). */
export const EMPREINTE_DE_LA_BASE = 'v1|35|25|remise-a-zero';
/** Le ρ des grilles du juge : celui de la base. */
export const RHO_DU_BANC = BASE_STATISTIQUE.rho;

/** Newton : au plus 25 itérations, arrêt quand le plus grand pas est sous 1e-10. */
export const NEWTON = Object.freeze({ iterations: 25, arret: 1e-10 });
/** Le faux facteur : FNV-1a de « clé du match:camp » (camp 1 = qui reçoit, 0 = visiteur), mod 100, de 0 à 14. */
export const PLACEBO = Object.freeze({ modulo: 100, seuil: 15 });
/** Une variante n'est utile que jugée sur au moins 200 matchs concernés. */
export const MIN_MATCHS_UTILE = 200;
/** La fiche retenue (déclarée, comptée dans K) : elle ne lit aucun résultat, elle n'est pas jugée. */
export const FICHE_RETENUE = 'contexte-v1';

/**
 * LES FORMES DES VARIANTES (fixées avant le regard ; les noms sont ceux de VARIANTES_DE_L_ETAPE_32) :
 *   camp      un drapeau par camp (« dom », « ext ») : les buts du club concerné × e^sesButs, ceux de son adversaire
 *             × e^butsAdverses (les deux camps concernés : les deux effets s'ajoutent) ;
 *   lieu      un drapeau par match : buts du club qui reçoit × e^domicile, du visiteur × e^visiteur ;
 *   distance  x = ln(1 + km/100) − le centre de l'apprentissage du pli : buts du visiteur × e^(visiteur·x), du club qui
 *             reçoit × e^(domicile·x) ;
 *   arbitre   z = l'indice « de buts » de l'arbitre au jour J face à la base recalée du pli : les buts des deux équipes
 *             × e^(lesDeux·z).
 */
export const FORMES = gele({
  'repos-court': { sorte: 'camp', cle: 'reposCourt', coefficients: ['sesButs', 'butsAdverses'], facteur: 'repos' },
  'enchainement-serre': { sorte: 'camp', cle: 'serre', coefficients: ['sesButs', 'butsAdverses'], facteur: 'enchainement' },
  'deplacement-distance': { sorte: 'distance', cle: 'lnKm', coefficients: ['visiteur', 'domicile'], facteur: 'deplacement' },
  'deplacement-altitude': { sorte: 'lieu', cle: 'altitude', coefficients: ['domicile', 'visiteur'], facteur: 'altitude' },
  'pelouse-synthetique': { sorte: 'lieu', cle: 'synthetique', coefficients: ['domicile', 'visiteur'], facteur: 'pelouse' },
  'arbitre-buts': { sorte: 'arbitre', cle: 'zArbitre', coefficients: ['lesDeux'], facteur: 'arbitre' },
  'entraineur-nouveau': { sorte: 'camp', cle: 'nouveau', coefficients: ['sesButs', 'butsAdverses'], facteur: 'entraineur' },
  placebo: { sorte: 'camp', cle: 'placebo', coefficients: ['sesButs', 'butsAdverses'], facteur: 'controle' }
});

/** Les variantes JUGÉES : toutes les déclarées sauf la fiche retenue. */
export const VARIANTES_JUGEES = Object.freeze(VARIANTES_DE_L_ETAPE_32.map((v) => v.id).filter((id) => id !== FICHE_RETENUE));

/** Les neuf lignes de l'encadré et la variante de chacune (null : non mesurable au banc). */
export const FACTEURS_DU_BANC = gele({
  repos: 'repos-court',
  enchainement: 'enchainement-serre',
  deplacement: 'deplacement-distance',
  altitude: 'deplacement-altitude',
  pelouse: 'pelouse-synthetique',
  meteo: null,
  arbitre: 'arbitre-buts',
  entraineur: 'entraineur-nouveau',
  enjeu: null
});

/** Les mesures connues : la perte du score exact (décision 1) ; « marches-13 » n'est qu'une démonstration du piège (T-B2bis). */
export const MESURES_DU_JUGE = Object.freeze(['perte-log-score-exact', 'marches-13']);
/** LA mesure du juge du banc (décision 1 de l'orchestrateur, constat 1 de la critique) : la perte log du score exact. */
export const MESURE_DU_JUGE = 'perte-log-score-exact';
if (JUGE_DU_BANC.mesure !== MESURE_DU_JUGE) throw new Error(`banc du contexte : la mesure fixée avant le regard (${JUGE_DU_BANC.mesure}) n'est pas celle du juge`);

// ======================================================= le faux facteur

/** FNV-1a 32 bits des octets UTF-8 d'un texte (rend un entier de 0 à 2^32 − 1). */
export function fnv1a(texte) {
  const octets = new TextEncoder().encode(String(texte));
  let h = 0x811c9dc5;
  for (const o of octets) {
    h ^= o;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Le camp est-il « concerné » par le faux facteur ? FNV-1a(« clé:camp ») mod 100 < 15. */
export const placeboConcerne = (matchKey, camp) => fnv1a(`${matchKey}:${camp}`) % PLACEBO.modulo < PLACEBO.seuil;

// ======================================================= les caractéristiques d'un match (pures, sans résultat)

const drapeau = (b) => (b ? 1 : 0);

/**
 * Ce que chaque variante lit d'une FICHE au jour J (contexteAuJourJ.fiche ; aucune n'y lit un résultat). `pelouseEcartee` :
 * le club qui reçoit est dans la liste des clubs dont la pelouse a pu changer (fixée avant le regard par --comptes) — sa
 * pelouse vaut alors null (non concerné, constat 6). L'indice de l'arbitre dépend du pli (la base recalée) : il est posé
 * plus tard (indicesDArbitreParPli) ; ici, la clé de l'arbitre seulement.
 */
export function caracteristiquesDeLaFiche(fiche, { matchKey, pelouseEcartee = false }) {
  const surface = fiche?.pelouse?.surface ?? null;
  return {
    reposCourt: { dom: drapeau(fiche.repos.home.classe === 'court'), ext: drapeau(fiche.repos.away.classe === 'court') },
    serre: { dom: drapeau(fiche.enchainement.home.serre === true), ext: drapeau(fiche.enchainement.away.serre === true) },
    lnKm: fini(fiche.deplacement?.lnKm) ? fiche.deplacement.lnKm : null,
    altitude: drapeau(fiche.altitude?.concerne === true),
    synthetique: pelouseEcartee || !surface ? null : surface === 'synthetique' ? 1 : 0,
    nouveau: { dom: drapeau(fiche.entraineur.home.nouveau === true), ext: drapeau(fiche.entraineur.away.nouveau === true) },
    placebo: { dom: drapeau(placeboConcerne(matchKey, 1)), ext: drapeau(placeboConcerne(matchKey, 0)) },
    arbitre: fiche.arbitre?.cle ?? null,
    zArbitre: null
  };
}

/**
 * Les lignes de la régression d'un match pour une forme : { dom: [x…], ext: [x…] } (une valeur par coefficient), ou null
 * si le match n'est pas concerné (tous ses multiplicateurs valent 1). `centre` : celui des distances du pli ; `pli` :
 * l'indice du pli (l'indice d'arbitre en dépend).
 */
export function lignesDeLaForme(forme, x, { centre = 0, pli = 0 } = {}) {
  if (!x) return null;
  if (forme.sorte === 'camp') {
    const v = x[forme.cle];
    if (!v || (!v.dom && !v.ext)) return null;
    return { dom: [v.dom, v.ext], ext: [v.ext, v.dom] };
  }
  if (forme.sorte === 'lieu') {
    if (x[forme.cle] !== 1) return null;
    return { dom: [1, 0], ext: [0, 1] };
  }
  if (forme.sorte === 'distance') {
    const l = x[forme.cle];
    if (!fini(l)) return null;
    const d = l - centre;
    if (d === 0) return null;
    return { dom: [0, d], ext: [d, 0] };
  }
  if (forme.sorte === 'arbitre') {
    const z = Array.isArray(x[forme.cle]) ? x[forme.cle][pli] : null;
    if (!fini(z) || z === 0) return null;
    return { dom: [z], ext: [z] };
  }
  throw new Error(`banc du contexte : forme inconnue « ${forme.sorte} »`);
}

const produit = (r, b) => {
  let s = 0;
  for (let k = 0; k < r.length; k++) s += r[k] * b[k];
  return s;
};

/** Les multiplicateurs d'un match (e^η du club qui reçoit et du visiteur), ou null s'il n'est pas concerné. */
export function multiplicateurs(forme, x, vecteur, options = {}) {
  const L = lignesDeLaForme(forme, x, options);
  if (!L) return null;
  return { dom: Math.exp(produit(L.dom, vecteur)), ext: Math.exp(produit(L.ext, vecteur)) };
}

// ======================================================= la base recalée, l'apprentissage

const dans = (jour, p) => jour >= p.de && jour <= p.a;

/** Le recalage d'une base sur des matchs (forme fermée de Poisson) : { cDom, cExt, matchs } ; seuls ceux avec base et buts. */
export function recalerLaBase(matchs) {
  let yd = 0;
  let ye = 0;
  let ld = 0;
  let le = 0;
  let n = 0;
  for (const m of matchs) {
    if (!m.buts || !m.base) continue;
    yd += m.buts.dom;
    ye += m.buts.ext;
    ld += m.base.lambda;
    le += m.base.mu;
    n += 1;
  }
  if (!n || !(yd > 0) || !(ye > 0) || !(ld > 0) || !(le > 0)) throw new Error(`banc du contexte : recalage impossible (${n} matchs avec base et buts)`);
  return { cDom: Math.log(yd / ld), cExt: Math.log(ye / le), matchs: n };
}

/** Les recalages des deux plis, chacun sur SA période d'apprentissage. */
export function recalagesDesPlis(matchs, periodes = PERIODES_DU_BANC) {
  return periodes.plis.map((p) => recalerLaBase(matchs.filter((m) => dans(m.date, p.apprendre))));
}

/** Le centre des distances d'une période : la moyenne de ln(1 + km/100) de ses matchs (avec base et buts) dont la distance est connue. */
export function centreDesDistances(matchs) {
  let s = 0;
  let n = 0;
  for (const m of matchs) {
    if (!m.buts || !m.base || !fini(m.x?.lnKm)) continue;
    s += m.x.lnKm;
    n += 1;
  }
  return n ? s / n : 0;
}

/** Résout H·d = g (H symétrique définie positive, 1 ou 2 dimensions… ou plus, par élimination de Gauss). */
function resoudre(H, g) {
  const n = g.length;
  if (n === 1) return [g[0] / H[0][0]];
  if (n === 2) {
    const det = H[0][0] * H[1][1] - H[0][1] * H[1][0];
    return [(g[0] * H[1][1] - g[1] * H[0][1]) / det, (H[0][0] * g[1] - H[1][0] * g[0]) / det];
  }
  const A = H.map((ligne, i) => [...ligne, g[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[pivot][c])) pivot = i;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    for (let i = c + 1; i < n; i++) {
      const f = A[i][c] / A[c][c];
      for (let k = c; k <= n; k++) A[i][k] -= f * A[c][k];
    }
  }
  const d = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = A[i][n];
    for (let k = i + 1; k < n; k++) s -= A[i][k] * d[k];
    d[i] = s / A[i][i];
  }
  return d;
}

/**
 * L'APPRENTISSAGE d'une variante : régression de Poisson pénalisée, niveaux FIXÉS (la base recalée en décalage), seuls
 * les coefficients de la forme appris. `matchs` : ceux de la période d'apprentissage (seuls ceux avec base, buts et
 * concernés comptent : les autres n'apportent rien à des niveaux fixés). Rend { coefficients: { nom: β }, vecteur,
 * matchs, iterations, converge }.
 */
export function apprendre(forme, matchs, { recalage, centre = 0, pli = 0, prior = PRIOR_SD, iterations = NEWTON.iterations, arret = NEWTON.arret } = {}) {
  if (!recalage || !fini(recalage.cDom) || !fini(recalage.cExt)) throw new Error('banc du contexte : apprendre sans recalage');
  const p = forme.coefficients.length;
  const obs = [];
  const eDom = Math.exp(recalage.cDom);
  const eExt = Math.exp(recalage.cExt);
  for (const m of matchs) {
    if (!m.buts || !m.base) continue;
    const L = lignesDeLaForme(forme, m.x, { centre, pli });
    if (!L) continue;
    obs.push({ y: m.buts.dom, off: m.base.lambda * eDom, r: L.dom });
    obs.push({ y: m.buts.ext, off: m.base.mu * eExt, r: L.ext });
  }
  const pen = 1 / (prior * prior);
  const b = new Array(p).fill(0);
  let it = 0;
  let converge = false;
  while (it < iterations) {
    it += 1;
    const g = b.map((x) => -pen * x);
    const H = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (__, j) => (i === j ? pen : 0)));
    for (const o of obs) {
      const mu = o.off * Math.exp(produit(o.r, b));
      for (let k = 0; k < p; k++) {
        if (o.r[k] === 0) continue;
        g[k] += (o.y - mu) * o.r[k];
        for (let l = 0; l < p; l++) H[k][l] += mu * o.r[k] * o.r[l];
      }
    }
    const d = resoudre(H, g);
    for (let k = 0; k < p; k++) b[k] += d[k];
    if (Math.max(...d.map((x) => Math.abs(x))) < arret) {
      converge = true;
      break;
    }
  }
  return { coefficients: Object.fromEntries(forme.coefficients.map((nom, k) => [nom, b[k]])), vecteur: [...b], matchs: obs.length / 2, iterations: it, converge };
}

// ======================================================= l'indice de l'arbitre face à la base recalée (variante arbitre-buts)

/**
 * L'INDICE « DE BUTS » DE CHAQUE ARBITRE AU JOUR J, pour chaque pli (constat 9) : ln((G + 10·ē) / (E + 10·ē)), G = buts
 * à la 90e de ses matchs d'avant J, E = Σ (λS·e^c_dom + μS·e^c_ext) de ces matchs (la base recalée du pli), ē = E / n ;
 * ArbitresAuJourJ (refereeRead.js), publication en fin de journée. `rencontres` : TOUTES les rencontres du flux, dans
 * l'ordre (jour, clé), mise en route comprise ({ cle, date, league, attribue, arbitre, cartons, penalties, buts,
 * moyenneButsLigue, base, x }). Pose x.zArbitre = [z du pli 0, z du pli 1] sur chaque rencontre qui a des
 * caractéristiques (null sans arbitre ou sans match d'avant J).
 */
export function indicesDArbitreParPli(rencontres, recalages) {
  recalages.forEach((rc, f) => {
    const arb = new ArbitresAuJourJ();
    const eDom = Math.exp(rc.cDom);
    const eExt = Math.exp(rc.cExt);
    let jour = null;
    let duJour = [];
    const publier = () => {
      for (const r of duJour) {
        if (r.x) {
          const cle = cleDeLArbitre(r.arbitre);
          const etat = cle ? arb.etat(cle) : null;
          const z = etat ? indicesDeLArbitre(etat).butsBase : null;
          if (!Array.isArray(r.x.zArbitre)) r.x.zArbitre = recalages.map(() => null);
          r.x.zArbitre[f] = fini(z) ? z : null;
        }
      }
      for (const r of duJour) {
        arb.ajouter({
          date: r.date,
          league: r.league,
          attribue: r.attribue,
          arbitre: r.arbitre,
          cartons: r.cartons ?? null,
          penalties: r.penalties ?? null,
          buts90: r.buts ?? null,
          moyenneButsLigue: r.moyenneButsLigue ?? null,
          baseButs: r.base ? r.base.lambda * eDom + r.base.mu * eExt : null
        });
      }
      arb.finDeJournee();
      duJour = [];
    };
    for (const r of rencontres) {
      if (jour !== null && r.date < jour) throw new Error(`banc du contexte : rencontres dans le désordre (${r.date} après ${jour})`);
      if (jour !== null && r.date !== jour) publier();
      jour = r.date;
      duJour.push(r);
    }
    publier();
  });
  return rencontres;
}

// ======================================================= le juge : la perte du score exact, les 13 marchés témoins

const T = N_CALCUL + 1;
const PMIN = JUGE_DU_BANC.plancher;
const borne = (x) => Math.min(BASE_STATISTIQUE.bornes[1], Math.max(BASE_STATISTIQUE.bornes[0], x));

/** La perte log du score exact à la 90e sur la grille 0-20 (plancher 1e-6 ; un score au-delà de 20 a la probabilité 0). */
export function perteDuScore(grille, buts) {
  const p = buts.dom <= N_CALCUL && buts.ext <= N_CALCUL ? grille[buts.dom * T + buts.ext] : 0;
  return -Math.log(Math.max(p, PMIN));
}

/** Les 13 marchés témoins, dans cet ordre. */
export const MARCHES_TEMOINS = Object.freeze(['plus05', 'plus15', 'plus25', 'plus35', 'lesDeuxMarquent', 'dom05', 'dom15', 'dom25', 'dom35', 'ext05', 'ext15', 'ext25', 'ext35']);

/**
 * Les 13 probabilités des marchés témoins d'une grille de calcul : les MÊMES sommes, dans le même ordre, que
 * marchesDeLaGrille (goalModel.js) — over05…over35, bothTeamsScore, homeTeamGoals.over05…, awayTeamGoals.over05… —
 * sans ses étiquettes en texte (un test les compare à l'égalité exacte sur des milliers de grilles).
 */
export function probabilitesTemoins(g) {
  let o0 = 0;
  let o1 = 0;
  let o2 = 0;
  let o3 = 0;
  let btts = 0;
  let d0 = 0;
  let d1 = 0;
  let d2 = 0;
  let d3 = 0;
  let e0 = 0;
  let e1 = 0;
  let e2 = 0;
  let e3 = 0;
  for (let i = 0; i <= N_CALCUL; i++) {
    for (let j = 0; j <= N_CALCUL; j++) {
      const p = g[i * T + j];
      if (p === 0) continue;
      if (i > 0 && j > 0) btts += p;
      const t = i + j;
      if (t > 0.5) o0 += p;
      if (i > 0.5) d0 += p;
      if (j > 0.5) e0 += p;
      if (t > 1.5) o1 += p;
      if (i > 1.5) d1 += p;
      if (j > 1.5) e1 += p;
      if (t > 2.5) o2 += p;
      if (i > 2.5) d2 += p;
      if (j > 2.5) e2 += p;
      if (t > 3.5) o3 += p;
      if (i > 3.5) d3 += p;
      if (j > 3.5) e3 += p;
    }
  }
  return [o0, o1, o2, o3, btts, d0, d1, d2, d3, e0, e1, e2, e3];
}

/** Les 13 issues (0/1) d'un score à la 90e, dans l'ordre de MARCHES_TEMOINS. */
export function issuesTemoins(buts) {
  const { dom: i, ext: j } = buts;
  const t = i + j;
  return [t > 0.5, t > 1.5, t > 2.5, t > 3.5, i > 0 && j > 0, i > 0.5, i > 1.5, i > 2.5, i > 3.5, j > 0.5, j > 1.5, j > 2.5, j > 3.5].map((b) => (b ? 1 : 0));
}

const perteBinaire = (p, y) => -Math.log(Math.max(y ? p : 1 - p, PMIN));
/** La somme des pertes log des 13 marchés témoins. */
export const perteDes13 = (probas, issues) => probas.reduce((s, p, q) => s + perteBinaire(p, issues[q]), 0);

/**
 * LES LIGNES DU JUGE pour des multiplicateurs donnés, sur les matchs `matchs` (avec base et buts) : la base recalée
 * (λS·e^c_dom, μS·e^c_ext, bornée comme le modèle) contre la base × multiplicateurs, seulement sur les matchs CONCERNÉS
 * (`multiplicateurDe(m)` rend { dom, ext } ou null). `mesure` : la perte du score exact (une ligne par match) ou, pour
 * la démonstration du piège seulement, les 13 marchés (13 lignes par match) ; bloc = le match. Rend aussi, sans
 * résultat, l'ampleur (moyenne absolue du changement de chaque marché témoin) et la perte des 13 témoins.
 */
export function lignesDuJuge({ matchs, multiplicateurDe, recalage, mesure = MESURE_DU_JUGE, cacheBase = null, pli = null }) {
  if (!MESURES_DU_JUGE.includes(mesure)) throw new Error(`banc du contexte : mesure inconnue « ${String(mesure)} »`);
  const eDom = Math.exp(recalage.cDom);
  const eExt = Math.exp(recalage.cExt);
  const lignes = [];
  const ampleur = new Float64Array(13);
  let concernes = 0;
  let temoinA = 0;
  let temoinB = 0;
  for (const m of matchs) {
    if (!m.buts || !m.base) continue;
    const mult = multiplicateurDe(m);
    if (!mult) continue;
    concernes += 1;
    const l0 = m.base.lambda * eDom;
    const m0 = m.base.mu * eExt;
    let base = cacheBase?.get(m.cle) ?? null;
    if (!base) {
      const g = grilleDesButs(borne(l0), borne(m0), RHO_DU_BANC);
      base = { score: perteDuScore(g, m.buts), probas: probabilitesTemoins(g) };
      cacheBase?.set(m.cle, base);
    }
    const gb = grilleDesButs(borne(l0 * mult.dom), borne(m0 * mult.ext), RHO_DU_BANC);
    const pb = probabilitesTemoins(gb);
    const issues = issuesTemoins(m.buts);
    for (let q = 0; q < 13; q++) ampleur[q] += Math.abs(pb[q] - base.probas[q]);
    const ta = perteDes13(base.probas, issues);
    const tb = perteDes13(pb, issues);
    temoinA += ta;
    temoinB += tb;
    if (mesure === 'perte-log-score-exact') {
      lignes.push({ bloc: m.cle, date: m.date, a: base.score, b: perteDuScore(gb, m.buts), ...(pli === null ? {} : { pli }) });
    } else {
      for (let q = 0; q < 13; q++) lignes.push({ bloc: m.cle, date: m.date, a: perteBinaire(base.probas[q], issues[q]), b: perteBinaire(pb[q], issues[q]) });
    }
  }
  return { lignes, concernes, ampleurSommes: [...ampleur], temoins: { perteA: temoinA, perteB: temoinB } };
}

/** Le juge de l'étape 16 sur des lignes (options du banc) : verdict, gain par ligne et en part de la perte de la base. */
export function jugerDesLignes(lignes, { K, tirages = JUGE_DU_BANC.tirages, graine = JUGE_DU_BANC.graine, minBlocs = JUGE_DU_BANC.minBlocs } = {}) {
  const r = comparer(lignes, { mode: 'moyenne', sens: 'min', variantes: K, tirages, graine, minBlocs });
  const base = r.a.moyenne;
  const relatif = (x) => (fini(x) && fini(base) && base > 0 ? x / base : null);
  return {
    verdict: r.verdict,
    raison: r.raison,
    lignes: r.n.lignes,
    blocs: r.n.blocs,
    perteBase: base,
    perteVariante: r.b.moyenne,
    gain: r.gain,
    ecartType: r.ecartType,
    fourchette: r.fourchette,
    gainRelatif: relatif(r.gain),
    fourchetteRelative: r.fourchette ? [relatif(r.fourchette[0]), relatif(r.fourchette[1])] : null,
    p: r.p,
    z: r.seuil.z,
    variantes: r.seuil.variantes
  };
}

/**
 * JUGER DES MULTIPLICATEURS FIXES (le cœur du juge, sans apprentissage) : les lignes de `matchs` puis comparer, avec
 * K variantes. La mesure est celle du juge du banc (la perte du score exact) ; « marches-13 » n'est accepté que pour
 * montrer le piège (test T-B2bis).
 */
export function jugerDesMultiplicateurs({ matchs, multiplicateurDe, recalage, K, mesure = MESURE_DU_JUGE, tirages, graine, minBlocs }) {
  const l = lignesDuJuge({ matchs, multiplicateurDe, recalage, mesure });
  return { ...jugerDesLignes(l.lignes, { K, tirages, graine, minBlocs }), concernes: l.concernes };
}

// ======================================================= le banc entier

/**
 * LES PLIS d'un jeu de matchs : pour chaque pli, ses matchs d'apprentissage, ses matchs jugés, son recalage et le centre
 * de ses distances (tous sur SA période d'apprentissage). Seuls les matchs avec base, buts et caractéristiques comptent ;
 * la mise en route (hors des deux périodes) n'est ni apprise ni jugée.
 */
export function plisDuBanc(matchs, periodes = PERIODES_DU_BANC) {
  const utilisables = matchs.filter((m) => m.buts && m.base && m.x);
  const recalages = recalagesDesPlis(utilisables, periodes);
  return periodes.plis.map((p, f) => {
    const apprendre = utilisables.filter((m) => dans(m.date, p.apprendre));
    return { pli: f, periode: p, apprendre, juger: utilisables.filter((m) => dans(m.date, p.juger)), recalage: recalages[f], centre: centreDesDistances(apprendre) };
  });
}

/**
 * UNE VARIANTE SUR LES DEUX PLIS : ses coefficients appris sur la période d'apprentissage de chaque pli, puis les lignes
 * des matchs JUGÉS de ce pli avec CES coefficients — chaque ligne est donc jugée avec des coefficients appris sur l'AUTRE
 * période (T-B6). Rend { lignes (chacune avec son pli), coefficients: [par pli], concernes, ampleurSommes, temoins }.
 */
export function lignesDUneVariante({ forme, plis, prior = PRIOR_SD, caches = null }) {
  const lignes = [];
  const ampleurSommes = new Array(13).fill(0);
  const temoins = { perteA: 0, perteB: 0 };
  const coefficients = [];
  let concernes = 0;
  for (const p of plis) {
    const appris = apprendre(forme, p.apprendre, { recalage: p.recalage, centre: p.centre, pli: p.pli, prior });
    coefficients.push({ pli: p.pli, apprisSur: p.periode.apprendre, jugeSur: p.periode.juger, ...appris });
    const l = lignesDuJuge({ matchs: p.juger, multiplicateurDe: (m) => multiplicateurs(forme, m.x, appris.vecteur, { centre: p.centre, pli: p.pli }), recalage: p.recalage, cacheBase: caches?.[p.pli] ?? null, pli: p.pli });
    lignes.push(...l.lignes);
    l.ampleurSommes.forEach((v, q) => {
      ampleurSommes[q] += v;
    });
    concernes += l.concernes;
    temoins.perteA += l.temoins.perteA;
    temoins.perteB += l.temoins.perteB;
  }
  return { lignes, coefficients, concernes, ampleurSommes, temoins };
}

/**
 * LE BANC : pour chaque variante jugée, ses coefficients appris sur chaque pli, puis UN jugement sur les lignes des deux
 * plis réunies (chacune jugée avec les coefficients de l'AUTRE pli). `matchs` : les rencontres JOUÉES avec base, buts à la
 * 90e et caractéristiques (x, zArbitre posé par indicesDArbitreParPli) — celles hors des deux plis sont ignorées, une
 * rencontre d'après le dernier jour lu fait LEVER (rien de P5). `K` doit valoir le nombre de variantes DÉCLARÉES
 * (VARIANTES_DE_L_ETAPE_32.length) ; une variante non déclarée, ou sans forme, fait lever. Rend { K, z, periodes,
 * recalages, centres, variantes: [...], placebo, bancFaux, utiles }.
 */
export function jugerLesVariantes(matchs, { periodes = PERIODES_DU_BANC, variantes = VARIANTES_JUGEES, K = VARIANTES_DE_L_ETAPE_32.length, declarees = VARIANTES_DE_L_ETAPE_32, prior = PRIOR_SD, tirages = JUGE_DU_BANC.tirages, graine = JUGE_DU_BANC.graine, minBlocs = JUGE_DU_BANC.minBlocs, recalages: recalagesDonnes = null } = {}) {
  const ids = declarees.map((v) => v.id);
  if (K !== ids.length) throw new Error(`banc du contexte : K (${K}) doit valoir le nombre de variantes déclarées (${ids.length}, VARIANTES_DE_L_ETAPE_32)`);
  for (const id of variantes) {
    if (!ids.includes(id)) throw new Error(`banc du contexte : la variante « ${id} » n'est pas déclarée (VARIANTES_DE_L_ETAPE_32) — refusée`);
    if (!FORMES[id]) throw new Error(`banc du contexte : la variante « ${id} » n'a pas de forme — refusée`);
  }
  if (periodes.plis.length !== 2) throw new Error('banc du contexte : deux plis attendus');
  const dernier = periodes.dernierJourLu;
  for (const m of matchs) if (m.date > dernier) throw new Error(`banc du contexte : la rencontre ${m.cle} du ${m.date} est après le dernier jour lu (${dernier}) — refusée`);
  const plis = plisDuBanc(matchs, periodes);
  const recalages = plis.map((p) => p.recalage);
  const utilisables = matchs.filter((m) => m.buts && m.base && m.x);
  if (recalagesDonnes) {
    recalages.forEach((rc, f) => {
      if (rc.cDom !== recalagesDonnes[f].cDom || rc.cExt !== recalagesDonnes[f].cExt) throw new Error(`banc du contexte : le recalage du pli ${f} ne redonne pas celui des indices d'arbitre`);
    });
  }
  const caches = plis.map(() => new Map());
  const resultats = [];
  for (const id of variantes) {
    const forme = FORMES[id];
    const v = lignesDUneVariante({ forme, plis, prior, caches });
    const { lignes, coefficients, concernes } = v;
    const ampleur = v.ampleurSommes;
    const temoinA = v.temoins.perteA;
    const temoinB = v.temoins.perteB;
    const juge = lignes.length ? jugerDesLignes(lignes, { K, tirages, graine, minBlocs }) : { verdict: 'pas-assez-de-matchs', lignes: 0, blocs: 0, gain: null, gainRelatif: null, fourchette: null, fourchetteRelative: null };
    const parMarche = Object.fromEntries(MARCHES_TEMOINS.map((nom, q) => [nom, concernes ? ampleur[q] / concernes : null]));
    const max = concernes ? Math.max(...ampleur) / concernes : null;
    const marcheMax = concernes ? MARCHES_TEMOINS[ampleur.indexOf(Math.max(...ampleur))] : null;
    const juges = plis.reduce((s, p) => s + p.juger.length, 0);
    resultats.push({
      id,
      sorte: forme.sorte,
      facteur: forme.facteur,
      coefficients,
      matchsJuges: juges,
      matchsConcernes: concernes,
      partConcernee: juges ? concernes / juges : null,
      ...juge,
      ampleur: { max, marche: marcheMax, parMarche, seuil: AMPLEUR.seuil },
      temoins: { marches: MARCHES_TEMOINS.length, perteBase: concernes ? temoinA / concernes : null, perteVariante: concernes ? temoinB / concernes : null, gainRelatif: temoinA > 0 ? (temoinA - temoinB) / temoinA : null, juge: false }
    });
  }
  const placebo = resultats.find((r) => r.id === 'placebo') ?? null;
  const bancFaux = placebo ? placebo.verdict === 'retenu' : false;
  for (const r of resultats) {
    const raisons = [];
    if (r.verdict !== 'retenu') raisons.push(`verdict « ${r.verdict} »`);
    if (!(r.matchsConcernes >= MIN_MATCHS_UTILE)) raisons.push(`${r.matchsConcernes} matchs concernés (au moins ${MIN_MATCHS_UTILE})`);
    if (!(fini(r.ampleur.max) && r.ampleur.max >= AMPLEUR.seuil)) raisons.push('ampleur sous 0,5 point');
    if (bancFaux) raisons.push('le faux facteur est « retenu » : le banc est faux');
    r.utile = r.id !== 'placebo' && raisons.length === 0;
    r.raisons = r.id === 'placebo' ? (bancFaux ? ['le faux facteur est « retenu » : le banc est faux'] : []) : raisons;
  }
  return {
    version: VERSION_DU_BANC,
    K,
    z: zPour(0.05, K),
    mesure: MESURE_DU_JUGE,
    periodes,
    prior,
    recalages,
    centres: plis.map((p) => p.centre),
    matchs: { utilisables: utilisables.length, plis: plis.map((p) => ({ apprendre: p.apprendre.length, juger: p.juger.length })) },
    variantes: resultats,
    placebo: placebo ? { verdict: placebo.verdict } : null,
    bancFaux,
    utiles: resultats.filter((r) => r.utile).map((r) => r.id)
  };
}

// ======================================================= la note recopiée (noteDuContexte.js) et le statut de chaque facteur

const arrondi = (x, n = 6) => (fini(x) ? Number(x.toFixed(n)) : null);
const arrondis = (a, n = 6) => (Array.isArray(a) ? a.map((x) => arrondi(x, n)) : null);

/**
 * CE QUI EST RECOPIÉ dans noteDuContexte.js (CONTEXTE_AU_BANC), tiré de la sortie du passage unique (banc-contexte.json)
 * — pur ; `sortie` : { fichier, sha1 } de la sortie recopiée telle quelle dans le code (test/fixtures). La recopie se fait
 * PAR SCRIPT (scripts/match-context.mjs --recopier), jamais à la main (test T-B7).
 */
export function aRecopier(sortieDuBanc, { sortie } = {}) {
  const b = sortieDuBanc?.banc;
  if (!b || sortieDuBanc.format !== VERSION_DU_BANC) throw new Error('aRecopier : ce n’est pas une sortie du banc du contexte (format 1)');
  const parId = new Map(b.variantes.map((v) => [v.id, v]));
  const facteurs = {};
  for (const [facteur, id] of Object.entries(FACTEURS_DU_BANC)) {
    const v = id ? parId.get(id) : null;
    facteurs[facteur] = id === null ? { variante: null, statut: 'non-mesurable' } : { variante: id, statut: v && v.utile && !b.bancFaux ? 'effet-mesure' : 'explication-seulement' };
  }
  return {
    format: VERSION_DU_BANC,
    calculeLe: String(sortieDuBanc.premierRegard ?? '').slice(0, 10),
    premierRegard: sortieDuBanc.premierRegard ?? null,
    ou: 'bac à sable',
    regles: { fichier: sortieDuBanc.regles?.copie ?? null, sha1: sortieDuBanc.regles?.sha1 ?? null, ecritesAvantLeRegard: true },
    sortie: sortie ?? null,
    empreinteDuMoteur: sortieDuBanc.empreinteDuMoteur ?? null,
    K: b.K,
    z: arrondi(b.z, 4),
    mesure: b.mesure,
    periodes: b.periodes,
    base: { reglages: 'modele-buts-v1 (régime sans cote), recalée par pli', recalages: b.recalages.map((r) => ({ cDom: arrondi(r.cDom), cExt: arrondi(r.cExt), matchs: r.matchs })) },
    matchs: b.matchs,
    variantes: b.variantes.map((v) => ({
      id: v.id,
      facteur: v.facteur,
      verdict: v.verdict,
      utile: v.utile,
      raisons: v.raisons,
      matchsJuges: v.matchsJuges,
      matchsConcernes: v.matchsConcernes,
      partConcernee: arrondi(v.partConcernee, 4),
      gainRelatif: arrondi(v.gainRelatif, 6),
      fourchetteRelative: arrondis(v.fourchetteRelative, 6),
      ampleur: { max: arrondi(v.ampleur.max, 5), marche: v.ampleur.marche },
      temoins: { gainRelatif: arrondi(v.temoins.gainRelatif, 6) },
      coefficients: v.coefficients.map((c) => ({ pli: c.pli, matchs: c.matchs, ...Object.fromEntries(Object.entries(c.coefficients).map(([k, x]) => [k, arrondi(x, 5)])) }))
    })),
    placebo: b.placebo,
    bancFaux: b.bancFaux,
    utiles: b.utiles,
    facteurs
  };
}

/**
 * Le statut d'un facteur pour l'écran : « pas-encore-mesure » tant que la note est null ; « non-mesurable » pour la météo
 * et l'enjeu ; « effet-mesure » seulement pour une variante utile d'un banc qui n'est pas faux ; sinon
 * « explication-seulement ».
 */
export function statutDuFacteur(note, facteur) {
  if (!(facteur in FACTEURS_DU_BANC)) throw new Error(`statutDuFacteur : facteur inconnu « ${facteur} »`);
  if (note === null || note === undefined) return 'pas-encore-mesure';
  if (FACTEURS_DU_BANC[facteur] === null) return 'non-mesurable';
  return note.facteurs?.[facteur]?.statut === 'effet-mesure' && note.bancFaux === false ? 'effet-mesure' : 'explication-seulement';
}

/** Le TEXTE de noteDuContexte.js pour une note (la recopie l'écrit tel quel ; le test T-B7 le refait à l'octet). */
export function texteDeLaNote(note) {
  return [
    '/**',
    ' * noteDuContexte.js — CE QUE DIT LE BANC DU CONTEXTE DU MATCH (étape 32 du plan, partie B).',
    ' * -----------------------------------------------------------------------',
    ' * RECOPIÉ PAR SCRIPT (server/scripts/match-context.mjs --recopier, sur la sortie du passage unique du banc), jamais',
    ' * retapé à la main : le test T-B7 (contexteBanc.test.mjs) refait ce texte à l’octet depuis la sortie gardée dans',
    ' * test/fixtures (banc-contexte-etape32.json, et les règles écrites avant le regard : banc-regles-etape32.md).',
    ' * CONTEXTE_AU_BANC : pour chaque facteur, sa variante, son verdict (le juge de l’étape 16, perte du score exact, deux',
    ' * plis, K variantes déclarées), son gain et sa fourchette, son ampleur, et son statut à l’écran (« effet-mesure »',
    ' * seulement pour une variante utile ; « explication-seulement » sinon ; « non-mesurable » pour la météo et l’enjeu).',
    ' * Hors de l’empreinte du moteur (data/contexte/) : aucun chiffre du moteur n’en dépend. Pur : ne lit rien.',
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
    '/** Le banc du contexte : verdicts, gains, fourchettes, ampleurs et statuts des facteurs (null = pas encore mesuré). */',
    `export const CONTEXTE_AU_BANC = ${note === null ? 'null' : `gele(${JSON.stringify(note)})`};`,
    ''
  ].join('\n');
}
