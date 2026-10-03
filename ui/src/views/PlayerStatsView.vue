<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { standingsApi } from '@/services/standingsApi.js';
import { useTeamStatsModalStore } from '@/stores/teamStatsModalStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';
import { aUneFiche } from '@/utils/playerVisuals.js';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';

/**
 * Classement des joueurs d'un championnat, servi par le magasin local
 * (FotMob/ESPN). Les 810 000 lignes joueur collectées n'avaient aucun écran :
 * le seul existant, dans "Compo & joueurs", interroge API-Football, dont le
 * plan gratuit s'arrête à 2024 et ne couvre pas les championnats ajoutés
 * depuis (Écosse, Grèce, Turquie, Portugal, Belgique, Pays-Bas).
 */
// Un clic sur l'équipe d'un joueur ouvre la page de l'équipe (cf. TeamView.vue).
const teamStatsModalStore = useTeamStatsModalStore();

// Compétition, saison et poste gardés dans l'adresse (?ligue=&saison=&poste=) :
// « Retour » depuis la page d'une équipe ramène au même tableau, pas à la
// première compétition de la liste.
const route = useRoute();
const router = useRouter();
let saisonDemandee = typeof route.query.saison === 'string' ? route.query.saison : null;
function memoriser() {
  router
    .replace({
      query: {
        ...route.query,
        ligue: selectedLeague.value || undefined,
        saison: selectedSeason.value || undefined,
        poste: role.value !== 'field' ? role.value : undefined
      }
    })
    .catch(() => {});
}

const leagues = ref([]);
const seasons = ref([]);
const selectedLeague = ref('');
const selectedSeason = ref('');
const teamQuery = ref('');
const role = ref('field');
const sortKey = ref('goals');

const state = ref({ loading: false, error: null, players: [] });

const ROLE_OPTIONS = [
  { value: 'field', label: 'Tous les joueurs de champ' },
  { value: 'forward', label: 'Attaquants' },
  { value: 'midfielder', label: 'Milieux' },
  { value: 'defender', label: 'Défenseurs' },
  { value: 'goalkeeper', label: 'Gardiens' }
];

/** Tri par défaut : ce qui définit le poste, pas ce qui flatte le buteur. */
const DEFAULT_SORT = { field: 'goals', forward: 'goals', midfielder: 'rating', defender: 'rating', goalkeeper: 'cleanSheets' };

const COMMON_HEAD = [
  { key: 'played', label: 'M', title: 'Matchs joués' },
  { key: 'minutes', label: 'Min', title: 'Minutes jouées' },
  { key: 'rating', label: 'Note', title: 'Note moyenne', decimals: 2 }
];

const CARDS = [
  { key: 'yellowCards', label: 'CJ', title: 'Cartons jaunes' },
  { key: 'redCards', label: 'CR', title: 'Cartons rouges' }
];

const FORWARD_COLUMNS = [
  ...COMMON_HEAD,
  { key: 'goals', label: 'B', title: 'Buts' },
  { key: 'assists', label: 'PD', title: 'Passes décisives' },
  { key: 'xg', label: 'xG', title: 'Buts attendus cumulés', decimals: 2 },
  { key: 'shots', label: 'Tirs', title: 'Tirs tentés' },
  { key: 'shotsOnTarget', label: 'Cadrés', title: 'Tirs cadrés' },
  { key: 'conversion', label: '% conv.', title: 'Part des tirs convertis en but', decimals: 1, suffix: '%' },
  { key: 'touchesOppBox', label: 'Surf. adv.', title: 'Touches dans la surface adverse' },
  { key: 'keyPasses', label: 'P. clés', title: 'Passes clés' },
  { key: 'aerialPercent', label: '% aér.', title: 'Duels aériens gagnés', decimals: 1, suffix: '%' },
  ...CARDS
];

