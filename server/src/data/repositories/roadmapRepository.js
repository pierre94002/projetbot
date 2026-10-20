/**
 * roadmapRepository.js — ce qui est propre à Pierre sur la feuille de route (étape 5 du plan).
 * -----------------------------------------------------------------------
 * data/runtime/roadmap.json :
 *   { version: 1, majLe, etapes: { "12": { note, noteLe, miseDeCote: { le, raison } } } }
 * une entrée par étape du plan (« 12 », « E »), seulement quand Pierre a quelque
 * chose à y mettre :
 *   - `note` / `noteLe`  sa note libre sur l'étape (PUT /api/roadmap/etapes/:id/note) ;
 *   - `miseDeCote`       l'état « mise de côté » qu'il choisira plus tard : lu et
 *                        affiché dès maintenant, aucune route ne l'écrit encore.
 * Le plan (lots, étapes, réglages, semaines) et l'historique des étapes terminées
 * ne sont PAS ici : ils sont dans le code (roadmap/plan.js, roadmap/historique.js),
 * parce que les données d'exécution du bac à sable ne sont jamais recopiées vers
 * l'appli de Pierre.
 *
 * Écriture : toujours par utils/atomicJson.js (fichier temporaire renommé,
 * nouvelles tentatives quand OneDrive tient le fichier), en FUSIONNANT champ
 * par champ : écrire la note de l'étape 12 ne touche ni la note de la 13, ni
 * la `miseDeCote` de la 12, ni un champ que ce fichier ne connaît pas encore.
 * Une demande qui ne change rien (même texte) ne réécrit RIEN : le fichier,
 * sa date et son contenu restent exactement les mêmes (PUT idempotent).
 *
 * Lecture : AUCUN cache — le fichier est minuscule, chaque lecture le relit, donc
 * une lecture ratée ne peut jamais rester en mémoire pour un fichier vide. Un
 * fichier illisible (tenu par OneDrive, tronqué) ou de forme inattendue n'est
 * jamais pris pour « pas de note » ni réécrit : la page le dit, et enregistrer
 * une note est refusé (503) tant qu'il l'est — mieux vaut une note qui attend
 * que toutes les notes de Pierre effacées par la première qu'il écrit (même
 * règle que favorites.json).
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';
import { normaliserIdEtape, etapeParId } from '../roadmap/plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FICHIER_FEUILLE_DE_ROUTE = path.resolve(__dirname, '../../../data/runtime/roadmap.json');
export const VERSION_FICHIER = 1;
/** Une note raisonnable : assez pour un paragraphe ou deux, pas un document. */
export const LONGUEUR_NOTE_MAX = 4000;

/** Une demande invalide (400). */
export class NoteInvalide extends Error {}
/** Une étape qui n'est pas dans le plan (404). */
export class EtapeInconnue extends Error {}
/** Le fichier des notes ne se lit pas : rien n'est écrit (503). */
export class NotesIllisibles extends Error {}

const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Ce qui ne va pas dans la forme du fichier, en une phrase, ou null. */
function problemeDeForme(brut) {
  if (!objetSimple(brut)) return 'le contenu n’est pas un objet JSON';
  if (brut.etapes !== undefined && !objetSimple(brut.etapes)) return '« etapes » n’est pas un objet';
  for (const [id, entree] of Object.entries(brut.etapes ?? {})) {
    if (!objetSimple(entree)) return `l’entrée de l’étape « ${id} » n’est pas un objet`;
    if (entree.note !== undefined && typeof entree.note !== 'string') return `la note de l’étape « ${id} » n’est pas un texte`;
    if (entree.noteLe !== undefined && typeof entree.noteLe !== 'string') return `la date de la note de l’étape « ${id} » n’est pas un texte`;
    if (entree.miseDeCote !== undefined && entree.miseDeCote !== true && !objetSimple(entree.miseDeCote)) return `« miseDeCote » de l’étape « ${id} » n’a pas la forme attendue`;
  }
  return null;
}

/** Le fichier tel qu'il est : { source: 'absent' | 'enregistre' | 'illisible', brut, probleme }. */
function lireBrut() {
  let brut;
  try {
    brut = readJsonFile(FICHIER_FEUILLE_DE_ROUTE, null);
  } catch (error) {
    return { source: 'illisible', brut: null, probleme: error.message };
  }
  if (brut === null) return { source: 'absent', brut: null, probleme: null };
  const probleme = problemeDeForme(brut);
  if (probleme) return { source: 'illisible', brut: null, probleme: `forme inattendue (${probleme})` };
  return { source: 'enregistre', brut, probleme: null };
}

