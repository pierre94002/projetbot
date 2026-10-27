/**
 * simulation.controller.js — LA SIMULATION COMPLÈTE vue de l'interface (étape 28 du plan, conception §4.6).
 * -----------------------------------------------------------------------
 *   GET  /api/simulation/etat          les interrupteurs (rangés, et `effectif` : relus avec leurs conditions), les
 *                                      dernières nuits (bilans), le contrôle, le jugement provisoire et ce qui manque
 *                                      aux combinés ;
 *   GET  /api/simulation/saison?league= la fin de saison d'un championnat (dernière nuit complète), la loi affichée et
 *                                      sa phrase, ou { calcule: false, raison } — jamais une coupe ;
 *   GET  /api/simulation/enjeux?du=&au= l'enjeu des rencontres, par identifiants FotMob (les cartes) ;
 *   POST /api/simulation/prix-combine  { legs, cote? } : le prix juste d'un ticket, SERVEUR seulement (analyse fraîche
 *                                      gardée 60 s par match et réglages du moteur ; jamais une simulation) ;
 *   PUT  /api/simulation/affichage     { cle, valeur } : un interrupteur (409 et une phrase pour « combines » ou « tout »
 *                                      tant que le modèle de buts n'est pas en service ou que la preuve n'a pas dit
 *                                      « retenu »). Écrit dans la base (simulation_state) SEULEMENT, jamais dans
 *                                      engine-config.json.
 * Lectures seulement, sauf le clic de l'interrupteur. L'heure de la requête est lue ICI (jamais dans data/simulation).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../../data/db/matchStatsDb.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { getEngineConfig } from '../../core/engine/engineConfig.js';
import { getTiltState } from '../../core/engine/tiltState.js';
import { analyzeMatch } from '../../core/engine/oddsEngine.js';
import { getSport } from '../../sports/index.js';
import { findAdaptedMatch } from '../../data/matchSources.js';
import { enrichMatchWithRealAverages } from '../../data/providers/matchEnrichment.js';
import { empreinteMoteur } from '../../data/enregistreurs/gelPronostics.js';
import { lireEtat, changerAffichage, conditionsDesCombines, affichageEffectif, AFFICHAGES, AffichageRefuse } from '../../data/simulation/etatSimulation.js';
import { saisonDe, enjeuxDu, prixDuCombine, porte1PourLEcran } from '../../data/simulation/simulationRead.js';
import { HORIZON_DE_LA_PREUVE } from '../../data/simulation/reglages.js';
import { CHAMPIONNATS } from '../../data/simulation/simulationSaisonsEnfant.js';
import { lancementDe } from '../../bench/trialsRegistry.js';

/**
 * Le lancement EN COURS de l'étape 28 au registre de la mesure ({ le, version }) : seul un jugement principal de CE
 * lancement ouvre les combinés (conditionsDesCombines). Registre illisible ou étape pas encore lancée : null (fermé).
 */
function lancementCourant() {
  try {
    return lancementDe('28') ?? null;
  } catch {
    return null;
  }
}

/** Une analyse fraîche est gardée 60 s par match et par réglages du moteur (le ticket se recalcule à chaque clic). */
export const GARDE_DE_L_ANALYSE_MS = 60_000;
const SELECTIONS_MAX = 12;
const analyses = new Map();

/** L'analyse fraîche du match d'une sélection (sans repli payant), gardée 60 s. */
async function analyserLaSelection(leg, maintenant) {
  if (typeof leg?.matchId !== 'string' || !leg.matchId) throw new Error('sélection sans identifiant de match');
  const config = getEngineConfig('football');
  const cle = `${leg.matchId}|${empreinteMoteur(config)}`;
  const deja = analyses.get(cle);
  if (deja && maintenant - deja.t < GARDE_DE_L_ANALYSE_MS) return deja.valeur;
  const match = findAdaptedMatch('odds-api', leg.matchId);
  if (!match) throw new Error(`match introuvable (${leg.matchId})`);
  const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
  const analyse = await analyzeMatch(enrichi, config, getTiltState(), getSport('football'), { maintenant });
  const valeur = { analyse, config, match: enrichi };
  analyses.set(cle, { t: maintenant, valeur });
  if (analyses.size > 200) analyses.delete(analyses.keys().next().value);
  return valeur;
}

