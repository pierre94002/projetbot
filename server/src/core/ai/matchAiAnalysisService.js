import { getAiConfig } from './aiConfigStore.js';
import { callAnthropicMessages } from './anthropicClient.js';
import {
  buildPreMatchAnalysisRequest,
  SUBMIT_PRE_MATCH_ANALYSIS_TOOL,
  SUBMIT_PRE_MATCH_ANALYSIS_TOOL_CHOICE,
  buildPostMatchReviewRequest,
  SUBMIT_POST_MATCH_REVIEW_TOOL,
  SUBMIT_POST_MATCH_REVIEW_TOOL_CHOICE
} from './matchAiAnalysisPrompt.js';
import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { resolveAverageStatsByName, resolveTeamFormByName } from '../../data/providers/matchEnrichment.js';
import { DEFAULT_FORM_SAMPLE_SIZE } from '../../data/providers/teamStatsService.js';
import { resolveFlashscoreStatsByName } from '../../data/providers/flashscoreEnrichment.js';
import { resolveHistoricalStatsByName, resolveHistoricalFormByName, resolveHistoricalStandingRow } from '../../data/providers/historicalMatchesProvider.js';
import { getTeamProfile } from '../../data/repositories/teamProfileRepository.js';
import { getByMatchId, savePreMatchAnalysis, savePostMatchReview } from '../../data/repositories/matchAiAnalysisRepository.js';
import { getResultByMatchId } from '../../data/repositories/matchResultsRepository.js';
import { resolveCurrentSeason } from '../../data/providers/leagueRegistry.js';
import { findBestTeamNameMatch } from '../../utils/teamNameMatch.js';
import { DomainError } from '../errors.js';

const MAX_RESPONSE_TOKENS = 2048;
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

// La forme API-Football porte la saison du plan (2024) : sans dates, l'IA
// la prendrait pour la forme actuelle.
function describeForm(form) {
  if (!form) return null;
  return {
    season: resolveCurrentSeason(),
    results: form.form.matches.map((m) => m.result),
    dates: form.form.matches.map((m) => (typeof m.date === 'string' ? m.date.slice(0, 10) : null)),
    sampleSize: form.form.sampleSize
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
    staking: engineResult.staking ?? null
  };
}

/**
 * Contexte qualitatif best-effort — chaque appel échoue indépendamment
 * (Promise.allSettled), même philosophie que enrichMatchWithRealAverages :
 * un classement absent (coupe) ou une équipe non résolue ne doit jamais faire
 * échouer toute l'analyse, juste réduire ce qui est disponible.
 */
