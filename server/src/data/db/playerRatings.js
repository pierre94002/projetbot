/**
 * playerRatings.js — LES FICHES DES JOUEURS PAR POSTE ET LA FORCE DU ONZE (étape 30 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Pour chaque joueur, ce qu'on sait de lui « la veille » : ses statistiques par 90 minutes, pondérées dans le
 * temps, corrigées de la force de ses adversaires et du niveau de son championnat, ramenées vers la moyenne de
 * son poste quand il a peu joué ; et, pour chaque club, son ÉQUIPE HABITUELLE. À l'annonce d'une composition,
 * la FORCE DU ONZE additionne, ligne par ligne, les apports des titulaires et les compare à ceux de l'équipe
 * habituelle (forceDuOnze, pure ; lue par lineupContext.js pour la page du match, affichée à l'étape 31).
 *
 * RÈGLE DE PIERRE (cahier, étape 30) : les compositions ne servent qu'au commentaire de l'IA et à l'écran. Rien
 * ici n'entre dans les chiffres du moteur : aucun fichier de son empreinte (engineVersions.MODULES_DU_MOTEUR)
 * n'importe ce module, et ce module n'est pas dans l'empreinte (test fichesJoueurs.test.mjs, T12). Le banc le
 * mesure à blanc (playerRatingsBanc.js) ; la question de Pierre est posée dans la conception (§ 8).
 *
 * D'OÙ ÇA VIENT : la table du jour J (player_day, team_day, day_matches ; étape 17), les cartes de tirs des
 * rencontres (matches.shotmap, minutées) — jamais une lecture « du moment ». Ni stat_value (étape 18), ni
 * team_strength (29), ni forces_buts (27) ne sont lus : leurs fenêtres vues (P2 football-data, 2023-S1)
 * seraient sinon « déjà vues » par toute candidate du moteur qui lirait un jour la force du onze. Les demi-vies
 * et rétrécissements viennent de la partie JOUEURS de l'étape 18 (magasin seulement), remesurés sur le magasin
 * 2023-07 → 2026-09-23 (conception § 2.2-2.3) et RECOPIÉS ici, dans un réglage versionné.
 *
 * LA NOTE (composante c, joueur j, avant le jour J) : r = (S + k·m) / (W + k), où
 *   - S = Σ 2^(−a/h)·x et W = Σ 2^(−a/h)·d sur ses apparitions JOUÉES relevées (a = rang de l'apparition en
 *     partant de la plus récente ; d = minutes/90, ou 1 par apparition pour la note FotMob) ;
 *   - x est corrigé : offensif (xgnp, xa, xgot, tirs, pc) ÷ D_adv (xG concédés de l'adversaire rapportés à son
 *     championnat, la formule forcesDe de l'étape 27 : (Σ + 8)/(W + 8), demi-vie 25) ÷ F_championnat du match ;
 *     xga (xG adverses hors penalty tirés pendant qu'il est sur le terrain) ÷ A_adv ; récupérations et duels
 *     × 50/(100 − possession de son camp) (rapportés à la possession ADVERSE) ;
 *   - m = la moyenne de son poste dans le championnat de son club sur les 365 jours d'avant (mêmes valeurs
 *     corrigées ; repli : son poste tous championnats), × 0,85 pour l'attaque tant qu'il a moins de 270 min ;
 *   - k = le point de stabilisation (matchs de 90 min) ; la valeur rendue dans son championnat : r × F.
 * Les apports, sommables : apport_off = xgnp + xa − leur moyenne du poste (repli sans xG : 0,117 × tirs + 0,101 ×
 * passes clés, au-dessus de la moyenne) ; apport_def = moyenne du poste − xga. En buts par 90 minutes.
 *
 * LES PIÈGES FOTMOB : le poste est celui que la feuille a décodé (players.position → player_day.poste : grille
 * de la composition, codes de rôle, gardien seulement par la grille ou le drapeau — jamais le code 0 ; le
 * libéro, jamais vu, compte défenseur) ; l'identifiant 0 n'entre jamais (numeroFotmob de la table du jour J) ;
 * une ligne sans drapeaux « a joué » est jouée si elle a des minutes, sinon INCONNUE (ni apparition, ni « non
 * titularisé ») ; une feuille sans titulaires identifiés (moins de 9) ne fait ni vieillir ni avancer l'équipe
 * habituelle ; les dribbles (relevés depuis le 01/10/2026 seulement) ne sont jamais lus.
 *
 * LA RÈGLE DU JOUR J : le rejeu publie en FIN de journée (le patron d'AccumulateurDesForces) ; une rencontre ne
 * voit jamais son jour ; il LÈVE si une journée arrive dans le désordre. La fiche rangée la nuit vaut à partir du
 * lendemain du dernier jour de la table : celle d'une copie tronquée avant J = celle que le rejeu donne avant J
 * (l'oracle de la copie tronquée, T11).
 *
 * UN SEUL ÉCRIVAIN : le serveur, étape « fichesJoueurs » de l'actualisation (scripts/player-ratings.mjs dans le
 * bac), sous le verrou de la passe ; le calcul COMPLET dans un processus à part, base en lecture seule
 * (playerRatingsEnfant.js), puis la différence avec la table ; le serveur range par tranches courtes en rendant
 * la main. Tables (matchStatsDb.js) : player_ratings, player_ratings_teams, player_ratings_state. Jamais
 * l'horloge lue ici : « maintenant » est passé par l'appelant.
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from './matchStatsDb.js';
import { AccumulateurDesForces, reglagesDeLEmpreinte } from './forcesButs.js';
import { empreinteDesRencontres } from './teamStrength.js';
import { faitsDeLaRencontre, faitPourLesForces, matchPourLesForces, moyennesAvant, jouerUnMatch, saisonEnNombre } from '../../core/engine/goalModel.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { commencerCalculLourd, CalculLourdEnCours } from '../../utils/calculLourd.js';

// ======================================================= réglages (versionnés)

/** Forme du calcul : une table calculée par une autre version (ou d'autres réglages) est refaite entière. */
export const VERSION_FICHES = 1;

/**
 * Les composantes. `h` : demi-vie en apparitions relevées ; `k` : rétrécissement (matchs de 90 min ; la note :
 * apparitions) ; `adversaire` : 'def' (÷ D_adv) ou 'att' (÷ A_adv) ; `championnat` : ÷ F du championnat ;
 * `possession` : × 50/(100 − possession du camp) ; `attaque` : rétrécie vers 0,85 × la moyenne sous 270 min ;
 * `xg` : relevée seulement si le match est couvert en xG ; `gardiens` : seulement les gardiens.
 * Mesuré (conception § 2.2-2.4, base du bac, gain contre la moyenne du poste sur 2024-07 → 2026-09-23) : xgnp
 * 7,1 %, xa 10,0 %, tirs 10,4 %, pc 11,8 %, recup 14,0 %, duels 13,3 %, xga 7,9 %, note 6,0 % ; buts évités ≈ 0.
 * Au banc de ce module (premier calcul du 22/10/2026 : apparitions d'au moins 20 minutes, en unités corrigées —
 * l'adversaire du jour retiré des deux côtés, la fiche seule jugée) : xgnp 6,2 %, xa 9,7 %, xgot 3,8 %, tirs 9,8 %,
 * pc 11,5 %, recup 11,2 %, duels 12,3 %, xga 2,8 %, note 5,4 % ; buts évités 0.
 */
export const COMPOSANTES = Object.freeze([
  Object.freeze({ id: 'xgnp', h: 35, k: 6.95, adversaire: 'def', championnat: true, attaque: true, xg: true }),
  Object.freeze({ id: 'xa', h: 25, k: 4.6, adversaire: 'def', championnat: true, attaque: true, xg: true }),
  Object.freeze({ id: 'xgot', h: 25, k: 11.4, adversaire: 'def', championnat: true, attaque: true, xg: true }),
  Object.freeze({ id: 'tirs', h: 18, k: 5.08, adversaire: 'def', championnat: true, attaque: true }),
  Object.freeze({ id: 'pc', h: 13, k: 4.16, adversaire: 'def', championnat: true, attaque: true }),
  Object.freeze({ id: 'recup', h: 8, k: 2.6, possession: true }),
  Object.freeze({ id: 'duels', h: 8, k: 1.9, possession: true }),
  Object.freeze({ id: 'xga', h: 18, k: 15, adversaire: 'att' }),
  Object.freeze({ id: 'note', h: 10, k: 8.8, parApparition: true }),
  Object.freeze({ id: 'buts_evites', h: Infinity, k: 54.84, gardiens: true })
]);
const NC = COMPOSANTES.length;
const IX = Object.freeze(Object.fromEntries(COMPOSANTES.map((c, i) => [c.id, i])));
const ALPHA = COMPOSANTES.map((c) => (c.h === Infinity ? 1 : 2 ** (-1 / c.h)));

/** Les seuils, écrits ici (conception § 2.3, § 4). */
export const SEUILS_FICHES = Object.freeze({
  /** Une fiche est « établie » à partir de 270 minutes (le seuil de l'étape 18). */
  etablie: 270,
  /** Un titulaire sans fiche (ou sans identifiant) : 0,80 × la moyenne offensive de son poste (mesuré 0,795). */
  inconnu: 0.8,
  /** Sous 270 minutes, l'attaque est rétrécie vers 0,85 × la moyenne du poste (mesuré 0,844). */
  peuJoue: 0.85,
  /** Moyenne d'une case championnat × poste : au moins 100 matchs de 90 min sur 365 jours, sinon le poste tous championnats. */
  minimumMoyenne: 100,
  joursMoyenne: 365,
  /** Le poste dominant : minutes pondérées par poste, demi-vie 25 apparitions. */
  demiViePoste: 25,
  /** L'équipe habituelle : titularisations pondérées, demi-vie 5 feuilles du club ; une part sous 2 % est retirée. */
  demiVieHabituelle: 5,
  partMinimum: 0.02,
  /** Une feuille compte pour l'équipe habituelle avec au moins 9 titulaires identifiés. */
  titulairesMinimum: 9,
  /** Un titulaire sans sortie notée qui a joué moins de 85 min a été exclu : sa présence s'arrête à ses minutes. */
  sortieSansRemplacement: 85,
  /** Les 20 derniers points de la courbe (écran de l'étape 31). */
  courbe: 20,
  /** Les adversaires : matchs fictifs de forcesDe (étape 27). */
  prior: 8,
  /** Apport offensif « tirs » (sans xG) quand moins de la moitié de ses minutes récentes ont des xG. */
  partXgMinimum: 0.5
});

/** L'empreinte des forces qui donnent D_adv et A_adv : celle de la candidate de l'étape 27 (35 / 25, remise à zéro). */
export const EMPREINTE_ADVERSAIRES = 'v1|35|25|remise-a-zero';

/**
 * Le repli sans xG : xG hors penalty par tir et xA par passe clé, mesurés sur les lignes couvertes du magasin
 * 2023-07 → 2026-09-23 (playerRatingsBanc.coefficientsDuRepli, 22/10/2026).
 */
export const REPLI_SANS_XG = Object.freeze({ tirs: 0.117, pc: 0.101 });

/**
 * LES FACTEURS DE NIVEAU DES CHAMPIONNATS (xG hors penalty + xA par 90 d'un même joueur après / avant un
 * changement de championnat ; moindres carrés sur les log-rapports, rétrécis vers 1, ancrés sur la moyenne
 * pondérée par les minutes), appris sur le magasin 2023-07 → 2026-09-23 (playerRatingsBanc.apprendreLesFacteurs,
 * 22/10/2026) et RECOPIÉS ici. Un championnat absent : 1 (et la fiche le dit : `facteur` = 1). Plus petit = un
 * championnat plus fort (on y produit moins par 90 minutes) : 1 987 changements de championnat, 28 championnats
 * d'au moins 20 changements (League 2 → League 1 : 0,85 ; Championship → EPL : 0,66 ; Bundesliga → EPL : 0,80).
 */
