/**
 * preuveDuContexte.js — LA PREUVE APRÈS LANCEMENT du contexte du match (étape 32 du plan, partie C2, 02/11/2026).
 * -----------------------------------------------------------------------
 * Le banc (partie B, UN seul regard, noteDuContexte.js) a retenu trois facteurs : repos court, enchaînement serré,
 * altitude. Ce module dit s'ils tiennent sur VOS matchs, joués APRÈS le lancement de l'étape (registre de la mesure),
 * avec ce que l'appli savait AVANT le coup d'envoi — patron de la preuve des étapes 27 et 28, simplifié par la décision 10
 * de l'orchestrateur (29/10/2026) : AUCUN chiffre provisoire jugé chaque nuit ; le jugement PRINCIPAL une seule fois, à
 * l'horizon fixé d'avance ; la garde de sûreté une fois par mois.
 *
 *   LES LIGNES, FIGÉES AVANT LE COUP D'ENVOI (lireLesMatchsDeLaPreuve, basesDesMatchs, lignesDeLaPreuve — dans le
 *   processus à part de la nuit, base en lecture seule) : chaque match JOUÉ après le jour du lancement et avant le jour
 *   de la nuit, dont la fiche a été GELÉE par la nuit avant son coup d'envoi (`contexte_fiches`, rattachée à la rencontre
 *   par `match_key`) ; une fiche écrite après le coup d'envoi (`apres_coup_d_envoi = 1`), d'une autre version,
 *   illisible, un match attribué ou sans score à la 90e sont ÉCARTÉS et comptés. Les heures de repos et d'enchaînement
 *   sont refaites avec le coup d'envoi PRÉVU de la rencontre (il était connu avant : conception §2.1) ; le stade et la
 *   pelouse sont repris de l'avant-match FotMob s'il a été relevé STRICTEMENT avant le coup d'envoi (un stade qui n'est
 *   pas le stade habituel : pas d'altitude) — par json_extract de ces deux champs seulement, jamais rien d'autre de
 *   l'archive. La base : le modèle statistique des buts de la candidate de l'étape 27 (BASE_STATISTIQUE, régime sans
 *   cote) au jour J — les forces accumulées sur la table du jour J jusqu'à la veille, la même chaîne que le banc
 *   (AccumulateurDesForces, modeleDeButs) —, recalée comme au banc ; les multiplicateurs : les coefficients FIGÉS du banc.
 *   Une ligne par match concerné et par facteur : la perte log du SCORE EXACT de la base (a) et de la base × facteur (b).
 *
 *   LE CHOIX FIGÉ DES COEFFICIENTS (fixé le 02/11/2026 AVANT toute ligne de preuve calculée) : ceux du pli 1 du banc
 *   (appris sur 2025-07-01 → 2026-09-23, la période la plus récente) et son recalage, appris ensemble — PLI_DE_LA_PREUVE.
 *
 *   LES PREMIERS CHIFFRES (calculerLaPreuve → etatApresLaPreuve, `contexte_etat.preuve`) : des COMPTES seulement — matchs
 *   concernés depuis le lancement, jours écoulés, l'horizon et sa date au plus tôt. Aucun gain, aucun verdict, rien au
 *   registre (décision 10 : regarder chaque nuit et s'arrêter au premier « retenu » fabriquerait de fausses preuves).
 *
 *   LE JUGEMENT PRINCIPAL (une seule fois par facteur, à l'horizon) : autant de matchs concernés que le banc en a jugé
 *   pour ce facteur ET au moins 180 jours depuis le lancement ; jugerEtape (le juge de preuve de l'étape 16 : lignes
 *   après le jour du lancement, K = les variantes déclarées de l'étape 32, seuils par défaut) calculé dans le processus à
 *   part SANS enregistrer, puis RANGÉ au registre par le serveur (rangerLesPrincipaux), jamais à la place d'un autre :
 *   un facteur dont le principal est pris (état de la nuit ou registre, pour CE lancement) n'est plus jamais rejugé.
 *   « Pas prouvé » ne rétrograde pas ; « moins bon » le dément.
 *
 *   LA GARDE DU MOIS : le premier soir de chaque mois civil (Paris) où au moins un facteur a assez de matchs (200 blocs,
 *   le minimum du juge), le cumul des lignes depuis le lancement passe par comparer avec 12 variantes (z ≈ 2,87 : douze
 *   regards par an) ; arrêtée après 12 regards (critique, constat 21). « Moins bon » → le facteur est DÉMENTI
 *   (`contexte_etat.dementis`, lu par l'écran : « Explication seulement », démenti sur vos matchs depuis le …) et une
 *   alerte durable de l'étape (alerteDuContexte).
 *
 * Ni horloge (l'instant de la passe est reçu), ni hasard non semé, ni réseau ; aucune écriture de la base ici (le serveur
 * range, contexteNuit.js) ; le seul écrit est le registre de la mesure, par rangerLesPrincipaux, dans le serveur. Hors de
 * l'empreinte du moteur (data/contexte/), et aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { comparer, jugerEtape } from '../../bench/guard.js';
import { lancementDe, jugementsDe, enregistrerJugement } from '../../bench/trialsRegistry.js';
import { AccumulateurDesForces } from '../db/forcesButs.js';
import { modeleDeButs, faitsDeLaRencontre, saisonEnNombre, empreinteDesForces } from '../../core/engine/goalModel.js';
import { VERSION_CONTEXTE, GARDE_MENSUELLE, JUGE_DU_BANC } from './reglagesContexte.js';
import { memeStade, pelouseDe, texteStable, joursEntre, numeroDuClub } from './formulesDuContexte.js';
import { butsA90DeLaLigne } from './lectureDuMagasin.js';
import { avecLeCoupDEnvoi } from './contexteRead.js';
import { CONTEXTE_AU_BANC } from './noteDuContexte.js';
import { BASE_STATISTIQUE, EMPREINTE_DE_LA_BASE, FORMES, caracteristiquesDeLaFiche, multiplicateurs, lignesDuJuge } from './bancDuContexte.js';

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const iso = (t) => new Date(t).toISOString();
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
/** Gèle un objet et tout ce qu'il contient. */
const gele = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) gele(v);
  }
  return o;
};

