/**
 * joueursEnfant.js — LES CHIFFRES DES JOUEURS, DANS UN PROCESSUS À PART (étape 34 du plan, lot 1a, partie B, 03/11/2026).
 * -----------------------------------------------------------------------
 * UN SEUL fichier d'enfant, à modes (comme cartonsEnfant.js de la 33) ; lancé par scripts/joueurs-a-blanc.mjs (fork,
 * sérialisation « avancée », argument « --enfant-joueurs ») — la nuit (lot 1b) y ajoutera son mode. Ce n'est pas un script
 * à lancer à la main. La base est ouverte EN LECTURE SEULE avant toute lecture (openDb({ readonly: true })) ; aucune
 * écriture, aucune horloge (seules des durées), ni réseau, ni Claude. Deux modes :
 *   « comptes »  AVANT LE REGARD : la passe chronologique jusqu'au dernier jour lu et les comptes (comptesDesJoueurs.js :
 *                couvertures, relevés, règle des penalties par année, compositions, faux joueurs — jamais une perte, un
 *                attendu ni une part de joueur) ;
 *   « banc »     LE PASSAGE UNIQUE : la même passe ; les données du banc, puis jugerLesVariantes, valeursFinales et les
 *                horizons (bancDesJoueurs.js).
 * LA PASSE (passeDesJoueurs, commune) : trois accumulateurs côte à côte, journée par journée, tous publiés en fin de
 * journée —
 *   - CartonsAuJourJ de la 33 (le flux des cartons construit EN MÉMOIRE par la fonction même de l'enfant du banc de la 33 :
 *     mettreAJourLeCache jusqu'au dernier jour lu, puis rencontresChronologiques de lectureDesCartons.js — critique,
 *     constat 7) : le statut des cartons du jour J (relevés, garde comprise) et la moyenne de la compétition pour chaque
 *     côté au jour J (C, « le repère de la 33 sans la pente »), la MÊME base au banc, à l'écran et dans l'archive ;
 *   - AccumulateurDesForces (forcesButs.js) et modeleDeButs sans cote (BASE_STATISTIQUE de la 32) : λS et μS au jour J,
 *     comme passeDuBanc de la 32 (T-F5) ;
 *   - JoueursAuJourJ : les entrées de chaque composition au jour J.
 * `passeDesJoueurs`, `compterLesJoueurs` et `passerLeBanc` sont aussi appelables dans le processus courant (les essais,
 * sur une copie).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { executerSansPause } from '../../utils/travailCooperatif.js';
import { AccumulateurDesForces } from '../db/forcesButs.js';
import { modeleDeButs, faitsDeLaRencontre, saisonEnNombre, empreinteDesForces } from '../../core/engine/goalModel.js';
import { BASE_STATISTIQUE, EMPREINTE_DE_LA_BASE } from '../contexte/bancDuContexte.js';
import { mettreAJourLeCache, rencontresChronologiques as fluxDesCartons } from '../cartons/lectureDesCartons.js';
import { CartonsAuJourJ } from '../cartons/cartonsAuJourJ.js';
import { PERIODES_DU_BANC, BORNES_LAMBDA } from './reglagesJoueurs.js';
import { JoueursAuJourJ } from './joueursAuJourJ.js';
import { rencontresChronologiques, fusions } from './lectureDesJoueurs.js';
import { compteurDesJoueurs } from './comptesDesJoueurs.js';
import { DonneesDuBanc, jugerLesVariantes, valeursFinales, horizonDeLaPreuve } from './bancDesJoueurs.js';
// Étape 34, lot 1b : le mode « nuit » (les fiches, les repères, la base des matchs à venir, l'archive d'avant-match, le contrôle).
import { NUIT, VERSION_JOUEURS } from './reglagesJoueurs.js';
import { posteDominant } from './formulesDesJoueurs.js';
import { JOUEURS_AU_BANC } from './noteDesJoueurs.js';
import { parametresDeLEcran, entreesDepuisLesFiches, chiffresDUnCamp, ligneDArchive } from './chiffresDesJoueurs.js';
import { compoPubliee, feuilleDeLaDerniere, absentsAnnonces, coupDEnvoiSur, cleDeLaCandidate } from './lectureDesCompos.js';
import { tirerLesCouples, instantaneDeLaPasse, controlerLesInstantanes } from './controleDesJoueurs.js';
import { listeDuCalendrier } from '../contexte/listeDuCalendrier.js';
import { moyennesEquipe } from '../db/statInputsRead.js';
import { statExpectations } from '../../sports/football/statMarkets.js';
import { seasonOf } from '../providers/seasonWindows.js';

const JOUR_MS = 86_400_000;
if (empreinteDesForces(BASE_STATISTIQUE) !== EMPREINTE_DE_LA_BASE) throw new Error('joueurs : l’empreinte des forces de la base a changé');
if (BASE_STATISTIQUE.bornes[0] !== BORNES_LAMBDA[0] || BASE_STATISTIQUE.bornes[1] !== BORNES_LAMBDA[1]) throw new Error('joueurs : les bornes de λ ne sont plus celles de la base statistique');

/** Le flux des cartons EN MÉMOIRE jusqu'au dernier jour lu (la fonction de l'enfant du banc de la 33 ; rien n'est rangé). */
export function fluxDesCartonsEnMemoire(database, jusqua) {
  const t = performance.now();
  const maj = executerSansPause(mettreAJourLeCache(database, { jusqua }));
  return { cache: maj.cache, relues: maj.relues, mode: maj.mode, duree: Math.round(performance.now() - t) };
}

