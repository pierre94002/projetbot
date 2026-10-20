<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import { useRisqueStore } from '@/stores/risqueStore.js';
import { LIMITATIONS, euros, jourDit, montantSaisi } from '@/utils/gardeFous.js';

/**
 * UNE FICHE PAR COMPTE BOOKMAKER (étape 11 du plan, 06/10/2026), carte
 * « Comptes bookmakers » de Réglages : pour chacun de VOS bookmakers (cochés
 * dans les paramètres du moteur), ce que vous savez de votre compte — le solde
 * déclaré, la mise maximale acceptée connue, une limitation éventuelle — et la
 * date de mise à jour. L'appli s'en sert pour SIGNALER un pari au-delà de la
 * mise acceptée (ticket, réponse de « J'ai parié », carnet de Performance
 * paris), jamais pour le refuser ni pour agir sur le compte.
 * Un réglage NON SECRET : aucun identifiant, aucun mot de passe, aucune note
 * libre — le serveur refuse tout autre champ (PUT /api/bookmaker-accounts/:cle).
 */
const risque = useRisqueStore();
const d = computed(() => risque.comptes);
const lignes = computed(() => d.value?.bookmakers ?? []);
const OPTIONS = Object.entries(LIMITATIONS).map(([value, label]) => ({ value, label }));

/** Un brouillon par bookmaker, qui suit la fiche enregistrée tant qu'on n'y a pas touché. */
const brouillons = reactive({});
const touches = reactive({});
const etats = reactive({});
const ficheVers = (f) => ({ soldeDeclare: f?.soldeDeclare ?? null, miseMaxAcceptee: f?.miseMaxAcceptee ?? null, limitation: f?.limitation ?? 'aucune' });
watch(
  lignes,
  (liste) => {
    for (const b of liste) {
      if (!touches[b.cle]) brouillons[b.cle] = ficheVers(b.fiche);
    }
  },
  { immediate: true }
);

function modifier(cle, champ, valeur) {
  brouillons[cle] = { ...brouillons[cle], [champ]: champ === 'limitation' ? valeur : montantSaisi(valeur) };
  touches[cle] = true;
  etats[cle] = { loading: false, error: null, message: '' };
}
const differe = (b) => {
  const f = ficheVers(b.fiche);
  const x = brouillons[b.cle] ?? f;
  return x.soldeDeclare !== f.soldeDeclare || x.miseMaxAcceptee !== f.miseMaxAcceptee || x.limitation !== f.limitation;
};

async function enregistrer(b) {
  etats[b.cle] = { loading: true, error: null, message: '' };
  try {
    const r = await risque.enregistrerCompte(b.cle, brouillons[b.cle]);
    touches[b.cle] = false;
    brouillons[b.cle] = ficheVers(r.enregistre?.fiche);
    etats[b.cle] = { loading: false, error: null, message: r.enregistre?.ecrit ? 'Enregistré.' : 'Rien à changer.' };
  } catch (error) {
    etats[b.cle] = { loading: false, error: error.message, message: '' };
  }
}

/** Ce que dit une fiche, en une ligne. */
function resume(f) {
  if (!f) return 'Pas de fiche : rien de connu sur ce compte.';
  const morceaux = [`Solde déclaré : ${f.soldeDeclare === null ? 'non connu' : euros(f.soldeDeclare)}`, `mise acceptée : ${f.miseMaxAcceptee === null ? 'non connue' : euros(f.miseMaxAcceptee)}`, LIMITATIONS[f.limitation] ?? f.limitation];
  return `${morceaux.join(' · ')} — mise à jour le ${jourDit(f.majLe)}.`;
}
const chargement = ref(true);
onMounted(async () => {
  await risque.charger({ force: true });
  chargement.value = false;
});
</script>

