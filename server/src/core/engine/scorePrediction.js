/**
 * scorePrediction.js — le score le plus probable d'un match.
 * -----------------------------------------------------------------------
 * Les buts attendus de chaque équipe (lambda à domicile, mu à l'extérieur)
 * passent dans la matrice de Dixon-Coles de l'appli (0-0 à 8-8), qui donne
 * la probabilité de chaque score.
 *
 * D'OÙ VIENNENT LAMBDA ET MU. Mesuré le 23/09/2026 sur les matchs de la
 * base (poids appris sur la saison 2024-25, vérifiés sur les matchs
 * suivants, jamais vus pendant l'apprentissage) :
 *
 *   - AVEC DES COTES : les cotes 1N2 justes fixent lambda et mu (on
 *     cherche les buts attendus pour lesquels la matrice redonne les
 *     probabilités de victoire des cotes), puis on les mélange à la FORME
 *     DES CINQ DERNIERS MATCHS (buts et xG, toutes compétitions) et à la
 *     saison. Le mélange a donné à la forme un poids de 0 à 4 % : les cotes
 *     la contiennent déjà. Score exact trouvé 13,4 % du temps.
 *   - SANS COTE : la forme des cinq derniers matchs (buts, xG, tirs
 *     cadrés) et la saison, avec les poids appris. Score exact 12,6 %.
 *   - Repère : annoncer 1-1 à chaque match donne 12,2 %.
 *
 * Le score le plus probable est 1-1 dans 68 % des matchs cotés (88 % sans
 * cote) : c'est le score le plus fréquent dès qu'aucune équipe ne domine.
 * D'où aussi le meilleur score de l'issue pronostiquée (11,4 % de justes).
 *
 * Une forme brute, prise telle quelle, fait PIRE que ce repère (9 %) : cinq
 * matchs, c'est peu, et un 4-0 contre une équipe faible pèse autant qu'un
 * vrai signal. Les poids appris la ramènent à ce qu'elle vaut.
 * -----------------------------------------------------------------------
 */

import { poissonProbability } from '../model/poisson.js';
import { dixonColesAdjustment } from '../model/dixonColes.js';

const BUTS_MAX = 8;
const TAUX_MIN = 0.1;
const TAUX_MAX = 6;
const MELANGE_MIN = 0.05;
const MELANGE_MAX = 8;

/**
 * Modèles : log(buts attendus) = constante + somme des poids × log(taux).
 * F5 forme 5 en buts, F5X forme 5 en xG, F5T forme 5 en tirs cadrés,
 * S saison, M marché (cotes).
 */
export const MODELES_SCORE = {
  cotes: {
    rho: -0.04,
    lambda: { constante: 0.0581, F5: -0.0007, F5X: 0.0142, S: -0.0102, M: 0.8902 },
    mu: { constante: 0.0536, F5: -0.0044, F5X: 0.0424, S: -0.0085, M: 0.9038 }
  },
  // Cotes sans lecture de la base (match hors magasin) : même précision.
  cotesSeules: {
    rho: -0.04,
    lambda: { constante: 0.0591, M: 0.8914 },
    mu: { constante: 0.0543, M: 0.9286 }
  },
  statistiques: {
    rho: -0.075,
    lambda: { constante: 0.2299, F5: -0.0136, F5X: 0.1396, F5T: 0.1815, S: 0.2113 },
    mu: { constante: 0.1162, F5: -0.0162, F5X: 0.1504, F5T: 0.2394, S: 0.1556 }
  }
};
const TERMES_FORME = ['F5', 'F5X', 'F5T'];

/**
 * Fiabilité mesurée le 24/09/2026 en rejouant CE module (scoreFormRead.js
 * + predictScore) sur les 13 050 matchs cotés joués du 01/07/2025 au
 * 23/09/2026, après la saison d'apprentissage des poids, chacun avec les
 * seuls matchs d'avant lui. `exact` : le score annoncé est le bon ; `top3` :
 * le bon score est l'un des trois premiers ; `inPredictedOutcome` : le
 * meilleur score de l'issue pronostiquée ; `alwaysOneOne` : le repère naïf.
 * Tranches : score favori annoncé entre a et b %, part où il est tombé
 * (tranches d'au moins 100 matchs).
 */
