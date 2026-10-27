<script setup>
/**
 * LA SIMULATION COMPLÈTE, à blanc (étape 28 du plan, 27/10/2026), dans la carte « Versions du moteur » de Réglages
 * (EngineVersionsPanel) — le seul écran de l'étape visible à la livraison : tout le reste est éteint.
 *   - LA PORTE 1 en mots simples : réussie, les combinés meilleurs que le produit des simples, les effets du score, les
 *     deux marchés écartés et pourquoi, la date ; ce que la preuve sur vos matchs en rapporte ;
 *   - la dernière nuit : fins de saison (combien, durée, mémoire, refus NOMMÉS) et déroulés des matchs (rencontres,
 *     analyses, chemins à part, contrôle) ;
 *   - l'avancement de la preuve sur vos matchs : « N matchs sur 800, J jours sur 21 » ;
 *   - les deux interrupteurs (AppSelect) : la valeur rangée, ce qui est vraiment montré (relu avec ses conditions à chaque
 *     lecture) et pourquoi, ce qui manque aux combinés. Un clic écrit dans la base (simulation_state) SEULEMENT : jamais
 *     les réglages du moteur, aucune version, l'essai de l'étape 27 intact. « Combinés » et « tout » sont refusés (une
 *     phrase) tant que le modèle de buts n'est pas en service ou que la preuve n'a pas dit « retenu ».
 * Il lit lui-même GET /api/simulation/etat (un état rangé par la nuit, aucun calcul) ; les mots viennent de
 * utils/simulation.js (pur, testé). Aucun vert : rien ici n'est une value.
 */
import { computed, onMounted, ref } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { simulationApi } from '@/services/simulationApi.js';
import { useEnjeuxStore } from '@/stores/enjeuxStore.js';
import { porte1Dite, nuitDesSaisonsDite, nuitDesMatchsDite, avancementDit, interrupteursDits, ecartesSurVosMatchs, CHOIX_DES_INTERRUPTEURS } from '@/utils/simulation.js';

const etat = ref({ loading: false, error: null, data: null });
const action = ref({ enCours: null, message: null, erreur: null });

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await simulationApi.etat() };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}

onMounted(charger);

const d = computed(() => etat.value.data);
const porte1 = computed(() => porte1Dite(d.value?.porte1 ?? null));
const ecartesRapportes = computed(() => ecartesSurVosMatchs(d.value?.porte1 ?? null, d.value?.jugement ?? null));
const nuitSaisons = computed(() => nuitDesSaisonsDite(d.value?.nuits?.saisons ?? null));
const nuitMatchs = computed(() => nuitDesMatchsDite(d.value?.nuits?.matchs ?? null, d.value?.controle ?? null));
const avancement = computed(() => avancementDit(d.value?.jugement ?? null, d.value?.horizon ?? undefined));
const interrupteurs = computed(() => interrupteursDits(d.value));
const refusVisibles = ref(false);

async function changer(cle, valeur) {
  if (!valeur || action.value.enCours) return;
  action.value = { enCours: cle, message: null, erreur: null };
  // Les pastilles d'enjeu des cartes (gardées 10 min par jour) : vidées à CHAQUE clic, réussi ou refusé — « Éteint » les
  // retire tout de suite, « Allumé » les montre tout de suite (vérification du 27/10, constat 21). Le magasin est pris au
  // clic, jamais à l'ouverture de la carte : la carte s'affiche sans lui (les écrans de Réglages rendus sans Pinia).
  const enjeux = useEnjeuxStore();
  try {
    await simulationApi.changerAffichage(cle, valeur);
    enjeux.$reset();
    action.value = { enCours: null, message: valeur === 'eteint' ? 'Éteint : plus rien de l’étape 28 n’est montré, les calculs de nuit continuent à blanc.' : 'Enregistré : l’affichage change dès la prochaine ouverture des pages.', erreur: null };
  } catch (error) {
    // Un refus (409) ne change rien ; vider les pastilles ne coûte qu'une lecture de plus.
    enjeux.$reset();
    action.value = { enCours: null, message: null, erreur: error.message };
  }
  await charger();
}
</script>

