<script setup>
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import CollapsibleSection from '@/components/common/CollapsibleSection.vue';
import { TRANCHES, RAISONS_DE_REFUS } from '@/utils/banc.js';

/**
 * LES PARIS SIMULÉS du banc d'essai (étape 19 du plan, 13/10/2026). La règle du moteur d'abord — cote juste
 * Pinnacle, prix de vos bookmakers (William Hill dans l'historique, jusqu'au 27/03/2025) —, période par
 * période : décisions, paris, rendement (RAPPORTÉ, jamais jugé : sa fourchette dit l'écart que le hasard
 * explique), valeur de clôture (elle PROUVE : sa pastille), pire série et série normale, raisons des refus.
 * Puis les deux variantes de prix, repliées, chacune avec « pas le prix d'un de vos bookmakers ». Le
 * composant n'appelle rien : la page lui donne `regles` (utils/banc.js, parisDuRejeu) et `phraseP5`.
 */
defineProps({
  regles: { type: Array, default: () => [] },
  phraseP5: { type: String, default: '' }
});

const titreTranche = (id) => TRANCHES.find((t) => t.id === id)?.titre ?? id;
const refusDits = (refus) => refus.slice(0, 2).map(([raison, n]) => `${n.toLocaleString('fr-FR')} : ${RAISONS_DE_REFUS[raison] ?? raison}`).join(' ; ');
</script>

