<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useSourcesStore } from '@/stores/sourcesStore.js';
import { useBetsStore } from '@/stores/betsStore.js';
import { usePredictionsStore } from '@/stores/predictionsStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { analysisApi } from '@/services/analysisApi.js';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import { computeSafestPicks } from '@/utils/safestPicks.js';
import { legStatus } from '@/utils/betTrends.js';
import { parseLeagueLabel } from '@/utils/leagueDisplay.js';
import { liveNow } from '@/utils/liveClock.js';
import { computeMatchStatus } from '@/utils/matchStatus.js';
import { LIVE_MATCH_UNAVAILABLE_MESSAGES } from '@/utils/lineupMessages.js';
import AppCard from '@/components/common/AppCard.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import MatchesFilterBar from '@/components/matches/MatchesFilterBar.vue';
import PicksSearchCard from '@/components/matches/PicksSearchCard.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import MatchStatsPanel from '@/components/matches/MatchStatsPanel.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { formatOdds, formatCurrency, formatPercent, formatDateTime, formatKickoff } from '@/utils/format.js';

const matchesStore = useMatchesStore();
const sourcesStore = useSourcesStore();
const betsStore = useBetsStore();
const predictionsStore = usePredictionsStore();
const toastStore = useToastStore();
const teamStatsModalStore = useTeamStatsModalStore();

const STATUS_LABELS = { pending: 'En attente', won: 'Gagné', lost: 'Perdu', void: 'Annulé' };

const pendingStake = computed(() => betsStore.bets.filter((bet) => bet.status === 'pending').reduce((sum, bet) => sum + bet.stake, 0));

async function setLegStatus(bet, legIndex, status) {
  try {
    await betsStore.updateBetLegStatus(bet.id, legIndex, status);
  } catch (error) {
    toastStore.error(`Mise à jour impossible : ${error.message}`);
  }
}

// Le carnet ne montre pas tout en continu : par défaut, seuls les paris
// encore EN ATTENTE (ceux qui demandent une action) restent affichés. Les
// paris déjà réglés (gagnés/perdus/annulés) ne réapparaissent que via la
// recherche, pour retrouver un pari précis sans dérouler tout l'historique.
const betSearchQuery = ref('');
const visibleBets = computed(() => {
  const query = betSearchQuery.value.trim().toLowerCase();
  if (!query) return betsStore.bets.filter((bet) => bet.status === 'pending');
  return betsStore.bets.filter((bet) =>
    bet.legs.some(
      (leg) =>
        leg.homeName.toLowerCase().includes(query) ||
        leg.awayName.toLowerCase().includes(query) ||
        leg.market.toLowerCase().includes(query) ||
        leg.pick.toLowerCase().includes(query)
    )
  );
});

// Regroupé par championnat PUIS par match — même principe que Matchs, les
// picks et Mes tickets, sinon des dizaines de paris (parfois 5-6 sur le même
// match) s'affichent d'un coup en liste plate. Un combiné n'a pas de match
// unique : rangé sous celui de sa première sélection.
const groupedBets = computed(() => {
  const byLeague = new Map();
  for (const bet of visibleBets.value) {
    const leagueKey = bet.legs[0]?.league || 'Autres rencontres';
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, new Map());
    const byMatch = byLeague.get(leagueKey);
    const matchKey = bet.legs[0]?.matchId ?? bet.id;
    if (!byMatch.has(matchKey)) {
      byMatch.set(matchKey, {
        matchId: matchKey,
        homeName: bet.legs[0]?.homeName,
        awayName: bet.legs[0]?.awayName,
        commenceTime: matchKickoff(bet.legs[0]),
        bets: []
      });
    }
    byMatch.get(matchKey).bets.push(bet);
  }
  return [...byLeague.entries()].map(([league, byMatch]) => ({
    league,
    count: [...byMatch.values()].reduce((sum, m) => sum + m.bets.length, 0),
    matches: [...byMatch.values()]
  }));
});

// Vide par défaut : tous les championnats démarrent fermés, comme ailleurs.
const expandedBetLeagues = ref(new Set());

function toggleBetLeague(league) {
  const next = new Set(expandedBetLeagues.value);
  if (next.has(league)) next.delete(league);
  else next.add(league);
  expandedBetLeagues.value = next;
}

// Une recherche active doit révéler ses résultats même dans un championnat
// resté fermé.
function isBetLeagueOpen(league) {
  return Boolean(betSearchQuery.value.trim()) || expandedBetLeagues.value.has(league);
}

// Même principe, un niveau plus bas : replié par match tant qu'on n'a pas
// cliqué dessus, pour ne pas empiler 5-6 lignes du même match d'un coup.
const expandedBetMatches = ref(new Set());

function toggleBetMatch(matchId) {
  const next = new Set(expandedBetMatches.value);
  if (next.has(matchId)) next.delete(matchId);
  else next.add(matchId);
  expandedBetMatches.value = next;
}

function isBetMatchOpen(matchId) {
  return Boolean(betSearchQuery.value.trim()) || expandedBetMatches.value.has(matchId);
}

// Même badge/statut qu'ailleurs (cf. matchStatus.js) — un match dont le coup
// d'envoi est inconnu (très vieux pari, jamais recroisé avec matchesStore)
// n'affiche simplement pas le badge plutôt qu'un statut deviné.
function isMatchGroupLive(matchGroup) {
  return computeMatchStatus(matchGroup.commenceTime, liveNow.value) === 'live';
}

// Match dont l'heure estimée de fin est passée mais dont personne n'a encore
// saisi le score dans Historique moteur — visible même replié, comme sur
// Matchs, pour repérer ceux qu'il reste à régler sans ouvrir chaque match.
function isMatchGroupFinished(matchGroup) {
  return computeMatchStatus(matchGroup.commenceTime, liveNow.value) === 'finished';
}

