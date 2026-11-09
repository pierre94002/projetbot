/**
 * settlementService.js — règlement automatique des pronostics et des paris.
 * -----------------------------------------------------------------------
 * Ce que faisait scripts/settle-pending-outcomes.mjs, lancé chaque matin
 * par la tâche Claude supprimée le 24/09/2026, fait désormais partie de
 * l'actualisation de l'appli (jobs/matchStatsAutoRefresh.js), sous le même
 * verrou que les imports. En plus :
 *
 *   - LE BON MATCH. Un pronostic ne connaissait que `day`, le jour de son
 *     PREMIER scan, et le rapprochement tolérait ±1 jour : tout match scanné
 *     plus d'un jour avant d'être joué n'était jamais réglé. On cherche le
 *     jour du match : coup d'envoi enregistré, sinon calendrier de saison,
 *     sinon une fenêtre de dix jours après le scan — toujours DANS LA MÊME
 *     COMPÉTITION : les mêmes clubs se croisent en coupe et en championnat
 *     à quelques jours d'écart.
 *   - LE SCORE SAISI À LA MAIN (« Score final », sous l'identifiant du
 *     match) passe avant tout résultat importé, y compris pour une entrée
 *     déjà réglée automatiquement.
 *   - PROLONGATION ET TIRS AU BUT. Le score final d'un match décidé après
 *     prolongation n'est pas celui des 90 minutes, sur lequel se règlent les
 *     paris. Les PRONOSTICS de ces rencontres restent en attente, à régler à
 *     la main. Les SÉLECTIONS DE PARI de buts (correctif du 02/11/2026) se
 *     règlent sur le score à la 90e, temps additionnel compris, recompté but
 *     par but dans le déroulé FotMob (butsA90 de dayTable.js, la règle du
 *     banc) — seulement si le match est retrouvé par les identifiants FotMob
 *     des deux clubs et que le déroulé a tous les buts ; sinon, en attente,
 *     avec la raison. Le score réglé porte la marque « à la 90e » : il n'est
 *     jamais revu sur le score final, seulement par un nouveau calcul à la
 *     90e ou par un score saisi à la main.
 *   - CORNERS ET TIRS, réglés d'après les statistiques du match en magasin
 *     — sauf un 0 des deux côtés, qui y veut dire « non relevé ». Pour les
 *     paris, le match est retrouvé par les identifiants FotMob des deux clubs
 *     (l'annuaire strict, clubDuMagasin), jamais par la ressemblance des
 *     noms ; une statistique non relevée laisse le pari en attente (jamais
 *     « 0 corner ») ; un match prolongé aussi (FotMob compte sur 120 min).
 *   - LA RAISON D'UNE ATTENTE se lit, pour Mes paris, par
 *     reglementPourLaLecture (calculée à la lecture, jamais écrite).
 *   - SCORE CORRIGÉ. Chaque règlement automatique garde le score qui l'a
 *     décidé ; si ce score change, le règlement est revu. Un statut posé à la
 *     main n'est jamais touché d'office.
 *   - CONTRADICTIONS. Un statut posé autrement (à la main, ou par l'ancien
 *     script sur un score partiel) qui contredit un score final SÛR est
 *     signalé — et corrigé seulement sur demande, ligne par ligne
 *     (resettleContradictions).
 *
 * Les issues viennent de core/settlement/settlementRules.js, copie ligne
 * pour ligne des règles de l'interface.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createResultLookup, listMatchResults } from '../repositories/matchResultsRepository.js';
import { listPredictions, applyPredictionSettlements } from '../repositories/predictionsRepository.js';
import { listBets, applyBetLegSettlements } from '../repositories/betsRepository.js';
import { deriveActualOutcome, deriveBetLegOutcome } from '../../core/settlement/settlementRules.js';
import { readJsonFile } from '../../utils/atomicJson.js';
import { teamNamesLikelyMatch } from '../../utils/teamNameMatch.js';
import { openDb } from '../db/matchStatsDb.js';
// Correctif du règlement (02/11/2026) : deux modules gelés pendant l'essai 27, importés TELS QUELS (déjà chargés par le
// serveur : dayTable.js par la nuit, oddsProfileRead.js par le gel des pronostics).
import { butsA90 } from '../db/dayTable.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CALENDAR_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/season-calendar.json');

const JOUR_MS = 86_400_000;
const FENETRE_SANS_DATE = 10;
const HORIZON_CALENDRIER = 60;
const ECHANTILLONS = 25;
const ECHANTILLONS_CONTRADICTIONS = 100;
/**
 * Les statuts déjà posés ne sont revus (score corrigé, contradiction) que
 * pour les rencontres des trente derniers jours : une source corrige un
 * score dans la semaine, pas des mois après, et relire tout l'historique à
 * chaque passe coûterait de plus en plus cher (tout est synchrone).
 */
const REVUE_JOURS = 30;
const PROLONGATION = new Set(['afterextra', 'afterpenalties']);

