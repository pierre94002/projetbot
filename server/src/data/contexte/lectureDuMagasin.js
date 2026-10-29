/**
 * lectureDuMagasin.js — CE QUE LA PASSE DU CONTEXTE LIT DANS LE MAGASIN (étape 32 du plan, lot 1a, 29/10/2026).
 * -----------------------------------------------------------------------
 * Des lecteurs, sur la base de l'APPELANT (jamais ouverte ici ; dans la nuit : la base du processus à part, en lecture
 * seule). Aucune écriture.
 *
 * LA LECTURE INCRÉMENTALE (constat 11 de la critique) : `matches` est une table sans rowid où `meta` est rangée APRÈS le
 * déroulé et les compositions — lire `meta` des ~60 000 rencontres chaque nuit, c'est relire presque tout le magasin.
 * Le cache `contexte_rencontres` garde, par rencontre du registre du jour J, ce que la fiche lit dans `meta` (coup
 * d'envoi, stade, pelouse, nom et pays de l'arbitre — jamais ses moyennes FotMob, jamais la météo) et les penalties
 * marqués du déroulé ; sa SIGNATURE (celle de teamStyle.js : relu, autres clubs, autre championnat, autre date) dit
 * quelles rencontres relire. La passe de la nuit ne lit ensuite que ce cache, le registre (day_matches), la table du jour
 * J (team_day : cartons, fautes, buts à la 90e, attribué, prolongation), les moyennes des championnats au jour J
 * (league_day) et les entraîneurs (team_style_matches, le cache de l'étape 37).
 * -----------------------------------------------------------------------
 */

import { signatureDe } from '../db/teamStyle.js';
import { valeursDUneRencontre, cartonsReleves, paireRelevee } from '../db/leagueBenchmarks.js';
import { moyennesDeLaLigne } from '../db/dayTable.js';
import { VERSION_RENCONTRES } from './reglagesContexte.js';
import { texteStable, jourDe } from './formulesDuContexte.js';

const absente = (error) => /no such table/i.test(String(error?.message ?? ''));
const isoOuNull = (x) => (typeof x === 'string' && Number.isFinite(Date.parse(x)) ? new Date(Date.parse(x)).toISOString() : null);
const entierOuNull = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

/** Les colonnes de `contexte_rencontres`, dans l'ordre. */
export const COLONNES_RENCONTRES = Object.freeze(['match_key', 'sig', 'kickoff', 'stade', 'surface', 'arbitre_nom', 'arbitre_pays', 'penalties', 'version']);

/** Le cache tel qu'il est rangé : Map(match_key → ligne) (vide sans table). Générateur : un point d'arrêt toutes les 20 000 lignes. */
export function* lireLeCache(database) {
  const out = new Map();
  let k = 0;
  try {
    for (const r of database.prepare(`SELECT ${COLONNES_RENCONTRES.join(', ')} FROM contexte_rencontres`).iterate()) {
      out.set(r.match_key, { ...r });
      if (++k % 20_000 === 0) yield 'cache des rencontres';
    }
  } catch (error) {
    if (!absente(error)) throw error;
  }
  return out;
}

/** Les signatures des rencontres du registre du jour J (colonnes courtes de `matches` seulement) : Map(match_key → signature). */
export function* lireLesSignatures(database) {
  const out = new Map();
  let k = 0;
  for (const m of database
    .prepare('SELECT m.match_key, m.date, m.league, m.home_id, m.away_id, m.updated_at FROM day_matches d JOIN matches m ON m.match_key = d.match_key')
    .iterate()) {
    out.set(m.match_key, signatureDe(m));
    if (++k % 20_000 === 0) yield 'signatures';
  }
  return out;
}

/**
 * La ligne du cache d'une rencontre relue (pur) : `r` = { match_key, kickoff, stade, surface, arbitre_nom, arbitre_pays,
 * home_goals, away_goals, events (texte JSON) } ; les penalties marqués par la règle de leagueBenchmarks
 * (valeursDUneRencontre : seulement quand le déroulé a tous les buts du score, sinon null — jamais 0).
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
  const joue = entierOuNull(r.home_goals) !== null && entierOuNull(r.away_goals) !== null;
  const penalties = joue && Array.isArray(events) ? valeursDUneRencontre({ homeGoals: r.home_goals, awayGoals: r.away_goals, events }).penalties : null;
  return {
    match_key: r.match_key,
    sig,
    kickoff: isoOuNull(r.kickoff),
    stade: texteStable(r.stade),
    surface: texteStable(r.surface),
    arbitre_nom: texteStable(r.arbitre_nom),
    arbitre_pays: texteStable(r.arbitre_pays),
    penalties: Number.isInteger(penalties) ? penalties : null,
    version: VERSION_RENCONTRES
  };
}

const SQL_RELIRE = `SELECT match_key, json_extract(meta, '$.kickoff') AS kickoff, json_extract(meta, '$.stadium') AS stade,
  json_extract(meta, '$.surface') AS surface, json_extract(meta, '$.referee.name') AS arbitre_nom,
  json_extract(meta, '$.referee.country') AS arbitre_pays, home_goals, away_goals, events
  FROM matches WHERE match_key = ?`;

/** Les rencontres `cles` relues EN ENTIER (meta par json_extract, déroulé) : [lignes du cache]. Générateur. */
export function* relireLesRencontres(database, cles, signatures) {
  const out = [];
  const st = database.prepare(SQL_RELIRE);
  let k = 0;
  for (const cle of cles) {
    const r = st.get(cle);
    if (r) out.push(ligneDuCache(r, signatures.get(cle) ?? ''));
    if (++k % 500 === 0) yield 'relecture des rencontres';
  }
  return out;
}

