import { callClaudeCode, isClaudeCodeAuthenticated, ClaudeCodeIndisponible } from './claudeCodeClient.js';
import {
  buildPreMatchAnalysisRequest,
  buildPostMatchReviewRequest,
  buildPreMatchAnalysisRequestCompacte,
  buildPostMatchReviewRequestCompacte,
  SUBMIT_PRE_MATCH_ANALYSIS_TOOL,
  SUBMIT_POST_MATCH_REVIEW_TOOL
} from './matchAiAnalysisPrompt.js';
import { FICHES, formeDeLaFiche, marchesPourIA, cleMarche, rattacherAuxMarches } from './compactContext.js';
import { lireDeroule } from './derouleDuMatch.js';
import { commentaireDuMatch } from '../../data/providers/fotMobCommentaire.js';
import { env } from '../../config/env.js';
import { getStandingsByLeagueLabel } from '../../data/providers/standingsService.js';
import { resolveAverageStatsByName, resolveTeamFormByName } from '../../data/providers/matchEnrichment.js';
import { DEFAULT_FORM_SAMPLE_SIZE } from '../../data/providers/teamStatsService.js';
import { resolveFlashscoreStatsByName } from '../../data/providers/flashscoreEnrichment.js';
import { resolveHistoricalStatsByName, resolveHistoricalFormByName, resolveHistoricalStandingRow } from '../../data/providers/historicalMatchesProvider.js';
import { getTeamProfile } from '../../data/repositories/teamProfileRepository.js';
import { getMatchNote } from '../../data/repositories/matchNotesRepository.js';
import { resolveTeamNews } from '../../data/providers/teamNewsResolver.js';
import { getByMatchId, savePreMatchAnalysis, savePostMatchReview, aiMarketExperience, avisTenu, typeDeMarche, TYPES_DE_MARCHE } from '../../data/repositories/matchAiAnalysisRepository.js';
import { lireLesMarchesCoupes } from '../../data/aiScorecard.js';
import { memoireDuMatch } from '../../data/aiDossiers.js';
import { createResultLookup } from '../../data/repositories/matchResultsRepository.js';
import { listPredictions } from '../../data/repositories/predictionsRepository.js';
import { matchDetailsFromStore } from '../../data/db/matchStatsRead.js';
import { deriveActualOutcome } from '../settlement/settlementRules.js';
import { resolveCurrentSeason } from '../../data/providers/leagueRegistry.js';
import { findBestTeamNameMatch } from '../../utils/teamNameMatch.js';
import { enregistrerSansPerdre } from '../../utils/atomicJson.js';
import { listTeamMatchStats } from '../../data/repositories/matchStatsWebRepository.js';
import { compositionPourAnalyseIA } from '../../data/providers/lineupContext.js';
import { DomainError } from '../errors.js';

// Même sous-ensemble ciblé que l'audit par lot (aiDatasetBuilder.js), pour
// limiter la taille du prompt — pas les 34 champs, seulement les plus
// parlants pour situer une équipe (attaque, possession, xG, corners).
const CURATED_STAT_FIELDS = ['Shots on Goal', 'Total Shots', 'Ball Possession', 'expected_goals', 'Corner Kicks'];

function pickCuratedStats(averages) {
  if (!averages) return null;
  const picked = {};
  for (const field of CURATED_STAT_FIELDS) if (averages[field] !== undefined) picked[field] = averages[field];
  return Object.keys(picked).length ? picked : null;
}

// Les libellés The Odds API ("Tottenham Hotspur", "Paris Saint Germain")
// diffèrent souvent des classements web ("Tottenham", "PSG") : même
// résolution floue que les autres sources, égalité exacte d'abord.
function findStandingRow(standings, teamName) {
  return findBestTeamNameMatch(teamName, standings?.rows ?? [], (row) => row.teamName);
}

// La forme : celle du magasin (FotMob, saison en cours) avec chaque match
// — date, adversaire, lieu, score —, la référence ; celle d'API-Football
// (repli d'un clic, jamais en automatique) porte la saison du plan (2024),
// et l'IA, voyant des dates de 2026 sous « 2024 », les croyait incohérentes.
function describeForm(form) {
  if (!form) return null;
  if (form.source === 'store') {
    return {
      source: 'FotMob (magasin)',
      matches: form.form.matches.map((m) => ({
        date: typeof m.date === 'string' ? m.date.slice(0, 10) : null,
        opponent: m.opponent,
        venue: m.home ? 'domicile' : 'extérieur',
        score: m.score,
        result: m.result
      })),
      sampleSize: form.form.sampleSize
    };
  }
  return {
    source: 'API-Football',
    season: resolveCurrentSeason(),
    results: form.form.matches.map((m) => m.result),
    dates: form.form.matches.map((m) => (typeof m.date === 'string' ? m.date.slice(0, 10) : null)),
    sampleSize: form.form.sampleSize
  };
}

// Statistiques d'équipe lues par l'IA (01/10/2026, Pierre : « il faut que
// l'IA analyse les formes des équipes, les statistiques et les moyennes ») :
// ce que l'équipe produit ET ce qu'elle concède, par match.
const STATS_POUR_IA = [
  ['expected_goals', 'xg', 2],
  ['Total Shots', 'shots', 1],
  ['Shots on Goal', 'shotsOnTarget', 1],
  ['big_chances', 'bigChances', 1],
  ['Corner Kicks', 'corners', 1],
  ['Ball Possession', 'possession', 1],
  ['Yellow Cards', 'yellowCards', 1]
];

