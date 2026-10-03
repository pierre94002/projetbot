<script setup>
import { computed, onMounted, ref, useId } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppButton from '@/components/common/AppButton.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { useMatchesStore } from '@/stores/matchesStore.js';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';
import { nomNormalise } from '@/utils/favoris.js';

/**
 * Les favoris d'un coup d'œil (03/10/2026, Pierre : « la possibilité
 * d'ajouter des équipes favorites et des ligues favorites ») : les équipes
 * et les championnats, dans l'ordre d'ajout — l'ordre d'affichage —, chacun
 * retirable d'un clic ; et l'ajout par le nom, avec les clubs et les
 * championnats de la liste des matchs en suggestions. L'étoile ☆ à côté d'un
 * club ou d'un championnat, partout dans l'appli, fait la même chose.
 */
const favoris = useFavoritesStore();
const matchesStore = useMatchesStore();
const listeId = useId();

// Les suggestions viennent de la liste des matchs : chargée si on arrive ici directement.
onMounted(() => {
  if (!matchesStore.matches.length && !matchesStore.loading) matchesStore.fetchMatches();
});

/** Les clubs de la liste des matchs, un par nom et par championnat, hors favoris. */
const suggestionsEquipes = computed(() => {
  const vus = new Map();
  for (const m of matchesStore.matches) {
    for (const nom of [m.home, m.away]) {
      const cle = `${nomNormalise(nom)}|${m.league ?? ''}`;
      if (nom && !vus.has(cle)) vus.set(cle, { name: nom, league: m.league ?? null, valeur: m.league ? `${nom} · ${formatLeagueOptionLabel(m.league)}` : nom });
    }
  }
  return [...vus.values()]
    .filter((e) => !favoris.isFavoriteTeam(e.name, e.league))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
});

/** Les championnats de la liste des matchs, hors favoris, avec leur drapeau. */
const suggestionsLigues = computed(() =>
  [...new Set(matchesStore.matches.map((m) => m.league).filter(Boolean))]
    .filter((l) => !favoris.isFavoriteLeague(l))
    .sort((a, b) => formatLeagueOptionLabel(a).localeCompare(formatLeagueOptionLabel(b), 'fr'))
    .map((l) => ({ value: l, label: formatLeagueOptionLabel(l), league: l }))
);

const nouvelleEquipe = ref('');
const nouvelleLigue = ref('');

async function ajouterEquipe() {
  const saisie = nouvelleEquipe.value.trim();
  if (!saisie) return;
  // Le club choisi dans les suggestions garde son championnat (pour son
  // identifiant FotMob, et pour départager deux homonymes) ; un nom tapé à la
  // main prend la première suggestion de ce nom, sinon part seul.
  const suggestion =
    suggestionsEquipes.value.find((e) => e.valeur === saisie) ?? suggestionsEquipes.value.find((e) => nomNormalise(e.name) === nomNormalise(saisie));
  await favoris.setTeam({ name: suggestion?.name ?? saisie, league: suggestion?.league ?? null }, true);
  nouvelleEquipe.value = '';
}

async function ajouterLigue() {
  if (!nouvelleLigue.value) return;
  await favoris.setLeague(nouvelleLigue.value, true);
  nouvelleLigue.value = '';
}
</script>

