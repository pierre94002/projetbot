/**
 * entrees.js — ce que le banc d'essai donne au moteur pour un match passé (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Le moteur n'est pas réécrit, il est NOURRI : `matchDuBanc` construit
 * l'objet `match` exactement comme matchEnrichment.js le fait aujourd'hui
 * (marketOdds, teamStats.goals, scoreInputs, statInputs), mais depuis
 * l'histoire, et y POSE `leagueGoalAverages` (toujours la clé, nulle si
 * inconnue : le moteur prend alors le barème) — la seule différence voulue
 * avec l'appli, qui lit le classement d'aujourd'hui (une fuite pour un rejeu).
 *
 * D'où viennent les entrées, toutes « avant le jour J » (date < J, jour UTC) :
 *   - le MAGASIN : la table du jour J (étape 17), lue par tranches ici
 *     (LecteurDuMagasin) — deux lignes team_day, les cinq rencontres de la
 *     forme, la ligne du championnat — puis la conversion de l'étape 17
 *     (campMoteur, assembler) : le même résultat qu'entreesMoteur, ~20 fois
 *     plus vite (entreesMoteur relit tout l'historique du club à chaque appel :
 *     7 ms par rencontre mesurées sur la base du bac) ;
 *   - FOOTBALL-DATA (2000 → 2023) : les faits de faitsDepuisFd (étape 17),
 *     tenus en mémoire club par club et championnat par championnat, publiés
 *     seulement À LA FIN de chaque journée (MemoireFd) ; puis avantEquipe,
 *     avantLigue et la même conversion — jamais une seconde formule.
 * Et le REPÈRE COURANT de chaque championnat (ReperesCourants) : ce que
 * donnerait le championnat seul, calculé avant J, jour par jour.
 *
 * Champ par champ (conception §3.1) :
 * | Champ                 | Magasin                               | football-data                          |
 * |-----------------------|---------------------------------------|----------------------------------------|
 * | matchId, home, away   | cleDuMatch, noms du magasin           | fd:<code>|<jour du fichier>|<dom>|<ext>, fd_teams.nom |
 * | league, commenceTime  | championnat, jour + coup d'envoi connu (sinon 12 h UTC) | libellé FotMob du code (sinon « fd:CODE »), jour + 12 h |
 * | marketOdds            | le jeu de prix (prix.js), ou null     | idem                                   |
 * | teamStats.*.goals     | (d) de la table du jour J             | (d) d'avantEquipe                      |
 * | expectedGoals         | { for.total, provider: 'fotmob' }     | idem (hors des fournisseurs manuels)   |
 * | scoreInputs, statInputs | (a)-(c), (e1)                       | idem, sans xG                          |
 * | leagueGoalAverages    | (e2), ou null → barème (compté)       | idem                                   |
 * | bankroll              | 1 000 (la mise Kelly est notée, jamais jugée)                                  |
 * Jamais : match-results.json (la saisie de Pierre), tilt-state.json, ni une
 * lecture « du moment ». Lit la base de l'appelant, n'en ouvre jamais.
 * -----------------------------------------------------------------------
 */

import { faitsDepuisFd, avantEquipe, avantLigue, campMoteur, assembler, faitEquipeDecode, ligneLigue, CONSTANTES } from '../data/db/dayTable.js';
import { canonicalTeamNames } from '../data/db/identityRegistry.js';
import { paireRelevee } from '../data/db/leagueBenchmarks.js';
import { cleDuMatch } from '../data/enregistreurs/gelPronostics.js';
import { FD_SAISONNIERS, FD_PAYS } from '../data/providers/footballDataOdds.js';
import { matrice, MODELES_SCORE } from '../core/engine/scorePrediction.js';
import { statExpectations, STAT_KINDS, loiDesComptes } from '../sports/football/statMarkets.js';
import { COLONNES_AVANT_MATCH, COLONNES_CLOTURE } from './periodes.js';

