/**
 * lectureDuDirect.js — LA LECTURE DU DIRECT : le tableau de tous les matchs suivis et le détail d'un match (étape 46 du plan,
 * lot 1, partie B ; conception § 3.3, § 3.4, § 4.1 ; décisions O1, O2, P2, P4, P5, P6 bis ; critique R2, R4, R9, R10, R11,
 * R24, R25, R28, R35 points 6 et 7, R37 points 4, 6, 8 et 9).
 * -----------------------------------------------------------------------
 * LECTURE SEULE : l'état de la boucle de E (getEtatMinute, getLiveWatchStatus, raisonCoupure), la ligne « service » de la
 * nuit (entreesDuDirect.js), les instantanés rangés (live_snapshots : la courbe et le rejeu) et les cotes gratuites en direct
 * (quotesForFixture, jamais les payantes). Rien n'est écrit, ni en base ni en fichier ; aucune requête au-dehors ; aucune
 * horloge : `maintenant` (millisecondes) est lu par le contrôleur et passé ici.
 *
 * tableauDuDirect(options) — LE TABLEAU : TOUS les matchs que la boucle suit, jamais coupés (P6 bis) : d'abord les FAITS de
 *   chacun (état, ligne d'avant-match, note), puis les CALCULS dans le budget de O2 (BUDGET_CALCUL_MS par requête) ; au-delà,
 *   `calcul.enAttente: true`, et la requête suivante (l'écran relit toutes les 30 s) les fait. Un match sans ligne de nuit,
 *   sans identifiant ou sans détail reste listé, avec ses faits et sa raison.
 * matchDuDirect(options) — UN MATCH (par `id`, ou par `home` + `away` + `coup`) : le même objet, plus tous les marchés, la
 *   minute 0 complète, la référence des cotes SANS écart (R2) et la courbe (un point par instantané) ; ou, s'il n'est pas suivi,
 *   { suivi: false, raison } avec une raison précise (R11) et l'objet `boucle`.
 * rejeuPermis() — le REJEU d'un instant (`instant`, R28 : l'état refait depuis live_snapshots) n'est permis que dans le bac
 *   ou dans une copie d'essai ; ailleurs, RejeuRefuse (le contrôleur répond 400).
 * enCoursDuDirect(options) — CORRECTIFS D2 (12/11/2026, point 2 a) : la liste LÉGÈRE de tous les matchs que la boucle suit EN
 *   COURS, sans plafond, depuis l'état de la boucle seulement (ni calcul, ni ligne de nuit, ni note) : l'interface s'en sert
 *   pour la puce « Direct » de chaque carte de rencontre et l'encart de la page du match, par les identifiants FotMob.
 * LA PAGE DU MATCH (correctifs D2, point 3) : `page` de chaque match suivi = { id, source } quand l'identifiant du match DANS
 *   L'APPLI est sûr — le `match_id` de sa ligne de nuit, sinon l'unique entrée du calendrier du même jour dont les DEUX clubs
 *   ont ses identifiants FotMob (l'annuaire des logos, jamais un nom comparé ici) ; deux entrées ou plus → null. Posée APRÈS
 *   les calculs : bâtir l'index du calendrier d'un jour ne prend jamais le budget des calculs (O2).
 *   CORRECTIFS D3 (12/11/2026, point 1) : l'index se bâtit SANS tenir la main — le fichier du calendrier (≈ 18 Mo) lu en
 *   asynchrone, les seuls éléments du jour analysés un par un, la main rendue toutes les 20 ms ; l'annuaire est l'annuaire
 *   STRICT (l'alias exact du club, dans sa compétition : findTeams), jamais les secours de clubDuMagasin (une requête de 100
 *   à 300 ms d'un seul tenant). La première requête d'un jour attend l'index sans tenir la main ; ensuite, un index de plus
 *   de 10 minutes est servi pendant qu'il se rebâtit à côté (aucune requête n'attend plus) ; une lecture ratée (fichier
 *   tronqué, illisible, d'une autre forme) n'est jamais gardée : l'index d'avant reste servi, ou aucun, et la requête
 *   suivante relit.
 * LA PAGE D'UN MATCH FINI (correctifs D3, point 2) : `page` de chaque match de `finis` (et de `fin`) = { id, source:
 *   'magasin' } quand sa fiche est rangée au magasin (`matches`, la page « match terminé » /match/<id> de l'appli) — trouvée
 *   par l'identifiant FotMob du match et son jour (à un jour près ; ses deux clubs quand il les a), sinon, pour une fiche
 *   rangée sans identifiant de match, par les identifiants FotMob de ses deux clubs et son jour ; jamais un nom. Aucune
 *   fiche, ou deux → null (l'écran dit « pas encore rangée »).
 *
 * LA TABLE EN MÉMOIRE (O1, R24 point 3) : les calculs sont rangés par la clé de O1 (cleDuCalcul), C0 par celle de R35 point 7
 *   (cleDeC0), l'ancrage par cleDeC0 de « ancrage » ; 600 entrées chacune, la plus ancienne oubliée d'abord. La table est
 *   RELUE juste avant CHAQUE calcul (après avoir rendu la main), et le résultat rangé avant de la rendre : deux requêtes en
 *   même temps ne font jamais deux fois le même calcul.
 * LE BUDGET (O2) : chaque calcul est un bloc ; la main est rendue (setImmediate) avant chaque bloc, et les faits rendent la
 *   main dès 20 ms ; le budget est relu au début de chaque match (un match commencé est fini) et de chaque point de la courbe.
 * LA VARIANTE (P2, P4) : celle de la note quand elle s'applique au match, sinon le réglage (`ancre-si-fair` : direct-ancre
 *   avec un `fair`, direct-v1 sans) ; une variante ancrée dont l'ancrage n'est pas fait (sans `fair`, ou λ + μ hors des bornes
 *   d'ANCRAGE : « total-hors-bornes ») se REPLIE sur sa variante non ancrée, et la raison est rendue (`calcul.repli`).
 * LA NOTE (P4, P5) : NOTE_DU_DIRECT de noteDuDirect.js (posée par le banc, partie C), chargée une fois par import()
 *   dynamique ; absente → `{ etat: 'non-juge' }` et `calcul.aBlanc: true` partout (les chiffres sont calculés, jamais montrés).
 *   Elle ne s'applique qu'aux lignes de SA grille, de SA version du moteur (et de SA candidate en branche « candidate ») :
 *   sinon « pas encore jugé pour cette version du moteur », à blanc. Correctif K4 (13/11, constat 4 du calcul) : à blanc, les
 *   chiffres ne sortent pas non plus du JSON (taireLesChiffres : 1N2, plus de 2,5, les deux marquent, minute 0, marchés,
 *   λ′ et μ′ de l'ancrage, la courbe hors « avant-match », la probabilité des lignes de référence) ; seuls les essais les
 *   lisent, par l'option `chiffresABlanc: true` (jamais passée par le contrôleur).
 * LA RECONDUCTION (§ 2.7 de la vérification de la 46, 18/11/2026 ; PROJET § 1 point 7) : une ligne d'une version du moteur
 *   RECONDUITE (inscrite par script dans reconductionDuDirect.js : de la version de la note vers celle de la ligne, même grille,
 *   preuve d'identité) est lue comme une ligne de la version jugée ; `calcul.note.reconduite` le dit ({ de, vers, le, nuits,
 *   rencontres }, null sinon) et l'écran l'écrit. Sans inscription, l'écran reste strict. Option `reconductions` (une
 *   liste, ou null : aucune) pour les essais ; par défaut RECONDUCTIONS. O15 (18/11) : l'inscription n'est acceptée qu'avec
 *   le SCELLEMENT de bancDuDirect.js (relu comme texte : la grille et les 19 modules du sceau), le registre des versions EN
 *   SERVICE (data/runtime/engine-versions.json : les deux numéros doivent y avoir les empreintes inscrites, code ET réglages ;
 *   option `registreDesVersions` pour les essais) et sa preuve entière recontrôlée à son sha1 ; sinon, stricte.
 * LES CLÉS (O1, R35 point 7) portent la GRILLE de la ligne (correctif K9 du 13/11) : deux lignes égales sauf la grille
 *   n'ont ni le même ancrage, ni le même calcul.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { getEtatMinute, getLiveWatchStatus } from '../../jobs/liveWatch.js';
import { raisonCoupure } from '../enregistreurs/etat.js';
import { env } from '../../config/env.js';
import { modeBacASable, estDans } from '../../config/bacASable.js';
import { quotesForFixture, SOURCES_ECHANGE } from '../db/oddsQuotesRepository.js';
import { removeMargin } from '../../core/market/marginRemoval.js';
import { PARAMS } from '../simulation/reglages.js';
import { nettoyerLibelle } from './libelleDuDirect.js';
import { suivre } from './memoireDuDirect.js';
import { etatDuMatch, etatDepuisInstantane, PHASES_CALCULEES } from './etatDuDirect.js';
import { lecturesDuDirect, ancrer, minute0, cleDuCalcul, cleDeC0, varianteAfficheePour, IDS_DES_VARIANTES, COUPES } from './calculDuDirect.js';
import { ligneDeService, nuitComplete } from './entreesDuDirect.js';
import { RECONDUCTIONS, reconductionPour, resumeDeLaReconduction, scellementDuTexte, identitesDuRegistre, jourDeParis } from './reconductionDuDirect.js';
import { CALENDAR_FILE_PATH } from '../repositories/seasonCalendarRepository.js';
import { findTeams } from '../db/identityRegistry.js';
import { creerPauses } from '../../utils/travailCooperatif.js';
import {
  VERSION_DU_DIRECT,
  BUDGET_CALCUL_MS,
  TABLE_CALCULS_MAX,
  AMBRE_ETAT_MS,
  PERIME_APRES_MS,
  FINIS_GARDES_MS,
  COURBE_TROU_MS,
  LIGNE_ABSENTE_RELUE_MS,
  LIGNES,
  VARIANTES_AFFICHABLES,
  VARIANTE_AFFICHEE
} from './reglagesDirect.js';

const MINUTE_MS = 60_000;
const HEURE_MS = 3_600_000;
const JOUR_MS = 24 * HEURE_MS;

/** R10 point 2 : « PC en veille ou boucle arrêtée » seulement quand le dernier tour a plus de 5 minutes (le seuil de l'alerte de E). */
export const BOUCLE_VIVANTE_MS = 5 * MINUTE_MS;
/** R28 point 1 : le rejeu reprend les matchs qui ont un instantané dans les 6 minutes d'avant l'instant. */
export const REJEU_FENETRE_MS = 6 * MINUTE_MS;
/** R11 point 1 : « pas encore vu » tant que l'heure prévue du coup d'envoi est passée depuis moins de 30 minutes. */
export const PAS_ENCORE_VU_MS = 30 * MINUTE_MS;
/** § 3.4 : la référence des cotes d'un match gardée 60 secondes en mémoire. */
export const REFERENCE_GARDEE_MS = 60_000;
/** § 4.1 : le match d'une route par identifiants est celui dont le coup d'envoi est à moins de 3 heures de `coup`. */
const COUP_D_ENVOI_ECART_MS = 3 * HEURE_MS;
/** Les faits (lignes de nuit, états) rendent la main dès 20 ms d'un seul tenant (O2 : aucun bloc de plus de 100 ms). */
const BLOC_DE_FAITS_MS = 20;
/** Les lignes de nuit gardées en mémoire sont oubliées 12 heures après leur lecture. */
const LIGNE_OUBLIEE_MS = 12 * HEURE_MS;
/** Correctifs D2, point 3 : l'index du calendrier d'un jour (paire d'identifiants FotMob → pages) gardé 10 minutes. */
const CALENDRIER_GARDE_MS = 10 * MINUTE_MS;
/** Correctifs D3, point 1 : l'index d'un jour qu'aucune lecture n'a pu rebâtir est oublié 12 heures après sa construction. */
const CALENDRIER_OUBLIE_MS = 12 * HEURE_MS;
/** R9 point 3 : ambre quand la ligne a plus de 24 heures au coup d'envoi, ou ses cotes plus de 12. */
const LIGNE_AMBRE_H = 24;
const COTES_AMBRE_H = 12;
/** Les variantes qu'une note peut faire montrer (P1) : toutes sauf `direct-sans-effets` (R34 : PARAMS_SANS_EFFETS n'est pas importé ici). */
export const VARIANTES_MONTRABLES = Object.freeze(IDS_DES_VARIANTES.filter((id) => id !== 'direct-sans-effets'));
/** Le repli d'une variante ancrée dont l'ancrage n'est pas fait (sans `fair`, ou λ + μ hors des bornes : `total-hors-bornes`). */
export const REPLIS_DE_L_ANCRAGE = Object.freeze({ 'direct-ancre': 'direct-v1', 'temps-restant-ancre': 'temps-restant' });
/** Les marchés de la référence (§ 3.4) et l'ordre de leurs issues ; « ou » seulement aux lignes que le lot 1 calcule (LIGNES). */
const MARCHES_DE_REFERENCE = Object.freeze({ '1x2': ['home', 'draw', 'away'], ou: ['over', 'under'], btts: ['yes', 'no'] });
const ORDRE_DES_MARCHES = Object.freeze(['1x2', 'ou', 'btts']);
/** R2 point 4 : une source d'échange retardée (son prix n'est jamais celui de l'instant). */
const SOURCES_RETARDEES = new Set(['smarkets']);
/** Les verdicts d'une note (banc-regles-etape46 § 10). */
const VERDICTS = Object.freeze(['faits-seuls', 'montre-non-tranche', 'prouve', 'pas-prouve']);
/** Les raisons d'un match non suivi (R11 point 1 ; une phrase chacune dans ui/src/utils/direct.js). */
export const RAISONS_NON_SUIVI = Object.freeze(['fini', 'coupure-4h', 'boucle-coupee', 'boucle-suspendue', 'pas-demarree', 'pas-commence', 'pas-encore-vu', 'plus-suivi', 'inconnu']);
/** Pourquoi la boucle ne suit pas, ou plus (R10) ; `null` quand elle tourne. */
export const POURQUOI_DE_LA_BOUCLE = Object.freeze(['coupee', 'bac-a-sable', 'pas-demarree', 'suspendue', 'plus-de-tour']);
/** Les causes d'un relevé périmé, par match (R10 point 3). */
export const CAUSES_DU_PERIME = Object.freeze(['plus-de-tour', 'suspendue', 'boucle-coupee', 'fotmob-erreurs', 'absent-de-la-liste', 'rejeu', 'inconnue']);

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const iso = (t) => (fini(t) ? new Date(t).toISOString() : null);
const enMs = (v) => {
  if (fini(v)) return v;
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const ageEnS = (depuis, heure) => (fini(depuis) && fini(heure) ? Math.max(0, Math.round((heure - depuis) / 1000)) : null);
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);
const dixieme = (x) => Math.round(x * 10) / 10;
const copie = (v) => (v === undefined || v === null ? null : structuredClone(v));
const appeler = (source, ...args) => (typeof source === 'function' ? source(...args) : source);

