/**
 * espnMatchStatsProvider.js
 * -----------------------------------------------------------------------
 * Statistiques de match (équipe + joueurs) depuis l'API JSON publique
 * d'ESPN, sans clé ni quota : `cdn.espn.com/core/soccer/*?xhr=1` renvoie
 * le même JSON que celui consommé par leurs pages.
 *
 * Deux appels suffisent :
 *   - scoreboard  : league + date  -> identifiants des matchs du jour
 *   - match       : gameId         -> boxscore (équipes) + rosters (joueurs)
 *
 * Le JSON est structuré et nommé (`totalShots`, `accuratePasses`…), donc la
 * lecture est déterministe : pas de reconnaissance de page, pas de modèle de
 * langage, pas de décalage de colonnes. C'est ce qui permet à CôteMaster de
 * rafraîchir ses statistiques tout seul.
 *
 * Limite de la source, assumée : elle ne publie ni xG, ni grosses occasions,
 * ni duels, ni touches dans la surface. Les champs correspondants du
 * référentiel (ui/src/constants/matchStatFields.js) restent vides plutôt
 * que d'être comblés par une estimation.
 * -----------------------------------------------------------------------
 */

const BASE = 'https://cdn.espn.com/core/soccer';
const USER_AGENT = 'Mozilla/5.0 (compatible; CoteMaster/1.0)';

/**
 * Nom de ligue CôteMaster -> slug ESPN. Les dix premiers proviennent de
 * data/runtime/team-aliases-espn.json ; les autres ont été relevés sur les
 * pages ESPN correspondantes.
 */
export const ESPN_LEAGUE_SLUGS = {
  EPL: 'eng.1',
  Championship: 'eng.2',
  'League 1': 'eng.3',
  'League 2': 'eng.4',
  'EFL Cup': 'eng.league_cup',
  'La Liga - Spain': 'esp.1',
  'La Liga 2 - Spain': 'esp.2',
  'Serie A - Italy': 'ita.1',
  'Serie B - Italy': 'ita.2',
  'Bundesliga - Germany': 'ger.1',
  'Bundesliga 2 - Germany': 'ger.2',
  'Ligue 1 - France': 'fra.1',
  'Ligue 2 - France': 'fra.2',
  'Premier League - Russia': 'rus.1',
  'Super League - China': 'chn.1',
  'UEFA Champions League': 'uefa.champions',
  'UEFA Europa League': 'uefa.europa',
  'UEFA Europa Conference League': 'uefa.europa.conf'
};

/** Statistique d'équipe ESPN -> clé du référentiel CôteMaster. */
const TEAM_STAT_MAP = {
  totalShots: 'Total Shots',
  shotsOnTarget: 'Shots on Goal',
  blockedShots: 'Blocked Shots',
  wonCorners: 'Corner Kicks',
  offsides: 'Offsides',
  totalPasses: 'Total passes',
  accuratePasses: 'Passes accurate',
  effectiveTackles: 'tackles',
  effectiveClearance: 'clearances',
  interceptions: 'interceptions',
  totalCrosses: 'crosses',
  totalLongBalls: 'long_balls',
  foulsCommitted: 'Fouls',
  yellowCards: 'Yellow Cards',
  redCards: 'Red Cards',
  saves: 'Goalkeeper Saves'
};

/**
 * Statistiques où un 0 signifie « la source ne publie pas ce champ » et non
 * « la valeur est nulle » : aucune équipe ne termine un match avec zéro passe,
 * zéro tacle ou zéro dégagement. ESPN renvoie 0 plutôt que d'omettre la ligne
 * pour les championnats qu'il ne couvre que partiellement — la Super League
 * chinoise avant juin, par exemple. Ces zéros sont écartés : le champ reste
 * vide plutôt que faux.
 *
 * Les autres clés gardent leur 0, qui y est une vraie valeur : un match sans
 * carton, sans hors-jeu ou sans corner est banal.
 */
