<script setup>
import { computed, reactive, ref, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import MatchListCard from './MatchListCard.vue';
import LeagueBadge from './LeagueBadge.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { formatDay } from '@/utils/format.js';
import { groupMatchesByLeague, groupMatchesByDate } from '@/utils/leagueDisplay.js';
import { liveNow } from '@/utils/liveClock.js';
import { computeMatchStatus } from '@/utils/matchStatus.js';

/**
 * La liste des rencontres, rangée par compétition puis par jour (refonte
 * visuelle du 01/10/2026) : chaque compétition est un bloc replié, avec une
 * vraie ligne d'en-tête (drapeau et nom, l'état du jour en puces — en direct,
 * aujourd'hui, terminés —, le nombre de rencontres, le lien Classement) qui
 * reste collée en haut pendant qu'on fait défiler ses matchs ; dessous, les
 * jours en sous-titres, et une MatchCard par rencontre avec la forme, le
 * badge IA, le report et les cotes 1 / N / 2 à droite.
 *
 * Favoris (03/10/2026, Pierre : « toujours affichés en premier par rapport
 * aux autres ») : en tête, un bloc « Mes équipes favorites » ouvert avec
 * tous les matchs de ces équipes, toutes compétitions confondues ; puis les
 * championnats favoris, dans l'ordre où ils ont été ajoutés ; puis les
 * autres, dans leur ordre habituel. Une étoile sur chaque en-tête de
 * championnat, et à côté de chaque club, ajoute ou retire un favori.
 */
const props = defineProps({
  matches: { type: Array, required: true },
  selectedMatchId: { type: String, default: null },
  formByMatchId: { type: Object, default: () => ({}) },
  aiAnalysisByMatchId: { type: Object, default: () => ({}) },
  incompleteStatsLeagues: { type: Array, default: () => [] }
});

const emit = defineEmits(['select', 'team-click', 'view-standings', 'deselect']);

// Championnats sans statistiques d'équipe complètes en base (cf.
// matchStatsRead.js leaguesWithIncompleteStats) — un Set pour un test
// d'appartenance en O(1) plutôt qu'un .includes() par ligne affichée.
const incompleteStatsSet = computed(() => new Set(props.incompleteStatsLeagues));

// Calendrier de repli (hasOdds: false, cf. seasonCalendarAdapter.js) : seule
// la DATE est connue, l'heure "12:00:00Z" n'est qu'un repère technique pour
// que le match ne bascule pas de jour selon le fuseau — jamais une vraie
// heure de coup d'envoi. Un calcul dessus déclarait "en direct" un match dont
// on ne sait rien, chaque jour vers midi UTC.
function heureConnue(match) {
  return match.hasOdds !== false;
}

// Statut estimé par l'heure du coup d'envoi (cf. matchStatus.js) — aucun flux
// de score en direct dans l'app. `liveNow` (partagée, un seul timer pour
// toute l'app) fait recalculer ce statut toutes les 30s sans recharger la
// page (ex. la ligue chinoise qui se joue à une heure décalée passait
// inaperçue, repliée dans une ligue fermée).
function matchStatus(match) {
  if (!heureConnue(match)) return 'upcoming';
  return computeMatchStatus(match.commenceTime, liveNow.value);
}
function isLive(match) {
  return matchStatus(match) === 'live';
}
function isFinished(match) {
  return matchStatus(match) === 'finished';
}

// Recalculé via `liveNow` (même horloge partagée que isLive/isFinished) pour
// que le badge change de jour tout seul à minuit sans recharger la page.
const todayKey = computed(() => new Date(liveNow.value).toISOString().slice(0, 10));
// "Aujourd'hui" exclut live/terminé : ces deux badges le disent déjà, sans
// quoi un match en direct afficherait trois pastilles pour la même information.
function isUpcomingToday(match) {
  return matchDayKey(match) === todayKey.value && !isLive(match) && !isFinished(match);
}

// Ensemble des championnats OUVERTS (pas fermés) : vide par défaut, donc
// tous les championnats démarrent fermés tant qu'on ne clique pas dessus.
const expandedLeagues = reactive(new Set());
// Idem pour les groupes de dates À L'INTÉRIEUR d'un championnat — clé
// composite "championnat|jour" puisque la même date apparaît dans plusieurs
// championnats et doit se replier indépendamment dans chacun.
const expandedDates = reactive(new Set());
const favoris = useFavoritesStore();

// Les championnats favoris d'abord, dans l'ordre des favoris ; les autres
// gardent leur ordre (tri stable, rang égal pour tous les non-favoris).
const groupedMatches = computed(() =>
  [...groupMatchesByLeague(props.matches)].sort((a, b) => {
    const ra = favoris.leagueRank(a.league);
    const rb = favoris.leagueRank(b.league);
    return ra === rb ? 0 : ra < rb ? -1 : 1;
  })
);

// Les matchs des équipes favorites, toutes compétitions confondues, par coup
// d'envoi : le bloc de tête. Ils restent aussi dans leur championnat. Rien à
// calculer (ni identifiant à demander) tant qu'aucune équipe n'est favorite.
const matchsDesFavoris = computed(() => {
  if (!favoris.teams.length) return [];
  return props.matches
    .filter((m) => favoris.isFavoriteTeam(m.home, m.league) || favoris.isFavoriteTeam(m.away, m.league))
    .sort((a, b) => String(a.commenceTime ?? '').localeCompare(String(b.commenceTime ?? '')));
});

// Les mêmes, rangés par compétition (championnats favoris d'abord, puis la
// compétition du prochain match) : chaque carte porte sa date, et le nom de la
// compétition passe en sous-titre au lieu d'une colonne qui tronquait les clubs.
const favorisParCompetition = computed(() =>
  [...groupMatchesByLeague(matchsDesFavoris.value)].sort((a, b) => {
    const ra = favoris.leagueRank(a.league);
    const rb = favoris.leagueRank(b.league);
    return ra === rb ? 0 : ra < rb ? -1 : 1;
  })
);

// Ouvert par défaut, contrairement aux championnats : c'est ce qu'on vient voir.
const favorisOuverts = ref(true);

function dateGroupKey(league, dayKey) {
  return `${league}|${dayKey}`;
}

function matchDayKey(match) {
  return match.commenceTime ? match.commenceTime.slice(0, 10) : 'Date inconnue';
}

// Raccourci depuis le badge "N EN DIRECT" : ouvre le championnat ET le(s)
// groupe(s) de date des matchs en cours (pas besoin de les chercher soi-même
// dans une liste parfois longue), et sélectionne directement le premier pour
// afficher son analyse — cf. la demande d'origine, la ligue chinoise en
// direct passait inaperçue repliée derrière ce badge.
function showLiveMatches(group) {
  expandedLeagues.add(group.league);
  const liveMatches = group.matches.filter(isLive);
  for (const match of liveMatches) {
    expandedDates.add(dateGroupKey(group.league, matchDayKey(match)));
  }
  if (liveMatches[0]) emit('select', liveMatches[0]);
}

// Fermer manuellement le championnat du match actuellement sélectionné doit
// aussi désélectionner ce match (donc masquer son analyse) — un match ne
// doit jamais rester "affiché" alors que son championnat est fermé.
function toggleCollapse(league) {
  if (expandedLeagues.has(league)) {
    expandedLeagues.delete(league);
    const closesSelectedMatch = props.matches.some((m) => m.league === league && m.matchId === props.selectedMatchId);
    if (closesSelectedMatch) emit('deselect');
  } else {
    expandedLeagues.add(league);
  }
}

// Même principe que toggleCollapse, mais pour un groupe de dates : le replier
// alors qu'il contient le match sélectionné désélectionne ce match.
function toggleDateCollapse(league, dayKey, dayMatches) {
  const key = dateGroupKey(league, dayKey);
  if (expandedDates.has(key)) {
    expandedDates.delete(key);
    const closesSelectedMatch = dayMatches.some((m) => m.matchId === props.selectedMatchId);
    if (closesSelectedMatch) emit('deselect');
  } else {
    expandedDates.add(key);
  }
}

// Un match sélectionné (ex. arrivée directe sur /matches/:id, ou rechargement
// de page) ne doit jamais rester "affiché" (analysé à droite) sans que son
// championnat ET son groupe de date soient ouverts — sinon on voit une
// analyse sans savoir à quel match elle correspond dans une liste repliée.
watch(
  () => [props.selectedMatchId, props.matches],
  () => {
    const match = props.matches.find((m) => m.matchId === props.selectedMatchId);
    if (match) {
      expandedLeagues.add(match.league);
      expandedDates.add(dateGroupKey(match.league, matchDayKey(match)));
    }
  },
  { immediate: true }
);

// Une ligne de la liste au format de la carte de rencontre commune
// (MatchCard.vue — 01/10/2026 : « ce design partout où il y a des
// rencontres ») : domicile à gauche, heure ou score au centre.
function versCarte(match) {
  return {
    matchId: match.matchId,
    commenceTime: heureConnue(match) ? match.commenceTime : null,
    date: match.commenceTime ? match.commenceTime.slice(0, 10) : null,
    league: match.league,
    round: match.round ?? null,
    homeName: match.home,
    awayName: match.away,
    homeGoals: match.result?.homeGoals ?? null,
    awayGoals: match.result?.awayGoals ?? null,
    status: isLive(match) ? 'live' : isFinished(match) || match.settled ? 'finished' : 'scheduled',
    hasOdds: match.hasOdds !== false,
    postponedFrom: match.postponedFrom ?? null
  };
}

function formatDayHeader(dayKey) {
  return dayKey === 'Date inconnue' ? dayKey : formatDay(dayKey);
}

</script>

<template>
  <div class="match-list">
    <!-- Les matchs des équipes favorites, toutes compétitions confondues (03/10/2026). -->
    <section
      v-if="matchsDesFavoris.length"
      class="league-group league-group--favoris"
      :class="{ 'is-open': favorisOuverts, 'has-live': matchsDesFavoris.some(isLive) }"
    >
      <div
        class="league-group__header"
        role="button"
        tabindex="0"
        :aria-expanded="favorisOuverts"
        @click="favorisOuverts = !favorisOuverts"
        @keydown.enter="favorisOuverts = !favorisOuverts"
      >
        <span class="league-group__badge league-group__name league-group__favoris-title">
          <FavoriteStar active :interactive="false" :size="15" label="Mes équipes" />
          Mes équipes favorites
        </span>
        <div class="league-group__meta">
          <span v-if="matchsDesFavoris.some(isLive)" class="cm-chip is-danger">
            <span class="cm-live-dot league-group__live-dot"></span>{{ matchsDesFavoris.filter(isLive).length }} en direct
          </span>
          <span v-if="matchsDesFavoris.some(isUpcomingToday)" class="cm-chip is-accent league-group__today">
            <AppIcon name="clock" :size="11" />{{ matchsDesFavoris.filter(isUpcomingToday).length }} aujourd'hui
          </span>
        </div>
        <span class="league-group__count cm-text-muted cm-numeric" title="Rencontres de vos équipes favorites">{{ matchsDesFavoris.length }}</span>
        <span class="league-group__toggle">
          <AppIcon name="chevronRight" :size="14" class="league-group__chevron" :class="{ 'league-group__chevron--collapsed': favorisOuverts }" />
        </span>
      </div>
      <div v-if="favorisOuverts" class="league-group__matches">
        <template v-for="sousGroupe in favorisParCompetition" :key="sousGroupe.league">
          <!-- La compétition en sous-titre : son drapeau, son nom, son nombre de matchs. -->
          <div class="fav-group__league">
            <LeagueBadge :league="sousGroupe.league" />
            <span class="date-group__rule"></span>
            <span class="date-group__count cm-text-muted cm-numeric">{{ sousGroupe.matches.length }} match{{ sousGroupe.matches.length > 1 ? 's' : '' }}</span>
          </div>
          <div class="date-group__cards cm-stagger">
            <MatchListCard
              v-for="match in sousGroupe.matches"
              :key="match.matchId"
              :match="match"
              :carte="versCarte(match)"
              :active="match.matchId === selectedMatchId"
              :form="formByMatchId[match.matchId] ?? null"
              :has-ai="Boolean(aiAnalysisByMatchId[match.matchId])"
              date-display="block"
              @select="$emit('select', match)"
            />
          </div>
        </template>
      </div>
    </section>

    <section
      v-for="group in groupedMatches"
      :key="group.league"
      class="league-group"
      :class="{ 'is-open': expandedLeagues.has(group.league), 'has-live': group.matches.some(isLive), 'is-favorite': favoris.isFavoriteLeague(group.league) }"
    >
      <!-- La ligne d'en-tête de la compétition : drapeau et nom, l'état du jour
           en puces, le nombre de rencontres, le classement, le repli. Elle reste
           collée en haut de la liste pendant qu'on fait défiler ses matchs. -->
      <div
        class="league-group__header"
        role="button"
        tabindex="0"
        :aria-expanded="expandedLeagues.has(group.league)"
        @click="toggleCollapse(group.league)"
        @keydown.enter="toggleCollapse(group.league)"
      >
        <span class="league-group__badge league-group__name" :class="{ 'has-star': group.league !== 'Autres rencontres' }">
          <FavoriteStar
            v-if="group.league !== 'Autres rencontres'"
            :active="favoris.isFavoriteLeague(group.league)"
            kind="league"
            :label="group.league"
            :size="14"
            @toggle="favoris.toggleLeague(group.league)"
          />
          <LeagueBadge :league="group.league" />
        </span>

        <div class="league-group__meta">
          <span
            v-if="incompleteStatsSet.has(group.league)"
            class="cm-chip is-info league-group__incomplete"
            title="Corners, tirs, cartons… incomplets ou absents pour ce championnat — le score reste fiable"
          >
            stats incomplètes
          </span>
          <button
            v-if="group.matches.some(isLive)"
            type="button"
            class="cm-chip is-danger league-group__live"
            title="Voir le(s) match(s) en direct"
            @click.stop="showLiveMatches(group)"
          >
            <span class="cm-live-dot league-group__live-dot"></span>{{ group.matches.filter(isLive).length }} en direct
          </button>
          <span v-if="group.matches.some(isUpcomingToday)" class="cm-chip is-accent league-group__today">
            <AppIcon name="clock" :size="11" />{{ group.matches.filter(isUpcomingToday).length }} aujourd'hui
          </span>
          <span v-if="group.matches.some(isFinished)" class="cm-chip is-warning league-group__finished">
            <AppIcon name="check" :size="11" />{{ group.matches.filter(isFinished).length }} terminé(s)
          </span>
        </div>

        <span class="league-group__count cm-text-muted cm-numeric" title="Rencontres dans ce championnat">{{ group.matches.length }}</span>
        <button type="button" class="cm-link league-group__standings-link" @click.stop="$emit('view-standings', group.league)">
          <AppIcon name="award" :size="13" />Classement
        </button>
        <span class="league-group__toggle">
          <AppIcon
            name="chevronRight"
            :size="14"
            class="league-group__chevron"
            :class="{ 'league-group__chevron--collapsed': expandedLeagues.has(group.league) }"
          />
        </span>
      </div>

      <div v-if="expandedLeagues.has(group.league)" class="league-group__matches">
        <template v-for="dateGroup in groupMatchesByDate(group.matches)" :key="dateGroup.dayKey">
          <!-- Le jour : un sous-titre avec son filet, le nombre de rencontres, le repli. -->
          <div
            class="date-group__header"
            :class="{ 'is-open': expandedDates.has(dateGroupKey(group.league, dateGroup.dayKey)), 'is-today': dateGroup.dayKey === todayKey }"
            role="button"
            tabindex="0"
            :aria-expanded="expandedDates.has(dateGroupKey(group.league, dateGroup.dayKey))"
            @click="toggleDateCollapse(group.league, dateGroup.dayKey, dateGroup.matches)"
            @keydown.enter="toggleDateCollapse(group.league, dateGroup.dayKey, dateGroup.matches)"
          >
            <span class="date-group__label cm-truncate">{{ formatDayHeader(dateGroup.dayKey) }}</span>
            <span v-if="dateGroup.dayKey === todayKey" class="date-group__today">Aujourd'hui</span>
            <span class="date-group__rule"></span>
            <span class="date-group__count cm-text-muted cm-numeric">{{ dateGroup.matches.length }} match{{ dateGroup.matches.length > 1 ? 's' : '' }}</span>
            <AppIcon
              name="chevronRight"
              :size="12"
              class="date-group__chevron"
              :class="{ 'date-group__chevron--collapsed': expandedDates.has(dateGroupKey(group.league, dateGroup.dayKey)) }"
            />
          </div>
          <div v-if="expandedDates.has(dateGroupKey(group.league, dateGroup.dayKey))" class="date-group__cards cm-stagger">
            <MatchListCard
              v-for="match in dateGroup.matches"
              :key="match.matchId"
              :match="match"
              :carte="versCarte(match)"
              :active="match.matchId === selectedMatchId"
              :form="formByMatchId[match.matchId] ?? null"
              :has-ai="Boolean(aiAnalysisByMatchId[match.matchId])"
              @select="$emit('select', match)"
            />
          </div>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.match-list {
  /* Se règle sur SA largeur : une page entière comme un panneau étroit. */
  container: matchlist / inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  /* La liste garde son propre défilement (les filtres restent visibles au-dessus),
     mais prend la hauteur disponible plutôt qu'une boîte fixe. */
  max-height: clamp(520px, 72vh, 1100px);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

/* ------------------------------------------------------ compétition */
.league-group {
  border: 1px solid var(--cm-border-soft);
  border-radius: var(--cm-radius-md);
  background: var(--cm-surface);
  transition: border-color var(--cm-transition);
}

.league-group.is-open {
  border-color: rgba(var(--cm-section-rgb) / 0.24);
}

.league-group.has-live {
  border-color: rgba(var(--cm-danger-rgb) / 0.3);
}

/* La ligne d'en-tête reste collée en haut de la liste pendant le défilement
   de ses matchs : on sait toujours dans quel championnat on est. */
.league-group__header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 10px 16px;
  border-radius: inherit;
  background: var(--cm-surface-alt);
  cursor: pointer;
  text-align: left;
  user-select: none;
  transition: background var(--cm-transition);
}

/* Le liseré à gauche : couleur de section quand le bloc est ouvert, rouge
   quand un match s'y joue en ce moment. */
.league-group__header::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: transparent;
  transition: background var(--cm-transition);
}

