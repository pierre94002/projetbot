<script setup>
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';

defineProps({
  connected: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  entry: { type: Object, default: null }, // { analysis, postMatchReview? } | null
  // false dans Historique moteur : le match est déjà joué, proposer de
  // lancer une analyse "avant-match" n'a plus de sens à ce stade.
  allowPreMatch: { type: Boolean, default: true },
  // false dans Historique moteur tant que le score n'est pas saisi : le
  // bouton "après-match" échouerait côté serveur (résultat requis), donc on
  // affiche un message d'attente à la place plutôt qu'un bouton voué à échouer.
  hasResult: { type: Boolean, default: true }
});

defineEmits(['run-pre-match', 'run-post-match']);

// Avis de l'IA sur chaque marché avant le match, puis bilan de chacun après.
const VERDICTS = { confirme: 'Confirme', nuance: 'Nuance', contredit: 'Contredit' };
const ISSUES = { juste: 'Juste', faux: 'Faux' };
const avisTenu = (r) => (r.aiWasRight === true ? 'IA juste' : r.aiWasRight === false ? 'IA fausse' : null);
</script>

<template>
  <div class="match-ai">
    <!-- Une analyse déjà faite reste lisible même si Claude Code n'est plus connecté : seul le lancement en dépend. -->
    <template v-if="!entry?.analysis">
      <p v-if="!connected" class="cm-text-muted match-ai__hint">
        Claude Code n'est pas configuré — il manque le jeton <code>CLAUDE_CODE_OAUTH_TOKEN</code> dans <code>server/.env</code> (obtenu une fois via <code>claude setup-token</code>). Inclus dans votre abonnement, sans coût supplémentaire.
      </p>
      <template v-else-if="allowPreMatch">
        <AppButton variant="primary" size="sm" :loading="running" @click="$emit('run-pre-match')">
          <template #icon><AppIcon name="bolt" :size="14" /></template>
          Lancer l'analyse IA
        </AppButton>
        <p class="cm-text-muted match-ai__hint">Commentaire qualitatif de Claude en complément du chiffrage du moteur — via Claude Code, inclus dans l'abonnement.</p>
      </template>
      <p v-else class="cm-text-muted match-ai__hint">
        Aucune analyse avant-match n'a été faite pour ce match — l'analyse après-match nécessite une analyse avant-match préalable.
      </p>
    </template>

    <template v-else>
      <div class="match-ai__block">
        <p class="match-ai__summary">{{ entry.analysis.summary }}</p>

        <div v-if="entry.analysis.keyFactors?.length" class="match-ai-factors">
          <div v-for="(factor, index) in entry.analysis.keyFactors" :key="index" class="match-ai-factor">
            <span class="match-ai-factor__badge">{{ factor.factor }}</span>
            <p class="match-ai-factor__observation">{{ factor.observation }}</p>
            <p class="cm-text-muted match-ai-factor__evidence">{{ factor.evidence }}</p>
          </div>
        </div>

        <div v-if="entry.analysis.marketViews?.length" class="match-ai-markets">
          <p class="match-ai__review-head">Marché par marché</p>
          <div v-for="(v, i) in entry.analysis.marketViews" :key="`${i}-${v.market}`" class="match-ai-market">
            <div class="match-ai-market__head">
              <span class="match-ai-market__name">{{ v.market }}</span>
              <span class="match-ai-market__pick">{{ v.pick }}</span>
              <span class="match-ai-market__badge" :class="`match-ai-market__badge--${v.verdict}`" :title="`Confiance ${v.confidence}`">
                {{ VERDICTS[v.verdict] ?? v.verdict }}
              </span>
            </div>
            <p class="match-ai-market__text">{{ v.reasoning }} <span class="cm-text-muted">(confiance {{ v.confidence }})</span></p>
          </div>
        </div>

        <p class="match-ai__alignment"><strong>Par rapport au moteur : </strong>{{ entry.analysis.alignmentWithModel }}</p>
        <p v-if="entry.analysis.caveats" class="cm-text-muted match-ai__caveats">{{ entry.analysis.caveats }}</p>
      </div>

      <div v-if="entry.postMatchReview" class="match-ai__block match-ai__block--review">
        <p class="match-ai__review-head">Après-match</p>
        <p class="match-ai__summary">{{ entry.postMatchReview.summary }}</p>
        <p class="match-ai__review-line"><strong>Bien anticipé : </strong>{{ entry.postMatchReview.whatWasRight }}</p>
        <p class="match-ai__review-line"><strong>Manqué : </strong>{{ entry.postMatchReview.whatWasMissed }}</p>

        <div v-if="entry.postMatchReview.marketReviews?.length" class="match-ai-markets">
          <p class="match-ai__review-head">Bilan par marché</p>
          <div v-for="(r, i) in entry.postMatchReview.marketReviews" :key="`${i}-${r.market}`" class="match-ai-market">
            <div class="match-ai-market__head">
              <span class="match-ai-market__name">{{ r.market }}</span>
              <span class="match-ai-market__pick">{{ r.pick }}</span>
              <span v-if="ISSUES[r.outcome]" class="match-ai-market__badge" :class="r.outcome === 'juste' ? 'match-ai-market__badge--confirme' : 'match-ai-market__badge--contredit'">
                {{ ISSUES[r.outcome] }}
              </span>
              <span v-if="avisTenu(r)" class="match-ai-market__badge match-ai-market__badge--ai" :class="{ 'is-wrong': r.aiWasRight === false }">{{ avisTenu(r) }}</span>
            </div>
            <p v-if="r.explanation" class="match-ai-market__text">{{ r.explanation }}</p>
            <p v-if="r.lesson" class="match-ai-market__text match-ai-market__lesson"><strong>Leçon : </strong>{{ r.lesson }}</p>
          </div>
        </div>

        <p class="match-ai__alignment"><strong>Résultat vs moteur : </strong>{{ entry.postMatchReview.outcomeVsEngine }}</p>
        <p v-if="entry.postMatchReview.caveats" class="cm-text-muted match-ai__caveats">{{ entry.postMatchReview.caveats }}</p>
      </div>

      <p v-else-if="!hasResult" class="cm-text-muted match-ai__hint">L'analyse après-match sera disponible une fois le résultat de ce match saisi.</p>

      <AppButton v-else-if="connected" variant="secondary" size="sm" :loading="running" @click="$emit('run-post-match')">
        <template #icon><AppIcon name="bolt" :size="14" /></template>
        Analyser l'après-match
      </AppButton>
    </template>
  </div>
