/**
 * settlementRules.js — l'issue d'un pronostic ou d'une sélection, d'après le score.
 * -----------------------------------------------------------------------
 * Fonctions pures, sans lecture de fichier. Les règles 1 à 5 de chaque
 * fonction sont celles de l'interface (ui/src/composables/
 * usePredictionSettlement.js), ligne pour ligne : un match réglé à la main
 * et le même match réglé automatiquement doivent donner le même statut.
 * Si l'une change, reporter le changement de l'autre côté.
 *
 * Ajouts propres au règlement automatique, qui ne s'appliquent que là où
 * l'interface renvoyait « pas de règle » (null) — jamais à la place d'une
 * règle existante :
 *   - les paramètres structurés d'une sélection (`params` : {outcome},
 *     {team, line, side}), quand le libellé ne suffit pas (« Buts —
 *     Barcelona / Plus de 1.5 buts », où l'équipe est dans le marché) ;
 *   - les corners et les tirs, à partir des statistiques du match dans le
 *     magasin (`stats`), que l'interface ne sait pas régler.
 * -----------------------------------------------------------------------
 */

const GOAL_LINE_IN_LABEL = /(?:plus|moins) de (\d+(?:[.,]\d+)?)\s*buts?/i;
const ANY_LINE_IN_LABEL = /(plus|moins) de (\d+(?:[.,]\d+)?)/i;

export function extractGoalLine(label) {
  const match = GOAL_LINE_IN_LABEL.exec(label ?? '');
  return match ? match[1].replace(',', '.') : null;
}

export function namesMatch(pick, teamName) {
  const normalize = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return normalize(pick).startsWith(normalize(teamName));
}

/** Statistique de chaque marché de corners/tirs du moteur (cf. sports/football/markets.js). */
const STAT_DES_MARCHES = {
  totalCorners: 'corners',
  teamCorners: 'corners',
  totalShots: 'shots',
  teamShots: 'shots',
  totalShotsOnTarget: 'shotsOnTarget',
  teamShotsOnTarget: 'shotsOnTarget'
};

/**
 * Issue d'un marché journalisé par le moteur (Historique moteur).
 *
 * @param {object|null} stats  { home: { corners, shots, shotsOnTarget }, away: {...} } du magasin,
 *   pour les seuls marchés de corners et de tirs — sans elles, pas de règle (null).
 */
export function deriveActualOutcome(entry, homeGoals, awayGoals, stats = null) {
  const total = homeGoals + awayGoals;
  const resultSide = homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw';

  if (entry.market === 'Résultat') return resultSide;
  if (entry.market === 'Les 2 équipes marquent') return homeGoals > 0 && awayGoals > 0 ? 'yes' : 'no';

  if (entry.market === 'Total buts') {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : total > Number(line) ? 'over' : 'under';
  }
  if (entry.market === `Buts — ${entry.homeName}`) {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : homeGoals > Number(line) ? 'over' : 'under';
  }
  if (entry.market === `Buts — ${entry.awayName}`) {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : awayGoals > Number(line) ? 'over' : 'under';
  }
  if (entry.market === 'Résultat + Total buts') {
    const line = extractGoalLine(entry.predictedLabel);
    if (line === null) return null;
    const totalSide = total > Number(line) ? 'Over' : 'Under';
    const sideKey = resultSide === 'draw' ? 'draw' : resultSide;
    return `${sideKey}${totalSide}`;
  }

  // Repli sur les paramètres structurés (cf. sports/football/markets.js),
  // seulement là où le libellé ne dit rien.
  const p = entry.params ?? {};
  if (entry.marketId === 'teamGoals' && (p.team === 'home' || p.team === 'away') && Number.isFinite(Number(p.line))) {
    return (p.team === 'home' ? homeGoals : awayGoals) > Number(p.line) ? 'over' : 'under';
  }
  if (entry.marketId === 'totalGoals' && Number.isFinite(Number(p.line))) {
    return total > Number(p.line) ? 'over' : 'under';
  }

  // Corners, tirs et tirs cadrés (ajout du 01/10/2026) : par identifiant et
  // paramètres, avec les statistiques du match — jamais devinés sans elles.
  const stat = STAT_DES_MARCHES[entry.marketId];
  if (stat && Number.isFinite(Number(p.line))) {
    const nombre = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v));
    const h = nombre(stats?.home?.[stat]);
    const a = nombre(stats?.away?.[stat]);
    const valeur = entry.marketId.startsWith('team')
      ? (p.team === 'home' ? h : p.team === 'away' ? a : null)
      : h === null || a === null
        ? null
        : h + a;
    return valeur === null ? null : valeur > Number(p.line) ? 'over' : 'under';
  }
  return null;
}

/** Côté désigné par un libellé : 'home', 'away', 'draw' (nul / égalité) ou null. */
function sideOfPick(pick, homeName, awayName) {
  if (/\bnul\b|égalité|egalite/i.test(pick)) return 'draw';
  if (namesMatch(pick, homeName)) return 'home';
  if (namesMatch(pick, awayName)) return 'away';
  if (/^domicile/i.test(pick)) return 'home';
  if (/^extérieur|^exterieur/i.test(pick)) return 'away';
  return null;
}

