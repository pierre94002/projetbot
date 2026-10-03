import { callClaudeCode, isClaudeCodeAuthenticated, ClaudeCodeIndisponible } from './claudeCodeClient.js';
import { buildPreMatchAnalysisRequest, buildPostMatchReviewRequest, SUBMIT_PRE_MATCH_ANALYSIS_TOOL, SUBMIT_POST_MATCH_REVIEW_TOOL } from './matchAiAnalysisPrompt.js';
import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { resolveAverageStatsByName, resolveTeamFormByName } from '../../data/providers/matchEnrichment.js';
import { DEFAULT_FORM_SAMPLE_SIZE } from '../../data/providers/teamStatsService.js';
import { resolveFlashscoreStatsByName } from '../../data/providers/flashscoreEnrichment.js';
import { resolveHistoricalStatsByName, resolveHistoricalFormByName, resolveHistoricalStandingRow } from '../../data/providers/historicalMatchesProvider.js';
import { getTeamProfile } from '../../data/repositories/teamProfileRepository.js';
import { getMatchNote } from '../../data/repositories/matchNotesRepository.js';
import { resolveTeamNews } from '../../data/providers/teamNewsResolver.js';
import { getByMatchId, savePreMatchAnalysis, savePostMatchReview, aiMarketExperience } from '../../data/repositories/matchAiAnalysisRepository.js';
import { createResultLookup } from '../../data/repositories/matchResultsRepository.js';
import { listPredictions } from '../../data/repositories/predictionsRepository.js';
import { matchDetailsFromStore } from '../../data/db/matchStatsRead.js';
import { deriveActualOutcome } from '../settlement/settlementRules.js';
import { resolveCurrentSeason } from '../../data/providers/leagueRegistry.js';
import { findBestTeamNameMatch } from '../../utils/teamNameMatch.js';
import { enregistrerSansPerdre } from '../../utils/atomicJson.js';
import { listTeamMatchStats } from '../../data/repositories/matchStatsWebRepository.js';
import { compositionPourAnalyseIA } from '../../data/providers/lineupContext.js';
import { DomainError } from '../errors.js';

// Même sous-ensemble ciblé que l'audit par lot (aiDatasetBuilder.js), pour
// limiter la taille du prompt — pas les 34 champs, seulement les plus
// parlants pour situer une équipe (attaque, possession, xG, corners).
const CURATED_STAT_FIELDS = ['Shots on Goal', 'Total Shots', 'Ball Possession', 'expected_goals', 'Corner Kicks'];

function pickCuratedStats(averages) {
  if (!averages) return null;
  const picked = {};
  for (const field of CURATED_STAT_FIELDS) if (averages[field] !== undefined) picked[field] = averages[field];
  return Object.keys(picked).length ? picked : null;
}

// Les libellés The Odds API ("Tottenham Hotspur", "Paris Saint Germain")
// diffèrent souvent des classements web ("Tottenham", "PSG") : même
// résolution floue que les autres sources, égalité exacte d'abord.
function findStandingRow(standings, teamName) {
  return findBestTeamNameMatch(teamName, standings?.rows ?? [], (row) => row.teamName);
}

// La forme : celle du magasin (FotMob, saison en cours) avec chaque match
// — date, adversaire, lieu, score —, la référence ; celle d'API-Football
// (repli d'un clic, jamais en automatique) porte la saison du plan (2024),
// et l'IA, voyant des dates de 2026 sous « 2024 », les croyait incohérentes.
function describeForm(form) {
  if (!form) return null;
  if (form.source === 'store') {
    return {
      source: 'FotMob (magasin)',
      matches: form.form.matches.map((m) => ({
        date: typeof m.date === 'string' ? m.date.slice(0, 10) : null,
        opponent: m.opponent,
        venue: m.home ? 'domicile' : 'extérieur',
        score: m.score,
        result: m.result
      })),
      sampleSize: form.form.sampleSize
    };
  }
  return {
    source: 'API-Football',
    season: resolveCurrentSeason(),
    results: form.form.matches.map((m) => m.result),
    dates: form.form.matches.map((m) => (typeof m.date === 'string' ? m.date.slice(0, 10) : null)),
    sampleSize: form.form.sampleSize
  };
}

