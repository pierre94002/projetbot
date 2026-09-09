import { ref } from 'vue';

/**
 * Horloge partagée pour tout statut dérivé du temps (match en direct/terminé,
 * etc.) — un seul setInterval pour toute l'app plutôt qu'un par ligne de
 * match affichée (des dizaines de timers redondants sur la page Matchs).
 */
export const liveNow = ref(Date.now());

setInterval(() => {
  liveNow.value = Date.now();
}, 30000);