/** Le coupe-circuit NEUTRE : jamais getTiltState() (celui de Pierre, enclenché, supprimerait tous les paris simulés en silence). */
export const TILT_NEUTRE = Object.freeze({ currentDownswing: 0, circuitBreakerActive: false });
/** La bankroll de référence du moteur au banc : la mise Kelly se calcule, elle n'est jamais jugée (mise fixe d'une unité). */
export const BANKROLL_DU_BANC = 1000;

const nombre = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Le championnat d'un code football-data : le libellé du magasin quand il le suit, sinon « fd:CODE ». */
export const ligueDuCode = (code) => FD_SAISONNIERS[code] ?? FD_PAYS[code] ?? `fd:${code}`;

/** Les colonnes de fd_history que lit le banc (faits, rattachement, prix d'avant-match, clôtures pour mesurer). */
export const COLONNES_FD = Object.freeze([
  'id', 'code', 'saison', 'date', 'date_fichier', 'heure', 'dom', 'ext', 'match_key', 'lien', 'bd', 'be',
  'tirs_d', 'tirs_e', 'cadres_d', 'cadres_e', 'corners_d', 'corners_e',
  ...COLONNES_AVANT_MATCH, ...COLONNES_CLOTURE
]);

// ===================================================================== le magasin

/**
 * La lecture du magasin pour le banc : requêtes préparées une fois, une rencontre à la fois. Le même résultat
 * qu'entreesMoteur(matchKey) (testé), sans relire tout l'historique du club.
 */
export class LecteurDuMagasin {
  constructor(database) {
    this.database = database;
    this.st = {
      rencontres: database.prepare('SELECT rencontre, match_key AS matchKey, date, league, saison, home, away FROM day_matches WHERE date >= ? AND date <= ? ORDER BY date, match_key'),
      nomsDuJour: database.prepare('SELECT match_key AS matchKey, home_name AS homeName, away_name AS awayName FROM matches WHERE date = ?'),
      nomsDuMatch: database.prepare('SELECT home_name, away_name FROM matches WHERE match_key = ?'),
      kickoff: database.prepare("SELECT json_extract(meta, '$.kickoff') AS kickoff FROM matches WHERE match_key = ?"),
      camps: database.prepare('SELECT t.*, d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE t.rencontre = ?'),
      // Par la clé primaire (rencontre) seulement : avec « AND club = ? », SQLite prend l'index du club et relit
      // toutes ses lignes (≈ 2 ms par rencontre sur la base du bac) ; le club se filtre ensuite, ici.
      refs: database.prepare('SELECT t.*, d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE t.rencontre IN (?, ?, ?, ?, ?)'),
      ligue: database.prepare('SELECT * FROM league_day WHERE league = ? AND date = ?'),
      fd: database.prepare(`SELECT ${COLONNES_FD.join(', ')} FROM fd_history WHERE match_key = ? ORDER BY id`)
    };
    this.noms = canonicalTeamNames({ database });
    // Le repli de scoreFormRead quand l'annuaire ne connaît pas un adversaire : le nom gardé par la rencontre.
    this.nomsDuMagasin = (matchKey, home) => {
      const r = this.st.nomsDuMatch.get(matchKey);
      return r ? (home ? r.away_name : r.home_name) : null;
    };
  }

  /** Les rencontres de la table du jour J entre deux jours (compris), par jour puis clé. */
  rencontresEntre(de, a) {
    return this.st.rencontres.all(de, a);
  }

  /** Les noms des deux clubs, tels que la rencontre les a gardés, pour toutes les rencontres d'un jour. */
  nomsDuJour(date) {
    return new Map(this.st.nomsDuJour.all(date).map((r) => [r.matchKey, r]));
  }

  /** L'heure du coup d'envoi d'une rencontre (meta.kickoff), ou null. */
  kickoff(matchKey) {
    const k = this.st.kickoff.get(matchKey)?.kickoff;
    return typeof k === 'string' && k ? k : null;
  }

  /** Les lignes football-data rattachées à une rencontre (tous liens, par id). */
  lignesFd(matchKey) {
    return this.st.fd.all(matchKey);
  }

