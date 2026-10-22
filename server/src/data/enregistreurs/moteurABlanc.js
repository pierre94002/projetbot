/**
 * moteurABlanc.js — la VERSION CANDIDATE du moteur, calculée « à blanc »
 * chaque nuit (étape 25 du plan, le socle, 07/10/2026).
 * -----------------------------------------------------------------------
 * Une candidate (déclarée dans le code : CANDIDATE_EN_ESSAI de
 * core/engine/engineVersions.js — aucune à l'étape 25, la première viendra de
 * l'étape 27) est calculée chaque nuit À CÔTÉ de la version en service, sur
 * les mêmes matchs à venir que le gel des pronostics, avec les MÊMES entrées
 * (un seul enrichissement par match, sans repli payant ni Claude) :
 *   - seulement pour les marchés qu'elle déclare changer : pour chacun, le
 *     pronostic et la distribution complète de la candidate ET de la version
 *     en service, sur la même ligne (ce que le juge de l'étape 16 comparera
 *     quand l'adoption viendra, après la calibration) ; un marché qu'elle
 *     change sans l'avoir déclaré n'est pas gardé, il est COMPTÉ (à regarder) ;
 *   - ses chiffres vont dans la table engine_candidate_picks, écrite ici
 *     seulement (depot.ecrirePronosticsABlanc), par le serveur, dans la passe
 *     d'actualisation qui tient le verrou, par tranches, en rendant la main au
 *     serveur entre deux matchs et entre deux tranches ;
 *   - elle est d'abord COMPTÉE au registre de la mesure (declarerVariante,
 *     étape 16) : une candidate qui ne peut pas y être comptée n'est pas
 *     calculée.
 * CE QUE LA CANDIDATE NE FAIT JAMAIS (testé un par un, moteurABlanc.test.mjs) :
 * se montrer comme pronostic (aucun écran ne lit sa table, l'analyse d'un
 * match prend toujours les réglages en service), être pariée (le verdict de
 * verdictPari.js et les opportunités ne la connaissent pas), partir à l'IA
 * (l'analyse IA prend le résultat du moteur en service), entrer dans le
 * journal des pronostics ou des paris.
 *
 * Sans candidate : RIEN — ni base ouverte, ni calcul, ni fichier écrit.
 *
 * L'ESSAI JUGÉ (seconde moitié de l'étape 25, 14/10/2026) : après le calcul
 * de la nuit, jugerLEssai relit les lignes à blanc de la candidate (cette
 * table seulement, par le dépôt), règle les matchs JOUÉS au magasin comme la
 * calibration, et passe les deux pertes log au juge de l'étape 16 (guard.js,
 * jugerEtape) avec le lancement de l'ESSAI (bench/essaiCandidate.js). Avant
 * l'horizon : des premiers chiffres, sans verdict, rangés avec la candidate
 * (engineVersions.js, noterLEssai). À l'horizon : LE jugement qui décide, pris
 * une seule fois et rangé au registre de la mesure (principal) ; ensuite, plus
 * rien n'est calculé à blanc pour cette candidate, qui attend la décision de
 * Pierre (adopter, seulement sur « retenu »).
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { isRefreshRunning } from '../providers/refreshLock.js';
import { enrichMatchWithRealAverages } from '../providers/matchEnrichment.js';
import { getFixturesStatus } from '../repositories/fixturesRepository.js';
import { analyzeMatch } from '../../core/engine/oddsEngine.js';
import { getEngineConfig } from '../../core/engine/engineConfig.js';
import { getTiltState } from '../../core/engine/tiltState.js';
import { candidateEnEssai, configDeLaCandidate, mettreLaCandidateEnEssai, noterLEssai } from '../../core/engine/engineVersions.js';
import { getSport } from '../../sports/index.js';
import { ecrirePronosticsABlanc, memeDistribution, pronosticsABlanc } from './depot.js';
import { matchsAVenir, cleDuMatch, cleDuMarche, resolveur, sourceDesCotes, etatDeLaCompo, distributionGelee, versionDuResultat } from './gelPronostics.js';
import { jourUtc, iso } from './communs.js';
import { lecteurDesRencontres, cleNumerique } from '../calibration.js';
import { jugerEtape } from '../../bench/guard.js';
import { jugementsDe } from '../../bench/trialsRegistry.js';
import { LANCEMENTS } from '../../bench/lancements.js';
import {
  lignesDeLEssai, premiersChiffres, resumeDuJugement, MESURE_DE_L_ESSAI, horizonDe, horizonAtteint, lancementDeLEssai, complementsDeLEssai, temoinDuScore, distributionDuScore
} from '../../bench/essaiCandidate.js';
import { referenceDuBanc } from '../../bench/runner.js';
import { grilleDesScores } from '../../core/engine/scorePrediction.js';
import { reglagesDuModeleDeButs, empreinteDesForces } from '../../core/engine/goalModel.js';
import { etatForcesButs } from '../db/forcesButs.js';
import { creerPauses, executerEnRendantLaMain } from '../../utils/travailCooperatif.js';

/** Matchs par transaction : quelques dizaines de millisecondes d'écriture au plus. */
export const TRANCHE_A_BLANC = 30;

