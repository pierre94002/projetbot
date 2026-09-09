import { listBets, createBet, updateBetLegStatus, deleteBet } from '../../data/repositories/betsRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

const VALID_STATUSES = new Set(['pending', 'won', 'lost', 'void']);

export function getAllBets(req, res) {
  res.json({ bets: listBets() });
}

function validateLeg(leg, index) {
  const { homeName, awayName, market, pick, odds } = leg ?? {};
  if (!homeName || !awayName || !market || !pick) {
    throw new ApiError(400, `Jambe ${index + 1} : "homeName", "awayName", "market" et "pick" sont requis.`);
  }
  const numericOdds = Number(odds);
  if (!Number.isFinite(numericOdds) || numericOdds <= 1) {
    throw new ApiError(400, `Jambe ${index + 1} : la cote doit être un nombre supérieur à 1.`);
  }
  return {
    matchId: leg.matchId ?? null,
    homeName,
    awayName,
    league: leg.league ?? null,
    commenceTime: leg.commenceTime ?? null,
    market,
    pick,
    odds: numericOdds
  };
}

export function postBet(req, res) {
  const { stake, legs } = req.body ?? {};

  const numericStake = Number(stake);
  if (!Number.isFinite(numericStake) || numericStake <= 0) throw new ApiError(400, 'La mise doit être un nombre positif.');
  if (!Array.isArray(legs) || legs.length === 0) throw new ApiError(400, 'Au moins une sélection ("legs") est requise.');

  const bet = createBet({ stake: numericStake, legs: legs.map(validateLeg) });
  res.status(201).json(bet);
}

export function patchBetLegStatus(req, res) {
  const { status } = req.body ?? {};
  if (!VALID_STATUSES.has(status)) throw new ApiError(400, `Statut invalide : "${status}".`);
  const legIndex = Number(req.params.legIndex);
  if (!Number.isInteger(legIndex) || legIndex < 0) throw new ApiError(400, `Index de sélection invalide : "${req.params.legIndex}".`);

  const bet = updateBetLegStatus(req.params.betId, legIndex, status);
  if (!bet) throw new ApiError(404, `Pari ou sélection introuvable : ${req.params.betId} / ${legIndex}`);
  res.json(bet);
}

export function removeBet(req, res) {
  const deleted = deleteBet(req.params.betId);
  if (!deleted) throw new ApiError(404, `Pari introuvable : ${req.params.betId}`);
  res.status(204).send();
}