const nombreStat = (v) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Les moyennes d'une équipe sur ses 10 derniers matchs du magasin (FotMob,
 * toutes compétitions), puis sur ceux joués au lieu de CE match (à domicile
 * pour l'équipe qui reçoit, à l'extérieur pour l'autre) : buts marqués et
 * encaissés, puis, pour l'équipe (`for`) et ses adversaires (`against`),
 * xG, tirs, tirs cadrés, grosses occasions, corners, possession, cartons.
 * Une statistique à zéro pour les deux équipes d'un match n'a pas été
 * relevée : elle ne compte pas. `null` si le magasin ne connaît pas l'équipe.
 */
function moyennesPourIA(teamName, league, venue) {
  let matchs;
  try {
    matchs = listTeamMatchStats(teamName, { limit: 10, league }).filter((m) => m.score);
  } catch {
    return null;
  }
  if (!matchs.length) return null;
  const moyenne = (valeurs, decimales) => {
    const ok = valeurs.filter((v) => v !== null);
    return ok.length ? Number((ok.reduce((s, v) => s + v, 0) / ok.length).toFixed(decimales)) : null;
  };
  const camp = (liste, i) =>
    Object.fromEntries(
      STATS_POUR_IA.map(([cle, nom, decimales]) => {
        const valeurs = liste.map((m) => {
          const a = nombreStat(m.teams[0]?.stats?.[cle]);
          const b = nombreStat(m.teams[1]?.stats?.[cle]);
          if (a === null || b === null || (a === 0 && b === 0)) return null;
          return i === 0 ? a : b;
        });
        return [nom, moyenne(valeurs, decimales)];
      }).filter(([, v]) => v !== null)
    );
  const bloc = (liste) => {
    if (!liste.length) return null;
    const buts = (m, i) => Number(String(m.score).split('-')[i]);
    return {
      matches: liste.length,
      results: liste.map((m) => m.result).join(''),
      goalsFor: moyenne(liste.map((m) => buts(m, 0)), 2),
      goalsAgainst: moyenne(liste.map((m) => buts(m, 1)), 2),
      for: camp(liste, 0),
      against: camp(liste, 1)
    };
  };
  const auLieu = matchs.filter((m) => m.home === (venue === 'home'));
  return {
    source: 'FotMob (magasin)',
    from: matchs.at(-1).date,
    to: matchs[0].date,
    last10: bloc(matchs),
    [venue === 'home' ? 'atHome' : 'away']: bloc(auLieu)
  };
}

// Filet de sécurité : de rares réponses laissent fuiter des fragments de
// balises façon ancien format de function-calling texte (ex. "</caveats>
// </invoke>") au lieu de s'en tenir uniquement au JSON de l'outil natif —
// retiré ici plutôt que d'afficher ce bruit tel quel dans l'UI. Un texte de
// match légitime ne contient jamais de séquence "<...>" , donc aucun risque
// de retirer du contenu valide.
function stripLeakedTags(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/<\/?[a-zA-Z_][\w:-]*(?:\s+[^<>]*)?>/g, '').trim();
}

function sanitizeToolInput(input) {
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      sanitized[key] = stripLeakedTags(value);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item && typeof item === 'object'
          ? Object.fromEntries(Object.entries(item).map(([k, v]) => [k, stripLeakedTags(v)]))
          : stripLeakedTags(item)
      );
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Le résumé chiffré du moteur. Sans option : celui qu'on GARDE avec l'analyse (engineSnapshot : le relevé
 * complet du moteur, que la revue d'après-match et l'écran relisent) et celui de l'ancienne forme de la fiche.
 *
 * `sansApport` (étape 21, le carnet de l'IA ; partage décidé avec l'étape 41 : la 41 compacte, la 21 filtre) :
 * les types de marché où l'IA, sur assez de matchs, ne fait pas mieux que le moteur seul
 * (data/aiScorecard.js). Seule la FICHE COMPACTE reçoit ce résumé filtré : ces marchés ne sont plus dans
 * la liste qu'on lui donne à commenter. L'ancienne forme et l'engineSnapshot ne sont jamais filtrés.
 */
function curateEngineSummary(engineResult, { sansApport = null } = {}) {
  const resume = resumeDuMoteur(engineResult);
  if (!(sansApport instanceof Set) || !sansApport.size) return resume;
  return { ...resume, marketPredictions: resume.marketPredictions.filter((m) => !sansApport.has(typeDeMarche(m))) };
}

function resumeDuMoteur(engineResult) {
  return {
    label: engineResult.label ?? null,
    expectedGoals: engineResult.expectedGoals ?? null,
    trueOdds: { home: engineResult.trueOdds?.home, draw: engineResult.trueOdds?.draw, away: engineResult.trueOdds?.away },
    market: { odds1: engineResult.market?.odds1, oddsDraw: engineResult.market?.oddsDraw, odds2: engineResult.market?.odds2 },
    edgePercent: engineResult.edgePercent ?? null,
    staking: engineResult.staking ?? null,
    // Corners, tirs et tirs cadrés attendus de chaque équipe (cf. sports/football/statMarkets.js).
    statExpectations: engineResult.statExpectations ?? null,
    // Le pronostic du moteur sur CHAQUE marché joué (cf. sports/football/markets.js) :
    // l'IA donne un avis sur chacun, et la revue après-match les reprend.
    marketPredictions: (engineResult.marketPredictions ?? []).map(({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds, minOdds }) => ({
      marketId,
      params,
      market,
      predictedOutcome,
      predictedLabel,
      predictedOdds,
      // Le pourcentage affiché à côté du pronostic (1 / cote juste), que
      // l'IA explique en une phrase (demande de Pierre le 01/10/2026).
      probability: Number(predictedOdds) > 1 ? Math.round(100 / Number(predictedOdds)) : null,
      minOdds: minOdds ?? null
    }))
  };
}

/**
 * Étape 25 du plan : le résumé du moteur GARDÉ avec l'analyse (engineSnapshot) porte le numéro de la
 * version du moteur qui l'a calculé (engineVersion de analyzeMatch), quand il est connu. Ce numéro
 * n'est JAMAIS envoyé à l'IA (pourIA) : il ne lui apprend rien, et il changerait le message qu'elle
 * relit depuis sa mémoire cache (l'ancienne fiche doit revenir à l'octet).
 */
function avecLaVersion(engineSummary, engineResult) {
  const v = engineResult?.engineVersion;
  return Number.isInteger(v) && v >= 1 ? { ...engineSummary, engineVersion: v } : engineSummary;
}

/** Le résumé du moteur tel que l'IA le lit : sans le numéro de version du moteur (étape 25). */
function pourIA(engineSnapshot) {
  if (!engineSnapshot || typeof engineSnapshot !== 'object') return engineSnapshot;
  const { engineVersion, ...resume } = engineSnapshot;
  return resume;
}

// Le rattachement des avis et des bilans de l'IA aux marchés du moteur
// (libellé, puis libellé souple, puis position, puis pronostic recopié) vit
// dans compactContext.js depuis l'étape 41 : fonctions pures, testées seules.
export { cleMarche, rattacherAuxMarches };

/**
 * Pronostics du moteur sur chaque marché pour une analyse enregistrée : ceux
 * figés avec elle, ou, pour une analyse antérieure à ce figeage, ceux du
 * journal des pronostics sous le même identifiant de match.
 */
