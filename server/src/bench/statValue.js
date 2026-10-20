/**
 * statValue.js — LA VALEUR DE CHAQUE STATISTIQUE (étape 18 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Pour chaque statistique d'équipe et de joueur, ce qu'elle vaut VRAIMENT,
 * mesuré sur la table du jour J (étape 17) — jamais une valeur « du moment » :
 *
 *   - FIABILITÉ : les matchs d'une équipe (les apparitions d'un joueur) d'un
 *     même championnat et d'une même saison, coupés en deux moitiés
 *     ALTERNÉES (1er, 3e, 5e… contre 2e, 4e, 6e… : une équipe qui change en
 *     cours de saison change dans les deux moitiés à la fois) ; on regarde si
 *     les deux moitiés racontent la même chose (corrélation r entre les
 *     moyennes des moitiés). r est la fiabilité d'UNE moitié : celle de
 *     l'ensemble se déduit par la formule de SPEARMAN-BROWN, 2r / (1 + r) —
 *     sans elle, la fiabilité est sous-estimée (deux fois moins de matchs) ;
 *   - POINT DE STABILISATION : le nombre de matchs n* à partir duquel la
 *     statistique est plus signal que bruit (fiabilité 0,5). Avec une moitié
 *     de k matchs de fiabilité r, Spearman-Brown donne n* = k (1 − r) / r ;
 *     la fiabilité d'une fenêtre de n matchs est n ρ / (1 + (n − 1) ρ), ρ la
 *     fiabilité d'un seul match ;
 *   - POUVOIR PRÉDICTIF : la statistique, sur les matchs d'AVANT le jour J,
 *     annonce-t-elle les buts, les points ou les corners du match J ? Mesuré
 *     par la corrélation AU SEIN du championnat (et de la saison) entre la
 *     statistique d'avant et la cible du match, et jugé par le juge de
 *     l'étape 16 (guard.js) : la prévision « moyenne du championnat + écart
 *     de l'équipe » fait-elle mieux que la seule moyenne du championnat, sur
 *     des matchs JAMAIS utilisés pour le calcul (postérieurs à lui) ;
 *   - DEMI-VIE : à quelle vitesse un match ancien perd de son poids. Une
 *     moyenne pondérée où le match d'il y a h matchs compte moitié moins que
 *     le dernier ; h est choisi sur la période de calcul (la grille
 *     DEMI_VIES, ∞ = tous les matchs comptent autant), avec sa fourchette ;
 *   - FENÊTRE CONSEILLÉE : les n derniers matchs (grille FENETRES) qui
 *     annoncent le mieux la cible sur la période de calcul ; jugée face aux
 *     10 d'aujourd'hui (STAT_SAMPLE, statInputsRead.js) sur la période de
 *     jugement. Les 10 sont CONFIRMÉS sauf si le juge retient l'autre
 *     fenêtre au-delà du hasard. Rien n'est branché : le moteur ne change
 *     pas (étape 33 après le banc) ;
 *   - LA FENÊTRE DU MOTEUR (corners, tirs, tirs cadrés) : la même question
 *     dans les termes exacts du moteur — attendu = facteur de terrain ×
 *     (pour de l'équipe + contre de l'adversaire) / 2 (statExpectations de
 *     statMarkets.js), loi binomiale négative du moteur (STAT_KINDS), perte
 *     log du compte réalisé (celle du banc) —, seule la fenêtre change. Les
 *     10 matchs recalculés ici sont comparés aux colonnes f10 de la table du
 *     jour J (le contrôle du bilan : 0 écart attendu).
 *
 * LES RISQUES, TRAITÉS UN PAR UN :
 *   - AU SEIN D'UN CHAMPIONNAT : toute corrélation se calcule sur des écarts
 *     à la moyenne du groupe (championnat × saison ; joueurs : × poste) puis
 *     se met en commun. Mélanger les championnats ferait passer leur NIVEAU
 *     pour de la fiabilité (une équipe de Ligue 1 tire plus qu'une équipe de
 *     National, chaque semaine) : un faux effet, qui disparaît ici ;
 *   - LES ZÉROS « NON RELEVÉ » : au magasin (FotMob), un 0 des deux côtés
 *     d'un compte (tirs, cadrés, corners, fautes, occasions, jaunes) est « non
 *     relevé » (paireRelevee), et les rouges ne comptent que si les jaunes le
 *     sont (cartonsReleves : les jaunes à 0 de 20 compétitions en 2026). Chez
 *     football-data, une case vide est « non publié » et un 0 un vrai 0
 *     (paireFd). Pour les joueurs, la table du jour J a déjà mis à NULL ce
 *     qui n'est pas couvert (xG, xGOT, cartons) : NULL = non relevé ;
 *   - LES JOUEURS : tout est ramené à 90 minutes (somme des actions / somme
 *     des minutes × 90 : une apparition de 5 minutes pèse 5 minutes), avec un
 *     MINIMUM DE MINUTES : 450 par moitié (cinq matchs pleins), 270 avant un
 *     match pour prévoir (trois matchs pleins) ;
 *   - PAS DE FUITE : la règle du jour J de l'étape 17 — une ligne ne voit que
 *     les matchs d'un jour STRICTEMENT antérieur (deux matchs le même jour ne
 *     se voient pas) ; le parcours LÈVE si l'ordre du temps est rompu ;
 *   - HORS ÉCHANTILLON : le calcul (fiabilité, stabilisation, demi-vie,
 *     fenêtre, pentes) se fait sur la période de calcul ; le jugement, sur
 *     des matchs POSTÉRIEURS. Magasin : calcul P4a (2024-07-01 → 2025-06-30),
 *     jugement P4b + P5 (depuis le 2025-07-01). football-data : calcul P1
 *     (2000 → 2019, « réservée aux étapes qui apprennent ») et jugement P2
 *     (2019-07-01 → 2023-06-30, jamais vue). P3 (le magasin neuf, 2023 →
 *     06/2024) n'est jamais une cible ni une moitié : elle reste propre pour
 *     les preuves des étapes 27 et 29 (elle sert seulement d'histoire aux
 *     fenêtres des matchs de P4a) ;
 *   - LES DONNÉES DÉJÀ VUES : chaque jugement compte ses matchs dans les
 *     fenêtres déclarées (fenetresDeclarees de lancements.js) ; un jugement
 *     dont des matchs sont déjà vus est INDICATIF (la fenêtre de 10 a été
 *     réglée sur 07/2024 → 09/2026 : sur P4b, elle joue à domicile). Le même
 *     jugement est refait sur les seuls matchs jamais vus quand ils sont
 *     assez nombreux (200 blocs) ;
 *   - LE NOMBRE DE CASES : chaque famille de jugements (fenêtre, demi-vie,
 *     pouvoir, fenêtre du moteur) est corrigée pour le NOMBRE de lignes du
 *     tableau jugées (variantes = ce nombre, comme la carte de l'étape 23) ;
 *   - STAT_SAMPLE n'est PAS touché (statInputsRead.js, fichier du moteur) :
 *     une fenêtre proposée ne vaut rien avant le banc et l'accord de Pierre.
 *
 * VERDICT (« ce qui prédit / ce qui trompe », affiché à l'étape 31) :
 *   « compte » (vert)   le juge retient la statistique face à la moyenne du
 *                       championnat, et la borne basse du gain dépasse 1 % de
 *                       l'erreur (SEUIL_GAIN_UTILE) ;
 *   « faible »          retenue, mais le gain prouvé est sous 1 % ;
 *   « trompe » (rouge)  pas prouvée (ou moins bonne) : ses valeurs passées
 *                       n'annoncent rien des matchs suivants au-delà du hasard ;
 *   « pas-assez »       trop peu de matchs pour juger.
 *
 * OÙ ÇA TOURNE. Chez Pierre : À LA MAIN, dans le serveur, sous le verrou de
 * l'actualisation (withRefreshLock, nom « valeur-des-stats »), par
 * POST /api/bench/stat-value/run — jamais chaque nuit : la demi-vie et la
 * fenêtre conseillée seront des PARAMÈTRES des étapes 27, 29 et 30 ; un calcul
 * qui changerait tout seul chaque mois changerait leurs chiffres sans
 * nouvelle version du moteur. Le calcul rend la main toutes les ~25 ms
 * (travailCooperatif.js), les grosses comparaisons partent dans le fil du
 * juge (jugeAPart.js). Dans le bac : scripts/stat-value.mjs.
 *
 * ÉCRIT : les tables stat_value_runs (un calcul : un INSERT au lancement, un
 * UPDATE à la fin) et stat_value (une ligne par statistique × échelle ×
 * source), par la base de l'APPELANT — ce module n'ouvre jamais de base.
 * LU par les étapes 27, 29, 30 : lireParametresStatistique (plus bas).
 * -----------------------------------------------------------------------
 */

import { faitsDepuisFd, paireRelevee, cartonsReleves, CONSTANTES } from '../data/db/dayTable.js';
import { paireFd } from '../data/db/leagueBenchmarks.js';
import { comparer, generateur, LignesInvalides } from './guard.js';
import { lignesDuJuge } from './jugeAPart.js';
import { fenetresDeclarees, VUES_DE_L_ETAPE_18 } from './lancements.js';
import { BORNES_DES_TRANCHES } from './periodes.js';
import { PROBA_MIN } from './metrics.js';
import { statExpectations, STAT_KINDS, loiDesComptes } from '../sports/football/statMarkets.js';
import { creerPauses, executerSansPause, executerEnRendantLaMain } from '../utils/travailCooperatif.js';

// ======================================================= réglages, écrits ici

/** Forme du calcul : deux calculs de versions différentes ne se comparent pas. */
export const VERSION_VALEUR_STATS = 1;
/** La fenêtre d'aujourd'hui (statInputsRead.STAT_SAMPLE, recopiée et testée par l'étape 17) et son minimum. */
export const FENETRE_ACTUELLE = CONSTANTES.fenetre;
export const MINIMUM_ACTUEL = CONSTANTES.minimumFenetre;
/** Les fenêtres essayées (en matchs ; joueurs : en apparitions), jusqu'à deux saisons. */
export const FENETRES = Object.freeze([3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 38, 50, 76]);
/** La fenêtre du MOTEUR : jusqu'à 38 relevés (il lit au plus 30 rencontres relevées à domicile et 30 à l'extérieur). */
export const FENETRES_MOTEUR = Object.freeze([3, 5, 6, 8, 10, 12, 15, 20, 25, 30, 38]);
/** Les demi-vies essayées (en matchs ; Infinity = aucune décroissance, tous les matchs comptent autant). */
export const DEMI_VIES = Object.freeze([2, 3, 4, 6, 8, 10, 13, 18, 25, 35, 50, Infinity]);
/**
 * Les seuils : une moitié d'équipe = 8 matchs de championnat (16 par équipe-saison, ce qu'ont presque
 * toutes les saisons, même les demi-saisons des championnats à l'année civile) ; un joueur : 450 minutes
 * par moitié, 270 minutes d'histoire avant un match pour le prévoir ; l'histoire d'une équipe : les 6
 * relevés du moteur (STAT_MIN_SAMPLE).
 */
export const SEUILS = Object.freeze({ moitieEquipe: 8, minutesMoitie: 450, minutesHistoire: 270, histoireEquipe: MINIMUM_ACTUEL });
/** « compte » : la borne basse du gain prouvé dépasse 1 % de l'erreur de la seule moyenne du championnat. */
export const SEUIL_GAIN_UTILE = 0.01;
/** Le moteur lit au plus 30 rencontres relevées à domicile et 30 à l'extérieur (statInputsRead.moyennesEquipe). */
export const CANDIDATS_PAR_COTE = CONSTANTES.candidatsParCote;

/**
 * Les deux périodes de chaque source (bornes comprises, jours UTC), tirées des tranches du banc
 * (periodes.js) : le calcul AVANT, le jugement APRÈS. `a: null` = jusqu'au dernier jour de la table.
 */
export const PERIODES_DU_CALCUL = Object.freeze({
  magasin: Object.freeze({
    calcul: Object.freeze({ de: BORNES_DES_TRANCHES.P4a.de, a: BORNES_DES_TRANCHES.P4a.a, tranches: Object.freeze(['P4a']) }),
    jugement: Object.freeze({ de: BORNES_DES_TRANCHES.P4b.de, a: null, tranches: Object.freeze(['P4b', 'P5']) })
  }),
  'football-data': Object.freeze({
    calcul: Object.freeze({ de: BORNES_DES_TRANCHES.P1.de, a: BORNES_DES_TRANCHES.P1.a, tranches: Object.freeze(['P1']) }),
    jugement: Object.freeze({ de: BORNES_DES_TRANCHES.P2.de, a: BORNES_DES_TRANCHES.P2.a, tranches: Object.freeze(['P2']) })
  })
});

/**
 * Ce que l'étape 18 a REGARDÉ, pour les étapes qui liront sa demi-vie ou sa fenêtre (27, 29, 30) : à
 * recopier dans les `vues` de leur lancement (lancements.js), avec la portée de ce que l'étape lectrice règle.
 * Défini dans lancements.js depuis le 19/10 (le lancement de l'étape 29 le lit, et lancements.js ne peut pas
 * lire ce fichier) ; ses jours sont ceux de PERIODES_DU_CALCUL — un test vérifie qu'ils restent égaux.
 */
export { VUES_DE_L_ETAPE_18 };

// ======================================================= le catalogue

const SOURCES = Object.freeze(['magasin', 'football-data']);
const MAGASIN = Object.freeze(['magasin']);

/** Les cibles d'équipe : ce qu'une statistique doit annoncer (le même mot partout). */
export const CIBLES_EQUIPE = Object.freeze({
  buts_pour: 'les buts marqués',
  buts_contre: 'les buts encaissés',
  points: 'les points',
  corners_pour: 'les corners obtenus',
  corners_contre: 'les corners concédés',
  tirs_pour: 'les tirs',
  tirs_contre: 'les tirs concédés',
  cadres_pour: 'les tirs cadrés',
  cadres_contre: 'les tirs cadrés concédés',
  fautes_pour: 'les fautes commises',
  fautes_contre: 'les fautes subies',
  jaunes_pour: 'les cartons jaunes reçus',
  jaunes_contre: 'les cartons jaunes de l’adversaire',
  rouges_pour: 'les cartons rouges reçus',
  rouges_contre: 'les cartons rouges de l’adversaire'
});
/** Les cibles que tout le tableau d'équipe regarde aussi (« annonce-t-elle les buts, les points ou les corners ? »). */
export const AUTRES_CIBLES_EQUIPE = Object.freeze(['buts_pour', 'buts_contre', 'points', 'corners_pour', 'corners_contre']);

const st = (id, libelle, cible, sources = SOURCES) => Object.freeze({ id, libelle, cible, sources });
/**
 * Les statistiques d'équipe. `cible` : ce qu'elle doit annoncer — les buts pour l'attaque, les buts
 * encaissés pour la défense, les points pour ce qui résume un match, et la statistique elle-même pour ce
 * qui est un marché (corners, cartons, fautes). `sources` : football-data n'a ni xG, ni grosses occasions,
 * ni possession.
 */
