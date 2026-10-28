/**
 * claudeUsageLedger.js — le JOURNAL de tous les appels à Claude (étape 4 du plan).
 * -----------------------------------------------------------------------
 * Un appel = une ligne, écrite au point de passage commun, au moment où
 * l'appel se termine, réussi ou non : claudeCodeClient.js (callClaudeCode,
 * quota de l'abonnement Max) et anthropicClient.js (API Anthropic à la clé,
 * facturée à part). Chaque ligne dit l'heure, le type (avant-match d'avance,
 * avant-match au coup d'envoi, reprise après changement de onze, revue
 * d'après-match, clic manuel, autre), le match, les tokens (entrée, écriture
 * en cache, lecture en cache, sortie) et l'équivalent au tarif de l'API.
 * Depuis l'étape 41, une analyse de match dit aussi la forme de la fiche
 * envoyée (compacte ou ancienne) et la taille, en caractères, des consignes et
 * du message : la mesure RÉELLE du gain de l'étape 41 se lit ici, après la
 * mise en service (claudeBudget.js en tire la moyenne par forme).
 *
 * Il compte ce qu'aucun fichier ne gardait : l'analyse d'avance remplacée par
 * celle du coup d'envoi (gardée dans `earlierAnalysis`, SANS son usage) et la
 * reprise après changement de onze, qui écrase l'usage de la précédente. Le
 * 04/10/2026, le compteur du plafond disait 39 appels pour 29 enregistrés.
 *
 * OÙ : data/runtime/journal-claude/AAAA-MM-JJ.json (un fichier par jour de
 * Paris, le même jour que le compteur du plafond) ; les appels de l'API à la
 * clé dans AAAA-MM-JJ.api-anthropic.json, à côté. Forme :
 *   { version, jour, canal, majLe, totaux, appels: [...] }
 * En JSON plutôt que dans la base, parce que :
 *   - la base n'accepte aucune écriture pendant un import ni pendant une
 *     passe tenue par un autre processus (règle WAL, cf. enregistreurs/file.js) :
 *     la ligne attendrait en mémoire, perdue si le serveur s'arrête, et le
 *     compteur du plafond (JSON, écrit tout de suite) et le journal
 *     divergeraient de nouveau — ce que cette étape doit supprimer ;
 *   - ce compteur vit à côté (auto-ai-analysis-status.json) et s'écrit de la
 *     même façon (utils/atomicJson.js : renommage d'un bloc, nouvelles
 *     tentatives quand OneDrive tient le fichier) ;
 *   - un seul écrivain pour le quota de l'abonnement : le serveur (aucun
 *     script n'appelle Claude Code). L'API à la clé peut aussi être appelée par
 *     scripts/populate-team-profiles.mjs, lancé à la main : ses lignes vont
 *     dans le fichier « api-anthropic », jamais dans celui du quota ;
 *   - c'est petit : au plus ~200 lignes par jour (plafond de 150 + clics), et
 *     seul le fichier du jour est réécrit — les jours passés ne bougent plus ;
 *   - il part dans la sauvegarde de chaque nuit avec data/runtime (étape 1).
 * Les totaux du jour sont tenus dans son fichier à chaque écriture : l'état du
 * budget (core/ai/claudeBudget.js) les lit sans recompter les jours passés.
 *
 * JAMAIS DE PERTE, JAMAIS D'APPEL EN ÉCHEC À CAUSE DU JOURNAL : une écriture
 * ratée (fichier tenu au-delà des nouvelles tentatives, fichier illisible)
 * garde la ligne en mémoire, comptée dans les lectures, et la réécrit à
 * l'appel suivant ou à la reprise programmée. Un fichier du jour illisible
 * n'est jamais écrasé : l'état du budget le dit.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { jourParis } from './autoAiAnalysisRepository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DOSSIER_JOURNAL = path.resolve(__dirname, '../../../data/runtime/journal-claude');

const VERSION = 1;

/**
 * Les types d'appel, dans l'ordre d'affichage. Étape 42 (22/10/2026) : le bulletin du matin et le bilan de la
 * semaine sont deux types de plus — des appels de l'actualisation (un par jour, un par semaine), comptés comme
 * les analyses automatiques. Étape 26 (partie D, 28/10/2026) : le résumé du mois de la boucle de correction, un appel
 * de l'actualisation une fois par mois, compté lui aussi sur le plafond (décision 12 de l'orchestrateur).
 */
