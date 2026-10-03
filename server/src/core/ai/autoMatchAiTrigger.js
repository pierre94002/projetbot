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
import { recentlyFinished, openDb } from '../../data/db/matchStatsDb.js';
import { clubDuMagasin } from '../../data/db/oddsProfileRead.js';
import { fetchMatchesByDate } from '../../data/providers/fotMobProvider.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { getByMatchId, findPreMatchAnalysisByTeams } from '../../data/repositories/matchAiAnalysisRepository.js';
import { enregistrerUsage, jourParis, finDuJourParis } from '../../data/repositories/autoAiAnalysisRepository.js';
import { buildLineupContext, derniereCompositionConnue, signatureDesOnzes } from '../../data/providers/lineupContext.js';
import { runPreMatchAnalysis, runPostMatchAnalysis, CODE_CLAUDE_CODE_INDISPONIBLE } from './matchAiAnalysisService.js';
import { isClaudeCodeAuthenticated } from './claudeCodeClient.js';

const FENETRE_AVANT_MATCH_MS = 48 * 60 * 60 * 1000;
/**
 * Pas d'analyse « d'avance » pour un match qui commence dans moins de 3 h :
 * celle d'avant coup d'envoi le couvrira, avec la composition.
 */
const AVANCE_MIN_MS = 3 * 60 * 60 * 1000;

/**
 * ANALYSE D'AVANT COUP D'ENVOI (demande de Pierre le 01/10/2026 : « tous les
 * matchs, avant qu'ils commencent, une analyse et la composition d'équipe qui
 * va jouer, avec toutes les bonnes actualités ») : dès que FotMob publie la
 * composition à moins de 55 min du coup d'envoi — les officielles sortent en
 * général une heure avant —, sinon sans elle à 30 min, jamais à moins de
 * 3 min (une analyse prend 15 à 30 s, une passe en enchaîne plusieurs).
 */
const COUP_D_ENVOI_FENETRE_MIN = 55;
const COUP_D_ENVOI_SANS_COMPO_MIN = 30;
const COUP_D_ENVOI_TROP_TARD_MIN = 3;
/**
 * Composition changée après l'analyse (une prévision remplacée par
 * l'officielle) : l'analyse est refaite, une seule fois par match.
 */
const KICKOFF_RUNS_MAX = 2;
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
      return Number.isFinite(coupEnvoi) && coupEnvoi - maintenant > AVANCE_MIN_MS && coupEnvoi - maintenant <= FENETRE_AVANT_MATCH_MS;
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

const normaliser = (nom) =>
  String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const isoJour = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Les matchs suivis avec leur VRAI coup d'envoi. Un match coté porte celui de
 * The Odds API ; un match du calendrier ne connaît que son jour — l'adaptateur
 * le date à midi UTC (cf. seasonCalendarAdapter.js), et « une heure avant »
 * tomberait alors à 13 h pour un match joué à 20 h 45 : son heure vient de la
 * liste du jour FotMob (la même que lit la boucle des compositions). Un match
 * du calendrier introuvable chez FotMob n'a pas d'heure sûre : il est laissé
 * de côté ici (l'analyse d'avance le couvre).
 *
 * @returns {Promise<Array<{ m: object, kickoff: number, fotmobMatchId: string|null }>>}
 */
async function matchsAvecCoupDEnvoi(maintenant = Date.now()) {
  const jours = [isoJour(maintenant), isoJour(maintenant + 86_400_000)];
  const fotmob = (await Promise.all(jours.map((j) => fetchMatchesByDate(j).catch(() => []))))
    .flat()
    .filter((f) => f.kickoff && !f.started && !f.finished && !f.cancelled);
  const parDomicile = new Map();
  for (const f of fotmob) {
    const cle = normaliser(f.homeName);
    if (!parDomicile.has(cle)) parDomicile.set(cle, []);
    parDomicile.get(cle).push(f);
  }

  const database = openDb();
  const resultat = [];
  for (const m of listAdaptedMatches('odds-api', 10000)) {
    if (!String(m.matchId ?? '').startsWith('cal-')) {
      const t = Date.parse(m.commenceTime ?? '');
      if (Number.isFinite(t) && t > maintenant) resultat.push({ m, kickoff: t, fotmobMatchId: null });
      continue;
    }
    const jourCalendrier = String(m.commenceTime ?? '').slice(0, 10);
    if (!jours.includes(jourCalendrier) && !jours.includes(isoJour(Date.parse(`${jourCalendrier}T12:00:00Z`) + 86_400_000))) continue;
    // Le même jour à un près (la liste FotMob est par jour UTC, le calendrier par jour local).
    const procheEnDate = (f) => Math.abs(Date.parse(f.kickoff) - Date.parse(`${jourCalendrier}T12:00:00Z`)) <= 36 * 3_600_000;
    let f = (parDomicile.get(normaliser(m.home)) ?? []).find((x) => procheEnDate(x) && normaliser(x.awayName) === normaliser(m.away));
    if (!f) {
      const clubId = clubDuMagasin(m.home, m.league ?? null, database);
      f = fotmob.find((x) => procheEnDate(x) && ((clubId && x.homeId === clubId) || teamNamesLikelyMatch(x.homeName, m.home)) && teamNamesLikelyMatch(x.awayName, m.away));
    }
    if (!f) continue;
    const kickoff = Date.parse(f.kickoff);
    resultat.push({ m: { ...m, commenceTime: new Date(kickoff).toISOString() }, kickoff, fotmobMatchId: f.matchId });
  }
  return resultat;
}

