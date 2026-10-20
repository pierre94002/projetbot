/**
 * teamStrength.js — L'INDICE DE FORCE DES ÉQUIPES (étape 29 du plan, 14/10/2026).
 * -----------------------------------------------------------------------
 * Pour chaque club, chaque jour où il joue, ce qu'on savait de sa force LA
 * VEILLE (jamais le match du jour ni ceux d'après), et sa force « actuelle »
 * pour les matchs à venir : une note de force (en buts d'écart attendus par
 * match face à une équipe moyenne de son championnat), ses statistiques
 * corrigées de la force des adversaires — xG, tirs, tirs cadrés, grosses
 * occasions, buts, corners (pour et contre), possession —, et la place de
 * chacune parmi les clubs de son championnat (percentiles), au total, à
 * domicile et à l'extérieur. Lu par l'étape 31 (écran), et proposé au banc
 * comme entrée possible des modèles (27, 30) : rien n'entre dans le moteur.
 *
 * D'OÙ ÇA VIENT : la table du jour J (étape 17, team_day), jamais une
 * lecture « du moment ». Les demi-vies sont celles MESURÉES par l'étape 18
 * (stat_value, calcul n° 1 du 13/10/2026, lues par lireParametresStatistique
 * et RECOPIÉES ici, dans un réglage versionné) ; les poids qui font la note à
 * partir des statistiques sont appris sur P4a (2024-07 → 2025-06), la saison
 * où l'étape 18 a choisi ses demi-vies ; la preuve se fait sur P3 (2023-01 →
 * 2024-06), que l'étape 18 a gardée propre pour 27 et 29 (teamStrengthBanc.js).
 *
 * LA RÈGLE DU JOUR J : la ligne d'un club au jour J ne lit que les rencontres
 * d'un jour UTC STRICTEMENT antérieur — même pour un club qui joue deux fois
 * le même jour. Le rejeu calcule les lignes du jour J AVANT de lire ses
 * rencontres, et LÈVE si une rencontre arrive dans le désordre (« fuite
 * refusée ») : une garde gardée en production.
 *
 * LE CHAMPIONNAT D'UN CLUB au jour J : celui de son dernier match de
 * championnat COMPTÉ (ni coupe, ni « hors classement ») avant J — un promu
 * reste dans son ancien championnat jusqu'à son premier match dans le
 * nouveau. Une rencontre (championnat, coupe, barrage ; ni attribuée, ni
 * prolongée : un compte de 120 minutes) n'entre dans le calcul d'un
 * championnat que si LES DEUX clubs en sont ce jour-là : la correction des
 * adversaires s'appuie sur LEUR championnat. Une coupe ou un barrage entre
 * deux divisions (Ligue 2 contre Ligue 1, 2. Bundesliga contre Bundesliga,
 * un club de Premier League contre un club de League Two en FA Cup) mélange
 * deux niveaux : écarté, et compté. Les clubs sont rapprochés par leur
 * identifiant FotMob (le numéro de team_day), jamais par leur nom (Leeds
 * United ≠ D.C. United, les « Nacional »).
 *
 * LA CORRECTION DES ADVERSAIRES (circulaire, donc itérative) : pour chaque
 * statistique et chaque championnat, la production d'un club face à un
 * adversaire se lit y = μ(lieu) + a(club) − d(adversaire) — μ la moyenne du
 * championnat à ce lieu sur les 365 derniers jours, a l'attaque, d la
 * défense. On PART du classement corrigé par les xG (04/10/2026 : les xG pour
 * et contre bruts, itération 0, sans correction), puis chaque tour remplace
 * l'adversaire « moyen » par l'adversaire réellement affronté : a = moyenne
 * pondérée de (y − μ + d de l'adversaire), puis d = moyenne pondérée de
 * (μ + a de l'adversaire − y concédé), chacune recentrée sur les clubs
 * actifs du championnat, jusqu'à ce que plus rien ne bouge (1e-7). Domicile
 * et extérieur : le même système, l'attaque à domicile face à la défense à
 * l'extérieur de l'adversaire, et inversement. Possession : une seule note
 * (la part de ballon se partage).
 *
 * LA PONDÉRATION DANS LE TEMPS (la définition de l'étape 18) : le match d'il y
 * a k matchs RELEVÉS du club (toutes compétitions, ni attribués ni prolongés,
 * la statistique relevée) pèse 2^(−k / demi-vie) ; la demi-vie dépend de la
 * statistique (xG créés 25, xG concédés 13, buts marqués 35, possession 10…).
 *
 * LES ZÉROS « NON RELEVÉ » : au magasin, un 0 des deux côtés d'un compte
 * (tirs, cadrés, occasions, corners) veut dire « non relevé » (paireRelevee) ;
 * les xG d'un seul côté ne comptent pas (la règle de la table du jour J).
 *
 * LE REPLI SANS xG : 17 championnats n'ont aucun xG chez FotMob (Finlande,
 * Chili, Pérou…), 7 en ont pour une partie seulement : la note y est faite
 * des buts, des tirs, des tirs cadrés, des corners et de la possession
 * (formule « sans-xg »), et chaque ligne le dit (`formule`).
 *
 * UN SEUL ÉCRIVAIN : le serveur, étape « indiceForce » de l'actualisation (ou
 * scripts/team-strength.mjs dans le bac, serveur arrêté), sous le verrou de
 * la passe. Le calcul se fait dans un PROCESSUS À PART, base en lecture seule
 * (teamStrengthEnfant.js) ; le serveur range ce qu'il rend par tranches
 * courtes, en rendant la main. La nuit, seuls les championnats touchés par une
 * rencontre nouvelle, modifiée ou retirée sont rejoués, et seules leurs lignes
 * à partir du premier jour du mois touché sont réécrites (une empreinte par
 * compétition et par mois de day_matches).
 *
 * Tables (DDL dans matchStatsDb.js) : team_strength (une ligne par club × jour
 * × lieu ; entiers : valeurs ×100, note ×1000) et team_strength_state.
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from './matchStatsDb.js';
import { paireRelevee } from './leagueBenchmarks.js';
import { canonicalTeamNames } from './identityRegistry.js';
import { seasonOf, seasonBounds } from '../providers/seasonWindows.js';
import { poidsDemiVie } from '../../bench/statValue.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';

// ======================================================= réglages (versionnés)

/** Forme du calcul : une table calculée par une autre version (ou d'autres réglages) est refaite entière. */
export const VERSION_INDICE_FORCE = 1;

/**
 * Les statistiques de l'indice. `cote` : 'pour' (ce que le club produit), 'contre' (ce que l'adversaire
 * produit face à lui), 'note' (possession : une seule note). `demiVie` : en matchs relevés, MESURÉE par
 * l'étape 18 sur le magasin (stat_value, calcul n° 1, fini le 2026-10-13T16:42:19.831Z ; lue par
 * lireParametresStatistique({ statistique, echelle: 'equipe', source: 'magasin' }) le 14/10/2026 et
 * RECOPIÉE ici : un nouveau calcul de l'étape 18 ne change rien sans une nouvelle version). Les 18 matchs
 * « de départ » du plan étaient trop courts pour l'attaque (25 à 35). `stat18` : la statistique de l'étape 18
 * dont vient la demi-vie, et son verdict (« compte » = elle annonce les matchs suivants au-delà du hasard).
 * Ce qui TROMPE (cartons rouges, « buts encaissés moins xG concédés ») n'entre pas ; « faible » (buts
 * encaissés, grosses occasions concédées) entre, et le poids appris dira ce qu'il vaut.
 */
export const STATISTIQUES_INDICE = Object.freeze([
  Object.freeze({ id: 'xg_p', stat: 'xg', cote: 'pour', demiVie: 25, stat18: 'xg_pour', verdict18: 'compte', libelle: 'xG créés' }),
  Object.freeze({ id: 'xg_c', stat: 'xg', cote: 'contre', demiVie: 13, stat18: 'xg_contre', verdict18: 'compte', libelle: 'xG concédés' }),
  Object.freeze({ id: 'tirs_p', stat: 'tirs', cote: 'pour', demiVie: 25, stat18: 'tirs_pour', verdict18: 'compte', libelle: 'Tirs' }),
  Object.freeze({ id: 'tirs_c', stat: 'tirs', cote: 'contre', demiVie: 13, stat18: 'tirs_contre', verdict18: 'compte', libelle: 'Tirs concédés' }),
  Object.freeze({ id: 'cadres_p', stat: 'cadres', cote: 'pour', demiVie: 25, stat18: 'cadres_pour', verdict18: 'compte', libelle: 'Tirs cadrés' }),
  Object.freeze({ id: 'cadres_c', stat: 'cadres', cote: 'contre', demiVie: 18, stat18: 'cadres_contre', verdict18: 'compte', libelle: 'Tirs cadrés concédés' }),
  Object.freeze({ id: 'occasions_p', stat: 'occasions', cote: 'pour', demiVie: 25, stat18: 'occasions_pour', verdict18: 'compte', libelle: 'Grosses occasions' }),
  Object.freeze({ id: 'occasions_c', stat: 'occasions', cote: 'contre', demiVie: 13, stat18: 'occasions_contre', verdict18: 'faible', libelle: 'Grosses occasions concédées' }),
  Object.freeze({ id: 'buts_p', stat: 'buts', cote: 'pour', demiVie: 35, stat18: 'buts_pour', verdict18: 'compte', libelle: 'Buts marqués' }),
  Object.freeze({ id: 'buts_c', stat: 'buts', cote: 'contre', demiVie: 25, stat18: 'buts_contre', verdict18: 'faible', libelle: 'Buts encaissés' }),
  Object.freeze({ id: 'corners_p', stat: 'corners', cote: 'pour', demiVie: 25, stat18: 'corners_pour', verdict18: 'compte', libelle: 'Corners obtenus' }),
  Object.freeze({ id: 'corners_c', stat: 'corners', cote: 'contre', demiVie: 25, stat18: 'corners_contre', verdict18: 'compte', libelle: 'Corners concédés' }),
  Object.freeze({ id: 'possession', stat: 'possession', cote: 'note', demiVie: 10, stat18: 'possession', verdict18: 'compte', libelle: 'Possession' })
]);
/** Les statistiques relevées d'une rencontre (une paire par rencontre) et leurs côtés. */
export const STATS = Object.freeze(['xg', 'tirs', 'cadres', 'occasions', 'buts', 'corners', 'possession']);
const NS = STATISTIQUES_INDICE.length; // 13 côtés
const NSTAT = STATS.length; // 7 statistiques
const IDX_STAT = Object.freeze(Object.fromEntries(STATS.map((s, i) => [s, i])));
/** Pour chaque statistique : l'indice de son côté « pour » et de son côté « contre » (ou -1 pour la possession). */
const COTES_DE = STATS.map((s) => ({
  p: STATISTIQUES_INDICE.findIndex((x) => x.stat === s && x.cote !== 'contre'),
  c: STATISTIQUES_INDICE.findIndex((x) => x.stat === s && x.cote === 'contre')
}));
const IDX_COTE = Object.freeze(Object.fromEntries(STATISTIQUES_INDICE.map((x, i) => [x.id, i])));

/** Les trois lieux d'une ligne : tous les matchs (le lieu corrigé par μ), à domicile, à l'extérieur. */
export const LIEUX = Object.freeze(['tous', 'dom', 'ext']);

