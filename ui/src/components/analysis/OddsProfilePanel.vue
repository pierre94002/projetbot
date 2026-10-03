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
 *
 * Dessin (refonte du 01/10/2026) : les commandes en rangée, le résultat en
 * chiffres clés, chaque marché en bloc avec son pourcentage en gros, sa
 * cote et son voyant value ; les matchs retenus en cartes de rencontre.
 */
import { computed, ref, watch } from 'vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import AppSelect from '@/components/common/AppSelect.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import MatchCard from '@/components/matches/MatchCard.vue';
import PickCrest from '@/components/matches/PickCrest.vue';

const props = defineProps({
  // Match de la liste : { matchId, league, home, away, commenceTime, marketOdds }
  match: { type: Object, default: null }
});

// Les issues qui désignent une équipe (« Domicile gagne », « Extérieur ou nul ») : son logo devant.
const CAMP_DU_MARCHE = { 1: 'home', '1N': 'home', 2: 'away', N2: 'away' };
const campDuMarche = (cle) => CAMP_DU_MARCHE[cle] ?? 'aucun';

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

const libellePortee = computed(() => {
  if (!profile.value?.team) return null;
  return profile.value.scope === 'equipe-domicile' ? `${profile.value.team} à domicile` : `${profile.value.team} à l'extérieur`;
});

// ---- présentation ---------------------------------------------------------
// Le nombre de marchés où la cote du jour paie plus que le profil ne le justifie.
const nombreValues = computed(() => (profile.value?.markets ?? []).filter((m) => m.isValue).length);
</script>