// Score + stats en direct par match — même endpoint et même dégradation
// gracieuse que "Voir le direct" sur la page Matchs (cf.
// resolveLiveMatchDetails côté serveur) : indexé par matchId, une carte de
// paris (Valencia vs Barcelona) est déjà son propre regroupement, donc pas de
// confusion possible entre deux matchs différents qui partageraient l'état.
const liveMatchDetailsByMatch = reactive({});

async function showLiveMatchDetails(matchGroup) {
  const next = new Set(expandedBetMatches.value);
  next.add(matchGroup.matchId);
  expandedBetMatches.value = next;

  liveMatchDetailsByMatch[matchGroup.matchId] = { loading: true, error: null, data: null };
  try {
    const data = await teamStatsApi.getLiveMatchByName(matchGroup.homeName, matchGroup.commenceTime);
    liveMatchDetailsByMatch[matchGroup.matchId] = { loading: false, error: null, data };
  } catch (error) {
    liveMatchDetailsByMatch[matchGroup.matchId] = { loading: false, error: error.message, data: null };
  }
}

async function remove(bet) {
  try {
    await betsStore.removeBet(bet.id);
    toastStore.success('Pari supprimé.');
  } catch (error) {
    toastStore.error(`Suppression impossible : ${error.message}`);
  }
}

// --- Value bets : matchs où la cote de notre moteur (marché + structurel +
// exogène fusionnés) paie mieux que ce que le marché propose réellement sur
// l'issue domicile (seul marché où la mise Kelly conseillée est calculée —
// cf. evaluateStakingDecision côté serveur). Filtré par date comme la page
// Matchs, pour ne scanner que "aujourd'hui / cette semaine / etc." plutôt
// que tout charger d'un coup.
function toDateKey(isoString) {
  return isoString?.slice(0, 10) ?? null;
}

// "today" comme défaut laissait souvent une liste vide (aucun match
// programmé aujourd'hui précisément) sans que ce soit visible pourquoi — vu
// comme "le scan ne marche plus". "week" a quasiment toujours des matchs.
const dateFilter = ref('week');
const availableDates = computed(() => [...new Set(matchesStore.matches.map((m) => toDateKey(m.commenceTime)).filter(Boolean))].sort());

const dateFilteredMatches = computed(() => {
  const today = toDateKey(new Date().toISOString());
  const weekAhead = toDateKey(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());
  return matchesStore.matches.filter((match) => {
    const matchDate = toDateKey(match.commenceTime);
    if (dateFilter.value === 'all') return true;
    if (dateFilter.value === 'today') return matchDate === today;
    if (dateFilter.value === 'week') return matchDate >= today && matchDate <= weekAhead;
    return matchDate === dateFilter.value;
  });
});

// En dessous de cette cote, le pari ne rapporte presque rien — exclu des
// trois listes de sélection (mais pas du journal predictionEntries, qui doit
// garder TOUTES les prédictions pour mesurer la précision du moteur).
const MIN_DISPLAYED_ODDS = 1.2;

// Les trois listes issues du scan sont réparties en onglets (même principe
// que Matchs/Statistiques ligue) plutôt qu'empilées — trop dense d'un coup
// une fois qu'il y a des dizaines de paris par liste. L'onglet "Bankroll"
// (scanner, carnet réel, réglages de mise) est prioritaire/par défaut ; un
// seul scan y alimente les trois autres onglets.
const activeTab = ref('bankroll'); // 'bankroll' | 'value' | 'safest' | 'all'

const scanning = ref(false);
const scanned = ref(false);
// Un seul scan alimente TROIS listes distinctes et indépendamment
// cherchables, plutôt qu'une liste unique qui bascule entre value bets et
// repli sur les paris sûrs :
// - valueBets : edge positif détecté par le moteur (issue domicile — seul
//   marché évalué par evaluateStakingDecision).
// - safestPicksPool : le pari le plus sûr par marché et par match (≥ 1.35,
//   cf. safestPicks.js) — "les plus probables" au sens intéressant à jouer.
// - allPicksPool : TOUS les pronostics du moteur, sans filtre de seuil —
//   pour parier sur autre chose que ce que les deux listes ci-dessus retiennent.
const valueBets = ref([]); // [{ matchId, homeName, awayName, league, commenceTime, market, pick, odds, modelOdds, edgePercent, recommendedStake }]
const safestPicksPool = ref([]); // même forme, sans modelOdds/edgePercent/recommendedStake
const allPicksPool = ref([]); // même forme que safestPicksPool
const selectedByMatch = ref(new Map()); // matchId -> candidate sélectionné (1 max par match)

function legKey(candidate) {
  return `${candidate.matchId}|${candidate.market}|${candidate.pick}`;
}

function impliedProbability(odds) {
  return odds > 1 ? Math.round((1 / odds) * 100) : null;
}

// La date du match (coup d'envoi) est stockée sur la sélection depuis peu —
// les paris créés avant cet ajout ne l'ont pas, d'où le repli sur la liste de
// matchs déjà chargée (par matchId) quand elle est encore disponible ; null
// sinon plutôt qu'une date devinée.
function matchKickoff(leg) {
  if (leg.commenceTime) return leg.commenceTime;
  return matchesStore.matches.find((m) => m.matchId === leg.matchId)?.commenceTime ?? null;
}

