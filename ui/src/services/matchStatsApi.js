import { httpClient } from './httpClient.js';

// Stats complètes d'équipe + stats joueurs match par match, importées depuis
// FotMob par l'actualisation automatique (server/src/jobs/matchStatsAutoRefresh.js).
export const matchStatsApi = {
  // `league` (facultatif) : désigne le bon club parmi les homonymes, par son identifiant.
  listByTeam: (name, limit, league = null) =>
    httpClient.get(`/match-stats/team?name=${encodeURIComponent(name)}${limit ? `&limit=${limit}` : ''}${league ? `&league=${encodeURIComponent(league)}` : ''}`),
  getTeamAverages: (name, sampleSize, league = null) =>
    httpClient.get(
      `/match-stats/team-averages?name=${encodeURIComponent(name)}${sampleSize ? `&sampleSize=${sampleSize}` : ''}${league ? `&league=${encodeURIComponent(league)}` : ''}`
    ),
  get: (matchId) => httpClient.get(`/match-stats/${encodeURIComponent(matchId)}`),
  // Page d'un match à venir : coup d'envoi exact, stade, météo, arbitre et
  // composition décrite (FotMob, gratuit — cf. lineupContext.js côté serveur).
  preview: ({ home, away, league, commenceTime }) => {
    const params = new URLSearchParams({ home, commenceTime });
    if (away) params.set('away', away);
    if (league) params.set('league', league);
    return httpClient.get(`/match-stats/preview?${params}`);
  },
  status: () => httpClient.get('/match-stats/status'),
  // Couverture par championnat et état du rafraîchissement automatique
  // (cf. server/src/jobs/matchStatsAutoRefresh.js).
  coverage: () => httpClient.get('/match-stats/coverage'),
  refresh: (limit) => httpClient.post('/match-stats/refresh', limit ? { limit } : {}),
  // Classement des joueurs d'une compétition, agrégé par la base — distinct
  // de teamStatsApi.getPlayersByName, qui interroge API-Football (plan
  // gratuit limité à 2024, et qui ne couvre pas tous les championnats).
  seasons: (league) => httpClient.get(`/match-stats/seasons?league=${encodeURIComponent(league)}`),
  // Profilage de cotes d'un match à venir : les matchs passés aux cotes
  // semblables et comment ils ont fini (server/src/data/db/oddsProfileRead.js).
  oddsProfile: ({ league, home, away, kickoff, odds1, oddsDraw, odds2, scope, segment, tolerance }) => {
    const params = new URLSearchParams({ league, home, away, kickoff, odds1, odds2, scope, segment, tolerance });
    if (oddsDraw) params.set('oddsDraw', oddsDraw);
    return httpClient.get(`/match-stats/odds-profile?${params}`);
  },
  players: (league, { season = null, team = null, role = null, minMinutes = null, limit = null } = {}) => {
    const params = new URLSearchParams({ league });
    if (season) params.set('season', season);
    if (team) params.set('team', team);
    if (role) params.set('role', role);
    if (minMinutes) params.set('minMinutes', minMinutes);
    if (limit) params.set('limit', limit);
    return httpClient.get(`/match-stats/players?${params}`);
  },
  // Identifiants de clubs d'après nom et compétition : leurs logos dans les
  // listes de rencontres (cf. utils/teamIds.js).
  teamIds: (teams) => httpClient.post('/match-stats/team-ids', { teams }),
  // Âge et nationalité de joueurs par identifiant (cf. utils/playerInfo.js).
  playersInfo: (ids) => httpClient.post('/match-stats/players-info', { ids }),
  // Fiche d'un joueur (page /joueur/:id) : saison toutes compétitions, par
  // compétition et match par match (server/src/data/db/matchStatsRead.js#playerProfile).
  player: (playerId, { season = null } = {}) =>
    httpClient.get(`/match-stats/player/${encodeURIComponent(playerId)}${season ? `?season=${encodeURIComponent(season)}` : ''}`),
  // Buteurs, passeurs et clean sheets en UN appel : les trois listes
  // s'affichent ensemble, dans les onglets d'un même panneau.
  getLeagueLeaders: (league, { season = null, limit = null } = {}) => {
    const params = new URLSearchParams({ league });
    if (season) params.set('season', season);
    if (limit) params.set('limit', limit);
    return httpClient.get(`/match-stats/leaders?${params}`);
  },
  // Coupes rattachées à un championnat, et le tableau de l'une d'elles.
  getLeagueCups: (league) => httpClient.get(`/match-stats/cups?league=${encodeURIComponent(league)}`),
  getCupBracket: (league, { season = null } = {}) => {
    const params = new URLSearchParams({ league });
    if (season) params.set('season', season);
    return httpClient.get(`/match-stats/bracket?${params}`);
  }
};