  /**
   * Les deux lignes team_day d'une rencontre et ses entrées du moteur (assembler de l'étape 17), ou null si
   * la rencontre n'a pas ses deux camps dans la table.
   */
  entrees(rencontre, { homeName = null, awayName = null } = {}) {
    const lignes = this.st.camps.all(rencontre);
    const dom = lignes.find((r) => r.camp === 1);
    const ext = lignes.find((r) => r.camp === 0);
    if (!dom || !ext) return null;
    const faitsForme = (r) => {
      const refs = [1, 2, 3, 4, 5].map((k) => r[`f5_${k}`]).filter((x) => x !== null && x !== undefined);
      if (!refs.length) return [];
      while (refs.length < 5) refs.push(null);
      return this.st.refs.all(...refs).filter((x) => x.club === r.club).map(faitEquipeDecode);
    };
    const campDom = campMoteur(dom, faitsForme(dom), this.noms, this.nomsDuMagasin, homeName);
    const campExt = campMoteur(ext, faitsForme(ext), this.noms, this.nomsDuMagasin, awayName);
    const ligne = this.st.ligue.get(dom.league, dom.date) ?? ligneLigue(dom.league, dom.date, { database: this.database });
    return { dom, ext, entrees: assembler(campDom, campExt, dom.date, ligne) };
  }
}

/** Les faits d'une rencontre du magasin dont le banc a besoin pour RÉGLER (après le calcul, jamais avant). */
export function faitsDuMagasin(dom) {
  return {
    source: 'magasin',
    attribue: dom.attribue === 1,
    prolongation: dom.prolongation === 1,
    coupe: dom.coupe === 1,
    bp: dom.bp,
    bc: dom.bc,
    bp90: nombre(dom.bp90),
    bc90: nombre(dom.bc90),
    stats: {
      corners: [dom.corners_p, dom.corners_c],
      shots: [dom.tirs_p, dom.tirs_c],
      shotsOnTarget: [dom.cadres_p, dom.cadres_c]
    }
  };
}

/** Les faits d'une ligne football-data pour régler : championnats seulement (aucune prolongation), 0 = vrai zéro. */
export function faitsDuFd(ligne) {
  return {
    source: 'fd',
    attribue: false,
    prolongation: false,
    coupe: false,
    bp: nombre(ligne.bd),
    bc: nombre(ligne.be),
    bp90: null,
    bc90: null,
    stats: {
      corners: [ligne.corners_d, ligne.corners_e],
      shots: [ligne.tirs_d, ligne.tirs_e],
      shotsOnTarget: [ligne.cadres_d, ligne.cadres_e]
    }
  };
}

/**
 * Le SCORE ET LES STATISTIQUES QUI RÈGLENT, d'après les faits (§5.3 corrigé) :
 *   - score : celui de la 90e minute — `prolongation ? bp90 : bp` ; un match prolongé sans bp90 (déroulé
 *     incomplet) n'est pas réglable (`prolongationSansScore90`) — jamais le score de la 120e ;
 *   - statistiques d'un match prolongé : non réglables (`prolongationStats`, team_stats couvre 120 minutes) ;
 *     au magasin, une paire 0-0 = non relevée (`statNonRelevee`) ; chez football-data, 0 est un vrai zéro ;
 *   - un match attribué : rien (`attribue`), ni pronostic ni pari.
 */
export function reglementDuMatch(faits) {
  if (faits.attribue) return { attribue: true, buts: null, nonReglableButs: 'attribue', stats: null, nonReglableStats: 'attribue' };
  let buts = null;
  let nonReglableButs = null;
  if (faits.prolongation) {
    if (faits.bp90 === null || faits.bc90 === null) nonReglableButs = 'prolongationSansScore90';
    else buts = { home: faits.bp90, away: faits.bc90 };
  } else if (faits.bp === null || faits.bc === null) nonReglableButs = 'sansScore';
  else buts = { home: faits.bp, away: faits.bc };
  const stats = {};
  for (const [kind, [h, a]] of Object.entries(faits.stats)) {
    if (faits.prolongation) stats[kind] = null;
    else if (faits.source === 'magasin') {
      const p = paireRelevee(h, a);
      stats[kind] = p ? { home: p[0], away: p[1] } : null;
    } else {
      const x = nombre(h);
      const y = nombre(a);
      stats[kind] = x === null || y === null ? null : { home: x, away: y };
    }
  }
  return { attribue: false, buts, nonReglableButs, stats, nonReglableStats: faits.prolongation ? 'prolongationStats' : null };
}

