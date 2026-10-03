<script setup>
import { computed, ref, watch } from 'vue';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useMatchAiAnalysisStore } from '@/stores/matchAiAnalysisStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import { analysisApi } from '@/services/analysisApi.js';
import { matchesApi } from '@/services/matchesApi.js';
import { tour } from '@/utils/fotmobLabels.js';
import MatchCard from '@/components/matches/MatchCard.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import MatchupHeader from '@/components/matches/MatchupHeader.vue';
import MarketPicksBoard from '@/components/analysis/MarketPicksBoard.vue';
import { rencontreVueParEquipe } from '@/utils/rencontres.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import { useMatchStatus } from '@/composables/useMatchStatus.js';
import { useLineupPolling, compositionAttendue } from '@/composables/useLineupPolling.js';
import AppCard from '@/components/common/AppCard.vue';
import BackButton from '@/components/common/BackButton.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import MatchStatBars from '@/components/matches/MatchStatBars.vue';
import MatchInfoPanel from '@/components/matches/MatchInfoPanel.vue';
import MatchStatsPanel from '@/components/matches/MatchStatsPanel.vue';
import ResultPredictionCard from '@/components/analysis/ResultPredictionCard.vue';
import ScorePredictionCard from '@/components/analysis/ScorePredictionCard.vue';
import TeamNewsCard from '@/components/analysis/TeamNewsCard.vue';
import OddsProfilePanel from '@/components/analysis/OddsProfilePanel.vue';
import MatchAiAnalysisPanel from '@/components/analysis/MatchAiAnalysisPanel.vue';
import AiLineupSnapshot from '@/components/analysis/AiLineupSnapshot.vue';
import { TEAM_STAT_GROUPS } from '@/constants/matchDetailTabs.js';

/**
 * Page d'un match À VENIR, construite comme celle d'un match joué
 * (MatchDetailView.vue) : en-tête, onglets, barres de statistiques, bloc
 * « Rencontre ». Demande de Pierre le 01/10/2026 : « quand je clique sur un
 * match qui va se jouer, que les informations s'affichent comme ça, avec une
 * page qui s'ouvre ». Reprend tout ce que montrait le panneau de droite de la
 * page Matchs, qu'elle remplace.
 *
 * Ce qui se charge seul : l'analyse du moteur, exactement comme le clic
 * d'avant (avec le même repli API-Football pour une équipe inconnue du
 * magasin) ; la page FotMob du match (coup d'envoi exact, stade, météo,
 * arbitre, composition) ; moyennes et forme lues dans le magasin — ces trois
 * derniers gratuits. Le direct (API-Football) reste derrière un bouton.
 * Le bloc « Meilleures chances » (calcul de l'interface, en Poisson, trop
 * optimiste) a été retiré à la demande de Pierre le 01/10/2026 : les marchés
 * du moteur couvrent désormais corners et tirs.
 */
const props = defineProps({ matchId: { type: String, required: true } });

const matchesStore = useMatchesStore();
const aiStore = useMatchAiAnalysisStore();
const toastStore = useToastStore();
const teamStatsModalStore = useTeamStatsModalStore();
// Favoris (03/10/2026) : une étoile à côté de chaque club et du championnat.
const favoris = useFavoritesStore();

const tab = ref('resume');
const match = ref(null);
const introuvable = ref(false);
const chargement = ref(false);
const analyse = ref({ loading: false, error: null, result: null });
const page = ref({ loading: false, error: null, data: null }); // page FotMob du match
const moyennes = ref({ loading: false, home: null, away: null });
const forme = ref({ loading: false, home: [], away: [] });
const liveMatchDetails = ref(null);

const TABS = [
  { id: 'resume', label: 'Résumé' },
  { id: 'lineups', label: 'Compositions' },
  { id: 'stats', label: 'Statistiques' },
  { id: 'form', label: 'Forme' },
  { id: 'markets', label: 'Marchés' },
  { id: 'ai', label: 'Analyse IA' },
  { id: 'odds', label: 'Profilage de cotes' }
];
const availableTabs = computed(() => TABS.filter((t) => t.id !== 'odds' || match.value?.marketOdds?.odds1 > 1));