/** L'étape jugée (registre de la mesure). */
export const ETAPE_DE_LA_PREUVE = '32';
/** La mesure du juge de preuve (metrics.js) : la perte log, plus petite = mieux, en part de celle de la base. */
export const MESURE_DE_LA_PREUVE = 'perte-log';
/** Le pli du banc dont les coefficients et le recalage sont repris tels quels (le plus récent : 2025-07-01 → 2026-09-23). */
export const PLI_DE_LA_PREUVE = 1;
/** L'horizon du principal : au moins 180 jours depuis le lancement (et autant de matchs concernés que le banc en a jugé). */
export const HORIZON_DE_LA_PREUVE = Object.freeze({ minJours: 180 });
/** Les formes que la preuve sait refaire (celles des facteurs retenus) ; une autre (distance, arbitre) serait dite et sautée. */
export const FORMES_DE_LA_PREUVE = Object.freeze(['camp', 'lieu']);
/** Les noms des facteurs dans les phrases. */
export const NOMS_DES_FACTEURS = Object.freeze({ repos: 'repos court', enchainement: 'enchaînement serré', altitude: 'altitude', deplacement: 'distance', pelouse: 'pelouse synthétique', arbitre: 'arbitre', entraineur: 'nouvel entraîneur' });

/** Le `quoi` du jugement principal d'une variante (distinct par variante : un principal par facteur). */
export const quoiDuPrincipal = (id) => `Contexte du match, ${id} : la perte du score exact sur vos matchs, statistiques seules face à statistiques × facteur (jugement principal, à l’horizon)`;

// ======================================================= les facteurs à prouver (ce que le banc a retenu)

/**
 * LES VARIANTES À PROUVER : les variantes UTILES du banc (jamais le faux facteur ; aucune si le banc est faux), chacune
 * avec sa forme, son vecteur de coefficients (ceux du pli PLI_DE_LA_PREUVE, dans l'ordre de FORMES), le recalage de ce
 * pli et son horizon (les matchs concernés jugés au banc, 180 jours). Pure. Rend [{ id, facteur, sorte, forme, vecteur,
 * recalage, horizon: { matchs, jours } }] (gelé) ; `sautees` dit une forme que la preuve ne sait pas refaire.
 */
export function variantesDeLaPreuve(note = CONTEXTE_AU_BANC) {
  if (!note || typeof note !== 'object' || note.bancFaux !== false) return gele([]);
  const recalage = note.base?.recalages?.[PLI_DE_LA_PREUVE] ?? null;
  if (!recalage || !fini(recalage.cDom) || !fini(recalage.cExt)) return gele([]);
  const out = [];
  for (const id of note.utiles ?? []) {
    if (id === 'placebo') continue;
    const v = (note.variantes ?? []).find((x) => x.id === id);
    const forme = FORMES[id];
    if (!v || v.utile !== true || !forme || !FORMES_DE_LA_PREUVE.includes(forme.sorte)) continue;
    const c = (v.coefficients ?? []).find((x) => x.pli === PLI_DE_LA_PREUVE);
    const vecteur = forme.coefficients.map((nom) => c?.[nom]);
    if (!vecteur.every(fini)) continue;
    out.push({ id, facteur: forme.facteur, sorte: forme.sorte, forme, vecteur, recalage: { cDom: recalage.cDom, cExt: recalage.cExt }, horizon: { matchs: v.matchsConcernes, jours: HORIZON_DE_LA_PREUVE.minJours } });
  }
  return gele(out);
}

// ======================================================= les lignes (le processus à part, base en lecture seule)

/**
 * Ce que la preuve lit d'une fiche gelée : celles du banc (caracteristiquesDeLaFiche), puis le stade et la pelouse de
 * l'avant-match FotMob s'il existe (`avantMatch` : { stade, surface }, relevé avant le coup d'envoi) — un stade qui
 * n'est pas le stade habituel de la fiche : ni altitude ni distance (la règle de la fiche, contexteAuJourJ). Pure.
 */
