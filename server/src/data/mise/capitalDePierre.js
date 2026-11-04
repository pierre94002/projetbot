/**
 * capitalDePierre.js — LE CAPITAL DE PIERRE (étape 39 « La mise juste », lot 1a, 04/11/2026).
 * -----------------------------------------------------------------------
 * data/runtime/capital.json : { montant, le, suitLeCarnet, plancher, devise: 'EUR', regleA, majLe } — l'argent réservé aux
 * paris, tapé par Pierre dans Réglages › Gestion du risque, le jour où il vaut ce montant, s'il suit ses paris enregistrés, et
 * son plancher facultatif (« jamais plus bas que X € sous mon plus haut » : vide = rien). Écrit par l'appli seule, par
 * utils/atomicJson.js (readJsonFile / writeJsonAtomic SEULEMENT) ; JAMAIS dans garde-fous.json (core/risk/gardeFous.js
 * refuse tout champ inconnu), jamais un mot de passe ni un numéro de compte (refusés, comme les fiches de compte).
 * Absent : « Capital non indiqué » — la mise se dit en part du capital, aucun euro nulle part, ticket non pré-rempli.
 *
 * LE CAPITAL DU MOMENT (E11) : C_t = C_0 + les gains nets des paris RÉGLÉS depuis le départ du suivi (annulé = 0 ; les
 * mises EN ATTENTE n'y entrent pas : elles vivent dans les plafonds et les paris liés). Le départ du suivi : l'INSTANT du
 * réglage quand `le` est le jour du réglage (un gain du matin, déjà dans le montant tapé, n'est jamais compté deux fois),
 * sinon minuit (Paris) du jour `le` (décision 7 e de l'orchestrateur). `suitLeCarnet: false` : C_t = C_0 (« fixe »). Le
 * carnet a une date de règlement pour chaque pari réglé (vérifié le 04/11) : `instantDeReglement` de gardeFous.js.
 *
 * BASE_INTERNE_SANS_CAPITAL : findValueBet (gelé) a besoin d'un nombre pour écrire sa mise ; sans capital, les contrôleurs
 * lui passent cette base de calcul interne, JAMAIS affichée — la mise sortie de l'API sans capital n'a pas d'euros.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { listBets } from '../repositories/betsRepository.js';
import { gainReelDuPari, instantDeReglement, parisReglesDansLOrdre, jourParis } from '../../core/risk/gardeFous.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FICHIER = path.resolve(__dirname, '../../../data/runtime/capital.json');

/** La base de calcul interne du moteur quand Pierre n'a pas réglé son capital : jamais affichée, jamais un « capital ». */
export const BASE_INTERNE_SANS_CAPITAL = 10000;
export const fichierCapital = () => FICHIER;
/** Les seuls champs d'un réglage du capital. */
export const CHAMPS_CAPITAL = Object.freeze(['montant', 'le', 'suitLeCarnet', 'plancher']);
/** Bornes, en euros (au centime). */
export const BORNES_CAPITAL = Object.freeze({ montant: Object.freeze({ min: 1, max: 1_000_000 }), plancher: Object.freeze({ min: 1, max: 1_000_000 }) });
/** Ce qui ressemble à un secret (mot de passe, identifiant, numéro de compte, carte) : refusé avec une phrase qui le dit. */
const RESSEMBLE_A_UN_SECRET = /pass|mdp|mot.?de.?passe|login|identifiant|utilisateur|user|e-?mail|courriel|token|jeton|secret|pin\b|code|iban|bic\b|rib\b|num[eé]ro|compte|carte|card|account|cvv/i;

/** Une demande invalide (400) ou un fichier illisible (503). */
export class ErreurCapital extends Error {
  constructor(message, statut = 400) {
    super(message);
    this.statut = statut;
  }
}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const cents = (x) => Math.round(x * 100) / 100;
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const formatHeure = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });
/** L'instant (ms) de minuit à Paris le jour « AAAA-MM-JJ » (la règle de gardeFous.js : jamais de changement d'heure à minuit). */
export function minuitParis(jour) {
  const t = Date.parse(`${jour}T00:00:00Z`);
  return t - Number(formatHeure.format(new Date(t))) * 3_600_000;
}
const jourValide = (j) => typeof j === 'string' && JOUR.test(j) && new Date(`${j}T12:00:00Z`).toISOString().slice(0, 10) === j;