/** Rendre la main au serveur (les requêtes de l'interface passent entre deux matchs). */
const rendreLaMain = () => new Promise((fin) => setImmediate(fin));

const nombre = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const probabiliteDe = (p) => (nombre(p?.predictedOdds) > 1 ? Number((1 / nombre(p.predictedOdds)).toFixed(4)) : null);
/** Des paramètres comparables d'une version à l'autre (clés triées), comme gelPronostics.js. */
const parametres = (params) => (params ? JSON.stringify(Object.fromEntries(Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))) : null);

/**
 * Les lignes à blanc d'UN match : pour chaque marché que la candidate déclare changer, ses deux pronostics
 * (candidate, en service) et leurs distributions sur la même ligne — celle du pronostic de la candidate,
 * sinon celle de la version en service ; le Résultat (1N2) a toujours sa ligne, même sans pronostic (sa
 * distribution existe toujours). Les autres marchés ne sont pas gardés : ceux que la candidate change
 * quand même sont comptés dans `horsDeclaration`.
 * Étape 27 : pour chaque TÉMOIN déclaré (`temoins: ['scoreExact']`), une ligne de plus — les 81 cases et
 * « autre score » de la candidate, la grille du score de la version en service (`temoins.scoreExact.service`,
 * refaite comme au banc) — jamais dans `horsDeclaration`, jamais dans le jugement principal.
 */
