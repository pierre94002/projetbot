import { listMatchResults, recordMatchResult } from '../../data/repositories/matchResultsRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

export function getMatchResults(req, res) {
  res.json({ results: listMatchResults() });
}

export function postMatchResult(req, res) {
  const { matchId, homeName, awayName, league, homeGoals, awayGoals } = req.body ?? {};
  if (!matchId || !homeName || !awayName) throw new ApiError(400, '"matchId", "homeName" et "awayName" sont requis.');

  const numHomeGoals = Number(homeGoals);
  const numAwayGoals = Number(awayGoals);
  if (!Number.isFinite(numHomeGoals) || numHomeGoals < 0 || !Number.isFinite(numAwayGoals) || numAwayGoals < 0) {
    throw new ApiError(400, 'Le score doit être composé de deux nombres positifs ou nuls.');
  }

  const entry = recordMatchResult({ matchId, homeName, awayName, league, homeGoals: numHomeGoals, awayGoals: numAwayGoals });
  res.status(201).json(entry);
}
