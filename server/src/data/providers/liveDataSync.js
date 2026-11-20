import fs from 'node:fs';
import { getSportOddsRaw } from './oddsApiClient.js';
import { getCompetitionsRaw } from './footballDataClient.js';
import { saveOddsMatches, saveCompetitions, loadOddsMatches, getFixturePaths } from '../repositories/fixturesRepository.js';
import { TRACKED_SPORT_KEYS, NOMS_DES_CLES } from './oddsApiCompetitions.js';
import { bilanDuReleve, noterRelevePayant } from '../repositories/relevePayantRepository.js';
import { championnatsDeLInstantane, heureDeLInstantane, conseilReleveActuel, CLES_PAR_RELEVE_CIBLE_MAX } from '../conseilReleve.js';
import { DomainError } from '../../core/errors.js';

/**
 * Championnats suivis par CôteMaster côté The Odds API : la liste vit dans
 * oddsApiCompetitions.js (constantes seulement, depuis l'étape 7 du plan),
 * reprise ici pour les appelants d'avant.
 *
 * Chaque entrée consomme AU PLUS un crédit PAR ACTUALISATION (1 région × 1
 * marché ; plan "Starter" : 500/mois) — 37 clés depuis le 21/09/2026, donc au
 * plus 37 crédits à chaque clic sur "Actualiser". Aucun rafraîchissement
 * automatique ailleurs dans l'appli (cf. oddsApiClient.js) : c'est toujours
 * une action explicite. Le conseil de relevé (data/conseilReleve.js) dit
 * quand un relevé vaut le coup ; il n'en lance jamais.
 *
 * LE RELEVÉ CIBLÉ (18/11/2026) : le bouton de l'encart du conseil (Réglages)
 * relève SEULEMENT les championnats de la vague (refreshLiveOddsCible),
 * toujours sur un clic de Pierre confirmé en deux temps. Les deux relevés
 * partagent un verrou : un seul à la fois.
 */
export { TRACKED_SPORT_KEYS, CLES_PAR_RELEVE_CIBLE_MAX };

/**
 * LE VERROU « UN RELEVÉ À LA FOIS ». Un drapeau du module, commun au relevé complet et au relevé ciblé : un second clic
 * pendant un relevé reçoit une erreur 409 et NE PART PAS (aucun appel payant, rien d'écrit). Sans lui, deux relevés en
 * même temps réécriraient l'instantané l'un sur l'autre. Un seul serveur relève (le bouton passe par lui) : un drapeau du
 * module suffit. Il est rendu dans tous les cas (finally), même si le relevé échoue.
 */
let releveEnCours = null;
export const CODE_RELEVE_EN_COURS = 'RELEVE_EN_COURS';

function prendreLeVerrou(cible) {
  if (releveEnCours) {
    throw new DomainError('Un relevé est déjà en cours : attendez qu’il finisse avant d’en relancer un (rien n’est parti).', { status: 409, code: CODE_RELEVE_EN_COURS });
  }
  releveEnCours = { depuis: new Date().toISOString(), cible };
}

function rendreLeVerrou() {
  releveEnCours = null;
}

/** Le relevé en cours (null s'il n'y en a pas) : pour les essais. */
export const releveEnCoursDe = () => (releveEnCours ? { ...releveEnCours } : null);

/**
 * Le relevé lui-même, commun aux deux boutons : une requête par clé, TOUJOURS la même (getSportOddsRaw : 1 région « eu »,
 * 1 marché « h2h », cotes décimales), donc au plus 1 crédit par clé. Une compétition en échec (coupe entre deux tours,
 * clé hors saison) n'annule pas les autres : on sauvegarde ce qui a répondu et on remonte la liste des échecs. Si AUCUNE
 * ne répond : erreur, et rien n'est écrit (ni l'instantané, ni le bilan).
 *
 * L'instantané est RÉÉCRIT avec les seuls matchs que ces requêtes viennent de rendre (saveOddsMatches, inchangée) :
 * odds-snapshot.json ne contient jamais que des cotes relevées par le relevé qui l'a écrit, et l'heure du fichier reste
 * la vraie heure de chacune de ses cotes, pour tous ses lecteurs (archive, fraîcheur, gel, essai n° 3).
 *
 * Correction S7 (18/11/2026) : l'instantané est daté du DÉBUT du relevé, pas de sa fin. Les clés sont relevées l'une
 * après l'autre ; daté de la fin, une cote répondue à 14 h 58 dans un relevé fini à 15 h 03 passait pour relevée après
 * l'annonce des compositions de 15 h 00 (donc fraîche). Daté du début, aucune cote ne paraît plus récente qu'elle n'est.
 * La date est posée juste après l'écriture, dans le même bloc synchrone (aucun lecteur ne passe entre les deux) ; un
 * échec est noté, sans faire échouer le relevé.
 */
