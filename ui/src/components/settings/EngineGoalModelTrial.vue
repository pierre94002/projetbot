<script setup>
/**
 * LA CANDIDATE DU MODÈLE DE BUTS UNIQUE (étape 27 du plan, 21/10/2026), dans la carte « Versions du moteur » de
 * Réglages (EngineVersionsPanel), sous la fiche de la candidate et avant son essai (EngineCandidateTrial) — seulement
 * quand la candidate est un modèle de buts :
 *   - la porte 1 du banc d'essai (2019-2023, jamais vu) et sa réserve ACCEPTÉE, écrite telle quelle ;
 *   - un chiffre clé par famille (plus/moins, les 2 équipes marquent, buts d'une équipe, résultat + total) : le verdict
 *     de l'essai à blanc en mots, « pas encore » avant l'horizon, et le chiffre du banc ;
 *   - la calibration du pronostic retenu de chaque version, famille par famille ;
 *   - les régimes des matchs calculés à blanc (avec ou sans cote plus/moins, sans cote) ;
 *   - la porte de l'adoption, l'horizon (« 412 matchs sur 800, jour 11 sur 21 ») et la phrase « Une famille « pas
 *     prouvé » à 800 matchs est l'issue normale ; seul « moins bon » est un échec. »
 * Pur affichage : il lit l'état de la carte (GET /api/config/versions) et n'appelle rien. Les mots viennent de
 * utils/versionsMoteur.js (pur, testé). Aucun vert : rien ici n'est une value.
 */
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import {
  PHRASES_DU_MODELE_DE_BUTS,
  famillesDuModele,
  calibrationDuModele,
  regimesDuModele,
  porteDeLAdoption,
  avancementDuModele,
  porte1DuBanc
} from '@/utils/versionsMoteur.js';

const props = defineProps({
  /** La candidate de l'état lu (GET /api/config/versions → candidate). */
  candidate: { type: Object, required: true }
});

const porte1 = computed(() => porte1DuBanc(props.candidate));
const familles = computed(() => famillesDuModele(props.candidate));
const calibration = computed(() => calibrationDuModele(props.candidate));
const regimes = computed(() => regimesDuModele(props.candidate));
const porte = computed(() => porteDeLAdoption(props.candidate));
const avancement = computed(() => avancementDuModele(props.candidate));
</script>

<template>
  <div class="cm-block egm" data-modele-de-buts>
    <div class="egm__tete">
      <span class="cm-icon-box is-violet is-sm"><AppIcon name="layers" :size="14" /></span>
      <strong>Le modèle de buts unique, famille par famille</strong>
      <span class="cm-chip">{{ avancement }}</span>
      <HelpTip terme="modele-de-buts" />
    </div>

    <!-- 1. La porte 1, au banc d'essai (matchs passés jamais vus), et la réserve acceptée. -->
    <div class="egm__porte1">
      <p class="egm__titre">
        <AppIcon name="history" :size="12" />
        <span>{{ porte1 ? porte1.titre : 'Porte 1 au banc d’essai : pas mesurée pour cette candidate' }}</span>
        <HelpTip terme="banc-d-essai" />
      </p>
      <template v-if="porte1">
        <p class="egm__texte">{{ porte1.phrase }}</p>
        <ul class="egm__liste">
          <li v-for="(c, i) in porte1.criteres" :key="i">{{ c }}</li>
        </ul>
        <p v-for="(r, i) in porte1.reserves" :key="`r${i}`" class="egm__reserve">{{ r }}</p>
      </template>
      <p v-else class="egm__petit">La porte 1 se mesure au banc d’essai (2019-2023) pour une candidate donnée ; une candidate retouchée doit la repasser.</p>
    </div>

    <!-- 2. Le verdict de chaque famille (l'essai à blanc décide ; le banc est rappelé). -->
    <div class="cm-kpis egm__familles">
      <div v-for="f in familles" :key="f.cle" class="cm-kpi" :class="f.ton">
        <span class="cm-kpi__label">{{ f.nom }}</span>
        <span class="cm-kpi__value">{{ f.valeur }}</span>
        <span class="cm-kpi__detail">{{ f.detail }}</span>
      </div>
    </div>
    <p class="egm__texte egm__normal">{{ PHRASES_DU_MODELE_DE_BUTS.pasProuveNormal }}</p>

    <!-- 3. La calibration du pronostic retenu, famille par famille. -->
    <div class="egm__groupe">
      <p class="egm__titre">
        <AppIcon name="target" :size="12" />
        <span>Ce que chaque version annonce face à ce qui arrive</span>
        <HelpTip terme="calibration" />
      </p>
      <p class="egm__petit">{{ calibration.quand }}</p>
      <ul class="egm__liste">
        <li v-for="l in calibration.lignes" :key="l.cle"><strong>{{ l.nom }}</strong> — {{ l.texte }}</li>
      </ul>
    </div>

    <!-- 4. Les régimes : d'où viennent les buts des matchs calculés à blanc. -->
    <div class="egm__groupe">
      <p class="egm__titre">
        <AppIcon name="layers" :size="12" />
        <span>Les matchs calculés à blanc, par régime</span>
      </p>
      <p class="egm__texte">{{ regimes.texte }}</p>
    </div>

    <!-- 5. La porte de l'adoption. -->
    <div class="egm__groupe">
      <p class="egm__titre">
        <AppIcon name="award" :size="12" />
        <span>La porte de l’adoption</span>
      </p>
      <p class="egm__texte">{{ porte.regle }}</p>
      <p class="egm__petit">{{ porte.etat }}</p>
      <p class="egm__petit">{{ PHRASES_DU_MODELE_DE_BUTS.temoin }}</p>
    </div>
  </div>
</template>

<style scoped>
.egm {
  container: egm / inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.egm__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
}

.egm__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.egm__petit {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.egm__titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.egm__porte1,
.egm__groupe {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--cm-border-soft);
}

.egm__liste {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

/* La réserve acceptée : ambre (« à regarder »), lisible sans la couleur (« Réserve acceptée » ouvre la phrase). */
.egm__reserve {
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--cm-radius-sm);
  border: 1px dashed rgba(var(--cm-warning-rgb) / 0.4);
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-warning);
}

.egm__familles {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.egm__familles .cm-kpi__value {
  font-size: 17px;
}

.cm-kpi.is-warn .cm-kpi__value {
  color: var(--cm-warning);
}

.cm-kpi.is-danger .cm-kpi__value {
  color: var(--cm-danger);
}

.egm__normal {
  font-weight: 600;
}
</style>
