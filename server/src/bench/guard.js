/**
 * guard.js — le JUGE du garde-fou de la mesure (étape 16 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * Pour deux versions d'un calcul (A = l'ancienne, B = la nouvelle), une seule
 * question : B fait-elle mieux que A AU-DELÀ de ce que le hasard explique ?
 * Le juge reçoit des LIGNES APPARIÉES (une par match ou par pari : ce que
 * chaque version a dit, ce qui s'est passé), les rééchantillonne PAR BLOCS
 * (les lignes d'un même match restent ensemble), tient compte du NOMBRE DE
 * VARIANTES essayées, et — pour une preuve (jugerEtape) — ne juge que sur des
 * matchs joués APRÈS le lancement de la version, jamais sur des données déjà
 * vues. Il rend « retenu », « pas prouvé », « moins bon » ou « pas assez de
 * matchs », avec le gain et sa fourchette.
 *
 *   comparer(lignes, options)   le juge générique : lignes → verdict. Pur,
 *                               synchrone, déterministe ; ne lit rien. Le banc
 *                               (étape 19) s'en sert sur l'historique.
 *   jugerEtape({ etape, … })    le juge de PREUVE d'une étape : lancement,
 *                               données vues, minimum, variantes du registre,
 *                               pourcentage, et le jugement rangé au registre.
 *
 * Le juge ne va pas chercher ses données : on les lui apporte (banc, étape 25,
 * lignesEnginePicks.js). Il ne touche ni la base ni le réseau. Son seul hasard
 * est le générateur à graine ci-dessous : le même jeu de lignes, la même graine
 * et les mêmes options donnent EXACTEMENT le même résultat.
 *
 * Vocabulaire (dans les commentaires seulement, jamais à l'écran) : le
 * rééchantillonnage par blocs est un « bootstrap par blocs », la fourchette un
 * « intervalle de confiance », `p` une « p-value », la correction pour le
 * nombre de variantes une « correction de Bonferroni ».
 * -----------------------------------------------------------------------
 */

import { MESURES } from './metrics.js';
import { lancementDe, compterVariantes, fenetresVues, enregistrerJugement, EtapeNonLancee, AucuneVariante, RegistreIllisible } from './trialsRegistry.js';
import { jourValide } from './lancements.js';
import { normaliserIdEtape } from '../data/roadmap/plan.js';

export { EtapeNonLancee, AucuneVariante, RegistreIllisible };

/** Une ligne fautive ou une option absurde : rien n'est jugé. `indice` et `cle` désignent la première ligne fautive. */
export class LignesInvalides extends Error {
  constructor(message, { indice = null, cle = null } = {}) {
    super(message);
    this.indice = indice;
    this.cle = cle;
  }
}

// ------------------------------------------------------ le hasard à graine

/**
 * Générateur pseudo-aléatoire à graine (mulberry32, recopié de test/reperes.test.mjs) : des nombres
 * de [0 ; 1[, toujours les mêmes pour une même graine. C'est le SEUL hasard de src/bench (un test
 * vérifie qu'aucun fichier n'y emploie le hasard du navigateur ou de Node) : un jugement se rejoue.
 */
