/**
 * masqueDesButs.js — LE MASQUE DES BUTS (lot 0, écrit le 13/11/2026 ; sert seulement si l'essai 27 n'est PAS adopté).
 * -----------------------------------------------------------------------
 * Les pourcentages de buts du moteur en service se sont montrés trop sûrs d'eux (ses « moins de … buts » annoncés à
 * 75 % passaient moins de 6 fois sur 10). Tant qu'aucune correction n'a fait ses preuves à l'essai, ils sont CACHÉS à
 * la sortie du serveur : total de buts (plus / moins), « les deux marquent », buts d'une équipe, résultat + total.
 * Cacher, c'est la SORTIE seulement :
 *   - aucune version du moteur, aucun réglage, aucune ligne de son empreinte ne change (ce module est hors des
 *     dossiers et fichiers de MODULES_DU_MOTEUR, et aucun module de l'empreinte ne l'importe) ;
 *   - le gel des pronostics et le règlement continuent sur les buts, en coulisses : la preuve s'accumule ;
 *   - les cotes de référence des bookmakers, les paris de Pierre (saisie, archive, « J'ai parié », règlement) et
 *     l'historique déjà réglé restent tels quels.
 * Pas de numéro de version ici : une version qui ne corrige pas les buts ne lève RIEN. Le masque se retire à la main,
 * `actif: false`, dans la même mise en service que l'adoption d'une correction des buts.
 *
 * Toutes les fonctions sont PURES et prennent le masque en dernier paramètre (`masqueEnService()` par défaut) ; avec
 * `null`, elles rendent l'entrée à l'identique. Les portes de sortie qui les appellent : la route de l'analyse
 * (analysis.routes.js), les saisies (cotesVosBookmakers.controller.js), le Repérage et les Opportunités (leurs
 * contrôleurs), le prix d'un combiné (simulation.controller.js), les entrées IA (matchAiAnalysis.controller.js), les
 * invites de l'IA (core/ai/matchAiAnalysisPrompt.js) et la fiche du bulletin (core/ai/bulletinPrompt.js).
 * La règle des dates (historique honnête) : les pages, le Repérage, les saisies, le combiné et l'IA d'avant-match sont
 * toujours filtrés ; les revues et le panneau IA seulement pour un match qui commence à `depuis` ou après.
 * Ne lit aucun fichier : il ne peut pas « s'éteindre » sur une erreur de lecture.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verdictValue } from '../core/engine/coteMinimale.js';
import { typeDeMarche } from './repositories/matchAiAnalysisRepository.js';

const ICI = fileURLToPath(import.meta.url);

/** Les quatre familles cachées (identifiants de marché du moteur, sports/football/markets.js). */
export const FAMILLES_DE_BUTS = Object.freeze(['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal']);
const FAMILLES = new Set(FAMILLES_DE_BUTS);

/** Les clés de buts des cotes justes de l'analyse (`trueOdds`) : seules home, draw et away restent. */
export const CLES_DE_BUTS_DES_COTES_JUSTES = Object.freeze([
  'over05', 'over15', 'over25', 'over35', 'under05', 'under15', 'under25', 'under35',
  'homeTeamGoals', 'awayTeamGoals', 'bothTeamsScore', 'bothTeamsScoreNo', 'resultAndTotal'
]);
const CLES_DES_COTES_JUSTES = new Set(CLES_DE_BUTS_DES_COTES_JUSTES);

/** Les marchés de buts du Repérage (data/screener.js, MARCHES) et leur libellé (le pari d'une ligne d'opportunité). */
export const MARCHES_DE_BUTS_DU_REPERAGE = Object.freeze(['over15', 'over25', 'under25', 'over35', 'bttsYes', 'bttsNo']);
const MARCHES_DU_REPERAGE = new Set(MARCHES_DE_BUTS_DU_REPERAGE);
/** Recopiés de MARCHES (screener.js) : l'essai masqueDesButs.test.mjs les compare à l'original, importé. */
export const LIBELLES_DE_BUTS_DU_REPERAGE = Object.freeze(['Plus de 1,5 buts', 'Plus de 2,5 buts', 'Moins de 2,5 buts', 'Plus de 3,5 buts', 'Les deux équipes marquent', 'Une équipe au moins ne marque pas']);
const LIBELLES_DU_REPERAGE = new Set(LIBELLES_DE_BUTS_DU_REPERAGE);

