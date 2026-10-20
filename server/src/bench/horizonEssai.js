/**
 * horizonEssai.js — L'HORIZON de l'essai à blanc d'une candidate (étape 25 du plan, seconde moitié, 14/10/2026).
 * -----------------------------------------------------------------------
 * Regarder chaque nuit et adopter au premier « retenu » fabriquerait de
 * fausses preuves (l'arrêt optionnel, guard.js). Le jugement qui décide de
 * l'adoption est donc pris UNE seule fois, à un horizon FIXÉ D'AVANCE, quand
 * les deux sont atteints :
 *   - assez de matchs joués et réglés depuis le début de l'essai (600 par
 *     défaut ; jamais moins que le minimum du juge, 200 — sous lui, le juge ne
 *     conclut pas) ;
 *   - assez de jours (14 par défaut ; au moins 7 : plusieurs journées de
 *     championnat, pas un seul week-end).
 * Une candidate peut déclarer le sien ({ matchs, jours }) ; le changer en
 * cours d'essai change l'empreinte de la candidate, donc recommence l'essai.
 * Avant l'horizon, la carte ne montre que les premiers chiffres, sans verdict.
 *
 * Fichier LÉGER (aucun import) : engineVersions.js, que lit chaque calcul du
 * moteur, s'en sert pour vérifier une candidate.
 * -----------------------------------------------------------------------
 */

/** L'horizon par défaut : le jugement qui décide est pris quand les deux sont atteints. */
export const HORIZON_PAR_DEFAUT = Object.freeze({ matchs: 600, jours: 14 });
/**
 * Jamais moins : le minimum du juge — 200 matchs, celui de guard.js (comparer, minBlocs) et de la calibration
 * (calibration.js, JUGE.minBlocs ; un test vérifie qu'ils sont égaux) — et une semaine de championnats.
 */
export const HORIZON_MINIMUM = Object.freeze({ matchs: 200, jours: 7 });

const JOUR_MS = 86_400_000;
const entier = (x) => typeof x === 'number' && Number.isInteger(x);

/** Le jour de Paris (AAAA-MM-JJ) d'un instant — celui du registre de la mesure (trialsRegistry.js). */
export const jourParis = (instant) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(instant));

/** Une déclaration d'horizon : null si elle tient debout (ou si elle est absente), sinon la phrase qui dit pourquoi. */
export function problemeDHorizon(horizon) {
  if (horizon === undefined) return null;
  if (horizon === null || typeof horizon !== 'object' || Array.isArray(horizon)) return 'l’horizon est un objet { matchs, jours }';
  const inconnues = Object.keys(horizon).filter((k) => k !== 'matchs' && k !== 'jours');
  if (inconnues.length) return `clé inconnue dans l’horizon : ${inconnues.join(', ')}`;
  if (horizon.matchs !== undefined && (!entier(horizon.matchs) || horizon.matchs < HORIZON_MINIMUM.matchs)) {
    return `l’horizon compte au moins ${HORIZON_MINIMUM.matchs} matchs, le minimum du juge (${String(horizon.matchs)})`;
  }
  if (horizon.jours !== undefined && (!entier(horizon.jours) || horizon.jours < HORIZON_MINIMUM.jours)) return `l’horizon dure au moins ${HORIZON_MINIMUM.jours} jours (${String(horizon.jours)})`;
  return null;
}

/** L'horizon d'une candidate : le sien, complété par celui par défaut. */
export function horizonDe(candidate) {
  const h = candidate?.horizon ?? {};
  return { matchs: h.matchs ?? HORIZON_PAR_DEFAUT.matchs, jours: h.jours ?? HORIZON_PAR_DEFAUT.jours };
}

/**
 * L'horizon est-il atteint ? `matchs` : les matchs que le juge a gardés (joués après le début de l'essai, réglés).
 * Rend { atteint, matchs, jours (écoulés, entiers), auPlusTotLe (l'instant ISO où les jours sont faits) }.
 */
export function horizonAtteint({ matchs, depuis, maintenant, horizon }) {
  const debut = Date.parse(depuis ?? '');
  const ecoules = Number.isFinite(debut) ? (maintenant - debut) / JOUR_MS : 0;
  const assezDeJours = Number.isFinite(debut) && ecoules >= horizon.jours;
  return {
    atteint: Number.isFinite(matchs) && matchs >= horizon.matchs && assezDeJours,
    matchs: Number.isFinite(matchs) ? matchs : 0,
    jours: Math.max(0, Math.floor(ecoules)),
    auPlusTotLe: Number.isFinite(debut) ? new Date(debut + horizon.jours * JOUR_MS).toISOString() : null
  };
}

/**
 * Le LANCEMENT que le juge reçoit pour l'essai (forme de lancements.js) : l'étape de la candidate, sa version
 * (l'identifiant de la candidate), daté du jour de Paris du début de l'essai, la variante de l'essai, aucune
 * fenêtre vue de plus. Il n'est JAMAIS écrit au registre de la mesure : seule l'adoption y déclare un lancement.
 */
export function lancementDeLEssai(candidate, essai) {
  return Object.freeze({
    etape: candidate.etape,
    version: candidate.id,
    quoi: `${candidate.quoi} (essai à blanc)`,
    le: jourParis(essai.depuis),
    variantes: Object.freeze([Object.freeze({ id: essai.variante ?? candidate.id, quoi: candidate.quoi })]),
    vues: Object.freeze([])
  });
}