async function releverLesCles(cles) {
  const allMatches = [];
  const sportsRefreshed = [];
  const failures = [];
  const reponses = [];
  let lastQuota = null;
  const debut = new Date();

  for (const sportKey of cles) {
    try {
      const { matches, quota } = await getSportOddsRaw(sportKey);
      allMatches.push(...matches);
      sportsRefreshed.push(sportKey);
      lastQuota = quota ?? lastQuota;
      reponses.push({ sportKey, ok: true, matchs: matches.length, quota: quota ?? null });
    } catch (error) {
      failures.push({ sportKey, message: error.message });
      // Une réponse en erreur porte son quota (oddsApiClient.js) ; une panne réseau n'en a pas : coût inconnu.
      reponses.push({ sportKey, ok: false, matchs: 0, quota: error.quota ?? null, message: error.message });
    }
  }

  if (!sportsRefreshed.length) {
    throw new Error(`Aucune compétition n'a pu être rafraîchie : ${failures.map((f) => `${f.sportKey} (${f.message})`).join(' ; ')}`);
  }

  saveOddsMatches(allMatches);
  try {
    fs.utimesSync(getFixturePaths().odds, debut, debut);
  } catch (error) {
    console.warn(`[relevé payant] l'instantané n'a pas pu être daté du début du relevé (${debut.toISOString()}) : ${error.message}`);
  }
  const bilan = bilanDuReleve({ at: new Date().toISOString(), reponses });
  noterRelevePayant(bilan);
  return { matchesFetched: allMatches.length, sportsRefreshed, failures, quota: lastQuota, cout: bilan.cout };
}

/**
 * Récupère les cotes en direct pour chaque championnat suivi et remplace
 * l'instantané local (server/data/fixtures/odds/odds-snapshot.json). Ne se
 * déclenche jamais automatiquement : uniquement sur action explicite de
 * l'utilisateur, pour préserver le quota mensuel. Une compétition en échec
 * (coupe entre deux tours, clé hors saison) n'annule pas les autres : on
 * sauvegarde ce qui a répondu et on remonte la liste des échecs.
 *
 * Étape 7 du plan : le bilan du relevé (crédits restants et consommés, coût
 * de chaque requête) est gardé dans data/runtime/releve-payant.json — le
 * conseil de relevé dit ainsi les crédits restants s'ils sont connus. Ce
 * bilan ne fait jamais échouer le relevé.
 *
 * Relevé ciblé (18/11/2026) : le même relevé qu'avant, à l'identique, sous le
 * verrou « un relevé à la fois ».
 */
export async function refreshLiveOdds() {
  prendreLeVerrou(false);
  try {
    return await releverLesCles(TRACKED_SPORT_KEYS);
  } finally {
    rendreLeVerrou();
  }
}

/**
 * Le contrôle des clés d'un relevé ciblé, AVANT tout appel : un tableau non vide, sans doublon, d'au plus
 * CLES_PAR_RELEVE_CIBLE_MAX clés, chacune suivie (TRACKED_SPORT_KEYS). Sinon : erreur 400 avec le motif, aucun appel
 * au client payant, aucune écriture. Au-delà de 12 clés, l'écran propose le relevé complet.
 * @returns {string[]} les clés, dans l'ordre demandé
 */
export function controlerLesCles(cles) {
  const refus = (motif) => {
    throw new DomainError(`Relevé ciblé refusé : ${motif}. Rien n'est parti.`, { status: 400, code: 'RELEVE_CIBLE_INVALIDE' });
  };
  if (!Array.isArray(cles)) refus('la liste des championnats manque (« cles » : un tableau de clés The Odds API)');
  if (!cles.length) refus('aucun championnat demandé');
  if (cles.length > CLES_PAR_RELEVE_CIBLE_MAX) refus(`${cles.length} championnats demandés, ${CLES_PAR_RELEVE_CIBLE_MAX} au plus : faites plutôt le relevé complet (Réglages › Données)`);
  const suivies = new Set(TRACKED_SPORT_KEYS);
  const vues = new Set();
  for (const cle of cles) {
    if (typeof cle !== 'string' || !suivies.has(cle)) refus(`« ${String(cle).slice(0, 80)} » n'est pas un championnat suivi`);
    if (vues.has(cle)) refus(`« ${cle} » est demandé deux fois`);
    vues.add(cle);
  }
  return [...cles];
}


const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

export const CODE_LISTE_CHANGEE = 'RELEVE_CIBLE_LISTE_CHANGEE';
export const MESSAGE_LISTE_CHANGEE = 'La liste à relever a changé depuis votre clic : relisez l’encart. Rien n’est parti.';

/**
 * Correction S4 : la liste demandée est-elle EXACTEMENT celle du conseil relu, bouton allumé ? Sinon 409 (rien ne part).
 * Un conseil absent compte comme « éteint » ; un conseil qui ne se lit pas (erreur levée par sa lecture) fait échouer le
 * relevé avec son motif, avant tout appel payant.
 * @param {string[]} demandees les clés déjà contrôlées (controlerLesCles)
 * @param {object|null} conseil conseilReleveActuel()
 */
