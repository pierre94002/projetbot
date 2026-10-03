<script setup>
/**
 * Pronostic du résultat par le moteur (cf. server/src/core/engine/
 * resultPrediction.js et valueFinder.js) : les probabilités 1N2, l'issue
 * la plus probable, la fiabilité que l'historique lui prête, et l'état des
 * paris value chez vos bookmakers — y compris quand il n'y en a pas.
 *
 * Dessin (refonte du 01/10/2026, au niveau de l'onglet Analyse IA) : une
 * carte à icône ; l'issue annoncée en grand avec son logo et sa probabilité
 * en anneau ; les trois issues en barres ; la fiabilité et la value en notes.
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import ProbabilityRing from './ProbabilityRing.vue';

const props = defineProps({
  result: { type: Object, required: true }
});

const prediction = computed(() => props.result.prediction ?? null);
const staking = computed(() => props.result.staking ?? null);
const home = computed(() => props.result.teamStats?.home?.name ?? props.result.label?.split(' vs ')[0] ?? 'Domicile');
const away = computed(() => props.result.teamStats?.away?.name ?? props.result.label?.split(' vs ')[1] ?? 'Extérieur');

const pct = (p, d = 0) => `${(p * 100).toFixed(d).replace('.', ',')} %`;
const cote = (o) => (o == null ? '–' : Number(o).toFixed(2));
const euros = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v ?? 0);

const barres = computed(() => {
  const p = prediction.value?.probabilities;
  if (!p) return [];
  return [
    { key: 'home', label: home.value, p: p.home },
    { key: 'draw', label: 'Nul', p: p.draw },
    { key: 'away', label: away.value, p: p.away }
  ];
});

const source = computed(() => {
  if (!prediction.value) return '';
  if (prediction.value.source !== 'cotes') return 'statistiques, faute de cote';
  const refs = prediction.value.referenceBooks;
  if (!refs?.length) return `d'après ${prediction.value.bookmakersCount ?? 'les'} bookmakers`;
  const liste = refs.length === 1 ? refs[0] : `${refs.slice(0, -1).join(', ')} et ${refs.at(-1)}`;
  return `d'après ${liste}`;
});

const fiabilite = computed(() => {
  const r = prediction.value?.reliability;
  if (!r) return null;
  return `Sur ${r.matches.toLocaleString('fr-FR')} matchs passés annoncés entre ${r.range[0]} et ${r.range[1]} %, l'issue annoncée s'est produite ${String(r.realized).replace('.', ',')} % du temps. Sur l'ensemble, ${String(r.overall).replace('.', ',')} % de résultats justes.`;
});

// La cote telle que le bookmaker l'affiche (une bourse montre la cote brute,
// le moteur calcule sur la cote nette de commission).
const affichee = (c) => c.displayedOdds ?? c.odds;
const offre = (c) => `« ${c.label} » à ${cote(affichee(c))} chez ${c.bookmakerTitle}`;

const value = computed(() => {
  const s = staking.value;
  if (!s) return null;
  if (s.action === 'RECOMMENDED') {
    return {
      ton: 'positif',
      camp: s.outcome ?? null,
      texte: `${s.label} à ${cote(affichee(s))} chez ${s.bookmakerTitle}. Cote juste ${cote(s.fairOdds)}, soit un avantage de ${pct(s.ev, 1)}. Mise conseillée : ${euros(s.stake)}.`
    };
  }
  if (s.action === 'CIRCUIT_BREAKER_ACTIVE') return { ton: 'alerte', texte: 'Coupe-circuit actif : aucun pari recommandé.' };
  const candidats = s.candidates ?? [];
  const meilleure = (liste) => (liste.length ? liste.reduce((m, x) => (x.ev > m.ev ? x : m)) : null);
  switch (s.reason) {
    case 'pas_de_value': {
      const o = meilleure(candidats);
      if (!o) return { ton: 'neutre', texte: 'Aucune value chez vos bookmakers.' };
      const ecart = o.ev < 0 ? `reste ${pct(-o.ev, 1)} sous` : `ne dépasse que de ${pct(o.ev, 1)}`;
      return { ton: 'neutre', camp: o.outcome ?? null, texte: `Aucune value chez vos bookmakers. Leur meilleure offre, ${offre(o)}, ${ecart} la cote juste de ${cote(o.fairOdds)}.` };
    }
    case 'value_hors_limites': {
      const o = meilleure(candidats.filter((c) => c.ev > (s.limits?.edgeThresholdMin ?? 0) && (c.exclusion === 'cote_trop_haute' || c.exclusion === 'avantage_invraisemblable')));
      const pourquoi = o?.exclusion === 'cote_trop_haute'
        ? `sa cote dépasse la cote maximale de ${cote(s.limits?.maxValueOdds)}`
        : `un avantage de ${pct(o?.ev ?? 0, 1)} est trop beau pour être vrai : cote périmée ou erreur probable`;
      return { ton: 'alerte', camp: o?.outcome ?? null, texte: `${o ? `${offre(o)} paie au-dessus de la cote juste de ${cote(o.fairOdds)}, mais` : 'Une offre paie au-dessus de la cote juste, mais'} ${pourquoi}. Aucun pari recommandé.` };
    }
    case 'no_market_odds': return { ton: 'neutre', texte: 'Pas de cote pour ce match : pronostic tiré des statistiques, aucun pari recommandé.' };
    case 'trop_peu_de_bookmakers': return { ton: 'neutre', texte: 'Aucun bookmaker de référence ne cote ce match : pas de cote juste sûre, aucun pari recommandé.' };
    case 'aucun_bookmaker_autorise': return { ton: 'neutre', texte: 'Aucun de vos bookmakers ne propose ce match.' };
    case 'bookmakers_juges': return { ton: 'neutre', texte: 'Vos bookmakers ont eux-mêmes fixé la cote juste de ce match : aucun pari possible contre eux.' };
    case 'cotes_incoherentes': return { ton: 'alerte', texte: 'Les cotes de vos bookmakers sont incohérentes pour ce match, sans doute périmées : aucun pari recommandé.' };
    default: return { ton: 'neutre', texte: 'Aucun pari recommandé.' };
  }
});

// ---- présentation ---------------------------------------------------------
// La probabilité de l'issue annoncée en entier, pour l'anneau.
const confianceEntiere = computed(() => (prediction.value ? Math.round(prediction.value.confidence * 100) : null));

// Le ton de la note « value » : positif = vert (sémantique, quelle que soit
// la section), alerte = ambre, neutre = information.
const NOTES = {
  positif: { classe: 'is-positif', boite: 'is-accent', titre: 'Pari value chez vos bookmakers' },
  alerte: { classe: 'is-warning', boite: 'is-warning', titre: 'Value à écarter' },
  neutre: { classe: 'is-info', boite: 'is-info', titre: 'Value chez vos bookmakers' }
};
const note = computed(() => NOTES[value.value?.ton] ?? NOTES.neutre);
</script>

<template>
  <AppCard v-if="prediction" title="Pronostic du résultat" icon="target" eyebrow="Le moteur" class="rpc">
    <template #actions>
      <span class="cm-chip rpc__source" title="Ce qui fonde le pronostic">{{ source }}</span>
    </template>

    <div class="rpc__body">
      <!-- L'issue annoncée, en grand : son logo, son nom, sa probabilité en anneau. -->
      <div class="rpc__hero">
        <ProbabilityRing :value="confianceEntiere" :size="68" :stroke="5" />
        <div class="rpc__what">
          <span class="rpc__label">Issue la plus probable</span>
          <span class="rpc__pick">
            <PickCrest :side="prediction.outcome ?? null" :item="prediction.label" :home="home" :away="away" :league="result.league ?? null" :size="26" />{{ prediction.label }}
          </span>
          <span class="rpc__confidence">
            <span class="cm-pill is-accent">{{ pct(prediction.confidence) }}</span>
            <span class="rpc__confidence-text">de chances selon le moteur</span>
          </span>
        </div>
      </div>

      <div v-if="prediction.doubleChance" class="cm-note is-warning">
        <span class="cm-icon-box is-warning is-sm"><AppIcon name="layers" :size="14" /></span>
        <div>
          <p class="cm-note__title">Résultat ouvert</p>
          <p class="cm-note__text rpc__double">
            En double chance, « <PickCrest :item="prediction.doubleChance.label" :home="home" :away="away" :league="result.league ?? null" :size="14" />{{ prediction.doubleChance.label }} » à
            <strong class="cm-numeric">{{ pct(prediction.doubleChance.probability) }}</strong>.
          </p>
        </div>
      </div>

      <!-- Les trois issues : l'annoncée en couleur, les autres en gris. -->
      <div class="rpc__bars">
        <div v-for="b in barres" :key="b.key" class="rpc__bar" :class="{ 'is-pick': b.key === prediction.outcome }">
          <span class="rpc__bar-label cm-truncate"><PickCrest :side="b.key" :home="home" :away="away" :league="result.league ?? null" :size="16" reserve />{{ b.label }}</span>
          <span class="cm-bar rpc__bar-track"><span class="cm-bar__fill rpc__bar-fill" :style="{ width: `${Math.round(b.p * 100)}%` }" /></span>
          <span class="rpc__bar-value cm-numeric">{{ pct(b.p) }}</span>
        </div>
      </div>

      <div v-if="fiabilite" class="cm-note rpc__reliability">
        <span class="cm-icon-box is-muted is-sm"><AppIcon name="history" :size="14" /></span>
        <div>
          <p class="cm-note__title">Fiabilité mesurée</p>
          <p class="cm-note__text rpc__reliability-text">{{ fiabilite }}</p>
        </div>
      </div>

      <div v-if="value" class="cm-note rpc__value" :class="note.classe">
        <span class="cm-icon-box is-sm" :class="note.boite">
          <AppIcon :name="value.ton === 'positif' ? 'check' : value.ton === 'alerte' ? 'alert' : 'info'" :size="14" />
        </span>
        <div>
          <p class="cm-note__title">{{ note.titre }}</p>
          <p class="cm-note__text rpc__value-text">
            <PickCrest v-if="value.camp" :side="value.camp" :home="home" :away="away" :league="result.league ?? null" :size="16" />{{ value.texte }}
          </p>
        </div>
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.rpc__body {
  /* Se règle sur SA largeur : page large comme panneau étroit. */
  container: rpc / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rpc__source {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ------------------------------------------------------- l'issue annoncée */
.rpc__hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 16px;
  padding: 16px 18px;
  border-radius: var(--cm-radius-md);
  border: 1px solid rgba(var(--cm-section-rgb) / 0.22);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-section-rgb) / 0.12), transparent 55%),
    var(--cm-surface-alt);
}

