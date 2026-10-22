/**
 * engineVersions.js — les VERSIONS DU MOTEUR (étape 25 du plan, le socle, 07/10/2026).
 * -----------------------------------------------------------------------
 * Trois choses, et seulement elles (la coupure de l'étape en deux) :
 *   1. un NUMÉRO pour chaque état du moteur, enregistré avec chaque pronostic
 *      (journal des pronostics, pronostics gelés de engine_picks) et dans le
 *      engineSnapshot des analyses IA : analyzeMatch le pose (engineVersion) ;
 *   2. la VERSION CANDIDATE, déclarée dans le code (CANDIDATE_EN_ESSAI), mise
 *      en essai au registre de l'étape 16 et calculée « à blanc » chaque nuit
 *      par data/enregistreurs/moteurABlanc.js — ses chiffres vont dans une
 *      table à part, jamais montrés comme pronostic, jamais pariés, jamais
 *      envoyés à l'IA ;
 *   3. le RETOUR ARRIÈRE, qui remet d'un bloc les réglages de la version
 *      précédente, donc exactement ses chiffres et son numéro.
 * Seconde moitié (14/10/2026, après la calibration de l'étape 20) :
 *   4. L'ESSAI JUGÉ : chaque nuit, après le calcul à blanc, le juge de
 *      l'étape 16 compare la candidate à la version en service sur les mêmes
 *      matchs JOUÉS depuis le début de l'essai (moteurABlanc.js,
 *      bench/essaiCandidate.js) ; il ne se prononce qu'UNE fois, à l'horizon
 *      fixé d'avance (bench/horizonEssai.js) — avant, des premiers chiffres
 *      sans verdict (noterLEssai) ;
 *   5. L'ADOPTION « si meilleure » (adopterLaCandidate) : seulement sur le
 *      verdict « retenu », jamais pendant une passe ; engine-config.json écrit
 *      en une fois, une version de plus (origine « adoption »), le lancement
 *      déclaré au registre de la mesure (declarerLancement) ;
 *   6. le BANC AVANT L'ESSAI (bench/bancCandidate.js, noté ici par
 *      noterLeBancDeLaCandidate) : un verdict sur l'historique, INDICATIF,
 *      qui ne décide jamais d'une adoption ;
 *   7. le POINT D'ENTRÉE d'une candidate proposée par un autre module, avec
 *      son étiquette d'origine (proposerUneCandidate) — la correction du mois
 *      de l'étape 26 s'en servira ; rien ne propose encore.
 * L'alerte de dérive vit à part (data/deriveMoteur.js) : elle juge le moteur
 * EN SERVICE, pas une candidate.
 *
 * CE QUI FAIT UNE VERSION — deux empreintes, rien d'autre :
 *   - les RÉGLAGES effectifs de chaque sport : engine-config.json complété par
 *     les valeurs par défaut du code (lireReglagesDuMoteur). Empreinte = sha1
 *     d'une écriture STABLE : clés triées ; nombres à 12 chiffres
 *     significatifs (un curseur qui revient à 0,02 retrouve l'état 0,02, pas
 *     0,020000000000000004) ; les ENSEMBLES (la liste de vos bookmakers) triés
 *     et sans doublon, leur ordre ne changeant aucun chiffre ;
 *   - le CODE du moteur : le sha1 du TEXTE de chaque fichier qui calcule les
 *     chiffres ou prépare ses entrées (MODULES_DU_MOTEUR), fins de ligne et
 *     marque d'ordre des octets normalisées — le même fichier donne la même
 *     empreinte dans le bac, dans le dépôt et dans une copie d'essai. Le
 *     texte plutôt que les constantes exportées : une constante s'exporte,
 *     la logique d'une fonction (une fenêtre de 10 matchs, une règle de repli)
 *     non ; l'empreinte du texte ne laisse rien passer. Le prix : un
 *     commentaire retouché fait une version de plus. C'est voulu : un
 *     changement de code ne se prouve « sans effet » qu'en le mesurant ; une
 *     version de trop ne fausse rien, un changement de chiffres sans nouvelle
 *     version fausserait le juge.
 * Même état = même numéro : revenir à des réglages déjà vus (au retour arrière
 * ou à la main) reprend le numéro de cet état. Ne font PAS partie d'une
 * version : les données (elles changent chaque nuit), et les réglages de
 * risque de Pierre — coupe-circuit, garde-fous, délai de fraîcheur des cotes,
 * comptes bookmakers — qui décident d'un pari, pas d'un pronostic ; un retour
 * arrière n'y touche pas.
 *
 * QUI ÉCRIT data/runtime/engine-versions.json : le SERVEUR seul, toujours par
 * utils/atomicJson.js (fichier temporaire renommé) :
 *   - au démarrage (demarrerVersions, server.js) : la PREMIÈRE fois, la
 *     version 1 = l'état du moteur à ce moment, notée SANS RIEN CHANGER aux
 *     chiffres (engine-config.json n'est ni créé ni réécrit) ; ensuite, un
 *     code ou des réglages changés depuis la dernière fois (mise à jour de
 *     l'appli) font une version ;
 *   - à chaque enregistrement des réglages dans Réglages (avecUneVersion,
 *     appelé par config.controller.js) : une version, avec ce qui a changé ;
 *   - au retour arrière (revenirALaVersionPrecedente) et à l'adoption d'une
 *     candidate (adopterLaCandidate), jamais pendant une passe
 *     d'actualisation ni un import (le verrou) ;
 *   - la nuit, pour la candidate (mettreLaCandidateEnEssai, noterLEssai), et à
 *     la fin du banc de la candidate (noterLeBancDeLaCandidate) ;
 *   - quand un calcul du moteur, DANS LE SERVEUR, rencontre les réglages en
 *     service sans version (fichier modifié à la main, restauration) : notés
 *     à ce moment-là, une fois par minute au plus.
 * Un fichier illisible n'est JAMAIS pris pour vide ni réécrit : les
 * pronostics calculés pendant ce temps sont « sans version », la carte le
 * dit. Les autres processus (scripts, tests) ne font que LIRE. Les
 * pronostics enregistrés avant la version 1 ne sont jamais réécrits : ils
 * restent « sans version ».
 *
 * Toutes les fonctions prennent des options { fichier, racine, maintenant } :
 * un registre et une racine de code d'ESSAI (tests) — jamais celui de
 * data/runtime, qui est, dans le dépôt, celui de Pierre.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { getEngineConfig, lireReglagesDuMoteur, remplacerReglagesDuMoteur } from './engineConfig.js';
import { titreBookmaker } from './vosBookmakers.js';
import { isRefreshRunning } from '../../data/providers/refreshLock.js';
import { declarerVariante, declarerVariantes, declarerLancement, lireRegistre } from '../../bench/trialsRegistry.js';
import { LANCEMENTS, ETAPES_A_JUGER, jourValide, VARIANTES_DE_L_ETAPE_27 } from '../../bench/lancements.js';
import { problemeDHorizon, horizonDe } from '../../bench/horizonEssai.js';
import { normaliserIdEtape } from '../../data/roadmap/plan.js';
import { MARCHES_CONNUS } from '../../sports/football/markets.js';
import { reglagesDuModeleDeButs } from './goalModel.js';
import { NOTE_DU_MODELE_DE_BUTS } from './noteDuModeleDeButs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Le dossier src du serveur : les chemins des modules du moteur partent de là. */
export const SRC_DU_SERVEUR = path.resolve(__dirname, '../..');
export const FICHIER_VERSIONS = path.resolve(__dirname, '../../../data/runtime/engine-versions.json');
export const FORMAT_VERSIONS = 1;

/**
 * Le CODE DU MOTEUR, dont l'empreinte fait partie de chaque version :
 *   - les dossiers qui CALCULENT : le moteur (core/engine — sauf ce registre,
 *     qui ne calcule rien), la marge (core/market), les lois (core/model), la
 *     mise et les garde-fous (core/risk), les signaux (core/signals), les buts
 *     attendus (core/xg), et le sport (sports : modèle, marchés, corners et tirs) ;
 *   - les fichiers qui PRÉPARENT ses entrées et portent ses fenêtres et ses
 *     constantes (fenêtre 10/6, forme sur 5, moyennes de la ligue, entrées des
 *     corners et des tirs).
 * Hors de la liste : les lectures générales de l'appli, les écrans, l'IA, le
 * règlement — une donnée qui change n'est pas une version (elle change chaque
 * nuit), un écran non plus.
 * Étape 27 : le lecteur du modèle de buts unique (data/db/entreesButs.js) entre
 * dans l'empreinte ; le calcul de nuit des forces (data/db/forcesButs*.js) n'y
 * entre pas (un producteur de données, comme la table du jour J : ses formules
 * sont dans goalModel.js) ; la note mesurée au banc (noteDuModeleDeButs.js) non
 * plus (la remplir ne crée pas de version).
 */
export const MODULES_DU_MOTEUR = Object.freeze({
  dossiers: Object.freeze(['core/engine', 'core/market', 'core/model', 'core/risk', 'core/signals', 'core/xg', 'sports']),
  fichiers: Object.freeze([
    'data/providers/matchEnrichment.js',
    'data/db/statInputsRead.js',
    'data/db/scoreFormRead.js',
    'data/db/matchStatsRead.js',
    'data/providers/standingsService.js',
    'data/db/entreesButs.js'
  ]),
  // Étape 27 : les mots du modèle de buts (motsDuModeleDeButs.js) — corriger une phrase ne crée pas de version.
  horsEmpreinte: Object.freeze(['core/engine/engineVersions.js', 'core/engine/noteDuModeleDeButs.js', 'core/engine/motsDuModeleDeButs.js'])
});

/**
 * Étape 27 : les TÉMOINS qu'une candidate peut demander à blanc — calculés et rapportés à côté de ses familles,
 * hors du jugement principal, hors de son empreinte (`temoins`). Le score exact seulement : sa précision ne se
 * prouve ni à l'horizon de l'essai ni sûrement au banc ; on la regarde, on ne la juge pas.
 */
export const TEMOINS_CONNUS = Object.freeze(['scoreExact']);

/**
 * LA CANDIDATE, déclarée dans le CODE comme les lancements de l'étape 16 (les
 * données d'exécution du bac ne sont jamais recopiées chez Pierre : une
 * candidate notée seulement dans data/runtime disparaîtrait à la mise en
 * service). Aucune à l'étape 25 ; la première est celle de l'étape 27 (le
 * modèle de buts unique, 21/10/2026). Forme :
 *   {
 *     id:            identifiant court et stable — celui de la VARIANTE au
 *                    registre de la mesure (étape 16) ;
 *     etape:         l'étape du plan qui la propose (une étape à juger) ;
 *     quoi:          une phrase simple ;
 *     modifications: { football: { cle: valeur, … } } — posées sur les réglages
 *                    EN SERVICE (le code de la candidate, s'il est nouveau, est
 *                    livré avec et lit ces clés) ;
 *     marches:       ['totalGoals', …] — les familles de marchés qu'elle change :
 *                    les seules calculées et gardées à blanc ;
 *   facultatifs (seconde moitié, 14/10/2026) :
 *     horizon:       { matchs, jours } — quand le juge se prononce (horizonEssai.js :
 *                    600 matchs et 14 jours par défaut, jamais moins de 200 et 7) ;
 *     variantes:     [{ id, quoi }] — les AUTRES variantes regardées face à des
 *                    matchs joués pendant sa construction (le banc…) : comptées au
 *                    registre de la mesure dès la mise à blanc (le juge élargit sa
 *                    fourchette d'autant) ;
 *     vues:          [{ de, a, quoi }] — les fenêtres de matchs regardées pendant
 *                    sa construction : le banc avant l'essai les dit « déjà vues » ;
 *   étape 27 :
 *     temoins:       ['scoreExact'] — calculés à blanc et rapportés à côté, jamais
 *                    jugés, hors de son empreinte (TEMOINS_CONNUS) ;
 *     enMots:        la phrase pour Pierre, sans jargon, que la carte « Versions du
 *                    moteur » et la santé du moteur montrent à la place de `quoi`
 *                    (qui reste au registre de la mesure, et sur la carte dans un
 *                    « Détail technique » replié) ; hors de son empreinte, comme
 *                    `variantes`, `vues` et `temoins` (la changer ne recommence pas
 *                    l'essai).
 *   }
 * UNE ÉTAPE LIVRÉE COMME CANDIDATE N'AJOUTE PAS SON ENTRÉE À LANCEMENTS
 * (lancements.js) : la date de mise en service serait celle du premier
 * démarrage, alors qu'elle n'est pas en service. C'est l'adoption qui déclare
 * le lancement (declarerLancement, « a-chaud »), daté du jour de l'adoption.
 * Une candidate peut aussi être PROPOSÉE par un module (proposerUneCandidate,
 * avec son origine) : elle vit alors dans le registre des versions.
 *
 * ÉTAPE 27 (conception §2.2) : le modèle de buts unique (core/engine/goalModel.js),
 * mesuré au banc P2 (noteDuModeleDeButs.js : porte 1 franchie, une réserve
 * acceptée). K = 320 : elle-même et les 319 autres variantes regardées
 * (VARIANTES_DE_L_ETAPE_27). Ses deux fenêtres vues : football-data P1 et le
 * magasin 2023-07 → 2026-09-23 ; P2 (2019-2023) reste jamais vue.
 */