/** Le jour d'un instant écrit à l'heure de Paris (« 2026-11-15T… » → « 15/11 »), lu dans le texte : aucun fuseau à deviner. */
function jourDit(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}` : String(iso ?? '');
}

/** Les quatre phrases, écrites UNE fois ; la date suit `depuis`. Les essais les importent, jamais retapées. */
export function phrasesDuMasque(depuis) {
  const le = jourDit(depuis);
  return Object.freeze({
    phrase: `Pronostics de buts cachés depuis le ${le} : le moteur s'y montrait trop sûr de lui (ses « moins de … buts » annoncés à 75 % passaient moins de 6 fois sur 10) ; ils reviendront quand une correction aura fait ses preuves à l'essai.`,
    phraseSaisie: `Pas de value sur les buts pour l'instant : les pourcentages de buts du moteur sont cachés depuis le ${le} (trop sûrs d'eux), votre cote reste enregistrée.`,
    phraseCombine: `Les marchés de buts sont cachés depuis le ${le} (le moteur y était trop sûr de lui) : retirez cette sélection pour calculer le prix du combiné.`,
    phraseIA: `Marchés de buts retirés depuis le ${le} : les pourcentages de buts du moteur se sont révélés trop sûrs d'eux (« moins de … buts » annoncés 75 %, réalisés 57 %). Ne donne aucun avis ni conseil sur le total de buts, « les deux marquent », les buts d'une équipe ou « résultat + total » ; les buts attendus ne servent qu'au score exact.`
  });
}

/**
 * L'INTERRUPTEUR. `depuis` : l'heure RÉELLE de la mise en service (Paris), arrondie à l'heure INFÉRIEURE — jamais
 * après la mise en service — à régler au rituel ; `actif: false` au retrait (adoption d'une correction des buts, jamais
 * avant), avec `EN_SERVICE_ATTENDU = false` dans test/masqueDesButs.test.mjs.
 */
const DEPUIS = '2026-11-15T09:00:00+01:00';
export const MASQUE_DES_BUTS = Object.freeze({ actif: true, depuis: DEPUIS, ...phrasesDuMasque(DEPUIS) });

/**
 * Une COPIE D'ESSAI faite par test/aides/isolement.mjs : `CM_TEST_DOSSIER` = un dossier `cm-tests-…` ET ce fichier
 * exactement à `<ce dossier>/code/server/src/data/masqueDesButs.js`. Là, les essais d'avant le masque rejouent les routes
 * de l'appli entière et comparent ses réponses à l'octet : le masque n'y est en service que si `CM_TEST_MASQUE_DES_BUTS`
 * est posée. Toute autre valeur de `CM_TEST_DOSSIER` (C:\, le dépôt, server…) n'éteint RIEN : chez Pierre, seul
 * `actif: false` l'éteint.
 */
export function dansUneCopieDEssai(env = process.env, ici = ICI) {
  const dossier = env?.CM_TEST_DOSSIER;
  if (typeof dossier !== 'string' || !dossier.trim()) return false;
  const d = path.resolve(dossier);
  if (!/^cm-tests-/.test(path.basename(d))) return false;
  return path.relative(d, ici).split(path.sep).join('/') === 'code/server/src/data/masqueDesButs.js';
}

/** Le masque en service, ou null (retiré, ou copie d'essai qui ne l'a pas demandé : variable absente). */
export const masqueEnService = (env = process.env) =>
  MASQUE_DES_BUTS.actif && (!dansUneCopieDEssai(env) || String(env?.CM_TEST_MASQUE_DES_BUTS ?? '').trim() !== '') ? MASQUE_DES_BUTS : null;

/** Ce que l'écran lit du masque (il n'en garde aucune copie) : la phrase et le moment. */
export const vueDuMasque = (masque) => ({ phrase: masque.phrase, depuis: masque.depuis });

