<script setup>
/**
 * La SANTÉ DES SOURCES (étape 14 du plan, 07/10/2026) : une ligne par source
 * — FotMob, football-data.co.uk, The Odds API, API-Football, Claude, les
 * cotes gratuites de référence — avec son état, la date de son dernier relevé
 * et sa limite (crédits, appels du jour, date d'expiration).
 *
 * Tout est LU (GET /api/health/sources) dans ce que l'appli a noté lors de
 * ses VRAIS appels : jamais une source n'est appelée pour savoir si elle va
 * bien (server/src/data/sourceHealth.js). Seul réglage : la date d'expiration
 * du jeton Claude, que Pierre saisit (PUT /api/health/jeton-claude, gardée
 * dans data/runtime/jeton-claude.json, jamais lue dans server/.env). Règles de
 * dessin (ui/DESIGN.md) : chiffres clés en .cm-kpis, tableau complet même en
 * erreur (six lignes), Σ au pied, vraie provenance.
 */
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import { healthApi } from '@/services/healthApi.js';
import { ETATS_SOURCE, SOURCES_PAR_DEFAUT, quand, jourFr, nombre } from '@/utils/controleQuotidien.js';

const props = defineProps({
  /** Fin de la dernière passe d'actualisation : la carte se relit quand elle change. */
  passeTermineeLe: { type: String, default: null }
});

const etat = ref({ loading: false, error: null, data: null });
const jeton = ref({ valeur: '', enCours: false, message: null, erreur: null });

