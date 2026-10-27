/**
 * simulationNuit.js — LES DEUX ÉTAPES DE NUIT DE LA SIMULATION (étape 28 du plan, conception §4.3 et §4.4).
 * -----------------------------------------------------------------------
 * HORS de l'empreinte du moteur (data/simulation/) : elles LISENT le moteur (analyzeMatch, la grille de goalModel.js)
 * sans jamais le modifier ; rien dans engine-config.json. L'heure vient de la passe (`maintenant`, obligatoire) :
 * jamais l'horloge lue ici (les durées seulement, par performance.now).
 *
 *   simulerLesSaisonsDeLaNuit — « simulationSaisons » : les fins de saison et l'enjeu, calculés dans un PROCESSUS À
 *     PART en lecture seule (simulationSaisonsEnfant.js : les deux lois, forces et table), RANGÉS par le serveur ;
 *   simulerLesMatchsDeLaNuit — « simulationMatchs » : pour chaque rencontre des 48 prochaines heures, l'analyse du
 *     moteur en service et, s'il y a une candidate au modèle de buts dont les forces sont à jour, la sienne (ce que
 *     fait moteurABlanc.js, SANS le retoucher), les entrées (entreesDeLAnalyse), puis les chemins de la grille
 *     « modele-buts-441 » seule tirés dans un PROCESSUS À PART sans base (simulationMatchsEnfant.js), qui refait 40
 *     rencontres avec la graine du jour (table identique à l'octet, sinon rien n'est rangé) ;
 *   le RANGEMENT, par le serveur seul, sous le verrou de la passe : tranches de 250 ordres, une transaction chacune,
 *     JAMAIS ouverte quand on rend la main ; `en_cours_*` posé avant, retiré après (les lecteurs lisent alors la nuit
 *     d'avant) ; une nuit interrompue est retirée par la suivante ;
 *   le CONTRÔLE de la nuit (graine refaite depuis les entrées rangées ; ligne calculée après le coup d'envoi : marquée,
 *     comptée, ÉCARTÉE du jugement) et le JUGE de la nuit (combinés : la grille contre le produit des simples ; le
 *     déroulé : annoncé contre réalisé ; provisoires chaque nuit dans simulation_state, le jugement principal UNE fois,
 *     à l'horizon de 800 matchs et 21 jours) ;
 *   l'ÉLAGAGE (la rétention de reglages.js), par tranches.
 * Un calcul lourd à la fois (utils/calculLourd.js) : un autre en cours → « reporté », rien de rangé. Garde du coup
 * d'envoi : une rencontre du calendrier seul (heure fictive 12:00Z) commence à 00 h de Paris de sa date ; elle n'est
 * écrite que si le jour de la passe est antérieur.
 * -----------------------------------------------------------------------
 */

import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, resolveDbPath } from '../db/matchStatsDb.js';
import { commencerCalculLourd, CalculLourdEnCours, calculLourdEnCours, phraseDuReport } from '../../utils/calculLourd.js';
import { creerPauses, executerEnRendantLaMain, rendreLaMainParDefaut } from '../../utils/travailCooperatif.js';
import { readJsonFile } from '../../utils/atomicJson.js';
import { CALENDAR_FILE_PATH } from '../repositories/seasonCalendarRepository.js';
import { getFixturesStatus } from '../repositories/fixturesRepository.js';
import { matchsAVenir, cleDuMatch, resolveur, sourceDesCotes } from '../enregistreurs/gelPronostics.js';
import { enrichMatchWithRealAverages } from '../providers/matchEnrichment.js';
import { analyzeMatch } from '../../core/engine/oddsEngine.js';
import { getEngineConfig } from '../../core/engine/engineConfig.js';
import { getTiltState } from '../../core/engine/tiltState.js';
import { candidateEnEssai, configDeLaCandidate } from '../../core/engine/engineVersions.js';
import { getSport } from '../../sports/index.js';
import { reglagesDuModeleDeButs, empreinteDesForces, grilleDesButs } from '../../core/engine/goalModel.js';
import { etatForcesButs } from '../db/forcesButs.js';
import { declarerVariante, lancementDe, jugementsDe } from '../../bench/trialsRegistry.js';
import { jugerEtape } from '../../bench/guard.js';
import { horizonAtteint } from '../../bench/horizonEssai.js';
import { lecteurDesRencontres } from '../calibration.js';
import { entreesDeLAnalyse, GRILLES } from './entreesSimulation.js';
import { graineDuMatch } from './simulationMatch.js';
import { probabiliteDuCombine, predicatDeLaJambe } from './jambes.js';
import { idFotMob } from './saisons.js';
import { N, FENETRE_H, VERSION_SIMULATION, RETENTION, CONVENTION_AVANT_30, HORIZON_DE_LA_PREUVE } from './reglages.js';
import { CLES, lireLesValeurs, ecrireLaValeur, effacerLaValeur } from './etatSimulation.js';
import { marchesEcartes } from './marchesEcartes.js';
import { calculerLesSaisons, CHAMPIONNATS } from './simulationSaisonsEnfant.js';
import { calculerLesDeroules, calculerSansEffets } from './simulationMatchsEnfant.js';

const ENFANT_SAISONS = fileURLToPath(new URL('./simulationSaisonsEnfant.js', import.meta.url));
const ENFANT_MATCHS = fileURLToPath(new URL('./simulationMatchsEnfant.js', import.meta.url));

/** Au-delà de 10 minutes sans réponse, l'enfant est arrêté et rien n'est rangé. */
export const DELAI_ENFANT_MS = 10 * 60_000;
/** La mémoire des enfants : tas plafonné (les saisons ≤ 400 Mo mesurés 225 ; les matchs ≤ 121 Mo mesurés). */
export const OPTIONS_ENFANT_SAISONS = Object.freeze(['--max-old-space-size=512', '--max-semi-space-size=8']);
export const OPTIONS_ENFANT_MATCHS = Object.freeze(['--max-old-space-size=256', '--max-semi-space-size=8']);
/** Ordres par transaction au rangement et à l'élagage. */
export const TRANCHE = RETENTION.tranche;
/** L'horizon de la preuve neuve (F6, la règle de l'étape 27) : 800 matchs ET 21 jours après le lancement (reglages.js : l'écran de Réglages le lit aussi). */
export { HORIZON_DE_LA_PREUVE };
/** La garde de sûreté (F6, K = 1) : |annoncé − réalisé| ≤ 4 points sur l'horizon, par combiné et par marché de déroulé. */
export const GARDE_SURETE_PT = 4;
/**
 * L'empreinte des forces de buts dont la loi « forces » a été jugée au banc des saisons (variante « saisons-forces »
 * de VARIANTES_DE_L_ETAPE_28) : une autre empreinte (essai de 27 recommencé avec d'autres demi-vies) est une variante
 * de plus, déclarée au registre AVANT de servir (`saisons-forces-<empreinte>`, conception §2.3).
 */
export const EMPREINTE_DES_FORCES_DECLAREE = 'v1|35|25|remise-a-zero';
/** Le jugement principal de l'étape 28 (F6) : sa phrase, la même chaque nuit (un seul principal par lancement). */
export const QUOI_DU_PRINCIPAL = 'Étape 28 — combinés d’un même match : la grille du modèle de buts contre le produit des simples (14 combinés par match, bloc = le match), lignes rangées chaque nuit';
/**
 * Le contrôle « sans effets » du juge (F6 : « pas moins bon que sans effets », RAPPORTÉ, jamais une porte), pris UNE
 * fois à l'horizon : les rencontres jugées rejouées dans l'enfant SANS effets du score ni rouges (variante C de v1,
 * « sim-stratifiee-sans-effets »), comparées au déroulé rangé sur les 18 marchés du bloc de v1 (v1-split.mjs, BLOC) —
 * « au moins un rouge » (aucun rouge sans effets), « 2e mi-temps plus de buts » et les deux retournements (= 2/1 et
 * 1/2) n'y sont pas.
 */
export const QUOI_SANS_EFFETS = 'Étape 28 — déroulé rangé (avec les effets du score) contre le même tiré sans effets ni rouges (18 marchés de déroulé, bloc = le match), une fois à l’horizon : « pas moins bon » rapporté';
export const MARCHES_DU_CONTROLE_SANS_EFFETS = Object.freeze(['htD', 'htH', 'htA', 'htO05', 'htO15', 'htFt0', 'htFt1', 'htFt2', 'htFt3', 'htFt4', 'htFt5', 'htFt6', 'htFt7', 'htFt8', 'deuxMiTemps05', 'premierDom', 'premierExt', 'premierAvant30']);

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

// ------------------------------------------------------------ l'heure de la passe (jamais l'horloge)

/** L'instant de la passe en millisecondes : `maintenant` (nombre, texte ISO, Date, ou une fonction qui en rend un), OBLIGATOIRE. */
export function instantDe(maintenant, qui = 'la simulation') {
  const v = typeof maintenant === 'function' ? maintenant() : maintenant;
  const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN;
  if (!fini(t)) throw new Error(`${qui} : « maintenant » (l’heure de la passe) est obligatoire — jamais l’horloge lue ici.`);
  return t;
}
const iso = (t) => new Date(t).toISOString();
const FORMAT_JOUR_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });
const FORMAT_HEURE_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false });
/** Le jour civil de Paris d'un instant (AAAA-MM-JJ) : D, celui qui décide « date < D ». */
export const jourParis = (t) => FORMAT_JOUR_PARIS.format(new Date(t));
/** L'instant de 00 h 00 à Paris d'un jour (heure d'hiver ou d'été). */
export function minuitDeParis(jour) {
  const t0 = Date.parse(`${jour}T00:00:00Z`);
  for (const decalage of [1, 2, 0]) {
    const t = t0 - decalage * 3_600_000;
    if (jourParis(t) === jour && FORMAT_HEURE_PARIS.format(new Date(t)).replace(/\D/g, '') === '0000') return t;
  }
  return t0 - 3_600_000;
}
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);
/** La graine du contrôle d'une nuit : son jour de Paris, AAAAMMJJ. */
export const graineDuJour = (t) => Number(jourParis(t).replace(/-/g, ''));