const scoreDe = (r) => `${r.homeGoals}-${r.awayGoals}`;
const dateDuResultat = (r) => (typeof r.matchId === 'string' ? /(\d{4}-\d{2}-\d{2})/.exec(r.matchId)?.[1] ?? null : null);
const plusJours = (iso, n) => new Date(Date.parse(iso) + n * JOUR_MS).toISOString().slice(0, 10);

/** Clé d'une contradiction, telle que l'interface la renvoie pour la corriger. */
export const cleContradiction = (c) => (c.kind === 'pari' ? `pari:${c.betId}:${c.legIndex}` : `pronostic:${c.id}`);

/**
 * Jour où se joue une rencontre, d'après le calendrier : la première
 * rencontre de ces deux équipes DANS CETTE COMPÉTITION à partir de la veille
 * du jour donné. `null` si le calendrier ne la connaît pas.
 */
function creerChercheurCalendrier() {
  let parJour = null;
  const connus = new Map();
  return (homeName, awayName, depuis, league) => {
    if (!parJour) {
      parJour = new Map();
      let calendrier = [];
      try {
        calendrier = readJsonFile(CALENDAR_FILE_PATH, []);
      } catch {
        calendrier = [];
      }
      for (const m of calendrier) {
        if (!m?.date) continue;
        const liste = parJour.get(m.date) ?? [];
        liste.push(m);
        parJour.set(m.date, liste);
      }
    }
    const cle = `${homeName}|${awayName}|${depuis}|${league ?? ''}`;
    if (connus.has(cle)) return connus.get(cle);
    // Jour par jour à partir de la veille : la première rencontre trouvée
    // est la bonne, et la plupart le sont en quelques jours.
    let trouve = null;
    for (let i = -1; i <= HORIZON_CALENDRIER && !trouve; i++) {
      const jour = plusJours(depuis, i);
      const m = (parJour.get(jour) ?? []).find(
        (x) => (!league || !x.league || x.league === league) && teamNamesLikelyMatch(x.homeName, homeName) && teamNamesLikelyMatch(x.awayName, awayName)
      );
      if (m) trouve = jour;
    }
    connus.set(cle, trouve);
    return trouve;
  };
}

/**
 * La rencontre du magasin (à un jour près, même compétition) : comment elle
 * s'est terminée (prolongation, tirs au but) et ses statistiques d'équipe.
 * Les lignes d'une journée d'une compétition sont lues une fois, puis
 * gardées : une passe interroge quelques dizaines de rencontres.
 */
function creerChercheurRencontre(database) {
  let requete = null;
  const lignesDuJour = new Map();
  const connus = new Map();
  const lire = (jour, league) => {
    if (!lignesDuJour.has(jour)) lignesDuJour.set(jour, lireJour(jour));
    const toutes = lignesDuJour.get(jour);
    return league ? toutes.filter((r) => r.league === league) : toutes;
  };
  const lireJour = (jour) => {
    requete ??= database.prepare(`
      SELECT m.league, m.home_name, m.away_name, json_extract(m.meta, '$.reason') AS reason,
             th.corner_kicks AS hc, ta.corner_kicks AS ac,
             th.total_shots AS hs, ta.total_shots AS as_,
             th.shots_on_goal AS hsot, ta.shots_on_goal AS asot
      FROM matches m
      LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
      LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
      WHERE m.date = ?`);
    return requete.all(jour);
  };
  // Un 0 des deux côtés veut dire « non relevé » dans team_stats (la
  // colonne n'y est jamais NULL) : un 0-0 aux corners n'est pas un résultat.
  const paire = (h, a) => {
    const nh = Number(h);
    const na = Number(a);
    if (h === null || a === null || !Number.isFinite(nh) || !Number.isFinite(na) || (nh === 0 && na === 0)) return [null, null];
    return [nh, na];
  };
  return (date, homeName, awayName, league) => {
    if (!date) return null;
    const cle = `${date}|${homeName}|${awayName}|${league ?? ''}`;
    if (connus.has(cle)) return connus.get(cle);
    let trouve = null;
    try {
      for (const jour of [date, plusJours(date, -1), plusJours(date, 1)]) {
        trouve = lire(jour, league).find((r) => teamNamesLikelyMatch(r.home_name, homeName) && teamNamesLikelyMatch(r.away_name, awayName)) ?? null;
        if (trouve) break;
      }
    } catch {
      trouve = null;
    }
    let valeur = null;
    if (trouve) {
      const [hc, ac] = paire(trouve.hc, trouve.ac);
      const [hs, as] = paire(trouve.hs, trouve.as_);
      const [hsot, asot] = paire(trouve.hsot, trouve.asot);
      valeur = {
        reason: trouve.reason ?? null,
        stats: {
          home: { corners: hc, shots: hs, shotsOnTarget: hsot },
          away: { corners: ac, shots: as, shotsOnTarget: asot }
        }
      };
    }
    connus.set(cle, valeur);
    return valeur;
  };
}

/**
 * Résultat d'une rencontre, dans cet ordre :
 *   1. le score saisi à la main sous l'identifiant du match ;
 *   2. le résultat qui a déjà décidé un règlement automatique ;
 *   3. autour du coup d'envoi, sinon du jour trouvé au calendrier, sinon
 *      dans les dix jours qui suivent la référence — même compétition.
 */