// ===================================================================== football-data en mémoire

/** Les champs d'un fait d'équipe que lisent avantEquipe, avantLigue et campMoteur (les autres ne sont pas gardés). */
const CHAMPS_FAIT = Object.freeze([
  'date', 'matchKey', 'rencontre', 'league', 'saison', 'home', 'club', 'adversaire', 'attribue', 'compte', 'releve', 'prolongation', 'coupe',
  'bp', 'bc', 'bp90', 'bc90', 'xg_p', 'xg_c', 'tirs_p', 'tirs_c', 'cadres_p', 'cadres_c', 'corners_p', 'corners_c'
]);
/**
 * La projection d'un fait sur ces champs : un littéral à clés fixes (une seule forme d'objet, propriétés
 * rangées dans l'objet — des clés ajoutées une à une en boucle le faisaient passer en dictionnaire, plusieurs
 * fois plus gros) ; les textes répétés (championnat, saison) partagés. Mesuré sur la base du bac : +1,2 Go de
 * mémoire pour 363 572 faits avant, ~4 fois moins après.
 */
const textes = new Map();
const partage = (t) => {
  if (typeof t !== 'string') return t;
  let x = textes.get(t);
  if (x === undefined) textes.set(t, (x = t));
  return x;
};
const projeter = (f) => ({
  date: f.date,
  matchKey: f.matchKey,
  rencontre: f.rencontre,
  league: partage(f.league),
  saison: partage(f.saison),
  home: f.home,
  club: f.club,
  adversaire: f.adversaire,
  attribue: f.attribue,
  compte: f.compte,
  releve: f.releve,
  prolongation: f.prolongation,
  coupe: f.coupe,
  bp: f.bp,
  bc: f.bc,
  bp90: f.bp90,
  bc90: f.bc90,
  xg_p: f.xg_p,
  xg_c: f.xg_c,
  tirs_p: f.tirs_p,
  tirs_c: f.tirs_c,
  cadres_p: f.cadres_p,
  cadres_c: f.cadres_c,
  corners_p: f.corners_p,
  corners_c: f.corners_c
});

/**
 * L'histoire football-data, club par club et championnat (code) par championnat, en mémoire : chaque jour, les
 * faits de la journée ne sont PUBLIÉS qu'après le calcul de toutes ses rencontres (`publier`) — un club à deux
 * matchs le même jour ne voit jamais l'autre ; avantEquipe et avantLigue lèvent de toute façon sur un fait de
 * date ≥ J (étape 17). Identité : fd_teams.id, jamais un nom.
 */
export class MemoireFd {
  constructor({ fdTeams = [] } = {}) {
    this.noms = new Map(fdTeams.map((t) => [Number(t.id), t.nom]));
    this.clubs = new Map();
    this.ligues = new Map();
    this.cache = new Map();
    this.faits = 0;
  }

  /** Les faits (deux par match) des lignes d'une journée, de la forme du magasin, réduits aux champs utiles. */
  faitsDe(lignes) {
    return faitsDepuisFd(lignes, { fdTeams: null }).map(projeter);
  }

  /** Fin de journée : les faits du jour entrent dans l'histoire (club, et championnat vu du camp qui reçoit). */
  publier(faits) {
    for (const f of faits) {
      let c = this.clubs.get(f.club);
      if (!c) this.clubs.set(f.club, (c = []));
      c.push(f);
      if (f.home) {
        let l = this.ligues.get(f.league);
        if (!l) this.ligues.set(f.league, (l = []));
        l.push(f);
      }
      this.faits++;
    }
    this.cache.clear();
  }

