/**
 * aiScorecard.js — LE CARNET DE NOTES DE L'IA (étape 21 du plan, 14/10/2026).
 * -----------------------------------------------------------------------
 * Chaque nuit (étape « carnetIA » de l'actualisation), relire TOUTES les analyses d'avant-match enregistrées
 * (data/runtime/match-ai-analyses.json) et, pour chaque avis de l'IA sur un marché (confirme / nuance /
 * contredit, avec sa confiance), noter :
 *   - s'il a TENU au coup de sifflet final (avisTenu : la règle unique de matchAiAnalysisRepository.js,
 *     celle de la revue d'après-match) — un avis « nuance » n'est jamais compté ;
 *   - si la cote du marché a ensuite bougé DANS SON SENS (valeur de clôture), seulement pour le 1N2, le
 *     plus/moins de buts et « les deux équipes marquent », les seuls marchés à cotes gratuites ;
 * puis en tirer la fiabilité de l'IA par type de marché, par championnat, par confiance annoncée et par
 * forme de fiche, avec le nombre de cas. Aucun appel à Claude : 0 token.
 *
 * ÉTEND aiMarketExperience (matchAiAnalysisRepository.js) sans la doubler : mêmes types de marché, mêmes
 * comptes (bilanVide, compterAuBilan), même règle de l'avis tenu, même redémarrage de l'expérience (seuls les
 * pronostics choisis sous la cote minimale de 1,20, posée le 30/09/2026 : `minOdds`). Ce qu'elle n'avait
 * pas : le championnat, la clôture, la comparaison au moteur seul, et un rattachement sûr.
 *
 * LE RATTACHEMENT (correction 3) — l'analyse est rangée sous l'identifiant de cotes, la rencontre se lit au
 * magasin par les identifiants FotMob des deux clubs et le jour : jamais par le rapprocheur de noms souple
 * (il a déjà donné des matchs au mauvais club : Leeds United / D.C. United, les « Nacional »). Les
 * identifiants, dans l'ordre : ceux de la composition gardée avec l'analyse (page FotMob du match, ou
 * dernière feuille du club au magasin), ceux du gel des pronostics de ce match (engine_picks.match_id, étape
 * E), ceux de l'annuaire strict (clubDuMagasin, comme le gel et la valeur de clôture). Deux sources qui
 * donnent deux clubs différents : rien n'est pris au hasard, l'avis est écarté et compté.
 *
 * LE RÈGLEMENT — celui de la calibration (étape 20), donc du banc d'essai (étape 19) et du règlement
 * automatique : la rencontre retenue par lecteurDesRencontres (le jour exact, sinon à un jour près, jamais
 * deux), le score de la 90e minute d'un match prolongé, un match attribué écarté, un 0-0 de corners ou de
 * tirs « non relevé » (issueDuPronostic). Le pronostic jugé est celui GARDÉ avec l'analyse
 * (engineSnapshot.marketPredictions), jamais predictions.json (réécrit à chaque scan de Mes paris).
 *
 * LA CLÔTURE — closingValue.js (mesurerUneEntree), entrée par entrée, avec les identifiants FotMob déjà
 * trouvés (aucune seconde lecture par les noms) et, pour heure du choix, celle de l'analyse : la probabilité
 * juste du marché à ce moment-là (q) face à la clôture (c). Valeur de clôture (metrics.js) : confirmer =
 * le pronostic à 1/q, contredire = l'issue contraire à 1/(1 − q).
 *
 * MIEUX QUE LE MOTEUR SEUL (correction 4) — sur les MÊMES marchés et les MÊMES matchs (chaque avis compté),
 * le juge de l'étape 16 (bench/guard.js : lignes appariées, tirées par match, fourchette élargie pour le
 * nombre de types de marché jugés ensemble) compare deux façons de suivre les pronostics, à mise fixe et à
 * la cote juste du MOTEUR (1 / sa probabilité) : le moteur seul joue toujours son pronostic ; suivre l'IA,
 * c'est le jouer quand elle confirme, jouer l'issue contraire quand elle contredit. À la cote juste, un avis
 * qui n'apporte rien ne gagne rien : seul un avis qui sait quelque chose que le chiffre du moteur ignore fait
 * mieux. Un type de marché est COUPÉ — l'IA ne le reçoit plus dans sa liste (lireLesMarchesCoupes →
 * matchAiAnalysisService.js, fiche compacte seulement) — seulement sur preuve : au moins
 * SEUIL_MATCHS_POUR_COUPER matchs jugés (en dessous, le juge répond « pas assez de matchs » : jamais coupé),
 * un verdict « pas prouvé » (sans apport) ou « moins bon », et une clôture qui ne prouve pas le contraire.
 * RETOUCHE DU 14/10/2026 : la coupure est DÉSACTIVÉE (COUPURE_ACTIVE = false) tant que Pierre n'a pas décidé
 * de la règle — le carnet dit ce qu'elle ferait (« serait retiré »), rien n'est retiré de la fiche.
 *
 * POUR INFORMATION (même retouche) : pour chaque marché, le taux réalisé face au taux annoncé quand l'IA
 * confirme et quand elle nuance, avec le juge de l'étape 16 dès 200 matchs. Rien n'en dépend : la règle de
 * l'avis tenu (et la sortie d'aiMarketExperience) ne change pas.
 *
 * LE TYPE D'ARGUMENT (correction 2) n'existe pas dans les données : les avis par marché n'ont pas de thème,
 * et les facteurs clés (keyFactors) ne sont rattachés à aucun marché. Le classer demanderait de changer le
 * schéma de sortie et les consignes (le cache et le coût de chaque analyse) : à ajouter au prompt, décision
 * de Pierre. Le carnet le dit (TYPE_ARGUMENT), il ne devine rien dans le texte libre.
 *
 * OÙ ÇA VIT : data/runtime/carnet-ia.json, écrit par le SERVEUR seul (l'étape de la nuit, au clic
 * « Actualiser »), toujours par utils/atomicJson.js ; lu par GET /api/match-ai/scorecard et par chaque
 * analyse d'avant-match (les marchés coupés). La base n'est que lue.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/matchStatsDb.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { lecteurDesRencontres, issueDuPronostic, RAISONS_ECARTEES, MARCHES_AVEC_CLOTURE } from './calibration.js';
import { contexteDeMesure, mesurerUneEntree, RAISONS as RAISONS_DE_CLOTURE } from './closingValue.js';
import { listAll, TYPES_DE_MARCHE, typeDeMarche, avisTenu, bilanVide, compterAuBilan } from './repositories/matchAiAnalysisRepository.js';
import { rattacherAuxMarches } from '../core/ai/compactContext.js';
import { comparer } from '../bench/guard.js';
import { gainMiseFixe, valeurCloture } from '../bench/metrics.js';
import { readJsonFile, writeJsonAtomic } from '../utils/atomicJson.js';
import { executerSansPause, executerEnRendantLaMain, creerPauses } from '../utils/travailCooperatif.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================ les règles fixes

/** La forme du carnet : un carnet d'une autre forme n'est jamais lu pour couper (il sera recalculé la nuit suivante). */
export const VERSION_CARNET = 1;
/**
 * LE SEUIL : jamais un type de marché coupé sous ce nombre de MATCHS jugés (avis comptés, issue connue). C'est
 * aussi le minimum du juge (en dessous : « pas assez de matchs »), le même que la calibration et le banc. À
 * changer ici seulement : un carnet calculé avec un autre seuil ne coupe plus rien jusqu'au calcul suivant.
 */
