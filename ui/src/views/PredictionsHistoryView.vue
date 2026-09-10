<script setup>
import { computed, reactive, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { usePredictionsStore } from '@/stores/predictionsStore.js';
import { useBetsStore } from '@/stores/betsStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import BetsPerformanceView from '@/views/BetsPerformanceView.vue';
import BetsTicketsView from '@/views/BetsTicketsView.vue';
import { formatOdds, formatDay, formatPercent } from '@/utils/format.js';
import { marketBreakdownLabel, extractGoalLine, namesMatch } from '@/utils/betTrends.js';
import { matchResultsApi } from '@/services/matchResultsApi.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';

const route = useRoute();
const predictionsStore = usePredictionsStore();
const betsStore = useBetsStore();
const matchesStore = useMatchesStore();
const toastStore = useToastStore();
const teamStatsModalStore = useTeamStatsModalStore();

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

const PREDICTION_STATUS_LABELS = { pending: 'En attente', correct: 'Correct', incorrect: 'Incorrect', void: 'Annulé' };

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
  return [...byLeague.entries()].map(([league, groups]) => ({ league, groups }));
});

// Vide par défaut : tous les championnats démarrent fermés, comme dans
// Matchs et Mes paris.
const expandedLeagues = ref(new Set());

function toggleLeague(league) {
  const next = new Set(expandedLeagues.value);
  if (next.has(league)) next.delete(league);
  else next.add(league);
  expandedLeagues.value = next;
}

// Une recherche active doit révéler ses résultats même dans un championnat
// resté fermé — sinon la recherche semblerait ne rien trouver.
function isLeagueOpen(league) {
  return Boolean(predictionsSearchQuery.value.trim()) || expandedLeagues.value.has(league);
}

const scores = reactive({}); // matchId -> { home, away }
const settling = reactive({}); // matchId -> bool

function getScore(matchId) {
  if (!scores[matchId]) scores[matchId] = { home: null, away: null };
  return scores[matchId];
}

function onScoreInput(matchId, side, event) {
  const raw = event.target.value;
  getScore(matchId)[side] = raw === '' ? null : Number(raw);
}

// Le score final détermine mécaniquement l'issue de CHAQUE marché déjà
// pronostiqué pour ce match (résultat, total buts, BTTS, buts par équipe,
// résultat + total buts) — pas besoin d'une source de résultats en direct :
// une seule saisie suffit à régler tous les marchés du match d'un coup, au
// lieu de cliquer sur chacun. La ligne (0.5/1.5/2.5/3.5) est extraite du
// libellé déjà enregistré plutôt que supposée fixe : le moteur journalise
// désormais la ligne la plus probable, pas toujours la même.
function deriveActualOutcome(entry, homeGoals, awayGoals) {
  const total = homeGoals + awayGoals;
  const resultSide = homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw';

  if (entry.market === 'Résultat') return resultSide;
  if (entry.market === 'Les 2 équipes marquent') return homeGoals > 0 && awayGoals > 0 ? 'yes' : 'no';

  if (entry.market === 'Total buts') {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : total > Number(line) ? 'over' : 'under';
  }
  if (entry.market === `Buts — ${entry.homeName}`) {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : homeGoals > Number(line) ? 'over' : 'under';
  }
  if (entry.market === `Buts — ${entry.awayName}`) {
    const line = extractGoalLine(entry.predictedLabel);
    return line === null ? null : awayGoals > Number(line) ? 'over' : 'under';
  }
  if (entry.market === 'Résultat + Total buts') {
    const line = extractGoalLine(entry.predictedLabel);
    if (line === null) return null;
    const totalSide = total > Number(line) ? 'Over' : 'Under';
    const sideKey = resultSide === 'draw' ? 'draw' : resultSide;
    return `${sideKey}${totalSide}`;
  }
  return null;
}

