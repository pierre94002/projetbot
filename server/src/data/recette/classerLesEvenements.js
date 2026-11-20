/**
 * classerLesEvenements.js — LE CLASSEUR, LES DÉCISIONS, LES ÉPISODES ET LE DÉCOMPTE DE LA RECETTE
 * (étape 47 du plan, lot 1, passe P3, 17/11/2026).
 * -----------------------------------------------------------------------
 * PUR : aucune lecture, aucune écriture, aucune horloge (tout instant est passé en argument). Importé par le journal
 * (classement à l'arrivée) et par recette.mjs (revue, vérification de J0, décompte). Dans l'empreinte des causes
 * (CR-19), avec causesConnues.js et journalWindows.js : les seuils qui décident vivent ici.
 *
 * LES CLASSES (figées à l'arrivée, T-C9 ; la décision de la revue s'ajoute à côté, jamais à la place) :
 *   'info'        ce qui n'est pas un signal de panne : une liste FERMÉE de types (TYPES_INFO, décision 23 c) ; un
 *                 type inconnu ou une erreur n'est JAMAIS 'info' ;
 *   'connue'      une cause de la liste le reconnaît d'office (ou le journal l'a classé : démarrages, trous) ;
 *   'nouvelle'    une cause « corrigée » qui revient (rechute), ou un arrêt sur erreur : comptée ;
 *   'a-expliquer' rien ne la reconnaît : la revue la rattache à la main (si la cause le permet, CR-28) ou la déclare
 *                 nouvelle ; non tranchée à J14 + 48 h → comptée nouvelle (D5).
 * -----------------------------------------------------------------------
 */

import crypto from 'node:crypto';
import { CAUSES_CONNUES } from './causesConnues.js';
import { ajouterJours, estUnJour, jourDeParis, jourZero, finDeLaRecette, joursEntre } from './calendrierDeLaRecette.js';

export const CLASSES = Object.freeze(['info', 'connue', 'a-expliquer', 'nouvelle']);
// Classe FINALE de plus (jamais d'arrivée) : 'a-part', un dépassement de borne expliqué par une note (RC-7, décision 26 c).

/**
 * Le coût de la veille (CR-21 point 3) N'EST PAS COMPTÉ (décision 24 b de l'orchestrateur, 17/11) : relevé en brut le 17/11,
 * ni le calendrier de saison (`date` toujours « AAAA-MM-JJ », 0 heure sur 47 390 matchs) ni le journal des appels Claude
 * (`appels[].match` sans heure ; `debut` et `at` sont l'heure de l'APPEL) ni les trois autres fichiers permis
 * (décision 8) ne portent d'heure de coup d'envoi. Jamais d'estimation depuis la seule date ; jamais la base.
 */
export const COUT_NON_COMPTE = 'non compté : aucune heure de coup d’envoi lisible sans la base';

/** Ce que le journal ne voit pas (CR-20 point 3, décision 24 b) : dit dans chaque résumé du jour, par la carte et le bilan. */
export const NON_SURVEILLE = `Non surveillé par l'essai : la boucle des compositions, la boucle des cotes gratuites, et le détail de l'analyse au coup d'envoi (ses échecs ne sont dits que dans la fenêtre du serveur). Coût de la veille (matchs commencés pendant que le PC dormait) : ${COUT_NON_COMPTE}.`;

// --- 'info' : la liste FERMÉE (décision 23 c) ----------------------------------------------------------------------

/** Les SEULS types qui peuvent être 'info', et à quelle condition. Tout autre type : jamais 'info'. */
export const TYPES_INFO = Object.freeze({
  'alerte-levee': () => true,
  sauvegarde: () => true,
  restauration: () => true,
  'direct-repris': () => true,
  'controle-couleur': (ev) => ev?.details?.vers === 'vert',
  fotmob: (ev) => ev?.details?.vers === 'ok'
});

/** Vrai seulement pour un type de la liste fermée, à sa condition. */
export function estInfoPermise(ev) {
  const regle = Object.hasOwn(TYPES_INFO, ev?.type ?? '') ? TYPES_INFO[ev.type] : null;
  try {
    return Boolean(regle && regle(ev));
  } catch {
    return false;
  }
}

/** Les types que le journal classe lui-même (S10, S11) : leur classe est gardée si la cause existe. */
export const TYPES_DU_JOURNAL = Object.freeze(['premier-demarrage-du-journal', 'arret-sur-erreur', 'mise-en-service', 'redemarrage-du-pc', 'redemarrage-rapide', 'arret-du-serveur', 'demarrage-sans-battement', 'trou', 'trou-relu']);

/** Jamais connus, jamais rattachables : la règle enfreinte (CR-19), un nombre au-delà de la borne (CR-18). */
export const TYPES_JAMAIS_CONNUS = Object.freeze(['regle-enfreinte', 'alerte-au-dela-de-la-borne']);

const SORTES = Object.freeze({
  'etape-en-alerte': 'etapes',
  'etape-en-echec': 'etapes',
  'alerte-posee': 'alertes',
  'alerte-changee': 'alertes',
  'controle-couleur': 'controles',
  'constat-nouveau': 'controles',
  fotmob: 'fotmob',
  'direct-suspendu': 'direct',
  'ia-echecs-de-suite': 'ia',
  'ia-part-echecs': 'ia',
  'sans-passe': 'signaux',
  'sans-sauvegarde': 'signaux',
  'sauvegarde-en-echec': 'signaux',
  'restauration-pas-saine': 'signaux'
});

/** La sorte d'un événement (la clé de `reconnait` / `aLaMain` qui le concerne), ou null. */
export function sorteDeLEvenement(ev) {
  const t = ev?.type ?? '';
  if (['premier-demarrage-du-journal', 'arret-sur-erreur', 'mise-en-service', 'redemarrage-du-pc', 'redemarrage-rapide', 'arret-du-serveur', 'demarrage-sans-battement'].includes(t)) return 'demarrages';
  if (t === 'trou' || t === 'trou-relu') return 'trous';
  return Object.hasOwn(SORTES, t) ? SORTES[t] : null;
}

// --- Les nombres et les bornes (CR-22 point 2) ----------------------------------------------------------------------