.rpc__what {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.rpc__label {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-section);
}

.rpc__pick {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.2;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.rpc__confidence {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.rpc__confidence-text {
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.rpc__double :deep(.pick-crest) {
  margin-right: 3px;
}

/* --------------------------------------------------------- les trois issues */
.rpc__bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.rpc__bar {
  display: grid;
  grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) 3.6rem;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.rpc__bar-label {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.rpc__bar-track {
  height: 8px;
}

/* Les issues non retenues en gris ; l'annoncée dans la couleur de section. */
.rpc__bar-fill {
  background: var(--cm-text-muted);
}

.rpc__bar.is-pick {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.rpc__bar.is-pick .rpc__bar-fill {
  background: var(--cm-section);
  box-shadow: 0 0 10px rgba(var(--cm-section-rgb) / 0.4);
}

.rpc__bar-value {
  text-align: right;
}

/* -------------------------------------------------------- fiabilité, value */
.rpc__reliability-text {
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.rpc__value.is-positif {
  border-color: rgba(var(--cm-accent-rgb) / 0.3);
  background: radial-gradient(120% 140% at 0% 0%, rgba(var(--cm-accent-rgb) / 0.1), transparent 55%), var(--cm-surface-alt);
}

.rpc__value.is-positif .cm-note__title {
  color: var(--cm-accent);
}

.rpc__value.is-warning .cm-note__title {
  color: var(--cm-warning);
}

.rpc__value.is-info .cm-note__title {
  color: var(--cm-info);
}

/* Panneau étroit : l'anneau au-dessus du nom, les libellés des barres plus courts. */
@container rpc (max-width: 380px) {
  .rpc__hero {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    text-align: center;
  }

  .rpc__what {
    align-items: center;
  }

  .rpc__confidence {
    justify-content: center;
  }

  .rpc__bar {
    grid-template-columns: minmax(0, 6.5rem) minmax(0, 1fr) 3.4rem;
  }
}
</style>
