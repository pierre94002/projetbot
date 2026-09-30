import {
  findBestTeamMatch,
  getGoalsAverage,
  getCornersAverage,
  getRecentForm,
  getAverageMatchStats,
  getLiveLineups,
  getLiveMatchDetails,
  getTeamPlayers,
  DEFAULT_FORM_SAMPLE_SIZE
} from './teamStatsService.js';
import { resolveLeagueId, resolveCurrentSeason } from './leagueRegistry.js';
import { getResultsForTeam } from '../repositories/matchResultsRepository.js';
import { getTeamWebAverages, getTeamSquad } from '../repositories/matchStatsWebRepository.js';
import {
  teamFormFromStore, teamGoalsFromStore, teamCornersFromStore,
  lineupsFromStore, matchDetailsFromStore, seasonsForLeague
} from '../db/matchStatsRead.js';
import { scoreInputsFromStore } from '../db/scoreFormRead.js';
import { resolveFotMobLineup } from './lineupPrefetch.js';
import { resolveLineupViaWeb, resolvePlayersViaWeb } from '../../core/ai/webLookupService.js';
import { getTeamProfile } from '../repositories/teamProfileRepository.js';

/**
 * Enrichit un match adapté (cf. matchSources.js) avec les moyennes réelles
 * de buts des deux équipes, récupérées via API-Football. Dégradation
 * silencieuse et PAR ÉQUIPE : chaque équipe (résolution du nom, buts, forme)
 * échoue indépendamment de l'autre — si Getafe est bloqué par le quota mais
 * Celta Vigo répond, on affiche quand même Celta Vigo plutôt que de tout
 * perdre. Seule une compétition non reconnue fait repartir le match
 * inchangé (baseline de ligue), puisqu'alors aucune des deux équipes n'a de
 * contexte exploitable. C'est un enrichissement automatique, pas une action
 * demandée explicitement par l'utilisateur.
 *
 * Les corners, lorsque `includeCorners` est vrai, sont récupérés à part :
 * une erreur à cette étape (ex. limite de débit atteinte) est cette fois
 * remontée à l'appelant plutôt que masquée, car l'utilisateur a cliqué sur un
 * bouton pour l'obtenir et doit savoir si ça a échoué — sans pour autant
 * perdre les buts déjà résolus avec succès.
 */
export async function enrichMatchWithRealAverages(match, { includeCorners = false, cornersSampleSize, sansRepliPayant = false } = {}) {
  const avecScore = { ...match, scoreInputs: resolveScoreInputs(match) };
  const resolved = await resolveGoalsEnrichment(avecScore, { sansRepliPayant });
  if (!resolved) return avecScore;

  const enrichedMatch = applyGoalsEnrichment(avecScore, resolved);
  if (!includeCorners) return enrichedMatch;

  // Le magasin a les corners dans le releve d'equipe de chaque rencontre.
  // L'appel API en coutait UN PAR MATCH de l'echantillon, le detail d'une
  // rencontre etant le seul endroit ou API-Football les publie.
  const corners = (nom) =>
    resolved.source === 'store'
      ? teamCornersFromStore(nom, { league: match.league, sampleSize: cornersSampleSize ?? undefined })
      : null;
  const [homeCorners, awayCorners] = resolved.source === 'store'
    ? [corners(match.home), corners(match.away)]
    : await Promise.all([
      resolved.homeTeam
        ? getCornersAverage(resolved.homeTeam.id, resolved.leagueId, resolved.season, cornersSampleSize)
        : null,
      resolved.awayTeam
        ? getCornersAverage(resolved.awayTeam.id, resolved.leagueId, resolved.season, cornersSampleSize)
        : null
    ]);

  return applyCornersEnrichment(enrichedMatch, homeCorners, awayCorners);
}

/**
 * Entrées du pronostic du score (cf. core/engine/scorePrediction.js) : les
 * cinq derniers matchs de chaque équipe, toutes compétitions, leur saison
 * et les moyennes du championnat, lus dans le magasin avant le jour du
 * match. `null` si le magasin ne répond pas : le score se pronostique
 * alors sur les seules cotes.
 */
