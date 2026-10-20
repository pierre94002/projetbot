<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { decrireComposition, etatComposition } from '@/utils/langageParis.js';

/**
 * La pastille d'ÉTAT D'UNE COMPOSITION (étape 6 du plan, 06/10/2026) : officielle,
 * probable, dernière alignée — ou pas encore publiée. Un seul dessin pour la
 * page d'un match, celle d'une équipe et le panneau de l'IA.
 *
 * FotMob ne dit jamais si la composition qu'il publie est officielle : l'état se
 * DÉDUIT de ce que le serveur a vu (cf. etatComposition, utils/langageParis.js) —
 * lue dans l'heure qui précède le coup d'envoi, ou après, et sans titulaire dit
 * indisponible : officielle ; plus tôt : probable ; rien de publié et la
 * dernière composition alignée gardée au magasin : dernière alignée. La phrase
 * complète, avec cette déduction, est au survol.
 *
 * `snapshot` : la composition telle que le serveur la renvoie (`lineups` ou
 * `lastLineups` de /match-stats/preview) ; `etat` : un état déjà connu.
 * Ni vert (réservé à la value) ni rouge : officielle en bleu, le reste en ambre.
 */
const props = defineProps({
  snapshot: { type: Object, default: null },
  etat: { type: String, default: null }, // 'officielle' | 'probable' | 'derniere' | 'absente'
  taille: { type: String, default: 'md' } // 'sm' | 'md'
});

const lu = computed(() => (props.etat ? decrireComposition(props.etat) : etatComposition(props.snapshot)));
const ICONES = { officielle: 'check', probable: 'clock', derniere: 'history', absente: 'minus' };
</script>

<template>
  <span class="lstate" :class="[`is-${lu.etat}`, `lstate--${taille}`]" :title="lu.raison">
    <AppIcon :name="ICONES[lu.etat]" :size="taille === 'sm' ? 10 : 12" class="lstate__icon" />
    <span class="lstate__text">{{ lu.libelle }}</span>
  </span>
</template>

<style scoped>
.lstate {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: help;
}

.lstate--sm {
  padding: 1px 8px 1px 6px;
  font-size: 10.5px;
}

.lstate__icon {
  flex-shrink: 0;
}

/* Officielle : le bleu d'information (jamais le vert de la value). */
.lstate.is-officielle {
  background: var(--cm-info-soft);
  color: var(--cm-info);
}

/* Probable, dernière alignée : l'ambre de « peut encore changer ». */
.lstate.is-probable,
.lstate.is-derniere {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

/* Pas publiée : grisé, en pointillés. */
.lstate.is-absente {
  border-style: dashed;
  border-color: var(--cm-border-strong);
  background: transparent;
  color: var(--cm-text-muted);
}
</style>
