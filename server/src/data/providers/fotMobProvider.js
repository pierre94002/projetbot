/**
 * fotMobProvider.js
 * -----------------------------------------------------------------------
 * Complète les statistiques que l'API d'ESPN ne publie pas : expected
 * goals, xGOT, grosses occasions, duels, touches dans la surface, tirs
 * dedans/dehors, poteaux — et, côté joueurs, la note, les minutes, les
 * passes, les occasions créées et les duels.
 *
 * ESPN couvre 10 des 34 champs du référentiel à 100 % et 5 autres à 61 % ;
 * FotMob en apporte une vingtaine de plus, et un seul appel par rencontre
 * suffit (`showAllPlayerStats=true` renvoie équipe ET joueurs).
 *
 * Complémentaire, jamais substitut : ESPN reste la source des scores et des
 * feuilles de match, parce que sa liste d'événements permet de trancher les
 * incohérences (cf. espnMatchStatsProvider.js). FotMob ne sert qu'à REMPLIR
 * des cases vides.
 *
 * Source publique, sans clé ni authentification. C'est une API interne non
 * documentée : elle peut changer ou se fermer sans préavis, et l'import doit
 * donc tolérer qu'une rencontre ne réponde pas.
 * -----------------------------------------------------------------------
 */

const BASE = 'https://www.fotmob.com/api/data';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Championnat CôteMaster -> compétition FotMob, identifiée par pays + nom.
 * Les identifiants numériques changent d'une saison à l'autre pour les
 * divisions inférieures (893033 puis 938218 pour la Championship) ; le
 * couple pays/nom, lui, reste stable.
 */
export const FOTMOB_LEAGUES = {
  EPL: 'ENG|Premier League',
  Championship: 'ENG|Championship',
  'League 1': 'ENG|League One',
  'League 2': 'ENG|League Two',
  'EFL Cup': 'ENG|EFL Cup',
  'La Liga - Spain': 'ESP|LaLiga',
  'La Liga 2 - Spain': 'ESP|LaLiga2',
  'Serie A - Italy': 'ITA|Serie A',
  'Serie B - Italy': 'ITA|Serie B',
  'Bundesliga - Germany': 'GER|Bundesliga',
  'Bundesliga 2 - Germany': 'GER|2. Bundesliga',
  'Ligue 1 - France': 'FRA|Ligue 1',
  'Ligue 2 - France': 'FRA|Ligue 2',
  'Premier League - Russia': 'RUS|Premier League',
  'Super League - China': 'CHN|Super League',
  // Les coupes d'Europe sont découpées par phase — « Champions League »,
  // « Champions League Grp. E », « Champions League Final Stage » — donc un
  // motif plutôt qu'un intitulé exact. L'ancrage en début de chaîne écarte
  // l'AFC Champions League, compétition asiatique sans rapport.
  'UEFA Champions League': /^INT\|Champions League(\s|$)/,
  'UEFA Europa League': /^INT\|Europa League(\s|$)/,
  'UEFA Europa Conference League': /^INT\|(Europa )?Conference League(\s|$)/
};

/** Une compétition FotMob correspond-elle à ce championnat ? */
export function leagueKeyMatches(matcher, leagueKey) {
  if (!matcher || !leagueKey) return false;
  return matcher instanceof RegExp ? matcher.test(leagueKey) : matcher === leagueKey;
}

/** Intitulé FotMob -> clé du référentiel (ui/src/constants/matchStatFields.js). */
const TEAM_STAT_MAP = {
  'Ball possession': 'Ball Possession',
  'Expected goals (xG)': 'expected_goals',
  'xG on target (xGOT)': 'xgot',
  'Total shots': 'Total Shots',
  'Shots on target': 'Shots on Goal',
  'Shots off target': 'Shots off Goal',
  'Blocked shots': 'Blocked Shots',
  'Shots inside box': 'Shots insidebox',
  'Shots outside box': 'Shots outsidebox',
  'Hit woodwork': 'woodwork',
  'Big chances': 'big_chances',
  'Touches in opposition box': 'touches_opponent_box',
  Corners: 'Corner Kicks',
  Offsides: 'Offsides',
  Passes: 'Total passes',
  'Accurate passes': 'Passes accurate',
  'Accurate long balls': 'long_balls',
  'Accurate crosses': 'crosses',
  Throws: 'throw_ins',
  Tackles: 'tackles',
  Interceptions: 'interceptions',
  Clearances: 'clearances',
  'Keeper saves': 'Goalkeeper Saves',
  'Duels won': 'duels_won',
  'Yellow cards': 'Yellow Cards',
  'Red cards': 'Red Cards',
  'Fouls committed': 'Fouls'
};