export const generateur = (graine) => {
  let s = graine;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ------------------------------------------------------- la loi normale

/** erf par Abramowitz-Stegun 7.1.26 (erreur ≤ 1,5·10⁻⁷), par symétrie pour x < 0. */
function erf(x) {
  const signe = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return signe * (1 - poly * Math.exp(-ax * ax));
}

/** Φ(x) = ½ [1 + erf(x / √2)] : la probabilité qu'une loi normale centrée réduite tombe sous x. */
const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

/**
 * Φ⁻¹(q) par DICHOTOMIE sur [−10 ; 10], 80 itérations : simple, sans formule à recopier de travers ;
 * l'intervalle est divisé par 2⁸⁰, bien plus fin que la précision de erf.
 */
function quantile(q) {
  if (typeof q !== 'number' || !(q > 0 && q < 1)) throw new RangeError(`quantile : q doit être strictement entre 0 et 1 (${String(q)}).`);
  let bas = -10;
  let haut = 10;
  for (let i = 0; i < 80; i++) {
    const milieu = (bas + haut) / 2;
    if (phi(milieu) < q) bas = milieu;
    else haut = milieu;
  }
  return (bas + haut) / 2;
}

export const loiNormale = Object.freeze({ phi, quantile });

/**
 * Le z de la fourchette pour `variantes` essais (correction de Bonferroni, bilatérale) :
 * Φ⁻¹(1 − alpha / (2 · m)), m = max(1, variantes). 1 → 1,960 ; 5 → 2,576 ; 10 → 2,807 ; 50 → 3,291.
 */
export const zPour = (alpha, variantes) => {
  if (typeof alpha !== 'number' || !(alpha > 0 && alpha < 1)) throw new RangeError(`zPour : alpha doit être strictement entre 0 et 1 (${String(alpha)}).`);
  if (typeof variantes !== 'number' || !Number.isFinite(variantes) || variantes < 0) throw new RangeError(`zPour : nombre de variantes invalide (${String(variantes)}).`);
  return quantile(1 - alpha / (2 * Math.max(1, variantes)));
};

// ----------------------------------------------------------- les options

const MODES = Object.freeze(['moyenne', 'rendement']);
/** Au-delà de 5 % de tirages sans mise d'un côté, l'écart-type ne veut plus rien dire : « pas assez de matchs ». */
const PART_MAX_TIRAGES_IGNORES = 0.05;
const OPTIONS_COMPARER = Object.freeze(['mode', 'sens', 'tirages', 'graine', 'variantes', 'alpha', 'minBlocs', 'minParis']);

const entier = (x) => typeof x === 'number' && Number.isInteger(x);

/** Les options de comparer, contrôlées : une option absurde, inconnue ou mal écrite lève LignesInvalides (jamais ignorée en silence). */
function lireOptions(options) {
  if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options))) throw new LignesInvalides('Les options doivent être un objet.');
  const inconnues = Object.keys(options ?? {}).filter((k) => !OPTIONS_COMPARER.includes(k));
  if (inconnues.length) throw new LignesInvalides(`Option inconnue : ${inconnues.join(', ')} (options : ${OPTIONS_COMPARER.join(', ')}).`);
  const { mode = 'moyenne', sens, tirages = 1000, graine = 1, variantes = 1, alpha = 0.05, minBlocs = 200, minParis = 100 } = options ?? {};
  if (!MODES.includes(mode)) throw new LignesInvalides(`Mode inconnu : « ${String(mode)} » (moyenne ou rendement).`);
  // Le sens est OBLIGATOIRE en mode moyenne, sans valeur par défaut : un défaut mal choisi inverserait tous les verdicts en silence.
  if (mode === 'moyenne' && sens !== 'min' && sens !== 'max') {
    throw new LignesInvalides(`Le sens de la mesure est obligatoire en mode moyenne : « min » (plus petit = mieux) ou « max » (plus grand = mieux), reçu « ${String(sens)} ».`);
  }
  if (mode === 'rendement' && sens !== undefined && sens !== 'max') throw new LignesInvalides('En mode rendement, plus grand est toujours mieux : le sens ne se change pas.');
  if (!entier(tirages) || tirages < 100 || tirages > 100_000) throw new LignesInvalides(`Nombre de tirages absurde : ${String(tirages)} (de 100 à 100 000).`);
  if (!entier(graine)) throw new LignesInvalides(`Graine invalide : ${String(graine)} (un nombre entier).`);
  if (!entier(variantes) || variantes < 0) throw new LignesInvalides(`Nombre de variantes invalide : ${String(variantes)} (un entier, 0 compte pour 1).`);
  if (typeof alpha !== 'number' || !(alpha > 0 && alpha < 1)) throw new LignesInvalides(`Seuil alpha absurde : ${String(alpha)} (strictement entre 0 et 1).`);
  if (!entier(minBlocs) || minBlocs < 2) throw new LignesInvalides(`Minimum de blocs absurde : ${String(minBlocs)} (au moins 2).`);
  if (!entier(minParis) || minParis < 1) throw new LignesInvalides(`Minimum de paris absurde : ${String(minParis)} (au moins 1).`);
  return { mode, sens: mode === 'moyenne' ? sens : 'max', tirages, graine, variantes, alpha, minBlocs, minParis };
}

// ---------------------------------------------------------- les lignes

