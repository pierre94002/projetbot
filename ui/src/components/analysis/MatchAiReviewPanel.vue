<script setup>
import { computed } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import EmptyState from '@/components/common/EmptyState.vue';

/**
 * Onglet « Analyse IA » de la page de match : ce qui était prédit AVANT
 * (pronostic du moteur, avis de l'IA sur CHAQUE marché, commentaire général)
 * face à ce que le match a donné APRÈS (issue de chaque marché, avis de l'IA
 * validé ou à corriger, leçons), et l'expérience de l'IA par type de marché.
 */
const props = defineProps({
  match: { type: Object, required: true }, // { homeName, awayName, homeGoals, awayGoals }
  entry: { type: Object, default: null }, // analyse IA : { matchId, analysis, postMatchReview?, engineSnapshot, createdAt }
  predictions: { type: Array, default: () => [] }, // pronostics du moteur sur nos marchés
  experience: { type: Array, default: () => [] }, // bilan de l'IA par type de marché (cf. aiMarketExperience)
  connected: { type: Boolean, default: false },
  running: { type: Boolean, default: false }
});

defineEmits(['run-post-match']);

const engine = computed(() => props.entry?.engineSnapshot ?? null);
const review = computed(() => props.entry?.postMatchReview ?? null);

// Probabilités du moteur, tirées de ses cotes justes (1 / cote, ramenées à 100 %).
const outcomes = computed(() => {
  const e = engine.value;
  if (!e?.trueOdds) return [];
  const brut = [
    { key: 'home', label: `${props.match.homeName} gagne`, fair: e.trueOdds.home, book: e.market?.odds1 },
    { key: 'draw', label: 'Match nul', fair: e.trueOdds.draw, book: e.market?.oddsDraw },
    { key: 'away', label: `${props.match.awayName} gagne`, fair: e.trueOdds.away, book: e.market?.odds2 }
  ].filter((o) => Number(o.fair) > 1);
  const somme = brut.reduce((s, o) => s + 1 / o.fair, 0);
  return brut.map((o) => ({ ...o, prob: 1 / o.fair / somme }));
});

const favori = computed(() => outcomes.value.reduce((best, o) => (!best || o.prob > best.prob ? o : best), null));

const resultatReel = computed(() => {
  const { homeGoals: h, awayGoals: a } = props.match;
  if (h === null || h === undefined || a === null || a === undefined) return null;
  return h > a ? 'home' : h === a ? 'draw' : 'away';
});

const favoriJuste = computed(() => (favori.value && resultatReel.value ? favori.value.key === resultatReel.value : null));

const ORDRE_MARCHES = ['Résultat', 'Total buts', 'Les 2 équipes marquent', 'Résultat + Total buts'];
const rang = (marche) => (ORDRE_MARCHES.includes(marche) ? ORDRE_MARCHES.indexOf(marche) : ORDRE_MARCHES.length);

/**
 * Une ligne par marché : le pronostic que l'IA a vu (figé avec son analyse,
 * sinon celui du journal des pronostics), son avis d'avant-match, et le
 * bilan d'après-match (issue, avis tenu ou non, explication, leçon).
 */
const lignes = computed(() => {
  const vues = new Map((props.entry?.analysis?.marketViews ?? []).map((v) => [v.market, v]));
  const revues = new Map((review.value?.marketReviews ?? []).map((r) => [r.market, r]));
  const journal = new Map(props.predictions.map((p) => [p.market, p]));
  const figes = props.entry?.engineSnapshot?.marketPredictions ?? [];
  const base = figes.length
    ? figes.map((f) => ({ market: f.market, pick: f.predictedLabel, odds: f.predictedOdds }))
    : props.predictions.map((p) => ({ market: p.market, pick: p.predictedLabel, odds: p.predictedOdds }));
  return base
    .map((b) => {
      const p = journal.get(b.market);
      const r = revues.get(b.market) ?? null;
      const status = r ? (r.outcome === 'juste' ? 'correct' : r.outcome === 'faux' ? 'incorrect' : 'pending') : (p?.status ?? 'pending');
      return { ...b, action: p?.action ?? null, status, vue: vues.get(b.market) ?? null, revue: r };
    })
    .sort((a, b) => rang(a.market) - rang(b.market) || String(a.market).localeCompare(String(b.market)));
});