export const SEUIL_MATCHS_POUR_COUPER = 200;
/**
 * LA COUPURE, DÉSACTIVÉE (retouche du 14/10/2026) : l'IA ne contredit presque jamais le moteur, et la règle
 * retirerait un marché dès 200 matchs sur un « pas prouvé » — à terme, elle ne commenterait plus rien. C'est à
 * Pierre de décider de la règle. Tant que cette constante vaut false : le carnet se calcule et s'affiche, il
 * dit pour chaque marché ce que la règle ferait (« serait retiré »), mais AUCUN marché n'est retiré de la fiche
 * de l'IA (lireLesMarchesCoupes rend toujours un ensemble vide) : la fiche compacte est celle d'avant, à l'octet.
 * Les essais l'activent dans LEUR copie du code, jamais ici.
 */
export const COUPURE_ACTIVE = false;
/** Le juge de l'étape 16, tel quel : 1 000 tirages, 5 %, une graine fixe (un carnet se rejoue au bit près). */
export const JUGE_DU_CARNET = Object.freeze({ minBlocs: SEUIL_MATCHS_POUR_COUPER, alpha: 0.05, tirages: 1000, graine: 21 });
/** L'expérience de l'IA redémarre avec la cote minimale de 1,20 (30/09/2026) : seuls les pronostics qui portent `minOdds` comptent. */
export const DEPUIS = Object.freeze({ jour: '2026-09-30', regle: 'pronostics à cote minimale 1,20' });
/** Les seuls types de marché qui ont des cotes de clôture gratuites (closingValue.js, issueDe). */
export const TYPES_AVEC_CLOTURE = MARCHES_AVEC_CLOTURE;
/** Le fichier du carnet. */
export const FICHIER_CARNET = path.resolve(__dirname, '../../data/runtime/carnet-ia.json');
/** Les niveaux de confiance annoncés par l'IA, du plus faible au plus fort. */
export const NIVEAUX = Object.freeze(['faible', 'moyenne', 'forte']);
/** Les formes de la fiche (étape 41) : une analyse sans forme notée est d'avant l'étape, donc de l'ancienne. */
export const FICHES_DU_CARNET = Object.freeze({ compacte: 'Fiche compacte', ancienne: 'Ancienne fiche' });

/** Le type d'argument : absent des données (correction 2). Dit tel quel sur la page. */
export const TYPE_ARGUMENT = Object.freeze({
  disponible: false,
  phrase: 'Type d’argument : à ajouter au prompt, décision de Pierre.',
  pourquoi:
    'Les avis par marché n’ont pas de thème, et les facteurs clés de l’analyse ne sont rattachés à aucun marché. Les classer demanderait un champ de plus dans la sortie de l’IA et ses consignes, donc un autre cache et un autre coût par analyse.'
});

/** Pourquoi un pronostic commenté n'entre pas dans le carnet : chaque raison comptée, jamais en silence. */
export const RAISONS_DU_CARNET = Object.freeze({
  sansPronostics: 'Analyse sans les pronostics du moteur gardés avec elle (jamais relus dans predictions.json)',
  avantLaRegle: 'Pronostic d’avant la cote minimale de 1,20 (30/09/2026) : l’expérience repart de là',
  typeInconnu: 'Type de marché inconnu',
  sansDate: 'Coup d’envoi absent de l’analyse : la rencontre ne se retrouve pas sans son jour',
  aVenir: 'Match pas encore joué',
  sansIdentifiant: 'Club sans identifiant FotMob (ni composition, ni gel, ni annuaire) : jamais rapproché par le nom seul',
  identifiantsContradictoires: 'Deux sources donnent deux clubs différents : rien n’est pris au hasard',
  apresCoupDEnvoi: 'Analyse faite après le coup d’envoi',
  doublon: 'Une autre analyse de la même rencontre, plus récente avant le coup d’envoi, compte à sa place',
  ...Object.fromEntries(['sansResultat', 'rencontreAmbigue', 'sansScore', 'attribue', 'prolongationSansScore90', 'prolongationStats', 'statNonRelevee', 'nonReglable', 'sansChoix'].map((k) => [k, RAISONS_ECARTEES[k]]))
});