/**
 * Le COUP D'ENVOI d'une rencontre de la page Matchs : connu quand la rencontre est cotée (commenceTime) ; sinon (le
 * calendrier seul écrit « date T12:00:00Z », une heure FICTIVE) inconnu, et la rencontre est traitée comme commençant
 * à 00 h de Paris de sa date. Rend { connu, instant, effectif, date }.
 */
export function coupDEnvoiDe(match) {
  const t = Date.parse(match?.commenceTime ?? '');
  const date = fini(t) ? new Date(t).toISOString().slice(0, 10) : null;
  if (match?.hasOdds && fini(t)) return { connu: true, instant: t, effectif: t, date };
  return { connu: false, instant: null, effectif: date ? minuitDeParis(date) : Number.NaN, date };
}

// ------------------------------------------------------------ les processus à part

/**
 * Un calcul dans un PROCESSUS À PART (patron de forcesButs.js:649-700) : fork de `fichier` (argument
 * « --enfant-simulation »), sérialisation « avancée », tas plafonné (`options`), sous le jeton du calcul lourd `nom` (un
 * autre en cours : rejet CalculLourdEnCours, « reporté »). `surMorceau(m)` reçoit chaque morceau ; la promesse rend la
 * fin ({ fin, ... }) ; elle est rejetée si l'enfant échoue, se tait au-delà de `delaiMs` (il est alors arrêté) ou
 * s'arrête sans répondre.
 */
export function calculerAPart({ fichier, nom, options, message, surMorceau = () => {}, delaiMs = DELAI_ENFANT_MS }) {
  let rendre;
  try {
    rendre = commencerCalculLourd(nom);
  } catch (error) {
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    let termine = false;
    let erreurs = '';
    const enfant = fork(fichier, ['--enfant-simulation'], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', execArgv: [...process.execArgv, ...options] });
    const minuterie = setTimeout(() => {
      if (termine) return;
      termine = true;
      try {
        enfant.kill();
      } catch {
        // déjà arrêté
      }
      reject(new Error(`calcul à part arrêté : aucune réponse en ${delaiMs < 60_000 ? `${delaiMs} ms` : `${Math.round(delaiMs / 60_000)} min`}`));
    }, delaiMs);
    minuterie.unref?.();
    enfant.stderr?.on('data', (d) => {
      erreurs = (erreurs + d).slice(-2000);
    });
    enfant.on('message', (m) => {
      if (termine) return;
      if (m?.morceau) {
        try {
          surMorceau(m.morceau);
        } catch (error) {
          termine = true;
          clearTimeout(minuterie);
          try {
            enfant.kill();
          } catch {
            // déjà arrêté
          }
          reject(error);
        }
        return;
      }
      clearTimeout(minuterie);
      termine = true;
      if (m?.erreur) reject(new Error(m.erreur));
      else resolve(m ?? {});
    });
    enfant.on('error', (error) => {
      clearTimeout(minuterie);
      if (!termine) reject(error);
      termine = true;
    });
    enfant.on('exit', (code) => {
      clearTimeout(minuterie);
      if (!termine) reject(new Error(`calcul à part arrêté sans réponse (code ${code}) ${erreurs.trim().slice(-300)}`));
      termine = true;
    });
    enfant.send(message);
  }).finally(rendre);
}

// ------------------------------------------------------------ le rangement par tranches (le serveur, seul écrivain)

/** Annule la transaction en cours, s'il y en a une. */
function annuler(database) {
  try {
    if (database.isTransaction !== false) database.exec('ROLLBACK');
  } catch {
    // aucune transaction ouverte
  }
}

/**
 * Une suite d'ordres (fonctions), coupée en transactions de `tranche` ; la main n'est rendue (yield) qu'ENTRE deux
 * transactions, jamais pendant. `mesure.plusLongueTrancheMs` : le plus long moment d'une transaction.
 */
function* parTranches(database, ordres, tranche, mesure) {
  let k = 0;
  let t0 = performance.now();
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const ordre of ordres) {
      ordre();
      if (++k % tranche === 0) {
        database.exec('COMMIT');
        mesure.plusLongueTrancheMs = Math.max(mesure.plusLongueTrancheMs ?? 0, performance.now() - t0);
        yield 'rangement';
        t0 = performance.now();
        database.exec('BEGIN IMMEDIATE');
      }
    }
    database.exec('COMMIT');
    mesure.plusLongueTrancheMs = Math.max(mesure.plusLongueTrancheMs ?? 0, performance.now() - t0);
  } catch (error) {
    annuler(database);
    throw error;
  }
}

/** Supprime par tranches les lignes que rend `selection` (une requête qui rend la clé primaire, LIMIT ?) : rend le nombre retiré. */
function* supprimerParTranches(database, { table, cles, ou, parametres = [], tranche, mesure }) {
  const sql = `DELETE FROM ${table} WHERE (${cles.join(', ')}) IN (SELECT ${cles.join(', ')} FROM ${table} WHERE ${ou} LIMIT ?)`;
  const ordre = database.prepare(sql);
  let total = 0;
  for (;;) {
    let n = 0;
    yield* parTranches(database, [() => (n = Number(ordre.run(...parametres, tranche).changes))], 1, mesure);
    total += n;
    if (n < tranche) break;
  }
  return total;
}

/** La nuit finie : la clé `nuit_*` écrite et `en_cours_*` retirée, dans une même transaction. */
function finirLaNuit(database, quoi, valeur) {
  database.exec('BEGIN IMMEDIATE');
  try {
    ecrireLaValeur(database, CLES.nuit(quoi), valeur);
    effacerLaValeur(database, CLES.enCours(quoi));
    database.exec('COMMIT');
  } catch (error) {
    annuler(database);
    throw error;
  }
}

// ======================================================= 1. les fins de saison

/**
 * La loi « forces » de la nuit : les forces de buts de la version EN SERVICE si elle porte le modèle de buts, sinon
 * celles de la candidate en essai ; aucune → loi « table » seule. Les forces doivent être servies (rangement fini,
 * l'empreinte calculée). Une empreinte nouvelle est d'abord comptée au registre de la mesure (une variante de plus).
 * Rend { empreinte, reglages, origine, raison }.
 */
export function forcesDeLaNuit({ database, reglagesEnService = undefined, candidate = undefined, registre = {}, instant }) {
  const enService = reglagesEnService === undefined ? getEngineConfig('football') : reglagesEnService;
  let r = null;
  let origine = null;
  try {
    r = reglagesDuModeleDeButs(enService);
    if (r) origine = 'service';
  } catch {
    r = null;
  }
  if (!r) {
    let c = null;
    try {
      c = candidateEnEssai(candidate === undefined ? {} : { candidate });
    } catch {
      c = null;
    }
    if (c) {
      try {
        r = reglagesDuModeleDeButs(configDeLaCandidate(enService, c, 'football'));
        if (r) origine = 'candidate';
      } catch {
        r = null;
      }
    }
  }
  const sans = (raison) => ({ empreinte: null, reglages: null, origine, raison });
  if (!r) return sans('aucune version du moteur ne porte le modèle de buts : loi « table » seule');
  const empreinte = empreinteDesForces(r);
  let etat;
  try {
    etat = etatForcesButs({ database, empreintes: [empreinte] });
  } catch (error) {
    return sans(`forces de buts illisibles (${String(error?.message ?? error).slice(0, 120)}) : loi « table » seule cette nuit`);
  }
  // La même garde que la nuit des matchs et moteurABlanc.js:244 : des forces À JOUR (rangement fini, empreinte servie,
  // ET la version du calcul des forces attendue) — une table d'une ancienne version ne sert jamais (constat 9).
  if (!etat.aJour) {
    if (etat.enCours) return sans('forces de buts en cours de rangement : loi « table » seule cette nuit');
    if (etat.absent || etat.manquantes?.length || !etat.empreintes.includes(empreinte)) return sans(`forces de buts pas encore calculées pour ces réglages (${empreinte}) : loi « table » seule cette nuit`);
    return sans(`forces de buts rangées par une autre version du calcul (version ${etat.version ?? 'inconnue'}, il faut la ${etat.versionAttendue}) : loi « table » seule cette nuit`);
  }
  if (empreinte !== EMPREINTE_DES_FORCES_DECLAREE) {
    try {
      declarerVariante('28', { id: `saisons-forces-${empreinte}`, quoi: `Fins de saison par les forces de buts de l’empreinte ${empreinte} (une autre que celle jugée au banc des saisons).`, ou: 'nuit' }, { ...registre, maintenant: instant });
    } catch (error) {
      return sans(`l’empreinte des forces ${empreinte} n’a pas pu être comptée au registre de la mesure (${String(error?.message ?? error).slice(0, 120)}) : loi « table » seule`);
    }
  }
  return { empreinte, reglages: JSON.parse(JSON.stringify(r)), origine, raison: null };
}