// Statistiques d'équipe lues par l'IA (01/10/2026, Pierre : « il faut que
// l'IA analyse les formes des équipes, les statistiques et les moyennes ») :
// ce que l'équipe produit ET ce qu'elle concède, par match.
const STATS_POUR_IA = [
  ['expected_goals', 'xg', 2],
  ['Total Shots', 'shots', 1],
  ['Shots on Goal', 'shotsOnTarget', 1],
  ['big_chances', 'bigChances', 1],
  ['Corner Kicks', 'corners', 1],
  ['Ball Possession', 'possession', 1],
  ['Yellow Cards', 'yellowCards', 1]
];

const nombreStat = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Les moyennes d'une équipe sur ses 10 derniers matchs du magasin (FotMob,
 * toutes compétitions), puis sur ceux joués au lieu de CE match (à domicile
 * pour l'équipe qui reçoit, à l'extérieur pour l'autre) : buts marqués et
 * encaissés, puis, pour l'équipe (`for`) et ses adversaires (`against`),
 * xG, tirs, tirs cadrés, grosses occasions, corners, possession, cartons.
 * Une statistique à zéro pour les deux équipes d'un match n'a pas été
 * relevée : elle ne compte pas. `null` si le magasin ne connaît pas l'équipe.
 */
function moyennesPourIA(teamName, league, venue) {
  let matchs;
  try {
    matchs = listTeamMatchStats(teamName, { limit: 10, league }).filter((m) => m.score);
  } catch {
    return null;
  }
  if (!matchs.length) return null;
  const moyenne = (valeurs, decimales) => {
    const ok = valeurs.filter((v) => v !== null);
    return ok.length ? Number((ok.reduce((s, v) => s + v, 0) / ok.length).toFixed(decimales)) : null;
  };
  const camp = (liste, i) =>
    Object.fromEntries(
      STATS_POUR_IA.map(([cle, nom, decimales]) => {
        const valeurs = liste.map((m) => {
          const a = nombreStat(m.teams[0]?.stats?.[cle]);
          const b = nombreStat(m.teams[1]?.stats?.[cle]);
          if (a === null || b === null || (a === 0 && b === 0)) return null;
          return i === 0 ? a : b;
        });
        return [nom, moyenne(valeurs, decimales)];
      }).filter(([, v]) => v !== null)
    );
  const bloc = (liste) => {
    if (!liste.length) return null;
    const buts = (m, i) => Number(String(m.score).split('-')[i]);
    return {
      matches: liste.length,
      results: liste.map((m) => m.result).join(''),
      goalsFor: moyenne(liste.map((m) => buts(m, 0)), 2),
      goalsAgainst: moyenne(liste.map((m) => buts(m, 1)), 2),
      for: camp(liste, 0),
      against: camp(liste, 1)
    };
  };
  const auLieu = matchs.filter((m) => m.home === (venue === 'home'));
  return {
    source: 'FotMob (magasin)',
    from: matchs.at(-1).date,
    to: matchs[0].date,
    last10: bloc(matchs),
    [venue === 'home' ? 'atHome' : 'away']: bloc(auLieu)
  };
}

// Filet de sécurité : de rares réponses laissent fuiter des fragments de
// balises façon ancien format de function-calling texte (ex. "</caveats>
// </invoke>") au lieu de s'en tenir uniquement au JSON de l'outil natif —
// retiré ici plutôt que d'afficher ce bruit tel quel dans l'UI. Un texte de
// match légitime ne contient jamais de séquence "<...>" , donc aucun risque
// de retirer du contenu valide.
function stripLeakedTags(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/<\/?[a-zA-Z_][\w:-]*(?:\s+[^<>]*)?>/g, '').trim();
}