function resolveScoreInputs(match) {
  try {
    const coupDEnvoi = match.commenceTime ? new Date(match.commenceTime) : new Date();
    const date = Number.isNaN(coupDEnvoi.getTime()) ? new Date().toISOString() : coupDEnvoi.toISOString();
    return scoreInputsFromStore({ league: match.league, home: match.home, away: match.away, date: date.slice(0, 10) });
  } catch (error) {
    console.warn(`[score] magasin indisponible pour ${match.home} - ${match.away} : ${error.message}`);
    return null;
  }
}

/**
 * Moyennes de buts et forme des deux équipes, lues dans le magasin.
 *
 * C'est ici que le modèle prend ses entrées (`expectedGoals`), et c'était le
 * dernier appel API-Football déclenché AUTOMATIQUEMENT, pour chaque match
 * consulté. Le magasin est meilleur sur les trois points qui comptent : la
 * saison en cours, les championnats hors plan gratuit, et la répartition
 * domicile/extérieur, calculée sur les scores plutôt que recopiée d'une
 * moyenne déjà arrondie.
 *
 * `null` si le magasin ne connaît NI l'une NI l'autre : le match repart
 * alors inchangé sur la baseline de ligue, comme il le faisait quand la
 * compétition n'était pas reconnue.
 */
function resolveGoalsFromStore(match) {
  // La saison en cours est celle que le magasin a de plus récent pour cette
  // compétition, et non l'année civile : un championnat scandinave joue de
  // mars à novembre, un championnat d'Europe de l'Ouest de juillet à mai.
  const saison = seasonsForLeague(match.league)[0]?.season ?? null;

  const lire = (nom) => {
    try {
      const buts = teamGoalsFromStore(nom, { league: match.league, season: saison });
      if (!buts) return null;
      const forme = teamFormFromStore(nom, { league: match.league, sampleSize: DEFAULT_FORM_SAMPLE_SIZE });
      return { team: { id: buts.teamId, name: nom }, goals: buts, form: forme };
    } catch (error) {
      console.warn(`[moyennes] magasin indisponible pour ${nom} : ${error.message}`);
      return null;
    }
  };

  const home = lire(match.home);
  const away = lire(match.away);
  if (!home && !away) return null;

  /**
   * La période que la moyenne du magasin a réellement couverte, telle
   * qu'elle-même la rapporte — et non telle qu'on la suppose : elle élargit
   * à tout l'historique quand la saison en cours compte trop peu de
   * rencontres, et le mélange doit suivre cet élargissement.
   */
  const league = match.league;
  const fenetreDe = (buts) => {
    const dates = buts?.dates ?? [];
    if (!dates.length) return null;
    return { dejaComptees: new Set(dates), depuis: dates[dates.length - 1], jusqu: null, league };
  };

  return {
    leagueId: null,
    season: null,
    homeTeam: home?.team ?? null,
    awayTeam: away?.team ?? null,
    homeGoals: blendGoalsWithLocalResults(home?.goals ?? null, match.home, fenetreDe(home?.goals)),
    awayGoals: blendGoalsWithLocalResults(away?.goals ?? null, match.away, fenetreDe(away?.goals)),
    homeForm: home?.form ?? null,
    awayForm: away?.form ?? null,
    source: 'store'
  };
}

/**
 * `sansRepliPayant` : pour les appelants AUTOMATIQUES (cf. autoMatchAiTrigger.js)
 * — le repli API-Football ci-dessous coûte jusqu'à 7 requêtes d'un quota de
 * 100/jour pour une équipe que le magasin ne connaît pas, sur un plan qui ne
 * couvre même pas la saison en cours. Seul un clic de l'utilisateur y a droit.
 */
