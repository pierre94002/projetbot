/**
 * joueursRead.js — LA LECTURE DES CHIFFRES À BLANC DES JOUEURS D'UN MATCH, pour la page du match à venir (étape 34 du plan,
 * lot 1b, partie D, 03/11/2026).
 * -----------------------------------------------------------------------
 * Ce que l'analyse d'un match reçoit APRÈS le moteur (analysis.controller.js, comme le contexte de la 32 et les cartons de
 * la 33) : le verdict n'en sait rien, l'IA ne le reçoit jamais (elle prend des champs nommés du moteur), et une lecture qui
 * échoue n'empêche jamais l'analyse (« illisible »). Les mots sont faits par l'écran (ui/src/utils/joueursABlanc.js, pur).
 *
 * LECTURE SEULE, SANS CALCUL LOURD (règle des 25 ms) : l'état de la nuit et les repères (`joueurs_etat`), la ligne du match
 * (`joueurs_matchs` : la base brute de la nuit et sa dernière feuille), la compo (lectureDesCompos.js : la publiée du cache
 * des compositions, sinon la dernière alignée avec les absents annoncés RETIRÉS), une quarantaine de fiches par clé
 * primaire (`joueurs_fiches`), puis LA MÊME formule pure que la nuit et l'enregistreur d'avant-match (chiffresDesJoueurs.js)
 * avec les paramètres FIGÉS de la note du banc (noteDesJoueurs.js, recopiée par script). Les clubs et les joueurs par
 * IDENTIFIANT FotMob (après people_merges), jamais par un nom.
 * Hors de l'empreinte du moteur ; aucun fichier du moteur ne l'importe (joueursNuit.test.mjs, T-X2 du lot 1a).
 * -----------------------------------------------------------------------
 */

