/**
 * lectureDesCartons.js — CE QUE LA PASSE DES CARTONS LIT DANS LE MAGASIN (étape 33 du plan, lot 1a, 02/11/2026).
 * -----------------------------------------------------------------------
 * Des lecteurs, sur la base de l'APPELANT (jamais ouverte ici ; au banc et la nuit : la base du processus à part, en
 * lecture seule). Aucune écriture, aucune horloge.
 *
 * LE CACHE `cartons_rencontres` (patron de lectureDuMagasin.js de l'étape 32) : par rencontre du registre du jour J, les
 * cartons de son déroulé (cartonsDuDeroule : par camp et joueur par joueur), sa ligne d'équipe (team_stats, jaunes et
 * rouges), le nom et le pays de l'arbitre (jamais ses moyennes FotMob), la raison FotMob (prolongation, attribué, annulé)
 * et le statut (statutDesCartons, sans la garde du jour J). Sa SIGNATURE (celle de teamStyle.signatureDe) dit quelles
 * rencontres relire. `jusqua` borne la lecture (le banc ne lit RIEN après le 23/09/2026).
 *
 * LE FLUX CHRONOLOGIQUE : day_matches × team_day (les deux camps : attribué, prolongation, coupe, corners, tirs et tirs
 * cadrés réalisés, fenêtres f10 du moteur) × le cache, dans l'ordre (jour, clé). Les clubs sont les identifiants FotMob
 * du registre (day_matches.home / away), jamais un nom.
 * -----------------------------------------------------------------------
 */

import { signatureDe } from '../db/teamStyle.js';
import { paireRelevee } from '../db/leagueBenchmarks.js';
import { VERSION_RENCONTRES } from './reglagesCartons.js';
import { cartonsDuDeroule, statutDesCartons, texteStable } from './formulesDesCartons.js';

const absente = (error) => /no such table/i.test(String(error?.message ?? ''));
const entierOuNull = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const RAISON_NON_JOUE = /^(cancelled|abandoned|postponed)$/;
const RAISON_PROLONGE = /^(afterextra|afterpenalties)$/;
const RAISON_ATTRIBUE = /^(awarded_win|id_reused)$/;

/** Les colonnes de `cartons_rencontres`, dans l'ordre (matchStatsDb.js, CARTONS_DDL). */
export const COLONNES_RENCONTRES = Object.freeze([
  'match_key', 'sig', 'present', 'complet',
  'j_dom', 'jr_dom', 'r_dom', 'inc_dom', 'hors_dom', 'a90_dom', 'rempl_dom', 'c_dom', 'un_dom', 'trois_dom',
  'j_ext', 'jr_ext', 'r_ext', 'inc_ext', 'hors_ext', 'a90_ext', 'rempl_ext', 'c_ext', 'un_ext', 'trois_ext',
  'ligne_j_dom', 'ligne_j_ext', 'ligne_r_dom', 'ligne_r_ext', 'statut', 'arbitre_nom', 'arbitre_pays', 'raison', 'attribue', 'version'
]);

/** Le cache tel qu'il est rangé : Map(match_key → ligne) (vide sans table). Générateur : un point d'arrêt toutes les 20 000 lignes. */
export function* lireLeCache(database) {
  const out = new Map();
  let k = 0;
  try {
    for (const r of database.prepare(`SELECT ${COLONNES_RENCONTRES.join(', ')} FROM cartons_rencontres`).iterate()) {
      out.set(r.match_key, { ...r });
      if (++k % 20_000 === 0) yield 'cache des cartons';
    }
  } catch (error) {
    if (!absente(error)) throw error;
  }
  return out;
}

/** Les signatures des rencontres du registre jusqu'au jour `jusqua` inclus : Map(match_key → signature). */
export function* lireLesSignatures(database, { jusqua = '9999-12-31' } = {}) {
  const out = new Map();
  let k = 0;
  for (const m of database
    .prepare('SELECT m.match_key, m.date, m.league, m.home_id, m.away_id, m.updated_at FROM day_matches d JOIN matches m ON m.match_key = d.match_key WHERE d.date <= ?')
    .iterate(jusqua)) {
    out.set(m.match_key, signatureDe(m));
    if (++k % 20_000 === 0) yield 'signatures';
  }
  return out;
}