/**
 * Les deux formules de la note : avec les xG quand le club en a assez dans son championnat, sinon le REPLI
 * sur les buts et les tirs (« sans-xg »). Les composantes sont les écarts corrigés (attaque a pour un côté
 * « pour », défense d pour un côté « contre » — plus grand = mieux —, possession − moyenne).
 */
export const FORMULES = Object.freeze({
  xg: Object.freeze(['xg_p', 'xg_c', 'tirs_p', 'tirs_c', 'cadres_p', 'cadres_c', 'occasions_p', 'occasions_c', 'buts_p', 'buts_c', 'corners_p', 'corners_c', 'possession']),
  'sans-xg': Object.freeze(['tirs_p', 'tirs_c', 'cadres_p', 'cadres_c', 'buts_p', 'buts_c', 'corners_p', 'corners_c', 'possession'])
});

/**
 * LES POIDS DE LA NOTE (buts d'écart attendus par unité d'écart corrigé), APPRIS sur P4a (2024-07-01 →
 * 2025-06-30, matchs de championnat, deux clubs du même championnat, ≥ 6 matchs chacun dans l'indice) par
 * une régression ridge de l'écart de buts du match sur l'écart des composantes des deux clubs
 * (teamStrengthBanc.apprendrePoids), puis RECOPIÉS ici. `null` : pas encore appris (aucune note écrite).
 */
export const POIDS_DE_LA_NOTE = Object.freeze({
  appris: Object.freeze({ sur: 'P4a', de: '2024-07-01', a: '2025-06-30', le: '2026-10-14', base: 'base du bac (table du jour J du 12/10/2026, 60 211 rencontres)', lambda: 100, variante: 'indice-v1' }),
  xg: Object.freeze({
    // 7768 matchs de P4a ; avantage du terrain appris : 0.29929 but (dans le lien du banc, jamais dans la note).
    xg_p: 0.351365,
    xg_c: 0.311804,
    tirs_p: -0.002657,
    tirs_c: 0.064008,
    cadres_p: 0.038458,
    cadres_c: -0.029599,
    occasions_p: 0.126141,
    occasions_c: 0.122875,
    buts_p: 0.252214,
    buts_c: 0.182665,
    corners_p: 0.007643,
    corners_c: 0.014836,
    possession: 0.005161
  }),
  'sans-xg': Object.freeze({
    // 12522 matchs de P4a ; avantage du terrain appris : 0.31712 but (dans le lien du banc, jamais dans la note).
    tirs_p: -0.007271,
    tirs_c: 0.046892,
    cadres_p: 0.137811,
    cadres_c: 0.074325,
    buts_p: 0.446275,
    buts_c: 0.408069,
    corners_p: 0.032571,
    corners_c: 0.064253,
    possession: 0.005479
  })
});

/** Les seuils, écrits ici. */
export const SEUILS_INDICE = Object.freeze({
  /** Une composante est mesurée à partir de 3 matchs du championnat où elle est relevée (à ce lieu). */
  minimumMatchs: 3,
  /** La correction itérative s'arrête quand plus rien ne bouge de plus de 1e-7 (unités de la statistique)… */
  tolerance: 1e-7,
  /** … ou au bout de 500 tours (compté et dit dans le bilan : jamais vu sur le magasin). */
  toursMax: 500,
  /**
   * Le match FICTIF : chaque club reçoit, en plus de ses vrais matchs, l'équivalent d'UN match face à un
   * adversaire moyen où il a fait exactement la moyenne (au poids de son dernier match). Il rapproche de la
   * moyenne un club qui a peu joué (un promu, un début de saison) et rend la correction unique et
   * convergente même quand le championnat n'est pas encore « relié » (première journée : des paires de
   * clubs qui ne se sont jamais croisées) ; sur une saison pleine, il pèse 1 match sur 20 à 40 pondérés.
   */
  aPriori: 1,
  /** Moyennes du championnat et clubs « actifs » : les 365 derniers jours. */
  joursActifs: 365,
  /** Moyennes du championnat : au moins 10 rencontres relevées sur 365 jours, sinon tout son historique. */
  minimumMoyenne: 10,
  /** Les clubs d'un championnat : ceux de la saison en cours dès que 6 l'ont jouée (sinon, ceux de la saison d'avant). */
  minimumMembres: 6,
  /** Points forts et faibles : percentile ≥ 75 (le quart du haut du championnat), ≤ 25. */
  pointFort: 75,
  pointFaible: 25
});

/**
 * Le RÉGLAGE VERSIONNÉ complet (une empreinte de lui est gardée dans team_strength_state : des réglages
 * changés refont toute la table, comme une nouvelle version).
 */
export const REGLAGES_INDICE_FORCE = Object.freeze({
  version: VERSION_INDICE_FORCE,
  demiVies: Object.freeze(Object.fromEntries(STATISTIQUES_INDICE.map((s) => [s.id, s.demiVie]))),
  demiViesLues: Object.freeze({ etape: '18', calcul: 1, finiLe: '2026-10-13T16:42:19.831Z', source: 'magasin', lecture: 'lireParametresStatistique', le: '2026-10-14' }),
  poids: POIDS_DE_LA_NOTE,
  seuils: SEUILS_INDICE
});

/**
 * Les fenêtres REGARDÉES par l'étape 29 (en plus de VUES_DE_L_ETAPE_18, dont elle lit les demi-vies) : les
 * vues de son lancement, déclaré dans LANCEMENTS (lancements.js, portée 'indice') depuis le 19/10 — définies
 * là-bas, ré-exportées ici.
 */
export { VUES_DE_L_ETAPE_29 } from '../../bench/lancements.js';

// ======================================================= petites règles (pures)

const JOUR_MS = 86_400_000;
const FORME_JOUR = /^\d{4}-\d{2}-\d{2}$/;
/** « 2025-07-01 » → un numéro de jour UTC (les comparaisons se font sur des entiers). */
export function numeroDuJour(iso) {
  const j = String(iso ?? '').slice(0, 10);
  if (!FORME_JOUR.test(j)) throw new Error(`jour illisible : « ${iso ?? ''} »`);
  return Math.round(Date.UTC(Number(j.slice(0, 4)), Number(j.slice(5, 7)) - 1, Number(j.slice(8, 10))) / JOUR_MS);
}
export const jourIso = (n) => new Date(n * JOUR_MS).toISOString().slice(0, 10);

const nombre = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Le poids d'un match d'il y a `k` matchs relevés (le dernier : k = 0, poids 1) — la fonction de l'étape 18. */
export const poids = (k, demiVie) => poidsDemiVie(k, demiVie);

/**
 * Les valeurs relevées d'une rencontre, vues du camp qui reçoit : pour chaque statistique, [domicile,
 * extérieur] ou null (non relevée). Les comptes de FotMob : la règle 0-0 (paireRelevee) ; les xG : les deux
 * ou aucun ; les buts : toujours (une rencontre ni attribuée ni prolongée) ; la possession : les deux parts.
 */
export function valeursDUneRencontre(r) {
  const xg = nombre(r.xg_p) !== null && nombre(r.xg_c) !== null ? [Number(r.xg_p), Number(r.xg_c)] : null;
  const pd = nombre(r.possession_p);
  const pe = nombre(r.possession_c);
  return {
    xg,
    tirs: paireRelevee(r.tirs_p, r.tirs_c),
    cadres: paireRelevee(r.cadres_p, r.cadres_c),
    occasions: paireRelevee(r.occasions_p, r.occasions_c),
    buts: nombre(r.bp) !== null && nombre(r.bc) !== null ? [Number(r.bp), Number(r.bc)] : null,
    corners: paireRelevee(r.corners_p, r.corners_c),
    possession: pd !== null && pe !== null && pd + pe > 0 ? [pd, pe] : null
  };
}

/**
 * Le percentile d'une valeur parmi celles de son championnat (elle comprise) : la part des clubs en
 * dessous, plus la moitié des égalités, sur 100 — arrondi. `sens` : +1 (plus grand = mieux), −1 (plus petit
 * = mieux : ce qu'on concède). null si la valeur ou la liste manque.
 */
export function percentileDans(valeur, valeurs, sens = 1) {
  if (valeur === null || valeur === undefined || !Number.isFinite(valeur)) return null;
  let dessous = 0;
  let egaux = 0;
  let n = 0;
  for (const v of valeurs) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    n++;
    const ecart = sens * (v - valeur);
    if (Math.abs(v - valeur) <= 1e-12) egaux++;
    else if (ecart < 0) dessous++;
  }
  if (!n) return null;
  return Math.round((100 * (dessous + 0.5 * egaux)) / n);
}

/**
 * LA CORRECTION DES ADVERSAIRES, pour une statistique « pour / contre » d'un petit championnat — la même
 * arithmétique que le rejeu (Systeme.resoudre), écrite sur des matchs en clair pour les essais et pour qui
 * veut la relire : matchs = [{ dom, ext, yDom, yExt, poidsDom?, poidsExt? }] (yDom : ce que le club qui
 * reçoit a produit ; poids : celui du match pour chaque club, 1 par défaut), μ = { dom, ext } (moyennes du
 * championnat à chaque lieu ; par défaut celles des matchs). Rend { attaque, defense, tours, converge,
 * iteration0 } (Map club → écart ; défense : plus grand = mieux), recentrées sur tous les clubs.
 * `corriger: false` : l'itération 0 seule (le classement brut, sans correction).
 */
