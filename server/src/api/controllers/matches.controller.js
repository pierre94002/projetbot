import { listAdaptedMatches, findAdaptedMatch, DATA_SOURCE_KEYS } from '../../data/matchSources.js';
import { createResultLookup } from '../../data/repositories/matchResultsRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { capitalDuMomentLu, baseDeCalcul, vueDuCapital } from '../../data/mise/capitalDePierre.js';
import { sansBase } from '../../data/mise/miseRead.js';

/**
 * Marque les matchs dont le score est déjà connu. L'appariement ne peut pas se
 * faire côté navigateur : un résultat importé par recherche web ne partage pas
 * le matchId de The Odds API, et les rapprocher demande le registre de noms
 * d'équipe (src/utils/teamNameMatch.js), qui vit ici. Le front se contente
 * donc de lire `settled`.
 */
function withSettledFlag(matches) {
  // Un fichier de résultats illisible ne doit pas faire tomber la liste des
  // matchs : elle s'affiche alors sans marquer les matchs terminés.
  let findResult;
  try {
    findResult = createResultLookup();
  } catch (error) {
    console.warn(`[matchs] résultats illisibles, matchs non marqués : ${error.message}`);
    findResult = () => null;
  }
  return matches.map((match) => {
    // Même compétition : un match de coupe n'est pas « joué » parce que les
    // deux clubs se sont croisés en championnat la veille.
    const result = findResult(match.matchId, (match.commenceTime ?? '').slice(0, 10), match.home, match.away, { league: match.league ?? null });
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

// Étape 39 (lot 1a) : la base de la mise vient du capital de Pierre (Réglages › Gestion du risque), JAMAIS de la requête
// (`bankroll` n'y est plus lu) ; sans capital réglé, la base de calcul interne, jamais rendue (sansBase).
export function listMatches(req, res) {
  const source = resolveSource(req);
  const capital = capitalDuMomentLu();
  const bankroll = baseDeCalcul(capital);
  const matches = withSettledFlag(listAdaptedMatches(source, bankroll)).map(sansBase);
  res.json({ source, count: matches.length, matches, capital: vueDuCapital(capital) });
}

export function getMatch(req, res) {
  const source = resolveSource(req);
  const bankroll = baseDeCalcul(capitalDuMomentLu());
  const match = findAdaptedMatch(source, req.params.matchId, bankroll);

  if (!match) throw new ApiError(404, `Match introuvable : ${req.params.matchId}`);
  // Annoté mais jamais filtré ici : ouvrir le détail d'un match terminé reste
  // légitime (relecture d'un pronostic passé).
  res.json(sansBase(withSettledFlag([match])[0]));
}
