<script setup>
/**
 * Profilage de cotes d'un match à venir.
 *
 * Retrouve les matchs passés dont les cotes ressemblaient à celles du
 * match (même championnat, ou mêmes équipes), et montre comment ils ont
 * fini. Le voyant s'allume quand la cote du jour paie plus que le
 * pourcentage observé ne le justifie : pourcentage × cote > 1.
 *
 * Cotes passées : football-data.co.uk ; résultats : FotMob ; cotes du
 * jour : The Odds API (1X2 seulement — doubles chances déduites, cote
 * juste du profil pour les buts).
 */
import { computed, ref, watch } from 'vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import AppSelect from '@/components/common/AppSelect.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';

const props = defineProps({
  // Match de la liste : { matchId, league, home, away, commenceTime, marketOdds }
  match: { type: Object, default: null }
});

const PORTEES = [
  { value: 'championnat-2', label: 'Championnat en cours et saison précédente' },
  { value: 'championnat-1', label: 'Championnat en cours' },
  { value: 'championnat-tout', label: 'Championnat, toutes les saisons' },
  { value: 'equipe-domicile', label: "L'équipe qui reçoit, à domicile" },
  { value: 'equipe-exterieur', label: "L'équipe qui se déplace, à l'extérieur" }
];
const SEGMENTS = [
  { value: 'complet', label: 'Temps complet' },
  { value: 'mt1', label: '1re mi-temps' },
  { value: 'mt2', label: '2e mi-temps' }
];
const ECARTS = [5, 8, 10, 13, 15, 20, 25].map((v) => ({ value: v, label: `${v} %` }));

