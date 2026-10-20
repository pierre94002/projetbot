import 'dotenv/config';
import { modeBacASable, preparerEnvironnementBac } from './bacASable.js';

// Bac à sable (cf. bacASable.js) : clés payantes et jeton Claude vidés, IA
// automatique coupée, actualisation et cotes gratuites coupées sauf essai
// explicite — AVANT de lire l'environnement, quel que soit le point d'entrée
// (serveur, ou script lancé depuis la copie du bac). Hors bac : rien.
if (modeBacASable()) preparerEnvironnementBac();

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
  // Cotes GRATUITES (04/10/2026, Pierre : « récupère-les gratuitement, de la
  // même façon que les données de match ») : ESPN, football-data.co.uk,
  // 365Scores, Kalshi, Smarkets, sans clé (cf. data/providers/freeOdds.js).
  // Relevées par l'actualisation complète (matchs à venir) et par une boucle
  // à part (cf. jobs/oddsWatch.js) : avant le coup d'envoi, en direct, et le
  // rattrapage de l'historique par tranches de `backfillBudget` requêtes par
  // source. Désactivées avec l'actualisation (MATCH_STATS_AUTO_REFRESH).
  freeOdds: {
    enabled: process.env.FREE_ODDS !== 'false',
    intervalMinutes: Number(process.env.FREE_ODDS_INTERVAL_MIN) || 5,
    backfill: process.env.FREE_ODDS_BACKFILL !== 'false',
    backfillBudget: Number(process.env.FREE_ODDS_BACKFILL_BUDGET) || 150,
    startupDelayMinutes: Number(process.env.FREE_ODDS_DELAY_MIN ?? 2)
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
  },
  // Fiche envoyée à l'IA d'analyse de match (étape 41 du plan, 06/10/2026,
  // cf. core/ai/compactContext.js) : la fiche COMPACTE par défaut — petits
  // tableaux, consignes fixes relues depuis la mémoire cache de Claude, au
  // clic comme en automatique, en mode normal comme en mode économe.
  // AI_ANALYSIS_FICHE=ancienne revient à l'ancienne forme (blocs JSON,
  // consignes avec le nom des équipes) : pour comparer, ou par prudence si la
  // fiche compacte faisait baisser la qualité des avis. Chaque appel note sa
  // forme au journal des appels Claude (étape 4), chaque analyse l'enregistre.
  ficheIa: /^\s*ancienne\s*$/i.test(process.env.AI_ANALYSIS_FICHE ?? '') ? 'ancienne' : 'compacte',
  // Texte minute par minute de FotMob dans la revue d'après-match (étape 43,
  // 07/10/2026, cf. data/providers/fotMobCommentaire.js) : quelques lignes
  // (VAR, penalties concédés, blessures, grosses occasions) lues chez FotMob,
  // gratuitement, quand le match a un texte — au plus 5 lignes de 130
  // caractères. Activé par défaut ; AI_COMMENTAIRE_MATCH=non (ou 0, false, off)
  // le retire, le déroulé des événements restant. Jamais avec l'ancienne fiche.
  commentaireMatch: !/^\s*(0|false|non|no|off)\s*$/i.test(process.env.AI_COMMENTAIRE_MATCH ?? ''),
  // Enregistreurs (étape E du plan, 05/10/2026, cf. jobs/enregistreurs.js) :
  // ce qui se perd si on ne le note pas sur le moment — absents du jour,
  // état des matchs en direct, chaque cote payante relevée, pronostics du
  // moteur gelés. Gratuits (FotMob, fichiers locaux), sans Claude. Tournent
  // avec l'actualisation (MATCH_STATS_AUTO_REFRESH) — donc coupés dans le bac
  // à sable sauf CM_BAC_ACTUALISATION=1 — et ENREGISTREURS=false les coupe.
  // Direct : un instantané par match au plus toutes les `directPasMinutes`
  // (5 au moins), au plus `directMaxDetailsParMinute` lectures du détail d'un
  // match par minute (charge FotMob d'un samedi chargé).
  enregistreurs: {
    enabled: process.env.ENREGISTREURS !== 'false',
    direct: process.env.ENREGISTREURS_DIRECT !== 'false',
    directPasMinutes: Math.max(5, Number(process.env.ENREGISTREURS_DIRECT_PAS_MIN) || 5),
    directMaxDetailsParMinute: Math.max(1, Number(process.env.ENREGISTREURS_DIRECT_MAX_PAR_MIN) || 6),
    absentsIntervalleMinutes: Math.max(10, Number(process.env.ENREGISTREURS_ABSENTS_INTERVALLE_MIN) || 30),
    absentsMaxLecturesParPasse: Math.max(1, Number(process.env.ENREGISTREURS_ABSENTS_MAX_PAR_PASSE) || 25),
    startupDelayMinutes: Number(process.env.ENREGISTREURS_DELAY_MIN ?? 2)
  },
  // Sauvegardes (étape 1 du plan, cf. scripts/backup-db.mjs) : une copie de
  // nuit compressée dans CoteMaster\sauvegardes, et une fois par semaine une
  // copie HORS DU DISQUE. Sa destination se choisit dans l'appli (Réglages ›
  // Sauvegardes : OneDrive, clé USB ou autre dossier, aucune), enregistrée
  // dans data/runtime/sauvegarde-hors-disque.json — Pierre ne touche jamais à
  // ce fichier .env. Ordre (cf. data/sauvegardes/destinationHorsDisque.js) :
  // le choix enregistré, sinon cette variable si elle existe, sinon OneDrive
  // quand il est détecté (décision de Pierre du 05/10/2026, une seule copie
  // gardée là-bas), sinon rien. « aucune » = refus explicite, sans alerte.
  // Sur un dossier ou une clé : 1 ou 2 copies (…_GARDER), jamais plus.
  sauvegarde: {
    horsDisque: (process.env.CM_SAUVEGARDE_HORS_DISQUE ?? '').trim(),
    horsDisqueGarder: Math.min(2, Math.max(1, Number(process.env.CM_SAUVEGARDE_HORS_DISQUE_GARDER) || 2))
  }
};
