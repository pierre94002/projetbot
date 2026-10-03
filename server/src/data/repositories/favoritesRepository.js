/**
 * favoritesRepository.js — les équipes et les championnats favoris de Pierre
 * (03/10/2026 : « il faut me créer la possibilité d'ajouter des équipes
 * favorites et des ligues favorites, qui seront toujours affichées en premier
 * par rapport aux autres »).
 * -----------------------------------------------------------------------
 * Un seul fichier, data/runtime/favorites.json :
 *   { teams: [{ id, name, league, addedAt }], leagues: [{ name, addedAt }], updatedAt }
 * dans l'ordre d'ajout (celui des championnats est leur ordre d'affichage).
 *
 * Une équipe se reconnaît par son identifiant FotMob (« fotmob-<n> ») : la
 * liste des matchs mêle les noms des bookmakers et ceux de FotMob (« Leeds
 * United » / « Leeds »), seul l'identifiant les réunit, et deux homonymes aux
 * identifiants différents restent deux équipes. Quand l'interface n'en donne
 * pas, le serveur le cherche avec le résolveur des logos (teamIdResolver.js,
 * par nom ET championnat) ; un favori resté sans identifiant le reçoit à la
 * lecture dès que le magasin connaît le club. Les réponses portent en plus
 * les noms connus de chaque club (annuaire du magasin, `aliases`) :
 * l'interface reconnaît ses matchs sans demander l'identifiant de chacune
 * des centaines d'équipes de la liste — 16 s de calcul bloquant au serveur
 * la première fois, mesuré le 03/10/2026.
 *
 * Un championnat se reconnaît par son libellé tel que l'appli l'affiche
 * (« EPL », « La Liga - Spain »), le même dans les matchs, les classements et
 * les statistiques.
 *
 * Un réglage d'affichage : ni le moteur ni l'IA ne le lisent. Exclu de la
 * version des données (dataVersionRepository) : cocher une étoile ne doit
 * pas faire recharger toutes les pages.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { openDb } from '../db/matchStatsDb.js';
import { resolveTeamIds } from '../db/teamIdResolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAVORITES_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/favorites.json');

/** Garde-fous : un nom raisonnable, une liste raisonnable. */
const LONGUEUR_MAX = 120;
const NOMBRE_MAX = 300;

/** Une demande invalide (400), à distinguer d'une panne (500 : fichier illisible, disque). */
export class FavoritesValidationError extends Error {}

const texte = (valeur) => (typeof valeur === 'string' ? valeur.trim().slice(0, LONGUEUR_MAX) : '');

/**
 * Noms comparés sans casse, sans accents, ponctuation et tirets réduits à
 * des espaces : « Paris Saint-Germain » = « Paris Saint Germain ». Même règle
 * que l'interface (ui/src/utils/favoris.js).
 */
export const nomNormalise = (valeur) =>
  texte(valeur)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Un identifiant FotMob de club, ou null. */
const identifiant = (valeur) => (typeof valeur === 'string' && /^fotmob-\d+$/.test(valeur.trim()) ? valeur.trim() : null);

function lire() {
  const brut = readJsonFile(FAVORITES_FILE_PATH, null);
  if (brut === null) return { teams: [], leagues: [], updatedAt: null };
  // Une forme inattendue n'est jamais réécrite : mieux vaut une erreur que
  // des favoris effacés par la première étoile cochée.
  const formeInattendue =
    typeof brut !== 'object' ||
    Array.isArray(brut) ||
    (brut.teams !== undefined && !Array.isArray(brut.teams)) ||
    (brut.leagues !== undefined && !Array.isArray(brut.leagues));
  if (formeInattendue) throw new Error('favorites.json a une forme inattendue : il n’est pas réécrit, à vérifier à la main.');
  return {
    teams: (brut.teams ?? [])
      .filter((t) => texte(t?.name))
      .map((t) => ({ id: identifiant(t.id), name: texte(t.name), league: texte(t.league) || null, addedAt: t.addedAt ?? null })),
    leagues: (brut.leagues ?? []).filter((l) => texte(l?.name)).map((l) => ({ name: texte(l.name), addedAt: l.addedAt ?? null })),
    updatedAt: brut.updatedAt ?? null
  };
}

function ecrire(favoris) {
  const enregistre = { teams: dedoublonner(favoris.teams), leagues: favoris.leagues, updatedAt: new Date().toISOString() };
  writeJsonAtomic(FAVORITES_FILE_PATH, enregistre);
  return enregistre;
}

/** Un club, une entrée : deux favoris au même identifiant fusionnent (le premier ajouté reste). */
function dedoublonner(teams) {
  const vus = new Set();
  return teams.filter((t) => {
    if (!t.id) return true;
    if (vus.has(t.id)) return false;
    vus.add(t.id);
    return true;
  });
}