export function caracteristiquesDeLaPreuve(fiche, { matchKey, avantMatch = null }) {
  const x = caracteristiquesDeLaFiche(fiche, { matchKey });
  const stade = texteStable(avantMatch?.stade);
  if (stade) {
    const habituel = fiche?.deplacement?.stadeHabituel === false ? null : fiche?.deplacement?.stade ?? null;
    if (memeStade(stade, habituel) === false) {
      x.altitude = 0;
      x.lnKm = null;
      x.ailleurs = true;
    }
  }
  const surface = pelouseDe(avantMatch?.surface);
  if (surface) x.synthetique = surface === 'synthetique' ? 1 : 0;
  return x;
}

/**
 * Les fiches gelées des matchs JOUÉS de `depuis` (exclu : le jour du lancement) à `avant` (exclu : le jour de la nuit),
 * avec la ligne du camp qui reçoit (attribué, buts à la 90e), le coup d'envoi prévu (le cache de la nuit, sinon
 * l'avant-match) et, de l'archive d'avant-match, son heure de relevé, son coup d'envoi, son stade et sa pelouse — rien
 * d'autre.
 */
export const SQL_DE_LA_PREUVE = `SELECT f.id AS fiche_id, f.date AS fiche_date, f.home_id, f.away_id, f.version, f.apres_coup_d_envoi, f.calcule_le, f.facteurs,
  d.match_key, d.fotmob_id, d.date, d.league, d.saison, d.home, d.away,
  t.attribue, t.prolongation, t.bp, t.bc, t.bp90, t.bc90,
  c.kickoff AS kickoff_cache, a.kickoff AS am_kickoff, a.releve_le AS am_releve_le,
  json_extract(a.avant_match, '$.stadium') AS am_stade, json_extract(a.avant_match, '$.surface') AS am_surface
  FROM contexte_fiches f
  JOIN day_matches d ON d.match_key = f.match_key
  JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  LEFT JOIN contexte_rencontres c ON c.match_key = d.match_key
  LEFT JOIN contexte_avant_match a ON a.fotmob_id = d.fotmob_id
  WHERE f.match_key IS NOT NULL AND d.date > ? AND d.date < ?
  ORDER BY d.date, d.match_key, f.id`;

const instantValide = (x) => (typeof x === 'string' && fini(Date.parse(x)) ? Date.parse(x) : null);

/**
 * LES MATCHS DE LA PREUVE (lecture seule) : une fiche par rencontre (la date exacte d'abord, sinon la plus récente) ;
 * écartés et comptés : fiche après le coup d'envoi, d'une autre version, illisible, camps inversés, match attribué,
 * sans score à la 90e ; l'avant-match n'est repris que relevé STRICTEMENT avant son coup d'envoi (sinon compté et
 * ignoré). Rend { matchs: [{ cle, date, league, saison, home, away, buts, kickoff, fiche, avantMatch, x }], comptes }.
 */
export function lireLesMatchsDeLaPreuve(database, { depuis, avant }) {
  const comptes = { fichesLues: 0, doublons: 0, apresCoupDEnvoi: 0, autreVersion: 0, illisibles: 0, campsInverses: 0, attribues: 0, sansScore90: 0, heuresRefaites: 0, avantMatch: { repris: 0, apresLeCoupDEnvoi: 0 }, matchs: 0 };
  const parMatch = new Map();
  for (const l of database.prepare(SQL_DE_LA_PREUVE).iterate(depuis, avant)) {
    comptes.fichesLues++;
    const deja = parMatch.get(l.match_key);
    if (deja) {
      comptes.doublons++;
      const exacte = (r) => r.fiche_date === r.date;
      if (exacte(deja) || (!exacte(l) && deja.calcule_le >= l.calcule_le)) continue;
    }
    parMatch.set(l.match_key, { ...l });
  }
  const matchs = [];
  for (const l of parMatch.values()) {
    if (Number(l.apres_coup_d_envoi) === 1) {
      comptes.apresCoupDEnvoi++;
      continue;
    }
    if (Number(l.version) !== VERSION_CONTEXTE) {
      comptes.autreVersion++;
      continue;
    }
    if (numeroDuClub(l.home) !== numeroDuClub(l.home_id) || numeroDuClub(l.away) !== numeroDuClub(l.away_id)) {
      comptes.campsInverses++;
      continue;
    }
    if (Number(l.attribue)) {
      comptes.attribues++;
      continue;
    }
    const buts = butsA90DeLaLigne(l);
    if (!buts) {
      comptes.sansScore90++;
      continue;
    }
    let fiche;
    try {
      fiche = JSON.parse(l.facteurs);
    } catch {
      fiche = null;
    }
    if (!fiche || typeof fiche !== 'object' || !fiche.repos || !fiche.enchainement) {
      comptes.illisibles++;
      continue;
    }
    // Le coup d'envoi prévu de la rencontre (connu avant elle) : les heures de la fiche refaites avec lui.
    const kickoff = [l.kickoff_cache, l.am_kickoff].map(instantValide).find((t) => t !== null) ?? null;
    if (kickoff !== null && fiche.heureInconnue !== false) {
      fiche = avecLeCoupDEnvoi(fiche, { date: l.date, kickoff: iso(kickoff) });
      comptes.heuresRefaites++;
    }
    // L'avant-match FotMob : seulement relevé STRICTEMENT avant son coup d'envoi.
    let avantMatch = null;
    if (l.am_releve_le !== null && l.am_releve_le !== undefined) {
      const releve = instantValide(l.am_releve_le);
      const ko = instantValide(l.am_kickoff);
      if (releve !== null && ko !== null && releve < ko) {
        avantMatch = { stade: texteStable(l.am_stade), surface: texteStable(l.am_surface), releveLe: iso(releve) };
        comptes.avantMatch.repris++;
      } else {
        comptes.avantMatch.apresLeCoupDEnvoi++;
      }
    }
    matchs.push({ cle: l.match_key, date: l.date, league: l.league, saison: l.saison, home: Number(l.home), away: Number(l.away), buts, kickoff: kickoff === null ? null : iso(kickoff), fiche, avantMatch, x: caracteristiquesDeLaPreuve(fiche, { matchKey: l.match_key, avantMatch }) });
  }
  matchs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
  comptes.matchs = matchs.length;
  return { matchs, comptes };
}