<template>
  <div class="opp">
    <EmptyState v-if="!match" icon="percent" title="Aucun match sélectionné" description="Sélectionnez un match pour le profiler." />
    <EmptyState
      v-else-if="!hasOdds"
      icon="percent"
      title="Pas de cote 1X2 pour ce match"
      description="Le profilage compare les cotes du jour à celles des matchs passés : sans cote 1X2, rien à comparer."
    />

    <template v-else>
      <!-- Les commandes du profilage, en rangée. -->
      <div class="cm-toolbar opp__toolbar">
        <AppSelect v-model="scope" label="Portée du profilage" :options="PORTEES" class="opp__scope" />
        <AppSelect v-model="segment" label="Segment de jeu" :options="SEGMENTS" class="opp__segment" />
        <AppSelect v-model="tolerance" label="Écart des cotes" :options="ECARTS" class="opp__tolerance" />
      </div>

      <LoadingSpinner v-if="loading && !profile" label="Profilage en cours…" />
      <div v-else-if="error" class="cm-note is-danger">
        <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
        <div>
          <p class="cm-note__title">Profilage impossible</p>
          <p class="cm-note__text">{{ error }}</p>
        </div>
      </div>

      <template v-else-if="profile">
        <!-- Le résultat du profilage en chiffres clés (estompé pendant une relecture). -->
        <div class="cm-kpis opp__kpis" :class="{ 'is-busy': loading }">
          <div class="cm-kpi is-section">
            <span class="cm-kpi__label">Résultat du profilage</span>
            <span class="cm-kpi__value">{{ profile.analyzed }}</span>
            <span class="cm-kpi__detail">match{{ profile.analyzed > 1 ? 's' : '' }} analysé{{ profile.analyzed > 1 ? 's' : '' }}</span>
          </div>
          <div v-if="profile.history?.count" class="cm-kpi">
            <span class="cm-kpi__label">Matchs cotés</span>
            <span class="cm-kpi__value">{{ profile.history.count }}</span>
            <span class="cm-kpi__detail">dans l'historique, parmi lesquels les matchs retenus</span>
          </div>
          <div v-if="libellePortee" class="cm-kpi opp__kpi-text">
            <span class="cm-kpi__label">Portée</span>
            <span class="cm-kpi__value">{{ libellePortee }}</span>
            <span class="cm-kpi__detail">profil restreint à ce club</span>
          </div>
          <div v-if="profile.markets.length" class="cm-kpi" :class="{ 'opp__kpi-value': nombreValues }">
            <span class="cm-kpi__label">Values</span>
            <span class="cm-kpi__value">{{ nombreValues }}</span>
            <span class="cm-kpi__detail">marché{{ nombreValues > 1 ? 's' : '' }} où la cote paie plus que le profil</span>
          </div>
        </div>

        <!-- Chaque marché en bloc : son pourcentage en gros, sa cote, son voyant value. -->
        <div v-if="profile.markets.length" class="opp__section">
          <p class="cm-group-title">Comment ont fini ces matchs, marché par marché</p>
          <div class="opp__grid cm-stagger">
            <div v-for="m in profile.markets" :key="m.key" class="cm-block opp__market" :class="{ 'is-value': m.isValue }">
              <span class="opp__market-label cm-truncate">
                <PickCrest :side="campDuMarche(m.key)" :home="match?.home ?? null" :away="match?.away ?? null" :league="match?.league ?? null" :size="14" />{{ m.label }}
              </span>
              <span class="opp__market-pct cm-numeric" title="Part des matchs retenus où ce pari est passé">{{ m.pct === null ? '–' : `${m.pct}%` }}</span>
              <span class="opp__market-row">
                <span class="cm-pill opp__market-odds" :class="{ 'is-fair': !m.odds }" :title="titreCote(m)">
                  {{ m.odds ? nf(m.odds) : m.fairOdds ? `≈${nf(m.fairOdds)}` : '–' }}
                </span>
                <span
                  v-if="m.value !== null"
                  class="opp__badge"
                  :class="{ 'is-on': m.isValue }"
                  :title="titreVoyant(m)"
                  :aria-label="m.isValue ? 'Value' : 'Pas de value'"
                >
                  <AppIcon :name="m.isValue ? 'check' : 'x'" :size="11" />
                </span>
              </span>
            </div>
          </div>
        </div>

        <div v-for="w in profile.warnings" :key="w" class="cm-note is-warning">
          <span class="cm-icon-box is-warning is-sm"><AppIcon name="alert" :size="14" /></span>
          <div>
            <p class="cm-note__title">À savoir</p>
            <p class="cm-note__text">{{ w }}</p>
          </div>
        </div>

        <p v-if="profile.markets.length" class="opp__legend">
          <span class="opp__legend-item">
            <span class="opp__badge is-on"><AppIcon name="check" :size="11" /></span>
            value : pourcentage × cote &gt; 1
          </span>
          <span class="opp__legend-item">
            <span class="opp__fair">≈</span>
            cote juste du profil, faute de cote du marché pour ce pari
          </span>
        </p>

        <!-- Les matchs retenus, en cartes de rencontre, à la demande. -->
        <div v-if="profile.matches.length" class="opp__matches">
          <button type="button" class="cm-link opp__toggle" @click="showMatches = !showMatches">
            <AppIcon name="chevronRight" :size="13" class="opp__chevron" :class="{ 'is-open': showMatches }" />
            {{ showMatches ? 'Masquer' : 'Voir' }} les {{ profile.matches.length }} matchs retenus
          </button>
          <div v-if="showMatches" class="opp__cards cm-stagger">
            <!-- Carte de rencontre commune (01/10/2026) : cotes de clôture 1 N 2 et score de la période à droite. -->
            <MatchCard
              v-for="r in profile.matches"
              :key="r.date + r.home + r.away"
              :match="{
                date: r.date,
                league: match?.league ?? null,
                homeName: r.home,
                awayName: r.away,
                homeId: r.homeId ?? null,
                awayId: r.awayId ?? null,
                homeGoals: r.homeGoals ?? Number(String(r.score).split('-')[0]),
                awayGoals: r.awayGoals ?? Number(String(r.score).split('-')[1]),
                status: 'finished'
              }"
              :to="r.matchKey ? `/match/${r.matchKey}` : null"
              variant="compact"
              :show-competition="false"
              class="opp__card"
            >
              <template #aside>
                <span class="opp__row-odds cm-numeric" title="Cotes de clôture 1 · N · 2">{{ nf(r.odds.home) }} · {{ nf(r.odds.draw) }} · {{ nf(r.odds.away) }}</span>
                <span v-if="r.segmentScore" class="cm-pill opp__segment-score" title="Score de la période étudiée">MT {{ r.segmentScore }}</span>
              </template>
            </MatchCard>
          </div>
        </div>

        <p class="opp__source">
          <AppIcon name="database" :size="12" />
          Cotes passées : {{ profile.source }}, moyenne du marché à la clôture. Résultats : FotMob. Cotes du jour : The Odds API.
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.opp {
  /* Se règle sur SA largeur : page large comme panneau étroit. */
  container: opp / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ------------------------------------------------------------- commandes */
.opp__toolbar > * {
  flex: 1 1 160px;
}

.opp__scope {
  flex-basis: 280px;
}

/* --------------------------------------------------------- chiffres clés */
.opp__kpis {
  transition: opacity var(--cm-transition);
}

.opp__kpis.is-busy {
  opacity: 0.55;
}

/* Une portée en toutes lettres : plus petite qu'un chiffre. */
.opp__kpi-text .cm-kpi__value {
  font-size: 15px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

/* Au moins une value : le chiffre en vert (sémantique, quelle que soit la section). */
.opp__kpi-value {
  border-color: rgba(var(--cm-accent-rgb) / 0.3);
}

.opp__kpi-value .cm-kpi__value {
  color: var(--cm-accent);
}

/* ------------------------------------------------------------- marchés */
.opp__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.opp__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.opp__market {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  min-width: 0;
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.opp__market:hover {
  border-color: var(--cm-border);
}

/* Le marché en value : liseré et halo verts. */
.opp__market.is-value {
  border-color: rgba(var(--cm-accent-rgb) / 0.4);
  background: radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-accent-rgb) / 0.12), transparent 60%), var(--cm-surface-alt);
}

