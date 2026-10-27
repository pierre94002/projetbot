/**
 * langageParis.js — les règles du langage visuel des paris (étape 6 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Une seule façon d'afficher les notions de pari dans toute l'appli : une
 * value, une confiance, un mouvement de cote, l'état d'une composition, le
 * compte à rebours d'un coup d'envoi, la provenance d'un chiffre, et la
 * petite bulle « ? » qui les explique. Les composants de components/common
 * (ValueBadge, ConfidenceGauge, OddsMoveArrow, LineupStateBadge,
 * KickoffCountdown, ProvenanceChip, HelpTip) ne font que DESSINER ce que ce
 * fichier décide : les règles vivent ici, en JavaScript pur, sans Vue ni
 * navigateur, pour que les tests du serveur les rejouent
 * (server/test/langageParis.test.mjs) — à commencer par « jamais de vert sans
 * vraie value chez VOS bookmakers », comparée à findValueBet.
 *
 * Aucun calcul de pari nouveau : on classe et on dit ce que le serveur a déjà
 * calculé. Toute fonction qui dépend de l'heure reçoit `maintenant` (en ms) :
 * les composants lui passent l'horloge partagée (liveClock.js), les tests un
 * instant figé.
 * -----------------------------------------------------------------------
 */

import { computeMatchStatus, LIVE_WINDOW_MS } from './matchStatus.js';

const MINUTE_MS = 60_000;
const HEURE_MS = 3_600_000;
const JOUR_MS = 86_400_000;

// ------------------------------------------------------------- formats

const FORMAT_HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const FORMAT_JOUR_ANNEE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const FORMAT_LONG = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const FORMAT_LONG_JOUR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

const estNombre = (x) => typeof x === 'number' && Number.isFinite(x);
const decimales = (x, n = 1) => Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });

/** Le signe d'une valeur arrondie : « 0,0 » n'en porte pas (même règle que le repérage). */
function signeArrondi(x, n = 1) {
  const r = Math.round(x * 10 ** n) / 10 ** n;
  return r > 0 ? '+' : r < 0 ? '−' : '';
}

/** « +4,1 % », « −3,2 % », « 0,0 % » : un pourcentage signé, une décimale. */
export function pourcentSigne(x, n = 1) {
  return `${signeArrondi(x, n)}${decimales(x, n)} %`;
}

/** Les jours du calendrier (heure locale) qui séparent `a` de `b` : positif si `b` est plus tard. */
function joursCalendaires(a, b) {
  const jour = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((jour(b) - jour(a)) / JOUR_MS);
}

/** « aujourd'hui à 18:35 », « hier à 18:35 », « le 21/09 à 18:35 » (avec l'année si ce n'est pas la même). */
export function quandDit(instant, maintenant) {
  const t = new Date(instant);
  const auj = new Date(maintenant);
  const heure = FORMAT_HEURE.format(t);
  const ecart = joursCalendaires(t, auj);
  if (ecart === 0) return `aujourd'hui à ${heure}`;
  if (ecart === 1) return `hier à ${heure}`;
  return `le ${(t.getFullYear() === auj.getFullYear() ? FORMAT_JOUR : FORMAT_JOUR_ANNEE).format(t)} à ${heure}`;
}

/** « à l'instant », « il y a 12 min », « il y a 3 h », « hier », « il y a 15 jours ». */
export function ilYA(instant, maintenant) {
  const t = new Date(instant);
  const ecart = maintenant - t.getTime();
  if (ecart < MINUTE_MS) return "à l'instant";
  if (ecart < HEURE_MS) return `il y a ${Math.floor(ecart / MINUTE_MS)} min`;
  const jours = joursCalendaires(t, new Date(maintenant));
  if (jours <= 0) return `il y a ${Math.floor(ecart / HEURE_MS)} h`;
  if (jours === 1) return 'hier';
  return `il y a ${jours} jours`;
}

// ------------------------------------------------- le guide de lecture

/**
 * Les phrases de la petite bulle « ? » (HelpTip) : une phrase simple par
 * notion, écrite pour Pierre. Un seul endroit : une définition qui change se
 * change ici, partout où la bulle est posée.
 */