async function scanMatches() {
  scanning.value = true;
  scanned.value = true;
  valueBets.value = [];
  safestPicksPool.value = [];
  allPicksPool.value = [];
  selectedByMatch.value = new Map();

  // Les matchs déjà réglés (score saisi dans Historique moteur) sont déjà
  // exclus de matchesStore.matches à la source (cf. fetchMatches) — pas
  // besoin de refiltrer ici.
  const matches = dateFilteredMatches.value;
  const foundValue = [];
  const allSafest = [];
  const allPicks = [];
  const predictionEntries = [];
  const BATCH_SIZE = 4;

  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const batch = matches.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((match) => analysisApi.analyzeMatchById(match.matchId, matchesStore.source, matchesStore.bankroll))
    );
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const match = batch[index];
      const data = result.value;
      const base = { matchId: match.matchId, homeName: match.home, awayName: match.away, league: match.league, commenceTime: match.commenceTime };

      if (data.staking?.action === 'RECOMMENDED' && data.market.odds1 >= MIN_DISPLAYED_ODDS) {
        foundValue.push({
          ...base,
          // Même marché que la prédiction "Résultat" ci-dessous (issue 1X2) —
          // même libellé obligatoire, sinon un pari ici et une prédiction
          // journalisée par ailleurs sur le même marché divergent en base
          // ('1N2' vs 'Résultat' coexistaient avant, bug confirmé en prod).
          market: 'Résultat',
          marketId: 'result',
          params: { outcome: 'home' },
          pick: `${match.home} gagne`,
          odds: data.market.odds1,
          modelOdds: data.trueOdds.home,
          edgePercent: data.edgePercent,
          recommendedStake: data.staking.stake,
          byBookmaker: data.market.byBookmaker ?? []
        });
      }

      for (const safePick of computeSafestPicks(data)) {
        if (safePick.odds < MIN_DISPLAYED_ODDS) continue;
        allSafest.push({ ...base, market: safePick.market, pick: safePick.pick, odds: safePick.odds });
      }

      // Dérivé côté serveur (cf. sports/football/markets.js) — source unique,
      // plus de duplication de cette logique ici.
      const marketPredictions = data.marketPredictions ?? [];
      for (const p of marketPredictions) {
        if (p.predictedOdds < MIN_DISPLAYED_ODDS) continue;
        allPicks.push({
          ...base,
          market: p.market,
          pick: p.predictedLabel,
          odds: p.predictedOdds,
          marketOdds: p.predictedMarketOdds ?? null,
          marketId: p.marketId ?? null,
          params: p.params ?? null
        });
      }
      for (const marketPrediction of marketPredictions) {
        predictionEntries.push({
          matchId: match.matchId,
          homeName: match.home,
          awayName: match.away,
          league: match.league,
          action: data.staking?.action ?? null,
          edgePercent: data.edgePercent,
          ...marketPrediction
        });
      }
    });
    valueBets.value = [...foundValue];
    safestPicksPool.value = allSafest.sort((a, b) => a.odds - b.odds);
    allPicksPool.value = [...allPicks];
  }

  scanning.value = false;
  predictionsStore.recordFindings(predictionEntries);
}

// Le scan est un instantané : un match encore à venir au moment du scan peut
// être réglé (score saisi dans Historique moteur) juste après, sans nouveau
// scan. matchesStore.matches exclut déjà les matchs réglés à la source (cf.
// fetchMatches) — recroiser les 3 pools avec cette liste à chaque rendu les
// tient à jour sans attendre un rescan complet.
const liveMatchIds = computed(() => new Set(matchesStore.matches.map((m) => m.matchId)));

// Un pick déjà mis au carnet (peu importe son statut — en attente, gagné,
// perdu…) ne doit plus être proposable, sinon rien n'empêche de parier deux
// fois sur la même issue. Recalculé sur betsStore.bets : ajouter un pari le
// fait disparaître immédiatement des 3 listes, le supprimer (icône
// "Supprimer") le fait réapparaître — pas besoin d'un nouveau scan.
const takenLegKeys = computed(() => new Set(betsStore.bets.flatMap((bet) => bet.legs.map((leg) => legKey(leg)))));

const activeValueBets = computed(() => valueBets.value.filter((c) => liveMatchIds.value.has(c.matchId) && !takenLegKeys.value.has(legKey(c))));
const activeSafestPicksPool = computed(() =>
  safestPicksPool.value.filter((c) => liveMatchIds.value.has(c.matchId) && !takenLegKeys.value.has(legKey(c)))
);
const activeAllPicksPool = computed(() => allPicksPool.value.filter((c) => liveMatchIds.value.has(c.matchId) && !takenLegKeys.value.has(legKey(c))));

const valueBetsSearchQuery = ref('');
const filteredValueBets = computed(() => {
  const query = valueBetsSearchQuery.value.trim().toLowerCase();
  if (!query) return activeValueBets.value;
  return activeValueBets.value.filter(
    (c) =>
      c.homeName.toLowerCase().includes(query) ||
      c.awayName.toLowerCase().includes(query) ||
      c.market.toLowerCase().includes(query) ||
      c.pick.toLowerCase().includes(query) ||
      (c.league ?? '').toLowerCase().includes(query)
  );
});

// Rangé par ligue plutôt qu'en liste plate — un value bet est toujours 1 par
// match (seule l'issue domicile est évaluée), donc pas besoin d'un
// sous-regroupement par rencontre en plus.
const groupedValueBets = computed(() => {
  const byLeague = new Map();
  for (const c of filteredValueBets.value) {
    const leagueKey = c.league || 'Autres rencontres';
    if (!byLeague.has(leagueKey)) byLeague.set(leagueKey, []);
    byLeague.get(leagueKey).push(c);
  }
  return [...byLeague.entries()].map(([league, bets]) => ({ league, bets }));
});

// Une seule sélection PAR MATCH sur le ticket — indexé par matchId (pas par
// leg) pour que cocher un 2e pick du même match remplace le 1er au lieu de
// s'y ajouter : deux issues du même match combinées seraient corrélées
// (parfois même mutuellement exclusives), donc jamais un vrai combiné.
function toggleSelect(candidate) {
  const next = new Map(selectedByMatch.value);
  const current = next.get(candidate.matchId);
  if (current && legKey(current) === legKey(candidate)) {
    next.delete(candidate.matchId);
  } else {
    if (current) toastStore.push('Un seul pari par match sur le ticket — remplacé.', 'info');
    next.set(candidate.matchId, candidate);
  }
  selectedByMatch.value = next;
}

function isSelected(candidate) {
  const current = selectedByMatch.value.get(candidate.matchId);
  return Boolean(current) && legKey(current) === legKey(candidate);
}

