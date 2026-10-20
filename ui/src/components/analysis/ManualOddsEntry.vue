<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppTextField from '@/components/common/AppTextField.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import ValueBadge from '@/components/common/ValueBadge.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import { oddsApi } from '@/services/oddsApi.js';
import { quandDit } from '@/utils/langageParis.js';
import { liveNow } from '@/utils/liveClock.js';

/**
 * La SAISIE EXPRESS d'une cote de vos bookmakers (étape 7 du plan, 06/10/2026),
 * sur la page d'un match à venir. The Odds API ne relève que le 1N2 : une cote
 * vue chez William Hill, Betsson, Unibet… sur les corners, les cartons, les
 * buteurs, les plus/moins ou « les deux marquent » se tape ici — bookmaker,
 * marché, issue, cote. Le SERVEUR (PUT /api/odds/saisies) calcule aussitôt sa
 * value face à la probabilité du moteur pour ce marché (s'il en a une) et la
 * garde dans les archives avec son heure (source « saisie »). Une saisie se
 * corrige (une nouvelle cote, l'ancienne reste dans l'archive) ou se retire.
 *
 * Le langage des paris (étape 6) : la value en `ValueBadge` — verte seulement
 * pour une vraie value, « à rafraîchir » quand la saisie a vieilli (fraîcheur
 * réévaluée à l'horloge) —, l'heure en `ProvenanceChip`, les bulles « ? ».
 * Aucun calcul de value ici : on dessine ce que le serveur rend.
 */
const props = defineProps({
  matchId: { type: String, required: true },
  home: { type: String, default: 'Domicile' },
  away: { type: String, default: 'Extérieur' }
});

const etat = ref({ chargement: true, erreur: null, donnees: null });
const envoi = ref({ enCours: false, erreur: null, message: null });
const retraitEnCours = ref(null);

/** La ligne proposée quand on choisit un marché (demi-ligne la plus courante). */
const LIGNES_PAR_DEFAUT = {
  totalGoals: 2.5,
  teamGoals: 1.5,
  totalCorners: 9.5,
  teamCorners: 4.5,
  totalShots: 24.5,
  teamShots: 11.5,
  totalShotsOnTarget: 8.5,
  teamShotsOnTarget: 3.5,
  totalCards: 4.5,
  teamCards: 1.5
};

const form = ref({ bookmaker: null, marketId: 'totalCorners', equipe: 'home', sens: 'over', ligne: 9.5, joueur: '', cote: null });

async function charger() {
  etat.value = { ...etat.value, chargement: true, erreur: null };
  try {
    const donnees = await oddsApi.saisies(props.matchId);
    etat.value = { chargement: false, erreur: null, donnees };
    if (!form.value.bookmaker) form.value.bookmaker = donnees.bookmakers?.[0]?.cle ?? null;
  } catch (error) {
    etat.value = { chargement: false, erreur: error.message, donnees: etat.value.donnees };
  }
}

// Les promesses rendues ne servent qu'au rendu côté serveur des essais : en navigateur, elles sont ignorées.
onMounted(() => charger());
watch(
  () => props.matchId,
  () => {
    envoi.value = { enCours: false, erreur: null, message: null };
    charger();
  }
);

const donnees = computed(() => etat.value.donnees);
const marches = computed(() => donnees.value?.marches ?? []);
const marche = computed(() => marches.value.find((m) => m.id === form.value.marketId) ?? null);
const saisies = computed(() => donnees.value?.saisies ?? []);
const retirees = computed(() => donnees.value?.retirees ?? []);
const regle = computed(() => donnees.value?.regle ?? null);
const reglage = computed(() => donnees.value?.reglage ?? null);
const delaiHeures = computed(() => (Number.isFinite(reglage.value?.maxAgeMinutes) ? reglage.value.maxAgeMinutes / 60 : 3));

// Un autre marché : son issue par défaut et sa ligne la plus courante.
watch(
  () => form.value.marketId,
  () => {
    const m = marche.value;
    if (!m) return;
    if (!m.sens.some((s) => s.valeur === form.value.sens)) form.value.sens = m.sens[0]?.valeur ?? null;
    if (m.ligne) form.value.ligne = LIGNES_PAR_DEFAUT[m.id] ?? 2.5;
  }
);