async function charger() {
  etat.value = { ...etat.value, loading: true, error: null };
  try {
    etat.value = { loading: false, error: null, data: await healthApi.sources() };
  } catch (error) {
    etat.value = { ...etat.value, loading: false, error: error.message };
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
/** Six lignes toujours : celles du serveur, sinon les noms seuls, « non lu ». */
const lignes = computed(() => {
  const parCle = new Map((d.value?.sources ?? []).map((s) => [s.cle, s]));
  return SOURCES_PAR_DEFAUT.map((s) => parCle.get(s.cle) ?? { ...s, etat: null, resume: etat.value.error ? 'Non lu : le serveur ne répond pas.' : 'Non lu.', details: [], limite: null, dernierReleve: null });
});
const TONS_CHIP = { 'is-ok': 'is-accent', 'is-warn': 'is-warning', 'is-danger': 'is-danger', 'is-muted': '' };
const chipDeLEtat = (e) => TONS_CHIP[ETATS_SOURCE[e]?.ton] ?? '';
const comptes = computed(() => {
  const c = { ok: 0, 'a-surveiller': 0, 'en-panne': 0, coupe: 0, inconnu: 0, nonLu: 0 };
  for (const l of lignes.value) {
    if (!l.etat) c.nonLu++;
    else c[l.etat] = (c[l.etat] ?? 0) + 1;
  }
  return c;
});
const claude = computed(() => lignes.value.find((l) => l.cle === 'claude') ?? null);
const expireLe = computed(() => claude.value?.limite?.expireLe ?? null);
const aConfirmer = computed(() => Boolean(claude.value?.limite?.aConfirmer));
/** Le champ de la date : ce que Pierre a tapé, sinon la date du réglage lue sur le serveur. */
const dateSaisie = computed({
  get: () => jeton.value.valeur || expireLe.value || '',
  set: (v) => {
    jeton.value = { ...jeton.value, valeur: v ?? '' };
  }
});

async function enregistrerJeton() {
  jeton.value = { ...jeton.value, enCours: true, message: null, erreur: null };
  try {
    const r = await healthApi.setJetonClaude(dateSaisie.value);
    if (r?.sources) etat.value = { loading: false, error: null, data: r.sources };
    jeton.value = { ...jeton.value, enCours: false, message: r?.change ? `Date enregistrée : le ${jourFr(r.reglage?.expireLe)}.` : 'Rien à changer : c’est déjà la date enregistrée.' };
  } catch (error) {
    jeton.value = { ...jeton.value, enCours: false, erreur: error.message };
  }
}

const fichiers = (l) => (l?.provenance?.fichiers ?? []).filter(Boolean).join(' ; ');
</script>

<template>
  <div class="sh">
    <LoadingSpinner v-if="etat.loading && !d" label="Lecture de la santé des sources…" />

    <div v-if="etat.error" class="cm-note is-danger">
      <span class="cm-icon-box is-danger"><AppIcon name="x" :size="16" /></span>
      <div>
        <p class="cm-note__title sh__titre--danger">Santé des sources illisible</p>
        <p class="cm-note__text sh__texte">{{ etat.error }} — le tableau ci-dessous garde ses six lignes, sans valeurs.</p>
      </div>
    </div>

    <!-- 1. Les chiffres clés. -->
    <div class="cm-kpis sh__kpis">
      <div class="cm-kpi" :class="comptes.ok ? 'is-ok' : ''">
        <span class="cm-kpi__label">En bon état</span>
        <span class="cm-kpi__value">{{ d ? nombre(comptes.ok) : 'non lu' }}</span>
        <span class="cm-kpi__detail">sur {{ nombre(lignes.length) }} sources</span>
      </div>
      <div class="cm-kpi" :class="comptes['a-surveiller'] ? 'is-warn' : ''">
        <span class="cm-kpi__label">À surveiller</span>
        <span class="cm-kpi__value">{{ d ? nombre(comptes['a-surveiller']) : 'non lu' }}</span>
        <span class="cm-kpi__detail">une limite proche, des échecs, une forme de réponse inattendue</span>
      </div>
      <div class="cm-kpi" :class="comptes['en-panne'] ? 'is-danger' : ''">
        <span class="cm-kpi__label">En panne</span>
        <span class="cm-kpi__value">{{ d ? nombre(comptes['en-panne']) : 'non lu' }}</span>
        <span class="cm-kpi__detail">la source ne répond plus, ou le jeton a expiré</span>
      </div>
      <div class="cm-kpi">
        <span class="cm-kpi__label">Coupées ou inconnues</span>
        <span class="cm-kpi__value">{{ d ? nombre(comptes.coupe + comptes.inconnu) : 'non lu' }}</span>
        <span class="cm-kpi__detail">{{ d?.bac ? 'le bac à sable coupe les clés, Claude et les boucles' : 'clé absente, interrupteur, ou rien de noté encore' }}</span>
      </div>
    </div>

    <div class="sh__entete">
      <ProvenanceChip
        source="Notes des vrais appels (jamais un appel pour les lire)"
        :releve-le="d?.le ?? null"
        action="lu"
        detail="Chaque source est jugée sur ce qu’elle a répondu au dernier appel que l’appli lui a vraiment fait."
        :vieux-apres-heures="1"
      />
      <AppButton variant="secondary" size="sm" :loading="etat.loading" @click="charger">
        <template #icon><AppIcon name="refresh" :size="13" /></template>
        Relire
      </AppButton>
    </div>

    <!-- 2. Une ligne par source. -->
    <h4 class="cm-group-title sh__groupe">
      Une ligne par source
      <HelpTip
        titre="Comment l’état est lu"
        texte="FotMob : chaque réponse que l’actualisation reçoit déjà (réussie ou non, et sa forme). The Odds API : les crédits renvoyés au dernier relevé que vous avez lancé. API-Football : le compteur renvoyé à son dernier appel. Claude : la date d’expiration du jeton, que vous saisissez ci-dessous, et le journal des appels. Jamais un appel de plus."
      />
    </h4>
    <div class="cm-table-wrap sh__wrap">
      <table class="cm-table sh__table">
        <thead>
          <tr>
            <th class="is-left">Source</th>
            <th class="is-left">État</th>
            <th class="is-left">Dernier relevé</th>
            <th class="is-left">Limite</th>
            <th class="is-left">Détail</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lignes" :key="l.cle">
            <td class="is-left sh__source">
              <strong>{{ l.nom }}</strong>
              <small class="sh__petit">{{ l.role ?? '' }}</small>
              <span v-if="l.payant" class="cm-chip sh__payant"><AppIcon name="euro" :size="10" />payant</span>
            </td>
            <td class="is-left sh__etat">
              <span class="cm-chip" :class="chipDeLEtat(l.etat)">
                <AppIcon :name="ETATS_SOURCE[l.etat]?.icone ?? 'info'" :size="11" />
                {{ l.etat ? ETATS_SOURCE[l.etat]?.libelle ?? l.etat : 'non lu' }}
              </span>
              <small class="sh__petit sh__resume">{{ l.resume }}</small>
            </td>
            <td class="is-left cm-numeric sh__quand">
              {{ l.dernierReleve?.le ? quand(l.dernierReleve.le) : 'aucun relevé noté' }}
              <small class="sh__petit">{{ l.dernierReleve?.quoi ?? '' }}</small>
            </td>
            <td class="is-left sh__limite">{{ l.limite?.texte ?? 'non lue' }}</td>
            <td class="is-left sh__detail">
              <span v-for="(x, i) in l.details ?? []" :key="i" class="sh__ligne">{{ x }}</span>
              <span v-if="fichiers(l)" class="sh__ligne sh__fichier" :title="fichiers(l)">Lu dans : {{ fichiers(l) }}</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td class="is-left is-strong">Σ {{ nombre(lignes.length) }} sources</td>
            <td class="is-left" colspan="4">
              {{ nombre(comptes.ok) }} en bon état · {{ nombre(comptes['a-surveiller']) }} à surveiller · {{ nombre(comptes['en-panne']) }} en panne · {{ nombre(comptes.coupe) }} coupée(s) ·
              {{ nombre(comptes.inconnu) }} inconnue(s){{ comptes.nonLu ? ` · ${nombre(comptes.nonLu)} non lue(s)` : '' }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 3. Le seul réglage : la date d'expiration du jeton Claude. -->
    <div class="cm-block sh__jeton">
      <div class="sh__jeton-tete">
        <span class="cm-icon-box is-info is-sm"><AppIcon name="cpu" :size="14" /></span>
        <strong>Date d'expiration du jeton Claude</strong>
        <span v-if="aConfirmer" class="cm-chip is-warning"><AppIcon name="alert" :size="11" />à confirmer</span>
      </div>
      <p class="sh__texte">
        Le jeton de Claude Code dure un an, et rien ne dit à l'appli quand il expire : c'est une date que vous saisissez ici
        <template v-if="aConfirmer">— celle proposée, le {{ jourFr(expireLe) }}, est la date notée à la création du jeton (un an après le 30/09/2026)</template>.
        Elle est gardée sur le serveur, jamais lue dans server/.env. Un mois avant, la ligne Claude passe « à surveiller » ; après, « en panne ».
      </p>
      <div class="cm-toolbar sh__jeton-champs">
        <AppTextField v-model="dateSaisie" label="Expire le" type="date" class="sh__date" />
        <AppButton variant="section" size="sm" :loading="jeton.enCours" :disabled="!dateSaisie || Boolean(etat.error && !d)" @click="enregistrerJeton">
          <template #icon><AppIcon name="check" :size="13" /></template>
          Enregistrer
        </AppButton>
      </div>
      <p v-if="jeton.message" class="sh__texte">{{ jeton.message }}</p>
      <p v-if="jeton.erreur" class="sh__texte sh__titre--danger">{{ jeton.erreur }}</p>
    </div>

    <p class="sh__pied">
      <AppIcon name="shield" :size="12" />
      <span>
        Si FotMob coupait l'accès : le plan de secours est dans docs/plan-secours-fotmob.md. Rien ne bascule vers une autre source sans votre accord ;
        aucune source payante n'est appelée pour lire ses crédits ou son compteur.
      </span>
    </p>
  </div>
</template>

<style scoped>
.sh {
  container: sh / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sh__kpis {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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

.sh__titre--danger {
  color: var(--cm-danger);
}

.sh__texte {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.sh__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.sh__groupe {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
}

.sh__wrap {
  max-height: 640px;
}

.sh__table td {
  font-size: 12.5px;
  vertical-align: top;
}

.sh__source {
  min-width: 190px;
  white-space: normal;
}

.sh__payant {
  margin-top: 4px;
  font-size: 10.5px;
}

.sh__etat {
  min-width: 240px;
  white-space: normal;
}

.sh__resume {
  margin-top: 6px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
}

.sh__quand {
  min-width: 140px;
  white-space: normal;
}

.sh__limite {
  min-width: 160px;
  white-space: normal;
  line-height: 1.45;
}

.sh__detail {
  min-width: 260px;
  white-space: normal;
}

.sh__ligne {
  display: block;
  margin-bottom: 3px;
  line-height: 1.45;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.sh__fichier {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.sh__petit {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 500;
  color: var(--cm-text-muted);
  white-space: normal;
}

.sh__jeton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sh__jeton-tete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
}

.sh__jeton-champs {
  align-items: flex-end;
  flex-wrap: wrap;
}

.sh__date {
  min-width: 190px;
}

.sh__pied {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-text-muted);
}

.sh__pied :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}

@container sh (max-width: 560px) {
  .sh__source,
  .sh__etat,
  .sh__quand,
  .sh__limite,
  .sh__detail,
  .sh__date {
    min-width: 0;
  }
}
</style>
