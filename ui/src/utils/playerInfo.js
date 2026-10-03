import { reactive } from 'vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';

/**
 * playerInfo.js — l'âge et la nationalité d'un joueur par son identifiant
 * FotMob, pour les listes qui ne les portent pas (page d'un match joué…),
 * 01/10/2026. Comme teamIds.js : les demandes des composants affichés en même
 * temps partent en UN appel (POST /match-stats/players-info), réponses gardées
 * pour la session, la page se met à jour d'elle-même à leur arrivée.
 */

const cache = reactive(new Map()); // identifiant -> { age, birthDate, countryCode, countryName } | null
const enAttente = new Set();
let minuteur = null;
const LOT = 400;

async function envoyer() {
  minuteur = null;
  const lot = [...enAttente].slice(0, LOT);
  for (const id of lot) enAttente.delete(id);
  if (!lot.length) return;
  try {
    const { players } = await matchStatsApi.playersInfo(lot);
    for (const id of lot) cache.set(id, players?.[id] ?? null);
  } catch {
    // Serveur indisponible ou pas encore à jour : pas de drapeau.
    for (const id of lot) cache.set(id, null);
  }
  if (enAttente.size) planifier();
}

function planifier() {
  if (!minuteur) minuteur = setTimeout(envoyer, 40);
}

/** Ce qu'on sait du joueur ; `undefined` le temps de la réponse ; `null` si rien. */
export function playerInfoFor(playerId) {
  if (!/^fotmob-\d+$/.test(String(playerId ?? ''))) return null;
  const id = String(playerId);
  if (cache.has(id)) return cache.get(id);
  if (!enAttente.has(id)) {
    enAttente.add(id);
    planifier();
  }
  return undefined;
}