async function gatherQualitativeContext(home, away, league) {
  const [standingsR, homeStatsR, awayStatsR, homeFormR, awayFormR] = await Promise.allSettled([
    getStandingsByLeagueLabel(league),
    resolveAverageStatsByName(home, league),
    resolveAverageStatsByName(away, league),
    resolveTeamFormByName(home, league, DEFAULT_FORM_SAMPLE_SIZE),
    resolveTeamFormByName(away, league, DEFAULT_FORM_SAMPLE_SIZE)
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  const standings = val(standingsR);
  const homeStats = val(homeStatsR);
  const awayStats = val(awayStatsR);
  const homeForm = val(homeFormR);
  const awayForm = val(awayFormR);

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

  return {
    standings: homeStandingRow || awayStandingRow ? { home: homeStandingRow, away: awayStandingRow } : null,
    homeStats: homeStatsPicked ? { stats: homeStatsPicked, sampleSize: homeStats.stats.sampleSize } : null,
    awayStats: awayStatsPicked ? { stats: awayStatsPicked, sampleSize: awayStats.stats.sampleSize } : null,
    homeForm: describeForm(homeForm),
    awayForm: describeForm(awayForm),
    // Source secondaire (FlashScore via Apify) — cf. flashscoreEnrichment.js :
    // peut dater de plusieurs jours (`collectedAt`), jamais traitée comme plus
    // fiable que homeStats/awayStats ci-dessus dans le prompt (matchAiAnalysisPrompt.js).
    homeFlashscoreStats,
    awayFlashscoreStats,
    // Troisième source, locale et gratuite (football-data.co.uk) — moyennes
    // sur les 5 dernières saisons, sans limite de requêtes. Même statut que
    // homeFlashscoreStats : jamais plus fiable que homeStats/awayStats.
    homeHistoricalStats,
    awayHistoricalStats,
    homeHistoricalForm: homeHistoricalForm ? { results: homeHistoricalForm.results, sampleSize: homeHistoricalForm.sampleSize } : null,
    awayHistoricalForm: awayHistoricalForm ? { results: awayHistoricalForm.results, sampleSize: awayHistoricalForm.sampleSize } : null,
    // Quatrième source, locale (coupes européennes, cf. teamProfileRepository.js)
    // — mêmes garanties que les deux sources secondaires précédentes.
    homeTeamProfile: homeTeamProfile ? { recentForm: homeTeamProfile.recentForm, historicalAverages: homeTeamProfile.historicalAverages, updatedAt: homeTeamProfile.updatedAt } : null,
    awayTeamProfile: awayTeamProfile ? { recentForm: awayTeamProfile.recentForm, historicalAverages: awayTeamProfile.historicalAverages, updatedAt: awayTeamProfile.updatedAt } : null
  };
}

export async function runPreMatchAnalysis({ matchId, home, away, league, engineResult }) {
  const { apiKey, model, workspaceId } = getAiConfig();
  if (!apiKey) {
    throw new DomainError('Aucune clé API Anthropic configurée. Connectez-en une depuis Réglages > Connexion IA.', { status: 400 });
  }
  if (!matchId || !home || !away) {
    throw new DomainError('Match invalide : "matchId", "home" et "away" sont requis.', { status: 400 });
  }
  if (!engineResult || typeof engineResult !== 'object') {
    throw new DomainError("Résultat du moteur manquant : l'analyse du match doit être chargée avant de lancer l'analyse IA.", { status: 400 });
  }

  const engineSummary = curateEngineSummary(engineResult);
  const context = await gatherQualitativeContext(home, away, league);
  const { system, messages } = buildPreMatchAnalysisRequest({ home, away, league, engineSummary, context });

  let response;
  try {
    response = await callAnthropicMessages({
      apiKey,
      workspaceId,
      model,
      system,
      messages,
      tools: [SUBMIT_PRE_MATCH_ANALYSIS_TOOL],
      toolChoice: SUBMIT_PRE_MATCH_ANALYSIS_TOOL_CHOICE,
      maxTokens: MAX_RESPONSE_TOKENS
    });
  } catch (error) {
    throw new DomainError(`Analyse IA pré-match impossible : ${error.message}`, { status: 502 });
  }

  const toolUse = response.content?.find((b) => b.type === 'tool_use' && b.name === 'submit_pre_match_analysis');
  if (!toolUse) throw new DomainError('Réponse Anthropic inattendue (pas de résultat structuré).', { status: 502 });

  return savePreMatchAnalysis({
    matchId,
    homeName: home,
    awayName: away,
    league: league ?? null,
    model,
    engineSnapshot: engineSummary,
    usage: response.usage ?? null,
    analysis: sanitizeToolInput(toolUse.input)
  });
}

export async function runPostMatchAnalysis({ matchId }) {
  const { apiKey, model, workspaceId } = getAiConfig();
  if (!apiKey) {
    throw new DomainError('Aucune clé API Anthropic configurée. Connectez-en une depuis Réglages > Connexion IA.', { status: 400 });
  }

  const prior = getByMatchId(matchId);
  if (!prior?.analysis) {
    throw new DomainError('Aucune analyse avant-match trouvée pour ce match — impossible de comparer.', { status: 400 });
  }

  const result = getResultByMatchId(matchId);
  if (!result) {
    throw new DomainError("Le résultat de ce match n'a pas encore été saisi (Historique moteur > Score final).", { status: 400 });
  }

  const { system, messages } = buildPostMatchReviewRequest({
    home: prior.homeName,
    away: prior.awayName,
    league: prior.league,
    priorAnalysis: prior.analysis,
    engineSummary: prior.engineSnapshot,
    result: { homeGoals: result.homeGoals, awayGoals: result.awayGoals }
  });

  let response;
  try {
    response = await callAnthropicMessages({
      apiKey,
      workspaceId,
      model,
      system,
      messages,
      tools: [SUBMIT_POST_MATCH_REVIEW_TOOL],
      toolChoice: SUBMIT_POST_MATCH_REVIEW_TOOL_CHOICE,
      maxTokens: MAX_RESPONSE_TOKENS
    });
  } catch (error) {
    throw new DomainError(`Analyse IA après-match impossible : ${error.message}`, { status: 502 });
  }

  const toolUse = response.content?.find((b) => b.type === 'tool_use' && b.name === 'submit_post_match_review');
  if (!toolUse) throw new DomainError('Réponse Anthropic inattendue (pas de résultat structuré).', { status: 502 });

  return savePostMatchReview(matchId, { ...sanitizeToolInput(toolUse.input), model, usage: response.usage ?? null, createdAt: new Date().toISOString() });
}