function montantDe(champ, valeur, { nullPermis = false } = {}) {
  if (valeur === null && nullPermis) return null;
  const b = BORNES_CAPITAL[champ];
  if (!fini(valeur) || valeur < b.min || valeur > b.max) {
    throw new ErreurCapital(`« ${champ} » : un montant en euros de ${b.min.toLocaleString('fr-FR')} à ${b.max.toLocaleString('fr-FR')}${nullPermis ? ', ou null pour aucun' : ''}.`);
  }
  return cents(valeur);
}

/**
 * Le corps d'un PUT : { montant?, le?, suitLeCarnet?, plancher? } — seuls les champs donnés changent. Un champ inconnu est
 * refusé ; un champ qui ressemble à un secret aussi, avec une phrase qui le dit.
 * @returns {object} les champs donnés, normalisés
 */
export function validerCapital(entree, { maintenant = Date.now() } = {}) {
  if (!entree || typeof entree !== 'object' || Array.isArray(entree)) {
    throw new ErreurCapital('Le capital est un objet { montant, le, suitLeCarnet, plancher } (montant en euros, date AAAA-MM-JJ, oui / non, plancher en euros ou null).');
  }
  const inconnus = Object.keys(entree).filter((k) => !CHAMPS_CAPITAL.includes(k));
  if (inconnus.some((k) => RESSEMBLE_A_UN_SECRET.test(k))) {
    throw new ErreurCapital(
      `Refusé : ${inconnus.map((k) => `« ${k} »`).join(', ')}. Le capital ne garde JAMAIS de mot de passe, d'identifiant ni de numéro de compte — seulement le montant, sa date, « suit mes paris » et le plancher.`
    );
  }
  if (inconnus.length) throw new ErreurCapital(`Champ inconnu : ${inconnus.map((k) => `« ${k} »`).join(', ')}. Le capital n'a que « montant », « le », « suitLeCarnet » et « plancher ».`);
  const donnes = CHAMPS_CAPITAL.filter((k) => k in entree);
  if (!donnes.length) throw new ErreurCapital('Rien à régler : donnez au moins « montant ».');
  const sortie = {};
  if ('montant' in entree) sortie.montant = montantDe('montant', entree.montant);
  if ('le' in entree) {
    const aujourdHui = jourParis(maintenant);
    if (!jourValide(entree.le) || entree.le > aujourdHui) throw new ErreurCapital(`« le » : une date AAAA-MM-JJ, au plus tard aujourd'hui (${aujourdHui}).`);
    sortie.le = entree.le;
  }
  if ('suitLeCarnet' in entree) {
    if (typeof entree.suitLeCarnet !== 'boolean') throw new ErreurCapital('« suitLeCarnet » : vrai (le capital suit vos paris enregistrés) ou faux (capital fixe).');
    sortie.suitLeCarnet = entree.suitLeCarnet;
  }
  if ('plancher' in entree) sortie.plancher = montantDe('plancher', entree.plancher, { nullPermis: true });
  return sortie;
}

/** Le réglage tel qu'il est enregistré (validé), ou null (« non indiqué ») ; sinon le fichier est illisible (503). */
export function capitalLu(brut) {
  if (brut === null || brut === undefined) return null;
  if (typeof brut !== 'object' || Array.isArray(brut)) throw new ErreurCapital('forme inattendue (un objet était attendu)', 503);
  if (brut.montant === null || brut.montant === undefined) return null;
  try {
    const montant = montantDe('montant', brut.montant);
    if (!jourValide(brut.le)) throw new ErreurCapital('« le » illisible');
    const plancher = brut.plancher === undefined ? null : montantDe('plancher', brut.plancher, { nullPermis: true });
    return {
      montant,
      le: brut.le,
      suitLeCarnet: brut.suitLeCarnet !== false,
      plancher,
      devise: 'EUR',
      regleA: typeof brut.regleA === 'string' && Number.isFinite(Date.parse(brut.regleA)) ? brut.regleA : null,
      majLe: typeof brut.majLe === 'string' && Number.isFinite(Date.parse(brut.majLe)) ? brut.majLe : null
    };
  } catch (error) {
    throw new ErreurCapital(`valeur illisible (${error.message})`, 503);
  }
}

