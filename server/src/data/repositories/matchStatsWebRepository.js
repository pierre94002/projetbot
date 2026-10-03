import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { distinctTeamNames, matchKeysForNames, loadEntriesByKeys, loadEntry, storeStatus } from '../db/matchStatsRead.js';
import { openDb } from '../db/matchStatsDb.js';
import { findTeams, ensureRegistries } from '../db/identityRegistry.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';

/** Champs renvoyés en pourcentage textuel ("55%"), comme /fixtures/statistics d'API-Football. */
const PERCENTAGE_STAT_KEYS = new Set(['Ball Possession', 'Passes %']);
/** Champs gardés à 2 décimales plutôt qu'arrondis au dixième. */
const DECIMAL_STAT_KEYS = new Set(['expected_goals', 'xgot', 'expected_assists', 'xgot_faced', 'goals_prevented']);
export const DEFAULT_WEB_AVERAGE_SAMPLE_SIZE = 10;

function normalize(name) {
  return (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Côté de l'équipe dans un match : correspondance exacte d'abord, puis floue
 * (teamNameMatch.js) — les sources web n'écrivent pas toujours le nom comme
 * The Odds API ("PSG" / "Paris Saint Germain").
 */
function sideOf(entry, teamName) {
  const target = normalize(teamName);
  if (normalize(entry.homeName) === target) return 'home';
  if (normalize(entry.awayName) === target) return 'away';
  // Flou seulement si UN camp correspond : les deux ("Milan" pour un derby
  // Inter-Milan) ou aucun → le match n'est pas attribué.
  const home = teamNamesLikelyMatch(entry.homeName, teamName);
  const away = teamNamesLikelyMatch(entry.awayName, teamName);
  if (home === away) return null;
  return home ? 'home' : 'away';
}

function toPerspective(entry, side) {
  const other = side === 'home' ? 'away' : 'home';
  const goalsFor = side === 'home' ? entry.homeGoals : entry.awayGoals;
  const goalsAgainst = side === 'home' ? entry.awayGoals : entry.homeGoals;
  const hasScore = goalsFor != null && goalsAgainst != null;
  const teamName = side === 'home' ? entry.homeName : entry.awayName;
  const opponentName = side === 'home' ? entry.awayName : entry.homeName;

  return {
    matchId: entry.matchId,
    matchKey: entry.matchKey,
    date: entry.date,
    league: entry.league,
    home: side === 'home',
    teamName,
    opponent: opponentName,
    score: hasScore ? `${goalsFor}-${goalsAgainst}` : null,
    result: !hasScore ? null : goalsFor > goalsAgainst ? 'V' : goalsFor < goalsAgainst ? 'D' : 'N',
    // La rencontre telle quelle (domicile à gauche), pour la carte de
    // rencontre commune de l'interface (MatchCard.vue, 01/10/2026).
    homeName: entry.homeName,
    awayName: entry.awayName,
    homeGoals: entry.homeGoals ?? null,
    awayGoals: entry.awayGoals ?? null,
    homeId: entry.homeId ?? null,
    awayId: entry.awayId ?? null,
    // Ordre [équipe consultée, adversaire] : même forme que les stats
    // API-Football consommées par MatchStatsPanel ({ teamId, teamName, stats }).
    teams: [
      { teamId: (side === 'home' ? entry.homeId : entry.awayId) ?? null, teamName, side, stats: entry.teamStats?.[side] ?? {} },
      { teamId: (side === 'home' ? entry.awayId : entry.homeId) ?? null, teamName: opponentName, side: other, stats: entry.teamStats?.[other] ?? {} }
    ],
    players: {
      team: entry.players?.[side] ?? [],
      opponent: entry.players?.[other] ?? []
    },
    sources: entry.sources ?? [],
    updatedAt: entry.updatedAt ?? null
  };
}

/**
 * Noms du magasin susceptibles de désigner l'équipe demandée. Le
 * rapprochement flou ne dépend que des deux noms : l'appliquer une fois aux
 * quelques centaines de noms distincts revient exactement au même que de le
 * refaire sur chacune des 15 700 rencontres, mais laisse ensuite la base
 * filtrer et trier.
 */
function candidateNames(teamName) {
  return distinctTeamNames().filter((name) => normalize(name) === normalize(teamName) || teamNamesLikelyMatch(name, teamName));
}

/** Tous les matchs avec stats détaillées d'une équipe, du plus récent au plus ancien. */
/**
 * Le club par son identifiant FotMob quand l'annuaire le reconnaît : dans
 * sa compétition si on la connaît (homonymes, écritures des bookmakers comme
 * « Leeds United » pour « Leeds »), sinon s'il est le seul de ce nom. Le
 * rapprochement flou par nom donnait à « Leeds United » les matchs de
 * D.C. United, mot commun « United » (constaté le 01/10/2026 sur la page d'un
 * match : la forme de Leeds montrait des matchs de MLS) ; il ne sert plus
 * qu'en dernier recours.
 */
function clubParIdentifiant(teamName, league) {
  try {
    const database = openDb();
    if (league) {
      const id = clubDuMagasin(teamName, league, database);
      if (id) return id;
    }
    ensureRegistries({ database });
    const clubs = findTeams(teamName, { database });
    return clubs.length === 1 ? clubs[0].teamId : null;
  } catch {
    return null;
  }
}

/** Clés des rencontres d'un club, de la plus récente à la plus ancienne (deux requêtes indexées). */
function matchKeysForTeamId(teamId) {
  return openDb()
    .prepare('SELECT match_key AS cle, date FROM matches WHERE home_id = ? UNION ALL SELECT match_key, date FROM matches WHERE away_id = ? ORDER BY date DESC')
    .all(teamId, teamId)
    .map((r) => r.cle);
}

export function listTeamMatchStats(teamName, { limit, league = null } = {}) {
  if (!teamName) return [];
  const teamId = clubParIdentifiant(teamName, league);
  if (teamId) {
    const toutes = matchKeysForTeamId(teamId);
    const cles = Number.isFinite(limit) && limit > 0 ? toutes.slice(0, limit) : toutes;
    return loadEntriesByKeys(cles)
      .map((entry) => ({ entry, side: entry.homeId === teamId ? 'home' : entry.awayId === teamId ? 'away' : null }))
      .filter(({ side }) => side)
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
      .map(({ entry, side }) => toPerspective(entry, side));
  }
  const names = candidateNames(teamName);
  if (!names.length) return [];
  const keys = matchKeysForNames(names);
  if (!keys.length) return [];
  const matches = loadEntriesByKeys(keys)
    .map((entry) => ({ entry, side: sideOf(entry, teamName) }))
    .filter(({ side }) => side)
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date))
    .map(({ entry, side }) => toPerspective(entry, side));
  return Number.isFinite(limit) && limit > 0 ? matches.slice(0, limit) : matches;
}