export const FIABILITE_SCORE = {
  cotes: {
    since: '2025-07-01',
    matches: 13050,
    exact: 13.36,
    top3: 34.11,
    inPredictedOutcome: 11.44,
    alwaysOneOne: 12.24,
    bands: [
      { range: [8, 10], matches: 1280, realized: 10.23 },
      { range: [10, 12], matches: 4023, realized: 11.63 },
      { range: [12, 14], matches: 6579, realized: 14.52 },
      { range: [14, 17], matches: 1041, realized: 15.75 },
      { range: [17, 101], matches: 112, realized: 21.43 }
    ]
  },
  statistiques: {
    since: '2025-07-01',
    matches: 13050,
    exact: 12.61,
    top3: 32.26,
    inPredictedOutcome: 11.26,
    alwaysOneOne: 12.24,
    bands: [
      { range: [8, 10], matches: 406, realized: 8.37 },
      { range: [10, 12], matches: 3531, realized: 11.21 },
      { range: [12, 14], matches: 7563, realized: 13.12 },
      { range: [14, 17], matches: 1423, realized: 14.62 },
      { range: [17, 101], matches: 124, realized: 12.1 }
    ]
  }
};

const borne = (x, min, max) => Math.min(max, Math.max(min, Number.isFinite(x) ? x : min));

/**
 * Force d'attaque et de défense sur les cinq derniers matchs, rapportée à
 * ce qu'une équipe moyenne du championnat aurait fait aux mêmes endroits.
 * `stat` : 'buts', 'xg' (buts si le match n'a pas d'xG) ou 'tirs' (tirs
 * cadrés, buts si absents). Moins de cinq matchs : les places vides valent
 * la moyenne du championnat.
 */
export function forceRecente(matchs, stat, ligue, taille = 5) {
  const buts = (dom) => (dom ? ligue.goals.home : ligue.goals.away);
  const reference =
    stat === 'xg' ? (dom) => (dom ? ligue.xg.home : ligue.xg.away)
    : stat === 'tirs' && ligue.shotsOnTarget ? (dom) => (dom ? ligue.shotsOnTarget.home : ligue.shotsOnTarget.away)
    : buts;
  let pour = 0;
  let pourAttendu = 0;
  let contre = 0;
  let contreAttendu = 0;
  const retenus = (matchs ?? []).slice(0, taille);
  for (const m of retenus) {
    const vPour = stat === 'xg' ? m.xgFor : stat === 'tirs' && ligue.shotsOnTarget ? m.shotsOnTargetFor : null;
    const vContre = stat === 'xg' ? m.xgAgainst : stat === 'tirs' && ligue.shotsOnTarget ? m.shotsOnTargetAgainst : null;
    const attenduPour = reference(m.home);
    const attenduContre = reference(!m.home);
    if (vPour !== null && vPour !== undefined && vContre !== null && vContre !== undefined) {
      pour += vPour;
      contre += vContre;
    } else {
      pour += (m.goalsFor * attenduPour) / buts(m.home);
      contre += (m.goalsAgainst * attenduContre) / buts(!m.home);
    }
    pourAttendu += attenduPour;
    contreAttendu += attenduContre;
  }
  const manquants = taille - retenus.length;
  if (manquants > 0) {
    const neutre = (reference(true) + reference(false)) / 2;
    pour += manquants * neutre;
    pourAttendu += manquants * neutre;
    contre += manquants * neutre;
    contreAttendu += manquants * neutre;
  }
  return { attaque: pour / pourAttendu, defense: contre / contreAttendu, matchs: retenus.length };
}

/** Buts attendus de la saison, comme le modèle de l'appli (xgStructural.js). */
function tauxSaison(inputs) {
  const L = inputs.league.goals;
  const dom = inputs.home.season;
  const ext = inputs.away.season;
  const attDom = dom?.forHome ?? L.home;
  const defDom = dom?.againstHome ?? L.away;
  const attExt = ext?.forAway ?? L.away;
  const defExt = ext?.againstAway ?? L.home;
  const LH = Math.max(0.1, L.home);
  const LA = Math.max(0.1, L.away);
  return { lambda: (attDom / LH) * (defExt / LH) * LH, mu: (attExt / LA) * (defDom / LA) * LA };
}