/**
 * LA PASSE COMMUNE (comptes et banc) : les rencontres jusqu'au dernier jour lu (rien de P5) ; pour chaque journée, dans
 * l'ordre : les cartons du jour (statut relevé et moyennes d'avant la journée) posés sur chaque rencontre ; la base λ de
 * chaque rencontre non attribuée (forces d'avant la journée) ; la dernière feuille de chaque club (d'avant la journée) ;
 * les entrées des compositions (JoueursAuJourJ, d'avant la journée) ; `surObservation(o)` pour chaque rencontre ; puis
 * les forces de la journée publiées. Rend { lues, durees, cartons: { relues, mode } }.
 */
export function passeDesJoueurs({ database, periodes = PERIODES_DU_BANC, surObservation, avantDePublier = null, fuite = false }) {
  const durees = {};
  let t = performance.now();
  const cartons = fluxDesCartonsEnMemoire(database, periodes.dernierJourLu);
  durees.cartons = cartons.duree;
  t = performance.now();
  const parFusion = fusions(database);
  const accC = new CartonsAuJourJ();
  const accF = new AccumulateurDesForces({ empreintes: [EMPREINTE_DE_LA_BASE] });
  const accJ = new JoueursAuJourJ();
  const itC = fluxDesCartons({ database, cache: cartons.cache, jusqua: periodes.dernierJourLu })[Symbol.iterator]();
  let lues = 0;
  let jour = null;
  let duJour = [];
  const publier = () => {
    if (!duJour.length) return;
    // 1. Les cartons du jour (le même registre, le même ordre (jour, clé) que le flux des joueurs).
    const cartonsDuJour = [];
    for (let k = 0; k < duJour.length; k++) {
      const n = itC.next();
      if (n.done || n.value.matchKey !== duJour[k].matchKey) throw new Error(`passe des joueurs : le flux des cartons n’est pas aligné (${duJour[k].matchKey} ≠ ${n.done ? 'fin' : n.value.matchKey})`);
      cartonsDuJour.push(n.value);
      accC.ajouter(n.value);
    }
    const instC = accC.finDeJournee();
    // 2. La base λ (forces d'avant la journée), la dernière feuille, puis les entrées des compositions.
    const observations = duJour.map((r) => {
      const c = instC.get(r.matchKey);
      r.cartonsReleves = Boolean(c?.releve);
      let lambda = null;
      if (!r.attribue) {
        const s = modeleDeButs({
          fair: null,
          entrees: { forces: { home: accF.etat(EMPREINTE_DE_LA_BASE, r.home), away: accF.etat(EMPREINTE_DE_LA_BASE, r.away) }, ligue: accF.moyennes(r.league, jour, saisonEnNombre(r.saison)), plusMoins: null },
          reglages: BASE_STATISTIQUE
        }).parties.statistiques;
        lambda = { lambda: s.lambda, mu: s.mu };
      }
      const cadres = r.camps.home.cadresAttendus !== null && r.camps.away.cadresAttendus !== null ? { home: r.camps.home.cadresAttendus, away: r.camps.away.cadresAttendus } : null;
      return { r, base: { lambda, cadres, cartons: c?.m ? { dom: c.m.dom, ext: c.m.ext } : null }, cartons: { statut: c?.statut ?? null, releve: Boolean(c?.releve) }, dernieres: { home: accJ.derniereFeuille(r.home), away: accJ.derniereFeuille(r.away) } };
    });
    // La nuit (lot 1b) relève ici ce que la passe SAVAIT avant la journée (le contrôle anti-fuite) ; `fuite` (essais
    // seulement) le relève APRÈS la publication — l'écart que le contrôle doit voir.
    if (avantDePublier && !fuite) avantDePublier(jour, duJour, accJ);
    for (const r of duJour) accJ.ajouter(r);
    const entrees = accJ.finDeJournee();
    if (avantDePublier && fuite) avantDePublier(jour, duJour, accJ);
    for (const o of observations) {
      o.entrees = entrees.get(o.r.matchKey);
      surObservation(o);
    }
    // 3. Les forces de la journée, publiées.
    for (const r of duJour) {
      const f = faitsDeLaRencontre(r.fait);
      if (f) accF.ajouter(f.dom, f.ext);
    }
    accF.finDeJournee();
    lues += duJour.length;
    duJour = [];
  };
  for (const r of rencontresChronologiques({ database, jusqua: periodes.dernierJourLu, parFusion })) {
    if (jour !== null && r.date < jour) throw new Error(`passe des joueurs : rencontres dans le désordre (${r.date} après ${jour})`);
    if (jour !== null && r.date !== jour) publier();
    jour = r.date;
    duJour.push(r);
  }
  publier();
  if (!itC.next().done) throw new Error('passe des joueurs : le flux des cartons a des rencontres de plus');
  durees.passe = Math.round(performance.now() - t);
  return { lues, durees, cartons: { relues: cartons.relues, mode: cartons.mode }, accumulateurs: { accC, accF, accJ }, parFusion };
}

