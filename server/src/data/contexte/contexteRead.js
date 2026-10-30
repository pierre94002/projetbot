/**
 * contexteRead.js — LA LECTURE DU CONTEXTE D'UN MATCH, pour la page du match (étape 32 du plan, partie D, 29/10/2026).
 * -----------------------------------------------------------------------
 * Ce que l'analyse d'un match reçoit APRÈS le moteur (analysis.controller.js, comme le bloc de la simulation de
 * l'étape 28) : le verdict n'en sait rien, l'IA ne le reçoit jamais (elle prend des champs nommés du moteur), et une
 * lecture qui échoue n'empêche jamais l'analyse. Les mots sont faits par l'écran (ui/src/utils/contexteDuMatch.js, pur).
 *
 * LECTURE SEULE, SANS CALCUL LOURD (aucune passe, aucun balayage) : la fiche de la nuit par (date, identifiants FotMob)
 * — la date exacte d'abord, puis la veille et le lendemain (un coup d'envoi tardif tombe un autre jour UTC) —, l'état
 * de la dernière nuit et les moyennes des championnats (`contexte_etat`, une clé chacune), la présence des deux clubs
 * dans la table des stades (venues.json, gardée en mémoire). Une fiche d'une date FUTURE que la dernière nuit n'a pas
 * réécrite est ORPHELINE (match reporté ou re-daté) : jamais lue — la règle `aLire` de l'étape 28 (critique, constat
 * 17). Les clubs par IDENTIFIANT FotMob seulement (`scoreInputs`, l'annuaire strict du magasin), jamais par un nom.
 *
 * Le coup d'envoi : la fiche de la nuit ne le connaît pas (le calendrier ne donne que le jour) ; quand l'analyse connaît
 * le VRAI coup d'envoi (une cote relevée ; jamais le midi UTC fictif d'un match du calendrier, reconnu à sa source et
 * non à son heure : critique, constat 16), les heures de repos et d'enchaînement sont refaites ici, en mémoire, avec
 * les formules de la fiche (formulesDuContexte.js).
 *
 * Le banc d'essai : la note recopiée par script (noteDuContexte.js), jamais retapée. Rien n'entre dans un pourcentage
 * (lot 1) : « Effet mesuré » veut dire « mesuré utile au banc, pas encore dans les chiffres ».
 * Hors de l'empreinte du moteur ; aucun fichier du moteur ne l'importe (test contexteFrontiere).
 * -----------------------------------------------------------------------
 */

import { VERSION_CONTEXTE, SEUILS, NUIT, DECISION_DE_PIERRE } from './reglagesContexte.js';
import { numeroDuClub, jourDe, coupDEnvoiConnu, heuresEntre, classeDeRepos, joursDeRepos, estSerre } from './formulesDuContexte.js';
import { CONTEXTE_AU_BANC } from './noteDuContexte.js';
import { lireStades } from '../reference/donneesDeReference.js';

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const deux = (x) => (fini(x) ? Math.round(x * 100) / 100 : null);
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
/** Le jour civil de Paris d'un instant (AAAA-MM-JJ) : celui d'une nuit (la même règle que contexteNuit.jourParis). */
export const jourParis = (t) => FORMAT_JOUR_PARIS.format(new Date(t));

/** Les neuf facteurs de l'encadré, dans l'ordre de l'écran. */
export const FACTEURS = Object.freeze(['repos', 'enchainement', 'deplacement', 'altitude', 'pelouse', 'meteo', 'arbitre', 'entraineur', 'enjeu']);

/** Les états de la lecture. */
export const ETATS_DU_CONTEXTE = Object.freeze(['pret', 'pas-encore-calcule', 'hors-fenetre', 'clubs-inconnus', 'illisible']);

