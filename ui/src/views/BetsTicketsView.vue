<script setup>
import { computed, ref, onMounted } from 'vue';
import { useBetsStore } from '@/stores/betsStore.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import BetTicketRow from '@/components/betting/BetTicketRow.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { formatCurrency } from '@/utils/format.js';

const betsStore = useBetsStore();
// Favoris (03/10/2026) : leurs championnats d'abord.
const favoris = useFavoritesStore();

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
  // Les équipes d'un ticket : celles de toutes ses sélections.
  const equipes = (bet) => (bet.legs ?? []).flatMap((leg) => [[leg.homeName, leg.league], [leg.awayName, leg.league]]);
  return favoris.favoritesFirst(
    [...byLeague.entries()].map(([league, bets]) => ({ league, bets: favoris.favoritesFirst(bets, { teams: equipes }) })),
    { league: (g) => g.league, teams: (g) => g.bets.flatMap(equipes) }
  );
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

// Ce que les tickets affichés ont rapporté (présentation seule, refonte du
// 01/10/2026) : misé et retours des gagnés / perdus visibles, pour les puces
// du bandeau — les totaux du carnet entier restent dans Performance paris.
const bilanTickets = computed(() => {
  const retours = wonTickets.value.reduce((somme, bet) => somme + bet.stake * bet.odds, 0);
  const perdu = lostTickets.value.reduce((somme, bet) => somme + bet.stake, 0);
  return { retours, perdu };
});

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
  <div class="tickets cm-page">
    <!-- 1. LE BANDEAU : combien de tickets, gagnés et perdus, et la recherche -->
    <section class="cm-hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="cards" :size="18" /></span>
          Mes tickets
        </h2>
        <span class="cm-hero__chips">
          <span class="cm-chip is-section"><AppIcon name="check" :size="11" />{{ betsStore.settledBets.length }} réglé{{ betsStore.settledBets.length > 1 ? 's' : '' }}</span>
          <span class="cm-chip is-accent"><AppIcon name="trendUp" :size="11" />{{ wonTickets.length }} gagné{{ wonTickets.length > 1 ? 's' : '' }}</span>
          <span class="cm-chip is-danger"><AppIcon name="trendDown" :size="11" />{{ lostTickets.length }} perdu{{ lostTickets.length > 1 ? 's' : '' }}</span>
        </span>
      </div>
      <p class="cm-hero__subtitle">
        Les paris gagnés et perdus, réglés depuis Mes paris, rangés par championnat — un combiné est rangé sous le championnat de sa première sélection.
      </p>
    </section>

    <!-- 2. LA RECHERCHE ET LES DEUX COLONNES -->
    <AppCard :padded="false" title="">
      <div class="tickets-toolbar cm-toolbar">
        <div class="tickets-toolbar__search">
          <AppTextField v-model="searchQuery" placeholder="Rechercher un ticket (équipe, marché, pick)…">
            <template #icon><AppIcon name="search" :size="15" /></template>
          </AppTextField>
        </div>
        <span v-if="searchQuery.trim()" class="cm-chip is-section tickets-toolbar__hint"><AppIcon name="filter" :size="11" />Championnats dépliés pour la recherche</span>
      </div>

      <div class="tickets-body">
        <LoadingSpinner v-if="betsStore.loading" label="Chargement des tickets…" />
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
          <!-- Gagnés -->
          <article class="tickets-col is-won">
            <header class="tickets-col__head">
              <span class="cm-icon-box is-accent is-sm"><AppIcon name="check" :size="14" /></span>
              <h3 class="tickets-col__title">Paris gagnés</h3>
              <span class="cm-pill is-accent cm-numeric tickets-col__count">{{ wonTickets.length }}</span>
              <span class="tickets-col__figure cm-numeric cm-positive" title="Retours des tickets gagnés affichés (mise × cote)">
                +{{ formatCurrency(bilanTickets.retours) }}
              </span>
            </header>
            <p v-if="wonByLeague.length === 0" class="tickets-col__empty cm-text-muted">Aucun ticket gagné pour l'instant.</p>
            <div v-else class="tickets-leagues">
              <div v-for="leagueGroup in wonByLeague" :key="leagueGroup.league" class="tickets-league" :class="{ 'is-open': isWonLeagueOpen(leagueGroup.league) }">
                <div
                  class="tickets-league__header"
                  role="button"
                  tabindex="0"
                  @click="toggleWonLeague(leagueGroup.league)"
                  @keydown.enter="toggleWonLeague(leagueGroup.league)"
                >
                  <AppIcon name="chevronRight" :size="13" class="tickets-league__chevron" :class="{ 'is-open': isWonLeagueOpen(leagueGroup.league) }" />
                  <LeagueBadge :league="leagueGroup.league" />
                  <span class="cm-pill cm-numeric tickets-league__count" title="Tickets dans ce championnat">{{ leagueGroup.bets.length }}</span>
                </div>
                <template v-if="isWonLeagueOpen(leagueGroup.league)">
                  <div class="tickets-league__rows">
                    <BetTicketRow v-for="bet in leagueGroup.bets" :key="bet.id" :bet="bet" />
                  </div>
                </template>
              </div>
            </div>
          </article>

          <!-- Perdus -->
          <article class="tickets-col is-lost">
            <header class="tickets-col__head">
              <span class="cm-icon-box is-danger is-sm"><AppIcon name="x" :size="14" /></span>
              <h3 class="tickets-col__title">Paris perdus</h3>
              <span class="cm-pill tickets-col__count is-lost cm-numeric">{{ lostTickets.length }}</span>
              <span class="tickets-col__figure cm-numeric cm-negative" title="Mises des tickets perdus affichés">
                −{{ formatCurrency(bilanTickets.perdu) }}
              </span>
            </header>
            <p v-if="lostByLeague.length === 0" class="tickets-col__empty cm-text-muted">Aucun ticket perdu pour l'instant.</p>
            <div v-else class="tickets-leagues">
              <div v-for="leagueGroup in lostByLeague" :key="leagueGroup.league" class="tickets-league" :class="{ 'is-open': isLostLeagueOpen(leagueGroup.league) }">
                <div
                  class="tickets-league__header"
                  role="button"
                  tabindex="0"
                  @click="toggleLostLeague(leagueGroup.league)"
                  @keydown.enter="toggleLostLeague(leagueGroup.league)"
                >
                  <AppIcon name="chevronRight" :size="13" class="tickets-league__chevron" :class="{ 'is-open': isLostLeagueOpen(leagueGroup.league) }" />
                  <LeagueBadge :league="leagueGroup.league" />
                  <span class="cm-pill cm-numeric tickets-league__count" title="Tickets dans ce championnat">{{ leagueGroup.bets.length }}</span>
                </div>
                <template v-if="isLostLeagueOpen(leagueGroup.league)">
                  <div class="tickets-league__rows">
                    <BetTicketRow v-for="bet in leagueGroup.bets" :key="bet.id" :bet="bet" />
                  </div>
                </template>
              </div>
            </div>
          </article>
        </div>
      </div>
    </AppCard>
  </div>