/** D'où viennent les chiffres : dit sur la page, tel quel. */
export const PROVENANCE = Object.freeze({
  avis: 'Analyses d’avant-match de l’IA (data/runtime/match-ai-analyses.json) : l’analyse de référence de chaque match (celle d’avant le coup d’envoi quand il y en a une), ses avis rattachés aux pronostics du moteur gardés avec elle.',
  resultats: 'Scores et statistiques du magasin FotMob (tables matches et team_stats), rencontre retrouvée par les identifiants FotMob des clubs, réglée comme au banc d’essai : score de la 90e minute, match attribué écarté, 0-0 de corners ou de tirs = non relevé.',
  cloture: 'Cotes gratuites archivées (tables odds_events et odds_quotes) : seuls le 1N2, le plus/moins de buts et « les deux équipes marquent » en ont.',
  juge: 'Juge de l’étape 16 (lignes appariées, tirées par match, fourchette élargie pour le nombre de marchés jugés ensemble).'
});

/** La phrase de la page tant que la coupure est désactivée. */
export const DECISION_EN_ATTENTE = 'Aucun marché n’est retiré pour l’instant : c’est à vous de décider de la règle.';

/** L'état d'un type de marché, en mots (l'étiquette de la page et du bilan de la nuit). */
export const ETATS = Object.freeze({
  coupe: 'l’IA n’apporte rien ici, elle ne commente plus',
  // La coupure désactivée (COUPURE_ACTIVE) : ce que la règle ferait, sans le faire.
  seraitRetire: 'serait retiré : l’IA n’apporte rien ici',
  garde: 'l’IA fait mieux que le moteur seul : elle commente',
  tropTot: 'trop tôt pour juger : elle commente',
  aucun: 'aucun avis compté : elle commente'
});

// ============================================================ règles pures

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const instant = (x) => {
  const t = Date.parse(x ?? '');
  return Number.isFinite(t) ? t : null;
};
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);
/** Un identifiant de club lisible (« fotmob-6397 »), sinon null. */
const id = (x) => (typeof x === 'string' && x.trim() ? x.trim() : fini(x) ? String(x) : null);

/** La clé d'un marché dans un match : son type et, pour un marché d'équipe, l'équipe (comme le gel, cleDuMarche). */
export const cleDuMarche = (p) => `${p.marketId ?? typeDeMarche(p)}${p.params?.team ? `:${p.params.team}` : ''}`;

/**
 * Les identifiants FotMob des deux clubs d'une analyse : { homeId, awayId, sources } ou { raison }.
 * `sources` : { composition: { home, away } | null, gel: [{ home, away }] , annuaire: { home, away } } — chaque
 * côté pris dans la première source qui le connaît (composition, puis gel, puis annuaire) ; si deux sources
 * le donnent différemment : « identifiantsContradictoires ». Fonction pure.
 */
export function identifiantsDeLAnalyse({ composition = null, gel = [], annuaire = null }) {
  const paires = [];
  if (composition) paires.push({ source: 'composition', home: id(composition.home), away: id(composition.away) });
  const gels = (gel ?? []).map((g) => ({ source: 'gel', home: id(g.home), away: id(g.away) }));
  paires.push(...gels);
  if (annuaire) paires.push({ source: 'annuaire', home: id(annuaire.home), away: id(annuaire.away) });
  const cote = (k) => {
    const connus = paires.filter((p) => p[k]);
    if (!connus.length) return { id: null };
    if (new Set(connus.map((p) => p[k])).size > 1) return { contradiction: true };
    return { id: connus[0][k], source: connus[0].source };
  };
  const h = cote('home');
  const a = cote('away');
  if (h.contradiction || a.contradiction) return { raison: 'identifiantsContradictoires' };
  if (!h.id || !a.id) return { raison: 'sansIdentifiant' };
  if (h.id === a.id) return { raison: 'identifiantsContradictoires' };
  return { homeId: h.id, awayId: a.id, sources: { home: h.source, away: a.source } };
}

/** Les identifiants de la composition gardée avec l'analyse (page FotMob du match, ou dernière feuille au magasin). */
export function identifiantsDeLaComposition(lineupSnapshot) {
  const l = lineupSnapshot;
  if (!l || typeof l !== 'object') return null;
  const home = id(l.home?.teamId);
  const away = id(l.away?.teamId);
  return home || away ? { home, away } : null;
}

/**
 * Les gains à mise fixe d'UN avis compté, à la cote juste du MOTEUR (1 / p, p = sa probabilité du pronostic) :
 * `a` = le moteur seul (il joue son pronostic), `b` = suivre l'IA (confirme : le même pari ; contredit :
 * l'issue contraire, à 1 / (1 − p)). Les notes du banc (gainMiseFixe). null si p est illisible.
 */
export function gainsDeLAvis({ p, realise, verdict }) {
  if (!fini(p) || !(p > 0 && p < 1) || typeof realise !== 'boolean') return null;
  const a = gainMiseFixe({ cote: 1 / p, gagne: realise });
  if (verdict === 'confirme') return { a, b: a };
  if (verdict === 'contredit') return { a, b: gainMiseFixe({ cote: 1 / (1 - p), gagne: !realise }) };
  return null;
}

/**
 * Les valeurs de clôture d'UN avis compté (q = probabilité juste du marché pour le pronostic à l'heure de
 * l'analyse, c = à la clôture) : `a` = le moteur seul (son pronostic à 1/q), `b` = suivre l'IA (confirme : le
 * même ; contredit : l'issue contraire à 1/(1 − q), clôture 1 − c). `sens` : +1 si le marché a bougé dans le
 * sens de l'IA, −1 contre elle, 0 s'il n'a pas bougé. Les notes du banc (valeurCloture). null si illisible.
 */
export function clotureDeLAvis({ q, c, verdict }) {
  if (!fini(q) || !fini(c) || !(q > 0 && q < 1) || !(c > 0 && c < 1)) return null;
  const a = valeurCloture({ cotePrise: 1 / q, probaCloture: c });
  const mouvement = Math.abs(c - q) < 1e-9 ? 0 : c > q ? 1 : -1;
  if (verdict === 'confirme') return { a, b: a, sens: mouvement };
  // −0 n'existe pas : un marché immobile vaut 0 dans les deux sens.
  if (verdict === 'contredit') return { a, b: valeurCloture({ cotePrise: 1 / (1 - q), probaCloture: 1 - c }), sens: mouvement === 0 ? 0 : -mouvement };
  return null;
}