/** L'instant de la lecture (ms) : `maintenant` (nombre, texte ISO, Date ou fonction), OBLIGATOIRE — jamais l'horloge lue ici. */
function instantDe(maintenant) {
  const v = typeof maintenant === 'function' ? maintenant() : maintenant;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!fini(t)) throw new Error('contexte du match : « maintenant » (l’heure de la lecture) est obligatoire.');
  return t;
}

/** Une valeur de `contexte_etat` (JSON) ; null si absente ; LÈVE si la base ne répond pas (l'appelant dit « illisible »). */
function valeurDeLEtat(database, cle) {
  const r = database.prepare('SELECT valeur FROM contexte_etat WHERE cle = ?').get(cle);
  if (!r) return null;
  try {
    return JSON.parse(r.valeur);
  } catch {
    return null;
  }
}

/**
 * Le VRAI coup d'envoi connu de l'analyse, ou null. Un match du calendrier (`hasOdds: false`, ou un identifiant « cal-… »)
 * porte un midi UTC FICTIF : il ne compte pas (seulement l'heure d'une cote relevée, `marketOdds.kickoff`).
 */
export function vraiCoupDEnvoi(match) {
  const valide = (x) => (typeof x === 'string' && fini(Date.parse(x)) ? new Date(Date.parse(x)).toISOString() : null);
  const duCalendrier = match?.hasOdds === false || String(match?.matchId ?? '').startsWith('cal-');
  if (duCalendrier) return valide(match?.marketOdds?.kickoff);
  return valide(match?.commenceTime);
}

/**
 * Une fiche rangée est-elle À LIRE ? Oui si la dernière nuit complète (ou celle en cours de rangement) l'a écrite, ou si
 * elle est FIGÉE pour cette nuit (son coup d'envoi passé ; sans heure, sa date au plus le jour de la nuit). Une fiche
 * d'une date future que la dernière nuit n'a pas réécrite est ORPHELINE : jamais lue.
 */
export function ficheALire(r, { nuit, enCours = null }) {
  if (!r) return false;
  const cles = [nuit?.calculeLe, enCours?.calculeLe].filter(Boolean);
  if (!cles.length) return false;
  if (cles.includes(r.calcule_le)) return true;
  if (!nuit?.calculeLe) return false;
  const ko = Date.parse(r.kickoff ?? '');
  if (Number(r.kickoff_connu) && fini(ko)) return ko <= Date.parse(nuit.calculeLe);
  return typeof r.date === 'string' && r.date <= (nuit.jourD ?? jourParis(Date.parse(nuit.calculeLe)));
}

/** La fiche à lire parmi les lignes de date, veille et lendemain : la date exacte d'abord, sinon la plus récente (calcule_le). */
export function choisirLaFiche(lignes, { date, nuit, enCours = null }) {
  const lisibles = (lignes ?? []).filter((r) => ficheALire(r, { nuit, enCours }));
  const exacte = lisibles.find((r) => r.date === date);
  if (exacte) return exacte;
  return lisibles.sort((a, b) => (a.calcule_le < b.calcule_le ? 1 : a.calcule_le > b.calcule_le ? -1 : 0))[0] ?? null;
}

/** Les mentions d'un repos refait (le même ordre que la fiche, contexteAuJourJ.repos), sans perdre celles qui ne dépendent pas de l'heure. */
function mentionsDuRepos(avant, { classe, heureInconnue, precedent }) {
  const garder = new Set(['prolongation', 'bresil-championnats-d-etat', 'prevu', 'joue-pas-encore-au-magasin', 'premier-match']);
  const restent = (avant ?? []).filter((m) => garder.has(m));
  const out = [];
  if (classe === 'court') out.push('court');
  if (restent.includes('prolongation') || precedent?.prolongation) out.push('prolongation');
  if (classe === 'long') out.push('long-competitions-non-suivies');
  if (restent.includes('bresil-championnats-d-etat')) out.push('bresil-championnats-d-etat');
  if (heureInconnue) out.push('heure-inconnue');
  for (const m of ['prevu', 'joue-pas-encore-au-magasin', 'premier-match']) if (restent.includes(m)) out.push(m);
  return out;
}