/** Même équipe : même identifiant quand les deux en ont un, sinon même nom. */
function memeEquipe(a, b) {
  if (a.id && b.id) return a.id === b.id;
  return nomNormalise(a.name) === nomNormalise(b.name);
}

/** L'identifiant FotMob d'un club d'après son nom et son championnat (résolveur des logos), ou null. */
function resoudreId(name, league) {
  try {
    return identifiant(resolveTeamIds([{ name, league }])[0]?.teamId ?? null);
  } catch {
    return null; // Magasin indisponible : le favori garde son nom, l'identifiant viendra à la lecture suivante.
  }
}

/** Les noms connus d'un club dans l'annuaire du magasin (nom canonique et écritures vues). */
function nomsConnus(teamId, database) {
  try {
    const canonique = database.prepare('SELECT name FROM teams WHERE team_id = ?').get(teamId)?.name;
    const alias = database.prepare('SELECT alias FROM team_aliases WHERE team_id = ?').all(teamId).map((r) => r.alias);
    return [...new Set([canonique, ...alias].filter(Boolean))];
  } catch {
    return [];
  }
}

/** La réponse : les favoris, chaque équipe identifiée avec ses noms connus (jamais enregistrés). */
function avecNoms(favoris) {
  let database = null;
  try {
    database = openDb();
  } catch {
    database = null;
  }
  return {
    ...favoris,
    teams: favoris.teams.map((t) => ({ ...t, aliases: t.id && database ? nomsConnus(t.id, database) : [] }))
  };
}

/**
 * Les favoris, dans l'ordre d'ajout. Un favori enregistré sans identifiant
 * (club inconnu du magasin à l'époque) le reçoit ici dès qu'il est connu.
 */
export function getFavorites() {
  const favoris = lire();
  let complete = false;
  for (const t of favoris.teams) {
    if (t.id) continue;
    const id = resoudreId(t.name, t.league);
    if (id) {
      t.id = id;
      complete = true;
    }
  }
  if (!complete) return avecNoms(favoris);
  try {
    return avecNoms(ecrire(favoris));
  } catch {
    // Fichier tenu (OneDrive) : la réponse porte déjà les identifiants, l'écriture se refera à la lecture suivante.
    return avecNoms({ ...favoris, teams: dedoublonner(favoris.teams) });
  }
}

/**
 * Met une équipe en favori (`favorite: true`) ou l'en retire (`false`).
 * Idempotent : redemander l'état déjà enregistré ne change rien. Sans
 * identifiant fourni, il est cherché ici : un retrait ne touche alors que le
 * bon club, jamais son homonyme.
 */
export function setFavoriteTeam({ id = null, name, league = null }, favorite) {
  const equipe = { id: identifiant(id), name: texte(name), league: texte(league) || null };
  if (!equipe.name) throw new FavoritesValidationError('Nom d’équipe vide.');
  if (!equipe.id) equipe.id = resoudreId(equipe.name, equipe.league);
  const favoris = lire();
  const index = favoris.teams.findIndex((t) => memeEquipe(t, equipe));

  if (favorite) {
    if (index !== -1) {
      if (favoris.teams[index].id || !equipe.id) return avecNoms(favoris);
      favoris.teams[index] = { ...favoris.teams[index], id: equipe.id };
      return avecNoms(ecrire(favoris));
    }
    if (favoris.teams.length >= NOMBRE_MAX) throw new FavoritesValidationError(`Pas plus de ${NOMBRE_MAX} équipes favorites.`);
    favoris.teams.push({ ...equipe, addedAt: new Date().toISOString() });
    return avecNoms(ecrire(favoris));
  }

  if (index === -1) return avecNoms(favoris);
  favoris.teams = favoris.teams.filter((t) => !memeEquipe(t, equipe));
  return avecNoms(ecrire(favoris));
}

/** Met un championnat en favori ou l'en retire ; idempotent, comme pour une équipe. */
export function setFavoriteLeague({ name }, favorite) {
  const nom = texte(name);
  if (!nom) throw new FavoritesValidationError('Nom de championnat vide.');
  const favoris = lire();
  const cle = nomNormalise(nom);
  const present = favoris.leagues.some((l) => nomNormalise(l.name) === cle);

  if (favorite) {
    if (present) return avecNoms(favoris);
    if (favoris.leagues.length >= NOMBRE_MAX) throw new FavoritesValidationError(`Pas plus de ${NOMBRE_MAX} championnats favoris.`);
    favoris.leagues.push({ name: nom, addedAt: new Date().toISOString() });
    return avecNoms(ecrire(favoris));
  }

  if (!present) return avecNoms(favoris);
  favoris.leagues = favoris.leagues.filter((l) => nomNormalise(l.name) !== cle);
  return avecNoms(ecrire(favoris));
}