export const CANDIDATE_EN_ESSAI = Object.freeze({
  id: 'modele-buts-v1',
  etape: '27',
  enMots:
    'Un seul modèle pour tous les marchés de buts et le score : les pourcentages partent des cotes (1N2, et plus/moins 2,5 quand il est relevé) et sont ajustés par les xG des deux équipes ; sans cote, les xG (ou, à défaut, les buts) seuls.',
  quoi: 'Un seul modèle de buts : une grille des scores (Poisson et Dixon-Coles, rho −0,05) calée sur les cotes (1N2, et plus/moins 2,5 gratuit quand il existe), mélangée aux forces d’attaque et de défense tirées des xG ou des buts, pondérées dans le temps (demi-vies 35/25 remesurées sur 2024-25 et football-data 2001-2012 ; celles de l’étape 18, jugées sur 2019-2023, lues comme point de départ) ; tous les marchés de buts et le score en sortent ; démarrage à froid : retenu après mesure (m7).',
  modifications: Object.freeze({
    football: Object.freeze({
      modeleDeButs: Object.freeze({
        version: 1,
        rho: -0.05,
        demiVies: Object.freeze({ attaque: 35, defense: 25 }),
        prior: 8,
        statistique: 'mix',
        poidsXg: 0.7,
        changementDeChampionnat: 'remise-a-zero',
        ancrage: Object.freeze({ ligne: 2.5, methode: 'total-equilibre' }),
        melange: Object.freeze({ avecPlusMoins: Object.freeze({ wT: 0.1, wS: 0.1 }), sans: Object.freeze({ wT: 0.55, wS: 0.1 }) }),
        demarrageAFroid: Object.freeze({ matchs: 8 }),
        bornes: Object.freeze([0.2, 6])
      })
    })
  }),
  marches: Object.freeze(['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal']),
  temoins: Object.freeze(['scoreExact']),
  horizon: Object.freeze({ matchs: 800, jours: 21 }),
  variantes: Object.freeze(VARIANTES_DE_L_ETAPE_27.filter((v) => v.id !== 'modele-buts-v1')),
  vues: Object.freeze([
    Object.freeze({
      de: '2000-07-01',
      a: '2019-06-30',
      quoi: 'football-data P1 : rho, calage sur les cotes, loi des scores, livres et marge (cotes 2005-07-29 → 2019-06-30) ; forces apprises 2001-07 → 2012-06, mélange appris 2005-07 → 2012-06, vérifiés 2012-07 → 2019-06 ; promus et démarrage à froid (m5, m7).'
    }),
    Object.freeze({
      de: '2023-07-01',
      a: '2026-09-23',
      quoi: 'Magasin : forces chauffées 2023-07 → 2024-06 ; demi-vies, rétrécissement, statistique, changement de championnat, rho, poids du mélange et démarrage à froid appris sur 2024-07 → 2025-06, vérifiés sur 2025-07 → 2026-09-23 ; livres et heures de relevé ; puissance du juge et score face au score en service sur 2025-07 → 2026-09-23.'
    })
  ])
});

/**
 * Ce qui reste à venir sur la carte : le réglage refait chaque mois (la boucle de correction, étape 26). Son
 * point d'entrée existe (proposerUneCandidate) ; rien ne propose encore de candidate.
 */
export const A_VENIR = Object.freeze({
  correctionMensuelle: Object.freeze({
    quand: 'étape 26',
    quoi: 'Le réglage refait chaque mois : la correction du mois proposera elle-même une candidate (origine « correction-mensuelle »), qui passera par le même essai à blanc, le même juge et la même adoption.'
  })
});

/** D'où vient une candidate (son étiquette d'origine) ; une autre étiquette courte est dite telle quelle. */
export const ORIGINES_DE_CANDIDATE = Object.freeze({
  code: 'déclarée dans le code par une étape du plan',
  'correction-mensuelle': 'proposée par la correction du mois (étape 26)'
});
const ORIGINE_LISIBLE = /^[a-z0-9][a-z0-9-]{1,40}$/;

/** Ce qui a créé une version, en mots simples (la carte de Réglages les affiche tels quels). */
export const ORIGINES = Object.freeze({
  'premier-demarrage': 'premier démarrage de l’appli avec les versions : l’état du moteur à ce moment, rien de changé dans les chiffres',
  'etat-initial': 'état du moteur noté avant le premier changement de réglages',
  reglages: 'réglages enregistrés dans Réglages › Paramètres du moteur',
  'valeurs-par-defaut': 'réglages remis aux valeurs par défaut',
  code: 'mise à jour du code du moteur (notée au démarrage de l’appli)',
  'reglages-hors-appli': 'réglages changés hors de l’écran Réglages (fichier modifié à la main, restauration)',
  'code-et-reglages': 'mise à jour du code du moteur et de ses réglages (notée au démarrage de l’appli)',
  adoption: 'candidate adoptée dans Réglages : le juge de l’étape 16 l’a dite meilleure que la version en service sur des matchs joués après sa mise à blanc'
});

/** Le nom de chaque réglage du moteur, et comment écrire sa valeur (pourcent, nombre, liste). */
export const LIBELLES_REGLAGES = Object.freeze({
  edgeThresholdMin: Object.freeze({ libelle: 'Edge minimum requis', format: 'pourcent' }),
  edgeThresholdMax: Object.freeze({ libelle: 'Edge maximum accepté', format: 'pourcent' }),
  valueBookmakers: Object.freeze({ libelle: 'Vos bookmakers (un pari n’est recommandé que chez eux)', format: 'liste' }),
  maxValueOdds: Object.freeze({ libelle: 'Cote maximale d’un pari recommandé', format: 'nombre' }),
  defaultCorrelation: Object.freeze({ libelle: 'Corrélation Dixon-Coles (rho)', format: 'nombre' }),
  kellyFraction: Object.freeze({ libelle: 'Fraction de Kelly', format: 'nombre' }),
  maxStakePercent: Object.freeze({ libelle: 'Mise max (% bankroll)', format: 'pourcent' }),
  homeAdvantage: Object.freeze({ libelle: 'Avantage du terrain', format: 'nombre' }),
  cornersAdjustmentMax: Object.freeze({ libelle: 'Écart max affiché du signal corners', format: 'pourcent' }),
  maxExpectedRateGap: Object.freeze({ libelle: 'Écart maximal de buts attendus (garde-fou des mises)', format: 'nombre' }),
  'weights.market': Object.freeze({ libelle: 'Poids du marché dans le 1N2', format: 'pourcent' }),
  'weights.structural': Object.freeze({ libelle: 'Poids des facteurs structurels', format: 'pourcent' }),
  'weights.exogenous': Object.freeze({ libelle: 'Poids des facteurs exogènes', format: 'pourcent' }),
  // Étape 27 : le modèle de buts unique (posé en entier : « activé » / « absent : ancien modèle ») et ses réglages.
  modeleDeButs: Object.freeze({ libelle: 'Modèle de buts unique (étape 27)', format: 'modele-de-buts' }),
  'modeleDeButs.version': Object.freeze({ libelle: 'Modèle de buts : version', format: 'nombre' }),
  'modeleDeButs.rho': Object.freeze({ libelle: 'Modèle de buts : corrélation des petits scores (rho)', format: 'nombre' }),
  'modeleDeButs.demiVies.attaque': Object.freeze({ libelle: 'Modèle de buts : mémoire de l’attaque, en matchs', format: 'nombre' }),
  'modeleDeButs.demiVies.defense': Object.freeze({ libelle: 'Modèle de buts : mémoire de la défense, en matchs', format: 'nombre' }),
  'modeleDeButs.prior': Object.freeze({ libelle: 'Modèle de buts : matchs « moyens » ajoutés à chaque équipe', format: 'nombre' }),
  'modeleDeButs.statistique': Object.freeze({ libelle: 'Modèle de buts : statistique des forces (xG, buts ou les deux)', format: 'brut' }),
  'modeleDeButs.poidsXg': Object.freeze({ libelle: 'Modèle de buts : part des xG dans les forces', format: 'pourcent' }),
  'modeleDeButs.changementDeChampionnat': Object.freeze({ libelle: 'Modèle de buts : forces d’un club qui change de championnat', format: 'brut' }),
  'modeleDeButs.ancrage.ligne': Object.freeze({ libelle: 'Modèle de buts : ligne plus/moins qui cale le total', format: 'nombre' }),
  'modeleDeButs.ancrage.methode': Object.freeze({ libelle: 'Modèle de buts : façon de caler sur les cotes', format: 'brut' }),
  'modeleDeButs.melange.avecPlusMoins.wT': Object.freeze({ libelle: 'Modèle de buts : part des statistiques dans le total, avec cote plus/moins', format: 'pourcent' }),
  'modeleDeButs.melange.avecPlusMoins.wS': Object.freeze({ libelle: 'Modèle de buts : part des statistiques dans l’écart entre équipes, avec cote plus/moins', format: 'pourcent' }),
  'modeleDeButs.melange.sans.wT': Object.freeze({ libelle: 'Modèle de buts : part des statistiques dans le total, sans cote plus/moins', format: 'pourcent' }),
  'modeleDeButs.melange.sans.wS': Object.freeze({ libelle: 'Modèle de buts : part des statistiques dans l’écart entre équipes, sans cote plus/moins', format: 'pourcent' }),
  'modeleDeButs.demarrageAFroid.matchs': Object.freeze({ libelle: 'Modèle de buts : matchs connus avant de croire au total des statistiques', format: 'nombre' }),
  'modeleDeButs.bornes': Object.freeze({ libelle: 'Modèle de buts : buts attendus minimum et maximum', format: 'brut' })
});

/** Le registre ne se lit pas : rien n'y est écrit, aucun réglage n'est enregistré tant qu'il ne l'est pas. */
export class RegistreVersionsIllisible extends Error {
  constructor(message) {
    super(message);
    this.statut = 503;
  }
}

/** Le retour arrière n'a pas eu lieu : `raison` dit pourquoi (passe en cours, rien avant, autre code…), rien n'a changé. */
export class RetourImpossible extends Error {
  constructor(raison, message, statut = 409) {
    super(message);
    this.raison = raison;
    this.statut = statut;
  }
}

/** Une candidate déclarée qui ne tient pas debout : refusée, jamais calculée. */
export class CandidateInvalide extends Error {}

/** L'adoption n'a pas eu lieu : `raison` dit pourquoi (pas encore jugée, pas prouvé, moins bonne, passe en cours…), rien n'a changé. */
export class AdoptionImpossible extends Error {
  constructor(raison, message, statut = 409) {
    super(message);
    this.raison = raison;
    this.statut = statut;
  }
}

// ------------------------------------------------------------ outils

const sha1 = (texte) => crypto.createHash('sha1').update(texte).digest('hex');
const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texte = (v) => typeof v === 'string' && v.trim() !== '';
const copie = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const iso = (instant) => new Date(instant).toISOString();
const ABSENT = Symbol('registre absent');
/** Comparaison de chaînes indépendante de la langue du poste (localeCompare varie). */
const ordre = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Les réglages qui sont des ENSEMBLES : leur ordre ne change aucun chiffre. */
const ENSEMBLES = new Set(['valueBookmakers']);

/** Une écriture STABLE d'une valeur de réglage (clés triées, nombres à 12 chiffres, ensembles triés). */
function formeStable(valeur, cle = null) {
  if (Array.isArray(valeur)) {
    const liste = valeur.map((v) => formeStable(v));
    if (!ENSEMBLES.has(cle)) return liste;
    return [...new Set(liste.map((v) => JSON.stringify(v)))].sort(ordre).map((t) => JSON.parse(t));
  }
  if (objetSimple(valeur)) {
    const sortie = {};
    for (const k of Object.keys(valeur).sort(ordre)) if (valeur[k] !== undefined) sortie[k] = formeStable(valeur[k], k);
    return sortie;
  }
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? Number(valeur.toPrecision(12)) : String(valeur);
  return valeur ?? null;
}