/** Clé de statistique joueur FotMob -> clé PLAYER_STAT_KEYS. */
const PLAYER_STAT_MAP = {
  rating_title: 'rating',
  minutes_played: 'minutes',
  goals: 'goals',
  assists: 'assists',
  chances_created: 'keyPasses',
  touches: 'touches',
  dribbles_succeeded: 'dribblesWon',
  Offsides: 'offsides',
  clearances: 'clearances',
  interceptions: 'interceptions',
  was_fouled: 'foulsSuffered',
  fouls: 'foulsCommitted',
  duel_won: 'duelsWon',
  saves: 'saves',
  goals_conceded: 'goalsConceded',
  // Détail des onglets Attaque / Passes / Défense / Duels / Gardien.
  expected_goals: 'xg',
  expected_goals_on_target: 'xgot',
  expected_assists: 'xa',
  xgot_faced: 'xgotFaced',
  goals_prevented: 'goalsPrevented',
  big_chance_missed_title: 'bigChancesMissed',
  touches_opp_box: 'touchesOppBox',
  shot_blocks: 'blocks',
  recoveries: 'recoveries',
  dribbled_past: 'dribbledPast',
  dispossessed: 'dispossessed',
  passes_into_final_third: 'finalThirdPasses',
  own_half_passes: 'ownHalfPasses',
  opp_half_passes: 'oppHalfPasses',
  own_goals: 'ownGoals',
  total_shots: 'shots',
  shots_on_target: 'shotsOnTarget'
};

/**
 * Statistiques fractionnaires : chacune alimente DEUX clés, la valeur
 * réussie et le total tenté.
 */
