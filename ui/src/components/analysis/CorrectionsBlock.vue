<script setup>
/**
 * LE BLOC DES CORRECTIONS de « Santé du moteur » (étape 26 du plan, partie E, 28/10/2026), dans le cadre
 * « Corrections à accepter ou refuser » (HealthBlockCard, toute la largeur de la grille). AFFICHAGE PUR : il montre le
 * bloc que le serveur a préparé (GET /api/engine-health, data/santeDuMoteur.js, blocCorrections) et ÉMET les clics de
 * Pierre — `banc`, `accepter`, `refuser`, `retirer` (avec la proposition vue à l'écran) et `proposer` (le formulaire) ;
 * EngineHealthView demande la confirmation (window.confirm, toujours), appelle la route et relit la page.
 *
 * Quatre parties, dans cet ordre (ui/DESIGN.md, « Depuis l'étape 26 ») :
 *   1. « Le mois en mots » — le résumé écrit par Claude (chiffres vérifiés) ou ce qui l'attend ;
 *   2. « Les écarts du mois » — EN COURT : les statuts du dernier tri en pastilles, les vrais défauts, les familles en
 *      essai, la règle ; le détail des 22 cases vit dans Historique moteur (une seule place par information) ;
 *   3. « Les corrections proposées » — une carte par correction ouverte ou adoptée, ses boutons (« Mesurer au banc —
 *      environ 10 min », « Mettre à l'essai », « Refuser »), « Proposer une correction » (fermé pendant l'essai du modèle
 *      de buts, avec sa raison écrite), la place de l'essai, les corrections déjà essayées ;
 *   4. « Le journal » — les 3 dernières entrées et le lien vers tout le journal.
 * Jamais de vert : un écart, une correction, un verdict du banc ne sont pas des gains. Les mots viennent de
 * utils/corrections.js (pur, rejoué par server/test/boucleCorrectionEcran.test.mjs).
 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import CorrectionProposalForm from '@/components/analysis/CorrectionProposalForm.vue';
import { leMoisEnMots, ecartsEnCourt, propositionsMontrees, journalDit } from '@/utils/corrections.js';

const props = defineProps({
  /** Le bloc « corrections » de GET /api/engine-health. */
  bloc: { type: Object, required: true },
  /** Une action en cours (l'identifiant de la correction, ou « proposer ») : les boutons attendent. */
  occupe: { type: String, default: null },
  /** Le message après une action réussie, ou l'erreur dite par le serveur (en mots). */
  message: { type: String, default: null },
  erreur: { type: String, default: null },
  /** La réponse de « Retirer » : où cliquer pour le retour arrière (le serveur n'écrit rien). */
  retrait: { type: Object, default: null }
});
const emit = defineEmits(['banc', 'accepter', 'refuser', 'retirer', 'proposer']);

const lisible = computed(() => props.bloc?.etat !== 'indisponible' && props.bloc?.etat !== 'chargement');
const moisEnMots = computed(() => leMoisEnMots(props.bloc?.resume ?? null));
const ecarts = computed(() => ecartsEnCourt(props.bloc?.dernierTri ?? null, props.bloc?.regles ?? null));
const cartes = computed(() => propositionsMontrees(props.bloc?.propositions));
const brute = (id) => (props.bloc?.propositions ?? []).find((p) => p.id === id) ?? null;
const journal = computed(() => journalDit(props.bloc?.journal).slice(0, 3));
const formulaire = computed(() => props.bloc?.formulaire ?? null);
const formulaireOuvert = computed(() => Boolean(formulaire.value?.ouvert));
const raisonDuFormulaire = computed(() => formulaire.value?.raison ?? (formulaire.value ? null : 'Le formulaire ne se lit pas pour l’instant.'));
const montrerLeFormulaire = ref(false);
const occupee = computed(() => Boolean(props.occupe));

const PHRASE_DES_ESSAIS = 'Plus on essaie de corrections avant d’en garder une, plus il est facile de tomber sur un bon score par chance : le juge élargit sa marge d’autant, il faut plus de matchs pour prouver.';
</script>

