/**
 * donneesDeReference.js — la petite table de référence, faite une fois (étape 13 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Deux fichiers à côté, dans le CODE (ils voyagent avec l'appli, ce ne sont
 * pas des données d'exécution) :
 *   venues.json   un stade par club (identifiant FotMob) : nom, ville, pays,
 *                 coordonnées (lat, long), capacité, pelouse (« grass » ou
 *                 « artificial turf » chez FotMob) et synthétique ou non,
 *                 altitude seulement pour les villes d'une courte liste faite
 *                 à la main (environ 1 500 m ou plus), avec sa source ;
 *   derbies.json  les derbies des championnats suivis, par identifiants FotMob.
 * Comment ils ont été faits, et quand : leur champ « source », et
 * scripts/build-reference-venues.mjs pour les stades. L'étape 32 (contexte du
 * match) s'en servira : distance du déplacement, altitude, pelouse
 * synthétique, derby. Lecture seule, gardée en mémoire ; un fichier absent ou
 * illisible rend « rien », jamais une erreur.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_STADES = path.join(ICI, 'venues.json');
export const FICHIER_DERBIES = path.join(ICI, 'derbies.json');

const lus = new Map();
function lire(fichier) {
  if (lus.has(fichier)) return lus.get(fichier);
  let valeur = null;
  try {
    valeur = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  } catch {
    valeur = null;
  }
  lus.set(fichier, valeur);
  return valeur;
}

/** Le fichier des stades tel quel (ou null). */
export const lireStades = () => lire(FICHIER_STADES);
/** Le fichier des derbies tel quel (ou null). */
export const lireDerbies = () => lire(FICHIER_DERBIES);

/** Le stade habituel d'un club (identifiant FotMob), ou null. */
export function stadeDuClub(teamId) {
  return lireStades()?.clubs?.[teamId] ?? null;
}

const RAYON_TERRE_KM = 6371;
const radians = (d) => (d * Math.PI) / 180;
/** Distance à vol d'oiseau entre deux points { lat, long }, en km (formule de haversine), ou null. */
export function distanceKm(a, b) {
  if (![a?.lat, a?.long, b?.lat, b?.long].every((x) => Number.isFinite(x))) return null;
  const dLat = radians(b.lat - a.lat);
  const dLong = radians(b.long - a.long);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLong / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance entre les stades habituels de deux clubs, en km, ou null si l'un manque. */
export function distanceEntreClubs(idA, idB) {
  return distanceKm(stadeDuClub(idA), stadeDuClub(idB));
}

/** Altitude du stade d'un club (m), seulement s'il est dans la liste faite à la main ; null sinon (jamais 0). */
export function altitudeDuClub(teamId) {
  const a = stadeDuClub(teamId)?.altitude;
  return Number.isFinite(a) ? a : null;
}

/** Pelouse synthétique ? true / false, ou null quand FotMob ne la donne pas. */
export function pelouseSynthetique(teamId) {
  const s = stadeDuClub(teamId)?.synthetique;
  return typeof s === 'boolean' ? s : null;
}

/** Le derby que forment deux clubs (dans un sens ou dans l'autre), ou null. */
export function derbyEntre(idA, idB) {
  if (!idA || !idB || idA === idB) return null;
  for (const d of lireDerbies()?.derbies ?? []) {
    const ids = (d.clubs ?? []).map((c) => c.id);
    if (ids.includes(idA) && ids.includes(idB)) return d;
  }
  return null;
}
