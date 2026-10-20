/**
 * dayTable.js — LA TABLE DU JOUR J (étape 17 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * Pour chaque rencontre du magasin et chacun de ses deux camps, une ligne qui
 * dit CE QUI S'EST PASSÉ (les faits du match, recopiés tels quels avec cinq
 * indicateurs : attribué, prolongation, compte au classement, coupe, relevé)
 * et CE QU'ON SAVAIT LA VEILLE (les entrées exactes que le moteur lit
 * aujourd'hui avant ce match). La même chose, plus compacte, pour chaque
 * joueur identifié sur chaque feuille, et les moyennes de chaque championnat
 * avant chacun de ses jours de match. Tables : day_matches (le registre),
 * team_day, league_day, player_day, day_state (matchStatsDb.js).
 *
 * POURQUOI : les étapes suivantes (18 valeur des statistiques, 19 banc
 * d'essai, 27, 29, 30) mesurent et rejouent sur des matchs passés. Calculer
 * « avant J » match par match avec les fonctions du moteur prend des heures
 * (dossier 17-19 : ~1 h 45 pour les équipes, ~12 h pour les joueurs) ; et une
 * seule lecture « du moment » glissée dans un rejeu fait fuiter l'avenir. La
 * table fait ce calcul une fois, par identifiants, et le vérifie chaque nuit.
 *
 * LA RÈGLE DU JOUR J : J = matches.date, le jour UTC du coup d'envoi (celui
 * que comparent tous les lecteurs du moteur). Tout ce qui est « avant » ne lit
 * que des matchs d'un jour UTC STRICTEMENT antérieur — jamais `<=`, jamais le
 * même jour, même fini plus tôt : c'est la seule règle qui tient pour un club
 * à deux matchs le même jour. Les fonctions pures LÈVENT si un fait du jour J
 * ou d'après leur parvient (une assertion qui ne coûte rien, gardée en
 * production).
 *
 * LES CINQ ENTRÉES DU MOTEUR, reproduites à l'identique, règle par règle, Y
 * COMPRIS LEURS DIVERGENCES (les unifier changerait le moteur : cela passera
 * par le banc, étape 19, et le juge, étape 16) :
 *
 * | Entrée                 | Attribués | Prolongations (score 120e) | Hors classement | Coupes   | Règle 0-0              | Même jour |
 * |------------------------|-----------|----------------------------|-----------------|----------|------------------------|-----------|
 * | (a) fenêtre 10/6       | comptés   | comptées                   | comptés         | comptées | OUI                    | exclus    |
 * | (b) forme 5            | EXCLUS    | comptées                   | comptés         | comptées | non (0-0 cadrés = 0)   | exclus    |
 * | (c) saison dans L      | EXCLUS    | comptées                   | comptés         | —        | —                      | exclus    |
 * | (d) buts de la saison  | comptés   | comptées                   | comptés         | —        | —                      | exclus    |
 * | (e1) moyennes de L     | EXCLUS    | comptées                   | EXCLUS          | —        | non                    | exclus    |
 * | (e2) classement de L   | comptés   | comptées                   | EXCLUS          | —        | —                      | exclus    |
 *
 *   (a) statInputsRead.moyennesEquipe — corners, tirs, tirs cadrés : 30
 *       dernières rencontres relevées à domicile + 30 à l'extérieur, réunies
 *       du plus récent au plus ancien (à date égale : clé décroissante), les
 *       10 premières où la statistique est relevée, au moins 6 ;
 *   (b) scoreFormRead.matchsAvant + equipe — les 5 derniers matchs, toutes
 *       compétitions, gardés comme RÉFÉRENCES de rencontres (forceRecente les
 *       lit un par un, jamais en somme) ;
 *   (c) scoreFormRead.saisonDansLigue — la saison de J dans L, au moins 6
 *       matchs, sinon tout l'historique du club dans L ;
 *   (d) matchStatsRead.teamGoalsFromStore — la saison la plus récente de L qui
 *       a un match avant J (pas la saison de J !), au moins 6 matchs du club,
 *       sinon tout son historique dans L ;
 *   (e1) scoreFormRead.leagueAveragesBefore — la saison de J, moins de 30 :
 *       les 365 jours, moins de 10 : 1,45 / 1,15 ;
 *   (e2) standingsService.getLeagueGoalAverages (classement calculé) — la
 *       saison la plus récente de L qui a un match avant J.
 * Différence ASSUMÉE avec l'appli d'aujourd'hui : (d) et (e2) lisent
 * « maintenant », sans borne ; la table, non. Aucune fuite plutôt que la
 * reproduction d'une fuite.
 *
 * Tout le reste (fenêtres 5/10/saison des xG, cartons, pondérations) se
 * calcule À LA DEMANDE depuis les faits (`fenetre`, `faitsEquipe`,
 * `faitsJoueur`) : 18, 27 et 29 ont besoin de fenêtres différentes et
 * pondérées qu'aucune colonne figée ne servirait.
 *
 * UN SEUL ÉCRIVAIN : dans l'appli, le serveur, dans la passe d'actualisation
 * qui tient le verrou (étape « tableJourJ » de matchStatsAutoRefresh.js), en
 * rendant la main toutes les ~25 ms et sans jamais garder une transaction
 * ouverte pendant qu'il la rend. Dans le bac : scripts/build-day-table.mjs,
 * sous le même verrou. La carte de Réglages, la route et `due` ne font que
 * LIRE (etatTableJourJ) — jamais une écriture, pas même dans day_state.
 *
 * LA NUIT : les faits ne sont relus que pour les rencontres nouvelles,
 * modifiées (`updated_at` différent du registre), disparues, ou touchées par
 * une fusion d'identité ; les colonnes « avant » des équipes sont TOUTES
 * recalculées (quelques secondes), celles des joueurs touchés seulement.
 * Aucune colonne « avant » n'hérite d'une nuit précédente. Chaque nuit, un
 * contrôle anti-fuite recalcule des lignes tirées au hasard par un second
 * chemin, depuis les tables sources (controleAntiFuite), dans un processus à
 * part en lecture seule (dayTableControle.js) : les lecteurs du moteur qu’il
 * appelle tiendraient le serveur jusqu’à plusieurs secondes par ligne.
 *
 * Imports : seulement le magasin (matchStatsDb, matchStatsRead.countsForTable,
 * columns, identityRegistry pour le nom des clubs, leagueBenchmarks pour les
 * règles de relevé) et les deux utilitaires de saison et de coupe ; les
 * lecteurs du moteur (statInputsRead, scoreFormRead) seulement pour le second
 * chemin du contrôle anti-fuite. Aucun fournisseur, rien de core/.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from './matchStatsDb.js';
import { countsForTable } from './matchStatsRead.js';
import { POSITIONS } from './columns.js';
import { canonicalTeamNames } from './identityRegistry.js';
import { paireRelevee, cartonsReleves } from './leagueBenchmarks.js';
import { seasonOf, seasonBounds } from '../providers/seasonWindows.js';
import { isCup } from '../providers/leagueCups.js';
// Le second chemin du contrôle anti-fuite SEULEMENT : les lecteurs du moteur eux-mêmes.
import { moyennesEquipe } from './statInputsRead.js';
import { scoreInputsFromStore, leagueAveragesBefore } from './scoreFormRead.js';

/** Forme du calcul : une table construite par une autre version est refaite entière (comme VERSION_REPERES). */
export const VERSION_TABLE_JOUR = 1;
/** Ce qu'une fenêtre à la demande peut écarter (`fenetre`, option `exclure`). */
export const EXCLUSIONS = Object.freeze(['attribues', 'prolongations', 'horsClassement', 'coupes']);
/** Les règles de relevé, un seul endroit : celles des repères (étape 15). */
export { paireRelevee, cartonsReleves };

/**
 * Les constantes des lecteurs du moteur, RECOPIÉES (le module ne lit pas les
 * clubs par leur nom et n'importe pas les lecteurs pour calculer) ; un test
 * vérifie qu'elles n'ont pas bougé chez eux.
 */
export const CONSTANTES = Object.freeze({
  fenetre: 10, // statInputsRead.STAT_SAMPLE
  minimumFenetre: 6, // statInputsRead.STAT_MIN_SAMPLE
  candidatsParCote: 30, // statInputsRead.moyennesEquipe : LIMIT 30 à domicile, 30 à l'extérieur
  forme: 5, // scoreFormRead.FORME_MATCHS
  minimumSaisonEquipe: 6, // scoreFormRead.MINIMUM_SAISON_EQUIPE et teamGoalsFromStore.MINIMUM_SAISON
  minimumSaisonLigue: 30, // scoreFormRead.MINIMUM_SAISON_LIGUE
  minimumLigue: 10, // scoreFormRead.MINIMUM_LIGUE
  minimumXg: 20, // scoreFormRead.MINIMUM_XG (xG et tirs cadrés du championnat)
  joursRepli: 365, // scoreFormRead : les 365 derniers jours
  defaut: Object.freeze({ home: 1.45, away: 1.15 }), // scoreFormRead.DEFAUT
  apparitions: 10 // a10_* : les 10 dernières apparitions jouées d'un joueur
});
const C = CONSTANTES;

/** Les trois statistiques de la fenêtre 10/6, dans l'ordre du moteur (corners, shots, shotsOnTarget). */
const STATS_F10 = Object.freeze([
  ['corners', 'corners'],
  ['tirs', 'shots'],
  ['cadres', 'shotsOnTarget']
]);
/** team_stats → faits : chaque statistique copiée telle quelle, pour (p) et contre (c). */
const COLONNES_EQUIPE = Object.freeze({
  tirs: 'total_shots',
  cadres: 'shots_on_goal',
  corners: 'corner_kicks',
  jaunes: 'yellow_cards',
  rouges: 'red_cards',
  fautes: 'fouls',
  occasions: 'big_chances'
});
/** Les colonnes de FAITS de team_day, dans l'ordre de la table. */
const FAITS_EQUIPE = Object.freeze([
  'club', 'adversaire', 'date', 'league', 'saison', 'attribue', 'prolongation', 'compte', 'coupe', 'releve',
  'bp', 'bc', 'bp90', 'bc90', 'xg_p', 'xg_c',
  ...Object.keys(COLONNES_EQUIPE).flatMap((s) => [`${s}_p`, `${s}_c`]),
  'possession_p'
]);
/** Les colonnes AVANT de team_day. */
const AVANT_EQUIPE = Object.freeze([
  ...STATS_F10.flatMap(([s]) => [`f10_${s}_p`, `f10_${s}_c`, `f10_${s}_n`]),
  'f5_1', 'f5_2', 'f5_3', 'f5_4', 'f5_5',
  's_bp_dom', 's_bc_dom', 's_n_dom', 's_bp_ext', 's_bc_ext', 's_n_ext', 's_en_saison',
  'g_saison', 'g_bp_dom', 'g_bc_dom', 'g_n_dom', 'g_bp_ext', 'g_bc_ext', 'g_n_ext'
]);
const COLONNES_LIGUE = Object.freeze(['l_source', 'l_n', 'l_bd', 'l_be', 'l_xg_n', 'l_xd', 'l_xe', 'l_cad_n', 'l_cd', 'l_ce', 'c_saison', 'c_n', 'c_bd', 'c_be']);
/** Les colonnes de FAITS de player_day (après la clé joueur, date, rencontre). */
const FAITS_JOUEUR = Object.freeze([
  'club', 'camp', 'joue', 'titulaire', 'entre', 'poste', 'minutes', 'note',
  'buts', 'passes_d', 'tirs', 'cadres', 'xg', 'xa', 'xgnp', 'xgot',
  'pc', 'recup', 'duels_g', 'duels_t', 'buts_evites', 'buts_concedes',
  'jaunes', 'rouges', 'entre_min', 'sorti_min', 'csc'
]);
const AVANT_JOUEUR = Object.freeze(['a10_n', 'a10_min', 'a10_note_s', 'a10_note_n', 'a10_buts', 'a10_xg']);
/**
 * Faits de joueur où FotMob OMET les zéros (matchStatsRead.js : NULL vaut 0) :
 * pour un joueur qui a joué, NULL → 0 ; pour un banc non entré, NULL.
 */
const NULL_VAUT_ZERO = Object.freeze({
  buts: 'goals',
  passes_d: 'assists',
  tirs: 'shots',
  cadres: 'shots_on_target',
  pc: 'key_passes',
  recup: 'recoveries',
  duels_g: 'duels_won',
  duels_t: 'duels_total',
  buts_concedes: 'goals_conceded',
  csc: 'own_goals'
});
/** 1 Goalkeeper, 2 Defender, 3 Midfielder, 4 Forward, 5 Sweeper (POSITIONS de columns.js). */
const POSTES = Object.freeze(Object.fromEntries(POSITIONS.map((p, i) => [p, i + 1])));
const COLONNES_SOURCE_JOUEUR =
  'match_key, side, player_id, starter, subbed_in, position, minutes, rating, goals, assists, shots, shots_on_target, xg, xa, xg_non_penalty, xgot, key_passes, recoveries, duels_won, duels_total, goals_prevented, goals_conceded, yellow_cards, red_cards, sub_in_minute, sub_out_minute, own_goals';
const COLONNES_SOURCE_EQUIPE = 'match_key, side, expected_goals, xgot, total_shots, shots_on_goal, corner_kicks, yellow_cards, red_cards, fouls, big_chances, ball_possession';

/** Quand un match n'a pas de date de mise à jour : une valeur que le registre peut recopier. */
const SANS_DATE = '(aucune)';
/**
 * Tranches : lignes écrites par transaction (au plus), et ce qui se lit d'un
 * coup. PETITES, dans le serveur comme dans le script : une lecture de 2 000
 * déroulés prend ~0,2 s sur la base de Pierre (100 en prennent ~10 ms), et de
 * grosses tranches font grossir le tas de Node bien au-delà de ce qui est
 * vivant (mesuré le 07/10 : +1 Go de mémoire avec des tranches de 2 000
 * rencontres et 1 000 joueurs, ~+300 Mo avec celles-ci, pour la même durée).
 * La lecture légère du magasin (registre) : 400 rencontres par page — 1 000
 * tenaient ~50 ms d'affilée sur la base de Pierre (mesuré le 12/10).
 * Les feuilles : 20 rencontres par lecture — 40 tenaient ~0,2 s à froid la nuit
 * (mesuré le 13/10).
 */
const TRANCHE_EQUIPE = 2000;
const TRANCHE_JOUEUR = 20000;
const PAS_BALAYAGE_JOUEURS = 10000; // joueurs par balayage de player_day (la nuit) : 25 000 tenaient jusqu’à 0,4 s à froid (mesuré le 12/10)
const PAS_VIDAGE_TEMPORAIRE = 20000;
const LECTURES = Object.freeze({ legere: 400, registre: 2000, rencontres: 50, feuilles: 20, joueursParPartition: 250, pages: 1000, clubs: 25 });

// ======================================================= petites règles

/**
 * L'horloge des durées et des pauses : monotone (performance.now), jamais
 * Date.now — une horloge figée (les essais) ou recalée (heure d'été, synchro)
 * fausserait le « jamais plus de ~25 ms d'affilée ».
 */
const horloge = () => performance.now();
const arrondi = (ms) => Math.round(ms * 10) / 10;

const nombre = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bit = (v) => (v ? 1 : 0);
const echelle = (v, facteur) => {
  const n = nombre(v);
  return n === null ? null : Math.round(n * facteur);
};

/**
 * Les bornes d'une colonne en tête de clé : MIN et MAX en DEUX sous-requêtes. SQLite ne prend l'index que pour UN
 * agrégat par requête : « SELECT MIN(x), MAX(x) » balaie la table entière (player_day : 0,4 à 5 s d'un bloc, mesuré
 * le 13/10), deux sous-requêtes ne lisent que deux feuilles d'index (< 1 ms).
 */
const bornesDe = (table, colonne) => `SELECT (SELECT MIN(${colonne}) FROM ${table}) mi, (SELECT MAX(${colonne}) FROM ${table}) ma`;

/** « fotmob-8456 » → 8456. Toute autre forme LÈVE : jamais un club ou un joueur rangé sous 0 ou sous un nom. */
export function numeroFotmob(id) {
  const m = /^fotmob-([1-9]\d*)$/.exec(String(id ?? ''));
  const n = m ? Number(m[1]) : Number.NaN;
  if (!m || !Number.isSafeInteger(n)) throw new Error(`identifiant FotMob mal formé : « ${id ?? ''} »`);
  return n;
}
const enFotmob = (n) => (n === null || n === undefined ? null : `fotmob-${n}`);

/** Le jour (AAAA-MM-JJ) d'une cible ; lève s'il n'en est pas un. */
function jourDe(date) {
  const jour = String(date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) throw new Error(`jour de la cible illisible : « ${date ?? ''} »`);
  return jour;
}