const nombreFini = (x) => typeof x === 'number' && Number.isFinite(x);
/** Une clé de bloc ou de match : un texte non vide ou un nombre fini, sinon null. */
const cleDe = (v) => (typeof v === 'string' && v !== '' ? v : nombreFini(v) ? String(v) : null);
const cleDite = (cle) => (cle !== null ? ` (clé « ${cle} »)` : '');

/**
 * Contrôle strict d'une ligne. Jamais `Number(x)` : `Number(null)` vaut 0 et ferait passer une valeur
 * absente pour un score nul (le piège noté dans gelPronostics.js). Le juge ne jette jamais une ligne
 * en silence : c'est l'appelant qui filtre et qui compte ce qu'il écarte.
 */
function controlerLigne(l, i, mode, { dateExigee = false } = {}) {
  if (l === null || typeof l !== 'object' || Array.isArray(l)) throw new LignesInvalides(`Ligne ${i} : un objet est attendu.`, { indice: i });
  const cle = typeof l.cle === 'string' ? l.cle : cleDe(l.cle);
  const ou = `Ligne ${i}${cleDite(cle)}`;
  const faute = (message) => new LignesInvalides(`${ou} : ${message}`, { indice: i, cle });
  const bloc = cleDe(l.bloc);
  if (bloc === null) throw faute(`« bloc » manquant ou vide (${String(l.bloc)}) — la clé du match (ou de la journée) est obligatoire.`);
  if (l.match !== undefined && cleDe(l.match) === null) throw faute(`« match » invalide (${String(l.match)}).`);
  if (dateExigee && !jourValide(l.date)) throw faute(`« date » manquante ou invalide (${String(l.date)}) — le juge de preuve exige le jour du match, AAAA-MM-JJ.`);
  if (mode === 'moyenne') {
    for (const champ of ['a', 'b']) if (!nombreFini(l[champ])) throw faute(`« ${champ} » n’est pas un nombre fini (${String(l[champ])}).`);
  } else {
    for (const champ of ['gainA', 'miseA', 'gainB', 'miseB']) if (!nombreFini(l[champ])) throw faute(`« ${champ} » n’est pas un nombre fini (${String(l[champ])}).`);
    for (const [gain, mise] of [['gainA', 'miseA'], ['gainB', 'miseB']]) {
      if (l[mise] < 0) throw faute(`« ${mise} » est négative (${l[mise]}).`);
      if (l[gain] < -l[mise] - 1e-9) throw faute(`« ${gain} » (${l[gain]}) perd plus que la mise (${l[mise]}).`);
      if (l[mise] === 0 && l[gain] !== 0) throw faute(`« ${gain} » vaut ${l[gain]} sans aucune mise.`);
    }
  }
  return { bloc, match: cleDe(l.match) ?? bloc };
}

// ------------------------------------------------- les petites phrases

