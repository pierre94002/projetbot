<script setup>
import { computed, onMounted } from 'vue';
import { useBetsStore } from '@/stores/betsStore.js';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import ClosingValuePanel from '@/components/analysis/ClosingValuePanel.vue';
import { formatDay, formatCurrency, formatPercent } from '@/utils/format.js';
import { marketBreakdownLabel, legStatus } from '@/utils/betTrends.js';
// Étape 11 du plan (06/10/2026) : le SUIVI DES PARIS — gain réel face au gain attendu, valeur de clôture de chaque
// pari, résultats par marché / championnat / bookmaker / tranche de cote / confiance, zone normale des séries de
// pertes et garde-fous. Tout est calculé par le serveur (GET /api/bets/suivi, server/src/data/suiviParis.js) ;
// la page met en forme. Les blocs d'avant (bandeau, jour par jour, taux par marché) restent tels quels.
import { ref } from 'vue';
import { betsApi } from '@/services/betsApi.js';
import AppButton from '@/components/common/AppButton.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import GainCurvesChart from '@/components/betting/GainCurvesChart.vue';
import LossStreakBand from '@/components/betting/LossStreakBand.vue';
import BetBreakdownTable from '@/components/betting/BetBreakdownTable.vue';
import BetLedgerTable from '@/components/betting/BetLedgerTable.vue';
import { eurosSignes, pourcentSigne, pourcent, tableauxVides, tonSigne } from '@/utils/suiviParis.js';

const betsStore = useBetsStore();

// Regroupe le carnet par jour de création (pas de règlement — un pari en
// attente reste rattaché au jour où il a été placé, comme un relevé de paris
// classique). Chaque jour agrège gagnés/perdus/en attente et le P&L des
// paris déjà réglés ce jour-là.
const betsDailySummaries = computed(() => {
  const byDay = new Map();
  for (const bet of betsStore.bets) {
    const day = bet.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { day, total: 0, won: 0, lost: 0, pending: 0, void: 0, staked: 0, returned: 0 });
    const entry = byDay.get(day);
    entry.total++;
    entry[bet.status]++;
    if (bet.status === 'won' || bet.status === 'lost') {
      entry.staked += bet.stake;
      entry.returned += bet.status === 'won' ? bet.stake * bet.odds : 0;
    }
  }
  return [...byDay.values()]
    .map((entry) => {
      const settled = entry.won + entry.lost;
      return {
        ...entry,
        netProfit: entry.returned - entry.staked,
        roiPercent: entry.staked > 0 ? ((entry.returned - entry.staked) / entry.staked) * 100 : null,
        hitRate: settled > 0 ? (entry.won / settled) * 100 : null,
        failRate: settled > 0 ? (entry.lost / settled) * 100 : null
      };
    })
    .sort((a, b) => b.day.localeCompare(a.day));
});

// Taux de réussite PAR MARCHÉ — chaque SÉLECTION compte pour son propre
// marché avec son propre statut, y compris dans un combiné : une jambe qui a
// individuellement gagné reste comptée comme gagnée pour son marché même si
// le ticket entier a perdu à cause d'une autre sélection.
//
// Le Yield (mise réelle × cote réelle, cf. discussion Yield/ROI) n'est
// calculé QUE sur les paris simples : la mise d'un combiné est partagée entre
// plusieurs marchés à la fois, l'attribuer en entier à chacun gonflerait
// artificiellement l'exposition — contrairement au taux de réussite, qui
// reste valable jambe par jambe même dans un combiné.
const betsMarketBreakdown = computed(() => {
  const byMarket = new Map();
  for (const bet of betsStore.bets) {
    bet.legs.forEach((leg, index) => {
      const market = marketBreakdownLabel(leg.market, leg.pick);
      if (!byMarket.has(market)) byMarket.set(market, { market, total: 0, won: 0, lost: 0, pending: 0, void: 0, staked: 0, returned: 0 });
      const m = byMarket.get(market);
      m.total++;
      const status = legStatus(bet, index);
      m[status]++;
      if (bet.legs.length === 1 && (status === 'won' || status === 'lost')) {
        m.staked += bet.stake;
        m.returned += status === 'won' ? bet.stake * bet.odds : 0;
      }
    });
  }
  return [...byMarket.values()]
    .map((m) => {
      const settled = m.won + m.lost;
      return {
        ...m,
        settled,
        hitRate: settled > 0 ? (m.won / settled) * 100 : null,
        failRate: settled > 0 ? (m.lost / settled) * 100 : null,
        yieldPercent: m.staked > 0 ? ((m.returned - m.staked) / m.staked) * 100 : null
      };
    })
    .sort((a, b) => b.total - a.total);
});