export function corrigerDesAdversaires(matchs, { mu = null, tolerance = SEUILS_INDICE.tolerance, toursMax = SEUILS_INDICE.toursMax, corriger = true } = {}) {
  const clubs = [...new Set(matchs.flatMap((m) => [m.dom, m.ext]))];
  const ix = new Map(clubs.map((c, i) => [c, i]));
  const n = clubs.length;
  const moy = mu ?? { dom: matchs.reduce((s, m) => s + m.yDom, 0) / matchs.length, ext: matchs.reduce((s, m) => s + m.yExt, 0) / matchs.length };
  // Pour chaque club : Σ poids, Σ poids × (y − μ) pour l'attaque ; Σ poids × (μ_adv − y_adv) pour la défense ; poids par adversaire.
  const Sa = new Float64Array(n);
  const Ka = new Float64Array(n);
  const Sd = new Float64Array(n);
  const Kd = new Float64Array(n);
  const Wa = new Float64Array(n * n);
  const Wd = new Float64Array(n * n);
  for (const m of matchs) {
    const h = ix.get(m.dom);
    const a = ix.get(m.ext);
    const ph = m.poidsDom ?? 1;
    const pa = m.poidsExt ?? 1;
    Sa[h] += ph;
    Ka[h] += ph * (m.yDom - moy.dom);
    Wa[h * n + a] += ph;
    Sd[h] += ph;
    Kd[h] += ph * (moy.ext - m.yExt);
    Wd[h * n + a] += ph;
    Sa[a] += pa;
    Ka[a] += pa * (m.yExt - moy.ext);
    Wa[a * n + h] += pa;
    Sd[a] += pa;
    Kd[a] += pa * (moy.dom - m.yDom);
    Wd[a * n + h] += pa;
  }
  const att = new Float64Array(n);
  const def = new Float64Array(n);
  const actifs = new Uint8Array(n).fill(1);
  let tours = 0;
  let converge = false;
  let iteration0 = null;
  const avant = new Float64Array(2 * n);
  for (; tours < (corriger ? toursMax : 1); tours++) {
    garder([att, def], avant, n);
    for (let i = 0; i < n; i++) {
      let s = Ka[i];
      for (let j = 0; j < n; j++) s += Wa[i * n + j] * def[j];
      att[i] = Sa[i] > 0 ? s / Sa[i] : 0;
    }
    centrer(att, actifs, n);
    for (let i = 0; i < n; i++) {
      let s = Kd[i];
      for (let j = 0; j < n; j++) s += Wd[i * n + j] * att[j];
      def[i] = Sd[i] > 0 ? s / Sd[i] : 0;
    }
    centrer(def, actifs, n);
    if (tours === 0) iteration0 = { attaque: new Map(clubs.map((c, i) => [c, att[i]])), defense: new Map(clubs.map((c, i) => [c, def[i]])) };
    // L'écart APRÈS le recentrage (le recentrage retire à chaque tour le même décalage d'ensemble).
    if (corriger && tours > 0 && ecartDepuis([att, def], avant, n) < tolerance) {
      converge = true;
      tours++;
      break;
    }
  }
  if (!corriger) {
    // Itération 0 : l'attaque sans défense adverse, la défense sans attaque adverse (deux moyennes brutes).
    const brut = (K, S) => Float64Array.from(K, (k, i) => (S[i] > 0 ? k / S[i] : 0));
    const a0 = brut(Ka, Sa);
    const d0 = brut(Kd, Sd);
    centrer(a0, actifs, n);
    centrer(d0, actifs, n);
    return { attaque: new Map(clubs.map((c, i) => [c, a0[i]])), defense: new Map(clubs.map((c, i) => [c, d0[i]])), tours: 0, converge: true, iteration0: null };
  }
  return { attaque: new Map(clubs.map((c, i) => [c, att[i]])), defense: new Map(clubs.map((c, i) => [c, def[i]])), tours, converge, iteration0 };
}

/** Garde les n premières cases de chaque vecteur (avant un tour). */
function garder(vecteurs, avant, n) {
  for (let k = 0; k < vecteurs.length; k++) avant.set(vecteurs[k].subarray(0, n), k * n);
}
/** Le plus grand changement d'un tour, sur les n premières cases de chaque vecteur. */
function ecartDepuis(vecteurs, avant, n) {
  let e = 0;
  for (let k = 0; k < vecteurs.length; k++) {
    const v = vecteurs[k];
    const o = k * n;
    for (let i = 0; i < n; i++) {
      const x = Math.abs(v[i] - avant[o + i]);
      if (x > e) e = x;
    }
  }
  return e;
}

/**
 * Recentre un vecteur sur la moyenne de ses clubs actifs QUI ONT DES DONNÉES pour lui (n premières cases ;
 * `donnees` : un tableau de poids, > 0 = des données). Un club sans données (un promu qui n'a pas encore
 * joué à domicile) vaut 0 — l'adversaire moyen — et n'entre pas dans la moyenne : sinon chaque recentrage le
 * déplacerait sans que rien ne le recalcule, et la correction n'en finirait pas.
 */
function centrer(v, actifs, n, donnees = null, donnees2 = null) {
  let s = 0;
  let k = 0;
  const a = (i) => !donnees || donnees[i] > 0 || (donnees2 && donnees2[i] > 0);
  for (let i = 0; i < n; i++) {
    if (actifs[i] && a(i)) {
      s += v[i];
      k++;
    }
  }
  const m = k ? s / k : 0;
  for (let i = 0; i < n; i++) v[i] = a(i) ? v[i] - m : 0;
}

// ======================================================= le système d'un championnat

const NUL = -2147483648; // « vide » dans les lignes entières (Int32)
const CAP0 = 32;

/**
 * Le système d'UN championnat dans le rejeu : ses clubs (un indice chacun, dans l'ordre d'arrivée), ses
 * accumulateurs par côté de statistique et par lieu (0 domicile, 1 extérieur) — Σ ω, Σ ω y, nombre de
 * matchs, et Σ ω par adversaire (une matrice dense : un championnat a 15 à 45 clubs sur trois saisons) —,
 * les moyennes du championnat sur 365 jours, et ses notes (gardées d'un jour à l'autre : le tour suivant
 * part de la solution d'hier). ω = 2^((c + 1) / demi-vie), c le nombre de matchs relevés du club AVANT ce
 * match : le poids relatif de deux matchs d'un même club est bien 2^(−écart / demi-vie), et le facteur
 * commun se simplifie dans chaque moyenne (jamais de « vieillissement » à appliquer).
 */
class Systeme {
  constructor(league) {
    this.league = league;
    this.n = 0;
    this.cap = 0;
    this.clubs = [];
    this.index = new Map();
    this.dernierUsage = null; // Int32Array : dernier jour d'une rencontre utilisée, par club
    // Moyennes : file des rencontres utilisées (jour, valeurs) et sommes glissantes, plus les sommes de tout l'historique.
    this.file = [];
    this.debutFile = 0;
    this.glisse = { s: new Float64Array(NSTAT * 2), k: new Int32Array(NSTAT) };
    this.toujours = { s: new Float64Array(NSTAT * 2), k: new Int32Array(NSTAT) };
    this.resolu = false;
    this.agrandir(CAP0);
  }

  agrandir(cap) {
    const ancien = this.cap;
    const copie1 = (t, Type) => {
      const u = new Type(cap);
      if (t) u.set(t.subarray(0, ancien));
      return u;
    };
    const copie2 = (t) => {
      const u = new Float64Array(cap * cap);
      if (t) for (let i = 0; i < ancien; i++) u.set(t.subarray(i * ancien, i * ancien + ancien), i * cap);
      return u;
    };
    // Accumulateurs : [côté * 2 + lieu]
    this.S = Array.from({ length: NS * 2 }, (_, k) => copie1(this.S?.[k], Float64Array));
    this.Y = Array.from({ length: NS * 2 }, (_, k) => copie1(this.Y?.[k], Float64Array));
    this.N = Array.from({ length: NS * 2 }, (_, k) => copie1(this.N?.[k], Int32Array));
    this.W = Array.from({ length: NS * 2 }, (_, k) => copie2(this.W?.[k]));
    // Notes : par statistique, « tous » (a, d) et « lieux » (a0, a1, d0, d1) ; la possession : p, p0, p1.
    this.notes = Array.from({ length: NSTAT }, (_, k) => {
      const v = this.notes?.[k];
      return { a: copie1(v?.a, Float64Array), d: copie1(v?.d, Float64Array), a0: copie1(v?.a0, Float64Array), a1: copie1(v?.a1, Float64Array), d0: copie1(v?.d0, Float64Array), d1: copie1(v?.d1, Float64Array) };
    });
    this.brut = Array.from({ length: NSTAT }, (_, k) => {
      const v = this.brut?.[k];
      return { a: copie1(v?.a, Float64Array), d: copie1(v?.d, Float64Array), a0: copie1(v?.a0, Float64Array), a1: copie1(v?.a1, Float64Array), d0: copie1(v?.d0, Float64Array), d1: copie1(v?.d1, Float64Array) };
    });
    this.dernierUsage = copie1(this.dernierUsage, Int32Array);
    if (!ancien) this.dernierUsage.fill(-1);
    else this.dernierUsage.fill(-1, ancien);
    this.cap = cap;
  }

  indiceDe(club) {
    let i = this.index.get(club);
    if (i !== undefined) return i;
    if (this.n >= this.cap) this.agrandir(this.cap * 2);
    i = this.n++;
    this.index.set(club, i);
    this.clubs.push(club);
    return i;
  }

  /** Ajoute une rencontre utilisée : `omega` (par club, par côté) et les valeurs relevées. */
  ajouter(jour, h, a, valeurs, omegaH, omegaA) {
    const i = this.indiceDe(h);
    const j = this.indiceDe(a);
    const cap = this.cap;
    for (let st = 0; st < NSTAT; st++) {
      const v = valeurs[STATS[st]];
      if (!v) continue;
      const { p, c } = COTES_DE[st];
      // Le club qui reçoit (lieu 0) : il produit v[0], concède v[1] ; l'autre (lieu 1) : il produit v[1], concède v[0].
      this.poser(p * 2 + 0, i, j, omegaH[p], v[0], cap);
      this.poser(p * 2 + 1, j, i, omegaA[p], v[1], cap);
      if (c >= 0) {
        this.poser(c * 2 + 0, i, j, omegaH[c], v[1], cap);
        this.poser(c * 2 + 1, j, i, omegaA[c], v[0], cap);
      }
      this.glisse.s[st * 2] += v[0];
      this.glisse.s[st * 2 + 1] += v[1];
      this.glisse.k[st]++;
      this.toujours.s[st * 2] += v[0];
      this.toujours.s[st * 2 + 1] += v[1];
      this.toujours.k[st]++;
    }
    this.file.push({ jour, valeurs });
    this.dernierUsage[i] = jour;
    this.dernierUsage[j] = jour;
  }

  poser(k, i, j, omega, y, cap) {
    this.S[k][i] += omega;
    this.Y[k][i] += omega * y;
    this.N[k][i] += 1;
    this.W[k][i * cap + j] += omega;
  }

  /** Les moyennes du championnat au jour J : les 365 jours d'avant, sinon tout son historique (au moins 10 rencontres). */
  moyennes(jour) {
    const limite = jour - SEUILS_INDICE.joursActifs;
    while (this.debutFile < this.file.length && this.file[this.debutFile].jour < limite) {
      const { valeurs } = this.file[this.debutFile++];
      for (let st = 0; st < NSTAT; st++) {
        const v = valeurs[STATS[st]];
        if (!v) continue;
        this.glisse.s[st * 2] -= v[0];
        this.glisse.s[st * 2 + 1] -= v[1];
        this.glisse.k[st]--;
      }
    }
    if (this.debutFile > 4096 && this.debutFile * 2 > this.file.length) {
      this.file = this.file.slice(this.debutFile);
      this.debutFile = 0;
    }
    const mu = new Float64Array(NSTAT * 2);
    for (let st = 0; st < NSTAT; st++) {
      const src = this.glisse.k[st] >= SEUILS_INDICE.minimumMoyenne ? this.glisse : this.toujours;
      const k = src.k[st];
      mu[st * 2] = k ? src.s[st * 2] / k : Number.NaN;
      mu[st * 2 + 1] = k ? src.s[st * 2 + 1] / k : Number.NaN;
    }
    return mu;
  }

