<script setup>
/**
 * Le CONTRÔLE QUOTIDIEN des données (étape 14 du plan, 07/10/2026) : le feu
 * vert / orange / rouge que montre aussi la puce du haut de l'appli, les
 * contrôles en échec d'abord avec leurs constats, puis TOUS les contrôles,
 * famille par famille, et l'historique des feux.
 *
 * Tout est LU (GET /api/health/checks) : un état préparé à la fin de chaque
 * passe d'actualisation (étape « controleQuotidien », server/src/data/db/
 * dailyChecks.js), constats re-datés et sources relues au moment de la
 * lecture. La carte ne lance aucun contrôle et ne corrige rien. Règles de
 * dessin (ui/DESIGN.md) : chiffres clés en .cm-kpis, tableaux complets même
 * vides ou en erreur, Σ et ⌀ au pied, vraie provenance, jamais une donnée
 * absente sans le dire.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { healthApi } from '@/services/healthApi.js';
import {
  FEUX,
  STATUTS,
  FAMILLES_PAR_DEFAUT,
  etatDuFeu,
  parFamille,
  compter,
  enEchecDabord,
  etiquetteDuConstat,
  quand,
  jourFr,
  duree,
  nombre,
  pluriel
} from '@/utils/controleQuotidien.js';

const props = defineProps({
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null },
  /** Vrai quand on arrive par la puce du haut de l'appli (« ?carte=controle-quotidien ») : la carte se montre. */
  montrer: { type: Boolean, default: false }
});

const racine = ref(null);
const etat = ref({ loading: false, error: null, data: null });
const ouverts = ref(new Set());
const CONSTATS_MONTRES = 5;

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await healthApi.checks() };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
  }
}

onMounted(async () => {
  await charger();
  // La puce du haut de l'appli mène ici : la carte se montre.
  if (props.montrer) {
    await nextTick();
    racine.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }
});
watch(
  () => props.passeTermineeLe,
  (apres, avant) => {
    if (apres && apres !== avant) charger();
  }
);

function basculer(cle) {
  const s = new Set(ouverts.value);
  if (s.has(cle)) s.delete(cle);
  else s.add(cle);
  ouverts.value = s;
}

// ------------------------------------------------------------ présentation
const d = computed(() => etat.value.data);
const pret = computed(() => d.value?.etat === 'pret');
const controles = computed(() => d.value?.controles ?? []);
const familles = computed(() => parFamille(controles.value, d.value?.familles ?? FAMILLES_PAR_DEFAUT));
const comptes = computed(() => compter(controles.value));
const enEchec = computed(() => enEchecDabord(controles.value).filter((c) => ['rouge', 'orange', 'erreur'].includes(c.statutLe)));
const feu = computed(() => etatDuFeu({ feu: d.value?.feu ?? null, etat: d.value?.etat }));
const regles = computed(() => d.value?.regles ?? null);
const historique = computed(() => (d.value?.historique ?? []).slice(0, 10));
const dureeMoyenne = computed(() => {
  const h = historique.value.filter((x) => Number.isFinite(Number(x.dureeMs)));
  return h.length ? h.reduce((n, x) => n + Number(x.dureeMs), 0) / h.length : null;
});
const constatsTotal = computed(() => controles.value.reduce((n, c) => n + (c.total ?? 0), 0));
const TONS_CHIP = { 'is-ok': 'is-accent', 'is-warn': 'is-warning', 'is-danger': 'is-danger', 'is-muted': '' };
const chipDuStatut = (s) => TONS_CHIP[STATUTS[s]?.ton] ?? '';
const montres = (c) => (ouverts.value.has(c.cle) ? c.constats ?? [] : (c.constats ?? []).slice(0, CONSTATS_MONTRES));
/** Un contrôle qui n'a trouvé qu'un constat : sa phrase le dit déjà, la liste le répéterait. */
const seul = (c) => (c.constats ?? []).length === 1 && (c.total ?? 0) === 1;