// Lignes de synthèse tout en bas de chaque tableau : Σ des comptages et un
// taux RECALCULÉ sur ces sommes — jamais une moyenne des taux par
// jour/marché, qui pondérerait un jour/marché à 1 pari autant qu'un autre à 20.
const betsDailyTotal = computed(() => {
  const total = betsDailySummaries.value.reduce(
    (acc, d) => ({
      total: acc.total + d.total,
      won: acc.won + d.won,
      lost: acc.lost + d.lost,
      pending: acc.pending + d.pending,
      staked: acc.staked + d.staked,
      returned: acc.returned + d.returned
    }),
    { total: 0, won: 0, lost: 0, pending: 0, staked: 0, returned: 0 }
  );
  const settled = total.won + total.lost;
  return {
    ...total,
    netProfit: total.returned - total.staked,
    roiPercent: total.staked > 0 ? ((total.returned - total.staked) / total.staked) * 100 : null,
    hitRate: settled > 0 ? (total.won / settled) * 100 : null,
    failRate: settled > 0 ? (total.lost / settled) * 100 : null
  };
});

const betsMarketBreakdownTotal = computed(() => {
  const total = betsMarketBreakdown.value.reduce(
    (acc, m) => ({
      total: acc.total + m.total,
      won: acc.won + m.won,
      lost: acc.lost + m.lost,
      pending: acc.pending + m.pending,
      staked: acc.staked + m.staked,
      returned: acc.returned + m.returned
    }),
    { total: 0, won: 0, lost: 0, pending: 0, staked: 0, returned: 0 }
  );
  const settled = total.won + total.lost;
  return {
    ...total,
    hitRate: settled > 0 ? (total.won / settled) * 100 : null,
    failRate: settled > 0 ? (total.lost / settled) * 100 : null,
    yieldPercent: total.staked > 0 ? ((total.returned - total.staked) / total.staked) * 100 : null
  };
});

const betsSettledCount = computed(() => betsStore.settledBets.length);
const betsWonCount = computed(() => betsStore.bets.filter((bet) => bet.status === 'won').length);
const betsHitRatePercent = computed(() => (betsSettledCount.value > 0 ? (betsWonCount.value / betsSettledCount.value) * 100 : null));

const betsPerformanceSummary = computed(() => {
  if (betsStore.bets.length === 0) return null;
  const activeDays = betsDailySummaries.value.length;
  if (betsSettledCount.value === 0) {
    return `${betsStore.bets.length} pari(s) sur ${activeDays} jour(s), aucun résultat réglé pour l'instant.`;
  }
  const profitPhrase = betsStore.netProfit >= 0 ? `+${formatCurrency(betsStore.netProfit)}` : formatCurrency(betsStore.netProfit);
  return `Sur ${activeDays} jour(s) actif(s) : ${betsWonCount.value} gagné(s) / ${betsSettledCount.value} réglé(s) (${betsHitRatePercent.value.toFixed(0)}% de réussite), profit net ${profitPhrase} (ROI ${formatPercent(betsStore.roiPercent, { showSign: true })}).`;
});

// Compléments du bandeau (présentation seule, refonte du 01/10/2026) : les
// perdus et les en attente, pour les puces à côté des gagnés comptés ci-dessus.
const betsLostCount = computed(() => betsStore.bets.filter((bet) => bet.status === 'lost').length);
const betsPendingCount = computed(() => betsStore.bets.filter((bet) => bet.status === 'pending').length);

// Le profit net de chaque jour en barres (présentation seule) : du plus
// ancien au plus récent, la hauteur relative au plus gros écart du carnet,
// vert au-dessus de la ligne, rouge en dessous.
const profitParJour = computed(() => {
  const jours = [...betsDailySummaries.value].reverse();
  const plafond = Math.max(1, ...jours.map((d) => Math.abs(d.netProfit)));
  return jours.map((d) => ({ day: d.day, netProfit: d.netProfit, hauteur: (Math.abs(d.netProfit) / plafond) * 100 }));
});

