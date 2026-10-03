<script setup>
/**
 * Actualisation automatique (server/src/jobs/matchStatsAutoRefresh.js) :
 * l'étape en cours, le bilan de la dernière passe étape par étape, les
 * passes précédentes, et les deux choses que l'appli ne fait pas seule —
 * relever les cotes à venir (payantes) et corriger un statut ancien.
 *
 * Refonte visuelle du 01/10/2026 (guide ui/DESIGN.md) : l'état en puce
 * colorée et carré d'icône, la passe en cours avec sa barre, les étapes en
 * liste à icônes, les alertes en notes, l'historique en tableau. Aucune
 * donnée ni action n'a bougé.
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

// Présentation seulement : la teinte d'une étape ou d'une issue de passe.
const TONS_ETAPE = { ok: 'is-accent', warn: 'is-warning', error: 'is-danger', skipped: 'is-muted' };
const TONS_ISSUE = { ok: 'is-accent', partial: 'is-warning', error: 'is-danger' };

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

// Présentation seulement : la puce d'état en tête du panneau.
const etat = computed(() => {
  if (running.value) return { ton: 'is-warning', icone: 'refresh', libelle: 'Passe en cours', tourne: true };
  if (props.overview && !props.overview.enabled) return { ton: 'is-danger', icone: 'pause', libelle: 'Désactivée', tourne: false };
  const issue = lastPass.value?.outcome;
  if (!issue) return { ton: '', icone: 'clock', libelle: 'Aucune passe encore', tourne: false };
  return { ton: TONS_ISSUE[issue] ?? '', icone: issue === 'ok' ? 'check' : 'alert', libelle: `Dernière passe ${ISSUES[issue] ?? issue}`, tourne: false };
});

// Présentation seulement : l'avancement de la passe en cours (l'étape en
// cours compte pour moitié), pour la barre.
const progression = computed(() => {
  const r = running.value;
  if (!r?.steps) return 0;
  const faites = Math.max(0, (r.stepIndex ?? 0) - 0.5);
  return Math.max(0, Math.min(100, Math.round((faites / r.steps) * 100)));
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
      <!-- 1. L'état : la puce, la phrase, la prochaine passe, le bouton. -->
      <header class="refresh-panel__header">
        <div class="refresh-panel__state">
          <span class="cm-icon-box" :class="etat.ton">
            <AppIcon :name="etat.icone" :size="18" :class="{ 'refresh-panel__spin': etat.tourne }" />
          </span>
          <div class="refresh-panel__text">
            <span class="cm-chip" :class="etat.ton">{{ etat.libelle }}</span>
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
        <AppButton variant="secondary" size="sm" :loading="starting || Boolean(running)" @click="emit('run')">
          <template #icon><AppIcon name="refresh" :size="13" /></template>
          {{ running ? 'En cours…' : 'Actualiser maintenant' }}
        </AppButton>
      </header>

      <!-- 2. La passe en cours : sa barre d'avancement. -->
      <div v-if="running" class="refresh-panel__progress">
        <div class="refresh-panel__progress-top">
          <span v-if="running.steps" class="cm-eyebrow">Étape {{ running.stepIndex ?? 0 }} sur {{ running.steps }}</span>
          <span v-else class="cm-eyebrow">Démarrage</span>
          <span class="cm-numeric cm-text-muted refresh-panel__progress-pct">{{ progression }} %</span>
        </div>
        <div class="cm-bar refresh-panel__bar">
          <div class="cm-bar__fill" :style="{ width: progression + '%' }" />
        </div>
      </div>

      <div v-if="autreProcessus && !running" class="cm-note is-warning">
        <span class="cm-icon-box is-warning"><AppIcon name="lock" :size="17" /></span>
        <div>
          <p class="cm-note__title refresh-panel__note-title--warning">Verrou tenu par un autre processus</p>
          <p class="cm-note__text refresh-panel__note-text">
            <strong>Un import lancé à part tient le verrou</strong> (processus {{ autreProcessus.pid }}, depuis le
            {{ autreProcessus.startedAt ? formatDateTime(autreProcessus.startedAt) : '…' }}). La passe automatique attendra qu'il ait fini.
          </p>
        </div>
      </div>

      <!-- 3. Les étapes : celles de la dernière passe, ou celles de la passe en cours. -->
      <ol v-if="lastPass && !running" class="refresh-panel__steps cm-stagger">
        <li v-for="step in lastPass.steps" :key="step.key" class="step" :class="`is-${step.status}`">
          <span class="cm-icon-box is-sm" :class="TONS_ETAPE[step.status] ?? 'is-muted'">
            <AppIcon :name="ICONES[step.status] ?? 'info'" :size="13" />
          </span>
          <div class="step__body">
            <span class="step__label">{{ step.label }}</span>
            <span class="step__summary">{{ step.summary }}</span>
          </div>
          <span v-if="step.status !== 'skipped'" class="cm-text-muted cm-numeric step__time">{{ duree(step.durationMs) }}</span>
        </li>
      </ol>
      <ol v-else-if="running" class="refresh-panel__steps cm-stagger">
        <li
          v-for="(step, index) in overview.steps"
          :key="step.key"
          class="step"
          :class="{
            'is-done': index + 1 < running.stepIndex,
            'is-current': index + 1 === running.stepIndex
          }"
        >
          <span class="cm-icon-box is-sm" :class="index + 1 < running.stepIndex ? 'is-accent' : index + 1 === running.stepIndex ? 'is-warning' : 'is-muted'">
            <AppIcon
              :name="index + 1 < running.stepIndex ? 'check' : index + 1 === running.stepIndex ? 'refresh' : 'info'"
              :size="13"
              :class="{ 'refresh-panel__spin': index + 1 === running.stepIndex }"
            />
          </span>
          <div class="step__body">
            <span class="step__label">{{ step.label }}</span>
          </div>
        </li>
      </ol>

      <!-- 4. Les alertes durables : contradictions, anomalies, cotes à relever. -->
      <div v-if="contradictions?.count && !running" class="cm-note is-warning">
        <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="17" /></span>
        <div class="refresh-panel__alert">
          <p class="cm-note__title refresh-panel__note-title--warning">Statuts contredits par le score final</p>
          <p class="cm-note__text refresh-panel__note-text">
            <strong>{{ contradictions.count }} statut(s) posé(s) à la main ou avant l'actualisation automatique contredisent le score final.</strong>
            Ils ne sont pas corrigés d'office : un statut posé à la main peut être juste (score de la source faux, pari payé autrement).
            « Corriger » ne touche qu'aux lignes ci-dessous<template v-if="contradictions.count > clesAffichees.length"> (les {{ clesAffichees.length }} premières)</template>.
          </p>
          <ul class="refresh-panel__list">
            <li v-for="c in contradictions.samples" :key="`${c.kind}-${c.id ?? c.betId}-${c.legIndex ?? ''}`">
              {{ c.label }} — noté « {{ statut(c.status) }} », le score dit « {{ statut(c.expected) }} »
            </li>
          </ul>
          <div class="refresh-panel__alert-actions">
            <AppButton variant="secondary" size="sm" :loading="resettling" :disabled="!clesAffichees.length" @click="emit('resettle', clesAffichees)">
              <template #icon><AppIcon name="check" :size="13" /></template>
              Corriger d'après le score
            </AppButton>
          </div>
        </div>
      </div>

      <div v-if="audit?.anomalies && !running" class="cm-note is-info">
        <span class="cm-icon-box is-info"><AppIcon name="barChart" :size="17" /></span>
        <div class="refresh-panel__alert">
          <p class="cm-note__title refresh-panel__note-title--info">Contrôle des scores</p>
          <p class="cm-note__text refresh-panel__note-text">
            <strong>Contrôle des scores du {{ formatDateTime(audit.updatedAt) }} : {{ audit.anomalies }} anomalie(s)</strong> depuis le
            {{ audit.since }}. Rien n'est corrigé automatiquement : un score et les statistiques du même match ne s'accordent pas.
          </p>
          <ul class="refresh-panel__list">
            <li v-for="(a, i) in audit.samples" :key="i">{{ a.label }} — {{ a.detail }}</li>
          </ul>
        </div>
      </div>

      <div v-if="cotes" class="cm-note" :class="{ 'is-warning': cotes.vieilles }">
        <span class="cm-icon-box" :class="cotes.vieilles ? 'is-warning' : 'is-muted'"><AppIcon name="percent" :size="17" /></span>
        <div>
          <p class="cm-note__title" :class="{ 'refresh-panel__note-title--warning': cotes.vieilles }">Cotes à venir, à relever à la main</p>
          <p class="cm-note__text refresh-panel__note-text">
            <strong>Cotes à venir (The Odds API) relevées {{ ageCotes }}</strong>
            ({{ formatDateTime(cotes.updatedAt) }}, {{ cotes.upcoming }} match(s) encore à venir sur {{ cotes.matches }}).
            Elles ne se relèvent pas seules : chaque relevé coûte jusqu'à 37 crédits du quota mensuel de 500. Bouton « Actualiser »
            de la ligne « Cotes marché (The Odds API) », dans le cadre Données.
          </p>
        </div>
      </div>

      <!-- 5. Les passes précédentes, repliées, en tableau. -->
      <button v-if="overview.history?.length" type="button" class="cm-link refresh-panel__toggle" @click="showHistory = !showHistory">
        <AppIcon name="chevronRight" :size="12" class="refresh-panel__chevron" :class="{ 'is-open': showHistory }" />
        Passes précédentes ({{ overview.history.length }})
      </button>
      <div v-if="showHistory" class="cm-table-wrap">
        <table class="cm-table refresh-panel__history">
          <thead>
            <tr>
              <th>Fin de la passe</th>
              <th class="is-left">Issue</th>
              <th class="is-left">Raison</th>
              <th>Durée</th>
              <th class="is-left" title="Étapes terminées avec un avertissement ou une erreur">À regarder</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in overview.history" :key="p.id">
              <td class="cm-numeric is-strong">{{ formatDateTime(p.finishedAt) }}</td>
              <td class="is-left">
                <span class="cm-chip" :class="TONS_ISSUE[p.outcome] ?? ''">{{ ISSUES[p.outcome] ?? p.outcome }}</span>
              </td>
              <td class="is-left cm-text-secondary">{{ p.reason }}</td>
              <td class="cm-numeric cm-text-muted">{{ duree(p.durationMs) }}</td>
              <td class="is-left cm-text-muted refresh-panel__history-issues">
                {{ p.steps.filter((s) => s.status === 'warn' || s.status === 'error').map((s) => s.label).join(', ') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 6. Comment ça tourne. -->
      <div class="cm-note">
        <span class="cm-icon-box is-muted"><AppIcon name="clock" :size="16" /></span>
        <div>
          <p class="cm-note__title">Comment ça tourne</p>
          <p class="cm-note__text refresh-panel__hint">
            Tourne tant que l'appli est ouverte, sans Claude et sans quota payant (FotMob, football-data.co.uk) : une passe une minute après le
            démarrage, qui rattrape tout ce qui s'est joué depuis la dernière passe réussie (jusqu'à 60 jours), puis toutes les
            {{ Math.round((overview.intervalMinutes ?? 180) / 60) }} heures. Le contrôle des scores et la relance des feuilles tardives passent
            une fois par jour, les cotes passées toutes les douze heures, la sauvegarde de la base une fois par semaine (deux copies
            automatiques gardées dans CoteMaster\sauvegardes).
          </p>
        </div>
      </div>
    </template>

    <div v-else class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title refresh-panel__note-title--danger">Actualisation</p>
        <p class="cm-note__text refresh-panel__note-text">État de l'actualisation indisponible.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.refresh-panel {
  /* Se règle sur SA largeur : page entière comme panneau étroit. */
  container: refresh / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ------------------------------------------------------------------ état */
