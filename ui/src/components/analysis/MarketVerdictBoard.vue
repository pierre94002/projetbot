<script setup>
import { computed } from 'vue';
import AppButton from '@/components/common/AppButton.vue';
import AppIcon from '@/components/common/AppIcon.vue';
import ValueBadge from '@/components/common/ValueBadge.vue';
import ConfidenceGauge from '@/components/common/ConfidenceGauge.vue';
import ProvenanceChip from '@/components/common/ProvenanceChip.vue';
import HelpTip from '@/components/common/HelpTip.vue';
import AVerifierBadge from '@/components/common/AVerifierBadge.vue';
import TeamCrest from '@/components/matches/TeamCrest.vue';
import PickCrest from '@/components/matches/PickCrest.vue';
import { liveNow } from '@/utils/liveClock.js';
import { formatOdds } from '@/utils/format.js';
import { verdictsParMarche, pourcentageEntier, precisionDeLaSaisie, COTE_MINIMALE_DU_PRONOSTIC } from '@/utils/verdictParMarche.js';
import { deuxCinqCale, PHRASE_DE_LA_VALUE_DU_DEUX_CINQ } from '@/utils/modeleDeButs.js';

/**
 * LE VERDICT PAR MARCHÉ (étape 9 du plan, 06/10/2026) : la première chose que dit
 * la page d'un match à venir, dans l'ordre d'une décision. Pour chaque marché,
 * une ligne : le pari, ce que dit le moteur (probabilité et cote juste), la
 * meilleure cote de vos bookmakers avec l'heure de son relevé, le verdict de
 * value (la pastille `ValueBadge`, du verdict du moteur) et la confiance
 * (« pas encore mesurée » tant que l'étape 38 du plan n'est pas faite).
 *
 * Aucun calcul de pari ici : les lignes viennent de utils/verdictParMarche.js,
 * qui assemble ce que le serveur a déjà calculé — le verdict du 1 / N / 2
 * (verdictPari.js, le même que la page Opportunités, le Repérage et Mes paris),
 * le pronostic de chaque autre marché (markets.js) et les cotes que Pierre a
 * saisies à la main (The Odds API ne relève que le 1 / N / 2). Une cote qui
 * n'existe pas est DITE, jamais un tiret ; une cote gratuite de référence n'est
 * jamais montrée ici.
 *
 * `saisies` : la réponse de GET /api/odds/saisies (ou null tant qu'elle n'est pas
 * lue). Le bouton « Saisir une cote » ne fait que le dire à la page (événement
 * `saisir`) : la saisie elle-même reste sur la carte de l'onglet Marchés.
 */
const props = defineProps({
  result: { type: Object, required: true }, // l'analyse du moteur (GET /api/analysis/match/:id)
  match: { type: Object, required: true }, // { home, away, league }
  saisies: { type: Object, default: null }, // GET /api/odds/saisies?matchId=
  homeId: { type: String, default: null },
  awayId: { type: String, default: null }
});

defineEmits(['saisir']);

const lu = computed(() => verdictsParMarche({ result: props.result, match: props.match, saisies: props.saisies, maintenant: liveNow.value }));
/** Étape 14 : les raisons « à vérifier » du match (contrôle quotidien), jointes à l'analyse par le serveur — informatives, le verdict ne change pas. */
const aVerifier = computed(() => props.result?.aVerifier ?? null);
const resume = computed(() => lu.value.resume);

/** L'heure du relevé de vos cotes (1 / N / 2) : la plus récente que portent les verdicts ; null si aucune n'est connue. */
const releveDeVosCotes = computed(() => {
  const heures = (lu.value.groupes.find((g) => g.cle === 'resultat')?.lignes ?? []).map((l) => l.meilleureCote?.releveAt).filter(Boolean).sort();
  return heures.at(-1) ?? null;
});
const vosCotesDuResultat = computed(() => (lu.value.groupes.find((g) => g.cle === 'resultat')?.lignes ?? []).some((l) => l.meilleureCote));
const delaiHeures = computed(() => {
  const m = props.result?.fraicheurCotes?.reglage?.maxAgeMinutes;
  return Number.isFinite(m) ? m / 60 : 3;
});

const phraseDesValues = computed(() => {
  const n = resume.value.vertes;
  if (!n) return 'Aucune value jouable à cette minute';
  return `${n} value${n > 1 ? 's' : ''} jouable${n > 1 ? 's' : ''} à cette minute`;
});

const cote = (x) => formatOdds(x);

