<script setup>
/**
 * Actualisation automatique (server/src/jobs/matchStatsAutoRefresh.js) :
 * l'étape en cours, le bilan de la dernière passe étape par étape, les
 * passes précédentes, et les deux choses que l'appli ne fait pas seule —
 * relever les cotes à venir (payantes) et corriger un statut ancien.
 */
import { computed, ref } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { formatDateTime } from '@/utils/format.js';

const props = defineProps({
  overview: { type: Object, default: null },
  starting: { type: Boolean, default: false },
  resettling: { type: Boolean, default: false }
});

const emit = defineEmits(['run', 'resettle']);

const showHistory = ref(false);

const ICONES = { ok: 'check', warn: 'alert', error: 'x', skipped: 'info' };
// Statuts des journaux, tels que l'interface les affiche ailleurs.
const STATUTS = { won: 'gagné', lost: 'perdu', void: 'annulé', pending: 'en attente', correct: 'juste', incorrect: 'faux' };
const statut = (s) => STATUTS[s] ?? s;
const ISSUES = { ok: 'réussie', partial: 'faite, avec des points à regarder', error: 'en échec' };

const duree = (ms) => {
  const s = Math.round((ms ?? 0) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(s % 60).padStart(2, '0')} s`;
};

const running = computed(() => props.overview?.running ?? null);
const lastPass = computed(() => props.overview?.lastPass ?? null);

const etatCourant = computed(() => {
  const r = running.value;
  if (!r) return null;
  const etape = r.stepLabel ? `étape ${r.stepIndex}/${r.steps} : ${r.stepLabel}` : 'démarrage';
  const qui = r.byThisServer === false ? ' (lancée par un autre processus)' : '';
  return `En cours depuis ${r.startedAt ? formatDateTime(r.startedAt) : '…'}${qui} — ${etape}.`;
});

// Alertes DURABLES : gardées par le serveur jusqu'à ce qu'une passe ou une
// correction les lève, et non effacées par la passe suivante.
const contradictions = computed(() => props.overview?.alerts?.contradictions ?? null);
const audit = computed(() => props.overview?.alerts?.audit ?? null);
const autreProcessus = computed(() => props.overview?.lockedByOther ?? null);
/** Les lignes affichées, seules corrigées si l'utilisateur confirme. */
const clesAffichees = computed(() => (contradictions.value?.samples ?? []).map((c) => c.key).filter(Boolean));

const cotes = computed(() => {
  const c = props.overview?.upcomingOdds;
  if (!c) return null;
  const ageJours = (Date.now() - Date.parse(c.updatedAt)) / 86_400_000;
  return { ...c, ageJours, vieilles: ageJours >= 1 };
});

const ageCotes = computed(() => {
  const j = cotes.value?.ageJours ?? 0;
  if (j < 1) return "aujourd'hui";
  const n = Math.floor(j);
  return `il y a ${n} jour${n > 1 ? 's' : ''}`;
});
</script>

<template>
  <div class="refresh-panel">
    <template v-if="overview">
      <div class="refresh-panel__header">
        <div class="refresh-panel__state">
          <span class="refresh-panel__dot" :class="{ 'refresh-panel__dot--running': running, 'refresh-panel__dot--off': !overview.enabled }" />
          <div>
            <p v-if="etatCourant" class="refresh-panel__headline">{{ etatCourant }}</p>
            <p v-else-if="lastPass" class="refresh-panel__headline">
              Dernière passe le {{ formatDateTime(lastPass.finishedAt) }} : {{ ISSUES[lastPass.outcome] ?? lastPass.outcome }}, en {{ duree(lastPass.durationMs) }}.
            </p>
            <p v-else class="refresh-panel__headline">Aucune passe enregistrée pour l'instant.</p>
            <p class="cm-text-muted refresh-panel__sub">
              <template v-if="!overview.enabled">Actualisation automatique désactivée (MATCH_STATS_AUTO_REFRESH=false).</template>
              <template v-else-if="overview.nextRunAt && !running">Prochaine passe automatique le {{ formatDateTime(overview.nextRunAt) }}.</template>
            </p>
          </div>
        </div>
        <AppButton variant="ghost" size="sm" :loading="starting || Boolean(running)" @click="emit('run')">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          {{ running ? 'En cours…' : 'Actualiser maintenant' }}
        </AppButton>
      </div>

      <div v-if="autreProcessus && !running" class="refresh-panel__notice refresh-panel__notice--warn">
        <div>
          <strong>Un import lancé à part tient le verrou</strong> (processus {{ autreProcessus.pid }}, depuis le
          {{ autreProcessus.startedAt ? formatDateTime(autreProcessus.startedAt) : '…' }}). La passe automatique attendra qu'il ait fini.
        </div>
      </div>

      <ol v-if="lastPass && !running" class="refresh-panel__steps">
        <li v-for="step in lastPass.steps" :key="step.key" class="refresh-panel__step" :class="`refresh-panel__step--${step.status}`">
          <AppIcon :name="ICONES[step.status] ?? 'info'" :size="13" class="refresh-panel__step-icon" />
          <span class="refresh-panel__step-label">{{ step.label }}</span>
          <span class="refresh-panel__step-summary">{{ step.summary }}</span>
          <span v-if="step.status !== 'skipped'" class="cm-text-muted cm-numeric refresh-panel__step-time">{{ duree(step.durationMs) }}</span>
        </li>
      </ol>
      <ol v-else-if="running" class="refresh-panel__steps">
        <li
          v-for="(step, index) in overview.steps"
          :key="step.key"
          class="refresh-panel__step"
          :class="{
            'refresh-panel__step--done': index + 1 < running.stepIndex,
            'refresh-panel__step--current': index + 1 === running.stepIndex
          }"
        >
          <AppIcon :name="index + 1 < running.stepIndex ? 'check' : index + 1 === running.stepIndex ? 'refresh' : 'info'" :size="13" class="refresh-panel__step-icon" />
          <span class="refresh-panel__step-label">{{ step.label }}</span>
        </li>
      </ol>

      <div v-if="contradictions?.count && !running" class="refresh-panel__notice refresh-panel__notice--warn">
        <div>
          <strong>{{ contradictions.count }} statut(s) posé(s) à la main ou avant l'actualisation automatique contredisent le score final.</strong>
          Ils ne sont pas corrigés d'office : un statut posé à la main peut être juste (score de la source faux, pari payé autrement).
          « Corriger » ne touche qu'aux lignes ci-dessous<template v-if="contradictions.count > clesAffichees.length"> (les {{ clesAffichees.length }} premières)</template>.
          <ul class="refresh-panel__list">
            <li v-for="c in contradictions.samples" :key="`${c.kind}-${c.id ?? c.betId}-${c.legIndex ?? ''}`">
              {{ c.label }} — noté « {{ statut(c.status) }} », le score dit « {{ statut(c.expected) }} »
            </li>
          </ul>
        </div>
        <AppButton variant="ghost" size="sm" :loading="resettling" :disabled="!clesAffichees.length" @click="emit('resettle', clesAffichees)">
          <template #icon><AppIcon name="check" :size="13" /></template>
          Corriger d'après le score
        </AppButton>
      </div>

      <div v-if="audit?.anomalies && !running" class="refresh-panel__notice">
        <div>
          <strong>Contrôle des scores du {{ formatDateTime(audit.updatedAt) }} : {{ audit.anomalies }} anomalie(s)</strong> depuis le
          {{ audit.since }}. Rien n'est corrigé automatiquement : un score et les statistiques du même match ne s'accordent pas.
          <ul class="refresh-panel__list">
            <li v-for="(a, i) in audit.samples" :key="i">{{ a.label }} — {{ a.detail }}</li>
          </ul>
        </div>
      </div>

      <div v-if="cotes" class="refresh-panel__notice" :class="{ 'refresh-panel__notice--warn': cotes.vieilles }">
        <div>
          <strong>Cotes à venir (The Odds API) relevées {{ ageCotes }}</strong>
          ({{ formatDateTime(cotes.updatedAt) }}, {{ cotes.upcoming }} match(s) encore à venir sur {{ cotes.matches }}).
          Elles ne se relèvent pas seules : chaque relevé coûte jusqu'à 37 crédits du quota mensuel de 500. Bouton « Actualiser »
          de la ligne « Cotes marché (The Odds API) », dans le cadre Données.
        </div>
      </div>

      <button v-if="overview.history?.length" type="button" class="refresh-panel__toggle" @click="showHistory = !showHistory">
        <AppIcon name="chevronRight" :size="12" class="refresh-panel__chevron" :class="{ 'refresh-panel__chevron--open': showHistory }" />
        Passes précédentes ({{ overview.history.length }})
      </button>
      <ul v-if="showHistory" class="refresh-panel__history">
        <li v-for="p in overview.history" :key="p.id">
          <span class="cm-numeric">{{ formatDateTime(p.finishedAt) }}</span>
          <span class="refresh-panel__outcome" :class="`refresh-panel__outcome--${p.outcome}`">{{ ISSUES[p.outcome] ?? p.outcome }}</span>
          <span class="cm-text-muted">{{ p.reason }} · {{ duree(p.durationMs) }}</span>
          <span class="cm-text-muted refresh-panel__history-issues">
            {{ p.steps.filter((s) => s.status === 'warn' || s.status === 'error').map((s) => s.label).join(', ') }}
          </span>
        </li>
      </ul>

      <p class="cm-text-muted refresh-panel__hint">
        Tourne tant que l'appli est ouverte, sans Claude et sans quota payant (FotMob, football-data.co.uk) : une passe une minute après le
        démarrage, qui rattrape tout ce qui s'est joué depuis la dernière passe réussie (jusqu'à 60 jours), puis toutes les
        {{ Math.round((overview.intervalMinutes ?? 180) / 60) }} heures. Le contrôle des scores et la relance des feuilles tardives passent
        une fois par jour, les cotes passées toutes les douze heures, la sauvegarde de la base une fois par semaine (deux copies
        automatiques gardées dans CoteMaster\sauvegardes).
      </p>
    </template>

    <p v-else class="cm-text-muted">État de l'actualisation indisponible.</p>
  </div>
</template>

<style scoped>
.refresh-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.refresh-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.refresh-panel__state {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.refresh-panel__dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--cm-accent);
  box-shadow: 0 0 0 3px var(--cm-accent-soft);
}

.refresh-panel__dot--running {
  background: var(--cm-warning);
  box-shadow: 0 0 0 3px var(--cm-warning-soft);
  animation: refresh-pulse 1.4s ease-in-out infinite;
}

.refresh-panel__dot--off {
  background: var(--cm-text-muted);
  box-shadow: none;
}

@keyframes refresh-pulse {
  50% {
    opacity: 0.35;
  }
}

.refresh-panel__headline {
  margin: 0;
  font-size: 13px;
}

.refresh-panel__sub {
  margin: 2px 0 0;
  font-size: 11.5px;
}

.refresh-panel__steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 10px 0 0;
  list-style: none;
  border-top: 1px solid var(--cm-border-soft);
}

.refresh-panel__step {
  display: grid;
  grid-template-columns: 16px minmax(150px, 0.9fr) minmax(0, 2.4fr) auto;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
}

.refresh-panel__step-icon {
  align-self: center;
  color: var(--cm-text-muted);
}

.refresh-panel__step--ok .refresh-panel__step-icon,
.refresh-panel__step--done .refresh-panel__step-icon {
  color: var(--cm-accent);
}

.refresh-panel__step--warn .refresh-panel__step-icon,
.refresh-panel__step--current .refresh-panel__step-icon {
  color: var(--cm-warning);
}

.refresh-panel__step--error .refresh-panel__step-icon {
  color: var(--cm-danger);
}

.refresh-panel__step--skipped,
.refresh-panel__step--skipped .refresh-panel__step-summary {
  color: var(--cm-text-muted);
}

.refresh-panel__step--current .refresh-panel__step-label {
  font-weight: 600;
}

.refresh-panel__step-label {
  font-weight: 500;
}

.refresh-panel__step-summary {
  color: var(--cm-text-secondary);
  line-height: 1.45;
}

.refresh-panel__step-time {
  font-size: 11px;
  white-space: nowrap;
}

.refresh-panel__notice {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--cm-radius-sm);
  background: var(--cm-info-soft);
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.refresh-panel__notice--warn {
  background: var(--cm-warning-soft);
}

.refresh-panel__list {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 11.5px;
}

.refresh-panel__toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 12px;
  color: var(--cm-text-secondary);
  cursor: pointer;
}

.refresh-panel__chevron {
  transition: transform var(--cm-transition);
}

.refresh-panel__chevron--open {
  transform: rotate(90deg);
}

.refresh-panel__history {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
}

.refresh-panel__history li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.refresh-panel__outcome--ok {
  color: var(--cm-accent);
}

.refresh-panel__outcome--partial {
  color: var(--cm-warning);
}

.refresh-panel__outcome--error {
  color: var(--cm-danger);
}

.refresh-panel__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
}

@media (max-width: 720px) {
  .refresh-panel__header,
  .refresh-panel__notice {
    flex-direction: column;
  }

  .refresh-panel__step {
    grid-template-columns: 16px minmax(0, 1fr);
  }

  .refresh-panel__step-summary,
  .refresh-panel__step-time {
    grid-column: 2;
  }
}
</style>