/** Le jour UTC `jours` jours avant `iso` (la même fonction que scoreFormRead.joursAvant). */
function joursAvant(iso, jours) {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - jours);
  return t.toISOString().slice(0, 10);
}
function jourApres(iso) {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/** L'ordre des faits : par jour, puis par clé de rencontre (le départage de scoreFormRead : date, match_key). */
export function ordreChronologique(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ka = String(a.matchKey ?? '');
  const kb = String(b.matchKey ?? '');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * LA GARDE ANTI-FUITE des fonctions pures : chacun des `fin` premiers faits
 * (tous par défaut) doit être d'un jour STRICTEMENT antérieur à la cible —
 * sinon on lève (jamais un `<=` silencieux). Rend les faits dans l'ordre
 * chronologique : la liste elle-même (lue jusqu'à `fin`) quand elle l'est
 * déjà, une copie triée sinon.
 */
function anterieurs(faits, jour, qui, fin = faits.length) {
  let trie = true;
  for (let i = 0; i < fin; i++) {
    const f = faits[i];
    if (!(typeof f?.date === 'string' && f.date < jour)) {
      throw new Error(`${qui} : un fait du ${f?.date ?? '(sans date)'} n'est pas strictement avant le ${jour} — fuite refusée`);
    }
    if (trie && i > 0 && ordreChronologique(faits[i - 1], f) > 0) trie = false;
  }
  return trie ? faits : faits.slice(0, fin).sort(ordreChronologique);
}

/**
 * Les indicateurs d'une rencontre, lus dans sa colonne `meta` (texte JSON ou
 * objet). `meta` illisible : rien d'attribué ni de prolongé, et elle COMPTE
 * (comme leagueAveragesBefore et standingsFromStore).
 */
export function indicateursDUneRencontre(meta, league) {
  let m = meta;
  let lisible = true;
  if (typeof meta === 'string') {
    try {
      m = JSON.parse(meta);
    } catch {
      lisible = false;
      m = null;
    }
  }
  m ??= {};
  const reason = String(m?.reason ?? '');
  // La règle NON_ATTRIBUE de scoreFormRead (json_extract : 1 ou true) et d'exclusionDUneRencontre.
  const attribue = m.awarded === 1 || m.awarded === true || reason === 'awarded_win' || reason === 'id_reused';
  const prolongation = reason === 'afterextra' || reason === 'afterpenalties';
  const compte = lisible ? countsForTable(m) : true;
  return { attribue: bit(attribue), prolongation: bit(prolongation), compte: bit(compte), coupe: bit(isCup(league)) };
}

/**
 * Les buts jusqu'à la 90e minute, temps additionnel compris (FotMob note 90+4
 * en minute 90 et temps ajouté 4) — SEULEMENT quand le déroulé a tous les buts
 * du score, chacun avec sa minute et son camp (le camp CRÉDITÉ du but, contre
 * son camp compris) ; sinon null. Un match non prolongé au déroulé complet :
 * le score lui-même (le score stocké d'un match prolongé est celui de la 120e).
 */
export function butsA90({ hg, ag, prolongation }, events) {
  if (!Array.isArray(events)) return null;
  const buts = events.filter((e) => e?.type === 'goal');
  if (buts.length !== hg + ag) return null;
  let dom = 0;
  let ext = 0;
  let dom90 = 0;
  let ext90 = 0;
  for (const b of buts) {
    // La règle de valeursDUneRencontre (leagueBenchmarks.js) : une minute connue pour chaque but.
    if (b.minute === null || b.minute === undefined || !Number.isFinite(Number(b.minute))) return null;
    const a90 = Number(b.minute) <= 90;
    if (b.side === 'home') {
      dom++;
      if (a90) dom90++;
    } else if (b.side === 'away') {
      ext++;
      if (a90) ext90++;
    } else return null;
  }
  if (dom !== hg || ext !== ag) return null;
  return prolongation ? { dom: dom90, ext: ext90 } : { dom: hg, ext: ag };
}

// ======================================================= les faits

/**
 * Les deux lignes de FAITS d'une rencontre (camp 1 domicile, 0 extérieur),
 * colonnes de team_day. `entree` : { date, league, saison, home, away, hg, ag,
 * attribue, prolongation, compte, coupe } ; `stats` : les lignes team_stats
 * { home, away } (null si absente) ; `events` : le déroulé (tableau) ou null.
 * Tout est COPIÉ : un 0-0 reste 0 et 0 (la règle « 0-0 = non relevé » est
 * celle de certains lecteurs, appliquée par eux) ; NULL = absent de team_stats.
 */
export function faitsDUneRencontre({ rencontre, entree, stats = {}, events = null }) {
  const h = stats?.home ?? null;
  const a = stats?.away ?? null;
  // La jointure INTERNE de statInputsRead : les deux lignes team_stats.
  const releve = h && a ? 1 : 0;
  // La règle xgOk de scoreFormRead : les deux xG, ou aucun.
  const xgOk = nombre(h?.expected_goals) !== null && nombre(a?.expected_goals) !== null;
  const a90 = butsA90({ hg: entree.hg, ag: entree.ag, prolongation: entree.prolongation }, events);
  const ligne = (camp) => {
    const moi = camp === 1 ? h : a;
    const lui = camp === 1 ? a : h;
    const r = {
      rencontre,
      camp,
      club: camp === 1 ? entree.home : entree.away,
      adversaire: camp === 1 ? entree.away : entree.home,
      date: entree.date,
      league: entree.league,
      saison: entree.saison,
      attribue: bit(entree.attribue),
      prolongation: bit(entree.prolongation),
      compte: bit(entree.compte),
      coupe: bit(entree.coupe),
      releve,
      bp: camp === 1 ? entree.hg : entree.ag,
      bc: camp === 1 ? entree.ag : entree.hg,
      bp90: a90 ? (camp === 1 ? a90.dom : a90.ext) : null,
      bc90: a90 ? (camp === 1 ? a90.ext : a90.dom) : null,
      xg_p: xgOk ? nombre(moi.expected_goals) : null,
      xg_c: xgOk ? nombre(lui.expected_goals) : null
    };
    for (const [s, col] of Object.entries(COLONNES_EQUIPE)) {
      r[`${s}_p`] = nombre(moi?.[col]);
      r[`${s}_c`] = nombre(lui?.[col]);
    }
    r.possession_p = nombre(moi?.ball_possession);
    return r;
  };
  return [ligne(1), ligne(0)];
}

/** Ce que les règles de couverture d'une feuille lisent dans les deux lignes team_stats. */
export function couvertureDUneRencontre(stats = {}) {
  const h = stats?.home ?? null;
  const a = stats?.away ?? null;
  return {
    xg: nombre(h?.expected_goals) !== null && nombre(a?.expected_goals) !== null,
    xgot: nombre(h?.xgot) !== null && nombre(a?.xgot) !== null,
    cartons: cartonsReleves(h?.yellow_cards, a?.yellow_cards, h?.red_cards, a?.red_cards) !== null
  };
}

/**
 * Les lignes de FAITS d'une feuille de match (colonnes de player_day, sans les
 * colonnes « avant »). Seuls les joueurs IDENTIFIÉS (`fotmob-<n>`) entrent :
 * une ligne `name:` ne se relie à rien d'un match à l'autre (comptée à part).
 *   - joue : minutes > 0 OU titulaire (240 titulaires ont des minutes NULL) ;
 *   - si joue : les statistiques que FotMob omet quand elles valent 0 → 0 ;
 *     xG, xA, xG hors penalty seulement si le MATCH est couvert (les deux xG
 *     d'équipe), xGOT si les deux xGOT d'équipe le sont — sinon NULL = non
 *     relevé (71 % des lignes jouées seraient sinon prises pour des zéros) ;
 *     cartons seulement si les jaunes d'équipe sont relevés (cartonsReleves) ;
 *   - entrée et sortie (minutes) restent telles quelles : NULL = pas de
 *     remplacement (la règle du clean sheet de matchStatsRead.js), jamais 0 ;
 *   - un banc non entré : titulaire, entré, poste, minutes et note tels quels,
 *     statistiques NULL.
 * `couverture` : couvertureDUneRencontre. Un même joueur deux fois sur la même
 * feuille (jamais vu au magasin) : la ligne jouée, sinon la plus longue.
 */
export function faitsDUneFeuille({ rencontre, date, home, away, lignes, couverture = { xg: false, xgot: false, cartons: false } }) {
  const parJoueur = new Map();
  const bilan = { sansIdentifiant: 0, refusees: [], doublons: 0 };
  for (const l of lignes ?? []) {
    if (l.player_id === null || l.player_id === undefined) {
      bilan.sansIdentifiant++;
      continue;
    }
    let joueur;
    try {
      joueur = numeroFotmob(l.player_id);
    } catch {
      bilan.refusees.push(String(l.player_id));
      continue;
    }
    const camp = l.side === 'home' ? 1 : l.side === 'away' ? 0 : null;
    if (camp === null) {
      bilan.refusees.push(`${l.player_id} (camp « ${l.side} »)`);
      continue;
    }
    const minutes = nombre(l.minutes);
    const joue = (minutes !== null && minutes > 0) || nombre(l.starter) === 1 ? 1 : 0;
    const f = {
      joueur,
      date,
      rencontre,
      club: camp === 1 ? home : away,
      camp,
      joue,
      titulaire: nombre(l.starter),
      entre: nombre(l.subbed_in),
      poste: POSTES[l.position] ?? null,
      minutes,
      note: echelle(l.rating, 100)
    };
    for (const [col, source] of Object.entries(NULL_VAUT_ZERO)) f[col] = joue ? nombre(l[source]) ?? 0 : null;
    f.xg = joue && couverture.xg ? Math.round((nombre(l.xg) ?? 0) * 1000) : null;
    f.xa = joue && couverture.xg ? Math.round((nombre(l.xa) ?? 0) * 1000) : null;
    f.xgnp = joue && couverture.xg ? Math.round((nombre(l.xg_non_penalty) ?? 0) * 1000) : null;
    f.xgot = joue && couverture.xgot ? Math.round((nombre(l.xgot) ?? 0) * 1000) : null;
    f.buts_evites = echelle(l.goals_prevented, 100);
    f.jaunes = joue && couverture.cartons ? nombre(l.yellow_cards) ?? 0 : null;
    f.rouges = joue && couverture.cartons ? nombre(l.red_cards) ?? 0 : null;
    f.entre_min = joue ? nombre(l.sub_in_minute) : null;
    f.sorti_min = joue ? nombre(l.sub_out_minute) : null;
    const deja = parJoueur.get(joueur);
    if (deja) {
      bilan.doublons++;
      const garder = deja.joue !== f.joue ? (f.joue ? f : deja) : (f.minutes ?? -1) > (deja.minutes ?? -1) ? f : deja;
      parJoueur.set(joueur, garder);
    } else parJoueur.set(joueur, f);
  }
  return { faits: [...parJoueur.values()], ...bilan };
}

/**
 * football-data → faits d'équipe (§1.5 de la conception), pour le banc
 * d'essai (19) qui rejouera 2005-2019 sans rien stocker ici : deux faits par
 * match, de la MÊME forme que ceux du magasin. Identité = fd_teams.id (entier
 * stable chez football-data ; `clubFotmob` quand le vote l'a relié) ; saison =
 * le libellé du fichier (« 2021-22 », pas seasonOf) ; clé = (code, jour du
 * fichier, clubs), la seule stable. Chez football-data, un 0 est un vrai 0 et
 * une case vide « non publié » (NULL) ; ni xG, ni joueurs, ni prolongation
 * (des championnats seulement : le score est celui des 90 minutes).
 */
export function faitsDepuisFd(lignesFdHistory, { fdTeams = null } = {}) {
  const fotmob = new Map();
  const equipes = fdTeams instanceof Map ? [...fdTeams.values()] : Array.isArray(fdTeams) ? fdTeams : [];
  for (const t of equipes) if (t && t.id !== null && t.id !== undefined) fotmob.set(Number(t.id), t.team_id ?? null);
  const faits = [];
  for (const l of lignesFdHistory ?? []) {
    const bd = nombre(l.bd);
    const be = nombre(l.be);
    const date = typeof l.date === 'string' ? l.date.slice(0, 10) : null;
    if (bd === null || be === null || !date) continue;
    const dom = Number(l.dom);
    const ext = Number(l.ext);
    const paire = (d, e) => (nombre(d) !== null && nombre(e) !== null ? 1 : 0);
    const releve = paire(l.tirs_d, l.tirs_e) || paire(l.cadres_d, l.cadres_e) || paire(l.corners_d, l.corners_e) ? 1 : 0;
    const base = {
      rencontre: l.id ?? null,
      matchKey: `fd:${l.code}|${l.date_fichier ?? date}|${dom}|${ext}`,
      date,
      league: l.code,
      saison: l.saison,
      attribue: false,
      prolongation: false,
      compte: true,
      coupe: false,
      releve,
      source: 'football-data'
    };
    for (const camp of [1, 0]) {
      const p = camp === 1 ? 'd' : 'e';
      const c = camp === 1 ? 'e' : 'd';
      faits.push({
        ...base,
        home: camp === 1,
        club: camp === 1 ? dom : ext,
        adversaire: camp === 1 ? ext : dom,
        clubFotmob: fotmob.get(camp === 1 ? dom : ext) ?? null,
        adversaireFotmob: fotmob.get(camp === 1 ? ext : dom) ?? null,
        bp: camp === 1 ? bd : be,
        bc: camp === 1 ? be : bd,
        bp90: camp === 1 ? bd : be,
        bc90: camp === 1 ? be : bd,
        xg_p: null,
        xg_c: null,
        tirs_p: nombre(l[`tirs_${p}`]),
        tirs_c: nombre(l[`tirs_${c}`]),
        cadres_p: nombre(l[`cadres_${p}`]),
        cadres_c: nombre(l[`cadres_${c}`]),
        corners_p: nombre(l[`corners_${p}`]),
        corners_c: nombre(l[`corners_${c}`]),
        jaunes_p: nombre(l[`jaunes_${p}`]),
        jaunes_c: nombre(l[`jaunes_${c}`]),
        rouges_p: nombre(l[`rouges_${p}`]),
        rouges_c: nombre(l[`rouges_${c}`]),
        fautes_p: nombre(l[`fautes_${p}`]),
        fautes_c: nombre(l[`fautes_${c}`]),
        occasions_p: null,
        occasions_c: null,
        possession_p: null
      });
    }
  }
  return faits.sort(ordreChronologique);
}

// ======================================================= les règles « avant » (pures)

/** Deux listes déjà du plus récent au plus ancien, réunies dans le même ordre (date puis clé décroissantes). */
function reunirRecents(a, b) {
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && ordreChronologique(a[i], b[j]) >= 0)) out.push(a[i++]);
    else out.push(b[j++]);
  }
  return out;
}

const aDomicile = (f) => (f.home !== undefined ? Boolean(f.home) : f.camp === 1);

/**
 * Les colonnes « avant » d'une ligne d'équipe (§3.2), depuis les faits du club
 * et ceux de son championnat — TOUS d'un jour strictement antérieur à
 * `cible.date` (sinon on lève). `cible` : { date, league, saison, matchKey } ;
 * `saison` = seasonOf(league, date) pour le magasin, le libellé du fichier pour
 * football-data. Les faits portent `home` (ou `camp`), `releve`, `attribue`,
 * `league`, `saison`, `bp`, `bc`, et les statistiques ; ceux du championnat,
 * au moins `date`, `league` et `saison`.
 */
export function avantEquipe(faitsDuClub, faitsDeLaLigue, cible) {
  const club = faitsDuClub ?? [];
  const ligue = faitsDeLaLigue ?? [];
  return avantEquipeSur(club, club.length, ligue, ligue.length, cible);
}

/**
 * La même règle sur les `nClub` premiers faits du club et les `nLigue` premiers
 * du championnat (la construction passe la liste entière et sa borne : aucune
 * copie par ligne). Écrite en boucles, sans tableau intermédiaire : elle tourne
 * 120 000 fois par construction.
 */
function avantEquipeSur(faitsDuClub, nClub, faitsDeLaLigue, nLigue, cible) {
  const jour = jourDe(cible?.date);
  const L = cible.league;
  const club = anterieurs(faitsDuClub, jour, 'avantEquipe (club)', nClub);
  const ligue = anterieurs(faitsDeLaLigue, jour, 'avantEquipe (championnat)', nLigue);
  const n = Math.min(nClub, club.length);
  const nl = Math.min(nLigue, ligue.length);
  const saisonJ = cible.saison ?? seasonOf(L, jour);
  const out = {};

  // (a) La fenêtre 10/6 : 30 + 30 candidats relevés (les deux lignes team_stats), réunis, puis la règle 0-0.
  const dom = [];
  const ext = [];
  for (let i = n - 1; i >= 0 && (dom.length < C.candidatsParCote || ext.length < C.candidatsParCote); i--) {
    const f = club[i];
    if (!f.releve) continue;
    if (aDomicile(f)) {
      if (dom.length < C.candidatsParCote) dom.push(f);
    } else if (ext.length < C.candidatsParCote) ext.push(f);
  }
  const candidats = reunirRecents(dom, ext);
  for (const [s] of STATS_F10) {
    let k = 0;
    let p = 0;
    let c = 0;
    for (const f of candidats) {
      if (k >= C.fenetre) break;
      const x = f[`${s}_p`];
      const y = f[`${s}_c`];
      if (x === null || x === undefined || y === null || y === undefined) continue;
      if (Number(x) === 0 && Number(y) === 0) continue;
      p += Number(x);
      c += Number(y);
      k++;
    }
    out[`f10_${s}_p`] = p;
    out[`f10_${s}_c`] = c;
    out[`f10_${s}_n`] = k;
  }

  // (b) La forme sur 5 : toutes compétitions, attribués exclus, du plus récent au plus ancien.
  let f5 = 0;
  for (let i = n - 1; i >= 0 && f5 < C.forme; i--) if (!club[i].attribue) out[`f5_${++f5}`] = club[i].rencontre;
  while (f5 < C.forme) out[`f5_${++f5}`] = null;

  // (c) La saison de J dans L (attribués exclus) ; moins de 6 : tout l'historique du club dans L.
  let nSaison = 0;
  for (let i = 0; i < n; i++) {
    const f = club[i];
    if (!f.attribue && f.league === L && f.saison === saisonJ) nSaison++;
  }
  const enSaison = nSaison >= C.minimumSaisonEquipe;
  out.s_bp_dom = 0;
  out.s_bc_dom = 0;
  out.s_n_dom = 0;
  out.s_bp_ext = 0;
  out.s_bc_ext = 0;
  out.s_n_ext = 0;
  for (let i = 0; i < n; i++) {
    const f = club[i];
    if (f.attribue || f.league !== L || (enSaison && f.saison !== saisonJ)) continue;
    if (aDomicile(f)) {
      out.s_bp_dom += Number(f.bp);
      out.s_bc_dom += Number(f.bc);
      out.s_n_dom++;
    } else {
      out.s_bp_ext += Number(f.bp);
      out.s_bc_ext += Number(f.bc);
      out.s_n_ext++;
    }
  }
  out.s_en_saison = enSaison ? 1 : 0;

  // (d) Les buts de la saison : la saison la plus RÉCENTE de L qui a un match avant J (le dernier fait du
  // championnat), attribués comptés ; moins de 6 : tout l'historique du club dans L.
  let gSaison = null;
  for (let i = nl - 1; i >= 0; i--) {
    if (ligue[i].league === L) {
      gSaison = ligue[i].saison;
      break;
    }
  }
  let nSaisonG = 0;
  if (gSaison !== null) {
    for (let i = 0; i < n; i++) if (club[i].league === L && club[i].saison === gSaison) nSaisonG++;
  }
  const parSaison = gSaison !== null && nSaisonG >= C.minimumSaisonEquipe;
  out.g_saison = gSaison;
  out.g_bp_dom = 0;
  out.g_bc_dom = 0;
  out.g_n_dom = 0;
  out.g_bp_ext = 0;
  out.g_bc_ext = 0;
  out.g_n_ext = 0;
  for (let i = 0; i < n; i++) {
    const f = club[i];
    if (f.league !== L || (parSaison && f.saison !== gSaison)) continue;
    if (aDomicile(f)) {
      out.g_bp_dom += Number(f.bp);
      out.g_bc_dom += Number(f.bc);
      out.g_n_dom++;
    } else {
      out.g_bp_ext += Number(f.bp);
      out.g_bc_ext += Number(f.bc);
      out.g_n_ext++;
    }
  }
  return out;
}

/**
 * Les colonnes de league_day (§3.2 (e)) pour le championnat `cible.league` au
 * jour `cible.date`, depuis les faits du championnat (un par rencontre, vus du
 * camp qui reçoit : bp = buts à domicile), tous d'un jour strictement
 * antérieur (sinon on lève). Les sommes et les comptes ; le lecteur divise.
 */
export function avantLigue(faitsDeLaLigue, cible) {
  const faits = faitsDeLaLigue ?? [];
  return avantLigueSur(faits, faits.length, cible);
}

/** La même règle sur les `fin` premiers faits (aucune copie : la construction la calcule pour chaque jour de match). */
function avantLigueSur(faitsDeLaLigue, fin, cible) {
  const jour = jourDe(cible?.date);
  const L = cible.league;
  const faits = anterieurs(faitsDeLaLigue, jour, 'avantLigue', fin);
  const n = Math.min(fin, faits.length);
  const saisonJ = cible.saison ?? seasonOf(L, jour);
  // (e1) leagueAveragesBefore : attribués exclus, hors classement exclus ; la saison de J, moins de 30 : les 365 jours.
  let nSaison = 0;
  for (let i = 0; i < n; i++) {
    const f = faits[i];
    if (f.league === L && !f.attribue && f.compte && f.saison === saisonJ) nSaison++;
  }
  let source = 'saison';
  const unAn = joursAvant(jour, C.joursRepli);
  const parSaison = nSaison >= C.minimumSaisonLigue;
  if (!parSaison) source = '365 jours';
  const out = { l_source: source, l_n: 0, l_bd: 0, l_be: 0, l_xg_n: 0, l_xd: 0, l_xe: 0, l_cad_n: 0, l_cd: 0, l_ce: 0 };
  for (let i = 0; i < n; i++) {
    const f = faits[i];
    if (f.league !== L || f.attribue || !f.compte) continue;
    if (parSaison ? f.saison !== saisonJ : f.date < unAn) continue;
    out.l_n++;
    out.l_bd += Number(f.bp);
    out.l_be += Number(f.bc);
    if (nombre(f.xg_p) !== null && nombre(f.xg_c) !== null) {
      out.l_xg_n++;
      out.l_xd += Number(f.xg_p);
      out.l_xe += Number(f.xg_c);
    }
    // Tirs cadrés : les deux non NULL, SANS règle 0-0 (comme scoreFormRead).
    if (nombre(f.cadres_p) !== null && nombre(f.cadres_c) !== null) {
      out.l_cad_n++;
      out.l_cd += Number(f.cadres_p);
      out.l_ce += Number(f.cadres_c);
    }
  }
  if (out.l_n < C.minimumLigue) out.l_source = 'défaut';
  // (e2) Le classement calculé : la saison la plus récente de L avec un match avant J, hors classement exclus, attribués comptés.
  let cSaison = null;
  for (let i = n - 1; i >= 0; i--) {
    if (faits[i].league === L) {
      cSaison = faits[i].saison;
      break;
    }
  }
  out.c_saison = cSaison;
  out.c_n = 0;
  out.c_bd = 0;
  out.c_be = 0;
  if (cSaison !== null) {
    for (let i = 0; i < n; i++) {
      const f = faits[i];
      if (f.league !== L || f.saison !== cSaison || !f.compte) continue;
      out.c_n++;
      out.c_bd += Number(f.bp);
      out.c_be += Number(f.bc);
    }
  }
  return out;
}

/**
 * Les colonnes « avant » d'une ligne de joueur (§3.5) : ses 10 dernières
 * apparitions JOUÉES, toutes compétitions et tous clubs, d'un jour
 * strictement antérieur (sinon on lève), du plus récent au plus ancien (à
 * date égale : clé décroissante), attribués exclus (la feuille d'un match
 * attribué ne décrit pas un match). Faits décodés (note 7,42, xG 0,38).
 * Avec `depuis` (un jour) : aussi les cumuls depuis ce jour, ce que lit
 * statsDesJoueurs (toutes les feuilles de la période, comme elle).
 */
