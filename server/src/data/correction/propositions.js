/**
 * propositions.js — DU TRI DU MOIS AUX CORRECTIONS PROPOSÉES (étape 26 du plan, partie B, 28/10/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge (`maintenant` est passé), ni hasard. Trois portes, une seule forme :
 *   - proposerPourLeTri   les règles écrites d'avance (regles.js) sur les cases du DERNIER tri : UNE proposition
 *                         par réglage et par mois, jamais un réglage déjà ouvert, refusé, rejeté ou retiré depuis
 *                         moins de 6 mois, jamais sur une famille en essai ; un défaut sans réglage est noté
 *                         « demande du code » ;
 *   - propositionDePierre le formulaire de Pierre (les mêmes réglages, ses bornes) — FERMÉ pendant l'essai du
 *                         modèle de buts de l'étape 27 (décision 8 de l'orchestrateur) ;
 *   - declarationDe       la déclaration qu'ira chercher l'essai à blanc (forme de CANDIDATE_EN_ESSAI,
 *                         engineVersions.js) : l'objet `modeleDeButs` ENTIER des réglages en service, une seule
 *                         sous-clé changée, les quatre familles de buts déclarées et le témoin du score.
 * COPIE PROFONDE, TOUJOURS (constat 4 de la critique) : lireReglagesDuMoteur() rend l'objet du cache que le moteur
 * calcule avec ; changer une sous-clé de cet objet changerait les chiffres de Pierre sans aucun clic. Ici, chaque
 * réglage reçu est recopié avant d'être lu ; rien de reçu n'est jamais modifié (prouvé par empreinte, B43).
 * Les leviers sont des sous-clés du modèle de buts SEULEMENT (décision 5 : ni defaultCorrelation ni
 * homeAdvantage). Le retrait par « proposition inverse » est REPORTÉ (décisions) : une correction adoptée se retire
 * par le retour arrière de Réglages tant qu'elle est la dernière version ; sinon, plus tard, par un nouvel essai.
 * -----------------------------------------------------------------------
 */

import {
  LEVIERS,
  LEVIERS_RETIRES,
  REGLAGES_DE_PARI,
  REGLES_DE_PROPOSITION,
  MARCHES_DU_MODELE_DE_BUTS,
  TEMOINS_DU_MODELE_DE_BUTS,
  HORIZON_DES_CORRECTIONS,
  ATTENTE_AVANT_DE_REPROPOSER_MOIS,
  familleDe,
  lireLaCase
} from './regles.js';
import { LIBELLES_REGLAGES, validerCandidate } from '../../core/engine/engineVersions.js';

/** Une proposition refusée (formulaire de Pierre) : `raison` (un code court), un statut HTTP ; rien n'est écrit. */
export class PropositionRefusee extends Error {
  constructor(raison, message, statut = 400) {
    super(message);
    this.raison = raison;
    this.statut = statut;
  }
}

/** Les états d'une proposition ENCORE OUVERTE : un réglage n'en a jamais deux. */
export const ETATS_OUVERTS = Object.freeze(['proposee', 'au-banc', 'bancee', 'banc-impossible', 'acceptee', 'a-blanc', 'jugee']);
/** Les états qui empêchent les règles de reproposer le même réglage pendant ATTENTE_AVANT_DE_REPROPOSER_MOIS. */
export const ETATS_QUI_FONT_ATTENDRE = Object.freeze(['refusee', 'rejetee', 'retiree']);
/** La phrase dite partout où le retrait par « proposition inverse » manque (reporté, décisions de l'orchestrateur). */
export const RETRAIT_PLUS_TARD = 'si la correction n’est plus la dernière version, le retrait passera par un nouvel essai (plus tard)';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texte = (v) => typeof v === 'string' && v.trim() !== '';
/** La copie profonde (les réglages sont du JSON) : jamais l'objet reçu. */
export const copieProfonde = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// ============================================================ les mots (nombres à la française, vrai signe moins)

