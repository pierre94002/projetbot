/**
 * lectureDesJoueurs.js — LE FLUX DES RENCONTRES ET DE LEURS FEUILLES, POUR LES CHIFFRES DES JOUEURS (étape 34, lot 1a, 03/11/2026).
 * -----------------------------------------------------------------------
 * Générateurs ; la base est celle de l'APPELANT (ouverte en lecture seule par le processus à part) ; aucune écriture,
 * aucune horloge, aucun réseau. Le flux, dans l'ordre (jour, clé) :
 *   day_matches (le registre du jour J) × team_day des deux camps (attribué, prolongation, score, fenêtres f10 des tirs
 *   cadrés, la ligne du camp qui reçoit pour les forces) × matches (déroulé, score) × team_stats (tirs cadrés d'équipe)
 *   × les lignes `players` de la rencontre (fusion par la clé, les deux flux triés de même).
 * Les identifiants (joueurs du déroulé et des feuilles) passent par people_merges (lu une fois), puis numeroFotmob
 * (« fotmob-N » → N ; mal formé → sans identifiant). JAMAIS lus : players.shots (il oublie les tirs contrés), les cartons
 * des lignes joueur (players.yellow_cards, player_day), le NOM du passeur du déroulé (seule sa présence est gardée :
 * avecPasseur), la carte des tirs, les noms des joueurs.
 * Les tirs cadrés attendus de l'équipe (S) : la formule du moteur (statExpectations) sur les fenêtres f10 de team_day
 * (au moins 6 matchs de chaque côté), à l'octet.
 * -----------------------------------------------------------------------
 */

import { numeroFotmob } from '../db/dayTable.js';
import { statExpectations } from '../../sports/football/statMarkets.js';
import { posteDe, nombre } from './formulesDesJoueurs.js';

const MINIMUM_FENETRE = 6;
const absente = (error) => /no such table/i.test(String(error?.message ?? ''));

/** Les fusions d'identité (people_merges) : Map(from → to), résolues de proche en proche (boucle gardée). */
export function fusions(database) {
  const brut = new Map();
  try {
    for (const r of database.prepare('SELECT from_id, to_id FROM people_merges').all()) brut.set(String(r.from_id), String(r.to_id));
  } catch (error) {
    if (!absente(error)) throw error;
  }
  const out = new Map();
  for (const de of brut.keys()) {
    let vers = brut.get(de);
    const vus = new Set([de]);
    while (brut.has(vers) && !vus.has(vers)) {
      vus.add(vers);
      vers = brut.get(vers);
    }
    out.set(de, vers);
  }
  return out;
}

/** Un identifiant FotMob après les fusions, en nombre ; null s'il manque ou s'il est mal formé (jamais un nom). */
export function numeroApresFusion(id, parFusion) {
  if (id === null || id === undefined || id === '') return null;
  const brut = String(id);
  const final = parFusion?.get(brut) ?? brut;
  try {
    return numeroFotmob(final);
  } catch {
    return null;
  }
}

/** Le déroulé normalisé : buts, cartons, penalties manqués (remplacements gardés pour la forme), identifiants fusionnés. */
export function derouleNormalise(events, parFusion) {
  let brut = events;
  if (typeof brut === 'string') {
    try {
      brut = JSON.parse(brut);
    } catch {
      brut = null;
    }
  }
  if (!Array.isArray(brut)) return [];
  const out = [];
  for (const e of brut) {
    const type = String(e?.type ?? '').toLowerCase();
    if (!['goal', 'card', 'missedpenalty', 'substitution'].includes(type)) continue;
    const side = e.side === 'home' ? 'home' : e.side === 'away' ? 'away' : null;
    if (!side) continue;
    const x = { type, side, minute: nombre(e.minute), addedTime: nombre(e.addedTime) };
    if (type === 'goal' || type === 'card' || type === 'missedpenalty') x.playerId = numeroApresFusion(e.playerId, parFusion);
    if (type === 'goal') {
      x.ownGoal = e.ownGoal === true;
      x.penalty = !x.ownGoal && (e.penalty === true || String(e.detail ?? '').trim().toLowerCase() === 'penalty');
      x.avecPasseur = typeof e.assist === 'string' && e.assist.trim() !== '';
    }
    if (type === 'card') {
      x.card = String(e.card ?? 'yellow').toLowerCase();
      x.notOnPitch = e.notOnPitch === true || String(e.note ?? '').toLowerCase() === 'not_on_pitch';
    }
    out.push(x);
  }
  return out;
}