function pronosticsDeMarches(prior) {
  const figes = prior.engineSnapshot?.marketPredictions;
  if (Array.isArray(figes) && figes.length) return figes;
  try {
    return listPredictions()
      .filter((p) => p.matchId === prior.matchId)
      .map(({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds }) => ({ marketId, params, market, predictedOutcome, predictedLabel, predictedOdds }));
  } catch {
    return [];
  }
}

/**
 * Issue réelle de chaque marché (mêmes règles que le règlement des
 * pronostics) et, si l'IA avait donné un avis avant le match, s'il a tenu :
 * confirmer un pronostic juste ou contredire un pronostic faux, c'est avoir
 * eu raison. Calculé ici, jamais laissé à l'IA : son expérience se compte
 * sur des faits.
 */
function issuesDesMarches(prior, pronostics, result, stats = null) {
  const avisParMarche = rattacherAuxMarches(prior.analysis?.marketViews ?? [], pronostics);
  return pronostics.map((p, i) => {
    const reel = deriveActualOutcome({ ...p, homeName: prior.homeName, awayName: prior.awayName }, result.homeGoals, result.awayGoals, stats);
    const juste = reel === null ? null : reel === p.predictedOutcome;
    const avis = avisParMarche[i];
    // La règle de l'avis tenu, écrite une fois (matchAiAnalysisRepository.js) : le carnet de l'IA (étape 21) compte de même.
    const aiWasRight = avis ? avisTenu(avis.verdict, juste) : null;
    return {
      market: p.market,
      marketId: p.marketId ?? null,
      pick: p.predictedLabel,
      // Plancher de cote sous lequel le pronostic a été choisi (absent avant la règle du 30/09/2026).
      minOdds: p.minOdds ?? null,
      outcome: juste === null ? 'indéterminé' : juste ? 'juste' : 'faux',
      aiVerdict: avis?.verdict ?? null,
      aiConfidence: avis?.confidence ?? null,
      aiWasRight
    };
  });
}

const STATS_CLES = ['expected_goals', 'Total Shots', 'Shots on Goal', 'big_chances', 'Ball Possession', 'Corner Kicks', 'Yellow Cards', 'Red Cards'];

/**
 * Faits du match dans le magasin FotMob, pour expliquer chaque marché.
 *
 * Les quatre premières clés (score, goals, redCards, stats) sont CELLES D'AVANT
 * l'étape 43, octet pour octet : l'ancienne forme du message
 * (AI_ANALYSIS_FICHE=ancienne) les envoie telles quelles, et `stats` sert au
 * règlement (statsPourReglement). On n'y a rien corrigé : `penalty` y vaut
 * toujours Boolean(e.penalty) — faux pour tout match d'avant l'étape —,
 * seuls les rouges directs y sont (la deuxième jaune n'y est pas), un déroulé
 * absent y donne « aucun but ».
 *
 * `deroule` (étape 43, cf. derouleDuMatch.js) : la lecture complète des mêmes
 * événements — penalties (aussi ceux d'avant l'étape), deuxièmes jaunes,
 * jaunes, remplacements, blessés, penalties manqués, but contre son camp
 * écrit pour le bon camp, déroulé « non publié » dit tel quel. Seule la fiche
 * compacte l'envoie. `pageFotMob` : où lire le texte minute par minute de ce
 * match (identifiant, langues connues) — jamais envoyé.
 */
function faitsDuMatch(homeName, date) {
  if (!date) return null;
  try {
    const d = matchDetailsFromStore(homeName, date, { avecDeroule: true });
    if (!d?.available) return null;
    const garder = (stats) => Object.fromEntries(STATS_CLES.filter((k) => stats?.[k] !== undefined && stats?.[k] !== null).map((k) => [k, stats[k]]));
    const brut = d.deroule ?? {};
    return {
      score: d.score,
      goals: (d.events ?? [])
        .filter((e) => e.type === 'goal')
        .map((e) => ({ minute: e.minute, side: e.side, player: e.player, ownGoal: Boolean(e.ownGoal), penalty: Boolean(e.penalty) })),
      redCards: (d.events ?? []).filter((e) => e.type === 'card' && e.card === 'red').map((e) => ({ minute: e.minute, side: e.side, player: e.player })),
      stats: { home: garder(d.stats?.home), away: garder(d.stats?.away) },
      deroule: lireDeroule({ events: brut.events ?? null, shotmap: brut.shotmap ?? null, meta: brut.meta ?? null, score: d.score }),
      pageFotMob: { fotmobId: brut.fotmobId ?? null, langs: typeof brut.meta?.tickerLangs === 'string' ? brut.meta.tickerLangs : null }
    };
  } catch {
    return null;
  }
}

/**
 * Les statistiques du match au format du règlement (cf. settlementRules.js),
 * pour juger les marchés de corners et de tirs. Un 0 des deux côtés veut dire
 * « non relevé » (cf. settlementService.js), jamais zéro.
 */
function statsPourReglement(faits) {
  if (!faits?.stats) return null;
  const lire = (s) => ({ corners: s?.['Corner Kicks'] ?? null, shots: s?.['Total Shots'] ?? null, shotsOnTarget: s?.['Shots on Goal'] ?? null });
  const home = lire(faits.stats.home);
  const away = lire(faits.stats.away);
  for (const k of Object.keys(home)) {
    if (Number(home[k]) === 0 && Number(away[k]) === 0) home[k] = away[k] = null;
  }
  return { home, away };
}

/**
 * Contexte qualitatif best-effort — chaque appel échoue indépendamment
 * (Promise.allSettled), même philosophie que enrichMatchWithRealAverages :
 * un classement absent (coupe) ou une équipe non résolue ne doit jamais faire
 * échouer toute l'analyse, juste réduire ce qui est disponible.
 */
