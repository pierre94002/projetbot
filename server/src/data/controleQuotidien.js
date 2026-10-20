/**
 * controleQuotidien.js — le contrôle quotidien vu par le reste de l'appli (étape 14 du plan).
 * -----------------------------------------------------------------------
 * Trois usages, une seule source (data/db/dailyChecks.js) :
 *   - la PASSE : l'étape « controleQuotidien » de l'actualisation lance les
 *     contrôles (executerControleQuotidien), garde leur état
 *     (data/runtime/controle-quotidien.json) et le suivi des réponses FotMob ;
 *   - la LECTURE : la route GET /api/health/checks, la carte « Contrôle
 *     quotidien » et la puce du haut de l'appli (GET /api/refresh) lisent
 *     l'état gardé, les constats re-datés et les sources relues MAINTENANT
 *     (lireLeControle, resumeDuControle) — sans rien recalculer d'autre ;
 *   - le BADGE « à vérifier » des pronostics (analyse d'un match, page
 *     Opportunités, journal des pronostics) : preparerAVerifier rend une
 *     fonction qui, pour un match (championnat, jour, clubs par identifiant
 *     FotMob) et la famille d'un marché, dit pourquoi ses données sont
 *     douteuses. Informatif : le verdict (verdictPari.js) ne change jamais.
 * Aucun appel réseau, aucune écriture dans la base.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { openDb, resolveDbPath } from './db/matchStatsDb.js';
import {
  lancerControleQuotidien,
  etatAuMoment,
  aVerifierDuMatch,
  familleDuMarche,
  toucheUnMarcheDuMoteur,
  FAMILLES,
  FENETRE_JOURS,
  NOUVEAU_MS,
  SEUIL_HORS_REPERES,
  MINIMUM_MATCHS_REPERES,
  ECARTS_MATCH_ABERRANT,
  PART_NON_RELEVE,
  MAGASIN_HEURES,
  JOURS_A_VERIFIER
} from './db/dailyChecks.js';
import { etatDesSources, etatFotmob } from './sourceHealth.js';
import { enregistrerSuiviFotmob } from './relevesDesSources.js';
import { lireControle, ecrireControle, mettreDeCote, CONTROLE_FILE } from './repositories/controleQuotidienRepository.js';
import { readRefreshStatus } from './repositories/refreshStatusRepository.js';
import { listSeasonCalendar } from './repositories/seasonCalendarRepository.js';
import { matchsEnCoursDuCalendrier } from './db/standingsCheck.js';
import { findTeams } from './db/identityRegistry.js';
import { teamNamesEqual } from '../utils/teamNameMatch.js';
import { nameTokens } from '../utils/nameIdentity.js';

/** Les règles, dites telles quelles à l'écran. */
export const REGLES = Object.freeze({
  fenetreJours: FENETRE_JOURS,
  nouveauHeures: NOUVEAU_MS / 3_600_000,
  seuilHorsReperes: SEUIL_HORS_REPERES,
  minimumMatchsReperes: MINIMUM_MATCHS_REPERES,
  ecartsMatchAberrant: ECARTS_MATCH_ABERRANT,
  partNonReleve: PART_NON_RELEVE,
  magasinHeures: MAGASIN_HEURES,
  joursAVerifier: JOURS_A_VERIFIER
});

function cheminDeLaBase(database) {
  try {
    return path.resolve(database?.location?.() ?? resolveDbPath());
  } catch {
    return null;
  }
}

function lireRefresh() {
  try {
    return readRefreshStatus();
  } catch {
    return null;
  }
}

/**
 * Les matchs du calendrier de saison pas encore terminés, d'aujourd'hui ou
 * d'hier (retouche du 12/10/2026) : le classement officiel, relevé en direct
 * chez FotMob, les compte déjà ; l'écart qu'ils expliquent est une information.
 * Calendrier illisible : null, et rien n'est mis à part.
 */
function matchsEnCours(maintenant) {
  try {
    return matchsEnCoursDuCalendrier(listSeasonCalendar({ allSeasons: true }), { maintenant });
  } catch {
    return null;
  }
}

/**
 * Combien de clubs (ou de championnats) de l'index « à vérifier » ont au moins
 * une raison qui touche un marché que le moteur calcule aujourd'hui — ceux dont
 * le prochain pronostic peut porter le badge. Un club dont seules les données
 * des JOUEURS sont douteuses (buteurs ou gardiens qui ne font pas le score) n'y
 * est pas : aucun marché de joueurs n'existe encore (étape 34 du plan), le
 * badge ne se poserait nulle part ; son constat reste dans la carte, en rouge.
 */
function compterLesCibles(parCible) {
  return Object.values(parCible ?? {}).filter((raisons) => (raisons ?? []).some((r) => toucheUnMarcheDuMoteur(r.familles))).length;
}

