import { getOpportunities, getOpportunitesVertes } from '../../data/opportunities.js';
import { contexteDeLaMise, opportunitesAvecLaMise, vertesSansEuros } from '../../data/mise/miseRead.js';

/**
 * La page « Opportunités du jour » (étape 8 du plan, cf. data/opportunities.js) :
 * ce qui est connu tout de suite, avec l'avancement quand le calcul du
 * Repérage tourne. `force=1` relance ce calcul. Lecture seule : aucun appel
 * réseau, aucun crédit The Odds API, aucun appel à Claude.
 * Étape 39 (lot 1a) : la ligne conseillée par le moteur reçoit sa mise (la part du capital ; les euros sur le capital de
 * Pierre, seulement s'il est réglé), et aucun euro calculé sur la base interne ne sort (data/mise/miseRead.js).
 */
export function getOpportunitiesData(req, res) {
  const op = getOpportunities({ force: req.query.force === '1' });
  res.json(opportunitesAvecLaMise(op, contexteDeLaMise()));
}

/** Les seules opportunités vertes (la surveillance des notifications du navigateur) : sans aucun euro interne. */
export function getOpportunitiesVertes(req, res) {
  res.json(vertesSansEuros(getOpportunitesVertes()));
}
