/**
 * essaiCandidate.js — L'ESSAI À BLANC d'une version candidate, prêt pour le juge (étape 25 du plan, seconde moitié, 14/10/2026).
 * -----------------------------------------------------------------------
 * Une candidate (core/engine/engineVersions.js) est calculée à blanc chaque
 * nuit à côté de la version en service (data/enregistreurs/moteurABlanc.js) :
 * pour chaque match à venir et chaque marché qu'elle change, les DEUX
 * distributions sur la même ligne (table engine_candidate_picks). Une fois les
 * matchs joués, ce fichier en fait les LIGNES APPARIÉES du juge de l'étape 16
 * (guard.js, jugerEtape) :
 *   - la révision retenue de chaque match × marché est la DERNIÈRE gelée avant
 *     le coup d'envoi (revisionsRetenues de la calibration, étape 20 : coup
 *     d'envoi du magasin, sinon celui du gel ; inconnu, seulement les
 *     révisions d'avant le jour du match) ;
 *   - le match est réglé comme la calibration et le banc d'essai (le règlement
 *     de la rencontre du magasin, issueDuPronostic : score de la 90e minute,
 *     match attribué écarté, corners ou tirs non relevés écartés) ;
 *   - chaque version est notée par LA note du banc (metrics.js, perteLog) sur
 *     SA distribution : a = la version en service, b = la candidate ; plus
 *     petit = mieux ;
 *   - seules comptent les lignes de CETTE candidate (son empreinte) calculées
 *     face à CETTE version en service (celle du début de l'essai) : une
 *     candidate modifiée ou une version en service changée recommencent
 *     l'essai, rien n'est mélangé.
 * Le juge ne voit QUE des matchs joués après le début de l'essai : le
 * lancement qu'on lui passe est celui de l'essai (lancementDeLEssai), daté du
 * jour de Paris de sa mise à blanc ; les données déjà vues (DONNEES_VUES) et
 * les variantes déclarées au registre de la mesure sont les siennes.
 *
 * L'HORIZON (l'arrêt optionnel, guard.js) : regarder chaque nuit et adopter au
 * premier « retenu » fabriquerait de fausses preuves. Le jugement qui décide
 * est donc pris UNE fois, à un horizon fixé d'avance — assez de matchs joués
 * (600 par défaut, jamais moins que le minimum du juge, 200) ET assez de jours
 * (14 par défaut, au moins 7 : plusieurs journées de championnat). Avant, la
 * carte montre les premiers chiffres, sans verdict.
 *
 * Pur : ne lit ni base ni fichier ; `lire` (la rencontre d'un match) vient de
 * l'appelant. Aucun hasard.
 *
 * RENDRE LA MAIN (24/10/2026) : la nuit du 23 au 24/10, l'essai jugé tenait le
 * serveur de Pierre d'un seul tenant — à 800 matchs joués, mesuré sur un essai
 * fabriqué : ~460 ms pour les lignes de l'essai, ~230 ms pour le témoin du score,
 * ~140 ms pour les compléments, sans compter la relecture de la table. Les trois
 * existent donc aussi en GÉNÉRATEURS (…ParEtapes : mêmes calculs, dans le même
 * ordre, avec des points d'arrêt `yield` entre deux groupes de lignes ou deux
 * juges ; cf. utils/travailCooperatif.js) ; les fonctions d'avant les exécutent
 * sans pause (executerSansPause) : mêmes résultats, mêmes appels.
 * -----------------------------------------------------------------------
 */

import { perteLog, PROBA_MIN } from './metrics.js';
import { issueDuPronostic, revisionsRetenues, jugerLaCase } from '../data/calibration.js';
import { horizonAtteint } from './horizonEssai.js';
import { comparer } from './guard.js';
import { executerSansPause } from '../utils/travailCooperatif.js';

/** Un point d'arrêt tous les tant de groupes (match × marché) ou de matchs : quelques millisecondes de travail chacun. */
const GROUPES_PAR_ARRET = 100;
const REVISIONS_PAR_ARRET = 2000;
const MATCHS_PAR_ARRET = 50;

