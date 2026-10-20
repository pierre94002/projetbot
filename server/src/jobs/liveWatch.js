/**
 * liveWatch.js — la boucle du direct (étape E du plan ; l'étape 46 y ajoutera le calcul).
 * -----------------------------------------------------------------------
 * UNE seule boucle du direct pour tout le plan. Pendant les matchs en cours
 * des championnats suivis, elle garde un INSTANTANÉ de chaque match au plus
 * toutes les cinq minutes : score, minute, cartons rouges, et les
 * statistiques du moment (xG compris quand FotMob les donne). Sans Claude,
 * sans appel payant.
 *
 * CE QU'ELLE LIT, et à quel rythme (charge FotMob, correction 18 du plan) :
 *   - la LISTE DU JOUR, au plus une fois par minute, partagée avec les autres
 *     boucles (cache d'une minute dans fetchMatchesByDate) — et seulement
 *     quand un match suivi est en cours ou va commencer ; sinon une fois tous
 *     les dix minutes, pour voir les horaires bouger ;
 *   - le DÉTAIL d'un match (fetchLiveDetail) seulement quand il est utile :
 *     instantané dû, pas à la mi-temps, et pour un championnat sans
 *     statistiques un quart d'heure au moins entre deux lectures ;
 *   - au plus `maxDetailsParMinute` détails par minute (6 par défaut). Un
 *     samedi chargé (30 à 60 matchs en même temps), la ROTATION décide :
 *     favoris d'abord (équipes et championnats), puis les matchs où Pierre a
 *     un pronostic ou un pari, puis ceux que le moteur a pronostiqués (gel),
 *     puis les autres ; à rang égal, le détail le plus ancien d'abord. Un
 *     match qui attend son détail plus de trois minutes reçoit un instantané
 *     de la liste seule (score, minute, rouges) : le rythme de cinq minutes
 *     tient toujours.
 *
 * ARRÊT AUTOMATIQUE : cinq erreurs FotMob d'affilée (liste ou détail)
 * suspendent la boucle trente minutes — aucune requête pendant ce temps — et
 * posent une alerte durable (cf. data/enregistreurs/etat.js), levée au
 * premier succès qui suit.
 *
 * ÉCRITURES : jamais ici. Les instantanés partent en file
 * (data/enregistreurs/file.js), écrite par petites tranches quand personne
 * ne tient le verrou d'actualisation — jamais pendant un import.
 *
 * Même interrupteur que l'actualisation (MATCH_STATS_AUTO_REFRESH), donc
 * coupée dans le bac à sable sauf CM_BAC_ACTUALISATION=1 ; plus
 * ENREGISTREURS=false / ENREGISTREURS_DIRECT=false.
 *
 * Pour l'étape 46 : getLiveState() rend le dernier état connu de chaque match
 * en cours, et chaque instantané est gardé dans live_snapshots.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchMatchesByDate, fetchLiveDetail } from '../data/providers/fotMobProvider.js';
import { openDb } from '../data/db/matchStatsDb.js';
import { clubDuMagasin } from '../data/db/oddsProfileRead.js';
import { listPredictions } from '../data/repositories/predictionsRepository.js';
import { listBets } from '../data/repositories/betsRepository.js';
import { readJsonFile } from '../utils/atomicJson.js';
import { mettreEnFile } from '../data/enregistreurs/file.js';
import { iso, jourUtc, libelleSuivi, idRencontreValide, pause, JOUR_MS, MINUTE_MS } from '../data/enregistreurs/communs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAVORIS = path.resolve(__dirname, '../../data/runtime/favorites.json');

export const REGLAGES_PAR_DEFAUT = {
  /** Un instantané par match au plus toutes les… (minutes, jamais moins de 5). */
  pasMinutes: 5,
  /** Lectures du détail d'un match, au plus, par minute glissante. */
  maxDetailsParMinute: 6,
  /** Erreurs FotMob d'affilée avant l'arrêt, et durée de l'arrêt. */
  erreursMax: 5,
  suspensionMinutes: 30
};
/** Sans statistiques chez FotMob (couverture réduite) : le détail n'est relu que tous les quarts d'heure. */
const PAS_DETAIL_SANS_STATS_MS = 15 * MINUTE_MS;
/** Au-delà, un match qui attend son détail reçoit un instantané de la liste seule. */
const ATTENTE_DETAIL_MAX_MS = 3 * MINUTE_MS;
/** Hors direct, la liste n'est relue que pour voir bouger les horaires. */
const RELIRE_LISTE_HORS_DIRECT_MS = 10 * MINUTE_MS;
/** Un match « commencé » depuis plus longtemps n'est plus en cours (liste figée, statut oublié chez la source). */
const DIRECT_MAX_MS = 4 * 3_600_000;
/** Un match suivi qui disparaît de la liste est oublié après… */
const OUBLI_MS = 30 * MINUTE_MS;
const PRIORITES_TTL_MS = 10 * MINUTE_MS;
const PAUSE_ENTRE_DETAILS_MS = 250;