const kpiFeu = computed(() => {
  if (etat.value.error && !d.value) return { valeur: 'non lu', detail: 'état indisponible', ton: 'is-warn' };
  // Jamais « vert » sans contrôle des données : seule une source en difficulté colore déjà le feu.
  if (d.value?.etat === 'jamais') return { valeur: feu.value.feu ? FEUX[feu.value.feu].court : 'pas encore', detail: 'pas encore de contrôle des données : il se fait à la fin de la prochaine passe ; les sources, elles, sont lues', ton: feu.value.ton };
  if (d.value?.etat === 'illisible') return { valeur: 'illisible', detail: d.value.raison ?? 'état du contrôle illisible', ton: 'is-danger' };
  return { valeur: FEUX[d.value?.feu]?.court ?? '—', detail: `${feu.value.libelle} — contrôle du ${quand(d.value?.le)}`, ton: feu.value.ton };
});
const texteRegles = computed(() => {
  const r = regles.value;
  if (!r) return '';
  return (
    `Rouge : des données impossibles ou contradictoires (un score différent de football-data sans explication, un chiffre impossible, un doublon, un match joué absent…), ` +
    `trouvées depuis moins de ${nombre(r.nouveauHeures)} h ; ensuite « connu », orange, tant que ce n'est pas corrigé. ` +
    `Orange : à regarder (zéros « non relevé », saison hors repères à ${nombre(r.seuilHorsReperes)} écarts normaux ou plus — jamais rouge, le jeu évolue —, identité incomplète, source à surveiller). ` +
    `Les rencontres des ${nombre(r.fenetreJours)} derniers jours sont contrôlées à chaque passe.`
  );
});
</script>

