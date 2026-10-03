<script setup>
import { computed, ref, watch } from 'vue';
import { drapeau, nomPays } from '@/utils/pays.js';
import { playerInfoFor } from '@/utils/playerInfo.js';

/**
 * La nationalité d'un joueur : son drapeau (FotMob), le nom du pays en
 * français au survol — 01/10/2026, « il me faut aussi leur nationalité ».
 * Le code pays quand l'appelant l'a (`code`), sinon retrouvé d'après
 * l'identifiant du joueur (playerInfo.js). `label` : le nom écrit à côté.
 */
const props = defineProps({
  code: { type: String, default: null },
  name: { type: String, default: null }, // nom anglais de FotMob, en repli
  playerId: { type: String, default: null },
  label: { type: Boolean, default: false },
  size: { type: Number, default: 16 }
});

const info = computed(() => (props.code ? null : props.playerId ? playerInfoFor(props.playerId) : null));
const codePays = computed(() => props.code ?? info.value?.countryCode ?? null);
const pays = computed(() => (codePays.value ? nomPays(codePays.value, props.name ?? info.value?.countryName ?? null) : null));
const enErreur = ref(false);
watch(codePays, () => {
  enErreur.value = false;
});
const image = computed(() => (enErreur.value ? null : drapeau(codePays.value)));
</script>

<template>
  <span v-if="codePays" class="flag" :title="pays ?? codePays">
    <img v-if="image" :src="image" alt="" loading="lazy" :style="{ width: `${size}px`, height: `${size}px` }" @error="enErreur = true" />
    <span v-else class="flag__code">{{ codePays }}</span>
    <span v-if="label" class="flag__label">{{ pays }}</span>
  </span>
</template>

<style scoped>
.flag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  vertical-align: middle;
}

.flag img {
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.flag__code {
  font-size: 9px;
  font-weight: 700;
  color: var(--cm-text-muted);
}

.flag__label {
  font-size: inherit;
}
</style>
