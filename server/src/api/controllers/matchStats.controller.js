import {
  listTeamMatchStats,
  getMatchStatsById,
  getTeamWebAverages,
  getLeagueTeamAverages,
  getMatchStatsStatus
} from '../../data/repositories/matchStatsWebRepository.js';
import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { getCoverage } from '../../data/providers/espnMatchStatsRefresh.js';
import { readRefreshStatus } from '../../data/repositories/refreshStatusRepository.js';
import { isRefreshRunning } from '../../data/providers/refreshLock.js';
// La passe manuelle est LA MÊME que la passe automatique : FotMob seul,
// calendrier, classements officiels, rencontres nouvelles puis feuilles
// manquantes. Elle relançait autrefois ESPN.
import { refreshNow } from '../../jobs/matchStatsAutoRefresh.js';
import { playerSeasonStats, playerProfile, seasonsForLeague, leagueLeaders, cupBracket } from '../../data/db/matchStatsRead.js';
import { cupsForLeague } from '../../data/providers/leagueCups.js';
import { seasonLabel, seasonBounds } from '../../data/providers/seasonWindows.js';
import { oddsProfile } from '../../data/db/oddsProfileRead.js';
import { expectedPointsTable } from '../../data/db/expectedPoints.js';
import { buildMatchPreview } from '../../data/providers/lineupContext.js';
import { ageAt, birthdatesOf, infosOf, ensurePlayerBirthdate, ensureSquadBirthdates, ensureSquadsBirthdates, ensurePlayersInfo } from '../../data/db/playerBirthdates.js';
import { resolveTeamIds } from '../../data/db/teamIdResolver.js';
import { lireCarnet } from '../../data/repositories/dataHealthRepository.js';
import { TYPES, GRAVITES, DONNEES, SEUILS, SORTES } from '../../data/db/dataHealth.js';
import { lireEtatImport, lireResume, listeDesFichiers, REQUETES_PAR_PASSE } from '../../data/providers/footballDataHistory.js';
import { lireReperes } from '../../data/db/leagueBenchmarks.js';
import { etatTableJourJ } from '../../data/db/dayTable.js';
import { etatIndiceDeForce, lireIndiceDeForce, LIEUX } from '../../data/db/teamStrength.js';
import { etatDesFiches, lireLesFiches } from '../../data/db/playerRatings.js';
import { lireLeStyleDuClub, lireLeDuelDeStyles } from '../../data/db/teamStyle.js';
import { resolveDbPath, openDb } from '../../data/db/matchStatsDb.js';
import { ApiError, requireStringParam, optionalPositiveInt, optionalStringParam } from '../middlewares/errorHandler.js';

/**
 * Profilage de cotes d'un match à venir : les matchs passés dont les cotes
 * ressemblaient aux siennes, et comment ils ont fini (oddsProfileRead.js).
 * Les cotes du jour viennent de l'appelant, qui les tient de The Odds API.
 */
export function getOddsProfile(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const cote = (valeur, nom, requise) => {
    if (valeur === undefined || valeur === '') {
      if (requise) throw new ApiError(400, `Le paramètre "${nom}" est requis (cote décimale).`);
      return null;
    }
    const n = Number(valeur);
    if (!Number.isFinite(n) || n <= 1) throw new ApiError(400, `Le paramètre "${nom}" doit être une cote décimale supérieure à 1.`);
    return n;
  };
  const odds = {
    home: cote(req.query.odds1, 'odds1', true),
    draw: cote(req.query.oddsDraw, 'oddsDraw', false),
    away: cote(req.query.odds2, 'odds2', true)
  };
  const tolerance = req.query.tolerance === undefined ? 13 : Number(req.query.tolerance);
  res.json(
    oddsProfile({
      league,
      home: req.query.home ?? null,
      away: req.query.away ?? null,
      kickoff: req.query.kickoff ?? null,
      odds,
      scope: req.query.scope,
      segment: req.query.segment,
      tolerance
    })
  );
}