</template>

<style scoped>
/* ---------------------------------------------------------- recherche */
.tickets-toolbar {
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.tickets-toolbar__search {
  flex: 1 1 320px;
  max-width: 520px;
}

.tickets-toolbar__hint {
  white-space: normal;
}

/* ------------------------------------------------------------ colonnes */
.tickets-body {
  /* Les colonnes se règlent sur LA largeur de la carte : deux côte à côte
     quand la place existe, l'une sous l'autre dans un panneau étroit. */
  container: tickets / inline-size;
  padding: 16px 18px 18px;
}

.tickets-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  align-items: start;
}

/* Une colonne = une carte avec un liseré de sa couleur : vert gagné, rouge perdu. */
.tickets-col {
  --ton: var(--cm-accent);
  --ton-doux: var(--cm-accent-soft);
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  border-top: 3px solid var(--ton);
  background: var(--cm-surface-alt);
  overflow: hidden;
}

.tickets-col.is-lost {
  --ton: var(--cm-danger);
  --ton-doux: var(--cm-danger-soft);
}

.tickets-col__head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  padding: 12px 14px;
  background: linear-gradient(180deg, rgba(var(--cm-section-rgb) / 0.03), transparent), var(--cm-surface-alt);
  border-bottom: 1px solid var(--cm-border-soft);
}

.tickets-col__title {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--ton);
}

.tickets-col__count {
  min-width: 32px;
  padding: 2px 8px;
  font-size: 12px;
}

.tickets-col__count.is-lost {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.tickets-col__figure {
  margin-left: auto;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}

.tickets-col__empty {
  margin: 0;
  padding: 18px 14px;
  font-size: 12.5px;
}

.tickets-leagues {
  display: flex;
  flex-direction: column;
}

.tickets-league {
  border-bottom: 1px solid var(--cm-border-soft);
}

.tickets-league:last-child {
  border-bottom: 0;
}

/* L'en-tête d'un championnat, repliable : la compétition avec son drapeau et le nombre de tickets. */
.tickets-league__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  background: var(--cm-surface);
  cursor: pointer;
  user-select: none;
  transition: background var(--cm-transition);
}

.tickets-league__header:hover {
  background: var(--cm-surface-hover);
}

.tickets-league.is-open .tickets-league__header {
  background: var(--cm-surface-hover);
}

.tickets-league__chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transition: transform var(--cm-transition), color var(--cm-transition);
}

.tickets-league__chevron.is-open {
  color: var(--cm-section);
  transform: rotate(90deg);
}

.tickets-league__count {
  min-width: 30px;
  padding: 2px 8px;
  font-size: 11.5px;
}

.tickets-league__rows {
  display: flex;
  flex-direction: column;
}

/* ----------------------------------------------------------- étroit */
@container tickets (max-width: 860px) {
  .tickets-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

@container tickets (max-width: 480px) {
  .tickets-body {
    padding: 12px;
  }
}
</style>
