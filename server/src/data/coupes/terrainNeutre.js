/**
 * terrainNeutre.js — LE LIEU D'UN MATCH DE COUPE (étape 36 du plan, lot 1, 09/11/2026) : explication seulement.
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge ; un seul import, formulesDuContexte.js (la distance et l'égalité de
 * deux noms de stade de l'étape 32, importées en lecture). Aucun chiffre n'en dépend (T-N4) : le terrain neutre n'est pas
 * mesurable au banc (≤ 10 % de puissance) et n'entre dans aucun pourcentage.
 *
 *   - LES STADES HABITUELS d'un club (par son IDENTIFIANT FotMob, jamais par son nom) : parmi ses matchs À DOMICILE
 *     (toutes compétitions) des 365 jours d'avant le jour J, le stade le plus fréquent (au moins 3 réceptions), plus les
 *     autres stades d'au moins 3 réceptions (stade provisoire, stade partagé). Un stade renommé d'une saison à l'autre ne
 *     casse rien : la fenêtre glisse.
 *   - LE LIEU : le stade du match parmi ceux du club qui reçoit → « domicile » ; sinon parmi ceux du visiteur →
 *     « chez-le-visiteur » (une finale dans le stade d'un des deux clubs n'est PAS neutre pour lui : décision de Pierre du
 *     02/11/2026) ; sinon, les deux clubs connus → « neutre » (avec la distance au stade de chacun quand les coordonnées
 *     existent) ; sinon « inconnu ». Deux stades sont le même par leur nom (memeStade) ou à 2 km au plus.
 * La liste tenue à la main et le « lieu habituel de la finale » ne sont pas au lot 1 (critique, constat 12) : « lieu pas
 * encore publié par FotMob » est honnête.
 * -----------------------------------------------------------------------
 */

import { distanceKm, memeStade, texteStable } from '../contexte/formulesDuContexte.js';

/** Les réglages du lieu (une copie de STADES de reglagesCoupes.js ; un test les compare : ce fichier n'importe que formulesDuContexte.js). */
export const REGLES_DU_LIEU = Object.freeze({ fenetreJours: 365, receptionsMin: 3, memeStadeKm: 2 });

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const moinsJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) - n * JOUR_MS).toISOString().slice(0, 10);
const cleDuStade = (s) => {
  const t = texteStable(s);
  return t ? t.toLocaleLowerCase('fr') : null;
};

/**
 * LES STADES HABITUELS des clubs au jour J. `receptions` : [{ club, date, stade, lat, long }] (les matchs à domicile, toutes
 * compétitions) ; seules celles de [J − 365 ; J[ comptent. Rend une Map club → { stade, receptions, autres: [{ stade,
 * receptions, lat, long }], lat, long } (seuls les clubs qui ont un stade d'au moins 3 réceptions).
 */
export function stadesHabituels(receptions, { jour, regles = REGLES_DU_LIEU } = {}) {
  const de = moinsJours(jour, regles.fenetreJours);
  const parClub = new Map();
  for (const r of receptions) {
    if (!(r.date >= de && r.date < jour)) continue;
    const cle = cleDuStade(r.stade);
    if (cle === null || r.club === null || r.club === undefined) continue;
    let c = parClub.get(r.club);
    if (!c) parClub.set(r.club, (c = new Map()));
    let s = c.get(cle);
    if (!s) c.set(cle, (s = { stade: texteStable(r.stade), receptions: 0, lat: null, long: null, dernier: '' }));
    s.receptions++;
    if (r.date >= s.dernier) {
      s.dernier = r.date;
      s.stade = texteStable(r.stade);
      if (fini(r.lat) && fini(r.long)) {
        s.lat = r.lat;
        s.long = r.long;
      }
    }
  }
  const out = new Map();
  for (const [club, stades] of parClub) {
    const assez = [...stades.values()].filter((s) => s.receptions >= regles.receptionsMin).sort((a, b) => b.receptions - a.receptions || (a.stade < b.stade ? -1 : 1));
    if (!assez.length) continue;
    const [premier, ...autres] = assez;
    out.set(club, { stade: premier.stade, receptions: premier.receptions, lat: premier.lat, long: premier.long, autres: autres.map((s) => ({ stade: s.stade, receptions: s.receptions, lat: s.lat, long: s.long })) });
  }
  return out;
}

/** Le stade `v` est-il l'un de ceux de `habituels` ? Par le nom, ou par les coordonnées à 2 km au plus. */
function parmi(v, habituels, regles) {
  if (!habituels) return false;
  for (const s of [{ stade: habituels.stade, lat: habituels.lat, long: habituels.long }, ...(habituels.autres ?? [])]) {
    if (memeStade(v.stade, s.stade) === true) return true;
    const d = distanceKm(v, s);
    if (d !== null && d <= regles.memeStadeKm) return true;
  }
  return false;
}

/**
 * LE LIEU d'un match. `v` : { stade, ville, lat, long } (le stade du match : la page FotMob ou l'archive d'avant-match,
 * relevées AVANT le coup d'envoi ; le magasin pour un match joué) ; `dom`, `ext` : les stades habituels des deux clubs
 * (null s'ils ne sont pas connus). Rend { valeur: 'domicile' | 'chez-le-visiteur' | 'neutre' | 'inconnu', stade, ville,
 * distances: { dom, ext } | null }.
 */
export function lieuDuMatch(v, dom, ext, { regles = REGLES_DU_LIEU } = {}) {
  const stade = texteStable(v?.stade ?? null);
  const base = { stade, ville: texteStable(v?.ville ?? null), distances: null };
  if (!stade) return { valeur: 'inconnu', ...base };
  const lieu = { stade, lat: fini(v?.lat) ? v.lat : null, long: fini(v?.long) ? v.long : null };
  if (parmi(lieu, dom, regles)) return { valeur: 'domicile', ...base };
  if (parmi(lieu, ext, regles)) return { valeur: 'chez-le-visiteur', ...base };
  if (!dom || !ext) return { valeur: 'inconnu', ...base };
  const km = (h) => {
    const d = distanceKm(lieu, h);
    return d === null ? null : Math.round(d);
  };
  const distances = { dom: km(dom), ext: km(ext) };
  return { valeur: 'neutre', ...base, distances: distances.dom === null && distances.ext === null ? null : distances };
}
