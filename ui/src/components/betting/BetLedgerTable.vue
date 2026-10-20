<script setup>
import { computed, ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import { STATUTS, clotureDite, gainAttenduDuCarnet, eurosSignes, euros, coteDite, tonSigne, pourcent } from '@/utils/suiviParis.js';

/**
 * LE CARNET, PARI PAR PARI (étape 11 du plan, 06/10/2026) : pour chaque pari,
 * sa date, ce qui a été joué, chez qui, la cote prise et la mise, son statut,
 * son gain réel, son gain attendu au moment du pari (« non noté » pour un pari
 * d'avant « J'ai parié »), sa VALEUR DE CLÔTURE (cote prise × probabilité juste
 * de clôture − 1) et ce qu'il faut signaler face aux réglages actuels (mise
 * maximale, mise acceptée chez ce bookmaker). Du plus récent au plus ancien ;
 * 30 lignes, le reste à la demande. Le composant n'appelle rien.
 */
const props = defineProps({
  paris: { type: Array, default: () => [] }
});

const LIGNES = 30;
const toutVoir = ref(false);
const lignes = computed(() => (toutVoir.value ? props.paris : props.paris.slice(0, LIGNES)));

// Une date illisible dans le carnet ne casse pas le tableau : « — ».
const lisible = (iso) => Boolean(iso) && Number.isFinite(Date.parse(iso));
const jour = (iso) => (lisible(iso) ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(iso)) : '—');
const heure = (iso) => (lisible(iso) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso)) : 'date inconnue');
const TONS = { won: 'is-accent', lost: 'is-danger', pending: 'is-warning', void: '' };
const tonCase = (x) => {
  const t = tonSigne(x);
  return t === 'is-positive' ? 'cm-positive' : t === 'is-negative' ? 'cm-negative' : '';
};
/** La probabilité de gagner retenue pour la zone des séries : du moteur, ou de la cote. */
const probaDite = (pg) => (pg ? `${pourcent(pg.p * 100, 1)} (${pg.source === 'moteur' ? 'moteur, au pari' : '1 / cote'})` : 'inconnue');
</script>

<template>
  <section class="ledger">
    <h4 class="cm-group-title">
      Pari par pari
      <HelpTip terme="valeur-de-cloture" />
    </h4>
    <div class="cm-table-wrap">
      <table class="cm-table ledger__table">
        <thead>
          <tr>
            <th>Date</th>
            <th class="is-left">Pari</th>
            <th class="is-left">Bookmaker</th>
            <th>Cote</th>
            <th>Mise</th>
            <th>Statut</th>
            <th title="Gagné : mise × cote − mise ; perdu : − mise">Gain réel</th>
            <th title="Mise × (probabilité du moteur × cote prise − 1), au moment du pari">Gain attendu</th>
            <th title="Cote prise × probabilité juste de clôture − 1">Valeur de clôture</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!paris.length">
            <td colspan="9" class="is-center ledger__empty">Aucun pari au carnet pour l'instant.</td>
          </tr>
          <tr v-for="p in lignes" :key="p.id">
            <td class="cm-numeric ledger__date" :title="`Pari enregistré le ${heure(p.createdAt)}${p.settledAt ? ` · réglé le ${heure(p.settledAt)}` : ''}`">{{ jour(p.createdAt) }}</td>
            <td class="is-left ledger__wrap">
              <span v-for="(s, i) in p.selections" :key="i" class="ledger__sel">
                <PickCrest :item="s.pick ?? ''" :home="s.homeName" :away="s.awayName" :league="s.league" :size="14" reserve />
                <strong>{{ s.pick }}</strong>
                <span class="ledger__sub">{{ s.homeName }} – {{ s.awayName }}<template v-if="s.league"> · {{ s.league }}</template></span>
              </span>
              <span class="ledger__sub">{{ p.marche }}<template v-if="p.selections.length > 1"> · {{ p.selections.length }} sélections</template> · gagner : {{ probaDite(p.probabiliteDeGain) }}</span>
              <!-- Ce qu'il faut signaler face aux réglages actuels (mise maximale, mise acceptée, compte fermé), sous le pari. -->
              <span v-for="s in p.signaux" :key="s.code" class="ledger__signal"><AppIcon name="alert" :size="11" />{{ s.texte }}</span>
            </td>
            <td class="is-left">{{ p.bookmakerTitle ?? 'non noté' }}</td>
            <td class="cm-numeric">{{ coteDite(p.odds) }}</td>
            <td class="cm-numeric">{{ euros(p.stake) }}</td>
            <td>
              <span class="cm-chip ledger__status" :class="TONS[p.status] ?? ''">{{ STATUTS[p.status] ?? p.status }}</span>
            </td>
            <td class="cm-numeric is-strong" :class="tonCase(p.gainReel)">{{ p.gainReel === null ? '—' : eurosSignes(p.gainReel) }}</td>
            <td class="cm-numeric" :class="tonCase(p.gainAttendu?.montant)">{{ gainAttenduDuCarnet(p.gainAttendu) }}</td>
            <td class="cm-numeric" :class="tonCase(p.cloture?.valeur)" :title="clotureDite(p.cloture).titre">{{ clotureDite(p.cloture).texte }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <button v-if="paris.length > LIGNES" type="button" class="cm-link ledger__more" :aria-expanded="toutVoir" @click="toutVoir = !toutVoir">
      <AppIcon name="chevronDown" :size="13" class="ledger__caret" :class="{ 'is-open': toutVoir }" />
      {{ toutVoir ? `Seulement les ${LIGNES} plus récents` : `Voir les ${paris.length - LIGNES} autres paris` }}
    </button>
  </section>
</template>

<style scoped>
.ledger {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.ledger .cm-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ledger__empty {
  padding: 18px 12px;
  color: var(--cm-text-muted);
}

.ledger__date {
  color: var(--cm-text-secondary);
}

.ledger__table td.ledger__wrap {
  white-space: normal;
  min-width: 190px;
}

.ledger__sel {
  display: block;
  line-height: 1.45;
  color: var(--cm-text-primary);
}

.ledger__sel strong {
  margin-left: 4px;
}

.ledger__sub {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.ledger__status {
  font-size: 11px;
}

.ledger__signal {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-warning);
}

.ledger__table td.cm-positive {
  color: var(--cm-accent);
}

.ledger__table td.cm-negative {
  color: var(--cm-danger);
}

.ledger__more {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ledger__caret {
  transition: transform var(--cm-transition);
}

.ledger__caret.is-open {
  transform: rotate(180deg);
}
</style>