/** LES COMPTES (avant le regard) : aucune perte, aucun attendu, aucune part de joueur. */
export function compterLesJoueurs({ database, periodes = PERIODES_DU_BANC }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const compteur = compteurDesJoueurs({ periodes });
  let n = 0;
  const passe = passeDesJoueurs({
    database,
    periodes,
    surObservation: (o) => {
      // Les entrées des compositions ne sont pas lues : seules les PRÉSENCES de la base comptent (aucune part de joueur).
      compteur.ajouter({ r: o.r, base: { lambda: Boolean(o.base.lambda), cadres: Boolean(o.base.cadres), cartons: Boolean(o.base.cartons) }, dernieres: o.dernieres });
      if (++n % 5000 === 0) rssMax = Math.max(rssMax, process.memoryUsage.rss());
    }
  });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t = performance.now();
  const comptes = compteur.fin();
  return {
    aucunAttenduNiPerte: true,
    dernierJourLu: periodes.dernierJourLu,
    lues: passe.lues,
    cartons: passe.cartons,
    comptes,
    durees: { ...passe.durees, comptes: Math.round(performance.now() - t), total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: Math.max(rssMax, process.memoryUsage.rss()) }
  };
}

/** LE PASSAGE UNIQUE DU BANC : les données, les verdicts, les valeurs finales, les horizons des variantes utiles. */
export function passerLeBanc({ database, periodes = PERIODES_DU_BANC, K, tirages, graine, minBlocs }) {
  const t0 = performance.now();
  let rssMax = process.memoryUsage.rss();
  const D = new DonneesDuBanc({ camps: 1 << 17, lignes: 1 << 20 });
  const passe = passeDesJoueurs({ database, periodes, surObservation: (o) => D.ajouterLObservation(o, { periodes }) });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t2 = performance.now();
  const banc = jugerLesVariantes(D, { periodes, K, ...(tirages ? { tirages } : {}), ...(graine ? { graine } : {}), ...(minBlocs ? { minBlocs } : {}) });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  const t3 = performance.now();
  const final = valeursFinales(D);
  // L'horizon de chaque variante utile, au rythme mesuré des matchs jugés de la fenêtre la plus récente (B).
  const B = periodes.plis.find((p) => p.nom === 'B').juger;
  const joursB = Math.round((Date.parse(`${B.a}T00:00:00Z`) - Date.parse(`${B.de}T00:00:00Z`)) / JOUR_MS) + 1;
  const horizons = {};
  for (const v of banc.variantes) if (v.utile) horizons[v.id] = horizonDeLaPreuve({ nBanc: v.matchsJuges, zBanc: v.zObserve, K: banc.K, parJour: (v.matchsJuges * (D.campsDu('B').length / Math.max(1, D.nCamps))) / joursB });
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  return {
    comptesDuPassage: { lues: passe.lues, miseEnRoute: D.miseEnRoute, camps: banc.camps, cartons: passe.cartons },
    banc,
    final,
    horizons,
    durees: { ...passe.durees, juge: Math.round(t3 - t2), final: Math.round(performance.now() - t3), total: Math.round(performance.now() - t0) },
    aPart: { pid: process.pid, rssMaxOctets: rssMax }
  };
}