export function avantJoueur(faitsDuJoueur, cible, { depuis = null } = {}) {
  const faits = faitsDuJoueur ?? [];
  return avantJoueurSur(faits, faits.length, cible, { depuis });
}

/** La même règle sur les `fin` premiers faits (aucune copie : la construction la calcule pour chaque ligne). */
function avantJoueurSur(faitsDuJoueur, fin, cible, { depuis = null } = {}) {
  const jour = jourDe(cible?.date);
  const faits = anterieurs(faitsDuJoueur, jour, 'avantJoueur', fin);
  const total = Math.min(fin, faits.length);
  let n = 0;
  let min = 0;
  let noteS = 0;
  let noteN = 0;
  let buts = 0;
  let xg = 0;
  let xgN = 0;
  for (let i = total - 1; i >= 0 && n < C.apparitions; i--) {
    const f = faits[i];
    if (!f.joue || f.attribue) continue;
    n++;
    if (nombre(f.minutes) !== null) min += Number(f.minutes);
    if (nombre(f.note) !== null) {
      noteS += Math.round(Number(f.note) * 100);
      noteN++;
    }
    buts += nombre(f.buts) ?? 0;
    if (nombre(f.xg) !== null) {
      xg += Math.round(Number(f.xg) * 1000);
      xgN++;
    }
  }
  const out = { a10_n: n, a10_min: min, a10_note_s: noteS, a10_note_n: noteN, a10_buts: buts, a10_xg: xgN ? xg : null };
  if (depuis) {
    const debut = jourDe(depuis);
    const periode = faits.slice(0, total).filter((f) => f.date >= debut);
    const notes = periode.filter((f) => nombre(f.note) !== null);
    const avecXg = periode.filter((f) => nombre(f.xg) !== null);
    out.depuis = {
      depuis: debut,
      feuilles: periode.length,
      apparitions: periode.filter((f) => nombre(f.minutes) !== null && Number(f.minutes) > 0).length,
      titularisations: periode.filter((f) => f.titulaire === true || f.titulaire === 1).length,
      minutes: periode.reduce((s, f) => s + (nombre(f.minutes) ?? 0), 0),
      buts: periode.reduce((s, f) => s + (nombre(f.buts) ?? 0), 0),
      passes: periode.reduce((s, f) => s + (nombre(f.passes_d) ?? 0), 0),
      xg: avecXg.length ? Math.round(avecXg.reduce((s, f) => s + Math.round(Number(f.xg) * 1000), 0) / 10) / 100 : null,
      note: notes.length ? Math.round(notes.reduce((s, f) => s + Math.round(Number(f.note) * 100), 0) / notes.length) / 100 : null
    };
  }
  return out;
}

/** Statistiques d'une fenêtre : colonnes pour (p) et contre (c) des faits d'équipe. */
const STATS_FENETRE = Object.freeze({
  buts: ['bp', 'bc'],
  buts90: ['bp90', 'bc90'],
  xg: ['xg_p', 'xg_c'],
  tirs: ['tirs_p', 'tirs_c'],
  cadres: ['cadres_p', 'cadres_c'],
  corners: ['corners_p', 'corners_c'],
  jaunes: ['jaunes_p', 'jaunes_c'],
  rouges: ['rouges_p', 'rouges_c'],
  fautes: ['fautes_p', 'fautes_c'],
  occasions: ['occasions_p', 'occasions_c']
});
/** La règle 0-0 (« non relevé ») par défaut : oui pour les comptes de FotMob, non pour les buts et les xG. */
const RELEVE_PAR_DEFAUT = new Set(['tirs', 'cadres', 'corners', 'jaunes', 'rouges', 'fautes', 'occasions']);

/**
 * UNE FENÊTRE À LA DEMANDE (§3.3) : les `n` derniers matchs JOUÉS d'une liste
 * de faits d'équipe (toutes compétitions, ou `league`), depuis `depuis` (un
 * jour, compris), en écartant `exclure` (attribues, prolongations,
 * horsClassement, coupes), et les seuls matchs où la statistique est relevée :
 * les deux valeurs connues, et — avec `releve` — pas 0 et 0 ; les rouges ne
 * comptent que si les jaunes sont relevés (cartonsReleves : le piège des
 * jaunes à 0 de 2026). Rend { pour, contre, n, matchs } — les moyennes par
 * match, sans arrondi, et les faits retenus du plus récent au plus ancien.
 * Rien ici n'entre dans le moteur : c'est ce que 18 étalonnera et 29 pondérera.
 */
export function fenetre(faits, { n = 10, stat, league = null, exclure = ['attribues'], releve = null, depuis = null } = {}) {
  const cols = STATS_FENETRE[stat];
  if (!cols) throw new Error(`fenetre : statistique inconnue « ${stat} » (attendu : ${Object.keys(STATS_FENETRE).join(', ')})`);
  for (const e of exclure) if (!EXCLUSIONS.includes(e)) throw new Error(`fenetre : exclusion inconnue « ${e} » (attendu : ${EXCLUSIONS.join(', ')})`);
  const regle = releve ?? RELEVE_PAR_DEFAUT.has(stat);
  const ecarte = new Set(exclure);
  const tries = [...(faits ?? [])].sort(ordreChronologique);
  const matchs = [];
  let pour = 0;
  let contre = 0;
  for (let i = tries.length - 1; i >= 0 && matchs.length < n; i--) {
    const f = tries[i];
    if (league && f.league !== league) continue;
    if (depuis && f.date < depuis) continue;
    if (ecarte.has('attribues') && f.attribue) continue;
    if (ecarte.has('prolongations') && f.prolongation) continue;
    if (ecarte.has('horsClassement') && !f.compte) continue;
    if (ecarte.has('coupes') && f.coupe) continue;
    let paire;
    if (stat === 'rouges' && regle) {
      const cartons = cartonsReleves(f.jaunes_p, f.jaunes_c, f.rouges_p, f.rouges_c);
      paire = cartons && cartons.rouges !== null ? [Number(f.rouges_p), Number(f.rouges_c)] : null;
    } else if (regle) {
      paire = paireRelevee(f[cols[0]], f[cols[1]]);
    } else {
      const x = nombre(f[cols[0]]);
      const y = nombre(f[cols[1]]);
      paire = x === null || y === null ? null : [x, y];
    }
    if (!paire) continue;
    pour += paire[0];
    contre += paire[1];
    matchs.push(f);
  }
  return { pour: matchs.length ? pour / matchs.length : null, contre: matchs.length ? contre / matchs.length : null, n: matchs.length, matchs };
}

// ======================================================= décodage (lecteurs)

const COLONNES_TEAM_DAY = ['rencontre', 'camp', ...FAITS_EQUIPE, ...AVANT_EQUIPE];

/**
 * Une ligne de team_day (+ match_key) → un fait d'équipe décodé : identifiants « fotmob-… », drapeaux en vrai/faux.
 * Exportée pour le banc d'essai (étape 19), qui lit les lignes lui-même, par tranches, au lieu d'entreesMoteur.
 */
export function faitEquipeDecode(r) {
  const f = {
    rencontre: r.rencontre,
    matchKey: r.match_key ?? null,
    date: r.date,
    league: r.league,
    saison: r.saison,
    home: r.camp === 1,
    club: enFotmob(r.club),
    adversaire: enFotmob(r.adversaire),
    attribue: r.attribue === 1,
    prolongation: r.prolongation === 1,
    compte: r.compte === 1,
    coupe: r.coupe === 1,
    releve: r.releve === 1
  };
  for (const c of FAITS_EQUIPE.slice(10)) f[c] = r[c] ?? null;
  return f;
}

const LIBELLE_POSTE = Object.freeze(Object.fromEntries(Object.entries(POSTES).map(([p, i]) => [i, p])));
const diviser = (v, par) => (v === null || v === undefined ? null : v / par);
const vraiFaux = (v) => (v === null || v === undefined ? null : v === 1);

/** Une ligne de player_day (+ match_key, attribue) → un fait de joueur décodé (note 7,42, xG 0,38). */
function faitJoueurDecode(r) {
  return {
    joueur: enFotmob(r.joueur),
    date: r.date,
    rencontre: r.rencontre,
    matchKey: r.match_key ?? null,
    attribue: r.attribue === 1,
    club: enFotmob(r.club),
    home: r.camp === 1,
    joue: r.joue === 1,
    titulaire: vraiFaux(r.titulaire),
    entre: vraiFaux(r.entre),
    poste: r.poste === null || r.poste === undefined ? null : LIBELLE_POSTE[r.poste] ?? null,
    minutes: r.minutes ?? null,
    note: diviser(r.note, 100),
    buts: r.buts ?? null,
    passes_d: r.passes_d ?? null,
    tirs: r.tirs ?? null,
    cadres: r.cadres ?? null,
    xg: diviser(r.xg, 1000),
    xa: diviser(r.xa, 1000),
    xgnp: diviser(r.xgnp, 1000),
    xgot: diviser(r.xgot, 1000),
    pc: r.pc ?? null,
    recup: r.recup ?? null,
    duels_g: r.duels_g ?? null,
    duels_t: r.duels_t ?? null,
    buts_evites: diviser(r.buts_evites, 100),
    buts_concedes: r.buts_concedes ?? null,
    jaunes: r.jaunes ?? null,
    rouges: r.rouges ?? null,
    entre_min: r.entre_min ?? null,
    sorti_min: r.sorti_min ?? null,
    csc: r.csc ?? null
  };
}

/** Les fenêtres (a) décodées : la forme de statInputsFromStore. */
function f10Moteur(r) {
  const out = {};
  for (const [s, cle] of STATS_F10) {
    const n = r[`f10_${s}_n`];
    out[cle] = n >= C.minimumFenetre ? { for: r[`f10_${s}_p`] / n, against: r[`f10_${s}_c`] / n, sample: n } : null;
  }
  return out;
}

/** (c) décodée : la forme de saisonDansLigue ; null si aucune rencontre. */
function saisonMoteur(r) {
  const n = (r.s_n_dom ?? 0) + (r.s_n_ext ?? 0);
  if (!n) return null;
  const moy = (s, k) => (k ? s / k : null);
  return {
    forHome: moy(r.s_bp_dom, r.s_n_dom),
    againstHome: moy(r.s_bc_dom, r.s_n_dom),
    forAway: moy(r.s_bp_ext, r.s_n_ext),
    againstAway: moy(r.s_bc_ext, r.s_n_ext),
    matches: n,
    inSeason: r.s_en_saison === 1
  };
}

/** (d) décodée : la forme de teamGoalsFromStore (même arrondi à deux décimales), sans `dates`. */
function butsMoteur(r) {
  const n = (r.g_n_dom ?? 0) + (r.g_n_ext ?? 0);
  if (!n) return null;
  const moy = (s, k) => (k ? Number((s / k).toFixed(2)) : null);
  return {
    for: { home: moy(r.g_bp_dom, r.g_n_dom), away: moy(r.g_bp_ext, r.g_n_ext), total: moy(r.g_bp_dom + r.g_bp_ext, n) },
    against: { home: moy(r.g_bc_dom, r.g_n_dom), away: moy(r.g_bc_ext, r.g_n_ext), total: moy(r.g_bc_dom + r.g_bc_ext, n) },
    fixturesPlayed: n,
    teamId: enFotmob(r.club)
  };
}

/** (e1) décodée : la forme de leagueAveragesBefore. */
export function moyennesDeLaLigne(l) {
  if (!l || l.l_source === 'défaut') return { goals: { ...C.defaut }, xg: { ...C.defaut }, shotsOnTarget: null, matches: l?.l_n ?? 0, source: 'défaut' };
  const goals = { home: l.l_bd / l.l_n, away: l.l_be / l.l_n };
  return {
    goals,
    xg: l.l_xg_n >= C.minimumXg ? { home: l.l_xd / l.l_xg_n, away: l.l_xe / l.l_xg_n } : { ...goals },
    shotsOnTarget: l.l_cad_n >= C.minimumXg ? { home: l.l_cd / l.l_cad_n, away: l.l_ce / l.l_cad_n } : null,
    matches: l.l_n,
    source: l.l_source
  };
}

/** (e2) décodée : la forme de getLeagueGoalAverages (classement calculé, trois décimales) ; null sans match. */
export function classementDeLaLigne(l) {
  if (!l || !l.c_n) return null;
  return { home: Number((l.c_bd / l.c_n).toFixed(3)), away: Number((l.c_be / l.c_n).toFixed(3)) };
}

// ======================================================= lecture

const tableAbsente = (error) => /no such table/i.test(String(error?.message ?? ''));

/**
 * L'état de la table, tel que l'écrit la dernière construction ou nuit : ce
 * que lisent la carte de Réglages, la route, `due` et le bilan. JAMAIS de
 * calcul ni d'écriture (les comptes sont ceux notés à la fin de la dernière
 * passe). Sans table ou jamais construite : `absente: true` et la même forme.
 */
export function etatTableJourJ({ database = openDb() } = {}) {
  let brut = null;
  try {
    brut = Object.fromEntries(database.prepare('SELECT cle, valeur FROM day_state').all().map((r) => [r.cle, r.valeur]));
  } catch (error) {
    if (!tableAbsente(error)) throw error;
  }
  const lireJson = (texte) => {
    try {
      return texte ? JSON.parse(texte) : null;
    } catch {
      return null;
    }
  };
  const version = brut?.version ? Number(brut.version) : null;
  const comptes = lireJson(brut?.comptes) ?? {};
  const controle = lireJson(brut?.controle);
  const absente = !brut || version === null || !brut.construite_le;
  return {
    absente,
    version,
    versionAttendue: VERSION_TABLE_JOUR,
    rencontres: comptes.rencontres ?? 0,
    lignesEquipe: comptes.lignesEquipe ?? 0,
    lignesJoueur: comptes.lignesJoueur ?? 0,
    lignesLigue: comptes.lignesLigue ?? 0,
    joueurs: comptes.joueurs ?? 0,
    clubs: comptes.clubs ?? 0,
    dernierJour: brut?.dernier_jour ?? null,
    repere: { updatedAt: brut?.repere_updated_at ?? null, merges: brut?.repere_merges ?? null },
    construiteLe: brut?.construite_le ?? null,
    miseAJourLe: brut?.mise_a_jour_le ?? null,
    enCours: brut?.en_cours ?? null,
    controle: controle ? { le: controle.le ?? null, lignes: controle.lignes ?? 0, ecarts: controle.ecarts ?? [], graine: controle.graine ?? null, pasFait: controle.pasFait ?? null } : null,
    refusees: lireJson(brut?.refusees) ?? [],
    // Une passe commencée et pas terminée (en cours, ou interrompue) : pas à jour — la suivante la reprend.
    aJour: !absente && version === VERSION_TABLE_JOUR && !brut?.en_cours
  };
}

/** La ligne d'un camp de la table (side : 'home' | 'away' | 1 | 0), décodée ; null si la rencontre n'y est pas. */
export function ligneEquipe(matchKey, side, { database = openDb() } = {}) {
  const camp = side === 'home' || side === 1 || side === true ? 1 : 0;
  const r = database
    .prepare(`SELECT t.*, d.match_key FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre WHERE d.match_key = ? AND t.camp = ?`)
    .get(String(matchKey), camp);
  if (!r) return null;
  const faits = faitEquipeDecode(r);
  return {
    rencontre: r.rencontre,
    matchKey: r.match_key,
    date: r.date,
    league: r.league,
    saison: r.saison,
    club: faits.club,
    adversaire: faits.adversaire,
    home: camp === 1,
    faits,
    avant: avantDecode(r)
  };
}

function avantDecode(r) {
  return {
    f10: Object.fromEntries(STATS_F10.map(([s]) => [s, { sommePour: r[`f10_${s}_p`], sommeContre: r[`f10_${s}_c`], n: r[`f10_${s}_n`] }])),
    f5: [1, 2, 3, 4, 5].map((k) => r[`f5_${k}`]).filter((x) => x !== null && x !== undefined),
    saison: { bpDom: r.s_bp_dom, bcDom: r.s_bc_dom, nDom: r.s_n_dom, bpExt: r.s_bp_ext, bcExt: r.s_bc_ext, nExt: r.s_n_ext, enSaison: r.s_en_saison === 1 },
    buts: { saison: r.g_saison, bpDom: r.g_bp_dom, bcDom: r.g_bc_dom, nDom: r.g_n_dom, bpExt: r.g_bp_ext, bcExt: r.g_bc_ext, nExt: r.g_n_ext }
  };
}

/** Les deux camps d'une rencontre et la ligne de son championnat ce jour-là. */
export function lignesDuMatch(matchKey, { database = openDb() } = {}) {
  const home = ligneEquipe(matchKey, 'home', { database });
  const away = ligneEquipe(matchKey, 'away', { database });
  if (!home && !away) return null;
  const r = home ?? away;
  return { home, away, ligue: ligneLigue(r.league, r.date, { database }) };
}

/**
 * La ligne d'un championnat un jour donné : celle de league_day, ou — pour un
 * jour sans match du championnat (un match à venir) — la MÊME fonction
 * (avantLigue) appliquée à la volée aux faits d'avant ce jour. Colonnes
 * brutes, plus `moyennes` (e1) et `classement` (e2) décodés.
 */
export function ligneLigue(league, date, { database = openDb() } = {}) {
  const jour = jourDe(date);
  let l = database.prepare(`SELECT ${COLONNES_LIGUE.join(', ')} FROM league_day WHERE league = ? AND date = ?`).get(league, jour) ?? null;
  const stockee = Boolean(l);
  if (!l) l = avantLigue(faitsLigue(league, { avant: jour, database }), { date: jour, league, saison: seasonOf(league, jour) });
  return { league, date: jour, stockee, ...l, moyennes: moyennesDeLaLigne(l), classement: classementDeLaLigne(l) };
}

/**
 * Les faits d'un club, chronologiques (jour, puis clé), toutes compétitions
 * (ou `league`), d'un jour < `avant` et ≥ `depuis`. Décodés.
 */
export function faitsEquipe(teamId, { avant = null, depuis = null, league = null, database = openDb() } = {}) {
  const club = numeroFotmob(teamId);
  const conditions = ['t.club = ?'];
  const args = [club];
  if (avant) {
    conditions.push('t.date < ?');
    args.push(jourDe(avant));
  }
  if (depuis) {
    conditions.push('t.date >= ?');
    args.push(jourDe(depuis));
  }
  if (league) {
    conditions.push('t.league = ?');
    args.push(league);
  }
  return database
    .prepare(`SELECT t.*, d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE ${conditions.join(' AND ')}`)
    .all(...args)
    .map(faitEquipeDecode)
    .sort(ordreChronologique);
}

/** Les faits d'un championnat (une ligne par rencontre, vue du camp qui reçoit), chronologiques. Décodés. */
export function faitsLigue(league, { avant = null, depuis = null, database = openDb() } = {}) {
  const conditions = ['d.league = ?'];
  const args = [league];
  if (avant) {
    conditions.push('d.date < ?');
    args.push(jourDe(avant));
  }
  if (depuis) {
    conditions.push('d.date >= ?');
    args.push(jourDe(depuis));
  }
  return database
    .prepare(`SELECT t.*, d.match_key FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1 WHERE ${conditions.join(' AND ')}`)
    .all(...args)
    .map(faitEquipeDecode)
    .sort(ordreChronologique);
}

const SELECTION_JOUEUR = `SELECT p.*, d.match_key, COALESCE(t.attribue, 0) AS attribue
  FROM player_day p JOIN day_matches d ON d.rencontre = p.rencontre
  LEFT JOIN team_day t ON t.rencontre = p.rencontre AND t.camp = 1`;

/** Les faits d'un joueur, chronologiques, décodés, d'un jour < `avant` et ≥ `depuis`. */
export function faitsJoueur(playerId, { avant = null, depuis = null, database = openDb() } = {}) {
  const joueur = numeroFotmob(playerId);
  const conditions = ['p.joueur = ?'];
  const args = [joueur];
  if (avant) {
    conditions.push('p.date < ?');
    args.push(jourDe(avant));
  }
  if (depuis) {
    conditions.push('p.date >= ?');
    args.push(jourDe(depuis));
  }
  return database
    .prepare(`${SELECTION_JOUEUR} WHERE ${conditions.join(' AND ')}`)
    .all(...args)
    .map(faitJoueurDecode)
    .sort(ordreChronologique);
}

/** Les faits de plusieurs joueurs : Map identifiant → faits chronologiques. */
export function faitsDesJoueurs(playerIds, { avant = null, database = openDb() } = {}) {
  const out = new Map();
  for (const id of new Set(playerIds ?? [])) out.set(String(id), faitsJoueur(id, { avant, database }));
  return out;
}

const pauseSimple = () => new Promise((fin) => setImmediate(fin));

