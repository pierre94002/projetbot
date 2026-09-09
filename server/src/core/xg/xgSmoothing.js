/**
 * Lisse une valeur brute vers une valeur de référence, pondérée par une
 * confiance (0-1) fournie par l'appelant. Permet d'amortir les valeurs
 * aberrantes ou manquantes sans les ignorer. La confiance par fournisseur de
 * données (Opta/StatsBomb/...) est un détail du sport appelant, pas de cette
 * fonction générique — cf. sports/football/model.js pour cette table.
 */
const BOUNDS = { min: 0.5, max: 3.2 };

export function smoothExpectedGoals(rawValue, confidence, referenceValue = 1.3) {
  if (rawValue === undefined || rawValue === null || Number.isNaN(Number(rawValue))) {
    return referenceValue;
  }

  const smoothed = Number(rawValue) * confidence + referenceValue * (1 - confidence);

  return Math.max(BOUNDS.min, Math.min(BOUNDS.max, smoothed));
}
