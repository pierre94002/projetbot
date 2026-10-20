/**
 * statValue.controller.js — LA VALEUR DE CHAQUE STATISTIQUE vue de l'interface (étape 18 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * GET  /api/bench/stat-value      LECTURE SEULE : le dernier calcul fini et ses
 *                                 lignes (le tableau « ce qui prédit / ce qui
 *                                 trompe » que l'étape 31 affichera : fiabilité,
 *                                 matchs nécessaires, pouvoir prédictif, demi-vie,
 *                                 bonne fenêtre, verdicts, fourchettes et tailles
 *                                 d'échantillon), le calcul en cours (mémoire du
 *                                 serveur), les dix derniers calculs, les règles
 *                                 (périodes, grilles, seuils, sens des verdicts)
 *                                 et la provenance. Jamais une écriture ; sans
 *                                 calcul, la même forme avec `dernier: null`.
 * POST /api/bench/stat-value/run  lance le calcul, À LA MAIN, depuis le serveur :
 *                                 le serveur prend le verrou d'actualisation (nom
 *                                 « valeur-des-stats »), note le calcul (INSERT),
 *                                 le fait faire par un PROCESSUS À PART (base en
 *                                 lecture seule : valeurStatsAPart.js), puis range
 *                                 lui-même le tableau (une transaction) — un seul
 *                                 écrivain ; ni sa mémoire ni sa boucle ne portent
 *                                 le calcul. 202 tout de suite ; 409 si une
 *                                 actualisation, un import, un rejeu du banc ou un
 *                                 calcul tient la base. Jamais chaque nuit : la
 *                                 demi-vie et la fenêtre deviendront des paramètres
 *                                 (27, 29, 30), qui ne changent pas tout seuls.
 * -----------------------------------------------------------------------
 */

import { openDb, resolveDbPath } from '../../data/db/matchStatsDb.js';
import { calculerAPart } from '../../data/db/valeurStatsAPart.js';
import { isRefreshRunning, withRefreshLock } from '../../data/providers/refreshLock.js';
import {
  ouvrirCalcul,
  finirCalcul,
  dernierCalcul,
  calculsDe,
  VERSION_VALEUR_STATS,
  FENETRE_ACTUELLE,
  FENETRES,
  DEMI_VIES,
  SEUILS,
  SEUIL_GAIN_UTILE,
  PERIODES_DU_CALCUL,
  VUES_DE_L_ETAPE_18,
  STATISTIQUES_EQUIPE,
  STATISTIQUES_JOUEUR,
  CIBLES_EQUIPE,
  CIBLES_JOUEUR
} from '../../bench/statValue.js';
import { ApiError } from '../middlewares/errorHandler.js';

/** D'où viennent les chiffres : dit tel quel. */
export const PROVENANCE = Object.freeze({
  magasin: 'Magasin SQLite (FotMob), par sa table du jour J : ce que l’appli savait la veille de chaque match, équipes et joueurs.',
  footballData: 'football-data.co.uk, fichiers CSV gardés sur ce PC (table fd_history) : buts, tirs, cadrés, corners, fautes et cartons des championnats européens depuis 2000.',
  calcul: 'Calculé à la main dans le serveur (POST /api/bench/stat-value/run) ou dans le bac à sable (scripts/stat-value.mjs), jamais chaque nuit.'
});

/** Les règles du calcul, pour l'écran (étape 31) : ce que veut dire chaque verdict, sur quoi tout se mesure. */
export const REGLES = Object.freeze({
  version: VERSION_VALEUR_STATS,
  fenetreActuelle: FENETRE_ACTUELLE,
  fenetres: FENETRES,
  demiVies: DEMI_VIES.map((x) => (x === Infinity ? null : x)),
  seuils: SEUILS,
  seuilGainUtile: SEUIL_GAIN_UTILE,
  periodes: PERIODES_DU_CALCUL,
  vues: VUES_DE_L_ETAPE_18,
  verdicts: Object.freeze({
    compte: 'Ses valeurs passées annoncent sa cible au-delà du hasard, avec au moins 1 % d’erreur en moins que la seule moyenne du championnat (jugé sur des matchs postérieurs au calcul).',
    faible: 'Elle annonce un peu sa cible, mais le gain prouvé reste sous 1 % de l’erreur.',
    trompe: 'Ses valeurs passées n’annoncent pas sa cible au-delà du hasard : la lire comme une tendance trompe.',
    'pas-assez': 'Trop peu de matchs pour juger.'
  }),
  fenetre: Object.freeze({
    confirmee: 'Les 10 derniers matchs restent la fenêtre (la meilleure du calcul, ou l’autre n’a pas fait mieux au-delà du hasard).',
    proposee: 'Une autre fenêtre fait mieux que 10 au-delà du hasard : proposée, jamais branchée avant le banc et l’accord de Pierre.',
    'pas-assez': 'Trop peu de matchs pour juger la fenêtre.'
  }),
  statistiques: Object.freeze({ equipe: STATISTIQUES_EQUIPE, joueur: STATISTIQUES_JOUEUR }),
  cibles: Object.freeze({ equipe: CIBLES_EQUIPE, joueur: CIBLES_JOUEUR })
});

/** Le calcul en cours dans CE processus (rien n'est écrit dans la base avant sa fin), et le dernier refus. */
let enCours = null;
let dernierRefus = null;

export const calculEnCours = () => (enCours ? { ...enCours } : null);

export function getStatValue(req, res) {
  const database = openDb();
  const dernier = dernierCalcul({ database });
  res.json({
    dernier: dernier?.calcul ?? null,
    lignes: dernier?.lignes ?? [],
    enCours: calculEnCours(),
    dernierRefus,
    calculs: calculsDe({ database, limite: 10 }),
    regles: REGLES,
    provenance: PROVENANCE
  });
}

export function postStatValueRun(req, res) {
  if (isRefreshRunning()) throw new ApiError(409, 'Une actualisation, un import, un rejeu du banc ou un calcul tient la base : la valeur des statistiques ne se calcule pas pendant ce temps. Réessayez quand ce sera fini.');
  if (enCours) throw new ApiError(409, 'Un calcul de la valeur des statistiques est déjà en cours.');
  const database = openDb();
  enCours = { id: null, debut: new Date().toISOString(), partie: 'préparation', fait: 0, total: null };
  dernierRefus = null;
  withRefreshLock(
    async () => {
      const id = ouvrirCalcul({ database, ou: 'serveur', options: {} });
      enCours.id = id;
      let r;
      try {
        r = await calculerAPart({ chemin: resolveDbPath(), options: {}, avancement: (a) => Object.assign(enCours, a) });
      } catch (error) {
        // L'enfant arrêté ou en panne : le calcul est fini « en erreur » (jamais laissé ouvert), sans ligne.
        r = { lignes: null, bilan: { version: VERSION_VALEUR_STATS, erreur: error.message } };
      }
      finirCalcul({ database, id, bilan: r.bilan, lignes: r.lignes ?? [] });
      return r;
    },
    { stamp: false, nom: 'valeur-des-stats' }
  )
    .then((r) => {
      if (r?.skipped) dernierRefus = { le: new Date().toISOString(), raison: r.skipped };
      else if (r?.bilan?.erreur) dernierRefus = { le: new Date().toISOString(), raison: r.bilan.erreur };
    })
    .catch((error) => {
      dernierRefus = { le: new Date().toISOString(), raison: error.message };
      console.error(`[valeur des stats] calcul en échec : ${error.message}`);
    })
    .finally(() => {
      enCours = null;
    });
  res.status(202).json({ lance: true, enCours: calculEnCours() });
}
