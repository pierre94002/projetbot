/**
 * rencontres.js — les listes de matchs de l'appli mises au format de la carte
 * de rencontre commune (components/matches/MatchCard.vue, 01/10/2026 : « ce
 * design partout où il y a des rencontres »).
 */

/**
 * Un match joué vu par une équipe (GET /match-stats/team : `home`, `teamName`,
 * `opponent`, `score` « pour-contre ») -> la carte : domicile à gauche, score
 * au centre, le résultat V/N/D de l'équipe. Les champs `homeName`…`awayId`
 * du serveur sont pris s'ils sont là, sinon reconstruits.
 */
export function rencontreVueParEquipe(m, nomEquipe = null) {
  const [pour, contre] = String(m.score ?? '')
    .split('-')
    .map((x) => (x === '' ? null : Number(x)));
  const equipe = m.teamName ?? nomEquipe;
  return {
    matchId: m.matchId,
    date: m.date,
    league: m.league,
    homeName: m.homeName ?? (m.home ? equipe : m.opponent),
    awayName: m.awayName ?? (m.home ? m.opponent : equipe),
    homeGoals: m.homeGoals ?? (m.score ? (m.home ? pour : contre) : null),
    awayGoals: m.awayGoals ?? (m.score ? (m.home ? contre : pour) : null),
    homeId: m.homeId ?? m.teams?.[m.home ? 0 : 1]?.teamId ?? null,
    awayId: m.awayId ?? m.teams?.[m.home ? 1 : 0]?.teamId ?? null,
    status: 'finished',
    side: m.home ? 'home' : 'away'
  };
}
