<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/common/AppIcon.vue';
import { liveNow } from '@/utils/liveClock.js';
import { etatValue, etatVerdict, fraicheurVivante, pourcentSigne } from '@/utils/langageParis.js';

/**
 * La pastille de VALUE (étape 6 du plan, 06/10/2026) : le seul endroit de
 * l'appli où le VERT dit « value ». Elle ne devient verte que si la cote vient
 * d'un de VOS bookmakers (`jouable` : la règle estJouable du serveur) ET que
 * son avantage dépasse le seuil du moteur sans dépasser son maximum, avec une
 * cote sous la cote maximale — la règle de findValueBet, écrite une fois dans
 * utils/langageParis.js (etatValue) et rejouée par les tests du serveur.
 *
 * Toutes les autres situations restent NEUTRES, grisées ou ambre, et se lisent
 * sans la couleur : une icône et un mot (« sous le seuil », « référence », « non
 * jouable », « trop beau pour être vrai »), la raison complète au survol et
 * pour les lecteurs d'écran (aria-label). Une cote gratuite de référence
 * (`reference`) n'est JAMAIS verte, quel que soit son avantage.
 *
 * `pourcent` : l'avantage en % (probabilité du moteur × cote − 1), tel que le
 * serveur le donne ; `regle` : { min, max, coteMax } du moteur (Réglages, min et
 * max en %) — sans elle, jamais de vert. Le texte visible se calcule ici ;
 * l'appelant peut le remplacer par le sien (emplacement par défaut), les
 * couleurs, l'icône et l'accessibilité restent décidées ici.
 *
 * `fraicheur` (étape 7 du plan) : la fraîcheur de la cote telle que le serveur
 * la donne (heure du relevé, coup d'envoi, réglage). Elle est RÉÉVALUÉE à
 * l'horloge partagée : une cote trop vieille, ou relevée avant l'annonce des
 * compositions, devient « à rafraîchir » — jamais verte — sans recharger la
 * page. Toute pastille posée sur une cote de vos bookmakers la reçoit (test).
 *
 * `verdict` (étape 8 du plan) : le VERDICT DU MOTEUR sur cette issue, tel que
 * le serveur le donne (server/src/core/engine/verdictPari.js — findValueBet,
 * « juge et partie » compris). Avec lui, la pastille ne refait plus la règle :
 * elle dit le verdict (etatVerdict) et ne réévalue que la fraicheur de SA cote
 * à l'horloge. Vert ⇔ le moteur recommande ce pari ET la cote est fraîche —
 * la même pastille, le même vert, sur la page « Opportunités du jour », le
 * Repérage et l'onglet « Value bets » de Mes paris. Sans verdict (serveur
 * d'avant l'étape 8), la règle de l'étape 6 s'applique comme avant.
 */
const props = defineProps({
  pourcent: { type: Number, default: null },
  jouable: { type: Boolean, default: false },
  reference: { type: Boolean, default: false },
  cote: { type: Number, default: null },
  regle: { type: Object, default: null },
  fraicheur: { type: Object, default: null },
  maintenant: { type: Number, default: null }, // l'instant de lecture (les essais) ; sinon l'horloge partagée
  bookmaker: { type: String, default: null }, // chez qui, pour la phrase complète
  precision: { type: String, default: null }, // ce que la page qui la pose ne voit pas : ajouté à la phrase d'UNE value seulement
  verdict: { type: Object, default: null }, // le verdict du moteur sur cette issue (étape 8) : il décide seul du vert
  taille: { type: String, default: 'md' } // 'sm' | 'md'
});

const fraicheurLue = computed(() => (props.fraicheur ? fraicheurVivante(props.fraicheur, props.maintenant ?? liveNow.value) : null));
// Sans verdict du moteur : la règle de l'étape 6, rejouée ici (etatValue).
const luParLaRegle = computed(() =>
  etatValue({ pourcent: props.pourcent, jouable: props.jouable, reference: props.reference, cote: props.cote, regle: props.regle, fraicheur: fraicheurLue.value })
);
// Avec lui (étape 8) : le verdict du moteur, sa fraîcheur réévaluée à l'horloge (etatVerdict).
const lu = computed(() =>
  props.verdict ? etatVerdict(props.verdict, props.maintenant ?? liveNow.value) : luParLaRegle.value
);

const ICONES = {
  value: 'check',
  'sous-seuil': 'minus',
  'sans-value': 'minus',
  'trop-beau': 'alert',
  'cote-haute': 'alert',
  'a-rafraichir': 'clock',
  'non-jouable': 'lock',
  reference: 'info',
  'seuil-inconnu': 'info',
  // Les états du verdict du moteur (étape 8).
  'value-secondaire': 'info',
  juge: 'shield',
  'non-cote': 'minus',
  'pas-de-reference': 'info',
  incoherente: 'alert',
  'coupe-circuit': 'pause',
  'pas-de-cote': 'minus',
  inconnue: 'minus'
};
// Un mot de plus à côté du chiffre quand le chiffre seul ne dit pas pourquoi ce n'est pas une value.
const AVEC_MOT = new Set(['sous-seuil', 'trop-beau', 'cote-haute', 'seuil-inconnu', 'a-rafraichir']);
for (const etat of ['value-secondaire', 'juge', 'coupe-circuit']) AVEC_MOT.add(etat);

