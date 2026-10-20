/**
 * backups.controller.js — les sauvegardes vues de l'interface (étape 1 du plan).
 * -----------------------------------------------------------------------
 * GET  /api/backups                     LECTURE SEULE : l'état préparé par
 *                                       les scripts de sauvegarde et de
 *                                       restauration d'essai, plus quelques
 *                                       mesures immédiates (taille de la
 *                                       base, place libre, liste du dossier,
 *                                       destination hors disque en vigueur).
 * PUT  /api/backups/destination         { type: 'onedrive'|'dossier'|'aucune', chemin? }
 *                                       enregistre la destination de la copie
 *                                       hors disque (data/runtime/sauvegarde-hors-disque.json) ;
 *                                       idempotent : le même choix ne réécrit
 *                                       rien. Renvoie l'état complet.
 * POST /api/backups/destination/check   { type, chemin? } : cette destination
 *                                       est-elle utilisable (existe, place
 *                                       libre, OneDrive détecté) ? RIEN n'est
 *                                       écrit, ni dossier créé.
 * Aucune route ne lance de sauvegarde : c'est le travail de l'actualisation,
 * chaque nuit, dans un processus à part. Un choix refusé (chemin relatif,
 * dossier absent ou interdit, OneDrive non détecté) répond 400 avec la
 * raison ; une panne (disque, fichier tenu par OneDrive) remonte (500).
 * -----------------------------------------------------------------------
 */

import { etatSauvegardes } from '../../data/sauvegardes/etatSauvegardes.js';
import { enregistrerChoix, verifierChoix, DestinationInvalide } from '../../data/sauvegardes/destinationHorsDisque.js';
import { setAlert } from '../../data/repositories/refreshStatusRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

/** Le corps d'un choix : un type (validé plus loin), un chemin facultatif. */
function lireChoix(body) {
  const { type, chemin } = body ?? {};
  if (typeof type !== 'string' || !type.trim()) throw new ApiError(400, '"type" est requis : onedrive, dossier ou aucune.');
  if (chemin !== undefined && chemin !== null && typeof chemin !== 'string') throw new ApiError(400, '"chemin" est une chaîne (le dossier de la clé USB ou de l\'autre dossier).');
  return { type: type.trim(), chemin: chemin ?? null };
}

/** Les choix refusés en 400, les pannes telles quelles. */
function enRequete(action) {
  try {
    return action();
  } catch (error) {
    if (error instanceof DestinationInvalide) throw new ApiError(400, error.message);
    throw error;
  }
}

export function getBackupsOverview(req, res) {
  res.json(etatSauvegardes());
}

export function putBackupDestination(req, res) {
  const choix = lireChoix(req.body);
  const r = enRequete(() => enregistrerChoix(choix));
  const etat = etatSauvegardes();
  // L'alerte durable (haut de l'appli, Réglages) suit tout de suite, sans
  // attendre la sauvegarde de la nuit — comme après la correction des
  // contradictions : « Aucune » la fait taire, un nouveau choix la remplace.
  if (r.change) setAlert('sauvegarde', etat.alertes.length ? { alertes: etat.alertes, updatedAt: new Date().toISOString() } : null);
  res.json({ ...etat, enregistrement: { change: r.change, fichier: r.fichier, choix: r.choix } });
}

export function postBackupDestinationCheck(req, res) {
  const choix = lireChoix(req.body);
  res.json(enRequete(() => verifierChoix(choix)));
}