const MIDFIELDER_COLUMNS = [
  ...COMMON_HEAD,
  { key: 'passes', label: 'Passes', title: 'Passes tentées' },
  { key: 'passPercent', label: '% passes', title: 'Passes réussies', decimals: 1, suffix: '%' },
  { key: 'keyPasses', label: 'P. clés', title: 'Passes clés' },
  { key: 'assists', label: 'PD', title: 'Passes décisives' },
  { key: 'xa', label: 'xA', title: 'Passes décisives attendues', decimals: 2 },
  { key: 'finalThirdPasses', label: 'Dern. tiers', title: 'Passes dans le dernier tiers' },
  { key: 'recoveries', label: 'Récup.', title: 'Ballons récupérés' },
  { key: 'tackles', label: 'Tacles', title: 'Tacles' },
  { key: 'interceptions', label: 'Interc.', title: 'Interceptions' },
  { key: 'duelPercent', label: '% duels', title: 'Duels gagnés', decimals: 1, suffix: '%' },
  { key: 'goals', label: 'B', title: 'Buts' },
  ...CARDS
];

const DEFENDER_COLUMNS = [
  ...COMMON_HEAD,
  { key: 'clearances', label: 'Dégag.', title: 'Dégagements' },
  { key: 'interceptions', label: 'Interc.', title: 'Interceptions' },
  { key: 'tackles', label: 'Tacles', title: 'Tacles' },
  { key: 'blocks', label: 'Blocs', title: 'Tirs contrés' },
  { key: 'recoveries', label: 'Récup.', title: 'Ballons récupérés' },
  { key: 'aerialPercent', label: '% aér.', title: 'Duels aériens gagnés', decimals: 1, suffix: '%' },
  { key: 'duelPercent', label: '% duels', title: 'Duels gagnés', decimals: 1, suffix: '%' },
  { key: 'dribbledPast', label: 'Dribblé', title: 'Nombre de fois dribblé — plus c’est bas, mieux c’est' },
  { key: 'foulsCommitted', label: 'Fautes', title: 'Fautes commises' },
  { key: 'goals', label: 'B', title: 'Buts' },
  ...CARDS
];

// Colonnes distinctes selon le poste : afficher arrêts et buts encaissés sur
// un attaquant — ou xG sur un gardien — remplirait le tableau de tirets.
const GOALKEEPER_COLUMNS = [
  { key: 'played', label: 'M', title: 'Matchs joués' },
  { key: 'minutes', label: 'Min', title: 'Minutes jouées' },
  { key: 'rating', label: 'Note', title: 'Note moyenne', decimals: 2 },
  { key: 'cleanSheets', label: 'CS', title: 'Clean sheets — matchs joués sans encaisser' },
  { key: 'saves', label: 'Arrêts', title: 'Arrêts' },
  { key: 'goalsConceded', label: 'Enc.', title: 'Buts encaissés' },
  { key: 'savePercent', label: '% arr.', title: "Part des tirs cadrés arrêtés", decimals: 1, suffix: '%' },
  { key: 'xgotFaced', label: 'xGOTc', title: 'xG cadrés subis — qualité des tirs affrontés', decimals: 2 },
  { key: 'goalsPrevented', label: 'Évités', title: 'Buts évités : xGOT subis moins buts encaissés. Positif = au-dessus de son niveau attendu', decimals: 2, signed: true },
  { key: 'duelsWon', label: 'Duels', title: 'Duels gagnés' },
  { key: 'yellowCards', label: 'CJ', title: 'Cartons jaunes' },
  { key: 'redCards', label: 'CR', title: 'Cartons rouges' }
];