export const STATISTIQUES_EQUIPE = Object.freeze([
  st('buts_pour', 'Buts marqués', 'buts_pour'),
  st('buts_contre', 'Buts encaissés', 'buts_contre'),
  st('points', 'Points pris', 'points'),
  st('diff_buts', 'Différence de buts', 'points'),
  st('xg_pour', 'xG créés', 'buts_pour', MAGASIN),
  st('xg_contre', 'xG concédés', 'buts_contre', MAGASIN),
  st('diff_xg', 'Différence de xG', 'points', MAGASIN),
  st('finition_pour', 'Finition : buts marqués moins xG', 'buts_pour', MAGASIN),
  st('finition_contre', 'Buts encaissés moins xG concédés', 'buts_contre', MAGASIN),
  st('tirs_pour', 'Tirs', 'buts_pour'),
  st('tirs_contre', 'Tirs concédés', 'buts_contre'),
  st('diff_tirs', 'Différence de tirs', 'points'),
  st('cadres_pour', 'Tirs cadrés', 'buts_pour'),
  st('cadres_contre', 'Tirs cadrés concédés', 'buts_contre'),
  st('diff_cadres', 'Différence de tirs cadrés', 'points'),
  st('occasions_pour', 'Grosses occasions', 'buts_pour', MAGASIN),
  st('occasions_contre', 'Grosses occasions concédées', 'buts_contre', MAGASIN),
  st('possession', 'Possession', 'points', MAGASIN),
  st('corners_pour', 'Corners obtenus', 'corners_pour'),
  st('corners_contre', 'Corners concédés', 'corners_contre'),
  st('fautes_pour', 'Fautes commises', 'fautes_pour'),
  st('fautes_contre', 'Fautes subies', 'fautes_contre'),
  st('jaunes_pour', 'Cartons jaunes reçus', 'jaunes_pour'),
  st('jaunes_contre', 'Cartons jaunes de l’adversaire', 'jaunes_contre'),
  st('rouges_pour', 'Cartons rouges reçus', 'rouges_pour'),
  st('rouges_contre', 'Cartons rouges de l’adversaire', 'rouges_contre')
]);

/** Les postes de player_day (1 gardien, 2 défenseur, 3 milieu, 4 attaquant, 5 libéro). */
const GARDIEN = 1;
const pj = (id, libelle, cible, { gardiens = false, unite = '90' } = {}) => Object.freeze({ id, libelle, cible, gardiens, unite });
/**
 * Les statistiques de joueur, ramenées à 90 minutes (« unite: '90' »), sauf la part de duels gagnés (par
 * duel) et la note (par apparition notée). Cible : les buts pour ce qui tire, les passes décisives pour ce
 * qui crée, la statistique elle-même sinon. Les gardiens n'ont que « buts évités » ; les autres
 * statistiques ne lisent que les joueurs de champ.
 */
export const STATISTIQUES_JOUEUR = Object.freeze([
  pj('buts', 'Buts (par 90 min)', 'buts'),
  pj('tirs', 'Tirs (par 90 min)', 'buts'),
  pj('cadres', 'Tirs cadrés (par 90 min)', 'buts'),
  pj('xg', 'xG (par 90 min)', 'buts'),
  pj('xgnp', 'xG hors penalty (par 90 min)', 'buts'),
  pj('xgot', 'xG des tirs cadrés (par 90 min)', 'buts'),
  pj('passes_d', 'Passes décisives (par 90 min)', 'passes_d'),
  pj('xa', 'xA, passes attendues (par 90 min)', 'passes_d'),
  pj('pc', 'Passes clés (par 90 min)', 'passes_d'),
  pj('recup', 'Récupérations (par 90 min)', 'recup'),
  pj('duels_g', 'Duels gagnés (par 90 min)', 'duels_g'),
  pj('duels_pct', 'Part de duels gagnés', 'duels_pct', { unite: 'duel' }),
  pj('jaunes', 'Cartons jaunes (par 90 min)', 'jaunes'),
  pj('rouges', 'Cartons rouges (par 90 min)', 'rouges'),
  pj('note', 'Note FotMob', 'note', { unite: 'apparition' }),
  pj('buts_evites', 'Buts évités (gardiens, par 90 min)', 'buts_evites', { gardiens: true })
]);
export const CIBLES_JOUEUR = Object.freeze({
  buts: 'les buts',
  passes_d: 'les passes décisives',
  recup: 'les récupérations',
  duels_g: 'les duels gagnés',
  duels_pct: 'la part de duels gagnés',
  jaunes: 'les cartons jaunes',
  rouges: 'les cartons rouges',
  note: 'la note',
  buts_evites: 'les buts évités'
});

// ======================================================= petites règles

const JOUR_MS = 86_400_000;
const FORME_JOUR = /^\d{4}-\d{2}-\d{2}$/;
/** « 2025-07-01 » → un numéro de jour (jours UTC depuis 1970) : les comparaisons se font sur des entiers. */
export function numeroDuJour(iso) {
  const j = String(iso ?? '').slice(0, 10);
  if (!FORME_JOUR.test(j)) throw new Error(`jour illisible : « ${iso ?? ''} »`);
  return Math.round(Date.UTC(Number(j.slice(0, 4)), Number(j.slice(5, 7)) - 1, Number(j.slice(8, 10))) / JOUR_MS);
}
export const jourIso = (n) => new Date(n * JOUR_MS).toISOString().slice(0, 10);
const bornes = (p) => ({ de: p.de ? numeroDuJour(p.de) : -Infinity, a: p.a ? numeroDuJour(p.a) : Infinity });

/** Valeur absente (null, vide, NaN) → null ; jamais Number(null) = 0. */
const nombre = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const arrondi = (x, d = 4) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

/** Les drapeaux d'une ligne. */
const D = Object.freeze({ CHAMPIONNAT: 1, ATTRIBUE: 2, PROLONGATION: 4, DOMICILE: 8, RELEVE: 16 });
export const DRAPEAUX = D;

/** Un compte entier tient dans un Int16 ; SANS = « non relevé ». */
const SANS = -32768;
const versInt16 = (v) => {
  const n = nombre(v);
  if (n === null) return SANS;
  const r = Math.round(n);
  if (r <= SANS || r > 32767) throw new RangeError(`valeur hors des bornes d'un compte : ${n}`);
  return r;
};
const deInt16 = (v) => (v === SANS ? null : v);

// ======================================================= la série (colonnes)

/** Colonnes brutes d'une ligne d'équipe : les comptes (entiers) et trois réels. */
const COMPTES_EQUIPE = Object.freeze(['bp', 'bc', 'tirs_p', 'tirs_c', 'cadres_p', 'cadres_c', 'corners_p', 'corners_c', 'jaunes_p', 'jaunes_c', 'rouges_p', 'rouges_c', 'fautes_p', 'fautes_c', 'occasions_p', 'occasions_c']);
const REELS_EQUIPE = Object.freeze(['xg_p', 'xg_c', 'possession_p']);
/** Le contrôle de la fenêtre du moteur : les colonnes (a) de la table du jour J (magasin seulement). */
const F10 = Object.freeze(['f10_corners_p', 'f10_corners_c', 'f10_corners_n', 'f10_tirs_p', 'f10_tirs_c', 'f10_tirs_n', 'f10_cadres_p', 'f10_cadres_c', 'f10_cadres_n']);
/** Colonnes brutes d'une ligne de joueur, telles que player_day les garde (note ×100, xG ×1000, buts évités ×100). */
const COMPTES_JOUEUR = Object.freeze(['minutes', 'note', 'buts', 'passes_d', 'tirs', 'cadres', 'xg', 'xa', 'xgnp', 'xgot', 'pc', 'recup', 'duels_g', 'duels_t', 'buts_evites', 'jaunes', 'rouges']);

/** Une colonne qui grandit (doublement), pour lire sans compter d'avance (un COUNT(*) balaierait la table). */
class Colonne {
  constructor(Type, capacite) {
    this.Type = Type;
    this.t = new Type(Math.max(16, capacite));
  }
  poser(i, v) {
    if (i >= this.t.length) {
      const t = new this.Type(Math.max(i + 1, this.t.length * 2));
      t.set(this.t);
      this.t = t;
    }
    this.t[i] = v;
  }
}

/**
 * Construit une série ligne à ligne (`ajouter`), puis la range (`terminer`) : par entité, puis par jour,
 * puis par clé (à jour égal : la clé de rencontre, l'ordre de la table du jour J). Une ligne :
 *   équipe — { club, date, league, saison, rencontre, matchKey?, home|camp, attribue, prolongation, compte,
 *              coupe, releve, bp, bc, xg_p, …, possession_p, f10_…? } (une ligne team_day ou un fait de
 *              faitsDepuisFd : les mêmes noms) ;
 *   joueur — { joueur, date, rencontre, poste (1-5), minutes, note, buts, …, groupe: { league, saison },
 *              championnat, attribue, prolongation } (une ligne player_day jouée, colonnes brutes).
 */
export class ConstructeurDeSerie {
  constructor({ echelle, source = 'magasin', capacite = 1024, dejaRangee = false }) {
    if (echelle !== 'equipe' && echelle !== 'joueur') throw new RangeError(`échelle inconnue : ${String(echelle)}`);
    this.echelle = echelle;
    this.source = source;
    this.dejaRangee = dejaRangee;
    this.n = 0;
    this.c = {
      entite: new Colonne(Int32Array, capacite),
      jour: new Colonne(Int32Array, capacite),
      rencontre: new Colonne(Int32Array, capacite),
      ligue: new Colonne(Int32Array, capacite),
      drapeaux: new Colonne(Uint8Array, capacite)
    };
    this.cles = echelle === 'equipe' ? [] : null;
    const comptes = echelle === 'equipe' ? [...COMPTES_EQUIPE, ...(source === 'magasin' ? F10 : [])] : COMPTES_JOUEUR;
    for (const nom of comptes) this.c[nom] = new Colonne(Int16Array, capacite);
    if (echelle === 'equipe') for (const nom of REELS_EQUIPE) this.c[nom] = new Colonne(Float32Array, capacite);
    else this.c.poste = new Colonne(Uint8Array, capacite);
    this.comptes = comptes;
    this.ligues = [];
    this.indexLigue = new Map();
  }

  ligueDe(league, saison) {
    const cle = `${league}|${saison}`;
    let k = this.indexLigue.get(cle);
    if (k === undefined) {
      k = this.ligues.length;
      this.indexLigue.set(cle, k);
      this.ligues.push(Object.freeze({ cle, league: String(league), saison: String(saison) }));
    }
    return k;
  }

  ajouter(f) {
    const i = this.n++;
    const c = this.c;
    const brut = this.echelle === 'equipe' ? f.club : f.joueur;
    const entite = typeof brut === 'string' ? Number(/^fotmob-(\d+)$/.exec(brut)?.[1] ?? brut) : Number(brut);
    if (!Number.isSafeInteger(entite)) throw new Error(`identifiant illisible : « ${String(brut)} »`);
    c.entite.poser(i, entite);
    c.jour.poser(i, numeroDuJour(f.date));
    c.rencontre.poser(i, Number(f.rencontre));
    if (this.echelle === 'equipe') {
      c.ligue.poser(i, this.ligueDe(f.league, f.saison));
      const domicile = f.home !== undefined ? Boolean(f.home) : f.camp === 1;
      const championnat = !Number(f.coupe ?? 0) && (f.compte === undefined || Boolean(Number(f.compte) || f.compte === true));
      c.drapeaux.poser(i, (championnat ? D.CHAMPIONNAT : 0) | (f.attribue === true || Number(f.attribue) === 1 ? D.ATTRIBUE : 0) | (f.prolongation === true || Number(f.prolongation) === 1 ? D.PROLONGATION : 0) | (domicile ? D.DOMICILE : 0) | (f.releve === true || Number(f.releve) === 1 ? D.RELEVE : 0));
      for (const nom of this.comptes) c[nom].poser(i, versInt16(f[nom]));
      for (const nom of REELS_EQUIPE) c[nom].poser(i, nombre(f[nom]) ?? Number.NaN);
      this.cles.push(String(f.matchKey ?? f.match_key ?? f.rencontre));
    } else {
      c.ligue.poser(i, this.ligueDe(f.groupe.league, f.groupe.saison));
      c.drapeaux.poser(i, (f.championnat ? D.CHAMPIONNAT : 0) | (f.attribue ? D.ATTRIBUE : 0) | (f.prolongation ? D.PROLONGATION : 0) | D.RELEVE);
      c.poste.poser(i, nombre(f.poste) ?? 0);
      for (const nom of this.comptes) c[nom].poser(i, versInt16(f[nom]));
    }
  }

  /** Range la série (générateur : il rend la main entre deux entités) et rend la Serie. */
  *terminer() {
    const n = this.n;
    const col = Object.fromEntries(Object.entries(this.c).map(([k, v]) => [k, v.t.subarray(0, n)]));
    let ordre;
    if (this.dejaRangee) {
      for (let i = 1; i < n; i++) {
        if (col.entite[i] < col.entite[i - 1] || (col.entite[i] === col.entite[i - 1] && col.jour[i] < col.jour[i - 1])) throw new Error(`série annoncée rangée, mais la ligne ${i} ne l'est pas`);
      }
      ordre = null;
    } else {
      // Par entité (des seaux), puis par jour et clé dans chaque seau : de petits tris, la main rendue entre deux.
      const seaux = new Map();
      for (let i = 0; i < n; i++) {
        const e = col.entite[i];
        let s = seaux.get(e);
        if (!s) seaux.set(e, (s = []));
        s.push(i);
        if (i % 50_000 === 49_999) yield 'rangement';
      }
      const entites = [...seaux.keys()].sort((x, y) => x - y);
      ordre = new Int32Array(n);
      let k = 0;
      const cles = this.cles;
      for (const e of entites) {
        const s = seaux.get(e);
        s.sort((x, y) => col.jour[x] - col.jour[y] || (cles[x] < cles[y] ? -1 : cles[x] > cles[y] ? 1 : 0));
        for (const i of s) ordre[k++] = i;
        if (k % 20_000 < s.length) yield 'rangement';
      }
    }
    const final = {};
    for (const [nom, t] of Object.entries(col)) {
      if (!ordre) {
        // Déjà rangée : la vue suffit (aucune copie de plus d'un million de lignes).
        final[nom] = t;
        continue;
      }
      const u = new t.constructor(n);
      for (let i = 0; i < n; i++) u[i] = t[ordre[i]];
      final[nom] = u;
      yield 'rangement';
    }
    // Les débuts d'entité.
    const debuts = [0];
    for (let i = 1; i < n; i++) if (final.entite[i] !== final.entite[i - 1]) debuts.push(i);
    debuts.push(n);
    return new Serie({ echelle: this.echelle, source: this.source, n, colonnes: final, ligues: this.ligues, debuts: Int32Array.from(debuts) });
  }

  terminerSansPause() {
    return executerSansPause(this.terminer());
  }
}

/** Une série rangée : colonnes, championnats-saisons, débuts d'entité. Lecture seule. */
export class Serie {
  constructor({ echelle, source, n, colonnes, ligues, debuts }) {
    this.echelle = echelle;
    this.source = source;
    this.n = n;
    this.col = colonnes;
    this.ligues = ligues;
    this.debuts = debuts;
    this.nEntites = debuts.length - 1;
    let max = 0;
    for (let e = 0; e < this.nEntites; e++) max = Math.max(max, debuts[e + 1] - debuts[e]);
    this.plusLongue = max;
  }

  /** Le groupe de centrage d'une ligne : le championnat-saison (joueurs : × poste). */
  groupe(i) {
    return this.echelle === 'equipe' ? this.col.ligue[i] : this.col.ligue[i] * 8 + this.col.poste[i];
  }

  /** Le libellé d'un groupe (pour les comptes du bilan). */
  libelleGroupe(g) {
    if (this.echelle === 'equipe') return this.ligues[g]?.cle ?? String(g);
    return `${this.ligues[Math.floor(g / 8)]?.cle ?? '?'}|poste ${g % 8}`;
  }
}

// ======================================================= les valeurs d'une statistique