/**
 * LE CACHE MIS À JOUR (en mémoire ; l'écriture est celle du serveur) : les signatures comparées au cache — les
 * rencontres nouvelles ou changées relues, les disparues retirées ; `force` (ou une autre version des lignes) : tout est
 * relu. Rend { cache: Map à jour, aEcrire: [lignes], aRetirer: [clés], relues, mode: 'premier' | 'complet' |
 * 'incremental' | 'rien' }.
 */
export function* mettreAJourLeCache(database, { force = false } = {}) {
  const ancien = yield* lireLeCache(database);
  const signatures = yield* lireLesSignatures(database);
  const toutRelire = force || [...ancien.values()].some((l) => l.version !== VERSION_RENCONTRES);
  const aRelire = [];
  for (const [cle, sig] of signatures) {
    const c = ancien.get(cle);
    if (toutRelire || !c || c.sig !== sig) aRelire.push(cle);
  }
  const aRetirer = [...ancien.keys()].filter((cle) => !signatures.has(cle));
  const aEcrire = yield* relireLesRencontres(database, aRelire, signatures);
  const cache = new Map(ancien);
  for (const cle of aRetirer) cache.delete(cle);
  for (const l of aEcrire) cache.set(l.match_key, l);
  const mode = !ancien.size ? 'premier' : toutRelire ? 'complet' : aRelire.length || aRetirer.length ? 'incremental' : 'rien';
  return { cache, aEcrire, aRetirer, relues: aRelire.length, mode };
}

/** Les buts à la 90e d'une rencontre (ligne team_day du camp qui reçoit) : bp90/bc90, sinon le score s'il n'y a pas eu de prolongation ; sinon null. */
export function butsA90DeLaLigne(l) {
  const b90 = entierOuNull(l.bp90);
  const c90 = entierOuNull(l.bc90);
  if (b90 !== null && c90 !== null) return { dom: b90, ext: c90 };
  if (!Number(l.prolongation) && entierOuNull(l.bp) !== null && entierOuNull(l.bc) !== null) return { dom: Number(l.bp), ext: Number(l.bc) };
  return null;
}

/** Les cartons et les fautes de la rencontre (les deux camps, règles de relevé de leagueBenchmarks : un 0-0 n'est pas relevé). */
export function cartonsDeLaLigne(l) {
  const c = cartonsReleves(l.jaunes_p, l.jaunes_c, l.rouges_p, l.rouges_c);
  const f = paireRelevee(l.fautes_p, l.fautes_c);
  return {
    jaunes: c && c.rouges !== null ? c.jaunes : null,
    rouges: c && c.rouges !== null ? c.rouges : null,
    fautes: f ? f[0] + f[1] : null
  };
}

/** La moyenne de buts par match d'un championnat au jour J (league_day ; la règle du moteur, défaut 1,45 + 1,15), ou null sans ligne. */
export function moyenneDeButs(l) {
  if (l.l_source === null || l.l_source === undefined) return null;
  const m = moyennesDeLaLigne({ l_source: l.l_source, l_n: l.l_n, l_bd: l.l_bd, l_be: l.l_be, l_xg_n: 0, l_xd: 0, l_xe: 0, l_cad_n: 0, l_cd: 0, l_ce: 0 });
  return m.goals.home + m.goals.away;
}

