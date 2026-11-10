/**
 * debutsEnfant.js — LE PROCESSUS À PART de la nuit des débuts de saison (étape 35 du plan, lot 1b, 10/11/2026 ; conception
 * §6.5). Lancé par debutsNuit.js (fork, sérialisation « avancée », argument « --enfant-debuts ») ; ce n'est pas un script à
 * lancer à la main. La base est ouverte EN LECTURE SEULE (aucun ordre d'écriture ici : le serveur range), le tas est plafonné,
 * l'heure de la passe est reçue (jamais lue ici). Ni réseau, ni Claude, rien de payant.
 * -----------------------------------------------------------------------
 * La nuit, dans cet ordre :
 *   1. la liste des matchs des 14 prochains jours (listeDuCalendrier de l'étape 32 : annuaire STRICT — un match sans ses deux
 *      identifiants FotMob n'a pas de fiche, il est compté et ses noms sont dits ; annuaire pas prêt → la nuit est REPORTÉE) ;
 *   2. les couples du contrôle anti-fuite (graine = le jour de la nuit) ;
 *   3. LA PASSE de tout le magasin jusqu'à la veille (DebutsAuJourJ : les forces de la candidate, l'état scindé, les rangs, les
 *      statuts, les minutes des joueurs), un instantané de chaque couple pris AVANT la publication de son jour ;
 *   4. LES CLUBS vus dans les 400 derniers jours : rang, statut, championnat de la saison d'avant, continuité, mouvements de
 *      l'effectif (par identifiant de joueur ; « parti » seulement vu jouer ailleurs), force de l'effectif À BLANC ;
 *   5. LES FICHES des matchs de championnat des 14 prochains jours : les entrées des deux clubs (rang, statut, sommes, …) et
 *      les bras des familles qui concernent le match, avec les valeurs de la note du banc (noteDesDebuts.js) ;
 *   6. LE CONTRÔLE ANTI-FUITE par le second chemin (controleDesDebuts.js) ;
 *   7. les morceaux envoyés au serveur (250 lignes au plus), puis la fin (bilan, contrôle).
 * Rien de tout cela n'est lu par le moteur ni envoyé à l'IA.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { listeDuCalendrier } from '../contexte/listeDuCalendrier.js';
import { isCup } from '../providers/leagueCups.js';
import { seasonOf } from '../providers/seasonWindows.js';
import { DebutsAuJourJ, passerLesRencontres } from './debutsAuJourJ.js';
import { rencontresDuMagasin, naissances, SQL_MINUTES } from './lectureDesDebuts.js';
import { NUIT, QUI_COMPTE, EFFECTIF, VERSION_FICHE, VERSION_DEBUTS, N_PREMIERES } from './reglagesDebuts.js';
import { clubValide } from './formulesDebuts.js';
import { ensemblesDe } from './passeDesDebuts.js';
import { bras, attendusDuBras } from './bancDesDebuts.js';
import { DEBUTS_AU_BANC } from './noteDesDebuts.js';
import { referenceDeLaSaison, mouvementsDeLEffectif, continuiteDe, forceDeLEffectif } from '../db/squadChanges.js';
import { tirerLesCouples, instantaneDuClub, controlerLesInstantanes, graineDuJour, nomDuClubParLAnnuaire } from './controleDesDebuts.js';

const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const arrondi = (x, n = 6) => (fini(x) ? Number(x.toFixed(n)) : null);
/** Les clubs gardés : vus (un match au magasin) dans les 400 derniers jours. */
export const JOURS_DES_CLUBS = 400;
/** La liste FotMob des indisponibles : la plus récente des 30 derniers jours. */
export const JOURS_DES_INDISPONIBLES = 30;
const RAISONS = Object.freeze({ injury: 'blesse', suspension: 'suspendu', internationalDuty: 'en-selection' });
const absente = (error) => /no such (table|column)/i.test(String(error?.message ?? ''));

// ======================================================= les lectures de la nuit (base de l'appelant, lecture seule)

/**
 * Les minutes des joueurs jusqu'au jour `jusqua` (SQL_MINUTES : joués, minutes > 0, identifiant ≥ 1), rangées par rencontre en
 * tableaux plats [joueur, club, minutes, …] (la mémoire), et le compte des postes de chaque joueur (le poste dominant).
 */
