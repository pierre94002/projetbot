/**
 * -----------------------------------------------------------------------
 * Correspondance entre le vocabulaire du magasin et les colonnes SQLite.
 * -----------------------------------------------------------------------
 * Les noms de colonnes sont DÉRIVÉS des clés déclarées dans
 * merge-match-stats.mjs, jamais recopiés à la main : ajouter une statistique
 * au vocabulaire suffit à la faire apparaître en base. Une clé oubliée d'un
 * côté ne peut donc pas exister.
 *
 * Deux choix de typage, tirés de la mesure sur les 15 737 rencontres du
 * magasin (voir REAL_TEAM_KEYS / REAL_PLAYER_KEYS) :
 *   - les clés qui portent des décimales sont REAL, les autres INTEGER ;
 *   - « Ball Possession » et « Passes % » étaient stockées en texte (« 55% »).
 *     Le pourcentage est un nombre ; le « % » relève de l'affichage, et la
 *     lecture le remet pour ne rien changer au contrat de l'API.
 */

import { TEAM_STAT_KEYS, PLAYER_STAT_KEYS } from '../../utils/statVocabulary.js';

/** Clés d'équipe stockées en texte pourcenté dans le magasin JSON. */
export const PERCENT_TEAM_KEYS = new Set(['Ball Possession', 'Passes %']);

/** Clés à décimales, mesurées sur l'intégralité du magasin. */
const REAL_TEAM_KEYS = new Set([
  'expected_goals', 'xgot', 'goals_prevented', 'expected_assists', 'xgot_faced',
  'Ball Possession', 'Passes %'
]);
const REAL_PLAYER_KEYS = new Set([
  'rating', 'xa', 'xg', 'xgNonPenalty', 'xgot', 'xgotFaced', 'goalsPrevented'
]);

/**
 * Sept clés où ESPN renvoie 0 pour « non publié ». Quatre seulement reçoivent
 * la contrainte : sur les trois autres — passes décisives de centre, tacles
 * interceptés, dégagements — le magasin contient de vrais zéros (1 017, 33 et
 * 2 occurrences). Une contrainte qui refuserait une donnée authentique serait
 * un défaut, pas un garde-fou.
 */
export const POSITIVE_TEAM_KEYS = new Set(['Total passes', 'Passes accurate', 'tackles', 'long_balls']);

/** Les cinq familles de postes réellement publiées ; « Substitute » n'en est pas un. */
export const POSITIONS = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Sweeper'];

/** `Total Shots` -> `total_shots`, `shotsOnTarget` -> `shots_on_target`, `Passes %` -> `passes_pct`. */
export function toColumn(key) {
  return key
    .replace(/%/g, ' pct')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function build(keys, realKeys) {
  const columns = keys.map((key) => ({ key, column: toColumn(key), type: realKeys.has(key) ? 'REAL' : 'INTEGER' }));
  const seen = new Map();
  for (const c of columns) {
    if (seen.has(c.column)) throw new Error(`Collision de colonne « ${c.column} » entre « ${seen.get(c.column)} » et « ${c.key} »`);
    seen.set(c.column, c.key);
  }
  return columns;
}

export const TEAM_COLUMNS = build(TEAM_STAT_KEYS, REAL_TEAM_KEYS);
export const PLAYER_STAT_COLUMNS = build(PLAYER_STAT_KEYS, REAL_PLAYER_KEYS);

/** Identité, feuille de match et placement : tout ce qui n'est pas une statistique. */
export const PLAYER_META_COLUMNS = [
  { key: 'playerId', column: 'player_id', type: 'TEXT' },
  { key: 'name', column: 'name', type: 'TEXT' },
  { key: 'position', column: 'position', type: 'TEXT' },
  { key: 'number', column: 'shirt_number', type: 'INTEGER' },
  { key: 'starter', column: 'starter', type: 'INTEGER' },
  { key: 'subbedIn', column: 'subbed_in', type: 'INTEGER' },
  { key: 'x', column: 'x', type: 'REAL' },
  { key: 'y', column: 'y', type: 'REAL' },
  { key: 'subInMinute', column: 'sub_in_minute', type: 'INTEGER' },
  { key: 'subOutMinute', column: 'sub_out_minute', type: 'INTEGER' }
];

export const PLAYER_COLUMNS = [...PLAYER_META_COLUMNS, ...PLAYER_STAT_COLUMNS];
