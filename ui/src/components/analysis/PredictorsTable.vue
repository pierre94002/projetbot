<script setup>
/**
 * « CE QUI PRÉDIT / CE QUI TROMPE » (étape 31 du plan, 22/10/2026) : ce que l'étape 18 mesure de chaque statistique
 * d'équipe et de joueur — sa fiabilité (deux moitiés d'une saison racontent-elles la même chose ?), le nombre de matchs
 * à partir duquel elle est plus signal que bruit, son pouvoir de prédiction (annonce-t-elle les buts, les points ou
 * les corners des matchs suivants, jugé sur des matchs qui n'ont pas servi au calcul ?), sa demi-vie et la bonne
 * fenêtre. En vert celles qui comptent, en rouge celles qui trompent.
 *
 * UNE SEULE PLACE POUR CE TABLEAU : l'onglet « Statistiques ligue » de la page Matchs — c'est là qu'on lit les
 * statistiques, donc là qu'on se demande si on peut s'y fier. Ni Santé du moteur (un résumé : un chiffre, une
 * pastille, une phrase, un lien) ni Historique moteur (qui juge les pronostics du moteur, pas les statistiques).
 * La mesure porte sur tous les championnats réunis, pas sur celui qui est choisi plus haut : le bloc le dit.
 *
 * Tout est LU (GET /api/bench/stat-value : le dernier calcul fini, rangé dans la table stat_value par un calcul lancé
 * à la main, jamais chaque nuit) : rien n'est calculé à l'ouverture, aucun appel payant, aucune écriture. Les quatre
 * tableaux restent TOUJOURS affichés, lignes comprises, même sans calcul (« pas encore mesuré ») ; chacun montre sa
 * période réelle, et le bloc sa source et l'heure du calcul. Les mots viennent de utils/predicteurs.js (pur, rejoué par
 * server/test/fichesEcran.test.mjs).
 */
import { computed, onMounted, ref } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { benchApi } from '@/services/benchApi.js';
import {
  SECTIONS,
  VERDICTS,
  etatDuBloc,
  lignesDeLaSection,
  piedDeLaSection,
  piedDuMoteur,
  phraseDeLaSection,
  chiffresCles,
  provenanceDuBloc
} from '@/utils/predicteurs.js';

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await benchApi.valeurDesStatistiques() };
  } catch (error) {
    etat.value = { loading: false, error: error.message, data: null };
  }
}
onMounted(charger);

// ------------------------------------------------------------ présentation
const reponse = computed(() => etat.value.data);
const lu = computed(() => etatDuBloc({ chargement: etat.value.loading, erreur: etat.value.error, reponse: reponse.value }));
const mesure = computed(() => lu.value.cle === 'pret' || lu.value.cle === 'chargement' ? Boolean(reponse.value?.dernier) : false);
const cles = computed(() => chiffresCles(reponse.value));
const provenance = computed(() => provenanceDuBloc(reponse.value));
const tableaux = computed(() =>
  SECTIONS.map((section) => {
    const lignes = lignesDeLaSection(section, reponse.value?.lignes ?? [], { mesure: mesure.value });
    return {
      section,
      lignes,
      phrase: phraseDeLaSection(section, reponse.value?.lignes ?? []),
      pied: section.genre === 'moteur' ? piedDuMoteur(lignes) : piedDeLaSection(lignes)
    };
  })
);
const raisonDeLaLigne = computed(() => (lu.value.cle === 'chargement' ? 'lecture en cours' : mesure.value ? 'pas mesuré dans ce calcul' : 'pas encore mesuré'));
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
const SOURCES = Object.freeze({ magasin: 'FotMob (magasin)', 'football-data': 'football-data.co.uk' });
</script>

