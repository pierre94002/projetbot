import { getOpportunities, getOpportunitesVertes } from '../../data/opportunities.js';

/**
 * La page « Opportunités du jour » (étape 8 du plan, cf. data/opportunities.js) :
 * ce qui est connu tout de suite, avec l'avancement quand le calcul du
 * Repérage tourne. `force=1` relance ce calcul. Lecture seule : aucun appel
 * réseau, aucun crédit The Odds API, aucun appel à Claude.
 */
export function getOpportunitiesData(req, res) {
  res.json(getOpportunities({ force: req.query.force === '1' }));
}

/** Les seules opportunités vertes (la surveillance des notifications du navigateur). */
export function getOpportunitiesVertes(req, res) {
  res.json(getOpportunitesVertes());
}