function sanitizeToolInput(input) {
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      sanitized[key] = stripLeakedTags(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item && typeof item === 'object'
          ? Object.fromEntries(Object.entries(item).map(([k, v]) => [k, stripLeakedTags(v)]))
          : stripLeakedTags(item)
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function curateEngineSummary(engineResult) {
  return {
    label: engineResult.label ?? null,
    expectedGoals: engineResult.expectedGoals ?? null,
    trueOdds: { home: engineResult.trueOdds?.home, draw: engineResult.trueOdds?.draw, away: engineResult.trueOdds?.away },
    market: { odds1: engineResult.market?.odds1, oddsDraw: engineResult.market?.oddsDraw, odds2: engineResult.market?.odds2 },
    edgePercent: engineResult.edgePercent ?? null,
    staking: engineResult.staking ?? null,
    // Corners, tirs et tirs cadrés attendus de chaque équipe (cf. sports/football/statMarkets.js).
    statExpectations: engineResult.statExpectations ?? null,
    // Le pronostic du moteur sur CHAQUE marché joué (cf. sports/football/markets.js) :
    // l'IA donne un avis sur chacun, et la revue après-match les reprend.
    marketPredictions: (engineResult.marketPredictions ?? []).map(({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds, minOdds }) => ({
      marketId,
      params,
      market,
      predictedOutcome,
      predictedLabel,
      predictedOdds,
      // Le pourcentage affiché à côté du pronostic (1 / cote juste), que
      // l'IA explique en une phrase (demande de Pierre le 01/10/2026).
      probability: Number(predictedOdds) > 1 ? Math.round(100 / Number(predictedOdds)) : null,
      minOdds: minOdds ?? null
    }))
  };
}

/** Libellé de marché comparable : l'IA recopie parfois « Buts — X » avec un autre tiret ou sans accent. */
const cleMarche = (libelle) =>
  String(libelle ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‐-―-]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * Chaque élément écrit par l'IA (avis ou bilan) rattaché au marché du moteur
 * qu'il commente : par libellé, à défaut par position (le schéma exige le
 * même ordre) quand l'IA en a rendu autant.
 */
function rattacherAuxMarches(ecrits = [], marches = []) {
  const parCle = new Map(ecrits.map((e) => [cleMarche(e.market), e]));
  return marches.map((m, i) => parCle.get(cleMarche(m.market)) ?? (ecrits.length === marches.length ? ecrits[i] : null));
}

/**
 * Pronostics du moteur sur chaque marché pour une analyse enregistrée : ceux
 * figés avec elle, ou, pour une analyse antérieure à ce figeage, ceux du
 * journal des pronostics sous le même identifiant de match.
 */
function pronosticsDeMarches(prior) {
  const figes = prior.engineSnapshot?.marketPredictions;
  if (Array.isArray(figes) && figes.length) return figes;
  try {
    return listPredictions()
      .filter((p) => p.matchId === prior.matchId)
      .map(({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds }) => ({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds }));
  } catch {
    return [];
  }
}

/**
 * Issue réelle de chaque marché (mêmes règles que le règlement des
 * pronostics) et, si l'IA avait donné un avis avant le match, s'il a tenu :
 * confirmer un pronostic juste ou contredire un pronostic faux, c'est avoir
 * eu raison. Calculé ici, jamais laissé à l'IA : son expérience se compte
 * sur des faits.
 */
function issuesDesMarches(prior, pronostics, result, stats = null) {
  const avisParMarche = rattacherAuxMarches(prior.analysis?.marketViews ?? [], pronostics);
  return pronostics.map((p, i) => {
    const reel = deriveActualOutcome({ ...p, homeName: prior.homeName, awayName: prior.awayName }, result.homeGoals, result.awayGoals, stats);
    const juste = reel === null ? null : reel === p.predictedOutcome;
    const avis = avisParMarche[i];
    const aiWasRight = juste === null || !avis ? null : avis.verdict === 'confirme' ? juste : avis.verdict === 'contredit' ? !juste : null;
    return {
      market: p.market,
      marketId: p.marketId ?? null,
      pick: p.predictedLabel,
      // Plancher de cote sous lequel le pronostic a été choisi (absent avant la règle du 30/09/2026).
      minOdds: p.minOdds ?? null,
      outcome: juste === null ? 'indéterminé' : juste ? 'juste' : 'faux',
      aiVerdict: avis?.verdict ?? null,
      aiConfidence: avis?.confidence ?? null,
      aiWasRight
    };
  });
}

const STATS_CLES = ['expected_goals', 'Total Shots', 'Shots on Goal', 'big_chances', 'Ball Possession', 'Corner Kicks', 'Yellow Cards', 'Red Cards'];

/** Faits du match dans le magasin FotMob (buts et leurs minutes, cartons rouges, statistiques clés), pour expliquer chaque marché. */
function faitsDuMatch(homeName, date) {
  if (!date) return null;
  try {
    const d = matchDetailsFromStore(homeName, date);
    if (!d?.available) return null;
    const garder = (stats) => Object.fromEntries(STATS_CLES.filter((k) => stats?.[k] !== undefined && stats?.[k] !== null).map((k) => [k, stats[k]]));
    return {
      score: d.score,
      goals: (d.events ?? [])
        .filter((e) => e.type === 'goal')
        .map((e) => ({ minute: e.minute, side: e.side, player: e.player, ownGoal: Boolean(e.ownGoal), penalty: Boolean(e.penalty) })),
      redCards: (d.events ?? []).filter((e) => e.type === 'card' && e.card === 'red').map((e) => ({ minute: e.minute, side: e.side, player: e.player })),
      stats: { home: garder(d.stats?.home), away: garder(d.stats?.away) }
    };
  } catch {
    return null;
  }
}

/**
 * Les statistiques du match au format du règlement (cf. settlementRules.js),
 * pour juger les marchés de corners et de tirs. Un 0 des deux côtés veut dire
 * « non relevé » (cf. settlementService.js), jamais zéro.
 */
function statsPourReglement(faits) {
  if (!faits?.stats) return null;
  const lire = (s) => ({ corners: s?.['Corner Kicks'] ?? null, shots: s?.['Total Shots'] ?? null, shotsOnTarget: s?.['Shots on Goal'] ?? null });
  const home = lire(faits.stats.home);
  const away = lire(faits.stats.away);
  for (const k of Object.keys(home)) {
    if (Number(home[k]) === 0 && Number(away[k]) === 0) home[k] = away[k] = null;
  }
  return { home, away };
}

/**
 * Contexte qualitatif best-effort — chaque appel échoue indépendamment
 * (Promise.allSettled), même philosophie que enrichMatchWithRealAverages :
 * un classement absent (coupe) ou une équipe non résolue ne doit jamais faire
 * échouer toute l'analyse, juste réduire ce qui est disponible.
 */
async function gatherQualitativeContext(home, away, league, { matchId, commenceTime, sansRepliPayant = false } = {}) {
  const options = { sansRepliPayant };
  // Les moyennes du magasin (FotMob) d'abord ; API-Football seulement pour
  // une équipe qu'il ne connaît pas, et jamais en automatique.
  const homeMoyennes = moyennesPourIA(home, league, 'home');
  const awayMoyennes = moyennesPourIA(away, league, 'away');
  const [standingsR, homeStatsR, awayStatsR, homeFormR, awayFormR, teamNewsR] = await Promise.allSettled([
    getStandingsByLeagueLabel(league),
    homeMoyennes ? Promise.resolve(null) : resolveAverageStatsByName(home, league, undefined, options),
    awayMoyennes ? Promise.resolve(null) : resolveAverageStatsByName(away, league, undefined, options),
    resolveTeamFormByName(home, league, DEFAULT_FORM_SAMPLE_SIZE, options),
    resolveTeamFormByName(away, league, DEFAULT_FORM_SAMPLE_SIZE, options),
    // Blessures, suspensions, changement d'entraîneur (FotMob, gratuit) —
    // cf. teamNewsResolver.js. Rien à demander sans coup d'envoi connu.
    commenceTime ? resolveTeamNews({ homeName: home, awayName: away, commenceTimeIso: commenceTime, league }) : Promise.resolve(null)
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  const standings = val(standingsR);
  const homeStats = val(homeStatsR);
  const awayStats = val(awayStatsR);
  const homeForm = val(homeFormR);
  const awayForm = val(awayFormR);
  const teamNews = val(teamNewsR);

  // Note écrite par Pierre lui-même (vestiaire, rumeur, finances du club…) :
  // lecture fichier locale, pas un appel réseau, protégée comme les autres
  // sources secondaires ci-dessous.
  let userNote = null;
  try {
    const note = matchId ? getMatchNote(matchId) : null;
    if (note?.text) userNote = { text: note.text, updatedAt: note.updatedAt };
  } catch {
    // Notes absentes/corrompues : ignoré, le contexte reste utilisable sans.
  }

  const homeStatsPicked = pickCuratedStats(homeStats?.stats?.averages);
  const awayStatsPicked = pickCuratedStats(awayStats?.stats?.averages);

  // Instantané local (fichier), pas un appel réseau — pas besoin de
  // Promise.allSettled, mais protégé quand même par le même principe de
  // dégradation silencieuse que le reste de ce contexte : une équipe non
  // trouvée dans le dernier import FlashScore (cf. Réglages > Données) ne
  // doit jamais faire échouer l'analyse.
  let homeFlashscoreStats = null;
  let awayFlashscoreStats = null;
  try {
    homeFlashscoreStats = resolveFlashscoreStatsByName(home);
    awayFlashscoreStats = resolveFlashscoreStatsByName(away);
  } catch {
    // Snapshot corrompu ou absent : ignoré, le contexte reste utilisable sans.
  }

  // Historique local gratuit (football-data.co.uk, 16 grands championnats,
  // 5 saisons — cf. historicalMatchesProvider.js) : même lecture fichier,
  // même filet de sécurité que FlashScore ci-dessus. Le classement local ne
  // sert QUE de repli, équipe par équipe, quand la ligne live (web ou
  // API-Football) n'a pas été trouvée — jamais un remplacement d'une ligne
  // déjà obtenue en direct.
  let homeHistoricalStats = null;
  let awayHistoricalStats = null;
  let homeHistoricalForm = null;
  let awayHistoricalForm = null;
  let homeStandingRow = findStandingRow(standings, home);
  let awayStandingRow = findStandingRow(standings, away);
  try {
    homeHistoricalStats = resolveHistoricalStatsByName(home, league);
    awayHistoricalStats = resolveHistoricalStatsByName(away, league);
    homeHistoricalForm = resolveHistoricalFormByName(home, league);
    awayHistoricalForm = resolveHistoricalFormByName(away, league);
    homeStandingRow ??= resolveHistoricalStandingRow(home, league);
    awayStandingRow ??= resolveHistoricalStandingRow(away, league);
  } catch {
    // CSV historique absent/corrompu : ignoré, le contexte reste utilisable sans.
  }

  // Quatrième source, locale (team-profiles.json) — équipes des coupes
  // européennes (Ligue des champions/Europa/Conference), peuplée par la tâche
  // planifiée via recherche web (cf. teamProfileRepository.js) puisque ces
  // équipes viennent de ~55 championnats sans équivalent local. Même statut
  // que les deux autres sources secondaires ci-dessus.
  let homeTeamProfile = null;
  let awayTeamProfile = null;
  try {
    homeTeamProfile = getTeamProfile(home);
    awayTeamProfile = getTeamProfile(away);
  } catch {
    // Cache absent/corrompu : ignoré, le contexte reste utilisable sans.
  }

  // Les sources secondaires (FlashScore, historique football-data.co.uk,
  // profils web) ne servent plus qu'à une équipe que le magasin ne connaît
  // pas : plus anciennes, elles contredisaient la forme et les moyennes
  // actuelles et l'IA passait ses réserves à les départager (01/10/2026).
  const formeHome = homeForm?.source === 'store';
  const formeAway = awayForm?.source === 'store';
  const profil = (p) => (p ? { recentForm: p.recentForm, historicalAverages: p.historicalAverages, updatedAt: p.updatedAt } : null);
  return {
    standings: homeStandingRow || awayStandingRow ? { home: homeStandingRow, away: awayStandingRow } : null,
    homeStats: homeMoyennes ?? (homeStatsPicked ? { source: 'API-Football', stats: homeStatsPicked, sampleSize: homeStats.stats.sampleSize } : null),
    awayStats: awayMoyennes ?? (awayStatsPicked ? { source: 'API-Football', stats: awayStatsPicked, sampleSize: awayStats.stats.sampleSize } : null),
    homeForm: describeForm(homeForm),
    awayForm: describeForm(awayForm),
    // Source secondaire (FlashScore via Apify) — cf. flashscoreEnrichment.js :
    // peut dater de plusieurs jours (`collectedAt`).
    homeFlashscoreStats: homeMoyennes ? null : homeFlashscoreStats,
    awayFlashscoreStats: awayMoyennes ? null : awayFlashscoreStats,
    // Locale et gratuite (football-data.co.uk) — moyennes sur les 5 dernières saisons.
    homeHistoricalStats: homeMoyennes ? null : homeHistoricalStats,
    awayHistoricalStats: awayMoyennes ? null : awayHistoricalStats,
    homeHistoricalForm: !formeHome && homeHistoricalForm ? { results: homeHistoricalForm.results, sampleSize: homeHistoricalForm.sampleSize } : null,
    awayHistoricalForm: !formeAway && awayHistoricalForm ? { results: awayHistoricalForm.results, sampleSize: awayHistoricalForm.sampleSize } : null,
    // Locale (coupes européennes, cf. teamProfileRepository.js).
    homeTeamProfile: formeHome && homeMoyennes ? null : profil(homeTeamProfile),
    awayTeamProfile: formeAway && awayMoyennes ? null : profil(awayTeamProfile),
    // Cinquième source, gratuite (FotMob) — blessures/suspensions et
    // changement d'entraîneur déduit des compositions déjà vues.
    teamNews: teamNews && (teamNews.home || teamNews.away) ? teamNews : null,
    // Écrit par Pierre, jamais deviné : cf. matchNotesRepository.js.
    userNote
  };
}

const CLAUDE_CODE_NON_CONNECTE =
  'Claude Code non configuré : CLAUDE_CODE_OAUTH_TOKEN manque dans server/.env (jeton obtenu une fois via "claude setup-token", CLI installé par "npm install -g @anthropic-ai/claude-code").';

/** `code` des échecs qui toucheront aussi les analyses suivantes (cf. ClaudeCodeIndisponible) — lu par autoMatchAiTrigger.js. */
export const CODE_CLAUDE_CODE_INDISPONIBLE = 'CLAUDE_CODE_INDISPONIBLE';

function echecAppel(prefixe, error) {
  return new DomainError(`${prefixe} : ${error.message}`, {
    status: 502,
    code: error instanceof ClaudeCodeIndisponible ? CODE_CLAUDE_CODE_INDISPONIBLE : undefined
  });
}

/**
 * La composition telle que l'IA la lit : sans identifiants, numéros ni
 * minutes, qui ne lui disent rien, et seulement les remplaçants qui ont
 * compté cette saison — les 24 du banc pesaient 40 % de la composition
 * (mesuré le 01/10/2026, São Paulo - Santos).
 */
function compositionPourIA(lineups) {
  if (!lineups) return null;
  const joueur = ({ name, position, stats }) => ({
    name,
    position,
    stats: stats
      ? {
          apps: stats.apps,
          starts: stats.starts,
          goals: stats.goals,
          assists: stats.assists,
          ...(stats.xg != null ? { xg: stats.xg } : {}),
          ...(stats.rating != null ? { rating: stats.rating } : {})
        }
      : null
  });
  const aCompte = (j) => j.stats && (j.stats.starts >= 3 || j.stats.goals > 0 || j.stats.assists > 0);
  const equipe = (t) =>
    t && {
      team: t.team,
      formation: t.formation,
      coach: t.coach,
      statsSince: t.statsSince,
      teamMatches: t.teamMatches,
      startXI: t.startXI.map(joueur),
      bench: t.bench.filter(aCompte).map(joueur),
      // Les champs d'avant le 01/10/2026, nommés : identifiant, âge et
      // nationalité servent à l'affichage, pas à l'IA.
      unavailable: (t.unavailable ?? []).map(({ name, reason, expectedReturn }) => ({ name, reason, expectedReturn })),
      usualStartersMissing: (t.usualStartersMissing ?? []).map(({ name, position, starts, goals, assists, status }) => ({
        name,
        position,
        starts,
        goals,
        assists,
        status
      })),
      // Dernière composition alignée (`source: 'magasin'`) : le match d'où vient ce onze.
      ...(t.lastMatch
        ? {
            lastMatch: {
              date: t.lastMatch.date,
              league: t.lastMatch.league,
              home: t.lastMatch.home,
              away: t.lastMatch.away,
              homeGoals: t.lastMatch.homeGoals,
              awayGoals: t.lastMatch.awayGoals
            }
          }
        : {})
    };
  return {
    source: lineups.source,
    minutesBeforeKickoff: lineups.minutesBeforeKickoff,
    home: equipe(lineups.home),
    away: equipe(lineups.away),
    matchInfo: lineups.matchInfo ?? null
  };
}

/**
 * `sansRepliPayant` : vrai pour le déclenchement AUTOMATIQUE — le contexte ne
 * se complète jamais par API-Football (quota payant de 100/jour) quand le
 * magasin ne connaît pas une équipe ; la donnée manque, c'est tout. Un clic
 * de l'utilisateur garde le repli.
 *
 * `timing` : 'avance' (jusqu'à 48 h avant, ou un clic) ou 'coup-d-envoi'
 * (environ une heure avant, cf. autoMatchAiTrigger.js), avec `lineups` (cf.
 * lineupContext.js) quand FotMob a publié la composition. L'analyse d'avant
 * coup d'envoi devient celle de référence (écran, revue après-match,
 * expérience de l'IA) ; celle de la veille reste consultable.
 */
export async function runPreMatchAnalysis({ matchId, home, away, league, engineResult, sansRepliPayant = false, lineups = null, timing = 'avance' }) {
  if (!isClaudeCodeAuthenticated()) {
    throw new DomainError(CLAUDE_CODE_NON_CONNECTE, { status: 400, code: CODE_CLAUDE_CODE_INDISPONIBLE });
  }
  if (!matchId || !home || !away) {
    throw new DomainError('Match invalide : "matchId", "home" et "away" sont requis.', { status: 400 });
  }
  if (!engineResult || typeof engineResult !== 'object') {
    throw new DomainError("Résultat du moteur manquant : l'analyse du match doit être chargée avant de lancer l'analyse IA.", { status: 400 });
  }

  const engineSummary = curateEngineSummary(engineResult);
  const context = await gatherQualitativeContext(home, away, league, { matchId, commenceTime: engineResult.commenceTime, sansRepliPayant });
  // Sans composition fournie (analyse de la veille, ou d'un clic) : celle que
  // FotMob a publiée, sinon la dernière alignée par chaque équipe — l'IA juge
  // toujours sur QUI joue (01/10/2026). Lecture FotMob gratuite ; un échec ne
  // bloque jamais l'analyse.
  let compo = lineups;
  if (!compo) {
    try {
      compo = await compositionPourAnalyseIA({ homeName: home, awayName: away, commenceTimeIso: engineResult.commenceTime, league });
    } catch {
      compo = null;
    }
  }
  if (compo) context.lineups = compositionPourIA(compo);
  let experience = [];
  try {
    experience = aiMarketExperience();
  } catch {
    // Analyses illisibles à cet instant : l'avis se donne sans le bilan passé.
  }
  const { system, messages } = buildPreMatchAnalysisRequest({ home, away, league, engineSummary, context, experience });

  let reponse;
  try {
    reponse = await callClaudeCode({ system, userMessage: messages[0].content, jsonSchema: SUBMIT_PRE_MATCH_ANALYSIS_TOOL.input_schema });
  } catch (error) {
    throw echecAppel('Analyse IA pré-match impossible', error);
  }

  const analysis = sanitizeToolInput(reponse.structuredOutput);
  // Chaque avis sous le libellé exact du marché du moteur, pour que l'onglet
  // et la revue après-match le retrouvent.
  if (engineSummary.marketPredictions.length && Array.isArray(analysis.marketViews)) {
    const rattaches = rattacherAuxMarches(analysis.marketViews, engineSummary.marketPredictions);
    // Avec le pourcentage que l'explication commente (il bouge avec les cotes).
    analysis.marketViews = engineSummary.marketPredictions.flatMap((m, i) =>
      rattaches[i] ? [{ ...rattaches[i], market: m.market, probability: m.probability ?? null }] : []
    );
  }

  const existante = getByMatchId(matchId);
  const entree = {
    matchId,
    homeName: home,
    awayName: away,
    league: league ?? null,
    // Absent de engineSnapshot (curateEngineSummary ne garde que le chiffré) :
    // seul repère de date pour retrouver cette analyse après-coup, par équipes,
    // quand l'après-match automatique ne connaît que l'identifiant FotMob.
    commenceTime: engineResult.commenceTime ?? null,
    model: 'claude-code:sonnet',
    engineSnapshot: engineSummary,
    usage: reponse.usage ?? null,
    costUsd: reponse.costUsd,
    // `createdAt` reste celui de la toute première analyse du match.
    analysedAt: new Date().toISOString(),
    timing,
    lineupSnapshot: compo ?? null,
    analysis
  };
  if (timing === 'coup-d-envoi') {
    // Une analyse « d'avant coup d'envoi » faite plus de 70 min avant le vrai
    // coup d'envoi (heure fictive d'un match du calendrier, cf.
    // autoMatchAiTrigger.js) ne compte pas comme telle.
    const kickoffMs = Date.parse(engineResult.commenceTime ?? '');
    const dejaAuCoupDEnvoi = existante?.timing === 'coup-d-envoi' && !(kickoffMs - Date.parse(existante.analysedAt ?? 0) > 70 * 60_000);
    entree.kickoffRuns = dejaAuCoupDEnvoi ? (existante.kickoffRuns ?? 1) + 1 : 1;
    // L'analyse de la veille, remplacée, reste consultable (une seule : la
    // première d'avance, jamais une analyse d'avant coup d'envoi refaite).
    if (existante?.analysis && !dejaAuCoupDEnvoi && !existante.earlierAnalysis) {
      entree.earlierAnalysis = {
        analysis: existante.analysis,
        engineSnapshot: existante.engineSnapshot ?? null,
        analysedAt: existante.analysedAt ?? existante.updatedAt ?? existante.createdAt ?? null
      };
    }
  }
  // Une analyse vient de coûter ~10 s de quota Claude : jamais jetée sur un blocage OneDrive.
  return enregistrerSansPerdre(() => savePreMatchAnalysis(entree), 'analyse IA');
}

/**
 * `result` optionnel : {homeGoals, awayGoals} déjà connu de l'appelant (cf.
 * autoMatchAiTrigger.js, qui le lit directement dans le magasin FotMob).
 * Sans lui, on retombe sur le rapprochement par équipes + jour du magasin de
 * résultats saisis/importés (match-results.json) — jamais une égalité stricte
 * de matchId, puisque ce fichier porte des identifiants `web-...` distincts
 * de celui sous lequel l'analyse avant-match a été enregistrée (cf.
 * matchResultsRepository.js, createResultLookup).
 */
export async function runPostMatchAnalysis({ matchId, result: resultFourni = null }) {
  if (!isClaudeCodeAuthenticated()) {
    throw new DomainError(CLAUDE_CODE_NON_CONNECTE, { status: 400, code: CODE_CLAUDE_CODE_INDISPONIBLE });
  }

  const prior = getByMatchId(matchId);
  if (!prior?.analysis) {
    throw new DomainError('Aucune analyse avant-match trouvée pour ce match — impossible de comparer.', { status: 400 });
  }

  // Fenêtre large (avant/après) quand `commenceTime` manque (analyses
  // enregistrées avant son ajout) : `createdAt` n'est qu'un ordre de grandeur
  // de la date du match, jamais aussi sûr qu'un vrai coup d'envoi.
  const jourApprox = (prior.commenceTime ?? prior.createdAt ?? new Date().toISOString()).slice(0, 10);
  const fenetre = prior.commenceTime ? { league: prior.league ?? null } : { before: 3, after: 7, league: prior.league ?? null };
  const result = resultFourni ?? createResultLookup()(matchId, jourApprox, prior.homeName, prior.awayName, fenetre);
  if (!result) {
    throw new DomainError("Le résultat de ce match n'a pas encore été saisi (Historique moteur > Score final).", { status: 400 });
  }

  // Date réelle du match : fournie (automatique), lue dans l'identifiant du
  // résultat (« web-AAAA-MM-JJ-… »), ou à défaut le coup d'envoi enregistré.
  const dateMatch = result.date ?? /(\d{4}-\d{2}-\d{2})/.exec(String(result.matchId ?? ''))?.[1] ?? prior.commenceTime?.slice(0, 10) ?? null;
  // Les faits du match d'abord : ils jugent aussi les marchés de corners et de tirs.
  const matchStats = faitsDuMatch(result.homeName ?? prior.homeName, dateMatch);
  const marketOutcomes = issuesDesMarches(prior, pronosticsDeMarches(prior), result, statsPourReglement(matchStats));
  const { system, messages } = buildPostMatchReviewRequest({
    home: prior.homeName,
    away: prior.awayName,
    league: prior.league,
    priorAnalysis: prior.analysis,
    engineSummary: prior.engineSnapshot,
    result: { homeGoals: result.homeGoals, awayGoals: result.awayGoals },
    marketOutcomes,
    matchStats
  });

  let reponse;
  try {
    reponse = await callClaudeCode({ system, userMessage: messages[0].content, jsonSchema: SUBMIT_POST_MATCH_REVIEW_TOOL.input_schema });
  } catch (error) {
    throw echecAppel('Analyse IA après-match impossible', error);
  }

  // Le bilan de chaque marché : l'issue et la tenue de l'avis (calculées
  // ici), l'explication et la leçon (écrites par l'IA).
  const brut = sanitizeToolInput(reponse.structuredOutput);
  const ecrites = rattacherAuxMarches(brut.marketReviews ?? [], marketOutcomes);
  const marketReviews = marketOutcomes.map((o, i) => ({ ...o, explanation: ecrites[i]?.explanation ?? null, lesson: ecrites[i]?.lesson ?? null }));
  const revue = {
    ...brut,
    marketReviews,
    model: 'claude-code:sonnet',
    usage: reponse.usage ?? null,
    costUsd: reponse.costUsd,
    createdAt: new Date().toISOString()
  };
  return enregistrerSansPerdre(() => savePostMatchReview(matchId, revue), 'analyse IA');
}