  /**
   * RÉSOUT le système au jour J (tout ce qui précède J est déjà dedans, rien d'autre) : pour chaque
   * statistique, l'itération 0 (sans correction, gardée dans `brut`) puis les tours de la correction, au
   * total et par lieu. Les clubs « actifs » (une rencontre utilisée dans les 365 jours) servent au
   * recentrage. Rend { tours, nonConvergees }.
   */
  resoudre(jour, { corriger = true, unites = null, aPriori = SEUILS_INDICE.aPriori } = {}) {
    const n = this.n;
    const cap = this.cap;
    const mu = this.moyennes(jour);
    // Le match FICTIF de chaque club face à un adversaire moyen (écart nul) : `aPriori` fois le poids de son dernier match.
    this.prior = new Float64Array(NS * n);
    if (unites && aPriori > 0) for (let k = 0; k < NS * n; k++) this.prior[k] = aPriori * unites[k];
    this.mu = mu;
    const actifs = new Uint8Array(n);
    const limite = jour - SEUILS_INDICE.joursActifs;
    for (let i = 0; i < n; i++) actifs[i] = this.dernierUsage[i] >= limite ? 1 : 0;
    this.actifs = actifs;
    let tours = 0;
    let nonConvergees = 0;
    for (let st = 0; st < NSTAT; st++) {
      if (!Number.isFinite(mu[st * 2])) continue;
      const { p, c } = COTES_DE[st];
      const r = c >= 0 ? this.resoudrePaire(st, p, c, mu, n, cap, actifs, corriger) : this.resoudreNote(st, p, mu, n, cap, actifs, corriger);
      tours += r.tours;
      if (!r.converge) nonConvergees++;
    }
    this.resolu = true;
    return { tours, nonConvergees };
  }

  resoudrePaire(st, p, c, mu, n, cap, actifs, corriger) {
    const T = SEUILS_INDICE;
    const muD = mu[st * 2];
    const muE = mu[st * 2 + 1];
    const Sp0 = this.S[p * 2];
    const Sp1 = this.S[p * 2 + 1];
    const Yp0 = this.Y[p * 2];
    const Yp1 = this.Y[p * 2 + 1];
    const Wp0 = this.W[p * 2];
    const Wp1 = this.W[p * 2 + 1];
    const Sc0 = this.S[c * 2];
    const Sc1 = this.S[c * 2 + 1];
    const Yc0 = this.Y[c * 2];
    const Yc1 = this.Y[c * 2 + 1];
    const Wc0 = this.W[c * 2];
    const Wc1 = this.W[c * 2 + 1];
    const Pp = this.prior.subarray(p * n, p * n + n);
    const Pc = this.prior.subarray(c * n, c * n + n);
    // Les constantes de chaque équation : attaque (y − μ du lieu), défense (μ du lieu de l'adversaire − y concédé).
    const Ka0 = new Float64Array(n);
    const Ka1 = new Float64Array(n);
    const Kd0 = new Float64Array(n);
    const Kd1 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      Ka0[i] = Yp0[i] - muD * Sp0[i];
      Ka1[i] = Yp1[i] - muE * Sp1[i];
      Kd0[i] = muE * Sc0[i] - Yc0[i];
      Kd1[i] = muD * Sc1[i] - Yc1[i];
    }
    const N = this.notes[st];
    const B = this.brut[st];
    // Itération 0 (le classement brut) : les moyennes pondérées sans l'adversaire, recentrées.
    for (let i = 0; i < n; i++) {
      const sa = Sp0[i] + Sp1[i];
      const sd = Sc0[i] + Sc1[i];
      B.a[i] = sa > 0 ? (Ka0[i] + Ka1[i]) / (sa + Pp[i]) : 0;
      B.d[i] = sd > 0 ? (Kd0[i] + Kd1[i]) / (sd + Pc[i]) : 0;
      B.a0[i] = Sp0[i] > 0 ? Ka0[i] / (Sp0[i] + Pp[i]) : 0;
      B.a1[i] = Sp1[i] > 0 ? Ka1[i] / (Sp1[i] + Pp[i]) : 0;
      B.d0[i] = Sc0[i] > 0 ? Kd0[i] / (Sc0[i] + Pc[i]) : 0;
      B.d1[i] = Sc1[i] > 0 ? Kd1[i] / (Sc1[i] + Pc[i]) : 0;
    }
    centrer(B.a, actifs, n, Sp0, Sp1);
    centrer(B.d, actifs, n, Sc0, Sc1);
    centrer(B.a0, actifs, n, Sp0);
    centrer(B.a1, actifs, n, Sp1);
    centrer(B.d0, actifs, n, Sc0);
    centrer(B.d1, actifs, n, Sc1);
    if (!corriger) {
      for (const k of ['a', 'd', 'a0', 'a1', 'd0', 'd1']) N[k].set(B[k].subarray(0, n));
      return { tours: 0, converge: true };
    }
    const { a, d, a0, a1, d0, d1 } = N;
    // Pas encore résolu (premier jour du championnat) : on part du classement brut.
    if (!this.resolu) for (const k of ['a', 'd', 'a0', 'a1', 'd0', 'd1']) N[k].set(B[k].subarray(0, n));
    let tours = 0;
    let converge = false;
    const vecteurs = [a, d, a0, a1, d0, d1];
    const avant = new Float64Array(n * vecteurs.length);
    while (tours < T.toursMax) {
      tours++;
      garder(vecteurs, avant, n);
      // Au total : a ← (Ka + Σ W d) / S, puis d ← (Kd + Σ W a) / S (Gauss-Seidel, recentré à chaque fois).
      for (let i = 0; i < n; i++) {
        const sa = Sp0[i] + Sp1[i];
        if (!(sa > 0)) continue;
        let s = Ka0[i] + Ka1[i];
        const o = i * cap;
        for (let j = 0; j < n; j++) s += (Wp0[o + j] + Wp1[o + j]) * d[j];
        const v = s / (sa + Pp[i]);
        a[i] = v;
      }
      centrer(a, actifs, n, Sp0, Sp1);
      for (let i = 0; i < n; i++) {
        const sd = Sc0[i] + Sc1[i];
        if (!(sd > 0)) continue;
        let s = Kd0[i] + Kd1[i];
        const o = i * cap;
        for (let j = 0; j < n; j++) s += (Wc0[o + j] + Wc1[o + j]) * a[j];
        const v = s / (sd + Pc[i]);
        d[i] = v;
      }
      centrer(d, actifs, n, Sc0, Sc1);
      // Par lieu : l'attaque à domicile face à la défense à l'extérieur de l'adversaire, et inversement.
      for (let i = 0; i < n; i++) {
        const o = i * cap;
        if (Sp0[i] > 0) {
          let s = Ka0[i];
          for (let j = 0; j < n; j++) s += Wp0[o + j] * d1[j];
          const v = s / (Sp0[i] + Pp[i]);
          a0[i] = v;
        }
        if (Sp1[i] > 0) {
          let s = Ka1[i];
          for (let j = 0; j < n; j++) s += Wp1[o + j] * d0[j];
          const v = s / (Sp1[i] + Pp[i]);
          a1[i] = v;
        }
      }
      centrer(a0, actifs, n, Sp0);
      centrer(a1, actifs, n, Sp1);
      for (let i = 0; i < n; i++) {
        const o = i * cap;
        if (Sc0[i] > 0) {
          let s = Kd0[i];
          for (let j = 0; j < n; j++) s += Wc0[o + j] * a1[j];
          const v = s / (Sc0[i] + Pc[i]);
          d0[i] = v;
        }
        if (Sc1[i] > 0) {
          let s = Kd1[i];
          for (let j = 0; j < n; j++) s += Wc1[o + j] * a0[j];
          const v = s / (Sc1[i] + Pc[i]);
          d1[i] = v;
        }
      }
      centrer(d0, actifs, n, Sc0);
      centrer(d1, actifs, n, Sc1);
      // L'écart APRÈS le recentrage : le recentrage retire à chaque tour le même décalage d'ensemble.
      if (ecartDepuis(vecteurs, avant, n) < T.tolerance) {
        converge = true;
        break;
      }
    }
    return { tours, converge };
  }

  /** La possession : une seule note p (poss = μ du lieu + p − p de l'adversaire), au total et par lieu. */
  resoudreNote(st, p, mu, n, cap, actifs, corriger) {
    const T = SEUILS_INDICE;
    const muD = mu[st * 2];
    const muE = mu[st * 2 + 1];
    const S0 = this.S[p * 2];
    const S1 = this.S[p * 2 + 1];
    const W0 = this.W[p * 2];
    const W1 = this.W[p * 2 + 1];
    const P = this.prior.subarray(p * n, p * n + n);
    const K0 = new Float64Array(n);
    const K1 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      K0[i] = this.Y[p * 2][i] - muD * S0[i];
      K1[i] = this.Y[p * 2 + 1][i] - muE * S1[i];
    }
    const N = this.notes[st];
    const B = this.brut[st];
    for (let i = 0; i < n; i++) {
      const s = S0[i] + S1[i];
      B.a[i] = s > 0 ? (K0[i] + K1[i]) / (s + P[i]) : 0;
      B.a0[i] = S0[i] > 0 ? K0[i] / (S0[i] + P[i]) : 0;
      B.a1[i] = S1[i] > 0 ? K1[i] / (S1[i] + P[i]) : 0;
    }
    centrer(B.a, actifs, n, S0, S1);
    centrer(B.a0, actifs, n, S0);
    centrer(B.a1, actifs, n, S1);
    if (!corriger) {
      for (const k of ['a', 'a0', 'a1']) N[k].set(B[k].subarray(0, n));
      return { tours: 0, converge: true };
    }
    if (!this.resolu) for (const k of ['a', 'a0', 'a1']) N[k].set(B[k].subarray(0, n));
    const { a, a0, a1 } = N;
    let tours = 0;
    let converge = false;
    const vecteurs = [a, a0, a1];
    const avant = new Float64Array(n * vecteurs.length);
    while (tours < T.toursMax) {
      tours++;
      garder(vecteurs, avant, n);
      for (let i = 0; i < n; i++) {
        const s0 = S0[i] + S1[i];
        if (!(s0 > 0)) continue;
        let s = K0[i] + K1[i];
        const o = i * cap;
        for (let j = 0; j < n; j++) s += (W0[o + j] + W1[o + j]) * a[j];
        const v = s / (s0 + P[i]);
        a[i] = v;
      }
      centrer(a, actifs, n, S0, S1);
      for (let i = 0; i < n; i++) {
        const o = i * cap;
        if (S0[i] > 0) {
          let s = K0[i];
          for (let j = 0; j < n; j++) s += W0[o + j] * a1[j];
          const v = s / (S0[i] + P[i]);
          a0[i] = v;
        }
        if (S1[i] > 0) {
          let s = K1[i];
          for (let j = 0; j < n; j++) s += W1[o + j] * a0[j];
          const v = s / (S1[i] + P[i]);
          a1[i] = v;
        }
      }
      centrer(a0, actifs, n, S0);
      centrer(a1, actifs, n, S1);
      if (ecartDepuis(vecteurs, avant, n) < T.tolerance) {
        converge = true;
        break;
      }
    }
    return { tours, converge };
  }

  /**
   * Les composantes d'un club (indice i) après `resoudre` : pour chaque lieu, les écarts corrigés
   * (`ecarts` : attaque a, défense d — plus grand = mieux —, possession p) et les valeurs par match face à
   * un adversaire moyen (`valeurs` : μ + a, μ − d, μ + p), avec le nombre de matchs relevés (`n`). Une
   * composante sous le minimum de matchs vaut null. `brut` : l'itération 0 (sans correction).
   */
  composantes(i, { brut = false } = {}) {
    const mu = this.mu;
    const src = brut ? this.brut : this.notes;
    const sortie = LIEUX.map(() => ({ ecarts: new Float64Array(NS).fill(Number.NaN), valeurs: new Float64Array(NS).fill(Number.NaN), n: new Int32Array(NS) }));
    for (let st = 0; st < NSTAT; st++) {
      const muD = mu[st * 2];
      const muE = mu[st * 2 + 1];
      if (!Number.isFinite(muD)) continue;
      const muN = (muD + muE) / 2;
      const { p, c } = COTES_DE[st];
      const v = src[st];
      for (const [k, cote, signe] of c >= 0 ? [[p, 'a', 1], [c, 'd', -1]] : [[p, 'a', 1]]) {
        const n0 = this.N[k * 2][i];
        const n1 = this.N[k * 2 + 1][i];
        const nn = [n0 + n1, n0, n1];
        // Le lieu du club : la moyenne qu'on lui oppose (attaque : la sienne ; défense : celle de l'adversaire).
        const base = cote === 'a' ? [muN, muD, muE] : [muN, muE, muD];
        const e = cote === 'a' ? [v.a[i], v.a0[i], v.a1[i]] : [v.d[i], v.d0[i], v.d1[i]];
        for (let l = 0; l < 3; l++) {
          sortie[l].n[k] = nn[l];
          if (nn[l] < SEUILS_INDICE.minimumMatchs) continue;
          sortie[l].ecarts[k] = e[l];
          sortie[l].valeurs[k] = base[l] + signe * e[l];
        }
      }
    }
    return sortie;
  }
}