/** La table du jour J pour les forces : la ligne du camp qui reçoit, le championnat et la saison du registre (la lecture du banc). */
export const SQL_DES_FORCES = `SELECT d.match_key AS matchKey, d.date, d.league, d.saison, d.home, d.away,
  t.club, t.adversaire, t.camp, t.attribue, t.prolongation, t.compte, t.coupe, t.bp, t.bc, t.bp90, t.bc90, t.xg_p, t.xg_c
  FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  WHERE d.date <= ?
  ORDER BY d.date, d.match_key`;

/**
 * LA BASE AU JOUR J de chaque match (lecture seule) : les forces de la candidate de l'étape 27 (BASE_STATISTIQUE)
 * accumulées journée après journée sur la table du jour J jusqu'à `jusqua` (la veille de la nuit), publiées en fin de
 * journée ; AVANT la publication du jour d'un match, sa base (modeleDeButs, régime sans cote) : { lambda, mu } posée sur
 * `m.base`. La même chaîne que le banc (contexteBancEnfant.passeDuBanc). Rend le nombre de bases posées.
 */
export function basesDesMatchs(database, matchs, { jusqua }) {
  if (empreinteDesForces(BASE_STATISTIQUE) !== EMPREINTE_DE_LA_BASE) throw new Error('preuve du contexte : l’empreinte des forces de la base a changé');
  const parJour = new Map();
  for (const m of matchs) {
    if (!parJour.has(m.date)) parJour.set(m.date, []);
    parJour.get(m.date).push(m);
  }
  const acc = new AccumulateurDesForces({ empreintes: [EMPREINTE_DE_LA_BASE] });
  let posees = 0;
  const poser = (jour) => {
    for (const m of parJour.get(jour) ?? []) {
      const s = modeleDeButs({
        fair: null,
        entrees: { forces: { home: acc.etat(EMPREINTE_DE_LA_BASE, m.home), away: acc.etat(EMPREINTE_DE_LA_BASE, m.away) }, ligue: acc.moyennes(m.league, jour, saisonEnNombre(m.saison)), plusMoins: null },
        reglages: BASE_STATISTIQUE
      }).parties.statistiques;
      m.base = { lambda: s.lambda, mu: s.mu };
      posees++;
    }
    parJour.delete(jour);
  };
  let jour = null;
  for (const l of database.prepare(SQL_DES_FORCES).iterate(jusqua)) {
    if (l.date !== jour) {
      if (jour !== null) acc.finDeJournee();
      jour = l.date;
      poser(jour);
    }
    const f = faitsDeLaRencontre(l);
    if (f) acc.ajouter(f.dom, f.ext);
  }
  if (jour !== null) acc.finDeJournee();
  return posees;
}

/**
 * LES LIGNES DE LA PREUVE (pures) : pour chaque variante, sur les matchs avec base, buts et caractéristiques, la base
 * recalée du pli de la preuve contre la base × les multiplicateurs figés — seulement les matchs CONCERNÉS ; une ligne
 * par match { bloc, date, a, b } (la perte du score exact, lignesDuJuge du banc). Rend { [id]: lignes }.
 */
export function lignesDeLaPreuve(matchs, variantes) {
  const out = {};
  for (const v of variantes) {
    out[v.id] = lignesDuJuge({ matchs, multiplicateurDe: (m) => multiplicateurs(v.forme, m.x, v.vecteur), recalage: v.recalage }).lignes;
  }
  return out;
}

// ======================================================= l'horizon, le principal, la garde (le processus à part)

