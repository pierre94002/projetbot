<script setup>
import { computed } from 'vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import FavoriteStar from '@/components/common/FavoriteStar.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { formatShortDay } from '@/utils/format.js';

const props = defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  rows: { type: Array, default: () => [] },
  // Table officielle relevée chez FotMob, ou calculée sur les résultats du
  // magasin. La différence se dit : seule l'officielle porte les pénalités
  // de points et les départages du règlement.
  official: { type: Boolean, default: false },
  // Compétition : retrouve le logo d'un club que la table ne désigne que par son nom.
  league: { type: String, default: null },
  fetchedAt: { type: String, default: null },
  seasonLabel: { type: String, default: null },
  // Matchs reportés de la saison, pas encore joués (cf. standings.controller.js) :
  // { homeName, awayName, originalDate, newDate|null }. Chaque ligne porte en
  // plus `postponedMatches`, le nombre de ceux qui concernent l'équipe.
  postponed: { type: Array, default: () => [] },
  // La forme d'une équipe (03/10/2026, onglet Calendrier saison) : une
  // fonction ligne -> ses derniers résultats, du plus récent au plus ancien,
  // [{ result: V|N|D, opponent, score, date, home }]. Sans elle, pas de
  // colonne « Forme » (la fenêtre « Classement » de la page Matchs).
  formOf: { type: Function, default: null }
});

// Favoris (03/10/2026) : l'ordre du classement ne bouge pas, une équipe favorite porte son étoile.
const favoris = useFavoritesStore();

function zoneClass(description) {
  if (!description) return '';
  const text = description.toLowerCase();
  if (text.includes('champions league') || text.includes('libertadores')) return 'standings-row--ucl';
  if (text.includes('europa') || text.includes('conference') || text.includes('sudamericana')) return 'standings-row--uel';
  if (text.includes('relegation')) return 'standings-row--relegation';
  if (text.includes('playoff') || text.includes('promotion') || text.includes('championship')) return 'standings-row--playoff';
  return '';
}

const hasDeductions = computed(() => props.rows.some((row) => row.deduction));

/** La forme d'une ligne, de la plus ancienne à la plus récente (lecture de gauche à droite). */
const formeChronologique = (row) => [...(props.formOf?.(row) ?? [])].reverse();
const RESULTATS = { V: 'Victoire', N: 'Nul', D: 'Défaite' };
const titreForme = (f) => `${RESULTATS[f.result] ?? f.result} ${f.score} ${f.home ? 'contre' : 'chez'} ${f.opponent} — ${formatShortDay(f.date)}`;

const sourceLine = computed(() => {
  const saison = props.seasonLabel ? ` — saison ${props.seasonLabel}` : '';
  if (props.official) {
    const quand = props.fetchedAt ? `, relevé le ${new Date(props.fetchedAt).toLocaleDateString('fr-FR')}` : '';
    return `Classement officiel (FotMob)${saison}${quand}`;
  }
  return `Classement calculé sur les résultats du magasin${saison} — sans pénalités ni départages du règlement`;
});
</script>

