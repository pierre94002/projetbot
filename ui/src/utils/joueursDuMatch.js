/**
 * joueursDuMatch.js — retrouver l'IDENTIFIANT d'un joueur nommé dans le déroulé d'un match (étape 45 du plan, 24/10/2026), pour son
 * drapeau. Les événements du déroulé ne portent que des noms, et pas toujours écrits comme la feuille du match (le fil dit « Pascal
 * Groß », « Jurriën Timber », la feuille « Pascal Gross », « Jurrien Timber ») : rapprochés sans accents ni majuscules, DANS LE CAMP de
 * l'événement — le même rapprochement que le fil du match (MatchEventList.vue), écrit ici pour que les moments clés (KeyMomentsList.vue)
 * n'aient pas à le recopier. Règles PURES : ni Vue, ni service.
 *
 * Jamais un nom approché au hasard : un nom de famille n'est retenu que s'il est PORTÉ PAR UN SEUL joueur du camp. Sinon, pas de
 * drapeau (le nom reste écrit) plutôt qu'un drapeau faux.
 */

/** Un nom sans accents, en minuscules, sans ponctuation (« Pascal Groß » → « pascal gross »). */
export function simplifier(nom) {
  const sansAccents = [...String(nom ?? '').normalize('NFD')]
    .filter((c) => {
      const code = c.charCodeAt(0);
      return code < 0x300 || code > 0x36f;
    })
    .join('');
  return sansAccents
    .replace(/ß/g, 'ss')
    .replace(/[ıİ]/g, 'i')
    .replace(/[øØ]/g, 'o')
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐ]/g, 'd')
    .replace(/[æÆ]/g, 'ae')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Les joueurs de chaque camp, prêts à être cherchés : { home: { exacts: Map nom → id, joueurs: [{ id, nom }] }, away: … }. */
export function indexDesJoueurs(players) {
  const parCamp = {};
  for (const camp of ['home', 'away']) {
    const joueurs = (players?.[camp] ?? []).filter((p) => p?.playerId).map((p) => ({ id: p.playerId, nom: simplifier(p.name) }));
    parCamp[camp] = { exacts: new Map(joueurs.map((j) => [j.nom, j.id])), joueurs };
  }
  return parCamp;
}

/** L'identifiant du joueur nommé : même nom, sinon même nom de famille s'il est seul à le porter dans son camp ; sinon null. */
export function idDuJoueur(index, camp, nom) {
  const c = index?.[camp];
  const cle = simplifier(nom);
  if (!c || !cle) return null;
  if (c.exacts.has(cle)) return c.exacts.get(cle);
  const famille = cle.split(' ').at(-1);
  const memes = c.joueurs.filter((j) => j.nom.split(' ').at(-1) === famille);
  return memes.length === 1 ? memes[0].id : null;
}
