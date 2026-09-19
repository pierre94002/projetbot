import { listAdaptedMatches, DATA_SOURCE_KEYS } from '../../data/matchSources.js';
import { createResultLookup } from '../../data/repositories/matchResultsRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

/**
 * Marque les matchs dont le score est déjà connu. L'appariement ne peut pas se
 * faire côté navigateur : un résultat importé par recherche web ne partage pas
 * le matchId de The Odds API, et les rapprocher demande le registre de noms
 * d'équipe (src/utils/teamNameMatch.js), qui vit ici. Le front se contente
 * donc de lire `settled`.
 */
function withSettledFlag(matches) {
  const findResult = createResultLookup();
  return matches.map((match) => {
    const result = findResult(match.matchId, (match.commenceTime ?? '').slice(0, 10), match.home, match.away);
    return {
      ...match,
      settled: Boolean(result),
      result: result ? { homeGoals: result.homeGoals, awayGoals: result.awayGoals } : null
    };
  });
}

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
  const matches = withSettledFlag(listAdaptedMatches(source, bankroll));
  res.json({ source, count: matches.length, matches });
}

export function getMatch(req, res) {
  const source = resolveSource(req);
  const bankroll = Number(req.query.bankroll) || 10000;
  const match = listAdaptedMatches(source, bankroll).find((m) => m.matchId === req.params.matchId);

  if (!match) throw new ApiError(404, `Match introuvable : ${req.params.matchId}`);
  // Annoté mais jamais filtré ici : ouvrir le détail d'un match terminé reste
  // légitime (relecture d'un pronostic passé).
  res.json(withSettledFlag([match])[0]);
}