/** L'empreinte des réglages d'UN sport (sha1, 40 caractères). */
export function empreinteDesReglages(config) {
  return sha1(JSON.stringify(formeStable(config ?? {})));
}

/** Les fichiers du moteur, chemins relatifs à src (barres obliques), triés. */
export function fichiersDuMoteur({ racine = SRC_DU_SERVEUR } = {}) {
  const hors = new Set(MODULES_DU_MOTEUR.horsEmpreinte);
  const liste = new Set();
  for (const dossier of MODULES_DU_MOTEUR.dossiers) {
    const absolu = path.join(racine, dossier);
    if (!fs.existsSync(absolu)) continue;
    for (const f of fs.readdirSync(absolu, { recursive: true })) {
      if (!String(f).endsWith('.js')) continue;
      liste.add(`${dossier}/${String(f).split(path.sep).join('/')}`);
    }
  }
  for (const f of MODULES_DU_MOTEUR.fichiers) liste.add(f);
  return [...liste].filter((f) => !hors.has(f)).sort(ordre);
}

const codesEnCache = new Map();

/**
 * L'empreinte du CODE du moteur : { empreinte (sha1, 40), fichiers: { chemin: sha1 (16) | 'absent' } }.
 * Texte normalisé (BOM retiré, fins de ligne \r\n → \n). Calculée une fois par processus et par racine :
 * le code ne change pas tant que le serveur tourne (une mise à jour prend effet au redémarrage).
 */
export function empreinteDuCode({ racine = SRC_DU_SERVEUR, rafraichir = false } = {}) {
  const cle = path.resolve(racine);
  if (!rafraichir && codesEnCache.has(cle)) return codesEnCache.get(cle);
  const fichiers = {};
  for (const rel of fichiersDuMoteur({ racine })) {
    let contenu;
    try {
      contenu = fs.readFileSync(path.join(racine, rel), 'utf8');
    } catch {
      fichiers[rel] = 'absent';
      continue;
    }
    fichiers[rel] = sha1(contenu.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')).slice(0, 16);
  }
  const code = Object.freeze({ empreinte: sha1(Object.keys(fichiers).map((rel) => `${rel}:${fichiers[rel]}`).join('\n')), fichiers: Object.freeze(fichiers) });
  codesEnCache.set(cle, code);
  return code;
}

const empreinteDeLEtat = (empreinteReglages, code) => sha1(JSON.stringify({ reglages: formeStable(empreinteReglages), code }));

/** L'état du moteur EN SERVICE : réglages effectifs de chaque sport, leurs empreintes, celle du code et celle de l'ensemble. */
export function etatDuMoteur({ racine = SRC_DU_SERVEUR, reglages = null } = {}) {
  const parSport = copie(reglages ?? lireReglagesDuMoteur());
  const empreinteReglages = {};
  for (const sport of Object.keys(parSport).sort(ordre)) empreinteReglages[sport] = empreinteDesReglages(parSport[sport]);
  const code = empreinteDuCode({ racine });
  return { reglages: parSport, empreinteReglages, code: { empreinte: code.empreinte, fichiers: { ...code.fichiers } }, empreinte: empreinteDeLEtat(empreinteReglages, code.empreinte) };
}

/** Les lancements déclarés par le code à ce moment (étape 16) : ce que contient une version, pour le juge. */
const lancementsDuCode = () => LANCEMENTS.map((l) => ({ etape: l.etape, version: l.version }));

// ------------------------------------------------------- ce qui a changé

const titres = (liste) => (Array.isArray(liste) ? liste.map((c) => (typeof c === 'string' ? titreBookmaker(c) : String(c))) : []);

function diffReglages(a, b, prefixe, sport, liste) {
  const cles = [...new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])].sort(ordre);
  for (const k of cles) {
    const cle = prefixe ? `${prefixe}.${k}` : k;
    const va = a?.[k];
    const vb = b?.[k];
    if (objetSimple(va) && objetSimple(vb)) {
      diffReglages(va, vb, cle, sport, liste);
      continue;
    }
    if (JSON.stringify(formeStable(va, k)) === JSON.stringify(formeStable(vb, k))) continue;
    const info = LIBELLES_REGLAGES[cle] ?? { libelle: cle, format: 'brut' };
    const changement = { type: 'reglage', sport, cle, libelle: info.libelle, format: info.format, avant: va ?? null, apres: vb ?? null };
    if (Array.isArray(va) || Array.isArray(vb)) {
      const avant = Array.isArray(va) ? va : [];
      const apres = Array.isArray(vb) ? vb : [];
      changement.ajoutes = titres(apres.filter((x) => !avant.includes(x)));
      changement.retires = titres(avant.filter((x) => !apres.includes(x)));
    }
    liste.push(changement);
  }
}

/** Ce qui sépare deux états : chaque réglage changé (avant → après), puis le code (fichiers modifiés, ajoutés, retirés). */
export function changementsEntre(avant, apres) {
  if (!avant || !apres) return [];
  const liste = [];
  const sports = [...new Set([...Object.keys(avant.reglages ?? {}), ...Object.keys(apres.reglages ?? {})])].sort(ordre);
  for (const sport of sports) diffReglages(avant.reglages?.[sport], apres.reglages?.[sport], '', sport, liste);
  if (avant.code?.empreinte !== apres.code?.empreinte) {
    const fa = avant.code?.fichiers ?? {};
    const fb = apres.code?.fichiers ?? {};
    liste.push({
      type: 'code',
      modifies: Object.keys(fb).filter((f) => f in fa && fa[f] !== fb[f]).sort(ordre),
      ajoutes: Object.keys(fb).filter((f) => !(f in fa)).sort(ordre),
      retires: Object.keys(fa).filter((f) => !(f in fb)).sort(ordre)
    });
  }
  return liste;
}

/** L'origine d'un état rencontré au démarrage : le code, les réglages, ou les deux ont changé depuis la version en service. */
function origineDuChangement(enService, etat) {
  if (!enService) return 'premier-demarrage';
  const code = enService.code?.empreinte !== etat.code.empreinte;
  const reglages = JSON.stringify(formeStable(enService.empreinteReglages)) !== JSON.stringify(formeStable(etat.empreinteReglages));
  if (code && reglages) return 'code-et-reglages';
  return code ? 'code' : 'reglages-hors-appli';
}

// ------------------------------------------------------------ registre

/** Ce qui ne va pas dans la forme du registre, en une phrase, ou null. */
function problemeDeForme(brut) {
  if (!objetSimple(brut)) return 'le contenu n’est pas un objet JSON';
  if (!Array.isArray(brut.versions) || !brut.versions.length) return '« versions » n’est pas une liste de versions';
  const numeros = new Set();
  for (const v of brut.versions) {
    if (!objetSimple(v) || !Number.isInteger(v.numero) || v.numero < 1) return 'une version n’a pas de numéro entier';
    if (numeros.has(v.numero)) return `la version ${v.numero} est écrite deux fois`;
    numeros.add(v.numero);
    if (!texte(v.empreinte) || !objetSimple(v.reglages) || !objetSimple(v.empreinteReglages) || !objetSimple(v.code) || !texte(v.code.empreinte)) {
      return `la version ${v.numero} est incomplète (réglages, empreintes ou code)`;
    }
  }
  if (!numeros.has(brut.enService)) return '« enService » ne désigne aucune version';
  if (!Array.isArray(brut.pile) || !brut.pile.length || !brut.pile.every((n) => numeros.has(n))) return '« pile » n’est pas une liste de versions';
  if (brut.pile.at(-1) !== brut.enService) return 'la version en service n’est pas la dernière de la pile';
  if (brut.journal !== undefined && !Array.isArray(brut.journal)) return '« journal » n’est pas une liste';
  if (brut.candidate !== undefined && brut.candidate !== null && !objetSimple(brut.candidate)) return '« candidate » n’est pas un objet';
  if (brut.candidatesPassees !== undefined && !Array.isArray(brut.candidatesPassees)) return '« candidatesPassees » n’est pas une liste';
  return null;
}

/** Le fichier tel qu'il est : { source: 'absent' | 'enregistre' | 'illisible', brut, probleme }. Aucun cache. */
function lireBrut(fichier) {
  let brut;
  try {
    brut = readJsonFile(fichier, ABSENT);
  } catch (error) {
    return { source: 'illisible', brut: null, probleme: error.message };
  }
  if (brut === ABSENT) return { source: 'absent', brut: null, probleme: null };
  const probleme = problemeDeForme(brut);
  if (probleme) return { source: 'illisible', brut: null, probleme: `forme inattendue (${probleme})` };
  return { source: 'enregistre', brut, probleme: null };
}

const messageIllisible = (fichier, probleme) =>
  `Le registre des versions du moteur (${fichier}) est illisible : ${String(probleme ?? 'raison inconnue').replace(/[.\s]+$/, '')}. Rien n’y est écrit tant qu’il l’est. ` +
  'S’il est tenu par OneDrive, réessayer dans un instant ; sinon le réparer à la main plutôt que le supprimer : il garde l’historique des versions.';

function lireOuLever(fichier) {
  const lecture = lireBrut(fichier);
  if (lecture.source === 'illisible') throw new RegistreVersionsIllisible(messageIllisible(fichier, lecture.probleme));
  return lecture;
}

/** La dernière lecture RÉUSSIE du registre, par fichier : celle du calcul du moteur (jamais une lecture ratée gardée). */
let enCache = { fichier: null, signature: null, brut: null };

/** Écrit le registre d'un bloc, en gardant tels quels les champs que ce code ne connaît pas ; réaligne la lecture en cache. */
function ecrire(fichier, brut, maintenant) {
  const contenu = { ...brut, format: brut.format ?? FORMAT_VERSIONS, majLe: iso(maintenant) };
  writeJsonAtomic(fichier, contenu);
  try {
    const st = fs.statSync(fichier);
    enCache = { fichier, signature: `${st.mtimeMs}:${st.size}`, brut: contenu };
  } catch {
    enCache = { fichier: null, signature: null, brut: null };
  }
  return contenu;
}

/**
 * Pour le calcul du moteur : { brut, lisible } — le registre en cache tant que le fichier n'a pas bougé ;
 * illisible à cet instant (OneDrive le tient, écriture en cours, fichier abîmé), une seule tentative, sans
 * attendre (le moteur ne s'arrête pas pour lui), la lecture réussie d'avant si elle existe et `lisible: false`
 * — l'appel suivant relit. Absent : { brut: null, lisible: true }.
 */
function registreEnCache(fichier) {
  let st;
  try {
    st = fs.statSync(fichier);
  } catch {
    return { brut: null, lisible: true }; // absent : aucune version encore
  }
  const signature = `${st.mtimeMs}:${st.size}`;
  if (enCache.fichier === fichier && enCache.signature === signature) return { brut: enCache.brut, lisible: true };
  try {
    const brut = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    if (problemeDeForme(brut)) throw new Error('forme inattendue');
    enCache = { fichier, signature, brut };
    return { brut, lisible: true };
  } catch {
    return { brut: enCache.fichier === fichier ? enCache.brut : null, lisible: false };
  }
}

const versionDe = (brut, numero) => brut?.versions?.find((v) => v.numero === numero) ?? null;

/** La version qui correspond à des réglages (d'un sport) et à un code : celle en service d'abord, puis de la plus récente à la plus ancienne. */
function versionCorrespondante(brut, sportId, empreinteReglages, code) {
  if (!brut) return null;
  const correspond = (v) => v.code?.empreinte === code && v.empreinteReglages?.[sportId] === empreinteReglages;
  const enService = versionDe(brut, brut.enService);
  if (enService && correspond(enService)) return enService;
  for (let i = brut.versions.length - 1; i >= 0; i--) if (correspond(brut.versions[i])) return brut.versions[i];
  return null;
}

/** Une version complète, prête à écrire. */
function nouvelleVersion(numero, etat, { origine, depuis = null, changements = [], maintenant }) {
  return {
    numero,
    creeeLe: iso(maintenant),
    origine,
    pourquoi: ORIGINES[origine] ?? origine,
    empreinte: etat.empreinte,
    empreinteReglages: etat.empreinteReglages,
    reglages: etat.reglages,
    code: etat.code,
    lancements: lancementsDuCode(),
    depuis,
    changements
  };
}

/** Un registre neuf, avec la version 1 = `etat`. */
function registreNeuf(etat, { origine, maintenant }) {
  return {
    format: FORMAT_VERSIONS,
    enService: 1,
    pile: [1],
    versions: [nouvelleVersion(1, etat, { origine, maintenant })],
    journal: [{ le: iso(maintenant), action: 'creation', version: 1, origine }],
    candidate: null,
    candidatesPassees: []
  };
}