<template>
  <div class="favs">
    <p v-if="favoris.error" class="cm-note is-warning favs__error">
      <AppIcon name="alert" :size="14" />
      <span>Favoris indisponibles : {{ favoris.error }}</span>
    </p>

    <div class="cm-grid-2 favs__grid">
      <!-- Les équipes. -->
      <section class="favs__col">
        <h4 class="cm-group-title favs__title">
          <AppIcon name="shield" :size="12" />Équipes favorites
          <span class="favs__count">{{ favoris.teams.length }}</span>
        </h4>
        <ol v-if="favoris.teams.length" class="favs__list">
          <li v-for="team in favoris.teams" :key="`${team.id ?? ''}|${team.name}`" class="favs__item">
            <TeamCrest :name="team.name" :league="team.league" :team-id="team.id" :size="24" />
            <span class="favs__name">{{ team.name }}</span>
            <LeagueBadge v-if="team.league" :league="team.league" class="favs__league" />
            <button type="button" class="favs__remove" :title="`Retirer ${team.name} des favoris`" :aria-label="`Retirer ${team.name} des favoris`" @click="favoris.setTeam({ name: team.name, league: team.league, id: team.id }, false)">
              <AppIcon name="x" :size="12" />
            </button>
          </li>
        </ol>
        <p v-else class="favs__empty">
          Aucune équipe favorite. L'étoile <AppIcon name="star" :size="11" /> à côté d'un club — liste des matchs, page d'un match ou d'une équipe — l'ajoute ; ou tapez son nom ci-dessous.
        </p>
        <form class="favs__add" @submit.prevent="ajouterEquipe">
          <label class="favs__field">
            <AppIcon name="search" :size="14" />
            <input v-model="nouvelleEquipe" type="text" :list="`${listeId}-equipes`" placeholder="Ajouter une équipe…" aria-label="Ajouter une équipe favorite" />
          </label>
          <datalist :id="`${listeId}-equipes`">
            <option v-for="e in suggestionsEquipes" :key="e.valeur" :value="e.valeur" />
          </datalist>
          <AppButton type="submit" variant="secondary" size="sm" :disabled="!nouvelleEquipe.trim()">
            <template #icon><AppIcon name="star" :size="13" /></template>
            Ajouter
          </AppButton>
        </form>
      </section>

      <!-- Les championnats. -->
      <section class="favs__col">
        <h4 class="cm-group-title favs__title">
          <AppIcon name="trophy" :size="12" />Championnats favoris
          <span class="favs__count">{{ favoris.leagues.length }}</span>
        </h4>
        <ol v-if="favoris.leagues.length" class="favs__list">
          <li v-for="league in favoris.leagues" :key="league.name" class="favs__item">
            <LeagueBadge :league="league.name" class="favs__league-main" />
            <button type="button" class="favs__remove" :title="`Retirer ${league.name} des favoris`" :aria-label="`Retirer ${league.name} des favoris`" @click="favoris.setLeague(league.name, false)">
              <AppIcon name="x" :size="12" />
            </button>
          </li>
        </ol>
        <p v-else class="favs__empty">
          Aucun championnat favori. L'étoile <AppIcon name="star" :size="11" /> sur l'en-tête d'un championnat, dans la liste des matchs, l'ajoute ; ou choisissez-le ci-dessous.
        </p>
        <form class="favs__add" @submit.prevent="ajouterLigue">
          <AppSelect v-model="nouvelleLigue" :options="suggestionsLigues" placeholder="Ajouter un championnat…" class="favs__select" />
          <AppButton type="submit" variant="secondary" size="sm" :disabled="!nouvelleLigue">
            <template #icon><AppIcon name="star" :size="13" /></template>
            Ajouter
          </AppButton>
        </form>
      </section>
    </div>

    <p class="cm-note favs__note">
      <AppIcon name="info" :size="14" />
      <span>
        Les favoris passent en premier : les matchs de vos équipes forment un bloc « Mes équipes favorites » en tête de la liste des
        matchs, rangé par compétition ; les championnats favoris suivent, dans l'ordre où vous les avez ajoutés. De même dans les
        sélecteurs de compétition, le calendrier, Mes paris, l'historique et les tickets. Les classements gardent leur ordre : vos
        équipes y portent une étoile.
      </span>
    </p>
  </div>
</template>

<style scoped>
.favs {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.favs__error,
.favs__note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.favs__error svg,
.favs__note svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.favs__note svg {
  color: var(--cm-info);
}

.favs__error svg {
  color: var(--cm-warning);
}

.favs__col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.favs__title {
  gap: 8px;
}

.favs__count {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--cm-gold-soft);
  color: var(--cm-gold);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0;
}

/* --------------------------------------------------------------- liste */
.favs__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.favs__item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 6px 8px 6px 10px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  border-left: 3px solid var(--cm-gold);
  background: var(--cm-surface-alt);
}

.favs__name {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.favs__league {
  flex-shrink: 1;
  min-width: 0;
  opacity: 0.85;
}

.favs__league-main {
  flex: 1;
  min-width: 0;
}

.favs__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  margin-left: auto;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--cm-text-muted);
  cursor: pointer;
  transition: background var(--cm-transition), color var(--cm-transition);
}

.favs__remove:hover {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.favs__empty {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--cm-radius);
  border: 1px dashed var(--cm-border);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.favs__empty :deep(svg) {
  vertical-align: -1px;
  color: var(--cm-gold);
}

/* -------------------------------------------------------------- ajout */
.favs__add {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Même champ-pilule que la barre de commande de la page Matchs. */
.favs__field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: rgb(var(--cm-glass-tint) / var(--cm-glass-alpha-1));
  color: var(--cm-text-muted);
  transition: border-color var(--cm-transition), box-shadow var(--cm-transition);
}

.favs__field:focus-within {
  border-color: rgba(var(--cm-section-rgb) / 0.55);
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.16);
}

.favs__select {
  flex: 1;
}

.favs__field input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--cm-text-primary);
  font: inherit;
  font-size: 13px;
  outline: none;
}

.favs__field input::placeholder {
  color: var(--cm-text-muted);
}

.favs__add :deep(.btn) {
  border-radius: 999px;
}
</style>
