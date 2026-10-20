import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { listBets, fichierDesParis } from '../../data/repositories/betsRepository.js';
import { lireReglageGardeFous, fichierGardeFous } from '../../data/repositories/gardeFousRepository.js';
import { etatDesGardeFous, texteDuCoupeCircuit, semaineDeParis } from '../risk/gardeFous.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/tilt-state.json');

/**
 * État de "tilt" : coupe-circuit manuel permettant de suspendre toute
 * recommandation de mise (ex : après une série de pertes), sans toucher à
 * la configuration du moteur. Persisté sur disque (même pattern que
 * engineConfig.js) — un simple redémarrage du serveur (`node --watch`
 * redémarre à chaque sauvegarde de fichier backend) ne doit jamais
 * réactiver silencieusement des mises "RECOMMENDED" juste après que
 * l'utilisateur ait délibérément coupé le circuit.
 *
 * Étape 11 du plan (06/10/2026) : LES GARDE-FOUS de Pierre s'appuient sur CE
 * coupe-circuit, sans le doubler (core/risk/gardeFous.js). Le fichier garde
 * le seul interrupteur manuel ; `getTiltState()` rend l'état EFFECTIF :
 *   - `circuitBreakerActive` : enclenché à la main OU par un garde-fou (perte
 *     maximale de la semaine atteinte ou engagée ; réglage ou carnet
 *     illisibles alors qu'un plafond doit être vérifié) — c'est ce que lisent
 *     le moteur (findValueBet), le comparateur et les écrans ;
 *   - `coupeCircuitManuel` : l'interrupteur de Réglages seul ;
 *   - `automatique`, `coupeCircuit` : pourquoi il est enclenché ;
 *   - `plafondDeMise` : le conseil de mise ne le dépasse jamais
 *     (verdictPari.stakingDuMatch → plafonnerLeConseil) ;
 *   - `currentDownswing` : la série de pertes en cours, lue dans le carnet ;
 *   - `gardeFous.alertes` : ce que l'appli signale (haut de l'écran, Réglages,
 *     Performance paris).
 * Aucun garde-fou réglé (valeur par défaut) : rien ne change pour le moteur.
 * Un garde-fou ne bloque JAMAIS l'enregistrement d'un pari.
 */
const DEFAULT_STATE = { currentDownswing: 0, circuitBreakerActive: false };

function loadPersistedState() {
  try {
    return { ...DEFAULT_STATE, ...readJsonFile(STATE_FILE_PATH, {}) };
  } catch {
    // Illisible malgré les nouvelles tentatives (fichier corrompu) : repli sur l'état par défaut.
    return { ...DEFAULT_STATE };
  }
}

let state = loadPersistedState();

function persistState() {
  writeJsonAtomic(STATE_FILE_PATH, state);
}

// --------------------------------------------------- les garde-fous du moment

/** L'empreinte d'un fichier (absent : « absent ») : l'état se recalcule quand elle change. */
function empreinte(fichier) {
  try {
    const s = fs.statSync(fichier);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return 'absent';
  }
}

/** Un fichier illisible n'est retenté qu'au bout de 30 s : le Repérage analyse ~370 matchs d'affilée. */
const NOUVEL_ESSAI_MS = 30_000;
let memo = { cle: null, at: 0, valeur: null };
const dernierBon = { reglage: null, etat: null };

function calculerGardeFous(maintenant) {
  let reglage;
  let probleme = null;
  try {
    reglage = lireReglageGardeFous().reglage;
    dernierBon.reglage = reglage;
  } catch (error) {
    probleme = { motif: 'reglage-illisible', message: error.message };
    reglage = dernierBon.reglage;
  }
  if (!reglage) {
    // Un réglage présent mais illisible, jamais lu : ses plafonds ne peuvent pas être vérifiés — prudence.
    return { etat: null, probleme, automatique: { motif: 'reglage-illisible', texte: texteDuCoupeCircuit('reglage-illisible') } };
  }
  let paris;
  try {
    paris = listBets();
  } catch (error) {
    probleme = { motif: 'carnet-illisible', message: error.message };
    if (dernierBon.etat) return { etat: dernierBon.etat, probleme, automatique: automatiqueDe(dernierBon.etat) };
    // Sans carnet, une perte maximale réglée ne peut pas être vérifiée : pas de conseil de mise.
    const automatique = reglage.perteMaxParSemaine !== null ? { motif: 'carnet-illisible', texte: texteDuCoupeCircuit('carnet-illisible') } : null;
    return { etat: null, probleme, automatique };
  }
  const etat = etatDesGardeFous({ paris, reglage, maintenant });
  if (!probleme) dernierBon.etat = etat;
  return { etat, probleme, automatique: automatiqueDe(etat) };
}

const automatiqueDe = (etat) => (etat?.bloque ? { motif: etat.motif, texte: texteDuCoupeCircuit(etat.motif, etat) } : null);

/**
 * L'état des garde-fous (core/risk/gardeFous.js), relu seulement quand le
 * carnet, le réglage ou la semaine changent.
 * @returns {{ etat: object|null, probleme: object|null, automatique: object|null }}
 */
export function gardeFousDuMoment(maintenant = Date.now()) {
  const cle = [empreinte(fichierDesParis()), empreinte(fichierGardeFous()), semaineDeParis(maintenant).lundi].join('|');
  if (memo.cle === cle && (!memo.valeur.probleme || maintenant - memo.at < NOUVEL_ESSAI_MS)) return memo.valeur;
  const valeur = calculerGardeFous(maintenant);
  memo = { cle, at: maintenant, valeur };
  return valeur;
}

// ------------------------------------------------------------ l'état effectif

export function getTiltState() {
  const gf = gardeFousDuMoment();
  const manuel = Boolean(state.circuitBreakerActive);
  const automatique = gf.automatique ?? null;
  return {
    ...state,
    currentDownswing: gf.etat?.series?.enCours ?? state.currentDownswing,
    circuitBreakerActive: manuel || Boolean(automatique),
    coupeCircuitManuel: manuel,
    automatique,
    coupeCircuit: manuel ? { motif: 'manuel', texte: texteDuCoupeCircuit('manuel') } : automatique,
    plafondDeMise: gf.etat?.plafondDeMise ?? null,
    gardeFous: { alertes: gf.etat?.alertes ?? [], probleme: gf.probleme?.message ?? null }
  };
}

export function setCircuitBreaker(active) {
  state = { ...state, circuitBreakerActive: Boolean(active) };
  persistState();
  return getTiltState();
}

export function resetTiltState() {
  state = { ...DEFAULT_STATE };
  persistState();
  return getTiltState();
}
