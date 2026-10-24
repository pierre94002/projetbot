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
 *
 * Étape 45 (24/10/2026) : la MÊME carte sert au bilan d'après-match d'un match joué (MatchAiReviewPanel) — l'issue du pronostic (le liseré de
 * gauche et le mot « Pronostic juste / faux »), l'avis de l'IA tenu ou démenti, ce qui s'est passé, la leçon —, avec la cote du pronostic et les
 * logos des clubs par leurs identifiants. Un marché sur lequel l'IA n'a donné aucun avis (`sansAvis`) le dit. Sans ces propriétés, la carte
 * est celle de l'onglet Analyse IA d'avant-match, mot pour mot.
 */
const props = defineProps({
  view: { type: Object, required: true }, // { market, pick, verdict, confidence, explanation?, reasoning }
  probability: { type: Number, default: null },
  prediction: { type: Object, default: null }, // pronostic du moteur figé avec l'analyse (camp visé)
  home: { type: String, default: null },
  away: { type: String, default: null },
  // Après le match (page d'un match joué) :
  homeId: { type: String, default: null },
  awayId: { type: String, default: null },
  revue: { type: Object, default: null }, // { explanation?, lesson?, aiWasRight? } : le bilan d'après-match de ce marché
  statut: { type: String, default: null }, // 'correct' | 'incorrect' | 'pending' : l'issue du pronostic ; null avant le match
  cote: { type: Number, default: null }, // la cote du pronostic ; 1 ou moins : pas de vraie cote ; null : non montrée
  conseille: { type: Boolean, default: false }, // la mise recommandée par le moteur
  sansAvis: { type: Boolean, default: false }, // l'IA n'a donné aucun avis sur ce marché
  // Le championnat des deux clubs (leur logo, quand l'identifiant manque, se retrouve par le nom) :
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

// L'issue du pronostic et l'avis de l'IA une fois le résultat connu : les mêmes mots que le bilan de l'onglet Analyse IA.
const ISSUES = { correct: { libelle: 'Pronostic juste', icone: 'check' }, incorrect: { libelle: 'Pronostic faux', icone: 'x' }, pending: { libelle: 'Pas encore réglé', icone: 'clock' } };
const issue = computed(() => ISSUES[props.statut] ?? null);
const avisTenu = computed(() => (props.revue?.aiWasRight === true ? 'Avis de l’IA tenu' : props.revue?.aiWasRight === false ? 'Avis de l’IA démenti' : null));
// La leçon : verte quand l'avis de l'IA a tenu, rouge quand il a été démenti, bleue (information) sans avis ou sans avis réglé.
const tonDeLaLecon = computed(() => (props.revue?.aiWasRight === true ? 'is-ok' : props.revue?.aiWasRight === false ? 'is-ko' : ''));
const coteDite = computed(() => (Number.isFinite(props.cote) && props.cote > 1 ? props.cote.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'pas de cote'));

// « 76 % : Arsenal marque… » → « Arsenal marque… » : l'anneau dit déjà 76 %.
const pourquoi = computed(() => {
  const texte = String(props.view.explanation ?? '').replace(/^\s*\d{1,3}\s*%\s*[:—–-]?\s*/, '').trim();
  return texte ? texte.charAt(0).toUpperCase() + texte.slice(1) : null;
});
</script>

<template>
  <article class="aimc" :class="`is-${view.verdict}`" :data-statut="statut" :data-sans-avis="sansAvis ? 'oui' : null">
    <header class="aimc__head">
      <ProbabilityRing :value="probability" :size="50" />
      <div class="aimc__what">
        <span class="aimc__market">{{ view.market }}</span>
        <span class="aimc__pick">
          <PickCrest :item="prediction ?? view.pick" :home="home" :away="away" :league="league" :home-id="homeId" :away-id="awayId" :size="18" />{{ view.pick }}
        </span>
        <span v-if="cote !== null || conseille" class="aimc__meta">
          <span v-if="cote !== null" class="cm-pill aimc__cote cm-numeric" :title="cote > 1 ? 'Cote du pronostic' : 'Pas de vraie cote relevée pour ce marché'">{{ coteDite }}</span>
          <span v-if="conseille" class="cm-chip is-info aimc__conseille" title="Mise recommandée par le moteur">conseillé</span>
        </span>
      </div>
      <div v-if="sansAvis" class="aimc__verdict" data-avis="aucun">
        <span class="aimc__badge aimc__badge--aucun" title="L’IA n’a donné aucun avis sur ce marché"><AppIcon name="minus" :size="12" />Pas d’avis de l’IA</span>
      </div>
      <div v-else class="aimc__verdict">
        <span class="aimc__badge"><AppIcon :name="verdict.icone" :size="12" />{{ verdict.libelle }}</span>
        <span class="aimc__confidence" :title="`Confiance de l'IA : ${view.confidence}`">
          <i v-for="n in 3" :key="n" :class="{ 'is-on': n <= niveau }" />
          {{ view.confidence }}
        </span>
      </div>
    </header>

    <div v-if="issue" class="aimc__issue" data-issue>
      <span class="aimc__statut" :class="`is-${statut}`"><AppIcon :name="issue.icone" :size="11" />{{ issue.libelle }}</span>
      <span v-if="avisTenu" class="aimc__tenu" :class="{ 'is-wrong': revue.aiWasRight === false }">{{ avisTenu }}</span>
    </div>

    <p v-if="pourquoi" class="aimc__why">{{ pourquoi }}</p>
    <blockquote v-if="view.reasoning" class="aimc__opinion">
      <span class="aimc__opinion-label">Avis de l'IA</span>
      {{ view.reasoning }}
    </blockquote>
    <p v-if="revue?.explanation" class="aimc__passe"><strong>Ce qui s’est passé : </strong>{{ revue.explanation }}</p>
    <blockquote v-if="revue?.lesson" class="aimc__opinion aimc__lecon" :class="tonDeLaLecon">
      <span class="aimc__opinion-label">{{ avisTenu ? `${avisTenu} — leçon` : 'Leçon' }}</span>
      {{ revue.lesson }}
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
  background: linear-gradient(180deg, rgb(var(--cm-glass-tint) / 0.025), transparent), var(--cm-surface-alt);
  transition: border-color var(--cm-transition), transform var(--cm-transition);
}

.aimc:hover {
  border-color: var(--cm-border);
}

/* Après le match : le liseré de gauche dit l'issue du pronostic — vert juste, rouge faux. */
.aimc[data-statut='correct'] {
  box-shadow: inset 3px 0 0 var(--cm-accent);
}

.aimc[data-statut='incorrect'] {
  box-shadow: inset 3px 0 0 var(--cm-danger);
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
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--ton);
}