/** Une ligne `players` normalisée (identifiant fusionné en nombre ; poste en code ; jamais `shots`). */
export function ligneNormalisee(p, parFusion) {
  return {
    id: numeroApresFusion(p.player_id, parFusion),
    titulaire: Number(p.starter) === 1,
    entre: Number(p.subbed_in) === 1,
    poste: posteDe(p.position),
    minutes: nombre(p.minutes),
    xg: nombre(p.xg),
    xgnp: nombre(p.xg_non_penalty),
    shotsOnTarget: nombre(p.shots_on_target),
    assists: nombre(p.assists),
    xa: nombre(p.xa),
    rating: nombre(p.rating),
    touches: nombre(p.touches),
    passes: nombre(p.passes)
  };
}

/** Les tirs cadrés attendus de l'équipe (S) : statExpectations sur les fenêtres f10 (6 matchs au moins de chaque côté) ; null sinon. */
export function cadresAttendus(l) {
  const hn = nombre(l.h_f10_cadres_n);
  const an = nombre(l.a_f10_cadres_n);
  if (hn === null || an === null || hn < MINIMUM_FENETRE || an < MINIMUM_FENETRE) return null;
  const s = statExpectations({
    statInputs: {
      home: { shotsOnTarget: { for: l.h_f10_cadres_p / hn, against: l.h_f10_cadres_c / hn } },
      away: { shotsOnTarget: { for: l.a_f10_cadres_p / an, against: l.a_f10_cadres_c / an } }
    }
  });
  return s?.shotsOnTarget ? { home: s.shotsOnTarget.home, away: s.shotsOnTarget.away } : null;
}

const SQL_RENCONTRES = `SELECT d.match_key, d.fotmob_id, d.date, d.league, d.saison, d.home, d.away,
  h.club, h.adversaire, h.camp, h.attribue, h.prolongation, h.compte, h.coupe, h.bp, h.bc, h.bp90, h.bc90, h.xg_p, h.xg_c,
  h.f10_cadres_p AS h_f10_cadres_p, h.f10_cadres_c AS h_f10_cadres_c, h.f10_cadres_n AS h_f10_cadres_n,
  a.f10_cadres_p AS a_f10_cadres_p, a.f10_cadres_c AS a_f10_cadres_c, a.f10_cadres_n AS a_f10_cadres_n,
  m.home_goals, m.away_goals, m.events, sh.shots_on_goal AS cadres_dom, sa.shots_on_goal AS cadres_ext
  FROM day_matches d
  JOIN team_day h ON h.rencontre = d.rencontre AND h.camp = 1
  LEFT JOIN team_day a ON a.rencontre = d.rencontre AND a.camp = 0
  LEFT JOIN matches m ON m.match_key = d.match_key
  LEFT JOIN team_stats sh ON sh.match_key = d.match_key AND sh.side = 'home'
  LEFT JOIN team_stats sa ON sa.match_key = d.match_key AND sa.side = 'away'
  WHERE d.date >= ? AND d.date <= ?
  ORDER BY d.date, d.match_key`;

const SQL_FEUILLES = `SELECT d.date AS jour_de_la_rencontre, p.match_key, p.side, p.player_id, p.position, p.starter, p.subbed_in, p.minutes, p.xg, p.xg_non_penalty,
  p.shots_on_target, p.assists, p.xa, p.rating, p.touches, p.passes
  FROM day_matches d JOIN team_day h ON h.rencontre = d.rencontre AND h.camp = 1
  JOIN players p ON p.match_key = d.match_key
  WHERE d.date >= ? AND d.date <= ?
  ORDER BY d.date, d.match_key, p.side, p.ord, p.player_key`;