function chercherResultat({ matchId, homeName, awayName, league, commenceTime, depuis, settledResultId }, trouver, chercherCalendrier) {
  const direct = trouver(matchId, null, homeName, awayName);
  if (direct) return direct;
  if (settledResultId) {
    const meme = trouver(settledResultId, null, homeName, awayName);
    if (meme) return meme;
  }
  if (commenceTime) return trouver(matchId, commenceTime.slice(0, 10), homeName, awayName, { league });
  const jourMatch = depuis ? chercherCalendrier(homeName, awayName, depuis, league) : null;
  if (jourMatch) return trouver(matchId, jourMatch, homeName, awayName, { league });
  return trouver(matchId, depuis, homeName, awayName, { before: 1, after: FENETRE_SANS_DATE, league });
}

/** Jour de référence : coup d'envoi s'il est connu, sinon jour du premier scan / de la saisie du pari. */
const referenceDuPronostic = (entry) => (entry.commenceTime ?? entry.day ?? '').slice(0, 10) || null;
const referenceDeLaSelection = (leg, bet) => (leg.commenceTime ?? bet.createdAt ?? '').slice(0, 10) || null;

/**
 * Le résultat trouvé est-il SÛREMENT celui du match ? Oui s'il porte le
 * même identifiant (score saisi à la main), ou s'il tombe à un jour près du
 * jour de référence. Une contradiction ne se signale que sur cette base.
 */
function dateSure(result, reference, matchId) {
  if (result.matchId === matchId) return true;
  const d = dateDuResultat(result);
  if (!d || !reference) return false;
  return Math.abs(Date.parse(d) - Date.parse(reference)) <= JOUR_MS;
}

const statutPronostic = (entry, result, stats = null) => {
  const actual = deriveActualOutcome(entry, result.homeGoals, result.awayGoals, stats);
  return actual === null ? null : actual === entry.predictedOutcome ? 'correct' : 'incorrect';
};

// ============================================================================
// Correctif du règlement des VRAIS paris (02/11/2026) — les sélections de pari seulement ; les pronostics ci-dessus et
// ci-dessous ne changent pas d'un caractère.
// ============================================================================

/** La marque d'un règlement à la 90e dans `settledScore` : « 1-1 à la 90e (prolongation) ». */
const A_LA_90E = /^(\d+)-(\d+) à la 90e \(([^)]+)\)$/;
/** Coup d'envoi passé depuis : 3 h pour dire pourquoi un pari attend ; 6 h pour dire qu'aucun résultat n'est arrivé. */
const HEURE_MS = 3_600_000;
const APRES_COUP_D_ENVOI = 3 * HEURE_MS;
const SANS_RESULTAT_APRES = 6 * HEURE_MS;

/**
 * Le genre de règle d'un marché, sondé sur la règle GELÉE (settlementRules.js) : 'buts' (une issue sans statistiques),
 * 'statistiques' (une issue seulement avec des statistiques d'essai : corners, tirs, tirs cadrés) ou null (aucune règle).
 */
const STATS_D_ESSAI = Object.freeze({ home: { corners: 7, shots: 13, shotsOnTarget: 5 }, away: { corners: 3, shots: 8, shotsOnTarget: 2 } });
function regleDuMarche(leg) {
  if (deriveBetLegOutcome(leg, 1, 0, null) !== null) return 'buts';
  if (deriveBetLegOutcome(leg, 1, 0, STATS_D_ESSAI) !== null) return 'statistiques';
  return null;
}

/**
 * Les statistiques d'un match du magasin pour la règle gelée : une valeur NON RELEVÉE est ABSENTE (jamais `null`, que la
 * règle gelée lirait comme 0 : `Number(null)` vaut 0). Un 0 des deux côtés veut dire « non relevé » dans team_stats ; une
 * seule équipe relevée : rien des deux.
 */
function statsDuMagasin(ligne) {
  const home = {};
  const away = {};
  for (const [cle, h, a] of [['corners', ligne.hc, ligne.ac], ['shots', ligne.hs, ligne.as_], ['shotsOnTarget', ligne.hsot, ligne.asot]]) {
    if (h === null || h === undefined || a === null || a === undefined) continue;
    const nh = Number(h);
    const na = Number(a);
    if (!Number.isFinite(nh) || !Number.isFinite(na) || (nh === 0 && na === 0)) continue;
    home[cle] = nh;
    away[cle] = na;
  }
  return { home, away };
}

