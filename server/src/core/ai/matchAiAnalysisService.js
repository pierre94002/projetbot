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
import { getByMatchId, savePreMatchAnalysis, savePostMatchReview } from '../../data/repositories/matchAiAnalysisRepository.js';
import { getResultByMatchId } from '../../data/repositories/matchResultsRepository.js';
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

function findStandingRow(standings, teamName) {
  const normalized = teamName.trim().toLowerCase();
  return standings?.rows?.find((row) => row.teamName.trim().toLowerCase() === normalized) ?? null;
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

  return {
    standings: standings ? { home: findStandingRow(standings, home), away: findStandingRow(standings, away) } : null,
    homeStats: homeStatsPicked ? { stats: homeStatsPicked, sampleSize: homeStats.stats.sampleSize } : null,
    awayStats: awayStatsPicked ? { stats: awayStatsPicked, sampleSize: awayStats.stats.sampleSize } : null,
    homeForm: homeForm ? { results: homeForm.form.matches.map((m) => m.result), sampleSize: homeForm.form.sampleSize } : null,
    awayForm: awayForm ? { results: awayForm.form.matches.map((m) => m.result), sampleSize: awayForm.form.sampleSize } : null
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
    analysis: toolUse.input
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

  return savePostMatchReview(matchId, { ...toolUse.input, model, usage: response.usage ?? null, createdAt: new Date().toISOString() });
}
