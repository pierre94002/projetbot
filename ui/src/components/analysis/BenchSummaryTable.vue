<script setup>
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import { perteDite, pourcentDit } from '@/utils/banc.js';

/**
 * LE TABLEAU « MOTEUR, MARCHÉ, REPÈRE » du banc d'essai (étape 19 du plan, 13/10/2026) : une ligne par ligne
 * de marché, une colonne par tranche de période. Dans chaque case : le nombre de matchs, la perte log du
 * moteur (en gras), celle du marché et celle du repère courant (ce que donnerait le championnat seul, avant
 * le match), l'écart du moteur avec sa fourchette et la pastille du verdict — les dessins de la feuille de
 * route : le vert n'y est que « retenu » (validé), jamais une value. Les données déjà vues le disent.
 * Le composant n'appelle rien : la page lui donne `tableau` (utils/banc.js, tableauDuRejeu ou
 * tableauDeLaNote) et `variantes` (K, le nombre de cases jugées du rejeu).
 */
defineProps({
  tableau: { type: Object, required: true },
  variantes: { type: Number, default: null },
  jeu: { type: String, default: '' }
});
</script>

<template>
  <div class="bst">
    <p v-if="!tableau.lignes.length" class="cm-note bst__vide">
      <span class="cm-note__text">Aucune case pour ce jeu de prix : le rejeu n’a eu aucun match à ce prix sur les périodes demandées.</span>
    </p>
    <div v-else class="cm-table-wrap">
      <table class="cm-table bst__table">
        <thead>
          <tr>
            <th class="is-left" scope="col">Marché</th>
            <th v-for="col in tableau.colonnes" :key="col.id" scope="col" class="is-left" :title="col.detail">
              {{ col.titre }}<br /><small class="cm-text-muted">{{ col.detail }}</small>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in tableau.lignes" :key="l.cle">
            <th scope="row" class="is-left bst__marche">
              {{ l.libelle }}
              <small v-if="l.marketKey === 'result'" class="bst__aide">Le moteur est Pinnacle : l’écart au marché mesure Pinnacle face à la moyenne.</small>
            </th>
            <td v-for="col in tableau.colonnes" :key="col.id" class="is-left bst__case">
              <template v-if="l.cellules[col.id]">
                <span class="bst__n cm-numeric">{{ l.cellules[col.id].n.toLocaleString('fr-FR') }} matchs</span>
                <span class="bst__ligne">moteur <strong class="cm-numeric">{{ perteDite(l.cellules[col.id].moteur) }}</strong><small v-if="l.cellules[col.id].justes !== null" class="cm-text-muted"> · {{ pourcentDit(l.cellules[col.id].justes) }} de justes</small></span>
                <span v-if="l.cellules[col.id].sansMarche" class="bst__ligne cm-text-muted">marché : aucune cote historique pour ce marché</span>
                <span v-else class="bst__ligne">
                  marché <span class="cm-numeric">{{ perteDite(l.cellules[col.id].marche) }}</span>
                  <template v-if="l.cellules[col.id].ecartMarche">
                    <span class="cm-numeric bst__ecart">{{ l.cellules[col.id].ecartMarche.texte }}</span>
                    <span class="cm-chip" :class="l.cellules[col.id].ecartMarche.pastille.ton" :title="l.cellules[col.id].ecartMarche.raison">
                      <AppIcon :name="l.cellules[col.id].ecartMarche.pastille.icone" :size="11" />{{ l.cellules[col.id].ecartMarche.pastille.texte }}
                    </span>
                  </template>
                </span>
                <span class="bst__ligne">
                  repère <span class="cm-numeric">{{ perteDite(l.cellules[col.id].repere, 'sans repère') }}</span>
                  <template v-if="l.cellules[col.id].ecartRepere">
                    <span class="cm-numeric bst__ecart">{{ l.cellules[col.id].ecartRepere.texte }}</span>
                    <span class="cm-chip" :class="l.cellules[col.id].ecartRepere.pastille.ton" :title="l.cellules[col.id].ecartRepere.raison">
                      <AppIcon :name="l.cellules[col.id].ecartRepere.pastille.icone" :size="11" />{{ l.cellules[col.id].ecartRepere.pastille.texte }}
                    </span>
                  </template>
                </span>
                <small v-if="l.cellules[col.id].temoins" class="bst__temoins" title="Témoins sans verdict : rien n’est jugé dessus">{{ l.cellules[col.id].temoins }}</small>
                <small class="bst__vues" :class="{ 'is-vues': l.cellules[col.id].vues.vues }">{{ l.cellules[col.id].vues.texte }}</small>
              </template>
              <small v-else class="cm-text-muted">pas de match à ce prix</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="bst__legende cm-text-muted">
      Perte log : plus petite = meilleure. L’écart se lit « moteur face au marché » (ou au repère) : positif, le moteur fait mieux.
      Fourchette élargie pour {{ variantes ? `${variantes.toLocaleString('fr-FR')} cases jugées` : 'le nombre de cases jugées' }}
      <HelpTip terme="fourchette-du-hasard" /> ; déjà vu <HelpTip terme="donnees-deja-vues" />.
      <template v-if="jeu"> Prix : {{ jeu }}.</template>
    </p>
  </div>
</template>

<style scoped>
.bst {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bst__table td,
.bst__table th {
  vertical-align: top;
}
.bst__marche {
  min-width: 150px;
}
.bst__aide {
  display: block;
  margin-top: 4px;
  font-weight: 400;
  font-size: 11px;
  color: var(--cm-text-muted);
  max-width: 220px;
}
.bst__case {
  min-width: 190px;
}
.bst__n {
  display: block;
  font-size: 11px;
  color: var(--cm-text-muted);
  margin-bottom: 2px;
}
.bst__ligne {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  font-size: 12px;
  line-height: 1.5;
}
.bst__ecart {
  color: var(--cm-text-secondary);
}
.bst__temoins {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--cm-text-muted);
}
.bst__vues {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  color: var(--cm-text-muted);
}
.bst__vues.is-vues {
  color: var(--cm-warning);
}
.bst__legende {
  font-size: 12px;
  margin: 0;
}
.bst__vide {
  margin: 0;
}
</style>