/** Une ligne du magasin lue pour le règlement : fin, score, déroulé, statistiques. */
function lireLaRencontre(ligne) {
  let meta = {};
  try {
    meta = JSON.parse(ligne.meta ?? '{}') ?? {};
  } catch {
    meta = {};
  }
  let events = null;
  try {
    const ev = JSON.parse(ligne.events ?? 'null');
    events = Array.isArray(ev) ? ev : null;
  } catch {
    events = null;
  }
  const reason = meta.reason ?? null;
  return {
    etat: 'trouve',
    reason,
    prolonge: PROLONGATION.has(reason),
    attribue: meta.awarded === true || meta.awarded === 1 || reason === 'awarded_win' || reason === 'id_reused',
    // Entré SANS page FotMob (fotMobRefresh.entreeDepuis(null, …)) : ni fin, ni heure, ni déroulé — une prolongation y
    // serait invisible. La page est redemandée aux passes suivantes (recentNoSheet).
    finInconnue: Boolean(meta.noSheet) && meta.kickoff == null && reason === null && ligne.events == null,
    hg: ligne.hg === null || ligne.hg === undefined ? null : Number(ligne.hg),
    ag: ligne.ag === null || ligne.ag === undefined ? null : Number(ligne.ag),
    events,
    stats: statsDuMagasin(ligne)
  };
}

/**
 * Le RATTACHEMENT par identifiants FotMob : les deux clubs par l'annuaire strict de la nuit (clubDuMagasin, gelé — nom
 * exact, alias enregistré, mêmes mots, tous les mots ; jamais une ressemblance), puis LE match du magasin entre ces deux
 * numéros, dans ce sens, à un jour près, dans cette compétition. Une erreur de l'annuaire vaut « non reconnu » ; une
 * erreur du magasin remonte (la sélection reste en attente, « erreur »).
 */
function creerRattacheur(database) {
  const clubs = new Map();
  let requete = null;
  const club = (nom, league) => {
    const cle = `${league ?? ''}|${nom ?? ''}`;
    if (!clubs.has(cle)) {
      let id = null;
      try {
        id = nom ? clubDuMagasin(nom, league, database) : null;
      } catch {
        id = null;
      }
      clubs.set(cle, id);
    }
    return clubs.get(cle);
  };
  return (homeName, awayName, league, jour) => {
    const idDom = club(homeName, league);
    if (!idDom) return { etat: 'equipe-non-reconnue', club: homeName };
    const idExt = club(awayName, league);
    if (!idExt || idExt === idDom) return { etat: 'equipe-non-reconnue', club: awayName };
    if (!jour) return { etat: 'match-introuvable' };
    requete ??= database.prepare(`
      SELECT m.league, m.home_goals AS hg, m.away_goals AS ag, m.meta, m.events,
             th.corner_kicks AS hc, ta.corner_kicks AS ac,
             th.total_shots AS hs, ta.total_shots AS as_,
             th.shots_on_goal AS hsot, ta.shots_on_goal AS asot
      FROM matches m
      LEFT JOIN team_stats th ON th.match_key = m.match_key AND th.side = 'home'
      LEFT JOIN team_stats ta ON ta.match_key = m.match_key AND ta.side = 'away'
      WHERE m.home_id = ? AND m.away_id = ? AND m.date BETWEEN ? AND ?`);
    const lignes = requete.all(idDom, idExt, plusJours(jour, -1), plusJours(jour, 1)).filter((r) => !league || r.league === league);
    if (!lignes.length) return { etat: 'match-introuvable' };
    if (lignes.length > 1) return { etat: 'deux-rencontres' };
    return lireLaRencontre(lignes[0]);
  };
}

/** Ce que la prolongation a recouvert : « prolongation », « tirs au but » (aucun événement après la 90e) ou les deux. */
export function quoiDeLaProlongation(reason, events) {
  if (reason === 'afterextra') return 'prolongation';
  return events.some((e) => Number.isFinite(Number(e?.minute)) && Number(e.minute) > 90) ? 'prolongation et tirs au but' : 'tirs au but';
}

const enAttenteCar = (code, details = {}, prolongee = false) => ({ attente: code, details, prolongee });
const regleSur = (issue, score, a90 = false) => (issue === null ? enAttenteCar('pas-de-regle') : { issue, score, a90 });

/**
 * La décision d'UNE sélection de pari dont le résultat est trouvé : { issue, score, a90 } ou { attente, details,
 * prolongee }. `outils` : { rattacherParIds, rencontreDe } (rencontreDe = le frein d'avant, par les noms, pour les seuls paris
 * de buts non rattachés : il ne peut que laisser en attente).
 */
