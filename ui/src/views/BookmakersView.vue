<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import BookmakerBiasCard from '@/components/analysis/BookmakerBiasCard.vue';
import BookmakerMarginsCard from '@/components/analysis/BookmakerMarginsCard.vue';
import BookmakerRankingCard from '@/components/analysis/BookmakerRankingCard.vue';
import MarketMomentsCard from '@/components/analysis/MarketMomentsCard.vue';
import MarketReproductionCard from '@/components/analysis/MarketReproductionCard.vue';
import { marketKnowledgeApi } from '@/services/marketKnowledgeApi.js';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { PAGE, PORTEE_TOUS, chiffresCles, etatDeLaPage, optionsDesChampionnats, provenanceDeLaPage } from '@/utils/bookmakers.js';
import { formatLeagueOptionLabel } from '@/utils/leagueDisplay.js';

/**
 * BOOKMAKERS (étape 31 du plan, 22/10/2026) : ce que l'étape 22 a mesuré du marché, sur toutes les cotes archivées —
 * le meilleur moment pour parier, qui est le plus juste, qui bouge le premier, ce que chacun garde (sa marge) et ce
 * qu'il se trompe à dire (ses biais) —, championnat par championnat, et le contrôle qui dit si on retrouve la mesure
 * du 23/09. Une page du menu (section « Mes paris », la couleur de l'argent : c'est ici qu'on décide chez qui et quand
 * parier).
 *
 * Tout est LU : GET /api/market-knowledge (une table calculée chaque nuit par l'actualisation, le championnat choisi à
 * chaque lecture, 0,2 à 0,3 Mo). Rien n'est calculé à l'ouverture, aucun appel payant, aucune écriture. La page
 * reste TOUJOURS affichée, tous ses tableaux comme leurs en-têtes, même sans mesure (« pas encore mesuré »). Le
 * championnat choisi vit dans l'adresse (?championnat=…) : un lien le partage, un clic dans la liste « championnat par
 * championnat » le change, et la page relit. Mesuré seulement : le moteur ne lit rien d'ici.
 * Les mots viennent de utils/bookmakers.js (pur, rejoué par server/test/bookmakersEcran.test.mjs).
 */
const route = useRoute();
const router = useRouter();
const favoris = useFavoritesStore();

const portee = ref(typeof route.query.championnat === 'string' && route.query.championnat ? route.query.championnat : PORTEE_TOUS);
const etat = ref({ loading: true, error: null, data: null });

async function charger() {
  const choisie = portee.value;
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await marketKnowledgeApi.get({ championnat: choisie });
    // Une réponse arrivée après un autre choix est ignorée.
    if (portee.value === choisie) etat.value = { loading: false, error: null, data };
  } catch (error) {
    // Une lecture ratée garde la dernière page à l'écran, l'erreur au-dessus.
    if (portee.value === choisie) etat.value = { loading: false, error: error.message, data: etat.value.data };
  }
}
onMounted(charger);
watch(portee, (apres, avant) => {
  if (apres === avant) return;
  // Le choix vit dans l'adresse (lien à partager) sans empiler l'historique.
  const query = { ...route.query };
  if (apres === PORTEE_TOUS) delete query.championnat;
  else query.championnat = apres;
  if ((route.query.championnat ?? PORTEE_TOUS) !== apres) router.replace({ query });
  charger();
});
// Un lien vers un autre championnat alors que la page est déjà ouverte : le choix suit l'adresse.
watch(
  () => route.query.championnat,
  (c) => {
    const voulu = typeof c === 'string' && c ? c : PORTEE_TOUS;
    if (voulu !== portee.value) portee.value = voulu;
  }
);