/**
 * La ligne du cache d'une rencontre relue (pur) : `r` = { match_key, events (texte JSON ou liste), arbitre_nom,
 * arbitre_pays, raison, awarded, jh, ja, rh, ra (team_stats) }.
 */
export function ligneDuCache(r, sig) {
  let events = null;
  if (typeof r.events === 'string' && r.events) {
    try {
      events = JSON.parse(r.events);
    } catch {
      events = null;
    }
  } else if (Array.isArray(r.events)) events = r.events;
  const d = cartonsDuDeroule(events);
  const raison = texteStable(typeof r.raison === 'string' ? r.raison : null);
  const attribue = r.awarded === 1 || r.awarded === true || r.awarded === 'true' || RAISON_ATTRIBUE.test(raison ?? '');
  const ligne = { jDom: entierOuNull(r.jh), jExt: entierOuNull(r.ja), rDom: entierOuNull(r.rh), rExt: entierOuNull(r.ra) };
  const s = statutDesCartons({ deroule: d, ligne, attribue, prolongation: RAISON_PROLONGE.test(raison ?? ''), nonJoue: RAISON_NON_JOUE.test(raison ?? '') });
  const camp = (c) => [c.jaunes, c.deuxiemesJaunes, c.rouges, c.inconnus, c.horsTerrain, c.apres90, c.remplacements, c.cartons, c.un, c.trois];
  const [jd, jrd, rd, incd, hd, ad, rpd, cd, ud, td] = camp(d.home);
  const [je, jre, re, ince, he, ae, rpe, ce, ue, te] = camp(d.away);
  return {
    match_key: r.match_key,
    sig,
    present: d.present ? 1 : 0,
    complet: d.complet ? 1 : 0,
    j_dom: jd, jr_dom: jrd, r_dom: rd, inc_dom: incd, hors_dom: hd, a90_dom: ad, rempl_dom: rpd, c_dom: cd, un_dom: ud, trois_dom: td,
    j_ext: je, jr_ext: jre, r_ext: re, inc_ext: ince, hors_ext: he, a90_ext: ae, rempl_ext: rpe, c_ext: ce, un_ext: ue, trois_ext: te,
    ligne_j_dom: ligne.jDom, ligne_j_ext: ligne.jExt, ligne_r_dom: ligne.rDom, ligne_r_ext: ligne.rExt,
    statut: s.statut,
    arbitre_nom: texteStable(r.arbitre_nom),
    arbitre_pays: texteStable(r.arbitre_pays),
    raison,
    attribue: attribue ? 1 : 0,
    version: VERSION_RENCONTRES
  };
}

/** Le déroulé résumé d'une ligne du cache (la forme de cartonsDuDeroule). */
export function derouleDuCache(c) {
  const camp = (s) => {
    const x = {
      jaunes: c[`j_${s}`], deuxiemesJaunes: c[`jr_${s}`], rouges: c[`r_${s}`], inconnus: c[`inc_${s}`], horsTerrain: c[`hors_${s}`],
      apres90: c[`a90_${s}`], remplacements: c[`rempl_${s}`], cartons: c[`c_${s}`], un: c[`un_${s}`], trois: c[`trois_${s}`]
    };
    x.ligne = x.jaunes + x.rouges;
    return x;
  };
  return { present: Boolean(c.present), complet: Boolean(c.complet), home: camp('dom'), away: camp('ext') };
}

const SQL_RELIRE = `SELECT m.match_key, m.events, json_extract(m.meta, '$.referee.name') AS arbitre_nom,
  json_extract(m.meta, '$.referee.country') AS arbitre_pays, json_extract(m.meta, '$.reason') AS raison,
  json_extract(m.meta, '$.awarded') AS awarded,
  h.yellow_cards AS jh, h.red_cards AS rh, a.yellow_cards AS ja, a.red_cards AS ra
  FROM matches m
  LEFT JOIN team_stats h ON h.match_key = m.match_key AND h.side = 'home'
  LEFT JOIN team_stats a ON a.match_key = m.match_key AND a.side = 'away'
  WHERE m.match_key = ?`;

