/**
 * lectureDesCompos.js — LA COMPO D'UN MATCH À VENIR, LUE AU MAGASIN, POUR LES CHIFFRES DES JOUEURS (étape 34, lot 1b, 03/11/2026).
 * -----------------------------------------------------------------------
 * Lecture seule, sur la base de l'APPELANT (le processus à part de la nuit, l'enregistreur d'avant-match, la page du
 * match) ; aucune écriture, aucune horloge, aucun réseau. Les mêmes règles pour les trois, pour que l'archive et l'écran
 * disent la même compo :
 *   - LA COMPO PUBLIÉE : la ligne de `upcoming_lineups` (le cache des compositions, écrit par la boucle des compositions et
 *     la page du match — jamais ici) des deux clubs à ce jour (± 1 jour : le jour UTC du coup d'envoi), son heure de lecture ;
 *   - LA DERNIÈRE ALIGNÉE : la feuille désignée par la nuit (la règle de derniereFeuille, tenue par l'accumulateur), relue
 *     dans `players` (titulaires, poste de la feuille, nom) ;
 *   - LES ABSENTS ANNONCÉS pour CE match (`unavailable_reads` / `unavailable_daily`, la dernière lecture du jour) ;
 *   - L'HEURE DU COUP D'ENVOI quand elle est sûre (la fiche du contexte de l'étape 32, `kickoff_connu`, sinon la compo ou
 *     la lecture des absents).
 * Les joueurs par IDENTIFIANT FotMob (après people_merges), jamais par un nom ; l'identifiant 0 de FotMob n'en est pas un.
 * -----------------------------------------------------------------------
 */

import { numeroApresFusion } from './lectureDesJoueurs.js';
import { posteDeLaCompo } from './chiffresDesJoueurs.js';

const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
const absente = (error) => /no such table|no such column/i.test(String(error?.message ?? ''));
const club = (n) => `fotmob-${n}`;
const sur = (f, defaut) => {
  try {
    return f();
  } catch (error) {
    if (absente(error)) return defaut;
    throw error;
  }
};

/** Les trois jours où chercher un match du jour `date` (le jour UTC du coup d'envoi peut être la veille ou le lendemain). */
export const joursAutour = (date) => [plusJours(date, -1), date, plusJours(date, 1)];

/** Un joueur d'une compo publiée (FotMob) : { id, brut, nom, poste, numero, pays, nomPays, titulaire }. */
function joueurPublie(j, titulaire, parFusion) {
  const brut = j?.id ?? null;
  return { id: numeroApresFusion(brut, parFusion), brut, nom: String(j?.name ?? '').trim() || null, poste: posteDeLaCompo(j?.position), numero: j?.number ?? null, pays: j?.countryCode ?? null, nomPays: j?.countryName ?? null, titulaire };
}

/**
 * LA COMPO PUBLIÉE d'un match (home, away : numéros FotMob ; date AAAA-MM-JJ) : la ligne de `upcoming_lineups` des deux
 * clubs, la plus récente des trois jours autour ; null si aucune compo n'est publiée. Rend { fotmobId, kickoff, lueLe,
 * home: { titulaires, remplacants, absents }, away }.
 */
export function compoPubliee(database, { home, away, date, parFusion = new Map() }) {
  const jours = joursAutour(date);
  const r = sur(
    () => database.prepare('SELECT fotmob_id, date, kickoff, payload, fetched_at FROM upcoming_lineups WHERE home_id = ? AND away_id = ? AND date IN (?, ?, ?) ORDER BY fetched_at DESC LIMIT 1').get(club(home), club(away), ...jours),
    null
  );
  if (!r) return null;
  let page;
  try {
    page = JSON.parse(r.payload);
  } catch {
    return null;
  }
  if (!page?.available) return null;
  return { fotmobId: String(r.fotmob_id), kickoff: r.kickoff ?? page.meta?.kickoff ?? null, lueLe: r.fetched_at, ...compoDeLaPage(page, parFusion) };
}

/** Les deux camps d'une page FotMob (le payload de upcoming_lineups) : { home: { titulaires, remplacants, absents }, away }. */
export function compoDeLaPage(page, parFusion = new Map()) {
  const cote = (t) => ({
    titulaires: (t?.startXI ?? []).map((j) => joueurPublie(j, true, parFusion)),
    remplacants: (t?.substitutes ?? []).map((j) => joueurPublie(j, false, parFusion)),
    absents: (t?.unavailable ?? []).map((a) => ({ id: numeroApresFusion(a?.id, parFusion), nom: a?.name ?? null, motif: a?.type ?? null }))
  });
  return { home: cote(page?.home), away: cote(page?.away) };
}

