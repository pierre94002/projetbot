<script setup>
import { computed, ref, watch } from 'vue';
import AppSelect from '@/components/common/AppSelect.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueLeaders from '@/components/matches/LeagueLeaders.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';

/**
 * Les coupes d'un championnat : tableau, calendrier et classements
 * individuels.
 *
 * Le TABLEAU et le CALENDRIER sont la même vue, volontairement. Une coupe
 * se lit par tours, et un tour contient indistinctement des rencontres
 * jouées et des rencontres à venir ; les séparer en deux écrans obligerait
 * à regarder à deux endroits pour suivre un huitième de finale dont la
 * moitié s'est jouée hier. Les rencontres à venir sont simplement marquées.
 */
const props = defineProps({
  league: { type: String, required: true }
});

const cups = ref({ loading: true, error: null, list: [] });
const selectedCup = ref(null);
const selectedSeason = ref(null);
const tab = ref('bracket');
const bracket = ref(null);
const leaders = ref(null);

const cupOptions = computed(() => cups.value.list.map((c) => ({ value: c.name, label: c.name })));
const seasonOptions = computed(() => {
  const cup = cups.value.list.find((c) => c.name === selectedCup.value);
  // Le libellé vient du serveur : « 2025 » pour une coupe d'année civile
  // (Copa do Brasil, US Open Cup), « 2025-26 » pour les autres.
  return (cup?.seasons ?? []).map((s) => ({ value: s.season, label: `${s.label ?? s.season} (${s.matches} matchs)` }));
});

const tabs = computed(() => [
  { value: 'bracket', label: 'Tableau', count: bracket.value?.rounds?.length },
  { value: 'scorers', label: 'Buteurs', count: leaders.value?.scorers?.length },
  { value: 'assists', label: 'Passeurs', count: leaders.value?.assists?.length },
  { value: 'cleanSheets', label: 'Clean sheets', count: leaders.value?.cleanSheets?.length }
]);

async function loadCups() {
  cups.value = { loading: true, error: null, list: [] };
  try {
    const r = await matchStatsApi.getLeagueCups(props.league);
    cups.value = { loading: false, error: null, list: r.cups ?? [] };
    selectedCup.value = r.cups?.[0]?.name ?? null;
  } catch (error) {
    cups.value = { loading: false, error: error.message, list: [] };
  }
}

async function loadCup() {
  if (!selectedCup.value) return;
  bracket.value = { loading: true, error: null, rounds: [] };
  leaders.value = { loading: true, error: null, scorers: [], assists: [], cleanSheets: [] };
  const season = selectedSeason.value ?? undefined;
  try {
    const [b, l] = await Promise.all([
      matchStatsApi.getCupBracket(selectedCup.value, { season }),
      matchStatsApi.getLeagueLeaders(selectedCup.value, { season })
    ]);
    bracket.value = { loading: false, error: null, rounds: b.rounds ?? [], season: b.season };
    leaders.value = { loading: false, error: null, scorers: l.scorers ?? [], assists: l.assists ?? [], cleanSheets: l.cleanSheets ?? [] };
  } catch (error) {
    bracket.value = { loading: false, error: error.message, rounds: [] };
    leaders.value = { loading: false, error: error.message, scorers: [], assists: [], cleanSheets: [] };
  }
}

// La saison retombe sur la plus récente à chaque changement de coupe : une
// saison choisie pour la FA Cup n'a aucune raison d'exister pour la Ligue
// des champions, et la traîner d'une coupe à l'autre ferait un écran vide.
watch(selectedCup, () => {
  selectedSeason.value = seasonOptions.value[0]?.value ?? null;
  loadCup();
});
watch(selectedSeason, loadCup);
watch(() => props.league, loadCups, { immediate: true });

const score = (m) => (m.played ? `${m.homeGoals} – ${m.awayGoals}` : 'à venir');
</script>

<template>
  <LoadingSpinner v-if="cups.loading" label="Recherche des coupes…" />
  <EmptyState v-else-if="cups.error" icon="alert" title="Coupes indisponibles" :description="cups.error" />
  <EmptyState
    v-else-if="cups.list.length === 0"
    icon="matches"
    title="Aucune coupe en magasin"
    description="FotMob ne publie pas de relevés pour les coupes de ce championnat, ou elles n'ont pas encore été importées."
  />

  <div v-else class="cups">
    <div class="cups__pickers">
      <AppSelect v-model="selectedCup" label="Coupe" :options="cupOptions" />
      <AppSelect v-if="seasonOptions.length" v-model="selectedSeason" label="Saison" :options="seasonOptions" />
    </div>

    <TabbedView v-model="tab" :tabs="tabs" class="cups__tabs" />

    <template v-if="tab === 'bracket'">
      <LoadingSpinner v-if="bracket?.loading" label="Récupération du tableau…" />
      <EmptyState v-else-if="bracket?.error" icon="alert" title="Tableau indisponible" :description="bracket.error" />
      <EmptyState v-else-if="!bracket?.rounds?.length" icon="matches" title="Aucune rencontre pour cette saison" />
      <div v-else class="bracket">
        <section v-for="round in bracket.rounds" :key="round.round" class="bracket__round">
          <h4 class="bracket__title">
            {{ round.round }}
            <span class="cm-text-muted cm-numeric">{{ round.count }}</span>
          </h4>
          <div
            v-for="match in round.matches"
            :key="match.matchId"
            class="bracket__match"
            :class="{ 'bracket__match--upcoming': !match.played }"
          >
            <span class="bracket__date cm-text-muted cm-numeric">{{ match.date }}</span>
            <span class="bracket__team cm-truncate">{{ match.home }}</span>
            <span class="bracket__score cm-numeric">{{ score(match) }}</span>
            <span class="bracket__team cm-truncate">{{ match.away }}</span>
          </div>
        </section>
      </div>
    </template>

    <LeagueLeaders
      v-else
      :kind="tab"
      :rows="leaders?.[tab] ?? []"
      :loading="leaders?.loading ?? false"
      :error="leaders?.error ?? null"
    />
  </div>
</template>

<style scoped>
.cups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cups__pickers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.bracket {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 55vh;
  overflow-y: auto;
}

.bracket__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cm-text-muted);
}

.bracket__match {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 76px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--cm-surface-1);
}

.bracket__match + .bracket__match {
  margin-top: 2px;
}

.bracket__score {
  text-align: center;
  font-weight: 600;
}

/* Une rencontre a venir garde sa place dans le tour : c'est ce qui fait du
   tableau un calendrier. Elle est simplement en retrait. */
.bracket__match--upcoming {
  background: transparent;
  border: 1px dashed var(--cm-border);
}

.bracket__match--upcoming .bracket__score {
  font-weight: 400;
  font-size: 12px;
  color: var(--cm-text-muted);
}

@media (max-width: 640px) {
  .cups__pickers {
    grid-template-columns: 1fr;
  }

  .bracket__match {
    grid-template-columns: minmax(0, 1fr) 68px minmax(0, 1fr);
  }

  .bracket__date {
    display: none;
  }
}
</style>
