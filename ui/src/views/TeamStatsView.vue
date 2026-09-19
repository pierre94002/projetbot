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
import { parseLeagueLabel } from '@/utils/leagueDisplay.js';
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

// Championnats sourcés depuis les matchs déjà chargés (même source que le
// bouton "Classement" de la page Matchs) — garantit que le libellé envoyé au
// serveur est un format qu'il sait résoudre, plutôt qu'une liste de
// compétitions saisie à la main qui pourrait ne correspondre à rien.
const leagueOptions = computed(() =>
  [...new Set(matchesStore.matches.map((m) => m.league).filter(Boolean))]
    .sort()
    .map((league) => ({ value: league, label: parseLeagueLabel(league).name }))
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
  if (!matchesStore.matches.length) await matchesStore.fetchMatches();
  if (!selectedLeague.value && leagueOptions.value.length) selectedLeague.value = leagueOptions.value[0].value;
});
</script>

<template>
  <div class="team-stats-view">
    <AppCard
      title="Statistiques ligue"
      subtitle="Détail complet des statistiques (34 champs) moyennées sur tout le championnat — toutes rencontres, domicile et extérieur"
    >
      <div class="team-stats-view__controls">
        <AppSelect v-model="selectedLeague" label="Compétition" :options="leagueOptions" />
        <AppButton variant="secondary" :loading="standings.loading" :disabled="!selectedLeague" @click="loadAverages">
          <template #icon><AppIcon name="refresh" :size="15" /></template>
          Actualiser
        </AppButton>
      </div>

      <LoadingSpinner v-if="matchesStore.loading && !leagueOptions.length" label="Chargement des championnats…" />
      <EmptyState
        v-else-if="!leagueOptions.length"
        icon="matches"
        title="Aucun championnat chargé"
        description="Va sur la page Matchs pour charger des cotes — les championnats disponibles apparaîtront ici."
      />
      <LoadingSpinner v-else-if="standings.loading" label="Récupération du classement…" />
      <EmptyState v-else-if="standings.error" icon="alert" title="Moyennes indisponibles" :description="standings.error" />
      <EmptyState v-else-if="!rows.length" icon="database" title="Choisis un championnat" description="Sélectionne une compétition ci-dessus pour voir le détail des statistiques." />

      <template v-else>
        <div class="team-stats-view__full-stats-bar">
          <AppNumberField v-model="fullStatsSampleSize" label="Échantillon par équipe (derniers matchs)" :min="1" :max="10" />
          <AppButton variant="secondary" :loading="fullStatsLoading" @click="loadFullStats">
            <template #icon><AppIcon name="bolt" :size="14" /></template>
            Charger le détail complet (34 champs)
          </AppButton>
          <span class="cm-text-muted team-stats-view__full-stats-hint">
            Coûte jusqu'à {{ fullStatsSampleSize }} appel(s) API par équipe ({{ rows.length }} équipes) — mis en cache.
          </span>
        </div>

        <div v-if="leagueStatSections.length" class="league-bar-stats">
          <div v-for="section in leagueStatSections" :key="section.title" class="league-bar-section">
            <p class="league-bar-section__title cm-text-muted">{{ section.title }}</p>

            <div v-for="stat in section.rows" :key="stat.key" class="league-bar-row">
              <div class="league-bar-row__values">
                <span class="cm-numeric league-bar-row__home-value">{{ stat.home }}</span>
                <span class="league-bar-row__label">
                  {{ stat.label }}
                  <span class="cm-text-muted league-bar-row__total">toutes : {{ stat.total }}</span>
                </span>
                <span class="cm-numeric league-bar-row__away-value">{{ stat.away }}</span>
              </div>
              <div class="league-bar-row__bar">
                <div class="league-bar-row__bar-home" :style="{ width: stat.homeSharePercent + '%' }"></div>
                <div class="league-bar-row__bar-away" :style="{ width: stat.awaySharePercent + '%' }"></div>
              </div>
            </div>
          </div>
          <div class="league-bar-stats__legend">
            <span><i class="league-bar-stats__dot league-bar-stats__dot--home" />Domicile</span>
            <span><i class="league-bar-stats__dot league-bar-stats__dot--away" />Extérieur</span>
          </div>
        </div>
      </template>
    </AppCard>
  </div>
</template>

<style scoped>
.team-stats-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.team-stats-view__controls {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 14px;
  align-items: end;
  margin-bottom: 18px;
}

.team-stats-view__full-stats-bar {
  display: flex;
  align-items: end;
  gap: 14px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--cm-border-soft);
}

.team-stats-view__full-stats-hint {
  font-size: 11px;
}

.league-bar-stats {
  margin-top: 14px;
}

.league-bar-section {
  margin-bottom: 14px;
}

.league-bar-section__title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
}

.league-bar-section:first-of-type .league-bar-section__title {
  border-top: none;
  padding-top: 0;
}

.league-bar-row {
  padding: 6px 0;
}

.league-bar-row__values {
  display: grid;
  grid-template-columns: 70px 1fr 70px;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
}

.league-bar-row__home-value {
  font-weight: 700;
  color: var(--cm-accent);
}

.league-bar-row__away-value {
  font-weight: 700;
  color: var(--cm-info);
  text-align: right;
}

.league-bar-row__label {
  text-align: center;
  font-size: 11.5px;
}

.league-bar-row__total {
  display: block;
  font-size: 10px;
  margin-top: 1px;
}

.league-bar-row__bar {
  display: flex;
  margin-top: 5px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--cm-surface-hover);
}

.league-bar-row__bar-home {
  background: var(--cm-accent);
}

.league-bar-row__bar-away {
  background: var(--cm-info);
}

.league-bar-stats__legend {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
  font-size: 11px;
  color: var(--cm-text-muted);
}

.league-bar-stats__legend span {
  display: flex;
  align-items: center;
  gap: 6px;
}

.league-bar-stats__dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  display: inline-block;
}

.league-bar-stats__dot--home {
  background: var(--cm-accent);
}

.league-bar-stats__dot--away {
  background: var(--cm-info);
}

@media (max-width: 860px) {
  .team-stats-view__controls {
    grid-template-columns: 1fr;
  }
  .team-stats-view__full-stats-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
