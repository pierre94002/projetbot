<script setup>
import { computed, ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';

const props = defineProps({
  modelValue: { type: String, required: true }, // 'all' | 'today' | 'week' | 'YYYY-MM-DD'
  availableDates: { type: Array, required: true } // ['YYYY-MM-DD', ...] triées, une entrée par jour ayant au moins un match
});

const emit = defineEmits(['update:modelValue']);

const QUICK_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' }
];

const isSpecificDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(props.modelValue));

const dateLabel = computed(() => {
  if (!isSpecificDate.value) return 'Choisir une date';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(props.modelValue));
});

function currentDateIndex() {
  if (!isSpecificDate.value) return -1;
  return props.availableDates.indexOf(props.modelValue);
}

function goToAdjacentDate(direction) {
  const index = currentDateIndex();
  const nextIndex = index === -1 ? (direction > 0 ? 0 : props.availableDates.length - 1) : index + direction;
  if (nextIndex < 0 || nextIndex >= props.availableDates.length) return;
  emit('update:modelValue', props.availableDates[nextIndex]);
}

const canGoPrevious = computed(() => currentDateIndex() !== 0 && props.availableDates.length > 0);
const canGoNext = computed(() => currentDateIndex() !== props.availableDates.length - 1 && props.availableDates.length > 0);

// Liste déroulante avec TOUTES les dates disponibles (pas seulement pas-à-pas
// via les flèches) — pratique pour sauter directement à une date lointaine
// du championnat sans cliquer la flèche N fois.
const dropdownOpen = ref(false);

function formatDateOption(dateStr) {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(dateStr));
}

function selectDate(dateStr) {
  emit('update:modelValue', dateStr);
  dropdownOpen.value = false;
}
</script>

<template>
  <div class="filter-bar">
    <div class="filter-bar__pills">
      <button
        v-for="filter in QUICK_FILTERS"
        :key="filter.value"
        type="button"
        class="filter-bar__pill"
        :class="{ 'filter-bar__pill--active': modelValue === filter.value }"
        @click="emit('update:modelValue', filter.value)"
      >
        {{ filter.label }}
      </button>
    </div>

    <div class="filter-bar__date-nav">
      <button type="button" class="filter-bar__nav-btn" :disabled="!canGoPrevious" @click="goToAdjacentDate(-1)">
        <AppIcon name="chevronRight" :size="14" style="transform: rotate(180deg)" />
      </button>

      <div class="filter-bar__date-picker">
        <button
          type="button"
          class="filter-bar__date-label"
          :class="{ 'filter-bar__date-label--active': isSpecificDate }"
          :disabled="!availableDates.length"
          @click="dropdownOpen = !dropdownOpen"
        >
          {{ dateLabel }}
          <AppIcon name="chevronRight" :size="10" style="transform: rotate(90deg)" />
        </button>

        <template v-if="dropdownOpen">
          <div class="filter-bar__date-backdrop" @click="dropdownOpen = false"></div>
          <div class="filter-bar__date-dropdown">
            <button
              v-for="date in availableDates"
              :key="date"
              type="button"
              class="filter-bar__date-option"
              :class="{ 'filter-bar__date-option--active': date === modelValue }"
              @click="selectDate(date)"
            >
              {{ formatDateOption(date) }}
            </button>
          </div>
        </template>
      </div>

      <button type="button" class="filter-bar__nav-btn" :disabled="!canGoNext" @click="goToAdjacentDate(1)">
        <AppIcon name="chevronRight" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.filter-bar__pills {
  display: flex;
  gap: 6px;
}

.filter-bar__pill {
  padding: 6px 13px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), border-color var(--cm-transition);
}

.filter-bar__pill:hover {
  border-color: var(--cm-accent);
  color: var(--cm-text-primary);
}

.filter-bar__pill--active {
  background: var(--cm-accent);
  border-color: var(--cm-accent);
  color: #06251b;
}

.filter-bar__date-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.filter-bar__nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  color: var(--cm-text-secondary);
  cursor: pointer;
}

.filter-bar__nav-btn:hover:not(:disabled) {
  border-color: var(--cm-accent);
  color: var(--cm-text-primary);
}

.filter-bar__nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.filter-bar__date-picker {
  position: relative;
}

.filter-bar__date-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 96px;
  padding: 4px 6px;
  border: none;
  border-radius: var(--cm-radius-sm);
  background: transparent;
  text-align: center;
  font-size: 12.5px;
  color: var(--cm-text-muted);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.filter-bar__date-label:hover:not(:disabled) {
  background: var(--cm-surface-hover);
  color: var(--cm-text-primary);
}

.filter-bar__date-label:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.filter-bar__date-label--active {
  color: var(--cm-text-primary);
  font-weight: 600;
}

.filter-bar__date-backdrop {
  position: fixed;
  inset: 0;
  z-index: 30;
}

.filter-bar__date-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 31;
  display: flex;
  flex-direction: column;
  max-height: 260px;
  overflow-y: auto;
  min-width: 160px;
  padding: 6px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
}

.filter-bar__date-option {
  padding: 6px 10px;
  border: none;
  border-radius: var(--cm-radius-sm);
  background: transparent;
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.filter-bar__date-option:hover {
  background: var(--cm-surface-hover);
  color: var(--cm-text-primary);
}

.filter-bar__date-option--active {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
  font-weight: 600;
}
</style>