/** Les rencontres `cles` relues EN ENTIER (déroulé, meta par json_extract, team_stats) : [lignes du cache]. Générateur. */
export function* relireLesRencontres(database, cles, signatures) {
  const out = [];
  const st = database.prepare(SQL_RELIRE);
  let k = 0;
  for (const cle of cles) {
    const r = st.get(cle);
    if (r) out.push(ligneDuCache(r, signatures.get(cle) ?? ''));
    if (++k % 500 === 0) yield 'relecture des déroulés';
  }
  return out;
}

/**
 * LE CACHE MIS À JOUR (en mémoire ; l'écriture est celle du serveur) : les signatures comparées au cache — les
 * rencontres nouvelles ou changées relues, les disparues retirées ; `force` (ou une autre version des lignes) : tout est
 * relu. `jusqua` : seules les rencontres jusqu'à ce jour (le banc). Rend { cache, aEcrire, aRetirer, relues, mode }.
 */
export function* mettreAJourLeCache(database, { force = false, jusqua = '9999-12-31' } = {}) {
  const ancien = yield* lireLeCache(database);
  const signatures = yield* lireLesSignatures(database, { jusqua });
  const toutRelire = force || [...ancien.values()].some((l) => l.version !== VERSION_RENCONTRES);
  const aRelire = [];
  for (const [cle, sig] of signatures) {
    const c = ancien.get(cle);
    if (toutRelire || !c || c.sig !== sig) aRelire.push(cle);
  }
  const aRetirer = jusqua === '9999-12-31' ? [...ancien.keys()].filter((cle) => !signatures.has(cle)) : [];
  const aEcrire = yield* relireLesRencontres(database, aRelire, signatures);
  const cache = new Map(ancien);
  for (const cle of aRetirer) cache.delete(cle);
  for (const l of aEcrire) cache.set(l.match_key, l);
  const mode = !ancien.size ? 'premier' : toutRelire ? 'complet' : aRelire.length || aRetirer.length ? 'incremental' : 'rien';
  return { cache, aEcrire, aRetirer, relues: aRelire.length, mode };
}

const STATS = Object.freeze([['corners', 'corners'], ['tirs', 'tirs'], ['cadres', 'cadres']]);
const MINIMUM_FENETRE = 6;

/** Les statistiques d'un match pour les réglages par championnat (pur) : réalisé (paireRelevee) et attendus NEUTRES du moteur. */
export function statsDuMatch(l) {
  const out = {};
  for (const [s, col] of STATS) {
    const x = paireRelevee(l[`h_${col}_p`], l[`h_${col}_c`]);
    const nh = entierOuNull(l[`h_f10_${col}_n`]);
    const na = entierOuNull(l[`a_f10_${col}_n`]);
    let neutres = null;
    if (nh !== null && na !== null && nh >= MINIMUM_FENETRE && na >= MINIMUM_FENETRE) {
      const h = { for: l[`h_f10_${col}_p`] / nh, against: l[`h_f10_${col}_c`] / nh };
      const a = { for: l[`a_f10_${col}_p`] / na, against: l[`a_f10_${col}_c`] / na };
      neutres = { home: (h.for + a.against) / 2, away: (a.for + h.against) / 2 };
    }
    out[s] = { x: x ? { home: x[0], away: x[1] } : null, neutres };
  }
  return out;
}

