/**
 * journalDeLaRecette.js — LE JOURNAL DE LA RECETTE GÉNÉRALE (étape 47 du plan, lot 1, passe P2, 17/11/2026).
 * -----------------------------------------------------------------------
 * Une boucle à part, démarrée par server.js (un import() dynamique, après enregistrerLancements), qui REGARDE l'appli
 * sans jamais rien y changer : toutes les 10 min, elle relit les fichiers d'exécution (passes, alertes, contrôle du
 * jour, FotMob, sauvegarde, restauration d'essai, appels Claude) et l'état du direct en mémoire, et note ce qui a
 * changé. Elle sert à une seule question : pendant J1-J14, y a-t-il eu une panne que la liste des causes ne connaît pas ?
 *
 * CE QU'ELLE NE FAIT JAMAIS (consigne du lot 1, § 7) :
 *   - lever : `async function tour()`, appelée seulement par `tic` (Promise.resolve().then(tour).catch(noterSansLever)),
 *     `noterSansLever` a son propre try/catch ; les lectures sont asynchrones, à UNE tentative, et une lecture ratée
 *     garde la valeur d'avant (jamais mise en cache) ; le journal Windows et git passent par execFile, dont le rappel
 *     n'est appelé qu'à « close » et qui ne rejette jamais ici (CR-17) ;
 *   - ouvrir la base, ou passer par le lecteur de l'état de l'actualisation (refreshStatusRepository.js:52-73, qui
 *     RENOMME le fichier de Pierre après une lecture ratée), par le lecteur à reprises d'atomicJson.js (il attend 1,5 s
 *     en synchrone), par sourceHealth.js ou par l'état des enregistreurs (enregistreurs/etat.js:154) (CR-16) : ses
 *     lecteurs sont les siens (un essai de lecture du code vérifie que leurs noms n'apparaissent pas ici) ;
 *   - écrire ailleurs que dans les chemins donnés par cheminsDeLaRecette (CR-46, § 7 règle 13) ; les défauts
 *     (%USERPROFILE%\CoteMaster\recette hors OneDrive, et server/data/runtime/journal-recette pour les fichiers du jour)
 *     ne sont construits QUE par cheminsParDefaut, et refusés sous essai, sous os.tmpdir() ; dans le bac : <bac>\recette ;
 *   - lancer autre chose que wevtutil (journalWindows.js) et deux formes de git EN LECTURE (`diff --quiet` et
 *     `log -1 --format=%s`), et seulement au premier tour d'un nouveau processus ; aucun appel git dans le bac ni sans
 *     .git (§ 7 règle 14) ;
 *   - poser un écouteur autre que `uncaughtExceptionMonitor` et `exit` (CR-14) : ceux-là ne changent pas le
 *     comportement de Node ; ils écrivent la marque d'arrêt en synchrone, sous try/catch.
 *
 * OÙ ELLE ÉCRIT (cheminsDeLaRecette) :
 *   racine hors OneDrive : battement.json (à chaque tour : pid, dernier tour, compteurs du jour, blocageMaxMs),
 *     dernier-etat.json (le dernier état vu, CR-47), dernier-arret.json (la marque d'arrêt, CR-14) ; elle LIT
 *     mise-en-service.json (l'annonce, écrite par recette.mjs, CR-2) ;
 *   dossier du jour : AAAA-MM-JJ.json (jour de PARIS ; le résumé du jour et ses événements), écrit seulement à un
 *     événement, à une passe finie et au changement de jour, au plus une fois par tour (CR-46) ; decisions.json n'est écrit que par
 *     recette.mjs, jamais ici.
 *
 * LES ÉVÉNEMENTS (conception § 5.3, onze signaux) : { id, le, type, signal, cle, texte, details, classe, cause, rodage }.
 *   id = « <jour>|<type>|<clé>|<heure> » (CR-47), jour de Paris et heure UTC de `le`. Classe figée à l'arrivée :
 *   'info' (pas un signal de panne : passe vue, alerte levée, sauvegarde faite…), 'connue', 'a-expliquer', 'nouvelle'.
 *   Le journal classe lui-même les démarrages (S11), les trous (S10) et le premier démarrage ; le reste passe par
 *   `classer` (injecté ; par défaut « à expliquer » : le classeur de la liste des causes arrive en P3).
 *   Pendant le rodage, tout est noté et marqué `rodage: true` ; après J14 (croisière), un résumé seul, sans événement.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomic } from '../../utils/atomicJson.js';
import { RECETTE, jourDeParis, phaseDuJour, jourZero, ajouterJours, debutDuJourDeParis } from './calendrierDeLaRecette.js';
import { borneDeLaRequete, lireJournalWindows, expliquerLeTrou, arretsEtDemarrages, veilleDansLeTrou } from './journalWindows.js';
import { fichiersLus, cheminsParDefaut } from './cheminsDeLaRecette.js';
import { CAUSES_CONNUES } from './causesConnues.js';
import { NON_SURVEILLE, depassementDeLaPanneFotmob, classerSansListe, creerClasseur, estInfoPermise, nombresDeLAlerte, signatureDeLAlerte, etatFotmobLu, depassementDeLAlerte, empreinteDesTextes, FICHIERS_DE_L_EMPREINTE } from './classerLesEvenements.js';

// P3 (17/11) : les chemins sont sortis dans cheminsDeLaRecette.js (recette.mjs ne peut pas importer ce module, qui
// importe liveWatch.js puis la base) ; les signatures, les nombres et l'état de FotMob dans classerLesEvenements.js
// (dans l'empreinte des causes, CR-19). Ils sont ré-exportés ici tels quels.
export { cheminsDeLaRecette, cheminsParDefaut, fichiersLus } from './cheminsDeLaRecette.js';
export { stable, CHAMPS_VOLATILS, signatureDeLAlerte, nombresDeLAlerte, etatFotmobLu, ERREURS_FOTMOB_PANNE, ETAPES_FOTMOB, NON_SURVEILLE } from './classerLesEvenements.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));

// --- Les réglages (tous nommés : les poses les visent) ------------------------------------------------------------

/** Un tour toutes les 10 min ; le premier à +4 min (CR-55 point 2 : +2 min est l'instant du direct et de l'IA). */
export const INTERVALLE_MS = 10 * 60_000;
export const PREMIER_TOUR_MS = 4 * 60_000;
/** S10 : plus de 25 min sans tour, même processus = un trou (CR-3 point 2). */
export const SEUIL_DU_TROU_MS = 25 * 60_000;
/** S11 : au plus 5 min entre la fin d'un processus et le démarrage du suivant = « redémarrage rapide ». */
export const REDEMARRAGE_RAPIDE_MS = 5 * 60_000;
/** S6 : aucune passe depuis plus de 2 × 180 min + 1 h de TEMPS ÉVEILLÉ (CR-21 point 2). */
export const SEUIL_SANS_PASSE_MS = (2 * 180 + 60) * 60_000;
/** S7 : aucune sauvegarde depuis plus de 36 h de TEMPS ÉVEILLÉ (CR-21 point 2). */
export const SEUIL_SANS_SAUVEGARDE_MS = 36 * 3_600_000;
/** T-J2 : une passe de plus de 2 h qui recouvre un trou est « figée par la veille ». */
export const PASSE_FIGEE_MS = 2 * 3_600_000;
/** RC-4 : l'arrêt propre du PC doit suivre le dernier tour d'avant d'au plus un intervalle + 15 min. */
export const ARRET_DU_PC_APRES_LE_DERNIER_TOUR_MS = INTERVALLE_MS + 15 * 60_000;
/** CR-2 : l'annonce d'une mise en service vaut 60 min. */
export const ANNONCE_VALABLE_MS = 60 * 60_000;
/** S9 : plus de 5 % d'échecs dans la journée, ou 5 échecs de suite (CR-20 point 1). */
export const PART_ECHECS_IA = 0.05;
export const ECHECS_IA_DE_SUITE = 5;
/** CR-26 point 4 : le seuil de 5 % ne vaut qu'à partir de 20 appels dans la journée. */
export const MIN_APPELS_PART_IA = 20;
/** Un trou dont le journal Windows est illisible est relu au plus tant de fois (CR-15 point 4). */
export const RELECTURES_MAX = 3;
/** Les zones du code que compare `git diff` (CR-2 point 2). */
export const ZONES_DU_CODE = Object.freeze(['server/src', 'server/scripts', 'server/package.json', 'ui/src']);
const SHA = /^[0-9a-f]{40}$/;

// Ce que le journal ne voit pas (CR-20 point 3) : NON_SURVEILLE vit dans classerLesEvenements.js depuis P4a (la carte de la
// feuille de route le lit sans importer le journal) ; ré-exporté ici sous le même nom.

// --- Petites fonctions pures ----------------------------------------------------------------------------------------

const iso = (ms) => new Date(ms).toISOString();
const ms = (x) => (typeof x === 'number' ? x : Date.parse(x));
const minutes = (duree) => Math.max(0, Math.round(duree / 60_000));

/** L'identifiant stable d'un événement (CR-47) : « <jour de Paris>|<type>|<clé>|<heure UTC> ». */
export function idDEvenement({ type, cle, le }) {
  const t = ms(le);
  return `${jourDeParis(t)}|${type}|${cle ?? '-'}|${iso(t).slice(11, 19)}`;
}