/** LA FEUILLE de la dernière alignée (clé du match, côté) relue dans `players` : les titulaires, avec leur poste et leur nom. */
export function feuilleDeLaDerniere(database, { cle, cote, parFusion = new Map() }) {
  if (!cle || (cote !== 'home' && cote !== 'away')) return [];
  return sur(
    () =>
      database
        .prepare('SELECT player_id, name, position FROM players WHERE match_key = ? AND side = ? AND starter = 1 ORDER BY ord, player_key')
        .all(cle, cote)
        .map((p) => ({ id: numeroApresFusion(p.player_id, parFusion), brut: p.player_id ?? null, nom: p.name ?? null, poste: posteDeLaCompo(p.position), numero: null, pays: null, nomPays: null, titulaire: true })),
    []
  );
}

/**
 * LES ABSENTS ANNONCÉS par FotMob pour CE match (la dernière lecture des absents : `unavailable_reads` des deux clubs à ce
 * jour, puis ses lignes de `unavailable_daily`) : { fotmobId, lueLe, kickoff, home: [{ id, nom, motif }], away } ; null
 * sans lecture.
 */
export function absentsAnnonces(database, { home, away, date, parFusion = new Map() }) {
  const jours = joursAutour(date);
  const l = sur(() => database.prepare('SELECT day, fotmob_id, kickoff, read_at FROM unavailable_reads WHERE home_id = ? AND away_id = ? AND date IN (?, ?, ?) ORDER BY read_at DESC LIMIT 1').get(club(home), club(away), ...jours), null);
  if (!l) return null;
  const lignes = sur(() => database.prepare('SELECT side, player_id, player_name, reason FROM unavailable_daily WHERE day = ? AND fotmob_id = ? ORDER BY side, player_key').all(l.day, l.fotmob_id), []);
  const de = (side) => lignes.filter((x) => x.side === side).map((x) => ({ id: numeroApresFusion(x.player_id, parFusion), nom: x.player_name ?? null, motif: x.reason ?? null }));
  return { fotmobId: String(l.fotmob_id), lueLe: l.read_at, kickoff: l.kickoff ?? null, home: de('home'), away: de('away') };
}

/** L'HEURE SÛRE du coup d'envoi (ISO) : la fiche du contexte (kickoff_connu), sinon la compo publiée, sinon la lecture des absents ; null sinon. */
export function coupDEnvoiSur(database, { home, away, date, compo = null, absents = null }) {
  const jours = joursAutour(date);
  const f = sur(() => database.prepare('SELECT kickoff FROM contexte_fiches WHERE home_id = ? AND away_id = ? AND date IN (?, ?, ?) AND kickoff_connu = 1 ORDER BY calcule_le DESC LIMIT 1').get(home, away, ...jours), null);
  const t = [f?.kickoff, compo?.kickoff, absents?.kickoff].find((x) => typeof x === 'string' && Number.isFinite(Date.parse(x)));
  return t ?? null;
}

/**
 * LE λ DE LA CANDIDATE DE L'ÉTAPE 27 (conception §7.5, T-N6) : PAS lu ici. La table de la candidate (engine_candidate_picks)
 * n'est écrite et lue que par le dépôt des enregistreurs (moteurABlanc.test.mjs, « le code »), et le dépôt est gelé pendant
 * l'essai 27. L'archive garde de quoi la rejoindre plus tard, à la preuve (lot 2) : le jour, les deux clubs (« fotmob-N »),
 * l'identifiant FotMob du match quand il est connu et l'heure du coup d'envoi — la dernière révision de la candidate
 * enregistrée AVANT ce coup d'envoi se retrouvera alors par le dépôt. Rend la clé de cette jointure.
 */
export function cleDeLaCandidate({ home, away, date, kickoff, fotmobId = null }) {
  return { date, homeId: club(home), awayId: club(away), fotmobId, avantLe: kickoff ?? null, lu: false, raison: 'la table de la candidate n’est lue que par le dépôt des enregistreurs (gelé pendant l’essai 27) : rejointe à la preuve' };
}