/**
 * LA PASSE (étape « controleQuotidien ») : lance les contrôles sur la base,
 * garde leur état et le suivi des réponses FotMob. `omissions` : le rapport
 * de l'étape « omissions » de la même passe. Rend { etat, suivi, misDeCote }.
 */
export async function executerControleQuotidien({ database = openDb(), omissions = null, maintenant = new Date(), journal = null, rendreLaMain = null } = {}) {
  const lu = lireControle();
  const misDeCote = lu.etat === 'illisible' ? mettreDeCote() : null;
  const precedent = lu.etat === 'pret' ? lu.controle : null;
  const refresh = lireRefresh();
  const t = new Date(maintenant).getTime();
  const sources = etatDesSources({ database, maintenant: t, refresh });
  const etat = await lancerControleQuotidien({
    database,
    maintenant: t,
    precedent,
    omissions,
    alertes: refresh?.alerts ?? null,
    sources,
    enCours: matchsEnCours(t),
    journal,
    ...(rendreLaMain ? { rendreLaMain } : {})
  });
  etat.base = cheminDeLaBase(database);
  etat.fichier = CONTROLE_FILE;
  if (misDeCote) etat.misDeCote = misDeCote;
  ecrireControle(etat);
  const suivi = enregistrerSuiviFotmob({ maintenant: t });
  return { etat, suivi, misDeCote };
}

/**
 * LA LECTURE (GET /api/health/checks) : l'état gardé à l'instant présent —
 * constats re-datés, sources relues maintenant, feu recalculé. Jamais
 * contrôlé ou illisible : `etat` le dit, la liste des contrôles reste là
 * (avec les sources, qui se lisent sans contrôle).
 */
export function lireLeControle({ maintenant = Date.now(), database = null } = {}) {
  const t = typeof maintenant === 'number' ? maintenant : Date.parse(maintenant);
  const lu = lireControle();
  let sources = null;
  try {
    sources = etatDesSources({ database: database ?? openDb(), maintenant: t, refresh: lireRefresh() });
  } catch (error) {
    sources = { le: new Date(t).toISOString(), sources: [], erreur: error.message };
  }
  const base = { familles: FAMILLES, regles: REGLES, fichier: CONTROLE_FILE, sources };
  if (lu.etat !== 'pret') {
    const vide = etatAuMoment({ version: 0, le: null, controles: [], vus: {}, aVerifier: { clubs: {}, ligues: {}, global: [] }, historique: [] }, { maintenant: t, sources });
    return {
      ...vide,
      ...base,
      etat: lu.etat === 'absent' ? 'jamais' : 'illisible',
      erreur: lu.erreur ?? null,
      raison: lu.etat === 'absent' ? 'pas encore de contrôle : il se fait à la fin de la prochaine passe d’actualisation' : `état du contrôle illisible (${lu.erreur})`
    };
  }
  const vue = etatAuMoment(lu.controle, { maintenant: t, sources });
  const { vus, aVerifier, ...reste } = vue;
  return {
    ...reste,
    ...base,
    etat: 'pret',
    modifieLe: lu.modifieLe,
    aVerifier: { clubs: compterLesCibles(aVerifier?.clubs), ligues: compterLesCibles(aVerifier?.ligues), global: (aVerifier?.global ?? []).length }
  };
}

/**
 * Pour la puce du haut de l'appli (GET /api/refresh, relu chaque minute) :
 * le feu, l'heure du contrôle et les contrôles en échec, en peu de mots.
 */
export function resumeDuControle({ maintenant = Date.now(), refresh = null, database = null } = {}) {
  const t = typeof maintenant === 'number' ? maintenant : Date.parse(maintenant);
  const lu = lireControle();
  let sources = null;
  try {
    sources = etatDesSources({ database: database ?? openDb(), maintenant: t, refresh: refresh ?? lireRefresh() });
  } catch {
    sources = null;
  }
  if (lu.etat !== 'pret') {
    const vue = etatAuMoment({ controles: [], historique: [] }, { maintenant: t, sources });
    return { etat: lu.etat === 'absent' ? 'jamais' : 'illisible', feu: vue?.feu ?? 'vert', le: null, compte: vue?.compte ?? null, enEchec: (vue?.enEchec ?? []).slice(0, 8) };
  }
  const vue = etatAuMoment(lu.controle, { maintenant: t, sources });
  return { etat: 'pret', feu: vue.feu, le: lu.controle.le, compte: vue.compte, enEchec: vue.enEchec.slice(0, 8), enEchecTotal: vue.enEchec.length };
}

/**
 * LE BADGE « À VÉRIFIER » : rend une fonction ({ league, date, homeId,
 * awayId, famille, global }) → null | { raisons, texte }. L'état gardé et
 * l'état de FotMob sont lus UNE fois (une page de 300 lignes ne relit rien
 * 300 fois). `global` faux : sans les raisons générales (magasin pas à jour,
 * FotMob en panne), pour un pronostic déjà réglé. `famille` : celle du marché
 * (familleDuMarche) ; null pour le résumé d'un match, sans les raisons des
 * marchés de joueurs (aVerifierDuMatch).
 */