async function resolveGoalsEnrichment(match, { sansRepliPayant = false } = {}) {
  const local = resolveGoalsFromStore(match);
  if (local) return local;
  if (sansRepliPayant) return null;

  let leagueId;
  try {
    leagueId = await resolveLeagueId(match.league);
  } catch {
    return null;
  }
  if (!leagueId) return null;

  const season = resolveCurrentSeason();
  const [homeTeam, awayTeam] = await Promise.all([
    findBestTeamMatch(match.home).catch(() => null),
    findBestTeamMatch(match.away).catch(() => null)
  ]);
  if (!homeTeam && !awayTeam) return null;

  const [homeGoalsRaw, awayGoalsRaw, homeForm, awayForm] = await Promise.all([
    homeTeam ? getGoalsAverage(homeTeam.id, leagueId, season).catch(() => null) : null,
    awayTeam ? getGoalsAverage(awayTeam.id, leagueId, season).catch(() => null) : null,
    homeTeam ? getRecentForm(homeTeam.id, leagueId, season).catch(() => null) : null,
    awayTeam ? getRecentForm(awayTeam.id, leagueId, season).catch(() => null) : null
  ]);

  const homeGoals = blendGoalsWithLocalResults(homeGoalsRaw, match.home);
  const awayGoals = blendGoalsWithLocalResults(awayGoalsRaw, match.away);

  return { leagueId, season, homeTeam, awayTeam, homeGoals, awayGoals, homeForm, awayForm, source: 'api-football' };
}

/**
 * Mélange la moyenne de buts API-Football avec les résultats que
 * l'utilisateur a lui-même saisis via "Score final" (cf.
 * matchResultsRepository.js) — moyenne pondérée par le nombre de rencontres
 * de chaque source, sur "total" uniquement (le seul champ avec un vrai
 * fixturesPlayed pour pondérer ; c'est aussi le seul lu par
 * applyGoalsEnrichment ci-dessous pour alimenter le modèle Poisson). Utile
 * en particulier quand l'API ne couvre pas la saison en cours (plan gratuit)
 * et ne renvoie donc aucune moyenne : dans ce cas le résultat repose
 * uniquement sur les scores locaux plutôt que de rester vide.
 */
function blendGoalsWithLocalResults(apiGoals, teamName, fenetre = null) {
  // Deux filtres, et il faut les deux.
  //
  // 1. Une rencontre que la moyenne a DÉJÀ comptée ne se rajoute pas.
  //    `match-results.json` et le magasin sont désormais remplis par le même
  //    import : sans ce filtre, l'IFK Göteborg sortait à 204 rencontres pour
  //    100 jouées, chacune pesant deux fois.
  // 2. Le mélange reste dans la MÊME fenêtre de temps que la moyenne. Sans
  //    cela, les saisons passées que la moyenne venait d'écarter rentraient
  //    par la fenêtre : le Real Madrid retombait à 2,17 but sur 172
  //    rencontres alors que sa saison en cours en dit 2,57 sur 7.
  //
  // Les filtres ne vident pas la fonction de son sens : un score saisi à la
  // main dans « Score final » pour une rencontre de la période que la source
  // ne publie pas compte toujours, et c'est ce pour quoi elle a été écrite.
  const localResults = getResultsForTeam(teamName).filter((r) => {
    if (!fenetre) return true;
    if (!r.date) return true;
    if (fenetre.dejaComptees?.has(r.date)) return false;
    if (fenetre.depuis && r.date < fenetre.depuis) return false;
    if (fenetre.jusqu && r.date >= fenetre.jusqu) return false;
    // MEME competition. Sans ce test, Barcelone - Feyenoord, un match de
    // Coupe d'Europe, entrait dans la moyenne de Liga : les resultats
    // locaux sont indexes par equipe, pas par championnat.
    if (fenetre.league && r.league && r.league !== fenetre.league) return false;
    return true;
  });
  if (localResults.length === 0) return apiGoals;

  const apiFixturesPlayed = apiGoals?.fixturesPlayed ?? 0;
  const blendedFor = blendWeightedAverage(apiGoals?.for?.total, apiFixturesPlayed, localResults.map((r) => r.goalsFor));
  const blendedAgainst = blendWeightedAverage(apiGoals?.against?.total, apiFixturesPlayed, localResults.map((r) => r.goalsAgainst));

  return {
    for: { home: apiGoals?.for?.home ?? null, away: apiGoals?.for?.away ?? null, total: blendedFor },
    against: { home: apiGoals?.against?.home ?? null, away: apiGoals?.against?.away ?? null, total: blendedAgainst },
    fixturesPlayed: apiFixturesPlayed + localResults.length
  };
}

