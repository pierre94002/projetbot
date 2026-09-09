<script setup>
import { computed } from 'vue';
import { parseLeagueLabel } from '@/utils/leagueDisplay.js';

const props = defineProps({
  league: { type: String, default: null }
});

const parsed = computed(() => parseLeagueLabel(props.league));
</script>

<template>
  <span class="league-badge">
    <span v-if="parsed.countryCode" class="league-badge__country">{{ parsed.countryCode }}</span>
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
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.league-badge__name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  flex: 1;
  min-width: 0;
}
</style>
