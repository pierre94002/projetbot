<script setup>
import { computed, ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';

/**
 * Stats individuelles des joueurs sur UN match (actualisation automatique FotMob, cf.
 * server/scripts/merge-match-stats.mjs). Une colonne sans aucune valeur pour
 * l'équipe affichée est masquée plutôt que remplie de "—" : une trentaine de
 * colonnes vides rendrait le tableau illisible dans la modale.
 *
 * Refonte du 01/10/2026 : titre en petites capitales, le choix de l'équipe en
 * barre segmentée (l'actif en couleur de section), le tableau commun
 * `.cm-table`, les remplaçants en grisé, la précision en note sous le tableau.
 */
const props = defineProps({
  teamName: { type: String, required: true },
  opponentName: { type: String, default: 'Adversaire' },
  players: { type: Object, default: () => ({ team: [], opponent: [] }) } // { team: [...], opponent: [...] }
});

const COLUMNS = [
  { key: 'minutes', label: 'Min' },
  { key: 'rating', label: 'Note', format: (v) => v.toFixed(1) },
  { key: 'goals', label: 'Buts' },
  { key: 'assists', label: 'PD' },
  { key: 'shots', label: 'Tirs', render: (p) => (p.shots == null ? null : p.shotsOnTarget == null ? p.shots : `${p.shots} (${p.shotsOnTarget})`), title: 'Tirs (cadrés)' },
  { key: 'xg', label: 'xG', format: (v) => v.toFixed(2) },
  { key: 'xa', label: 'xA', format: (v) => v.toFixed(2) },
  { key: 'keyPasses', label: 'P. clés', title: 'Passes clés' },
  { key: 'passes', label: 'Passes', render: (p) => (p.passes == null ? null : p.passesAccurate == null ? p.passes : `${p.passesAccurate}/${p.passes}`), title: 'Passes réussies / tentées' },
  { key: 'crosses', label: 'Centres' },
  { key: 'dribblesWon', label: 'Drib.', title: 'Dribbles réussis' },
  { key: 'touches', label: 'Ballons', title: 'Ballons touchés' },
  { key: 'tackles', label: 'Tacles' },
  { key: 'interceptions', label: 'Interc.' },
  { key: 'clearances', label: 'Dégag.' },
  { key: 'duelsWon', label: 'Duels', render: (p) => (p.duelsWon == null ? null : p.duelsTotal == null ? p.duelsWon : `${p.duelsWon}/${p.duelsTotal}`), title: 'Duels gagnés / disputés' },
  { key: 'foulsCommitted', label: 'Fautes', title: 'Fautes commises' },
  { key: 'foulsSuffered', label: 'Subies', title: 'Fautes subies' },
  { key: 'offsides', label: 'HJ', title: 'Hors-jeux' },
  { key: 'yellowCards', label: 'CJ', title: 'Cartons jaunes' },
  { key: 'redCards', label: 'CR', title: 'Cartons rouges' },
  { key: 'saves', label: 'Arrêts' },
  { key: 'goalsConceded', label: 'Enc.', title: 'Buts encaissés' }
];

const activeSide = ref('team');

const displayedPlayers = computed(() =>
  [...(props.players?.[activeSide.value] ?? [])].sort(
    (a, b) => Number(Boolean(b.starter)) - Number(Boolean(a.starter)) || (b.minutes ?? 0) - (a.minutes ?? 0)
  )
);

const visibleColumns = computed(() => COLUMNS.filter((col) => displayedPlayers.value.some((p) => p[col.key] != null)));

function cell(player, col) {
  if (col.render) return col.render(player) ?? '—';
  const value = player[col.key];
  if (value == null) return '—';
  return col.format ? col.format(value) : value;
}

const hasAnyPlayers = computed(() => (props.players?.team?.length ?? 0) + (props.players?.opponent?.length ?? 0) > 0);
const hasStarterInfo = computed(() => displayedPlayers.value.some((p) => typeof p.starter === 'boolean'));
</script>

<template>
  <div class="match-players">
    <p class="cm-section-title match-players__title">
      Statistiques des joueurs sur ce match
      <span class="cm-section-title__hint">feuille de match FotMob</span>
    </p>

    <p v-if="!hasAnyPlayers" class="cm-text-muted match-players__note">
      <AppIcon name="info" :size="12" />
      <span>Aucune statistique joueur confirmée pour ce match (source indisponible lors de l'import).</span>
    </p>

    <template v-else>
      <!-- Le choix de l'équipe : barre segmentée, même dessin que TabbedView. -->
      <div class="match-players__tabs" role="tablist">
        <button type="button" role="tab" class="match-players__tab" :class="{ 'match-players__tab--active': activeSide === 'team' }" :aria-selected="activeSide === 'team'" @click="activeSide = 'team'">
          {{ teamName }} <span class="match-players__count cm-numeric">{{ players.team?.length ?? 0 }}</span>
        </button>
        <button type="button" role="tab" class="match-players__tab" :class="{ 'match-players__tab--active': activeSide === 'opponent' }" :aria-selected="activeSide === 'opponent'" @click="activeSide = 'opponent'">
          {{ opponentName }} <span class="match-players__count cm-numeric">{{ players.opponent?.length ?? 0 }}</span>
        </button>
      </div>

      <p v-if="displayedPlayers.length === 0" class="cm-text-muted match-players__note">
        <AppIcon name="info" :size="12" />
        <span>Aucun joueur importé pour cette équipe.</span>
      </p>

      <div v-else class="cm-table-wrap match-players__wrap">
        <table class="cm-table match-players__table">
          <thead>
            <tr>
              <th>Joueur</th>
              <th class="is-left">Poste</th>
              <th v-for="col in visibleColumns" :key="col.key" :title="col.title ?? col.label">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(p, index) in displayedPlayers" :key="`${activeSide}-${index}-${p.name}`" :class="{ 'match-players__sub': p.starter === false }">
              <td class="match-players__name cm-truncate" :title="p.name">{{ p.name }}</td>
              <td class="is-left cm-text-muted">{{ p.position ?? '—' }}</td>
              <td v-for="col in visibleColumns" :key="col.key" class="cm-numeric">{{ cell(p, col) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="cm-text-muted match-players__note">
        <AppIcon name="info" :size="12" />
        <span><template v-if="hasStarterInfo">Remplaçants en grisé · </template>colonnes sans aucune donnée masquées.</span>
      </p>
    </template>
  </div>
</template>

<style scoped>
.match-players {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.match-players__title {
  margin: 0;
}

/* La barre segmentée : fond discret, l'équipe active en relief couleur de section. */
.match-players__tabs {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 3px;
  align-self: flex-start;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.match-players__tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 13px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.match-players__tab:hover {
  color: var(--cm-text-primary);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
}

.match-players__tab--active {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

.match-players__count {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgb(var(--cm-glass-tint) / 0.08);
  font-size: 10.5px;
  font-weight: 700;
}

.match-players__tab--active .match-players__count {
  background: rgb(var(--cm-glass-tint) / 0.22);
}

/* ----------------------------------------------------------- tableau */
.match-players__table {
  font-size: 12px;
}

.match-players__table th,
.match-players__table td {
  padding: 7px 10px;
}

.match-players__name {
  max-width: 160px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* Les remplaçants en grisé : ils ont moins joué, ils pèsent moins. */
.match-players__sub td {
  opacity: 0.6;
}

.match-players__note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
}

.match-players__note > :first-child {
  flex-shrink: 0;
  margin-top: 2px;
}
</style>
