/**
 * listeDuCalendrier.js — LES MATCHS DU CALENDRIER DE SAISON POUR LA NUIT DU CONTEXTE (étape 32 du plan, lot 1a, 29/10/2026).
 * -----------------------------------------------------------------------
 * Les matchs du calendrier de saison (season-calendar.json) de J − 2 à J + 18, prévus ou joués (jamais reportés ni
 * annulés) ; chaque nom passe par l'annuaire STRICT (oddsProfileRead.clubDuMagasin, mis en cache par la passe) — jamais
 * de rapprochement souple : un match sans ses deux identifiants n'a pas de fiche, il est compté et ses noms sont dits.
 *
 * OÙ ELLE TOURNE : dans le PROCESSUS À PART de la nuit (contexteEnfant.js), base en lecture seule — mesuré dans le bac le
 * 29/10/2026 : dans le serveur, la liste le tenait jusqu'à 1 405 ms d'affilée (le premier nom inconnu d'un championnat
 * relit ses écritures, 100 à 300 ms à chaud, bien plus à froid) ; c'est le patron du correctif C du 28/10
 * (simulationListeEnfant.js : la liste de la page Matchs, rapprochement compris, dans un processus en lecture seule).
 * L'annuaire peut vouloir se reconstruire (ensureRegistries, qui écrit) : vérifié D'ABORD ; s'il n'est pas prêt, la nuit
 * est REPORTÉE (AnnuairesIndisponibles) — jamais « tous les clubs inconnus ».
 * -----------------------------------------------------------------------
 */

import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { ensureRegistries } from '../db/identityRegistry.js';
import { CALENDAR_FILE_PATH } from '../repositories/seasonCalendarRepository.js';
import { lireJsonEnDeuxTemps } from '../../utils/travailCooperatif.js';
import { NUIT } from './reglagesContexte.js';
import { numeroDuClub, jourDe, texteStable } from './formulesDuContexte.js';

const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/** L'annuaire des clubs n'est pas prêt (reconstruction en attente) : la nuit du contexte est reportée. */
export class AnnuairesIndisponibles extends Error {
  constructor(message) {
    super(message);
    this.reporte = true;
  }
}

/**
 * LA LISTE (générateur ; un point d'arrêt par ligne). `clubDe(nom, league)` : l'annuaire (par défaut l'annuaire strict de
 * la base `database`). Rend { items: [{ date, league, home, away, statut, matchId, homeName, awayName }], sansIdentifiant:
 * [{ league, homeName, awayName, inconnus }] (les matchs des 14 prochains jours sans fiche), noms }.
 */
export function* listeDuCalendrier({ database, fichierCalendrier = CALENDAR_FILE_PATH, jourD, clubDe = null }) {
  if (!clubDe) {
    try {
      ensureRegistries({ database });
    } catch (error) {
      throw new AnnuairesIndisponibles(`les annuaires des clubs ne sont pas prêts (${String(error?.message ?? error).slice(0, 120)}) — le contexte du match sera calculé à la passe suivante`);
    }
  }
  const trouver = clubDe ?? ((nom, league) => clubDuMagasin(nom, league, database));
  const brut = yield* lireJsonEnDeuxTemps(fichierCalendrier, [], 'calendrier de saison');
  const lignes = Array.isArray(brut) ? brut : Array.isArray(brut?.matches) ? brut.matches : [];
  const de = plusJours(jourD, -NUIT.prevusDepuisJours);
  const a = plusJours(jourD, NUIT.prochainsJours);
  const fin14 = plusJours(jourD, NUIT.fenetreJours);
  const noms = new Map();
  const idDe = (nom, league) => {
    const cle = `${league ?? ''}|${nom}`;
    if (!noms.has(cle)) {
      let id = null;
      try {
        id = numeroDuClub(trouver(nom, league));
      } catch {
        id = null;
      }
      noms.set(cle, id);
    }
    return noms.get(cle);
  };
  const items = [];
  const sansIdentifiant = [];
  const vus = new Set();
  for (const r of lignes) {
    yield 'calendrier';
    const date = jourDe(r?.date);
    if (!date || date < de || date > a) continue;
    const statut = r.status === 'scheduled' ? 'scheduled' : r.status === 'finished' ? 'finished' : null;
    if (!statut || !texteStable(r.homeName) || !texteStable(r.awayName)) continue;
    const home = idDe(r.homeName, r.league);
    const away = idDe(r.awayName, r.league);
    if (home === null || away === null || home === away) {
      if (statut === 'scheduled' && date >= jourD && date <= fin14) {
        sansIdentifiant.push({ league: r.league ?? null, homeName: r.homeName, awayName: r.awayName, inconnus: [home === null ? r.homeName : null, away === null ? r.awayName : null].filter(Boolean) });
      }
      continue;
    }
    const cle = `${date}|${home}|${away}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    items.push({ date, league: r.league ?? null, home, away, statut, matchId: r.matchId ?? null, homeName: r.homeName, awayName: r.awayName });
  }
  return { items, sansIdentifiant, noms: noms.size };
}
