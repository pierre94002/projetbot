/**
 * coteMinimale.js — LA COTE MINIMALE À PRENDRE (étape 10 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * « À prendre à 1,78 minimum » : la plus petite cote, au centième (ce que
 * paient les bookmakers), à laquelle le moteur dirait encore « value » ; et la
 * plus grande au-delà de laquelle il ne la dirait plus (trop beau pour être
 * vrai, ou cote au-dessus de la cote maximale). Entre les deux : une value.
 *
 * Deux règles, chacune EXACTEMENT celle qui décide ailleurs, comparaisons en
 * virgule flottante comprises (les bornes sont cherchées au centième près en
 * appliquant la règle elle-même, jamais en arrondissant une formule) :
 *   - bornesDuMoteur : la règle de findValueBet (valueFinder.js) pour le
 *     1 / N / 2 — avantage = probabilité juste × cote − 1, value si
 *     cote ≤ cote maximale, avantage ≤ seuil maximal et avantage > seuil
 *     minimal (« pile le seuil » n'est PAS une value). Exemple : à 50 %,
 *     seuil 2 %, la cote 2,04 donne en virgule flottante 0,020000000000000018,
 *     au-dessus du seuil : le moteur la dit value, donc la cote minimale est
 *     2,04 — la borne suit le moteur, elle ne le corrige pas ;
 *   - bornesDeLaRegle : la règle d'une cote saisie à la main (et de tout
 *     marché autre que le 1 / N / 2, dont la probabilité est 1 / la cote juste
 *     du moteur) — verdictValue, sur l'avantage en % arrondi au centième, tel
 *     que le serveur l'envoie et que la pastille de l'écran le relit.
 *
 * verdictValue vit ici depuis l'étape 10 (data/saisiesCotes.js le réexporte) :
 * la règle et ses bornes au même endroit, sans base ni réseau. Le serveur jugeait
 * une saisie sur l'avantage NON arrondi et l'écran sur l'avantage arrondi au
 * centième : à quelques millièmes du seuil (cote juste 4,49, cote 4,58 : 2,0045 %),
 * le serveur disait « value » et la pastille « sous le seuil ». Les deux lisent
 * maintenant le même nombre (pourcentDeLaCote).
 *
 * Pur : ni disque, ni base, ni réseau, ni heure.
 * -----------------------------------------------------------------------
 */

