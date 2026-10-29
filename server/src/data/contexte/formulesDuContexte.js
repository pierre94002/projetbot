/**
 * formulesDuContexte.js — LES FORMULES DE LA FICHE DE CONTEXTE (étape 32 du plan, lot 1a, 29/10/2026).
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge, aucun hasard, et AUCUN import hors des constantes
 * (reglagesContexte.js). C'est voulu (critique de l'étape 32, constat 22) : si le banc retient un jour un facteur, le
 * lot 2 ajoutera CE fichier à l'empreinte du moteur (MODULES_DU_MOTEUR.fichiers) — changer une formule changera alors la
 * version du moteur, au lieu de changer ses chiffres en silence. Jusque-là, il est hors de l'empreinte et rien du moteur
 * ne le lit (test contexteFrontiere, T-X2).
 *
 * Ce qu'on y trouve : l'identifiant d'un club (une seule conversion, constat 15 : « fotmob-8456 », « 8456 » ou 8456 →
 * 8456, et la clé de venues.json « fotmob-8456 »), les heures de repos entre deux coups d'envoi et leur classe, le
 * « serré » de l'enchaînement, la distance à vol d'oiseau, l'altitude, la pelouse, et l'entraîneur « au jour J ».
 * -----------------------------------------------------------------------
 */

import { SEUILS } from './reglagesContexte.js';

const JOUR_MS = 86_400_000;
const HEURE_MS = 3_600_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

// ======================================================= identifiants

/**
 * L'identifiant FotMob d'un club en NOMBRE : « fotmob-8456 », « 8456 » ou 8456 → 8456 ; tout le reste → null (jamais 0 :
 * FotMob donne 0 à des inconnus ; jamais un nom). La même règle que teamStyle.numeroDe (un test les compare).
 */