/**
 * Note un état comme EN SERVICE (pur : rend le nouveau registre sans l'écrire). Même état que la version en
 * service : rien. Un état déjà vu : son numéro est repris (remis en service). Sinon : une version de plus,
 * avec ce qui a changé depuis la version en service. Rend { brut, version, change, nouvelle, reprise }.
 */
function noterEtat(brut, etat, { origine, maintenant }) {
  const courante = versionDe(brut, brut.enService);
  if (courante && courante.empreinte === etat.empreinte) return { brut, version: courante, change: false, nouvelle: false, reprise: false };
  const journal = [...(brut.journal ?? [])];
  const dejaVue = [...brut.versions].reverse().find((v) => v.empreinte === etat.empreinte) ?? null;
  if (dejaVue) {
    journal.push({ le: iso(maintenant), action: 'remise-en-service', version: dejaVue.numero, depuis: courante?.numero ?? null, origine, changements: changementsEntre(courante, dejaVue) });
    return { brut: { ...brut, enService: dejaVue.numero, pile: [...brut.pile, dejaVue.numero], journal }, version: dejaVue, change: true, nouvelle: false, reprise: true };
  }
  const numero = Math.max(...brut.versions.map((v) => v.numero)) + 1;
  const version = nouvelleVersion(numero, etat, { origine, depuis: courante?.numero ?? null, changements: changementsEntre(courante, etat), maintenant });
  journal.push({ le: iso(maintenant), action: 'creation', version: numero, depuis: courante?.numero ?? null, origine });
  return { brut: { ...brut, enService: numero, pile: [...brut.pile, numero], versions: [...brut.versions, version], journal }, version, change: true, nouvelle: true, reprise: false };
}

/** Ce qu'un enregistrement rend à l'écran : le numéro, nouvelle ou reprise, ce qui a changé. */
function resumeDe(r, { changementsSiReprise = [] } = {}) {
  return {
    numero: r.version.numero,
    nouvelle: r.nouvelle,
    reprise: r.reprise,
    change: r.change,
    changements: r.nouvelle ? r.version.changements : r.reprise ? changementsSiReprise : []
  };
}

function optionsDe(options) {
  const { fichier = FICHIER_VERSIONS, racine = SRC_DU_SERVEUR, maintenant = Date.now() } = options ?? {};
  return { fichier, racine, maintenant };
}

// ------------------------------------------------------- écritures

/**
 * Accorde le registre avec le moteur EN SERVICE (réglages + code) : crée la version 1 la première fois
 * (`creation` : 'premier-demarrage' au démarrage du serveur), sinon note l'état s'il a changé depuis la
 * version en service (origine : le code, les réglages hors de l'appli, ou les deux). N'écrit JAMAIS
 * engine-config.json. Ne lève pas pour un registre illisible : rend { source: 'illisible', probleme }.
 */
export function synchroniserVersions(options = {}) {
  const { fichier, racine, maintenant } = optionsDe(options);
  const lecture = lireBrut(fichier);
  if (lecture.source === 'illisible') return { source: 'illisible', fichier, probleme: lecture.probleme, numero: null, change: false };
  const etat = etatDuMoteur({ racine });
  if (lecture.source === 'absent') {
    const origine = options.creation ?? 'etat-initial';
    ecrire(fichier, registreNeuf(etat, { origine, maintenant }), maintenant);
    return { source: 'enregistre', fichier, probleme: null, numero: 1, change: true, nouvelle: true, reprise: false, origine, changements: [] };
  }
  const courante = versionDe(lecture.brut, lecture.brut.enService);
  const origine = origineDuChangement(courante, etat);
  const r = noterEtat(lecture.brut, etat, { origine, maintenant });
  if (r.change) ecrire(fichier, r.brut, maintenant);
  return { source: 'enregistre', fichier, probleme: null, ...resumeDe(r, { changementsSiReprise: changementsEntre(courante, r.version) }), origine: r.change ? origine : null };
}

/**
 * Un ENREGISTREMENT DES RÉGLAGES (Réglages › Paramètres du moteur) avec sa version : `ecrireReglages()`
 * écrit engine-config.json (updateEngineConfig, resetEngineConfig) et rend ce que la route renvoie. Avant
 * d'écrire : le registre doit se lire (sinon RegistreVersionsIllisible, et RIEN n'est écrit) ; l'état en
 * service y est noté s'il ne l'était pas (la version 1 la toute première fois). Après : le nouvel état est
 * noté — une version de plus avec ce qui a changé, ou le numéro d'un état déjà vu, ou rien s'il n'a pas
 * changé (enregistrer deux fois les mêmes valeurs ne fait pas deux versions).
 * @returns {{ resultat: any, version: { numero, nouvelle, reprise, change, changements } }}
 */
export function avecUneVersion(ecrireReglages, options = {}) {
  const { fichier, racine, maintenant } = optionsDe(options);
  const origine = options.origine ?? 'reglages';
  let brut = lireOuLever(fichier).brut;
  const avant = etatDuMoteur({ racine });
  if (!brut) brut = ecrire(fichier, registreNeuf(avant, { origine: 'etat-initial', maintenant }), maintenant);
  else {
    const r = noterEtat(brut, avant, { origine: origineDuChangement(versionDe(brut, brut.enService), avant), maintenant });
    if (r.change) brut = ecrire(fichier, r.brut, maintenant);
  }
  const resultat = ecrireReglages();
  const courante = versionDe(brut, brut.enService);
  const r = noterEtat(brut, etatDuMoteur({ racine }), { origine, maintenant });
  if (r.change) ecrire(fichier, r.brut, maintenant);
  return { resultat, version: resumeDe(r, { changementsSiReprise: changementsEntre(courante, r.version) }) };
}

/**
 * LE RETOUR ARRIÈRE : remet en service la version d'avant celle en service (le haut de la pile), en une fois.
 *   - jamais pendant une passe d'actualisation ni un import (le verrou, isRefreshRunning) ;
 *   - `depuis` = la version que l'écran croit en service : si ce n'est plus elle (un double clic, un autre
 *     onglet), rien ne change — on ne recule jamais de deux versions par erreur ;
 *   - seulement vers une version au MÊME code : un clic remet des réglages, il ne remet pas du code (pour
 *     un autre code, il faut annuler la mise à jour de l'appli) ;
 *   - les réglages de la version précédente sont réécrits d'un bloc (engine-config.json, atomique), puis
 *     vérifiés : l'état obtenu doit avoir exactement l'empreinte de cette version (sinon, les réglages
 *     d'avant sont remis et rien n'est noté) ; puis le registre (la pile perd son haut).
 * Lève RetourImpossible (raison, statut 409 ou 503) ; rend { de, vers, changements }.
 */
export function revenirALaVersionPrecedente(options = {}) {
  const { fichier, racine, maintenant } = optionsDe(options);
  const passeEnCours = options.passeEnCours ?? isRefreshRunning;
  const { depuis = null } = options;
  if (depuis !== null && !(Number.isInteger(depuis) && depuis >= 1)) throw new RetourImpossible('demande-invalide', '« depuis » doit être le numéro de la version en service (un entier).', 400);
  if (passeEnCours()) {
    throw new RetourImpossible('passe-en-cours', 'Une passe d’actualisation (ou un import) tient les données : le retour arrière attend qu’elle soit finie. Rien n’a changé — réessayez dans quelques minutes.');
  }
  const lecture = lireBrut(fichier);
  if (lecture.source === 'illisible') throw new RetourImpossible('registre-illisible', messageIllisible(fichier, lecture.probleme), 503);
  if (lecture.source === 'absent') throw new RetourImpossible('aucune-version', 'Aucune version du moteur n’est encore notée : il n’y a rien à défaire.');
  let brut = lecture.brut;
  const etat = etatDuMoteur({ racine });
  let courante = versionDe(brut, brut.enService);
  if (courante.empreinte !== etat.empreinte) {
    // Le moteur tourne avec un état pas encore noté (réglages changés hors de l'écran) : il est noté d'abord ; l'écran,
    // qui montrait l'ancienne version, doit relire avant de défaire quoi que ce soit.
    const r = noterEtat(brut, etat, { origine: origineDuChangement(courante, etat), maintenant });
    brut = ecrire(fichier, r.brut, maintenant);
    throw new RetourImpossible('deja-change', `Le moteur avait changé sans être noté : c’est maintenant la version ${r.version.numero}. Rien n’a été défait — relisez la carte avant de revenir en arrière.`);
  }
  if (depuis !== null && depuis !== brut.enService) {
    throw new RetourImpossible('deja-change', `La version en service n’est plus la ${depuis} mais la ${brut.enService} : rien n’a changé. Relisez la carte.`);
  }
  if (brut.pile.length < 2) throw new RetourImpossible('aucune-precedente', `La version ${courante.numero} est la première notée : il n’y a pas de version précédente.`);
  const precedente = versionDe(brut, brut.pile.at(-2));
  if (precedente.code?.empreinte !== etat.code.empreinte) {
    const diff = changementsEntre(precedente, courante).find((c) => c.type === 'code');
    const fichiers = diff ? [...diff.modifies, ...diff.ajoutes, ...diff.retires] : [];
    throw new RetourImpossible(
      'code-different',
      `La version ${precedente.numero} tournait avec un autre code du moteur${fichiers.length ? ` (${fichiers.slice(0, 4).join(', ')}${fichiers.length > 4 ? '…' : ''})` : ''} : un clic remet des réglages, pas du code. ` +
        'Pour revenir à ce code, il faut annuler la mise à jour de l’appli.'
    );
  }
  const reglagesAvant = copie(lireReglagesDuMoteur());
  remplacerReglagesDuMoteur(precedente.reglages);
  const obtenu = etatDuMoteur({ racine });
  if (obtenu.empreinte !== precedente.empreinte) {
    remplacerReglagesDuMoteur(reglagesAvant);
    throw new RetourImpossible('verification', `Les réglages remis ne redonnent pas exactement la version ${precedente.numero} : ceux d’avant sont remis, rien n’a changé.`, 500);
  }
  const journal = [...(brut.journal ?? []), { le: iso(maintenant), action: 'retour', version: precedente.numero, depuis: courante.numero }];
  ecrire(fichier, { ...brut, enService: precedente.numero, pile: brut.pile.slice(0, -1), journal }, maintenant);
  return { de: courante.numero, vers: precedente.numero, changements: changementsEntre(courante, precedente) };
}

// ------------------------------------------------------------ l'adoption

/** Les réglages qu'aurait le moteur si la candidate était adoptée : ceux en service, la candidate posée sur le football. */
function reglagesAdoptes(reglages, candidate) {
  return { ...copie(reglages), football: configDeLaCandidate(reglages.football, candidate, 'football') };
}