/** Un rejeu demandé hors du bac et d'une copie d'essai (R28) : le contrôleur répond 400. */
export class RejeuRefuse extends Error {
  constructor(message = 'Le rejeu d’un instant n’est permis que dans le bac à sable ou dans une copie d’essai.') {
    super(message);
    this.name = 'RejeuRefuse';
    this.code = 'rejeu-refuse';
  }
}

/** Le dossier `server` de CE code (src/data/direct → trois niveaux plus haut). */
const SERVEUR_DU_CODE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// ------------------------------------------------------------ § 2.7, O15 : ce que l'écran relit avant d'accepter une reconduction

const FICHIER_DU_BANC = path.join(SERVEUR_DU_CODE, 'src', 'data', 'direct', 'bancDuDirect.js');
const FICHIER_DES_VERSIONS = path.join(SERVEUR_DU_CODE, 'data', 'runtime', 'engine-versions.json');
const sha1DuTexte = (t) => crypto.createHash('sha1').update(t).digest('hex');
let sceauLu = null;
/** Le SCELLEMENT de bancDuDirect.js, relu comme TEXTE une fois (jamais importé) ; null s'il est vide ou ne se lit pas (jamais gardé). */
function scellementDuBanc() {
  if (sceauLu) return sceauLu;
  try {
    sceauLu = scellementDuTexte(fs.readFileSync(FICHIER_DU_BANC, 'utf8'));
  } catch {
    return null;
  }
  return sceauLu;
}
let registreLu = { signature: null, identites: null };
/** Les identités du registre des versions EN SERVICE, relues quand le fichier change ; null s'il manque ou ne se lit pas. */
function identitesEnService() {
  try {
    const st = fs.statSync(FICHIER_DES_VERSIONS);
    const signature = `${st.mtimeMs}:${st.size}`;
    if (registreLu.signature === signature) return registreLu.identites;
    const identites = identitesDuRegistre(JSON.parse(fs.readFileSync(FICHIER_DES_VERSIONS, 'utf8')));
    if (!identites) return null;
    registreLu = { signature, identites };
    return identites;
  } catch {
    return null;
  }
}
/**
 * La reconduction qui vaut pour (grille, de, vers), une fois par requête (`memo`) : avec le sceau, le registre en service (ou
 * celui de l'essai) et le sha1 de la preuve ; null sinon. `r` : { liste, registre, aujourdhui, memo } (contexte), ou une liste.
 */
function reconductionDuMatch(r, q) {
  const liste = Array.isArray(r) ? r : r?.liste;
  if (!Array.isArray(liste) || liste.length === 0) return null;
  const cle = `${q.grille}|${q.de}|${q.vers}`;
  if (r?.memo?.has(cle)) return r.memo.get(cle);
  const scellement = scellementDuBanc();
  const identites = r?.registre !== undefined && !Array.isArray(r) ? identitesDuRegistre(r.registre) : identitesEnService();
  const i = scellement && identites ? reconductionPour(q, liste, { scellement, identiteDe: (n) => identites[n] ?? null, sha1: sha1DuTexte, aujourdhui: r?.aujourdhui ?? null }) : null;
  r?.memo?.set(cle, i);
  return i;
}

/**
 * Le rejeu d'un instant est-il permis (R28) ? Dans le bac (modeBacASable) ou dans une copie d'essai : CM_TEST_DOSSIER doit
 * CONTENIR ce code (mineur du 13/11 soir, comme le correctif C5 de scripts/etape46.mjs) — un dossier étranger n'ouvre rien.
 */
export function rejeuPermis({ env: variables = process.env, bac = undefined } = {}) {
  const dansLeBac = bac === undefined ? modeBacASable(variables) : Boolean(bac);
  return dansLeBac || (Boolean(variables?.CM_TEST_DOSSIER) && estDans(SERVEUR_DU_CODE, variables.CM_TEST_DOSSIER));
}

// ------------------------------------------------------------ les tables en mémoire (O1, R24, R35 point 7)

/** Une table bornée : la plus ancienne (la moins relue) oubliée d'abord. */
class Table {
  constructor(max) {
    this.max = max;
    this.m = new Map();
  }
  lire(cle) {
    const v = this.m.get(cle);
    if (v !== undefined) {
      this.m.delete(cle);
      this.m.set(cle, v);
    }
    return v;
  }
  ranger(cle, v) {
    this.m.delete(cle);
    this.m.set(cle, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value);
  }
  get taille() {
    return this.m.size;
  }
  vider() {
    this.m.clear();
  }
}

const TABLES = {
  calculs: new Table(TABLE_CALCULS_MAX),
  c0: new Table(TABLE_CALCULS_MAX),
  ancrages: new Table(TABLE_CALCULS_MAX),
  courbe: new Table(TABLE_CALCULS_MAX)
};
let lignesParBase = new WeakMap();
let referencesParBase = new WeakMap();
/** Correctifs D2, point 3 : par base, l'index du calendrier de chaque jour lu ; correctifs D3, point 1 : { at (sa construction),
 *  index (null tant qu'aucune lecture n'a réussi), construction (la promesse en cours, ou null), bilan, erreur }. */
let calendriersParBase = new WeakMap();
const COMPTEURS = { calculs: 0, c0: 0, ancrages: 0, courbe: 0, lignes: 0, references: 0 };

const tableDe = (parBase, database) => {
  let t = parBase.get(database);
  if (!t) {
    t = new Map();
    parBase.set(database, t);
  }
  return t;
};

/** Pour les tests : tout oublier (tables, lignes, références, compteurs, note chargée). */
export function viderLesTables() {
  for (const t of Object.values(TABLES)) t.vider();
  lignesParBase = new WeakMap();
  referencesParBase = new WeakMap();
  calendriersParBase = new WeakMap();
  for (const k of Object.keys(COMPTEURS)) COMPTEURS[k] = 0;
  noteChargee = null;
}

/** Pour les tests : la taille des tables et les compteurs de calculs FAITS depuis le dernier viderLesTables(). */
export function etatDesTables() {
  return {
    tailles: Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [k, t.taille])),
    max: TABLE_CALCULS_MAX,
    compteurs: { ...COMPTEURS }
  };
}

/** Pour les tests (correctifs D3, point 1) : l'index du calendrier de chaque jour d'une base — construit quand, prêt ou non,
 *  en construction ou non, la dernière erreur de lecture, le bilan de la dernière construction réussie (ms, plus long bloc,
 *  mains rendues, entrées du jour). */
export function etatDesCalendriers(database) {
  const jours = calendriersParBase.get(database);
  return jours ? [...jours].map(([jour, g]) => ({ jour, at: iso(g.at), pret: Boolean(g.index), enConstruction: Boolean(g.construction), erreur: g.erreur, bilan: copie(g.bilan) })) : [];
}

/** Pour les tests (correctifs D3, point 1) : attendre les index du calendrier d'une base qui se rebâtissent à côté. */
export async function calendriersBatis(database) {
  const jours = calendriersParBase.get(database);
  await Promise.all(jours ? [...jours.values()].map((g) => g.construction).filter(Boolean) : []);
}

// ------------------------------------------------------------ la note (P4, P5)

let noteChargee = null;
/** NOTE_DU_DIRECT, chargée une fois par import() dynamique : absente → « sans-note », illisible → « note-illisible ». */
function chargerLaNote() {
  if (!noteChargee) {
    noteChargee = import('./noteDuDirect.js').then(
      (m) => ({ note: m.NOTE_DU_DIRECT ?? null, raison: null }),
      (e) => ({ note: null, raison: e?.code === 'ERR_MODULE_NOT_FOUND' ? 'sans-note' : 'note-illisible' })
    );
  }
  return noteChargee;
}

/** Une note au format de banc-regles § 10 (format 1, grille, version, rôle, verdict et variante connus) ? */
function noteValide(n) {
  if (!n || typeof n !== 'object') return false;
  if (n.format !== 1 || typeof n.modele !== 'string' || !n.modele || n.version === null || n.version === undefined) return false;
  if (!VERDICTS.includes(n.verdict) || !VARIANTES_MONTRABLES.includes(n.variante)) return false;
  return n.role === 'service' || (n.role === 'candidate' && typeof n.candidateHash === 'string' && n.candidateHash.length > 0);
}

/** `option` : undefined → noteDuDirect.js ; null → aucune note ; un objet → cette note (les tests). */
async function laNote(option) {
  if (option === null) return { note: null, raison: 'sans-note' };
  const brute = option === undefined ? await chargerLaNote() : { note: option, raison: null };
  if (brute.note === null || brute.note === undefined) return { note: null, raison: brute.raison ?? 'sans-note' };
  return noteValide(brute.note) ? { note: brute.note, raison: null } : { note: null, raison: 'note-illisible' };
}

/** Le résumé de la note pour l'écran (§ 4.1, § 5.5) : `{ etat: 'non-juge', raison }` sans note. */
function resumeDeLaNote({ note, raison }) {
  if (!note) return { etat: 'non-juge', raison };
  const p = note.paires ?? {};
  return {
    etat: 'juge',
    raison: null,
    format: note.format,
    modele: note.modele,
    version: note.version,
    role: note.role,
    candidateHash: note.candidateHash ?? null,
    variante: note.variante,
    regard: note.regard ?? null,
    verdict: note.verdict,
    passeLe: note.passeLe ?? null,
    matchs: note.export?.matchs ?? note.n ?? null,
    tranchesNonMontrees: copie(note.tranchesNonMontrees ?? []),
    famillesNonMontrees: copie(note.famillesNonMontrees ?? []),
    ecartees: copie(p.ecartees ?? []),
    aSurveiller: copie(p.aSurveiller ?? []),
    phrase: note.phrase ?? null
  };
}

/** La tranche (les 8 bandes de PARAMS.bandes, celles du banc) d'un créneau ; null hors des créneaux. */
export function trancheDuCreneau(creneau) {
  if (!Number.isInteger(creneau)) return null;
  const b = PARAMS.bandes.find(([, lo, hi]) => creneau >= lo && creneau <= hi);
  return b ? b[0] : null;
}

/**
 * LA NOTE APPLIQUÉE À UN MATCH (P4 : une note par grille) : seulement si la ligne a la grille, la version du moteur (et, en
 * branche « candidate », l'empreinte) de la note ; les paires écartées et à surveiller de SA tranche ; ses familles non
 * montrées. `aBlanc` : sans note, note qui ne s'applique pas, verdict « faits seuls », ou tranche non montrée.
 * § 2.7 (18/11/2026) : une ligne d'une AUTRE version que celle de la note passe aussi quand cette version est RECONDUITE
 * (reconductionDuMatch : l'unique inscription de sa version, partie de celle de la note, de la même grille, contrôlée avec le
 * sceau, le registre en service et sa preuve) ; `reconduite` le dit. Une note de rôle « candidate » n'est jamais contournée.
 */
