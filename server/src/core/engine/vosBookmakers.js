/**
 * vosBookmakers.js — les noms de VOS bookmakers (étape 10 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Déplacé de data/saisiesCotes.js (étape 7), qui le réexporte : le comparateur
 * du moteur (verdictPari.js) et la saisie à la main ont besoin de la même liste
 * et des mêmes noms, sans que le moteur lise une base. Pur.
 * -----------------------------------------------------------------------
 */

/** Les titres de vos bookmakers, tels que The Odds API les écrit (relevé du 21/09/2026). */
export const TITRES_BOOKMAKERS = Object.freeze({
  williamhill: 'William Hill',
  sport888: '888sport',
  betsson: 'Betsson',
  nordicbet: 'Nordic Bet',
  unibet_nl: 'Unibet (NL)',
  unibet_se: 'Unibet (SE)',
  leovegas_se: 'LeoVegas (SE)',
  tipico_de: 'Tipico (DE)',
  coolbet: 'Coolbet',
  codere_it: 'Codere (IT)'
});
export const titreBookmaker = (cle) => TITRES_BOOKMAKERS[cle] ?? cle;

/** Vos bookmakers : ceux cochés dans Réglages (valueBookmakers) ; aucun coché : ceux de la liste connue. */
export function vosBookmakersDe(config) {
  const coches = Array.isArray(config?.valueBookmakers) ? config.valueBookmakers.filter(Boolean) : [];
  return coches.length ? coches : Object.keys(TITRES_BOOKMAKERS);
}