/** Rangs de la rotation : plus petit = servi d'abord. */
export const RANGS = { favori: 0, pronostic: 1, moteur: 2, autre: 3 };

/**
 * Les statistiques gardées à chaque instantané (clés de TEAM_STAT_MAP), au
 * format compact { clé: [domicile, extérieur] }. Toutes les garder (25 à 30
 * par équipe) ferait ~1,2 Ko par instantané, ~600 Mo par an au rythme d'une
 * cinquantaine de matchs par jour ; ces treize-là (~0,4 Ko) disent le match :
 * occasions, tirs, corners, possession, cartons. La feuille complète arrive
 * de toute façon après le match (actualisation).
 */
export const STATS_DU_DIRECT = [
  'expected_goals',
  'xgot',
  'big_chances',
  'Total Shots',
  'Shots on Goal',
  'touches_opponent_box',
  'Corner Kicks',
  'Ball Possession',
  'Fouls',
  'Yellow Cards',
  'Red Cards',
  'Offsides',
  'Goalkeeper Saves'
];

function statsCompactes(stats) {
  if (!stats) return null;
  const out = {};
  for (const cle of STATS_DU_DIRECT) {
    const h = stats.home?.[cle];
    const a = stats.away?.[cle];
    if ((h === undefined || h === null) && (a === undefined || a === null)) continue;
    out[cle] = [h ?? null, a ?? null];
  }
  return Object.keys(out).length ? out : null;
}

const suivis = new Map();
const lecturesDetail = [];
const etat = {
  reglages: { ...REGLAGES_PAR_DEFAUT },
  startedAt: null,
  derniereListe: 0,
  prochainCoupDEnvoi: null,
  erreursConsecutives: 0,
  suspenduJusqua: 0,
  erreur: null,
  derniereErreur: null,
  dernierTour: null,
  totaux: { tours: 0, listes: 0, details: 0, instantanes: 0, fins: 0, erreurs: 0, horsPlafond: 0 }
};
let enCours = false;
let timer = null;
let priorites = { at: 0, valeur: null };

/** L'état de la boucle, pour Réglages et l'alerte durable. */
export function getLiveWatchStatus(maintenant = Date.now()) {
  return {
    running: Boolean(timer),
    startedAt: etat.startedAt,
    reglages: { ...etat.reglages },
    suspendu: etat.suspenduJusqua > maintenant,
    suspenduJusqua: etat.suspenduJusqua > maintenant ? iso(etat.suspenduJusqua) : null,
    erreur: etat.erreur,
    derniereErreur: etat.derniereErreur,
    erreursConsecutives: etat.erreursConsecutives,
    enDirect: [...suivis.values()].filter((s) => !s.fini).length,
    dernierTour: etat.dernierTour,
    totaux: { ...etat.totaux }
  };
}

/** Le dernier état connu de chaque match suivi (pour l'étape 46 et l'écran du direct). */
export function getLiveState() {
  return [...suivis.values()].map((s) => ({ ...s.dernier, rang: s.rang, dernierDetail: s.dernierDetail ? iso(s.dernierDetail) : null }));
}