/**
 * La DÉCISION pour un type de marché, à partir des deux jugements du moteur seul face à l'IA (`issue` : à la
 * cote juste du moteur, sur l'issue ; `cloture` : à la clôture, null pour un marché sans cote gratuite) :
 *   - « coupe » : au moins `seuil` matchs jugés, verdict « pas prouvé » (sans apport) ou « moins bon », et la
 *     clôture ne prouve pas le contraire (« retenu » à la clôture garde le marché) ;
 *   - « garde » : l'IA fait mieux au-delà du hasard (sur l'issue ou à la clôture) ;
 *   - « tropTot » : moins de `seuil` matchs jugés (« pas assez de matchs ») — JAMAIS coupé ;
 *   - « aucun » : aucun avis compté.
 */
export function decisionDuType({ issue, cloture = null, seuil = SEUIL_MATCHS_POUR_COUPER }) {
  const matchs = issue?.matchs ?? 0;
  if (!matchs) return 'aucun';
  if (issue.verdict === 'retenu' || cloture?.verdict === 'retenu') return 'garde';
  if (matchs < seuil || issue.verdict === 'pas-assez-de-matchs') return 'tropTot';
  if (issue.verdict === 'pas-prouve' || issue.verdict === 'moins-bon') return 'coupe';
  return 'tropTot';
}

/** Le juge de l'étape 16 sur des lignes appariées (a = moteur seul, b = l'IA ; plus grand = mieux). */
export function jugerFaceAuMoteur(lignes, { variantes = 1, juge = JUGE_DU_CARNET } = {}) {
  const r = comparer(
    lignes.map((l) => ({ bloc: l.bloc, match: l.bloc, cle: l.cle, a: l.a, b: l.b })),
    { mode: 'moyenne', sens: 'max', tirages: juge.tirages, graine: juge.graine, variantes: Math.max(1, variantes), alpha: juge.alpha, minBlocs: juge.minBlocs }
  );
  return {
    verdict: r.verdict,
    raison: r.raison,
    matchs: r.n.matchs,
    lignes: r.n.lignes,
    moteur: r.a.moyenne,
    ia: r.b.moyenne,
    gain: r.gain,
    fourchette: r.fourchette,
    variantes: r.seuil.variantes,
    minimum: juge.minBlocs
  };
}

/**
 * Le juge de l'étape 16 sur « réalisé face à annoncé » d'un groupe d'avis (a = la probabilité du moteur, b = 1 si
 * le pronostic s'est réalisé ; plus grand = le pronostic arrive plus souvent qu'annoncé), les pronostics d'un même
 * match tirés ensemble. Pour INFORMATION : rien n'en dépend (ni l'avis tenu, ni la coupure). null sans avis.
 */
export function jugerRealiseFaceAAnnonce(lignes, { variantes = 1, juge = JUGE_DU_CARNET } = {}) {
  if (!lignes?.length) return null;
  const r = comparer(
    lignes.map((l) => ({ bloc: l.bloc, match: l.bloc, cle: l.cle, a: l.a, b: l.b })),
    { mode: 'moyenne', sens: 'max', tirages: juge.tirages, graine: juge.graine, variantes: Math.max(1, variantes), alpha: juge.alpha, minBlocs: juge.minBlocs }
  );
  return { verdict: r.verdict, matchs: r.n.matchs, ecart: r.gain, fourchette: r.fourchette, variantes: r.seuil.variantes, minimum: juge.minBlocs };
}

// ============================================================ les comptes

function caseVide(marketType, cles = {}) {
  return {
    ...cles,
    bilan: bilanVide(marketType),
    avis: { confirme: 0, nuance: 0, contredit: 0, aucun: 0 },
    matchs: new Set(),
    matchsJuges: new Set(),
    moteurJusteSurLesAvis: 0,
    // Ce que le moteur annonçait, et ce qui est arrivé, selon l'avis de l'IA — « nuance » comprise, pour information
    // seulement : jamais comptée dans les avis tenus ni pour retirer un marché.
    annonces: { confirme: { n: 0, p: 0, realises: 0 }, nuance: { n: 0, p: 0, realises: 0 }, contredit: { n: 0, p: 0, realises: 0 } },
    cloture: { eligibles: 0, mesures: 0, dansSonSens: 0, contre: 0, immobile: 0, sommeIA: 0, sommeMoteur: 0, approx: 0, raisons: {} }
  };
}

const compter = (obj, cle, n = 1) => {
  obj[cle] = (obj[cle] ?? 0) + n;
};

/** Ajoute un cas (un pronostic commenté, réglé) à une case. */
function ajouter(caseX, k) {
  caseX.matchs.add(k.bloc);
  compter(caseX.avis, k.verdict ?? 'aucun');
  compterAuBilan(caseX.bilan, { outcome: k.realise ? 'juste' : 'faux', aiWasRight: k.tenu, aiConfidence: k.confiance });
  if (k.tenu !== null) {
    caseX.matchsJuges.add(k.bloc);
    if (k.realise) caseX.moteurJusteSurLesAvis++;
  }
  if (k.verdict && fini(k.p)) {
    const a = caseX.annonces[k.verdict];
    a.n++;
    a.p += k.p;
    if (k.realise) a.realises++;
  }
  if (k.clotureEligible) caseX.cloture.eligibles++;
  if (k.cloture) {
    const c = caseX.cloture;
    c.mesures++;
    c.sommeIA += k.cloture.b;
    c.sommeMoteur += k.cloture.a;
    if (k.cloture.approx) c.approx++;
    if (k.cloture.sens > 0) c.dansSonSens++;
    else if (k.cloture.sens < 0) c.contre++;
    else c.immobile++;
  } else if (k.raisonCloture) compter(caseX.cloture.raisons, k.raisonCloture);
}