/** Matchs d'une équipe avec stats d'équipe complètes + stats joueurs, match par match (import quotidien 7h30). */
export function getTeamMatchStats(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const limit = optionalPositiveInt(req.query.limit, 'limit');
  // La compétition, quand l'interface la connaît, désigne le bon club parmi les homonymes.
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;

  const matches = listTeamMatchStats(name, { limit, league });
  res.json({ teamName: name, count: matches.length, matches });
}

/** Moyennes des stats d'équipe sur les N derniers matchs importés (saison en cours). */
export function getTeamMatchStatsAverages(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const sampleSize = optionalPositiveInt(req.query.sampleSize, 'sampleSize');
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;

  const stats = getTeamWebAverages(name, sampleSize, { league });
  if (!stats) throw new ApiError(404, `Aucune statistique importée pour "${name}".`);
  res.json({ teamId: null, teamName: stats.teamName, stats });
}

/**
 * Statistiques d'un championnat (onglet « Statistiques ligue », 03/10/2026 :
 * « il faut rechercher les statistiques avec FotMob »). Les équipes du
 * classement, chacune avec ses moyennes sur ses matchs de CE championnat,
 * lues dans le magasin (FotMob) : un seul appel, gratuit, au lieu d'un appel
 * par équipe et d'un repli payant.
 * `periode` : 'saison' (défaut, la saison du classement) ou un nombre N
 * (les N derniers matchs de championnat de chaque équipe, sur trois ans au plus).
 */
export async function getLeagueAverages(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const brute = typeof req.query.periode === 'string' ? req.query.periode.trim() : 'saison';
  const periode = brute === '' || brute === 'saison' ? 'saison' : optionalPositiveInt(brute, 'periode');

  const classement = await getStandingsByLeagueLabel(league);
  const lignes = classement?.rows ?? [];
  if (!lignes.length) throw new ApiError(404, `Aucun classement en magasin pour « ${league} » : pas d'équipes à moyenner.`);

  const saison = classement.season ?? null;
  const [from, to] = periode === 'saison' && saison != null ? seasonBounds(league, saison) : [null, null];
  const { teams, missing } = getLeagueTeamAverages(
    league,
    lignes.map((r) => ({ teamName: r.teamName, teamId: r.teamId ?? null })),
    { limit: periode === 'saison' ? null : periode, from, to }
  );
  res.json({
    league,
    season: saison,
    seasonLabel: classement.seasonLabel ?? (saison != null ? seasonLabel(league, saison) : null),
    period: periode,
    source: 'FotMob',
    teams,
    missing
  });
}

/**
 * Page d'un match à venir : coup d'envoi exact, cadre (stade, météo, arbitre)
 * et composition décrite, tels que FotMob les publie (cf. lineupContext.js).
 * Gratuit : jamais de repli payant, contrairement à /team-stats/lineups-by-name.
 */
export async function getMatchPreview(req, res) {
  const homeName = requireStringParam(req.query.home, 'home');
  const commenceTimeIso = requireStringParam(req.query.commenceTime, 'commenceTime');
  const awayName = typeof req.query.away === 'string' ? req.query.away : null;
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;
  res.json(await buildMatchPreview({ homeName, awayName, commenceTimeIso, league }));
}

/**
 * Identifiants FotMob de clubs donnés par leur nom et leur compétition :
 * leurs logos dans toutes les listes de rencontres de l'interface
 * (01/10/2026). Corps : { teams: [{ name, league }] }.
 */
export function postTeamIds(req, res) {
  const teams = Array.isArray(req.body?.teams) ? req.body.teams : null;
  if (!teams) throw new ApiError(400, 'Le corps doit contenir « teams » : [{ name, league }].');
  res.json({ results: resolveTeamIds(teams) });
}

export function getMatchStats(req, res) {
  const entry = getMatchStatsById(req.params.matchId);
  if (!entry) throw new ApiError(404, `Statistiques introuvables pour le match ${req.params.matchId}.`);
  res.json(entry);
}

export function getMatchStatsInfo(req, res) {
  res.json(getMatchStatsStatus());
}

/**
 * Classement des joueurs d'une compétition, agrégé par la base.
 *
 * Distinct de `/team-stats/players-by-name`, qui interroge API-Football :
 * celui-ci lit le magasin local (FotMob/ESPN), donc il couvre la saison en
 * cours et les championnats hors plan gratuit.
 */