async function gatherQualitativeContext(home, away, league, { matchId, commenceTime, sansRepliPayant = false } = {}) {
  const options = { sansRepliPayant };
  // Les moyennes du magasin (FotMob) d'abord ; API-Football seulement pour
  // une équipe qu'il ne connaît pas, et jamais en automatique.
  const homeMoyennes = moyennesPourIA(home, league, 'home');
  const awayMoyennes = moyennesPourIA(away, league, 'away');
  const [standingsR, homeStatsR, awayStatsR, homeFormR, awayFormR, teamNewsR] = await Promise.allSettled([
    getStandingsByLeagueLabel(league),
    homeMoyennes ? Promise.resolve(null) : resolveAverageStatsByName(home, league, undefined, options),
    awayMoyennes ? Promise.resolve(null) : resolveAverageStatsByName(away, league, undefined, options),
    resolveTeamFormByName(home, league, DEFAULT_FORM_SAMPLE_SIZE, options),
    resolveTeamFormByName(away, league, DEFAULT_FORM_SAMPLE_SIZE, options),
    // Blessures, suspensions, changement d'entraîneur (FotMob, gratuit) —
    // cf. teamNewsResolver.js. Rien à demander sans coup d'envoi connu.
    commenceTime ? resolveTeamNews({ homeName: home, awayName: away, commenceTimeIso: commenceTime, league }) : Promise.resolve(null)
  ]);
  const val = (r) => (r.status === 'fulfilled' ? r.value : null);
  const standings = val(standingsR);
  const homeStats = val(homeStatsR);
  const awayStats = val(awayStatsR);
  const homeForm = val(homeFormR);
  const awayForm = val(awayFormR);
  const teamNews = val(teamNewsR);

  // Note écrite par Pierre lui-même (vestiaire, rumeur, finances du club…) :
  // lecture fichier locale, pas un appel réseau, protégée comme les autres
  // sources secondaires ci-dessous.
  let userNote = null;
  try {
    const note = matchId ? getMatchNote(matchId) : null;
    if (note?.text) userNote = { text: note.text, updatedAt: note.updatedAt };
  } catch {
    // Notes absentes/corrompues : ignoré, le contexte reste utilisable sans.
  }

  const homeStatsPicked = pickCuratedStats(homeStats?.stats?.averages);
  const awayStatsPicked = pickCuratedStats(awayStats?.stats?.averages);

  // Instantané local (fichier), pas un appel réseau — pas besoin de
  // Promise.allSettled, mais protégé quand même par le même principe de
  // dégradation silencieuse que le reste de ce contexte : une équipe non
  // trouvée dans le dernier import FlashScore (cf. Réglages > Données) ne
  // doit jamais faire échouer l'analyse.
  let homeFlashscoreStats = null;
  let awayFlashscoreStats = null;
  try {
    homeFlashscoreStats = resolveFlashscoreStatsByName(home);
    awayFlashscoreStats = resolveFlashscoreStatsByName(away);
  } catch {
    // Snapshot corrompu ou absent : ignoré, le contexte reste utilisable sans.
  }

  // Historique local gratuit (football-data.co.uk depuis 2000, table
  // fd_history de la base, club retrouvé par identifiant — cf.
  // historicalMatchesProvider.js, étape 13 du plan) : même filet de sécurité
  // que FlashScore ci-dessus. Le classement local ne
  // sert QUE de repli, équipe par équipe, quand la ligne live (web ou
  // API-Football) n'a pas été trouvée — jamais un remplacement d'une ligne
  // déjà obtenue en direct.
  let homeHistoricalStats = null;
  let awayHistoricalStats = null;
  let homeHistoricalForm = null;
  let awayHistoricalForm = null;
  let homeStandingRow = findStandingRow(standings, home);
  let awayStandingRow = findStandingRow(standings, away);
  try {
    homeHistoricalStats = resolveHistoricalStatsByName(home, league);
    awayHistoricalStats = resolveHistoricalStatsByName(away, league);
    homeHistoricalForm = resolveHistoricalFormByName(home, league);
    awayHistoricalForm = resolveHistoricalFormByName(away, league);
    homeStandingRow ??= resolveHistoricalStandingRow(home, league);
    awayStandingRow ??= resolveHistoricalStandingRow(away, league);
  } catch {
    // CSV historique absent/corrompu : ignoré, le contexte reste utilisable sans.
  }

  // Quatrième source, locale (team-profiles.json) — équipes des coupes
  // européennes (Ligue des champions/Europa/Conference), peuplée par la tâche
  // planifiée via recherche web (cf. teamProfileRepository.js) puisque ces
  // équipes viennent de ~55 championnats sans équivalent local. Même statut
  // que les deux autres sources secondaires ci-dessus.
  let homeTeamProfile = null;
  let awayTeamProfile = null;
  try {
    homeTeamProfile = getTeamProfile(home);
    awayTeamProfile = getTeamProfile(away);
  } catch {
    // Cache absent/corrompu : ignoré, le contexte reste utilisable sans.
  }

  // Les sources secondaires (FlashScore, historique football-data.co.uk,
  // profils web) ne servent plus qu'à une équipe que le magasin ne connaît
  // pas : plus anciennes, elles contredisaient la forme et les moyennes
  // actuelles et l'IA passait ses réserves à les départager (01/10/2026).
  const formeHome = homeForm?.source === 'store';
  const formeAway = awayForm?.source === 'store';
  const profil = (p) => (p ? { recentForm: p.recentForm, historicalAverages: p.historicalAverages, updatedAt: p.updatedAt } : null);
  return {
    standings: homeStandingRow || awayStandingRow ? { home: homeStandingRow, away: awayStandingRow } : null,
    homeStats: homeMoyennes ?? (homeStatsPicked ? { source: 'API-Football', stats: homeStatsPicked, sampleSize: homeStats.stats.sampleSize } : null),
    awayStats: awayMoyennes ?? (awayStatsPicked ? { source: 'API-Football', stats: awayStatsPicked, sampleSize: awayStats.stats.sampleSize } : null),
    homeForm: describeForm(homeForm),
    awayForm: describeForm(awayForm),
    // Source secondaire (FlashScore via Apify) — cf. flashscoreEnrichment.js :
    // peut dater de plusieurs jours (`collectedAt`).
    homeFlashscoreStats: homeMoyennes ? null : homeFlashscoreStats,
    awayFlashscoreStats: awayMoyennes ? null : awayFlashscoreStats,
    // Locale et gratuite (football-data.co.uk, table fd_history) — moyennes sur les derniers matchs du club.
    homeHistoricalStats: homeMoyennes ? null : homeHistoricalStats,
    awayHistoricalStats: awayMoyennes ? null : awayHistoricalStats,
    homeHistoricalForm: !formeHome && homeHistoricalForm ? { results: homeHistoricalForm.results, sampleSize: homeHistoricalForm.sampleSize } : null,
    awayHistoricalForm: !formeAway && awayHistoricalForm ? { results: awayHistoricalForm.results, sampleSize: awayHistoricalForm.sampleSize } : null,
    // Locale (coupes européennes, cf. teamProfileRepository.js).
    homeTeamProfile: formeHome && homeMoyennes ? null : profil(homeTeamProfile),
    awayTeamProfile: formeAway && awayMoyennes ? null : profil(awayTeamProfile),
    // Cinquième source, gratuite (FotMob) — blessures/suspensions et
    // changement d'entraîneur déduit des compositions déjà vues.
    teamNews: teamNews && (teamNews.home || teamNews.away) ? teamNews : null,
    // Écrit par Pierre, jamais deviné : cf. matchNotesRepository.js.
    userNote
  };
}