/** Une cote se lit au centième : 1,01 est la plus petite qu'un bookmaker paie. */
const CENTIMES_MIN = 101;
const versCote = (centimes) => centimes / 100;
const arrondi = (x, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/** Les seuils du moteur en % (comme l'écran les lit sur /api/config) ; null si l'un manque. */
export function regleEnPourcent(config) {
  const pc = (x) => Number((Number(x) * 100).toFixed(6));
  const regle = { min: pc(config?.edgeThresholdMin), max: pc(config?.edgeThresholdMax), coteMax: Number(config?.maxValueOdds ?? 5) };
  return Object.values(regle).every(Number.isFinite) ? regle : null;
}

/** L'avantage d'une cote, en %, arrondi au centième : LE nombre que le serveur envoie et que la pastille relit. */
export function pourcentDeLaCote(probabilite, cote) {
  return Number.isFinite(probabilite) && Number.isFinite(cote) ? arrondi((probabilite * cote - 1) * 100, 2) : null;
}

/**
 * Le verdict sur une cote (saisie à la main, ou tout marché autre que le 1 / N / 2),
 * dans l'ordre de findValueBet et de l'écran (ui/src/utils/langageParis.js,
 * etatValue) : pas un de vos bookmakers, à rafraîchir, valeur inconnue, seuils
 * inconnus, cote trop haute, avantage invraisemblable, sous le seuil (ou sans
 * value), value. `pourcent` : l'avantage en % (pourcentDeLaCote).
 */
export function verdictValue({ pourcent = null, cote = null, regle = null, jouable = false, fraicheur = null } = {}) {
  if (!jouable) return 'non-jouable';
  if (fraicheur?.etat === 'a-rafraichir') return 'a-rafraichir';
  if (!Number.isFinite(pourcent)) return 'inconnue';
  if (!regle) return 'seuil-inconnu';
  if (!Number.isFinite(cote)) return 'inconnue';
  if (cote > regle.coteMax) return 'cote-haute';
  if (pourcent > regle.max) return 'trop-beau';
  if (pourcent <= regle.min) return pourcent <= 0 ? 'sans-value' : 'sous-seuil';
  return 'value';
}

const sansBornes = (code, extra = {}) => Object.freeze({ coteMinimale: null, coteMaximale: null, code, ...extra });

/**
 * Cherche, au centième, l'intervalle des cotes que `estValue` dit value. La règle
 * est croissante avec la cote (l'avantage l'est), l'intervalle est donc d'un
 * seul tenant : on part un peu sous le seuil théorique et on monte jusqu'à la
 * première cote value ; on part un peu au-dessus du plafond et on descend.
 */
function chercherBornes(estValue, seuilBas, seuilHaut, coteMax) {
  const plafond = Math.floor(coteMax * 100 + 1e-7);
  if (!Number.isFinite(seuilBas) || plafond < CENTIMES_MIN) return sansBornes('seuils-inconnus');
  let k = Math.max(CENTIMES_MIN, Math.floor(seuilBas * 100) - 3);
  // Un seuil très bas (probabilité presque certaine) : la plus petite cote peut déjà être value.
  while (k > CENTIMES_MIN && estValue(versCote(k - 1))) k--;
  while (k <= plafond && !estValue(versCote(k))) k++;
  if (k > plafond) {
    const minimumTheorique = Math.ceil(seuilBas * 100 - 1e-7) / 100;
    return sansBornes('au-dela-cote-max', { minimumTheorique, coteMax });
  }
  let haut = Math.min(plafond, Number.isFinite(seuilHaut) ? Math.floor(seuilHaut * 100) + 3 : plafond);
  while (haut > k && !estValue(versCote(haut))) haut--;
  return Object.freeze({ coteMinimale: versCote(k), coteMaximale: versCote(haut), code: 'value-possible', coteMax });
}

/**
 * Les bornes de value d'une issue du 1 / N / 2, selon findValueBet : la
 * probabilité juste (bookmakers de référence, marge retirée) et les seuils du
 * moteur (`edgeThresholdMin`, `edgeThresholdMax`, `maxValueOdds`). Cote NETTE
 * (celle que paie un bookmaker ; une bourse s'entend commission déduite).
 * @returns {{ coteMinimale: number|null, coteMaximale: number|null, code: string, coteMax?: number, minimumTheorique?: number }}
 */
export function bornesDuMoteur(probabilite, config) {
  const p = Number(probabilite);
  if (!(p > 0 && p < 1)) return sansBornes('probabilite-inconnue');
  const min = Number(config?.edgeThresholdMin);
  const max = Number(config?.edgeThresholdMax);
  const coteMax = Number(config?.maxValueOdds ?? 5);
  if (![min, max, coteMax].every(Number.isFinite)) return sansBornes('seuils-inconnus');
  if (!(max > min)) return sansBornes('seuils-incoherents');
  // Les trois comparaisons de findValueBet, dans son ordre et sur la même expression.
  const estValue = (x) => !(x > coteMax) && !(p * x - 1 > max) && !(p * x - 1 <= min);
  return chercherBornes(estValue, (1 + min) / p, (1 + max) / p, coteMax);
}

/**
 * Les bornes de value d'une issue d'un autre marché (saisie à la main, pronostic
 * du moteur hors 1 / N / 2) : verdictValue sur l'avantage arrondi au centième.
 * `regle` : { min, max, coteMax }, min et max en % (regleEnPourcent).
 */
export function bornesDeLaRegle(probabilite, regle) {
  const p = Number(probabilite);
  if (!(p > 0 && p < 1)) return sansBornes('probabilite-inconnue');
  if (!regle || ![regle.min, regle.max, regle.coteMax].every(Number.isFinite)) return sansBornes('seuils-inconnus');
  if (!(regle.max > regle.min)) return sansBornes('seuils-incoherents');
  const estValue = (x) => verdictValue({ pourcent: pourcentDeLaCote(p, x), cote: x, regle, jouable: true }) === 'value';
  return chercherBornes(estValue, (1 + regle.min / 100) / p, (1 + regle.max / 100) / p, regle.coteMax);
}

/** Une cote face à des bornes : « value » (dans l'intervalle), « sous-minimum », « au-dessus » (trop beau ou trop haute), « inconnu ». */
export function faceAuxBornes(cote, bornes) {
  if (!Number.isFinite(cote) || !bornes || !Number.isFinite(bornes.coteMinimale)) return 'inconnu';
  if (cote < bornes.coteMinimale) return 'sous-minimum';
  if (cote > bornes.coteMaximale) return 'au-dessus';
  return 'value';
}