const PLAYER_FRACTION_MAP = {
  accurate_passes: ['passesAccurate', 'passes'],
  ground_duels_won: ['groundDuelsWon', 'groundDuelsTotal'],
  aerials_won: ['aerialsWon', 'aerialsTotal'],
  accurate_long_balls: ['longBallsAccurate', 'longBalls'],
  accurate_crosses: ['crossesAccurate', 'crosses']
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, { retries = 2, timeoutMs = 25000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(600 * attempt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: controller.signal });
      if (response.status >= 500 || response.status === 429) {
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

/** Premier nombre d'une valeur FotMob : 76, "1.08" ou "215 (78%)". */
function firstNumber(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const match = String(raw).match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Total d'une valeur fractionnaire "215 (78%)" -> null ; {value,total} -> total. */
function fractionTotal(raw) {
  if (raw && typeof raw === 'object' && Number.isFinite(raw.total)) return raw.total;
  return null;
}

/**
 * Toutes les rencontres d'une journée, toutes compétitions confondues — un
 * seul appel couvre les 18 championnats suivis, là où ESPN en demande un par
 * championnat.
 */
export async function fetchMatchesByDate(isoDate) {
  const payload = await fetchJson(`${BASE}/matches?date=${isoDate.replace(/-/g, '')}`);
  const out = [];
  for (const league of payload?.leagues ?? []) {
    const key = `${league.ccode}|${league.name}`;
    for (const match of league.matches ?? []) {
      const score = String(match.status?.scoreStr ?? '');
      const [homeGoals, awayGoals] = score.includes('-') ? score.split('-').map((s) => firstNumber(s)) : [null, null];
      out.push({
        matchId: String(match.id),
        leagueKey: key,
        date: isoDate,
        homeName: match.home?.name ?? null,
        awayName: match.away?.name ?? null,
        homeGoals,
        awayGoals,
        finished: Boolean(match.status?.finished)
      });
    }
  }
  return out;
}

function mapTeamStats(groups) {
  const home = {};
  const away = {};
  for (const group of groups ?? []) {
    for (const stat of group.stats ?? []) {
      const key = TEAM_STAT_MAP[stat.title];
      if (!key) continue;
      const [rawHome, rawAway] = stat.stats ?? [];
      const valueHome = firstNumber(rawHome);
      const valueAway = firstNumber(rawAway);
      // Un groupe porte une ligne d'en-tête à [null, null] : on l'ignore
      // plutôt que d'écraser la vraie ligne qui suit.
      if (valueHome === null && valueAway === null) continue;
      if (valueHome !== null && home[key] === undefined) home[key] = valueHome;
      if (valueAway !== null && away[key] === undefined) away[key] = valueAway;
    }
  }
  // Précision de passes recalculée depuis les deux comptes, comme pour ESPN.
  for (const side of [home, away]) {
    if (side['Passes accurate'] && side['Total passes']) {
      side['Passes %'] = Math.round((100 * side['Passes accurate']) / side['Total passes']);
    }
  }
  return { home, away };
}

function mapPlayer(entry) {
  const player = { name: String(entry.name ?? '').trim() };
  if (!player.name) return null;
  // Identifiant FotMob : la seule clé stable pour reconnaître un joueur d'un
  // passage à l'autre, les noms variant d'une source à l'autre.
  if (entry.id != null) player.playerId = `fotmob-${entry.id}`;
  if (entry.shirtNumber != null) player.number = firstNumber(entry.shirtNumber);
  // Le poste conditionne plusieurs lectures du magasin — les buts encaissés
  // n'y valent que pour un gardien. FotMob le donne par un drapeau dédié et
  // par la position habituelle du joueur.
  if (entry.isGoalkeeper) player.position = 'Goalkeeper';
  else {
    const usual = String(entry.usualPosition ?? '');
    if (/keeper|^gk$/i.test(usual)) player.position = 'Goalkeeper';
    else if (/defend|back/i.test(usual)) player.position = 'Defender';
    else if (/midfield/i.test(usual)) player.position = 'Midfielder';
    else if (/forward|strik|wing|attack/i.test(usual)) player.position = 'Forward';
  }

  for (const group of entry.stats ?? []) {
    for (const [, stat] of Object.entries(group.stats ?? {})) {
      const value = firstNumber(stat.stat?.value);

      // Valeurs fractionnaires ("6 sur 7") : la valeur est le nombre réussi,
      // le total le nombre tenté. Traitées avant la table de correspondance,
      // parce qu'elles alimentent DEUX clés chacune.
      const fraction = PLAYER_FRACTION_MAP[stat.key];
      if (fraction) {
        const [wonKey, totalKey] = fraction;
        if (value !== null) player[wonKey] = value;
        const total = fractionTotal(stat.stat);
        if (total !== null) player[totalKey] = total;
        if (stat.key === 'ground_duels_won' || stat.key === 'aerials_won') {
          if (total !== null) player.duelsTotal = (player.duelsTotal ?? 0) + total;
          if (value !== null) player.duelsWonParts = (player.duelsWonParts ?? 0) + value;
        }
        continue;
      }

      const key = PLAYER_STAT_MAP[stat.key];
      if (!key || value === null) continue;
      if (player[key] === undefined) player[key] = value;
    }
  }

  // `duel_won` manque sur certaines feuilles : la somme des duels au sol et
  // aériens gagnés mesure exactement la même chose.
  if (player.duelsWon === undefined && player.duelsWonParts !== undefined) player.duelsWon = player.duelsWonParts;
  delete player.duelsWonParts;

  return Object.keys(player).length > 1 ? player : null;
}

/**
 * Déroulé du match : buts avec passeur, remplacements, cartons.
 *
 * Le drapeau `ownGoal` est essentiel — un but contre son camp compte au score
 * de l'équipe adverse mais n'est attribué à aucun de ses joueurs, ce qui
 * explique les écarts entre la somme des buts d'une feuille et le score.
 */
function mapEvents(payload) {
  const raw = payload?.content?.matchFacts?.events?.events;
  if (!Array.isArray(raw)) return [];
  const homeId = payload?.general?.homeTeam?.id;
  const out = [];
  for (const event of raw) {
    const type = String(event.type ?? '');
    if (!['Goal', 'Card', 'Substitution'].includes(type)) continue;
    const entry = {
      type: type.toLowerCase(),
      minute: firstNumber(event.time),
      side: event.isHome === undefined ? (String(event.teamId ?? '') === String(homeId) ? 'home' : 'away') : event.isHome ? 'home' : 'away'
    };
    if (event.overloadTime != null) entry.addedTime = firstNumber(event.overloadTime);
    if (type === 'Goal') {
      entry.player = event.player?.name ?? event.nameStr ?? null;
      if (event.assistStr) entry.assist = String(event.assistStr).replace(/^.*?by\s+/i, '');
      if (event.ownGoal) entry.ownGoal = true;
      if (event.goalDescription) entry.detail = event.goalDescription;
    } else if (type === 'Card') {
      entry.player = event.player?.name ?? event.nameStr ?? null;
      entry.card = event.card ? String(event.card).toLowerCase() : 'yellow';
    } else if (type === 'Substitution' && Array.isArray(event.swap)) {
      entry.playerIn = event.swap[0]?.name ?? null;
      entry.playerOut = event.swap[1]?.name ?? null;
    }
    out.push(entry);
  }
  return out.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
}

/** Formation, entraîneur et note d'équipe, pour l'onglet Compositions. */
function mapLineups(payload) {
  const lineup = payload?.content?.lineup;
  if (!lineup) return null;
  const side = (team) => {
    if (!team) return null;
    const out = {};
    if (team.formation) out.formation = String(team.formation);
    if (team.rating != null) out.rating = firstNumber(team.rating);
    const coach = Array.isArray(team.coach) ? team.coach[0] : team.coach;
    if (coach?.name) out.coach = coach.name;
    return Object.keys(out).length ? out : null;
  };
  const home = side(lineup.homeTeam);
  const away = side(lineup.awayTeam);
  return home || away ? { ...(home ? { home } : {}), ...(away ? { away } : {}) } : null;
}

/**
 * Cadre de la rencontre : journée, coup d'envoi, stade, arbitre, affluence.
 * Ce sont les informations d'en-tête de la page de match.
 */
function mapMeta(payload) {
  const general = payload?.general ?? {};
  const facts = payload?.content?.matchFacts ?? {};
  const info = facts.infoBox ?? {};
  const meta = {};

  const round = general.leagueRoundName ?? info.Tournament?.roundName;
  if (round) meta.round = String(round);
  if (general.matchTimeUTCDate) meta.kickoff = general.matchTimeUTCDate;

  const stadium = info.Stadium ?? {};
  if (stadium.name) meta.stadium = stadium.name;
  if (stadium.city) meta.city = stadium.city;
  const capacity = firstNumber(stadium.capacity);
  if (capacity !== null) meta.capacity = capacity;
  if (stadium.surface) meta.surface = String(stadium.surface);

  const attendance = firstNumber(info.Attendance);
  if (attendance !== null) meta.attendance = attendance;

  // Météo du coup d'envoi : elle pèse sur le jeu (pluie, vent) et c'est un
  // des facteurs exogènes que le moteur sait prendre en compte.
  const weather = payload?.content?.weather;
  if (weather) {
    const temperature = firstNumber(weather.temperature);
    if (temperature !== null) meta.temperature = temperature;
    const wind = firstNumber(weather.windSpeed);
    if (wind !== null) meta.windSpeed = wind;
    const rain = firstNumber(weather.precipitation);
    if (rain !== null) meta.precipitation = rain;
    if (weather.description) meta.weather = String(weather.description);
  }

  // Arbitre, avec ses moyennes de la saison : elles disent s'il siffle plus
  // ou moins que la moyenne du championnat, ce qui intéresse directement les
  // marchés cartons et fautes.
  const referee = info.Referee;
  if (referee?.text) {
    meta.referee = { name: referee.text };
    if (referee.country) meta.referee.country = referee.country;
    if (referee.leagueName) meta.referee.league = referee.leagueName;
    for (const stat of referee.stats ?? []) {
      const value = firstNumber(stat.value);
      if (value === null) continue;
      if (stat.type === 'matches') meta.referee.matches = value;
      if (stat.type === 'redCards') meta.referee.redCards = value;
      if (stat.type === 'penalties') meta.referee.penalties = value;
      if (stat.type === 'yellowCards' && stat.valueType === 'perMatch') {
        meta.referee.yellowCardsPerMatch = value;
        const average = firstNumber(stat.average);
        if (average !== null) meta.referee.yellowCardsLeagueAverage = average;
      }
      if (stat.type === 'fouls' && stat.valueType === 'perMatch') {
        meta.referee.foulsPerMatch = value;
        const average = firstNumber(stat.average);
        if (average !== null) meta.referee.foulsLeagueAverage = average;
      }
    }
  }

  return Object.keys(meta).length ? meta : null;
}

/**
 * Carte des tirs : position, minute, joueur, xG, xGOT, type et situation.
 *
 * Volumineuse (une vingtaine de tirs par match) mais c'est elle qui porte le
 * détail des occasions — sans elle, on ne peut ni dessiner la carte ni
 * expliquer d'où vient le xG.
 */
function mapShotmap(payload) {
  const shots = payload?.content?.shotmap?.shots;
  if (!Array.isArray(shots) || !shots.length) return null;
  const homeId = payload?.general?.homeTeam?.id;
  return shots
    .map((shot) => {
      const out = {
        side: String(shot.teamId ?? '') === String(homeId) ? 'home' : 'away',
        minute: firstNumber(shot.min),
        player: shot.playerName ?? shot.fullName ?? null,
        x: firstNumber(shot.x),
        y: firstNumber(shot.y),
        result: String(shot.eventType ?? '').toLowerCase()
      };
      const xg = firstNumber(shot.expectedGoals);
      const xgot = firstNumber(shot.expectedGoalsOnTarget);
      if (xg !== null) out.xg = xg;
      if (xgot !== null) out.xgot = xgot;
      if (shot.shotType) out.shotType = String(shot.shotType).toLowerCase();
      if (shot.situation) out.situation = String(shot.situation).toLowerCase();
      if (shot.isOwnGoal) out.ownGoal = true;
      if (shot.isBlocked) out.blocked = true;
      if (shot.isOnTarget) out.onTarget = true;
      return out;
    })
    .filter((s) => s.player);
}

/**
 * Statistiques complètes d'une rencontre, au format attendu par
 * mergeMatchStats(). `null` si FotMob n'a pas de relevé pour ce match.
 */
export async function fetchMatchStats(matchId) {
  const payload = await fetchJson(`${BASE}/matchDetails?matchId=${encodeURIComponent(matchId)}&showAllPlayerStats=true`);
  const groups = payload?.content?.stats?.Periods?.All?.stats;
  if (!groups?.length) return null;

  const teamStats = mapTeamStats(groups);
  if (!Object.keys(teamStats.home).length && !Object.keys(teamStats.away).length) return null;

  const homeTeamId = payload?.general?.homeTeam?.id;
  const players = { home: [], away: [] };
  // Trois champs d'équipe du référentiel n'existent que par joueur chez
  // FotMob : on les totalise plutôt que de les laisser vides. Ce sont des
  // sommes, pas des estimations — chaque terme vient de la source.
  const derived = { home: {}, away: {} };
  for (const entry of Object.values(payload?.content?.playerStats ?? {})) {
    const side = String(entry.teamId) === String(homeTeamId) ? 'home' : 'away';
    for (const group of entry.stats ?? []) {
      for (const [, stat] of Object.entries(group.stats ?? {})) {
        const value = firstNumber(stat.stat?.value);
        if (value === null) continue;
        if (stat.key === 'passes_into_final_third') derived[side].final_third_passes = (derived[side].final_third_passes ?? 0) + value;
        if (stat.key === 'goals_prevented') derived[side].goals_prevented = (derived[side].goals_prevented ?? 0) + value;
        if (stat.key === 'xgot_faced') derived[side].xgot_faced = (derived[side].xgot_faced ?? 0) + value;
      }
    }
    const mapped = mapPlayer(entry);
    if (mapped) players[side].push(mapped);
  }
  for (const side of ['home', 'away']) {
    for (const [key, value] of Object.entries(derived[side])) {
      if (teamStats[side][key] === undefined) teamStats[side][key] = Number(value.toFixed(2));
    }
  }

  // Placement sur le terrain et minute d'entrée ou de sortie : ce qui permet
  // de dessiner la composition plutôt que de la lister.
  const lineup = payload?.content?.lineup;
  const byId = new Map(players.home.concat(players.away).map((p) => [p.playerId, p]));
  for (const [sideName, team] of [['home', lineup?.homeTeam], ['away', lineup?.awayTeam]]) {
    for (const entry of [...(team?.starters ?? []), ...(team?.subs ?? [])]) {
      const target = byId.get(`fotmob-${entry.id}`);
      if (!target) continue;
      target.side = sideName;
      if (entry.horizontalLayout) {
        const x = firstNumber(entry.horizontalLayout.x);
        const y = firstNumber(entry.horizontalLayout.y);
        if (x !== null) target.x = x;
        if (y !== null) target.y = y;
      }
      for (const sub of entry.performance?.substitutionEvents ?? []) {
        const minute = firstNumber(sub.time);
        if (minute === null) continue;
        if (sub.type === 'subIn') target.subInMinute = minute;
        if (sub.type === 'subOut') target.subOutMinute = minute;
      }
    }
  }

  const shotmap = mapShotmap(payload);
  return {
    matchId: String(matchId),
    homeName: payload?.general?.homeTeam?.name ?? null,
    awayName: payload?.general?.awayTeam?.name ?? null,
    teamStats,
    players,
    events: mapEvents(payload),
    lineups: mapLineups(payload),
    meta: mapMeta(payload),
    ...(shotmap ? { shotmap } : {}),
    sources: [`${BASE}/matchDetails?matchId=${matchId}`]
  };
}

export const __testing = { firstNumber, mapTeamStats, mapPlayer, TEAM_STAT_MAP, PLAYER_STAT_MAP };