// ------------------------------------------------------------ présentation
const reponse = computed(() => etat.value.data);
const erreurSansDonnees = computed(() => (reponse.value ? null : etat.value.error));
const lu = computed(() => etatDeLaPage({ chargement: etat.value.loading, erreur: erreurSansDonnees.value, reponse: reponse.value }));
const erreurDeRelecture = computed(() => (reponse.value ? etat.value.error : null));
const vide = computed(() => lu.value.vide);
const videControle = computed(() => lu.value.videControle);
const calculLu = computed(() => lu.value.calculLu);
const cles = computed(() => chiffresCles(reponse.value));
const provenance = computed(() => provenanceDeLaPage(reponse.value));
const options = computed(() =>
  optionsDesChampionnats(reponse.value, {
    favorisEnPremier: (liste) => favoris.favoritesFirst(liste, { league: (o) => o.league ?? null }),
    estFavori: (nom) => favoris.isFavoriteLeague(nom)
  })
);
const lignes = computed(() => reponse.value?.lignes ?? {});
const livres = computed(() => reponse.value?.livres ?? []);
// Le championnat dans les phrases des cartes, par le nom que l'appli lui donne dans ses listes (« EPL (ENG) », « Besta deildin
// (ISL) » pour « Besta deildin - Iceland ») : le pays lève l'ambiguïté de « Primera División » ou « Super League ».
const nom = computed(() => formatLeagueOptionLabel(reponse.value?.nom ?? (portee.value === PORTEE_TOUS ? 'Tous les championnats' : portee.value)));
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
</script>

