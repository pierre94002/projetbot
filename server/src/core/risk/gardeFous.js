/**
 * gardeFous.js — les GARDE-FOUS de Pierre (étape 11 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Deux plafonds, fixés par Pierre dans Réglages, AUCUN par défaut (non réglé
 * = pas de plafond) :
 *   - la MISE MAXIMALE PAR PARI : le conseil de mise du moteur (Kelly
 *     fractionné, `stake`) ne la dépasse jamais — au-delà, il est ramené au
 *     plafond et le dit (`misePlafonnee`) ;
 *   - la PERTE MAXIMALE PAR SEMAINE (lundi → dimanche, jours de Paris) : la
 *     perte nette des paris réglés dans la semaine, plus les mises encore en
 *     attente (de l'argent déjà engagé), ne doit pas la dépasser. Atteinte ou
 *     engagée, elle ENCLENCHE LE COUPE-CIRCUIT EXISTANT (tiltState.js) : le
 *     moteur ne conseille plus aucune mise, partout (une seule décision de
 *     pari, verdictPari.js) ; avant, le conseil est ramené à ce qui reste.
 * Et une alerte quand un plafond est atteint ou qu'une série de pertes sort
 * de sa zone normale (seriesDePertes.js).
 *
 * CE QU'UN GARDE-FOU NE FAIT JAMAIS : refuser l'enregistrement d'un pari
 * (« J'ai parié » enregistre toujours ; il signale), engager de l'argent ou
 * agir sur un compte. Il bloque le CONSEIL et il alerte.
 *
 * Ce fichier est PUR (ni disque, ni base, ni réseau) : les réglages sont lus
 * par data/repositories/gardeFousRepository.js, le carnet par
 * betsRepository.js, et tiltState.js assemble. Les phrases sont en français,
 * pour Pierre ; l'écran (ui/src/utils/gardeFous.js) dit les mêmes, mot pour
 * mot (test « écran = serveur »).
 * -----------------------------------------------------------------------
 */

import { zoneNormaleDesSeries, seriesDuCarnet, probabiliteSerieAuMoins, SEUIL_ZONE_NORMALE } from './seriesDePertes.js';

export const CHAMPS_GARDE_FOUS = Object.freeze(['miseMaxParPari', 'perteMaxParSemaine']);
/** Aucun plafond par défaut : c'est Pierre qui les fixe. */
export const REGLAGE_GARDE_FOUS_DEFAUT = Object.freeze({ miseMaxParPari: null, perteMaxParSemaine: null });
/** Bornes d'un plafond, en euros (au centime). */
export const BORNES_GARDE_FOUS = Object.freeze({
  miseMaxParPari: Object.freeze({ min: 0.5, max: 100000 }),
  perteMaxParSemaine: Object.freeze({ min: 1, max: 1000000 })
});
const LIBELLES_CHAMPS = Object.freeze({ miseMaxParPari: 'mise maximale par pari', perteMaxParSemaine: 'perte maximale par semaine' });

/** Une demande invalide (400) ou un fichier illisible (503). */
export class ErreurGardeFous extends Error {
  constructor(message, statut = 400) {
    super(message);
    this.statut = statut;
  }
}

// ---------------------------------------------------------------- formats

const cents = (x) => Math.round(x * 100) / 100;
/** « 20 € », « 12,50 € » — la même écriture à l'écran (ui/src/utils/gardeFous.js). */
export function euros(x) {
  const v = cents(Number(x));
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}
/** « 05/10/2026 », jour de Paris. */
export function jourDit(iso) {
  const t = Date.parse(iso ?? '');
  if (!Number.isFinite(t)) return 'date inconnue';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(t));
}

// ---------------------------------------------------------------- réglage

/**
 * Un montant de plafond : null (pas de plafond) ou un nombre fini dans ses
 * bornes, arrondi au centime. Un texte, un booléen, 0 ou un négatif sont
 * refusés : un plafond se règle exprès.
 */
