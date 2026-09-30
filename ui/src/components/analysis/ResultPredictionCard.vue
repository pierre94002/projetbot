<script setup>
/**
 * Pronostic du résultat par le moteur (cf. server/src/core/engine/
 * resultPrediction.js et valueFinder.js) : les probabilités 1N2, l'issue
 * la plus probable, la fiabilité que l'historique lui prête, et l'état des
 * paris value chez vos bookmakers — y compris quand il n'y en a pas.
 */
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';

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
      return { ton: 'neutre', texte: `Aucune value chez vos bookmakers. Leur meilleure offre, ${offre(o)}, ${ecart} la cote juste de ${cote(o.fairOdds)}.` };
    }
    case 'value_hors_limites': {
      const o = meilleure(candidats.filter((c) => c.ev > (s.limits?.edgeThresholdMin ?? 0) && (c.exclusion === 'cote_trop_haute' || c.exclusion === 'avantage_invraisemblable')));
      const pourquoi = o?.exclusion === 'cote_trop_haute'
        ? `sa cote dépasse la cote maximale de ${cote(s.limits?.maxValueOdds)}`
        : `un avantage de ${pct(o?.ev ?? 0, 1)} est trop beau pour être vrai : cote périmée ou erreur probable`;
      return { ton: 'alerte', texte: `${o ? `${offre(o)} paie au-dessus de la cote juste de ${cote(o.fairOdds)}, mais` : 'Une offre paie au-dessus de la cote juste, mais'} ${pourquoi}. Aucun pari recommandé.` };
    }
    case 'no_market_odds': return { ton: 'neutre', texte: 'Pas de cote pour ce match : pronostic tiré des statistiques, aucun pari recommandé.' };
    case 'trop_peu_de_bookmakers': return { ton: 'neutre', texte: 'Aucun bookmaker de référence ne cote ce match : pas de cote juste sûre, aucun pari recommandé.' };
    case 'aucun_bookmaker_autorise': return { ton: 'neutre', texte: 'Aucun de vos bookmakers ne propose ce match.' };
    case 'bookmakers_juges': return { ton: 'neutre', texte: 'Vos bookmakers ont eux-mêmes fixé la cote juste de ce match : aucun pari possible contre eux.' };
    case 'cotes_incoherentes': return { ton: 'alerte', texte: 'Les cotes de vos bookmakers sont incohérentes pour ce match, sans doute périmées : aucun pari recommandé.' };
    default: return { ton: 'neutre', texte: 'Aucun pari recommandé.' };
  }
});
</script>

<template>
  <section v-if="prediction" class="prediction">
    <header class="prediction__head">
      <span class="prediction__title">Pronostic du résultat</span>
      <span class="prediction__source">{{ source }}</span>
    </header>

    <p class="prediction__pick">
      {{ prediction.label }}
      <span class="prediction__confidence">{{ pct(prediction.confidence) }}</span>
    </p>
    <p v-if="prediction.doubleChance" class="prediction__double">
      Résultat ouvert : en double chance, « {{ prediction.doubleChance.label }} » à {{ pct(prediction.doubleChance.probability) }}.
    </p>

    <div class="prediction__bars">
      <div
        v-for="b in barres"
        :key="b.key"
        class="prediction__bar"
        :class="{ 'prediction__bar--pick': b.key === prediction.outcome }"
      >
        <span class="prediction__bar-label cm-truncate">{{ b.label }}</span>
        <span class="prediction__bar-track"><span class="prediction__bar-fill" :style="{ width: `${Math.round(b.p * 100)}%` }" /></span>
        <span class="prediction__bar-value">{{ pct(b.p) }}</span>
      </div>
    </div>

    <p v-if="fiabilite" class="prediction__reliability">{{ fiabilite }}</p>

    <div v-if="value" class="prediction__value" :class="`prediction__value--${value.ton}`">
      <AppIcon :name="value.ton === 'positif' ? 'check' : value.ton === 'alerte' ? 'alert' : 'info'" :size="14" />
      <span>{{ value.texte }}</span>
    </div>
  </section>
</template>

<style scoped>
.prediction {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius);
  background: var(--cm-surface-alt);
}

.prediction__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.prediction__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--cm-text-secondary);
}

.prediction__source {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.prediction__pick {
  margin: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  font-size: 17px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.prediction__confidence {
  color: var(--cm-accent);
  font-variant-numeric: tabular-nums;
}

.prediction__double {
  margin: 0;
  font-size: 12.5px;
  color: var(--cm-warning);
}

.prediction__bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.prediction__bar {
  display: grid;
  grid-template-columns: minmax(0, 7.5rem) 1fr 3.2rem;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.prediction__bar-track {
  height: 6px;
  border-radius: 999px;
  background: var(--cm-border);
  overflow: hidden;
}

.prediction__bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--cm-text-muted);
}

.prediction__bar--pick {
  color: var(--cm-text-primary);
  font-weight: 600;
}

.prediction__bar--pick .prediction__bar-fill {
  background: var(--cm-accent);
}

.prediction__bar-value {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.prediction__reliability {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.prediction__value {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 11px;
  border-radius: var(--cm-radius-sm);
  font-size: 12.5px;
  line-height: 1.45;
}

.prediction__value :deep(svg) {
  flex: none;
  margin-top: 2px;
}

.prediction__value--positif {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.prediction__value--neutre {
  background: var(--cm-info-soft);
  color: var(--cm-text-secondary);
}

.prediction__value--alerte {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}
</style>