const FIELD_COLUMNS = [
  { key: 'played', label: 'M', title: 'Matchs joués' },
  { key: 'minutes', label: 'Min', title: 'Minutes jouées' },
  { key: 'rating', label: 'Note', title: 'Note moyenne', decimals: 2 },
  { key: 'goals', label: 'B', title: 'Buts' },
  { key: 'assists', label: 'PD', title: 'Passes décisives' },
  { key: 'xg', label: 'xG', title: 'Buts attendus cumulés', decimals: 2 },
  { key: 'xa', label: 'xA', title: 'Passes décisives attendues', decimals: 2 },
  { key: 'shots', label: 'Tirs', title: 'Tirs tentés' },
  { key: 'keyPasses', label: 'P. clés', title: 'Passes clés' },
  { key: 'duelsWon', label: 'Duels', title: 'Duels gagnés' },
  { key: 'tackles', label: 'Tacles', title: 'Tacles' },
  { key: 'interceptions', label: 'Interc.', title: 'Interceptions' },
  { key: 'yellowCards', label: 'CJ', title: 'Cartons jaunes' },
  { key: 'redCards', label: 'CR', title: 'Cartons rouges' }
];

const COLUMNS_BY_ROLE = {
  goalkeeper: GOALKEEPER_COLUMNS,
  forward: FORWARD_COLUMNS,
  midfielder: MIDFIELDER_COLUMNS,
  defender: DEFENDER_COLUMNS
};

const COLUMNS = computed(() => COLUMNS_BY_ROLE[role.value] ?? FIELD_COLUMNS);

const ROLE_NOUN = { goalkeeper: 'gardien', forward: 'attaquant', midfielder: 'milieu', defender: 'défenseur' };
const roleNoun = computed(() => ROLE_NOUN[role.value] ?? 'joueur');

// Présentation : le poste tel que l'affiche le sélecteur (sur-titre de la
// carte) et la colonne de tri courante (en-tête surligné, puce « Tri »).
const roleLabel = computed(() => ROLE_OPTIONS.find((o) => o.value === role.value)?.label ?? 'Joueurs');
const activeColumn = computed(() => COLUMNS.value.find((c) => c.key === sortKey.value) ?? null);

const leagueOptions = computed(() => leagues.value.map((l) => ({ value: l, label: formatLeagueOptionLabel(l) })));

const seasonOptions = computed(() =>
  // Le libellé vient du serveur : « 2025 » pour un championnat d'année
  // civile (Suède, MLS, Brésil…), « 2025-26 » pour les autres.
  seasons.value.map((s) => ({ value: String(s.season), label: `${s.label ?? s.season} (${s.matches} matchs)` }))
);

// Filtrage par équipe côté navigateur : la liste renvoyée est déjà bornée,
// un aller-retour serveur par frappe n'apporterait rien.
// Tous les pourcentages se déduisent des CUMULS, jamais d'une moyenne des
// pourcentages match par match : un match à un seul duel pèserait alors
// autant qu'un match à vingt.
const ratio = (numerator, denominator) => (denominator > 0 ? (numerator / denominator) * 100 : null);

function withRates(player) {
  return {
    ...player,
    savePercent: ratio(player.saves, (player.saves ?? 0) + (player.goalsConceded ?? 0)),
    passPercent: ratio(player.passesAccurate, player.passes),
    duelPercent: ratio(player.duelsWon, player.duelsTotal),
    aerialPercent: ratio(player.aerialsWon, player.aerialsTotal),
    conversion: ratio(player.goals, player.shots)
  };
}

const displayedPlayers = computed(() => {
  const query = teamQuery.value.trim().toLowerCase();
  const base = state.value.players.map(withRates);
  const filtered = query ? base.filter((p) => p.team?.toLowerCase().includes(query) || p.name?.toLowerCase().includes(query)) : base;
  const key = sortKey.value;
  return [...filtered].sort((a, b) => (b[key] ?? Number.NEGATIVE_INFINITY) - (a[key] ?? Number.NEGATIVE_INFINITY));
});

function cell(player, column) {
  const value = player[column.key];
  if (value === null || value === undefined) return '—';
  const shown = column.decimals ? Number(value).toFixed(column.decimals) : value;
  const signed = column.signed && Number(value) > 0 ? `+${shown}` : shown;
  return column.suffix ? `${signed}${column.suffix}` : signed;
}

