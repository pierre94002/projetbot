import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getRoadmap, putRoadmapNote } from '../controllers/roadmap.controller.js';

// La feuille de route (étape 5 du plan) : l'état en lecture seule, et la note
// libre de Pierre sur chaque étape (PUT idempotent). Le plan et l'historique
// des étapes terminées sont dans le code, jamais écrits par une route.
const router = Router();

router.get('/', asyncHandler(getRoadmap));
router.put('/etapes/:id/note', asyncHandler(putRoadmapNote));

export default router;
