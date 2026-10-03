<script setup>
import { computed, reactive, watch } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import MatchCard from './MatchCard.vue';
import FormBadges from './FormBadges.vue';
import LeagueBadge from './LeagueBadge.vue';
import { formatOdds, formatDay, formatShortDay } from '@/utils/format.js';
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
const groupedMatches = computed(() => groupMatchesByLeague(props.matches));

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

// Présentation seulement : le favori des bookmakers (la cote 1X2 la plus
// basse) ressort en couleur de section dans la carte. Rien n'est calculé
// pour le moteur ici ; sans deux cotes valables, personne n'est mis en avant.
function coteFavorite(match) {
  const cotes = [
    ['1', Number(match.marketOdds?.odds1)],
    ['N', Number(match.marketOdds?.oddsDraw)],
    ['2', Number(match.marketOdds?.odds2)]
  ].filter(([, cote]) => Number.isFinite(cote) && cote > 1);
  if (cotes.length < 2) return null;
  return cotes.reduce((meilleure, c) => (c[1] < meilleure[1] ? c : meilleure))[0];
}
</script>

<template>
  <div class="match-list">
    <section
      v-for="group in groupedMatches"
      :key="group.league"
      class="league-group"
      :class="{ 'is-open': expandedLeagues.has(group.league), 'has-live': group.matches.some(isLive) }"
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
        <LeagueBadge :league="group.league" class="league-group__badge" />

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
            <MatchCard
              v-for="match in dateGroup.matches"
              :key="match.matchId"
              :match="versCarte(match)"
              clickable
              :active="match.matchId === selectedMatchId"
              date-display="none"
              :show-competition="false"
              team-links
              class="match-list__card"
              @select="$emit('select', match)"
            >
              <template #home-extra>
                <FormBadges v-if="formByMatchId[match.matchId]" :form="formByMatchId[match.matchId].home?.form" class="match-row__form" />
              </template>
              <template #away-extra>
                <FormBadges v-if="formByMatchId[match.matchId]" :form="formByMatchId[match.matchId].away?.form" class="match-row__form" />
              </template>
              <template #aside>
                <span v-if="aiAnalysisByMatchId[match.matchId]" class="match-row__ai-badge" title="Analyse IA disponible pour ce match">
                  <AppIcon name="bolt" :size="9" />IA
                </span>
                <span
                  v-if="match.postponedFrom"
                  class="match-row__postponed"
                  :title="`Match reporté : il était prévu le ${formatShortDay(match.postponedFrom)}`"
                >
                  Reporté du {{ formatShortDay(match.postponedFrom) }}
                </span>
                <!-- Rencontre connue par le calendrier mais pas encore cotée
                     (divisions inférieures, Russie, Chine : les bookmakers
                     n'ouvrent qu'à l'approche). Trois tirets se liraient comme
                     un échec de chargement, d'où la mention explicite. -->
                <span v-if="match.hasOdds === false" class="match-row__odds match-row__odds--none" title="Aucun bookmaker n'a encore publié de cote pour ce match">
                  pas encore coté
                </span>
                <!-- Les trois cotes, chacune sous son repère 1 / N / 2 ; le favori en couleur de section. -->
                <span v-else class="match-row__odds" title="Cotes 1 / N / 2">
                  <span class="match-row__odd" :class="{ 'is-favori': coteFavorite(match) === '1' }"><i>1</i>{{ formatOdds(match.marketOdds?.odds1) }}</span>
                  <span class="match-row__odd match-row__odd--draw" :class="{ 'is-favori': coteFavorite(match) === 'N' }"><i>N</i>{{ formatOdds(match.marketOdds?.oddsDraw) }}</span>
                  <span class="match-row__odd" :class="{ 'is-favori': coteFavorite(match) === '2' }"><i>2</i>{{ formatOdds(match.marketOdds?.odds2) }}</span>
                </span>
              </template>
            </MatchCard>
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

/* --------------------------------------------------------- la carte */
/* Cotes, badge IA et report à droite de la carte : colonne assez large. */
.match-list__card {
  --mcard-aside: 236px;
}

.match-row__form {
  flex-shrink: 0;
}

.match-row__ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-info-soft);
  color: var(--cm-info);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.match-row__postponed {
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 10px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
}

.match-row__odds {
  display: inline-flex;
  gap: 5px;
}

.match-row__odds--none {
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  border: 1px dashed var(--cm-border);
  font-size: 10.5px;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

/* Une cote : son repère (1, N, 2) en tout petit au-dessus du chiffre. */
.match-row__odd {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 46px;
  padding: 3px 0 4px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-hover);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--cm-text-primary);
  transition: background var(--cm-transition), color var(--cm-transition);
}

.match-row__odd i {
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--cm-text-muted);
}

.match-row__odd--draw {
  color: var(--cm-text-secondary);
}

/* Le favori des bookmakers (la cote la plus basse). */
.match-row__odd.is-favori {
  background: var(--cm-section-soft);
  color: var(--cm-section);
}

.match-row__odd.is-favori i {
  color: inherit;
  opacity: 0.8;
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

  .match-list__card {
    --mcard-aside: auto;
  }

  .match-row__odd {
    min-width: 40px;
  }
}
</style>