/** L'horizon d'une variante : { atteint, matchs, attendus, jours, joursAttendus, auPlusTotLe } (`horizon` : celui d'un essai). */
export function horizonDe(variante, { matchs, lancementLe, jourD, horizon = null }) {
  const attendus = horizon?.matchs?.[variante.id] ?? variante.horizon.matchs;
  const joursAttendus = horizon?.jours ?? variante.horizon.jours;
  const jours = Math.max(0, joursEntre(lancementLe, jourD));
  return { atteint: matchs >= attendus && jours >= joursAttendus, matchs, attendus, jours, joursAttendus, auPlusTotLe: plusJours(lancementLe, joursAttendus) };
}

/** Les principaux d'un état rangé qui sont ceux de CE lancement. */
const principauxDuLancement = (principal, le) => Object.fromEntries(Object.entries(principal && typeof principal === 'object' ? principal : {}).filter(([, p]) => p?.lancement === le));

/**
 * LE CALCUL DE LA PREUVE d'une nuit (dans le processus à part ; aucune écriture) : les premiers chiffres (des comptes),
 * le jugement principal des variantes qui atteignent leur horizon et ne l'ont pas encore (état de la nuit ou registre,
 * pour CE lancement) — jugerEtape SANS enregistrer —, et la garde du mois si elle est due. `lignes` : { [id]: lignes } ;
 * `etat` : { principal, surete, dementis } rangés ; `dejaAuRegistre` : les variantes dont le principal est au registre.
 * Rend { lancement, parVariante, principaux: { [id]: jugement }, garde }.
 */
export function calculerLaPreuve({ lignes, variantes, lancement, jourD, instant, etat = null, dejaAuRegistre = [], registre = {}, horizon = null }) {
  const le = lancement.le;
  const apres = (L) => (L ?? []).filter((l) => l.date > le);
  const pris = new Set([...Object.keys(principauxDuLancement(etat?.principal, le)), ...dejaAuRegistre]);
  const dementis = etat?.dementis && typeof etat.dementis === 'object' ? etat.dementis : {};
  const parVariante = [];
  const principaux = {};
  for (const v of variantes) {
    const h = horizonDe(v, { matchs: apres(lignes[v.id]).length, lancementLe: le, jourD, horizon });
    parVariante.push({ id: v.id, facteur: v.facteur, matchs: h.matchs, attendus: h.attendus, jours: h.jours, joursAttendus: h.joursAttendus, atteint: h.atteint, auPlusTotLe: h.auPlusTotLe, principalPris: pris.has(v.id), dementi: Boolean(dementis[v.id]) });
    // Jamais refait : un principal déjà pris pour ce lancement n'est plus jamais rejugé.
    if (pris.has(v.id)) continue;
    // Rien avant l'horizon.
    if (!h.atteint) continue;
    principaux[v.id] = jugerEtape({ etape: ETAPE_DE_LA_PREUVE, lignes: lignes[v.id] ?? [], mesure: MESURE_DE_LA_PREUVE, maintenant: instant, quoi: quoiDuPrincipal(v.id), principal: true, enregistrer: false, registre, tirages: JUGE_DU_BANC.tirages, graine: JUGE_DU_BANC.graine });
  }
  // La garde du mois : une fois par mois civil (Paris), 12 regards au plus, sur le cumul depuis le lancement.
  const mois = jourD.slice(0, 7);
  const surete = etat?.surete?.lancement === le ? etat.surete : null;
  const regards = surete?.regards ?? 0;
  const garde = { mois, faite: false, regard: false, regards, raison: null, resultats: {} };
  if (regards >= GARDE_MENSUELLE.regardsMax) garde.raison = `arrêtée après ${GARDE_MENSUELLE.regardsMax} regards`;
  else if (surete?.dernierMois === mois) garde.raison = 'déjà faite ce mois-ci';
  else {
    garde.faite = true;
    for (const v of variantes) {
      if (dementis[v.id]) {
        garde.resultats[v.id] = { verdict: null, deja: 'dementi' };
        continue;
      }
      const r = comparer(apres(lignes[v.id]), { mode: 'moyenne', sens: 'min', variantes: GARDE_MENSUELLE.variantes, tirages: JUGE_DU_BANC.tirages, graine: JUGE_DU_BANC.graine });
      garde.resultats[v.id] = { verdict: r.verdict, gain: r.gain, fourchette: r.fourchette, matchs: r.n.matchs, blocs: r.n.blocs, z: r.seuil.z, variantes: r.seuil.variantes, raison: r.raison };
    }
    // Un regard ne compte que si le juge a pu juger au moins un facteur (« pas assez de matchs » n'est pas un regard).
    garde.regard = Object.values(garde.resultats).some((r) => r.verdict && r.verdict !== 'pas-assez-de-matchs');
    if (!garde.regard) garde.raison = 'pas encore assez de matchs pour juger (200 au moins)';
  }
  return { lancement: { le, version: lancement.version ?? null }, parVariante, principaux, garde };
}