/** Parcourt les clubs un par un (faits chronologiques), sans tout charger ; rend la main entre deux. */
export async function parcourirEquipes(cb, { database = openDb(), rendreLaMain = pauseSimple } = {}) {
  const clubs = database.prepare('SELECT DISTINCT club FROM team_day ORDER BY club').all().map((r) => r.club);
  for (const club of clubs) {
    await cb(faitsEquipe(enFotmob(club), { database }), enFotmob(club));
    if (rendreLaMain) await rendreLaMain();
  }
  return clubs.length;
}

/** Parcourt les joueurs un par un (faits chronologiques), sans tout charger ; rend la main entre deux. */
export async function parcourirJoueurs(cb, { database = openDb(), rendreLaMain = pauseSimple } = {}) {
  let apres = 0;
  let n = 0;
  const suivants = database.prepare('SELECT DISTINCT joueur FROM player_day WHERE joueur > ? ORDER BY joueur LIMIT 500');
  for (;;) {
    const joueurs = suivants.all(apres).map((r) => r.joueur);
    if (!joueurs.length) break;
    for (const j of joueurs) {
      await cb(faitsJoueur(enFotmob(j), { database }), enFotmob(j));
      n++;
    }
    apres = joueurs.at(-1);
    if (rendreLaMain) await rendreLaMain();
  }
  return n;
}

// ======================================================= les entrées du moteur

/** `last` de scoreFormRead, depuis les faits des rencontres référencées (dans l'ordre stocké). */
function formeMoteur(refs, faitsParRencontre, noms, nomsDuMagasin) {
  const last = [];
  for (const ref of refs) {
    const f = faitsParRencontre.get(ref);
    if (!f) continue;
    const xgOk = f.xg_p !== null && f.xg_c !== null;
    const tirsOk = f.cadres_p !== null && f.cadres_c !== null;
    last.push({
      matchKey: f.matchKey,
      date: f.date,
      league: f.league,
      home: f.home,
      opponentId: f.adversaire,
      opponentName: noms.get(f.adversaire) ?? nomsDuMagasin(f.matchKey, f.home) ?? null,
      goalsFor: f.bp,
      goalsAgainst: f.bc,
      xgFor: xgOk ? Number(f.xg_p) : null,
      xgAgainst: xgOk ? Number(f.xg_c) : null,
      shotsOnTargetFor: tirsOk ? Number(f.cadres_p) : null,
      shotsOnTargetAgainst: tirsOk ? Number(f.cadres_c) : null,
      result: f.bp > f.bc ? 'V' : f.bp === f.bc ? 'N' : 'D'
    });
  }
  return last;
}

/** Le nom d'un adversaire tel que la rencontre l'a gardé (le repli de scoreFormRead quand l'annuaire ne le connaît pas). */
function nomsDesRencontres(database) {
  const st = database.prepare('SELECT home_name, away_name FROM matches WHERE match_key = ?');
  return (matchKey, home) => {
    const r = st.get(matchKey);
    return r ? (home ? r.away_name : r.home_name) : null;
  };
}

/**
 * La forme moteur d'un camp, depuis les colonnes « avant » d'une ligne et les faits de son club (seuls ceux des
 * cinq rencontres de la forme sont lus). Exportée pour le banc d'essai (étape 19) : la MÊME conversion
 * « colonnes → formes des lecteurs » pour le magasin et pour football-data, jamais une seconde formule.
 */
export function campMoteur(r, faitsDuClub, noms, nomsDuMagasin, nomDuClub) {
  const parRencontre = new Map(faitsDuClub.map((f) => [f.rencontre, f]));
  const refs = [1, 2, 3, 4, 5].map((k) => r[`f5_${k}`]).filter((x) => x !== null && x !== undefined);
  const teamId = enFotmob(r.club);
  return {
    stat: f10Moteur(r),
    score: { name: noms.get(teamId) ?? nomDuClub ?? null, teamId, last: formeMoteur(refs, parRencontre, noms, nomsDuMagasin), season: saisonMoteur(r) },
    buts: butsMoteur(r)
  };
}

/** Les entrées du moteur d'une rencontre, depuis ses deux camps (campMoteur) et la ligne de son championnat. Exportée pour le banc (étape 19). */
export function assembler(dom, ext, date, ligne) {
  return {
    statInputs: { home: dom.stat, away: ext.stat },
    scoreInputs: { date, league: moyennesDeLaLigne(ligne), home: dom.score, away: ext.score },
    teamGoals: { home: dom.buts, away: ext.buts },
    leagueGoalAverages: classementDeLaLigne(ligne)
  };
}

/**
 * Les entrées du moteur pour une rencontre STOCKÉE, depuis la table :
 * EXACTEMENT la forme des lecteurs d'aujourd'hui (§6.2) —
 *   statInputs  = { home: { corners, shots, shotsOnTarget }, away }   (statInputsFromStore)
 *   scoreInputs = { date, league, home: { name, teamId, last, season }, away }   (scoreInputsFromStore)
 *   teamGoals   = { home: { for, against, fixturesPlayed, teamId }, away }   (teamGoalsFromStore, sans `dates`)
 *   leagueGoalAverages = { home, away } | null   (getLeagueGoalAverages, classement calculé)
 * null si la rencontre n'est pas dans la table.
 */
export function entreesMoteur(matchKey, { database = openDb() } = {}) {
  const lignes = database
    .prepare('SELECT t.*, d.match_key, m.home_name, m.away_name FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre LEFT JOIN matches m ON m.match_key = d.match_key WHERE d.match_key = ?')
    .all(String(matchKey));
  const dom = lignes.find((r) => r.camp === 1);
  const ext = lignes.find((r) => r.camp === 0);
  if (!dom || !ext) return null;
  const noms = canonicalTeamNames({ database });
  const nomsDuMagasin = nomsDesRencontres(database);
  const camp = (r, nom) => campMoteur(r, faitsEquipe(enFotmob(r.club), { avant: r.date, database }), noms, nomsDuMagasin, nom);
  return assembler(camp(dom, dom.home_name), camp(ext, dom.away_name), dom.date, ligneLigue(dom.league, dom.date, { database }));
}

/**
 * La même chose pour un match À VENIR, ou absent de la table : calculée depuis
 * les faits d'avant `date` par les mêmes règles que la construction
 * (avantEquipe, avantLigue). `homeId`, `awayId` : « fotmob-… ».
 */
export function entreesMoteurAvant({ homeId, awayId, league, date, homeName = null, awayName = null }, { database = openDb() } = {}) {
  const jour = jourDe(date);
  const saison = seasonOf(league, jour);
  const ligue = faitsLigue(league, { avant: jour, database });
  const noms = canonicalTeamNames({ database });
  const nomsDuMagasin = nomsDesRencontres(database);
  const camp = (teamId, nom) => {
    const faits = faitsEquipe(teamId, { avant: jour, database });
    const avant = avantEquipe(faits, ligue, { date: jour, league, saison, matchKey: null });
    return campMoteur({ ...avant, club: numeroFotmob(teamId) }, faits, noms, nomsDuMagasin, nom);
  };
  return assembler(camp(homeId, homeName), camp(awayId, awayName), jour, avantLigue(ligue, { date: jour, league, saison }));
}

// ======================================================= construction et nuit

const rendreLaMainParDefaut = () => new Promise((fin) => setImmediate(fin));

/** Une transaction d'écriture ; ROLLBACK et l'erreur remontée à la première panne. */
function enTransaction(database, travail) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const r = travail();
    database.exec('COMMIT');
    return r;
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // déjà annulée (disque plein, erreur d'E/S)
    }
    throw error;
  }
}

/**
 * Le contexte d'une passe : rendre la main toutes les ~25 ms (le patron de
 * leagueBenchmarks.js), le plus long moment passé sans la rendre, les pauses,
 * la mémoire et le journal maximum, le temps de chaque partie.
 *
 * LE JOURNAL : SQLite le reporte lui-même dans la base dès 1 000 pages (~4
 * Mo), au moment où une transaction se valide — ~40 ms de synchronisation du
 * disque sur ce PC (mesuré le 12/10), le plus long moment d'une tranche. Le
 * faire à part, journal coupé, n'a rien raccourci (le disque coûte autant) et
 * en multipliait le nombre : le report automatique est gardé.
 */
function nouveauContexte({ database, rendreLaMain, budgetTrancheMs }) {
  const ceder = rendreLaMain
    ? () =>
        new Promise((fin) => {
          const r = rendreLaMain(fin);
          if (r && typeof r.then === 'function') r.then(fin, fin);
        })
    : null;
  let fichierWal = null;
  try {
    const lieu = typeof database.location === 'function' ? database.location() : null;
    fichierWal = lieu ? `${lieu}-wal` : null;
  } catch {
    fichierWal = null;
  }
  const ctx = {
    database,
    budgetMs: budgetTrancheMs ?? (rendreLaMain ? 20 : Number.POSITIVE_INFINITY),
    lectures: LECTURES,
    dernierePause: horloge(),
    blocMax: { ms: 0, ou: null },
    pauses: 0,
    tranches: 0,
    rssMax: process.memoryUsage.rss(),
    walMax: 0,
    etapesMs: {},
    async pause(ou) {
      const ms = horloge() - ctx.dernierePause;
      if (ms > ctx.blocMax.ms) ctx.blocMax = { ms, ou: ou ?? null };
      ctx.mesurer();
      if (ceder) {
        ctx.pauses++;
        await ceder();
      }
      ctx.dernierePause = horloge();
    },
    async siLongtemps(ou) {
      if (horloge() - ctx.dernierePause > 25) await ctx.pause(ou);
    },
    /**
     * Attend un travail fait AILLEURS (un processus à part) : le serveur est libre pendant ce temps, qui ne compte pas
     * comme tenu. `lancer` ne part qu'APRÈS la pause : une promesse rejetée pendant la pause, avant qu'on l'attende,
     * serait un rejet non traité (et arrêterait le processus).
     */
    async attendre(lancer, ou) {
      await ctx.pause(ou);
      try {
        return await lancer();
      } finally {
        ctx.dernierePause = horloge();
      }
    },
    /** Mémoire et taille du journal au plus haut ; rend la taille actuelle du journal (0 sans fichier). */
    mesurer() {
      const rss = process.memoryUsage.rss();
      if (rss > ctx.rssMax) ctx.rssMax = rss;
      if (!fichierWal) return 0;
      try {
        const t = fs.statSync(fichierWal).size;
        if (t > ctx.walMax) ctx.walMax = t;
        return t;
      } catch {
        return 0; // pas de journal
      }
    },
    chrono(partie, debut) {
      ctx.etapesMs[partie] = (ctx.etapesMs[partie] ?? 0) + (horloge() - debut);
    },
    /**
     * Écrit des lignes par transactions de `taille` au plus — et, quand le
     * serveur attend (budget), jamais plus de ~20 ms d'affilée : une
     * transaction n'est JAMAIS gardée ouverte pendant qu'on rend la main.
     */
    async ecrire(lignes, ecrireUne, { taille, ou } = {}) {
      let i = 0;
      let n = 0;
      while (i < lignes.length) {
        const debut = horloge();
        const fin = Math.min(lignes.length, i + taille);
        enTransaction(database, () => {
          for (; i < fin; i++) {
            ecrireUne(lignes[i]);
            if ((i & 63) === 63 && horloge() - debut > ctx.budgetMs) {
              i++;
              break;
            }
          }
        });
        n++;
        ctx.tranches++;
        await ctx.pause(ou);
      }
      return n;
    }
  };
  return ctx;
}

const json = (liste) => JSON.stringify(liste);

/**
 * LIRE SANS GONFLER LE TAS DE NODE. node:sqlite rend chaque ligne en objet
 * SANS PROTOTYPE : ~1,7 Ko pour 30 colonnes, contre ~0,3 Ko pour un tableau ou
 * un objet ordinaire (mesuré le 12/10/2026). Sur les millions de lignes d'une
 * construction, c'est ce qui faisait grossir la réserve du tas de Node, donc
 * la mémoire du processus (+500 Mo). Les requêtes lourdes se lisent donc en
 * tableaux, recopiés en objets ordinaires d'une seule forme (mêmes noms de
 * méthodes : iterate, all, get).
 */
function lecteur(statement) {
  statement.setReturnArrays(true);
  const noms = statement.columns().map((c) => c.name);
  const objet = new Function('t', `return { ${noms.map((n, i) => `${JSON.stringify(n)}: t[${i}]`).join(', ')} };`);
  return {
    *iterate(...args) {
      for (const t of statement.iterate(...args)) yield objet(t);
    },
    all: (...args) => statement.all(...args).map(objet),
    get: (...args) => {
      const t = statement.get(...args);
      return t === undefined ? undefined : objet(t);
    }
  };
}

/**
 * Lecture légère du magasin, par tranches de clés (le `lireLeMagasin` de
 * leagueBenchmarks.js) : jamais les colonnes JSON (déroulé, composition).
 * Rend directement les entrées du registre (une rencontre dont un club n'a pas
 * d'identifiant FotMob bien formé est refusée, comptée, jamais rangée sous 0).
 */
async function lireLeMagasin(database, ctx) {
  const tranche = lecteur(
    database.prepare(`SELECT match_key, fotmob_id, date, league, home_id, away_id, updated_at, home_goals, away_goals FROM matches WHERE match_key > ? ORDER BY match_key LIMIT ${ctx.lectures.legere}`)
  );
  const valides = new Map();
  const refusees = [];
  let lues = 0;
  let apres = '';
  for (;;) {
    const lignes = tranche.all(apres);
    if (!lignes.length) break;
    for (const r of lignes) {
      try {
        valides.set(r.match_key, entreeDuMagasin(r));
      } catch (error) {
        refusees.push({ matchKey: r.match_key, raison: error.message });
      }
    }
    lues += lignes.length;
    apres = lignes.at(-1).match_key;
    await ctx.siLongtemps('lecture légère du magasin');
  }
  return { valides, refusees, lues };
}

/** L'entrée du registre d'une rencontre du magasin ; lève si un club n'a pas d'identifiant FotMob bien formé. */
function entreeDuMagasin(r) {
  const home = numeroFotmob(r.home_id);
  const away = numeroFotmob(r.away_id);
  return {
    matchKey: r.match_key,
    fotmobId: r.fotmob_id ?? null,
    date: r.date,
    league: r.league ?? '',
    saison: seasonOf(r.league ?? '', r.date),
    home,
    away,
    updatedAt: r.updated_at ?? SANS_DATE,
    hg: r.home_goals,
    ag: r.away_goals,
    joue: r.home_goals !== null && r.home_goals !== undefined && r.away_goals !== null && r.away_goals !== undefined
  };
}

/**
 * Le registre stocké face au magasin, page par page (jamais gardé entier) :
 * les rencontres NOUVELLES (absentes du registre), MODIFIÉES (date de mise à
 * jour DIFFÉRENTE de celle du registre — différente, pas seulement plus
 * récente : une base restaurée peut revenir en arrière —, ou date,
 * championnat, clubs, identifiant FotMob changés) et DISPARUES (annulées,
 * fusionnées, re-clées : leur clé n'est plus au magasin). Pose `rencontre`
 * sur chaque entrée déjà connue.
 */
async function trierLeRegistre(database, ctx, valides) {
  const page = lecteur(
    database.prepare(`SELECT rencontre, match_key, fotmob_id, date, league, home, away, updated_at FROM day_matches WHERE rencontre > ? ORDER BY rencontre LIMIT ${ctx.lectures.registre}`)
  );
  const modifiees = [];
  const disparues = [];
  for (let apres = 0; ; ) {
    const lignes = page.all(apres);
    if (!lignes.length) break;
    for (const s of lignes) {
      const e = valides.get(s.match_key);
      if (!e) {
        disparues.push({ rencontre: s.rencontre, matchKey: s.match_key });
        continue;
      }
      e.rencontre = s.rencontre;
      const differente = s.updated_at !== e.updatedAt || s.date !== e.date || s.league !== e.league || s.home !== e.home || s.away !== e.away || (s.fotmob_id ?? null) !== e.fotmobId;
      if (differente) modifiees.push(e);
    }
    apres = lignes.at(-1).rencontre;
    await ctx.siLongtemps('lecture du registre');
  }
  const nouvelles = [];
  for (const e of valides.values()) if (e.rencontre === undefined) nouvelles.push(e);
  return { nouvelles, modifiees, disparues };
}

function lireEtatBrut(database) {
  try {
    return Object.fromEntries(database.prepare('SELECT cle, valeur FROM day_state').all().map((r) => [r.cle, r.valeur]));
  } catch (error) {
    if (tableAbsente(error)) return {};
    throw error;
  }
}

/** Le repère des fusions d'identité : nombre et date de la dernière (people_merges). */
function repereFusions(database) {
  const r = database.prepare('SELECT COUNT(*) n, MAX(created_at) m FROM people_merges').get();
  return `${r.n}|${r.m ?? ''}`;
}

const memesValeurs = (a, b, colonnes) => colonnes.every((c) => (a[c] ?? null) === (b[c] ?? null));
/**
 * La même comparaison, compilée une fois pour une liste fixe de colonnes (des
 * noms de colonnes du schéma, jamais une donnée) : ~5 fois plus rapide sur les
 * 2,2 millions de lignes joueur du contrôle de non-dérive.
 */
const comparateur = (colonnes) => new Function('a', 'b', `return ${colonnes.map((c) => `(a.${c} ?? null) === (b.${c} ?? null)`).join(' && ')};`);


/**
 * Vide les cinq tables (une autre version du calcul), par tranches : jamais
 * deux millions de lignes supprimées d'une seule transaction.
 */
async function viderLesTables(database, ctx) {
  // Par plages de clés : jamais des centaines de milliers de lignes d'une seule transaction.
  const parPlages = async (table, colonne, pas) => {
    const b = database.prepare(bornesDe(table, colonne)).get();
    if (b.mi === null) return;
    const supprimer = database.prepare(`DELETE FROM ${table} WHERE ${colonne} >= ? AND ${colonne} < ?`);
    for (let lo = b.mi; lo <= b.ma; lo += pas) {
      enTransaction(database, () => supprimer.run(lo, lo + pas));
      await ctx.pause(`vidage ${table}`);
    }
  };
  // league_day : ~20 000 petites lignes, d'un coup (quelques dizaines de millisecondes).
  enTransaction(database, () => database.exec('DELETE FROM league_day'));
  await ctx.pause('vidage league_day');
  await parPlages('team_day', 'rencontre', 2000);
  await parPlages('player_day', 'joueur', PAS_BALAYAGE_JOUEURS);
  await parPlages('day_matches', 'rencontre', 5000);
  enTransaction(database, () => {
    // Plus rien ne référence les anciens numéros : la numérotation des rencontres repart de 1.
    database.exec("DELETE FROM sqlite_sequence WHERE name = 'day_matches'");
    database.exec("DELETE FROM day_state WHERE cle <> 'en_cours'");
  });
}

/**
 * Les lignes joueur qui portent l'une de ces rencontres (disparues ou
 * modifiées). Aucun index sur `rencontre` : un balayage, par tranches de
 * joueurs, en lecture seule, la main rendue entre deux.
 */
async function lignesJoueurDe(database, rencontres, ctx) {
  if (!rencontres.size) return [];
  const bornes = database.prepare(bornesDe('player_day', 'joueur')).get();
  if (bornes.mi === null) return [];
  const st = database.prepare('SELECT joueur, date, rencontre FROM player_day WHERE joueur >= ? AND joueur < ? AND rencontre IN (SELECT value FROM json_each(?))');
  const liste = json([...rencontres]);
  const trouvees = [];
  for (let lo = bornes.mi; lo <= bornes.ma; lo += PAS_BALAYAGE_JOUEURS) {
    for (const r of st.iterate(lo, lo + PAS_BALAYAGE_JOUEURS, liste)) trouvees.push({ joueur: r.joueur, date: r.date, rencontre: r.rencontre });
    await ctx.siLongtemps('lignes joueur des rencontres changées');
  }
  return trouvees;
}

/** Les statistiques d'équipe d'une liste de rencontres : Map clé → { home, away }. */
const lecteursDesStats = new WeakMap();
function statsDesRencontres(database, cles) {
  // Une requête préparée par connexion, pas une par tranche.
  let lire = lecteursDesStats.get(database);
  if (!lire) lecteursDesStats.set(database, (lire = lecteur(database.prepare(`SELECT ${COLONNES_SOURCE_EQUIPE} FROM team_stats WHERE match_key IN (SELECT value FROM json_each(?))`))));
  const out = new Map();
  for (const r of lire.iterate(json(cles))) {
    let s = out.get(r.match_key);
    if (!s) out.set(r.match_key, (s = { home: null, away: null }));
    s[r.side] = r;
  }
  return out;
}

