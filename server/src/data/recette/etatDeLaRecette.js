/**
 * etatDeLaRecette.js — CE QUE LA FEUILLE DE ROUTE LIT DU JOURNAL DE LA RECETTE (étape 47 du plan, lot 1, passe P4a,
 * 17/11/2026).
 * -----------------------------------------------------------------------
 * Un LECTEUR TOLÉRANT, appelé à chaque GET /api/roadmap (consigne § 3.1, R-S9, CR-46) :
 *   - une seule tentative par fichier : fs.statSync, puis fs.readFileSync + JSON.parse dans un try ; jamais le lecteur à
 *     reprises d'atomicJson.js (readJsonFile attend jusqu'à 1,5 s en synchrone), jamais le lecteur à renommage de
 *     l'actualisation (refreshStatusRepository.js), jamais la base ;
 *   - un cache par chemin, gardé seulement après une lecture RÉUSSIE et seulement tant que la date et la taille du fichier
 *     n'ont pas changé ; une lecture ratée n'est JAMAIS gardée (mémoire « Verrous OneDrive ») ;
 *   - un contrôle de forme : un objet attendu (un tableau ou un nombre = « illisible ») ; decisions.json doit porter une
 *     liste `decisions` ;
 *   - il ne lève jamais : un échec rend { lisible: false, probleme } (la carte dit « journal illisible pour l'instant ») ;
 *   - il n'écrit rien.
 * Ce qu'il lit (les fichiers que le journal et recette.mjs écrivent, cheminsDeLaRecette.js) : le battement et le dernier
 * état vu (hors OneDrive), les fichiers du jour et decisions.json (server/data/runtime/journal-recette). Il ne lit aucun
 * fichier de Pierre (refresh-status.json et les autres) : le journal les a déjà résumés.
 * Les chemins par défaut viennent de cheminsParDefaut, qui REFUSE sous un essai : un essai passe toujours ses chemins.
 * Fermeture des imports (consigne § 2.3 P3-P4, essai de recetteFeuilleDeRoute.test.mjs) : node:fs, cheminsDeLaRecette.js
 * (node:, config/bacASable.js, calendrierDeLaRecette.js) et calendrierDeLaRecette.js ; ni refreshStatusRepository.js, ni
 * matchStatsDb.js, ni env.js, ni le journal (qui importe liveWatch.js).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { cheminsParDefaut } from './cheminsDeLaRecette.js';
import { RECETTE, jourDeParis, jourZero, finDeLaRecette, ajouterJours, estUnJour, joursEntre } from './calendrierDeLaRecette.js';

/** Un objet (jamais un tableau ni une valeur simple). */
export const estUnObjet = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** decisions.json : un objet qui porte une liste `decisions`. */
export const formeDesDecisions = (v) => estUnObjet(v) && Array.isArray(v.decisions);

/**
 * Un lecteur à cache (CR-46) : (fichier, forme?) → { etat: 'lu' | 'absent' | 'illisible', valeur, probleme }. Une
 * tentative ; le cache ne garde que des lectures réussies, à la date et la taille près. Ne lève jamais.
 */
export function creerLecteurTolerant({ fsx = fs } = {}) {
  const cache = new Map();
  return function lire(fichier, forme = estUnObjet) {
    let st;
    try {
      st = fsx.statSync(fichier);
    } catch (e) {
      cache.delete(fichier);
      return e?.code === 'ENOENT' ? { etat: 'absent', valeur: null } : { etat: 'illisible', valeur: null, probleme: String(e?.message ?? e).slice(0, 200) };
    }
    const garde = cache.get(fichier);
    if (garde && garde.mtimeMs === st.mtimeMs && garde.size === st.size) return { etat: 'lu', valeur: garde.valeur };
    try {
      const valeur = JSON.parse(fsx.readFileSync(fichier, 'utf8'));
      if (!forme(valeur)) {
        cache.delete(fichier);
        return { etat: 'illisible', valeur: null, probleme: 'forme inattendue' };
      }
      cache.set(fichier, { mtimeMs: st.mtimeMs, size: st.size, valeur });
      return { etat: 'lu', valeur };
    } catch (e) {
      cache.delete(fichier);
      return { etat: 'illisible', valeur: null, probleme: String(e?.message ?? e).slice(0, 200) };
    }
  };
}

const LECTEUR_DU_SERVEUR = creerLecteurTolerant();

/** Au plus 14 lignes de jours dans la carte (la structure complète, principe d'affichage). */
export const LIGNES_DE_JOURS = 14;

