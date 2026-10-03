<script setup>
import { computed } from 'vue';

/**
 * Un pourcentage en anneau : l'arc rempli à proportion, le chiffre au centre
 * (onglet Analyse IA, 01/10/2026 — « il faut que ça soit vraiment joli »).
 */
const props = defineProps({
  value: { type: Number, default: null },
  size: { type: Number, default: 48 },
  stroke: { type: Number, default: 4 }
});

const rayon = computed(() => (props.size - props.stroke) / 2);
const tour = computed(() => 2 * Math.PI * rayon.value);
const arc = computed(() => (props.value === null || props.value === undefined ? 0 : (Math.max(0, Math.min(100, props.value)) / 100) * tour.value));
const centre = computed(() => props.size / 2);
</script>

<template>
  <span class="ring" :style="{ width: `${size}px`, height: `${size}px` }" :title="value === null ? 'Probabilité inconnue' : `Probabilité selon le moteur : ${value} %`">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" aria-hidden="true">
      <circle class="ring__track" :cx="centre" :cy="centre" :r="rayon" :stroke-width="stroke" fill="none" />
      <circle
        class="ring__arc"
        :cx="centre"
        :cy="centre"
        :r="rayon"
        :stroke-width="stroke"
        fill="none"
        stroke-linecap="round"
        :stroke-dasharray="`${arc} ${tour}`"
        :transform="`rotate(-90 ${centre} ${centre})`"
      />
    </svg>
    <span class="ring__value">{{ value === null || value === undefined ? '—' : value }}<small v-if="value !== null && value !== undefined">%</small></span>
  </span>
</template>

<style scoped>
.ring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ring svg {
  position: absolute;
  inset: 0;
}

.ring__track {
  stroke: var(--cm-surface-hover);
}

.ring__arc {
  stroke: var(--cm-accent);
  filter: drop-shadow(0 0 4px rgba(var(--cm-accent-rgb) / 0.35));
  transition: stroke-dasharray 0.5s ease;
}

.ring__value {
  position: relative;
  font-size: 13px;
  font-weight: 800;
  color: var(--cm-text-primary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.2px;
}

.ring__value small {
  margin-left: 1px;
  font-size: 8.5px;
  font-weight: 700;
  color: var(--cm-text-secondary);
}
</style>