/**
 * Masquer ce match ? Oui s'il commence à `depuis` ou après, OU s'il n'a pas encore commencé (quel que soit `depuis`).
 * Date absente ou illisible : non (ce qui a été vu reste tel quel).
 */
export function apresLeMasque(commenceTime, masque = masqueEnService(), maintenant = Date.now()) {
  if (!masque) return false;
  const t = Date.parse(String(commenceTime ?? ''));
  return Number.isFinite(t) && (t >= Date.parse(masque.depuis) || t > maintenant);
}

const estObjet = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
/** Une famille de buts ? Par l'identifiant de marché, sinon par le libellé (« Total buts », « Buts — X »…). */
const deButs = (m) => estObjet(m) && (FAMILLES.has(m.marketId) || FAMILLES.has(typeDeMarche({ marketId: m.marketId, market: m.market })));
const sansButs = (liste) => (Array.isArray(liste) ? liste.filter((m) => !deButs(m)) : liste);
const sansCles = (obj, cles) => (estObjet(obj) ? Object.fromEntries(Object.entries(obj).filter(([k]) => !cles.has(k))) : obj);

// ------------------------------------------------------------ l'analyse du match (GET /api/analysis/match/:id)

/**
 * L'analyse sans aucun pourcentage des quatre familles : `trueOdds` (seuls 1 / N / 2), `marketPredictions`,
 * `distributions` (le 1 / N / 2 et le score exact restent), `comparateur.marches` ; plus `masqueDesButs` pour l'écran.
 * Les buts attendus, le score exact, corners, tirs, la mise, le verdict 1 / N / 2 et les autres blocs : intacts.
 */
export function analyseSansLesButs(corps, masque = masqueEnService()) {
  if (!masque || !estObjet(corps)) return corps;
  const sortie = { ...corps };
  if (estObjet(corps.trueOdds)) sortie.trueOdds = sansCles(corps.trueOdds, CLES_DES_COTES_JUSTES);
  if (Array.isArray(corps.marketPredictions)) sortie.marketPredictions = sansButs(corps.marketPredictions);
  if (estObjet(corps.distributions)) sortie.distributions = sansCles(corps.distributions, FAMILLES);
  if (estObjet(corps.comparateur) && Array.isArray(corps.comparateur.marches)) sortie.comparateur = { ...corps.comparateur, marches: sansButs(corps.comparateur.marches) };
  sortie.masqueDesButs = vueDuMasque(masque);
  return sortie;
}

// ------------------------------------------------------------ les cotes saisies à la main (/api/odds/saisies)

/** Une saisie de buts : la cote reste, sans probabilité, sans value ni bornes ; le verdict est celui d'un pourcentage inconnu. */
function saisieSansValeur(s, masque) {
  return {
    ...s,
    moteur: { probabilite: null, coteJuste: null, origine: null, raison: masque.phraseSaisie },
    pourcent: null,
    bornes: null,
    verdict: verdictValue({ pourcent: null, cote: s.cote, regle: s.regle, jouable: s.jouable, fraicheur: s.fraicheur })
  };
}

function etatSansValeurDeButs(etat, masque) {
  if (!estObjet(etat)) return etat;
  const sortie = { ...etat };
  if (Array.isArray(etat.saisies)) sortie.saisies = etat.saisies.map((s) => (estObjet(s) && FAMILLES.has(s.marketId) ? saisieSansValeur(s, masque) : s));
  // Le formulaire : un marché de buts se saisit toujours, sans probabilité du moteur (la phrase le dit).
  if (Array.isArray(etat.marches)) sortie.marches = etat.marches.map((m) => (estObjet(m) && FAMILLES.has(m.id) ? { ...m, avecMoteur: false, sansMoteur: masque.phraseSaisie } : m));
  sortie.masqueDesButs = vueDuMasque(masque); // la phrase de la 2e carte de l’onglet Marchés (ManualOddsEntry.vue)
  return sortie;
}

