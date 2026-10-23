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
  // Les moyennes de chaque équipe d'un championnat sur ses matchs de ce
  // championnat (FotMob, magasin local) : `periode` = 'saison' ou un nombre N.
  leagueAverages: (league, periode = 'saison') =>
    httpClient.get(`/match-stats/league-averages?league=${encodeURIComponent(league)}&periode=${encodeURIComponent(periode)}`),
  // Les repères d'un championnat (étape 15 du plan) : calculés chaque nuit par
  // l'actualisation (server/src/data/db/leagueBenchmarks.js), lus tels quels.
  benchmarks: (league) => httpClient.get(`/match-stats/benchmarks?league=${encodeURIComponent(league)}`),
  // L'indice de force d'un club (étape 29 du plan) : calculé chaque nuit par l'actualisation
  // (server/src/data/db/teamStrength.js), lu tel quel — jamais recalculé. `club` : « fotmob-8456 » ; `historique` :
  // sa note dans le temps (la forme).
  teamStrength: (club, { historique = false } = {}) =>
    httpClient.get(`/match-stats/team-strength?club=${encodeURIComponent(club)}${historique ? '&historique=oui' : ''}`),
  // La fiche par poste d'un joueur (étape 30 du plan) : calculée chaque nuit (server/src/data/db/playerRatings.js), lue
  // telle quelle. Affichage seulement : le moteur ne la lit pas. `player` : « fotmob-123456 ».
  playerRatings: (player) => httpClient.get(`/match-stats/player-ratings?player=${encodeURIComponent(player)}`),
  // Le style de jeu d'un club et de son entraîneur (étape 37 du plan) : calculé chaque nuit
  // (server/src/data/db/teamStyle.js), lu tel quel. Explication seulement : le moteur ne le lit pas. `club` : « fotmob-8456 ».
  teamStyle: (club) => httpClient.get(`/match-stats/team-style?club=${encodeURIComponent(club)}`),
  // Le duel de styles d'un match (étape 37) : les clubs par identifiant FotMob s'il est connu, sinon par nom et championnat.
  styleDuel: ({ homeId = null, awayId = null, homeName = null, awayName = null, league = null }) => {
    const params = new URLSearchParams();
    if (homeId) params.set('home', homeId);
    else if (homeName) params.set('homeName', homeName);
    if (awayId) params.set('away', awayId);
    else if (awayName) params.set('awayName', awayName);
    if (league && (!homeId || !awayId)) params.set('league', league);
    return httpClient.get(`/match-stats/style-duel?${params.toString()}`);
  },
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
  // Carnet de santé des données (étape 12 du plan) : un état préparé chaque nuit
  // par le contrôle (server/scripts/data-health.mjs), lu tel quel.
  health: ({ type = '', gravite = '', ligue = '', saison = '', limite = null } = {}) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (gravite) params.set('gravite', gravite);
    if (ligue) params.set('ligue', ligue);
    if (saison) params.set('saison', String(saison));
    if (limite) params.set('limite', String(limite));
    const requete = params.toString();
    return httpClient.get(`/match-stats/health${requete ? `?${requete}` : ''}`);
  },
  // Historique football-data depuis 2000 (étape 13 du plan) : un résumé préparé
  // à chaque passe de l'actualisation (server/src/data/providers/footballDataHistory.js), lu tel quel.
  fdHistory: () => httpClient.get('/match-stats/fd-history'),
  // La table du jour J (étape 17 du plan) : l'état noté par la dernière construction ou nuit
  // de l'actualisation (server/src/data/db/dayTable.js), lu tel quel — jamais recompté.
  dayTable: () => httpClient.get('/match-stats/day-table'),
  refresh: (limit) => httpClient.post('/match-stats/refresh', limit ? { limit } : {}),
  // Classement des joueurs d'une compétition, agrégé par la base (FotMob),
  // sans API-Football (plan gratuit limité à 2024, qui ne couvrait pas tous
  // les championnats).
  seasons: (league) => httpClient.get(`/match-stats/seasons?league=${encodeURIComponent(league)}`),
  /** Classement corrigé par les xG (points attendus, cf. server/src/data/db/expectedPoints.js). */
  xgTable: (league, season = null) =>
    httpClient.get(`/match-stats/xg-table?league=${encodeURIComponent(league)}${season ? `&season=${season}` : ''}`),
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
