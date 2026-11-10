<script setup>
/**
 * La carte « ARRIVÉES ET DÉPARTS » de la page d'une équipe (étape 35 du plan, lot 1b, 10/11/2026), juste après « Indice de
 * force » : ce que la passe de nuit des débuts de saison a rangé pour ce club — sa saison (rang, statut), la continuité de
 * son effectif (la part des minutes de cette saison jouées par des joueurs déjà là la saison passée, et celle de son
 * championnat), ceux qui comptaient la saison passée (au moins 30 % des minutes qu'ils pouvaient jouer) et ce qu'ils sont
 * devenus, les arrivés (en gras ceux qui comptent), les doubles possibles, les minutes sans identifiant, et la force de
 * l'effectif À BLANC (puce « À blanc » : jamais dans les chiffres au lot 1).
 *
 * Tout est LU (GET /api/match-stats/effectif?club=…, la seule lecture de la carte) : rien n'est calculé à l'ouverture de la
 * page, aucun appel payant, aucune écriture. Clubs et joueurs par leur identifiant FotMob, jamais par leur nom : un départ
 * n'est dit que si le joueur a été vu jouer pour un autre club, sinon « pas revu ». La carte garde TOUJOURS ses deux
 * tableaux (une ligne « aucun » s'il le faut) et dit chaque état vide. Les mots viennent de utils/debutsDeSaison.js (pur,
 * rejoué par server/test/debutsEcran.test.mjs). Explication seulement : le moteur ne la lit pas.
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppCard from '@/components/common/AppCard.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import LeagueBadge from '@/components/matches/LeagueBadge.vue';
import PlayerFlag from '@/components/matches/PlayerFlag.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import { matchStatsApi } from '@/services/matchStatsApi.js';
import { effectifDit } from '@/utils/debutsDeSaison.js';

const props = defineProps({
  /** L'identifiant FotMob du club (« fotmob-8456 ») ; sans lui, la carte le dit, garde ses tableaux et ne lit rien. */
  clubId: { type: String, default: null },
  clubName: { type: String, default: '' },
  league: { type: String, default: null }
});

const ID_FOTMOB = /^fotmob-[1-9]\d*$/;
const etat = ref({ loading: false, error: null, data: null });