export const FACTEURS_DE_CHAMPIONNAT = Object.freeze({
  'Allsvenskan - Sweden': 1.474,
  'Austrian Football Bundesliga': 1.17,
  'Belgium First Div': 1.087,
  'Brazil Série A': 0.666,
  'Bundesliga - Germany': 0.948,
  'Bundesliga 2 - Germany': 1.244,
  Championship: 0.974,
  'Denmark Superliga': 1.213,
  'Dutch Eredivisie': 1.179,
  EPL: 0.662,
  'Ekstraklasa - Poland': 1.49,
  'Eliteserien - Norway': 1.407,
  'La Liga - Spain': 0.703,
  'La Liga 2 - Spain': 0.915,
  'League 1': 1.246,
  'League 2': 1.439,
  'Liga MX': 0.881,
  'Ligue 1 - France': 0.837,
  'Ligue 2 - France': 1.129,
  MLS: 0.957,
  'Premiership - Scotland': 1.22,
  'Primeira Liga - Portugal': 0.934,
  'Primera División - Argentina': 0.831,
  'Serie A - Italy': 0.648,
  'Serie B - Italy': 1.215,
  'Super League - Greece': 0.822,
  'Swiss Superleague': 1.053,
  'Turkey Super League': 0.881
});

/**
 * L'INCLINAISON FIGÉE de la mesure à blanc (conception § 5.4) : x = off × (Δoff_dom − Δoff_ext) + def ×
 * (Δdef_dom − Δdef_ext) sur le 1N2, face à la clôture et face à la pré-clôture football-data ; tirs : la moyenne
 * de tirs × exp(tirs × Δtirs). Apprise sur le magasin 2023-10-01 → 2025-06-30 (playerRatingsBanc.mesurerAuBanc,
 * 22/10/2026 : 19 343 matchs à clôture, 11 987 à pré-clôture, 50 780 camps aux tirs), jamais réapprise la nuit.
 * Jugée sur 2025-07-01 → 2026-09-23 (K = 19) : 1N2 face à la clôture 0,00 % [−0,05 ; +0,04], face à la
 * pré-clôture 0,00 % [−0,12 ; +0,12] (pas prouvé) ; tirs +0,16 % [+0,11 ; +0,21] (retenu).
 */
export const INCLINAISON = Object.freeze({
  cloture: Object.freeze({ off: 0.113217, def: -0.144309 }),
  preCloture: Object.freeze({ off: 0.218105, def: -0.519741 }),
  tirs: 0.040335
});

/** Le RÉGLAGE VERSIONNÉ complet : son empreinte est gardée dans player_ratings_state ; changé, tout est refait. */
export const REGLAGES_FICHES = Object.freeze({
  version: VERSION_FICHES,
  composantes: COMPOSANTES.map((c) => ({ ...c, h: c.h === Infinity ? 'inf' : c.h })),
  seuils: SEUILS_FICHES,
  adversaires: EMPREINTE_ADVERSAIRES,
  repli: REPLI_SANS_XG,
  facteurs: FACTEURS_DE_CHAMPIONNAT,
  inclinaison: INCLINAISON,
  sources: Object.freeze({ demiVies: 'étape 18 (partie joueurs, magasin), remesurées 2023-07 → 2026-09-23', le: '2026-10-22' })
});

/** Les lignes d'une composition (poste de player_day : 1 gardien, 2 défenseur, 3 milieu, 4 attaquant, 5 libéro). */
export const LIGNES = Object.freeze(['gardien', 'defense', 'milieu', 'attaque']);
/** Le poste d'une ligne de player_day en ligne de composition (1-4) ; le libéro (5, jamais vu au magasin) : défense ; inconnu : null. */
export const ligneDuPoste = (poste) => (poste === 5 ? 2 : poste >= 1 && poste <= 4 ? poste : null);
/** Le poste annoncé par une composition FotMob (« Goalkeeper » … « Forward », décodé par le fournisseur) en ligne 1-4. */
export function ligneDuRoleAnnonce(role) {
  const r = String(role ?? '');
  return r === 'Goalkeeper' ? 1 : r === 'Defender' || r === 'Sweeper' ? 2 : r === 'Midfielder' ? 3 : r === 'Forward' ? 4 : null;
}

// ======================================================= petites règles (pures)