/** Délai au-delà duquel le classement s'affiche sans attendre les effectifs encore en lecture. */
const ATTENTE_AGES_MS = 8000;

export async function getPlayerStats(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');
  const team = req.query.team === undefined || req.query.team === '' ? null : requireStringParam(req.query.team, 'team');
  const minMinutes = optionalPositiveInt(req.query.minMinutes, 'minMinutes');
  const limit = optionalPositiveInt(req.query.limit, 'limit');
  const ROLES = ['field', 'goalkeeper', 'defender', 'midfielder', 'forward'];
  const role = ROLES.includes(req.query.role) ? req.query.role : 'field';

  const players = playerSeasonStats({
    league,
    season: season ?? null,
    team,
    role,
    ...(minMinutes === undefined ? {} : { minMinutes }),
    ...(limit === undefined ? {} : { limit })
  });
  // Âges (01/10/2026) : les effectifs des clubs du classement, lus chez
  // FotMob au plus une fois par semaine ; au-delà de quelques secondes, le
  // classement part sans attendre et la lecture se termine pour la fois suivante.
  const lecture = ensureSquadsBirthdates(players.map((p) => p.teamId)).catch(() => {});
  await Promise.race([lecture, new Promise((resolve) => setTimeout(resolve, ATTENTE_AGES_MS))]);
  const infos = infosOf(players.map((p) => p.playerId));
  const avecAge = players.map((p) => {
    const info = infos.get(p.playerId);
    return { ...p, age: ageAt(info?.birthDate), countryCode: info?.countryCode ?? null, countryName: info?.countryName ?? null };
  });
  // Le libellé de saison dépend de la compétition — « 2025 » pour un
  // championnat d'année civile, « 2025-26 » ailleurs — et c'est au serveur
  // de le dire : l'interface ne sait pas quel championnat est lequel.
  res.json({ league, season: season ?? null, seasonLabel: season ? seasonLabel(league, season) : null, team, role, count: avecAge.length, players: avecAge });
}

/**
 * Fiche d'un joueur (page /joueur/:id de l'interface) : saison toutes
 * compétitions, par compétition et match par match. Identifiant FotMob
 * seulement — c'est celui que portent les compositions et les classements.
 */
export async function getPlayerProfile(req, res) {
  const playerId = requireStringParam(req.params.playerId, 'playerId');
  if (!/^fotmob-\d+$/.test(playerId)) throw new ApiError(400, `Identifiant de joueur inattendu : ${playerId}`);
  const season = optionalPositiveInt(req.query.season, 'season');
  const profile = playerProfile(playerId, { season: season ?? null });
  if (!profile) throw new ApiError(404, `Joueur introuvable dans le magasin : ${playerId}`);
  // Âge (01/10/2026) : l'effectif de son club d'abord — une lecture sert à
  // tous ses coéquipiers —, sa propre page FotMob à défaut.
  await ensureSquadBirthdates(profile.teamId);
  const birthDate = birthdatesOf([playerId]).get(playerId) ?? (await ensurePlayerBirthdate(playerId));
  // Nationalité : l'effectif de son club, sinon sa page (lue ci-dessus si besoin).
  let info = infosOf([playerId]).get(playerId) ?? null;
  if (!info?.countryCode) {
    await ensurePlayerBirthdate(playerId);
    info = infosOf([playerId]).get(playerId) ?? info;
  }
  res.json({ ...profile, birthDate: birthDate ?? null, age: ageAt(birthDate), countryCode: info?.countryCode ?? null, countryName: info?.countryName ?? null });
}

/**
 * Buteurs, passeurs et clean sheets d'une compétition, en un seul appel.
 *
 * Les trois listes voyagent ensemble parce qu'elles s'affichent ensemble —
 * trois onglets d'un même panneau. Les séparer imposerait trois
 * aller-retours pour un écran que l'utilisateur parcourt d'un coup d'œil.
 */
