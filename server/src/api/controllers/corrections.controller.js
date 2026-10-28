/**
 * corrections.controller.js — les routes de la BOUCLE DE CORRECTION (étape 26 du plan, partie B, 28/10/2026),
 * sous /api/corrections. Le contrôleur ne fait qu'AIGUILLER (comme config.controller.js) : les lectures viennent de
 * data/correction/etatDesCorrections.js et du dépôt (depotCorrections.js), les écritures des clics de Pierre de
 * data/correction/boucle.js et bancDesCorrections.js — l'état et le journal en une transaction, jamais pendant une
 * passe, un import ou un banc ; l'état vu à l'écran (`vue`) comparé (un double clic n'agit pas deux fois).
 * AUCUNE route n'écrit engine-config.json, engine-versions.json ni le registre de la mesure : la mise à blanc se fait
 * à la passe d'actualisation, l'adoption et le retour arrière dans Réglages › Versions du moteur.
 *   GET  /                      l'état (dernier tri, propositions et ce qu'on peut en faire, place, formulaire, journal)
 *   GET  /tri?mois=AAAA-MM      le tri figé d'un mois (les 22 cases, le détail par régime, les écartés)
 *   GET  /journal?avant=&limite=  une page du journal (limite ≤ 200)
 *   POST /proposer              { levier, valeur, phrase? } — FERMÉ pendant l'essai de l'étape 27, avec sa raison
 *   POST /:id/banc              { vue } — « Mesurer au banc » (environ 10 min, dans un processus à part) : 202
 *   POST /:id/accepter          { vue } — « Mettre à l'essai » : en file pour l'essai à blanc
 *   POST /:id/refuser           { vue, phrase? }
 *   POST /:id/retirer           { vue } — une correction adoptée : par le retour arrière de Réglages, si elle est
 *                               encore la dernière version (dit où cliquer ; n'écrit rien)
 */

import { etatDesCorrections } from '../../data/correction/etatDesCorrections.js';
import { lireLeTri, listeDesTris, lireLeJournal } from '../../data/correction/depotCorrections.js';
import { proposerUneCorrection, accepterUneCorrection, refuserUneCorrection, retirerUneCorrection } from '../../data/correction/boucle.js';
import { lancerLeBancDUneCorrection } from '../../data/correction/bancDesCorrections.js';
import { moisValide, moisDeParis } from '../../data/calibration.js';
import { ApiError } from '../middlewares/errorHandler.js';

/** Un refus du dépôt ou des règles (statut, raison) devient une réponse en mots ; le reste remonte (500). */
function repondreAuRefus(res, error) {
  if (Number.isInteger(error?.statut) && typeof error?.raison === 'string') {
    res.status(error.statut).json({ error: error.message, raison: error.raison });
    return true;
  }
  return false;
}

/** L'état complet après une action : l'écran le relit. */
const etatApres = () => etatDesCorrections();

/** GET /api/corrections — lecture seule ; répond 200 même quand une table ne se lit pas ({ disponible: false, raison }). */
export function getCorrections(req, res) {
  res.json(etatDesCorrections());
}

/** GET /api/corrections/tri?mois=AAAA-MM — le tri figé d'un mois (la forme la plus haute) ; absent : { tri: null, raison }. */
export function getTri(req, res) {
  const mois = req.query.mois;
  if (typeof mois !== 'string' || !moisValide(mois)) throw new ApiError(400, '« mois » est requis : AAAA-MM (par exemple 2026-10).');
  if (mois > moisDeParis()) throw new ApiError(400, `Le mois ${mois} n’est pas encore commencé : rien n’est trié.`);
  const tri = lireLeTri(mois);
  const formes = listeDesTris()
    .filter((t) => t.mois === mois)
    .map((t) => ({ version: t.version, calculeLe: t.calculeLe }));
  res.json(tri ? { mois, tri, formes } : { mois, tri: null, formes, raison: 'Ce mois n’est pas encore trié : le tri se fait le 1er du mois suivant à partir de 6 h, après le gel de la calibration.' });
}

/** GET /api/corrections/journal?avant=<n>&limite=50 — une page du journal, de la plus récente à la plus ancienne. */
export function getJournal(req, res) {
  const limite = req.query.limite === undefined ? 50 : Number(req.query.limite);
  if (!Number.isInteger(limite) || limite < 1 || limite > 200) throw new ApiError(400, '« limite » est un entier de 1 à 200.');
  const avant = req.query.avant === undefined || req.query.avant === '' ? null : Number(req.query.avant);
  if (avant !== null && (!Number.isInteger(avant) || avant < 1)) throw new ApiError(400, '« avant » est le numéro d’une entrée du journal (un entier).');
  const entrees = lireLeJournal({ avant, limite });
  res.json({ entrees, suivant: entrees.length === limite ? entrees.at(-1).n : null });
}

/** POST /api/corrections/proposer — { levier, valeur, phrase? } : la proposition de Pierre, « à mesurer au banc ». */
export function postProposer(req, res) {
  try {
    const proposition = proposerUneCorrection(req.body ?? {});
    res.status(201).json({ ok: true, proposition, etat: etatApres() });
  } catch (error) {
    if (!repondreAuRefus(res, error)) throw error;
  }
}

/** POST /api/corrections/:id/banc — { vue } : la mesure au banc part (202) ; son verdict arrive dans ~10 min. */
export function postBanc(req, res) {
  try {
    const r = lancerLeBancDUneCorrection({ id: req.params.id, vue: req.body?.vue });
    res.status(202).json({ ...r, etat: etatApres() });
  } catch (error) {
    if (!repondreAuRefus(res, error)) throw error;
  }
}

/** POST /api/corrections/:id/accepter — { vue } : « Mettre à l'essai ». */
export function postAccepter(req, res) {
  try {
    const proposition = accepterUneCorrection({ id: req.params.id, vue: req.body?.vue });
    res.json({ ok: true, proposition, etat: etatApres() });
  } catch (error) {
    if (!repondreAuRefus(res, error)) throw error;
  }
}

/** POST /api/corrections/:id/refuser — { vue, phrase? }. */
export function postRefuser(req, res) {
  try {
    const proposition = refuserUneCorrection({ id: req.params.id, vue: req.body?.vue, phrase: req.body?.phrase ?? null });
    res.json({ ok: true, proposition, etat: etatApres() });
  } catch (error) {
    if (!repondreAuRefus(res, error)) throw error;
  }
}

/** POST /api/corrections/:id/retirer — { vue } : où cliquer pour le retour arrière (n'écrit rien). */
export function postRetirer(req, res) {
  try {
    const r = retirerUneCorrection({ id: req.params.id, vue: req.body?.vue });
    res.json({ ok: true, ...r });
  } catch (error) {
    if (!repondreAuRefus(res, error)) throw error;
  }
}