const JOUR_MS = 86_400_000;
export const numeroDuJour = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) / JOUR_MS);
export const jourIso = (n) => new Date(n * JOUR_MS).toISOString().slice(0, 10);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const nombre = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** FNV-1a 32 bits d'un texte (empreintes stables, sans module de hachage). */
function fnv(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** L'empreinte des RÉGLAGES : changés, toute la table est refaite. */
export function empreinteDesReglages(reglages = REGLAGES_FICHES) {
  return String(fnv(JSON.stringify(reglages)));
}

/** Le facteur de niveau d'un championnat (1 s'il n'est pas appris). */
export const facteurDe = (league, facteurs = FACTEURS_DE_CHAMPIONNAT) => (fini(facteurs?.[league]) && facteurs[league] > 0 ? facteurs[league] : 1);

/**
 * Les tirs ADVERSES d'une carte de tirs FotMob (texte JSON ou tableau), hors penalty, pour un camp : un
 * Float32Array [minute, xG, minute, xG…], ou null si la carte est INCOMPLÈTE — une minute manque, ou la somme
 * des xG d'un camp s'écarte de plus de 0,15 de l'xG d'équipe (`xgDom`, `xgExt` : ceux de team_day) — ou absente.
 * Rend { dom, ext } : les tirs ADVERSES du camp qui reçoit (ceux du visiteur), et ceux du visiteur.
 */
export function tirsAdversesDeLaCarte(carte, { xgDom, xgExt }) {
  let tirs = carte;
  if (typeof carte === 'string') {
    try {
      tirs = JSON.parse(carte);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(tirs) || !tirs.length || !fini(nombre(xgDom)) || !fini(nombre(xgExt))) return null;
  const dom = [];
  const ext = [];
  let sd = 0;
  let se = 0;
  for (const t of tirs) {
    const xg = nombre(t?.xg);
    if (xg === null) return null;
    if (t.side === 'home') sd += xg;
    else if (t.side === 'away') se += xg;
    else return null;
    const minute = nombre(t.minute);
    if (minute === null) return null;
    if (t.situation === 'penalty') continue;
    (t.side === 'home' ? dom : ext).push(minute, xg);
  }
  if (Math.abs(sd - Number(xgDom)) > 0.15 || Math.abs(se - Number(xgExt)) > 0.15) return null;
  // Les tirs ADVERSES : le camp qui reçoit subit ceux du visiteur.
  return { dom: Float32Array.from(ext), ext: Float32Array.from(dom) };
}

/**
 * Les xG ADVERSES (hors penalty) tirés pendant qu'un joueur est sur le terrain : présence de `debut` (0 pour un
 * titulaire, sa minute d'entrée sinon) à `fin` exclue (sa minute de sortie ; sans sortie, ses minutes s'il a
 * joué moins de 85 min — une exclusion —, sinon la fin du match, temps additionnel et prolongation compris).
 * Un tir compte si debut ≤ minute < fin. null si sa présence est inconnue (remplaçant sans minute d'entrée).
 */
export function xgaSurLeTerrain(tirsAdverses, { titulaire, entre, sorti, minutes }) {
  if (!tirsAdverses) return null;
  const debut = titulaire === 1 ? 0 : fini(nombre(entre)) && entre >= 0 ? Number(entre) : null;
  if (debut === null) return null;
  const m = nombre(minutes) ?? 0;
  const fin = fini(nombre(sorti)) && sorti >= 0 ? Number(sorti) : debut + m < SEUILS_FICHES.sortieSansRemplacement ? debut + m : Infinity;
  let s = 0;
  for (let k = 0; k < tirsAdverses.length; k += 2) if (tirsAdverses[k] >= debut && tirsAdverses[k] < fin) s += tirsAdverses[k + 1];
  return s;
}

/**
 * Les valeurs [x, d] d'une apparition JOUÉE, composante par composante (null = non relevée), CORRIGÉES :
 * `l` une ligne de player_day (colonnes brutes : xG ×1000, note ×100, buts évités ×100) ; `ctx` : possession
 * de son camp, tirs adverses minutés (ou null), D_adv, A_adv, F du championnat du match, gardien (bool).
 * Une ligne sans minutes positives : null (jamais une apparition à 0 minute).
 */
export function valeursDUneApparition(l, ctx) {
  const minutes = nombre(l.minutes);
  if (minutes === null || minutes <= 0) return null;
  const d = minutes / 90;
  const out = new Array(NC).fill(null);
  const def = fini(ctx.facteurDef) && ctx.facteurDef > 0 ? ctx.facteurDef : 1;
  const att = fini(ctx.facteurAtt) && ctx.facteurAtt > 0 ? ctx.facteurAtt : 1;
  const F = fini(ctx.facteurLigue) && ctx.facteurLigue > 0 ? ctx.facteurLigue : 1;
  const off = (v) => v / def / F;
  if (nombre(l.xgnp) !== null) out[IX.xgnp] = [off(l.xgnp / 1000), d];
  if (nombre(l.xa) !== null) out[IX.xa] = [off(l.xa / 1000), d];
  if (nombre(l.xgot) !== null) out[IX.xgot] = [off(l.xgot / 1000), d];
  if (nombre(l.tirs) !== null) out[IX.tirs] = [off(l.tirs), d];
  if (nombre(l.pc) !== null) out[IX.pc] = [off(l.pc), d];
  const poss = nombre(ctx.possession);
  const padj = poss !== null && poss > 5 && poss < 95 ? 50 / (100 - poss) : 1;
  if (nombre(l.recup) !== null) out[IX.recup] = [l.recup * padj, d];
  if (nombre(l.duels_g) !== null) out[IX.duels] = [l.duels_g * padj, d];
  const xga = xgaSurLeTerrain(ctx.tirsAdverses ?? null, { titulaire: l.titulaire, entre: l.entre_min, sorti: l.sorti_min, minutes });
  if (xga !== null) out[IX.xga] = [xga / att, d];
  if (nombre(l.note) !== null) out[IX.note] = [l.note / 100, 1];
  if (ctx.gardien && nombre(l.buts_evites) !== null) out[IX.buts_evites] = [l.buts_evites / 100, d];
  return out;
}

// ======================================================= l'état d'un joueur

// Float64Array : S et W de chaque composante, puis le reste.
const S_ = (c) => 2 * c;
const W_ = (c) => 2 * c + 1;
const POSTE = 2 * NC; // 4 postes : minutes pondérées (demi-vie 25 apparitions)
const MIN_TOT = POSTE + 4;
const APPS = MIN_TOT + 1;
const MIN_POND = APPS + 1; // minutes pondérées (demi-vie 25 apparitions)
const MIN_XG = MIN_POND + 1; // minutes pondérées des apparitions couvertes en xG
const DERNIER = MIN_XG + 1; // numéro du jour de la dernière apparition
const CLUB = DERNIER + 1; // club de la dernière apparition
const LARG = CLUB + 1;
const A_POSTE = 2 ** (-1 / SEUILS_FICHES.demiViePoste);

/** Le poste dominant (1-4) d'un état : le plus de minutes pondérées ; à égalité, le code le plus petit ; aucun : null. */
export function posteDominant(e) {
  let best = null;
  let v = 0;
  for (let p = 1; p <= 4; p++) if (e[POSTE + p - 1] > v) [best, v] = [p, e[POSTE + p - 1]];
  return best;
}

// ======================================================= moyennes glissantes (championnat × poste, 365 jours)

/** Les sommes quotidiennes d'une case, gardées 365 jours : la moyenne « avant J » de chaque composante. */
class Fenetre {
  constructor() {
    this.jours = [];
    this.sommes = [];
    this.debut = 0;
    this.total = new Float64Array(2 * NC);
  }
  ajouter(jour, sommes) {
    this.jours.push(jour);
    this.sommes.push(sommes);
    for (let i = 0; i < 2 * NC; i++) this.total[i] += sommes[i];
  }
  /** Retire ce qui précède le jour `depuis` (compris : un jour ≥ depuis reste). */
  avancer(depuis) {
    while (this.debut < this.jours.length && this.jours[this.debut] < depuis) {
      const s = this.sommes[this.debut];
      for (let i = 0; i < 2 * NC; i++) this.total[i] -= s[i];
      this.sommes[this.debut] = null;
      this.debut++;
    }
    if (this.debut > 512 && this.debut * 2 > this.jours.length) {
      this.jours = this.jours.slice(this.debut);
      this.sommes = this.sommes.slice(this.debut);
      this.debut = 0;
    }
  }
  moyenne(c) {
    const w = this.total[W_(c)];
    return w >= SEUILS_FICHES.minimumMoyenne ? this.total[S_(c)] / w : null;
  }
}

// ======================================================= le rejeu (pur : ni base, ni horloge)

/**
 * LE REJEU DES FICHES, journée après journée, publié en FIN de journée. Usage : `ajouter(rencontre)` pour chaque
 * rencontre du jour (dans l'ordre (jour, clé)), puis `finDeJournee()` ; `fiche(joueur)`, `habituelle(club)` lisent
 * ce qui est publié (jamais le jour en cours). Une rencontre : { jour (numéro), date, league, saison, matchKey,
 * home, away, attribue, ligneDom (la ligne team_day du camp qui reçoit : forces des adversaires), possession:
 * [dom, ext], tirsAdverses: { dom, ext } | null, joueurs: [lignes player_day jouées], tirsEquipe: [dom, ext] }.
 * `facteurs` : FACTEURS_DE_CHAMPIONNAT (un essai en pose d'autres) ; `avantJournee(jour, rejeu)` : appelé au
 * début de chaque journée, avant toute entrée (les mesures « avant J », les contrôles).
 */
export class RejeuDesFiches {
  constructor({ facteurs = FACTEURS_DE_CHAMPIONNAT, avantJournee = null } = {}) {
    this.facteurs = facteurs;
    this.avantJournee = avantJournee;
    this.joueurs = new Map();
    this.courbes = new Map();
    this.clubs = new Map();
    this.cases = new Map();
    this.postes = new Map();
    this.forces = new AccumulateurDesForces({ empreintes: [EMPREINTE_ADVERSAIRES] });
    this.jour = null;
    this.dernierJour = null;
    this.attente = [];
    this.rencontres = 0;
    this.apparitions = 0;
    this.ecartees = { attribuees: 0, sansMinutes: 0 };
  }

  /** L'état d'un club (créé au besoin). */
  club(id) {
    let c = this.clubs.get(id);
    if (!c) this.clubs.set(id, (c = { T: 0, feuilles: 0, parts: new Map(), league: null, tp: 0, tc: 0, tw: 0 }));
    return c;
  }

  /** Le facteur offensif (D) et défensif (A) d'un club AVANT le jour en cours (forces de la veille ; inconnu : 1). */
  facteursDe(club) {
    const e = this.forces.etat(EMPREINTE_ADVERSAIRES, club);
    if (!e) return { def: 1, att: 1 };
    const k = SEUILS_FICHES.prior;
    return { def: (e.sd + k) / (e.wd + k), att: (e.sa + k) / (e.wa + k) };
  }

  /** Une rencontre du jour (appliquée en fin de journée). */
  ajouter(m) {
    if (this.jour !== null && m.jour !== this.jour) throw new Error(`fiches : la rencontre du ${jourIso(m.jour)} arrive avant la fin de la journée du ${jourIso(this.jour)}.`);
    if (this.dernierJour !== null && m.jour <= this.dernierJour) throw new Error(`fiches : la journée du ${jourIso(m.jour)} arrive après celle du ${jourIso(this.dernierJour)} — fuite refusée, les journées s'ajoutent dans l'ordre.`);
    if (this.jour === null && this.avantJournee) this.avantJournee(m.jour, this);
    this.jour = m.jour;
    this.attente.push(m);
  }

  /** Le championnat de référence d'un club : son dernier match de championnat compté (sinon `repli`). */
  ligueDuClub(club, repli = null) {
    return this.clubs.get(club)?.league ?? repli;
  }

  /** La moyenne de la composante c pour un poste dans un championnat, « avant » le jour publié ; repli : le poste tous championnats ; sinon null. */
  moyenne(league, poste, c) {
    return this.moyennesDe(league, poste)[c];
  }

  /** Les moyennes de toutes les composantes d'un poste dans un championnat (gardées jusqu'à la journée suivante). */
  moyennesDe(league, poste) {
    const p = poste >= 1 && poste <= 4 ? poste : 3;
    const cle = `${league}|${p}`;
    this.cacheMoyennes ??= new Map();
    let out = this.cacheMoyennes.get(cle);
    if (out) return out;
    out = new Array(NC);
    const f = this.cases.get(cle);
    const g = this.postes.get(p);
    for (let c = 0; c < NC; c++) {
      const m = f?.moyenne(c);
      out[c] = m !== null && m !== undefined ? m : g?.moyenne(c) ?? null;
    }
    this.cacheMoyennes.set(cle, out);
    return out;
  }

  /** La fin de la journée : chaque apparition entre, puis les moyennes, les équipes habituelles et les forces avancent. */
  finDeJournee() {
    if (this.jour === null) return;
    const jour = this.jour;
    const sommesDuJour = new Map();
    const ajouterALaCase = (cle, c, v) => {
      let s = sommesDuJour.get(cle);
      if (!s) sommesDuJour.set(cle, (s = new Float64Array(2 * NC)));
      s[S_(c)] += v[0];
      s[W_(c)] += v[1];
    };
    const ontJoue = new Set();
    for (const m of this.attente) {
      if (m.attribue) {
        this.ecartees.attribuees++;
        continue;
      }
      this.rencontres++;
      const fH = this.facteursDe(m.home);
      const fA = this.facteursDe(m.away);
      const F = facteurDe(m.league, this.facteurs);
      const titulaires = [0, 0];
      const lignes = joueursDe(m);
      for (const l of lignes) {
        const camp = l.camp === 1 ? 1 : 0;
        if (l.titulaire === 1) titulaires[camp]++;
        const minutes = nombre(l.minutes);
        if (minutes === null || minutes <= 0) {
          this.ecartees.sansMinutes++;
          continue;
        }
        const club = camp === 1 ? m.home : m.away;
        const adv = camp === 1 ? fA : fH;
        let e = this.joueurs.get(l.joueur);
        if (!e) {
          e = new Float64Array(LARG);
          e[DERNIER] = -1;
          this.joueurs.set(l.joueur, e);
        }
        const posteJour = ligneDuPoste(l.poste);
        const gardien = posteJour === 1 || (posteJour === null && posteDominant(e) === 1);
        const vals = valeursDUneApparition(l, {
          possession: camp === 1 ? m.possession?.[0] : m.possession?.[1],
          tirsAdverses: m.tirsAdverses ? (camp === 1 ? m.tirsAdverses.dom : m.tirsAdverses.ext) : null,
          facteurDef: adv.def,
          facteurAtt: adv.att,
          facteurLigue: F,
          gardien
        });
        const posteMoyenne = posteJour ?? posteDominant(e) ?? 3;
        for (let c = 0; c < NC; c++) {
          const v = vals[c];
          if (!v) continue;
          e[S_(c)] = e[S_(c)] * ALPHA[c] + v[0];
          e[W_(c)] = e[W_(c)] * ALPHA[c] + v[1];
          // Les moyennes du poste : les mêmes valeurs corrigées, dans les unités du championnat (× F du match) ;
          // les coupes n'y entrent pas (elles mêlent des championnats de niveaux différents).
          if (m.coupe) continue;
          const vv = COMPOSANTES[c].championnat ? [v[0] * F, v[1]] : v;
          ajouterALaCase(`${m.league}|${posteMoyenne}`, c, vv);
          ajouterALaCase(`*|${posteMoyenne}`, c, vv);
        }
        for (let p = 0; p < 4; p++) e[POSTE + p] *= A_POSTE;
        if (posteJour) e[POSTE + posteJour - 1] += minutes;
        e[MIN_TOT] += minutes;
        e[APPS] += 1;
        e[MIN_POND] = e[MIN_POND] * A_POSTE + minutes;
        e[MIN_XG] = e[MIN_XG] * A_POSTE + (vals[IX.xgnp] ? minutes : 0);
        e[DERNIER] = jour;
        e[CLUB] = club;
        ontJoue.add(l.joueur);
        this.apparitions++;
      }
      // L'équipe habituelle : une feuille avec au moins 9 titulaires identifiés.
      for (const [camp, club] of [[1, m.home], [0, m.away]]) {
        const c = this.club(club);
        if (titulaires[camp] >= SEUILS_FICHES.titulairesMinimum) {
          const a = 2 ** (-1 / SEUILS_FICHES.demiVieHabituelle);
          c.T = c.T * a + 1;
          c.feuilles++;
          for (const [j, v] of c.parts) {
            v[0] *= a;
            v[1] *= a;
            if (v[0] < 1e-3 && v[1] < 1e-3) c.parts.delete(j);
          }
          for (const l of lignes) {
            if ((l.camp === 1 ? 1 : 0) !== camp || l.titulaire !== 1) continue;
            let v = c.parts.get(l.joueur);
            if (!v) c.parts.set(l.joueur, (v = [0, 0]));
            v[0] += 1;
            if (ligneDuPoste(l.poste) === 1) v[1] += 1;
          }
        }
        // Les tirs de l'équipe (la mesure à blanc du marché des tirs) : demi-vie 10, un 0-0 = non relevé.
        const t = m.tirsEquipe;
        if (t && fini(nombre(t[0])) && fini(nombre(t[1])) && !(t[0] === 0 && t[1] === 0) && !m.prolongation) {
          const a10 = 2 ** (-1 / 10);
          const pour = camp === 1 ? t[0] : t[1];
          const contre = camp === 1 ? t[1] : t[0];
          c.tp = c.tp * a10 + pour;
          c.tc = c.tc * a10 + contre;
          c.tw = c.tw * a10 + 1;
        }
        if (!m.coupe && m.compte) c.league = m.league;
      }
    }
    // Les moyennes avancent : la journée entre, ce qui a plus de 365 jours au lendemain sort.
    for (const [cle, s] of sommesDuJour) {
      const [lg, p] = [cle.slice(0, cle.lastIndexOf('|')), Number(cle.slice(cle.lastIndexOf('|') + 1))];
      const table = lg === '*' ? this.postes : this.cases;
      const k = lg === '*' ? p : cle;
      let f = table.get(k);
      if (!f) table.set(k, (f = new Fenetre()));
      f.ajouter(jour, s);
    }
    const depuis = jour + 1 - SEUILS_FICHES.joursMoyenne;
    for (const f of this.cases.values()) f.avancer(depuis);
    for (const f of this.postes.values()) f.avancer(depuis);
    this.cacheMoyennes = new Map();
    // Les forces des adversaires (le calcul de l'étape 27), publiées en fin de journée elles aussi.
    for (const m of this.attente) {
      const faits = m.ligneDom ? faitsDeLaRencontre(m.ligneDom) : null;
      if (faits) this.forces.ajouter(faits.dom, faits.ext);
    }
    this.forces.finDeJournee();
    this.attente = [];
    this.dernierJour = jour;
    this.jour = null;
    // La courbe : la fiche de chaque joueur qui a joué, telle qu'elle vaut au lendemain.
    for (const j of ontJoue) {
      const f = this.ficheEnLigne(j);
      if (!f) continue;
      let c = this.courbes.get(j);
      if (!c) this.courbes.set(j, (c = { points: new Int32Array(SEUILS_FICHES.courbe * 3), n: 0 }));
      const i = (c.n % SEUILS_FICHES.courbe) * 3;
      c.points[i] = jour;
      c.points[i + 1] = f.apport_off;
      c.points[i + 2] = f.apport_def ?? 0;
      c.n++;
    }
  }

  /**
   * LA FICHE d'un joueur, telle qu'elle vaut au lendemain du dernier jour publié, dans le championnat de son club :
   * ses composantes (rétrécies, corrigées, × F), ses apports, son poste, ses poids d'histoire. Valeurs exactes.
   */
  fiche(joueur) {
    const e = this.joueurs.get(joueur);
    if (!e) return null;
    const club = e[CLUB];
    const league = this.ligueDuClub(club, null);
    const F = facteurDe(league, this.facteurs);
    const poste = posteDominant(e);
    const posteM = poste ?? 3;
    const peuJoue = e[MIN_TOT] < SEUILS_FICHES.etablie;
    const valeurs = new Array(NC);
    const moyennes = new Array(NC);
    const lesMoyennes = this.moyennesDe(league, posteM);
    for (let c = 0; c < NC; c++) {
      const def = COMPOSANTES[c];
      const m = lesMoyennes[c];
      moyennes[c] = m;
      if (m === null) {
        valeurs[c] = e[W_(c)] > 0 ? (e[S_(c)] / e[W_(c)]) * (def.championnat ? F : 1) : null;
        continue;
      }
      const cible = (def.championnat ? m / F : m) * (def.attaque && peuJoue ? SEUILS_FICHES.peuJoue : 1);
      const r = (e[S_(c)] + def.k * cible) / (e[W_(c)] + def.k);
      valeurs[c] = def.championnat ? r * F : r;
    }
    const formuleXg = e[MIN_POND] > 0 && e[MIN_XG] >= SEUILS_FICHES.partXgMinimum * e[MIN_POND];
    const vx = (id) => valeurs[IX[id]] ?? 0;
    const mx = (id) => moyennes[IX[id]] ?? vx(id);
    const apportOff = formuleXg
      ? vx('xgnp') + vx('xa') - (mx('xgnp') + mx('xa'))
      : REPLI_SANS_XG.tirs * (vx('tirs') - mx('tirs')) + REPLI_SANS_XG.pc * (vx('pc') - mx('pc'));
    const apportDef = e[W_(IX.xga)] > 0 && moyennes[IX.xga] !== null ? moyennes[IX.xga] - valeurs[IX.xga] : 0;
    let tot = 0;
    for (let p = 0; p < 4; p++) tot += e[POSTE + p];
    return {
      joueur,
      jour: this.dernierJour === null ? null : this.dernierJour + 1,
      dernierMatch: e[DERNIER] >= 0 ? e[DERNIER] : null,
      club,
      league,
      facteur: F,
      poste,
      partPoste: poste && tot > 0 ? e[POSTE + poste - 1] / tot : null,
      apparitions: e[APPS],
      minutes: e[MIN_TOT],
      etablie: !peuJoue,
      formule: formuleXg ? 'xg' : 'tirs',
      valeurs,
      moyennes,
      poids: { xg: e[W_(IX.xgnp)], tirs: e[W_(IX.tirs)], def: e[W_(IX.recup)], xga: e[W_(IX.xga)], note: e[W_(IX.note)], gardien: e[W_(IX.buts_evites)] },
      apportOff,
      apportDef
    };
  }

  /** La fiche ARRONDIE, telle que la table la range (entiers : par 90 ×1000, poids ×100) ; ce que lit forceDuOnze. */
  ficheEnLigne(joueur) {
    const f = this.fiche(joueur);
    return f ? ligneDeFiche(f) : null;
  }

  /** Les sommes brutes d'un joueur (le contrôle anti-fuite) : S, W de chaque composante, minutes, apparitions. */
  sommes(joueur) {
    const e = this.joueurs.get(joueur);
    return e ? { s: Array.from({ length: NC }, (_, c) => e[S_(c)]), w: Array.from({ length: NC }, (_, c) => e[W_(c)]), minutes: e[MIN_TOT], apparitions: e[APPS] } : null;
  }

  /** L'équipe habituelle d'un club, telle que la table la range : [[joueur, part ×1000, part gardien ×1000, ligne]] (parts ≥ 2 %). */
  habituelle(club) {
    const c = this.clubs.get(club);
    if (!c || c.T <= 0) return null;
    const parts = [];
    for (const [j, v] of [...c.parts].sort((a, b) => a[0] - b[0])) {
      const part = v[0] / c.T;
      if (part < SEUILS_FICHES.partMinimum) continue;
      const partGk = v[1] / c.T;
      const e = this.joueurs.get(j);
      const ligne = partGk > part / 2 ? 1 : (e ? posteDominant(e) : null) ?? 3;
      parts.push([j, Math.round(part * 1000), Math.round(partGk * 1000), ligne === 1 && partGk <= part / 2 ? 3 : ligne]);
    }
    // Aucune part d'au moins 2 % : pas d'équipe habituelle (comme une table sans ligne pour ce club).
    if (!parts.length) return null;
    const gardien = parts.filter((p) => p[3] === 1).sort((a, b) => b[2] - a[2] || a[0] - b[0])[0]?.[0] ?? null;
    return { club, league: c.league, feuilles: c.feuilles, parts, gardien };
  }

  /** Les moyennes offensives de chaque ligne dans un championnat (×1000) : ce que vaut un titulaire inconnu. */
  moyennesOffensives(league) {
    return [1, 2, 3, 4].map((p) => {
      const a = this.moyenne(league, p, IX.xgnp);
      const b = this.moyenne(league, p, IX.xa);
      return Math.round(((a ?? 0) + (b ?? 0)) * 1000);
    });
  }
}

/** Une fiche (exacte) → la ligne de player_ratings (entiers), sans la courbe ni les percentiles. */
export function ligneDeFiche(f) {
  const v = (id) => (f.valeurs[IX[id]] === null || f.valeurs[IX[id]] === undefined ? null : Math.round(f.valeurs[IX[id]] * 1000));
  const p = (x) => Math.round((x ?? 0) * 100);
  return {
    joueur: f.joueur,
    jour: f.jour === null ? null : jourIso(f.jour),
    dernier_match: f.dernierMatch === null ? null : jourIso(f.dernierMatch),
    club: f.club || null,
    league: f.league ?? null,
    poste: f.poste ?? null,
    part_poste: f.partPoste === null ? null : Math.round(f.partPoste * 100),
    apparitions: f.apparitions,
    minutes: Math.round(f.minutes),
    etablie: f.etablie ? 1 : 0,
    formule: f.formule,
    facteur: Math.round(f.facteur * 1000),
    xgnp: v('xgnp'),
    xa: v('xa'),
    xgot: v('xgot'),
    tirs: v('tirs'),
    pc: v('pc'),
    recup: v('recup'),
    duels: v('duels'),
    xga: v('xga'),
    note: v('note'),
    buts_evites: v('buts_evites'),
    w_xg: p(f.poids.xg),
    w_tirs: p(f.poids.tirs),
    w_def: p(f.poids.def),
    w_xga: p(f.poids.xga),
    w_note: p(f.poids.note),
    w_gardien: p(f.poids.gardien),
    apport_off: Math.round(f.apportOff * 1000),
    apport_def: Math.round(f.apportDef * 1000)
  };
}

// ======================================================= la force du onze (pure)

/**
 * LA FORCE DU ONZE d'un camp (pure ; la même pour le rejeu, le banc et le lecteur de la page du match) :
 *   titulaires  [{ joueur (numéro FotMob), ligne (1-4 ou null : sa fiche le dit) }] — ceux qu'on sait identifier ;
 *   inconnus    [{ ligne }] — titulaires sans identifiant, ou sans fiche : 0,80 × la moyenne offensive du poste ;
 *   fiches      Map joueur → ligne de player_ratings (apport_off, apport_def ×1000, poste, etablie) ;
 *   habituelle  { parts: [[joueur, part ×1000, part gardien ×1000, ligne]], gardien } (player_ratings_teams) ;
 *   moyennesOff [gardien, défense, milieu, attaque] ×1000 (moy_off de player_ratings_teams).
 * Rend, par ligne et au total, l'apport offensif d'AUJOURD'HUI, celui de l'équipe HABITUELLE et l'ÉCART (buts par
 * 90 min) ; l'apport défensif (moyenne des 11) de même ; les inconnus, les non établis, la somme des parts des
 * habituels absents, le gardien habituel aligné ou non. Le gardien n'a pas d'apport offensif.
 */
export function forceDuOnze({ titulaires = [], inconnus = [], fiches = new Map(), habituelle = null, moyennesOff = [0, 0, 0, 0] } = {}) {
  const off = [0, 0, 0, 0, 0];
  let defSomme = 0;
  let defN = 0;
  let nonEtablis = 0;
  let nInconnus = 0;
  const dansLeOnze = new Set();
  const inconnu = (ligne) => {
    nInconnus++;
    const l = ligne >= 1 && ligne <= 4 ? ligne : 3;
    if (l !== 1) off[l] += Math.round((SEUILS_FICHES.inconnu - 1) * (moyennesOff[l - 1] ?? 0));
    defN++;
  };
  for (const t of titulaires) {
    const f = t.joueur === null || t.joueur === undefined ? null : fiches.get(Number(t.joueur));
    if (!f) {
      inconnu(t.ligne);
      continue;
    }
    dansLeOnze.add(Number(t.joueur));
    const l = t.ligne >= 1 && t.ligne <= 4 ? t.ligne : f.poste >= 1 && f.poste <= 4 ? f.poste : 3;
    if (l !== 1) off[l] += f.apport_off;
    defSomme += f.apport_def ?? 0;
    defN++;
    if (!f.etablie) nonEtablis++;
  }
  for (const i of inconnus) inconnu(i?.ligne ?? null);
  const hOff = [0, 0, 0, 0, 0];
  let hDefSomme = 0;
  let hDefPoids = 0;
  let absents = 0;
  let gardienHabituel = null;
  for (const [j, part, partGk, ligne] of habituelle?.parts ?? []) {
    const f = fiches.get(j);
    if (!f) continue;
    const l = partGk * 2 > part ? 1 : ligne >= 1 && ligne <= 4 ? ligne : 3;
    if (l !== 1) hOff[l] += (part * f.apport_off) / 1000;
    hDefSomme += part * (f.apport_def ?? 0);
    hDefPoids += part;
    if (!dansLeOnze.has(j)) absents += part;
  }
  if (habituelle?.gardien !== null && habituelle?.gardien !== undefined) gardienHabituel = dansLeOnze.has(Number(habituelle.gardien));
  // En buts par 90 minutes, à 1/10 000 près (les entrées sont des millièmes : rien de perdu à l'affichage).
  const k = (x) => Math.round(x * 10) / 10_000;
  const lignes = {};
  for (let l = 1; l <= 4; l++) {
    lignes[LIGNES[l - 1]] = { aujourdhui: k(off[l]), habituel: habituelle ? k(hOff[l]) : null, ecart: habituelle ? k(off[l] - hOff[l]) : null };
  }
  const offAuj = off[2] + off[3] + off[4];
  const offHab = hOff[2] + hOff[3] + hOff[4];
  const defAuj = defN ? defSomme / defN : 0;
  const defHab = hDefPoids ? hDefSomme / hDefPoids : 0;
  return {
    lignes,
    offensif: { aujourdhui: k(offAuj), habituel: habituelle ? k(offHab) : null, ecart: habituelle ? k(offAuj - offHab) : null },
    defensif: { aujourdhui: k(defAuj), habituel: habituelle ? k(defHab) : null, ecart: habituelle ? k(defAuj - defHab) : null },
    titulaires: titulaires.length + inconnus.length,
    inconnus: nInconnus,
    nonEtablis,
    absents: habituelle ? k(absents) : null,
    gardienHabituel
  };
}

// ======================================================= la lecture de la base (en flux, lecture seule)

/**
 * Les lignes JOUÉES de player_day en COLONNES TYPÉES (1,7 million de lignes : ~70 Mo hors du tas, au lieu de
 * ~350 Mo d'objets), rangées par rencontre puis par joueur. `vide` : la valeur d'une case NULL de chaque colonne.
 */
const COLONNES_JOUEUR = Object.freeze({
  joueur: [Int32Array, 0],
  camp: [Int8Array, 0],
  titulaire: [Int8Array, -1],
  poste: [Int8Array, 0],
  minutes: [Int16Array, -1],
  note: [Int16Array, -32768],
  tirs: [Int16Array, -1],
  pc: [Int16Array, -1],
  recup: [Int16Array, -1],
  duels_g: [Int16Array, -1],
  xgnp: [Int32Array, -1],
  xa: [Int32Array, -1],
  xgot: [Int32Array, -1],
  buts_evites: [Int16Array, -32768],
  entre_min: [Int16Array, -1],
  sorti_min: [Int16Array, -1]
});
const NOMS_JOUEUR = Object.keys(COLONNES_JOUEUR);

class ColonnesJoueur {
  constructor(capacite = 1 << 16) {
    this.n = 0;
    this.capacite = capacite;
    this.rencontre = new Int32Array(capacite);
    for (const [k, [T]] of Object.entries(COLONNES_JOUEUR)) this[k] = new T(capacite);
  }
  ajouter(r) {
    if (this.n === this.capacite) {
      const c = this.capacite * 2;
      for (const k of ['rencontre', ...NOMS_JOUEUR]) {
        const t = new this[k].constructor(c);
        t.set(this[k]);
        this[k] = t;
      }
      this.capacite = c;
    }
    const i = this.n++;
    this.rencontre[i] = r.rencontre;
    for (const k of NOMS_JOUEUR) {
      const v = r[k];
      const vide = COLONNES_JOUEUR[k][1];
      this[k][i] = v === null || v === undefined ? vide : v;
    }
  }
  /** La ligne i en objet (colonnes de player_day, NULL rendu null) — un objet de passage, le temps d'un match. */
  ligne(i) {
    const o = {};
    for (const k of NOMS_JOUEUR) {
      const v = this[k][i];
      o[k] = v === COLONNES_JOUEUR[k][1] && k !== 'joueur' && k !== 'camp' && k !== 'poste' ? null : v;
    }
    if (o.poste === 0) o.poste = null;
    return o;
  }
}

/**
 * LES RENCONTRES de la table du jour J, prêtes pour le rejeu, dans l'ordre (jour, clé) : registre, ligne du camp
 * qui reçoit (forces), possession et tirs des deux camps, tirs adverses minutés, et les lignes de leurs joueurs
 * JOUÉS (`colonnes` partagées, `ordre[debut..fin)` pour la rencontre, rangées par joueur). Générateur (rend la
 * liste à la fin). `de`, `a` : bornes de jours comprises (null : toute la table).
 */
export function* chargerLesRencontres(database, { de = null, a = null } = {}) {
  const bornes = [];
  const ou = [];
  if (de) {
    ou.push('d.date >= ?');
    bornes.push(de);
  }
  if (a) {
    ou.push('d.date <= ?');
    bornes.push(a);
  }
  const where = ou.length ? `WHERE ${ou.join(' AND ')}` : '';
  const rencontres = [];
  const parId = new Map();
  const parCle = new Map();
  const st = database.prepare(`SELECT d.rencontre, d.match_key AS matchKey, d.date, d.league, d.saison, d.home, d.away,
      h.camp, h.club, h.adversaire, h.attribue, h.prolongation, h.compte, h.coupe, h.bp, h.bc, h.bp90, h.bc90, h.xg_p, h.xg_c,
      h.tirs_p, h.tirs_c, h.possession_p AS poss_dom, a.possession_p AS poss_ext
    FROM day_matches d JOIN team_day h ON h.rencontre = d.rencontre AND h.camp = 1 JOIN team_day a ON a.rencontre = d.rencontre AND a.camp = 0
    ${where} ORDER BY d.date, d.match_key`);
  let n = 0;
  for (const r of st.iterate(...bornes)) {
    const m = {
      rencontre: r.rencontre,
      matchKey: r.matchKey,
      jour: numeroDuJour(r.date),
      date: r.date,
      league: r.league,
      saison: r.saison,
      home: r.home,
      away: r.away,
      attribue: r.attribue === 1,
      prolongation: r.prolongation === 1,
      compte: r.compte === 1,
      coupe: r.coupe === 1,
      ligneDom: { matchKey: r.matchKey, rencontre: r.rencontre, camp: 1, club: r.club, adversaire: r.adversaire, date: r.date, league: r.league, saison: r.saison, attribue: r.attribue, prolongation: r.prolongation, compte: r.compte, coupe: r.coupe, bp: r.bp, bc: r.bc, bp90: r.bp90, bc90: r.bc90, xg_p: r.xg_p, xg_c: r.xg_c },
      possession: [r.poss_dom, r.poss_ext],
      tirsEquipe: [r.tirs_p, r.tirs_c],
      tirsAdverses: null,
      colonnes: null,
      ordre: null,
      debut: 0,
      fin: 0
    };
    rencontres.push(m);
    parId.set(r.rencontre, m);
    parCle.set(r.matchKey, m);
    if (++n % 5000 === 0) yield 'rencontres';
  }
  // Les joueurs JOUÉS (joue = 1), en colonnes typées ; colonnes brutes (xG ×1000, note ×100) ; les dribbles ne sont
  // jamais lus. Lues dans l'ordre de la clé (joueur, jour, rencontre) : rangées ensuite par rencontre, le joueur
  // restant croissant dans chaque rencontre.
  const colonnes = new ColonnesJoueur();
  const pj = database.prepare(`SELECT joueur, rencontre, camp, titulaire, poste, minutes, note, tirs, pc, recup, duels_g, xgnp, xa, xgot, buts_evites, entre_min, sorti_min
    FROM player_day WHERE joue = 1 ${de ? 'AND date >= ?' : ''} ${a ? 'AND date <= ?' : ''}`);
  n = 0;
  for (const l of pj.iterate(...bornes)) {
    if (parId.has(l.rencontre)) colonnes.ajouter(l);
    if (++n % 20000 === 0) yield 'joueurs';
  }
  const indexDe = new Map(rencontres.map((m, i) => [m.rencontre, i]));
  const compte = new Int32Array(rencontres.length + 1);
  for (let i = 0; i < colonnes.n; i++) compte[indexDe.get(colonnes.rencontre[i]) + 1]++;
  for (let k = 1; k <= rencontres.length; k++) compte[k] += compte[k - 1];
  const ordre = new Int32Array(colonnes.n);
  const place = compte.slice(0, rencontres.length);
  for (let i = 0; i < colonnes.n; i++) ordre[place[indexDe.get(colonnes.rencontre[i])]++] = i;
  rencontres.forEach((m, k) => {
    m.colonnes = colonnes;
    m.ordre = ordre;
    m.debut = compte[k];
    m.fin = compte[k + 1];
  });
  yield 'joueurs';
  // Les cartes de tirs : les tirs adverses minutés, hors penalty, si la carte est complète.
  const sc = database.prepare(`SELECT match_key, shotmap FROM matches WHERE shotmap IS NOT NULL ${de ? 'AND date >= ?' : ''} ${a ? 'AND date <= ?' : ''}`);
  n = 0;
  for (const r of sc.iterate(...bornes)) {
    const m = parCle.get(r.match_key);
    if (m && !m.prolongation) m.tirsAdverses = tirsAdversesDeLaCarte(r.shotmap, { xgDom: m.ligneDom.xg_p, xgExt: m.ligneDom.xg_c });
    if (++n % 1000 === 0) yield 'cartes';
  }
  return rencontres;
}

/**
 * Les lignes de joueurs d'une rencontre, en objets de passage : `m.joueurs` quand l'appelant les donne (un essai),
 * sinon tirées des colonnes partagées (chargerLesRencontres), rangées par joueur.
 */
export function joueursDe(m) {
  if (Array.isArray(m.joueurs)) return m.joueurs;
  if (!m.colonnes) return [];
  const out = new Array(m.fin - m.debut);
  for (let k = m.debut; k < m.fin; k++) out[k - m.debut] = m.colonnes.ligne(m.ordre[k]);
  return out;
}

/** Rejoue des rencontres (générateur) : `rejeu` reçoit chaque journée dans l'ordre. */
export function* rejouer(rejeu, rencontres, { pas = 50 } = {}) {
  let dernier = null;
  let i = 0;
  for (const m of rencontres) {
    if (dernier !== null && m.jour !== dernier) rejeu.finDeJournee();
    dernier = m.jour;
    rejeu.ajouter(m);
    if (++i % pas === 0) yield 'rejeu';
  }
  rejeu.finDeJournee();
}

// ======================================================= le calcul (processus à part, lecture seule)

/**
 * L'empreinte de la table du jour J que lisent les fiches — rien de changé, rien à refaire : celle des rencontres
 * (par compétition et par mois : clé, mise à jour, jour, clubs ; l'empreinte de l'indice de force, étape 29), les
 * comptes de la table (lignes de joueurs comprises) et le repère des fusions d'identité (une fusion réécrit
 * player_day sans toucher aux rencontres). Jamais une heure : une horloge figée ou recalée ne cache rien.
 */
export function empreinteDeLaTable(database) {
  let etat = {};
  try {
    etat = Object.fromEntries(database.prepare("SELECT cle, valeur FROM day_state WHERE cle IN ('version', 'comptes', 'repere_merges')").all().map((r) => [r.cle, r.valeur]));
  } catch {
    etat = {};
  }
  let rencontres = null;
  try {
    rencontres = empreinteDesRencontres(database);
  } catch {
    rencontres = null;
  }
  return { version: etat.version ?? null, comptes: etat.comptes ?? null, fusions: etat.repere_merges ?? null, rencontres };
}

/** Les percentiles (0-100, plus haut = mieux) des apports dans chaque championnat × poste, parmi les fiches établies. */
function percentiles(lignes) {
  const groupes = new Map();
  for (const l of lignes) {
    if (!l.etablie || !l.league || !l.poste) continue;
    const cle = `${l.league}|${l.poste}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(l);
  }
  for (const g of groupes.values()) {
    for (const col of ['apport_off', 'apport_def']) {
      const vals = g.map((l) => l[col]).sort((x, y) => x - y);
      for (const l of g) {
        let bas = 0;
        let haut = vals.length;
        while (bas < haut) {
          const mi = (bas + haut) >> 1;
          if (vals[mi] < l[col]) bas = mi + 1;
          else haut = mi;
        }
        let egaux = 0;
        for (let k = bas; k < vals.length && vals[k] === l[col]; k++) egaux++;
        const pct = vals.length > 1 ? Math.round((100 * (bas + (egaux - 1) / 2)) / (vals.length - 1)) : 50;
        l[col === 'apport_off' ? 'pct_off' : 'pct_def'] = Math.max(0, Math.min(100, pct));
      }
    }
  }
}

/** Les colonnes rangées de player_ratings et de player_ratings_teams, dans l'ordre de la table. */
export const COLONNES_FICHE = Object.freeze([
  'joueur', 'jour', 'dernier_match', 'club', 'league', 'poste', 'part_poste', 'apparitions', 'minutes', 'etablie', 'formule', 'facteur',
  'xgnp', 'xa', 'xgot', 'tirs', 'pc', 'recup', 'duels', 'xga', 'note', 'buts_evites',
  'w_xg', 'w_tirs', 'w_def', 'w_xga', 'w_note', 'w_gardien', 'apport_off', 'apport_def', 'pct_off', 'pct_def', 'courbe', 'reglages'
]);
export const COLONNES_EQUIPE = Object.freeze(['club', 'jour', 'league', 'feuilles', 'habituels', 'moy_off', 'hab_off', 'hab_def', 'gardien', 'reglages']);

/** Les lignes ACTUELLES (fiches et équipes) d'un rejeu fini : ce que la table doit contenir. */
export function lignesActuelles(rejeu, { reglages = empreinteDesReglages() } = {}) {
  const fiches = [];
  for (const j of [...rejeu.joueurs.keys()].sort((a, b) => a - b)) {
    const l = rejeu.ficheEnLigne(j);
    if (!l) continue;
    const c = rejeu.courbes.get(j);
    if (c) {
      const pts = [];
      const nb = Math.min(c.n, SEUILS_FICHES.courbe);
      for (let k = c.n - nb; k < c.n; k++) {
        const i = (k % SEUILS_FICHES.courbe) * 3;
        pts.push([jourIso(c.points[i]), c.points[i + 1], c.points[i + 2]]);
      }
      l.courbe = JSON.stringify(pts);
    } else l.courbe = null;
    l.pct_off = null;
    l.pct_def = null;
    l.reglages = reglages;
    fiches.push(l);
  }
  percentiles(fiches);
  const parJoueur = new Map(fiches.map((f) => [f.joueur, f]));
  const equipes = [];
  for (const club of [...rejeu.clubs.keys()].sort((a, b) => a - b)) {
    const h = rejeu.habituelle(club);
    if (!h || !h.parts.length) continue;
    const moy = rejeu.moyennesOffensives(h.league);
    const force = forceDuOnze({ titulaires: [], fiches: parJoueur, habituelle: h, moyennesOff: moy });
    equipes.push({
      club,
      jour: rejeu.dernierJour === null ? null : jourIso(rejeu.dernierJour + 1),
      league: h.league,
      feuilles: h.feuilles,
      habituels: JSON.stringify(h.parts),
      moy_off: JSON.stringify(moy),
      hab_off: Math.round((force.offensif.habituel ?? 0) * 1000),
      hab_def: Math.round((force.defensif.habituel ?? 0) * 1000),
      gardien: h.gardien,
      reglages
    });
  }
  return { fiches, equipes };
}

/** Les lignes rangées (fiches ou équipes), en flux, dans l'ordre de la clé. */
function* lignesRangees(database, table, cle, colonnes) {
  try {
    yield* database.prepare(`SELECT ${colonnes.join(', ')} FROM ${table} ORDER BY ${cle}`).iterate();
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
}

/** La différence entre ce qui est calculé (rangé par clé) et ce qui est rangé : { ecrire: [...], retirer: [clés] }. */
function* difference(database, table, cle, colonnes, calculees) {
  const ecrire = [];
  const retirer = [];
  const flux = lignesRangees(database, table, cle, colonnes);
  let s = flux.next();
  let i = 0;
  let n = 0;
  while (i < calculees.length || !s.done) {
    const kc = i < calculees.length ? calculees[i][cle] : Infinity;
    const ks = !s.done ? s.value[cle] : Infinity;
    if (kc < ks) {
      ecrire.push(calculees[i++]);
    } else if (ks < kc) {
      retirer.push(ks);
      s = flux.next();
    } else {
      const c = calculees[i++];
      const r = s.value;
      s = flux.next();
      if (colonnes.some((k) => (c[k] ?? null) !== (r[k] ?? null))) ecrire.push(c);
    }
    if (++n % 5000 === 0) yield 'différence';
  }
  return { ecrire, retirer };
}

/** Un générateur de nombres à graine (mulberry32). */
function tirage(graine) {
  let a = graine >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Le contrôle anti-fuite de la nuit : couples (joueur, J) recalculés par le second chemin, tolérance relative. */
export const CONTROLE = Object.freeze({ lignes: 40, tolerance: 1e-9 });

/**
 * Les couples du contrôle, tirés avec la graine AVANT le rejeu parmi les apparitions chargées : (joueur, J = le
 * jour d'une de ses apparitions) ; le rejeu en garde l'état « avant J » (au début de la journée J).
 */
export function couplesDuControle(rencontres, graine, lignes = CONTROLE.lignes) {
  const u = tirage(graine);
  const couples = [];
  const vus = new Set();
  const avecJoueurs = rencontres.filter((m) => !m.attribue && (Array.isArray(m.joueurs) ? m.joueurs.length : m.fin - m.debut) > 0);
  for (let essai = 0; essai < lignes * 30 && couples.length < lignes && avecJoueurs.length; essai++) {
    const m = avecJoueurs[Math.floor(u() * avecJoueurs.length)];
    const js = joueursDe(m);
    const l = js[Math.floor(u() * js.length)];
    if (!(Number(l.minutes) > 0)) continue;
    const cle = `${l.joueur}|${m.jour}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    couples.push({ joueur: l.joueur, jour: m.jour });
  }
  return couples;
}

/** Les lignes d'un joueur relues en SQL, date < J écrit en toutes lettres, avec ce que la rencontre dit d'elles. */
function lignesDuJoueurEnSql(database, joueur, J) {
  return database
    .prepare(`SELECT p.*, d.match_key, d.league, d.home, d.away, t.attribue, t.prolongation, t.coupe, t.possession_p, h.xg_p AS xg_dom, h.xg_c AS xg_ext
      FROM player_day p JOIN day_matches d ON d.rencontre = p.rencontre
      JOIN team_day t ON t.rencontre = p.rencontre AND t.camp = p.camp
      JOIN team_day h ON h.rencontre = p.rencontre AND h.camp = 1
      WHERE p.joueur = ? AND p.date < ? AND p.joue = 1 ORDER BY p.date, d.match_key`)
    .all(joueur, jourIso(J));
}

/**
 * LES FORCES DES ADVERSAIRES PAR LE SECOND CHEMIN : pour chaque club demandé, ses faits relus UNE fois en SQL
 * (team_day, date < le plus tardif des jours demandés), les journées de ses championnats refaites en SQL, puis
 * jouerUnMatch dans l'ordre (les fonctions pures de l'étape 27, jamais l'accumulateur du rejeu) ; l'état « avant
 * chaque jour demandé » est noté au passage. `demandes` : Map club → Set de jours (AAAA-MM-JJ). Rend Map
 * `${club}|${jour}` → état (ou null).
 */
export function etatsDesAdversairesEnSql(database, demandes, liguesSql = new Map()) {
  const reglages = reglagesDeLEmpreinte(EMPREINTE_ADVERSAIRES);
  const out = new Map();
  const faitsParClub = new Map();
  const lire = database.prepare(`SELECT t.*, d.match_key AS matchKey FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre
    WHERE t.club = ? AND t.date < ? ORDER BY t.date, d.match_key`);
  for (const [club, jours] of demandes) {
    const max = [...jours].sort().at(-1);
    faitsParClub.set(club, lire.all(club, max));
  }
  const ligues = new Set();
  for (const faits of faitsParClub.values()) for (const r of faits) ligues.add(r.league);
  const manquantes = [...ligues].filter((l) => !liguesSql.has(l));
  if (manquantes.length) {
    for (const l of manquantes) liguesSql.set(l, []);
    for (let i = 0; i < manquantes.length; i += 200) {
      const lot = manquantes.slice(i, i + 200);
      const lignes = database
        .prepare(`SELECT h.league, h.date AS jour, h.saison, COUNT(*) AS n,
                    SUM(CASE WHEN h.prolongation = 1 THEN COALESCE(h.bp90, 0) ELSE h.bp END) AS bd,
                    SUM(CASE WHEN h.prolongation = 1 THEN COALESCE(h.bc90, 0) ELSE h.bc END) AS be,
                    SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN 1 ELSE 0 END) AS nx,
                    SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN h.xg_p ELSE 0 END) AS xd,
                    SUM(CASE WHEN h.prolongation = 0 AND h.xg_p IS NOT NULL AND h.xg_c IS NOT NULL THEN h.xg_c ELSE 0 END) AS xe
                  FROM team_day h WHERE h.camp = 1 AND h.attribue = 0 AND h.compte = 1 AND h.league IN (${lot.map(() => '?').join(', ')})
                  GROUP BY h.league, h.date, h.saison ORDER BY h.league, h.date`)
        .all(...lot);
      for (const r of lignes) liguesSql.get(r.league).push({ jour: r.jour, saison: r.saison, n: r.n, bd: r.bd, be: r.be, nx: r.nx, xd: r.xd, xe: r.xe });
    }
  }
  for (const [club, jours] of demandes) {
    const voulus = [...jours].sort();
    const faits = faitsParClub.get(club);
    let etat = null;
    let k = 0;
    for (const r of faits) {
      while (k < voulus.length && voulus[k] <= r.date) out.set(`${club}|${voulus[k++]}`, etat);
      const f = faitPourLesForces(r);
      if (!f) continue;
      const L = moyennesAvant(liguesSql.get(f.league) ?? [], { jour: f.jour, saison: saisonEnNombre(f.saison) });
      etat = jouerUnMatch(etat, matchPourLesForces(f, L), reglages);
    }
    while (k < voulus.length) out.set(`${club}|${voulus[k++]}`, etat);
  }
  return out;
}

/**
 * LE SECOND CHEMIN : les sommes d'un joueur « avant J », refaites depuis ses seules lignes relues en SQL (date < J
 * écrit en toutes lettres) ; pour chaque apparition, la possession de son camp, la carte de tirs du match et les
 * forces de l'adversaire refaites en SQL (etatsDesAdversairesEnSql : date < le jour du match). Aucune donnée du
 * rejeu. `lignes` et `etats` : déjà relus (le contrôle les relit pour tous ses couples d'un coup).
 */
export function sommesParLeSecondChemin({ database, joueur, J, facteurs = FACTEURS_DE_CHAMPIONNAT, lignes = null, etats = null }) {
  const lues = lignes ?? lignesDuJoueurEnSql(database, joueur, J);
  let parAdversaire = etats;
  if (!parAdversaire) {
    const demandes = new Map();
    for (const l of lues) {
      const adv = l.camp === 1 ? l.away : l.home;
      if (!demandes.has(adv)) demandes.set(adv, new Set());
      demandes.get(adv).add(l.date);
    }
    parAdversaire = etatsDesAdversairesEnSql(database, demandes);
  }
  const carte = database.prepare('SELECT shotmap FROM matches WHERE match_key = ?');
  const s = new Array(NC).fill(0);
  const w = new Array(NC).fill(0);
  let minutesTot = 0;
  let apparitions = 0;
  let posteDom = new Float64Array(4);
  for (const l of lues) {
    if (l.attribue === 1 || !(Number(l.minutes) > 0)) continue;
    const camp = l.camp === 1 ? 1 : 0;
    const adversaire = camp === 1 ? l.away : l.home;
    const etat = parAdversaire.get(`${adversaire}|${l.date}`) ?? null;
    const k = SEUILS_FICHES.prior;
    const adv = etat ? { def: (etat.sd + k) / (etat.wd + k), att: (etat.sa + k) / (etat.wa + k) } : { def: 1, att: 1 };
    const brut = l.prolongation === 1 ? null : carte.get(l.match_key)?.shotmap ?? null;
    const tirs = brut ? tirsAdversesDeLaCarte(brut, { xgDom: l.xg_dom, xgExt: l.xg_ext }) : null;
    const posteJour = ligneDuPoste(l.poste);
    let dominant = null;
    let v0 = 0;
    for (let p = 1; p <= 4; p++) if (posteDom[p - 1] > v0) [dominant, v0] = [p, posteDom[p - 1]];
    const gardien = posteJour === 1 || (posteJour === null && dominant === 1);
    const vals = valeursDUneApparition(l, { possession: l.possession_p, tirsAdverses: tirs ? (camp === 1 ? tirs.dom : tirs.ext) : null, facteurDef: adv.def, facteurAtt: adv.att, facteurLigue: facteurDe(l.league, facteurs), gardien });
    for (let c = 0; c < NC; c++) {
      if (!vals[c]) continue;
      s[c] = s[c] * ALPHA[c] + vals[c][0];
      w[c] = w[c] * ALPHA[c] + vals[c][1];
    }
    for (let p = 0; p < 4; p++) posteDom[p] *= A_POSTE;
    if (posteJour) posteDom[posteJour - 1] += Number(l.minutes);
    minutesTot += Number(l.minutes);
    apparitions++;
  }
  return { s, w, minutes: minutesTot, apparitions };
}

/**
 * Le contrôle (générateur) : pour chaque instantané { joueur, jour, sommes } gardé par le rejeu au début de la
 * journée J, les sommes refaites par le second chemin — les lignes de tous les joueurs relues d'abord, puis les
 * forces de tous leurs adversaires en une passe par club. Rend { graine, lignes, ecarts: [{ joueur, J, colonne,
 * attendu, lu }] }.
 */
export function* controleDesInstantanes(database, instantanes, graine = null) {
  const lues = [];
  const demandes = new Map();
  for (const c of instantanes) {
    const lignes = lignesDuJoueurEnSql(database, c.joueur, c.jour);
    lues.push(lignes);
    for (const l of lignes) {
      const adv = l.camp === 1 ? l.away : l.home;
      if (!demandes.has(adv)) demandes.set(adv, new Set());
      demandes.get(adv).add(l.date);
    }
    yield 'contrôle';
  }
  const etats = etatsDesAdversairesEnSql(database, demandes);
  yield 'contrôle';
  const ecarts = [];
  instantanes.forEach((c, i) => {
    const attendu = sommesParLeSecondChemin({ database, joueur: c.joueur, J: c.jour, lignes: lues[i], etats });
    for (const x of ecartsDeSommes(attendu, c.sommes)) ecarts.push({ joueur: c.joueur, J: jourIso(c.jour), ...x });
  });
  return { graine, lignes: instantanes.length, ecarts };
}

/** Les écarts entre deux jeux de sommes (relatifs, à `tolerance` près) : [{ colonne, attendu, lu }]. */
export function ecartsDeSommes(attendu, lu, tolerance = CONTROLE.tolerance) {
  const out = [];
  if (!attendu || !lu) {
    if ((attendu?.apparitions ?? 0) || (lu?.apparitions ?? 0)) out.push({ colonne: 'ligne', attendu: attendu ? 'des sommes' : 'aucune', lu: lu ? 'des sommes' : 'aucune' });
    return out;
  }
  const proche = (a, b) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  if (attendu.apparitions !== lu.apparitions) out.push({ colonne: 'apparitions', attendu: attendu.apparitions, lu: lu.apparitions });
  if (!proche(attendu.minutes, lu.minutes)) out.push({ colonne: 'minutes', attendu: attendu.minutes, lu: lu.minutes });
  for (let c = 0; c < NC; c++) {
    if (!proche(attendu.s[c], lu.s[c])) out.push({ colonne: `S.${COMPOSANTES[c].id}`, attendu: attendu.s[c], lu: lu.s[c] });
    if (!proche(attendu.w[c], lu.w[c])) out.push({ colonne: `W.${COMPOSANTES[c].id}`, attendu: attendu.w[c], lu: lu.w[c] });
  }
  return out;
}

/**
 * LE CALCUL, sur une base ouverte EN LECTURE SEULE (le processus à part, un script, un essai) : l'empreinte de la
 * table du jour J et des réglages — rien de changé depuis `precedente` → { rien: true } ; sinon le rejeu COMPLET,
 * les lignes actuelles, la différence avec la table rangée, le contrôle anti-fuite (graine du jour) et la mesure à
 * blanc depuis le lancement (`depuis`, playerRatingsBanc.js). Générateur. Rend { rien, empreinte, fiches: {
 * ecrire, retirer }, equipes: { ecrire, retirer }, jusqua, controle, mesure, bilan }.
 */
export function* calculerLesFiches({ database, precedente = null, force = false, graine = null, depuis = null, mesureABlanc = null, jusqua = null } = {}) {
  const debut = performance.now();
  const empreinte = { table: empreinteDeLaTable(database), reglages: empreinteDesReglages(), version: VERSION_FICHES, depuis: depuis ?? null };
  yield 'empreinte';
  if (!force && precedente && JSON.stringify(precedente) === JSON.stringify(empreinte)) return { rien: true, empreinte, dureeMs: Math.round(performance.now() - debut) };
  const rencontres = yield* chargerLesRencontres(database, { a: jusqua });
  const tLecture = performance.now();
  const couples = graine !== null ? couplesDuControle(rencontres, graine) : [];
  const parJour = new Map();
  for (const c of couples) {
    if (!parJour.has(c.jour)) parJour.set(c.jour, []);
    parJour.get(c.jour).push(c);
  }
  const instantanes = [];
  const mesure = mesureABlanc ? mesureABlanc({ depuis, database }) : null;
  const rejeu = new RejeuDesFiches({
    avantJournee: (jour, r) => {
      for (const c of parJour.get(jour) ?? []) instantanes.push({ ...c, sommes: r.sommes(c.joueur) });
      if (mesure) mesure.avantJournee(jour, r);
    }
  });
  if (mesure) mesure.attacher(rencontres);
  yield* rejouer(rejeu, rencontres);
  const tRejeu = performance.now();
  const { fiches, equipes } = lignesActuelles(rejeu);
  yield 'lignes';
  const df = yield* difference(database, 'player_ratings', 'joueur', COLONNES_FICHE, fiches);
  const de = yield* difference(database, 'player_ratings_teams', 'club', COLONNES_EQUIPE, equipes);
  const tDifference = performance.now();
  let controle = null;
  if (couples.length) {
    controle = yield* controleDesInstantanes(database, instantanes, graine);
  }
  const tControle = performance.now();
  return {
    rien: false,
    empreinte,
    fiches: df,
    equipes: de,
    nFiches: fiches.length,
    nEquipes: equipes.length,
    jusqua: rejeu.dernierJour === null ? null : jourIso(rejeu.dernierJour),
    controle,
    mesure: mesure ? mesure.resultat() : null,
    bilan: {
      rencontres: rejeu.rencontres,
      apparitions: rejeu.apparitions,
      ecartees: rejeu.ecartees,
      joueurs: rejeu.joueurs.size,
      etablies: fiches.filter((f) => f.etablie).length,
      clubs: equipes.length,
      ecrire: df.ecrire.length + de.ecrire.length,
      retirer: df.retirer.length + de.retirer.length,
      dureeMs: Math.round(performance.now() - debut),
      parties: { lecture: Math.round(tLecture - debut), rejeu: Math.round(tRejeu - tLecture), difference: Math.round(tDifference - tRejeu), controle: Math.round(tControle - tDifference) }
    }
  };
}

// ======================================================= le processus à part

const ENFANT = fileURLToPath(new URL('./playerRatingsEnfant.js', import.meta.url));
/** Le calcul complet prend ~1 min sur la base du bac : au-delà de 20 min, l'enfant est arrêté. */
export const DELAI_CALCUL_MS = 20 * 60_000;
/** La mémoire de l'enfant : tas plafonné (les lignes de joueurs vivent hors du tas). */
export const OPTIONS_DE_L_ENFANT = Object.freeze(['--max-old-space-size=768', '--max-semi-space-size=16']);
/** Lignes par morceau renvoyé par l'enfant : jamais un gros message à décoder d'un bloc. */
export const LIGNES_PAR_MORCEAU = 2000;

/**
 * Le calcul dans un PROCESSUS À PART (le patron des étapes 27 et 29) : fork de playerRatingsEnfant.js, base en
 * LECTURE SEULE. Un calcul lourd à la fois (utils/calculLourd.js) : un autre en cours, rejet CalculLourdEnCours
 * (reporté). Rend une promesse de la réponse de calculerLesFiches.
 */
export function calculerAPart({ chemin, precedente = null, force = false, graine = null, depuis = null, delaiMs = DELAI_CALCUL_MS }) {
  let rendre;
  try {
    rendre = commencerCalculLourd('fiches joueurs');
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let fini = false;
    let erreurs = '';
    const morceaux = { fiches: [], equipes: [] };
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
        morceaux[m.morceau.table].push(...m.morceau.lignes);
        return;
      }
      clearTimeout(minuterie);
      if (fini) return;
      fini = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else if (m.rien) resolve(m);
      else resolve({ ...m, fiches: { ecrire: morceaux.fiches, retirer: m.fiches.retirer }, equipes: { ecrire: morceaux.equipes, retirer: m.equipes.retirer } });
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
    enfant.send({ chemin, precedente, force, graine, depuis });
  }).finally(rendre);
}

