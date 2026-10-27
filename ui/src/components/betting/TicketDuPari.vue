<script setup>
import { computed } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import AppSelect from '@/components/common/AppSelect.vue';
import AppNumberField from '@/components/common/AppNumberField.vue';
import AppToggle from '@/components/common/AppToggle.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import { liveNow } from '@/utils/liveClock.js';
import { ilYA } from '@/utils/langageParis.js';
import { texteDesBornes } from '@/utils/comparateur.js';
import {
  NATURES,
  PRIX_JUSTE_COMBINE,
  SOURCES_DE_COTE,
  cleDeSelection,
  cotePriseDe,
  controleDuTicket,
  gainsDuTicket,
  natureDuTicket,
  pariAEnregistrer,
  phraseFaceAuxBornes
} from '@/utils/ticket.js';
import { alertesDuTicket } from '@/utils/gardeFous.js';
import { prixJusteDit } from '@/utils/simulation.js';

/**
 * LE TICKET (étape 10 du plan, 06/10/2026) — un seul, posé dans le bordereau de
 * Mes paris et sous le comparateur de la page d'un match. Pour chaque sélection :
 * ce que dit le moteur (sa probabilité, d'où elle vient), la cote PRISE chez le
 * bookmaker (préremplie avec celle du relevé ou de la saisie, à corriger si elle
 * a bougé), l'heure de cette cote, et ce qu'elle vaut face à la cote minimale du
 * serveur. Pour le ticket : le bookmaker (un ticket se joue chez un seul), sa
 * nature (simple, combiné de plusieurs matchs, combiné du même match — dont la
 * cote est celle du bookmaker, à taper), le gain potentiel et le gain attendu
 * (pari simple ; un combiné seulement avec son prix juste). Étape 28 : le prix
 * juste d'un combiné, calculé par le serveur et donné par la page (`prixJuste`),
 * quand Réglages le montre — son heure, la cote tapée en écart NEUTRE (jamais
 * ValueBadge ni vert), « si les sélections étaient indépendantes » en gris, sa
 * précision, sa provenance ; « impossible » ; une sélection de mi-temps « se lit,
 * ne se parie pas ». Éteint : une ligne dit qu'il attend.
 *
 * Aucune règle ici : utils/ticket.js décide (et les tests du serveur la
 * rejouent). Le composant n'appelle rien : « J'ai parié » rend le corps de
 * POST /api/bets à la page (`jai-parie`), qui l'enregistre. Sans `avecValidation`
 * (Mes paris), la mise et le bouton restent ceux du bordereau d'avant.
 */
const props = defineProps({
  selections: { type: Array, required: true },
  edition: { type: Object, required: true }, // { bookmaker, cotes: { [cle]: cote }, coteCombinee }
  mise: { type: Number, default: null },
  bookmakers: { type: Array, default: () => [] }, // vos bookmakers [{ cle, titre }]
  memeMatch: { type: Boolean, default: false },
  avecValidation: { type: Boolean, default: true },
  enCours: { type: Boolean, default: false },
  origine: { type: String, default: 'page-du-match' },
  // Étape 11 : vos garde-fous ({ reglage, etat } de GET /api/config/garde-fous) et les fiches de vos comptes ({ [cle]: fiche }) —
  // pour SIGNALER une mise au-delà d'un plafond, de la mise acceptée ou du solde ; jamais pour bloquer « J'ai parié ».
  gardeFous: { type: Object, default: null },
  comptes: { type: Object, default: null },
  // Étape 28 : le prix juste d'un combiné, tel que la page l'a demandé au serveur (composables/usePrixJuste.js :
  // { enCours, reponse, erreur }). Absent ou éteint : le ticket dit qu'il attend.
  prixJuste: { type: Object, default: null },
  maintenant: { type: Number, default: null }
});

const emit = defineEmits(['update:edition', 'update:mise', 'update:memeMatch', 'jai-parie', 'retirer', 'vider']);