export function lignesDuMatch({ a, b, candidate, commun, temoins = null }) {
  const declares = new Set(candidate.marches);
  const parCleA = new Map((a?.marketPredictions ?? []).map((p) => [cleDuMarche(p), p]));
  const parCleB = new Map((b?.marketPredictions ?? []).map((p) => [cleDuMarche(p), p]));
  const cles = new Set([...parCleA.keys(), ...parCleB.keys()]);
  if (declares.has('result')) cles.add('result');
  const lignes = [];
  const horsDeclaration = {};
  for (const cle of [...cles].sort()) {
    const marketId = cle.split(':')[0];
    const pa = parCleA.get(cle) ?? null;
    const pb = parCleB.get(cle) ?? null;
    const ligne = { marketId, params: (pb ?? pa)?.params ?? {} };
    const da = distributionGelee(a, ligne);
    const db = distributionGelee(b, ligne);
    if (!declares.has(marketId)) {
      const change =
        (pa?.predictedOutcome ?? null) !== (pb?.predictedOutcome ?? null) ||
        parametres(pa?.params) !== parametres(pb?.params) ||
        nombre(pa?.predictedOdds) !== nombre(pb?.predictedOdds) ||
        !memeDistribution(da, db);
      if (change) horsDeclaration[marketId] = (horsDeclaration[marketId] ?? 0) + 1;
      continue;
    }
    lignes.push({
      ...commun,
      marketKey: cle,
      marketId,
      market: (pb ?? pa)?.market ?? null,
      params: parametres(pb?.params),
      choice: pb?.predictedOutcome ?? null,
      label: pb?.predictedLabel ?? null,
      probability: probabiliteDe(pb),
      predictedOdds: nombre(pb?.predictedOdds),
      distribution: db,
      serviceParams: parametres(pa?.params),
      serviceChoice: pa?.predictedOutcome ?? null,
      serviceProbability: probabiliteDe(pa),
      servicePredictedOdds: nombre(pa?.predictedOdds),
      serviceDistribution: da
    });
  }
  // Les témoins : le score exact, rapporté à côté (jamais jugé).
  const service = temoins?.scoreExact?.service ?? null;
  const scoreB = b?.distributions?.scoreExact ?? null;
  if ((candidate.temoins ?? []).includes('scoreExact') && scoreB && b?.scorePrediction?.mostLikely) {
    const ml = b.scorePrediction.mostLikely;
    const mlA = a?.scorePrediction?.mostLikely ?? null;
    lignes.push({
      ...commun,
      marketKey: 'scoreExact',
      marketId: 'scoreExact',
      market: 'Score exact',
      params: null,
      choice: `${ml.home}-${ml.away}`,
      label: `Score exact ${ml.home}-${ml.away}`,
      probability: nombre(ml.probability),
      predictedOdds: null,
      distribution: JSON.stringify(distributionDuScore(scoreB.cases, scoreB.horsGrille)),
      serviceParams: null,
      serviceChoice: mlA ? `${mlA.home}-${mlA.away}` : null,
      serviceProbability: mlA ? nombre(mlA.probability) : null,
      servicePredictedOdds: null,
      serviceDistribution: service ? JSON.stringify(distributionDuScore(service.cases.map((c) => c.p), 0)) : null
    });
  }
  return { lignes, horsDeclaration };
}

/**
 * Étape 27 : la grille du score de la VERSION EN SERVICE pour le témoin, refaite comme au banc (runner.js) : mêmes
 * entrées, la référence 1N2 du moteur (referenceDuBanc) quand le pronostic du résultat vient des cotes.
 */
export function grilleDuScoreEnService({ a, enrichi, config }) {
  if (!a?.scorePrediction) return null;
  const ref = referenceDuBanc(enrichi?.marketOdds ?? null, config);
  return grilleDesScores({ inputs: enrichi?.scoreInputs ?? null, fair: a.prediction?.source === 'cotes' && ref ? ref.probabilities : null });
}

/**
 * LA NUIT À BLANC : la candidate en essai sur chaque match à venir (sinon rien), puis l'écriture par
 * tranches. `dansLaPasse` : appelé par l'étape de l'actualisation, qui tient le verrou ; sinon, rien
 * n'est écrit pendant une passe ou un import. Options d'essai : `matchs` (sinon la page Matchs),
 * `candidate` (sinon celle du code), `versions` (le registre des versions d'essai : { fichier, racine }),
 * `mesure` (le registre de la mesure d'essai : { fichier }), `database`.
 */