export function decisionDeLaSelection(leg, result, { rattacherParIds, rencontreDe }) {
  const h = result.homeGoals;
  const a = result.awayGoals;
  const scoreFinal = `${h}-${a}`;
  const saisieMain = result.matchId === leg.matchId;
  const regle = regleDuMarche(leg);
  if (!regle) return enAttenteCar('pas-de-regle');
  // Un score saisi à la main fait foi tel quel pour les buts : jamais rattaché (même magasin en panne).
  if (regle === 'buts' && saisieMain) return regleSur(deriveBetLegOutcome(leg, h, a, null), scoreFinal);
  const jour = dateDuResultat(result) ?? ((leg.commenceTime ?? '').slice(0, 10) || null);
  const r = rattacherParIds(leg.homeName, leg.awayName, leg.league ?? null, jour);
  if (r.etat !== 'trouve') {
    if (regle === 'statistiques') return enAttenteCar(r.etat, r.club ? { club: r.club } : {});
    // Buts, match non rattaché : le frein d'avant, par les noms. Sinon, le score final, comme avant.
    if (!saisieMain && PROLONGATION.has(rencontreDe(result, leg.homeName, leg.awayName, leg.league)?.reason)) {
      return enAttenteCar('prolongation-non-identifiee', {}, true);
    }
    return regleSur(deriveBetLegOutcome(leg, h, a, null), scoreFinal);
  }
  if (r.finInconnue) return enAttenteCar('fin-inconnue');
  if (r.attribue) return enAttenteCar('match-attribue');
  if (r.hg !== h || r.ag !== a) {
    const b = Number.isFinite(r.hg) && Number.isFinite(r.ag) ? `${r.hg}-${r.ag}` : 'aucun';
    return enAttenteCar('scores-divergents', { a: scoreFinal, b }, r.prolonge);
  }
  if (regle === 'statistiques') {
    if (r.prolonge) return enAttenteCar('prolongation-statistiques', {}, true);
    const issue = deriveBetLegOutcome(leg, h, a, r.stats);
    return issue === null ? enAttenteCar('statistiques-non-relevees') : regleSur(issue, scoreFinal);
  }
  if (!r.prolonge) return regleSur(deriveBetLegOutcome(leg, h, a, null), scoreFinal);
  if (!r.events) return enAttenteCar('prolongation-sans-deroule', {}, true);
  const a90 = butsA90({ hg: r.hg, ag: r.ag, prolongation: true }, r.events);
  if (!a90) return enAttenteCar('prolongation-deroule-incomplet', {}, true);
  return regleSur(deriveBetLegOutcome(leg, a90.dom, a90.ext, null), `${a90.dom}-${a90.ext} à la 90e (${quoiDeLaProlongation(r.reason, r.events)})`, true);
}

/** Les phrases de Mes paris (français simple ; la vraie provenance des données). */
export const PHRASES_DU_REGLEMENT = Object.freeze({
  'regle-a-la-90e': ({ score, quoi }) =>
    `Réglé sur le score à la 90e (${quoi === 'prolongation' ? 'prolongation non comptée' : quoi === 'tirs au but' ? 'tirs au but non comptés' : 'prolongation et tirs au but non comptés'}) : ${score}, recompté but par but dans le déroulé FotMob du match, comme chez les bookmakers.`,
  'prolongation-deroule-incomplet': () =>
    "En attente : le match est allé en prolongation, et FotMob n'a pas donné la minute de tous les buts. Le score à la 90e n'est pas sûr : réglez ce pari à la main.",
  'prolongation-sans-deroule': () =>
    "En attente : le match est allé en prolongation, et FotMob n'a publié aucun déroulé. Réglez ce pari à la main avec le score à la 90e.",
  'prolongation-statistiques': () =>
    "En attente : match allé en prolongation ou aux tirs au but. L'appli ne règle pas toute seule les corners et les tirs de ces matchs (FotMob ne les donne pas minute par minute, et peut compter les tirs de la séance). Réglez ce pari à la main.",
  'prolongation-non-identifiee': () =>
    "En attente : le match est allé en prolongation, et l'appli ne le retrouve pas par les numéros FotMob des deux clubs. Réglez ce pari à la main.",
  'equipe-non-reconnue': ({ club }) =>
    `En attente : l'appli ne reconnaît pas « ${club ?? 'un des deux clubs'} » par son numéro FotMob, et ne règle jamais à la ressemblance des noms. Réglez ce pari à la main.`,
  'match-introuvable': () =>
    "En attente : ce match n'est pas dans les matchs FotMob relevés (ces deux clubs, à cette date, dans cette compétition). Réglez ce pari à la main.",
  'deux-rencontres': () => 'En attente : FotMob a deux matchs possibles pour ces deux clubs à cette date. Réglez ce pari à la main.',
  'scores-divergents': ({ a, b }) =>
    `En attente : le score du fichier des résultats (${a}) et celui de la page FotMob du match (${b}) ne s'accordent pas. Réglez ce pari à la main.`,
  'statistiques-non-relevees': () => "En attente : FotMob n'a pas publié les corners ou les tirs de ce match. Réglez ce pari à la main.",
  'fin-inconnue': () =>
    "En attente : FotMob n'a pas encore publié la page de ce match ; on ne sait pas s'il est allé en prolongation. Il se réglera tout seul quand elle arrivera.",
  'match-attribue': () =>
    "En attente : match attribué sur tapis vert, le score officiel n'est pas celui du terrain. Réglez ce pari à la main.",
  'pas-de-regle': () => "En attente : l'appli ne sait pas régler ce marché toute seule. Réglez ce pari à la main.",
  'pas-de-resultat': () =>
    'En attente : aucun résultat relevé pour ce match (reporté ? noms écrits autrement ?). Il se réglera tout seul à son arrivée ; sinon, réglez-le à la main.',
  'a-la-prochaine-passe': () => 'Résultat arrivé : ce pari sera réglé à la prochaine actualisation.',
  erreur: () => "En attente : le magasin FotMob n'a pas pu être lu. Nouvel essai à la prochaine actualisation."
});