export function getMatchStatsById(matchId) {
  return loadEntry(matchId);
}

/**
 * Moyennes des stats d'équipe sur ses N derniers matchs importés, au même
 * format que getAverageMatchStats (teamStatsService.js) — permet à la modale
 * équipe d'afficher la saison EN COURS plutôt que la saison 2024 du plan
 * gratuit API-Football. `null` si aucun match importé pour cette équipe.
 */
export function getTeamWebAverages(teamName, sampleSize = DEFAULT_WEB_AVERAGE_SAMPLE_SIZE, { league = null } = {}) {
  const matches = listTeamMatchStats(teamName, { limit: sampleSize, league });
  const withStats = matches.filter((m) => Object.keys(m.teams[0].stats).length > 0);
  return moyennesDesMatchs(withStats, sampleSize);
}

/**
 * Les moyennes (toutes rencontres, domicile, extérieur) d'une liste de matchs
 * vus du côté d'une équipe, les plus récents d'abord — au format de
 * /fixtures/statistics d'API-Football, que l'interface sait lire. Null sans
 * match qui porte des statistiques.
 */
function moyennesDesMatchs(withStats, sampleSize) {
  if (withStats.length === 0) return null;

  const buckets = { total: {}, home: {}, away: {} };
  let homeMatches = 0;
  let awayMatches = 0;
  for (const match of withStats) {
    if (match.home) homeMatches++;
    else awayMatches++;
    for (const [key, raw] of Object.entries(match.teams[0].stats)) {
      const value = typeof raw === 'number' ? raw : Number(String(raw).replace('%', ''));
      if (!Number.isFinite(value)) continue;
      (buckets.total[key] ??= []).push(value);
      (buckets[match.home ? 'home' : 'away'][key] ??= []).push(value);
    }
  }

  const format = (mean, key) => {
    if (PERCENTAGE_STAT_KEYS.has(key)) return `${mean.toFixed(1)}%`;
    if (DECIMAL_STAT_KEYS.has(key)) return Number(mean.toFixed(2));
    return Number(mean.toFixed(1));
  };
  const build = (bucket) =>
    Object.fromEntries(Object.entries(bucket).map(([key, values]) => [key, format(values.reduce((s, v) => s + v, 0) / values.length, key)]));

  return {
    averages: build(buckets.total),
    homeAverages: build(buckets.home),
    awayAverages: build(buckets.away),
    sampleSize: withStats.length,
    homeSampleSize: homeMatches,
    awaySampleSize: awayMatches,
    requestedSampleSize: sampleSize,
    teamName: withStats[0].teamName,
    firstDate: withStats[withStats.length - 1].date,
    lastDate: withStats[0].date,
    source: 'web'
  };
}