  /**
   * Les entrées du moteur d'une ligne football-data de jour J : avantEquipe pour chaque club (son histoire
   * publiée ; du championnat, seul le dernier fait d'avant J compte pour (d) — la saison la plus récente),
   * avantLigue (une fois par championnat et par jour), puis campMoteur et assembler.
   */
  entrees(ligne) {
    const date = String(ligne.date).slice(0, 10);
    const code = ligne.code;
    const dom = Number(ligne.dom);
    const ext = Number(ligne.ext);
    const cible = { date, league: code, saison: ligne.saison, matchKey: `fd:${code}|${ligne.date_fichier ?? date}|${dom}|${ext}` };
    const ligue = this.ligues.get(code) ?? [];
    const derniere = ligue.length ? [ligue[ligue.length - 1]] : [];
    const histoire = (id) => this.clubs.get(id) ?? [];
    const cleLigue = `${code}|${ligne.saison}`;
    let l = this.cache.get(cleLigue);
    if (!l) {
      l = avantLigue(ligue, cible);
      this.cache.set(cleLigue, l);
    }
    const sansNom = () => null;
    const camp = (id) => {
      const faits = histoire(id);
      const avant = avantEquipe(faits, derniere, cible);
      // Les cinq rencontres de la forme sont les cinq derniers faits du club (aucun match attribué chez football-data).
      return campMoteur({ ...avant, club: id }, faits.slice(-10), this.noms, sansNom, this.noms.get(id) ?? null);
    };
    const entrees = assembler(camp(dom), camp(ext), date, l);
    // Un club football-data n'a pas d'identifiant FotMob : « fd:<id> » plutôt qu'un faux « fotmob-<id> » (rien d'autre ne change).
    for (const [side, id] of [['home', dom], ['away', ext]]) {
      if (entrees.scoreInputs[side]) entrees.scoreInputs[side].teamId = `fd:${id}`;
      if (entrees.teamGoals[side]) entrees.teamGoals[side].teamId = `fd:${id}`;
    }
    return entrees;
  }
}

// ===================================================================== l'objet match du moteur

/**
 * L'objet `match` donné à analyzeMatch, champ pour champ comme enrichMatchWithRealAverages le rend aujourd'hui
 * (sans le mélange avec match-results.json, la saisie de Pierre). `rencontre` : { fixtureKey, home, away,
 * league, date, kickoff } ; `entrees` : assembler ; `marketOdds` : un jeu de prix (prix.js) ou null.
 */
export function matchDuBanc({ rencontre, entrees, marketOdds = null }) {
  const gh = entrees?.teamGoals?.home ?? null;
  const ga = entrees?.teamGoals?.away ?? null;
  const match = {
    matchId: rencontre.fixtureKey,
    home: rencontre.home,
    away: rencontre.away,
    league: rencontre.league,
    commenceTime: rencontre.kickoff ?? `${rencontre.date}T12:00:00.000Z`,
    sportKey: 'football',
    bankroll: BANKROLL_DU_BANC,
    hasOdds: Boolean(marketOdds),
    oddsSource: marketOdds ? `banc:${marketOdds.jeu ?? 'prix'}` : null,
    marketOdds: marketOdds
      ? { odds1: marketOdds.odds1, oddsDraw: marketOdds.oddsDraw, odds2: marketOdds.odds2, bookmakersCount: marketOdds.bookmakersCount ?? null, byBookmaker: marketOdds.byBookmaker ?? [] }
      : null,
    scoreInputs: entrees?.scoreInputs ?? null,
    statInputs: entrees?.statInputs ?? null,
    // TOUJOURS la clé (amendement A1) : nulle → le barème, jamais le classement d'aujourd'hui.
    leagueGoalAverages: entrees?.leagueGoalAverages ?? null
  };
  // Comme resolveGoalsFromStore : sans aucun des deux clubs, le match part sans teamStats (moyennes de ligue) ;
  // l'xG d'affichage seulement quand les deux sont connus (« fotmob » : hors des fournisseurs manuels).
  if (gh || ga) {
    match.teamStats = { home: { name: rencontre.home, goals: gh, form: null, corners: null }, away: { name: rencontre.away, goals: ga, form: null, corners: null } };
    if (gh?.for?.total != null && ga?.for?.total != null) match.expectedGoals = { home: gh.for.total, away: ga.for.total, provider: 'fotmob' };
  }
  return match;
}