const heure = computed(() => props.maintenant ?? liveNow.value);
const nature = computed(() => natureDuTicket(props.selections));
const manques = computed(() => controleDuTicket({ selections: props.selections, edition: props.edition, mise: props.mise, bookmakers: props.bookmakers }));
const optionsBookmakers = computed(() => props.bookmakers.map((b) => ({ value: b.cle, label: b.titre })));
const titreDuBookmaker = computed(() => props.bookmakers.find((b) => b.cle === props.edition.bookmaker)?.titre ?? props.edition.bookmaker ?? null);
// Étape 28 : le prix juste d'un combiné (le serveur) — un écart NEUTRE à la cote tapée, jamais une value (pas de vert).
// Pendant un recalcul (le ticket vient de changer), JAMAIS le prix d'un autre ticket : ni montré, ni dans le gain attendu,
// ni joint à « J'ai parié » (vérification du 27/10, constat 11) ; « calcul en cours » seulement quand l'affichage est
// connu comme allumé (constat 23), sinon la phrase « il attend ».
const prix = computed(() => {
  if (nature.value === 'simple' || nature.value === 'vide') return { etat: 'attente' };
  if (props.prixJuste?.enCours) return { etat: props.prixJuste?.allume === true ? 'calcul' : 'attente' };
  return prixJusteDit(props.prixJuste?.reponse ?? null, { cote: props.edition.coteCombinee, bookmaker: titreDuBookmaker.value });
});
const gains = computed(() => gainsDuTicket({ selections: props.selections, edition: props.edition, mise: props.mise, probabiliteCombine: prix.value.etat === 'prix' ? prix.value.probabilite : null }));
/** Étape 11 : ce que les garde-fous et la fiche du compte signalent — affiché, jamais compté dans « ce qui manque ». */
const alertesGardeFous = computed(() => alertesDuTicket({ mise: props.mise, bookmaker: props.edition.bookmaker, bookmakers: props.bookmakers, gardeFous: props.gardeFous, comptes: props.comptes }));

const cote2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : '—');
const pourcent = (p) => (Number.isFinite(p) ? `${(p * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %` : 'inconnue');
const euros = (x) => (Number.isFinite(x) ? `${x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—');
const signe = (x) => (x > 0 ? '+' : x < 0 ? '−' : '');

function maj(changement) {
  emit('update:edition', { ...props.edition, ...changement });
}
function majCote(selection, valeur) {
  maj({ cotes: { ...(props.edition.cotes ?? {}), [cleDeSelection(selection)]: Number.isFinite(valeur) ? valeur : null } });
}
const coteDe = (s) => cotePriseDe(s, props.edition.cotes);

/** D'où vient la cote préremplie d'une sélection, et quand : la phrase sous le champ. */
function provenanceDe(s) {
  const cote = coteDe(s);
  if (cote === null) return 'à taper : la cote que vous avez eue chez le bookmaker.';
  const memePrix = Number.isFinite(s.cote) && Math.abs(s.cote - cote) < 1e-9;
  const memeLivre = (s.bookmaker ?? null) === (props.edition.bookmaker ?? null);
  if (memePrix && memeLivre && s.coteReleveeA) {
    return `${SOURCES_DE_COTE[s.coteSource] ?? 'cote relevée'}, ${s.coteSource === 'saisie' ? 'saisie' : 'relevée'} ${ilYA(s.coteReleveeA, heure.value)}${s.bookmakerTitle ? ` chez ${s.bookmakerTitle}` : ''}.`;
  }
  return `${SOURCES_DE_COTE['au-pari']} : notée à l'heure du pari.`;
}

/** La cote minimale de la sélection, et ce que vaut la cote prise face à elle. */
function bornesDe(s) {
  if (!s.bornes) return { court: 'cote minimale : sur la page du match (comparateur)', detail: "Ce pari ne porte pas les bornes du serveur : la cote minimale se lit dans le comparateur de la page du match.", face: null };
  const t = texteDesBornes(s.bornes);
  return { court: t.court, detail: t.detail, face: phraseFaceAuxBornes(coteDe(s), s.bornes) };
}

function jaiParie() {
  if (manques.value.length || props.enCours) return;
  const prixJuste = prix.value.etat === 'prix' && prix.value.pariable ? { probabilite: prix.value.probabilite, source: prix.value.source, lueA: prix.value.lueA } : null;
  emit('jai-parie', pariAEnregistrer({ selections: props.selections, edition: props.edition, mise: props.mise, origine: props.origine, maintenant: heure.value, bookmakers: props.bookmakers, prixJuste }));
}
</script>