export async function getLeagueLeaders(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');
  const limit = optionalPositiveInt(req.query.limit, 'limit');

  const leaders = leagueLeaders(league, {
    season: season ?? null,
    ...(limit === undefined ? {} : { limit })
  });
  // Nationalité et âge de chacun (01/10/2026) : les effectifs de leurs clubs,
  // quelques secondes au plus, la lecture finit pour la fois suivante.
  const listes = Object.entries(leaders).filter(([, v]) => Array.isArray(v));
  const joueurs = listes.flatMap(([, v]) => v);
  const lecture = ensureSquadsBirthdates(joueurs.map((p) => p.teamId)).catch(() => {});
  await Promise.race([lecture, new Promise((resolve) => setTimeout(resolve, ATTENTE_AGES_MS))]);
  const infos = infosOf(joueurs.map((p) => p.playerId));
  const avecPays = (p) => {
    const info = infos.get(p.playerId);
    return { ...p, age: ageAt(info?.birthDate), countryCode: info?.countryCode ?? null, countryName: info?.countryName ?? null };
  };
  res.json({ ...leaders, ...Object.fromEntries(listes.map(([cle, v]) => [cle, v.map(avecPays)])) });
}

/**
 * Âge et nationalité de joueurs quelconques (page d'un match joué, listes de
 * l'interface) : { ids: ['fotmob-<n>', …] } -> { players: { id: { age,
 * birthDate, countryCode, countryName } } }. Les effectifs de leurs clubs
 * sont lus chez FotMob si besoin (gratuit), quelques secondes au plus.
 */
export async function postPlayersInfo(req, res) {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
  if (!ids) throw new ApiError(400, 'Le corps doit contenir « ids » : [identifiants de joueurs].');
  const infos = await ensurePlayersInfo(ids);
  res.json({ players: Object.fromEntries(infos) });
}

/**
 * Coupes rattachées à un championnat, avec ce que le magasin en connaît.
 *
 * Ne rend que celles qui ont effectivement des rencontres : une coupe
 * déclarée mais jamais importée donnerait un onglet vide, et l'utilisateur
 * n'a aucun moyen de deviner que c'est l'import qui manque.
 */
export function getLeagueCups(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const cups = cupsForLeague(league)
    .map((name) => ({ name, seasons: seasonsForLeague(name) }))
    .filter((cup) => cup.seasons.length > 0);
  res.json({ league, count: cups.length, cups });
}

/** Le tableau d'une coupe : ses rencontres groupées par tour. */
export function getCupBracket(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');

  const bracket = cupBracket(league, { season: season ?? null });
  if (!bracket) throw new ApiError(404, `Aucune rencontre en magasin pour "${league}".`);
  res.json(bracket);
}

/** Saisons disponibles pour une compétition, la plus récente d'abord. */
/**
 * Le classement corrigé par les xG d'une compétition (cf. expectedPoints.js).
 * `season` : année de début de saison ; absente, la plus récente du magasin.
 */
export function getXgTable(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  const season = optionalPositiveInt(req.query.season, 'season');
  const table = expectedPointsTable(league, { season: season ?? null });
  if (!table) throw new ApiError(404, `Aucun match joué au magasin pour "${league}"${season ? ` en ${seasonLabel(league, season)}` : ''}.`);
  res.json(table);
}

export function getLeagueSeasons(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  res.json({ league, seasons: seasonsForLeague(league) });
}

/** Couverture des statistiques, championnat par championnat. */
export function getMatchStatsCoverage(req, res) {
  // « Dernier passage » : la dernière passe de l'actualisation complète
  // (refresh-status.json), et non plus le témoin figé de l'ancien
  // rafraîchissement ESPN.
  const etat = readRefreshStatus();
  res.json({ ...getCoverage(), refresh: { running: isRefreshRunning(), last: etat.history?.[0] ?? null } });
}

/**
 * Carnet de santé des données (étape 12 du plan, 06/10/2026) : LIT l'état
 * préparé par le contrôle (scripts/data-health.mjs ; étape « carnetSante » de
 * l'actualisation, chaque nuit), ne recalcule rien et n'écrit rien. Le carnet
 * (une ligne par championnat et saison) est rendu en entier ; les anomalies
 * se filtrent par `type`, `gravite`, `ligue`, `saison`, et se limitent par
 * `limite` (300 par défaut, 5 000 au plus). Jamais contrôlé ou fichier
 * illisible : la même forme, vide, avec `etat` qui le dit — l'écran garde
 * son tableau.
 */