/** Taux de chaque lecture statistique : forme 5 (buts, xG, tirs cadrés) et saison. */
export function tauxStatistiques(inputs) {
  const L = inputs.league.goals;
  const taux = {};
  for (const [nom, stat] of [['F5', 'buts'], ['F5X', 'xg'], ['F5T', 'tirs']]) {
    const d = forceRecente(inputs.home.last, stat, inputs.league);
    const e = forceRecente(inputs.away.last, stat, inputs.league);
    taux[nom] = { lambda: d.attaque * e.defense * L.home, mu: e.attaque * d.defense * L.away };
  }
  taux.S = tauxSaison(inputs);
  for (const t of Object.values(taux)) {
    t.lambda = borne(t.lambda, TAUX_MIN, TAUX_MAX);
    t.mu = borne(t.mu, TAUX_MIN, TAUX_MAX);
  }
  return taux;
}

// --- Matrice des scores ------------------------------------------------

function matrice(lambda, mu, rho) {
  const px = [];
  const py = [];
  for (let k = 0; k <= BUTS_MAX; k++) {
    px[k] = poissonProbability(k, lambda);
    py[k] = poissonProbability(k, mu);
  }
  const cases = [];
  let total = 0;
  for (let i = 0; i <= BUTS_MAX; i++) {
    for (let j = 0; j <= BUTS_MAX; j++) {
      const p = Math.max(0, px[i] * py[j] * dixonColesAdjustment(i, j, lambda, mu, rho));
      cases.push({ home: i, away: j, p });
      total += p;
    }
  }
  for (const c of cases) c.p /= total;
  return cases;
}

function issues(lambda, mu, rho) {
  let H = 0;
  let A = 0;
  for (const c of matrice(lambda, mu, rho)) {
    if (c.home > c.away) H += c.p;
    else if (c.home < c.away) A += c.p;
  }
  return [H, A];
}

/**
 * Buts attendus que les cotes impliquent : lambda et mu tels que la
 * matrice redonne les probabilités justes de victoire à domicile et à
 * l'extérieur (le nul fixe alors le total de buts). Gauss-Newton sur
 * (log lambda, log mu).
 */
export function tauxDuMarche(pHome, pAway, rho) {
  let u = Math.log(1.4);
  let v = Math.log(1.1);
  const bas = Math.log(0.05);
  const haut = Math.log(6);
  const residu = (a, b) => {
    const [H, A] = issues(Math.exp(a), Math.exp(b), rho);
    return [H - pHome, A - pAway];
  };
  const norme = (r) => r[0] * r[0] + r[1] * r[1];
  for (let it = 0; it < 60; it++) {
    const r0 = residu(u, v);
    const e = 1e-5;
    const ru = residu(u + e, v);
    const rv = residu(u, v + e);
    const J = [
      [(ru[0] - r0[0]) / e, (rv[0] - r0[0]) / e],
      [(ru[1] - r0[1]) / e, (rv[1] - r0[1]) / e]
    ];
    const a11 = J[0][0] ** 2 + J[1][0] ** 2;
    const a12 = J[0][0] * J[0][1] + J[1][0] * J[1][1];
    const a22 = J[0][1] ** 2 + J[1][1] ** 2;
    const b1 = -(J[0][0] * r0[0] + J[1][0] * r0[1]);
    const b2 = -(J[0][1] * r0[0] + J[1][1] * r0[1]);
    const det = a11 * a22 - a12 * a12 || 1e-12;
    const du = (a22 * b1 - a12 * b2) / det;
    const dv = (a11 * b2 - a12 * b1) / det;
    const n0 = norme(r0);
    let pas = 1;
    for (let k = 0; k < 20; k++) {
      const nu = Math.min(haut, Math.max(bas, u + pas * du));
      const nv = Math.min(haut, Math.max(bas, v + pas * dv));
      if (norme(residu(nu, nv)) < n0 || k === 19) {
        u = nu;
        v = nv;
        break;
      }
      pas /= 2;
    }
    if (Math.abs(du) + Math.abs(dv) < 1e-10) break;
  }
  return { lambda: Math.exp(u), mu: Math.exp(v) };
}

function melange(poids, taux, cote) {
  let log = poids.constante;
  for (const [terme, w] of Object.entries(poids)) {
    if (terme === 'constante') continue;
    log += w * Math.log(taux[terme][cote]);
  }
  return log;
}

/**
 * Part de la forme dans les buts attendus : de combien ils changent par
 * rapport à une forme « moyenne du championnat ».
 */
function effetForme(poids, taux, cote, neutre) {
  let log = 0;
  for (const terme of TERMES_FORME) {
    if (poids[terme] === undefined) continue;
    log += poids[terme] * (Math.log(taux[terme][cote]) - Math.log(neutre));
  }
  return Math.exp(log) - 1;
}