/**
 * Le réglage du capital.
 * @returns {{ reglage: object|null, source: 'defaut'|'enregistre', fichier: string, bornes: object }}
 * @throws {ErreurCapital} (503) fichier présent mais illisible — jamais pris pour « non indiqué »
 */
export function lireCapital() {
  let brut;
  try {
    brut = readJsonFile(FICHIER, null);
  } catch (error) {
    throw new ErreurCapital(`Capital illisible (${FICHIER}) : ${error.message}`, 503);
  }
  try {
    const reglage = capitalLu(brut);
    return { reglage, source: reglage ? 'enregistre' : 'defaut', fichier: FICHIER, bornes: BORNES_CAPITAL };
  } catch (error) {
    throw new ErreurCapital(`Capital illisible (${FICHIER}) : ${error.message} — rien n'est écrit tant qu'il ne l'est pas.`, 503);
  }
}

/**
 * Enregistre les champs donnés ; les autres restent. Sans capital réglé, `montant` est exigé ; `le` vaut alors le jour
 * (Paris) et `suitLeCarnet` vrai (la recommandation retenue par Pierre). Un changement de montant ou de date note
 * l'instant du réglage (`regleA`, le départ du suivi le jour même). Même réglage : rien n'est écrit (idempotent).
 * @returns {{ reglage, source, fichier, bornes, ecrit: boolean }}
 */
export function enregistrerCapital(changement, { maintenant = Date.now() } = {}) {
  const valide = validerCapital(changement, { maintenant });
  const actuel = lireCapital();
  if (!actuel.reglage && !('montant' in valide)) throw new ErreurCapital('Aucun capital réglé : donnez d’abord « montant ».');
  const base = actuel.reglage ?? { montant: null, le: null, suitLeCarnet: true, plancher: null, regleA: null };
  const suivant = {
    montant: valide.montant ?? base.montant,
    le: valide.le ?? (('montant' in valide && valide.montant !== base.montant) || !base.le ? jourParis(maintenant) : base.le),
    suitLeCarnet: valide.suitLeCarnet ?? base.suitLeCarnet,
    plancher: 'plancher' in valide ? valide.plancher : base.plancher
  };
  const memes = actuel.reglage && CHAMPS_CAPITAL.every((k) => suivant[k] === actuel.reglage[k]);
  if (memes) return { ...actuel, ecrit: false };
  const instant = new Date(maintenant).toISOString();
  const regleA = suivant.montant !== base.montant || suivant.le !== base.le ? instant : (base.regleA ?? instant);
  const ecrit = { montant: suivant.montant, le: suivant.le, suitLeCarnet: suivant.suitLeCarnet, plancher: suivant.plancher, devise: 'EUR', regleA, majLe: instant };
  writeJsonAtomic(FICHIER, ecrit);
  return { reglage: capitalLu(ecrit), source: 'enregistre', fichier: FICHIER, bornes: BORNES_CAPITAL, ecrit: true };
}

/** Retire le capital (« Capital non indiqué ») ; déjà absent : rien n'est écrit. */
export function retirerCapital({ maintenant = Date.now() } = {}) {
  const actuel = lireCapital();
  if (!actuel.reglage) return { ...actuel, ecrit: false };
  writeJsonAtomic(FICHIER, { montant: null, retireLe: new Date(maintenant).toISOString() });
  return { reglage: null, source: 'defaut', fichier: FICHIER, bornes: BORNES_CAPITAL, ecrit: true };
}

/** Le départ du suivi (ms) : l'instant du réglage s'il est du jour `le` (Paris), sinon minuit (Paris) de `le`. */
export function departDuSuivi(reglage) {
  const t = Date.parse(reglage?.regleA ?? '');
  if (Number.isFinite(t) && jourParis(t) === reglage.le) return t;
  return minuitParis(reglage.le);
}