export const TYPES_APPEL = Object.freeze({
  avance: "Avant-match d'avance",
  'coup-d-envoi': "Avant-match au coup d'envoi",
  reprise: 'Reprise après changement de onze',
  revue: "Revue d'après-match",
  bulletin: 'Bulletin du jour',
  'bilan-semaine': 'Bilan de la semaine',
  'resume-mois': 'Résumé du mois (boucle de correction)',
  manuel: 'Clic manuel',
  autre: 'Autre'
});
/**
 * Ceux que fait l'actualisation automatique — ceux que compte le plafond quotidien (les analyses de match, et depuis
 * l'étape 42 le bulletin du jour et le bilan de la semaine : un appel de l'un ou de l'autre prend une place sur les 150 ;
 * depuis l'étape 26 le résumé du mois, de même : le contrôle « compteur du plafond = appels automatiques du journal » de
 * claudeBudget.js reste juste).
 */
export const TYPES_AUTOMATIQUES = Object.freeze(['avance', 'coup-d-envoi', 'reprise', 'revue', 'bulletin', 'bilan-semaine', 'resume-mois']);

/** Les deux points de passage. Seul le premier entre dans le budget (quota de l'abonnement). */
export const CANAUX = Object.freeze({
  'claude-code': "Claude Code — quota de l'abonnement Max",
  'api-anthropic': 'API Anthropic à la clé — facturée à part, hors budget'
});

const SUFFIXES = { 'claude-code': '', 'api-anthropic': '.api-anthropic' };
const NOM_FICHIER = /^(\d{4}-\d{2}-\d{2})(\.api-anthropic)?\.json$/;

export const fichierDuJour = (jour, canal = 'claude-code') => path.join(DOSSIER_JOURNAL, `${jour}${SUFFIXES[canal] ?? ''}.json`);

// ------------------------------------------------------------ les tokens
const entier = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};

/**
 * Les tokens d'une réponse (champ `usage` du CLI Claude Code comme de l'API
 * Messages, mêmes noms) : entrée, écriture en cache, lecture en cache,
 * sortie, et leur total. `null` quand la réponse n'en dit rien (appel sans
 * réponse, sortie illisible) : inconnus, jamais comptés zéro en silence.
 */
export function tokensDe(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const t = {
    entree: entier(usage.input_tokens),
    ecritureCache: entier(usage.cache_creation_input_tokens),
    lectureCache: entier(usage.cache_read_input_tokens),
    sortie: entier(usage.output_tokens)
  };
  t.total = t.entree + t.ecritureCache + t.lectureCache + t.sortie;
  return t;
}

const arrondiUsd = (v) => Math.round(v * 1e6) / 1e6;
const tokensVides = () => ({ entree: 0, ecritureCache: 0, lectureCache: 0, sortie: 0, total: 0 });
const bilanVide = () => ({ appels: 0, ok: 0, echecs: 0, sansTokens: 0, tokens: tokensVides(), equivalentApiUsd: 0 });

function ajouter(bilan, ligne) {
  bilan.appels++;
  if (ligne.statut === 'ok') bilan.ok++;
  else bilan.echecs++;
  if (ligne.tokens) for (const k of Object.keys(bilan.tokens)) bilan.tokens[k] += entier(ligne.tokens[k]);
  else bilan.sansTokens++;
  if (Number.isFinite(ligne.equivalentApiUsd)) bilan.equivalentApiUsd = arrondiUsd(bilan.equivalentApiUsd + ligne.equivalentApiUsd);
}

/** Totaux d'une liste de lignes : en tout, et par type d'appel. */
export function totauxDe(appels) {
  const totaux = { ...bilanVide(), parType: {} };
  for (const ligne of appels ?? []) {
    ajouter(totaux, ligne);
    ajouter((totaux.parType[ligne.type] ??= bilanVide()), ligne);
  }
  return totaux;
}

// ------------------------------------------------------------- une ligne
let sequence = 0;

/** Forme de la fiche envoyée à l'IA d'analyse de match (étape 41) : notée pour comparer les tokens forme par forme. */
export const FICHES_JOURNAL = Object.freeze(['compacte', 'ancienne']);

const entierOuNull = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/**
 * La ligne d'un appel. `appel` vient de l'appelant : { type, detail?, match?,
 * mode?, fiche?, taille? } — `match` : { matchId, home, away, league } ;
 * `fiche` : 'compacte' | 'ancienne' (étape 41) ; `taille` : { consignes,
 * message } en caractères. Un type inconnu ou absent devient « autre » :
 * l'appel est compté quand même.
 */