// Détail des cotes RÉELLES de chaque bookmaker (pas juste la moyenne
// "marché") — pour savoir concrètement chez qui parier au meilleur prix,
// plutôt qu'à un consensus qui n'existe chez aucun bookmaker en particulier.
const expandedBookmakers = ref(new Set());

function toggleBookmakers(matchId) {
  const next = new Set(expandedBookmakers.value);
  if (next.has(matchId)) next.delete(matchId);
  else next.add(matchId);
  expandedBookmakers.value = next;
}

const selectedLegs = computed(() => [...selectedByMatch.value.values()]);
const combinedOdds = computed(() => selectedLegs.value.reduce((product, leg) => product * leg.odds, 1));

const slipStake = ref(10);
const submittingSlip = ref(false);

// Kelly ne s'applique proprement qu'à UN pari indépendant à la fois — pour
// une seule sélection avec une mise conseillée (value bet), on la propose en
// mise par défaut ; pour un combiné ou un pari sûr sans mise Kelly, on laisse
// la valeur manuelle telle quelle plutôt que de suggérer un chiffre inventé.
watch(selectedLegs, (legs) => {
  if (legs.length === 1 && legs[0].recommendedStake > 0) slipStake.value = Number(legs[0].recommendedStake.toFixed(2));
});

async function submitSlip() {
  if (!selectedLegs.value.length) return;
  submittingSlip.value = true;
  try {
    await betsStore.createBet({
      stake: slipStake.value,
      legs: selectedLegs.value.map((leg) => ({
        matchId: leg.matchId,
        homeName: leg.homeName,
        awayName: leg.awayName,
        league: leg.league,
        commenceTime: leg.commenceTime ?? null,
        market: leg.market,
        marketId: leg.marketId ?? null,
        params: leg.params ?? null,
        pick: leg.pick,
        odds: leg.odds
      }))
    });
    toastStore.success(selectedLegs.value.length > 1 ? 'Pari combiné ajouté au carnet.' : 'Pari ajouté au carnet.');
    selectedByMatch.value = new Map();
  } catch (error) {
    toastStore.error(`Création du pari impossible : ${error.message}`);
  } finally {
    submittingSlip.value = false;
  }
}

onMounted(() => {
  betsStore.fetchBets();
  if (!sourcesStore.sources.length) sourcesStore.fetchSources();
  if (matchesStore.matches.length === 0) matchesStore.fetchMatches();
});
</script>

