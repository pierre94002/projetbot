<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { useDataVersionStore } from '@/stores/dataVersionStore.js';
import { standingsApi } from '@/services/standingsApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import AppCard from '@/components/common/AppCard.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';
import { MATCH_STAT_SECTIONS, parseNumeric } from '@/constants/matchStatFields.js';

const matchesStore = useMatchesStore();
const toastStore = useToastStore();
const favoris = useFavoritesStore();

const selectedLeague = ref('');
const standings = ref({ loading: false, error: null, rows: [] });

// Les statistiques du championnat (03/10/2026, Pierre : « il faut rechercher
// les statistiques avec FotMob »). Avant : un appel par équipe, par lots de
// trois, avec un repli payant (API-Football) et un échantillon réduit à 3
// matchs pour ménager un quota. Maintenant : UN appel, lu dans le magasin
// local que l'actualisation automatique remplit depuis FotMob — gratuit, donc
// chargé tout seul dès qu'on choisit une compétition, sur la saison en cours
// ou les N derniers matchs DE CE championnat de chaque équipe.
const PERIODES = [
  { value: 'saison', label: 'Saison en cours' },
  { value: '5', label: '5 derniers matchs' },
  { value: '10', label: '10 derniers matchs' },
  { value: '20', label: '20 derniers matchs' }
];
const periode = ref('saison');
const moyennes = ref({ loading: false, error: null, data: null });

// Par équipe, { total, home, away } : le format que lit computeLeagueStat.
const fullStatsByTeam = computed(() =>
  Object.fromEntries(
    (moyennes.value.data?.teams ?? []).map((t) => [t.teamId ?? t.teamName, { total: t.averages ?? {}, home: t.homeAverages ?? {}, away: t.awayAverages ?? {} }])
  )
);
const fullStatsLoading = computed(() => moyennes.value.loading);
const fullStatsLoadedFor = computed(() => moyennes.value.data?.league ?? null);

/**
 * Charge les moyennes du championnat choisi. Une réponse arrivée après un
 * changement de compétition ou de période est ignorée. `silencieux` : le
 * rafraîchissement d'arrière-plan garde l'affichage en place, sans alerte.
 */
async function chargerMoyennes({ silencieux = false } = {}) {
  const ligue = selectedLeague.value;
  const choix = periode.value;
  if (!ligue) return;
  if (!silencieux) moyennes.value = { loading: true, error: null, data: null };
  try {
    const data = await matchStatsApi.leagueAverages(ligue, choix);
    if (selectedLeague.value === ligue && periode.value === choix) moyennes.value = { loading: false, error: null, data };
  } catch (error) {
    if (selectedLeague.value === ligue && periode.value === choix && !silencieux) moyennes.value = { loading: false, error: error.message, data: null };
  }
}

watch(periode, () => chargerMoyennes());

// Championnats sourcés d'abord des CLASSEMENTS disponibles (clés du magasin
// local, donc résolubles par le serveur par construction), complétés par ceux
// des matchs chargés. Se limiter aux matchs cotés masquait les championnats
// peuplés par l'actualisation automatique sans cotes — Russie, Chine, League One et
// Two avaient classement et statistiques sans aucun écran pour les afficher.
const standingsLeagues = ref([]);

// Les championnats favoris d'abord (03/10/2026), marqués d'une étoile : le
// premier de la liste est celui qu'on ouvre par défaut.
const leagueOptions = computed(() =>
  favoris
    .favoritesFirst([...new Set([...standingsLeagues.value, ...matchesStore.matches.map((m) => m.league)].filter(Boolean))].sort(), { league: (l) => l })
    .map((league) => {
      const favori = favoris.isFavoriteLeague(league);
      return {
        value: league,
        label: formatLeagueOptionLabel(league),
        league,
        favorite: favori,
        group: favoris.leagues.length ? (favori ? 'Favoris' : 'Toutes les compétitions') : undefined
      };
    })
);

// Équipes du championnat (classement déjà récupéré et caché 12h côté serveur
// pour le bouton "Classement") — sert de liste d'équipes pour le détail
// complet ci-dessous, aucun appel API supplémentaire par équipe.
const rows = computed(() => standings.value.rows);