const NOMS_DES_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOINS = '−';
const fr = (x, d) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
/** Un nombre à la française, `d` décimales, le vrai signe moins : −0,05. */
export function nombreDit(x, d = 0) {
  if (!fini(x)) return '?';
  const r = Number(x.toFixed(d));
  return `${r < 0 ? MOINS : ''}${fr(Math.abs(r), d)}`;
}
/** « de décembre 2026 », « d’octobre 2026 » : l'élision devant une voyelle (avril, août, octobre). */
export const deMois = (mois) => {
  const m = moisDit(mois);
  return /^[aeiouyéèêàâîïôû]/i.test(m) ? `d’${m}` : `de ${m}`;
};
/** Des points de probabilité (0,031 → « 3,1 points »). */
export const pointsDits = (ecart) => `${nombreDit(Math.abs(ecart * 100), 1)} point${Math.abs(ecart * 100) >= 2 ? 's' : ''}`;
/** « décembre 2026 ». */
export const moisDit = (mois) => (/^\d{4}-\d{2}$/.test(mois ?? '') ? `${NOMS_DES_MOIS[Number(mois.slice(5, 7)) - 1]} ${mois.slice(0, 4)}` : String(mois));
const FORMAT_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const parties = (instant) => {
  const t = typeof instant === 'number' ? instant : Date.parse(instant ?? '');
  return Number.isFinite(t) ? Object.fromEntries(FORMAT_PARIS.formatToParts(new Date(t)).map((p) => [p.type, p.value])) : null;
};
/** « 14/11/2026 », le jour de Paris d'un instant. */
export function jourDit(instant) {
  const p = parties(instant);
  return p ? `${p.day}/${p.month}/${p.year}` : 'date inconnue';
}
/** « 01/02/2027 à 07 h 12 », heure de Paris. */
export function quandDit(instant) {
  const p = parties(instant);
  return p ? `${p.day}/${p.month}/${p.year} à ${p.hour} h ${p.minute}` : 'date inconnue';
}
/** Le jour de Paris AAAAMMJJ (l'identifiant d'une proposition de Pierre). */
const jourCompact = (instant) => {
  const p = parties(instant);
  return p ? `${p.year}${p.month}${p.day}` : '00000000';
};

// ============================================================ les leviers

/** Le chemin d'un levier sous `modeleDeButs` : « modeleDeButs.melange.sans.wT » → ['melange', 'sans', 'wT']. */
const cheminDuLevier = (cle) => String(cle).split('.').slice(1);

/** La valeur d'un levier dans un objet `modeleDeButs` (undefined si absente). Lecture seule. */
export function valeurDuLevier(modeleDeButs, cle) {
  let x = modeleDeButs;
  for (const k of cheminDuLevier(cle)) {
    if (!objetSimple(x)) return undefined;
    x = x[k];
  }
  return x;
}

/** Un objet `modeleDeButs` NEUF (copie profonde) où seul le levier `cle` vaut `valeur`. */
export function avecLeLevier(modeleDeButs, cle, valeur) {
  const neuf = copieProfonde(modeleDeButs);
  const chemin = cheminDuLevier(cle);
  let x = neuf;
  for (const k of chemin.slice(0, -1)) {
    if (!objetSimple(x[k])) x[k] = {};
    x = x[k];
  }
  x[chemin.at(-1)] = valeur;
  return neuf;
}

/** Le nom d'un levier pour Pierre (celui de Réglages › Versions du moteur). */
export const libelleDuLevier = (cle) => (LIBELLES_REGLAGES[cle]?.libelle ?? String(cle)).replace(/^Modèle de buts : /, '').replace(/ [(]rho[)]$/, '');
/** La valeur d'un levier écrite comme à l'écran (« 55 % », « −0,05 », « 12 »). */
export function valeurDite(cle, v) {
  if (!fini(v)) return String(v);
  if (LIBELLES_REGLAGES[cle]?.format === 'pourcent') return `${nombreDit(v * 100, Number.isInteger(Math.round(v * 1000) / 10) ? 0 : 1)} %`;
  const l = LEVIERS[cle];
  const d = l && l.pas < 1 ? Math.max(0, Math.ceil(-Math.log10(l.pas) - 1e-9)) : 0;
  return nombreDit(v, d);
}