.refresh-panel__header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.refresh-panel__state {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.refresh-panel__text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
}

.refresh-panel__headline {
  margin: 0;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--cm-text-primary);
}

.refresh-panel__sub {
  margin: 0;
  font-size: 11.5px;
}

.refresh-panel__sub:empty {
  display: none;
}

/* L'icône tourne tant qu'une passe est en cours. */
.refresh-panel__spin {
  animation: refresh-spin 1.6s linear infinite;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

@container refresh (min-width: 640px) {
  .refresh-panel__header {
    flex-direction: row;
    justify-content: space-between;
  }
}

/* ------------------------------------------------------------ avancement */
.refresh-panel__progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-warning-rgb) / 0.28);
  background: radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-warning-rgb) / 0.09), transparent 55%), var(--cm-surface-alt);
}

.refresh-panel__progress-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.refresh-panel__progress-top .cm-eyebrow {
  color: var(--cm-warning);
}

.refresh-panel__progress-pct {
  font-size: 12px;
  font-weight: 700;
}

.refresh-panel__bar {
  height: 8px;
}

.refresh-panel__bar .cm-bar__fill {
  background: var(--cm-warning);
}

/* ---------------------------------------------------------------- étapes */
.refresh-panel__steps {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px 12px;
  padding: 8px 12px;
  border-radius: var(--cm-radius);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  font-size: 12.5px;
}