/**
 * Ce que Pierre a écrit : { source, fichier, probleme, majLe, etapes: { [id]:
 * { note, noteLe, miseDeCote } } }. Les identifiants sont ceux du fichier, y
 * compris ceux que le plan ne connaît plus (la page les signale, jamais ne les
 * efface).
 */
export function lireDonneesPierre() {
  const { source, brut, probleme } = lireBrut();
  const etapes = {};
  for (const [id, entree] of Object.entries(brut?.etapes ?? {})) {
    const note = typeof entree.note === 'string' && entree.note.trim() ? entree.note : null;
    const miseDeCote = entree.miseDeCote
      ? { le: typeof entree.miseDeCote.le === 'string' ? entree.miseDeCote.le : null, raison: typeof entree.miseDeCote.raison === 'string' ? entree.miseDeCote.raison : null }
      : null;
    if (!note && !miseDeCote) continue;
    etapes[id] = { note, noteLe: note ? entree.noteLe ?? null : null, miseDeCote };
  }
  return { source, fichier: FICHIER_FEUILLE_DE_ROUTE, probleme, majLe: typeof brut?.majLe === 'string' ? brut.majLe : null, etapes };
}

/** Une note prête à ranger : fins de ligne unifiées, espaces de bord retirés ; '' veut dire « effacer ». */
export function validerNote(texte) {
  if (typeof texte !== 'string') throw new NoteInvalide('« note » doit être un texte (vide pour effacer la note).');
  const propre = texte.replace(/\r\n?/g, '\n').trim();
  if (propre.length > LONGUEUR_NOTE_MAX) {
    throw new NoteInvalide(`La note est trop longue (${propre.length} caractères, ${LONGUEUR_NOTE_MAX} au plus).`);
  }
  return propre;
}

/**
 * Écrit (ou remplace, ou efface si `texte` est vide) la note d'une étape.
 * Idempotent : le même texte ne réécrit rien (`change: false`). Lève
 * EtapeInconnue, NoteInvalide ou NotesIllisibles.
 * @returns {{ change: boolean, fichier: string, id: string, note: string|null, noteLe: string|null }}
 */
export function enregistrerNote(idBrut, texte, { maintenant = new Date() } = {}) {
  const id = normaliserIdEtape(idBrut);
  if (!id || !etapeParId(id)) {
    throw new EtapeInconnue(`Étape inconnue : « ${String(idBrut).slice(0, 40)} ». Le plan va de l’étape 0 à la 47, plus l’étape E.`);
  }
  const note = validerNote(texte);

  const lecture = lireBrut();
  if (lecture.source === 'illisible') {
    throw new NotesIllisibles(
      `Le fichier des notes (${FICHIER_FEUILLE_DE_ROUTE}) est illisible : ${lecture.probleme}. Rien n’est écrit, pour ne pas perdre vos notes. ` +
        'S’il est ouvert ailleurs ou encore envoyé par OneDrive, réessayez dans un instant ; sinon renommez-le (vos anciennes notes y restent) : une nouvelle note recréera le fichier.'
    );
  }

  const brut = lecture.brut ?? { version: VERSION_FICHIER, etapes: {} };
  const actuelle = brut.etapes?.[id] ?? {};
  const noteActuelle = typeof actuelle.note === 'string' ? actuelle.note : '';
  if (note === noteActuelle) {
    return { change: false, fichier: FICHIER_FEUILLE_DE_ROUTE, id, note: note || null, noteLe: note ? actuelle.noteLe ?? null : null };
  }

  const instant = maintenant.toISOString();
  const entree = { ...actuelle };
  if (note) {
    entree.note = note;
    entree.noteLe = instant;
  } else {
    delete entree.note;
    delete entree.noteLe;
  }
  const etapes = { ...(brut.etapes ?? {}) };
  if (Object.keys(entree).length) etapes[id] = entree;
  else delete etapes[id];

  // Les champs que ce fichier ne connaît pas encore (écrits par une version plus récente) sont gardés tels quels.
  const inconnus = { ...brut };
  for (const cle of ['version', 'majLe', 'etapes']) delete inconnus[cle];
  writeJsonAtomic(FICHIER_FEUILLE_DE_ROUTE, { version: brut.version ?? VERSION_FICHIER, majLe: instant, ...inconnus, etapes });
  return { change: true, fichier: FICHIER_FEUILLE_DE_ROUTE, id, note: note || null, noteLe: note ? instant : null };
}
