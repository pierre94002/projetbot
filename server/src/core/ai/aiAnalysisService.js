import crypto from 'node:crypto';
import { getAiConfig } from './aiConfigStore.js';
import { buildAnalysisDataset } from './aiDatasetBuilder.js';
import { callAnthropicMessages } from './anthropicClient.js';
import { buildAnalysisRequest, SUBMIT_ANALYSIS_TOOL, SUBMIT_ANALYSIS_TOOL_CHOICE } from './aiAnalysisPrompt.js';
import { getEngineConfig } from '../engine/engineConfig.js';
import { saveAnalysisResult } from '../../data/repositories/aiAnalysisHistoryRepository.js';
import { DomainError } from '../errors.js';

const MAX_RESPONSE_TOKENS = 4096; // garde-fou coût sur la réponse

export async function runAnalysis({ limit } = {}) {
  const { apiKey, model, workspaceId } = getAiConfig();
  if (!apiKey) {
    throw new DomainError('Aucune clé API Anthropic configurée. Connectez-en une depuis Réglages > Connexion IA.', { status: 400 });
  }

  const dataset = buildAnalysisDataset({ limit });
  if (dataset.records.length === 0) {
    throw new DomainError('Aucun pronostic réglé (correct/incorrect) disponible pour l\'analyse.', { status: 400 });
  }

  const { system, messages } = buildAnalysisRequest(dataset.records, getEngineConfig());

  let response;
  try {
    response = await callAnthropicMessages({
      apiKey,
      workspaceId,
      model,
      system,
      messages,
      tools: [SUBMIT_ANALYSIS_TOOL],
      toolChoice: SUBMIT_ANALYSIS_TOOL_CHOICE,
      maxTokens: MAX_RESPONSE_TOKENS
    });
  } catch (error) {
    throw new DomainError(`Analyse IA impossible : ${error.message}`, { status: 502 });
  }

  const toolUse = response.content?.find((block) => block.type === 'tool_use' && block.name === 'submit_analysis');
  if (!toolUse) {
    throw new DomainError('Réponse Anthropic inattendue (pas de résultat structuré).', { status: 502 });
  }

  const result = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    model,
    datasetMeta: dataset.meta,
    usage: response.usage ?? null,
    analysis: toolUse.input
  };

  return saveAnalysisResult(result);
}
