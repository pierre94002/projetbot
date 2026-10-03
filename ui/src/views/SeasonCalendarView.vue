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
import MatchCard from '@/components/matches/MatchCard.vue';
import { formatDay, formatShortDay } from '@/utils/format.js';

// Calendrier de saison (joués + à venir), alimenté depuis FotMob par
// l'actualisation automatique de l'appli (server/src/jobs/matchStatsAutoRefresh.js) —
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
  { value: 'finished', label: 'Terminés' },
  { value: 'postponed', label: 'Reportés' }
];

// Saison consultée. Le calendrier contient désormais plusieurs saisons
// d'historique : on en charge une à la fois plutôt que des dizaines de
// milliers de rencontres d'un bloc.
const season = ref('');
const seasons = ref([]);
const currentSeason = ref('');

/** Hors saison en cours, les en-têtes de jour portent l’année. */
const isCurrentSeason = computed(() => !season.value || season.value === currentSeason.value);

const seasonOptions = computed(() =>
  seasons.value.map((s) => ({
    value: s.season,
    label: `${s.season} — ${s.matches.toLocaleString('fr-FR')} rencontres`
  }))
);

async function loadSeasons() {
  try {
    const status = await seasonCalendarApi.status();
    seasons.value = status.seasons ?? [];
    currentSeason.value = status.currentSeason ?? '';
    if (!season.value) season.value = status.currentSeason ?? seasons.value[0]?.season ?? '';
  } catch {
    seasons.value = []; // Le sélecteur disparaît, la saison en cours reste servie par défaut.
  }
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const result = await seasonCalendarApi.list(undefined, season.value || undefined);
    matches.value = result.matches ?? [];
  } catch (e) {
    error.value = e.message;
    matches.value = [];
  } finally {
    loading.value = false;
  }
}

watch(season, load);

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

// Une saison entière, c'est plus de 11 000 rencontres : les dessiner d'un
// coup en cartes (MatchCard, 01/10/2026) figeait la page. On en montre une
// fenêtre de jours — à partir d'avant-hier pour la saison en cours, du début
// sinon — que deux boutons élargissent vers le passé ou vers l'avenir.
const PAS_JOURS = 14;
const debutFenetre = ref(0);
const finFenetre = ref(PAS_JOURS);
function recentrer() {
  const jours = groupedByDay.value;
  let debut = 0;
  if (isCurrentSeason.value) {
    const avantHier = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const i = jours.findIndex(([day]) => day >= avantHier);
    debut = i < 0 ? Math.max(0, jours.length - PAS_JOURS) : i;
  }
  debutFenetre.value = debut;
  finFenetre.value = debut + PAS_JOURS;
}
watch(groupedByDay, recentrer, { immediate: true });
const joursAffiches = computed(() => groupedByDay.value.slice(debutFenetre.value, finFenetre.value));
const joursAvant = computed(() => debutFenetre.value);
const joursApres = computed(() => Math.max(0, groupedByDay.value.length - finFenetre.value));
function plusTot() {
  debutFenetre.value = Math.max(0, debutFenetre.value - PAS_JOURS);
}
function plusTard() {
  finFenetre.value += PAS_JOURS;
}

// Présentation (refonte du 02/10/2026) : ce que le bandeau résume d'un coup
// d'œil — le nombre de rencontres et de jours retenus par les filtres, et
// les bornes de la fenêtre de jours à l'écran.
const nbRencontres = computed(() => filteredMatches.value.length.toLocaleString('fr-FR'));
const nbJours = computed(() => groupedByDay.value.length);
const fenetre = computed(() => {
  const jours = joursAffiches.value;
  if (!jours.length) return null;
  return {
    jours: jours.length,
    debut: jours[0][0],
    fin: jours[jours.length - 1][0],
    rencontres: jours.reduce((total, [, liste]) => total + liste.length, 0)
  };
});

const lastUpdatedAt = computed(() => {
  const dates = matches.value.map((m) => m.updatedAt).filter(Boolean).sort();
  return dates.length ? dates[dates.length - 1] : null;
});

onMounted(async () => {
  await loadSeasons();
  await load();
});

