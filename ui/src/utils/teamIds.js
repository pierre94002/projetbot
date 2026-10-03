import { reactive } from 'vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';

/**
 * teamIds.js — l'identifiant FotMob d'un club d'après son nom et sa
 * compétition, pour son logo (TeamCrest.vue), partout où l'appli montre une
 * rencontre (01/10/2026). Les demandes des composants affichés en même temps
 * partent en UN appel (POST /match-stats/team-ids) ; les réponses sont gardées
 * pour toute la session, inconnus compris (null), et la page se met à jour
 * d'elle-même à leur arrivée (cache réactif).
 */

const cache = reactive(new Map()); // clé -> 'fotmob-<n>' | null
const enAttente = new Map(); // clé -> { name, league }
// Clés parties dans un lot dont la réponse n'est pas arrivée : un nouvel
// affichage pendant ce temps ne les redemande pas (03/10/2026).
const enVol = new Set();
// Ceux qui attendent une réponse (teamIdForAsync) : clé -> [resolve].
const attentes = new Map();
let minuteur = null;
const LOT = 300;

const cle = (name, league) => `${league ?? ''}\u0000${name}`;

function noter(k, id) {
  cache.set(k, id);
  for (const resolve of attentes.get(k) ?? []) resolve(id);
  attentes.delete(k);
}

async function envoyer() {
  minuteur = null;
  const lot = [...enAttente.entries()].slice(0, LOT);
  for (const [k] of lot) {
    enAttente.delete(k);
    enVol.add(k);
  }
  if (!lot.length) return;
  try {
    const { results } = await matchStatsApi.teamIds(lot.map(([, t]) => t));
    const recus = new Map((results ?? []).map((r) => [cle(r.name, r.league), r.teamId ?? null]));
    for (const [k] of lot) noter(k, recus.get(k) ?? null);
  } catch {
    // Serveur indisponible ou pas encore à jour : pas de logo, les initiales restent.
    for (const [k] of lot) noter(k, null);
  } finally {
    for (const [k] of lot) enVol.delete(k);
  }
  if (enAttente.size) planifier();
}

function planifier() {
  if (!minuteur) minuteur = setTimeout(envoyer, 40);
}

/**
 * L'identifiant du club s'il est connu ; `undefined` le temps de la réponse
 * (la demande part au prochain lot) ; `null` s'il est inconnu du magasin.
 */
export function teamIdFor(name, league = null) {
  if (!name) return null;
  const k = cle(name, league);
  if (cache.has(k)) return cache.get(k);
  if (!enAttente.has(k) && !enVol.has(k)) {
    enAttente.set(k, { name, league });
    planifier();
  }
  return undefined;
}

/**
 * Le même identifiant, attendu : 'fotmob-<n>', ou null si le club est
 * inconnu — ou si la réponse tarde plus de `delaiMs` (le serveur résout
 * alors lui-même, cf. favoritesRepository.js). Pour décider d'un favori sur
 * le bon club plutôt que sur son nom.
 */
export function teamIdForAsync(name, league = null, delaiMs = 5000) {
  const id = teamIdFor(name, league);
  if (id !== undefined) return Promise.resolve(id);
  const k = cle(name, league);
  return new Promise((resolve) => {
    const liste = attentes.get(k) ?? [];
    liste.push(resolve);
    attentes.set(k, liste);
    setTimeout(() => resolve(cache.has(k) ? cache.get(k) : null), delaiMs);
  });
}
