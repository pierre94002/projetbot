import {
  listTeamMatchStats,
  getMatchStatsById,
  getTeamWebAverages,
  getMatchStatsStatus
} from '../../data/repositories/matchStatsWebRepository.js';
import { ApiError, requireStringParam, optionalPositiveInt } from '../middlewares/errorHandler.js';

/** Matchs d'une équipe avec stats d'équipe complètes + stats joueurs, match par match (import quotidien 7h30). */
export function getTeamMatchStats(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const limit = optionalPositiveInt(req.query.limit, 'limit');

  const matches = listTeamMatchStats(name, { limit });
  res.json({ teamName: name, count: matches.length, matches });
}

/** Moyennes des stats d'équipe sur les N derniers matchs importés (saison en cours). */
export function getTeamMatchStatsAverages(req, res) {
  const name = requireStringParam(req.query.name, 'name');
  const sampleSize = optionalPositiveInt(req.query.sampleSize, 'sampleSize');

  const stats = getTeamWebAverages(name, sampleSize);
  if (!stats) throw new ApiError(404, `Aucune statistique importée pour "${name}".`);
  res.json({ teamId: null, teamName: stats.teamName, stats });
}

export function getMatchStats(req, res) {
  const entry = getMatchStatsById(req.params.matchId);
  if (!entry) throw new ApiError(404, `Statistiques introuvables pour le match ${req.params.matchId}.`);
  res.json(entry);
}

export function getMatchStatsInfo(req, res) {
  res.json(getMatchStatsStatus());
}