const optionsBookmakers = computed(() => (donnees.value?.bookmakers ?? []).map((b) => ({ value: b.cle, label: b.titre })));
const optionsMarches = computed(() => marches.value.map((m) => ({ value: m.id, label: m.libelle, hint: m.avecMoteur ? '' : 'sans value' })));
const optionsEquipes = computed(() => [
  { value: 'home', label: props.home },
  { value: 'away', label: props.away }
]);
const optionsSens = computed(() => (marche.value?.sens ?? []).map((s) => ({ value: s.valeur, label: s.libelle })));

const demiLigne = (x) => Number.isFinite(x) && Math.abs(x - Math.floor(x) - 0.5) < 1e-9;
/** Ce qui manque au formulaire avant d'envoyer, dit en clair (le serveur contrôle de nouveau). */
const manque = computed(() => {
  const f = form.value;
  if (!f.bookmaker) return 'Choisissez le bookmaker.';
  if (!marche.value) return 'Choisissez le marché.';
  if (marche.value.ligne && !(demiLigne(f.ligne) && f.ligne >= 0.5 && f.ligne <= 60.5)) return 'La ligne est une demi-ligne : 2,5 ; 9,5…';
  if (marche.value.joueur && !String(f.joueur ?? '').trim()) return 'Écrivez le nom du buteur.';
  if (!(Number(f.cote) >= 1.01)) return 'Tapez la cote vue chez le bookmaker (1,01 au moins).';
  return null;
});

