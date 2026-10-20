/**
 * metrics.js — les scores PAR LIGNE du garde-fou de la mesure (étape 16 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * Une ligne = un match (ou un pari) : ce que chaque version a dit, ce qui
 * s'est passé, et le score de chaque version SUR CETTE LIGNE. Le juge
 * (guard.js) ne compare que des scores déjà calculés ; ce fichier les
 * calcule, en JavaScript pur, sans base, sans réseau, sans hasard.
 *
 * Pour des PROBABILITÉS (1N2, plus/moins, les deux marquent…) :
 *   - la PERTE LOG est le juge. C'est la mesure du 23/09 (marginRemoval.js :
 *     1,0030 contre 1,0035 ; valueFinder.js : Pinnacle 0,9925), donc la seule
 *     comparable à la note de départ ; elle punit fort l'excès de confiance,
 *     le défaut qui coûte de l'argent à un parieur (90 % sur une issue qui ne
 *     vient pas coûte −ln 0,1 = 2,3 ; 99 % coûte 4,6, là où Brier reste borné
 *     à 2 quoi qu'il arrive) ; et sa somme est le logarithme de la
 *     vraisemblance, la mesure liée à la croissance d'une bankroll ;
 *   - BRIER et RPS sont des TÉMOINS : calculés et rapportés (le banc de
 *     l'étape 19 les affichera), jamais juges. Un seul juge par jugement :
 *     deux juges donneraient deux verdicts.
 *   - Écrêtage : une probabilité est ramenée à PROBA_MIN au plus bas (sinon
 *     une probabilité nulle rend la moyenne infinie). Chaque score le dit
 *     (`ecretee`) : celui qui produit les lignes compte les lignes écrêtées,
 *     car une version qui écrête souvent a un défaut à part.
 *
 * Pour des PARIS :
 *   - le GAIN À MISE FIXE (1 unité) : ce que Pierre gagne. Il RAPPORTE, il
 *     prouve mal — son écart-type par pari vaut ≈ 1,3 à cote 2,5 : il faut des
 *     milliers de paris pour prouver un écart de 2 points ;
 *   - la VALEUR DE CLÔTURE : écart-type ≈ 0,05, elle PROUVE vingt fois plus
 *     vite (le 23/09, c'était la seule mesure significative). Règle : le juge
 *     sur le rendement rapporte, le juge sur la valeur de clôture prouve ;
 *     quand les deux existent, les deux sont montrés.
 *
 * L'étape 19 (banc d'essai) étendra ce fichier — calibration par tranche —
 * sans rien recopier : les fonctions par ligne vivent ici et nulle part ailleurs.
 * -----------------------------------------------------------------------
 */

/** La plus petite probabilité prise en compte : −ln(1e−6) ≈ 13,8, une perte finie. */
export const PROBA_MIN = 1e-6;

/** L'ordre des issues d'un 1N2 : domicile, nul, extérieur (le RPS en a besoin). */
const ISSUES_1N2 = Object.freeze(['home', 'draw', 'away']);