/** Un nombre écrit à la française (« 4 213 ») lu par le motif (premier groupe), ou null. */
export function lireUnNombre(texte, motif) {
  if (!(motif instanceof RegExp)) return null;
  const m = motif.exec(String(texte ?? ''));
  if (!m || m[1] === undefined) return null;
  const n = Number(m[1].replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** La borne d'un niveau de J0 : niveau × 1,5 + 5 (arrondie à l'entier inférieur) ; null si le niveau n'est pas relevé. */
export const borneDuNiveau = (niveau) => (Number.isFinite(niveau) ? Math.floor(niveau * 1.5 + 5) : null);

/**
 * Le nombre est-il sous la borne ? { ok, raison }. Borne fixe (`max`) ou borne de J0 (`borne`, nom dans cause.bornes) ;
 * niveau de J0 non relevé : admis pendant le rodage et la vérification de J0 seulement (après J0 : « à expliquer »).
 */
function sousLaBorne(cause, regle, valeur, contexte) {
  // P4b-1 (RC-24) : des raisons en mots (montrées sur la carte) ; les identifiants restent dans l'événement.
  if (valeur === null || valeur === undefined) return { ok: Boolean(regle.facultatif), raison: 'le nombre ne se lit pas dans le message' };
  if (Number.isFinite(regle.max)) return valeur <= regle.max ? { ok: true } : { ok: false, raison: `${valeur} au-delà de ${regle.max}` };
  const niveau = cause.bornes?.[regle.borne]?.niveauJ0 ?? null;
  const borne = borneDuNiveau(niveau);
  if (borne === null) return contexte?.rodage || contexte?.verification ? { ok: true, raison: 'borne non relevée (rodage)' } : { ok: false, raison: 'la borne n’a pas été relevée au début de l’essai' };
  return valeur <= borne ? { ok: true } : { ok: false, raison: `${valeur} au-delà de la borne ${borne} (niveau du début de l’essai : ${niveau})` };
}

// --- Les formes reprises du journal (P2), ici pour être dans l'empreinte et lisibles sans le journal ------------

/** Une écriture JSON stable (clés triées), pour comparer deux contenus. */
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** Les champs d'une alerte qui bougent sans rien dire (dates, échantillons). */
export const CHAMPS_VOLATILS = new Set(['updatedAt', 'majLe', 'le', 'at', 'since', 'depuis', 'samples', 'echantillons']);

/**
 * La SIGNATURE d'une alerte durable (CR-18 point 1) : les clés des relevés et des problèmes, les types de `parType`,
 * les inconnus ; à défaut, le contenu sans ses champs volatils. Les nombres sont à part (nombresDeLAlerte). null pour
 * une alerte absente.
 */
export function signatureDeLAlerte(valeur) {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur !== 'object') return stable(valeur);
  const cles = (liste) => (Array.isArray(liste) ? liste.map((x) => (x && typeof x === 'object' ? x.cle ?? x.key ?? x.id ?? stable(x) : String(x))).map(String).sort() : null);
  const morceaux = {};
  if (Array.isArray(valeur.releves)) morceaux.releves = cles(valeur.releves);
  if (Array.isArray(valeur.problemes)) morceaux.problemes = cles(valeur.problemes);
  if (valeur.parType && typeof valeur.parType === 'object') morceaux.parType = Object.keys(valeur.parType).sort();
  if (Array.isArray(valeur.inconnus)) morceaux.inconnus = cles(valeur.inconnus);
  if (Object.keys(morceaux).length) return stable(morceaux);
  return stable(Object.fromEntries(Object.entries(valeur).filter(([k]) => !CHAMPS_VOLATILS.has(k))));
}

/** Les nombres d'une alerte (anomalies, comptes par type, inconnus, problèmes) : pour la borne, jamais la signature. */
export function nombresDeLAlerte(valeur) {
  if (!valeur || typeof valeur !== 'object') return null;
  const n = {};
  if (Number.isFinite(valeur.anomalies)) n.anomalies = valeur.anomalies;
  if (valeur.parType && typeof valeur.parType === 'object') {
    for (const [k, v] of Object.entries(valeur.parType)) if (Number.isFinite(v)) n[`parType.${k}`] = v;
  }
  if (Array.isArray(valeur.inconnus)) n.inconnus = valeur.inconnus.length;
  if (Array.isArray(valeur.problemes)) n.problemes = valeur.problemes.length;
  return Object.keys(n).length ? n : null;
}

/** Les éléments AJOUTÉS d'une signature à l'autre (listes d'une signature stable), ou null si illisible. */
export function ajoutsDeLaSignature(avant, apres) {
  try {
    const a = avant === null || avant === undefined ? {} : JSON.parse(avant);
    const b = JSON.parse(apres);
    if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
    const ajouts = [];
    for (const [k, liste] of Object.entries(b)) {
      if (!Array.isArray(liste)) return null;
      const deja = new Set(Array.isArray(a?.[k]) ? a[k] : []);
      for (const x of liste) if (!deja.has(x)) ajouts.push(`${k}:${x}`);
    }
    return ajouts;
  } catch {
    return null;
  }
}

/** FotMob : 5 réponses en échec de suite = en panne (même seuil que relevesDesSources.js:56). */
export const ERREURS_FOTMOB_PANNE = 5;
/** Les étapes FotMob de l'actualisation (même liste que sourceHealth.js:84 ; module non importé ici). */
export const ETAPES_FOTMOB = Object.freeze(['calendrier', 'classements', 'nouvelles', 'omissions', 'feuillesTardives', 'feuilles']);

/** Un épisode FotMob « en panne » de plus de 6 h observées (CR-24 point 2, décision 24 e) : « à expliquer ». */
export const DUREE_MAX_PANNE_FOTMOB_MS = 6 * 3_600_000;

/**
 * L'épisode FotMob « en panne » en cours dépasse-t-il 6 h de temps OBSERVÉ (les tours du journal, veilles exclues,
 * comme S6 et S7, CR-21) ? { cause, nom, valeur (heures), borne (heures) } ou null. Pur. Le journal en fait un événement
 * « alerte-au-dela-de-la-borne » (jamais connu), une fois par épisode.
 */
export function depassementDeLaPanneFotmob({ etat, observeMs }) {
  if (etat !== 'en-panne' || !Number.isFinite(observeMs) || observeMs <= DUREE_MAX_PANNE_FOTMOB_MS) return null;
  return { cause: 'fotmob-panne-detectee', nom: 'duree', valeur: Math.round((observeMs / 3_600_000) * 10) / 10, borne: DUREE_MAX_PANNE_FOTMOB_MS / 3_600_000 };
}

/**
 * L'état de FotMob lu SANS sourceHealth.js (réduction de etatFotmob, sourceHealth.js:174, aux fichiers déjà lus) :
 * { etat: 'en-panne' | 'a-surveiller' | 'ok' | 'inconnu', raison, nature, detecteParLAppli }. `detecteParLAppli` :
 * l'appli le dit elle-même (sante-fotmob.json) ; faux quand seul le journal le voit (toutes les étapes FotMob de la
 * dernière passe en échec, l'appli ne disant rien : détection manquée, T-C8). `nature` : celle de la dernière erreur
 * (relevesDesSources.js:153-164 : acces-refuse, limite, serveur, introuvable, refus, illisible, reseau, autre).
 */
export function etatFotmobLu({ sante, refresh, maintenant }) {
  const erreursDeSuite = Number.isFinite(sante?.erreursDeSuite) ? sante.erreursDeSuite : 0;
  const passe = Array.isArray(refresh?.history) ? refresh.history[0] : null;
  const etapes = (passe?.steps ?? []).filter((e) => ETAPES_FOTMOB.includes(e?.key) && e.status !== 'skipped');
  const derniereErreur = sante?.derniereErreur ?? null;
  const nature = typeof derniereErreur?.nature === 'string' ? derniereErreur.nature : null;
  const t = typeof derniereErreur?.le === 'number' ? derniereErreur.le : Date.parse(derniereErreur?.le);
  if (erreursDeSuite >= ERREURS_FOTMOB_PANNE) return { etat: 'en-panne', raison: `${erreursDeSuite} réponses en échec de suite`, nature, detecteParLAppli: true };
  if (etapes.length && etapes.every((e) => e.status === 'error')) return { etat: 'en-panne', raison: 'toutes les étapes FotMob de la dernière passe en échec', nature, detecteParLAppli: false };
  if (nature === 'acces-refuse' && maintenant - t < 86_400_000) return { etat: 'a-surveiller', raison: 'accès refusé', nature, detecteParLAppli: true };
  if (erreursDeSuite > 0) return { etat: 'a-surveiller', raison: `${erreursDeSuite} réponse(s) en échec de suite`, nature, detecteParLAppli: true };
  const forme = Object.entries(sante?.parType ?? {}).find(([, x]) => x?.derniereForme?.attendue === false);
  if (forme) return { etat: 'a-surveiller', raison: `forme inattendue (${forme[0]})`, nature: 'forme', detecteParLAppli: true };
  if (sante?.derniereReussite || etapes.some((e) => e.status === 'ok')) return { etat: 'ok', raison: null, nature: null, detecteParLAppli: true };
  return { etat: 'inconnu', raison: null, nature: null, detecteParLAppli: false };
}

// --- Reconnaître (d'office) -------------------------------------------------------------------------------------

/** Le préfixe « controle:sous-type » de l'identifiant d'un constat. */
export const sousTypeDuConstat = (id) => String(id ?? '').split(':').slice(1, 2)[0] ?? null;

/** La classe d'un événement de contrôle : celle du constat, ou la couleur vers laquelle le contrôle passe. */
function classeDuControle(ev) {
  if (ev.type === 'constat-nouveau') return ev.details?.classe ?? null;
  return ev.details?.vers ?? null;
}