async function loadAverages() {
  if (!selectedLeague.value) return;
  standings.value = { loading: true, error: null, rows: [] };
  chargerMoyennes();
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
 * Rechargement quand les données changent côté serveur : le classement et
 * les moyennes, tous deux lus en local (FotMob), sans vider l'affichage en
 * attendant ni alerter sur une opération non demandée.
 */
const dataVersionStore = useDataVersionStore();
watch(
  () => dataVersionStore.version,
  async (next, previous) => {
    if (!previous || !next || next === previous) return;
    if (!selectedLeague.value || standings.value.loading) return;
    chargerMoyennes({ silencieux: true });
    try {
      const result = await standingsApi.get(selectedLeague.value);
      standings.value = { loading: false, error: null, rows: result.rows };
    } catch {
      // Silencieux : rafraîchissement d'arrière-plan, on garde l'affichage
      // précédent plutôt que d'alerter sur une opération non demandée.
    }
  }
);

// Présentation : ce que couvrent les moyennes — combien d'équipes, combien de
// matchs par équipe, entre quelles dates, et les équipes sans statistiques.
const formatJour = (iso) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(`${iso}T12:00:00Z`));
const couverture = computed(() => {
  const d = moyennes.value.data;
  if (!d || d.league !== selectedLeague.value) return null;
  const equipes = d.teams ?? [];
  const tailles = equipes.map((t) => t.sampleSize ?? 0);
  const dates = equipes.flatMap((t) => [t.firstDate, t.lastDate]).filter(Boolean).sort();
  const min = tailles.length ? Math.min(...tailles) : 0;
  const max = tailles.length ? Math.max(...tailles) : 0;
  return {
    equipes: equipes.length,
    parEquipe: min === max ? `${max} match${max > 1 ? 's' : ''} par équipe` : `${min} à ${max} matchs par équipe`,
    debut: dates[0] ? formatJour(dates[0]) : null,
    fin: dates.length ? formatJour(dates[dates.length - 1]) : null,
    saison: d.seasonLabel ?? null,
    manquantes: d.missing ?? []
  };
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
  choisirParDefaut();
});

// Le choix par défaut (le premier de la liste, donc le premier favori) suit
// l'arrivée des favoris, tant que la compétition affichée est ce choix
// automatique et non un choix de l'utilisateur.
let choixAutomatique = null;
function choisirParDefaut() {
  const premier = leagueOptions.value[0]?.value;
  if (!premier || (selectedLeague.value && selectedLeague.value !== choixAutomatique)) return;
  choixAutomatique = premier;
  selectedLeague.value = premier;
}
watch(() => favoris.leagues.map((l) => l.name).join('|'), choisirParDefaut);
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
          <span class="cm-chip is-accent" title="Lu dans le magasin local, alimenté par FotMob : aucun appel facturé"><AppIcon name="database" :size="11" />FotMob</span>
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
      <!-- 1. LA SOURCE ET LA PÉRIODE : FotMob, lu en local, gratuit (03/10/2026). -->
      <AppCard
        icon="database"
        eyebrow="Source : FotMob"
        title="Statistiques du championnat"
        subtitle="Chaque champ est la moyenne, pour chaque équipe du classement, de ses matchs de ce championnat, lus dans le magasin local que l'actualisation automatique remplit depuis FotMob — aucun appel facturé."
      >
        <div class="team-stats__body">
          <div class="cm-toolbar team-stats__source">
            <AppSelect v-model="periode" label="Période" :options="PERIODES" class="team-stats__sample" />
            <div v-if="couverture" class="team-stats__coverage">
              <span class="cm-chip is-section"><AppIcon name="users" :size="11" />{{ couverture.equipes }} équipes</span>
              <span class="cm-chip"><AppIcon name="list" :size="11" />{{ couverture.parEquipe }}</span>
              <span v-if="couverture.debut" class="cm-chip"><AppIcon name="calendar" :size="11" />du {{ couverture.debut }} au {{ couverture.fin }}</span>
              <span v-if="periode === 'saison' && couverture.saison" class="cm-chip"><AppIcon name="trophy" :size="11" />saison {{ couverture.saison }}</span>
              <span
                v-if="couverture.manquantes.length"
                class="cm-chip is-warning"
                :title="`Aucune feuille de match avec statistiques en magasin pour : ${couverture.manquantes.join(', ')}. Elles ne comptent pas dans les moyennes.`"
              >
                <AppIcon name="alert" :size="11" />{{ couverture.manquantes.length }} équipe(s) sans statistiques
              </span>
            </div>
          </div>
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
      <LoadingSpinner v-else-if="fullStatsLoading" label="Lecture des statistiques FotMob…" />
      <EmptyState v-else-if="moyennes.error" icon="alert" title="Statistiques indisponibles" :description="moyennes.error" />
      <EmptyState
        v-else
        icon="barChart"
        title="Aucune statistique en magasin"
        description="FotMob n'a encore relevé aucune feuille de match de ce championnat sur cette période : choisissez une autre période, ou lancez une actualisation dans Réglages."
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

/* ----------------------------------------------------------- couverture */
.team-stats__source {
  align-items: flex-end;
}

/* Ce que couvrent les moyennes, en puces, à côté de la période. */
.team-stats__coverage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding-bottom: 6px;
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
