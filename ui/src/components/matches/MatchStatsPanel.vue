<script setup>
import { computed } from 'vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import {
  MATCH_STAT_SECTIONS,
  matchStatValue,
  matchStatTotal,
  matchStatAverage,
  isTotalApplicable,
  parseNumeric,
  isAverageApplicable
} from '@/constants/matchStatFields.js';

const props = defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  teams: { type: Array, default: () => [] }, // [{ teamId, teamName, stats }, ...], ordre non garanti par l'API
  primaryTeamId: { type: Number, default: null }, // équipe dont on consulte l'historique — toujours affichée à gauche
  fallbackPrimaryName: { type: String, default: 'Cette équipe' },
  fallbackOpponentName: { type: String, default: 'Adversaire' },
  // Détail d'une seule équipe (ex. clic sur un nom d'équipe hors contexte de
  // match) plutôt qu'une comparaison à deux : pas de colonne adverse, pas de
  // Σ/⌀ (qui n'ont de sens que pour DEUX équipes d'un même match).
  singleTeam: { type: Boolean, default: false },
  // Compétition : retrouve le logo de chaque club d'après son nom.
  league: { type: String, default: null }
});

// L'ordre renvoyé par l'API n'est pas garanti domicile/extérieur : on réordonne
// pour toujours afficher l'équipe consultée à gauche, quel que soit son statut.
const primary = computed(() => props.teams.find((t) => t.teamId === props.primaryTeamId) ?? props.teams[0] ?? null);
const opponent = computed(() => props.teams.find((t) => t.teamId !== props.primaryTeamId) ?? props.teams[1] ?? null);

const primaryName = computed(() => primary.value?.teamName ?? props.fallbackPrimaryName);
const opponentName = computed(() => opponent.value?.teamName ?? props.fallbackOpponentName);

/**
 * Présentation seulement : la part (en %) de l'équipe de gauche sur une ligne
 * comparable, pour la barre face à face sous chaque ligne — le même dessin que
 * MatchStatBars. Null quand l'un des deux chiffres manque ou que la ligne est
 * composite (passes) : pas de barre plutôt qu'une barre qui ment.
 */
function partDomicile(row) {
  if (row.render) return null;
  const h = parseNumeric(primary.value?.stats?.[row.key]);
  const a = parseNumeric(opponent.value?.stats?.[row.key]);
  if (h === null || a === null) return null;
  const total = Math.abs(h) + Math.abs(a);
  return total ? Math.round((Math.abs(h) / total) * 100) : 50;
}
</script>

<template>
  <LoadingSpinner v-if="loading" label="Récupération des statistiques…" />

  <!--
    Le tableau reste toujours visible, y compris en erreur (ex. quota
    API-Football épuisé) : seules les valeurs manquent, pas la structure.
  -->
  <div v-else class="match-stats">
    <div v-if="error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="alert" :size="16" /></span>
      <div>
        <p class="cm-note__title">Statistiques incomplètes</p>
        <p class="cm-note__text">{{ error }}</p>
      </div>
    </div>

    <!-- Les deux clubs en tête, chacun au-dessus de sa colonne (le dessin de MatchupHeader). -->
    <div class="match-stats__head" :class="{ 'match-stats__head--single': singleTeam }">
      <span class="match-stats__club">
        <span class="match-stats__crest"><TeamCrest :name="primaryName" :league="league" :size="24" /></span>
        <span class="match-stats__club-names">
          <span class="match-stats__club-name cm-truncate">{{ primaryName }}</span>
          <i v-if="!singleTeam" class="match-stats__key is-home" aria-hidden="true" />
        </span>
      </span>
      <span v-if="!singleTeam" class="match-stats__head-total">Σ total · ⌀ moyenne</span>
      <span v-if="!singleTeam" class="match-stats__club match-stats__club--away">
        <span class="match-stats__club-names is-away">
          <span class="match-stats__club-name cm-truncate">{{ opponentName }}</span>
          <i class="match-stats__key is-away" aria-hidden="true" />
        </span>
        <span class="match-stats__crest"><TeamCrest :name="opponentName" :league="league" :size="24" /></span>
      </span>
    </div>

    <section v-for="section in MATCH_STAT_SECTIONS" :key="section.title" class="match-stats__section">
      <p class="cm-group-title">{{ section.title }}</p>
      <div class="match-stats__rows">
        <div v-for="row in section.rows" :key="row.label" class="match-stats__row" :class="{ 'match-stats__row--single': singleTeam }">
          <span
            class="match-stats__value cm-numeric"
            :class="{ 'match-stats__single-value': singleTeam, 'is-lead': !singleTeam && (partDomicile(row) ?? 50) > 50 }"
          >
            {{ matchStatValue(primary?.stats ?? {}, row) }}
          </span>
          <span class="match-stats__label-cell">
            <span class="match-stats__label">{{ row.label }}</span>
            <template v-if="!singleTeam">
              <span class="match-stats__aggregates">
                <span v-if="isTotalApplicable(row)" class="match-stats__total cm-numeric" title="Total des deux équipes">
                  Σ {{ matchStatTotal(primary?.stats, opponent?.stats, row) ?? '—' }}
                </span>
                <span v-if="isAverageApplicable(row)" class="match-stats__average cm-numeric" title="Moyenne des deux équipes">
                  ⌀ {{ matchStatAverage(primary?.stats, opponent?.stats, row) ?? '—' }}
                </span>
              </span>
            </template>
          </span>
          <span v-if="!singleTeam" class="match-stats__value match-stats__away cm-numeric" :class="{ 'is-lead': (partDomicile(row) ?? 50) < 50 }">
            {{ matchStatValue(opponent?.stats ?? {}, row) }}
          </span>
          <span v-if="!singleTeam && partDomicile(row) !== null" class="match-stats__track" aria-hidden="true">
            <span class="match-stats__fill is-home" :class="{ 'is-trail': partDomicile(row) < 50 }" :style="{ width: `${partDomicile(row)}%` }" />
            <span class="match-stats__fill is-away" :class="{ 'is-trail': partDomicile(row) > 50 }" :style="{ width: `${100 - partDomicile(row)}%` }" />
          </span>
        </div>
      </div>
    </section>

    <p class="cm-text-muted match-stats__footnote">
      <AppIcon name="info" :size="12" />
      <span>
        Stats importées depuis FotMob par l'actualisation automatique de l'appli. Un "—" signifie que la source ne publie pas ce chiffre pour ce match (jamais estimé).
      </span>
    </p>
  </div>