/**
 * La note d'un club à un lieu : Σ poids × écart corrigé, avec la formule « xg » quand toutes ses
 * composantes sont mesurées, sinon « sans-xg ». Rend { force, formule } (null, null sans poids ou sans
 * composantes).
 */
export function noteDe(ecarts, poidsDeLaNote = POIDS_DE_LA_NOTE) {
  for (const formule of ['xg', 'sans-xg']) {
    const p = poidsDeLaNote?.[formule];
    const ids = FORMULES[formule];
    let complet = true;
    for (const id of ids) {
      if (!Number.isFinite(ecarts[IDX_COTE[id]])) {
        complet = false;
        break;
      }
    }
    if (!complet) continue;
    if (!p) return { force: null, formule };
    let f = p.constante ?? 0;
    for (const id of ids) f += (p[id] ?? 0) * ecarts[IDX_COTE[id]];
    return { force: f, formule };
  }
  return { force: null, formule: null };
}

// ======================================================= le rejeu (pur : des rencontres en, des lignes en sortie)

/** Les colonnes d'une ligne rendue par le rejeu (Int32, NUL = vide) : l'ordre du transfert vers le serveur. */
export const COLONNES_LIGNE = Object.freeze([
  'club', 'jour', 'lieu', 'actuel', 'ligue', 'saison', 'formule', 'n', 'n_xg', 'force', 'rang', 'equipes', 'pct_force',
  ...STATISTIQUES_INDICE.map((s) => s.id),
  ...STATISTIQUES_INDICE.map((s) => `pct_${s.id}`)
]);
const LARGEUR = COLONNES_LIGNE.length;
const C = Object.freeze(Object.fromEntries(COLONNES_LIGNE.map((c, i) => [c, i])));
const FORMULE_CODE = Object.freeze({ xg: 1, 'sans-xg': 2 });
export const FORMULE_DE_CODE = Object.freeze({ 1: 'xg', 2: 'sans-xg' });
/** Le sens d'un percentile : ce qu'on concède, plus petit = mieux. */
const SENS = STATISTIQUES_INDICE.map((s) => (s.cote === 'contre' ? -1 : 1));

/** Des lignes entières qui grandissent (pas de tableau d'objets : 350 000 lignes de 39 colonnes). */
class Lignes {
  constructor() {
    this.t = new Int32Array(LARGEUR * 4096);
    this.n = 0;
  }
  nouvelle() {
    if ((this.n + 1) * LARGEUR > this.t.length) {
      const u = new Int32Array(this.t.length * 2);
      u.set(this.t);
      this.t = u;
    }
    const o = this.n++ * LARGEUR;
    this.t.fill(NUL, o, o + LARGEUR);
    return o;
  }
  /** Les lignes, par morceaux de `taille` (le transfert vers le serveur). */
  morceaux(taille = 20000) {
    const out = [];
    for (let i = 0; i < this.n; i += taille) out.push(this.t.slice(i * LARGEUR, Math.min(this.n, i + taille) * LARGEUR));
    return out;
  }
}

const entier = (x, f) => (Number.isFinite(x) ? Math.round(x * f) : NUL);

/**
 * LE REJEU : les rencontres de la table du jour J, dans l'ordre du temps, et pour chaque jour, AVANT de lire
 * ses rencontres, la force des clubs qui jouent ce jour-là, dans leur championnat. Options :
 *   portee     Map championnat → premier jour (numéro) à écrire, ou null = tous les championnats depuis le début ;
 *   jusquA     le dernier jour lu (numéro ; les lignes « actuelles » valent à partir du lendemain) ;
 *   corriger   false : sans correction des adversaires (itération 0 seule — une variante du banc) ;
 *   demiVies   { id: demi-vie } à la place des réglages (une variante du banc) ;
 *   poidsDeLaNote  les poids de la note (POIDS_DE_LA_NOTE par défaut ; null : composantes seules) ;
 *   surJour    (jour, systeme, clubsDuJour) appelé après la résolution d'un championnat un jour de match
 *              (le banc y lit les composantes des deux clubs, sans rien écrire) ;
 *   ecrire     false : aucune ligne gardée (le banc).
 * Générateur : un point d'arrêt tous les quelques jours.
 */
export class RejeuDeForce {
  constructor({ portee = null, jusquA = null, corriger = true, demiVies = null, aPriori = SEUILS_INDICE.aPriori, poidsDeLaNote = POIDS_DE_LA_NOTE, surJour = null, ecrire = true, actuelles = true } = {}) {
    this.portee = portee;
    this.aPriori = aPriori;
    this.jusquA = jusquA;
    this.corriger = corriger;
    this.demiVies = STATISTIQUES_INDICE.map((s) => (demiVies?.[s.id] ?? s.demiVie));
    this.poidsDeLaNote = poidsDeLaNote;
    this.surJour = surJour;
    this.ecrire = ecrire;
    this.actuelles = actuelles;
    this.systemes = new Map();
    this.championnat = new Map(); // club → championnat (dernier match de championnat compté)
    this.dernierChampionnat = new Map(); // club → jour de ce match
    this.comptes = new Map(); // club → Int32Array(NSTAT) : matchs relevés, toutes compétitions
    this.ligues = [];
    this.indexLigue = new Map();
    this.lignes = new Lignes();
    this.dernierJour = -Infinity;
    this.bilan = { rencontres: 0, utilisees: 0, ecartees: { attribuees: 0, prolongees: 0, sansChampionnat: 0, championnatsDifferents: 0 }, ecarteesParCompetition: {}, resolutions: 0, tours: 0, nonConvergees: 0, toursMax: 0, lignes: 0, actuelles: 0 };
  }

  ligue(league) {
    let k = this.indexLigue.get(league);
    if (k === undefined) {
      k = this.ligues.length;
      this.indexLigue.set(league, k);
      this.ligues.push(league);
    }
    return k;
  }

  /** Dans la portée ? (le premier jour à écrire de ce championnat, ou null s'il n'est pas à rejouer) */
  depuis(league) {
    if (!this.portee) return -Infinity;
    const d = this.portee.get(league);
    return d === undefined ? null : d;
  }

  systeme(league) {
    let s = this.systemes.get(league);
    if (!s) {
      s = new Systeme(league);
      this.systemes.set(league, s);
    }
    return s;
  }

  /**
   * Un JOUR : `rencontres` = toutes celles de ce jour (mêmes `jour`), dans l'ordre des clés. D'abord les
   * lignes du jour (ce qu'on savait la veille), puis les rencontres entrent dans les systèmes.
   */
  jour(jour, rencontres) {
    if (!(jour > this.dernierJour)) throw new Error(`rejeu : le ${jourIso(jour)} arrive après le ${jourIso(this.dernierJour)} — fuite refusée`);
    this.dernierJour = jour;
    // 1. Les lignes « avant J » des clubs qui jouent, championnat par championnat.
    const parChampionnat = new Map();
    for (const r of rencontres) {
      for (const club of [r.dom, r.ext]) {
        const L = this.championnat.get(club);
        if (!L) continue;
        const d = this.depuis(L);
        if (d === null) continue;
        let set = parChampionnat.get(L);
        if (!set) parChampionnat.set(L, (set = new Set()));
        set.add(club);
      }
    }
    for (const [L, clubs] of parChampionnat) {
      const s = this.systemes.get(L);
      if (!s || !s.n) continue;
      // Résolu même avant le premier jour à réécrire : chaque jour part de la solution de la veille, et une nuit
      // qui ne rejoue que quelques championnats rend ainsi EXACTEMENT les lignes d'un calcul complet.
      const r = s.resoudre(jour, { corriger: this.corriger, unites: this.unites(s), aPriori: this.aPriori });
      this.compterResolution(r);
      if (this.surJour) this.surJour(jour, s, clubs, this);
      if (this.ecrire && jour >= this.depuis(L)) this.emettre(s, jour, clubs, 0);
    }
    // 2. Le championnat de chaque club : ses matchs de championnat comptés de ce jour.
    for (const r of rencontres) {
      if (!r.coupe && r.compte) {
        this.championnat.set(r.dom, r.league);
        this.championnat.set(r.ext, r.league);
        this.dernierChampionnat.set(r.dom, jour);
        this.dernierChampionnat.set(r.ext, jour);
      }
    }
    // 3. Les rencontres entrent : poids de chaque club (ses matchs relevés), puis le système de leur championnat commun.
    for (const r of rencontres) {
      this.bilan.rencontres++;
      if (r.attribue) {
        this.bilan.ecartees.attribuees++;
        continue;
      }
      if (r.prolongation) {
        this.bilan.ecartees.prolongees++;
        continue;
      }
      const valeurs = r.valeurs;
      const omegaH = this.omegas(r.dom, valeurs);
      const omegaA = this.omegas(r.ext, valeurs);
      const Lh = this.championnat.get(r.dom) ?? null;
      const La = this.championnat.get(r.ext) ?? null;
      if (!Lh || !La) {
        this.bilan.ecartees.sansChampionnat++;
        continue;
      }
      if (Lh !== La) {
        this.bilan.ecartees.championnatsDifferents++;
        this.bilan.ecarteesParCompetition[r.league] = (this.bilan.ecarteesParCompetition[r.league] ?? 0) + 1;
        continue;
      }
      if (this.depuis(Lh) === null) continue; // hors de la portée : pas rejoué
      this.systeme(Lh).ajouter(jour, r.dom, r.ext, valeurs, omegaH, omegaA);
      this.bilan.utilisees++;
    }
  }

  /** Les poids ω d'un club pour une rencontre (par côté), et ses comptes qui avancent (toutes compétitions). */
  omegas(club, valeurs) {
    let c = this.comptes.get(club);
    if (!c) this.comptes.set(club, (c = new Int32Array(NSTAT)));
    const omega = new Float64Array(NS);
    for (let st = 0; st < NSTAT; st++) {
      if (!valeurs[STATS[st]]) continue;
      const avant = c[st]++;
      const { p, c: k } = COTES_DE[st];
      omega[p] = 2 ** ((avant + 1) / this.demiVies[p]);
      if (k >= 0) omega[k] = 2 ** ((avant + 1) / this.demiVies[k]);
    }
    return omega;
  }

