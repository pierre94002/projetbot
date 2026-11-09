/**
 * lectureDesDebuts.js — CE QUE L'ÉTAPE 35 LIT du magasin et de football-data (lot 1a, 09/11/2026).
 * -----------------------------------------------------------------------
 * Lit la base de l'APPELANT (jamais ouverte ici), n'y écrit jamais. Trois formes de lecture, chacune dans l'ordre (jour, clé) :
 *   - SANS RÉSULTAT (les comptes, AVANT le regard) : le registre du jour J et les drapeaux de la table du jour J (attribué,
 *     prolongation, compté, coupe) et la seule PRÉSENCE d'un score à la 90e ; les minutes des joueurs (la continuité en
 *     dépend). Jamais un score, un but, un xG, une cote ;
 *   - AVEC LES RÉSULTATS (le banc, la nuit) : la ligne du camp qui reçoit pour les forces (buts, buts à la 90e, xG), comme
 *     forcesButs.faitsDeTeamDay ;
 *   - FOOTBALL-DATA : les 22 divisions (NIVEAUX_FD), clubs par fd_teams.id (identité dans son pays), saison = libellé du
 *     fichier, les buts (des championnats : le score des 90 minutes ; aucun xG), par faitsDepuisFd (dayTable.js).
 * Le 1N2 d'avant-match football-data (« 1N2 seul », RAPPORTÉ sans verdict) : prixFd puis lectureDirecte (bench/prix.js),
 * importés, jamais modifiés ; aucune colonne de clôture.
 * Les clubs et les joueurs sont des NUMÉROS (team_day, player_day : numeroFotmob à la construction) ; l'identifiant 0 n'entre
 * jamais ; aucun nom n'est lu.
 * -----------------------------------------------------------------------
 */

import { faitsDepuisFd } from '../db/dayTable.js';
import { saisonEnNombre } from '../../core/engine/goalModel.js';
import { prixFd, lectureDirecte } from '../../bench/prix.js';
import { COLONNES_AVANT_MATCH } from '../../bench/periodes.js';
import { NIVEAUX_FD, ALIAS_FD } from './reglagesDebuts.js';

const vrai = (v) => v === true || v === 1;
const nombre = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** SANS RÉSULTAT : le registre, les drapeaux et la seule présence d'un score à la 90e (un match non prolongé en a toujours un). */
export const SQL_MAGASIN_COMPTES = `SELECT d.rencontre, d.match_key, d.date, d.league, d.saison, d.home, d.away,
  t.attribue, t.prolongation, t.compte, t.coupe,
  CASE WHEN t.prolongation = 0 OR (t.bp90 IS NOT NULL AND t.bc90 IS NOT NULL) THEN 1 ELSE 0 END AS a_score90
  FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  WHERE d.date <= ? ORDER BY d.date, d.match_key`;

/** AVEC LES RÉSULTATS : la ligne du camp qui reçoit (la forme de forcesButs.faitsDeTeamDay). */
export const SQL_MAGASIN_BANC = `SELECT d.rencontre, d.match_key, d.date, d.league, d.saison, d.home, d.away,
  t.club, t.adversaire, t.camp, t.attribue, t.prolongation, t.compte, t.coupe, t.bp, t.bc, t.bp90, t.bc90, t.xg_p, t.xg_c
  FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  WHERE d.date <= ? ORDER BY d.date, d.match_key`;

/** Les minutes des joueurs JOUÉES (joue = 1, minutes > 0, identifiant ≥ 1) jusqu'au jour donné : rien d'autre de la feuille. */
export const SQL_MINUTES = 'SELECT joueur, rencontre, club, minutes, poste FROM player_day WHERE joue = 1 AND minutes > 0 AND joueur >= 1 AND date <= ?';

/** Les buts à la 90e d'une ligne du camp qui reçoit (le score de la 120e n'est jamais pris pour celui de la 90e). */
export function butsA90(l) {
  const prolonge = vrai(l.prolongation);
  const d = prolonge ? nombre(l.bp90) : nombre(l.bp);
  const e = prolonge ? nombre(l.bc90) : nombre(l.bc);
  return d === null || e === null ? null : { dom: d, ext: e };
}

