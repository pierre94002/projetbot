<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import { useRisqueStore } from '@/stores/risqueStore.js';
import { MOTS_DE_LA_MISE, capitalDit, provenanceDuCapital, eurosDuCapital, jourCourt } from '@/utils/miseAffichee.js';

/**
 * VOTRE CAPITAL (étape 39 « La mise juste », lot 1a, 04/11/2026), dans la carte « Gestion du risque » de Réglages, sous le
 * coupe-circuit : l'argent réservé aux paris, le jour où il vaut ce montant, s'il suit vos paris enregistrés, et le
 * plancher facultatif (« jamais plus bas que … € sous mon plus haut » : vide = rien). C'est la SEULE base des euros de la
 * mise conseillée : sans lui, la mise se dit en part du capital, aucun euro, et le ticket « J'ai parié » reste vide.
 * Lu et écrit par le store du risque (GET / PUT / DELETE /api/config/capital) — jamais un mot de passe ni un numéro de compte.
 * « Vos comptes déclarent … € » : la somme des soldes déclarés de vos fiches, rapportée à côté, jamais mélangée.
 */
const risque = useRisqueStore();
const formulaire = reactive({ montant: null, le: '', suitLeCarnet: true, plancher: null });
const touche = ref(false);
const enregistrement = ref({ loading: false, error: null, message: '' });

const d = computed(() => risque.capital);
const reglage = computed(() => d.value?.reglage ?? null);
const moment = computed(() => d.value?.moment ?? null);
const soldes = computed(() => d.value?.soldesDeclares ?? null);

/** Le formulaire suit le réglage en vigueur tant que rien n'a été touché. */
watch(
  reglage,
  (r) => {
    if (touche.value) return;
    formulaire.montant = r?.montant ?? null;
    formulaire.le = r?.le ?? '';
    formulaire.suitLeCarnet = r ? r.suitLeCarnet !== false : true;
    formulaire.plancher = r?.plancher ?? null;
  },
  { immediate: true }
);

function modifier(champ, valeur) {
  formulaire[champ] = valeur === '' || valeur === undefined ? null : valeur;
  touche.value = true;
  enregistrement.value = { loading: false, error: null, message: '' };
}

const aEnregistrer = computed(() => {
  if (!(Number(formulaire.montant) > 0)) return false;
  const r = reglage.value;
  if (!r) return true;
  return Number(formulaire.montant) !== r.montant || (formulaire.le || r.le) !== r.le || formulaire.suitLeCarnet !== r.suitLeCarnet || (formulaire.plancher ?? null) !== (r.plancher ?? null);
});

async function enregistrer() {
  enregistrement.value = { loading: true, error: null, message: '' };
  try {
    const corps = { montant: Number(formulaire.montant), suitLeCarnet: Boolean(formulaire.suitLeCarnet), plancher: formulaire.plancher === null ? null : Number(formulaire.plancher) };
    if (formulaire.le) corps.le = formulaire.le;
    const r = await risque.enregistrerCapital(corps);
    touche.value = false;
    enregistrement.value = { loading: false, error: null, message: r.ecrit ? 'Capital enregistré.' : 'Rien à changer : ce capital est déjà enregistré.' };
  } catch (error) {
    enregistrement.value = { loading: false, error: error.message, message: '' };
  }
}

async function retirer() {
  enregistrement.value = { loading: true, error: null, message: '' };
  try {
    await risque.retirerCapital();
    touche.value = false;
    enregistrement.value = { loading: false, error: null, message: 'Capital retiré : la mise se dit désormais en part du capital, sans euros.' };
  } catch (error) {
    enregistrement.value = { loading: false, error: error.message, message: '' };
  }
}

const capitalDuMoment = computed(() => capitalDit(moment.value));
const detailDuMoment = computed(() => (moment.value?.indique ? provenanceDuCapital(moment.value) : MOTS_DE_LA_MISE.capitalNonIndique));
const comptesDits = computed(() => {
  const s = soldes.value;
  if (!s) return 'Soldes de vos comptes non lus.';
  if (!s.comptes) return 'Aucun solde déclaré dans vos fiches de comptes (Réglages › Comptes bookmakers).';
  return `Vos comptes déclarent ${eurosDuCapital(s.total)} (${s.comptes} fiche${s.comptes > 1 ? 's' : ''}) : rapporté à côté, jamais mélangé au capital.`;
});
const plancherDit = computed(() => {
  const m = moment.value;
  if (!m?.indique || !(m.plancher > 0)) return 'Aucun plancher : rien ne s’applique (vide = rien).';
  return `Plancher : jamais plus bas que ${eurosDuCapital(m.plancher)} sous votre plus haut (${eurosDuCapital(m.plusHaut)}) — montré en gris sous la mise conseillée, sans changer le conseil pour l’instant.`;
});