const v16 = (s, nom, i) => deInt16(s.col[nom][i]);
const vR = (s, nom, i) => {
  const v = s.col[nom][i];
  return Number.isNaN(v) ? null : v;
};
/** La paire d'un compte d'équipe selon la règle de la source (0-0 « non relevé » au magasin, vrai 0 chez football-data). */
function paire(s, nom, i) {
  const p = v16(s, `${nom}_p`, i);
  const c = v16(s, `${nom}_c`, i);
  return s.source === 'football-data' ? paireFd(p, c) : paireRelevee(p, c);
}
/** Les cartons d'une ligne : jaunes et rouges de chaque côté, ou null s'ils ne sont pas relevés. */
function cartons(s, i) {
  const jp = v16(s, 'jaunes_p', i);
  const jc = v16(s, 'jaunes_c', i);
  const rp = v16(s, 'rouges_p', i);
  const rc = v16(s, 'rouges_c', i);
  if (s.source === 'football-data') return { jaunes: paireFd(jp, jc), rouges: paireFd(rp, rc) };
  const ok = cartonsReleves(jp, jc, rp, rc);
  return { jaunes: ok ? [jp, jc] : null, rouges: ok && ok.rouges !== null ? [rp, rc] : null };
}
const xgPaire = (s, i) => {
  const p = vR(s, 'xg_p', i);
  const c = vR(s, 'xg_c', i);
  return p === null || c === null ? null : [p, c];
};

/** La valeur d'une statistique d'équipe sur une ligne, ou null (non relevé). */
function valeurEquipe(id, s, i) {
  const bp = v16(s, 'bp', i);
  const bc = v16(s, 'bc', i);
  switch (id) {
    case 'buts_pour':
      return bp;
    case 'buts_contre':
      return bc;
    case 'points':
      return bp === null || bc === null ? null : bp > bc ? 3 : bp === bc ? 1 : 0;
    case 'diff_buts':
      return bp === null || bc === null ? null : bp - bc;
    case 'xg_pour':
      return xgPaire(s, i)?.[0] ?? null;
    case 'xg_contre':
      return xgPaire(s, i)?.[1] ?? null;
    case 'diff_xg': {
      const x = xgPaire(s, i);
      return x ? x[0] - x[1] : null;
    }
    case 'finition_pour': {
      const x = xgPaire(s, i);
      return x && bp !== null ? bp - x[0] : null;
    }
    case 'finition_contre': {
      const x = xgPaire(s, i);
      return x && bc !== null ? bc - x[1] : null;
    }
    case 'possession':
      return s.source === 'football-data' ? null : vR(s, 'possession_p', i);
    case 'jaunes_pour':
      return cartons(s, i).jaunes?.[0] ?? null;
    case 'jaunes_contre':
      return cartons(s, i).jaunes?.[1] ?? null;
    case 'rouges_pour':
      return cartons(s, i).rouges?.[0] ?? null;
    case 'rouges_contre':
      return cartons(s, i).rouges?.[1] ?? null;
    default: {
      const m = /^(tirs|cadres|corners|fautes|occasions)_(pour|contre)$/.exec(id) ?? /^diff_(tirs|cadres)$/.exec(id);
      if (!m) throw new Error(`statistique d'équipe inconnue : ${id}`);
      if (m[1] === 'occasions' && s.source === 'football-data') return null;
      const pr = paire(s, m[1], i);
      if (!pr) return null;
      if (id.startsWith('diff_')) return pr[0] - pr[1];
      return m[2] === 'pour' ? pr[0] : pr[1];
    }
  }
}

/** Échelle d'une colonne de joueur (player_day garde des entiers). */
const ECHELLE_JOUEUR = Object.freeze({ note: 100, xg: 1000, xa: 1000, xgnp: 1000, xgot: 1000, buts_evites: 100 });

/**
 * Le numérateur et le dénominateur d'une statistique de joueur sur une ligne : par 90 minutes (n, minutes
 * / 90), par duel (gagnés, disputés), par apparition notée (note, 1). null si non relevé (NULL de la table
 * du jour J : non couvert), si les minutes manquent, ou si le poste ne convient pas (gardiens à part).
 */
function valeurJoueur(stat, s, i) {
  const poste = s.col.poste[i];
  if (!poste || (stat.gardiens ? poste !== GARDIEN : poste === GARDIEN)) return null;
  const minutes = v16(s, 'minutes', i);
  if (minutes === null || minutes <= 0) return null;
  if (stat.id === 'duels_pct') {
    const g = v16(s, 'duels_g', i);
    const t = v16(s, 'duels_t', i);
    return g === null || t === null || t <= 0 ? null : [g, t];
  }
  const brut = v16(s, stat.id, i);
  if (brut === null) return null;
  const v = brut / (ECHELLE_JOUEUR[stat.id] ?? 1);
  return stat.unite === 'apparition' ? [v, 1] : [v, minutes / 90];
}

/** Une statistique de joueur décrite par son identifiant (les cibles en sont aussi). */
const STAT_JOUEUR_PAR_ID = new Map(STATISTIQUES_JOUEUR.map((x) => [x.id, x]));

/**
 * Les colonnes (numérateur, dénominateur) d'une statistique ou d'une cible sur toute la série : NaN au
 * numérateur = non relevé. Équipe : dénominateur 1 (par match). Joueur : voir valeurJoueur.
 */
function* colonnesParMorceaux(serie, id, { gardiens = null } = {}) {
  const n = serie.n;
  // Joueurs : 1,7 million de lignes, en Float32 (sept chiffres ; les sommes se font en Float64) ; équipes : Float64.
  const Type = serie.echelle === 'joueur' ? Float32Array : Float64Array;
  const num = new Type(n);
  const den = new Type(n);
  if (serie.echelle === 'equipe') {
    for (let i = 0; i < n; i++) {
      const v = valeurEquipe(id, serie, i);
      num[i] = v === null ? Number.NaN : v;
      den[i] = v === null ? 0 : 1;
      if ((i & 16383) === 16383) yield 'colonnes';
    }
    return { num, den };
  }
  const base = STAT_JOUEUR_PAR_ID.get(id);
  if (!base) throw new Error(`statistique de joueur inconnue : ${id}`);
  const stat = gardiens === null ? base : { ...base, gardiens };
  for (let i = 0; i < n; i++) {
    const v = valeurJoueur(stat, serie, i);
    num[i] = v === null ? Number.NaN : v[0];
    den[i] = v === null ? 0 : v[1];
    if ((i & 16383) === 16383) yield 'colonnes';
  }
  return { num, den };
}
export const colonnesDe = (serie, id, options) => executerSansPause(colonnesParMorceaux(serie, id, options));

/** Les minutes de chaque ligne (joueurs) : Float64Array, 0 si inconnues. */
function* minutesParMorceaux(serie) {
  const m = new Float32Array(serie.n);
  if (serie.echelle !== 'joueur') return m;
  for (let i = 0; i < serie.n; i++) {
    m[i] = Math.max(0, v16(serie, 'minutes', i) ?? 0);
    if ((i & 65535) === 65535) yield 'minutes';
  }
  return m;
}

// ======================================================= le parcours dans le temps

const PAS = 4096;

/**
 * LE PARCOURS (la règle du jour J). Entité par entité, jour par jour : `surJour(debut, fin, h)` reçoit les
 * lignes [debut, fin) d'un même jour et l'histoire `h` de l'entité AVANT ce jour — k entrées relevées
 * (numérateurs, dénominateurs et minutes cumulés : cumNum[k] − cumNum[k − w] = les w dernières), les
 * moyennes pondérées (une par demi-vie : ewmaS / ewmaD) ; puis les lignes du jour qui le peuvent
 * (`entre(i)` et relevées) entrent dans l'histoire. Une histoire qui contiendrait un jour qui n'est pas
 * strictement antérieur LÈVE (« fuite refusée ») : la série doit être rangée. Générateur (points d'arrêt).
 */
function* parcourir(serie, { num, den, minutes = null, entre, surJour, demiVies = [], ou = 'parcours' }) {
  const taille = serie.plusLongue + 1;
  const h = {
    k: 0,
    cumNum: new Float64Array(taille),
    cumDen: new Float64Array(taille),
    cumMin: new Float64Array(taille),
    ewmaS: new Float64Array(demiVies.length),
    ewmaD: new Float64Array(demiVies.length),
    dernierJour: -Infinity
  };
  const deltas = demiVies.map((x) => (x === Infinity ? 1 : 2 ** (-1 / x)));
  let depuisPause = 0;
  for (let e = 0; e < serie.nEntites; e++) {
    h.k = 0;
    h.dernierJour = -Infinity;
    h.ewmaS.fill(0);
    h.ewmaD.fill(0);
    const fin = serie.debuts[e + 1];
    for (let i = serie.debuts[e]; i < fin; ) {
      const jour = serie.col.jour[i];
      let j = i + 1;
      while (j < fin && serie.col.jour[j] === jour) j++;
      if (h.dernierJour >= jour) throw new Error(`parcours : l'histoire contient le ${jourIso(h.dernierJour)}, pas strictement avant le ${jourIso(jour)} — fuite refusée`);
      surJour(i, j, h);
      for (let r = i; r < j; r++) {
        if (!(den[r] > 0) || Number.isNaN(num[r]) || !entre(r)) continue;
        const k = ++h.k;
        h.cumNum[k] = h.cumNum[k - 1] + num[r];
        h.cumDen[k] = h.cumDen[k - 1] + den[r];
        h.cumMin[k] = h.cumMin[k - 1] + (minutes ? minutes[r] : 0);
        for (let d = 0; d < deltas.length; d++) {
          h.ewmaS[d] = deltas[d] * h.ewmaS[d] + num[r];
          h.ewmaD[d] = deltas[d] * h.ewmaD[d] + den[r];
        }
        h.dernierJour = jour;
      }
      depuisPause += j - i;
      if (depuisPause >= PAS) {
        depuisPause = 0;
        yield ou;
      }
      i = j;
    }
  }
}

/** La moyenne des w dernières entrées de l'histoire (toutes s'il y en a moins), ou NaN. */
const fenetreDe = (h, w) => {
  const kk = Math.min(w, h.k);
  if (!kk) return Number.NaN;
  const d = h.cumDen[h.k] - h.cumDen[h.k - kk];
  return d > 0 ? (h.cumNum[h.k] - h.cumNum[h.k - kk]) / d : Number.NaN;
};
const ponderee = (h, d) => (h.ewmaD[d] > 0 ? h.ewmaS[d] / h.ewmaD[d] : Number.NaN);

/** Les candidats (fenêtres puis demi-vies) et la valeur de chacun pour une histoire. */
function candidatsDe(fenetres, demiVies) {
  return [...fenetres.map((w) => ({ type: 'fenetre', valeur: w })), ...demiVies.map((x) => ({ type: 'demi-vie', valeur: x }))];
}
function valeursDesCandidats(h, fenetres, nDemiVies, sortie) {
  let c = 0;
  for (const w of fenetres) sortie[c++] = fenetreDe(h, w);
  for (let d = 0; d < nDemiVies; d++) sortie[c++] = ponderee(h, d);
}

// ======================================================= statistiques

/** Spearman-Brown : la fiabilité d'une mesure `facteur` fois plus longue que celle de fiabilité r. */
export const spearmanBrown = (r, facteur = 2) => (facteur * r) / (1 + (facteur - 1) * r);
/** La fiabilité d'UN match (ou d'une unité) depuis celle de k : ρ = r / (k − (k − 1) r). */
export const fiabiliteDUnMatch = (r, k) => r / (k - (k - 1) * r);
/** Le point de stabilisation : n* = k (1 − r) / r (fiabilité 0,5 à n* matchs) ; Infinity si r ≤ 0. */
export const stabilisation = (r, k) => (r > 0 ? (k * (1 - r)) / r : Infinity);
/** La demi-vie → le poids d'un match d'il y a `k` matchs (le dernier pèse 1). Pour 27, 29, 30. */
export const poidsDemiVie = (k, demiVie) => (demiVie === Infinity || demiVie === null ? 1 : 2 ** (-k / demiVie));

/** Le quantile (interpolé) d'une liste déjà triée. */
function quantile(trie, q) {
  if (!trie.length) return null;
  const pos = q * (trie.length - 1);
  const b = Math.floor(pos);
  const hh = Math.min(b + 1, trie.length - 1);
  if (trie[b] === trie[hh]) return trie[b];
  return trie[b] + (trie[hh] - trie[b]) * (pos - b);
}
/** Le quantile « au plus proche » (pour une grille : jamais une valeur entre deux cases). */
function quantileDiscret(trie, q) {
  if (!trie.length) return null;
  return trie[Math.min(trie.length - 1, Math.max(0, Math.round(q * (trie.length - 1))))];
}

/**
 * Des sommes pondérées par groupe et par candidat, centrées au sein du groupe : pour chaque (g, c),
 * [cxx, ctt, cxt]. Les sommes brutes : W, Σex, Σet, Σex², Σet², Σext (6 par case).
 */
function centrer(brutes, G, C) {
  const out = new Float64Array(G * C * 3);
  for (let g = 0; g < G; g++) {
    for (let c = 0; c < C; c++) {
      const b = (g * C + c) * 6;
      const W = brutes[b];
      if (!(W > 0)) continue;
      const o = (g * C + c) * 3;
      out[o] = brutes[b + 3] - (brutes[b + 1] * brutes[b + 1]) / W;
      out[o + 1] = brutes[b + 4] - (brutes[b + 2] * brutes[b + 2]) / W;
      out[o + 2] = brutes[b + 5] - (brutes[b + 1] * brutes[b + 2]) / W;
    }
  }
  return out;
}
/** La corrélation et la pente mises en commun sur des groupes (tous, ou une liste tirée avec remise). */
function enCommun(centrees, G, C, c, groupes = null) {
  let sxx = 0;
  let stt = 0;
  let sxt = 0;
  const parcours = groupes ?? { length: G };
  for (let q = 0; q < parcours.length; q++) {
    const g = groupes ? groupes[q] : q;
    const o = (g * C + c) * 3;
    sxx += centrees[o];
    stt += centrees[o + 1];
    sxt += centrees[o + 2];
  }
  const r = sxx > 0 && stt > 0 ? sxt / Math.sqrt(sxx * stt) : Number.NaN;
  return { r, beta: sxx > 0 ? sxt / sxx : Number.NaN, sxx, stt, sxt };
}

/** Un tirage de G groupes avec remise (générateur à graine de guard.js). */
const tirerGroupes = (u, G, sortie) => {
  for (let q = 0; q < G; q++) sortie[q] = Math.floor(u() * G);
  return sortie;
};

// ======================================================= 1. la fiabilité moitié / moitié

/**
 * LA FIABILITÉ MOITIÉ / MOITIÉ d'une statistique sur [de ; a] (jours inclus). Lignes : matchs de
 * CHAMPIONNAT, ni attribués ni prolongés, où la statistique est relevée. Un SEGMENT = une entité dans un
 * championnat-saison. Équipe : ses 2k premiers matchs relevés du segment, alternés (1er, 3e… / 2e, 4e…) ;
 * joueur : ses apparitions alternées jusqu'à ce que chaque moitié ait `minutesMoitie` minutes. La moyenne
 * de chaque moitié (somme / somme des dénominateurs : par 90 minutes pour un joueur), centrée sur la
 * moyenne de son groupe (championnat-saison ; joueur : × poste dominant du segment) ; r = corrélation mise
 * en commun ; fourchettes par tirage des groupes avec remise. Rend aussi k (en matchs, ou en matchs de
 * 90 minutes : la moyenne harmonique des moitiés), la fiabilité d'un match, celle de 10 matchs (la fenêtre
 * d'aujourd'hui) et le point de stabilisation.
 */