/** La réponse des saisies (l'état, ou une saisie / un retrait qui porte `etat`) sans value sur les buts. */
export function saisiesSansValeurDeButs(r, masque = masqueEnService()) {
  if (!masque || !estObjet(r)) return r;
  if (Array.isArray(r.saisies) || Array.isArray(r.marches)) return etatSansValeurDeButs(r, masque);
  if (estObjet(r.etat)) return { ...r, etat: etatSansValeurDeButs(r.etat, masque) };
  return r;
}

// ------------------------------------------------------------ le Repérage et les Opportunités

/** Le Repérage : pour ses six marchés de buts, ni probabilité du moteur, ni écart, ni avantage (la cote du bookmaker reste). */
export function reperageSansLesButs(lu, masque = masqueEnService()) {
  if (!masque || !estObjet(lu) || !estObjet(lu.data)) return lu;
  const matches = Array.isArray(lu.data.matches)
    ? lu.data.matches.map((m) =>
        estObjet(m) && Array.isArray(m.markets)
          ? { ...m, markets: m.markets.map((k) => (estObjet(k) && MARCHES_DU_REPERAGE.has(k.key) ? { ...k, engineProb: null, gapPoints: null, edgePct: null } : k)) }
          : m
      )
    : lu.data.matches;
  return { ...lu, data: { ...lu.data, matches, masqueDesButs: { ...vueDuMasque(masque), marches: [...MARCHES_DE_BUTS_DU_REPERAGE] } } };
}

/** Les Opportunités : les lignes de buts retirées, et les comptes du résumé refaits sur les lignes qui restent. */
export function opportunitesSansLesButs(op, masque = masqueEnService()) {
  if (!masque || !estObjet(op) || !estObjet(op.data) || !Array.isArray(op.data.lignes)) return op;
  const lignes = op.data.lignes.filter((l) => !(estObjet(l) && MARCHES_DU_REPERAGE.has(l.marche)));
  const r = op.data.resume;
  const resume = estObjet(r)
    ? {
        ...r,
        lignes: lignes.length,
        vertes: lignes.filter((l) => l.verdict?.vert).length,
        aRafraichir: lignes.filter((l) => l.verdict?.etat === 'a-rafraichir').length,
        chutes: lignes.filter((l) => l.chute).length,
        chutesSansVosCotes: lignes.filter((l) => l.chute && !l.avecOffre).length,
        coupeCircuit: lignes.some((l) => l.verdict?.etat === 'coupe-circuit'),
        ...('enCaseVerte' in r ? { enCaseVerte: lignes.filter((l) => l.carte?.couleur === 'vert').length } : {}),
        ...('enCaseRouge' in r ? { enCaseRouge: lignes.filter((l) => l.carte?.couleur === 'rouge').length } : {})
      }
    : r;
  return { ...op, data: { ...op.data, lignes, resume } };
}

// ------------------------------------------------------------ le prix d'un combiné (étape 28)

/** Les sélections de buts d'un ticket (le contrôleur les refuse AVANT de calculer) ; sans masque : aucune. */
export function jambesDeButs(legs, masque = masqueEnService()) {
  if (!masque || !Array.isArray(legs)) return [];
  return legs.filter((l) => estObjet(l) && FAMILLES.has(l.marketId));
}

// ------------------------------------------------------------ l'IA : entrées enregistrées, expérience, invites

/** Une analyse IA (ou l'analyse d'avance gardée) : le résumé du moteur, les avis et la revue, sans les buts. */
function analyseIaSansButs(a) {
  if (!estObjet(a)) return a;
  const sortie = { ...a };
  if (estObjet(a.engineSnapshot) && Array.isArray(a.engineSnapshot.marketPredictions)) sortie.engineSnapshot = { ...a.engineSnapshot, marketPredictions: sansButs(a.engineSnapshot.marketPredictions) };
  if (estObjet(a.analysis) && Array.isArray(a.analysis.marketViews)) sortie.analysis = { ...a.analysis, marketViews: sansButs(a.analysis.marketViews) };
  if (estObjet(a.postMatchReview) && Array.isArray(a.postMatchReview.marketReviews)) sortie.postMatchReview = { ...a.postMatchReview, marketReviews: sansButs(a.postMatchReview.marketReviews) };
  return sortie;
}