// ------------------------------------------------------- étape 11 : le suivi
const suivi = ref({ loading: false, error: null, data: null });
// Une réponse arrivée après une demande plus récente ne l'écrase pas.
let derniereDemandeSuivi = 0;
async function chargerSuivi() {
  const numero = ++derniereDemandeSuivi;
  suivi.value = { ...suivi.value, loading: true, error: null };
  try {
    const data = await betsApi.suivi();
    if (numero === derniereDemandeSuivi) suivi.value = { loading: false, error: null, data };
  } catch (error) {
    if (numero === derniereDemandeSuivi) suivi.value = { loading: false, error: error.message, data: suivi.value.data };
  }
}
const s = computed(() => suivi.value.data);
/** Les cinq tableaux du serveur ; sans réponse, leur structure vide (la règle de Pierre : le tableau d'abord). */
const tableauxDuSuivi = computed(() => s.value?.tableaux ?? tableauxVides());
const alertesDuSuivi = computed(() => s.value?.gardeFous?.alertes ?? []);
const attenduDuSuivi = computed(() => s.value?.attendu ?? null);
const tonDe = (x) => {
  const t = tonSigne(x);
  return t === 'is-positive' ? 'cm-positive' : t === 'is-negative' ? 'cm-negative' : '';
};
/** « 1 pari réglé », « 34 paris réglés » : chaque mot s'accorde. */
const nombreDe = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

// Toujours réactualisé à l'ouverture (pas seulement si vide) — cf. même
// remarque que Mes tickets : un match réglé pendant que cette vue était
// démontée ne remonterait sinon jamais sans ce refetch systématique.
onMounted(() => {
  betsStore.fetchBets();
  chargerSuivi();
});
</script>

