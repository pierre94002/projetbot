<script setup>
/**
 * Le bloc « INDICE DE FORCE » de la page d'une équipe (étape 31 du plan, 22/10/2026) : ce que l'étape 29 calcule
 * chaque nuit — la force du club, corrigée de la force des adversaires affrontés, et la place de chacune de ses
 * statistiques parmi les clubs de son championnat (points forts et points faibles), au total, à domicile et à
 * l'extérieur — puis la forme (la note dans le temps).
 *
 * Tout est LU (GET /api/match-stats/team-strength?club=…&historique=oui, une table calculée la nuit par
 * l'actualisation, server/src/data/db/teamStrength.js) : rien n'est calculé à l'ouverture de la page, aucun appel
 * payant. Le bloc reste TOUJOURS affiché, tableau compris, même vide (« pas encore calculé », « pas assez de
 * matchs », « non relevé ») ; il montre sa source réelle et l'heure du calcul. Affichage seulement : aucun chiffre du
 * moteur n'en dépend.
 *
 * Les mots viennent de utils/indiceDeForce.js (pur, rejoué par server/test/fichesEcran.test.mjs). Le club est
 * reconnu par son identifiant FotMob ; la page change de club en relisant (surveillance de `clubId`).
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import {
  LIEUX,
  SEUILS,
  etatDuBloc,
  lignesDuTableau,
  piedDuTableau,
  sigmaDit,
  moyenneDite,
  pointsDeLaLigne,
  chiffresCles,
  courbeDeForme,
  reperesDeForme,
  formeDite,
  bancDit,
  formuleDite,
  jourDit,
  noteSignee,
  provenanceDuBloc
} from '@/utils/indiceDeForce.js';

const props = defineProps({
  /** L'identifiant FotMob du club (« fotmob-8456 ») ; sans lui, le bloc le dit et garde ses tableaux. */
  clubId: { type: String, default: null },
  clubName: { type: String, default: '' },
  league: { type: String, default: null }
});

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  const club = props.clubId;
  if (!club) {
    etat.value = { loading: false, error: null, data: null };
    return;
  }
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.teamStrength(club, { historique: true });
    // Une réponse arrivée après un changement de club est ignorée.
    if (props.clubId === club) etat.value = { loading: false, error: null, data };
  } catch (error) {
    if (props.clubId === club) etat.value = { loading: false, error: error.message, data: null };
  }
}

onMounted(charger);
watch(
  () => props.clubId,
  (apres, avant) => {
    if (apres === avant) return;
    etat.value = { loading: false, error: null, data: null };
    charger();
  }
);

// ------------------------------------------------------------ présentation
const reponse = computed(() => etat.value.data);
const lu = computed(() => etatDuBloc({ chargement: etat.value.loading, erreur: etat.value.error, reponse: reponse.value, clubId: props.clubId }));
// La lecture existe quand l'indice est calculé : un club sans ligne (« sans-ligne ») garde sa lecture, aux lignes vides.
const lecture = computed(() => (lu.value.cle === 'pret' || lu.value.cle === 'sans-ligne' ? reponse.value?.lecture ?? null : null));
const ligne = computed(() => lecture.value?.lignes?.tous ?? null);
const lignes = computed(() => lignesDuTableau(lecture.value, lu.value.cle));
const pied = computed(() => piedDuTableau(lignes.value));
const points = computed(() => pointsDeLaLigne(ligne.value));
const cles = computed(() => chiffresCles(lecture.value, lu.value.cle));
const historique = computed(() => lecture.value?.historique ?? []);
const courbe = computed(() => courbeDeForme(historique.value));
const forme = computed(() => reperesDeForme(historique.value));
const provenance = computed(() => provenanceDuBloc(reponse.value));
const banc = computed(() => bancDit(reponse.value?.banc ?? null));
const championnat = computed(() => ligne.value?.championnat ?? props.league ?? null);
const LARGEUR = 600;
const HAUTEUR = 110;
const COTES = Object.freeze({ pour: 'ce qu’il produit', contre: 'ce qu’il concède', note: 'part du ballon' });
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
</script>