async function charger() {
  const club = props.clubId;
  if (!ID_FOTMOB.test(String(club ?? ''))) {
    etat.value = { loading: false, error: null, data: null };
    return;
  }
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    const data = await matchStatsApi.effectif(club);
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

const dit = computed(() =>
  effectifDit({ chargement: etat.value.loading, erreur: etat.value.error, reponse: etat.value.data, clubId: props.clubId, clubName: props.clubName, league: props.league })
);
const iconeDeLaNote = (ton) => (ton === 'is-danger' ? 'x' : ton === 'is-warning' ? 'alert' : 'info');
const ancienApres = (p) => (p.vieuxApresHeures === null ? null : undefined);
</script>

<template>
  <AppCard
    class="efc"
    icon="users"
    eyebrow="Effectif"
    title="Arrivées et départs"
    subtitle="Par identifiant de joueur FotMob, sur les feuilles des matchs déjà joués. Un joueur absent n’est pas forcément parti."
    data-bloc="arrivees-departs"
    :data-effectif-etat="dit.etat.cle"
  >
    <template #actions>
      <HelpTip
        titre="Arrivées et départs"
        texte="Calculé chaque nuit depuis le magasin FotMob (les feuilles des matchs déjà joués), par identifiant de joueur : ceux qui comptaient la saison passée et ce qu’ils sont devenus, ceux qui sont arrivés. Un départ n’est dit que si le joueur a été vu jouer pour un autre club ; sinon « pas revu ». Explication seulement : rien de cette carte n’entre dans les pourcentages."
      />
    </template>

    <div class="efc__corps">
      <!-- 0. De quel club on parle : son logo et son championnat. -->
      <p class="efc__club">
        <TeamCrest v-if="dit.club.teamId" :name="dit.club.nom" :league="dit.club.league" :team-id="dit.club.teamId" :size="26" />
        <span v-else class="efc__sans-logo" title="Club non reconnu par son identifiant FotMob : son logo n’est jamais cherché d’après son nom."><AppIcon name="shield" :size="14" /></span>
        <strong class="cm-truncate">{{ dit.club.nom }}</strong>
        <span v-if="dit.club.league" class="cm-chip efc__ligue"><LeagueBadge :league="dit.club.league" /></span>
      </p>

      <LoadingSpinner v-if="dit.etat.cle === 'chargement'" label="Lecture de l’effectif…" />
      <div v-else-if="dit.etat.texte" class="cm-note" :class="dit.etat.ton" :data-raison="dit.etat.cle">
        <span class="cm-icon-box" :class="dit.etat.ton === 'is-danger' ? 'is-danger' : dit.etat.ton === 'is-warning' ? 'is-warning' : 'is-info'"><AppIcon :name="iconeDeLaNote(dit.etat.ton)" :size="16" /></span>
        <div>
          <p class="cm-note__title">{{ dit.etat.titre }}</p>
          <p class="cm-note__text">{{ dit.etat.texte }}</p>
        </div>
      </div>

      <p v-if="dit.resume" class="efc__resume" data-effectif="resume">{{ dit.resume }}</p>

      <!-- 1. Ceux qui comptaient la saison passée, et ce qu'ils sont devenus. -->
      <h4 class="cm-group-title efc__groupe">
        Ceux qui comptaient la saison passée
        <HelpTip titre="Qui compte" :texte="`Un joueur compte s’il a joué ${dit.seuilDit}. « Parti » : vu jouer pour un autre club, avec la date ; sinon « pas revu », et la liste FotMob du jour quand elle dit pourquoi.`" />
      </h4>
      <div class="cm-table-wrap">
        <table class="cm-table efc__table" data-tableau="reference">
          <thead>
            <tr>
              <th class="is-left">Joueur</th>
              <th>Poste</th>
              <th>Minutes la saison passée (part)</th>
              <th class="is-left">Cette saison</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in dit.reference.lignes" :key="j.id" :data-joueur="j.id" :data-devenu="j.cetteSaison.etat">
              <td class="is-left">
                <span class="efc__joueur">
                  <TeamCrest v-if="dit.club.teamId" :name="dit.club.nom" :league="dit.club.league" :team-id="dit.club.teamId" :size="16" />
                  <PlayerFlag :code="j.pays" :name="j.nomPays" :size="14" />
                  <span>{{ j.nom }}</span>
                </span>
              </td>
              <td>{{ j.poste }}</td>
              <td class="cm-numeric">{{ j.avant }}</td>
              <td class="is-left">
                <span class="efc__devenu">
                  <span>{{ j.cetteSaison.avant }}</span>
                  <template v-if="j.cetteSaison.club">
                    <TeamCrest v-if="j.cetteSaison.club.teamId" :name="j.cetteSaison.club.nom" :league="j.cetteSaison.club.league" :team-id="j.cetteSaison.club.teamId" :size="16" />
                    <span>{{ j.cetteSaison.club.nom }}</span>
                  </template>
                  <span v-if="j.cetteSaison.apres">{{ j.cetteSaison.apres }}</span>
                </span>
              </td>
            </tr>
            <tr v-if="!dit.reference.lignes.length" data-vide="oui">
              <td colspan="4" class="is-left efc__vide">{{ dit.reference.vide }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="is-left is-strong">{{ dit.reference.somme }}</td>
              <td class="cm-numeric">{{ dit.reference.moyenne }}</td>
              <td class="is-left">{{ dit.reference.moyenneSaison }}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 2. Les arrivés (en gras, ceux qui comptent). -->
      <h4 class="cm-group-title efc__groupe">
        Arrivés
        <HelpTip titre="Les arrivés" :texte="`Les joueurs vus cette saison sous le maillot du club et pas la saison passée ; ${dit.seuilArrives}.`" />
      </h4>
      <div class="cm-table-wrap">
        <table class="cm-table efc__table" data-tableau="arrives">
          <thead>
            <tr>
              <th class="is-left">Joueur</th>
              <th>Poste</th>
              <th>Minutes cette saison (part)</th>
              <th class="is-left">D’où</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in dit.arrives.lignes" :key="j.id" :data-joueur="j.id" :data-compte="j.compte ? 'oui' : 'non'">
              <td class="is-left">
                <span class="efc__joueur" :class="{ 'efc__qui-compte': j.compte }">
                  <TeamCrest v-if="dit.club.teamId" :name="dit.club.nom" :league="dit.club.league" :team-id="dit.club.teamId" :size="16" />
                  <PlayerFlag :code="j.pays" :name="j.nomPays" :size="14" />
                  <strong v-if="j.compte">{{ j.nom }}</strong>
                  <span v-else>{{ j.nom }}</span>
                </span>
              </td>
              <td>{{ j.poste }}</td>
              <td class="cm-numeric">{{ j.minutes }}</td>
              <td class="is-left">
                <span class="efc__devenu">
                  <span>{{ j.dOu.avant }}</span>
                  <template v-if="j.dOu.club">
                    <TeamCrest v-if="j.dOu.club.teamId" :name="j.dOu.club.nom" :league="j.dOu.club.league" :team-id="j.dOu.club.teamId" :size="16" />
                    <span>{{ j.dOu.club.nom }}</span>
                  </template>
                  <span v-if="j.dOu.apres">{{ j.dOu.apres }}</span>
                </span>
              </td>
            </tr>
            <tr v-if="!dit.arrives.lignes.length" data-vide="oui">
              <td colspan="4" class="is-left efc__vide">{{ dit.arrives.vide }}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="is-left is-strong">{{ dit.arrives.somme }}</td>
              <td class="cm-numeric">{{ dit.arrives.moyenne }}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <!-- 3. Les doubles possibles, les minutes sans identifiant, la force de l'effectif à blanc. -->
      <p v-for="(d, i) in dit.doubles" :key="i" class="efc__mention" data-effectif="double">
        <TeamCrest v-if="dit.club.teamId" :name="dit.club.nom" :league="dit.club.league" :team-id="dit.club.teamId" :size="14" />
        <PlayerFlag :code="d.pasRevu.pays" :name="d.pasRevu.nomPays" :size="12" />
        <PlayerFlag :code="d.arrive.pays" :name="d.arrive.nomPays" :size="12" />
        <span>{{ d.texte }}</span>
      </p>
      <p v-if="dit.sansIdentifiant" class="efc__mention" data-effectif="sans-identifiant">{{ dit.sansIdentifiant }}</p>
      <p v-if="dit.force" class="efc__force" data-effectif="force-effectif">
        <span class="efc__puce" role="note" :aria-label="dit.force.aria">À blanc</span>
        <span>{{ dit.force.texte }}</span>
      </p>
      <p v-if="dit.force" class="efc__mention">{{ dit.force.limite }}</p>

      <footer v-if="dit.pied.length" class="efc__pied">
        <ProvenanceChip
          v-for="p in dit.pied"
          :key="p.cle"
          :source="p.source"
          :releve-le="p.releveLe"
          :action="p.action"
          :fichier="p.fichier ?? null"
          :detail="p.detail ?? null"
          :vieux-apres-heures="ancienApres(p)"
          variante="ligne"
        >
          <template v-if="p.jourSeul" #quand>{{ p.action }} le {{ p.jourSeul }}</template>
          <template v-else-if="p.quand" #quand="{ ancien, ilYA }">{{ p.quand }}<template v-if="ancien"> · {{ ilYA }}</template></template>
        </ProvenanceChip>
      </footer>
    </div>
  </AppCard>
</template>

<style scoped>
.efc__corps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.efc__club {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  min-width: 0;
  font-size: 14px;
  color: var(--cm-text-primary);
}

.efc__sans-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px dashed var(--cm-border-soft);
  color: var(--cm-text-muted);
}

.efc__resume {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.efc__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0 0;
}

.efc__table td {
  vertical-align: middle;
}

.efc__joueur,
.efc__devenu {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.efc__qui-compte {
  font-weight: 700;
}

.efc__vide {
  color: var(--cm-text-muted);
  white-space: normal;
}

.efc__mention {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 11.5px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.efc__force {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

/* La puce « À blanc » : grise, toujours (la force de l'effectif n'est jamais dans les chiffres au lot 1). */
.efc__puce {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface);
  color: var(--cm-text-muted);
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}

.efc__pied {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  padding-top: 8px;
  border-top: 1px solid var(--cm-border-soft);
}
</style>
