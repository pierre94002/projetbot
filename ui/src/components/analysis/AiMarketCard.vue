<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import ProbabilityRing from './ProbabilityRing.vue';

/**
 * Un marché vu par l'IA avant le match (onglet Analyse IA, 01/10/2026 —
 * Pierre : « c'est la partie la plus importante de l'application, il faut
 * que ça soit vraiment joli ») : la probabilité du moteur en anneau, le
 * pronostic et le logo de l'équipe visée, le verdict de l'IA et sa
 * confiance, la phrase qui explique le pourcentage, puis son avis.
 */
const props = defineProps({
  view: { type: Object, required: true }, // { market, pick, verdict, confidence, explanation?, reasoning }
  probability: { type: Number, default: null },
  prediction: { type: Object, default: null }, // pronostic du moteur figé avec l'analyse (camp visé)
  home: { type: String, default: null },
  away: { type: String, default: null },
  league: { type: String, default: null }
});

const VERDICTS = {
  confirme: { libelle: 'Confirme', icone: 'check' },
  nuance: { libelle: 'Nuance', icone: 'minus' },
  contredit: { libelle: 'Contredit', icone: 'x' }
};
const NIVEAUX = { faible: 1, moyenne: 2, forte: 3 };

const verdict = computed(() => VERDICTS[props.view.verdict] ?? { libelle: props.view.verdict, icone: 'info' });
const niveau = computed(() => NIVEAUX[props.view.confidence] ?? 0);

// « 76 % : Arsenal marque… » → « Arsenal marque… » : l'anneau dit déjà 76 %.
const pourquoi = computed(() => {
  const texte = String(props.view.explanation ?? '').replace(/^\s*\d{1,3}\s*%\s*[:—–-]?\s*/, '').trim();
  return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : null;
});
</script>

<template>
  <article class="aimc" :class="`is-${view.verdict}`">
    <header class="aimc__head">
      <ProbabilityRing :value="probability" :size="50" />
      <div class="aimc__what">
        <span class="aimc__market">{{ view.market }}</span>
        <span class="aimc__pick">
          <PickCrest :item="prediction ?? view.pick" :home="home" :away="away" :league="league" :size="18" />{{ view.pick }}
        </span>
      </div>
      <div class="aimc__verdict">
        <span class="aimc__badge"><AppIcon :name="verdict.icone" :size="12" />{{ verdict.libelle }}</span>
        <span class="aimc__confidence" :title="`Confiance de l'IA : ${view.confidence}`">
          <i v-for="n in 3" :key="n" :class="{ 'is-on': n <= niveau }" />
          {{ view.confidence }}
        </span>
      </div>
    </header>

    <p v-if="pourquoi" class="aimc__why">{{ pourquoi }}</p>
    <blockquote v-if="view.reasoning" class="aimc__opinion">
      <span class="aimc__opinion-label">Avis de l'IA</span>
      {{ view.reasoning }}
    </blockquote>
  </article>
</template>

<style scoped>
.aimc {
  --ton: var(--cm-text-muted);
  --ton-doux: var(--cm-surface-hover);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--cm-border-soft);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.025), rgba(255, 255, 255, 0)), var(--cm-surface-alt);
  transition: border-color var(--cm-transition), transform var(--cm-transition);
}

.aimc:hover {
  border-color: var(--cm-border);
}

.aimc.is-confirme {
  --ton: var(--cm-accent);
  --ton-doux: var(--cm-accent-soft);
}

.aimc.is-nuance {
  --ton: var(--cm-warning);
  --ton-doux: var(--cm-warning-soft);
}

.aimc.is-contredit {
  --ton: var(--cm-danger);
  --ton-doux: var(--cm-danger-soft);
}

.aimc__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
}

.aimc__what {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.aimc__market {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.aimc__pick {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--cm-text-primary);
  line-height: 1.3;
}

.aimc__verdict {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.aimc__badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--ton-doux);
  color: var(--ton);
  font-size: 11.5px;
  font-weight: 700;
  white-space: nowrap;
}

.aimc__confidence {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.aimc__confidence i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cm-surface-hover);
}

.aimc__confidence i.is-on {
  background: var(--ton);
}

.aimc__confidence i:last-of-type {
  margin-right: 3px;
}

.aimc__why {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--cm-text-primary);
}

.aimc__opinion {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--ton);
  border-radius: 0 10px 10px 0;
  background: var(--ton-doux);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.aimc__opinion-label {
  display: block;
  margin-bottom: 2px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--ton);
}
</style>
