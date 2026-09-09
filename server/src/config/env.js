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
  }
};