// Cette vue garde son calendrier en local (pas dans un store Pinia), donc le
// rafraîchissement automatique global ne peut pas le remettre à jour à sa
// place : on recharge dès que l'empreinte des données côté serveur change.
// C'est la vue la plus concernée, puisqu'elle affiche exactement ce que la
// l'actualisation automatique réécrit à chaque passe.

/** Identifiant de la fiche statistiques, construit comme cote serveur. */
function statsId(match) {
  const slug = (t) =>
    String(t ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return `stats-${match.date}-${slug(match.homeName)}-${slug(match.awayName)}`;
}

// « Reporté » : FotMob a reporté le match et ne donne pas encore de nouvelle
// date (cf. merge-season-calendar.mjs). Re-programmé, il redevient « à venir »
// à sa nouvelle date, avec l'étiquette « Reprogrammé » (MatchCard.vue).
// La page qu'ouvre une rencontre : celle du match joué, celle du match à
// venir (retrouvée par son identifiant de calendrier), rien pour un reporté
// sans date.
function lienMatch(match) {
  if (match.status === 'finished') return { name: 'match-detail', params: { matchId: statsId(match) } };
  if (match.status === 'postponed' || !match.matchId) return null;
  return `/match-a-venir/${match.matchId}`;
}

// Une rencontre au format de la carte commune (MatchCard.vue, 01/10/2026).
function versCarte(match) {
  const joue = match.status === 'finished';
  return {
    matchId: match.matchId,
    date: match.date,
    league: match.league,
    round: match.round ?? null,
    homeName: match.homeName,
    awayName: match.awayName,
    homeGoals: joue ? match.homeGoals : null,
    awayGoals: joue ? match.awayGoals : null,
    status: match.status ?? 'scheduled',
    postponedFrom: match.postponedFrom ?? null
  };
}

const dataVersion = useDataVersionStore();
watch(
  () => dataVersion.version,
  (next, previous) => {
    if (previous && next && next !== previous) load();
  }
);
</script>

<template>
  <div class="calendar cm-page">
    <!-- Le bandeau : la saison regardée, ce qu'elle contient, la fenêtre de
         jours à l'écran, et les filtres sur la même ligne. -->
    <section class="cm-hero calendar__hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="calendar" :size="18" /></span>
          Calendrier de la saison
        </h2>
        <div class="cm-hero__chips">
          <span v-if="season" class="cm-chip is-section"><AppIcon name="trophy" :size="11" />Saison {{ season }}</span>
          <span class="cm-chip" title="Rencontres et jours de matchs retenus par les filtres">
            <AppIcon name="matches" :size="11" />{{ nbRencontres }} rencontres · {{ nbJours }} jour{{ nbJours > 1 ? 's' : '' }}
          </span>
          <span v-if="fenetre" class="cm-chip is-info" title="La fenêtre de jours affichée ci-dessous">
            <AppIcon name="eye" :size="11" />À l'écran : du {{ formatShortDay(fenetre.debut) }} au {{ formatShortDay(fenetre.fin) }} · {{ fenetre.rencontres }} rencontre{{ fenetre.rencontres > 1 ? 's' : '' }}
          </span>
        </div>
      </div>

      <div class="cm-toolbar calendar__filters">
        <AppTextField v-model="leagueQuery" label="Championnat ou équipe" placeholder="Ex. Ligue 1, PSG…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
        <AppSelect v-if="seasonOptions.length > 1" v-model="season" label="Saison" :options="seasonOptions" />
        <AppSelect v-model="statusFilter" label="Statut" :options="STATUS_OPTIONS" />
        <AppButton variant="secondary" :loading="loading" @click="load">
          <template #icon><AppIcon name="refresh" :size="15" /></template>
          Actualiser
        </AppButton>
      </div>

      <p v-if="lastUpdatedAt" class="calendar__hint">
        <AppIcon name="clock" :size="12" />
        <span>
          Dernière mise à jour de ce calendrier : {{ new Date(lastUpdatedAt).toLocaleString('fr-FR') }} — actualisé automatiquement par l'appli, au démarrage puis toutes les trois heures.
        </span>
      </p>
    </section>

    <LoadingSpinner v-if="loading" label="Chargement du calendrier…" />
    <EmptyState v-else-if="error" icon="alert" title="Calendrier indisponible" :description="error" />
    <EmptyState
      v-else-if="filteredMatches.length === 0"
      icon="matches"
      title="Aucun match trouvé"
      description="Le calendrier se remplit tout seul : l'actualisation automatique de l'appli le complète au démarrage puis toutes les trois heures. Revenez un peu plus tard s'il vient d'être activé."
    />

    <!-- La fenêtre de jours : un bouton à chaque bout pour l'élargir, un
         titre de groupe par jour, une colonne de cartes de rencontre. -->
    <AppCard v-else :padded="false" class="calendar__list">
      <button v-if="joursAvant" type="button" class="calendar__more" @click="plusTot">
        <AppIcon name="chevronDown" :size="14" class="calendar__more-icon is-up" />
        Afficher les jours précédents <span class="cm-text-muted">({{ joursAvant }} jour{{ joursAvant > 1 ? 's' : '' }} de matchs avant)</span>
      </button>
      <div class="calendar__days">
        <section v-for="[day, dayMatches] in joursAffiches" :key="day" class="calendar__day">
          <h3 class="cm-group-title calendar__day-title">
            <span>{{ formatDay(day, { withYear: !isCurrentSeason }) }}</span>
            <span class="calendar__day-count cm-numeric" :title="`${dayMatches.length} rencontre(s) ce jour`">{{ dayMatches.length }}</span>
          </h3>
          <div class="calendar__cards cm-stagger">
            <MatchCard v-for="match in dayMatches" :key="match.matchId" :match="versCarte(match)" :to="lienMatch(match)" date-display="none" />
          </div>
        </section>
      </div>
      <button v-if="joursApres" type="button" class="calendar__more" @click="plusTard">
        <AppIcon name="chevronDown" :size="14" class="calendar__more-icon" />
        Afficher les jours suivants <span class="cm-text-muted">({{ joursApres }} jour{{ joursApres > 1 ? 's' : '' }} de matchs après)</span>
      </button>
    </AppCard>
  </div>
</template>

<style scoped>
.calendar {
  /* Se règle sur SA largeur : l'onglet vit dans la page Matchs, large ou non. */
  container: calendar / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.calendar__hero {
  gap: 16px;
}

/* Les filtres : le champ de recherche prend le plus de place, les sélecteurs
   se partagent le reste, le bouton garde sa largeur. */
.calendar__filters > * {
  flex: 1 1 170px;
}

.calendar__filters > :first-child {
  flex: 2 1 240px;
}

.calendar__filters > :last-child {
  flex: 0 0 auto;
}

.calendar__hint {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.calendar__hint :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--cm-section);
}

/* ------------------------------------------------------------ fenêtre */
/* La carte coupe ses enfants à ses coins arrondis : les boutons « plus de
   jours » courent d'un bord à l'autre. */
.calendar__list {
  overflow: hidden;
}

.calendar__more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  border: 0;
  border-bottom: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
  color: var(--cm-section);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--cm-transition);
}

