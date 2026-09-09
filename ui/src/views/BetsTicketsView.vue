<script setup>
import { computed, ref, onMounted } from 'vue';
import { useBetsStore } from '@/stores/betsStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import BetTicketRow from '@/components/betting/BetTicketRow.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';

const betsStore = useBetsStore();

const searchQuery = ref('');

// Revoir les tickets déjà tranchés (gagné/perdu) — un pari en attente ou
// annulé n'a pas sa place ici, c'est le rôle du carnet actif dans Mes paris.
const filteredSettledBets = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const settled = betsStore.settledBets;
  const matches = !query
    ? settled
    : settled.filter((bet) =>
        bet.legs.some(
          (leg) =>
            leg.homeName.toLowerCase().includes(query) ||
            leg.awayName.toLowerCase().includes(query) ||
            leg.market.toLowerCase().includes(query) ||
            leg.pick.toLowerCase().includes(query)
        )
      );
  return [...matches].sort((a, b) => new Date(b.settledAt) - new Date(a.settledAt));
});

const wonTickets = computed(() => filteredSettledBets.value.filter((bet) => bet.status === 'won'));
const lostTickets = computed(() => filteredSettledBets.value.filter((bet) => bet.status === 'lost'));

// Un combiné n'a pas de championnat unique — rangé sous celui de sa première
// sélection, comme les autres listes groupées par ligue de l'app.
function groupByLeague(tickets) {
  const byLeague = new Map();
  for (const bet of tickets) {
    const leagueKey = bet.legs[0]?.league || 'Autres rencontres';
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, []);
    byLeague.get(leagueKey).push(bet);
  }
  return [...byLeague.entries()].map(([league, bets]) => ({ league, bets }));
}

const wonByLeague = computed(() => groupByLeague(wonTickets.value));
const lostByLeague = computed(() => groupByLeague(lostTickets.value));

// Colonnes indépendantes : ouvrir "La Liga" côté gagnés ne doit pas l'ouvrir
// côté perdus. Deux paires dédiées plutôt qu'une seule paramétrée par la ref
// — Vue déballe automatiquement une ref référencée dans le template, donc la
// passer en argument depuis le template la ferait arriver dépouillée de son
// `.value` à l'intérieur de la fonction.
const expandedWonLeagues = ref(new Set());
const expandedLostLeagues = ref(new Set());

function toggleWonLeague(league) {
  const next = new Set(expandedWonLeagues.value);
  if (next.has(league)) next.delete(league);
  else next.add(league);
  expandedWonLeagues.value = next;
}

function isWonLeagueOpen(league) {
  return Boolean(searchQuery.value.trim()) || expandedWonLeagues.value.has(league);
}

function toggleLostLeague(league) {
  const next = new Set(expandedLostLeagues.value);
  if (next.has(league)) next.delete(league);
  else next.add(league);
  expandedLostLeagues.value = next;
}

function isLostLeagueOpen(league) {
  return Boolean(searchQuery.value.trim()) || expandedLostLeagues.value.has(league);
}

// Toujours réactualisé à l'ouverture (pas seulement si vide) : un match réglé
// depuis un autre onglet/une autre fenêtre pendant que celui-ci était ouvert
// ailleurs ne remonterait sinon jamais tant que le store Pinia (en mémoire,
// partagé entre les 3 onglets de ce module mais pas entre onglets navigateur)
// n'est pas vidé.
onMounted(() => {
  betsStore.fetchBets();
});
</script>

