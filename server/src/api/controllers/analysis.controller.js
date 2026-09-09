import { analyzeMatch } from '../../core/engine/oddsEngine.js';
import { getEngineConfig } from '../../core/engine/engineConfig.js';
import { getTiltState } from '../../core/engine/tiltState.js';
import { listAdaptedMatches } from '../../data/matchSources.js';
import { enrichMatchWithRealAverages } from '../../data/providers/matchEnrichment.js';
import { ApiError } from '../middlewares/errorHandler.js';

/**
 * Analyse un match existant d'une source de données, par son identifiant.
 * Tente par défaut d'enrichir le match avec les moyennes réelles de buts
 * des deux équipes (API-Football) ; passer `enrich=false` pour s'en tenir
 * à la baseline de ligue. Les corners, plus coûteux en appels API, restent
 * optionnels via `includeCorners=true`.
 */
export async function analyzeMatchById(req, res) {
  const source = req.query.source || 'odds-api';
  const bankroll = Number(req.query.bankroll) || 10000;
  const shouldEnrich = req.query.enrich !== 'false';
  const includeCorners = req.query.includeCorners === 'true';
  const cornersSampleSize = req.query.cornersSampleSize ? Number(req.query.cornersSampleSize) : undefined;

  const match = listAdaptedMatches(source, bankroll).find((m) => m.matchId === req.params.matchId);
  if (!match) throw new ApiError(404, `Match introuvable : ${req.params.matchId}`);

  const finalMatch = shouldEnrich
    ? await enrichMatchWithRealAverages(match, { includeCorners, cornersSampleSize })
    : match;

  res.json(await analyzeMatch(finalMatch, getEngineConfig(), getTiltState()));
}