const fr = (n) => n.toLocaleString('fr-FR');
const accord = (n, un, plusieurs) => `${fr(n)} ${n <= 1 ? un : plusieurs}`;
const contexte = (matchs, m) => `${accord(matchs, 'match', 'matchs')}, ${accord(m, 'variante essayée', 'variantes essayées')}`;
/** −0 n'existe pas pour Pierre : un écart nul s'écrit « +0 ». */
const sansMoinsZero = (x) => (x === 0 ? 0 : x);
/** « 2026-11-09 » → « 09/11/2026 » (un texte AAAA-MM-JJ, sans passer par Date : le fuseau décalerait). */
const jourDit = (j) => `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;

/** Le quantile (interpolé) d'un tableau déjà TRIÉ dans l'ordre croissant. */
function quantileTrie(trie, q) {
  if (!trie.length) return null;
  const position = q * (trie.length - 1);
  const bas = Math.floor(position);
  const haut = Math.min(bas + 1, trie.length - 1);
  return trie[bas] + (trie[haut] - trie[bas]) * (position - bas);
}

// ------------------------------------------------------------ le juge

/**
 * LE JUGE GÉNÉRIQUE. `lignes` : une par match ou par pari, appariées sur la même clé match × marché
 * (et issue, pour un pari) — jamais un match de A face à un autre match de B :
 *   mode 'moyenne'    { bloc, match?, cle?, date?, a, b }        a et b = le score de chaque version sur
 *                                                                  CETTE ligne (perte log, Brier, valeur de clôture…) ;
 *   mode 'rendement'  { bloc, match?, cle?, date?, gainA, miseA, gainB, miseB }   ce que chaque version a misé
 *                                                                  et gagné sur CETTE ligne (mise 0 = elle n'a pas parié).
 * `bloc` : la clé du bloc de rééchantillonnage — le MATCH par défaut (les lignes d'un même match dépendent
 * du même score : les tirer séparément ferait croire à trois preuves là où il n'y en a qu'une) ; la
 * JOURNÉE (« AAAA-MM-JJ|championnat », jamais la date seule) quand ce qu'on compare lie les matchs d'un
 * même jour. `match` (défaut = bloc) sert à compter les matchs.
 *
 * Options : { mode = 'moyenne', sens (obligatoire en mode moyenne : 'min' | 'max'), tirages = 1000,
 * graine = 1, variantes = 1, alpha = 0.05, minBlocs = 200, minParis = 100 }.
 *
 * L'algorithme, dans l'ordre :
 *   1. un vecteur par ligne : moyenne [d, 1] avec d = s × (b − a), s = −1 si plus petit est mieux, +1
 *      sinon (positif = B meilleure, partout) ; rendement [gainA, miseA, gainB, miseB] ;
 *   2. la somme par bloc, dans l'ordre d'apparition (une Map : même jeu de lignes, même ordre) ;
 *   3. la statistique sur un total V : moyenne V0 / V1 (le gain moyen PAR LIGNE, jamais la moyenne des
 *      moyennes de blocs) ; rendement V2/V3 − V0/V1 (rendement de B moins rendement de A : un rapport
 *      de deux sommes à dénominateurs différents, qui ne s'écrit pas comme une moyenne de différences) ;
 *   4. la valeur observée T0 = T(Σ des blocs) ;
 *   5. `tirages` tirages : K blocs AVEC REMISE parmi les K, additionnés ; un tirage dont un dénominateur
 *      est nul (rendement : aucune mise d'un côté) est ignoré et compté ;
 *   6. l'écart-type des tirages gardés (diviseur B' − 1) — c'est déjà l'écart-type de T, rien à rediviser ;
 *   7. z = Φ⁻¹(1 − alpha / (2m)), m = max(1, variantes) ;
 *   8. la fourchette T0 ± z × écart-type ;
 *   9. p = 2 × (1 − Φ(|T0| / écart-type)), pour information ;
 *  10. le verdict : « pas assez de matchs » (moins de minBlocs blocs, moins de minParis paris d'un côté,
 *      plus de 5 % de tirages ignorés), sinon « retenu » si la fourchette est entièrement au-dessus de
 *      zéro, « moins bon » si entièrement au-dessous, « pas prouvé » sinon.
 * Pourquoi T0 ± z × écart-type plutôt que les percentiles des tirages : la fourchette doit s'élargir
 * avec le nombre de variantes (z change avec m), et une fourchette à 99,5 % par percentiles demanderait
 * des dizaines de milliers de tirages ; avec l'écart-type, 1 000 suffisent quel que soit m. La fourchette
 * à 95 % par percentiles est rendue quand même (controle.percentile95) : un témoin, proche de la
 * fourchette à m = 1. Un seul test, bilatéral à 95 % : « retenu » exige 2,5 % d'un côté, et le même outil
 * dit « moins bon » ; quand rien n'a changé, « pas prouvé » sort dans ~95 % des cas.
 *
 * ÉTAPE 23 (carte championnat × marché, des centaines de cases jugées) : chaque case est un test. Appeler
 * comparer sur chaque case avec `variantes` = m = le NOMBRE DE CASES TESTÉES (toutes, y compris celles
 * qu'on ne montrera pas) ; sinon, sur 400 cases où rien n'a changé, une vingtaine sortiraient « retenu »
 * ou « moins bon » par le seul hasard.
 *
 * Pur, synchrone, déterministe ; ne lit rien. Lève LignesInvalides sur une ligne fautive ou une option absurde.
 */
export function comparer(lignes, options) {
  const o = lireOptions(options);
  if (!Array.isArray(lignes)) throw new LignesInvalides('Les lignes doivent être une liste.');
  const moyenne = o.mode === 'moyenne';
  const dim = moyenne ? 2 : 4;
  const s = o.sens === 'min' ? -1 : 1;

  // 1-2. Vecteurs par ligne, sommés par bloc dans l'ordre d'apparition.
  const indexDuBloc = new Map();
  const sommes = [];
  const matchs = new Set();
  let sommeA = 0;
  let sommeB = 0;
  let parisA = 0;
  let parisB = 0;
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    const { bloc, match } = controlerLigne(l, i, o.mode);
    matchs.add(match);
    let k = indexDuBloc.get(bloc);
    if (k === undefined) {
      k = sommes.length;
      indexDuBloc.set(bloc, k);
      sommes.push(new Float64Array(dim));
    }
    const v = sommes[k];
    if (moyenne) {
      v[0] += s * (l.b - l.a);
      v[1] += 1;
      sommeA += l.a;
      sommeB += l.b;
    } else {
      v[0] += l.gainA;
      v[1] += l.miseA;
      v[2] += l.gainB;
      v[3] += l.miseB;
      if (l.miseA > 0) parisA++;
      if (l.miseB > 0) parisB++;
    }
  }
  const K = sommes.length;
  const n = { lignes: lignes.length, blocs: K, matchs: matchs.size, ...(moyenne ? {} : { parisA, parisB }) };

  // 3. La statistique sur un total ; null quand elle n'existe pas (aucune mise d'un côté).
  const statistique = moyenne
    ? (V0, V1) => (V1 > 0 ? V0 / V1 : null)
    : (V0, V1, V2, V3) => (V1 > 0 && V3 > 0 ? V2 / V3 - V0 / V1 : null);

  // 4. La valeur observée.
  const total = new Float64Array(dim);
  for (const v of sommes) for (let c = 0; c < dim; c++) total[c] += v[c];
  const T0 = K ? statistique(total[0], total[1], total[2], total[3]) : null;
  const a = { moyenne: moyenne ? (n.lignes ? sommeA / n.lignes : null) : total[1] > 0 ? total[0] / total[1] : null };
  const b = { moyenne: moyenne ? (n.lignes ? sommeB / n.lignes : null) : total[3] > 0 ? total[2] / total[3] : null };

  // 5. Les tirages : K blocs avec remise, un seul générateur par appel, créé ici.
  const z = zPour(o.alpha, o.variantes);
  const m = Math.max(1, o.variantes);
  const seuil = { alpha: o.alpha, variantes: m, alphaCorrige: o.alpha / m, z };
  let ecartType = null;
  let fourchette = null;
  let p = null;
  let percentile95 = null;
  let tiragesIgnores = 0;
  if (K > 0 && T0 !== null) {
    const u = generateur(o.graine);
    // Une colonne par composante des sommes de blocs : le bloc tiré se lit directement à son indice.
    const S0 = Float64Array.from(sommes, (v) => v[0]);
    const S1 = Float64Array.from(sommes, (v) => v[1]);
    const S2 = moyenne ? null : Float64Array.from(sommes, (v) => v[2]);
    const S3 = moyenne ? null : Float64Array.from(sommes, (v) => v[3]);
    const gardes = new Float64Array(o.tirages);
    let nGardes = 0;
    for (let t = 0; t < o.tirages; t++) {
      let V0 = 0;
      let V1 = 0;
      let V2 = 0;
      let V3 = 0;
      if (moyenne) {
        for (let j = 0; j < K; j++) {
          const i = Math.floor(u() * K);
          V0 += S0[i];
          V1 += S1[i];
        }
      } else {
        for (let j = 0; j < K; j++) {
          const i = Math.floor(u() * K);
          V0 += S0[i];
          V1 += S1[i];
          V2 += S2[i];
          V3 += S3[i];
        }
      }
      const T = statistique(V0, V1, V2, V3);
      if (T === null) tiragesIgnores++;
      else gardes[nGardes++] = T;
    }
    // 6. L'écart-type des tirages gardés (deux passes : moyenne, puis écarts).
    const tires = gardes.subarray(0, nGardes);
    if (nGardes >= 2) {
      let somme = 0;
      for (const T of tires) somme += T;
      const moyenneTirages = somme / nGardes;
      let carres = 0;
      for (const T of tires) carres += (T - moyenneTirages) ** 2;
      ecartType = Math.sqrt(carres / (nGardes - 1));
      // 8. La fourchette ; 9. p, pour information.
      fourchette = [sansMoinsZero(T0 - z * ecartType), sansMoinsZero(T0 + z * ecartType)];
      p = ecartType === 0 ? (T0 !== 0 ? 0 : 1) : 2 * (1 - phi(Math.abs(T0) / ecartType));
      const trie = Float64Array.from(tires).sort();
      percentile95 = [quantileTrie(trie, 0.025), quantileTrie(trie, 0.975)];
    }
  }

  // 10. Le verdict, dans cet ordre.
  let verdict;
  let raison;
  const lesMatchs = n.matchs;
  if (K < o.minBlocs) {
    verdict = 'pas-assez-de-matchs';
    raison =
      K === n.matchs
        ? `${accord(K, 'match jugé', 'matchs jugés')}, ${fr(o.minBlocs)} nécessaires.`
        : `${accord(K, 'bloc de matchs jugé', 'blocs de matchs jugés')} (${accord(n.matchs, 'match', 'matchs')}), ${fr(o.minBlocs)} nécessaires.`;
  } else if (!moyenne && (parisA < o.minParis || parisB < o.minParis)) {
    verdict = 'pas-assez-de-matchs';
    raison =
      parisA < o.minParis && parisB < o.minParis
        ? `L’ancienne version (A) n’a que ${accord(parisA, 'pari', 'paris')} et la nouvelle (B) ${accord(parisB, 'pari', 'paris')}, ${fr(o.minParis)} nécessaires de chaque côté.`
        : parisB < o.minParis
          ? `La nouvelle version (B) n’a que ${accord(parisB, 'pari', 'paris')}, ${fr(o.minParis)} nécessaires.`
          : `L’ancienne version (A) n’a que ${accord(parisA, 'pari', 'paris')}, ${fr(o.minParis)} nécessaires.`;
  } else if (tiragesIgnores > PART_MAX_TIRAGES_IGNORES * o.tirages || ecartType === null) {
    verdict = 'pas-assez-de-matchs';
    raison = `Trop de tirages sans aucune mise d’un côté (${fr(tiragesIgnores)} sur ${fr(o.tirages)}, 5 % au plus) : pas assez de paris pour juger.`;
  } else if (fourchette[0] > 0) {
    verdict = 'retenu';
    raison = `L’amélioration dépasse ce que le hasard explique : la fourchette est entièrement au-dessus de zéro (${contexte(lesMatchs, m)}).`;
  } else if (fourchette[1] < 0) {
    verdict = 'moins-bon';
    raison = `La nouvelle version fait moins bien, au-delà du hasard : la fourchette est entièrement au-dessous de zéro (${contexte(lesMatchs, m)}).`;
  } else {
    verdict = 'pas-prouve';
    raison = `La fourchette contient zéro : l’écart peut venir du hasard (${contexte(lesMatchs, m)}).`;
  }

  return {
    mode: o.mode,
    sens: o.sens,
    n,
    a,
    b,
    gain: T0 === null ? null : sansMoinsZero(T0),
    ecartType,
    seuil,
    fourchette,
    p,
    verdict,
    raison,
    controle: { percentile95, tiragesIgnores },
    tirages: o.tirages,
    graine: o.graine
  };
}

// ------------------------------------------------- le juge de preuve

/** Ce que jugerEtape ne laisse pas changer : la mesure fixe mode et sens, le registre fixe m, la preuve garde ses seuils. */
const OPTIONS_REFUSEES_POUR_UNE_PREUVE = Object.freeze(['mode', 'sens', 'variantes', 'alpha', 'minBlocs', 'minParis']);

const dansUneFenetre = (jour, fenetres) => fenetres.some((f) => jour >= f.de && jour <= f.a);

/**
 * Le juge de PREUVE d'une étape. `mesure` : une clé de MESURES (metrics.js) — elle fixe mode et sens.
 * Dans l'ordre :
 *   1. le DERNIER lancement de l'étape (registre + code) — aucun : EtapeNonLancee ;
 *   2. m = le nombre de variantes déclarées (code + à chaud, dédoublonnées) — aucune : AucuneVariante
 *      (on ne peut pas oublier de compter : la version jugée doit elle-même être déclarée) ;
 *   3. chaque ligne doit porter son jour (`date`, AAAA-MM-JJ) — sinon LignesInvalides ;
 *   4. une ligne n'est gardée que si son jour est STRICTEMENT après le jour du lancement (le jour même,
 *      l'ancien code a pu produire des pronostics) ET hors de toute fenêtre vue (fenetresVues, par portée depuis
 *      le 19/10 : DONNEES_VUES, toutes celles de l'étape, celles de portée « moteur » des lancements enregistrés
 *      des autres étapes ; bornes comprises) — comparaisons de textes AAAA-MM-JJ, jamais de Date (le fuseau
 *      décalerait d'un jour). La règle des données vues est redondante avec celle du lancement dans le
 *      cas normal : elle protège contre une date de lancement fausse (un `le` fixé trop tôt ferait passer
 *      la saison 2025-26 pour de la preuve neuve). Le reste est compté : ecartees { avantLancement, donneesVues } ;
 *   5. comparer, avec les seuils par défaut (200 blocs, 100 paris, alpha 5 %) : une preuve ne les baisse
 *      jamais (le banc et les essais passent par comparer) ; seuls `tirages` et `graine` se règlent, et
 *      ils sont rangés avec le jugement ;
 *   6. le gain en pourcentage (enPourcent) : relatif → gain / |moyenne de A| × 100 (si cette moyenne est
 *      nulle, l'écart absolu × 100, et `quoi` le dit) ; sinon gain × 100 ;
 *   7. le jugement est RANGÉ au registre (sauf `enregistrer: false`), jamais à la place d'un autre.
 *
 * Le juge ne sait pas QUI a produit un pronostic : que les lignes de B viennent bien de la version lancée,
 * c'est à l'appelant d'y veiller (numéro de version sur chaque pronostic, étape 25).
 *
 * NE PAS JUGER CHAQUE NUIT ET RETENIR AU PREMIER PASSAGE (l'arrêt optionnel) : regarder chaque soir et
 * s'arrêter au premier « retenu » fabrique de fausses preuves, même avec une fourchette honnête. Chaque
 * jugement est rangé avec sa date ; un jugement FINAL se prend à l'horizon prévu (étape 25 à la date
 * fixée à l'adoption, étape 47 pour le bilan) avec `principal: true` ; les autres sont « en cours », pour
 * information. L'étape 25 appliquera cette règle.
 *
 * ÉTAPE 23 (carte championnat × marché) : chaque case jugée est un test, et m doit valoir le NOMBRE DE
 * CASES TESTÉES (toutes, même celles qu'on ne montre pas). jugerEtape prend m au registre : déclarer
 * chaque case comme variante de l'étape (declarerVariante, id = la case) avant de juger — ou, pour une
 * carte sur l'historique, juger par comparer avec `variantes` = le nombre de cases.
 *
 * Options : { etape, lignes, mesure, maintenant = Date.now(), quoi = '', principal = false,
 * enregistrer = true, registre = {} (options de trialsRegistry : fichier, lancements, donneesVues),
 * tirages, graine }. Lève EtapeNonLancee, AucuneVariante, LignesInvalides, RegistreIllisible.
 */
export function jugerEtape({ etape, lignes, mesure, maintenant = Date.now(), quoi = '', principal = false, enregistrer = true, registre = {}, ...options } = {}) {
  const id = normaliserIdEtape(etape);
  if (!id) throw new EtapeNonLancee(`Étape « ${String(etape).slice(0, 40)} » inconnue du plan : rien à juger.`);
  const definition = Object.hasOwn(MESURES, mesure ?? '') ? MESURES[mesure] : null;
  if (!definition) throw new LignesInvalides(`Mesure inconnue : « ${String(mesure)} » (${Object.keys(MESURES).join(', ')}).`);
  const refusees = Object.keys(options).filter((k) => OPTIONS_REFUSEES_POUR_UNE_PREUVE.includes(k));
  if (refusees.length) {
    throw new LignesInvalides(`Une preuve garde ses règles : ${refusees.join(', ')} ne se change pas ici (la mesure fixe le mode et le sens, le registre le nombre de variantes ; le banc passe par comparer).`);
  }
  const optionsRegistre = { ...registre, maintenant };

  // 1-2. Le lancement et le nombre de variantes, au registre.
  const lancement = lancementDe(id, optionsRegistre);
  if (!lancement) {
    throw new EtapeNonLancee(
      `L’étape ${id} n’est pas encore lancée : aucune date de mise en service au registre. Elle est notée au premier démarrage du serveur avec le code qui la déclare (lancements.js).`
    );
  }
  const m = compterVariantes(id, optionsRegistre);
  if (m < 1) throw new AucuneVariante(`Aucune variante déclarée pour l’étape ${id} : sans le nombre d’essais, le juge ne sait pas corriger, il refuse (la version jugée doit elle-même être déclarée).`);

  // 3. Chaque ligne, contrôlée telle quelle (les indices des erreurs sont ceux de l'appelant), avec son jour.
  if (!Array.isArray(lignes)) throw new LignesInvalides('Les lignes doivent être une liste.');
  lignes.forEach((l, i) => controlerLigne(l, i, definition.mode, { dateExigee: true }));

  // 4. Après le lancement, hors des données vues.
  const fenetres = fenetresVues(id, optionsRegistre);
  const ecartees = { avantLancement: 0, donneesVues: 0 };
  const gardees = [];
  let de = null;
  let a = null;
  for (const l of lignes) {
    if (l.date <= lancement.le) ecartees.avantLancement++;
    else if (dansUneFenetre(l.date, fenetres)) ecartees.donneesVues++;
    else {
      gardees.push(l);
      if (de === null || l.date < de) de = l.date;
      if (a === null || l.date > a) a = l.date;
    }
  }

  // 5. Le juge, avec les seuils par défaut.
  const resultat = comparer(gardees, { ...options, mode: definition.mode, ...(definition.mode === 'moyenne' ? { sens: definition.sens } : {}), variantes: m });
  let raison = resultat.raison;
  if (resultat.verdict === 'pas-assez-de-matchs' && ecartees.avantLancement + ecartees.donneesVues > 0) {
    raison += ` Écartées : ${accord(ecartees.avantLancement, 'ligne', 'lignes')} d’avant le lancement du ${jourDit(lancement.le)}, ${accord(ecartees.donneesVues, 'ligne déjà vue', 'lignes déjà vues')} (elles ont servi à construire ou à régler).`;
  }

  // 6. Le pourcentage que voit Pierre (la décision est déjà prise, sur le gain et sa fourchette).
  const base = resultat.a.moyenne;
  const relatif = definition.relatif && typeof base === 'number' && base !== 0;
  const echelle = relatif ? 100 / Math.abs(base) : 100;
  const enPourcent = {
    gain: resultat.gain === null ? null : sansMoinsZero(resultat.gain * echelle),
    fourchette: resultat.fourchette ? resultat.fourchette.map((x) => sansMoinsZero(x * echelle)) : null,
    quoi: definition.relatif && !relatif ? `${definition.quoi} (écart absolu × 100 : la moyenne de l’ancienne version est nulle)` : definition.quoi
  };

  const jugement = {
    ...resultat,
    raison,
    etape: id,
    mesure,
    quoi: typeof quoi === 'string' ? quoi : '',
    principal: principal === true,
    le: new Date(maintenant).toISOString(),
    lancement: lancement.le,
    version: lancement.version,
    fenetre: { de, a },
    ecartees,
    enPourcent
  };
  // 7. Rangé, jamais à la place d'un autre.
  return enregistrer ? enregistrerJugement(id, jugement, optionsRegistre) : jugement;
}

/**
 * Pour le banc (étape 19), qui compare des versions sur l'historique avec comparer : la part des lignes
 * DATÉES qui tombent dans une fenêtre vue de l'étape — pour étiqueter ses résultats « indicatif : données
 * déjà vues ». Rend { total, vues, part } (part = null sans ligne datée). Lève RegistreIllisible.
 */
export function partDonneesVues(lignes, etape, registre = {}) {
  if (!Array.isArray(lignes)) throw new LignesInvalides('Les lignes doivent être une liste.');
  const fenetres = fenetresVues(etape, registre);
  let total = 0;
  let vues = 0;
  for (const l of lignes) {
    if (!jourValide(l?.date)) continue;
    total++;
    if (dansUneFenetre(l.date, fenetres)) vues++;
  }
  return { total, vues, part: total ? vues / total : null };
}