/** Les totaux IA du jour depuis journal-claude/<jour>.json, ou null (fichier absent : jamais 0 inventé, T-J8). */
export function totauxIa(fichier) {
  if (!fichier || typeof fichier !== 'object' || !fichier.totaux) return null;
  const t = fichier.totaux;
  const appels = Array.isArray(fichier.appels) ? fichier.appels : [];
  let deSuite = 0;
  let maxDeSuite = 0;
  for (const a of [...appels].sort((x, y) => String(x.at).localeCompare(String(y.at)))) {
    deSuite = a?.statut === 'ok' ? 0 : deSuite + 1;
    maxDeSuite = Math.max(maxDeSuite, deSuite);
  }
  return {
    appels: Number.isFinite(t.appels) ? t.appels : appels.length,
    ok: Number.isFinite(t.ok) ? t.ok : null,
    echecs: Number.isFinite(t.echecs) ? t.echecs : null,
    tokens: Number.isFinite(t.tokens?.total) ? t.tokens.total : null,
    echecsDeSuiteMax: maxDeSuite,
    // Les messages des appels en échec (distincts, 10 au plus) : la cause « quota-abonnement » se reconnaît sur eux (CR-26 point 3).
    messagesDEchec: [...new Set(appels.filter((a) => a && a.statut !== 'ok').map((a) => String(a.erreur ?? a.message ?? '').slice(0, 200)))].slice(0, 10)
  };
}

/** Le résumé vide d'un jour (conception § 5.2, corrigée par CR-3, CR-21, CR-46, CR-47). */
export function resumeVide(jour, phase) {
  return {
    version: 1,
    jour,
    phase,
    nonSurveille: NON_SURVEILLE,
    couverture: { minutesObservees: 0, minutesDeVeille: 0, minutesArret: 0, minutesEnErreur: 0, tours: 0, toursReussis: 0 },
    serveur: { demarrages: [], trous: [] },
    passes: { total: 0, ok: 0, partielles: 0, enEchec: 0, nuit: null, rattrapages: [], liste: [] },
    alertes: { posees: [], levees: [], changees: [] },
    controleDuJour: null,
    fotmob: { transitions: [] },
    sauvegarde: null,
    restauration: null,
    ia: null,
    direct: { suspensions: 0, minutesSuspendu: 0 },
    instantaneDuDepart: null,
    evenements: []
  };
}

/** Le dernier état vu, vide (CR-47) : ce qui permet de ne noter qu'une fois. */
export function vusVides() {
  // joursConnus (P4a, décision 24 e) : { cause: [jours] } reconnus d'office, pour la borne « un jour par semaine » ;
  // fotmobPanne : l'épisode « en panne » en cours, son temps observé et s'il a déjà dépassé 6 h (CR-24 point 2).
  return { passes: [], alertes: {}, controles: {}, constats: [], fotmob: null, sauvegarde: null, restauration: null, direct: null, ia: {}, sansPasse: false, sansSauvegarde: false, premierJour: null, joursConnus: {}, fotmobPanne: null };
}

// --- Les lecteurs (une tentative, jamais de cache d'un échec : CR-16, T-J13, T-J16) ---------------------------------

/**
 * Un lecteur de fichier JSON pour la boucle : fs.promises, UNE tentative. Un fichier dont la date et la taille n'ont
 * pas changé depuis la dernière lecture RÉUSSIE n'est pas relu. Rend { etat: 'lu' | 'inchange' | 'absent' |
 * 'illisible', valeur, probleme }. Ne lève jamais.
 */
export function creerLecteur({ fsp = fs.promises } = {}) {
  const caches = new Map();
  return async function lire(fichier) {
    try {
      let info;
      try {
        info = await fsp.stat(fichier);
      } catch (e) {
        if (e?.code === 'ENOENT') {
          caches.delete(fichier);
          return { etat: 'absent', valeur: null };
        }
        return { etat: 'illisible', valeur: null, probleme: `stat : ${e?.code ?? e?.message ?? e}` };
      }
      const c = caches.get(fichier);
      if (c && c.mtimeMs === info.mtimeMs && c.taille === info.size) return { etat: 'inchange', valeur: c.valeur };
      const texte = await fsp.readFile(fichier, 'utf8');
      const valeur = JSON.parse(texte);
      if (!valeur || typeof valeur !== 'object') return { etat: 'illisible', valeur: null, probleme: 'forme inattendue (pas un objet)' };
      caches.set(fichier, { mtimeMs: info.mtimeMs, taille: info.size, valeur });
      return { etat: 'lu', valeur };
    } catch (e) {
      return { etat: 'illisible', valeur: null, probleme: String(e?.message ?? e).slice(0, 200) };
    }
  };
}

/** Lecture SYNCHRONE d'un petit fichier hors OneDrive, une tentative (au démarrage et dans les écouteurs seulement). */
function lireSync(fichier) {
  try {
    const v = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    return v && typeof v === 'object' ? { etat: 'lu', valeur: v } : { etat: 'illisible', valeur: null };
  } catch (e) {
    return e?.code === 'ENOENT' ? { etat: 'absent', valeur: null } : { etat: 'illisible', valeur: null, probleme: String(e?.message ?? e).slice(0, 200) };
  }
}

// --- Le commit en service et git (CR-2, T-J11, § 7 règle 14) --------------------------------------------------------

/** La racine du dépôt qui contient ce code (server/src/data/recette → 4 niveaux). */
export const racineDuDepotParDefaut = () => path.resolve(ICI, '..', '..', '..', '..');

/**
 * Le commit en service, lu COMME UN FICHIER (T-J11) : .git/HEAD → la référence → son fichier, sinon packed-refs.
 * null s'il n'y a pas de .git (bac, piste), ou si rien n'est lisible. Ne lève jamais.
 */