.league-group.is-open .league-group__header::before {
  background: var(--cm-section);
}

.league-group.has-live .league-group__header::before {
  background: var(--cm-danger);
}

.league-group__header:hover {
  background: var(--cm-surface-hover);
}

.league-group.is-open .league-group__header {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom: 1px solid var(--cm-border-soft);
  background: linear-gradient(90deg, rgba(var(--cm-section-rgb) / 0.09), transparent 55%), var(--cm-surface-alt);
}

.league-group__header:focus-visible {
  outline: 2px solid var(--cm-section);
  outline-offset: -2px;
}

.league-group__meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

/* Une puce cliquable : même dessin que les autres, avec le curseur en plus. */
.league-group__live {
  font-family: inherit;
  cursor: pointer;
  transition: background var(--cm-transition);
}

.league-group__live:hover {
  background: rgba(var(--cm-danger-rgb) / 0.24);
}

.league-group__live-dot {
  width: 6px;
  height: 6px;
  box-shadow: 0 0 0 2px var(--cm-danger-soft);
}

/* Mise en garde sur la donnée, pas un statut de match : elle reste en
   minuscules, en retrait des puces direct / aujourd'hui / terminés. */
.league-group__incomplete {
  font-weight: 600;
}

.league-group__count {
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 11px;
  font-weight: 700;
}