// Étape 27 : quand le modèle de buts unique part de la cote plus/moins 2,5 relevée pour ce match, la ligne 2,5 du
// plus/moins le dit — une value n'y vient que d'un écart entre votre bookmaker et ce marché. Sans lui : rien.
const deuxCinqSurLaCote = computed(() => deuxCinqCale(props.result));
const surLeDeuxCinq = (l) => l.marketId === 'totalGoals' && Number(l.pronostic?.params?.line ?? l.saisie?.ligne) === 2.5;
/** La phrase au survol de la case du moteur : d'où vient le pourcentage. */
function titreDuMoteur(l) {
  if (l.probabilite === null) return l.manqueDetail ?? 'Le moteur ne donne pas de probabilité pour cette ligne.';
  const pct = `${(l.probabilite * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;
  if (l.groupe === 'resultat') {
    return l.source === 'cotes'
      ? `Le moteur donne ${pct} à « ${l.libelle} » d'après les cotes des bookmakers de référence, marge retirée : cote juste ${cote(l.coteJuste)}.`
      : `Le moteur donne ${pct} à « ${l.libelle} » d'après les statistiques, faute de cote : cote juste ${cote(l.coteJuste)}.`;
  }
  return `Le moteur donne ${pct} à « ${l.libelle} » : probabilité = 1 / cote juste de ${cote(l.coteJuste)}.${l.source ? ` ${l.source}.` : ''}`;
}
/** La phrase au survol de la meilleure cote : chez qui, quand, et ce que cela dit de sa provenance. */
function titreDeLaCote(l) {
  const c = l.meilleureCote;
  if (!c) return l.manqueDetail ?? l.manque ?? '';
  const d = c.origine === 'archive' ? ' Heure lue dans les archives des cotes.' : c.origine === 'instantane' ? ' Heure du fichier du relevé : il n\'est pas encore archivé.' : '';
  return `${c.livre ?? 'Un de vos bookmakers'} paie ${cote(c.cote)} pour « ${l.libelle} » (${c.source}, ${c.releve}).${d}`;
}
</script>

