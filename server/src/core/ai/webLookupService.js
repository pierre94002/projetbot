import { getAiConfig } from './aiConfigStore.js';
import { callAnthropicMessages } from './anthropicClient.js';
import {
  WEB_SEARCH_TOOL,
  SUBMIT_LINEUP_TOOL,
  SUBMIT_LINEUP_TOOL_CHOICE,
  buildLineupSearchRequest,
  SUBMIT_PLAYER_STATS_TOOL,
  SUBMIT_PLAYER_STATS_TOOL_CHOICE,
  buildPlayerStatsSearchRequest,
  SUBMIT_TEAM_PROFILE_TOOL,
  buildTeamProfileSearchRequest
} from './webLookupPrompt.js';
import { DomainError } from '../errors.js';

const MAX_RESPONSE_TOKENS = 4096;
// Le profil combiné (effectif + forme + moyennes, cf. resolveTeamProfileViaWeb)
// implique plusieurs recherches web d'affilée avant la synthèse finale — plus
// de marge que les autres lookups (lineup/player stats, une recherche ou deux).
const MAX_RESPONSE_TOKENS_PROFILE = 16384;
// Réponse incomplète pour CETTE équipe (troncature, refus) — à distinguer
// d'une panne d'API, qui elle touchera aussi toutes les requêtes suivantes.
export const WEB_LOOKUP_INCOMPLETE = 'web_lookup_incomplete';
// L'outil serveur web_search peut rendre la main avant d'avoir fini
// (stop_reason "pause_turn") : on relance avec le contenu déjà produit, borné.
const MAX_CONTINUATIONS = 3;

function extractToolUse(response, toolName) {
  return response.content?.find((b) => b.type === 'tool_use' && b.name === toolName) ?? null;
}

async function callWithWebSearch(params) {
  let messages = params.messages;
  let response;
  for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
    response = await callAnthropicMessages({ ...params, messages });
    if (response.stop_reason !== 'pause_turn') break;
    messages = [...messages, { role: 'assistant', content: response.content }];
  }
  return response;
}

// Une réponse tronquée ou refusée n'a pas de bloc submit_* : la distinguer
// d'un vrai "rien trouvé", sinon elle serait rapportée comme telle.
function incompleteReason(response) {
  if (response.stop_reason === 'max_tokens') return 'réponse IA tronquée (max_tokens)';
  if (response.stop_reason === 'refusal') return 'réponse IA refusée par le modèle';
  return null;
}

function toWebLookupError(error) {
  return error instanceof DomainError ? error : new DomainError(`Recherche web IA impossible : ${error.message}`, { status: 502 });
}

/**
 * Repli composition d'équipe via recherche web (outil serveur Anthropic),
 * pour la saison en cours — hors couverture du plan gratuit API-Football
 * (cf. teamStatsService.js#getLiveLineups, reason "season_not_available").
 * Même forme de retour que getLiveLineups ({available, reason?, teams?}) pour
 * rester transparent côté appelant (matchEnrichment.js) — `available:false`
 * avec une raison si aucune clé Anthropic n'est connectée ou si la recherche
 * échoue (le message d'erreur est joint), jamais une exception.
 */
export async function resolveLineupViaWeb({ home, away, league, commenceTimeIso }) {
  const { apiKey, model, workspaceId } = getAiConfig();
  if (!apiKey) return { available: false, reason: 'ai_not_connected' };

  const { system, messages } = buildLineupSearchRequest({ home, away, league, commenceTimeIso });

  let response;
  try {
    response = await callWithWebSearch({
      apiKey,
      workspaceId,
      model,
      system,
      messages,
      tools: [WEB_SEARCH_TOOL, SUBMIT_LINEUP_TOOL],
      toolChoice: SUBMIT_LINEUP_TOOL_CHOICE,
      maxTokens: MAX_RESPONSE_TOKENS
    });
  } catch (error) {
    return { available: false, reason: 'web_lookup_failed', message: error.message };
  }

  const incomplete = incompleteReason(response);
  if (incomplete) return { available: false, reason: 'web_lookup_failed', message: incomplete };

  const toolUse = extractToolUse(response, 'submit_lineup');
  if (!toolUse || !toolUse.input.available) return { available: false, reason: 'not_found_via_web' };

  return {
    available: true,
    source: 'web',
    officialOrProbable: toolUse.input.officialOrProbable ?? 'probable',
    sourceUrl: toolUse.input.sourceUrl ?? null,
    teams: (toolUse.input.teams ?? []).map((team) => ({
      teamId: null,
      teamName: team.teamName,
      formation: team.formation ?? null,
      coach: null,
      startXI: (team.startXI ?? []).map((p) => ({ id: null, name: p.name, number: null, position: p.position ?? null })),
      substitutes: (team.substitutes ?? []).map((p) => ({ id: null, name: p.name, number: null, position: p.position ?? null }))
    }))
  };
}