<template>
  <div v-if="lisible" class="corr" :data-corrections="bloc.etat">
    <div class="corr__grille">
    <!-- 1. LE MOIS EN MOTS -->
    <div class="cm-block corr__partie" data-partie="mois-en-mots">
      <h4 class="cm-group-title corr__titre"><AppIcon name="sparkles" :size="13" />Le mois en mots</h4>
      <template v-if="moisEnMots.etat === 'ecrit'">
        <p class="corr__resume-titre">{{ moisEnMots.titre }}</p>
        <ul class="corr__phrases">
          <li v-for="(p, i) in moisEnMots.phrases" :key="i">{{ p }}</li>
        </ul>
      </template>
      <p v-else class="corr__texte" :class="{ 'corr__texte--attention': moisEnMots.ton === 'is-warning' }">{{ moisEnMots.phrase }}</p>
      <ProvenanceChip
        v-if="moisEnMots.provenance"
        :source="moisEnMots.provenance.source"
        :releve-le="moisEnMots.provenance.releveLe"
        :action="moisEnMots.provenance.action"
        :detail="moisEnMots.provenance.detail"
        :vieux-apres-heures="null"
        variante="ligne"
      />
    </div>

    <!-- 2. LES ÉCARTS DU MOIS, EN COURT (le détail des 22 cases : Historique moteur) -->
    <div class="cm-block corr__partie" data-partie="ecarts">
      <h4 class="cm-group-title corr__titre"><AppIcon name="target" :size="13" />Les écarts du mois <HelpTip terme="fourchette-du-hasard" /></h4>
      <template v-if="ecarts">
        <p class="corr__texte">{{ ecarts.entete }}</p>
        <ul class="corr__pastilles">
          <li v-for="x in ecarts.pastilles" :key="x.code">
            <span class="cm-chip corr__statut" :class="x.ton">{{ x.texte }}</span>
          </li>
        </ul>
        <ul v-if="ecarts.defauts.length" class="corr__defauts">
          <li v-for="d in ecarts.defauts" :key="d.cas">
            <strong>{{ d.texte }}</strong> — <span class="cm-numeric">{{ d.ecart }}</span><template v-if="d.mois"> ({{ d.mois }})</template><template v-if="d.propose"> · {{ d.propose }}</template>
          </li>
        </ul>
        <p v-if="ecarts.enEssai" class="corr__texte corr__en-essai">{{ ecarts.enEssai }}</p>
        <p class="corr__petit">{{ ecarts.regle }}</p>
      </template>
      <p v-else class="corr__texte">Pas encore de tri : le premier se fait le 1er du mois à partir de 6 h, après le gel de la calibration. Le détail des 22 cases sera dans Historique moteur.</p>
    </div>

    <!-- 3. LES CORRECTIONS PROPOSÉES -->
    <div class="cm-block corr__partie" data-partie="propositions">
      <h4 class="cm-group-title corr__titre"><AppIcon name="swap" :size="13" />Les corrections proposées</h4>
      <ul class="corr__cartes">
        <li v-for="c in cartes" :key="c.id" class="corr__carte" :data-proposition="c.id" :data-etat-proposition="c.etat">
          <div class="corr__carte-tete">
            <strong class="corr__carte-titre">{{ c.titre }}</strong>
            <span class="cm-chip corr__etat" :class="c.pastille.ton">{{ c.pastille.texte }}</span>
          </div>
          <dl class="corr__fiche">
            <dt>D’où elle vient</dt>
            <dd>{{ c.origine }}</dd>
            <dt>Ce qui changerait</dt>
            <dd>{{ c.changement }}<span class="corr__marches"> — marchés touchés : {{ c.marches }}</span></dd>
          </dl>
          <p v-if="c.banc" class="corr__texte">
            {{ c.banc.texte }}
            <span v-if="c.banc.pastille" class="cm-chip corr__verdict" :class="c.banc.pastille.ton" :title="c.banc.parFamille ?? ''">{{ c.banc.pastille.texte }}</span>
          </p>
          <p v-if="c.essai" class="corr__texte">{{ c.essai }}</p>
          <p v-if="c.retrait" class="corr__petit">{{ c.retrait.phrase }}</p>
          <div class="cm-toolbar corr__actions">
            <AppButton v-if="c.actions.banc" variant="secondary" size="sm" :disabled="occupee" :loading="occupe === c.id" @click="emit('banc', brute(c.id))">
              <template #icon><AppIcon name="activity" :size="13" /></template>
              Mesurer au banc — environ 10 min
            </AppButton>
            <AppButton v-if="c.actions.accepter" variant="primary" size="sm" :disabled="occupee" :loading="occupe === c.id" @click="emit('accepter', brute(c.id))">
              <template #icon><AppIcon name="play" :size="13" /></template>
              Mettre à l’essai
            </AppButton>
            <AppButton v-if="c.actions.refuser" variant="secondary" size="sm" :disabled="occupee" @click="emit('refuser', brute(c.id))">
              <template #icon><AppIcon name="x" :size="13" /></template>
              Refuser
            </AppButton>
            <RouterLink v-if="c.adopter" class="cm-link corr__lien" :to="{ path: '/reglages' }">Adopter dans Réglages › Versions du moteur<AppIcon name="arrowRight" :size="12" /></RouterLink>
            <AppButton v-if="c.actions.retirer" variant="secondary" size="sm" :disabled="occupee" @click="emit('retirer', brute(c.id))">
              <template #icon><AppIcon name="history" :size="13" /></template>
              Retirer
            </AppButton>
          </div>
        </li>
        <li v-if="!cartes.length" class="corr__vide">Aucune correction proposée pour l’instant.</li>
      </ul>

      <div class="corr__proposer">
        <div class="cm-toolbar corr__actions">
          <AppButton variant="secondary" size="sm" :disabled="!formulaireOuvert || occupee" @click="montrerLeFormulaire = !montrerLeFormulaire">
            <template #icon><AppIcon name="plus" :size="13" /></template>
            Proposer une correction
          </AppButton>
        </div>
        <p v-if="!formulaireOuvert && raisonDuFormulaire" class="corr__petit corr__raison">{{ raisonDuFormulaire }}</p>
        <CorrectionProposalForm v-if="montrerLeFormulaire && formulaireOuvert" :formulaire="formulaire" :occupe="occupe === 'proposer'" @proposer="(corps) => emit('proposer', corps)" @annuler="montrerLeFormulaire = false" />
        <p v-if="formulaire?.reglagesDePari" class="corr__petit">{{ formulaire.reglagesDePari }}</p>
      </div>

      <p v-if="bloc.place?.phrase" class="corr__petit corr__place"><AppIcon name="layers" :size="12" />{{ bloc.place.phrase }}</p>
      <p v-if="bloc.essais?.phrase" class="corr__petit corr__place">
        <AppIcon name="history" :size="12" />{{ bloc.essais.phrase }}
        <HelpTip titre="Corrections déjà essayées" :texte="PHRASE_DES_ESSAIS" />
      </p>
      <p v-if="message" class="cm-note is-info corr__retour" role="status">
        <span class="cm-note__text">{{ message }}</span>
      </p>
      <p v-if="erreur" class="cm-note is-danger corr__retour" role="alert">
        <span class="cm-note__text">{{ erreur }}</span>
      </p>
      <p v-if="retrait?.phrase" class="cm-note is-info corr__retour">
        <span class="cm-note__text">{{ retrait.phrase }}</span>
        <RouterLink class="cm-link corr__lien" :to="{ path: '/reglages' }">Réglages › Versions du moteur<AppIcon name="arrowRight" :size="12" /></RouterLink>
      </p>
    </div>

    <!-- 4. LE JOURNAL : les 3 dernières entrées ; tout le journal est dans Historique moteur -->
    <div class="cm-block corr__partie" data-partie="journal">
      <h4 class="cm-group-title corr__titre"><AppIcon name="list" :size="13" />Le journal</h4>
      <ol class="corr__journal">
        <li v-for="e in journal" :key="e.n">
          <span class="corr__quand cm-numeric">{{ e.quand }}</span>
          <span class="cm-chip corr__evenement" :class="e.ton">{{ e.dit }}</span>
          <span class="corr__phrase">{{ e.phrase }}</span>
        </li>
        <li v-if="!journal.length" class="corr__vide">Rien au journal pour l’instant.</li>
      </ol>
      <RouterLink class="cm-link corr__lien" :to="{ path: '/historique-moteur', query: { onglet: 'moteur' } }">Tout le journal : Historique moteur › Écarts du mois<AppIcon name="arrowRight" :size="12" /></RouterLink>
    </div>
    </div>
  </div>