const cleDuControle = (ev) => (ev.type === 'constat-nouveau' ? ev.details?.controle ?? null : ev.cle ?? null);

/** Une entrée `etapes` d'une cause correspond-elle à l'événement ? (motif ET nombre sous la borne) */
function etapeCorrespond(cause, r, ev, contexte, { aLaMain = false } = {}) {
  const statut = ev.details?.statut ?? (ev.type === 'etape-en-echec' ? 'error' : 'warn');
  if (r.cle !== '*' && r.cle !== ev.cle) return { ok: false };
  if (Array.isArray(r.statuts) && !r.statuts.includes(statut)) return { ok: false };
  if (r.figee && ev.details?.figeeParLaVeille !== true) return { ok: false };
  if (aLaMain) return { ok: true };
  if (!(r.motif instanceof RegExp) || !r.motif.test(String(ev.texte ?? ''))) return { ok: false };
  // P4b-1 (RC-2) : un motif qui refuse (l'arrêt de l'IA après plusieurs pannes de suite n'est jamais connu d'office).
  if (r.sauf instanceof RegExp && r.sauf.test(String(ev.texte ?? ''))) return { ok: false, raison: 'arrêt après plusieurs pannes de suite : jamais reconnu d’office' };
  if (r.nombre) {
    const b = sousLaBorne(cause, r.nombre, lireUnNombre(ev.texte, r.nombre.motif), contexte);
    if (!b.ok) return { ok: false, raison: b.raison };
  }
  return { ok: true };
}

/**
 * P4b-1 (RC-5, décision 26 d) : un élément ajouté à la signature de l'alerte « enregistreurs » qui est le relevé du direct,
 * lu PAR SA CLÉ (« releves:direct », la forme d'enregistreurs/etat.js:280, { cle, nom, probleme }) ou PAR SON TEXTE (un
 * relevé sans clé, dont la signature garde tout le contenu : « "direct" » ou « erreurs FotMob d'affilée », etat.js:206).
 */