const bilanMarches = computed(() => {
  const bilan = { correct: 0, incorrect: 0, pending: 0 };
  for (const l of lignes.value) bilan[l.status === 'correct' || l.status === 'incorrect' ? l.status : 'pending']++;
  return bilan;
});

// Leçons par marché : validées là où l'avis de l'IA a tenu, à corriger là où
// il s'est trompé ; sans avis d'avant-match, d'après l'issue du pronostic.
const leconsValidees = computed(() => lignes.value.filter((l) => l.revue?.lesson && (l.revue.aiWasRight === true || (l.revue.aiWasRight == null && l.status === 'correct'))));
const leconsACorriger = computed(() => lignes.value.filter((l) => l.revue?.lesson && (l.revue.aiWasRight === false || (l.revue.aiWasRight == null && l.status === 'incorrect'))));

// Les cinq types de marché, toujours affichés : « — » tant qu'aucun match du
// type n'a été réglé sous la règle actuelle (cote minimale, cf. markets.js).
const TYPES_DE_MARCHE = [
  ['result', 'Résultat'],
  ['totalGoals', 'Total buts'],
  ['bothTeamsScore', 'Les 2 équipes marquent'],
  ['resultAndTotal', 'Résultat + Total buts'],
  ['teamGoals', "Buts d'une équipe"]
];
const experienceComplete = computed(() =>
  TYPES_DE_MARCHE.map(
    ([marketType, label]) =>
      props.experience.find((t) => t.marketType === marketType) ?? { marketType, label, matches: 0, engineRight: 0, aiVerdicts: 0, aiRight: 0, byConfidence: {} }
  )
);

const VERDICTS = { confirme: 'Confirme', nuance: 'Nuance', contredit: 'Contredit' };
const avisTenu = (r) => (r?.aiWasRight === true ? 'IA juste' : r?.aiWasRight === false ? 'IA fausse' : null);
const ratio = (n, d) => (d ? `${n}/${d} (${Math.round((100 * n) / d)} %)` : '—');
// Au survol : les avis tenus selon la confiance que l'IA avait annoncée.
const parConfiance = (t) =>
  ['forte', 'moyenne', 'faible']
    .filter((c) => t.byConfidence?.[c]?.verdicts)
    .map((c) => `Confiance ${c} : ${t.byConfidence[c].right}/${t.byConfidence[c].verdicts}`)
    .join(' · ') || null;

const statut = (s) => (s === 'correct' ? 'Juste' : s === 'incorrect' ? 'Faux' : 'En attente');
const pct = (x) => `${Math.round(x * 100)} %`;
// 1,00 ou moins : pas de vraie cote relevée pour ce marché (buts par équipe).
const cote = (x) => (Number.isFinite(Number(x)) && Number(x) > 1 ? Number(x).toFixed(2) : '—');
const nombre = (x, d = 2) => (Number.isFinite(Number(x)) ? Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '');

const decision = computed(() => {
  const s = engine.value?.staking;
  if (!s) return null;
  return s.action === 'RECOMMENDED' ? `mise recommandée${s.stake ? ` : ${s.stake}` : ''}` : 'pas de mise';
});
</script>