function montant(champ, valeur) {
  if (valeur === null) return null;
  const b = BORNES_GARDE_FOUS[champ];
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) {
    throw new ErreurGardeFous(`« ${champ} » (${LIBELLES_CHAMPS[champ]}) : un montant en euros, ou null pour aucun plafond.`);
  }
  if (valeur < b.min || valeur > b.max) {
    throw new ErreurGardeFous(`« ${champ} » (${LIBELLES_CHAMPS[champ]}) : entre ${euros(b.min)} et ${euros(b.max)}, ou null pour aucun plafond.`);
  }
  return cents(valeur);
}

/**
 * Le corps d'un PUT : seuls les champs donnés changent (null = plus de
 * plafond). Un champ inconnu est refusé.
 * @returns {object} les champs donnés, normalisés
 */
export function validerReglageGardeFous(entree) {
  if (!entree || typeof entree !== 'object' || Array.isArray(entree)) {
    throw new ErreurGardeFous('Le réglage des garde-fous est un objet { miseMaxParPari, perteMaxParSemaine } (montants en euros, ou null pour aucun plafond).');
  }
  const inconnus = Object.keys(entree).filter((k) => !CHAMPS_GARDE_FOUS.includes(k));
  if (inconnus.length) throw new ErreurGardeFous(`Champ inconnu : ${inconnus.map((k) => `« ${k} »`).join(', ')}. Les garde-fous sont « miseMaxParPari » et « perteMaxParSemaine ».`);
  const donnes = CHAMPS_GARDE_FOUS.filter((k) => k in entree);
  if (!donnes.length) throw new ErreurGardeFous('Rien à régler : donnez « miseMaxParPari » et/ou « perteMaxParSemaine ».');
  return Object.fromEntries(donnes.map((k) => [k, montant(k, entree[k])]));
}

/** Le réglage tel qu'il est enregistré : chaque champ valide ou absent (= pas de plafond), sinon le fichier est illisible. */
export function reglageLu(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new ErreurGardeFous('forme inattendue (un objet était attendu)', 503);
  const sortie = {};
  for (const champ of CHAMPS_GARDE_FOUS) {
    try {
      sortie[champ] = brut[champ] === undefined ? null : montant(champ, brut[champ]);
    } catch (error) {
      throw new ErreurGardeFous(`valeur illisible pour « ${champ} » (${error.message})`, 503);
    }
  }
  return sortie;
}

// --------------------------------------------------------------- semaine

const JOUR_MS = 86_400_000;
const formatJour = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
const formatHeure = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });
/** « AAAA-MM-JJ » : le jour de Paris d'un instant (ms). */
export const jourParis = (t) => formatJour.format(new Date(t));
/** L'instant (ms) de minuit à Paris, le jour « AAAA-MM-JJ » (les changements d'heure se font la nuit du samedi au dimanche, jamais à minuit). */
function minuitParis(jour) {
  const t = Date.parse(`${jour}T00:00:00Z`);
  return t - Number(formatHeure.format(new Date(t))) * 3_600_000;
}
const ajouterJours = (jour, n) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/** La semaine (lundi → dimanche, jours de Paris) qui contient `maintenant` : ses jours et ses bornes [debut, fin[ en ms. */
export function semaineDeParis(maintenant = Date.now()) {
  const jour = jourParis(maintenant);
  const decalage = (new Date(`${jour}T12:00:00Z`).getUTCDay() + 6) % 7;
  const lundi = ajouterJours(jour, -decalage);
  const lundiSuivant = ajouterJours(lundi, 7);
  return { lundi, dimanche: ajouterJours(lundi, 6), debut: minuitParis(lundi), fin: minuitParis(lundiSuivant) };
}

// ---------------------------------------------------------------- un pari

/** L'instant où un pari a été réglé (à défaut, celui où il a été pris). */
export function instantDeReglement(bet) {
  const t = Date.parse(bet?.settledAt ?? '');
  return Number.isFinite(t) ? t : Date.parse(bet?.createdAt ?? '');
}

