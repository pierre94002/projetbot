<script setup>
import { computed } from 'vue';

const props = defineProps({
  status: { type: String, required: true }
});

const STYLES = {
  RECOMMENDED: { label: 'Value détectée', tone: 'positive' },
  PASS: { label: 'Pass', tone: 'neutral' },
  CIRCUIT_BREAKER_ACTIVE: { label: 'Coupe-circuit actif', tone: 'negative' },
  analyzed: { label: 'Analysé', tone: 'positive' },
  rejected: { label: 'Rejeté', tone: 'negative' },
  V: { label: 'Victoire', tone: 'positive' },
  N: { label: 'Nul', tone: 'neutral' },
  D: { label: 'Défaite', tone: 'negative' }
};

const style = computed(() => STYLES[props.status] ?? { label: props.status, tone: 'neutral' });
</script>

<template>
  <span class="badge" :class="`badge--${style.tone}`">{{ style.label }}</span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.badge--positive {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}
.badge--negative {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}
.badge--neutral {
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
}
</style>