<template>
  <AppCard
    class="tsc"
    icon="bolt"
    eyebrow="Calculé chaque nuit"
    title="Indice de force"
    subtitle="Sa force réelle, corrigée du niveau des adversaires affrontés : plus fiable que le classement"
    :data-etat="lu.cle"
    data-bloc="indice-de-force"
  >
    <template #actions>
      <AppButton variant="secondary" size="sm" :loading="etat.loading" :disabled="!clubId" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </template>

    <div class="tsc__corps">
      <!-- 0. De quel club on parle : son logo et son championnat. -->
      <p class="tsc__club">
        <TeamCrest :name="clubName" :league="league" :team-id="clubId" :size="26" />
        <strong class="cm-truncate">{{ clubName }}</strong>
        <span v-if="championnat" class="cm-chip tsc__ligue"><LeagueBadge :league="championnat" /></span>
        <span v-if="ligne" class="cm-chip is-section" title="La place du club dans son championnat, d’après sa force corrigée des adversaires.">{{ cles.place.valeur }}</span>
      </p>

      <LoadingSpinner v-if="lu.cle === 'chargement'" label="Lecture de l’indice de force…" />

      <div v-if="lu.texte && lu.cle !== 'chargement'" class="cm-note" :class="lu.ton" :data-raison="lu.cle">
        <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(lu.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ lu.titre }}</p>
          <p class="cm-note__text tsc__texte">{{ lu.texte }}</p>
        </div>
      </div>

      <div v-if="lu.aRefaire" class="cm-note is-warning" data-raison="autre-version">
        <span class="cm-icon-box is-warning"><AppIcon name="clock" :size="16" /></span>
        <div>
          <p class="cm-note__title">Calcul d’une autre version</p>
          <p class="cm-note__text tsc__texte">L’indice lu a été fait par une autre forme du calcul : la prochaine passe de nuit le refait. Ses chiffres restent lus en attendant.</p>
        </div>
      </div>

      <!-- 1. Les chiffres clés. -->
      <div class="cm-kpis tsc__kpis">
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">Note de force</span>
          <span class="cm-kpi__value">{{ cles.note.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.note.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Place dans son championnat</span>
          <span class="cm-kpi__value">{{ cles.place.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.place.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">À domicile</span>
          <span class="cm-kpi__value tsc__kpi-texte">{{ cles.terrain.dom }}</span>
          <span class="cm-kpi__detail">son indice sur ses matchs à domicile</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">À l’extérieur</span>
          <span class="cm-kpi__value tsc__kpi-texte">{{ cles.terrain.ext }}</span>
          <span class="cm-kpi__detail">son indice sur ses matchs à l’extérieur</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Matchs en mémoire</span>
          <span class="cm-kpi__value">{{ cles.memoire.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.memoire.detail }}</span>
        </div>
      </div>

      <!-- 2. D'où ça vient. -->
      <div class="tsc__entete">
        <ProvenanceChip
          :source="provenance.source"
          :releve-le="provenance.releveLe"
          :action="provenance.action"
          :fichier="provenance.fichier"
          :detail="provenance.detail"
          :vieux-apres-heures="48"
        />
        <span v-if="reponse?.jusquA" class="tsc__petit-texte">Matchs pris en compte jusqu’au {{ jourDit(reponse.jusquA) }}</span>
      </div>
      <p v-if="ligne" class="tsc__texte">{{ formuleDite(ligne) }}</p>

      <!-- 3. Les points forts et les points faibles. -->
      <h4 class="cm-group-title tsc__groupe">
        Points forts et points faibles
        <HelpTip
          titre="Lire les places"
          :texte="`Chaque statistique est classée parmi les clubs de son championnat, corrigée de la force des adversaires affrontés. 100 % : la meilleure équipe du championnat ; 0 % : la moins bonne. Même pour ce qu’on concède, plus la place est haute, mieux c’est (on en concède peu). À partir de ${SEUILS.pointFort} %, c’est un point fort ; à ${SEUILS.pointFaible} % ou moins, un point faible.`"
        />
      </h4>
      <div class="cm-grid-2 tsc__points">
        <section class="cm-block tsc__bloc is-fort" data-points="forts">
          <p class="tsc__bloc-titre"><AppIcon name="trendUp" :size="14" />Points forts</p>
          <ul v-if="points.forts.length" class="tsc__liste">
            <li v-for="p in points.forts" :key="p.id" :title="p.phrase">
              <span class="tsc__nom">{{ p.libelle }}</span>
              <span class="tsc__barre is-fort"><i :style="{ width: `${p.percentile}%` }" /></span>
              <span class="cm-numeric tsc__place">{{ p.place }}</span>
            </li>
          </ul>
          <p v-else class="tsc__vide">{{ ligne ? `Aucun point fort marqué : aucune statistique ne place ce club dans le quart du haut de son championnat (${SEUILS.pointFort} % ou plus).` : lu.cle === 'sans-ligne' ? 'pas d’indice pour ce club' : 'pas encore calculé' }}</p>
        </section>
        <section class="cm-block tsc__bloc is-faible" data-points="faibles">
          <p class="tsc__bloc-titre"><AppIcon name="trendDown" :size="14" />Points faibles</p>
          <ul v-if="points.faibles.length" class="tsc__liste">
            <li v-for="p in points.faibles" :key="p.id" :title="p.phrase">
              <span class="tsc__nom">{{ p.libelle }}</span>
              <span class="tsc__barre is-faible"><i :style="{ width: `${p.percentile}%` }" /></span>
              <span class="cm-numeric tsc__place">{{ p.place }}</span>
            </li>
          </ul>
          <p v-else class="tsc__vide">{{ ligne ? `Aucun point faible marqué : aucune statistique ne place ce club dans le quart du bas de son championnat (${SEUILS.pointFaible} % ou moins).` : lu.cle === 'sans-ligne' ? 'pas d’indice pour ce club' : 'pas encore calculé' }}</p>
        </section>
      </div>

      <!-- 4. Le tableau : les treize statistiques, au total, à domicile et à l'extérieur. -->
      <h4 class="cm-group-title tsc__groupe">
        Ses statistiques, au total, à domicile et à l’extérieur
        <HelpTip
          titre="Comment lire ce tableau"
          texte="Une ligne par statistique, par match, face à un adversaire moyen de son championnat : les adversaires réellement affrontés sont retirés du calcul. À côté de la valeur, sa place parmi les clubs du championnat. Au pied : Σ compte les statistiques relevées (jamais une somme de valeurs d’unités différentes) avec leurs points forts et faibles ; ⌀ est la place moyenne."
        />
      </h4>
      <div class="cm-table-wrap tsc__wrap">
        <table class="cm-table tsc__table" data-tableau="statistiques">
          <thead>
            <tr>
              <th class="is-left">Statistique</th>
              <th v-for="l in LIEUX" :key="l.cle" :title="`Sur ${l.phrase}`">{{ l.titre }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in lignes" :key="r.id">
              <td class="is-left is-strong">{{ r.libelle }}<small class="tsc__petit">{{ COTES[r.cote] }}</small></td>
              <td v-for="l in LIEUX" :key="l.cle" class="tsc__case" :class="[r.cases[l.cle].ton, { 'is-vide': r.cases[l.cle].vide }]" :title="r.cases[l.cle].titre">
                <template v-if="!r.cases[l.cle].vide">
                  <span class="cm-numeric tsc__valeur">{{ r.cases[l.cle].valeurTexte }}</span>
                  <span class="tsc__barre" :class="r.cases[l.cle].ton"><i :style="{ width: `${r.cases[l.cle].percentile ?? 0}%` }" /></span>
                  <small class="tsc__petit">{{ r.cases[l.cle].placeTexte ? `place ${r.cases[l.cle].placeTexte}` : 'place inconnue' }}</small>
                </template>
                <span v-else>{{ r.cases[l.cle].valeurTexte }}</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td class="is-left is-strong">Σ Total<small class="tsc__petit">statistiques relevées sur {{ lignes.length }}</small></td>
              <td v-for="l in LIEUX" :key="l.cle" class="is-strong">{{ sigmaDit(pied.sigma[l.cle]) }}</td>
            </tr>
            <tr>
              <td class="is-left tsc__moyenne">⌀ Moyenne<small class="tsc__petit">place moyenne des statistiques relevées</small></td>
              <td v-for="l in LIEUX" :key="l.cle" class="tsc__moyenne">{{ moyenneDite(pied.moyenne[l.cle]) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 5. La forme : sa note dans le temps. -->
      <h4 class="cm-group-title tsc__groupe">
        La forme
        <HelpTip
          titre="Lire la forme"
          texte="Sa note de force aux derniers jours de match : la courbe monte quand le club prend de la force face aux adversaires affrontés. Une tendance n’est ni bonne ni mauvaise en soi : elle dit seulement d’où le club vient."
        />
      </h4>
      <p class="tsc__texte" data-forme="phrase">{{ historique.length ? formeDite(historique) : 'Pas encore de forme : l’indice n’a pas d’historique pour ce club.' }}</p>
      <figure class="tsc__courbe" data-forme="courbe">
        <p v-if="courbe.vide" class="tsc__texte">Il faut au moins deux jours de match pour une courbe.</p>
        <div v-else class="tsc__trace">
          <svg class="tsc__svg" :viewBox="`0 0 ${LARGEUR} ${HAUTEUR}`" preserveAspectRatio="none" role="img" :aria-label="`Note de force de ${clubName} du ${jourDit(courbe.premiere)} au ${jourDit(courbe.derniere)}`">
            <path class="tsc__ligne" :d="courbe.chemin" />
          </svg>
          <span
            v-for="p in courbe.points"
            :key="p.jour"
            class="tsc__point"
            :class="{ 'is-actuel': p.actuel }"
            :style="{ left: `${(100 * p.x) / LARGEUR}%`, top: `${(100 * p.y) / HAUTEUR}%` }"
            :title="`${jourDit(p.jour)} : note ${noteSignee(p.force)}`"
          />
          <span class="tsc__repere is-haut cm-numeric">{{ noteSignee(courbe.max) }}</span>
          <span class="tsc__repere is-bas cm-numeric">{{ noteSignee(courbe.min) }}</span>
        </div>
        <figcaption v-if="!courbe.vide" class="tsc__legende">
          <span class="cm-numeric">{{ jourDit(courbe.premiere) }}</span>
          <span>sa note de force, jour de match après jour de match</span>
          <span class="cm-numeric">{{ jourDit(courbe.derniere) }}</span>
        </figcaption>
      </figure>
      <div class="cm-kpis tsc__kpis tsc__kpis--forme" data-forme="reperes">
        <div class="cm-kpi">
          <span class="cm-kpi__label">Aujourd’hui</span>
          <span class="cm-kpi__value tsc__kpi-texte">{{ forme.maintenant ? forme.maintenant.note : 'pas calculée' }}</span>
          <span class="cm-kpi__detail">{{ forme.maintenant ? `${forme.maintenant.place}, au ${forme.maintenant.jour}` : 'pas d’historique' }}</span>
        </div>
        <div v-for="r in forme.reperes" :key="r.n" class="cm-kpi">
          <span class="cm-kpi__label">{{ r.libelle }}</span>
          <span class="cm-kpi__value tsc__kpi-texte">{{ r.note }}</span>
          <span class="cm-kpi__detail">{{ r.ecart ? `${r.place}, le ${r.jour} ; depuis : ${r.ecart}` : 'pas assez de matchs relevés' }}</span>
        </div>
      </div>

      <!-- 6. Ce que le banc d'essai en dit, et la règle. -->
      <p class="tsc__pied" data-banc>
        <AppIcon name="shield" :size="12" />
        <span>Mesure au banc d’essai — {{ banc.texte }} Affichage seulement : aucun chiffre du moteur ne dépend de cet indice.</span>
      </p>
    </div>
  </AppCard>
</template>

<style scoped>
.tsc {
  container: tsc / inline-size;
}

.tsc__corps {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tsc__club {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  color: var(--cm-text-primary);
}

.tsc__ligue {
  max-width: 100%;
}

.tsc__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.tsc__kpi-texte {
  font-size: 17px;
  line-height: 1.3;
}

.tsc__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.tsc__entete {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.tsc__petit-texte {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.tsc__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

/* Les points forts (bleu d'information) et faibles (ambre) : jamais le vert ni le rouge. */
.tsc__bloc {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tsc__bloc-titre {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--cm-text-secondary);
}

.tsc__bloc.is-fort .tsc__bloc-titre {
  color: var(--cm-info);
}

.tsc__bloc.is-faible .tsc__bloc-titre {
  color: var(--cm-warning);
}

.tsc__liste {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tsc__liste li {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(60px, 1fr) auto;
  align-items: center;
  gap: 10px;
  font-size: 12.5px;
}

.tsc__nom {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--cm-text-primary);
}

.tsc__place {
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.tsc__vide {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

/* La barre d'une place : 0 à 100 %. */
.tsc__barre {
  display: block;
  height: 6px;
  min-width: 48px;
  border-radius: 999px;
  background: var(--cm-surface-hover);
  overflow: hidden;
}

.tsc__barre i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--cm-text-muted);
}

.tsc__barre.is-fort i {
  background: var(--cm-info);
}

.tsc__barre.is-faible i {
  background: var(--cm-warning);
}

.tsc__wrap {
  max-height: 640px;
}

.tsc__table td {
  vertical-align: top;
}

.tsc__case {
  min-width: 132px;
  white-space: normal;
}

.tsc__case.is-vide {
  min-width: 110px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.tsc__case .tsc__barre {
  margin: 5px 0 3px auto;
  max-width: 96px;
}

.tsc__valeur {
  font-weight: 700;
  color: var(--cm-text-primary);
}

.tsc__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.tsc__moyenne {
  color: var(--cm-text-muted);
}

/* La forme : une courbe sobre, la couleur de section, jamais le vert ni le rouge. */
.tsc__courbe {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 14px 16px 12px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.tsc__trace {
  position: relative;
  height: 110px;
  margin-left: 52px;
}

.tsc__svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.tsc__ligne {
  fill: none;
  stroke: var(--cm-section);
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.tsc__point {
  position: absolute;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--cm-section);
  transform: translate(-50%, -50%);
}

.tsc__point.is-actuel {
  box-shadow: 0 0 0 3px rgba(var(--cm-section-rgb) / 0.35);
}

.tsc__repere {
  position: absolute;
  left: -52px;
  width: 46px;
  font-size: 10.5px;
  text-align: right;
  color: var(--cm-text-muted);
  transform: translateY(-50%);
}

.tsc__repere.is-haut {
  top: 10%;
}

.tsc__repere.is-bas {
  top: 90%;
}

.tsc__legende {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: 52px;
  font-size: 11px;
  color: var(--cm-text-muted);
}

.tsc__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.tsc__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container tsc (max-width: 560px) {
  .tsc__trace,
  .tsc__legende {
    margin-left: 40px;
  }

  .tsc__repere {
    left: -40px;
    width: 36px;
  }

  .tsc__liste li {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .tsc__liste li .tsc__barre {
    grid-column: 1 / -1;
    order: 3;
  }
}
</style>