<template>
  <LoadingSpinner v-if="loading" label="Récupération du classement…" />
  <EmptyState v-else-if="error" icon="alert" title="Classement indisponible" :description="error" />
  <EmptyState v-else-if="rows.length === 0" icon="matches" title="Aucun classement trouvé" />

  <div v-else class="standings">
    <!-- D'où vient la table : officielle (FotMob) ou calculée sur le magasin. -->
    <p class="standings__source">
      <AppIcon :name="official ? 'check' : 'database'" :size="12" />
      <span>{{ sourceLine }}</span>
    </p>

    <!-- Le classement, sur le dessin commun des tableaux : rang gris, logo et
         nom en gras, zones de qualification et de relégation en liseré à
         gauche, les points en couleur de section. -->
    <div class="cm-table-wrap standings__wrap">
      <table class="cm-table standings__table">
        <!-- Les largeurs sont posées sur l'en-tête (table-layout: fixed) :
             seul le nom du club est élastique. -->
        <thead>
          <tr>
            <th class="is-center standings__col-rank" title="Rang">#</th>
            <th class="is-left">Équipe</th>
            <th class="is-center standings__col-n" title="Matchs joués">J</th>
            <th class="is-center standings__col-n" title="Gagnés">G</th>
            <th class="is-center standings__col-n" title="Nuls">N</th>
            <th class="is-center standings__col-n" title="Perdus">P</th>
            <th class="standings__col-diff" title="Différence de buts">Diff</th>
            <th class="standings__col-pts" title="Points">Pts</th>
            <th v-if="formOf" class="is-center standings__col-form" title="Cinq derniers matchs, du plus ancien au plus récent">Forme</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.teamId ?? row.teamName"
            class="standings-row"
            :class="[zoneClass(row.description), { 'is-favorite': favoris.isFavoriteTeam(row.teamName, league, row.teamId ?? undefined) }]"
            :title="row.description ?? ''"
          >
            <td class="is-center standings__rank cm-numeric">{{ row.rank }}</td>
            <td class="is-left standings__team">
              <span class="standings__team-inner">
                <TeamCrest :name="row.teamName" :league="league" :team-id="row.teamId ?? null" :size="22" class="standings__crest" />
                <span class="standings__name cm-truncate">{{ row.teamName }}</span>
                <FavoriteStar
                  v-if="favoris.isFavoriteTeam(row.teamName, league, row.teamId ?? undefined)"
                  active
                  :interactive="false"
                  :size="11"
                  :label="row.teamName"
                />
                <span v-if="row.deduction" class="standings__deduction" :title="`Pénalité de ${Math.abs(row.deduction)} point(s)`">{{ row.deduction > 0 ? '−' : '' }}{{ Math.abs(row.deduction) }}</span>
                <span
                  v-if="row.postponedMatches"
                  class="standings__postponed"
                  :title="`${row.postponedMatches} match(s) en retard : reporté(s), pas encore joué(s) (détail sous le tableau)`"
                ><AppIcon name="clock" :size="10" />{{ row.postponedMatches }}</span>
              </span>
            </td>
            <td class="is-center cm-numeric">{{ row.played }}</td>
            <td class="is-center cm-numeric standings__won">{{ row.won }}</td>
            <td class="is-center cm-numeric">{{ row.drawn }}</td>
            <td class="is-center cm-numeric standings__lost">{{ row.lost }}</td>
            <td class="cm-numeric" :class="row.goalDiff >= 0 ? 'cm-positive' : 'cm-negative'">{{ row.goalDiff >= 0 ? '+' : '' }}{{ row.goalDiff }}</td>
            <td class="cm-numeric is-strong standings__points">{{ row.points }}</td>
            <td v-if="formOf" class="is-center standings__form">
              <span class="standings__form-dots">
                <i
                  v-for="(f, i) in formeChronologique(row)"
                  :key="i"
                  class="standings__form-dot"
                  :class="`is-${f.result}`"
                  :title="titreForme(f)"
                />
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Les matchs en retard : une note ambre, un match par ligne. -->
    <div v-if="postponed.length" class="cm-note is-warning standings__postponed-list">
      <span class="cm-icon-box is-warning is-sm"><AppIcon name="clock" :size="14" /></span>
      <div class="standings__postponed-body">
        <p class="cm-note__title standings__postponed-title">Matchs reportés, pas encore joués</p>
        <ul class="standings__postponed-items">
          <li v-for="p in postponed" :key="`${p.originalDate}-${p.homeName}-${p.awayName}`">
            <span class="cm-numeric standings__postponed-date">{{ formatShortDay(p.originalDate) }}</span>
            <span class="standings__postponed-teams">
              <TeamCrest :name="p.homeName" :league="league" :size="16" />{{ p.homeName }} - {{ p.awayName }}<TeamCrest :name="p.awayName" :league="league" :size="16" />
            </span>
            <span class="cm-text-muted">{{ p.newDate ? `re-programmé le ${formatShortDay(p.newDate)}` : 'nouvelle date à venir' }}</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- La légende des liserés et des pastilles, en puces. -->
    <div class="standings__legend">
      <span class="cm-chip"><i class="standings__dot standings__dot--ucl" />Compétition continentale majeure</span>
      <span class="cm-chip"><i class="standings__dot standings__dot--uel" />Autre coupe continentale</span>
      <span class="cm-chip"><i class="standings__dot standings__dot--playoff" />Playoffs / promotion</span>
      <span class="cm-chip"><i class="standings__dot standings__dot--relegation" />Relégation</span>
      <span v-if="formOf" class="cm-chip standings__legend-form">
        <i class="standings__form-dot is-V" /><i class="standings__form-dot is-N" /><i class="standings__form-dot is-D" />Forme : victoire, nul, défaite (5 derniers)
      </span>
      <span v-if="hasDeductions" class="cm-chip is-danger">−N : pénalité de points appliquée par la fédération</span>
      <span v-if="postponed.length" class="cm-chip is-warning standings__legend-postponed"><AppIcon name="clock" :size="11" />N : match(s) en retard, reporté(s) et pas encore joué(s)</span>
    </div>
  </div>
</template>

<style scoped>
.standings {
  /* Se règle sur SA largeur : fenêtre du classement (≈ 480 px) ou page. */
  container: standings / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.standings__source {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.standings__source :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--cm-section);
}

