import { getEngineConfig, updateEngineConfig, resetEngineConfig, DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../../core/engine/engineConfig.js';
import { getTiltState, setCircuitBreaker, resetTiltState, gardeFousDuMoment } from '../../core/engine/tiltState.js';
import { lireReglageGardeFous, enregistrerReglageGardeFous } from '../../data/repositories/gardeFousRepository.js';
import { ErreurGardeFous, REGLAGE_GARDE_FOUS_DEFAUT } from '../../core/risk/gardeFous.js';
import {
  avecUneVersion,
  revenirALaVersionPrecedente,
  etatDesVersions,
  RegistreVersionsIllisible,
  RetourImpossible,
  adopterLaCandidate,
  AdoptionImpossible,
  candidatePourLeBanc,
  noterLeBancDeLaCandidate
} from '../../core/engine/engineVersions.js';
import { openDb } from '../../data/db/matchStatsDb.js';
import { isRefreshRunning, withRefreshLock } from '../../data/providers/refreshLock.js';
import { deriveDuMoteur } from '../../data/deriveMoteur.js';
import { jugerLaCandidateAuBanc, bancDeLaCandidateEnCours, dernierRefusDuBanc, commencerLeBanc, avancerLeBanc, refuserLeBanc, terminerLeBanc } from '../../bench/bancCandidate.js';
import { ApiError } from '../middlewares/errorHandler.js';
import { reglagesDuModeleDeButs, ReglagesDuModeleDeButsInvalides } from '../../core/engine/goalModel.js';

function resolveSportId(req) {
  return req.query.sport || 'football';
}

export function getConfig(req, res) {
  const sportId = resolveSportId(req);
  res.json({ config: getEngineConfig(sportId), defaults: DEFAULT_ENGINE_CONFIG_BY_SPORT[sportId] ?? DEFAULT_ENGINE_CONFIG_BY_SPORT.football });
}

/**
 * Étape 25 du plan : chaque enregistrement des réglages fait une VERSION DU MOTEUR (ou reprend le numéro
 * d'un état déjà vu) — `version` dit laquelle et ce qui a changé. Registre des versions illisible : 503, et
 * RIEN n'est écrit (un réglage sans version ferait des pronostics qu'on ne saurait rattacher).
 */
function enregistrerAvecUneVersion(ecrire, origine) {
  try {
    return avecUneVersion(ecrire, { origine });
  } catch (error) {
    if (error instanceof RegistreVersionsIllisible) throw new ApiError(503, error.message);
    throw error;
  }
}

/**
 * Étape 27 (vérification du branchement, constat 2) : une clé `modeleDeButs` fautive est REFUSÉE (400) avant toute
 * écriture — enregistrée, elle ferait échouer chaque analyse. `null` (ou l'absence) reste accepté : la sortie de
 * secours, le chemin d'avant. Le message dit la faute en mots simples (ceux de motsDuModeleDeButs.js).
 */
function verifierLeModeleDeButs(corps) {
  const r = corps?.modeleDeButs;
  if (r === undefined || r === null) return;
  try {
    reglagesDuModeleDeButs({ modeleDeButs: r });
  } catch (error) {
    if (!(error instanceof ReglagesDuModeleDeButsInvalides)) throw error;
    // « modeleDeButs : réglages fautifs — a ; b. » (MOTS_DES_REGLAGES) → « 2 réglages à revoir (a, b) ».
    const m = String(error.message);
    const tete = 'modeleDeButs : réglages fautifs — ';
    const liste = m.startsWith(tete) ? m.slice(tete.length).replace(/\.$/, '').split(' ; ') : null;
    const faute = liste ? `${liste.length} réglage${liste.length > 1 ? 's' : ''} à revoir (${liste.join(', ')})` : m.replace(/^modeleDeButs : /, '').replace(/\.$/, '');
    throw new ApiError(400, `Réglages du modèle de buts refusés, rien n’a changé : ${faute}.`);
  }
}

export function putConfig(req, res) {
  const sportId = resolveSportId(req);
  verifierLeModeleDeButs(req.body);
  const { resultat: config, version } = enregistrerAvecUneVersion(() => updateEngineConfig(sportId, req.body ?? {}), 'reglages');
  res.json({ config, version });
}

export function postResetConfig(req, res) {
  const sportId = resolveSportId(req);
  const { resultat: config, version } = enregistrerAvecUneVersion(() => resetEngineConfig(sportId), 'valeurs-par-defaut');
  res.json({ config, version });
}

// ------------------------------------------------ étape 25 : les versions du moteur

/** La dérive du moteur (data/deriveMoteur.js) : lue dans la base et l'alerte durable ; ne lève jamais (la carte reste debout). */
function deriveSansLever() {
  let database;
  try {
    database = openDb();
  } catch (error) {
    database = { prepare: () => { throw error; } };
  }
  return deriveDuMoteur({ database });
}

/**
 * Ce que lit la carte : l'état des versions (engineVersions.js), la DÉRIVE (étape 25, seconde moitié) et le banc
 * de la candidate en cours dans ce serveur (ou son dernier refus).
 */
const etatPourLaCarte = () => ({ ...etatDesVersions(), derive: deriveSansLever(), banc: { enCours: bancDeLaCandidateEnCours(), dernierRefus: dernierRefusDuBanc() } });

/** GET /api/config/versions — lecture seule : la version en service, les précédentes, la candidate et son essai, l'adoption et le retour possibles ou non, la dérive. */
export function getVersions(req, res) {
  res.json(etatPourLaCarte());
}

/**
 * POST /api/config/versions/adopter — { depuis: <la version en service vue à l'écran>, candidate: <l'identifiant de
 * la candidate vue> } : adopte la candidate, SEULEMENT sur le verdict « retenu » de son essai à blanc, jamais
 * pendant une passe (engineVersions.js, adopterLaCandidate). Refus (400 / 409 / 500 / 503) : { error, raison },
 * rien n'a changé.
 */
export function postAdopterVersion(req, res) {
  const sportId = resolveSportId(req);
  const depuis = req.body?.depuis;
  const candidate = req.body?.candidate;
  if (!Number.isInteger(depuis) || depuis < 1) throw new ApiError(400, '« depuis » est requis : le numéro de la version en service vue à l’écran (un entier). Rien n’a changé.');
  if (typeof candidate !== 'string' || !candidate.trim()) throw new ApiError(400, '« candidate » est requis : l’identifiant de la candidate vue à l’écran. Rien n’a changé.');
  try {
    const r = adopterLaCandidate({ depuis, candidate });
    res.json({ ...r, config: getEngineConfig(sportId), versions: etatPourLaCarte() });
  } catch (error) {
    if (!(error instanceof AdoptionImpossible)) throw error;
    res.status(error.statut).json({ error: error.message, raison: error.raison });
  }
}

/**
 * POST /api/config/versions/candidate/banc — le BANC AVANT L'ESSAI (bench/bancCandidate.js) : la candidate en essai
 * rejouée sur l'historique face à la version en service, DANS le serveur, sous le verrou de l'actualisation (nom
 * « banc-candidate »), en rendant la main ; 202 tout de suite. Son verdict est INDICATIF : il est rangé avec la
 * candidate, il ne décide jamais d'une adoption. 409 si une passe, un import ou un banc tient la base, ou sans
 * candidate.
 */
export function postBancCandidate(req, res) {
  if (isRefreshRunning()) throw new ApiError(409, 'Une actualisation, un import ou un banc tient la base : le banc de la candidate ne se lance pas pendant ce temps. Réessayez quand ce sera fini.');
  if (bancDeLaCandidateEnCours()) throw new ApiError(409, 'Le banc de la candidate tourne déjà.');
  let pour;
  try {
    pour = candidatePourLeBanc();
  } catch (error) {
    throw new ApiError(409, `La candidate déclarée ne tient pas debout : ${error.message}`);
  }
  if (!pour) throw new ApiError(409, 'Aucune candidate en essai : rien à passer au banc.');
  const { candidate } = pour;
  commencerLeBanc({ candidate: candidate.id });
  withRefreshLock(
    async () => {
      const r = await jugerLaCandidateAuBanc({ ...pour, database: openDb(), rendreLaMain: (fin) => setImmediate(fin), avancement: avancerLeBanc });
      // Un banc en échec (rejeu impossible) n'est pas un verdict : il est dit (dernier refus), jamais rangé avec la candidate.
      if (!r.erreur) noterLeBancDeLaCandidate(r, { id: candidate.id, empreinte: candidate.empreinte });
      return r;
    },
    { stamp: false, nom: 'banc-candidate' }
  )
    .then((r) => {
      if (r?.skipped) refuserLeBanc(r.skipped);
      else if (r?.erreur) refuserLeBanc(r.erreur);
    })
    .catch((error) => {
      refuserLeBanc(error.message);
      console.error(`[banc de la candidate] en échec : ${error.message}`);
    })
    .finally(terminerLeBanc);
  res.status(202).json({ lance: true, candidate: candidate.id, enCours: bancDeLaCandidateEnCours() });
}

/**
 * POST /api/config/versions/retour — { depuis: <la version en service vue à l'écran> } : remet la version
 * précédente, en une fois, jamais pendant une passe d'actualisation. Refus (409 / 503) : { error, raison },
 * rien n'a changé.
 */
export function postRetourVersion(req, res) {
  const sportId = resolveSportId(req);
  const depuis = req.body?.depuis;
  if (!Number.isInteger(depuis) || depuis < 1) throw new ApiError(400, '« depuis » est requis : le numéro de la version en service vue à l’écran (un entier). Rien n’a changé.');
  try {
    const r = revenirALaVersionPrecedente({ depuis });
    res.json({ ...r, config: getEngineConfig(sportId), versions: etatPourLaCarte() });
  } catch (error) {
    if (!(error instanceof RetourImpossible)) throw error;
    res.status(error.statut).json({ error: error.message, raison: error.raison });
  }
}

export function getTilt(req, res) {
  res.json(getTiltState());
}

export function putTilt(req, res) {
  res.json(setCircuitBreaker(req.body?.circuitBreakerActive));
}

export function postResetTilt(req, res) {
  res.json(resetTiltState());
}

// ------------------------------------------------ étape 11 : les garde-fous de Pierre

/** Le réglage (aucun plafond par défaut), l'état du moment (semaine, perte, reste, séries, alertes) et le coupe-circuit. */
function vueDesGardeFous(lu, extra = {}) {
  const gf = gardeFousDuMoment();
  const tilt = getTiltState();
  const { series, ...etat } = gf.etat ?? {};
  return {
    ...lu,
    ...extra,
    defaut: REGLAGE_GARDE_FOUS_DEFAUT,
    etat: gf.etat ? etat : null,
    series: series ?? null,
    probleme: gf.probleme?.message ?? null,
    coupeCircuit: { actif: tilt.circuitBreakerActive, manuel: tilt.coupeCircuitManuel, automatique: tilt.automatique }
  };
}

const enApiError = (error) => (error instanceof ErreurGardeFous ? new ApiError(error.statut, error.message) : error);

/** GET /api/config/garde-fous — lecture seule. */
export function getGardeFous(req, res) {
  try {
    res.json(vueDesGardeFous(lireReglageGardeFous()));
  } catch (error) {
    throw enApiError(error);
  }
}

/** PUT /api/config/garde-fous — { miseMaxParPari?, perteMaxParSemaine? } (null = aucun plafond) ; idempotent ; n'engage rien. */
export function putGardeFous(req, res) {
  try {
    const r = enregistrerReglageGardeFous(req.body);
    const { ecrit, ...lu } = r;
    res.json(vueDesGardeFous(lu, { ecrit }));
  } catch (error) {
    throw enApiError(error);
  }
}
