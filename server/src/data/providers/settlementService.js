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
 *     paris. Ces rencontres ne sont PAS réglées automatiquement : elles
 *     restent en attente, à régler à la main, et le bilan le dit.
 *   - CORNERS ET TIRS, réglés d'après les statistiques du match en magasin
 *     — sauf un 0 des deux côtés, qui y veut dire « non relevé ».
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
    bets: { pendingLegs: 0, settled: 0, won: 0, lost: 0, resettled: 0, noResult: 0, noRule: 0, extraTime: 0 },
    contradictions: { count: 0, samples: [] },
    extraTime: [],
    samples: [],
    results: resultats.length
  };
  const plan = { pronostics: [], selections: [], contradictions: new Map() };
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
      const score = scoreDe(result);
      const libelle = `${leg.homeName} ${score} ${leg.awayName} · ${leg.market} : ${leg.pick}`;
      const saisieMain = result.matchId === leg.matchId;
      const rencontre = rencontreDe(result, leg.homeName, leg.awayName, leg.league);
      if (!saisieMain && PROLONGATION.has(rencontre?.reason)) {
        if (enAttente) {
          rapport.bets.extraTime++;
          if (rapport.extraTime.length < ECHANTILLONS) rapport.extraTime.push({ kind: 'pari', label: libelle });
        }
        return;
      }
      const issue = deriveBetLegOutcome(leg, result.homeGoals, result.awayGoals, rencontre?.stats ?? null);
      if (issue === null) {
        if (enAttente) rapport.bets.noRule++;
        return;
      }
      const decision = { betId: bet.id, legIndex, status: issue, score, resultId: result.matchId };
      if (enAttente) {
        plan.selections.push(decision);
        rapport.bets.settled++;
        rapport.bets[issue]++;
        noter({ kind: 'pari', label: libelle, status: issue });
      } else if (auto) {
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