function blendWeightedAverage(apiAverage, apiFixturesPlayed, localValues) {
  const apiSum = apiAverage != null ? apiAverage * apiFixturesPlayed : 0;
  const apiN = apiAverage != null ? apiFixturesPlayed : 0;
  const totalN = apiN + localValues.length;
  if (totalN === 0) return null;
  const localSum = localValues.reduce((sum, value) => sum + value, 0);
  return Number(((apiSum + localSum) / totalN).toFixed(2));
}

function applyGoalsEnrichment(match, resolved) {
  const homeGoalsAvg = resolved.homeGoals?.for?.total;
  const awayGoalsAvg = resolved.awayGoals?.for?.total;

  return {
    ...match,
    expectedGoals:
      homeGoalsAvg != null && awayGoalsAvg != null
        ? { home: homeGoalsAvg, away: awayGoalsAvg, provider: resolved.source === 'store' ? 'fotmob' : 'api-football' }
        : match.expectedGoals,
    teamStats: {
      home: { name: resolved.homeTeam?.name ?? match.home, goals: resolved.homeGoals, form: resolved.homeForm, corners: null },
      away: { name: resolved.awayTeam?.name ?? match.away, goals: resolved.awayGoals, form: resolved.awayForm, corners: null }
    }
  };
}

function applyCornersEnrichment(match, homeCorners, awayCorners) {
  return {
    ...match,
    expectedCorners:
      homeCorners?.average != null && awayCorners?.average != null
        ? { home: homeCorners.average, away: awayCorners.average }
        : match.expectedCorners,
    teamStats: {
      home: { ...match.teamStats.home, corners: homeCorners },
      away: { ...match.teamStats.away, corners: awayCorners }
    }
  };
}

const FORM_BATCH_SIZE = 4;

/**
 * Résout la forme récente de plusieurs équipes en une fois (ex. toute une
 * liste de matchs affichée à l'écran), en dédupliquant les équipes qui
 * apparaissent plusieurs fois et en traitant par petits lots pour rester
 * sous la limite de débit par minute d'API-Football. Chaque équipe échoue
 * indépendamment (limite atteinte, équipe introuvable…) sans bloquer les
 * autres — c'est une action groupée explicitement déclenchée, pas un
 * enrichissement automatique.
 */
export async function resolveFormForTeams(teamRequests) {
  const uniqueByKey = new Map();
  for (const request of teamRequests) {
    const key = `${request.name.toLowerCase()}|${request.league}`;
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, request);
  }

  const resultsByKey = new Map();
  const entries = [...uniqueByKey.entries()];

  for (let i = 0; i < entries.length; i += FORM_BATCH_SIZE) {
    const batch = entries.slice(i, i + FORM_BATCH_SIZE);
    await Promise.all(
      batch.map(async ([key, request]) => {
        resultsByKey.set(key, await resolveSingleTeamForm(request));
      })
    );
  }

  return (request) => resultsByKey.get(`${request.name.toLowerCase()}|${request.league}`) ?? null;
}

/**
 * Résout la forme récente d'une seule équipe par son nom (ex. clic sur un
 * nom d'équipe dans la liste des matchs, pour voir son historique complet).
 */
export async function resolveTeamFormByName(name, league, sampleSize, { sansRepliPayant = false } = {}) {
  return resolveSingleTeamForm({ name, league }, sampleSize, { sansRepliPayant });
}