const COLONNES_ECRITES_EQUIPE = ['rencontre', 'camp', ...FAITS_EQUIPE];
const COLONNES_ECRITES_JOUEUR = ['joueur', 'date', 'rencontre', ...FAITS_JOUEUR, ...AVANT_JOUEUR];
const memesLignesJoueur = comparateur(COLONNES_ECRITES_JOUEUR);
const memesFaitsJoueur = comparateur(FAITS_JOUEUR);

/**
 * LA CONSTRUCTION ET LA NUIT (§4). Sans table, avec une table d'une autre
 * version, après une passe interrompue, ou avec `tout` : tout est refait (les
 * faits de toutes les rencontres, comparés à ce qui est stocké — seules les
 * lignes qui changent sont écrites et comptées : après une nuit ordinaire, ce
 * compte doit être 0). Sinon, la nuit : seulement les rencontres nouvelles,
 * modifiées, disparues et les fusions d'identité ; les colonnes « avant » des
 * équipes toutes recalculées, celles des joueurs touchés seulement. Rien à
 * faire : rien n'est écrit, pas même l'état.
 *
 * Écrit dans la base : sous le verrou d'actualisation (la passe le tient ; le
 * script du bac le prend). Le repère de chaque rencontre (sa date de mise à
 * jour au registre) et l'état n'avancent qu'à la FIN : une passe arrêtée en
 * route laisse la nuit suivante reprendre. Ne lève jamais : une panne est
 * rendue dans `erreur`.
 *
 * `rendreLaMain` : fonction qui rend la main au serveur (promesse ou rappel ;
 * setImmediate par défaut) ; null dans le script. `controle` : { lignes,
 * graine, delaiMs } du contrôle anti-fuite de fin (lignes: 0 pour s'en passer ;
 * graine : le jour, AAAAMMJJ, par défaut ; delaiMs : 10 min par défaut).
 */
export async function construireTableJourJ({
  database = openDb(),
  tout = false,
  rendreLaMain = rendreLaMainParDefaut,
  journal = null,
  maintenant = new Date(),
  controle = { lignes: 20 },
  budgetTrancheMs = null,
  reconstruire = false
} = {}) {
  const debut = horloge();
  const ctx = nouveauContexte({ database, rendreLaMain, budgetTrancheMs });
  const bilan = {
    mode: null,
    version: VERSION_TABLE_JOUR,
    rencontres: { magasin: 0, nouvelles: 0, modifiees: 0, disparues: 0, refusees: [] },
    fusions: 0,
    lignes: { equipeEcrites: 0, equipeRetirees: 0, joueurEcrites: 0, joueurRetirees: 0, ligueEcrites: 0, ligueRetirees: 0, avantEquipe: 0, avantJoueur: 0 },
    joueursRecalcules: 0,
    clubsRecalcules: 0,
    feuilles: { sansIdentifiant: 0, refusees: 0, doublons: 0 },
    changements: null,
    controle: null,
    comptes: null,
    erreur: null
  };
  const fin = () => {
    const dernier = horloge() - ctx.dernierePause;
    if (dernier > ctx.blocMax.ms) ctx.blocMax = { ms: dernier, ou: 'bilan' };
    ctx.mesurer();
    return {
      ...bilan,
      dureeMs: Math.round(horloge() - debut),
      etapesMs: Object.fromEntries(Object.entries(ctx.etapesMs).map(([k, v]) => [k, Math.round(v)])),
      blocMaxMs: arrondi(ctx.blocMax.ms),
      blocMaxOu: ctx.blocMax.ou,
      pauses: ctx.pauses,
      tranches: ctx.tranches,
      rssMaxOctets: ctx.rssMax,
      walMaxOctets: ctx.walMax
    };
  };
  try {
    let t = horloge();
    // ------------------------------------------------------------ 0. l'état et le mode
    const etat = lireEtatBrut(database);
    const versionStockee = etat.version ? Number(etat.version) : null;
    // `reconstruire` (script du bac, pour mesurer une première construction) : comme une autre version, tout est vidé puis refait.
    const autreVersion = reconstruire || (versionStockee !== null && versionStockee !== VERSION_TABLE_JOUR);
    const interrompue = Boolean(etat.en_cours);
    const complet = tout || !etat.construite_le || autreVersion || interrompue;
    const vide = !database.prepare('SELECT EXISTS (SELECT 1 FROM day_matches) e').get().e && !database.prepare('SELECT EXISTS (SELECT 1 FROM player_day) e').get().e;
    if (autreVersion && !vide) await viderLesTables(database, ctx);
    const comparer = complet && !(vide || autreVersion);
    bilan.mode = complet ? (vide || autreVersion ? 'construction' : tout ? 'tout' : 'reprise') : 'nuit';
    if (complet && comparer) bilan.changements = { registre: 0, faitsEquipe: 0, faitsJoueur: 0, joueurRetirees: 0, ligue: 0, avantEquipe: 0, avantJoueur: 0 };

    // ------------------------------------------------------------ 1. le registre
    const lu = await lireLeMagasin(database, ctx);
    let valides = lu.valides; // clé → entrée du magasin (rendu au ramasse-miettes avant les joueurs)
    bilan.rencontres.magasin = lu.lues;
    bilan.rencontres.refusees = lu.refusees;
    let { nouvelles, modifiees, disparues } = await trierLeRegistre(database, ctx, valides);
    if (comparer) bilan.changements.registre = modifiees.length + disparues.length;
    const repereFusionsAvant = etat.repere_merges ?? null;
    const repereFusionsMaintenant = repereFusions(database);
    const fusionsChangees = repereFusionsAvant !== repereFusionsMaintenant;
    bilan.rencontres.nouvelles = nouvelles.length;
    bilan.rencontres.modifiees = modifiees.length;
    bilan.rencontres.disparues = disparues.length;
    ctx.chrono('registre', t);

    if (!complet && !nouvelles.length && !modifiees.length && !disparues.length && !fusionsChangees) {
      bilan.mode = 'rien';
      bilan.comptes = etatTableJourJ({ database });
      return fin();
    }

    // La passe commence vraiment : une trace, effacée à la fin. Une passe interrompue la laisse : la suivante refait tout.
    enTransaction(database, () => database.prepare("INSERT INTO day_state (cle, valeur) VALUES ('en_cours', ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur").run(maintenant.toISOString()));

    // ------------------------------------------------------------ 2. les lignes joueur des rencontres disparues ou modifiées (la nuit)
    t = horloge();
    const touches = new Set(); // joueurs dont les colonnes « avant » sont à refaire (la nuit)
    let anciennesLignes = [];
    if (!complet) {
      const changees = new Set([...disparues.map((r) => r.rencontre), ...modifiees.map((e) => e.rencontre)]);
      anciennesLignes = await lignesJoueurDe(database, changees, ctx);
      for (const l of anciennesLignes) touches.add(l.joueur);
    }
    ctx.chrono('balayageJoueurs', t);

    // ------------------------------------------------------------ 3. le registre écrit (repère vide jusqu'à la fin)
    t = horloge();
    nouvelles.sort((a, b) => (a.matchKey < b.matchKey ? -1 : 1));
    const inserer = database.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL) RETURNING rencontre');
    await ctx.ecrire(nouvelles, (e) => {
      e.rencontre = inserer.get(e.matchKey, e.fotmobId, e.date, e.league, e.saison, e.home, e.away).rencontre;
    }, { taille: 5000, ou: 'registre : nouvelles rencontres' });
    const majRegistre = database.prepare('UPDATE day_matches SET fotmob_id = ?, date = ?, league = ?, saison = ?, home = ?, away = ?, updated_at = NULL WHERE rencontre = ?');
    await ctx.ecrire(modifiees, (e) => majRegistre.run(e.fotmobId, e.date, e.league, e.saison, e.home, e.away, e.rencontre), { taille: 5000, ou: 'registre : rencontres modifiées' });
    ctx.chrono('registre', t);

    // ------------------------------------------------------------ 4. les faits d'équipe
    t = horloge();
    let aRelire = (complet ? [...valides.values()] : [...nouvelles, ...modifiees]).sort((a, b) => a.rencontre - b.rencontre);
    // Clé, « attribué » et couverture de chaque rencontre, par son numéro (tableaux plats, cf. IndexDesRencontres).
    const index = new IndexDesRencontres();
    for (const e of valides.values()) if (e.rencontre !== undefined) index.poser(e.rencontre, e.matchKey);
    // Le déroulé lui-même reste dans SQLite : seuls ses buts en sortent ([minute, camp], un petit tableau par match) —
    // analyser 60 000 déroulés complets dans Node faisait grossir son tas de ~90 Mo pour rien. NULL : pas de déroulé.
    const lireMetaDeroule = lecteur(
      database.prepare(`SELECT m.match_key, m.meta,
         CASE WHEN json_valid(m.events) AND json_type(m.events) = 'array' THEN
           (SELECT json_group_array(json_array(json_extract(e.value, '$.minute'), json_extract(e.value, '$.side')))
              FROM json_each(m.events) e WHERE CASE WHEN e.type = 'object' THEN json_extract(e.value, '$.type') END = 'goal')
         END AS buts
         FROM matches m WHERE m.match_key IN (SELECT value FROM json_each(?))`)
    );
    const stockeesParRencontre = lecteur(database.prepare(`SELECT ${COLONNES_ECRITES_EQUIPE.join(', ')} FROM team_day WHERE rencontre IN (SELECT value FROM json_each(?))`));
    const colonnesUpsert = COLONNES_ECRITES_EQUIPE;
    const upsertEquipe = database.prepare(
      `INSERT INTO team_day (${colonnesUpsert.join(', ')}) VALUES (${colonnesUpsert.map(() => '?').join(', ')})
       ON CONFLICT (rencontre, camp) DO UPDATE SET ${FAITS_EQUIPE.map((c) => `${c} = excluded.${c}`).join(', ')}`
    );
    const retirerEquipe = database.prepare('DELETE FROM team_day WHERE rencontre = ?');
    await ctx.pause("faits d'équipe : préparation");
    for (let i = 0; i < aRelire.length; i += ctx.lectures.rencontres) {
      const tranche = aRelire.slice(i, i + ctx.lectures.rencontres);
      const cles = tranche.map((e) => e.matchKey);
      const metas = new Map();
      for (const r of lireMetaDeroule.iterate(json(cles))) metas.set(r.match_key, r);
      await ctx.siLongtemps("faits d'équipe : déroulés lus");
      const stats = statsDesRencontres(database, cles);
      const stockees = new Map();
      if (comparer || !complet) {
        for (const r of stockeesParRencontre.iterate(json(tranche.map((e) => e.rencontre)))) stockees.set(`${r.rencontre}|${r.camp}`, r);
      }
      const aEcrire = [];
      const aRetirer = [];
      for (const e of tranche) {
        const m = metas.get(e.matchKey);
        const ind = indicateursDUneRencontre(m?.meta ?? null, e.league);
        Object.assign(e, ind);
        const s = stats.get(e.matchKey) ?? { home: null, away: null };
        index.poserCouverture(e.rencontre, couvertureDUneRencontre(s));
        if (!e.joue) {
          if (stockees.has(`${e.rencontre}|1`) || stockees.has(`${e.rencontre}|0`)) aRetirer.push(e.rencontre);
          continue;
        }
        // Les buts du déroulé, sous la forme que lit butsA90 (le même test : tous les buts, une minute et un camp chacun).
        let events = null;
        if (m?.buts) {
          try {
            events = JSON.parse(m.buts).map(([minute, side]) => ({ type: 'goal', minute, side }));
          } catch {
            events = null;
          }
        }
        for (const ligne of faitsDUneRencontre({ rencontre: e.rencontre, entree: e, stats: s, events })) {
          const avant = stockees.get(`${ligne.rencontre}|${ligne.camp}`);
          if (avant && memesValeurs(avant, ligne, FAITS_EQUIPE)) continue;
          if (avant && comparer) bilan.changements.faitsEquipe++;
          aEcrire.push(ligne);
        }
        await ctx.siLongtemps("faits d'équipe");
      }
      await ctx.ecrire(aEcrire, (l) => upsertEquipe.run(...colonnesUpsert.map((c) => l[c] ?? null)), { taille: TRANCHE_EQUIPE, ou: "faits d'équipe" });
      await ctx.ecrire(aRetirer, (r) => retirerEquipe.run(r), { taille: TRANCHE_EQUIPE, ou: "faits d'équipe retirés" });
      bilan.lignes.equipeEcrites += aEcrire.length;
      bilan.lignes.equipeRetirees += aRetirer.length * 2;
      await ctx.siLongtemps("faits d'équipe");
    }
    // Les rencontres disparues : leurs lignes d'équipe (celles des joueurs suivent, plus bas).
    await ctx.ecrire(disparues, (r) => {
      bilan.lignes.equipeRetirees += retirerEquipe.run(r.rencontre).changes;
    }, { taille: TRANCHE_EQUIPE, ou: 'rencontres disparues' });
    ctx.chrono('faitsEquipe', t);

    // Ce que la suite garde du magasin, en léger : les feuilles des rencontres jouées, les repères à poser à la
    // fin. Les entrées complètes (~60 000) sont rendues au ramasse-miettes avant les joueurs, la partie la plus lourde.
    const feuilles = [];
    let maxMaj = '';
    for (const e of valides.values()) {
      if (e.updatedAt !== SANS_DATE && e.updatedAt > maxMaj) maxMaj = e.updatedAt;
      if (e.joue && e.rencontre !== undefined) feuilles.push({ matchKey: e.matchKey, rencontre: e.rencontre, date: e.date, home: e.home, away: e.away });
    }
    const leger = (e) => ({ matchKey: e.matchKey, rencontre: e.rencontre, date: e.date, home: e.home, away: e.away });
    const feuillesDuDelta = complet ? [] : [...nouvelles, ...modifiees].filter((e) => e.joue && e.rencontre !== undefined).map(leger);
    const reperes = [...nouvelles, ...modifiees].map((e) => [e.rencontre, e.updatedAt]);
    valides = null;
    nouvelles = null;
    modifiees = null;
    aRelire = null;

    // ------------------------------------------------------------ 5. les faits de championnat (camp qui reçoit), pour (d), (e) ; « attribué » pour les joueurs
    t = horloge();
    let faitsLigues = new Map(); // league → faits du camp qui reçoit, chronologiques
    const pageDomicile = lecteur(
      database.prepare(`SELECT rencontre, date, league, saison, attribue, compte, bp, bc, xg_p, xg_c, cadres_p, cadres_c FROM team_day WHERE camp = 1 AND rencontre > ? ORDER BY rencontre LIMIT ${ctx.lectures.pages}`)
    );
    for (let apres = 0; ; ) {
      const page = pageDomicile.all(apres);
      if (!page.length) break;
      for (const r of page) {
        if (!index.connue(r.rencontre)) continue; // jamais vu : les lignes d'une rencontre disparue sont retirées avant (étape 4)
        index.poserAttribue(r.rencontre, r.attribue === 1);
        let liste = faitsLigues.get(r.league);
        if (!liste) faitsLigues.set(r.league, (liste = []));
        r.matchKey = index.cle(r.rencontre);
        r.home = true;
        liste.push(r);
      }
      apres = page.at(-1).rencontre;
      await ctx.siLongtemps('faits des championnats');
    }
    for (const liste of faitsLigues.values()) liste.sort(ordreChronologique);
    await ctx.pause('faits des championnats');
    ctx.chrono('lectureLigues', t);

    // ------------------------------------------------------------ 6. les championnats (league_day), refaits entiers
    t = horloge();
    await construireLesLigues({ database, ctx, faitsLigues, comparer, bilan });
    ctx.chrono('ligue', t);

    // ------------------------------------------------------------ 7. les colonnes « avant » des équipes, toutes
    t = horloge();
    await construireAvantEquipes({ database, ctx, faitsLigues, index, comparer, bilan });
    // Les faits des championnats ne servent plus : rendus avant les joueurs, la partie la plus lourde.
    faitsLigues = null;
    ctx.chrono('avantEquipe', t);

    // ------------------------------------------------------------ 8. les faits de joueur (et leurs colonnes « avant » : tout, ou les joueurs touchés la nuit)
    t = horloge();
    if (complet) {
      await faitsJoueursComplets({ database, ctx, feuilles, index, comparer, bilan });
    } else {
      await faitsJoueursDeLaNuit({ database, ctx, feuilles, index, anciennesLignes, feuillesDuDelta, fusionsChangees, touches, bilan });
      ctx.chrono('faitsJoueur', t);
      t = horloge();
      await construireAvantJoueurs({ database, ctx, joueurs: [...touches].sort((a, b) => a - b), index, bilan });
      ctx.chrono('avantJoueur', t);
      t = horloge();
    }
    ctx.chrono('faitsJoueur', t);

    // ------------------------------------------------------------ 9. les rencontres disparues quittent le registre (en dernier)
    t = horloge();
    const retirerRegistre = database.prepare('DELETE FROM day_matches WHERE rencontre = ?');
    await ctx.ecrire(disparues, (r) => retirerRegistre.run(r.rencontre), { taille: 5000, ou: 'registre : rencontres disparues' });
    ctx.chrono('registre', t);

    // ------------------------------------------------------------ 10. le contrôle anti-fuite
    t = horloge();
    if (controle && controle.lignes > 0) {
      // La graine change chaque nuit (le jour, AAAAMMJJ) : d'autres lignes sont revues chaque fois, et la même nuit se
      // rejoue (elle est gardée dans l'état avec le contrôle).
      const graine = controle.graine ?? graineDuJour(maintenant);
      const chemin = typeof database.location === 'function' ? database.location() : null;
      if (chemin && rendreLaMain) {
        // Dans le serveur (et le script qui fait comme lui) : dans un PROCESSUS À PART, en lecture seule, avec un délai
        // maximal. Les lecteurs du moteur qu'il appelle tiennent ~0,1 à 0,5 s par ligne sur la base de Pierre, et jusqu'à
        // 6 s sur une base froide (mesuré le 12/10) : jamais dans le serveur. Un processus à part qui échoue ou ne répond
        // pas à temps : le contrôle est noté « pas fait », avec sa raison — il n'est PAS refait ici.
        try {
          const r = await ctx.attendre(() => controleAPart({ chemin, lignes: controle.lignes, graine, delaiMs: controle.delaiMs ?? DELAI_CONTROLE_MS }), 'contrôle anti-fuite (processus à part)');
          bilan.controleAPart = { rssMaxOctets: r.rssMaxOctets ?? null, dureeMs: r.dureeMs ?? null };
          bilan.controle = { le: maintenant.toISOString(), graine, lignes: r.lignes, ecarts: r.ecarts };
        } catch (error) {
          const raison = String(error?.message ?? error).slice(0, 300);
          bilan.controleAPart = { erreur: raison };
          bilan.controle = { le: maintenant.toISOString(), graine, lignes: 0, ecarts: [], pasFait: raison };
        }
      } else {
        // Le script d'une traite (--d-une-traite) ou une base en mémoire : ici, une ligne à la fois.
        const parLignes = controleParLignes({ database, lignes: controle.lignes, graine });
        let pas = parLignes.next();
        while (!pas.done) {
          await ctx.siLongtemps('contrôle anti-fuite');
          pas = parLignes.next();
        }
        bilan.controle = { le: maintenant.toISOString(), graine, lignes: pas.value.lignes, ecarts: pas.value.ecarts };
      }
    }
    await ctx.pause('contrôle anti-fuite');
    ctx.chrono('controle', t);

    // ------------------------------------------------------------ 11. l'état : les repères avancent seulement ici
    t = horloge();
    const poserRepere = database.prepare('UPDATE day_matches SET updated_at = ? WHERE rencontre = ?');
    reperes.sort((a, b) => a[0] - b[0]);
    await ctx.ecrire(reperes, ([rencontre, majLe]) => poserRepere.run(majLe, rencontre), { taille: 5000, ou: 'registre : repères' });
    bilan.comptes = await compterLaTable(database, ctx);
    const ecrireEtat = database.prepare('INSERT INTO day_state (cle, valeur) VALUES (?, ?) ON CONFLICT (cle) DO UPDATE SET valeur = excluded.valeur');
    enTransaction(database, () => {
      ecrireEtat.run('version', String(VERSION_TABLE_JOUR));
      ecrireEtat.run('repere_updated_at', maxMaj);
      ecrireEtat.run('repere_merges', repereFusionsMaintenant);
      if (complet && (vide || autreVersion || !etat.construite_le)) ecrireEtat.run('construite_le', maintenant.toISOString());
      ecrireEtat.run('mise_a_jour_le', maintenant.toISOString());
      ecrireEtat.run('dernier_jour', bilan.comptes.dernierJour ?? '');
      ecrireEtat.run('comptes', JSON.stringify(bilan.comptes));
      if (bilan.controle) ecrireEtat.run('controle', JSON.stringify(bilan.controle));
      ecrireEtat.run('refusees', JSON.stringify(bilan.rencontres.refusees.slice(0, 50)));
      database.prepare("DELETE FROM day_state WHERE cle = 'en_cours'").run();
    });
    ctx.chrono('etat', t);
    journal?.(`[table du jour J] ${bilan.mode} : ${bilan.rencontres.nouvelles} nouvelle(s), ${bilan.rencontres.modifiees} modifiée(s), ${bilan.rencontres.disparues} disparue(s) en ${Math.round(horloge() - debut)} ms`);
    return fin();
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // aucune transaction ouverte
    }
    bilan.erreur = String(error?.message ?? error);
    return fin();
  }
}

