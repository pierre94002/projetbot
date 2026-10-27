import { analyzeMatch } from '../../core/engine/oddsEngine.js';
import { getEngineConfig } from '../../core/engine/engineConfig.js';
import { getTiltState } from '../../core/engine/tiltState.js';
import { findAdaptedMatch } from '../../data/matchSources.js';
import { enrichMatchWithRealAverages } from '../../data/providers/matchEnrichment.js';
import { fraicheurDuMatch } from '../../data/cotesDeVosBookmakers.js';
import { getSport } from '../../sports/index.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { preparerAVerifierParNoms } from '../../data/controleQuotidien.js';
import { openDb } from '../../data/db/matchStatsDb.js';
import { simulationDuMatch } from '../../data/simulation/simulationRead.js';
import { lancementDe } from '../../bench/trialsRegistry.js';

/**
 * Analyse un match existant d'une source de données, par son identifiant.
 * Tente par défaut d'enrichir le match avec les moyennes réelles de buts
 * des deux équipes (API-Football) ; passer `enrich=false` pour s'en tenir
 * à la baseline de ligue. Les corners, plus coûteux en appels API, restent
 * optionnels via `includeCorners=true`.
 *
 * Étape 7 du plan : l'heure de chaque cote de vos bookmakers, lue dans les
 * archives (data/cotesDeVosBookmakers.js), accompagne le match — une value
 * sur une cote à rafraîchir n'est plus recommandée (core/engine/fraicheurCotes.js).
 */
export async function analyzeMatchById(req, res) {
  const source = req.query.source || 'odds-api';
  const sportId = req.query.sport || 'football';
  const bankroll = Number(req.query.bankroll) || 10000;
  const shouldEnrich = req.query.enrich !== 'false';
  const includeCorners = req.query.includeCorners === 'true';
  const cornersSampleSize = req.query.cornersSampleSize ? Number(req.query.cornersSampleSize) : undefined;

  const match = findAdaptedMatch(source, req.params.matchId, bankroll);
  if (!match) throw new ApiError(404, `Match introuvable : ${req.params.matchId}`);

  const finalMatch = shouldEnrich
    ? await enrichMatchWithRealAverages(match, { includeCorners, cornersSampleSize })
    : match;
  // Le jeu de test (source « sample ») n'a ni relevé ni archive : rien à juger.
  const avecFraicheur = source === 'odds-api' ? { ...finalMatch, fraicheurCotes: fraicheurDuMatch(finalMatch) } : finalMatch;

  const analyse = await analyzeMatch(avecFraicheur, getEngineConfig(sportId), getTiltState(), getSport(sportId));
  const aVerifier = aVerifierDuMatchAnalyse(avecFraicheur);
  // Étape 28 : le bloc de la simulation, APRÈS l'analyse (le verdict n'en sait rien, l'IA ne le reçoit jamais).
  const simulation = sportId === 'football' ? simulationDuMatchAnalyse(avecFraicheur, analyse, getEngineConfig(sportId)) : null;
  res.json({ ...analyse, ...(aVerifier ? { aVerifier } : {}), ...(simulation ? { simulation } : {}) });
}

/**
 * Étape 14 du plan : « à vérifier » — les raisons du contrôle quotidien qui
 * touchent les données de ce match (ses deux clubs, reconnus par leur nom
 * exact dans l'annuaire du magasin — jamais un rapprochement souple —, puis
 * par identifiant ; son championnat ; FotMob en panne…). Toutes familles de marché : chaque raison dit les
 * siennes, l'écran ne la pose que sur les marchés concernés — sauf celles des joueurs (écart de buteurs ou de
 * gardiens) : aucun marché de joueurs n'est affiché ici, donc ni bandeau ni badge. Ajouté APRÈS
 * l'analyse : le verdict du moteur (verdictPari.js) n'en sait rien et ne
 * change pas. Une lecture qui échoue n'empêche jamais l'analyse.
 */
function aVerifierDuMatchAnalyse(match) {
  try {
    const verifier = preparerAVerifierParNoms();
    return verifier({ league: match.league ?? null, date: String(match.commenceTime ?? '').slice(0, 10), homeName: match.home, awayName: match.away, famille: null });
  } catch {
    return null;
  }
}

/**
 * Étape 28 du plan : la simulation de ce match — { affichage, enjeu, deroule } (data/simulation/simulationRead.js) : des
 * lignes rangées la nuit, jamais une simulation dans la requête. Ajouté APRÈS l'analyse, comme « à vérifier » : le
 * verdict du moteur n'en sait rien, l'analyse IA ne le reçoit jamais (elle prend des champs nommés du moteur). Une
 * lecture qui échoue n'empêche jamais l'analyse.
 */
function simulationDuMatchAnalyse(match, analyse, config) {
  try {
    // Le lancement de l'étape 28 au registre de la mesure : lu seulement si l'interrupteur des matchs est ouvert (ses
    // conditions sont relues à chaque lecture : un « tout » resté ouvert sans elles se comporte comme éteint).
    return simulationDuMatch({ match, analyse, config, database: openDb(), maintenant: Date.now(), reglagesEnService: config, lancement: () => lancementDe('28') ?? null });
  } catch {
    return null;
  }
}
