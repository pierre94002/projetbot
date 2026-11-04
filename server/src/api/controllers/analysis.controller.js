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
import { contexteDuMatch } from '../../data/contexte/contexteRead.js';

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
  // Étape 32 : le contexte du match, APRÈS l'analyse lui aussi (le verdict n'en sait rien, l'IA ne le reçoit jamais).
  const contexte = sportId === 'football' ? contexteDuMatchAnalyse(avecFraicheur) : null;
  // Étape 33 : les cartons attendus à blanc, APRÈS l'analyse eux aussi (le verdict n'en sait rien, l'IA ne les reçoit jamais).
  const cartons = sportId === 'football' ? await cartonsDuMatchAnalyse(avecFraicheur, analyse) : null;
  // Étape 34 : les chiffres des joueurs à blanc, APRÈS l'analyse eux aussi (le verdict n'en sait rien, l'IA ne les reçoit jamais).
  const joueurs = sportId === 'football' ? await joueursDuMatchAnalyse(avecFraicheur) : null;
  res.json({ ...analyse, ...(aVerifier ? { aVerifier } : {}), ...(simulation ? { simulation } : {}), ...(contexte ? { contexte } : {}), ...(cartons ? { cartons } : {}), ...(joueurs ? { joueurs } : {}) });
}

/**
 * Étape 34 du plan (lot 1b) : les chiffres à blanc des joueurs de ce match (data/joueurs/joueursRead.js) — les tables de la
 * nuit et la compo lues par identifiants FotMob et par clé (jamais une passe dans la requête), la formule pure et les
 * paramètres de la note du banc. Le module est chargé par un import() DYNAMIQUE : une erreur dans data/joueurs/ n'empêche
 * jamais l'analyse de répondre (l'onglet dit alors « illisible »). Ajouté APRÈS l'analyse, comme les cartons : le verdict
 * du moteur n'en sait rien, l'analyse IA ne le reçoit jamais.
 */
async function joueursDuMatchAnalyse(match) {
  try {
    const { joueursDuMatch } = await import('../../data/joueurs/joueursRead.js');
    return joueursDuMatch({ match, database: openDb(), maintenant: Date.now() });
  } catch {
    return { version: 1, etat: 'illisible', raison: 'lecture-ratee' };
  }
}

/**
 * Étape 33 du plan (lot 1b) : les cartons attendus de ce match, à blanc (data/cartons/cartonsRead.js) — les tables de la
 * nuit lues par identifiants FotMob et par clé (jamais une passe dans la requête), la formule pure et les paramètres de
 * la note du banc ; corners et tirs avec les réglages par championnat, en nombres. Le module est chargé par un import()
 * DYNAMIQUE : une erreur dans data/cartons/ n'empêche jamais l'analyse de répondre (l'encadré dit alors « illisible »).
 * Ajouté APRÈS l'analyse, comme le contexte : le verdict du moteur n'en sait rien, l'analyse IA ne le reçoit jamais.
 */
async function cartonsDuMatchAnalyse(match, analyse) {
  try {
    const { cartonsDuMatch } = await import('../../data/cartons/cartonsRead.js');
    return cartonsDuMatch({ match, analyse, database: openDb() });
  } catch {
    return { version: 1, etat: 'illisible', raison: 'lecture-ratee' };
  }
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

/**
 * Étape 32 du plan : le contexte de ce match (data/contexte/contexteRead.js) — la fiche calculée la nuit, lue par
 * identifiants FotMob et par clé (jamais une passe dans la requête), les statuts du banc d'essai (la note recopiée par
 * script), les moyennes du championnat pour la phrase de l'arbitre. Ajouté APRÈS l'analyse, comme la simulation : le
 * verdict du moteur n'en sait rien, l'analyse IA ne le reçoit jamais (elle prend des champs nommés du moteur). Une
 * lecture qui échoue n'empêche jamais l'analyse : l'encadré dit alors « illisible ».
 */
function contexteDuMatchAnalyse(match) {
  try {
    return contexteDuMatch({ match, database: openDb(), maintenant: Date.now(), lancement: () => lancementDe('32') ?? null });
  } catch {
    return { version: 1, etat: 'illisible', raison: 'lecture-ratee' };
  }
}
