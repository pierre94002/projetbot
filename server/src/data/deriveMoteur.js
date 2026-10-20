/**
 * deriveMoteur.js — L'ALERTE DE DÉRIVE du moteur en service (étape 25 du plan, seconde moitié, 14/10/2026).
 * -----------------------------------------------------------------------
 * Il y a dérive quand l'écart entre ce que le moteur annonce et ce qui
 * arrive GRANDIT. Elle se juge sur le bilan du dernier mois FIGÉ de la
 * calibration (étape 20, table calibration_monthly : jamais réécrit), dans la
 * lecture principale (« première valeur », le pronostic d'origine), et sur la
 * valeur de clôture de ces pronostics. LA RÈGLE (version 1), simple et juste :
 *
 *   1. CALIBRATION, marché par marché. L'écart du mois (réalisé − annoncé des
 *      pronostics réglés du marché) est comparé à l'écart de DÉPART du même
 *      marché, celui de la note de départ du banc d'essai (noteDeDepart.js :
 *      période P2, 2019-2023, jamais vue, avant-match football-data) —
 *      Σ n × (réalisé − annoncé) / Σ n de ses tranches. DÉRIVE si l'écart de
 *      départ est HORS de la fourchette du juge du mois (guard.js, par la
 *      calibration : les lignes d'un même match ensemble, la fourchette déjà
 *      élargie pour TOUTES les cases jugées du bilan) ET que l'écart du mois
 *      est plus loin de zéro que celui de départ : il a grandi. Un écart qui se
 *      resserre au-delà du hasard est dit « mieux », jamais une dérive.
 *   2. VALEUR DE CLÔTURE des pronostics du mois (1N2, plus/moins, les deux
 *      marquent : seuls marchés à clôture gratuite) : DÉRIVE si elle est
 *      négative au-delà du hasard (fourchette du juge entièrement sous zéro) —
 *      après le gel, le marché va contre les pronostics du moteur. Sa
 *      référence est zéro : la note de départ n'a de valeur de clôture que
 *      pour les paris simulés, pas pour tous les pronostics.
 *   JAMAIS SUR UN MOIS MAIGRE : une case de moins de 200 matchs (le minimum du
 *   juge, celui de la calibration) ne dit rien, elle est « trop peu ».
 *
 * Pourquoi pas la perte log face à la note de départ : le bilan du mois mêle
 * les lignes de buts que le moteur a retenues (0,5 à 3,5), dont la perte log
 * va de 0,25 à 0,75 ; un autre mélange de lignes la ferait bouger sans que le
 * moteur change. L'écart de calibration, lui, vaut zéro pour un moteur juste,
 * quelle que soit la ligne.
 *
 * L'alerte est DURABLE, dans le système d'alertes de l'actualisation
 * (refresh-status.json, clé « deriveMoteur ») : posée ou levée par l'étape
 * « calibrationMensuelle », seulement quand elle fige un mois — elle reste
 * jusqu'au mois figé suivant. La carte « Versions du moteur » et la feuille de
 * route la montrent. Rien ici n'écrit ; evaluerDerive est pure.
 * -----------------------------------------------------------------------
 */

import { NOTE_DE_DEPART } from '../bench/noteDeDepart.js';
import { JUGE, MARCHES, listeDesMoisFiges, bilanFige } from './calibration.js';
import { lireAlerteDerive, CLE_ALERTE_DERIVE } from './alerteDerive.js';

export { lireAlerteDerive, CLE_ALERTE_DERIVE };

/** La forme de la règle : une alerte garde la sienne (une règle qui change en prend une autre). */
export const VERSION_REGLE_DE_DERIVE = 1;

/** La règle, en mots simples (la carte et la feuille de route l'affichent telle quelle). */
export const REGLE_DE_DERIVE = Object.freeze({
  version: VERSION_REGLE_DE_DERIVE,
  minimum: JUGE.minBlocs,
  calibration:
    'Chaque mois figé, pour chaque marché : l’écart entre ce que le moteur annonçait et ce qui est arrivé est comparé à celui du départ (banc d’essai, 2019-2023, jamais vu). Dérive si celui du départ sort de la fourchette du hasard du mois ET que l’écart a grandi.',
  cloture: 'Et la valeur de clôture des pronostics du mois : dérive si elle est négative au-delà du hasard (le marché va contre le moteur après ses pronostics).',
  maigre: `Jamais sur un mois maigre : moins de ${JUGE.minBlocs} matchs dans une case, elle ne dit rien.`
});

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const LIBELLE = new Map(MARCHES.map((m) => [m.id, m.libelle]));

/** La famille de marché d'une ligne de la note de départ : « teamGoals:home|1.5 » → « teamGoals ». */
export const familleDeLaNote = (cle) => String(cle).split('|')[0].split(':')[0];

/**
 * Les écarts de DÉPART, par famille de marché de la calibration : Σ n × (réalisé − annoncé) / Σ n des tranches de
 * la note (P2, jamais vue), lignes de buts et équipes réunies. Pure. Rend { [marche]: { ecart, n, lignes } }.
 */