  /** Les unités du match fictif : pour chaque côté et chaque club du système, le poids de son dernier match relevé. */
  unites(s) {
    const n = s.n;
    const u = new Float64Array(NS * n);
    for (let i = 0; i < n; i++) {
      const c = this.comptes.get(s.clubs[i]);
      for (let st = 0; st < NSTAT; st++) {
        const { p, c: k } = COTES_DE[st];
        const compte = c ? c[st] : 0;
        u[p * n + i] = 2 ** (compte / this.demiVies[p]);
        if (k >= 0) u[k * n + i] = 2 ** (compte / this.demiVies[k]);
      }
    }
    return u;
  }

  compterResolution(r) {
    this.bilan.resolutions++;
    this.bilan.tours += r.tours;
    this.bilan.nonConvergees += r.nonConvergees;
    if (r.tours > this.bilan.toursMax) this.bilan.toursMax = r.tours;
  }

  /**
   * LES CLUBS DU CHAMPIONNAT au jour J (indices dans le système) : ceux dont c'est le championnat et qui y
   * ont joué un match de championnat compté DANS LA SAISON de J — dès que 6 clubs l'ont fait ; avant (l'
   * intersaison, la première journée), ceux de la saison d'avant. Un club descendu dans une division absente
   * du magasin garde ce championnat (il n'en joue pas d'autre) : il en sort à la saison suivante.
   */
  membresDe(s, jour) {
    const L = s.league;
    const saison = seasonOf(L, jourIso(jour));
    const debut = numeroDuJour(seasonBounds(L, saison)[0]);
    const debutAvant = numeroDuJour(seasonBounds(L, saison - 1)[0]);
    const cetteSaison = [];
    const avec = [];
    for (let i = 0; i < s.n; i++) {
      const club = s.clubs[i];
      if (this.championnat.get(club) !== L) continue;
      const d = this.dernierChampionnat.get(club) ?? -Infinity;
      if (d >= debut) cetteSaison.push(i);
      if (d >= debutAvant) avec.push(i);
    }
    return cetteSaison.length >= SEUILS_INDICE.minimumMembres ? cetteSaison : avec;
  }

  /**
   * Les lignes de `clubs` (ceux du championnat qui jouent ce jour-là, ou ses clubs pour les lignes
   * actuelles) : composantes, note, rang et percentiles parmi les clubs du championnat (membresDe).
   */
  emettre(s, jour, clubs, actuel) {
    const L = s.league;
    const membres = this.membresDe(s, jour);
    const parMembre = new Map();
    for (const i of membres) {
      const comp = s.composantes(i);
      const notes = comp.map((x) => noteDe(x.ecarts, this.poidsDeLaNote));
      parMembre.set(i, { comp, notes });
    }
    const saison = seasonOf(L, jourIso(jour));
    for (const club of clubs) {
      const i = s.index.get(club);
      if (i === undefined) continue;
      let m = parMembre.get(i);
      if (!m) {
        const comp = s.composantes(i);
        m = { comp, notes: comp.map((x) => noteDe(x.ecarts, this.poidsDeLaNote)) };
      }
      for (let l = 0; l < 3; l++) {
        const o = this.lignes.nouvelle();
        const t = this.lignes.t;
        const comp = m.comp[l];
        const note = m.notes[l];
        t[o + C.club] = club;
        t[o + C.jour] = jour;
        t[o + C.lieu] = l;
        t[o + C.actuel] = actuel;
        t[o + C.ligue] = this.ligue(L);
        t[o + C.saison] = saison;
        t[o + C.formule] = note.formule ? FORMULE_CODE[note.formule] : NUL;
        t[o + C.n] = comp.n[IDX_COTE.buts_p];
        t[o + C.n_xg] = comp.n[IDX_COTE.xg_p];
        t[o + C.force] = entier(note.force, 1000);
        // Rang et percentile de la note parmi les membres (même lieu).
        if (Number.isFinite(note.force)) {
          const autres = [];
          for (const [, x] of parMembre) if (Number.isFinite(x.notes[l].force)) autres.push(x.notes[l].force);
          if (!parMembre.has(i)) autres.push(note.force);
          let rang = 1;
          for (const f of autres) if (f > note.force + 1e-12) rang++;
          t[o + C.rang] = rang;
          t[o + C.equipes] = autres.length;
          t[o + C.pct_force] = percentileDans(note.force, autres, 1) ?? NUL;
        }
        for (let k = 0; k < NS; k++) {
          const v = comp.valeurs[k];
          t[o + C.pct_force + 1 + k] = entier(v, 100);
          if (!Number.isFinite(v)) continue;
          const autres = [];
          for (const [, x] of parMembre) autres.push(x.comp[l].valeurs[k]);
          if (!parMembre.has(i)) autres.push(v);
          t[o + C.pct_force + 1 + NS + k] = percentileDans(v, autres, SENS[k]) ?? NUL;
        }
        this.bilan.lignes++;
        if (actuel) this.bilan.actuelles++;
      }
    }
  }

  /**
   * LA FIN du rejeu : les lignes ACTUELLES (valables à partir du lendemain du dernier jour lu) des clubs de
   * chaque championnat de la portée (membresDe : ceux de la saison en cours, ou de la saison d'avant à
   * l'intersaison).
   */
  terminer() {
    if (!this.actuelles || !this.ecrire) return;
    const fin = this.jusquA ?? this.dernierJour;
    if (!Number.isFinite(fin)) return;
    const jour = fin + 1;
    for (const [L, s] of this.systemes) {
      if (this.depuis(L) === null || !s.n) continue;
      const r = s.resoudre(jour, { corriger: this.corriger, unites: this.unites(s), aPriori: this.aPriori });
      this.compterResolution(r);
      const clubs = this.membresDe(s, jour).map((i) => s.clubs[i]);
      this.emettre(s, jour, clubs, 1);
    }
  }
}

/**
 * Rejoue une liste de rencontres DÉJÀ RANGÉES (jour, puis clé) dans un rejeu : générateur, un point d'arrêt
 * tous les 20 jours. Les rencontres : { jour, cle, league, coupe, compte, attribue, prolongation, dom, ext,
 * valeurs } (valeursDUneRencontre).
 */
export function* rejouer(rejeu, rencontres, { pas = 20 } = {}) {
  let i = 0;
  let jours = 0;
  while (i < rencontres.length) {
    const jour = rencontres[i].jour;
    let j = i + 1;
    while (j < rencontres.length && rencontres[j].jour === jour) j++;
    rejeu.jour(jour, rencontres.slice(i, j));
    i = j;
    if (++jours % pas === 0) yield 'rejeu';
  }
  rejeu.terminer();
  return rejeu;
}

// ======================================================= la lecture du magasin (table du jour J)

/**
 * Les rencontres de la table du jour J, une par rencontre (le camp qui reçoit, et la possession de l'autre
 * camp), RANGÉES par jour puis par clé (l'ordre de la table du jour J). Générateur : un point d'arrêt toutes
 * les 5 000 lignes. Rend la liste des rencontres du rejeu.
 */