<template>
  <div class="mvb">
    <div class="mvb__sum">
      <span class="cm-chip" :title="`Lignes du verdict : ${resume.lignes}, sur ${resume.marches} marché${resume.marches > 1 ? 's' : ''}. Le vert d'une pastille est la seule value jouable : le moteur la recommande, chez l'un de vos bookmakers, sur une cote fraîche.`">
        <AppIcon name="check" :size="11" />{{ phraseDesValues }}
      </span>
      <span v-if="resume.saisies" class="cm-chip" title="Cotes que vous avez saisies à la main sur cette page (onglet Marchés).">
        <AppIcon name="edit" :size="11" />{{ resume.saisies }} cote{{ resume.saisies > 1 ? 's' : '' }} saisie{{ resume.saisies > 1 ? 's' : '' }}
      </span>
      <span class="mvb__lecture">
        Moteur : probabilité et cote juste <HelpTip terme="cote-juste" /> · Value <HelpTip terme="value" /> · Confiance <HelpTip terme="sur-fragile" />
      </span>
      <AVerifierBadge v-if="aVerifier" :a-verifier="aVerifier" avec-raison taille="md" class="mvb__averif" />
      <span v-if="resume.valeurs.length" class="mvb__valeurs" title="Les values que le moteur recommande, chez l'un de vos bookmakers, sur une cote encore fraîche.">{{ resume.valeurs.map((v) => v.texte).join(' · ') }}</span>
    </div>

    <div class="mvb__head" aria-hidden="true">
      <span>Pari</span>
      <span>Moteur</span>
      <span>Meilleure cote chez vos bookmakers</span>
      <span>Value · confiance</span>
    </div>

    <section v-for="g in lu.groupes" :key="g.cle" class="mvb__group" :data-groupe="g.cle">
      <p class="mvb__title">
        {{ g.titre }}<span v-if="g.soustitre" class="mvb__subtitle"> · {{ g.soustitre }}</span>
        <ProvenanceChip
          v-if="g.cle === 'resultat' && vosCotesDuResultat"
          source="The Odds API"
          :releve-le="releveDeVosCotes"
          :vieux-apres-heures="delaiHeures"
          detail="Relevé payant de vos bookmakers, fait à la main (Réglages › Données)."
          payant
          variante="ligne"
        />
      </p>
      <ul class="mvb__list">
        <li v-for="l in g.lignes" :key="l.cle" class="mvb__row" :class="{ 'is-pick': l.choisi && g.cle === 'resultat' }">
          <div class="mvb__what">
            <span class="mvb__crest">
              <PickCrest v-if="l.camp" :side="l.camp" :home="match.home" :away="match.away" :league="match.league" :home-id="homeId" :away-id="awayId" :size="22" />
              <span v-else class="mvb__duo" :title="`${match.home} - ${match.away}`">
                <TeamCrest :name="match.home" :league="match.league" :team-id="homeId" :size="18" />
                <TeamCrest :name="match.away" :league="match.league" :team-id="awayId" :size="18" class="mvb__duo-away" />
              </span>
            </span>
            <span class="mvb__text">
              <strong class="mvb__pick">{{ l.libelle }}</strong>
              <span class="mvb__market">
                {{ l.marche }}
                <span v-if="l.choisi && g.cle === 'resultat'" class="mvb__flag" title="L'issue la plus probable du résultat selon le moteur."><AppIcon name="target" :size="10" />pronostic du moteur</span>
              </span>
              <small v-if="deuxCinqSurLaCote && surLeDeuxCinq(l)" class="mvb__sub mvb__deux-cinq" data-modele-de-buts>{{ PHRASE_DE_LA_VALUE_DU_DEUX_CINQ }}</small>
            </span>
          </div>

          <div class="mvb__engine" :title="titreDuMoteur(l)">
            <span class="cm-visually-hidden mvb__cap">Moteur</span>
            <template v-if="l.probabilite !== null">
              <strong class="mvb__prob cm-numeric">{{ pourcentageEntier(l.probabilite) }}</strong>
              <small class="mvb__sub cm-numeric">cote juste {{ cote(l.coteJuste) }}</small>
              <small v-if="g.cle === 'resultat' && l.source && l.source !== 'cotes'" class="mvb__sub" title="D'après les statistiques, faute de cote : le pourcentage n'est pas calé sur le marché.">statistiques</small>
            </template>
            <span v-else class="mvb__absent">non calculée</span>
          </div>

          <div class="mvb__best" :class="{ 'is-absente': !l.meilleureCote }" :title="titreDeLaCote(l)">
            <span class="cm-visually-hidden mvb__cap">Meilleure cote chez vos bookmakers</span>
            <template v-if="l.meilleureCote">
              <span class="mvb__odds cm-numeric">{{ cote(l.meilleureCote.cote) }}</span>
              <span class="mvb__book">{{ l.meilleureCote.livre ?? 'bookmaker sans nom' }}</span>
              <small class="mvb__sub">{{ l.meilleureCote.releve }}</small>
              <small v-if="l.meilleureCote.juge" class="mvb__sub mvb__judge">{{ l.meilleureCote.juge }}</small>
              <small v-if="l.autresSaisies" class="mvb__sub">+ {{ l.autresSaisies }} autre{{ l.autresSaisies > 1 ? 's' : '' }} saisie{{ l.autresSaisies > 1 ? 's' : '' }}</small>
            </template>
            <span v-else class="mvb__absent">{{ l.manque }}</span>
          </div>

          <div class="mvb__value">
            <span class="cm-visually-hidden mvb__cap">Value et confiance</span>
            <ValueBadge v-if="l.verdict" taille="sm" :verdict="l.verdict" :fraicheur="l.verdict.fraicheur ?? null" />
            <ValueBadge
              v-else-if="l.saisie"
              taille="sm"
              :pourcent="l.saisie.pourcent"
              :jouable="l.saisie.jouable"
              :cote="l.saisie.cote"
              :regle="lu.regle"
              :fraicheur="l.saisie.fraicheur"
              :bookmaker="l.saisie.bookmakerTitre"
              :precision="precisionDeLaSaisie(l.saisie)"
            />
            <ConfidenceGauge :valeur="l.confiance.valeur" :etiquette="l.confiance.etiquette" />
            <AVerifierBadge v-if="aVerifier" :a-verifier="aVerifier" :marche="l.marketId ?? null" />
          </div>
        </li>
      </ul>
    </section>

    <div class="mvb__foot cm-note is-info">
      <span class="cm-icon-box is-info is-sm"><AppIcon name="info" :size="14" /></span>
      <div class="mvb__foot-body">
        <p class="cm-note__title">Comment lire ce verdict</p>
        <p class="cm-note__text">
          Seul le 1 / N / 2 est relevé chez vos bookmakers (The Odds API, relevé payant fait à la main) ; pour tout autre marché, la cote se saisit à la main et sa value s'affiche ici aussitôt.
          Le moteur ne pronostique un marché que si sa cote juste dépasse {{ COTE_MINIMALE_DU_PRONOSTIC.toFixed(2).replace('.', ',') }} : un marché absent de la liste n'a pas de pronostic.
          Une cote trop vieille, ou relevée avant l'annonce des compositions, passe « à rafraîchir » et n'est jamais verte.
        </p>
        <AppButton variant="secondary" size="sm" @click="$emit('saisir')">
          <template #icon><AppIcon name="edit" :size="13" /></template>
          Saisir une cote vue chez votre bookmaker
        </AppButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mvb {
  /* Se règle sur SA largeur : la page du match est large, un panneau latéral serait étroit. */
  container: mvb / inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ------------------------------------------------------------ la synthèse */
.mvb__sum {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}

/* Les values jouables, dites une par une : du texte, pas de couleur (le vert est celui de la pastille de chaque ligne). */
.mvb__valeurs {
  flex-basis: 100%;
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
}

/* Étape 14 : le badge « à vérifier » du match, avec sa raison ; coupé proprement quand la place manque. */
.mvb__averif {
  max-width: 100%;
}

.mvb__lecture {
  margin-left: auto;
  font-size: 11px;
  color: var(--cm-text-muted);
}

/* ------------------------------------------------------- l'en-tête des colonnes */
.mvb__head {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 104px minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 12px;
  padding: 0 14px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.mvb__head > span:nth-child(2) {
  text-align: right;
}

/* ------------------------------------------------------------ les groupes */
.mvb__group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mvb__title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.mvb__subtitle {
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
}

.mvb__title :deep(.prov) {
  letter-spacing: 0;
  text-transform: none;
}

.mvb__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* ------------------------------------------------------------- une ligne */
.mvb__row {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) 104px minmax(0, 1.3fr) minmax(0, 1fr);
  align-items: center;
  gap: 8px 12px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid var(--cm-border-soft);
  background: var(--cm-surface-alt);
  transition: border-color var(--cm-transition), background var(--cm-transition);
}

.mvb__row:hover {
  border-color: var(--cm-border);
  background: var(--cm-surface-hover);
}

/* Le pronostic du moteur sur le résultat : un filet gris plus marqué, sans couleur (le vert est celui de la value). */
.mvb__row.is-pick {
  border-color: var(--cm-border-strong);
}

.mvb__what {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.mvb__crest {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  min-width: 22px;
}

.mvb__duo {
  display: inline-flex;
  align-items: center;
}

.mvb__duo-away {
  margin-left: -6px;
  box-shadow: 0 0 0 2px var(--cm-surface-alt);
}

.mvb__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mvb__pick {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--cm-text-primary);
  overflow-wrap: anywhere;
}

.mvb__market {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.mvb__flag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--cm-border-strong);
  font-weight: 700;
  letter-spacing: 0.2px;
  text-transform: none;
  white-space: nowrap;
  color: var(--cm-text-secondary);
  cursor: help;
}