// ----------------------------------------------------------- priorités
/**
 * Les rangs de la rotation (relus toutes les dix minutes au plus) : favoris,
 * matchs avec un pronostic ou un pari en attente (Mes paris), matchs que le
 * moteur a pronostiqués (gel). Les noms des journaux viennent des bookmakers :
 * ils sont rapprochés des clubs FotMob par l'annuaire strict, jamais par
 * ressemblance. Une lecture ratée rend tout « autre » : la rotation continue.
 */
export async function prioritesParDefaut({ maintenant = Date.now(), database = openDb() } = {}) {
  if (priorites.valeur && maintenant - priorites.at < PRIORITES_TTL_MS) return priorites.valeur;
  const valeur = { equipesFavorites: new Set(), liguesFavorites: new Set(), paires: new Set(), moteur: new Set() };
  try {
    const f = readJsonFile(FAVORIS, null);
    for (const t of f?.teams ?? []) if (t?.id) valeur.equipesFavorites.add(String(t.id));
    for (const l of f?.leagues ?? []) if (l?.name) valeur.liguesFavorites.add(String(l.name));
  } catch {
    // favoris illisibles : personne n'est favori ce tour-ci
  }
  const proche = (t) => Number.isFinite(t) && Math.abs(t - maintenant) <= 1.5 * JOUR_MS;
  const club = (nom, league) => {
    try {
      return clubDuMagasin(nom, league, database);
    } catch {
      return null;
    }
  };
  const ajouter = (home, away, league) => {
    const h = club(home, league);
    const a = club(away, league);
    if (h && a) valeur.paires.add(`${h}|${a}`);
  };
  try {
    for (const p of listPredictions()) if (p?.status === 'pending' && proche(Date.parse(p.commenceTime ?? ''))) ajouter(p.homeName, p.awayName, p.league);
  } catch {
    // journal illisible
  }
  try {
    for (const b of listBets()) for (const l of b?.legs ?? []) if (l?.status === 'pending' && proche(Date.parse(l.commenceTime ?? ''))) ajouter(l.homeName, l.awayName, l.league);
  } catch {
    // paris illisibles
  }
  try {
    const jours = [jourUtc(maintenant - JOUR_MS), jourUtc(maintenant)];
    for (const r of database.prepare('SELECT DISTINCT home_id AS h, away_id AS a FROM engine_picks WHERE date IN (?, ?) AND home_id IS NOT NULL AND away_id IS NOT NULL').all(...jours)) {
      valeur.moteur.add(`${r.h}|${r.a}`);
    }
  } catch {
    // table absente (base d'avant l'étape E)
  }
  priorites = { at: maintenant, valeur };
  return valeur;
}

function rangDe(m, p) {
  if (!p) return RANGS.autre;
  if (p.liguesFavorites.has(m.league) || (m.homeId && p.equipesFavorites.has(m.homeId)) || (m.awayId && p.equipesFavorites.has(m.awayId))) return RANGS.favori;
  const paire = `${m.homeId}|${m.awayId}`;
  if (p.paires.has(paire)) return RANGS.pronostic;
  if (p.moteur.has(paire)) return RANGS.moteur;
  return RANGS.autre;
}

// -------------------------------------------------------------- le tour
function noterErreur(maintenant, message) {
  etat.erreursConsecutives++;
  etat.totaux.erreurs++;
  etat.derniereErreur = { at: iso(maintenant), message: String(message).slice(0, 200) };
  if (etat.erreursConsecutives >= etat.reglages.erreursMax) {
    etat.suspenduJusqua = maintenant + etat.reglages.suspensionMinutes * MINUTE_MS;
    etat.erreur = {
      depuis: etat.erreur?.depuis ?? iso(maintenant),
      jusqua: iso(etat.suspenduJusqua),
      erreurs: etat.erreursConsecutives,
      message: etat.derniereErreur.message
    };
    console.error(`[direct] ${etat.erreursConsecutives} erreurs FotMob d'affilée : boucle du direct arrêtée jusqu'à ${etat.erreur.jusqua} (${etat.derniereErreur.message}).`);
    return true;
  }
  return false;
}

function noterSucces() {
  etat.erreursConsecutives = 0;
  etat.erreur = null;
}

