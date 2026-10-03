<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { useDataVersionStore } from '@/stores/dataVersionStore.js';
import { standingsApi } from '@/services/standingsApi.js';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import AppCard from '@/components/common/AppCard.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';
import { MATCH_STAT_SECTIONS, parseNumeric } from '@/constants/matchStatFields.js';

const matchesStore = useMatchesStore();
const toastStore = useToastStore();

const selectedLeague = ref('');
const standings = ref({ loading: false, error: null, rows: [] });

// Détail complet (34 champs) par équipe — à la demande seulement : contrairement
// aux buts (dérivés gratuitement du classement), chaque champ vient d'une
// moyenne sur les N derniers matchs de l'équipe, donc jusqu'à N appels API
// PAR ÉQUIPE. Un échantillon réduit par défaut (3) garde ça praticable pour
// un championnat entier (~20 équipes) face au quota gratuit de 100/jour.
const fullStatsSampleSize = ref(3);
const fullStatsByTeam = ref({});
const fullStatsLoading = ref(false);
const fullStatsLoadedFor = ref(null);
const FULL_STATS_BATCH_SIZE = 3;

// Championnats sourcés d'abord des CLASSEMENTS disponibles (clés du magasin
// local, donc résolubles par le serveur par construction), complétés par ceux
// des matchs chargés. Se limiter aux matchs cotés masquait les championnats
// peuplés par l'actualisation automatique sans cotes — Russie, Chine, League One et
// Two avaient classement et statistiques sans aucun écran pour les afficher.
const standingsLeagues = ref([]);

const leagueOptions = computed(() =>
  [...new Set([...standingsLeagues.value, ...matchesStore.matches.map((m) => m.league)].filter(Boolean))]
    .sort()
    .map((league) => ({ value: league, label: formatLeagueOptionLabel(league) }))
);

// Équipes du championnat (classement déjà récupéré et caché 12h côté serveur
// pour le bouton "Classement") — sert de liste d'équipes pour le détail
// complet ci-dessous, aucun appel API supplémentaire par équipe.
const rows = computed(() => standings.value.rows);

async function loadAverages() {
  if (!selectedLeague.value) return;
  standings.value = { loading: true, error: null, rows: [] };
  fullStatsByTeam.value = {};
  fullStatsLoadedFor.value = null;
  try {
    const result = await standingsApi.get(selectedLeague.value);
    standings.value = { loading: false, error: null, rows: result.rows };
  } catch (error) {
    standings.value = { loading: false, error: error.message, rows: [] };
    toastStore.error(`Moyennes indisponibles : ${error.message}`);
  }
}

watch(selectedLeague, loadAverages);

/**
 * Rechargement du seul classement quand les données changent côté serveur.
 *
 * Volontairement PAS `loadAverages()` : celui-ci vide `fullStatsByTeam`, or ce
 * détail complet a coûté un appel par équipe que l'utilisateur a déclenché
 * explicitement. On rafraîchit donc les lignes (lecture d'un fichier local,
 * gratuite) et on laisse le détail en place — le bouton "Charger le détail
 * complet" reste là pour le recalculer si besoin.
 */
const dataVersionStore = useDataVersionStore();
watch(
  () => dataVersionStore.version,
  async (next, previous) => {
    if (!previous || !next || next === previous) return;
    if (!selectedLeague.value || standings.value.loading) return;
    try {
      const result = await standingsApi.get(selectedLeague.value);
      standings.value = { loading: false, error: null, rows: result.rows };
    } catch {
      // Silencieux : rafraîchissement d'arrière-plan, on garde l'affichage
      // précédent plutôt que d'alerter sur une opération non demandée.
    }
  }
);

/**
 * Boucle sur toutes les équipes du championnat par petits lots (pas toutes
 * en même temps, pour rester raisonnable vis-à-vis du débit API) — chaque
 * équipe est résolue indépendamment (Promise.allSettled) : l'échec d'une
 * seule (ex. quota épuisé en cours de route) laisse les autres déjà
 * chargées à l'écran plutôt que de tout effacer.
 */
