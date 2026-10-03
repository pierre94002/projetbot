import { onBeforeUnmount, watch } from 'vue';
import { liveNow } from '@/utils/liveClock.js';

// FotMob publie la composition officielle une heure avant le coup d'envoi en
// général : relire toutes les 5 min suffit à la voir arriver, et la boucle
// des compositions côté serveur (lineupPrefetch.js) ne relit pas plus souvent.
const INTERVALLE_MS = 5 * 60_000;
/** Fenêtre où la relecture a un sens : de 3 h avant le coup d'envoi à 2 h après. */
const AVANT_MS = 3 * 3_600_000;
const APRES_MS = 2 * 3_600_000;

/**
 * Le coup d'envoi est-il assez proche pour que la composition puisse sortir ?
 * Lu sur l'horloge partagée : dans un getter surveillé, la fenêtre s'ouvre
 * d'elle-même quand l'heure y entre, page restée ouverte.
 */
export function compositionAttendue(coupDEnvoi, maintenant = liveNow.value) {
  const t = Date.parse(coupDEnvoi ?? '');
  return Number.isFinite(t) && t - maintenant <= AVANT_MS && maintenant - t <= APRES_MS;
}

/**
 * Relit la composition toutes les 5 min tant que `actif()` est vrai — onglet
 * Composition ouvert, composition du match pas encore publiée, coup d'envoi
 * proche (cf. compositionAttendue) : la composition d'avant-match remplace
 * alors d'elle-même la dernière composition alignée (demande de Pierre le
 * 01/10/2026). Lecture FotMob gratuite.
 */
export function useLineupPolling(actif, relire) {
  let minuteur = null;
  const arreter = () => {
    if (minuteur) clearInterval(minuteur);
    minuteur = null;
  };
  watch(
    actif,
    (oui) => {
      arreter();
      if (oui) minuteur = setInterval(relire, INTERVALLE_MS);
    },
    { immediate: true }
  );
  onBeforeUnmount(arreter);
}