export function* chargerLesRencontres(database, { pas = 5000 } = {}) {
  const sql = `SELECT d.match_key AS cle, t.date, t.league, t.coupe, t.compte, t.attribue, t.prolongation, t.club AS dom, t.adversaire AS ext,
      t.bp, t.bc, t.xg_p, t.xg_c, t.tirs_p, t.tirs_c, t.cadres_p, t.cadres_c, t.occasions_p, t.occasions_c, t.corners_p, t.corners_c,
      t.possession_p, o.possession_p AS possession_c
    FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre
    LEFT JOIN team_day o ON o.rencontre = t.rencontre AND o.camp = 0
    WHERE t.camp = 1`;
  const out = [];
  let i = 0;
  for (const r of database.prepare(sql).iterate()) {
    out.push({
      jour: numeroDuJour(r.date),
      cle: String(r.cle),
      league: r.league,
      coupe: r.coupe === 1,
      compte: r.compte === 1,
      attribue: r.attribue === 1,
      prolongation: r.prolongation === 1,
      dom: r.dom,
      ext: r.ext,
      valeurs: valeursDUneRencontre(r)
    });
    if (++i % pas === 0) yield 'lecture des rencontres';
  }
  out.sort((a, b) => a.jour - b.jour || (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
  yield 'lecture des rencontres';
  return out;
}

/** FNV-1a 32 bits d'un texte (l'empreinte d'une rencontre). */
function fnv(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * L'EMPREINTE de la table du jour J, par compétition et par mois : { « compétition|AAAA-MM » : [nombre de
 * rencontres, somme des empreintes (clé, mise à jour, jour, clubs)] } — une rencontre nouvelle, modifiée
 * (date de mise à jour DIFFÉRENTE, une base restaurée recule), déplacée ou retirée change sa case. Plus la
 * version de la table du jour J. Lecture seule, une passe sur day_matches.
 */
export function empreinteDesRencontres(database) {
  const cases = {};
  for (const r of database.prepare('SELECT match_key, date, league, home, away, updated_at FROM day_matches').iterate()) {
    const cle = `${r.league}|${String(r.date).slice(0, 7)}`;
    const c = (cases[cle] ??= [0, 0]);
    c[0]++;
    c[1] += fnv(`${r.match_key}|${r.updated_at ?? ''}|${r.date}|${r.home}|${r.away}`);
  }
  let versionTable = null;
  try {
    versionTable = database.prepare("SELECT valeur FROM day_state WHERE cle = 'version'").get()?.valeur ?? null;
  } catch {
    versionTable = null;
  }
  return { versionTable, cases };
}

/** Les cases qui ont changé entre deux empreintes : [{ league, mois }]. */
export function casesChangees(avant, apres) {
  const out = [];
  const toutes = new Set([...Object.keys(avant?.cases ?? {}), ...Object.keys(apres?.cases ?? {})]);
  for (const k of toutes) {
    const a = avant?.cases?.[k];
    const b = apres?.cases?.[k];
    if (a && b && a[0] === b[0] && a[1] === b[1]) continue;
    const sep = k.lastIndexOf('|');
    out.push({ league: k.slice(0, sep), mois: k.slice(sep + 1) });
  }
  return out;
}

/**
 * LA PORTÉE d'une nuit : les championnats à rejouer et, pour chacun, le premier jour à réécrire — le 1er
 * du plus ancien mois touché d'une compétition où un de ses clubs a joué (un club touché par une coupe
 * l'est aussi : ses poids dans le temps comptent tous ses matchs). Un passage léger sur les rencontres (le
 * championnat de chaque club, jour après jour), sans aucun calcul de force. Rend Map championnat → jour.
 */
export function porteeDesChangements(rencontres, changees) {
  const premierDuMois = (mois) => numeroDuJour(`${mois}-01`);
  const parCase = new Map();
  for (const c of changees) {
    const k = `${c.league}|${c.mois}`;
    parCase.set(k, premierDuMois(c.mois));
  }
  const portee = new Map();
  const toucher = (L, jour) => {
    if (!L) return;
    const d = portee.get(L);
    if (d === undefined || jour < d) portee.set(L, jour);
  };
  // Une compétition de championnat touchée est rejouée, même si toutes ses rencontres du mois ont disparu.
  for (const c of changees) if (rencontres.some((r) => r.league === c.league && !r.coupe)) toucher(c.league, premierDuMois(c.mois));
  const championnat = new Map();
  let i = 0;
  while (i < rencontres.length) {
    const jour = rencontres[i].jour;
    let j = i;
    while (j < rencontres.length && rencontres[j].jour === jour) {
      const r = rencontres[j];
      if (!r.coupe && r.compte) {
        championnat.set(r.dom, r.league);
        championnat.set(r.ext, r.league);
      }
      j++;
    }
    for (let k = i; k < j; k++) {
      const r = rencontres[k];
      const d = parCase.get(`${r.league}|${jourIso(r.jour).slice(0, 7)}`);
      if (d === undefined) continue;
      toucher(championnat.get(r.dom), d);
      toucher(championnat.get(r.ext), d);
    }
    i = j;
  }
  return portee;
}

// ======================================================= le calcul (processus à part, lecture seule)

/** L'empreinte des RÉGLAGES (version, demi-vies, poids, seuils) : changés, toute la table est refaite. */
export function empreinteDesReglages(reglages = REGLAGES_INDICE_FORCE) {
  return String(fnv(JSON.stringify(reglages)));
}

/**
 * LE CALCUL, sur une base ouverte EN LECTURE SEULE (le processus à part, ou un script) : l'empreinte des
 * rencontres ; rien de changé depuis `precedente` (même version, mêmes réglages) → { rien: true } ; sinon
 * la portée (tout, la première fois ou après un changement de version ou de réglages ; les championnats
 * touchés sinon), le rejeu, et les lignes. Générateur. Rend { rien, empreinte, portee, lignes (morceaux
 * Int32Array), ligues, jusquA, bilan }.
 */
export function* calculerLesIndices({ database, precedente = null, force = false, options = {} } = {}) {
  const debut = performance.now();
  const empreinte = empreinteDesRencontres(database);
  yield 'empreinte';
  const memes = !force && precedente && precedente.version === VERSION_INDICE_FORCE && precedente.reglages === empreinteDesReglages() && precedente.empreinte?.versionTable === empreinte.versionTable;
  const changees = memes ? casesChangees(precedente.empreinte, empreinte) : null;
  if (memes && !changees.length) return { rien: true, empreinte, dureeMs: Math.round(performance.now() - debut) };
  const rencontres = yield* chargerLesRencontres(database);
  const tLecture = performance.now();
  const portee = memes ? porteeDesChangements(rencontres, changees) : null;
  const dernier = rencontres.length ? rencontres.at(-1).jour : null;
  const jusquA = options.jusquA ?? dernier;
  const rejeu = new RejeuDeForce({ portee, jusquA, ...(options.rejeu ?? {}) });
  yield* rejouer(rejeu, rencontres);
  const tRejeu = performance.now();
  return {
    rien: false,
    empreinte,
    complet: !portee,
    portee: portee ? Object.fromEntries([...portee].map(([L, d]) => [L, jourIso(d)])) : null,
    lignes: rejeu.lignes.morceaux(),
    nLignes: rejeu.lignes.n,
    ligues: rejeu.ligues,
    jusquA: jusquA === null ? null : jourIso(jusquA),
    bilan: {
      ...rejeu.bilan,
      changees: changees ? changees.length : null,
      championnats: portee ? portee.size : rejeu.systemes.size,
      dureeMs: Math.round(performance.now() - debut),
      parties: { lecture: Math.round(tLecture - debut), rejeu: Math.round(tRejeu - tLecture) }
    }
  };
}

const ENFANT = fileURLToPath(new URL('./teamStrengthEnfant.js', import.meta.url));
/** Le rejeu complet prend ~27 s sur la base du bac (mesuré le 14/10/2026, 249 Mo chez lui) : au-delà de 20 min, l'enfant est arrêté. */
export const DELAI_CALCUL_MS = 20 * 60_000;
/** La mémoire de l'enfant : tas plafonné (il ramasse ses déchets au lieu de grossir), comme celui de l'étape 22. */
export const OPTIONS_DE_L_ENFANT = Object.freeze(['--max-old-space-size=512', '--max-semi-space-size=8']);

/**
 * Le calcul dans un PROCESSUS À PART (le patron des étapes 18 et 22) : fork de teamStrengthEnfant.js, base en
 * LECTURE SEULE, réponse par le canal du processus en sérialisation « avancée » (les lignes en Int32Array,
 * par morceaux de 20 000 : jamais un gros message à décoder d'un bloc dans le serveur). Rend une promesse de
 * la réponse de calculerLesIndices ; rejette si l'enfant échoue, se tait au-delà de `delaiMs` (il est alors
 * arrêté) ou s'arrête sans répondre.
 */
export function calculerAPart({ chemin, precedente = null, force = false, options = {}, delaiMs = DELAI_CALCUL_MS }) {
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const morceaux = [];
    const enfant = fork(ENFANT, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...OPTIONS_DE_L_ENFANT] });
    const minuterie = setTimeout(() => {
      if (fini) return;
      fini = true;
      try {
        enfant.kill();
      } catch {
        // déjà arrêté
      }
      reject(new Error(`calcul à part arrêté : aucune réponse en ${delaiMs < 60_000 ? `${delaiMs} ms` : `${Math.round(delaiMs / 60_000)} min`}`));
    }, delaiMs);
    minuterie.unref?.();
    enfant.stderr?.on('data', (d) => {
      erreurs = (erreurs + d).slice(-2000);
    });
    enfant.on('message', (m) => {
      if (m?.morceau) {
        morceaux.push(m.morceau);
        return;
      }
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(m.rien ? m : { ...m, lignes: morceaux });
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!fini) reject(error);
      fini = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!fini) reject(new Error(`calcul à part arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      fini = true;
    });
    enfant.send({ chemin, precedente, force, options });
  });
}

// ======================================================= le rangement (le serveur, seul écrivain)

const COLONNES_TABLE = Object.freeze([
  'club', 'jour', 'lieu', 'actuel', 'league', 'saison', 'formule', 'n', 'n_xg', 'force', 'rang', 'equipes', 'pct_force',
  ...STATISTIQUES_INDICE.map((s) => s.id),
  ...STATISTIQUES_INDICE.map((s) => `pct_${s.id}`)
]);
const vide = (v) => (v === NUL ? null : v);
/** Annule la transaction en cours, s'il y en a une (une erreur dans BEGIN lui-même n'en ouvre pas : l'erreur d'origine remonte). */
function annuler(database) {
  try {
    if (database.isTransaction !== false) database.exec('ROLLBACK');
  } catch {
    // aucune transaction ouverte
  }
}
/**
 * Lignes écrites (ou retirées) par transaction : 250 — 2 000 tenaient le serveur jusqu'à 300 ms d'un bloc sur
 * la base du bac (mesuré le 14/10/2026, première construction) ; 250 : quelques dizaines de ms.
 */
export const TRANCHE_RANGEMENT = 250;

/** L'état du calcul (team_strength_state), tel que l'écrit le dernier rangement. JAMAIS de calcul ni d'écriture. */
export function etatIndiceDeForce({ database = openDb() } = {}) {
  let brut = null;
  try {
    brut = Object.fromEntries(database.prepare('SELECT cle, valeur FROM team_strength_state').all().map((r) => [r.cle, r.valeur]));
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  const json = (t) => {
    try {
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  };
  const version = brut?.version ? Number(brut.version) : null;
  const absent = !brut || version === null || !brut.calcule_le;
  return {
    absent,
    version,
    versionAttendue: VERSION_INDICE_FORCE,
    reglages: brut?.reglages ?? null,
    reglagesAttendus: empreinteDesReglages(),
    calculeLe: brut?.calcule_le ?? null,
    jusquA: brut?.jusqua ?? null,
    enCours: brut?.en_cours ?? null,
    empreinte: json(brut?.empreinte),
    bilan: json(brut?.bilan),
    banc: json(brut?.banc),
    aJour: !absent && version === VERSION_INDICE_FORCE && brut?.reglages === empreinteDesReglages() && !brut?.en_cours
  };
}

/**
 * RANGE un calcul (générateur, le serveur ou le script du bac, sous le verrou de la passe) : marque la passe
 * « en cours » (une passe interrompue fait tout refaire la nuit suivante), retire les lignes à refaire —
 * tout (calcul complet), ou, pour chaque championnat de la portée, ses lignes à partir de son premier jour
 * touché —, les lignes actuelles des clubs qui en reçoivent une nouvelle, puis écrit les nouvelles lignes par
 * tranches de 250 dans des transactions à elles (jamais une transaction ouverte pendant un point d'arrêt),
 * et enfin l'état (empreinte, réglages, bilan). Rend { ecrites, retirees }.
 */
export function* rangerLesIndices({ database, calcul, maintenant = () => new Date().toISOString(), tranche = TRANCHE_RANGEMENT }) {
  const etat = database.prepare('INSERT OR REPLACE INTO team_strength_state (cle, valeur) VALUES (?, ?)');
  etat.run('en_cours', maintenant());
  let retirees = 0;
  if (calcul.complet) {
    for (;;) {
      const r = database.prepare('DELETE FROM team_strength WHERE (club, jour, lieu) IN (SELECT club, jour, lieu FROM team_strength LIMIT ?)').run(tranche);
      retirees += r.changes;
      if (!r.changes) break;
      yield 'retrait';
    }
  } else {
    for (const [L, jour] of Object.entries(calcul.portee ?? {})) {
      for (;;) {
        const r = database.prepare('DELETE FROM team_strength WHERE (club, jour, lieu) IN (SELECT club, jour, lieu FROM team_strength WHERE league = ? AND jour >= ? AND actuel = 0 LIMIT ?)').run(L, jour, tranche);
        retirees += r.changes;
        if (r.changes < tranche) break;
        yield 'retrait';
      }
      yield 'retrait';
    }
  }
  // Les lignes actuelles des championnats rejoués (un club qui n'en est plus n'en reçoit pas de nouvelle), puis
  // celles des clubs qui en reçoivent une nouvelle, où qu'elles soient (un promu change de championnat).
  if (!calcul.complet) {
    for (const L of Object.keys(calcul.portee ?? {})) {
      retirees += database.prepare('DELETE FROM team_strength WHERE league = ? AND actuel = 1').run(L).changes;
      yield 'retrait';
    }
  }
  const clubsActuels = new Set();
  for (const m of calcul.lignes) for (let o = 0; o < m.length; o += LARGEUR) if (m[o + C.actuel] === 1) clubsActuels.add(m[o + C.club]);
  const retirerActuelle = database.prepare('DELETE FROM team_strength WHERE club = ? AND actuel = 1');
  let k = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const club of clubsActuels) {
      retirees += retirerActuelle.run(club).changes;
      if (++k % tranche === 0) {
        database.exec('COMMIT');
        yield 'retrait';
        database.exec('BEGIN IMMEDIATE');
      }
    }
    database.exec('COMMIT');
  } catch (error) {
    annuler(database);
    throw error;
  }
  yield 'retrait';
  const inserer = database.prepare(`INSERT OR REPLACE INTO team_strength (${COLONNES_TABLE.join(', ')}) VALUES (${COLONNES_TABLE.map(() => '?').join(', ')})`);
  let ecrites = 0;
  let dansLaTransaction = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const m of calcul.lignes) {
      for (let o = 0; o < m.length; o += LARGEUR) {
        const valeurs = new Array(COLONNES_TABLE.length);
        valeurs[0] = m[o + C.club];
        valeurs[1] = jourIso(m[o + C.jour]);
        valeurs[2] = LIEUX[m[o + C.lieu]];
        valeurs[3] = m[o + C.actuel];
        valeurs[4] = calcul.ligues[m[o + C.ligue]];
        valeurs[5] = m[o + C.saison];
        valeurs[6] = FORMULE_DE_CODE[m[o + C.formule]] ?? null;
        for (let c = 7; c < COLONNES_TABLE.length; c++) valeurs[c] = vide(m[o + c]);
        inserer.run(...valeurs);
        ecrites++;
        if (++dansLaTransaction >= tranche) {
          database.exec('COMMIT');
          dansLaTransaction = 0;
          yield 'écriture';
          database.exec('BEGIN IMMEDIATE');
        }
      }
    }
    database.exec('COMMIT');
  } catch (error) {
    annuler(database);
    throw error;
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    etat.run('version', String(VERSION_INDICE_FORCE));
    etat.run('reglages', empreinteDesReglages());
    etat.run('empreinte', JSON.stringify(calcul.empreinte));
    etat.run('jusqua', calcul.jusquA ?? '');
    etat.run('calcule_le', maintenant());
    etat.run('bilan', JSON.stringify({ ...calcul.bilan, complet: Boolean(calcul.complet), portee: calcul.portee, ecrites, retirees }));
    database.prepare("DELETE FROM team_strength_state WHERE cle = 'en_cours'").run();
    database.exec('COMMIT');
  } catch (error) {
    annuler(database);
    throw error;
  }
  return { ecrites, retirees };
}

/**
 * LA PASSE DE NUIT (étape « indiceForce » de l'actualisation ; le script du bac l'appelle aussi), SOUS le
 * verrou d'actualisation :
 *   1. l'état (une lecture), puis le PROCESSUS À PART, attendu sans tenir la main : l'empreinte des
 *      rencontres et, si rien n'a changé (même version, mêmes réglages), RIEN — rien n'est écrit ; sinon le
 *      rejeu des seuls championnats touchés (tout, la première fois) ;
 *   2. le rangement par tranches courtes, la main rendue entre deux (rangerLesIndices) ;
 *   3. en échec : rien d'avancé (l'empreinte n'est écrite qu'à la fin), la passe suivante recommence ;
 *      un rangement interrompu (« en cours ») fait tout refaire.
 * Jamais d'exception pour une panne du calcul : `erreur`.
 */
export async function indiceDeForce({
  database = openDb(),
  chemin = resolveDbPath(),
  force = false,
  aPart = true,
  options = {},
  delaiMs = DELAI_CALCUL_MS,
  rendreLaMain = rendreLaMainParDefaut,
  maintenant = () => new Date().toISOString()
} = {}) {
  const debut = performance.now();
  const pauses = creerPauses({ rendreLaMain });
  const etat = etatIndiceDeForce({ database });
  const precedente = !force && !etat.absent && !etat.enCours ? { version: etat.version, reglages: etat.reglages, empreinte: etat.empreinte } : null;
  let r;
  try {
    r = aPart
      ? await pauses.attendre(calculerAPart({ chemin, precedente, force, options, delaiMs }), 'calcul à part')
      : await executerEnRendantLaMain(calculerLesIndices({ database, precedente, force, options }), pauses.siLongtemps);
  } catch (error) {
    return { mode: 'echec', erreur: String(error?.message ?? error), dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  if (r.rien) return { mode: 'rien', calculeLe: etat.calculeLe, jusquA: etat.jusquA, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  const tRangement = performance.now();
  let range;
  try {
    range = await executerEnRendantLaMain(rangerLesIndices({ database, calcul: r, maintenant }), pauses.siLongtemps);
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error)}`, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  return {
    mode: etat.absent ? 'premier' : r.complet ? 'complet' : 'nuit',
    complet: Boolean(r.complet),
    portee: r.portee,
    jusquA: r.jusquA,
    lignes: r.nLignes,
    ecrites: range.ecrites,
    retirees: range.retirees,
    bilanDuCalcul: r.bilan,
    rangementMs: Math.round(performance.now() - tRangement),
    dureeMs: Math.round(performance.now() - debut),
    ...pauses.bilan()
  };
}

// ======================================================= la lecture (étapes 31, 27 et 30)

const clubEnNumero = (club) => {
  const m = /^fotmob-([1-9]\d*)$/.exec(String(club ?? ''));
  const n = m ? Number(m[1]) : Number(club);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`identifiant FotMob mal formé : « ${club ?? ''} »`);
  return n;
};