/** Une case en JSON (les ensembles deviennent des nombres). */
function caseEnJson(c) {
  const { matchs, matchsJuges, cloture, annonces, ...reste } = c;
  const { sommeIA, sommeMoteur, raisons, ...cl } = cloture;
  return {
    ...reste,
    annonces: Object.fromEntries(Object.entries(annonces).map(([v, a]) => [v, { n: a.n, annonce: a.n ? a.p / a.n : null, realise: a.n ? a.realises / a.n : null }])),
    matchs: matchs.size,
    matchsJuges: matchsJuges.size,
    cloture: {
      ...cl,
      moyenneIA: cl.mesures ? (sommeIA / cl.mesures) * 100 : null,
      moyenneMoteur: cl.mesures ? (sommeMoteur / cl.mesures) * 100 : null,
      raisons: libellesDeCloture(raisons)
    }
  };
}

function libellesDeCloture(raisons) {
  return Object.entries(raisons)
    .map(([raison, n]) => ({ raison, libelle: RAISONS_DE_CLOTURE[raison] ?? raison, n }))
    .sort((a, b) => b.n - a.n || a.raison.localeCompare(b.raison));
}

const RANG_DU_TYPE = new Map(Object.keys(TYPES_DE_MARCHE).map((t, i) => [t, i]));

/**
 * LE CARNET à partir des cas réglés (une ligne par pronostic commenté) et des écartés : par type de marché (avec
 * les deux jugements et la décision), par type × championnat, par confiance, par forme de fiche, et le total.
 * Pur et déterministe (le juge a sa graine).
 */
/** `coupureActive` (défaut : COUPURE_ACTIVE) : faux, la règle dit ce qu'elle ferait (`seraientRetires`) et `coupes` reste vide. */
export function carnetDesCas(cas, options = {}) {
  return executerSansPause(genererLeCarnet(cas, options));
}

/** Le même calcul, en générateur : un point d'arrêt après chaque jugement (le juge tire 1 000 fois les matchs d'un type). */
function* genererLeCarnet(cas, { ecartes = {}, analyses = {}, juge = JUGE_DU_CARNET, seuil = SEUIL_MATCHS_POUR_COUPER, maintenant = Date.now(), coupureActive = COUPURE_ACTIVE } = {}) {
  const parType = new Map();
  const parLigue = new Map();
  const parFiche = new Map();
  const total = caseVide('tous', { marketType: 'tous' });
  const lignesIssue = new Map();
  const lignesCloture = new Map();
  // « Réalisé face à annoncé », par type × avis (« confirme », « nuance ») et pour tous les marchés : pour information.
  const lignesAnnonce = new Map();
  const ajouterAnnonce = (cle, k) => {
    if (!lignesAnnonce.has(cle)) lignesAnnonce.set(cle, []);
    lignesAnnonce.get(cle).push({ bloc: k.bloc, cle: k.cle, a: k.p, b: k.realise ? 1 : 0 });
  };
  for (const k of cas) {
    if (!parType.has(k.type)) parType.set(k.type, caseVide(k.type));
    ajouter(parType.get(k.type), k);
    const cleLigue = `${k.type}|${k.league ?? ''}`;
    if (!parLigue.has(cleLigue)) parLigue.set(cleLigue, caseVide(k.type, { league: k.league ?? null }));
    ajouter(parLigue.get(cleLigue), k);
    if (!parFiche.has(k.fiche)) parFiche.set(k.fiche, caseVide('tous', { fiche: k.fiche }));
    ajouter(parFiche.get(k.fiche), k);
    ajouter(total, k);
    if (k.gains) {
      if (!lignesIssue.has(k.type)) lignesIssue.set(k.type, []);
      lignesIssue.get(k.type).push({ bloc: k.bloc, cle: k.cle, ...k.gains });
    }
    if ((k.verdict === 'confirme' || k.verdict === 'nuance') && fini(k.p)) {
      ajouterAnnonce(`${k.type}|${k.verdict}`, k);
      ajouterAnnonce(`tous|${k.verdict}`, k);
    }
    if (k.cloture && k.tenu !== null) {
      if (!lignesCloture.has(k.type)) lignesCloture.set(k.type, []);
      lignesCloture.get(k.type).push({ bloc: k.bloc, cle: k.cle, a: k.cloture.a, b: k.cloture.b });
    }
  }
  // Les types qui peuvent recevoir un verdict (au moins `seuil` matchs jugés) sont jugés ENSEMBLE : la fourchette
  // de chacun s'élargit pour leur nombre (sinon, sur 11 types où l'IA n'apporte rien, l'un finirait « retenu »).
  const matchsDe = (lignes) => new Set(lignes.map((l) => l.bloc)).size;
  const jugeables = (m) => Math.max(1, [...m.values()].filter((l) => matchsDe(l) >= seuil).length);
  const mIssue = jugeables(lignesIssue);
  const mCloture = jugeables(lignesCloture);
  const mAnnonce = jugeables(lignesAnnonce);
  /** Les annonces d'une case, avec le juge « réalisé face à annoncé » pour « confirme » et « nuance ». */
  const avecJuges = (annonces, cle) =>
    Object.fromEntries(
      Object.entries(annonces).map(([v, a]) => [v, v === 'confirme' || v === 'nuance' ? { ...a, juge: jugerRealiseFaceAAnnonce(lignesAnnonce.get(`${cle}|${v}`), { variantes: mAnnonce, juge }) } : a])
    );
  yield 'les comptes du carnet';
  const types = [];
  for (const type of [...parType.keys()].sort((a, b) => (RANG_DU_TYPE.get(a) ?? 99) - (RANG_DU_TYPE.get(b) ?? 99))) {
    const c = caseEnJson(parType.get(type));
    const li = lignesIssue.get(type) ?? [];
    const lc = lignesCloture.get(type) ?? [];
    const issue = li.length ? jugerFaceAuMoteur(li, { variantes: mIssue, juge }) : null;
    yield 'le juge, sur l’issue';
    const cloture = TYPES_AVEC_CLOTURE.includes(type) && lc.length ? jugerFaceAuMoteur(lc, { variantes: mCloture, juge }) : null;
    if (cloture) yield 'le juge, à la clôture';
    const etat = decisionDuType({ issue, cloture, seuil });
    // `etat` : ce que dit la règle ; `retire` : ce qui est fait (rien tant que la coupure est désactivée).
    const retire = etat === 'coupe' && coupureActive;
    const etiquette = etat === 'coupe' && !coupureActive ? ETATS.seraitRetire : ETATS[etat];
    types.push({ marketType: type, label: TYPES_DE_MARCHE[type] ?? type, avecCloture: TYPES_AVEC_CLOTURE.includes(type), ...c, annonces: avecJuges(c.annonces, type), juge: { issue, cloture }, etat, retire, etiquette });
    yield 'le juge, réalisé face à annoncé';
  }
  const etatDe = new Map(types.map((t) => [t.marketType, t.etat]));
  const parChampionnat = [...parLigue.values()]
    .map(caseEnJson)
    .map((c) => ({ ...c, marketType: c.bilan.marketType, label: c.bilan.label, etat: etatDe.get(c.bilan.marketType) ?? 'aucun', retire: coupureActive && etatDe.get(c.bilan.marketType) === 'coupe' }))
    .sort((a, b) => (RANG_DU_TYPE.get(a.marketType) ?? 99) - (RANG_DU_TYPE.get(b.marketType) ?? 99) || b.matchsJuges - a.matchsJuges || String(a.league).localeCompare(String(b.league)));
  const tot = caseEnJson(total);
  const parConfiance = NIVEAUX.map((niveau) => ({ niveau, verdicts: tot.bilan.byConfidence[niveau]?.verdicts ?? 0, right: tot.bilan.byConfidence[niveau]?.right ?? 0 }));
  const fiches = [...parFiche.values()].map(caseEnJson).map((c) => ({ ...c, libelle: FICHES_DU_CARNET[c.fiche] ?? c.fiche }));
  // Ce que la règle retirerait, et ce qui est retiré : rien tant que la coupure est désactivée.
  const seraientRetires = types.filter((t) => t.etat === 'coupe').map((t) => t.marketType);
  const coupes = coupureActive ? seraientRetires : [];
  return {
    version: VERSION_CARNET,
    calculeLe: new Date(maintenant).toISOString(),
    depuis: DEPUIS,
    seuil,
    juge: { ...juge, variantesIssue: mIssue, variantesCloture: mCloture, variantesAnnonce: mAnnonce },
    analyses,
    types,
    parChampionnat,
    parConfiance,
    parFiche: fiches.sort((a, b) => String(a.fiche).localeCompare(String(b.fiche))),
    total: { ...tot, annonces: avecJuges(tot.annonces, 'tous'), label: 'Tous les marchés' },
    typeArgument: TYPE_ARGUMENT,
    ecartes: Object.entries(ecartes)
      .map(([raison, n]) => ({ raison, libelle: RAISONS_DU_CARNET[raison] ?? raison, n }))
      .sort((a, b) => b.n - a.n || a.raison.localeCompare(b.raison)),
    coupureActive,
    seraientRetires,
    coupes,
    provenance: PROVENANCE
  };
}