<template>
  <section class="tkt" aria-label="Ticket">
    <header class="tkt__head">
      <span class="tkt__nature">
        <AppIcon name="cards" :size="13" />
        <strong>{{ NATURES[nature] }}</strong>
        <span v-if="selections.length" class="tkt__count">· {{ selections.length }} sélection{{ selections.length > 1 ? 's' : '' }}</span>
      </span>
      <AppToggle
        class="tkt__combine"
        :model-value="memeMatch"
        label="Combiner les paris d'un même match"
        :description="memeMatch ? 'Activé : les paris d’un même match se combinent, à la cote du bookmaker.' : 'Désactivé : un seul pari par match, comme avant.'"
        @update:model-value="(v) => emit('update:memeMatch', v)"
      />
    </header>

    <p v-if="!selections.length" class="tkt__empty">
      Aucune sélection : prenez une cote dans le comparateur (ou cochez un pari dans Mes paris), puis dites « J'ai parié » une fois le pari placé chez votre bookmaker.
    </p>

    <template v-else>
      <div class="tkt__book">
        <AppSelect
          :model-value="edition.bookmaker"
          label="Bookmaker où vous avez parié"
          :options="optionsBookmakers"
          placeholder="Choisir…"
          @update:model-value="(v) => maj({ bookmaker: v })"
        />
        <p class="tkt__hint">Un ticket se joue chez un seul bookmaker : vérifiez que chaque cote prise est bien la sienne.</p>
      </div>

      <ul class="tkt__list">
        <li v-for="s in selections" :key="cleDeSelection(s)" class="tkt__sel">
          <div class="tkt__what">
            <PickCrest :item="s" :home="s.homeName" :away="s.awayName" :league="s.league" :size="18" />
            <span class="tkt__text">
              <strong class="tkt__pick">{{ s.pick }}</strong>
              <span class="tkt__market">{{ s.market }} · {{ s.homeName }} – {{ s.awayName }}</span>
            </span>
            <button type="button" class="tkt__remove" :title="`Retirer « ${s.pick} » du ticket`" @click="emit('retirer', cleDeSelection(s))">
              <AppIcon name="x" :size="13" />
            </button>
          </div>
          <p class="tkt__engine" :title="s.probabiliteSource ?? ''">
            Moteur : <strong class="cm-numeric">{{ pourcent(s.probabiliteMoteur) }}</strong>
            <template v-if="Number.isFinite(s.coteJuste)"> · cote juste <span class="cm-numeric">{{ cote2(s.coteJuste) }}</span></template>
            <span v-if="s.probabiliteSource" class="tkt__muted"> · {{ s.probabiliteSource }}</span>
            <span v-if="s.probabiliteLueA" class="tkt__muted"> · calculée {{ ilYA(s.probabiliteLueA, heure) }}</span>
          </p>
          <div class="tkt__taken">
            <AppNumberField
              class="tkt__odds"
              :model-value="coteDe(s)"
              label="Cote prise"
              :min="1.01"
              :step="0.01"
              @update:model-value="(v) => majCote(s, v)"
            />
            <div class="tkt__notes">
              <small class="tkt__muted">{{ provenanceDe(s) }}</small>
              <small class="tkt__muted" :title="bornesDe(s).detail">{{ bornesDe(s).court }} <HelpTip terme="cote-minimale" /></small>
              <small v-if="bornesDe(s).face" class="tkt__face">{{ bornesDe(s).face }}</small>
            </div>
          </div>
        </li>
      </ul>

      <div v-if="nature !== 'simple'" class="tkt__combo">
        <AppNumberField
          v-if="nature === 'combine-meme-match' || nature === 'combine'"
          class="tkt__odds"
          :model-value="edition.coteCombinee"
          :label="nature === 'combine-meme-match' ? 'Cote du combiné chez le bookmaker' : 'Cote du combiné (si le bookmaker l’arrondit)'"
          :min="1.01"
          :step="0.01"
          @update:model-value="(v) => maj({ coteCombinee: Number.isFinite(v) ? v : null })"
        />
        <p class="tkt__note">
          <template v-if="nature === 'combine-meme-match'">Les sélections d'un même match sont liées : la cote est celle que donne le bookmaker, jamais le produit des cotes. </template>
          <template v-else-if="Number.isFinite(gains.produit)">Produit des cotes prises : <span class="cm-numeric">{{ cote2(gains.produit) }}</span>. </template>
          <template v-if="prix.etat === 'attente' || prix.etat === 'eteint'">{{ PRIX_JUSTE_COMBINE }}</template>
        </p>
        <!-- Étape 28 : le prix juste du combiné (le serveur), seulement quand Réglages le montre. La cote tapée y est un écart
             NEUTRE : aucun prix de combiné n'est relevé, aucune value de combiné n'est prouvée — jamais de vert ici. -->
        <p v-if="prix.etat === 'eteint' && prix.pourquoi" class="tkt__prix-gris" data-prix-juste="eteint">{{ prix.pourquoi }}</p>
        <div v-else-if="prix.etat === 'prix'" class="tkt__prix" data-prix-juste="prix">
          <p class="tkt__prix-ligne">
            <strong class="cm-numeric">{{ prix.prix }}</strong>
            <HelpTip terme="prix-juste-combine" />
          </p>
          <p v-if="prix.ecart" class="tkt__prix-ecart cm-numeric">{{ prix.ecart }}</p>
          <p v-if="prix.siIndependants" class="tkt__prix-gris cm-numeric">{{ prix.siIndependants }}</p>
          <p class="tkt__prix-precision">{{ prix.precision }}</p>
          <p v-for="m in prix.mentions" :key="m" class="tkt__prix-mention">{{ m }}</p>
          <p v-if="prix.provenance" class="tkt__prix-gris">{{ prix.provenance }}</p>
        </div>
        <p v-else-if="prix.etat === 'impossible'" class="tkt__prix-impossible" data-prix-juste="impossible">Prix juste : <strong>impossible</strong> — {{ prix.phrase }}.</p>
        <ul v-else-if="prix.etat === 'refuse'" class="tkt__prix-refus" data-prix-juste="refuse">
          <li v-for="r in prix.raisons" :key="r">{{ r }}</li>
        </ul>
        <p v-if="prix.etat === 'calcul'" class="tkt__prix-gris" data-prix-juste="calcul">Prix juste : calcul en cours au serveur…</p>
        <p v-else-if="prixJuste?.erreur" class="tkt__prix-gris">Prix juste illisible pour l’instant : {{ prixJuste.erreur }}</p>
      </div>

      <dl class="tkt__figures">
        <div class="tkt__figure">
          <dt>Cote du ticket</dt>
          <dd class="cm-numeric">{{ cote2(gains.cote) }}</dd>
        </div>
        <div class="tkt__figure">
          <dt>Gain potentiel à vos cotes</dt>
          <dd class="cm-numeric">{{ euros(gains.potentiel) }}</dd>
        </div>
        <div class="tkt__figure" :title="gains.raisonAttendu ?? 'Mise × (probabilité du moteur × cote prise − 1), au moment du pari.'">
          <dt>Gain attendu</dt>
          <dd v-if="gains.attendu" class="cm-numeric">{{ signe(gains.attendu.montant) }}{{ euros(Math.abs(gains.attendu.montant)) }} ({{ signe(gains.attendu.pourcent) }}{{ Math.abs(gains.attendu.pourcent).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) }} %)</dd>
          <dd v-else class="tkt__muted">{{ nature === 'simple' ? 'inconnu' : 'pas encore (étape 28)' }}</dd>
        </div>
      </dl>

      <!-- Étape 11 : vos garde-fous et la fiche du compte — signalés, le bouton reste actif. -->
      <ul v-if="alertesGardeFous.length" class="tkt__alertes" aria-live="polite">
        <li v-for="a in alertesGardeFous" :key="a.code" class="tkt__alerte" :class="`is-${a.niveau}`">
          <AppIcon name="alert" :size="12" />
          <span>{{ a.texte }}</span>
        </li>
      </ul>

      <div v-if="avecValidation" class="tkt__submit">
        <AppNumberField :model-value="mise" label="Mise (€)" :min="1" class="tkt__stake" @update:model-value="(v) => emit('update:mise', v)" />
        <AppButton variant="primary" :loading="enCours" :disabled="manques.length > 0" @click="jaiParie">
          <template #icon><AppIcon name="check" :size="14" /></template>
          J'ai parié{{ titreDuBookmaker ? ` chez ${titreDuBookmaker}` : '' }}
        </AppButton>
        <button type="button" class="tkt__clear" @click="emit('vider')">Vider le ticket</button>
      </div>

      <ul v-if="manques.length" class="tkt__missing" aria-live="polite">
        <li v-for="m in manques" :key="m">{{ m }}</li>
      </ul>
      <p v-else class="tkt__ready">
        Prêt : le pari sera noté avec {{ titreDuBookmaker }}, la cote prise, la probabilité du moteur et l'heure de chaque cote — pour sa valeur de clôture et son gain attendu.
      </p>
    </template>
  </section>