<template>
  <EmptyState
    v-if="!entry && !predictions.length"
    icon="bolt"
    title="Aucune analyse IA pour ce match"
    description="L'IA analyse les matchs dans les 48 heures qui précèdent le coup d'envoi ; celui-ci n'a pas été analysé avant d'être joué."
  />

  <div v-else class="ai-review">
    <!-- AVANT LE MATCH -->
    <section class="ai-review__col">
      <h3 class="ai-review__col-title">Avant le match</h3>

      <div v-if="outcomes.length" class="ai-review__card">
        <p class="ai-review__card-title">Pronostic du match (moteur)</p>
        <div class="ai-review__outcomes">
          <div v-for="o in outcomes" :key="o.key" class="ai-review__outcome" :class="{ 'is-favori': o.key === favori?.key }">
            <span class="ai-review__outcome-label">{{ o.label }}</span>
            <span class="ai-review__outcome-prob cm-numeric">{{ pct(o.prob) }}</span>
            <span class="ai-review__outcome-odds cm-text-muted">cote juste {{ cote(o.fair) }} · bookmaker {{ cote(o.book) }}</span>
          </div>
        </div>
        <p v-if="engine?.expectedGoals" class="ai-review__line">
          Buts attendus : {{ match.homeName }} {{ nombre(engine.expectedGoals.home) }} - {{ nombre(engine.expectedGoals.away) }} {{ match.awayName }}
        </p>
        <p v-if="engine?.edgePercent !== null && engine?.edgePercent !== undefined" class="ai-review__line cm-text-muted">
          Écart avec le marché : {{ nombre(engine.edgePercent, 1) }} %<template v-if="decision"> · {{ decision }}</template>
        </p>
      </div>

      <div v-if="lignes.length" class="ai-review__card">
        <p class="ai-review__card-title">Nos marchés, un par un</p>
        <p class="ai-review__hint cm-text-muted">Pronostic du moteur, avis de l'IA avant le match, puis issue. Cliquez un marché pour le détail.</p>
        <ul class="ai-review__markets">
          <li v-for="l in lignes" :key="l.market" class="ai-review__market-item">
            <details :class="{ 'is-static': !l.vue && !l.revue }">
              <summary class="ai-review__market-row">
                <span class="ai-review__market">{{ l.market }}</span>
                <span class="ai-review__pick">
                  {{ l.pick }}
                  <span v-if="l.action === 'RECOMMENDED'" class="ai-review__advised" title="Mise recommandée par le moteur">conseillé</span>
                </span>
                <span class="cm-numeric cm-text-muted">{{ cote(l.odds) }}</span>
                <span class="ai-review__verdict" :class="l.vue ? `ai-review__verdict--${l.vue.verdict}` : ''" :title="l.vue ? `Confiance ${l.vue.confidence}` : 'Pas d\'avis de l\'IA sur ce marché'">
                  {{ l.vue ? VERDICTS[l.vue.verdict] ?? l.vue.verdict : '—' }}
                </span>
                <span class="ai-review__status" :class="`ai-review__status--${l.status === 'correct' || l.status === 'incorrect' ? l.status : 'pending'}`">
                  <AppIcon v-if="l.status === 'correct'" name="check" :size="11" />
                  <AppIcon v-else-if="l.status === 'incorrect'" name="x" :size="11" />
                  {{ statut(l.status) }}
                </span>
              </summary>
              <div v-if="l.vue || l.revue" class="ai-review__market-detail">
                <p v-if="l.vue" class="ai-review__text">
                  <strong>Avant le match ({{ (VERDICTS[l.vue.verdict] ?? l.vue.verdict).toLowerCase() }}, confiance {{ l.vue.confidence }}) : </strong>{{ l.vue.reasoning }}
                </p>
                <p v-if="l.revue?.explanation" class="ai-review__text"><strong>Ce qui s'est passé : </strong>{{ l.revue.explanation }}</p>
                <p v-if="l.revue?.lesson" class="ai-review__text" :class="l.revue.aiWasRight === false ? 'ai-review__ko-text' : l.revue.aiWasRight === true ? 'ai-review__ok-text' : ''">
                  <strong>{{ avisTenu(l.revue) ? `${avisTenu(l.revue)} — leçon` : 'Leçon' }} : </strong>{{ l.revue.lesson }}
                </p>
              </div>
            </details>
          </li>
        </ul>
      </div>

      <div v-if="entry?.analysis" class="ai-review__card">
        <p class="ai-review__card-title">
          Analyse de l'IA <span v-if="entry.createdAt" class="cm-text-muted ai-review__date">du {{ jour(entry.createdAt) }}</span>
        </p>
        <p class="ai-review__summary">{{ entry.analysis.summary }}</p>
        <div v-if="entry.analysis.keyFactors?.length" class="ai-review__factors">
          <div v-for="(f, i) in entry.analysis.keyFactors" :key="i" class="ai-review__factor">
            <span class="ai-review__factor-badge">{{ f.factor }}</span>
            <p class="ai-review__text">{{ f.observation }}</p>
            <p class="ai-review__text cm-text-muted">{{ f.evidence }}</p>
          </div>
        </div>
        <p class="ai-review__text"><strong>Par rapport au moteur : </strong>{{ entry.analysis.alignmentWithModel }}</p>
        <p v-if="entry.analysis.caveats" class="ai-review__caveats cm-text-muted">{{ entry.analysis.caveats }}</p>
      </div>
    </section>

    <!-- APRÈS LE MATCH -->
    <section class="ai-review__col">
      <h3 class="ai-review__col-title">Après le match</h3>

      <div class="ai-review__card">
        <p class="ai-review__card-title">Bilan</p>
        <p class="ai-review__final">
          {{ match.homeName }} <span class="cm-numeric">{{ match.homeGoals }} - {{ match.awayGoals }}</span> {{ match.awayName }}
        </p>
        <p v-if="favori && favoriJuste !== null" class="ai-review__line">
          Favori du moteur : {{ favori.label }} ({{ pct(favori.prob) }}) —
          <span :class="favoriJuste ? 'ai-review__ok' : 'ai-review__ko'">{{ favoriJuste ? 'juste' : 'faux' }}</span>
        </p>
        <p v-if="lignes.length" class="ai-review__line">
          Nos marchés : <span class="ai-review__ok">{{ bilanMarches.correct }} juste(s)</span>,
          <span class="ai-review__ko">{{ bilanMarches.incorrect }} faux</span><template v-if="bilanMarches.pending">, {{ bilanMarches.pending }} en attente</template>
        </p>
      </div>

      <template v-if="review">
        <div class="ai-review__card ai-review__card--right">
          <p class="ai-review__card-title"><AppIcon name="check" :size="13" />Validé : ce que l'IA avait vu juste</p>
          <p class="ai-review__text">{{ review.whatWasRight }}</p>
          <ul v-if="leconsValidees.length" class="ai-review__lessons">
            <li v-for="l in leconsValidees" :key="l.market"><strong>{{ l.market }} ({{ l.pick }}) : </strong>{{ l.revue.lesson }}</li>
          </ul>
        </div>
        <div class="ai-review__card ai-review__card--wrong">
          <p class="ai-review__card-title"><AppIcon name="x" :size="13" />À corriger : ce que l'IA a manqué</p>
          <p class="ai-review__text">{{ review.whatWasMissed }}</p>
          <ul v-if="leconsACorriger.length" class="ai-review__lessons">
            <li v-for="l in leconsACorriger" :key="l.market"><strong>{{ l.market }} ({{ l.pick }}) : </strong>{{ l.revue.lesson }}</li>
          </ul>
        </div>
        <div class="ai-review__card">
          <p class="ai-review__card-title">
            Synthèse <span v-if="review.createdAt" class="cm-text-muted ai-review__date">du {{ jour(review.createdAt) }}</span>
          </p>
          <p class="ai-review__summary">{{ review.summary }}</p>
          <p class="ai-review__text"><strong>Le résultat face au moteur : </strong>{{ review.outcomeVsEngine }}</p>
          <p v-if="review.caveats" class="ai-review__caveats cm-text-muted">{{ review.caveats }}</p>
        </div>
      </template>

      <div v-else-if="entry?.analysis" class="ai-review__card">
        <p class="ai-review__text">L'analyse après-match n'a pas encore été faite.</p>
        <AppButton v-if="connected" variant="primary" size="sm" :loading="running" @click="$emit('run-post-match')">
          <template #icon><AppIcon name="bolt" :size="14" /></template>
          Lancer l'analyse après-match
        </AppButton>
        <p v-else class="cm-text-muted ai-review__caveats">Claude Code n'est pas configuré sur ce poste : l'analyse après-match ne peut pas être lancée.</p>
      </div>

      <p v-else class="cm-text-muted ai-review__text">Pas d'analyse IA avant ce match : rien à confronter au résultat.</p>

      <div class="ai-review__card">
        <p class="ai-review__card-title">Expérience de l'IA, par marché (tous les matchs)</p>
        <p class="ai-review__hint cm-text-muted">
          Pronostics à la cote minimale de 1,20 (depuis le 30/09) : se remplit à chaque analyse après-match, et redonnée à l'IA avant chaque nouveau match. Sur
          peu de matchs, ce n'est pas encore significatif.
        </p>
        <div class="ai-review__experience">
          <span class="ai-review__experience-head">Marché</span>
          <span class="ai-review__experience-head">Moteur juste</span>
          <span class="ai-review__experience-head">Avis IA tenus</span>
          <template v-for="t in experienceComplete" :key="t.marketType">
            <span>{{ t.label }}</span>
            <span class="cm-numeric">{{ ratio(t.engineRight, t.matches) }}</span>
            <span class="cm-numeric" :title="parConfiance(t)">{{ ratio(t.aiRight, t.aiVerdicts) }}</span>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ai-review {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}