export function* fiabiliteParMorceaux(serie, statId, { de = null, a = null, moitieEquipe = SEUILS.moitieEquipe, minutesMoitie = SEUILS.minutesMoitie, tirages = 1000, graine = 1, gardiens = null } = {}) {
  const { num, den } = yield* colonnesParMorceaux(serie, statId, { gardiens });
  const minutes = yield* minutesParMorceaux(serie);
  const p = bornes({ de, a });
  const equipe = serie.echelle === 'equipe';
  const par = new Map(); // groupe → [{ a, b, k }]
  let depuisPause = 0;
  for (let e = 0; e < serie.nEntites; e++) {
    const segments = new Map(); // ligue → accumulateur
    for (let i = serie.debuts[e]; i < serie.debuts[e + 1]; i++) {
      const dr = serie.col.drapeaux[i];
      const jour = serie.col.jour[i];
      if (jour < p.de || jour > p.a) continue;
      if (!(dr & D.CHAMPIONNAT) || dr & (D.ATTRIBUE | D.PROLONGATION)) continue;
      if (!(den[i] > 0) || Number.isNaN(num[i])) continue;
      const ligue = serie.col.ligue[i];
      let s = segments.get(ligue);
      if (!s) segments.set(ligue, (s = { nA: 0, nB: 0, numA: 0, denA: 0, minA: 0, numB: 0, denB: 0, minB: 0, rang: 0, plein: false, postes: new Map() }));
      if (s.plein) continue;
      const versA = s.rang % 2 === 0;
      s.rang++;
      if (versA) {
        s.nA++;
        s.numA += num[i];
        s.denA += den[i];
        s.minA += minutes[i];
      } else {
        s.nB++;
        s.numB += num[i];
        s.denB += den[i];
        s.minB += minutes[i];
      }
      if (!equipe) s.postes.set(serie.col.poste[i], (s.postes.get(serie.col.poste[i]) ?? 0) + 1);
      s.plein = equipe ? s.rang >= 2 * moitieEquipe : s.minA >= minutesMoitie && s.minB >= minutesMoitie;
    }
    for (const [ligue, s] of segments) {
      if (!s.plein || !(s.denA > 0) || !(s.denB > 0)) continue;
      let groupe = ligue;
      let k = moitieEquipe;
      if (!equipe) {
        let poste = 0;
        let vu = -1;
        for (const [ps, nb] of s.postes) if (nb > vu || (nb === vu && ps < poste)) [poste, vu] = [ps, nb];
        groupe = ligue * 8 + poste;
        k = (s.minA + s.minB) / 2 / 90;
      }
      let liste = par.get(groupe);
      if (!liste) par.set(groupe, (liste = []));
      liste.push({ a: s.numA / s.denA, b: s.numB / s.denB, k });
    }
    if (++depuisPause >= 500) {
      depuisPause = 0;
      yield 'fiabilité';
    }
  }
  // Centrage au sein du groupe, puis mise en commun.
  const groupes = [...par.values()].filter((l) => l.length >= 2);
  const G = groupes.length;
  const SAB = new Float64Array(G);
  const SAA = new Float64Array(G);
  const SBB = new Float64Array(G);
  let nSeg = 0;
  let sommeInvK = 0;
  groupes.forEach((liste, g) => {
    let ma = 0;
    let mb = 0;
    for (const x of liste) {
      ma += x.a;
      mb += x.b;
    }
    ma /= liste.length;
    mb /= liste.length;
    for (const x of liste) {
      SAB[g] += (x.a - ma) * (x.b - mb);
      SAA[g] += (x.a - ma) ** 2;
      SBB[g] += (x.b - mb) ** 2;
      nSeg++;
      sommeInvK += 1 / x.k;
    }
  });
  const rDe = (choix) => {
    let ab = 0;
    let aa = 0;
    let bb = 0;
    for (let q = 0; q < choix.length; q++) {
      const g = choix[q];
      ab += SAB[g];
      aa += SAA[g];
      bb += SBB[g];
    }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : Number.NaN;
  };
  const tous = Int32Array.from({ length: G }, (_, g) => g);
  const r = G ? rDe(tous) : Number.NaN;
  const k = nSeg ? nSeg / sommeInvK : equipe ? moitieEquipe : minutesMoitie / 90;
  // Les fourchettes : les groupes tirés avec remise, la même mesure refaite.
  const tires = [];
  if (G >= 2) {
    const u = generateur(graine);
    const choix = new Int32Array(G);
    for (let t = 0; t < tirages; t++) {
      const rt = rDe(tirerGroupes(u, G, choix));
      if (Number.isFinite(rt)) tires.push(rt);
      if (t % 100 === 99) yield 'fiabilité (fourchette)';
    }
  }
  tires.sort((x, y) => x - y);
  const rBas = quantile(tires, 0.025);
  const rHaut = quantile(tires, 0.975);
  const derive = (rr) => {
    if (rr === null || !Number.isFinite(rr)) return { fiabilite: null, rho: null, dix: null, stab: null };
    const rho = fiabiliteDUnMatch(rr, k);
    return { fiabilite: spearmanBrown(rr, 2), rho, dix: spearmanBrown(rho, FENETRE_ACTUELLE), stab: stabilisation(rr, k) };
  };
  const centre = derive(r);
  const bas = derive(rBas);
  const haut = derive(rHaut);
  return {
    r: arrondi(r),
    rFourchette: [arrondi(rBas), arrondi(rHaut)],
    fiabilite: arrondi(centre.fiabilite),
    fourchette: [arrondi(bas.fiabilite), arrondi(haut.fiabilite)],
    k: arrondi(k, 2),
    matchs: arrondi(2 * k, 2),
    fiabiliteDUnMatch: arrondi(centre.rho),
    fiabilite10: arrondi(centre.dix),
    fiabilite10Fourchette: [arrondi(bas.dix), arrondi(haut.dix)],
    stabilisation: centre.stab === Infinity ? null : arrondi(centre.stab, 2),
    stabilisationSansFin: centre.stab === Infinity,
    // n* décroît quand r croît : la borne basse vient de la corrélation haute.
    stabilisationFourchette: [haut.stab === Infinity || haut.stab === null ? null : arrondi(haut.stab, 2), bas.stab === Infinity || bas.stab === null ? null : arrondi(bas.stab, 2)],
    stabilisationHautSansFin: bas.stab === Infinity,
    segments: nSeg,
    groupes: G,
    tirages: tires.length
  };
}
export const fiabiliteMoitieMoitie = (serie, statId, options) => executerSansPause(fiabiliteParMorceaux(serie, statId, options));

// ======================================================= 2. le calcul : fenêtre, demi-vie, pente

/** Une ligne cible : un match de championnat (ni attribué ni prolongé) de la période, cible relevée, poste qui convient. */
function estCible(serie, i, p, cible) {
  const jour = serie.col.jour[i];
  if (jour < p.de || jour > p.a) return false;
  const dr = serie.col.drapeaux[i];
  if (!(dr & D.CHAMPIONNAT) || dr & (D.ATTRIBUE | D.PROLONGATION)) return false;
  return cible.den[i] > 0 && !Number.isNaN(cible.num[i]);
}
/**
 * Ce qui entre dans l'histoire : tout match relevé, toutes compétitions, sauf un résultat attribué (sa feuille
 * ne décrit pas un match) — et, pour une équipe, un match prolongé (un compte de 120 minutes ; un joueur, lui,
 * est ramené à 90 minutes).
 */
const entreDansLHistoire = (serie) => {
  const exclus = serie.echelle === 'equipe' ? D.ATTRIBUE | D.PROLONGATION : D.ATTRIBUE;
  return (i) => !(serie.col.drapeaux[i] & exclus);
};
/** Assez d'histoire avant un match : 6 relevés pour une équipe (le moteur), 270 minutes pour un joueur. */
const histoireSuffisante = (serie, h, { histoireEquipe, minutesHistoire }) => (serie.echelle === 'equipe' ? h.k >= histoireEquipe : h.cumMin[h.k] >= minutesHistoire);

/**
 * LE CALCUL d'une statistique face à sa cible, sur la période de calcul : pour chaque ligne cible, la
 * statistique sur chaque fenêtre et chaque demi-vie (histoire strictement avant le jour), la cible du match
 * (un taux, pondéré par son dénominateur : les minutes d'un joueur) ; des sommes par groupe, centrées ;
 * la corrélation mise en commun de chaque candidat, sa pente (la régression au sein du groupe) ; la
 * meilleure fenêtre et la meilleure demi-vie (plus grande part d'erreur expliquée, r²), et leurs fourchettes
 * (les groupes tirés avec remise, le choix refait). Rend { candidats, fenetre, demiVie, lignes, groupes }.
 */
export function* apprendreParMorceaux(serie, statId, cibleId, { de = null, a = null, fenetres = FENETRES, demiVies = DEMI_VIES, histoireEquipe = SEUILS.histoireEquipe, minutesHistoire = SEUILS.minutesHistoire, tirages = 1000, graine = 1 } = {}) {
  const stat = yield* colonnesParMorceaux(serie, statId);
  const cible = cibleId === statId ? stat : yield* colonnesParMorceaux(serie, cibleId, serie.echelle === 'joueur' ? { gardiens: STAT_JOUEUR_PAR_ID.get(statId)?.gardiens ?? false } : {});
  const minutes = yield* minutesParMorceaux(serie);
  const p = bornes({ de, a });
  const candidats = candidatsDe(fenetres, demiVies);
  const C = candidats.length;
  const indexGroupe = new Map();
  let brutes = new Float64Array(64 * C * 6);
  const x = new Float64Array(C);
  let lignes = 0;
  yield* parcourir(serie, {
    num: stat.num,
    den: stat.den,
    minutes,
    entre: entreDansLHistoire(serie),
    demiVies,
    ou: 'calcul',
    surJour: (debut, fin, h) => {
      if (!histoireSuffisante(serie, h, { histoireEquipe, minutesHistoire })) return;
      let calcule = false;
      for (let i = debut; i < fin; i++) {
        if (!estCible(serie, i, p, cible)) continue;
        if (!calcule) {
          valeursDesCandidats(h, fenetres, demiVies.length, x);
          calcule = true;
        }
        const gBrut = serie.groupe(i);
        let g = indexGroupe.get(gBrut);
        if (g === undefined) {
          g = indexGroupe.size;
          indexGroupe.set(gBrut, g);
          if ((g + 1) * C * 6 > brutes.length) {
            const plus = new Float64Array(brutes.length * 2);
            plus.set(brutes);
            brutes = plus;
          }
        }
        const e = cible.den[i];
        const t = cible.num[i] / e;
        for (let c = 0; c < C; c++) {
          const xc = x[c];
          if (!Number.isFinite(xc)) continue;
          const b = (g * C + c) * 6;
          brutes[b] += e;
          brutes[b + 1] += e * xc;
          brutes[b + 2] += e * t;
          brutes[b + 3] += e * xc * xc;
          brutes[b + 4] += e * t * t;
          brutes[b + 5] += e * xc * t;
        }
        lignes++;
      }
    }
  });
  const G = indexGroupe.size;
  const centrees = centrer(brutes, G, C);
  const resultats = candidats.map((cand, c) => {
    const m = enCommun(centrees, G, C, c);
    return { ...cand, r: m.r, beta: m.beta };
  });
  const indicesFenetres = candidats.map((c, i) => (c.type === 'fenetre' ? i : -1)).filter((i) => i >= 0);
  const indicesDemiVies = candidats.map((c, i) => (c.type === 'demi-vie' ? i : -1)).filter((i) => i >= 0);
  // Le meilleur : la plus grande part expliquée ; à égalité (1e-12), la fenêtre d'aujourd'hui, puis la plus courte.
  const meilleur = (indices, rDe) => {
    let best = -1;
    let bestR2 = -Infinity;
    for (const c of indices) {
      const rr = rDe(c);
      if (!Number.isFinite(rr)) continue;
      const r2 = rr * rr;
      const egal = Math.abs(r2 - bestR2) <= 1e-12;
      if (r2 > bestR2 + 1e-12 || (egal && candidats[c].valeur === FENETRE_ACTUELLE && candidats[c].type === 'fenetre')) {
        best = c;
        bestR2 = r2;
      }
    }
    return best;
  };
  const fenetreIdx = meilleur(indicesFenetres, (c) => resultats[c].r);
  const demiVieIdx = meilleur(indicesDemiVies, (c) => resultats[c].r);
  // Les fourchettes du choix : les groupes tirés avec remise, le choix refait à chaque tirage.
  const choixF = [];
  const choixH = [];
  if (G >= 2 && fenetreIdx >= 0) {
    const u = generateur(graine);
    const choix = new Int32Array(G);
    const rT = new Float64Array(C);
    for (let t = 0; t < tirages; t++) {
      tirerGroupes(u, G, choix);
      for (let c = 0; c < C; c++) rT[c] = enCommun(centrees, G, C, c, choix).r;
      const f = meilleur(indicesFenetres, (c) => rT[c]);
      const hh = meilleur(indicesDemiVies, (c) => rT[c]);
      if (f >= 0) choixF.push(candidats[f].valeur);
      if (hh >= 0) choixH.push(candidats[hh].valeur);
      if (t % 50 === 49) yield 'calcul (fourchette)';
    }
  }
  choixF.sort((u1, u2) => u1 - u2);
  choixH.sort((u1, u2) => u1 - u2);
  return {
    lignes,
    groupes: G,
    candidats: resultats.map((c) => ({ type: c.type, valeur: c.valeur === Infinity ? null : c.valeur, sansFin: c.valeur === Infinity, r: arrondi(c.r), beta: arrondi(c.beta, 6) })),
    fenetre: fenetreIdx < 0 ? null : { valeur: candidats[fenetreIdx].valeur, r: arrondi(resultats[fenetreIdx].r), beta: resultats[fenetreIdx].beta, fourchette: [quantileDiscret(choixF, 0.025), quantileDiscret(choixF, 0.975)] },
    demiVie: demiVieIdx < 0 ? null : { valeur: candidats[demiVieIdx].valeur, r: arrondi(resultats[demiVieIdx].r), beta: resultats[demiVieIdx].beta, fourchette: [quantileDiscret(choixH, 0.025), quantileDiscret(choixH, 0.975)] },
    actuelle: (() => {
      const c = candidats.findIndex((x2) => x2.type === 'fenetre' && x2.valeur === FENETRE_ACTUELLE);
      return c < 0 ? null : { valeur: FENETRE_ACTUELLE, r: arrondi(resultats[c].r), beta: resultats[c].beta };
    })()
  };
}
export const apprendre = (serie, statId, cibleId, options) => executerSansPause(apprendreParMorceaux(serie, statId, cibleId, options));

// ======================================================= 3. le jugement

/**
 * LE JUGEMENT d'une statistique, sur des matchs POSTÉRIEURS au calcul : pour chaque ligne cible de la
 * période, la statistique sur la fenêtre d'aujourd'hui (10), sur la meilleure fenêtre et la meilleure
 * demi-vie du calcul ; la prévision = moyenne du groupe + pente du calcul × écart à la moyenne du groupe
 * (× le dénominateur pour un joueur : un compte de buts sur ses minutes) ; l'erreur au carré de chaque
 * prévision et celle de la seule moyenne du groupe. Rend les colonnes à juger (blocs = rencontres, jours),
 * la corrélation au sein du groupe (pouvoir prédictif) avec sa fourchette, et — équipe — celle des autres
 * cibles. Les moyennes de groupe sont celles de la période jugée : elles centrent, elles ne choisissent rien.
 */
