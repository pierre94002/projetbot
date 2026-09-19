import { listAdaptedMatches, DATA_SOURCE_KEYS } from '../../data/matchSources.js';
import { ApiError } from '../middlewares/errorHandler.js';

function resolveSource(req) {
  const source = req.query.source || 'odds-api';
  if (!DATA_SOURCE_KEYS.includes(source)) {
    throw new ApiError(400, `Source de données inconnue : "${source}" (attendu : ${DATA_SOURCE_KEYS.join(', ')}).`);
  }
  return source;
}

export function listMatches(req, res) {
  const source = resolveSource(req);
  const bankroll = Number(req.query.bankroll) || 10000;
  const matches = listAdaptedMatches(source, bankroll);
  res.json({ source, count: matches.length, matches });
}

export function getMatch(req, res) {
  const source = resolveSource(req);
  const bankroll = Number(req.query.bankroll) || 10000;
  const match = listAdaptedMatches(source, bankroll).find((m) => m.matchId === req.params.matchId);

  if (!match) throw new ApiError(404, `Match introuvable : ${req.params.matchId}`);
  res.json(match);
}