/** Les comptes de la table, notés dans l'état (la carte les lit sans rien recompter) ; player_day compté par tranches. */
async function compterLaTable(database, ctx) {
  const un = (sql) => database.prepare(sql).get();
  // Un compte à la fois, la main rendue entre deux (chacun tient 20 à 90 ms sur la base de Pierre).
  const comptes = { rencontres: 0, lignesEquipe: 0, lignesLigue: 0, clubs: 0, dernierJour: null, lignesJoueur: 0, joueurs: 0 };
  comptes.rencontres = un('SELECT COUNT(*) n FROM day_matches').n;
  await ctx.siLongtemps('comptes');
  comptes.lignesEquipe = un('SELECT COUNT(*) n FROM team_day').n;
  await ctx.siLongtemps('comptes');
  comptes.lignesLigue = un('SELECT COUNT(*) n FROM league_day').n;
  comptes.clubs = un('SELECT COUNT(DISTINCT club) n FROM team_day').n;
  await ctx.siLongtemps('comptes');
  comptes.dernierJour = un('SELECT MAX(date) d FROM day_matches').d ?? null;
  await ctx.siLongtemps('comptes');
  const bornes = un(bornesDe('player_day', 'joueur'));
  if (bornes.mi !== null) {
    const st = database.prepare('SELECT COUNT(*) n, COUNT(DISTINCT joueur) j FROM player_day WHERE joueur >= ? AND joueur < ?');
    for (let lo = bornes.mi; lo <= bornes.ma; lo += PAS_BALAYAGE_JOUEURS) {
      const r = st.get(lo, lo + PAS_BALAYAGE_JOUEURS);
      comptes.lignesJoueur += r.n;
      comptes.joueurs += r.j;
      await ctx.siLongtemps('comptes des joueurs');
    }
  }
  return comptes;
}

/** Les drapeaux d'une rencontre dans l'index : attribué, puis la couverture de sa feuille (connue, xG, xGOT, cartons). */
const ATTRIBUE = 1;
const COUVERTURE_CONNUE = 2;
const COUVERT_XG = 4;
const COUVERT_XGOT = 8;
const COUVERT_CARTONS = 16;
/** Les huit couvertures possibles, une seule fois chacune (aucun objet créé par feuille). */
const COUVERTURES = Object.freeze(
  Array.from({ length: 8 }, (_, b) => Object.freeze({ xg: Boolean(b & 1), xgot: Boolean(b & 2), cartons: Boolean(b & 4) }))
);

/**
 * Ce que la construction garde de chaque rencontre, par son NUMÉRO : sa clé
 * (le départage des faits d'un même jour), « attribué » (les apparitions d'un
 * match attribué ne comptent pas dans a10_*) et la couverture de sa feuille
 * (xG, xGOT, cartons relevés). Des tableaux plats indexés par numéro :
 * 60 000 rencontres tiennent en un tableau de clés et ~60 Ko d'octets, là où
 * autant de petits objets faisaient grossir le tas de Node (mesuré le 07/10 :
 * le RSS suit le tas réservé, pas le tas vivant).
 */
class IndexDesRencontres {
  constructor() {
    this.cles = [];
    this.drapeaux = new Uint8Array(1024);
  }

  #place(n) {
    if (n < this.drapeaux.length) return;
    const t = new Uint8Array(Math.max(n + 1, this.drapeaux.length * 2));
    t.set(this.drapeaux);
    this.drapeaux = t;
  }

  poser(rencontre, matchKey) {
    this.#place(rencontre);
    this.cles[rencontre] = matchKey;
  }

  connue(rencontre) {
    return this.cles[rencontre] !== undefined;
  }

  cle(rencontre) {
    return this.cles[rencontre] ?? '';
  }

  attribue(rencontre) {
    return rencontre < this.drapeaux.length && (this.drapeaux[rencontre] & ATTRIBUE) !== 0;
  }

  poserAttribue(rencontre, oui) {
    this.#place(rencontre);
    this.drapeaux[rencontre] = oui ? this.drapeaux[rencontre] | ATTRIBUE : this.drapeaux[rencontre] & ~ATTRIBUE;
  }

  /** La couverture d'une feuille, ou null si elle n'a pas été lue. */
  couverture(rencontre) {
    const d = rencontre < this.drapeaux.length ? this.drapeaux[rencontre] : 0;
    if (!(d & COUVERTURE_CONNUE)) return null;
    return COUVERTURES[(d & COUVERT_XG ? 1 : 0) | (d & COUVERT_XGOT ? 2 : 0) | (d & COUVERT_CARTONS ? 4 : 0)];
  }

  poserCouverture(rencontre, c) {
    this.#place(rencontre);
    this.drapeaux[rencontre] = (this.drapeaux[rencontre] & ATTRIBUE) | COUVERTURE_CONNUE | (c.xg ? COUVERT_XG : 0) | (c.xgot ? COUVERT_XGOT : 0) | (c.cartons ? COUVERT_CARTONS : 0);
  }
}

/** Une ligne de player_day → le fait léger que lit avantJoueur (note et xG décodés). */
function faitLegerJoueur(r, index) {
  return {
    date: r.date,
    matchKey: index.cle(r.rencontre),
    joue: r.joue,
    attribue: index.attribue(r.rencontre),
    minutes: r.minutes,
    note: r.note === null || r.note === undefined ? null : r.note / 100,
    buts: r.buts,
    xg: r.xg === null || r.xg === undefined ? null : r.xg / 1000
  };
}

/**
 * Les colonnes « avant » des lignes d'un joueur, chacune depuis les SEULS
 * faits d'un jour antérieur — par avantJoueur, la règle pure. `lignes` : les
 * lignes player_day d'un joueur, dans n'importe quel ordre ; rend leurs
 * colonnes « avant » dans le même ordre.
 */
function avantDUnJoueur(lignes, index) {
  const legers = lignes.map((r) => faitLegerJoueur(r, index));
  const ordre = legers.map((f, i) => i).sort((a, b) => ordreChronologique(legers[a], legers[b]));
  const tries = ordre.map((i) => legers[i]);
  const out = new Array(lignes.length);
  let k = 0;
  for (let p = 0; p < tries.length; p++) {
    // Les faits d'un jour strictement antérieur : jamais ceux du même jour.
    while (k < tries.length && tries[k].date < tries[p].date) k++;
    out[ordre[p]] = avantJoueurSur(tries, k, { date: tries[p].date });
  }
  return out;
}

/** L'ordre de la clé de player_day : joueur, jour, rencontre. */
const ordreDeLaCle = (a, b) => a.joueur - b.joueur || (a.date < b.date ? -1 : a.date > b.date ? 1 : a.rencontre - b.rencontre);

/** Faits par série triée (≈ 20 ms de tri en JS : jamais un long blocage du serveur). */
const TAILLE_SERIE = 5000;

/**
 * Les faits de joueur de TOUT le magasin (construction, reprise, `tout`) :
 *  1. les feuilles lues dans l'ordre des rencontres (lecture séquentielle de
 *     `players` par sa clé, ~15 s sur la base de Pierre), les faits calculés
 *     et rangés en SÉRIES triées par (joueur, jour, rencontre), écrites à la
 *     suite dans UNE table temporaire (ajouts seuls ; rowid posé) — de chaque
 *     série on garde où commence chaque joueur ;
 *  2. tranche par tranche de joueurs, dans l'ordre des joueurs : les plages de
 *     chaque série relues par leur rowid (contiguës), réunies, les colonnes
 *     « avant » calculées joueur par joueur, et l'écriture dans l'ordre de la
 *     clé de player_day — des ajouts en fin de table, jamais deux millions
 *     d'insertions dispersées qui gonfleraient le journal.
 * Avec `comparer`, seules les lignes qui changent sont écrites (et comptées),
 * et les lignes stockées qui n'existent plus sont retirées. Mesuré le 07/10 :
 * 250 tables temporaires (une par tranche) coûtaient 25 s d'insertions et 28 s
 * de tri SQL ; une table en séries, ~8 s et aucun tri SQL.
 */
async function faitsJoueursComplets({ database, ctx, feuilles, index, comparer, bilan }) {
  const colonnesTemp = ['joueur', 'date', 'rencontre', ...FAITS_JOUEUR];
  database.exec('DROP TABLE IF EXISTS temp.jj_faits');
  database.exec(`CREATE TABLE temp.jj_faits (${colonnesTemp.join(', ')})`);
  try {
    // 1. Les feuilles, dans l'ordre des rencontres, en séries triées.
    const inserer = database.prepare(`INSERT INTO temp.jj_faits (rowid, ${colonnesTemp.join(', ')}) VALUES (?, ${colonnesTemp.map(() => '?').join(', ')})`);
    const series = []; // { base, n, joueurs: Int32Array (triés, sans doublon), debuts: Int32Array (position du premier fait de chacun) }
    let suivant = 1;
    let tampon = [];
    const ecrireLaSerie = async () => {
      if (!tampon.length) return;
      let t = horloge();
      tampon.sort(ordreDeLaCle);
      const joueurs = [];
      const debuts = [];
      for (let i = 0; i < tampon.length; i++) {
        if (i === 0 || tampon[i].joueur !== tampon[i - 1].joueur) {
          joueurs.push(tampon[i].joueur);
          debuts.push(i);
        }
      }
      const base = suivant;
      const lot = tampon;
      tampon = [];
      ctx.chrono('joueurs.series', t);
      t = horloge();
      let rowid = base;
      await ctx.ecrire(lot, (f) => inserer.run(rowid++, ...colonnesTemp.map((c) => f[c] ?? null)), { taille: TRANCHE_JOUEUR, ou: 'feuilles (table temporaire)' });
      ctx.chrono('joueurs.temporaire', t);
      series.push({ base, n: lot.length, joueurs: Int32Array.from(joueurs), debuts: Int32Array.from(debuts) });
      suivant += lot.length;
    };
    const jouees = [...feuilles].sort((a, b) => (a.matchKey < b.matchKey ? -1 : 1));
    const lireFeuilles = lecteur(database.prepare(`SELECT ${COLONNES_SOURCE_JOUEUR} FROM players WHERE match_key IN (SELECT value FROM json_each(?))`));
    for (let i = 0; i < jouees.length; i += ctx.lectures.feuilles) {
      let t = horloge();
      const tranche = jouees.slice(i, i + ctx.lectures.feuilles);
      const parCle = new Map(tranche.map((e) => [e.matchKey, []]));
      for (const l of lireFeuilles.iterate(json([...parCle.keys()]))) parCle.get(l.match_key)?.push(l);
      ctx.chrono('joueurs.lecture', t);
      t = horloge();
      for (const e of tranche) {
        const r = faitsDUneFeuille({ rencontre: e.rencontre, date: e.date, home: e.home, away: e.away, lignes: parCle.get(e.matchKey), couverture: index.couverture(e.rencontre) ?? COUVERTURES[0] });
        bilan.feuilles.sansIdentifiant += r.sansIdentifiant;
        bilan.feuilles.refusees += r.refusees.length;
        bilan.feuilles.doublons += r.doublons;
        for (const f of r.faits) tampon.push(f);
      }
      ctx.chrono('joueurs.faits', t);
      if (tampon.length >= TAILLE_SERIE) await ecrireLaSerie();
      await ctx.siLongtemps('feuilles');
    }
    await ecrireLaSerie();

    // 2. Les tranches de joueurs : bornes prises dans les séries (les joueurs réellement présents).
    const tous = new Set();
    for (const s of series) for (const j of s.joueurs) tous.add(j);
    const ids = [...tous].sort((a, b) => a - b);
    tous.clear();
    const bornes = [0];
    for (let i = ctx.lectures.joueursParPartition; i < ids.length; i += ctx.lectures.joueursParPartition) bornes.push(ids[i]);
    // Position, dans une série, du premier joueur ≥ j.
    const premierJoueur = (s, j) => {
      let bas = 0;
      let haut = s.joueurs.length;
      while (bas < haut) {
        const m = (bas + haut) >> 1;
        if (s.joueurs[m] < j) bas = m + 1;
        else haut = m;
      }
      return bas;
    };
    const plage = lecteur(database.prepare(`SELECT ${colonnesTemp.join(', ')} FROM temp.jj_faits WHERE rowid >= ? AND rowid < ?`));
    const stockeesDe = lecteur(database.prepare(`SELECT ${COLONNES_ECRITES_JOUEUR.join(', ')} FROM player_day WHERE joueur >= ? AND joueur < ? ORDER BY joueur, date, rencontre`));
    const ecrireLigne = database.prepare(`INSERT OR REPLACE INTO player_day (${COLONNES_ECRITES_JOUEUR.join(', ')}) VALUES (${COLONNES_ECRITES_JOUEUR.map(() => '?').join(', ')})`);
    const retirerLigne = database.prepare('DELETE FROM player_day WHERE joueur = ? AND date = ? AND rencontre = ?');
    for (let p = 0; p < bornes.length; p++) {
      const lo = bornes[p];
      const hi = p + 1 < bornes.length ? bornes[p + 1] : Number.MAX_SAFE_INTEGER;
      let t = horloge();
      const lignes = [];
      for (const s of series) {
        const a = premierJoueur(s, lo);
        const b = premierJoueur(s, hi);
        if (a >= b) continue;
        const debut = s.base + s.debuts[a];
        const fin = s.base + (b < s.joueurs.length ? s.debuts[b] : s.n);
        for (const l of plage.iterate(debut, fin)) lignes.push(l);
      }
      lignes.sort(ordreDeLaCle);
      ctx.chrono('joueurs.relecture', t);
      t = horloge();
      for (let i = 0, d = 0; i <= lignes.length; i++) {
        if (i < lignes.length && lignes[i].joueur === lignes[d].joueur) continue;
        if (i > d) {
          const siennes = lignes.slice(d, i);
          const avant = avantDUnJoueur(siennes, index);
          for (let k = 0; k < siennes.length; k++) Object.assign(siennes[k], avant[k]);
          bilan.joueursRecalcules++;
        }
        d = i;
        await ctx.siLongtemps('avant des joueurs');
      }
      ctx.chrono('joueurs.avant', t);
      t = horloge();
      let aRetirer = [];
      let ecrites = lignes;
      if (comparer) {
        // Les deux listes sont dans l'ordre de la clé (joueur, jour, rencontre) : une FUSION, sans table de correspondance.
        const stockees = stockeesDe.all(lo, hi);
        ecrites = [];
        let k = 0;
        for (const l of lignes) {
          while (k < stockees.length && ordreDeLaCle(stockees[k], l) < 0) aRetirer.push(stockees[k++]);
          const s = k < stockees.length && ordreDeLaCle(stockees[k], l) === 0 ? stockees[k++] : null;
          if (s && memesLignesJoueur(s, l)) continue;
          if (s && memesFaitsJoueur(s, l)) bilan.changements.avantJoueur++;
          else bilan.changements.faitsJoueur++;
          ecrites.push(l);
        }
        while (k < stockees.length) aRetirer.push(stockees[k++]);
        bilan.changements.joueurRetirees += aRetirer.length;
      }
      ctx.chrono('joueurs.comparaison', t);
      t = horloge();
      await ctx.ecrire(ecrites, (l) => ecrireLigne.run(...COLONNES_ECRITES_JOUEUR.map((c) => l[c] ?? null)), { taille: TRANCHE_JOUEUR, ou: 'lignes joueur' });
      await ctx.ecrire(aRetirer, (r) => retirerLigne.run(r.joueur, r.date, r.rencontre), { taille: TRANCHE_JOUEUR, ou: 'lignes joueur retirées' });
      bilan.lignes.joueurEcrites += ecrites.length;
      bilan.lignes.joueurRetirees += aRetirer.length;
      bilan.lignes.avantJoueur += ecrites.length;
      ctx.chrono('joueurs.ecriture', t);
      await ctx.pause('tranche de joueurs');
    }
    // La table temporaire vidée par plages de rowid, la main rendue entre deux : le DROP d'une table de deux millions
    // de lignes tenait ~0,6 s d'affilée sur la base de Pierre (mesuré le 12/10) ; vide, il ne coûte rien.
    const viderUnePlage = database.prepare('DELETE FROM temp.jj_faits WHERE rowid >= ? AND rowid < ?');
    for (let lo = 1; lo < suivant; lo += PAS_VIDAGE_TEMPORAIRE) {
      viderUnePlage.run(lo, lo + PAS_VIDAGE_TEMPORAIRE);
      await ctx.siLongtemps('table temporaire vidée');
    }
  } finally {
    try {
      database.exec('DROP TABLE IF EXISTS temp.jj_faits');
    } catch {
      // la connexion se ferme
    }
  }
}

/**
 * Les faits de joueur de LA NUIT : les lignes des rencontres disparues ou
 * modifiées retirées (une feuille relue a pu perdre un joueur), les feuilles
 * des rencontres nouvelles ou modifiées relues (par la clé des rencontres :
 * séquentiel), les fusions d'identité réimportées (lignes des deux
 * identifiants supprimées puis relues — jamais un « UPDATE joueur », qui
 * pourrait heurter la clé). Les joueurs touchés vont dans `touches`.
 */
async function faitsJoueursDeLaNuit({ database, ctx, feuilles, index, anciennesLignes, feuillesDuDelta, fusionsChangees, touches, bilan }) {
  const retirerLigne = database.prepare('DELETE FROM player_day WHERE joueur = ? AND date = ? AND rencontre = ?');
  await ctx.ecrire(anciennesLignes, (l) => {
    bilan.lignes.joueurRetirees += retirerLigne.run(l.joueur, l.date, l.rencontre).changes;
  }, { taille: TRANCHE_JOUEUR, ou: 'lignes joueur des rencontres changées' });
  const ecrireLigne = database.prepare(`INSERT OR REPLACE INTO player_day (${COLONNES_ECRITES_JOUEUR.join(', ')}) VALUES (${COLONNES_ECRITES_JOUEUR.map(() => '?').join(', ')})`);
  const lireFeuilles = lecteur(database.prepare(`SELECT ${COLONNES_SOURCE_JOUEUR} FROM players WHERE match_key IN (SELECT value FROM json_each(?))`));
  const jouees = feuillesDuDelta;
  for (let i = 0; i < jouees.length; i += ctx.lectures.feuilles) {
    const tranche = jouees.slice(i, i + ctx.lectures.feuilles);
    const parCle = new Map(tranche.map((e) => [e.matchKey, []]));
    for (const l of lireFeuilles.iterate(json([...parCle.keys()]))) parCle.get(l.match_key)?.push(l);
    const faits = [];
    for (const e of tranche) {
      const r = faitsDUneFeuille({ rencontre: e.rencontre, date: e.date, home: e.home, away: e.away, lignes: parCle.get(e.matchKey), couverture: index.couverture(e.rencontre) ?? COUVERTURES[0] });
      bilan.feuilles.sansIdentifiant += r.sansIdentifiant;
      bilan.feuilles.refusees += r.refusees.length;
      bilan.feuilles.doublons += r.doublons;
      for (const f of r.faits) {
        faits.push(f);
        touches.add(f.joueur);
      }
    }
    faits.sort(ordreDeLaCle);
    await ctx.ecrire(faits, (f) => ecrireLigne.run(...COLONNES_ECRITES_JOUEUR.map((c) => f[c] ?? null)), { taille: TRANCHE_JOUEUR, ou: 'feuilles nouvelles ou modifiées' });
    bilan.lignes.joueurEcrites += faits.length;
  }
  // Les fusions d'identité : toutes les équivalences connues (une poignée), relues entières.
  if (fusionsChangees) {
    const ids = new Set();
    for (const r of database.prepare('SELECT from_id, to_id FROM people_merges').all()) {
      for (const id of [r.from_id, r.to_id]) {
        try {
          ids.add(numeroFotmob(id));
        } catch {
          // identifiant bouchon : jamais dans la table
        }
      }
    }
    bilan.fusions = ids.size;
    const retirerJoueur = database.prepare('DELETE FROM player_day WHERE joueur = ?');
    const parCle = new Map(feuilles.map((e) => [e.matchKey, e]));
    const lireDuJoueur = lecteur(database.prepare(`SELECT ${COLONNES_SOURCE_JOUEUR} FROM players WHERE player_id = ?`));
    const faits = [];
    for (const joueur of [...ids].sort((a, b) => a - b)) {
      touches.add(joueur);
      const parMatch = new Map();
      for (const l of lireDuJoueur.all(enFotmob(joueur))) {
        if (!parCle.has(l.match_key)) continue;
        let liste = parMatch.get(l.match_key);
        if (!liste) parMatch.set(l.match_key, (liste = []));
        liste.push(l);
      }
      // La couverture des feuilles que la nuit n'a pas relues : lue dans team_stats.
      const manquantes = [...parMatch.keys()].filter((k) => !index.couverture(parCle.get(k).rencontre));
      for (const [k, s] of statsDesRencontres(database, manquantes)) index.poserCouverture(parCle.get(k).rencontre, couvertureDUneRencontre(s));
      for (const [k, liste] of parMatch) {
        const e = parCle.get(k);
        const r = faitsDUneFeuille({ rencontre: e.rencontre, date: e.date, home: e.home, away: e.away, lignes: liste, couverture: index.couverture(e.rencontre) ?? COUVERTURES[0] });
        for (const f of r.faits) faits.push(f);
      }
      await ctx.siLongtemps('fusions');
    }
    await ctx.ecrire([...ids], (j) => {
      bilan.lignes.joueurRetirees += retirerJoueur.run(j).changes;
    }, { taille: 1000, ou: 'fusions : lignes retirées' });
    faits.sort(ordreDeLaCle);
    await ctx.ecrire(faits, (f) => ecrireLigne.run(...COLONNES_ECRITES_JOUEUR.map((c) => f[c] ?? null)), { taille: TRANCHE_JOUEUR, ou: 'fusions : lignes réimportées' });
    bilan.lignes.joueurEcrites += faits.length;
  }
}