<template>
  <div class="my-bets-view">
    <div class="my-bets-view__tabs">
      <button type="button" class="my-bets-view__tab" :class="{ 'my-bets-view__tab--active': activeTab === 'bankroll' }" @click="activeTab = 'bankroll'">
        Bankroll &amp; carnet
      </button>
      <button type="button" class="my-bets-view__tab" :class="{ 'my-bets-view__tab--active': activeTab === 'value' }" @click="activeTab = 'value'">
        Value bets détectées <span class="cm-numeric">{{ activeValueBets.length }}</span>
      </button>
      <button type="button" class="my-bets-view__tab" :class="{ 'my-bets-view__tab--active': activeTab === 'safest' }" @click="activeTab = 'safest'">
        Paris les plus probables <span class="cm-numeric">{{ activeSafestPicksPool.length }}</span>
      </button>
      <button type="button" class="my-bets-view__tab" :class="{ 'my-bets-view__tab--active': activeTab === 'all' }" @click="activeTab = 'all'">
        Tous les paris <span class="cm-numeric">{{ activeAllPicksPool.length }}</span>
      </button>
    </div>

    <div v-if="selectedLegs.length" class="bet-slip">
      <p class="bet-slip__title">
        {{ selectedLegs.length }} sélection{{ selectedLegs.length > 1 ? 's' : '' }}
        <span v-if="selectedLegs.length > 1" class="cm-text-muted">— combiné, cote {{ formatOdds(combinedOdds) }}</span>
      </p>
      <AppNumberField v-model="slipStake" label="Mise (€)" :min="1" />
      <AppButton variant="primary" :loading="submittingSlip" :disabled="!slipStake || slipStake <= 0" @click="submitSlip">
        Valider {{ selectedLegs.length > 1 ? `le combiné (${selectedLegs.length})` : 'le pari' }}
      </AppButton>
    </div>

    <template v-if="activeTab === 'bankroll'">
    <AppCard title="Mes paris" subtitle="Carnet de paris — simples et combinés">
      <div class="my-bets-view__summary">
        <div class="my-bets-view__stat">
          <span class="cm-text-muted">Misé (en attente)</span>
          <span class="cm-numeric">{{ formatCurrency(pendingStake) }}</span>
        </div>
        <div class="my-bets-view__stat">
          <span class="cm-text-muted">Misé (réglés)</span>
          <span class="cm-numeric">{{ formatCurrency(betsStore.totalStaked) }}</span>
        </div>
        <div class="my-bets-view__stat">
          <span class="cm-text-muted">Retours</span>
          <span class="cm-numeric">{{ formatCurrency(betsStore.totalReturned) }}</span>
        </div>
        <div class="my-bets-view__stat">
          <span class="cm-text-muted">Profit net</span>
          <span class="cm-numeric" :class="betsStore.netProfit >= 0 ? 'cm-positive' : 'cm-negative'">
            {{ formatCurrency(betsStore.netProfit) }}
          </span>
        </div>
        <div class="my-bets-view__stat">
          <span class="cm-text-muted">ROI</span>
          <span class="cm-numeric" :class="(betsStore.roiPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
            {{ betsStore.roiPercent === null ? '—' : formatPercent(betsStore.roiPercent, { showSign: true }) }}
          </span>
        </div>
      </div>
    </AppCard>

    <AppCard title="Scanner les matchs" subtitle="Alimente les trois recherches ci-dessous en une seule analyse">
      <div class="value-bets__controls">
        <AppSelect v-model="matchesStore.source" label="Source de données" :options="sourcesStore.options" />
        <AppNumberField v-model="matchesStore.bankroll" label="Bankroll" :min="0" :step="500" suffix="€" />
        <AppButton variant="primary" :loading="scanning" @click="scanMatches">
          <template #icon><AppIcon name="bolt" :size="15" /></template>
          Scanner les matchs
        </AppButton>
      </div>
      <div class="value-bets__date-filter">
        <MatchesFilterBar v-model="dateFilter" :available-dates="availableDates" />
      </div>
      <p class="cm-text-muted value-bets__kelly-hint">
        Mise conseillée = critère de Kelly fractionné sur la bankroll ci-dessus. Fraction de Kelly, seuils d'edge et mise
        max réglables dans <RouterLink to="/reglages">Réglages du moteur</RouterLink>.
      </p>
    </AppCard>

    <AppCard :padded="false" title="">
      <div class="bets-search">
        <AppTextField v-model="betSearchQuery" placeholder="Rechercher un pari réglé (équipe, marché, pick)…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
      </div>

      <LoadingSpinner v-if="betsStore.loading" />
      <EmptyState v-else-if="betsStore.error" icon="alert" title="Impossible de charger le carnet" :description="betsStore.error" />
      <EmptyState
        v-else-if="visibleBets.length === 0 && betSearchQuery.trim()"
        icon="search"
        title="Aucun résultat"
        :description="`Aucun pari ne correspond à «${betSearchQuery.trim()}».`"
      />
      <EmptyState
        v-else-if="visibleBets.length === 0"
        icon="target"
        title="Aucun pari en attente"
        description="Sélectionne un ou plusieurs value bets ci-dessus pour créer un pari, ou recherche un pari déjà réglé."
      />
      <div v-else class="bets-list">
        <div v-for="leagueGroup in groupedBets" :key="leagueGroup.league" class="league-group">
          <div
            class="league-group__header"
            role="button"
            tabindex="0"
            @click="toggleBetLeague(leagueGroup.league)"
            @keydown.enter="toggleBetLeague(leagueGroup.league)"
          >
            <LeagueBadge :league="leagueGroup.league" />
            <span v-if="leagueGroup.matches.some(isMatchGroupLive)" class="league-group__live">
              <span class="league-group__live-dot"></span>{{ leagueGroup.matches.filter(isMatchGroupLive).length }} en direct
            </span>
            <span v-if="leagueGroup.matches.some(isMatchGroupFinished)" class="league-group__finished">
              {{ leagueGroup.matches.filter(isMatchGroupFinished).length }} terminé(s)
            </span>
            <span class="cm-text-muted cm-numeric league-group__count">{{ leagueGroup.count }}</span>
            <AppIcon
              name="chevronRight"
              :size="12"
              class="league-group__chevron"
              :class="{ 'league-group__chevron--open': isBetLeagueOpen(leagueGroup.league) }"
            />
          </div>

          <template v-if="isBetLeagueOpen(leagueGroup.league)">
        <div v-for="matchGroup in leagueGroup.matches" :key="matchGroup.matchId" class="bets-match-group">
          <div
            class="bets-match-group__header"
            role="button"
            tabindex="0"
            @click="toggleBetMatch(matchGroup.matchId)"
            @keydown.enter="toggleBetMatch(matchGroup.matchId)"
          >
            <p class="bets-match-group__title cm-truncate">
              <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(matchGroup.homeName, leagueGroup.league, matchGroup.matchId)">{{ matchGroup.homeName }}</button>
              vs
              <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(matchGroup.awayName, leagueGroup.league, matchGroup.matchId)">{{ matchGroup.awayName }}</button>
            </p>
            <button
              v-if="isMatchGroupLive(matchGroup)"
              type="button"
              class="bets-match-group__live"
              title="Voir le score et les statistiques en direct"
              @click.stop="showLiveMatchDetails(matchGroup)"
            >
              <span class="bets-match-group__live-dot"></span>DIRECT
            </button>
            <span v-else-if="isMatchGroupFinished(matchGroup)" class="bets-match-group__finished">TERMINÉ</span>
            <span class="cm-text-muted cm-numeric">{{ matchGroup.bets.length }}</span>
            <AppIcon
              name="chevronRight"
              :size="12"
              class="bets-match-group__chevron"
              :class="{ 'bets-match-group__chevron--open': isBetMatchOpen(matchGroup.matchId) }"
            />
          </div>

          <div v-if="liveMatchDetailsByMatch[matchGroup.matchId]" class="bets-match-group__live-panel">
            <p v-if="liveMatchDetailsByMatch[matchGroup.matchId].loading" class="cm-text-muted">Récupération du score et des statistiques…</p>
            <p v-else-if="liveMatchDetailsByMatch[matchGroup.matchId].error" class="cm-text-muted">Erreur : {{ liveMatchDetailsByMatch[matchGroup.matchId].error }}</p>
            <p v-else-if="liveMatchDetailsByMatch[matchGroup.matchId].data && !liveMatchDetailsByMatch[matchGroup.matchId].data.available" class="cm-text-muted">
              {{ LIVE_MATCH_UNAVAILABLE_MESSAGES[liveMatchDetailsByMatch[matchGroup.matchId].data.reason] ?? 'Détails en direct indisponibles pour ce match.' }}
            </p>
            <template v-else-if="liveMatchDetailsByMatch[matchGroup.matchId].data?.available">
              <p class="bets-match-group__live-score">
                <span class="cm-numeric">{{ liveMatchDetailsByMatch[matchGroup.matchId].data.score.home ?? '—' }} - {{ liveMatchDetailsByMatch[matchGroup.matchId].data.score.away ?? '—' }}</span>
                <span v-if="liveMatchDetailsByMatch[matchGroup.matchId].data.status?.elapsed" class="cm-text-muted"> · {{ liveMatchDetailsByMatch[matchGroup.matchId].data.status.elapsed }}'</span>
                <span v-if="liveMatchDetailsByMatch[matchGroup.matchId].data.status?.long" class="cm-text-muted"> · {{ liveMatchDetailsByMatch[matchGroup.matchId].data.status.long }}</span>
              </p>
              <MatchStatsPanel
                v-if="liveMatchDetailsByMatch[matchGroup.matchId].data.teams?.length"
                :teams="liveMatchDetailsByMatch[matchGroup.matchId].data.teams"
                :fallback-primary-name="matchGroup.homeName"
                :fallback-opponent-name="matchGroup.awayName"
              />
              <p v-else class="cm-text-muted">Statistiques détaillées pas encore publiées pour ce match.</p>
            </template>
          </div>

          <template v-if="isBetMatchOpen(matchGroup.matchId)">
        <div v-for="bet in matchGroup.bets" :key="bet.id" class="bets-row" :class="`bets-row--${bet.status}`">
          <div class="bets-row__main">
            <template v-if="bet.legs.length === 1">
              <p class="cm-text-muted bets-row__market cm-truncate">
                {{ bet.legs[0].market }}
              </p>
              <p class="bets-row__pick cm-truncate">{{ bet.legs[0].pick }}</p>
              <p v-if="matchKickoff(bet.legs[0])" class="cm-text-muted bets-row__date">
                Match le {{ formatKickoff(matchKickoff(bet.legs[0])) }}
                <MatchStatusBadge v-if="bet.status === 'pending'" :commence-time="matchKickoff(bet.legs[0])" class="bets-row__status-badge" />
              </p>
            </template>
            <template v-else>
              <p class="bets-row__match cm-truncate">Combiné — {{ bet.legs.length }} sélections</p>
              <p class="cm-text-muted bets-row__combo-hint">Statut global déduit des sélections ci-dessous</p>
            </template>
            <p class="cm-text-muted bets-row__date">Pari créé le {{ formatDateTime(bet.createdAt) }}</p>
          </div>

          <div class="bets-row__figures">
            <span class="cm-numeric">@ {{ formatOdds(bet.odds) }}</span>
            <span class="cm-numeric">{{ formatCurrency(bet.stake) }}</span>
            <span class="cm-numeric bets-row__potential">{{ formatCurrency(bet.stake * bet.odds) }}</span>
          </div>

          <span class="bets-row__status" :class="`bets-row__status--${bet.status}`">{{ STATUS_LABELS[bet.status] }}</span>

          <div v-if="bet.legs.length === 1" class="bets-row__actions">
            <template v-if="legStatus(bet, 0) === 'pending'">
              <AppButton variant="ghost" size="sm" @click="setLegStatus(bet, 0, 'won')">Gagné</AppButton>
              <AppButton variant="ghost" size="sm" @click="setLegStatus(bet, 0, 'lost')">Perdu</AppButton>
              <AppButton variant="ghost" size="sm" @click="setLegStatus(bet, 0, 'void')">Annulé</AppButton>
            </template>
            <AppButton v-else variant="ghost" size="sm" @click="setLegStatus(bet, 0, 'pending')">Réouvrir</AppButton>
            <button type="button" class="bets-row__delete" title="Supprimer" @click="remove(bet)">
              <AppIcon name="x" :size="14" />
            </button>
          </div>
          <div v-else class="bets-row__actions">
            <button type="button" class="bets-row__delete" title="Supprimer" @click="remove(bet)">
              <AppIcon name="x" :size="14" />
            </button>
          </div>

          <div v-if="bet.legs.length > 1" class="bet-legs">
            <div v-for="(leg, i) in bet.legs" :key="i" class="bet-leg">
              <div class="bet-leg__main">
                <p class="bet-leg__match cm-truncate">
                  <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(leg.homeName, leg.league, leg.matchId)">{{ leg.homeName }}</button>
                  vs
                  <button type="button" class="cm-team-link" @click.stop="teamStatsModalStore.openFor(leg.awayName, leg.league, leg.matchId)">{{ leg.awayName }}</button>
                </p>
                <p class="cm-text-muted bet-leg__market cm-truncate">
                  {{ leg.market }} <span v-if="leg.league">· {{ leg.league }}</span><span v-if="matchKickoff(leg)"> · {{ formatKickoff(matchKickoff(leg)) }}</span>
                  <MatchStatusBadge v-if="legStatus(bet, i) === 'pending'" :commence-time="matchKickoff(leg)" class="bets-row__status-badge" />
                </p>
                <p class="bet-leg__pick cm-truncate">{{ leg.pick }} <span class="cm-text-muted cm-numeric">@ {{ formatOdds(leg.odds) }}</span></p>
              </div>
              <span class="bet-leg__status" :class="`bet-leg__status--${legStatus(bet, i)}`">{{ STATUS_LABELS[legStatus(bet, i)] }}</span>
              <div class="bet-leg__actions">
                <template v-if="legStatus(bet, i) === 'pending'">
                  <AppButton variant="ghost" size="sm" @click="setLegStatus(bet, i, 'won')">Gagné</AppButton>
                  <AppButton variant="ghost" size="sm" @click="setLegStatus(bet, i, 'lost')">Perdu</AppButton>
                  <AppButton variant="ghost" size="sm" @click="setLegStatus(bet, i, 'void')">Annulé</AppButton>
                </template>
                <AppButton v-else variant="ghost" size="sm" @click="setLegStatus(bet, i, 'pending')">Réouvrir</AppButton>
              </div>
            </div>
          </div>
        </div>
          </template>
        </div>
          </template>
        </div>
      </div>
    </AppCard>
    </template>

    <AppCard v-else-if="activeTab === 'value'" title="Value bets détectées" subtitle="Cote de notre moteur vs cote du marché — edge positif sur l'issue domicile">
      <AppTextField v-model="valueBetsSearchQuery" placeholder="Rechercher (équipe, marché, pick)…" class="value-bets__search">
        <template #icon><AppIcon name="search" :size="14" /></template>
      </AppTextField>

      <LoadingSpinner v-if="scanning && activeValueBets.length === 0" label="Analyse des matchs…" />
      <EmptyState
        v-else-if="!scanned"
        icon="bolt"
        title="Aucun scan encore lancé"
        description="Choisis une période et clique sur « Scanner les matchs »."
      />
      <EmptyState
        v-else-if="filteredValueBets.length === 0 && valueBetsSearchQuery.trim()"
        icon="search"
        title="Aucun résultat"
        :description="`Aucun value bet ne correspond à «${valueBetsSearchQuery.trim()}».`"
      />
      <EmptyState
        v-else-if="filteredValueBets.length === 0"
        icon="target"
        title="Aucun value bet détecté"
        description="Aucun edge positif sur la période choisie pour l'instant."
      />

      <div v-else class="value-bets-list">
        <div v-for="group in groupedValueBets" :key="group.league" class="value-bets-league">
          <p class="value-bets-league__header cm-truncate">
            <span v-if="parseLeagueLabel(group.league).countryCode" class="value-bets-league__country">{{ parseLeagueLabel(group.league).countryCode }}</span>
            {{ parseLeagueLabel(group.league).name }}
            <span class="cm-text-muted cm-numeric">{{ group.bets.length }}</span>
          </p>

          <div v-for="c in group.bets" :key="legKey(c)" class="value-bet-row-wrap">
            <label class="value-bet-row">
              <input type="checkbox" :checked="isSelected(c)" @change="toggleSelect(c)" />
              <div class="value-bet-row__main">
                <p class="value-bet-row__match cm-truncate">
                  <button type="button" class="cm-team-link" @click.stop.prevent="teamStatsModalStore.openFor(c.homeName, c.league, c.matchId)">{{ c.homeName }}</button>
                  vs
                  <button type="button" class="cm-team-link" @click.stop.prevent="teamStatsModalStore.openFor(c.awayName, c.league, c.matchId)">{{ c.awayName }}</button>
                </p>
                <p class="cm-text-muted value-bet-row__meta cm-truncate">
                  {{ c.market }} · {{ formatKickoff(c.commenceTime) }}
                  <MatchStatusBadge :commence-time="c.commenceTime" class="bets-row__status-badge" />
                </p>
                <p class="value-bet-row__pick cm-truncate">
                  {{ c.pick }}
                  <span class="value-bet-row__probability">{{ impliedProbability(c.modelOdds) }}%</span>
                </p>
              </div>
              <div class="value-bet-row__figures">
                <span class="cm-text-muted">modèle <span class="cm-numeric">{{ formatOdds(c.modelOdds) }}</span></span>
                <span class="cm-text-muted">marché <span class="cm-numeric">{{ formatOdds(c.odds) }}</span></span>
                <span class="cm-numeric cm-positive value-bet-row__edge">{{ c.edgePercent == null ? '—' : `+${c.edgePercent.toFixed(1)}%` }}</span>
                <span class="cm-text-muted">Kelly <span class="cm-numeric">{{ formatCurrency(c.recommendedStake) }}</span></span>
                <button
                  v-if="c.byBookmaker?.length"
                  type="button"
                  class="value-bet-row__toggle"
                  @click.stop.prevent="toggleBookmakers(c.matchId)"
                >
                  {{ c.byBookmaker.length }} bookmakers
                  <AppIcon
                    name="chevronRight"
                    :size="10"
                    class="value-bet-row__toggle-icon"
                    :class="{ 'value-bet-row__toggle-icon--open': expandedBookmakers.has(c.matchId) }"
                  />
                </button>
              </div>
            </label>

            <div v-if="expandedBookmakers.has(c.matchId) && c.byBookmaker?.length" class="bookmaker-detail">
              <span v-for="bk in c.byBookmaker" :key="bk.key" class="bookmaker-detail__item">
                {{ bk.title }} <span class="cm-numeric">{{ formatOdds(bk.odds1) }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppCard>

    <PicksSearchCard
      v-else-if="activeTab === 'safest'"
      title="Paris les plus probables"
      subtitle="Le pari le plus sûr (⌀ le plus bas ≥ 1.35) par marché et par match scanné"
      search-placeholder="Rechercher (équipe, marché, pick)…"
      :picks="activeSafestPicksPool"
      :scanning="scanning"
      :scanned="scanned"
      :is-selected="isSelected"
      :leg-key="legKey"
      empty-description="Aucun pari assez sûr trouvé sur la période scannée."
      @toggle="toggleSelect"
    />

    <PicksSearchCard
      v-else-if="activeTab === 'all'"
      title="Tous les paris"
      subtitle="Tous les pronostics du moteur, sans filtre — pour parier sur autre chose"
      search-placeholder="Rechercher (équipe, marché, pick)…"
      :picks="activeAllPicksPool"
      :scanning="scanning"
      :scanned="scanned"
      :is-selected="isSelected"
      :leg-key="legKey"
      empty-description="Aucun pronostic trouvé sur la période scannée."
      @toggle="toggleSelect"
    />
  </div>
</template>

<style scoped>
.my-bets-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.my-bets-view__summary {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}

.my-bets-view__stat {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: var(--cm-radius);
  background: var(--cm-surface-alt);
  font-size: 12px;
}

.my-bets-view__stat .cm-numeric {
  font-size: 15px;
  font-weight: 700;
}

.my-bets-view__tabs {
  display: flex;
  gap: 6px;
}

.my-bets-view__tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 15px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
  color: var(--cm-text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), border-color var(--cm-transition);
}

