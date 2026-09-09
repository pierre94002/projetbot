<script setup>
import { computed } from 'vue';
import { formatDateTime } from '@/utils/format.js';

const props = defineProps({
  form: { type: Object, default: null }
});

// Le plus récent arrive en premier depuis l'API ; on affiche du plus ancien (gauche) au plus récent (droite).
const chronological = computed(() => [...(props.form?.matches ?? [])].reverse());

function tooltipFor(match) {
  const opponentSide = match.home ? 'vs' : '@';
  return `${opponentSide} ${match.opponent} (${match.score}) — ${formatDateTime(match.date)}`;
}
</script>

<template>
  <span v-if="chronological.length" class="form-badges">
    <span v-for="(match, index) in chronological" :key="index" class="form-badges__item" :class="`form-badges__item--${match.result}`" :title="tooltipFor(match)">
      {{ match.result }}
    </span>
  </span>
  <span v-else class="cm-text-muted form-badges__empty">forme indisponible</span>
</template>

<style scoped>
.form-badges {
  display: inline-flex;
  gap: 3px;
}

.form-badges__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  cursor: default;
}

.form-badges__item--V {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}
.form-badges__item--N {
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
}
.form-badges__item--D {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.form-badges__empty {
  font-size: 10.5px;
}
</style>