/** Plus/moins de X d'une valeur, ou null si la ligne manque. */
function overUnder(pick, value) {
  const m = ANY_LINE_IN_LABEL.exec(pick ?? '');
  if (!m || value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const isOver = m[1].toLowerCase() === 'plus';
  return (Number(value) > Number(m[2].replace(',', '.'))) === isOver ? 'won' : 'lost';
}

/** Qui en a le plus : pick = équipe ou « Égalité ». */
function mostOf(pick, leg, homeValue, awayValue) {
  if (!Number.isFinite(Number(homeValue)) || !Number.isFinite(Number(awayValue))) return null;
  const side = sideOfPick(pick, leg.homeName, leg.awayName);
  if (!side) return null;
  const actual = Number(homeValue) > Number(awayValue) ? 'home' : Number(homeValue) < Number(awayValue) ? 'away' : 'draw';
  return side === actual ? 'won' : 'lost';
}

/**
 * Issue d'une sélection de pari réel (Mes paris) : 'won', 'lost' ou null
 * (pas de règle, ou statistique absente — jamais devinée).
 *
 * @param {object|null} stats  { home: { corners, shots, shotsOnTarget }, away: {...} } du magasin
 */
export function deriveBetLegOutcome(leg, homeGoals, awayGoals, stats = null) {
  const total = homeGoals + awayGoals;
  const bttsYes = homeGoals > 0 && awayGoals > 0;
  const resultSide = homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw';
  const pick = leg.pick ?? '';
  const market = leg.market ?? '';
  const p = leg.params ?? {};

  if (market === 'Résultat' || market === '1N2') {
    if (/nul/i.test(pick)) return resultSide === 'draw' ? 'won' : 'lost';
    if (namesMatch(pick, leg.homeName)) return resultSide === 'home' ? 'won' : 'lost';
    if (namesMatch(pick, leg.awayName)) return resultSide === 'away' ? 'won' : 'lost';
    if (p.outcome === 'home' || p.outcome === 'draw' || p.outcome === 'away') return resultSide === p.outcome ? 'won' : 'lost';
    return null;
  }

  if (market === 'Total buts') {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    return (total > Number(line)) === isOver ? 'won' : 'lost';
  }

  if (market === 'Les 2 équipes marquent') {
    return bttsYes === /oui/i.test(pick) ? 'won' : 'lost';
  }

  if (market === 'Buts par équipe' || market.startsWith('Buts — ')) {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    const isHomeTeam = namesMatch(pick, leg.homeName);
    const isAwayTeam = namesMatch(pick, leg.awayName);
    if (isHomeTeam || isAwayTeam) {
      const teamGoals = isHomeTeam ? homeGoals : awayGoals;
      return (teamGoals > Number(line)) === isOver ? 'won' : 'lost';
    }
    // L'équipe est dans le marché (« Buts — Barcelona »), ou dans les paramètres.
    const team = p.team === 'home' || p.team === 'away'
      ? p.team
      : market.startsWith('Buts — ') ? sideOfPick(market.slice('Buts — '.length), leg.homeName, leg.awayName) : null;
    if (team !== 'home' && team !== 'away') return null;
    const teamGoals = team === 'home' ? homeGoals : awayGoals;
    return (teamGoals > Number(line)) === isOver ? 'won' : 'lost';
  }

  if (market === 'Résultat + Total buts') {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    let sideMatches;
    if (/nul/i.test(pick)) sideMatches = resultSide === 'draw';
    else if (namesMatch(pick, leg.homeName)) sideMatches = resultSide === 'home';
    else if (namesMatch(pick, leg.awayName)) sideMatches = resultSide === 'away';
    else if (/^domicile/i.test(pick)) sideMatches = resultSide === 'home';
    else if (/^extérieur|^exterieur/i.test(pick)) sideMatches = resultSide === 'away';
    else return null;
    return sideMatches && (total > Number(line)) === isOver ? 'won' : 'lost';
  }

  // Corners et tirs : seulement avec les statistiques du match.
  const h = stats?.home ?? null;
  const a = stats?.away ?? null;
  if (!h || !a) return null;
  const somme = (x, y) => (Number.isFinite(Number(x)) && Number.isFinite(Number(y)) ? Number(x) + Number(y) : null);

  if (market === 'Qui fait le plus de tirs') return mostOf(pick, leg, h.shots, a.shots);
  if (market === 'Qui fait le plus de tirs cadrés') return mostOf(pick, leg, h.shotsOnTarget, a.shotsOnTarget);
  if (market === 'Qui fait le plus de corners') return mostOf(pick, leg, h.corners, a.corners);
  if (market === 'Total tirs cadrés') return overUnder(pick, somme(h.shotsOnTarget, a.shotsOnTarget));
  if (market === 'Total corners') return overUnder(pick, somme(h.corners, a.corners));
  if (market === 'Tirs par équipe' || market === 'Tirs cadrés par équipe') {
    const side = sideOfPick(pick, leg.homeName, leg.awayName);
    if (side !== 'home' && side !== 'away') return null;
    const s = side === 'home' ? h : a;
    return overUnder(pick, market === 'Tirs par équipe' ? s.shots : s.shotsOnTarget);
  }
  return null;
}
