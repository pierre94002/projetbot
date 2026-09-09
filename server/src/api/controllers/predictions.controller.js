import {
  listPredictions,
  upsertPredictions,
  updatePredictionStatus,
  deletePrediction
} from '../../data/repositories/predictionsRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

const VALID_STATUSES = new Set(['pending', 'correct', 'incorrect', 'void']);

export function getPredictions(req, res) {
  res.json({ entries: listPredictions() });
}

function validateEntry(entry, index) {
  const { matchId, homeName, awayName, market, predictedOutcome, predictedLabel, predictedOdds, action } = entry ?? {};
  if (!matchId || !homeName || !awayName || !market || !predictedLabel) {
    throw new ApiError(400, `Entrée ${index + 1} : "matchId", "homeName", "awayName", "market" et "predictedLabel" sont requis.`);
  }
  const numericOdds = Number(predictedOdds);
  if (!Number.isFinite(numericOdds)) {
    throw new ApiError(400, `Entrée ${index + 1} : "predictedOdds" doit être un nombre.`);
  }
  return {
    matchId,
    homeName,
    awayName,
    league: entry.league ?? null,
    market,
    predictedOutcome: predictedOutcome ?? null,
    predictedLabel,
    predictedOdds: numericOdds,
    action: action ?? null,
    edgePercent: Number(entry.edgePercent) || 0
  };
}

export function postPredictions(req, res) {
  const { entries } = req.body ?? {};
  if (!Array.isArray(entries) || entries.length === 0) throw new ApiError(400, 'Au moins une entrée ("entries") est requise.');

  const log = upsertPredictions(entries.map(validateEntry));
  res.status(201).json({ entries: log });
}

export function patchPredictionStatus(req, res) {
  const { status } = req.body ?? {};
  if (!VALID_STATUSES.has(status)) throw new ApiError(400, `Statut invalide : "${status}".`);

  const entry = updatePredictionStatus(req.params.entryId, status);
  if (!entry) throw new ApiError(404, `Entrée introuvable : ${req.params.entryId}`);
  res.json(entry);
}

export function removePrediction(req, res) {
  const deleted = deletePrediction(req.params.entryId);
  if (!deleted) throw new ApiError(404, `Entrée introuvable : ${req.params.entryId}`);
  res.status(204).send();
}