export function numeroDuClub(id) {
  const m = /^(?:fotmob-)?([1-9]\d*)$/.exec(String(id ?? '').trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** La clé d'un club dans venues.json (« fotmob-8456 ») — jamais le nombre seul (constat 15 : sinon, aucune distance). */
export const cleDuStade = (id) => {
  const n = numeroDuClub(id);
  return n === null ? null : `fotmob-${n}`;
};

/** Un texte ramené à une forme stable (NFC, espaces réduits) ; null s'il est vide. */
export function texteStable(t) {
  if (typeof t !== 'string') return null;
  const s = t.normalize('NFC').trim().replace(/\s+/g, ' ');
  return s ? s : null;
}

// ======================================================= le jour et l'heure

/** Le jour (AAAA-MM-JJ) d'une date ou d'un instant ISO ; null s'il est illisible. */
export function jourDe(x) {
  const j = String(x ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(j) && Number.isFinite(Date.parse(`${j}T00:00:00Z`)) ? j : null;
}

/** Le nombre de jours entiers entre deux jours (b − a). */
export const joursEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / JOUR_MS);

/** Un coup d'envoi CONNU : un instant ISO lisible, et le match ne le dit pas inconnu (le 12:00Z du calendrier est fictif). */
export const coupDEnvoiConnu = (m) => Boolean(m && m.kickoffConnu !== false && typeof m.kickoff === 'string' && Number.isFinite(Date.parse(m.kickoff)));

/**
 * Les HEURES entre deux matchs (de a vers b), coup d'envoi à coup d'envoi quand les deux sont connus ; sinon les jours
 * UTC × 24, avec `heureInconnue`. `a` et `b` : { date, kickoff, kickoffConnu }. Rend { heures, heureInconnue } ou
 * { heures: null } sans les deux dates.
 */
export function heuresEntre(a, b) {
  const ja = jourDe(a?.date ?? a?.kickoff);
  const jb = jourDe(b?.date ?? b?.kickoff);
  if (!ja || !jb) return { heures: null, heureInconnue: false };
  if (coupDEnvoiConnu(a) && coupDEnvoiConnu(b)) return { heures: (Date.parse(b.kickoff) - Date.parse(a.kickoff)) / HEURE_MS, heureInconnue: false };
  return { heures: joursEntre(ja, jb) * 24, heureInconnue: true };
}

/** La classe d'un repos : « court » sous 96 h, « normal » de 96 à 239,99 h, « long » à 240 h ou plus, « inconnu » sans repos. */
export function classeDeRepos(heures, seuils = SEUILS) {
  if (!fini(heures)) return 'inconnu';
  if (heures < seuils.courtH) return 'court';
  if (heures < seuils.longH) return 'normal';
  return 'long';
}

/** Les jours affichés d'un repos : floor(heures / 24), ou null. */
export const joursDeRepos = (heures) => (fini(heures) ? Math.floor(heures / 24) : null);

/** Le club rejoue-t-il « serré » (moins de 96 h) ? null quand on ne sait pas. */
export const estSerre = (heures, seuils = SEUILS) => (fini(heures) ? heures < seuils.serreH : null);

// ======================================================= déplacement, altitude, pelouse

const RAYON_TERRE_KM = 6371;
const radians = (d) => (d * Math.PI) / 180;
/** Distance à vol d'oiseau (haversine) entre deux points { lat, long }, en km, ou null — la formule de donneesDeReference.distanceKm. */
export function distanceKm(a, b) {
  if (![a?.lat, a?.long, b?.lat, b?.long].every((x) => fini(x))) return null;
  const dLat = radians(b.lat - a.lat);
  const dLong = radians(b.long - a.long);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLong / 2) ** 2;
  return 2 * RAYON_TERRE_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** La distance en échelle logarithmique : ln(1 + km / 100) (le banc la centrera sur ses matchs d'apprentissage). */
export const lnDistance = (km) => (fini(km) && km >= 0 ? Math.log1p(km / 100) : null);

/** Deux noms de stade désignent-ils le même stade ? (forme stable, sans casse) ; null si l'un manque. */
export function memeStade(a, b) {
  const x = texteStable(a);
  const y = texteStable(b);
  if (!x || !y) return null;
  return x.toLocaleLowerCase('fr') === y.toLocaleLowerCase('fr');
}

/**
 * L'altitude d'un match : `stade` (m) du club qui reçoit, `visiteur` (m) celle du club qui se déplace — seulement celles
 * de la liste faite à la main (sinon null : sous ~1 500 m). Concerné : stade à 2 000 m ou plus ET visiteur sans altitude
 * listée, ou au moins 1 500 m plus bas.
 */
export function altitudeDuMatch({ stade = null, visiteur = null } = {}, seuils = SEUILS) {
  const s = fini(stade) ? stade : null;
  const v = fini(visiteur) ? visiteur : null;
  const concerne = s !== null && s >= seuils.altitudeM && (v === null || s - v >= seuils.ecartAltitudeM);
  return { stade: s, visiteur: v, concerne };
}

/** La pelouse en mots fixes : « artificial turf » ou « synthetic » → synthetique ; « hybrid » → hybride ; « grass » → naturelle ; sinon null. */
export function pelouseDe(surface) {
  const s = texteStable(surface)?.toLowerCase() ?? null;
  if (!s) return null;
  if (/artificial|synthetic|turf|synth/.test(s)) return 'synthetique';
  if (/hybrid/.test(s)) return 'hybride';
  if (/grass|natural/.test(s)) return 'naturelle';
  return null;
}

// ======================================================= l'entraîneur au jour J

/** Deux observations désignent-elles le même entraîneur ? Par identifiant quand les deux l'ont, sinon par le nom exact (forme stable). */
export function memeEntraineur(a, b) {
  if (!a || !b) return false;
  if (Number.isSafeInteger(a.id) && a.id > 0 && Number.isSafeInteger(b.id) && b.id > 0) return a.id === b.id;
  const x = texteStable(a.nom);
  const y = texteStable(b.nom);
  return Boolean(x && y && x === y);
}

/**
 * L'ENTRAÎNEUR D'UN CLUB AU JOUR J : celui de son DERNIER match joué avant J. `observations` : ses matchs d'avant J, du
 * plus ancien au plus récent ({ date, nom, id } ; une ligne sans entraîneur est sautée : elle ne coupe pas la suite et ne
 * compte pas). Durée en poste = les matchs consécutifs avec lui, en remontant. Nouveau si : 5 matchs au plus, un autre le
 * précède dans l'historique, et il n'avait pas dirigé ce club dans les 365 jours avant le début de sa suite.
 * Rend { connu, nom, id, depuisMatchs, depuisLe, precedent, nouveau } (connu: false et le reste à null sans entraîneur).
 */
export function entraineurAuJourJ(observations, seuils = SEUILS) {
  const obs = (observations ?? []).filter((o) => o && (texteStable(o.nom) || (Number.isSafeInteger(o.id) && o.id > 0)));
  if (!obs.length) return { connu: false, nom: null, id: null, depuisMatchs: null, depuisLe: null, precedent: null, nouveau: null };
  const actuel = obs[obs.length - 1];
  let i = obs.length - 1;
  while (i > 0 && memeEntraineur(obs[i - 1], actuel)) i--;
  const depuisMatchs = obs.length - i;
  const depuisLe = obs[i].date;
  const avant = i > 0 ? obs[i - 1] : null;
  let nouveau = false;
  if (avant && depuisMatchs <= seuils.nouvelEntraineurMatchs) {
    const debut = Date.parse(`${depuisLe}T00:00:00Z`);
    const deja = obs.slice(0, i).some((o) => memeEntraineur(o, actuel) && debut - Date.parse(`${o.date}T00:00:00Z`) <= seuils.retourJours * JOUR_MS);
    nouveau = !deja;
  }
  return {
    connu: true,
    nom: texteStable(actuel.nom),
    id: Number.isSafeInteger(actuel.id) && actuel.id > 0 ? actuel.id : null,
    depuisMatchs,
    depuisLe,
    precedent: avant ? { nom: texteStable(avant.nom), id: Number.isSafeInteger(avant.id) && avant.id > 0 ? avant.id : null } : null,
    nouveau
  };
}
