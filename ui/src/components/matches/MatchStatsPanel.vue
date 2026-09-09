<script setup>
import { computed } from 'vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import {
  MATCH_STAT_SECTIONS,
  matchStatValue,
  matchStatTotal,
  matchStatAverage,
  isTotalApplicable,
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
  singleTeam: { type: Boolean, default: false }
});

// L'ordre renvoyé par l'API n'est pas garanti domicile/extérieur : on réordonne
// pour toujours afficher l'équipe consultée à gauche, quel que soit son statut.
const primary = computed(() => props.teams.find((t) => t.teamId === props.primaryTeamId) ?? props.teams[0] ?? null);
const opponent = computed(() => props.teams.find((t) => t.teamId !== props.primaryTeamId) ?? props.teams[1] ?? null);

const primaryName = computed(() => primary.value?.teamName ?? props.fallbackPrimaryName);
const opponentName = computed(() => opponent.value?.teamName ?? props.fallbackOpponentName);
</script>

<template>
  <LoadingSpinner v-if="loading" label="Récupération des statistiques…" />

  <!--
    Le tableau reste toujours visible, y compris en erreur (ex. quota
    API-Football épuisé) : seules les valeurs manquent, pas la structure.
  -->
  <div v-else class="match-stats">
    <div v-if="error" class="match-stats__error">
      <AppIcon name="alert" :size="14" />
      <span>{{ error }}</span>
    </div>

    <div class="match-stats__head" :class="{ 'match-stats__head--single': singleTeam }">
      <span class="cm-truncate">{{ primaryName }}</span>
      <span v-if="!singleTeam" class="match-stats__head-total">Σ total · ⌀ moyenne</span>
      <span v-if="!singleTeam" class="cm-truncate match-stats__away">{{ opponentName }}</span>
    </div>

    <div v-for="section in MATCH_STAT_SECTIONS" :key="section.title" class="match-stats__section">
      <p class="match-stats__section-title cm-text-muted">{{ section.title }}</p>
      <div v-for="row in section.rows" :key="row.label" class="match-stats__row" :class="{ 'match-stats__row--single': singleTeam }">
        <span class="cm-numeric" :class="{ 'match-stats__single-value': singleTeam }">{{ matchStatValue(primary?.stats ?? {}, row) }}</span>
        <span class="match-stats__label-cell">
          <span class="match-stats__label cm-text-muted">{{ row.label }}</span>
          <template v-if="!singleTeam">
            <span v-if="isTotalApplicable(row)" class="match-stats__total cm-numeric">
              Σ {{ matchStatTotal(primary?.stats, opponent?.stats, row) ?? '—' }}
            </span>
            <span v-if="isAverageApplicable(row)" class="match-stats__average cm-numeric">
              ⌀ {{ matchStatAverage(primary?.stats, opponent?.stats, row) ?? '—' }}
            </span>
          </template>
        </span>
        <span v-if="!singleTeam" class="cm-numeric match-stats__away">{{ matchStatValue(opponent?.stats ?? {}, row) }}</span>
      </div>
    </div>

    <p class="cm-text-muted match-stats__footnote">
      Les lignes affichant "—" attendent une source de données qui les couvre (ex. xGOT, expected assists, grosses occasions, duels, tacles) — non fournies par le plan API-Football actuel.
    </p>
  </div>
</template>

<style scoped>
.match-stats {
  padding: 10px 4px;
}

.match-stats__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  border-radius: var(--cm-radius);
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
  font-size: 12px;
}

.match-stats__head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  margin-bottom: 10px;
}

.match-stats__section {
  margin-bottom: 12px;
}

.match-stats__section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 4px;
  padding-top: 6px;
  border-top: 1px solid var(--cm-border-soft);
}

.match-stats__section:first-of-type .match-stats__section-title {
  border-top: none;
  padding-top: 0;
}

.match-stats__row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 10px;
  padding: 4px 0;
  font-size: 12.5px;
}

.match-stats__row--single {
  grid-template-columns: 1fr auto;
}

.match-stats__single-value {
  order: 2;
  text-align: right;
  font-weight: 600;
}

.match-stats__head--single {
  grid-template-columns: 1fr;
}

.match-stats__head-total {
  text-align: center;
  color: var(--cm-text-muted);
  font-weight: 500;
  text-transform: uppercase;
  font-size: 9.5px;
  letter-spacing: 0.3px;
}

.match-stats__label-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 150px;
}

.match-stats__label {
  text-align: center;
  font-size: 11px;
}

.match-stats__total {
  font-size: 10.5px;
  color: var(--cm-accent);
  margin-top: 1px;
}

.match-stats__average {
  font-size: 10.5px;
  color: var(--cm-info);
}

.match-stats__away {
  text-align: right;
}

.match-stats__footnote {
  font-size: 10.5px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
}
</style>