/** Les colonnes « avant » des joueurs touchés par la nuit, refaites entières (lecture par la clé : joueur). */
async function construireAvantJoueurs({ database, ctx, joueurs, index, bilan }) {
  const lire = lecteur(database.prepare(`SELECT ${COLONNES_ECRITES_JOUEUR.join(', ')} FROM player_day WHERE joueur = ?`));
  const majAvant = database.prepare(`UPDATE player_day SET ${AVANT_JOUEUR.map((c) => `${c} = ?`).join(', ')} WHERE joueur = ? AND date = ? AND rencontre = ?`);
  const aEcrire = [];
  for (const joueur of joueurs) {
    const lignes = lire.all(joueur);
    const avant = avantDUnJoueur(lignes, index);
    lignes.forEach((l, k) => {
      if (!memesValeurs(l, avant[k], AVANT_JOUEUR)) aEcrire.push({ ...avant[k], joueur: l.joueur, date: l.date, rencontre: l.rencontre });
    });
    bilan.joueursRecalcules++;
    await ctx.siLongtemps('avant des joueurs touchés');
    if (aEcrire.length >= TRANCHE_EQUIPE) await vider();
  }
  await vider();
  // Écrites au fil de l'eau, dans l'ordre de la clé, entre deux lectures (aucun curseur ouvert pendant une écriture).
  async function vider() {
    const lot = aEcrire.splice(0).sort(ordreDeLaCle);
    await ctx.ecrire(lot, (a) => majAvant.run(...AVANT_JOUEUR.map((c) => a[c] ?? null), a.joueur, a.date, a.rencontre), { taille: TRANCHE_JOUEUR, ou: 'avant des joueurs' });
    bilan.lignes.avantJoueur += lot.length;
  }
}

/** La position du premier fait d'un jour ≥ `jour` (faits chronologiques). */
function premierDuJour(faits, jour) {
  let bas = 0;
  let haut = faits.length;
  while (bas < haut) {
    const m = (bas + haut) >> 1;
    if (faits[m].date < jour) bas = m + 1;
    else haut = m;
  }
  return bas;
}

/** league_day refaite entière : une ligne par championnat et par jour où il a joué ; seules les lignes qui changent sont écrites. */
async function construireLesLigues({ database, ctx, faitsLigues, comparer, bilan }) {
  const stockees = new Map();
  const page = lecteur(database.prepare(`SELECT league, date, ${COLONNES_LIGUE.join(', ')} FROM league_day WHERE (league, date) > (?, ?) ORDER BY league, date LIMIT ${ctx.lectures.pages}`));
  for (let apres = ['', '']; ; ) {
    const lignes = page.all(...apres);
    if (!lignes.length) break;
    for (const r of lignes) stockees.set(`${r.league}|${r.date}`, r);
    apres = [lignes.at(-1).league, lignes.at(-1).date];
    await ctx.siLongtemps('championnats stockés');
  }
  const aEcrire = [];
  for (const [league, faits] of faitsLigues) {
    const jours = [...new Set(faits.map((f) => f.date))];
    for (const jour of jours) {
      const k = premierDuJour(faits, jour);
      const l = { league, date: jour, ...avantLigueSur(faits, k, { date: jour, league, saison: seasonOf(league, jour) }) };
      const s = stockees.get(`${league}|${jour}`);
      stockees.delete(`${league}|${jour}`);
      await ctx.siLongtemps(`championnat ${league}`);
      if (s && memesValeurs(s, l, COLONNES_LIGUE)) continue;
      if (s && comparer) bilan.changements.ligue++;
      aEcrire.push(l);
    }
  }
  const colonnes = ['league', 'date', ...COLONNES_LIGUE];
  const ecrire = database.prepare(`INSERT OR REPLACE INTO league_day (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})`);
  await ctx.ecrire(aEcrire, (l) => ecrire.run(...colonnes.map((c) => l[c] ?? null)), { taille: TRANCHE_EQUIPE, ou: 'championnats' });
  // Les jours qui n'existent plus (rencontre disparue ou déplacée) : retirés.
  const retirer = database.prepare('DELETE FROM league_day WHERE league = ? AND date = ?');
  const perimees = [...stockees.values()];
  await ctx.ecrire(perimees, (r) => retirer.run(r.league, r.date), { taille: TRANCHE_EQUIPE, ou: 'championnats : jours retirés' });
  if (comparer) bilan.changements.ligue += perimees.length;
  bilan.lignes.ligueEcrites += aEcrire.length;
  bilan.lignes.ligueRetirees += perimees.length;
}

/** NULL des colonnes « avant » dans le tampon des équipes (toutes les vraies valeurs sont ≥ 0). */
const VIDE = -1;

/**
 * Les colonnes « avant » de toutes les équipes, club par club (index club,
 * jour) : pour chaque ligne, avantEquipe sur les seuls faits d'un jour
 * antérieur du club et de son championnat ; seules les lignes qui changent
 * sont écrites. Les valeurs changées attendent dans un TAMPON D'ENTIERS
 * (28 par ligne : ~14 Mo pour les 120 000 lignes d'une construction, presque
 * rien une nuit ordinaire) et s'écrivent à la fin dans l'ordre de la clé de
 * team_day : chaque page n'est réécrite qu'une fois (club par club, chaque
 * transaction en touchait des milliers, dispersées : 13 s d'écriture le 07/10).
 */
async function construireAvantEquipes({ database, ctx, faitsLigues, index, comparer, bilan }) {
  const clubs = database.prepare('SELECT DISTINCT club FROM team_day ORDER BY club').all().map((r) => r.club);
  const largeur = AVANT_EQUIPE.length;
  let capacite = 4096;
  let tampon = new Int32Array(capacite * largeur);
  let cles = new Float64Array(capacite); // rencontre × 2 + camp
  let changees = 0;
  const garder = (rencontre, camp, avant) => {
    if (changees === capacite) {
      capacite *= 2;
      const t = new Int32Array(capacite * largeur);
      t.set(tampon);
      tampon = t;
      const c = new Float64Array(capacite);
      c.set(cles);
      cles = c;
    }
    cles[changees] = rencontre * 2 + camp;
    for (let c = 0; c < largeur; c++) {
      const v = avant[AVANT_EQUIPE[c]];
      tampon[changees * largeur + c] = v === null || v === undefined ? VIDE : v;
    }
    changees++;
  };
  const lire = lecteur(database.prepare(`SELECT * FROM team_day WHERE club IN (SELECT value FROM json_each(?))`));
  for (let i = 0; i < clubs.length; i += ctx.lectures.clubs) {
    const lot = clubs.slice(i, i + ctx.lectures.clubs);
    const parClub = new Map(lot.map((c) => [c, []]));
    for (const r of lire.iterate(json(lot))) {
      r.matchKey = index.cle(r.rencontre);
      r.home = r.camp === 1;
      parClub.get(r.club)?.push(r);
    }
    for (const faits of parClub.values()) {
      faits.sort(ordreChronologique);
      for (let p = 0; p < faits.length; p++) {
        const f = faits[p];
        const k = premierDuJour(faits, f.date);
        const ligue = faitsLigues.get(f.league) ?? [];
        // Du championnat, avantEquipe ne lit que le DERNIER fait d'avant J (la saison la plus récente, (d)) :
        // on ne lui passe que celui-là — toujours d'avant J, la garde le vérifie —, pas 1 500 faits recopiés à chaque ligne.
        const m = premierDuJour(ligue, f.date);
        const avant = avantEquipeSur(faits, k, ligue.slice(Math.max(0, m - 1), m), m > 0 ? 1 : 0, { date: f.date, league: f.league, saison: f.saison, matchKey: f.matchKey });
        if (memesValeurs(f, avant, AVANT_EQUIPE)) continue;
        if (comparer) bilan.changements.avantEquipe++;
        garder(f.rencontre, f.camp, avant);
      }
      bilan.clubsRecalcules++;
      await ctx.siLongtemps('avant des équipes');
    }
  }
  // L'écriture, dans l'ordre de la clé (rencontre, camp) : un tri de nombres (clé × 2^20 + rang), ~10 ms pour 120 000 lignes.
  const ordre = new Float64Array(changees);
  for (let i = 0; i < changees; i++) ordre[i] = cles[i] * 1048576 + i;
  ordre.sort();
  const majAvant = database.prepare(`UPDATE team_day SET ${AVANT_EQUIPE.map((c) => `${c} = ?`).join(', ')} WHERE rencontre = ? AND camp = ?`);
  await ctx.ecrire(ordre, (code) => {
    const i = code % 1048576;
    const cle = cles[i];
    const valeurs = new Array(largeur);
    for (let c = 0; c < largeur; c++) {
      const v = tampon[i * largeur + c];
      valeurs[c] = v === VIDE ? null : v;
    }
    majAvant.run(...valeurs, Math.floor(cle / 2), cle % 2);
  }, { taille: TRANCHE_EQUIPE, ou: 'avant des équipes' });
  bilan.lignes.avantEquipe += changees;
}

// ======================================================= le contrôle anti-fuite

/** Le point d'entrée du contrôle dans un processus à part (cf. dayTableControle.js). */
const SCRIPT_CONTROLE = fileURLToPath(new URL('./dayTableControle.js', import.meta.url));

/** Le délai maximal du contrôle à part : 10 min (il prend 3 à 7 s sur la base de Pierre). */
const DELAI_CONTROLE_MS = 10 * 60_000;

/** La graine du contrôle d'une nuit : son jour, AAAAMMJJ (UTC). */
export const graineDuJour = (instant = new Date()) => Number(new Date(instant).toISOString().slice(0, 10).replace(/-/g, ''));

/**
 * Le contrôle anti-fuite dans un PROCESSUS À PART (fork : mêmes options de Node, même environnement), base ouverte
 * en lecture seule — jamais un second écrivain. Rend { lignes, ecarts, verifiees, rssMaxOctets, dureeMs } ; lève si
 * le processus échoue, meurt sans répondre, ou ne répond pas dans `delaiMs` (il est alors arrêté).
 */