export function* preparerJugementParMorceaux(serie, statId, cibleId, appris, { de = null, a = null, histoireEquipe = SEUILS.histoireEquipe, minutesHistoire = SEUILS.minutesHistoire, autresCibles = [], tirages = 1000, graine = 1 } = {}) {
  const stat = yield* colonnesParMorceaux(serie, statId);
  const gardiens = serie.echelle === 'joueur' ? STAT_JOUEUR_PAR_ID.get(statId)?.gardiens ?? false : null;
  const cible = cibleId === statId ? stat : yield* colonnesParMorceaux(serie, cibleId, gardiens === null ? {} : { gardiens });
  const autres = [];
  for (const id of autresCibles) autres.push({ id, ...(id === statId ? stat : id === cibleId ? cible : yield* colonnesParMorceaux(serie, id)) });
  const minutes = yield* minutesParMorceaux(serie);
  const p = bornes({ de, a });
  const w = appris.fenetre?.valeur ?? FENETRE_ACTUELLE;
  const hv = appris.demiVie?.valeur ?? Infinity;
  const fenetres = [FENETRE_ACTUELLE, w];
  const demiVies = [hv];
  // Les colonnes, une case par ligne jugée.
  const L = { x10: [], xw: [], xh: [], t: [], e: [], g: [], bloc: [], jour: [], autres: autres.map(() => []) };
  const x = new Float64Array(3);
  yield* parcourir(serie, {
    num: stat.num,
    den: stat.den,
    minutes,
    entre: entreDansLHistoire(serie),
    demiVies,
    ou: 'jugement',
    surJour: (debut, fin, h) => {
      if (!histoireSuffisante(serie, h, { histoireEquipe, minutesHistoire })) return;
      let calcule = false;
      for (let i = debut; i < fin; i++) {
        const jour = serie.col.jour[i];
        if (jour < p.de || jour > p.a) continue;
        const dr = serie.col.drapeaux[i];
        if (!(dr & D.CHAMPIONNAT) || dr & (D.ATTRIBUE | D.PROLONGATION)) continue;
        if (!calcule) {
          valeursDesCandidats(h, fenetres, 1, x);
          calcule = true;
        }
        if (!Number.isFinite(x[0]) || !Number.isFinite(x[1]) || !Number.isFinite(x[2])) continue;
        const cibleOk = cible.den[i] > 0 && !Number.isNaN(cible.num[i]);
        const autresOk = autres.some((o) => o.den[i] > 0 && !Number.isNaN(o.num[i]));
        if (!cibleOk && !autresOk) continue;
        L.x10.push(x[0]);
        L.xw.push(x[1]);
        L.xh.push(x[2]);
        L.t.push(cibleOk ? cible.num[i] / cible.den[i] : Number.NaN);
        L.e.push(cibleOk ? cible.den[i] : 0);
        L.g.push(serie.groupe(i));
        L.bloc.push(serie.col.rencontre[i]);
        L.jour.push(jour);
        autres.forEach((o, q) => L.autres[q].push(o.den[i] > 0 && !Number.isNaN(o.num[i]) ? o.num[i] / o.den[i] : Number.NaN));
      }
    }
  });
  const n = L.t.length;
  // Moyennes pondérées de groupe (période jugée) : x pour chaque prédicteur, t pour la cible.
  const moyennes = function* (valeurs, poids) {
    const s = new Map();
    for (let i = 0; i < n; i++) {
      const pd = poids(i);
      if ((i & 32767) === 32767) yield 'jugement (moyennes)';
      if (!(pd > 0) || !Number.isFinite(valeurs[i])) continue;
      const m = s.get(L.g[i]) ?? [0, 0];
      m[0] += pd * valeurs[i];
      m[1] += pd;
      s.set(L.g[i], m);
    }
    const out = new Map();
    for (const [g, [sv, sp]] of s) out.set(g, sv / sp);
    return out;
  };
  const poidsCible = (i) => L.e[i];
  const mT = yield* moyennes(L.t, poidsCible);
  const m10 = yield* moyennes(L.x10, poidsCible);
  const mW = yield* moyennes(L.xw, poidsCible);
  const mH = yield* moyennes(L.xh, poidsCible);
  const b10 = appris.actuelle?.beta ?? 0;
  const bW = appris.fenetre?.beta ?? 0;
  const bH = appris.demiVie?.beta ?? 0;
  const lignesCible = [];
  for (let i = 0; i < n; i++) if (L.e[i] > 0) lignesCible.push(i);
  const nc = lignesCible.length;
  const col = { bloc: new Float64Array(nc), jour: new Int32Array(nc), x10: new Float64Array(nc), xw: new Float64Array(nc), xh: new Float64Array(nc), base: new Float64Array(nc), l10: new Float64Array(nc), lW: new Float64Array(nc), lH: new Float64Array(nc) };
  for (let q = 0; q < nc; q++) {
    const i = lignesCible[q];
    if ((q & 32767) === 32767) yield 'jugement (erreurs)';
    const e = L.e[i];
    const y = L.t[i] * e;
    const tb = mT.get(L.g[i]);
    col.bloc[q] = L.bloc[i];
    col.jour[q] = L.jour[i];
    col.x10[q] = L.x10[i];
    col.xw[q] = L.xw[i];
    col.xh[q] = L.xh[i];
    col.base[q] = (y - e * tb) ** 2;
    col.l10[q] = (y - e * (tb + b10 * (L.x10[i] - m10.get(L.g[i])))) ** 2;
    col.lW[q] = (y - e * (tb + bW * (L.xw[i] - mW.get(L.g[i])))) ** 2;
    col.lH[q] = (y - e * (tb + bH * (L.xh[i] - mH.get(L.g[i])))) ** 2;
  }
  yield 'jugement (erreurs)';
  // Corrélations au sein du groupe, pondérées, avec leur fourchette (groupes tirés avec remise).
  const correlation = function* (xs, ts, es) {
    const groupesIdx = new Map();
    const brutes = [];
    for (let i = 0; i < xs.length; i++) {
      if ((i & 32767) === 32767) yield 'jugement (corrélations)';
      const e = es(i);
      const xv = xs[i];
      const tv = ts[i];
      if (!(e > 0) || !Number.isFinite(xv) || !Number.isFinite(tv)) continue;
      let g = groupesIdx.get(L.g[i]);
      if (g === undefined) {
        g = groupesIdx.size;
        groupesIdx.set(L.g[i], g);
        brutes.push(0, 0, 0, 0, 0, 0);
      }
      const b = g * 6;
      brutes[b] += e;
      brutes[b + 1] += e * xv;
      brutes[b + 2] += e * tv;
      brutes[b + 3] += e * xv * xv;
      brutes[b + 4] += e * tv * tv;
      brutes[b + 5] += e * xv * tv;
    }
    const G = groupesIdx.size;
    const c = centrer(Float64Array.from(brutes), G, 1);
    const tous = enCommun(c, G, 1, 0);
    const tires = [];
    if (G >= 2) {
      const u = generateur(graine);
      const choix = new Int32Array(G);
      for (let t = 0; t < tirages; t++) {
        const rt = enCommun(c, G, 1, 0, tirerGroupes(u, G, choix)).r;
        if (Number.isFinite(rt)) tires.push(rt);
        if (t % 200 === 199) yield 'jugement (corrélations)';
      }
    }
    tires.sort((u1, u2) => u1 - u2);
    return { r: arrondi(tous.r), fourchette: [arrondi(quantile(tires, 0.025)), arrondi(quantile(tires, 0.975))], groupes: G };
  };
  const pouvoir = yield* correlation(L.xw, L.t, poidsCible);
  const pouvoir10 = yield* correlation(L.x10, L.t, poidsCible);
  const autresR = {};
  for (let q = 0; q < autres.length; q++) {
    const ts = L.autres[q];
    const o = autres[q];
    autresR[o.id] = yield* correlation(L.xw, ts, (i) => (Number.isFinite(ts[i]) ? 1 : 0));
  }
  return { n: nc, colonnes: col, pouvoir: { ...pouvoir, n: nc }, pouvoir10, autresCibles: autresR, fenetre: w, demiVie: hv };
}

export const preparerJugement = (serie, statId, cibleId, appris, options) => executerSansPause(preparerJugementParMorceaux(serie, statId, cibleId, appris, options));

/** Le juge sur place (tests, petites cases) : les mêmes lignes que le fil à part (lignesDuJuge). */
export const JUGE_SUR_PLACE = Object.freeze({ comparer: async ({ blocs, a, b, n }, options) => comparer(lignesDuJuge(blocs, a, b, n), options) });

/** Les fenêtres déclarées (« déjà vu »), en numéros de jour. */
function fenetresVuesEnJours(fenetres) {
  return fenetres.map((f) => ({ id: f.id, de: numeroDuJour(f.de), a: numeroDuJour(f.a) }));
}

/** Les comptes « déjà vu » des lignes d'une comparaison : par fenêtre déclarée, et hors de toutes. */
function compterVues(jours, n, vues) {
  const parFenetre = {};
  let hors = 0;
  for (let i = 0; i < n; i++) {
    let dedans = false;
    for (const f of vues) {
      if (jours[i] >= f.de && jours[i] <= f.a) {
        parFenetre[f.id] = (parFenetre[f.id] ?? 0) + 1;
        dedans = true;
      }
    }
    if (!dedans) hors++;
  }
  return { total: n, parFenetre, horsVues: hors, indicatif: hors < n };
}

/** Le résumé d'un résultat de comparer : ce qu'on garde (jamais les tirages). */
const resumeDuJuge = (r) =>
  r && {
    verdict: r.verdict,
    raison: r.raison,
    gain: r.gain,
    fourchette: r.fourchette,
    ecartType: r.ecartType,
    p: r.p,
    a: r.a?.moyenne ?? null,
    b: r.b?.moyenne ?? null,
    gainRelatif: r.gain !== null && r.a?.moyenne ? r.gain / Math.abs(r.a.moyenne) : null,
    fourchetteRelative: r.fourchette && r.a?.moyenne ? r.fourchette.map((x) => x / Math.abs(r.a.moyenne)) : null,
    n: r.n,
    variantes: r.seuil?.variantes ?? null,
    z: r.seuil?.z ?? null
  };

/**
 * Une comparaison jugée (sens « min » : la plus petite erreur gagne) : sur toutes les lignes, puis sur les
 * seules lignes jamais vues quand il y en a assez (minBlocs blocs) — sinon « pas-assez » dit tel quel.
 */
async function juger({ blocs, jours, a, b, n }, { juge, variantes, tirages, graine, minBlocs, vues, pauses = null }) {
  const options = { sens: 'min', variantes, tirages, graine, minBlocs };
  // Le fil du juge travaille AILLEURS : son attente ne tient pas la main (creerPauses.attendre) ; sur place, le juge compte.
  const demander = (lignes) => (pauses ? pauses.attendre(juge.comparer(lignes, options), 'juge') : juge.comparer(lignes, options));
  const tout = resumeDuJuge(await demander({ blocs, a, b, n }));
  const comptes = compterVues(jours, n, vues);
  let jamaisVues = null;
  if (comptes.indicatif && comptes.horsVues > 0) {
    const garder = [];
    for (let i = 0; i < n; i++) if (!vues.some((f) => jours[i] >= f.de && jours[i] <= f.a)) garder.push(i);
    const sous = (t) => Float64Array.from(garder, (i) => t[i]);
    const blocsDistincts = new Set(garder.map((i) => blocs[i])).size;
    jamaisVues =
      blocsDistincts >= minBlocs
        ? resumeDuJuge(await demander({ blocs: sous(blocs), a: sous(a), b: sous(b), n: garder.length }))
        : { verdict: 'pas-assez-de-matchs', raison: `${blocsDistincts} matchs jamais vus, ${minBlocs} nécessaires.`, n: { lignes: garder.length, blocs: blocsDistincts } };
  }
  return { ...tout, vues: comptes, jamaisVues };
}

/** Le verdict « ce qui prédit / ce qui trompe » d'une comparaison face à la moyenne du championnat. */
export function verdictDuPouvoir(comparaison) {
  if (!comparaison || comparaison.verdict === 'pas-assez-de-matchs') return 'pas-assez';
  if (comparaison.verdict !== 'retenu') return 'trompe';
  const basRelatif = comparaison.fourchetteRelative?.[0] ?? null;
  return basRelatif !== null && basRelatif >= SEUIL_GAIN_UTILE ? 'compte' : 'faible';
}

/** Le verdict de la fenêtre : 10 confirmée, sauf si le juge retient la meilleure du calcul. */
export function verdictDeLaFenetre(meilleure, comparaison) {
  if (meilleure === null || meilleure === undefined) return { verdict: 'pas-assez', conseillee: FENETRE_ACTUELLE };
  if (meilleure === FENETRE_ACTUELLE) return { verdict: 'confirmee', conseillee: FENETRE_ACTUELLE };
  if (!comparaison || comparaison.verdict === 'pas-assez-de-matchs') return { verdict: 'pas-assez', conseillee: FENETRE_ACTUELLE };
  return comparaison.verdict === 'retenu' ? { verdict: 'proposee', conseillee: meilleure } : { verdict: 'confirmee', conseillee: FENETRE_ACTUELLE };
}

// ======================================================= 4. la fenêtre du moteur

const SORTES_DU_MOTEUR = Object.freeze({ corners: 'corners', tirs: 'shots', cadres: 'shotsOnTarget' });

/**
 * LA FENÊTRE DU MOTEUR (corners, tirs, tirs cadrés) dans les termes exacts du moteur. L'histoire d'une
 * équipe : ses rencontres RELEVÉES (les deux lignes team_stats ; attribuées et prolongées comprises, comme
 * statInputsRead) — au magasin, les 30 dernières à domicile et les 30 dernières à l'extérieur, réunies du
 * plus récent au plus ancien (à jour égal : clé décroissante) —, puis les w premières où le compte est
 * relevé (0-0 = non relevé au magasin). Pour chaque match (les deux camps) : l'attendu de statExpectations
 * avec la fenêtre w (au moins min(6, w) relevés de chaque côté — sinon le match n'est pas jugé, pour AUCUNE
 * fenêtre : les mêmes matchs partout) ; la perte log du compte réalisé sous la binomiale négative du moteur
 * (écrêtée à PROBA_MIN, comme le banc). Le calcul choisit la fenêtre de plus petite perte (fourchette : les
 * championnats-saisons tirés avec remise) ; le jugement compare 10 et elle. Contrôle (magasin) : les sommes
 * de la fenêtre de 10 face aux colonnes f10 de la table du jour J.
 */