.league-group__standings-link {
  flex-shrink: 0;
  padding: 4px 9px;
  border-radius: 999px;
  transition: background var(--cm-transition);
}

.league-group__standings-link:hover {
  background: var(--cm-section-soft);
  text-decoration: none;
}

.league-group__toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  transition: background var(--cm-transition), color var(--cm-transition);
}

.league-group__header:hover .league-group__toggle,
.league-group.is-open .league-group__toggle {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.league-group__chevron {
  transform: rotate(90deg);
  transition: transform var(--cm-transition);
}

.league-group__chevron--collapsed {
  transform: rotate(-90deg);
}

.league-group__matches {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px 10px;
}

/* ------------------------------------------------------------- jour */
.date-group__header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: var(--cm-radius-sm);
  cursor: pointer;
  text-align: left;
  user-select: none;
  transition: background var(--cm-transition);
}

.date-group__header:hover {
  background: var(--cm-surface-hover);
}

.date-group__header:focus-visible {
  outline: 2px solid var(--cm-section);
  outline-offset: -2px;
}

.date-group__label {
  flex-shrink: 1;
  max-width: 60%;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
  transition: color var(--cm-transition);
}

.date-group__header:hover .date-group__label,
.date-group__header.is-open .date-group__label {
  color: var(--cm-text-secondary);
}

