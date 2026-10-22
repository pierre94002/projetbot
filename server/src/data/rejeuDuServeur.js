/**
 * rejeuDuServeur.js — un REJEU DU BANC lancé par le serveur (étapes 19 et 23 du plan).
 * -----------------------------------------------------------------------
 * Deux portes, une seule tâche :
 *   - le bouton « Lancer le banc » (POST /api/bench/run, bench.controller.js) ;
 *   - LE BANC DU MOIS (étape 23, 22/10/2026) : le 1er du mois à partir de 6 h
 *     (heure de Paris), APRÈS une passe d'actualisation (jamais pendant : le
 *     rejeu prend le verrou d'actualisation sous le nom « banc », une passe
 *     en cours le reporte), seulement quand le moteur a CHANGÉ depuis le
 *     dernier rejeu utile à la carte « où parier » — un rejeu réussi existe,
 *     mais aucun n'a l'empreinte du moteur en service. Jamais le premier
 *     rejeu : tant que Pierre n'a jamais cliqué « Lancer le banc », rien ne
 *     part tout seul (5 minutes, ~1,1 Go). Une tentative par mois au plus,
 *     réussie ou non (la ligne du rejeu, `declencheur: 'carte-mensuelle'`
 *     dans ses options rangées, la garde).
 * Le rejeu tourne dans un PROCESSUS À PART, base en lecture seule
 * (bancAPart.js), sous le jeton du calcul lourd (un à la fois) ; le serveur
 * le range (depotBanc.js) : un seul écrivain.
 * -----------------------------------------------------------------------
 */

import { openDb, resolveDbPath } from './db/matchStatsDb.js';
import { rejouerAPart } from './db/bancAPart.js';
import { isRefreshRunning, withRefreshLock, tacheEnCours } from './providers/refreshLock.js';
import { lireReglagesDuMoteur } from '../core/engine/engineConfig.js';
import { FICHIER_VERSIONS } from '../core/engine/engineVersions.js';
import { readJsonFile } from '../utils/atomicJson.js';
import { calculLourdEnCours } from '../utils/calculLourd.js';
import { moteurDuRejeu } from '../bench/runner.js';
import { ouvrirRejeu, finirRejeu, rejeuEnCours, commencerRejeu, avancerRejeu, terminerRejeu } from '../bench/depotBanc.js';
import { VERSION_BANC } from '../bench/periodes.js';
import { rejeuxUtilesALaCarte, debutDuMois, moisDeParis } from './bettingMap.js';

/** Le banc du mois : P2 (la preuve de la carte) et P3 (indicatif), au prix football-data d'avant-match — ~5 min. */
export const OPTIONS_DU_BANC_DU_MOIS = Object.freeze({ periodes: Object.freeze(['P2', 'P3']), prix: Object.freeze(['fd-avant-match']) });
export const DECLENCHEUR_MENSUEL = 'carte-mensuelle';

/**
 * La tâche d'un rejeu : la ligne ouverte (INSERT), le rejeu à part, la ligne finie (UPDATE) — jamais laissée
 * ouverte. `declencheur` est rangé dans les options de la ligne (jamais passé à l'enfant).
 */
export function tacheDeRejeu({ database, options, reglages, moteur, declencheur = null }) {
  return async () => {
    const id = ouvrirRejeu({ database, ou: 'serveur', moteur, options: { ...options, ...(declencheur ? { declencheur } : {}), config: { empreinte: moteur.empreinteReglages, reglages } } });
    commencerRejeu({ id });
    let r;
    try {
      // Le rejeu dans un PROCESSUS À PART, base en lecture seule ; le serveur ne fait qu'attendre et ranger.
      r = await rejouerAPart({ chemin: resolveDbPath(), options: { ...options, config: reglages }, avancement: avancerRejeu });
      r.bilan = { ...r.bilan, serveur: r.serveur };
    } catch (error) {
      // L'enfant arrêté ou en panne : le rejeu est fini « en erreur » (jamais laissé ouvert), sans résumé ; l'erreur est rangée.
      r = { bilan: { versionBanc: VERSION_BANC, erreur: error.message, serveur: error.serveur ?? null }, resume: null };
    }
    finirRejeu({ database, id, bilan: r.bilan, resume: r.resume });
    return r;
  };
}