const nombreFini = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Une probabilité lisible : un nombre de 0 à 1. Jamais `Number(x)` : `Number(null)` vaut 0 et
 * ferait passer une valeur absente pour une probabilité nulle (le piège noté dans gelPronostics.js).
 * Une valeur à peine au-dessus de 1 (arrondi d'une renormalisation) est ramenée à 1.
 */
function probabilite(p, ou) {
  if (!nombreFini(p) || p < 0 || p > 1 + 1e-9) {
    throw new RangeError(`${ou} : probabilité invalide (${String(p)}) — un nombre de 0 à 1 est attendu.`);
  }
  return Math.min(p, 1);
}

/**
 * Les probabilités d'un marché en tableau, et l'indice de l'issue qui s'est produite.
 * `probabilites` : un tableau (avec `issue` = un indice) ou un objet { home, draw, away } (avec
 * `issue` = une clé). `ordonne` : l'ordre compte (RPS) — un objet doit alors être un 1N2.
 */
function distribution(probabilites, issue, ou, { ordonne = false } = {}) {
  let cles;
  let valeurs;
  if (Array.isArray(probabilites)) {
    valeurs = probabilites;
    if (!Number.isInteger(issue) || issue < 0 || issue >= valeurs.length) {
      throw new RangeError(`${ou} : issue « ${String(issue)} » absente (indice de 0 à ${valeurs.length - 1} attendu).`);
    }
  } else if (probabilites !== null && typeof probabilites === 'object') {
    cles = ordonne ? ISSUES_1N2 : Object.keys(probabilites);
    if (ordonne && (Object.keys(probabilites).length !== 3 || !ISSUES_1N2.every((c) => Object.hasOwn(probabilites, c)))) {
      throw new RangeError(`${ou} : l'ordre des issues n'est connu que pour un 1N2 { home, draw, away }.`);
    }
    if (typeof issue !== 'string' || !cles.includes(issue)) {
      throw new RangeError(`${ou} : issue « ${String(issue)} » absente (${cles.join(', ')}).`);
    }
    valeurs = cles.map((c) => probabilites[c]);
  } else {
    throw new TypeError(`${ou} : les probabilités doivent être un tableau ou un objet.`);
  }
  if (valeurs.length < 2) throw new RangeError(`${ou} : au moins deux issues sont attendues.`);
  const propres = valeurs.map((p, i) => probabilite(p, `${ou}, issue ${cles ? cles[i] : i}`));
  return { valeurs: propres, indice: cles ? cles.indexOf(issue) : issue };
}

/**
 * PERTE LOG (le juge) : −ln(p de l'issue réalisée), p écrêtée à PROBA_MIN. Plus petite = meilleure.
 * @returns {{ valeur: number, ecretee: boolean }}
 */
export function perteLog(probabilites, issue) {
  const { valeurs, indice } = distribution(probabilites, issue, 'perteLog');
  const p = valeurs[indice];
  return { valeur: -Math.log(Math.max(p, PROBA_MIN)), ecretee: p < PROBA_MIN };
}

/**
 * PERTE LOG BINAIRE d'une affirmation (« domicile à 55 % ») : −ln(p) si elle s'est réalisée,
 * −ln(1 − p) sinon, écrêtée de même. C'est la seule perte log calculable sur un pronostic gelé, qui
 * ne garde que la probabilité de l'issue choisie (cf. lignesEnginePicks.js).
 * @returns {{ valeur: number, ecretee: boolean }}
 */
export function perteLogBinaire(p, realise) {
  const q = probabilite(p, 'perteLogBinaire');
  if (typeof realise !== 'boolean') throw new TypeError(`perteLogBinaire : « réalisé » doit être vrai ou faux (${String(realise)}).`);
  const dite = realise ? q : 1 - q;
  return { valeur: -Math.log(Math.max(dite, PROBA_MIN)), ecretee: dite < PROBA_MIN };
}

/** BRIER (témoin) : Σ (p_i − 1[i = issue])². Plus petit = meilleur ; borné à 2 quoi qu'il arrive. */
export function brier(probabilites, issue) {
  const { valeurs, indice } = distribution(probabilites, issue, 'brier');
  let somme = 0;
  for (let i = 0; i < valeurs.length; i++) somme += (valeurs[i] - (i === indice ? 1 : 0)) ** 2;
  return somme;
}

/**
 * RPS (témoin, issues ORDONNÉES — le 1N2 : domicile, nul, extérieur) :
 * 1/(K − 1) × Σ_{k<K} (Σ_{i≤k} p_i − Σ_{i≤k} 1[i = issue])², soit ½ Σ sur les deux premières pour un 1N2.
 * Il compte la distance : annoncer l'extérieur quand le domicile gagne coûte plus qu'annoncer le nul.
 */
export function rps(probabilitesOrdonnees, indexIssue) {
  const { valeurs, indice } = distribution(probabilitesOrdonnees, indexIssue, 'rps', { ordonne: true });
  let cumulP = 0;
  let cumulO = 0;
  let somme = 0;
  for (let k = 0; k < valeurs.length - 1; k++) {
    cumulP += valeurs[k];
    cumulO += k === indice ? 1 : 0;
    somme += (cumulP - cumulO) ** 2;
  }
  return somme / (valeurs.length - 1);
}

/** GAIN À MISE FIXE d'un pari d'une unité : cote − 1 gagné, −1 perdu, 0 remboursé. */
export function gainMiseFixe({ cote, gagne, rembourse = false } = {}) {
  if (!nombreFini(cote) || cote < 1) throw new RangeError(`gainMiseFixe : cote invalide (${String(cote)}) — un nombre d'au moins 1 est attendu.`);
  if (typeof rembourse !== 'boolean') throw new TypeError('gainMiseFixe : « remboursé » doit être vrai ou faux.');
  if (rembourse) return 0;
  if (typeof gagne !== 'boolean') throw new TypeError(`gainMiseFixe : « gagné » doit être vrai ou faux (${String(gagne)}).`);
  return gagne ? cote - 1 : -1;
}

/**
 * VALEUR DE CLÔTURE d'un pari : cote prise × probabilité de clôture − 1, la probabilité de clôture
 * étant celle de la dernière cote avant le coup d'envoi, marge retirée (removeMargin, méthode
 * puissance). Plus grande = meilleure : on a pris une cote que le marché a ensuite jugée trop belle.
 */
export function valeurCloture({ cotePrise, probaCloture } = {}) {
  if (!nombreFini(cotePrise) || cotePrise < 1) throw new RangeError(`valeurCloture : cote prise invalide (${String(cotePrise)}).`);
  if (!nombreFini(probaCloture) || probaCloture <= 0 || probaCloture >= 1) {
    throw new RangeError(`valeurCloture : probabilité de clôture invalide (${String(probaCloture)}) — strictement entre 0 et 1.`);
  }
  return cotePrise * probaCloture - 1;
}

// ------------------------------------------- étape 19 : calibration et pronostics justes

/**
 * Les tranches de FIABILITE.cotes (resultPrediction.js) : 0-40 %, 40-50 %… 80-101 %. Exportées d'ici pour que
 * le banc (19), la calibration mensuelle (20) et le tableau de bord (24) lisent les MÊMES bornes, [de ; a[.
 */
export const TRANCHES_FIABILITE = Object.freeze(
  [[0, 0.4], [0.4, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 1.01]].map(([de, a]) => Object.freeze({ de, a }))
);
/** Les dixièmes, 0-10 % … 90-101 % : la courbe annoncé / réalisé. */
export const TRANCHES_DIXIEMES = Object.freeze(
  Array.from({ length: 10 }, (_, i) => Object.freeze({ de: i / 10, a: i === 9 ? 1.01 : (i + 1) / 10 }))
);

/**
 * L'indice de la tranche d'une probabilité : celle où de ≤ p < a ; au-delà de la dernière borne (p = 1,01 par
 * arrondi), la dernière ; en dessous de la première, la première. Comme predictResult (resultPrediction.js).
 */
export function trancheDe(p, tranches = TRANCHES_FIABILITE) {
  // Pas la règle stricte des probabilités : une valeur un peu au-dessus de 1 (arrondi) va dans la dernière tranche.
  if (!nombreFini(p) || p < 0) throw new RangeError(`trancheDe : probabilité invalide (${String(p)}).`);
  const i = tranches.findIndex((t) => p >= t.de && p < t.a);
  if (i >= 0) return i;
  return p < tranches[0].de ? 0 : tranches.length - 1;
}

/** Un accumulateur de calibration vide (une case par tranche) : le banc l'alimente ligne à ligne, sans les garder. */
export function calibrationVide(tranches = TRANCHES_FIABILITE) {
  return { tranches, n: new Array(tranches.length).fill(0), sommeP: new Array(tranches.length).fill(0), sommeR: new Array(tranches.length).fill(0) };
}

/** Ajoute une ligne : `p` la probabilité annoncée de l'issue choisie, `realise` vrai si elle s'est produite. */
export function ajouterACalibration(acc, p, realise) {
  if (typeof realise !== 'boolean') throw new TypeError(`ajouterACalibration : « réalisé » doit être vrai ou faux (${String(realise)}).`);
  const i = trancheDe(p, acc.tranches);
  acc.n[i]++;
  acc.sommeP[i] += p;
  if (realise) acc.sommeR[i]++;
  return acc;
}

/** Ce que dit un accumulateur : [{ de, a, n, annonce, realise, ecart }] (fractions de 0 à 1 ; null sans ligne). */
export function lireCalibration(acc) {
  return acc.tranches.map((t, i) => {
    const n = acc.n[i];
    const annonce = n ? acc.sommeP[i] / n : null;
    const realise = n ? acc.sommeR[i] / n : null;
    return { de: t.de, a: t.a, n, annonce, realise, ecart: n ? realise - annonce : null };
  });
}

/**
 * CALIBRATION PAR TRANCHE : pour des lignes { p, realise }, par tranche [de ; a[ : le nombre de lignes,
 * l'annoncé moyen, le réalisé et leur écart. Tranches par défaut : celles de FIABILITE.cotes ; `tranches`
 * acceptées (les dixièmes pour la courbe, les bandes de FIABILITE_SCORE pour le score exact). Pure.
 */
export function calibrationParTranche(lignes, { tranches = TRANCHES_FIABILITE } = {}) {
  if (!Array.isArray(lignes)) throw new TypeError('calibrationParTranche : une liste de lignes { p, realise } est attendue.');
  const acc = calibrationVide(tranches);
  for (const l of lignes) ajouterACalibration(acc, l.p, l.realise);
  return lireCalibration(acc);
}

/** % DE JUSTES : la part des lignes { choix, issue } où le choix est l'issue ; { n, justes, taux } (taux null sans ligne). */
export function tauxDeJustes(lignes) {
  if (!Array.isArray(lignes)) throw new TypeError('tauxDeJustes : une liste de lignes { choix, issue } est attendue.');
  let justes = 0;
  for (const l of lignes) if (l.choix === l.issue) justes++;
  return { n: lignes.length, justes, taux: lignes.length ? justes / lignes.length : null };
}

/**
 * La table des mesures que le juge sait traduire (guard.js, jugerEtape) :
 *   mode     'moyenne' (un score par ligne et par version) ou 'rendement' (mises et gains) ;
 *   sens     'min' = plus petit est mieux, 'max' = plus grand est mieux (en rendement : toujours plus grand) ;
 *   relatif  le gain se dit en pourcentage de la moyenne de l'ancienne version (sinon × 100) ;
 *   quoi     la phrase qui suit le pourcentage à l'écran.
 */
export const MESURES = Object.freeze({
  'perte-log': Object.freeze({ mode: 'moyenne', sens: 'min', relatif: true, quoi: 'de perte log en moins' }),
  'perte-log-binaire': Object.freeze({ mode: 'moyenne', sens: 'min', relatif: true, quoi: 'de perte log en moins' }),
  brier: Object.freeze({ mode: 'moyenne', sens: 'min', relatif: true, quoi: 'de Brier en moins' }),
  rps: Object.freeze({ mode: 'moyenne', sens: 'min', relatif: true, quoi: 'de RPS en moins' }),
  'valeur-cloture': Object.freeze({ mode: 'moyenne', sens: 'max', relatif: false, quoi: 'de valeur de clôture en plus' }),
  gain: Object.freeze({ mode: 'rendement', relatif: false, quoi: 'par unité misée' })
});