/**
 * Le gain RÉEL d'un pari, la règle du carnet (betsStore) : gagné = mise ×
 * cote − mise ; perdu = − mise ; en attente et annulé = rien (null).
 */
export function gainReelDuPari(bet) {
  const mise = Number(bet?.stake);
  if (!(mise > 0)) return null;
  if (bet.status === 'won') return mise * Number(bet.odds) - mise;
  if (bet.status === 'lost') return -mise;
  return null;
}

/**
 * La probabilité qu'un pari GAGNE, pour la zone normale des séries : celle du
 * moteur au moment du pari (pari simple, étape 10), sinon celle que donne la
 * cote prise (1 / cote) — « ce que le hasard donne avec ces cotes ».
 * @returns {{ p: number, source: 'moteur'|'cote' }|null}
 */
export function probabiliteDeGain(bet) {
  const legs = bet?.legs ?? [];
  const p = legs.length === 1 ? legs[0]?.probabiliteMoteur : null;
  if (typeof p === 'number' && p > 0 && p < 1) return { p, source: 'moteur' };
  const cote = Number(bet?.odds);
  return cote > 1 ? { p: 1 / cote, source: 'cote' } : null;
}

/** Les paris réglés (gagnés, perdus), dans l'ordre où ils se sont réglés. Un pari annulé n'interrompt ni ne prolonge une série. */
export function parisReglesDansLOrdre(paris = []) {
  return paris
    .filter((b) => b?.status === 'won' || b?.status === 'lost')
    .map((b) => ({ b, t: instantDeReglement(b), c: Date.parse(b.createdAt ?? '') }))
    .sort((x, y) => (x.t - y.t) || (x.c - y.c) || String(x.b.id).localeCompare(String(y.b.id)))
    .map((x) => x.b);
}

// ---------------------------------------------------------------- séries

/**
 * La série de pertes en cours, la plus longue, et la zone normale que donne
 * le hasard avec ces cotes (seriesDePertes.js).
 */
export function etatDesSeries(paris = [], { seuil = SEUIL_ZONE_NORMALE } = {}) {
  const regles = parisReglesDansLOrdre(paris).map((b) => ({ b, proba: probabiliteDeGain(b) })).filter((x) => x.proba);
  const issues = regles.map((x) => x.b.status);
  const probas = regles.map((x) => x.proba.p);
  const s = seriesDuCarnet(issues);
  const zone = zoneNormaleDesSeries(probas, { seuil });
  const date = (i) => (i === null || i === undefined ? null : (regles[i]?.b.settledAt ?? regles[i]?.b.createdAt ?? null));
  return {
    n: regles.length,
    seuil,
    enCours: s.enCours,
    enCoursDepuis: s.enCours ? date(regles.length - s.enCours) : null,
    plusLongue: s.plusLongue,
    plusLongueDu: date(s.debutPlusLongue),
    plusLongueAu: date(s.finPlusLongue),
    zone: { jusqua: zone.jusqua, mediane: zone.mediane, repartition: zone.repartition },
    probaEnCours: s.enCours ? probabiliteSerieAuMoins(probas, s.enCours) : null,
    probaPlusLongue: s.plusLongue ? probabiliteSerieAuMoins(probas, s.plusLongue) : null,
    horsZone: zone.jusqua !== null && s.enCours > zone.jusqua,
    plusLongueHorsZone: zone.jusqua !== null && s.plusLongue > zone.jusqua,
    sources: { moteur: regles.filter((x) => x.proba.source === 'moteur').length, cote: regles.filter((x) => x.proba.source === 'cote').length }
  };
}

// -------------------------------------------------------------- l'état

