/**
 * fraicheurCotes.js — une cote de VOS bookmakers est-elle encore bonne ? (étape 7 du plan, 06/10/2026)
 * -----------------------------------------------------------------------
 * Une value n'existe qu'au prix du moment. Le relevé payant (The Odds API)
 * se fait à la main, parfois des jours avant le match, et une cote saisie à
 * la main vieillit aussi. LA RÈGLE, dans cet ordre (le délai et la règle des
 * compositions se règlent dans Réglages, data/runtime/fraicheur-cotes.json) :
 *   1. heure du relevé inconnue                       → à rafraîchir ;
 *   2. match commencé (heure exacte du coup d'envoi)  → à rafraîchir : une
 *      cote d'avant-match n'est plus jouable ;
 *   3. plus vieille que le délai (3 h par défaut)     → à rafraîchir ;
 *   4. compositions annoncées (une heure avant le coup d'envoi : FotMob
 *      publie la composition officielle à ce moment-là, cf.
 *      COMPO_OFFICIELLE_MINUTES de ui/src/utils/langageParis.js) et cote
 *      relevée AVANT cette annonce, si le réglage le demande → à rafraîchir ;
 *   5. sinon : fraîche.
 * La règle ne s'applique qu'aux cotes de VOS bookmakers ; une cote gratuite
 * reste une référence, jamais jouable (valueFinder.js), fraîche ou non.
 *
 * Le moteur ne change pas : cote juste, probabilités et pronostics restent
 * les mêmes. Seul le CONSEIL change : une value sur une cote à rafraîchir
 * n'est plus recommandée (findValueBetFraiche) — elle est dite « à
 * rafraîchir », jamais en vert. Pur : ni disque, ni base, ni réseau. La même
 * règle vit côté écran (ui/src/utils/langageParis.js, etatFraicheur) pour
 * que la pastille se périme d'elle-même quand l'heure tourne ; les tests
 * comparent les deux.
 * -----------------------------------------------------------------------
 */

import { findValueBet } from './valueFinder.js';

export const REGLAGE_FRAICHEUR_DEFAUT = Object.freeze({ maxAgeMinutes: 180, avantCompos: true });
/** Le délai se règle entre 15 minutes et 24 heures. */
export const BORNES_DELAI_MINUTES = Object.freeze({ min: 15, max: 1440 });
/** Les compositions officielles sont annoncées une heure avant le coup d'envoi. */
export const COMPOS_ANNONCEES_MINUTES = 60;

const MINUTE_MS = 60_000;
const HEURE_PARIS = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

/** « 19 h 45 » (heure de Paris). */
export const heureDite = (instant) => HEURE_PARIS.format(new Date(instant)).replace(':', ' h ');

/** « 45 min », « 3 h », « 3 h 20 », « 2 jours ». */
export function dureeDite(minutes) {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const reste = m % 60;
    return reste ? `${h} h ${String(reste).padStart(2, '0')}` : `${h} h`;
  }
  const j = Math.floor(m / 1440);
  return `${j} jour${j > 1 ? 's' : ''}`;
}

/** « il y a moins d'une minute », « il y a 12 min », « il y a 3 h 20 ». */
export const depuisDit = (minutes) => (minutes < 1 ? "il y a moins d'une minute" : `il y a ${dureeDite(minutes)}`);

/** Un réglage lisible ; une valeur hors bornes ou d'un autre type reprend sa valeur par défaut. */
export function reglageFraicheur(reglage) {
  const max = reglage?.maxAgeMinutes;
  return {
    maxAgeMinutes: typeof max === 'number' && Number.isInteger(max) && max >= BORNES_DELAI_MINUTES.min && max <= BORNES_DELAI_MINUTES.max ? max : REGLAGE_FRAICHEUR_DEFAUT.maxAgeMinutes,
    avantCompos: typeof reglage?.avantCompos === 'boolean' ? reglage.avantCompos : REGLAGE_FRAICHEUR_DEFAUT.avantCompos
  };
}

const instantOuNaN = (x) => (x === null || x === undefined || x === '' ? Number.NaN : new Date(x).getTime());

/**
 * La fraîcheur d'une cote. Rend l'état ET ce qui l'a décidé (heure du relevé,
 * coup d'envoi, réglage) : l'écran la réévalue à l'heure qui tourne.
 *
 * @param {object} p
 * @param {string|null} p.releveAt   l'heure du relevé (ISO)
 * @param {number}      p.maintenant l'instant de l'évaluation (ms)
 * @param {string|null} p.coupDEnvoi l'heure du coup d'envoi (ISO)
 * @param {boolean}     p.heureSure  l'heure du coup d'envoi est exacte (faux : le jour seul, calendrier FotMob)
 * @param {object}      p.reglage    { maxAgeMinutes, avantCompos }
 * @returns {{ etat: 'fraiche'|'a-rafraichir', code: string, raison: string, ageMinutes: number|null,
 *             releveAt: string|null, coupDEnvoi: string|null, heureSure: boolean, composAnnonceesA: string|null,
 *             limiteMinutes: number, reglage: object, evalueeLe: string }}
 */