/**
 * LE CAPITAL DU MOMENT (pur : le réglage, le carnet et l'instant sont passés). Les paris réglés dans l'ordre de leur
 * règlement (gardeFous.parisReglesDansLOrdre), leur gain réel (gainReelDuPari : annulé = rien) ; le plus haut atteint
 * depuis le départ (pour le plancher).
 * @returns {{ indique, montant, c0, le, depuis, suitLeCarnet, gainsDepuis, enAttente, plusHaut, plancher, raison }}
 */
export function capitalDuMoment({ reglage = null, paris = [], maintenant = Date.now() } = {}) {
  const enAttente = Array.isArray(paris) ? cents(paris.filter((b) => b?.status === 'pending').reduce((s, b) => s + (Number(b.stake) > 0 ? Number(b.stake) : 0), 0)) : null;
  if (!reglage) {
    return { indique: false, montant: null, c0: null, le: null, depuis: null, suitLeCarnet: null, gainsDepuis: null, enAttente: null, plusHaut: null, plancher: null, raison: 'non-indique' };
  }
  const depuis = departDuSuivi(reglage);
  let c = reglage.montant;
  let plusHaut = c;
  if (reglage.suitLeCarnet) {
    for (const b of parisReglesDansLOrdre(paris ?? [])) {
      const t = instantDeReglement(b);
      if (!Number.isFinite(t) || t < depuis || t > maintenant) continue;
      c += gainReelDuPari(b) ?? 0;
      if (c > plusHaut) plusHaut = c;
    }
  }
  const montant = cents(c);
  return {
    indique: true,
    montant,
    c0: reglage.montant,
    le: reglage.le,
    depuis: new Date(depuis).toISOString(),
    suitLeCarnet: reglage.suitLeCarnet,
    gainsDepuis: reglage.suitLeCarnet ? cents(montant - reglage.montant) : null,
    enAttente,
    plusHaut: cents(plusHaut),
    plancher: reglage.plancher ?? null,
    raison: null
  };
}

/**
 * Le capital du moment, LU (le réglage, puis le carnet par listBets, sauf si l'appelant l'a déjà lu : `paris`, null =
 * illisible). Ne lève jamais : un capital illisible, ou un carnet illisible quand le capital le suit, rend « non indiqué »
 * avec la raison — AUCUN euro (la règle la plus prudente).
 */
export function capitalDuMomentLu({ maintenant = Date.now(), paris: dejaLus } = {}) {
  let reglage;
  try {
    reglage = lireCapital().reglage;
  } catch (error) {
    return { ...capitalDuMoment({ reglage: null }), raison: 'capital-illisible', probleme: error.message };
  }
  if (!reglage) return capitalDuMoment({ reglage: null });
  let paris = dejaLus;
  let probleme = dejaLus === null ? 'carnet illisible' : null;
  if (dejaLus === undefined) {
    try {
      paris = listBets();
    } catch (error) {
      paris = null;
      probleme = error.message;
    }
  }
  if (paris === null) {
    if (reglage.suitLeCarnet) return { ...capitalDuMoment({ reglage: null }), raison: 'carnet-illisible', probleme };
    return { ...capitalDuMoment({ reglage, paris: [], maintenant }), enAttente: null };
  }
  return capitalDuMoment({ reglage, paris, maintenant });
}

/** La base de calcul passée au moteur : le capital du moment s'il est indiqué, sinon la base interne (jamais affichée). */
export function baseDeCalcul(c) {
  return c?.indique && fini(c.montant) ? Math.max(0, c.montant) : BASE_INTERNE_SANS_CAPITAL;
}

/** Ce que l'API dit du capital (jamais une donnée d'un pari précis : des sommes seulement). */
export function vueDuCapital(c) {
  if (!c?.indique) return { indique: false, montant: null, raison: c?.raison ?? 'non-indique' };
  return {
    indique: true,
    montant: c.montant,
    c0: c.c0,
    le: c.le,
    depuis: c.depuis,
    suitLeCarnet: c.suitLeCarnet,
    gainsDepuis: c.gainsDepuis,
    enAttente: c.enAttente,
    plusHaut: c.plusHaut,
    plancher: c.plancher
  };
}