const LIMITE_ANOMALIES = 300;
const LIMITE_ANOMALIES_MAX = 5000;
export function getMatchStatsHealth(req, res) {
  const type = optionalStringParam(req.query.type, 'type');
  const gravite = optionalStringParam(req.query.gravite, 'gravite');
  const ligue = optionalStringParam(req.query.ligue, 'ligue');
  const saison = optionalStringParam(req.query.saison, 'saison');
  const limite = Math.min(LIMITE_ANOMALIES_MAX, optionalPositiveInt(req.query.limite, 'limite') ?? LIMITE_ANOMALIES);
  if (type && !TYPES.some((t) => t.cle === type)) throw new ApiError(400, `Type d'anomalie inconnu : « ${type} » (attendu : ${TYPES.map((t) => t.cle).join(', ')}).`);
  if (gravite && !GRAVITES.some((g) => g.cle === gravite)) throw new ApiError(400, `Gravité inconnue : « ${gravite} » (attendu : ${GRAVITES.map((g) => g.cle).join(', ')}).`);
  const reference = { types: TYPES, gravites: GRAVITES, sortes: SORTES, donnees: DONNEES, seuils: SEUILS, generatedAt: new Date().toISOString() };
  const lu = lireCarnet();
  if (lu.etat !== 'pret') {
    return res.json({
      etat: lu.etat === 'absent' ? 'jamais' : 'illisible',
      erreur: lu.erreur ?? null,
      fichier: lu.fichier,
      ...reference,
      controle: null,
      complet: null,
      historique: [],
      recoupement: null,
      carnet: [],
      totaux: null,
      parType: null,
      anomaliesTotal: 0,
      anomaliesFiltrees: 0,
      limite,
      anomalies: []
    });
  }
  const c = lu.carnet;
  const filtrees = c.anomalies.filter(
    (a) => (!type || a.type === type) && (!gravite || a.gravite === gravite) && (!ligue || a.league === ligue) && (!saison || String(a.season) === saison)
  );
  res.json({
    etat: 'pret',
    fichier: lu.fichier,
    ecritLe: lu.modifieLe ?? null,
    base: c.base ?? null,
    ...reference,
    premiereDate: c.premiereDate ?? null,
    controle: c.controle,
    complet: c.complet ?? null,
    historique: c.historique ?? [],
    recoupement: c.recoupement ?? null,
    carnet: c.carnet,
    totaux: c.totaux,
    parType: c.parType,
    anomaliesTotal: c.anomalies.length,
    anomaliesFiltrees: filtrees.length,
    limite,
    // `portee` ne sert qu'au contrôle suivant : pas à l'écran.
    anomalies: filtrees.slice(0, limite).map(({ portee, ...a }) => a)
  });
}

/**
 * Historique football-data depuis 2000 (étape 13 du plan, 06/10/2026) : LIT
 * l'état de l'import et le résumé préparé à la fin de chaque passe
 * (footballDataHistory.js, étape « historiqueFd » de l'actualisation) ; ne
 * télécharge rien, ne recompte rien, n'écrit rien. Jamais importé : `etat`
 * « jamais », la même forme, vide — l'écran garde ses tableaux.
 */
export function getFdHistory(req, res) {
  const commun = { parPasse: REQUETES_PAR_PASSE, fichiersAttendus: listeDesFichiers().length, generatedAt: new Date().toISOString() };
  let etatImport;
  let resume;
  try {
    etatImport = lireEtatImport();
    resume = lireResume();
  } catch (error) {
    return res.json({ etat: 'illisible', erreur: error.message, import: null, resume: null, base: null, ...commun });
  }
  const jamais = !etatImport?.commenceLe && !resume;
  res.json({
    etat: jamais ? 'jamais' : etatImport.complet ? 'complet' : 'en-cours',
    import: jamais ? null : etatImport,
    resume: resume ?? null,
    base: resolveDbPath(),
    ...commun
  });
}

