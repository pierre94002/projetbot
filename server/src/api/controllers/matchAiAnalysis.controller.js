import { runPreMatchAnalysis, runPostMatchAnalysis } from '../../core/ai/matchAiAnalysisService.js';
import { isClaudeCodeAuthenticated } from '../../core/ai/claudeCodeClient.js';
import { getByMatchId, listAll } from '../../data/repositories/matchAiAnalysisRepository.js';

/** Claude Code (headless) connecté sur ce poste — remplace la clé API pour l'analyse par match, cf. claudeCodeClient.js. */
export async function getStatus(req, res) {
  res.json({ connected: await isClaudeCodeAuthenticated() });
}

export function getForMatch(req, res) {
  res.json({ entry: getByMatchId(req.params.matchId) ?? null });
}

/** Pour les badges "analyse IA disponible" dans les listes Matchs/Historique moteur — un seul appel plutôt qu'un par match visible. */
export function getAll(req, res) {
  res.json({ entries: listAll() });
}

export async function postPreMatch(req, res) {
  const { home, away, league, engineResult } = req.body ?? {};
  const result = await runPreMatchAnalysis({ matchId: req.params.matchId, home, away, league, engineResult });
  res.status(201).json(result);
}

export async function postPostMatch(req, res) {
  const result = await runPostMatchAnalysis({ matchId: req.params.matchId });
  res.status(201).json(result);
}