export function ecartsDeDepart(note = NOTE_DE_DEPART) {
  const parFamille = new Map();
  for (const [cle, c] of Object.entries(note?.depart?.P2?.marches ?? {})) {
    const famille = familleDeLaNote(cle);
    if (!LIBELLE.has(famille)) continue; // le score exact n'est pas un marché de l'appli
    for (const t of c?.calibration ?? []) {
      if (!(t?.n > 0) || !fini(t.annonce) || !fini(t.realise)) continue;
      const f = parFamille.get(famille) ?? { somme: 0, n: 0, lignes: new Set() };
      f.somme += t.n * (t.realise - t.annonce);
      f.n += t.n;
      f.lignes.add(cle);
      parFamille.set(famille, f);
    }
  }
  return Object.fromEntries([...parFamille.entries()].map(([marche, f]) => [marche, { ecart: f.somme / f.n, n: f.n, lignes: [...f.lignes].sort() }]));
}

/**
 * LA RÈGLE sur le bilan d'un mois (calibration.js, figé ou non). Pure. Rend { regle, mois, figeLe, vue, derive,
 * signaux (ce qui fait la dérive), examines (chaque marché : statut « derive », « stable », « mieux »,
 * « trop-peu », « sans-reference » ou « pas-juge »), cloture, minimum }.
 */
export function evaluerDerive(bilan, { note = NOTE_DE_DEPART, minimum = JUGE.minBlocs, depart = ecartsDeDepart(note) } = {}) {
  if (!bilan) return { regle: VERSION_REGLE_DE_DERIVE, mois: null, figeLe: null, vue: 'premiere', derive: false, signaux: [], examines: [], cloture: null, minimum };
  const v = bilan.vues?.premiere ?? null;
  const examines = (v?.parMarche ?? []).map((c) => {
    const reference = depart[c.marche] ?? null;
    const matchs = c.juge?.matchs ?? c.matchs ?? 0;
    const fourchette = Array.isArray(c.juge?.fourchette) && c.juge.fourchette.length === 2 && c.juge.fourchette.every(fini) ? [...c.juge.fourchette] : null;
    const ligne = {
      marche: c.marche,
      libelle: c.libelle ?? LIBELLE.get(c.marche) ?? c.marche,
      matchs,
      pronostics: c.pronostics ?? 0,
      annonce: fini(c.annonce) ? c.annonce : null,
      realise: fini(c.realise) ? c.realise : null,
      ecart: fini(c.ecart) ? c.ecart : null,
      fourchette,
      reference: reference ? { ecart: reference.ecart, n: reference.n } : null
    };
    let statut;
    if (c.juge?.verdict === 'trop-peu' || matchs < minimum) statut = 'trop-peu';
    else if (!reference) statut = 'sans-reference';
    else if (!fourchette || ligne.ecart === null) statut = 'pas-juge';
    else {
      const hors = reference.ecart < fourchette[0] || reference.ecart > fourchette[1];
      const grandi = Math.abs(ligne.ecart) > Math.abs(reference.ecart);
      statut = hors && grandi ? 'derive' : hors ? 'mieux' : 'stable';
    }
    return { ...ligne, statut, sens: statut === 'derive' ? (ligne.ecart < 0 ? 'trop-haut' : 'trop-bas') : null };
  });
  const cl = v?.cloture ?? null;
  let cloture = null;
  if (cl) {
    const matchs = cl.juge?.matchs ?? 0;
    const fourchette = Array.isArray(cl.juge?.fourchette) ? [...cl.juge.fourchette] : null;
    const statut = cl.juge?.verdict === 'trop-peu' || matchs < minimum ? 'trop-peu' : cl.juge?.verdict === 'negative' ? 'derive' : 'stable';
    cloture = { mesures: cl.mesures ?? 0, matchs, moyenne: fini(cl.moyenne) ? cl.moyenne : null, fourchette, verdict: cl.juge?.verdict ?? null, statut };
  }
  const signaux = [
    ...examines.filter((e) => e.statut === 'derive').map((e) => ({ type: 'calibration', ...e })),
    ...(cloture?.statut === 'derive' ? [{ type: 'cloture', ...cloture }] : [])
  ];
  return { regle: VERSION_REGLE_DE_DERIVE, mois: bilan.mois ?? null, figeLe: bilan.figeLe ?? null, vue: 'premiere', derive: signaux.length > 0, signaux, examines, cloture, minimum };
}

/** La valeur de l'alerte DURABLE (refresh-status.json) : posée sur une dérive, null sinon (l'alerte est levée). */
export function valeurDeLAlerte(evaluation, maintenant = Date.now()) {
  if (!evaluation?.derive) return null;
  return { regle: evaluation.regle, mois: evaluation.mois, figeLe: evaluation.figeLe, signaux: evaluation.signaux, minimum: evaluation.minimum, updatedAt: new Date(maintenant).toISOString() };
}

/**
 * La dérive pour la carte « Versions du moteur » (la route GET /api/config/versions) : la règle, le dernier mois
 * figé jugé (evaluerDerive, recalculée à la lecture : rien n'est écrit) et l'alerte durable. Ne lève jamais :
 * une base qui ne se lit pas est dite (`probleme`).
 */
export function deriveDuMoteur({ database, alerte = lireAlerteDerive() } = {}) {
  try {
    const figes = listeDesMoisFiges({ database });
    const dernier = figes[0] ?? null;
    const evaluation = dernier ? evaluerDerive(bilanFige(dernier.mois, { database })) : null;
    return { regle: REGLE_DE_DERIVE, dernierMois: evaluation, moisFiges: figes.length, alerte, probleme: null };
  } catch (error) {
    return { regle: REGLE_DE_DERIVE, dernierMois: null, moisFiges: null, alerte, probleme: String(error?.message ?? error).slice(0, 300) };
  }
}
