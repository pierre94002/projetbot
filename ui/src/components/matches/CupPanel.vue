<script setup>
import { computed, ref, watch } from 'vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueLeaders from '@/components/matches/LeagueLeaders.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
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

// Une rencontre du tableau au format de la carte commune (MatchCard.vue,
// 01/10/2026) : jouée, son score et sa page ; à venir, sa date seulement.
const versCarte = (m) => ({
  matchId: m.matchId,
  date: m.date,
  league: selectedCup.value,
  homeName: m.home,
  awayName: m.away,
  homeId: m.homeId ?? null,
  awayId: m.awayId ?? null,
  homeGoals: m.played ? m.homeGoals : null,
  awayGoals: m.played ? m.awayGoals : null,
  status: m.played ? 'finished' : 'scheduled'
});

// Présentation (refonte du 02/10/2026) : ce que dit le bandeau — le libellé
// de la saison regardée tel que le serveur le donne, et ce que le tableau
// contient (tours, rencontres, dont celles encore à jouer).
const saisonLibelle = computed(() => {
  const cup = cups.value.list.find((c) => c.name === selectedCup.value);
  const saison = (cup?.seasons ?? []).find((s) => s.season === selectedSeason.value);
  return saison ? saison.label ?? saison.season : bracket.value?.season ?? null;
});
const resume = computed(() => {
  const rounds = bracket.value?.rounds ?? [];
  const rencontres = rounds.flatMap((r) => r.matches ?? []);
  return { tours: rounds.length, rencontres: rencontres.length, aVenir: rencontres.filter((m) => !m.played).length };
});
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
    <!-- Le bandeau : la coupe et sa saison, ce que son tableau contient, et
         les deux sélecteurs sur une rangée de commandes. -->
    <section class="cm-hero cups__hero">
      <div class="cm-hero__top">
        <h3 class="cm-hero__title cups__title">
          <span class="cm-icon-box"><AppIcon name="trophy" :size="18" /></span>
          <span class="cups__title-text">
            <span class="cm-truncate">{{ selectedCup }}</span>
            <span v-if="saisonLibelle" class="cups__season">Saison {{ saisonLibelle }}</span>
          </span>
        </h3>
        <div v-if="resume.tours" class="cm-hero__chips">
          <span class="cm-chip is-section"><AppIcon name="layers" :size="11" />{{ resume.tours }} tour{{ resume.tours > 1 ? 's' : '' }}</span>
          <span class="cm-chip"><AppIcon name="matches" :size="11" />{{ resume.rencontres }} rencontre{{ resume.rencontres > 1 ? 's' : '' }}</span>
          <span v-if="resume.aVenir" class="cm-chip is-info" title="Rencontres du tableau encore à jouer"><AppIcon name="clock" :size="11" />{{ resume.aVenir }} à venir</span>
        </div>
      </div>
      <div class="cm-toolbar cups__pickers">
        <AppSelect v-model="selectedCup" label="Coupe" :options="cupOptions" />
        <AppSelect v-if="seasonOptions.length" v-model="selectedSeason" label="Saison" :options="seasonOptions" />
      </div>
    </section>

    <TabbedView v-model="tab" :tabs="tabs" class="cups__tabs" />

    <template v-if="tab === 'bracket'">
      <LoadingSpinner v-if="bracket?.loading" label="Récupération du tableau…" />
      <EmptyState v-else-if="bracket?.error" icon="alert" title="Tableau indisponible" :description="bracket.error" />
      <EmptyState v-else-if="!bracket?.rounds?.length" icon="matches" title="Aucune rencontre pour cette saison" />
      <!-- Le tableau : un tour = une colonne (côte à côte quand la place
           existe, l'une sous l'autre dans un panneau étroit). -->
      <div v-else class="bracket">
        <div class="bracket__rounds">
          <section v-for="round in bracket.rounds" :key="round.round" class="bracket__round">
            <h4 class="cm-group-title bracket__title">
              <span class="bracket__round-name">{{ round.round }}</span>
              <span class="bracket__count cm-numeric" :title="`${round.count} rencontre(s) dans ce tour`">{{ round.count }}</span>
            </h4>
            <div class="bracket__cards cm-stagger">
              <MatchCard
                v-for="match in round.matches"
                :key="match.matchId"
                :match="versCarte(match)"
                :to="match.played ? `/match/${match.matchId}` : null"
                :show-competition="false"
                :class="{ 'bracket__upcoming': !match.played }"
              />
            </div>
          </section>
        </div>
      </div>
    </template>

    <LeagueLeaders
      v-else
      :league="selectedCup"
      :kind="tab"
      :rows="leaders?.[tab] ?? []"
      :loading="leaders?.loading ?? false"
      :error="leaders?.error ?? null"
    />
  </div>
</template>

<style scoped>
.cups {
  /* Se règle sur SA largeur : fenêtre du classement (≈ 480 px) ou page. */
  container: cups / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ------------------------------------------------------------ bandeau */
.cups__hero {
  padding: 16px 18px;
  gap: 14px;
}

.cups__title {
  min-width: 0;
  font-size: 17px;
}

.cups__title-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cups__season {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-section);
}

.cups__pickers > * {
  flex: 1 1 180px;
}

/* ------------------------------------------------------------ tableau */
.bracket__rounds {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.bracket__round {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.bracket__title {
  color: var(--cm-text-secondary);
}

.bracket__round-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bracket__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 22px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--cm-section-soft);
  color: var(--cm-section);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0;
}

.bracket__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Une rencontre à venir garde sa place dans le tour : c'est ce qui fait du
   tableau un calendrier. Elle est simplement en retrait. */
.bracket__upcoming {
  border-style: dashed;
  background: transparent;
}

/* Étroit (fenêtre du classement) : le tableau défile dans son cadre pour
   que les onglets et les sélecteurs restent sous la main. */
@container cups (max-width: 719px) {
  .bracket {
    max-height: 55vh;
    overflow-y: auto;
    padding-right: 2px;
  }
}

/* Large (page) : les tours côte à côte, du premier au dernier, à faire
   défiler à l'horizontale comme un vrai tableau de coupe. */
@container cups (min-width: 720px) {
  .bracket__rounds {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(300px, 1fr);
    align-items: start;
    gap: 16px;
    padding-bottom: 6px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
  }

  .bracket__round {
    scroll-snap-align: start;
  }
}
</style>