/**
 * LE CALCUL ENTIER, dans le processus à part (base en LECTURE SEULE) : les matchs de la preuve, leur base au jour J, les
 * lignes, puis calculerLaPreuve. `instant` et `jourD` : reçus de la passe ; `lancement` : { le, version } ; le reste :
 * reçu du serveur (demandeDeLaPreuve). Rend { comptes, ...calculerLaPreuve } — jamais les lignes elles-mêmes.
 */
export function preuveDansLaBase({ database, instant, jourD, lancement, etat = null, dejaAuRegistre = [], registre = {}, horizon = null, note = CONTEXTE_AU_BANC }) {
  const variantes = variantesDeLaPreuve(note);
  const { matchs, comptes } = lireLesMatchsDeLaPreuve(database, { depuis: lancement.le, avant: jourD });
  comptes.bases = matchs.length ? basesDesMatchs(database, matchs, { jusqua: plusJours(jourD, -1) }) : 0;
  const lignes = lignesDeLaPreuve(matchs, variantes);
  comptes.lignes = Object.fromEntries(Object.entries(lignes).map(([id, L]) => [id, L.length]));
  return { comptes, ...calculerLaPreuve({ lignes, variantes, lancement, jourD, instant, etat, dejaAuRegistre, registre, horizon }) };
}

// ======================================================= le serveur : la demande, le registre, l'état rangé

/** Ce que le registre et l'état disent d'un principal (sans les tirages). */
const resumeDuPrincipal = (j) => ({ le: j.le ?? null, quoi: j.quoi ?? null, verdict: j.verdict ?? null, gain: j.gain ?? null, fourchette: j.fourchette ?? null, enPourcent: j.enPourcent ?? null, matchs: j.n?.matchs ?? null, lancement: j.lancement ?? null, version: j.version ?? null, variantes: j.seuil?.variantes ?? null });

/**
 * LA DEMANDE de la nuit (le serveur, AVANT le processus à part) : les variantes à prouver, le lancement de l'étape 32 au
 * registre, les principaux déjà au registre pour ce lancement, et l'état rangé. Rien à demander (rend { rien }) : aucun
 * facteur retenu au banc, l'étape pas encore lancée, un registre illisible, ou tout est fait (chaque facteur a son
 * principal ou un démenti, et la garde est arrêtée). Rend { lancement, etat, dejaAuRegistre, jugementsDejaAuRegistre,
 * horizon } sinon.
 */
export function demandeDeLaPreuve({ instant, registre = {}, etat = null, horizon = null, note = CONTEXTE_AU_BANC }) {
  const variantes = variantesDeLaPreuve(note);
  if (!variantes.length) return { rien: 'aucun facteur retenu au banc : rien à confirmer ; les fiches sont gardées' };
  let lancement;
  let deja;
  try {
    lancement = lancementDe(ETAPE_DE_LA_PREUVE, { ...registre, maintenant: instant });
    if (!lancement?.le) return { rien: 'l’étape 32 n’est pas encore lancée au registre de la mesure (le premier démarrage du serveur avec ce code la date) : rien à juger' };
    const ids = new Map(variantes.map((v) => [quoiDuPrincipal(v.id), v.id]));
    deja = jugementsDe(ETAPE_DE_LA_PREUVE, { ...registre, maintenant: instant }).filter((j) => j.principal === true && j.lancement === lancement.le && ids.has(j.quoi)).map((j) => ({ id: ids.get(j.quoi), jugement: resumeDuPrincipal(j) }));
  } catch (error) {
    return { rien: `registre de la mesure illisible : ${String(error?.message ?? error).slice(0, 160)} — rien de jugé cette nuit` };
  }
  const e = { principal: etat?.principal ?? null, surete: etat?.surete ?? null, dementis: etat?.dementis ?? null };
  const pris = new Set([...Object.keys(principauxDuLancement(e.principal, lancement.le)), ...deja.map((d) => d.id)]);
  const dementis = e.dementis && typeof e.dementis === 'object' ? e.dementis : {};
  const gardeArretee = e.surete?.lancement === lancement.le && (e.surete.regards ?? 0) >= GARDE_MENSUELLE.regardsMax;
  if (gardeArretee && variantes.every((v) => pris.has(v.id) || dementis[v.id])) return { rien: 'preuve terminée : chaque facteur a son jugement principal (ou un démenti) et la garde du mois s’est arrêtée après 12 regards' };
  return { lancement: { le: lancement.le, version: lancement.version ?? null }, etat: e, dejaAuRegistre: deja.map((d) => d.id), jugementsDejaAuRegistre: deja, horizon: horizon ?? null };
}

/**
 * LE RANGEMENT DES PRINCIPAUX au registre de la mesure (le serveur, seul écrivain) : chacun n'est écrit que s'il est bien
 * un principal de CE lancement, avec son `quoi`, et qu'aucun principal de même `quoi` n'y est déjà — jamais à la place
 * d'un autre, jamais deux fois. Rend { enregistres: { [id]: jugement rangé }, refuses: [{ id, raison }] }.
 */
