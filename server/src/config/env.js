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
  // Jeton longue durée (1 an) du CLI Claude Code installé via npm — cf.
  // claudeCodeClient.js. Consomme le quota de l'abonnement de Pierre (Max x5),
  // jamais l'API Anthropic à la clé (anthropic.apiKey ci-dessus, utilisée par
  // l'AUTRE fonctionnalité IA, l'audit par lot). Généré une fois via
  // `claude setup-token`, jamais régénéré automatiquement.
  claudeCode: {
    oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN || '',
    // L'exécutable natif du paquet npm, appelé SANS shell : le shim
    // `claude.cmd` du PATH ferait passer le prompt par cmd.exe, qui découpe
    // les arguments et interprète & | > — cassé, et une porte d'injection
    // pour tout texte venu de l'extérieur (notes, noms d'équipes).
    bin:
      process.env.CLAUDE_CODE_BIN ||
      (process.platform === 'win32'
        ? `${process.env.APPDATA}\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe`
        : 'claude')
  },
  apify: {
    apiToken: process.env.APIFY_API_TOKEN || '',
    flashscoreActor: process.env.APIFY_FLASHSCORE_ACTOR || 'statanow/flashscore-scraper-live'
  },
  // Actualisation complète de l'appli (cf. src/jobs/matchStatsAutoRefresh.js) :
  // FotMob et football-data.co.uk, sources gratuites et sans clé, donc
  // activée par défaut, à l'inverse des fournisseurs payants. Une passe une
  // minute après le démarrage (avec rattrapage), puis toutes les trois heures.
  matchStatsRefresh: {
    enabled: process.env.MATCH_STATS_AUTO_REFRESH !== 'false',
    intervalMinutes: Number(process.env.MATCH_STATS_REFRESH_INTERVAL_MIN) || 180,
    startupDelayMinutes: Number(process.env.MATCH_STATS_REFRESH_DELAY_MIN ?? 1),
    batchSize: Number(process.env.MATCH_STATS_REFRESH_BATCH) || 300,
    concurrency: Number(process.env.MATCH_STATS_REFRESH_CONCURRENCY) || 4
  },
  // Pré-chargement des compositions avant le coup d'envoi (cf.
  // data/providers/lineupPrefetch.js) : boucle à part, plus fréquente que
  // l'actualisation complète, désactivée avec elle (MATCH_STATS_AUTO_REFRESH).
  lineupPrefetch: {
    intervalMinutes: Number(process.env.LINEUP_PREFETCH_INTERVAL_MIN) || 5,
    windowMinutes: Number(process.env.LINEUP_PREFETCH_WINDOW_MIN) || 120,
    startupDelayMinutes: Number(process.env.LINEUP_PREFETCH_DELAY_MIN ?? 1)
  },
  // Analyse IA automatique (avant-match ET après-match), pour TOUS les
  // championnats suivis — décision explicite de Pierre le 26/09/2026. Un
  // samedi avec les 60+ championnats peut produire 180+ matchs terminés en
  // quelques heures (mesuré), donc jusqu'à 350+ analyses/jour sans plafond.
  // Depuis le 27/09/2026, passe par Claude Code (quota de l'abonnement Max x5
  // de Pierre, cf. claudeCodeClient.js) plutôt que l'API Anthropic à la clé —
  // plus de coût en dollars, mais le même besoin de plafond : `dailyLimit`
  // (les deux types confondus) protège ce quota (le quota Claude Code d'un
  // abonnement s'était déjà vidé une fois par un déclenchement automatique
  // différent, cf. memory apis) : une fois atteint, le reste attend le
  // lendemain (compteur remis à zéro à minuit Paris), plutôt que de déborder
  // sur la passe suivante le même jour.
  // Plafond relevé de 50 à 150 par Pierre le 01/10/2026, avec l'analyse de
  // chaque match une heure avant son coup d'envoi (compositions). Mesuré :
  // ~5 300 tokens pour une analyse sans composition, ~13 000 avec (São
  // Paulo - Santos, 01/10/2026), soit au plus 1,5 à 2 millions par jour.
  autoAiAnalysis: {
    enabled: process.env.AUTO_AI_ANALYSIS !== 'false',
    dailyLimit: Number(process.env.AUTO_AI_ANALYSIS_DAILY_LIMIT) || 150
  }
};