/** Les familles qu'un levier change (déclarées avec sa candidate : vérifié par T-PR3) et son témoin. */
export const marchesDuLevier = () => [...MARCHES_DU_MODELE_DE_BUTS];
export const temoinsDuLevier = () => [...TEMOINS_DU_MODELE_DE_BUTS];

const arrondi = (x, d) => Number(x.toFixed(d));

/**
 * La VALEUR PROPOSÉE par une règle (regles.js, REGLES_DE_PROPOSITION) depuis la valeur en service `avant` et le sens
 * du levier (« monter » / « descendre ») ; null quand la règle ne peut rien proposer (borne atteinte, même valeur).
 *   rho      : ± 0,03 (monter = +), borné strictement à ]−0,3 ; 0,3[ (au plus 0,29 en valeur absolue) ;
 *   prior    : monter = × 1,5, descendre = ÷ 1,5, un entier de [0 ; 40] ;
 *   wT sans  : ÷ 2, au centième (« plus près du marché »).
 */
export function valeurProposee(cle, avant, sens) {
  if (!fini(avant)) return null;
  let apres = null;
  if (cle === REGLES_DE_PROPOSITION.rho.cle) {
    const r = REGLES_DE_PROPOSITION.rho;
    const signe = sens === 'monter' ? 1 : -1;
    const plafond = arrondi(r.borne - 0.01, 2);
    apres = Math.min(plafond, Math.max(-plafond, arrondi(avant + signe * r.pas, 2)));
  } else if (cle === REGLES_DE_PROPOSITION.prior.cle) {
    const f = REGLES_DE_PROPOSITION.prior.facteur;
    const l = LEVIERS[cle];
    apres = Math.min(l.max, Math.max(l.min, Math.round(sens === 'monter' ? avant * f : avant / f)));
  } else if (cle === REGLES_DE_PROPOSITION.wT.cle) {
    apres = arrondi(avant * REGLES_DE_PROPOSITION.wT.facteur, 2);
  }
  if (apres === null || !fini(apres) || apres === avant) return null;
  return apres;
}

/** Une valeur du formulaire est-elle permise pour ce levier (bornes, ouvertes pour rho, et le pas) ? Rend la raison du refus, ou null. */
export function problemeDeValeur(cle, valeur) {
  const l = LEVIERS[cle];
  if (!l) return 'réglage inconnu';
  if (!fini(valeur)) return 'la valeur n’est pas un nombre';
  const dedans = l.ouvertes ? valeur > l.min && valeur < l.max : valeur >= l.min && valeur <= l.max;
  const crochets = l.ouvertes ? `strictement entre ${valeurDite(cle, l.min)} et ${valeurDite(cle, l.max)}` : `de ${valeurDite(cle, l.min)} à ${valeurDite(cle, l.max)}`;
  if (!dedans) return `la valeur doit être ${crochets}`;
  const pas = (valeur - l.min) / l.pas;
  if (Math.abs(pas - Math.round(pas)) > 1e-6) return `la valeur va par pas de ${valeurDite(cle, l.pas)} (${crochets})`;
  return null;
}

// ============================================================ l'identifiant

/**
 * L'IDENTIFIANT d'une proposition, court et stable (celui que validerCandidate accepte, /^[a-z0-9][a-z0-9._-]{1,60}$/i) :
 * `c26-<AAAA-MM>-<levier court>-<n>` pour une règle (le mois trié), `c26-p<AAAAMMJJ>-<levier court>-<n>` pour Pierre
 * (le jour de Paris). `n` : le premier numéro libre parmi `existants` (les identifiants déjà pris).
 */
export function idDeProposition({ source, levier, mois = null, maintenant = Date.now(), existants = [] }) {
  const court = LEVIERS[levier]?.court;
  if (!court) throw new PropositionRefusee('levier-inconnu', `Réglage inconnu : « ${String(levier)} ».`);
  const prefixe = source === 'regle' ? `c26-${mois}-${court}-` : `c26-p${jourCompact(maintenant)}-${court}-`;
  const pris = new Set(existants);
  let n = 1;
  while (pris.has(`${prefixe}${n}`)) n++;
  return `${prefixe}${n}`;
}

// ============================================================ la déclaration

