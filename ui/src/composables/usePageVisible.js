/**
 * usePageVisible.js — l'onglet est-il caché ? (étape 46 du plan, lot 1, correctifs D2, 12/11/2026, point 1).
 *
 * Une page du direct ouverte dans un onglet caché ne lit rien (ni page cachée, R3) ; elle relit DÈS que l'onglet redevient
 * visible (`visibilitychange`), en direct comme en rejeu — sans quoi un rejeu ouvert caché restait à « Lecture du
 * direct… » pour toujours. Sans document (rendu côté serveur), l'onglet n'est jamais caché et rien n'est écouté.
 */

/** Vrai quand l'onglet est caché (jamais sans document). */
export const pageCachee = () => typeof document !== 'undefined' && document.hidden === true;

/** Appelle `fn` chaque fois que l'onglet redevient visible ; rend la fonction qui arrête d'écouter. */
export function surVisible(fn) {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return () => {};
  const ecoute = () => {
    if (!pageCachee()) fn();
  };
  document.addEventListener('visibilitychange', ecoute);
  return () => document.removeEventListener('visibilitychange', ecoute);
}
