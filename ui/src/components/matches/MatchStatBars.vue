<script setup>
import { computed } from 'vue';

/**
 * Comparatif d'un groupe de statistiques, dans la forme de FotMob : la valeur
 * de chaque camp de part et d'autre du libellé, et une barre dont la part
 * revenant à chacun montre l'écart d'un coup d'œil.
 */
const props = defineProps({
  group: { type: Object, required: true },
  home: { type: Object, default: () => ({}) },
  away: { type: Object, default: () => ({}) }
});

function raw(side, key) {
  const value = (side === 'home' ? props.home : props.away)?.[key];
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function display(side, row) {
  const value = raw(side, row.key);
  if (value === null) return '—';
  if (row.percent) return `${Math.round(value)} %`;
  if (row.decimals) return value.toFixed(row.decimals).replace('.', ',');
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',');
}

/**
 * Part de la barre revenant à chaque camp. Une ligne où les deux valent zéro
 * est partagée en deux plutôt que de laisser une barre vide.
 */
function share(row) {
  const h = raw('home', row.key);
  const a = raw('away', row.key);
  if (h === null || a === null) return null;
  const total = Math.abs(h) + Math.abs(a);
  if (!total) return 50;
  return Math.round((Math.abs(h) / total) * 100);
}

// Une ligne qu'aucun des deux camps ne renseigne n'apprend rien : on la cache
// plutôt que d'aligner des tirets.
const rows = computed(() => props.group.rows.filter((row) => raw('home', row.key) !== null || raw('away', row.key) !== null));
</script>

<template>
  <div v-if="rows.length" class="stat-bars">
    <div v-for="row in rows" :key="row.key" class="stat-bars__row">
      <span class="stat-bars__value stat-bars__value--home">{{ display('home', row) }}</span>
      <span class="stat-bars__label">{{ row.label }}</span>
      <span class="stat-bars__value">{{ display('away', row) }}</span>
      <div class="stat-bars__track">
        <span class="stat-bars__fill stat-bars__fill--home" :style="{ width: `${share(row) ?? 50}%` }" />
        <span class="stat-bars__fill stat-bars__fill--away" :style="{ width: `${100 - (share(row) ?? 50)}%` }" />
      </div>
    </div>
  </div>
  <p v-else class="cm-text-muted">Aucune de ces statistiques n'est publiée pour ce match.</p>
</template>

<style scoped>
.stat-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-bars__row {
  display: grid;
  grid-template-columns: 56px 1fr 56px;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 4px 10px;
  font-size: 12.5px;
}

.stat-bars__value {
  font-family: var(--cm-font-mono);
  font-weight: 600;
}

.stat-bars__value--home {
  text-align: right;
}

.stat-bars__label {
  text-align: center;
  color: var(--cm-text-secondary);
  font-size: 11.5px;
}

.stat-bars__track {
  grid-column: 1 / -1;
  display: flex;
  gap: 3px;
  height: 5px;
}

.stat-bars__fill {
  border-radius: 3px;
  min-width: 2px;
  transition: width var(--cm-transition);
}

.stat-bars__fill--home {
  background: var(--cm-accent);
}

.stat-bars__fill--away {
  background: var(--cm-warning);
}
</style>
