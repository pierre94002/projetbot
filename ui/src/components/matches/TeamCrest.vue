<script setup>
import { computed, ref, watch } from 'vue';
import { logoEquipe } from '@/utils/playerVisuals.js';
import { teamIdFor } from '@/utils/teamIds.js';

/**
 * Le logo d'un club dans un rond blanc, partout où l'appli montre une
 * rencontre (01/10/2026). Par son identifiant FotMob quand l'appelant le
 * connaît, sinon retrouvé d'après son nom et sa compétition (teamIds.js) ;
 * ses initiales tant que le logo manque.
 */
const props = defineProps({
  name: { type: String, default: '' },
  league: { type: String, default: null },
  teamId: { type: String, default: null },
  size: { type: Number, default: 30 }
});

// Un identifiant d'une autre source (API-Football : un simple nombre) n'a
// pas de logo FotMob : le club est alors retrouvé d'après son nom.
const idFotMob = (x) => (/^fotmob-\d+$/.test(String(x ?? '')) ? String(x) : null);
const id = computed(() => idFotMob(props.teamId) ?? teamIdFor(props.name, props.league) ?? null);
const enErreur = ref(false);
watch(id, () => {
  enErreur.value = false;
});
const logo = computed(() => (enErreur.value ? null : logoEquipe(id.value)));

const initiales = computed(() => {
  const mots = String(props.name ?? '').replace(/\./g, ' ').trim().split(/\s+/).filter(Boolean);
  return mots.length > 1 ? `${mots[0][0]}${mots[1][0]}`.toUpperCase() : (mots[0] ?? '?').slice(0, 3).toUpperCase();
});
</script>

<template>
  <span class="crest" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(8, Math.round(size / 3))}px` }" :title="name">
    <img v-if="logo" :src="logo" alt="" loading="lazy" @error="enErreur = true" />
    <span v-else>{{ initiales }}</span>
  </span>
</template>

<style scoped>
.crest {
  display: inline-flex;
  vertical-align: middle;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.92);
  color: #1c7a45;
  font-weight: 800;
  line-height: 1;
}

.crest img {
  width: 78%;
  height: 78%;
  object-fit: contain;
}
</style>