/** La clé d'une rencontre du magasin (celle des pronostics gelés) et celle d'une ligne football-data. */
export const cleDuMagasin = ({ home, away, league, homeName, awayName, date }) =>
  cleDuMatch({ homeId: `fotmob-${home}`, awayId: `fotmob-${away}`, league, home: homeName, away: awayName, date });
export const cleDuFd = (ligne) => `fd:${ligne.code}|${ligne.date_fichier ?? ligne.date}|${Number(ligne.dom)}|${Number(ligne.ext)}`;

// ===================================================================== le repère courant

const LIGNES = Object.freeze([0.5, 1.5, 2.5, 3.5]);
const STATS = Object.freeze(['corners', 'shots', 'shotsOnTarget']);
// Les champs d'une journée : n, buts dom./ext., 1/N/2, +0,5…+3,5, les deux marquent, dom. +X, ext. +X, puis (n, dom., ext.) par statistique.
const I = { n: 0, bd: 1, be: 2, v1: 3, vN: 4, v2: 5, plus: 6, btts: 10, dom: 11, ext: 15, stats: 19 };
const NB_CHAMPS = 28;
/** Les seuils de leagueAveragesBefore : 30 matchs dans la saison, sinon 10 sur 365 jours, sinon les valeurs par défaut. */
export const SEUILS_DU_REPERE = Object.freeze({ saison: CONSTANTES.minimumSaisonLigue, an: CONSTANTES.minimumLigue, jours: CONSTANTES.joursRepli });
/** Le rho de la grille du repère du score exact : celui du modèle de score avec cotes (MODELES_SCORE.cotes). */
export const RHO_DU_REPERE = MODELES_SCORE.cotes.rho;

function joursAvant(iso, jours) {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - jours);
  return t.toISOString().slice(0, 10);
}

/** Des sommes cumulées par jour (une ligne par journée, dans l'ordre) : la somme d'une fenêtre en deux lectures. */
class Cumuls {
  constructor() {
    this.jours = [];
    this.cum = new Float64Array(NB_CHAMPS * 64);
  }
  ajouter(date, v) {
    const k = this.jours.length;
    const dernier = k ? this.jours[k - 1] : null;
    if (dernier !== null && date < dernier) throw new Error(`repère courant : la journée du ${date} arrive après celle du ${dernier} — les journées s'ajoutent dans l'ordre.`);
    if (dernier === date) {
      // La même journée par une seconde source : additionnée à la dernière ligne.
      for (let c = 0; c < NB_CHAMPS; c++) this.cum[k * NB_CHAMPS + c] += v[c];
      return;
    }
    if ((k + 2) * NB_CHAMPS > this.cum.length) {
      const plus = new Float64Array(this.cum.length * 2);
      plus.set(this.cum);
      this.cum = plus;
    }
    for (let c = 0; c < NB_CHAMPS; c++) this.cum[(k + 1) * NB_CHAMPS + c] = this.cum[k * NB_CHAMPS + c] + v[c];
    this.jours.push(date);
  }
  /** Le nombre de journées de date < J (recherche dichotomique). */
  avant(J) {
    let bas = 0;
    let haut = this.jours.length;
    while (bas < haut) {
      const m = (bas + haut) >> 1;
      if (this.jours[m] < J) bas = m + 1;
      else haut = m;
    }
    return bas;
  }
  somme(i0, i1) {
    const v = new Float64Array(NB_CHAMPS);
    if (i1 <= i0) return v;
    for (let c = 0; c < NB_CHAMPS; c++) v[c] = this.cum[i1 * NB_CHAMPS + c] - this.cum[i0 * NB_CHAMPS + c];
    return v;
  }
}

