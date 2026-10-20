<script setup>
import { computed, onMounted, ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppButton from '@/components/common/AppButton.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import { oddsApi } from '@/services/oddsApi.js';
import { useToastStore } from '@/stores/toastStore.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';

/**
 * Les cotes GRATUITES, compétition par compétition (04/10/2026) : ce qu'on
 * a (cotes passées, cotes des matchs à venir, direct, argent misé — et de
 * quelle source) et ce qui MANQUE, dit en clair. Pierre : « pour toutes les
 * données que tu n'as pas sur les cotes, il faut que tu le notifies, que je
 * le voie dans CôteMaster ».
 *
 * En tête : la collecte elle-même — chaque source, son dernier relevé, son
 * rattrapage de l'historique — et un bouton pour relever tout de suite les
 * cotes des trois prochains jours (gratuit, donc permis à la demande).
 */
const toast = useToastStore();
const favoris = useFavoritesStore();
const etat = ref({ loading: false, error: null, coverage: null, status: null });
const releve = ref(false);
const seulementManques = ref(true);

async function charger({ force = false } = {}) {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const [coverage, status] = await Promise.all([oddsApi.coverage({ days: 7, force }), oddsApi.status()]);
    etat.value = { loading: false, error: null, coverage, status };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}

async function releverMaintenant() {
  releve.value = true;
  try {
    const r = await oddsApi.refresh();
    const ecrites = (r.sources ?? []).reduce((n, s) => n + (s.written ?? 0), 0);
    toast.success(`Relevé fait : ${ecrites.toLocaleString('fr-FR')} cote(s) écrite(s) pour ${r.fixtures ?? 0} rencontre(s) à venir.`);
    await charger({ force: true });
  } catch (error) {
    toast.error(`Relevé impossible : ${error.message}`);
  } finally {
    releve.value = false;
  }
}

onMounted(() => charger());

const NOMS = { espn: 'ESPN', kalshi: 'Kalshi', smarkets: 'Smarkets', '365scores': '365Scores', 'football-data.co.uk': 'football-data.co.uk' };
const nom = (s) => NOMS[s] ?? s;
const nombre = (n) => Number(n ?? 0).toLocaleString('fr-FR');
const quand = (iso) => (iso ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : 'jamais');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const totaux = computed(() => etat.value.coverage?.totals ?? null);
const fournisseurs = computed(() => {
  const couverture = etat.value.coverage?.providers ?? [];
  const resume = new Map((etat.value.status?.summary?.sources ?? []).map((s) => [s.source, s]));
  const rattrapage = new Map((etat.value.status?.backfill ?? []).map((b) => [b.source, b]));
  return couverture.map((p) => ({
    ...p,
    resume: resume.get(p.source) ?? null,
    rattrapage: rattrapage.get(p.source) ?? null
  }));
});
const boucle = computed(() => etat.value.status?.watch ?? null);

const competitions = computed(() => {
  const liste = etat.value.coverage?.competitions ?? [];
  const filtrees = seulementManques.value ? liste.filter((c) => c.missing.length) : liste;
  // Vos championnats favoris d'abord, puis ce qui manque le plus.
  const triees = [...filtrees].sort((a, b) => b.missing.length - a.missing.length || a.league.localeCompare(b.league, 'fr'));
  return favoris.favoritesFirst(triees, { league: (c) => c.league });
});
</script>

<template>
  <div class="fcov">
    <LoadingSpinner v-if="etat.loading && !etat.coverage" label="Lecture de la couverture des cotes…" />
    <EmptyState v-else-if="etat.error && !etat.coverage" icon="alert" title="Couverture indisponible" :description="etat.error" />

    <template v-else-if="etat.coverage">
      <!-- 1. Les chiffres clés : ce qui manque, en un coup d'œil. -->
      <div class="cm-kpis fcov__kpis">
        <div class="cm-kpi">
          <span class="cm-kpi__label">Compétitions suivies</span>
          <span class="cm-kpi__value">{{ totaux.competitions }}</span>
        </div>
        <div class="cm-kpi" :class="{ 'is-warn': totaux.withoutHistory }">
          <span class="cm-kpi__label">Sans cote passée</span>
          <span class="cm-kpi__value">{{ totaux.withoutHistory }}</span>
          <span class="cm-kpi__detail">profilage impossible</span>
        </div>
        <div class="cm-kpi" :class="{ 'is-warn': totaux.withoutPrematchSource }">
          <span class="cm-kpi__label">Sans source à venir</span>
          <span class="cm-kpi__value">{{ totaux.withoutPrematchSource }}</span>
          <span class="cm-kpi__detail">aucune source gratuite</span>
        </div>
        <div class="cm-kpi" :class="{ 'is-warn': totaux.withoutLive }">
          <span class="cm-kpi__label">Sans direct</span>
          <span class="cm-kpi__value">{{ totaux.withoutLive }}</span>
        </div>
        <div class="cm-kpi" :class="{ 'is-warn': totaux.withoutVolumes }">
          <span class="cm-kpi__label">Sans argent misé</span>
          <span class="cm-kpi__value">{{ totaux.withoutVolumes }}</span>
          <span class="cm-kpi__detail">ni Kalshi ni Smarkets</span>
        </div>
      </div>

      <!-- 2. Les sources : chargée ou non, dernier relevé, rattrapage. -->
      <div class="fcov__sources">
        <div v-for="p in fournisseurs" :key="p.source" class="fcov__source" :class="{ 'is-down': !p.loaded }">
          <span class="cm-icon-box is-sm" :class="p.loaded ? 'is-info' : 'is-danger'"><AppIcon :name="p.loaded ? 'database' : 'alert'" :size="13" /></span>
          <div class="fcov__source-body">
            <p class="fcov__source-name">
              {{ p.name }}
              <span class="cm-text-muted">· {{ p.leagues }} compétition{{ p.leagues > 1 ? 's' : '' }}</span>
            </p>
            <p v-if="!p.loaded" class="fcov__source-meta is-down">Connecteur indisponible : aucune cote de cette source.</p>
            <p v-else class="fcov__source-meta">
              <template v-if="p.resume">{{ nombre(p.resume.events) }} rencontres relevées, dernier passage {{ quand(p.resume.lastSeenAt) }}</template>
              <template v-else>Rien relevé pour l'instant</template>
              <template v-if="p.rattrapage?.scopes">
                · historique : {{ p.rattrapage.done }}/{{ p.rattrapage.scopes }} portée{{ p.rattrapage.scopes > 1 ? 's' : '' }} terminée{{ p.rattrapage.done > 1 ? 's' : '' }}
              </template>
            </p>
            <p v-if="p.coverage?.limites?.length" class="fcov__source-limits">{{ p.coverage.limites.join(' · ') }}</p>
          </div>
        </div>
        <p v-if="boucle" class="fcov__loop">
          <AppIcon name="clock" :size="12" />
          <template v-if="boucle.startedAt">Relevés autour des matchs toutes les {{ boucle.intervalMinutes }} min ; dernier passage {{ quand(boucle.lastTickAt) }}.</template>
          <template v-else>La boucle des cotes ne tourne pas sur ce serveur (actualisation automatique coupée).</template>
        </p>
      </div>

      <div class="fcov__actions">
        <label class="fcov__toggle">
          <input v-model="seulementManques" type="checkbox" />
          Seulement les compétitions où il manque quelque chose
        </label>
        <AppButton variant="secondary" size="sm" :loading="releve" @click="releverMaintenant">
          <template #icon><AppIcon name="refresh" :size="14" /></template>
          Relever maintenant
        </AppButton>
      </div>

      <!-- 3. Compétition par compétition : ce qu'on a, ce qui manque. -->
      <div class="cm-table-wrap">
        <table class="cm-table fcov__table">
          <thead>
            <tr>
              <th class="is-left">Compétition</th>
              <th>Cotes passées</th>
              <th>À venir ({{ etat.coverage.days }} j)</th>
              <th class="is-left">Direct · volumes</th>
              <th class="is-left">Ce qui manque</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in competitions" :key="c.league">
              <td class="is-left"><LeagueBadge :league="c.league" /></td>
              <td class="cm-numeric" :title="c.history.sources.map((s) => `${nom(s.source)} : ${nombre(s.count)}`).join(' · ')">
                <span :class="{ 'fcov__zero': !c.history.withOdds }">{{ nombre(c.history.withOdds) }} / {{ nombre(c.history.played) }}</span>
                <small class="fcov__pct">{{ pct(c.history.withOdds, c.history.played) }} %</small>
              </td>
              <td class="cm-numeric fcov__wrap" :title="c.upcoming.sources.map((s) => `${nom(s.source)} : ${nombre(s.count)}`).join(' · ') || 'aucune source'">
                <span :class="{ 'fcov__zero': c.upcoming.fixtures && !c.upcoming.withOdds }">{{ nombre(c.upcoming.withOdds) }} / {{ nombre(c.upcoming.fixtures) }}</span>
                <small class="fcov__pct">{{ c.coveredBy.prematch.join(', ') || 'aucune source' }}</small>
              </td>
              <td class="is-left fcov__small fcov__wrap">
                <span>{{ c.coveredBy.live.length ? c.coveredBy.live.join(', ') : '—' }}</span>
                <span class="cm-text-muted"> · {{ c.coveredBy.volumes.length ? c.coveredBy.volumes.join(', ') : 'pas de volumes' }}</span>
              </td>
              <td class="is-left fcov__missing">
                <span v-if="!c.missing.length" class="cm-chip is-accent">complet</span>
                <ul v-else>
                  <li v-for="(m, i) in c.missing" :key="i">{{ m }}</li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="!competitions.length" class="cm-text-muted fcov__none">Rien ne manque : toutes les compétitions ont leurs cotes.</p>
      <p class="fcov__foot">
        <AppIcon name="info" :size="12" />
        Toujours absents, quelle que soit la compétition : les cotes Winamax, Betclic, Unibet et PMU (seul le relevé The Odds API, fait à la main, les donne),
        les volumes Betfair (fermé aux résidents français), les cotes de corners, tirs et cartons. Mis à jour le {{ quand(etat.coverage.generatedAt) }}.
      </p>
    </template>
  </div>
</template>

<style scoped>
.fcov {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fcov__kpis {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.cm-kpi.is-warn .cm-kpi__value {
  color: var(--cm-warning);
}

.fcov__sources {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fcov__source {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.fcov__source-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.fcov__source-name {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.fcov__source-meta,
.fcov__source-limits,
.fcov__loop,
.fcov__foot {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.fcov__source-meta.is-down {
  color: var(--cm-danger);
}

.fcov__source-limits {
  color: var(--cm-text-muted);
}

.fcov__loop,
.fcov__foot {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--cm-text-muted);
}

.fcov__loop :deep(svg),
.fcov__foot :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

.fcov__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.fcov__toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
  cursor: pointer;
}

.fcov__table td {
  vertical-align: top;
}

.fcov__pct {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.fcov__zero {
  color: var(--cm-warning);
  font-weight: 700;
}

.fcov__small {
  font-size: 12px;
}

/* Les listes de sources passent à la ligne (cm-table interdit le retour à la
   ligne) : sans cela le tableau débordait de la carte et la colonne « Ce qui
   manque », la plus importante, n'apparaissait qu'en défilant à droite. */
.fcov__table td.fcov__wrap {
  white-space: normal;
  min-width: 130px;
}

.fcov__table td.fcov__missing {
  white-space: normal;
  min-width: 260px;
}

.fcov__missing ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  line-height: 1.4;
  color: var(--cm-warning);
  white-space: normal;
  min-width: 220px;
}

.fcov__none {
  margin: 0;
  font-size: 13px;
}
</style>