/** Une ligne de team_strength → sa lecture : valeurs décodées (÷100, note ÷1000), percentiles, points forts et faibles. */
function ligneLue(r, noms) {
  const composantes = {};
  const forts = [];
  const faibles = [];
  for (const s of STATISTIQUES_INDICE) {
    const v = r[s.id];
    const p = r[`pct_${s.id}`];
    composantes[s.id] = { libelle: s.libelle, valeur: v === null || v === undefined ? null : v / 100, percentile: p ?? null, cote: s.cote };
    if (p === null || p === undefined) continue;
    if (p >= SEUILS_INDICE.pointFort) forts.push({ id: s.id, libelle: s.libelle, percentile: p });
    if (p <= SEUILS_INDICE.pointFaible) faibles.push({ id: s.id, libelle: s.libelle, percentile: p });
  }
  forts.sort((a, b) => b.percentile - a.percentile);
  faibles.sort((a, b) => a.percentile - b.percentile);
  const id = `fotmob-${r.club}`;
  return {
    club: id,
    nom: noms?.get(id) ?? null,
    jour: r.jour,
    actuel: r.actuel === 1,
    lieu: r.lieu,
    championnat: r.league,
    saison: r.saison,
    formule: r.formule ?? null,
    sansXg: r.formule === 'sans-xg',
    matchs: r.n,
    matchsXg: r.n_xg,
    force: r.force === null || r.force === undefined ? null : r.force / 1000,
    rang: r.rang ?? null,
    equipes: r.equipes ?? null,
    percentileForce: r.pct_force ?? null,
    composantes,
    pointsForts: forts,
    pointsFaibles: faibles
  };
}

/**
 * LA LECTURE pour les étapes 31 (écran), 27 et 30 (modèles) — lecture seule, jamais une écriture, rien de
 * recalculé. Rend null tant que l'indice n'a jamais été calculé. Sinon :
 *   - `club` (numéro FotMob ou « fotmob-… ») : { club, nom, actuel: { tous, dom, ext }, historique? } — sa
 *     ligne actuelle aux trois lieux ; avec `jour` (AAAA-MM-JJ) : sa ligne « avant ce jour » (le jour même
 *     s'il a joué ce jour-là, sinon la dernière d'avant : jamais une ligne d'après, donc jamais de fuite) ;
 *     `historique: true` : toutes ses lignes « tous », du plus ancien au plus récent (la note dans le temps) ;
 *   - `league` : { championnat, clubs: [ligne actuelle « tous » (ou `lieu`) de chaque club, rangée par note] }.
 * Chaque ligne : { club, nom, jour, actuel, lieu, championnat, saison, formule ('xg' | 'sans-xg' : le repli
 * sur les buts et les tirs), sansXg, matchs, matchsXg, force (buts d'écart attendus par match face à une
 * équipe moyenne de son championnat), rang, equipes, percentileForce, composantes { id: { libelle, valeur
 * (par match, face à un adversaire moyen), percentile (dans son championnat : plus haut = mieux, même pour
 * ce qu'on concède), cote } }, pointsForts, pointsFaibles (percentile ≥ 75, ≤ 25) }.
 */
export function lireIndiceDeForce({ database = openDb(), club = null, league = null, lieu = null, jour = null, historique = false } = {}) {
  const etat = etatIndiceDeForce({ database });
  if (etat.absent) return null;
  const noms = canonicalTeamNames({ database });
  const commun = { calculeLe: etat.calculeLe, jusquA: etat.jusquA, version: etat.version };
  if (club !== null && club !== undefined) {
    const n = clubEnNumero(club);
    let lignes;
    if (jour) {
      const j = String(jour).slice(0, 10);
      numeroDuJour(j);
      const choisi = database.prepare('SELECT jour FROM team_strength WHERE club = ? AND jour <= ? AND actuel = 0 ORDER BY jour DESC LIMIT 1').get(n, j)?.jour ?? null;
      // Une ligne actuelle vaut pour tout jour à partir du sien.
      const actuelle = database.prepare('SELECT jour FROM team_strength WHERE club = ? AND actuel = 1 LIMIT 1').get(n)?.jour ?? null;
      const cle = actuelle && j >= actuelle && (!choisi || actuelle > choisi) ? actuelle : choisi;
      lignes = cle ? database.prepare('SELECT * FROM team_strength WHERE club = ? AND jour = ?').all(n, cle) : [];
    } else {
      lignes = database.prepare('SELECT * FROM team_strength WHERE club = ? AND actuel = 1').all(n);
    }
    const parLieu = Object.fromEntries(LIEUX.map((l) => [l, null]));
    for (const r of lignes) parLieu[r.lieu] = ligneLue(r, noms);
    const sortie = { ...commun, club: `fotmob-${n}`, nom: noms.get(`fotmob-${n}`) ?? null, jour: jour ?? null, lignes: parLieu };
    if (historique) {
      sortie.historique = database
        .prepare("SELECT jour, actuel, league, saison, formule, n, force, rang, equipes, pct_force FROM team_strength WHERE club = ? AND lieu = 'tous' ORDER BY jour")
        .all(n)
        .map((r) => ({ jour: r.jour, actuel: r.actuel === 1, championnat: r.league, saison: r.saison, formule: r.formule, matchs: r.n, force: r.force === null ? null : r.force / 1000, rang: r.rang, equipes: r.equipes, percentileForce: r.pct_force }));
    }
    return sortie;
  }
  if (league) {
    const l = lieu ?? 'tous';
    if (!LIEUX.includes(l)) throw new Error(`lieu inconnu : « ${l} » (tous, dom, ext)`);
    const clubs = database
      .prepare('SELECT * FROM team_strength WHERE league = ? AND actuel = 1 AND lieu = ?')
      .all(league, l)
      .map((r) => ligneLue(r, noms))
      .sort((a, b) => (b.force ?? -Infinity) - (a.force ?? -Infinity) || a.club.localeCompare(b.club));
    return { ...commun, championnat: league, lieu: l, clubs };
  }
  const championnats = database
    .prepare("SELECT league, COUNT(*) AS clubs, SUM(formule = 'sans-xg') AS sansXg, MAX(jour) AS jour FROM team_strength WHERE actuel = 1 AND lieu = 'tous' GROUP BY league ORDER BY league")
    .all()
    .map((r) => ({ championnat: r.league, clubs: r.clubs, sansXg: r.sansXg ?? 0, valableDepuis: r.jour }));
  return { ...commun, championnats };
}

export const __pourLesTests = Object.freeze({ Systeme, Lignes, NUL, LARGEUR, C, NS, NSTAT, COTES_DE, IDX_COTE, SENS, centrer, fnv, COLONNES_TABLE });