async function loadSeasons() {
  if (!selectedLeague.value) return;
  try {
    const result = await matchStatsApi.seasons(selectedLeague.value);
    seasons.value = result.seasons ?? [];
    const current = seasons.value[0];
    // La saison de l'adresse, une seule fois (au retour sur la page), si elle existe dans cette compétition.
    const demandee = saisonDemandee ? seasons.value.find((s) => String(s.season) === saisonDemandee) : null;
    saisonDemandee = null;
    selectedSeason.value = demandee ? String(demandee.season) : current ? String(current.season) : '';
  } catch {
    seasons.value = [];
    selectedSeason.value = '';
  }
}

async function loadPlayers() {
  if (!selectedLeague.value || !selectedSeason.value) return;
  state.value = { loading: true, error: null, players: [] };
  try {
    const result = await matchStatsApi.players(selectedLeague.value, { season: selectedSeason.value, role: role.value, limit: 300 });
    state.value = { loading: false, error: null, players: result.players ?? [] };
  } catch (error) {
    state.value = { loading: false, error: error.message, players: [] };
  }
}

watch(selectedLeague, async () => {
  await loadSeasons();
  await loadPlayers();
  memoriser();
});
watch(selectedSeason, () => {
  loadPlayers();
  memoriser();
});
watch(role, () => {
  // Le tri courant n'existe pas forcément dans l'autre jeu de colonnes.
  sortKey.value = DEFAULT_SORT[role.value] ?? 'goals';
  loadPlayers();
  memoriser();
});

onMounted(async () => {
  // Les championnats viennent du magasin lui-même : proposer une compétition
  // sans relevé joueur donnerait un écran vide sans explication.
  const [couverture, classements] = await Promise.allSettled([matchStatsApi.status(), standingsApi.listLeagues()]);
  const avecStats = couverture.status === 'fulfilled' ? (couverture.value.leagues ?? []) : [];
  const connues = classements.status === 'fulfilled' ? (classements.value.leagues ?? []) : [];
  leagues.value = [...new Set([...avecStats, ...connues.filter((l) => avecStats.includes(l))])].sort();
  if (ROLE_OPTIONS.some((o) => o.value === route.query.poste)) role.value = route.query.poste;
  const ligueDemandee = typeof route.query.ligue === 'string' ? route.query.ligue : null;
  if (!selectedLeague.value && leagues.value.length) {
    selectedLeague.value = leagues.value.includes(ligueDemandee) ? ligueDemandee : leagues.value[0];
  }
});
</script>