.my-bets-view__tab .cm-numeric {
  font-size: 10.5px;
  opacity: 0.8;
}

.my-bets-view__tab:hover {
  border-color: var(--cm-accent);
  color: var(--cm-text-primary);
}

.my-bets-view__tab--active {
  background: var(--cm-accent);
  border-color: var(--cm-accent);
  color: #06251b;
}

.value-bets__controls {
  display: grid;
  grid-template-columns: 1.4fr 1fr auto;
  gap: 14px;
  align-items: end;
}

.value-bets__date-filter {
  margin-top: 14px;
}

.value-bets__kelly-hint {
  font-size: 11px;
  margin-top: 12px;
}

.value-bets__kelly-hint :deep(a) {
  color: var(--cm-accent);
}

.value-bets__search {
  margin-bottom: 14px;
}

.value-bets-list {
  display: flex;
  flex-direction: column;
  max-height: 420px;
  overflow-y: auto;
}

.value-bets-league {
  border-bottom: 1px solid var(--cm-border-soft);
}

.value-bets-league:last-child {
  border-bottom: none;
}

.value-bets-league__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--cm-surface-alt);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.value-bets-league__header .cm-numeric {
  margin-left: auto;
  font-size: 10.5px;
  text-transform: none;
  letter-spacing: normal;
}