/**
 * LA DÉCLARATION d'une correction (forme de CANDIDATE_EN_ESSAI), construite sur une COPIE PROFONDE des réglages en
 * service : l'objet `modeleDeButs` ENTIER (configDeLaCandidate fusionne au premier niveau seulement : une sous-clé
 * seule effacerait les autres), une seule sous-clé changée ; les quatre familles de buts ; le témoin du score ;
 * l'horizon de la 27 (800 matchs, 21 jours) ; `vues` = la fenêtre du tri qui l'a fait naître (aucune pour Pierre).
 * Lève PropositionRefusee si le modèle de buts n'est pas en service ou si le levier n'y est pas.
 */
export function declarationDe({ id, levier, apres, reglagesEnService, quoi, enMots, vues = [] }) {
  const reglages = copieProfonde(reglagesEnService ?? {});
  const mdb = reglages.modeleDeButs;
  if (!objetSimple(mdb)) throw new PropositionRefusee('sans-modele-de-buts', 'Le modèle de buts unique n’est pas en service : aucun de ses réglages ne peut être corrigé.', 409);
  if (valeurDuLevier(mdb, levier) === undefined) throw new PropositionRefusee('levier-absent', `Le réglage « ${libelleDuLevier(levier)} » n’existe pas dans le modèle de buts en service.`, 409);
  return {
    id,
    etape: '26',
    quoi,
    enMots,
    modifications: { football: { modeleDeButs: avecLeLevier(mdb, levier, apres) } },
    marches: marchesDuLevier(levier),
    temoins: temoinsDuLevier(levier),
    horizon: { ...HORIZON_DES_CORRECTIONS },
    vues: copieProfonde(vues),
    variantes: []
  };
}

/**
 * La déclaration part-elle toujours des réglages en service ? Le modèle de buts de la déclaration, le levier remis à
 * sa valeur `avant`, doit être EXACTEMENT celui en service : sinon (le levier, ou un autre réglage du modèle, a changé
 * dans Réglages depuis la proposition) la mettre à l'essai changerait plus d'un réglage — elle est « périmée ».
 */
export function partDesReglagesEnService(declaration, levier, avant, reglagesEnService) {
  const enService = copieProfonde(reglagesEnService ?? {})?.modeleDeButs;
  const propose = declaration?.modifications?.football?.modeleDeButs;
  if (!objetSimple(enService) || !objetSimple(propose)) return false;
  return formeTriee(avecLeLevier(propose, levier, avant)) === formeTriee(enService);
}
const formeTriee = (v) => JSON.stringify(trier(v));
const trier = (v) => (Array.isArray(v) ? v.map(trier) : objetSimple(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, trier(v[k])])) : v);

// ============================================================ les règles, sur le dernier tri

/** Ajoute `mois` mois à un instant (calendrier UTC) : la fin de l'attente avant de reproposer. */
function plusMois(instant, mois) {
  const d = new Date(Date.parse(instant));
  d.setUTCMonth(d.getUTCMonth() + mois);
  return d.getTime();
}