export function chargerLesMinutes(database, jusqua) {
  const parRencontre = new Map();
  const postes = new Map();
  let lignes = 0;
  for (const l of database.prepare(SQL_MINUTES).iterate(jusqua)) {
    const r = Number(l.rencontre);
    let t = parRencontre.get(r);
    if (!t) parRencontre.set(r, (t = []));
    t.push(Number(l.joueur), Number(l.club), Number(l.minutes));
    const p = Number(l.poste);
    if (p >= 1 && p <= 5) {
      let c = postes.get(Number(l.joueur));
      if (!c) postes.set(Number(l.joueur), (c = new Uint16Array(6)));
      if (c[p] < 65535) c[p] += 1;
    }
    lignes++;
  }
  return { parRencontre, postes, lignes };
}

/** Le poste dominant d'un joueur (1 gardien, 2 défenseur — le libéro compte défenseur —, 3 milieu, 4 attaquant), ou null. */
export function posteDominant(c) {
  if (!c) return null;
  const n = [0, c[1], c[2] + c[5], c[3], c[4]];
  let meilleur = null;
  for (let p = 1; p <= 4; p++) if (n[p] > 0 && (meilleur === null || n[p] > n[meilleur])) meilleur = p;
  return meilleur;
}

/** Les fiches des joueurs de l'étape 30 (player_ratings : apports ×1000 rangés en entiers) : Map joueur → { apportOff, apportDef }, et leur jour. */
export function fichesDesJoueurs(database) {
  const fiches = new Map();
  let jour = null;
  try {
    for (const r of database.prepare('SELECT joueur, apport_off, apport_def FROM player_ratings').iterate()) {
      fiches.set(Number(r.joueur), { apportOff: fini(r.apport_off) ? r.apport_off / 1000 : null, apportDef: fini(r.apport_def) ? r.apport_def / 1000 : null });
    }
    jour = database.prepare('SELECT MAX(jour) AS j FROM player_ratings').get()?.j ?? null;
  } catch (error) {
    if (!absente(error)) throw error;
  }
  return { fiches, jour };
}

/**
 * La liste FotMob des indisponibles (unavailable_daily), la plus récente des 30 derniers jours pour chaque joueur et son club :
 * Map « club|joueur » → { raison: 'blesse' | 'suspendu' | 'en-selection' | 'indisponible', jour }.
 */
export function indisponibles(database, jourD) {
  const out = new Map();
  try {
    for (const r of database.prepare('SELECT day, player_id, team_id, reason FROM unavailable_daily WHERE day >= ? AND day <= ? ORDER BY day').iterate(plusJours(jourD, -JOURS_DES_INDISPONIBLES), jourD)) {
      const j = numero(r.player_id);
      const c = numero(r.team_id);
      if (j === null || c === null) continue;
      out.set(`${c}|${j}`, { raison: RAISONS[r.reason] ?? 'indisponible', jour: String(r.day).slice(0, 10) });
    }
  } catch (error) {
    if (!absente(error)) throw error;
  }
  return out;
}

/** Le numéro FotMob d'un identifiant « fotmob-N » (N ≥ 1), sinon null — jamais un nom. */
function numero(id) {
  const m = /^fotmob-([1-9]\d*)$/.exec(String(id ?? ''));
  const n = m ? Number(m[1]) : null;
  return n !== null && Number.isSafeInteger(n) ? n : null;
}

/**
 * La part des minutes SANS identifiant FotMob de chaque club depuis le début de sa saison (les feuilles brutes, `players` :
 * identifiant absent, mal formé ou 0 — jamais comptées ailleurs). `debuts` : Map club → premier jour de sa saison. Rend Map club → part.
 */
