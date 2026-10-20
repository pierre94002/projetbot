/**
 * recorders.controller.js — les enregistreurs vus de l'interface (étape E du plan).
 * -----------------------------------------------------------------------
 * GET /api/recorders   l'état de chaque relevé : depuis quand il tourne,
 *                      lignes gardées hier et aujourd'hui, dernier relevé,
 *                      état (actif / coupé / en erreur) et pourquoi, la
 *                      provenance réelle (fournisseur, table, base sur ce
 *                      PC), et les problèmes de l'alerte durable.
 * Lecture seule : ne lance aucun relevé, n'écrit rien. L'état est préparé
 * (compteurs tenus à chaque écriture, cf. data/enregistreurs/etat.js) ; la
 * réponse est gardée trente secondes.
 * -----------------------------------------------------------------------
 */

import { etatEnregistreurs } from '../../data/enregistreurs/etat.js';

const CACHE_MS = 30_000;
let cache = { at: 0, valeur: null };

export function getRecordersOverview(req, res) {
  const maintenant = Date.now();
  if (!cache.valeur || maintenant - cache.at >= CACHE_MS || req.query.force === '1') {
    cache = { at: maintenant, valeur: etatEnregistreurs({ maintenant }) };
  }
  res.json(cache.valeur);
}