const VERDICTS_DITS = Object.freeze({ retenu: 'retenu', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bon', 'pas-assez-de-matchs': 'pas assez de matchs' });

/** Le nom d'une famille de marchés (ou d'une case de la porte de sûreté) pour Pierre. */
const NOMS_DE_FAMILLE = Object.freeze({
  totalGoals: 'Total buts',
  'totalGoals|2.5': 'Plus/moins 2,5 buts',
  bothTeamsScore: 'Les 2 équipes marquent',
  teamGoals: 'Buts d’une équipe',
  resultAndTotal: 'Résultat + Total buts'
});
const libelleDeFamille = (cle) => NOMS_DE_FAMILLE[cle] ?? String(cle);

/**
 * Peut-on adopter la candidate notée au registre ? Pur. Rend { possible, raison, texte } — dans l'ordre : aucune
 * candidate, pas encore jugée (l'horizon n'est pas atteint), jugée face à une autre version en service, moins
 * bonne (refusée), pas prouvé (la raison du juge), passe en cours, réglages pas encore notés ; sinon possible.
 */
function etatDeLAdoption(brut, notee, { enCours, enSynchro, empreinte }) {
  if (!notee) return { possible: false, raison: 'aucune-candidate', texte: 'Aucune candidate en essai : rien à adopter.' };
  const j = notee.jugement && notee.empreinte === empreinte ? notee.jugement : null;
  if (!j) {
    const pc = notee.premiersChiffres;
    const h = notee.horizon ?? horizonDe(notee.declaration ?? {});
    return {
      possible: false,
      raison: 'pas-encore-jugee',
      texte: `Pas encore de verdict : le juge se prononce une seule fois, quand l’essai à blanc a ${h.matchs} matchs joués et au moins ${h.jours} jours${pc ? ` (aujourd’hui : ${pc.matchs} match${pc.matchs > 1 ? 's' : ''}, ${pc.joursEcoules ?? 0} jour${(pc.joursEcoules ?? 0) > 1 ? 's' : ''})` : ''}.`
    };
  }
  if (j.versionEnService !== brut.enService) {
    return { possible: false, raison: 'version-changee', texte: `Jugée face à la version ${j.versionEnService}, mais la version en service est maintenant la ${brut.enService} : le verdict ne vaut plus, l’essai recommence la nuit prochaine.` };
  }
  const n = j.matchs ?? 0;
  const m = j.variantes ?? 1;
  const contexte = `${n} match${n > 1 ? 's' : ''} joué${n > 1 ? 's' : ''}, ${m} variante${m > 1 ? 's' : ''} essayée${m > 1 ? 's' : ''}`;
  if (j.verdict === 'moins-bon') {
    return { possible: false, raison: 'moins-bon', verdict: j.verdict, texte: `Refusée : la candidate fait moins bien que la version en service, au-delà du hasard (${contexte}). Elle ne peut pas être adoptée.` };
  }
  if (j.verdict === 'pas-prouve') {
    return {
      possible: false,
      raison: 'pas-prouve',
      verdict: j.verdict,
      texte: `Pas prouvé : l’écart avec la version en service peut venir du hasard (${contexte}). Pour réessayer, il faut une nouvelle candidate (elle comptera comme une variante de plus).`
    };
  }
  if (j.verdict !== 'retenu') return { possible: false, raison: 'pas-encore-jugee', verdict: j.verdict, texte: `Verdict « ${VERDICTS_DITS[j.verdict] ?? j.verdict} » : rien à adopter.` };
  // Étape 27 (la porte de l'essai) : UN SEUL MODÈLE — une famille « moins bon » (même K que le jugement principal) refuse
  // toute l'adoption, nommée (jamais d'adoption par morceaux : une correction est une nouvelle candidate) ; puis la porte
  // de SÛRETÉ, à K = 1 (une borne large, environ ± 3,5 points à 800 matchs) : la candidate n'annonce ni trop haut ni trop
  // bas sur le plus/moins 2,5 et les deux marquent. « Pas prouvé » par famille est l'issue normale : toléré.
  const moinsBonne = Object.entries(j.parFamille ?? {}).find(([, x]) => x?.verdict === 'moins-bon');
  if (moinsBonne) {
    return {
      possible: false,
      raison: 'famille-moins-bonne',
      verdict: j.verdict,
      famille: moinsBonne[0],
      texte: `Refusée : la famille « ${libelleDeFamille(moinsBonne[0])} » fait moins bien que la version en service, au-delà du hasard (${contexte}). Un seul modèle de buts : rien n’est adopté par morceaux ; une correction sera une nouvelle candidate.`
    };
  }
  const horsSurete = Object.entries(j.surete ?? {}).find(([, x]) => x?.verdict === 'trop-haut' || x?.verdict === 'trop-bas');
  if (horsSurete) {
    const [cle, x] = horsSurete;
    return {
      possible: false,
      raison: 'calibration',
      verdict: j.verdict,
      famille: cle,
      texte: `Refusée : sur « ${libelleDeFamille(cle)} », la candidate annonce trop ${x.verdict === 'trop-haut' ? 'haut' : 'bas'} au-delà d’une borne large (porte de sûreté de la calibration). Rien n’est adopté.`
    };
  }
  if (enCours) return { possible: false, raison: 'passe-en-cours', verdict: j.verdict, texte: 'Une passe d’actualisation (ou un import, ou un banc) est en cours : l’adoption attend qu’elle soit finie.' };
  if (enSynchro === false) return { possible: false, raison: 'pas-en-synchro', verdict: j.verdict, texte: 'Le moteur tourne avec des réglages pas encore notés : ils le seront au prochain calcul ; relisez ensuite la carte.' };
  return { possible: true, raison: null, verdict: j.verdict, texte: null };
}

/**
 * L'ADOPTION d'une candidate « si elle fait mieux » : seulement sur le jugement PRINCIPAL « retenu » du juge de
 * l'étape 16 (pris à l'horizon de l'essai, face à la version EN SERVICE), dans cet ordre :
 *   - jamais pendant une passe d'actualisation, un import ou un banc (le verrou, isRefreshRunning) ;
 *   - `depuis` = la version que l'écran croit en service et `candidate` = l'identifiant de la candidate vue :
 *     si l'un a changé (double clic, autre onglet, nouvel essai), rien ne bouge ;
 *   - le code de la candidate doit être celui qui tourne (son empreinte), le jugement celui de CET essai, face
 *     à CETTE version en service ; « pas prouvé » et « moins bon » sont refusés avec leur raison ;
 *   - le registre de la mesure doit se lire (le lancement y sera déclaré) ;
 *   - les réglages adoptés (ceux en service, la candidate posée dessus) sont écrits d'UN bloc
 *     (remplacerReglagesDuMoteur : une seule écriture atomique de engine-config.json), puis vérifiés : l'état
 *     obtenu doit être exactement celui attendu (sinon les réglages d'avant sont remis, rien n'est noté) ;
 *   - le registre des versions : une version de plus (origine « adoption »), la candidate rangée dans
 *     l'historique (« adoptée », avec son numéro) — elle n'est plus jamais calculée à blanc ;
 *   - le lancement est déclaré au registre de la mesure (declarerLancement, à chaud : l'étape de la candidate,
 *     sa version = son identifiant, daté du jour de l'adoption). Si le registre devient illisible entre-temps,
 *     le lancement reste « à déclarer » et le démarrage suivant le déclare.
 * Lève AdoptionImpossible (raison, statut 400, 409, 500 ou 503) ; rend { de, vers, nouvelle, candidate, etape,
 * lancement, lancementADeclarer, changements }.
 */
export function adopterLaCandidate(options = {}) {
  const { fichier, racine, maintenant } = optionsDe(options);
  const passeEnCours = options.passeEnCours ?? isRefreshRunning;
  const { depuis = null, candidate: vue = null } = options;
  if (!(Number.isInteger(depuis) && depuis >= 1)) throw new AdoptionImpossible('demande-invalide', '« depuis » doit être le numéro de la version en service vue à l’écran (un entier).', 400);
  if (!texte(vue)) throw new AdoptionImpossible('demande-invalide', '« candidate » doit être l’identifiant de la candidate vue à l’écran.', 400);
  if (passeEnCours()) {
    throw new AdoptionImpossible('passe-en-cours', 'Une passe d’actualisation (ou un import, ou un banc) tient les données : l’adoption attend qu’elle soit finie. Rien n’a changé — réessayez dans quelques minutes.');
  }
  const lecture = lireBrut(fichier);
  if (lecture.source === 'illisible') throw new AdoptionImpossible('registre-illisible', messageIllisible(fichier, lecture.probleme), 503);
  if (lecture.source === 'absent') throw new AdoptionImpossible('aucune-version', 'Aucune version du moteur n’est encore notée : rien à adopter.');
  let brut = lecture.brut;
  const etat = etatDuMoteur({ racine });
  const courante = versionDe(brut, brut.enService);
  if (courante.empreinte !== etat.empreinte) {
    const r = noterEtat(brut, etat, { origine: origineDuChangement(courante, etat), maintenant });
    brut = ecrire(fichier, r.brut, maintenant);
    throw new AdoptionImpossible('deja-change', `Le moteur avait changé sans être noté : c’est maintenant la version ${r.version.numero}. Rien n’a été adopté — relisez la carte.`);
  }
  if (depuis !== brut.enService) throw new AdoptionImpossible('deja-change', `La version en service n’est plus la ${depuis} mais la ${brut.enService} : rien n’a été adopté. Relisez la carte.`);
  const notee = brut.candidate ?? null;
  if (!notee || notee.id !== vue) {
    const deja = adopteeDuRegistre(brut, vue);
    if (deja) throw new AdoptionImpossible('deja-adoptee', `La candidate « ${vue} » est déjà adoptée${deja.version ? ` (version ${deja.version})` : ''} : rien de plus à faire.`);
    throw new AdoptionImpossible('candidate-changee', notee ? `La candidate en essai n’est plus « ${vue} » mais « ${notee.id} » : rien n’a été adopté. Relisez la carte.` : `Aucune candidate en essai (« ${vue} » n’y est plus) : rien n’a été adopté.`);
  }
  let declaration;
  try {
    declaration = validerCandidate(notee.declaration ?? notee);
  } catch (error) {
    throw new AdoptionImpossible('candidate-invalide', `La candidate « ${vue} » ne tient plus debout : ${error.message}`);
  }
  const empreinte = empreinteDeLaCandidate(declaration, { racine });
  if (notee.empreinte !== empreinte) {
    throw new AdoptionImpossible('code-different', `Le code de la candidate « ${vue} » a changé depuis son essai : son jugement ne vaut plus pour ce code, l’essai recommence la nuit prochaine.`);
  }
  const decision = etatDeLAdoption(brut, notee, { enCours: false, enSynchro: true, empreinte });
  if (!decision.possible) throw new AdoptionImpossible(decision.raison, decision.texte);
  const registreMesure = lireRegistre({ ...(options.mesure ?? {}) });
  if (registreMesure.source === 'illisible') {
    throw new AdoptionImpossible('registre-mesure-illisible', `Le registre de la mesure est illisible (${registreMesure.probleme}) : le lancement ne pourrait pas y être déclaré. Rien n’a été adopté.`, 503);
  }
  const reglagesAvant = copie(lireReglagesDuMoteur());
  const apres = reglagesAdoptes(reglagesAvant, declaration);
  const attendu = etatDuMoteur({ racine, reglages: apres });
  if (attendu.empreinte === courante.empreinte) throw new AdoptionImpossible('rien-a-changer', `La candidate « ${vue} » ne change aucun réglage de la version en service : rien à adopter.`);
  remplacerReglagesDuMoteur(apres);
  const obtenu = etatDuMoteur({ racine });
  if (obtenu.empreinte !== attendu.empreinte) {
    remplacerReglagesDuMoteur(reglagesAvant);
    throw new AdoptionImpossible('verification', `Les réglages adoptés ne donnent pas exactement l’état attendu : ceux d’avant sont remis, rien n’a été adopté.`, 500);
  }
  const r = noterEtat(brut, obtenu, { origine: 'adoption', maintenant });
  const aDeclarer = { etape: notee.etape, version: notee.id, quoi: notee.quoi };
  const journal = [...(r.brut.journal ?? []), { le: iso(maintenant), action: 'adoption', version: r.version.numero, depuis: courante.numero, candidate: notee.id, etape: notee.etape }];
  const adoptee = { ...notee, finLe: iso(maintenant), fin: 'adoptee', version: r.version.numero };
  brut = ecrire(fichier, { ...r.brut, journal, candidate: null, candidatesPassees: [...(r.brut.candidatesPassees ?? []), adoptee], lancementADeclarer: aDeclarer }, maintenant);
  let lancement = null;
  try {
    lancement = declarerLancement(aDeclarer.etape, { version: aDeclarer.version, quoi: aDeclarer.quoi }, { ...(options.mesure ?? {}), maintenant }).lancement;
    const { lancementADeclarer: _fait, ...sans } = brut;
    ecrire(fichier, sans, maintenant);
  } catch {
    lancement = null; // gardé « à déclarer » : le démarrage suivant le déclare (demarrerVersions)
  }
  return {
    de: courante.numero,
    vers: r.version.numero,
    nouvelle: r.nouvelle,
    candidate: notee.id,
    etape: notee.etape,
    lancement,
    lancementADeclarer: lancement ? null : aDeclarer,
    changements: changementsEntre(courante, r.version)
  };
}

/** Un lancement d'adoption resté « à déclarer » (registre de la mesure illisible à ce moment) : déclaré maintenant, si possible. */
function declarerLeLancementEnAttente(options) {
  const { fichier, maintenant } = optionsDe(options);
  const lecture = lireBrut(fichier);
  const a = lecture.brut?.lancementADeclarer ?? null;
  if (!a) return null;
  try {
    const r = declarerLancement(a.etape, { version: a.version, quoi: a.quoi }, { ...(options.mesure ?? {}), maintenant });
    const { lancementADeclarer: _fait, ...sans } = lecture.brut;
    ecrire(fichier, sans, maintenant);
    return { declare: true, lancement: r.lancement };
  } catch (error) {
    return { declare: false, probleme: error.message };
  }
}

// ------------------------------------------------- le calcul du moteur

/** Le serveur seul écrit le registre depuis le calcul du moteur (demarrerVersions) ; une tentative par minute et par état au plus. */
const ecrivain = { actif: false, tentatives: new Map() };
const ATTENTE_ENTRE_TENTATIVES_MS = 60_000;

/**
 * LE NUMÉRO DE VERSION d'un calcul du moteur (analyzeMatch le pose sur chaque résultat : engineVersion),
 * ou null (« sans version ») — jamais une erreur : le moteur ne s'arrête jamais pour son registre.
 * La version dont les réglages de ce sport et le code sont ceux du calcul. Des réglages d'essai (une
 * candidate, un test) qui ne sont aucune version restent sans numéro, et ne sont JAMAIS notés : seuls
 * les réglages EN SERVICE (l'objet même que rend getEngineConfig) rencontrés par le SERVEUR sans version
 * sont notés à ce moment-là.
 */
export function numeroDeVersion(config, sportId = 'football', options = {}) {
  try {
    if (!objetSimple(config)) return null;
    const { fichier, racine } = optionsDe(options);
    const empreinte = empreinteDesReglages(config);
    const code = empreinteDuCode({ racine }).empreinte;
    const lu = registreEnCache(fichier);
    const trouvee = versionCorrespondante(lu.brut, sportId, empreinte, code);
    if (trouvee) return trouvee.numero;
    if (!ecrivain.actif || options.noter === false) return null;
    // Registre illisible à cet instant : jamais d'écriture d'ici (ni d'attente : la noter se refera au calcul suivant).
    if (!lu.lisible) return null;
    if (config !== getEngineConfig(sportId)) return null;
    const cle = `${fichier}|${empreinte}|${code}`;
    const derniere = ecrivain.tentatives.get(cle) ?? 0;
    if (Date.now() - derniere < ATTENTE_ENTRE_TENTATIVES_MS) return null;
    ecrivain.tentatives.set(cle, Date.now());
    const r = synchroniserVersions({ fichier, racine });
    if (r.numero === null) return null;
    return versionCorrespondante(registreEnCache(fichier).brut, sportId, empreinte, code)?.numero ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ la candidate

/**
 * Vérifie une déclaration de candidate (forme de CANDIDATE_EN_ESSAI) et la rend nettoyée, ou lève
 * CandidateInvalide : identifiant, étape à juger du plan, phrase, modifications d'un sport connu (au
 * moins une clé), familles de marchés connues (au moins une, sans doublon).
 */
export function validerCandidate(candidate) {
  if (!objetSimple(candidate)) throw new CandidateInvalide('Une candidate est un objet { id, etape, quoi, modifications, marches }.');
  const { id, etape, quoi, modifications, marches } = candidate;
  if (!texte(id) || !/^[a-z0-9][a-z0-9._-]{1,60}$/i.test(id)) throw new CandidateInvalide('La candidate n’a pas d’identifiant court (lettres, chiffres, « - », « . », « _ »).');
  const idEtape = normaliserIdEtape(etape);
  if (!idEtape || idEtape !== etape) throw new CandidateInvalide(`Candidate « ${id} » : étape « ${String(etape)} » inconnue du plan (ou mal écrite).`);
  if (!ETAPES_A_JUGER.includes(idEtape)) throw new CandidateInvalide(`Candidate « ${id} » : l’étape ${idEtape} n’est pas une étape dont les chiffres se jugent (ETAPES_A_JUGER).`);
  if (!texte(quoi)) throw new CandidateInvalide(`Candidate « ${id} » : la phrase « quoi » est vide.`);
  // Étape 27 : la phrase en mots simples (facultative) — une chaîne non vide sur une ligne, sinon refusée.
  if (candidate.enMots !== undefined && (!texte(candidate.enMots) || /[\r\n]/.test(candidate.enMots))) throw new CandidateInvalide(`Candidate « ${id} » : la phrase « enMots » est vide ou sur plusieurs lignes.`);
  if (!objetSimple(modifications) || !Object.keys(modifications).length) throw new CandidateInvalide(`Candidate « ${id} » : aucune modification des réglages.`);
  for (const [sport, mods] of Object.entries(modifications)) {
    if (sport !== 'football') throw new CandidateInvalide(`Candidate « ${id} » : sport inconnu « ${sport} ».`);
    if (!objetSimple(mods) || !Object.keys(mods).length) throw new CandidateInvalide(`Candidate « ${id} » : les modifications du football sont vides.`);
  }
  if (!Array.isArray(marches) || !marches.length) throw new CandidateInvalide(`Candidate « ${id} » : elle doit dire quels marchés elle change (« marches »).`);
  const vus = new Set();
  for (const m of marches) {
    if (!MARCHES_CONNUS.includes(m)) throw new CandidateInvalide(`Candidate « ${id} » : marché inconnu « ${String(m)} » (connus : ${MARCHES_CONNUS.join(', ')}).`);
    if (vus.has(m)) throw new CandidateInvalide(`Candidate « ${id} » : le marché « ${m} » est écrit deux fois.`);
    vus.add(m);
  }
  // Étape 27 : des réglages du modèle de buts fautifs refusent la candidate (jamais calculée à moitié).
  try {
    reglagesDuModeleDeButs(configDeLaCandidate({}, candidate, 'football'));
  } catch (error) {
    throw new CandidateInvalide(`Candidate « ${id} » : ${error.message}`);
  }
  const sortie = { id, etape: idEtape, quoi, modifications: copie(modifications), marches: [...marches] };
  if (candidate.enMots !== undefined) sortie.enMots = candidate.enMots;
  // Les champs facultatifs (seconde moitié) : rendus seulement quand ils sont déclarés — l'empreinte d'une
  // candidate qui ne les déclare pas ne change pas.
  if (candidate.horizon !== undefined) {
    const probleme = problemeDHorizon(candidate.horizon);
    if (probleme) throw new CandidateInvalide(`Candidate « ${id} » : ${probleme}.`);
    sortie.horizon = copie(candidate.horizon);
  }
  if (candidate.origine !== undefined) {
    if (!texte(candidate.origine) || !ORIGINE_LISIBLE.test(candidate.origine)) throw new CandidateInvalide(`Candidate « ${id} » : origine illisible « ${String(candidate.origine)} » (un mot court : code, correction-mensuelle…).`);
    sortie.origine = candidate.origine;
  }
  if (candidate.variantes !== undefined) {
    if (!Array.isArray(candidate.variantes)) throw new CandidateInvalide(`Candidate « ${id} » : « variantes » est une liste [{ id, quoi }].`);
    const ids = new Set([id]);
    for (const v of candidate.variantes) {
      if (!objetSimple(v) || !texte(v.id) || !/^[a-z0-9][a-z0-9._~-]{1,60}$/i.test(v.id)) throw new CandidateInvalide(`Candidate « ${id} » : une variante regardée sans identifiant court.`);
      if (ids.has(v.id)) throw new CandidateInvalide(`Candidate « ${id} » : la variante « ${v.id} » est écrite deux fois (ou porte le nom de la candidate).`);
      ids.add(v.id);
    }
    sortie.variantes = candidate.variantes.map((v) => ({ id: v.id, quoi: typeof v.quoi === 'string' ? v.quoi : '' }));
  }
  if (candidate.vues !== undefined) {
    if (!Array.isArray(candidate.vues) || candidate.vues.some((f) => !objetSimple(f) || !jourValide(f.de) || !jourValide(f.a) || f.de > f.a)) {
      throw new CandidateInvalide(`Candidate « ${id} » : « vues » est une liste de fenêtres { de, a } aux jours AAAA-MM-JJ (de ≤ a).`);
    }
    sortie.vues = candidate.vues.map((f) => ({ de: f.de, a: f.a, quoi: typeof f.quoi === 'string' ? f.quoi : '' }));
  }
  // Étape 27 : les TÉMOINS (le score exact) — calculés à blanc et rapportés, jamais jugés, hors de l'empreinte.
  if (candidate.temoins !== undefined) {
    if (!Array.isArray(candidate.temoins)) throw new CandidateInvalide(`Candidate « ${id} » : « temoins » est une liste (${TEMOINS_CONNUS.join(', ')}).`);
    const vusT = new Set();
    for (const t of candidate.temoins) {
      if (!TEMOINS_CONNUS.includes(t)) throw new CandidateInvalide(`Candidate « ${id} » : témoin inconnu « ${String(t)} » (connus : ${TEMOINS_CONNUS.join(', ')}).`);
      if (vusT.has(t) || marches.includes(t)) throw new CandidateInvalide(`Candidate « ${id} » : le témoin « ${t} » est écrit deux fois (ou aussi parmi les marchés).`);
      vusT.add(t);
    }
    sortie.temoins = [...candidate.temoins];
  }
  return sortie;
}

/** Les réglages d'une candidate : ceux EN SERVICE, avec ses modifications par-dessus (même fusion que updateEngineConfig). Un objet NEUF. */
export function configDeLaCandidate(enService, candidate, sportId = 'football') {
  const mods = candidate?.modifications?.[sportId] ?? {};
  const base = copie(enService ?? {});
  return { ...base, ...copie(mods), weights: { ...(base.weights ?? {}), ...(mods.weights ?? {}) } };
}

/**
 * L'empreinte d'une candidate (ses modifications, ses marchés, le code ; son horizon quand elle en déclare un —
 * le changer en cours d'essai recommence l'essai) : les chiffres à blanc la portent. Jamais ses variantes, ses vues,
 * ses témoins ni sa phrase en mots (`enMots`) : les changer ne recommence pas l'essai.
 */
export function empreinteDeLaCandidate(candidate, { racine = SRC_DU_SERVEUR } = {}) {
  const base = { id: candidate.id, modifications: formeStable(candidate.modifications), marches: [...candidate.marches].sort(ordre), code: empreinteDuCode({ racine }).empreinte };
  if (candidate.horizon !== undefined) base.horizon = formeStable(candidate.horizon);
  return sha1(JSON.stringify(base)).slice(0, 16);
}

/** La déclaration d'une candidate PROPOSÉE par un module (rangée au registre avec son origine), ou null. */
function declarationProposee(notee) {
  if (!objetSimple(notee) || !texte(notee.origine) || notee.origine === 'code' || !objetSimple(notee.declaration)) return null;
  return notee.declaration;
}

/** La candidate de ce nom déjà adoptée (au registre), ou null : une candidate adoptée ne revient jamais à blanc. */
const adopteeDuRegistre = (brut, id) => [...(brut?.candidatesPassees ?? [])].reverse().find((p) => p?.id === id && p?.fin === 'adoptee') ?? null;

/** Le prochain numéro d'essai d'une candidate : 1 la première fois, puis un de plus à chaque essai recommencé (modifiée, autre version en service). */
function prochainNumeroDEssai(brut, id) {
  const numeros = [...(brut?.candidatesPassees ?? []), brut?.candidate].filter((x) => x?.id === id).map((x) => x.essai?.numero ?? 1);
  return numeros.length ? Math.max(...numeros) + 1 : 1;
}

/**
 * La candidate EN ESSAI : la déclaration du code (ou `candidate` passée par un essai), sinon celle qu'un module a
 * PROPOSÉE (au registre), vérifiée, avec ce que le registre sait d'elle (en essai depuis, variante déclarée,
 * l'essai en cours, son jugement) ; null s'il n'y en a pas, ou si elle a déjà été ADOPTÉE. Lève
 * CandidateInvalide pour une déclaration fautive du code (elle n'est alors jamais calculée).
 */
export function candidateEnEssai(options = {}) {
  const duCode = options.candidate === undefined ? CANDIDATE_EN_ESSAI : options.candidate;
  let c = duCode ? validerCandidate(duCode) : null;
  const { fichier } = optionsDe(options);
  const lecture = lireBrut(fichier);
  if (!c && options.candidate === undefined) {
    const proposee = declarationProposee(lecture.brut?.candidate);
    if (proposee) {
      try {
        c = validerCandidate(proposee);
      } catch {
        c = null;
      }
    }
  }
  if (!c) return null;
  if (adopteeDuRegistre(lecture.brut, c.id)) return null;
  const notee = lecture.brut?.candidate?.id === c.id ? lecture.brut.candidate : null;
  const empreinte = empreinteDeLaCandidate(c, options);
  const meme = notee?.empreinte === empreinte;
  return {
    ...c,
    empreinte,
    enEssaiDepuis: notee?.enEssaiDepuis ?? null,
    varianteDeclareeLe: notee?.varianteDeclareeLe ?? null,
    essai: meme ? notee.essai ?? null : null,
    jugement: meme ? notee.jugement ?? null : null
  };
}

/** Ce que rend la mise en essai : la déclaration et ce que le registre sait de cet essai. */
const candidateRendue = (c, notee) => ({
  ...c,
  empreinte: notee.empreinte,
  enEssaiDepuis: notee.enEssaiDepuis,
  varianteDeclareeLe: notee.varianteDeclareeLe,
  essai: notee.essai ?? null,
  jugement: notee.jugement ?? null
});

/**
 * Met la candidate EN ESSAI : sa variante est déclarée au registre de la mesure (étape 16, declarerVariante,
 * « a-blanc ») — une candidate calculée à blanc est TOUJOURS comptée parmi les variantes essayées, comme les
 * variantes regardées pendant sa construction (« construction ») —, puis notée dans le registre des versions
 * (en essai depuis, l'ESSAI : son début, la version en service face à laquelle il compare, son numéro).
 * L'essai RECOMMENCE (numéro + 1, une variante de plus comptée : « id~2 »…) quand la candidate est modifiée ou
 * que la version en service a changé depuis son début : ses lignes d'avant ne comptent plus, son jugement non
 * plus. Sans candidate déclarée ni proposée, une candidate restée au registre (retirée du code) passe dans
 * l'historique ; une candidate déjà adoptée n'est jamais remise à blanc. Lève RegistreIllisible (étape 16) ou
 * RegistreVersionsIllisible : une candidate qui ne peut pas être comptée n'est pas calculée.
 * `mesure` : les options du registre de la mesure (un fichier d'essai dans les tests).
 */
export function mettreLaCandidateEnEssai(options = {}) {
  const { fichier, maintenant } = optionsDe(options);
  const duCode = options.candidate === undefined ? CANDIDATE_EN_ESSAI : options.candidate;
  let c = duCode ? validerCandidate(duCode) : null;
  const lecture = lireOuLever(fichier);
  const brut = lecture.brut;
  const ancienne = brut?.candidate ?? null;
  let refusee = null;
  if (!c && options.candidate === undefined && declarationProposee(ancienne)) {
    try {
      c = validerCandidate(declarationProposee(ancienne));
    } catch (error) {
      refusee = error.message;
    }
  }
  if (!c) {
    if (!ancienne || !brut) return { candidate: null, change: false };
    const fin = refusee ? 'refusee' : 'retiree-du-code';
    ecrire(fichier, { ...brut, candidate: null, candidatesPassees: [...(brut.candidatesPassees ?? []), { ...ancienne, finLe: iso(maintenant), fin, ...(refusee ? { pourquoi: refusee } : {}) }] }, maintenant);
    return { candidate: null, change: true };
  }
  const adoptee = adopteeDuRegistre(brut, c.id);
  if (adoptee) return { candidate: null, change: false, dejaAdoptee: { id: c.id, version: adoptee.version ?? null, le: adoptee.finLe ?? null } };
  const mesure = { ...(options.mesure ?? {}), maintenant };
  // La candidate (« a-blanc ») et les variantes de sa construction en UNE écriture du registre de la mesure (étape 27,
  // vérification du branchement, constat 3) ; `variante` garde sa forme : { change, variante } de la candidate.
  const declarees = declarerVariantes(
    c.etape,
    [{ id: c.id, quoi: c.quoi, ou: 'a-blanc' }, ...(c.variantes ?? []).map((v) => ({ id: v.id, quoi: v.quoi, ou: 'construction' }))],
    mesure
  );
  const { change: varianteChange, variante: varianteDeclaree } = declarees.variantes[0];
  const variante = { change: varianteChange, variante: varianteDeclaree };
  const empreinte = empreinteDeLaCandidate(c, options);
  // Le registre des versions doit exister pour noter la candidate : sinon l'état en service y est noté d'abord.
  let base = brut;
  if (!base) base = ecrire(fichier, registreNeuf(etatDuMoteur(options), { origine: 'etat-initial', maintenant }), maintenant);
  const memeCandidate = ancienne?.id === c.id && ancienne?.empreinte === empreinte;
  if (memeCandidate) {
    const essai = ancienne.essai ?? null;
    if (essai && essai.versionEnService === base.enService) return { candidate: candidateRendue(c, ancienne), change: false, variante };
    if (!essai) {
      // Une candidate mise à blanc avant la seconde moitié : son essai commence à sa mise à blanc, face à la version en service.
      const notee = { ...ancienne, essai: { depuis: ancienne.enEssaiDepuis ?? iso(maintenant), versionEnService: base.enService, numero: 1, variante: c.id } };
      ecrire(fichier, { ...base, candidate: notee }, maintenant);
      return { candidate: candidateRendue(c, notee), change: false, variante };
    }
  }
  // Un essai neuf : la première fois, ou la candidate modifiée, ou la version en service changée depuis son début.
  const numero = prochainNumeroDEssai(base, c.id);
  const idVariante = numero === 1 ? c.id : `${c.id}~${numero}`;
  if (numero > 1) {
    const pourquoi = memeCandidate ? `nouvel essai face à la version n° ${base.enService}` : 'nouvel essai, candidate modifiée';
    declarerVariante(c.etape, { id: idVariante, quoi: `${c.quoi} — ${pourquoi}`, ou: 'a-blanc' }, mesure);
  }
  const essai = { depuis: iso(maintenant), versionEnService: base.enService, numero, variante: idVariante };
  let notee;
  let passees = base.candidatesPassees ?? [];
  if (memeCandidate) {
    // Même candidate, autre version en service : l'essai recommence, le jugement d'avant ne vaut plus (gardé, périmé).
    notee = {
      ...ancienne,
      essai,
      premiersChiffres: null,
      jugement: null,
      jugementsPerimes: [...(ancienne.jugementsPerimes ?? []), ...(ancienne.jugement ? [{ ...ancienne.jugement, perimeLe: iso(maintenant), pourquoi: 'version-en-service-changee' }] : [])]
    };
  } else {
    notee = {
      id: c.id,
      etape: c.etape,
      quoi: c.quoi,
      modifications: c.modifications,
      marches: c.marches,
      origine: c.origine ?? 'code',
      declaration: c,
      horizon: horizonDe(c),
      empreinte,
      enEssaiDepuis: iso(maintenant),
      varianteDeclareeLe: variante.variante?.le ?? (ancienne?.id === c.id ? ancienne.varianteDeclareeLe : null) ?? iso(maintenant),
      essai,
      premiersChiffres: null,
      jugement: null,
      jugementsPerimes: [],
      banc: null
    };
    if (ancienne) passees = [...passees, { ...ancienne, finLe: iso(maintenant), fin: ancienne.id === c.id ? 'modifiee' : 'remplacee' }];
  }
  ecrire(fichier, { ...base, candidate: notee, candidatesPassees: passees }, maintenant);
  return { candidate: candidateRendue(c, notee), change: true, variante, ...(memeCandidate ? { recommence: true } : {}) };
}

/**
 * LE POINT D'ENTRÉE d'une candidate PROPOSÉE PAR UN MODULE — la correction du mois de l'étape 26 s'en servira
 * (« le réglage est refait chaque mois ») ; rien ne propose encore. `origine` est obligatoire : une étiquette
 * courte qui dit d'où elle vient (« correction-mensuelle »…), jamais « code » (réservé à CANDIDATE_EN_ESSAI).
 * La candidate proposée est rangée au registre des versions avec sa déclaration et passe par le MÊME chemin
 * que celle du code : comptée au registre de la mesure, calculée à blanc chaque nuit, jugée à l'horizon,
 * adoptée seulement sur « retenu ». Refusée (CandidateInvalide) : origine absente, déclaration fautive, une
 * candidate du code déjà déclarée, une autre candidate en essai (sauf `remplacer: true`). Le serveur seul.
 */
export function proposerUneCandidate(declaration, options = {}) {
  const { origine, remplacer = false } = options;
  if (!texte(origine) || !ORIGINE_LISIBLE.test(origine) || origine === 'code') {
    throw new CandidateInvalide('Une candidate proposée par un module dit d’où elle vient (« correction-mensuelle »…) ; « code » est réservé à la candidate déclarée dans le code.');
  }
  const c = validerCandidate({ ...declaration, origine });
  if (CANDIDATE_EN_ESSAI) throw new CandidateInvalide(`Une candidate est déclarée dans le code (« ${CANDIDATE_EN_ESSAI.id} ») : elle passe d’abord, rien d’autre n’est proposé.`);
  const { fichier } = optionsDe(options);
  const enCours = lireOuLever(fichier).brut?.candidate ?? null;
  if (enCours && enCours.id !== c.id && !remplacer) {
    throw new CandidateInvalide(`La candidate « ${enCours.id} » est déjà en essai : une seule à la fois (remplacer: true pour la remplacer — elle restera comptée parmi les variantes).`);
  }
  return mettreLaCandidateEnEssai({ fichier: options.fichier, racine: options.racine, maintenant: options.maintenant, mesure: options.mesure, candidate: c });
}

/**
 * Pour le BANC AVANT L'ESSAI (bench/bancCandidate.js, lancé par la route de Réglages) : la candidate en essai,
 * les réglages en service et ceux de la candidate (deux objets neufs) ; null sans candidate. Lecture seule.
 */
export function candidatePourLeBanc(options = {}) {
  const c = candidateEnEssai(options);
  if (!c) return null;
  const enService = copie(lireReglagesDuMoteur().football);
  return { candidate: c, reglagesEnService: enService, reglagesCandidate: configDeLaCandidate(enService, c, 'football') };
}

/**
 * Range ce que le juge a dit de l'essai cette nuit (moteurABlanc.js, dans la passe) : les premiers chiffres
 * (avant l'horizon, sans verdict) ou le jugement PRINCIPAL (à l'horizon) — jamais à la place d'un jugement
 * principal déjà rangé, jamais pour une autre candidate ni un autre essai que celui jugé. Rend { ecrit, raison }.
 */
export function noterLEssai({ id, empreinte, numero, premiersChiffres, jugement } = {}, options = {}) {
  const { fichier, maintenant } = optionsDe(options);
  const brut = lireOuLever(fichier).brut;
  const c = brut?.candidate ?? null;
  if (!c || c.id !== id || c.empreinte !== empreinte || (c.essai?.numero ?? 1) !== numero) return { ecrit: false, raison: 'candidate-changee' };
  if (c.jugement) return { ecrit: false, raison: 'deja-jugee' };
  const suivante = { ...c, ...(premiersChiffres !== undefined ? { premiersChiffres } : {}), ...(jugement !== undefined ? { jugement } : {}) };
  if (JSON.stringify(suivante) === JSON.stringify(c)) return { ecrit: false, raison: 'rien-de-change' };
  ecrire(fichier, { ...brut, candidate: suivante }, maintenant);
  return { ecrit: true, raison: null };
}

/** Range le verdict du BANC AVANT L'ESSAI (indicatif) avec la candidate jugée — rien si elle a changé depuis le lancement du banc. */
export function noterLeBancDeLaCandidate(banc, { id, empreinte, ...options } = {}) {
  const { fichier, maintenant } = optionsDe(options);
  const brut = lireOuLever(fichier).brut;
  const c = brut?.candidate ?? null;
  if (!c || c.id !== id || c.empreinte !== empreinte) return { ecrit: false, raison: 'candidate-changee' };
  ecrire(fichier, { ...brut, candidate: { ...c, banc: copie(banc) } }, maintenant);
  return { ecrit: true, raison: null };
}

// ------------------------------------------------------------ démarrage

/**
 * Au DÉMARRAGE DU SERVEUR (server.js), avant d'écouter le port : ce processus devient l'écrivain du
 * registre, la version en service est accordée au moteur (la version 1 la toute première fois, sans rien
 * changer aux chiffres), et la candidate du code est mise en essai. Ne lève jamais pour un registre
 * illisible (le serveur doit démarrer) : le bilan le dit.
 */
export function demarrerVersions(options = {}) {
  ecrivain.actif = true;
  const versions = synchroniserVersions({ ...options, creation: 'premier-demarrage' });
  let candidate = null;
  let probleme = null;
  // Un lancement d'adoption resté « à déclarer » (registre de la mesure illisible au moment du clic) : déclaré maintenant.
  const lancementEnAttente = declarerLeLancementEnAttente(options);
  try {
    candidate = mettreLaCandidateEnEssai(options);
  } catch (error) {
    probleme = error.message;
  }
  return { versions, candidate, probleme, ...(lancementEnAttente ? { lancementEnAttente } : {}) };
}

// ------------------------------------------------------------ lecture (la carte)

const resumeVersion = (v, { dansLaPile = false, enService = false } = {}) =>
  v
    ? {
        numero: v.numero,
        creeeLe: v.creeeLe ?? null,
        origine: v.origine ?? null,
        pourquoi: v.pourquoi ?? ORIGINES[v.origine] ?? null,
        depuis: v.depuis ?? null,
        changements: Array.isArray(v.changements) ? v.changements : [],
        code: { empreinte: String(v.code?.empreinte ?? '').slice(0, 12), fichiers: Object.keys(v.code?.fichiers ?? {}).length },
        lancements: Array.isArray(v.lancements) ? v.lancements : [],
        enService,
        dansLaPile
      }
    : null;

/**
 * Étape 27 : la PORTE 1 du banc d'essai (2019-2023, jamais vu, prix d'avant-match) de la candidate, telle que la note
 * du modèle de buts la garde (noteDuModeleDeButs.js, hors empreinte) — SEULEMENT pour la candidate mesurée (même
 * identifiant, même empreinte) : une autre candidate, ou celle-ci retouchée, n'a pas de porte 1. Le résumé pour la
 * carte : en bloc et par famille, les critères en mots, la réserve acceptée telle quelle, et la calibration du
 * pronostic retenu de chaque version par famille. null sinon.
 */
export function porte1DeLaCandidate(c, empreinte, note = NOTE_DU_MODELE_DE_BUTS) {
  const p = note?.porte1 ?? null;
  if (!p || !c || p.candidate?.id !== c.id || p.candidate?.empreinte !== empreinte) return null;
  const l = p.avecCotes ?? {};
  const verdictDe = (x) => (x ? { gainPct: x.gainPct ?? null, fourchettePct: x.fourchettePct ?? null, verdict: x.verdict ?? null, matchs: x.matchs ?? null } : null);
  const calib = (x) => (x ? { biais: x.biais ?? null, verdict: x.verdict ?? null, pronostics: x.pronostics ?? null, matchs: x.matchs ?? null } : null);
  const familles = Object.keys(l.parFamille ?? {});
  return {
    periode: '2019-2023',
    matchs: l.matchs ?? null,
    K: p.K ?? null,
    franchie: Boolean(p.verdict?.franchie),
    enBloc: verdictDe(l.enBloc),
    familles: Object.fromEntries(familles.map((k) => [k, verdictDe(l.parFamille[k])])),
    criteres: (p.verdict?.criteres ?? []).map((x) => ({ cle: x.cle, ok: Boolean(x.ok), texte: x.texte })),
    reservesAcceptees: (p.reservesAcceptees ?? []).map((r) => ({ cle: r.cle, sens: r.sens, texte: r.texte, le: r.le ?? null })),
    calibration: Object.fromEntries(familles.map((k) => [k, { enService: calib(l.calibration?.enService?.parFamille?.[k]), candidate: calib(l.calibration?.candidate?.parFamille?.[k]) }]))
  };
}

/** La candidate telle que la carte la montre : sa déclaration, son origine, son horizon, et ce que le registre sait de SON essai. */
function vueDeLaCandidate(c, brut, { racine }) {
  const notee = brut?.candidate?.id === c.id ? brut.candidate : null;
  const empreinte = empreinteDeLaCandidate(c, { racine });
  const meme = Boolean(notee) && notee.empreinte === empreinte;
  const origine = c.origine ?? 'code';
  let statut = 'pas-en-essai';
  if (notee && !meme) statut = 'modifiee';
  else if (meme && notee.jugement) statut = 'jugee';
  else if (meme && brut && notee.essai && notee.essai.versionEnService !== brut.enService) statut = 'autre-version';
  else if (meme) statut = 'en-essai';
  return {
    ...c,
    origine,
    origineDite: ORIGINES_DE_CANDIDATE[origine] ?? origine,
    horizon: horizonDe(c),
    empreinte,
    enEssaiDepuis: notee?.enEssaiDepuis ?? null,
    varianteDeclareeLe: notee?.varianteDeclareeLe ?? null,
    statut,
    essai: meme ? notee.essai ?? null : null,
    premiersChiffres: meme ? notee.premiersChiffres ?? null : null,
    jugement: meme ? notee.jugement ?? null : null,
    jugementsPerimes: meme ? (notee.jugementsPerimes ?? []).length : 0,
    banc: meme ? notee.banc ?? null : null,
    // Étape 27 : la porte 1 du banc d'essai, seulement pour la candidate mesurée (rien pour une autre candidate).
    ...(porte1DeLaCandidate(c, empreinte) ? { porte1: porte1DeLaCandidate(c, empreinte) } : {})
  };
}

/**
 * Ce que montre la carte « Versions du moteur » — LECTURE SEULE, rien n'est écrit : la version en service
 * (date, ce qui l'a créée, ce qui a changé), les versions précédentes (de la plus récente à la plus
 * ancienne), la candidate en essai (« aucune ») avec son essai — premiers chiffres, jugement de l'essai,
 * verdict indicatif du banc —, l'adoption possible ou non (et pourquoi), le retour arrière possible ou non (et
 * pourquoi), la candidate adoptée et un lancement resté « à déclarer ». `enSynchro` : faux quand le moteur
 * tourne avec un état pas encore noté (il le sera au prochain calcul du serveur). L'alerte de dérive est
 * ajoutée par la route (data/deriveMoteur.js : elle lit la base).
 */
export function etatDesVersions(options = {}) {
  const { fichier, racine } = optionsDe(options);
  const passeEnCours = options.passeEnCours ?? isRefreshRunning;
  const lecture = lireBrut(fichier);
  const base = {
    format: FORMAT_VERSIONS,
    fichier,
    source: lecture.source,
    probleme: lecture.probleme,
    modules: { dossiers: [...MODULES_DU_MOTEUR.dossiers], fichiers: [...MODULES_DU_MOTEUR.fichiers], horsEmpreinte: [...MODULES_DU_MOTEUR.horsEmpreinte] },
    aVenir: A_VENIR
  };
  let candidateDuCode = null;
  let candidateProbleme = null;
  try {
    candidateDuCode = options.candidate === undefined ? CANDIDATE_EN_ESSAI : options.candidate;
    if (candidateDuCode) candidateDuCode = validerCandidate(candidateDuCode);
  } catch (error) {
    candidateProbleme = error.message;
    candidateDuCode = null;
  }
  // Sans candidate dans le code : celle qu'un module a proposée (au registre), s'il y en a une.
  if (!candidateDuCode && !candidateProbleme && options.candidate === undefined) {
    const proposee = declarationProposee(lecture.brut?.candidate);
    if (proposee) {
      try {
        candidateDuCode = validerCandidate(proposee);
      } catch (error) {
        candidateProbleme = error.message;
      }
    }
  }
  let enCours = false;
  try {
    enCours = Boolean(passeEnCours());
  } catch {
    enCours = false;
  }
  if (lecture.source !== 'enregistre') {
    return {
      ...base,
      majLe: null,
      enService: null,
      precedentes: [],
      enSynchro: null,
      premiereLe: null,
      retour: {
        possible: false,
        vers: null,
        raison: lecture.source === 'absent' ? 'aucune-version' : 'registre-illisible',
        texte: lecture.source === 'absent' ? 'Aucune version notée pour l’instant : la première le sera au prochain démarrage du serveur.' : 'Le registre des versions est illisible pour l’instant.'
      },
      candidate: candidateDuCode ? vueDeLaCandidate(candidateDuCode, null, { racine }) : null,
      candidateProbleme,
      adoption: {
        possible: false,
        raison: candidateDuCode ? (lecture.source === 'absent' ? 'pas-encore-jugee' : 'registre-illisible') : 'aucune-candidate',
        texte: !candidateDuCode
          ? 'Aucune candidate en essai : rien à adopter.'
          : lecture.source === 'absent'
            ? 'La candidate n’est pas encore calculée à blanc : pas de verdict.'
            : 'Le registre des versions est illisible pour l’instant : rien ne s’adopte.'
      },
      candidateAdoptee: null,
      lancementADeclarer: null,
      candidatesPassees: []
    };
  }
  const brut = lecture.brut;
  const pile = new Set(brut.pile.slice(0, -1));
  const courante = versionDe(brut, brut.enService);
  let enSynchro = null;
  try {
    enSynchro = etatDuMoteur({ racine }).empreinte === courante.empreinte;
  } catch {
    enSynchro = null;
  }
  const precedente = brut.pile.length >= 2 ? versionDe(brut, brut.pile.at(-2)) : null;
  let retour;
  if (!precedente) retour = { possible: false, vers: null, raison: 'aucune-precedente', texte: `La version ${courante.numero} est la première notée : il n’y a pas de version précédente.` };
  else if (precedente.code?.empreinte !== courante.code?.empreinte) {
    retour = { possible: false, vers: precedente.numero, raison: 'code-different', texte: `La version ${precedente.numero} tournait avec un autre code du moteur : un clic remet des réglages, pas du code.` };
  } else if (enCours) retour = { possible: false, vers: precedente.numero, raison: 'passe-en-cours', texte: 'Une passe d’actualisation (ou un import) est en cours : le retour arrière attend qu’elle soit finie.' };
  else if (enSynchro === false) retour = { possible: false, vers: precedente.numero, raison: 'pas-en-synchro', texte: 'Le moteur tourne avec des réglages pas encore notés : ils le seront au prochain calcul ; relisez ensuite la carte.' };
  else retour = { possible: true, vers: precedente.numero, raison: null, texte: null, changements: changementsEntre(courante, precedente) };
  // Une candidate déjà adoptée (encore déclarée dans le code) n'est plus en essai : la carte dit son adoption.
  const adopteeLa = candidateDuCode ? adopteeDuRegistre(brut, candidateDuCode.id) : null;
  const candidate = candidateDuCode && !adopteeLa ? vueDeLaCandidate(candidateDuCode, brut, { racine }) : null;
  let adoption;
  if (!candidate) adoption = { possible: false, raison: 'aucune-candidate', texte: 'Aucune candidate en essai : rien à adopter.' };
  else if (candidate.statut === 'pas-en-essai' || candidate.statut === 'modifiee') {
    adoption = { possible: false, raison: 'pas-encore-jugee', texte: 'La candidate n’est pas encore calculée à blanc sous cette forme (au prochain démarrage du serveur, ou la nuit prochaine) : pas de verdict.' };
  } else adoption = etatDeLAdoption(brut, brut.candidate, { enCours, enSynchro, empreinte: candidate.empreinte });
  if (adoption.possible) {
    try {
      const apres = etatDuMoteur({ racine, reglages: reglagesAdoptes(courante.reglages, candidateDuCode) });
      adoption = { ...adoption, changements: changementsEntre(courante, apres) };
    } catch {
      adoption = { ...adoption, changements: [] };
    }
  }
  const premiere = versionDe(brut, Math.min(...brut.versions.map((v) => v.numero)));
  const derniereAdoptee = [...(brut.candidatesPassees ?? [])].reverse().find((c) => c?.fin === 'adoptee') ?? null;
  return {
    ...base,
    majLe: typeof brut.majLe === 'string' ? brut.majLe : null,
    enService: resumeVersion(courante, { enService: true }),
    precedentes: [...brut.versions].filter((v) => v.numero !== courante.numero).sort((a, b) => b.numero - a.numero).map((v) => resumeVersion(v, { dansLaPile: pile.has(v.numero) })),
    enSynchro,
    premiereLe: premiere?.creeeLe ?? null,
    journal: (brut.journal ?? []).slice(-20).reverse(),
    retour,
    candidate,
    candidateProbleme,
    adoption,
    candidateAdoptee: derniereAdoptee
      ? { id: derniereAdoptee.id ?? null, etape: derniereAdoptee.etape ?? null, quoi: derniereAdoptee.quoi ?? null, le: derniereAdoptee.finLe ?? null, version: derniereAdoptee.version ?? null, jugement: derniereAdoptee.jugement ?? null }
      : null,
    lancementADeclarer: brut.lancementADeclarer ?? null,
    candidatesPassees: (brut.candidatesPassees ?? []).map((c) => ({
      id: c.id ?? null,
      etape: c.etape ?? null,
      quoi: c.quoi ?? null,
      enEssaiDepuis: c.enEssaiDepuis ?? null,
      finLe: c.finLe ?? null,
      fin: c.fin ?? null,
      origine: c.origine ?? 'code',
      version: c.version ?? null,
      verdict: c.jugement?.verdict ?? null
    }))
  };
}

/** Pour les tests : les briques internes, et l'oubli du cache de lecture et de l'écrivain. */
export const __testing = {
  formeStable,
  problemeDeForme,
  noterEtat,
  origineDuChangement,
  etatDeLAdoption,
  oublier() {
    enCache = { fichier: null, signature: null, brut: null };
    ecrivain.actif = false;
    ecrivain.tentatives.clear();
    codesEnCache.clear();
  },
  estEcrivain: () => ecrivain.actif
};
