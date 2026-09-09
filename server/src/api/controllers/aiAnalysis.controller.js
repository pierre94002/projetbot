import { getAiConnectionStatus, connectAi, disconnectAi, DEFAULT_ANTHROPIC_MODEL } from '../../core/ai/aiConfigStore.js';
import { callAnthropicMessages } from '../../core/ai/anthropicClient.js';
import { runAnalysis } from '../../core/ai/aiAnalysisService.js';
import { listAnalysisHistory } from '../../data/repositories/aiAnalysisHistoryRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

export function getStatus(req, res) {
  res.json(getAiConnectionStatus());
}

/**
 * Valide la clé par un appel réel minimal (max_tokens:1, coût négligeable)
 * avant de la persister — une clé invalide échoue immédiatement en 400
 * plutôt que de sembler connectée jusqu'au premier "Lancer l'analyse".
 */
export async function postConnect(req, res) {
  const { apiKey, model, workspaceId } = req.body ?? {};
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new ApiError(400, 'Clé API Anthropic requise (format invalide).');
  }

  const trimmedKey = apiKey.trim();
  const trimmedModel = model?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const trimmedWorkspaceId = workspaceId?.trim() || '';

  try {
    await callAnthropicMessages({
      apiKey: trimmedKey,
      workspaceId: trimmedWorkspaceId,
      model: trimmedModel,
      system: 'ping',
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 1
    });
  } catch (error) {
    throw new ApiError(400, error.message);
  }

  res.json(connectAi({ apiKey: trimmedKey, model: trimmedModel, workspaceId: trimmedWorkspaceId }));
}

export function postDisconnect(req, res) {
  res.json(disconnectAi());
}

export async function postRun(req, res) {
  const result = await runAnalysis({ limit: Number(req.body?.limit) || undefined });
  res.status(201).json(result);
}

/** Les 10 dernières analyses (cf. MAX_HISTORY_ENTRIES), plus récente en premier — pour ne rien perdre entre deux runs espacés dans le temps. */
export function getHistory(req, res) {
  res.json({ entries: listAnalysisHistory() });
}