export async function calculerABlanc({ maintenant = Date.now(), database = null, matchs = null, dansLaPasse = true, candidate = undefined, versions = {}, mesure = {} } = {}) {
  const debut = Date.now();
  const bilan = { candidate: null, matchs: 0, calcules: 0, echecs: 0, echantillons: [], lignes: 0, ecrites: 0, horsDeclaration: {}, reporte: false, erreur: null, dureeMs: 0, blocMaxMs: 0 };
  let enEssai;
  try {
    enEssai = candidateEnEssai({ ...versions, ...(candidate === undefined ? {} : { candidate }) });
  } catch (error) {
    bilan.erreur = `candidate refusée, rien calculé : ${error.message}`;
    return bilan;
  }
  if (!enEssai) return { ...bilan, dureeMs: Date.now() - debut };
  let misEnEssai;
  try {
    // Comptée d'abord parmi les variantes essayées de son étape (étape 16) : sinon, pas de calcul.
    misEnEssai = mettreLaCandidateEnEssai({ ...versions, candidate: enEssai, mesure, maintenant });
  } catch (error) {
    bilan.erreur = `candidate « ${enEssai.id} » non comptée au registre, rien calculé : ${error.message}`;
    return { ...bilan, dureeMs: Date.now() - debut };
  }
  bilan.candidate = { id: enEssai.id, etape: enEssai.etape, quoi: enEssai.quoi, marches: [...enEssai.marches], empreinte: enEssai.empreinte };
  const essaiEnCours = misEnEssai?.candidate ?? null;
  // Jugée à l'horizon : elle attend la décision de Pierre ; plus rien n'est calculé à blanc pour elle.
  if (essaiEnCours?.jugement) {
    bilan.essai = { jugee: true, verdict: essaiEnCours.jugement.verdict, le: essaiEnCours.jugement.le, matchs: essaiEnCours.jugement.matchs };
    return { ...bilan, dureeMs: Date.now() - debut };
  }

  const base = database ?? openDb();
  const sport = getSport('football');
  const enService = getEngineConfig('football');
  const configCandidate = configDeLaCandidate(enService, enEssai, 'football');
  // Étape 27 (vérification du branchement, constat 1) : une candidate au modèle de buts n'est calculée qu'avec SES
  // forces de buts à jour — sinon le modèle tournerait sur des forces neutres et les moyennes par défaut, ce qui n'est
  // pas ce que l'essai doit juger. Rien n'est calculé ni écrit ; la passe suivante refait le calcul (étape de nuit).
  const reglagesButs = reglagesDuModeleDeButs(configCandidate);
  if (reglagesButs) {
    const etatForces = etatForcesButs({ database: base, empreintes: [empreinteDesForces(reglagesButs)] });
    if (!etatForces.aJour) {
      const pourquoi = etatForces.enCours
        ? 'rangement en cours'
        : etatForces.absent
          ? 'jamais calculées'
          : etatForces.version !== etatForces.versionAttendue
            ? 'calculées par une version précédente'
            : 'pas encore calculées pour ses réglages';
      return { ...bilan, attente: `forces de buts pas à jour (${pourquoi})`, dureeMs: Date.now() - debut };
    }
  }
  const liste = matchs ?? matchsAVenir(maintenant);
  bilan.matchs = liste.length;
  const club = resolveur(base);
  let heureInstantanePayant = null;
  try {
    heureInstantanePayant = getFixturesStatus().oddsLastSyncedAt ?? null;
  } catch {
    heureInstantanePayant = null;
  }

  const aEcrire = [];
  let depuis = Date.now();
  for (const match of liste) {
    try {
      const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
      const tilt = getTiltState();
      // L'heure de la passe (étape 27) : la candidate lit le magasin elle-même, rien d'après ce moment.
      const a = await analyzeMatch(enrichi, enService, tilt, sport, { maintenant });
      const b = await analyzeMatch(enrichi, configCandidate, tilt, sport, { maintenant });
      const homeId = club(match.home, match.league);
      const awayId = club(match.away, match.league);
      const date = jourUtc(Date.parse(match.commenceTime));
      const cotes = sourceDesCotes(match, { heureInstantanePayant });
      const compo = etatDeLaCompo({ homeId, date, database: base });
      const commun = {
        candidateId: enEssai.id,
        candidateHash: enEssai.empreinte,
        serviceVersion: versionDuResultat(a),
        recordedAt: iso(maintenant),
        fixtureKey: cleDuMatch({ homeId, awayId, league: match.league, home: match.home, away: match.away, date }),
        matchId: match.matchId ?? null,
        league: match.league ?? null,
        date,
        kickoff: match.hasOdds ? match.commenceTime : null,
        homeName: match.home ?? null,
        awayName: match.away ?? null,
        homeId,
        awayId,
        oddsSource: cotes.oddsSource,
        oddsAt: cotes.oddsAt,
        lineupState: compo.lineupState
      };
      const temoins = (enEssai.temoins ?? []).includes('scoreExact') ? { scoreExact: { service: grilleDuScoreEnService({ a, enrichi, config: enService }) } } : null;
      const { lignes, horsDeclaration } = lignesDuMatch({ a, b, candidate: enEssai, commun, temoins });
      aEcrire.push(...lignes);
      for (const [m, n] of Object.entries(horsDeclaration)) bilan.horsDeclaration[m] = (bilan.horsDeclaration[m] ?? 0) + n;
      bilan.calcules++;
    } catch (error) {
      bilan.echecs++;
      if (bilan.echantillons.length < 5) bilan.echantillons.push(`${match.home} - ${match.away} : ${String(error?.message ?? error).slice(0, 160)}`);
    }
    bilan.blocMaxMs = Math.max(bilan.blocMaxMs, Date.now() - depuis);
    await rendreLaMain();
    depuis = Date.now();
  }
  bilan.lignes = aEcrire.length;

  // L'écriture, par tranches de TRANCHE_A_BLANC matchs (une transaction chacune), la main rendue entre deux.
  const parMatch = new Map();
  for (const l of aEcrire) {
    if (!parMatch.has(l.fixtureKey)) parMatch.set(l.fixtureKey, []);
    parMatch.get(l.fixtureKey).push(l);
  }
  const groupes = [...parMatch.values()];
  for (let i = 0; i < groupes.length; i += TRANCHE_A_BLANC) {
    if (!dansLaPasse && isRefreshRunning()) {
      bilan.reporte = true;
      break;
    }
    const tranche = groupes.slice(i, i + TRANCHE_A_BLANC).flat();
    const avant = Date.now();
    try {
      bilan.ecrites += ecrirePronosticsABlanc(tranche, { database: base });
    } catch (error) {
      bilan.erreur = `écriture en échec : ${String(error?.message ?? error).slice(0, 200)}`;
      break;
    }
    bilan.blocMaxMs = Math.max(bilan.blocMaxMs, Date.now() - avant);
    await rendreLaMain();
  }
  // L'essai jugé : sur les matchs joués depuis le début de l'essai (rien pendant la passe d'un autre).
  if (essaiEnCours && !bilan.reporte && (dansLaPasse || !isRefreshRunning())) {
    try {
      bilan.essai = await jugerLEssai({ candidate: essaiEnCours, database: base, maintenant, versions, mesure });
    } catch (error) {
      bilan.essai = { calcule: false, raison: 'erreur', erreur: String(error?.message ?? error).slice(0, 300) };
    }
  }
  bilan.dureeMs = Date.now() - debut;
  return bilan;
}