/** La première et la dernière journée d'une fenêtre de mois (« 2026-10 » … « 2026-12 » → 2026-10-01 → 2026-12-31). */
function bornesDeLaFenetre(mois) {
  const liste = [...(mois ?? [])].sort();
  if (!liste.length) return null;
  const [a, m] = liste.at(-1).split('-').map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${liste[0]}-01`, a: `${liste.at(-1)}-${String(dernier).padStart(2, '0')}` };
}

/** « octobre-décembre 2026 », « décembre 2026-janvier 2027 », « décembre 2026 ». */
function fenetreDite(mois) {
  const liste = [...(mois ?? [])].sort();
  if (!liste.length) return 'fenêtre inconnue';
  if (liste.length === 1) return moisDit(liste[0]);
  const [d, f] = [liste[0], liste.at(-1)];
  return d.slice(0, 4) === f.slice(0, 4) ? `${moisDit(d).split(' ')[0]}-${moisDit(f)}` : `${moisDit(d)}-${moisDit(f)}`;
}

/** La place est-elle prise par la candidate DU CODE pendant son essai (l'étape 27) ? (miseALEssai.etatDeLaPlace) */
const essaiDuCode = (place) => place?.par === 'code';

/**
 * LES PROPOSITIONS DES RÈGLES sur UN tri (le DERNIER trié de la passe : jamais un mois rattrapé plus ancien).
 *   `tri`               le tri rangé (trierLeMois / lireLeTri) ;
 *   `reglagesEnService` les réglages du football EN SERVICE (lireReglagesDuMoteur().football — recopiés ici) ;
 *   `propositions`      toutes les propositions existantes (lireLesPropositions) ;
 *   `place`             etatDeLaPlace (miseALEssai.js) ;
 *   `base`              l'empreinte des pronostics de la version en service (lignee.empreinteDesPronostics) ;
 *   `versionEnService`  son numéro.
 * Rend { aCreer: [{ proposition, phrase }], demandesDuCode: [{ cas, phrase, details }], ecartees: [{ cas?, levier?, raison, phrase }] }.
 * Rien n'est proposé pendant l'essai de l'étape 27 (décision 8), ni quand la version en service n'est plus de la
 * lignée du mois trié (le défaut a été mesuré sur un autre moteur).
 */
export function proposerPourLeTri({ tri, reglagesEnService, propositions = [], place = null, base = null, versionEnService = null, maintenant = Date.now() }) {
  const sortie = { aCreer: [], demandesDuCode: [], ecartees: [] };
  if (!tri || !Array.isArray(tri.cases)) return sortie;
  const reglages = copieProfonde(reglagesEnService ?? {});
  const cases = tri.cases;
  // Les défauts sans réglage : notés (une fois par lignée, par l'appelant), jamais forcés.
  for (const c of cases) {
    if (c.levier?.code) {
      sortie.demandesDuCode.push({
        cas: c.cas,
        phrase: `Tri ${deMois(tri.mois)} : « ${familleDe(c.famille)?.libelle ?? c.famille} » (${c.mesure}) ${c.sensDit ?? 's’écarte'} — ${c.levier.phrase}.`,
        details: { cas: c.cas, mois: tri.mois, lignee: tri.lignee?.empreinte ?? null, ecart: c.fenetre?.ecart ?? null, fenetre: c.fenetre?.mois ?? null }
      });
    }
  }
  const visees = cases.filter((c) => c.levier && c.levier.cle);
  const enAttente = cases.filter((c) => c.levier?.attente);
  for (const c of enAttente) sortie.ecartees.push({ cas: c.cas, raison: 'confiance-d-abord', phrase: c.levier.phrase });
  if (!visees.length) return sortie;
  const ecarter = (raison, phrase, extra = {}) => {
    for (const c of extra.cases ?? visees) sortie.ecartees.push({ cas: c.cas, levier: c.levier.cle, raison, phrase });
  };
  if (essaiDuCode(place)) {
    ecarter('essai-27', 'pendant l’essai du modèle de buts (étape 27), rien n’est proposé');
    return sortie;
  }
  if (!base || tri.lignee?.empreinte !== base) {
    ecarter('version-changee', 'la version du moteur en service n’est plus celle du mois trié : rien n’est proposé sur ce tri');
    return sortie;
  }
  if (!objetSimple(reglages.modeleDeButs)) {
    ecarter('sans-modele-de-buts', 'le modèle de buts unique n’est pas en service : aucun de ses réglages ne peut être corrigé');
    return sortie;
  }
  const parLevier = new Map();
  for (const c of visees) {
    if (!parLevier.has(c.levier.cle)) parLevier.set(c.levier.cle, []);
    parLevier.get(c.levier.cle).push(c);
  }
  const existants = propositions.map((p) => p.id);
  const enEssai = new Set(place?.candidate?.marches ?? []);
  for (const [cle, lesCases] of parLevier) {
    const sens = new Set(lesCases.map((c) => c.levier.sens));
    if (sens.size !== 1) {
      ecarter('sens-contraires', 'des écarts en sens contraires visent le même réglage : rien n’est proposé', { cases: lesCases });
      continue;
    }
    if (marchesDuLevier(cle).some((m) => enEssai.has(m))) {
      ecarter('famille-en-essai', 'une famille de ce réglage est en essai : rien n’est proposé avant son verdict', { cases: lesCases });
      continue;
    }
    const ouverte = propositions.find((p) => p.levier === cle && ETATS_OUVERTS.includes(p.etat));
    if (ouverte) {
      ecarter('deja-ouverte', `une correction de ce réglage est déjà ouverte (« ${ouverte.id} »)`, { cases: lesCases });
      continue;
    }
    const recente = propositions.find((p) => p.levier === cle && ETATS_QUI_FONT_ATTENDRE.includes(p.etat) && plusMois(p.etatLe, ATTENTE_AVANT_DE_REPROPOSER_MOIS) > maintenant);
    if (recente) {
      ecarter('refusee-recemment', `ce réglage a été ${recente.etat === 'refusee' ? 'refusé' : recente.etat === 'rejetee' ? 'rejeté' : 'retiré'} le ${jourDit(recente.etatLe)} : pas avant 6 mois`, { cases: lesCases });
      continue;
    }
    if (propositions.some((p) => p.levier === cle && p.source === 'regle' && p.triMois === tri.mois)) {
      ecarter('deja-proposee-ce-mois', 'ce réglage a déjà été proposé par ce tri', { cases: lesCases });
      continue;
    }
    const avant = valeurDuLevier(reglages.modeleDeButs, cle);
    const apres = valeurProposee(cle, avant, [...sens][0]);
    if (apres === null) {
      ecarter('valeur-au-bout', 'le réglage est déjà au bout de ce que la règle permet', { cases: lesCases });
      continue;
    }
    const id = idDeProposition({ source: 'regle', levier: cle, mois: tri.mois, existants });
    existants.push(id);
    const c0 = lesCases[0];
    const fenetre = c0.fenetre?.mois ?? [tri.mois];
    const bornes = bornesDeLaFenetre(fenetre);
    const ecart = c0.fenetre?.ecart ?? c0.courant?.ecart ?? 0;
    const familles = lesCases.map((c) => `« ${familleDe(c.famille)?.libelle ?? c.famille} »`).join(', ');
    const libelle = libelleDuLevier(cle);
    const changement = `${libelle} : ${valeurDite(cle, avant)} → ${valeurDite(cle, apres)}`;
    const quoi = `Correction du mois (${moisDit(tri.mois)}) : ${familles} ${c0.sensDit ?? 's’écarte'} (${pointsDits(ecart)} sur ${fenetreDite(fenetre)}) ; ${changement}.`;
    const enMots = `${c0.levier.phrase.replace(/^./, (x) => x.toUpperCase())} (tri ${deMois(tri.mois)}).`;
    const declaration = declarationDe({ id, levier: cle, apres, reglagesEnService: reglages, quoi, enMots, vues: bornes ? [{ ...bornes, quoi: `Tri ${deMois(tri.mois)} : l’écart constaté` }] : [] });
    try {
      validerCandidate(declaration);
    } catch (error) {
      ecarter('declaration-invalide', `la correction ne tient pas debout : ${error.message}`, { cases: lesCases });
      continue;
    }
    sortie.aCreer.push({
      proposition: {
        id,
        source: 'regle',
        levier: cle,
        avant,
        apres,
        marches: declaration.marches,
        declaration,
        base,
        triMois: tri.mois,
        triVersion: tri.version,
        cas: lesCases.map((c) => c.cas)
      },
      phrase: `Proposée par le tri ${deMois(tri.mois)} : ${familles} ${c0.sensDit ?? 's’écarte'} (${pointsDits(ecart)} sur ${fenetreDite(fenetre)}, ${nombreDit(c0.fenetre?.matchs ?? 0)} matchs) ; ${changement}. À mesurer au banc d’essai, ou à refuser.`,
      versionEnService
    });
  }
  return sortie;
}

// ============================================================ le formulaire de Pierre

const LEVIERS_DITS = () => Object.keys(LEVIERS).map((k) => `« ${libelleDuLevier(k)} »`).join(', ');

/** La phrase du formulaire FERMÉ pendant l'essai de l'étape 27 (décision 8 de l'orchestrateur). */
export function phraseDuFormulaireFerme(place) {
  return `Le formulaire est fermé pendant l’essai du modèle de buts (étape 27) : rien ne peut être essayé à blanc avant son verdict${place?.auPlusTotLe ? ` (au plus tôt le ${jourDit(place.auPlusTotLe)})` : ''}.`;
}

/**
 * Le formulaire est-il ouvert, et chaque levier proposable ? (Pour l'écran et la route ; pur.) Rend { ouvert, raison,
 * leviers: [{ cle, libelle, valeur, valeurDite, min, max, pas, ouvertes, ouvert, raison }] }.
 */
export function etatDuFormulaire({ place = null, reglagesEnService = null, propositions = [] } = {}) {
  const mdb = copieProfonde(reglagesEnService ?? {})?.modeleDeButs;
  let raison = null;
  if (essaiDuCode(place)) raison = phraseDuFormulaireFerme(place);
  else if (!objetSimple(mdb)) raison = 'Le modèle de buts unique n’est pas en service : aucun de ses réglages ne peut être corrigé ici.';
  const enEssai = new Set(place?.candidate?.marches ?? []);
  const leviers = Object.entries(LEVIERS).map(([cle, l]) => {
    const valeur = objetSimple(mdb) ? valeurDuLevier(mdb, cle) : undefined;
    let r = raison;
    if (!r && valeur === undefined) r = 'ce réglage n’existe pas dans le modèle de buts en service';
    if (!r && marchesDuLevier(cle).some((m) => enEssai.has(m))) r = `une correction est déjà en essai sur ces marchés (« ${place.candidate.enMots ?? place.candidate.id} »)`;
    const ouverte = !r && propositions.find((p) => p.levier === cle && ETATS_OUVERTS.includes(p.etat));
    if (ouverte) r = `une correction de ce réglage est déjà ouverte (« ${ouverte.id} »)`;
    return { cle, libelle: libelleDuLevier(cle), valeur: fini(valeur) ? valeur : null, valeurDite: fini(valeur) ? valeurDite(cle, valeur) : null, min: l.min, max: l.max, pas: l.pas, ouvertes: Boolean(l.ouvertes), ouvert: !r, raison: r };
  });
  return { ouvert: !raison, raison, leviers, reglagesDePari: 'Les réglages de pari (seuil de value, cote maximale, vos bookmakers, mise) ne passent pas par ici : ils ne changent aucune probabilité ; ils se règlent dans Réglages.' };
}

/**
 * LA PROPOSITION DE PIERRE (le formulaire) : `corps` { levier, valeur, phrase? } ; contrôlée dans cet ordre — l'essai
 * de l'étape 27 (fermé), le réglage (un levier ; ni réglage de pari, ni réglage retiré), le modèle de buts en service,
 * la valeur (bornes, pas, différente de celle en service), une famille en essai, une correction déjà ouverte sur le
 * même réglage. Lève PropositionRefusee (400 / 409) avec la raison en mots ; RIEN n'est écrit ici. Rend
 * { proposition, phrase } (proposition prête pour depotCorrections.creerUneProposition).
 */
export function propositionDePierre(corps, { reglagesEnService, propositions = [], place = null, base = null, maintenant = Date.now() } = {}) {
  if (essaiDuCode(place)) throw new PropositionRefusee('essai-27', `${phraseDuFormulaireFerme(place)} Rien n’a été proposé.`, 409);
  const levier = corps?.levier;
  if (typeof levier !== 'string' || !levier.trim()) throw new PropositionRefusee('levier-absent', `Dites quel réglage corriger (${LEVIERS_DITS()}). Rien n’a été proposé.`);
  if (REGLAGES_DE_PARI.includes(levier)) throw new PropositionRefusee('reglage-de-pari', 'Les réglages de pari (seuil de value, cote maximale, vos bookmakers, mise) ne passent pas par ici : ils ne changent aucune probabilité ; ils se règlent dans Réglages. Rien n’a été proposé.');
  if (LEVIERS_RETIRES.includes(levier)) throw new PropositionRefusee('levier-retire', `« ${libelleDuLevier(levier)} » ne se corrige plus par la boucle de correction : l’essai ne juge pas assez ce réglage famille par famille. Rien n’a été proposé.`);
  if (!LEVIERS[levier]) throw new PropositionRefusee('levier-inconnu', `Réglage inconnu : « ${levier} ». Réglages possibles : ${LEVIERS_DITS()}. Rien n’a été proposé.`);
  const reglages = copieProfonde(reglagesEnService ?? {});
  if (!objetSimple(reglages.modeleDeButs)) throw new PropositionRefusee('sans-modele-de-buts', 'Le modèle de buts unique n’est pas en service : aucun de ses réglages ne peut être corrigé. Rien n’a été proposé.', 409);
  const valeur = typeof corps.valeur === 'string' && corps.valeur.trim() !== '' ? Number(corps.valeur.replace(',', '.').replace(MOINS, '-')) : corps.valeur;
  const probleme = problemeDeValeur(levier, valeur);
  if (probleme) throw new PropositionRefusee('valeur', `« ${libelleDuLevier(levier)} » : ${probleme}. Rien n’a été proposé.`);
  const avant = valeurDuLevier(reglages.modeleDeButs, levier);
  if (avant === undefined) throw new PropositionRefusee('levier-absent', `Le réglage « ${libelleDuLevier(levier)} » n’existe pas dans le modèle de buts en service. Rien n’a été proposé.`, 409);
  if (valeur === avant) throw new PropositionRefusee('meme-valeur', `« ${libelleDuLevier(levier)} » vaut déjà ${valeurDite(levier, avant)} : rien à essayer.`);
  const enEssai = new Set(place?.candidate?.marches ?? []);
  if (marchesDuLevier(levier).some((m) => enEssai.has(m))) {
    throw new PropositionRefusee('famille-en-essai', `Une correction est déjà en essai sur ces marchés (« ${place.candidate.enMots ?? place.candidate.id} ») : attendez son verdict. Rien n’a été proposé.`, 409);
  }
  const ouverte = propositions.find((p) => p.levier === levier && ETATS_OUVERTS.includes(p.etat));
  if (ouverte) throw new PropositionRefusee('deja-ouverte', `Une correction de ce réglage est déjà ouverte (« ${ouverte.id} ») : décidez-la d’abord. Rien n’a été proposé.`, 409);
  const phrase = corps.phrase === undefined || corps.phrase === null ? '' : String(corps.phrase).replace(/\s+/g, ' ').trim();
  if (phrase.length > 300) throw new PropositionRefusee('phrase', 'La phrase fait plus de 300 caractères. Rien n’a été proposé.');
  if (!base) throw new PropositionRefusee('version-inconnue', 'La version du moteur en service ne se lit pas pour l’instant (registre des versions). Rien n’a été proposé : réessayez dans un instant.', 503);
  const id = idDeProposition({ source: 'pierre', levier, maintenant, existants: propositions.map((p) => p.id) });
  const libelle = libelleDuLevier(levier);
  const changement = `${libelle} : ${valeurDite(levier, avant)} → ${valeurDite(levier, valeur)}`;
  const quoi = `Correction proposée par Pierre le ${jourDit(maintenant)} : ${changement}.${phrase ? ` (« ${phrase} »)` : ''}`;
  const enMots = `Vous proposez de changer un réglage du modèle de buts : ${changement.replace(/^./, (x) => x.toLowerCase())}.`;
  const declaration = declarationDe({ id, levier, apres: valeur, reglagesEnService: reglages, quoi, enMots, vues: [] });
  validerCandidate(declaration);
  return {
    proposition: { id, source: 'pierre', levier, avant, apres: valeur, marches: declaration.marches, declaration, base, triMois: null, triVersion: null, cas: null },
    phrase: `Proposée par vous : ${changement}${phrase ? ` — « ${phrase} »` : ''}. À mesurer au banc d’essai, ou à refuser.`
  };
}

/** Le texte d'une case pour les phrases (« Les 2 équipes marquent », niveau). */
export const caseDite = (cas) => {
  const { famille, mesure } = lireLaCase(cas);
  return `« ${familleDe(famille)?.libelle ?? famille} », ${mesure}`;
};
