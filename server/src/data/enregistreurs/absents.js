/**
 * absents.js — les joueurs indisponibles de chaque match à venir, chaque jour (étape E).
 * -----------------------------------------------------------------------
 * FotMob publie, sur la page d'un match, les joueurs indisponibles de chaque
 * équipe (blessés, suspendus, en sélection) dès trois jours avant le coup
 * d'envoi. L'appli les lit déjà — pré-chargement des compositions
 * (lineupPrefetch.js), page d'un match et analyse IA (lineupContext.js) —
 * mais les garde dans `upcoming_lineups`, une ligne par match remplacée à
 * chaque lecture et PURGÉE deux jours après le match : ce qu'on savait la
 * veille d'un match n'existe plus le surlendemain. D'où cette table à part,
 * une liste par jour (de Paris) et par match.
 *
 * Pas de requête en plus quand la donnée est déjà lue : si le cache des
 * compositions a été rempli aujourd'hui pour ce match, il sert tel quel.
 * Sinon UNE lecture de la page du match (fetchProbableLineup, la même que
 * les compositions), au plus une par match et par jour, et au plus
 * `maxLectures` par passe, espacées. Jamais d'appel payant. Le cache des
 * compositions n'est jamais réécrit ici : y poser une prévision lue 40 h
 * avant le match changerait ce que revérifie le pré-chargement.
 *
 * Joueurs par identifiant FotMob ; l'identifiant 0 (tous les inconnus d'une
 * feuille) n'en est pas un : le joueur est alors gardé sous son nom.
 * -----------------------------------------------------------------------
 */

import { fetchMatchesByDate, fetchProbableLineup } from '../providers/fotMobProvider.js';
import { openDb, upcomingLineupByFotmobId } from '../db/matchStatsDb.js';
import { lectureAbsentsFaite } from './depot.js';
import { mettreEnFile } from './file.js';
import { jourParis, jourUtc, iso, libelleSuivi, idRencontreValide, nomCle, pause, JOUR_MS } from './communs.js';

const FENETRE_MS = 48 * 3_600_000;
/** Une lecture en échec est retentée à la passe suivante, trois fois par jour au plus. */
const TENTATIVES_MAX = 3;
const PAUSE_ENTRE_LECTURES_MS = 1_500;

/** Tentatives du jour par match, et lectures mises en file pas encore écrites. */
const tentatives = new Map();
const enFile = new Map();
const etat = { derniere: null, enCours: false };

/** Le bilan de la dernière passe (pour l'état de Réglages). */
export function etatAbsents() {
  return { ...etat.derniere, enCours: etat.enCours };
}

/** Les joueurs indisponibles d'une page de match FotMob (ou du cache des compositions), en lignes. */
export function lignesAbsents(page) {
  const joueurs = [];
  const compte = { home: null, away: null };
  for (const side of ['home', 'away']) {
    const equipe = page?.[side];
    if (!equipe) continue;
    const liste = Array.isArray(equipe.unavailable) ? equipe.unavailable : [];
    compte[side] = liste.length;
    for (const a of liste) {
      const nom = String(a?.name ?? '').trim();
      if (!nom) continue;
      const id = typeof a?.id === 'string' && /^fotmob-\d+$/.test(a.id) ? a.id : null;
      joueurs.push({
        side,
        playerKey: id ?? `nom:${nomCle(nom)}`,
        playerId: id,
        playerName: nom,
        teamId: equipe.teamId ?? null,
        reason: a?.type ?? null,
        expectedReturn: a?.expectedReturn ?? a?.expectedReturnDate ?? null
      });
    }
  }
  // « publiée » : FotMob a une composition pour ce match (même sans onze, la
  // liste des absents y est) ; sinon rien n'est encore publié pour lui.
  const publiee = Boolean(page?.home || page?.away);
  return { joueurs, compte, statut: publiee ? 'publiee' : 'non-publiee' };
}

/**
 * Une passe : les matchs à venir sous 48 h des championnats suivis, dont les
 * absents n'ont pas encore été relevés AUJOURD'HUI. Ne lève jamais : une
 * journée FotMob illisible ou un match en échec n'arrêtent pas les autres.
 *
 * @returns {Promise<object>} bilan : candidats, déjà relevés, repris du cache, lus, en échec, mis en file
 */
