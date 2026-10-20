<script setup>
/**
 * L'ESSAI DE LA CANDIDATE ET SON ADOPTION (étape 25 du plan, seconde moitié, 14/10/2026), dans la carte
 * « Versions du moteur » de Réglages (EngineVersionsPanel, qui lit l'état et fait les appels) :
 *   - l'essai à blanc : où il en est (matchs joués comparés, jours, l'horizon), ses premiers chiffres face à la
 *     version en service (tableau toujours là : les deux versions, l'écart au pied) ;
 *   - les DEUX verdicts, côte à côte et jamais confondus : celui de l'essai à blanc (matchs joués après la mise
 *     à blanc — LUI décide) et celui du banc d'essai (matchs passés — indicatif, avec son bouton pour le lancer) ;
 *   - l'adoption : le bouton « Adopter la candidate », actif SEULEMENT sur « retenu » ; sinon la raison écrite
 *     (pas encore jugée, pas prouvé, refusée car moins bonne, passe en cours…). La confirmation et l'appel sont
 *     faits par la carte (emit) : une seule écriture, avec la version et la candidate vues à l'écran.
 * Les mots viennent de utils/versionsMoteur.js (pur, testé). Aucun vert : rien ici n'est une value.
 */
import { computed } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import { PHRASES, etatDeLEssai, verdictDeLEssai, verdictDuBanc, phraseDuChangement, jourParis } from '@/utils/versionsMoteur.js';

const props = defineProps({
  /** L'état lu (GET /api/config/versions). */
  etat: { type: Object, default: null },
  /** Une adoption ou un lancement du banc en cours (la carte attend la réponse). */
  occupe: { type: Boolean, default: false },
  messageAdoption: { type: String, default: null },
  erreurAdoption: { type: String, default: null },
  messageBanc: { type: String, default: null },
  erreurBanc: { type: String, default: null }
});

defineEmits(['adopter', 'banc']);

const candidate = computed(() => props.etat?.candidate ?? null);
const essai = computed(() => etatDeLEssai(candidate.value));
const lignesDuTableau = computed(() =>
  essai.value?.lignes ?? [
    { nom: 'Version en service', valeur: 'pas d’essai' },
    { nom: 'Candidate', valeur: 'pas d’essai' }
  ]
);
const verdictEssai = computed(() => verdictDeLEssai(candidate.value));
const verdictBanc = computed(() => verdictDuBanc(candidate.value, props.etat?.banc ?? {}));
const statutDit = computed(() => {
  const c = candidate.value;
  if (!c) return 'aucune candidate';
  if (c.statut === 'jugee') return `jugée le ${jourParis(c.jugement?.le)}`;
  if (c.statut === 'en-essai') return `essai n° ${c.essai?.numero ?? 1} depuis le ${jourParis(c.essai?.depuis)}`;
  if (c.statut === 'autre-version') return 'la version en service a changé : l’essai recommence cette nuit';
  return 'pas encore à blanc';
});
const adoption = computed(() => props.etat?.adoption ?? null);
const adoptionPossible = computed(() => Boolean(adoption.value?.possible) && Boolean(candidate.value) && !props.occupe);
const changements = computed(() => (adoption.value?.possible ? (adoption.value.changements ?? []).map(phraseDuChangement) : []));
const texteAdoption = computed(() => {
  if (!props.etat) return 'Lecture en cours…';
  if (adoption.value?.possible) return 'Le juge la dit meilleure que la version en service : l’adopter met ses réglages en service, en une fois :';
  return adoption.value?.texte ?? 'Adoption impossible pour l’instant.';
});
const bancPossible = computed(() => Boolean(candidate.value) && !props.etat?.banc?.enCours && !props.occupe);
</script>