const COLONNES_ETAT = ['league', 'calcule_le', 'season', 'tables', 'complet', 'raison', 'restants', 'a_dater', 'table_relevee_le', 'forces_empreinte', 'forces_a_jour', 'version', 'graine', 'n', 'duree_ms'];
const COLONNES_SIMULEES = ['league', 'season', 'table_name', 'team_id', 'calcule_le', 'loi', 'famille', 'probabilite', 'unanime'];
const COLONNES_ENJEUX = ['league', 'date', 'home_id', 'away_id', 'loi', 'match_id', 'kickoff', 'calcule_le', 'enjeu_dom', 'enjeu_ext', 'categorie', 'detail', 'version'];
const insertion = (database, table, colonnes) => {
  const ordre = database.prepare(`INSERT OR REPLACE INTO ${table} (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})`);
  return (ligne) => ordre.run(...colonnes.map((c) => (ligne[c] === undefined ? null : ligne[c])));
};

/**
 * L'enjeu d'une rencontre est-il encore à (ré)écrire ? Oui tant que le coup d'envoi n'est pas passé : heure connue,
 * l'instant de la nuit avant elle ; heure inconnue, la date APRÈS le jour de la passe. Jamais ensuite : il est FIGÉ.
 */
export function enjeuARecrire(ligne, { instant, jourD }) {
  const ko = Date.parse(ligne?.kickoff ?? '');
  if (fini(ko)) return instant < ko;
  return typeof ligne?.date === 'string' && ligne.date > jourD;
}

/**
 * RANGE les fins de saison d'une nuit (générateur ; le serveur, sous le verrou de la passe). `parLigue` : ce que rend
 * l'enfant, un championnat par élément ({ etat, probas, enjeux }). Une nuit restée `en_cours` (interrompue) est d'abord
 * retirée ; puis `en_cours_saisons`, les lignes par tranches, enfin `nuit_saisons` (et `en_cours` retiré). Les enjeux
 * FIGÉS (coup d'envoi passé) ne sont jamais réécrits. Rend { etat, simulees, enjeux, enjeuxFiges, retirees, plusLongueTrancheMs }.
 */
export function* rangerLesSaisons({ database, parLigue, calculeLe, jourD, instant, bilan = null, tranche = TRANCHE }) {
  const mesure = { plusLongueTrancheMs: 0 };
  const stats = { etat: 0, simulees: 0, enjeux: 0, enjeuxFiges: 0, retirees: 0 };
  const interrompue = lireLesValeurs(database)[CLES.enCours('saisons')] ?? null;
  for (const nuit of [interrompue, calculeLe].filter((x, i, t) => x && t.indexOf(x) === i)) {
    for (const table of ['saisons_simulees', 'saisons_etat']) {
      stats.retirees += yield* supprimerParTranches(database, { table, cles: table === 'saisons_etat' ? ['league', 'calcule_le'] : ['league', 'season', 'table_name', 'team_id', 'calcule_le', 'loi', 'famille'], ou: 'calcule_le = ?', parametres: [nuit], tranche, mesure });
    }
  }
  ecrireLaValeur(database, CLES.enCours('saisons'), calculeLe);
  yield 'en cours';
  const insEtat = insertion(database, 'saisons_etat', COLONNES_ETAT);
  const insSim = insertion(database, 'saisons_simulees', COLONNES_SIMULEES);
  const insEnjeu = insertion(database, 'enjeux_rencontres', COLONNES_ENJEUX);
  function* ordres() {
    for (const un of parLigue) {
      yield () => {
        insEtat(un.etat);
        stats.etat++;
      };
      for (const p of un.probas) {
        yield () => {
          insSim(p);
          stats.simulees++;
        };
      }
      for (const e of un.enjeux) {
        if (!enjeuARecrire(e, { instant, jourD })) {
          stats.enjeuxFiges++;
          continue;
        }
        yield () => {
          insEnjeu(e);
          stats.enjeux++;
        };
      }
    }
  }
  yield* parTranches(database, ordres(), tranche, mesure);
  finirLaNuit(database, 'saisons', { calculeLe, jourD, bilan });
  return { ...stats, plusLongueTrancheMs: Math.round(mesure.plusLongueTrancheMs) };
}

/** Les nuits de saisons à garder au-delà de 14 jours : la première de chaque semaine (lundi → dimanche, jours de Paris). */
function semaineDe(jour) {
  const t = Date.parse(`${jour}T00:00:00Z`);
  const lundi = t - ((new Date(t).getUTCDay() + 6) % 7) * JOUR_MS;
  return new Date(lundi).toISOString().slice(0, 10);
}

/**
 * L'ÉLAGAGE des fins de saison (générateur) : `saisons_simulees` chaque nuit sur 14 jours, puis une nuit par semaine
 * (la première), jusqu'à 400 jours — au-delà du verdict de juin 2027 des saisons commencées en 2026 ; `saisons_etat`
 * et `enjeux_rencontres` 400 jours. Rend { simulees, etat, enjeux }.
 */
export function* elaguerLesSaisons({ database, instant, tranche = TRANCHE }) {
  const mesure = { plusLongueTrancheMs: 0 };
  const d14 = iso(instant - RETENTION.saisons.chaqueNuitJours * JOUR_MS);
  const d400 = iso(instant - RETENTION.saisons.jours * JOUR_MS);
  const r = { simulees: 0, etat: 0, enjeux: 0 };
  const nuits = database.prepare('SELECT DISTINCT calcule_le FROM saisons_simulees WHERE calcule_le < ? ORDER BY calcule_le').all(d14).map((x) => x.calcule_le);
  const gardees = new Set();
  const vues = new Set();
  for (const c of nuits) {
    const s = semaineDe(jourParis(Date.parse(c)));
    if (!vues.has(s)) {
      vues.add(s);
      gardees.add(c);
    }
  }
  yield 'élagage';
  const cles = ['league', 'season', 'table_name', 'team_id', 'calcule_le', 'loi', 'famille'];
  for (const c of nuits) {
    if (c < d400 || !gardees.has(c)) r.simulees += yield* supprimerParTranches(database, { table: 'saisons_simulees', cles, ou: 'calcule_le = ?', parametres: [c], tranche, mesure });
  }
  r.etat += yield* supprimerParTranches(database, { table: 'saisons_etat', cles: ['league', 'calcule_le'], ou: 'calcule_le < ?', parametres: [d400], tranche, mesure });
  r.enjeux += yield* supprimerParTranches(database, { table: 'enjeux_rencontres', cles: ['league', 'date', 'home_id', 'away_id', 'loi'], ou: 'date < ?', parametres: [d400.slice(0, 10)], tranche, mesure });
  return r;
}

/**
 * L'ÉTAPE « simulationSaisons » : les fins de saison de la nuit. `maintenant` : OBLIGATOIRE (l'heure de la passe) ;
 * `aPart` : le processus à part (false : dans ce processus, pour un essai) ; `fichierCalendrier` : le calendrier de
 * saison ; `ligues` : un sous-ensemble (essais). Jamais d'exception pour une panne du calcul. Rend { mode: 'complet' |
 * 'reporte' | 'echec', calculeLe, jourD, bilan, forces, ecrites, elague, dureeMs, blocMaxMs }.
 */