// ------------------------------------------------------------ la nuit (étape 34, lot 1b)

const LIGNES_PAR_MORCEAU = 500;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const HEURES_MS = 3_600_000;

/** Une fiche rangée (joueurs_fiches) depuis l'état d'un joueur de l'accumulateur. */
function ficheDuJoueur(id, j, calculeLe) {
  return {
    joueur: id,
    club: j.club ?? null,
    poste: posteDominant(j.postes) || null,
    derniere: j.derniere,
    apparitions: j.n,
    np_x: j.X[0], np_e: j.E[0], pen_x: j.X[1], pen_e: j.E[1], sot_x: j.X[2], sot_e: j.E[2], av_x: j.X[3], av_e: j.E[3], xa_x: j.X[4], xa_e: j.E[4],
    pen_club: j.penClub ?? null,
    tit_min: j.tit[0], tit_n: j.tit[1], entre_min: j.entre[0], entre_n: j.entre[1], banc_n: j.banc[0], banc_entrees: j.banc[1],
    calcule_le: calculeLe,
    version: VERSION_JOUEURS
  };
}

/** Les repères au jour de la nuit (joueurs_etat « reperes ») : global et minutes par poste (0 à 5), rapports des compétitions, chance d'entrer. */
export function reperesAuJour(accJ, jourD) {
  const reperes = { jourD, global: {}, minutes: {}, ligues: {}, entree: accJ.chanceDEntrerMoyenne(jourD) };
  for (const p of [0, 1, 2, 3, 4, 5]) {
    reperes.global[p] = accJ.repereGlobal(p, jourD);
    reperes.minutes[p] = accJ.minutesMoyennes(p, jourD);
  }
  for (const league of [...accJ.ligues.keys()].sort()) {
    reperes.ligues[league] = {};
    for (const p of [0, 1, 2, 3, 4, 5]) reperes.ligues[league][p] = accJ.rapportDeLaLigue(league, p, jourD);
  }
  return reperes;
}

/** Les tirs cadrés attendus (S brut) d'un match à venir : statExpectations du moteur sur ses moyennes des 10 derniers matchs relevés (statInputsRead). */
function cadresAttendusAVenir(database, home, away, date, cache = new Map()) {
  // Les moyennes d'un club ne dépendent pas du jour d'un match À VENIR (aucun match joué entre la veille de la nuit et lui) :
  // lues une fois par club et par nuit (mesuré dans le bac : 83 s pour 1 198 matchs sans ce cache).
  const de = (club) => {
    if (!cache.has(club)) cache.set(club, moyennesEquipe(`fotmob-${club}`, date, database)?.shotsOnTarget ?? null);
    return cache.get(club);
  };
  const h = de(home);
  const a = de(away);
  if (!h || !a) return null;
  const s = statExpectations({ statInputs: { home: { shotsOnTarget: h }, away: { shotsOnTarget: a } } });
  return s?.shotsOnTarget ? { home: s.shotsOnTarget.home, away: s.shotsOnTarget.away } : null;
}

/**
 * LA NUIT DES JOUEURS (le mode « nuit » de l'enfant ; aussi appelable ici pour les essais, sur une copie) : la passe
 * chronologique de tout le magasin jusqu'à la veille du jour de la nuit (la même que le banc), avec le relevé des couples
 * du contrôle AVANT la publication de leur journée ; puis
 *   - LES FICHES des joueurs apparus dans les 540 derniers jours (joueurs_fiches) et LES REPÈRES du jour (joueurs_etat) ;
 *   - LES MATCHS À VENIR du calendrier (J à J + 18, annuaire strict ; un match sans ses deux identifiants est compté, ses
 *     noms dits) : leur base BRUTE (λ du modèle de buts sans cote, S du moteur, C de la 33), leur dernière feuille ;
 *   - L'ARCHIVE D'AVANT-MATCH des matchs des 36 prochaines heures : « derniere-alignee » (absents annoncés retirés, chiffres
 *     « s'il joue »), et « publiee » si une compo est déjà lue avant le coup d'envoi ; un match sans heure sûre n'est
 *     archivé que la veille ; jamais après le coup d'envoi ;
 *   - LE CONTRÔLE anti-fuite (controleDesJoueurs.js).
 * `envoyer(type, lignes)` reçoit les morceaux (fiches, matchs, archive) ; rend la fin (repères, contrôle, bilan).
 */
