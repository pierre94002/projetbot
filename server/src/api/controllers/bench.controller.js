/**
 * bench.controller.js — le BANC D'ESSAI vu de l'interface (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * GET  /api/bench      LECTURE SEULE : la note de départ (écrite dans le code,
 *                      noteDeDepart.js), le dernier rejeu fini de CETTE appli
 *                      (sans son résumé : il peut être arrêté en erreur) et le
 *                      dernier rejeu RÉUSSI (avec son résumé : le tableau de la
 *                      page ; correction du 19/10), le rejeu en cours (mémoire du
 *                      serveur), les dix derniers rejeux, les périodes, les
 *                      jeux de prix, les décisions de Pierre, la provenance.
 *                      Jamais une écriture. `?resume=non` : le dernier rejeu
 *                      sans son résumé (la page pendant un rejeu, toutes les
 *                      5 s : 2 à 4 Mo de JSON relus pour rien sinon).
 * POST /api/bench/run  { periodes?, prix?, marches? } : lance un rejeu dans un
 *                      PROCESSUS À PART (data/db/bancAPart.js, base en lecture
 *                      seule ; correction du 19/10 : dans le serveur, il gardait
 *                      0,9 à 1 Go), sous le verrou d'actualisation (nom « banc ») ;
 *                      le serveur range le rejeu (bench_runs) et sa propre mesure
 *                      (retard de sa boucle, RSS) dans le bilan ; 202 tout de
 *                      suite. 409 si une actualisation, un import ou un rejeu
 *                      tient déjà la base (isRefreshRunning, ou la prend entre
 *                      la vérification et la pose du verrou) ; 503 si le
 *                      verrou ne se pose pas ; 400 sur une
 *                      demande invalide. Par défaut : P2 à P5, l'avant-match
 *                      football-data, les cotes gratuites et vos bookmakers
 *                      (P1 n'est pas rejouée : 6 min de plus pour une période
 *                      réservée aux apprentissages futurs).
 * -----------------------------------------------------------------------
 */

import { openDb, resolveDbPath } from '../../data/db/matchStatsDb.js';
import { rejouerAPart } from '../../data/db/bancAPart.js';
import { isRefreshRunning, withRefreshLock, tacheEnCours } from '../../data/providers/refreshLock.js';
import { lireReglagesDuMoteur } from '../../core/engine/engineConfig.js';
import { moteurDuRejeu } from '../../bench/runner.js';
import { ouvrirRejeu, finirRejeu, dernierRejeu, dernierRejeuReussi, rejeuxDe, rejeuEnCours, commencerRejeu, avancerRejeu, terminerRejeu } from '../../bench/depotBanc.js';
import { NOTE_DE_DEPART } from '../../bench/noteDeDepart.js';
import { PERIODES, JEUX_DE_PRIX, PERIODES_PAR_DEFAUT, PRIX_PAR_DEFAUT, FAMILLES_DU_BANC, DECISIONS_DE_PIERRE, HUIS_CLOS, BORNES_DES_LIVRES, VERSION_BANC } from '../../bench/periodes.js';
import { REGLES_DE_PARI } from '../../bench/simulateBets.js';
import { FIABILITE } from '../../core/engine/resultPrediction.js';
import { FIABILITE_SCORE } from '../../core/engine/scorePrediction.js';
import { ApiError } from '../middlewares/errorHandler.js';

/** D'où viennent les chiffres du banc : dit sur la page, tel quel. */
export const PROVENANCE = Object.freeze({
  magasin: 'Magasin SQLite (FotMob) et sa table du jour J : ce que l’appli savait la veille de chaque match.',
  footballData: 'football-data.co.uk, fichiers CSV gardés sur ce PC (table fd_history, 2000 → 2026) : scores, statistiques et cotes d’avant-match et de clôture.',
  prix: 'Avant-match football-data (vendredi ou mardi), cotes gratuites archivées (ESPN, 365Scores, bourses), vos relevés The Odds API (une heure avant le coup d’envoi au plus tard).',
  note: 'La note de départ est écrite dans le code (src/bench/noteDeDepart.js), d’après un rejeu du bac à sable.'
});

const enTranches = (bands) => Object.freeze(bands.map((b) => Object.freeze({ de: b.range[0] / 100, a: b.range[1] / 100, matchs: b.matches, annonce: null, realise: b.realized })));
/**
 * La fiabilité que l'APPLI affiche (resultPrediction.js, scorePrediction.js : mesurée le 23/09 sur 2025-26),
 * par table de calibration du banc, dans le même ordre de tranches : la page la pose à côté de ce que le banc
 * mesure. Pourcentages tels quels (44,3), jamais recalculés.
 */