export async function simulerLesSaisonsDeLaNuit({
  maintenant,
  database = openDb(),
  chemin = resolveDbPath(),
  aPart = true,
  delaiMs = DELAI_ENFANT_MS,
  fichierCalendrier = CALENDAR_FILE_PATH,
  reglagesEnService = undefined,
  candidate = undefined,
  registre = {},
  rendreLaMain = rendreLaMainParDefaut,
  ligues = null,
  n = N
} = {}) {
  const instant = instantDe(maintenant, 'simulerLesSaisonsDeLaNuit');
  const debut = performance.now();
  const calculeLe = iso(instant);
  const jourD = jourParis(instant);
  const pauses = creerPauses({ rendreLaMain });
  const duree = () => Math.round(performance.now() - debut);
  const forces = forcesDeLaNuit({ database, reglagesEnService, candidate, registre, instant });
  await pauses.pause('réglages des forces');
  const parLigue = [];
  let bilan;
  try {
    if (aPart) {
      const fin = await pauses.attendre(
        calculerAPart({
          fichier: ENFANT_SAISONS,
          nom: 'fins de saison',
          options: OPTIONS_ENFANT_SAISONS,
          delaiMs,
          message: { chemin, jourD, calculeLe, fichierCalendrier, empreinte: forces.empreinte, reglagesButs: forces.reglages, n, ligues },
          surMorceau: (m) => parLigue.push(m)
        }),
        'fins de saison à part'
      );
      bilan = fin.bilan;
    } else {
      const calendrier = readJsonFile(fichierCalendrier, []);
      await pauses.pause('calendrier');
      bilan = await executerEnRendantLaMain(
        calculerLesSaisons({ database, jourD, calculeLe, calendrier: Array.isArray(calendrier) ? calendrier : [], empreinte: forces.empreinte, reglagesButs: forces.reglages, n, ligues: ligues ?? CHAMPIONNATS, surChampionnat: (m) => parLigue.push(m) }),
        pauses.siLongtemps
      );
    }
  } catch (error) {
    if (error instanceof CalculLourdEnCours || error?.reporte) return { mode: 'reporte', raison: error.message, calculeLe, jourD, forces, dureeMs: duree(), ...pauses.bilan() };
    return { mode: 'echec', erreur: String(error?.message ?? error), calculeLe, jourD, forces, dureeMs: duree(), ...pauses.bilan() };
  }
  const tRangement = performance.now();
  let ecrites;
  try {
    ecrites = await executerEnRendantLaMain(rangerLesSaisons({ database, parLigue, calculeLe, jourD, instant, bilan: { ...bilan, forces: { empreinte: forces.empreinte, origine: forces.origine, raison: forces.raison } } }), pauses.siLongtemps);
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error)}`, calculeLe, jourD, forces, bilan, dureeMs: duree(), ...pauses.bilan() };
  }
  let elague = null;
  try {
    elague = await executerEnRendantLaMain(elaguerLesSaisons({ database, instant }), pauses.siLongtemps);
  } catch (error) {
    elague = { erreur: String(error?.message ?? error).slice(0, 200) };
  }
  return { mode: 'complet', calculeLe, jourD, bilan, forces, ecrites, elague, rangementMs: Math.round(performance.now() - tRangement), dureeMs: duree(), ...pauses.bilan() };
}

// ======================================================= 2. les déroulés des matchs

const COLONNES_MATCHS = [
  'fixture_key', 'role', 'calcule_le', 'version', 'grille', 'engine_version', 'candidate_hash', 'match_id', 'league', 'date', 'kickoff', 'kickoff_connu',
  'home_id', 'away_id', 'home_name', 'away_name', 'lambda', 'mu', 'rho', 'fair', 'odds_source', 'odds_at', 'graine', 'n', 'table_jointe', 'marches', 'masse_non_couverte', 'apres_coup_d_envoi'
];

/**
 * RANGE les lignes de la nuit (générateur, sous le verrou de la passe) : une nuit restée `en_cours` retirée, puis
 * `en_cours_matchs`, les lignes par tranches, enfin `nuit_matchs` (et `en_cours` retiré). Rend { ecrites, retirees,
 * plusLongueTrancheMs }.
 */
export function* rangerLesMatchs({ database, lignes, calculeLe, bilan = null, tranche = TRANCHE }) {
  const mesure = { plusLongueTrancheMs: 0 };
  let retirees = 0;
  let ecrites = 0;
  const interrompue = lireLesValeurs(database)[CLES.enCours('matchs')] ?? null;
  for (const nuit of [interrompue, calculeLe].filter((x, i, t) => x && t.indexOf(x) === i)) {
    retirees += yield* supprimerParTranches(database, { table: 'simulation_matchs', cles: ['fixture_key', 'role', 'calcule_le'], ou: 'calcule_le = ?', parametres: [nuit], tranche, mesure });
  }
  ecrireLaValeur(database, CLES.enCours('matchs'), calculeLe);
  yield 'en cours';
  const ins = insertion(database, 'simulation_matchs', COLONNES_MATCHS);
  yield* parTranches(
    database,
    lignes.map((l) => () => {
      ins(l);
      ecrites++;
    }),
    tranche,
    mesure
  );
  finirLaNuit(database, 'matchs', { calculeLe, bilan });
  return { ecrites, retirees, plusLongueTrancheMs: Math.round(mesure.plusLongueTrancheMs) };
}

const QUAND = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: 'numeric', minute: '2-digit', hour12: false });
/** « 26/10 à 0 h 41 » (heure de Paris). */
const nuitDite = (c) => {
  if (!fini(Date.parse(c ?? ''))) return String(c);
  const p = Object.fromEntries(QUAND.formatToParts(new Date(c)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} à ${Number(p.hour)} h ${p.minute}`;
};

/**
 * LE CONTRÔLE DES LIGNES RANGÉES (générateur ; le serveur) sur les rencontres de `depuis` à aujourd'hui et après :
 *   - la graine refaite depuis les entrées rangées (clé, rôle, version, λ, μ, ρ) doit être celle de la ligne — sinon les
 *     entrées ont été modifiées après le tirage (« un λ d'après-match ») : écart nommé ;
 *   - une ligne calculée À ou APRÈS le coup d'envoi (heure inconnue : 00 h de Paris de sa date) est MARQUÉE
 *     (apres_coup_d_envoi = 1) : gardée, comptée, écartée du jugement ; écart nommé.
 * Rend { lignes, ecarts: [{ type, fixtureKey, role, calculeLe, texte }], marquees }.
 */
export function* controlerLesLignes({ database, depuis }) {
  const ecarts = [];
  const aMarquer = [];
  let lignes = 0;
  for (const r of database
    .prepare('SELECT fixture_key, role, calcule_le, version, lambda, mu, rho, graine, kickoff, kickoff_connu, date, apres_coup_d_envoi, home_name, away_name FROM simulation_matchs WHERE date >= ? ORDER BY date, fixture_key, role, calcule_le')
    .iterate(depuis)) {
    lignes++;
    const qui = `${r.home_name ?? '?'} – ${r.away_name ?? '?'} du ${r.date} (${r.role === 'candidate' ? 'modèle en essai' : 'moteur en service'}, nuit du ${nuitDite(r.calcule_le)})`;
    let attendue = null;
    try {
      attendue = graineDuMatch({ cle: r.fixture_key, role: r.role, lambda: r.lambda, mu: r.mu, rho: r.rho, version: r.version });
    } catch {
      attendue = null;
    }
    if (attendue !== r.graine) ecarts.push({ type: 'entrees', fixtureKey: r.fixture_key, role: r.role, calculeLe: r.calcule_le, texte: `${qui} : les buts attendus rangés (${String(r.lambda).replace('.', ',')} et ${String(r.mu).replace('.', ',')}) ne redonnent pas la graine du tirage — entrées modifiées après coup` });
    const ko = r.kickoff_connu ? Date.parse(r.kickoff ?? '') : minuitDeParis(r.date);
    if (fini(ko) && Date.parse(r.calcule_le) >= ko) {
      if (!r.apres_coup_d_envoi) aMarquer.push([r.fixture_key, r.role, r.calcule_le]);
      ecarts.push({ type: 'apresCoupDEnvoi', fixtureKey: r.fixture_key, role: r.role, calculeLe: r.calcule_le, texte: `${qui} : calculée après le coup d’envoi — gardée, comptée, écartée du jugement` });
    }
    if (lignes % 200 === 0) yield 'contrôle des lignes';
  }
  if (aMarquer.length) {
    const marquer = database.prepare('UPDATE simulation_matchs SET apres_coup_d_envoi = 1 WHERE fixture_key = ? AND role = ? AND calcule_le = ?');
    yield* parTranches(database, aMarquer.map((k) => () => marquer.run(...k)), TRANCHE, {});
  }
  return { lignes, ecarts, marquees: aMarquer.length };
}

/**
 * L'ÉLAGAGE des déroulés (générateur) : deux jours après la rencontre, seule la DERNIÈRE ligne d'avant le coup d'envoi
 * par (rencontre, rôle) reste, table jointe vidée ; au-delà de 400 jours, plus rien. Rend { retirees, videes }.
 */
export function* elaguerLesMatchs({ database, jourD, tranche = TRANCHE }) {
  const mesure = { plusLongueTrancheMs: 0 };
  const avant = plusJours(jourD, -RETENTION.matchs.joursApresLaRencontre);
  const loin = plusJours(jourD, -RETENTION.matchs.jours);
  const r = { retirees: 0, videes: 0 };
  r.retirees += yield* supprimerParTranches(database, {
    table: 'simulation_matchs',
    cles: ['fixture_key', 'role', 'calcule_le'],
    ou: 'date < ? AND (apres_coup_d_envoi = 1 OR calcule_le < (SELECT MAX(t.calcule_le) FROM simulation_matchs t WHERE t.fixture_key = simulation_matchs.fixture_key AND t.role = simulation_matchs.role AND t.apres_coup_d_envoi = 0))',
    parametres: [avant],
    tranche,
    mesure
  });
  const vider = database.prepare('UPDATE simulation_matchs SET table_jointe = NULL WHERE (fixture_key, role, calcule_le) IN (SELECT fixture_key, role, calcule_le FROM simulation_matchs WHERE date < ? AND table_jointe IS NOT NULL LIMIT ?)');
  for (;;) {
    let k = 0;
    yield* parTranches(database, [() => (k = Number(vider.run(avant, tranche).changes))], 1, mesure);
    r.videes += k;
    if (k < tranche) break;
  }
  r.retirees += yield* supprimerParTranches(database, { table: 'simulation_matchs', cles: ['fixture_key', 'role', 'calcule_le'], ou: 'date < ?', parametres: [loin], tranche, mesure });
  return r;
}

// ------------------------------------------------------------ ce qui est arrivé (le magasin, les minutes FotMob)

/**
 * Le CRÉNEAU d'une minute FotMob (la règle de mesures/simulation/s0, 20 897 mi-temps égales à football-data contre 1) :
 * minutes 1 à 45 → créneaux 0 à 44 ; 45+x → 45 (la 1re mi-temps) ; 46 à 90 → 46 à 90 ; 90+x → 91 ; au-delà de la 90e
 * (prolongation) : −1, ignoré (le règlement s'arrête à la 90e).
 */
export function creneauDe(minute, ajout = 0) {
  const m = Number(minute);
  const a = Number(ajout ?? 0);
  if (!Number.isFinite(m) || m < 1 || m > 90) return -1;
  if (m === 45 && a > 0) return 45;
  if (m === 90 && a > 0) return 91;
  return m <= 45 ? m - 1 : m;
}

/**
 * Ce que disent les ÉVÉNEMENTS FotMob d'une rencontre (score à la 90e `hg`, `ag` fourni par le règlement) : la mi-temps
 * (créneaux 0..45), les buts [[créneau, camp]], les rouges [[créneau, camp]] (rouge ou deuxième jaune). `complet` :
 * les buts des créneaux 0..91 redonnent le score à la 90e ; sinon la mi-temps et le premier but sont inconnus.
 */