export const GUIDE_DE_LECTURE = Object.freeze({
  value: Object.freeze({
    titre: 'Value',
    phrase:
      "Il y a value quand un de vos bookmakers paie plus que le match ne vaut vraiment : sa cote dépasse la cote juste d'au moins le seuil du moteur. Une cote de référence gratuite n'en donne jamais."
  }),
  'valeur-de-cloture': Object.freeze({
    titre: 'Valeur de clôture',
    phrase:
      "Elle compare la cote au moment du choix à la dernière cote avant le coup d'envoi : si la cote a baissé depuis, le marché vous a donné raison, même si le pari est perdu."
  }),
  'sur-fragile': Object.freeze({
    titre: 'Sûr / fragile',
    phrase:
      "« Sûr » veut dire que les estimations du moteur s'accordent, que les données du match sont complètes et que ce niveau de pourcentage s'est déjà montré juste ; « fragile », qu'un de ces points manque."
  }),
  'series-de-pertes': Object.freeze({
    titre: 'Séries de pertes normales',
    phrase:
      "Perdre plusieurs paris d'affilée est normal, même avec de la value : sur quelques centaines de paris, une série d'une dizaine de pertes n'a rien d'exceptionnel et ne prouve pas que le moteur se trompe."
  }),
  'cote-juste': Object.freeze({
    titre: 'Cote juste',
    phrase:
      "C'est la cote sans la marge du bookmaker, celle que paierait un bookmaker qui ne prélèverait rien : 1 divisé par la probabilité du match."
  }),
  // Étape 7 du plan (06/10/2026) : une cote de vos bookmakers trop vieille ne fait plus une value.
  'a-rafraichir': Object.freeze({
    titre: 'À rafraîchir',
    phrase:
      "Une cote de vos bookmakers trop vieille (plus de 3 heures par défaut, ou relevée avant l'annonce des compositions) a pu bouger : elle n'est plus montrée comme une value tant qu'elle n'est pas relevée de nouveau."
  }),
  // Étape 8 du plan (06/10/2026) : le moteur écarte un bookmaker qui a fixé la cote juste du match.
  'juge-et-partie': Object.freeze({
    titre: 'Juge et partie',
    phrase:
      "Un bookmaker qui a servi à fixer la cote juste d'un match ne peut pas y offrir de value : sa cote, c'est la cote juste plus sa marge. Le moteur l'écarte et cherche la value chez vos autres bookmakers."
  }),
  // Étape 10 du plan (06/10/2026) : le comparateur dit, pour chaque issue, la cote à partir de laquelle il reste de la value.
  'cote-minimale': Object.freeze({
    titre: 'Cote minimale',
    phrase:
      "C'est la plus petite cote à prendre pour que le pari reste une value au seuil du moteur : en dessous, le bookmaker ne paie plus assez pour la probabilité du match. Une cote bien trop haute est, elle, suspecte."
  }),
  // Étape 16 du plan (07/10/2026) : la preuve d'une amélioration des chiffres, sur la feuille de route (RoadmapStep).
  'preuve-apres-lancement': Object.freeze({
    titre: 'Preuve après lancement',
    phrase:
      "Une amélioration ne compte que sur les matchs joués après sa mise en service : ceux d'avant ont servi à la construire, ils ne prouvent rien. On compare l'ancienne et la nouvelle version sur les mêmes matchs."
  }),
  'fourchette-du-hasard': Object.freeze({
    titre: 'Gain et fourchette',
    phrase:
      "On rejoue le calcul mille fois en tirant les matchs au sort, pour voir ce que le hasard seul pourrait donner : la fourchette est l'écart qu'il explique. Si elle ne contient pas zéro, le gain dépasse le hasard ; sinon il n'est pas prouvé."
  }),
  'variantes-essayees': Object.freeze({
    titre: 'Variantes essayées',
    phrase:
      "Plus on a essayé de réglages avant d'en garder un, plus il est facile de tomber sur un bon score par chance. Le juge élargit la fourchette d'autant : il faut plus de matchs pour prouver."
  }),
  // Étape 17 du plan (12/10/2026) : la table du jour J, carte de Réglages (DayTablePanel).
  'table-du-jour-j': Object.freeze({
    titre: 'Table du jour J',
    phrase:
      "Pour chaque match passé, ce que l'appli savait la veille de chaque équipe et de chaque joueur, sans jamais le match lui-même ni ceux d'après. Les prochaines étapes mesurent et rejouent sur cette table : aucun résultat futur ne se glisse dans un calcul."
  }),
  // Étape 19 du plan (13/10/2026) : le banc d'essai, onglet d'Historique moteur (BenchView).
  'banc-d-essai': Object.freeze({
    titre: "Banc d'essai",
    phrase:
      "On rejoue le moteur sur les matchs passés, jour après jour, avec seulement ce qu'on sait aujourd'hui des matchs d'avant le jour J et les cotes d'avant le coup d'envoi. Chaque marché est noté face au marché et à un repère ; les paris de la règle sont simulés."
  }),
  'note-de-depart': Object.freeze({
    titre: 'Note de départ',
    phrase:
      "Les notes du moteur tel qu'il était au début du plan, gardées pour mesurer, à la fin, ce que toutes les étapes ont apporté — sur les mêmes matchs, jamais sur des chiffres pris à des époques différentes."
  }),
  'donnees-deja-vues': Object.freeze({
    titre: 'Déjà vu',
    phrase:
      "Des matchs qui ont servi à régler le moteur le 23/09 : il les a déjà vus, un bon score dessus ne prouve rien. Les périodes jamais vues sont dites telles quelles."
  }),
  // Étape 20 du plan (13/10/2026) : la calibration du mois, dans Historique moteur (CalibrationPanel).
  calibration: Object.freeze({
    titre: 'Calibration',
    phrase:
      "Quand le moteur annonce 60 %, l'issue doit arriver à peu près 60 fois sur 100. Chaque mois, on compare ce qu'il annonçait à ce qui est arrivé, tranche par tranche ; un écart ne compte que s'il dépasse ce que le hasard explique."
  }),
  // Étape 27 du plan (21/10/2026) : le modèle de buts unique (MarketPicksBoard, ScorePredictionCard, carte de la candidate).
  'carte-ou-parier': Object.freeze({
    titre: 'Carte « où parier »',
    phrase:
      'Une case est verte seulement si l’avantage du moteur au prix est prouvé sur au moins 200 matchs, rouge s’il fait prouvé moins bien que le marché, grise sinon : « pas prouvé » veut dire que l’écart peut venir du hasard.'
  }),
  'modele-de-buts': Object.freeze({
    titre: 'Modèle de buts unique',
    phrase:
      'Les pourcentages de buts partent des cotes ; les xG des deux équipes les ajustent de 10 % quand une cote plus/moins existe, de moitié pour le total sinon ; sans cote, les xG (ou, à défaut, les buts) seuls.'
  }),
  // Étape 28 du plan (27/10/2026) : la simulation complète — fins de saison, enjeu, déroulé simulé, prix juste d'un combiné.
  'fin-de-saison': Object.freeze({
    titre: 'Fin de saison',
    phrase:
      'Chaque nuit, le reste de la saison est joué 10 000 fois à partir du classement officiel et des rencontres restantes : un pourcentage est la part des saisons où le club finit dans cette zone.'
  }),
  enjeu: Object.freeze({
    titre: 'Enjeu',
    phrase:
      'De combien la chance d’un club d’atteindre une zone (titre, Europe, maintien…) change entre une victoire et une défaite dans cette rencontre. Une information : elle n’entre dans aucun pourcentage du moteur.'
  }),
  'deroule-simule': Object.freeze({
    titre: 'Déroulé simulé',
    phrase:
      '10 000 matchs simulés minute par minute à partir des buts attendus du moteur, recalés sur sa grille des scores : la mi-temps, le premier but, un retournement. Une information, pas un pronostic.'
  }),
  'prix-juste-combine': Object.freeze({
    titre: 'Prix juste d’un combiné',
    phrase:
      'La cote qui paierait exactement la chance que toutes les sélections passent ensemble : dans un même match elles sont liées, ce n’est pas le produit des cotes. Aucune value de combiné n’est prouvée : jamais en vert.'
  })
});