export const FIABILITE_AFFICHEE = Object.freeze({
  cotes: FIABILITE.cotes,
  statistiques: FIABILITE.statistiques,
  'score:cotes': enTranches(FIABILITE_SCORE.cotes.bands),
  'score:statistiques': enTranches(FIABILITE_SCORE.statistiques.bands)
});

/** Le dernier refus d'un lancement (verrou pris entre la vérification et le départ), gardé pour la page. */
let dernierRefus = null;

export function getBench(req, res) {
  const database = openDb();
  const avecResume = req.query?.resume !== 'non';
  res.json({
    noteDeDepart: NOTE_DE_DEPART,
    dernierRejeu: dernierRejeu({ database, avecResume: false }),
    dernierRejeuReussi: dernierRejeuReussi({ database, avecResume }),
    enCours: rejeuEnCours(),
    dernierRefus,
    rejeux: rejeuxDe({ database, limite: 10 }),
    periodes: PERIODES,
    jeux: JEUX_DE_PRIX,
    regles: REGLES_DE_PARI,
    decisions: DECISIONS_DE_PIERRE,
    huisClos: HUIS_CLOS,
    livres: BORNES_DES_LIVRES,
    parDefaut: { periodes: PERIODES_PAR_DEFAUT, prix: PRIX_PAR_DEFAUT },
    fiabilite: FIABILITE_AFFICHEE,
    provenance: PROVENANCE
  });
}

const liste = (v, permis, nom) => {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || !v.length || v.some((x) => typeof x !== 'string' || !permis.includes(x))) {
    throw new ApiError(400, `« ${nom} » : une liste parmi ${permis.join(', ')}.`);
  }
  return [...new Set(v)];
};

export function postBenchRun(req, res) {
  if (isRefreshRunning()) throw new ApiError(409, 'Une actualisation, un import ou un rejeu tient la base : le banc ne se lance pas pendant ce temps. Réessayez quand ce sera fini.');
  if (rejeuEnCours()) throw new ApiError(409, 'Un rejeu du banc est déjà en cours.');
  const corps = req.body ?? {};
  const periodes = liste(corps.periodes, ['P1', 'P2', 'P3', 'P4', 'P5'], 'periodes') ?? [...PERIODES_PAR_DEFAUT];
  const prix = liste(corps.prix, Object.keys(JEUX_DE_PRIX), 'prix') ?? [...PRIX_PAR_DEFAUT];
  const marches = liste(corps.marches, FAMILLES_DU_BANC, 'marches');
  const database = openDb();
  const reglages = JSON.parse(JSON.stringify(lireReglagesDuMoteur().football));
  const moteur = moteurDuRejeu(reglages);
  const options = { periodes, prix, ...(marches ? { marches } : {}), graine: 1, tirages: 1000 };
  const tache = async () => {
    const id = ouvrirRejeu({ database, ou: 'serveur', moteur, options: { ...options, config: { empreinte: moteur.empreinteReglages, reglages } } });
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
  let promesse;
  try {
    promesse = withRefreshLock(tache, { stamp: false, nom: 'banc' });
  } catch (error) {
    // La pose du verrou a échoué tout de suite (fichier refusé par OneDrive…) : rien n'est lancé, « en cours » n'est pas posé.
    throw new ApiError(503, `Le verrou d’actualisation ne se pose pas : ${error.message}. Rien n’est lancé.`);
  }
  // Le verrou pris par un autre processus entre la vérification et la pose (un import lancé à la main à cet instant) :
  // withRefreshLock a rendu « reporté » sans rien lancer — la réponse le dit (jamais « lancé » ; correction du 19/10).
  if (tacheEnCours() !== 'banc') {
    throw new ApiError(409, 'Une actualisation ou un import vient de prendre la base : le banc n’est pas lancé. Réessayez quand ce sera fini.');
  }
  // La tâche ne démarre qu'à la microtâche suivante : « en cours » est posé avant son premier pas.
  commencerRejeu();
  dernierRefus = null;
  promesse
    .then((r) => {
      if (r?.skipped) dernierRefus = { le: new Date().toISOString(), raison: r.skipped };
      else if (r?.bilan?.erreur) console.error(`[banc] rejeu arrêté : ${r.bilan.erreur}`);
    })
    .catch((error) => {
      dernierRefus = { le: new Date().toISOString(), raison: error.message };
      console.error(`[banc] rejeu en échec : ${error.message}`);
    })
    .finally(terminerRejeu);
  res.status(202).json({ lance: true, options, enCours: rejeuEnCours() });
}