async function loadFullStats() {
  if (!rows.value.length) return;
  fullStatsLoading.value = true;
  fullStatsByTeam.value = {};
  const teams = rows.value;

  for (let i = 0; i < teams.length; i += FULL_STATS_BATCH_SIZE) {
    const batch = teams.slice(i, i + FULL_STATS_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((team) => teamStatsApi.getAverageStatsByName(team.teamName, selectedLeague.value, fullStatsSampleSize.value))
    );
    const updates = {};
    results.forEach((result, index) => {
      const teamId = batch[index].teamId;
      if (result.status !== 'fulfilled') {
        updates[teamId] = null;
        return;
      }
      const stats = result.value.stats ?? {};
      updates[teamId] = { total: stats.averages ?? {}, home: stats.homeAverages ?? {}, away: stats.awayAverages ?? {} };
    });
    fullStatsByTeam.value = { ...fullStatsByTeam.value, ...updates };
  }

  fullStatsLoadedFor.value = selectedLeague.value;
  fullStatsLoading.value = false;
}

// Présentation : avancement du détail complet (équipes résolues sur le total
// du classement) et équipes restées sans détail (appel en échec, quota…).
const fullStatsProgress = computed(() => {
  const resolved = Object.values(fullStatsByTeam.value);
  return { done: resolved.length, failed: resolved.filter((t) => !t).length, total: rows.value.length };
});

// Présentation : l'icône de chaque famille de statistiques (titres de MATCH_STAT_SECTIONS).
const SECTION_ICONS = { Tirs: 'target', Attaque: 'bolt', 'Possession & passes': 'swap', Défense: 'shield', Gardien: 'ball' };