export function issuesDuMagasin({ hg, ag, events }) {
  let liste = events;
  if (typeof liste === 'string') {
    try {
      liste = JSON.parse(liste);
    } catch {
      liste = null;
    }
  }
  if (!Array.isArray(liste) || !Number.isInteger(hg) || !Number.isInteger(ag)) return { hg, ag, hHt: null, aHt: null, buts: null, rouges: null, complet: false };
  const buts = [];
  let sansMinute = false;
  for (const e of liste) {
    if (e?.type !== 'goal') continue;
    if (e.minute === null || e.minute === undefined) {
      sansMinute = true;
      continue;
    }
    const k = creneauDe(e.minute, e.addedTime);
    if (k >= 0) buts.push([k, e.side === 'home' ? 0 : 1]);
  }
  const rouges = [];
  for (const e of liste) {
    if (e?.type !== 'card' || (e.card !== 'red' && e.card !== 'yellowred')) continue;
    const k = creneauDe(e.minute, e.addedTime);
    if (k >= 0) rouges.push([k, e.side === 'home' ? 0 : 1]);
  }
  const dom = buts.filter((b) => b[1] === 0).length;
  const complet = !sansMinute && dom === hg && buts.length - dom === ag;
  if (!complet) return { hg, ag, hHt: null, aHt: null, buts: null, rouges, complet: false };
  let hHt = 0;
  let aHt = 0;
  for (const [k, camp] of buts) if (k <= 45) camp === 0 ? hHt++ : aHt++;
  return { hg, ag, hHt, aHt, buts, rouges, complet: true };
}

/** Les 22 marchés de déroulé jugés (les clés des écarts mesurés de reglages.js), lus dans les marchés rangés. */
export const MARCHES_DE_LA_NUIT = Object.freeze(['htD', 'htH', 'htA', 'htO05', 'htO15', 'htFt0', 'htFt1', 'htFt2', 'htFt3', 'htFt4', 'htFt5', 'htFt6', 'htFt7', 'htFt8', 'deuxMiTemps05', 'h2plusQueH1', 'premierDom', 'premierExt', 'premierAvant30', 'retourDom', 'retourExt', 'rougeAuMoinsUn']);

/**
 * Ce qui est ARRIVÉ, marché par marché (1, 0, ou null si on ne le sait pas) — les mêmes définitions que le banc
 * (issuesDuMatch, dans le module du banc, que la nuit n'importe pas : un test vérifie l'égalité). `dernierCreneauAvant30` : la
 * convention figée (29).
 */
export function issuesDuDeroule({ hg, ag, hHt = null, aHt = null, buts = null, rouges = null }, { dernierCreneauAvant30 = CONVENTION_AVANT_30.dernierCreneau } = {}) {
  const y = Object.fromEntries(MARCHES_DE_LA_NUIT.map((k) => [k, null]));
  const entier = (x) => Number.isInteger(x) && x >= 0;
  if (!entier(hg) || !entier(ag)) return y;
  const b = (v) => (v ? 1 : 0);
  if (entier(hHt) && entier(aHt)) {
    const rH = hHt > aHt ? 0 : hHt === aHt ? 1 : 2;
    const rF = hg > ag ? 0 : hg === ag ? 1 : 2;
    Object.assign(y, {
      htD: b(rH === 1), htH: b(rH === 0), htA: b(rH === 2), htO05: b(hHt + aHt > 0), htO15: b(hHt + aHt > 1),
      deuxMiTemps05: b(hHt + aHt > 0 && hg + ag - hHt - aHt > 0), h2plusQueH1: b(hg + ag - hHt - aHt > hHt + aHt),
      retourDom: b(rH === 2 && rF === 0), retourExt: b(rH === 0 && rF === 2)
    });
    for (let c = 0; c < 9; c++) y[`htFt${c}`] = b(rH * 3 + rF === c);
  }
  if (Array.isArray(buts)) {
    const gs = buts.slice().sort((x, z) => x[0] - z[0]);
    y.premierDom = b(gs.length > 0 && gs[0][1] === 0);
    y.premierExt = b(gs.length > 0 && gs[0][1] === 1);
    y.premierAvant30 = b(gs.length > 0 && gs[0][0] <= dernierCreneauAvant30);
  }
  if (Array.isArray(rouges)) y.rougeAuMoinsUn = b(rouges.length > 0);
  else if (entier(rouges)) y.rougeAuMoinsUn = b(rouges > 0);
  return y;
}

const lireMarche = (m, k) => (k.startsWith('htFt') ? m?.htFt?.[Number(k.slice(4))] : m?.[k]);

// ------------------------------------------------------------ le juge de la nuit

const J = (marketId, params) => Object.freeze({ marketId, params: Object.freeze(params) });
const UN = J('result', { outcome: 'home' });
const NUL = J('result', { outcome: 'draw' });
const DEUX = J('result', { outcome: 'away' });
const BTTS = J('bothTeamsScore', { outcome: 'yes' });
const plus = (line) => J('totalGoals', { line, side: 'over' });
const moins = (line) => J('totalGoals', { line, side: 'under' });

/**
 * Les 14 combinés jugés chaque nuit (F6) : ceux du banc v2 (COMBINES_DU_BANC, dans le module du banc, que la nuit n'importe pas :
 * un test vérifie qu'ils sont égaux), écrits comme des sélections du ticket.
 */
export const COMBINES_DE_LA_NUIT = Object.freeze([
  { nom: '1 & plus de 2,5', jambes: [UN, plus(2.5)] },
  { nom: '1 & moins de 2,5', jambes: [UN, moins(2.5)] },
  { nom: 'N & moins de 2,5', jambes: [NUL, moins(2.5)] },
  { nom: '2 & plus de 2,5', jambes: [DEUX, plus(2.5)] },
  { nom: '1 & les deux marquent', jambes: [UN, BTTS] },
  { nom: '2 & les deux marquent', jambes: [DEUX, BTTS] },
  { nom: 'N & les deux marquent', jambes: [NUL, BTTS] },
  { nom: 'plus de 2,5 & les deux marquent', jambes: [plus(2.5), BTTS] },
  { nom: '1 & dom. plus de 1,5', jambes: [UN, J('teamGoals', { team: 'home', line: 1.5, side: 'over' })] },
  { nom: '1 sans encaisser', jambes: [UN, J('teamGoals', { team: 'away', line: 0.5, side: 'under' })] },
  { nom: '1 & plus de 1,5', jambes: [UN, plus(1.5)] },
  { nom: '1 & plus de 2,5 & les deux marquent', jambes: [UN, plus(2.5), BTTS] },
  { nom: 'moins de 3,5 & les deux marquent', jambes: [moins(3.5), BTTS] },
  { nom: 'double chance 1N & moins de 3,5', jambes: [J('doubleChance', { outcome: 'homeDraw' }), moins(3.5)] }
].map((c) => Object.freeze({ ...c, jambes: Object.freeze(c.jambes) })));

/** La perte log d'une issue (forme de v2) : −log de la probabilité de ce qui est arrivé, bornée à [1e-9, 1 − 1e-9]. */
const perte = (p, r) => -Math.log(Math.min(1 - 1e-9, Math.max(1e-9, r ? p : 1 - p)));

/**
 * Les lignes du juge d'UNE rencontre jouée (grille BRUTE, jamais alignée) : par combiné, la perte log du produit des
 * simples (`a`, ce qu'enregistrait l'appli avant l'étape 28) et celle de la grille (`b`) ; bloc = la rencontre. Rend
 * { lignes, combines: [{ nom, r, pG, pI }] }.
 */
export function lignesDUneRencontre({ fixtureKey, date, lambda, mu, rho, hg, ag }) {
  const g = grilleDesButs(lambda, mu, rho);
  const lignes = [];
  const combines = [];
  for (const { nom, jambes } of COMBINES_DE_LA_NUIT) {
    const r = jambes.every((x) => predicatDeLaJambe(x).f(hg, ag)) ? 1 : 0;
    const pG = probabiliteDuCombine({ jambes, grille: g }).probabilite;
    const pI = jambes.reduce((s, x) => s * probabiliteDuCombine({ jambes: [x], grille: g }).probabilite, 1);
    lignes.push({ bloc: fixtureKey, cle: `${fixtureKey}|${nom}`, date, a: perte(pI, r), b: perte(pG, r) });
    combines.push({ nom, r, pG, pI });
  }
  return { lignes, combines };
}

/**
 * LE JUGE DE LA NUIT (générateur) : les rencontres JOUÉES depuis le lancement de l'étape 28, la grille montrée
 * (« modele-buts-441 » : le rôle « service » s'il l'a, sinon la candidate), la dernière ligne d'AVANT le coup d'envoi
 * (une ligne marquée après le coup d'envoi est comptée et écartée) ; le score à la 90e et les événements du magasin.
 * Rend { lignes (du juge), parCombine, parMarche, matchs, ecartees, du, au }.
 */