.aimc__meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.aimc__cote {
  min-width: 0;
  padding: 2px 8px;
  font-size: 11.5px;
}

.aimc__conseille {
  padding: 1px 8px;
  font-size: 10px;
}

.aimc__badge--aucun {
  background: var(--cm-surface-hover);
  color: var(--cm-text-muted);
}

/* L'issue du pronostic et l'avis de l'IA tenu ou démenti (le dessin du bilan de l'onglet Analyse IA). */
.aimc__issue {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.aimc__statut,
.aimc__tenu {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.aimc__statut {
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
}

.aimc__statut.is-correct {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.aimc__statut.is-incorrect {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.aimc__tenu {
  background: var(--cm-info-soft);
  color: var(--cm-info);
}

.aimc__tenu.is-wrong {
  background: var(--cm-danger-soft);
  color: var(--cm-danger);
}

.aimc__passe {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-primary);
}

.aimc__passe strong {
  font-weight: 700;
  color: var(--cm-text-secondary);
}

/* La leçon : bleue (information) par défaut, verte quand l'avis de l'IA a tenu, rouge quand il a été démenti. */
.aimc__lecon {
  --ton: var(--cm-info);
  --ton-doux: var(--cm-info-soft);
}

.aimc__lecon.is-ok {
  --ton: var(--cm-accent);
  --ton-doux: var(--cm-accent-soft);
}

.aimc__lecon.is-ko {
  --ton: var(--cm-danger);
  --ton-doux: var(--cm-danger-soft);
}
</style>