.calendar__more:last-child {
  border-bottom: 0;
  border-top: 1px solid var(--cm-border-soft);
}

.calendar__more:hover {
  background: var(--cm-section-soft);
}

.calendar__more-icon {
  flex-shrink: 0;
  transition: transform var(--cm-transition);
}

.calendar__more-icon.is-up {
  transform: rotate(180deg);
}

.calendar__more:hover .calendar__more-icon {
  transform: translateY(2px);
}

.calendar__more:hover .calendar__more-icon.is-up {
  transform: rotate(180deg) translateY(2px);
}

.calendar__days {
  display: flex;
  flex-direction: column;
}

.calendar__day {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px 16px;
}

.calendar__day + .calendar__day {
  border-top: 1px solid var(--cm-border-soft);
}

/* Le jour : un titre de groupe un cran plus lisible que la norme, avec le
   nombre de rencontres en pastille couleur de section. */
.calendar__day-title {
  font-size: 11px;
  color: var(--cm-text-secondary);
}

.calendar__day-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.calendar__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Étroit : chaque filtre sur sa ligne, le bouton aussi. */
@container calendar (max-width: 720px) {
  .calendar__filters > *,
  .calendar__filters > :first-child,
  .calendar__filters > :last-child {
    flex: 1 1 100%;
  }

  .calendar__hero {
    padding: 16px;
  }

  .calendar__day {
    padding: 12px;
  }
}
</style>