// ======================================================= l'état et le rangement (le serveur, seul écrivain)

const json = (t) => {
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
};

/** L'ÉTAT des fiches (player_ratings_state), tel que l'écrit le dernier rangement — JAMAIS de calcul ni d'écriture. */
export function etatDesFiches({ database = openDb() } = {}) {
  let brut = null;
  try {
    brut = Object.fromEntries(database.prepare('SELECT cle, valeur FROM player_ratings_state').all().map((r) => [r.cle, r.valeur]));
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  const version = brut?.version ? Number(brut.version) : null;
  const absent = !brut || version === null || !brut.calcule_le;
  return {
    absent,
    version,
    versionAttendue: VERSION_FICHES,
    reglages: brut?.reglages ?? null,
    reglagesAttendus: empreinteDesReglages(),
    empreinte: json(brut?.empreinte),
    jusqua: brut?.jusqua || null,
    calculeLe: brut?.calcule_le ?? null,
    enCours: brut?.en_cours ?? null,
    bilan: json(brut?.bilan),
    controle: json(brut?.controle),
    mesure: json(brut?.mesure),
    banc: json(brut?.banc),
    aJour: !absent && version === VERSION_FICHES && brut?.reglages === empreinteDesReglages() && !brut?.en_cours
  };
}

function annuler(database) {
  try {
    if (database.isTransaction !== false) database.exec('ROLLBACK');
  } catch {
    // aucune transaction ouverte
  }
}

/** Lignes écrites (ou retirées) par transaction : quelques dizaines de ms au plus. */
export const TRANCHE_RANGEMENT = 250;

/**
 * RANGE un calcul (générateur ; le serveur ou le script du bac, sous le verrou de la passe) : `en_cours` posé, les
 * retraits puis les écritures par tranches de `tranche`, une transaction chacune, JAMAIS ouverte pendant un point
 * d'arrêt, enfin l'état. `maintenant` : une fonction qui rend l'heure (ISO), OBLIGATOIRE. Rend { ecrites, retirees,
 * plusLongueTrancheMs }.
 */
export function* rangerLesFiches({ database, calcul, maintenant, tranche = TRANCHE_RANGEMENT }) {
  if (typeof maintenant !== 'function') throw new Error('rangerLesFiches : « maintenant » (une fonction qui rend l’heure) est obligatoire.');
  const etat = database.prepare('INSERT OR REPLACE INTO player_ratings_state (cle, valeur) VALUES (?, ?)');
  etat.run('en_cours', maintenant());
  yield 'en cours';
  let ecrites = 0;
  let retirees = 0;
  let plusLongueMs = 0;
  function* parTranches(ordres) {
    let k = 0;
    let t0 = performance.now();
    database.exec('BEGIN IMMEDIATE');
    try {
      for (const ordre of ordres) {
        ordre();
        if (++k % tranche === 0) {
          database.exec('COMMIT');
          plusLongueMs = Math.max(plusLongueMs, performance.now() - t0);
          yield 'rangement';
          t0 = performance.now();
          database.exec('BEGIN IMMEDIATE');
        }
      }
      database.exec('COMMIT');
      plusLongueMs = Math.max(plusLongueMs, performance.now() - t0);
    } catch (error) {
      annuler(database);
      throw error;
    }
  }
  const retirerFiche = database.prepare('DELETE FROM player_ratings WHERE joueur = ?');
  const retirerEquipe = database.prepare('DELETE FROM player_ratings_teams WHERE club = ?');
  const ecrireFiche = database.prepare(`INSERT OR REPLACE INTO player_ratings (${COLONNES_FICHE.join(', ')}) VALUES (${COLONNES_FICHE.map(() => '?').join(', ')})`);
  const ecrireEquipe = database.prepare(`INSERT OR REPLACE INTO player_ratings_teams (${COLONNES_EQUIPE.join(', ')}) VALUES (${COLONNES_EQUIPE.map(() => '?').join(', ')})`);
  yield* parTranches((calcul.fiches?.retirer ?? []).map((j) => () => (retirees += retirerFiche.run(j).changes)));
  yield* parTranches((calcul.equipes?.retirer ?? []).map((c) => () => (retirees += retirerEquipe.run(c).changes)));
  yield* parTranches((calcul.fiches?.ecrire ?? []).map((l) => () => {
    ecrireFiche.run(...COLONNES_FICHE.map((k) => l[k] ?? null));
    ecrites++;
  }));
  yield* parTranches((calcul.equipes?.ecrire ?? []).map((l) => () => {
    ecrireEquipe.run(...COLONNES_EQUIPE.map((k) => l[k] ?? null));
    ecrites++;
  }));
  database.exec('BEGIN IMMEDIATE');
  try {
    etat.run('version', String(VERSION_FICHES));
    etat.run('reglages', empreinteDesReglages());
    etat.run('empreinte', JSON.stringify(calcul.empreinte ?? null));
    etat.run('jusqua', calcul.jusqua ?? '');
    etat.run('calcule_le', maintenant());
    etat.run('bilan', JSON.stringify({ ...(calcul.bilan ?? {}), ecrites, retirees }));
    if (calcul.controle) etat.run('controle', JSON.stringify({ ...calcul.controle, le: maintenant() }));
    if (calcul.mesure) etat.run('mesure', JSON.stringify({ ...calcul.mesure, le: maintenant() }));
    database.prepare("DELETE FROM player_ratings_state WHERE cle = 'en_cours'").run();
    database.exec('COMMIT');
  } catch (error) {
    annuler(database);
    throw error;
  }
  return { ecrites, retirees, plusLongueTrancheMs: Math.round(plusLongueMs) };
}

/** La graine du contrôle d'une nuit : son jour, AAAAMMJJ (UTC). */
export const graineDuJour = (instant) => Number(new Date(instant).toISOString().slice(0, 10).replace(/-/g, ''));

/**
 * LA PASSE DE NUIT (étape « fichesJoueurs » de l'actualisation ; scripts/player-ratings.mjs dans le bac), SOUS le
 * verrou : l'état, puis le PROCESSUS À PART attendu sans tenir la main (rien de changé : rien ; sinon le calcul
 * complet, la différence, le contrôle, la mesure à blanc), puis le rangement par tranches. Un autre calcul lourd
 * en cours : « reporte » ; en échec : rien d'avancé. `maintenant` OBLIGATOIRE ; `depuis` : le jour du lancement
 * de l'étape 30 (la mesure à blanc ne lit que les matchs d'après), null tant qu'elle n'est pas lancée.
 */
export async function fichesDesJoueurs({
  force = false,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_CALCUL_MS,
  rendreLaMain = rendreLaMainParDefaut,
  maintenant,
  depuis = null,
  controle = true,
  mesureABlanc = null
} = {}) {
  if (typeof maintenant !== 'function') throw new Error('fichesDesJoueurs : « maintenant » (une fonction qui rend l’heure) est obligatoire.');
  const debut = performance.now();
  const pauses = creerPauses({ rendreLaMain });
  const etat = etatDesFiches({ database });
  const precedente = !force && !etat.absent && !etat.enCours && etat.aJour ? etat.empreinte : null;
  const graine = controle ? graineDuJour(maintenant()) : null;
  let r;
  try {
    r = aPart
      ? await pauses.attendre(calculerAPart({ chemin, precedente, force, graine, depuis, delaiMs }), 'calcul à part')
      : await executerEnRendantLaMain(calculerLesFiches({ database, precedente, force, graine, depuis, mesureABlanc }), pauses.siLongtemps);
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) return { mode: 'reporte', raison: error.message, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
    return { mode: 'echec', erreur: String(error?.message ?? error), dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  if (r.rien) return { mode: 'rien', calculeLe: etat.calculeLe, jusqua: etat.jusqua, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  const tRangement = performance.now();
  let range;
  try {
    range = await executerEnRendantLaMain(rangerLesFiches({ database, calcul: r, maintenant }), pauses.siLongtemps);
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error)}`, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  }
  return {
    mode: etat.absent ? 'premier' : 'complet',
    fiches: r.nFiches,
    equipes: r.nEquipes,
    ecrites: range.ecrites,
    retirees: range.retirees,
    plusLongueTrancheMs: range.plusLongueTrancheMs,
    jusqua: r.jusqua,
    controle: r.controle,
    mesure: r.mesure,
    bilanDuCalcul: r.bilan,
    rangementMs: Math.round(performance.now() - tRangement),
    dureeMs: Math.round(performance.now() - debut),
    ...pauses.bilan()
  };
}

// ======================================================= la lecture (écran, page du match)

const numeroDe = (id) => {
  const m = /^(?:fotmob-)?([1-9]\d*)$/.exec(String(id ?? ''));
  return m ? Number(m[1]) : null;
};

/** Les fiches rangées de quelques joueurs (identifiants « fotmob-123 » ou numéros) : Map numéro → ligne. */
export function lireFiches(ids, { database = openDb() } = {}) {
  const numeros = [...new Set((ids ?? []).map(numeroDe).filter((n) => n !== null))];
  const out = new Map();
  if (!numeros.length) return out;
  try {
    for (let i = 0; i < numeros.length; i += 500) {
      const lot = numeros.slice(i, i + 500);
      for (const r of database.prepare(`SELECT ${COLONNES_FICHE.join(', ')} FROM player_ratings WHERE joueur IN (${lot.map(() => '?').join(', ')})`).all(...lot)) out.set(r.joueur, { ...r });
    }
  } catch (error) {
    if (!/no such table/i.test(String(error?.message ?? ''))) throw error;
  }
  return out;
}

/** L'équipe habituelle rangée d'un club : { club, jour, league, feuilles, parts, moyennesOff, gardien, habOff, habDef } ou null. */
export function lireEquipeHabituelle(club, { database = openDb() } = {}) {
  const n = numeroDe(club);
  if (n === null) return null;
  let r;
  try {
    r = database.prepare(`SELECT ${COLONNES_EQUIPE.join(', ')} FROM player_ratings_teams WHERE club = ?`).get(n);
  } catch (error) {
    if (/no such table/i.test(String(error?.message ?? ''))) return null;
    throw error;
  }
  if (!r) return null;
  return { club: r.club, jour: r.jour, league: r.league, feuilles: r.feuilles, parts: json(r.habituels) ?? [], moyennesOff: json(r.moy_off) ?? [0, 0, 0, 0], gardien: r.gardien ?? null, habOff: r.hab_off, habDef: r.hab_def };
}

/**
 * LA FORCE DU ONZE d'une composition décrite (lineupContext.js : FotMob ou dernière alignée) : `equipe` = {
 * teamId, startXI: [{ id, position }] } ; lue dans les tables (deux lectures par clé), jamais calculée au-delà de
 * la somme. null si les fiches n'ont jamais été calculées ou si le club n'a pas d'équipe habituelle.
 */
export function forceDuOnzeDeLaComposition(equipe, { database = openDb() } = {}) {
  if (!equipe?.teamId || !Array.isArray(equipe.startXI) || !equipe.startXI.length) return null;
  const etat = etatDesFiches({ database });
  if (etat.absent) return null;
  const habituelle = lireEquipeHabituelle(equipe.teamId, { database });
  if (!habituelle) return null;
  const titulaires = [];
  const inconnus = [];
  for (const j of equipe.startXI) {
    const joueur = numeroDe(j?.id);
    const ligne = ligneDuRoleAnnonce(j?.position);
    if (joueur === null) inconnus.push({ ligne });
    else titulaires.push({ joueur, ligne });
  }
  const fiches = lireFiches([...titulaires.map((t) => t.joueur), ...habituelle.parts.map((p) => p[0])], { database });
  const force = forceDuOnze({ titulaires, inconnus, fiches, habituelle, moyennesOff: habituelle.moyennesOff });
  return { ...force, notesDu: habituelle.jour, calculeLe: etat.calculeLe, aJour: etat.aJour, source: 'fiches des joueurs (étape 30)', regle: 'affichage seulement : jamais dans les chiffres du moteur' };
}

/** La lecture pour la route (étape 31) : une fiche, les fiches d'un club, ou d'un championnat × poste. */
export function lireLesFiches({ database = openDb(), joueur = null, club = null, league = null, poste = null, limite = 200 } = {}) {
  const decode = (r) => ({ ...r, courbe: json(r.courbe) });
  if (joueur !== null) {
    const n = numeroDe(joueur);
    if (n === null) throw new Error(`identifiant de joueur illisible : « ${joueur} »`);
    const r = lireFiches([n], { database }).get(n);
    return r ? { fiche: decode(r) } : { fiche: null };
  }
  if (club !== null) {
    const n = numeroDe(club);
    if (n === null) throw new Error(`identifiant de club illisible : « ${club} »`);
    const fiches = database.prepare(`SELECT ${COLONNES_FICHE.join(', ')} FROM player_ratings WHERE club = ? ORDER BY apport_off DESC`).all(n).map(decode);
    return { fiches, habituelle: lireEquipeHabituelle(n, { database }) };
  }
  if (league !== null) {
    const p = poste === null ? null : Number(poste);
    const fiches = database
      .prepare(`SELECT ${COLONNES_FICHE.join(', ')} FROM player_ratings WHERE league = ? ${p ? 'AND poste = ?' : ''} AND etablie = 1 ORDER BY apport_off DESC LIMIT ?`)
      .all(...[league, ...(p ? [p] : []), Math.max(1, Math.min(1000, Number(limite) || 200))])
      .map(decode);
    return { fiches };
  }
  return { fiches: [] };
}

export const __pourLesTests = Object.freeze({ IX, NC, ALPHA, Fenetre, LARG, POSTE, MIN_TOT, CLUB });