export function minutesSansIdentifiant(database, debuts, jourD) {
  const out = new Map();
  if (!debuts.size) return out;
  let de = jourD;
  for (const d of debuts.values()) if (d < de) de = d;
  if (de < plusJours(jourD, -JOURS_DES_CLUBS)) de = plusJours(jourD, -JOURS_DES_CLUBS);
  const sommes = new Map();
  try {
    for (const r of database
      .prepare(
        `SELECT m.date, m.home_id, m.away_id, p.side,
           SUM(CASE WHEN p.player_id GLOB 'fotmob-[1-9]*' THEN p.minutes ELSE 0 END) AS avec,
           SUM(CASE WHEN p.player_id GLOB 'fotmob-[1-9]*' THEN 0 ELSE p.minutes END) AS sans
         FROM matches m JOIN players p ON p.match_key = m.match_key
         WHERE m.date >= ? AND m.date < ? AND p.minutes > 0 GROUP BY m.match_key, p.side`
      )
      .iterate(de, jourD)) {
      const club = numero(r.side === 'home' ? r.home_id : r.away_id);
      const debut = club === null ? undefined : debuts.get(club);
      if (debut === undefined || String(r.date).slice(0, 10) < debut) continue;
      const s = sommes.get(club) ?? { avec: 0, sans: 0 };
      s.avec += Number(r.avec ?? 0);
      s.sans += Number(r.sans ?? 0);
      sommes.set(club, s);
    }
  } catch (error) {
    if (!absente(error)) throw error;
  }
  for (const [club, s] of sommes) out.set(club, s.avec + s.sans > 0 ? s.sans / (s.avec + s.sans) : null);
  return out;
}

// ======================================================= la nuit

const MOUVEMENT = new Set(['promu', 'relegue']);

/**
 * Ce que la fiche garde d'un club lu (aucun nom ; les sommes à pleine précision ; la force de l'effectif à blanc, Δ compris,
 * pour la preuve de 2027 — critique, constat 6).
 */
function entreeDuClub(c, continuite, contMoyLigue, effectif = null) {
  if (!c.valide) return { club: c.club, valide: false };
  return {
    club: c.club,
    valide: true,
    saison: c.saison,
    rang: c.rang,
    statut: c.statut,
    ligueAvant: c.ligueAvant,
    treve: c.treve,
    remise: c.remise,
    n: c.sommes?.n ?? 0,
    nx: c.sommes?.nx ?? 0,
    tot: c.sommes ? Array.from(c.sommes.tot) : null,
    sai: c.sommes ? Array.from(c.sommes.sai) : null,
    continuite,
    contMoyLigue,
    effectif
  };
}

const attendusArrondis = (e) => (e && fini(e.lambda) && fini(e.mu) ? { lambda: arrondi(e.lambda), mu: arrondi(e.mu) } : null);

/**
 * LES BRAS d'une fiche (à blanc, avant recalage) : la candidate, et, pour chaque famille qui CONCERNE le match (un club de rang
 * ≤ 10 dans son ensemble), ses deux bras avec les valeurs finales de la note du banc (magasin, A ∪ B) — nouveaux venus : le
 * commun face au centre des promus posé sur eux ; promus et relégués : le commun face aux centres dirigés ; rappel : la
 * candidate face à l'oubli d. null sans note (« pas encore mesuré »).
 */
export function brasDeLaFiche(rec, ens, note = DEBUTS_AU_BANC) {
  const V = note?.valeursFinales?.magasin ?? null;
  if (!note || !V) return null;
  const candidate = attendusArrondis(attendusDuBras(rec, bras('candidate')));
  const familles = {};
  if (ens.nouveaux && V.promus) {
    familles.nouveaux = {
      A: attendusArrondis(attendusDuBras(rec, bras('nouveauxCommun', { c0: V.promus.c0 }, { remise: true }))),
      B: attendusArrondis(attendusDuBras(rec, bras('nouveauxDirige', { theta: V.promus.theta }, { remise: true })))
    };
  }
  if (ens.promus && V.promus) {
    familles.promus = {
      A: attendusArrondis(attendusDuBras(rec, bras('commun', { c0: V.promus.c0 }, { remise: true }))),
      B: attendusArrondis(attendusDuBras(rec, bras('dirige', { theta: V.promus.theta }, { remise: true })))
    };
  }
  if (ens.rappel && fini(V.dRappel)) {
    familles.rappel = { A: candidate, B: attendusArrondis(attendusDuBras(rec, bras('rappel', { d: V.dRappel }))) };
  }
  return { note: note.calculeLe ?? null, candidate, familles };
}

/**
 * LA NUIT. `instant` : l'heure de la passe (reçue) ; `jourD` : son jour de Paris ; `envoyer(type, lignes)` : les morceaux
 * ('clubs', 'fiches') ; `graine`, `couples` : le contrôle (par défaut la graine du jour, 20 couples) ; `clubDe`,
 * `fichierCalendrier` : pour les essais. Rend { bilan, controle, liste }.
 */