export function* fenetreDuMoteurParMorceaux(serie, sorte, { calcul, jugement, fenetres = FENETRES_MOTEUR, tirages = 1000, graine = 1, garderLesFenetres = false } = {}) {
  const kind = SORTES_DU_MOTEUR[sorte];
  if (!kind) throw new Error(`fenêtre du moteur : sorte inconnue « ${sorte} »`);
  const invK = STAT_KINDS[kind].invKTeam;
  const pC = bornes(calcul);
  const pJ = bornes(jugement);
  const W = fenetres;
  const maxW = Math.max(...W);
  const parCote = serie.source === 'magasin' ? CANDIDATS_PAR_COTE : Infinity;
  // Des sommes de comptes entiers (au plus 38 × quelques dizaines) : exactes en Float32, deux fois moins de mémoire.
  const pour = new Float32Array(serie.n * W.length).fill(Number.NaN);
  const contre = new Float32Array(serie.n * W.length).fill(Number.NaN);
  const nombreW = new Int16Array(serie.n * W.length);
  const controle = { lignes: 0, ecarts: 0, exemples: [] };
  const aF10 = serie.source === 'magasin' && serie.col[`f10_${sorte}_n`];
  let depuisPause = 0;
  const dom = [];
  const ext = [];
  for (let e = 0; e < serie.nEntites; e++) {
    dom.length = 0;
    ext.length = 0;
    const fin = serie.debuts[e + 1];
    for (let i = serie.debuts[e]; i < fin; ) {
      const jour = serie.col.jour[i];
      let j = i + 1;
      while (j < fin && serie.col.jour[j] === jour) j++;
      // Les candidats d'avant ce jour : les plus récents d'abord (les listes sont dans l'ordre du temps).
      const cands = [];
      let a1 = dom.length - 1;
      let b1 = ext.length - 1;
      while (a1 >= 0 || b1 >= 0) {
        if (b1 < 0 || (a1 >= 0 && dom[a1] > ext[b1])) cands.push(dom[a1--]);
        else cands.push(ext[b1--]);
      }
      for (let r = i; r < j; r++) {
        let k = 0;
        let sp = 0;
        let sc = 0;
        let wi = 0;
        for (const q of cands) {
          if (serie.col.jour[q] >= jour) throw new Error('fenêtre du moteur : fuite refusée');
          const pr = paire(serie, sorte, q);
          if (!pr) continue;
          k++;
          sp += pr[0];
          sc += pr[1];
          while (wi < W.length && W[wi] === k) {
            pour[r * W.length + wi] = sp;
            contre[r * W.length + wi] = sc;
            nombreW[r * W.length + wi] = k;
            wi++;
          }
          if (k >= maxW) break;
        }
        for (; wi < W.length; wi++) {
          pour[r * W.length + wi] = sp;
          contre[r * W.length + wi] = sc;
          nombreW[r * W.length + wi] = k;
        }
        if (aF10) {
          const w10 = W.indexOf(FENETRE_ACTUELLE);
          const attendu = [deInt16(serie.col[`f10_${sorte}_p`][r]), deInt16(serie.col[`f10_${sorte}_c`][r]), deInt16(serie.col[`f10_${sorte}_n`][r])];
          const calcule = [pour[r * W.length + w10], contre[r * W.length + w10], nombreW[r * W.length + w10]];
          controle.lignes++;
          if (attendu[2] !== null && (attendu[0] !== calcule[0] || attendu[1] !== calcule[1] || attendu[2] !== calcule[2])) {
            controle.ecarts++;
            if (controle.exemples.length < 5) controle.exemples.push({ rencontre: serie.col.rencontre[r], attendu, calcule });
          }
        }
      }
      // Les rencontres du jour entrent dans les candidats (relevées seulement), 30 par côté au plus.
      for (let r = i; r < j; r++) {
        if (!(serie.col.drapeaux[r] & D.RELEVE)) continue;
        const liste = serie.col.drapeaux[r] & D.DOMICILE ? dom : ext;
        liste.push(r);
        if (liste.length > parCote) liste.shift();
      }
      depuisPause += j - i;
      if (depuisPause >= PAS) {
        depuisPause = 0;
        yield 'fenêtre du moteur';
      }
      i = j;
    }
  }
  // Les deux camps d'une rencontre.
  // Les deux camps d'une rencontre, dans deux tableaux (une Map de 200 000 rencontres pesait ~40 Mo).
  let maxRencontre = 0;
  for (let i = 0; i < serie.n; i++) if (serie.col.rencontre[i] > maxRencontre) maxRencontre = serie.col.rencontre[i];
  const campDom = new Int32Array(maxRencontre + 1).fill(-1);
  const campExt = new Int32Array(maxRencontre + 1).fill(-1);
  for (let i = 0; i < serie.n; i++) {
    if (serie.col.drapeaux[i] & D.DOMICILE) campDom[serie.col.rencontre[i]] = i;
    else campExt[serie.col.rencontre[i]] = i;
    if (i % 50_000 === 49_999) yield 'fenêtre du moteur (rencontres)';
  }
  yield 'fenêtre du moteur (rencontres)';
  const minimumDe = (w) => Math.min(MINIMUM_ACTUEL, w);
  const pertes = (hI, aI, wi) => {
    const nh = nombreW[hI * W.length + wi];
    const na = nombreW[aI * W.length + wi];
    const w = W[wi];
    if (nh < minimumDe(w) || na < minimumDe(w)) return null;
    const entrees = {
      home: { [kind]: { for: pour[hI * W.length + wi] / nh, against: contre[hI * W.length + wi] / nh, sample: nh } },
      away: { [kind]: { for: pour[aI * W.length + wi] / na, against: contre[aI * W.length + wi] / na, sample: na } }
    };
    const att = statExpectations({ statInputs: entrees })?.[kind];
    if (!att) return null;
    return [att.home, att.away];
  };
  const perteLogCompte = (mu, y) => {
    const { pmf } = loiDesComptes(Math.max(mu, 0.01), invK, y + 1);
    return -Math.log(Math.max(PROBA_MIN, pmf[y]));
  };
  const calculParGroupe = new Map();
  const lignesJ = { bloc: [], jour: [], pertes: [] };
  let matchsCalcul = 0;
  // Une rencontre coûte ~0,1 ms (une loi binomiale négative par fenêtre et par camp) : la main est rendue toutes les 64.
  let rencontresDepuisPause = 0;
  for (let rencontre = 0; rencontre <= maxRencontre; rencontre++) {
    const hI = campDom[rencontre];
    const aI = campExt[rencontre];
    if (hI < 0 || aI < 0) continue;
    const dr = serie.col.drapeaux[hI];
    if (dr & (D.ATTRIBUE | D.PROLONGATION)) continue;
    const jour = serie.col.jour[hI];
    const dansC = jour >= pC.de && jour <= pC.a;
    const dansJ = jour >= pJ.de && jour <= pJ.a;
    if (!dansC && !dansJ) continue;
    const realise = paire(serie, sorte, hI);
    if (!realise) continue;
    // Les mêmes matchs pour toutes les fenêtres : 6 relevés au moins de chaque côté (la règle d'aujourd'hui).
    const w10 = W.indexOf(FENETRE_ACTUELLE);
    if (nombreW[hI * W.length + w10] < MINIMUM_ACTUEL || nombreW[aI * W.length + w10] < MINIMUM_ACTUEL) continue;
    const parFenetre = [];
    let complet = true;
    for (let wi = 0; wi < W.length; wi++) {
      const att = pertes(hI, aI, wi);
      if (!att) {
        complet = false;
        break;
      }
      parFenetre.push([perteLogCompte(att[0], realise[0]), perteLogCompte(att[1], realise[1])]);
    }
    if (!complet) continue;
    if (dansC) {
      const g = serie.col.ligue[hI];
      const s = calculParGroupe.get(g) ?? { n: 0, sommes: new Float64Array(W.length) };
      for (let wi = 0; wi < W.length; wi++) s.sommes[wi] += parFenetre[wi][0] + parFenetre[wi][1];
      s.n += 2;
      calculParGroupe.set(g, s);
      matchsCalcul++;
    } else {
      lignesJ.bloc.push(rencontre, rencontre);
      lignesJ.jour.push(jour, jour);
      lignesJ.pertes.push(parFenetre.map((x) => x[0]), parFenetre.map((x) => x[1]));
    }
    if (++rencontresDepuisPause >= 64) {
      rencontresDepuisPause = 0;
      yield 'fenêtre du moteur (pertes)';
    }
  }
  // Le choix au calcul, et sa fourchette (les championnats-saisons tirés avec remise).
  const groupes = [...calculParGroupe.values()];
  const G = groupes.length;
  const choisir = (choix) => {
    const tot = new Float64Array(W.length);
    let nb = 0;
    for (let q = 0; q < choix.length; q++) {
      const s = groupes[choix[q]];
      nb += s.n;
      for (let wi = 0; wi < W.length; wi++) tot[wi] += s.sommes[wi];
    }
    let best = -1;
    for (let wi = 0; wi < W.length; wi++) {
      if (best < 0 || tot[wi] < tot[best] - 1e-12 || (Math.abs(tot[wi] - tot[best]) <= 1e-12 && W[wi] === FENETRE_ACTUELLE)) best = wi;
    }
    return { best, moyennes: Array.from(tot, (x) => (nb ? x / nb : null)) };
  };
  const tousG = Int32Array.from({ length: G }, (_, g) => g);
  const choixTous = G ? choisir(tousG) : { best: -1, moyennes: [] };
  const tires = [];
  if (G >= 2) {
    const u = generateur(graine);
    const choix = new Int32Array(G);
    for (let t = 0; t < tirages; t++) {
      const c = choisir(tirerGroupes(u, G, choix));
      if (c.best >= 0) tires.push(W[c.best]);
      if (t % 100 === 99) yield 'fenêtre du moteur (fourchette)';
    }
  }
  tires.sort((x, y) => x - y);
  const meilleure = choixTous.best >= 0 ? W[choixTous.best] : null;
  // Les colonnes du jugement : 10 contre la meilleure.
  const nJ = lignesJ.bloc.length;
  const iw = meilleure === null ? -1 : W.indexOf(meilleure);
  const i10 = W.indexOf(FENETRE_ACTUELLE);
  const colonnes = { blocs: Float64Array.from(lignesJ.bloc), jours: Int32Array.from(lignesJ.jour), a: Float64Array.from(lignesJ.pertes, (p) => p[i10]), b: iw < 0 ? null : Float64Array.from(lignesJ.pertes, (p) => p[iw]), n: nJ };
  return {
    sorte,
    calcul: { matchs: matchsCalcul, groupes: G, courbe: W.map((w, wi) => ({ fenetre: w, perteLog: arrondi(choixTous.moyennes[wi] ?? null, 6) })), meilleure, fourchette: [quantileDiscret(tires, 0.025), quantileDiscret(tires, 0.975)] },
    colonnes,
    controleF10: aF10 ? controle : null,
    // Pour les essais : les sommes de chaque fenêtre, ligne par ligne (ligne × fenêtre), face à la règle du moteur écrite à part.
    ...(garderLesFenetres ? { fenetres: { W, pour, contre, nombre: nombreW } } : {})
  };
}

export const fenetreDuMoteur = (serie, sorte, options) => executerSansPause(fenetreDuMoteurParMorceaux(serie, sorte, options));

// ======================================================= 5. le calcul complet

/** Les options du calcul, contrôlées (une option inconnue lève, jamais ignorée en silence). */
const OPTIONS_PERMISES = Object.freeze(['echelles', 'sources', 'statistiques', 'tirages', 'graine', 'minBlocs', 'fenetres', 'fenetresMoteur', 'demiVies', 'periodes', 'seuils', 'moteur']);
export function lireOptions(options = {}) {
  const inconnues = Object.keys(options).filter((k) => !OPTIONS_PERMISES.includes(k));
  if (inconnues.length) throw new LignesInvalides(`Option inconnue : ${inconnues.join(', ')} (${OPTIONS_PERMISES.join(', ')}).`);
  const o = {
    echelles: options.echelles ?? ['equipe', 'joueur'],
    sources: options.sources ?? ['magasin', 'football-data'],
    statistiques: options.statistiques ?? null,
    tirages: options.tirages ?? 1000,
    graine: options.graine ?? 1,
    minBlocs: options.minBlocs ?? 200,
    fenetres: options.fenetres ?? FENETRES,
    fenetresMoteur: options.fenetresMoteur ?? FENETRES_MOTEUR,
    demiVies: options.demiVies ?? DEMI_VIES,
    periodes: { ...PERIODES_DU_CALCUL, ...(options.periodes ?? {}) },
    seuils: { ...SEUILS, ...(options.seuils ?? {}) },
    moteur: options.moteur ?? true
  };
  for (const e of o.echelles) if (e !== 'equipe' && e !== 'joueur') throw new LignesInvalides(`Échelle inconnue : ${e}.`);
  for (const s of o.sources) if (!SOURCES.includes(s)) throw new LignesInvalides(`Source inconnue : ${s}.`);
  if (!o.fenetres.includes(FENETRE_ACTUELLE) || !o.fenetresMoteur.includes(FENETRE_ACTUELLE)) throw new LignesInvalides(`La grille des fenêtres doit contenir la fenêtre d'aujourd'hui (${FENETRE_ACTUELLE}).`);
  if (!Number.isInteger(o.tirages) || o.tirages < 100) throw new LignesInvalides('Au moins 100 tirages.');
  return o;
}

/** Les lignes du tableau qu'un calcul produira (le nombre de cases jugées de chaque famille). */
export function lignesPrevues(o) {
  const lignes = [];
  if (o.echelles.includes('equipe')) {
    for (const source of o.sources) for (const s of STATISTIQUES_EQUIPE) if (s.sources.includes(source) && (!o.statistiques || o.statistiques.includes(s.id))) lignes.push({ stat: s, echelle: 'equipe', source });
  }
  if (o.echelles.includes('joueur') && o.sources.includes('magasin')) {
    for (const s of STATISTIQUES_JOUEUR) if (!o.statistiques || o.statistiques.includes(s.id)) lignes.push({ stat: s, echelle: 'joueur', source: 'magasin' });
  }
  const moteur = o.moteur && o.echelles.includes('equipe') ? o.sources.flatMap((source) => Object.keys(SORTES_DU_MOTEUR).map((sorte) => ({ sorte, source }))) : [];
  return { lignes, moteur };
}

const libelleCible = (echelle, id) => (echelle === 'equipe' ? CIBLES_EQUIPE[id] : CIBLES_JOUEUR[id]) ?? id;
const pourcent = (x) => (x === null || x === undefined ? '?' : `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const fr = (n) => Number(n ?? 0).toLocaleString('fr-FR');

/** La phrase d'une ligne du tableau, pour Pierre. */
function phraseDuVerdict(verdict, { cible, comparaison, pouvoir, echelle }) {
  const quoi = echelle === 'equipe' ? 'matchs' : 'apparitions';
  const n = fr(comparaison?.n?.lignes ?? pouvoir?.n ?? 0);
  if (verdict === 'compte') return `Ses valeurs passées annoncent ${cible} des ${quoi} suivants au-delà du hasard : ${pourcent(comparaison.gainRelatif)} d'erreur en moins que la seule moyenne du championnat [${pourcent(comparaison.fourchetteRelative?.[0])} ; ${pourcent(comparaison.fourchetteRelative?.[1])}], sur ${n} ${quoi} jamais utilisés pour le calcul.`;
  if (verdict === 'faible') return `Ses valeurs passées annoncent un peu ${cible} des ${quoi} suivants : le gain est prouvé, mais sous 1 % de l'erreur (${pourcent(comparaison.gainRelatif)}), sur ${n} ${quoi}.`;
  if (verdict === 'trompe') return `Ses valeurs passées n'annoncent pas ${cible} des ${quoi} suivants au-delà du hasard (${n} ${quoi} jugés) : elle trompe qui la lit comme une tendance.`;
  return `Trop peu de ${quoi} pour juger (${n}).`;
}

/**
 * Une ligne du tableau pour une statistique : fiabilité, stabilisation, calcul, jugement, verdicts.
 * `juge` : { comparer({ blocs, a, b, n }, options) → Promise } (sur place, ou le fil à part).
 */