function noteDuMatch(n, ligne, tranche, reconductions = RECONDUCTIONS) {
  const base = { applique: false, raison: null, verdict: null, regard: null, tranche, trancheNonMontree: false, famillesNonMontrees: [], ecartees: [], aSurveiller: [], reconduite: null };
  if (!n.note) return { ...base, raison: n.raison ?? 'sans-note' };
  if (!ligne?.trouve) return { ...base, raison: 'sans-avant-match' };
  const note = n.note;
  const memeGrille = ligne.grille === note.modele;
  const memeVersion = String(ligne.engineVersion) === String(note.version);
  const reconduite = memeGrille && !memeVersion ? reconductionDuMatch(reconductions, { grille: ligne.grille, de: note.version, vers: ligne.engineVersion }) : null;
  const memeCandidate = note.role !== 'candidate' || ligne.candidateHash === note.candidateHash;
  if (!(memeGrille && (memeVersion || reconduite) && memeCandidate)) return { ...base, raison: 'pas-juge-pour-cette-version' };
  const deLaTranche = (liste) => (Array.isArray(liste) ? liste.filter((p) => !p || typeof p !== 'object' || p.tranche === undefined || p.tranche === null || p.tranche === tranche).map((p) => copie(p)) : []);
  return {
    ...base,
    applique: true,
    verdict: note.verdict,
    regard: note.regard ?? null,
    trancheNonMontree: tranche !== null && Array.isArray(note.tranchesNonMontrees) && note.tranchesNonMontrees.includes(tranche),
    famillesNonMontrees: copie(note.famillesNonMontrees ?? []),
    ecartees: deLaTranche(note.paires?.ecartees),
    aSurveiller: deLaTranche(note.paires?.aSurveiller),
    reconduite: reconduite ? resumeDeLaReconduction(reconduite) : null
  };
}
const aBlancPour = (nm) => !nm.applique || nm.verdict === 'faits-seuls' || nm.trancheNonMontree;

// ------------------------------------------------------------ le contexte d'une requête

function contexte(options = {}) {
  const { maintenant, database } = options;
  if (!fini(maintenant)) throw new TypeError('lectureDuDirect : `maintenant` (millisecondes) est obligatoire — l’heure est lue par le contrôleur.');
  if (!database || typeof database.prepare !== 'function') throw new TypeError('lectureDuDirect : `database` est obligatoire.');
  const brut = options.instant ?? null;
  let instant = null;
  if (brut !== null) {
    instant = enMs(brut);
    if (instant === null) throw new TypeError('lectureDuDirect : `instant` illisible (date ISO attendue).');
    const permis = options.rejeuPermis === undefined ? rejeuPermis() : Boolean(options.rejeuPermis);
    if (!permis) throw new RejeuRefuse();
  }
  const reglage = options.varianteAffichee ?? VARIANTE_AFFICHEE;
  if (!VARIANTES_AFFICHABLES.includes(reglage)) throw new TypeError(`lectureDuDirect : variante affichée inconnue (${reglage}).`);
  const budgetMs = fini(options.budgetMs) && options.budgetMs >= 0 ? options.budgetMs : BUDGET_CALCUL_MS;
  const t0 = performance.now();
  return {
    maintenant,
    database,
    instant,
    heure: instant ?? maintenant,
    reglage,
    budgetMs,
    t0,
    debutDeBloc: t0,
    note: null,
    sources: {
      etatMinute: options.etatMinute ?? ((t) => getEtatMinute(t)),
      statut: options.statut ?? ((t) => getLiveWatchStatus(t)),
      coupure: options.coupure ?? (() => raisonCoupure()),
      bac: options.bac ?? modeBacASable(),
      interrupteurs: options.interrupteurs ?? { direct: env.enregistreurs?.direct !== false, actualisation: env.matchStatsRefresh?.enabled === true },
      ligneDe: options.ligneDe ?? ligneDeService,
      // Correctifs D2, point 3 : les entrées du calendrier d'un jour (AAAA-MM-JJ) et l'identifiant FotMob d'un club du
      // calendrier ; les tests les fabriquent. Correctifs D3, point 1 : par défaut, le fichier du calendrier lu sans tenir
      // la main (`fichierCalendrier` : un autre fichier, pour les tests) et l'annuaire STRICT (clubDeLAnnuaire).
      calendrier: options.calendrier ?? ((jour, outils) => calendrierDuJour(jour, { ...outils, fichier: options.fichierCalendrier ?? CALENDAR_FILE_PATH })),
      club: options.club ?? null
    },
    noteOption: options.note,
    // § 2.7 : les reconductions (RECONDUCTIONS par défaut ; un essai passe sa liste, ou null : aucune), le registre des versions
    // (celui en service par défaut ; un essai passe le sien), le jour (Paris) de l'heure réelle, et la mémoire de la requête.
    reconductions: { liste: options.reconductions === undefined ? RECONDUCTIONS : options.reconductions, registre: options.registreDesVersions, aujourdhui: jourDeParis(new Date(maintenant).toISOString()), memo: new Map() },
    // P5 : à blanc, aucun chiffre ne sort de la lecture ; seuls les essais les lisent (chiffresABlanc: true).
    chiffresABlanc: options.chiffresABlanc === true,
    // Correctifs D3, point 1 : l'index du calendrier de chaque jour, demandé une fois par requête (indexDuCalendrier).
    indexDesJours: new Map(),
    calculs: { faits: 0, deTable: 0, enAttente: 0, sansCalcul: 0, ancrages: 0, c0: 0, courbe: 0, rendus: 0, blocMaxMs: 0 }
  };
}

/** Rendre la main (O2) : le bloc qui finit est mesuré, la suite repart après les autres tâches. */
async function rendreLaMain(ctx) {
  const t = performance.now();
  ctx.calculs.blocMaxMs = Math.max(ctx.calculs.blocMaxMs, t - ctx.debutDeBloc);
  ctx.calculs.rendus++;
  await new Promise((r) => setImmediate(r));
  ctx.debutDeBloc = performance.now();
}
const budgetEpuise = (ctx) => performance.now() - ctx.t0 >= ctx.budgetMs;

function bilanDesCalculs(ctx) {
  const fin = performance.now();
  const c = ctx.calculs;
  c.blocMaxMs = Math.max(c.blocMaxMs, fin - ctx.debutDeBloc);
  return {
    faits: c.faits,
    deTable: c.deTable,
    enAttente: c.enAttente,
    sansCalcul: c.sansCalcul,
    ancrages: c.ancrages,
    c0: c.c0,
    courbe: c.courbe,
    rendus: c.rendus,
    ms: dixieme(fin - ctx.t0),
    blocMaxMs: dixieme(c.blocMaxMs),
    budgetMs: ctx.budgetMs
  };
}

/**
 * Les lignes de nuit et les références gardées trop longtemps sont oubliées (au début de chaque requête). Correctifs D3,
 * point 1 : l'index du calendrier d'un jour n'est plus oublié à 10 minutes (il est servi pendant qu'il se rebâtit) ; il
 * l'est 12 heures après sa construction, ou s'il n'a jamais été bâti (lecture ratée), jamais pendant une construction.
 */
function purger(ctx) {
  const lignes = lignesParBase.get(ctx.database);
  if (lignes) for (const [k, v] of lignes) if (ctx.maintenant - v.luA > LIGNE_OUBLIEE_MS || ctx.maintenant < v.luA) lignes.delete(k);
  const refs = referencesParBase.get(ctx.database);
  if (refs) for (const [k, v] of refs) if (ctx.maintenant - v.at >= REFERENCE_GARDEE_MS || ctx.maintenant < v.at) refs.delete(k);
  const jours = calendriersParBase.get(ctx.database);
  if (jours) for (const [k, v] of jours) if (!v.construction && (v.at === null || ctx.maintenant - v.at > CALENDRIER_OUBLIE_MS || ctx.maintenant < v.at)) jours.delete(k);
}

/** Attendre un travail fait À CÔTÉ de la requête (l'index du calendrier) : le bloc d'avant est mesuré, l'attente ne compte pas (O2). */
async function attendreAilleurs(ctx, promesse) {
  ctx.calculs.blocMaxMs = Math.max(ctx.calculs.blocMaxMs, performance.now() - ctx.debutDeBloc);
  try {
    return await promesse;
  } finally {
    ctx.debutDeBloc = performance.now();
  }
}

