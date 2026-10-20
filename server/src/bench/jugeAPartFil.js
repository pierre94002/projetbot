/**
 * jugeAPartFil.js — le corps du fil du juge (étape 19 du plan, 13/10/2026) : reçoit les tableaux d'une case,
 * refait ses lignes (lignesDuJuge, la même fonction que sur place) et rend le résultat de comparer (guard.js,
 * étape 16, tel quel). Une erreur du juge est renvoyée nommée, jamais avalée. Ne s'importe pas hors d'un
 * Worker (jugeAPart.js l'ouvre).
 */

import { parentPort } from 'node:worker_threads';
import { comparer } from './guard.js';
import { lignesDuJuge } from './jugeAPart.js';

parentPort.on('message', ({ id, n, blocs, a, b, options }) => {
  try {
    parentPort.postMessage({ id, resultat: comparer(lignesDuJuge(blocs, a, b, n), options) });
  } catch (error) {
    parentPort.postMessage({ id, erreur: { classe: error?.constructor?.name ?? 'Error', name: error?.name ?? 'Error', message: String(error?.message ?? error) } });
  }
});