/** Une entrée d'analyse IA, filtrée seulement si son match commence à `depuis` ou après (sinon : à l'identique). */
export function entreeIaSansLesButs(entree, masque = masqueEnService()) {
  if (!masque || !estObjet(entree) || !apresLeMasque(entree.commenceTime, masque)) return entree;
  const sortie = analyseIaSansButs(entree);
  if (estObjet(entree.earlierAnalysis)) sortie.earlierAnalysis = analyseIaSansButs(entree.earlierAnalysis);
  return sortie;
}

/** L'expérience de l'IA par type de marché, sans les types de buts. */
export function experienceSansLesButs(experience, masque = masqueEnService()) {
  if (!masque || !Array.isArray(experience)) return experience;
  return experience.filter((t) => !(estObjet(t) && FAMILLES.has(t.marketType)));
}

/** Les pronostics du journal (onglet Analyse IA) d'un match qui commence à `depuis` ou après, sans les buts. */
export function pronosticsSansLesButs(predictions, commenceTime, masque = masqueEnService()) {
  if (!masque || !Array.isArray(predictions) || !apresLeMasque(commenceTime, masque)) return predictions;
  return sansButs(predictions);
}

/**
 * Le journal des pronostics (GET /api/predictions, « Historique moteur ») : un pronostic de buts EN ATTENTE d'un match
 * pas encore commencé est retiré ; il revient au coup d'envoi (historique, règlement). L'historique réglé reste.
 */
export function journalSansButsAVenir(corps, masque = masqueEnService(), maintenant = Date.now()) {
  if (!masque || !estObjet(corps) || !Array.isArray(corps.entries)) return corps;
  return { ...corps, entries: corps.entries.filter((p) => !(deButs(p) && p.status === 'pending' && !(Date.parse(String(p.commenceTime ?? '')) <= maintenant))) };
}

/**
 * Les entrées d'une invite d'avant-match sans les buts : le résumé du moteur, les marchés commentés, l'expérience et
 * les types retirés par le carnet. Toujours (l'avant-match se prépare pour un match à venir).
 */
export function invitesAvantMatchSansLesButs({ engineSummary, marches, experience, retires }, masque = masqueEnService()) {
  if (!masque) return { engineSummary, marches, experience, retires };
  return {
    engineSummary: estObjet(engineSummary) && Array.isArray(engineSummary.marketPredictions) ? { ...engineSummary, marketPredictions: sansButs(engineSummary.marketPredictions) } : engineSummary,
    marches: sansButs(marches),
    experience: experienceSansLesButs(experience, masque),
    retires: Array.isArray(retires) ? retires.filter((r) => !(estObjet(r) && FAMILLES.has(r.type))) : retires
  };
}

/** Les entrées d'une revue d'après-match sans les buts (le résumé du moteur, les issues, les avis d'avant-match). */
export function invitesApresMatchSansLesButs({ engineSummary, marketOutcomes, priorAnalysis }) {
  return {
    engineSummary: estObjet(engineSummary) && Array.isArray(engineSummary.marketPredictions) ? { ...engineSummary, marketPredictions: sansButs(engineSummary.marketPredictions) } : engineSummary,
    marketOutcomes: sansButs(marketOutcomes),
    priorAnalysis: estObjet(priorAnalysis) && Array.isArray(priorAnalysis.marketViews) ? { ...priorAnalysis, marketViews: sansButs(priorAnalysis.marketViews) } : priorAnalysis
  };
}

// ------------------------------------------------------------ le bulletin du jour

/** La fiche du jour sans ligne de buts (values vertes et chutes de cote) ; le bilan de la semaine n'y passe pas. */
export function ficheDuJourSansLesButs(f, masque = masqueEnService()) {
  if (!masque || !estObjet(f) || !estObjet(f.opportunites)) return f;
  const o = f.opportunites;
  const garde = (liste) => (Array.isArray(liste) ? liste.filter((l) => !(estObjet(l) && LIBELLES_DU_REPERAGE.has(l.pari))) : liste);
  return { ...f, opportunites: { ...o, retenues: garde(o.retenues), chutesRetenues: garde(o.chutesRetenues) } };
}
