import { listMatchResults, recordMatchResult } from '../../data/repositories/matchResultsRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { isResultsMergeRunning } from '../../data/providers/fotMobCalendar.js';

export function getMatchResults(req, res) {
  res.json({ results: listMatchResults() });
}

export async function postMatchResult(req, res) {
  const { matchId, homeName, awayName, league, homeGoals, awayGoals } = req.body ?? {};
  if (!matchId || !homeName || !awayName) throw new ApiError(400, '"matchId", "homeName" et "awayName" sont requis.');

  const numHomeGoals = Number(homeGoals);
  const numAwayGoals = Number(awayGoals);
  if (!Number.isFinite(numHomeGoals) || numHomeGoals < 0 || !Number.isFinite(numAwayGoals) || numAwayGoals < 0) {
    throw new ApiError(400, 'Le score doit être composé de deux nombres positifs ou nuls.');
  }

  // La fusion automatique des résultats remplace le fichier d'un bloc : un
  // score écrit pendant qu'elle tourne serait perdu. On attend sa fin (quelques
  // secondes) ; la vérification et l'écriture qui suivent sont synchrones,
  // aucune fusion ne peut démarrer entre les deux.
  const limite = Date.now() + 20_000;
  while (isResultsMergeRunning() && Date.now() < limite) await new Promise((r) => setTimeout(r, 250));
  if (isResultsMergeRunning()) throw new ApiError(409, "La fusion automatique des résultats est en cours : réessayez dans un instant.");

  const entry = recordMatchResult({ matchId, homeName, awayName, league, homeGoals: numHomeGoals, awayGoals: numAwayGoals });
  res.status(201).json(entry);
}