onMounted(() => {
  risque.charger({ force: true });
});
</script>

<template>
  <div class="capital" data-mise="capital-panel">
    <h4 class="cm-group-title capital__titre">
      <AppIcon name="wallet" :size="14" />
      Votre capital réservé aux paris
    </h4>
    <LoadingSpinner v-if="!d && !risque.erreur" label="Lecture du capital…" />

    <div class="capital__moment cm-block">
      <p class="capital__montant cm-numeric">{{ capitalDuMoment }}</p>
      <p class="capital__petit">{{ detailDuMoment }}</p>
      <p v-if="reglage" class="capital__petit">Réglé à {{ eurosDuCapital(reglage.montant) }} le {{ jourCourt(reglage.le) }} · suit mes paris enregistrés : {{ reglage.suitLeCarnet ? 'oui' : 'non' }}</p>
      <p class="capital__petit">{{ comptesDits }}</p>
    </div>

    <p class="capital__texte">
      La mise conseillée se dit en <strong>part de votre capital</strong> (1/8 de Kelly, 2 % au plus) ; ses <strong>euros</strong> n'existent que sur le
      capital réglé ici, et le ticket « J'ai parié » n'est pré-rempli qu'avec eux. Rien n'est engagé : c'est votre chiffre.
    </p>

    <div class="cm-toolbar capital__champs">
      <AppNumberField :model-value="formulaire.montant" class="capital__champ" label="Capital réservé aux paris" :min="1" :step="10" suffix="€" hint="Vide : capital non indiqué" @update:model-value="(v) => modifier('montant', v)" />
      <label class="capital__date">
        <span class="capital__date-label">Réglé le</span>
        <input type="date" class="capital__date-champ" :value="formulaire.le" @input="(e) => modifier('le', e.target.value)" />
        <span class="capital__petit">Vide : aujourd'hui</span>
      </label>
      <AppNumberField
        :model-value="formulaire.plancher"
        class="capital__champ"
        label="Jamais plus bas que … sous mon plus haut"
        :min="1"
        :step="10"
        suffix="€"
        hint="Vide : rien (aucun plancher)"
        @update:model-value="(v) => modifier('plancher', v)"
      />
    </div>
    <label class="capital__suit">
      <input type="checkbox" :checked="formulaire.suitLeCarnet" @change="(e) => modifier('suitLeCarnet', e.target.checked)" />
      <span>Suit mes paris enregistrés (le capital du moment = ce montant + les gains et pertes de vos paris réglés depuis ce jour)</span>
    </label>
    <p class="capital__petit">{{ plancherDit }}</p>

    <div class="capital__actions">
      <span class="capital__petit">{{ enregistrement.message }}</span>
      <AppButton v-if="reglage" variant="ghost" size="sm" :loading="enregistrement.loading" @click="retirer">
        <template #icon><AppIcon name="x" :size="13" /></template>
        Retirer le capital
      </AppButton>
      <AppButton variant="section" size="sm" :loading="enregistrement.loading" :disabled="!aEnregistrer" @click="enregistrer">
        <template #icon><AppIcon name="check" :size="13" /></template>
        Enregistrer
      </AppButton>
    </div>
    <div v-if="enregistrement.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="x" :size="14" /></span>
      <div>
        <p class="cm-note__title">Capital non enregistré</p>
        <p class="cm-note__text">{{ enregistrement.error }}</p>
      </div>
    </div>

    <p class="capital__petit capital__phrase" data-mise="non-enregistres">{{ MOTS_DE_LA_MISE.nonEnregistres }}</p>
  </div>
</template>

<style scoped>
.capital {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.capital__titre {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.capital__moment {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.capital__montant {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--cm-text-primary);
}

.capital__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.capital__champs {
  align-items: flex-start;
  flex-wrap: wrap;
}

.capital__champ {
  flex: 1 1 180px;
  max-width: 260px;
}

.capital__date {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 0 1 170px;
}

.capital__date-label {
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.capital__date-champ {
  padding: 7px 9px;
  border: 1px solid var(--cm-border);
  border-radius: var(--cm-radius-sm);
  background: var(--cm-surface);
  color: var(--cm-text-primary);
  font: inherit;
}

.capital__suit {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.capital__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 10px;
}

.capital__actions .capital__petit {
  flex: 1 1 220px;
}

.capital__petit {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.capital__phrase {
  font-style: italic;
}
</style>