export function calculerLaNuitDesJoueurs({ database, instant, jourD, graine = null, couples: nombreDeCouples = NUIT.couples, fuite = false, note = JOUEURS_AU_BANC, envoyer = () => {}, clubDe = null, fichierCalendrier = undefined }) {
  const t0 = performance.now();
  const durees = {};
  let rssMax = process.memoryUsage.rss();
  const mesurer = (nom, debut) => {
    durees[nom] = Math.round(performance.now() - debut);
    rssMax = Math.max(rssMax, process.memoryUsage.rss());
  };
  const parMorceaux = (type, lignes) => {
    for (let i = 0; i < lignes.length; i += LIGNES_PAR_MORCEAU) envoyer(type, lignes.slice(i, i + LIGNES_PAR_MORCEAU));
  };
  const calculeLe = new Date(instant).toISOString();
  const veille = plusJours(jourD, -1);

  // 1. La passe (cartons, forces, joueurs), jusqu'à la veille, avec le relevé des couples du contrôle.
  let t = performance.now();
  const parFusion = fusions(database);
  const couples = tirerLesCouples({ database, jourD, graine, nombre: nombreDeCouples, parFusion });
  const parJour = new Map();
  for (const c of couples) parJour.set(c.J, [...(parJour.get(c.J) ?? []), c]);
  const instantanes = [];
  const passe = passeDesJoueurs({
    database,
    periodes: { ...PERIODES_DU_BANC, dernierJourLu: veille },
    surObservation: () => {},
    fuite,
    avantDePublier: (jour, _duJour, accJ) => {
      for (const c of parJour.get(jour) ?? []) instantanes.push({ couple: c, passe: instantaneDeLaPasse(accJ, c) });
    }
  });
  const { accC, accF, accJ } = passe.accumulateurs;
  mesurer('passe', t);

  // 2. Les repères et les fiches du jour.
  t = performance.now();
  const reperes = reperesAuJour(accJ, jourD);
  const limite = plusJours(jourD, -NUIT.fichesJours);
  const fiches = [];
  for (const [id, j] of accJ.joueurs) if (j.derniere && j.derniere >= limite) fiches.push(ficheDuJoueur(id, j, calculeLe));
  fiches.sort((a, b) => a.joueur - b.joueur);
  parMorceaux('fiches', fiches);
  const ficheDe = new Map(fiches.map((f) => [f.joueur, f]));
  mesurer('fiches', t);

  // 3. Les matchs à venir, leur base et leur dernière feuille ; l'archive des 36 prochaines heures.
  t = performance.now();
  const liste = executerSansPause(listeDuCalendrier({ database, jourD, ...(clubDe ? { clubDe } : {}), ...(fichierCalendrier ? { fichierCalendrier } : {}) }));
  const fin = plusJours(jourD, NUIT.calendrierJours);
  const items = liste.items.filter((x) => x.statut === 'scheduled' && x.date >= jourD && x.date <= fin).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.home - b.home || a.away - b.away));
  const p = parametresDeLEcran(note);
  const matchs = [];
  const archive = [];
  const bilanArchive = { derniereAlignee: 0, publiee: 0, sansHeureSure: 0, sansNote: p ? 0 : 1, sansBase: 0 };
  const demain = plusJours(jourD, 1);
  const cacheDesCadres = new Map();
  for (const it of items) {
    const rencontre = `${it.date}|${it.home}|${it.away}`;
    let lambda = null;
    try {
      const s = modeleDeButs({
        fair: null,
        entrees: { forces: { home: accF.etat(EMPREINTE_DE_LA_BASE, it.home), away: accF.etat(EMPREINTE_DE_LA_BASE, it.away) }, ligue: accF.moyennes(it.league, it.date, saisonEnNombre(seasonOf(it.league, it.date))), plusMoins: null },
        reglages: BASE_STATISTIQUE
      }).parties.statistiques;
      if (fini(s?.lambda) && fini(s?.mu)) lambda = { dom: s.lambda, ext: s.mu };
    } catch {
      lambda = null;
    }
    let S = null;
    try {
      S = cadresAttendusAVenir(database, it.home, it.away, it.date, cacheDesCadres);
    } catch {
      S = null;
    }
    const m = accC.ligue(it.league, it.date);
    const C = m && fini(m.dom) && fini(m.ext) ? { dom: m.dom, ext: m.ext } : null;
    const dh = accJ.derniereFeuille(it.home);
    const da = accJ.derniereFeuille(it.away);
    const compo = compoPubliee(database, { home: it.home, away: it.away, date: it.date, parFusion });
    const abs = absentsAnnonces(database, { home: it.home, away: it.away, date: it.date, parFusion });
    const ko = coupDEnvoiSur(database, { home: it.home, away: it.away, date: it.date, compo, absents: abs });
    const dernieres = { home: dh ? { cle: dh.cle, date: dh.date, cote: dh.cote } : null, away: da ? { cle: da.cle, date: da.date, cote: da.cote } : null };
    matchs.push({
      rencontre,
      jour: it.date,
      kickoff: ko,
      league: it.league ?? null,
      home: it.home,
      away: it.away,
      lambda_dom: lambda?.dom ?? null,
      lambda_ext: lambda?.ext ?? null,
      cadres_dom: S?.home ?? null,
      cadres_ext: S?.away ?? null,
      cartes_dom: C?.dom ?? null,
      cartes_ext: C?.ext ?? null,
      sources: JSON.stringify({ noms: { home: it.homeName ?? null, away: it.awayName ?? null }, dernieres, kickoffConnu: Boolean(ko), fotmobId: compo?.fotmobId ?? abs?.fotmobId ?? null }),
      calcule_le: calculeLe,
      version: VERSION_JOUEURS
    });
    // L'archive : seulement avant le coup d'envoi, dans les 36 heures ; sans heure sûre, seulement la veille.
    const koMs = ko ? Date.parse(ko) : NaN;
    const dansLaFenetre = fini(koMs) ? instant < koMs && koMs - instant <= NUIT.archiveHeures * HEURES_MS : it.date === demain;
    if (!fini(koMs) && it.date === demain) bilanArchive.sansHeureSure += 1;
    if (!dansLaFenetre || !p) continue;
    const baseDe = (camp) => ({ lambdaS: camp === 'home' ? lambda?.dom : lambda?.ext, Sraw: camp === 'home' ? S?.home : S?.away, C: camp === 'home' ? C?.dom : C?.ext });
    const commune = { lambdaS: lambda, S, C, candidate27: cleDeLaCandidate({ home: it.home, away: it.away, date: it.date, kickoff: ko, fotmobId: compo?.fotmobId ?? abs?.fotmobId ?? null }), dernieres, note: { calculeLe: p.calculeLe, bras: p.bras, tireur: p.tireur }, fotmobId: compo?.fotmobId ?? abs?.fotmobId ?? null };
    // « derniere-alignee » : la dernière feuille de chaque club, les absents annoncés retirés.
    const retires = { home: [], away: [] };
    const lignes = [];
    const recalees = {};
    for (const camp of ['home', 'away']) {
      const d = camp === 'home' ? dh : da;
      const ids = new Set((abs?.[camp] ?? []).map((a) => a.id).filter(Boolean));
      const feuille = d ? feuilleDeLaDerniere(database, { cle: d.cle, cote: d.cote, parFusion }) : [];
      const gardes = feuille.filter((j) => !(j.id && ids.has(j.id)));
      retires[camp] = feuille.filter((j) => j.id && ids.has(j.id)).map((j) => j.id);
      if (!gardes.length) continue;
      const entrees = entreesDepuisLesFiches({ joueurs: gardes.map((j) => ({ id: j.id, poste: j.poste, titulaire: true })), fiches: ficheDe, reperes, league: it.league, club: camp === 'home' ? it.home : it.away });
      const c = chiffresDUnCamp({ entrees, base: baseDe(camp), dom: camp === 'home', p, etat: 'derniere-alignee' });
      recalees[camp] = c.base;
      for (const j of c.titulaires) lignes.push(ligneDArchive(camp === 'home' ? 'h' : 'a', j, true));
    }
    if (lignes.length) {
      archive.push({ rencontre, etat: 'derniere-alignee', kickoff: ko ?? it.date, compo_lue_le: null, ecrit_le: calculeLe, base: JSON.stringify({ ...commune, recalees, absentsRetires: retires, compo: { etat: 'derniere-alignee' } }), joueurs: JSON.stringify(lignes), version: VERSION_JOUEURS });
      bilanArchive.derniereAlignee += 1;
    }
    // « publiee » : une compo déjà lue avant le coup d'envoi (heure sûre seulement).
    if (compo && fini(koMs) && Date.parse(compo.lueLe) < koMs) {
      const lp = [];
      const rp = {};
      for (const camp of ['home', 'away']) {
        const cote = compo[camp];
        const joueurs = [...cote.titulaires, ...cote.remplacants].map((j) => ({ id: j.id, poste: j.poste, titulaire: j.titulaire }));
        if (!cote.titulaires.length) continue;
        const entrees = entreesDepuisLesFiches({ joueurs, fiches: ficheDe, reperes, league: it.league, club: camp === 'home' ? it.home : it.away });
        const c = chiffresDUnCamp({ entrees, base: baseDe(camp), dom: camp === 'home', p, etat: 'publiee' });
        rp[camp] = c.base;
        for (const j of c.titulaires) lp.push(ligneDArchive(camp === 'home' ? 'h' : 'a', j, true));
        for (const j of c.remplacants) lp.push(ligneDArchive(camp === 'home' ? 'h' : 'a', j, false));
      }
      if (lp.length) {
        archive.push({ rencontre, etat: 'publiee', kickoff: ko, compo_lue_le: compo.lueLe, ecrit_le: calculeLe, base: JSON.stringify({ ...commune, recalees: rp, absentsRetires: { home: [], away: [] }, compo: { etat: 'publiee', lueLe: compo.lueLe } }), joueurs: JSON.stringify(lp), version: VERSION_JOUEURS });
        bilanArchive.publiee += 1;
      }
    }
  }
  parMorceaux('matchs', matchs);
  parMorceaux('archive', archive);
  mesurer('matchs', t);

  // 4. Le contrôle anti-fuite (second chemin).
  t = performance.now();
  const controle = controlerLesInstantanes({ database, instantanes, parFusion });
  mesurer('controle', t);
  return {
    reperes,
    controle: { couples: couples.length, lignes: controle.lignes, ecarts: controle.ecarts },
    bilan: {
      lues: passe.lues,
      cartons: passe.cartons,
      fiches: fiches.length,
      matchs: matchs.length,
      avecBase: matchs.filter((x) => fini(x.lambda_dom)).length,
      sansIdentifiant: liste.sansIdentifiant.length,
      inconnus: liste.sansIdentifiant.slice(0, 20),
      archive: bilanArchive,
      dureeMs: Math.round(performance.now() - t0),
      durees: { ...passe.durees, ...durees },
      aPart: { pid: process.pid, rssMaxOctets: Math.max(rssMax, process.memoryUsage.rss()) }
    },
    calculeLe,
    jourD
  };
}