<template>
  <div class="ect">
    <!-- 1. L'essai à blanc : où il en est, ses premiers chiffres face à la version en service. -->
    <div class="cm-block ect__bloc">
      <div class="ect__tete">
        <span class="cm-icon-box is-info is-sm"><AppIcon name="clock" :size="14" /></span>
        <strong>Essai à blanc de la candidate</strong>
        <span class="cm-chip">{{ statutDit }}</span>
        <HelpTip terme="preuve-apres-lancement" />
      </div>
      <p class="ect__texte">{{ essai ? essai.progression : 'Aucun essai en cours : sans candidate, rien n’est calculé à blanc.' }}</p>
      <div class="cm-table-wrap">
        <table class="cm-table ect__table">
          <thead>
            <tr>
              <th class="is-left">Version</th>
              <th title="Erreur de prévision moyenne (perte log, la note du banc d’essai) : plus petite = mieux">Erreur de prévision</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lignesDuTableau" :key="l.nom">
              <td class="is-left">{{ l.nom }}</td>
              <td class="cm-numeric">{{ l.valeur }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Écart</td>
              <td class="cm-numeric">{{ essai ? essai.ecart : 'non calculé' }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="essai?.aVenir" class="ect__petit">{{ essai.aVenir }}</p>
      <p v-if="essai?.ecartees" class="ect__petit">{{ essai.ecartees }}</p>
      <p class="ect__petit">{{ PHRASES.essai }}</p>
    </div>

    <!-- 2. Les deux verdicts, jamais confondus : celui qui décide, celui qui indique. -->
    <div class="ect__verdicts">
      <div class="cm-block ect__verdict">
        <div class="ect__tete">
          <span class="cm-icon-box is-info is-sm"><AppIcon name="target" :size="14" /></span>
          <strong>Verdict de l’essai à blanc</strong>
          <span class="cm-chip is-section">décide</span>
          <span class="cm-chip" :class="verdictEssai.pastille.ton">{{ verdictEssai.pastille.texte }}</span>
          <HelpTip terme="fourchette-du-hasard" />
        </div>
        <p class="ect__texte">{{ verdictEssai.phrase }}</p>
        <p v-if="verdictEssai.details" class="ect__petit">{{ verdictEssai.details }}</p>
        <p class="ect__petit">Sur les matchs joués après sa mise à blanc, jamais sur des matchs déjà vus.</p>
      </div>
      <div class="cm-block ect__verdict">
        <div class="ect__tete">
          <span class="cm-icon-box is-muted is-sm"><AppIcon name="history" :size="14" /></span>
          <strong>Verdict du banc d’essai</strong>
          <span class="cm-chip">{{ verdictBanc.etiquette }}</span>
          <span class="cm-chip" :class="verdictBanc.pastille.ton">{{ verdictBanc.pastille.texte }}</span>
          <HelpTip terme="banc-d-essai" />
        </div>
        <p class="ect__texte">{{ verdictBanc.phrase }}</p>
        <p v-if="verdictBanc.details" class="ect__petit">{{ verdictBanc.details }}</p>
        <p class="ect__petit">{{ PHRASES.banc }}</p>
        <div class="cm-toolbar ect__actions">
          <AppButton variant="secondary" size="sm" :disabled="!bancPossible" @click="$emit('banc')">
            <template #icon><AppIcon name="refresh" :size="13" /></template>
            Passer au banc d’essai (matchs passés)
          </AppButton>
        </div>
        <p v-if="messageBanc" class="ect__texte">{{ messageBanc }}</p>
        <p v-if="erreurBanc" class="ect__texte ect__danger">{{ erreurBanc }}</p>
      </div>
    </div>

    <!-- 3. L'adoption : seulement sur « retenu », avec une confirmation (faite par la carte). -->
    <div class="cm-block ect__bloc">
      <div class="ect__tete">
        <span class="cm-icon-box is-info is-sm"><AppIcon name="award" :size="14" /></span>
        <strong>Adopter la candidate</strong>
        <HelpTip terme="variantes-essayees" />
      </div>
      <p class="ect__texte" :class="{ ect__danger: adoption?.raison === 'moins-bon' }">{{ texteAdoption }}</p>
      <ul v-if="changements.length" class="ect__changements">
        <li v-for="(c, i) in changements" :key="i">
          <strong>{{ c.titre }}</strong>
          <span>{{ c.texte }}</span>
        </li>
      </ul>
      <div class="cm-toolbar ect__actions">
        <AppButton variant="primary" size="sm" :disabled="!adoptionPossible" :loading="occupe" @click="$emit('adopter')">
          <template #icon><AppIcon name="award" :size="13" /></template>
          Adopter la candidate
        </AppButton>
      </div>
      <p v-if="messageAdoption" class="ect__texte">{{ messageAdoption }}</p>
      <p v-if="erreurAdoption" class="ect__texte ect__danger">{{ erreurAdoption }}</p>
      <p class="ect__petit">{{ PHRASES.adoption }}</p>
    </div>
  </div>
</template>

<style scoped>
.ect {
  container: ect / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ect__bloc,
.ect__verdict {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ect__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
}

.ect__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.ect__petit {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.ect__danger {
  color: var(--cm-danger);
}

.ect__table td {
  font-size: 12.5px;
}

.ect__verdicts {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

.ect__changements {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ect__changements li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.ect__changements strong {
  color: var(--cm-text-primary);
}

.ect__actions {
  align-items: center;
  flex-wrap: wrap;
}

@container ect (min-width: 720px) {
  .ect__verdicts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
