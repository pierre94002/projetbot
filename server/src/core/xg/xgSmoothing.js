/**
 * Lisse une valeur d'Expected Goals brute vers une valeur de référence,
 * pondérée par la fiabilité connue de la source de données. Permet
 * d'amortir les valeurs aberrantes ou manquantes sans les ignorer.
 */
const PROVIDER_CONFIDENCE = {
  Opta: 0.9,
  StatsBomb: 0.92,
  'api-football': 0.85,
  default: 0.8
};

const XG_BOUNDS = { min: 0.5, max: 3.2 };

export function smoothExpectedGoals(rawValue, provider, referenceValue = 1.3) {
  if (rawValue === undefined || rawValue === null || Number.isNaN(Number(rawValue))) {
    return referenceValue;
  }

  const confidence = PROVIDER_CONFIDENCE[provider] ?? PROVIDER_CONFIDENCE.default;
  const smoothed = Number(rawValue) * confidence + referenceValue * (1 - confidence);

  return Math.max(XG_BOUNDS.min, Math.min(XG_BOUNDS.max, smoothed));
}