async function resolveSingleTeamForm(request, sampleSize, { sansRepliPayant = false } = {}) {
  // Le magasin local d'abord — il est alimenté par FotMob, couvre la saison
  // EN COURS et les championnats hors plan API-Football. C'était le dernier
  // point du projet à demander autre chose que des cotes à une API payante,
  // et il partait une fois par équipe et par match de la liste.
  try {
    const local = teamFormFromStore(request.name, { league: request.league, sampleSize });
    if (local.totalPlayed > 0) {
      return { teamId: local.teamId, teamName: request.name, form: local, source: 'store' };
    }
  } catch (error) {
    console.warn(`[forme] magasin indisponible pour ${request.name} : ${error.message}`);
  }

  // Repli, et seulement si le magasin ne connaît pas encore cette équipe —
  // jamais pour un appelant automatique (cf. resolveGoalsEnrichment).
  if (sansRepliPayant) return null;
  try {
    const leagueId = await resolveLeagueId(request.league);
    if (!leagueId) return null;

    const team = await findBestTeamMatch(request.name);
    if (!team) return null;

    const form = await getRecentForm(team.id, leagueId, resolveCurrentSeason(), sampleSize);
    return { teamId: team.id, teamName: team.name, form, source: 'api-football' };
  } catch {
    return null;
  }
}

/**
 * Moyennes de toutes les statistiques détaillées disponibles pour une
 * équipe par son nom (ex. clic sur une équipe dans le panneau d'analyse).
 */
export async function resolveAverageStatsByName(name, league, sampleSize, { sansRepliPayant = false } = {}) {
  // Priorité aux stats importées chaque matin (saison EN COURS, cf.
  // matchStatsWebRepository.js) : API-Football gratuit s'arrête à 2024.
  // Repli API-Football uniquement si aucun match n'a encore été importé, et
  // jamais pour un appelant automatique (cf. resolveGoalsEnrichment).
  const web = getTeamWebAverages(name, sampleSize);
  if (web) return { teamId: null, teamName: name, stats: web, source: 'web' };
  if (sansRepliPayant) return null;

  const leagueId = await resolveLeagueId(league);
  if (!leagueId) return null;

  const team = await findBestTeamMatch(name);
  if (!team) return null;

  const stats = await getAverageMatchStats(team.id, leagueId, resolveCurrentSeason(), sampleSize);
  return { teamId: team.id, teamName: team.name, stats };
}

/**
 * Composition en direct d'un match réel, par nom d'équipe domicile + date de
 * coup d'envoi (ex. clic sur un match dans la liste). Ne dépend pas de la
 * ligue pour la résolution API-Football : `/fixtures` filtre déjà par équipe
 * + date + saison — `awayName`/`league` ne servent qu'au REPLI web ci-dessous
 * (recherche "X vs Y", pas juste "X").
 *
 * Repli recherche web (webLookupService.js) UNIQUEMENT quand la saison
 * demandée est hors couverture du plan gratuit API-Football
 * (`season_not_available`) — jamais pour `fixture_not_found`/`not_published_yet`,
 * qui ne sont pas des questions de couverture de plan et où une recherche web
 * n'a pas de raison de réussir là où l'API a échoué.
 */
export async function resolveLiveLineups(homeName, commenceTimeIso, awayName, league) {
  // La feuille de match du magasin d'abord : elle porte la formation, le
  // staff et le RANG de chaque joueur, c'est-à-dire l'ordre publié par la
  // source, qu'on ne saurait pas reconstituer autrement. Ne répond que pour
  // un match déjà entré au magasin (donc terminé, ou importé par ailleurs) —
  // jamais pour un match encore à venir, l'étape suivante s'en charge.
  try {
    const local = lineupsFromStore(homeName, commenceTimeIso);
    if (local.available) return local;
  } catch (error) {
    console.warn(`[compo] magasin indisponible pour ${homeName} : ${error.message}`);
  }

  // FotMob, gratuit, pour un match PAS ENCORE joué : le pré-chargement
  // (lineupPrefetch.js) l'a peut-être déjà mise en cache à l'approche du
  // coup d'envoi ; sinon un appel FotMob immédiat, jamais payant, avant
  // d'aller chercher plus loin.
  try {
    const fotmob = await resolveFotMobLineup({ homeName, awayName, commenceTimeIso, league });
    if (fotmob.available) return fotmob;
  } catch (error) {
    console.warn(`[compo] FotMob indisponible pour ${homeName} : ${error.message}`);
  }

  const team = await findBestTeamMatch(homeName).catch(() => null);
  const primary = team ? await getLiveLineups(team.id, commenceTimeIso.slice(0, 10), new Date(commenceTimeIso).getFullYear()) : { available: false, reason: 'team_not_found' };

  if (primary.available || primary.reason !== 'season_not_available') return primary;
  if (!awayName) return primary;

  return resolveLineupViaWeb({ home: homeName, away: awayName, league, commenceTimeIso });
}

