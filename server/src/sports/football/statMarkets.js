/**
 * statMarkets.js — corners, tirs et tirs cadrés : nombre attendu par équipe
 * et probabilité de chaque ligne (plus/moins de X), pour les pronostics de
 * marché du moteur (cf. markets.js). Demande de Pierre le 01/10/2026.
 * -----------------------------------------------------------------------
 * Réglé sur PREUVE, comme le reste du moteur : 36 400 matchs du magasin
 * (07/2024 - 09/2026), rejoués sans fuite (chaque match prévu avec les seuls
 * matchs antérieurs) :
 *  - attendu d'une équipe = facteur de terrain × moyenne de ce qu'elle
 *    produit sur ses 10 derniers matchs et de ce que l'adversaire concède
 *    sur les siens (cf. data/db/statInputsRead.js). Facteurs mesurés :
 *    1,10 à domicile, 0,90 à l'extérieur, pour les trois statistiques ;
 *  - loi BINOMIALE NÉGATIVE, pas de Poisson : la variance réelle dépasse la
 *    moyenne (×1,5 corners, ×1,7 tirs, ×1,2 tirs cadrés par équipe). Sur
 *    2025-26 (hors apprentissage), pour le pronostic retenu (le plus probable
 *    coté au moins 1,20) : Poisson annonçait 79-82 % pour 74-79 % réalisés,
 *    la binomiale négative 79-82 % pour 79-81 %.
 * Ne touche ni au 1N2 ni aux buts.
 * -----------------------------------------------------------------------
 */

/** 1/k de la binomiale négative (variance = moyenne + moyenne² × 1/k), appris sur 2024-25. */
export const STAT_KINDS = {
  corners: { unit: 'corners', invKTeam: 0.1048, invKTotal: 0.0205 },
  shots: { unit: 'tirs', invKTeam: 0.0599, invKTotal: 0.0138 },
  shotsOnTarget: { unit: 'tirs cadrés', invKTeam: 0.0495, invKTotal: 0.0169 }
};

const FACTEUR_TERRAIN = { home: 1.1, away: 0.9 };

const arrondi = (x) => Number(x.toFixed(2));

/**
 * Nombre attendu de corners, tirs et tirs cadrés de chaque équipe et du
 * match, d'après `match.statInputs` (cf. matchEnrichment.js) ; `null` sans
 * entrées. Une statistique dont l'une des équipes n'a pas 6 relevés manque.
 */
export function statExpectations(match) {
  const entrees = match?.statInputs;
  if (!entrees?.home || !entrees?.away) return null;
  const out = {};
  for (const kind of Object.keys(STAT_KINDS)) {
    const h = entrees.home[kind];
    const a = entrees.away[kind];
    if (!h || !a) continue;
    const home = (FACTEUR_TERRAIN.home * (h.for + a.against)) / 2;
    const away = (FACTEUR_TERRAIN.away * (a.for + h.against)) / 2;
    out[kind] = { home: arrondi(home), away: arrondi(away), total: arrondi(home + away) };
  }
  return Object.keys(out).length ? out : null;
}

// log Γ (Lanczos) : assez précis pour des probabilités de comptage.
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const ci of c) s += ci / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}

/** P(X ≤ k) d'une binomiale négative de moyenne `mu` (Poisson si 1/k ≈ 0). */
function cdf(k, mu, invK) {
  let s = 0;
  if (invK <= 1e-6) {
    for (let i = 0; i <= k; i++) s += Math.exp(-mu + i * Math.log(mu) - lgamma(i + 1));
  } else {
    const r = 1 / invK;
    const p = r / (r + mu);
    for (let i = 0; i <= k; i++) s += Math.exp(lgamma(i + r) - lgamma(r) - lgamma(i + 1) + r * Math.log(p) + i * Math.log(1 - p));
  }
  return Math.min(1, s);
}

/**
 * Toutes les lignes utiles autour de l'attendu (de 0,4 à 1,8 fois, demi-
 * entiers), « plus » et « moins », avec leur cote juste : `{ line, side, odds }`.
 */
export function lineCandidates(mu, invK) {
  if (!(mu > 0)) return [];
  const candidats = [];
  for (let line = Math.max(0.5, Math.floor(mu * 0.4) + 0.5); line <= Math.ceil(mu * 1.8) + 0.5; line += 1) {
    const pMoins = cdf(Math.floor(line), mu, invK);
    if (pMoins > 0 && pMoins < 1) {
      candidats.push({ line, side: 'under', odds: arrondi(1 / pMoins) }, { line, side: 'over', odds: arrondi(1 / (1 - pMoins)) });
    }
  }
  return candidats;
}
