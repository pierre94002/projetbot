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
 *
 * BUDGET CLAUDE (étape 4 du plan, cf. claudeBudget.js) : chaque appel dit son
 * type au journal (avance, coup d'envoi, reprise, revue). En MODE ÉCONOME —
 * 80 % du budget du jour ou de la semaine fixé par Pierre, ou son choix —
 * l'analyse d'avance est réservée aux favoris (vérifié avant CHAQUE analyse :
 * une passe qui franchit les 80 % s'arrête là pour les autres), la reprise
 * après changement de onze demande au moins deux titulaires habituels
 * changés, et les favoris passent d'abord dans chaque liste. La priorité
 * actuelle ne bouge pas (analyses d'avant coup d'envoi mises de côté d'abord,
 * cf. reserveCoupDEnvoi) et le plafond quotidien de 150 reste la seule
 * limite dure. En mode normal, rien ne change.
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
import { fetchMatchesByDate, FOTMOB_LEAGUES, leagueKeyMatches } from '../../data/providers/fotMobProvider.js';
import { intituleDeLaTable } from '../../data/providers/intitulesFotmob.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { getByMatchId, findPreMatchAnalysisByTeams, listAll } from '../../data/repositories/matchAiAnalysisRepository.js';
import { enregistrerUsage, jourParis, finDuJourParis } from '../../data/repositories/autoAiAnalysisRepository.js';
import { buildLineupContext, derniereCompositionConnue, signatureDesOnzes, titulairesHabituelsChanges } from '../../data/providers/lineupContext.js';
import { runPreMatchAnalysis, runPostMatchAnalysis, CODE_CLAUDE_CODE_INDISPONIBLE } from './matchAiAnalysisService.js';
import { isClaudeCodeAuthenticated } from './claudeCodeClient.js';
import { modeBudget, lireFavoris, estFavori, favorisDabord, noterEffetEconome } from './claudeBudget.js';
import { gelerAnalyse, ORIGINES } from '../../data/enregistreurs/gelPronostics.js';
import { env } from '../../config/env.js';
import { preparerAVerifierDuConseilParNoms, avecAVerifierPourLeMoteur } from '../../data/aVerifierPourLeMoteur.js';
import { fraicheurDuMatch, coteDeLInstantanePayant } from '../../data/cotesDeVosBookmakers.js';
// Lot A1 (17/11/2026, pendant l'essai n° 3 ; l'essai 27 est jugé, ce fichier est libre) : le contexte de la mise, lu comme la page.
import { contexteDeLaMise, contexteDuMoteur, miseDuMatch, miseNonCalculee, ceQuiNaPasPuEtreLu } from '../../data/mise/miseRead.js';
import { CONTEXTE_DE_MISE_ILLISIBLE } from './compactContext.js';

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
//
// Le résultat du moteur de CHAQUE analyse automatique est aussi gelé (étape
// E du plan, correction 7 : data/enregistreurs/gelPronostics.js) — avec la
// composition qu'elle a lue. Mis en file, écrit quand le verrou est libre ;
// un gel raté n'empêche jamais l'analyse.
/** Le gel de l'analyse en service : seulement si les enregistreurs et l'actualisation sont allumés (inchangé). */
function gelerEnService({ match, engineResult, lineups, origine, aVerifier }) {
  if (env.enregistreurs?.enabled && env.matchStatsRefresh.enabled) gelerAnalyse({ match, engineResult, lineups, origine, aVerifier });
}

/** Le contexte de la mise lu comme la page du match (analysis.controller.js). */
const lireLeContexteDeMise = () => contexteDeLaMise({ sportId: 'football' });

/** L'enrichissement du match en service : jamais de repli payant dans une chaîne automatique. */
const enrichirSansRepliPayant = (match) => enrichMatchWithRealAverages(match, { sansRepliPayant: true });

/**
 * Lot A1 (passe 2, K6) : exporté, avec ses lectures INJECTABLES pour les essais (`lire` le contexte de la mise, `geler`
 * l'analyse, `enrichir` le match) ; sans elles, le comportement en service, inchangé (miseLot2.test.mjs, T-A1 mise, l'appelle
 * dans une copie isolée). Relevé ciblé (18/11/2026, élément A4) : `fraicheur` joint la fraîcheur des cotes au match donné au
 * moteur (avecLaFraicheurDesCotes, comme la page) ; injectable pour les essais qui fabriquent des matchs sans heure de cote.
 */
export async function calculerEngineResult(match, { lineups = null, origine = ORIGINES.avance, lire = lireLeContexteDeMise, geler = gelerEnService, enrichir = enrichirSansRepliPayant, fraicheur = avecLaFraicheurDesCotes } = {}) {
  // Lot A1 (17/11/2026, vérification des lots d'argent, mise C8) : le contexte de la mise est lu comme la page du match
  // (analysis.controller.js : contexteDeLaMise, puis contexteDuMoteur) et joint au match donné au moteur — la part écrite à
  // l'IA est celle de la page (compactContext.js, partPourIA). Le gel de l'analyse reçoit le même match qu'avant, et rien de
  // ce qu'il écrit ne dépend de la mise (miseLot2.test.mjs, T-A1).
  const lu = avecLeContexteDeMise(await enrichir(match), { lire });
  // Élément A4 du relevé ciblé (18/11/2026, décision RC6) : la fraîcheur des cotes jointe au match donné au moteur, comme la
  // page du match (avecLaFraicheurDesCotes ; la page la joint aussi AVANT « à vérifier »). Le gel reçoit le même `match`
  // qu'avant et le même `aVerifier` (lu sur les noms, le championnat et la date : la fraîcheur n'y change rien) ; `lu` reste
  // celui d'avant pour la part écrite à l'IA (resultatPourLIA).
  const enrichi = fraicheur(lu.match);
  // Étape 38 (lot 2a, 16/11/2026) : aucun conseil de pari sur un match « à vérifier » — la donnée du contrôle quotidien est
  // jointe au match donné au moteur (data/aVerifierPourLeMoteur.js) ; l'IA lit alors « aucun pari conseillé », comme la page.
  const aVerifier = preparerAVerifierDuConseilParNoms()(enrichi);
  const engineResult = await analyzeMatch(avecAVerifierPourLeMoteur(enrichi, aVerifier), getEngineConfig('football'), getTiltState(), getSport('football'));
  geler({ match, engineResult, lineups, origine, aVerifier });
  return resultatPourLIA(engineResult, lu);
}

/**
 * Élément A4 du relevé ciblé (18/11/2026, décision RC6) : la fraîcheur des cotes jointe au match, EXACTEMENT comme la page
 * du match (analysis.controller.js : `source === 'odds-api' ? { ...m, fraicheurCotes: fraicheurDuMatch(m) } : m`) — même
 * fonction, même condition de source. Les analyses automatiques lisent toujours la source « odds-api ». Sans elle, le
 * verdict du pari ne contrôlait pas la fraîcheur (verdictPari.js) et l'IA lisait « RECOMMENDED » pour une cote de plus de
 * 60 min ou d'avant les compositions, quand la page disait « à rafraîchir ».
 */
export function avecLaFraicheurDesCotes(match, source = 'odds-api') {
  return source === 'odds-api' ? { ...match, fraicheurCotes: fraicheurDuMatch(match) } : match;
}

/**
 * Lot 1b du relevé ciblé (18/11/2026, décision RC5) : l'analyse d'avant-match DÉJÀ FAITE pour ce match, même si son
 * identifiant a changé. Un relevé ciblé fait basculer des identifiants (`cal-…` ↔ identifiant The Odds API) ; sans cette
 * recherche, l'analyse (~24 400 jetons du quota de Pierre) serait refaite pour le même match. On cherche sous
 * l'identifiant du moment ET par équipes, championnat et jour (la règle de findPreMatchAnalysisByTeams, la recherche des
 * revues d'après-match, appliquée à TOUTES les analyses : elle ne rend que la première, qui peut être l'analyse d'avance
 * quand celle du coup d'envoi est rangée sous l'autre identifiant). Par équipes, seulement une analyse qui porte son
 * heure de coup d'envoi : une entrée sans heure répondrait pour n'importe quel jour et bloquerait la même affiche jouée
 * plus tard. Rend la plus avancée : une analyse au coup d'envoi d'abord, puis la plus récente ; null s'il n'y en a pas.
 * L'analyse neuve, elle, est toujours rangée sous l'identifiant du moment.
 */
export function analyseDejaFaite(m) {
  const parIdentifiant = getByMatchId(m.matchId);
  const jour = String(m.commenceTime ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !m.home || !m.away) return parIdentifiant;
  const memeMatch = (e) =>
    e.matchId !== m.matchId &&
    !e.postMatchReview &&
    typeof e.commenceTime === 'string' &&
    // Le jour et le championnat d'abord (comparaisons simples), les noms ensuite (rapprochement souple, plus coûteux) :
    // ce tri est passé pour chaque match candidat, sur toutes les analyses gardées.
    Math.abs(Date.parse(e.commenceTime.slice(0, 10)) - Date.parse(jour)) <= JOUR_MS &&
    !(m.league && e.league && e.league !== m.league) &&
    teamNamesLikelyMatch(e.homeName, m.home) &&
    teamNamesLikelyMatch(e.awayName, m.away);
  const toutes = [parIdentifiant, ...listAll().filter(memeMatch)].filter(Boolean);
  if (!toutes.length) return null;
  return toutes.sort(plusAvanceeDabord)[0];
}

const JOUR_MS = 86_400_000;
/** La plus avancée d'abord : une analyse au coup d'envoi avant une analyse d'avance, puis la plus récente. */
const rangDAnalyse = (e) => (e.timing === 'coup-d-envoi' ? 1 : 0);
const heureDAnalyse = (e) => Date.parse(e.analysedAt ?? e.updatedAt ?? 0) || 0;
const plusAvanceeDabord = (a, b) => rangDAnalyse(b) - rangDAnalyse(a) || heureDAnalyse(b) - heureDAnalyse(a);

/**
 * Correction S6 (relecture Fable, décision RC5 bis, 18/11/2026) : l'analyse d'avant coup d'envoi compte-t-elle comme
 * faite POUR CE MATCH ? Une analyse trouvée sous un identifiant `cal-` (faite sans aucune cote payante) ne compte PAS si
 * le match a MAINTENANT des cotes payantes (relevé fait après elle) : elle est refaite UNE fois, sous l'identifiant du
 * moment — ensuite on la trouve par l'identifiant, c'est fini. Sans cela, après un relevé ciblé, la page du match
 * (qui lit l'analyse par l'identifiant) n'avait plus d'avis de l'IA, et l'IA n'avait jamais vu les cotes payées. Le cas
 * inverse ne change pas (analyse sous l'identifiant The Odds API, match revenu au calendrier : faite).
 */
function faiteAuCoupDEnvoiPourCeMatch(entree, m, kickoffMs) {
  if (!faiteAuCoupDEnvoi(entree, kickoffMs)) return false;
  if (entree.matchId !== m.matchId && String(entree.matchId ?? '').startsWith('cal-') && coteDeLInstantanePayant(m)) return false;
  return true;
}

/**
 * Correction S8 (relecture Fable, 18/11/2026) : l'analyse d'avant-match à revoir après le match. Parmi les entrées du
 * même match (mêmes équipes, même championnat quand les deux sont connus, coup d'envoi à un jour près), la PLUS AVANCÉE
 * (celle du coup d'envoi d'abord, puis la plus récente) ; RIEN si l'une d'elles a déjà sa revue — sinon un match analysé
 * sous deux identifiants (avance `cal-`, coup d'envoi The Odds API) recevait deux revues (un appel Claude de trop, et
 * l'« expérience » redonnée à l'IA le comptait deux fois). Sans entrée datée de ce jour-là : la règle d'avant
 * (findPreMatchAnalysisByTeams : les analyses sans heure de coup d'envoi).
 */
export function analysePourLaRevue({ homeName, awayName, league, day = null }) {
  if (day) {
    const soeurs = listAll().filter(
      (e) =>
        typeof e.commenceTime === 'string' &&
        Math.abs(Date.parse(e.commenceTime.slice(0, 10)) - Date.parse(day)) <= JOUR_MS &&
        !(league && e.league && e.league !== league) &&
        teamNamesLikelyMatch(e.homeName, homeName) &&
        teamNamesLikelyMatch(e.awayName, awayName)
    );
    if (soeurs.length) return soeurs.some((e) => e.postMatchReview) ? null : [...soeurs].sort(plusAvanceeDabord)[0];
  }
  return findPreMatchAnalysisByTeams({ homeName, awayName, league, day });
}

/**
 * Lot A1 (mise C8) : le match avec le contexte de la mise lu comme sur la page du match (`contexteDeMise`, data/mise/miseRead.js :
 * capital du moment, paris en attente sur CE match, plafonds en euros, fiches des comptes, plancher). Passe 2 (K1) : une lecture
 * utile à la mise qui a échoué (`lecturesRatees` de contexteDeLaMise : carnet, capital, comptes, garde-fous, réglage) donne
 * `contexteLu: false` et la nomme (`miseNonLue`, miseNonCalculee : la même décision que la page) ; le match porte alors le
 * contexte lu, comme sur la page. Une lecture qui lève : le match tel quel. `lire` : pour les essais.
 */
export function avecLeContexteDeMise(match, { lire = lireLeContexteDeMise } = {}) {
  let contexte;
  try {
    contexte = lire();
    const lu = { ...match, contexteDeMise: contexteDuMoteur(contexte, match) };
    const nonLue = miseNonCalculee(contexte);
    if (nonLue) return { match: lu, contexteLu: false, contexte, lecturesRatees: nonLue.lectures, miseNonLue: nonLue.ceQuiNaPasPuEtreLu };
    return { match: lu, contexteLu: true, contexte, lecturesRatees: [] };
  } catch {
    return { match, contexteLu: false, lecturesRatees: ['contexte'], miseNonLue: ceQuiNaPasPuEtreLu(['contexte']) };
  }
}

/**
 * Lot A1 (mise C8) : le résultat du moteur tel que l'analyse IA le reçoit — un objet neuf, le résultat du moteur n'est jamais
 * modifié. Contexte illisible : le conseil porte la marque CONTEXTE_DE_MISE_ILLISIBLE et ce qui n'a pas pu être lu (`miseNonLue` ;
 * la fiche écrit « part du capital non calculée : lecture impossible du … »). Contexte lu : le conseil porte `partDuCapital`,
 * LA part de la page (miseDuMatch, data/mise/miseRead.js : la règle, ou la mise ramenée par un plafond du moment posé après
 * elle — K5) ; avec le capital indiqué, `mise.capital` (la base du calcul gardée avec l'analyse, compactContext.js
 * baseDuCalculDe, est alors le capital — la mise du moteur a été calculée sur lui ; jamais envoyée à l'IA).
 */
export function resultatPourLIA(engineResult, lu) {
  if (!engineResult || typeof engineResult !== 'object') return engineResult;
  const conseil = engineResult.staking?.action === 'RECOMMENDED';
  if (!lu?.contexteLu) {
    if (!conseil) return engineResult;
    return { ...engineResult, staking: { ...engineResult.staking, contexteDeLaMise: CONTEXTE_DE_MISE_ILLISIBLE, miseNonLue: lu?.miseNonLue ?? ceQuiNaPasPuEtreLu(['contexte']) } };
  }
  const c = lu.match?.contexteDeMise?.capital;
  const avecCapital = c?.indique && typeof c.montant === 'number' && Number.isFinite(c.montant) ? { mise: { capital: { indique: true, montant: c.montant } } } : {};
  if (!conseil || !lu.contexte) return { ...engineResult, ...avecCapital };
  const f = miseDuMatch({ staking: engineResult.staking, contexte: lu.contexte, match: lu.match }).fraction;
  const part = typeof f === 'number' && Number.isFinite(f) ? { partDuCapital: f } : {};
  return { ...engineResult, ...avecCapital, staking: { ...engineResult.staking, ...part } };
}

/**
 * `ecarter(candidat)` (facultatif) : regardé juste avant chaque analyse ; vrai
 * = laissé sans analyse à cette passe (mode économe), compté à part de ce que
 * le plafond laisse pour demain. Il ne prend pas de place sur le plafond.
 *
 * @returns {{ ok: number, failed: number, candidates: number, ecartes: number, samples: string[], interrompu: boolean }}
 */
async function analyserEnSerie(candidats, limit, analyser, libelle, ecarter = null) {
  let ok = 0;
  let failed = 0;
  let ecartes = 0;
  let pannes = 0;
  let interrompu = false;
  const samples = [];
  for (const candidat of candidats) {
    if (ok + failed >= limit) break;
    if (ecarter?.(candidat)) {
      ecartes++;
      continue;
    }
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
  return { ok, failed, ecartes, candidates: candidats.length, samples, interrompu };
}

const VIDE = { ok: 0, failed: 0, ecartes: 0, candidates: 0, samples: [], interrompu: false };

/**
 * Les analyses D'AVANCE (3 h à 48 h avant). Mode économe (étape 4) : réservées
 * aux favoris — le mode est relu avant chaque analyse, et un match non favori
 * laissé de côté ne prend pas de place sur le plafond.
 */
export async function runAutoPreMatchAnalyses({ limit }) {
  if (limit <= 0) return VIDE;
  if (!isClaudeCodeAuthenticated()) return { ...VIDE, nonConfigure: true };

  const maintenant = Date.now();
  let candidats = listAdaptedMatches('odds-api', 10000)
    .filter((m) => {
      const coupEnvoi = Date.parse(m.commenceTime ?? '');
      return Number.isFinite(coupEnvoi) && coupEnvoi - maintenant > AVANCE_MIN_MS && coupEnvoi - maintenant <= FENETRE_AVANT_MATCH_MS;
    })
    .filter((m) => !analyseDejaFaite(m))
    .sort((a, b) => Date.parse(a.commenceTime) - Date.parse(b.commenceTime));

  let budget = modeBudget();
  const favoris = lireFavoris();
  const database = openDb();
  const favori = (m) => estFavori({ home: m.home, away: m.away, league: m.league }, favoris, database);
  if (budget.politique.favorisDabord) candidats = favorisDabord(candidats, (m) => ({ home: m.home, away: m.away, league: m.league }), favoris, database);

  const r = await analyserEnSerie(
    candidats,
    limit,
    async (m) => {
      const engineResult = await calculerEngineResult(m);
      await runPreMatchAnalysis({
        matchId: m.matchId,
        home: m.home,
        away: m.away,
        league: m.league,
        engineResult,
        sansRepliPayant: true,
        appel: { type: 'avance', mode: budget.mode }
      });
    },
    (m) => `${m.home} - ${m.away}`,
    (m) => {
      // La consommation de l'instant décide : la passe qui franchit les 80 % s'arrête là pour les non-favoris.
      budget = modeBudget();
      if (!budget.politique.avanceFavorisSeulement || favori(m)) return false;
      noterEffetEconome('avance', m.matchId);
      return true;
    }
  );
  return { ...r, mode: budget.mode, raisonMode: budget.raison };
}

const normaliser = (nom) =>
  String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const isoJour = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Un match coté et son match FotMob : coup d'envoi à 6 h près au plus (idFotmobDUnMatchCote). */
const ECART_COTE_FOTMOB_MS = 6 * 3_600_000;
/** Un seul club connu : le match FotMob retenu a son coup d'envoi à 30 min près (l'unicité du club reste comptée sur 6 h). */
const ECART_UN_SEUL_CLUB_MS = 30 * 60_000;
/** L'identifiant FotMob d'un match coté n'est cherché qu'à l'approche du coup d'envoi : le seul moment où il sert. */
const RECHERCHE_FOTMOB_AVANT_MS = (COUP_D_ENVOI_FENETRE_MIN + 15) * 60_000;

/**
 * L'IDENTIFIANT FOTMOB D'UN MATCH COTÉ (21/11/2026). Un match de The Odds API n'a pas d'identifiant FotMob : sa composition
 * était cherchée par les noms (resolveFotMobMatchId, lineupPrefetch.js), qui exigent le MÊME nom pour l'équipe qui se
 * déplace — « FC Baltika Kaliningrad » (The Odds API) s'écrit « Baltika » chez FotMob. La page du match restait
 * introuvable : l'analyse attendait jusqu'à 30 min du coup d'envoi, puis lisait la dernière composition alignée au lieu de
 * celle publiée (6 des 19 analyses au coup d'envoi de matchs cotés du 18 au 21/11/2026, dont Orenburg – Baltika et
 * Gençlerbirliği – Gaziantep). Ici, dans la liste FotMob déjà lue, par les IDENTIFIANTS des clubs (annuaire du magasin,
 * clubDuMagasin) — jamais le rapprocheur souple —, coup d'envoi à 6 h près, un seul candidat :
 *  - les deux clubs connus de l'annuaire : les deux identifiants, chacun à sa place (domicile, extérieur) ; deux clubs
 *    connus qui ne concordent pas avec FotMob = null (rien n'est deviné) ;
 *  - un seul connu, l'autre nom inconnu de l'annuaire (« Stade Lavallois » chez The Odds API, « Laval » chez FotMob ;
 *    « Amed SK » / « Amed Sportif », 21/11/2026) : ce club à SA place, vu une seule fois dans les 6 h — un club ne joue
 *    pas deux matchs à 6 h d'écart —, ET dans la compétition du match coté (FOTMOB_LEAGUES, leagueKeyMatches : ni une
 *    autre compétition, ni une compétition féminine, de jeunes ou de réserves), ET à 30 min près. Avec un seul club, tout
 *    repose sur l'annuaire, qui peut rendre un homonyme d'une autre compétition (« Everton » du Chili lu comme celui de
 *    l'EPL, s'il n'y est connu que sous ce nom) : la compétition et l'heure serrée l'écartent. Vu deux fois, de l'autre
 *    côté, dans une autre compétition, une compétition absente de la table, à plus de 30 min : null. Un intitulé
 *    renommé chez FotMob est traduit vers celui de la table avant la comparaison (« TUR|Süper Lig » depuis le
 *    08/11/2026 : Amed SK – Çaykur Rizespor ; phases finales d'Argentine et de Liga MX : intitulesFotmob.js).
 * Un même match lu deux fois (les listes de deux jours se recouvrent) ne compte qu'une fois.
 * `null` (la recherche par les noms reprend, rien ne change) si aucun des deux clubs n'est connu, si aucun match ou
 * plusieurs conviennent, ou sur une erreur. `club` : injectable pour les essais.
 */
export function idFotmobDUnMatchCote(m, kickoffMs, listeFotmob, database, { club = clubDuMagasin } = {}) {
  try {
    if (!Number.isFinite(kickoffMs)) return null;
    const homeId = club(m?.home, m?.league ?? null, database) || null;
    const awayId = club(m?.away, m?.league ?? null, database) || null;
    if ((!homeId && !awayId) || homeId === awayId) return null;
    const vus = new Set();
    const proches = (Array.isArray(listeFotmob) ? listeFotmob : []).filter((f) => {
      if (!f || !(Math.abs(Date.parse(f.kickoff) - kickoffMs) <= ECART_COTE_FOTMOB_MS)) return false;
      if (f.matchId === null || f.matchId === undefined || f.matchId === '') return true;
      const cle = String(f.matchId);
      if (vus.has(cle)) return false;
      vus.add(cle);
      return true;
    });
    let candidats;
    if (homeId && awayId) candidats = proches.filter((f) => f.homeId === homeId && f.awayId === awayId);
    else {
      const connu = homeId ?? awayId;
      if (proches.filter((f) => f.homeId === connu || f.awayId === connu).length !== 1) return null;
      const competition = FOTMOB_LEAGUES[m?.league] ?? null;
      candidats = proches.filter((f) => (homeId ? f.homeId === homeId : f.awayId === awayId)
        && leagueKeyMatches(competition, intituleDeLaTable(f.leagueKey))
        && Math.abs(Date.parse(f.kickoff) - kickoffMs) <= ECART_UN_SEUL_CLUB_MS);
    }
    return candidats.length === 1 && candidats[0].matchId ? String(candidats[0].matchId) : null;
  } catch {
    return null;
  }
}

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
      // 21/11/2026 : son identifiant FotMob, par les identifiants des deux clubs (idFotmobDUnMatchCote), à l'approche du coup d'envoi.
      if (Number.isFinite(t) && t > maintenant) resultat.push({ m, kickoff: t, fotmobMatchId: t - maintenant <= RECHERCHE_FOTMOB_AVANT_MS ? idFotmobDUnMatchCote(m, t, fotmob, database) : null });
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

/**
 * Le coup d'envoi est-il encore à plus de 3 min (COUP_D_ENVOI_TROP_TARD_MIN) ? Revu quand vient le tour de chaque match,
 * puis juste avant chaque appel à Claude (21/11/2026) : la liste de la passe a été faite plus tôt, et le PC a pu dormir
 * entre-temps. Une heure illisible : non.
 */
function encoreAvantLeCoupDEnvoi(kickoffMs, maintenantMs) {
  if (!Number.isFinite(kickoffMs) || !Number.isFinite(maintenantMs)) return false;
  return kickoffMs - maintenantMs > COUP_D_ENVOI_TROP_TARD_MIN * 60_000;
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
 * Mode économe (étape 4) : une reprise n'a lieu que si au moins
 * `politique.repriseTitulairesHabituelsMin` titulaires habituels ont changé
 * entre la composition analysée et la dernière connue (cf.
 * titulairesHabituelsChanges, lineupContext.js). En mode normal (minimum 1),
 * tout changement de onze suffit, comme avant.
 * @returns {{ reprendre: boolean, habituels: Array|null }}
 */
function reprisePermise(entree, politique) {
  if (!(politique.repriseTitulairesHabituelsMin > 1)) return { reprendre: true, habituels: null };
  const derniere = derniereCompositionConnue(entree.lineupSnapshot?.fotmobMatchId);
  const habituels = titulairesHabituelsChanges(entree.lineupSnapshot, derniere?.onzes);
  return { reprendre: habituels.length >= politique.repriseTitulairesHabituelsMin, habituels };
}

/**
 * Une passe d'avant coup d'envoi (cf. jobs/kickoffAiAnalysis.js, toutes les
 * 5 min). Chaque analyse réussie est comptée sur le plafond du jour aussitôt
 * faite, pas en fin de passe : l'actualisation complète peut tourner en même
 * temps et doit lire le vrai reste.
 *
 * Mode économe (étape 4) : une seule analyse dès la composition — la reprise
 * après un changement de onze seulement si au moins deux titulaires
 * habituels changent (`reprisesEvitees` sinon) — et les favoris d'abord.
 *
 * `tropTard` (21/11/2026) : les matchs laissés parce que leur coup d'envoi était à moins de 3 min, ou passé, à l'une des
 * revues de l'heure (encoreAvantLeCoupDEnvoi) : quand vient leur tour, après la composition, après le moteur, et en
 * dernier juste avant l'appel à Claude (runPreMatchAnalysis, `avantLAppel`). Un match n'y est compté qu'une fois ; le
 * gel des pronostics n'est fait, lui aussi, qu'avant le coup d'envoi.
 *
 * @returns {{ ok, failed, candidates, enAttente, avecCompo, reprises, reprisesEvitees, laisses, tropTard, samples, interrompu, mode, raisonMode }}
 */
export async function runKickoffPreMatchAnalyses({ limit }) {
  const bilan = { ok: 0, failed: 0, candidates: 0, enAttente: 0, avecCompo: 0, reprises: 0, reprisesEvitees: 0, laisses: 0, tropTard: 0, samples: [], interrompu: false };
  if (!isClaudeCodeAuthenticated()) return { ...bilan, nonConfigure: true };

  const budget = modeBudget();
  bilan.mode = budget.mode;
  bilan.raisonMode = budget.raison;
  let aFaire = [];
  for (const { m, minutes, fotmobMatchId, kickoff } of await matchsAuCoupDEnvoi()) {
    const entree = analyseDejaFaite(m);
    if (faiteAuCoupDEnvoiPourCeMatch(entree, m, kickoff)) {
      if (compositionChangee(entree)) {
        const { reprendre } = reprisePermise(entree, budget.politique);
        if (reprendre) aFaire.push({ m, minutes, fotmobMatchId, kickoff, reprise: true });
        // Comptée une fois par match et par composition, même si la boucle repasse.
        else if (noterEffetEconome('reprise', `${m.matchId}|${derniereCompositionConnue(entree.lineupSnapshot?.fotmobMatchId)?.signature ?? ''}`)) bilan.reprisesEvitees++;
      }
      continue;
    }
    aFaire.push({ m, minutes, fotmobMatchId, kickoff, reprise: false });
  }
  if (budget.politique.favorisDabord) aFaire = favorisDabord(aFaire, ({ m }) => ({ home: m.home, away: m.away, league: m.league }));
  bilan.candidates = aFaire.length;

  let pannes = 0;
  for (const { m, minutes, fotmobMatchId, kickoff, reprise } of aFaire) {
    if (bilan.ok + bilan.failed >= limit) {
      // Plafond du jour atteint : compté une seule fois par match, à sa
      // dernière passe avant le coup d'envoi (la boucle repasse toutes les 5 min).
      if (minutes <= COUP_D_ENVOI_TROP_TARD_MIN + 5) bilan.laisses++;
      continue;
    }
    // 21/11/2026 : l'heure revue à chaque pas (encoreAvantLeCoupDEnvoi). La liste de la passe a été faite plus tôt, et une
    // passe a pu dormir avec le PC : Seattle – Real Salt Lake, choisi avant son coup d'envoi (20/11, 03:00 UTC), a été
    // analysé « au coup d'envoi » au réveil, à 12:13 UTC — le match était joué depuis neuf heures. Les analyses d'une passe
    // s'enchaînent aussi (15 à 30 s chacune). Revue avant la composition (lue chez FotMob), avant le moteur et le gel des
    // pronostics (calculerEngineResult), au moment du gel, avant l'analyse, et en dernier dans runPreMatchAnalysis juste
    // avant l'appel à Claude (après les lectures FotMob de la fiche : actualités, composition de repli) : rien de tout cela
    // pour un match commencé.
    const encore = () => encoreAvantLeCoupDEnvoi(kickoff, Date.now());
    const tropTard = () => {
      if (encore()) return false;
      bilan.tropTard++;
      return true;
    };
    if (tropTard()) continue;
    const lineups = await buildLineupContext({ homeName: m.home, awayName: m.away, commenceTimeIso: m.commenceTime, league: m.league, fotmobMatchId });
    // Une reprise sans composition relue ne remplace pas une analyse qui en avait une.
    if (reprise && !lineups) continue;
    // Pas encore de composition : on l'attend jusqu'à 30 min du coup d'envoi.
    if (!lineups && minutes > COUP_D_ENVOI_SANS_COMPO_MIN) {
      bilan.enAttente++;
      continue;
    }
    if (tropTard()) continue;
    try {
      // Le gel, lui aussi, seulement avant le coup d'envoi (le moteur attend ses propres lectures).
      const engineResult = await calculerEngineResult(m, { lineups, origine: ORIGINES.coupDEnvoi, geler: (a) => { if (encore()) gelerEnService(a); } });
      if (tropTard()) continue;
      let tard = false;
      await runPreMatchAnalysis({
        matchId: m.matchId,
        home: m.home,
        away: m.away,
        league: m.league,
        engineResult,
        sansRepliPayant: true,
        lineups,
        timing: 'coup-d-envoi',
        appel: { type: reprise ? 'reprise' : 'coup-d-envoi', mode: budget.mode },
        // 21/11/2026 : la composition de repli lue par l'identifiant FotMob, pas par les noms — celui d'un match coté
        // (idFotmobDUnMatchCote) et, pour un match du calendrier, celui que sa composition publiée lisait déjà.
        fotmobMatchId,
        // 21/11/2026 : la dernière revue de l'heure, juste avant l'appel à Claude ; trop tard : rien d'appelé ni d'enregistré.
        avantLAppel: () => {
          tard = tropTard();
          return !tard;
        }
      });
      if (tard) continue;
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
    return !faiteAuCoupDEnvoiPourCeMatch(analyseDejaFaite(m), m, kickoff);
  }).length;
}

/** Les revues d'après-match. Mode économe (étape 4) : les favoris d'abord. */
export async function runAutoPostMatchReviews({ limit }) {
  if (limit <= 0) return VIDE;
  if (!isClaudeCodeAuthenticated()) return { ...VIDE, nonConfigure: true };

  const since = new Date(Date.now() - FENETRE_APRES_MATCH_JOURS * 86_400_000).toISOString().slice(0, 10);
  let candidats = [];
  for (const m of recentlyFinished({ since })) {
    // Correction S8 : l'entrée la plus avancée du match, rien si une entrée sœur a déjà sa revue.
    const prior = analysePourLaRevue({ homeName: m.homeName, awayName: m.awayName, league: m.league, day: m.date });
    // Date et nom FotMob : l'analyse après-match relit les buts et statistiques du match dans le magasin.
    if (prior) candidats.push({ prior, resultat: { homeGoals: m.homeGoals, awayGoals: m.awayGoals, date: m.date, homeName: m.homeName } });
  }

  const budget = modeBudget();
  if (budget.politique.favorisDabord) candidats = favorisDabord(candidats, ({ prior }) => ({ home: prior.homeName, away: prior.awayName, league: prior.league }));

  const r = await analyserEnSerie(
    candidats,
    limit,
    ({ prior, resultat }) => runPostMatchAnalysis({ matchId: prior.matchId, result: resultat, appel: { type: 'revue', mode: budget.mode } }),
    ({ prior }) => `${prior.homeName} - ${prior.awayName}`
  );
  return { ...r, mode: budget.mode, raisonMode: budget.raison };
}

/** Pour les tests : la décision de reprise, telle que la passe d'avant coup d'envoi la prend. */
export const __testing = { compositionChangee, reprisePermise, faiteAuCoupDEnvoi, encoreAvantLeCoupDEnvoi };