<template>
  <div class="bookmakers cm-page" :aria-busy="etat.loading" :data-etat="lu.cle" data-page="bookmakers">
    <!-- 0. LE BANDEAU : ce que montre la page, le championnat à choisir, les chiffres clés -->
    <section class="cm-hero" aria-labelledby="bookmakers-titre">
      <div class="cm-hero__top">
        <h2 id="bookmakers-titre" class="cm-hero__title">
          <span class="cm-icon-box"><AppIcon :name="PAGE.icone" :size="18" /></span>
          {{ PAGE.titre }}
        </h2>
        <div class="cm-hero__chips">
          <span class="cm-chip is-section"><AppIcon name="database" :size="11" />{{ cles.calcul.valeur === 'aucun' ? 'aucun calcul' : `calcul ${cles.calcul.valeur}` }}</span>
          <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
            <template #icon><AppIcon name="refresh" :size="14" /></template>
            Relire
          </AppButton>
        </div>
      </div>
      <p class="cm-hero__subtitle">
        Ce que les cotes archivées apprennent des bookmakers : à quel moment la cote est la plus intéressante, qui est le plus juste, qui bouge le premier, ce que chacun garde (sa marge) et ce qu’il se trompe à dire (ses biais), championnat par championnat. Rien n’est calculé en ouvrant la page : chaque bloc dit d’où vient son chiffre, quand il a été mesuré et sur combien de matchs. Mesuré seulement : le moteur n’en lit rien.
      </p>
      <div class="cm-toolbar bookmakers__barre">
        <AppSelect v-model="portee" label="Championnat" :options="options" class="bookmakers__grow" />
        <ProvenanceChip
          :source="provenance.source"
          :releve-le="provenance.releveLe"
          :action="provenance.action"
          :fichier="provenance.fichier"
          :detail="provenance.detail"
          :vieux-apres-heures="48"
        />
      </div>
      <div class="cm-kpis bookmakers__kpis">
        <div class="cm-kpi is-section">
          <span class="cm-kpi__label">Calcul</span>
          <span class="cm-kpi__value">{{ cles.calcul.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.calcul.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Cotes lues</span>
          <span class="cm-kpi__value">{{ cles.cotes.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.cotes.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Le plus juste</span>
          <span class="cm-kpi__value bookmakers__kpi-texte">{{ cles.plusJuste.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.plusJuste.detail }}</span>
        </div>
        <div class="cm-kpi">
          <span class="cm-kpi__label">Bouge le premier</span>
          <span class="cm-kpi__value bookmakers__kpi-texte">{{ cles.premier.valeur }}</span>
          <span class="cm-kpi__detail">{{ cles.premier.detail }}</span>
        </div>
      </div>
    </section>

    <LoadingSpinner v-if="lu.cle === 'chargement'" label="Lecture de ce que le marché a appris…" />

    <div v-if="lu.texte && lu.cle !== 'chargement'" class="cm-note" :class="lu.ton" role="alert" :data-raison="lu.cle">
      <span class="cm-icon-box" :class="lu.ton === 'is-danger' ? 'is-danger' : lu.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(lu.ton)" :size="14" /></span>
      <div>
        <p class="cm-note__title">{{ lu.titre }}</p>
        <p class="cm-note__text">{{ lu.texte }}</p>
      </div>
    </div>

    <div v-if="erreurDeRelecture" class="cm-note is-danger" role="alert" data-raison="relecture">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
      <div>
        <p class="cm-note__title">Lecture impossible — dernière page affichée</p>
        <p class="cm-note__text">{{ erreurDeRelecture }}</p>
      </div>
    </div>

    <div v-if="lu.aRefaire" class="cm-note is-warning" data-raison="autre-version">
      <span class="cm-icon-box is-warning"><AppIcon name="clock" :size="14" /></span>
      <div>
        <p class="cm-note__title">Calcul d’une autre version</p>
        <p class="cm-note__text">Le calcul lu a été fait par une autre forme du calcul : la prochaine passe de nuit le refait. Ses chiffres restent lus en attendant.</p>
      </div>
    </div>

    <!-- 1. QUAND PARIER : la conclusion du championnat choisi, puis tous les championnats -->
    <MarketMomentsCard
      :portee="portee"
      :nom="nom"
      :lignes="lignes"
      :resume="reponse?.resume ?? null"
      :championnats="reponse?.championnats ?? []"
      :provenance="provenance"
      :vide="vide"
      :calcul-lu="calculLu"
      @choisir="portee = $event"
    />

    <!-- 2. QUI EST LE PLUS JUSTE, 3. QUI BOUGE LE PREMIER -->
    <BookmakerRankingCard mesure="justesse" :lignes="lignes" :livres="livres" :nom="nom" :provenance="provenance" :vide="vide" :calcul-lu="calculLu" />
    <BookmakerRankingCard mesure="vitesse" :lignes="lignes" :livres="livres" :nom="nom" :provenance="provenance" :vide="vide" :calcul-lu="calculLu" />

    <!-- 4. LES MARGES, 5. LES BIAIS -->
    <BookmakerMarginsCard :lignes="lignes" :livres="livres" :nom="nom" :provenance="provenance" :vide="vide" />
    <BookmakerBiasCard :lignes="lignes" :livres="livres" :nom="nom" :provenance="provenance" :vide="vide" />

    <!-- 6. LE CONTRÔLE : retrouve-t-on la mesure du 23/09 ? (il ne dépend pas du championnat choisi) -->
    <MarketReproductionCard :resume="reponse?.resume ?? null" :livres="livres" :provenance="provenance" :vide="videControle" />

    <p class="bookmakers__pied">
      <AppIcon name="shield" :size="12" />
      <span>{{ reponse?.regles?.methode ?? 'Chaque bookmaker est comparé aux autres sur les mêmes matchs, sa marge retirée de ses cotes.' }} {{ reponse?.regles?.juge ?? '' }} Mesuré seulement : le moteur ne lit rien de cette page, aucun de ses chiffres n’en dépend.</span>
    </p>
  </div>
</template>

<style scoped>
.bookmakers {
  /* Se règle sur SA largeur. */
  container: bookmakers / inline-size;
}

.bookmakers__barre {
  align-items: flex-end;
}

.bookmakers__grow {
  flex: 1 1 260px;
  max-width: 420px;
}

.bookmakers__kpis {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.bookmakers__kpi-texte {
  font-size: 16px;
  line-height: 1.3;
}

.bookmakers__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.bookmakers__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}
</style>
