/**
 * bettingMap.controller.js — la carte « OÙ PARIER » vue de l'interface (étape 23 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * GET /api/betting-map   LECTURE SEULE, jamais un calcul : la dernière carte
 *                        rangée (table betting_map), ou `?mois=AAAA-MM` (la
 *                        dernière de ce mois), ou `?id=N` ; `?resume=oui` :
 *                        sans les cases. Aussi : l'état (« pas encore
 *                        mesuré » tant qu'aucun rejeu du banc n'existe), si la
 *                        carte est à jour face aux réglages du moteur en
 *                        service, la liste des cartes gardées, la règle en
 *                        mots, la provenance. Aucune carte : 200 avec
 *                        `carte: null` et la phrase qui dit quoi faire.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../../data/db/matchStatsDb.js';
import { lireLaCarte, listeDesCartes, rejeuxUtilesALaCarte, empreinteDesReglagesEnService, COLONNES, GROUPES, RAISONS, MIN_MATCHS, EPREUVES } from '../../data/bettingMap.js';
import { REGARDS_PREVUS } from '../../data/bettingMapCalcul.js';
import { etatDuBancDuMois } from '../../data/rejeuDuServeur.js';
import { ApiError } from '../middlewares/errorHandler.js';

/** La règle, en mots simples (l'écran la montre telle quelle). */
export const REGLE = Object.freeze({
  verte: 'Verte seulement si l’avantage du moteur AU PRIX est prouvé : la valeur de clôture (la cote a ensuite donné raison au moteur) dépasse ce que le hasard explique, sur au moins 200 matchs.',
  rouge: 'Rouge si le moteur fait moins bien que le marché, au-delà du hasard : ses probabilités se trompent plus que la cote, ou la cote part contre lui après ses choix.',
  grise: 'Grise sinon : pas prouvé (l’écart peut venir du hasard), trop peu de matchs (moins de 200), pas encore mesurée, ou pas de cote archivée pour ce marché (corners, tirs, buts d’une équipe, résultat + total : impossible de mesurer un avantage contre le bookmaker).',
  hasard: `Le juge est celui du garde-fou de la mesure (étape 16). Il tient compte du nombre de cases jugées et des ${REGARDS_PREVUS} regards prévus d’avance sur les matchs depuis la dernière adoption : beaucoup de cases, c’est beaucoup de chances de faux vert — la fourchette s’élargit d’autant.`,
  informations: 'Vos vrais paris, la comparaison à la moyenne du championnat (repère) et la période 2023-2024 sont montrés pour information : ils ne décident jamais d’une couleur.',
  lecture: 'La carte ne change aucun chiffre du moteur : elle trie les opportunités (cases vertes d’abord, rouges à la fin) et avertit.'
});

export const PROVENANCE = Object.freeze({
  banc: 'Banc d’essai (étape 19) : sa carte championnat × marché, rejouée sur 2019-2023 (football-data, matchs jamais vus) au prix d’avant-match, déjà jugée.',
  direct: 'Pronostics gelés du moteur (table engine_picks du magasin SQLite, première valeur) depuis le 24/09/2026 ou la dernière adoption, et leur valeur de clôture sur les cotes gratuites archivées (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets).',
  paris: 'Vos paris de Mes paris (data/runtime/bets.json), paris simples : pour information.',
  table: 'Table betting_map du magasin SQLite : une ligne par carte, jamais réécrite.'
});

const MOIS = /^\d{4}-(0[1-9]|1[0-2])$/;

/** L'état de la carte pour l'écran : ce qu'il faut dire quand il n'y a rien, ou quand elle date d'un autre moteur. */
export function etatPourLEcran({ carte, rejeux, empreinteReglages }) {
  if (!carte) {
    return rejeux.length
      ? { etat: 'en-attente', phrase: 'Un rejeu du banc d’essai existe : la première carte sera calculée à la prochaine actualisation (quelques minutes au plus).' }
      : { etat: 'pas-encore-mesure', phrase: 'Pas encore mesuré : la carte a besoin d’un premier rejeu du banc d’essai. Ouvrez Historique moteur › Banc d’essai et cliquez « Lancer le banc » (10 à 13 minutes) ; la carte suivra à la prochaine actualisation. Ensuite, le banc est relancé tout seul le 1er du mois quand le moteur a changé.' };
  }
  const aJour = empreinteReglages !== null && carte.moteur?.empreinteReglages === empreinteReglages;
  return aJour
    ? { etat: 'ok', aJour: true, phrase: null }
    : { etat: 'perimee', aJour: false, phrase: 'Les réglages du moteur ont changé depuis cette carte : ses couleurs sont suspendues dans Opportunités et le Repérage jusqu’au prochain banc d’essai (le 1er du mois, ou d’un clic).' };
}

export function getBettingMap(req, res) {
  const { mois = null, id = null, resume = null } = req.query ?? {};
  if (mois !== null && !MOIS.test(String(mois))) throw new ApiError(400, `« mois » : AAAA-MM attendu (reçu « ${String(mois).slice(0, 20)} »).`);
  if (id !== null && !/^\d{1,9}$/.test(String(id))) throw new ApiError(400, '« id » : un entier attendu.');
  // La demande est contrôlée AVANT d'ouvrir la base : une demande refusée ne lit rien.
  const database = openDb();
  const avecContenu = resume !== 'oui';
  const carte = lireLaCarte({ database, avecContenu, ...(id !== null ? { id: Number(id) } : mois !== null ? { mois: String(mois) } : {}) });
  let empreinteReglages = null;
  try {
    empreinteReglages = empreinteDesReglagesEnService();
  } catch {
    empreinteReglages = null;
  }
  const rejeux = rejeuxUtilesALaCarte({ database });
  res.json({
    carte,
    ...etatPourLEcran({ carte: carte ?? (id === null && mois === null ? null : lireLaCarte({ database, avecContenu: false })), rejeux, empreinteReglages }),
    cartes: listeDesCartes({ database }).map((c) => ({ id: c.id, mois: c.mois, calculeLe: c.calculeLe, raison: c.raison, resume: c.resume })),
    banc: { rejeux: rejeux.length, dernier: rejeux[0] ?? null, duMois: etatDuBancDuMois() },
    colonnes: COLONNES,
    groupes: GROUPES,
    raisons: RAISONS,
    epreuves: EPREUVES,
    minimum: MIN_MATCHS,
    regle: REGLE,
    provenance: PROVENANCE
  });
}