// Réglages retenus d'un match à l'autre, pour ce navigateur seulement.
const CLE_REGLAGES = 'cotemaster.oddsProfile.reglages';
function lireReglages() {
  try {
    return JSON.parse(localStorage.getItem(CLE_REGLAGES) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
const initiaux = lireReglages();
const scope = ref(PORTEES.some((p) => p.value === initiaux.scope) ? initiaux.scope : 'championnat-2');
const segment = ref(SEGMENTS.some((s) => s.value === initiaux.segment) ? initiaux.segment : 'complet');
const tolerance = ref(ECARTS.some((e) => e.value === initiaux.tolerance) ? initiaux.tolerance : 13);

const profile = ref(null);
const loading = ref(false);
const error = ref(null);
const showMatches = ref(false);
let requete = 0;

const odds = computed(() => props.match?.marketOdds ?? null);
const hasOdds = computed(() => Boolean(odds.value?.odds1 && odds.value?.odds2));

async function charger() {
  showMatches.value = false;
  if (!props.match || !hasOdds.value) {
    profile.value = null;
    return;
  }
  const id = ++requete;
  loading.value = true;
  error.value = null;
  try {
    const resultat = await matchStatsApi.oddsProfile({
      league: props.match.league,
      home: props.match.home,
      away: props.match.away,
      kickoff: props.match.commenceTime,
      odds1: odds.value.odds1,
      oddsDraw: odds.value.oddsDraw ?? '',
      odds2: odds.value.odds2,
      scope: scope.value,
      segment: segment.value,
      tolerance: tolerance.value
    });
    if (id === requete) profile.value = resultat;
  } catch (e) {
    if (id !== requete) return;
    profile.value = null;
    // Un serveur lancé avant la mise à jour ne connaît pas la route : sa
    // route générique répond « Statistiques introuvables pour le match
    // odds-profile ».
    error.value = /odds-profile/.test(e.message)
      ? 'Le serveur en cours date d’avant cette fonction : relancez CôteMaster pour activer le profilage de cotes.'
      : e.message;
  } finally {
    if (id === requete) loading.value = false;
  }
}

watch(
  () => [props.match?.matchId, scope.value, segment.value, tolerance.value],
  () => {
    try {
      localStorage.setItem(CLE_REGLAGES, JSON.stringify({ scope: scope.value, segment: segment.value, tolerance: tolerance.value }));
    } catch {
      /* stockage indisponible : les réglages ne seront simplement pas retenus */
    }
    charger();
  },
  { immediate: true }
);

const nf = (x) => (x === null || x === undefined ? '–' : Number(x).toFixed(2));
const pourcent = (x) => `${Math.round(x * 100)} %`;

function titreCote(m) {
  if (m.odds) {
    const origine = m.oddsKind === 'dérivée' ? 'cote déduite du 1X2 du marché' : 'cote moyenne du marché';
    const gain = m.value === null ? '' : ` — ${m.pct} % × ${nf(m.odds)} = ${nf(1 + m.value)}`;
    return `${origine}${gain}`;
  }
  if (m.fairOdds) return `Cote juste du profil (1 / ${m.pct} %) : l'appli ne relève que le 1X2 chez The Odds API.`;
  return 'Aucun match retenu pour ce marché.';
}

function titreVoyant(m) {
  if (m.value === null) return '';
  return m.isValue
    ? `Value : la cote paie ${pourcent(m.value)} de plus que ce que le pourcentage justifie.`
    : `Pas de value : il manque ${pourcent(-m.value)} à la cote pour être rentable.`;
}

const dateCourte = (iso) => {
  const [a, mo, j] = String(iso).split('-');
  return `${j}/${mo}/${a.slice(2)}`;
};

const libellePortee = computed(() => {
  if (!profile.value?.team) return null;
  return profile.value.scope === 'equipe-domicile' ? `${profile.value.team} à domicile` : `${profile.value.team} à l'extérieur`;
});
</script>

<template>
  <div class="odds-profile">
    <p v-if="!match" class="odds-profile__empty">Sélectionnez un match pour le profiler.</p>
    <p v-else-if="!hasOdds" class="odds-profile__empty">
      Pas de cote 1X2 pour ce match : le profilage compare les cotes du jour à celles des matchs passés.
    </p>

    <template v-else>
      <div class="odds-profile__controls">
        <AppSelect v-model="scope" label="Portée du profilage" :options="PORTEES" />
        <div class="odds-profile__controls-row">
          <AppSelect v-model="segment" label="Segment de jeu" :options="SEGMENTS" />
          <AppSelect v-model="tolerance" label="Écart des cotes" :options="ECARTS" />
        </div>
      </div>

      <LoadingSpinner v-if="loading && !profile" label="Profilage en cours…" />
      <div v-else-if="error" class="odds-profile__notice odds-profile__notice--error">
        <AppIcon name="alert" :size="14" />
        <span>{{ error }}</span>
      </div>

      <template v-else-if="profile">
        <div class="odds-profile__heading" :class="{ 'odds-profile__heading--busy': loading }">
          <strong>Résultat du profilage avec {{ profile.analyzed }} match{{ profile.analyzed > 1 ? 's' : '' }} analysé{{ profile.analyzed > 1 ? 's' : '' }}</strong>
          <span v-if="libellePortee" class="odds-profile__muted">{{ libellePortee }}</span>
          <span v-if="profile.history?.count" class="odds-profile__muted">parmi {{ profile.history.count }} matchs cotés</span>
        </div>

        <div v-if="profile.markets.length" class="odds-profile__grid">
          <div
            v-for="m in profile.markets"
            :key="m.key"
            class="odds-cell"
            :class="{ 'odds-cell--value': m.isValue }"
          >
            <span class="odds-cell__label">{{ m.label }}</span>
            <div class="odds-cell__row">
              <span class="odds-cell__pct">{{ m.pct === null ? '–' : `${m.pct}%` }}</span>
              <span class="odds-cell__odds" :class="{ 'odds-cell__odds--fair': !m.odds }" :title="titreCote(m)">
                {{ m.odds ? nf(m.odds) : m.fairOdds ? `≈${nf(m.fairOdds)}` : '–' }}
              </span>
              <span
                v-if="m.value !== null"
                class="odds-cell__badge"
                :class="{ 'odds-cell__badge--on': m.isValue }"
                :title="titreVoyant(m)"
                :aria-label="m.isValue ? 'Value' : 'Pas de value'"
              >
                <AppIcon :name="m.isValue ? 'check' : 'x'" :size="10" />
              </span>
            </div>
          </div>
        </div>

        <div
          v-for="w in profile.warnings"
          :key="w"
          class="odds-profile__notice"
        >
          <AppIcon name="alert" :size="14" />
          <span>{{ w }}</span>
        </div>

        <p v-if="profile.markets.length" class="odds-profile__legend">
          <span class="odds-profile__legend-item">
            <span class="odds-cell__badge odds-cell__badge--on"><AppIcon name="check" :size="10" /></span>
            value : pourcentage × cote &gt; 1
          </span>
          <span class="odds-profile__legend-item">
            <span class="odds-profile__fair">≈</span>
            cote juste du profil, faute de cote du marché pour ce pari
          </span>
        </p>

        <div v-if="profile.matches.length" class="odds-profile__matches">
          <button type="button" class="odds-profile__toggle" @click="showMatches = !showMatches">
            <AppIcon name="chevronRight" :size="12" :class="{ 'odds-profile__chevron--open': showMatches }" />
            {{ showMatches ? 'Masquer' : 'Voir' }} les {{ profile.matches.length }} matchs retenus
          </button>
          <table v-if="showMatches" class="odds-profile__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Match · cotes 1 N 2</th>
                <th class="odds-profile__score">{{ profile.segment === 'complet' ? 'Score' : 'Score (MT)' }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in profile.matches" :key="r.date + r.home + r.away">
                <td class="odds-profile__muted odds-profile__date">{{ dateCourte(r.date) }}</td>
                <td>
                  <span class="odds-profile__teams">{{ r.home }} – {{ r.away }}</span>
                  <span class="odds-profile__row-odds">{{ nf(r.odds.home) }} · {{ nf(r.odds.draw) }} · {{ nf(r.odds.away) }}</span>
                </td>
                <td class="odds-profile__score">
                  {{ r.score }}<span v-if="r.segmentScore" class="odds-profile__muted"> ({{ r.segmentScore }})</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="odds-profile__source">
          Cotes passées : {{ profile.source }}, moyenne du marché à la clôture. Résultats : FotMob. Cotes du jour : The Odds API.
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.odds-profile {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.odds-profile__empty {
  margin: 0;
  padding: 18px 4px;
  color: var(--cm-text-secondary);
  font-size: 13px;
}

.odds-profile__controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.odds-profile__controls-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.odds-profile__heading {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  font-size: 13px;
  transition: opacity var(--cm-transition);
}

.odds-profile__heading--busy {
  opacity: 0.55;
}

.odds-profile__muted {
  color: var(--cm-text-muted);
  font-size: 12px;
}

.odds-profile__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.odds-cell {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 9px 8px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-alt);
  min-width: 0;
}

.odds-cell--value {
  border-color: rgba(52, 211, 153, 0.45);
  background: linear-gradient(0deg, var(--cm-accent-soft), var(--cm-accent-soft)), var(--cm-surface-alt);
}

.odds-cell__label {
  text-align: center;
  font-size: 11px;
  color: var(--cm-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.odds-cell__row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.odds-cell__pct {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
  font-variant-numeric: tabular-nums;
}

.odds-cell__odds {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--cm-text-primary);
  font-variant-numeric: tabular-nums;
  cursor: help;
}

.odds-cell__odds--fair {
  color: var(--cm-text-muted);
  font-weight: 500;
  font-style: italic;
}

.odds-cell__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid var(--cm-border);
  color: var(--cm-text-muted);
  cursor: help;
}

.odds-cell__badge--on {
  background: var(--cm-accent);
  border-color: var(--cm-accent);
  color: #06251b;
}

.odds-profile__notice {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
  font-size: 12.5px;
}

.odds-profile__notice--error {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.odds-profile__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.odds-profile__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.odds-profile__fair {
  display: inline-block;
  width: 16px;
  text-align: center;
  font-style: italic;
  font-weight: 700;
}

.odds-profile__matches {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.odds-profile__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--cm-accent);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.odds-profile__chevron--open {
  transform: rotate(90deg);
}

.odds-profile__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.odds-profile__table th {
  text-align: left;
  padding: 6px 6px;
  color: var(--cm-text-muted);
  font-weight: 600;
  border-bottom: 1px solid var(--cm-border);
}

.odds-profile__table td {
  padding: 6px 6px;
  border-bottom: 1px solid var(--cm-border-soft);
  vertical-align: top;
}

.odds-profile__score {
  font-weight: 700;
  white-space: nowrap;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.odds-profile__date {
  white-space: nowrap;
}

.odds-profile__teams {
  display: block;
}

.odds-profile__row-odds {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  color: var(--cm-text-muted);
  font-variant-numeric: tabular-nums;
}

.odds-profile__source {
  margin: 0;
  font-size: 11px;
  color: var(--cm-text-muted);
}

@media (max-width: 420px) {
  .odds-profile__controls-row {
    grid-template-columns: 1fr;
  }

  .odds-cell {
    padding: 6px 6px 7px;
  }

  .odds-cell__pct,
  .odds-cell__odds {
    font-size: 12px;
  }
}
</style>