/** La note du juge pour l'essai : la perte log (metrics.js), celle du banc d'essai et de la note de départ. */
export const MESURE_DE_L_ESSAI = 'perte-log';
export { HORIZON_PAR_DEFAUT, HORIZON_MINIMUM, horizonDe, horizonAtteint, lancementDeLEssai, jourParis } from './horizonEssai.js';

/** Pourquoi une ligne à blanc n'entre pas dans le jugement : chaque raison comptée, jamais en silence. */
export const RAISONS_DE_L_ESSAI = Object.freeze({
  autreEmpreinte: 'Calculée par une version précédente de la candidate (modifiée depuis)',
  autreVersionEnService: 'Calculée face à une autre version en service que celle de l’essai',
  sansDistribution: 'Une des deux distributions manque',
  issueAbsente: 'L’issue réalisée n’est pas dans la distribution (ligne illisible)',
  sansIdentifiant: 'Club reconnu par son nom seulement : la rencontre ne se lit pas au magasin',
  sansResultat: 'Résultat absent du magasin (match reporté, pas encore importé, ou introuvable)',
  rencontreAmbigue: 'Deux rencontres possibles au magasin : aucune n’est prise au hasard',
  sansScore: 'Rencontre au magasin sans score',
  attribue: 'Match attribué sur tapis vert : rien à régler',
  prolongationSansScore90: 'Match prolongé sans le score de la 90e minute',
  prolongationStats: 'Match prolongé : ses corners et ses tirs couvrent 120 minutes',
  statNonRelevee: 'Corners ou tirs non relevés au magasin',
  nonReglable: 'Aucune règle de règlement pour cette ligne',
  apresCoupDEnvoi: 'Calculée après le coup d’envoi',
  heureInconnue: 'Calculée le jour du match, heure du coup d’envoi inconnue'
});

const compter = (obj, cle, n = 1) => {
  obj[cle] = (obj[cle] ?? 0) + n;
};
const moyenne = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);

// ------------------------------------------------------------ le règlement d'une ligne

/** Le nom de marché que le règlement reconnaît pour les marchés sans paramètre (settlementRules.js). */
const MARCHE_DU_REGLEMENT = Object.freeze({ result: 'Résultat', bothTeamsScore: 'Les 2 équipes marquent', resultAndTotal: 'Résultat + Total buts' });

/**
 * L'issue RÉALISÉE d'une ligne à blanc (son marché, la ligne et l'équipe de sa distribution), d'après le règlement
 * de la rencontre — par la règle de la calibration (issueDuPronostic), jamais une règle à part. Rend { issue }
 * (une clé des issues de la distribution : home/draw/away, over/under, yes/no, homeOver…) ou { raison }.
 */
export function issueDeLaLigne({ marketId, distribution }, reglement) {
  const ligne = Number.isFinite(distribution?.ligne) ? distribution.ligne : null;
  const equipe = distribution?.equipe === 'home' || distribution?.equipe === 'away' ? distribution.equipe : null;
  const params = { ...(ligne !== null ? { line: ligne } : {}), ...(equipe ? { team: equipe } : {}) };
  const pseudo = {
    choice: '—',
    marketId,
    market: MARCHE_DU_REGLEMENT[marketId] ?? '',
    label: marketId === 'resultAndTotal' && ligne !== null ? `Plus de ${ligne} buts` : null,
    params,
    homeName: null,
    awayName: null
  };
  const r = issueDuPronostic(pseudo, reglement);
  return r.raison ? { raison: r.raison } : { issue: r.issue };
}

const lireDistribution = (texte) => {
  if (!texte) return null;
  try {
    const d = typeof texte === 'string' ? JSON.parse(texte) : texte;
    return d && typeof d === 'object' && d.issues && typeof d.issues === 'object' ? d : null;
  } catch {
    return null;
  }
};

// ------------------------------------------------------------ les lignes du juge