const ZERO_MEANS_ABSENT = new Set([
  'Total passes',
  'Passes accurate',
  'tackles',
  'clearances',
  'interceptions',
  'crosses',
  'long_balls'
]);

/** Statistique de joueur ESPN -> clé PLAYER_STAT_KEYS. */
const PLAYER_STAT_MAP = {
  totalGoals: 'goals',
  goalAssists: 'assists',
  totalShots: 'shots',
  shotsOnTarget: 'shotsOnTarget',
  foulsCommitted: 'foulsCommitted',
  foulsSuffered: 'foulsSuffered',
  offsides: 'offsides',
  yellowCards: 'yellowCards',
  redCards: 'redCards',
  saves: 'saves',
  goalsConceded: 'goalsConceded'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Récupère un JSON avec reprise sur erreur réseau ou 5xx. */
async function fetchJson(url, { retries = 3, timeoutMs = 20000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(500 * attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: controller.signal });
      if (response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('échec inconnu');
}

/** `2026-09-20` -> `20260920`, format attendu par le paramètre `date`. */
function toEspnDate(isoDate) {
  return isoDate.replace(/-/g, '');
}

function numberOrNull(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(String(raw).replace('%', '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/**
 * Les matchs d'une ligue à une date donnée. Ne renvoie que les rencontres
 * dont ESPN déclare l'état terminé : une rencontre en cours n'a pas de
 * statistiques définitives.
 */
export async function fetchFinishedEvents(leagueSlug, isoDate) {
  const url = `${BASE}/scoreboard?xhr=1&league=${encodeURIComponent(leagueSlug)}&date=${toEspnDate(isoDate)}`;
  const payload = await fetchJson(url);
  const events = payload?.content?.sbData?.events ?? payload?.events ?? [];
  const finished = [];
  for (const event of events) {
    const competition = event?.competitions?.[0];
    if (!competition?.status?.type?.completed) continue;
    const home = competition.competitors?.find((c) => c.homeAway === 'home');
    const away = competition.competitors?.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;
    finished.push({
      gameId: String(event.id),
      date: isoDate,
      homeName: home.team?.displayName ?? home.team?.name ?? null,
      awayName: away.team?.displayName ?? away.team?.name ?? null,
      homeGoals: numberOrNull(home.score),
      awayGoals: numberOrNull(away.score)
    });
  }
  return finished;
}

/**
 * Ramène la position ESPN aux quatre familles utilisées dans le stockage.
 *
 * Deux particularités de la source :
 *  - les remplaçants n'ont pas de poste, seulement le libellé « Substitute ».
 *    Ce n'est pas un poste : on ne stocke rien plutôt que d'en inventer un,
 *    l'entrée depuis le banc étant déjà portée par `starter: false` ;
 *  - un gardien entré en cours de match est donc lui aussi « Substitute ».
 *    La feuille ne donne `saves` qu'aux gardiens : c'est ce qui permet de le
 *    reconnaître, et sans quoi ses buts encaissés seraient écartés.
 */
function normalizePosition(position, hasSaves = false) {
  const label = position?.displayName ?? position?.name ?? '';
  if (hasSaves || /goalkeeper|keeper/i.test(label)) return 'Goalkeeper';
  if (/defender|back/i.test(label)) return 'Defender';
  if (/midfield/i.test(label)) return 'Midfielder';
  if (/forward|striker|wing/i.test(label)) return 'Forward';
  if (/substitut/i.test(label)) return null;
  return label || null;
}

function mapTeamStatistics(statistics = []) {
  const out = {};
  let accurate = null;
  let total = null;
  for (const stat of statistics) {
    const value = numberOrNull(stat.displayValue ?? stat.value);
    if (value === null) continue;
    // Une possession à 0 signifie « non publiée » : une équipe ne passe pas
    // un match entier sans toucher le ballon.
    if (stat.name === 'possessionPct' && value > 0) out['Ball Possession'] = value;
    if (stat.name === 'accuratePasses' && value > 0) accurate = value;
    if (stat.name === 'totalPasses' && value > 0) total = value;
    const key = TEAM_STAT_MAP[stat.name];
    if (key && !(value === 0 && ZERO_MEANS_ABSENT.has(key))) out[key] = value;
  }
  // Précision de passes recalculée depuis les deux comptes : ESPN ne publie
  // qu'un ratio arrondi au dixième (0.8 pour 82,4 %), trop grossier pour une
  // moyenne de saison.
  if (accurate !== null && total) out['Passes %'] = Math.round((100 * accurate) / total);
  return out;
}

function mapRoster(rosterEntry) {
  const players = [];
  for (const entry of rosterEntry?.roster ?? []) {
    const name = entry?.athlete?.fullName ?? entry?.athlete?.displayName;
    if (!name) continue;
    const stats = {};
    for (const stat of entry.stats ?? []) {
      const key = PLAYER_STAT_MAP[stat.name];
      if (!key) continue;
      const value = numberOrNull(stat.value ?? stat.displayValue);
      if (value !== null) stats[key] = value;
    }

    const position = normalizePosition(entry.position, 'saves' in stats);
    // ESPN donne `goalsConceded` à TOUS les joueurs : c'est le nombre de buts
    // encaissés pendant qu'ils étaient sur le terrain. Le stockage n'emploie
    // ce champ que comme statistique de gardien, et seulement pour celui qui
    // a joué : un gardien resté sur le banc a bien 0 encaissé, mais le
    // compter comme un match à zéro fausserait sa moyenne de la saison.
    const played = entry.starter === true || entry.subbedIn === true;
    if (position !== 'Goalkeeper' || !played) delete stats.goalsConceded;

    const player = { name: String(name).trim() };
    if (position) player.position = position;
    if (entry.jersey != null) player.number = numberOrNull(entry.jersey);
    if (typeof entry.starter === 'boolean') player.starter = entry.starter;
    // Seul indice fiable qu'un remplaçant a réellement joué : sans lui, un
    // joueur resté sur le banc compterait comme une apparition et diluerait
    // toutes ses moyennes par match.
    if (typeof entry.subbedIn === 'boolean') player.subbedIn = entry.subbedIn;
    Object.assign(player, stats);
    players.push(player);
  }
  return players;
}

/**
 * Statistiques complètes d'un match, au format attendu par
 * scripts/merge-match-stats.mjs. `null` si ESPN n'a pas de boxscore pour
 * cette rencontre (match non couvert, trop ancien, ou données absentes).
 */
export async function fetchMatchStats(gameId) {
  const url = `${BASE}/match?gameId=${encodeURIComponent(gameId)}&xhr=1`;
  const payload = await fetchJson(url);
  const pack = payload?.gamepackageJSON;
  const teams = pack?.boxscore?.teams ?? [];
  if (teams.length !== 2) return null;

  const homeTeam = teams.find((t) => t.homeAway === 'home');
  const awayTeam = teams.find((t) => t.homeAway === 'away');
  if (!homeTeam || !awayTeam) return null;

  const teamStats = {
    home: mapTeamStatistics(homeTeam.statistics),
    away: mapTeamStatistics(awayTeam.statistics)
  };
  if (!Object.keys(teamStats.home).length && !Object.keys(teamStats.away).length) return null;

  const rosters = pack?.rosters ?? [];
  const homeRoster = rosters.find((r) => r.homeAway === 'home');
  const awayRoster = rosters.find((r) => r.homeAway === 'away');
  const players = {
    home: homeRoster ? mapRoster(homeRoster) : [],
    away: awayRoster ? mapRoster(awayRoster) : []
  };

  return {
    gameId: String(gameId),
    homeName: homeTeam.team?.displayName ?? homeTeam.team?.name ?? null,
    awayName: awayTeam.team?.displayName ?? awayTeam.team?.name ?? null,
    teamStats,
    players,
    sources: [`${BASE}/match?gameId=${gameId}`]
  };
}

export const __testing = { mapTeamStatistics, mapRoster, normalizePosition, toEspnDate };
