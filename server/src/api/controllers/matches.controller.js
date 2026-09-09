import { listAdaptedMatches } from '../../data/matchSources.js';
import { ApiError } from '../middlewares/errorHandler.js';

export function listMatches(req, res) {
  const source = req.query.source || 'odds-api';
  const bankroll = Number(req.query.bankroll) || 10000;
  const matches = listAdaptedMatches(source, bankroll);
  res.json({ source, count: matches.length, matches });
}

export function getMatch(req, res) {
  const source = req.query.source || 'odds-api';
  const bankroll = Number(req.query.bankroll) || 10000;
  const match = listAdaptedMatches(source, bankroll).find((m) => m.matchId === req.params.matchId);

  if (!match) throw new ApiError(404, `Match introuvable : ${req.params.matchId}`);
  res.json(match);
}
