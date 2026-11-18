import { runPreMatchAnalysis, runPostMatchAnalysis } from '../../core/ai/matchAiAnalysisService.js';
import { isClaudeCodeAuthenticated } from '../../core/ai/claudeCodeClient.js';
import { getByMatchId, listAll, findAnalysisForFixture, aiMarketExperience } from '../../data/repositories/matchAiAnalysisRepository.js';
import { listPredictions } from '../../data/repositories/predictionsRepository.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { requireStringParam } from '../middlewares/errorHandler.js';
import { carnetPourLaRoute } from '../../data/aiScorecard.js';
// Lot 0 (masque des buts, data/masqueDesButs.js) : les entrées d'un match qui commence à `depuis` ou après, sans les
// buts ; l'expérience sans les types de buts. Ce qui a été vu avant reste tel quel.
import { entreeIaSansLesButs, experienceSansLesButs, pronosticsSansLesButs, masqueEnService } from '../../data/masqueDesButs.js';

const JOUR_MS = 86_400_000;

/** Claude Code (headless) connecté sur ce poste — remplace la clé API pour l'analyse par match, cf. claudeCodeClient.js. */
export async function getStatus(req, res) {
  res.json({ connected: await isClaudeCodeAuthenticated() });
}

export function getForMatch(req, res) {
  res.json({ entry: entreeIaSansLesButs(getByMatchId(req.params.matchId) ?? null) });
}

/**
 * Onglet « Analyse IA » de la page de match : l'analyse avant et après-match,
 * et les pronostics du moteur sur nos marchés avec leur verdict. La page ne
 * connaît que les équipes, la compétition et la date ; les pronostics se
 * retrouvent par l'identifiant de cotes de l'analyse, ou, sans analyse, par
 * l'affiche relevée dans le mois qui précède.
 *
 * Étape 40 (lot 1b, 17/11/2026) : avec `matchKey` (la clé de la rencontre au magasin, page d'un match joué), la réponse porte
 * aussi `fiche` — ce que le match a donné et l'issue de chaque pronostic (juste, faux, non réglable et sa raison), lue par
 * data/fiche/ficheApresMatch.js, chargé à la demande : une panne de ce module ne casse jamais l'onglet (`fiche.etat` = « panne »).
 * Sans `matchKey`, la réponse est celle d'avant, à l'identique.
 */
export async function getForFixture(req, res) {
  const homeName = requireStringParam(req.query.home, 'home');
  const awayName = requireStringParam(req.query.away, 'away');
  const date = requireStringParam(req.query.date, 'date');
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;
  const matchKey = typeof req.query.matchKey === 'string' && req.query.matchKey.trim() ? req.query.matchKey.trim() : null;

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
  if (!matchKey) {
    res.json({ entry: entreeIaSansLesButs(entry), predictions: pronosticsSansLesButs(predictions, entry?.commenceTime ?? date), experience: experienceSansLesButs(aiMarketExperience()) });
    return;
  }
  const corps = { entry: entreeIaSansLesButs(entry), predictions: pronosticsSansLesButs(predictions, entry?.commenceTime ?? date), experience: experienceSansLesButs(aiMarketExperience()) };
  corps.fiche = await ficheDeLaPage({ matchKey, entree: corps.entry, commenceTime: entry?.commenceTime ?? date });
  res.json(corps);
}

/**
 * La fiche d'après-match de la page (étape 40, lot 1b) : le module chargé par `import()` (hors du chemin de nuit), puis le masque
 * des buts appliqué à ses pronostics gelés comme au journal (un match qui commence à son `depuis` ou après). Toute panne
 * devient une fiche « panne » qui le dit : l'analyse de l'IA, les pronostics et l'expérience restent.
 */
async function ficheDeLaPage({ matchKey, entree, commenceTime }) {
  try {
    const { ficheDuMatchJoue } = await import('../../data/fiche/ficheApresMatch.js');
    const fiche = ficheDuMatchJoue({ matchKey, entry: entree });
    const gardes = pronosticsSansLesButs(fiche.pronostics, fiche.coupDEnvoi ?? commenceTime);
    if (gardes.length === fiche.pronostics.length) return fiche;
    return { ...fiche, pronostics: gardes, butsCaches: masqueEnService()?.phrase ?? null };
  } catch (e) {
    const raison = String(e?.message ?? e).replace(/[.\s]+$/, '');
    return { etat: 'panne', matchKey, message: `La fiche d’après-match n’a pas pu être lue (${raison}) : l’analyse de l’IA reste affichée, sans le vert ni le rouge du magasin.`, reel: null, pronostics: [], avis: [] };
  }
}

/** Pour les badges "analyse IA disponible" dans les listes Matchs/Historique moteur — un seul appel plutôt qu'un par match visible. */
export function getAll(req, res) {
  res.json({ entries: listAll().map((e) => entreeIaSansLesButs(e)) });
}

// Un clic de Pierre : noté « manuel » au journal des appels (étape 4), jamais
// compté sur le plafond des analyses automatiques, jamais bloqué par le mode économe.
export async function postPreMatch(req, res) {
  const { home, away, league, engineResult } = req.body ?? {};
  const result = await runPreMatchAnalysis({ matchId: req.params.matchId, home, away, league, engineResult, appel: { type: 'manuel', detail: 'avant-match' } });
  res.status(201).json(entreeIaSansLesButs(result));
}

export async function postPostMatch(req, res) {
  const result = await runPostMatchAnalysis({ matchId: req.params.matchId, appel: { type: 'manuel', detail: 'après-match' } });
  res.status(201).json(entreeIaSansLesButs(result));
}

/**
 * Étape 21 du plan : le CARNET DE NOTES DE L'IA, tel que l'actualisation l'a écrit cette nuit
 * (data/runtime/carnet-ia.json) — LECTURE SEULE, rien n'est recalculé ici. Pas encore calculé : 200 avec
 * `carnet: null` (l'écran garde toute sa structure et le dit). Illisible : 503, jamais pris pour vide.
 */
export function getScorecard(req, res) {
  const r = carnetPourLaRoute();
  if (r.etat === 'illisible') {
    res.status(503).json({ ...r, error: `Carnet de l’IA illisible pour l’instant : ${r.erreur ?? 'fichier illisible'}. Il sera refait à la prochaine actualisation.` });
    return;
  }
  res.json(r);
}