/** La dernière nuit complète, lue une fois par requête (une base sans la table de la 28 → null). */
function nuitDe(ctx) {
  try {
    return nuitComplete(ctx.database);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ la boucle (R10)

const chargeVide = () => ({ depuis: null, tours: null, listesDuDirect: null, listesFotmob: null, listesServies: null, listesEnEchec: null, details: null, horsPlafond: null });

/**
 * L'OBJET `boucle` (R10) : `pourquoi` vient des MÊMES sources que la carte des enregistreurs (raisonCoupure, l'interrupteur
 * du direct, getLiveWatchStatus) — `phrase` est celle de raisonCoupure, mot pour mot ; « plus-de-tour » seulement quand le
 * dernier tour a plus de 5 minutes ; hors match, l'état est « vide », jamais « périmé » ; `rythme` : `minute` ou `attente`
 * (lu dans dernierTour.attente). `charge.listesFotmob` compte les lectures de la liste par TOUTES les boucles (le partage).
 */
function laBoucle(ctx, em, statut) {
  const nb = (em.matchs ?? []).length;
  if (ctx.instant !== null) {
    return {
      active: true,
      pourquoi: null,
      phrase: null,
      etat: nb ? 'suivi' : 'vide',
      rythme: null,
      vivante: null,
      dernierTourLe: null,
      dernierTourAgeS: null,
      listeLueLe: null,
      listeAgeS: null,
      listeRecueLe: null,
      prochainCoupDEnvoi: null,
      suspendueJusqua: null,
      erreurs: { consecutives: null, derniere: null, depuis: null },
      suivi46: { module: null, raison: null, pannes: null, dernierePanne: null },
      charge: chargeVide(),
      rejeu: { instant: iso(ctx.instant), fenetreMinutes: REJEU_FENETRE_MS / MINUTE_MS, source: 'live_snapshots' }
    };
  }
  const coupure = appeler(ctx.sources.coupure);
  const inter = ctx.sources.interrupteurs ?? {};
  const dt = em.dernierTour ?? statut.dernierTour ?? null;
  const dernierTourA = enMs(dt?.at);
  let pourquoi = null;
  let phrase = null;
  if (coupure) {
    pourquoi = ctx.sources.bac && inter.actualisation === false ? 'bac-a-sable' : /^pas encore/.test(String(coupure)) ? 'pas-demarree' : 'coupee';
    phrase = String(coupure);
  } else if (inter.direct === false) {
    pourquoi = 'coupee';
    phrase = 'boucle du direct coupée (ENREGISTREURS_DIRECT=false)';
  } else if (statut.suspendu) {
    pourquoi = 'suspendue';
  } else if (!statut.running) {
    pourquoi = 'coupee';
  } else if (dernierTourA === null) {
    pourquoi = 'pas-demarree';
  } else if (ctx.heure - dernierTourA > BOUCLE_VIVANTE_MS) {
    pourquoi = 'plus-de-tour';
  }
  const active = pourquoi === null || pourquoi === 'plus-de-tour';
  const listeA = enMs(em.listeFotmobA);
  return {
    active,
    pourquoi,
    phrase,
    etat: !active ? 'arretee' : nb ? 'suivi' : 'vide',
    rythme: !dt ? null : dt.suspendu ? 'suspendu' : Object.hasOwn(dt, 'attente') ? 'attente' : 'minute',
    vivante: dernierTourA !== null && ctx.heure - dernierTourA <= BOUCLE_VIVANTE_MS,
    dernierTourLe: iso(dernierTourA),
    dernierTourAgeS: ageEnS(dernierTourA, ctx.heure),
    listeLueLe: iso(listeA),
    listeAgeS: ageEnS(listeA, ctx.heure),
    listeRecueLe: iso(enMs(em.derniereListe)),
    prochainCoupDEnvoi: iso(enMs(em.prochainCoupDEnvoi)),
    suspendueJusqua: iso(enMs(statut.suspenduJusqua) ?? enMs(em.suspenduJusqua)),
    erreurs: {
      consecutives: fini(statut.erreursConsecutives) ? statut.erreursConsecutives : null,
      derniere: statut.derniereErreur ? { at: statut.derniereErreur.at ?? null, message: statut.derniereErreur.message ?? null } : null,
      depuis: statut.erreur?.depuis ?? null
    },
    suivi46: {
      module: em.module46?.etat ?? null,
      raison: em.module46?.raison ?? null,
      pannes: fini(em.erreurs46?.n) ? em.erreurs46.n : null,
      dernierePanne: em.erreurs46?.derniere ? { at: em.erreurs46.derniere.at ?? null, message: em.erreurs46.derniere.message ?? null } : null
    },
    charge: {
      depuis: statut.startedAt ?? em.startedAt ?? null,
      tours: em.charge?.tours ?? null,
      listesDuDirect: em.charge?.listes ?? null,
      listesFotmob: em.charge?.listesFotmob ?? null,
      listesServies: em.charge?.listesServies ?? null,
      listesEnEchec: em.charge?.listesEnEchec ?? null,
      details: em.charge?.details ?? null,
      horsPlafond: em.charge?.horsPlafond ?? null
    },
    rejeu: null
  };
}

// ------------------------------------------------------------ les faits d'un match

const CHAMPS_AVANT_MATCH = Object.freeze(['cle', 'nuit', 'calculeLe', 'grille', 'engineVersion', 'candidateHash', 'lambda', 'mu', 'rho', 'oddsSource', 'oddsAt', 'kickoff', 'kickoffConnu', 'date', 'decalageJours', 'ageAuCoupDEnvoiH', 'coteAgeAuCoupDEnvoiH']);

/** La ligne d'avant-match rendue (R9 : sa provenance), structure COMPLÈTE dans tous les cas (§ 3.2). */
function avantMatchDe(lb) {
  const o = { trouve: Boolean(lb?.trouve), raison: lb?.raison ?? null };
  for (const k of CHAMPS_AVANT_MATCH) o[k] = lb?.[k] ?? null;
  o.fair = lb?.fair ? { home: lb.fair.home, draw: lb.fair.draw, away: lb.fair.away } : null;
  o.ambre = Boolean(lb?.trouve) && ((fini(lb.ageAuCoupDEnvoiH) && lb.ageAuCoupDEnvoiH > LIGNE_AMBRE_H) || (fini(lb.coteAgeAuCoupDEnvoiH) && lb.coteAgeAuCoupDEnvoiH > COTES_AMBRE_H));
  return o;
}

/** La ligne « service » d'un match : gardée tant que la nuit complète ne change pas ; une absence relue au plus toutes les 10 minutes (R37 point 8). */
function ligneDuMatch(m, ctx, nuit) {
  const table = tableDe(lignesParBase, ctx.database);
  const cle = `${m.id}|${m.homeId}|${m.awayId}|${m.kickoff}`;
  const g = table.get(cle);
  const relire = !g || g.nuit !== nuit || (!g.ligne?.trouve && ctx.maintenant - g.luA >= LIGNE_ABSENTE_RELUE_MS);
  if (!relire) return g.ligne;
  let ligne;
  try {
    ligne = ctx.sources.ligneDe({ homeId: m.homeId, awayId: m.awayId, kickoff: m.kickoff, database: ctx.database, nuit });
  } catch {
    ligne = { trouve: false, raison: 'ligne-illisible', cle: null, nuit };
  }
  if (!ligne || typeof ligne !== 'object') ligne = { trouve: false, raison: 'ligne-illisible', cle: null, nuit };
  COMPTEURS.lignes++;
  table.set(cle, { ligne, nuit, luA: ctx.maintenant });
  return ligne;
}

/**
 * L'ÂGE DU RELEVÉ d'un match (R3, R4) : depuis la dernière VRAIE lecture de la liste (la mémoire ; sans mémoire, listeFotmobA
 * de la boucle) ; `perimeCause` dit pourquoi un relevé est périmé, d'après ce qui est su (R10 point 3).
 */
function releveDuMatch(e, ctx, { em, boucle, statut }) {
  const listeFotmobA = enMs(em.listeFotmobA);
  const lueA = e.memoire ? e.releve.listeLueA : listeFotmobA;
  const age = ageEnS(lueA, ctx.heure);
  const ambre = e.memoire ? e.releve.ambre : age !== null && age * 1000 > AMBRE_ETAT_MS;
  const perime = e.memoire ? e.releve.perime : age !== null && age * 1000 > PERIME_APRES_MS;
  let cause = null;
  if (perime) {
    if (ctx.instant !== null) cause = 'rejeu';
    else if (boucle.pourquoi === 'plus-de-tour') cause = 'plus-de-tour';
    else if (boucle.pourquoi === 'suspendue') cause = 'suspendue';
    else if (boucle.pourquoi) cause = 'boucle-coupee';
    else if (fini(statut.erreursConsecutives) && statut.erreursConsecutives > 0) cause = 'fotmob-erreurs';
    else if (fini(listeFotmobA) && fini(lueA) && listeFotmobA > lueA) cause = 'absent-de-la-liste';
    else cause = 'inconnue';
  }
  return {
    releveLe: iso(lueA),
    ageS: age,
    ambre,
    perime,
    perimeCause: cause,
    fige: e.releve.fige,
    figeDepuisLe: e.releve.fige ? iso(e.releve.libelleDepuisA) : null,
    copies: e.releve.copies
  };
}

/** L'état rendu (§ 4.1, R2 point 3, R3, R5) : des heures ISO, `null` quand c'est inconnu, jamais 0. */
function etatRendu(e, tranche, releve) {
  const s = e.score;
  const r = e.rouges;
  return {
    phase: e.phase,
    raison: e.raison,
    calculable: e.calculable,
    minute: e.minute.valeur,
    ajout: e.minute.ajout,
    libelle: e.minute.libelle,
    libelleType: e.minute.type,
    minuteSource: e.minute.source,
    dureeMax: e.minute.dureeMax,
    creneau: e.minute.creneau,
    part: e.minute.part,
    tranche,
    score: {
      connu: s.connu,
      home: s.h,
      away: s.a,
      source: s.source,
      depuisLe: iso(s.depuisA),
      baisseLe: iso(s.baisseA),
      precedent: s.precedent ? { home: s.precedent.h, away: s.precedent.a } : null,
      aConfirmer: s.aConfirmer
    },
    rouges: {
      connus: r.connus,
      home: r.home,
      away: r.away,
      source: r.source,
      vusLe: iso(r.vuA),
      depuisLe: iso(r.depuisA),
      ageS: r.ageS,
      ambre: r.ambre,
      desaccord: r.desaccord,
      phrase: r.phrase,
      avantLaPause: r.avantLaPause
    },
    score90: e.score90 ? { home: e.score90.h, away: e.score90.a, sur: e.score90.sur, vuLe: iso(e.score90.vuA), libelle: e.score90.libelle } : null,
    score90Absent: e.score90Absent,
    prolongation: { vueLe: iso(e.prolongation.vueA), joueeLe: iso(e.prolongation.joueeA), tirsAuButVusLe: iso(e.prolongation.tirsAuButVusA) },
    fin: { ...e.fin },
    memoire: e.memoire,
    ...releve
  };
}

/** La raison d'un état sans calcul (§ 4.1) : le nom de la phase, `score-inconnu` en jeu sans score, `minute-inconnue` sinon. */
const raisonDeLEtat = (phase, raison) => (PHASES_CALCULEES.includes(phase) ? (raison === 'score-inconnu' ? 'score-inconnu' : 'minute-inconnue') : phase);

function calculVide(nm, complet) {
  const c = {
    fait: false,
    enAttente: false,
    raison: null,
    erreur: null,
    aBlanc: aBlancPour(nm),
    note: nm,
    variante: null,
    varianteSource: null,
    repli: null,
    ancrage: null,
    calculeLe: null,
    ms: null,
    masseNegligee: null,
    deTable: false,
    un2: null,
    plus25: null,
    plus25Etat: null,
    lesDeuxMarquent: null,
    lesDeuxMarquentEtat: null,
    minute0: null
  };
  if (complet) c.marches = null;
  return c;
}

/** LES FAITS d'un match (tous les matchs, avant tout calcul) : son état, sa ligne d'avant-match, la note appliquée. */
function faitsDuMatch(m, ctx, { nuit, em, boucle, statut, note, complet = false }) {
  const e = etatDuMatch({ match: { liste: m.liste ?? null, memoire: m.memoire ?? null }, maintenant: ctx.heure });
  const tranche = trancheDuCreneau(e.minute.creneau);
  const lb = ligneDuMatch(m, ctx, nuit);
  const nm = noteDuMatch(note, lb, tranche, ctx.reconductions);
  const entree = {
    fotmobId: String(m.id),
    league: m.league ?? null,
    leagueKey: m.leagueKey ?? null,
    kickoff: m.kickoff ?? null,
    date: m.date ?? null,
    rang: m.rang ?? null,
    home: { id: m.homeId ?? null, nom: m.homeName ?? null },
    away: { id: m.awayId ?? null, nom: m.awayName ?? null },
    etat: etatRendu(e, tranche, releveDuMatch(e, ctx, { em, boucle, statut })),
    suivi: { vuLe: iso(enMs(m.vuA)), premiereVueLe: iso(enMs(m.premiereVue)), dernierDetailLe: iso(enMs(m.dernierDetailA)), coverage: m.coverage ?? null, memoire: e.memoire },
    avantMatch: avantMatchDe(lb),
    calcul: calculVide(nm, complet),
    // Correctifs D2, point 3 : la page du match dans l'appli, posée par lesPages() (null tant qu'elle n'est pas sûre).
    page: null
  };
  const ligneCalc = lb?.trouve ? { lambda: lb.lambda, mu: lb.mu, rho: lb.rho, grille: lb.grille, fair: lb.fair ?? null } : null;
  if (!e.calculable) entree.calcul.raison = raisonDeLEtat(e.phase, e.raison);
  else if (!ligneCalc) entree.calcul.raison = 'sans-avant-match';
  return {
    m,
    lb,
    entree,
    depart: e.depart,
    calculable: e.calculable,
    ligneCalc,
    // Correctif K9 (13/11, constat 9 du calcul) : la GRILLE entre dans les clés (l'ancrage en dépend).
    cleBase: ligneCalc ? { fotmobId: String(m.id), cleDeNuit: lb.cle, grille: lb.grille, lambda: lb.lambda, mu: lb.mu, rho: lb.rho, fair: lb.fair ?? null } : null,
    championnat: m.league ?? null,
    noteMatch: nm,
    variante: null
  };
}

const trier = (matchs) =>
  [...matchs].sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99) || String(a.kickoff ?? '').localeCompare(String(b.kickoff ?? '')) || String(a.id).localeCompare(String(b.id)));

// ------------------------------------------------------------ les calculs (O1, O2, P2, le repli de l'ancrage)

/** L'ancrage d'une ligne (R7), par la table ; `seulTables` : rien n'est calculé (budget épuisé) → undefined si absent. */
async function lAncrage(x, ctx, seulTables) {
  const cle = cleDeC0({ ...x.cleBase, variante: 'ancrage' });
  let a = TABLES.ancrages.lire(cle);
  if (a || seulTables) return a;
  await rendreLaMain(ctx);
  a = TABLES.ancrages.lire(cle);
  if (a) return a;
  try {
    a = ancrer({ ligne: x.ligneCalc });
  } catch {
    a = { fait: false, raison: 'erreur', lambda: x.ligneCalc.lambda, mu: x.ligneCalc.mu, borne: null, cible: null, ecart: null };
  }
  TABLES.ancrages.ranger(cle, a);
  COMPTEURS.ancrages++;
  ctx.calculs.ancrages++;
  return a;
}

/**
 * LA VARIANTE MONTRÉE pour ce match (P2, P4) : celle de la note quand elle s'applique, sinon le réglage ; une variante ancrée
 * sans ancrage fait (sans `fair`, ou λ + μ hors des bornes) se replie sur sa variante non ancrée — `repli` dit de quoi vers
 * quoi, et pourquoi (`raison` d'ancrer : 'sans-fair', 'total-hors-bornes').
 */
async function choisirLaVariante(x, ctx, seulTables) {
  if (x.variante) return x.variante;
  const parLaNote = x.noteMatch.applique && VARIANTES_MONTRABLES.includes(ctx.note?.variante);
  let id = parLaNote ? ctx.note.variante : varianteAfficheePour(x.ligneCalc, ctx.reglage);
  let ancrage = null;
  let repli = null;
  if (REPLIS_DE_L_ANCRAGE[id]) {
    ancrage = await lAncrage(x, ctx, seulTables);
    if (!ancrage) return null;
    if (!ancrage.fait) {
      repli = { de: id, vers: REPLIS_DE_L_ANCRAGE[id], raison: ancrage.raison };
      id = REPLIS_DE_L_ANCRAGE[id];
    }
  }
  x.variante = { id, source: parLaNote ? 'note' : 'reglage', repli, ancrage };
  return x.variante;
}

/** Une lecture (lecturesDuDirect) d'une seule variante, à un état ; une faute rend `raison: 'erreur'` (jamais montrée). */
function uneLecture(x, depart, v) {
  const t = performance.now();
  try {
    const l = lecturesDuDirect({ ligne: x.ligneCalc, depart, variantes: [v.id], coupes: COUPES.direct, championnat: x.championnat, ancrage: v.ancrage });
    const lu = l.lectures[v.id];
    return { raison: lu.raison, erreur: lu.raison === 'erreur' ? 'masse négligée au-delà de 1e-4' : null, grille: lu.grille, marches: lu.marches, masseNegligee: lu.masseNegligee, ms: dixieme(performance.now() - t) };
  } catch (error) {
    return { raison: 'erreur', erreur: String(error?.message ?? error).slice(0, 160), grille: null, marches: null, masseNegligee: null, ms: dixieme(performance.now() - t) };
  }
}

/** Le calcul à l'état courant (O1), par la table relue juste avant ; undefined si absent et `seulTables`. */
async function leCalcul(x, ctx, seulTables) {
  const v = x.variante;
  const cle = cleDuCalcul({ ...x.cleBase, ...x.depart, variante: v.id });
  let r = TABLES.calculs.lire(cle);
  if (r) return { r, deTable: true };
  if (seulTables) return undefined;
  await rendreLaMain(ctx);
  r = TABLES.calculs.lire(cle);
  if (r) return { r, deTable: true };
  const l = uneLecture(x, x.depart, v);
  r = { variante: v.id, raison: l.raison, erreur: l.erreur, marches: l.marches, masseNegligee: l.masseNegligee, ms: l.ms, calculeLe: iso(ctx.maintenant) };
  TABLES.calculs.ranger(cle, r);
  COMPTEURS.calculs++;
  ctx.calculs.faits++;
  return { r, deTable: false };
}