const phrase = (code, details = {}) => (PHRASES_DU_REGLEMENT[code] ?? PHRASES_DU_REGLEMENT['pas-de-regle'])(details);

/** Les outils de la décision, sur une base donnée (le rattacheur et le frein par noms d'avant). */
function outilsDeLaDecision(database) {
  const chercherRencontre = creerChercheurRencontre(database);
  return {
    rattacherParIds: creerRattacheur(database),
    rencontreDe: (result, homeName, awayName, league) => chercherRencontre(dateDuResultat(result), homeName, awayName, league)
  };
}

/**
 * Parcourt les deux journaux et classe chaque entrée : à régler, à revoir
 * (règlement automatique dont le score a changé), en contradiction (statut
 * posé autrement qui contredit un score sûr). N'écrit rien.
 */
function analyser(database) {
  const resultats = listMatchResults();
  const trouver = createResultLookup(resultats);
  const chercherCalendrier = creerChercheurCalendrier();
  const chercherRencontre = creerChercheurRencontre(database);

  const rapport = {
    predictions: { pending: 0, settled: 0, correct: 0, incorrect: 0, resettled: 0, noResult: 0, noRule: 0, extraTime: 0 },
    bets: { pendingLegs: 0, settled: 0, won: 0, lost: 0, resettled: 0, noResult: 0, noRule: 0, extraTime: 0, regleA90: 0, attentes: {}, erreurs: 0 },
    contradictions: { count: 0, samples: [] },
    extraTime: [],
    samples: [],
    results: resultats.length
  };
  const plan = { pronostics: [], selections: [], contradictions: new Map(), attentes: new Map() };
  const noter = (ligne) => {
    if (rapport.samples.length < ECHANTILLONS) rapport.samples.push(ligne);
  };
  const contredire = (ligne, decision) => {
    rapport.contradictions.count++;
    plan.contradictions.set(cleContradiction(ligne), decision);
    if (rapport.contradictions.samples.length < ECHANTILLONS_CONTRADICTIONS) rapport.contradictions.samples.push({ ...ligne, key: cleContradiction(ligne) });
  };
  const limiteRevue = plusJours(new Date().toISOString().slice(0, 10), -REVUE_JOURS);
  const tropAncien = (reference) => !reference || reference < limiteRevue;
  const rencontreDe = (result, homeName, awayName, league) => chercherRencontre(dateDuResultat(result), homeName, awayName, league);
  const outils = { rattacherParIds: creerRattacheur(database), rencontreDe };

  for (const entry of listPredictions()) {
    const enAttente = entry.status === 'pending';
    const auto = entry.settledBy === 'auto';
    if (enAttente) rapport.predictions.pending++;
    if (!enAttente && entry.status === 'void') continue;

    const reference = referenceDuPronostic(entry);
    if (!enAttente && tropAncien(reference)) continue;
    // Statut posé autrement : seule une rencontre à un jour près de la
    // référence peut le contredire, inutile de chercher plus loin.
    const result = !enAttente && !auto
      ? trouver(entry.matchId, reference, entry.homeName, entry.awayName, { league: entry.league })
      : chercherResultat(
          { matchId: entry.matchId, homeName: entry.homeName, awayName: entry.awayName, league: entry.league, commenceTime: entry.commenceTime, depuis: entry.day, settledResultId: auto ? entry.settledResultId : null },
          trouver,
          chercherCalendrier
        );
    if (!result) {
      if (enAttente) rapport.predictions.noResult++;
      continue;
    }
    const score = scoreDe(result);
    const libelle = `${entry.homeName} ${score} ${entry.awayName} · ${entry.market} : ${entry.predictedLabel}`;
    // Un score saisi à la main (même identifiant) fait foi tel quel ; un
    // résultat importé d'un match prolongé ne dit rien des 90 minutes.
    const saisieMain = result.matchId === entry.matchId;
    const rencontre = rencontreDe(result, entry.homeName, entry.awayName, entry.league);
    if (!saisieMain && PROLONGATION.has(rencontre?.reason)) {
      if (enAttente) {
        rapport.predictions.extraTime++;
        if (rapport.extraTime.length < ECHANTILLONS) rapport.extraTime.push({ kind: 'pronostic', label: libelle });
      }
      continue;
    }
    // Les statistiques du match (corners, tirs) servent aux seuls marchés qui en ont besoin.
    const statut = statutPronostic(entry, result, rencontre?.stats ?? null);
    if (statut === null) {
      if (enAttente) rapport.predictions.noRule++;
      continue;
    }
    const decision = { id: entry.id, status: statut, score, resultId: result.matchId };

    if (enAttente) {
      plan.pronostics.push(decision);
      rapport.predictions.settled++;
      rapport.predictions[statut]++;
      noter({ kind: 'pronostic', label: libelle, status: statut });
    } else if (auto) {
      // Réglé automatiquement : revu si le score qui l'a décidé a changé.
      if (entry.settledScore !== score || entry.settledResultId !== result.matchId) {
        plan.pronostics.push(decision);
        if (statut !== entry.status) {
          rapport.predictions.resettled++;
          noter({ kind: 'pronostic revu', label: libelle, status: statut, before: entry.status });
        }
      }
    } else if (statut !== entry.status && dateSure(result, reference, entry.matchId)) {
      contredire({ kind: 'pronostic', id: entry.id, label: libelle, status: entry.status, expected: statut, settledAt: entry.settledAt ?? null }, decision);
    }
  }

  for (const bet of listBets()) {
    bet.legs.forEach((leg, legIndex) => {
      // Sélection d'un ticket d'avant le suivi par sélection : le statut
      // est porté par le ticket (cf. betsRepository.completerStatuts).
      const statutActuel = leg.status ?? (bet.legs.length === 1 ? bet.status : 'pending');
      const enAttente = statutActuel === 'pending';
      const auto = leg.settledBy === 'auto';
      if (enAttente) rapport.bets.pendingLegs++;
      if (!enAttente && statutActuel === 'void') return;
      // Ticket combiné déjà réglé dont une sélection n'a pas de statut propre :
      // on n'y touche pas, la régler rouvrirait le ticket.
      if (enAttente && !leg.status && bet.status && bet.status !== 'pending') return;

      const reference = referenceDeLaSelection(leg, bet);
      if (!enAttente && tropAncien(reference)) return;
      const result = !enAttente && !auto
        ? trouver(leg.matchId, reference, leg.homeName, leg.awayName, { league: leg.league })
        : chercherResultat(
            { matchId: leg.matchId, homeName: leg.homeName, awayName: leg.awayName, league: leg.league, commenceTime: leg.commenceTime, depuis: (bet.createdAt ?? '').slice(0, 10), settledResultId: auto ? leg.settledResultId : null },
            trouver,
            chercherCalendrier
          );
      if (!result) {
        if (enAttente) rapport.bets.noResult++;
        return;
      }
      // Correctif du 02/11/2026 : la décision par identifiants FotMob, et à la 90e pour un match prolongé.
      let d;
      try {
        d = decisionDeLaSelection(leg, result, outils);
      } catch (error) {
        rapport.bets.erreurs++;
        d = enAttenteCar('erreur', { message: String(error?.message ?? error).slice(0, 200) });
      }
      const score = d.score ?? scoreDe(result);
      const libelle = `${leg.homeName} ${score} ${leg.awayName} · ${leg.market} : ${leg.pick}`;
      if (d.attente) {
        if (enAttente) {
          rapport.bets.attentes[d.attente] = (rapport.bets.attentes[d.attente] ?? 0) + 1;
          plan.attentes.set(`${bet.id}:${legIndex}`, d);
          if (d.prolongee) {
            rapport.bets.extraTime++;
            if (rapport.extraTime.length < ECHANTILLONS) rapport.extraTime.push({ kind: 'pari', label: libelle });
          } else rapport.bets.noRule++;
        }
        return;
      }
      const issue = d.issue;
      const decision = { betId: bet.id, legIndex, status: issue, score, resultId: result.matchId };
      if (enAttente) {
        plan.selections.push(decision);
        rapport.bets.settled++;
        rapport.bets[issue]++;
        if (d.a90) rapport.bets.regleA90++;
        noter({ kind: 'pari', label: libelle, status: issue });
      } else if (auto) {
        // Réglée à la 90e : jamais revue sur le score final (un nouveau calcul à la 90e ou un score saisi à la main, seuls).
        if (A_LA_90E.test(leg.settledScore ?? '') && !d.a90 && result.matchId !== leg.matchId) return;
        if (leg.settledScore !== score || leg.settledResultId !== result.matchId) {
          plan.selections.push(decision);
          if (issue !== statutActuel) {
            rapport.bets.resettled++;
            noter({ kind: 'pari revu', label: libelle, status: issue, before: statutActuel });
          }
        }
      } else if (issue !== statutActuel && dateSure(result, reference, leg.matchId)) {
        contredire({ kind: 'pari', betId: bet.id, legIndex, label: libelle, status: statutActuel, expected: issue, settledAt: bet.settledAt ?? null }, decision);
      }
    });
  }
  return { rapport, plan };
}