function resumeForme(equipe) {
  const last = equipe?.last ?? [];
  const moy = (champ) => {
    const v = last.map((m) => m[champ]).filter((x) => x !== null && x !== undefined);
    return v.length ? Number((v.reduce((s, x) => s + x, 0) / v.length).toFixed(2)) : null;
  };
  return {
    name: equipe?.name ?? null,
    teamId: equipe?.teamId ?? null,
    matches: last.map((m) => ({
      matchKey: m.matchKey ?? null,
      opponentId: m.opponentId ?? null,
      date: m.date,
      competition: m.league,
      home: m.home,
      opponent: m.opponentName,
      score: `${m.goalsFor}-${m.goalsAgainst}`,
      result: m.result,
      xgFor: m.xgFor,
      xgAgainst: m.xgAgainst
    })),
    goalsFor: moy('goalsFor'),
    goalsAgainst: moy('goalsAgainst'),
    xgFor: moy('xgFor'),
    xgAgainst: moy('xgAgainst')
  };
}

const arrondi = (x, d = 4) => Number(x.toFixed(d));
const issueDe = (c) => (c.home > c.away ? 'home' : c.home === c.away ? 'draw' : 'away');

/**
 * @param {object} p
 * @param {object|null} p.inputs  entrées lues dans le magasin (scoreInputsFromStore)
 * @param {number[]|null} p.fair  probabilités justes [domicile, nul, extérieur] des cotes, ou null
 * @param {string|null} p.predictedOutcome  issue du pronostic du résultat ('home' | 'draw' | 'away')
 * @returns {object|null} null s'il n'y a ni cote ni historique
 */
export function predictScore({ inputs = null, fair = null, predictedOutcome = null }) {
  const connues = (inputs?.home?.last?.length ?? 0) + (inputs?.away?.last?.length ?? 0);
  const avecCotes = Array.isArray(fair) && fair.every((p) => Number.isFinite(p) && p > 0);
  if (!avecCotes && (!inputs || !connues)) return null;

  const cle = avecCotes ? (inputs ? 'cotes' : 'cotesSeules') : 'statistiques';
  const modele = MODELES_SCORE[cle];
  const taux = inputs ? tauxStatistiques(inputs) : {};
  if (avecCotes) {
    const m = tauxDuMarche(fair[0], fair[2], modele.rho);
    taux.M = { lambda: borne(m.lambda, TAUX_MIN, TAUX_MAX), mu: borne(m.mu, TAUX_MIN, TAUX_MAX) };
  }
  const lambda = borne(Math.exp(melange(modele.lambda, taux, 'lambda')), MELANGE_MIN, MELANGE_MAX);
  const mu = borne(Math.exp(melange(modele.mu, taux, 'mu')), MELANGE_MIN, MELANGE_MAX);

  const cases = matrice(lambda, mu, modele.rho).sort((a, b) => b.p - a.p);
  const top = cases.slice(0, 5).map((c) => ({ home: c.home, away: c.away, probability: arrondi(c.p) }));
  const dansIssue = predictedOutcome ? cases.find((c) => issueDe(c) === predictedOutcome) : null;
  const probaIssue = (issue) => arrondi(cases.filter((c) => issueDe(c) === issue).reduce((s, c) => s + c.p, 0));

  const fiabilite = FIABILITE_SCORE[avecCotes ? 'cotes' : 'statistiques'];
  const bande = fiabilite?.bands?.find((b) => top[0].probability * 100 >= b.range[0] && top[0].probability * 100 < b.range[1]) ?? null;

  return {
    source: avecCotes ? 'cotes' : 'statistiques',
    expectedGoals: { home: arrondi(lambda, 2), away: arrondi(mu, 2) },
    mostLikely: top[0],
    inPredictedOutcome: dansIssue
      ? { outcome: predictedOutcome, home: dansIssue.home, away: dansIssue.away, probability: arrondi(dansIssue.p) }
      : null,
    top,
    outcomes: { home: probaIssue('home'), draw: probaIssue('draw'), away: probaIssue('away') },
    formEffect: inputs
      ? {
          home: arrondi(effetForme(modele.lambda, taux, 'lambda', inputs.league.goals.home), 3),
          away: arrondi(effetForme(modele.mu, taux, 'mu', inputs.league.goals.away), 3)
        }
      : null,
    form: inputs
      ? { home: resumeForme(inputs.home), away: resumeForme(inputs.away), leagueSource: inputs.league.source }
      : null,
    reliability: fiabilite ? { ...fiabilite, band: bande } : null
  };
}