/* Les trois cases de chiffres : le moteur, la cote, la value. */
.mvb__engine,
.mvb__best,
.mvb__value {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
}

.mvb__engine {
  align-items: flex-end;
  text-align: right;
}

.mvb__value {
  gap: 6px;
}

.mvb__prob {
  font-size: 17px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--cm-text-primary);
}

.mvb__odds {
  font-size: 17px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--cm-text-primary);
}

.mvb__book {
  font-size: 12px;
  font-weight: 600;
  color: var(--cm-text-secondary);
  overflow-wrap: anywhere;
}

.mvb__sub {
  font-size: 11px;
  color: var(--cm-text-muted);
}

.mvb__judge {
  font-style: italic;
}

/* Étape 27 : d'où vient une value sur le plus/moins 2,5 calé sur la cote du marché — une phrase, sur sa propre ligne. */
.mvb__deux-cinq {
  display: block;
  margin-top: 2px;
  line-height: 1.45;
  white-space: normal;
}

.mvb__absent {
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--cm-text-muted);
}

/* Les légendes des cases : cachées à l'œil sur la grande largeur (l'en-tête les porte), lues par les lecteurs d'écran. */
.mvb__cap {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--cm-text-muted);
}

.mvb__foot {
  align-items: flex-start;
}

.mvb__foot-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

/* ------------------------------------------------- largeurs */
/* Place étroite (téléphone, panneau) : chaque ligne devient une petite fiche — le pari et le moteur en haut, la cote, puis la value. */
@container mvb (max-width: 760px) {
  .mvb__head {
    display: none;
  }

  .mvb__row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'what engine'
      'best best'
      'value value';
    padding: 10px 12px;
  }

  .mvb__what {
    grid-area: what;
  }

  .mvb__engine {
    grid-area: engine;
  }

  .mvb__best {
    grid-area: best;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }

  .mvb__value {
    grid-area: value;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }

  /* La légende de chaque case revient à l'œil quand l'en-tête disparaît — sauf devant une phrase qui dit déjà « pas de cote ». */
  .mvb__best:not(.is-absente) .mvb__cap {
    position: static;
    width: auto;
    height: auto;
    overflow: visible;
    clip: auto;
    flex-basis: 100%;
  }

  .mvb__lecture {
    margin-left: 0;
    flex-basis: 100%;
  }
}
</style>