// Coup d'envoi : l'heure exacte publiée par FotMob ; à défaut celle des
// cotes. Un match du calendrier sans elle ne connaît que son jour (l'appli le
// date à midi UTC, cf. seasonCalendarAdapter.js côté serveur).
const duCalendrier = computed(() => String(match.value?.matchId ?? '').startsWith('cal-'));
const coupDEnvoi = computed(() => page.value.data?.kickoff ?? (duCalendrier.value ? null : match.value?.commenceTime ?? null));
const matchStatus = useMatchStatus(() => coupDEnvoi.value);
const meta = computed(() => page.value.data?.meta ?? null);
// FotMob donne un numéro (« 35 ») ; le calendrier, « Round 35 » ou « Journée 2 ».
const journee = computed(() => {
  const brut = String(meta.value?.round ?? match.value?.round ?? '');
  if (!brut) return null;
  return tour(/^\d+$/.test(brut) ? `Round ${brut}` : brut, match.value?.league);
});

const quand = computed(() => {
  if (coupDEnvoi.value) {
    return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(coupDEnvoi.value));
  }
  const jour = match.value?.commenceTime?.slice(0, 10);
  if (!jour) return null;
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${jour}T12:00:00Z`));
  return `${date} · heure à confirmer`;
});
const heure = computed(() =>
  coupDEnvoi.value ? new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(coupDEnvoi.value)) : null
);

const pronostic = computed(() => {
  const r = analyse.value.result;
  if (!r?.prediction) return null;
  const score = r.scorePrediction?.mostLikely;
  return {
    label: r.prediction.label,
    outcome: r.prediction.outcome ?? null,
    pct: Math.round(r.prediction.confidence * 100),
    score: score ? `${score.home}-${score.away}` : null
  };
});

const aiEntry = computed(() => aiStore.byMatchId[props.matchId] ?? null);

// Les moyennes de l'équipe qui reçoit À DOMICILE face à celles de l'équipe
// qui se déplace À L'EXTÉRIEUR : c'est ce match-là qui se joue.
const moyennesDuMatch = computed(() => ({
  home: moyennes.value.home?.stats?.homeAverages ?? moyennes.value.home?.stats?.averages ?? null,
  away: moyennes.value.away?.stats?.awayAverages ?? moyennes.value.away?.stats?.averages ?? null
}));
const moyennesDispo = computed(() => Boolean(moyennesDuMatch.value.home || moyennesDuMatch.value.away));

async function chargerMatch() {
  if (!matchesStore.matches.length) await matchesStore.fetchMatches();
  match.value = matchesStore.matches.find((m) => m.matchId === props.matchId) ?? null;
  // Un match du calendrier au-delà de la prochaine journée (ouvert depuis la
  // page d'une équipe) n'est pas dans la liste : le serveur le retrouve.
  if (!match.value) match.value = await matchesApi.getById(props.matchId, matchesStore.source, matchesStore.bankroll).catch(() => null);
  introuvable.value = !match.value;
}

async function chargerAnalyse() {
  analyse.value = { loading: true, error: null, result: null };
  try {
    const result = await analysisApi.analyzeMatchById(props.matchId, matchesStore.source, matchesStore.bankroll);
    analyse.value = { loading: false, error: null, result };
  } catch (error) {
    analyse.value = { loading: false, error: error.message, result: null };
  }
}

async function chargerPage() {
  const m = match.value;
  page.value = { ...page.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.preview({ home: m.home, away: m.away, league: m.league, commenceTime: m.commenceTime });
    page.value = { loading: false, error: null, data };
  } catch (error) {
    page.value = { loading: false, error: error.message, data: null };
  }
}

async function chargerMoyennes() {
  const m = match.value;
  moyennes.value = { loading: true, home: null, away: null };
  // Magasin seulement : jamais de repli payant au simple affichage de la page.
  const [home, away] = await Promise.allSettled([matchStatsApi.getTeamAverages(m.home, 10, m.league), matchStatsApi.getTeamAverages(m.away, 10, m.league)]);
  moyennes.value = { loading: false, home: home.status === 'fulfilled' ? home.value : null, away: away.status === 'fulfilled' ? away.value : null };
}

async function chargerForme() {
  const m = match.value;
  forme.value = { loading: true, home: [], away: [] };
  const [home, away] = await Promise.allSettled([matchStatsApi.listByTeam(m.home, 5, m.league), matchStatsApi.listByTeam(m.away, 5, m.league)]);
  forme.value = {
    loading: false,
    home: home.status === 'fulfilled' ? home.value.matches ?? [] : [],
    away: away.status === 'fulfilled' ? away.value.matches ?? [] : []
  };
}

async function load() {
  chargement.value = true;
  tab.value = 'resume';
  liveMatchDetails.value = null;
  try {
    await chargerMatch();
  } finally {
    chargement.value = false;
  }
  if (!match.value) return;
  // Chaque bloc arrive à son rythme : l'en-tête s'affiche tout de suite.
  chargerAnalyse();
  chargerPage();
  chargerMoyennes();
  chargerForme();
  aiStore.fetchStatus().catch(() => {});
  aiStore.fetchForMatch(props.matchId).catch(() => {});
}

watch(() => props.matchId, load, { immediate: true });

// Composition pas encore publiée et coup d'envoi proche : relue toutes les
// 5 min tant que l'onglet est ouvert, elle remplace la dernière alignée.
useLineupPolling(
  () => tab.value === 'lineups' && Boolean(page.value.data) && !page.value.data.lineups && compositionAttendue(coupDEnvoi.value),
  () => {
    if (!page.value.loading) chargerPage();
  }
);

async function lancerAnalyseIa() {
  if (!analyse.value.result) {
    toastStore.error("L'analyse du moteur n'est pas encore chargée.");
    return;
  }
  const m = match.value;
  try {
    await aiStore.runPreMatch(props.matchId, { home: m.home, away: m.away, league: m.league, engineResult: analyse.value.result });
  } catch (error) {
    toastStore.error(`Analyse IA impossible : ${error.message}`);
  }
}

// Score et statistiques en direct : appel API-Football, seulement sur clic.
async function voirLeDirect() {
  liveMatchDetails.value = { loading: true, error: null, data: null };
  try {
    const data = await teamStatsApi.getLiveMatchByName(match.value.home, coupDEnvoi.value ?? match.value.commenceTime);
    liveMatchDetails.value = { loading: false, error: null, data };
  } catch (error) {
    liveMatchDetails.value = { loading: false, error: error.message, data: null };
  }
}

const cote = (x) => (Number.isFinite(Number(x)) && Number(x) > 1 ? Number(x).toFixed(2) : '—');
// Corners, tirs et tirs cadrés attendus par le moteur (cf. statMarkets.js côté serveur).
const attendus = computed(() => {
  const e = analyse.value.result?.statExpectations;
  if (!e) return [];
  return [
    ['corners', 'Corners'],
    ['shots', 'Tirs'],
    ['shotsOnTarget', 'Tirs cadrés']
  ]
    .filter(([k]) => e[k])
    .map(([k, label]) => ({ cle: k, label, ...e[k] }));
});
// Les mêmes chiffres en barres face à face (MatchStatBars, comme l'onglet
// Statistiques), le total du match dans le libellé.
const attendusBarres = computed(() => ({
  group: { title: 'Attendus', rows: attendus.value.map((a) => ({ key: a.cle, label: `${a.label} · ${nombre1(a.total)} au total`, decimals: 1 })) },
  home: Object.fromEntries(attendus.value.map((a) => [a.cle, a.home])),
  away: Object.fromEntries(attendus.value.map((a) => [a.cle, a.away]))
}));
const nombre1 = (x) => (Number.isFinite(Number(x)) ? Number(x).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : '—');
const pariConseille = computed(() => {
  const s = analyse.value.result?.staking;
  return s?.action === 'RECOMMENDED' ? s : null;
});
const issues = computed(() => ({ home: `${match.value?.home} gagne`, draw: 'Match nul', away: `${match.value?.away} gagne` }));
</script>

<template>
  <div class="upcoming cm-page">
    <BackButton fallback="/matches" />
    <LoadingSpinner v-if="chargement" label="Chargement du match…" />
    <EmptyState
      v-else-if="introuvable"
      icon="alert"
      title="Match introuvable"
      description="Ce match n'est plus dans la liste des matchs à venir : déjà joué, reporté ou retiré par la source."
    />

    <template v-else-if="match">
      <!-- 1. LE BANDEAU : compétition et journée, les deux clubs face à face autour du
           coup d'envoi, la date et le stade, le pronostic du moteur en puce. -->
      <section class="cm-hero upcoming__hero">
        <div class="cm-hero__top">
          <span class="cm-hero__chips">
            <span class="cm-eyebrow upcoming__eyebrow"><AppIcon name="matches" :size="12" />Match à venir</span>
            <span class="upcoming__league-wrap">
              <span class="cm-chip upcoming__league"><LeagueBadge :league="match.league" /></span>
              <FavoriteStar
                :active="favoris.isFavoriteLeague(match.league)"
                kind="league"
                :label="match.league"
                :size="13"
                @toggle="favoris.toggleLeague(match.league)"
              />
            </span>
            <span v-if="journee" class="cm-chip"><AppIcon name="calendar" :size="11" />{{ journee }}</span>
          </span>
          <span v-if="matchStatus === 'live'" class="cm-chip is-danger upcoming__live"><span class="cm-live-dot"></span>En cours</span>
        </div>

        <div class="upcoming__matchup">
          <div class="upcoming__club is-home">
            <FavoriteStar
              :active="favoris.isFavoriteTeam(match.home, match.league)"
              :label="match.home"
              :size="16"
              class="upcoming__fav"
              @toggle="favoris.toggleTeam({ name: match.home, league: match.league })"
            />
            <button type="button" class="cm-team-link upcoming__team" @click="teamStatsModalStore.openFor(match.home, match.league, match.matchId)">
              {{ match.home }}
            </button>
            <TeamCrest :name="match.home" :league="match.league" :size="44" />
          </div>
          <span class="cm-pill is-strong upcoming__kickoff" :class="{ 'is-vs': !heure }">{{ heure ?? 'vs' }}</span>
          <div class="upcoming__club is-away">
            <TeamCrest :name="match.away" :league="match.league" :size="44" />
            <button type="button" class="cm-team-link upcoming__team" @click="teamStatsModalStore.openFor(match.away, match.league, match.matchId)">
              {{ match.away }}
            </button>
            <FavoriteStar
              :active="favoris.isFavoriteTeam(match.away, match.league)"
              :label="match.away"
              :size="16"
              class="upcoming__fav"
              @toggle="favoris.toggleTeam({ name: match.away, league: match.league })"
            />
          </div>
        </div>

        <div class="upcoming__foot">
          <p v-if="quand || meta?.stadium" class="cm-hero__subtitle upcoming__when">
            <AppIcon name="clock" :size="13" />
            <span>{{ quand }}<template v-if="meta?.stadium"> · {{ meta.stadium }}</template><template v-if="meta?.city">, {{ meta.city }}</template></span>
          </p>
          <p v-if="pronostic" class="upcoming__pick">
            <span class="upcoming__pick-label"><AppIcon name="target" :size="12" />Pronostic du moteur :</span>
            <span class="upcoming__pick-name">
              <PickCrest :side="pronostic.outcome" :item="pronostic.label" :home="match.home" :away="match.away" :league="match.league" :size="18" /><strong>{{ pronostic.label }}</strong>
            </span>
            <span class="cm-pill is-section upcoming__pick-pct">{{ pronostic.pct }} %</span>
            <template v-if="pronostic.score">
              <span class="upcoming__pick-sep">·</span>
              <span class="upcoming__pick-score">score le plus probable <span class="cm-pill">{{ pronostic.score }}</span></span>
            </template>
          </p>
        </div>
      </section>

      <!-- 2. LES ONGLETS : barre segmentée, l'actif en couleur de section (même dessin que TabbedView). -->
      <nav class="upcoming__tabs" role="tablist">
        <button v-for="t in availableTabs" :key="t.id" type="button" role="tab" :class="{ 'is-active': tab === t.id }" :aria-selected="tab === t.id" @click="tab = t.id">
          {{ t.label }}
        </button>
      </nav>

      <!-- RÉSUMÉ -->
      <template v-if="tab === 'resume'">
        <LoadingSpinner v-if="analyse.loading" label="Analyse du moteur…" />
        <EmptyState v-else-if="analyse.error" icon="alert" title="Analyse du moteur impossible" :description="analyse.error" />
        <div v-else-if="analyse.result" class="upcoming__grid cm-stagger">
          <ResultPredictionCard :result="analyse.result" />
          <ScorePredictionCard :result="analyse.result" />
        </div>

        <AppCard title="Meilleures statistiques" subtitle="Moyennes par match sur les 10 dernières rencontres." icon="barChart">
          <MatchupHeader :home="match.home" :away="match.away" :league="match.league" home-note="à domicile" away-note="à l'extérieur" label="10 derniers" />
          <LoadingSpinner v-if="moyennes.loading" label="Moyennes des deux équipes…" />
          <MatchStatBars v-else-if="moyennesDispo" :group="TEAM_STAT_GROUPS[0]" :home="moyennesDuMatch.home ?? {}" :away="moyennesDuMatch.away ?? {}" />
          <EmptyState v-else icon="trendUp" title="Aucune statistique" description="Aucune statistique importée pour ces équipes." />
        </AppCard>

        <TeamNewsCard v-if="analyse.result" :result="analyse.result" />

        <AppCard v-if="meta && (meta.stadium || meta.referee || meta.weather)" title="Rencontre" subtitle="Stade, arbitre et météo publiés par FotMob." icon="mapPin">
          <MatchInfoPanel :meta="meta" />
        </AppCard>

        <AppCard v-if="matchStatus === 'live'" title="En direct" subtitle="Score et statistiques en cours de match (API-Football, sur demande)." icon="bolt">
          <AppButton v-if="!liveMatchDetails" variant="primary" size="sm" @click="voirLeDirect">
            <template #icon><AppIcon name="bolt" :size="14" /></template>
            Voir le direct
          </AppButton>
          <LoadingSpinner v-else-if="liveMatchDetails.loading" label="Score et statistiques en direct…" />
          <div v-else-if="liveMatchDetails.error" class="cm-note is-danger">
            <span class="cm-icon-box is-danger"><AppIcon name="alert" :size="16" /></span>
            <div>
              <p class="cm-note__title">Direct indisponible</p>
              <p class="cm-note__text">Erreur : {{ liveMatchDetails.error }}</p>
            </div>
          </div>
          <div v-else-if="!liveMatchDetails.data?.available" class="cm-note">
            <span class="cm-icon-box is-muted"><AppIcon name="info" :size="16" /></span>
            <div>
              <p class="cm-note__title">Direct</p>
              <p class="cm-note__text">Détails en direct indisponibles pour ce match.</p>
            </div>
          </div>
          <template v-else>
            <div class="upcoming__live-board">
              <span class="cm-chip is-danger"><span class="cm-live-dot"></span>Direct</span>
              <p class="upcoming__live-score cm-numeric">{{ liveMatchDetails.data.score.home ?? '—' }} - {{ liveMatchDetails.data.score.away ?? '—' }}</p>
            </div>
            <MatchStatsPanel
              v-if="liveMatchDetails.data.teams?.length"
              :teams="liveMatchDetails.data.teams"
              :fallback-primary-name="match.home"
              :fallback-opponent-name="match.away"
              :league="match.league"
            />
          </template>
        </AppCard>
      </template>

      <!-- COMPOSITIONS -->
      <AppCard v-else-if="tab === 'lineups'" title="Compositions" subtitle="Le onze de chaque équipe, publié par FotMob ; à défaut, le dernier aligné." icon="users">
        <template #actions>
          <AppButton variant="secondary" size="sm" :loading="page.loading" @click="chargerPage">
            <template #icon><AppIcon name="refresh" :size="14" /></template>
            Relire chez FotMob
          </AppButton>
        </template>
        <LoadingSpinner v-if="page.loading && !page.data" label="Lecture de la composition…" />
        <EmptyState v-else-if="page.error" icon="alert" title="Composition indisponible" :description="page.error" />
        <AiLineupSnapshot v-else-if="page.data?.lineups" :snapshot="page.data.lineups" pitch />
        <template v-else-if="page.data?.lastLineups">
          <div class="cm-note is-warning upcoming__lineup-note">
            <span class="cm-icon-box is-warning"><AppIcon name="users" :size="16" /></span>
            <div>
              <p class="cm-note__title">Dernière composition alignée</p>
              <p class="cm-note__text">FotMob n'a pas encore publié le onze de ce match : voici le dernier aligné par chaque équipe, relu toutes les 5 minutes à l'approche du coup d'envoi.</p>
            </div>
          </div>
          <AiLineupSnapshot :snapshot="page.data.lastLineups" pitch />
        </template>
        <EmptyState
          v-else-if="!page.data?.available"
          icon="matches"
          title="Match introuvable chez FotMob"
          description="FotMob ne liste pas encore ce match : ni composition, ni stade, ni arbitre pour l'instant."
        />
        <EmptyState
          v-else
          icon="matches"
          title="Composition pas encore publiée"
          description="FotMob publie les compositions officielles en général une heure avant le coup d'envoi (parfois une prévision la veille pour les grosses affiches)."
        />
      </AppCard>

      <!-- STATISTIQUES -->
      <template v-else-if="tab === 'stats'">
        <!-- Ce que le moteur attend pour CE match (déplacé de l'onglet Marchés le 01/10/2026). -->
        <AppCard
          v-if="attendus.length"
          title="Corners et tirs attendus"
          subtitle="Ce que chaque équipe produit et ce que l'adversaire concède sur leurs 10 derniers matchs, corrigé de l'avantage du terrain."
          icon="target"
          eyebrow="Le moteur"
        >
          <MatchupHeader :home="match.home" :away="match.away" :league="match.league" label="par match" />
          <MatchStatBars :group="attendusBarres.group" :home="attendusBarres.home" :away="attendusBarres.away" />
        </AppCard>
        <LoadingSpinner v-if="moyennes.loading" label="Moyennes des deux équipes…" />
        <EmptyState v-else-if="!moyennesDispo" icon="trendUp" title="Aucune statistique" description="Aucune statistique importée pour ces équipes." />
        <template v-else>
          <p class="cm-section-title upcoming__stats-title">
            Moyennes par match
            <span class="cm-section-title__hint">sur les 10 dernières rencontres.</span>
          </p>
          <div class="upcoming__stats cm-stagger">
            <AppCard v-for="group in TEAM_STAT_GROUPS" :key="group.title" :title="group.title" icon="barChart">
              <MatchupHeader :home="match.home" :away="match.away" :league="match.league" home-note="à domicile" away-note="à l'extérieur" :size="22" />
              <MatchStatBars :group="group" :home="moyennesDuMatch.home ?? {}" :away="moyennesDuMatch.away ?? {}" />
            </AppCard>
          </div>
        </template>
      </template>

      <!-- FORME -->
      <template v-else-if="tab === 'form'">
        <LoadingSpinner v-if="forme.loading" label="Derniers matchs…" />
        <div v-else class="upcoming__grid cm-stagger">
          <AppCard v-for="camp in ['home', 'away']" :key="camp" :title="`${camp === 'home' ? match.home : match.away} — 5 derniers matchs`" icon="activity">
            <EmptyState v-if="!forme[camp].length" icon="matches" title="Aucun match importé" description="Aucun match importé pour cette équipe." />
            <div v-else class="upcoming__cards">
              <MatchCard
                v-for="m in forme[camp]"
                :key="m.matchId"
                :match="rencontreVueParEquipe(m, camp === 'home' ? match.home : match.away)"
                :to="`/match/${m.matchId}`"
                variant="compact"
                :show-competition="false"
              />
            </div>
          </AppCard>
        </div>
      </template>

      <!-- MARCHÉS -->
      <template v-else-if="tab === 'markets'">
        <LoadingSpinner v-if="analyse.loading" label="Analyse du moteur…" />
        <EmptyState v-else-if="analyse.error" icon="alert" title="Analyse du moteur impossible" :description="analyse.error" />
        <template v-else-if="analyse.result">
          <AppCard
            title="Pronostics du moteur, marché par marché"
            subtitle="L'issue la plus probable de chaque marché parmi celles cotées au moins 1,20. Corners et tirs : modèle vérifié sur 36 400 matchs passés, probabilités justes à un point près."
            icon="layers"
            eyebrow="Le moteur"
          >
            <!-- Le pari conseillé : une carte soulignée de la couleur d'accent (value = positif, quelle que soit la section). -->
            <div v-if="pariConseille" class="upcoming__advice">
              <span class="cm-icon-box is-accent"><AppIcon name="bolt" :size="17" /></span>
              <PickCrest v-if="pariConseille.outcome !== 'draw'" :side="pariConseille.outcome" :home="match.home" :away="match.away" :league="match.league" :size="30" class="upcoming__advice-crest" />
              <span v-else class="upcoming__advice-duo">
                <TeamCrest :name="match.home" :league="match.league" :size="24" />
                <TeamCrest :name="match.away" :league="match.league" :size="24" class="upcoming__advice-duo-away" />
              </span>
              <span class="upcoming__advice-text">
                <span class="upcoming__advice-label">Pari conseillé par le moteur</span>
                <strong class="upcoming__advice-pick">{{ issues[pariConseille.outcome] ?? pariConseille.outcome }}</strong>
                <span v-if="pariConseille.bookmakerTitle || pariConseille.stake" class="upcoming__advice-where">
                  <template v-if="pariConseille.bookmakerTitle">chez {{ pariConseille.bookmakerTitle }}</template>
                  <template v-if="pariConseille.stake"> · mise {{ pariConseille.stake }}</template>
                </span>
              </span>
              <span class="upcoming__advice-odds cm-numeric" title="Cote affichée par le bookmaker">{{ cote(pariConseille.displayedOdds ?? pariConseille.odds) }}</span>
            </div>
            <MarketPicksBoard :predictions="analyse.result.marketPredictions ?? []" :match="match" :views="aiEntry?.analysis?.marketViews ?? []" />
          </AppCard>
        </template>
      </template>

      <!-- ANALYSE IA -->
      <AppCard v-else-if="tab === 'ai'" title="Analyse IA" subtitle="La lecture du match par l'IA, marché par marché, à partir des pronostics du moteur." icon="sparkles">
        <MatchAiAnalysisPanel
          :connected="aiStore.connected"
          :running="aiStore.running"
          :entry="aiEntry"
          :has-result="false"
          @run-pre-match="lancerAnalyseIa"
        />
      </AppCard>

      <!-- PROFILAGE DE COTES -->
      <AppCard v-else-if="tab === 'odds'" title="Profilage de cotes" subtitle="Comment ont fini les matchs passés cotés comme celui-ci." icon="percent">
        <OddsProfilePanel :match="match" />
      </AppCard>
    </template>
  </div>
</template>

<style scoped>
.upcoming {
  /* La page se règle sur SA largeur : les deux colonnes n'apparaissent que si la place existe. */
  container: upcoming / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.upcoming__hero {
  container: upchero / inline-size;
  gap: 18px;
}

.upcoming__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}

/* La compétition (drapeau + nom) dans une puce : son nom au calibre des puces. */
.upcoming__league {
  padding-left: 5px;
}

/* La puce du championnat et son étoile de favori. */
.upcoming__league-wrap {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

/* L'étoile d'un club, contre son nom : le club et son étoile ne font qu'un. */
.upcoming .upcoming__fav {
  margin: 0 -8px;
}

.upcoming__league :deep(.league-badge__name) {
  font-size: 11.5px;
}

.upcoming__live {
  align-self: center;
}

/* Les deux clubs face à face, le coup d'envoi au centre. */
.upcoming__matchup {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 18px;
  padding: 4px 0;
}

.upcoming__club {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.upcoming__club.is-home {
  justify-content: flex-end;
  text-align: right;
}

.upcoming__team {
  min-width: 0;
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.upcoming__kickoff {
  min-width: 84px;
  padding: 7px 18px;
  font-size: 22px;
  letter-spacing: 0.5px;
  box-shadow: var(--cm-shadow-sm);
}

.upcoming__kickoff.is-vs {
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  box-shadow: none;
}

/* Sous les clubs : la date et le stade à gauche, le pronostic du moteur à droite. */
.upcoming__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 18px;
}

.upcoming__when {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.upcoming__when :deep(svg) {
  flex-shrink: 0;
  color: var(--cm-section);
}

.upcoming__pick {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin: 0;
  padding: 6px 12px 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(var(--cm-section-rgb) / 0.22);
  background: rgba(var(--cm-section-rgb) / 0.06);
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.upcoming__pick-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-section);
}

.upcoming__pick-name {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 13.5px;
  color: var(--cm-text-primary);
}

.upcoming__pick-pct {
  min-width: 0;
}

.upcoming__pick-sep {
  color: var(--cm-text-muted);
}

.upcoming__pick-score {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* ------------------------------------------------------------ onglets */
/* Même dessin que TabbedView (barre segmentée, l'actif en couleur de section) :
   la page garde ses propres boutons pour ne perdre aucune donnée des onglets. */
.upcoming__tabs {
  display: inline-flex;
  flex-wrap: wrap;
  align-self: flex-start;
  gap: 3px;
  max-width: 100%;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.upcoming__tabs button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 15px;
  border-radius: 999px;
  border: 0;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.upcoming__tabs button:hover {
  color: var(--cm-text-primary);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
}

.upcoming__tabs button.is-active {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

/* ------------------------------------------------------------ contenu */
.upcoming__grid,
.upcoming__stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.upcoming__stats-title {
  margin-top: 4px;
}

.upcoming__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upcoming__lineup-note {
  margin-bottom: 14px;
}

/* Le score en direct : gros, à côté du point rouge qui pulse. */
.upcoming__live-board {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.upcoming__live-score {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--cm-text-primary);
}

/* Le pari conseillé : icône, logo, le pari en gras, la cote en pastille pleine. */
.upcoming__advice {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-accent-rgb) / 0.35);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-accent-rgb) / 0.12), transparent 55%),
    var(--cm-surface-alt);
}

.upcoming__advice .upcoming__advice-crest {
  margin-right: 0;
}

.upcoming__advice-duo {
  display: inline-flex;
  align-items: center;
}

.upcoming__advice-duo-away {
  margin-left: -7px;
}

.upcoming__advice-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.upcoming__advice-label {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-accent);
}

.upcoming__advice-pick {
  font-size: 15px;
  color: var(--cm-text-primary);
}

.upcoming__advice-where {
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.upcoming__advice-odds {
  padding: 5px 13px;
  border-radius: 999px;
  background: var(--cm-accent);
  color: var(--cm-text-on-accent);
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
}

/* ------------------------------------------------------ largeurs */
/* Assez de place : pronostics, forme et groupes de statistiques sur deux colonnes. */
@container upcoming (min-width: 900px) {
  .upcoming__grid,
  .upcoming__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Bandeau étroit : chaque club en colonne (logo au-dessus du nom), l'heure entre les deux. */
@container upchero (max-width: 600px) {
  .upcoming__matchup {
    gap: 10px;
  }

  .upcoming__club,
  .upcoming__club.is-home {
    flex-direction: column;
    justify-content: flex-start;
    gap: 8px;
    text-align: center;
  }

  .upcoming__club.is-home {
    flex-direction: column-reverse;
  }

  .upcoming__team {
    font-size: 14.5px;
  }

  .upcoming__kickoff {
    min-width: 68px;
    padding: 5px 12px;
    font-size: 17px;
  }

  .upcoming__foot {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