export function controlerLaListeDuConseil(demandees, conseil) {
  const rc = conseil?.releveCible;
  const attendues = Array.isArray(rc?.cles) ? rc.cles : [];
  const memes = rc?.actif === true && attendues.length === demandees.length && new Set(attendues).size === attendues.length && attendues.every((k) => demandees.includes(k));
  if (!memes) throw new DomainError(MESSAGE_LISTE_CHANGEE, { status: 409, code: CODE_LISTE_CHANGEE });
}

/**
 * Le compte rendu d'un relevé ciblé, en clair (pour l'encart et le message) : « 3 championnats relevés : 61 matchs,
 * 3 crédits. Il en reste 464. Les cotes de 30 autres championnats ont été retirées. » ; une clé en échec : « La Liga -
 * Spain n'a pas répondu (motif) : ses cotes ne sont plus dans le relevé. » Le coût et les crédits restants viennent des
 * en-têtes de The Odds API ; inconnus, ils sont dits inconnus, jamais devinés.
 */
export function compteRenduDuReleveCible({ sportsRefreshed = [], failures = [], matchesFetched = 0, quota = null, cout = null, retires = [] } = {}) {
  const nom = (cle) => NOMS_DES_CLES[cle] ?? cle;
  const morceaux = [];
  const credits = cout === null || cout === undefined ? 'coût non communiqué par The Odds API' : pluriel(cout, 'crédit');
  morceaux.push(`${pluriel(sportsRefreshed.length, 'championnat relevé', 'championnats relevés')} : ${pluriel(matchesFetched, 'match', 'matchs')}, ${credits}.`);
  const restants = quota?.remaining;
  morceaux.push(restants === null || restants === undefined ? 'Crédits restants : non communiqués.' : `Il en reste ${restants}.`);
  if (retires.length) morceaux.push(`Les cotes de ${pluriel(retires.length, 'autre championnat', 'autres championnats')} ont été retirées (leurs matchs restent, sans cotes).`);
  for (const f of failures) morceaux.push(`${nom(f.sportKey)} n'a pas répondu (${f.message}) : ses cotes ne sont plus dans le relevé.`);
  return morceaux.join(' ');
}

/**
 * LE RELEVÉ CIBLÉ (Réglages › Cotes de vos bookmakers, bouton de l'encart du conseil, confirmé en deux temps) : seulement
 * les championnats demandés, une requête chacun, la même qu'au relevé complet — le coût est donc connu d'avance (au plus
 * 1 crédit par clé). Ne se déclenche jamais tout seul : aucune minuterie, aucun autre appelant que le contrôleur des
 * sources (route POST /api/sources/odds/refresh-cible).
 *
 * `retires` : les championnats de l'instantané ACTUEL qui ont des matchs à venir et ne sont pas demandés, calculés AVANT
 * toute requête — leurs cotes payantes disparaissent de l'instantané réécrit (leurs matchs restent, par le calendrier).
 * L'instantané est réécrit avec les seuls matchs de ces requêtes (même règle que le relevé complet) ; le bilan des crédits
 * passe par le dépôt de l'étape 7 tel quel (clesDemandees = nombre de clés demandées).
 *
 * Correction S4 (18/11/2026) : sous le verrou, AVANT tout appel payant, le conseil du moment est RELU
 * (conseilReleveActuel) ; la liste reçue doit être exactement celle qu'il propose (`releveCible.cles`, comparées comme
 * ensembles) et le bouton doit y être allumé (`releveCible.actif` : « maintenant », 12 clés au plus, assez de crédits
 * connus). Sinon : 409, rien ne part, rien n'est écrit. Une confirmation restée ouverte (matchs commencés entre-temps,
 * réglage changé) ne peut donc plus dépenser de crédits pour une liste périmée.
 *
 * @param {{ maintenant?: number, lireLeConseil?: (o: { maintenant: number }) => object }} [o] lireLeConseil : pour les essais
 * @returns {Promise<{ matchesFetched, sportsRefreshed, failures, quota, cout, cible: true, cles, retires, compteRendu }>}
 */
export async function refreshLiveOddsCible(cles, { maintenant = Date.now(), lireLeConseil = conseilReleveActuel } = {}) {
  const demandees = controlerLesCles(cles);
  prendreLeVerrou(true);
  try {
    controlerLaListeDuConseil(demandees, lireLeConseil({ maintenant }));
    const releveAt = heureDeLInstantane();
    const retires = championnatsDeLInstantane(loadOddsMatches(), { maintenant, releveAt })
      .filter((c) => c.matchsAVenir > 0 && !demandees.includes(c.cle))
      .map(({ cle, nom, matchsAVenir }) => ({ cle, nom, matchsAVenir, releveAt }));
    const r = await releverLesCles(demandees);
    return { ...r, cible: true, cles: demandees, retires, compteRendu: compteRenduDuReleveCible({ ...r, retires }) };
  } finally {
    rendreLeVerrou();
  }
}

/** Récupère la liste des compétitions en direct et remplace l'instantané local. */
export async function refreshLiveCompetitions() {
  const competitions = await getCompetitionsRaw();
  saveCompetitions(competitions);
  return { competitionsFetched: competitions.length };
}