<template>
  <div class="comptes">
    <div class="cm-note is-info">
      <span class="cm-icon-box is-info is-sm"><AppIcon name="lock" :size="14" /></span>
      <div>
        <p class="cm-note__title">Jamais d'identifiant ni de mot de passe</p>
        <p class="cm-note__text">
          Chaque fiche ne garde que trois choses que vous tapez vous-même : le solde déclaré, la mise maximale que le bookmaker accepte (si vous la connaissez)
          et une limitation éventuelle, avec la date de mise à jour. L'appli s'en sert pour signaler un pari au-delà de la mise acceptée, jamais pour le refuser
          ni pour agir sur votre compte.
        </p>
      </div>
    </div>

    <LoadingSpinner v-if="chargement && !d" label="Lecture des fiches…" />
    <div v-if="risque.erreur && !d" class="cm-note is-danger">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="x" :size="14" /></span>
      <div>
        <p class="cm-note__title">{{ /illisible/i.test(risque.erreur) ? 'Fiches illisibles' : 'Fiches non lues' }}</p>
        <p class="cm-note__text">{{ risque.erreur }}</p>
      </div>
    </div>

    <ul class="comptes__liste">
      <li v-for="b in lignes" :key="b.cle" class="comptes__fiche cm-block" :class="{ 'is-ferme': b.fiche?.limitation === 'ferme' }">
        <div class="comptes__tete">
          <strong class="comptes__nom">{{ b.titre }}</strong>
          <span v-if="b.fiche?.limitation === 'ferme'" class="cm-chip is-danger"><AppIcon name="lock" :size="11" />Compte fermé</span>
          <span v-else-if="b.fiche?.limitation === 'limite'" class="cm-chip is-warning"><AppIcon name="alert" :size="11" />Compte limité</span>
          <span class="comptes__resume">{{ resume(b.fiche) }}</span>
        </div>
        <div class="cm-toolbar comptes__champs">
          <AppNumberField
            :model-value="brouillons[b.cle]?.soldeDeclare ?? null"
            class="comptes__champ"
            label="Solde déclaré"
            :min="0"
            :step="10"
            suffix="€"
            hint="Vide : non connu"
            @update:model-value="(v) => modifier(b.cle, 'soldeDeclare', v)"
          />
          <AppNumberField
            :model-value="brouillons[b.cle]?.miseMaxAcceptee ?? null"
            class="comptes__champ"
            label="Mise maximale acceptée"
            :min="0.01"
            :step="1"
            suffix="€"
            hint="Vide : non connue"
            @update:model-value="(v) => modifier(b.cle, 'miseMaxAcceptee', v)"
          />
          <AppSelect
            :model-value="brouillons[b.cle]?.limitation ?? 'aucune'"
            class="comptes__champ"
            label="Limitation"
            :options="OPTIONS"
            @update:model-value="(v) => modifier(b.cle, 'limitation', v)"
          />
          <AppButton variant="section" size="sm" :loading="etats[b.cle]?.loading ?? false" :disabled="!differe(b)" @click="enregistrer(b)">
            <template #icon><AppIcon name="check" :size="13" /></template>
            Enregistrer
          </AppButton>
        </div>
        <p v-if="etats[b.cle]?.message" class="comptes__petit">{{ etats[b.cle].message }}</p>
        <p v-if="etats[b.cle]?.error" class="comptes__petit comptes__petit--danger">{{ etats[b.cle].error }}</p>
      </li>
    </ul>
    <p v-if="d" class="comptes__petit">
      Vos bookmakers : ceux cochés dans Réglages › Paramètres du moteur. Fiches enregistrées dans {{ d.fichier }}<template v-if="d.champsIgnores">
        — {{ d.champsIgnores }} champ{{ d.champsIgnores > 1 ? 's' : '' }} inconnu{{ d.champsIgnores > 1 ? 's' : '' }} du fichier ignoré{{ d.champsIgnores > 1 ? 's' : '' }} (jamais montré{{ d.champsIgnores > 1 ? 's' : '' }}, effacé{{ d.champsIgnores > 1 ? 's' : '' }} au prochain enregistrement)</template>.
    </p>
  </div>
</template>

<style scoped>
.comptes {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.comptes__liste {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.comptes__fiche {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.comptes__fiche.is-ferme {
  border-color: rgba(var(--cm-danger-rgb) / 0.35);
}

.comptes__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.comptes__nom {
  font-size: 13.5px;
  color: var(--cm-text-primary);
}

.comptes__resume {
  flex: 1 1 260px;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.comptes__champs {
  align-items: flex-end;
}

.comptes__champ {
  flex: 1 1 160px;
  max-width: 230px;
}

.comptes__petit {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.comptes__petit--danger {
  color: var(--cm-danger);
}
</style>