async function ligneDuTableau(serie, def, { echelle, source, o, juge, variantes, vues, executer, pauses }) {
  const periodes = o.periodes[source];
  const debut = performance.now();
  const gardiens = echelle === 'joueur' ? def.gardiens : null;
  const fiab = await executer(fiabiliteParMorceaux(serie, def.id, { de: periodes.calcul.de, a: periodes.calcul.a, moitieEquipe: o.seuils.moitieEquipe, minutesMoitie: o.seuils.minutesMoitie, tirages: o.tirages, graine: o.graine, gardiens }));
  const appris = await executer(apprendreParMorceaux(serie, def.id, def.cible, { de: periodes.calcul.de, a: periodes.calcul.a, fenetres: o.fenetres, demiVies: o.demiVies, histoireEquipe: o.seuils.histoireEquipe, minutesHistoire: o.seuils.minutesHistoire, tirages: o.tirages, graine: o.graine }));
  const autres = echelle === 'equipe' ? AUTRES_CIBLES_EQUIPE : [];
  const prep = await executer(preparerJugementParMorceaux(serie, def.id, def.cible, appris, { de: periodes.jugement.de, a: periodes.jugement.a, histoireEquipe: o.seuils.histoireEquipe, minutesHistoire: o.seuils.minutesHistoire, autresCibles: autres, tirages: o.tirages, graine: o.graine }));
  const base = { blocs: prep.colonnes.bloc, jours: prep.colonnes.jour, n: prep.n };
  const reglages = { juge, tirages: o.tirages, graine: o.graine, minBlocs: o.minBlocs, vues, pauses };
  const pouvoirJuge = prep.n ? await juger({ ...base, a: prep.colonnes.base, b: prep.colonnes.lW }, { ...reglages, variantes: variantes.pouvoir }) : null;
  const fenetreJuge = prep.n && appris.fenetre && appris.fenetre.valeur !== FENETRE_ACTUELLE ? await juger({ ...base, a: prep.colonnes.l10, b: prep.colonnes.lW }, { ...reglages, variantes: variantes.fenetre }) : null;
  const demiVieJuge = prep.n && appris.demiVie ? await juger({ ...base, a: prep.colonnes.l10, b: prep.colonnes.lH }, { ...reglages, variantes: variantes.demiVie }) : null;
  const vf = verdictDeLaFenetre(appris.fenetre?.valeur ?? null, fenetreJuge);
  const verdict = verdictDuPouvoir(pouvoirJuge);
  const cible = libelleCible(echelle, def.cible);
  const unite = echelle === 'equipe' ? 'matchs' : 'matchs de 90 minutes';
  return {
    statistique: def.id,
    echelle,
    source,
    libelle: def.libelle,
    cible: def.cible,
    libelleCible: cible,
    fiabilite: { ...fiab, unite },
    pouvoir: { r: prep.pouvoir.r, fourchette: prep.pouvoir.fourchette, n: prep.n, groupes: prep.pouvoir.groupes, rFenetreActuelle: prep.pouvoir10.r, rFenetreActuelleFourchette: prep.pouvoir10.fourchette, fenetre: prep.fenetre },
    autresCibles: prep.autresCibles,
    demiVie: appris.demiVie
      ? {
          valeur: appris.demiVie.valeur === Infinity ? null : appris.demiVie.valeur,
          sansFin: appris.demiVie.valeur === Infinity,
          fourchette: appris.demiVie.fourchette.map((x) => (x === Infinity ? null : x)),
          fourchetteBasSansFin: appris.demiVie.fourchette[0] === Infinity,
          fourchetteHautSansFin: appris.demiVie.fourchette[1] === Infinity,
          r: appris.demiVie.r
        }
      : null,
    fenetre: { actuelle: FENETRE_ACTUELLE, conseillee: vf.conseillee, verdict: vf.verdict, meilleureAuCalcul: appris.fenetre?.valeur ?? null, fourchette: appris.fenetre?.fourchette ?? [null, null], indicatif: Boolean(fenetreJuge?.vues?.indicatif) },
    calcul: { de: periodes.calcul.de, a: periodes.calcul.a, tranches: periodes.calcul.tranches, lignes: appris.lignes, groupes: appris.groupes, candidats: appris.candidats },
    jugement: { de: periodes.jugement.de, a: periodes.jugement.a, tranches: periodes.jugement.tranches, lignes: prep.n },
    comparaisons: { pouvoir: pouvoirJuge, fenetre: fenetreJuge, demiVie: demiVieJuge },
    verdict,
    raison: phraseDuVerdict(verdict, { cible, comparaison: pouvoirJuge, pouvoir: prep.pouvoir, echelle }),
    dureeMs: Math.round(performance.now() - debut)
  };
}

/** Une ligne « fenêtre du moteur » (corners, tirs, cadrés) : la fenêtre seule, dans les termes du moteur. */
async function ligneDuMoteur(serie, sorte, { source, o, juge, variantes, vues, executer, pauses }) {
  const periodes = o.periodes[source];
  const debut = performance.now();
  const r = await executer(fenetreDuMoteurParMorceaux(serie, sorte, { calcul: periodes.calcul, jugement: periodes.jugement, fenetres: o.fenetresMoteur, tirages: o.tirages, graine: o.graine }));
  const meilleure = r.calcul.meilleure;
  const comparaison = meilleure !== null && meilleure !== FENETRE_ACTUELLE && r.colonnes.n ? await juger({ blocs: r.colonnes.blocs, jours: r.colonnes.jours, a: r.colonnes.a, b: r.colonnes.b, n: r.colonnes.n }, { juge, variantes: variantes.moteur, tirages: o.tirages, graine: o.graine, minBlocs: o.minBlocs, vues, pauses }) : null;
  const vf = verdictDeLaFenetre(meilleure, comparaison);
  const nom = { corners: 'corners', tirs: 'tirs', cadres: 'tirs cadrés' }[sorte];
  return {
    statistique: `moteur_${sorte}`,
    echelle: 'equipe',
    source,
    libelle: `Fenêtre du moteur : ${nom} (attendu du moteur, binomiale négative)`,
    cible: `${sorte}_match`,
    libelleCible: `les ${nom} du match`,
    fiabilite: null,
    pouvoir: null,
    autresCibles: null,
    demiVie: null,
    fenetre: { actuelle: FENETRE_ACTUELLE, conseillee: vf.conseillee, verdict: vf.verdict, meilleureAuCalcul: meilleure, fourchette: r.calcul.fourchette, indicatif: Boolean(comparaison?.vues?.indicatif) },
    calcul: { de: periodes.calcul.de, a: periodes.calcul.a, tranches: periodes.calcul.tranches, matchs: r.calcul.matchs, groupes: r.calcul.groupes, courbe: r.calcul.courbe },
    jugement: { de: periodes.jugement.de, a: periodes.jugement.a, tranches: periodes.jugement.tranches, lignes: r.colonnes.n },
    comparaisons: { fenetre: comparaison },
    controleF10: r.controleF10,
    verdict: null,
    raison:
      vf.verdict === 'proposee'
        ? `${meilleure} matchs annoncent mieux les ${nom} que les 10 d'aujourd'hui, au-delà du hasard${comparaison?.vues?.indicatif ? ' (indicatif : des matchs jugés sont déjà vus)' : ''}. Rien n'est branché avant le banc et l'accord de Pierre.`
        : vf.verdict === 'confirmee'
          ? meilleure === FENETRE_ACTUELLE
            ? `Les 10 derniers matchs restent la meilleure fenêtre pour les ${nom}.`
            : `Les 10 derniers matchs sont confirmés pour les ${nom} : ${meilleure} ne fait pas mieux au-delà du hasard.`
          : `Trop peu de matchs pour juger la fenêtre des ${nom}.`,
    dureeMs: Math.round(performance.now() - debut)
  };
}

/**
 * LE CALCUL, sur des séries déjà chargées ({ equipe: { magasin?, 'football-data'? }, joueur: { magasin? } } —
 * les chargeurs plus bas, ou fabriquées par un essai). Rend { lignes, sautees, variantes, options }. `juge` :
 * le fil à part (jugeAPart.js) dans le serveur et le script, sur place par défaut. `rendreLaMain(fin)` : la
 * main rendue à la boucle d'événements (setImmediate) au plus toutes les ~25 ms ; sans elle, rien n'attend.
 * `variantes` : le nombre de cases jugées de chaque famille — par défaut celles des lignes prévues par les
 * options ; le calcul complet, qui passe une série à la fois, donne celui de TOUT le tableau.
 */
export async function calculerSurDesSeries(series, { options = {}, juge = JUGE_SUR_PLACE, rendreLaMain = null, avancement = null, journal = null, pauses: pausesDonnees = null, variantes: variantesDonnees = null, fait: faitAvant = 0, total: totalDonne = null } = {}) {
  const o = lireOptions(options);
  const rendre = rendreLaMain ? () => new Promise((fin) => rendreLaMain(fin)) : () => Promise.resolve();
  const pauses = pausesDonnees ?? creerPauses({ rendreLaMain: rendre });
  const executer = (gen) => executerEnRendantLaMain(gen, (ou) => pauses.siLongtemps(ou));
  const { lignes: prevues, moteur: moteurPrevu } = lignesPrevues(o);
  const variantes = variantesDonnees ?? variantesDu(o);
  // « Déjà vu » pour la VALEUR DES STATISTIQUES (portée de l'étape 18 ; correction du 19/10) : les réglages du 23/09 et
  // les fenêtres déclarées pour les statistiques — jamais celles qu'une autre grandeur a regardées (l'indice de 29).
  const vues = fenetresVuesEnJours(fenetresDeclarees({ portee: 'statistiques' }));
  const lignes = [];
  const sautees = [];
  let fait = faitAvant;
  const total = totalDonne ?? prevues.length + moteurPrevu.length;
  const contexte = { o, juge, variantes, vues, executer, pauses };
  for (const { stat, echelle, source } of prevues) {
    const serie = series?.[echelle]?.[source];
    if (!serie || !serie.n) {
      sautees.push({ statistique: stat.id, echelle, source, raison: 'série absente ou vide' });
      continue;
    }
    lignes.push(await ligneDuTableau(serie, stat, { echelle, source, ...contexte }));
    fait++;
    avancement?.({ partie: 'statistiques', fait, total });
    journal?.(`[valeur des stats] ${echelle} ${source} ${stat.id} : ${lignes.at(-1).verdict}, fenêtre ${lignes.at(-1).fenetre.verdict} (${lignes.at(-1).dureeMs} ms)`);
    await pauses.pause('statistique');
  }
  for (const { sorte, source } of moteurPrevu) {
    const serie = series?.equipe?.[source];
    if (!serie || !serie.n) {
      sautees.push({ statistique: `moteur_${sorte}`, echelle: 'equipe', source, raison: 'série absente ou vide' });
      continue;
    }
    lignes.push(await ligneDuMoteur(serie, sorte, { source, ...contexte }));
    fait++;
    avancement?.({ partie: 'fenêtre du moteur', fait, total });
    journal?.(`[valeur des stats] moteur ${source} ${sorte} : fenêtre ${lignes.at(-1).fenetre.verdict} (${lignes.at(-1).dureeMs} ms)`);
    await pauses.pause('fenêtre du moteur');
  }
  return { lignes, sautees, variantes, options: { ...o, demiVies: o.demiVies.map((x) => (x === Infinity ? null : x)) }, fait };
}

/** Le nombre de cases jugées de chaque famille, pour tout le tableau prévu par les options. */
export function variantesDu(o) {
  const { lignes, moteur } = lignesPrevues(o);
  return { pouvoir: Math.max(1, lignes.length), fenetre: Math.max(1, lignes.length), demiVie: Math.max(1, lignes.length), moteur: Math.max(1, moteur.length) };
}

// ======================================================= 6. la lecture de la base (de l'appelant)

/*
 * LES SÉRIES, lues dans la base de l'APPELANT (jamais une base ouverte ici), par pages courtes (aucune
 * lecture tenue pendant que la main est rendue), UNE À LA FOIS (la mémoire d'une seule série) :
 *   - équipes du magasin : team_day (+ match_key), par plages de rencontres ;
 *   - football-data : fd_history jusqu'à la fin de son jugement (P2), par plages d'identifiants, en faits de
 *     la table du jour J (faitsDepuisFd : la même forme que le magasin) ;
 *   - joueurs : player_day (lignes jouées), par paquets de joueurs, déjà rangées (joueur, jour) ; le
 *     championnat, la saison et les drapeaux de chaque rencontre viennent de team_day.
 * Générateurs (points d'arrêt entre deux pages).
 */

const COLONNES_TEAM_DAY = ['rencontre', 'camp', 'club', 'adversaire', 'date', 'league', 'saison', 'attribue', 'prolongation', 'compte', 'coupe', 'releve', 'bp', 'bc', 'xg_p', 'xg_c', 'tirs_p', 'tirs_c', 'cadres_p', 'cadres_c', 'corners_p', 'corners_c', 'jaunes_p', 'jaunes_c', 'rouges_p', 'rouges_c', 'fautes_p', 'fautes_c', 'occasions_p', 'occasions_c', 'possession_p', ...F10];

/** Les équipes du magasin (table du jour J). */
export function* chargerEquipesDuMagasin(database) {
  const maxRencontre = database.prepare('SELECT MAX(rencontre) m FROM day_matches').get()?.m ?? 0;
  const b = new ConstructeurDeSerie({ echelle: 'equipe', source: 'magasin', capacite: 2 * maxRencontre + 16 });
  const page = database.prepare(`SELECT ${COLONNES_TEAM_DAY.map((c) => `t.${c}`).join(', ')}, d.match_key FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre WHERE t.rencontre > ? AND t.rencontre <= ?`);
  for (let debut = 0; debut < maxRencontre; debut += 1000) {
    for (const r of page.all(debut, debut + 1000)) b.ajouter(r);
    yield 'lecture des équipes';
  }
  const lignes = b.n;
  return { serie: yield* b.terminer(), comptes: { lignesEquipeMagasin: lignes } };
}

/** football-data, de 2000 à la fin de son jugement (`fin`, AAAA-MM-JJ). */
export function* chargerFootballData(database, { fin = PERIODES_DU_CALCUL['football-data'].jugement.a } = {}) {
  const maxId = database.prepare('SELECT MAX(id) m FROM fd_history').get()?.m ?? 0;
  const page = database.prepare('SELECT id, code, saison, date, date_fichier, dom, ext, bd, be, tirs_d, tirs_e, cadres_d, cadres_e, corners_d, corners_e, jaunes_d, jaunes_e, rouges_d, rouges_e, fautes_d, fautes_e FROM fd_history WHERE id > ? AND id <= ? AND date <= ?');
  const b = new ConstructeurDeSerie({ echelle: 'equipe', source: 'football-data', capacite: 1 << 19 });
  let matchs = 0;
  for (let debut = 0; debut < maxId; debut += 5000) {
    const rangees = page.all(debut, debut + 5000, fin ?? '9999-12-31');
    matchs += rangees.length;
    for (const f of faitsDepuisFd(rangees)) b.ajouter(f);
    yield 'lecture de football-data';
  }
  return { serie: yield* b.terminer(), comptes: { matchsFootballData: matchs } };
}