<template>
  <div class="perf cm-page">
    <!-- 1. LE BANDEAU : ce que rapporte le carnet, d'un coup d'œil -->
    <section class="cm-hero">
      <div class="cm-hero__top">
        <h2 class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon name="wallet" :size="18" /></span>
          Historique &amp; performance
        </h2>
        <span class="cm-hero__chips">
          <span class="cm-chip is-section"><AppIcon name="cards" :size="11" />{{ betsStore.bets.length }} pari{{ betsStore.bets.length > 1 ? 's' : '' }}</span>
          <span class="cm-chip is-accent"><AppIcon name="check" :size="11" />{{ betsWonCount }} gagné{{ betsWonCount > 1 ? 's' : '' }}</span>
          <span class="cm-chip is-danger"><AppIcon name="x" :size="11" />{{ betsLostCount }} perdu{{ betsLostCount > 1 ? 's' : '' }}</span>
          <span v-if="betsPendingCount" class="cm-chip is-warning"><AppIcon name="clock" :size="11" />{{ betsPendingCount }} en attente</span>
        </span>
      </div>
      <p class="cm-hero__subtitle">Résultats de tes paris (Mes paris), jour par jour.</p>

      <p v-if="betsPerformanceSummary" class="perf-summary">{{ betsPerformanceSummary }}</p>
      <p v-else class="perf-summary is-muted">
        Aucun pari créé pour l'instant — place une sélection depuis <RouterLink to="/paris" class="cm-link">Mes paris</RouterLink>.
      </p>

      <div class="cm-kpis">
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">Profit net</span>
          <span class="cm-kpi__value" :class="betsStore.netProfit >= 0 ? 'cm-positive' : 'cm-negative'">{{ formatCurrency(betsStore.netProfit) }}</span>
          <span class="cm-kpi__detail">sur les paris réglés</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">ROI</span>
          <span class="cm-kpi__value" :class="(betsStore.roiPercent ?? 0) >= 0 ? 'cm-positive' : 'cm-negative'">{{ formatPercent(betsStore.roiPercent, { showSign: true }) }}</span>
          <span class="cm-kpi__detail">profit net / misé</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Taux de réussite</span>
          <span class="cm-kpi__value">{{ betsHitRatePercent === null ? '—' : `${betsHitRatePercent.toFixed(0)}%` }}</span>
          <span class="cm-bar perf-kpi__bar"><span class="cm-bar__fill" :style="{ width: `${betsHitRatePercent ?? 0}%` }" /></span>
          <span class="cm-kpi__detail">{{ betsWonCount }} gagné{{ betsWonCount > 1 ? 's' : '' }} sur {{ betsSettledCount }} réglé{{ betsSettledCount > 1 ? 's' : '' }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Misé</span>
          <span class="cm-kpi__value">{{ formatCurrency(betsStore.totalStaked) }}</span>
          <span class="cm-kpi__detail">paris réglés seulement</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Retours</span>
          <span class="cm-kpi__value">{{ formatCurrency(betsStore.totalReturned) }}</span>
          <span class="cm-kpi__detail">mise × cote des paris gagnés</span>
        </div>
      </div>
    </section>

    <!-- 1 bis (étape 11). GAGNÉ FACE À L'ATTENDU : les garde-fous, les chiffres clés, les courbes, la zone normale des séries de pertes. -->
    <AppCard
      icon="activity"
      eyebrow="Suivi des paris"
      title="Gagné face à l'attendu"
      subtitle="Le gain réel du carnet et, sur les paris qui ont leur probabilité du moment, le gain attendu au moment du pari : l'écart entre les deux sépare la chance de la méthode."
    >
      <template #actions>
        <AppButton variant="secondary" size="sm" :loading="suivi.loading" @click="chargerSuivi">
          <template #icon><AppIcon name="refresh" :size="14" /></template>
          Recalculer
        </AppButton>
      </template>

      <div class="perf-suivi">
        <div v-if="suivi.error" class="cm-note is-danger">
          <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
          <div>
            <p class="cm-note__title">{{ s ? 'Recalcul impossible — dernier calcul affiché' : 'Suivi des paris indisponible' }}</p>
            <p class="cm-note__text">{{ suivi.error }} — les tableaux restent affichés, sans valeurs.</p>
          </div>
        </div>

        <!-- Les garde-fous : ce qu'ils signalent (plafond atteint, série hors de sa zone, pari au-delà de la mise maximale). -->
        <ul v-if="alertesDuSuivi.length" class="perf-alertes">
          <li v-for="a in alertesDuSuivi" :key="a.code" class="cm-note" :class="a.niveau === 'danger' ? 'is-danger' : 'is-warning'">
            <span class="cm-icon-box is-sm" :class="a.niveau === 'danger' ? 'is-danger' : 'is-warning'"><AppIcon name="shield" :size="14" /></span>
            <div>
              <p class="cm-note__title">Garde-fou</p>
              <p class="cm-note__text">{{ a.texte }} <RouterLink to="/reglages" class="cm-link">Réglages</RouterLink></p>
            </div>
          </li>
        </ul>

        <div class="cm-kpis">
          <div class="cm-kpi is-section" title="La somme des gains réels de tous les paris réglés : le profit net du carnet.">
            <span class="cm-kpi__label">Gagné · carnet</span>
            <span class="cm-kpi__value" :class="tonDe(s?.carnet?.gainReel)">{{ s ? eurosSignes(s.carnet.gainReel) : '—' }}</span>
            <span class="cm-kpi__detail">{{ s ? `${nombreDe(s.carnet.regles, 'pari réglé', 'paris réglés')} · ROI ${pourcentSigne(s.carnet.roi)}` : 'suivi non lu' }}</span>
          </div>
          <div class="cm-kpi" title="Mise × (probabilité du moteur × cote prise − 1), au moment du pari — seulement pour les paris réglés qui ont leur probabilité.">
            <span class="cm-kpi__label">Attendu</span>
            <span class="cm-kpi__value" :class="tonDe(attenduDuSuivi?.gainAttendu)">{{ attenduDuSuivi?.regles ? eurosSignes(attenduDuSuivi.gainAttendu) : 'non noté' }}</span>
            <span class="cm-kpi__detail">{{ attenduDuSuivi ? `sur ${nombreDe(attenduDuSuivi.regles, 'pari réglé', 'paris réglés')} avec leur probabilité` : 'suivi non lu' }}</span>
          </div>
          <div class="cm-kpi" title="Le gain réel de ces mêmes paris, et son écart au gain attendu.">
            <span class="cm-kpi__label">Gagné · mêmes paris</span>
            <span class="cm-kpi__value" :class="tonDe(attenduDuSuivi?.gainReel)">{{ attenduDuSuivi?.regles ? eurosSignes(attenduDuSuivi.gainReel) : '—' }}</span>
            <span class="cm-kpi__detail">{{ attenduDuSuivi?.regles ? `écart ${eurosSignes(attenduDuSuivi.ecart)}` : 'aucun pari réglé avec sa probabilité' }}</span>
          </div>
          <div class="cm-kpi" title="Les paris dont la probabilité du moteur au moment du pari est notée (« J'ai parié », étape 10). Les paris d'avant n'en ont pas ; un combiné attend l'étape 28.">
            <span class="cm-kpi__label">Avec leur probabilité</span>
            <span class="cm-kpi__value cm-numeric">{{ s ? `${attenduDuSuivi.parisAvecProbabilite} / ${s.carnet.paris}` : '—' }}</span>
            <span class="cm-kpi__detail">{{ s ? `${attenduDuSuivi.sansProbabilite.nonNote} non noté${attenduDuSuivi.sansProbabilite.nonNote > 1 ? 's' : ''} · ${attenduDuSuivi.sansProbabilite.combines} combiné${attenduDuSuivi.sansProbabilite.combines > 1 ? 's' : ''}` : 'suivi non lu' }}</span>
          </div>
          <div class="cm-kpi" title="Moyenne de la cote prise × probabilité juste de clôture − 1, sur les paris simples mesurés (le détail : carte « Valeur de clôture »).">
            <span class="cm-kpi__label">Valeur de clôture <HelpTip terme="valeur-de-cloture" /></span>
            <span class="cm-kpi__value" :class="tonDe(s?.cloture?.moyenne)">{{ s?.cloture?.parisSimplesMesures ? pourcentSigne(s.cloture.moyenne) : '—' }}</span>
            <span class="cm-kpi__detail">{{ s ? (s.cloture.disponible ? `${nombreDe(s.cloture.parisSimplesMesures, 'pari simple mesuré', 'paris simples mesurés')}${s.cloture.parisSimplesMesures ? ` · ${pourcent((s.cloture.positifs / s.cloture.parisSimplesMesures) * 100)} au-dessus de 0` : ''}` : 'indisponible') : 'suivi non lu' }}</span>
          </div>
        </div>

        <GainCurvesChart :courbe="s?.courbe ?? null" :attendu="attenduDuSuivi" />
        <LossStreakBand :series="s?.series ?? null" />
      </div>
    </AppCard>

    <!-- 1 ter. LA VALEUR DE CLÔTURE : tes paris ont-ils battu la cote de clôture ? (04/10/2026) -->
    <ClosingValuePanel scope="bets" />

    <!-- 1 quater (étape 11). LES RÉSULTATS par marché, championnat, bookmaker, tranche de cote et confiance. -->
    <AppCard
      icon="barChart"
      eyebrow="Suivi des paris"
      title="Résultats par marché, championnat, bookmaker, cote et confiance"
      subtitle="Chaque pari compte dans une ligne de chaque tableau : la somme d'une colonne de montants retombe sur le carnet. Au pied, le total (Σ, jamais une somme de pourcentages) et la moyenne par pari (⌀)."
    >
      <div class="perf-tables">
        <BetBreakdownTable v-for="t in tableauxDuSuivi" :key="t.cle" :tableau="t" />
      </div>
    </AppCard>

    <!-- 1 quinquies (étape 11). LE CARNET, pari par pari : gain réel, gain attendu, valeur de clôture, ce qu'il faut signaler. -->
    <AppCard
      icon="list"
      eyebrow="Suivi des paris"
      title="Le carnet, pari par pari"
      subtitle="Du plus récent au plus ancien : ce qui a été joué, chez qui, à quelle cote, son gain réel, son gain attendu au moment du pari et sa valeur de clôture."
    >
      <BetLedgerTable :paris="s?.paris ?? []" />
    </AppCard>

    <!-- 2. JOUR PAR JOUR -->
    <AppCard
      icon="calendar"
      title="Jour par jour"
      subtitle="Chaque pari compte pour le jour où il a été placé ; misé, retours et profit ne comptent que les paris déjà réglés."
    >
      <div class="perf-daily">
        <div v-if="profitParJour.length" class="perf-chart">
          <div class="perf-chart__head">
            <span class="cm-eyebrow">Profit net par jour</span>
            <span class="perf-chart__range cm-text-muted cm-numeric">
              {{ formatDay(profitParJour[0].day) }} → {{ formatDay(profitParJour[profitParJour.length - 1].day) }}
            </span>
          </div>
          <div class="perf-chart__plot">
            <span
              v-for="d in profitParJour"
              :key="d.day"
              class="perf-chart__col"
              :title="`${formatDay(d.day)} : ${formatCurrency(d.netProfit)}`"
            >
              <i
                class="perf-chart__bar"
                :class="d.netProfit > 0 ? 'is-positive' : d.netProfit < 0 ? 'is-negative' : 'is-flat'"
                :style="{ height: `${d.hauteur / 2}%` }"
              />
            </span>
          </div>
        </div>

        <div class="cm-table-wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Paris</th>
                <th>Gagnés</th>
                <th>Perdus</th>
                <th>En attente</th>
                <th>Misé</th>
                <th>Retours</th>
                <th>Profit net</th>
                <th>ROI</th>
                <th>Taux de réussite</th>
                <th>Taux d'échec</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!betsDailySummaries.length">
                <td colspan="11" class="perf-table__empty is-center cm-text-muted">Aucune donnée pour l'instant.</td>
              </tr>
              <tr v-for="d in betsDailySummaries" :key="d.day">
                <td class="is-strong perf-table__label">{{ formatDay(d.day) }}</td>
                <td class="cm-numeric">{{ d.total }}</td>
                <td class="cm-numeric cm-positive">{{ d.won || '—' }}</td>
                <td class="cm-numeric cm-negative">{{ d.lost || '—' }}</td>
                <td class="cm-numeric cm-text-muted">{{ d.pending || '—' }}</td>
                <td class="cm-numeric">{{ formatCurrency(d.staked) }}</td>
                <td class="cm-numeric">{{ formatCurrency(d.returned) }}</td>
                <td class="cm-numeric is-strong" :class="d.netProfit >= 0 ? 'cm-positive' : 'cm-negative'">{{ formatCurrency(d.netProfit) }}</td>
                <td class="cm-numeric">
                  <span class="cm-pill perf-sign" :class="(d.roiPercent ?? 0) >= 0 ? 'is-positive' : 'is-negative'">
                    {{ d.roiPercent === null ? '—' : formatPercent(d.roiPercent, { showSign: true }) }}
                  </span>
                </td>
                <td class="cm-numeric">
                  <span class="perf-rate">
                    <span class="cm-bar perf-rate__bar"><span class="cm-bar__fill" :style="{ width: `${d.hitRate ?? 0}%` }" /></span>
                    <span class="cm-positive">{{ d.hitRate === null ? '—' : `${d.hitRate.toFixed(0)}%` }}</span>
                  </span>
                </td>
                <td class="cm-numeric cm-negative">{{ d.failRate === null ? '—' : `${d.failRate.toFixed(0)}%` }}</td>
              </tr>
              <tr v-if="betsDailySummaries.length" class="is-total">
                <td class="is-strong perf-table__label">Tous les jours</td>
                <td class="cm-numeric">{{ betsDailyTotal.total }}</td>
                <td class="cm-numeric cm-positive">{{ betsDailyTotal.won || '—' }}</td>
                <td class="cm-numeric cm-negative">{{ betsDailyTotal.lost || '—' }}</td>
                <td class="cm-numeric cm-text-muted">{{ betsDailyTotal.pending || '—' }}</td>
                <td class="cm-numeric">{{ formatCurrency(betsDailyTotal.staked) }}</td>
                <td class="cm-numeric">{{ formatCurrency(betsDailyTotal.returned) }}</td>
                <td class="cm-numeric is-strong" :class="betsDailyTotal.netProfit >= 0 ? 'cm-positive' : 'cm-negative'">{{ formatCurrency(betsDailyTotal.netProfit) }}</td>
                <td class="cm-numeric">
                  <span class="cm-pill perf-sign" :class="(betsDailyTotal.roiPercent ?? 0) >= 0 ? 'is-positive' : 'is-negative'">
                    {{ betsDailyTotal.roiPercent === null ? '—' : formatPercent(betsDailyTotal.roiPercent, { showSign: true }) }}
                  </span>
                </td>
                <td class="cm-numeric">
                  <span class="perf-rate">
                    <span class="cm-bar perf-rate__bar"><span class="cm-bar__fill" :style="{ width: `${betsDailyTotal.hitRate ?? 0}%` }" /></span>
                    <span class="cm-positive">{{ betsDailyTotal.hitRate === null ? '—' : `${betsDailyTotal.hitRate.toFixed(0)}%` }}</span>
                  </span>
                </td>
                <td class="cm-numeric cm-negative">{{ betsDailyTotal.failRate === null ? '—' : `${betsDailyTotal.failRate.toFixed(0)}%` }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppCard>

    <!-- 3. TENDANCES PAR MARCHÉ -->
    <AppCard
      icon="barChart"
      title="Taux de réussite par marché"
      subtitle="Chaque sélection compte pour son propre marché, y compris dans un combiné : une jambe gagnée reste gagnée pour son marché même si le ticket entier a perdu."
    >
      <div class="perf-markets">
        <div class="cm-note is-info">
          <span class="cm-icon-box is-info"><AppIcon name="info" :size="17" /></span>
          <div>
            <p class="cm-note__title">Yield : paris simples uniquement</p>
            <p class="cm-note__text">
              Yield calculé sur les paris simples uniquement — la mise d'un combiné est partagée entre plusieurs marchés à la fois, l'attribuer en entier à
              chacun fausserait le calcul.
            </p>
          </div>
        </div>

        <div class="cm-table-wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th>Marché</th>
                <th>Paris</th>
                <th>Gagnés</th>
                <th>Perdus</th>
                <th>En attente</th>
                <th>Taux de réussite</th>
                <th>Taux d'échec</th>
                <th>Yield <span class="perf-th__hint">(paris simples)</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!betsMarketBreakdown.length">
                <td colspan="8" class="perf-table__empty is-center cm-text-muted">Aucune donnée pour l'instant.</td>
              </tr>
              <tr v-for="m in betsMarketBreakdown" :key="m.market">
                <td class="is-strong perf-table__label">{{ m.market }}</td>
                <td class="cm-numeric">{{ m.total }}</td>
                <td class="cm-numeric cm-positive">{{ m.won || '—' }}</td>
                <td class="cm-numeric cm-negative">{{ m.lost || '—' }}</td>
                <td class="cm-numeric cm-text-muted">{{ m.pending || '—' }}</td>
                <td class="cm-numeric">
                  <span class="perf-rate">
                    <span class="cm-bar perf-rate__bar"><span class="cm-bar__fill" :style="{ width: `${m.hitRate ?? 0}%` }" /></span>
                    <span class="cm-positive">{{ m.hitRate === null ? '—' : `${m.hitRate.toFixed(0)}%` }}</span>
                  </span>
                </td>
                <td class="cm-numeric cm-negative">{{ m.failRate === null ? '—' : `${m.failRate.toFixed(0)}%` }}</td>
                <td class="cm-numeric">
                  <span class="cm-pill perf-sign" :class="(m.yieldPercent ?? 0) >= 0 ? 'is-positive' : 'is-negative'">
                    {{ m.yieldPercent === null ? '—' : formatPercent(m.yieldPercent, { showSign: true }) }}
                  </span>
                </td>
              </tr>
              <tr v-if="betsMarketBreakdown.length" class="is-total">
                <td class="is-strong perf-table__label">Tous marchés</td>
                <td class="cm-numeric">{{ betsMarketBreakdownTotal.total }}</td>
                <td class="cm-numeric cm-positive">{{ betsMarketBreakdownTotal.won || '—' }}</td>
                <td class="cm-numeric cm-negative">{{ betsMarketBreakdownTotal.lost || '—' }}</td>
                <td class="cm-numeric cm-text-muted">{{ betsMarketBreakdownTotal.pending || '—' }}</td>
                <td class="cm-numeric">
                  <span class="perf-rate">
                    <span class="cm-bar perf-rate__bar"><span class="cm-bar__fill" :style="{ width: `${betsMarketBreakdownTotal.hitRate ?? 0}%` }" /></span>
                    <span class="cm-positive">{{ betsMarketBreakdownTotal.hitRate === null ? '—' : `${betsMarketBreakdownTotal.hitRate.toFixed(0)}%` }}</span>
                  </span>
                </td>
                <td class="cm-numeric cm-negative">{{ betsMarketBreakdownTotal.failRate === null ? '—' : `${betsMarketBreakdownTotal.failRate.toFixed(0)}%` }}</td>
                <td class="cm-numeric">
                  <span class="cm-pill perf-sign" :class="(betsMarketBreakdownTotal.yieldPercent ?? 0) >= 0 ? 'is-positive' : 'is-negative'">
                    {{ betsMarketBreakdownTotal.yieldPercent === null ? '—' : formatPercent(betsMarketBreakdownTotal.yieldPercent, { showSign: true }) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppCard>
  </div>
</template>

<style scoped>
/* La page se règle sur SA largeur : pleine page ou panneau étroit. */
.perf {
  container: perf / inline-size;
}

/* ------------------------------------------------------------ bandeau */
.perf-summary {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.6;
  color: var(--cm-text-primary);
}

.perf-summary.is-muted {
  font-weight: 500;
  color: var(--cm-text-secondary);
}

/* La barre sous le taux de réussite, dans sa tuile. */
.perf-kpi__bar {
  margin: 4px 0 2px;
}

.perf-kpi__bar .cm-bar__fill {
  background: var(--cm-accent);
}

/* ------------------------------------------------------ jour par jour */
.perf-daily,
.perf-markets {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Le profit net par jour : une barre par jour autour d'une ligne de zéro. */
.perf-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.perf-chart__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.perf-chart__range {
  font-size: 11px;
  text-transform: capitalize;
}

.perf-chart__plot {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 3px;
  height: 88px;
}

/* La ligne de zéro. */
.perf-chart__plot::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: var(--cm-border);
}

.perf-chart__col {
  position: relative;
  flex: 1 1 0;
  min-width: 4px;
  max-width: 28px;
  cursor: default;
}

.perf-chart__col:hover .perf-chart__bar {
  filter: brightness(1.15);
}

.perf-chart__bar {
  position: absolute;
  left: 0;
  right: 0;
  min-height: 2px;
  border-radius: 3px;
  transition: height var(--cm-transition-slow);
}

.perf-chart__bar.is-positive {
  bottom: 50%;
  background: var(--cm-accent);
}

.perf-chart__bar.is-negative {
  top: 50%;
  background: var(--cm-danger);
}

/* Un jour sans pari réglé : un simple repère sur la ligne. */
.perf-chart__bar.is-flat {
  top: calc(50% - 1px);
  height: 2px;
  background: var(--cm-text-muted);
}

/* ------------------------------------------------------------ tableaux */
.perf-th__hint {
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.perf-table__label {
  text-transform: capitalize;
}

.perf-table__empty {
  padding: 22px 12px;
}

/* La ligne de synthèse : un filet plus marqué et un fond à peine teinté. */
.cm-table tr.is-total td {
  border-top: 1px solid var(--cm-border);
  background: rgba(var(--cm-section-rgb) / 0.05);
  font-weight: 700;
  color: var(--cm-text-primary);
}

/* Le taux de réussite : une barre fine, puis le chiffre. */
.perf-rate {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.perf-rate__bar {
  width: 60px;
}

.perf-rate .cm-bar__fill {
  background: var(--cm-accent);
}

/* ROI et yield en pastille, verte ou rouge selon le signe. */
.perf-sign {
  min-width: 64px;
  font-size: 12px;
}

.perf-sign.is-positive {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.perf-sign.is-negative {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

/* ------------------------------------------------- étape 11 : le suivi */
.perf-suivi,
.perf-tables {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.perf-tables {
  gap: 22px;
}

.perf-alertes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* ----------------------------------------------------------- étroit */
@container perf (max-width: 560px) {
  .perf-chart__plot {
    height: 64px;
  }
}
</style>
