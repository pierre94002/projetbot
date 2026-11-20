/**
 * cheminsDeLaRecette.js — LES CHEMINS DU JOURNAL ET DE recette.mjs (étape 47 du plan, lot 1 ; P2, sorti du journal en P3).
 * -----------------------------------------------------------------------
 * § 7 règle 13 de la consigne : UNE fonction pure, cheminsDeLaRecette, nomme tous les fichiers écrits ou lus par le
 * journal et par recette.mjs ; les valeurs par défaut ne sont construites QUE par cheminsParDefaut (un essai de lecture
 * le vérifie), appelée par demarrerJournalDeLaRecette (server.js) et par recette.mjs lancé à la main.
 *
 * Pourquoi un module à part (P3, 17/11) : recette.mjs ne doit atteindre, même par un import() dynamique, ni
 * refreshStatusRepository.js, ni matchStatsDb.js, ni env.js (consigne § 2.3 P3-P4). Le journal importe liveWatch.js
 * (par import(), pour l'état du direct), qui importe la base : recette.mjs ne peut donc pas importer le journal. Ce
 * module n'importe que node:, config/bacASable.js et calendrierDeLaRecette.js. Le journal le ré-exporte tel quel.
 * -----------------------------------------------------------------------
 */

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeBacASable, dossierDuBac, estDans, RACINE_BAC } from '../../config/bacASable.js';
import { estUnJour } from './calendrierDeLaRecette.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));

/**
 * PURE : tous les fichiers que le journal et recette.mjs écrivent ou lisent, à partir de deux dossiers.
 *   racineHorsOneDrive : battement, dernier état vu, marque d'arrêt, annonce de mise en service ;
 *   dossierRuntime     : les fichiers du jour (AAAA-MM-JJ.json) et decisions.json.
 */
export function cheminsDeLaRecette({ racineHorsOneDrive, dossierRuntime } = {}) {
  if (typeof racineHorsOneDrive !== 'string' || !racineHorsOneDrive.trim()) throw new TypeError('racineHorsOneDrive manquant');
  if (typeof dossierRuntime !== 'string' || !dossierRuntime.trim()) throw new TypeError('dossierRuntime manquant');
  const racine = path.resolve(racineHorsOneDrive);
  const journal = path.resolve(dossierRuntime);
  return Object.freeze({
    racine,
    dossierDuJournal: journal,
    battement: path.join(racine, 'battement.json'),
    dernierEtat: path.join(racine, 'dernier-etat.json'),
    dernierArret: path.join(racine, 'dernier-arret.json'),
    miseEnService: path.join(racine, 'mise-en-service.json'),
    decisions: path.join(journal, 'decisions.json'),
    fichierDuJour: (jour) => {
      if (!estUnJour(jour)) throw new RangeError(`jour invalide : ${jour}`);
      return path.join(journal, `${jour}.json`);
    },
    // P4b-1 (RC-9) : le fichier de reprise d'un processus quand le fichier du jour existe mais ne se lit pas.
    repriseDuJour: (jour, pid) => {
      if (!estUnJour(jour)) throw new RangeError(`jour invalide : ${jour}`);
      if (!Number.isInteger(pid) || pid <= 0) throw new RangeError(`pid invalide : ${pid}`);
      return path.join(journal, `${jour}.reprise-${pid}.json`);
    }
  });
}

/**
 * Les SEULS chemins par défaut (le seul endroit où ils sont construits ; un essai de lecture le vérifie). Appelée par
 * demarrerJournalDeLaRecette (sans chemins donnés) et par recette.mjs lancé à la main. Rend { ok: true, chemins,
 * sources } ou { ok: false, raison } :
 *   - refus sous un essai (NODE_TEST_CONTEXT ou CM_TEST_DOSSIER posés) et quand le code tourne sous os.tmpdir()
 *     (copies des poses) : ces écritures iraient chez Pierre ;
 *   - mode bac : <bac>\recette (et <bac>\recette\journal), jamais %USERPROFILE%\CoteMaster\recette ni le dépôt (B14) ;
 *   - sinon : %USERPROFILE%\CoteMaster\recette (hors OneDrive) et server/data/runtime/journal-recette.
 * `sources` : où LIRE (server/data/runtime du code qui tourne, et le dossier des sauvegardes).
 */
export function cheminsParDefaut({ environnement = process.env, ici = ICI, tmpdir = os.tmpdir(), bac = undefined, accueil = os.homedir() } = {}) {
  if (environnement.NODE_TEST_CONTEXT) return { ok: false, raison: 'sous un essai (NODE_TEST_CONTEXT) : chemins par défaut refusés, passez des chemins' };
  if (environnement.CM_TEST_DOSSIER) return { ok: false, raison: 'sous un essai (CM_TEST_DOSSIER) : chemins par défaut refusés, passez des chemins' };
  if (estDans(ici, tmpdir)) return { ok: false, raison: `code sous le dossier temporaire (${tmpdir}) : chemins par défaut refusés` };
  const dossierBac = bac === undefined ? (modeBacASable(environnement) ? dossierDuBac() ?? RACINE_BAC : null) : bac;
  const runtime = path.resolve(ici, '..', '..', '..', 'data', 'runtime');
  if (dossierBac) {
    const racine = path.join(dossierBac, 'recette');
    if (!estDans(racine, dossierBac)) return { ok: false, raison: `bac : ${racine} hors de ${dossierBac}` };
    return { ok: true, chemins: cheminsDeLaRecette({ racineHorsOneDrive: racine, dossierRuntime: path.join(racine, 'journal') }), sources: { runtime, sauvegardes: path.join(dossierBac, 'sauvegardes') }, bac: dossierBac };
  }
  const base = environnement.MATCH_STATS_DB || path.join(accueil, 'CoteMaster', 'match-stats.db');
  return {
    ok: true,
    chemins: cheminsDeLaRecette({ racineHorsOneDrive: path.join(accueil, 'CoteMaster', 'recette'), dossierRuntime: path.join(runtime, 'journal-recette') }),
    sources: { runtime, sauvegardes: path.join(path.dirname(path.resolve(base)), 'sauvegardes') },
    bac: null
  };
}

/** Les fichiers LUS (jamais écrits) à partir des deux dossiers sources. */
export function fichiersLus({ runtime, sauvegardes }) {
  return {
    refresh: path.join(runtime, 'refresh-status.json'),
    controle: path.join(runtime, 'controle-quotidien.json'),
    sante: path.join(runtime, 'sante-fotmob.json'),
    sauvegarde: path.join(sauvegardes, 'etat-sauvegarde.json'),
    restauration: path.join(sauvegardes, 'etat-restauration.json'),
    ia: (jour) => path.join(runtime, 'journal-claude', `${jour}.json`)
    // P4b-1 (décision 25 a) : season-calendar.json n'est plus lu par la recette (le résumé ne le montrait qu'à moitié).
  };
}