/**
 * Repères d'un championnat (étape 15 du plan, 07/10/2026 ; onglet
 * « Statistiques ligue », bloc « Repères du championnat ») : LIT la table
 * league_benchmarks que remplit chaque nuit l'étape « reperes » de
 * l'actualisation (leagueBenchmarks.js) — saison par saison avec la source
 * de chacune, toutes les saisons réunies et la valeur retenue, la moyenne des
 * championnats, la dispersion et le facteur de terrain mesurés. Ne calcule
 * rien, n'écrit rien. Jamais calculé, coupe, championnat inconnu : la même
 * forme, vide, avec `etat` et `raison` qui le disent — l'écran garde ses
 * tableaux.
 */
export function getLeagueBenchmarks(req, res) {
  const league = requireStringParam(req.query.league, 'league');
  res.json({ ...lireReperes(league), base: resolveDbPath(), generatedAt: new Date().toISOString() });
}

/**
 * La table du jour J (étape 17 du plan, 12/10/2026 ; carte « Table du jour J »
 * de Réglages) : LIT l'état noté à la fin de la dernière construction ou nuit
 * (dayTable.js, étape « tableJourJ » de l'actualisation) — comptes, dernier
 * jour, repères, dernier contrôle anti-fuite. Ne calcule rien, ne recompte
 * rien, n'écrit rien, pas même l'état. Jamais construite : `absente: true` et
 * la même forme, vide — l'écran garde ses quatre lignes. `dernierJourMagasin` :
 * le jour de la rencontre la plus récente du magasin (par l'index de la date),
 * pour dire quand la table est en retard sur lui.
 */
export function getDayTable(req, res) {
  const database = openDb();
  const dernierJourMagasin = database.prepare('SELECT MAX(date) d FROM matches').get()?.d ?? null;
  res.json({ ...etatTableJourJ({ database }), dernierJourMagasin, base: resolveDbPath(), generatedAt: new Date().toISOString() });
}

/**
 * L'indice de force des équipes (étape 29 du plan, 14/10/2026) : LIT la table team_strength que remplit
 * chaque nuit l'étape « indiceForce » de l'actualisation (teamStrength.js) — ne calcule rien, n'écrit rien.
 * `club` (identifiant FotMob, « fotmob-8456 » ou 8456) : ses lignes actuelles au total, à domicile et à
 * l'extérieur, ou celles d'avant `jour` (AAAA-MM-JJ) ; `historique=oui` : sa note dans le temps.
 * `league` : les clubs du championnat rangés par note (`lieu` : tous, dom, ext). Sans rien : l'état et la
 * liste des championnats. Jamais calculé : `etat: 'jamais'` et `lecture: null`, la même forme.
 * L'écran viendra à l'étape 31 ; les modèles (27, 30) lisent lireIndiceDeForce directement.
 */
export function getTeamStrength(req, res) {
  const club = optionalStringParam(req.query.club, 'club');
  const league = optionalStringParam(req.query.league, 'league');
  const lieu = optionalStringParam(req.query.lieu, 'lieu');
  const jour = optionalStringParam(req.query.jour, 'jour');
  const historique = req.query.historique === 'oui' || req.query.historique === 'true';
  if (club !== undefined && !/^(fotmob-)?[1-9]\d*$/.test(club)) throw new ApiError(400, `Le paramètre "club" doit être un identifiant FotMob (« fotmob-8456 » ou 8456), reçu « ${club} ».`);
  if (lieu !== undefined && !LIEUX.includes(lieu)) throw new ApiError(400, `Le paramètre "lieu" doit valoir ${LIEUX.join(', ')}.`);
  if (jour !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(jour)) throw new ApiError(400, 'Le paramètre "jour" doit être un jour AAAA-MM-JJ.');
  const database = openDb();
  const etat = etatIndiceDeForce({ database });
  const b = etat.bilan;
  const banc = etat.banc;
  const commun = {
    etat: etat.absent ? 'jamais' : etat.aJour ? 'a-jour' : 'pas-a-jour',
    version: etat.version,
    versionAttendue: etat.versionAttendue,
    calculeLe: etat.calculeLe,
    jusquA: etat.jusquA,
    enCours: etat.enCours,
    bilan: b ? { complet: b.complet ?? null, portee: b.portee ?? null, ecrites: b.ecrites ?? null, retirees: b.retirees ?? null, utilisees: b.utilisees ?? null, ecartees: b.ecartees ?? null, nonConvergees: b.nonConvergees ?? null, dureeMs: b.dureeMs ?? null } : null,
    banc: banc ? { le: banc.le ?? null, reponse: banc.reponse ?? null, jugements: (banc.jugements ?? []).map((j) => ({ id: j.id, periode: j.periode, preuve: j.preuve, matchs: j.n, gainPourcent: j.gainPourcent, fourchettePourcent: j.fourchettePourcent, verdict: j.verdict })) } : null,
    base: resolveDbPath(),
    generatedAt: new Date().toISOString()
  };
  if (etat.absent) return res.json({ ...commun, lecture: null });
  let lecture;
  try {
    lecture = lireIndiceDeForce({ database, club: club ?? null, league: league ?? null, lieu: lieu ?? null, jour: jour ?? null, historique });
  } catch (error) {
    throw new ApiError(400, error.message);
  }
  res.json({ ...commun, lecture });
}

