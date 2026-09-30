import { getMatchNote, setMatchNote } from '../../data/repositories/matchNotesRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

export function getNote(req, res) {
  const { matchId } = req.params;
  if (!matchId) throw new ApiError(400, '"matchId" est requis.');
  res.json(getMatchNote(matchId) ?? { matchId, text: '' });
}

export function putNote(req, res) {
  const { matchId } = req.params;
  if (!matchId) throw new ApiError(400, '"matchId" est requis.');
  const { text, homeName, awayName, league } = req.body ?? {};
  if (text !== undefined && typeof text !== 'string') throw new ApiError(400, '"text" doit être une chaîne.');

  const entry = setMatchNote({ matchId, homeName, awayName, league, text: text ?? '' });
  res.json(entry ?? { matchId, text: '' });
}