.ai-review__col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.ai-review__col-title {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--cm-text-muted);
}

.ai-review__card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--cm-border-soft);
  border-radius: var(--cm-radius-md, 12px);
  background: var(--cm-surface);
}

.ai-review__card--right {
  border-color: var(--cm-accent-soft);
  background: var(--cm-accent-soft);
}

.ai-review__card--right .ai-review__card-title {
  color: var(--cm-accent);
}

.ai-review__card--wrong {
  border-color: var(--cm-danger-soft);
  background: var(--cm-danger-soft);
}

.ai-review__card--wrong .ai-review__card-title {
  color: var(--cm-danger);
}

.ai-review__card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.ai-review__date {
  font-weight: 500;
  font-size: 11px;
}

.ai-review__summary {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.ai-review__text,
.ai-review__line {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
}

.ai-review__caveats {
  margin: 0;
  font-size: 11px;
  font-style: italic;
}

.ai-review__outcomes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.ai-review__outcome {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-hover);
  min-width: 0;
}

.ai-review__outcome.is-favori {
  outline: 1px solid var(--cm-accent);
  background: var(--cm-accent-soft);
}

.ai-review__outcome-label {
  font-size: 11.5px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-review__outcome-prob {
  font-size: 18px;
  font-weight: 700;
}

.ai-review__outcome-odds {
  font-size: 10px;
}

.ai-review__markets {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.ai-review__hint {
  margin: -4px 0 0;
  font-size: 11px;
}

.ai-review__market-item {
  border-bottom: 1px solid var(--cm-border-soft);
}

.ai-review__market-item:last-child {
  border-bottom: 0;
}

.ai-review__market-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 40px 76px 84px;
  gap: 8px;
  align-items: center;
  padding: 7px 0;
  font-size: 12px;
  list-style: none;
  cursor: pointer;
}

.ai-review__market-row::-webkit-details-marker {
  display: none;
}

.is-static .ai-review__market-row {
  cursor: default;
}

details[open] > .ai-review__market-row {
  color: var(--cm-text-primary);
}

.ai-review__market-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-hover);
}