</template>

<style scoped>
.match-ai {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.match-ai__hint {
  font-size: 11.5px;
}

.match-ai__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-ai__block--review {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
}

.match-ai__review-head {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--cm-text-muted);
}

.match-ai__review-line {
  font-size: 12.5px;
  line-height: 1.5;
}

.match-ai__summary {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.match-ai__alignment {
  font-size: 12.5px;
  line-height: 1.5;
}

.match-ai__caveats {
  font-size: 11px;
  font-style: italic;
}

.match-ai-factors {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-ai-factor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--cm-surface-hover);
  border-radius: var(--cm-radius-sm);
}

.match-ai-factor__badge {
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

.match-ai-factor__observation {
  font-size: 12.5px;
  line-height: 1.4;
}

.match-ai-factor__evidence {
  font-size: 11px;
  line-height: 1.4;
}

.match-ai-markets {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.match-ai-market {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--cm-surface-hover);
  border-radius: var(--cm-radius-sm);
}

.match-ai-market__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 12px;
}

.match-ai-market__name {
  color: var(--cm-text-secondary);
}

.match-ai-market__pick {
  font-weight: 600;
}

.match-ai-market__badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  background: var(--cm-surface);
  color: var(--cm-text-muted);
}

.match-ai-market__badge--confirme {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.match-ai-market__badge--nuance {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

.match-ai-market__badge--contredit,
.match-ai-market__badge--ai.is-wrong {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.match-ai-market__badge--ai {
  background: var(--cm-info-soft);
  color: var(--cm-info);
}

.match-ai-market__text {
  font-size: 12px;
  line-height: 1.45;
}

.match-ai-market__lesson {
  padding-left: 8px;
  border-left: 2px solid var(--cm-border-soft);
}
</style>