// Même principe que deriveActualOutcome ci-dessus, mais pour un pari réel
// (Mes paris) : le pick est un libellé humain ("Plus de 2.5 buts", "{équipe}
// — Moins de 1.5 buts"...) plutôt qu'un enum propre, donc on en extrait la
// ligne/le sens via texte plutôt que de comparer un champ structuré. Marché
// non reconnu (corners, tirs cadrés...) → null, jamais deviné.
function deriveBetLegOutcome(leg, homeGoals, awayGoals) {
  const total = homeGoals + awayGoals;
  const bttsYes = homeGoals > 0 && awayGoals > 0;
  const resultSide = homeGoals > awayGoals ? 'home' : homeGoals < awayGoals ? 'away' : 'draw';
  const pick = leg.pick ?? '';

  if (leg.market === 'Résultat' || leg.market === '1N2') {
    if (/nul/i.test(pick)) return resultSide === 'draw' ? 'won' : 'lost';
    if (namesMatch(pick, leg.homeName)) return resultSide === 'home' ? 'won' : 'lost';
    if (namesMatch(pick, leg.awayName)) return resultSide === 'away' ? 'won' : 'lost';
    return null;
  }

  if (leg.market === 'Total buts') {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    return (total > Number(line)) === isOver ? 'won' : 'lost';
  }

  if (leg.market === 'Les 2 équipes marquent') {
    return bttsYes === /oui/i.test(pick) ? 'won' : 'lost';
  }

  if (leg.market === 'Buts par équipe' || leg.market.startsWith('Buts — ')) {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    const isHomeTeam = namesMatch(pick, leg.homeName);
    const isAwayTeam = namesMatch(pick, leg.awayName);
    if (!isHomeTeam && !isAwayTeam) return null;
    const teamGoals = isHomeTeam ? homeGoals : awayGoals;
    return (teamGoals > Number(line)) === isOver ? 'won' : 'lost';
  }

  if (leg.market === 'Résultat + Total buts') {
    const line = extractGoalLine(pick);
    if (line === null) return null;
    const isOver = /plus de/i.test(pick);
    let sideMatches;
    if (/nul/i.test(pick)) sideMatches = resultSide === 'draw';
    else if (namesMatch(pick, leg.homeName)) sideMatches = resultSide === 'home';
    else if (namesMatch(pick, leg.awayName)) sideMatches = resultSide === 'away';
    else return null;
    return sideMatches && (total > Number(line)) === isOver ? 'won' : 'lost';
  }

  return null;
}

async function settleMatch(group) {
  const score = getScore(group.matchId);
  if (score.home === null || score.away === null || Number.isNaN(score.home) || Number.isNaN(score.away)) return;

  settling[group.matchId] = true;
  try {
    // Le score est aussi enregistré comme un vrai résultat (pas seulement
    // utilisé pour régler les pronostics ci-dessous) : les prochaines
    // analyses impliquant l'une de ces deux équipes mélangeront ce score réel
    // à la moyenne API-Football, cf. blendGoalsWithLocalResults côté serveur.
    await matchResultsApi.record({
      matchId: group.matchId,
      homeName: group.homeName,
      awayName: group.awayName,
      league: group.league,
      homeGoals: score.home,
      awayGoals: score.away
    });

    // matchesStore reste chargé en mémoire tout le temps que l'app est
    // ouverte — sans ce retrait immédiat, un scan lancé plus tard dans "Mes
    // paris" repartirait d'une liste de matchs encore périmée et
    // proposerait à nouveau ce match pourtant déjà réglé.
    matchesStore.removeMatch(group.matchId);

    for (const entry of group.entries) {
      const actual = deriveActualOutcome(entry, score.home, score.away);
      if (actual === null) continue;
      const status = actual === entry.predictedOutcome ? 'correct' : 'incorrect';
      if (entry.status !== status) await predictionsStore.updateStatus(entry.id, status);
    }

    // Règle aussi les paris réels du carnet sur ce même match — seulement les
    // sélections encore "en attente" : un statut déjà réglé à la main (ex.
    // annulé pour match reporté) n'est jamais écrasé automatiquement.
    let betsSettled = 0;
    for (const bet of betsStore.bets) {
      for (let legIndex = 0; legIndex < bet.legs.length; legIndex++) {
        const leg = bet.legs[legIndex];
        if (leg.matchId !== group.matchId) continue;
        const currentStatus = leg.status ?? (bet.legs.length === 1 ? bet.status : 'pending');
        if (currentStatus !== 'pending') continue;
        const outcome = deriveBetLegOutcome(leg, score.home, score.away);
        if (outcome === null) continue;
        await betsStore.updateBetLegStatus(bet.id, legIndex, outcome);
        betsSettled++;
      }
    }

    toastStore.success(
      `Score ${group.homeName} ${score.home} - ${score.away} ${group.awayName} enregistré — pronostics réglés` +
        (betsSettled ? `, ${betsSettled} pari(s) réglé(s)` : '') +
        ' et moyennes mises à jour pour les prochaines analyses.'
    );
  } catch (error) {
    toastStore.error(`Réglage automatique impossible : ${error.message}`);
  } finally {
    settling[group.matchId] = false;
  }
}