// ------------------------------------------- la fraîcheur d'une cote (étape 7)

/**
 * Une cote de VOS bookmakers est-elle encore bonne ? La MÊME règle que le
 * serveur (server/src/core/engine/fraicheurCotes.js, fraicheurCote), dans le
 * même ordre — les tests comparent les deux :
 *   1. heure du relevé inconnue → à rafraîchir ;
 *   2. match commencé (heure exacte du coup d'envoi) → à rafraîchir ;
 *   3. plus vieille que le délai (3 h par défaut, réglable dans Réglages) → à rafraîchir ;
 *   4. compositions annoncées (une heure avant le coup d'envoi) et cote relevée
 *      avant, si le réglage le demande → à rafraîchir ;
 *   5. sinon fraîche.
 * Elle vit aussi ici pour que la pastille se périme d'elle-même quand l'heure
 * tourne, sans recharger la page (horloge partagée, liveClock.js).
 */
export const REGLAGE_FRAICHEUR_DEFAUT = Object.freeze({ maxAgeMinutes: 180, avantCompos: true });
const BORNES_DELAI_MINUTES = Object.freeze({ min: 15, max: 1440 });

/** Un réglage lisible ; une valeur hors bornes ou d'un autre type reprend sa valeur par défaut (même règle que le serveur). */
export function reglageFraicheur(reglage) {
  const max = reglage?.maxAgeMinutes;
  return {
    maxAgeMinutes: typeof max === 'number' && Number.isInteger(max) && max >= BORNES_DELAI_MINUTES.min && max <= BORNES_DELAI_MINUTES.max ? max : REGLAGE_FRAICHEUR_DEFAUT.maxAgeMinutes,
    avantCompos: typeof reglage?.avantCompos === 'boolean' ? reglage.avantCompos : REGLAGE_FRAICHEUR_DEFAUT.avantCompos
  };
}