/** Une rencontre du flux (pure), depuis la ligne du flux et sa ligne du cache (null : rencontre jamais relue → non relevée). */
export function rencontreDuFlux(l, c) {
  const attribue = Boolean(Number(l.attribue)) || Boolean(c && Number(c.attribue));
  const prolongation = Boolean(Number(l.prolongation)) || RAISON_PROLONGE.test(c?.raison ?? '');
  const nonJoue = RAISON_NON_JOUE.test(c?.raison ?? '');
  const deroule = c ? derouleDuCache(c) : cartonsDuDeroule(null);
  const ligne = c ? { jDom: c.ligne_j_dom, jExt: c.ligne_j_ext, rDom: c.ligne_r_dom, rExt: c.ligne_r_ext } : null;
  const s = statutDesCartons({ deroule, ligne, attribue, prolongation, nonJoue });
  return {
    matchKey: l.match_key,
    fotmobId: l.fotmob_id ?? null,
    date: l.date,
    league: l.league,
    saison: l.saison ?? null,
    coupe: Boolean(Number(l.coupe)),
    home: Number(l.home),
    away: Number(l.away),
    attribue,
    prolongation,
    nonJoue,
    statutBase: s.statut,
    valeur: s.valeur,
    conventions: s.conventions,
    ecart: s.ecart,
    deroule: { horsTerrain: deroule.home.horsTerrain + deroule.away.horsTerrain, apres90: deroule.home.apres90 + deroule.away.apres90, deuxiemesJaunes: deroule.home.deuxiemesJaunes + deroule.away.deuxiemesJaunes, ligneDom: deroule.home.ligne, ligneExt: deroule.away.ligne, jaunesDom: deroule.home.jaunes, jaunesExt: deroule.away.jaunes, jrDom: deroule.home.deuxiemesJaunes, jrExt: deroule.away.deuxiemesJaunes },
    ligne,
    arbitre: c?.arbitre_nom ? { nom: c.arbitre_nom, pays: c.arbitre_pays ?? '' } : null,
    stats: statsDuMatch(l)
  };
}

const COLS_EQUIPE = (p) => ['corners', 'tirs', 'cadres'].flatMap((s) => [`${p}.f10_${s}_p AS ${p}_f10_${s}_p`, `${p}.f10_${s}_c AS ${p}_f10_${s}_c`, `${p}.f10_${s}_n AS ${p}_f10_${s}_n`]).join(', ');
const SQL_FLUX = `SELECT d.match_key, d.fotmob_id, d.date, d.league, d.saison, d.home, d.away,
  h.attribue, h.prolongation, h.coupe,
  h.corners_p AS h_corners_p, h.corners_c AS h_corners_c, h.tirs_p AS h_tirs_p, h.tirs_c AS h_tirs_c, h.cadres_p AS h_cadres_p, h.cadres_c AS h_cadres_c,
  ${COLS_EQUIPE('h')}, ${COLS_EQUIPE('a')}
  FROM day_matches d
  JOIN team_day h ON h.rencontre = d.rencontre AND h.camp = 1
  LEFT JOIN team_day a ON a.rencontre = d.rencontre AND a.camp = 0
  WHERE d.date >= ? AND d.date <= ?
  ORDER BY d.date, d.match_key`;

/**
 * LE FLUX CHRONOLOGIQUE des rencontres du registre du jour J, du jour `depuis` au jour `jusqua` inclus, dans l'ordre
 * (jour, clé) — chaque rencontre complétée par le cache (`cache` : Map de mettreAJourLeCache ; sans elle, la table lue
 * telle quelle). Itérateur de rencontres (rencontreDuFlux).
 */
export function* rencontresChronologiques({ database, cache = null, depuis = '0000-01-01', jusqua = '9999-12-31' }) {
  let parCle = cache;
  if (!parCle) {
    parCle = new Map();
    try {
      for (const r of database.prepare(`SELECT ${COLONNES_RENCONTRES.join(', ')} FROM cartons_rencontres`).iterate()) parCle.set(r.match_key, r);
    } catch (error) {
      if (!absente(error)) throw error;
    }
  }
  const st = database.prepare(SQL_FLUX);
  for (const l of st.iterate(String(depuis).slice(0, 10), String(jusqua).slice(0, 10))) yield rencontreDuFlux(l, parCle.get(l.match_key) ?? null);
}
