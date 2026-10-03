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
  width: 18px;
  height: 18px;
  border-radius: 5px;
  font-size: 9.5px;
  font-weight: 800;
  cursor: default;
}

/* Le plus récent (à droite) ressort un peu plus. */
.form-badges__item:last-child {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
}

.form-badges__item--V {
  background: rgba(var(--cm-accent-rgb) / 0.22);
  color: var(--cm-accent);
}
.form-badges__item--N {
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
}
.form-badges__item--D {
  background: rgba(var(--cm-danger-rgb) / 0.2);
  color: var(--cm-danger);
}

.form-badges__empty {
  font-size: 10.5px;
}
</style>
