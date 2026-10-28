<script setup>
/**
 * « PROPOSER UNE CORRECTION » (étape 26 du plan, partie E, 28/10/2026) — le formulaire de Pierre, dans le bloc des
 * corrections de Santé du moteur. AFFICHAGE PUR : il émet `proposer` ({ levier, valeur, phrase } et les mots de la
 * confirmation) et `annuler` ; EngineHealthView confirme (window.confirm), appelle POST /api/corrections/proposer et
 * relit ; l'erreur du serveur s'affiche dans le bloc, en mots.
 *
 * Les réglages proposables viennent du serveur (`formulaire.leviers` : les sous-clés du modèle de buts unique, leurs
 * bornes, leur pas, leur valeur en service, et la raison quand l'un d'eux est fermé) ; le formulaire entier est FERMÉ
 * pendant l'essai du modèle de buts de l'étape 27 (le bloc le dit avec sa raison et n'ouvre pas ce formulaire). Une
 * liste dessinée (AppSelect), jamais une liste native ; un champ de nombre borné ; une phrase facultative (300 caractères
 * au plus, le compteur le dit) ; les réglages de pari ne passent pas par ici (la phrase du serveur le dit).
 */
import { computed, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppTextarea from '@/components/common/AppTextarea.vue';
import { optionsDesReglages, bornesDites, problemeDeLaValeur, nombreDit, MARCHES_DU_MODELE, PHRASE_MAX } from '@/utils/corrections.js';

const props = defineProps({
  /** `formulaire` de GET /api/engine-health (bloc des corrections) : { ouvert, raison, leviers, reglagesDePari }. */
  formulaire: { type: Object, required: true },
  /** La proposition part : le bouton attend. */
  occupe: { type: Boolean, default: false }
});
const emit = defineEmits(['proposer', 'annuler']);

const leviers = computed(() => props.formulaire?.leviers ?? []);
const options = computed(() => optionsDesReglages(props.formulaire));
const premier = leviers.value.find((l) => l.ouvert) ?? leviers.value[0] ?? null;
const levier = ref(premier?.cle ?? null);
const valeur = ref(premier?.valeur ?? null);
const phrase = ref('');
const touche = ref(false);
watch(levier, (cle) => {
  valeur.value = leviers.value.find((l) => l.cle === cle)?.valeur ?? null;
  touche.value = false;
});

const choisi = computed(() => leviers.value.find((l) => l.cle === levier.value) ?? null);
const bornes = computed(() => (choisi.value ? bornesDites(choisi.value) : ''));
const probleme = computed(() => problemeDeLaValeur(choisi.value, valeur.value));
const peutProposer = computed(() => Boolean(choisi.value?.ouvert) && !probleme.value && phrase.value.length <= PHRASE_MAX && !props.occupe);

/** La nouvelle valeur écrite comme la valeur en service (« 28 % » pour une part, « −0,02 » pour la corrélation). */
const apresDit = computed(() => {
  const l = choisi.value;
  const v = valeur.value;
  if (!l || typeof v !== 'number' || !Number.isFinite(v)) return '?';
  if (typeof l.valeurDite === 'string' && l.valeurDite.trim().endsWith('%')) return `${nombreDit(v * 100, Number.isInteger(Math.round(v * 1000) / 10) ? 0 : 1)} %`;
  return nombreDit(v, l.pas < 1 ? Math.max(0, Math.ceil(-Math.log10(l.pas) - 1e-9)) : 0);
});

function proposer() {
  touche.value = true;
  if (!peutProposer.value) return;
  emit('proposer', { levier: choisi.value.cle, valeur: valeur.value, phrase: phrase.value.trim() || null, libelle: choisi.value.libelle, avantDit: choisi.value.valeurDite ?? '?', apresDit: apresDit.value });
}
</script>

<template>
  <form class="corrform" data-partie="formulaire" @submit.prevent="proposer">
    <p class="corrform__texte">
      Une correction change UN réglage du modèle de buts, un peu. Elle sera d’abord mesurée au banc d’essai (c’est vous qui lancez la mesure), puis, si vous l’acceptez, essayée à blanc. Rien ne change dans vos chiffres sans votre clic « Adopter » dans Réglages.
    </p>
    <div class="cm-grid-2 corrform__champs">
      <AppSelect v-model="levier" label="Réglage" :options="options" />
      <AppNumberField v-model="valeur" label="Nouvelle valeur" :min="choisi?.min" :max="choisi?.max" :step="choisi?.pas ?? 0.01" :hint="bornes" />
    </div>
    <p class="corrform__petit">
      Valeur en service : <strong>{{ choisi?.valeurDite ?? '–' }}</strong> → proposée : <strong>{{ apresDit }}</strong> · marchés touchés : {{ MARCHES_DU_MODELE }}.
    </p>
    <p v-if="choisi && !choisi.ouvert" class="cm-note is-warning corrform__note">
      <AppIcon name="alert" :size="13" />
      <span class="cm-note__text">Ce réglage ne peut pas être proposé maintenant : {{ choisi.raison }}</span>
    </p>
    <AppTextarea v-model="phrase" label="Pourquoi (facultatif)" :rows="2" placeholder="Une phrase pour le journal" />
    <p class="corrform__petit" :class="{ 'corrform__petit--trop': phrase.length > PHRASE_MAX }">{{ phrase.length }} / {{ PHRASE_MAX }} caractères</p>
    <p v-if="touche && probleme" class="cm-note is-danger corrform__note">
      <span class="cm-note__text">{{ probleme }}</span>
    </p>
    <div class="cm-toolbar corrform__actions">
      <AppButton type="submit" variant="primary" size="sm" :disabled="!peutProposer" :loading="occupe">
        <template #icon><AppIcon name="check" :size="13" /></template>
        Proposer
      </AppButton>
      <AppButton variant="ghost" size="sm" @click="emit('annuler')">Annuler</AppButton>
    </div>
  </form>
</template>

<style scoped>
.corrform {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
}

.corrform__texte,
.corrform__petit {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.corrform__petit {
  font-size: 12px;
  color: var(--cm-text-muted);
}

.corrform__petit--trop {
  color: var(--cm-danger);
}

.corrform__champs {
  gap: 12px 16px;
}

.corrform__note {
  margin: 0;
}

.corrform__actions {
  flex-wrap: wrap;
  gap: 8px;
}
</style>