/** Les rejeux du banc du mois déjà tentés pendant le mois de Paris de `maintenant` (lignes de bench_runs, sans résumé). */
function tentativesDuMois(database, maintenant) {
  const debut = debutDuMois(moisDeParis(maintenant));
  try {
    return database
      .prepare("SELECT id, lance_le, options FROM bench_runs WHERE lance_le >= ? AND options LIKE '%\"declencheur\":\"carte-mensuelle\"%'")
      .all(debut)
      .filter((r) => {
        try {
          return JSON.parse(r.options)?.declencheur === DECLENCHEUR_MENSUEL;
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
}

/**
 * LE BANC DU MOIS est-il dû ? Pur sur ce qu'on lui donne (les essais le rejouent) : rend { du, raison }.
 *   - avant le 1er du mois à 6 h de Paris : non ;
 *   - déjà tenté ce mois-ci : non ;
 *   - aucun rejeu réussi utile à la carte : non (le premier rejeu se lance d'un clic, jamais tout seul) ;
 *   - un rejeu réussi a déjà l'empreinte du moteur en service : non (rien n'a changé) ;
 *   - le moteur en service l'est depuis le début du mois (adoption, réglage, mise à jour du mois en cours) :
 *     non — le banc ne part que « le 1er du mois », pour un changement d'AVANT le 1er ; un changement du
 *     15 attend le 1er du mois suivant (ou un clic) ;
 *   - sinon : oui (le 1er, ou la première vérification d'après si l'appli était fermée le 1er).
 * `enServiceDepuis` : l'instant (ISO) où la version en service l'est devenue (journal des versions), ou null.
 */
export function bancDuMoisDu({ maintenant = Date.now(), tentatives = [], rejeux = [], empreinteMoteur, enServiceDepuis = null }) {
  const { jour, heure } = heureDeParis(maintenant);
  if (jour === 1 && heure < 6) return { du: false, raison: 'le 1er du mois, avant 6 h' };
  if (tentatives.length) return { du: false, raison: 'déjà tenté ce mois-ci' };
  if (!rejeux.length) return { du: false, raison: 'aucun rejeu du banc encore : le premier se lance d’un clic (Historique moteur › Banc d’essai)' };
  if (rejeux.some((r) => r.moteur?.empreinte === empreinteMoteur)) return { du: false, raison: 'le dernier banc mesure déjà le moteur en service' };
  const debut = debutDuMois(moisDeParis(maintenant));
  if (enServiceDepuis && enServiceDepuis >= debut) return { du: false, raison: 'le moteur a changé ce mois-ci : le banc sera relancé le 1er du mois prochain (ou d’un clic)' };
  return { du: true, raison: 'le moteur a changé depuis le dernier banc' };
}

/** L'instant (ISO) où la version en service l'est devenue, lu dans le journal des versions (étape 25) ; null sinon. */
export function versionEnServiceDepuis(brut) {
  const n = brut?.enService;
  if (!Number.isInteger(n)) return null;
  const dates = (Array.isArray(brut.journal) ? brut.journal : []).filter((e) => e?.version === n && typeof e.le === 'string').map((e) => e.le);
  return dates.length ? dates.sort().at(-1) : null;
}

const FORMAT_HEURE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
function heureDeParis(instant) {
  const p = Object.fromEntries(FORMAT_HEURE.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { jour: Number(p.day), heure: Number(p.hour) };
}

let dernierBancDuMois = null;
/** Ce qu'a dit la dernière vérification du banc du mois (la page du banc et la carte la lisent). */
export const etatDuBancDuMois = () => (dernierBancDuMois ? { ...dernierBancDuMois } : null);

/**
 * Vérifie le banc du mois et le LANCE s'il est dû — appelée par l'actualisation APRÈS une passe (le verrou
 * rendu), jamais pendant. Ne lève jamais. Rend { lance, raison }. Le rejeu tourne ensuite seul (la promesse
 * n'est pas attendue) : une passe qui démarre pendant ce temps est reportée par le verrou, comme au clic.
 */
export function relancerLeBancDuMoisSiBesoin({ maintenant = Date.now(), database = null } = {}) {
  const dire = (lance, raison) => {
    dernierBancDuMois = { le: new Date(maintenant).toISOString(), lance, raison };
    return { lance, raison };
  };
  try {
    if (isRefreshRunning()) return dire(false, 'une actualisation, un import ou un rejeu tient la base');
    if (rejeuEnCours()) return dire(false, 'un rejeu du banc est déjà en cours');
    const lourd = calculLourdEnCours();
    if (lourd) return dire(false, `un autre calcul lourd tourne (${lourd.nom})`);
    const db = database ?? openDb();
    const reglages = JSON.parse(JSON.stringify(lireReglagesDuMoteur().football));
    const moteur = moteurDuRejeu(reglages);
    const enServiceDepuis = versionEnServiceDepuis(readJsonFile(FICHIER_VERSIONS, null));
    const avis = bancDuMoisDu({ maintenant, tentatives: tentativesDuMois(db, maintenant), rejeux: rejeuxUtilesALaCarte({ database: db }), empreinteMoteur: moteur.empreinte, enServiceDepuis });
    if (!avis.du) return dire(false, avis.raison);
    const options = { periodes: [...OPTIONS_DU_BANC_DU_MOIS.periodes], prix: [...OPTIONS_DU_BANC_DU_MOIS.prix], graine: 1, tirages: 1000 };
    const promesse = withRefreshLock(tacheDeRejeu({ database: db, options, reglages, moteur, declencheur: DECLENCHEUR_MENSUEL }), { stamp: false, nom: 'banc' });
    if (tacheEnCours() !== 'banc') return dire(false, 'une actualisation ou un import vient de prendre la base');
    commencerRejeu();
    promesse
      .then((r) => {
        if (r?.bilan?.erreur) console.error(`[banc du mois] rejeu arrêté : ${r.bilan.erreur}`);
        else if (!r?.skipped) console.log('[banc du mois] rejeu fini : la carte « où parier » se recalcule à la passe suivante.');
      })
      .catch((error) => console.error(`[banc du mois] rejeu en échec : ${error.message}`))
      .finally(terminerRejeu);
    return dire(true, avis.raison);
  } catch (error) {
    return dire(false, `vérification en échec : ${String(error?.message ?? error).slice(0, 200)}`);
  }
}
