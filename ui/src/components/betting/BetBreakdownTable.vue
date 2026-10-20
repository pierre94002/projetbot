<script setup>
import { COLONNES_SUIVI, cellulesDeLigne, cellulesDuTotal, cellulesDeLaMoyenne, tonSigne } from '@/utils/suiviParis.js';

/**
 * UN TABLEAU DU SUIVI DES PARIS (étape 11 du plan, 06/10/2026) — par marché,
 * championnat, bookmaker, tranche de cote ou confiance, tel que le serveur le
 * calcule (GET /api/bets/suivi, `tableaux`). Chaque pari est dans UNE ligne :
 * la somme d'une colonne de montants retombe sur le carnet. Toujours complet,
 * même vide (règle de Pierre : la structure d'abord) : les lignes fixes (vos
 * bookmakers, les tranches, les niveaux de confiance) restent à zéro, et le
 * pied a toujours ses deux lignes :
 *   - TOTAL (Σ) : comptes et montants — jamais un pourcentage ni une cote ;
 *   - MOYENNE (⌀) par pari : mise, gain, ROI, réussite, cote, valeur de clôture.
 * Le composant n'appelle rien.
 */
const props = defineProps({
  tableau: { type: Object, required: true }
});

const lignes = () => props.tableau?.lignes ?? [];
/** Les colonnes dont le signe compte : gain réel, ROI, gain attendu, valeur de clôture. */
const SIGNEES = new Set(['gainReel', 'roi', 'gainAttendu', 'cloture']);
function ton(cle, valeur) {
  if (!SIGNEES.has(cle)) return '';
  const t = tonSigne(valeur);
  return t === 'is-positive' ? 'cm-positive' : t === 'is-negative' ? 'cm-negative' : '';
}
const valeurDe = (cle, l) => (cle === 'cloture' ? l.cloture?.moyenne : l[cle]);
</script>

<template>
  <section class="bbt">
    <h4 class="cm-group-title">{{ tableau.titre }}</h4>
    <p v-if="tableau.note" class="bbt__note">{{ tableau.note }}</p>
    <div class="cm-table-wrap">
      <table class="cm-table bbt__table">
        <thead>
          <tr>
            <th class="is-left">{{ tableau.colonne }}</th>
            <th v-for="c in COLONNES_SUIVI" :key="c.cle" :title="c.titre">{{ c.libelle }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!lignes().length">
            <td :colspan="COLONNES_SUIVI.length + 1" class="is-center bbt__empty">Aucun pari pour l'instant.</td>
          </tr>
          <tr v-for="l in lignes()" :key="l.cle" :class="{ 'is-vide': !l.paris }">
            <td class="is-left is-strong bbt__label">{{ l.libelle }}</td>
            <td v-for="c in COLONNES_SUIVI" :key="c.cle" class="cm-numeric" :class="ton(c.cle, valeurDe(c.cle, l))">{{ cellulesDeLigne(l)[c.cle] }}</td>
          </tr>
          <tr class="is-total" title="Total : la somme des comptes et des montants — jamais une somme de pourcentages ni de cotes.">
            <td class="is-left bbt__label">Total (Σ)</td>
            <td v-for="c in COLONNES_SUIVI" :key="c.cle" class="cm-numeric" :class="ton(c.cle, tableau.total?.[c.cle])">{{ cellulesDuTotal(tableau.total)[c.cle] }}</td>
          </tr>
          <tr class="is-moyenne" title="Moyenne par pari : chaque pari pèse autant, jamais la moyenne des taux des lignes.">
            <td class="is-left bbt__label">Moyenne (⌀) par pari</td>
            <td v-for="c in COLONNES_SUIVI" :key="c.cle" class="cm-numeric" :class="ton(c.cle, tableau.moyenne?.[c.cle])">{{ cellulesDeLaMoyenne(tableau.moyenne)[c.cle] }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.bbt {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.bbt__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.bbt__empty {
  padding: 18px 12px;
  color: var(--cm-text-muted);
}

/* Douze colonnes : des cellules un peu plus serrées que le tableau par défaut. */
.bbt__table th,
.bbt__table td {
  padding-left: 9px;
  padding-right: 9px;
}

/* Le libellé passe à la ligne plutôt que d'élargir le tableau. */
.cm-table td.bbt__label {
  white-space: normal;
  min-width: 130px;
}

/* Une ligne fixe sans pari : présente, estompée. */
.bbt__table tr.is-vide td {
  color: var(--cm-text-muted);
}

.bbt__table tr.is-total td,
.bbt__table tr.is-moyenne td {
  font-weight: 700;
  color: var(--cm-text-primary);
  background: rgba(var(--cm-section-rgb) / 0.05);
}

.bbt__table tr.is-total td {
  border-top: 1px solid var(--cm-border);
}

.bbt__table tr.is-moyenne td {
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.bbt__table td.cm-positive {
  color: var(--cm-accent);
}

.bbt__table td.cm-negative {
  color: var(--cm-danger);
}
</style>
