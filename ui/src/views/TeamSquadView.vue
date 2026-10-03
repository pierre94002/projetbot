<script setup>
import { computed, onMounted, ref } from 'vue';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { useToastStore } from '@/stores/toastStore.js';
import { teamStatsApi } from '@/services/teamStatsApi.js';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import AppCard from '@/components/common/AppCard.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import TeamLineup from '@/components/matches/TeamLineup.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import { formatKickoff } from '@/utils/format.js';
// describeLineupUnavailable est appelée par le gabarit (compo indisponible) :
// elle manquait à l'import, la branche aurait planté à l'exécution.
import { LINEUP_UNAVAILABLE_MESSAGES, describeLineupUnavailable } from '@/utils/lineupMessages.js';

const matchesStore = useMatchesStore();
const toastStore = useToastStore();


// --- Composition en direct ---------------------------------------------

// Option vide en tête : sans elle, le <select> affiche visuellement le
// premier match alors que le modèle reste vide tant que l'utilisateur n'a
// rien choisi — le bouton resterait désactivé sans jamais pouvoir s'activer.
const matchOptions = computed(() => [
  { value: '', label: 'Choisir un match…' },
  ...matchesStore.matches.map((m) => ({ value: m.matchId, label: `${m.home} vs ${m.away} · ${formatKickoff(m.commenceTime)}` }))
]);

const selectedMatchId = ref('');
const lineups = ref(null); // { loading, error, result }

async function loadLineups() {
  const match = matchesStore.matches.find((m) => m.matchId === selectedMatchId.value);
  if (!match) return;

  lineups.value = { loading: true, error: null, result: null };
  try {
    const result = await teamStatsApi.getLineupsByName(match.home, match.commenceTime, match.away, match.league);
    lineups.value = { loading: false, error: null, result };
  } catch (error) {
    lineups.value = { loading: false, error: error.message, result: null };
    toastStore.error(`Composition indisponible : ${error.message}`);
  }
}

// --- Statistiques individuelles des joueurs ------------------------------
const playersTeamQuery = ref('');
const players = ref(null); // { loading, error, result }

/** « Σ Totaux » (cumul de la saison) ou « ⌀ Par match » (par match joué). */
const playerMode = ref('totals');

// Saison consultée. Les feuilles de match remontent plusieurs saisons : on
// peut donc afficher l'effectif d'une saison passée, pas seulement l'actuelle.
const squadSeason = ref(null);
const squadSeasons = ref([]);

const seasonOptions = computed(() => [
  // Toutes saisons confondues : la carrière du joueur dans le magasin, et
  // donc des moyennes assises sur bien plus de rencontres.
  { value: 'all', label: 'Toutes les saisons' },
  ...squadSeasons.value.map((s) => ({
    value: seasonStartYear(s.season),
    label: `${s.season} — ${s.matches.toLocaleString('fr-FR')} matchs`
  }))
]);

/** "2024-25" -> 2024, l'année de début, telle que l'attend l'API. */
function seasonStartYear(label) {
  return Number(String(label).slice(0, 4));
}

async function loadSquadSeasons() {
  try {
    const coverage = await matchStatsApi.coverage();
    squadSeasons.value = [...(coverage.seasons ?? [])].sort((a, b) => b.season.localeCompare(a.season));
    if (squadSeason.value === null) squadSeason.value = seasonStartYear(squadSeasons.value[0]?.season ?? '');
  } catch {
    squadSeasons.value = []; // Le sélecteur disparaît ; la saison en cours reste servie par défaut.
  }
}

/**
 * Colonnes chiffrées du tableau d'effectif. Seules celles qu'au moins un
 * joueur renseigne sont affichées : la source ne publie ni minutes ni note,
 * et les arrêts ne concernent que les gardiens — des colonnes entièrement
 * vides n'apprendraient rien.
 */