/**
 * Repli effectif + stats individuelles via recherche web, pour la saison en
 * cours. `null` si aucune clé Anthropic connectée OU si rien de fiable n'a
 * été trouvé — même contrat que resolvePlayersByName (matchEnrichment.js),
 * qui renvoie déjà `null` pour "équipe introuvable". Un échec de l'appel IA
 * (crédits, réseau, réponse tronquée) lève une DomainError : ce n'est pas un
 * "rien trouvé" et l'utilisateur doit voir la vraie cause.
 */
export async function resolvePlayersViaWeb({ teamName, league }) {
  const { apiKey, model, workspaceId } = getAiConfig();
  if (!apiKey) return null;

  const { system, messages } = buildPlayerStatsSearchRequest({ teamName, league });

  let response;
  try {
    response = await callWithWebSearch({
      apiKey,
      workspaceId,
      model,
      system,
      messages,
      tools: [WEB_SEARCH_TOOL, SUBMIT_PLAYER_STATS_TOOL],
      toolChoice: SUBMIT_PLAYER_STATS_TOOL_CHOICE,
      maxTokens: MAX_RESPONSE_TOKENS
    });
  } catch (error) {
    throw toWebLookupError(error);
  }

  const incomplete = incompleteReason(response);
  if (incomplete) throw new DomainError(`Recherche web IA incomplète : ${incomplete}.`, { status: 502, code: WEB_LOOKUP_INCOMPLETE });

  const toolUse = extractToolUse(response, 'submit_player_stats');
  if (!toolUse || !toolUse.input.available) return null;

  return {
    teamName,
    season: toolUse.input.season ?? null,
    source: 'web',
    sourceUrl: toolUse.input.sourceUrl ?? null,
    players: (toolUse.input.players ?? []).map((p, index) => ({
      id: `web-${index}`,
      name: p.name,
      position: p.position ?? null,
      appearances: p.appearances ?? null,
      minutes: null,
      rating: p.rating ?? null,
      goals: p.goals ?? 0,
      assists: p.assists ?? 0,
      yellowCards: p.yellowCards ?? 0,
      redCards: p.redCards ?? 0
    }))
  };
}

/**
 * Profil complet (effectif + forme + moyennes) en un seul appel — utilisé
 * pour peupler team-profiles.json (équipes des coupes européennes, cf.
 * teamProfileRepository.js). `null` si aucune clé Anthropic connectée OU si
 * rien de fiable n'a été trouvé ; DomainError si l'appel IA lui-même échoue,
 * pour que le lot (populate-team-profiles.mjs) le voie comme un échec et non
 * comme une équipe sans données.
 */
export async function resolveTeamProfileViaWeb({ teamName, league }) {
  const { apiKey, model, workspaceId } = getAiConfig();
  if (!apiKey) return null;

  const { system, messages } = buildTeamProfileSearchRequest({ teamName, league });

  let response;
  try {
    response = await callWithWebSearch({
      apiKey,
      workspaceId,
      model,
      system,
      messages,
      tools: [WEB_SEARCH_TOOL, SUBMIT_TEAM_PROFILE_TOOL],
      toolChoice: { type: 'auto' },
      maxTokens: MAX_RESPONSE_TOKENS_PROFILE
    });
  } catch (error) {
    throw toWebLookupError(error);
  }

  const incomplete = incompleteReason(response);
  if (incomplete) throw new DomainError(`Recherche web IA incomplète : ${incomplete}.`, { status: 502, code: WEB_LOOKUP_INCOMPLETE });

  const toolUse = extractToolUse(response, 'submit_team_profile');
  if (!toolUse || !toolUse.input.available) return null;

  return {
    teamName,
    league: league ?? null,
    season: toolUse.input.season ?? null,
    source: 'web',
    sourceUrl: toolUse.input.sourceUrl ?? null,
    recentForm: toolUse.input.recentForm ?? null,
    historicalAverages: toolUse.input.historicalAverages ?? null,
    players: (toolUse.input.players ?? []).map((p, index) => ({
      id: `web-${index}`,
      name: p.name,
      position: p.position ?? null,
      appearances: p.appearances ?? null,
      minutes: null,
      rating: p.rating ?? null,
      goals: p.goals ?? 0,
      assists: p.assists ?? 0,
      yellowCards: p.yellowCards ?? 0,
      redCards: p.redCards ?? 0
    }))
  };
}