/**
 * Le style de jeu d'un club (étape 37 du plan, 22/10/2026) : LIT les tables que remplit chaque nuit l'étape
 * « stylesDeJeu » de l'actualisation (teamStyle.js) — ne calcule rien, n'écrit rien. `club` (identifiant FotMob,
 * « fotmob-123 » ou 123) : son style actuel et les chiffres qui le justifient (et ceux de son championnat), ses 13
 * derniers mois, son entraîneur et le style de l'entraîneur. Jamais calculé : la même forme, `style: null`.
 * EXPLICATION SEULEMENT : le moteur ne lit pas les styles.
 */
export function getTeamStyle(req, res) {
  const club = requireStringParam(req.query.club, 'club');
  if (!/^(fotmob-)?[1-9]\d*$/.test(club)) throw new ApiError(400, `Le paramètre "club" doit être un identifiant FotMob (« fotmob-123 » ou 123), reçu « ${club} ».`);
  const lecture = lireLeStyleDuClub(club, { database: openDb() });
  res.json({ ...lecture, base: resolveDbPath(), generatedAt: new Date().toISOString() });
}

/**
 * Le DUEL DE STYLES d'un match (étape 37) : le style actuel des deux clubs et ce que le banc en dit — « explication
 * seulement », ou l'effet mesuré si la case a passé le seuil sévère. Les clubs par leur identifiant FotMob (`home`,
 * `away`), ou par leur nom (`homeName`, `awayName`, `league`) reconnu dans l'annuaire du magasin (jamais le
 * rapprocheur souple). LIT seulement.
 */
export function getStyleDuel(req, res) {
  const database = openDb();
  const ids = {};
  for (const camp of ['home', 'away']) {
    const id = optionalStringParam(req.query[camp], camp);
    const nom = optionalStringParam(req.query[`${camp}Name`], `${camp}Name`);
    if (id !== undefined) {
      if (!/^(fotmob-)?[1-9]\d*$/.test(id)) throw new ApiError(400, `Le paramètre "${camp}" doit être un identifiant FotMob (« fotmob-123 » ou 123), reçu « ${id} ».`);
      ids[camp] = id;
    } else if (nom !== undefined) {
      const league = optionalStringParam(req.query.league, 'league') ?? null;
      ids[camp] = resolveTeamIds([{ name: nom, league }], { database })[0]?.teamId ?? null;
      if (!ids[camp]) throw new ApiError(404, `Club inconnu du magasin : « ${nom} »${league ? ` (${league})` : ''}.`);
    } else {
      throw new ApiError(400, `Le paramètre "${camp}" (identifiant FotMob) ou "${camp}Name" (nom du club) est obligatoire.`);
    }
  }
  const lecture = lireLeDuelDeStyles(ids.home, ids.away, { database });
  const enId = (x) => (/^\d+$/.test(String(x)) ? `fotmob-${x}` : String(x));
  res.json({ ...lecture, homeId: enId(ids.home), awayId: enId(ids.away), base: resolveDbPath(), generatedAt: new Date().toISOString() });
}

