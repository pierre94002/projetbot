<script setup>
import { computed, reactive, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { usePredictionsStore } from '@/stores/predictionsStore.js';
import { useBetsStore } from '@/stores/betsStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import BetsPerformanceView from '@/views/BetsPerformanceView.vue';
import BetsTicketsView from '@/views/BetsTicketsView.vue';
import { formatDay, formatPercent } from '@/utils/format.js';
import { marketBreakdownLabel } from '@/utils/betTrends.js';
import { matchResultsApi } from '@/services/matchResultsApi.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import { usePredictionSettlement } from '@/composables/usePredictionSettlement.js';

const route = useRoute();
const predictionsStore = usePredictionsStore();
const betsStore = useBetsStore();
const matchesStore = useMatchesStore();
// Favoris (03/10/2026) : leurs championnats et leurs matchs d'abord.
const favoris = useFavoritesStore();
const teamStatsModalStore = useTeamStatsModalStore();
const matchAiAnalysisStore = useMatchAiAnalysisStore();
const { settling, settleMatch } = usePredictionSettlement();

// "Performance paris" et "Mes tickets" sont des modules autonomes (store/état
// propres) — intégrés ici comme de simples onglets plutôt que des pages
// séparées, même principe que Statistiques ligue dans Matchs : l'onglet
// prioritaire (moteur) reste le défaut, les autres s'ouvrent au clic.
const TABS = [
  { value: 'moteur', label: 'Historique moteur' },
  { value: 'performance', label: 'Performance paris' },
  { value: 'tickets', label: 'Mes tickets' }
];
const activeTab = ref(TABS.some((t) => t.value === route.query.onglet) ? route.query.onglet : 'moteur');

// Le pronostic du moteur pour CHAQUE match scanné (pas seulement les value
// bets), journalisé depuis la page Mes paris — sert à mesurer le taux de
// réussite général du moteur. "Correct" = l'issue pronostiquée (cote la
// plus basse) a bien eu lieu.
const predictionDailySummaries = computed(() => {
  const byDay = new Map();
  for (const entry of predictionsStore.entries) {
    if (!byDay.has(entry.day)) byDay.set(entry.day, { day: entry.day, total: 0, correct: 0, incorrect: 0, pending: 0, void: 0 });
    const d = byDay.get(entry.day);
    d.total++;
    d[entry.status]++;
  }
  return [...byDay.values()]
    .map((entry) => {
      const settled = entry.correct + entry.incorrect;
      return {
        ...entry,
        settled,
        hitRate: settled > 0 ? (entry.correct / settled) * 100 : null,
        failRate: settled > 0 ? (entry.incorrect / settled) * 100 : null
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day));
});

const predictionSummary = computed(() => {
  if (predictionsStore.entries.length === 0) return null;
  const activeDays = predictionDailySummaries.value.length;
  const settled = predictionsStore.entries.filter((e) => e.status === 'correct' || e.status === 'incorrect');
  if (settled.length === 0) {
    return `${predictionsStore.entries.length} match(s) scanné(s) sur ${activeDays} jour(s), aucun résultat réglé pour l'instant.`;
  }
  const correctCount = predictionsStore.entries.filter((e) => e.status === 'correct').length;
  const hitRate = (correctCount / settled.length) * 100;
  return `Sur ${activeDays} jour(s) : ${correctCount} pronostic(s) correct(s) / ${settled.length} réglé(s) — taux de réussite du moteur ${hitRate.toFixed(0)}% (échec ${(100 - hitRate).toFixed(0)}%).`;
});

// Un taux de réussite élevé peut être trompeur si les cotes prises sont trop
// basses (cf. Cas 1 : 80% de réussite mais perte nette sur des cotes à 1.1) —
// le Yield, calculé sur une mise fixe simulée avec la cote réelle du modèle
// (predictedOdds, déjà journalisée par prédiction), mesure la rentabilité
// réelle plutôt que la seule fréquence de succès. Aucune mise réelle n'est
// engagée ici — seulement Historique moteur, purement indicatif ; les vraies
// mises/retours du carnet sont dans Performance paris.
const SIMULATED_STAKE = 10;

// Taux de réussite ET Yield simulé PAR MARCHÉ (toutes journées confondues) —
// permet de voir par exemple que "Total buts" (Plus de 2.5 buts) a son propre
// taux/yield, distinct du taux global qui mélange tous les marchés.
const marketBreakdown = computed(() => {
  const byMarket = new Map();
  for (const entry of predictionsStore.entries) {
    // Regroupe équipe par équipe sous une catégorie globale, ET distingue la
    // ligne de buts (0.5/1.5/2.5/3.5) déjà présente dans le libellé — un
    // "Plus de 0.5" et un "Plus de 2.5" n'ont pas du tout la même
    // probabilité, les mélanger fausserait le taux de réussite.
    const label = marketBreakdownLabel(entry.market, entry.predictedLabel);
    if (!byMarket.has(label)) byMarket.set(label, { market: label, total: 0, correct: 0, incorrect: 0, pending: 0, void: 0, staked: 0, returned: 0 });
    const m = byMarket.get(label);
    m.total++;
    m[entry.status]++;
    if (entry.status === 'correct' || entry.status === 'incorrect') {
      m.staked += SIMULATED_STAKE;
      m.returned += entry.status === 'correct' ? SIMULATED_STAKE * entry.predictedOdds : 0;
    }
  }
  return [...byMarket.values()]
    .map((m) => {
      const settled = m.correct + m.incorrect;
      return {
        ...m,
        settled,
        hitRate: settled > 0 ? (m.correct / settled) * 100 : null,
        failRate: settled > 0 ? (m.incorrect / settled) * 100 : null,
        yieldPercent: m.staked > 0 ? ((m.returned - m.staked) / m.staked) * 100 : null
      };
    })
    .sort((a, b) => b.total - a.total);
});

// Ligne de synthèse tout en bas du tableau par marché : Σ des comptages
// (total/corrects/incorrects/en attente/mises/retours simulés) et un taux ET
// un yield RECALCULÉS sur ces sommes — jamais une moyenne par marché, qui
// pondérerait un marché à 2 prédictions autant qu'un marché à 50.
const marketBreakdownTotal = computed(() => {
  const total = marketBreakdown.value.reduce(
    (acc, m) => ({
      total: acc.total + m.total,
      correct: acc.correct + m.correct,
      incorrect: acc.incorrect + m.incorrect,
      pending: acc.pending + m.pending,
      staked: acc.staked + m.staked,
      returned: acc.returned + m.returned
    }),
    { total: 0, correct: 0, incorrect: 0, pending: 0, staked: 0, returned: 0 }
  );
  const settled = total.correct + total.incorrect;
  return {
    ...total,
    hitRate: settled > 0 ? (total.correct / settled) * 100 : null,
    failRate: settled > 0 ? (total.incorrect / settled) * 100 : null,
    yieldPercent: total.staked > 0 ? ((total.returned - total.staked) / total.staked) * 100 : null
  };
});

// Chiffres du bandeau (présentation seule, refonte du 01/10/2026) : les mêmes
// nombres que la phrase de synthèse, lisibles d'un coup d'œil — le taux de
// réussite en anneau, puis corrects / incorrects / en attente en tuiles.
const chiffresMoteur = computed(() => {
  const entrees = predictionsStore.entries;
  const compte = (statut) => entrees.filter((e) => e.status === statut).length;
  const corrects = compte('correct');
  const incorrects = compte('incorrect');
  const regles = corrects + incorrects;
  return {
    total: entrees.length,
    jours: predictionDailySummaries.value.length,
    corrects,
    incorrects,
    enAttente: compte('pending'),
    regles,
    taux: regles > 0 ? Math.round((corrects / regles) * 100) : null
  };
});

// Regroupement par match — sert à saisir le score final UNE SEULE FOIS par
// match plutôt que de cliquer Correct/Incorrect sur chaque marché un par un.
const entryGroups = computed(() => {
  const map = new Map();
  for (const entry of predictionsStore.entries) {
    if (!map.has(entry.matchId)) {
      map.set(entry.matchId, { matchId: entry.matchId, homeName: entry.homeName, awayName: entry.awayName, league: entry.league, day: entry.day, entries: [] });
    }
    map.get(entry.matchId).entries.push(entry);
  }
  return [...map.values()];
});

// Un match dont TOUS les marchés sont réglés (plus aucun "pending") n'a plus
// besoin d'action de l'utilisateur — il sort de la liste par défaut, comme
// le carnet de paris (pas d'affichage continu de ce qui est déjà traité),
// mais reste trouvable via la recherche plutôt que supprimé.
const predictionsSearchQuery = ref('');
const visibleEntryGroups = computed(() => {
  const query = predictionsSearchQuery.value.trim().toLowerCase();
  if (!query) return entryGroups.value.filter((group) => group.entries.some((e) => e.status === 'pending'));
  return entryGroups.value.filter(
    (group) =>
      group.homeName.toLowerCase().includes(query) ||
      group.awayName.toLowerCase().includes(query) ||
      (group.league ?? '').toLowerCase().includes(query) ||
      group.entries.some((e) => e.market.toLowerCase().includes(query) || e.predictedLabel.toLowerCase().includes(query))
  );
});

// Regroupé par championnat — même principe que Matchs et Mes paris, sinon
// les dizaines de matchs en attente de réglage s'affichent tous d'un coup.
const groupedByLeague = computed(() => {
  const byLeague = new Map();
  for (const group of visibleEntryGroups.value) {
    const leagueKey = group.league || 'Autres rencontres';
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, []);
    byLeague.get(leagueKey).push(group);
  }
  const championnats = [...byLeague.entries()].map(([league, groups]) => ({
    league,
    groups: favoris.favoritesFirst(groups, { teams: (g) => [[g.homeName, g.league], [g.awayName, g.league]] })
  }));
  return favoris.favoritesFirst(championnats, {
    league: (c) => c.league,
    teams: (c) => c.groups.flatMap((g) => [[g.homeName, g.league], [g.awayName, g.league]])
  });
});

// Ouverts par défaut (contrairement à Matchs/Mes paris) : le nombre de
// championnats en attente ici reste petit, et le point de cette page est
// justement de retrouver un match précis (via "Voir le détail") sans clic
// de découverte supplémentaire.
const collapsedLeagues = ref(new Set());

function toggleLeague(league) {
  const next = new Set(collapsedLeagues.value);
  if (next.has(league)) next.delete(league);
  else next.add(league);
  collapsedLeagues.value = next;
}

// Une recherche active doit révéler ses résultats même dans un championnat
// replié manuellement — sinon la recherche semblerait ne rien trouver.
function isLeagueOpen(league) {
  return Boolean(predictionsSearchQuery.value.trim()) || !collapsedLeagues.value.has(league);
}

const scores = reactive({}); // matchId -> { home, away }

function getScore(matchId) {
  if (!scores[matchId]) scores[matchId] = { home: null, away: null };
  return scores[matchId];
}

function onScoreInput(matchId, side, event) {
  const raw = event.target.value;
  getScore(matchId)[side] = raw === '' ? null : Number(raw);
}

// Compte par statut pour le résumé compact de chaque match (le détail
// marché-par-marché vit désormais sur sa propre page, cf. "Voir le détail").
function countByStatus(group, status) {
  return group.entries.filter((e) => e.status === status).length;
}

// Les pronostics n'ont pas leur propre horodatage de coup d'envoi (seulement
// un jour "day") — on le retrouve via matchesStore, déjà chargé pour la
// résolution de compo ci-dessous. Absent (match hors de la fenêtre de l'Odds
// API, ex. très ancien) : pas de badge plutôt qu'un statut deviné.
function matchKickoff(matchId) {
  return matchesStore.matches.find((m) => m.matchId === matchId)?.commenceTime ?? null;
}

// Résultats enregistrés (match-results.json), à part des champs de saisie :
// la carte montre le score connu, pas celui qu'on est en train de taper.
const resultatsConnus = reactive({});

// Le match d'un groupe au format de la carte de rencontre commune (MatchCard.vue, 01/10/2026).
function versCarte(group) {
  const r = resultatsConnus[group.matchId];
  return {
    matchId: group.matchId,
    date: group.day,
    commenceTime: matchKickoff(group.matchId),
    league: group.league,
    homeName: group.homeName,
    awayName: group.awayName,
    homeGoals: r?.home ?? null,
    awayGoals: r?.away ?? null,
    status: r ? 'finished' : 'scheduled'
  };
}

onMounted(() => {
  predictionsStore.fetchPredictions();
  betsStore.fetchBets();
  matchAiAnalysisStore.fetchAll();
  // Nécessaire pour que le clic sur une équipe puisse résoudre la compo en
  // direct (teamStatsModalStore croise le matchId avec matchesStore) — sans
  // ça, arriver ici directement (sans passer par Matchs/Mes paris avant)
  // laisserait matchesStore vide et la compo semblerait à tort indisponible.
  if (matchesStore.matches.length === 0) matchesStore.fetchMatches();
  // `scores` ne contenait jusqu'ici que ce que l'utilisateur tape dans la
  // session en cours — un match déjà réglé retrouvé via la recherche
  // affichait donc des champs "Score final" vides au lieu du vrai résultat
  // enregistré. Pré-rempli ici une seule fois depuis match-results.json.
  matchResultsApi
    .list()
    .then(({ results }) => {
      for (const result of results) {
        scores[result.matchId] = { home: result.homeGoals, away: result.awayGoals };
        resultatsConnus[result.matchId] = { home: result.homeGoals, away: result.awayGoals };
      }
    })
    .catch(() => {});
});
</script>

<template>
  <div class="hist cm-page">
    <TabbedView v-model="activeTab" :tabs="TABS" query-param="onglet" />

    <Transition name="view" mode="out-in">
      <BetsPerformanceView v-if="activeTab === 'performance'" key="performance" />
      <BetsTicketsView v-else-if="activeTab === 'tickets'" key="tickets" />

      <div v-else key="moteur" class="hist__tab cm-page">
        <!-- 1. LE BANDEAU : ce que vaut le moteur, d'un coup d'œil -->
        <section class="cm-hero">
          <div class="cm-hero__top">
            <h2 class="cm-hero__title">
              <span class="cm-icon-box"><AppIcon name="cpu" :size="18" /></span>
              Historique — Pronostics du moteur
            </h2>
            <div class="hist-hero__side">
              <span class="cm-hero__chips">
                <span class="cm-chip is-section"><AppIcon name="target" :size="11" />{{ chiffresMoteur.total }} pronostic{{ chiffresMoteur.total > 1 ? 's' : '' }}</span>
                <span class="cm-chip"><AppIcon name="calendar" :size="11" />{{ chiffresMoteur.jours }} jour{{ chiffresMoteur.jours > 1 ? 's' : '' }} actif{{ chiffresMoteur.jours > 1 ? 's' : '' }}</span>
              </span>
              <AppButton variant="secondary" size="sm" :loading="predictionsStore.loading" @click="predictionsStore.fetchPredictions">
                <template #icon><AppIcon name="refresh" :size="14" /></template>
                Actualiser
              </AppButton>
            </div>
          </div>
          <p class="cm-hero__subtitle">Résultat, total buts, les 2 équipes marquent, buts par équipe — moyenne générale sur tous les matchs scannés.</p>

          <div class="hist-hero__body">
            <!-- L'anneau : la part de pronostics corrects parmi les réglés. -->
            <div
              class="hist-ring"
              :class="{ 'is-empty': chiffresMoteur.taux === null }"
              :style="{ '--p': chiffresMoteur.taux ?? 0 }"
              title="Taux de réussite du moteur sur les pronostics réglés"
            >
              <span class="hist-ring__value">{{ chiffresMoteur.taux === null ? '—' : `${chiffresMoteur.taux}%` }}</span>
              <span class="hist-ring__label">réussite</span>
            </div>
            <div class="hist-hero__text">
              <p v-if="predictionSummary" class="hist-hero__summary">{{ predictionSummary }}</p>
              <p v-else class="hist-hero__summary is-muted">
                Aucun match scanné pour l'instant — lance un scan depuis <RouterLink to="/paris" class="cm-link">Mes paris</RouterLink>.
              </p>
              <p class="hist-hero__note">
                « Correct » : l'issue pronostiquée (la cote la plus basse du moteur) a bien eu lieu. Le yield est simulé sur une mise fixe de 10 € à la cote du
                moteur — aucune mise réelle n'est engagée ici, les vraies mises et retours sont dans Performance paris.
              </p>
            </div>
          </div>

          <div class="cm-kpis">
            <div class="cm-kpi is-section">
              <span class="cm-kpi__label">Pronostics corrects</span>
              <span class="cm-kpi__value">{{ chiffresMoteur.corrects }}</span>
              <span class="cm-kpi__detail">sur {{ chiffresMoteur.regles }} réglé{{ chiffresMoteur.regles > 1 ? 's' : '' }}</span>
            </div>
            <div class="cm-kpi">
              <span class="cm-kpi__label">Incorrects</span>
              <span class="cm-kpi__value cm-negative">{{ chiffresMoteur.incorrects }}</span>
              <span class="cm-kpi__detail">issue pronostiquée non réalisée</span>
            </div>
            <div class="cm-kpi">
              <span class="cm-kpi__label">En attente</span>
              <span class="cm-kpi__value">{{ chiffresMoteur.enAttente }}</span>
              <span class="cm-kpi__detail">score final à saisir ci-dessous</span>
            </div>
            <div class="cm-kpi">
              <span class="cm-kpi__label">Yield simulé</span>
              <span class="cm-kpi__value" :class="(marketBreakdownTotal.yieldPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ marketBreakdownTotal.yieldPercent === null ? '—' : formatPercent(marketBreakdownTotal.yieldPercent, { showSign: true }) }}
              </span>
              <span class="cm-kpi__detail">mise fixe de 10 €, tous marchés</span>
            </div>
          </div>
        </section>

        <!-- 2. LE TABLEAU PAR MARCHÉ -->
        <AppCard
          icon="barChart"
          title="Taux de réussite par marché"
          subtitle="Toutes journées confondues — la ligne de buts (0.5 / 1.5 / 2.5…) compte comme un marché à part, un « Plus de 0.5 » et un « Plus de 2.5 » n'ayant pas la même probabilité."
        >
          <div class="cm-table-wrap">
            <table class="cm-table">
              <thead>
                <tr>
                  <th>Marché</th>
                  <th>Prédictions</th>
                  <th>Corrects</th>
                  <th>Incorrects</th>
                  <th>En attente</th>
                  <th>Taux de réussite</th>
                  <th>Taux d'échec</th>
                  <th>Yield <span class="hist-th__hint">(simulé, mise 10€)</span></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!marketBreakdown.length">
                  <td colspan="8" class="hist-table__empty is-center cm-text-muted">Aucune donnée pour l'instant.</td>
                </tr>
                <tr v-for="m in marketBreakdown" :key="m.market">
                  <td class="is-strong hist-table__market">{{ m.market }}</td>
                  <td class="cm-numeric">{{ m.total }}</td>
                  <td class="cm-numeric cm-positive">{{ m.correct || '—' }}</td>
                  <td class="cm-numeric cm-negative">{{ m.incorrect || '—' }}</td>
                  <td class="cm-numeric cm-text-muted">{{ m.pending || '—' }}</td>
                  <td class="cm-numeric">
                    <span class="hist-rate">
                      <span class="cm-bar hist-rate__bar"><span class="cm-bar__fill" :style="{ width: `${m.hitRate ?? 0}%` }" /></span>
                      <span class="cm-positive">{{ m.hitRate === null ? '—' : `${m.hitRate.toFixed(0)}%` }}</span>
                    </span>
                  </td>
                  <td class="cm-numeric cm-negative">{{ m.failRate === null ? '—' : `${m.failRate.toFixed(0)}%` }}</td>
                  <td class="cm-numeric">
                    <span class="cm-pill hist-yield" :class="(m.yieldPercent ?? 0) >= 0 ? 'is-positive' : 'is-negative'">
                      {{ m.yieldPercent === null ? '—' : formatPercent(m.yieldPercent, { showSign: true }) }}
                    </span>
                  </td>
                </tr>
                <tr v-if="marketBreakdown.length" class="is-total">
                  <td class="is-strong hist-table__market">Tous marchés</td>
                  <td class="cm-numeric">{{ marketBreakdownTotal.total }}</td>
                  <td class="cm-numeric cm-positive">{{ marketBreakdownTotal.correct || '—' }}</td>
                  <td class="cm-numeric cm-negative">{{ marketBreakdownTotal.incorrect || '—' }}</td>
                  <td class="cm-numeric cm-text-muted">{{ marketBreakdownTotal.pending || '—' }}</td>
                  <td class="cm-numeric">
                    <span class="hist-rate">
                      <span class="cm-bar hist-rate__bar"><span class="cm-bar__fill" :style="{ width: `${marketBreakdownTotal.hitRate ?? 0}%` }" /></span>
                      <span class="cm-positive">{{ marketBreakdownTotal.hitRate === null ? '—' : `${marketBreakdownTotal.hitRate.toFixed(0)}%` }}</span>
                    </span>
                  </td>
                  <td class="cm-numeric cm-negative">{{ marketBreakdownTotal.failRate === null ? '—' : `${marketBreakdownTotal.failRate.toFixed(0)}%` }}</td>
                  <td class="cm-numeric">
                    <span class="cm-pill hist-yield" :class="(marketBreakdownTotal.yieldPercent ?? 0) >= 0 ? 'is-positive' : 'is-negative'">
                      {{ marketBreakdownTotal.yieldPercent === null ? '—' : formatPercent(marketBreakdownTotal.yieldPercent, { showSign: true }) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </AppCard>

        <!-- 3. LES RENCONTRES : le score à saisir, une fois par match -->
        <AppCard :padded="false" title="">
          <div class="hist-list__head">
            <div class="hist-list__heading">
              <span class="cm-icon-box"><AppIcon name="whistle" :size="17" /></span>
              <div class="hist-list__titles">
                <h3 class="hist-list__title">Rencontres scannées</h3>
                <p class="hist-list__subtitle">
                  Saisis le score final une seule fois par match : tous ses pronostics sont réglés d'un coup. Un match entièrement réglé sort de la liste, mais
                  la recherche le retrouve.
                </p>
              </div>
            </div>
            <div class="hist-list__search">
              <AppTextField v-model="predictionsSearchQuery" placeholder="Rechercher un match réglé (équipe, marché, pick)…">
                <template #icon><AppIcon name="search" :size="15" /></template>
              </AppTextField>
            </div>
          </div>

          <div class="hist-list__body">
            <EmptyState
              v-if="predictionsStore.entries.length === 0"
              icon="target"
              title="Aucun match scanné"
              description="Va sur la page Mes paris et clique sur « Charger les value bets » pour lancer un scan."
            />
            <EmptyState
              v-else-if="visibleEntryGroups.length === 0 && predictionsSearchQuery.trim()"
              icon="search"
              title="Aucun résultat"
              :description="`Aucun match ne correspond à «${predictionsSearchQuery.trim()}».`"
            />
            <EmptyState
              v-else-if="visibleEntryGroups.length === 0"
              icon="target"
              title="Aucun match en attente"
              description="Tous les matchs scannés sont réglés — recherche un match précis ci-dessus pour le retrouver."
            />
            <div v-else class="hist-groups">
              <section v-for="leagueGroup in groupedByLeague" :key="leagueGroup.league" class="hist-league" :class="{ 'is-open': isLeagueOpen(leagueGroup.league) }">
                <div
                  class="hist-league__header"
                  role="button"
                  tabindex="0"
                  @click="toggleLeague(leagueGroup.league)"
                  @keydown.enter="toggleLeague(leagueGroup.league)"
                >
                  <AppIcon name="chevronRight" :size="13" class="hist-league__chevron" :class="{ 'is-open': isLeagueOpen(leagueGroup.league) }" />
                  <LeagueBadge :league="leagueGroup.league" />
                  <span class="cm-pill is-section cm-numeric hist-league__count" title="Rencontres dans ce championnat">{{ leagueGroup.groups.length }}</span>
                </div>

                <template v-if="isLeagueOpen(leagueGroup.league)">
                  <div class="hist-league__matches cm-stagger">
                    <article v-for="group in leagueGroup.groups" :key="group.matchId" class="hist-match">
                      <div class="hist-match__row">
                        <MatchCard
                          :match="versCarte(group)"
                          :to="`/historique-moteur/${group.matchId}`"
                          :show-competition="false"
                          team-links
                          class="hist-match__card"
                        >
                          <template #aside>
                            <span v-if="matchAiAnalysisStore.byMatchId[group.matchId]" class="hist-ai-badge" title="Analyse IA disponible pour ce match">
                              <AppIcon name="bolt" :size="9" />IA
                            </span>
                            <MatchStatusBadge :commence-time="matchKickoff(group.matchId)" />
                          </template>
                        </MatchCard>

                        <div class="hist-score">
                          <span class="hist-score__label">Score final</span>
                          <div class="hist-score__inputs">
                            <input
                              type="number"
                              min="0"
                              class="score-input"
                              :value="getScore(group.matchId).home"
                              placeholder="0"
                              @input="onScoreInput(group.matchId, 'home', $event)"
                            />
                            <span class="hist-score__sep">-</span>
                            <input
                              type="number"
                              min="0"
                              class="score-input"
                              :value="getScore(group.matchId).away"
                              placeholder="0"
                              @input="onScoreInput(group.matchId, 'away', $event)"
                            />
                          </div>
                          <AppButton
                            variant="section"
                            size="sm"
                            :loading="settling[group.matchId]"
                            :disabled="getScore(group.matchId).home === null || getScore(group.matchId).away === null"
                            @click="settleMatch(group, getScore(group.matchId))"
                          >
                            <template #icon><AppIcon name="check" :size="13" /></template>
                            Régler
                          </AppButton>
                        </div>
                      </div>

                      <div class="hist-match__summary">
                        <span class="cm-chip"><AppIcon name="target" :size="11" />{{ group.entries.length }} pronostic(s)</span>
                        <span v-if="countByStatus(group, 'correct')" class="cm-chip is-accent"><AppIcon name="check" :size="11" />{{ countByStatus(group, 'correct') }} correct(s)</span>
                        <span v-if="countByStatus(group, 'incorrect')" class="cm-chip is-danger"><AppIcon name="x" :size="11" />{{ countByStatus(group, 'incorrect') }} incorrect(s)</span>
                        <span v-if="countByStatus(group, 'pending')" class="cm-chip"><AppIcon name="clock" :size="11" />{{ countByStatus(group, 'pending') }} en attente</span>
                        <RouterLink :to="`/historique-moteur/${group.matchId}`" class="cm-link hist-match__detail">
                          Voir le détail <AppIcon name="chevronRight" :size="12" />
                        </RouterLink>
                      </div>
                    </article>
                  </div>
                </template>
              </section>
            </div>
          </div>
        </AppCard>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* La page se règle sur SA largeur : pleine page ou panneau étroit. */
.hist {
  container: hist / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.hist-hero__side {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.hist-hero__body {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 18px;
}

.hist-hero__text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.hist-hero__summary {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

.hist-hero__summary.is-muted {
  font-weight: 500;
  color: var(--cm-text-secondary);
}

.hist-hero__note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--cm-text-muted);
}

/* L'anneau du taux de réussite : un arc en couleur de section sur un disque
   creux (dégradé conique + disque intérieur), le chiffre au centre. */
.hist-ring {
  --p: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: conic-gradient(var(--cm-section) calc(var(--p) * 1%), var(--cm-surface-hover) 0);
  box-shadow: 0 10px 28px rgba(var(--cm-section-rgb) / 0.2);
}

.hist-ring::before {
  content: '';
  position: absolute;
  inset: 7px;
  border-radius: 50%;
  background: var(--cm-surface-alt);
}

.hist-ring__value {
  position: relative;
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--cm-text-primary);
  font-variant-numeric: tabular-nums;
}

.hist-ring.is-empty .hist-ring__value {
  color: var(--cm-text-muted);
}

.hist-ring__label {
  position: relative;
  margin-top: 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------------------ tableau */
.hist-th__hint {
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.hist-table__market {
  text-transform: capitalize;
}

.hist-table__empty {
  padding: 22px 12px;
}

/* La ligne « Tous marchés » : un filet plus marqué et un fond à peine teinté. */
.cm-table tr.is-total td {
  border-top: 1px solid var(--cm-border);
  background: rgba(var(--cm-section-rgb) / 0.05);
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* Le taux de réussite : une barre fine, puis le chiffre. */
.hist-rate {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.hist-rate__bar {
  width: 60px;
}

.hist-rate .cm-bar__fill {
  background: var(--cm-accent);
}

/* Le yield en pastille, verte ou rouge selon le signe. */
.hist-yield {
  min-width: 64px;
  font-size: 12px;
}

.hist-yield.is-positive {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.hist-yield.is-negative {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

/* -------------------------------------------------- liste des rencontres */
.hist-list__head {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.hist-list__heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.hist-list__titles {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.hist-list__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.hist-list__subtitle {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.hist-list__search {
  max-width: 520px;
}

.hist-list__body {
  container: histlist / inline-size;
  padding: 16px 20px 20px;
}

.hist-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.hist-league {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* L'en-tête d'un championnat : repliable, teinté de la section. */
.hist-league__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 14px;
  border-radius: var(--cm-radius);
  border: 1px solid rgba(var(--cm-section-rgb) / 0.14);
  background: rgba(var(--cm-section-rgb) / 0.06);
  cursor: pointer;
  user-select: none;
  transition: background var(--cm-transition), border-color var(--cm-transition);
}

.hist-league__header:hover {
  border-color: rgba(var(--cm-section-rgb) / 0.3);
  background: rgba(var(--cm-section-rgb) / 0.1);
}

.hist-league__chevron {
  flex-shrink: 0;
  color: var(--cm-section);
  transition: transform var(--cm-transition);
}

.hist-league__chevron.is-open {
  transform: rotate(90deg);
}

.hist-league__count {
  min-width: 30px;
  padding: 2px 8px;
  font-size: 11.5px;
}

.hist-league__matches {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-left: 12px;
  border-left: 2px solid rgba(var(--cm-section-rgb) / 0.18);
}

/* Une rencontre : la carte commune, le score à saisir, le bilan de ses pronostics. */
.hist-match {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: var(--cm-radius-lg);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface);
  transition: border-color var(--cm-transition);
}

.hist-match:hover {
  border-color: var(--cm-border);
}

.hist-match__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: stretch;
  gap: 10px;
}

.hist-match__card {
  min-width: 0;
  --mcard-aside: 150px;
}

.hist-ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cm-info-soft);
  color: var(--cm-info);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

/* La saisie du score : un bloc à part, le bouton vert quand les deux cases sont remplies. */
.hist-score {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.hist-score__label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.hist-score__inputs {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.hist-score__sep {
  font-weight: 700;
  color: var(--cm-text-muted);
}

.score-input {
  width: 46px;
  height: 32px;
  padding: 0 4px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface);
  color: var(--cm-text-primary);
  font-size: 14px;
  font-weight: 700;
  text-align: center;
  font-variant-numeric: tabular-nums;
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.score-input:hover {
  border-color: var(--cm-border-strong);
}

.score-input:focus {
  outline: none;
  border-color: var(--cm-section);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.score-input::placeholder {
  color: var(--cm-text-muted);
  font-weight: 500;
}

/* Les flèches du champ restent visibles : on règle souvent au clic. */
.score-input::-webkit-inner-spin-button,
.score-input::-webkit-outer-spin-button {
  opacity: 1;
}

.hist-match__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 4px 2px;
}

.hist-match__detail {
  margin-left: auto;
}

/* ----------------------------------------------------------- étroit */
@container hist (max-width: 640px) {
  .hist-hero__body {
    grid-template-columns: minmax(0, 1fr);
    justify-items: start;
  }

  .hist-hero__side {
    width: 100%;
    justify-content: space-between;
  }
}

@container histlist (max-width: 720px) {
  .hist-match__row {
    grid-template-columns: minmax(0, 1fr);
  }

  .hist-score {
    justify-content: space-between;
  }

  .hist-league__matches {
    padding-left: 8px;
  }
}
</style>
