<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
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
import MatchCard from '@/components/matches/MatchCard.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import MatchStatusBadge from '@/components/common/MatchStatusBadge.vue';
import MatchStatsPanel from '@/components/matches/MatchStatsPanel.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TabbedView from '@/components/common/TabbedView.vue';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { formatOdds, formatCurrency, formatPercent, formatDateTime, formatKickoff } from '@/utils/format.js';

/**
 * Mes paris — refonte visuelle du 01/10/2026 (cf. ui/DESIGN.md) : un bandeau
 * avec les chiffres de la bankroll, le bordereau de sélection en carte
 * collante couleur de section, le scanner en rangée de commandes, puis les
 * listes (carnet, value bets, paris probables, tous les paris) en cartes par
 * championnat et par rencontre. La logique est strictement celle d'avant ;
 * seuls deux calculs de présentation ont été ajoutés (compte des paris en
 * attente, gain potentiel du bordereau).
 */
const route = useRoute();
const matchesStore = useMatchesStore();
const sourcesStore = useSourcesStore();
const betsStore = useBetsStore();
const predictionsStore = usePredictionsStore();
const toastStore = useToastStore();
const teamStatsModalStore = useTeamStatsModalStore();

const STATUS_LABELS = { pending: 'En attente', won: 'Gagné', lost: 'Perdu', void: 'Annulé' };

const pendingStake = computed(() => betsStore.bets.filter((bet) => bet.status === 'pending').reduce((sum, bet) => sum + bet.stake, 0));

// Présentation seulement : le nombre de paris en attente, pour la puce du bandeau.
const pendingBetsCount = computed(() => betsStore.bets.filter((bet) => bet.status === 'pending').length);

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
// Le match d'un groupe de paris au format de la carte de rencontre commune
// (MatchCard.vue, 01/10/2026) ; le clic sur la carte ouvre/ferme ses paris.
function carteDuMatch(matchGroup, league) {
  return {
    matchId: matchGroup.matchId,
    commenceTime: matchGroup.commenceTime ?? null,
    date: matchGroup.commenceTime ? String(matchGroup.commenceTime).slice(0, 10) : null,
    league,
    homeName: matchGroup.homeName,
    awayName: matchGroup.awayName,
    status: isMatchGroupLive(matchGroup) ? 'live' : isMatchGroupFinished(matchGroup) ? 'finished' : 'scheduled'
  };
}

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

// --- Value bets : matchs où l'un de VOS bookmakers paie une issue 1N2
// au-dessus de sa probabilité juste, fixée par les bookmakers de référence
// (Pinnacle s'il cote le match, sinon les paliers suivants), marge retirée
// (cf. fairFromBookmakers dans valueFinder.js côté serveur). Filtré par date comme la page Matchs,
// pour ne scanner que "aujourd'hui / cette semaine / etc." plutôt que tout
// charger d'un coup.
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
const TAB_VALUES = ['bankroll', 'value', 'safest', 'all'];
const activeTab = ref(TAB_VALUES.includes(route.query.onglet) ? route.query.onglet : 'bankroll');