export function preparerAVerifier({ maintenant = Date.now() } = {}) {
  const lu = lireControle();
  const etat = lu.etat === 'pret' ? lu.controle : null;
  let fotmob = null;
  try {
    fotmob = etatFotmob({ maintenant: typeof maintenant === 'number' ? maintenant : Date.parse(maintenant) });
  } catch {
    fotmob = null;
  }
  const sansGeneral = etat ? { ...etat, aVerifier: { ...etat.aVerifier, global: [] } } : null;
  return ({ league = null, date = null, homeId = null, awayId = null, famille = null, global = true } = {}) =>
    aVerifierDuMatch(global ? etat : sansGeneral, { league, date, homeId, awayId, famille, fotmob: global ? fotmob : null });
}

/**
 * L'identifiant FotMob d'un club écrit par son NOM, SANS AUCUN RAPPROCHEMENT
 * SOUPLE : une écriture que l'annuaire du magasin a déjà vue pour ce club (à
 * la casse, aux accents et à la ponctuation près — identityRegistry.findTeams),
 * un alias FERME du registre du projet (teamNamesEqual : TEAM_ALIASES, jamais
 * une ressemblance), ou les mêmes mots translittérés (ø → o) — parmi les seuls
 * clubs de CETTE compétition, et seulement s'il n'en reste qu'un. Jamais « tous
 * les mots de l'un dans l'autre », jamais un mot partagé : « Port » ne vaut ni
 * « Portsmouth » ni « Porto ». Introuvable : null, et le badge ne s'appuie
 * alors que sur le championnat et les raisons générales. Lecture seule (pas
 * même la reconstruction de l'annuaire).
 */
function clubParSonNom(nom, league, db, aliasDe) {
  const n = String(nom ?? '').trim();
  if (!n) return null;
  const clubs = findTeams(n, { database: db });
  const memeCompetition = league ? clubs.filter((c) => c.league === league) : [];
  if (memeCompetition.length === 1) return memeCompetition[0].teamId;
  if (clubs.length === 1) return clubs[0].teamId;
  if (!league) return null;
  const unique = (liste) => {
    const ids = new Set(liste.map((e) => e.id));
    return ids.size === 1 ? [...ids][0] : null;
  };
  const ecritures = aliasDe(league);
  const fermes = ecritures.filter((e) => teamNamesEqual(n, e.alias));
  if (fermes.length) return unique(fermes);
  const mots = nameTokens(n).join(' ');
  return mots ? unique(ecritures.filter((e) => e.mots === mots)) : null;
}

/**
 * La même chose pour un match connu par ses NOMS (journal des pronostics,
 * analyse d'un match) : chaque nom devient l'identifiant FotMob de son club
 * (clubParSonNom, jamais un rapprochement souple), puis tout se fait par
 * identifiant. Un club introuvable : seules les raisons du championnat et les
 * raisons générales s'appliquent. Les écritures d'une compétition sont lues
 * une fois par appel de preparerAVerifierParNoms (une page de 300 lignes ne
 * relit pas l'annuaire 300 fois).
 */
export function preparerAVerifierParNoms({ maintenant = Date.now(), database = null } = {}) {
  const verifier = preparerAVerifier({ maintenant });
  const db = database ?? openDb();
  const ecrituresParLigue = new Map();
  const aliasDe = (league) => {
    if (!ecrituresParLigue.has(league)) {
      let liste = [];
      try {
        liste = db
          .prepare(
            `SELECT a.team_id AS id, a.alias FROM team_aliases a
             WHERE a.team_id IN (SELECT home_id FROM matches WHERE league = ? UNION SELECT away_id FROM matches WHERE league = ?)`
          )
          .all(league, league)
          .map((e) => ({ id: e.id, alias: e.alias, mots: nameTokens(e.alias).join(' ') }));
      } catch {
        liste = [];
      }
      ecrituresParLigue.set(league, liste);
    }
    return ecrituresParLigue.get(league);
  };
  const connus = new Map();
  const id = (nom, league) => {
    const cle = `${league ?? ''}\u0000${String(nom ?? '').trim()}`;
    if (!connus.has(cle)) {
      let trouve = null;
      try {
        trouve = clubParSonNom(nom, league, db, aliasDe);
      } catch {
        trouve = null;
      }
      connus.set(cle, trouve);
    }
    return connus.get(cle);
  };
  return ({ league = null, date = null, homeName = null, awayName = null, famille = null, global = true } = {}) =>
    verifier({ league, date, homeId: id(homeName, league), awayId: id(awayName, league), famille, global });
}

export const __testing = { clubParSonNom };

export { familleDuMarche };
