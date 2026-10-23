<script setup>
/**
 * La « NOTE PAR POSTE » de la fiche d'un joueur (étape 31 du plan, 22/10/2026) : ce que l'étape 30 calcule chaque
 * nuit — ce que le joueur produit par 90 minutes, composante par composante, corrigé de la force des adversaires et
 * du niveau du championnat, rapproché de la moyenne de son poste quand il a peu joué —, ses deux apports (offensif
 * et défensif, en buts par 90 minutes au-dessus de la moyenne de son poste) avec leur place parmi les joueurs du même
 * poste du championnat, et sa courbe de forme (ses vingt dernières apparitions).
 *
 * Tout est LU (GET /api/match-stats/player-ratings?player=…, une table calculée la nuit par l'actualisation,
 * server/src/data/db/playerRatings.js) : rien n'est calculé à l'ouverture de la page, aucun appel payant. Le bloc
 * reste TOUJOURS affiché, tableau compris, même vide ; il montre sa source réelle et l'heure du calcul.
 *
 * AFFICHAGE SEULEMENT (règle de Pierre) : le moteur ne lit pas ces fiches, et ces notes ne paraissent JAMAIS sur le
 * terrain des compositions (les notes de match et de saison y restent seules). Les mots viennent de
 * utils/ficheJoueur.js (pur, rejoué par server/test/fichesEcran.test.mjs). Le joueur est reconnu par son identifiant
 * FotMob ; la fiche change de joueur en relisant (surveillance de `playerId`).
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import {
  etatDeLaFiche,
  identiteDeLaFiche,
  apportsDuJoueur,
  composantesDuPoste,
  composantesVides,
  tonDeLaPlace,
  courbeDeForme,
  lignesDeLaCourbe,
  piedDeLaCourbe,
  formeDite,
  provenanceDeLaFiche,
  apportSigne,
  posteDit
} from '@/utils/ficheJoueur.js';

const props = defineProps({
  /** L'identifiant FotMob du joueur (« fotmob-123456 »). */
  playerId: { type: String, default: null },
  playerName: { type: String, default: '' },
  countryCode: { type: String, default: null },
  countryName: { type: String, default: null },
  /** Son club, pour le logo à côté de son nom. */
  team: { type: String, default: null },
  teamId: { type: String, default: null },
  league: { type: String, default: null },
  /** Ses matchs de la saison choisie (la page du joueur) : un match joué le même jour donne l'adversaire de la courbe. */
  matches: { type: Array, default: () => [] }
});

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  const joueur = props.playerId;
  if (!joueur) {
    etat.value = { loading: false, error: null, data: null };
    return;
  }
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.playerRatings(joueur);
    // Une réponse arrivée après un changement de joueur est ignorée.
    if (props.playerId === joueur) etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (props.playerId === joueur) etat.value = { loading: false, error: error.message, data: null };
  }
}

onMounted(charger);
watch(
  () => props.playerId,
  (apres, avant) => {
    if (apres === avant) return;
    etat.value = { loading: false, error: null, data: null };
    charger();
  }
);

// ------------------------------------------------------------ présentation
const reponse = computed(() => etat.value.data);
const lu = computed(() => etatDeLaFiche({ chargement: etat.value.loading, erreur: etat.value.error, reponse: reponse.value }));
const fiche = computed(() => (lu.value.cle === 'pret' ? reponse.value?.lecture?.fiche ?? null : null));
const identite = computed(() => identiteDeLaFiche(fiche.value));
const apports = computed(() => apportsDuJoueur(fiche.value));
const gardien = computed(() => fiche.value?.poste === 1);
const tuiles = computed(() => (fiche.value ? composantesDuPoste(fiche.value) : composantesVides(lu.value.cle === 'chargement' ? 'lecture en cours' : 'pas encore calculée')));
const courbe = computed(() => courbeDeForme(fiche.value?.courbe ?? [], { gardien: gardien.value }));
const lignes = computed(() => lignesDeLaCourbe(fiche.value?.courbe ?? [], { matchs: props.matches, gardien: gardien.value }));
const pied = computed(() => piedDeLaCourbe(lignes.value, { gardien: gardien.value }));
const provenance = computed(() => provenanceDeLaFiche(reponse.value));
const LARGEUR = 600;
const HAUTEUR = 120;
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
const posteDeLaFiche = computed(() => (fiche.value ? posteDit(fiche.value.poste) : null));
</script>