export function fraicheurCote({ releveAt = null, maintenant = Date.now(), coupDEnvoi = null, heureSure = true, reglage = REGLAGE_FRAICHEUR_DEFAUT } = {}) {
  const r = reglageFraicheur(reglage);
  const t = instantOuNaN(releveAt);
  const sure = heureSure !== false;
  const k = sure ? instantOuNaN(coupDEnvoi) : Number.NaN;
  const annonce = Number.isFinite(k) ? k - COMPOS_ANNONCEES_MINUTES * MINUTE_MS : Number.NaN;
  const commun = {
    releveAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
    coupDEnvoi: Number.isFinite(instantOuNaN(coupDEnvoi)) ? new Date(instantOuNaN(coupDEnvoi)).toISOString() : null,
    heureSure: sure,
    composAnnonceesA: Number.isFinite(annonce) ? new Date(annonce).toISOString() : null,
    limiteMinutes: r.maxAgeMinutes,
    reglage: r,
    evalueeLe: new Date(maintenant).toISOString()
  };
  const dit = (etat, code, raison, ageMinutes) => ({ etat, code, raison, ageMinutes, ...commun });

  if (!Number.isFinite(t)) {
    return dit('a-rafraichir', 'heure-inconnue', "L'heure du relevé de cette cote est inconnue : impossible de dire si elle est encore bonne.", null);
  }
  const ecart = Math.max(0, maintenant - t);
  const age = Math.floor(ecart / MINUTE_MS);
  if (Number.isFinite(k) && maintenant >= k) {
    return dit('a-rafraichir', 'match-commence', `Le match a commencé à ${heureDite(k)} : une cote d'avant-match n'est plus jouable.`, age);
  }
  if (ecart > r.maxAgeMinutes * MINUTE_MS) {
    return dit('a-rafraichir', 'trop-vieille', `Relevée ${depuisDit(age)}, au-delà du délai de ${dureeDite(r.maxAgeMinutes)} : à relever de nouveau avant de parier.`, age);
  }
  if (r.avantCompos && Number.isFinite(annonce) && maintenant >= annonce && t < annonce) {
    return dit('a-rafraichir', 'avant-compos', `Relevée ${depuisDit(age)}, avant l'annonce des compositions (vers ${heureDite(annonce)}) : les cotes bougent à ce moment-là.`, age);
  }
  return dit('fraiche', 'fraiche', `Relevée ${depuisDit(age)} (délai : ${dureeDite(r.maxAgeMinutes)}).`, age);
}

/**
 * La fraîcheur de la cote de chaque bookmaker d'un match, d'après ce que
 * l'appelant fournit (`fraicheur`, cf. findValueBetFraiche) : une fonction
 * (clé du bookmaker) → fraicheurCote, évaluée une fois par bookmaker. Partagée
 * par findValueBetFraiche et par le verdict de chaque issue (verdictPari.js,
 * étape 8) : la même heure, le même réglage, le même instant.
 */
export function evaluateurDeFraicheur(fraicheur = {}) {
  const etats = new Map();
  return (cle) => {
    if (!etats.has(cle)) {
      const lu = fraicheur?.parBookmaker?.[cle] ?? null;
      etats.set(
        cle,
        fraicheurCote({
          releveAt: lu?.releveAt ?? null,
          maintenant: Number.isFinite(fraicheur?.maintenant) ? fraicheur.maintenant : Date.now(),
          coupDEnvoi: fraicheur?.coupDEnvoi ?? null,
          heureSure: fraicheur?.heureSure !== false,
          reglage: fraicheur?.reglage ?? REGLAGE_FRAICHEUR_DEFAUT
        })
      );
    }
    return etats.get(cle);
  };
}

/**
 * findValueBet, avec la fraîcheur des cotes de vos bookmakers.
 * `fraicheur` : { parBookmaker: { [cle]: { releveAt, origine } }, maintenant,
 * coupDEnvoi, heureSure, reglage } (cf. data/cotesDeVosBookmakers.js).
 *   - Le moteur ne recommande que sur une cote FRAÎCHE : s'il trouve une value
 *     chez un bookmaker frais, c'est elle (même si une cote périmée paie plus) ;
 *   - une value qui n'existe que sur des cotes à rafraîchir devient
 *     { action: 'PASS', reason: 'a_rafraichir', aRafraichir: <le pari> } ;
 *   - sans value nulle part : la même réponse que findValueBet.
 * Chaque candidat porte l'heure de sa cote (`releveAt`) et sa fraîcheur.
 */
export function findValueBetFraiche(params, fraicheur = {}) {
  const evaluer = evaluateurDeFraicheur(fraicheur);
  const origine = (cle) => fraicheur?.parBookmaker?.[cle]?.origine ?? null;
  const annoterCandidat = (c) => ({ ...c, releveAt: evaluer(c.bookmaker).releveAt, origineReleve: origine(c.bookmaker), fraicheur: evaluer(c.bookmaker) });
  const annoter = (r) => ({
    ...r,
    candidates: (r.candidates ?? []).map(annoterCandidat),
    ...(r.action === 'RECOMMENDED' ? { releveAt: evaluer(r.bookmaker).releveAt, origineReleve: origine(r.bookmaker), fraicheur: evaluer(r.bookmaker) } : {})
  });

  const tous = findValueBet(params);
  if (tous.action !== 'RECOMMENDED') return annoter(tous);
  const fraiches = (params.byBookmaker ?? []).filter((b) => evaluer(b.key).etat === 'fraiche');
  const frais = findValueBet({ ...params, byBookmaker: fraiches });
  if (frais.action === 'RECOMMENDED') return annoter(frais);
  const pari = annoterCandidat({
    outcome: tous.outcome,
    label: tous.label,
    odds: tous.odds,
    displayedOdds: tous.displayedOdds,
    bookmaker: tous.bookmaker,
    bookmakerTitle: tous.bookmakerTitle,
    fairOdds: tous.fairOdds,
    ev: tous.ev,
    exclusion: null
  });
  return { action: 'PASS', stake: null, reason: 'a_rafraichir', candidates: annoter(tous).candidates, limits: tous.limits, aRafraichir: pari };
}