const CLAUDE_CODE_NON_CONNECTE =
  'Claude Code non configuré : CLAUDE_CODE_OAUTH_TOKEN manque dans server/.env (jeton obtenu une fois via "claude setup-token", CLI installé par "npm install -g @anthropic-ai/claude-code").';

/** `code` des échecs qui toucheront aussi les analyses suivantes (cf. ClaudeCodeIndisponible) — lu par autoMatchAiTrigger.js. */
export const CODE_CLAUDE_CODE_INDISPONIBLE = 'CLAUDE_CODE_INDISPONIBLE';

function echecAppel(prefixe, error) {
  return new DomainError(`${prefixe} : ${error.message}`, {
    status: 502,
    code: error instanceof ClaudeCodeIndisponible ? CODE_CLAUDE_CODE_INDISPONIBLE : undefined
  });
}

/**
 * La composition telle que l'IA la lit : sans identifiants, numéros ni
 * minutes, qui ne lui disent rien, et seulement les remplaçants qui ont
 * compté cette saison — les 24 du banc pesaient 40 % de la composition
 * (mesuré le 01/10/2026, São Paulo - Santos).
 */
function compositionPourIA(lineups) {
  if (!lineups) return null;
  const joueur = ({ name, position, stats }) => ({
    name,
    position,
    stats: stats
      ? {
          apps: stats.apps,
          starts: stats.starts,
          goals: stats.goals,
          assists: stats.assists,
          ...(stats.xg != null ? { xg: stats.xg } : {}),
          ...(stats.rating != null ? { rating: stats.rating } : {})
        }
      : null
  });
  const aCompte = (j) => j.stats && (j.stats.starts >= 3 || j.stats.goals > 0 || j.stats.assists > 0);
  const equipe = (t) =>
    t && {
      team: t.team,
      formation: t.formation,
      coach: t.coach,
      statsSince: t.statsSince,
      teamMatches: t.teamMatches,
      startXI: t.startXI.map(joueur),
      bench: t.bench.filter(aCompte).map(joueur),
      // Les champs d'avant le 01/10/2026, nommés : identifiant, âge et
      // nationalité servent à l'affichage, pas à l'IA.
      unavailable: (t.unavailable ?? []).map(({ name, reason, expectedReturn }) => ({ name, reason, expectedReturn })),
      usualStartersMissing: (t.usualStartersMissing ?? []).map(({ name, position, starts, goals, assists, status }) => ({
        name,
        position,
        starts,
        goals,
        assists,
        status
      })),
      // Dernière composition alignée (`source: 'magasin'`) : le match d'où vient ce onze.
      ...(t.lastMatch
        ? {
            lastMatch: {
              date: t.lastMatch.date,
              league: t.lastMatch.league,
              home: t.lastMatch.home,
              away: t.lastMatch.away,
              homeGoals: t.lastMatch.homeGoals,
              awayGoals: t.lastMatch.awayGoals
            }
          }
        : {})
    };
  return {
    source: lineups.source,
    minutesBeforeKickoff: lineups.minutesBeforeKickoff,
    home: equipe(lineups.home),
    away: equipe(lineups.away),
    matchInfo: lineups.matchInfo ?? null
  };
}

/**
 * Ce qu'on enverrait à l'IA pour l'avant-match, SANS l'appeler : la forme de
 * la fiche, les consignes, le message du match, le schéma de sortie, et ce
 * qui sert ensuite (résumé du moteur gardé avec l'analyse, marchés commentés
 * dans l'ordre de la fiche, composition lue). Lectures gratuites seulement
 * (magasin, FotMob) ; jamais Claude.
 *
 * Fiche COMPACTE (forme normale) : consignes fixes, marchés à cote juste
 * ≥ 1,20, composition décrite par lineupContext.js (les absents avec leurs
 * chiffres quand le magasin les a). Ancienne forme : exactement le message
 * d'avant l'étape 41.
 */
