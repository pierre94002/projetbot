<script setup>
import { computed, ref } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppToggle from '@/components/common/AppToggle.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import BettingMapChip from '@/components/common/BettingMapChip.vue';
import { useFavoritesStore } from '@/stores/favoritesStore.js';
import { grilleDeLaCarte, bandeauDeLaCarte, provenanceDeLaCarte, championnatsAAjouter, infosDeLaCase, ditDeLaCase } from '@/utils/carteOuParier.js';

/**
 * LA CARTE « OÙ PARIER » (étape 23 du plan, 22/10/2026) : championnats en lignes, marchés en colonnes, chaque
 * case avec son mot, son écart et son nombre de matchs (BettingMapChip). `reponse` : ce que rend
 * GET /api/betting-map. Rien n'est jugé ici : la couleur et la phrase viennent du serveur. Sans carte : la phrase
 * « pas encore mesuré » et ce qu'il faut faire (un premier rejeu du banc d'essai).
 */
const props = defineProps({
  reponse: { type: Object, default: null }
});

const favoris = useFavoritesStore();
const groupe = ref('buts');
const seulementJugees = ref(false);
const choisie = ref(null);

const groupeOptions = computed(() => (props.reponse?.groupes ?? []).map((g) => ({ value: g.id, label: g.titre })));
const grille = computed(() => grilleDeLaCarte(props.reponse, { groupe: groupe.value, seulementJugees: seulementJugees.value, favori: (l) => favoris.isFavoriteLeague(l) }));
const bandeau = computed(() => bandeauDeLaCarte(props.reponse));
const provenance = computed(() => provenanceDeLaCarte(props.reponse));
const aAjouter = computed(() => championnatsAAjouter(props.reponse));
const regle = computed(() => props.reponse?.regle ?? null);