<template>
  <div class="bets-tickets-view">
    <AppCard :padded="false" title="">
      <div class="tickets-search">
        <AppTextField v-model="searchQuery" placeholder="Rechercher un ticket (équipe, marché, pick)…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
      </div>

      <LoadingSpinner v-if="betsStore.loading" />
      <EmptyState v-else-if="betsStore.error" icon="alert" title="Impossible de charger les tickets" :description="betsStore.error" />
      <EmptyState
        v-else-if="betsStore.settledBets.length === 0"
        icon="target"
        title="Aucun ticket réglé"
        description="Les paris gagnés et perdus apparaîtront ici une fois réglés dans Mes paris."
      />
      <EmptyState
        v-else-if="filteredSettledBets.length === 0"
        icon="search"
        title="Aucun résultat"
        :description="`Aucun ticket ne correspond à «${searchQuery.trim()}».`"
      />

      <div v-else class="tickets-columns">
        <div class="tickets-column">
          <h3 class="tickets-column__heading tickets-column__heading--won">
            Paris gagnés <span class="cm-numeric">{{ wonTickets.length }}</span>
          </h3>
          <div v-if="wonByLeague.length === 0" class="cm-text-muted tickets-column__empty">Aucun ticket gagné pour l'instant.</div>
          <div v-else class="league-list">
            <div v-for="leagueGroup in wonByLeague" :key="leagueGroup.league" class="league-group">
              <div
                class="league-group__header"
                role="button"
                tabindex="0"
                @click="toggleWonLeague(leagueGroup.league)"
                @keydown.enter="toggleWonLeague(leagueGroup.league)"
              >
                <LeagueBadge :league="leagueGroup.league" />
                <span class="cm-text-muted cm-numeric league-group__count">{{ leagueGroup.bets.length }}</span>
                <AppIcon
                  name="chevronRight"
                  :size="12"
                  class="league-group__chevron"
                  :class="{ 'league-group__chevron--open': isWonLeagueOpen(leagueGroup.league) }"
                />
              </div>
              <template v-if="isWonLeagueOpen(leagueGroup.league)">
                <BetTicketRow v-for="bet in leagueGroup.bets" :key="bet.id" :bet="bet" />
              </template>
            </div>
          </div>
        </div>

        <div class="tickets-column">
          <h3 class="tickets-column__heading tickets-column__heading--lost">
            Paris perdus <span class="cm-numeric">{{ lostTickets.length }}</span>
          </h3>
          <div v-if="lostByLeague.length === 0" class="cm-text-muted tickets-column__empty">Aucun ticket perdu pour l'instant.</div>
          <div v-else class="league-list">
            <div v-for="leagueGroup in lostByLeague" :key="leagueGroup.league" class="league-group">
              <div
                class="league-group__header"
                role="button"
                tabindex="0"
                @click="toggleLostLeague(leagueGroup.league)"
                @keydown.enter="toggleLostLeague(leagueGroup.league)"
              >
                <LeagueBadge :league="leagueGroup.league" />
                <span class="cm-text-muted cm-numeric league-group__count">{{ leagueGroup.bets.length }}</span>
                <AppIcon
                  name="chevronRight"
                  :size="12"
                  class="league-group__chevron"
                  :class="{ 'league-group__chevron--open': isLostLeagueOpen(leagueGroup.league) }"
                />
              </div>
              <template v-if="isLostLeagueOpen(leagueGroup.league)">
                <BetTicketRow v-for="bet in leagueGroup.bets" :key="bet.id" :bet="bet" />
              </template>
            </div>
          </div>
        </div>
      </div>
    </AppCard>
  </div>
</template>

<style scoped>
.bets-tickets-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tickets-search {
  padding: 14px 16px 0;
}

.tickets-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}

.tickets-column {
  min-width: 0;
}

.tickets-column:first-child {
  border-right: 1px solid var(--cm-border-soft);
}

.tickets-column__heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 700;
  padding: 12px 16px;
  margin: 0;
}

.tickets-column__heading--won .cm-numeric {
  color: var(--cm-accent);
}

.tickets-column__heading--lost .cm-numeric {
  color: var(--cm-danger);
}

.tickets-column__empty {
  font-size: 12px;
  padding: 0 16px 14px;
}

.league-list {
  display: flex;
  flex-direction: column;
}

.league-group {
  border-top: 1px solid var(--cm-border-soft);
}

.league-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 16px;
  background: var(--cm-surface-alt);
  border: none;
  cursor: pointer;
  text-align: left;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.league-group__count {
  font-size: 10.5px;
  text-transform: none;
  letter-spacing: normal;
}

.league-group__chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.league-group__chevron--open {
  transform: rotate(-90deg);
}

@media (max-width: 900px) {
  .tickets-columns {
    grid-template-columns: 1fr;
  }

  .tickets-column:first-child {
    border-right: none;
    border-bottom: 1px solid var(--cm-border-soft);
  }
}
</style>