function meanOf(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * Moyenne DE LA LIGUE pour une statistique — moyenne des moyennes de chaque
 * équipe déjà chargée (pas un seul match) — dans ses 3 déclinaisons : toutes
 * rencontres, matchs à domicile uniquement, matchs à l'extérieur uniquement.
 * Le partage domicile/extérieur de la barre reflète la proportion de
 * l'intensité de cette stat entre les deux contextes, pas un pourcentage
 * absolu (ex. une possession moyenne de 51% à dom. vs 49% à l'ext. donnera
 * une barre proche de 51/49, cohérent avec des valeurs déjà en %).
 */
function computeLeagueStat(row) {
  const teams = Object.values(fullStatsByTeam.value).filter(Boolean);
  const total = meanOf(teams.map((t) => parseNumeric(t.total?.[row.key])).filter((v) => v !== null));
  const home = meanOf(teams.map((t) => parseNumeric(t.home?.[row.key])).filter((v) => v !== null));
  const away = meanOf(teams.map((t) => parseNumeric(t.away?.[row.key])).filter((v) => v !== null));
  if (total === null && home === null && away === null) return null;

  const format = (v) => (v === null ? '—' : row.percent ? `${v.toFixed(1)}%` : Number(v.toFixed(2)));
  const barBase = (home ?? 0) + (away ?? 0);
  const homeSharePercent = barBase > 0 ? Math.round(((home ?? 0) / barBase) * 100) : 50;

  return {
    key: row.key,
    label: row.label,
    total: format(total),
    home: format(home),
    away: format(away),
    homeSharePercent,
    awaySharePercent: 100 - homeSharePercent
  };
}

const leagueStatSections = computed(() => {
  if (fullStatsLoadedFor.value !== selectedLeague.value) return [];
  return MATCH_STAT_SECTIONS.map((section) => ({
    title: section.title,
    rows: section.rows.filter((r) => !r.render).map(computeLeagueStat).filter(Boolean)
  })).filter((section) => section.rows.length);
});

onMounted(async () => {
  // Les deux sources sont indépendantes : un échec des cotes ne doit pas
  // priver l'écran des championnats qui ont un classement local, et
  // inversement.
  await Promise.allSettled([
    standingsApi.listLeagues().then((result) => {
      standingsLeagues.value = result.leagues ?? [];
    }),
    matchesStore.matches.length ? null : matchesStore.fetchMatches()
  ]);
  if (!selectedLeague.value && leagueOptions.value.length) selectedLeague.value = leagueOptions.value[0].value;
});
</script>

<template>
  <div class="team-stats cm-page">
    <!-- Le bandeau de l'onglet : ce qu'on regarde, et la compétition à choisir. -->
    <section class="cm-hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="barChart" :size="18" /></span>
          Statistiques ligue
        </h2>
        <span class="cm-hero__chips">
          <span class="cm-chip is-section"><AppIcon name="trophy" :size="11" />{{ leagueOptions.length }} compétition(s)</span>
          <span v-if="rows.length" class="cm-chip"><AppIcon name="users" :size="11" />{{ rows.length }} équipes</span>
          <span class="cm-chip"><AppIcon name="layers" :size="11" />34 champs</span>
        </span>
      </div>
      <p class="cm-hero__subtitle">
        Détail complet des statistiques (34 champs) moyennées sur tout le championnat — toutes rencontres, domicile et extérieur.
      </p>
      <div class="cm-toolbar team-stats__toolbar">
        <AppSelect v-model="selectedLeague" label="Compétition" :options="leagueOptions" class="team-stats__grow" />
        <AppButton variant="secondary" :loading="standings.loading" :disabled="!selectedLeague" @click="loadAverages">
          <template #icon><AppIcon name="refresh" :size="15" /></template>
          Actualiser
        </AppButton>
      </div>
    </section>

    <LoadingSpinner v-if="matchesStore.loading && !leagueOptions.length" label="Chargement des championnats…" />
    <EmptyState
      v-else-if="!leagueOptions.length"
      icon="matches"
      title="Aucun championnat chargé"
      description="Aucun classement en local et aucune cote chargée. Lance une actualisation depuis Réglages > Données, ou va sur la page Matchs charger des cotes."
    />
    <LoadingSpinner v-else-if="standings.loading" label="Récupération du classement…" />
    <EmptyState v-else-if="standings.error" icon="alert" title="Moyennes indisponibles" :description="standings.error" />
    <EmptyState v-else-if="!rows.length" icon="database" title="Choisis un championnat" description="Sélectionne une compétition ci-dessus pour voir le détail des statistiques." />

    <template v-else>
      <!-- 1. LE DÉTAIL COMPLET, À LA DEMANDE (il coûte des appels API) -->
      <AppCard
        icon="bolt"
        eyebrow="À la demande"
        title="Charger le détail complet"
        subtitle="Chaque champ est une moyenne sur les derniers matchs de chaque équipe du classement — un appel API par match et par équipe."
      >
        <div class="team-stats__body">
          <div class="cm-toolbar">
            <AppNumberField v-model="fullStatsSampleSize" label="Échantillon par équipe (derniers matchs)" :min="1" :max="10" class="team-stats__sample" />
            <AppButton variant="secondary" :loading="fullStatsLoading" @click="loadFullStats">
              <template #icon><AppIcon name="bolt" :size="14" /></template>
              Charger le détail complet (34 champs)
            </AppButton>
          </div>

          <div class="cm-note is-warning">
            <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="16" /></span>
            <div>
              <p class="cm-note__title">Coût des appels API</p>
              <p class="cm-note__text">
                Coûte jusqu'à {{ fullStatsSampleSize }} appel(s) API par équipe ({{ rows.length }} équipes) — mis en cache.
              </p>
            </div>
          </div>

          <!-- Avancement pendant le chargement, équipes sans détail après. -->
          <div v-if="fullStatsLoading" class="team-stats__progress">
            <div class="cm-bar"><span class="cm-bar__fill" :style="{ width: `${fullStatsProgress.total ? Math.round((fullStatsProgress.done / fullStatsProgress.total) * 100) : 0}%` }" /></div>
            <span class="cm-numeric team-stats__progress-text">{{ fullStatsProgress.done }} / {{ fullStatsProgress.total }} équipes</span>
          </div>
          <span v-else-if="fullStatsProgress.failed" class="cm-chip is-warning team-stats__failed" title="Appel en échec pour ces équipes (quota épuisé, nom non reconnu…) : elles ne comptent pas dans les moyennes">
            <AppIcon name="alert" :size="11" />{{ fullStatsProgress.failed }} équipe(s) sans détail
          </span>
        </div>
      </AppCard>

      <!-- 2. LES MOYENNES DE LA LIGUE, FAMILLE PAR FAMILLE -->
      <AppCard
        v-if="leagueStatSections.length"
        icon="pieChart"
        eyebrow="Moyennes de la ligue"
        title="Domicile face à extérieur"
        subtitle="Moyenne des moyennes de chaque équipe chargée ; la barre partage l'intensité de chaque statistique entre les deux contextes."
      >
        <template #actions>
          <div class="team-stats__legend">
            <span><i class="team-stats__dot is-home" />Domicile</span>
            <span><i class="team-stats__dot is-away" />Extérieur</span>
          </div>
        </template>
        <div class="team-stats__sections cm-stagger">
          <section v-for="section in leagueStatSections" :key="section.title" class="cm-block team-stats__section">
            <p class="cm-group-title team-stats__section-title">
              <span class="cm-icon-box is-sm"><AppIcon :name="SECTION_ICONS[section.title] ?? 'barChart'" :size="14" /></span>
              {{ section.title }}
            </p>

            <div class="team-stats__rows">
              <div v-for="stat in section.rows" :key="stat.key" class="team-stats__row">
                <span class="cm-numeric team-stats__value is-home">{{ stat.home }}</span>
                <span class="team-stats__label">
                  {{ stat.label }}
                  <span class="cm-text-muted team-stats__total">toutes : {{ stat.total }}</span>
                </span>
                <span class="cm-numeric team-stats__value is-away">{{ stat.away }}</span>
                <div class="team-stats__track">
                  <span class="team-stats__fill is-home" :style="{ width: stat.homeSharePercent + '%' }" />
                  <span class="team-stats__fill is-away" :style="{ width: stat.awaySharePercent + '%' }" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </AppCard>
      <LoadingSpinner v-else-if="fullStatsLoading" label="Calcul des moyennes par équipe…" />
      <EmptyState
        v-else
        icon="barChart"
        title="Détail pas encore chargé"
        description="Choisis un échantillon puis clique sur « Charger le détail complet » : les moyennes de la ligue, domicile face à extérieur, apparaîtront ici."
      />
    </template>
  </div>
</template>

<style scoped>
.team-stats {
  /* Se règle sur SA largeur : les familles de statistiques passent sur deux colonnes dès que la place existe. */
  container: teamstats / inline-size;
}

.team-stats__grow {
  flex: 1 1 260px;
}

/* Le corps d'une carte : commandes, note, avancement, espacés. */
.team-stats__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.team-stats__sample {
  flex: 0 1 300px;
}

/* ----------------------------------------------------------- avancement */
.team-stats__progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.team-stats__progress-text {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

.team-stats__failed {
  align-self: flex-start;
}

/* --------------------------------------------------------------- légende */
.team-stats__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 11px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.team-stats__legend span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.team-stats__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.team-stats__dot.is-home,
.team-stats__fill.is-home {
  background: var(--cm-accent);
}

.team-stats__dot.is-away,
.team-stats__fill.is-away {
  background: var(--cm-info);
}

/* --------------------------------------------------- familles de stats */
.team-stats__sections {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.team-stats__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.team-stats__section-title {
  color: var(--cm-text-secondary);
}

.team-stats__rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Une ligne : valeur domicile · libellé · valeur extérieur, puis la barre partagée. */
.team-stats__row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 64px;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 5px 10px;
  padding: 6px 8px;
  border-radius: var(--cm-radius-sm);
  transition: background var(--cm-transition);
}

.team-stats__row:hover {
  background: var(--cm-surface-hover);
}

.team-stats__value {
  font-size: 13px;
  font-weight: 700;
}

.team-stats__value.is-home {
  color: var(--cm-accent);
  text-align: left;
}

.team-stats__value.is-away {
  color: var(--cm-info);
  text-align: right;
}

.team-stats__label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 0;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  color: var(--cm-text-primary);
}

.team-stats__total {
  font-size: 10px;
  font-weight: 500;
}

.team-stats__track {
  grid-column: 1 / -1;
  display: flex;
  gap: 3px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--cm-surface-hover);
}

.team-stats__fill {
  min-width: 2px;
  border-radius: 999px;
  transition: width var(--cm-transition-slow);
}

/* Assez de place : deux familles côte à côte. */
@container teamstats (min-width: 860px) {
  .team-stats__sections {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Panneau étroit : les commandes s'empilent, les valeurs se resserrent. */
@container teamstats (max-width: 520px) {
  .team-stats__grow,
  .team-stats__sample {
    flex-basis: 100%;
  }

  .team-stats__row {
    grid-template-columns: 52px minmax(0, 1fr) 52px;
  }
}
</style>
