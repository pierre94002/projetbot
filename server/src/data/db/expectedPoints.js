/**
 * expectedPoints.js — le classement corrigé par les xG (04/10/2026).
 * -----------------------------------------------------------------------
 * L'idée d'Understat (« expected points ») refaite sur NOS données : le site
 * interdit toute lecture automatique, et les xG de FotMob sont déjà dans le
 * magasin — ceux de chaque équipe (team_stats.expected_goals) et ceux de
 * chaque tir (matches.shotmap).
 *
 * Pour chaque match joué, on rejoue les occasions : chaque tir est un but
 * avec la probabilité de son xG (loi de Poisson-binomiale, comme Understat)
 * ; sans carte des tirs complète, le total d'xG de l'équipe sert de moyenne
 * d'une loi de Poisson. On en tire la probabilité de victoire, de nul et de
 * défaite, donc les points que l'équipe « aurait dû » prendre : 3 × P(V) +
 * P(N). Additionnés sur la saison, ils disent qui gagne plus — ou moins —
 * que ses occasions ne le justifient, une chance qui a tendance à s'inverser.
 *
 * Mêmes matchs que le classement calculé (countsForTable, hors tapis vert) ;
 * un match sans xG n'est pas inventé : il est compté à part et le tableau
 * le dit.
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';
import { countsForTable, seasonsForLeague } from './matchStatsRead.js';
import { ensureRegistries, canonicalTeamNames } from './identityRegistry.js';
import { seasonBounds, seasonLabel } from '../providers/seasonWindows.js';

const BUTS_MAX = 15;
// Écart toléré entre la somme des tirs et le xG de l'équipe : au-delà, la
// carte des tirs est incomplète et c'est le total qui fait foi.
const ECART_TIRS = 0.25;

const lire = (texte) => {
  if (!texte) return null;
  try {
    return JSON.parse(texte);
  } catch {
    return null;
  }
};

const nombre = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Répartition du nombre de buts quand chaque tir marque avec la probabilité de son xG. */
function loiDesTirs(xgs) {
  let dist = [1];
  for (const p of xgs) {
    const q = Math.min(Math.max(p, 0), 0.99);
    const suite = new Array(Math.min(dist.length + 1, BUTS_MAX + 1)).fill(0);
    for (let k = 0; k < dist.length; k++) {
      suite[k] += dist[k] * (1 - q);
      if (k + 1 <= BUTS_MAX) suite[k + 1] += dist[k] * q;
    }
    dist = suite;
  }
  return dist;
}

/** Répartition de Poisson d'une moyenne d'xG. */
function loiDePoisson(lambda) {
  const dist = [];
  let p = Math.exp(-lambda);
  for (let k = 0; k <= BUTS_MAX; k++) {
    dist.push(p);
    p *= lambda / (k + 1);
  }
  return dist;
}

function issues(domicile, exterieur) {
  let victoire = 0;
  let nul = 0;
  let defaite = 0;
  for (let h = 0; h < domicile.length; h++) {
    for (let a = 0; a < exterieur.length; a++) {
      const p = domicile[h] * exterieur[a];
      if (h > a) victoire += p;
      else if (h === a) nul += p;
      else defaite += p;
    }
  }
  const total = victoire + nul + defaite || 1;
  return { victoire: victoire / total, nul: nul / total, defaite: defaite / total };
}

/**
 * Les lois de buts d'un match : par les tirs quand la carte est complète
 * (sa somme colle au xG de l'équipe), sinon par le xG de l'équipe.
 */
function loisDuMatch(m) {
  const xh = nombre(m.xh);
  const xa = nombre(m.xa);
  const tirs = lire(m.shotmap);
  if (Array.isArray(tirs) && tirs.length) {
    const xgDe = (cote) => tirs.filter((t) => t.side === cote && !t.ownGoal && Number.isFinite(Number(t.xg))).map((t) => Number(t.xg));
    const th = xgDe('home');
    const ta = xgDe('away');
    const somme = (l) => l.reduce((s, x) => s + x, 0);
    const complet = (l, total) => total === null || Math.abs(somme(l) - total) <= ECART_TIRS;
    if ((th.length || ta.length) && complet(th, xh) && complet(ta, xa)) {
      return { methode: 'tirs', home: loiDesTirs(th), away: loiDesTirs(ta), xgHome: somme(th), xgAway: somme(ta) };
    }
  }
  if (xh === null || xa === null) return null;
  return { methode: 'poisson', home: loiDePoisson(xh), away: loiDePoisson(xa), xgHome: xh, xgAway: xa };
}

const attribue = (meta) => meta?.awarded === true || meta?.awarded === 1 || ['awarded_win', 'id_reused'].includes(String(meta?.reason ?? ''));

/**
 * Les points attendus d'UN match, par la même règle que le tableau (les tirs quand la carte est complète,
 * sinon le xG de l'équipe) : { dom, ext, methode } ou null sans xG. `match` : { xh, xa, shotmap } (les xG
 * d'équipe, la carte des tirs en texte JSON). Exportée pour le banc de l'étape 29 (indice de force), qui
 * compare l'indice au classement corrigé xG tel qu'il était la veille de chaque match.
 */
export function pointsAttendusDuMatch(match) {
  const lois = loisDuMatch(match);
  if (!lois) return null;
  const p = issues(lois.home, lois.away);
  return { dom: 3 * p.victoire + p.nul, ext: 3 * p.defaite + p.nul, methode: lois.methode };
}