<template>
  <div class="player-stats cm-page">
    <!-- Le bandeau de l'onglet : ce qu'on regarde, et les quatre commandes qui le choisissent. -->
    <section class="cm-hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="award" :size="18" /></span>
          Statistiques des joueurs
        </h2>
        <span class="cm-hero__chips">
          <span class="cm-chip is-section"><AppIcon name="trophy" :size="11" />{{ leagues.length }} compétition(s)</span>
          <span v-if="displayedPlayers.length" class="cm-chip"><AppIcon name="users" :size="11" />{{ displayedPlayers.length }} {{ roleNoun }}(s)</span>
          <span class="cm-chip"><AppIcon name="database" :size="11" />Magasin local</span>
        </span>
      </div>
      <p class="cm-hero__subtitle">Buts, passes, notes et volume de jeu, cumulés sur la saison — servis par le magasin local.</p>
      <div class="cm-toolbar player-stats__toolbar">
        <AppSelect v-model="selectedLeague" label="Compétition" :options="leagueOptions" />
        <AppSelect v-model="selectedSeason" label="Saison" :options="seasonOptions" :disabled="!seasonOptions.length" />
        <AppSelect v-model="role" label="Poste" :options="ROLE_OPTIONS" />
        <AppTextField v-model="teamQuery" label="Équipe ou joueur" placeholder="Ex. Ajax, Ueda…">
          <template #icon><AppIcon name="search" :size="15" /></template>
        </AppTextField>
      </div>
    </section>

    <LoadingSpinner v-if="state.loading" label="Calcul des cumuls…" />
    <EmptyState v-else-if="state.error" icon="alert" title="Statistiques indisponibles" :description="state.error" />
    <EmptyState
      v-else-if="!leagues.length"
      icon="database"
      title="Aucun relevé joueur"
      description="Le magasin ne contient encore aucune statistique de joueur. Lance une actualisation depuis Réglages > Données."
    />
    <EmptyState
      v-else-if="!displayedPlayers.length"
      icon="target"
      title="Aucun joueur"
      :description="
        teamQuery
          ? `Aucun ${roleNoun} ne correspond à « ${teamQuery} ».`
          : `Aucun ${roleNoun} ne totalise assez de minutes sur cette saison.`
      "
    />

    <!-- LE CLASSEMENT : un tableau triable, la colonne de tri en couleur de section. -->
    <AppCard v-else icon="list" :eyebrow="roleLabel" title="Classement de la saison" subtitle="Au moins 180 minutes sur la saison. Clique sur une colonne pour trier.">
      <template #actions>
        <span v-if="activeColumn" class="cm-chip is-section" :title="`Trié par ${activeColumn.title}`"><AppIcon name="chevronDown" :size="11" />Tri : {{ activeColumn.title }}</span>
      </template>
      <div class="player-stats__body">
        <div class="cm-table-wrap player-stats__wrap">
          <table class="cm-table player-stats__table">
            <thead>
              <tr>
                <th class="player-stats__rank">#</th>
                <th class="is-left player-stats__head-name">{{ roleNoun }}</th>
                <th class="is-left">Équipe</th>
                <th title="Âge du joueur aujourd'hui (date de naissance FotMob)">Âge</th>
                <th
                  v-for="col in COLUMNS"
                  :key="col.key"
                  :title="`${col.title} — cliquer pour trier`"
                  class="player-stats__sortable"
                  :class="{ 'is-active': sortKey === col.key }"
                  @click="sortKey = col.key"
                >
                  <span class="player-stats__sort">
                    <AppIcon v-if="sortKey === col.key" name="chevronDown" :size="11" class="player-stats__sort-icon" />
                    {{ col.label }}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(player, index) in displayedPlayers" :key="`${player.name}-${player.team}`">
                <td class="player-stats__rank cm-numeric">
                  <span class="player-stats__rank-badge" :class="{ 'is-top': index < 3 }">{{ index + 1 }}</span>
                </td>
                <td class="is-left player-stats__name" :title="player.name">
                  <!-- Fiche du joueur (01/10/2026) : statistiques individuelles, match par match ;
                       sa nationalité devant son nom, le logo de son club devant le club. -->
                  <span class="player-stats__ident">
                    <PlayerFlag :code="player.countryCode ?? null" :name="player.countryName ?? null" :player-id="player.playerId ?? null" :size="15" />
                    <RouterLink v-if="aUneFiche(player.playerId)" :to="`/joueur/${player.playerId}`" class="player-stats__player-link cm-truncate">{{ player.name }}</RouterLink>
                    <span v-else class="cm-truncate">{{ player.name }}</span>
                  </span>
                </td>
                <td class="is-left cm-text-muted" :title="player.team">
                  <span v-if="player.team" class="player-stats__ident">
                    <TeamCrest :name="player.team" :league="selectedLeague" :team-id="player.teamId ?? null" :size="18" />
                    <button
                      type="button"
                      class="cm-team-link player-stats__team"
                      :title="`Voir la page de ${player.team}`"
                      @click="teamStatsModalStore.openFor(player.team, selectedLeague)"
                    >
                      {{ player.team }}
                    </button>
                  </span>
                </td>
                <td class="cm-numeric cm-text-muted">{{ player.age ?? '—' }}</td>
                <td v-for="col in COLUMNS" :key="col.key" class="cm-numeric player-stats__cell" :class="{ 'is-active': sortKey === col.key }">
                  {{ cell(player, col) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Comment lire le tableau (le détail dépend du poste). -->
        <div v-if="displayedPlayers.length" class="cm-note is-info player-stats__note">
          <span class="cm-icon-box is-info is-sm"><AppIcon name="info" :size="14" /></span>
          <div>
            <p class="cm-note__title">Lecture</p>
            <p class="cm-note__text">
              {{ displayedPlayers.length }} {{ roleNoun }}(s) — au moins 180 minutes sur la saison. Clique sur une colonne pour trier.
              <template v-if="role === 'goalkeeper'">
                « Évités » compare les xG cadrés subis aux buts réellement encaissés : positif, le gardien a fait mieux que ce que les tirs laissaient attendre.
              </template>
              <template v-else-if="role === 'defender'">
                « Dribblé » se lit à l'envers des autres colonnes : plus le nombre est bas, moins le défenseur a été éliminé.
              </template>
              <template v-else-if="role !== 'field'">
                Les pourcentages sont calculés sur les cumuls de la saison, jamais en moyennant les matchs entre eux.
              </template>
            </p>
          </div>
        </div>
      </div>
    </AppCard>
  </div>
</template>

<style scoped>
.player-stats {
  /* Se règle sur SA largeur : les commandes se partagent la ligne, puis s'empilent. */
  container: playerstats / inline-size;
}

/* Les quatre commandes se partagent la largeur du bandeau. */
.player-stats__toolbar > * {
  flex: 1 1 180px;
}

.player-stats__body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Le tableau garde son en-tête visible sur 300 lignes. */
.player-stats__wrap {
  max-height: 72vh;
  overflow: auto;
}

.player-stats__table {
  font-size: 12.5px;
}

.player-stats__rank {
  width: 44px;
  color: var(--cm-text-muted);
}

.player-stats__rank-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: var(--cm-text-muted);
}

/* Le podium porte la couleur de section. */
.player-stats__rank-badge.is-top {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.player-stats__head-name {
  text-transform: capitalize;
}

.player-stats__name {
  font-weight: 600;
  color: var(--cm-text-primary);
}

/* Drapeau ou logo, puis le nom, tronqué au besoin. */
.player-stats__ident {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  max-width: 220px;
}

.player-stats__player-link {
  color: inherit;
  text-decoration: none;
  transition: color var(--cm-transition);
}

.player-stats__player-link:hover {
  color: var(--cm-section);
  text-decoration: underline;
}

/* En-tête de tri : cliquable, la colonne active en couleur de section avec son filet. */
.player-stats__sortable {
  cursor: pointer;
  user-select: none;
  transition: color var(--cm-transition), background var(--cm-transition);
}

.player-stats__sortable:hover {
  color: var(--cm-text-primary);
  background: var(--cm-surface-hover);
}

.player-stats__sortable.is-active {
  color: var(--cm-section);
  background: rgba(var(--cm-section-rgb) / 0.08);
  box-shadow: inset 0 -2px 0 var(--cm-section);
}

.player-stats__sort {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
}

.player-stats__sort-icon {
  flex-shrink: 0;
}

/* La colonne de tri se lit d'un coup d'œil dans le corps du tableau. */
.player-stats__cell.is-active {
  color: var(--cm-section);
  font-weight: 700;
  background: rgba(var(--cm-section-rgb) / 0.06);
}

/* Le nom d'équipe reste tronqué dans sa colonne, comme le texte qu'il remplace. */
.player-stats__team {
  display: inline-block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.player-stats__note .cm-note__text {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

/* Panneau étroit : une commande par ligne. */
@container playerstats (max-width: 520px) {
  .player-stats__toolbar > * {
    flex-basis: 100%;
  }
}
</style>