const PLAYER_COLUMNS = [
  { key: 'rating', label: 'Note', title: 'Note moyenne', decimals: 2, averageOnly: true },
  { key: 'minutes', label: 'Min.', title: 'Minutes jouées' },
  { key: 'goals', label: 'Buts', title: 'Buts marqués' },
  { key: 'assists', label: 'Passes D.', title: 'Passes décisives' },
  { key: 'xg', label: 'xG', title: 'Buts attendus', decimals: 2 },
  { key: 'xa', label: 'xA', title: 'Passes décisives attendues', decimals: 2 },
  { key: 'shots', label: 'Tirs', title: 'Tirs tentés' },
  { key: 'shotsOnTarget', label: 'Cadrés', title: 'Tirs cadrés' },
  { key: 'touches', label: 'Touches', title: 'Ballons touchés' },
  { key: 'passes', label: 'Passes', title: 'Passes tentées' },
  { key: 'passesAccurate', label: 'Réussies', title: 'Passes réussies' },
  { key: 'keyPasses', label: 'Occasions', title: 'Occasions créées' },
  { key: 'duelsWon', label: 'Duels', title: 'Duels remportés' },
  { key: 'tackles', label: 'Tacles', title: 'Tacles' },
  { key: 'interceptions', label: 'Interc.', title: 'Interceptions' },
  { key: 'clearances', label: 'Dégag.', title: 'Dégagements' },
  { key: 'foulsCommitted', label: 'Fautes', title: 'Fautes commises' },
  { key: 'foulsSuffered', label: 'Subies', title: 'Fautes subies' },
  { key: 'offsides', label: 'H-J', title: 'Hors-jeu' },
  { key: 'saves', label: 'Arrêts', title: 'Arrêts (gardiens)' },
  { key: 'goalsConceded', label: 'Encaissés', title: 'Buts encaissés (gardiens)' },
  { key: 'yellowCards', label: 'Jaunes', title: 'Cartons jaunes' },
  { key: 'redCards', label: 'Rouges', title: 'Cartons rouges' }
];

const squadPlayers = computed(() => players.value?.result?.players ?? []);
const hasAverages = computed(() => squadPlayers.value.some((p) => p.averages && Object.keys(p.averages).length));

const playerColumns = computed(() =>
  PLAYER_COLUMNS.filter((col) => {
    // Une note ne s'additionne pas : sa colonne n'a de sens qu'en moyenne.
    if (col.averageOnly && playerMode.value === 'totals') return false;
    return squadPlayers.value.some((p) => Number.isFinite(Number(p.totals?.[col.key] ?? p[col.key])));
  })
);

/**
 * Une case vide plutôt qu'un zéro : un gardien n'a pas « 0 hors-jeu », la
 * statistique ne le concerne pas. Distinguer les deux évite de laisser croire
 * à une donnée mesurée là où il n'y en a pas.
 */
function playerCell(player, col) {
  const { key, decimals } = col;
  if (playerMode.value === 'averages') {
    const value = player.averages?.[key];
    if (!Number.isFinite(value)) return '—';
    // Deux décimales pour les mesures fines (note, xG), une seule sinon —
    // « 4,5 tirs par match » se lit mieux que « 4,50 ».
    return value.toFixed(decimals ?? 1).replace('.', ',');
  }
  const value = player.totals?.[key] ?? player[key];
  if (!Number.isFinite(Number(value))) return '—';
  const total = Number(value);
  return decimals ? total.toFixed(decimals).replace('.', ',') : String(total);
}

onMounted(loadSquadSeasons);

async function loadPlayers() {
  const name = playersTeamQuery.value.trim();
  if (!name) return;

  players.value = { loading: true, error: null, result: null };
  try {
    // Saison choisie, ou la plus récente du magasin à défaut — jamais
    // resolveCurrentSeason()/2024 côté serveur, qui n'est qu'un repli quand
    // la vraie saison échoue. Le repli recherche web reste actif si aucune
    // source ne couvre la saison demandée.
    const result = await teamStatsApi.getPlayersByName(name, squadSeason.value ?? undefined);
    players.value = { loading: false, error: null, result };
  } catch (error) {
    players.value = { loading: false, error: error.message, result: null };
    toastStore.error(`Effectif indisponible : ${error.message}`);
  }
}
</script>