export function estLeReleveDuDirect(element) {
  const x = String(element ?? '');
  if (x === 'releves:direct') return true;
  return x.startsWith('releves:') && /"direct"|erreurs FotMob d[’']affilée/i.test(x);
}

function alerteCorrespond(cause, r, ev, contexte, { aLaMain = false } = {}) {
  if (r.cle !== ev.cle) return { ok: false };
  if (aLaMain) return { ok: true };
  if (r.seulementLeDirect) {
    if (!['a-surveiller', 'en-panne'].includes(contexte?.fotmob)) return { ok: false, raison: 'alerte des enregistreurs hors d’une panne de FotMob' };
    const ajouts = ajoutsDeLaSignature(ev.type === 'alerte-changee' ? ev.details?.avant ?? null : null, ev.details?.signature ?? null);
    if (ajouts === null) return { ok: false, raison: 'contenu de l’alerte illisible' };
    if (!ajouts.length || !ajouts.every(estLeReleveDuDirect)) return { ok: false, raison: 'un autre relevé que le direct dans l’alerte des enregistreurs' };
    return { ok: true };
  }
  if (ev.type === 'alerte-changee') {
    const ajouts = ajoutsDeLaSignature(ev.details?.avant ?? null, ev.details?.signature ?? null);
    if (ajouts === null) return { ok: false, raison: 'contenu de l’alerte illisible' };
    if (ajouts.length) return { ok: false, raison: `un problème de plus dans l’alerte (${ajouts.length})` };
  }
  if (r.nombre) {
    const valeur = ev.details?.nombres?.[r.nombre] ?? null;
    const b = sousLaBorne(cause, { borne: r.borne, facultatif: true }, valeur, contexte);
    if (!b.ok) return { ok: false, raison: b.raison };
  }
  return { ok: true };
}

function controleCorrespond(cause, r, ev, contexte, { aLaMain = false } = {}) {
  if (r.cle !== cleDuControle(ev)) return { ok: false };
  const classe = classeDuControle(ev);
  if (!Array.isArray(r.classes) || !r.classes.includes(classe)) {
    // Un rouge n'est reconnu d'office que si son sous-type est nommé (CR-22 point 1).
    if (!aLaMain && classe === 'rouge' && ev.type === 'constat-nouveau' && Array.isArray(r.sousTypes) && r.sousTypes.includes(sousTypeDuConstat(ev.cle))) return { ok: true };
    return { ok: false };
  }
  if (aLaMain) return { ok: true };
  if (r.championnats && ev.type === 'constat-nouveau') {
    const liste = cause.bornes?.[r.championnats]?.liste ?? null;
    if (liste === null) {
      if (!(contexte?.rodage || contexte?.verification)) return { ok: false, raison: 'championnats de J0 non relevés' };
    } else if (!liste.includes(ev.details?.league ?? null)) return { ok: false, raison: `championnat neuf : ${ev.details?.league ?? '?'}` };
  }
  return { ok: true };
}

/** Les natures d'erreur de FotMob en mots (relevesDesSources.js:153-164), pour les raisons montrées (RC-24). */
const NATURES_EN_MOTS = Object.freeze({ 'acces-refuse': 'accès refusé', limite: 'trop de demandes', serveur: 'erreur du serveur', introuvable: 'page introuvable', refus: 'demande refusée', illisible: 'réponse illisible', reseau: 'réseau', autre: 'autre erreur', forme: 'forme inattendue' });

function fotmobCorrespond(r, ev, { aLaMain = false } = {}) {
  const d = ev.details ?? {};
  if (!r.etats?.includes(d.vers ?? ev.cle)) return { ok: false };
  if (aLaMain) return { ok: true };
  if (r.natures && !r.natures.includes(d.nature)) return { ok: false, raison: `erreur de FotMob : ${Object.hasOwn(NATURES_EN_MOTS, d.nature ?? '') ? NATURES_EN_MOTS[d.nature] : 'nature inconnue'}` };
  if (r.raison instanceof RegExp && !r.raison.test(String(d.raison ?? ''))) return { ok: false, raison: `FotMob : ${String(d.raison ?? 'sans raison dite').slice(0, 80)}` };
  if (r.detecteParLAppli && d.detecteParLAppli !== true) return { ok: false, raison: 'détection manquée : l’appli ne l’a pas dit' };
  return { ok: true };
}

/** La semaine de la recette d'un jour : 1 (J1-J7), 2 (J8-J14), sinon null. Pur. */
export function semaineDeLaRecette(jour, j0) {
  if (!estUnJour(jour ?? '') || !estUnJour(j0 ?? '')) return null;
  const n = joursEntre(j0, jour);
  return n >= 1 && n <= 7 ? 1 : n >= 8 && n <= 14 ? 2 : null;
}

/**
 * Décision 24 e : la cause ne reconnaît qu'UN jour par semaine de la recette (J1-J7, J8-J14). `contexte.joursConnus[cause]`
 * = les jours déjà reconnus par cette cause (le journal les tient dans son dernier état vu). Pas pendant le rodage ni la
 * vérification de J0. Au-delà : « à expliquer », raison « alerte au-delà de la borne », et Pierre décide (CR-26 point 3).
 */
function unJourParSemaine(cause, ev, contexte) {
  if (contexte?.rodage || contexte?.verification) return { ok: true };
  const j0 = contexte?.j0 ?? null;
  const jour = jourDeParis(ev?.le);
  const semaine = semaineDeLaRecette(jour, j0);
  if (semaine === null) return { ok: true };
  const deja = (contexte?.joursConnus?.[cause.id] ?? []).filter((j) => j !== jour && semaineDeLaRecette(j, j0) === semaine);
  // RC-24 : en mots, la date en JJ/MM ; la cause reste dans l'événement (cause, details), jamais dans la phrase.
  return deja.length ? { ok: false, raison: `alerte au-delà de la borne : déjà vu un autre jour de la semaine ${semaine === 1 ? 'J1-J7' : 'J8-J14'} (le ${jourCourt(deja[0])}) ; au plus un jour par semaine` } : { ok: true };
}

/** « 2026-11-21 » → « 21/11 » (les raisons montrées à Pierre, RC-24). */
const jourCourt = (j) => (estUnJour(j ?? '') ? `${j.slice(8, 10)}/${j.slice(5, 7)}` : String(j ?? ''));

function iaCorrespond(cause, r, ev, contexte) {
  if (!r.types?.includes(ev.type)) return { ok: false };
  const messages = Array.isArray(ev.details?.messagesDEchec) ? ev.details.messagesDEchec : [];
  if (!messages.length || !messages.every((m) => r.messages.test(String(m)))) return { ok: false, raison: 'messages d’échec qui ne parlent pas tous de limite' };
  if (Number.isFinite(r.echecsMax) && !(Number.isFinite(ev.details?.echecs) && ev.details.echecs <= r.echecsMax)) return { ok: false, raison: `alerte au-delà de la borne : plus de ${r.echecsMax} échecs dans la journée` };
  if (r.unJourParSemaine) return unJourParSemaine(cause, ev, contexte);
  return { ok: true };
}

/** Un constat est-il reconnu (présent au départ, ou d'office par une cause) ? Pour T-C14. */
function constatReconnu(controle, k, contexte, causes) {
  const j0 = contexte?.verification ? null : contexte?.j0 ?? null;
  const jour = k?.trouveLe ? jourDeParis(k.trouveLe) : null;
  if (j0 && (!jour || jour <= j0)) return true;
  const ev = { type: 'constat-nouveau', cle: k.id, details: { controle: controle.cle, classe: k.classe ?? null, league: k.league ?? null } };
  return causes.some((c) => c.mode === 'office' && (c.reconnait.controles ?? []).some((r) => controleCorrespond(c, r, ev, contexte).ok));
}

/** T-C14 : l'étape controleQuotidien n'est connue que si TOUS ses contrôles non verts n'ont que des constats reconnus. */
export function controleDuJourReconnu(contexte, causes = CAUSES_CONNUES) {
  const controle = contexte?.controle;
  if (!controle || !Array.isArray(controle.controles)) return { ok: false, raison: 'contrôle du jour non lu' };
  // P4b-1 (RC-3) : un contrôle « en panne » ou « pas fait » (dailyChecks.js:300 : 'erreur', 'non-fait'…) n'est jamais
  // reconnu : tout statutLe hors de vert, orange, rouge, info et null retient l'étape « à expliquer ».
  const enPanne = controle.controles.find((c) => c?.cle && c.classe !== 'info' && !estUneCouleurDeControle(c.statutLe));
  if (enPanne) return { ok: false, raison: `contrôle ${enPanne.libelle ?? enPanne.cle} en panne (${String(enPanne.statutLe).slice(0, 40)})` };
  const pasVerts = controle.controles.filter((c) => c?.cle && c.classe !== 'info' && (c.statutLe === 'orange' || c.statutLe === 'rouge'));
  for (const c of pasVerts) {
    const constats = (Array.isArray(c.constats) ? c.constats : []).filter((k) => k && k.classe !== 'info');
    if (!constats.length) return { ok: false, raison: `contrôle ${c.libelle ?? c.cle} ${c.statutLe} sans constat lisible` };
    const inconnu = constats.find((k) => !constatReconnu(c, k, contexte, causes));
    if (inconnu) return { ok: false, raison: `contrôle ${c.libelle ?? c.cle} : un constat non reconnu` };
  }
  return { ok: true };
}

/** Les couleurs d'un contrôle qui ne sont pas une panne du contrôle lui-même (RC-3). */
const COULEURS_DE_CONTROLE = Object.freeze(['vert', 'orange', 'rouge', 'info']);
export const estUneCouleurDeControle = (statut) => statut === null || statut === undefined || COULEURS_DE_CONTROLE.includes(statut);

/** La cause reconnaît-elle l'événement D'OFFICE ? { ok, raison? } */
export function causeReconnait(cause, ev, contexte = {}, causes = CAUSES_CONNUES) {
  if (!cause || cause.mode !== 'office') return { ok: false };
  const r = cause.reconnait ?? {};
  const sorte = sorteDeLEvenement(ev);
  let raison;
  const essayer = (liste, f) => {
    for (const x of liste ?? []) {
      const res = f(x);
      if (res.ok) return true;
      raison ??= res.raison;
    }
    return false;
  };
  if (sorte === 'etapes') {
    if (essayer(r.etapes, (x) => etapeCorrespond(cause, x, ev, contexte))) return { ok: true };
    if (r.controleDuJour && ev.cle === 'controleQuotidien' && ev.type === 'etape-en-alerte') {
      const c = controleDuJourReconnu(contexte, causes);
      if (c.ok) return { ok: true };
      raison ??= c.raison;
    }
  }
  if (sorte === 'alertes') {
    if (r.alertesDuDepart && !contexte?.verification) {
      const sig = contexte?.instantane?.alertes?.[ev.cle];
      if (sig !== undefined && sig !== null && sig === (ev.details?.signature ?? null)) return { ok: true };
    }
    if (essayer(r.alertes, (x) => alerteCorrespond(cause, x, ev, contexte))) return { ok: true };
  }
  if (sorte === 'controles' && essayer(r.controles, (x) => controleCorrespond(cause, x, ev, contexte))) return { ok: true };
  if (sorte === 'fotmob' && essayer(r.fotmob, (x) => fotmobCorrespond(x, ev))) return { ok: true };
  if (sorte === 'direct' && (r.direct ?? []).some((x) => x.pendantFotmob && ['a-surveiller', 'en-panne'].includes(contexte?.fotmob))) return { ok: true };
  if (sorte === 'ia' && essayer(r.ia, (x) => iaCorrespond(cause, x, ev, contexte))) return { ok: true };
  if (sorte === 'signaux' && (r.signaux ?? []).includes(ev.type)) return { ok: true };
  return { ok: false, raison };
}

// --- Classer (à l'arrivée) ------------------------------------------------------------------------------------------

/**
 * Classe un événement à son arrivée. Rend { classe, cause, rechute?, raison? }. Ne lève jamais.
 *   1. un type du journal (démarrages, trous) garde la classe du journal, si sa cause existe et le reconnaît ;
 *   2. 'info' seulement pour un type de TYPES_INFO, à sa condition ;
 *   3. la règle enfreinte et le nombre au-delà de la borne : toujours « à expliquer » ;
 *   4. la première cause d'office qui le reconnaît : 'connue', ou 'nouvelle' + rechute si elle est « corrigée » ;
 *   5. sinon « à expliquer ».
 * `contexte` : { rodage, verification, j0, instantane, fotmob, controle }.
 */
export function classerUnEvenement(ev, contexte = {}, causes = CAUSES_CONNUES) {
  try {
    if (!ev || typeof ev !== 'object') return { classe: 'a-expliquer', cause: null, raison: 'événement illisible' };
    if (TYPES_DU_JOURNAL.includes(ev.type)) {
      if (ev.classe === 'nouvelle') return { classe: 'nouvelle', cause: ev.cause ?? null };
      if (ev.classe === 'connue') {
        const c = causes.find((x) => x.id === ev.cause);
        const liste = sorteDeLEvenement(ev) === 'trous' ? c?.reconnait?.trous : c?.reconnait?.demarrages;
        const cle = sorteDeLEvenement(ev) === 'trous' ? ev.cause : ev.type;
        if (!c || !Array.isArray(liste) || !liste.includes(cle)) return { classe: 'a-expliquer', cause: null, raison: 'la cause donnée par le journal n’est pas dans la liste' };
        if (c.statut === 'corrigee') return { classe: 'nouvelle', cause: c.id, rechute: true };
        return { classe: 'connue', cause: c.id };
      }
      return { classe: 'a-expliquer', cause: null };
    }
    if (ev.classe === 'info' && estInfoPermise(ev)) return { classe: 'info', cause: null };
    if (TYPES_JAMAIS_CONNUS.includes(ev.type)) return { classe: 'a-expliquer', cause: null, raison: ev.type === 'regle-enfreinte' ? 'la liste des causes a changé pendant l’essai' : 'au-delà de la borne : à expliquer par une note' };
    let raison;
    for (const c of causes) {
      const r = causeReconnait(c, ev, contexte, causes);
      if (r.ok) return c.statut === 'corrigee' ? { classe: 'nouvelle', cause: c.id, rechute: true } : { classe: 'connue', cause: c.id };
      raison ??= r.raison;
    }
    return { classe: 'a-expliquer', cause: null, ...(raison ? { raison } : {}) };
  } catch (e) {
    return { classe: 'a-expliquer', cause: null, raison: 'le classement a échoué', erreur: String(e?.message ?? e).slice(0, 120) };
  }
}

/** Le classeur SANS liste (repli du journal) : info permise, classe du journal pour ses types, sinon « à expliquer ». */
export function classerSansListe(ev) {
  if (ev?.classe === 'info' && estInfoPermise(ev)) return { classe: 'info', cause: null };
  if (TYPES_DU_JOURNAL.includes(ev?.type) && ['connue', 'a-expliquer', 'nouvelle'].includes(ev.classe)) return { classe: ev.classe, cause: ev.cause ?? null };
  return { classe: ev?.classe === 'nouvelle' ? 'nouvelle' : 'a-expliquer', cause: null };
}

/** Le classeur que le journal reçoit : (ev, contexte) → { classe, cause, rechute? }. */
export function creerClasseur({ causes = CAUSES_CONNUES } = {}) {
  return (ev, contexte) => classerUnEvenement(ev, contexte, causes);
}

/**
 * Un nombre d'alerte au-delà de la borne d'une cause qui reconnaît cette alerte (CR-18 point 1) : { cause, nom, valeur,
 * borne } ou null. Le journal en fait un événement « alerte-au-dela-de-la-borne » (une fois, tant que ça dure).
 */
export function depassementDeLAlerte(cle, nombres, causes = CAUSES_CONNUES) {
  if (!nombres) return null;
  for (const c of causes) {
    for (const r of c.reconnait?.alertes ?? []) {
      if (r.cle !== cle || !r.nombre) continue;
      const borne = borneDuNiveau(c.bornes?.[r.borne]?.niveauJ0 ?? null);
      const valeur = nombres[r.nombre];
      if (borne !== null && Number.isFinite(valeur) && valeur > borne) return { cause: c.id, nom: r.nombre, valeur, borne };
    }
  }
  return null;
}

// --- Rattacher à la main (CR-28) ------------------------------------------------------------------------------------

/** La cause peut-elle recevoir cet événement à la main ? Refus MÉCANIQUE si sa clé n'est ni dans `reconnait` ni dans `aLaMain`. */
export function peutEtreRattache(ev, cause) {
  if (!cause) return { ok: false, raison: 'cause inconnue' };
  if (cause.rattachable === false) return { ok: false, raison: `la cause « ${cause.id} » ne se rattache pas à la main` };
  if (TYPES_JAMAIS_CONNUS.includes(ev?.type)) return { ok: false, raison: `« ${ev.type} » ne se rattache à aucune cause` };
  const sorte = sorteDeLEvenement(ev);
  if (!sorte) return { ok: false, raison: `type « ${ev?.type} » sans sorte connue` };
  for (const bloc of [cause.reconnait ?? {}, cause.aLaMain ?? {}]) {
    const liste = bloc[sorte];
    if (sorte === 'etapes') {
      if ((liste ?? []).some((r) => etapeCorrespond(cause, r, ev, {}, { aLaMain: true }).ok)) return { ok: true };
      if (bloc.controleDuJour && ev.cle === 'controleQuotidien') return { ok: true };
    } else if (sorte === 'alertes') {
      if ((liste ?? []).some((r) => r.cle === ev.cle)) return { ok: true };
    } else if (sorte === 'controles') {
      if ((liste ?? []).some((r) => controleCorrespond(cause, r, ev, {}, { aLaMain: true }).ok)) return { ok: true };
    } else if (sorte === 'fotmob') {
      if ((liste ?? []).some((r) => fotmobCorrespond(r, ev, { aLaMain: true }).ok)) return { ok: true };
    } else if (sorte === 'ia') {
      if ((liste ?? []).some((r) => r.types?.includes(ev.type))) return { ok: true };
    } else if (sorte === 'demarrages') {
      if ((liste ?? []).includes(ev.type)) return { ok: true };
    } else if (sorte === 'trous') {
      if ((liste ?? []).length) return { ok: true };
    } else if (sorte === 'direct' || sorte === 'signaux') {
      if (sorte === 'direct' ? (liste ?? []).length > 0 : (liste ?? []).includes(ev.type)) return { ok: true };
    }
  }
  return { ok: false, raison: `l’étape, le contrôle ou l’alerte « ${ev?.cle ?? ev?.type} » n’est pas dans la cause « ${cause.id} »` };
}

// --- Les décisions de la revue (decisions.json, écrit par recette.mjs seulement) -----------------------------------

export const SORTES_DE_DECISION = Object.freeze(['rattachement', 'nouvelle', 'note', 'ouvert-a-j0', 'tour-des-ecrans']);

/** decisions.json vide. */
export const decisionsVides = () => ({ version: 1, decisions: [] });

/**
 * Vérifie une décision avant de l'ajouter (T-C10) : { ok, raison }. `evenements` : Map id → événement (des fichiers
 * du jour) ; refus : sorte inconnue, raison vide, événement inconnu, cause inconnue, rattachement refusé (CR-28),
 * événement qui n'est pas « à expliquer », décision en double sans `remplacer`. Une note et une décision « nouvelle » sur
 * le même dépassement ne sont pas un double : les deux sont acceptées, la plus récente l'emporte (décision 27 b,
 * `appliquerLesDecisions`).
 */
export function verifierUneDecision({ decision, evenements, decisions = [], causes = CAUSES_CONNUES }) {
  const d = decision ?? {};
  if (!SORTES_DE_DECISION.includes(d.sorte)) return { ok: false, raison: `sorte de décision inconnue : ${d.sorte}` };
  if (typeof d.raison !== 'string' || d.raison.trim().length < 3) return { ok: false, raison: 'raison manquante (une phrase)' };
  if (d.sorte === 'note' && d.evenement !== undefined && d.evenement !== null) {
    // P4b-1 (RC-7, décision 26 c) : une note qui VISE un événement ne vaut que pour un dépassement de borne encore « à
    // expliquer », avec son auteur ; il devient « à part » (jamais « connu »).
    const ev = evenements?.get?.(d.evenement);
    if (!ev) return { ok: false, raison: `événement inconnu : ${d.evenement}` };
    if (!TYPES_EXPLIQUES_PAR_UNE_NOTE.includes(ev.type)) return { ok: false, raison: `une note ne vise qu’une alerte au-delà de sa borne (ici : ${ev.type})` };
    if (ev.classe !== 'a-expliquer') return { ok: false, raison: `l’événement est « ${ev.classe} » : seule une classe « à expliquer » se tranche` };
    if (typeof d.auteur !== 'string' || !d.auteur.trim()) return { ok: false, raison: 'auteur de la note manquant (--auteur)' };
    const deja = decisions.filter((x) => x.evenement === d.evenement && x.sorte === 'note');
    if (deja.length && !d.remplacer) return { ok: false, raison: `déjà expliqué par une note le ${deja.at(-1).le} (passez --remplacer pour changer)` };
    return { ok: true };
  }
  if (d.sorte === 'note' || d.sorte === 'tour-des-ecrans') return { ok: true };
  if (d.sorte === 'ouvert-a-j0') return typeof d.cle === 'string' && d.cle.trim() ? { ok: true } : { ok: false, raison: 'clé du point laissé ouvert manquante' };
  const ev = evenements?.get?.(d.evenement);
  if (!ev) return { ok: false, raison: `événement inconnu : ${d.evenement}` };
  if (ev.classe !== 'a-expliquer') return { ok: false, raison: `l’événement est « ${ev.classe} » : seule une classe « à expliquer » se tranche` };
  const deja = decisions.filter((x) => x.evenement === d.evenement && (x.sorte === 'rattachement' || x.sorte === 'nouvelle'));
  if (deja.length && !d.remplacer) return { ok: false, raison: `déjà tranché le ${deja.at(-1).le} (passez --remplacer pour changer)` };
  if (d.sorte === 'rattachement') {
    const c = causes.find((x) => x.id === d.cause);
    if (!c) return { ok: false, raison: `cause inconnue : ${d.cause}` };
    const r = peutEtreRattache(ev, c);
    if (!r.ok) return { ok: false, raison: r.raison };
  }
  return { ok: true };
}

/**
 * P4b-1 (RC-7, décision 26 c) : les types qu'une note écrite (`--noter --evenement <id> --auteur …`) explique. Classe finale
 * « a-part » : ni connue, ni nouvelle, ni à expliquer ; comptée et montrée à part. Tout dépassement de borne (FotMob au-delà
 * de 6 h, un nombre d'alerte au-delà de sa borne de J0). Le quota garde sa règle (rattachable sur décision écrite, 25 b).
 */
export const TYPES_EXPLIQUES_PAR_UNE_NOTE = Object.freeze(['alerte-au-dela-de-la-borne']);

/**
 * P4b-2 (décision 27 b) : de deux décisions `{ d, rang }` (rang = place dans decisions.json), la PLUS RÉCENTE par sa date
 * écrite (`le`) ; deux dates égales, ou une date illisible, → la plus loin dans decisions.json (l'ordre d'écriture).
 */
export function laPlusRecente(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(a.d?.le), tb = Date.parse(b.d?.le);
  if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta > tb ? a : b;
  return a.rang > b.rang ? a : b;
}

/**
 * La classe FINALE de chaque événement : la dernière décision s'applique ; la classe d'arrivée reste à côté.
 * P4b-2 (décision 27 b) : une note et une décision « nouvelle » (ou un rattachement) sur le même dépassement de borne :
 * LA PLUS RÉCENTE L'EMPORTE (ordre des dates écrites), dans les deux sens.
 */
export function appliquerLesDecisions(evenements, decisions = []) {
  const derniere = new Map();
  const notes = new Map();
  let rang = 0;
  for (const d of decisions) {
    if (d && (d.sorte === 'rattachement' || d.sorte === 'nouvelle')) derniere.set(d.evenement, { d, rang });
    if (d && d.sorte === 'note' && d.evenement) notes.set(d.evenement, { d, rang });
    rang += 1;
  }
  return evenements.map((ev) => {
    const n = notes.get(ev.id);
    const t = derniere.get(ev.id);
    const noteValable = Boolean(n) && ev.classe === 'a-expliquer' && TYPES_EXPLIQUES_PAR_UNE_NOTE.includes(ev.type);
    if (noteValable && laPlusRecente(n, t) === n) {
      const note = n.d;
      return { ...ev, classeFinale: 'a-part', causeFinale: null, decision: { le: note.le, sorte: 'note', cause: null, raison: note.raison, auteur: note.auteur ?? null } };
    }
    const d = t?.d;
    if (!d || ev.classe !== 'a-expliquer') return { ...ev, classeFinale: ev.classe, causeFinale: ev.cause ?? null, decision: null };
    return { ...ev, classeFinale: d.sorte === 'rattachement' ? 'connue' : 'nouvelle', causeFinale: d.sorte === 'rattachement' ? d.cause : null, decision: { le: d.le, sorte: d.sorte, cause: d.cause ?? null, raison: d.raison } };
  });
}

/**
 * Âge d'un « à expliquer » : « à expliquer depuis N jours (en retard) » au-delà de 24 h (CR-28 point 1) ; `court` (RC-23) :
 * « depuis 2 jours », pour une phrase qui dit déjà « à expliquer ».
 */
export function ageDUnAExpliquer(ev, maintenant) {
  const t = Date.parse(ev?.le);
  if (!Number.isFinite(t) || !Number.isFinite(maintenant)) return null;
  const heures = Math.max(0, (maintenant - t) / 3_600_000);
  const jours = Math.floor(heures / 24);
  const court = heures > 24 ? `depuis ${jours} jour${jours > 1 ? 's' : ''}` : 'depuis moins de 24 h';
  return { heures: Math.round(heures), jours, enRetard: heures > 24, texte: heures > 24 ? `à expliquer ${court} (en retard)` : `à expliquer ${court}`, court };
}

// --- Les épisodes (CR-27) et le décompte (D5, D6, CR-29) ---------------------------------------------------------

/**
 * Les ÉPISODES : une cause, du premier au dernier jour vu (CR-27 point 1). « reconnues par la liste » et « rattachées à
 * la main » restent séparées (point 3). Les nouvelles se comptent par CAUSE (CR-29 point 2) : la cause d'une rechute,
 * sinon « type|clé ». Entrée : des événements passés par appliquerLesDecisions.
 */
export function episodes(evenements) {
  const parCause = new Map();
  const nouvelles = new Map();
  const aPart = [];
  for (const ev of evenements) {
    // RC-7 : un dépassement expliqué par une note, compté à part (jamais un épisode connu, jamais une nouvelle).
    if (ev.classeFinale === 'a-part') {
      aPart.push({ id: ev.id, type: ev.type, cle: ev.cle ?? null, le: ev.le ?? null, raison: ev.decision?.raison ?? null, auteur: ev.decision?.auteur ?? null });
      continue;
    }
    if (ev.classeFinale === 'connue') {
      const id = ev.causeFinale ?? '?';
      const e = parCause.get(id) ?? { cause: id, premierJour: null, dernierJour: null, jours: new Set(), evenements: 0, reconnues: 0, rattachees: [] };
      const jour = jourDeParis(ev.le);
      e.jours.add(jour);
      e.premierJour = !e.premierJour || jour < e.premierJour ? jour : e.premierJour;
      e.dernierJour = !e.dernierJour || jour > e.dernierJour ? jour : e.dernierJour;
      e.evenements += 1;
      if (ev.decision) e.rattachees.push({ id: ev.id, raison: ev.decision.raison, le: ev.decision.le });
      else e.reconnues += 1;
      parCause.set(id, e);
    } else if (ev.classeFinale === 'nouvelle') {
      const cle = ev.causeFinale ?? ev.cause ?? `${ev.type}|${ev.cle ?? '-'}`;
      const n = nouvelles.get(cle) ?? { cle, rechute: false, evenements: [] };
      n.rechute ||= ev.rechute === true;
      n.evenements.push(ev.id);
      nouvelles.set(cle, n);
    }
  }
  return {
    connues: [...parCause.values()].map((e) => ({ ...e, jours: e.jours.size })).sort((a, b) => a.cause.localeCompare(b.cause)),
    nouvelles: [...nouvelles.values()],
    aPart
  };
}

/** Délai pour trancher les « à expliquer » après J14 (D5 : J14 + 48 h, séance B passée). */
export const DELAI_POUR_TRANCHER_JOURS = 2;

/**
 * LE DÉCOMPTE (conception § 5.3 corrigée par CR-3, CR-27 à CR-29). Entrées : les résumés des jours (fichiers du jour),
 * les décisions, la RECETTE, le jour de Paris d'aujourd'hui. Rend { etat, fenetre, nouvelles, aExpliquer,
 * joursNonObserves, relanceProposee, episodes, phrase } où etat ∈
 *   'pas-commencee' (J0 non écrit) | 'en-cours' | 'en-attente' (fini, des « à expliquer » restent avant J14 + 48 h) |
 *   'incomplete' (fini, un jour de la fenêtre sans fichier) | 'pas-tenue' | 'tenue'.
 * Une nouvelle (ou une rechute, ou un « à expliquer » non tranché à J14 + 48 h) → 'pas-tenue' ; relance proposée s'il
 * n'y en a pas encore eu, sinon « à décider avec vous » (PH-4c). « Tenue » = aucun de ces cas ET chaque jour observé.
 */
export function decompte({ jours = [], decisions = [], recette, aujourdhui }) {
  const j0 = jourZero(recette);
  if (!j0) return { etat: 'pas-commencee', fenetre: null, nouvelles: [], aExpliquer: [], aPart: [], joursNonObserves: [], relanceProposee: false, episodes: { connues: [], nouvelles: [], aPart: [] }, phrase: 'L’essai n’a pas commencé : son premier jour n’est pas encore fixé.' };
  const fin = finDeLaRecette(recette);
  const fenetre = { j0, debut: ajouterJours(j0, 1), fin };
  const dansLaFenetre = (jour) => estUnJour(jour) && jour >= fenetre.debut && jour <= fin;
  const parJour = new Map(jours.filter((r) => r && dansLaFenetre(r.jour)).map((r) => [r.jour, r]));
  const evenements = appliquerLesDecisions([...parJour.values()].flatMap((r) => (Array.isArray(r.evenements) ? r.evenements : [])).filter((e) => e && e.rodage !== true && e.classe !== 'info'), decisions);
  const aujourdhuiOuFin = estUnJour(aujourdhui) && aujourdhui < fin ? aujourdhui : fin;
  const joursNonObserves = [];
  for (let j = fenetre.debut; j <= aujourdhuiOuFin && estUnJour(j); j = ajouterJours(j, 1)) if (!parJour.has(j) && j < aujourdhui) joursNonObserves.push(j);
  const delaiPasse = estUnJour(aujourdhui) && joursEntre(fin, aujourdhui) > DELAI_POUR_TRANCHER_JOURS;
  const aExpliquer = evenements.filter((e) => e.classeFinale === 'a-expliquer');
  const compteesNouvelles = delaiPasse ? evenements.map((e) => (e.classeFinale === 'a-expliquer' ? { ...e, classeFinale: 'nouvelle', nonTranchee: true } : e)) : evenements;
  const ep = episodes(compteesNouvelles);
  const relances = Array.isArray(recette?.relances) ? recette.relances.length : 0;
  const fini = estUnJour(aujourdhui) && aujourdhui > fin;
  let etat;
  let phrase;
  // P4b-1 (RC-23) : des phrases en mots de Pierre (ni « panne(s) », ni « J14 + 48 h », ni « J0 non écrit »).
  const n = ep.nouvelles.length;
  const nAPart = ep.aPart.length;
  const aPartDit = nAPart ? ` ${nAPart > 1 ? `${nAPart} événements comptés` : '1 événement compté'} à part, expliqué${nAPart > 1 ? 's' : ''} par une note.` : '';
  if (n) {
    etat = 'pas-tenue';
    phrase = relances === 0 ? `${n > 1 ? `${n} pannes nouvelles : on les corrige` : '1 panne nouvelle : on la corrige'}, puis les deux semaines repartent (une seule fois).` : 'Une panne nouvelle pendant le second essai : à décider avec vous.';
  } else if (!fini) {
    etat = 'en-cours';
    phrase = `Essai en cours : jour ${Math.max(0, Math.min(recette.jours, joursEntre(j0, aujourdhui)))} sur ${recette.jours}.`;
  } else if (aExpliquer.length) {
    etat = 'en-attente';
    phrase = `${aExpliquer.length > 1 ? `${aExpliquer.length} événements restent` : '1 événement reste'} à expliquer, au plus tard deux jours après la fin de l’essai.`;
  } else if (joursNonObserves.length) {
    etat = 'incomplete';
    phrase = `${joursNonObserves.length > 1 ? `${joursNonObserves.length} jours de l’essai n’ont` : '1 jour de l’essai n’a'} pas de journal : l’essai n’est jamais dit « tenu » sans l’avoir observé.`;
  } else {
    etat = 'tenue';
    phrase = `Essai tenu : aucune panne nouvelle, toutes d’une cause connue au départ.${aPartDit}`;
  }
  return { etat, fenetre, nouvelles: ep.nouvelles, aExpliquer: delaiPasse ? [] : aExpliquer.map((e) => e.id), aPart: ep.aPart, joursNonObserves, relanceProposee: etat === 'pas-tenue' && relances === 0, episodes: ep, phrase };
}

// --- La vérification de J0 (CR-30 : trois issues) ------------------------------------------------------------------

/**
 * Ce qui n'est pas vert à J0, en pseudo-événements : chaque étape pas « ok » des 30 dernières passes, chaque alerte
 * posée, chaque contrôle non vert et chacun de ses constats, l'état de FotMob s'il n'est pas « ok ». Pur.
 */
export function cequiNestPasVert({ refresh, controle, sante, maintenant }) {
  const out = [];
  const passes = Array.isArray(refresh?.history) ? refresh.history.slice(0, 30) : [];
  const vues = new Set();
  for (const p of passes) {
    for (const e of p?.steps ?? []) {
      if (!e?.key || e.status === 'ok' || e.status === 'skipped') continue;
      const texte = `${e.key} : ${String(e.summary ?? '').slice(0, 300)}`;
      const cle = `${e.key}|${e.status}|${texte.replace(/\d/g, '0')}`;
      if (vues.has(cle)) continue;
      vues.add(cle);
      out.push({ type: e.status === 'error' ? 'etape-en-echec' : 'etape-en-alerte', cle: e.key, texte, details: { statut: e.status, passe: p.id ?? null } });
    }
  }
  for (const [cle, v] of Object.entries(refresh?.alerts ?? {})) {
    if (v === null || v === undefined) continue;
    out.push({ type: 'alerte-posee', cle, texte: `Alerte « ${cle} » posée.`, details: { signature: signatureDeLAlerte(v), nombres: nombresDeLAlerte(v) } });
  }
  for (const c of Array.isArray(controle?.controles) ? controle.controles : []) {
    // P4b-1 (RC-3) : un contrôle en panne ou pas fait est un point de J0 (controle-couleur vers son statut).
    if (c?.cle && c.classe !== 'info' && !estUneCouleurDeControle(c.statutLe)) {
      out.push({ type: 'controle-couleur', cle: c.cle, texte: `Contrôle « ${c.libelle ?? c.cle} » : ${String(c.statutLe).slice(0, 40)}.`, details: { de: null, vers: String(c.statutLe) } });
      continue;
    }
    if (!c?.cle || c.classe === 'info' || (c.statutLe !== 'orange' && c.statutLe !== 'rouge')) continue;
    for (const k of Array.isArray(c.constats) ? c.constats : []) {
      if (!k?.id || k.classe === 'info') continue;
      out.push({ type: 'constat-nouveau', cle: k.id, texte: `Constat (${c.cle}) : ${String(k.texte ?? '').slice(0, 160)}`, details: { controle: c.cle, classe: k.classe ?? null, league: k.league ?? null } });
    }
  }
  const f = etatFotmobLu({ sante, refresh, maintenant });
  if (f.etat !== 'ok') out.push({ type: 'fotmob', cle: f.etat, texte: `FotMob : ${f.etat}${f.raison ? ` (${f.raison})` : ''}`, details: { vers: f.etat, ...f } });
  return out;
}

/** La clé d'un point de J0, pour « laissé ouvert à J0, avec l'accord de Pierre ». */
export const cleDuPointDeJ0 = (x) => `${x.type}|${x.cle}`;

/**
 * --verifier-les-causes (CR-30 point 3 : TROIS issues) : chaque point est 'office' (une cause le reconnaît), 'a-la-main'
 * (aucune d'office, mais une cause écrite « à la main » peut le recevoir, CR-22 point 3), 'ouvert' (laissé ouvert à J0
 * avec l'accord de Pierre, noté dans decisions.json) ou 'trou'. Code 0 sans trou, 1 sinon. Rend aussi les niveaux à
 * écrire au lot 1b (le plus récent de chaque borne) et les championnats des constats orange de chiffres-non-publies.
 */
export function verifierLesCauses({ refresh, controle, sante, maintenant, ouverts = [], causes = CAUSES_CONNUES }) {
  const points = cequiNestPasVert({ refresh, controle, sante, maintenant });
  const contexte = { verification: true, controle };
  const ouvertes = new Set(ouverts);
  const res = { office: [], aLaMain: [], ouverts: [], trous: [] };
  for (const p of points) {
    const c = classerUnEvenement(p, contexte, causes);
    const cle = cleDuPointDeJ0(p);
    if (c.classe === 'connue' || c.classe === 'nouvelle') res.office.push({ cle, cause: c.cause, texte: p.texte, rechute: c.rechute === true });
    else {
      const main = causes.filter((x) => peutEtreRattache(p, x).ok).map((x) => x.id);
      if (main.length) res.aLaMain.push({ cle, causes: main, texte: p.texte });
      else if (ouvertes.has(cle)) res.ouverts.push({ cle, texte: p.texte });
      else res.trous.push({ cle, texte: p.texte, raison: c.raison ?? null });
    }
  }
  const niveaux = {};
  for (const c of causes) {
    for (const r of c.reconnait?.etapes ?? []) {
      if (!r.nombre?.borne || niveaux[r.nombre.borne] !== undefined) continue;
      const p = points.find((x) => x.cle === r.cle && r.motif?.test(x.texte));
      if (p) niveaux[r.nombre.borne] = lireUnNombre(p.texte, r.nombre.motif);
    }
    for (const r of c.reconnait?.alertes ?? []) {
      if (!r.borne || niveaux[r.borne] !== undefined) continue;
      const p = points.find((x) => x.type === 'alerte-posee' && x.cle === r.cle);
      if (p && Number.isFinite(p.details?.nombres?.[r.nombre])) niveaux[r.borne] = p.details.nombres[r.nombre];
    }
  }
  const championnats = [...new Set(points.filter((p) => p.type === 'constat-nouveau' && ['jaunes-non-releves', 'corners-non-releves', 'tirs-non-releves', 'zeros-non-releves'].includes(p.details.controle)).map((p) => p.details.league).filter(Boolean))].sort();
  return { ...res, niveaux, championnats, code: res.trous.length ? 1 : 0, points: points.length };
}

// --- Le résumé du jour : coût de la veille, appels au coup d'envoi (CR-20 point 4, CR-21 point 3) ------------------

/** Une date AVEC son heure (« AAAA-MM-JJTHH:MM… ») : jamais une date seule, qui serait une estimation (décision 24 b). */
const AVEC_HEURE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** L'instant du coup d'envoi d'un match du calendrier (champs lus : kickoff, utcTime, utcDate, date + time), ou null sans heure écrite. */
export function instantDuCoupDEnvoi(m) {
  const brut = m?.kickoff ?? m?.utcTime ?? m?.utcDate ?? (m?.date && m?.time ? `${m.date}T${m.time}` : null);
  if (typeof brut !== 'string' || !AVEC_HEURE.test(brut)) return null;
  const t = Date.parse(brut);
  return Number.isFinite(t) ? t : null;
}

/**
 * Le coût de la veille (CR-21 point 3) : les matchs dont le coup d'envoi tombe dans un trou, et parmi eux ceux sans
 * appel « coup-d-envoi » au journal des appels Claude. DÉCISION 24 b : compté SEULEMENT si chaque match du calendrier lu
 * porte une heure écrite ; sinon (le cas des vraies données le 17/11 : aucune heure) { compte: false, texte:
 * COUT_NON_COMPTE } — jamais un compte partiel, jamais une estimation depuis la date seule.
 */
export function coutDeLaVeille({ trous = [], matchs = [], appels = [] }) {
  const sansHeureTotal = matchs.filter((m) => instantDuCoupDEnvoi(m) === null).length;
  if (!matchs.length || sansHeureTotal > 0) return { compte: false, texte: COUT_NON_COMPTE, matchsDansUnTrou: null, sansAnalyseAuCoupDEnvoi: null, exemples: [], sansHeure: sansHeureTotal };
  const plages = trous.map((t) => [Date.parse(t.de), Date.parse(t.a)]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);
  const appelsCoupDEnvoi = appels.filter((a) => (a?.appel?.type ?? a?.type) === 'coup-d-envoi');
  const sansHeure = matchs.filter((m) => instantDuCoupDEnvoi(m) === null).length;
  const dansUnTrou = matchs.filter((m) => {
    const t = instantDuCoupDEnvoi(m);
    return t !== null && plages.some(([a, b]) => t >= a && t <= b);
  });
  const nom = (m) => `${m.homeTeam ?? m.home ?? '?'} – ${m.awayTeam ?? m.away ?? '?'}`;
  // Un match sans identifiant ne peut pas être relié à un appel : compté « sans analyse » (jamais une analyse supposée).
  const sansAppel = dansUnTrou.filter((m) => !(m.id ?? m.matchKey) || !appelsCoupDEnvoi.some((a) => String(a?.match ?? a?.appel?.match ?? '').includes(String(m.id ?? m.matchKey))));
  return { compte: true, texte: `${dansUnTrou.length} match(s) commencé(s) pendant un trou, dont ${sansAppel.length} sans analyse au coup d’envoi`, matchsDansUnTrou: dansUnTrou.length, sansAnalyseAuCoupDEnvoi: sansAppel.length, exemples: sansAppel.slice(0, 5).map(nom), sansHeure };
}

/**
 * CR-20 point 4 : « 0 appel coup-d-envoi un jour de matchs » se juge ici, hors du serveur ; « à expliquer » seulement
 * si le plafond du jour n'était pas atteint.
 */
export function appelsAuCoupDEnvoi({ matchsDuJour = 0, appels = [], plafondAtteint = false }) {
  const n = appels.filter((a) => (a?.appel?.type ?? a?.type) === 'coup-d-envoi').length;
  if (matchsDuJour > 0 && n === 0) return { n, classe: plafondAtteint ? 'connue' : 'a-expliquer', texte: plafondAtteint ? 'Aucune analyse au coup d’envoi : plafond du jour atteint.' : `Aucune analyse au coup d’envoi alors que ${matchsDuJour} match(s) avaient lieu.` };
  return { n, classe: 'info', texte: `${n} analyse(s) au coup d’envoi.` };
}

// --- L'empreinte des causes (CR-19) ----------------------------------------------------------------------------------

/** Les trois fichiers de l'empreinte, dans server/src/data/recette/. */
export const FICHIERS_DE_L_EMPREINTE = Object.freeze(['causesConnues.js', 'classerLesEvenements.js', 'journalWindows.js']);

/** Le texte normalisé comme engineVersions.js:403 : BOM retiré, CRLF → LF. */
/** Le BOM en tête (construit par String.fromCharCode : les outils d'écriture changent les codes Unicode, consigne § 7 règle 9). */
const DEBUT_BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);

export const normaliserLeTexte = (texte) => String(texte ?? '').replace(DEBUT_BOM, '').replace(/\r\n/g, '\n');

/**
 * L'empreinte (sha1) des trois fichiers normalisés : sha1 de « nom\n<sha1 du texte normalisé>\n » dans l'ordre de
 * FICHIERS_DE_L_EMPREINTE. `textes` : { nom: texte }. null si un des trois manque.
 */
export function empreinteDesTextes(textes) {
  const h = crypto.createHash('sha1');
  for (const nom of FICHIERS_DE_L_EMPREINTE) {
    if (typeof textes?.[nom] !== 'string') return null;
    h.update(`${nom}\n${crypto.createHash('sha1').update(normaliserLeTexte(textes[nom]), 'utf8').digest('hex')}\n`);
  }
  return h.digest('hex');
}