export async function preparerAnalyseAvantMatch({ matchId, home, away, league, engineResult, sansRepliPayant = false, lineups = null, timing = 'avance', fiche = null }) {
  if (!matchId || !home || !away) {
    throw new DomainError('Match invalide : "matchId", "home" et "away" sont requis.', { status: 400 });
  }
  if (!engineResult || typeof engineResult !== 'object') {
    throw new DomainError("Résultat du moteur manquant : l'analyse du match doit être chargée avant de lancer l'analyse IA.", { status: 400 });
  }
  const forme = formeDeLaFiche(fiche, env.ficheIa);

  const engineSummary = curateEngineSummary(engineResult);
  const context = await gatherQualitativeContext(home, away, league, { matchId, commenceTime: engineResult.commenceTime, sansRepliPayant });
  // Sans composition fournie (analyse de la veille, ou d'un clic) : celle que
  // FotMob a publiée, sinon la dernière alignée par chaque équipe — l'IA juge
  // toujours sur QUI joue (01/10/2026). Lecture FotMob gratuite ; un échec ne
  // bloque jamais l'analyse.
  let compo = lineups;
  if (!compo) {
    try {
      compo = await compositionPourAnalyseIA({ homeName: home, awayName: away, commenceTimeIso: engineResult.commenceTime, league });
    } catch {
      compo = null;
    }
  }
  let experience = [];
  try {
    experience = aiMarketExperience();
  } catch {
    // Analyses illisibles à cet instant : l'avis se donne sans le bilan passé.
  }

  let demande;
  let marches;
  let marchesRetires = [];
  let memoire = null;
  if (forme === FICHES.ancienne) {
    // L'ancienne forme est celle d'avant l'étape 41, octet pour octet : jamais filtrée par le carnet (étape 21).
    if (compo) context.lineups = compositionPourIA(compo);
    marches = engineSummary.marketPredictions;
    demande = buildPreMatchAnalysisRequest({ home, away, league, engineSummary, context, experience });
  } else {
    // Étape 21 : les types de marché où l'IA n'apporte rien (carnet de la nuit) sortent de sa liste — et de son
    // bilan, inutile pour des marchés qu'elle ne commente plus ; une ligne de la fiche le lui dit. Carnet absent
    // ou illisible : rien n'est retiré (lireLesMarchesCoupes ne lève jamais). Rien de coupé : la fiche d'avant, à l'octet.
    const coupes = lireLesMarchesCoupes();
    const pourLaFiche = curateEngineSummary(engineResult, { sansApport: coupes });
    marches = marchesPourIA(pourLaFiche.marketPredictions);
    // Seuls les marchés que la fiche aurait donnés (cote juste ≥ 1,20) sont dits retirés.
    marchesRetires = [...new Set(marchesPourIA(engineSummary.marketPredictions).flatMap((m) => (coupes.has(typeDeMarche(m)) ? [typeDeMarche(m)] : [])))];
    const retires = marchesRetires.map((type) => ({ type, label: TYPES_DE_MARCHE[type] ?? type }));
    // Étape 44 : la MÉMOIRE de l'IA — les dossiers des deux clubs (par identifiant FotMob) et du championnat, 300 à 500
    // mots choisis par le code, à la place des trois dernières leçons de chaque type. Dossiers absents ou illisibles :
    // null, la fiche d'avant à l'octet. Jamais la note de Pierre (elle reste dans sa section), jamais un chiffre au moteur.
    memoire = memoireDuMatch({ matchId, home, away, league, compo, context });
    demande = buildPreMatchAnalysisRequestCompacte({
      home,
      away,
      league,
      engineSummary: pourLaFiche,
      marches,
      context,
      lineups: compo,
      experience: coupes.size ? experience.filter((t) => !coupes.has(t.marketType)) : experience,
      commenceTime: engineResult.commenceTime ?? null,
      timing,
      retires,
      dossiers: memoire?.texte ?? null
    });
  }
  return {
    forme,
    system: demande.system,
    userMessage: demande.messages[0].content,
    jsonSchema: SUBMIT_PRE_MATCH_ANALYSIS_TOOL.input_schema,
    engineSummary,
    marches,
    // Étape 21 : les types de marché retirés de CETTE fiche (gardés avec l'analyse, pour que la revue ne les redonne pas à juger).
    marchesRetires,
    compo: compo ?? null,
    // Étape 44 : ce que la mémoire a remis à l'IA (texte, mots, tokens estimés, leçons citables, clubs reconnus), ou null.
    memoire
  };
}

/** Ce qu'on garde avec l'analyse de la mémoire remise à l'IA (étape 44) : sans le texte, refait chaque nuit. */
function memoireGardee(m) {
  if (!m) return null;
  return {
    mots: m.mots,
    tokens: m.tokens,
    lecons: m.lecons,
    dossiersDu: m.calculeLe ?? null,
    equipes: { home: { id: m.equipes.home.id, dossier: m.equipes.home.dossier }, away: { id: m.equipes.away.id, dossier: m.equipes.away.dossier } },
    championnat: m.championnat
  };
}

/**
 * `sansRepliPayant` : vrai pour le déclenchement AUTOMATIQUE — le contexte ne
 * se complète jamais par API-Football (quota payant de 100/jour) quand le
 * magasin ne connaît pas une équipe ; la donnée manque, c'est tout. Un clic
 * de l'utilisateur garde le repli.
 *
 * `timing` : 'avance' (jusqu'à 48 h avant, ou un clic) ou 'coup-d-envoi'
 * (environ une heure avant, cf. autoMatchAiTrigger.js), avec `lineups` (cf.
 * lineupContext.js) quand FotMob a publié la composition. L'analyse d'avant
 * coup d'envoi devient celle de référence (écran, revue après-match,
 * expérience de l'IA) ; celle de la veille reste consultable.
 *
 * `appel` (journal des appels Claude, étape 4) : ce que l'appelant dit de
 * cet appel — { type: 'avance' | 'coup-d-envoi' | 'reprise' | 'manuel' |
 * 'autre', detail?, mode? } ; le match est ajouté ici, et la forme de la
 * fiche avec la taille des consignes et du message (étape 41). Le journal
 * garde l'usage de CHAQUE appel, y compris celui que ce fichier perd
 * (l'analyse d'avance gardée dans `earlierAnalysis` sans son usage, la
 * reprise qui écrase l'usage de la précédente).
 *
 * `fiche` (étape 41) : 'compacte' ou 'ancienne' pour CET appel (essai,
 * comparaison) ; absent, le réglage AI_ANALYSIS_FICHE (compacte par défaut).
 */