/** « 45 min », « 3 h », « 3 h 20 », « 2 jours ». */
export function dureeDite(minutes) {
  const m = Math.max(0, Math.floor(minutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const reste = m % 60;
    return reste ? `${h} h ${NBRE(reste)}` : `${h} h`;
  }
  const j = Math.floor(m / 1440);
  return `${j} jour${j > 1 ? 's' : ''}`;
}

const instantOuNaN = (x) => (x === null || x === undefined || x === '' ? Number.NaN : new Date(x).getTime());

/**
 * @param {object} p
 * @param {string|null} p.releveAt   l'heure du relevé (ISO)
 * @param {number}      p.maintenant l'instant courant (ms)
 * @param {string|null} p.coupDEnvoi l'heure du coup d'envoi (ISO)
 * @param {boolean}     p.heureSure  faux : le jour seul (calendrier FotMob)
 * @param {object}      p.reglage    { maxAgeMinutes, avantCompos }
 * @returns {{ etat: 'fraiche'|'a-rafraichir', code: string, raison: string, ageMinutes: number|null, releveAt: string|null,
 *             coupDEnvoi: string|null, heureSure: boolean, composAnnonceesA: string|null, limiteMinutes: number, reglage: object }}
 */
export function etatFraicheur({ releveAt = null, maintenant = Date.now(), coupDEnvoi = null, heureSure = true, reglage = REGLAGE_FRAICHEUR_DEFAUT } = {}) {
  const r = reglageFraicheur(reglage);
  const t = instantOuNaN(releveAt);
  const sure = heureSure !== false;
  const k = sure ? instantOuNaN(coupDEnvoi) : Number.NaN;
  const annonce = Number.isFinite(k) ? k - COMPO_OFFICIELLE_MINUTES * MINUTE_MS : Number.NaN;
  const commun = {
    releveAt: Number.isFinite(t) ? new Date(t).toISOString() : null,
    coupDEnvoi: Number.isFinite(instantOuNaN(coupDEnvoi)) ? new Date(instantOuNaN(coupDEnvoi)).toISOString() : null,
    heureSure: sure,
    composAnnonceesA: Number.isFinite(annonce) ? new Date(annonce).toISOString() : null,
    limiteMinutes: r.maxAgeMinutes,
    reglage: r
  };
  const dit = (etat, code, raison, ageMinutes) => ({ etat, code, raison, ageMinutes, ...commun });
  if (!Number.isFinite(t)) {
    return dit('a-rafraichir', 'heure-inconnue', "L'heure du relevé de cette cote est inconnue : impossible de dire si elle est encore bonne.", null);
  }
  const ecart = Math.max(0, maintenant - t);
  const age = Math.floor(ecart / MINUTE_MS);
  const depuis = age < 1 ? "il y a moins d'une minute" : `il y a ${dureeDite(age)}`;
  if (Number.isFinite(k) && maintenant >= k) {
    return dit('a-rafraichir', 'match-commence', `Le match a commencé à ${FORMAT_HEURE.format(new Date(k))} : une cote d'avant-match n'est plus jouable.`, age);
  }
  if (ecart > r.maxAgeMinutes * MINUTE_MS) {
    return dit('a-rafraichir', 'trop-vieille', `Relevée ${depuis}, au-delà du délai de ${dureeDite(r.maxAgeMinutes)} : à relever de nouveau avant de parier.`, age);
  }
  if (r.avantCompos && Number.isFinite(annonce) && maintenant >= annonce && t < annonce) {
    return dit('a-rafraichir', 'avant-compos', `Relevée ${depuis}, avant l'annonce des compositions (vers ${FORMAT_HEURE.format(new Date(annonce))}) : les cotes bougent à ce moment-là.`, age);
  }
  return dit('fraiche', 'fraiche', `Relevée ${depuis} (délai : ${dureeDite(r.maxAgeMinutes)}).`, age);
}

/**
 * La fraîcheur que le serveur a donnée, réévaluée à `maintenant` (l'heure
 * tourne). Jamais plus fraîche que le verdict du serveur : une cote qu'il dit
 * à rafraîchir le reste, même si l'horloge de ce poste retarde.
 */
export function fraicheurVivante(fraicheur, maintenant = Date.now()) {
  if (!fraicheur || typeof fraicheur !== 'object') return null;
  const vivante = etatFraicheur({
    releveAt: fraicheur.releveAt ?? null,
    maintenant,
    coupDEnvoi: fraicheur.coupDEnvoi ?? null,
    heureSure: fraicheur.heureSure !== false,
    reglage: fraicheur.reglage ?? REGLAGE_FRAICHEUR_DEFAUT
  });
  return fraicheur.etat !== 'fraiche' && vivante.etat === 'fraiche' ? { ...fraicheur, etat: 'a-rafraichir' } : vivante;
}

/**
 * Le pari du moteur à montrer (étape 7), d'après sa réponse (`staking`) et
 * l'heure qu'il est : `conseille` — recommandé ET sur une cote encore fraîche ;
 * `aRafraichir` — la value qui n'existe que sur une cote à rafraîchir (dite par
 * le serveur, ou vieillie depuis l'analyse) : montrée, jamais conseillée ;
 * `fraicheur` — celle de la cote de ce pari, réévaluée.
 */
export function pariDuMoteur(staking, maintenant = Date.now()) {
  const s = staking && typeof staking === 'object' ? staking : null;
  const brute = s?.action === 'RECOMMENDED' ? s.fraicheur : s?.reason === 'a_rafraichir' ? s.aRafraichir?.fraicheur : null;
  const fraicheur = brute ? fraicheurVivante(brute, maintenant) : null;
  if (s?.action === 'RECOMMENDED') {
    return fraicheur && fraicheur.etat !== 'fraiche' ? { conseille: null, aRafraichir: s, fraicheur } : { conseille: s, aRafraichir: null, fraicheur };
  }
  if (s?.reason === 'a_rafraichir') return { conseille: null, aRafraichir: s.aRafraichir ?? null, fraicheur };
  return { conseille: null, aRafraichir: null, fraicheur: null };
}

// ------------------------------------------------------------- la value

/**
 * LA RÈGLE DU VERT. Une cote n'est une value — et ne s'affiche en vert — que si,
 * ensemble :
 *   - elle vient d'un de VOS bookmakers (`jouable` : la règle estJouable de
 *     valueFinder.js, décidée par le serveur — jamais une cote de référence
 *     gratuite, jamais un bookmaker non coché dans Réglages, jamais une bourse
 *     non cochée) ;
 *   - elle est FRAÎCHE quand on sait de quand elle date (`fraicheur`, étape 7 :
 *     trop vieille, ou relevée avant l'annonce des compositions, elle est « à
 *     rafraîchir », jamais verte) ;
 *   - son avantage (probabilité du moteur × cote − 1) dépasse le seuil du
 *     moteur et ne dépasse pas son maximum (au-delà, c'est une cote périmée ou
 *     une erreur) ;
 *   - sa cote ne dépasse pas la cote maximale.
 * Les deux dernières conditions et leur ordre sont ceux de findValueBet
 * (cote_trop_haute, puis avantage_invraisemblable, puis sous_le_seuil) : le
 * test du serveur compare les deux, cas par cas. Ce que cette règle ne peut
 * pas voir, c'est le bookmaker qui a lui-même fixé la cote juste du match
 * (findValueBet l'écarte, la page du match tranche).
 *
 * @param {object} p
 * @param {number|null} p.pourcent  l'avantage en % ; absent : on ne sait pas
 * @param {boolean}     p.jouable   la cote vient d'un de VOS bookmakers (estJouable)
 * @param {boolean}     p.reference la cote est une cote gratuite de référence
 * @param {number|null} p.cote      la cote payée, nette de commission (maxValueOdds)
 * @param {{min:number,max:number,coteMax:number}|null} p.regle  les seuils du moteur (min et max en %)
 * @param {object|null} p.fraicheur la fraîcheur de la cote (etatFraicheur / fraicheurVivante) ; absente : pas de contrôle
 * @returns {{ etat: string, vert: boolean, qualificatif: string, raison: string }}
 */
export function etatValue({ pourcent = null, jouable = false, reference = false, cote = null, regle = null, fraicheur = null } = {}) {
  const dit = (etat, qualificatif, raison) => ({ etat, vert: etat === 'value', qualificatif, raison });
  if (reference) {
    return dit('reference', 'référence', "Cote de référence relevée gratuitement : elle sert à mesurer le marché, jamais à parier. Aucune value n'en sort.");
  }
  if (!jouable) {
    return dit('non-jouable', 'non jouable', "Cette cote ne vient pas d'un de vos bookmakers : aucune value ne peut s'y lire.");
  }
  if (fraicheur && typeof fraicheur === 'object' && fraicheur.etat !== 'fraiche') {
    const avant = estNombre(pourcent) ? ` Au dernier relevé, l'avantage était de ${pourcentSigne(pourcent)} : ce n'est pas une value tant que la cote n'est pas relevée de nouveau.` : '';
    return dit('a-rafraichir', 'à rafraîchir', `Cote à rafraîchir : ${fraicheur.raison ?? 'elle a pu bouger depuis son relevé.'}${avant}`);
  }
  if (!estNombre(pourcent)) {
    return dit('inconnue', '', "Pas d'avantage calculé : le moteur n'a pas de probabilité pour cette issue.");
  }
  const regleLue = regle && estNombre(regle.min) && estNombre(regle.max) && estNombre(regle.coteMax) ? regle : null;
  if (!regleLue) {
    return dit('seuil-inconnu', 'seuil inconnu', `Avantage de ${pourcentSigne(pourcent)}, mais les seuils du moteur ne sont pas connus : impossible de dire si c'est une vraie value.`);
  }
  if (!estNombre(cote)) {
    return dit('inconnue', '', `Avantage de ${pourcentSigne(pourcent)}, mais la cote payée n'est pas connue : impossible de dire si c'est une vraie value.`);
  }
  if (cote > regleLue.coteMax) {
    return dit('cote-haute', 'cote trop haute', `Avantage de ${pourcentSigne(pourcent)}, mais la cote ${cote.toFixed(2)} dépasse la cote maximale de ${regleLue.coteMax} : le moteur ne recommande pas ce pari.`);
  }
  if (pourcent > regleLue.max) {
    return dit('trop-beau', 'trop beau pour être vrai', `Avantage de ${pourcentSigne(pourcent)}, au-delà du maximum de ${decimales(regleLue.max, 0)} % : cote périmée ou erreur probable, aucun pari recommandé.`);
  }
  if (pourcent <= regleLue.min) {
    if (pourcent <= 0) return dit('sans-value', '', `Avantage de ${pourcentSigne(pourcent)} : la cote est sous la cote juste, aucune value.`);
    return dit('sous-seuil', 'sous le seuil', `Avantage de ${pourcentSigne(pourcent)}, sous le seuil de ${decimales(regleLue.min, 0)} % du moteur : pas assez pour parler de value.`);
  }
  return dit('value', '', `Value : avantage de ${pourcentSigne(pourcent)} chez l'un de vos bookmakers, au-dessus du seuil de ${decimales(regleLue.min, 0)} % du moteur.`);
}

// ------------------------------------------- le verdict du moteur (étape 8)

/** Le mot qui accompagne chaque état d'un verdict du moteur (server/src/core/engine/verdictPari.js). */
export const QUALIFICATIFS_VERDICT = Object.freeze({
  value: '',
  'value-secondaire': 'pas retenue',
  'a-rafraichir': 'à rafraîchir',
  'sous-seuil': 'sous le seuil',
  'sans-value': '',
  'trop-beau': 'trop beau pour être vrai',
  'cote-haute': 'cote trop haute',
  juge: 'juge et partie',
  'non-cote': 'non cotée',
  'non-jouable': 'non jouable',
  'pas-de-reference': 'sans cote juste',
  incoherente: 'cotes incohérentes',
  'coupe-circuit': 'coupe-circuit',
  'pas-de-cote': 'pas de cote'
});

/** Les états lus sur une cote de vos bookmakers, qui vieillissent avec elle (étape 7). */
const SENSIBLES_A_LA_FRAICHEUR = new Set(['value', 'value-secondaire', 'sous-seuil', 'sans-value', 'trop-beau', 'cote-haute', 'a-rafraichir']);

/**
 * LE VERT, DÉCIDÉ PAR LE MOTEUR (étape 8 du plan). `verdict` : le verdict du serveur sur une issue
 * (server/src/core/engine/verdictPari.js, verdictsDuMatch) — celui de findValueBet, « juge et partie »
 * compris, la même source pour la page « Opportunités du jour », le Repérage, la page du match et
 * l'onglet « Value bets » de Mes paris. Ici, AUCUN calcul de value n'est refait : on réévalue seulement
 * la fraîcheur de sa cote à l'horloge (fraicheurVivante) — une value qui vieillit pendant que la page est
 * ouverte devient « à rafraîchir », jamais l'inverse. Vert ⇔ le moteur dit « value » ET la cote est
 * encore fraîche.
 *
 * @param {object|null} verdict  { etat, raison, pourcent, bookmakerTitle, fraicheur, … }
 * @param {number} maintenant    l'instant de lecture (ms)
 * @returns {{ etat: string, vert: boolean, qualificatif: string, raison: string }}
 */
export function etatVerdict(verdict, maintenant = Date.now()) {
  const dit = (etat, raison) => ({ etat, vert: etat === 'value', qualificatif: QUALIFICATIFS_VERDICT[etat] ?? '', raison });
  if (!verdict || typeof verdict !== 'object' || !(verdict.etat in QUALIFICATIFS_VERDICT)) {
    return dit('inconnue', "Pas de verdict du moteur pour cette issue : impossible de dire si c'est une value.");
  }
  const fraicheur = verdict.fraicheur && typeof verdict.fraicheur === 'object' ? fraicheurVivante(verdict.fraicheur, maintenant) : null;
  if (SENSIBLES_A_LA_FRAICHEUR.has(verdict.etat) && fraicheur && fraicheur.etat !== 'fraiche') {
    const chez = verdict.bookmakerTitle ? ` chez ${verdict.bookmakerTitle}` : '';
    const avant = estNombre(verdict.pourcent)
      ? ` Au dernier relevé, l'avantage${chez} était de ${pourcentSigne(verdict.pourcent)} : ce n'est pas une value tant que la cote n'est pas relevée de nouveau.`
      : '';
    return dit('a-rafraichir', `Cote à rafraîchir : ${fraicheur.raison ?? 'elle a pu bouger depuis son relevé.'}${avant}`);
  }
  return dit(verdict.etat, String(verdict.raison ?? ''));
}

// --------------------------------------------------------- la confiance

const ETIQUETTES_CONFIANCE = Object.freeze({ sur: 'sûr', fragile: 'fragile' });

function lireEtiquette(etiquette) {
  const brute = String(etiquette ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
  return brute in ETIQUETTES_CONFIANCE ? brute : null;
}

/**
 * La confiance « sûr / fragile ». Le moteur ne la mesure pas encore (étape 38
 * du plan) : une valeur absente, ou qui n'est pas un nombre entre 0 et 1, donne
 * « pas encore mesurée » — jamais un faux niveau, jamais un niveau par défaut.
 * L'étiquette « sûr » ou « fragile » vient du serveur : on n'en invente aucune
 * à partir du nombre (le seuil n'est pas à nous).
 *
 * @param {object} p
 * @param {number|null} p.valeur    0 = fragile … 1 = sûr
 * @param {string|null} p.etiquette 'sur' | 'fragile' (avec ou sans accent)
 */
export function etatConfiance({ valeur = null, etiquette = null } = {}) {
  const niveau = estNombre(valeur) && valeur >= 0 && valeur <= 1 ? valeur : null;
  const mot = lireEtiquette(etiquette);
  if (niveau === null && mot === null) {
    return {
      etat: 'non-mesuree',
      valeur: null,
      etiquette: null,
      libelle: 'pas encore mesurée',
      titre: "Le moteur ne mesure pas encore sa confiance (étape 38 du plan) : aucun niveau « sûr » ou « fragile » n'est montré plutôt qu'un faux niveau."
    };
  }
  const libelle = mot ? ETIQUETTES_CONFIANCE[mot] : `${Math.round(niveau * 100)} sur 100`;
  return {
    etat: 'mesuree',
    valeur: niveau,
    etiquette: mot,
    libelle,
    titre: `Confiance du moteur : ${libelle}${niveau !== null && mot ? ` (niveau ${decimales(niveau, 2)} sur 1, de fragile à sûr)` : ''}.`
  };
}

// ------------------------------------------------------ le mouvement de cote

/**
 * Le mouvement d'une cote : sa direction (baisse, hausse, stable) et son
 * ampleur. `pourcent` est la variation de la cote en % (négatif : la cote
 * baisse), telle que le serveur la donne ; à défaut, elle se lit entre `de` et
 * `vers`. Moins d'un dixième de point : « stable » (le bruit d'un relevé à
 * l'autre, comme l'écran des chutes de cotes).
 */
export function mouvementDeCote({ de = null, vers = null, pourcent = null, sujet = 'Cote' } = {}) {
  let variation = null;
  if (estNombre(pourcent)) variation = pourcent;
  else if (estNombre(de) && estNombre(vers) && de > 0) variation = ((vers - de) / de) * 100;
  if (variation === null) {
    return { sens: 'inconnu', pourcent: null, texte: 'inconnu', libelle: `Mouvement inconnu : ${sujet.toLowerCase()} sans deuxième relevé lisible.` };
  }
  const arrondi = Math.round(variation * 10) / 10;
  if (arrondi === 0) return { sens: 'stable', pourcent: 0, texte: 'stable', libelle: `${sujet} stable depuis l'ouverture.` };
  const baisse = arrondi < 0;
  const ampleur = decimales(arrondi, 1);
  return {
    sens: baisse ? 'baisse' : 'hausse',
    pourcent: arrondi,
    texte: `${baisse ? '−' : '+'}${ampleur} %`,
    libelle: `${sujet} en ${baisse ? 'baisse' : 'hausse'} de ${ampleur} %.`
  };
}

// ------------------------------------------------- l'état d'une composition

/**
 * FotMob publie la composition officielle environ une heure avant le coup
 * d'envoi (cf. useLineupPolling.js) ; plus tôt, ce qu'il montre est une
 * prévision. Et il ne dit jamais lui-même laquelle des deux il publie (aucun
 * champ « confirmé » dans sa réponse, cf. fetchProbableLineup) : « officielle »
 * se DÉDUIT de l'heure de la lecture, jamais d'un drapeau.
 */
export const COMPO_OFFICIELLE_MINUTES = 60;

const ETATS_COMPOSITION = Object.freeze({
  officielle: {
    libelle: 'Compo officielle',
    raison: "Composition lue chez FotMob dans l'heure qui précède le coup d'envoi, ou après : c'est la composition officielle. FotMob ne signale pas lui-même si elle l'est ; on le déduit de l'heure de la lecture."
  },
  probable: {
    libelle: 'Compo probable',
    raison: "Composition lue chez FotMob plus d'une heure avant le coup d'envoi : une prévision, qui peut encore changer. FotMob ne dit pas si elle est officielle."
  },
  derniere: {
    libelle: 'Dernière alignée',
    raison: "FotMob n'a rien publié pour ce match : voici la dernière composition alignée par chaque équipe (magasin FotMob). Elle sera remplacée par celle d'avant-match."
  },
  absente: {
    libelle: 'Compo non publiée',
    raison: 'Aucune composition connue pour ce match : ni publiée par FotMob, ni gardée dans le magasin.'
  }
});

/** Ce que dit un état de composition déjà connu (« officielle », « probable », « derniere », « absente »). */
export function decrireComposition(etat) {
  const connu = etat in ETATS_COMPOSITION ? etat : 'absente';
  return { etat: connu, ...ETATS_COMPOSITION[connu] };
}

/** Un titulaire que FotMob dit aussi indisponible : signe d'une composition prévisionnelle (même règle qu'AiLineupSnapshot). */
function aUnTitulaireIndisponible(equipe) {
  const absents = new Set((equipe?.unavailable ?? []).map((a) => a?.name));
  return (equipe?.startXI ?? []).some((joueur) => absents.has(joueur?.name));
}

/**
 * L'état d'une composition d'après ce que le serveur renvoie (buildMatchPreview) :
 * `{ source: 'magasin' }` = la dernière alignée ; `{ source: 'FotMob',
 * minutesBeforeKickoff }` = publiée par FotMob ; rien = pas de composition.
 * Publiée dans l'heure qui précède le coup d'envoi, ou après : officielle — sauf
 * si FotMob dit indisponible un joueur aligné, signe qu'elle est prévisionnelle.
 */
export function etatComposition(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return decrireComposition('absente');
  if (snapshot.source === 'magasin') return decrireComposition('derniere');
  const minutes = snapshot.minutesBeforeKickoff;
  const probable = decrireComposition('probable');
  if (!estNombre(minutes)) {
    return { ...probable, raison: "Composition publiée par FotMob, mais l'heure de sa lecture est inconnue : on ne peut pas la dire officielle. FotMob ne dit pas si elle l'est." };
  }
  if (aUnTitulaireIndisponible(snapshot.home) || aUnTitulaireIndisponible(snapshot.away)) {
    return { ...probable, raison: 'Un joueur aligné est dit indisponible pour ce match par FotMob : composition sans doute prévisionnelle, qui changera.' };
  }
  return minutes <= COMPO_OFFICIELLE_MINUTES ? decrireComposition('officielle') : probable;
}

// ------------------------------------------------- le compte à rebours

const NBRE = (n) => String(n).padStart(2, '0');

/**
 * Le temps avant un coup d'envoi — ou « en cours », « terminé ». « En cours »
 * et « terminé » sont une ESTIMATION d'après l'heure (jusqu'à 130 min après le
 * coup d'envoi, cf. matchStatus.js), pas un flux en direct.
 *
 * Un match du calendrier FotMob ne connaît que son JOUR (l'heure y est un
 * midi UTC de repli) : `heureSure` faux, on ne compte pas les heures, on dit
 * « aujourd'hui », « demain », « dans 4 jours ».
 *
 * @param {object} p
 * @param {string|number|Date|null} p.coupDEnvoi  un instant, ou « AAAA-MM-JJ » quand `heureSure` est faux
 * @param {boolean|null} p.heureSure  l'heure exacte est connue (défaut : vrai sauf le midi UTC de repli)
 * @param {number} p.maintenant       l'instant courant, en ms (les composants passent l'horloge partagée ; sinon l'heure de la machine)
 * @returns {{ etat: 'avant'|'jour'|'en-cours'|'termine'|'inconnu', texte: string, titre: string }}
 */
export function compteARebours({ coupDEnvoi = null, heureSure = null, maintenant = Date.now() }) {
  const inconnu = {
    etat: 'inconnu',
    texte: 'heure inconnue',
    titre: "Aucune source ne donne le jour ni l'heure du coup d'envoi de ce match."
  };
  if (coupDEnvoi === null || coupDEnvoi === undefined || coupDEnvoi === '') return inconnu;
  const brut = coupDEnvoi instanceof Date ? coupDEnvoi.toISOString() : coupDEnvoi;
  const jourSeul = typeof brut === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(brut);
  const instant = jourSeul ? Date.parse(`${brut}T12:00:00Z`) : new Date(brut).getTime();
  if (!Number.isFinite(instant)) return inconnu;
  // Sans l'avis de l'appelant : le midi UTC pile est l'heure de repli d'un match du
  // calendrier (seasonCalendarAdapter.js), comme le lit déjà MatchCard.vue.
  const exact = !jourSeul && (heureSure === null || heureSure === undefined ? !/T12:00:00(?:\.000)?Z$/.test(String(brut)) : Boolean(heureSure));

  if (!exact) {
    // Jour seulement : l'écart se compte en jours du calendrier.
    const jour = new Date(instant).toISOString().slice(0, 10);
    const [a, m, j] = jour.split('-').map(Number);
    const auj = new Date(maintenant);
    const ecart = Math.round((Date.UTC(a, m - 1, j) - Date.UTC(auj.getFullYear(), auj.getMonth(), auj.getDate())) / JOUR_MS);
    const date = FORMAT_LONG_JOUR.format(new Date(instant));
    const aConfirmer = `${date} — heure du coup d'envoi à confirmer : ce match n'est connu que par le calendrier FotMob, qui donne le jour sans l'heure.`;
    if (ecart < 0) return { etat: 'termine', texte: 'terminé', titre: `${aConfirmer} Ce jour est passé.` };
    if (ecart === 0) return { etat: 'jour', texte: "aujourd'hui", titre: aConfirmer };
    if (ecart === 1) return { etat: 'jour', texte: 'demain', titre: aConfirmer };
    return { etat: 'jour', texte: `dans ${ecart} jours`, titre: aConfirmer };
  }

  const date = FORMAT_LONG.format(new Date(instant));
  const statut = computeMatchStatus(new Date(instant).toISOString(), maintenant);
  if (statut === 'live') {
    return {
      etat: 'en-cours',
      texte: 'en cours',
      titre: `Coup d'envoi ${date}. « En cours » est estimé d'après l'heure du coup d'envoi (jusqu'à ${LIVE_WINDOW_MS / MINUTE_MS} min après), pas d'après un flux en direct.`
    };
  }
  if (statut === 'finished') {
    return {
      etat: 'termine',
      texte: 'terminé',
      titre: `Coup d'envoi ${date}. « Terminé » est estimé d'après l'heure du coup d'envoi (plus de ${LIVE_WINDOW_MS / MINUTE_MS} min), pas d'après le score.`
    };
  }
  const reste = instant - maintenant;
  const jours = Math.floor(reste / JOUR_MS);
  const heures = Math.floor((reste % JOUR_MS) / HEURE_MS);
  const minutes = Math.floor((reste % HEURE_MS) / MINUTE_MS);
  let texte;
  if (jours >= 3) texte = `dans ${jours} jours`;
  else if (jours >= 1) texte = heures ? `dans ${jours} j ${heures} h` : `dans ${jours} jour${jours > 1 ? 's' : ''}`;
  else if (heures >= 1) texte = `dans ${heures} h ${NBRE(minutes)}`;
  else if (minutes >= 1) texte = `dans ${minutes} min`;
  else texte = "dans moins d'une minute";
  return { etat: 'avant', texte, titre: `Coup d'envoi ${date}.` };
}

// ------------------------------------------------------ la provenance

/** Au-delà de ce délai, un relevé est dit ancien (ambre), comme la date des cotes de DataOriginMenu. */
export const RELEVE_ANCIEN_APRES_HEURES = 24;

/**
 * D'où vient un chiffre et de quand : la règle de Pierre du 03/10/2026, « le
 * vrai endroit des données » — le fournisseur réel, jamais un libellé vague, et
 * l'heure du relevé. Une source absente ou une heure inconnue se DISENT.
 *
 * @param {object} p
 * @param {string|null} p.source      le fournisseur réel (« The Odds API », « ESPN, football-data.co.uk »…)
 * @param {string|number|null} p.releveLe  l'instant du relevé (ISO)
 * @param {string} p.action           « relevé », « calculé », « mis à jour »…
 * @param {number|null} p.vieuxApresHeures  au-delà, le relevé est ancien (défaut 24 h) ; null : jamais ancien
 * @param {number} p.maintenant       l'instant courant, en ms (sinon l'heure de la machine)
 */
export function etatProvenance({ source = null, releveLe = null, action = 'relevé', vieuxApresHeures = RELEVE_ANCIEN_APRES_HEURES, maintenant = Date.now() }) {
  const nom = String(source ?? '').trim();
  const instant = releveLe === null || releveLe === undefined || releveLe === '' ? NaN : new Date(releveLe).getTime();
  if (!nom) {
    return { etat: 'sans-source', source: null, quand: null, ilYA: null, ancien: false, texte: 'source non indiquée', titre: "La source de ce chiffre n'est pas indiquée : on ne sait pas d'où il vient." };
  }
  if (!Number.isFinite(instant)) {
    return {
      etat: 'sans-heure',
      source: nom,
      quand: null,
      ilYA: null,
      ancien: false,
      texte: `heure du ${action === 'calculé' ? 'calcul' : 'relevé'} inconnue`,
      titre: `${nom} : l'heure du ${action === 'calculé' ? 'calcul' : 'relevé'} n'est pas communiquée, on ne peut pas dire si ce chiffre est frais.`
    };
  }
  const quand = quandDit(instant, maintenant);
  const depuis = ilYA(instant, maintenant);
  const ancien = estNombre(vieuxApresHeures) && maintenant - instant >= vieuxApresHeures * HEURE_MS;
  return {
    etat: ancien ? 'ancien' : 'recent',
    source: nom,
    quand,
    ilYA: depuis,
    ancien,
    // « hier à 04:00 · hier » n'apprend rien : le « il y a » ne s'ajoute que s'il dit autre chose que « quand ».
    texte: `${action} ${quand}${ancien && depuis !== 'hier' ? ` · ${depuis}` : ''}`,
    titre: `${nom} : ${action} ${quand} (${depuis}).${ancien ? ' Ce relevé est ancien : les cotes ont pu bouger depuis.' : ''}`
  };
}

// ------------------------------------------- la bulle d'aide « ? » (HelpTip)

/**
 * Quand la bulle est ouverte — une petite machine à états sans DOM, pour que le
 * comportement au clavier se teste. Trois choses l'ouvrent : le focus (Tab), le
 * survol, un clic qui l'épingle ; Échap la ferme, même focus gardé (WCAG 1.4.13 :
 * elle se ferme sans bouger la souris ni le focus). Le focus, le survol ou un
 * clic de nouveau la rouvrent. Un clic ailleurs (`dehors`) ou le départ du focus
 * (`blur`) la désépinglent.
 */
export const etatInfobulleInitial = () => ({ focus: false, survol: false, epingle: false, ferme: false });

export function transitionInfobulle(etat, evenement) {
  const suivant = { ...etat };
  switch (evenement) {
    case 'focus':
      suivant.focus = true;
      suivant.ferme = false;
      break;
    case 'blur':
      suivant.focus = false;
      suivant.epingle = false;
      break;
    case 'survol-entre':
      suivant.survol = true;
      suivant.ferme = false;
      break;
    case 'survol-sort':
      suivant.survol = false;
      break;
    case 'clic':
      suivant.epingle = !suivant.epingle;
      suivant.ferme = false;
      break;
    case 'echap':
      suivant.ferme = true;
      suivant.epingle = false;
      break;
    case 'dehors':
      suivant.focus = false;
      suivant.survol = false;
      suivant.epingle = false;
      break;
    default:
      throw new Error(`Événement de bulle inconnu : ${evenement}`);
  }
  return suivant;
}

export const infobulleOuverte = (etat) => !etat.ferme && (etat.focus || etat.survol || etat.epingle);

// ------------------------------------------- les marchés de déroulé (étape 28)

const MI_TEMPS_FIN = Object.freeze(['1/1', '1/N', '1/2', 'N/1', 'N/N', 'N/2', '2/1', '2/N', '2/2']);

/**
 * Le nom d'un marché de déroulé (la carte « Déroulé simulé » de la page du match, le ticket), avec le nom des clubs :
 * la mi-temps (qui mène, au moins un ou deux buts avant la pause), les neuf cases mi-temps / fin, le premier but (avant
 * la 30e minute : marqué avant 30:00, minutes 1 à 30 comprises), plus de buts en 2e mi-temps, le club mené à la pause
 * puis vainqueur. `cle` : la clé du serveur (data/simulation, le banc et la nuit) ; une clé inconnue est rendue telle
 * quelle. Les marchés que la preuve a écartés ne sont jamais montrés : ils n'ont pas de nom ici.
 */
export function libelleDuDeroule(cle, { home = 'Domicile', away = 'Extérieur' } = {}) {
  const qui = (x) => (x === '1' ? home : x === '2' ? away : null);
  const ft = /^htFt([0-8])$/.exec(String(cle ?? ''));
  if (ft) {
    const code = MI_TEMPS_FIN[Number(ft[1])];
    const [mt, fin] = code.split('/');
    const pause = mt === 'N' ? 'Égalité à la pause' : `${qui(mt)} mène à la pause`;
    const finDit = fin === 'N' ? 'match nul' : `${qui(fin)} gagne`;
    if (mt === fin) return `${code} — ${mt === 'N' ? 'Égalité à la pause et à la fin' : `${qui(mt)} mène à la pause et gagne`}`;
    return `${code} — ${pause}, ${finDit}`;
  }
  switch (cle) {
    case 'htH':
      return `Mi-temps : ${home} mène`;
    case 'htD':
      return 'Mi-temps : égalité';
    case 'htA':
      return `Mi-temps : ${away} mène`;
    case 'htO05':
      return 'Au moins un but avant la pause';
    case 'htO15':
      return 'Au moins deux buts avant la pause';
    case 'premierDom':
      return `Premier but : ${home}`;
    case 'premierExt':
      return `Premier but : ${away}`;
    case 'premierAvant30':
      return 'Premier but avant la 30e minute';
    case 'h2plusQueH1':
      return 'Plus de buts en 2e mi-temps qu’en 1re';
    case 'retourDom':
      return `${home} mené à la pause, puis vainqueur`;
    case 'retourExt':
      return `${away} mené à la pause, puis vainqueur`;
    default:
      return String(cle ?? '');
  }
}