/** Ce que dit le coupe-circuit quand un garde-fou l'enclenche (ou l'a enclenché à la main). */
export function texteDuCoupeCircuit(motif, etat = null) {
  const r = etat?.reglage ?? {};
  switch (motif) {
    case 'manuel':
      return 'coupe-circuit manuel de Réglages';
    case 'perte-semaine-atteinte':
      return `perte maximale de la semaine atteinte : ${euros(etat.perteSemaine)} perdus depuis lundi, pour un plafond de ${euros(r.perteMaxParSemaine)}`;
    case 'perte-semaine-engagee':
      return `perte maximale de la semaine engagée : ${euros(etat.perteSemaine)} perdus depuis lundi et ${euros(etat.misesEnAttente)} de mises en attente, pour un plafond de ${euros(r.perteMaxParSemaine)}`;
    case 'carnet-illisible':
      return 'carnet des paris illisible : la perte de la semaine ne peut pas être vérifiée';
    case 'reglage-illisible':
      return 'réglage des garde-fous illisible : les plafonds ne peuvent pas être vérifiés';
    default:
      return 'garde-fou';
  }
}

/**
 * L'état des garde-fous à l'instant `maintenant` : la semaine, sa perte, les
 * mises en attente, ce qui reste avant le plafond, le plafond du conseil de
 * mise, le coupe-circuit (enclenché ou non, pourquoi), les séries et les
 * alertes. `paris` : le carnet (betsRepository.listBets).
 */
export function etatDesGardeFous({ paris = [], reglage = REGLAGE_GARDE_FOUS_DEFAUT, maintenant = Date.now() } = {}) {
  const r = { ...REGLAGE_GARDE_FOUS_DEFAUT, ...reglage };
  const semaine = semaineDeParis(maintenant);
  const dansLaSemaine = (t) => Number.isFinite(t) && t >= semaine.debut && t < semaine.fin;
  const reglesSemaine = paris.filter((b) => (b?.status === 'won' || b?.status === 'lost') && dansLaSemaine(instantDeReglement(b)));
  const gainSemaine = cents(reglesSemaine.reduce((s, b) => s + gainReelDuPari(b), 0));
  const perteSemaine = gainSemaine < 0 ? -gainSemaine : 0;
  const enAttente = paris.filter((b) => b?.status === 'pending');
  const misesEnAttente = cents(enAttente.reduce((s, b) => s + (Number(b.stake) > 0 ? Number(b.stake) : 0), 0));
  const perteMax = r.perteMaxParSemaine;
  const resteSemaine = perteMax === null ? null : cents(perteMax - perteSemaine - misesEnAttente);
  const atteinte = perteMax !== null && perteSemaine >= perteMax;
  const engagee = perteMax !== null && !atteinte && resteSemaine <= 0;
  const motif = atteinte ? 'perte-semaine-atteinte' : engagee ? 'perte-semaine-engagee' : null;

  // Le plafond du conseil de mise : la mise maximale, et ce qui reste avant la perte maximale de la semaine.
  const candidats = [];
  if (r.miseMaxParPari !== null) candidats.push({ montant: r.miseMaxParPari, par: 'mise-max' });
  if (resteSemaine !== null && resteSemaine > 0) candidats.push({ montant: resteSemaine, par: 'perte-semaine' });
  const plafondDeMise = motif ? null : candidats.reduce((m, c) => (!m || c.montant < m.montant ? c : m), null);

  // Les paris PRIS cette semaine au-delà de la mise maximale (signalés, jamais refusés).
  const prisSemaine = paris.filter((b) => dansLaSemaine(Date.parse(b?.createdAt ?? '')));
  const auDelaDeLaMiseMax = r.miseMaxParPari === null ? [] : prisSemaine.filter((b) => Number(b.stake) > r.miseMaxParPari);

  const series = etatDesSeries(paris);
  const etat = {
    reglage: r,
    semaine: { du: semaine.lundi, au: semaine.dimanche, debut: new Date(semaine.debut).toISOString(), fin: new Date(semaine.fin).toISOString() },
    gainSemaine,
    perteSemaine,
    parisReglesSemaine: reglesSemaine.length,
    misesEnAttente,
    parisEnAttente: enAttente.length,
    resteSemaine,
    plafondDeMise,
    bloque: Boolean(motif),
    motif,
    parisAuDelaDeLaMiseMax: auDelaDeLaMiseMax.map((b) => b.id),
    series,
    alertes: []
  };
  if (motif) {
    etat.alertes.push({
      code: motif,
      niveau: atteinte ? 'danger' : 'warning',
      texte: atteinte
        ? `Perte maximale de la semaine atteinte : ${euros(perteSemaine)} perdus depuis lundi, pour un plafond de ${euros(perteMax)}. Le moteur ne conseille plus de mise jusqu'à lundi prochain ; vos paris s'enregistrent toujours.`
        : `Perte maximale de la semaine engagée : ${euros(perteSemaine)} perdus depuis lundi et ${euros(misesEnAttente)} de mises en attente, pour un plafond de ${euros(perteMax)}. Le moteur ne conseille plus de mise tant que ces paris ne sont pas réglés ; vos paris s'enregistrent toujours.`
    });
  }
  if (auDelaDeLaMiseMax.length) {
    const n = auDelaDeLaMiseMax.length;
    etat.alertes.push({
      code: 'mise-max-depassee',
      niveau: 'warning',
      texte: `${n} pari${n > 1 ? 's' : ''} de la semaine au-delà de votre mise maximale par pari (${euros(r.miseMaxParPari)}) : ${n > 1 ? 'enregistrés' : 'enregistré'} quand même, à regarder.`
    });
  }
  if (series.horsZone) {
    etat.alertes.push({
      code: 'serie-hors-zone',
      niveau: 'warning',
      texte: `Série de ${series.enCours} pertes d'affilée : au-delà de la zone normale (jusqu'à ${series.zone.jusqua} sur vos ${series.n} paris réglés, ${Math.round(SEUIL_ZONE_NORMALE * 100)} fois sur 100 avec ces cotes). Un signal à regarder, pas une preuve : vous pouvez enclencher le coupe-circuit dans Réglages.`
    });
  }
  return etat;
}