export function calculerLaNuitDesDebuts({ database, instant, jourD, fichierCalendrier = undefined, envoyer = () => {}, clubDe = null, graine = undefined, couples: nombreCouples = NUIT.couples, note = DEBUTS_AU_BANC }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const mesure = () => (rssMax = Math.max(rssMax, process.memoryUsage.rss()));
  const veille = plusJours(jourD, -1);
  const calculeLe = new Date(instant).toISOString();
  const durees = {};
  // 1. La liste du calendrier (l'annuaire strict, vérifié d'abord : pas prêt → reportée).
  let t = performance.now();
  const liste = executerSansPause(listeDuCalendrier({ database, jourD, clubDe, ...(fichierCalendrier ? { fichierCalendrier } : {}) }));
  const fin14 = plusJours(jourD, NUIT.fenetreJours);
  const aVenir = liste.items.filter((it) => it.statut === 'scheduled' && it.date >= jourD && it.date <= fin14);
  const deChampionnat = aVenir.filter((it) => !isCup(it.league));
  // les matchs de championnat sans leurs deux identifiants (une coupe n'a jamais de fiche : comptée à part)
  const sansIdChampionnat = liste.sansIdentifiant.filter((x) => !isCup(x.league));
  durees.liste = Math.round(performance.now() - t);
  // 2. Les couples du contrôle anti-fuite.
  const couples = tirerLesCouples({ database, jourD, graine: graine === undefined ? graineDuJour(jourD) : graine, nombre: nombreCouples, jours: NUIT.joursDuControle });
  const couplesParJour = new Map();
  for (const c of couples) {
    if (!couplesParJour.has(c.date)) couplesParJour.set(c.date, []);
    couplesParJour.get(c.date).push(c);
  }
  // 3. Les minutes, puis LA PASSE jusqu'à la veille.
  t = performance.now();
  const { parRencontre, postes, lignes: lignesDeMinutes } = chargerLesMinutes(database, veille);
  durees.minutes = Math.round(performance.now() - t);
  mesure();
  t = performance.now();
  const debuts = new DebutsAuJourJ({ avecForces: true });
  const dernierVu = new Map();
  const instantanes = new Map();
  const avant = (jour, duJour) => {
    const cs = couplesParJour.get(jour);
    if (!cs) return;
    for (const c of cs) {
      const r = duJour.find((x) => x.cle === c.matchKey);
      if (r) instantanes.set(`${c.matchKey}|${c.camp}`, instantaneDuClub(debuts, c, r));
    }
  };
  function* flux() {
    for (const r of rencontresDuMagasin({ database, jusqua: veille, avecResultats: true, minutes: null })) {
      const plat = parRencontre.get(r.rencontre);
      const joueurs = [];
      if (plat) {
        for (let k = 0; k < plat.length; k += 3) joueurs.push({ joueur: plat[k], club: plat[k + 1], minutes: plat[k + 2] });
        parRencontre.delete(r.rencontre);
      }
      r.joueurs = joueurs;
      for (const club of [r.home, r.away]) if (clubValide(club)) dernierVu.set(club, { date: r.date, league: r.league });
      yield r;
    }
  }
  executerSansPause(passerLesRencontres(debuts, flux(), { avant }));
  parRencontre.clear();
  durees.passe = Math.round(performance.now() - t);
  mesure();
  // 4. LES CLUBS vus dans les 400 derniers jours.
  t = performance.now();
  const limite = plusJours(jourD, -JOURS_DES_CLUBS);
  const { fiches: fichesJoueurs, jour: fichesDu } = fichesDesJoueurs(database);
  const indispo = indisponibles(database, jourD);
  const lus = [];
  const debutsDesSaisons = new Map();
  for (const [club, vu] of dernierVu) {
    if (vu.date < limite) continue;
    const st = debuts.clubs.get(club);
    const league = st?.e.ligue ?? null;
    const lu = league ? debuts.lireLeClub(club, { date: jourD, league, coupe: false, compte: true, attribue: false }) : { club, valide: true, saison: seasonOf(vu.league, jourD), rang: null, statut: null, ligueAvant: null };
    const s = lu.saison;
    const ms = debuts.minutesDuClub(club, s);
    const mav = debuts.minutesDuClub(club, s - 1);
    const debutS = debuts.debutDeSaison(club, s);
    if (debutS && ms) debutsDesSaisons.set(club, debutS);
    lus.push({ club, league, lu, s, ms, mav, debutS, continuite: ms && mav ? continuiteDe(ms.joueurs, new Set(mav.joueurs.keys())) : null });
  }
  const sansId = minutesSansIdentifiant(database, debutsDesSaisons, jourD);
  // la force de l'effectif à blanc d'un club pour une saison (fiches des joueurs de l'étape 30 ; rien avant 2 matchs), une fois
  const forces = new Map();
  const forceDuClub = (club, s) => {
    const cle = `${club}|${s}`;
    if (forces.has(cle)) return forces.get(cle);
    const ms = debuts.minutesDuClub(club, s);
    const mav = debuts.minutesDuClub(club, s - 1);
    const f = forceDeLEffectif({ minutesSaison: ms?.joueurs ?? null, matchsSaison: ms?.matchs ?? 0, minutesAvant: mav?.joueurs ?? null, matchsAvant: mav?.matchs ?? 0, fiches: fichesJoueurs, minMatchs: EFFECTIF.minMatchs });
    const force = f ? { dOff: arrondi(f.dOff), dDef: arrondi(f.dDef), eOff: arrondi(f.eOff), eDef: arrondi(f.eDef), eOffAvant: arrondi(f.eOffAvant), eDefAvant: arrondi(f.eDefAvant), couverture: arrondi(f.couverture), matchsSaison: ms?.matchs ?? 0, fichesDu } : null;
    forces.set(cle, force);
    return force;
  };
  // la moyenne de continuité de chaque championnat-saison (les clubs qui en ont une)
  const parLigue = new Map();
  for (const x of lus) {
    if (!x.league || x.continuite === null) continue;
    const k = `${x.league}|${x.s}`;
    const v = parLigue.get(k) ?? { somme: 0, n: 0 };
    v.somme += x.continuite;
    v.n += 1;
    parLigue.set(k, v);
  }
  const contMoy = (league, s) => {
    const v = parLigue.get(`${league}|${s}`);
    return v && v.n ? v.somme / v.n : null;
  };
  const ailleursSt = database.prepare('SELECT club, date FROM player_day WHERE joueur = ? AND date >= ? AND date < ? AND joue = 1 AND minutes > 0 AND club <> ? ORDER BY date LIMIT 1');
  const dOuSt = database.prepare('SELECT club, date FROM player_day WHERE joueur = ? AND date < ? AND joue = 1 AND minutes > 0 AND club <> ? ORDER BY date DESC LIMIT 1');
  const clubs = [];
  const parStatut = {};
  let mouvementsCalcules = 0;
  for (const x of lus) {
    const { club, lu, s, ms, mav, debutS } = x;
    let mouvements = null;
    if (mav && mav.matchs > 0) {
      const reference = referenceDeLaSaison(mav.joueurs, mav.matchs, QUI_COMPTE.part);
      if (ms && debutS) {
        const ailleurs = new Map();
        for (const j of reference.keys()) {
          if ((ms.joueurs.get(j) ?? 0) > 0) continue;
          const r = ailleursSt.get(j, debutS, jourD, club);
          if (r) ailleurs.set(j, { club: Number(r.club), date: String(r.date).slice(0, 10) });
        }
        const avantAilleurs = new Map();
        const dOuDates = new Map();
        for (const j of ms.joueurs.keys()) {
          if (reference.has(j) || mav.joueurs.has(j)) continue;
          const r = dOuSt.get(j, debutS, club);
          if (r) {
            avantAilleurs.set(j, Number(r.club));
            dOuDates.set(j, String(r.date).slice(0, 10));
          }
        }
        const indisponiblesDuClub = new Map();
        for (const j of reference.keys()) {
          const i = indispo.get(`${club}|${j}`);
          if (i) indisponiblesDuClub.set(j, i);
        }
        const aNaitre = [...reference.keys(), ...ms.joueurs.keys()];
        const nes = naissances(database, aNaitre.filter((j) => !(ms.joueurs.get(j) > 0) || !mav.joueurs.has(j)));
        const postesDuClub = new Map();
        for (const j of aNaitre) postesDuClub.set(j, posteDominant(postes.get(j)));
        const m = mouvementsDeLEffectif({ reference, saison: ms.joueurs, avantClub: mav.joueurs, ailleurs, matchsSaison: ms.matchs, avantAilleurs, naissances: nes, postes: postesDuClub, indisponibles: indisponiblesDuClub, seuil: QUI_COMPTE.part, minMatchsArrivee: QUI_COMPTE.minMatchsArrivee });
        const debutMoins365 = plusJours(debutS, -365);
        mouvements = {
          version: 1,
          debut: debutS,
          matchsSaison: ms.matchs,
          matchsAvant: mav.matchs,
          reference: [
            ...m.restes.map((r) => ({ j: r.joueur, avant: r.minutesAvant, m: r.minutes, etat: 'joue', poste: postesDuClub.get(r.joueur) ?? null })),
            ...m.partisVusAilleurs.map((r) => ({ j: r.joueur, avant: r.minutesAvant, m: 0, etat: 'parti', club: r.club, date: r.date, poste: postesDuClub.get(r.joueur) ?? null })),
            ...m.pasRevus.map((r) => ({ j: r.joueur, avant: r.minutesAvant, m: 0, etat: 'pas-revu', raison: r.raison?.raison ?? null, jourRaison: r.raison?.jour ?? null, poste: postesDuClub.get(r.joueur) ?? null }))
          ].sort((a, b) => b.avant - a.avant || a.j - b.j),
          arrives: m.arrives
            .map((a) => ({ j: a.joueur, m: a.minutes, part: arrondi(a.part, 6), compte: a.quiCompte, dOu: a.dOu ? { club: a.dOu.club, date: dOuDates.get(a.joueur) ?? null, recent: (dOuDates.get(a.joueur) ?? '') >= debutMoins365 } : null, poste: postesDuClub.get(a.joueur) ?? null }))
            .sort((a, b) => b.m - a.m || a.j - b.j),
          doubles: m.doublesPossibles.map((d) => ({ pasRevu: d.pasRevu, arrive: d.arrive, naissance: d.naissance, poste: d.poste }))
        };
        mouvementsCalcules++;
      } else {
        mouvements = {
          version: 1,
          debut: null,
          matchsSaison: 0,
          matchsAvant: mav.matchs,
          reference: [...reference.entries()].map(([j, avantM]) => ({ j, avant: avantM, m: 0, etat: 'a-venir', poste: posteDominant(postes.get(j)) })).sort((a, b) => b.avant - a.avant || a.j - b.j),
          arrives: [],
          doubles: []
        };
      }
    }
    const force = forceDuClub(club, s);
    if (lu.rang !== null && lu.rang <= N_PREMIERES && lu.statut) parStatut[lu.statut] = (parStatut[lu.statut] ?? 0) + 1;
    clubs.push({
      club,
      league: x.league,
      saison: s,
      rang: lu.rang ?? null,
      statut: lu.statut ?? null,
      ligue_avant: lu.ligueAvant ?? null,
      continuite: x.continuite,
      cont_moy_ligue: x.league ? contMoy(x.league, s) : null,
      mouvements: mouvements ? JSON.stringify(mouvements) : null,
      force_effectif: force ? JSON.stringify(force) : null,
      sans_identifiant: sansId.has(club) ? sansId.get(club) : null,
      calcule_le: calculeLe,
      version: VERSION_DEBUTS
    });
  }
  durees.clubs = Math.round(performance.now() - t);
  mesure();
  for (let i = 0; i < clubs.length; i += NUIT.tranche) envoyer('clubs', clubs.slice(i, i + NUIT.tranche));
  // 5. LES FICHES des matchs de championnat des 14 prochains jours.
  t = performance.now();
  const calendrierDuClub = new Map();
  for (const it of aVenir) {
    for (const c of [it.home, it.away]) {
      if (!calendrierDuClub.has(c)) calendrierDuClub.set(c, []);
      calendrierDuClub.get(c).push(it);
    }
  }
  /** Les matchs de championnat déjà au calendrier d'ici le jour D (même championnat, même saison) : le rang du jour D. */
  const avantLeJourD = (club, league, saison, D) => (calendrierDuClub.get(club) ?? []).filter((x) => x.league === league && x.date < D && seasonOf(x.league, x.date) === saison).length;
  const fiches = [];
  const concernes = { rappel: 0, promus: 0, nouveaux: 0 };
  for (const it of [...deChampionnat].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.home - b.home))) {
    const r = { date: it.date, league: it.league, coupe: false, compte: true, attribue: false };
    const h = debuts.lireLeClub(it.home, r);
    const a = debuts.lireLeClub(it.away, r);
    for (const c of [h, a]) if (c.valide && c.rang !== null) c.rang += avantLeJourD(c.club, it.league, c.saison, it.date);
    const saisonDuMatch = seasonOf(it.league, it.date);
    const ligue = debuts.moyennes(it.league, it.date, saisonDuMatch);
    const ens = ensemblesDe(h, a);
    for (const k of Object.keys(concernes)) if (ens[k]) concernes[k]++;
    const cont = (c) => {
      if (!c.valide) return null;
      const ms = debuts.minutesDuClub(c.club, c.saison);
      const mav = debuts.minutesDuClub(c.club, c.saison - 1);
      return ms && mav ? continuiteDe(ms.joueurs, new Set(mav.joueurs.keys())) : null;
    };
    const entrees = {
      version: VERSION_FICHE,
      date: it.date,
      league: it.league,
      saison: saisonDuMatch,
      ligue,
      ensembles: { rappel: ens.rappel, promus: ens.promus, nouveaux: ens.nouveaux },
      home: entreeDuClub(h, cont(h), h.valide ? contMoy(it.league, h.saison) : null, h.valide ? forceDuClub(h.club, h.saison) : null),
      away: entreeDuClub(a, cont(a), a.valide ? contMoy(it.league, a.saison) : null, a.valide ? forceDuClub(a.club, a.saison) : null)
    };
    const lesBras = brasDeLaFiche({ h, a, ligue }, ens, note);
    fiches.push({
      date: it.date,
      home_id: it.home,
      away_id: it.away,
      league: it.league,
      match_id: it.matchId ?? null,
      kickoff: null,
      kickoff_connu: 0,
      calcule_le: calculeLe,
      version: VERSION_FICHE,
      note: note?.calculeLe ?? null,
      entrees: JSON.stringify(entrees),
      bras: lesBras ? JSON.stringify(lesBras) : null
    });
  }
  durees.fiches = Math.round(performance.now() - t);
  for (let i = 0; i < fiches.length; i += NUIT.tranche) envoyer('fiches', fiches.slice(i, i + NUIT.tranche));
  mesure();
  // 6. LE CONTRÔLE ANTI-FUITE par le second chemin.
  t = performance.now();
  const controle = controlerLesInstantanes({ database, couples, instantanes, nomDuClub: nomDuClubParLAnnuaire(database) });
  durees.controle = Math.round(performance.now() - t);
  mesure();
  const avecContinuite = clubs.filter((c) => c.continuite !== null);
  return {
    bilan: {
      clubs: clubs.length,
      parStatut,
      mouvements: mouvementsCalcules,
      continuiteMoyenne: avecContinuite.length ? avecContinuite.reduce((s, c) => s + c.continuite, 0) / avecContinuite.length : null,
      avecForce: clubs.filter((c) => c.force_effectif !== null).length,
      fichesDu,
      fiches: fiches.length,
      concernes,
      matchsAVenir: aVenir.length,
      coupesSansFiche: aVenir.length - deChampionnat.length,
      sansIdentifiant: sansIdChampionnat.length,
      coupesSansIdentifiant: liste.sansIdentifiant.length - sansIdChampionnat.length,
      // les 20 premiers matchs sans fiche, tels que la liste du calendrier les rend (championnat, les deux noms du calendrier,
      // ceux que l'annuaire strict ne connaît pas) : relayés pour le journal, jamais lus ni comparés ici (T-R7)
      noms: sansIdChampionnat.slice(0, 20),
      rencontres: debuts.rencontres,
      lignesDeMinutes,
      note: note?.calculeLe ?? null,
      durees: { ...durees, total: Math.round(performance.now() - t0) },
      aPart: { pid: process.pid, rssMaxOctets: Math.max(rssMax, process.memoryUsage.rss()) }
    },
    controle: { calculeLe, jourD, couples: couples.length, lignes: controle.lignes, ecarts: controle.ecarts }
  };
}

export const __pourLesTests = { entreeDuClub, MOUVEMENT };

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-debuts') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      if (m?.mode !== 'nuit') throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      const database = openDb({ file: m.chemin, readonly: true });
      const fin = calculerLaNuitDesDebuts({ ...m, database, envoyer: (type, lignes) => process.send({ morceau: { type, lignes } }) });
      process.send({ fin: true, mode: m.mode, ...fin }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000), reporte: Boolean(error?.reporte) }, () => process.exit(0));
    }
  });
}