export async function runPreMatchAnalysis({ matchId, home, away, league, engineResult, sansRepliPayant = false, lineups = null, timing = 'avance', appel = null, fiche = null }) {
  if (!isClaudeCodeAuthenticated()) {
    throw new DomainError(CLAUDE_CODE_NON_CONNECTE, { status: 400, code: CODE_CLAUDE_CODE_INDISPONIBLE });
  }
  const demande = await preparerAnalyseAvantMatch({ matchId, home, away, league, engineResult, sansRepliPayant, lineups, timing, fiche });
  const { engineSummary, marches, compo, forme, marchesRetires, memoire } = demande;

  let reponse;
  try {
    reponse = await callClaudeCode({
      system: demande.system,
      userMessage: demande.userMessage,
      jsonSchema: demande.jsonSchema,
      appel: {
        type: appel?.type ?? 'autre',
        detail: appel?.detail ?? `avant-match (${timing})`,
        mode: appel?.mode ?? null,
        match: { matchId, home, away, league: league ?? null },
        fiche: forme,
        taille: { consignes: demande.system.length, message: demande.userMessage.length }
      }
    });
  } catch (error) {
    throw echecAppel('Analyse IA pré-match impossible', error);
  }

  const analysis = sanitizeToolInput(reponse.structuredOutput);
  // Chaque avis sous le libellé exact du marché du moteur, pour que l'onglet
  // et la revue après-match le retrouvent : les marchés que la fiche a donnés
  // à commenter, dans son ordre (le rattachement par position en dépend).
  if (marches.length && Array.isArray(analysis.marketViews)) {
    const rattaches = rattacherAuxMarches(analysis.marketViews, marches);
    // Avec le pourcentage que l'explication commente (il bouge avec les cotes).
    analysis.marketViews = marches.flatMap((m, i) => (rattaches[i] ? [{ ...rattaches[i], market: m.market, probability: m.probability ?? null }] : []));
  }

  const existante = getByMatchId(matchId);
  const entree = {
    matchId,
    homeName: home,
    awayName: away,
    league: league ?? null,
    // Absent de engineSnapshot (curateEngineSummary ne garde que le chiffré) :
    // seul repère de date pour retrouver cette analyse après-coup, par équipes,
    // quand l'après-match automatique ne connaît que l'identifiant FotMob.
    commenceTime: engineResult.commenceTime ?? null,
    model: 'claude-code:sonnet',
    // Étape 25 : avec le numéro de la version du moteur (jamais donné à l'IA).
    engineSnapshot: avecLaVersion(engineSummary, engineResult),
    usage: reponse.usage ?? null,
    costUsd: reponse.costUsd,
    // `createdAt` reste celui de la toute première analyse du match.
    analysedAt: new Date().toISOString(),
    timing,
    // La forme de la fiche lue par l'IA (étape 41) : la qualité des avis se
    // compare ensuite forme par forme (carnet de l'étape 21).
    fiche: forme,
    // Étape 21 : les types de marché retirés de la fiche par le carnet de l'IA ; la revue ne les lui redonne pas à
    // juger. Rien de retiré : la clé n'est pas écrite (celle d'une analyse précédente du match est effacée).
    ...(marchesRetires?.length ? { marchesRetires } : existante?.marchesRetires ? { marchesRetires: undefined } : {}),
    // Étape 44 : la mémoire remise à l'IA (mots, tokens estimés, leçons citables) ; sans dossiers, la clé n'est pas écrite.
    ...(memoire ? { memoire: memoireGardee(memoire) } : existante?.memoire ? { memoire: undefined } : {}),
    lineupSnapshot: compo ?? null,
    analysis
  };
  if (timing === 'coup-d-envoi') {
    // Une analyse « d'avant coup d'envoi » faite plus de 70 min avant le vrai
    // coup d'envoi (heure fictive d'un match du calendrier, cf.
    // autoMatchAiTrigger.js) ne compte pas comme telle.
    const kickoffMs = Date.parse(engineResult.commenceTime ?? '');
    const dejaAuCoupDEnvoi = existante?.timing === 'coup-d-envoi' && !(kickoffMs - Date.parse(existante.analysedAt ?? 0) > 70 * 60_000);
    entree.kickoffRuns = dejaAuCoupDEnvoi ? (existante.kickoffRuns ?? 1) + 1 : 1;
    // L'analyse de la veille, remplacée, reste consultable (une seule : la
    // première d'avance, jamais une analyse d'avant coup d'envoi refaite).
    if (existante?.analysis && !dejaAuCoupDEnvoi && !existante.earlierAnalysis) {
      entree.earlierAnalysis = {
        analysis: existante.analysis,
        engineSnapshot: existante.engineSnapshot ?? null,
        analysedAt: existante.analysedAt ?? existante.updatedAt ?? existante.createdAt ?? null
      };
    }
  }
  // Une analyse vient de coûter ~10 s de quota Claude : jamais jetée sur un blocage OneDrive.
  return enregistrerSansPerdre(() => savePreMatchAnalysis(entree), 'analyse IA');
}

/**
 * `result` optionnel : {homeGoals, awayGoals} déjà connu de l'appelant (cf.
 * autoMatchAiTrigger.js, qui le lit directement dans le magasin FotMob).
 * Sans lui, on retombe sur le rapprochement par équipes + jour du magasin de
 * résultats saisis/importés (match-results.json) — jamais une égalité stricte
 * de matchId, puisque ce fichier porte des identifiants `web-...` distincts
 * de celui sous lequel l'analyse avant-match a été enregistrée (cf.
 * matchResultsRepository.js, createResultLookup).
 *
 * `appel` (journal des appels Claude, étape 4) : { type: 'revue' | 'manuel' |
 * 'autre', detail?, mode? } ; le match est ajouté ici, et la forme de la
 * fiche avec la taille des consignes et du message (étape 41).
 *
 * `fiche` (étape 41) : 'compacte' ou 'ancienne' pour CET appel ; absent, le
 * réglage AI_ANALYSIS_FICHE (compacte par défaut).
 */
export async function runPostMatchAnalysis({ matchId, result: resultFourni = null, appel = null, fiche = null }) {
  if (!isClaudeCodeAuthenticated()) {
    throw new DomainError(CLAUDE_CODE_NON_CONNECTE, { status: 400, code: CODE_CLAUDE_CODE_INDISPONIBLE });
  }

  const prior = getByMatchId(matchId);
  if (!prior?.analysis) {
    throw new DomainError('Aucune analyse avant-match trouvée pour ce match — impossible de comparer.', { status: 400 });
  }

  // Fenêtre large (avant/après) quand `commenceTime` manque (analyses
  // enregistrées avant son ajout) : `createdAt` n'est qu'un ordre de grandeur
  // de la date du match, jamais aussi sûr qu'un vrai coup d'envoi.
  const jourApprox = (prior.commenceTime ?? prior.createdAt ?? new Date().toISOString()).slice(0, 10);
  const fenetre = prior.commenceTime ? { league: prior.league ?? null } : { before: 3, after: 7, league: prior.league ?? null };
  const result = resultFourni ?? createResultLookup()(matchId, jourApprox, prior.homeName, prior.awayName, fenetre);
  if (!result) {
    throw new DomainError("Le résultat de ce match n'a pas encore été saisi (Historique moteur > Score final).", { status: 400 });
  }

  let demande = preparerRevueApresMatch({ prior, result, fiche });
  // Étape 43 : le texte minute par minute de FotMob (VAR, penalties, blessures,
  // occasions), quand il existe pour ce match — une lecture gratuite de plus au
  // plus trois fichiers, jamais avec l'ancienne forme, jamais bloquante : une
  // erreur ou l'absence de texte laisse la revue partir sans cette section.
  if (demande.forme === FICHES.compacte && env.commentaireMatch && demande.pageFotMob?.fotmobId) {
    try {
      const commentaire = await commentaireDuMatch(demande.pageFotMob);
      if (commentaire.length) demande = preparerRevueApresMatch({ prior, result, fiche, commentaire });
    } catch {
      // jamais bloquant
    }
  }
  const { marketOutcomes, aJuger, forme } = demande;

  let reponse;
  try {
    reponse = await callClaudeCode({
      system: demande.system,
      userMessage: demande.userMessage,
      jsonSchema: demande.jsonSchema,
      appel: {
        type: appel?.type ?? 'autre',
        detail: appel?.detail ?? 'après-match',
        mode: appel?.mode ?? null,
        match: { matchId, home: prior.homeName ?? null, away: prior.awayName ?? null, league: prior.league ?? null },
        fiche: forme,
        taille: { consignes: demande.system.length, message: demande.userMessage.length }
      }
    });
  } catch (error) {
    throw echecAppel('Analyse IA après-match impossible', error);
  }

  // Le bilan de chaque marché : l'issue et la tenue de l'avis (calculées
  // ici), l'explication et la leçon (écrites par l'IA) — pour CHAQUE marché
  // du moteur, comme avant ; ceux que la fiche n'a pas donnés à juger (cote
  // juste sous 1,20) gardent leur issue, sans explication.
  const brut = sanitizeToolInput(reponse.structuredOutput);
  const ecrites = rattacherAuxMarches(brut.marketReviews ?? [], aJuger);
  const ecriteDe = new Map(aJuger.map((o, i) => [o, ecrites[i]]));
  const marketReviews = marketOutcomes.map((o) => ({ ...o, explanation: ecriteDe.get(o)?.explanation ?? null, lesson: ecriteDe.get(o)?.lesson ?? null }));
  const faits = demande.matchStats;
  const revue = {
    ...brut,
    marketReviews,
    model: 'claude-code:sonnet',
    fiche: forme,
    // Étape 43 : ce que la revue a reçu du déroulé — pour juger ensuite les bilans (carnet de l'étape 21).
    ...(forme === FICHES.compacte && faits?.deroule ? { deroule: { disponible: faits.deroule.disponible, faits: faits.deroule.faits.length, commentaire: faits.commentaire?.length ?? 0 } } : {}),
    usage: reponse.usage ?? null,
    costUsd: reponse.costUsd,
    createdAt: new Date().toISOString()
  };
  return enregistrerSansPerdre(() => savePostMatchReview(matchId, revue), 'analyse IA');
}