<template>
  <AppCard
    class="prc"
    icon="award"
    eyebrow="Calculé chaque nuit"
    title="Note par poste"
    subtitle="Ce qu’il produit par 90 minutes à son poste, face à la moyenne des joueurs du même poste"
    :data-etat="lu.cle"
    data-bloc="note-par-poste"
  >
    <template #actions>
      <AppButton variant="secondary" size="sm" :loading="etat.loading" :disabled="!playerId" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </template>

    <div class="prc__corps">
      <!-- 0. De qui on parle : son drapeau, son nom, son club (logo), son poste. -->
      <p class="prc__joueur">
        <PlayerFlag v-if="countryCode" :code="countryCode" :name="countryName" :size="18" />
        <strong class="cm-truncate">{{ playerName }}</strong>
        <span v-if="team" class="prc__club"><TeamCrest :name="team" :league="league" :team-id="teamId" :size="22" /><span class="cm-truncate">{{ team }}</span></span>
        <span v-if="posteDeLaFiche" class="cm-chip is-section"><AppIcon name="shield" :size="11" />{{ posteDeLaFiche }}</span>
        <span v-if="identite" class="cm-chip" :class="identite.etablie ? 'is-info' : 'is-warning'" :title="identite.etablie ? 'Au moins 270 minutes jouées : la fiche est établie.' : 'Moins de 270 minutes jouées : la fiche est rapprochée de la moyenne de son poste et n’a pas de place.'">
          {{ identite.etablie ? 'fiche établie' : 'peu joué' }}
        </span>
      </p>

      <LoadingSpinner v-if="lu.cle === 'chargement'" label="Lecture de la fiche du joueur…" />

      <div v-if="lu.texte && lu.cle !== 'chargement'" class="cm-note" :class="lu.ton" :data-raison="lu.cle">
        <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(lu.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ lu.titre }}</p>
          <p class="cm-note__text prc__texte">{{ lu.texte }}</p>
        </div>
      </div>

      <div v-if="lu.aRefaire" class="cm-note is-warning" data-raison="autre-version">
        <span class="cm-icon-box is-warning"><AppIcon name="clock" :size="16" /></span>
        <div>
          <p class="cm-note__title">Calcul d’une autre version</p>
          <p class="cm-note__text prc__texte">Les fiches lues ont été faites par une autre forme du calcul : la prochaine passe de nuit les refait. Leurs chiffres restent lus en attendant.</p>
        </div>
      </div>

      <!-- 1. Les deux apports et ce que la fiche a derrière elle. -->
      <div class="cm-kpis prc__kpis">
        <div class="cm-kpi is-section" :class="apports.offensif.percentile !== null ? tonDeLaPlace(apports.offensif.percentile) : ''" :title="apports.offensif.detail">
          <span class="cm-kpi__label">{{ apports.offensif.libelle }}</span>
          <span class="cm-kpi__value">{{ apports.offensif.valeurTexte }}</span>
          <span class="cm-kpi__detail">{{ apports.offensif.place ?? (fiche ? (gardien ? 'un gardien n’a pas d’apport offensif' : 'pas de place : fiche pas encore établie') : 'pas encore calculé') }}</span>
        </div>
        <div class="cm-kpi is-section" :class="apports.defensif.percentile !== null ? tonDeLaPlace(apports.defensif.percentile) : ''" :title="apports.defensif.detail">
          <span class="cm-kpi__label">{{ apports.defensif.libelle }}</span>
          <span class="cm-kpi__value">{{ apports.defensif.valeurTexte }}</span>
          <span class="cm-kpi__detail">{{ apports.defensif.place ?? (fiche ? 'pas de place : fiche pas encore établie' : 'pas encore calculé') }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Minutes</span>
          <span class="cm-kpi__value">{{ identite ? identite.minutes : 'non lu' }}</span>
          <span class="cm-kpi__detail">{{ identite ? `${identite.apparitions} apparitions` : 'pas encore calculé' }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Son poste</span>
          <span class="cm-kpi__value prc__kpi-texte">{{ identite ? identite.poste : 'non lu' }}</span>
          <span class="cm-kpi__detail">{{ identite ? identite.partDuPoste ?? 'part de ses minutes inconnue' : 'pas encore calculé' }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Dernier match relevé</span>
          <span class="cm-kpi__value prc__kpi-texte">{{ identite?.dernierMatch ?? 'non lu' }}</span>
          <span class="cm-kpi__detail">{{ identite ? `fiche valable depuis le ${identite.valableDepuis}` : 'pas encore calculé' }}</span>
        </div>
      </div>

      <!-- 2. D'où ça vient. -->
      <div class="prc__entete">
        <ProvenanceChip
          :source="provenance.source"
          :releve-le="provenance.releveLe"
          :action="provenance.action"
          :fichier="provenance.fichier"
          :detail="provenance.detail"
          :vieux-apres-heures="48"
        />
        <HelpTip
          titre="Comment la fiche est faite"
          texte="Chaque chiffre est ramené à 90 minutes, pondéré dans le temps (les matchs récents comptent davantage), corrigé de la force des adversaires et du niveau du championnat, puis rapproché de la moyenne de son poste d’autant plus qu’il a peu joué. L’apport offensif additionne ses xG hors penalty et ses xA au-dessus de la moyenne de son poste ; l’apport défensif compare les xG concédés pendant qu’il est sur le terrain à ceux de son poste (plus c’est haut, moins son équipe concède avec lui). La place compare le joueur aux joueurs du même poste, dans son championnat."
        />
      </div>
      <p v-if="identite" class="prc__texte">Calcul {{ identite.formule }}.</p>

      <!-- 3. Ce qui compte à son poste, puis le reste de la fiche. -->
      <h4 class="cm-group-title prc__groupe">Ce qu’il produit par 90 minutes</h4>
      <div class="cm-kpis prc__tuiles" data-tuiles>
        <div v-for="c in tuiles" :key="c.id" class="cm-kpi" :class="{ 'is-section': c.cle }" :title="`${c.libelle} (${c.unite})`" :data-tuile="c.id" :data-poste="c.cle ? 'oui' : 'non'">
          <span class="cm-kpi__label">{{ c.libelle }}</span>
          <span class="cm-kpi__value prc__valeur">{{ c.valeurTexte }}</span>
          <span class="cm-kpi__detail">{{ c.memoire ?? c.unite }}</span>
        </div>
      </div>

      <!-- 4. La courbe de forme : ses vingt dernières apparitions. -->
      <h4 class="cm-group-title prc__groupe">
        Sa forme
        <HelpTip
          titre="Lire la courbe"
          texte="Ses apports tels qu’ils valaient après chacune de ses vingt dernières apparitions : la courbe monte quand le joueur produit (ou protège) plus que la moyenne de son poste. Le trait plein est l’apport offensif, le trait en tirets l’apport défensif ; le pointillé gris est la moyenne de son poste (zéro)."
        />
      </h4>
      <p class="prc__texte" data-forme="phrase">{{ lignes.length ? formeDite(fiche?.courbe ?? [], { gardien }) : 'Pas encore de forme : la fiche n’a pas d’apparition à montrer.' }}</p>
      <figure class="prc__courbe" data-forme="courbe">
        <p v-if="courbe.vide" class="prc__texte">Il faut au moins deux apparitions pour une courbe.</p>
        <div v-else class="prc__trace">
          <svg class="prc__svg" :viewBox="`0 0 ${LARGEUR} ${HAUTEUR}`" preserveAspectRatio="none" role="img" :aria-label="`Apports de ${playerName} sur ses ${courbe.points.length} dernières apparitions`">
            <line class="prc__zero" x1="0" :x2="LARGEUR" :y1="courbe.zeroY" :y2="courbe.zeroY" />
            <path v-if="!gardien" class="prc__ligne" :d="courbe.offensif" />
            <path class="prc__ligne is-defensif" :d="courbe.defensif" />
          </svg>
          <span class="prc__repere is-haut cm-numeric">{{ apportSigne(courbe.max) }}</span>
          <span class="prc__repere is-bas cm-numeric">{{ apportSigne(courbe.min) }}</span>
        </div>
        <figcaption v-if="!courbe.vide" class="prc__legende">
          <span class="cm-numeric">{{ courbe.premiere.slice(8, 10) }}/{{ courbe.premiere.slice(5, 7) }}/{{ courbe.premiere.slice(0, 4) }}</span>
          <span class="prc__legende-milieu">
            <i v-if="!gardien" class="prc__trait" /> <template v-if="!gardien">apport offensif</template>
            <i class="prc__tiret" /> apport défensif <i class="prc__zerotrait" /> moyenne du poste
          </span>
          <span class="cm-numeric">{{ courbe.derniere.slice(8, 10) }}/{{ courbe.derniere.slice(5, 7) }}/{{ courbe.derniere.slice(0, 4) }}</span>
        </figcaption>
      </figure>

      <div class="cm-table-wrap prc__wrap">
        <table class="cm-table prc__table" data-tableau="apparitions">
          <thead>
            <tr>
              <th class="is-left">Apparition</th>
              <th title="Buts par 90 minutes (xG hors penalty + xA) au-dessus de la moyenne de son poste, après ce match">Apport offensif</th>
              <th title="xG concédés par 90 minutes de moins que la moyenne de son poste, après ce match">Apport défensif</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in lignes" :key="l.jour">
              <td class="is-left">
                <span class="cm-numeric prc__jour">{{ l.jourTexte }}</span>
                <span v-if="l.adversaire" class="prc__adversaire">
                  <TeamCrest :name="l.adversaire.nom ?? ''" :league="l.adversaire.championnat" :team-id="l.adversaire.id" :size="18" />
                  <span class="cm-truncate">{{ l.adversaire.domicile ? 'contre' : 'à' }} {{ l.adversaire.nom }}</span>
                </span>
              </td>
              <td class="cm-numeric" :class="{ 'is-sans-objet': gardien }">{{ l.offTexte }}</td>
              <td class="cm-numeric">{{ l.defTexte }}</td>
            </tr>
            <tr v-if="!lignes.length">
              <td class="is-left prc__vide" colspan="3">{{ lu.cle === 'chargement' ? 'Lecture de la fiche…' : lu.cle === 'pret' ? 'Aucune apparition à montrer.' : 'pas encore calculé' }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total<small class="prc__petit">{{ pied.sigma.texte }}</small></td>
              <td class="is-strong">{{ pied.sigma.offensif }}</td>
              <td class="is-strong">{{ pied.sigma.defensif }}</td>
            </tr>
            <tr>
              <td class="is-left prc__moyenne">⌀ Moyenne<small class="prc__petit">moyenne de chaque apport</small></td>
              <td class="prc__moyenne">{{ pied.moyenne.offensif }}</td>
              <td class="prc__moyenne">{{ pied.moyenne.defensif }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p class="prc__pied">
        <AppIcon name="shield" :size="12" />
        <span>Affichage seulement : aucun chiffre du moteur ne dépend de cette fiche, et ces notes ne paraissent jamais sur le terrain des compositions (qui montre seulement les notes de match et de saison).</span>
      </p>
    </div>
  </AppCard>
</template>

<style scoped>
.prc {
  container: prc / inline-size;
}

.prc__corps {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.prc__joueur {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin: 0;
  font-size: 14px;
  color: var(--cm-text-primary);
}

.prc__club {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  color: var(--cm-text-secondary);
}

.prc__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.prc__kpi-texte {
  font-size: 17px;
  line-height: 1.3;
}

/* Un joueur bien classé : bleu d'information ; mal classé : ambre. Jamais le vert ni le rouge. */
.prc__kpis .cm-kpi.is-fort {
  border-color: rgba(var(--cm-info-rgb) / 0.4);
}

.prc__kpis .cm-kpi.is-fort .cm-kpi__value {
  color: var(--cm-info);
}

.prc__kpis .cm-kpi.is-faible {
  border-color: rgba(var(--cm-warning-rgb) / 0.4);
}

.prc__kpis .cm-kpi.is-faible .cm-kpi__value {
  color: var(--cm-warning);
}

.prc__tuiles {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.prc__valeur {
  font-size: 19px;
}

.prc__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.prc__entete {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.prc__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.prc__courbe {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 14px 16px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.prc__trace {
  position: relative;
  height: 120px;
  margin-left: 52px;
}

.prc__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.prc__ligne {
  fill: none;
  stroke: var(--cm-section);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.prc__ligne.is-defensif {
  stroke: var(--cm-info);
  stroke-dasharray: 6 4;
}

.prc__zero {
  stroke: var(--cm-border-strong);
  stroke-width: 1;
  stroke-dasharray: 3 4;
  vector-effect: non-scaling-stroke;
}

.prc__repere {
  position: absolute;
  left: -52px;
  width: 46px;
  font-size: 10.5px;
  text-align: right;
  color: var(--cm-text-muted);
  transform: translateY(-50%);
}

.prc__repere.is-haut {
  top: 10%;
}

.prc__repere.is-bas {
  top: 90%;
}

.prc__legende {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: 52px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.prc__legende-milieu {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.prc__trait,
.prc__tiret,
.prc__zerotrait {
  display: inline-block;
  width: 18px;
  height: 0;
}

.prc__trait {
  border-top: 2px solid var(--cm-section);
}

.prc__tiret {
  border-top: 2px dashed var(--cm-info);
}

.prc__zerotrait {
  border-top: 1px dashed var(--cm-border-strong);
}

.prc__wrap {
  max-height: 520px;
}

.prc__jour {
  margin-right: 10px;
  color: var(--cm-text-primary);
}

.prc__adversaire {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  vertical-align: middle;
  color: var(--cm-text-secondary);
}

.prc__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.prc__vide {
  color: var(--cm-text-secondary);
  white-space: normal;
}

.prc__moyenne {
  color: var(--cm-text-muted);
}

.prc__table .is-sans-objet {
  color: var(--cm-text-muted);
  font-size: 11px;
}

.prc__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.prc__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container prc (max-width: 560px) {
  .prc__trace,
  .prc__legende {
    margin-left: 40px;
  }

  .prc__repere {
    left: -40px;
    width: 36px;
  }
}
</style>