function choisir(ligne, k, col) {
  if (!k) return;
  choisie.value = { nom: ligne.nom, colonne: col.libelle, k, infos: infosDeLaCase(k) };
}
const ditEpreuve = (e) => props.reponse?.epreuves?.[e.id]?.titre ?? e.id;
const VERDICTS = { retenu: 'retenu (au-delà du hasard)', 'moins-bon': 'moins bon (au-delà du hasard)', 'pas-prouve': 'pas prouvé (dans le hasard)', 'pas-assez-de-matchs': 'trop peu de matchs' };
function ecartEpreuve(e) {
  const g = e?.enPourcent?.gain;
  if (!Number.isFinite(g)) return '';
  const f = e.enPourcent.fourchette;
  const s = (x) => `${x > 0 ? '+' : x < 0 ? '−' : '+'}${Math.abs(x).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  return `${s(g)} %${Array.isArray(f) ? ` [${s(f[0])} ; ${s(f[1])}]` : ''} ${e.enPourcent.quoi ?? ''}`.trim();
}
</script>

<template>
  <div class="bmg">
    <!-- Le bandeau : les comptes, la phrase honnête (rien de vert n'est une information, pas une panne). -->
    <div class="cm-note" :class="bandeau.comptes ? (bandeau.comptes.vertes ? 'is-info' : 'is-warning') : 'is-info'">
      <span class="cm-icon-box is-sm" :class="bandeau.comptes ? 'is-info' : 'is-warning'"><AppIcon name="grid" :size="14" /></span>
      <div class="bmg__note">
        <p class="cm-note__title">{{ bandeau.titre }}<HelpTip terme="carte-ou-parier" /></p>
        <p class="cm-note__text">{{ bandeau.phrase }}</p>
        <p v-if="provenance" class="bmg__source">{{ provenance }}</p>
      </div>
    </div>

    <template v-if="grille">
      <div class="bmg__filtres">
        <AppSelect v-model="groupe" label="Marchés" :options="groupeOptions" :searchable="false" />
        <AppToggle v-model="seulementJugees" label="Seulement les championnats jugés" description="Ceux qui ont au moins une case verte, rouge ou « pas prouvé »" />
      </div>

      <div class="cm-table-wrap bmg__wrap">
        <table class="cm-table bmg__table">
          <thead>
            <tr>
              <th scope="col" class="bmg__ligue">Championnat</th>
              <th v-for="col in grille.colonnes" :key="col.id" scope="col" :title="col.libelle">{{ col.court }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in grille.lignes" :key="l.league">
              <th scope="row" class="bmg__ligue" :title="l.moment ? `Meilleur moment pour parier (étape 22) : ${l.moment}` : l.nom">
                <span class="cm-truncate">{{ l.nom }}</span>
                <span v-if="l.favori" class="bmg__fav" title="Championnat favori">★</span>
                <span v-if="l.horsAppli" class="cm-chip bmg__hors" title="Championnat de football-data que l’appli ne suit pas encore">hors appli</span>
              </th>
              <td v-for="(k, i) in l.cases" :key="grille.colonnes[i].id" class="bmg__case">
                <button v-if="k" type="button" class="bmg__bouton" :aria-label="`${l.nom}, ${grille.colonnes[i].libelle} : ${k.phrase}`" @click="choisir(l, k, grille.colonnes[i])">
                  <BettingMapChip :case-carte="k" avec-ecart />
                </button>
                <span v-else class="bmg__vide">—</span>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" class="bmg__ligue">Σ {{ grille.lignes.length }} championnats</th>
              <td v-for="(s, i) in grille.sommes" :key="grille.colonnes[i].id" class="bmg__somme cm-numeric" :title="`${s.vert} verte(s), ${s.rouge} rouge(s), ${s.gris} grise(s)`">
                {{ s.vert }} · {{ s.rouge }} · {{ s.gris }}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="bmg__legende">Σ par colonne : vertes · rouges · grises. Une case se lit sans la couleur : son mot, et sa phrase au survol ou au clic.</p>

      <!-- Le détail d'une case choisie : ses épreuves (ce qui décide) et ses informations (ce qui ne décide jamais). -->
      <div v-if="choisie" class="bmg__detail" role="region" :aria-label="`Détail : ${choisie.nom}, ${choisie.colonne}`">
        <p class="bmg__detail-titre">
          <strong>{{ choisie.nom }} · {{ choisie.colonne }}</strong>
          <BettingMapChip :case-carte="choisie.k" />
          <button type="button" class="bmg__fermer" aria-label="Fermer le détail" @click="choisie = null"><AppIcon name="x" :size="12" /></button>
        </p>
        <p class="bmg__phrase">{{ choisie.k.phrase }}</p>
        <ul v-if="choisie.k.epreuves?.length" class="bmg__liste">
          <li v-for="e in choisie.k.epreuves" :key="e.id">
            <strong>{{ ditEpreuve(e) }}</strong> — {{ VERDICTS[e.verdict] ?? e.verdict }}, {{ (e.matchs ?? 0).toLocaleString('fr-FR') }} matchs<template v-if="ecartEpreuve(e)">, {{ ecartEpreuve(e) }}</template>
            <template v-if="e.variantes"> · cases jugées ensemble : {{ e.variantes.toLocaleString('fr-FR') }}</template>
            <template v-if="e.periode"> · {{ e.periode }}</template>
            <template v-if="e.etiquette === 'code-precedent'"> · banc d’une version de code précédente du moteur</template>
            <template v-if="e.note"> · {{ e.note }}</template>
          </li>
        </ul>
        <ul v-if="choisie.infos.length" class="bmg__liste bmg__infos">
          <li v-for="(t, i) in choisie.infos" :key="i">{{ t }}</li>
        </ul>
      </div>

      <!-- Les championnats que l'appli ne suit pas : ce que la carte en dit. -->
      <div v-if="aAjouter.length" class="bmg__ajouter">
        <p class="cm-note__title">Championnats à ajouter ?</p>
        <ul class="bmg__liste">
          <li v-for="x in aAjouter" :key="x.league">
            <strong>{{ x.nom }}</strong> — <span :class="`bmg__statut bmg__statut--${x.ton}`">{{ x.phrase }}</span>
          </li>
        </ul>
        <p class="bmg__source">{{ reponse.carte.contenu.horsCarte }}</p>
      </div>
    </template>

    <ul v-if="regle" class="bmg__regle">
      <li><strong>{{ ditDeLaCase({ couleur: 'vert', raison: 'prouve' }).mot }}</strong> : {{ regle.verte }}</li>
      <li><strong>{{ ditDeLaCase({ couleur: 'rouge', raison: 'moins-bon' }).mot }}</strong> : {{ regle.rouge }}</li>
      <li><strong>Gris</strong> : {{ regle.grise }}</li>
      <li>{{ regle.hasard }}</li>
      <li>{{ regle.informations }} {{ regle.lecture }}</li>
    </ul>
  </div>
</template>

<style scoped>
.bmg {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.bmg__note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.bmg__source {
  margin: 0;
  color: var(--cm-text-muted);
  font-size: 11.5px;
}

.bmg__filtres {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}

.bmg__wrap {
  max-height: 560px;
  overflow: auto;
}

.bmg__table th,
.bmg__table td {
  white-space: nowrap;
}

/* La colonne des championnats reste visible quand on fait défiler les marchés. */
.bmg__ligue {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--cm-surface-raised);
  max-width: 220px;
  text-align: left;
}

.bmg__fav {
  margin-left: 4px;
  color: var(--cm-gold);
}

.bmg__hors {
  margin-left: 6px;
  font-size: 10px;
}

.bmg__case {
  padding: 4px 6px;
}

.bmg__bouton {
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  max-width: 100%;
}

.bmg__bouton:focus-visible {
  outline: 2px solid var(--cm-section);
  outline-offset: 2px;
  border-radius: 999px;
}

.bmg__vide {
  color: var(--cm-text-muted);
}

.bmg__somme {
  font-size: 11.5px;
  color: var(--cm-text-secondary);
}

.bmg__legende {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.bmg__detail,
.bmg__ajouter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid var(--cm-border-soft);
  border-radius: var(--cm-radius);
  background: var(--cm-surface-alt);
}

.bmg__detail-titre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.bmg__fermer {
  margin-left: auto;
  padding: 4px;
  border: 0;
  background: none;
  color: var(--cm-text-muted);
  cursor: pointer;
}

.bmg__phrase {
  margin: 0;
}

.bmg__liste {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12.5px;
}

.bmg__infos {
  color: var(--cm-text-secondary);
}

.bmg__statut--rouge {
  color: var(--cm-danger);
}

.bmg__statut--gris {
  color: var(--cm-text-secondary);
}

.bmg__regle {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--cm-text-secondary);
}
</style>