</template>

<style scoped>
.match-stats {
  /* Se règle sur SA largeur : page entière comme panneau latéral étroit. */
  container: matchstats / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ------------------------------------------------------------- tête */
.match-stats__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: linear-gradient(180deg, rgb(var(--cm-glass-tint) / 0.025), rgb(var(--cm-glass-tint) / 0)), var(--cm-surface-alt);
}

.match-stats__head--single {
  grid-template-columns: minmax(0, 1fr);
}

.match-stats__club {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.match-stats__club--away {
  justify-content: flex-end;
}

.match-stats__crest {
  display: inline-flex;
  flex-shrink: 0;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--cm-surface-alt), 0 0 0 3px var(--cm-border);
}

.match-stats__club-names {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.match-stats__club-names.is-away {
  align-items: flex-end;
  text-align: right;
}

.match-stats__club-name {
  max-width: 100%;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
}

/* La légende des barres : vert à gauche, ambre à droite. */
.match-stats__key {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.match-stats__key.is-home {
  background: var(--cm-accent);
  box-shadow: 0 0 0 3px var(--cm-accent-soft);
}

.match-stats__key.is-away {
  background: var(--cm-warning);
  box-shadow: 0 0 0 3px var(--cm-warning-soft);
}

.match-stats__head-total {
  padding: 4px 11px;
  border-radius: 999px;
  background: var(--cm-section-soft);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-section);
  white-space: nowrap;
}

/* --------------------------------------------------------- sections */
.match-stats__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.match-stats__rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.match-stats__row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) 64px;
  grid-template-rows: auto auto;
  align-items: center;
  gap: 4px 12px;
  padding: 7px 10px;
  border-radius: var(--cm-radius-sm);
  transition: background var(--cm-transition);
}

.match-stats__row:hover {
  background: rgb(var(--cm-glass-tint) / 0.03);
}

/* Une seule équipe : le libellé à gauche, le chiffre à droite. */
.match-stats__row--single {
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto;
}

.match-stats__value {
  font-size: 13.5px;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: var(--cm-text-primary);
  white-space: nowrap;
  text-align: left;
  transition: color var(--cm-transition);
}

.match-stats__value.is-lead {
  color: var(--cm-accent);
}

.match-stats__away {
  text-align: right;
}

.match-stats__away.is-lead {
  color: var(--cm-warning);
}

.match-stats__single-value {
  order: 2;
  text-align: right;
}

.match-stats__label-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.match-stats__row--single .match-stats__label-cell {
  align-items: flex-start;
}

/* Le libellé en petites capitales ; Σ et ⌀ en dessous, plus petits. */
.match-stats__label {
  max-width: 100%;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  text-align: center;
  color: var(--cm-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-stats__row--single .match-stats__label {
  text-align: left;
}

.match-stats__aggregates {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 2px 10px;
}

.match-stats__total {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--cm-accent);
  white-space: nowrap;
}

.match-stats__average {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--cm-info);
  white-space: nowrap;
}

/* La barre face à face sous la ligne, comme MatchStatBars. */
.match-stats__track {
  grid-column: 1 / -1;
  display: flex;
  gap: 3px;
  height: 5px;
}

.match-stats__fill {
  min-width: 3px;
  border-radius: 999px;
  transition: width var(--cm-transition-slow), opacity var(--cm-transition);
}

.match-stats__fill.is-home {
  background: var(--cm-accent);
}

.match-stats__fill.is-away {
  background: var(--cm-warning);
}

.match-stats__fill.is-trail {
  opacity: 0.45;
}

/* ---------------------------------------------------------- source */
.match-stats__footnote {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
  font-size: 11px;
  line-height: 1.5;
}

.match-stats__footnote > :first-child {
  flex-shrink: 0;
  margin-top: 2px;
}

/* Panneau étroit : colonnes de chiffres plus serrées, libellés sur deux lignes. */
@container matchstats (max-width: 440px) {
  .match-stats__row {
    grid-template-columns: 52px minmax(0, 1fr) 52px;
    padding: 6px 4px;
  }

  .match-stats__row--single {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .match-stats__label {
    white-space: normal;
  }

  .match-stats__value {
    font-size: 12.5px;
  }

  .match-stats__head {
    padding: 8px 10px;
  }

  .match-stats__club-name {
    font-size: 12.5px;
  }

  .match-stats__head-total {
    padding: 3px 8px;
    font-size: 9px;
  }
}
</style>