.ai-review__verdict {
  justify-self: start;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  color: var(--cm-text-muted);
}

.ai-review__verdict--confirme {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.ai-review__verdict--nuance {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.ai-review__verdict--contredit {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.ai-review__ok-text {
  padding-left: 8px;
  border-left: 2px solid var(--cm-accent);
}

.ai-review__ko-text {
  padding-left: 8px;
  border-left: 2px solid var(--cm-danger);
}

.ai-review__lessons {
  margin: 4px 0 0;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  line-height: 1.45;
}

.ai-review__experience {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 1fr 1fr;
  gap: 6px 10px;
  font-size: 12px;
}

.ai-review__experience-head {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
}

.ai-review__market {
  color: var(--cm-text-secondary);
}

.ai-review__pick {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  min-width: 0;
}

.ai-review__advised {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--cm-info-soft);
  color: var(--cm-info);
  font-size: 9.5px;
  font-weight: 700;
  white-space: nowrap;
}

.ai-review__status {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}

.ai-review__status--correct {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.ai-review__status--incorrect {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.ai-review__status--pending {
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
}

.ai-review__factors {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ai-review__factor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface-hover);
}

.ai-review__factor-badge {
  align-self: flex-start;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--cm-surface);
  color: var(--cm-text-secondary);
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.ai-review__final {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.ai-review__ok {
  color: var(--cm-accent);
  font-weight: 700;
}

.ai-review__ko {
  color: var(--cm-danger);
  font-weight: 700;
}

@media (max-width: 900px) {
  .ai-review {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .ai-review__outcomes {
    grid-template-columns: 1fr;
  }
  .ai-review__market-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
}
</style>
