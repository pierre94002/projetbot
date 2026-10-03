<script setup>
import { computed } from 'vue';
import TeamCrest from './TeamCrest.vue';
import { campsDe } from '@/utils/pronosticEquipe.js';

/**
 * Le logo de l'équipe dont parle une ligne — pronostic, sélection d'un pari,
 * issue d'un match — devant son texte (01/10/2026, « des logos à chaque ligne
 * où il y a un nom d'équipe »). `side` impose le camp ; sinon il est déduit
 * de la ligne (`item`, cf. utils/pronosticEquipe.js). Rien quand la ligne ne
 * vise aucune équipe, sauf `reserve` : une place vide garde les textes d'un
 * tableau alignés.
 */
const props = defineProps({
  item: { type: [Object, String], default: null },
  side: { type: String, default: null },
  home: { type: String, default: null },
  away: { type: String, default: null },
  league: { type: String, default: null },
  homeId: { type: String, default: null },
  awayId: { type: String, default: null },
  size: { type: Number, default: 16 },
  reserve: { type: Boolean, default: false }
});

const camps = computed(() => {
  if (props.side === 'home' || props.side === 'away') return [props.side];
  if (props.side) return [];
  return campsDe(props.item, { home: props.home, away: props.away });
});
const equipe = (cote) => (cote === 'home' ? { name: props.home, id: props.homeId } : { name: props.away, id: props.awayId });
</script>

<template>
  <span v-if="camps.length || reserve" class="pick-crest" :style="reserve && !camps.length ? { width: `${size}px` } : null">
    <TeamCrest v-for="c in camps" :key="c" :name="equipe(c).name ?? ''" :league="league" :team-id="equipe(c).id ?? null" :size="size" />
  </span>
</template>

<style scoped>
.pick-crest {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  margin-right: 6px;
  vertical-align: middle;
}
</style>
