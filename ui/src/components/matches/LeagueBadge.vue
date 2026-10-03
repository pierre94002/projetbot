<script setup>
import { computed, ref, watch } from 'vue';
import { parseLeagueLabel } from '@/utils/leagueDisplay.js';
import { drapeau } from '@/utils/pays.js';

/**
 * Une compétition : le drapeau de son pays (FotMob, d'après le code FIFA du
 * libellé « La Liga - Spain »), son nom ; le code à trois lettres quand le
 * drapeau manque. Une coupe sans pays (« EFL Cup ») n'a que son nom.
 */
const props = defineProps({
  league: { type: String, default: null }
});

const parsed = computed(() => parseLeagueLabel(props.league));
const enErreur = ref(false);
watch(() => parsed.value.countryCode, () => {
  enErreur.value = false;
});
const image = computed(() => (enErreur.value ? null : drapeau(parsed.value.countryCode)));
</script>

<template>
  <span class="league-badge">
    <span v-if="parsed.countryCode" class="league-badge__country" :title="parsed.country ?? ''">
      <img v-if="image" :src="image" alt="" loading="lazy" @error="enErreur = true" />
      <template v-else>{{ parsed.countryCode }}</template>
    </span>
    <span class="league-badge__name cm-truncate">{{ parsed.name }}</span>
  </span>
</template>

<style scoped>
.league-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.league-badge__country {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: 6px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  overflow: hidden;
}

.league-badge__country img {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.league-badge__name {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
  flex: 1;
  min-width: 0;
}
</style>
