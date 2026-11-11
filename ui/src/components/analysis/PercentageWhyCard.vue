<script setup>
import { computed } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { liveNow } from '@/utils/liveClock.js';
import { MOTS_DE_LA_FICHE as MOTS, pourquoiDuPourcentage } from '@/utils/ficheDuPronostic.js';

/**
 * « Pourquoi ce pourcentage ? » (étape 40 du plan, lot 1, 10/11/2026) — sur la page d'un match à venir, sous le verdict :
 * d'où vient chaque pourcentage, pour le résultat (1 / N / 2), les buts, les corners et les tirs. Rien que ce que l'analyse
 * du moteur porte déjà : la page la passe, la carte ne lit rien et ne calcule rien (utils/ficheDuPronostic.js).
 * Les trois familles sont TOUJOURS là, même en chargement ou en erreur (chacune dit alors l'état) ; en bas, la ligne des cotes
 * hors du 1 / N / 2. Aucune jauge, aucune barre, aucun vert : une explication, pas un verdict. Un logo par identifiant FotMob
 * seulement (sans lui, le nom seul : aucun logo cherché d'après le nom).
 */
const props = defineProps({
  analyse: { type: Object, default: null }, // la lecture de la page : { loading, error, result }
  match: { type: Object, default: null }, // home, away, league, commenceTime
  homeId: { type: String, default: null },
  awayId: { type: String, default: null },
  provenanceButs: { type: Object, default: null } // provenanceDesButs(analyse) de la page ; null sans le modèle de buts (étape 27)
});

const fiche = computed(() => pourquoiDuPourcentage({ ...props, maintenant: liveNow.value }));
const r = computed(() => fiche.value.resultat);
const b = computed(() => fiche.value.buts);
const s = computed(() => fiche.value.stats);
const clubs = computed(() => fiche.value.clubs);
</script>