export function getEtat(req, res) {
  const database = openDb();
  const etat = lireEtat({ database });
  const reglagesEnService = getEngineConfig('football');
  const lancement = lancementCourant();
  // `affichage` : les interrupteurs RANGÉS (le clic de Réglages) ; `effectif` : ce que les écrans montrent vraiment, relu
  // avec les conditions (un interrupteur ouvert sans elles se comporte comme éteint, et `pourquoi` le dit).
  const effectif = affichageEffectif({ database, reglagesEnService, lancement, etat });
  res.json({
    ...etat,
    valeurs: AFFICHAGES,
    effectif: { saisons: effectif.saisons, matchs: effectif.matchs, pourquoi: effectif.pourquoi },
    conditions: conditionsDesCombines({ database, reglagesEnService, lancement }),
    // Les championnats qui ont une fin de saison (jamais une coupe) : l'onglet « Fin de saison » ne paraît que pour eux.
    championnats: CHAMPIONNATS,
    // La porte 1 (la note du passage unique sur 2019-2023), pour Réglages.
    porte1: porte1PourLEcran(),
    horizon: HORIZON_DE_LA_PREUVE
  });
}

export function getSaison(req, res) {
  const league = typeof req.query?.league === 'string' ? req.query.league.trim() : '';
  if (!league) throw new ApiError(400, '« league » : le championnat est requis.');
  res.json(saisonDe(league, { database: openDb(), maintenant: Date.now(), reglagesEnService: getEngineConfig('football') }));
}

export function getEnjeux(req, res) {
  const { du = null, au = null } = req.query ?? {};
  try {
    res.json(enjeuxDu({ du: String(du ?? ''), au: String(au ?? ''), database: openDb(), maintenant: Date.now(), reglagesEnService: getEngineConfig('football') }));
  } catch (error) {
    if (error instanceof RangeError) throw new ApiError(400, error.message);
    throw error;
  }
}

export async function postPrixCombine(req, res) {
  const { legs, cote = null } = req.body ?? {};
  if (!Array.isArray(legs) || legs.length === 0) throw new ApiError(400, 'Au moins une sélection (« legs ») est requise.');
  if (legs.length > SELECTIONS_MAX) throw new ApiError(400, `${SELECTIONS_MAX} sélections au plus.`);
  for (const [i, leg] of legs.entries()) {
    if (!leg || typeof leg !== 'object' || typeof leg.marketId !== 'string' || !leg.marketId) throw new ApiError(400, `Sélection ${i + 1} : « marketId » est requis.`);
    if (leg.params !== undefined && leg.params !== null && (typeof leg.params !== 'object' || Array.isArray(leg.params))) throw new ApiError(400, `Sélection ${i + 1} : « params » doit être un objet.`);
  }
  if (cote !== null && (typeof cote !== 'number' || !Number.isFinite(cote) || cote <= 1)) throw new ApiError(400, '« cote » : la cote du combiné chez le bookmaker, un nombre supérieur à 1.');
  const maintenant = Date.now();
  res.json(await prixDuCombine({ legs, database: openDb(), maintenant, cote, reglagesEnService: getEngineConfig('football'), lancement: lancementCourant, analyser: (leg) => analyserLaSelection(leg, maintenant) }));
}

export function putAffichage(req, res) {
  const { cle, valeur } = req.body ?? {};
  try {
    res.json(changerAffichage(cle, valeur, { database: openDb(), reglagesEnService: getEngineConfig('football'), lancement: lancementCourant() }));
  } catch (error) {
    if (error instanceof AffichageRefuse) throw new ApiError(409, error.message);
    if (error instanceof TypeError) throw new ApiError(400, error.message);
    throw error;
  }
}

/** Pour les essais : vider la garde des analyses. */
export const __testing = { viderLesAnalyses: () => analyses.clear() };