/** La contribution d'un match à sa journée : buts de la 90e (ou null : il n'entre pas dans les buts), statistiques relevées. */
export function contributionAuRepere({ buts = null, stats = null }) {
  const v = new Float64Array(NB_CHAMPS);
  if (buts && Number.isFinite(buts.home) && Number.isFinite(buts.away)) {
    const h = buts.home;
    const a = buts.away;
    v[I.n] = 1;
    v[I.bd] = h;
    v[I.be] = a;
    v[h > a ? I.v1 : h === a ? I.vN : I.v2] = 1;
    LIGNES.forEach((l, k) => {
      if (h + a > l) v[I.plus + k] = 1;
      if (h > l) v[I.dom + k] = 1;
      if (a > l) v[I.ext + k] = 1;
    });
    if (h > 0 && a > 0) v[I.btts] = 1;
  }
  STATS.forEach((kind, k) => {
    const s = stats?.[kind];
    if (s && Number.isFinite(s.home) && Number.isFinite(s.away)) {
      v[I.stats + 3 * k] = 1;
      v[I.stats + 3 * k + 1] = s.home;
      v[I.stats + 3 * k + 2] = s.away;
    }
  });
  return v;
}

/** Les parts d'une grille de scores (81 cases) : 1N2, +X, les deux marquent, dom. +X, ext. +X. */
function partsDUneGrille(cases) {
  const parts = { home: 0, draw: 0, away: 0, plus: {}, btts: 0, domPlus: {}, extPlus: {} };
  for (const l of LIGNES) {
    parts.plus[l] = 0;
    parts.domPlus[l] = 0;
    parts.extPlus[l] = 0;
  }
  for (const c of cases) {
    if (c.home > c.away) parts.home += c.p;
    else if (c.home === c.away) parts.draw += c.p;
    else parts.away += c.p;
    if (c.home > 0 && c.away > 0) parts.btts += c.p;
    for (const l of LIGNES) {
      if (c.home + c.away > l) parts.plus[l] += c.p;
      if (c.home > l) parts.domPlus[l] += c.p;
      if (c.away > l) parts.extPlus[l] += c.p;
    }
  }
  return parts;
}

const GRILLE_PAR_DEFAUT = matrice(CONSTANTES.defaut.home, CONSTANTES.defaut.away, RHO_DU_REPERE);
/** Le repère par défaut (moins de 10 matchs sur 365 jours) : les buts par défaut de leagueAveragesBefore et leur grille. */
export const REPERE_PAR_DEFAUT = Object.freeze({
  n: 0,
  source: 'defaut',
  goals: Object.freeze({ ...CONSTANTES.defaut }),
  parts: Object.freeze(partsDUneGrille(GRILLE_PAR_DEFAUT)),
  stats: Object.freeze({ corners: null, shots: null, shotsOnTarget: null })
});

/**
 * LE REPÈRE COURANT de chaque championnat (libellé FotMob, commun aux deux sources) : un agrégat par journée,
 * ajouté en FIN de journée (`ajouterJournee`), jamais avant que la journée soit entièrement calculée ; `avant`
 * ne somme que les journées de date < J — celles de la saison si elles font au moins 30 matchs, sinon
 * [J − 365 j ; J[ si au moins 10, sinon le repère par défaut. `saison` : seasonOf(league, J) au magasin, l'année
 * de début du libellé football-data (« 2021-22 » → 2021).
 */
export class ReperesCourants {
  constructor() {
    this.ligues = new Map();
  }

  ajouterJournee(league, date, contributions, { saison }) {
    const v = new Float64Array(NB_CHAMPS);
    for (const c of contributions) for (let k = 0; k < NB_CHAMPS; k++) v[k] += c[k];
    let g = this.ligues.get(league);
    if (!g) this.ligues.set(league, (g = { tout: new Cumuls(), saisons: new Map() }));
    g.tout.ajouter(date, v);
    let s = g.saisons.get(saison);
    if (!s) g.saisons.set(saison, (s = new Cumuls()));
    s.ajouter(date, v);
  }

  avant(league, J, { saison }) {
    const g = this.ligues.get(league);
    if (!g) return REPERE_PAR_DEFAUT;
    const s = g.saisons.get(saison);
    if (s) {
      const v = s.somme(0, s.avant(J));
      if (v[I.n] >= SEUILS_DU_REPERE.saison) return lireRepere(v, 'courant:saison');
    }
    const v = g.tout.somme(g.tout.avant(joursAvant(J, SEUILS_DU_REPERE.jours)), g.tout.avant(J));
    if (v[I.n] >= SEUILS_DU_REPERE.an) return lireRepere(v, 'courant:365');
    return REPERE_PAR_DEFAUT;
  }
}