.value-bets-league__country {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  font-size: 9.5px;
}

.value-bet-row-wrap {
  border-bottom: 1px solid var(--cm-border-soft);
}

.value-bets-league .value-bet-row-wrap:last-child {
  border-bottom: none;
}

.value-bet-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  cursor: pointer;
}

.value-bet-row:hover {
  background: var(--cm-surface-hover);
}

.value-bet-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  accent-color: var(--cm-accent);
  cursor: pointer;
}

.value-bet-row__main {
  min-width: 0;
}

.value-bet-row__match {
  font-size: 13px;
  font-weight: 600;
}

.value-bet-row__meta {
  font-size: 11px;
  margin-top: 2px;
}

.value-bet-row__pick {
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 3px;
}

.value-bet-row__probability {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
  font-size: 10px;
  font-weight: 700;
  vertical-align: middle;
}

.value-bet-row__figures {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px 10px;
  font-size: 11.5px;
  flex-shrink: 0;
  max-width: 260px;
}

.value-bet-row__edge {
  font-weight: 700;
}

.value-bet-row__toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border: 1px solid var(--cm-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-muted);
  font-size: 10.5px;
  cursor: pointer;
}

.value-bet-row__toggle:hover {
  border-color: var(--cm-accent);
  color: var(--cm-accent);
}