export async function passeAbsents({
  maintenant = Date.now(),
  lireListe = fetchMatchesByDate,
  lireDetail = fetchProbableLineup,
  database = openDb(),
  maxLectures = 25,
  pauseMs = PAUSE_ENTRE_LECTURES_MS
} = {}) {
  if (etat.enCours) return { skipped: 'passe précédente encore en cours' };
  etat.enCours = true;
  const jour = jourParis(maintenant);
  const bilan = { at: iso(maintenant), jour, candidats: 0, dejaReleves: 0, depuisCache: 0, lus: 0, echecs: 0, reportes: 0, misEnFile: 0, joueurs: 0, listesEnEchec: [] };
  try {
    // Oublier les tentatives et les lectures en file d'un autre jour.
    for (const cle of [...tentatives.keys()]) if (!cle.startsWith(`${jour}|`)) tentatives.delete(cle);
    for (const cle of [...enFile.keys()]) if (!cle.startsWith(`${jour}|`)) enFile.delete(cle);

    const dates = [0, 1, 2].map((n) => jourUtc(maintenant + n * JOUR_MS));
    const vus = new Map();
    for (const date of dates) {
      let liste;
      try {
        liste = await lireListe(date);
      } catch (error) {
        bilan.listesEnEchec.push({ date, erreur: String(error?.message ?? error).slice(0, 160) });
        continue;
      }
      for (const m of liste) {
        const league = libelleSuivi(m.leagueKey);
        if (!league || !idRencontreValide(m.matchId) || vus.has(m.matchId)) continue;
        const coup = Date.parse(m.kickoff ?? '');
        if (!Number.isFinite(coup) || coup <= maintenant || coup - maintenant > FENETRE_MS) continue;
        if (m.started || m.finished || m.cancelled) continue;
        vus.set(m.matchId, { ...m, league });
      }
    }
    const candidats = [...vus.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    bilan.candidats = candidats.length;

    for (const m of candidats) {
      const cle = `${jour}|${m.matchId}`;
      if (enFile.has(cle) || lectureAbsentsFaite(jour, m.matchId, { database })) {
        bilan.dejaReleves++;
        continue;
      }
      let page = null;
      let origine = null;
      let lueA = null;
      // 1. Déjà lue aujourd'hui (compositions, page du match) : rien à redemander.
      try {
        const cache = upcomingLineupByFotmobId(m.matchId, { database });
        if (cache?.fetchedAt && jourParis(Date.parse(cache.fetchedAt)) === jour && (cache.home || cache.away)) {
          page = cache;
          origine = 'cache des compositions';
          lueA = cache.fetchedAt;
          bilan.depuisCache++;
        }
      } catch {
        // Cache illisible à cet instant : on lit la page.
      }
      // 2. Sinon, une lecture de la page du match (une par jour au plus).
      if (!page) {
        if (bilan.lus + bilan.echecs >= maxLectures || (tentatives.get(cle) ?? 0) >= TENTATIVES_MAX) {
          bilan.reportes++;
          continue;
        }
        if (bilan.lus + bilan.echecs > 0) await pause(pauseMs);
        try {
          page = await lireDetail(m.matchId);
          origine = 'lecture du jour';
          // L'heure de la lecture elle-même (la passe en enchaîne plusieurs, espacées).
          lueA = iso(Math.max(Date.now(), maintenant));
          bilan.lus++;
        } catch (error) {
          tentatives.set(cle, (tentatives.get(cle) ?? 0) + 1);
          bilan.echecs++;
          bilan.derniereErreur = String(error?.message ?? error).slice(0, 160);
          continue;
        }
      }
      const { joueurs, compte, statut } = lignesAbsents(page);
      mettreEnFile('absents', [
        {
          lecture: {
            day: jour,
            fotmobId: m.matchId,
            date: m.kickoff ? jourUtc(Date.parse(m.kickoff)) : m.date,
            kickoff: m.kickoff,
            league: m.league,
            homeId: m.homeId,
            awayId: m.awayId,
            homeName: m.homeName,
            awayName: m.awayName,
            readAt: lueA,
            origin: origine,
            status: statut,
            homeCount: compte.home,
            awayCount: compte.away
          },
          joueurs
        }
      ]);
      enFile.set(cle, true);
      bilan.misEnFile++;
      bilan.joueurs += joueurs.length;
    }
    return bilan;
  } finally {
    etat.derniere = bilan;
    etat.enCours = false;
  }
}

/** Pour les tests : oublier tentatives, lectures en file et bilan. */
export function __oublierAbsents() {
  tentatives.clear();
  enFile.clear();
  etat.derniere = null;
  etat.enCours = false;
}