/* ------------------------------------------------------------ tableau */
/* Colonnes fixes : seul le nom du club est élastique, et il se tronque
   plutôt que de pousser le tableau hors de son cadre. */
.standings__table {
  table-layout: fixed;
}

th.standings__col-rank {
  width: 38px;
}

th.standings__col-n {
  width: 38px;
}

th.standings__col-diff {
  width: 54px;
}

th.standings__col-pts {
  width: 50px;
}

/* Le rang : gris, centré (la règle commune aligne la première colonne à gauche). */
th.standings__col-rank,
.standings__rank {
  text-align: center;
  color: var(--cm-text-muted);
  font-weight: 600;
}

/* Le liseré de zone, à gauche de la ligne ; la case du rang en reprend un
   voile pour que la couleur se lise même sur une ligne survolée. */
.standings-row td:first-child {
  border-left: 3px solid transparent;
}

.standings-row--ucl {
  --zone: var(--cm-accent);
  --zone-rgb: var(--cm-accent-rgb);
}

.standings-row--uel {
  --zone: var(--cm-info);
  --zone-rgb: var(--cm-info-rgb);
}

.standings-row--playoff {
  --zone: var(--cm-warning);
  --zone-rgb: var(--cm-warning-rgb);
}

.standings-row--relegation {
  --zone: var(--cm-danger);
  --zone-rgb: var(--cm-danger-rgb);
}

.standings-row[class*='standings-row--'] td:first-child {
  border-left-color: var(--zone);
  background: linear-gradient(90deg, rgba(var(--zone-rgb) / 0.14), transparent);
}

.standings-row[class*='standings-row--'] .standings__rank {
  color: var(--zone);
  font-weight: 700;
}

/* Le nom se tronque, jamais les pastilles qui le suivent (pénalité, match en retard). */
.standings__team-inner {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.standings__name {
  flex: 1 1 auto;
  min-width: 0;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.standings__crest {
  flex-shrink: 0;
}

.standings__deduction {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  font-size: 10.5px;
  font-weight: 700;
}

.standings__postponed {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.standings__won {
  color: var(--cm-text-secondary);
}

.standings__lost {
  color: var(--cm-text-secondary);
}

/* La colonne décisive : les points, en couleur de section. */
.standings__points {
  color: var(--cm-section);
  font-size: 13.5px;
  font-weight: 800;
}

/* ---------------------------------------------------- matchs reportés */
.standings__postponed-body {
  min-width: 0;
}

.standings__postponed-title {
  color: var(--cm-warning);
}

.standings__postponed-items {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: var(--cm-text-primary);
}

.standings__postponed-items li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
}

.standings__postponed-date {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 11px;
  font-weight: 700;
}

.standings__postponed-teams {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}

/* ------------------------------------------------------------ légende */
.standings__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.standings__legend .cm-chip {
  white-space: normal;
  font-weight: 500;
}

.standings__dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cm-text-muted);
}

.standings__dot--ucl {
  background: var(--cm-accent);
}

.standings__dot--uel {
  background: var(--cm-info);
}

.standings__dot--playoff {
  background: var(--cm-warning);
}

.standings__dot--relegation {
  background: var(--cm-danger);
}

.standings__legend-postponed {
  gap: 5px;
}

/* Étroit (fenêtre du classement) : cases plus serrées, la place va au nom. */
@container standings (max-width: 520px) {
  .standings__table th,
  .standings__table td {
    padding: 8px 6px;
    font-size: 12px;
  }

  .standings__table td:first-child {
    padding-left: 8px;
  }

  th.standings__col-rank {
    width: 34px;
  }

  th.standings__col-n {
    width: 30px;
  }

  th.standings__col-diff {
    width: 46px;
  }

  th.standings__col-pts {
    width: 42px;
  }

  .standings__team-inner {
    gap: 7px;
  }

  .standings__points {
    font-size: 13px;
  }
}

/* Une équipe favorite (03/10/2026) : sa ligne légèrement dorée, l'ordre ne change pas. */
.standings-row.is-favorite > td {
  background-color: rgba(var(--cm-gold-rgb) / 0.07);
}

/* ---------------------------------------------------------------- forme */
th.standings__col-form {
  width: 74px;
}

.standings__form-dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.standings__form-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cm-surface-hover);
}

.standings__form-dot.is-V {
  background: var(--cm-accent);
}

.standings__form-dot.is-N {
  background: var(--cm-text-muted);
}

.standings__form-dot.is-D {
  background: var(--cm-danger);
}

.standings__legend-form {
  gap: 4px;
}

@container standings (max-width: 520px) {
  th.standings__col-form {
    width: 58px;
  }

  .standings__form-dots {
    gap: 2px;
  }

  .standings__form-dot {
    width: 7px;
    height: 7px;
  }
}
</style>