const statutDe = (m) => (m.cancelled ? 'annulé' : m.finished ? 'terminé' : m.halfTime ? 'mi-temps' : 'en cours');

/** L'instantané d'un match : la liste, et le détail s'il vient d'être lu (plus frais, il prime). */
function instantane(s, liste, detail, maintenant, kind = 'direct') {
  const d = detail ?? null;
  const prendre = (champ) => (d && d[champ] !== null && d[champ] !== undefined ? d[champ] : liste[champ] ?? null);
  // Le statut vient de la liste (terminé, annulé) ; la mi-temps, de la liste ou du détail.
  const statut = statutDe({ cancelled: liste.cancelled, finished: liste.finished, halfTime: Boolean(liste.halfTime || d?.halfTime) });
  return {
    fotmobId: s.id,
    takenAt: iso(maintenant),
    kind,
    date: s.date,
    kickoff: s.kickoff,
    league: s.league,
    leagueKey: s.leagueKey,
    homeId: s.homeId,
    awayId: s.awayId,
    homeName: s.homeName,
    awayName: s.awayName,
    status: statut,
    minute: prendre('liveMinute'),
    addedTime: prendre('liveAddedTime'),
    minuteLabel: prendre('liveLabel'),
    homeGoals: prendre('homeGoals'),
    awayGoals: prendre('awayGoals'),
    homeRed: prendre('homeRedCards'),
    awayRed: prendre('awayRedCards'),
    xgHome: d?.xgHome ?? null,
    xgAway: d?.xgAway ?? null,
    stats: statsCompactes(d?.stats),
    coverage: d?.coverage ?? s.coverage ?? null,
    detailAt: d ? iso(maintenant) : null,
    source: d ? 'liste + détail' : 'liste'
  };
}

/** Détails lus dans la dernière minute (fenêtre glissante). */
function detailsDeLaMinute(maintenant) {
  while (lecturesDetail.length && maintenant - lecturesDetail[0] >= MINUTE_MS) lecturesDetail.shift();
  return lecturesDetail.length;
}

/**
 * UN TOUR (toutes les minutes). `lireListe`, `lireDetail`, `rangs` et
 * `maintenant` sont remplaçables pour les tests (aucun réseau dans les tests).
 * Rend le bilan du tour ; ne lève jamais.
 */