<template>
  <div class="team-squad cm-page">
    <!-- Le bandeau de l'onglet : ce qu'il montre, et ce qu'il y a à choisir. -->
    <section class="cm-hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="users" :size="18" /></span>
          Compo &amp; joueurs
        </h2>
        <span class="cm-hero__chips">
          <span class="cm-chip is-section"><AppIcon name="matches" :size="11" />{{ matchesStore.matches.length }} match(s) au choix</span>
          <span v-if="squadSeasons.length" class="cm-chip"><AppIcon name="calendar" :size="11" />{{ squadSeasons.length }} saison(s) en magasin</span>
        </span>
      </div>
      <p class="cm-hero__subtitle">
        La composition publiée par les clubs pour une rencontre à venir, et l'effectif complet d'une équipe avec les statistiques de chacun de ses
        joueurs, reconstitué depuis les feuilles de match.
      </p>
    </section>

    <!-- 1. COMPOSITION EN DIRECT -->
    <AppCard icon="layers" eyebrow="En direct" title="Composition en direct" subtitle="Formation, titulaires et remplaçants publiés par les clubs">
      <div class="team-squad__body">
        <div class="cm-toolbar team-squad__toolbar">
          <AppSelect v-model="selectedMatchId" label="Match" :options="matchOptions" class="team-squad__grow" />
          <AppButton variant="primary" :loading="lineups?.loading" :disabled="!selectedMatchId" @click="loadLineups">
            <template #icon><AppIcon name="bolt" :size="15" /></template>
            Voir la composition
          </AppButton>
        </div>

        <LoadingSpinner v-if="lineups?.loading" label="Récupération de la composition…" />

        <EmptyState
          v-else-if="lineups?.result && !lineups.result.available"
          icon="target"
          title="Composition indisponible"
          :description="describeLineupUnavailable(lineups.result)"
        />

        <EmptyState v-else-if="lineups?.error" icon="alert" title="Erreur" :description="lineups.error" />

        <template v-else-if="lineups?.result?.available">
          <!-- D'où vient la composition quand ce n'est pas API-Football. -->
          <div v-if="lineups.result.source === 'web'" class="cm-note is-info">
            <span class="cm-icon-box is-info is-sm"><AppIcon name="globe" :size="14" /></span>
            <div>
              <p class="cm-note__title">Source</p>
              <p class="cm-note__text">
                Composition {{ lineups.result.officialOrProbable === 'official' ? 'officielle' : 'probable' }} trouvée via recherche web{{ lineups.result.sourceUrl ? ` (${lineups.result.sourceUrl})` : '' }} — pas depuis API-Football.
              </p>
            </div>
          </div>
          <!-- Une équipe par colonne dès que la place existe. -->
          <div class="team-squad__lineups cm-stagger">
            <TeamLineup v-for="(team, index) in lineups.result.teams" :key="team.teamId ?? `${team.teamName}-${index}`" :team="team" />
          </div>
        </template>

        <EmptyState
          v-else
          icon="matches"
          title="Choisis un match"
          description="Sélectionne une rencontre puis clique sur « Voir la composition »."
        />
      </div>
    </AppCard>

    <!-- 2. EFFECTIF ET STATISTIQUES INDIVIDUELLES -->
    <AppCard
      icon="barChart"
      eyebrow="Effectif"
      title="Statistiques individuelles des joueurs"
      subtitle="Effectif complet reconstitué depuis les feuilles de match — totaux de la saison ou moyennes par match joué"
    >
      <div class="team-squad__body">
        <div class="cm-toolbar team-squad__toolbar">
          <AppTextField v-model="playersTeamQuery" label="Équipe" placeholder="Ex. Real Madrid…" class="team-squad__grow" @keyup.enter="loadPlayers">
            <template #icon><AppIcon name="search" :size="15" /></template>
          </AppTextField>
          <AppSelect v-if="seasonOptions.length > 1" v-model="squadSeason" label="Saison" :options="seasonOptions" class="team-squad__season" />
          <AppButton variant="primary" :loading="players?.loading" :disabled="!playersTeamQuery.trim()" @click="loadPlayers">
            <template #icon><AppIcon name="bolt" :size="15" /></template>
            Charger l'effectif
          </AppButton>
        </div>

        <LoadingSpinner v-if="players?.loading" label="Récupération de l'effectif…" />
        <EmptyState v-else-if="players?.error" icon="alert" title="Effectif introuvable" :description="players.error" />
        <EmptyState
          v-else-if="players?.result && players.result.players.length === 0"
          icon="target"
          title="Aucun joueur trouvé"
          description="Aucune statistique disponible pour cette équipe sur la saison consultée."
        />

        <div v-else-if="players?.result" class="team-squad__result">
          <!-- Le club trouvé, la saison, la provenance ; à droite, totaux ou moyennes. -->
          <div class="team-squad__players-head">
            <div class="team-squad__team">
              <TeamCrest :name="players.result.teamName" :size="40" class="team-squad__team-crest" />
              <div class="team-squad__team-titles">
                <p class="team-squad__team-name">{{ players.result.teamName }}</p>
                <p class="cm-text-muted team-squad__players-season">
                  <span class="cm-chip is-section"><AppIcon name="calendar" :size="11" />saison {{ players.result.season }}</span>
                  <span class="cm-chip"><AppIcon name="users" :size="11" />{{ players.result.players.length }} joueurs</span>
                  <template v-if="players.result.source === 'match-stats'">
                    <span class="cm-chip" title="Effectif reconstitué depuis les feuilles de match du magasin"><AppIcon name="database" :size="11" />reconstitué depuis {{ players.result.matchesCounted }} feuille(s) de match</span>
                  </template>
                  <template v-else-if="players.result.source === 'web'">
                    <span class="cm-chip is-info"><AppIcon name="globe" :size="11" />trouvé via recherche web, pas depuis API-Football</span>
                  </template>
                </p>
              </div>
            </div>
            <div v-if="hasAverages" class="team-squad__toggle" role="group" aria-label="Totaux ou moyennes">
              <button type="button" :class="{ 'is-active': playerMode === 'totals' }" @click="playerMode = 'totals'">Σ Totaux</button>
              <button type="button" :class="{ 'is-active': playerMode === 'averages' }" @click="playerMode = 'averages'">⌀ Par match</button>
            </div>
          </div>

          <div class="cm-table-wrap team-squad__wrap">
            <table class="cm-table team-squad__players-table">
              <thead>
                <tr>
                  <th class="is-left">Joueur</th>
                  <th class="is-left">Poste</th>
                  <th title="Présences sur la feuille de match">Feuille</th>
                  <th title="Matchs réellement joués — titularisations et entrées en jeu">Joués</th>
                  <th title="Titularisations">Titul.</th>
                  <th v-for="col in playerColumns" :key="col.key" :title="col.title">{{ col.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in players.result.players" :key="p.id">
                  <td class="is-left team-squad__players-name">
                    <span class="team-squad__ident">
                      <TeamCrest :name="players.result.teamName" :size="16" class="team-squad__flag" />
                      <PlayerFlag :player-id="p.id ?? null" :size="14" class="team-squad__flag" />
                      <span class="cm-truncate">{{ p.name }}</span>
                    </span>
                  </td>
                  <td class="is-left"><span class="team-squad__position">{{ p.position ?? '—' }}</span></td>
                  <td class="cm-numeric cm-text-muted">{{ p.onSheet ?? '—' }}</td>
                  <td class="cm-numeric is-strong">{{ p.appearances ?? '—' }}</td>
                  <td class="cm-numeric cm-text-muted">{{ p.starts ?? '—' }}</td>
                  <td v-for="col in playerColumns" :key="col.key" class="cm-numeric">{{ playerCell(p, col) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <EmptyState
          v-else
          icon="matches"
          title="Cherche une équipe"
          description="Tape un nom d'équipe puis clique sur « Charger l'effectif »."
        />
      </div>
    </AppCard>
  </div>
</template>

<style scoped>
.team-squad {
  /* Se règle sur SA largeur : les deux compositions passent en colonnes dès que la place existe. */
  container: squad / inline-size;
}

/* Le corps d'une carte : commandes, puis contenu, espacés. */
.team-squad__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.team-squad__toolbar {
  padding-bottom: 14px;
  border-bottom: 1px solid var(--cm-border-soft);
}

.team-squad__grow {
  flex: 1 1 260px;
}

.team-squad__season {
  flex: 0 1 240px;
}

/* --------------------------------------------------------- compositions */
.team-squad__lineups {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
}

/* ------------------------------------------------------------- effectif */
.team-squad__result {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.team-squad__players-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px 16px;
  flex-wrap: wrap;
}

.team-squad__team {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.team-squad__team-crest {
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.18);
}

.team-squad__team-titles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.team-squad__team-name {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

.team-squad__players-season {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11.5px;
}

/* Σ Totaux / ⌀ Par match : commutateur segmenté, l'actif en couleur de section. */
.team-squad__toggle {
  display: inline-flex;
  flex-shrink: 0;
  gap: 3px;
  padding: 3px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
}

.team-squad__toggle button {
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--cm-text-secondary);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 13px;
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition), box-shadow var(--cm-transition);
}

.team-squad__toggle button:hover {
  color: var(--cm-text-primary);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-2));
}

.team-squad__toggle button.is-active {
  background: var(--cm-section);
  color: var(--cm-section-on);
  box-shadow: 0 4px 14px rgba(var(--cm-section-rgb) / 0.3);
}

/* Le tableau garde son en-tête visible quand l'effectif est long. */
.team-squad__wrap {
  max-height: 72vh;
  overflow: auto;
}

.team-squad__players-name {
  font-weight: 600;
  max-width: 220px;
}

/* Logo puis drapeau puis le nom, tronqué au besoin. */
.team-squad__ident {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--cm-text-primary);
}

.team-squad__flag {
  flex-shrink: 0;
}

.team-squad__position {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

/* Assez de place : une équipe par colonne. */
@container squad (min-width: 760px) {
  .team-squad__lineups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Panneau étroit : les commandes s'empilent. */
@container squad (max-width: 520px) {
  .team-squad__grow,
  .team-squad__season {
    flex-basis: 100%;
  }
}
</style>
