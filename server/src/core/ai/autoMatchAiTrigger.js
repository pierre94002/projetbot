/**
 * autoMatchAiTrigger.js — l'analyse IA (avant-match ET après-match) sans
 * intervention, pour TOUS les championnats suivis.
 * -----------------------------------------------------------------------
 * Décision explicite de Pierre le 26/09/2026 (jusqu'à ~180 matchs terminés en
 * un samedi, donc potentiellement 350+ analyses ce jour-là sans plafond) :
 * cf. env.js pour le plafond quotidien qui borne ça. Depuis le 27/09/2026,
 * passe par claudeCodeClient.js (quota d'abonnement) plutôt que l'API
 * Anthropic à la clé — le plafond protège désormais ce quota, plus un coût en
 * dollars.
 *
 * AVANT-MATCH : chaque rencontre à venir sous 48 h, dans n'importe quel
 * championnat suivi (source `odds-api`, qui inclut déjà le repli calendrier
 * pour les championnats sans cote — cf. matchSources.js), sans analyse
 * déjà enregistrée. Triée par coup d'envoi le plus proche : contrairement à
 * l'après-match, une analyse avant-match n'a plus de sens une fois le match
 * commencé, donc les plus urgentes passent en premier si le plafond du jour
 * est atteint avant la fin de la liste.
 *
 * APRÈS-MATCH : chaque rencontre que le magasin FotMob connaît comme
 * terminée (score sûr) depuis moins de 7 jours, qui a une analyse avant-match
 * (sinon rien à comparer — cf. matchAiAnalysisService.runPostMatchAnalysis)
 * sans revue après-match. Le score est lu DIRECTEMENT dans le magasin FotMob
 * (jamais via match-results.json, qui exigerait une saisie manuelle
 * redondante — cf. Historique moteur > Score final).
 * -----------------------------------------------------------------------
 */

import { analyzeMatch } from '../engine/oddsEngine.js';
import { getEngineConfig } from '../engine/engineConfig.js';
import { getTiltState } from '../engine/tiltState.js';
import { getSport } from '../../sports/index.js';
import { listAdaptedMatches } from '../../data/matchSources.js';
import { enrichMatchWithRealAverages } from '../../data/providers/matchEnrichment.js';
import { recentlyFinished } from '../../data/db/matchStatsDb.js';
import { getByMatchId, findPreMatchAnalysisByTeams } from '../../data/repositories/matchAiAnalysisRepository.js';
import { runPreMatchAnalysis, runPostMatchAnalysis, CODE_CLAUDE_CODE_INDISPONIBLE } from './matchAiAnalysisService.js';
import { isClaudeCodeAuthenticated } from './claudeCodeClient.js';

const FENETRE_AVANT_MATCH_MS = 48 * 60 * 60 * 1000;
const FENETRE_APRES_MATCH_JOURS = 7;
/**
 * Pannes de Claude Code d'affilée avant d'arrêter la série : quota de
 * l'abonnement épuisé, jeton expiré ou réseau coupé feraient échouer chacun
 * des (jusqu'à 50) appels restants — jusqu'à 2 min chacun en cas de coupure —
 * en tenant le verrou d'actualisation pendant tout ce temps. Un échec propre
 * à UN match (schéma non respecté, moteur) ne compte pas : il ne doit pas
 * bloquer les suivants.
 */
const PANNES_CONSECUTIVES_MAX = 3;

// Jamais de repli API-Football dans une chaîne automatique (quota payant de
// 100/jour) : une équipe inconnue du magasin garde la base de la ligue.
async function calculerEngineResult(match) {
  const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
  return analyzeMatch(enrichi, getEngineConfig('football'), getTiltState(), getSport('football'));
}

/**
 * @returns {{ ok: number, failed: number, candidates: number, samples: string[], interrompu: boolean }}
 */
async function analyserEnSerie(candidats, limit, analyser, libelle) {
  let ok = 0;
  let failed = 0;
  let pannes = 0;
  let interrompu = false;
  const samples = [];
  for (const candidat of candidats.slice(0, limit)) {
    try {
      await analyser(candidat);
      ok++;
      pannes = 0;
    } catch (error) {
      failed++;
      if (samples.length < 5) samples.push(`${libelle(candidat)} : ${error.message}`);
      if (error.code === CODE_CLAUDE_CODE_INDISPONIBLE && ++pannes >= PANNES_CONSECUTIVES_MAX) {
        interrompu = true;
        break;
      }
    }
  }
  return { ok, failed, candidates: candidats.length, samples, interrompu };
}

const VIDE = { ok: 0, failed: 0, candidates: 0, samples: [], interrompu: false };

export async function runAutoPreMatchAnalyses({ limit }) {
  if (limit <= 0) return VIDE;
  if (!isClaudeCodeAuthenticated()) return { ...VIDE, nonConfigure: true };

  const maintenant = Date.now();
  const candidats = listAdaptedMatches('odds-api', 10000)
    .filter((m) => {
      const coupEnvoi = Date.parse(m.commenceTime ?? '');
      return Number.isFinite(coupEnvoi) && coupEnvoi > maintenant && coupEnvoi - maintenant <= FENETRE_AVANT_MATCH_MS;
    })
    .filter((m) => !getByMatchId(m.matchId))
    .sort((a, b) => Date.parse(a.commenceTime) - Date.parse(b.commenceTime));

  return analyserEnSerie(
    candidats,
    limit,
    async (m) => {
      const engineResult = await calculerEngineResult(m);
      await runPreMatchAnalysis({ matchId: m.matchId, home: m.home, away: m.away, league: m.league, engineResult, sansRepliPayant: true });
    },
    (m) => `${m.home} - ${m.away}`
  );
}

export async function runAutoPostMatchReviews({ limit }) {
  if (limit <= 0) return VIDE;
  if (!isClaudeCodeAuthenticated()) return { ...VIDE, nonConfigure: true };

  const since = new Date(Date.now() - FENETRE_APRES_MATCH_JOURS * 86_400_000).toISOString().slice(0, 10);
  const candidats = [];
  for (const m of recentlyFinished({ since })) {
    const prior = findPreMatchAnalysisByTeams({ homeName: m.homeName, awayName: m.awayName, league: m.league, day: m.date });
    // Date et nom FotMob : l'analyse après-match relit les buts et statistiques du match dans le magasin.
    if (prior) candidats.push({ prior, resultat: { homeGoals: m.homeGoals, awayGoals: m.awayGoals, date: m.date, homeName: m.homeName } });
  }

  return analyserEnSerie(
    candidats,
    limit,
    ({ prior, resultat }) => runPostMatchAnalysis({ matchId: prior.matchId, result: resultat }),
    ({ prior }) => `${prior.homeName} - ${prior.awayName}`
  );
}