/** Les joueurs du magasin (lignes jouées de player_day), avec le championnat-saison et les drapeaux de leur rencontre. */
export function* chargerJoueurs(database) {
  const maxRencontre = database.prepare('SELECT MAX(rencontre) m FROM day_matches').get()?.m ?? 0;
  const ligue = new Int32Array(maxRencontre + 1).fill(-1);
  const drapeaux = new Uint8Array(maxRencontre + 1);
  const groupes = [];
  const index = new Map();
  const rencontres = database.prepare('SELECT rencontre, league, saison, attribue, prolongation, compte, coupe FROM team_day WHERE camp = 1 AND rencontre > ? AND rencontre <= ?');
  for (let debut = 0; debut < maxRencontre; debut += 2000) {
    for (const r of rencontres.all(debut, debut + 2000)) {
      const cle = `${r.league}|${r.saison}`;
      let k = index.get(cle);
      if (k === undefined) {
        k = groupes.length;
        index.set(cle, k);
        groupes.push({ league: r.league, saison: r.saison });
      }
      ligue[r.rencontre] = k;
      drapeaux[r.rencontre] = (!r.coupe && r.compte ? D.CHAMPIONNAT : 0) | (r.attribue ? D.ATTRIBUE : 0) | (r.prolongation ? D.PROLONGATION : 0);
    }
    yield 'lecture des rencontres';
  }
  // La capacité : les lignes joueur notées par la table du jour J, une seule allocation (jamais un COUNT(*) qui balaierait la table).
  let capacite = 1 << 20;
  try {
    const comptes = JSON.parse(database.prepare("SELECT valeur FROM day_state WHERE cle = 'comptes'").get()?.valeur ?? '{}');
    if (Number.isInteger(comptes.lignesJoueur) && comptes.lignesJoueur > 0) capacite = Math.ceil(comptes.lignesJoueur * 0.8) + 1024;
  } catch {
    // la capacité par défaut : les colonnes grandissent toutes seules
  }
  const b = new ConstructeurDeSerie({ echelle: 'joueur', source: 'magasin', capacite, dejaRangee: true });
  // 150 joueurs (~4 500 lignes) par page : 400 tenaient ~0,3 s d'un bloc (mesuré le 13/10).
  const suivants = database.prepare('SELECT DISTINCT joueur FROM player_day WHERE joueur > ? ORDER BY joueur LIMIT 150');
  const lignes = database.prepare(`SELECT joueur, date, rencontre, poste, ${COMPTES_JOUEUR.join(', ')} FROM player_day WHERE joueur >= ? AND joueur <= ? AND joue = 1 ORDER BY joueur, date, rencontre`);
  let apres = 0;
  let sansRencontre = 0;
  for (;;) {
    const paquet = suivants.all(apres).map((r) => r.joueur);
    if (!paquet.length) break;
    for (const r of lignes.all(paquet[0], paquet.at(-1))) {
      const k = r.rencontre <= maxRencontre ? ligue[r.rencontre] : -1;
      if (k < 0) {
        sansRencontre++;
        continue;
      }
      const dr = drapeaux[r.rencontre];
      r.groupe = groupes[k];
      r.championnat = Boolean(dr & D.CHAMPIONNAT);
      r.attribue = Boolean(dr & D.ATTRIBUE);
      r.prolongation = Boolean(dr & D.PROLONGATION);
      b.ajouter(r);
    }
    apres = paquet.at(-1);
    yield 'lecture des joueurs';
  }
  const n = b.n;
  return { serie: yield* b.terminer(), comptes: { lignesJoueur: n, lignesJoueurSansRencontre: sansRencontre, capaciteJoueurs: capacite } };
}

/** Les étapes du calcul complet, dans l'ordre : une série chargée, calculée, lâchée, puis la suivante. */
const ETAPES_DU_CALCUL = Object.freeze([
  Object.freeze({ echelle: 'equipe', source: 'magasin', charger: (database) => chargerEquipesDuMagasin(database) }),
  Object.freeze({ echelle: 'equipe', source: 'football-data', charger: (database, o) => chargerFootballData(database, { fin: o.periodes['football-data'].jugement.a }) }),
  Object.freeze({ echelle: 'joueur', source: 'magasin', charger: (database) => chargerJoueurs(database) })
]);

/**
 * LE CALCUL DE BOUT EN BOUT, dans la base de l'appelant : chaque série lue, calculée puis lâchée avant la
 * suivante (la mémoire d'une seule série à la fois), et le bilan — durées par partie, mémoire, plus long moment
 * sans rendre la main (l'attente du fil du juge n'en est pas un : la main est libre pendant ce temps).
 * N'écrit rien : ouvrirCalcul / finirCalcul le font.
 */
export async function calculerValeurDesStatistiques({ database, options = {}, juge = JUGE_SUR_PLACE, rendreLaMain = null, avancement = null, journal = null } = {}) {
  const o = lireOptions(options);
  const rendre = rendreLaMain ? () => new Promise((fin) => rendreLaMain(fin)) : () => Promise.resolve();
  const pauses = creerPauses({ rendreLaMain: rendre });
  const bilan = { version: VERSION_VALEUR_STATS, debut: new Date().toISOString(), fin: null, dureeMs: null, parties: {}, comptes: { series: {} }, rssMax: process.memoryUsage.rss(), erreur: null };
  const debut = performance.now();
  const mesurer = async (nom, f) => {
    const t = performance.now();
    try {
      return await f();
    } finally {
      bilan.parties[nom] = Math.round(performance.now() - t);
      bilan.rssMax = Math.max(bilan.rssMax, process.memoryUsage.rss());
    }
  };
  const variantes = variantesDu(o);
  const { lignes: prevues, moteur } = lignesPrevues(o);
  const total = prevues.length + moteur.length;
  const lignes = [];
  const sautees = [];
  let fait = 0;
  try {
    for (const etape of ETAPES_DU_CALCUL) {
      if (!o.echelles.includes(etape.echelle) || !o.sources.includes(etape.source)) continue;
      const nom = `${etape.echelle}:${etape.source}`;
      avancement?.({ partie: `lecture ${nom}`, fait, total });
      const { serie, comptes } = await mesurer(`lecture ${nom}`, () => executerEnRendantLaMain(etape.charger(database, o), (ou) => pauses.siLongtemps(ou)));
      Object.assign(bilan.comptes, comptes);
      bilan.comptes.series[nom] = { lignes: serie.n, entites: serie.nEntites, groupes: serie.ligues.length };
      await pauses.pause('lecture finie');
      const r = await mesurer(`calcul ${nom}`, () => calculerSurDesSeries({ [etape.echelle]: { [etape.source]: serie } }, { options: { ...options, echelles: [etape.echelle], sources: [etape.source] }, juge, avancement, journal, pauses, variantes, fait, total }));
      lignes.push(...r.lignes);
      sautees.push(...r.sautees);
      fait = r.fait;
    }
    bilan.comptes.lignesDuTableau = lignes.length;
    bilan.comptes.sautees = sautees;
    bilan.variantes = variantes;
    bilan.controleF10 = lignes.filter((l) => l.controleF10).map((l) => ({ statistique: l.statistique, source: l.source, ...l.controleF10 }));
    Object.assign(bilan, { fin: new Date().toISOString(), dureeMs: Math.round(performance.now() - debut), ...pauses.bilan(), rssMax: Math.max(bilan.rssMax, process.memoryUsage.rss()) });
    return { lignes, bilan, options: { ...o, demiVies: o.demiVies.map((x) => (x === Infinity ? null : x)) } };
  } catch (error) {
    Object.assign(bilan, { fin: new Date().toISOString(), dureeMs: Math.round(performance.now() - debut), ...pauses.bilan(), erreur: `${error.name === 'Error' ? '' : `${error.name} : `}${error.message}` });
    return { lignes: null, bilan, options: o };
  }
}

// ======================================================= 7. le dépôt (tables stat_value_runs, stat_value)

/** Une écriture refusée : le calcul n'existe pas, ou il est déjà fini. */
export class CalculDejaFini extends Error {}

/** Le lancement d'un calcul : une ligne, sans bilan. Rend son identifiant. */
export function ouvrirCalcul({ database, ou, options, maintenant = new Date().toISOString() }) {
  if (ou !== 'bac' && ou !== 'serveur' && ou !== 'essai') throw new RangeError(`ouvrirCalcul : « ou » vaut « bac », « serveur » ou « essai » (${String(ou)}).`);
  const r = database.prepare('INSERT INTO stat_value_runs (lance_le, fini_le, ou, version, options, bilan) VALUES (?, NULL, ?, ?, ?, NULL)').run(maintenant, ou, VERSION_VALEUR_STATS, JSON.stringify(options ?? {}));
  return Number(r.lastInsertRowid);
}

const colonne = (x) => (x === null || x === undefined || (typeof x === 'number' && !Number.isFinite(x)) ? null : x);

/**
 * La fin d'un calcul, en UNE transaction : les lignes du tableau (stat_value) et le bilan, sur un calcul
 * encore ouvert — sinon CalculDejaFini (rien n'est réécrit). Un calcul en erreur se finit sans lignes.
 */
export function finirCalcul({ database, id, bilan, lignes = [], maintenant = new Date().toISOString() }) {
  const inserer = database.prepare(`INSERT INTO stat_value (calcul, statistique, echelle, source, cible, fiabilite, fiabilite_bas, fiabilite_haut, fiabilite_n, fiabilite_10,
    stabilisation, stabilisation_bas, stabilisation_haut, pouvoir, pouvoir_bas, pouvoir_haut, pouvoir_n, demi_vie, demi_vie_bas, demi_vie_haut,
    fenetre_actuelle, fenetre_conseillee, fenetre_bas, fenetre_haut, verdict_fenetre, verdict, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  database.exec('BEGIN IMMEDIATE');
  try {
    const ouvert = database.prepare('SELECT fini_le FROM stat_value_runs WHERE id = ?').get(id);
    if (!ouvert || ouvert.fini_le !== null) throw new CalculDejaFini(`Le calcul n° ${id} est déjà fini, ou n'existe pas : rien n'est réécrit.`);
    for (const l of lignes ?? []) {
      const f = l.fiabilite;
      inserer.run(
        id, l.statistique, l.echelle, l.source, l.cible,
        colonne(f?.fiabilite), colonne(f?.fourchette?.[0]), colonne(f?.fourchette?.[1]), colonne(f?.segments), colonne(f?.fiabilite10),
        colonne(f?.stabilisation), colonne(f?.stabilisationFourchette?.[0]), colonne(f?.stabilisationFourchette?.[1]),
        colonne(l.pouvoir?.r), colonne(l.pouvoir?.fourchette?.[0]), colonne(l.pouvoir?.fourchette?.[1]), colonne(l.pouvoir?.n),
        colonne(l.demiVie?.valeur), colonne(l.demiVie?.fourchette?.[0]), colonne(l.demiVie?.fourchette?.[1]),
        l.fenetre.actuelle, colonne(l.fenetre.conseillee), colonne(l.fenetre.fourchette?.[0]), colonne(l.fenetre.fourchette?.[1]),
        l.fenetre.verdict, l.verdict ?? null, JSON.stringify(l)
      );
    }
    const r = database.prepare('UPDATE stat_value_runs SET fini_le = ?, bilan = ? WHERE id = ? AND fini_le IS NULL').run(maintenant, JSON.stringify(bilan ?? null), id);
    if (r.changes !== 1) throw new CalculDejaFini(`Le calcul n° ${id} est déjà fini : rien n'est réécrit.`);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

const lireJson = (texte) => {
  if (texte === null || texte === undefined) return null;
  try {
    return JSON.parse(texte);
  } catch {
    return { illisible: true };
  }
};
const tableAbsente = (error) => /no such table/i.test(String(error?.message ?? ''));

/** Les derniers calculs (sans leurs lignes), du plus récent au plus ancien ; [] sans table. */
export function calculsDe({ database, limite = 10 }) {
  try {
    return database.prepare('SELECT id, lance_le, fini_le, ou, version, options, bilan FROM stat_value_runs ORDER BY id DESC LIMIT ?').all(limite).map((r) => ({ id: r.id, lanceLe: r.lance_le, finiLe: r.fini_le, interrompu: r.fini_le === null, ou: r.ou, version: r.version, options: lireJson(r.options), bilan: lireJson(r.bilan) }));
  } catch (error) {
    if (tableAbsente(error)) return [];
    throw error;
  }
}

/** Le dernier calcul FINI sans erreur, avec ses lignes (le détail de chacune), ou null. N'écrit rien. */
export function dernierCalcul({ database, avecLignes = true }) {
  let r;
  try {
    r = database.prepare("SELECT id, lance_le, fini_le, ou, version, options, bilan FROM stat_value_runs WHERE fini_le IS NOT NULL AND (bilan IS NULL OR json_extract(bilan, '$.erreur') IS NULL) ORDER BY id DESC LIMIT 1").get();
  } catch (error) {
    if (tableAbsente(error)) return null;
    throw error;
  }
  if (!r) return null;
  const calcul = { id: r.id, lanceLe: r.lance_le, finiLe: r.fini_le, ou: r.ou, version: r.version, options: lireJson(r.options), bilan: lireJson(r.bilan) };
  if (!avecLignes) return { calcul, lignes: null };
  const lignes = database.prepare('SELECT detail FROM stat_value WHERE calcul = ? ORDER BY echelle, source, statistique').all(r.id).map((x) => lireJson(x.detail));
  return { calcul, lignes };
}

/**
 * POUR LES ÉTAPES 27, 29 ET 30 : ce que le dernier calcul fini dit d'UNE statistique — sa demi-vie, sa
 * fenêtre conseillée, sa stabilisation, sa fiabilité, son pouvoir prédictif. Lecture seule, rien n'est
 * recalculé. Exemple :
 *
 *   import { lireParametresStatistique, poidsDemiVie } from '../../bench/statValue.js';
 *   const xg = lireParametresStatistique({ statistique: 'xg_pour', echelle: 'equipe', database });
 *   // xg?.demiVieMatchs → 13 (Infinity : aucune décroissance ; null : non mesurée) ;
 *   // le poids d'un match d'il y a k matchs : poidsDemiVie(k, xg.demiVieMatchs).
 *
 * À LIRE AU MOMENT DE CONSTRUIRE l'étape, puis à RECOPIER dans ses réglages versionnés (étape 25), avec
 * `calcul.id` pour la trace : jamais relu chaque nuit par le moteur (un nouveau calcul changerait les
 * chiffres sans nouvelle version). Déclarer aussi VUES_DE_L_ETAPE_18 dans les `vues` de son lancement.
 * Rend null si aucun calcul n'est fini, ou si la statistique n'y est pas.
 */
export function lireParametresStatistique({ statistique, echelle = 'equipe', source = 'magasin', database }) {
  const d = dernierCalcul({ database, avecLignes: false });
  if (!d) return null;
  const r = database.prepare('SELECT detail FROM stat_value WHERE calcul = ? AND statistique = ? AND echelle = ? AND source = ?').get(d.calcul.id, statistique, echelle, source);
  if (!r) return null;
  const l = lireJson(r.detail);
  const demiVie = l.demiVie ? (l.demiVie.sansFin ? Infinity : l.demiVie.valeur) : null;
  return {
    statistique: l.statistique,
    echelle: l.echelle,
    source: l.source,
    libelle: l.libelle,
    cible: l.cible,
    demiVieMatchs: demiVie,
    demiVieFourchette: l.demiVie ? [l.demiVie.fourchetteBasSansFin ? Infinity : l.demiVie.fourchette[0], l.demiVie.fourchetteHautSansFin ? Infinity : l.demiVie.fourchette[1]] : null,
    fenetreConseillee: l.fenetre.conseillee,
    fenetreActuelle: l.fenetre.actuelle,
    verdictFenetre: l.fenetre.verdict,
    // Une fenêtre proposée sur des matchs déjà vus (P4b au magasin) est INDICATIVE : la preuve est celle de football-data (P2), ou le banc.
    fenetreIndicatif: Boolean(l.fenetre.indicatif),
    fenetreFourchette: l.fenetre.fourchette ?? null,
    meilleureFenetreAuCalcul: l.fenetre.meilleureAuCalcul,
    stabilisationMatchs: l.fiabilite ? (l.fiabilite.stabilisationSansFin ? Infinity : l.fiabilite.stabilisation) : null,
    fiabilite: l.fiabilite?.fiabilite ?? null,
    fiabilite10: l.fiabilite?.fiabilite10 ?? null,
    pouvoir: l.pouvoir?.r ?? null,
    verdict: l.verdict,
    unite: l.echelle === 'joueur' ? 'apparitions (stabilisation : matchs de 90 minutes)' : 'matchs',
    calcul: { id: d.calcul.id, finiLe: d.calcul.finiLe, version: d.calcul.version },
    apprisSur: l.calcul ? { de: l.calcul.de, a: l.calcul.a, tranches: l.calcul.tranches } : null,
    jugeSur: l.jugement ? { de: l.jugement.de, a: l.jugement.a, tranches: l.jugement.tranches } : null
  };
}