/** Les matchs dans la fenêtre d'avant coup d'envoi, du plus proche au plus lointain. */
async function matchsAuCoupDEnvoi(maintenant = Date.now()) {
  return (await matchsAvecCoupDEnvoi(maintenant))
    .map((c) => ({ ...c, minutes: (c.kickoff - maintenant) / 60_000 }))
    .filter(({ minutes }) => minutes > COUP_D_ENVOI_TROP_TARD_MIN && minutes <= COUP_D_ENVOI_FENETRE_MIN)
    .sort((a, b) => a.minutes - b.minutes);
}

/**
 * Une analyse d'avant coup d'envoi ne compte que faite dans l'heure qui
 * précède le VRAI coup d'envoi : une analyse lancée sur l'heure fictive d'un
 * match du calendrier (midi UTC, version du 01/10/2026 avant correction) doit
 * être refaite au bon moment.
 */
function faiteAuCoupDEnvoi(entree, kickoffMs) {
  if (entree?.timing !== 'coup-d-envoi') return false;
  return kickoffMs - Date.parse(entree.analysedAt ?? 0) <= (COUP_D_ENVOI_FENETRE_MIN + 15) * 60_000;
}

/** La composition a-t-elle changé depuis l'analyse ? (relue par la boucle des compositions, sans appel réseau) */
function compositionChangee(entree) {
  const instantane = entree.lineupSnapshot;
  if (!instantane || (entree.kickoffRuns ?? 1) >= KICKOFF_RUNS_MAX) return false;
  const derniere = derniereCompositionConnue(instantane.fotmobMatchId);
  if (!derniere?.fetchedAt || Date.parse(derniere.fetchedAt) <= Date.parse(entree.analysedAt ?? 0)) return false;
  return derniere.signature !== signatureDesOnzes(instantane);
}

/**
 * Une passe d'avant coup d'envoi (cf. jobs/kickoffAiAnalysis.js, toutes les
 * 5 min). Chaque analyse réussie est comptée sur le plafond du jour aussitôt
 * faite, pas en fin de passe : l'actualisation complète peut tourner en même
 * temps et doit lire le vrai reste.
 *
 * @returns {{ ok, failed, candidates, enAttente, avecCompo, reprises, laisses, samples, interrompu }}
 */
export async function runKickoffPreMatchAnalyses({ limit }) {
  const bilan = { ok: 0, failed: 0, candidates: 0, enAttente: 0, avecCompo: 0, reprises: 0, laisses: 0, samples: [], interrompu: false };
  if (!isClaudeCodeAuthenticated()) return { ...bilan, nonConfigure: true };

  const aFaire = [];
  for (const { m, minutes, fotmobMatchId, kickoff } of await matchsAuCoupDEnvoi()) {
    const entree = getByMatchId(m.matchId);
    if (faiteAuCoupDEnvoi(entree, kickoff)) {
      if (compositionChangee(entree)) aFaire.push({ m, minutes, fotmobMatchId, reprise: true });
      continue;
    }
    aFaire.push({ m, minutes, fotmobMatchId, reprise: false });
  }
  bilan.candidates = aFaire.length;

  let pannes = 0;
  for (const { m, minutes, fotmobMatchId, reprise } of aFaire) {
    if (bilan.ok + bilan.failed >= limit) {
      // Plafond du jour atteint : compté une seule fois par match, à sa
      // dernière passe avant le coup d'envoi (la boucle repasse toutes les 5 min).
      if (minutes <= COUP_D_ENVOI_TROP_TARD_MIN + 5) bilan.laisses++;
      continue;
    }
    const lineups = await buildLineupContext({ homeName: m.home, awayName: m.away, commenceTimeIso: m.commenceTime, league: m.league, fotmobMatchId });
    // Une reprise sans composition relue ne remplace pas une analyse qui en avait une.
    if (reprise && !lineups) continue;
    // Pas encore de composition : on l'attend jusqu'à 30 min du coup d'envoi.
    if (!lineups && minutes > COUP_D_ENVOI_SANS_COMPO_MIN) {
      bilan.enAttente++;
      continue;
    }
    try {
      const engineResult = await calculerEngineResult(m);
      await runPreMatchAnalysis({
        matchId: m.matchId,
        home: m.home,
        away: m.away,
        league: m.league,
        engineResult,
        sansRepliPayant: true,
        lineups,
        timing: 'coup-d-envoi'
      });
      enregistrerUsage(jourParis(), { preMatch: 1 });
      bilan.ok++;
      if (lineups) bilan.avecCompo++;
      if (reprise) bilan.reprises++;
      pannes = 0;
    } catch (error) {
      bilan.failed++;
      if (bilan.samples.length < 5) bilan.samples.push(`${m.home} - ${m.away} : ${error.message}`);
      if (error.code === CODE_CLAUDE_CODE_INDISPONIBLE && ++pannes >= PANNES_CONSECUTIVES_MAX) {
        bilan.interrompu = true;
        break;
      }
    }
  }
  if (bilan.laisses) enregistrerUsage(jourParis(), { skippedPreMatch: bilan.laisses });
  return bilan;
}

/**
 * Combien d'analyses d'avant coup d'envoi restent à faire AUJOURD'HUI (heure
 * de Paris) : l'actualisation complète les met de côté sur le plafond du jour
 * avant de lancer les analyses d'avance ou les revues après-match, qui
 * peuvent attendre — celle-ci non.
 */
export async function reserveCoupDEnvoi(maintenant = Date.now()) {
  const fin = finDuJourParis(maintenant);
  return (await matchsAvecCoupDEnvoi(maintenant)).filter(({ m, kickoff }) => {
    if (kickoff <= maintenant + COUP_D_ENVOI_TROP_TARD_MIN * 60_000) return false;
    if (kickoff - COUP_D_ENVOI_FENETRE_MIN * 60_000 >= fin) return false;
    return !faiteAuCoupDEnvoi(getByMatchId(m.matchId), kickoff);
  }).length;
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
