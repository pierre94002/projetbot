<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import { useRisqueStore } from '@/stores/risqueStore.js';
import { euros, jourDit, montantSaisi } from '@/utils/gardeFous.js';
import { phrasesDesSeries } from '@/utils/suiviParis.js';

/**
 * LES GARDE-FOUS DE PIERRE (étape 11 du plan, 06/10/2026), dans la carte
 * « Gestion du risque » de Réglages, sous le coupe-circuit qu'ils enclenchent :
 *   - la MISE MAXIMALE PAR PARI : le conseil de mise du moteur ne la dépasse
 *     jamais (ramené au plafond, et dit) ;
 *   - la PERTE MAXIMALE PAR SEMAINE (lundi → dimanche) : atteinte — ou
 *     engagée, mises en attente comprises —, plus aucun conseil de mise.
 * Aucun par défaut : champ vide = pas de plafond. Ils ne bloquent JAMAIS
 * l'enregistrement d'un pari ; ils bloquent le conseil et alertent (ici, en
 * haut de l'appli, dans Performance paris, dans le ticket).
 * Lit et écrit par le store du risque (GET/PUT /api/config/garde-fous).
 */
const emit = defineEmits(['enregistre']);
const risque = useRisqueStore();

const formulaire = reactive({ miseMaxParPari: null, perteMaxParSemaine: null });
const touche = ref(false);
const enregistrement = ref({ loading: false, error: null, message: '' });

const d = computed(() => risque.gardeFous);
const reglage = computed(() => d.value?.reglage ?? null);
const etat = computed(() => d.value?.etat ?? null);
const series = computed(() => d.value?.series ?? null);
const phrasesSeries = computed(() => phrasesDesSeries(series.value));

/** Le formulaire suit le réglage en vigueur tant que rien n'a été touché. */
watch(
  reglage,
  (r) => {
    if (!r || touche.value) return;
    formulaire.miseMaxParPari = r.miseMaxParPari;
    formulaire.perteMaxParSemaine = r.perteMaxParSemaine;
  },
  { immediate: true }
);

function modifier(champ, valeur) {
  formulaire[champ] = montantSaisi(valeur);
  touche.value = true;
  enregistrement.value = { loading: false, error: null, message: '' };
}

const aEnregistrer = computed(() => Boolean(reglage.value) && (formulaire.miseMaxParPari !== reglage.value.miseMaxParPari || formulaire.perteMaxParSemaine !== reglage.value.perteMaxParSemaine));

async function enregistrer(changement = { miseMaxParPari: formulaire.miseMaxParPari, perteMaxParSemaine: formulaire.perteMaxParSemaine }) {
  enregistrement.value = { loading: true, error: null, message: '' };
  try {
    const r = await risque.enregistrerGardeFous(changement);
    touche.value = false;
    formulaire.miseMaxParPari = r.reglage.miseMaxParPari;
    formulaire.perteMaxParSemaine = r.reglage.perteMaxParSemaine;
    enregistrement.value = { loading: false, error: null, message: r.ecrit ? `Enregistré dans ${r.fichier}.` : 'Rien à changer : ces plafonds sont déjà enregistrés.' };
    emit('enregistre', r);
  } catch (error) {
    enregistrement.value = { loading: false, error: error.message, message: '' };
  }
}
const aucunPlafond = computed(() => reglage.value && reglage.value.miseMaxParPari === null && reglage.value.perteMaxParSemaine === null);

const plafondDit = (x) => (x === null || x === undefined ? 'aucun plafond' : euros(x));
const provenance = computed(() => {
  const r = d.value;
  if (!r) return 'Réglage non lu.';
  if (r.source === 'enregistre') return `Fixés dans cet écran${r.majLe ? ` le ${jourDit(r.majLe)}` : ''} ; enregistrés dans ${r.fichier}.`;
  return `Aucun plafond réglé (valeur par défaut) : c'est vous qui les fixez. Fichier : ${r.fichier}.`;
});
const parDit = (par) => (par === 'mise-max' ? 'votre mise maximale par pari' : 'ce qui reste avant la perte maximale de la semaine');

onMounted(() => {
  risque.charger({ force: true });
});
</script>

