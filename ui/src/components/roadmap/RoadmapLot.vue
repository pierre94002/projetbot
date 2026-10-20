<script setup>
/**
 * Un lot de la feuille de route (étape 5 du plan) : dépliable, avec son objectif
 * chiffré en une phrase, ses étapes (RoadmapStep) et, au pied, la place de son
 * bilan de fin de lot — ce qu'on garde, ce qu'on saute, ce qu'on réordonne —,
 * vide tant que le bilan n'est pas fait avec Pierre.
 *
 * Tout vient de GET /api/roadmap ; ce composant n'écrit rien lui-même (les notes
 * s'enregistrent dans RoadmapStep et remontent par `enregistre`).
 */
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import CollapsibleSection from '@/components/common/CollapsibleSection.vue';
import RoadmapStep from './RoadmapStep.vue';

const props = defineProps({
  lot: { type: Object, required: true },
  reglages: { type: Array, default: () => [] },
  longueurMax: { type: Number, default: 4000 },
  notesEcrivables: { type: Boolean, default: true },
  semaineCourante: { type: Number, default: 0 },
  /** Ouvert au premier affichage (un lot où l'on travaille cette semaine). */
  ouvert: { type: Boolean, default: false }
});

const emit = defineEmits(['enregistre']);

const jourCourt = (j) => (j ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(new Date(`${j}T12:00:00`)) : '');

const semaines = computed(() => {
  const { debut, fin } = props.lot.semaines;
  return debut === fin ? `semaine ${debut}` : `semaines ${debut} à ${fin}`;
});
const part = computed(() => (props.lot.total ? props.lot.terminees / props.lot.total : 0));
const largeur = computed(() => `${Math.round(part.value * 1000) / 10}%`);
const sousTitre = computed(() => {
  const l = props.lot;
  const morceaux = [`${l.total} étape${l.total > 1 ? 's' : ''}`, semaines.value];
  if (l.enCours) morceaux.push(`${l.enCours} en cours`);
  if (l.miseDeCote) morceaux.push(`${l.miseDeCote} mise${l.miseDeCote > 1 ? 's' : ''} de côté`);
  return morceaux.join(' · ');
});

const bilan = computed(() => props.lot.bilan);
const listes = computed(() =>
  bilan.value
    ? [
        { cle: 'garder', libelle: 'On garde', items: bilan.value.garder ?? [] },
        { cle: 'sauter', libelle: 'On saute', items: bilan.value.sauter ?? [] },
        { cle: 'reordonner', libelle: 'On réordonne', items: bilan.value.reordonner ?? [] }
      ]
    : []
);
</script>

<template>
  <AppCard class="rlot" :class="{ 'is-termine': lot.termine }" :data-lot="lot.numero" :padded="false">
    <CollapsibleSection class="rlot__interieur" :default-open="ouvert">
      <template #header>
        <div class="rlot__tete">
          <span class="rlot__num cm-numeric">{{ lot.numero }}</span>
          <div class="rlot__titres">
            <h3 class="rlot__nom">Lot {{ lot.numero }} — {{ lot.nom }}</h3>
            <p class="rlot__sous">{{ sousTitre }}</p>
          </div>
          <div class="rlot__avance">
            <span v-if="lot.termine" class="cm-chip is-accent">
              <AppIcon name="check" :size="11" />
              Lot terminé
            </span>
            <span class="cm-pill rlot__compte" :class="{ 'is-accent': lot.termine, 'is-section': !lot.termine && lot.terminees > 0 }" :title="`${lot.terminees} étape(s) terminée(s) sur ${lot.total}`">
              {{ lot.terminees }} / {{ lot.total }}
            </span>
            <span class="cm-bar rlot__barre" aria-hidden="true">
              <span class="cm-bar__fill" :class="{ 'rlot__remplissage--fini': lot.termine }" :style="{ width: largeur }" />
            </span>
          </div>
        </div>
      </template>

      <div class="rlot__corps">
        <div class="cm-note">
          <span class="cm-icon-box"><AppIcon name="target" :size="16" /></span>
          <div>
            <p class="cm-note__title">Objectif du lot</p>
            <p class="cm-note__text rlot__objectif">{{ lot.objectif }}</p>
          </div>
        </div>

        <div class="rlot__etapes cm-stagger">
          <RoadmapStep
            v-for="e in lot.etapes"
            :key="e.id"
            :etape="e"
            :reglages="reglages"
            :longueur-max="longueurMax"
            :notes-ecrivables="notesEcrivables"
            :semaine-courante="semaineCourante"
            @enregistre="emit('enregistre', $event)"
          />
        </div>

        <!-- La place du bilan de fin de lot : vide tant qu'il n'est pas fait avec Pierre. -->
        <div class="rlot__bilan cm-block">
          <span class="cm-icon-box is-sm is-muted"><AppIcon name="flag" :size="14" /></span>
          <div class="rlot__bilan-corps">
            <p class="cm-eyebrow">Bilan de fin de lot<template v-if="bilan?.fait"> · fait le {{ jourCourt(bilan.fait) }}</template></p>
            <template v-if="bilan">
              <p v-if="bilan.texte" class="rlot__bilan-texte">{{ bilan.texte }}</p>
              <ul class="rlot__bilan-listes">
                <li v-for="l in listes" :key="l.cle">
                  <strong>{{ l.libelle }}</strong> :
                  <template v-if="l.items.length">{{ l.items.join(', ') }}</template>
                  <span v-else class="rlot__bilan-rien">rien</span>
                </li>
              </ul>
            </template>
            <p v-else class="rlot__bilan-texte">
              <template v-if="lot.termine">Le lot est terminé : son bilan reste à faire avec Pierre — ce qu’on garde, ce qu’on saute, ce qu’on réordonne.</template>
              <template v-else>Pas encore fait. À la fin du lot, on décide avec Pierre ce qu’on garde, ce qu’on saute et ce qu’on réordonne.</template>
            </p>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  </AppCard>
</template>

<style scoped>
/* La carte du lot se règle sur SA largeur : moins de marge intérieure quand elle est étroite
   (un téléphone), pour laisser la place aux étapes. */
.rlot {
  container: rlot / inline-size;
}

.rlot__interieur {
  padding: 20px 22px;
}

@container rlot (max-width: 520px) {
  .rlot__interieur {
    padding: 14px 10px;
  }
}

.rlot__tete {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.rlot__num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  background: var(--cm-section-soft);
  color: var(--cm-section);
  font-size: 15px;
  font-weight: 800;
}

.rlot.is-termine .rlot__num {
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

.rlot__titres {
  flex: 1 1 200px;
  min-width: 0;
}

.rlot__nom {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--cm-text-primary);
}

.rlot__sous {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--cm-text-muted);
}

.rlot__avance {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.rlot__compte {
  min-width: 56px;
}

.rlot__barre {
  width: 84px;
}

.rlot__remplissage--fini {
  background: var(--cm-accent);
}

.rlot__corps {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 4px;
}

.rlot__objectif {
  font-size: 13px;
}

.rlot__etapes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rlot__bilan {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  border-style: dashed;
}

.rlot__bilan-corps {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.rlot__bilan-corps .cm-eyebrow {
  margin: 0;
}

.rlot__bilan-texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.rlot__bilan-listes {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.rlot__bilan-listes strong {
  color: var(--cm-text-primary);
}

.rlot__bilan-rien {
  color: var(--cm-text-muted);
}

@media (max-width: 520px) {
  .rlot__barre {
    width: 56px;
  }
}
</style>
