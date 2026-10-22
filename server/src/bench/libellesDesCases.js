/**
 * libellesDesCases.js — le nom d'une case du banc d'essai (famille × ligne) pour Pierre (étape 27 du plan,
 * 21/10/2026) : « Plus/moins 2,5 buts », « Résultat + total 2,5 », « Buts de l’équipe qui reçoit 1,5 »…
 * Pur et LÉGER (aucun import) : la porte 1 du banc (bancCandidate.js) et le bloc « avant / après » de la feuille de
 * route (data/roadmap/bancEtape27.js) disent les mêmes mots sans charger le banc.
 */

/** Le nom d'une case (famille × ligne) : une famille seule (« teamGoals ») se dit « Buts d’une équipe ». */
export function libelleDeLaCase(cle) {
  const [marche, ligne] = String(cle).split('|');
  const [famille, equipe] = marche.split(':');
  const l = ligne === undefined ? '' : ` ${String(ligne).replace('.', ',')}`;
  if (famille === 'totalGoals') return `Plus/moins${l} buts`;
  if (famille === 'bothTeamsScore') return 'Les 2 équipes marquent';
  if (famille === 'teamGoals') return equipe ? `Buts de l’équipe ${equipe === 'away' ? 'qui se déplace' : 'qui reçoit'}${l}` : `Buts d’une équipe${l}`;
  if (famille === 'resultAndTotal') return `Résultat + total${l}`;
  if (famille === 'scoreExact') return 'Score exact';
  return String(cle);
}