.opp__market-label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.opp__market-label :deep(.pick-crest) {
  margin-right: 5px;
}

.opp__market-pct {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--cm-text-primary);
}

.opp__market.is-value .opp__market-pct {
  color: var(--cm-accent);
}

.opp__market-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.opp__market-odds {
  min-width: 0;
  padding: 3px 9px;
  font-size: 12px;
  color: var(--cm-text-primary);
  cursor: help;
}

.opp__market-odds.is-fair {
  color: var(--cm-text-muted);
  font-weight: 500;
  font-style: italic;
}

/* Le voyant value : éteint (gris) ou allumé (vert plein). */
.opp__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
  cursor: help;
}

.opp__badge.is-on {
  background: var(--cm-accent);
  border-color: var(--cm-accent);
  color: var(--cm-text-on-accent);
  box-shadow: 0 0 0 3px var(--cm-accent-soft);
}

/* ------------------------------------------------------------- légende */
.opp__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.opp__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.opp__fair {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--cm-surface-hover);
  font-style: italic;
  font-weight: 700;
  color: var(--cm-text-secondary);
}

/* ------------------------------------------------------- matchs retenus */
.opp__matches {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.opp__toggle {
  align-self: flex-start;
}

.opp__chevron {
  transition: transform var(--cm-transition);
}

.opp__chevron.is-open {
  transform: rotate(90deg);
}

.opp__cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Cotes de clôture et score de la période, à droite de la carte. */
.opp__card {
  --mcard-aside: 220px;
}

.opp__row-odds {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  white-space: nowrap;
}

.opp__segment-score {
  min-width: 0;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--cm-text-secondary);
}

/* --------------------------------------------------------------- source */
.opp__source {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.opp__source :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}

/* Panneau étroit : les commandes en colonne, les marchés sur deux colonnes, les cotes sous la carte. */
@container opp (max-width: 420px) {
  .opp__toolbar > * {
    flex-basis: 100%;
  }

  .opp__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .opp__market {
    padding: 10px 12px;
  }

  .opp__market-pct {
    font-size: 20px;
  }

  .opp__card {
    --mcard-aside: 120px;
  }
}
</style>
