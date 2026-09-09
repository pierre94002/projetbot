/**
 * Estime les lignes (+0.5, +1.5, ...) qui semblent favorables en
 * additionnant simplement les moyennes des deux équipes sur une statistique
 * — ex. Sevilla 1.10 but + Atlético 1.80 but = 2.9, donc +0.5 et +1.5 buts
 * ressortent favorables. C'est une tendance basée sur la moyenne saison, pas
 * un calcul de probabilité réelle : d'où le cadrage "estimation" plutôt que
 * "garantie" partout où c'est affiché.
 */
export const GOAL_LINES = [0.5, 1.5, 2.5, 3.5];
export const SHOTS_ON_TARGET_LINES = [5.5, 6.5, 7.5, 8.5];
export const CORNER_LINES = [7.5, 8.5, 9.5, 10.5];

export function combinedLinesFromValues(home, away, lines) {
  const homeNum = Number(home);
  const awayNum = Number(away);
  if (!Number.isFinite(homeNum) || !Number.isFinite(awayNum)) return null;

  const combined = Number((homeNum + awayNum).toFixed(2));
  const favorable = lines.filter((line) => combined > line);
  return favorable.length ? { combined, favorable } : null;
}

// Correspondance ligne de buts -> champ trueOdds (cf. computeScoreMatrix côté
// serveur, qui calcule désormais une vraie probabilité Poisson/Dixon-Coles
// pour chacune de ces 4 lignes, pas seulement Over 2.5).
const GOAL_LINE_ODDS_KEYS = { 0.5: 'over05', 1.5: 'over15', 2.5: 'over25', 3.5: 'over35' };

/**
 * Comme combinedLinesFromValues, mais attache la vraie cote du modèle
 * (Poisson + Dixon-Coles) à chaque ligne favorable plutôt que de laisser
 * l'heuristique seule — ex. buts marqués en moyenne par les deux équipes,
 * ET la cote réelle "Plus de 2.5 buts" que ce match implique.
 */
export function goalLinesWithOdds(home, away, trueOdds) {
  const base = combinedLinesFromValues(home, away, GOAL_LINES);
  if (!base) return null;

  return {
    combined: base.combined,
    favorable: base.favorable.map((line) => ({ line, odds: trueOdds?.[GOAL_LINE_ODDS_KEYS[line]] ?? null }))
  };
}

export const TEAM_GOAL_LINES = GOAL_LINES;
const TEAM_GOAL_LINE_ODDS_KEYS = GOAL_LINE_ODDS_KEYS;
const TEAM_GOAL_LINE_UNDER_KEYS = { 0.5: 'under05', 1.5: 'under15', 2.5: 'under25', 3.5: 'under35' };

/**
 * Plus/Moins buts d'UNE équipe pour UNE ligne donnée, avec la cellule la
 * plus probable repérée — le pendant du combo Résultat+Total buts (même
 * principe de sélecteur de ligne), mais pour le total de buts d'une seule
 * équipe. Ne dépend que du lambda/mu déjà calculé pour le match, pas de la
 * moyenne saison de l'équipe.
 */
export function teamGoalsLineOdds(teamOddsBucket, line) {
  if (!teamOddsBucket) return null;

  const overOdds = teamOddsBucket[TEAM_GOAL_LINE_ODDS_KEYS[line]] ?? null;
  const underOdds = teamOddsBucket[TEAM_GOAL_LINE_UNDER_KEYS[line]] ?? null;

  let best = null;
  if (overOdds != null) best = { side: 'over', odds: overOdds };
  if (underOdds != null && (!best || underOdds < best.odds)) best = { side: 'under', odds: underOdds };

  return { overOdds, underOdds, best };
}

/**
 * Contrairement aux lignes ci-dessus (heuristique somme des moyennes), BTTS
 * vient directement de la probabilité du modèle (matrice de scores fusionnée
 * marché/structurel/exogène — cf. oddsEngine.js) : un vrai calcul, pas une
 * approximation. D'où le libellé "estimation du modèle" partout où c'est affiché.
 */
export function bothTeamsScorePercentFromOdds(odds) {
  return odds > 1 ? Math.round((1 / odds) * 100) : null;
}

const GOAL_LINE_IN_LABEL = /(?:plus|moins) de (\d+(?:[.,]\d+)?)\s*buts?/i;

/**
 * Extrait la ligne de buts (0.5/1.5/2.5/3.5) déjà présente dans un libellé de
 * pick ("Plus de 2.5 buts", "Barcelona & Plus de 1.5 buts"...) — null si le
 * pick n'a pas de ligne (1N2, BTTS).
 */
export function extractGoalLine(label) {
  const match = GOAL_LINE_IN_LABEL.exec(label ?? '');
  return match ? match[1].replace(',', '.') : null;
}

/**
 * Étiquette de regroupement pour les tableaux "taux de réussite par marché" :
 * les marchés "Buts — {équipe}" sont fusionnés sous une catégorie globale
 * (indépendante de l'équipe concernée), et la ligne de buts déjà présente
 * dans le pick est ajoutée entre parenthèses — mélanger "Plus de 0.5" et
 * "Plus de 2.5 buts" dans une même statistique serait trompeur, ce sont deux
 * paris à la probabilité très différente.
 */
export function marketBreakdownLabel(market, pick) {
  const base = market.startsWith('Buts — ') ? 'Buts par équipe' : market;
  const line = extractGoalLine(pick);
  return line ? `${base} (${line})` : base;
}

/**
 * Statut d'une sélection — chaque jambe a son propre statut, réglé
 * indépendamment du statut global du ticket. Repli sur le statut du pari
 * pour les tickets simples créés avant ce suivi par sélection (1 jambe =
 * même issue que le ticket entier).
 */
export function legStatus(bet, index) {
  return bet.legs[index]?.status ?? (bet.legs.length === 1 ? bet.status : 'pending');
}

/**
 * Compare deux noms d'équipe en ignorant accents/casse — le libellé d'un
 * pick ("Atletico Madrid — ...") et le nom stocké sur le leg ("Atlético
 * Madrid") viennent parfois de deux sources différentes (Odds API vs
 * API-Football) qui n'orthographient pas toujours pareil. Sans ça, une
 * comparaison stricte échoue silencieusement et le pari reste "en attente"
 * pour toujours même une fois le match réglé.
 */
export function namesMatch(pick, teamName) {
  const normalize = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return normalize(pick).startsWith(normalize(teamName));
}