const cote = (x) => (Number.isFinite(Number(x)) && Number(x) > 1 ? Number(x).toFixed(2) : '—');
const pct = (p) => `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;

/** Ce que dit le moteur sur l'issue saisie : sa probabilité et sa cote juste, ou pourquoi il n'en a pas. */
function moteurDe(s) {
  if (Number.isFinite(s.moteur?.probabilite)) return `Moteur : ${pct(s.moteur.probabilite)} · cote juste ${cote(s.moteur.coteJuste)} (${s.moteur.origine}).`;
  return s.moteur?.raison ?? 'Le moteur ne donne pas de probabilité pour cette issue.';
}
/** Ce que la pastille d'une value doit ajouter : la probabilité vient d'un modèle, pas encore jugé sur l'historique. */
const precisionDe = (s) =>
  s.moteur?.origine ? `Probabilité : ${s.moteur.origine}. Une value sur ce marché n'a pas encore été vérifiée sur l'historique (banc d'essai, étape 19 du plan).` : null;
const detailDe = (s) =>
  `Saisie à la main dans CôteMaster${s.versions > 1 ? ` — ${s.versions} versions, la première ${quandDit(s.premiereSaisieA, liveNow.value)}` : ''} ; gardée dans les archives des cotes (source « saisie »).`;
const quandRetrait = (r) => quandDit(r.retireeA, liveNow.value);

async function enregistrer() {
  if (manque.value || envoi.value.enCours) return;
  const f = form.value;
  const m = marche.value;
  const corps = {
    matchId: props.matchId,
    bookmaker: f.bookmaker,
    marketId: f.marketId,
    sens: m.joueur ? 'yes' : f.sens,
    cote: Number(f.cote),
    ...(m.ligne ? { ligne: Number(f.ligne) } : {}),
    ...(m.equipe ? { equipe: f.equipe } : {}),
    ...(m.joueur ? { joueur: String(f.joueur).trim() } : {})
  };
  envoi.value = { enCours: true, erreur: null, message: null };
  try {
    const r = await oddsApi.saisir(corps);
    etat.value = { chargement: false, erreur: null, donnees: r.etat };
    const s = r.etat?.saisies?.find((x) => x.cle === r.cle);
    const quoi = s ? `« ${s.libelle} » à ${cote(s.cote)} chez ${s.bookmakerTitre}` : 'La cote';
    let message;
    if (!r.change) message = `${quoi} était déjà enregistrée : rien de changé.`;
    else if (r.enAttente) message = `${quoi} est gardée, en attente d'écriture : ${r.raison}.`;
    else message = `${quoi} ${r.correction ? 'corrigée' : 'enregistrée'} ${quandDit(s?.releveAt ?? Date.now(), liveNow.value)}.`;
    envoi.value = { enCours: false, erreur: null, message };
  } catch (error) {
    envoi.value = { enCours: false, erreur: error.message, message: null };
  }
}

/** Corriger : le formulaire reprend la saisie, il ne reste qu'à changer la cote. */
function corriger(s) {
  form.value = { bookmaker: s.bookmaker, marketId: s.marketId, equipe: s.equipe ?? 'home', sens: s.sens, ligne: s.ligne ?? form.value.ligne, joueur: s.joueur ?? '', cote: s.cote };
  envoi.value = { enCours: false, erreur: null, message: `Corrigez la cote de « ${s.libelle} » chez ${s.bookmakerTitre}, puis enregistrez : l'ancienne reste dans les archives.` };
}

async function retirer(s) {
  retraitEnCours.value = s.cle;
  try {
    const r = await oddsApi.retirerSaisie({ matchId: props.matchId, cle: s.cle });
    etat.value = { chargement: false, erreur: null, donnees: r.etat };
    envoi.value = {
      enCours: false,
      erreur: null,
      message: r.change ? `« ${s.libelle} » chez ${s.bookmakerTitre} est retirée${r.enAttente ? ' (en attente d’écriture)' : ''} : l'archive garde qu'elle a existé.` : `« ${s.libelle} » était déjà retirée.`
    };
  } catch (error) {
    envoi.value = { enCours: false, erreur: error.message, message: null };
  } finally {
    retraitEnCours.value = null;
  }
}
</script>

<template>
  <div class="manual-odds">
    <p class="manual-odds__intro">
      Une cote vue chez un de vos bookmakers sur un marché que The Odds API ne relève pas — corners, cartons, buteurs, plus/moins,
      les deux marquent. Sa value s'affiche aussitôt face à la probabilité du moteur <HelpTip terme="value" />, et elle part dans les
      archives avec son heure ; elle vieillit comme une cote relevée <HelpTip terme="a-rafraichir" />. Le 1N2 se relève dans
      Réglages › Données.
    </p>

    <LoadingSpinner v-if="etat.chargement && !donnees" label="Cotes saisies de ce match…" />
    <div v-else-if="etat.erreur && !donnees" class="cm-note is-danger">
      <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
      <div>
        <p class="cm-note__title">Saisie indisponible</p>
        <p class="cm-note__text">{{ etat.erreur }}</p>
      </div>
    </div>

    <template v-else-if="donnees">
      <form class="manual-odds__form" @submit.prevent="enregistrer">
        <div class="manual-odds__fields">
          <AppSelect v-model="form.bookmaker" label="Bookmaker" :options="optionsBookmakers" placeholder="Choisir…" />
          <AppSelect v-model="form.marketId" label="Marché" :options="optionsMarches" />
          <AppSelect v-if="marche?.equipe" v-model="form.equipe" label="Équipe" :options="optionsEquipes" />
          <AppSelect v-if="marche && !marche.joueur" v-model="form.sens" label="Issue" :options="optionsSens" />
          <AppNumberField v-if="marche?.ligne" v-model="form.ligne" label="Ligne" :min="0.5" :max="60.5" :step="1" hint="demi-ligne : 2,5 ; 9,5…" />
          <AppTextField v-if="marche?.joueur" v-model="form.joueur" label="Buteur" placeholder="Nom du joueur" />
          <AppNumberField v-model="form.cote" label="Cote" :min="1.01" :step="0.01" hint="telle que le bookmaker l'affiche" />
        </div>
        <div v-if="marche && !marche.avecMoteur" class="cm-note is-info">
          <span class="cm-icon-box is-info is-sm"><AppIcon name="info" :size="14" /></span>
          <div>
            <p class="cm-note__title">Gardée sans value</p>
            <p class="cm-note__text">{{ marche.sansMoteur }}</p>
          </div>
        </div>
        <div class="manual-odds__submit">
          <AppButton type="submit" variant="section" size="sm" :loading="envoi.enCours" :disabled="Boolean(manque)">
            <template #icon><AppIcon name="plus" :size="14" /></template>
            Enregistrer la cote
          </AppButton>
          <span v-if="manque" class="manual-odds__hint">{{ manque }}</span>
        </div>
        <p v-if="envoi.message" class="manual-odds__message" role="status">{{ envoi.message }}</p>
        <div v-if="envoi.erreur" class="cm-note is-danger">
          <span class="cm-icon-box is-danger is-sm"><AppIcon name="alert" :size="14" /></span>
          <div>
            <p class="cm-note__title">Cote non enregistrée</p>
            <p class="cm-note__text">{{ envoi.erreur }}</p>
          </div>
        </div>
      </form>

      <p v-if="!donnees.moteur?.disponible" class="manual-odds__hint">
        Le moteur n'a pas pu analyser ce match{{ donnees.moteur?.raison ? ` (${donnees.moteur.raison})` : '' }} : les cotes sont gardées, sans value.
      </p>

      <h4 class="cm-section-title manual-odds__title">
        Cotes saisies
        <span class="cm-section-title__hint">{{ saisies.length ? `${saisies.length} en vigueur, la plus récente d'abord` : 'aucune pour ce match' }}</span>
      </h4>
      <ul v-if="saisies.length" class="manual-odds__list">
        <li v-for="s in saisies" :key="s.cle" class="cm-block manual-odds__item">
          <div class="manual-odds__head">
            <span class="manual-odds__what">
              <strong class="manual-odds__label">{{ s.libelle }}</strong>
              <span class="manual-odds__where">{{ s.bookmakerTitre }} · {{ s.marche }}</span>
            </span>
            <span class="manual-odds__odds cm-numeric" title="Cote saisie, telle que le bookmaker l'affiche">{{ cote(s.cote) }}</span>
            <ValueBadge
              taille="sm"
              :pourcent="s.pourcent"
              :jouable="s.jouable"
              :cote="s.cote"
              :regle="regle"
              :fraicheur="s.fraicheur"
              :bookmaker="s.bookmakerTitre"
              :precision="precisionDe(s)"
            />
          </div>
          <p class="manual-odds__engine">{{ moteurDe(s) }}</p>
          <div class="manual-odds__foot">
            <ProvenanceChip source="Saisie à la main" :releve-le="s.releveAt" action="saisie" :vieux-apres-heures="delaiHeures" variante="ligne" :detail="detailDe(s)" />
            <span v-if="s.enAttente" class="cm-chip is-warning" title="Une passe d'actualisation ou un import tient la base : la cote part dans les archives dès qu'il se termine.">en attente d'écriture</span>
            <span v-if="s.corrigee" class="cm-chip" :title="`${s.versions} versions gardées dans les archives`">corrigée · avant {{ cote(s.coteAvant) }}</span>
            <span class="manual-odds__actions">
              <AppButton variant="ghost" size="sm" @click="corriger(s)">
                <template #icon><AppIcon name="edit" :size="13" /></template>
                Corriger
              </AppButton>
              <AppButton variant="ghost" size="sm" :loading="retraitEnCours === s.cle" @click="retirer(s)">
                <template #icon><AppIcon name="trash" :size="13" /></template>
                Retirer
              </AppButton>
            </span>
          </div>
        </li>
      </ul>
      <p v-if="retirees.length" class="manual-odds__retirees">
        Retirées (gardées dans les archives) :
        <span v-for="(r, i) in retirees" :key="r.cle">{{ i ? ' ; ' : '' }}« {{ r.libelle }} » chez {{ r.bookmakerTitre }}, retirée {{ quandRetrait(r) }}</span>.
      </p>
    </template>
  </div>
</template>

<style scoped>
.manual-odds {
  /* Se règle sur SA largeur : page large comme colonne étroite. */
  container: modds / inline-size;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.manual-odds__intro {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--cm-text-secondary);
}

.manual-odds__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
}

.manual-odds__fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px 12px;
  align-items: end;
}

.manual-odds__submit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.manual-odds__hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.manual-odds__message {
  margin: 0;
  font-size: 12.5px;
  color: var(--cm-text-primary);
}

.manual-odds__title {
  margin: 4px 0 0;
}

.manual-odds__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.manual-odds__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.manual-odds__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
}

.manual-odds__what {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.manual-odds__label {
  font-size: 13.5px;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.manual-odds__where {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.manual-odds__odds {
  padding: 3px 11px;
  border-radius: 999px;
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-raised);
  color: var(--cm-text-primary);
  font-size: 13px;
  font-weight: 800;
}

.manual-odds__engine {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.manual-odds__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
}

.manual-odds__actions {
  display: inline-flex;
  gap: 4px;
  margin-left: auto;
}

.manual-odds__retirees {
  margin: 0;
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

/* Colonne étroite : la cote et la pastille passent sous le libellé. */
@container modds (max-width: 460px) {
  .manual-odds__head {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .manual-odds__head > :last-child {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .manual-odds__actions {
    margin-left: 0;
  }
}
</style>