export async function tourDuDirect({
  maintenant = Date.now(),
  lireListe = fetchMatchesByDate,
  lireDetail = fetchLiveDetail,
  rangs = null,
  enFile = (lignes) => mettreEnFile('direct', lignes),
  pauseMs = PAUSE_ENTRE_DETAILS_MS
} = {}) {
  if (enCours) return { skipped: 'tour précédent encore en cours' };
  enCours = true;
  const bilan = { at: iso(maintenant), listeLue: false, enDirect: 0, details: 0, horsPlafond: 0, instantanes: 0, fins: 0, erreurs: 0 };
  try {
    if (etat.suspenduJusqua > maintenant) {
      bilan.suspendu = iso(etat.suspenduJusqua);
      return bilan;
    }
    const pas = Math.max(5, etat.reglages.pasMinutes) * MINUTE_MS;

    // 1. Faut-il lire la liste ? Oui si un match suivi est en cours ou va
    //    commencer, sinon tous les dix minutes seulement.
    const directConnu = [...suivis.values()].some((s) => !s.fini);
    const coupProche = etat.prochainCoupDEnvoi !== null && etat.prochainCoupDEnvoi <= maintenant + MINUTE_MS;
    if (!directConnu && !coupProche && maintenant - etat.derniereListe < RELIRE_LISTE_HORS_DIRECT_MS) {
      bilan.attente = etat.prochainCoupDEnvoi ? iso(etat.prochainCoupDEnvoi) : null;
      return bilan;
    }

    // Après minuit UTC, les matchs du soir américains sont encore sur la liste de la veille.
    const dates = [jourUtc(maintenant)];
    if (new Date(maintenant).getUTCHours() < 6) dates.unshift(jourUtc(maintenant - JOUR_MS));
    const lus = [];
    let reussies = 0;
    for (const date of dates) {
      try {
        lus.push(...(await lireListe(date)));
        reussies++;
      } catch (error) {
        bilan.erreurs++;
        if (noterErreur(maintenant, `liste du ${date} : ${error?.message ?? error}`)) {
          bilan.suspendu = iso(etat.suspenduJusqua);
          return bilan;
        }
      }
    }
    if (!reussies) return bilan;
    noterSucces();
    etat.derniereListe = maintenant;
    etat.totaux.listes++;
    bilan.listeLue = true;

    // 2. Les matchs suivis : en cours, et ceux qui viennent de finir.
    const priorite = rangs ?? (await prioritesParDefaut({ maintenant }).catch(() => null));
    const vusCeTour = new Set();
    let prochain = null;
    const lignes = [];
    for (const m of lus) {
      const league = libelleSuivi(m.leagueKey);
      if (!league || !idRencontreValide(m.matchId)) continue;
      const coup = Date.parse(m.kickoff ?? '');
      // Le prochain coup d'envoi — un match en retard (heure passée, pas
      // encore commencé chez la source) compte encore une demi-heure : la
      // liste reste lue chaque minute pour le voir démarrer.
      if (!m.started && !m.finished && !m.cancelled && Number.isFinite(coup) && coup >= maintenant - 30 * MINUTE_MS && (prochain === null || coup < prochain)) prochain = coup;
      const connu = suivis.get(m.matchId);
      const enDirect = m.started && !m.finished && !m.cancelled && (!Number.isFinite(coup) || maintenant - coup <= DIRECT_MAX_MS);
      if (!enDirect && !connu) continue;
      vusCeTour.add(m.matchId);
      const s = connu ?? {
        id: m.matchId,
        league,
        leagueKey: m.leagueKey,
        date: Number.isFinite(coup) ? jourUtc(coup) : m.date,
        kickoff: m.kickoff ?? null,
        homeId: m.homeId,
        awayId: m.awayId,
        homeName: m.homeName,
        awayName: m.awayName,
        premiereVue: maintenant,
        dernierInstantane: null,
        dernierDetail: null,
        sansStats: false,
        fini: false,
        dernier: null
      };
      s.vuA = maintenant;
      s.rang = rangDe({ ...s, league }, priorite);
      suivis.set(m.matchId, s);
      if (!enDirect) {
        // Terminé (ou annulé) depuis le tour précédent : un dernier instantané, puis on l'oublie.
        if (!s.fini) {
          const fin = instantane(s, m, null, maintenant, 'fin');
          lignes.push(fin);
          s.dernier = fin;
          s.fini = true;
          bilan.fins++;
        }
        continue;
      }
      s.liste = m;
      bilan.enDirect++;
    }
    etat.prochainCoupDEnvoi = prochain;

    // 3. Qui a besoin d'un instantané, et qui d'un détail (plafond, rotation).
    const dus = [...suivis.values()].filter((s) => !s.fini && vusCeTour.has(s.id) && (!s.dernierInstantane || maintenant - s.dernierInstantane >= pas));
    const veutDetail = (s) => !s.liste?.halfTime && (!s.sansStats || !s.dernierDetail || maintenant - s.dernierDetail >= PAS_DETAIL_SANS_STATS_MS);
    const candidats = dus.filter(veutDetail).sort((a, b) => a.rang - b.rang || (a.dernierDetail ?? 0) - (b.dernierDetail ?? 0) || String(a.kickoff).localeCompare(String(b.kickoff)));
    const permis = Math.max(0, etat.reglages.maxDetailsParMinute - detailsDeLaMinute(maintenant));
    const choisis = candidats.slice(0, permis);
    bilan.horsPlafond = candidats.length - choisis.length;
    etat.totaux.horsPlafond += bilan.horsPlafond;

    const servis = new Set();
    for (const [i, s] of choisis.entries()) {
      if (i > 0) await pause(pauseMs);
      lecturesDetail.push(maintenant);
      let detail = null;
      try {
        detail = await lireDetail(s.id);
        noterSucces();
      } catch (error) {
        bilan.erreurs++;
        if (noterErreur(maintenant, `détail ${s.homeName} - ${s.awayName} : ${error?.message ?? error}`)) {
          bilan.suspendu = iso(etat.suspenduJusqua);
          break;
        }
        continue;
      }
      etat.totaux.details++;
      bilan.details++;
      s.dernierDetail = maintenant;
      if (detail && !detail.stats) s.sansStats = true;
      if (detail?.stats) s.sansStats = false;
      // La couverture du championnat (« xG », « lower »…) reste connue pour les instantanés de la liste seule.
      if (detail?.coverage) s.coverage = detail.coverage;
      const ligne = instantane(s, s.liste, detail, maintenant);
      lignes.push(ligne);
      s.dernier = ligne;
      s.dernierInstantane = maintenant;
      servis.add(s.id);
    }

    // 4. Les instantanés dus sans détail : mi-temps, sans statistiques, ou
    //    détail attendu trop longtemps (plafond) — la liste seule.
    for (const s of dus) {
      if (servis.has(s.id)) continue;
      const attendDepuis = s.dernierInstantane ? maintenant - s.dernierInstantane - pas : maintenant - s.premiereVue;
      if (veutDetail(s) && attendDepuis < ATTENTE_DETAIL_MAX_MS && !bilan.suspendu) continue;
      const ligne = instantane(s, s.liste, null, maintenant);
      lignes.push(ligne);
      s.dernier = ligne;
      s.dernierInstantane = maintenant;
    }

    // 5. Oublier les matchs finis et ceux disparus de la liste.
    for (const [id, s] of suivis) {
      if (s.fini || maintenant - (s.vuA ?? 0) > OUBLI_MS) suivis.delete(id);
    }

    if (lignes.length) enFile(lignes);
    bilan.instantanes = lignes.length;
    etat.totaux.instantanes += lignes.length;
    etat.totaux.fins += bilan.fins;
    return bilan;
  } catch (error) {
    bilan.erreur = String(error?.message ?? error).slice(0, 200);
    return bilan;
  } finally {
    etat.totaux.tours++;
    etat.dernierTour = bilan;
    enCours = false;
  }
}

