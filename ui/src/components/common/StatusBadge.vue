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
  rejected: { label: 'Rejeté', tone: 'negative' }
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
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.85;
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
