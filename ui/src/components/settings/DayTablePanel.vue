<script setup>
/**
 * Table du jour J (étape 17 du plan, 12/10/2026) : pour chaque match passé, ce
 * que l'appli savait la veille de chaque équipe et de chaque joueur — jamais le
 * match lui-même ni ceux d'après —, construite la première nuit puis tenue à
 * jour chaque nuit par l'actualisation (server/src/data/db/dayTable.js). Les
 * prochaines étapes (valeur des statistiques, banc d'essai, modèle de score,
 * indice de force, fiches joueurs) la liront au lieu de refaire chacune leurs
 * lectures « avant le match ». Mesurée seulement : le moteur ne la lit pas.
 *
 * La carte dit quatre choses, toujours les quatre : les lignes équipe, les
 * lignes joueur, jusqu'à quand la table est à jour, et le dernier contrôle
 * anti-fuite (des lignes tirées au hasard, recalculées depuis les tables
 * sources par les lecteurs du moteur ; un écart serait une fuite ou une
 * erreur de la table). Tout est LU (GET /api/match-stats/day-table, l'état
 * noté à la fin de la dernière passe) : la carte ne calcule ni ne recompte
 * rien. Les textes viennent de utils/tableJourJ.js (testés sans navigateur).
 * Règles de dessin (ui/DESIGN.md) : structure complète même sans table ou en
 * erreur, la raison dite, provenance réelle.
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { lignesDeLaTable, messageDErreur, phraseEcart } from '@/utils/tableJourJ.js';

const props = defineProps({
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null }
});

const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await matchStatsApi.dayTable() };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: messageDErreur(error.message) };
  }
}

onMounted(charger);
watch(
  () => props.passeTermineeLe,
  (apres, avant) => {
    if (apres && apres !== avant) charger();
  }
);

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
const lignes = computed(() => lignesDeLaTable(d.value));
const ecarts = computed(() => d.value?.controle?.ecarts ?? []);
</script>

<template>
  <div class="djj">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture de la table du jour J…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title djj__titre--danger">Table du jour J illisible</p>
        <p class="cm-note__text djj__texte">{{ etat.error }} — les quatre lignes ci-dessous restent affichées, sans valeurs.</p>
      </div>
    </div>

    <!-- 1. Les quatre lignes, toujours les quatre. -->
    <div class="cm-table-wrap">
      <table class="cm-table djj__table">
        <tbody>
          <tr v-for="l in lignes" :key="l.cle" :class="l.ton ? `djj__ligne--${l.ton.replace('is-', '')}` : ''">
            <th class="is-left djj__nom" scope="row">
              <span class="djj__nom-texte">
                {{ l.nom }}
                <HelpTip v-if="l.cle === 'controle'" terme="table-du-jour-j" />
              </span>
            </th>
            <td class="is-left djj__valeur">
              <span v-if="l.pastille" class="cm-chip djj__pastille" :class="l.pastille.ton">
                <AppIcon :name="l.pastille.icone" :size="11" />
                {{ l.pastille.texte }}
              </span>
              <span class="djj__texte-valeur">{{ l.valeur }}</span>
              <small v-if="l.detail" class="djj__petit">{{ l.detail }}</small>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 2. Les écarts du dernier contrôle, s'il y en a. -->
    <div v-if="ecarts.length" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="alert" :size="16" /></span>
      <div>
        <p class="cm-note__title djj__titre--danger">Écarts du dernier contrôle anti-fuite</p>
        <ul class="djj__ecarts">
          <li v-for="(e, i) in ecarts" :key="`${e.colonne}-${e.matchKey ?? e.joueur ?? e.league}-${i}`">{{ phraseEcart(e) }}</li>
        </ul>
        <p class="cm-note__text djj__texte">Rien n'est corrigé automatiquement : la nuit suivante refait le contrôle sur d'autres lignes.</p>
      </div>
    </div>

    <!-- 3. D'où ça vient. -->
    <div class="djj__entete">
      <ProvenanceChip
        source="magasin SQLite, calculé chaque nuit par l'actualisation"
        :releve-le="d?.miseAJourLe ?? null"
        action="calculé"
        :fichier="d?.base ?? null"
        detail="Les comptes sont ceux notés à la fin de la dernière passe : rien n'est recompté à l'ouverture."
        :vieux-apres-heures="48"
      />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>

    <p class="djj__pied">
      <AppIcon name="shield" :size="12" />
      <span>
        Mesurée seulement : le moteur ne lit pas encore cette table. Elle est construite à la première passe d’actualisation (une minute après le
        démarrage de l’appli), puis chaque nuit seulement pour les rencontres
        nouvelles, modifiées ou retirées, en rendant la main au serveur toutes les 25 ms environ ; chaque nuit, des lignes tirées au hasard
        sont recalculées depuis les tables sources par les lecteurs du moteur.
        <template v-if="d?.base"> Base : {{ d.base }}.</template>
      </span>
    </p>
  </div>
</template>

<style scoped>
.djj {
  container: djj / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.djj__titre--danger {
  color: var(--cm-danger);
}

.djj__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.djj__table th,
.djj__table td {
  font-size: 12.5px;
  vertical-align: top;
  white-space: normal;
}

.djj__nom {
  width: 190px;
  min-width: 150px;
  color: var(--cm-text-primary);
  font-weight: 600;
}

.djj__nom-texte {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.djj__valeur {
  line-height: 1.45;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.djj__pastille {
  margin-right: 8px;
}

.djj__ligne--warning .djj__texte-valeur {
  color: var(--cm-warning);
}

.djj__ligne--danger .djj__texte-valeur {
  color: var(--cm-danger);
  font-weight: 600;
}

.djj__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
}

.djj__ecarts {
  margin: 4px 0 6px;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.djj__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.djj__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
  overflow-wrap: anywhere;
}

.djj__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container djj (max-width: 480px) {
  .djj__nom {
    width: auto;
    min-width: 110px;
  }
}
</style>