</template>

<style scoped>
.tkt {
  container: tkt / inline-size;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--cm-radius-md);
  border: 1px solid var(--cm-border);
  background: var(--cm-surface-alt);
}

.tkt__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}

.tkt__nature {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  color: var(--cm-text-primary);
}

.tkt__count {
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.tkt__combine {
  max-width: 340px;
}

.tkt__empty,
.tkt__hint,
.tkt__note,
.tkt__ready {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.tkt__book {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 360px;
}

.tkt__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tkt__sel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-raised);
}

.tkt__what {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.tkt__text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1;
}

.tkt__pick {
  font-size: 13.5px;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.tkt__market {
  font-size: 11.5px;
  color: var(--cm-text-muted);
  overflow-wrap: anywhere;
}

.tkt__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 1px solid var(--cm-border-soft);
  background: transparent;
  color: var(--cm-text-muted);
  cursor: pointer;
}

.tkt__remove:hover {
  border-color: var(--cm-border);
  color: var(--cm-text-primary);
}

.tkt__engine {
  margin: 0;
  font-size: 12px;
  color: var(--cm-text-secondary);
}

.tkt__muted {
  font-size: 11.5px;
  color: var(--cm-text-muted);
}

.tkt__taken {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 14px;
}

.tkt__odds {
  width: 150px;
}

