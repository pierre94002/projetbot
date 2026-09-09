<script setup>
import { useMatchStatus } from '@/composables/useMatchStatus.js';

const props = defineProps({
  commenceTime: { type: String, default: null }
});

const status = useMatchStatus(() => props.commenceTime);

const LABELS = { live: 'Direct', finished: 'Terminé', upcoming: 'À venir' };
</script>

<template>
  <span v-if="status" class="match-status-badge" :class="`match-status-badge--${status}`">
    <span v-if="status === 'live'" class="match-status-badge__dot"></span>{{ LABELS[status] }}
  </span>
</template>

<style scoped>
.match-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2px;
  white-space: nowrap;
  text-transform: uppercase;
}

.match-status-badge--live {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.match-status-badge--finished {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.match-status-badge--upcoming {
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
}

.match-status-badge__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--cm-danger);
  animation: cm-live-pulse 1.4s ease-in-out infinite;
}

@keyframes cm-live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