/**
 * Score + statistiques en direct d'un match réel, par nom d'équipe domicile +
 * date de coup d'envoi — même principe que resolveLiveLineups.
 */
export async function resolveLiveMatchDetails(homeName, commenceTimeIso) {
  try {
    const local = matchDetailsFromStore(homeName, commenceTimeIso);
    if (local.available) return local;
  } catch (error) {
    console.warn(`[match] magasin indisponible pour ${homeName} : ${error.message}`);
  }

  const team = await findBestTeamMatch(homeName).catch(() => null);
  if (!team) return { available: false, reason: 'team_not_found' };

  const date = commenceTimeIso.slice(0, 10);
  const season = new Date(commenceTimeIso).getFullYear();
  return getLiveMatchDetails(team.id, date, season);
}

/**
 * Effectif + stats individuelles des joueurs d'une équipe par son nom. Pas
 * de dépendance à la ligue côté API-Football (`/players` ne filtre que par
 * équipe + saison) — saison par défaut = la plus récente disponible sur le
 * plan actuel (2024), ajustable via le paramètre. `league` ne sert qu'au
 * REPLI web ci-dessous (désambiguïser un nom d'équipe partagé entre pays).
 *
 * Repli en deux temps quand l'équipe n'est pas résolue OU que l'effectif
 * revient vide (ex. plan gratuit limité en pages de résultats, cf.
 * teamStatsService.js#getTeamPlayers) — jamais un remplacement d'un effectif
 * déjà obtenu avec succès : (1) le cache local team-profiles.json, peuplé par
 * la tâche planifiée pour les équipes des coupes européennes (gratuit, déjà
 * là) ; (2) sinon, recherche web à la demande (webLookupService.js).
 */
export async function resolvePlayersByName(name, season, league) {
  // Les feuilles de match d'abord : c'est la seule source qui donne
  // l'effectif ENTIER de la saison en cours, avec les moyennes par match, et
  // elle est locale, gratuite et rafraîchie toute seule. API-Football ne
  // couvre que 2022-2024 sur ce plan et consomme un quota journalier ; les
  // fiches club, elles, ne listent que les buteurs et les passeurs.
  // `season` est une année de DÉBUT de saison (2024 = 2024-25), comme chez
  // API-Football. Le magasin, lui, est daté au jour : on convertit.
  // `all` demande toutes les saisons du magasin : on lève la borne basse,
  // sans quoi le défaut de getTeamSquad ramènerait à la saison en cours.
  const window =
    String(season) === 'all'
      ? { since: null }
      : Number.isFinite(Number(season))
        ? { since: `${Number(season)}-07-01`, until: `${Number(season) + 1}-06-30` }
        : {};
  const fromMatchSheets = getTeamSquad(name, window);
  if (fromMatchSheets?.players?.length) return fromMatchSheets;

  let apiFootballError = null;
  const team = await findBestTeamMatch(name).catch((error) => {
    apiFootballError = error;
    return null;
  });
  if (team) {
    const result = await getTeamPlayers(team.id, season ?? resolveCurrentSeason()).catch((error) => {
      apiFootballError = error;
      return null;
    });
    if (result?.players?.length) return { teamId: team.id, teamName: team.name, ...result };
  }

  const cached = getTeamProfile(name);
  if (cached?.players?.length) return cached;

  const web = await resolvePlayersViaWeb({ teamName: name, league });
  if (web) return web;

  // Sans aucune source, un échec API-Football (quota journalier, clé) ne
  // doit pas se présenter comme "équipe introuvable".
  if (apiFootballError) {
    throw Object.assign(new Error(`Effectif indisponible : API-Football a échoué (${apiFootballError.message}) et aucune autre source n'a de données pour "${name}".`), { status: 502 });
  }
  return null;
}