<template>
  <div ref="racine" id="controle-quotidien" class="cq">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture du contrôle quotidien…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title cq__titre--danger">Contrôle quotidien illisible</p>
        <p class="cm-note__text cq__texte">{{ etat.error }} — les tableaux ci-dessous restent affichés, sans valeurs.</p>
      </div>
    </div>

    <!-- 1. Les chiffres clés. -->
    <div class="cm-kpis cq__kpis">
      <div class="cm-kpi" :class="kpiFeu.ton">
        <span class="cm-kpi__label">Feu</span>
        <span class="cm-kpi__value cq__feu">
          <span class="cq__pastille" :class="feu.ton" aria-hidden="true" />
          {{ kpiFeu.valeur }}
        </span>
        <span class="cm-kpi__detail">{{ kpiFeu.detail }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Contrôles</span>
        <span class="cm-kpi__value">{{ controles.length ? nombre(controles.length) : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ controles.length ? `${nombre(comptes.vert)} verts, ${nombre(comptes.orange)} orange, ${nombre(comptes.rouge)} rouges, ${nombre(comptes.erreur)} en panne, ${nombre(comptes['non-fait'])} pas faits` : 'aucun contrôle lu' }}</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Durée de la passe</span>
        <span class="cm-kpi__value">{{ pret ? duree(d.dureeMs) : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ pret ? `${pluriel(d.fenetre?.rencontres ?? 0, 'rencontre', 'rencontres')} du ${jourFr(d.fenetre?.du)} au ${jourFr(d.fenetre?.au)} ; le serveur jamais tenu plus de ${nombre(d.blocMaxMs)} ms d'affilée` : 'pas encore de passe contrôlée' }}</span>
      </div>
      <div class="cm-kpi is-section">
        <span class="cm-kpi__label">Pronostics « à vérifier »</span>
        <span class="cm-kpi__value">{{ pret ? pluriel(d.aVerifier?.clubs ?? 0, 'club', 'clubs') : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ pret ? `aux données douteuses, et ${pluriel(d.aVerifier?.ligues ?? 0, 'championnat', 'championnats')} pour un marché ; le badge dit pourquoi, le verdict ne change pas` : 'le badge se pose après le premier contrôle' }}</span>
      </div>
    </div>

    <div class="cq__entete">
      <ProvenanceChip
        source="Magasin FotMob · base SQLite (lecture seule) et notes des sources"
        :releve-le="d?.le ?? null"
        action="contrôlé"
        :fichier="d?.fichier ?? null"
        :detail="pret ? `Fenêtre : ${jourFr(d.fenetre?.du)} → ${jourFr(d.fenetre?.au)}. Base : ${d.base ?? 'inconnue'}.` : 'Le contrôle se fait à la fin de chaque passe d’actualisation.'"
        :vieux-apres-heures="6"
      />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>
    <p v-if="texteRegles" class="cq__regles">
      <AppIcon name="info" :size="12" />
      <span>{{ texteRegles }}</span>
    </p>

    <!-- 2. Les contrôles en échec, avec leurs constats. -->
    <h4 class="cm-group-title cq__groupe">
      Les contrôles en échec
      <HelpTip
        titre="Ce que veut dire chaque couleur"
        texte="Rouge : des données impossibles ou contradictoires, trouvées depuis moins de 24 heures. Orange : à regarder — un rouge connu depuis plus de 24 heures, un zéro « non relevé », une saison hors repères, une source à surveiller. Rien n’est jamais corrigé automatiquement : une erreur se corrige à la main, une limite de la source se sait."
      />
    </h4>
    <div v-if="enEchec.length" class="cq__echecs">
      <div v-for="c in enEchec" :key="c.cle" class="cm-block cq__echec">
        <div class="cq__echec-tete">
          <span class="cm-chip" :class="chipDuStatut(c.statutLe)">
            <AppIcon :name="STATUTS[c.statutLe]?.icone ?? 'info'" :size="11" />
            {{ STATUTS[c.statutLe]?.libelle ?? c.statutLe }}
          </span>
          <strong class="cq__libelle">{{ c.libelle }}</strong>
          <span class="cq__famille">{{ (d?.familles ?? FAMILLES_PAR_DEFAUT).find((f) => f.cle === c.famille)?.libelle ?? c.famille }}</span>
        </div>
        <p class="cq__constat">
          {{ c.constat }}
          <!-- Un seul constat : la phrase du contrôle le dit déjà ; reste son âge (« nouveau », « connu depuis le … »). -->
          <small v-if="seul(c)" class="cq__petit">{{ etiquetteDuConstat(c.constats[0]) }}</small>
        </p>
        <ul v-if="(c.constats ?? []).length && !seul(c)" class="cq__liste">
          <li v-for="x in montres(c)" :key="x.id" class="cq__item">
            <span class="cq__item-texte">{{ x.texte }}</span>
            <small class="cq__petit">{{ etiquetteDuConstat(x) }}</small>
          </li>
        </ul>
        <AppButton v-if="(c.constats ?? []).length > CONSTATS_MONTRES" variant="ghost" size="sm" @click="basculer(c.cle)">
          {{ ouverts.has(c.cle) ? 'Montrer moins' : `Voir les ${nombre(c.constats.length - CONSTATS_MONTRES)} autres` }}
        </AppButton>
        <small v-if="(c.total ?? 0) > (c.constats ?? []).length" class="cq__petit">{{ nombre(c.total) }} constat(s) en tout : les {{ nombre((c.constats ?? []).length) }} gardés sont les rouges et les plus récents.</small>
      </div>
    </div>
    <p v-else class="cq__vide">
      {{ pret ? 'Aucun contrôle en échec : tout est vert.' : d?.etat === 'jamais' ? 'Pas encore de contrôle des données.' : 'Liste indisponible : contrôle non lu.' }}
    </p>

    <!-- 3. Tous les contrôles, famille par famille. -->
    <h4 class="cm-group-title cq__groupe">
      Tous les contrôles, famille par famille
      <HelpTip
        titre="D’où viennent les contrôles"
        texte="Les contrôles du carnet de santé (étape 12) refaits sur les 30 derniers jours, les scores face à football-data.co.uk (étape 13), les repères de chaque championnat (étape 15), et la santé de chaque source lue dans ce que l’appli a noté lors de ses vrais appels — jamais un appel de plus."
      />
    </h4>
    <div class="cm-table-wrap cq__wrap">
      <table class="cm-table cq__table">
        <thead>
          <tr>
            <th class="is-left">Contrôle</th>
            <th class="is-left">État</th>
            <th class="is-left">Ce qu'il a trouvé</th>
            <th title="Nombre de constats de ce contrôle (tous, même ceux qui ne sont pas montrés)">Constats</th>
          </tr>
        </thead>
        <tbody v-for="f in familles" :key="f.cle">
          <tr class="cq__famille-ligne">
            <td class="is-left is-strong" colspan="4">{{ f.libelle }}</td>
          </tr>
          <tr v-for="c in f.controles" :key="c.cle">
            <td class="is-left cq__nom">
              <strong>{{ c.libelle }}</strong>
              <small class="cq__petit">{{ c.quoi }}</small>
            </td>
            <td class="is-left">
              <span class="cm-chip" :class="chipDuStatut(c.statutLe)">
                <AppIcon :name="STATUTS[c.statutLe]?.icone ?? 'info'" :size="11" />
                {{ STATUTS[c.statutLe]?.libelle ?? c.statutLe }}
              </span>
            </td>
            <td class="is-left cq__ce-qui">{{ c.constat }}</td>
            <td class="cm-numeric">{{ nombre(c.total ?? 0) }}</td>
          </tr>
          <tr v-if="!f.controles.length">
            <td class="is-left cq__vide" colspan="4">{{ etat.error ? 'Non lu : le serveur ne répond pas.' : d ? 'Aucun contrôle de cette famille dans l’état lu.' : 'Non lu.' }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong">Σ {{ nombre(controles.length) }} contrôle(s)</td>
            <td class="is-left">{{ nombre(comptes.vert) }} vert(s) · {{ nombre(comptes.orange) }} orange · {{ nombre(comptes.rouge) }} rouge(s) · {{ nombre(comptes.erreur) }} en panne · {{ nombre(comptes['non-fait']) }} pas fait(s)</td>
            <td class="is-left cq__moyenne">constats de tous les contrôles</td>
            <td class="cm-numeric is-strong">{{ nombre(constatsTotal) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 4. Les dernières passes. -->
    <h4 class="cm-group-title cq__groupe">Les dernières passes</h4>
    <div class="cm-table-wrap">
      <table class="cm-table cq__table">
        <thead>
          <tr>
            <th class="is-left">Passe</th>
            <th class="is-left">Feu</th>
            <th>Rouges</th>
            <th>Orange</th>
            <th>Durée</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in historique" :key="h.le">
            <td class="is-left cm-numeric">{{ quand(h.le) }}</td>
            <td class="is-left">
              <span class="cm-chip" :class="chipDuStatut(h.feu)">{{ FEUX[h.feu]?.court ?? h.feu }}</span>
            </td>
            <td class="cm-numeric">{{ nombre(h.rouges ?? 0) }}</td>
            <td class="cm-numeric">{{ nombre(h.oranges ?? 0) }}</td>
            <td class="cm-numeric">{{ duree(h.dureeMs) }}</td>
          </tr>
          <tr v-if="!historique.length">
            <td class="is-left cq__vide" colspan="5">{{ pret ? 'Aucune passe gardée.' : 'Pas encore de passe contrôlée.' }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong">Σ {{ nombre(historique.length) }} passe(s)</td>
            <td class="is-left cq__moyenne">{{ nombre(historique.filter((h) => h.feu === 'rouge').length) }} au rouge</td>
            <td class="cm-numeric is-strong">{{ nombre(historique.reduce((n, h) => n + (h.rouges ?? 0), 0)) }}</td>
            <td class="cm-numeric is-strong">{{ nombre(historique.reduce((n, h) => n + (h.oranges ?? 0), 0)) }}</td>
            <td class="cm-numeric cq__moyenne" title="Durée moyenne d'une passe du contrôle">⌀ {{ dureeMoyenne === null ? '—' : duree(dureeMoyenne) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p class="cq__pied">
      <AppIcon name="shield" :size="12" />
      <span>
        Le contrôle ne corrige jamais rien et n'écrit jamais dans la base (il ne fait que la lire, sous le verrou de la passe : jamais pendant un import) ;
        il rapproche tout par identifiant, jamais par le nom des clubs. Un pronostic dont les données sont douteuses porte le badge « à vérifier », avec sa
        raison ; son verdict ne change pas.
        <template v-if="d?.base"> Base : {{ d.base }}.</template>
      </span>
    </p>
  </div>
</template>

<style scoped>
.cq {
  container: cq / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-margin-top: 90px;
}

.cq__kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.cq__feu {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-size: 19px;
  text-transform: capitalize;
}

/* La pastille du feu : sa couleur ET son mot (le feu se lit sans la couleur). */
.cq__pastille {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--cm-text-muted);
}

.cq__pastille.is-ok {
  background: var(--cm-accent);
  box-shadow: 0 0 0 3px var(--cm-accent-soft);
}

.cq__pastille.is-warn {
  background: var(--cm-warning);
  box-shadow: 0 0 0 3px var(--cm-warning-soft);
}

.cq__pastille.is-danger {
  background: var(--cm-danger);
  box-shadow: 0 0 0 3px var(--cm-danger-soft);
}

.cm-kpi.is-ok .cm-kpi__value {
  color: var(--cm-accent);
}

.cm-kpi.is-warn .cm-kpi__value {
  color: var(--cm-warning);
}

.cm-kpi.is-danger .cm-kpi__value {
  color: var(--cm-danger);
}

.cq__titre--danger {
  color: var(--cm-danger);
}

.cq__texte {
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.cq__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.cq__regles,
.cq__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
  overflow-wrap: anywhere;
}

.cq__regles :deep(svg),
.cq__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

.cq__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.cq__echecs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cq__echec {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cq__echec-tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.cq__libelle {
  font-size: 13.5px;
  color: var(--cm-text-primary);
}

.cq__famille {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.cq__constat {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.cq__liste {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 0 0 16px;
}

.cq__item {
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.cq__item-texte {
  margin-right: 6px;
}

.cq__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.cq__vide {
  margin: 0;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
  white-space: normal;
}

.cq__wrap {
  max-height: 640px;
}

.cq__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.cq__famille-ligne td {
  background: var(--cm-surface-raised);
  font-size: 11px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.cq__nom {
  min-width: 210px;
  white-space: normal;
}

.cq__ce-qui {
  min-width: 300px;
  white-space: normal;
  line-height: 1.45;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.cq__moyenne {
  color: var(--cm-text-muted);
}

@container cq (max-width: 560px) {
  .cq__nom,
  .cq__ce-qui {
    min-width: 0;
  }
}
</style>
