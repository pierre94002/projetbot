/**
 * direct.controller.js — LE DIRECT, vu de l'interface (étape 46 du plan, lot 1, partie B, 12/11/2026 ; conception § 4.1,
 * critique R11, R24, R28).
 * -----------------------------------------------------------------------
 * GET /api/direct                                    le tableau : TOUS les matchs que la boucle du direct suit (jamais coupés),
 *                                                    leurs faits, leurs pourcentages dans le budget d'une requête, les finis
 *                                                    depuis moins de 3 h, l'état de la boucle ;
 * GET /api/direct/match?id=<chiffres>                un match, détaillé (tous les marchés, minute 0, référence, courbe) ;
 * GET /api/direct/match?home=fotmob-<n>&away=fotmob-<n>&coup=<ISO>
 *                                                    le même, par les identifiants FotMob des deux clubs (JAMAIS un nom) et le
 *                                                    coup d'envoi (le match suivi à moins de 3 h) ;
 * GET /api/direct/en-cours                          CORRECTIFS D2 (12/11/2026, point 2 a) : la liste légère de TOUS les matchs
 *                                                    que la boucle suit en cours (identifiants FotMob, phase, minute, score),
 *                                                    sans calcul ni ligne de nuit — pour la puce « Direct » des cartes de
 *                                                    rencontre et l'encart de la page du match ;
 * &instant=<ISO>                                     LE REJEU d'un instant (les trois routes) : bac à sable et copies d'essai
 *                                                    seulement, 400 ailleurs (R28).
 * LECTURE SEULE : ni écriture, ni requête au-dehors, ni appel au moteur. L'heure est lue ICI (Date.now()) et passée au module.
 * R24 : seuls matchStatsDb.js et errorHandler.js sont importés en statique ; le module de lecture est chargé par import()
 * DYNAMIQUE, la promesse gardée et jamais levée : s'il casse, ces trois routes répondent « illisible » et rien d'autre n'est
 * touché (le serveur démarre, les autres routes répondent).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../../data/db/matchStatsDb.js';
import { ApiError } from '../middlewares/errorHandler.js';

const charger = () => import('../../data/direct/lectureDuDirect.js');

const PAR_DEFAUT = Object.freeze({ charger, maintenant: () => Date.now(), database: () => openDb(), rejeuPermis: null, options: {} });
let reglages = { ...PAR_DEFAUT };
let chargement = null;

/** Le module de lecture : { module } ou { erreur } — la promesse est gardée, elle ne lève jamais. */
function laLecture() {
  if (!chargement) {
    chargement = Promise.resolve()
      .then(() => reglages.charger())
      .then(
        (module) => ({ module, erreur: null }),
        (erreur) => ({ module: null, erreur })
      );
  }
  return chargement;
}

/** Pour les tests : l'heure, la base, le chargement, la permission du rejeu et des options de lecture fabriquées. */
export function __reglerControleurDuDirect(r = {}) {
  reglages = { ...PAR_DEFAUT, ...r };
  chargement = null;
}

const illisible = (raison) => ({ version: 1, etat: 'illisible', raison, genereLe: new Date(reglages.maintenant()).toISOString() });

/** Une date ISO lisible (« 2026-11-14T20:00:00.000Z »), ou une 400. */
function dateIso(valeur, nom) {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valeur.trim()) || !Number.isFinite(Date.parse(valeur.trim()))) {
    throw new ApiError(400, `Le paramètre "${nom}" doit être une date ISO (ex. 2026-11-14T20:00:00.000Z).`);
  }
  return valeur.trim();
}

/** `instant` (le rejeu) : absent → null ; sinon une date ISO, permise seulement dans le bac ou une copie d'essai (R28). */
function leRejeu(query, module) {
  if (query.instant === undefined || query.instant === '') return { instant: null, permis: false };
  const instant = dateIso(query.instant, 'instant');
  const permis = typeof reglages.rejeuPermis === 'function' ? Boolean(reglages.rejeuPermis()) : typeof module.rejeuPermis === 'function' && Boolean(module.rejeuPermis());
  if (!permis) throw new ApiError(400, 'Le rejeu d’un instant (« instant ») n’est permis que dans le bac à sable ou dans une copie d’essai.');
  return { instant, permis };
}

/** Lance une lecture : une faute du module rend « illisible », un rejeu refusé une 400. */
async function lire(res, fonction, options) {
  try {
    res.json(await fonction({ maintenant: reglages.maintenant(), database: reglages.database(), ...reglages.options, ...options }));
  } catch (error) {
    if (error?.code === 'rejeu-refuse') throw new ApiError(400, error.message);
    res.json({ ...illisible('lecture-ratee'), message: String(error?.message ?? error).slice(0, 200) });
  }
}

export async function getDirect(req, res) {
  const query = req.query ?? {};
  const { module, erreur } = await laLecture();
  if (erreur) return res.json(illisible('module-illisible'));
  const { instant, permis } = leRejeu(query, module);
  return lire(res, module.tableauDuDirect, instant ? { instant, rejeuPermis: permis } : {});
}

export async function getDirectMatch(req, res) {
  const query = req.query ?? {};
  let cible;
  if (query.id !== undefined && query.id !== '') {
    if (typeof query.id !== 'string' || !/^[1-9]\d*$/.test(query.id.trim())) throw new ApiError(400, 'Le paramètre "id" doit être un identifiant de match FotMob (chiffres).');
    cible = { id: query.id.trim() };
  } else {
    for (const nom of ['home', 'away']) {
      const v = query[nom];
      if (typeof v !== 'string' || !/^fotmob-[1-9]\d*$/.test(v.trim())) {
        throw new ApiError(400, `Le paramètre "${nom}" doit être un identifiant FotMob de club (« fotmob-123 »), jamais un nom.`);
      }
    }
    cible = { home: query.home.trim(), away: query.away.trim(), coup: dateIso(query.coup, 'coup') };
  }
  const { module, erreur } = await laLecture();
  if (erreur) return res.json(illisible('module-illisible'));
  const { instant, permis } = leRejeu(query, module);
  return lire(res, module.matchDuDirect, { ...cible, ...(instant ? { instant, rejeuPermis: permis } : {}) });
}

/** Correctifs D2 (point 2 a) : les matchs que la boucle suit en cours, depuis son état seulement (aucun calcul). */
export async function getDirectEnCours(req, res) {
  const query = req.query ?? {};
  const { module, erreur } = await laLecture();
  if (erreur) return res.json(illisible('module-illisible'));
  const { instant, permis } = leRejeu(query, module);
  return lire(res, module.enCoursDuDirect, instant ? { instant, rejeuPermis: permis } : {});
}