<template>
  <AppCard class="why" data-bloc="pourquoi-du-pourcentage" :data-etat="fiche.etat" :title="MOTS.titre" :subtitle="MOTS.sousTitre" icon="info" :eyebrow="MOTS.eyebrow">
    <div class="why__corps">
      <div class="why__famille" data-famille="resultat">
        <p class="why__titre"><AppIcon name="target" :size="14" />{{ MOTS.familleResultat }}</p>
        <p v-if="!r" class="why__etat">{{ fiche.message }}</p>
        <dl v-else class="why__lignes">
          <div class="why__ligne" data-ligne="origine">
            <dt>{{ MOTS.libelles.origine }}</dt>
            <dd>{{ r.origine.texte }}</dd>
          </div>
          <div v-if="r.releve" class="why__ligne" data-ligne="releve" :data-alerte="r.releve.code">
            <dt>{{ r.releve.libelle }}</dt>
            <dd>
              <ProvenanceChip variante="ligne" :source="r.releve.source" :releve-le="r.releve.retenue" :vieux-apres-heures="r.releve.vieuxApresHeures" :detail="r.releve.detail" :payant="r.releve.payant">
                <template v-if="r.releve.quand" #quand="{ ilYA }">{{ r.releve.quand }} · {{ ilYA }}</template>
              </ProvenanceChip>
              <p v-if="r.releve.phrase" class="why__alerte"><AppIcon name="clock" :size="12" />{{ r.releve.phrase }}</p>
            </dd>
          </div>
          <div class="why__ligne" data-ligne="compos">
            <dt>{{ MOTS.libelles.compos }}</dt>
            <dd><p v-for="phrase in r.compos" :key="phrase">{{ phrase }}</p></dd>
          </div>
        </dl>
      </div>

      <div class="why__famille" data-famille="buts">
        <p class="why__titre"><AppIcon name="ball" :size="14" />{{ MOTS.familleButs }}</p>
        <p v-if="!b" class="why__etat">{{ fiche.message }}</p>
        <dl v-else class="why__lignes">
          <div v-if="b.provenance" class="why__ligne" data-ligne="provenance-buts">
            <dt>{{ MOTS.libelles.modele }}</dt>
            <dd>
              <ProvenanceChip variante="ligne" :source="b.provenance.source" :releve-le="b.provenance.releveLe" :action="b.provenance.action" :vieux-apres-heures="b.provenance.vieuxApresHeures" :detail="b.provenance.detail" />
              <p v-if="b.provenance.manque">{{ b.provenance.manque }}</p>
            </dd>
          </div>
          <div v-else class="why__ligne" data-ligne="attendus">
            <dt>{{ MOTS.libelles.attendus }}</dt>
            <dd v-if="b.attendus">
              <span class="why__club"><TeamCrest v-if="clubs.home.id" :name="clubs.home.nom" :team-id="clubs.home.id" :size="16" />{{ clubs.home.nom }} <strong class="cm-numeric">{{ b.attendus.home }}</strong></span>
              ·
              <span class="why__club"><TeamCrest v-if="clubs.away.id" :name="clubs.away.nom" :team-id="clubs.away.id" :size="16" />{{ clubs.away.nom }} <strong class="cm-numeric">{{ b.attendus.away }}</strong></span>
              — {{ b.texte }}
            </dd>
            <dd v-else>{{ b.sansAttendus }}</dd>
          </div>
          <div class="why__ligne" data-ligne="buts-origine">
            <dt>{{ MOTS.libelles.origines }}</dt>
            <dd><p v-for="phrase in b.phrases" :key="phrase">{{ phrase }}</p></dd>
          </div>
        </dl>
      </div>

      <div class="why__famille" data-famille="stats">
        <p class="why__titre"><AppIcon name="activity" :size="14" />{{ MOTS.familleStats }}</p>
        <p v-if="!s" class="why__etat">{{ fiche.message }}</p>
        <dl v-else class="why__lignes">
          <div v-for="l in s.lignes" :key="l.cle" class="why__ligne" :data-ligne="`stat-${l.cle}`">
            <dt>{{ l.nom }}</dt>
            <dd>
              <span class="why__club"><TeamCrest v-if="clubs.home.id" :name="clubs.home.nom" :team-id="clubs.home.id" :size="16" />{{ clubs.home.nom }} <strong class="cm-numeric">{{ l.home }}</strong></span>
              ·
              <span class="why__club"><TeamCrest v-if="clubs.away.id" :name="clubs.away.nom" :team-id="clubs.away.id" :size="16" />{{ clubs.away.nom }} <strong class="cm-numeric">{{ l.away }}</strong></span>
              <template v-if="l.total"> ({{ l.total }} au total)</template>
            </dd>
          </div>
          <div v-if="s.absents.length" class="why__ligne" data-ligne="stats-absentes">
            <dt>{{ MOTS.libelles.origines }}</dt>
            <dd><p v-for="phrase in s.absents" :key="phrase">{{ phrase }}</p></dd>
          </div>
          <div v-if="s.phrases.length" class="why__ligne" data-ligne="stats-origine">
            <dt>{{ MOTS.libelles.origines }}</dt>
            <dd><p v-for="phrase in s.phrases" :key="phrase">{{ phrase }}</p></dd>
          </div>
        </dl>
      </div>
    </div>
    <p class="why__hors" data-ligne="cotes-hors-1n2"><AppIcon name="info" :size="12" />{{ fiche.cotes }}</p>
  </AppCard>
</template>

<style scoped>
/* Une explication, pas un verdict : aucun vert ni rouge, seulement l'ambre (avec l'horloge et les mots) d'un relevé trop vieux. */
.why__corps {
  display: grid;
  gap: 12px;
  container: why / inline-size;
}

.why__famille {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--cm-border-soft);
}

.why__famille:first-child {
  padding-top: 0;
  border-top: 0;
}

.why__titre {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.why__lignes {
  display: grid;
  gap: 8px;
  margin: 0;
}

.why__ligne {
  display: grid;
  grid-template-columns: minmax(110px, 160px) 1fr;
  gap: 4px 12px;
  align-items: baseline;
}

.why__ligne dt {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-muted);
}

.why__ligne dd {
  min-width: 0;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.why__ligne dd p {
  margin: 0 0 4px;
}

.why__ligne dd p:last-child {
  margin-bottom: 0;
}

.why__etat {
  margin: 0;
  font-size: 12.5px;
  color: var(--cm-text-muted);
}

.why__club {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.why__alerte {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 4px;
  color: var(--cm-warning);
}

.why__hors {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 14px 0 0;
  padding-top: 10px;
  border-top: 1px solid var(--cm-border-soft);
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

/* Une seule colonne sous 520 px : le libellé au-dessus de son explication. */
@container why (max-width: 520px) {
  .why__ligne {
    grid-template-columns: 1fr;
  }
}
</style>