const DEPART_C0 = Object.freeze({ creneau: 0, part: 0, h: 0, a: 0, rh: 0, ra: 0 });

/** C0 et la minute 0 (R8, R35 point 7), par la table relue juste avant ; undefined si absent et `seulTables`. */
async function leC0(x, ctx, seulTables) {
  const v = x.variante;
  const cle = cleDeC0({ ...x.cleBase, variante: v.id });
  let r = TABLES.c0.lire(cle);
  if (r || seulTables) return r;
  await rendreLaMain(ctx);
  r = TABLES.c0.lire(cle);
  if (r) return r;
  const l = uneLecture(x, DEPART_C0, v);
  if (l.raison === 'erreur') r = { raison: 'erreur', erreur: l.erreur, minute0: null, ms: l.ms };
  else {
    try {
      r = { raison: null, erreur: null, minute0: minute0({ ligne: x.ligneCalc, grilleC0: l.grille }), ms: l.ms };
    } catch (error) {
      r = { raison: 'erreur', erreur: String(error?.message ?? error).slice(0, 160), minute0: null, ms: l.ms };
    }
  }
  TABLES.c0.ranger(cle, r);
  COMPTEURS.c0++;
  ctx.calculs.c0++;
  return r;
}

/** La minute 0 rendue : au tableau, le 1N2 et les marchés dont l'écart est dit (≥ 2 points) ; au détail, tous (R8). */
function minute0Rendue(m0, complet) {
  const marches = {};
  for (const [k, v] of Object.entries(m0.marches)) {
    if (complet || k.startsWith('result.') || v.dit) marches[k] = { avant: v.avant, direct: v.direct, ecartPt: v.ecartPt, dit: v.dit };
  }
  return { avantDepuis: m0.avantDepuis, complet, marches };
}

function mettreEnAttente(x, ctx) {
  x.entree.calcul.enAttente = true;
  x.entree.calcul.raison = 'en-attente';
  ctx.calculs.enAttente++;
}

/**
 * LE CALCUL D'UN MATCH : la variante (et l'ancrage), le calcul à l'état courant, C0 et la minute 0. Au tableau, seulement si
 * l'état se calcule ; au détail (`complet`), la variante et C0 aussi pour un état sans calcul (la courbe et la minute 0).
 * Budget épuisé au début du match : seulement ce que les tables ont déjà, sinon « en attente ».
 */
async function calculerUnMatch(x, ctx, complet) {
  const c = x.entree.calcul;
  if (!x.ligneCalc || (!x.calculable && !complet)) {
    ctx.calculs.sansCalcul++;
    return;
  }
  const seulTables = budgetEpuise(ctx);
  const v = await choisirLaVariante(x, ctx, seulTables);
  if (!v) return mettreEnAttente(x, ctx);
  c.variante = v.id;
  c.varianteSource = v.source;
  c.repli = v.repli ? { ...v.repli } : null;
  c.ancrage = v.ancrage ? { fait: v.ancrage.fait, raison: v.ancrage.raison, lambda: v.ancrage.lambda, mu: v.ancrage.mu, borne: v.ancrage.borne, cible: v.ancrage.cible, ecart: v.ancrage.ecart } : null;
  let r = null;
  if (x.calculable) {
    const lu = await leCalcul(x, ctx, seulTables);
    if (!lu) return mettreEnAttente(x, ctx);
    r = lu.r;
    c.deTable = lu.deTable;
    if (lu.deTable) ctx.calculs.deTable++;
  }
  const c0 = await leC0(x, ctx, seulTables);
  if (!c0) return mettreEnAttente(x, ctx);
  c.minute0 = c0.minute0 ? minute0Rendue(c0.minute0, complet) : null;
  if (!r) {
    ctx.calculs.sansCalcul++;
    return;
  }
  c.calculeLe = r.calculeLe;
  c.ms = r.ms;
  c.masseNegligee = r.masseNegligee;
  if (r.raison === 'erreur') {
    c.raison = 'erreur';
    c.erreur = r.erreur;
    return;
  }
  const m = r.marches;
  c.fait = true;
  c.raison = null;
  c.un2 = { home: m.result.home, draw: m.result.draw, away: m.result.away };
  c.plus25 = m.totalGoals['2.5'].over;
  c.plus25Etat = m.totalGoals['2.5'].etat;
  c.lesDeuxMarquent = m.bothTeamsScore.yes;
  c.lesDeuxMarquentEtat = m.bothTeamsScore.etat;
  if (complet) c.marches = structuredClone(m);
}

/** Une ligne (`result.home`, `totalGoals.2.5.over`…) visée par une paire du banc : l'unité, ses deux issues ou sa famille (la
 *  règle de l'écran, viseLaLigne de ui/src/utils/direct.js). */
const viseLaLigne = (unite, cle) => {
  const u = String(unite ?? '');
  return Boolean(u) && (cle === u || cle.startsWith(`${u}.`));
};
/** Une ligne que la note retire (`nm` : la note appliquée à SA tranche) : sa famille non montrée, ou une paire écartée qui la vise. */
const retireeParLaNote = (nm, cle) => (nm.famillesNonMontrees ?? []).includes(cle.split('.')[0]) || (nm.ecartees ?? []).some((p) => viseLaLigne(p?.unite, cle));
/** Les probabilités (nombres) des lignes retirées passent à null ; les états (`etat`, `etats`) restent. */
function taireLesLignesRetirees(o, chemin, nm) {
  for (const [k, v] of Object.entries(o)) {
    if (k === 'etat' || k === 'etats') continue;
    const cle = `${chemin}.${k}`;
    if (typeof v === 'number') {
      if (retireeParLaNote(nm, cle)) o[k] = null;
    } else if (v && typeof v === 'object') taireLesLignesRetirees(v, cle, nm);
  }
}

/**
 * § 2.6 point 4 (mise en service, 13/11/2026) — CE QUE LA NOTE RETIRE NE SORT PAS NON PLUS DU JSON (le filtre de la courbe,
 * courbeDuMatch, appliqué au calcul de la carte et du détail) : une famille non montrée et les lignes d'une paire écartée de SA
 * tranche (la règle de l'écran) — le 1N2 issue par issue, le plus de 2,5, les deux marquent, les marchés (famille non montrée
 * → null ; ligne écartée → ses probabilités à null, ses états gardés) ; la minute 0 lue à SA tranche (celle du créneau 0) :
 * son calcul (`direct`, `ecartPt`) tu et `dit: false` quand cette tranche n'est pas montrée ou la ligne retirée, le pronostic
 * d'avant-match (`avant`) gardé. Les objets rendus sont des copies : les tables ne changent pas. Comme pour la courbe, sans
 * regarder `chiffresABlanc`.
 */
function taireLesRetires(x, ctx) {
  const c = x.entree.calcul;
  const nm = x.noteMatch;
  if (!nm?.applique) return;
  if (c.un2) {
    for (const k of ['home', 'draw', 'away']) if (retireeParLaNote(nm, `result.${k}`)) c.un2[k] = null;
    if (Object.values(c.un2).every((p) => p === null)) c.un2 = null;
  }
  if (retireeParLaNote(nm, 'totalGoals.2.5.over')) c.plus25 = null;
  if (retireeParLaNote(nm, 'bothTeamsScore.yes')) c.lesDeuxMarquent = null;
  if (c.marches) {
    for (const [f, v] of Object.entries(c.marches)) {
      if ((nm.famillesNonMontrees ?? []).includes(f)) c.marches[f] = null;
      else if (v && typeof v === 'object') taireLesLignesRetirees(v, f, nm);
    }
  }
  if (c.minute0?.marches) {
    const nm0 = noteDuMatch({ note: ctx.note }, x.lb, trancheDuCreneau(DEPART_C0.creneau), ctx.reconductions);
    const toute = aBlancPour(nm0);
    for (const [k, v] of Object.entries(c.minute0.marches)) if (toute || retireeParLaNote(nm0, k)) c.minute0.marches[k] = { ...v, direct: null, ecartPt: null, dit: false };
  }
}

/**
 * P5 — À BLANC, AUCUN CHIFFRE NE SORT de la lecture : ni le 1N2, ni les marchés, ni la minute 0, ni (λ′, μ′) de l'ancrage, ni la
 * courbe. Les chiffres restent CALCULÉS (le vrai chemin est éprouvé, les tables se remplissent) ; seuls les essais les lisent,
 * par `chiffresABlanc: true`. Les états tirés du SCORE (plus25Etat, lesDeuxMarquentEtat) et le pronostic d'avant-match restent.
 * Note appliquée (pas à blanc) : ce qu'elle retire est tu par taireLesRetires (§ 2.6 point 4).
 */
function taireLesChiffres(x, ctx, courbe = null) {
  const c = x.entree.calcul;
  if (!c.aBlanc) return taireLesRetires(x, ctx);
  if (ctx.chiffresABlanc) return;
  c.un2 = null;
  c.plus25 = null;
  c.lesDeuxMarquent = null;
  c.minute0 = null;
  if ('marches' in c) c.marches = null;
  if (c.ancrage) c.ancrage = { ...c.ancrage, lambda: null, mu: null, cible: null, ecart: null };
  if (courbe) for (const p of courbe.points) if (p.type !== 'avant-match') p.un2 = null;
}

/** Les calculs, match après match, dans l'ordre du tableau (rang, puis coup d'envoi). */
async function calculerLesMatchs(xs, ctx, complet) {
  for (const x of xs) await calculerUnMatch(x, ctx, complet);
}

// ------------------------------------------------------------ les finis (R11 point 3, R37 points 4 et 9)

/**
 * Un match fini (getEtatMinute().finis, ou un instantané « fin ») : « terminé » seulement si son statut le dit (R11 point 3).
 * Correctifs D3, point 2 : `page` (la dernière clé) = la page « match terminé » de l'appli (pageDuFini), avec `ctx` ; sinon null.
 */
function finiDe(f, ctx = null) {
  const e = etatDuMatch({ match: { liste: f.liste ?? null, memoire: f.memoire ?? null }, maintenant: enMs(f.at) });
  const statut = f.fin?.status ?? null;
  const vraiFin = statut === 'terminé' || statut === 'annulé';
  const butsFin = Number.isInteger(f.fin?.homeGoals) && Number.isInteger(f.fin?.awayGoals) ? { home: f.fin.homeGoals, away: f.fin.awayGoals } : null;
  const fin = {
    fotmobId: String(f.id),
    league: f.league ?? null,
    leagueKey: f.leagueKey ?? null,
    kickoff: f.kickoff ?? null,
    date: f.date ?? null,
    home: { id: f.homeId ?? null, nom: f.homeName ?? null },
    away: { id: f.awayId ?? null, nom: f.awayName ?? null },
    statut,
    raison: vraiFin ? 'fini' : 'coupure-4h',
    phase: e.phase,
    score: butsFin ?? (e.score.connu ? { home: e.score.h, away: e.score.a } : { home: null, away: null }),
    finReleveeLe: iso(enMs(f.at)),
    score90: e.score90 ? { home: e.score90.h, away: e.score90.a, sur: e.score90.sur, vuLe: iso(e.score90.vuA), libelle: e.score90.libelle } : null,
    score90Absent: e.score90Absent,
    prolongation: { vueLe: iso(e.prolongation.vueA), joueeLe: iso(e.prolongation.joueeA), tirsAuButVusLe: iso(e.prolongation.tirsAuButVusA) }
  };
  fin.page = ctx ? pageDuFini(fin, ctx) : null;
  return fin;
}

// ------------------------------------------------------------ la page du match dans l'appli (correctifs D2, point 3 ; D3, points 1 et 2)

const SELECT_PAGE = "SELECT match_id FROM simulation_matchs WHERE fixture_key = ? AND role = 'service' AND calcule_le = ?";
/** « fotmob-123 » (ou « 123 ») → « fotmob-123 » ; autre chose → null. */
const idFotmob = (x) => {
  const m = /^(?:fotmob-)?([1-9]\d*)$/.exec(String(x ?? '').trim());
  return m ? `fotmob-${m[1]}` : null;
};

/**
 * Le format du fichier du calendrier, tel que l'écrit merge-season-calendar.mjs (`JSON.stringify(calendrier, null, 2)`) : un
 * tableau dont chaque élément commence par « saut de ligne, deux espaces, { » et finit par « saut de ligne, deux espaces, } ».
 * Un saut de ligne n'est JAMAIS dans une chaîne JSON (il y est écrit « \n ») et deux espaces sont la profondeur d'un élément
 * du tableau : ces deux suites d'octets ne bornent que les éléments.
 */
const SAUT_DE_LIGNE = String.fromCharCode(10);
const DEBUT_D_ELEMENT = Buffer.from(`${SAUT_DE_LIGNE}  {`);
const FIN_D_ELEMENT = Buffer.from(`${SAUT_DE_LIGNE}  }`);
const BLANCS = new Set([0x20, 0x09, 0x0a, 0x0d]);
const CROCHET_OUVRANT = 0x5b;
const CROCHET_FERMANT = 0x5d;

