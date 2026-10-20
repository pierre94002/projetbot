import { getScreener } from '../../data/screener.js';

/**
 * L'écran de repérage (cf. data/screener.js) : ce qui est connu tout de
 * suite, avec l'avancement quand le calcul tourne. `force=1` le relance.
 */
export function getScreenerData(req, res) {
  res.json(getScreener({ force: req.query.force === '1' }));
}