/**
 * Les heures de repos et d'enchaînement REFAITES avec le vrai coup d'envoi (en mémoire, les formules de la fiche). Rend
 * une copie des facteurs ; ceux qui ne dépendent pas de l'heure ne changent pas.
 */
export function avecLeCoupDEnvoi(facteurs, { date, kickoff, seuils = SEUILS }) {
  if (!facteurs || !kickoff) return facteurs;
  const J = { date, kickoff, kickoffConnu: true };
  const copie = JSON.parse(JSON.stringify(facteurs));
  for (const camp of ['home', 'away']) {
    const r = copie.repos?.[camp];
    if (r?.precedent) {
      const { heures, heureInconnue } = heuresEntre(r.precedent, J);
      const classe = classeDeRepos(heures, seuils);
      copie.repos[camp] = { ...r, heures: deux(heures), jours: joursDeRepos(heures), classe, heureInconnue, mentions: mentionsDuRepos(r.mentions, { classe, heureInconnue, precedent: r.precedent }) };
    }
    const e = copie.enchainement?.[camp];
    if (e?.prochain) {
      const { heures, heureInconnue } = heuresEntre(J, e.prochain);
      const serre = estSerre(heures, seuils);
      const mentions = [];
      if (serre) mentions.push('serre');
      if (heureInconnue) mentions.push('heure-inconnue');
      copie.enchainement[camp] = { ...e, heures: deux(heures), heureInconnue, serre, mentions };
    }
  }
  copie.heureInconnue = false;
  return copie;
}

/** Les statuts des neuf facteurs : ceux de la note du banc (null : « pas encore mesuré » partout), puis les démentis de vos matchs. */
export function statutsDesFacteurs(note = CONTEXTE_AU_BANC, dementis = null) {
  const out = {};
  for (const f of FACTEURS) {
    const s = note?.facteurs?.[f] ?? null;
    let statut = s?.statut ?? 'pas-encore-mesure';
    const d = (s?.variante && dementis?.[s.variante]) || dementis?.[f] || null;
    if (d && statut === 'effet-mesure') statut = 'dementi';
    out[f] = { statut, variante: s?.variante ?? null, ...(d ? { dementiLe: d.le ?? d.depuis ?? null } : {}) };
  }
  return out;
}

/** Ce que l'écran dit du banc : la note telle quelle, sans les chemins des fichiers ni leurs empreintes. */
export function bancPourLEcran(note = CONTEXTE_AU_BANC) {
  if (!note || typeof note !== 'object') return null;
  return {
    calculeLe: note.calculeLe ?? null,
    premierRegard: note.premierRegard ?? null,
    K: note.K ?? null,
    z: note.z ?? null,
    mesure: note.mesure ?? null,
    periodes: note.periodes ?? null,
    matchs: note.matchs ?? null,
    variantes: (note.variantes ?? []).map((v) => ({
      id: v.id,
      facteur: v.facteur,
      verdict: v.verdict,
      utile: v.utile === true,
      raisons: [...(v.raisons ?? [])],
      matchsJuges: v.matchsJuges ?? null,
      matchsConcernes: v.matchsConcernes ?? null,
      partConcernee: v.partConcernee ?? null,
      gainRelatif: v.gainRelatif ?? null,
      fourchetteRelative: Array.isArray(v.fourchetteRelative) ? [...v.fourchetteRelative] : null,
      ampleur: v.ampleur ? { ...v.ampleur } : null,
      coefficients: (v.coefficients ?? []).map((c) => ({ ...c }))
    })),
    placebo: note.placebo ? { ...note.placebo } : null,
    bancFaux: note.bancFaux === true,
    utiles: [...(note.utiles ?? [])],
    facteurs: note.facteurs ? JSON.parse(JSON.stringify(note.facteurs)) : null
  };
}