/** Le fichier lu est-il un tableau ENTIER, au format attendu ? (tronqué par une écriture en cours, ou d'une autre forme : non) */
function tableauEntier(octets) {
  let i = 0;
  while (i < octets.length && BLANCS.has(octets[i])) i++;
  let j = octets.length - 1;
  while (j > i && BLANCS.has(octets[j])) j--;
  if (octets[i] !== CROCHET_OUVRANT || octets[j] !== CROCHET_FERMANT || j <= i) return false;
  let k = i + 1;
  while (k < j && BLANCS.has(octets[k])) k++;
  return k === j || octets.indexOf(DEBUT_D_ELEMENT, i) === i + 1;
}

/**
 * Correctifs D3, point 1 — LES ENTRÉES DU CALENDRIER D'UN JOUR (AAAA-MM-JJ), lues SANS tenir la main (O2) : le fichier
 * (≈ 18 Mo) est lu en asynchrone (`attendre` : le fil ne tient pas pendant la lecture), puis seuls les éléments qui portent
 * « "date": "<jour>" » sont analysés, un à un (quelques centaines d'octets chacun), la main rendue dès 20 ms
 * (`siLongtemps`). Jamais listSeasonCalendar : son cache est privé au dépôt du calendrier (gelé) et, après chaque passe
 * (le fichier change), il relit et analyse les 18 Mo d'un seul bloc (~160 ms à froid), puis trie les 47 000 entrées à chaque
 * appel (~30 ms). Un fichier tronqué, illisible ou d'une autre forme LÈVE : rien n'est gardé, la requête suivante relit.
 */
async function calendrierDuJour(jour, { fichier = CALENDAR_FILE_PATH, siLongtemps = async () => {}, attendre = (promesse) => promesse } = {}) {
  const octets = await attendre(fs.promises.readFile(fichier), 'lecture du calendrier');
  if (!tableauEntier(octets)) throw new Error('calendrier de saison tronqué ou d’une autre forme : relu à la requête suivante');
  const aiguille = Buffer.from(`"date": "${jour}"`);
  const entrees = [];
  let de = 0;
  for (;;) {
    const i = octets.indexOf(aiguille, de);
    if (i < 0) break;
    const debut = octets.lastIndexOf(DEBUT_D_ELEMENT, i);
    const fin = octets.indexOf(FIN_D_ELEMENT, i);
    if (debut < 0 || fin < 0) throw new Error('calendrier de saison d’une autre forme : relu à la requête suivante');
    const e = JSON.parse(octets.toString('utf8', debut + 1, fin + FIN_D_ELEMENT.length));
    if (e?.date === jour) entrees.push(e);
    de = fin + FIN_D_ELEMENT.length;
    await siLongtemps('calendrier du jour');
  }
  return entrees;
}

/**
 * L'identifiant FotMob d'un club du calendrier : l'annuaire STRICT (correctifs D3, point 1) — l'alias exact du club
 * (team_aliases, findTeams), celui de sa compétition quand plusieurs clubs le portent ; jamais les secours de clubDuMagasin
 * (les écritures d'une compétition : une requête de 100 à 300 ms d'un seul tenant, O2), jamais un rapprochement de noms.
 */
function clubDeLAnnuaire(nom, league, database) {
  if (!nom) return null;
  try {
    const clubs = findTeams(nom, { database });
    const memeCompetition = clubs.filter((c) => c.league === league);
    if (memeCompetition.length === 1) return memeCompetition[0].teamId;
    return clubs.length === 1 ? clubs[0].teamId : null;
  } catch {
    return null;
  }
}

/**
 * BÂTIR L'INDEX DU CALENDRIER D'UN JOUR, À CÔTÉ DES REQUÊTES : « fotmob-H|fotmob-A » → les identifiants de match de l'appli
 * (un Set), pour les entrées dont les DEUX clubs sont reconnus par l'annuaire. Ses blocs sont mesurés à part (creerPauses :
 * la main rendue dès 20 ms, le plus long bloc, les mains rendues) ; un calendrier illisible lève.
 */
async function batirLIndex(jour, sources, database) {
  const pauses = creerPauses({ pasMs: BLOC_DE_FAITS_MS });
  const t0 = performance.now();
  const resoudre = typeof sources.club === 'function' ? sources.club : (nom, league) => clubDeLAnnuaire(nom, league, database);
  const club = (nom, league) => {
    try {
      return resoudre(nom, league);
    } catch {
      return null;
    }
  };
  const entrees = (await appeler(sources.calendrier, jour, { siLongtemps: pauses.siLongtemps, attendre: pauses.attendre })) ?? [];
  const index = new Map();
  let duJour = 0;
  for (const c of Array.isArray(entrees) ? entrees : []) {
    if (c && c.date === jour && c.matchId) {
      duJour++;
      const h = idFotmob(club(c.homeName ?? null, c.league ?? null));
      const a = idFotmob(club(c.awayName ?? null, c.league ?? null));
      if (h && a) {
        const k = `${h}|${a}`;
        if (!index.has(k)) index.set(k, new Set());
        index.get(k).add(String(c.matchId));
      }
    }
    await pauses.siLongtemps('index du calendrier');
  }
  const b = pauses.bilan();
  return { index, bilan: { ms: dixieme(performance.now() - t0), blocMaxMs: b.blocMaxMs, blocMaxOu: b.blocMaxOu, rendus: b.pauses, entrees: duJour } };
}

/**
 * L'INDEX DU CALENDRIER D'UN JOUR pour une requête (correctifs D3, point 1) : de moins de 10 minutes → servi ; plus vieux →
 * servi aussi, et rebâti À CÔTÉ (la requête n'attend pas) ; jamais bâti → bâti, et la requête l'attend SANS tenir la main.
 * Deux requêtes en même temps partagent la même construction. Une lecture ratée n'est JAMAIS gardée : l'index d'avant reste
 * servi (ou aucun : null) et la requête suivante relit — une fois par requête et par jour, quel que soit le nombre de ses
 * matchs (indexDuCalendrier).
 */
function indexDuCalendrier(jour, ctx) {
  if (!ctx.indexDesJours.has(jour)) ctx.indexDesJours.set(jour, indexDuJour(jour, ctx));
  return ctx.indexDesJours.get(jour);
}

async function indexDuJour(jour, ctx) {
  const jours = tableDe(calendriersParBase, ctx.database);
  let g = jours.get(jour);
  if (!g) {
    g = { at: null, index: null, construction: null, bilan: null, erreur: null };
    jours.set(jour, g);
  }
  const frais = g.index !== null && ctx.maintenant >= g.at && ctx.maintenant - g.at < CALENDRIER_GARDE_MS;
  if (!frais && !g.construction) {
    const etat = g;
    const at = ctx.maintenant;
    etat.construction = batirLIndex(jour, ctx.sources, ctx.database)
      .then(
        ({ index, bilan }) => {
          Object.assign(etat, { at, index, bilan, erreur: null });
        },
        (erreur) => {
          etat.erreur = String(erreur?.message ?? erreur).slice(0, 200);
        }
      )
      .finally(() => {
        etat.construction = null;
      });
  }
  if (g.index === null && g.construction) await attendreAilleurs(ctx, g.construction);
  return g.index;
}

/**
 * LA PAGE D'UN MATCH SUIVI : { id, source } — `nuit` : le `match_id` de SA ligne de nuit (celle de l'avant-match) ;
 * `calendrier` : l'UNIQUE entrée du calendrier du même jour (UTC) dont les deux clubs ont ses identifiants FotMob. Deux
 * entrées ou plus, aucune, des identifiants absents → null (la carte garde sa phrase « à ouvrir depuis Matchs »).
 */
async function pageDuMatch(m, lb, ctx) {
  if (lb?.trouve && lb.cle && lb.calculeLe) {
    try {
      const r = ctx.database.prepare(SELECT_PAGE).get(lb.cle, lb.calculeLe);
      if (r?.match_id) return { id: String(r.match_id), source: 'nuit' };
    } catch {
      // Une base sans la table de la 28 : le calendrier.
    }
  }
  const home = idFotmob(m.homeId);
  const away = idFotmob(m.awayId);
  const k = enMs(m.kickoff);
  const jour = typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : k !== null ? jourUtc(k) : null;
  if (!home || !away || !jour) return null;
  const pages = (await indexDuCalendrier(jour, ctx))?.get(`${home}|${away}`);
  return pages?.size === 1 ? { id: [...pages][0], source: 'calendrier' } : null;
}

const SELECT_FICHE_PAR_ID = 'SELECT match_key, date, home_id, away_id FROM matches WHERE fotmob_id = ?';
const SELECT_FICHE_PAR_PAIRE = 'SELECT match_key, fotmob_id FROM matches WHERE home_id = ? AND away_id = ? AND date = ?';
const ID_DE_MATCH = /^[1-9]\d*$/;

/**
 * Correctifs D3, point 2 — LA PAGE D'UN MATCH FINI : { id, source: 'magasin' } quand sa fiche est rangée au magasin
 * (`matches` : la page « match terminé » de l'appli, /match/<match_key>). Trouvée par l'identifiant FotMob du match, son
 * jour à un jour près et, quand le fini les a, les identifiants FotMob de ses deux clubs ; sinon, pour une fiche rangée
 * SANS identifiant de match, par les identifiants FotMob de ses deux clubs et son jour exact. Jamais un nom ; aucune fiche,
 * ou deux → null (l'écran dit « page du match terminé pas encore rangée »). Deux petites requêtes sur index, à chaque
 * lecture : la fiche rangée par la passe suivante est vue tout de suite.
 */
function pageDuFini(fin, ctx) {
  const id = ID_DE_MATCH.test(fin.fotmobId) ? fin.fotmobId : null;
  const home = idFotmob(fin.home?.id);
  const away = idFotmob(fin.away?.id);
  const k = enMs(fin.kickoff);
  const jour = typeof fin.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fin.date) ? fin.date : k !== null ? jourUtc(k) : null;
  if (!jour) return null;
  const t = Date.parse(`${jour}T00:00:00.000Z`);
  const procheDuJour = (d) => typeof d === 'string' && Math.abs(Date.parse(`${d}T00:00:00.000Z`) - t) <= JOUR_MS;
  const memesClubs = (r) => !home || !away || !r.home_id || !r.away_id || (r.home_id === home && r.away_id === away);
  try {
    if (id) {
      const fiches = ctx.database.prepare(SELECT_FICHE_PAR_ID).all(id).filter((r) => procheDuJour(r.date) && memesClubs(r));
      if (fiches.length) return fiches.length === 1 ? { id: String(fiches[0].match_key), source: 'magasin' } : null;
    }
    if (!home || !away) return null;
    const sansId = ctx.database.prepare(SELECT_FICHE_PAR_PAIRE).all(home, away, jour).filter((r) => !ID_DE_MATCH.test(String(r.fotmob_id ?? '')));
    return sansId.length === 1 ? { id: String(sansId[0].match_key), source: 'magasin' } : null;
  } catch {
    return null; // Une base sans la table du magasin.
  }
}

/** Pose `entree.page` de chaque match (après les calculs : hors de leur budget), la main rendue toutes les 20 ms. */
async function lesPages(xs, ctx) {
  for (const x of xs) {
    try {
      x.entree.page = await pageDuMatch(x.m, x.lb, ctx);
    } catch {
      x.entree.page = null;
    }
    if (performance.now() - ctx.debutDeBloc >= BLOC_DE_FAITS_MS) await rendreLaMain(ctx);
  }
}

// ------------------------------------------------------------ le rejeu d'un instant (R28)

const COLONNES_INSTANTANE =
  'fotmob_id, taken_at, kind, date, kickoff, league, league_key, home_id, away_id, home_name, away_name, status, minute, added_time, minute_label, home_goals, away_goals, home_red, away_red, coverage, detail_at, source';

/** Une ligne de live_snapshots lue comme une ligne de la liste (sans durée max : live_snapshots ne la garde pas). */
function listeDeLInstantane(r) {
  return {
    liveLabel: r.minute_label ?? null,
    liveMinute: r.minute ?? null,
    liveAddedTime: r.added_time ?? null,
    liveMaxTime: null,
    halfTime: r.status === 'mi-temps',
    started: true,
    finished: r.status === 'terminé',
    cancelled: r.status === 'annulé',
    awarded: false,
    homeGoals: r.home_goals ?? null,
    awayGoals: r.away_goals ?? null,
    homeRedCards: r.home_red ?? null,
    awayRedCards: r.away_red ?? null
  };
}

/** Un match refait depuis ses instantanés (≤ l'instant) : la mémoire rejouée instantané par instantané, chacun une vraie lecture. */
function matchRejoue(rows) {
  let memoire = null;
  let detailA = null;
  for (const r of rows) {
    const L = listeDeLInstantane(r);
    const t = enMs(r.taken_at);
    const avecDetail = /tail/.test(String(r.source ?? ''));
    memoire = suivre(memoire, { liste: L, detail: avecDetail ? L : null, maintenant: t, listeReelle: true });
    if (avecDetail) detailA = t;
  }
  const der = rows.at(-1);
  return {
    id: der.fotmob_id,
    league: der.league ?? null,
    leagueKey: der.league_key ?? null,
    date: der.date ?? null,
    kickoff: der.kickoff ?? null,
    homeId: der.home_id ?? null,
    awayId: der.away_id ?? null,
    homeName: der.home_name ?? null,
    awayName: der.away_name ?? null,
    rang: null,
    coverage: der.coverage ?? null,
    vuA: enMs(der.taken_at),
    premiereVue: enMs(rows[0].taken_at),
    dernierDetailA: detailA,
    liste: listeDeLInstantane(der),
    dernier: null,
    memoire
  };
}