/**
 * Ce qu'on enverrait à l'IA pour la revue d'après-match, SANS l'appeler : la
 * forme, les consignes, le message, le schéma, l'issue de CHAQUE marché
 * (`marketOutcomes`, calculée ici — jamais laissée à l'IA) et ceux que la
 * fiche donne à juger (`aJuger` : tous dans l'ancienne forme, ceux à cote
 * juste ≥ 1,20 dans la fiche compacte, comme avant le match). `result` :
 * { homeGoals, awayGoals, date?, homeName?, matchId? } ; lecture du magasin
 * seulement.
 */
export function preparerRevueApresMatch({ prior, result, fiche = null, commentaire = null }) {
  const forme = formeDeLaFiche(fiche, env.ficheIa);
  // Date réelle du match : fournie (automatique), lue dans l'identifiant du
  // résultat (« web-AAAA-MM-JJ-… »), ou à défaut le coup d'envoi enregistré.
  const dateMatch = result.date ?? /(\d{4}-\d{2}-\d{2})/.exec(String(result.matchId ?? ''))?.[1] ?? prior.commenceTime?.slice(0, 10) ?? null;
  // Les faits du match d'abord : ils jugent aussi les marchés de corners et de tirs.
  const faits = faitsDuMatch(result.homeName ?? prior.homeName, dateMatch);
  const pronostics = pronosticsDeMarches(prior);
  const marketOutcomes = issuesDesMarches(prior, pronostics, result, statsPourReglement(faits));
  const resultat = { homeGoals: result.homeGoals, awayGoals: result.awayGoals };
  const pageFotMob = faits?.pageFotMob ?? null;

  if (forme === FICHES.ancienne) {
    // L'ancienne forme est celle d'avant l'étape 43, octet pour octet : ni le
    // déroulé, ni le texte minute par minute, ni la référence de la page.
    const { deroule, commentaire: texteDuMatch, pageFotMob: page, ...matchStats } = faits ?? {};
    const envoye = faits ? matchStats : null;
    const { system, messages } = buildPostMatchReviewRequest({
      home: prior.homeName,
      away: prior.awayName,
      league: prior.league,
      priorAnalysis: prior.analysis,
      engineSummary: pourIA(prior.engineSnapshot),
      result: resultat,
      marketOutcomes,
      matchStats: envoye
    });
    return { forme, system, userMessage: messages[0].content, jsonSchema: SUBMIT_POST_MATCH_REVIEW_TOOL.input_schema, marketOutcomes, aJuger: marketOutcomes, matchStats: envoye, pageFotMob };
  }

  // Fiche compacte : le déroulé, et les extraits du texte minute par minute
  // quand l'appelant les a lus (cf. runPostMatchAnalysis) et que le match est au magasin.
  const matchStats = faits && Array.isArray(commentaire) && commentaire.length ? { ...faits, commentaire } : faits;
  const gardes = new Set(marchesPourIA(pronostics));
  // Étape 21 : un marché retiré de la fiche d'avant-match par le carnet de l'IA n'est pas redonné à juger (elle
  // n'en a rien dit) ; son issue reste notée dans le bilan, comme celle d'un marché sous 1,20.
  const retires = new Set(Array.isArray(prior.marchesRetires) ? prior.marchesRetires : []);
  const aJuger = marketOutcomes.filter((_, i) => gardes.has(pronostics[i]) && !retires.has(typeDeMarche(pronostics[i])));
  const { system, messages } = buildPostMatchReviewRequestCompacte({
    home: prior.homeName,
    away: prior.awayName,
    league: prior.league,
    commenceTime: prior.commenceTime ?? null,
    timing: prior.timing ?? null,
    analysedAt: prior.analysedAt ?? prior.createdAt ?? null,
    priorAnalysis: prior.analysis,
    engineSummary: pourIA(prior.engineSnapshot),
    result: resultat,
    marketOutcomes: aJuger,
    matchStats
  });
  return { forme, system, userMessage: messages[0].content, jsonSchema: SUBMIT_POST_MATCH_REVIEW_TOOL.input_schema, marketOutcomes, aJuger, matchStats, pageFotMob };
}

/** Pour les tests et l'estimation hors ligne de l'étape 41 : les briques internes, sans Claude. */
export const __testing = { gatherQualitativeContext, compositionPourIA, curateEngineSummary, faitsDuMatch, issuesDesMarches, pronosticsDeMarches, statsPourReglement, avecLaVersion, pourIA };