/**
 * Les moyennes de chaque équipe d'un championnat, sur SES matchs DE CE
 * championnat (03/10/2026, Pierre : « il faut rechercher les statistiques
 * avec FotMob ») : lues dans le magasin, que l'actualisation automatique
 * remplit depuis FotMob — aucun appel, rien de payant.
 *
 * `teams` : [{ teamName, teamId? }] (les lignes du classement ; l'identifiant
 * FotMob évite tout rapprochement par nom). `from` / `to` bornent la saison
 * (fin exclue) ; `limit` garde les N plus récents. Un match oppose deux
 * équipes du championnat : il n'est chargé qu'une fois.
 * Renvoie { teams: [{ teamName, teamId, ...moyennes }], missing: [noms] }.
 */
export function getLeagueTeamAverages(league, teams, { limit = null, from = null, to = null } = {}) {
  const database = openDb();
  const parEquipe = teams.map((team) => ({
    team,
    teamId: (typeof team.teamId === 'string' && /^fotmob-\d+$/.test(team.teamId) && team.teamId) || clubParIdentifiant(team.teamName, league),
    cles: []
  }));
  const parId = new Map(parEquipe.filter((e) => e.teamId).map((e) => [e.teamId, e]));

  // UNE lecture des matchs du championnat, du plus récent au plus ancien (index
  // league + date), répartie entre les équipes, arrêtée dès que chacune a son
  // compte. Une requête par équipe parcourait tout l'historique du championnat
  // à chaque fois (6 s pour « 10 derniers » ; ceci : 0,15 s). Sans saison, trois
  // ans au plus : une équipe promue n'aura jamais N matchs de ce championnat.
  // Quelques matchs de réserve, au cas où une feuille n'aurait pas de statistiques.
  const besoin = Number.isFinite(limit) && limit > 0 ? limit + 4 : Infinity;
  const debut = from ?? new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  const fin = to ?? '9999-12-31';
  const requete = database.prepare('SELECT match_key AS cle, home_id AS h, away_id AS a FROM matches WHERE league = ? AND date >= ? AND date < ? ORDER BY date DESC');
  for (const ligne of requete.iterate(league, debut, fin)) {
    for (const id of [ligne.h, ligne.a]) {
      const equipe = parId.get(id);
      if (equipe && equipe.cles.length < besoin) equipe.cles.push(ligne.cle);
    }
    if (besoin !== Infinity && [...parId.values()].every((e) => e.cles.length >= besoin)) break;
  }

  const entrees = new Map(loadEntriesByKeys([...new Set(parEquipe.flatMap((e) => e.cles))], { database }).map((entry) => [entry.matchKey, entry]));
  const resultat = { teams: [], missing: [] };
  for (const { team, teamId, cles } of parEquipe) {
    const matchs = cles
      .map((cle) => entrees.get(cle))
      .filter(Boolean)
      .map((entry) => ({ entry, side: entry.homeId === teamId ? 'home' : entry.awayId === teamId ? 'away' : null }))
      .filter(({ side }) => side)
      .map(({ entry, side }) => toPerspective(entry, side))
      .filter((m) => Object.keys(m.teams[0].stats).length > 0);
    const retenus = Number.isFinite(limit) && limit > 0 ? matchs.slice(0, limit) : matchs;
    const moyennes = moyennesDesMatchs(retenus, limit ?? retenus.length);
    if (moyennes) resultat.teams.push({ ...moyennes, teamName: team.teamName, teamId });
    else resultat.missing.push(team.teamName);
  }
  return resultat;
}

