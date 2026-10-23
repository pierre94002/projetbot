<script setup>
/**
 * « RETROUVE-T-ON LA MESURE DU 23/09 ? » (étape 31 du plan, 22/10/2026) : le contrôle de l'étape 22 — le 23/09, la
 * règle de pari a retenu Pinnacle comme livre de référence (perte log 0,9925 sur 15 885 matchs d'avant-match
 * football-data, 18 championnats, 07/2023 → 09/2026) ; le nouveau calcul, refait sur les mêmes matchs, retrouve-t-il
 * le même résultat ? C'est ce qui permet de croire le reste de la page.
 *
 * Tout est LU (le résumé de GET /api/market-knowledge) ; rien n'est calculé ici. Le tableau reste TOUJOURS
 * affiché, même sans mesure. Aucun vert, aucun rouge. Les mots viennent de utils/bookmakers.js.
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { reproductionDite } from '@/utils/bookmakers.js';

const props = defineProps({
  resume: { type: Object, default: null },
  livres: { type: Array, default: () => [] },
  provenance: { type: Object, default: null },
  /** Le texte d'une ligne vide : « pas encore mesuré », ou « lecture en cours ». */
  vide: { type: String, default: 'pas encore mesuré' }
});

const r = computed(() => reproductionDite(props.resume, props.livres));
const jour = (iso) => (typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : 'jour inconnu');
const jugementDe = (titre) => r.value.jugements.find((j) => j.autre === titre) ?? null;
const somme = (cle) => r.value.classement.reduce((t, c) => t + c[cle], 0);
const moyenne = (cle) => (r.value.classement.length ? somme(cle) / r.value.classement.length : null);
const un = (x) => (x === null ? 'pas de moyenne' : x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
</script>

<template>
  <AppCard
    class="mrc"
    icon="history"
    eyebrow="Contrôle"
    title="Retrouve-t-on la mesure du 23/09 ?"
    subtitle="Le 23/09, la règle de pari a retenu Pinnacle comme livre de référence. Le calcul refait sur les mêmes matchs retrouve-t-il ce résultat ? C’est ce qui permet de croire le reste de la page."
    data-bloc="mesure-du-23-09"
  >
    <div class="mrc__corps">

      <p class="mrc__etat" data-etat-repro>
        <span class="cm-chip" :class="!r.mesuree ? '' : r.retrouve ? 'is-info' : 'is-warning'">
          <AppIcon :name="!r.mesuree ? 'clock' : r.retrouve ? 'check' : 'alert'" :size="11" />{{ !r.mesuree ? 'pas encore mesurée' : r.retrouve ? 'retrouvée' : 'pas retrouvée' }}
        </span>
        <span>{{ r.texte }}</span>
      </p>

      <div class="cm-kpis mrc__kpis">
        <div class="cm-kpi">
          <span class="cm-kpi__label">Le 23/09</span>
          <span class="cm-kpi__value mrc__kpi-texte">{{ r.reference ? r.reference.titre : 'non lu' }}</span>
          <span class="cm-kpi__detail">{{ r.reference ? `perte log ${r.reference.perteLog} sur ${r.reference.matchs} matchs` : 'pas encore mesurée' }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Aujourd’hui</span>
          <span class="cm-kpi__value mrc__kpi-texte">{{ r.mesure ? `perte log ${r.mesure.perteLog}` : 'pas mesuré' }}</span>
          <span class="cm-kpi__detail">{{ r.mesure ? `sur ${r.mesure.matchs} matchs, les mêmes que le 23/09` : 'le panier de matchs du 23/09 manque' }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Période</span>
          <span class="cm-kpi__value mrc__kpi-texte">{{ r.periode ? `${jour(r.periode.de)} → ${jour(r.periode.a)}` : 'non lue' }}</span>
          <span class="cm-kpi__detail">avant-match football-data, championnats rattachés au magasin</span>
        </div>
      </div>

      <div class="cm-table-wrap mrc__wrap">
        <table class="cm-table mrc__table" data-tableau="mesure-du-23-09">
          <thead>
            <tr>
              <th class="is-left">Rang</th>
              <th class="is-left">Bookmaker</th>
              <th title="Combien d’autres livres il bat sur leurs matchs communs">Bat</th>
              <th title="Combien d’autres livres le battent sur leurs matchs communs">Perd contre</th>
              <th>À égalité</th>
              <th class="is-left" title="Le meneur face à ce livre, jugé par le juge de la mesure">Face au meneur</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in r.classement" :key="c.livre">
              <td class="is-left cm-numeric">{{ c.rang }}</td>
              <td class="is-left is-strong">{{ c.titre }}<span class="cm-chip mrc__type" :class="c.type.ton" :title="c.type.titre">{{ c.type.texte }}</span></td>
              <td class="cm-numeric is-strong">{{ c.bat }}</td>
              <td class="cm-numeric">{{ c.perd }}</td>
              <td class="cm-numeric">{{ c.egal }}</td>
              <td class="is-left">
                <template v-if="c.rang === 1"><span class="cm-chip is-info"><AppIcon name="award" :size="11" />le meneur</span></template>
                <template v-else-if="jugementDe(c.titre)">
                  <span class="cm-chip" :class="jugementDe(c.titre).ton">{{ jugementDe(c.titre).verdict === 'retenu' ? 'plus juste, au-delà du hasard' : jugementDe(c.titre).verdict === 'pas-prouve' ? 'écart dans le hasard' : jugementDe(c.titre).verdict === 'moins-bon' ? 'moins juste, au-delà du hasard' : 'trop peu de matchs' }}</span>
                  <small class="mrc__petit">{{ jugementDe(c.titre).n.toLocaleString('fr-FR') }} matchs communs</small>
                </template>
                <span v-else class="mrc__vide">non comparé</span>
              </td>
            </tr>
            <tr v-if="!r.classement.length">
              <td class="is-left mrc__vide" colspan="6">{{ vide }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong" colspan="2">Σ Total<small class="mrc__petit">{{ r.classement.length }} livre{{ r.classement.length > 1 ? 's' : '' }} du panier du 23/09</small></td>
              <td class="cm-numeric is-strong">{{ somme('bat') }}</td>
              <td class="cm-numeric is-strong">{{ somme('perd') }}</td>
              <td class="cm-numeric is-strong">{{ somme('egal') }}</td>
              <td class="is-left mrc__moyenne">une victoire est la défaite d’un autre</td>
            </tr>
            <tr>
              <td class="is-left mrc__moyenne" colspan="2">⌀ Moyenne<small class="mrc__petit">chaque livre compte pour un</small></td>
              <td class="cm-numeric mrc__moyenne">{{ un(moyenne('bat')) }}</td>
              <td class="cm-numeric mrc__moyenne">{{ un(moyenne('perd')) }}</td>
              <td class="cm-numeric mrc__moyenne">{{ un(moyenne('egal')) }}</td>
              <td class="mrc__moyenne"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p v-if="r.reference" class="mrc__source">Référence du 23/09 : {{ r.reference.source }}.</p>

      <div class="mrc__pied">
        <ProvenanceChip
          v-if="provenance"
          variante="ligne"
          :source="provenance.source"
          :releve-le="provenance.releveLe"
          :action="provenance.action"
          :fichier="provenance.fichier"
          :detail="provenance.detail"
          :vieux-apres-heures="48"
        />
      </div>
    </div>
  </AppCard>
</template>

<style scoped>
.mrc {
  container: mrc / inline-size;
}

.mrc__corps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mrc__etat {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--cm-text-primary);
}

.mrc__kpis {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.mrc__kpi-texte {
  font-size: 16px;
  line-height: 1.3;
}

.mrc__wrap {
  max-height: 360px;
}

.mrc__table td {
  vertical-align: top;
}

.mrc__type {
  margin-left: 6px;
  vertical-align: middle;
}

.mrc__petit {
  display: block;
  margin-top: 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.mrc__vide {
  font-size: 11.5px;
  color: var(--cm-text-secondary);
  white-space: normal;
}

.mrc__moyenne {
  color: var(--cm-text-muted);
  white-space: normal;
}

.mrc__source {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.mrc__pied {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