<template>
  <div class="sbp">
    <p v-if="!regles.length" class="cm-note">
      <span class="cm-note__text">Aucun pari simulé : le rejeu n’avait aucun prix d’avant-match où la règle pouvait parier.</span>
    </p>
    <template v-for="r in regles" :key="r.regle">
      <section v-if="r.vosParis" class="sbp__regle">
        <h4 class="cm-section-title">{{ r.titre }} <HelpTip terme="valeur-de-cloture" /></h4>
        <p class="sbp__phrase cm-text-secondary">{{ r.phrase }}</p>
        <div class="cm-table-wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left" scope="col">Période</th>
                <th scope="col" title="Matchs où la règle avait un prix">Décisions</th>
                <th scope="col">Paris</th>
                <th scope="col" title="Gain par unité misée, mise fixe d’une unité : rapporté, jamais jugé">Rendement (rapporté)</th>
                <th scope="col" title="Cote prise × probabilité de clôture − 1 : la mesure qui prouve">Valeur de clôture</th>
                <th scope="col">Pire série <HelpTip terme="series-de-pertes" /></th>
                <th class="is-left" scope="col">Pourquoi pas de pari</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in r.lignes" :key="l.cle">
                <th scope="row" class="is-left">{{ titreTranche(l.tranche) }}<br /><small class="cm-text-muted">{{ l.prixTitre }}</small></th>
                <td class="cm-numeric">{{ l.decisions.toLocaleString('fr-FR') }}</td>
                <td class="cm-numeric is-strong">
                  {{ l.paris.toLocaleString('fr-FR') }}
                  <small v-if="l.tousLesReleves !== null" class="sbp__petit">{{ l.fraicheur.length ? l.fraicheur.join(', ') : 'aucun relevé daté' }} — tous les relevés d’avant H − 1 comptent</small>
                </td>
                <td class="cm-numeric">
                  {{ l.rendement }} <small v-if="l.fourchetteRendement" class="cm-text-muted">{{ l.fourchetteRendement }}</small>
                  <small v-if="l.ecartDetectable" class="sbp__petit">écart détectable {{ l.ecartDetectable }}</small>
                </td>
                <td class="cm-numeric">
                  {{ l.valeurCloture }} <small v-if="l.fourchetteCloture" class="cm-text-muted">{{ l.fourchetteCloture }}</small>
                  <span v-if="l.verdictCloture" class="cm-chip" :class="l.verdictCloture.ton"><AppIcon :name="l.verdictCloture.icone" :size="11" />{{ l.verdictCloture.texte }}</span>
                </td>
                <td class="cm-numeric">{{ l.pireSerie }}<small v-if="l.zoneNormale !== null" class="sbp__petit">normale jusqu’à {{ l.zoneNormale }}</small></td>
                <td class="is-left"><small>{{ refusDits(l.refus) || 'aucun refus' }}</small></td>
              </tr>
            </tbody>
          </table>
        </div>
        <CollapsibleSection v-for="l in r.lignes.filter((x) => x.paris > 0 && x.detail)" :key="`detail-${l.cle}`" class="sbp__detail">
          <template #header>
            <span class="sbp__titre-detail">{{ titreTranche(l.tranche) }} · {{ l.prixTitre }} : par tranche de cote et par championnat</span>
          </template>
          <div class="sbp__detail-grille">
            <div class="cm-table-wrap">
              <table class="cm-table">
                <thead>
                  <tr>
                    <th class="is-left" scope="col">Tranche de cote</th>
                    <th scope="col">Paris</th>
                    <th scope="col">Rendement (rapporté)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in l.detail.parCote" :key="t.cle">
                    <th scope="row" class="is-left">{{ t.libelle }}</th>
                    <td class="cm-numeric">{{ t.n.toLocaleString('fr-FR') }}</td>
                    <td class="cm-numeric">{{ t.rendement }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" class="is-left">Σ paris · ⌀ rendement</th>
                    <td class="cm-numeric is-strong">{{ l.detail.total.n.toLocaleString('fr-FR') }}</td>
                    <td class="cm-numeric is-strong">{{ l.detail.total.rendement }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div class="cm-table-wrap">
              <table class="cm-table">
                <thead>
                  <tr>
                    <th class="is-left" scope="col">Championnat</th>
                    <th scope="col">Paris</th>
                    <th scope="col">Rendement (rapporté)</th>
                    <th scope="col">Valeur de clôture</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="c in l.detail.parLigue" :key="c.cle">
                    <th scope="row" class="is-left">{{ c.libelle }}</th>
                    <td class="cm-numeric">{{ c.n.toLocaleString('fr-FR') }}</td>
                    <td class="cm-numeric">{{ c.rendement }}</td>
                    <td class="cm-numeric">{{ c.valeurCloture }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" class="is-left">Σ paris · ⌀ rendement</th>
                    <td class="cm-numeric is-strong">{{ l.detail.total.n.toLocaleString('fr-FR') }}</td>
                    <td class="cm-numeric is-strong">{{ l.detail.total.rendement }}</td>
                    <td class="cm-numeric is-strong">{{ l.valeurCloture }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </CollapsibleSection>
      </section>
      <CollapsibleSection v-else class="sbp__variante">
        <template #header>
          <span class="sbp__titre-variante">{{ r.titre }}</span>
          <span class="cm-chip is-warning">pas le prix d’un de vos bookmakers</span>
        </template>
        <p class="sbp__phrase cm-text-secondary">{{ r.phrase }}</p>
        <div class="cm-table-wrap">
          <table class="cm-table">
            <thead>
              <tr>
                <th class="is-left" scope="col">Période</th>
                <th scope="col">Paris</th>
                <th scope="col">Rendement (rapporté)</th>
                <th scope="col">Valeur de clôture</th>
                <th scope="col">Pire série</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in r.lignes" :key="l.cle">
                <th scope="row" class="is-left">{{ titreTranche(l.tranche) }}</th>
                <td class="cm-numeric">{{ l.paris.toLocaleString('fr-FR') }}</td>
                <td class="cm-numeric">{{ l.rendement }} <small v-if="l.fourchetteRendement" class="cm-text-muted">{{ l.fourchetteRendement }}</small></td>
                <td class="cm-numeric">
                  {{ l.valeurCloture }} <small v-if="l.fourchetteCloture" class="cm-text-muted">{{ l.fourchetteCloture }}</small>
                  <span v-if="l.verdictCloture" class="cm-chip" :class="l.verdictCloture.ton"><AppIcon :name="l.verdictCloture.icone" :size="11" />{{ l.verdictCloture.texte }}</span>
                </td>
                <td class="cm-numeric">{{ l.pireSerie }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    </template>
    <p v-if="phraseP5" class="cm-note is-info">
      <span class="cm-note__title">Vos paris depuis le lancement</span>
      <span class="cm-note__text">{{ phraseP5 }}</span>
    </p>
  </div>
</template>

<style scoped>
.sbp {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sbp__regle {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sbp__phrase {
  margin: 0;
  font-size: 13px;
}
.sbp__petit {
  display: block;
  font-size: 11px;
  color: var(--cm-text-muted);
  font-weight: 400;
}
.sbp__titre-variante {
  font-weight: 600;
  margin-right: 8px;
}
.sbp__titre-detail {
  font-size: 13px;
  color: var(--cm-text-secondary);
}
.sbp__detail-grille {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
  padding-top: 8px;
}
</style>
