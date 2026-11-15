import { getScreener } from '../../data/screener.js';
import { contexteDeLaMise, reperageAvecLaMise } from '../../data/mise/miseRead.js';
import { reperageSansLesButs } from '../../data/masqueDesButs.js';

/**
 * L'écran de repérage (cf. data/screener.js) : ce qui est connu tout de
 * suite, avec l'avancement quand le calcul tourne. `force=1` le relance.
 * Étape 39 (lot 1a) : chaque match conseillé reçoit sa mise (la part du capital ; les euros sur le capital de Pierre,
 * seulement s'il est réglé), et aucun euro calculé sur la base interne ne sort (data/mise/miseRead.js).
 * Lot 0 (masque des buts, data/masqueDesButs.js) : ni probabilité du moteur ni écart sur les six marchés de buts (la cote
 * du bookmaker reste), et `data.masqueDesButs` pour la phrase de l'écran.
 */
export function getScreenerData(req, res) {
  const lu = getScreener({ force: req.query.force === '1' });
  res.json(reperageSansLesButs(reperageAvecLaMise(lu, contexteDeLaMise())));
}