export async function lireLeCommit(racine, { fsp = fs.promises } = {}) {
  try {
    const git = path.join(racine, '.git');
    const head = (await fsp.readFile(path.join(git, 'HEAD'), 'utf8')).trim();
    if (SHA.test(head)) return head;
    const m = /^ref:\s*(\S+)$/.exec(head);
    if (!m || m[1].includes('..')) return null;
    try {
      const sha = (await fsp.readFile(path.join(git, ...m[1].split('/')), 'utf8')).trim();
      if (SHA.test(sha)) return sha;
    } catch {
      // pas de fichier : la référence est peut-être rangée dans packed-refs
    }
    const packed = await fsp.readFile(path.join(git, 'packed-refs'), 'utf8');
    for (const ligne of packed.split(/\r?\n/)) {
      const [sha, ref] = ligne.trim().split(/\s+/);
      if (ref === m[1] && SHA.test(sha ?? '')) return sha;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Le git par défaut : execFile du `git` de PATH, en lecture, rappel à « close », 10 s ; ne rejette jamais.
 * Rend { code, sortie } ou { code: null, probleme }. Seules deux formes sont lancées par ce module (§ 7 règle 14).
 */
export function gitParDefaut(args, { cwd }) {
  return new Promise((resoudre) => {
    try {
      execFile('git', args, { cwd, windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024, encoding: 'utf8' }, (erreur, sortie) => {
        try {
          if (!erreur) return resoudre({ code: 0, sortie: String(sortie ?? '') });
          resoudre(Number.isInteger(erreur.code) ? { code: erreur.code, sortie: String(sortie ?? '') } : { code: null, probleme: String(erreur.code ?? erreur.message) });
        } catch (e) {
          resoudre({ code: null, probleme: String(e?.message ?? e) });
        }
      });
    } catch (e) {
      resoudre({ code: null, probleme: String(e?.message ?? e) });
    }
  });
}

/**
 * Le code a-t-il changé entre deux commits ? 'change' | 'inchange' | 'inconnu' (CR-2 point 2 : sortie 0 = inchangé,
 * 1 = changé, toute autre = inconnu). Aucun appel si un sha n'est pas 40 hexadécimaux, s'ils sont absents, dans le bac
 * ou sans .git. Ne rejette jamais.
 */
export async function codeChange({ avant, apres, git = gitParDefaut, racine, bac = false }) {
  try {
    if (bac || !racine || !SHA.test(String(avant ?? '')) || !SHA.test(String(apres ?? ''))) return 'inconnu';
    if (avant === apres) return 'inchange';
    if (!fs.existsSync(path.join(racine, '.git'))) return 'inconnu';
    const r = await git(['--no-optional-locks', 'diff', '--quiet', avant, apres, '--', ...ZONES_DU_CODE], { cwd: racine });
    return r?.code === 0 ? 'inchange' : r?.code === 1 ? 'change' : 'inconnu';
  } catch {
    return 'inconnu';
  }
}

/** Le message d'un commit (`git log -1 --format=%s`), ou null (jamais inventé). */
export async function messageDuCommit({ sha, git = gitParDefaut, racine, bac = false }) {
  try {
    if (bac || !racine || !SHA.test(String(sha ?? '')) || !fs.existsSync(path.join(racine, '.git'))) return null;
    const r = await git(['--no-optional-locks', 'log', '-1', '--format=%s', sha], { cwd: racine });
    return r?.code === 0 && r.sortie?.trim() ? r.sortie.trim().slice(0, 200) : null;
  } catch {
    return null;
  }
}

// --- Le classement des démarrages (S11, CR-2, CR-14, P2-b) : pur ---------------------------------------------------

/**
 * Le démarrage d'un processus, classé (pur). Entrées :
 *   premier          aucun battement ni fichier du journal trouvés (premier démarrage du journal) ;
 *   debutDeLaRecette RECETTE.debut (null avant le lot 1b) ;
 *   marque           la marque d'arrêt du processus d'avant ({ pid, type: 'erreur' | 'exit', code, message }) ou null ;
 *   annonce          l'annonce de mise en service ({ le, quoi }) ou null ; `demarreLe` l'instant du démarrage ;
 *   code             'change' | 'inchange' | 'inconnu' (git diff entre le commit d'avant et celui d'aujourd'hui) ;
 *   pc               { demarrages, arretsPropres, arretsBrutaux } du journal Windows entre les deux processus, ou null ;
 *   ecartMs          le temps entre le dernier tour d'avant et ce démarrage.
 * Règles : premier démarrage → « connue » + rodage SEULEMENT tant que debutDeLaRecette est null, sinon « à expliquer »
 * (P2-b) ; marque « erreur » → NOUVELLE d'office (CR-14 point 3) ; annonce valable (≤ 60 min, après le dernier tour
 * d'avant) ET code changé → « mise en service » connue (CR-2 point 3) ; démarrage propre du PC entre les deux → connue ;
 * tout le reste → « à expliquer » (« CôteMaster a été arrêté : par vous ? »).
 */
export function classerLeDemarrage({ premier = false, debutDeLaRecette = null, marque = null, annonce = null, demarreLe, dernierTourAvant = null, code = 'inconnu', pc = null, ecartMs = null } = {}) {
  if (premier) {
    if (debutDeLaRecette === null) return { type: 'premier-demarrage-du-journal', classe: 'connue', cause: 'premier-demarrage-du-journal', texte: 'Premier démarrage du journal de la recette (rodage).', rodage: true };
    return { type: 'premier-demarrage-du-journal', classe: 'a-expliquer', cause: null, texte: "Le journal de la recette repart sans battement ni fichier alors que la recette a commencé : battement effacé ou illisible ?", rodage: false };
  }
  const rapide = Number.isFinite(ecartMs) && ecartMs <= REDEMARRAGE_RAPIDE_MS;
  if (marque?.type === 'erreur') {
    return { type: 'arret-sur-erreur', classe: 'nouvelle', cause: null, texte: `CôteMaster s'est arrêté sur une erreur : ${String(marque.message ?? 'sans message').slice(0, 300)}`, rapide };
  }
  const t = ms(demarreLe);
  const tAnnonce = annonce ? ms(annonce.le) : NaN;
  const annonceValable = Number.isFinite(tAnnonce) && tAnnonce <= t && t - tAnnonce <= ANNONCE_VALABLE_MS && (dernierTourAvant === null || tAnnonce >= ms(dernierTourAvant) - INTERVALLE_MS);
  if (annonceValable && code === 'change') {
    return { type: 'mise-en-service', classe: 'connue', cause: 'mise-en-service', texte: `Mise en service : ${String(annonce.quoi ?? '').slice(0, 200)}`, rapide };
  }
  // P4b-1 (RC-4) : un redémarrage du PC n'explique l'arrêt que si le PC s'est éteint PROPREMENT juste après le dernier tour
  // d'avant (au plus INTERVALLE_MS + 15 min) ET si le serveur n'a laissé aucune marque, ou une sortie de code 0. Node qui meurt
  // de mémoire épuisée n'émet rien : un plantage suivi, des heures plus tard, d'un arrêt propre du PC reste « à expliquer ».
  const tDernier = dernierTourAvant === null ? NaN : ms(dernierTourAvant);
  const arretJusteApres = Number.isFinite(tDernier) && (pc?.arretsPropres ?? []).some((x) => {
    const t = ms(x);
    return Number.isFinite(t) && t >= tDernier && t - tDernier <= ARRET_DU_PC_APRES_LE_DERNIER_TOUR_MS;
  });
  const sortiePropre = !marque || (marque.type === 'exit' && marque.code === 0);
  const pcRedemarre = Boolean(pc && pc.demarrages?.length && !pc.arretsBrutaux?.length);
  if (pcRedemarre && arretJusteApres && sortiePropre) {
    return { type: 'redemarrage-du-pc', classe: 'connue', cause: 'redemarrage-du-pc', texte: 'Le PC a redémarré entre les deux processus (arrêt propre au journal Windows).', rapide };
  }
  const pourquoi = [];
  if (pcRedemarre && !arretJusteApres) pourquoi.push('serveur arrêté avant le PC');
  if (pcRedemarre && arretJusteApres && !sortiePropre) pourquoi.push('le serveur ne s’est pas arrêté proprement avant le PC');
  if (annonce && !annonceValable) pourquoi.push('annonce périmée');
  if (annonceValable && code !== 'change') pourquoi.push(code === 'inchange' ? 'annonce, mais code inchangé' : 'annonce, mais code non comparable');
  if (!annonce && code === 'change') pourquoi.push('code changé sans annonce');
  if (pc?.arretsBrutaux?.length) pourquoi.push('arrêt brutal du PC au journal Windows');
  if (marque?.type === 'exit') pourquoi.push(`sortie notée (code ${marque.code ?? '?'})`);
  if (!marque) pourquoi.push('arrêt sans trace');
  return { type: rapide ? 'redemarrage-rapide' : 'arret-du-serveur', classe: 'a-expliquer', cause: null, texte: `CôteMaster a été arrêté : par vous ? (${pourquoi.join(' ; ') || 'rien ne l’explique'})`, rapide };
}

// --- La boucle ------------------------------------------------------------------------------------------------------

/**
 * Le classeur par défaut de creerJournal (sans liste) : 'info' seulement pour la liste fermée (TYPES_INFO), la classe
 * du journal pour ses démarrages et ses trous, sinon « à expliquer ». demarrerJournalDeLaRecette branche la liste des
 * causes (creerClasseur, P3).
 */
export const classerParDefaut = (evenement) => classerSansListe(evenement);

/**
 * Crée le journal (rien n'est lu ni écrit ici). Tout est injectable pour les essais. `tour()` ne rejette jamais en
 * pratique ; `tic()` est la seule entrée des minuteries.
 */
export function creerJournal({
  chemins,
  sources,
  horloge = Date.now,
  pid = process.pid,
  demarreLe = horloge(),
  recette = RECETTE,
  lecteur = creerLecteur(),
  lireJW = lireJournalWindows,
  git = gitParDefaut,
  racineDuDepot = racineDuDepotParDefaut(),
  bac = false,
  ecrireJson = writeJsonAtomic,
  lireDirect = null,
  classer = classerParDefaut,
  causes = CAUSES_CONNUES,
  lireEmpreinte = lireLEmpreinteDesCauses,
  avantDemarrage = { battement: null, marque: null },
  journal = console,
  surArret = null
} = {}) {
  if (!chemins || !sources) throw new TypeError('creerJournal : chemins et sources sont obligatoires (jamais de défaut ici)');
  const lus = fichiersLus(sources);
  const etat = {
    premierTourFait: false,
    dernierTour: null,
    derniereErreur: null,
    dureeDernierTourMs: null,
    blocageMaxMs: 0,
    tours: 0,
    jour: null,
    resume: null,
    vus: null,
    trousARelire: [],
    apresUnTrou: null,
    eveilleDepuisPasseMs: 0,
    eveilleDepuisSauvegardeMs: 0,
    commit: null,
    aEcrireDuJour: false,
    aEcrireEtat: false,
    jourAFinir: null,
    dernierControle: null,
    empreinteDesCauses: null,
    // RC-9 : le jour dont le fichier ne se lit pas ({ jour, resume, vus }) ; RC-14 : un autre journal tient les mêmes fichiers.
    jourIllisible: null,
    arrete: false
  };

  const noterErreur = (quoi, e) => {
    etat.derniereErreur = { le: iso(horloge()), quoi, message: String(e?.message ?? e).slice(0, 300) };
  };

  function ecrireBattement(maintenant) {
    ecrireJson(chemins.battement, {
      version: 1,
      pid,
      demarreLe: iso(demarreLe),
      commit: etat.commit,
      dernierTour: etat.dernierTour,
      derniereErreur: etat.derniereErreur,
      dureeDernierTourMs: etat.dureeDernierTourMs,
      blocageMaxMs: etat.blocageMaxMs,
      tours: etat.tours,
      jour: etat.jour,
      couverture: etat.resume?.couverture ?? null,
      eveilleDepuisPasseMin: minutes(etat.eveilleDepuisPasseMs),
      eveilleDepuisSauvegardeMin: minutes(etat.eveilleDepuisSauvegardeMs),
      ecritLe: iso(maintenant)
    });
  }

  /** Charge le jour : le dernier état vu (hors OneDrive), sinon le fichier du jour et celui de la veille (CR-47). */
  async function chargerLeJour(jour, phase) {
    const lu = await lecteur(chemins.dernierEtat);
    if (lu.valeur?.jour === jour && lu.valeur.resume && lu.valeur.vus) {
      etat.resume = lu.valeur.resume;
      etat.vus = { ...vusVides(), ...lu.valeur.vus };
      etat.eveilleDepuisPasseMs = (lu.valeur.eveilleDepuisPasseMin ?? 0) * 60_000;
      etat.eveilleDepuisSauvegardeMs = (lu.valeur.eveilleDepuisSauvegardeMin ?? 0) * 60_000;
      etat.resume.phase = phase;
      reprendreLaCouverture(jour);
      etat.vus.premierJour ??= jourDeParis(demarreLe);
      return;
    }
    const duJour = await lecteur(chemins.fichierDuJour(jour));
    const veille = await lecteur(chemins.fichierDuJour(ajouterJours(jour, -1)));
    etat.resume = duJour.valeur?.jour === jour ? { ...resumeVide(jour, phase), ...duJour.valeur, phase } : resumeVide(jour, phase);
    // Le dernier état vu : celui de l'état hors OneDrive s'il est d'un autre jour, sinon celui des fichiers.
    const vus = lu.valeur?.vus ?? duJour.valeur?.vus ?? veille.valeur?.vus ?? null;
    etat.vus = { ...vusVides(), ...(vus ?? {}) };
    // P4b-1 (RC-9) : un fichier du jour qui existe mais ne se lit pas n'est JAMAIS réécrit depuis un résumé vide. Il est relu
    // à chaque tour ; en attendant, ce processus écrit à côté (« AAAA-MM-JJ.reprise-<pid>.json »), et la carte le signale.
    for (const [quel, r, j] of [['du jour', duJour, jour], ['de la veille', veille, ajouterJours(jour, -1)]]) {
      if (r.etat !== 'illisible') continue;
      noterErreur(`fichier ${quel} illisible (${j})`, r.probleme ?? 'illisible');
      if (j === jour) etat.jourIllisible = { jour, resume: null, vus: null };
      noter({ type: 'fichier-du-jour-illisible', signal: 'R', cle: j, le: horloge(), texte: `Le fichier ${quel} (${j}) ne se lit pas : rien n'est réécrit par-dessus, il est relu à chaque tour.`, details: { jour: j, probleme: String(r.probleme ?? 'illisible').slice(0, 200), reprise: j === jour ? path.basename(chemins.repriseDuJour(jour, pid)) : null } }, phase);
    }
    if (lu.valeur && lu.valeur.jour !== jour) {
      etat.eveilleDepuisPasseMs = (lu.valeur.eveilleDepuisPasseMin ?? 0) * 60_000;
      etat.eveilleDepuisSauvegardeMs = (lu.valeur.eveilleDepuisSauvegardeMin ?? 0) * 60_000;
    }
    // Les passes déjà notées hier ou aujourd'hui ne le sont pas une seconde fois.
    const ids = new Set(etat.vus.passes);
    for (const r of [duJour.valeur, veille.valeur]) for (const p of r?.passes?.liste ?? []) if (p?.id) ids.add(p.id);
    etat.vus.passes = [...ids].slice(-200);
    reprendreLaCouverture(jour);
    etat.vus.premierJour ??= jourDeParis(demarreLe);
  }

  /** La couverture du jour vit au battement (compteurs de chaque tour, CR-46) : reprise si elle est plus avancée. */
  function reprendreLaCouverture(jour) {
    const b = avantDemarrage.battement;
    if (b?.jour === jour && b.couverture && typeof b.couverture === 'object' && (b.couverture.tours ?? 0) >= (etat.resume.couverture?.tours ?? 0)) {
      etat.resume.couverture = { ...resumeVide(jour, null).couverture, ...b.couverture };
    }
  }

  /** Ajoute un événement (pas en croisière ; jamais deux fois le même id). */
  function noter(ev, phase) {
    if (phase === 'croisiere') return null;
    const id = idDEvenement(ev);
    if (etat.resume.evenements.some((x) => x.id === id)) return null;
    let c;
    try {
      c = classer(ev, contexteDuClassement(phase)) ?? classerParDefaut(ev);
    } catch {
      c = classerParDefaut(ev);
    }
    // 'info' seulement pour la liste fermée, quel que soit le classeur (décision 23 c) ; une classe inconnue → « à expliquer ».
    if (!c || !['info', 'connue', 'a-expliquer', 'nouvelle'].includes(c.classe) || (c.classe === 'info' && !estInfoPermise(ev))) c = { classe: 'a-expliquer', cause: null };
    const complet = { id, le: iso(ms(ev.le)), type: ev.type, signal: ev.signal ?? null, cle: ev.cle ?? null, texte: ev.texte, details: ev.details ?? null, classe: c.classe, cause: c.cause ?? null, ...(c.rechute ? { rechute: true } : {}), ...(c.raison && c.classe === 'a-expliquer' ? { raison: String(c.raison).slice(0, 300) } : {}), rodage: phase === 'rodage' || ev.rodage === true };
    // Décision 24 e : les jours reconnus par chaque cause (30 au plus), pour la borne « un jour par semaine de la recette ».
    if (c.classe === 'connue' && c.cause) {
      const jour = jourDeParis(complet.le);
      const deja = Array.isArray(etat.vus.joursConnus?.[c.cause]) ? etat.vus.joursConnus[c.cause] : [];
      if (jour && !deja.includes(jour)) etat.vus.joursConnus = { ...(etat.vus.joursConnus ?? {}), [c.cause]: [...deja, jour].slice(-30) };
    }
    etat.resume.evenements.push(complet);
    etat.aEcrireDuJour = true;
    etat.aEcrireEtat = true;
    return complet;
  }

  /** Ce que le classeur sait du moment (pur côté classeur) : phase, J0, instantané du départ, FotMob, contrôle du jour. */
  function contexteDuClassement(phase) {
    return { rodage: phase === 'rodage', j0: jourZero(recette) ?? etat.vus?.premierJour ?? null, instantane: etat.vus?.instantaneDuDepart ?? null, fotmob: etat.vus?.fotmob ?? null, controle: etat.dernierControle, joursConnus: etat.vus?.joursConnus ?? {} };
  }

  /** Au premier tour d'un nouveau processus : le démarrage (S11) ou le premier démarrage du journal (P2-b). */
  async function noterLeDemarrage(maintenant, phase) {
    const avant = avantDemarrage.battement;
    const premier = !avant && !(await lecteur(chemins.dernierEtat)).valeur && !etat.resume.evenements.length;
    if (premier) {
      const c = classerLeDemarrage({ premier: true, debutDeLaRecette: recette?.debut ?? null });
      const ev = noter({ type: c.type, signal: 'S11', cle: String(pid), le: demarreLe, texte: c.texte, classe: c.classe, cause: c.cause, rodage: c.rodage }, phase);
      etat.resume.serveur.demarrages.push({ le: iso(demarreLe), pid, commit: etat.commit, type: c.type, id: ev?.id ?? null, empreinteDesCauses: etat.empreinteDesCauses });
      return;
    }
    if (!avant || avant.pid === pid) {
      // Battement illisible ou absent mais journal présent : un démarrage sans référence, à expliquer.
      const ev = noter({ type: 'demarrage-sans-battement', signal: 'S11', cle: String(pid), le: demarreLe, texte: 'Démarrage du serveur : battement du processus d’avant absent ou illisible.', classe: 'a-expliquer' }, phase);
      etat.resume.serveur.demarrages.push({ le: iso(demarreLe), pid, commit: etat.commit, type: 'demarrage-sans-battement', id: ev?.id ?? null, empreinteDesCauses: etat.empreinteDesCauses });
      return;
    }
    const dernierTourAvant = avant.dernierTour ?? avant.demarreLe ?? null;
    const ecartMs = dernierTourAvant ? demarreLe - ms(dernierTourAvant) : null;
    const marque = avantDemarrage.marque && avantDemarrage.marque.pid === avant.pid ? avantDemarrage.marque : null;
    const annonce = (await lecteur(chemins.miseEnService)).valeur;
    const code = await codeChange({ avant: avant.commit, apres: etat.commit, git, racine: racineDuDepot, bac });
    let pc = null;
    if (marque?.type !== 'erreur' && !(annonce && code === 'change') && dernierTourAvant) {
      const lecture = await lireJW({ fenetreMs: borneDeLaRequete({ debutDuTrou: dernierTourAvant, maintenant }) });
      pc = lecture?.lisible ? arretsEtDemarrages(lecture.evenements, { de: dernierTourAvant, a: demarreLe }) : null;
    }
    const c = classerLeDemarrage({ marque, annonce, demarreLe, dernierTourAvant, code, pc, ecartMs });
    const message = c.type === 'mise-en-service' ? await messageDuCommit({ sha: etat.commit, git, racine: racineDuDepot, bac }) : null;
    const details = { pidAvant: avant.pid, commitAvant: avant.commit ?? null, commit: etat.commit, code, ecartMin: ecartMs === null ? null : minutes(ecartMs), marque, message, rapide: c.rapide };
    const ev = noter({ type: c.type, signal: 'S11', cle: String(pid), le: demarreLe, texte: c.texte, classe: c.classe, cause: c.cause, details }, phase);
    etat.resume.serveur.demarrages.push({ le: iso(demarreLe), pid, commit: etat.commit, type: c.type, id: ev?.id ?? null, empreinteDesCauses: etat.empreinteDesCauses });
    if (Number.isFinite(ecartMs) && ecartMs > 0) {
      // RC-12 : l'arrêt coupé au minuit de Paris ; la part du jour du dernier tour va dans SON fichier (réécrit ici).
      const debutDuJour = debutDuJourDeParis(etat.resume.jour);
      const tAvant = ms(dernierTourAvant);
      if (Number.isFinite(debutDuJour) && tAvant < debutDuJour) {
        etat.resume.couverture.minutesArret += minutes(demarreLe - debutDuJour);
        await finirLeJourDAvant(jourDeParis(tAvant), { arretMs: Math.min(demarreLe, debutDuJourDeParis(ajouterJours(jourDeParis(tAvant), 1))) - tAvant });
      } else etat.resume.couverture.minutesArret += minutes(ecartMs);
    }
  }

  /**
   * RC-12 : le jour du dernier tour d'un processus arrêté (ou endormi) avant minuit reçoit sa part de l'arrêt, puis ses
   * minutes « non observées » ; son fichier est relu puis réécrit (une fois). Jamais un jour lu illisible.
   */
  async function finirLeJourDAvant(jour, { arretMs = 0 } = {}) {
    try {
      if (!jour || jour === etat.resume?.jour) return;
      const lu = await lecteur(chemins.fichierDuJour(jour));
      if (!['lu', 'inchange'].includes(lu.etat) || lu.valeur?.jour !== jour) return;
      const { vus, ...r } = lu.valeur;
      // La couverture vit au battement (CR-46) : celle du processus d'avant, si elle est de ce jour et plus avancée.
      const b = avantDemarrage.battement;
      const auBattement = b?.jour === jour && b.couverture && typeof b.couverture === 'object' && (b.couverture.tours ?? 0) >= (r.couverture?.tours ?? 0) ? b.couverture : null;
      const cv = { ...resumeVide(jour, null).couverture, ...(auBattement ?? r.couverture ?? {}) };
      cv.minutesArret += minutes(Math.max(0, arretMs));
      cv.minutesNonObservees = Math.max(0, 1440 - cv.minutesObservees - cv.minutesDeVeille - cv.minutesArret - cv.minutesEnErreur);
      ecrireLeJour({ ...r, couverture: cv }, vus ?? null);
    } catch (e) {
      noterErreur(`fin du jour ${jour}`, e);
    }
  }

  /** S10 : le journal Windows lu pour un trou [de, a] (une fois, avant le changement de jour : RC-12). */
  async function lireLeTrou({ de, a }) {
    const lecture = await lireJW({ fenetreMs: borneDeLaRequete({ debutDuTrou: de, maintenant: a }) });
    return { de, a, lecture, r: expliquerLeTrou({ de, a, lecture }) };
  }

  /** Les minutes de veille comprises dans [de, a], ou null si le journal Windows ne s'est pas lu. */
  const veilleEntre = (lecture, de, a) => (lecture?.lisible === true && Array.isArray(lecture.evenements) && a > de ? Math.round(veilleDansLeTrou(lecture.evenements, { de, a }) / 60_000) : null);

  /**
   * S10 : un trou du battement, même processus. RC-12 : s'il passe minuit (Paris), `depuis` est le minuit du jour en cours :
   * le jour d'avant a déjà reçu sa part de veille (tour) ; celui-ci ne compte que la sienne.
   */
  async function noterLeTrou({ de, a, lecture, r, depuis = null }, phase) {
    const ev = noter({ type: 'trou', signal: 'S10', cle: String(pid), le: a, texte: r.raison, classe: r.classe, cause: r.cause, details: { de: iso(de), a: iso(a), minutes: r.minutesDuTrou, minutesDeVeille: r.minutesDeVeille, pistes: r.pistes ?? null } }, phase);
    etat.resume.serveur.trous.push({ de: iso(de), a: iso(a), minutes: minutes(a - de), cause: r.cause, id: ev?.id ?? null });
    const veilleDuJour = depuis === null ? r.minutesDeVeille : veilleEntre(lecture, Math.max(de, depuis), a);
    if (Number.isFinite(veilleDuJour)) etat.resume.couverture.minutesDeVeille += veilleDuJour;
    if (r.relire) etat.trousARelire.push({ de, a, id: ev?.id ?? null, essais: 1 });
    etat.apresUnTrou = { de: iso(de), a: iso(a), minutes: minutes(a - de) };
  }

  /** CR-19 point 3 : l'empreinte vue à ce démarrage différente de celle du premier tour de la fenêtre → « règle enfreinte ». */
  function noterLaRegle(maintenant, phase) {
    const ref = etat.vus?.instantaneDuDepart?.empreinteDesCauses ?? null;
    if (!ref || ref === etat.empreinteDesCauses) return;
    noter({ type: 'regle-enfreinte', signal: 'R', cle: 'causes', le: maintenant, texte: `La liste des causes a changé en cours de route (empreinte ${String(etat.empreinteDesCauses).slice(0, 12)} au lieu de ${ref.slice(0, 12)}).`, details: { reference: ref, vue: etat.empreinteDesCauses } }, phase);
  }

  async function relireLesTrous(phase) {
    const restants = [];
    for (const t of etat.trousARelire) {
      const lecture = await lireJW({ fenetreMs: borneDeLaRequete({ debutDuTrou: t.de, maintenant: horloge() }) });
      const r = expliquerLeTrou({ de: t.de, a: t.a, lecture });
      if (r.relire && t.essais < RELECTURES_MAX) restants.push({ ...t, essais: t.essais + 1 });
      else if (!r.relire) {
        noter({ type: 'trou-relu', signal: 'S10', cle: t.id ?? String(pid), le: horloge(), texte: r.raison, classe: r.classe, cause: r.cause, details: { trou: t.id, de: iso(t.de), a: iso(t.a), minutesDeVeille: r.minutesDeVeille } }, phase);
        if (Number.isFinite(r.minutesDeVeille)) etat.resume.couverture.minutesDeVeille += r.minutesDeVeille;
      }
    }
    etat.trousARelire = restants;
  }

  /** S1, S2, S6 : les passes finies, vues pour la première fois (par leur id) ; une passe en cours attend sa fin. */
  function noterLesPasses(refresh, maintenant, phase) {
    const histoire = Array.isArray(refresh?.history) ? refresh.history : [];
    const vues = new Set(etat.vus.passes);
    const neuves = histoire.filter((p) => p?.id && p.finishedAt && !vues.has(p.id)).reverse();
    for (const p of neuves) {
      vues.add(p.id);
      const dureeMs = Number.isFinite(p.durationMs) ? p.durationMs : ms(p.finishedAt) - ms(p.startedAt);
      const figee = dureeMs > PASSE_FIGEE_MS && etat.resume.serveur.trous.some((t) => ms(t.de) < ms(p.finishedAt) && ms(t.a) > ms(p.startedAt));
      const pasOk = (p.steps ?? []).filter((e) => e && e.status !== 'ok' && e.status !== 'skipped').map((e) => ({ cle: e.key, statut: e.status, resume: String(e.summary ?? '').slice(0, 300) }));
      const P = etat.resume.passes;
      P.total += 1;
      if (p.outcome === 'ok') P.ok += 1;
      else if (p.outcome === 'partial') P.partielles += 1;
      else P.enEchec += 1;
      P.liste.push({ id: p.id, raison: p.reason ?? null, debut: p.startedAt ?? null, fin: p.finishedAt, dureeS: Math.round(dureeMs / 1000), issue: p.outcome ?? null, etapes: pasOk, figeeParLaVeille: figee || undefined });
      if (etat.apresUnTrou) {
        P.rattrapages.push({ id: p.id, dureeS: Math.round(dureeMs / 1000), apresUnTrouDe: etat.apresUnTrou.minutes });
        etat.apresUnTrou = null;
      }
      for (const e of pasOk) {
        noter({ type: e.statut === 'error' ? 'etape-en-echec' : 'etape-en-alerte', signal: e.statut === 'error' ? 'S1' : 'S2', cle: e.cle, le: p.finishedAt, texte: `${e.cle} : ${e.resume}`, details: { passe: p.id, statut: e.statut, figeeParLaVeille: figee } }, phase);
      }
      etat.eveilleDepuisPasseMs = 0;
      etat.vus.sansPasse = false;
      etat.aEcrireEtat = true;
      etat.aEcrireDuJour = true; // une passe finie est un fait du jour (≈ 8 par jour) : le fichier du jour la porte
    }
    etat.vus.passes = [...vues].slice(-200);
    if (etat.eveilleDepuisPasseMs > SEUIL_SANS_PASSE_MS && !etat.vus.sansPasse) {
      etat.vus.sansPasse = true;
      noter({ type: 'sans-passe', signal: 'S6', cle: 'passes', le: maintenant, texte: `Aucune passe depuis ${minutes(etat.eveilleDepuisPasseMs)} min de temps éveillé.`, details: { eveilleMin: minutes(etat.eveilleDepuisPasseMs) } }, phase);
    }
  }

  /** S3 : chaque alerte durable par sa SIGNATURE (posée, levée, reposée, changée). */
  function noterLesAlertes(refresh, maintenant, phase) {
    const alerts = refresh?.alerts && typeof refresh.alerts === 'object' ? refresh.alerts : {};
    for (const cle of new Set([...Object.keys(alerts), ...Object.keys(etat.vus.alertes)])) {
      const sig = signatureDeLAlerte(alerts[cle]);
      const avant = etat.vus.alertes[cle] ?? null;
      if (sig === avant) continue;
      const nombres = nombresDeLAlerte(alerts[cle]);
      if (avant === null) {
        etat.resume.alertes.posees.push(cle);
        noter({ type: 'alerte-posee', signal: 'S3', cle, le: maintenant, texte: `Alerte « ${cle} » posée.`, details: { signature: sig, nombres } }, phase);
      } else if (sig === null) {
        etat.resume.alertes.levees.push(cle);
        noter({ type: 'alerte-levee', signal: 'S3', cle, le: maintenant, texte: `Alerte « ${cle} » levée.`, classe: 'info', details: { signature: null } }, phase);
      } else {
        etat.resume.alertes.changees.push(cle);
        noter({ type: 'alerte-changee', signal: 'S3', cle, le: maintenant, texte: `Alerte « ${cle} » : son contenu a changé.`, details: { signature: sig, avant, nombres } }, phase);
      }
      if (sig === null) delete etat.vus.alertes[cle];
      else etat.vus.alertes[cle] = sig;
      etat.aEcrireEtat = true;
    }
    // Un nombre qui grossit sans changer la signature : un événement dès qu'il passe la borne de sa cause (une fois).
    etat.vus.depassements ??= {};
    for (const cle of new Set([...Object.keys(alerts), ...Object.keys(etat.vus.depassements)])) {
      const d = alerts[cle] ? depassementDeLAlerte(cle, nombresDeLAlerte(alerts[cle]), causes) : null;
      if (d && !etat.vus.depassements[cle]) {
        noter({ type: 'alerte-au-dela-de-la-borne', signal: 'S3', cle, le: maintenant, texte: `Alerte « ${cle} » : ${d.nom} = ${d.valeur}, au-delà de la borne ${d.borne} de la cause « ${d.cause} ».`, details: d }, phase);
        etat.vus.depassements[cle] = true;
        etat.aEcrireEtat = true;
      } else if (!d && etat.vus.depassements[cle]) {
        delete etat.vus.depassements[cle];
        etat.aEcrireEtat = true;
      }
    }
  }

  /** S4 : la couleur de chaque contrôle, et les constats nouveaux (trouveLe après J0 ; la classe « info » ignorée). */
  function noterLeControle(controle, maintenant, phase) {
    if (!controle || !Array.isArray(controle.controles)) return;
    const rouges = [];
    const oranges = [];
    for (const c of controle.controles) {
      if (!c?.cle || c.classe === 'info') continue;
      const couleur = c.statutLe ?? null;
      if (couleur === 'rouge') rouges.push(c.cle);
      if (couleur === 'orange') oranges.push(c.cle);
      const avant = etat.vus.controles[c.cle] ?? null;
      if (couleur !== avant) {
        if (avant !== null || (couleur !== 'vert' && couleur !== null)) {
          noter({ type: 'controle-couleur', signal: 'S4', cle: c.cle, le: maintenant, texte: `Contrôle « ${c.libelle ?? c.cle} » : ${avant ?? 'non vu'} → ${couleur}.`, classe: couleur === 'vert' ? 'info' : undefined, details: { de: avant, vers: couleur, constat: c.constat ?? null } }, phase);
        }
        etat.vus.controles[c.cle] = couleur;
        etat.aEcrireEtat = true;
      }
    }
    // Les constats : nouveaux s'ils sont trouvés APRÈS J0 (jour de Paris strictement après) ; sinon présents au départ.
    // Pendant le rodage (J0 pas encore écrit), la référence est le premier jour du journal.
    const j0 = jourZero(recette) ?? etat.vus.premierJour ?? null;
    const notes = new Set(etat.vus.constats);
    let presentsAuDepart = 0;
    for (const c of controle.controles) {
      for (const k of Array.isArray(c?.constats) ? c.constats : []) {
        if (!k?.id || k.classe === 'info' || notes.has(k.id)) continue;
        const jourTrouve = k.trouveLe ? jourDeParis(k.trouveLe) : null;
        if (j0 && jourTrouve && jourTrouve > j0) {
          notes.add(k.id);
          noter({ type: 'constat-nouveau', signal: 'S4', cle: k.id, le: k.trouveLe, texte: `Constat nouveau (${c.cle}) : ${String(k.texte ?? k.raison ?? '').slice(0, 200)}`, details: { controle: c.cle, classe: k.classe ?? null, trouveLe: k.trouveLe, league: k.league ?? null } }, phase);
        } else presentsAuDepart += 1;
      }
    }
    etat.vus.constats = [...notes].slice(-2000);
    const pire = rouges.length ? 'rouge' : oranges.length ? 'orange' : 'vert';
    etat.resume.controleDuJour = { releves: controle.le ?? null, pire, rouges, oranges, presentsAuDepart };
  }

  /** S5 : chaque transition de FotMob, avec son heure (jamais le dernier état seul, B5). */
  function noterFotmob(sante, refresh, maintenant, phase, deltaMs = 0) {
    if (!sante && !refresh) return;
    const { etat: vers, raison, nature, detecteParLAppli } = etatFotmobLu({ sante, refresh, maintenant });
    const de = etat.vus.fotmob ?? null;
    // Décision 24 e (CR-24 point 2) : le temps OBSERVÉ de l'épisode « en panne » (un écart de tour au-delà du seuil du trou
    // est une veille : non compté) ; au-delà de 6 h, une « alerte au-delà de la borne », une fois par épisode.
    if (vers === 'en-panne' && de === 'en-panne') {
      const p = etat.vus.fotmobPanne ?? { depuis: iso(maintenant), observeMs: 0, signale: false };
      p.observeMs += deltaMs > 0 && deltaMs <= SEUIL_DU_TROU_MS ? deltaMs : 0;
      etat.vus.fotmobPanne = p;
      const d = p.signale ? null : depassementDeLaPanneFotmob({ etat: vers, observeMs: p.observeMs });
      if (d) {
        p.signale = true;
        noter({ type: 'alerte-au-dela-de-la-borne', signal: 'S5', cle: 'fotmob', le: maintenant, texte: `FotMob en panne depuis ${d.valeur.toLocaleString('fr-FR')} h observées (depuis le ${p.depuis}), au-delà de la borne de ${d.borne} h de la cause « ${d.cause} ».`, details: { ...d, depuis: p.depuis } }, phase);
      }
      etat.aEcrireEtat = true;
    }
    if (vers === de) return;
    etat.vus.fotmobPanne = vers === 'en-panne' ? { depuis: iso(maintenant), observeMs: 0, signale: false } : null;
    etat.resume.fotmob.transitions.push({ le: iso(maintenant), de, vers, raison });
    noter({ type: 'fotmob', signal: 'S5', cle: vers, le: maintenant, texte: `FotMob : ${de ?? 'non vu'} → ${vers}${raison ? ` (${raison})` : ''}.`, classe: vers === 'ok' ? 'info' : undefined, details: { de, vers, raison, nature, detecteParLAppli } }, phase);
    etat.vus.fotmob = vers;
    etat.aEcrireEtat = true;
  }

  /** S7 : la sauvegarde (nouvelle, en échec, ou absente depuis 36 h éveillées) et la restauration d'essai. */
  function noterSauvegardes(sauvegarde, restauration, maintenant, phase) {
    const s = sauvegarde?.derniere ?? null;
    if (s?.fin && s.fin !== etat.vus.sauvegarde) {
      const ok = s.ok !== false && !s.erreur;
      etat.resume.sauvegarde = { le: s.fin, ok, rencontres: s.rencontres ?? null, derniereDate: s.derniereDate ?? null, octets: s.octets ?? null };
      noter({ type: ok ? 'sauvegarde' : 'sauvegarde-en-echec', signal: 'S7', cle: 'sauvegarde', le: s.fin, texte: ok ? `Sauvegarde faite (${s.rencontres ?? '?'} rencontres).` : `Sauvegarde en échec : ${String(s.erreur ?? '').slice(0, 200)}`, classe: ok ? 'info' : undefined, details: etat.resume.sauvegarde }, phase);
      etat.vus.sauvegarde = s.fin;
      if (ok) {
        etat.eveilleDepuisSauvegardeMs = 0;
        etat.vus.sansSauvegarde = false;
      }
      etat.aEcrireEtat = true;
    }
    if (etat.eveilleDepuisSauvegardeMs > SEUIL_SANS_SAUVEGARDE_MS && !etat.vus.sansSauvegarde) {
      etat.vus.sansSauvegarde = true;
      noter({ type: 'sans-sauvegarde', signal: 'S7', cle: 'sauvegarde', le: maintenant, texte: `Aucune sauvegarde depuis ${Math.round(etat.eveilleDepuisSauvegardeMs / 3_600_000)} h de temps éveillé.`, details: { eveilleMin: minutes(etat.eveilleDepuisSauvegardeMs) } }, phase);
    }
    const r = restauration?.derniere ?? null;
    if (r?.fin && r.fin !== etat.vus.restauration) {
      etat.resume.restauration = { le: r.fin, saine: r.saine ?? null, controle: r.controle ?? null, rencontres: r.rencontres ?? null, attendues: r.attendues ?? null, derniereDate: r.derniereDate ?? null, derniereDateAttendue: r.derniereDateAttendue ?? null, dureeMs: r.durees?.totalMs ?? null };
      noter({ type: r.saine === true ? 'restauration' : 'restauration-pas-saine', signal: 'S7', cle: 'restauration', le: r.fin, texte: r.saine === true ? 'Restauration d’essai saine.' : `Restauration d’essai pas saine : ${(r.problemes ?? []).join(' ; ').slice(0, 200) || r.impossible || 'sans détail'}`, classe: r.saine === true ? 'info' : undefined, details: etat.resume.restauration }, phase);
      etat.vus.restauration = r.fin;
      etat.aEcrireEtat = true;
    }
  }

  /** S9 : les totaux IA du jour recopiés (null si pas de fichier), et l'arrêt sur pannes ou plus de 5 % d'échecs. */
  function noterIa(fichier, lu, jour, maintenant, phase) {
    if (lu === 'absent') {
      etat.resume.ia = null;
      return;
    }
    const t = totauxIa(fichier);
    if (!t) return;
    etat.resume.ia = { appels: t.appels, ok: t.ok, echecs: t.echecs, tokens: t.tokens };
    const deja = etat.vus.ia[jour] ?? {};
    if (t.echecsDeSuiteMax >= ECHECS_IA_DE_SUITE && !deja.deSuite) {
      noter({ type: 'ia-echecs-de-suite', signal: 'S9', cle: jour, le: maintenant, texte: `IA : ${t.echecsDeSuiteMax} échecs de suite aujourd'hui.`, details: t }, phase);
      etat.vus.ia[jour] = { ...deja, deSuite: true };
      etat.aEcrireEtat = true;
    }
    if (t.appels >= MIN_APPELS_PART_IA && Number.isFinite(t.echecs) && t.echecs / t.appels > PART_ECHECS_IA && !(etat.vus.ia[jour] ?? {}).part) {
      noter({ type: 'ia-part-echecs', signal: 'S9', cle: jour, le: maintenant, texte: `IA : ${t.echecs} échecs sur ${t.appels} appels aujourd'hui.`, details: t }, phase);
      etat.vus.ia[jour] = { ...(etat.vus.ia[jour] ?? {}), part: true };
      etat.aEcrireEtat = true;
    }
  }

  /** S8 : le direct suspendu (getLiveWatchStatus, état en mémoire du serveur). */
  function noterDirect(direct, deltaMs, maintenant, phase) {
    if (!direct || typeof direct !== 'object') return;
    const suspendu = Boolean(direct.suspendu);
    if (suspendu && etat.vus.direct === true) etat.resume.direct.minutesSuspendu += minutes(deltaMs);
    if (suspendu !== (etat.vus.direct === true)) {
      if (suspendu) etat.resume.direct.suspensions += 1;
      noter({ type: suspendu ? 'direct-suspendu' : 'direct-repris', signal: 'S8', cle: 'direct', le: maintenant, texte: suspendu ? `Direct suspendu jusqu'à ${direct.suspenduJusqua ?? '?'} (${direct.erreur ?? direct.derniereErreur?.message ?? 'erreurs FotMob'}).` : 'Direct repris.', classe: suspendu ? undefined : 'info', details: { suspenduJusqua: direct.suspenduJusqua ?? null, erreursConsecutives: direct.erreursConsecutives ?? null } }, phase);
      etat.vus.direct = suspendu;
      etat.aEcrireEtat = true;
    }
  }

  /**
   * Écrit le fichier d'un jour (au plus une fois par tour pour le jour en cours). RC-9 : si ce fichier est illisible
   * (jamais relu avec succès depuis), l'écriture va dans le fichier de reprise de ce processus, jamais par-dessus.
   */
  function ecrireLeJour(resume, vus) {
    if (etat.jourIllisible?.jour === resume.jour) {
      if (resume !== etat.resume) etat.jourIllisible = { ...etat.jourIllisible, resume, vus };
      ecrireJson(chemins.repriseDuJour(resume.jour, pid), { ...resume, vus, reprise: true });
      return;
    }
    ecrireJson(chemins.fichierDuJour(resume.jour), { ...resume, vus });
  }

  /** RC-9 : deux résumés du même jour réunis (le fichier relu, puis ce que ce processus a noté pendant l'illisible). */
  function reunirDeuxResumes(fichier, notre) {
    const somme = (a, b) => (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0);
    const cvA = fichier.couverture ?? {};
    const cvB = notre.couverture ?? {};
    const couverture = { ...cvA };
    for (const k of ['minutesObservees', 'minutesDeVeille', 'minutesArret', 'minutesEnErreur', 'tours', 'toursReussis']) couverture[k] = somme(cvA[k], cvB[k]);
    const ids = new Set((fichier.evenements ?? []).map((e) => e?.id));
    const pA = fichier.passes ?? {};
    const pB = notre.passes ?? {};
    const idsP = new Set((pA.liste ?? []).map((p) => p?.id));
    const passes = { ...resumeVide(null, null).passes, ...pA, total: somme(pA.total, pB.total), ok: somme(pA.ok, pB.ok), partielles: somme(pA.partielles, pB.partielles), enEchec: somme(pA.enEchec, pB.enEchec), liste: [...(pA.liste ?? []), ...(pB.liste ?? []).filter((p) => !idsP.has(p?.id))], rattrapages: [...(pA.rattrapages ?? []), ...(pB.rattrapages ?? [])] };
    return { ...resumeVide(fichier.jour, notre.phase), ...fichier, phase: notre.phase ?? fichier.phase, couverture, passes, evenements: [...(fichier.evenements ?? []), ...(notre.evenements ?? []).filter((e) => !ids.has(e?.id))], controleDuJour: notre.controleDuJour ?? fichier.controleDuJour ?? null, ia: notre.ia ?? fichier.ia ?? null, sauvegarde: notre.sauvegarde ?? fichier.sauvegarde ?? null, restauration: notre.restauration ?? fichier.restauration ?? null };
  }

  /** RC-9 : le fichier du jour illisible est relu à chaque tour ; relu avec succès (ou disparu), on réunit et on reprend. */
  async function relireLeJourIllisible() {
    const ji = etat.jourIllisible;
    if (!ji) return;
    const lu = await lecteur(chemins.fichierDuJour(ji.jour));
    if (lu.etat === 'illisible' || lu.etat === 'inchange') return;
    const enCours = etat.resume?.jour === ji.jour;
    const notre = enCours ? etat.resume : ji.resume;
    etat.jourIllisible = null;
    if (!notre) return;
    const reuni = lu.etat === 'lu' && lu.valeur?.jour === ji.jour ? reunirDeuxResumes(lu.valeur, notre) : notre;
    if (enCours) {
      etat.resume = reuni;
      etat.aEcrireDuJour = true;
    } else ecrireLeJour(reuni, ji.vus ?? etat.vus);
  }

  /** Change de jour : le jour fini est écrit une dernière fois (l'écriture « de minuit »), puis un résumé neuf. */
  async function changerDeJour(jour, phase) {
    if (etat.jourAFinir) {
      // Le jour fini dont l'écriture « de minuit » a raté : refaite à chaque tour jusqu'à ce qu'elle passe.
      try {
        ecrireLeJour(etat.jourAFinir.resume, etat.jourAFinir.vus);
        etat.jourAFinir = null;
      } catch (e) {
        noterErreur(`écriture du jour ${etat.jourAFinir.resume.jour}`, e);
      }
    }
    if (etat.resume && etat.resume.jour !== jour) {
      // CR-3 : le jour fini porte sa couverture complète ; ce qui n'est ni observé, ni veille, ni arrêt, ni erreur est
      // « non observé » (jamais « tenu »). Approximation : l'écart d'un tour qui passe minuit compte pour le jour neuf.
      const cv = etat.resume.couverture;
      cv.minutesNonObservees = Math.max(0, 1440 - cv.minutesObservees - cv.minutesDeVeille - cv.minutesArret - cv.minutesEnErreur);
      try {
        ecrireLeJour(etat.resume, etat.vus);
      } catch (e) {
        noterErreur(`écriture du jour ${etat.resume.jour}`, e);
        etat.jourAFinir = { resume: etat.resume, vus: structuredClone(etat.vus) };
      }
      etat.resume = resumeVide(jour, phase);
      etat.aEcrireEtat = true;
    }
    if (!etat.resume) await chargerLeJour(jour, phase);
    etat.jour = jour;
    etat.resume.phase = phase;
  }

  /** UN TOUR. Toujours `async` (§ 7 règle 10) ; son corps entier est sous try/catch ; le battement est écrit à la fin. */
  async function tour() {
    const debut = horloge();
    let reussi = false;
    if (etat.arrete) return { reussi: false, arrete: true };
    // P4b-1 (RC-14) : le battement relu au début de CHAQUE tour. Un autre pid y a fait un tour plus récent que le nôtre :
    // un second journal tient les mêmes fichiers ; celui-ci s'arrête sans rien écrire (ni jour, ni battement).
    try {
      const b = (await lecteur(chemins.battement)).valeur;
      const notreDernier = etat.dernierTour ? ms(etat.dernierTour) : demarreLe;
      if (b && b.pid !== pid && b.dernierTour && ms(b.dernierTour) > notreDernier) {
        etat.arrete = true;
        noterErreur('second journal', `un autre journal (pid ${b.pid}) tient les mêmes fichiers (dernier tour ${b.dernierTour}) : celui-ci s'arrête`);
        journal?.warn?.(`[recette] second journal : le pid ${b.pid} tient déjà le journal ; celui-ci s'arrête.`);
        try {
          surArret?.();
        } catch {
          // rien : l'arrêt ne doit jamais rien casser
        }
        return { reussi: false, arrete: true };
      }
    } catch (e) {
      noterErreur('relecture du battement', e);
    }
    try {
      const jour = jourDeParis(debut);
      const { phase } = phaseDuJour(jour, recette);
      if (phase === 'avant') return;
      const deltaMs = etat.dernierTour ? debut - ms(etat.dernierTour) : debut - demarreLe;
      // RC-12 : un trou du même processus qui passe minuit (Paris) est coupé : le jour d'avant reçoit sa part de veille
      // AVANT d'être écrit une dernière fois ; le jour neuf ne compte que la sienne (noterLeTrou, `depuis`).
      let trou = null;
      if (etat.premierTourFait && deltaMs > SEUIL_DU_TROU_MS) {
        trou = await lireLeTrou({ de: ms(etat.dernierTour), a: debut });
        if (etat.resume && etat.resume.jour !== jour) {
          const fin = Math.min(debutDuJourDeParis(ajouterJours(etat.resume.jour, 1)) ?? debut, debut);
          const part = veilleEntre(trou.lecture, trou.de, fin);
          if (Number.isFinite(part)) etat.resume.couverture.minutesDeVeille += part;
          trou.depuis = debutDuJourDeParis(jour);
        }
      }
      await changerDeJour(jour, phase);
      // RC-9 : le fichier du jour illisible, relu à chaque tour.
      await relireLeJourIllisible();
      // Les trous d'avant dont le journal Windows était illisible : relus au tour d'APRÈS (CR-15 point 4).
      if (etat.trousARelire.length) await relireLesTrous(phase);
      if (!etat.premierTourFait) {
        etat.commit = bac ? null : await lireLeCommit(racineDuDepot);
        etat.empreinteDesCauses = await lireEmpreinte();
        await noterLeDemarrage(debut, phase);
        noterLaRegle(debut, phase);
      } else if (trou) {
        await noterLeTrou(trou, phase);
      }
      const [refresh, controle, sante, sauvegarde, restauration, ia] = await Promise.all([lecteur(lus.refresh), lecteur(lus.controle), lecteur(lus.sante), lecteur(lus.sauvegarde), lecteur(lus.restauration), lecteur(lus.ia(jour))]);
      const problemes = [['refresh-status.json', refresh], ['controle-quotidien.json', controle], ['sante-fotmob.json', sante], ['etat-sauvegarde.json', sauvegarde], ['etat-restauration.json', restauration], ['journal-claude', ia]].filter(([, r]) => r.etat === 'illisible');
      const t0 = horloge();
      if (deltaMs <= SEUIL_DU_TROU_MS || !etat.premierTourFait) {
        etat.eveilleDepuisPasseMs += Math.max(0, deltaMs);
        etat.eveilleDepuisSauvegardeMs += Math.max(0, deltaMs);
      }
      // S6 se juge même sans fichier lisible (aucune passe vue = aucune passe) ; les alertes, seulement sur un fichier lu.
      etat.dernierControle = controle.valeur ?? etat.dernierControle;
      noterLesPasses(refresh.valeur, debut, phase);
      if (refresh.valeur) noterLesAlertes(refresh.valeur, debut, phase);
      if (controle.valeur) noterLeControle(controle.valeur, debut, phase);
      if (sante.valeur || refresh.valeur) noterFotmob(sante.valeur, refresh.valeur, debut, phase, deltaMs);
      noterSauvegardes(sauvegarde.valeur, restauration.valeur, debut, phase);
      noterIa(ia.valeur, ia.etat, jour, debut, phase);
      if (lireDirect) {
        let direct = null;
        try {
          direct = await lireDirect(debut);
        } catch (e) {
          problemes.push(['direct', { probleme: String(e?.message ?? e) }]);
        }
        noterDirect(direct, deltaMs, debut, phase);
      }
      // L'instantané du départ (CR-18 point 2) : le contenu des alertes au premier tour de J1 de la fenêtre en vigueur.
      const j0 = jourZero(recette);
      if (phase === 'recette' && j0 && etat.vus.instantaneDuDepart?.j0 !== j0 && phaseDuJour(jour, recette).numero === 1) {
        // CR-19 point 2 : l'empreinte de référence est celle vue au premier tour de J1 ; « liste scellée : sha1 … ; n causes ».
        etat.resume.instantaneDuDepart = { j0, le: iso(debut), alertes: { ...etat.vus.alertes }, empreinteDesCauses: etat.empreinteDesCauses, causes: causes.length };
        etat.vus.instantaneDuDepart = etat.resume.instantaneDuDepart;
        etat.aEcrireDuJour = true;
        etat.aEcrireEtat = true;
      }
      etat.blocageMaxMs = Math.max(etat.blocageMaxMs, horloge() - t0);
      if (problemes.length) {
        etat.derniereErreur = { le: iso(debut), quoi: 'lecture', message: problemes.map(([n, r]) => `${n} : ${r.probleme ?? 'illisible'}`).join(' ; ').slice(0, 500) };
      } else reussi = true;
      // La couverture du jour (CR-3) : le temps depuis le tour d'avant, s'il n'est pas un trou.
      const cv = etat.resume.couverture;
      cv.tours += 1;
      if (deltaMs <= SEUIL_DU_TROU_MS && deltaMs > 0) {
        if (reussi) cv.minutesObservees += minutes(deltaMs);
        else cv.minutesEnErreur += minutes(deltaMs);
      }
      if (reussi) cv.toursReussis += 1;
      // Les écritures : le dernier état vu (hors OneDrive) s'il a changé ; le jour s'il y a du neuf (une fois).
      if (etat.aEcrireEtat || etat.aEcrireDuJour) {
        ecrireJson(chemins.dernierEtat, { version: 1, jour, resume: etat.resume, vus: etat.vus, eveilleDepuisPasseMin: minutes(etat.eveilleDepuisPasseMs), eveilleDepuisSauvegardeMin: minutes(etat.eveilleDepuisSauvegardeMs), ecritLe: iso(debut) });
        etat.aEcrireEtat = false;
      }
      if (etat.aEcrireDuJour) {
        ecrireLeJour(etat.resume, etat.vus);
        etat.aEcrireDuJour = false;
      }
    } catch (e) {
      reussi = false;
      noterErreur('tour', e);
    } finally {
      etat.premierTourFait = true;
      etat.tours += 1;
      etat.dernierTour = iso(debut);
      etat.dureeDernierTourMs = Math.max(0, horloge() - debut);
    }
    // Hors du try : si le battement ne s'écrit pas, le tour REJETTE, et `tic` le rattrape (noterSansLever).
    ecrireBattement(debut);
    return { reussi };
  }

  /** Ne lève jamais : la dernière défense du tour (CR-17). */
  function noterSansLever(e) {
    try {
      noterErreur('tour rejeté', e);
      journal?.warn?.(`[recette] tour du journal en échec (le serveur tourne quand même) : ${e?.message ?? e}`);
    } catch {
      // rien : le journal ne doit jamais rien casser
    }
  }

  /** La SEULE entrée des minuteries (§ 7 règle 10 (1)). */
  const tic = () => {
    Promise.resolve().then(tour).catch(noterSansLever);
  };

  return { tour, tic, noterSansLever, etat, chemins };
}

// --- Le démarrage (appelé par server.js) ----------------------------------------------------------------------------

/**
 * Démarre le journal dans le processus du serveur. Ne fait que (§ 7 règle 10 (4)) : les chemins, la garde du second
 * serveur (lecture du battement, CR-55 point 1), la lecture de la marque d'arrêt (CR-14 point 3), la minuterie unref()
 * (premier tour à +4 min, puis toutes les 10 min) et les deux écouteurs (CR-14 point 1). Aucun execFile, aucune autre
 * lecture avant le premier tour. Rend { demarre, raison?, journal?, arreter? }. Ne lève jamais.
 */
export function demarrerJournalDeLaRecette(options = {}) {
  try {
    const {
      chemins: cheminsDonnes = null,
      sources: sourcesDonnees = null,
      // P4b-1 (RC-13) : le processus du serveur lui-même (injectable pour les essais). T-CF1 de calculsAPartFin connaît
      // cette écoute par son nom (ECOUTE_DU_PROCESSUS), sans écriture détournée.
      processus = globalThis.process,
      minuteries = { setTimeout, setInterval, clearTimeout, clearInterval },
      horloge = Date.now,
      journal = console,
      estVivant = processusVivant,
      ...reste
    } = options;
    let chemins = cheminsDonnes;
    let sources = sourcesDonnees;
    let bac = reste.bac ?? false;
    if (!chemins || !sources) {
      // CR-55 point 4 : sous node --test, jamais de défaut (cheminsParDefaut le refuse).
      const d = cheminsParDefaut();
      if (!d.ok) {
        journal?.warn?.(`[recette] journal non démarré : ${d.raison}`);
        return { demarre: false, raison: d.raison };
      }
      chemins = chemins ?? d.chemins;
      sources = sources ?? d.sources;
      bac = Boolean(d.bac);
    }
    const pid = reste.pid ?? processus.pid;
    const maintenant = horloge();
    // La garde du second serveur : un autre processus vivant a fait un tour il y a moins de 25 min.
    const battement = lireSync(chemins.battement).valeur;
    if (battement && battement.pid !== pid && estVivant(battement.pid) && battement.dernierTour && maintenant - ms(battement.dernierTour) < SEUIL_DU_TROU_MS) {
      const raison = `un autre serveur (pid ${battement.pid}) tient déjà le journal (dernier tour ${battement.dernierTour})`;
      journal?.warn?.(`[recette] journal non démarré : ${raison}.`);
      // P4b-1 (RC-14) : le pid du battement peut avoir été réutilisé par un autre programme. Une seconde tentative, une
      // seule, 25 min plus tard : si le battement n'a pas avancé, ce pid ne tient aucun journal et celui-ci démarre.
      if (options.secondeTentative === true) return { demarre: false, raison };
      const vu = battement.dernierTour;
      let suite = null;
      const reessai = minuteries.setTimeout(() => {
        try {
          const b = lireSync(chemins.battement).valeur;
          if (!b || (b.pid === battement.pid && b.dernierTour === vu)) suite = demarrerJournalDeLaRecette({ ...options, chemins, sources, secondeTentative: true });
        } catch {
          // rien : le serveur tourne quand même
        }
      }, SEUIL_DU_TROU_MS);
      reessai?.unref?.();
      return { demarre: false, raison, secondeTentativeDans: SEUIL_DU_TROU_MS, suite: () => suite, annuler: () => minuteries.clearTimeout(reessai) };
    }
    const marque = lireSync(chemins.dernierArret).valeur;
    const lireDirect = reste.lireDirect === undefined ? lireLeDirect : reste.lireDirect;
    // P3 : le classeur de la liste des causes (creerClasseur), sauf s'il est donné.
    const classer = reste.classer ?? creerClasseur({ causes: reste.causes ?? CAUSES_CONNUES });
    let arreter = () => {};
    const { secondeTentative: _seconde, ...pourLeJournal } = reste;
    // RC-14 : un second journal découvert à un tour arrête celui-ci (minuteries et écouteurs).
    const j = creerJournal({ ...pourLeJournal, classer, chemins, sources, bac, pid, horloge, demarreLe: maintenant, journal, lireDirect, avantDemarrage: { battement, marque }, surArret: () => arreter() });
    const surErreur = (erreur, origine) => {
      try {
        fs.mkdirSync(chemins.racine, { recursive: true });
        fs.writeFileSync(chemins.dernierArret, JSON.stringify({ version: 1, pid, le: new Date().toISOString(), type: 'erreur', origine: String(origine ?? ''), message: String(erreur?.stack ?? erreur?.message ?? erreur).slice(0, 2000) }));
      } catch {
        // jamais rien ici : Node va s'arrêter de toute façon
      }
    };
    const aLaSortie = (code) => {
      try {
        const avant = lireSync(chemins.dernierArret).valeur;
        const marqueErreur = avant && avant.pid === pid && avant.type === 'erreur';
        fs.mkdirSync(chemins.racine, { recursive: true });
        fs.writeFileSync(chemins.dernierArret, JSON.stringify(marqueErreur ? { ...avant, code } : { version: 1, pid, le: new Date().toISOString(), type: 'exit', code }));
      } catch {
        // idem
      }
    };
    processus.on('uncaughtExceptionMonitor', surErreur);
    processus.on('exit', aLaSortie);
    let intervalle = null;
    const premier = minuteries.setTimeout(() => {
      j.tic();
      intervalle = minuteries.setInterval(j.tic, INTERVALLE_MS);
      intervalle?.unref?.();
    }, PREMIER_TOUR_MS);
    premier?.unref?.();
    arreter = () => {
      try {
        minuteries.clearTimeout(premier);
        if (intervalle) minuteries.clearInterval(intervalle);
        processus.removeListener('uncaughtExceptionMonitor', surErreur);
        processus.removeListener('exit', aLaSortie);
      } catch {
        // rien
      }
    };
    journal?.log?.(`[recette] journal de la recette démarré (premier tour dans ${PREMIER_TOUR_MS / 60_000} min, puis toutes les ${INTERVALLE_MS / 60_000} min).`);
    return { demarre: true, journal: j, arreter, ecouteurs: { surErreur, aLaSortie } };
  } catch (e) {
    try {
      console.warn(`[recette] journal non démarré (le serveur tourne quand même) : ${e?.message ?? e}`);
    } catch {
      // rien
    }
    return { demarre: false, raison: String(e?.message ?? e) };
  }
}

/**
 * L'empreinte des causes vue par CE code (CR-19) : les trois fichiers de data/recette lus une fois (fs.promises),
 * normalisés (BOM, CRLF). null si l'un manque. Ne lève jamais.
 */
export async function lireLEmpreinteDesCauses({ dossier = ICI, fsp = fs.promises } = {}) {
  try {
    const textes = {};
    for (const nom of FICHIERS_DE_L_EMPREINTE) textes[nom] = await fsp.readFile(path.join(dossier, nom), 'utf8');
    return empreinteDesTextes(textes);
  } catch {
    return null;
  }
}

/** Le processus `pid` vit-il ? (signal 0 : ne fait rien au processus.) */
export function processusVivant(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === 'EPERM';
  }
}

/** Le lecteur du direct (état en mémoire du serveur) : import() de liveWatch.js, déjà chargé dans le serveur. */
export async function lireLeDirect(maintenant) {
  const { getLiveWatchStatus } = await import('../../jobs/liveWatch.js');
  return getLiveWatchStatus(maintenant);
}