/**
 * Statistiques de joueur cumulables sur une saison. Les notes et les
 * pourcentages n'y figurent pas : une note ne s'additionne pas, et un
 * pourcentage se recalcule à partir de ses deux comptes.
 */
const SUMMABLE_PLAYER_KEYS = [
  'minutes', 'goals', 'assists', 'shots', 'shotsOnTarget', 'xg', 'xa', 'keyPasses',
  'passes', 'passesAccurate', 'crosses', 'dribblesWon', 'touches', 'tackles', 'interceptions',
  'clearances', 'duelsWon', 'duelsTotal', 'foulsCommitted', 'foulsSuffered', 'offsides',
  'yellowCards', 'redCards', 'saves', 'goalsConceded',
  // Mesures détaillées relevées par FotMob.
  'xgot', 'xgotFaced', 'goalsPrevented', 'bigChancesMissed', 'touchesOppBox',
  'blocks', 'recoveries', 'dribbledPast', 'dispossessed', 'duelsLost',
  'groundDuelsWon', 'groundDuelsTotal', 'aerialsWon', 'aerialsTotal',
  'longBalls', 'longBallsAccurate', 'crossesAccurate', 'finalThirdPasses',
  'defensiveActions', 'bigChancesCreated', 'divingSaves', 'savesInsideBox', 'dribblesAttempted'
];

/**
 * Statistiques qui ne se cumulent pas : une note est déjà une synthèse, on
 * n'en garde que la moyenne. Les additionner donnerait un nombre dénué de
 * sens (« 968 de note sur la saison »).
 */
const AVERAGE_ONLY_PLAYER_KEYS = ['rating'];

/** Début de la saison en cours, utilisé par défaut pour l'effectif. */
const CURRENT_SEASON_START = '2026-07-01';