export function* lignesDeLaNuit({ database, depuis, jourD }) {
  const ecartees = { apresCoupDEnvoi: 0, sansResultat: 0, rencontreAmbigue: 0, sansScore: 0, sansIdentifiant: 0 };
  const parFixture = new Map();
  let k = 0;
  for (const r of database
    .prepare("SELECT fixture_key, role, calcule_le, date, home_id, away_id, lambda, mu, rho, marches, apres_coup_d_envoi FROM simulation_matchs WHERE grille = ? AND date > ? AND date < ? ORDER BY fixture_key, role, calcule_le")
    .iterate(GRILLES.modeleDeButs, depuis, jourD)) {
    if (r.apres_coup_d_envoi) {
      ecartees.apresCoupDEnvoi++;
      continue;
    }
    const f = parFixture.get(r.fixture_key) ?? {};
    f[r.role] = r;
    parFixture.set(r.fixture_key, f);
    if (++k % 200 === 0) yield 'lignes rangées';
  }
  const choisies = [...parFixture.values()].map((f) => f.service ?? f.candidate).filter(Boolean);
  const dates = choisies.map((r) => r.date).sort();
  const lignes = [];
  const deroules = [];
  const parCombine = new Map(COMBINES_DE_LA_NUIT.map((c) => [c.nom, { nom: c.nom, n: 0, p: 0, r: 0 }]));
  const parMarche = new Map(MARCHES_DE_LA_NUIT.map((m) => [m, { marche: m, n: 0, p: 0, r: 0 }]));
  let matchs = 0;
  if (choisies.length) {
    const lire = yield* lecteurDesRencontres(database, { du: dates[0], au: dates.at(-1) });
    const evenements = database.prepare('SELECT events FROM matches WHERE match_key = ?');
    for (const r of choisies) {
      if (!r.home_id || !r.away_id) {
        ecartees.sansIdentifiant++;
        continue;
      }
      const lu = lire({ homeId: `fotmob-${r.home_id}`, awayId: `fotmob-${r.away_id}`, date: r.date });
      const buts = lu?.reglement?.buts ?? null;
      if (lu?.raison || !buts) {
        ecartees[lu?.raison && Object.hasOwn(ecartees, lu.raison) ? lu.raison : 'sansScore']++;
        continue;
      }
      matchs++;
      const u = lignesDUneRencontre({ fixtureKey: r.fixture_key, date: r.date, lambda: r.lambda, mu: r.mu, rho: r.rho, hg: buts.home, ag: buts.away });
      lignes.push(...u.lignes);
      for (const c of u.combines) {
        const s = parCombine.get(c.nom);
        s.n++;
        s.p += c.pG;
        s.r += c.r;
      }
      let marches = null;
      try {
        marches = r.marches ? JSON.parse(r.marches) : null;
      } catch {
        marches = null;
      }
      if (marches) {
        const m = issuesDuMagasin({ hg: buts.home, ag: buts.away, events: evenements.get(lu.matchKey)?.events ?? null });
        const y = issuesDuDeroule(m);
        deroules.push({ fixtureKey: r.fixture_key, role: r.role, date: r.date, lambda: r.lambda, mu: r.mu, rho: r.rho, marches, y });
        for (const cle of MARCHES_DE_LA_NUIT) {
          const p = lireMarche(marches, cle);
          if (y[cle] === null || !fini(p)) continue;
          const s = parMarche.get(cle);
          s.n++;
          s.p += p;
          s.r += y[cle];
        }
      }
      if (matchs % 50 === 0) yield 'rencontres jugées';
    }
  }
  const moyenne = (s) => ({ ...s, annonce: s.n ? (100 * s.p) / s.n : null, realise: s.n ? (100 * s.r) / s.n : null, ecart: s.n ? (100 * (s.p - s.r)) / s.n : null });
  return { lignes, deroules, parCombine: [...parCombine.values()].map(moyenne), parMarche: [...parMarche.values()].map(moyenne), matchs, ecartees, du: dates[0] ?? null, au: dates.at(-1) ?? null };
}

/**
 * La garde de sûreté (K = 1) : |annoncé − réalisé| ≤ 4 points par combiné et par marché de déroulé ; rend { ok,
 * eteints, seuilPt }. Un éteint l'est SEUL (marchesEcartes le retire des écrans, le reste reste montré). Les marchés et
 * combinés DÉJÀ écartés par la note (la porte 1 : « un but dans chaque mi-temps », « au moins un rouge ») ne sont pas
 * jugés ici : jamais montrés, ils sont seulement rapportés (vérification du 27/10, constat 7).
 */
export function gardeDeSurete({ parCombine, parMarche }, { ecartes = marchesEcartes() } = {}) {
  const marchesDejaEcartes = new Set(ecartes.deroule.map((m) => m.cle));
  const combinesDejaEcartes = new Set(ecartes.combines.map((c) => c.nom));
  const eteints = [
    ...parCombine.filter((s) => !combinesDejaEcartes.has(s.nom) && s.n && Math.abs(s.ecart) > GARDE_SURETE_PT).map((s) => s.nom),
    ...parMarche.filter((s) => !marchesDejaEcartes.has(s.marche) && s.n && Math.abs(s.ecart) > GARDE_SURETE_PT).map((s) => s.marche)
  ];
  return { ok: eteints.length === 0, eteints, seuilPt: GARDE_SURETE_PT };
}

/**
 * LE CONTRÔLE « SANS EFFETS » (F6, rapporté) : les déroulés jugés (`deroules` de lignesDeLaNuit) rejoués SANS effets du
 * score ni rouges, avec la graine de leur ligne rangée — dans l'enfant (`aPart`, jeton du calcul lourd « contrôle sans
 * effets ») ou ici pour un essai ; par marché du bloc de v1 dont l'issue est connue : la perte log sans effets (`a`) et
 * celle du déroulé rangé (`b`), bloc = la rencontre ; jugerEtape SANS enregistrer (rien au registre : un contrôle
 * rapporté, pas un jugement de plus). Ne lève pas : rend { calcule, ... } ; un calcul lourd en cours → calcule: false,
 * reporte: true (refait la nuit suivante).
 */
export async function controleSansEffets({ deroules = [], instant, aPart = true, delaiMs = DELAI_ENFANT_MS, pauses = creerPauses(), registre = {}, n = N }) {
  const debut = performance.now();
  const commun = { le: iso(instant), parametres: 'sans effets du score ni rouges (variante sim-stratifiee-sans-effets)', marchesDuBloc: MARCHES_DU_CONTROLE_SANS_EFFETS.length };
  const items = deroules.map((d) => ({ cle: d.fixtureKey, role: d.role, lambda: d.lambda, mu: d.mu, rho: d.rho, n, seed: graineDuMatch({ cle: d.fixtureKey, role: d.role, lambda: d.lambda, mu: d.mu, rho: d.rho }) }));
  const sans = new Map();
  const recevoir = (morceau) => {
    for (const x of morceau) sans.set(`${x.cle}|${x.role}`, JSON.parse(x.marches));
  };
  let calcul = null;
  if (items.length) {
    try {
      calcul = aPart
        ? await pauses.attendre(calculerAPart({ fichier: ENFANT_MATCHS, nom: 'contrôle sans effets', options: OPTIONS_ENFANT_MATCHS, delaiMs, message: { items, sansEffets: true }, surMorceau: recevoir }), 'contrôle sans effets à part')
        : calculerSansEffets({ items, surMorceau: recevoir });
    } catch (error) {
      const reporte = error instanceof CalculLourdEnCours || Boolean(error?.reporte);
      return { ...commun, calcule: false, reporte, raison: `${reporte ? 'reporté' : 'échec'} : ${String(error?.message ?? error).slice(0, 200)}`, dureeMs: Math.round(performance.now() - debut) };
    }
  }
  await pauses.pause('contrôle sans effets');
  const lignes = [];
  const vus = new Set();
  for (const d of deroules) {
    const s = sans.get(`${d.fixtureKey}|${d.role}`);
    if (!s) continue;
    for (const k of MARCHES_DU_CONTROLE_SANS_EFFETS) {
      const y = d.y?.[k];
      const avec = lireMarche(d.marches, k);
      const sansEffets = lireMarche(s, k);
      if ((y !== 0 && y !== 1) || !fini(avec) || !fini(sansEffets)) continue;
      lignes.push({ bloc: d.fixtureKey, cle: `${d.fixtureKey}|${k}`, date: d.date, a: perte(sansEffets, y), b: perte(avec, y) });
      vus.add(k);
    }
  }
  let j = null;
  try {
    j = lignes.length ? jugerEtape({ etape: '28', lignes, mesure: 'perte-log', maintenant: instant, quoi: QUOI_SANS_EFFETS, principal: false, enregistrer: false, registre }) : null;
  } catch (error) {
    return { ...commun, calcule: false, reporte: false, raison: `juge impossible : ${String(error?.message ?? error).slice(0, 200)}`, dureeMs: Math.round(performance.now() - debut) };
  }
  return {
    ...commun,
    calcule: true,
    rejouees: sans.size,
    matchs: new Set(lignes.map((l) => l.bloc)).size,
    lignes: lignes.length,
    marches: vus.size,
    verdict: j?.verdict ?? null,
    pasMoinsBon: j && j.verdict !== 'pas-assez-de-matchs' ? j.verdict !== 'moins-bon' : null,
    gain: j?.gain ?? null,
    fourchette: j?.fourchette ?? null,
    pertes: j ? { sansEffets: j.a?.moyenne ?? null, avecEffets: j.b?.moyenne ?? null } : null,
    sommes: { sansEffets: lignes.reduce((s, l) => s + l.a, 0), avecEffets: lignes.reduce((s, l) => s + l.b, 0) },
    raison: j ? j.raison : 'aucun marché de déroulé jugeable (minutes des buts absentes du magasin)',
    aPart: calcul?.bilan?.aPart ?? null,
    dureeMs: Math.round(performance.now() - debut)
  };
}