<template>
  <div class="gfous">
    <h4 class="cm-group-title gfous__titre">
      Garde-fous
      <HelpTip terme="series-de-pertes" />
    </h4>
    <LoadingSpinner v-if="!d && !risque.erreur" label="Lecture des garde-fous…" />
    <!-- Un fichier illisible (prudence : plus de conseil) n'est pas un serveur pas encore relancé (rien n'a changé pour le moteur). -->
    <div v-if="risque.erreur && !d" class="cm-note is-danger">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="x" :size="14" /></span>
      <div>
        <p class="cm-note__title">{{ /illisible/i.test(risque.erreur) ? 'Garde-fous illisibles' : 'Garde-fous non lus' }}</p>
        <p class="cm-note__text">
          {{ risque.erreur }}{{ /illisible/i.test(risque.erreur) ? " — tant qu'un plafond réglé ne peut pas être vérifié, le moteur ne conseille aucune mise." : '' }}
        </p>
      </div>
    </div>

    <p class="gfous__texte">
      Le moteur ne conseille jamais une mise au-delà de la <strong>mise maximale par pari</strong>, et plus aucune une fois la <strong>perte maximale de la
      semaine</strong> atteinte (du lundi au dimanche, mises en attente comprises) : le coupe-circuit ci-dessus s'enclenche alors de lui-même. Vos paris
      s'enregistrent toujours — un garde-fou bloque le conseil et alerte, jamais un pari. Champ vide : pas de plafond.
    </p>

    <div class="cm-toolbar gfous__champs">
      <AppNumberField
        :model-value="formulaire.miseMaxParPari"
        class="gfous__champ"
        label="Mise maximale par pari"
        :min="0.5"
        :step="1"
        suffix="€"
        hint="Vide : aucun plafond"
        @update:model-value="(v) => modifier('miseMaxParPari', v)"
      />
      <AppNumberField
        :model-value="formulaire.perteMaxParSemaine"
        class="gfous__champ"
        label="Perte maximale par semaine"
        :min="1"
        :step="10"
        suffix="€"
        hint="Du lundi au dimanche ; vide : aucun plafond"
        @update:model-value="(v) => modifier('perteMaxParSemaine', v)"
      />
    </div>
    <div class="gfous__actions">
      <span class="gfous__petit">{{ enregistrement.message || provenance }}</span>
      <AppButton v-if="reglage && !aucunPlafond" variant="ghost" size="sm" :loading="enregistrement.loading" @click="enregistrer({ miseMaxParPari: null, perteMaxParSemaine: null })">
        <template #icon><AppIcon name="x" :size="13" /></template>
        Retirer les plafonds
      </AppButton>
      <AppButton variant="section" size="sm" :loading="enregistrement.loading" :disabled="!aEnregistrer" @click="enregistrer()">
        <template #icon><AppIcon name="check" :size="13" /></template>
        Enregistrer
      </AppButton>
    </div>
    <div v-if="enregistrement.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="x" :size="14" /></span>
      <div>
        <p class="cm-note__title">Garde-fous non enregistrés</p>
        <p class="cm-note__text">{{ enregistrement.error }}</p>
      </div>
    </div>

    <!-- L'état du moment : la semaine, sa perte, l'argent en attente, ce qui reste, le plafond du conseil. -->
    <div class="cm-kpis gfous__kpis">
      <div class="cm-kpi">
        <span class="cm-kpi__label">Perte de la semaine</span>
        <span class="cm-kpi__value cm-numeric">{{ etat ? euros(etat.perteSemaine) : '—' }}</span>
        <span class="cm-kpi__detail">{{ etat ? `du lundi ${jourDit(etat.semaine.du)} au dimanche ${jourDit(etat.semaine.au)} · plafond : ${plafondDit(reglage?.perteMaxParSemaine)}` : 'état non lu' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Mises en attente</span>
        <span class="cm-kpi__value cm-numeric">{{ etat ? euros(etat.misesEnAttente) : '—' }}</span>
        <span class="cm-kpi__detail">{{ etat ? `${etat.parisEnAttente} pari${etat.parisEnAttente > 1 ? 's' : ''} pas encore réglé${etat.parisEnAttente > 1 ? 's' : ''}` : 'état non lu' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Reste avant le plafond</span>
        <span class="cm-kpi__value cm-numeric">{{ etat?.resteSemaine === null || etat?.resteSemaine === undefined ? '—' : euros(Math.max(0, etat.resteSemaine)) }}</span>
        <span class="cm-kpi__detail">{{ etat?.resteSemaine === null || etat?.resteSemaine === undefined ? 'pas de perte maximale réglée' : 'perte maximale − perte de la semaine − mises en attente' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Conseil de mise</span>
        <span class="cm-kpi__value cm-numeric">{{ etat?.bloque ? 'suspendu' : etat?.plafondDeMise ? `≤ ${euros(etat.plafondDeMise.montant)}` : 'sans plafond' }}</span>
        <span class="cm-kpi__detail">{{ etat?.bloque ? 'perte maximale de la semaine' : etat?.plafondDeMise ? parDit(etat.plafondDeMise.par) : 'Kelly fractionné du moteur, tel quel' }}</span>
      </div>
    </div>

    <ul v-if="etat?.alertes?.length" class="gfous__alertes">
      <li v-for="a in etat.alertes" :key="a.code" class="cm-note" :class="a.niveau === 'danger' ? 'is-danger' : 'is-warning'">
        <span class="cm-icon-box is-sm" :class="a.niveau === 'danger' ? 'is-danger' : 'is-warning'"><AppIcon name="alert" :size="14" /></span>
        <p class="cm-note__text">{{ a.texte }}</p>
      </li>
    </ul>
    <p v-else-if="etat" class="gfous__petit">Aucune alerte : aucun plafond atteint, aucune série de pertes hors de sa zone normale.</p>

    <div v-if="series" class="gfous__series cm-block">
      <p class="gfous__petit"><strong>{{ phrasesSeries.zone }}</strong></p>
      <p v-if="phrasesSeries.enCours" class="gfous__petit">{{ phrasesSeries.enCours }}</p>
      <p v-if="phrasesSeries.plusLongue" class="gfous__petit">{{ phrasesSeries.plusLongue }}</p>
      <p class="gfous__petit">La bande et le détail : Historique moteur › Performance paris.</p>
    </div>
    <p v-if="d?.probleme" class="gfous__petit gfous__petit--warning">{{ d.probleme }}</p>
  </div>
</template>

<style scoped>
.gfous {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 6px;
  padding-top: 14px;
  border-top: 1px solid var(--cm-border-soft);
}

.gfous__titre {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.gfous__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.gfous__champs {
  align-items: flex-start;
}

.gfous__champ {
  flex: 1 1 180px;
  max-width: 260px;
}

.gfous__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px 10px;
}

.gfous__actions .gfous__petit {
  flex: 1 1 220px;
}

.gfous__petit {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.gfous__petit strong {
  color: var(--cm-text-secondary);
}

.gfous__petit--warning {
  color: var(--cm-warning);
}

.gfous__kpis {
  margin-top: 2px;
}

.gfous__alertes {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.gfous__series {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
</style>
