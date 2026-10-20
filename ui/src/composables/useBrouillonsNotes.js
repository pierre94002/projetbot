import { reactive } from 'vue';

/**
 * Les notes de la feuille de route que Pierre est en train d'écrire (étape 5 du
 * plan) : un texte NON enregistré par étape, gardé en mémoire tant que la page
 * de l'appli est ouverte. Replier un lot, changer de page puis revenir ne fait
 * pas perdre ce qui a été tapé : l'éditeur de la note se rouvre avec son brouillon.
 *
 * `brouillons[id]` n'existe que pendant l'édition : sa présence EST l'état
 * « en train d'écrire » (même une chaîne vide, pour une note à effacer). Il est
 * retiré à l'enregistrement et à l'annulation.
 */
const brouillons = reactive({});

export function useBrouillonsNotes() {
  return brouillons;
}