// ---------------------------------------------------------- le conseil

/**
 * Le conseil de mise du moteur passé aux garde-fous (appelé par
 * verdictPari.stakingDuMatch, la seule décision de pari) :
 *   - coupe-circuit enclenché : la décision garde CIRCUIT_BREAKER_ACTIVE et
 *     dit pourquoi (`coupeCircuit`) ;
 *   - pari conseillé : la mise ne dépasse jamais le plafond du moment ; au-delà,
 *     elle y est ramenée et la décision le dit (`misePlafonnee`).
 * Un `tiltState` sans garde-fou (`{}`, `{ circuitBreakerActive: true }`) ne
 * change rien.
 */
export function plafonnerLeConseil(staking, tiltState) {
  if (!staking || typeof staking !== 'object') return staking;
  if (staking.action === 'CIRCUIT_BREAKER_ACTIVE') {
    return tiltState?.coupeCircuit ? { ...staking, coupeCircuit: tiltState.coupeCircuit } : staking;
  }
  const plafond = tiltState?.plafondDeMise ?? null;
  if (staking.action !== 'RECOMMENDED' || !plafond || !Number.isFinite(plafond.montant) || !Number.isFinite(staking.stake)) return staking;
  if (staking.stake <= plafond.montant) return staking;
  const pourquoi = plafond.par === 'mise-max' ? 'votre mise maximale par pari' : "ce qui reste avant votre perte maximale de la semaine (mises en attente comprises)";
  return {
    ...staking,
    stake: cents(plafond.montant),
    misePlafonnee: {
      mise: staking.stake,
      plafond: cents(plafond.montant),
      par: plafond.par,
      texte: `Mise conseillée ramenée à ${euros(plafond.montant)} : ${pourquoi}, fixée dans Réglages. Le moteur conseillait ${euros(staking.stake)}.`
    }
  };
}