<template>
  <AppCard
    class="pt"
    icon="target"
    eyebrow="Calculé à la main, jamais chaque nuit"
    title="Ce qui prédit, ce qui trompe"
    subtitle="Pour chaque statistique : peut-on s’y fier, combien de matchs faut-il, annonce-t-elle vraiment les buts, les points ou les corners suivants ? Mesuré sur tous les championnats réunis, pas sur celui choisi plus haut."
    :data-etat="lu.cle"
    data-bloc="ce-qui-predit"
  >
    <template #actions>
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </template>

    <div class="pt__corps">
      <LoadingSpinner v-if="lu.cle === 'chargement'" label="Lecture de la valeur des statistiques…" />

      <div v-if="lu.texte && lu.cle !== 'chargement'" class="cm-note" :class="lu.ton" :data-raison="lu.cle">
        <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(lu.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ lu.titre }}</p>
          <p class="cm-note__text pt__texte">{{ lu.texte }}</p>
        </div>
      </div>

      <div v-if="lu.enCours" class="cm-note is-info" data-raison="en-cours">
        <span class="cm-icon-box is-info"><AppIcon name="clock" :size="16" /></span>
        <div>
          <p class="cm-note__title">Un nouveau calcul tourne</p>
          <p class="cm-note__text pt__texte">Le dernier calcul fini reste lu en attendant la fin de celui-ci.</p>
        </div>
      </div>

      <div v-if="reponse?.dernierRefus" class="cm-note is-warning" data-raison="dernier-refus">
        <span class="cm-icon-box is-warning"><AppIcon name="alert" :size="16" /></span>
        <div>
          <p class="cm-note__title">Le dernier lancement a été refusé</p>
          <p class="cm-note__text pt__texte">{{ reponse.dernierRefus.raison }}</p>
        </div>
      </div>

      <!-- 1. Les chiffres clés. -->
      <div class="cm-kpis pt__kpis">
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">Statistiques mesurées</span>
          <span class="cm-kpi__value">{{ cles.mesurees.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.mesurees.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Celles qui comptent</span>
          <span class="cm-kpi__value">{{ cles.comptent.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.comptent.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Celles qui trompent</span>
          <span class="cm-kpi__value">{{ cles.trompent.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.trompent.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Calcul</span>
          <span class="cm-kpi__value">{{ cles.calcul.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.calcul.detail }}</span>
        </div>
      </div>

      <!-- 2. D'où ça vient. -->
      <div class="pt__entete">
        <ProvenanceChip
          :source="provenance.source"
          :releve-le="provenance.releveLe"
          :action="provenance.action"
          :fichier="provenance.fichier"
          :detail="provenance.detail"
          :vieux-apres-heures="24 * 45"
        />
        <HelpTip
          titre="Comment lire ce tableau"
          texte="Fiabilité : on coupe les matchs d’une équipe en deux moitiés (un sur deux) et on regarde si elles racontent la même chose ; plus c’est haut, plus la statistique est une qualité de l’équipe et moins un coup de chance. Matchs nécessaires : à partir de combien de matchs elle est plus signal que bruit. Pouvoir de prédiction : l’erreur de prévision en moins, face à la seule moyenne du championnat, sur des matchs qui n’ont pas servi au calcul. Demi-vie : de combien un match ancien perd de son poids. Bonne fenêtre : le nombre de derniers matchs qui prédit le mieux (10 aujourd’hui). Une autre fenêtre n’est que proposée : rien n’est branché avant le banc d’essai et votre accord."
        />
      </div>

      <div class="pt__legende" data-legende>
        <span v-for="(v, cle) in VERDICTS" :key="cle" class="pt__legende-ligne">
          <span class="cm-chip" :class="v.ton"><AppIcon :name="v.icone" :size="11" />{{ v.texte }}</span>
          <span>{{ v.phrase }}</span>
        </span>
      </div>

      <!-- 3. Les quatre tableaux. -->
      <section v-for="t in tableaux" :key="t.section.cle" class="pt__section" :data-section="t.section.cle">
        <h4 class="cm-group-title pt__groupe">{{ t.section.titre }}</h4>
        <p class="pt__texte">{{ t.phrase }}</p>

        <!-- Les statistiques d'équipe et de joueur. -->
        <div v-if="t.section.genre === 'statistique'" class="cm-table-wrap pt__wrap">
          <table class="cm-table pt__table" :data-tableau="t.section.cle">
            <thead>
              <tr>
                <th class="is-left">Statistique</th>
                <th title="Fiabilité d’une fenêtre de 10 matchs : deux moitiés de la saison racontent-elles la même chose ?">Fiabilité</th>
                <th title="Nombre de matchs à partir duquel la statistique est plus signal que bruit">Matchs nécessaires</th>
                <th title="Erreur de prévision en moins face à la seule moyenne du championnat, sur des matchs qui n’ont pas servi au calcul">Pouvoir de prédiction</th>
                <th title="De combien un match ancien perd de son poids">Demi-vie</th>
                <th title="Le nombre de derniers matchs qui prédit le mieux, face aux 10 d’aujourd’hui">Bonne fenêtre</th>
                <th class="is-left">Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in t.lignes" :key="l.id" :class="{ 'is-compte': l.verdict.cle === 'compte', 'is-trompe': l.verdict.cle === 'trompe' }">
                <td class="is-left is-strong">
                  {{ l.libelle }}
                  <small v-if="l.cible" class="pt__petit">annonce {{ l.cible }}</small>
                </td>
                <template v-if="l.mesuree">
                  <td class="cm-numeric" :title="l.fiabilite.titre">{{ l.fiabilite.texte }}</td>
                  <td class="cm-numeric" :title="l.stabilisation.titre">{{ l.stabilisation.texte }}</td>
                  <td class="cm-numeric" :title="l.pouvoir.titre">
                    {{ l.pouvoir.texte }}
                    <small v-if="l.pouvoir.detail" class="pt__petit">{{ l.pouvoir.detail }}</small>
                  </td>
                  <td class="cm-numeric" :title="l.demiVie.titre">{{ l.demiVie.texte }}</td>
                  <td class="cm-numeric" :title="l.fenetre.titre">
                    {{ l.fenetre.texte }}
                    <small v-if="l.fenetre.detail" class="pt__petit">{{ l.fenetre.detail }}</small>
                  </td>
                  <td class="is-left" :title="l.verdict.phrase">
                    <span class="cm-chip" :class="l.verdict.ton"><AppIcon :name="l.verdict.icone" :size="11" />{{ l.verdict.texte }}</span>
                  </td>
                </template>
                <td v-else class="is-left pt__vide" colspan="6">{{ raisonDeLaLigne }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="is-left is-strong">Σ Total<small class="pt__petit">{{ t.pied.texte.sigma }}</small></td>
                <td class="is-left pt__moyenne" colspan="4">jamais de somme de pourcentages ni de matchs : la moyenne est sur la ligne suivante</td>
                <td class="is-left pt__sigma">{{ t.pied.texte.fenetres }}</td>
                <td class="is-left pt__sigma">{{ t.pied.texte.verdicts }}</td>
              </tr>
              <tr>
                <td class="is-left pt__moyenne">⌀ Moyenne<small class="pt__petit">de chaque colonne chiffrée</small></td>
                <td class="pt__moyenne">{{ t.pied.texte.fiabilite }}</td>
                <td class="pt__moyenne">{{ t.pied.texte.stabilisation }}</td>
                <td class="pt__moyenne">{{ t.pied.texte.pouvoir }}</td>
                <td class="pt__moyenne">{{ t.pied.texte.demiVie }}</td>
                <td class="is-left pt__moyenne" colspan="2">pas de moyenne pour une fenêtre ni pour un verdict</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <!-- La fenêtre du moteur : corners, tirs, tirs cadrés, dans ses propres termes. -->
        <div v-else class="cm-table-wrap pt__wrap">
          <table class="cm-table pt__table" :data-tableau="t.section.cle">
            <thead>
              <tr>
                <th class="is-left">Marché</th>
                <th class="is-left">Source</th>
                <th title="La fenêtre du moteur aujourd’hui">Fenêtre actuelle</th>
                <th title="La fenêtre qui prédit le mieux sur la période de calcul, jugée face aux 10 d’aujourd’hui">Meilleure fenêtre</th>
                <th class="is-left">Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in t.lignes" :key="l.id">
                <td class="is-left is-strong">{{ l.libelle }}</td>
                <td class="is-left"><span class="cm-chip" :class="l.source === 'magasin' ? 'is-info' : 'is-violet'">{{ SOURCES[l.source] }}</span></td>
                <template v-if="l.mesuree">
                  <td class="cm-numeric">{{ l.ligne.fenetre.actuelle }} matchs</td>
                  <td class="cm-numeric" :title="l.fenetre.titre">{{ l.fenetre.texte }}<small v-if="l.fenetre.detail" class="pt__petit">{{ l.fenetre.detail }}</small></td>
                  <td class="is-left" :title="l.raison ?? l.fenetre.titre">
                    <span class="cm-chip" :class="l.fenetre.ton"><AppIcon :name="l.fenetre.icone" :size="11" />{{ l.fenetre.verdict }}</span>
                  </td>
                </template>
                <td v-else class="is-left pt__vide" colspan="3">{{ raisonDeLaLigne }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td class="is-left is-strong">Σ Total<small class="pt__petit">{{ t.pied.texte.sigma }}</small></td>
                <td class="pt__sigma" colspan="4">{{ t.pied.texte.verdicts }}</td>
              </tr>
              <tr>
                <td class="is-left pt__moyenne">⌀ Moyenne<small class="pt__petit">meilleure fenêtre moyenne</small></td>
                <td class="pt__moyenne" colspan="2"></td>
                <td class="pt__moyenne">{{ t.pied.texte.meilleure }}</td>
                <td class="pt__moyenne"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p class="pt__pied">
        <AppIcon name="shield" :size="12" />
        <span>Mesuré seulement : le moteur garde sa fenêtre de 10 matchs et ses réglages. Une autre fenêtre ou une autre demi-vie n’entre dans un modèle qu’après le banc d’essai et votre accord. Ce calcul se lance à la main (il dure quelques minutes) ; cette page ne le lance jamais.</span>
      </p>
    </div>
  </AppCard>
</template>

<style scoped>
.pt {
  container: pt / inline-size;
}

.pt__corps {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.pt__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.pt__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.pt__entete {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.pt__legende {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 8px 14px;
  padding: 12px 14px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.pt__legende-ligne {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.pt__legende-ligne .cm-chip {
  flex-shrink: 0;
}

.pt__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pt__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.pt__wrap {
  max-height: 640px;
}

.pt__table td {
  vertical-align: top;
}

.pt__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.pt__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.pt__sigma {
  min-width: 170px;
  white-space: normal;
  text-align: left;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.pt__moyenne {
  color: var(--cm-text-muted);
  white-space: normal;
}

.pt__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.pt__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}
</style>