</template>

<style scoped>
/* Le conteneur (requête de conteneur `corr`) et sa grille : une colonne, deux dès 760 px du bloc. */
.corr {
  container: corr / inline-size;
}

.corr__grille {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.corr__partie {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.corr__titre {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}

.corr__texte,
.corr__petit {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.corr__petit {
  font-size: 12px;
  color: var(--cm-text-muted);
}

.corr__texte--attention {
  color: var(--cm-warning);
}

.corr__resume-titre {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.corr__phrases,
.corr__defauts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cm-text-primary);
}

.corr__pastilles {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* « À surveiller » : l'ambre en tirets, pour le distinguer du vrai défaut sans une couleur de plus. */
.cm-chip.is-tirets {
  border-style: dashed;
}

.corr__en-essai {
  color: var(--cm-info);
}

.corr__cartes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.corr__carte {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  min-width: 0;
}

.corr__carte-tete {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px 10px;
}

.corr__carte-titre {
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.corr__etat,
.corr__statut,
.corr__evenement,
.corr__verdict {
  white-space: nowrap;
}

/* « adoptée » (la carte et le journal ; vérification finale, constat 6) : la couleur de la section en teinte légère —
   jamais --cm-section-soft, calculé à la racine et resté émeraude dans Santé du moteur (ui/DESIGN.md § 2) ; une correction
   n'est pas un gain. */
.corr__etat.is-section,
.corr__evenement.is-section {
  background: rgba(var(--cm-section-rgb) / 0.12);
}

.corr__fiche {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 3px 12px;
  margin: 0;
  font-size: 12.5px;
}

.corr__fiche dt {
  color: var(--cm-text-muted);
}

.corr__fiche dd {
  margin: 0;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.corr__marches {
  color: var(--cm-text-secondary);
}

.corr__actions {
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.corr__lien {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
}

.corr__vide {
  font-size: 12.5px;
  color: var(--cm-text-muted);
}

.corr__proposer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.corr__raison {
  color: var(--cm-text-secondary);
}

.corr__place {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.corr__retour {
  margin: 0;
}

.corr__journal {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.corr__journal li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  font-size: 12.5px;
  line-height: 1.5;
}

.corr__quand {
  color: var(--cm-text-muted);
  white-space: nowrap;
}

.corr__phrase {
  min-width: 0;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

@container corr (min-width: 760px) {
  .corr__grille {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .corr__partie[data-partie='propositions'] {
    grid-column: 1 / -1;
  }

  .corr__cartes {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@container corr (max-width: 420px) {
  .corr__fiche {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