/**
 * Passe complète : règle ce qui attend, revoit les règlements automatiques
 * dont le score a changé, recense les contradictions sans y toucher.
 * `apply: false` fait tout sauf écrire (rapport, essais).
 */
export function settlePending({ apply = true, database = openDb() } = {}) {
  const { rapport, plan } = analyser(database);
  if (apply) {
    applyPredictionSettlements(plan.pronostics);
    applyBetLegSettlements(plan.selections);
  }
  rapport.applied = apply;
  return rapport;
}

/**
 * Corrige, à la demande, les statuts qui contredisent un score final sûr.
 * Seulement ceux dont la clé est dans `keys` — les lignes que l'utilisateur
 * a vues — et seulement s'ils sont TOUJOURS en contradiction au moment du
 * clic : un statut reposé à la main entre-temps n'est pas touché. Ils
 * deviennent des règlements automatiques, revus si le score change encore.
 *
 * @returns {{ predictions: number, betLegs: number, remaining: object }}
 */
export function resettleContradictions({ keys = [], database = openDb() } = {}) {
  const voulues = new Set(keys);
  const { plan } = analyser(database);
  const pronostics = [];
  const selections = [];
  for (const [cle, decision] of plan.contradictions) {
    if (!voulues.has(cle)) continue;
    if (cle.startsWith('pari:')) selections.push(decision);
    else pronostics.push(decision);
  }
  const resultat = { predictions: applyPredictionSettlements(pronostics), betLegs: applyBetLegSettlements(selections) };
  // Ce qui reste en contradiction après la correction, pour l'affichage.
  resultat.remaining = analyser(database).rapport.contradictions;
  return resultat;
}