function ligneDe({ canal, appel, modele, statut, erreur, usage, coutUsd, debut, fin }) {
  const finMs = Number.isFinite(fin) ? fin : Date.now();
  const debutMs = Number.isFinite(debut) ? debut : finMs;
  const m = appel?.match;
  const taille = appel?.taille && typeof appel.taille === 'object' ? { consignes: entierOuNull(appel.taille.consignes), message: entierOuNull(appel.taille.message) } : null;
  return {
    id: `${new Date(finMs).toISOString()}-${process.pid}-${++sequence}-${crypto.randomBytes(3).toString('hex')}`,
    at: new Date(finMs).toISOString(),
    jour: jourParis(new Date(finMs)),
    debut: new Date(debutMs).toISOString(),
    dureeMs: Math.max(0, finMs - debutMs),
    canal: CANAUX[canal] ? canal : 'claude-code',
    type: TYPES_APPEL[appel?.type] ? appel.type : 'autre',
    detail: appel?.detail ? String(appel.detail).slice(0, 120) : null,
    match: m ? { matchId: m.matchId ?? null, home: m.home ?? null, away: m.away ?? null, league: m.league ?? null } : null,
    mode: appel?.mode === 'econome' || appel?.mode === 'normal' ? appel.mode : null,
    // Étape 41 : la forme de la fiche et la taille de ce qui est parti (caractères).
    fiche: FICHES_JOURNAL.includes(appel?.fiche) ? appel.fiche : null,
    taille: taille && (taille.consignes !== null || taille.message !== null) ? taille : null,
    modele: modele ? String(modele).slice(0, 80) : null,
    statut: statut === 'ok' ? 'ok' : 'echec',
    erreur: erreur ? String(erreur).slice(0, 300) : null,
    tokens: tokensDe(usage),
    equivalentApiUsd: Number.isFinite(Number(coutUsd)) && coutUsd !== null ? arrondiUsd(Number(coutUsd)) : null
  };
}

// --------------------------------------------------------------- écriture
/** Lignes pas encore écrites (fichier tenu ou illisible) : comptées dans les lectures, réécrites plus tard. */
const enAttente = [];
const etat = { derniereEcriture: null, erreur: null };
let reprise = null;
const REPRISES_MS = [5_000, 20_000, 60_000, 300_000];
let essaisReprise = 0;

const cleFichier = (ligne) => `${ligne.jour}|${ligne.canal}`;

function lireFichier(jour, canal) {
  const brut = readJsonFile(fichierDuJour(jour, canal), null);
  if (brut === null) return { appels: [] };
  if (typeof brut !== 'object' || !Array.isArray(brut.appels)) {
    throw new Error(`${path.basename(fichierDuJour(jour, canal))} a une forme inattendue : il n'est pas réécrit.`);
  }
  return brut;
}

/** Écrit tout ce qui attend, fichier par fichier ; ce qui ne passe pas reste en attente. */
function ecrireEnAttente() {
  const groupes = new Map();
  for (const ligne of enAttente) {
    const cle = cleFichier(ligne);
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(ligne);
  }
  let toutEcrit = true;
  for (const lignes of groupes.values()) {
    const { jour, canal } = lignes[0];
    try {
      const existant = lireFichier(jour, canal);
      const ids = new Set(existant.appels.map((a) => a.id));
      const appels = [...existant.appels, ...lignes.filter((l) => !ids.has(l.id))].sort((a, b) => String(a.at).localeCompare(String(b.at)));
      const totaux = totauxDe(appels);
      writeJsonAtomic(fichierDuJour(jour, canal), { version: VERSION, jour, canal, majLe: new Date().toISOString(), totaux, appels });
      for (const l of lignes) enAttente.splice(enAttente.indexOf(l), 1);
      // La version qu'on vient d'écrire devient la dernière lue : si le fichier
      // devient illisible ensuite (OneDrive), c'est elle qui compte.
      garderEnCache(jour, canal, { mtimeMs: mtimeDe(fichierDuJour(jour, canal)), appels, totaux });
      etat.derniereEcriture = new Date().toISOString();
    } catch (error) {
      toutEcrit = false;
      etat.erreur = { at: new Date().toISOString(), message: String(error?.message ?? error).slice(0, 300) };
      console.warn(`[journal Claude] écriture impossible (${etat.erreur.message}) : ${lignes.length} ligne(s) gardée(s) en mémoire, nouvel essai plus tard.`);
    }
  }
  if (toutEcrit) {
    etat.erreur = null;
    essaisReprise = 0;
  } else {
    programmerReprise();
  }
  return toutEcrit;
}

function programmerReprise() {
  if (reprise) return;
  const attente = REPRISES_MS[Math.min(essaisReprise, REPRISES_MS.length - 1)];
  essaisReprise++;
  reprise = setTimeout(() => {
    reprise = null;
    if (enAttente.length) ecrireEnAttente();
  }, attente);
  reprise.unref?.();
}