function normalizePlayerKey(name) {
  return normalize(name).replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Effectif d'une équipe reconstruit depuis ses feuilles de match, avec pour
 * chaque joueur ses totaux de la saison et ses moyennes PAR MATCH JOUÉ.
 *
 * Deux précautions rendent ces moyennes justes :
 *  - un joueur resté sur le banc (ni titulaire, ni entré en jeu) ne compte
 *    pas comme une apparition : il figurerait sinon comme un match à zéro et
 *    tirerait toutes ses moyennes vers le bas ;
 *  - chaque moyenne est divisée par le nombre de matchs où SA statistique
 *    était publiée, pas par le nombre d'apparitions. Les arrêts d'un gardien
 *    ne sont renseignés que sur une partie des rencontres selon la source ;
 *    diviser par le reste inventerait des zéros.
 *
 * C'est la seule source d'effectif complète du projet : les fiches club ne
 * publient que les buteurs et les passeurs (cf. team-profiles.json), et le
 * plan API-Football ne couvre pas la saison en cours.
 */
export function getTeamSquad(teamName, { since = CURRENT_SEASON_START, until = null } = {}) {
  if (!teamName) return null;

  const matches = listTeamMatchStats(teamName).filter(
    (m) => (!since || m.date >= since) && (!until || m.date <= until)
  );
  if (!matches.length) return null;

  const squad = new Map();
  let matchesWithPlayers = 0;

  for (const match of matches) {
    const roster = match.players?.team ?? [];
    if (!roster.length) continue;
    matchesWithPlayers++;

    for (const entry of roster) {
      if (!entry?.name) continue;
      const key = normalizePlayerKey(entry.name);
      let player = squad.get(key);
      if (!player) {
        player = {
          id: `web-${key.replace(/\s+/g, '-')}`,
          name: entry.name,
          position: null,
          number: null,
          onSheet: 0,
          appearances: 0,
          starts: 0,
          totals: {},
          averageOnly: {},
          counted: {},
          lastDate: match.date
        };
        squad.set(key, player);
      }

      player.onSheet++;
      if (entry.position && !player.position) player.position = entry.position;
      if (entry.number != null && player.number == null) player.number = entry.number;

      // Sans `subbedIn`, une ligne de banc est indiscernable d'une entrée en
      // jeu : on retombe alors sur la présence d'une statistique non nulle,
      // qui prouve que le joueur a foulé le terrain.
      const played =
        entry.starter === true ||
        entry.subbedIn === true ||
        (entry.subbedIn === undefined && entry.starter !== true && SUMMABLE_PLAYER_KEYS.some((k) => Number(entry[k]) > 0));
      if (!played) continue;

      player.appearances++;
      if (entry.starter === true) player.starts++;
      for (const key2 of SUMMABLE_PLAYER_KEYS) {
        const value = Number(entry[key2]);
        if (!Number.isFinite(value)) continue;
        player.totals[key2] = (player.totals[key2] ?? 0) + value;
        player.counted[key2] = (player.counted[key2] ?? 0) + 1;
      }
      // Cumulées pour pouvoir en tirer une moyenne, mais jamais exposées
      // comme total : c'est la moyenne seule qui a un sens.
      for (const key2 of AVERAGE_ONLY_PLAYER_KEYS) {
        const value = Number(entry[key2]);
        if (!Number.isFinite(value)) continue;
        player.averageOnly[key2] = (player.averageOnly[key2] ?? 0) + value;
        player.counted[key2] = (player.counted[key2] ?? 0) + 1;
      }
    }
  }

  const players = [...squad.values()]
    .map(({ counted, averageOnly, ...player }) => {
      const averages = {};
      for (const [key, total] of Object.entries(player.totals)) {
        if (!counted[key]) continue;
        averages[key] = Number((total / counted[key]).toFixed(2));
      }
      for (const [key, total] of Object.entries(averageOnly)) {
        if (!counted[key]) continue;
        averages[key] = Number((total / counted[key]).toFixed(2));
      }
      return {
        ...player,
        averages,
        // Champs repris tels quels par le tableau d'effectif, qui accepte
        // aussi bien cette source qu'API-Football.
        goals: player.totals.goals ?? 0,
        assists: player.totals.assists ?? 0,
        yellowCards: player.totals.yellowCards ?? 0,
        redCards: player.totals.redCards ?? 0,
        minutes: player.totals.minutes ?? null,
        rating: null
      };
    })
    .sort((a, b) => b.appearances - a.appearances || b.starts - a.starts || a.name.localeCompare(b.name));

  const seasonStart = since ? Number(since.slice(0, 4)) : null;
  return {
    teamId: null,
    teamName: matches[0].teamName,
    // Sans borne basse, l'effectif couvre tout l'historique du magasin.
    season: seasonStart === null ? 'toutes saisons' : `${seasonStart}-${String(seasonStart + 1).slice(2)}`,
    players,
    matchesCounted: matchesWithPlayers,
    firstDate: matches[matches.length - 1].date,
    lastDate: matches[0].date,
    source: 'match-stats'
  };
}

export function getMatchStatsStatus() {
  return storeStatus();
}
