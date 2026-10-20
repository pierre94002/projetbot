/**
 * roadmap.controller.js — la feuille de route vue de l'interface (étape 5 du plan).
 * -----------------------------------------------------------------------
 * GET /api/roadmap                    LECTURE SEULE : l'état préparé — les 9 lots
 *                                     et les 49 entrées du plan (écrits dans le code),
 *                                     l'historique des étapes terminées, la ligne
 *                                     « Tests », et les notes de Pierre (lues dans
 *                                     data/runtime/roadmap.json). Ne lit ni la base,
 *                                     ni le réseau, ni Claude ; n'écrit rien ; aucun
 *                                     cache (le fichier des notes est minuscule).
 * PUT /api/roadmap/etapes/:id/note    { note } enregistre (ou remplace, ou efface si
 *                                     le texte est vide) la note de Pierre sur
 *                                     l'étape :id (« 12 », « E ») ; idempotent : le
 *                                     même texte ne réécrit rien. Renvoie l'état
 *                                     complet et `enregistrement: { id, change,
 *                                     fichier }`. Étape inconnue : 404 ; demande
 *                                     invalide : 400 ; fichier des notes illisible :
 *                                     503 (rien n'est écrit).
 * Aucune route n'écrit le plan ni l'historique : ils sont dans le code.
 * -----------------------------------------------------------------------
 */

import { etatFeuilleDeRoute } from '../../data/roadmap/feuilleDeRoute.js';
import { lireAlerteDerive } from '../../data/alerteDerive.js';
import { enregistrerNote, NoteInvalide, EtapeInconnue, NotesIllisibles } from '../../data/repositories/roadmapRepository.js';
import { ApiError } from '../middlewares/errorHandler.js';

export function getRoadmap(req, res) {
  res.json(etatFeuilleDeRoute({ maintenant: Date.now(), derive: lireAlerteDerive() }));
}

export function putRoadmapNote(req, res) {
  let resultat;
  try {
    resultat = enregistrerNote(req.params.id, req.body?.note);
  } catch (error) {
    if (error instanceof EtapeInconnue) throw new ApiError(404, error.message);
    if (error instanceof NoteInvalide) throw new ApiError(400, error.message);
    if (error instanceof NotesIllisibles) throw new ApiError(503, error.message);
    throw error;
  }
  res.json({ ...etatFeuilleDeRoute({ maintenant: Date.now(), derive: lireAlerteDerive() }), enregistrement: { id: resultat.id, change: resultat.change, fichier: resultat.fichier } });
}