.tkt__notes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1 1 220px;
}

/* La cote prise face à la cote minimale : du texte, jamais le vert (le vert est celui de la pastille de value). */
.tkt__face {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.tkt__combo {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 14px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px dashed var(--cm-border);
}

.tkt__combo .tkt__note {
  flex: 1 1 260px;
}

/* Étape 28 : le prix juste d'un combiné — du texte neutre, jamais le vert d'une value (DESIGN.md § 6). */
.tkt__prix {
  display: flex;
  flex: 1 1 100%;
  flex-direction: column;
  gap: 3px;
}

.tkt__prix p,
.tkt__prix-impossible,
.tkt__prix-gris {
  margin: 0;
}

.tkt__prix-ligne {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  color: var(--cm-text-primary);
}

.tkt__prix-ecart {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

.tkt__prix-gris,
.tkt__prix-precision {
  flex: 1 1 100%;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-muted);
}

.tkt__prix-mention {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.tkt__prix-impossible {
  flex: 1 1 100%;
  font-size: 12.5px;
  color: var(--cm-text-secondary);
}

.tkt__prix-refus {
  flex: 1 1 100%;
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cm-text-secondary);
}

.tkt__figures {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  margin: 0;
}

.tkt__figure {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tkt__figure dt {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.tkt__figure dd {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--cm-text-primary);
}

.tkt__submit {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 14px;
}

.tkt__stake {
  width: 120px;
}

.tkt__clear {
  border: none;
  background: none;
  padding: 0;
  font-size: 12px;
  color: var(--cm-text-muted);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.tkt__missing {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: var(--cm-warning);
}

/* Étape 11 : ce que les garde-fous signalent — en ambre, jamais le vert ni le rouge du ticket (règle de l'étape 10) ;
   un compte fermé ou la perte de la semaine atteinte, en gras. */
.tkt__alertes {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tkt__alerte {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--cm-warning);
}

.tkt__alerte.is-danger {
  font-weight: 700;
}

@container tkt (max-width: 520px) {
  .tkt__odds,
  .tkt__stake {
    width: 100%;
  }
}
</style>