/**
 * LES LIGNES DE L'ESSAI. `revisions` : toutes les lignes à blanc de la candidate (pronosticsABlanc). Options :
 * `empreinte` (celle de la candidate en essai), `versionEnService` (celle du début de l'essai), `lire({ fixtureKey,
 * homeId, awayId, date })` → la rencontre du magasin ({ coupDEnvoi, reglement } ou { raison }), `aujourdhui`
 * (jour UTC : un match d'après, ou d'aujourd'hui sans résultat, est « à venir », jamais écarté).
 * Rend { lignes, ecartees, aVenir: { pronostics, matchs }, parMarche } ; chaque match × marché est exactement
 * une chose : une ligne, écarté (sa raison) ou à venir.
 */
export function lignesDeLEssai(revisions, options) {
  return executerSansPause(lignesDeLEssaiParEtapes(revisions, options));
}

/** LES LIGNES DE L'ESSAI, en générateur (mêmes options, même résultat) : un `yield` tous les GROUPES_PAR_ARRET groupes. */
export function* lignesDeLEssaiParEtapes(revisions, { empreinte, versionEnService, lire, aujourdhui }) {
  const groupes = new Map();
  let vues = 0;
  for (const r of revisions ?? []) {
    const cle = `${r.fixtureKey}|${r.marketKey}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(r);
    if (++vues % REVISIONS_PAR_ARRET === 0) yield 'lignes de l’essai';
  }
  const lignes = [];
  const ecartees = {};
  const aVenir = { pronostics: 0, matchs: new Set() };
  const rencontres = new Map();
  let k = 0;
  for (const [cle, revs] of groupes) {
    if (++k % GROUPES_PAR_ARRET === 0) yield 'lignes de l’essai';
    const premiere = revs[0];
    const deCetteCandidate = revs.filter((r) => r.candidateHash === empreinte);
    if (!deCetteCandidate.length) {
      compter(ecartees, 'autreEmpreinte');
      continue;
    }
    const faceAuService = deCetteCandidate.filter((r) => r.serviceVersion === versionEnService);
    if (!faceAuService.length) {
      compter(ecartees, 'autreVersionEnService');
      continue;
    }
    const futur = premiere.date > aujourdhui;
    let rencontre = rencontres.get(premiere.fixtureKey);
    if (!rencontre) {
      rencontre = futur ? { aVenir: true } : lire({ fixtureKey: premiere.fixtureKey, homeId: premiere.homeId, awayId: premiere.awayId, date: premiere.date });
      if (rencontre.raison && !futur && premiere.date >= aujourdhui && (rencontre.raison === 'sansResultat' || rencontre.raison === 'sansScore')) rencontre = { aVenir: true };
      rencontres.set(premiere.fixtureKey, rencontre);
    }
    if (rencontre.aVenir) {
      aVenir.pronostics++;
      aVenir.matchs.add(premiere.fixtureKey);
      continue;
    }
    const retenues = revisionsRetenues(
      faceAuService.map((r) => ({ ...r, version: r.revision })),
      { coupDEnvoi: rencontre.coupDEnvoi ?? faceAuService.find((r) => r.kickoff)?.kickoff ?? null, jour: premiere.date }
    );
    const r = retenues.derniere;
    if (!r) {
      compter(ecartees, retenues.raisonDerniere ?? 'heureInconnue');
      continue;
    }
    if (rencontre.raison) {
      compter(ecartees, rencontre.raison);
      continue;
    }
    const da = lireDistribution(r.serviceDistribution);
    const db = lireDistribution(r.distribution);
    if (!da || !db) {
      compter(ecartees, 'sansDistribution');
      continue;
    }
    const reglee = issueDeLaLigne({ marketId: r.marketId, distribution: db }, rencontre.reglement);
    if (reglee.raison) {
      compter(ecartees, reglee.raison);
      continue;
    }
    if (!Object.hasOwn(da.issues, reglee.issue) || !Object.hasOwn(db.issues, reglee.issue)) {
      compter(ecartees, 'issueAbsente');
      continue;
    }
    let a;
    let b;
    try {
      a = perteLog(da.issues, reglee.issue);
      b = perteLog(db.issues, reglee.issue);
    } catch {
      compter(ecartees, 'issueAbsente');
      continue;
    }
    // Étape 27 : de quoi rapporter la calibration du pronostic retenu de chaque version (sur SA ligne : la candidate
    // par sa distribution ; la version en service par sa probabilité gelée, 1/cote juste arrondie), et le régime
    // (provenance) du modèle de buts de la candidate.
    const calibB = r.choice !== null && r.choice !== undefined && Object.hasOwn(db.issues, r.choice) ? { p: db.issues[r.choice], realise: reglee.issue === r.choice } : null;
    lignes.push({
      bloc: r.fixtureKey,
      match: r.fixtureKey,
      cle,
      date: r.date,
      marketId: r.marketId,
      issue: reglee.issue,
      a: a.valeur,
      b: b.valeur,
      ecreteeA: a.ecretee,
      ecreteeB: b.ecretee,
      ligne: Number.isFinite(db.ligne) ? db.ligne : null,
      provenance: typeof db.provenance === 'string' ? db.provenance : null,
      calibB,
      calibA: calibrationDuService(r, rencontre.reglement)
    });
  }
  return { lignes, ecartees, aVenir: { pronostics: aVenir.pronostics, matchs: aVenir.matchs.size }, parMarche: parMarche(lignes) };
}

/** Le pronostic de la version en service sur SA ligne, réglé (issueDuPronostic) : { p (probabilité gelée), realise } ou null. */
function calibrationDuService(r, reglement) {
  const p = Number(r.serviceProbability);
  if (!(p > 0 && p < 1) || r.serviceChoice === null || r.serviceChoice === undefined) return null;
  let params = null;
  try {
    params = r.serviceParams ? JSON.parse(r.serviceParams) : {};
  } catch {
    return null;
  }
  const ligne = Number(params?.line);
  const x = issueDuPronostic(
    { choice: r.serviceChoice, marketId: r.marketId, market: MARCHE_DU_REGLEMENT[r.marketId] ?? '', label: r.marketId === 'resultAndTotal' && Number.isFinite(ligne) ? `Plus de ${ligne} buts` : null, params, homeName: null, awayName: null },
    reglement
  );
  return x.raison ? null : { p, realise: x.realise };
}

// ------------------------------------------------------------ étape 27 : familles, calibration, régimes, témoins

/** Le nom d'une case de la porte de sûreté : le plus/moins 2,5 et les deux marquent. */
const CASES_DE_SURETE = Object.freeze([
  Object.freeze({ cle: 'totalGoals|2.5', garder: (l) => l.marketId === 'totalGoals' && l.ligne === 2.5 }),
  Object.freeze({ cle: 'bothTeamsScore', garder: (l) => l.marketId === 'bothTeamsScore' })
]);

/** La calibration rapportée d'une liste de pronostics retenus : biais (réalisé − annoncé), ECE par dixième, juge de l'étape 20. */
function calibrationRapportee(lignes, variantes) {
  if (!lignes.length) return null;
  let somme = 0;
  const dn = new Float64Array(10);
  const de = new Float64Array(10);
  for (const l of lignes) {
    somme += (l.realise ? 1 : 0) - l.p;
    const d = Math.min(9, Math.max(0, Math.floor(l.p * 10)));
    dn[d]++;
    de[d] += (l.realise ? 1 : 0) - l.p;
  }
  let ece = 0;
  for (let d = 0; d < 10; d++) if (dn[d]) ece += Math.abs(de[d]);
  const j = jugerLaCase(lignes, { variantes });
  return { pronostics: lignes.length, matchs: j.matchs, biais: nombre(somme / lignes.length), ece: nombre(ece / lignes.length), verdict: j.verdict, variantes: j.variantes ?? variantes };
}

/**
 * Ce que l'étape 27 ajoute au jugement de l'essai, toujours RAPPORTÉ à côté du jugement principal : le juge par
 * FAMILLE (même K) ; la calibration du pronostic retenu de chaque version par famille (juge de l'étape 20, même K :
 * rapportée seulement) ; la porte de SÛRETÉ de la candidate à K = 1 (plus/moins 2,5, les deux marquent) ; les
 * régimes du modèle de buts (matchs par provenance). `reglement` : lignesDeLEssai.
 */
export function complementsDeLEssai(reglement, options = {}) {
  return executerSansPause(complementsDeLEssaiParEtapes(reglement, options));
}

/** Les compléments de l'essai, en générateur (mêmes options, même résultat) : un `yield` après chaque juge. */
export function* complementsDeLEssaiParEtapes(reglement, { variantes = 1, graine = 1, tirages = 1000 } = {}) {
  const parFamille = {};
  const familles = new Map();
  for (const l of reglement.lignes) {
    if (!familles.has(l.marketId)) familles.set(l.marketId, []);
    familles.get(l.marketId).push(l);
  }
  yield 'compléments de l’essai';
  for (const [famille, ls] of familles) {
    const j = comparer(ls.map((l) => ({ bloc: l.bloc, match: l.match, cle: l.cle, a: l.a, b: l.b })), { mode: 'moyenne', sens: 'min', variantes, graine, tirages });
    const echelle = Number.isFinite(j.a.moyenne) && j.a.moyenne !== 0 ? 100 / Math.abs(j.a.moyenne) : 100;
    parFamille[famille] = {
      lignes: j.n.lignes,
      matchs: j.n.matchs,
      a: nombre(j.a.moyenne),
      b: nombre(j.b.moyenne),
      gainPct: Number.isFinite(j.gain) ? nombre(j.gain * echelle, 3) : null,
      fourchettePct: Array.isArray(j.fourchette) ? j.fourchette.map((x) => nombre(x * echelle, 3)) : null,
      verdict: j.verdict,
      variantes: j.seuil?.variantes ?? variantes
    };
    yield 'compléments de l’essai';
  }
  function* calib(cote) {
    const out = {};
    for (const [famille, ls] of familles) {
      const c = ls.filter((l) => l[cote]).map((l) => ({ fixtureKey: l.bloc, cle: l.cle, p: l[cote].p, realise: l[cote].realise }));
      out[famille] = calibrationRapportee(c, variantes);
      yield 'compléments de l’essai';
    }
    return out;
  }
  const calibA = yield* calib('calibA');
  const calibB = yield* calib('calibB');
  const surete = {};
  for (const s of CASES_DE_SURETE) {
    const c = reglement.lignes.filter((l) => s.garder(l) && l.calibB).map((l) => ({ fixtureKey: l.bloc, cle: l.cle, p: l.calibB.p, realise: l.calibB.realise }));
    surete[s.cle] = calibrationRapportee(c, 1);
    yield 'compléments de l’essai';
  }
  const regimes = {};
  const vus = new Set();
  for (const l of reglement.lignes) {
    if (!l.provenance || vus.has(l.bloc)) continue;
    vus.add(l.bloc);
    regimes[l.provenance] = (regimes[l.provenance] ?? 0) + 1;
  }
  return { parFamille, calibration: { a: calibA, b: calibB }, surete, regimes, matchsAvecRegime: vus.size };
}

/** La distribution gelée d'un TÉMOIN « score exact » : les 81 cases (« h-a ») et la masse hors de la grille, 6 décimales. */
export function distributionDuScore(cases, horsGrille = 0) {
  const p6 = (x) => (Number.isFinite(x) ? Number(x.toFixed(6)) : null);
  const issues = {};
  for (let k = 0; k < cases.length; k++) issues[`${Math.floor(k / 9)}-${k % 9}`] = p6(cases[k]);
  return { issues, horsGrille: p6(horsGrille) };
}

/**
 * LE TÉMOIN DU SCORE EXACT de l'essai (étape 27, `temoins: ['scoreExact']`) : rapporté, JAMAIS jugé — la dernière
 * révision avant le coup d'envoi de chaque match, réglée au score de la 90e minute ; un score hors des 81 cases vaut
 * la probabilité plancher pour les deux versions (compté). Rend { matchs, a, b, exactA, exactB, horsGrille, ecartees }.
 */
export function temoinDuScore(revisions, options) {
  return executerSansPause(temoinDuScoreParEtapes(revisions, options));
}

/** Le témoin du score exact, en générateur (mêmes options, même résultat) : un `yield` tous les MATCHS_PAR_ARRET matchs. */
export function* temoinDuScoreParEtapes(revisions, { empreinte, versionEnService, lire, aujourdhui }) {
  const parMatch = new Map();
  let vues = 0;
  for (const r of revisions ?? []) {
    if (++vues % REVISIONS_PAR_ARRET === 0) yield 'témoin du score';
    if (r.marketId !== 'scoreExact' || r.candidateHash !== empreinte || r.serviceVersion !== versionEnService) continue;
    if (!parMatch.has(r.fixtureKey)) parMatch.set(r.fixtureKey, []);
    parMatch.get(r.fixtureKey).push(r);
  }
  const ecartees = {};
  let n = 0;
  let sa = 0;
  let sb = 0;
  let ea = 0;
  let eb = 0;
  let hors = 0;
  let k = 0;
  for (const [, revs] of parMatch) {
    if (++k % MATCHS_PAR_ARRET === 0) yield 'témoin du score';
    const premiere = revs[0];
    if (premiere.date > aujourdhui) continue;
    const rencontre = lire({ fixtureKey: premiere.fixtureKey, homeId: premiere.homeId, awayId: premiere.awayId, date: premiere.date });
    if (rencontre.raison) {
      compter(ecartees, rencontre.raison);
      continue;
    }
    const retenues = revisionsRetenues(revs.map((r) => ({ ...r, version: r.revision })), { coupDEnvoi: rencontre.coupDEnvoi ?? revs.find((r) => r.kickoff)?.kickoff ?? null, jour: premiere.date });
    const r = retenues.derniere;
    if (!r) {
      compter(ecartees, retenues.raisonDerniere ?? 'heureInconnue');
      continue;
    }
    const buts = rencontre.reglement?.buts;
    if (!buts) {
      compter(ecartees, rencontre.reglement?.nonReglableButs ?? 'sansScore');
      continue;
    }
    const da = lireDistribution(r.serviceDistribution);
    const db = lireDistribution(r.distribution);
    if (!da || !db) {
      compter(ecartees, 'sansDistribution');
      continue;
    }
    const cle = `${buts.home}-${buts.away}`;
    const dans = buts.home <= 8 && buts.away <= 8;
    if (!dans) hors++;
    const pa = dans ? da.issues[cle] ?? 0 : 0;
    const pb = dans ? db.issues[cle] ?? 0 : 0;
    n++;
    sa += -Math.log(Math.max(pa, PROBA_MIN));
    sb += -Math.log(Math.max(pb, PROBA_MIN));
    if (r.serviceChoice === cle) ea++;
    if (r.choice === cle) eb++;
  }
  return { matchs: n, a: n ? nombre(sa / n) : null, b: n ? nombre(sb / n) : null, exactA: n ? nombre((100 * ea) / n, 2) : null, exactB: n ? nombre((100 * eb) / n, 2) : null, horsGrille: hors, ecartees, juge: false };
}

/** Par marché, dans l'ordre d'apparition : lignes, matchs, perte log moyenne de chaque version. */
export function parMarche(lignes) {
  const m = new Map();
  for (const l of lignes) {
    if (!m.has(l.marketId)) m.set(l.marketId, []);
    m.get(l.marketId).push(l);
  }
  return [...m.entries()].map(([marketId, ls]) => ({
    marketId,
    lignes: ls.length,
    matchs: new Set(ls.map((l) => l.bloc)).size,
    a: moyenne(ls.map((l) => l.a)),
    b: moyenne(ls.map((l) => l.b))
  }));
}

// ------------------------------------------------------------ ce qu'on garde d'un jugement

const nombre = (x, d = 6) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(d)) : null);

/**
 * Les « premiers chiffres » (avant l'horizon) : comptes et moyennes, JAMAIS de verdict ni de fourchette. Étape 27 :
 * avec `complements` (complementsDeLEssai), les régimes du modèle de buts et la calibration rapportée (biais, ECE,
 * sans verdict) ; avec `temoins`, le témoin du score exact.
 */
export function premiersChiffres(jugement, { essai, horizon, maintenant, reglement, complements = null, temoins = null }) {
  const etat = horizonAtteint({ matchs: jugement?.n?.matchs ?? 0, depuis: essai.depuis, maintenant, horizon });
  const sansVerdict = (c) => (c ? Object.fromEntries(Object.entries(c).map(([k, x]) => [k, x ? { pronostics: x.pronostics, matchs: x.matchs, biais: x.biais, ece: x.ece } : null])) : null);
  return {
    ...(complements ? { regimes: complements.regimes, calibration: { a: sansVerdict(complements.calibration.a), b: sansVerdict(complements.calibration.b) } } : {}),
    ...(temoins ? { temoins } : {}),
    calculeLe: new Date(maintenant).toISOString(),
    matchs: jugement?.n?.matchs ?? 0,
    lignes: jugement?.n?.lignes ?? 0,
    a: nombre(jugement?.a?.moyenne),
    b: nombre(jugement?.b?.moyenne),
    gainPct: nombre(jugement?.enPourcent?.gain, 3),
    horizon,
    joursEcoules: etat.jours,
    auPlusTotLe: etat.auPlusTotLe,
    aVenir: reglement.aVenir,
    ecartees: { ...reglement.ecartees, ...(jugement?.ecartees?.avantLancement ? { avantLancement: jugement.ecartees.avantLancement } : {}), ...(jugement?.ecartees?.donneesVues ? { donneesVues: jugement.ecartees.donneesVues } : {}) },
    parMarche: reglement.parMarche.map((p) => ({ ...p, a: nombre(p.a), b: nombre(p.b) }))
  };
}

/**
 * Le jugement PRINCIPAL rangé avec la candidate (le registre de la mesure garde le jugement complet). Étape 27 :
 * avec `complements`, le juge par famille (même K), la calibration rapportée, la porte de sûreté (K = 1) et les
 * régimes — ce que lit etatDeLAdoption (engineVersions.js) ; avec `temoins`, le témoin du score exact (jamais jugé).
 */
export function resumeDuJugement(j, { essai, versionEnService, empreinte, reglement, complements = null, temoins = null }) {
  return {
    ...(complements ? { parFamille: complements.parFamille, calibration: complements.calibration, surete: complements.surete, regimes: complements.regimes } : {}),
    ...(temoins ? { temoins } : {}),
    le: j.le,
    principal: true,
    verdict: j.verdict,
    raison: j.raison,
    matchs: j.n?.matchs ?? 0,
    lignes: j.n?.lignes ?? 0,
    a: nombre(j.a?.moyenne),
    b: nombre(j.b?.moyenne),
    gainPct: nombre(j.enPourcent?.gain, 3),
    fourchettePct: Array.isArray(j.enPourcent?.fourchette) ? j.enPourcent.fourchette.map((x) => nombre(x, 3)) : null,
    quoi: j.enPourcent?.quoi ?? '',
    variantes: j.seuil?.variantes ?? null,
    fenetre: j.fenetre ?? null,
    lancement: j.lancement ?? null,
    ecartees: { ...reglement.ecartees, ...(j.ecartees ?? {}) },
    parMarche: reglement.parMarche.map((p) => ({ ...p, a: nombre(p.a), b: nombre(p.b) })),
    versionEnService,
    empreinte,
    essai: essai.numero ?? 1
  };
}
