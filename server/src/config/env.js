import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT) || 4000,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  apiFootball: {
    baseUrl: process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io',
    apiKey: process.env.API_FOOTBALL_KEY || ''
  },
  oddsApi: {
    baseUrl: process.env.ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4',
    apiKey: process.env.ODDS_API_KEY || ''
  },
  footballData: {
    baseUrl: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
    apiKey: process.env.FOOTBALL_DATA_API_KEY || ''
  },
  sportMonks: {
    baseUrl: process.env.SPORTMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football',
    apiKey: process.env.SPORTMONKS_API_KEY || ''
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || '',
    workspaceId: process.env.ANTHROPIC_WORKSPACE_ID || ''
  },
  apify: {
    apiToken: process.env.APIFY_API_TOKEN || '',
    flashscoreActor: process.env.APIFY_FLASHSCORE_ACTOR || 'statanow/flashscore-scraper-live'
  },
  // Rafraîchissement automatique des statistiques de match depuis l'API
  // publique d'ESPN (cf. src/jobs/matchStatsAutoRefresh.js). Source gratuite
  // et sans clé : activée par défaut, à l'inverse des fournisseurs payants.
  matchStatsRefresh: {
    enabled: process.env.MATCH_STATS_AUTO_REFRESH !== 'false',
    intervalMinutes: Number(process.env.MATCH_STATS_REFRESH_INTERVAL_MIN) || 180,
    startupDelayMinutes: Number(process.env.MATCH_STATS_REFRESH_DELAY_MIN ?? 2),
    batchSize: Number(process.env.MATCH_STATS_REFRESH_BATCH) || 300,
    concurrency: Number(process.env.MATCH_STATS_REFRESH_CONCURRENCY) || 4
  }
};