/**
 * LE JUGE DE LA NUIT (F6) : chaque nuit, les PREMIERS CHIFFRES (jugerEtape sans enregistrer, provisoires, rangés dans
 * simulation_state.jugement) ; à l'HORIZON (800 matchs ET 21 jours après le lancement), le jugement PRINCIPAL, pris UNE
 * fois (jugerEtape principal, rangé au registre de la mesure ; s'il y est déjà, il est repris, jamais refait), avec sa
 * garde de sûreté et le contrôle « sans effets » rejoué dans l'enfant (simulation_state.principal) ; ce contrôle,
 * s'il n'a pas pu se faire (calcul lourd en cours, panne), est retenté les nuits suivantes jusqu'à ce qu'il soit fait
 * — jamais refait ensuite. `aPart`, `delaiMs`, `nSimulations` : ceux du contrôle. Ne lève pas : rend { calcule, ... }.
 * Une fois le principal pris (vérification du 27/10, constat 16) : la nuit ne relit plus que les rencontres des
 * JOURS_DU_RAPPORT derniers jours (le rapport de Réglages : « chiffres des 60 derniers jours »), sans juge provisoire ;
 * le contrôle « sans effets » retenté relit les seules rencontres de l'horizon (du lancement au jour du principal).
 */
export const JOURS_DU_RAPPORT = 60;
export async function jugerLaNuit({ database, instant, registre = {}, pauses = creerPauses(), horizon = HORIZON_DE_LA_PREUVE, aPart = true, delaiMs = DELAI_ENFANT_MS, nSimulations = N }) {
  const jourD = jourParis(instant);
  let lancement;
  try {
    lancement = lancementDe('28', { ...registre, maintenant: instant });
  } catch (error) {
    return { calcule: false, raison: `registre de la mesure illisible : ${String(error?.message ?? error).slice(0, 160)}` };
  }
  if (!lancement) return { calcule: false, raison: 'l’étape 28 n’est pas encore lancée au registre de la mesure (le premier démarrage du serveur avec ce code la date) : rien à juger' };
  const valeurs = lireLesValeurs(database);
  // Le principal déjà pris — pour CE lancement seulement (celui d'un lancement d'avant ne compte pas).
  let deja = null;
  try {
    const lu = valeurs[CLES.principal] ? JSON.parse(valeurs[CLES.principal]) : null;
    deja = lu?.lancement === lancement.le && (!lu.version || !lancement.version || lu.version === lancement.version) ? lu : null;
  } catch {
    deja = null;
  }
  // Après le principal, le rapport des 60 derniers jours seulement : le juge ne grossit plus avec l'historique (400 jours).
  const debutDuRapport = plusJours(jourD, -JOURS_DU_RAPPORT);
  const depuis = deja && debutDuRapport > lancement.le ? debutDuRapport : lancement.le;
  const n = await executerEnRendantLaMain(lignesDeLaNuit({ database, depuis, jourD }), pauses.siLongtemps);
  await pauses.pause('lignes du juge');
  const etat = horizonAtteint({ matchs: n.matchs, depuis: `${lancement.le}T00:00:00.000Z`, maintenant: instant, horizon });
  const garde = gardeDeSurete(n);
  const commun = { le: iso(instant), lancement: lancement.le, matchs: n.matchs, lignes: n.lignes.length, ecartees: n.ecartees, du: n.du, au: n.au, horizon, joursEcoules: etat.jours, auPlusTotLe: etat.auPlusTotLe, garde, parCombine: n.parCombine, parMarche: n.parMarche, rapportJours: deja ? JOURS_DU_RAPPORT : null };
  let provisoire = null;
  if (!deja) {
    try {
      provisoire = n.lignes.length ? jugerEtape({ etape: '28', lignes: n.lignes, mesure: 'perte-log', maintenant: instant, quoi: QUOI_DU_PRINCIPAL, principal: false, enregistrer: false, registre }) : null;
    } catch (error) {
      provisoire = { erreur: String(error?.message ?? error).slice(0, 200) };
    }
  }
  await pauses.pause('juge provisoire');
  const jugement = { ...commun, provisoire: provisoire ? { gain: provisoire.gain ?? null, fourchette: provisoire.fourchette ?? null, n: provisoire.n ?? null, erreur: provisoire.erreur ?? null } : null };
  ecrireLaValeur(database, CLES.jugement, jugement);
  const sansEffetsDe = (deroules) => controleSansEffets({ deroules, instant, aPart, delaiMs, pauses, registre, n: nSimulations });
  if (deja && deja.sansEffets?.calcule !== true) {
    // Le contrôle « sans effets » pas encore fait (reporté, panne) : retenté sur les rencontres de L'HORIZON (du
    // lancement au jour du principal), le principal reste celui de l'horizon.
    const jourDuPrincipal = /^\d{4}-\d{2}-\d{2}/.test(String(deja.le ?? '')) ? jourParis(Date.parse(deja.le)) : jourD;
    const h = await executerEnRendantLaMain(lignesDeLaNuit({ database, depuis: lancement.le, jourD: jourDuPrincipal }), pauses.siLongtemps);
    const sansEffets = await sansEffetsDe(h.deroules);
    ecrireLaValeur(database, CLES.principal, { ...deja, sansEffets });
    return { calcule: true, principal: false, ...jugement, dejaPrincipal: true, sansEffets };
  }
  if (deja || !etat.atteint) return { calcule: true, principal: false, ...jugement, dejaPrincipal: Boolean(deja) };
  // L'HORIZON : le jugement qui décide, une seule fois (repris du registre s'il y est déjà pour CE lancement).
  let principal;
  try {
    principal = jugementsDe('28', { ...registre, maintenant: instant }).find((j) => j.principal === true && j.quoi === QUOI_DU_PRINCIPAL && j.lancement === lancement.le) ?? jugerEtape({ etape: '28', lignes: n.lignes, mesure: 'perte-log', maintenant: instant, quoi: QUOI_DU_PRINCIPAL, principal: true, enregistrer: true, registre });
  } catch (error) {
    return { calcule: false, raison: `jugement principal impossible : ${String(error?.message ?? error).slice(0, 200)}`, ...jugement };
  }
  const resume = { le: principal.le, verdict: principal.verdict, gain: principal.gain ?? null, fourchette: principal.fourchette ?? null, matchs: principal.n?.matchs ?? n.matchs, garde, lancement: lancement.le, version: lancement.version ?? null };
  // Le principal est rangé AVANT le contrôle (une panne de l'enfant ne le fait jamais refaire) ; puis le contrôle.
  ecrireLaValeur(database, CLES.principal, { ...resume, sansEffets: { calcule: false, reporte: true, raison: 'en cours' } });
  const sansEffets = await sansEffetsDe(n.deroules);
  ecrireLaValeur(database, CLES.principal, { ...resume, sansEffets });
  return { calcule: true, principal: true, ...jugement, verdict: principal.verdict, sansEffets };
}

/**
 * L'ÉTAPE « simulationMatchs » : le déroulé simulé des rencontres des 48 prochaines heures. `maintenant` OBLIGATOIRE ;
 * `matchs` : une liste (essais ; sinon la page Matchs, matchsAVenir) ; `fenetreH` : la fenêtre (48 h) ; `aPart` : le
 * processus à part pour les chemins ; `candidate` : celle d'un essai ; `juger` : le juge de la nuit ; `registre` :
 * options du registre de la mesure (essais). Jamais d'exception pour une panne du calcul. Rend { mode: 'complet' |
 * 'reporte' | 'echec', calculeLe, jourD, bilan, controle, jugement, ecrites, elague, dureeMs, blocMaxMs, ... }.
 */