function controleAPart({ chemin, lignes, graine, delaiMs = DELAI_CONTROLE_MS }) {
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const enfant = fork(SCRIPT_CONTROLE, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    // `fini` est posé AVANT d'arrêter l'enfant : sa sortie, qui suit, ne rejette pas une seconde fois.
    const minuterie = setTimeout(() => {
      if (fini) return;
      fini = true;
      try {
        enfant.kill();
      } catch {
        // déjà arrêté
      }
      reject(new Error(`contrôle à part arrêté : aucune réponse en ${delaiMs < 1000 ? `${delaiMs} ms` : `${Math.round(delaiMs / 1000)} s`}`));
    }, delaiMs);
    minuterie.unref?.();
    enfant.stderr?.on('data', (d) => {
      erreurs = (erreurs + d).slice(-2000);
    });
    enfant.on('message', (m) => {
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(m);
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!fini) reject(error);
      fini = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!fini) reject(new Error(`contrôle à part arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      fini = true;
    });
    enfant.send({ chemin, lignes, graine });
  });
}

/** Générateur à graine (mulberry32, celui du juge de l'étape 16) : le même tirage à chaque passage. */
function generateur(graine) {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** La règle NON_ATTRIBUE de scoreFormRead, recopiée pour le second chemin (SQL). */
const NON_ATTRIBUE_SQL =
  "COALESCE(json_extract(m.meta, '$.awarded'), 0) <> 1 AND COALESCE(json_extract(m.meta, '$.reason'), '') NOT IN ('awarded_win', 'id_reused')";
/** Même valeur : deux absences, deux nombres à 1e-9 près (moyennes de REAL), sinon le même texte. */
function memeNombre(a, b) {
  const vide = (x) => x === null || x === undefined;
  if (vide(a) || vide(b)) return vide(a) && vide(b);
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9;
  return String(a) === String(b);
}

/**
 * LE CONTRÔLE ANTI-FUITE (§4.4) : un SECOND CHEMIN, indépendant du calcul de
 * la table, recalcule des lignes tirées au hasard (graine) DEPUIS LES TABLES
 * SOURCES avec `date < J` explicite, et les compare colonne par colonne :
 *   - (a) par statInputsRead.moyennesEquipe (par identifiant) ;
 *   - (b), (c) par scoreInputsFromStore (identifiants donnés), (e1) par
 *     leagueAveragesBefore ;
 *   - (d), (e2), les faits et les joueurs par des requêtes SQL écrites ici
 *     (matches par home_id / away_id et +league, jamais par le nom).
 * Rend { lignes, ecarts: [{ table, rencontre, camp | joueur, colonne, stocke,
 * attendu, source }], verifiees }. Lecture seule, par une connexion À PART
 * (en lecture seule) quand la base est un fichier : les mémoires des lecteurs
 * du moteur (dix minutes pour les moyennes d'un championnat, une minute pour
 * les noms) sont propres à une connexion — jamais une valeur gardée d'avant
 * la nuit ne passe pour la vérité.
 */
export function controleAntiFuite({ database = openDb(), lignes = 20, graine = 1 } = {}) {
  const parLignes = controleParLignes({ database, lignes, graine });
  let pas = parLignes.next();
  while (!pas.done) pas = parLignes.next();
  return pas.value;
}

/**
 * Le contrôle, une ligne à la fois (générateur) : la construction rend la
 * main au serveur entre deux lignes ; controleAntiFuite va d'une traite.
 */
function* controleParLignes({ database, lignes, graine }) {
  let lecteur = database;
  let aFermer = null;
  try {
    const lieu = typeof database.location === 'function' ? database.location() : null;
    if (lieu) {
      aFermer = new DatabaseSync(lieu, { readOnly: true });
      aFermer.exec('PRAGMA busy_timeout = 15000;');
      lecteur = aFermer;
    }
  } catch {
    lecteur = database;
  }
  try {
    return yield* controlerAvec(lecteur, lignes, graine);
  } finally {
    try {
      aFermer?.close();
    } catch {
      // déjà fermée
    }
  }
}

function* controlerAvec(database, lignes, graine) {
  const tirer = generateur(graine);
  const ecarts = [];
  const verifiees = { equipe: [], joueur: [] };
  const ecart = (e) => ecarts.push(e);
  const bornes = database.prepare(bornesDe('team_day', 'rencontre')).get();
  if (bornes.mi === null) return { lignes: 0, ecarts, verifiees };
  const ligneApres = database.prepare('SELECT t.*, d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE t.rencontre >= ? ORDER BY t.rencontre LIMIT 2');
  const vus = new Set();
  for (let essai = 0; verifiees.equipe.length < lignes && essai < lignes * 5; essai++) {
    const cible = bornes.mi + Math.floor(tirer() * (bornes.ma - bornes.mi + 1));
    const camp = tirer() < 0.5 ? 1 : 0;
    const r = ligneApres.all(cible).find((x) => x.camp === camp);
    if (!r || vus.has(`${r.rencontre}|${r.camp}`)) continue;
    vus.add(`${r.rencontre}|${r.camp}`);
    verifiees.equipe.push({ rencontre: r.rencontre, camp: r.camp, matchKey: r.match_key });
    try {
      yield* controlerUneLigneEquipe(database, r, ecart);
    } catch (error) {
      // Une donnée illisible (un `meta` qui n'est pas du JSON fait lever les lecteurs du moteur eux-mêmes) : un écart dit, jamais la nuit arrêtée.
      ecart({ table: 'team_day', rencontre: r.rencontre, camp: r.camp, matchKey: r.match_key, colonne: '(contrôle)', stocke: null, attendu: null, source: `erreur : ${error.message}` });
    }
    yield;
  }
  const bj = database.prepare(bornesDe('player_day', 'joueur')).get();
  if (bj.mi !== null) {
    const joueurApres = database.prepare('SELECT joueur FROM player_day WHERE joueur >= ? ORDER BY joueur LIMIT 1');
    const sesLignes = database.prepare('SELECT * FROM player_day WHERE joueur = ? ORDER BY date, rencontre');
    const vusJ = new Set();
    for (let essai = 0; verifiees.joueur.length < lignes && essai < lignes * 5; essai++) {
      const j = joueurApres.get(bj.mi + Math.floor(tirer() * (bj.ma - bj.mi + 1)))?.joueur;
      if (j === undefined) continue;
      const siennes = sesLignes.all(j);
      const r = siennes[Math.floor(tirer() * siennes.length)];
      if (!r || vusJ.has(`${r.joueur}|${r.date}|${r.rencontre}`)) continue;
      vusJ.add(`${r.joueur}|${r.date}|${r.rencontre}`);
      verifiees.joueur.push({ joueur: r.joueur, date: r.date, rencontre: r.rencontre });
      try {
        yield* controlerUneLigneJoueur(database, r, ecart);
      } catch (error) {
        ecart({ table: 'player_day', joueur: r.joueur, date: r.date, rencontre: r.rencontre, colonne: '(contrôle)', stocke: null, attendu: null, source: `erreur : ${error.message}` });
      }
      yield;
    }
  }
  return { lignes: verifiees.equipe.length + verifiees.joueur.length, ecarts, verifiees };
}

/**
 * Une ligne d'équipe recalculée par le second chemin, morceau par morceau (un
 * `yield` entre deux : chaque morceau tient au plus ~0,1 s sur la base de
 * Pierre, le coût des lecteurs du moteur eux-mêmes).
 */
function* controlerUneLigneEquipe(database, r, ecart) {
  const J = r.date;
  const L = r.league;
  const teamId = enFotmob(r.club);
  const base = { table: 'team_day', rencontre: r.rencontre, camp: r.camp, matchKey: r.match_key };
  const comparer = (colonne, stocke, attendu, source) => {
    if (!memeNombre(stocke, attendu)) ecart({ ...base, colonne, stocke: stocke ?? null, attendu: attendu ?? null, source });
  };
  // (a) la fenêtre 10/6, par la fonction du moteur.
  const a = moyennesEquipe(teamId, J, database);
  for (const [s, cle] of STATS_F10) {
    const n = r[`f10_${s}_n`];
    const stocke = n >= C.minimumFenetre ? { for: r[`f10_${s}_p`] / n, against: r[`f10_${s}_c`] / n, sample: n } : null;
    const attendu = a[cle];
    comparer(`f10_${s}_p`, stocke?.for ?? null, attendu?.for ?? null, 'statInputsRead.moyennesEquipe');
    comparer(`f10_${s}_c`, stocke?.against ?? null, attendu?.against ?? null, 'statInputsRead.moyennesEquipe');
    comparer(`f10_${s}_n`, stocke?.sample ?? null, attendu?.sample ?? null, 'statInputsRead.moyennesEquipe');
  }
  yield;
  // (b), (c) la forme et la saison, par scoreInputsFromStore (identifiants donnés : jamais le nom).
  const autre = enFotmob(r.adversaire);
  const si = scoreInputsFromStore({ league: L, date: J, homeId: r.camp === 1 ? teamId : autre, awayId: r.camp === 1 ? autre : teamId, database });
  const cote = r.camp === 1 ? si.home : si.away;
  const refs = [1, 2, 3, 4, 5].map((k) => r[`f5_${k}`]);
  const clesStockees = refs.map((ref) => (ref === null || ref === undefined ? null : database.prepare('SELECT match_key FROM day_matches WHERE rencontre = ?').get(ref)?.match_key ?? `(rencontre ${ref} absente du registre)`));
  for (let k = 0; k < C.forme; k++) comparer(`f5_${k + 1}`, clesStockees[k], cote.last[k]?.matchKey ?? null, 'scoreFormRead.scoreInputsFromStore');
  const s = saisonMoteur(r);
  const sa = cote.season;
  for (const [champ, colonne] of [['forHome', 's_bp_dom'], ['againstHome', 's_bc_dom'], ['forAway', 's_bp_ext'], ['againstAway', 's_bc_ext'], ['matches', 's_n']]) {
    comparer(colonne, s?.[champ] ?? null, sa?.[champ] ?? null, 'scoreFormRead.scoreInputsFromStore');
  }
  comparer('s_en_saison', s ? (s.inSeason ? 1 : 0) : null, sa ? (sa.inSeason ? 1 : 0) : null, 'scoreFormRead.scoreInputsFromStore');
  yield;
  // (e1) par leagueAveragesBefore, (e2) par une requête à part.
  const ligne = database.prepare(`SELECT ${COLONNES_LIGUE.join(', ')} FROM league_day WHERE league = ? AND date = ?`).get(L, J);
  const e1 = leagueAveragesBefore(L, J, { database });
  const m1 = moyennesDeLaLigne(ligne);
  const baseL = { table: 'league_day', league: L, date: J, rencontre: r.rencontre };
  const comparerL = (colonne, stocke, attendu, source) => {
    if (!memeNombre(stocke, attendu)) ecart({ ...baseL, colonne, stocke: stocke ?? null, attendu: attendu ?? null, source });
  };
  if (!ligne) ecart({ ...baseL, colonne: '(ligne)', stocke: null, attendu: 'une ligne', source: 'league_day' });
  comparerL('l_n', m1.matches, e1.matches, 'scoreFormRead.leagueAveragesBefore');
  if (m1.source !== e1.source) ecart({ ...baseL, colonne: 'l_source', stocke: m1.source, attendu: e1.source, source: 'scoreFormRead.leagueAveragesBefore' });
  comparerL('l_bd', m1.goals.home, e1.goals.home, 'scoreFormRead.leagueAveragesBefore');
  comparerL('l_be', m1.goals.away, e1.goals.away, 'scoreFormRead.leagueAveragesBefore');
  comparerL('l_xd', m1.xg.home, e1.xg.home, 'scoreFormRead.leagueAveragesBefore');
  comparerL('l_xe', m1.xg.away, e1.xg.away, 'scoreFormRead.leagueAveragesBefore');
  comparerL('l_cd', m1.shotsOnTarget?.home ?? null, e1.shotsOnTarget?.home ?? null, 'scoreFormRead.leagueAveragesBefore');
  comparerL('l_ce', m1.shotsOnTarget?.away ?? null, e1.shotsOnTarget?.away ?? null, 'scoreFormRead.leagueAveragesBefore');
  yield;
  const derniere = database.prepare('SELECT MAX(date) d FROM matches WHERE league = ? AND date < ?').get(L, J).d;
  const saisonRecente = derniere ? seasonOf(L, derniere) : null;
  let cN = 0;
  let cBd = 0;
  let cBe = 0;
  if (saisonRecente !== null) {
    const [deb, fin] = seasonBounds(L, saisonRecente);
    // Les clés de la saison par l'index (league, date) — couvrant —, puis leur meta (rangé derrière le déroulé) par paquets de 50.
    const clesSaison = database.prepare('SELECT match_key FROM matches WHERE league = ? AND date >= ? AND date < ? AND date < ?').all(L, deb, fin, J).map((x) => x.match_key);
    const paquet = database.prepare('SELECT home_goals, away_goals, meta FROM matches WHERE match_key IN (SELECT value FROM json_each(?)) AND home_goals IS NOT NULL AND away_goals IS NOT NULL');
    for (let i = 0; i < clesSaison.length; i += 50) {
      yield;
      for (const m of paquet.all(JSON.stringify(clesSaison.slice(i, i + 50)))) {
        let meta = {};
        try {
          meta = JSON.parse(m.meta ?? '{}') ?? {};
        } catch {
          meta = {};
        }
        if (!countsForTable(meta)) continue;
        cN++;
        cBd += m.home_goals;
        cBe += m.away_goals;
      }
    }
  }
  comparerL('c_saison', ligne?.c_saison ?? null, saisonRecente, 'SQL (matches)');
  comparerL('c_n', ligne?.c_n ?? null, cN, 'SQL (matches)');
  comparerL('c_bd', ligne?.c_bd ?? null, cBd, 'SQL (matches)');
  comparerL('c_be', ligne?.c_be ?? null, cBe, 'SQL (matches)');
  yield;
  // (d) les buts de la saison, par une requête à part (identifiant, +league : jamais le nom).
  const sesMatchs = database
    .prepare(
      `SELECT date, home_goals hg, away_goals ag, 1 AS dom FROM matches WHERE home_id = ? AND +league = ? AND date < ? AND home_goals IS NOT NULL AND away_goals IS NOT NULL
       UNION ALL SELECT date, home_goals, away_goals, 0 FROM matches WHERE away_id = ? AND +league = ? AND date < ? AND home_goals IS NOT NULL AND away_goals IS NOT NULL`
    )
    .all(teamId, L, J, teamId, L, J);
  const [debG, finG] = saisonRecente !== null ? seasonBounds(L, saisonRecente) : [null, null];
  const deLaSaison = saisonRecente !== null ? sesMatchs.filter((m) => m.date >= debG && m.date < finG) : sesMatchs;
  const baseG = deLaSaison.length >= C.minimumSaisonEquipe ? deLaSaison : sesMatchs;
  const g = { g_bp_dom: 0, g_bc_dom: 0, g_n_dom: 0, g_bp_ext: 0, g_bc_ext: 0, g_n_ext: 0 };
  for (const m of baseG) {
    if (m.dom) {
      g.g_bp_dom += m.hg;
      g.g_bc_dom += m.ag;
      g.g_n_dom++;
    } else {
      g.g_bp_ext += m.ag;
      g.g_bc_ext += m.hg;
      g.g_n_ext++;
    }
  }
  for (const [colonne, attendu] of Object.entries(g)) comparer(colonne, r[colonne], attendu, 'SQL (matches)');
  comparer('g_saison', r.g_saison, saisonRecente, 'SQL (matches)');
  yield;
  // Les faits du match, relus dans les tables sources : TOUTES les colonnes de faits.
  const attendus = faitsEquipeEnSql(database, r.match_key, r.camp);
  if (!attendus) {
    ecart({ ...base, colonne: '(rencontre)', stocke: r.match_key, attendu: null, source: 'SQL (matches)' });
    return;
  }
  for (const [colonne, attendu] of Object.entries(attendus)) comparer(colonne, r[colonne], attendu, SOURCE_DES_FAITS[colonne] ?? 'SQL (matches, team_stats)');
  // Le CONTENU des cinq rencontres de la forme (ce que le moteur lira dans `last`) : leurs faits, côté du club.
  const ligneDuClub = database.prepare('SELECT t.*, d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE t.rencontre = ? AND t.club = ?');
  for (let k = 1; k <= C.forme; k++) {
    const ref = r[`f5_${k}`];
    if (ref === null || ref === undefined) continue;
    yield;
    const l = ligneDuClub.get(ref, r.club);
    if (!l) {
      ecart({ ...base, colonne: `f5_${k}`, stocke: ref, attendu: 'une ligne du club', source: 'team_day' });
      continue;
    }
    const a = faitsEquipeEnSql(database, l.match_key, l.camp);
    if (!a) {
      ecart({ ...base, colonne: `f5_${k}`, stocke: l.match_key, attendu: null, source: 'SQL (matches)' });
      continue;
    }
    for (const colonne of COLONNES_DE_LA_FORME) comparer(`f5_${k}.${colonne}`, l[colonne], a[colonne], SOURCE_DES_FAITS[colonne] ?? 'SQL (matches, team_stats)');
  }
}

/** D'où vient chaque fait d'équipe recalculé (le nom de la source dans un écart). */
const SOURCE_DES_FAITS = Object.freeze({
  date: 'SQL (matches)',
  league: 'SQL (matches)',
  saison: 'seasonWindows.seasonOf',
  club: 'SQL (matches)',
  adversaire: 'SQL (matches)',
  bp: 'SQL (matches)',
  bc: 'SQL (matches)',
  attribue: 'SQL (matches.meta)',
  prolongation: 'SQL (matches.meta)',
  compte: 'SQL (matches.meta)',
  coupe: 'leagueCups.isCup',
  bp90: 'SQL (matches.events)',
  bc90: 'SQL (matches.events)'
});
/** Ce que la forme (b) lit d'une rencontre : la date, le championnat, l'adversaire, les buts, les xG, les tirs cadrés. */
const COLONNES_DE_LA_FORME = Object.freeze(['date', 'league', 'adversaire', 'bp', 'bc', 'xg_p', 'xg_c', 'cadres_p', 'cadres_c', 'attribue']);

/**
 * Les faits d'un camp d'une rencontre, recalculés À LA MAIN depuis matches et team_stats (le second chemin : jamais
 * faitsDUneRencontre) ; null si la rencontre n'est plus au magasin.
 */
function faitsEquipeEnSql(database, matchKey, camp) {
  const m = database.prepare('SELECT date, league, home_id, away_id, home_goals, away_goals, meta, events FROM matches WHERE match_key = ?').get(matchKey);
  if (!m) return null;
  const st = database.prepare(`SELECT ${COLONNES_SOURCE_EQUIPE} FROM team_stats WHERE match_key = ?`).all(matchKey);
  const moi = st.find((x) => x.side === (camp === 1 ? 'home' : 'away')) ?? null;
  const lui = st.find((x) => x.side === (camp === 1 ? 'away' : 'home')) ?? null;
  const numero = (id) => (id === null || id === undefined ? null : Number(String(id).replace(/^fotmob-/, '')));
  const a = {
    date: m.date,
    league: m.league,
    saison: seasonOf(m.league ?? '', m.date),
    club: numero(camp === 1 ? m.home_id : m.away_id),
    adversaire: numero(camp === 1 ? m.away_id : m.home_id),
    bp: camp === 1 ? m.home_goals : m.away_goals,
    bc: camp === 1 ? m.away_goals : m.home_goals,
    releve: moi && lui ? 1 : 0
  };
  const xgOk = moi?.expected_goals != null && lui?.expected_goals != null;
  a.xg_p = xgOk ? moi.expected_goals : null;
  a.xg_c = xgOk ? lui.expected_goals : null;
  for (const [s, col] of Object.entries(COLONNES_EQUIPE)) {
    a[`${s}_p`] = moi?.[col] ?? null;
    a[`${s}_c`] = lui?.[col] ?? null;
  }
  a.possession_p = moi?.ball_possession ?? null;
  let meta = {};
  let lisible = true;
  try {
    meta = JSON.parse(m.meta ?? '{}') ?? {};
  } catch {
    lisible = false;
  }
  const raison = String(meta.reason ?? '');
  a.attribue = meta.awarded === 1 || meta.awarded === true || raison === 'awarded_win' || raison === 'id_reused' ? 1 : 0;
  a.prolongation = raison === 'afterextra' || raison === 'afterpenalties' ? 1 : 0;
  a.compte = !lisible || countsForTable(meta) ? 1 : 0;
  a.coupe = isCup(m.league) ? 1 : 0;
  // Le score à 90 minutes, recompté dans le déroulé (camp crédité, minute ≤ 90).
  let a90 = null;
  try {
    const ev = JSON.parse(m.events ?? 'null');
    if (Array.isArray(ev)) {
      const buts = ev.filter((e) => e?.type === 'goal');
      const complet =
        buts.length === m.home_goals + m.away_goals &&
        buts.every((b) => b.minute !== null && b.minute !== undefined && Number.isFinite(Number(b.minute)) && (b.side === 'home' || b.side === 'away')) &&
        buts.filter((b) => b.side === 'home').length === m.home_goals;
      if (complet) {
        const prolonge = a.prolongation === 1;
        const compte90 = (side) => (prolonge ? buts.filter((b) => b.side === side && Number(b.minute) <= 90).length : side === 'home' ? m.home_goals : m.away_goals);
        a90 = { home: compte90('home'), away: compte90('away') };
      }
    }
  } catch {
    a90 = null;
  }
  a.bp90 = a90 ? (camp === 1 ? a90.home : a90.away) : null;
  a.bc90 = a90 ? (camp === 1 ? a90.away : a90.home) : null;
  return a;
}

/**
 * Une ligne de joueur recalculée par le second chemin (SQL sur players,
 * matches, team_stats). Le `meta` d'une rencontre (pour « attribué ») se lit
 * derrière son déroulé : seulement pour les apparitions retenues, pas pour
 * toute la carrière (une carrière de 200 matchs tenait ~0,6 s).
 */
function* controlerUneLigneJoueur(database, r, ecart) {
  const pid = enFotmob(r.joueur);
  const base = { table: 'player_day', joueur: r.joueur, date: r.date, rencontre: r.rencontre };
  const comparer = (colonne, stocke, attendu, source) => {
    if (!memeNombre(stocke, attendu)) ecart({ ...base, colonne, stocke: stocke ?? null, attendu: attendu ?? null, source });
  };
  // Les 10 dernières apparitions jouées d'un jour strictement antérieur, hors matchs attribués.
  // Les rencontres de sa carrière, par l'index couvrant idx_players_id (aucune ligne lue), puis leur jour par
  // paquets de 50 : une jointure triée sur toute la carrière tenait jusqu'à 4 s à froid.
  const cles = [...new Set(database.prepare('SELECT match_key FROM players WHERE player_id = ?').all(pid).map((x) => x.match_key))];
  yield;
  const jourDe = new Map();
  const jours = database.prepare('SELECT match_key, date FROM matches WHERE match_key IN (SELECT value FROM json_each(?))');
  for (let i = 0; i < cles.length; i += 50) {
    for (const x of jours.all(JSON.stringify(cles.slice(i, i + 50)))) jourDe.set(x.match_key, x.date);
    yield;
  }
  const anterieures = cles
    .filter((k) => jourDe.has(k) && jourDe.get(k) < r.date)
    .sort((a, b) => {
      const da = jourDe.get(a);
      const db = jourDe.get(b);
      return da < db ? 1 : da > db ? -1 : a < b ? 1 : a > b ? -1 : 0;
    });
  // Du plus récent au plus ancien : jouée (minutes > 0 ou titulaire), match non attribué, jusqu'à 10.
  const saLigne = database.prepare('SELECT minutes, starter, rating, goals, xg FROM players WHERE match_key = ? AND player_id = ?');
  const nonAttribue = database.prepare(`SELECT (${NON_ATTRIBUE_SQL}) AS ok FROM matches m WHERE m.match_key = ?`);
  const xgDuMatch = database.prepare("SELECT (SELECT expected_goals FROM team_stats WHERE match_key = ? AND side = 'home') xh, (SELECT expected_goals FROM team_stats WHERE match_key = ? AND side = 'away') xa");
  const lignes = [];
  for (const k of anterieures) {
    if (lignes.length >= C.apparitions) break;
    const l = saLigne.get(k, pid);
    if (!l || !((l.minutes !== null && l.minutes > 0) || l.starter === 1)) continue;
    if (!nonAttribue.get(k)?.ok) continue;
    const x = xgDuMatch.get(k, k);
    lignes.push({ ...l, xh: x?.xh ?? null, xa: x?.xa ?? null });
    if (lignes.length % 3 === 0) yield;
  }
  const a = { a10_n: lignes.length, a10_min: 0, a10_note_s: 0, a10_note_n: 0, a10_buts: 0, a10_xg: null };
  for (const l of lignes) {
    if (l.minutes !== null) a.a10_min += l.minutes;
    if (l.rating !== null) {
      a.a10_note_s += Math.round(l.rating * 100);
      a.a10_note_n++;
    }
    a.a10_buts += l.goals ?? 0;
    if (l.xh !== null && l.xa !== null) a.a10_xg = (a.a10_xg ?? 0) + Math.round((l.xg ?? 0) * 1000);
  }
  for (const [colonne, attendu] of Object.entries(a)) comparer(colonne, r[colonne], attendu, 'SQL (players)');
  yield;
  // Ses faits du match lui-même : TOUTES les colonnes, les règles de couverture écrites ici à la main.
  const cle = database.prepare('SELECT match_key FROM day_matches WHERE rencontre = ?').get(r.rencontre)?.match_key;
  const p = cle
    ? database
        .prepare(
          `SELECT ${COLONNES_SOURCE_JOUEUR} FROM players WHERE player_id = ? AND match_key = ?
           ORDER BY ((COALESCE(minutes, 0) > 0) OR COALESCE(starter, 0) = 1) DESC, COALESCE(minutes, -1) DESC LIMIT 1`
        )
        .get(pid, cle)
    : null;
  if (!p) {
    ecart({ ...base, colonne: '(feuille)', stocke: cle ?? null, attendu: null, source: 'SQL (players)' });
    return;
  }
  const m = database.prepare('SELECT date, home_id, away_id FROM matches WHERE match_key = ?').get(cle);
  const st = Object.fromEntries(database.prepare('SELECT side, expected_goals, xgot, yellow_cards FROM team_stats WHERE match_key = ?').all(cle).map((x) => [x.side, x]));
  const numero = (id) => (id === null || id === undefined ? null : Number(String(id).replace(/^fotmob-/, '')));
  const joue = (p.minutes !== null && p.minutes > 0) || p.starter === 1 ? 1 : 0;
  const xgCouvert = st.home?.expected_goals != null && st.away?.expected_goals != null;
  const xgotCouvert = st.home?.xgot != null && st.away?.xgot != null;
  const cartons = st.home?.yellow_cards != null && st.away?.yellow_cards != null && !(Number(st.home.yellow_cards) === 0 && Number(st.away.yellow_cards) === 0);
  const sur1000 = (v) => Math.round((v ?? 0) * 1000);
  const attendus = {
    date: m?.date ?? null,
    club: numero(p.side === 'home' ? m?.home_id : m?.away_id),
    camp: p.side === 'home' ? 1 : 0,
    joue,
    titulaire: p.starter ?? null,
    entre: p.subbed_in ?? null,
    poste: POSITIONS.indexOf(p.position) + 1 || null,
    minutes: p.minutes ?? null,
    note: p.rating === null || p.rating === undefined ? null : Math.round(p.rating * 100),
    buts: joue ? p.goals ?? 0 : null,
    passes_d: joue ? p.assists ?? 0 : null,
    tirs: joue ? p.shots ?? 0 : null,
    cadres: joue ? p.shots_on_target ?? 0 : null,
    xg: joue && xgCouvert ? sur1000(p.xg) : null,
    xa: joue && xgCouvert ? sur1000(p.xa) : null,
    xgnp: joue && xgCouvert ? sur1000(p.xg_non_penalty) : null,
    xgot: joue && xgotCouvert ? sur1000(p.xgot) : null,
    pc: joue ? p.key_passes ?? 0 : null,
    recup: joue ? p.recoveries ?? 0 : null,
    duels_g: joue ? p.duels_won ?? 0 : null,
    duels_t: joue ? p.duels_total ?? 0 : null,
    buts_evites: p.goals_prevented === null || p.goals_prevented === undefined ? null : Math.round(p.goals_prevented * 100),
    buts_concedes: joue ? p.goals_conceded ?? 0 : null,
    jaunes: joue && cartons ? p.yellow_cards ?? 0 : null,
    rouges: joue && cartons ? p.red_cards ?? 0 : null,
    entre_min: joue ? p.sub_in_minute ?? null : null,
    sorti_min: joue ? p.sub_out_minute ?? null : null,
    csc: joue ? p.own_goals ?? 0 : null
  };
  for (const [colonne, attendu] of Object.entries(attendus)) comparer(colonne, r[colonne], attendu, 'SQL (players, matches, team_stats)');
}

export const __testing = { controleParLignes, anterieurs, indicateursDUneRencontre, avantDUnJoueur, IndexDesRencontres, faitEquipeDecode, faitJoueurDecode, f10Moteur, saisonMoteur, butsMoteur, jourApres, numeroFotmob };
