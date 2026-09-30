import { runPreMatchAnalysis, runPostMatchAnalysis } from '../../core/ai/matchAiAnalysisService.js';
import { isClaudeCodeAuthenticated } from '../../core/ai/claudeCodeClient.js';
import { getByMatchId, listAll, findAnalysisForFixture, aiMarketExperience } from '../../data/repositories/matchAiAnalysisRepository.js';
import { listPredictions } from '../../data/repositories/predictionsRepository.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { requireStringParam } from '../middlewares/errorHandler.js';

const JOUR_MS = 86_400_000;

/** Claude Code (headless) connecté sur ce poste — remplace la clé API pour l'analyse par match, cf. claudeCodeClient.js. */
export async function getStatus(req, res) {
  res.json({ connected: await isClaudeCodeAuthenticated() });
}

export function getForMatch(req, res) {
  res.json({ entry: getByMatchId(req.params.matchId) ?? null });
}

/**
 * Onglet « Analyse IA » de la page de match : l'analyse avant et après-match,
 * et les pronostics du moteur sur nos marchés avec leur verdict. La page ne
 * connaît que les équipes, la compétition et la date ; les pronostics se
 * retrouvent par l'identifiant de cotes de l'analyse, ou, sans analyse, par
 * l'affiche relevée dans le mois qui précède.
 */
export function getForFixture(req, res) {
  const homeName = requireStringParam(req.query.home, 'home');
  const awayName = requireStringParam(req.query.away, 'away');
  const date = requireStringParam(req.query.date, 'date');
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;

  const entry = findAnalysisForFixture({ homeName, awayName, league, date });
  const jour = Date.parse(date.slice(0, 10));
  const predictions = listPredictions().filter((p) => {
    if (entry && p.matchId === entry.matchId) return true;
    if (!teamNamesLikelyMatch(p.homeName, homeName) || !teamNamesLikelyMatch(p.awayName, awayName)) return false;
    if (league && p.league && p.league !== league) return false;
    const avance = (jour - Date.parse(String(p.day ?? '').slice(0, 10))) / JOUR_MS;
    return avance >= -1 && avance <= 30;
  });
  // L'expérience de l'IA par type de marché, pour jauger chacun.
  res.json({ entry, predictions, experience: aiMarketExperience() });
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
