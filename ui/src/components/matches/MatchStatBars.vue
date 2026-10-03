<script setup>
import { computed } from 'vue';
import EmptyState from '@/components/common/EmptyState.vue';

/**
 * Comparatif d'un groupe de statistiques, dans la forme de FotMob : la valeur
 * de chaque camp de part et d'autre du libellé, et une barre dont la part
 * revenant à chacun montre l'écart d'un coup d'œil. Le camp qui mène sur une
 * ligne garde sa couleur (vert à gauche, ambre à droite), l'autre reste neutre.
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
      <span class="stat-bars__value stat-bars__value--home cm-numeric" :class="{ 'is-lead': (share(row) ?? 50) > 50 }">{{ display('home', row) }}</span>
      <span class="stat-bars__label">{{ row.label }}</span>
      <span class="stat-bars__value stat-bars__value--away cm-numeric" :class="{ 'is-lead': (share(row) ?? 50) < 50 }">{{ display('away', row) }}</span>
      <div class="stat-bars__track">
        <span class="stat-bars__fill stat-bars__fill--home" :class="{ 'is-trail': (share(row) ?? 50) < 50 }" :style="{ width: `${share(row) ?? 50}%` }" />
        <span class="stat-bars__fill stat-bars__fill--away" :class="{ 'is-trail': (share(row) ?? 50) > 50 }" :style="{ width: `${100 - (share(row) ?? 50)}%` }" />
      </div>
    </div>
  </div>
  <EmptyState v-else icon="barChart" title="Rien à comparer ici" description="Aucune de ces statistiques n'est publiée pour ce match." />
</template>

<style scoped>
.stat-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-bars__row {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr) 60px;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 5px 12px;
}

/* La valeur de chaque camp : en gras, chiffres tabulaires ; celle du camp
   qui mène prend la couleur de sa barre. */
.stat-bars__value {
  font-size: 13.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
  white-space: nowrap;
  transition: color var(--cm-transition);
}

.stat-bars__value--home {
  text-align: right;
}

.stat-bars__value--home.is-lead {
  color: var(--cm-accent);
}

.stat-bars__value--away.is-lead {
  color: var(--cm-warning);
}

/* Le libellé, en petites capitales au centre. */
.stat-bars__label {
  min-width: 0;
  text-align: center;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-bars__track {
  grid-column: 1 / -1;
  display: flex;
  gap: 3px;
  height: 6px;
}

.stat-bars__fill {
  border-radius: 999px;
  min-width: 3px;
  transition: width var(--cm-transition-slow), opacity var(--cm-transition);
}

.stat-bars__fill--home {
  background: var(--cm-accent);
}

.stat-bars__fill--away {
  background: var(--cm-warning);
}

/* Le camp mené : sa part de barre s'efface un peu, l'écart se lit d'un coup. */
.stat-bars__fill.is-trail {
  opacity: 0.45;
}
</style>