/** Une rencontre de la passe (pure), depuis la ligne du flux et sa ligne du cache. */
export function rencontreDuFlux(l, c) {
  const coach = (nom, id) => {
    const n = texteStable(nom);
    const i = entierOuNull(id);
    return n || (i !== null && i > 0) ? { nom: n, id: i !== null && i > 0 ? i : null } : null;
  };
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
    kickoff: c?.kickoff ?? null,
    kickoffConnu: Boolean(c?.kickoff),
    stade: c?.stade ?? null,
    surface: c?.surface ?? null,
    arbitre: c?.arbitre_nom ? { nom: c.arbitre_nom, pays: c.arbitre_pays ?? '' } : null,
    penalties: c ? c.penalties ?? null : null,
    buts90: butsA90DeLaLigne(l),
    cartons: cartonsDeLaLigne(l),
    moyenneButsLigue: moyenneDeButs(l),
    entraineurs: { home: coach(l.coach_dom, l.coach_id_dom), away: coach(l.coach_ext, l.coach_id_ext) }
  };
}

const SQL_FLUX = `SELECT d.match_key, d.fotmob_id, d.date, d.league, d.saison, d.home, d.away,
  t.attribue, t.prolongation, t.coupe, t.bp, t.bc, t.bp90, t.bc90,
  t.jaunes_p, t.jaunes_c, t.rouges_p, t.rouges_c, t.fautes_p, t.fautes_c,
  ld.l_source, ld.l_n, ld.l_bd, ld.l_be,
  sh.coach AS coach_dom, sh.coach_id AS coach_id_dom, sa.coach AS coach_ext, sa.coach_id AS coach_id_ext
  FROM day_matches d
  JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
  LEFT JOIN league_day ld ON ld.league = d.league AND ld.date = d.date
  LEFT JOIN team_style_matches sh ON sh.match_key = d.match_key AND sh.camp = 1
  LEFT JOIN team_style_matches sa ON sa.match_key = d.match_key AND sa.camp = 0
  WHERE d.date >= ? AND d.date <= ?
  ORDER BY d.date, d.match_key`;

/**
 * LE FLUX CHRONOLOGIQUE des rencontres JOUÉES (le registre du jour J et sa table : seulement des matchs joués, aux deux
 * clubs identifiés), du jour `depuis` au jour `jusqua` inclus, dans l'ordre (jour, clé) — chaque rencontre complétée par
 * le cache (`cache` : Map, celle de mettreAJourLeCache ; sans elle, la table lue telle quelle). Itérateur de rencontres
 * (rencontreDuFlux).
 */
export function* rencontresChronologiques({ database, cache = null, depuis = '0000-01-01', jusqua = '9999-12-31' }) {
  let parCle = cache;
  if (!parCle) {
    parCle = new Map();
    try {
      for (const r of database.prepare(`SELECT ${COLONNES_RENCONTRES.join(', ')} FROM contexte_rencontres`).iterate()) parCle.set(r.match_key, r);
    } catch (error) {
      if (!absente(error)) throw error;
    }
  }
  const de = jourDe(depuis) ?? '0000-01-01';
  const a = jourDe(jusqua) ?? '9999-12-31';
  const st = database.prepare(SQL_FLUX);
  for (const l of st.iterate(de, a)) yield rencontreDuFlux(l, parCle.get(l.match_key) ?? null);
}

/**
 * LES RENCONTRES D'UN JOUR TELLES QUE LA PAGE D'AVANT-MATCH LES PUBLIAIT (le banc et l'oracle de la copie tronquée) :
 * le registre du jour J et le cache — coup d'envoi, stade, pelouse, nom et pays de l'arbitre —, JAMAIS un fait du match
 * (ni score, ni cartons, ni entraîneur de la composition du jour). Rend [{ matchKey, fotmobId, date, league, home, away,
 * kickoff, kickoffConnu, stade, surface, arbitre }], dans l'ordre des clés.
 */
export function rencontresAvantMatchDuJour({ database, cache = null, jour }) {
  const parCle = cache ?? new Map();
  if (!cache) {
    try {
      for (const r of database.prepare(`SELECT ${COLONNES_RENCONTRES.join(', ')} FROM contexte_rencontres`).iterate()) parCle.set(r.match_key, r);
    } catch (error) {
      if (!absente(error)) throw error;
    }
  }
  return database
    .prepare('SELECT match_key, fotmob_id, date, league, home, away FROM day_matches WHERE date = ? ORDER BY match_key')
    .all(jourDe(jour))
    .map((d) => {
      const c = parCle.get(d.match_key) ?? null;
      return {
        matchKey: d.match_key,
        fotmobId: d.fotmob_id ?? null,
        date: d.date,
        league: d.league,
        home: Number(d.home),
        away: Number(d.away),
        kickoff: c?.kickoff ?? null,
        kickoffConnu: Boolean(c?.kickoff),
        stade: c?.stade ?? null,
        surface: c?.surface ?? null,
        arbitre: c?.arbitre_nom ? { nom: c.arbitre_nom, pays: c.arbitre_pays ?? '' } : null
      };
    });
}
