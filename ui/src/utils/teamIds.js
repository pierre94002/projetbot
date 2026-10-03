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
let minuteur = null;
const LOT = 300;

const cle = (name, league) => `${league ?? ''}\u0000${name}`;

async function envoyer() {
  minuteur = null;
  const lot = [...enAttente.entries()].slice(0, LOT);
  for (const [k] of lot) enAttente.delete(k);
  if (!lot.length) return;
  try {
    const { results } = await matchStatsApi.teamIds(lot.map(([, t]) => t));
    const recus = new Map((results ?? []).map((r) => [cle(r.name, r.league), r.teamId ?? null]));
    for (const [k] of lot) cache.set(k, recus.get(k) ?? null);
  } catch {
    // Serveur indisponible ou pas encore à jour : pas de logo, les initiales restent.
    for (const [k] of lot) cache.set(k, null);
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
  if (!enAttente.has(k)) {
    enAttente.set(k, { name, league });
    planifier();
  }
  return undefined;
}