/**
 * Les jours que la carte montre : J1 à J14 quand J0 est écrit ; sinon (rodage) les jours du premier jour du journal à
 * aujourd'hui, les 14 derniers au plus ; sans premier jour connu, aucun (le journal n'a pas démarré). Pur.
 */
export function joursAMontrer({ recette = RECETTE, aujourdhui, premierJour = null }) {
  const j0 = jourZero(recette);
  if (j0) return Array.from({ length: recette.jours }, (_, i) => ajouterJours(j0, i + 1));
  if (!estUnJour(aujourdhui) || !estUnJour(premierJour ?? '') || joursEntre(premierJour, aujourdhui) < 0) return [];
  const n = Math.min(LIGNES_DE_JOURS, joursEntre(premierJour, aujourdhui) + 1);
  return Array.from({ length: n }, (_, i) => ajouterJours(aujourdhui, i - n + 1));
}

/**
 * L'ÉTAT LU du journal de la recette, pour la feuille de route. Ne lève jamais. Rend
 *   { lisible, probleme, aujourdhui, maintenant, recette, premierJour, battement, dernierEtat, decisions,
 *     jours: [{ jour, etat: 'lu' | 'absent' | 'illisible' | 'a-venir', resume }], lus: { nom: etat },
 *     illisibles: [{ nom, probleme }], decisionsIllisibles, chemins: { journal, racine } } (P4b-1 : RC-20, RC-21).
 * `lisible` est faux si les chemins sont refusés ou si un fichier existe mais ne se lit pas (ou n'a pas la bonne forme).
 * Le jour en cours se lit dans le dernier état vu (plus frais) quand il est de ce jour-là, sinon dans son fichier.
 */
export function etatDeLaRecette({ maintenant = Date.now(), recette = RECETTE, chemins = null, parDefaut = cheminsParDefaut, lire = LECTEUR_DU_SERVEUR } = {}) {
  const aujourdhui = jourDeParis(maintenant);
  const vide = { aujourdhui, maintenant, recette, premierJour: null, battement: null, dernierEtat: null, decisions: [], jours: [], lus: {} };
  try {
    let c = chemins;
    if (!c) {
      const d = parDefaut();
      if (!d?.ok) return { ...vide, lisible: false, probleme: `chemins du journal refusés : ${d?.raison ?? 'raison inconnue'}` };
      c = d.chemins;
    }
    const problemes = [];
    const illisibles = [];
    const lus = {};
    const noter = (nom, r) => {
      lus[nom] = r.etat;
      if (r.etat === 'illisible') {
        problemes.push(`${nom} : ${r.probleme ?? 'illisible'}`);
        illisibles.push({ nom, probleme: String(r.probleme ?? 'illisible').slice(0, 120) });
      }
      return r.etat === 'lu' ? r.valeur : null;
    };
    const battement = noter('battement.json', lire(c.battement));
    const dernierEtat = noter('dernier-etat.json', lire(c.dernierEtat));
    const decisionsLu = lire(c.decisions, formeDesDecisions);
    const decisions = noter('decisions.json', decisionsLu)?.decisions ?? [];
    const premierJour = [recette?.rodageDepuis, dernierEtat?.vus?.premierJour].find((j) => estUnJour(j ?? '')) ?? null;
    const jours = joursAMontrer({ recette, aujourdhui, premierJour }).map((jour) => {
      if (estUnJour(aujourdhui) && jour > aujourdhui) return { jour, etat: 'a-venir', resume: null };
      if (jour === aujourdhui && dernierEtat?.jour === jour && estUnObjet(dernierEtat.resume)) return { jour, etat: 'lu', resume: dernierEtat.resume };
      const r = lire(c.fichierDuJour(jour));
      const resume = noter(`${jour}.json`, r);
      return { jour, etat: r.etat, resume };
    });
    return {
      ...vide,
      lisible: problemes.length === 0,
      probleme: problemes.length ? problemes.join(' ; ').slice(0, 400) : null,
      premierJour,
      battement,
      dernierEtat: dernierEtat ? { jour: dernierEtat.jour ?? null, ecritLe: dernierEtat.ecritLe ?? null } : null,
      decisions,
      jours,
      lus,
      illisibles,
      decisionsIllisibles: decisionsLu.etat === 'illisible',
      chemins: { journal: c.dossierDuJournal ?? null, racine: c.racine ?? null },
      fin: finDeLaRecette(recette)
    };
  } catch (e) {
    return { ...vide, lisible: false, probleme: `lecture du journal en erreur : ${String(e?.message ?? e).slice(0, 200)}` };
  }
}