// ------------------------------------------------- un pari face aux garde-fous

/** Les états d'un compte bookmaker (fiche de Réglages). */
export const LIMITATIONS = Object.freeze({ aucune: 'Aucune limitation connue', limite: 'Compte limité (mises réduites)', ferme: 'Compte fermé' });

/**
 * Ce qu'il faut SIGNALER d'un pari (ou d'un ticket avant « J'ai parié ») :
 * au-delà de la mise maximale, de la mise acceptée connue chez ce bookmaker,
 * de son solde déclaré, un compte limité ou fermé, la perte de la semaine
 * atteinte. Jamais un refus : la liste se montre, le pari s'enregistre.
 * @param {object} p
 * @param {number} p.mise
 * @param {string|null} p.bookmaker      clé (williamhill…)
 * @param {string|null} p.bookmakerTitle
 * @param {object} p.reglage             { miseMaxParPari, perteMaxParSemaine }
 * @param {object|null} p.compte         la fiche du bookmaker { soldeDeclare, miseMaxAcceptee, limitation, majLe }
 * @param {object|null} p.etat           { bloque, motif } de etatDesGardeFous
 * @returns {{ code: string, niveau: 'danger'|'warning', texte: string }[]}
 */
export function alertesDuPari({ mise, bookmaker = null, bookmakerTitle = null, reglage = REGLAGE_GARDE_FOUS_DEFAUT, compte = null, etat = null } = {}) {
  const alertes = [];
  const m = Number(mise);
  const chez = bookmakerTitle ?? bookmaker ?? 'ce bookmaker';
  const fiche = compte?.majLe ? ` (fiche du ${jourDit(compte.majLe)})` : '';
  if (Number.isFinite(m) && m > 0 && reglage?.miseMaxParPari !== null && reglage?.miseMaxParPari !== undefined && m > reglage.miseMaxParPari) {
    alertes.push({ code: 'mise-max-depassee', niveau: 'warning', texte: `Mise de ${euros(m)} au-delà de votre mise maximale par pari (${euros(reglage.miseMaxParPari)}, Réglages). Le pari s'enregistre quand même.` });
  }
  if (compte && bookmaker) {
    if (compte.limitation === 'ferme') {
      alertes.push({ code: 'compte-ferme', niveau: 'danger', texte: `Compte ${chez} noté fermé${fiche}. Le pari s'enregistre quand même.` });
    }
    if (Number.isFinite(compte.miseMaxAcceptee) && Number.isFinite(m) && m > compte.miseMaxAcceptee) {
      alertes.push({ code: 'mise-acceptee-depassee', niveau: 'warning', texte: `Mise de ${euros(m)} au-delà de la mise acceptée connue chez ${chez} : ${euros(compte.miseMaxAcceptee)}${fiche}.` });
    } else if (compte.limitation === 'limite' && !Number.isFinite(compte.miseMaxAcceptee)) {
      alertes.push({ code: 'compte-limite', niveau: 'warning', texte: `Compte ${chez} noté limité${fiche} : la mise acceptée peut être réduite.` });
    }
    if (Number.isFinite(compte.soldeDeclare) && Number.isFinite(m) && m > compte.soldeDeclare) {
      alertes.push({ code: 'solde-depasse', niveau: 'warning', texte: `Mise de ${euros(m)} au-delà du solde déclaré chez ${chez} : ${euros(compte.soldeDeclare)}${fiche}.` });
    }
  }
  if (etat?.bloque) {
    alertes.push({
      code: etat.motif ?? 'perte-semaine-atteinte',
      niveau: etat.motif === 'perte-semaine-engagee' ? 'warning' : 'danger',
      texte: `${etat.motif === 'perte-semaine-engagee' ? 'Perte maximale de la semaine engagée' : 'Perte maximale de la semaine atteinte'} : le moteur ne conseille plus de mise. Le pari s'enregistre quand même.`
    });
  }
  return alertes;
}