/** Les minutes des joueurs, rangées par rencontre (Map rencontre → [{ joueur, club, minutes, poste }]). */
export function minutesParRencontre(database, { jusqua }) {
  const out = new Map();
  for (const l of database.prepare(SQL_MINUTES).iterate(jusqua)) {
    let liste = out.get(l.rencontre);
    if (!liste) out.set(l.rencontre, (liste = []));
    liste.push({ joueur: l.joueur, club: l.club, minutes: l.minutes, poste: l.poste });
  }
  return out;
}

/**
 * LES RENCONTRES DU MAGASIN jusqu'au jour `jusqua` inclus, dans l'ordre (jour, clé). `avecResultats` : false pour les comptes
 * (ni score, ni but, ni xG : `faitDom` et `buts90` valent null, seule la présence d'un score à la 90e est gardée).
 * `minutes` : Map rencontre → lignes (minutesParRencontre), ou null.
 */
export function* rencontresDuMagasin({ database, jusqua, avecResultats, minutes = null }) {
  const sql = avecResultats ? SQL_MAGASIN_BANC : SQL_MAGASIN_COMPTES;
  for (const l of database.prepare(sql).iterate(jusqua)) {
    const buts90 = avecResultats ? butsA90(l) : null;
    yield {
      cle: l.match_key,
      rencontre: l.rencontre,
      date: String(l.date).slice(0, 10),
      league: l.league,
      saison: Number(l.saison),
      home: Number(l.home),
      away: Number(l.away),
      attribue: vrai(l.attribue),
      prolongation: vrai(l.prolongation),
      compte: vrai(l.compte),
      coupe: vrai(l.coupe),
      aScore90: avecResultats ? buts90 !== null : vrai(l.a_score90),
      buts90,
      faitDom: avecResultats
        ? { matchKey: l.match_key, club: l.club, adversaire: l.adversaire, camp: l.camp, date: l.date, league: l.league, saison: l.saison, attribue: l.attribue, prolongation: l.prolongation, compte: l.compte, coupe: l.coupe, bp: l.bp, bc: l.bc, bp90: l.bp90, bc90: l.bc90, xg_p: l.xg_p, xg_c: l.xg_c }
        : null,
      joueurs: minutes ? minutes.get(l.rencontre) ?? [] : null
    };
  }
}

/**
 * Une rencontre du REJEU DES FICHES de l'étape 30 (playerRatings.chargerLesRencontres) mise à la forme de la passe : la même
 * ligne du camp qui reçoit, les joueurs joués avec leurs minutes. `joueursDe` : la fonction de playerRatings.js.
 */
export function depuisLeRejeu(m, joueursDe) {
  const l = m.ligneDom;
  const buts90 = butsA90(l);
  return {
    cle: m.matchKey,
    rencontre: m.rencontre,
    date: String(m.date).slice(0, 10),
    league: m.league,
    saison: Number(m.saison),
    home: Number(m.home),
    away: Number(m.away),
    attribue: Boolean(m.attribue),
    prolongation: Boolean(m.prolongation),
    compte: Boolean(m.compte),
    coupe: Boolean(m.coupe),
    aScore90: buts90 !== null,
    buts90,
    faitDom: l,
    joueurs: joueursDe(m)
      .filter((j) => Number(j.minutes) > 0 && Number(j.joueur) >= 1)
      .map((j) => ({ joueur: Number(j.joueur), club: j.camp === 1 ? Number(m.home) : Number(m.away), minutes: Number(j.minutes), poste: j.poste ?? null }))
  };
}

// ======================================================= football-data

const CODES_FD = Object.keys(NIVEAUX_FD);
/** Les lignes football-data des 22 divisions entre deux jours : identité, buts (les buts seulement « avec résultats »), et l'avant-match (le 1N2 rapporté). */
export const sqlFd = (avecResultats) => `SELECT id, code, saison, date, date_fichier, dom, ext, lien${avecResultats ? `, bd, be, ${COLONNES_AVANT_MATCH.join(', ')}` : ''}
  FROM fd_history WHERE code IN (${CODES_FD.map((c) => `'${c}'`).join(', ')}) AND date >= ? AND date <= ? ORDER BY date, id`;

/** La clé d'une ligne football-data (celle du banc d'essai : cleDuFd de bench/entrees.js). */
export const cleDuFd = (l) => `fd:${l.code}|${l.date_fichier ?? l.date}|${Number(l.dom)}|${Number(l.ext)}`;

/**
 * Le numéro d'un club football-data une fois les identités corrigées (ALIAS_FD : un même club sous deux noms, réuni à la main,
 * par numéro et, au besoin, à partir d'un jour) ; tout autre numéro reste le sien.
 */