/** Un match compte-t-il au classement corrigé xG ? (countsForTable, hors tapis vert) — la règle du tableau, pour le banc de l'étape 29. */
export const compteAuClassementXg = (meta) => countsForTable(meta) && !attribue(meta);

/**
 * Le classement corrigé d'une compétition pour une saison (année de début ;
 * absente : la saison la plus récente du magasin). `null` sans match joué.
 */
export function expectedPointsTable(league, { season = null, database = openDb() } = {}) {
  ensureRegistries({ database });
  const saison = season ?? seasonsForLeague(league, { database })[0]?.season ?? null;
  if (!saison) return null;
  const [debut, fin] = seasonBounds(league, saison);
  const matchs = database
    .prepare(
      `SELECT m.match_key, m.date, m.home_id, m.away_id, m.home_name, m.away_name, m.home_goals AS hg, m.away_goals AS ag,
              m.meta, m.shotmap, th.expected_goals AS xh, ta.expected_goals AS xa
       FROM matches m
       LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
       LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
       WHERE m.league = ? AND m.home_goals IS NOT NULL AND m.away_goals IS NOT NULL AND m.date >= ? AND m.date < ?`
    )
    .all(league, debut, fin)
    .filter((m) => {
      const meta = lire(m.meta);
      return countsForTable(meta) && !attribue(meta);
    });
  if (!matchs.length) return null;

  const canon = canonicalTeamNames({ database });
  const equipes = new Map();
  const fiche = (id, nom) => {
    const cle = id ?? `nom:${nom}`;
    if (!equipes.has(cle)) {
      equipes.set(cle, {
        teamId: id ?? null,
        teamName: canon.get(id) ?? nom,
        played: 0,
        playedWithXg: 0,
        points: 0,
        pointsWithXg: 0,
        xPoints: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        xgFor: 0,
        xgAgainst: 0,
        goalsForWithXg: 0,
        goalsAgainstWithXg: 0
      });
    }
    return equipes.get(cle);
  };

  const methodes = { tirs: 0, poisson: 0 };
  let sansXg = 0;
  for (const m of matchs) {
    const dom = fiche(m.home_id, m.home_name);
    const ext = fiche(m.away_id, m.away_name);
    const ptsDom = m.hg > m.ag ? 3 : m.hg === m.ag ? 1 : 0;
    const ptsExt = m.ag > m.hg ? 3 : m.hg === m.ag ? 1 : 0;
    for (const [t, pts, pour, contre] of [[dom, ptsDom, m.hg, m.ag], [ext, ptsExt, m.ag, m.hg]]) {
      t.played++;
      t.points += pts;
      t.goalsFor += pour;
      t.goalsAgainst += contre;
    }
    const lois = loisDuMatch(m);
    if (!lois) {
      sansXg++;
      continue;
    }
    methodes[lois.methode]++;
    const p = issues(lois.home, lois.away);
    const lignes = [
      [dom, ptsDom, 3 * p.victoire + p.nul, lois.xgHome, lois.xgAway, m.hg, m.ag],
      [ext, ptsExt, 3 * p.defaite + p.nul, lois.xgAway, lois.xgHome, m.ag, m.hg]
    ];
    for (const [t, pts, xpts, xgPour, xgContre, pour, contre] of lignes) {
      t.playedWithXg++;
      t.pointsWithXg += pts;
      t.xPoints += xpts;
      t.xgFor += xgPour;
      t.xgAgainst += xgContre;
      t.goalsForWithXg += pour;
      t.goalsAgainstWithXg += contre;
    }
  }

  const arrondi = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
  const lignes = [...equipes.values()].map((t) => ({
    teamId: t.teamId,
    teamName: t.teamName,
    played: t.played,
    playedWithXg: t.playedWithXg,
    points: t.points,
    pointsWithXg: t.pointsWithXg,
    xPoints: arrondi(t.xPoints),
    // Points réels moins points attendus, sur les MÊMES matchs (ceux qui ont des xG).
    pointsDiff: arrondi(t.pointsWithXg - t.xPoints),
    goalsFor: t.goalsFor,
    goalsAgainst: t.goalsAgainst,
    xgFor: arrondi(t.xgFor),
    xgAgainst: arrondi(t.xgAgainst),
    xgDiff: arrondi(t.xgFor - t.xgAgainst),
    goalsMinusXgFor: arrondi(t.goalsForWithXg - t.xgFor),
    goalsMinusXgAgainst: arrondi(t.goalsAgainstWithXg - t.xgAgainst)
  }));

  // Rang réel (points, différence de buts, buts marqués) et rang corrigé.
  const reel = [...lignes].sort((a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor);
  reel.forEach((l, i) => (l.rank = i + 1));
  const corrige = [...lignes].sort((a, b) => b.xPoints - a.xPoints || b.xgDiff - a.xgDiff);
  corrige.forEach((l, i) => {
    l.xRank = i + 1;
    l.rankDiff = l.rank - l.xRank;
  });

  return {
    league,
    season: saison,
    seasonLabel: seasonLabel(league, saison),
    matches: matchs.length,
    matchesWithXg: matchs.length - sansXg,
    matchesWithoutXg: sansXg,
    methods: { shots: methodes.tirs, poisson: methodes.poisson },
    rows: corrige
  };
}