.date-group__header.is-today .date-group__label {
  color: var(--cm-section);
}

.date-group__today {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cm-section-soft);
  color: var(--cm-section);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}

.date-group__rule {
  flex: 1;
  height: 1px;
  background: var(--cm-border-soft);
}

.date-group__count {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
}

.date-group__chevron {
  flex-shrink: 0;
  color: var(--cm-text-muted);
  transform: rotate(90deg);
  transition: transform var(--cm-transition), color var(--cm-transition);
}

.date-group__header:hover .date-group__chevron {
  color: var(--cm-section);
}

.date-group__chevron--collapsed {
  transform: rotate(-90deg);
}

.date-group__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 0 8px;
}

/* ------------------------------------------------------------ favoris */
/* L'étoile et le nom du championnat, côte à côte. */
.league-group__name {
  display: inline-flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

/* L'étoile (bouton de 26 px) déborde à gauche : le drapeau reste aligné sur les autres en-têtes. */
.league-group__name.has-star {
  margin-left: -6px;
}

/* Un championnat favori : le liseré doré, même fermé. */
.league-group.is-favorite .league-group__header::before {
  background: var(--cm-gold);
}

.league-group.is-favorite.is-open .league-group__header::before {
  background: linear-gradient(180deg, var(--cm-gold), var(--cm-section));
}

/* Le bloc « Mes équipes favorites » : doré, en tête. */
.league-group--favoris {
  border-color: rgba(var(--cm-gold-rgb) / 0.32);
}

.league-group--favoris.is-open {
  border-color: rgba(var(--cm-gold-rgb) / 0.4);
}

.league-group--favoris .league-group__header::before,
.league-group--favoris.is-open .league-group__header::before {
  background: var(--cm-gold);
}

.league-group--favoris.is-open .league-group__header {
  background: linear-gradient(90deg, rgba(var(--cm-gold-rgb) / 0.12), transparent 55%), var(--cm-surface-alt);
}

.league-group--favoris.is-open .league-group__toggle {
  background: var(--cm-gold-soft);
  color: var(--cm-gold);
}

/* Le rouge « en direct » passe avant le doré des favoris. */
.league-group.is-favorite.has-live .league-group__header::before,
.league-group.is-favorite.is-open.has-live .league-group__header::before,
.league-group--favoris.has-live .league-group__header::before,
.league-group--favoris.is-open.has-live .league-group__header::before {
  background: var(--cm-danger);
}

/* Une compétition dans le bloc des favoris : un sous-titre discret, sans repli. */
.fav-group__league {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px 2px;
}

.fav-group__league:first-child {
  padding-top: 2px;
}

.league-group__favoris-title {
  gap: 8px;
  margin-left: 0;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--cm-text-primary);
}

/* Panneau étroit : l'en-tête sur deux lignes (compétition, compte et repli ;
   puis les puces et le classement), la colonne de droite de la carte à sa
   largeur naturelle. */
@container matchlist (max-width: 680px) {
  .league-group__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    grid-template-areas:
      'badge count toggle'
      'meta meta link';
    gap: 8px 10px;
  }

  .league-group__badge {
    grid-area: badge;
  }

  .league-group__count {
    grid-area: count;
  }

  .league-group__toggle {
    grid-area: toggle;
  }

  .league-group__meta {
    grid-area: meta;
  }

  .league-group__standings-link {
    grid-area: link;
    justify-self: end;
  }
}
</style>