/** L'état de la boucle À UN INSTANT PASSÉ, refait depuis live_snapshots (la forme de getEtatMinute). */
function etatRejoue(ctx) {
  const t = ctx.instant;
  const db = ctx.database;
  const jours = [jourUtc(t), jourUtc(t - JOUR_MS)];
  const lire = db.prepare(`SELECT ${COLONNES_INSTANTANE} FROM live_snapshots WHERE fotmob_id = ? AND taken_at <= ? ORDER BY taken_at`);
  const ids = db
    .prepare("SELECT DISTINCT fotmob_id AS id FROM live_snapshots WHERE date IN (?, ?) AND kind = 'direct' AND taken_at > ? AND taken_at <= ?")
    .all(...jours, iso(t - REJEU_FENETRE_MS), iso(t))
    .map((r) => r.id);
  const matchs = [];
  for (const id of ids) {
    const rows = lire.all(id, iso(t));
    if (!rows.length || rows.at(-1).kind === 'fin') continue;
    matchs.push(matchRejoue(rows));
  }
  const finis = db
    .prepare("SELECT fotmob_id AS id, MAX(taken_at) AS at FROM live_snapshots WHERE date IN (?, ?) AND kind = 'fin' AND taken_at > ? AND taken_at <= ? GROUP BY fotmob_id")
    .all(...jours, iso(t - FINIS_GARDES_MS), iso(t))
    .map((f) => {
      const rows = lire.all(f.id, f.at);
      const m = matchRejoue(rows);
      const der = rows.at(-1);
      return { ...m, at: enMs(der.taken_at), fin: { status: der.status, homeGoals: der.home_goals ?? null, awayGoals: der.away_goals ?? null } };
    });
  return { v: 1, at: t, module46: null, erreurs46: null, listeFotmobA: null, derniereListe: null, prochainCoupDEnvoi: null, suspenduJusqua: null, startedAt: null, dernierTour: null, charge: null, matchs, finis };
}

// ------------------------------------------------------------ la référence des cotes, SANS écart (R2, § 3.4)

const probaDEchange = (d) => {
  const p = Number(d.prob);
  if (Number.isFinite(p) && p > 0 && p < 1) return p;
  const prix = Number(d.price);
  return prix > 1 ? 1 / prix : null;
};

/** Les lignes de référence d'un match (cotes gratuites en direct, jamais les payantes) : marge retirée, prix d'échange dit. */
function lireLaReference(e, ctx) {
  const gardeeLe = iso(ctx.maintenant);
  if (!e.home.id || !e.away.id || !e.date) return { trouvee: false, raison: 'aucune-cote', gardeeLe, lignes: [] };
  let q;
  try {
    q = quotesForFixture({ homeId: e.home.id, awayId: e.away.id, date: e.date }, { database: ctx.database });
  } catch {
    return { trouvee: false, raison: 'illisible', gardeeLe, lignes: [] };
  }
  const limite = ctx.instant === null ? null : iso(ctx.instant);
  const lignes = [];
  for (const s of q.sources ?? []) {
    const echange = SOURCES_ECHANGE.has(s.source);
    for (const b of s.bookmakers ?? []) {
      for (const mk of b.markets ?? []) {
        const issues = MARCHES_DE_REFERENCE[mk.market];
        if (!issues) continue;
        const ligne = mk.market === 'ou' ? Number(mk.line) : null;
        if (mk.market === 'ou' && !LIGNES.includes(ligne)) continue;
        const derniers = issues.map((issue) => {
          const sel = (mk.selections ?? []).find((x) => x.selection === issue);
          const serie = (sel?.live ?? []).filter((v) => limite === null || String(v.releveAt) <= limite);
          return serie.at(-1) ?? null;
        });
        if (derniers.every((d) => d === null)) continue;
        let probas = issues.map(() => null);
        let alerte = null;
        if (echange) {
          probas = derniers.map((d) => (d ? probaDEchange(d) : null));
          alerte = SOURCES_RETARDEES.has(s.source) ? 'source-retardee' : null;
        } else if (derniers.some((d) => d === null || !(Number(d.price) > 1))) {
          alerte = 'issue-manquante';
        } else {
          const r = removeMargin(derniers.map((d) => Number(d.price)));
          if (r.anomaly) alerte = 'anomalie';
          else probas = r.probabilities;
        }
        issues.forEach((issue, i) => {
          const d = derniers[i];
          if (!d) return;
          const prix = Number(d.price);
          lignes.push({
            marche: mk.market,
            ligne,
            issue,
            source: s.source,
            bookmaker: b.bookmaker,
            provenance: b.provenance ?? null,
            echange,
            prix: Number.isFinite(prix) && d.price !== null ? prix : null,
            proba: probas[i] ?? null,
            releveLe: d.releveAt ?? null,
            ageS: null,
            avantLeDernierBut: null,
            avantLeRouge: null,
            ecartPt: null,
            raison: 'pas-le-meme-instant',
            alerte
          });
        });
      }
    }
  }
  const rangIssue = (l) => MARCHES_DE_REFERENCE[l.marche].indexOf(l.issue);
  lignes.sort(
    (a, b) =>
      ORDRE_DES_MARCHES.indexOf(a.marche) - ORDRE_DES_MARCHES.indexOf(b.marche) ||
      (a.ligne ?? 0) - (b.ligne ?? 0) ||
      String(a.source).localeCompare(String(b.source)) ||
      String(a.bookmaker).localeCompare(String(b.bookmaker)) ||
      rangIssue(a) - rangIssue(b)
  );
  return { trouvee: lignes.length > 0, raison: lignes.length ? null : 'aucune-cote', gardeeLe, lignes };
}

/**
 * LA RÉFÉRENCE d'un match (R2 point 1 a) : jamais d'écart (`ecartPt: null`, `raison: 'pas-le-meme-instant'`) ; gardée 60 s ;
 * `avantLeDernierBut` (le relevé est d'avant le changement de score vu) et `avantLeRouge` (d'avant le compte de rouges vu,
 * lu sur son `depuisLe`, R2 point 2) recalculés à chaque requête sur l'état du moment ; null quand on ne peut pas le savoir.
 */
function referenceDuMatch(x, ctx) {
  const e = x.entree;
  const table = tableDe(referencesParBase, ctx.database);
  const cle = `${e.fotmobId}|${ctx.instant ?? ''}`;
  const g = table.get(cle);
  let valeur;
  if (g && ctx.maintenant - g.at < REFERENCE_GARDEE_MS && ctx.maintenant >= g.at) valeur = g.valeur;
  else {
    valeur = lireLaReference(e, ctx);
    table.set(cle, { at: ctx.maintenant, valeur });
    COMPTEURS.references++;
  }
  const ref = structuredClone(valeur);
  const sc = e.etat.score;
  const depuis = enMs(sc.depuisLe);
  const rg = e.etat.rouges;
  for (const l of ref.lignes) {
    const t = enMs(l.releveLe);
    l.ageS = ageEnS(t, ctx.heure);
    if (!sc.connu || t === null) l.avantLeDernierBut = null;
    else if (sc.precedent === null) l.avantLeDernierBut = sc.home === 0 && sc.away === 0 ? false : depuis !== null && t < depuis ? null : false;
    else l.avantLeDernierBut = depuis === null ? null : t < depuis;
    if (!rg.connus || t === null) l.avantLeRouge = null;
    else if ((rg.home ?? 0) + (rg.away ?? 0) === 0) l.avantLeRouge = false;
    else l.avantLeRouge = enMs(rg.depuisLe) === null ? null : t < enMs(rg.depuisLe);
  }
  return ref;
}

// ------------------------------------------------------------ la courbe (§ 3.3, R35 point 6)

const SELECT_COURBE = 'SELECT taken_at, kind, status, minute, added_time, minute_label, home_goals, away_goals, home_red, away_red, source FROM live_snapshots WHERE fotmob_id = ? AND taken_at <= ? ORDER BY taken_at';

/** Le 1N2 d'un point de la courbe : par la table du tableau, sinon celle de la courbe ; undefined s'il faut le calculer. */
function pointEnTable(cle) {
  const r = TABLES.calculs.lire(cle);
  if (r) return r.marches ? { raison: null, un2: { home: r.marches.result.home, draw: r.marches.result.draw, away: r.marches.result.away } } : { raison: r.raison ?? 'erreur', un2: null };
  return TABLES.courbe.lire(cle);
}

/** Un point calculé (un bloc, la main rendue avant) ; budget épuisé → `enAttente`. */
async function calculerLePoint(p, etat, x, ctx) {
  const v = x.variante;
  const depart = { creneau: etat.creneau, part: etat.part, h: etat.h, a: etat.a, rh: etat.rh, ra: etat.ra };
  const cle = cleDuCalcul({ ...x.cleBase, ...depart, variante: v.id });
  let q = pointEnTable(cle);
  if (q === undefined) {
    if (budgetEpuise(ctx)) {
      p.enAttente = true;
      p.raison = 'en-attente';
      return;
    }
    await rendreLaMain(ctx);
    q = pointEnTable(cle);
    if (q === undefined) {
      const l = uneLecture(x, depart, v);
      q = l.marches ? { raison: null, un2: { home: l.marches.result.home, draw: l.marches.result.draw, away: l.marches.result.away } } : { raison: 'erreur', un2: null };
      TABLES.courbe.ranger(cle, q);
      COMPTEURS.courbe++;
      ctx.calculs.courbe++;
    }
  }
  if (q.raison) p.raison = q.raison;
  else p.un2 = { ...q.un2 };
}

/**
 * LA COURBE d'un match : le point d'avant-match (le 1N2 de la ligne : `fair`, sinon celui de sa grille par la minute 0), un
 * point par instantané (son état par etatDepuisInstantane : rouges nuls reportés, jamais 0 ; prolongation sans chiffre), puis
 * l'état courant. Plus de 12 minutes entre deux instantanés : trou dit, courbe coupée. Chaque point est un bloc, compté
 * dans le budget ; les points sont gardés (un second appel ne recalcule rien).
 */
async function courbeDuMatch(x, ctx) {
  const e = x.entree;
  let rows;
  try {
    rows = ctx.database.prepare(SELECT_COURBE).all(e.fotmobId, iso(ctx.heure));
  } catch {
    return { variante: x.variante?.id ?? null, points: [], trous: [], complete: false, raison: 'illisible' };
  }
  const m0 = e.calcul.minute0?.marches;
  const avant = e.avantMatch.fair
    ? { ...e.avantMatch.fair }
    : m0?.['result.home']
      ? { home: m0['result.home'].avant, draw: m0['result.draw'].avant, away: m0['result.away'].avant }
      : null;
  const points = [
    {
      type: 'avant-match',
      at: e.avantMatch.calculeLe,
      phase: null,
      libelle: null,
      creneau: null,
      part: null,
      minute: null,
      score: { home: null, away: null },
      rouges: null,
      rougesReportes: false,
      un2: avant,
      raison: e.avantMatch.trouve ? (avant ? null : 'en-attente') : 'sans-avant-match',
      enAttente: e.avantMatch.trouve && !avant
    }
  ];
  const trous = [];
  let precedent = null;
  let avantA = null;
  for (const r of rows) {
    const { etat, suite } = etatDepuisInstantane(r, { precedent });
    precedent = suite;
    const t = enMs(r.taken_at);
    if (avantA !== null && t !== null && t - avantA > COURBE_TROU_MS) trous.push({ de: iso(avantA), a: iso(t) });
    if (t !== null) avantA = t;
    const p = {
      type: r.kind === 'fin' ? 'fin' : 'instantane',
      at: r.taken_at,
      phase: etat.phase,
      libelle: nettoyerLibelle(r.minute_label) || null,
      creneau: etat.creneau,
      part: etat.part,
      minute: etat.minute,
      score: { home: etat.h, away: etat.a },
      rouges: etat.rougesConnus ? { home: etat.rh, away: etat.ra } : null,
      rougesReportes: etat.rougesReportes,
      un2: null,
      raison: null,
      enAttente: false
    };
    if (!etat.calculable) p.raison = raisonDeLEtat(etat.phase, etat.raison);
    else if (!x.ligneCalc) p.raison = 'sans-avant-match';
    else if (!x.variante) {
      p.enAttente = true;
      p.raison = 'en-attente';
    } else await calculerLePoint(p, etat, x, ctx);
    points.push(p);
  }
  const c = e.calcul;
  points.push({
    type: 'courant',
    at: e.etat.releveLe,
    phase: e.etat.phase,
    libelle: e.etat.libelle,
    creneau: e.etat.creneau,
    part: e.etat.part,
    minute: e.etat.minute,
    score: { home: e.etat.score.home, away: e.etat.score.away },
    rouges: e.etat.rouges.connus ? { home: e.etat.rouges.home, away: e.etat.rouges.away } : null,
    rougesReportes: false,
    un2: c.un2 ? { ...c.un2 } : null,
    raison: c.fait ? null : c.raison,
    enAttente: c.enAttente
  });
  // Mise en service, écrans 4 (verification.md § 2.6) : la note lue point par point — un point d'une tranche non montrée,
  // d'un verdict « faits seuls », ou dont le 1N2 (famille result, paire result.* écartée de SA tranche) est retiré, sans chiffre.
  if (ctx.note) for (const p of points) { if (p.type === 'avant-match' || !p.un2) continue; const nmP = noteDuMatch({ note: ctx.note }, x.lb, trancheDuCreneau(p.creneau), ctx.reconductions); if (aBlancPour(nmP) || nmP.famillesNonMontrees.includes('result') || nmP.ecartees.some((q) => /^result(\.|$)/.test(String(q?.unite ?? '')))) { p.un2 = null; p.raison = 'non-montre'; } }
  return { variante: x.variante?.id ?? null, points, trous, complete: trous.length === 0 && !points.some((p) => p.enAttente), raison: null };
}