export function numeroFd(club, date) {
  const n = Number(club);
  const jour = String(date).slice(0, 10);
  for (const a of ALIAS_FD) if (a.de === n && (a.depuis === null || jour >= a.depuis)) return a.vers;
  return n;
}

/**
 * LES RENCONTRES FOOTBALL-DATA (des championnats : ni coupe, ni attribué, ni prolongation ; toutes comptées), dans l'ordre
 * (jour, id), à la forme de la passe ; `faitDom` = le fait du club qui reçoit de faitsDepuisFd (dayTable.js) ; avec les
 * résultats, `prix` = la ligne (le 1N2 d'avant-match, rapporté). Sans résultat : aucun but lu (la présence d'un score suffit :
 * fd_history n'a que des matchs joués). Les clubs : leurs numéros corrigés (numeroFd), dans les deux camps ET dans le fait
 * des forces ; la clé reste celle de la ligne (le banc d'essai de la 27).
 */
export function* rencontresFd({ database, de, a, avecResultats }) {
  for (const brute of database.prepare(sqlFd(avecResultats)).iterate(de, a)) {
    const l = { ...brute, dom: numeroFd(brute.dom, brute.date), ext: numeroFd(brute.ext, brute.date) };
    let faitDom = null;
    let buts90 = null;
    if (avecResultats) {
      faitDom = faitsDepuisFd([l], { fdTeams: null }).find((f) => f.home) ?? null;
      buts90 = nombre(l.bd) !== null && nombre(l.be) !== null ? { dom: Number(l.bd), ext: Number(l.be) } : null;
    }
    yield {
      cle: cleDuFd(brute),
      rencontre: l.id,
      date: String(l.date).slice(0, 10),
      league: l.code,
      saison: saisonEnNombre(l.saison),
      libelle: l.saison,
      home: Number(l.dom),
      away: Number(l.ext),
      attribue: false,
      prolongation: false,
      compte: true,
      coupe: false,
      aScore90: avecResultats ? buts90 !== null : true,
      buts90,
      faitDom,
      joueurs: null,
      prix1n2: avecResultats ? prix1n2Fd(l) : null
    };
  }
}

/** Le pays de chaque club football-data (fd_teams : l'identité est celle de son pays). */
export function paysDesClubsFd(database) {
  return new Map(database.prepare('SELECT id, pays FROM fd_teams').all().map((r) => [Number(r.id), r.pays]));
}

// ======================================================= le 1N2 d'avant-match (RAPPORTÉ, jamais jugé)

/** Le 1N2 juste d'avant-match d'une ligne football-data : [pH, pN, pA] (lecture directe de la moyenne, marge retirée), ou null. */
export function prix1n2Fd(ligne) {
  const p = prixFd(ligne, { jeu: 'fd-avant-match' });
  const d = p ? lectureDirecte(p) : null;
  return d ? [d.distribution.home, d.distribution.draw, d.distribution.away] : null;
}

/** Le 1N2 d'avant-match des rencontres du magasin rattachées à football-data (lien ≠ 0, la ligne de plus petit lien) : Map clé → [pH, pN, pA]. */
export function prix1n2DuMagasin(database) {
  const out = new Map();
  const sql = `SELECT match_key, lien, ${COLONNES_AVANT_MATCH.join(', ')} FROM fd_history WHERE match_key IS NOT NULL AND lien <> 0 ORDER BY match_key, lien, id`;
  for (const l of database.prepare(sql).iterate()) {
    if (out.has(l.match_key)) continue;
    const fair = prix1n2Fd(l);
    if (fair) out.set(l.match_key, fair);
  }
  return out;
}

/** Les dates de naissance de joueurs (player_birthdates : une mention à l'écran, jamais une fusion, jamais un chiffre). */
export function naissances(database, joueurs) {
  const out = new Map();
  const ids = [...new Set(joueurs)].filter((j) => Number.isSafeInteger(j) && j > 0);
  try {
    const st = database.prepare('SELECT player_id, birth_date FROM player_birthdates WHERE player_id = ?');
    for (const j of ids) {
      const r = st.get(`fotmob-${j}`);
      if (r?.birth_date) out.set(j, String(r.birth_date).slice(0, 10));
    }
  } catch (error) {
    if (!/no such (table|column)/i.test(String(error?.message ?? ''))) throw error;
  }
  return out;
}