function lireRepere(v, source) {
  const n = v[I.n];
  const parts = { home: v[I.v1] / n, draw: v[I.vN] / n, away: v[I.v2] / n, plus: {}, btts: v[I.btts] / n, domPlus: {}, extPlus: {} };
  LIGNES.forEach((l, k) => {
    parts.plus[l] = v[I.plus + k] / n;
    parts.domPlus[l] = v[I.dom + k] / n;
    parts.extPlus[l] = v[I.ext + k] / n;
  });
  const stats = {};
  STATS.forEach((kind, k) => {
    const ns = v[I.stats + 3 * k];
    stats[kind] = ns >= SEUILS_DU_REPERE.an ? { n: ns, home: v[I.stats + 3 * k + 1] / ns, away: v[I.stats + 3 * k + 2] / ns, parEquipe: (v[I.stats + 3 * k + 1] + v[I.stats + 3 * k + 2]) / (2 * ns) } : null;
  });
  return { n, source, goals: { home: v[I.bd] / n, away: v[I.be] / n }, parts, stats };
}

/**
 * Les distributions du repère pour chaque ligne de marché — ce que donnerait le championnat seul, avant J :
 * fréquences (1N2, +X, les deux marquent, buts par équipe), produit 1N2 × +X (combiné), grille de Dixon-Coles
 * aux buts moyens (score exact), binomiale négative à la moyenne du championnat avec le facteur de terrain
 * et la dispersion du moteur (statExpectations et STAT_KINDS, appelés tels quels).
 */
export function distributionsDuRepere(rep) {
  const p = rep.parts;
  const binaire = (x) => ({ over: x, under: 1 - x });
  const out = {
    result: { home: p.home, draw: p.draw, away: p.away },
    totalGoals: Object.fromEntries(LIGNES.map((l) => [l, binaire(p.plus[l])])),
    bothTeamsScore: { yes: p.btts, no: 1 - p.btts },
    teamGoals: { home: Object.fromEntries(LIGNES.map((l) => [l, binaire(p.domPlus[l])])), away: Object.fromEntries(LIGNES.map((l) => [l, binaire(p.extPlus[l])])) },
    resultAndTotal: Object.fromEntries(
      LIGNES.map((l) => [l, { homeOver: p.home * p.plus[l], homeUnder: p.home * (1 - p.plus[l]), drawOver: p.draw * p.plus[l], drawUnder: p.draw * (1 - p.plus[l]), awayOver: p.away * p.plus[l], awayUnder: p.away * (1 - p.plus[l]) }])
    ),
    scoreExact: rep.source === 'defaut' ? GRILLE_PAR_DEFAUT.map((c) => c.p) : matrice(Math.max(0.05, rep.goals.home), Math.max(0.05, rep.goals.away), RHO_DU_REPERE).map((c) => c.p),
    stats: {}
  };
  for (const kind of STATS) {
    const s = rep.stats?.[kind];
    if (!s || !(s.parEquipe > 0)) {
      out.stats[kind] = null;
      continue;
    }
    const e = statExpectations({ statInputs: { home: { [kind]: { for: s.parEquipe, against: s.parEquipe } }, away: { [kind]: { for: s.parEquipe, against: s.parEquipe } } } })?.[kind];
    out.stats[kind] = e ? { total: e.total, home: e.home, away: e.away } : null;
  }
  return out;
}

/** La loi d'un compte pour la perte log (A18) : N = max(41, ⌈4 × attendu⌉) cases, puis la queue. */
export function loiDuCompte(mu, invK) {
  if (!(mu > 0)) return null;
  return loiDesComptes(mu, invK, Math.max(41, Math.ceil(4 * mu)));
}
export const dispersionDe = (kind, portee) => (portee === 'total' ? STAT_KINDS[kind].invKTotal : STAT_KINDS[kind].invKTeam);