/**
 * Ce que Mes paris dit sous une sélection (correctif du 02/11/2026) — calculé à la LECTURE du carnet, jamais écrit :
 *   - réglée d'office à la 90e : la phrase « Réglé sur le score à la 90e… » (lue dans `settledScore`, sans rien chercher) ;
 *   - en attente, coup d'envoi passé de 3 h (sans heure : pari de plus d'un jour) et résultat arrivé : la raison de
 *     l'attente, ou « réglé à la prochaine actualisation » ;
 *   - en attente sans résultat, 6 h après le coup d'envoi (sans heure : passé la fenêtre de dix jours) : « aucun résultat
 *     relevé ».
 * La base n'est ouverte que s'il y a une sélection en attente au résultat arrivé. `toutes: true` (comparaison) : toutes
 * les sélections en attente, sans condition d'heure. Rend { [id du pari]: { [n° de sélection]: { etat, code, texte } } }
 * (un pari sans rien à dire est absent) ; une erreur rend {}.
 */
export function reglementPourLaLecture({ bets = listBets(), database = null, maintenant = Date.now(), toutes = false } = {}) {
  try {
    const rendu = {};
    const poser = (bet, legIndex, valeur) => {
      rendu[bet.id] ??= {};
      rendu[bet.id][legIndex] = valeur;
    };
    const aExaminer = [];
    for (const bet of bets ?? []) {
      (bet?.legs ?? []).forEach((leg, legIndex) => {
        const statut = leg.status ?? (bet.legs.length === 1 ? bet.status : 'pending');
        if (statut !== 'pending') {
          const m = leg.settledBy === 'auto' && (statut === 'won' || statut === 'lost') ? A_LA_90E.exec(leg.settledScore ?? '') : null;
          if (m) poser(bet, legIndex, { etat: 'regle-a-la-90e', code: 'regle-a-la-90e', texte: phrase('regle-a-la-90e', { score: `${m[1]}-${m[2]}`, quoi: m[3] }) });
          return;
        }
        if (!leg.status && bet.status && bet.status !== 'pending') return;
        const coup = Date.parse(leg.commenceTime ?? '');
        const cree = Date.parse(bet.createdAt ?? '');
        const passe = Number.isFinite(coup) ? maintenant - coup >= APRES_COUP_D_ENVOI : Number.isFinite(cree) && maintenant - cree >= 24 * HEURE_MS;
        if (!toutes && !passe) return;
        const sansResultatDepuis = Number.isFinite(coup)
          ? maintenant - coup >= SANS_RESULTAT_APRES
          : Number.isFinite(cree) && maintenant - cree >= (FENETRE_SANS_DATE + 1) * 24 * HEURE_MS;
        aExaminer.push({ bet, leg, legIndex, sansResultatDepuis });
      });
    }
    if (!aExaminer.length) return rendu;
    const trouver = createResultLookup(listMatchResults());
    const chercherCalendrier = creerChercheurCalendrier();
    const avecResultat = [];
    for (const x of aExaminer) {
      const result = chercherResultat(
        { matchId: x.leg.matchId, homeName: x.leg.homeName, awayName: x.leg.awayName, league: x.leg.league, commenceTime: x.leg.commenceTime, depuis: (x.bet.createdAt ?? '').slice(0, 10), settledResultId: null },
        trouver,
        chercherCalendrier
      );
      if (result) avecResultat.push({ ...x, result });
      else if (toutes || x.sansResultatDepuis) poser(x.bet, x.legIndex, { etat: 'en-attente', code: 'pas-de-resultat', texte: phrase('pas-de-resultat') });
    }
    if (!avecResultat.length) return rendu;
    const outils = outilsDeLaDecision(database ?? openDb());
    for (const x of avecResultat) {
      let d;
      try {
        d = decisionDeLaSelection(x.leg, x.result, outils);
      } catch {
        d = enAttenteCar('erreur');
      }
      const code = d.attente ?? 'a-la-prochaine-passe';
      poser(x.bet, x.legIndex, { etat: 'en-attente', code, texte: phrase(code, d.details ?? {}) });
    }
    return rendu;
  } catch {
    return {};
  }
}