// ============================================================ la lecture des analyses

/**
 * Le moment de l'analyse de référence (celle qui a donné les avis) : `analysedAt`, sinon `createdAt` (une analyse
 * d'avant ce champ était la seule du match) — jamais `updatedAt`, que la revue d'après-match repousse après le match.
 */
const heureDeLAnalyse = (e) => e.analysedAt ?? e.createdAt ?? null;

/**
 * LES CAS, en générateur (il rend la main aux `yield`) : chaque pronostic commenté d'une analyse de
 * référence, rattaché, réglé et mesuré à la clôture — ou sa raison d'être écarté. N'écrit RIEN.
 * `analyses` : la liste des analyses ; `database` : la base (lecture seule).
 */
export function* casDesAnalyses(analyses, { database, maintenant = Date.now(), avecCloture = true } = {}) {
  const ecartes = {};
  const cas = [];
  const comptes = { lues: 0, avecAvis: 0, reglees: 0, aVenir: 0 };
  const gelDuMatch = database.prepare('SELECT DISTINCT home_id AS home, away_id AS away FROM engine_picks WHERE match_id = ? AND home_id IS NOT NULL AND away_id IS NOT NULL');
  const memoClub = new Map();
  const club = (nom, league) => {
    const cle = `${league}|${nom}`;
    if (!memoClub.has(cle)) {
      let r = null;
      try {
        r = clubDuMagasin(nom, league, database);
      } catch {
        r = null;
      }
      memoClub.set(cle, r);
    }
    return memoClub.get(cle);
  };
  const ctxCloture = contexteDeMesure(database);
  const ecarter = (raison, n) => compter(ecartes, raison, n);

  // 1. Les analyses de référence, rangées par mois du coup d'envoi (un lecteur des rencontres par mois : la mémoire reste bornée).
  const parMois = new Map();
  for (const e of analyses ?? []) {
    comptes.lues++;
    const views = Array.isArray(e?.analysis?.marketViews) ? e.analysis.marketViews : [];
    if (!views.length) continue;
    comptes.avecAvis++;
    const pronostics = Array.isArray(e.engineSnapshot?.marketPredictions) ? e.engineSnapshot.marketPredictions : [];
    if (!pronostics.length) {
      ecarter('sansPronostics', views.length);
      continue;
    }
    const ko = instant(e.commenceTime);
    if (ko === null) {
      // La règle du 30/09 d'abord (elle dit pourquoi la plupart de ces anciennes analyses ne comptent pas), puis le jour.
      for (const p of pronostics) ecarter(p?.minOdds ? 'sansDate' : 'avantLaRegle');
      continue;
    }
    const mois = jourUtc(ko).slice(0, 7);
    if (!parMois.has(mois)) parMois.set(mois, []);
    parMois.get(mois).push(e);
  }
  yield 'analyses de l’IA';

  // 2. Chaque analyse rattachée à SA rencontre du magasin, par les identifiants FotMob de ses clubs.
  const parRencontre = new Map();
  for (const mois of [...parMois.keys()].sort()) {
    const du = `${mois}-01`;
    const fin = new Date(Date.UTC(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const lire = yield* lecteurDesRencontres(database, { du, au: fin });
    for (const e of parMois.get(mois)) {
      // Un point d'arrêt par analyse : l'annuaire se lit à froid la première fois (des dizaines de millisecondes).
      yield 'analyse rattachée';
      const pronostics = e.engineSnapshot.marketPredictions;
      const avis = rattacherAuxMarches(e.analysis.marketViews, pronostics);
      // Seuls les pronostics sous la règle du 30/09 (cote minimale 1,20) comptent, comme dans aiMarketExperience.
      const retenus = [];
      pronostics.forEach((p, i) => {
        if (!p || typeof p !== 'object') return;
        const type = typeDeMarche(p);
        if (!type) return ecarter('typeInconnu');
        if (!p.minOdds) return ecarter('avantLaRegle');
        retenus.push({ p, type, avis: avis[i] ?? null, index: i });
      });
      if (!retenus.length) continue;
      const ko = instant(e.commenceTime);
      if (ko > maintenant) {
        comptes.aVenir++;
        ecarter('aVenir', retenus.length);
        continue;
      }
      const ids = identifiantsDeLAnalyse({
        composition: identifiantsDeLaComposition(e.lineupSnapshot),
        gel: e.matchId ? gelDuMatch.all(String(e.matchId)).map((g) => ({ home: g.home, away: g.away })) : [],
        annuaire: { home: club(e.homeName, e.league), away: club(e.awayName, e.league) }
      });
      if (ids.raison) {
        ecarter(ids.raison, retenus.length);
        continue;
      }
      // La rencontre au magasin (le jour exact, sinon à un jour près, jamais deux), son règlement.
      const rencontre = lire({ homeId: ids.homeId, awayId: ids.awayId, date: jourUtc(ko) });
      if (rencontre.raison) {
        ecarter(rencontre.raison, retenus.length);
        continue;
      }
      const coupDEnvoi = instant(rencontre.coupDEnvoi) ?? ko;
      const heure = instant(heureDeLAnalyse(e));
      if (heure === null || heure >= coupDEnvoi) {
        ecarter('apresCoupDEnvoi', retenus.length);
        continue;
      }
      // Deux analyses pour la même rencontre (deux identifiants d'appli, un match déplacé) : seule la plus récente
      // avant le coup d'envoi compte — la mieux renseignée, comme l'analyse de référence d'un match.
      const ancienne = parRencontre.get(rencontre.matchKey);
      if (ancienne && ancienne.heure >= heure) {
        ecarter('doublon', retenus.length);
        continue;
      }
      if (ancienne) ecarter('doublon', ancienne.retenus.length);
      parRencontre.set(rencontre.matchKey, { e, retenus, ids, rencontre, coupDEnvoi, heure });
    }
    yield 'rencontres du mois';
  }

  // 3. Le règlement de chaque pronostic commenté, et sa clôture.
  for (const { e, retenus, ids, rencontre, coupDEnvoi, heure } of parRencontre.values()) {
    comptes.reglees++;
    const fiche = e.fiche === 'compacte' ? 'compacte' : 'ancienne';
    for (const { p, type, avis: a, index } of retenus) {
      const pick = { choice: p.predictedOutcome, params: p.params ?? {}, marketId: p.marketId ?? type, market: p.market, label: p.predictedLabel, homeName: e.homeName, awayName: e.awayName };
      const r = issueDuPronostic(pick, rencontre.reglement);
      if (r.raison) {
        ecarter(r.raison);
        continue;
      }
      const verdict = ['confirme', 'nuance', 'contredit'].includes(a?.verdict) ? a.verdict : null;
      const confiance = NIVEAUX.includes(a?.confidence) ? a.confidence : null;
      const tenu = verdict ? avisTenu(verdict, r.realise) : null;
      const prob = Number(p.predictedOdds) > 1 ? 1 / Number(p.predictedOdds) : null;
      const k = {
        bloc: rencontre.matchKey,
        cle: `${rencontre.matchKey}|${cleDuMarche({ ...p, marketId: p.marketId ?? type })}`,
        date: rencontre.date,
        league: e.league ?? null,
        type,
        fiche,
        verdict,
        confiance,
        realise: r.realise,
        // La probabilité du moteur pour son pronostic (1 / cote juste) : celle que l'avis de l'IA confirme ou contredit.
        p: prob,
        tenu,
        gains: tenu === null ? null : gainsDeLAvis({ p: prob, realise: r.realise, verdict }),
        clotureEligible: TYPES_AVEC_CLOTURE.includes(type) && tenu !== null,
        cloture: null,
        raisonCloture: null,
        // Étape 44 (la mémoire de l'IA) : de quoi rattacher la LEÇON écrite après ce match à ce cas — l'analyse, la place du
        // pronostic dans ses pronostics gardés (celle de son bilan d'après-match), le marché, et les identifiants FotMob des
        // clubs déjà trouvés ici (jamais une seconde lecture par les noms). Le carnet n'en lit rien : ses comptes ne changent pas.
        matchId: e.matchId ?? null,
        index,
        market: p.market ?? null,
        pick: p.predictedLabel ?? null,
        marche: cleDuMarche({ ...p, marketId: p.marketId ?? type }),
        equipe: p.params?.team === 'home' || p.params?.team === 'away' ? p.params.team : null,
        homeId: ids.homeId,
        awayId: ids.awayId
      };
      // 4. La clôture : seulement un avis compté, sur un marché à cotes gratuites (étape 44 : pas demandée par les dossiers).
      if (k.clotureEligible && avecCloture) {
        const m = mesurerUneEntree(
          {
            marketId: type,
            params: p.params ?? {},
            predictedOutcome: p.predictedOutcome,
            homeName: e.homeName,
            awayName: e.awayName,
            league: e.league,
            commenceTime: new Date(coupDEnvoi).toISOString(),
            pickAt: new Date(heure).toISOString(),
            day: rencontre.date,
            idsDuMagasin: { home: ids.homeId, away: ids.awayId }
          },
          ctxCloture
        );
        const v = m.raison ? null : clotureDeLAvis({ q: m.pickProb, c: m.closeProb, verdict });
        if (v) k.cloture = { ...v, approx: Boolean(m.approx) };
        else k.raisonCloture = m.raison ?? 'marcheAbsent';
        yield 'valeur de clôture';
      }
      cas.push(k);
    }
    yield 'analyse réglée';
  }
  return { cas, ecartes, comptes };
}

/**
 * LE CALCUL COMPLET, en générateur : les analyses (listAll, ou `analyses` fourni), les cas, le carnet.
 * N'écrit rien (cf. calculerEtEcrireLeCarnet).
 */
export function* travailDuCarnet({ analyses = null, database = openDb(), maintenant = Date.now(), juge = JUGE_DU_CARNET, seuil = SEUIL_MATCHS_POUR_COUPER, coupureActive = COUPURE_ACTIVE } = {}) {
  const liste = analyses ?? listAll();
  yield 'lecture des analyses';
  const { cas, ecartes, comptes } = yield* casDesAnalyses(liste, { database, maintenant });
  yield 'les comptes';
  const carnet = yield* genererLeCarnet(cas, { ecartes, analyses: comptes, juge, seuil, maintenant, coupureActive });
  return { carnet, cas };
}

/** Le carnet calculé d'une traite (essais, scripts) : { carnet, cas }. */
export function calculerLeCarnet(options = {}) {
  return executerSansPause(travailDuCarnet(options));
}

// ============================================================ le fichier

/** Le carnet écrit par la nuit : { etat: 'absent' | 'illisible' | 'lu', carnet, erreur }. Ne lève jamais. */
export function lireLeCarnet({ fichier = FICHIER_CARNET } = {}) {
  let carnet;
  try {
    carnet = readJsonFile(fichier, null);
  } catch (error) {
    return { etat: 'illisible', carnet: null, erreur: error.message };
  }
  if (carnet === null) return { etat: 'absent', carnet: null, erreur: null };
  if (!carnet || typeof carnet !== 'object' || !Array.isArray(carnet.types)) return { etat: 'illisible', carnet: null, erreur: 'carnet de forme inconnue' };
  return { etat: 'lu', carnet, erreur: null };
}

/**
 * LES TYPES DE MARCHÉ COUPÉS, pour l'analyse d'avant-match (matchAiAnalysisService.js) : un Set, vide si le
 * carnet est absent, illisible, d'une autre forme ou calculé avec un autre seuil (il sera refait la nuit
 * suivante). Ne lève JAMAIS : une analyse ne doit pas échouer pour son carnet.
 */
export function lireLesMarchesCoupes({ fichier = FICHIER_CARNET, coupureActive = COUPURE_ACTIVE } = {}) {
  // La coupure désactivée : rien n'est retiré, quel que soit le fichier (même un carnet écrit coupure active).
  if (!coupureActive) return new Set();
  try {
    const { etat, carnet } = lireLeCarnet({ fichier });
    if (etat !== 'lu' || carnet.version !== VERSION_CARNET || carnet.seuil !== SEUIL_MATCHS_POUR_COUPER || carnet.coupureActive !== true) return new Set();
    return new Set((carnet.coupes ?? []).filter((t) => typeof t === 'string' && Object.hasOwn(TYPES_DE_MARCHE, t)));
  } catch {
    return new Set();
  }
}

/**
 * L'étape de la nuit : le carnet recalculé en entier (en rendant la main au serveur), puis écrit d'un bloc par
 * atomicJson. Rend { carnet, dureeMs, blocMaxMs, coupesAvant, nouvellesCoupes }.
 */
export async function calculerEtEcrireLeCarnet({ database = openDb(), maintenant = Date.now(), pauses = creerPauses(), fichier = FICHIER_CARNET, analyses = null, coupureActive = COUPURE_ACTIVE } = {}) {
  const debut = performance.now();
  const avant = lireLesMarchesCoupes({ fichier, coupureActive });
  const { carnet, cas } = await executerEnRendantLaMain(travailDuCarnet({ analyses, database, maintenant, coupureActive }), pauses.siLongtemps);
  writeJsonAtomic(fichier, carnet);
  const b = pauses.bilan();
  // `cas` (étape 44) : les cas réglés de cette nuit, que l'étape « dossiersIA » qui suit reprend au lieu de tout relire.
  return { carnet, cas, dureeMs: Math.round(performance.now() - debut), blocMaxMs: b.blocMaxMs, coupesAvant: [...avant], nouvellesCoupes: carnet.coupes.filter((t) => !avant.has(t)) };
}

/** Ce que rend la route GET /api/match-ai/scorecard : le carnet tel qu'écrit par la nuit, et les règles fixes. */
export function carnetPourLaRoute({ fichier = FICHIER_CARNET } = {}) {
  const { etat, carnet, erreur } = lireLeCarnet({ fichier });
  return {
    etat,
    erreur,
    carnet,
    aJour: etat === 'lu' && carnet.version === VERSION_CARNET && carnet.seuil === SEUIL_MATCHS_POUR_COUPER && carnet.coupureActive === COUPURE_ACTIVE,
    coupureActive: COUPURE_ACTIVE,
    decisionEnAttente: COUPURE_ACTIVE ? null : DECISION_EN_ATTENTE,
    seuil: SEUIL_MATCHS_POUR_COUPER,
    version: VERSION_CARNET,
    depuis: DEPUIS,
    typesDeMarche: Object.entries(TYPES_DE_MARCHE).map(([marketType, label]) => ({ marketType, label, avecCloture: TYPES_AVEC_CLOTURE.includes(marketType) })),
    typeArgument: TYPE_ARGUMENT,
    etats: ETATS,
    provenance: PROVENANCE
  };
}