/**
 * L'ESSAI JUGÉ (la nuit, après le calcul à blanc) : les lignes à blanc de la candidate relues (cette table, par
 * le dépôt), réglées au magasin, notées par la perte log des deux distributions, puis passées au juge de
 * l'étape 16 avec le lancement de l'essai. Avant l'horizon : les premiers chiffres (sans verdict) rangés avec
 * la candidate. À l'horizon : LE jugement qui décide (principal), rangé une fois au registre de la mesure — s'il
 * y est déjà (une nuit interrompue juste après), il est repris, jamais refait. `candidate` : ce que rend
 * mettreLaCandidateEnEssai (avec son essai). Rend un bilan court pour l'étape de la passe.
 */
export async function jugerLEssai({ candidate, database, maintenant = Date.now(), versions = {}, mesure = {}, pauses = creerPauses() } = {}) {
  const essai = candidate?.essai ?? null;
  if (!candidate || !essai) return { calcule: false, raison: 'pas-d-essai' };
  if (candidate.jugement) return { calcule: false, raison: 'deja-jugee', verdict: candidate.jugement.verdict };
  const aujourdhui = jourUtc(maintenant);
  const revisions = pronosticsABlanc(candidate.id, { database });
  const dates = revisions.map((r) => r.date).filter(Boolean).sort();
  let lire = () => ({ raison: 'sansResultat' });
  const du = dates[0] ?? null;
  const au = [dates.at(-1) ?? aujourdhui, aujourdhui].sort()[0];
  if (du && du <= au) {
    const lecteur = await executerEnRendantLaMain(lecteurDesRencontres(database, { du, au }), pauses.siLongtemps);
    lire = (f) => (!cleNumerique(f.fixtureKey) || !f.homeId || !f.awayId ? { raison: 'sansIdentifiant' } : lecteur(f));
  }
  // Étape 27 : les TÉMOINS (le score exact) restent hors du jugement principal — rapportés à part.
  const temoinsRev = revisions.filter((r) => r.marketId === 'scoreExact');
  const reglement = lignesDeLEssai(revisions.filter((r) => r.marketId !== 'scoreExact'), { empreinte: candidate.empreinte, versionEnService: essai.versionEnService, lire, aujourdhui });
  await pauses.pause('lignes de l’essai');
  const horizon = horizonDe(candidate);
  const registre = { ...mesure, lancements: [...LANCEMENTS, lancementDeLEssai(candidate, essai)] };
  const quoi = `Essai à blanc n° ${essai.numero ?? 1} de la candidate « ${candidate.id} » face à la version en service n° ${essai.versionEnService}`;
  const juger = (principal) => jugerEtape({ etape: candidate.etape, lignes: reglement.lignes, mesure: MESURE_DE_L_ESSAI, maintenant, quoi, principal, enregistrer: principal, registre });
  const cible = { id: candidate.id, empreinte: candidate.empreinte, numero: essai.numero ?? 1 };
  const ecrire = (champs) => noterLEssai({ ...cible, ...champs }, { ...versions, maintenant });
  let provisoire;
  try {
    provisoire = juger(false);
  } catch (error) {
    return { calcule: false, raison: 'juge', erreur: String(error?.message ?? error).slice(0, 300) };
  }
  // Étape 27 (une candidate du modèle de buts) : par famille, calibration, porte de sûreté, régimes, témoins.
  const avecModeleDeButs = Boolean(candidate.modifications?.football?.modeleDeButs);
  const complementsDe = (j) => (avecModeleDeButs ? complementsDeLEssai(reglement, { variantes: j?.seuil?.variantes ?? 1 }) : null);
  const temoins = temoinsRev.length ? temoinDuScore(temoinsRev, { empreinte: candidate.empreinte, versionEnService: essai.versionEnService, lire, aujourdhui }) : null;
  const etat = horizonAtteint({ matchs: provisoire.n.matchs, depuis: essai.depuis, maintenant, horizon });
  if (!etat.atteint) {
    const r = ecrire({ premiersChiffres: premiersChiffres(provisoire, { essai, horizon, maintenant, reglement, complements: complementsDe(provisoire), temoins }) });
    return { calcule: true, principal: false, matchs: provisoire.n.matchs, horizon, joursEcoules: etat.jours, auPlusTotLe: etat.auPlusTotLe, ecrit: r.ecrit };
  }
  // L'HORIZON : le jugement qui décide, une seule fois (repris s'il est déjà rangé pour CET essai).
  let principal;
  try {
    principal = jugementsDe(candidate.etape, registre).find((j) => j.principal === true && j.version === candidate.id && j.quoi === quoi && j.lancement === registre.lancements.at(-1).le) ?? juger(true);
  } catch (error) {
    return { calcule: false, raison: 'juge', erreur: String(error?.message ?? error).slice(0, 300) };
  }
  const complements = complementsDe(principal);
  const r = ecrire({
    premiersChiffres: premiersChiffres(principal, { essai, horizon, maintenant, reglement, complements, temoins }),
    jugement: resumeDuJugement(principal, { essai, versionEnService: essai.versionEnService, empreinte: candidate.empreinte, reglement, complements, temoins })
  });
  return { calcule: true, principal: true, verdict: principal.verdict, matchs: principal.n?.matchs ?? 0, horizon, ecrit: r.ecrit };
}