/** La rencontre normalisée (pure) depuis la ligne du flux, ses lignes `players` et les fusions. */
export function rencontreNormalisee(l, feuilles, parFusion) {
  const joue = nombre(l.home_goals) !== null && nombre(l.away_goals) !== null;
  const lignes = { home: [], away: [] };
  for (const p of feuilles) if (p.side === 'home' || p.side === 'away') lignes[p.side].push(ligneNormalisee(p, parFusion));
  const S = cadresAttendus(l);
  return {
    matchKey: l.match_key,
    fotmobId: l.fotmob_id ?? null,
    date: l.date,
    league: l.league,
    saison: l.saison ?? null,
    coupe: Boolean(Number(l.coupe)),
    home: Number(l.home),
    away: Number(l.away),
    attribue: Boolean(Number(l.attribue)),
    prolongation: Boolean(Number(l.prolongation)),
    joue,
    evenements: derouleNormalise(l.events, parFusion),
    camps: {
      home: { club: Number(l.home), buts: nombre(l.bp), buts90: nombre(l.bp90) ?? nombre(l.bp), cadresDEquipe: nombre(l.cadres_dom), cadresAttendus: S?.home ?? null, lignes: lignes.home },
      away: { club: Number(l.away), buts: nombre(l.bc), buts90: nombre(l.bc90) ?? nombre(l.bc), cadresDEquipe: nombre(l.cadres_ext), cadresAttendus: S?.away ?? null, lignes: lignes.away }
    },
    // La ligne du camp qui reçoit, pour les forces (faitsDeLaRencontre de goalModel.js, comme passeDuBanc de la 32).
    fait: { matchKey: l.match_key, club: l.club, adversaire: l.adversaire, camp: l.camp, date: l.date, league: l.league, saison: l.saison, attribue: l.attribue, prolongation: l.prolongation, compte: l.compte, coupe: l.coupe, bp: l.bp, bc: l.bc, bp90: l.bp90, bc90: l.bc90, xg_p: l.xg_p, xg_c: l.xg_c }
  };
}

/**
 * LE FLUX CHRONOLOGIQUE, du jour `depuis` au jour `jusqua` inclus, ordre (jour, clé) : itérateur de rencontres
 * normalisées (rencontreNormalisee). Deux lectures triées de même (les rencontres, les feuilles), fusionnées par la clé.
 */
export function* rencontresChronologiques({ database, depuis = '0000-01-01', jusqua = '9999-12-31', parFusion = fusions(database) }) {
  const de = String(depuis).slice(0, 10);
  const a = String(jusqua).slice(0, 10);
  const itFeuilles = database.prepare(SQL_FEUILLES).iterate(de, a);
  let suivante = itFeuilles.next();
  for (const l of database.prepare(SQL_RENCONTRES).iterate(de, a)) {
    const feuilles = [];
    // Les deux lectures ont le même registre (day_matches × team_day du camp qui reçoit) et le même ordre (jour, clé) ;
    // une feuille d'un rang antérieur (impossible, par construction) serait sautée.
    while (!suivante.done && avant(suivante.value, l)) suivante = itFeuilles.next();
    while (!suivante.done && suivante.value.match_key === l.match_key) {
      feuilles.push(suivante.value);
      suivante = itFeuilles.next();
    }
    yield rencontreNormalisee(l, feuilles, parFusion);
  }
  if (typeof itFeuilles.return === 'function') itFeuilles.return();
}

/** Une ligne de feuille vient-elle avant la rencontre `l` dans l'ordre (jour, clé) ? */
const avant = (p, l) => p.jour_de_la_rencontre < l.date || (p.jour_de_la_rencontre === l.date && p.match_key < l.match_key);