/**
 * Journalise un appel terminé. Ne lève jamais : une écriture ratée garde la
 * ligne en mémoire (cf. en-tête). Rend la ligne.
 *
 * @param {{ canal: 'claude-code'|'api-anthropic', appel?: object, modele?: string,
 *           statut: 'ok'|'echec', erreur?: string, usage?: object, coutUsd?: number,
 *           debut?: number, fin?: number }} entree
 */
export function journaliserAppel(entree) {
  const ligne = ligneDe(entree);
  enAttente.push(ligne);
  try {
    ecrireEnAttente();
  } catch (error) {
    console.warn(`[journal Claude] ${error.message}`);
  }
  return ligne;
}

// ---------------------------------------------------------------- lecture
/** Dernière version lue (ou écrite) de chaque fichier : relu seulement s'il a changé. */
const cache = new Map();
const RELECTURE_RATEE_MS = 60_000;
function garderEnCache(jour, canal, valeur) {
  cache.set(`${jour}|${canal}`, valeur);
}

function mtimeDe(fichier) {
  try {
    return fs.statSync(fichier).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Le journal d'un jour de Paris pour un canal : ses appels (lignes en attente
 * d'écriture comprises), ses totaux, et le problème de lecture s'il y en a
 * un. Un fichier illisible rend la dernière version lue (jamais un jour vide
 * en silence) avec le problème.
 */
export function lireJour(jour, { canal = 'claude-code' } = {}) {
  const fichier = fichierDuJour(jour, canal);
  const cle = `${jour}|${canal}`;
  const mtimeMs = mtimeDe(fichier);
  let ecrit = cache.get(cle);
  let probleme = null;
  // Un fichier illisible n'est pas relu à chaque appel (chaque lecture ratée
  // attend ~1,5 s) : la même version ratée est redonnée pendant une minute.
  const dejaRate = ecrit?.echec && ecrit.echec.mtimeMs === mtimeMs && Date.now() - ecrit.echec.at < RELECTURE_RATEE_MS;
  if (dejaRate) {
    probleme = ecrit.echec.message;
  } else if (!ecrit || ecrit.mtimeMs !== mtimeMs) {
    try {
      const brut = lireFichier(jour, canal);
      ecrit = { mtimeMs, appels: brut.appels, totaux: brut.version === VERSION && brut.totaux ? brut.totaux : null };
      garderEnCache(jour, canal, ecrit);
    } catch (error) {
      probleme = String(error?.message ?? error).slice(0, 300);
      // La dernière version bonne reste celle qui compte (jamais un jour vide en silence).
      ecrit = { ...(ecrit ?? { mtimeMs: null, appels: [], totaux: null }), echec: { mtimeMs, at: Date.now(), message: probleme } };
      garderEnCache(jour, canal, ecrit);
    }
  }
  const ids = new Set(ecrit.appels.map((a) => a.id));
  const attente = enAttente.filter((l) => l.jour === jour && l.canal === canal && !ids.has(l.id));
  const appels = attente.length ? [...ecrit.appels, ...attente] : ecrit.appels;
  return {
    jour,
    canal,
    fichier,
    existe: mtimeMs !== null,
    appels,
    totaux: !attente.length && ecrit.totaux ? ecrit.totaux : totauxDe(appels),
    enAttente: attente.length,
    probleme
  };
}

/** Le plus ancien appel journalisé (ISO), ou null si le journal est vide : « tenu depuis ». */
export function debutDuJournal() {
  let noms = [];
  try {
    noms = fs.readdirSync(DOSSIER_JOURNAL).filter((n) => NOM_FICHIER.test(n)).sort();
  } catch {
    noms = [];
  }
  const jours = [...new Set(noms.map((n) => NOM_FICHIER.exec(n)[1]))];
  const enMemoire = enAttente.map((l) => l.at).sort()[0] ?? null;
  for (const jour of jours) {
    const premiers = Object.keys(CANAUX)
      .map((canal) => lireJour(jour, { canal }).appels[0]?.at ?? null)
      .filter(Boolean)
      .sort();
    if (premiers.length) return enMemoire && enMemoire < premiers[0] ? enMemoire : premiers[0];
  }
  return enMemoire;
}

/** L'état de l'écriture : lignes en attente, dernière écriture, dernière erreur. */
export function etatEcriture() {
  return { enAttente: enAttente.length, derniereEcriture: etat.derniereEcriture, erreur: etat.erreur, dossier: DOSSIER_JOURNAL };
}

/** Pour les tests : tout oublier (mémoire seulement, jamais les fichiers). */
export const __testing = {
  oublier() {
    enAttente.length = 0;
    cache.clear();
    clearTimeout(reprise);
    reprise = null;
    essaisReprise = 0;
    Object.assign(etat, { derniereEcriture: null, erreur: null });
  },
  enAttente: () => enAttente.length
};