// ------------------------------------------------------------ les deux lectures

/** L'état de la boucle à cette minute (getEtatMinute), ou refait depuis live_snapshots en rejeu. */
function laSource(ctx) {
  if (ctx.instant !== null) return { em: etatRejoue(ctx), statut: {} };
  const em = appeler(ctx.sources.etatMinute, ctx.heure) ?? {};
  const statut = appeler(ctx.sources.statut, ctx.heure) ?? {};
  return { em, statut };
}

/**
 * LE TABLEAU (GET /api/direct) : tous les matchs suivis, jamais coupés (P6 bis). Options : { maintenant, database, instant,
 * note, varianteAffichee, budgetMs } ; pour les tests : { etatMinute, statut, coupure, bac, interrupteurs, ligneDe,
 * rejeuPermis, calendrier, club, fichierCalendrier }. Rend { version, versionDuDirect, genereLe, rejeu, boucle, note,
 * varianteReglee, matchs, finis, calculs }.
 */
export async function tableauDuDirect(options = {}) {
  const ctx = contexte(options);
  const n = await laNote(ctx.noteOption);
  ctx.note = n.note;
  purger(ctx);
  const { em, statut } = laSource(ctx);
  const boucle = laBoucle(ctx, em, statut);
  const nuit = nuitDe(ctx);
  const xs = [];
  for (const m of trier(em.matchs ?? [])) {
    xs.push(faitsDuMatch(m, ctx, { nuit, em, boucle, statut, note: n }));
    if (performance.now() - ctx.debutDeBloc >= BLOC_DE_FAITS_MS) await rendreLaMain(ctx);
  }
  await calculerLesMatchs(xs, ctx, false);
  for (const x of xs) taireLesChiffres(x, ctx);
  await lesPages(xs, ctx);
  // Correctifs D3, point 2 : chaque fini avec la page de sa fiche au magasin (deux petites requêtes), la main rendue dès 20 ms.
  const finis = [];
  for (const f of em.finis ?? []) {
    finis.push(finiDe(f, ctx));
    if (performance.now() - ctx.debutDeBloc >= BLOC_DE_FAITS_MS) await rendreLaMain(ctx);
  }
  finis.sort((a, b) => String(b.finReleveeLe).localeCompare(String(a.finReleveeLe)) || a.fotmobId.localeCompare(b.fotmobId));
  return {
    version: 1,
    versionDuDirect: VERSION_DU_DIRECT,
    genereLe: iso(ctx.maintenant),
    rejeu: ctx.instant === null ? null : { instant: iso(ctx.instant) },
    boucle,
    note: resumeDeLaNote(n),
    varianteReglee: ctx.reglage,
    matchs: xs.map((x) => x.entree),
    finis,
    calculs: bilanDesCalculs(ctx)
  };
}

/**
 * LES MATCHS EN COURS (GET /api/direct/en-cours ; correctifs D2, point 2 a) : TOUS ceux que la boucle suit en cours, sans
 * plafond, depuis l'état de la boucle SEULEMENT (getEtatMinute ; en rejeu, live_snapshots) — ni calcul, ni ligne de nuit, ni
 * note, ni calendrier. L'état de chacun (phase, minute, score) est celui du tableau (etatDuMatch, la même règle). Options :
 * celles du tableau. Rend { version, genereLe, rejeu, boucle: { pourquoi }, matchs: [{ fotmobId, homeId, awayId, date,
 * libelle, phase, minute, ajout, creneau, score: { home, away }, perime, ageS }] } — `libelle` : le libellé de FotMob tel
 * que relevé ; `minute`, `ajout`, `creneau` : ce qu'il faut à l'interface pour dire la minute avec ses mots (minuteDite) ;
 * `date` : le jour (UTC) du match. Un score inconnu reste null, jamais 0. Correctif « écrans 1 » (13/11/2026) : `perime` et
 * `ageS` (secondes ; null si l'heure du relevé est inconnue), la règle du tableau (releveDuMatch) — un relevé périmé
 * (boucle suspendue ou arrêtée, match sorti de la liste) ne donne plus de minute à la puce ; le match reste compté.
 */
export async function enCoursDuDirect(options = {}) {
  const ctx = contexte(options);
  const { em, statut } = laSource(ctx);
  const boucle = laBoucle(ctx, em, statut);
  const matchs = [];
  for (const m of trier(em.matchs ?? [])) {
    const e = etatDuMatch({ match: { liste: m.liste ?? null, memoire: m.memoire ?? null }, maintenant: ctx.heure });
    const rl = releveDuMatch(e, ctx, { em, boucle, statut });
    matchs.push({
      fotmobId: String(m.id),
      homeId: m.homeId ?? null,
      awayId: m.awayId ?? null,
      date: m.date ?? (enMs(m.kickoff) !== null ? jourUtc(enMs(m.kickoff)) : null),
      libelle: e.minute.libelle ?? null,
      phase: e.phase,
      minute: e.minute.valeur ?? null,
      ajout: e.minute.ajout ?? null,
      creneau: e.minute.creneau ?? null,
      score: e.score.connu ? { home: e.score.h, away: e.score.a } : { home: null, away: null },
      perime: Boolean(rl.perime),
      ageS: rl.ageS ?? null
    });
    if (performance.now() - ctx.debutDeBloc >= BLOC_DE_FAITS_MS) await rendreLaMain(ctx);
  }
  return { version: 1, genereLe: iso(ctx.maintenant), rejeu: ctx.instant === null ? null : { instant: iso(ctx.instant) }, boucle: { pourquoi: boucle.pourquoi }, matchs };
}

/** Le match cherché : { id } (chiffres), ou { home, away, coup } (identifiants FotMob « fotmob-<chiffres> », jamais un nom). */
function cibleDe(options) {
  if (options.id !== undefined && options.id !== null) {
    const id = String(options.id).trim();
    if (!/^[1-9]\d*$/.test(id)) throw new TypeError('lectureDuDirect : `id` doit être un identifiant FotMob (chiffres).');
    return { id };
  }
  const home = String(options.home ?? '').trim();
  const away = String(options.away ?? '').trim();
  if (!/^fotmob-[1-9]\d*$/.test(home) || !/^fotmob-[1-9]\d*$/.test(away)) throw new TypeError('lectureDuDirect : `home` et `away` doivent s’écrire « fotmob-<chiffres> » (jamais un nom).');
  const coup = enMs(options.coup);
  if (coup === null) throw new TypeError('lectureDuDirect : `coup` (le coup d’envoi, date ISO) est obligatoire avec `home` et `away`.');
  return { home, away, coup };
}

const estLaCible = (cible) => (x) =>
  cible.id
    ? String(x.id) === cible.id
    : x.homeId === cible.home && x.awayId === cible.away && enMs(x.kickoff) !== null && Math.abs(enMs(x.kickoff) - cible.coup) < COUP_D_ENVOI_ECART_MS;

/** Le dernier instantané du match cherché (≤ l'heure), par son identifiant ou par les deux identifiants de clubs et le jour. */
function dernierInstantane(ctx, cible) {
  try {
    if (cible.id) return ctx.database.prepare(`SELECT ${COLONNES_INSTANTANE} FROM live_snapshots WHERE fotmob_id = ? AND taken_at <= ? ORDER BY taken_at DESC LIMIT 1`).get(cible.id, iso(ctx.heure)) ?? null;
    const jours = [-1, 0, 1].map((d) => jourUtc(cible.coup + d * JOUR_MS));
    const rows = ctx.database
      .prepare(`SELECT ${COLONNES_INSTANTANE} FROM live_snapshots WHERE date IN (?, ?, ?) AND home_id = ? AND away_id = ? AND taken_at <= ? ORDER BY taken_at DESC`)
      .all(...jours, cible.home, cible.away, iso(ctx.heure));
    return rows.find((r) => enMs(r.kickoff) === null || Math.abs(enMs(r.kickoff) - cible.coup) < COUP_D_ENVOI_ECART_MS) ?? null;
  } catch {
    return null;
  }
}

/**
 * POURQUOI UN MATCH N'EST PAS SUIVI (R11) : fini depuis moins de 3 h (ou instantané de fin) → `fini` (statut terminé ou
 * annulé) ou `coupure-4h` ; boucle coupée, suspendue, pas démarrée ; coup d'envoi à venir → `pas-commence` ; suivi puis
 * disparu → `plus-suivi` ; heure prévue passée depuis moins de 30 min → `pas-encore-vu` ; sinon `inconnu`.
 */
function nonSuivi(ctx, em, boucle, cible) {
  const f = (em.finis ?? []).find(estLaCible(cible));
  if (f) {
    const fin = finiDe(f, ctx);
    return { raison: fin.raison, fin };
  }
  const der = dernierInstantane(ctx, cible);
  if (der && der.kind === 'fin') {
    const fin = finiDe({
      id: der.fotmob_id,
      league: der.league,
      leagueKey: der.league_key,
      kickoff: der.kickoff,
      date: der.date,
      homeId: der.home_id,
      awayId: der.away_id,
      homeName: der.home_name,
      awayName: der.away_name,
      at: enMs(der.taken_at),
      liste: listeDeLInstantane(der),
      fin: { status: der.status, homeGoals: der.home_goals ?? null, awayGoals: der.away_goals ?? null },
      memoire: null
    }, ctx);
    return { raison: fin.raison, fin };
  }
  if (!boucle.active) return { raison: boucle.pourquoi === 'suspendue' ? 'boucle-suspendue' : boucle.pourquoi === 'pas-demarree' ? 'pas-demarree' : 'boucle-coupee', fin: null };
  const coup = cible.coup ?? enMs(der?.kickoff);
  if (coup !== null && coup !== undefined && coup > ctx.heure) return { raison: 'pas-commence', fin: null };
  if (der) return { raison: 'plus-suivi', fin: null };
  if (coup !== null && coup !== undefined && ctx.heure - coup < PAS_ENCORE_VU_MS) return { raison: 'pas-encore-vu', fin: null };
  return { raison: 'inconnu', fin: null };
}

/**
 * UN MATCH (GET /api/direct/match) : options du tableau, plus `id` OU `home` + `away` + `coup`. Suivi → { suivi: true, match
 * (avec calcul.marches et la minute 0 complète), reference, courbe } ; sinon { suivi: false, raison (R11), fin }. Toujours
 * `boucle`, `note`, `calculs`.
 */
export async function matchDuDirect(options = {}) {
  const cible = cibleDe(options);
  const ctx = contexte(options);
  const n = await laNote(ctx.noteOption);
  ctx.note = n.note;
  purger(ctx);
  const { em, statut } = laSource(ctx);
  const boucle = laBoucle(ctx, em, statut);
  const base = {
    version: 1,
    versionDuDirect: VERSION_DU_DIRECT,
    genereLe: iso(ctx.maintenant),
    rejeu: ctx.instant === null ? null : { instant: iso(ctx.instant) },
    boucle,
    note: resumeDeLaNote(n),
    varianteReglee: ctx.reglage
  };
  const m = (em.matchs ?? []).find(estLaCible(cible));
  if (!m) {
    const { raison, fin } = nonSuivi(ctx, em, boucle, cible);
    return { ...base, suivi: false, raison, fin, match: null, reference: null, courbe: null, calculs: bilanDesCalculs(ctx) };
  }
  const x = faitsDuMatch(m, ctx, { nuit: nuitDe(ctx), em, boucle, statut, note: n, complet: true });
  await calculerUnMatch(x, ctx, true);
  const reference = referenceDuMatch(x, ctx);
  const courbe = await courbeDuMatch(x, ctx);
  taireLesChiffres(x, ctx, courbe);
  // Correctif K4 (13/11) : « aucun pourcentage à blanc » vaut aussi pour la référence — l'écran ne montre pas sa probabilité
  // marge retirée quand le calcul est à blanc (ui/src/utils/direct.js, referenceDite : `!aBlanc && fini(l.proba)`) ; le JSON
  // suit l'écran. Le prix, son fournisseur et son heure restent (des faits relevés). `reference` est une copie (structuredClone).
  if (x.entree.calcul.aBlanc && !ctx.chiffresABlanc) for (const l of reference.lignes) l.proba = null;
  await lesPages([x], ctx);
  return { ...base, suivi: true, raison: null, fin: null, match: x.entree, reference, courbe, calculs: bilanDesCalculs(ctx) };
}
