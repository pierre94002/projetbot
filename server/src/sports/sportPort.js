/**
 * Registre minimal des sports disponibles — pas de lib de validation,
 * cohérent avec le reste du repo (vérifications à la main, erreurs
 * explicites). Un `Sport` est un objet plugin qui expose la logique
 * spécifique à un sport (modèle de probabilités, catalogue de marchés,
 * fournisseur de données), derrière une frontière stable pour que
 * `core/engine/oddsEngine.js` reste un orchestrateur sport-agnostique.
 */

const REQUIRED_FIELDS = ['id', 'model', 'markets', 'provider'];

const registry = new Map();

function assertValidSport(sport) {
  const missing = REQUIRED_FIELDS.filter((field) => !sport?.[field]);
  if (missing.length > 0) {
    throw new Error(`Sport invalide (champs manquants : ${missing.join(', ')}).`);
  }
  if (typeof sport.model.resolveBaseRates !== 'function' || typeof sport.model.computeMarketProbabilities !== 'function') {
    throw new Error(`Sport "${sport.id}" : model.resolveBaseRates et model.computeMarketProbabilities sont requis.`);
  }
  if (typeof sport.provider.listMatches !== 'function' || typeof sport.provider.enrichMatch !== 'function') {
    throw new Error(`Sport "${sport.id}" : provider.listMatches et provider.enrichMatch sont requis.`);
  }
}

export function registerSport(sport) {
  assertValidSport(sport);
  registry.set(sport.id, sport);
}

export function getSport(id) {
  const sport = registry.get(id);
  if (!sport) throw new Error(`Sport inconnu : "${id}". Sports disponibles : ${[...registry.keys()].join(', ') || 'aucun'}.`);
  return sport;
}

export function listSports() {
  return [...registry.keys()];
}
