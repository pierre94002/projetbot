<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { seasonCalendarApi } from '@/services/seasonCalendarApi.js';
import { useDataVersionStore } from '@/stores/dataVersionStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { formatDay } from '@/utils/format.js';

// Calendrier de saison (joués + à venir), alimenté chaque jour par la tâche
// planifiée (recherche web, cf. server/scripts/merge-season-calendar.mjs) —
// distinct de l'onglet "Matchs" (proche du coup d'envoi seulement, via
// l'API de cotes).
const matches = ref([]);
const loading = ref(false);
const error = ref(null);
const leagueQuery = ref('');
const statusFilter = ref('all');

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'scheduled', label: 'À venir' },
  { value: 'finished', label: 'Terminés' }
];

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const result = await seasonCalendarApi.list();
    matches.value = result.matches ?? [];
  } catch (e) {
    error.value = e.message;
    matches.value = [];
  } finally {
    loading.value = false;
  }
}

const filteredMatches = computed(() => {
  const query = leagueQuery.value.trim().toLowerCase();
  return matches.value.filter((m) => {
    if (statusFilter.value !== 'all' && m.status !== statusFilter.value) return false;
    if (!query) return true;
    return (m.league ?? '').toLowerCase().includes(query) || m.homeName.toLowerCase().includes(query) || m.awayName.toLowerCase().includes(query);
  });
});

// Regroupement par jour — le calendrier couvre toute la saison, un simple
// tableau plat serait illisible sur autant de lignes.
const groupedByDay = computed(() => {
  const groups = new Map();
  for (const match of filteredMatches.value) {
    const key = match.date;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(match);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
});

const lastUpdatedAt = computed(() => {
  const dates = matches.value.map((m) => m.updatedAt).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
});

onMounted(load);

// Cette vue garde son calendrier en local (pas dans un store Pinia), donc le
// rafraîchissement automatique global ne peut pas le remettre à jour à sa
// place : on recharge dès que l'empreinte des données côté serveur change.
// C'est la vue la plus concernée, puisqu'elle affiche exactement ce que la
// tâche planifiée réécrit chaque jour.
const dataVersion = useDataVersionStore();
watch(
  () => dataVersion.version,
  (next, previous) => {
    if (previous && next && next !== previous) load();
  }
);
</script>

<template>
  <div class="season-calendar">
    <AppCard padded>
      <div class="season-calendar__controls">
        <AppTextField v-model="leagueQuery" label="Championnat ou équipe" placeholder="Ex. Ligue 1, PSG…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
        <AppSelect v-model="statusFilter" label="Statut" :options="STATUS_OPTIONS" />
        <AppButton variant="secondary" :loading="loading" @click="load">
          <template #icon><AppIcon name="refresh" :size="15" /></template>
          Actualiser
        </AppButton>
      </div>
      <p v-if="lastUpdatedAt" class="season-calendar__hint cm-text-muted">
        Dernière mise à jour de ce calendrier : {{ new Date(lastUpdatedAt).toLocaleString('fr-FR') }} — actualisé automatiquement chaque jour.
      </p>
    </AppCard>

    <LoadingSpinner v-if="loading" label="Chargement du calendrier…" />
    <EmptyState v-else-if="error" icon="alert" title="Calendrier indisponible" :description="error" />
    <EmptyState
      v-else-if="filteredMatches.length === 0"
      icon="matches"
      title="Aucun match trouvé"
      description="Le calendrier se remplit progressivement, jour après jour, via la tâche planifiée. Revenez un peu plus tard s'il vient d'être activé."
    />

    <AppCard v-else :padded="false">
      <div v-for="[day, dayMatches] in groupedByDay" :key="day" class="season-calendar__day">
        <div class="season-calendar__day-header">{{ formatDay(day) }}</div>
        <div v-for="match in dayMatches" :key="match.matchId" class="season-calendar__row">
          <LeagueBadge :league="match.league" class="season-calendar__league" />
          <div class="season-calendar__teams">
            <span class="cm-truncate">{{ match.homeName }}</span>
            <span class="season-calendar__score" :class="{ 'season-calendar__score--pending': match.status !== 'finished' }">
              {{ match.status === 'finished' ? `${match.homeGoals} - ${match.awayGoals}` : 'vs' }}
            </span>
            <span class="cm-truncate">{{ match.awayName }}</span>
          </div>
          <span
            class="season-calendar__status"
            :class="match.status === 'finished' ? 'season-calendar__status--finished' : 'season-calendar__status--scheduled'"
          >
            {{ match.status === 'finished' ? 'Terminé' : 'À venir' }}
          </span>
        </div>
      </div>
    </AppCard>
  </div>
</template>

<style scoped>
.season-calendar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.season-calendar__controls {
  display: grid;
  grid-template-columns: 1.6fr 1fr auto;
  gap: 14px;
  align-items: end;
}

.season-calendar__hint {
  margin: 12px 0 0;
  font-size: 11.5px;
}

.season-calendar__day-header {
  padding: 10px 16px;
  font-size: 11.5px;
  font-weight: 700;
  text-transform: capitalize;
  color: var(--cm-text-muted);
  background: var(--cm-surface-hover);
  border-bottom: 1px solid var(--cm-border-soft);
}

.season-calendar__row {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 16px;
  border-bottom: 1px solid var(--cm-border-soft);
  font-size: 12.5px;
}

.season-calendar__teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 8px;
  align-items: center;
  text-align: center;
}

.season-calendar__teams span:first-child {
  text-align: right;
}

.season-calendar__teams span:last-child {
  text-align: left;
}

.season-calendar__score {
  font-weight: 700;
  color: var(--cm-text-primary);
  white-space: nowrap;
}

.season-calendar__score--pending {
  font-weight: 500;
  color: var(--cm-text-muted);
}

.season-calendar__status {
  justify-self: end;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
}

.season-calendar__status--finished {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.season-calendar__status--scheduled {
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
}

@media (max-width: 720px) {
  .season-calendar__controls {
    grid-template-columns: 1fr;
  }
  .season-calendar__row {
    grid-template-columns: 1fr;
    justify-items: start;
  }
  .season-calendar__status {
    justify-self: start;
  }
}
</style>
