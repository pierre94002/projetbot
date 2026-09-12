import { runPreMatchAnalysis, runPostMatchAnalysis } from '../../core/ai/matchAiAnalysisService.js';
import { getByMatchId } from '../../data/repositories/matchAiAnalysisRepository.js';

export function getForMatch(req, res) {
  res.json({ entry: getByMatchId(req.params.matchId) ?? null });
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
