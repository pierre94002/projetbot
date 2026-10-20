/**
 * file.js — la file d'écriture des enregistreurs (étape E du plan).
 * -----------------------------------------------------------------------
 * LA RÈGLE WAL (trois incidents de journal en septembre 2026) : un seul
 * écrivain, le serveur ; des écritures en petites tranches, la main rendue
 * entre deux ; JAMAIS d'écriture pendant un import, ni pendant que le verrou
 * d'actualisation est tenu par une autre tâche (une passe, un import en
 * ligne de commande). Les enregistreurs relèvent donc quand il le faut —
 * un match en direct n'attend pas — mais n'ÉCRIVENT qu'ici : ils mettent
 * leurs lignes en file, et la file ne se vide que si personne ne tient le
 * verrou (isRefreshRunning, ce processus et les autres). Pendant une passe
 * d'actualisation, rien ne se perd : tout attend en mémoire, et part à la
 * minute qui suit sa fin.
 *
 * Seule exception : l'étape « gel des pronostics » de l'actualisation, qui
 * TIENT le verrou — elle écrit les lignes du gel (les siennes et celles des
 * analyses qui attendaient), et elles seules (`dansLaPasse` + `seulement`),
 * dans le temps de son étape.
 *
 * Bornée : au-delà de LIGNES_MAX lignes en attente pour un enregistreur
 * (verrou tenu des heures par un import bloqué), les plus anciennes sont
 * retirées et comptées « perdues » ; l'alerte durable le dit.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { isRefreshRunning } from '../providers/refreshLock.js';
import { ecrireInstantanes, ecrireAbsents, ecrirePronostics, ecrireCotesPayantes, ecrireSaisiesEnFile, compterLignes } from './depot.js';
import { pause, iso } from './communs.js';

const LIGNES_MAX = 60_000;
/** Taille d'une tranche (une transaction) par enregistreur : quelques dizaines de millisecondes au plus. */
const TRANCHES = { direct: 200, absents: 40, gel: 30, 'cotes-payantes': 1000, saisies: 50 };
const PAUSE_MS = 25;

/**
 * Les écrivains, et ce qui date une ligne : l'heure qu'avait la donnée
 * relevée (instantané, lecture, gel, relevé payant, saisie à la main).
 * « saisies » (étape 7 du plan) : les cotes que Pierre tape sur la page d'un
 * match (data/saisiesCotes.js) passent par la MÊME file — jamais écrites
 * pendant un import ni quand une passe tient le verrou ; elles attendent.
 */
const ECRIVAINS = {
  direct: { ecrire: ecrireInstantanes, heure: (l) => l.takenAt },
  absents: { ecrire: ecrireAbsents, heure: (l) => l.lecture?.readAt },
  gel: { ecrire: ecrirePronostics, heure: (l) => l.recordedAt },
  'cotes-payantes': { ecrire: ecrireCotesPayantes, heure: (l) => l.releveAt ?? l.marqueur?.sourceAt },
  saisies: { ecrire: ecrireSaisiesEnFile, heure: (l) => l.releveAt }
};

const files = new Map();
const bilan = { ecrites: 0, perdues: 0, reportees: 0, erreur: null, dernierVidage: null, attenteDepuis: null };
let chaine = Promise.resolve();

function fileDe(recorder) {
  if (!ECRIVAINS[recorder]) throw new Error(`Enregistreur inconnu : ${recorder}`);
  if (!files.has(recorder)) files.set(recorder, { lignes: [], perdues: 0, ecrites: 0, derniereErreur: null });
  return files.get(recorder);
}

/** Met des lignes en attente d'écriture. Ne lève jamais pour une file pleine : les plus anciennes sortent, comptées. */
export function mettreEnFile(recorder, lignes) {
  const f = fileDe(recorder);
  for (const l of lignes ?? []) if (l) f.lignes.push(l);
  const trop = f.lignes.length - LIGNES_MAX;
  if (trop > 0) {
    f.lignes.splice(0, trop);
    f.perdues += trop;
    bilan.perdues += trop;
  }
  return f.lignes.length;
}