const scanning = ref(false);
const scanned = ref(false);
// Un seul scan alimente TROIS listes distinctes et indépendamment
// cherchables, plutôt qu'une liste unique qui bascule entre value bets et
// repli sur les paris sûrs :
// - valueBets : une issue 1N2 que l'un de vos bookmakers paie au-dessus de
//   sa probabilité juste (cf. valueFinder.js côté serveur).
// - safestPicksPool : le pari le plus sûr par marché et par match (≥ 1.35,
//   cf. safestPicks.js) — "les plus probables" au sens intéressant à jouer.
// - allPicksPool : TOUS les pronostics du moteur, sans filtre de seuil —
//   pour parier sur autre chose que ce que les deux listes ci-dessus retiennent.
const valueBets = ref([]); // [{ matchId, homeName, awayName, league, commenceTime, market, pick, odds, modelOdds, edgePercent, recommendedStake, bookmaker, oddsField }]
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

      const pari = data.staking;
      if (pari?.action === 'RECOMMENDED' && (pari.displayedOdds ?? pari.odds) >= MIN_DISPLAYED_ODDS) {
        const CHAMPS = { home: 'odds1', draw: 'oddsDraw', away: 'odds2' };
        const LIBELLES = { home: `${match.home} gagne`, draw: 'Match nul', away: `${match.away} gagne` };
        foundValue.push({
          ...base,
          // Même marché que la prédiction "Résultat" ci-dessous (issue 1X2) —
          // même libellé obligatoire, sinon un pari ici et une prédiction
          // journalisée par ailleurs sur le même marché divergent en base
          // ('1N2' vs 'Résultat' coexistaient avant, bug confirmé en prod).
          market: 'Résultat',
          marketId: 'result',
          params: { outcome: pari.outcome },
          pick: LIBELLES[pari.outcome],
          // La cote du bookmaker qui paie le mieux, telle qu'il l'affiche.
          odds: pari.displayedOdds ?? pari.odds,
          bookmaker: pari.bookmakerTitle,
          modelOdds: pari.fairOdds,
          edgePercent: data.edgePercent,
          recommendedStake: pari.stake,
          oddsField: CHAMPS[pari.outcome],
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
      // Le marqueur « value bet » et l'avantage ne vont qu'au pronostic
      // « Résultat » qui porte sur l'issue réellement pariée : le pari value
      // peut viser le nul ou l'extérieur quand le pronostic dit domicile.
      for (const marketPrediction of marketPredictions) {
        const estResultat = marketPrediction.marketId === 'result';
        const issue = marketPrediction.predictedOutcome;
        const candidat = estResultat ? (pari?.candidates ?? []).find((c) => c.outcome === issue) : null;
        const surLePari = estResultat && pari?.action === 'RECOMMENDED' && pari.outcome === issue;
        predictionEntries.push({
          matchId: match.matchId,
          homeName: match.home,
          awayName: match.away,
          league: match.league,
          // Coup d'envoi : le règlement automatique retrouve ainsi le résultat
          // d'un match scanné plusieurs jours avant d'être joué.
          commenceTime: match.commenceTime ?? null,
          action: surLePari ? 'RECOMMENDED' : pari?.action === 'RECOMMENDED' ? 'PASS' : pari?.action ?? null,
          edgePercent: candidat ? Number((candidat.ev * 100).toFixed(2)) : null,
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

const TABS = computed(() => [
  { value: 'bankroll', label: 'Bankroll & carnet' },
  { value: 'value', label: 'Value bets détectées', count: activeValueBets.value.length },
  { value: 'safest', label: 'Paris les plus probables', count: activeSafestPicksPool.value.length },
  { value: 'all', label: 'Tous les paris', count: activeAllPicksPool.value.length }
]);

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
// match (le moteur ne retient que l'issue au meilleur avantage), donc pas
// besoin d'un sous-regroupement par rencontre en plus.
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

// Présentation seulement : ce que rapporterait le bordereau s'il passait
// (mise × cote cumulée), affiché à côté du bouton de validation.
const slipPotential = computed(() => (Number(slipStake.value) > 0 ? Number(slipStake.value) * combinedOdds.value : 0));

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
  <div class="my-bets-view cm-page">
    <!-- 1. LE BANDEAU : la bankroll d'un coup d'œil, quel que soit l'onglet. -->
    <section class="cm-hero bets-hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="bets-hero__logo"><AppIcon name="wallet" :size="16" /></span>
          Mes paris
        </h2>
        <div class="cm-hero__chips">
          <span class="cm-chip is-section"><AppIcon name="clock" :size="11" />{{ pendingBetsCount }} en attente</span>
          <span class="cm-chip"><AppIcon name="cards" :size="11" />{{ betsStore.bets.length }} paris au carnet</span>
        </div>
      </div>
      <p class="cm-hero__subtitle">Carnet de paris — simples et combinés : ce qui est misé, ce qui est revenu, et le rendement des paris réglés.</p>

      <div class="cm-kpis bets-hero__kpis">
        <div class="cm-kpi">
          <span class="cm-kpi__label">Misé (en attente)</span>
          <span class="cm-kpi__value">{{ formatCurrency(pendingStake) }}</span>
          <span class="cm-kpi__detail">paris non réglés</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Misé (réglés)</span>
          <span class="cm-kpi__value">{{ formatCurrency(betsStore.totalStaked) }}</span>
          <span class="cm-kpi__detail">gagnés, perdus, annulés</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Retours</span>
          <span class="cm-kpi__value">{{ formatCurrency(betsStore.totalReturned) }}</span>
          <span class="cm-kpi__detail">gains encaissés</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Profit net</span>
          <span class="cm-kpi__value" :class="betsStore.netProfit >= 0 ? 'cm-positive' : 'cm-negative'">
            {{ formatCurrency(betsStore.netProfit) }}
          </span>
          <span class="cm-kpi__detail">retours − mises réglées</span>
        </div>
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">ROI</span>
          <span class="cm-kpi__value" :class="(betsStore.roiPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">
            {{ betsStore.roiPercent === null ? '—' : formatPercent(betsStore.roiPercent, { showSign: true }) }}
          </span>
          <span class="cm-kpi__detail">sur les paris réglés</span>
        </div>
      </div>
    </section>

    <TabbedView v-model="activeTab" :tabs="TABS" query-param="onglet" />

    <!-- 2. LE BORDEREAU : collant, couleur de section, visible depuis n'importe quel onglet. -->
    <div v-if="selectedLegs.length" class="bet-slip">
      <div class="bet-slip__head">
        <span class="bet-slip__icon"><AppIcon name="cards" :size="15" /></span>
        <div class="bet-slip__titles">
          <p class="bet-slip__title">
            {{ selectedLegs.length }} sélection{{ selectedLegs.length > 1 ? 's' : '' }}
            <span v-if="selectedLegs.length > 1" class="bet-slip__combo">— combiné, cote {{ formatOdds(combinedOdds) }}</span>
          </p>
          <p class="bet-slip__hint">Gain potentiel <span class="cm-numeric bet-slip__potential">{{ formatCurrency(slipPotential) }}</span> · un seul pari par match</p>
        </div>
      </div>

      <div class="bet-slip__legs">
        <span v-for="leg in selectedLegs" :key="legKey(leg)" class="cm-chip bet-slip__leg" :title="`${leg.homeName} vs ${leg.awayName} · ${leg.market}`">
          <PickCrest :item="leg" :home="leg.homeName" :away="leg.awayName" :league="leg.league" :size="14" />
          <span class="cm-truncate">{{ leg.pick }}</span>
          <span class="cm-numeric bet-slip__leg-odds">@ {{ formatOdds(leg.odds) }}</span>
        </span>
      </div>

      <div class="bet-slip__form">
        <AppNumberField v-model="slipStake" label="Mise (€)" :min="1" class="bet-slip__stake" />
        <AppButton variant="primary" :loading="submittingSlip" :disabled="!slipStake || slipStake <= 0" @click="submitSlip">
          Valider {{ selectedLegs.length > 1 ? `le combiné (${selectedLegs.length})` : 'le pari' }}
        </AppButton>
      </div>
    </div>

    <Transition name="view" mode="out-in">
      <!-- 3. BANKROLL & CARNET : le scanner, puis les paris en cours. -->
      <div v-if="activeTab === 'bankroll'" key="bankroll" class="bets-tab">
        <AppCard icon="bolt" eyebrow="Scanner" title="Scanner les matchs" subtitle="Une seule analyse alimente les trois recherches : value bets, paris les plus probables, tous les paris">
          <div class="scanner">
            <div class="cm-toolbar scanner__toolbar">
              <AppSelect v-model="matchesStore.source" label="Source de données" :options="sourcesStore.options" class="scanner__source" />
              <AppNumberField v-model="matchesStore.bankroll" label="Bankroll" :min="0" :step="500" suffix="€" class="scanner__bankroll" />
              <AppButton variant="primary" :loading="scanning" @click="scanMatches">
                <template #icon><AppIcon name="bolt" :size="15" /></template>
                Scanner les matchs
              </AppButton>
            </div>

            <div class="scanner__period">
              <span class="scanner__period-label">Période</span>
              <MatchesFilterBar v-model="dateFilter" :available-dates="availableDates" />
            </div>

            <div class="cm-note">
              <span class="cm-icon-box is-sm"><AppIcon name="percent" :size="14" /></span>
              <div>
                <p class="cm-note__title">Mise conseillée</p>
                <p class="cm-note__text scanner__hint">
                  Mise conseillée = critère de Kelly fractionné sur la bankroll ci-dessus. Fraction de Kelly, seuils d'edge et mise
                  max réglables dans <RouterLink to="/reglages" class="scanner__link">Réglages du moteur</RouterLink>.
                </p>
              </div>
            </div>

            <div v-if="predictionsStore.recordError" class="cm-note is-danger">
              <span class="cm-icon-box is-sm is-danger"><AppIcon name="alert" :size="14" /></span>
              <div>
                <p class="cm-note__title">Historique moteur</p>
                <p class="cm-note__text">Pronostics du scan non enregistrés dans l'Historique moteur : {{ predictionsStore.recordError }}</p>
              </div>
            </div>
          </div>

          <!-- La puce de tête de carte (déclarée après le corps : sans incidence sur le rendu). -->
          <template #actions>
            <span class="cm-chip" title="Matchs à venir sur la période choisie"><AppIcon name="calendar" :size="11" />{{ dateFilteredMatches.length }} matchs sur la période</span>
          </template>
        </AppCard>

        <AppCard icon="wallet" eyebrow="Carnet" title="Paris en cours" subtitle="Les paris en attente d'un résultat ; un pari déjà réglé se retrouve par la recherche">
          <div class="ledger">
            <AppTextField v-model="betSearchQuery" placeholder="Rechercher un pari réglé (équipe, marché, pick)…">
              <template #icon><AppIcon name="search" :size="15" /></template>
            </AppTextField>

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
              description="Sélectionne un ou plusieurs value bets dans les onglets de recherche pour créer un pari, ou recherche un pari déjà réglé."
            />

            <div v-else class="ledger__list cm-stagger">
              <section v-for="leagueGroup in groupedBets" :key="leagueGroup.league" class="league" :class="{ 'is-open': isBetLeagueOpen(leagueGroup.league) }">
                <div
                  class="league__header"
                  role="button"
                  tabindex="0"
                  @click="toggleBetLeague(leagueGroup.league)"
                  @keydown.enter="toggleBetLeague(leagueGroup.league)"
                >
                  <LeagueBadge :league="leagueGroup.league" />
                  <span v-if="leagueGroup.matches.some(isMatchGroupLive)" class="cm-chip is-danger">
                    <span class="cm-live-dot"></span>{{ leagueGroup.matches.filter(isMatchGroupLive).length }} en direct
                  </span>
                  <span v-if="leagueGroup.matches.some(isMatchGroupFinished)" class="cm-chip is-warning">
                    {{ leagueGroup.matches.filter(isMatchGroupFinished).length }} terminé(s)
                  </span>
                  <span class="cm-pill league__count">{{ leagueGroup.count }}</span>
                  <AppIcon name="chevronRight" :size="14" class="chevron" :class="{ 'is-open': isBetLeagueOpen(leagueGroup.league) }" />
                </div>

                <template v-if="isBetLeagueOpen(leagueGroup.league)">
                <div class="league__body">
                  <div v-for="matchGroup in leagueGroup.matches" :key="matchGroup.matchId" class="match-group" :class="{ 'is-open': isBetMatchOpen(matchGroup.matchId) }">
                    <div
                      class="match-group__header"
                      role="button"
                      tabindex="0"
                      @click="toggleBetMatch(matchGroup.matchId)"
                      @keydown.enter="toggleBetMatch(matchGroup.matchId)"
                    >
                      <MatchCard
                        :match="carteDuMatch(matchGroup, leagueGroup.league)"
                        variant="compact"
                        :show-competition="false"
                        team-links
                        class="match-group__card"
                      >
                        <template #aside><span /></template>
                      </MatchCard>
                      <button
                        v-if="isMatchGroupLive(matchGroup)"
                        type="button"
                        class="match-group__live"
                        title="Voir le score et les statistiques en direct"
                        @click.stop="showLiveMatchDetails(matchGroup)"
                      >
                        <span class="cm-live-dot"></span>DIRECT
                      </button>
                      <span v-else-if="isMatchGroupFinished(matchGroup)" class="cm-chip is-warning">TERMINÉ</span>
                      <span class="cm-pill match-group__count" title="Paris sur ce match">{{ matchGroup.bets.length }}</span>
                      <AppIcon name="chevronRight" :size="14" class="chevron" :class="{ 'is-open': isBetMatchOpen(matchGroup.matchId) }" />
                    </div>

                    <!-- Le direct : score et statistiques du match, à la demande. -->
                    <div v-if="liveMatchDetailsByMatch[matchGroup.matchId]" class="live-panel">
                      <p v-if="liveMatchDetailsByMatch[matchGroup.matchId].loading" class="live-panel__state">Récupération du score et des statistiques…</p>
                      <p v-else-if="liveMatchDetailsByMatch[matchGroup.matchId].error" class="live-panel__state is-danger">Erreur : {{ liveMatchDetailsByMatch[matchGroup.matchId].error }}</p>
                      <p v-else-if="liveMatchDetailsByMatch[matchGroup.matchId].data && !liveMatchDetailsByMatch[matchGroup.matchId].data.available" class="live-panel__state">
                        {{ LIVE_MATCH_UNAVAILABLE_MESSAGES[liveMatchDetailsByMatch[matchGroup.matchId].data.reason] ?? 'Détails en direct indisponibles pour ce match.' }}
                      </p>
                      <template v-else-if="liveMatchDetailsByMatch[matchGroup.matchId].data?.available">
                        <p class="live-panel__score">
                          <span class="live-panel__pill cm-numeric">{{ liveMatchDetailsByMatch[matchGroup.matchId].data.score.home ?? '—' }} - {{ liveMatchDetailsByMatch[matchGroup.matchId].data.score.away ?? '—' }}</span>
                          <span v-if="liveMatchDetailsByMatch[matchGroup.matchId].data.status?.elapsed" class="live-panel__clock"> · {{ liveMatchDetailsByMatch[matchGroup.matchId].data.status.elapsed }}'</span>
                          <span v-if="liveMatchDetailsByMatch[matchGroup.matchId].data.status?.long" class="live-panel__clock"> · {{ liveMatchDetailsByMatch[matchGroup.matchId].data.status.long }}</span>
                        </p>
                        <MatchStatsPanel
                          v-if="liveMatchDetailsByMatch[matchGroup.matchId].data.teams?.length"
                          :teams="liveMatchDetailsByMatch[matchGroup.matchId].data.teams"
                          :fallback-primary-name="matchGroup.homeName"
                          :fallback-opponent-name="matchGroup.awayName"
                          :league="leagueGroup.league"
                        />
                        <p v-else class="live-panel__state">Statistiques détaillées pas encore publiées pour ce match.</p>
                      </template>
                    </div>

                    <template v-if="isBetMatchOpen(matchGroup.matchId)">
                    <div class="match-group__bets">
                      <article v-for="bet in matchGroup.bets" :key="bet.id" class="bet-card" :class="`is-${bet.status}`">
                        <div class="bet-card__head">
                          <div class="bet-card__main">
                            <template v-if="bet.legs.length === 1">
                              <p class="bet-card__market cm-truncate">{{ bet.legs[0].market }}</p>
                              <p class="bet-card__pick cm-truncate"><PickCrest :item="bet.legs[0]" :home="bet.legs[0].homeName" :away="bet.legs[0].awayName" :league="bet.legs[0].league" :size="16" />{{ bet.legs[0].pick }}</p>
                              <p v-if="matchKickoff(bet.legs[0])" class="bet-card__date">
                                <AppIcon name="calendar" :size="11" />Match le {{ formatKickoff(matchKickoff(bet.legs[0])) }}
                                <MatchStatusBadge v-if="bet.status === 'pending'" :commence-time="matchKickoff(bet.legs[0])" class="status-badge" />
                              </p>
                            </template>
                            <template v-else>
                              <p class="bet-card__market">Combiné</p>
                              <p class="bet-card__pick cm-truncate">Combiné — {{ bet.legs.length }} sélections</p>
                              <p class="bet-card__date">Statut global déduit des sélections ci-dessous</p>
                            </template>
                            <p class="bet-card__date"><AppIcon name="clock" :size="11" />Pari créé le {{ formatDateTime(bet.createdAt) }}</p>
                          </div>

                          <dl class="figures">
                            <div class="figure">
                              <dt>Cote</dt>
                              <dd><span class="cm-pill">@ {{ formatOdds(bet.odds) }}</span></dd>
                            </div>
                            <div class="figure">
                              <dt>Mise</dt>
                              <dd class="cm-numeric">{{ formatCurrency(bet.stake) }}</dd>
                            </div>
                            <div class="figure">
                              <dt>Gain potentiel</dt>
                              <dd class="cm-numeric figure__potential">{{ formatCurrency(bet.stake * bet.odds) }}</dd>
                            </div>
                          </dl>

                          <span class="bet-status" :class="`is-${bet.status}`">{{ STATUS_LABELS[bet.status] }}</span>

                          <div v-if="bet.legs.length === 1" class="bet-card__actions">
                            <template v-if="legStatus(bet, 0) === 'pending'">
                              <AppButton variant="ghost" size="sm" class="bet-card__btn is-won" @click="setLegStatus(bet, 0, 'won')">Gagné</AppButton>
                              <AppButton variant="ghost" size="sm" class="bet-card__btn is-lost" @click="setLegStatus(bet, 0, 'lost')">Perdu</AppButton>
                              <AppButton variant="ghost" size="sm" class="bet-card__btn" @click="setLegStatus(bet, 0, 'void')">Annulé</AppButton>
                            </template>
                            <AppButton v-else variant="ghost" size="sm" class="bet-card__btn" @click="setLegStatus(bet, 0, 'pending')">Réouvrir</AppButton>
                            <button type="button" class="bet-card__delete" title="Supprimer" @click="remove(bet)">
                              <AppIcon name="x" :size="14" />
                            </button>
                          </div>
                          <div v-else class="bet-card__actions">
                            <button type="button" class="bet-card__delete" title="Supprimer" @click="remove(bet)">
                              <AppIcon name="x" :size="14" />
                            </button>
                          </div>
                        </div>

                        <!-- Un combiné : ses sélections, chacune avec son statut et ses actions. -->
                        <div v-if="bet.legs.length > 1" class="bet-card__legs">
                          <div v-for="(leg, i) in bet.legs" :key="i" class="bet-leg" :class="`is-${legStatus(bet, i)}`">
                            <div class="bet-leg__main">
                              <p class="bet-leg__match">
                                <TeamCrest :name="leg.homeName" :league="leg.league" :size="16" />
                                <button type="button" class="cm-team-link team" @click.stop="teamStatsModalStore.openFor(leg.homeName, leg.league, leg.matchId)">{{ leg.homeName }}</button>
                                <span class="vs">vs</span>
                                <button type="button" class="cm-team-link team" @click.stop="teamStatsModalStore.openFor(leg.awayName, leg.league, leg.matchId)">{{ leg.awayName }}</button>
                                <TeamCrest :name="leg.awayName" :league="leg.league" :size="16" />
                              </p>
                              <p class="bet-leg__market cm-truncate">
                                {{ leg.market }} <span v-if="leg.league">· {{ leg.league }}</span><span v-if="matchKickoff(leg)"> · {{ formatKickoff(matchKickoff(leg)) }}</span>
                                <MatchStatusBadge v-if="legStatus(bet, i) === 'pending'" :commence-time="matchKickoff(leg)" class="status-badge" />
                              </p>
                              <p class="bet-leg__pick cm-truncate">
                                <PickCrest :item="leg" :home="leg.homeName" :away="leg.awayName" :league="leg.league" :size="14" />{{ leg.pick }}
                                <span class="cm-pill bet-leg__odds">@ {{ formatOdds(leg.odds) }}</span>
                              </p>
                            </div>
                            <span class="bet-status is-sm" :class="`is-${legStatus(bet, i)}`">{{ STATUS_LABELS[legStatus(bet, i)] }}</span>
                            <div class="bet-leg__actions">
                              <template v-if="legStatus(bet, i) === 'pending'">
                                <AppButton variant="ghost" size="sm" class="bet-card__btn is-won" @click="setLegStatus(bet, i, 'won')">Gagné</AppButton>
                                <AppButton variant="ghost" size="sm" class="bet-card__btn is-lost" @click="setLegStatus(bet, i, 'lost')">Perdu</AppButton>
                                <AppButton variant="ghost" size="sm" class="bet-card__btn" @click="setLegStatus(bet, i, 'void')">Annulé</AppButton>
                              </template>
                              <AppButton v-else variant="ghost" size="sm" class="bet-card__btn" @click="setLegStatus(bet, i, 'pending')">Réouvrir</AppButton>
                            </div>
                          </div>
                        </div>
                      </article>
                    </div>
                    </template>
                  </div>
                </div>
                </template>
              </section>
            </div>
          </div>
        </AppCard>
      </div>

      <!-- 4. VALUE BETS : une carte par pari, cote juste / cote du bookmaker / edge / Kelly. -->
      <AppCard
        v-else-if="activeTab === 'value'"
        key="value"
        icon="trendUp"
        eyebrow="Value bets"
        title="Value bets détectées"
        subtitle="Cote de vos bookmakers face à la cote juste des bookmakers de référence, Pinnacle d'abord, marge retirée"
      >
        <template #actions>
          <span v-if="scanned && filteredValueBets.length" class="cm-chip is-accent cm-numeric">{{ filteredValueBets.length }} value bets</span>
        </template>

        <div class="picks">
          <AppTextField v-model="valueBetsSearchQuery" placeholder="Rechercher (équipe, marché, pick)…">
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
            description="Aucun de vos bookmakers ne paie au-dessus de la cote juste sur la période choisie."
          />

          <div v-else class="picks__list cm-stagger">
            <section v-for="group in groupedValueBets" :key="group.league" class="league is-open">
              <!-- En-tête de championnat : drapeau et nom (LeagueBadge lit le pays et le nom via parseLeagueLabel). -->
              <p class="league__header is-static" :title="parseLeagueLabel(group.league).country ?? group.league">
                <LeagueBadge :league="group.league" />
                <span class="cm-pill league__count">{{ group.bets.length }}</span>
              </p>

              <div class="league__body">
                <div v-for="c in group.bets" :key="legKey(c)" class="vb">
                  <label class="vb-card" :class="{ 'is-selected': isSelected(c) }">
                    <input type="checkbox" class="pick-check" :checked="isSelected(c)" @change="toggleSelect(c)" />
                    <div class="vb-card__main">
                      <p class="vb-card__match">
                        <TeamCrest :name="c.homeName" :league="c.league" :size="18" />
                        <button type="button" class="cm-team-link team" @click.stop.prevent="teamStatsModalStore.openFor(c.homeName, c.league, c.matchId)">{{ c.homeName }}</button>
                        <span class="vs">vs</span>
                        <button type="button" class="cm-team-link team" @click.stop.prevent="teamStatsModalStore.openFor(c.awayName, c.league, c.matchId)">{{ c.awayName }}</button>
                        <TeamCrest :name="c.awayName" :league="c.league" :size="18" />
                      </p>
                      <p class="vb-card__meta cm-truncate">
                        {{ c.market }} · {{ formatKickoff(c.commenceTime) }}
                        <MatchStatusBadge :commence-time="c.commenceTime" class="status-badge" />
                      </p>
                      <p class="vb-card__pick cm-truncate">
                        <PickCrest :item="c" :home="c.homeName" :away="c.awayName" :league="c.league" :size="16" />{{ c.pick }}
                        <span class="probability" title="Probabilité juste de l'issue">{{ impliedProbability(c.modelOdds) }}%</span>
                      </p>
                    </div>

                    <dl class="figures vb-card__figures">
                      <div class="figure">
                        <dt>Cote juste</dt>
                        <dd><span class="cm-pill">{{ formatOdds(c.modelOdds) }}</span></dd>
                      </div>
                      <div class="figure">
                        <dt class="cm-truncate" title="Le bookmaker qui paie le mieux cette issue">{{ c.bookmaker ?? 'marché' }}</dt>
                        <dd><span class="cm-pill is-section">{{ formatOdds(c.odds) }}</span></dd>
                      </div>
                      <div class="figure">
                        <dt>Edge</dt>
                        <dd class="cm-numeric cm-positive figure__edge">{{ c.edgePercent == null ? '—' : `+${c.edgePercent.toFixed(1)}%` }}</dd>
                      </div>
                      <div class="figure">
                        <dt>Kelly</dt>
                        <dd class="cm-numeric">{{ formatCurrency(c.recommendedStake) }}</dd>
                      </div>
                    </dl>

                    <button
                      v-if="c.byBookmaker?.length"
                      type="button"
                      class="vb-card__toggle"
                      title="Les cotes réelles de chaque bookmaker"
                      @click.stop.prevent="toggleBookmakers(c.matchId)"
                    >
                      {{ c.byBookmaker.length }} bookmakers
                      <AppIcon name="chevronRight" :size="10" class="chevron" :class="{ 'is-open': expandedBookmakers.has(c.matchId) }" />
                    </button>
                  </label>

                  <div v-if="expandedBookmakers.has(c.matchId) && c.byBookmaker?.length" class="bookmakers">
                    <span v-for="bk in c.byBookmaker" :key="bk.key" class="cm-chip bookmakers__item">
                      {{ bk.title }} <span class="cm-numeric bookmakers__odds">{{ formatOdds(bk[c.oddsField ?? 'odds1']) }}</span>
                    </span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </AppCard>

      <!-- 5 & 6. PARIS LES PLUS PROBABLES, TOUS LES PARIS : même carte de recherche. -->
      <PicksSearchCard
        v-else-if="activeTab === 'safest'"
        key="safest"
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
        key="all"
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
    </Transition>
  </div>
</template>

<style scoped>
/* ================================================================ bandeau */
.bets-hero__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--cm-section), rgba(var(--cm-section-rgb) / 0.6));
  color: var(--cm-section-on);
  box-shadow: var(--cm-shadow-section);
}

.bets-hero__kpis {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

/* Le ROI est la tuile vedette (liseré de section), mais son chiffre garde sa
   couleur sémantique : vert quand on gagne, rouge quand on perd. */
.bets-hero .cm-kpi.is-section .cm-kpi__value.cm-positive {
  color: var(--cm-accent);
}

.bets-hero .cm-kpi.is-section .cm-kpi__value.cm-negative {
  color: var(--cm-danger);
}

/* ============================================================== bordereau */
/* Collant sous la barre du haut : il suit quand on fait défiler les listes. */
.bet-slip {
  position: sticky;
  top: calc(var(--cm-topbar-height) + 10px);
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  padding: 14px 18px;
  border-radius: var(--cm-radius-lg);
  border: 1px solid rgba(var(--cm-section-rgb) / 0.5);
  background:
    radial-gradient(120% 160% at 0% 0%, rgba(var(--cm-section-rgb) / 0.2), transparent 55%),
    var(--cm-surface-raised);
  box-shadow: var(--cm-shadow-lg), var(--cm-shadow-section);
}

.bet-slip__head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.bet-slip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--cm-section), rgba(var(--cm-section-rgb) / 0.6));
  color: var(--cm-section-on);
  box-shadow: var(--cm-shadow-section);
}

.bet-slip__titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bet-slip__title {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
  white-space: nowrap;
}

.bet-slip__combo {
  font-weight: 600;
  color: var(--cm-section);
}

.bet-slip__hint {
  font-size: 11.5px;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

.bet-slip__potential {
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* Les sélections cochées, en puces : logo, pronostic, cote. */
.bet-slip__legs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1 1 260px;
  min-width: 0;
}

.bet-slip__leg {
  max-width: 100%;
  background: rgba(var(--cm-section-rgb) / 0.08);
  border-color: rgba(var(--cm-section-rgb) / 0.3);
  color: var(--cm-text-primary);
}

/* Dans une puce (flex), un texte ne se tronque que s'il peut rétrécir. */
.bet-slip__leg > .cm-truncate {
  min-width: 0;
}

.bet-slip__leg-odds {
  color: var(--cm-section);
}

.bet-slip__form {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-left: auto;
}

.bet-slip__stake {
  width: 120px;
}

/* ================================================================ onglets */
.bets-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ---------------------------------------------------------------- scanner */
.scanner {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scanner__source {
  flex: 1 1 240px;
}

.scanner__bankroll {
  flex: 0 1 160px;
}

.scanner__period {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
}

/* La barre de dates prend la place restante (ses raccourcis à gauche, la navigation par jour à droite). */
.scanner__period > :last-child {
  flex: 1;
  min-width: 0;
}

.scanner__period-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.scanner__hint {
  font-size: 12.5px;
}

.scanner__link {
  color: var(--cm-section);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ------------------------------------------------------ carnet, value bets */
/* Chaque liste se règle sur SA largeur. */
.ledger,
.picks {
  container: liste / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ledger__list,
.picks__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Un championnat : en-tête cliquable, corps en retrait. */
.league {
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  overflow: hidden;
  transition: border-color var(--cm-transition);
}

.league.is-open {
  border-color: rgba(var(--cm-section-rgb) / 0.3);
}

.league__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background var(--cm-transition);
}

.league__header:hover {
  background: var(--cm-surface-hover);
}

.league__header.is-static {
  cursor: default;
}

.league__header.is-static:hover {
  background: none;
}

.league.is-open .league__header {
  border-bottom: 1px solid var(--cm-border-soft);
}

.league__count {
  margin-left: auto;
  min-width: 34px;
  padding: 2px 8px;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.league__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transition: transform var(--cm-transition), color var(--cm-transition);
}

.chevron.is-open {
  transform: rotate(90deg);
  color: var(--cm-section);
}

/* ---------------------------------------------------------- une rencontre */
.match-group {
  display: flex;
  flex-direction: column;
}

.match-group__header {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.match-group__card {
  flex: 1;
  min-width: 0;
  --mcard-aside: 0px;
}

.match-group__count {
  min-width: 30px;
  padding: 2px 8px;
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.match-group__live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.4px;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.match-group__live:hover {
  background: var(--cm-danger);
  color: var(--cm-text-primary);
}

.match-group__live:hover .cm-live-dot {
  background: var(--cm-text-primary);
}

/* Les paris du match, reliés à sa carte par un filet couleur de section. */
.match-group__bets {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 8px 0 2px 14px;
  padding-left: 12px;
  border-left: 2px solid rgba(var(--cm-section-rgb) / 0.25);
}

/* Le direct : teinté rouge comme tout ce qui est en cours. */
.live-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 8px 0 2px 14px;
  padding: 12px 14px;
  border-radius: var(--cm-radius);
  border: 1px solid rgba(var(--cm-danger-rgb) / 0.3);
  background: radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-danger-rgb) / 0.08), transparent 55%), var(--cm-surface);
  font-size: 12px;
}

.live-panel__state {
  font-size: 12px;
  color: var(--cm-text-muted);
}

.live-panel__state.is-danger {
  color: var(--cm-danger);
}

.live-panel__score {
  display: flex;
  align-items: center;
  gap: 4px;
}

.live-panel__pill {
  padding: 3px 12px;
  border-radius: 999px;
  background: var(--cm-danger);
  color: var(--cm-text-primary);
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.live-panel__clock {
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------------ un pari */
.bet-card {
  --ton: var(--cm-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px 12px 16px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  border-left: 3px solid var(--ton);
  background: var(--cm-surface);
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.bet-card:hover {
  border-color: var(--cm-border);
  border-left-color: var(--ton);
  background: var(--cm-surface-hover);
}

.bet-card.is-pending {
  --ton: var(--cm-section);
}

.bet-card.is-won {
  --ton: var(--cm-accent);
}

.bet-card.is-lost {
  --ton: var(--cm-danger);
}

.bet-card__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: 10px 18px;
}

.bet-card__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.bet-card__market {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.bet-card__pick {
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.bet-card__date {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.status-badge {
  margin-left: 4px;
}

/* Les chiffres étiquetés (cote, mise, gain ; cote juste, edge, Kelly). */
.figures {
  display: flex;
  gap: 16px;
  margin: 0;
}

.figure {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  min-width: 0;
  max-width: 120px;
}

.figure dt {
  max-width: 100%;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.figure dd {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.figure__potential {
  font-size: 15px;
  color: var(--cm-accent);
}

.figure__edge {
  font-size: 15px;
}

/* Le statut d'un pari : pastille à point, couleurs sémantiques. */
.bet-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.bet-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.85;
}

.bet-status.is-pending {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.bet-status.is-won {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.bet-status.is-lost {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.bet-status.is-sm {
  padding: 2px 8px;
  font-size: 10px;
}

.bet-card__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Les boutons fantômes prennent la couleur de leur verdict au survol. */
.bet-card__btn.is-won:hover:not(:disabled) {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.bet-card__btn.is-lost:hover:not(:disabled) {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.bet-card__delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 4px;
  border: none;
  border-radius: var(--cm-radius-sm);
  background: transparent;
  color: var(--cm-text-muted);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.bet-card__delete:hover {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

/* Les sélections d'un combiné. */
.bet-card__legs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px dashed var(--cm-border-soft);
}

.bet-leg {
  --ton: var(--cm-border);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 10px 8px 12px;
  border-radius: var(--cm-radius-sm);
  border: 1px solid var(--cm-border-soft);
  border-left: 2px solid var(--ton);
  background: var(--cm-surface-alt);
}

.bet-leg.is-pending {
  --ton: var(--cm-section);
}

.bet-leg.is-won {
  --ton: var(--cm-accent);
}

.bet-leg.is-lost {
  --ton: var(--cm-danger);
}

.bet-leg__main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bet-leg__match,
.vb-card__match {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.vb-card__match {
  font-size: 13.5px;
}

.team {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vs {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.bet-leg__market {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.bet-leg__pick {
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.bet-leg__odds {
  min-width: 0;
  margin-left: 6px;
  padding: 1px 7px;
  font-size: 11px;
  vertical-align: middle;
}

.bet-leg__actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* ----------------------------------------------------------- value bet */
.vb {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vb-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px 18px;
  padding: 12px 14px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface);
  cursor: pointer;
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.vb-card:hover {
  border-color: var(--cm-border);
  background: var(--cm-surface-hover);
}

/* Coché : la carte prend la couleur de la section. */
.vb-card.is-selected {
  border-color: rgba(var(--cm-section-rgb) / 0.5);
  background: linear-gradient(90deg, var(--cm-section-soft), transparent 70%), var(--cm-surface);
}

.pick-check {
  width: 17px;
  height: 17px;
  margin: 0;
  accent-color: var(--cm-section);
  cursor: pointer;
}

.vb-card__main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.vb-card__meta {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.vb-card__pick {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* La probabilité juste, en vert comme l'anneau de l'onglet Analyse IA. */
.probability {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
  font-size: 10.5px;
  font-weight: 700;
  vertical-align: middle;
}

.vb-card__figures {
  gap: 14px;
}

.vb-card__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--cm-border);
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color var(--cm-transition), color var(--cm-transition), background var(--cm-transition);
}

.vb-card__toggle:hover {
  border-color: var(--cm-section);
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

/* Les cotes réelles de chaque bookmaker, en puces sous la carte. */
.bookmakers {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 4px 4px 41px;
}

.bookmakers__item {
  background: var(--cm-surface);
}

.bookmakers__odds {
  color: var(--cm-text-primary);
}

/* ======================================================== listes étroites */
/* Dans un panneau étroit : chiffres et actions passent sous le pronostic. */
@container liste (max-width: 760px) {
  .bet-card__head {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .bet-status {
    grid-column: 2;
    grid-row: 1;
  }

  .bet-card__head .figures {
    grid-column: 1 / -1;
    grid-row: 2;
    justify-content: flex-start;
  }

  .bet-card__head .figure {
    align-items: flex-start;
  }

  .bet-card__actions {
    grid-column: 1 / -1;
    grid-row: 3;
    flex-wrap: wrap;
    padding-top: 8px;
    border-top: 1px dashed var(--cm-border-soft);
  }

  .bet-leg {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .bet-leg__actions {
    grid-column: 1 / -1;
    flex-wrap: wrap;
  }

  .vb-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .vb-card__figures {
    grid-column: 2;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .vb-card__figures .figure {
    align-items: flex-start;
  }

  .vb-card__toggle {
    grid-column: 2;
    justify-self: start;
  }

  .bookmakers {
    padding-left: 4px;
  }

  .match-group__bets,
  .live-panel {
    margin-left: 6px;
    padding-left: 8px;
  }
}

/* Sur un petit écran, le bordereau empile ses trois parties. */
@media (max-width: 720px) {
  .bet-slip__form {
    width: 100%;
    margin-left: 0;
  }

  .bet-slip__stake {
    flex: 1;
    width: auto;
  }

  .bet-slip__title,
  .bet-slip__hint {
    white-space: normal;
  }
}
</style>