const nombre = computed(() => (Number.isFinite(props.pourcent) ? pourcentSigne(props.pourcent) : null));
// Le texte d'un verdict du moteur : son avantage (celui de l'offre qu'il a jugée), sinon le mot de son état.
const texteDuVerdict = computed(() => {
  const etat = lu.value.etat;
  const n = Number.isFinite(props.verdict?.pourcent) ? pourcentSigne(props.verdict.pourcent) : null;
  if (etat === 'value') return `Value ${n}`;
  if (AVEC_MOT.has(etat)) return n ?? (etat === 'a-rafraichir' ? 'cote' : '');
  if (etat === 'sans-value') return n ?? '';
  if (etat === 'inconnue') return 'valeur inconnue';
  return lu.value.qualificatif;
});
const texte = computed(() => {
  const etat = lu.value.etat;
  if (props.verdict) return texteDuVerdict.value;
  if (etat === 'value') return `Value ${nombre.value}`;
  if (etat === 'reference' || etat === 'non-jouable') return lu.value.qualificatif;
  if (etat === 'inconnue') return 'valeur inconnue';
  if (etat === 'a-rafraichir') return nombre.value ?? 'cote';
  return nombre.value ?? '';
});
const phrase = computed(
  () => `${lu.value.raison}${props.bookmaker && lu.value.etat !== 'reference' ? ` Cote de ${props.bookmaker}.` : ''}${lu.value.vert && props.precision ? ` ${props.precision}` : ''}`
);
// Le verdict du moteur dit déjà chez qui, et ce qu'il a écarté : sa phrase, telle quelle.
const phraseLue = computed(() => (props.verdict ? lu.value.raison : phrase.value));
</script>

<template>
  <span class="vbadge" :class="[`is-${lu.etat}`, `vbadge--${taille}`]" role="img" :aria-label="phraseLue" :title="phraseLue">
    <AppIcon :name="ICONES[lu.etat]" :size="taille === 'sm' ? 10 : 12" class="vbadge__icon" />
    <span class="vbadge__text"><slot>{{ texte }}</slot></span>
    <span v-if="AVEC_MOT.has(lu.etat)" class="vbadge__word">{{ lu.qualificatif }}</span>
  </span>
</template>

<style scoped>
.vbadge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 9px 2px 7px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  cursor: help;
}

.vbadge--sm {
  padding: 1px 8px 1px 6px;
  font-size: 10.5px;
}

.vbadge__icon {
  flex-shrink: 0;
}

.vbadge__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Le mot qui explique le chiffre : plus discret que lui. */
.vbadge__word {
  font-size: 10px;
  font-weight: 600;
  opacity: 0.85;
}

/* LE VERT : une vraie value chez vos bookmakers, et rien d'autre. */
.vbadge.is-value {
  border-color: rgba(var(--cm-accent-rgb) / 0.4);
  background: var(--cm-accent-soft);
  color: var(--cm-accent);
}

/* Sans value, sous le seuil, valeur ou seuil inconnus : neutre, jamais coloré.
   Étape 8 : une value que le moteur ne retient pas (il ne garde qu'un pari par match) aussi. */
.vbadge.is-sous-seuil,
.vbadge.is-sans-value,
.vbadge.is-inconnue,
.vbadge.is-seuil-inconnu,
.vbadge.is-value-secondaire {
  background: var(--cm-surface-hover);
  color: var(--cm-text-secondary);
}

/* Trop beau pour être vrai, cote trop haute : un avertissement ambre, pas un pari.
   Étape 8 : cotes incohérentes, coupe-circuit enclenché — à vérifier, ambre aussi. */
.vbadge.is-trop-beau,
.vbadge.is-cote-haute,
.vbadge.is-incoherente,
.vbadge.is-coupe-circuit {
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

/* À rafraîchir (étape 7) : l'ambre d'un relevé ancien, en pointillés, une horloge et le mot — jamais le vert. */
.vbadge.is-a-rafraichir {
  border-style: dashed;
  border-color: rgba(var(--cm-warning-rgb) / 0.45);
  background: var(--cm-warning-soft);
  color: var(--cm-warning);
}

/* Pas jouable, cote de référence : grisé, bordure en pointillés (se voit sans la couleur).
   Étape 8 : de même pour ce que le moteur écarte sans lire de value — juge et partie, issue non cotée, pas de cote juste, pas de cote. */
.vbadge.is-non-jouable,
.vbadge.is-reference,
.vbadge.is-juge,
.vbadge.is-non-cote,
.vbadge.is-pas-de-reference,
.vbadge.is-pas-de-cote {
  border-style: dashed;
  border-color: var(--cm-border-strong);
  background: transparent;
  color: var(--cm-text-muted);
}
</style>