<template>
  <div class="cm-block est" data-simulation-reglages>
    <div class="est__tete">
      <span class="cm-icon-box is-info is-sm"><AppIcon name="activity" :size="14" /></span>
      <strong>La simulation complète (étape 28), calculée à blanc chaque nuit</strong>
      <span class="cm-chip">{{ interrupteurs.saisons.effectif === 'eteint' && interrupteurs.matchs.effectif === 'eteint' ? 'tout éteint' : 'en partie montrée' }}</span>
      <HelpTip terme="deroule-simule" />
    </div>
    <p class="est__texte">
      Chaque nuit : les fins de saison de 48 championnats (10 000 fois) et l’enjeu des rencontres des 14 prochains jours ; le déroulé de 10 000 matchs simulés pour chaque rencontre des 48 prochaines heures. Rien de cela n’entre dans un pourcentage du moteur, et l’essai du modèle de buts (étape 27) n’est pas touché.
    </p>

    <p v-if="etat.loading && !d" class="est__petit">Lecture de l’état de la simulation…</p>
    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="x" :size="14" /></span>
      <div>
        <p class="cm-note__title">État de la simulation illisible</p>
        <p class="cm-note__text est__texte">{{ etat.error }} — les blocs restent, sans valeurs.</p>
      </div>
    </div>

    <!-- 1. La porte 1 : la preuve sur les matchs passés (2019-2023), passée une fois. -->
    <div class="est__groupe" data-porte1>
      <p class="est__titre">
        <AppIcon name="award" :size="12" />
        <span>{{ porte1 ? `${porte1.titre}${porte1.date ? `, ${porte1.date}` : ''}` : 'Porte 1 : pas encore lue' }}</span>
        <HelpTip terme="banc-d-essai" />
      </p>
      <template v-if="porte1">
        <ul class="est__liste">
          <li v-for="(l, i) in porte1.lignes" :key="i">{{ l }}</li>
        </ul>
        <template v-if="porte1.ecartes.length">
          <p class="est__texte est__fort">{{ porte1.ecartesTitre }}</p>
          <ul class="est__liste">
            <li v-for="(l, i) in porte1.ecartes" :key="`e${i}`">{{ l }}</li>
          </ul>
          <p class="est__petit">{{ porte1.regle }}</p>
          <ul class="est__liste est__petit">
            <li v-for="(l, i) in ecartesRapportes" :key="`r${i}`">{{ l }}</li>
          </ul>
        </template>
      </template>
    </div>

    <!-- 2. La dernière nuit : ce qui a été calculé, en combien de temps, ce qui ne l'a pas été et pourquoi. -->
    <div class="est__groupe">
      <p class="est__titre"><AppIcon name="clock" :size="12" /><span>{{ nuitSaisons.titre }}</span></p>
      <p class="est__texte">{{ nuitSaisons.texte }}</p>
      <p v-if="nuitSaisons.loi" class="est__petit" :title="nuitSaisons.loiDetail ?? undefined">{{ nuitSaisons.loi }}</p>
      <template v-if="nuitSaisons.refus.length">
        <button type="button" class="est__deplier" @click="refusVisibles = !refusVisibles">
          <AppIcon :name="refusVisibles ? 'chevronDown' : 'chevronRight'" :size="12" />
          {{ refusVisibles ? 'Masquer' : 'Voir' }} les {{ nuitSaisons.refus.length }} championnats non calculés et pourquoi
        </button>
        <ul v-if="refusVisibles" class="est__liste est__refus">
          <li v-for="r in nuitSaisons.refus" :key="r.league"><strong>{{ r.league }}</strong> — {{ r.raison }}</li>
        </ul>
      </template>
      <p class="est__titre"><AppIcon name="clock" :size="12" /><span>{{ nuitMatchs.titre }}</span></p>
      <p class="est__texte">{{ nuitMatchs.texte }}</p>
      <p v-if="nuitMatchs.controle" class="est__petit">{{ nuitMatchs.controle }}</p>
    </div>

    <!-- 3. L'avancement de la preuve sur vos matchs (la porte 2). -->
    <div class="est__groupe">
      <p class="est__titre"><AppIcon name="target" :size="12" /><span>La preuve sur vos matchs : {{ avancement }}</span><HelpTip terme="preuve-apres-lancement" /></p>
      <p class="est__petit">Le jugement qui décide se prend une seule fois, à l’horizon (800 matchs joués ET 21 jours) : les combinés jugés contre le produit des simples, et une garde de sûreté de 4 points par combiné et par marché de déroulé — celui qui la dépasse s’éteint seul, le reste reste montré. Les effets du score n’y seront jamais « retenus » : c’est l’issue attendue.</p>
    </div>

    <!-- 4. Les deux interrupteurs : rangés, effectifs, et ce qui manque. -->
    <div class="est__groupe" data-interrupteurs>
      <p class="est__titre"><AppIcon name="sliders" :size="12" /><span>Ce que l’appli montre</span></p>
      <div class="cm-grid-2 est__choix">
        <div class="est__choix-bloc">
          <AppSelect
            :model-value="interrupteurs.saisons.range"
            label="Fins de saison et enjeu"
            :options="CHOIX_DES_INTERRUPTEURS.saisons"
            :disabled="Boolean(action.enCours) || !d"
            @update:model-value="(v) => changer('saisons', v)"
          />
          <p class="est__petit">Un onglet « Fin de saison » sur les classements, une pastille « Gros enjeu » / « Sans enjeu » sur les cartes, un encadré « Enjeu » sur la page du match. Une information, jamais un pourcentage du moteur.</p>
        </div>
        <div class="est__choix-bloc">
          <AppSelect
            :model-value="interrupteurs.matchs.range"
            label="Combinés et déroulé simulé"
            :options="CHOIX_DES_INTERRUPTEURS.matchs"
            :disabled="Boolean(action.enCours) || !d"
            @update:model-value="(v) => changer('matchs', v)"
          />
          <p class="est__petit">Le prix juste d’un combiné dans le ticket (jamais en vert) ; avec « tout », la carte « Déroulé simulé » sur la page du match.</p>
          <p v-if="interrupteurs.matchs.pourquoi" class="est__attention">{{ interrupteurs.matchs.pourquoi }}</p>
        </div>
      </div>
      <template v-if="interrupteurs.manques.length">
        <p class="est__texte est__fort">Ce qui manque pour montrer les combinés et le déroulé :</p>
        <ul class="est__liste">
          <li v-for="(m, i) in interrupteurs.manques" :key="i">{{ m }}.</li>
        </ul>
      </template>
      <p v-else-if="d" class="est__texte">Les conditions des combinés sont réunies : le modèle de buts est en service et la preuve de l’étape 28 a dit « retenu ».</p>
      <p v-if="interrupteurs.garde" class="est__texte" data-garde-de-surete>{{ interrupteurs.garde }}</p>
      <p v-if="action.message" class="est__texte">{{ action.message }}</p>
      <p v-if="action.erreur" class="est__attention">{{ action.erreur }}</p>
    </div>

    <div class="est__pied">
      <ProvenanceChip
        source="Simulation CôteMaster, état rangé par le serveur dans le magasin"
        :releve-le="d?.nuits?.matchs?.calculeLe ?? d?.nuits?.saisons?.calculeLe ?? null"
        action="calculé"
        :vieux-apres-heures="null"
        detail="Écrit par le serveur seul : la nuit, et au clic de ces deux choix — jamais les réglages du moteur."
      />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>
  </div>
</template>

<style scoped>
.est {
  container: est / inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.est__tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
}

.est__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.est__fort {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.est__petit {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.est__titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.est__groupe {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--cm-border-soft);
}

.est__liste {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.est__liste.est__petit {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.est__refus {
  max-height: 260px;
  overflow-y: auto;
}

.est__deplier {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  border: none;
  padding: 0;
  background: none;
  font-size: 12px;
  color: var(--cm-text-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.est__choix-bloc {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Ce qui empêche ou éteint : de l'ambre (« à regarder »), jamais le rouge d'une perte ni le vert d'une value. */
.est__attention {
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--cm-radius-sm);
  border: 1px dashed rgba(var(--cm-warning-rgb) / 0.4);
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-warning);
}

.est__pied {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
</style>
