import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { getNote, putNote } from '../controllers/matchNotes.controller.js';

const router = Router();

router.get('/:matchId', asyncHandler(getNote));
router.put('/:matchId', asyncHandler(putNote));

export default router;