import { VERSION_JOUEURS, MOTS, AVANT_MATCH } from './reglagesJoueurs.js';
import { JOUEURS_AU_BANC } from './noteDesJoueurs.js';
import { parametresDeLEcran, entreesDepuisLesFiches, chiffresDUnCamp, coteJuste, P_T, P_E, DERNIERE_ALIGNEE } from './chiffresDesJoueurs.js';
import { compoPubliee, feuilleDeLaDerniere, absentsAnnonces, joursAutour } from './lectureDesCompos.js';
import { fusions } from './lectureDesJoueurs.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const arrondi = (x, d = 4) => (fini(x) ? Number(x.toFixed(d)) : null);
const numeroDuClub = (id) => {
  const m = String(id ?? '').trim().match(/^(?:fotmob-)?([1-9]\d*)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
};
const jourDe = (x) => {
  const j = String(x ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(j) ? j : null;
};

/** Les lignes du tableau « Ce que dit le banc d'essai » (= bancDesJoueurs.LIGNES_DU_BANC, recopiées pour ne pas charger le banc dans le serveur ; égalité testée). */
export const LIGNES_DU_BANC = Object.freeze({ buteurs: 'buteur-parts', tireur: 'buteur-tireur', cadres: 'cadres-parts', averti: 'averti-parts', passeur: 'passeur-parts', fauxButeurs: 'placebo-parts', fauxTireurs: 'placebo-tireur', fauxCadres: 'placebo-cadres', fauxAvertis: 'placebo-averti', fauxPasseurs: 'placebo-passeur' });

/** Les états de la lecture. */
export const ETATS_DES_JOUEURS = Object.freeze(['pret', 'pas-encore-mesure', 'pas-de-compo', 'pas-encore-calcule', 'clubs-inconnus', 'illisible']);

/** Une valeur de `joueurs_etat` (JSON) ; null si absente ; LÈVE si la base ne répond pas (l'appelant dit « illisible »). */
function valeurDeLEtat(database, cle) {
  const r = database.prepare('SELECT valeur FROM joueurs_etat WHERE cle = ?').get(cle);
  if (!r) return null;
  try {
    return JSON.parse(r.valeur);
  } catch {
    return null;
  }
}

/** La ligne de la nuit d'un match (joueurs_matchs) : les deux clubs, le jour ± 1 ; null sinon. */
export function ligneDuMatch(database, { home, away, date }) {
  return database.prepare('SELECT rencontre, jour, kickoff, league, home, away, lambda_dom, lambda_ext, cadres_dom, cadres_ext, cartes_dom, cartes_ext, sources, calcule_le, version FROM joueurs_matchs WHERE home = ? AND away = ? AND jour IN (?, ?, ?) ORDER BY ABS(julianday(jour) - julianday(?)) LIMIT 1').get(home, away, ...joursAutour(date), date) ?? null;
}

/** Les fiches de ces joueurs (clé primaire) : Map(numéro → ligne). */
export function fichesDe(database, ids) {
  const uniques = [...new Set(ids.filter((x) => Number.isSafeInteger(x) && x > 0))];
  const out = new Map();
  for (let i = 0; i < uniques.length; i += 400) {
    const lot = uniques.slice(i, i + 400);
    for (const r of database.prepare(`SELECT * FROM joueurs_fiches WHERE joueur IN (${lot.map(() => '?').join(', ')})`).all(...lot)) if (Number(r.version) === VERSION_JOUEURS) out.set(Number(r.joueur), r);
  }
  return out;
}

/** La nationalité connue de ces joueurs (player_birthdates, par identifiant FotMob) : Map(« fotmob-N » → { pays, nomPays }). */
function paysDe(database, bruts) {
  const ids = [...new Set(bruts.filter((x) => /^fotmob-\d+$/.test(String(x ?? ''))).map(String))];
  const out = new Map();
  try {
    for (let i = 0; i < ids.length; i += 400) {
      const lot = ids.slice(i, i + 400);
      for (const r of database.prepare(`SELECT player_id, country_code, country_name FROM player_birthdates WHERE player_id IN (${lot.map(() => '?').join(', ')})`).all(...lot)) out.set(r.player_id, { pays: r.country_code ?? null, nomPays: r.country_name ?? null });
    }
  } catch {
    // Sans la table : pas de drapeau (jamais une requête de plus à l'écran).
  }
  return out;
}

/** La base brute d'un camp (la ligne de la nuit). */
const baseBrute = (l, camp) => ({ lambdaS: camp === 'home' ? l.lambda_dom : l.lambda_ext, Sraw: camp === 'home' ? l.cadres_dom : l.cadres_ext, C: camp === 'home' ? l.cartes_dom : l.cartes_ext });

/**
 * LES CHIFFRES D'UN MATCH (commun à l'écran et à l'enregistreur d'avant-match) : `ligne` (joueurs_matchs), `compo`
 * { etat, home: { joueurs: [{ id, poste, titulaire, … }] }, away }, `ficheDe`, `reperes`, `p` (parametresDeLEcran). Rend
 * { home: chiffresDUnCamp, away } (un camp sans joueur : null).
 */
export function chiffresDuMatch({ ligne, compo, ficheDe, reperes, p }) {
  const out = {};
  for (const camp of ['home', 'away']) {
    const joueurs = compo[camp]?.joueurs ?? [];
    if (!joueurs.some((j) => j.titulaire)) {
      out[camp] = null;
      continue;
    }
    const entrees = entreesDepuisLesFiches({ joueurs: joueurs.map((j) => ({ id: j.id, poste: j.poste, titulaire: j.titulaire })), fiches: ficheDe, reperes, league: ligne.league, club: camp === 'home' ? ligne.home : ligne.away });
    out[camp] = chiffresDUnCamp({ entrees, base: baseBrute(ligne, camp), dom: camp === 'home', p, etat: compo.etat });
  }
  return out;
}

/** Les statuts de l'écran, famille par famille (la note ; null : « pas encore mesuré »). */
export function statutsDesJoueurs(note = JOUEURS_AU_BANC) {
  const out = {};
  for (const f of ['marque', 'cadres', 'averti', 'passeur']) {
    const s = note?.statuts?.[f] ?? null;
    out[f] = s ? { statut: s.statut === 'mesure' ? 'mesure' : 'poste', variante: s.variante ?? null, calibre: s.calibre ? { ecartMoyenPoints: s.calibre.ecartMoyenPoints ?? null, calibre: s.calibre.calibre === true } : null } : { statut: 'non-mesure', variante: null, calibre: null };
  }
  return out;
}

/** Ce que l'écran dit du banc : les neuf lignes de « Ce que dit le banc d'essai » (verdicts tels quels), sans chemin ni empreinte. */
export function bancPourLEcran(note = JOUEURS_AU_BANC) {
  if (!note || typeof note !== 'object') return null;
  const v = (id) => (note.variantes ?? []).find((x) => x.id === id) ?? null;
  return {
    calculeLe: note.calculeLe ?? null,
    K: note.K ?? null,
    periodes: note.periodes ?? null,
    lignes: Object.entries(LIGNES_DU_BANC).map(([cle, id]) => {
      const x = v(id);
      return { cle, id, verdict: x?.verdict ?? null, utile: x?.utile === true, placebo: x?.placebo === true, matchsJuges: x?.matchsJuges ?? null, gainRelatif: x?.gainRelatif ?? null, fourchetteRelative: x?.fourchetteRelative ?? null, calibration: x?.calibration ?? null };
    }),
    derniereAlignee: { titulairesAuMatch: arrondi(P_T, 4), entres: arrondi(P_E, 4), source: DERNIERE_ALIGNEE.source }
  };
}

/** Un joueur montré (nom, poste, drapeau, chiffres en %, cotes justes). */
function joueurMontre(j, c, { etat, absent = null, pays = null }) {
  const ch = c?.chiffres ?? null;
  const pct = (x) => (fini(x) ? arrondi(x, 4) : null);
  return {
    id: j.id ?? null,
    brut: j.brut ?? null,
    nom: j.nom ?? null,
    poste: c?.poste ?? j.poste ?? null,
    numero: j.numero ?? null,
    pays: j.pays ?? pays?.pays ?? null,
    nomPays: j.nomPays ?? pays?.nomPays ?? null,
    titulaire: j.titulaire === true,
    sansIdentifiant: !(Number.isSafeInteger(j.id) && j.id > 0),
    sansFiche: Number.isSafeInteger(j.id) && j.id > 0 && !(c?.apparitions > 0),
    absentAnnonce: absent,
    minutes: arrondi(j.titulaire ? c?.m : c?.mEntre, 1),
    pEntre: j.titulaire ? null : arrondi(c?.pEntre, 4),
    sIlJoue: etat === 'derniere-alignee' && j.titulaire === true,
    chiffres: ch
      ? {
          marque: { p: pct(ch.marque), cote: coteJuste(ch.marque) },
          cadres: { p: pct(ch.cadres), cote: coteJuste(ch.cadres) },
          cadres2: { p: pct(ch.cadres2), cote: coteJuste(ch.cadres2) },
          averti: { p: pct(ch.averti), cote: coteJuste(ch.averti) },
          passeur: { p: pct(ch.passeur), cote: coteJuste(ch.passeur) }
        }
      : null
  };
}

/**
 * LES CHIFFRES DES JOUEURS D'UN MATCH (lecture seule ; quelques lectures par clé). `match` : le match de l'analyse
 * (identifiants par `scoreInputs.home/away.teamId`, `league`, `commenceTime`, noms) ; `database` ; `maintenant` (ms) ;
 * `note` : le banc (par défaut, la note recopiée). Rend { version, etat, raison, nuit, clubs, compo, base, camps,
 * statuts, tireur, banc, mots } — jamais une exception pour une base qui ne répond pas (« illisible »).
 */
export function joueursDuMatch({ match, database, maintenant = null, note = JOUEURS_AU_BANC }) {
  const home = numeroDuClub(match?.scoreInputs?.home?.teamId ?? match?.homeId ?? null);
  const away = numeroDuClub(match?.scoreInputs?.away?.teamId ?? match?.awayId ?? null);
  const date = jourDe(match?.commenceTime);
  const p = parametresDeLEcran(note);
  const base = {
    version: VERSION_JOUEURS,
    etat: 'pret',
    raison: null,
    date,
    nuit: null,
    clubs: { home: { id: home, nom: match?.home ?? null }, away: { id: away, nom: match?.away ?? null } },
    compo: null,
    base: null,
    camps: { home: { joueurs: [], attendus: null }, away: { joueurs: [], attendus: null } },
    statuts: statutsDesJoueurs(note),
    tireur: p ? p.tireur : null,
    banc: bancPourLEcran(note),
    avantMatch: { rythmeMin: AVANT_MATCH.rythmeMin, fenetreMin: AVANT_MATCH.fenetreMin },
    mots: { ...MOTS }
  };
  if (!date) return { ...base, etat: 'illisible', raison: 'date-du-match-illisible' };
  if (home === null || away === null) return { ...base, etat: 'clubs-inconnus', raison: home === null && away === null ? 'les-deux' : home === null ? 'domicile' : 'exterieur' };
  if (!database) return { ...base, etat: 'illisible', raison: 'base-absente' };
  try {
    const nuit = valeurDeLEtat(database, 'nuit');
    const enCours = valeurDeLEtat(database, 'en_cours');
    const reperes = valeurDeLEtat(database, 'reperes');
    const avecNuit = { ...base, nuit: nuit?.calculeLe ? { calculeLe: nuit.calculeLe, jourD: nuit.jourD ?? null } : null };
    if (!nuit?.calculeLe || enCours || !reperes) return { ...avecNuit, etat: 'pas-encore-calcule', raison: enCours ? 'nuit-en-cours' : 'premiere-nuit' };
    const ligne = ligneDuMatch(database, { home, away, date });
    if (!ligne) return { ...avecNuit, etat: 'pas-encore-calcule', raison: 'match-pas-dans-la-nuit' };
    let sources = {};
    try {
      sources = JSON.parse(ligne.sources ?? '{}');
    } catch {
      sources = {};
    }
    const parFusion = fusions(database);
    // La compo : la publiée (cache des compositions), sinon la dernière alignée, absents annoncés retirés.
    const publiee = compoPubliee(database, { home, away, date: ligne.jour, parFusion });
    let compo;
    if (publiee && (publiee.home.titulaires.length || publiee.away.titulaires.length)) {
      const avecAbsents = (cote) => ({ joueurs: [...cote.titulaires, ...cote.remplacants], absents: cote.absents });
      compo = { etat: 'publiee', lueLe: publiee.lueLe, kickoff: publiee.kickoff ?? ligne.kickoff ?? null, home: avecAbsents(publiee.home), away: avecAbsents(publiee.away), retires: { home: [], away: [] } };
    } else {
      const abs = absentsAnnonces(database, { home, away, date: ligne.jour, parFusion });
      const d = sources.dernieres ?? {};
      const camp = (c) => {
        const feuille = d[c] ? feuilleDeLaDerniere(database, { cle: d[c].cle, cote: d[c].cote, parFusion }) : [];
        const ids = new Set((abs?.[c] ?? []).map((a) => a.id).filter(Boolean));
        return { joueurs: feuille.filter((j) => !(j.id && ids.has(j.id))), retires: feuille.filter((j) => j.id && ids.has(j.id)).map((j) => ({ id: j.id, nom: j.nom, motif: (abs[c] ?? []).find((a) => a.id === j.id)?.motif ?? null })), absents: abs?.[c] ?? [] };
      };
      const h = camp('home');
      const a = camp('away');
      compo = { etat: 'derniere-alignee', lueLe: null, kickoff: ligne.kickoff ?? null, home: h, away: a, retires: { home: h.retires, away: a.retires }, dernieres: { home: d.home?.date ?? null, away: d.away?.date ?? null }, absentsLusLe: abs?.lueLe ?? null };
    }
    const compoDite = { etat: compo.etat, lueLe: compo.lueLe, kickoff: compo.kickoff, dernieres: compo.dernieres ?? null, retires: compo.retires, absentsLusLe: compo.absentsLusLe ?? null, minutesAvant: compo.lueLe && compo.kickoff ? Math.round((Date.parse(compo.kickoff) - Date.parse(compo.lueLe)) / 60_000) : null };
    const avecCompo = { ...avecNuit, compo: compoDite, base: { home: baseBrute(ligne, 'home'), away: baseBrute(ligne, 'away'), sources: { calculeLe: ligne.calcule_le, kickoffConnu: Boolean(sources.kickoffConnu) } } };
    if (!compo.home.joueurs.length && !compo.away.joueurs.length) return { ...avecCompo, etat: 'pas-de-compo', raison: 'ni-publiee-ni-derniere' };
    // Les noms, postes et drapeaux sont montrés même sans note (la structure reste).
    const tous = [...compo.home.joueurs, ...compo.away.joueurs];
    const pays = paysDe(database, tous.filter((j) => !j.pays).map((j) => j.brut));
    const absentDe = (c, j) => (compo.etat === 'publiee' && j.id ? (compo[c].absents ?? []).find((a) => a.id === j.id)?.motif ?? null : null);
    if (!p) {
      const camps = {};
      for (const c of ['home', 'away']) camps[c] = { joueurs: compo[c].joueurs.map((j) => joueurMontre(j, null, { etat: compo.etat, absent: absentDe(c, j), pays: pays.get(String(j.brut)) })), attendus: null };
      return { ...avecCompo, camps, etat: 'pas-encore-mesure', raison: 'note-nulle' };
    }
    const ficheDe = fichesDe(database, tous.map((j) => j.id));
    const chiffres = chiffresDuMatch({ ligne, compo: { etat: compo.etat, home: { joueurs: compo.home.joueurs }, away: { joueurs: compo.away.joueurs } }, ficheDe, reperes, p });
    const camps = {};
    const recalees = {};
    for (const c of ['home', 'away']) {
      const r = chiffres[c];
      const tit = compo[c].joueurs.filter((j) => j.titulaire);
      const remp = compo[c].joueurs.filter((j) => !j.titulaire);
      const joueurs = [...tit.map((j, i) => joueurMontre(j, r?.titulaires[i] ?? null, { etat: compo.etat, absent: absentDe(c, j), pays: pays.get(String(j.brut)) })), ...remp.map((j, i) => joueurMontre(j, r?.remplacants[i] ?? null, { etat: compo.etat, absent: absentDe(c, j), pays: pays.get(String(j.brut)) }))];
      camps[c] = { joueurs, attendus: r ? Object.fromEntries(Object.entries(r.attendus).map(([k, v]) => [k, arrondi(v, 3)])) : null, manque: r?.manque ?? [] };
      recalees[c] = r ? { lambda: arrondi(r.base.lambda, 3), S: arrondi(r.base.S, 3), C: arrondi(r.base.C, 3) } : null;
    }
    void maintenant;
    return { ...avecCompo, base: { ...avecCompo.base, recalees }, camps };
  } catch {
    return { ...base, etat: 'illisible', raison: 'base-sans-reponse' };
  }
}

export const __pourLesTests = { valeurDeLEtat, paysDe, joueurMontre };