/** Les moyennes du championnat du match dans `contexte_etat.ligues` (la nuit), ou null. */
function moyennesDuChampionnat(ligues, league) {
  const l = league ? ligues?.ligues?.[league] ?? null : null;
  if (!l) return null;
  return {
    league,
    matchs: l.matchs ?? null,
    jaunesParMatch: fini(l.jaunesParMatch) ? l.jaunesParMatch : null,
    rougesParMatch: fini(l.rougesParMatch) ? l.rougesParMatch : null,
    fautesParMatch: fini(l.fautesParMatch) ? l.fautesParMatch : null,
    penaltiesParMatch: fini(l.penaltiesParMatch) ? l.penaltiesParMatch : null,
    butsParMatch: fini(l.butsParMatch) ? l.butsParMatch : null,
    matchsCartons: l.matchsCartons ?? null,
    matchsDeroule: l.matchsDeroule ?? null,
    calculeLe: ligues?.calculeLe ?? null
  };
}

/** La table des stades : sa date, et la présence de deux clubs (identifiants FotMob). */
function stadesDe(venues, home, away) {
  const clubs = venues?.clubs ?? null;
  const present = (id) => (id === null || !clubs ? null : Boolean(clubs[`fotmob-${id}`]));
  return { faitLe: typeof venues?.faitLe === 'string' ? venues.faitLe : null, home: present(home), away: present(away) };
}

/**
 * LE CONTEXTE D'UN MATCH (lecture seule, quelques lectures par clé). `match` : le match de l'analyse (identifiants par
 * `scoreInputs.home/away.teamId`, comme simulationDuMatch) ; `database` : la base (openDb) ; `maintenant` : l'instant de
 * la lecture (obligatoire) ; `note` : le banc (par défaut, la note recopiée) ; `lancement` : le lancement de l'étape 32
 * au registre (fonction ou objet ; son jour = le début de l'archive des avant-matchs) ; `venues` : la table des stades.
 * Rend { version, etat, raison, date, paraitLe, clubs, fiche, coupDEnvoi, nuit, ligue, stades, statuts, banc, dementis,
 * archiveDepuis, preuve, decision, seuils } — jamais une exception pour une base qui ne répond pas (« illisible »).
 */