export function rangerLesPrincipaux({ principaux = {}, lancement, registre = {}, instant }) {
  const enregistres = {};
  const refuses = [];
  const ids = Object.keys(principaux);
  if (!ids.length) return { enregistres, refuses };
  const options = { ...registre, maintenant: instant };
  const deja = jugementsDe(ETAPE_DE_LA_PREUVE, options).filter((j) => j.principal === true && j.lancement === lancement.le);
  for (const id of ids) {
    const j = principaux[id];
    if (deja.some((x) => x.quoi === quoiDuPrincipal(id))) refuses.push({ id, raison: 'déjà au registre pour ce lancement' });
    else if (!j || j.principal !== true || j.quoi !== quoiDuPrincipal(id) || j.lancement !== lancement.le || j.etape !== ETAPE_DE_LA_PREUVE) refuses.push({ id, raison: 'pas un principal de ce lancement' });
    else enregistres[id] = enregistrerJugement(ETAPE_DE_LA_PREUVE, j, options);
  }
  return { enregistres, refuses };
}

/**
 * L'ÉTAT RANGÉ APRÈS LA NUIT (pur ; le serveur l'écrit dans `contexte_etat`) : `preuve` (les premiers chiffres — des
 * comptes, jamais un gain ni un verdict), `principal` (ceux de ce lancement : l'état d'avant, ceux du registre, ceux
 * rangés cette nuit), `surete` (la garde : regards, dernier mois, historique) et `dementis` (jamais retirés ; ajoutés
 * pour un « moins bon » de la garde ou du principal). Rend { preuve, principal, surete, dementis, nouveauxDementis }.
 */
export function etatApresLaPreuve({ etatAvant = null, calcul, enregistres = {}, dejaAuRegistre = [], lancement, instant, jourD }) {
  const le = lancement.le;
  const quand = iso(instant);
  const principal = principauxDuLancement(etatAvant?.principal, le);
  for (const d of dejaAuRegistre) if (!principal[d.id]) principal[d.id] = d.jugement;
  for (const [id, j] of Object.entries(enregistres)) principal[id] = resumeDuPrincipal(j);
  const dementis = { ...(etatAvant?.dementis && typeof etatAvant.dementis === 'object' ? etatAvant.dementis : {}) };
  const nouveauxDementis = [];
  const dementir = (id, valeur) => {
    if (dementis[id]) return;
    dementis[id] = valeur;
    nouveauxDementis.push(id);
  };
  for (const [id, j] of Object.entries(enregistres)) {
    if (j.verdict === 'moins-bon') dementir(id, { le: quand, depuis: le, source: 'principal', verdict: j.verdict, gain: j.gain ?? null, fourchette: j.fourchette ?? null, matchs: j.n?.matchs ?? null });
  }
  const g = calcul.garde ?? { faite: false, regard: false };
  const avant = etatAvant?.surete?.lancement === le ? etatAvant.surete : { lancement: le, regards: 0, dernierMois: null, historique: [] };
  let surete;
  if (g.regard) {
    const verdicts = Object.fromEntries(Object.entries(g.resultats).map(([id, r]) => [id, r.verdict ?? r.deja ?? null]));
    surete = { lancement: le, regards: (avant.regards ?? 0) + 1, regardsMax: GARDE_MENSUELLE.regardsMax, variantes: GARDE_MENSUELLE.variantes, dernierMois: g.mois, dernier: { le: quand, mois: g.mois, resultats: g.resultats }, historique: [...(avant.historique ?? []), { mois: g.mois, le: quand, verdicts }].slice(-GARDE_MENSUELLE.regardsMax) };
    for (const [id, r] of Object.entries(g.resultats)) {
      if (r.verdict === 'moins-bon') dementir(id, { le: quand, depuis: le, source: 'garde-du-mois', mois: g.mois, verdict: r.verdict, gain: r.gain ?? null, fourchette: r.fourchette ?? null, matchs: r.matchs ?? null, z: r.z ?? null, variantes: r.variantes ?? null });
    }
  } else {
    surete = { ...avant, regardsMax: GARDE_MENSUELLE.regardsMax, variantes: GARDE_MENSUELLE.variantes, essai: { le: quand, mois: g.mois ?? jourD.slice(0, 7), raison: g.raison ?? null } };
  }
  const preuve = {
    le: quand,
    jourD,
    lancement: le,
    version: lancement.version ?? null,
    variantes: (calcul.parVariante ?? []).map((v) => ({ ...v, principalPris: Boolean(principal[v.id]), dementi: Boolean(dementis[v.id]) })),
    comptes: calcul.comptes ?? null,
    garde: { regards: surete.regards ?? 0, regardsMax: GARDE_MENSUELLE.regardsMax, dernierMois: surete.dernierMois ?? null, faiteCetteNuit: Boolean(g.regard), raison: g.regard ? null : g.raison ?? null }
  };
  return { preuve, principal, surete, dementis, nouveauxDementis };
}

// ======================================================= les mots (l'étape de nuit) et l'alerte durable