/** Démarre la boucle (une minute). Sans effet si elle tourne déjà. */
export function startLiveWatch({ pasMinutes, maxDetailsParMinute, erreursMax, suspensionMinutes, startupDelayMinutes = 2 } = {}) {
  if (timer) return false;
  etat.reglages = {
    pasMinutes: Math.max(5, Number(pasMinutes) || REGLAGES_PAR_DEFAUT.pasMinutes),
    maxDetailsParMinute: Math.max(1, Number(maxDetailsParMinute) || REGLAGES_PAR_DEFAUT.maxDetailsParMinute),
    erreursMax: Math.max(2, Number(erreursMax) || REGLAGES_PAR_DEFAUT.erreursMax),
    suspensionMinutes: Math.max(5, Number(suspensionMinutes) || REGLAGES_PAR_DEFAUT.suspensionMinutes)
  };
  etat.startedAt = iso();
  const lancer = () => tourDuDirect().catch(() => {});
  timer = setTimeout(() => {
    lancer();
    timer = setInterval(lancer, MINUTE_MS);
    timer.unref?.();
  }, startupDelayMinutes * MINUTE_MS);
  timer.unref?.();
  return true;
}

export function stopLiveWatch() {
  clearTimeout(timer);
  clearInterval(timer);
  timer = null;
}

/** Pour les tests : tout oublier et régler la boucle. */
export function __reglerDirect(reglages = {}) {
  suivis.clear();
  lecturesDetail.length = 0;
  priorites = { at: 0, valeur: null };
  enCours = false;
  Object.assign(etat, {
    reglages: { ...REGLAGES_PAR_DEFAUT, ...reglages },
    startedAt: null,
    derniereListe: 0,
    prochainCoupDEnvoi: null,
    erreursConsecutives: 0,
    suspenduJusqua: 0,
    erreur: null,
    derniereErreur: null,
    dernierTour: null,
    totaux: { tours: 0, listes: 0, details: 0, instantanes: 0, fins: 0, erreurs: 0, horsPlafond: 0 }
  });
}