export function contexteDuMatch({ match, database, maintenant, note = CONTEXTE_AU_BANC, lancement = null, venues = undefined }) {
  const instant = instantDe(maintenant);
  const home = numeroDuClub(match?.scoreInputs?.home?.teamId ?? match?.homeId ?? null);
  const away = numeroDuClub(match?.scoreInputs?.away?.teamId ?? match?.awayId ?? null);
  const date = jourDe(match?.commenceTime);
  const ko = vraiCoupDEnvoi(match);
  const statuts = statutsDesFacteurs(note, null);
  let archiveDepuis = null;
  try {
    const l = typeof lancement === 'function' ? lancement() : lancement;
    archiveDepuis = typeof l?.le === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l.le) ? l.le : null;
  } catch {
    archiveDepuis = null;
  }
  const table = venues === undefined ? lireStades() : venues;
  const base = {
    version: VERSION_CONTEXTE,
    etat: 'pret',
    raison: null,
    date,
    paraitLe: null,
    clubs: { home: { id: home, nom: match?.home ?? null }, away: { id: away, nom: match?.away ?? null } },
    fiche: null,
    coupDEnvoi: { iso: ko, connu: Boolean(ko), source: ko ? 'analyse' : null },
    nuit: null,
    ligue: null,
    stades: stadesDe(table, home, away),
    statuts,
    banc: bancPourLEcran(note),
    dementis: null,
    archiveDepuis,
    preuve: null,
    decision: DECISION_DE_PIERRE.contexteDansLesChiffres,
    seuils: { courtH: SEUILS.courtH, longH: SEUILS.longH, serreH: SEUILS.serreH, altitudeM: SEUILS.altitudeM, ecartAltitudeM: SEUILS.ecartAltitudeM, nouvelEntraineurMatchs: SEUILS.nouvelEntraineurMatchs, fenetreJours: NUIT.fenetreJours }
  };
  if (!date) return { ...base, etat: 'illisible', raison: 'date-du-match-illisible' };
  if (home === null || away === null) return { ...base, etat: 'clubs-inconnus', raison: 'sans-identifiant' };
  if (!database) return { ...base, etat: 'illisible', raison: 'base-absente' };
  let nuit;
  let enCours;
  let ligues;
  let dementis;
  let lignes;
  try {
    nuit = valeurDeLEtat(database, 'nuit');
    enCours = valeurDeLEtat(database, 'en_cours');
    ligues = valeurDeLEtat(database, 'ligues');
    dementis = valeurDeLEtat(database, 'dementis');
    lignes = database
      .prepare('SELECT id, date, home_id, away_id, league, match_id, kickoff, kickoff_connu, calcule_le, version, apres_coup_d_envoi, facteurs, match_key FROM contexte_fiches WHERE date IN (?, ?, ?) AND home_id = ? AND away_id = ?')
      .all(plusJours(date, -1), date, plusJours(date, 1), home, away);
  } catch {
    return { ...base, etat: 'illisible', raison: 'base-sans-reponse' };
  }
  const avecEtat = {
    ...base,
    nuit: nuit?.calculeLe ? { calculeLe: nuit.calculeLe, jourD: nuit.jourD ?? jourParis(Date.parse(nuit.calculeLe)) } : null,
    ligue: moyennesDuChampionnat(ligues, match?.league ?? null),
    statuts: statutsDesFacteurs(note, dementis && typeof dementis === 'object' ? dementis : null),
    dementis: dementis && typeof dementis === 'object' ? dementis : null
  };
  const r = choisirLaFiche(lignes, { date, nuit, enCours });
  if (!r) {
    const aujourdhui = jourParis(instant);
    if (date > plusJours(aujourdhui, NUIT.fenetreJours)) return { ...avecEtat, etat: 'hors-fenetre', raison: 'au-dela-de-14-jours', paraitLe: plusJours(date, -NUIT.fenetreJours) };
    if (!avecEtat.nuit) return { ...avecEtat, etat: 'pas-encore-calcule', raison: 'premiere-nuit' };
    const couvert = date >= avecEtat.nuit.jourD && date <= plusJours(avecEtat.nuit.jourD, NUIT.fenetreJours);
    return { ...avecEtat, etat: 'pas-encore-calcule', raison: couvert ? 'absent-de-la-derniere-nuit' : 'apres-la-derniere-nuit' };
  }
  if (Number(r.version) !== VERSION_CONTEXTE) return { ...avecEtat, etat: 'illisible', raison: 'autre-version' };
  let facteurs;
  try {
    facteurs = JSON.parse(r.facteurs);
  } catch {
    return { ...avecEtat, etat: 'illisible', raison: 'fiche-illisible' };
  }
  const refaire = Boolean(ko) && facteurs?.heureInconnue !== false;
  return {
    ...avecEtat,
    fiche: {
      calculeLe: r.calcule_le,
      date: r.date,
      dateExacte: r.date === date,
      fige: Boolean(avecEtat.nuit) && r.calcule_le !== nuit?.calculeLe && r.calcule_le !== enCours?.calculeLe,
      apresCoupDEnvoi: Number(r.apres_coup_d_envoi) === 1,
      heuresRefaites: refaire,
      facteurs: refaire ? avecLeCoupDEnvoi(facteurs, { date, kickoff: ko }) : facteurs
    }
  };
}

export const __pourLesTests = { valeurDeLEtat, mentionsDuRepos, moyennesDuChampionnat, stadesDe, plusJours, coupDEnvoiConnu };