const entier = (n) => (fini(Number(n)) ? Number(n).toLocaleString('fr-FR') : '?');
const jourDit = (j) => (typeof j === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j) ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : String(j ?? '?'));
const nomDe = (facteur, id) => NOMS_DES_FACTEURS[facteur] ?? id;
const VERDICTS_DITS = Object.freeze({ retenu: 'confirmé', 'pas-prouve': 'pas prouvé (le facteur garde son statut du banc)', 'moins-bon': 'moins bon : démenti', 'pas-assez-de-matchs': 'pas assez de matchs' });

/**
 * La phrase de la preuve pour le résumé de l'étape de nuit (`p` : le bloc `preuve` rendu par faireLeContexteDeLaNuit).
 * Toujours une phrase, jamais un silence.
 */
export function phraseDeLaPreuve(p) {
  if (!p) return 'Preuve sur vos matchs : pas calculée cette nuit.';
  if (p.rien) return `Preuve sur vos matchs : ${String(p.rien).replace(/\.$/, '')}.`;
  if (p.erreur) return `Preuve sur vos matchs : en échec (${String(p.erreur).replace(/\.$/, '')}) — rien de jugé ni de rangé cette nuit, les fiches restent.`;
  const e = p.etat ?? {};
  const vs = e.variantes ?? [];
  const morceaux = [];
  const enAttente = vs.filter((v) => !v.principalPris && !v.dementi);
  if (enAttente.length) {
    morceaux.push(
      `${enAttente.map((v) => `${nomDe(v.facteur, v.id)} ${entier(v.matchs)} ${v.matchs > 1 ? 'matchs concernés' : 'match concerné'} sur ${entier(v.attendus)}`).join(', ')}, ${entier(vs[0]?.jours ?? 0)} jour${(vs[0]?.jours ?? 0) > 1 ? 's' : ''} sur ${entier(vs[0]?.joursAttendus ?? 180)} depuis le ${jourDit(e.lancement)} — rien n’est jugé avant l’horizon (des comptes seulement)`
    );
  }
  const ranges = new Set(p.principauxRanges ?? []);
  for (const id of ranges) {
    const v = vs.find((x) => x.id === id);
    const j = p.principal?.[id];
    morceaux.push(`jugement principal pris cette nuit pour ${nomDe(v?.facteur, id)} : ${VERDICTS_DITS[j?.verdict] ?? j?.verdict ?? '?'} (${entier(j?.matchs)} matchs)`);
  }
  const anciens = vs.filter((v) => v.principalPris && !ranges.has(v.id));
  if (anciens.length) {
    morceaux.push(`jugement principal déjà pris (jamais refait) : ${anciens.map((v) => { const j = p.principal?.[v.id]; return `${nomDe(v.facteur, v.id)} ${VERDICTS_DITS[j?.verdict] ?? j?.verdict ?? '?'} le ${jourDit(String(j?.le ?? '').slice(0, 10))}`; }).join(', ')}`);
  }
  const g = e.garde ?? {};
  if (g.faiteCetteNuit) morceaux.push(`garde du mois faite (${entier(g.regards)} regard${g.regards > 1 ? 's' : ''} sur ${entier(g.regardsMax)})`);
  else if (g.raison) morceaux.push(`garde du mois : ${g.raison} (${entier(g.regards)} regard${g.regards > 1 ? 's' : ''} sur ${entier(g.regardsMax)})`);
  const dementis = Object.entries(p.dementis ?? {});
  if (dementis.length) morceaux.push(`DÉMENTI sur vos matchs : ${dementis.map(([id, d]) => `${nomDe(vs.find((x) => x.id === id)?.facteur ?? FORMES[id]?.facteur, id)} (depuis le ${jourDit(String(d?.le ?? '').slice(0, 10))})`).join(', ')} — repassé en « Explication seulement »`);
  return `Preuve sur vos matchs : ${morceaux.length ? morceaux.join(' ; ') : 'rien de neuf'}.`;
}

/**
 * LA VALEUR DE L'ALERTE DURABLE de l'étape (refresh-status.json → alerts.contexteDuMatch) : les écarts du contrôle
 * anti-fuite (la forme lue par ui/src/utils/controlesAntiFuite.js : { ecarts, total, lignes, updatedAt }) et, en plus,
 * les DÉMENTIS de la preuve (`dementis` : [{ variante, le, depuis, source }]) — gardés tant que l'état les porte, c'est-à-
 * dire toujours. null quand il n'y a ni écart ni démenti.
 */
export function alerteDuContexte({ ecarts = [], lignes = 0, dementis = null, updatedAt = null } = {}) {
  const d = dementis && typeof dementis === 'object' ? Object.entries(dementis).map(([variante, x]) => ({ variante, le: x?.le ?? null, depuis: x?.depuis ?? null, source: x?.source ?? null })) : [];
  if (!ecarts.length && !d.length) return null;
  return { ecarts: ecarts.slice(0, 20), total: ecarts.length, lignes, updatedAt, ...(d.length ? { dementis: d } : {}) };
}