async function setPredictionStatus(entry, status) {
  try {
    await predictionsStore.updateStatus(entry.id, status);
  } catch (error) {
    toastStore.error(`Mise à jour impossible : ${error.message}`);
  }
}

// Les pronostics n'ont pas leur propre horodatage de coup d'envoi (seulement
// un jour "day") — on le retrouve via matchesStore, déjà chargé pour la
// résolution de compo ci-dessous. Absent (match hors de la fenêtre de l'Odds
// API, ex. très ancien) : pas de badge plutôt qu'un statut deviné.
function matchKickoff(matchId) {
  return matchesStore.matches.find((m) => m.matchId === matchId)?.commenceTime ?? null;
}

async function removePrediction(entry) {
  try {
    await predictionsStore.removeEntry(entry.id);
  } catch (error) {
    toastStore.error(`Suppression impossible : ${error.message}`);
  }
}

onMounted(() => {
  predictionsStore.fetchPredictions();
  betsStore.fetchBets();
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
      }
    })
    .catch(() => {});
});
</script>

<template>
  <div class="predictions-history-view">
    <TabbedView v-model="activeTab" :tabs="TABS" query-param="onglet" />

    <Transition name="view" mode="out-in">
    <BetsPerformanceView v-if="activeTab === 'performance'" key="performance" />
    <BetsTicketsView v-else-if="activeTab === 'tickets'" key="tickets" />

    <div v-else key="moteur" class="predictions-history-view__default">
    <AppCard
      title="Historique — Pronostics du moteur"
      subtitle="Résultat, total buts, les 2 équipes marquent, buts par équipe — moyenne générale sur tous les matchs scannés"
    >
      <template #actions>
        <AppButton variant="secondary" size="sm" :loading="predictionsStore.loading" @click="predictionsStore.fetchPredictions">
          <template #icon><AppIcon name="refresh" :size="14" /></template>
          Actualiser
        </AppButton>
      </template>

      <p v-if="predictionSummary" class="cm-text-secondary performance-summary performance-summary--main">{{ predictionSummary }}</p>
      <p v-else class="cm-text-muted performance-summary">
        Aucun match scanné pour l'instant — lance un scan depuis <RouterLink to="/paris">Mes paris</RouterLink>.
      </p>

      <h3 class="daily-table__subheading">
        Taux de réussite par marché <span class="cm-text-muted">(toutes journées confondues)</span>
      </h3>
      <div class="daily-table-scroll">
        <table class="daily-table">
          <thead>
            <tr>
              <th>Marché</th>
              <th>Prédictions</th>
              <th>Corrects</th>
              <th>Incorrects</th>
              <th>En attente</th>
              <th>Taux de réussite</th>
              <th>Taux d'échec</th>
              <th>Yield <span class="cm-text-muted">(simulé, mise 10€)</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!marketBreakdown.length">
              <td colspan="8" class="daily-table__empty cm-text-muted">Aucune donnée pour l'instant.</td>
            </tr>
            <tr v-for="m in marketBreakdown" :key="m.market">
              <td class="daily-table__day">{{ m.market }}</td>
              <td class="cm-numeric">{{ m.total }}</td>
              <td class="cm-numeric cm-positive">{{ m.correct || '—' }}</td>
              <td class="cm-numeric cm-negative">{{ m.incorrect || '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ m.pending || '—' }}</td>
              <td class="cm-numeric cm-positive">{{ m.hitRate === null ? '—' : `${m.hitRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric cm-negative">{{ m.failRate === null ? '—' : `${m.failRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric" :class="(m.yieldPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ m.yieldPercent === null ? '—' : formatPercent(m.yieldPercent, { showSign: true }) }}
              </td>
            </tr>
            <tr v-if="marketBreakdown.length" class="daily-table__total">
              <td class="daily-table__day">Tous marchés</td>
              <td class="cm-numeric">{{ marketBreakdownTotal.total }}</td>
              <td class="cm-numeric cm-positive">{{ marketBreakdownTotal.correct || '—' }}</td>
              <td class="cm-numeric cm-negative">{{ marketBreakdownTotal.incorrect || '—' }}</td>
              <td class="cm-numeric cm-text-muted">{{ marketBreakdownTotal.pending || '—' }}</td>
              <td class="cm-numeric cm-positive">{{ marketBreakdownTotal.hitRate === null ? '—' : `${marketBreakdownTotal.hitRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric cm-negative">{{ marketBreakdownTotal.failRate === null ? '—' : `${marketBreakdownTotal.failRate.toFixed(0)}%` }}</td>
              <td class="cm-numeric" :class="(marketBreakdownTotal.yieldPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
                {{ marketBreakdownTotal.yieldPercent === null ? '—' : formatPercent(marketBreakdownTotal.yieldPercent, { showSign: true }) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppCard>

    <AppCard :padded="false" title="">
      <div class="predictions-search">
        <AppTextField v-model="predictionsSearchQuery" placeholder="Rechercher un match réglé (équipe, marché, pick)…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
      </div>

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
      <div v-else class="match-groups">
        <div v-for="leagueGroup in groupedByLeague" :key="leagueGroup.league" class="league-group">
          <div
            class="league-group__header"
            role="button"
            tabindex="0"
            @click="toggleLeague(leagueGroup.league)"
            @keydown.enter="toggleLeague(leagueGroup.league)"
          >
            <LeagueBadge :league="leagueGroup.league" />
            <span class="cm-text-muted cm-numeric league-group__count">{{ leagueGroup.groups.length }}</span>
            <AppIcon
              name="chevronRight"
              :size="12"
              class="league-group__chevron"
              :class="{ 'league-group__chevron--open': isLeagueOpen(leagueGroup.league) }"
            />
          </div>

          <template v-if="isLeagueOpen(leagueGroup.league)">
        <div v-for="group in leagueGroup.groups" :key="group.matchId" class="match-group">
          <div class="match-group__header">
            <div class="match-group__title">
              <p class="match-group__match cm-truncate">
                <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(group.homeName, group.league, group.matchId)">{{ group.homeName }}</button>
                vs
                <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(group.awayName, group.league, group.matchId)">{{ group.awayName }}</button>
              </p>
              <p class="cm-text-muted match-group__meta cm-truncate">
                {{ formatDay(group.day) }}
                <MatchStatusBadge :commence-time="matchKickoff(group.matchId)" class="match-group__status-badge" />
              </p>
            </div>
            <div class="match-group__score">
              <span class="cm-text-muted match-group__score-label">Score final</span>
              <input
                type="number"
                min="0"
                class="score-input"
                :value="getScore(group.matchId).home"
                placeholder="0"
                @input="onScoreInput(group.matchId, 'home', $event)"
              />
              <span class="cm-text-muted">-</span>
              <input
                type="number"
                min="0"
                class="score-input"
                :value="getScore(group.matchId).away"
                placeholder="0"
                @input="onScoreInput(group.matchId, 'away', $event)"
              />
              <AppButton
                variant="secondary"
                size="sm"
                :loading="settling[group.matchId]"
                :disabled="getScore(group.matchId).home === null || getScore(group.matchId).away === null"
                @click="settleMatch(group)"
              >
                Régler
              </AppButton>
            </div>
          </div>

          <div
            v-for="entry in group.entries"
            :key="entry.id"
            class="bets-row"
            :class="`bets-row--${entry.status === 'correct' ? 'won' : entry.status === 'incorrect' ? 'lost' : entry.status}`"
          >
            <div class="bets-row__main">
              <p class="cm-text-muted bets-row__market cm-truncate">
                {{ entry.market }}
                <span v-if="entry.market === 'Résultat' && entry.action === 'RECOMMENDED'" class="cm-positive"> · value bet</span>
              </p>
              <p class="bets-row__pick cm-truncate">{{ entry.predictedLabel }}</p>
            </div>
            <div class="value-bet-row__figures">
              <span class="cm-numeric">@ {{ formatOdds(entry.predictedOdds) }}</span>
            </div>
            <span
              class="bets-row__status"
              :class="`bets-row__status--${entry.status === 'correct' ? 'won' : entry.status === 'incorrect' ? 'lost' : entry.status}`"
            >
              {{ PREDICTION_STATUS_LABELS[entry.status] }}
            </span>
            <div class="bets-row__actions">
              <template v-if="entry.status === 'pending'">
                <AppButton variant="ghost" size="sm" @click="setPredictionStatus(entry, 'correct')">Correct</AppButton>
                <AppButton variant="ghost" size="sm" @click="setPredictionStatus(entry, 'incorrect')">Incorrect</AppButton>
                <AppButton variant="ghost" size="sm" @click="setPredictionStatus(entry, 'void')">Annulé</AppButton>
              </template>
              <AppButton v-else variant="ghost" size="sm" @click="setPredictionStatus(entry, 'pending')">Réouvrir</AppButton>
              <button type="button" class="bets-row__delete" title="Supprimer" @click="removePrediction(entry)">
                <AppIcon name="x" :size="14" />
              </button>
            </div>
          </div>
        </div>
          </template>
        </div>
      </div>
    </AppCard>
    </div>
    </Transition>
  </div>
</template>

<style scoped>
.predictions-history-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.predictions-history-view__default {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.performance-summary {
  font-size: 12.5px;
  margin-bottom: 14px;
}

.performance-summary--main {
  font-size: 14px;
  font-weight: 600;
}

.daily-table-scroll {
  overflow-x: auto;
}

.daily-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.daily-table th,
.daily-table td {
  padding: 8px 10px;
  text-align: right;
  border-bottom: 1px solid var(--cm-border-soft);
  white-space: nowrap;
}

.daily-table th {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
  font-weight: 600;
}

.daily-table th:first-child,
.daily-table td:first-child {
  text-align: left;
}

.daily-table__day {
  font-weight: 600;
  text-transform: capitalize;
}

.daily-table__empty {
  text-align: center !important;
  padding: 20px 10px;
}

.daily-table tbody tr:last-child td {
  border-bottom: none;
}

.daily-table__total td {
  border-top: 2px solid var(--cm-border);
  font-weight: 700;
}

.daily-table__subheading {
  font-size: 12px;
  font-weight: 700;
  margin: 18px 0 10px;
}

.predictions-search {
  padding: 14px 16px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.match-groups {
  display: flex;
  flex-direction: column;
}

.league-group {
  border-bottom: 1px solid var(--cm-border-soft);
}

.league-group:last-child {
  border-bottom: none;
}

.league-group__header {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 16px;
  background: var(--cm-surface-alt);
  border: none;
  cursor: pointer;
  text-align: left;
}

.league-group__count {
  font-size: 11px;
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

.match-group {
  border-bottom: 1px solid var(--cm-border-soft);
}

.match-group:last-child {
  border-bottom: none;
}

.match-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background: var(--cm-surface-alt);
}

.match-group__title {
  min-width: 0;
}

.match-group__match {
  font-size: 13.5px;
  font-weight: 700;
}

.match-group__meta {
  font-size: 11px;
  margin-top: 2px;
}

.match-group__status-badge {
  margin-left: 6px;
  vertical-align: middle;
}

.match-group__score {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.match-group__score-label {
  font-size: 11px;
  margin-right: 2px;
}

.score-input {
  width: 44px;
  padding: 5px 6px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface);
  color: var(--cm-text-primary);
  font-size: 13px;
  text-align: center;
}

.score-input::-webkit-inner-spin-button,
.score-input::-webkit-outer-spin-button {
  opacity: 1;
}

.bets-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 16px;
  padding: 10px 16px 10px 28px;
  border-bottom: 1px solid var(--cm-border-soft);
  border-left: 3px solid transparent;
}

.match-group .bets-row:last-child {
  border-bottom: none;
}

.bets-row--won {
  border-left-color: var(--cm-accent);
}

.bets-row--lost {
  border-left-color: var(--cm-danger);
}

.bets-row__main {
  min-width: 0;
}

.bets-row__market {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.bets-row__pick {
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 3px;
}

.bets-row__status {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  text-align: center;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
}

.bets-row__status--won {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.bets-row__status--lost {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.bets-row__status--pending {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.bets-row__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bets-row__delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--cm-radius-sm);
  background: transparent;
  color: var(--cm-text-muted);
  cursor: pointer;
}

.bets-row__delete:hover {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.value-bet-row__figures {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 10px;
  font-size: 11.5px;
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .bets-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .match-group__header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