export async function simulerLesMatchsDeLaNuit({
  maintenant,
  database = openDb(),
  matchs = null,
  fenetreH = FENETRE_H,
  aPart = true,
  delaiMs = DELAI_ENFANT_MS,
  candidate = undefined,
  reglagesEnService = undefined,
  registre = {},
  rendreLaMain = rendreLaMainParDefaut,
  juger = true,
  n = N
} = {}) {
  const instant = instantDe(maintenant, 'simulerLesMatchsDeLaNuit');
  const debut = performance.now();
  const calculeLe = iso(instant);
  const jourD = jourParis(instant);
  const pauses = creerPauses({ rendreLaMain });
  const duree = () => Math.round(performance.now() - debut);
  const bilan = { matchs: 0, dansLaFenetre: 0, analyses: 0, lignes: 0, tirees: 0, entreesSeules: 0, sansIdentifiant: 0, echecs: 0, echantillons: [], candidate: null, candidateEnAttente: null, analysesMs: 0 };
  const echec = (texte) => {
    bilan.echecs++;
    if (bilan.echantillons.length < 5) bilan.echantillons.push(String(texte).slice(0, 200));
  };
  const enService = reglagesEnService === undefined ? getEngineConfig('football') : reglagesEnService;
  let enEssai = null;
  try {
    enEssai = candidateEnEssai(candidate === undefined ? {} : { candidate });
  } catch (error) {
    bilan.candidateEnAttente = `candidate refusée : ${String(error?.message ?? error).slice(0, 160)}`;
  }
  let configCandidate = null;
  if (enEssai) {
    const cfg = configDeLaCandidate(enService, enEssai, 'football');
    let r = null;
    try {
      r = reglagesDuModeleDeButs(cfg);
    } catch {
      r = null;
    }
    // La garde de moteurABlanc.js:244 : une candidate au modèle de buts n'est calculée qu'avec SES forces à jour.
    if (r && etatForcesButs({ database, empreintes: [empreinteDesForces(r)] }).aJour) configCandidate = cfg;
    else bilan.candidateEnAttente = r ? 'forces de buts de la candidate pas à jour : rôle « candidate » sauté cette nuit' : 'la candidate ne porte pas le modèle de buts : rôle « candidate » sauté';
  }
  bilan.candidate = configCandidate ? { id: enEssai.id, empreinte: enEssai.empreinte } : null;
  await pauses.pause('réglages');
  // Un autre calcul lourd tient déjà le jeton (le banc du mois, un rejeu) : la nuit est REPORTÉE avant toute analyse —
  // sinon elle ferait dans le serveur l'enrichissement et deux analyses par rencontre pour rien (≈ 35 à 70 s chez
  // Pierre), refaites à la passe suivante (vérification du 27/10, constat 15). Le jeton reste pris par calculerAPart.
  const autre = aPart ? calculLourdEnCours() : null;
  if (autre) return { mode: 'reporte', raison: phraseDuReport(autre, instant), calculeLe, jourD, bilan, dureeMs: duree(), ...pauses.bilan() };
  const liste = matchs ?? matchsAVenir(instant);
  bilan.matchs = liste.length;
  const fenetre = [];
  for (const m of liste) {
    const ko = coupDEnvoiDe(m);
    if (fini(ko.effectif) && ko.effectif > instant && ko.effectif <= instant + fenetreH * 3_600_000) fenetre.push({ m, ko });
  }
  bilan.dansLaFenetre = fenetre.length;
  await pauses.pause('liste des matchs');
  const club = resolveur(database);
  let heureInstantanePayant = null;
  try {
    heureInstantanePayant = getFixturesStatus().oddsLastSyncedAt ?? null;
  } catch {
    heureInstantanePayant = null;
  }
  const sport = getSport('football');
  const lignes = [];
  const items = [];
  const tAnalyses = performance.now();
  for (const { m, ko } of fenetre) {
    try {
      const enrichi = await enrichMatchWithRealAverages(m, { sansRepliPayant: true });
      await pauses.pause('enrichissement d’un match');
      const tilt = getTiltState();
      const a = await analyzeMatch(enrichi, enService, tilt, sport, { maintenant: instant });
      await pauses.pause('analyse en service d’un match');
      const b = configCandidate ? await analyzeMatch(enrichi, configCandidate, tilt, sport, { maintenant: instant }) : null;
      if (b) await pauses.pause('analyse de la candidate d’un match');
      bilan.analyses += b ? 2 : 1;
      const homeId = club(m.home, m.league);
      const awayId = club(m.away, m.league);
      if (!idFotMob(homeId) || !idFotMob(awayId)) {
        bilan.sansIdentifiant++;
        continue;
      }
      const fixtureKey = cleDuMatch({ homeId, awayId, league: m.league, home: m.home, away: m.away, date: ko.date });
      const cotes = sourceDesCotes(m, { heureInstantanePayant });
      for (const [role, resultat, config] of [['service', a, enService], ...(b ? [['candidate', b, configCandidate]] : [])]) {
        let e;
        try {
          e = entreesDeLAnalyse(resultat, config);
        } catch (error) {
          echec(`${m.home} - ${m.away} (${role}) : ${error.message}`);
          continue;
        }
        const graine = graineDuMatch({ cle: fixtureKey, role, lambda: e.lambda, mu: e.mu, rho: e.rho });
        const tiree = e.grille === GRILLES.modeleDeButs;
        lignes.push({
          fixture_key: fixtureKey, role, calcule_le: calculeLe, version: VERSION_SIMULATION, grille: e.grille, engine_version: e.engineVersion,
          candidate_hash: role === 'candidate' ? enEssai.empreinte : null, match_id: m.matchId ?? null, league: m.league ?? null, date: ko.date,
          kickoff: ko.connu ? iso(ko.instant) : null, kickoff_connu: ko.connu ? 1 : 0, home_id: idFotMob(homeId), away_id: idFotMob(awayId),
          home_name: m.home ?? null, away_name: m.away ?? null, lambda: e.lambda, mu: e.mu, rho: e.rho, fair: e.fair ? JSON.stringify(e.fair) : null,
          odds_source: cotes.oddsSource ?? null, odds_at: cotes.oddsAt ?? null, graine, n: tiree ? n : null, table_jointe: null, marches: null,
          masse_non_couverte: null, apres_coup_d_envoi: instant >= ko.effectif ? 1 : 0
        });
        if (tiree) items.push({ cle: fixtureKey, role, lambda: e.lambda, mu: e.mu, rho: e.rho, seed: graine, n });
      }
    } catch (error) {
      echec(`${m.home} - ${m.away} : ${String(error?.message ?? error)}`);
    }
    await pauses.pause('fin d’un match');
  }
  bilan.analysesMs = Math.round(performance.now() - tAnalyses);
  bilan.lignes = lignes.length;
  bilan.tirees = items.length;
  bilan.entreesSeules = lignes.length - items.length;
  // Les chemins, à part (ou ici pour un essai) ; 40 rencontres refaites avec la graine du jour.
  const deroules = new Map();
  let calcul = null;
  const tAPart = performance.now();
  if (items.length) {
    const recevoir = (morceau) => {
      for (const d of morceau) deroules.set(`${d.cle}|${d.role}`, d);
    };
    try {
      calcul = aPart
        ? await pauses.attendre(calculerAPart({ fichier: ENFANT_MATCHS, nom: 'simulation des matchs', options: OPTIONS_ENFANT_MATCHS, delaiMs, message: { items, graineDuJour: graineDuJour(instant) }, surMorceau: recevoir }), 'déroulés à part')
        : calculerLesDeroules({ items, graineDuJour: graineDuJour(instant), surMorceau: recevoir });
    } catch (error) {
      if (error instanceof CalculLourdEnCours || error?.reporte) return { mode: 'reporte', raison: error.message, calculeLe, jourD, bilan, dureeMs: duree(), ...pauses.bilan() };
      return { mode: 'echec', erreur: String(error?.message ?? error), calculeLe, jourD, bilan, dureeMs: duree(), ...pauses.bilan() };
    }
    if (calcul.controle?.ecarts?.length) {
      return { mode: 'echec', erreur: `contrôle de la nuit en échec : ${calcul.controle.ecarts.length} rencontre(s) refaite(s) avec la graine du jour ne redonnent pas la même table — rien n’est rangé`, controleDesTables: calcul.controle, calculeLe, jourD, bilan, dureeMs: duree(), ...pauses.bilan() };
    }
    for (const l of lignes) {
      const d = deroules.get(`${l.fixture_key}|${l.role}`);
      if (!d) continue;
      l.table_jointe = d.table;
      l.marches = d.marches;
      l.masse_non_couverte = d.masseNonCouverte;
    }
    const manquants = lignes.filter((l) => l.grille === GRILLES.modeleDeButs && !l.table_jointe).length;
    if (manquants) return { mode: 'echec', erreur: `${manquants} déroulé(s) attendu(s) non rendu(s) par le calcul à part — rien n’est rangé`, calculeLe, jourD, bilan, dureeMs: duree(), ...pauses.bilan() };
  }
  const aPartMs = Math.round(performance.now() - tAPart);
  const tRangement = performance.now();
  let ecrites;
  try {
    // La durée et la mémoire du calcul à part, rangées avec la nuit (Réglages › Versions du moteur les montre).
    ecrites = await executerEnRendantLaMain(rangerLesMatchs({ database, lignes, calculeLe, bilan: { ...bilan, controleDesTables: calcul?.controle ?? null, aPartMs, aPart: calcul?.bilan?.aPart ?? null } }), pauses.siLongtemps);
  } catch (error) {
    return { mode: 'echec', erreur: `rangement : ${String(error?.message ?? error)}`, calculeLe, jourD, bilan, dureeMs: duree(), ...pauses.bilan() };
  }
  const rangementMs = Math.round(performance.now() - tRangement);
  let controle;
  try {
    controle = await executerEnRendantLaMain(controlerLesLignes({ database, depuis: plusJours(jourD, -RETENTION.matchs.joursApresLaRencontre - 1) }), pauses.siLongtemps);
    ecrireLaValeur(database, CLES.controle, { le: calculeLe, tables: calcul?.controle ?? { lignes: 0, ecarts: [] }, lignes: controle.lignes, ecarts: controle.ecarts.slice(0, 50), total: controle.ecarts.length, marquees: controle.marquees });
  } catch (error) {
    controle = { erreur: String(error?.message ?? error).slice(0, 200), lignes: 0, ecarts: [], marquees: 0 };
  }
  let jugement = null;
  if (juger) {
    try {
      jugement = await jugerLaNuit({ database, instant, registre, pauses, aPart, delaiMs, nSimulations: n });
    } catch (error) {
      jugement = { calcule: false, raison: String(error?.message ?? error).slice(0, 200) };
    }
  }
  let elague = null;
  try {
    elague = await executerEnRendantLaMain(elaguerLesMatchs({ database, jourD }), pauses.siLongtemps);
  } catch (error) {
    elague = { erreur: String(error?.message ?? error).slice(0, 200) };
  }
  return {
    mode: 'complet',
    calculeLe,
    jourD,
    bilan,
    controleDesTables: calcul?.controle ?? { lignes: 0, ecarts: [] },
    calculAPart: calcul?.bilan ?? null,
    controle,
    jugement,
    ecrites,
    elague,
    aPartMs,
    rangementMs,
    dureeMs: duree(),
    ...pauses.bilan()
  };
}

/** Pour les essais : les pièces internes, telles quelles. */
export const __pourLesTests = { parTranches, supprimerParTranches, semaineDe, plusJours, nuitDite };