// ------------------------------------------------------------ le processus à part
if (process.argv.includes('--enfant-joueurs') && typeof process.send === 'function') {
  process.once('message', (m) => {
    try {
      const database = openDb({ file: m.chemin, readonly: true });
      let r;
      if (m.mode === 'comptes') r = compterLesJoueurs({ database, periodes: m.periodes ?? PERIODES_DU_BANC });
      else if (m.mode === 'banc') r = passerLeBanc({ database, periodes: m.periodes ?? PERIODES_DU_BANC, K: m.K, tirages: m.tirages, graine: m.graine, minBlocs: m.minBlocs });
      else if (m.mode === 'nuit') {
        // Étape 34, lot 1b : la nuit, par morceaux (fiches, matchs, archive), puis la fin.
        const fin = calculerLaNuitDesJoueurs({ ...m, database, envoyer: (type, lignes) => process.send({ morceau: { type, lignes } }) });
        process.send({ fin: true, mode: m.mode, ...fin }, () => process.exit(0));
        return;
      } else throw new Error(`mode inconnu « ${m?.mode ?? ''} »`);
      process.send({ fin: true, mode: m.mode, resultat: r }, () => process.exit(0));
    } catch (error) {
      process.send({ erreur: String(error?.stack ?? error?.message ?? error).slice(0, 4000), reporte: Boolean(error?.reporte) }, () => process.exit(0));
    }
  });
}