.value-bet-row__toggle-icon {
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.value-bet-row__toggle-icon--open {
  transform: rotate(-90deg);
}

.bookmaker-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 8px 10px 38px;
}

.bookmaker-detail__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--cm-surface-alt);
  color: var(--cm-text-secondary);
  font-size: 10.5px;
}

.bet-slip {
  display: flex;
  align-items: end;
  gap: 14px;
  padding: 14px 20px;
  border-radius: var(--cm-radius-lg);
  background: var(--cm-accent-soft);
  border: 1px solid var(--cm-accent);
}

.bet-slip__title {
  font-size: 12.5px;
  font-weight: 600;
  flex: 1;
}

.bets-search {
  padding: 14px 16px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.bets-list {
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

.league-group__live {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  font-size: 10px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0.3px;
}

.league-group__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cm-danger);
  animation: cm-live-pulse 1.4s ease-in-out infinite;
}

.league-group__finished {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 10px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0.3px;
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

.bets-match-group {
  border-bottom: 1px solid var(--cm-border-soft);
}

.bets-match-group:last-child {
  border-bottom: none;
}

.bets-match-group__header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 16px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.bets-match-group__header:hover {
  background: var(--cm-surface-hover);
}

.bets-match-group__title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}

.bets-match-group__chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.bets-match-group__chevron--open {
  transform: rotate(-90deg);
}

.bets-match-group__live {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: none;
  border-radius: 999px;
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  font-size: 10px;
  font-family: inherit;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  cursor: pointer;
}

.bets-match-group__live:hover {
  background: var(--cm-danger);
  color: var(--cm-bg);
}

.bets-match-group__live:hover .bets-match-group__live-dot {
  background: var(--cm-bg);
}

.bets-match-group__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cm-danger);
  animation: cm-live-pulse 1.4s ease-in-out infinite;
}

.bets-match-group__finished {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

@keyframes cm-live-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.bets-match-group__live-panel {
  padding: 12px 16px 12px 28px;
  background: var(--cm-surface-alt);
  border-bottom: 1px solid var(--cm-border-soft);
  font-size: 11.5px;
}

.bets-match-group__live-score {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 8px;
}

.bets-row {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  align-items: center;
  gap: 8px 16px;
  padding: 10px 16px 10px 28px;
  border-bottom: 1px solid var(--cm-border-soft);
  border-left: 3px solid transparent;
}

.bet-legs {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
}

.bet-leg {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-alt);
}

.bet-leg__main {
  min-width: 0;
}

.bet-leg__match {
  font-size: 12px;
  font-weight: 600;
}

.bet-leg__market {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 2px;
}

.bet-leg__pick {
  font-size: 11.5px;
  font-weight: 600;
  margin-top: 2px;
  display: flex;
  gap: 8px;
}

.bet-leg__status {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.bet-leg__status--won {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.bet-leg__status--lost {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.bet-leg__status--pending {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.bet-leg__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bets-row:last-child {
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

.bets-row__match {
  font-size: 13.5px;
  font-weight: 600;
}

.bets-row__market {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-top: 3px;
}

.bets-row__pick {
  font-size: 12.5px;
  font-weight: 600;
  margin-top: 3px;
}

.bets-row__combo-hint {
  font-size: 11px;
  margin-top: 4px;
}

.bets-row__date {
  font-size: 10.5px;
  margin-top: 2px;
}

.bets-row__status-badge {
  margin-left: 6px;
  vertical-align: middle;
}

.bets-row__figures {
  display: flex;
  gap: 14px;
  font-size: 12.5px;
  min-width: 180px;
  justify-content: flex-end;
}

.bets-row__potential {
  color: var(--cm-accent);
  font-weight: 700;
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

@media (max-width: 960px) {
  .my-bets-view__summary {
    grid-template-columns: repeat(2, 1fr);
  }
  .value-bets__controls {
    grid-template-columns: 1fr;
  }
  .bets-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .bets-row__figures {
    justify-content: flex-start;
  }
  .bet-leg {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
