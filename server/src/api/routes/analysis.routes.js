import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { analyzeMatchById } from '../controllers/analysis.controller.js';
import { analyseSansLesButs } from '../../data/masqueDesButs.js';

const router = Router();

// Lot 0 (masque des buts, data/masqueDesButs.js) : la réponse réussie de l'analyse passe par le masque ; le contrôleur reste intact.
export const sansLesButs = (req, res, next) => { const json = res.json.bind(res); res.json = (corps) => json(res.statusCode < 400 ? analyseSansLesButs(corps) : corps); next(); };

router.get('/match/:matchId', sansLesButs, asyncHandler(analyzeMatchById));

export default router;