/**
 * Les fiches des joueurs par poste (étape 30 du plan, 22/10/2026) : LIT les tables que remplit chaque nuit l'étape
 * « fichesJoueurs » de l'actualisation (playerRatings.js) — ne calcule rien, n'écrit rien. `player` (identifiant
 * FotMob, « fotmob-123 » ou 123) : sa fiche ; `club` : les fiches de son effectif et son équipe habituelle ;
 * `league` (+ `poste` 1-4) : les fiches établies du championnat, de la meilleure attaque à la moins bonne. Sans rien :
 * l'état. Jamais calculé : `etat: 'jamais'` et `lecture: null`, la même forme. AFFICHAGE SEULEMENT : le moteur ne lit
 * pas les fiches (règle de Pierre) ; l'écran viendra à l'étape 31.
 */
export function getPlayerRatings(req, res) {
  const player = optionalStringParam(req.query.player, 'player');
  const club = optionalStringParam(req.query.club, 'club');
  const league = optionalStringParam(req.query.league, 'league');
  const poste = optionalStringParam(req.query.poste, 'poste');
  for (const [nom, v] of [['player', player], ['club', club]]) {
    if (v !== undefined && !/^(fotmob-)?[1-9]\d*$/.test(v)) throw new ApiError(400, `Le paramètre "${nom}" doit être un identifiant FotMob (« fotmob-123 » ou 123), reçu « ${v} ».`);
  }
  if (poste !== undefined && !/^[1-4]$/.test(poste)) throw new ApiError(400, 'Le paramètre "poste" doit valoir 1 (gardien), 2 (défenseur), 3 (milieu) ou 4 (attaquant).');
  const database = openDb();
  const etat = etatDesFiches({ database });
  const b = etat.bilan;
  const commun = {
    etat: etat.absent ? 'jamais' : etat.aJour ? 'a-jour' : 'pas-a-jour',
    version: etat.version,
    versionAttendue: etat.versionAttendue,
    calculeLe: etat.calculeLe,
    jusqua: etat.jusqua,
    enCours: etat.enCours,
    bilan: b ? { joueurs: b.joueurs ?? null, etablies: b.etablies ?? null, clubs: b.clubs ?? null, ecrites: b.ecrites ?? null, retirees: b.retirees ?? null, dureeMs: b.dureeMs ?? null } : null,
    controle: etat.controle ? { lignes: etat.controle.lignes ?? null, ecarts: etat.controle.ecarts?.length ?? 0, le: etat.controle.le ?? null } : null,
    mesure: etat.mesure ?? null,
    banc: etat.banc ? { le: etat.banc.le ?? null, jugements: etat.banc.jugements ?? null, fiches: etat.banc.fiches ?? null, verification: etat.banc.verification ?? null } : null,
    regle: 'Affichage seulement : les fiches et la force du onze n’entrent jamais dans les chiffres du moteur.',
    base: resolveDbPath(),
    generatedAt: new Date().toISOString()
  };
  if (etat.absent) return res.json({ ...commun, lecture: null });
  let lecture;
  try {
    lecture = lireLesFiches({ database, joueur: player ?? null, club: club ?? null, league: league ?? null, poste: poste ?? null });
  } catch (error) {
    throw new ApiError(400, error.message);
  }
  if (player !== undefined && !lecture.fiche) throw new ApiError(404, `Aucune fiche pour le joueur « ${player} ».`);
  res.json({ ...commun, lecture });
}

/**
 * Relance le rafraîchissement sans attendre la prochaine passe automatique.
 *
 * Répond tout de suite : une passe complète dure plusieurs minutes, on ne
 * laisse pas la requête HTTP ouverte pendant ce temps. L'avancement se suit
 * sur GET /api/match-stats/coverage.
 */
export function postMatchStatsRefresh(req, res) {
  // Même passe que POST /api/refresh ; le verrou est lu entre processus.
  const alreadyRunning = isRefreshRunning();
  if (!alreadyRunning) {
    refreshNow().catch((error) => {
      console.error(`[stats] rafraîchissement manuel en échec : ${error.message}`);
    });
  }
  res.status(202).json({ started: !alreadyRunning, alreadyRunning });
}