/** Une COPIE des lignes qui attendent d'être écrites pour un enregistreur (les saisies les montrent « en attente »). */
export function lignesEnAttente(recorder) {
  return (files.get(recorder)?.lignes ?? []).map((l) => ({ ...l }));
}

/** Lignes en attente, par enregistreur, et ce qui a été perdu ou écrit depuis le démarrage. */
export function etatDeLaFile() {
  const parEnregistreur = {};
  for (const [cle, f] of files) parEnregistreur[cle] = { enAttente: f.lignes.length, perdues: f.perdues, ecrites: f.ecrites, derniereErreur: f.derniereErreur };
  return { ...bilan, parEnregistreur };
}

/**
 * Écrit ce qui attend, tranche par tranche, si personne ne tient le verrou
 * (`dansLaPasse` : l'appelant EST la passe qui le tient). Le verrou est
 * revérifié avant chaque tranche : un import qui démarre en cours de route
 * arrête l'écriture, le reste attend. Les appels sont mis bout à bout, jamais
 * deux à la fois.
 *
 * @returns {Promise<{ ecrites: number, reporte?: true, erreur?: string, restantes: number }>}
 */
export function vider({ database = null, dansLaPasse = false, seulement = null, maintenant = null } = {}) {
  const travail = chaine.then(() => viderMaintenant({ database, dansLaPasse, seulement, maintenant }));
  chaine = travail.catch(() => {});
  return travail;
}

async function viderMaintenant({ database, dansLaPasse, seulement, maintenant }) {
  const cles = seulement ? [seulement] : [...files.keys()];
  const resultat = { ecrites: 0, restantes: 0 };
  for (const cle of cles) {
    const f = files.get(cle);
    if (!f?.lignes.length) continue;
    const { ecrire, heure } = ECRIVAINS[cle];
    const taille = TRANCHES[cle] ?? 200;
    while (f.lignes.length) {
      if (!dansLaPasse && isRefreshRunning()) {
        bilan.reportees++;
        bilan.attenteDepuis ??= iso(maintenant ?? Date.now());
        resultat.reporte = true;
        resultat.restantes = totalEnAttente();
        return resultat;
      }
      const tranche = f.lignes.slice(0, taille);
      const base = database ?? openDb();
      try {
        const n = ecrire(tranche, { database: base });
        f.lignes.splice(0, tranche.length);
        const heures = tranche.map(heure).filter(Boolean).sort();
        compterLignes(cle, n, heures.at(-1) ?? null, { database: base, maintenant: maintenant ?? Date.now() });
        f.ecrites += n;
        bilan.ecrites += n;
        resultat.ecrites += n;
        f.derniereErreur = null;
      } catch (error) {
        // La tranche reste en tête de file : la minute suivante la retente.
        f.derniereErreur = { at: iso(maintenant ?? Date.now()), message: String(error?.message ?? error).slice(0, 300) };
        bilan.erreur = { recorder: cle, ...f.derniereErreur };
        resultat.erreur = f.derniereErreur.message;
        resultat.restantes = totalEnAttente();
        return resultat;
      }
      if (f.lignes.length) await pause(PAUSE_MS);
    }
  }
  bilan.dernierVidage = iso(maintenant ?? Date.now());
  bilan.attenteDepuis = totalEnAttente() ? bilan.attenteDepuis : null;
  if (!totalEnAttente()) bilan.erreur = null;
  resultat.restantes = totalEnAttente();
  return resultat;
}

function totalEnAttente() {
  let n = 0;
  for (const f of files.values()) n += f.lignes.length;
  return n;
}

/** Pour les tests : tout oublier. */
export function __viderLaFileSansEcrire() {
  files.clear();
  Object.assign(bilan, { ecrites: 0, perdues: 0, reportees: 0, erreur: null, dernierVidage: null, attenteDepuis: null });
}

export const __testing = { LIGNES_MAX, TRANCHES };