.step.is-current {
  border-color: rgba(var(--cm-warning-rgb) / 0.3);
}

.step.is-skipped .step__label,
.step.is-skipped .step__summary {
  color: var(--cm-text-muted);
}

.step__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.step__label {
  font-weight: 600;
  color: var(--cm-text-primary);
}

.step.is-current .step__label {
  color: var(--cm-warning);
}

.step__summary {
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.step__time {
  font-size: 11px;
  white-space: nowrap;
}

/* Assez de place : libellé et résumé côte à côte, la durée à droite. */
@container refresh (min-width: 760px) {
  .step__body {
    flex-direction: row;
    align-items: baseline;
    gap: 12px;
  }

  .step__label {
    flex: 0 0 220px;
  }

  .step__summary {
    flex: 1;
    min-width: 0;
  }
}

/* --------------------------------------------------------------- alertes */
.refresh-panel__alert {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.refresh-panel__note-title--warning {
  color: var(--cm-warning);
}

.refresh-panel__note-title--info {
  color: var(--cm-info);
}

.refresh-panel__note-title--danger {
  color: var(--cm-danger);
}

.refresh-panel__note-text {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.refresh-panel__note-text strong {
  color: var(--cm-text-primary);
}

.refresh-panel__list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.refresh-panel__alert-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 2px;
}

/* ------------------------------------------------------------- historique */
.refresh-panel__toggle {
  align-self: flex-start;
}

.refresh-panel__chevron {
  transition: transform var(--cm-transition);
}

.refresh-panel__chevron.is-open {
  transform: rotate(90deg);
}

.refresh-panel__history td {
  font-size: 12px;
}

/* La liste des étapes à regarder peut être longue : elle se replie sur plusieurs lignes. */
.refresh-panel__history-issues {
  white-space: normal;
  min-width: 180px;
  line-height: 1.45;
}

.refresh-panel__hint {
  font-size: 12px;
  color: var(--cm-text-secondary);
}
</style>
