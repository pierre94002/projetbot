/**
 * calibration.js — LA CALIBRATION ET LE SUIVI MENSUEL du moteur (étape 20 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Chaque mois : ce que le moteur avait ANNONCÉ face à ce qui s'est PASSÉ, par
 * tranche de probabilité annoncée (« annoncé entre 60 et 70 % : combien de
 * fois l'issue est-elle arrivée ? »), par marché et par championnat ; la
 * valeur de clôture de ses pronostics (la cote a-t-elle baissé après le
 * choix ?) et celle des vrais paris de Pierre. Le bilan de chaque mois écoulé
 * est FIGÉ une fois et gardé (table calibration_monthly), pour voir
 * l'évolution ; le mois en cours est PRÉPARÉ chaque nuit par l'actualisation (étape 24 : la route le lit, ne le
 * calcule jamais), jamais figé.
 *
 * LA SOURCE DES PRONOSTICS (correction 1 du cahier) : la table engine_picks
 * (étape E), jamais predictions.json — son predictedOdds est réécrit à chaque
 * scan de Mes paris. Deux lectures :
 *   - « première valeur » (la lecture principale) : la RÉVISION 1 de chaque
 *     pronostic, gelée la première fois que le match était à venir, jamais
 *     réécrite — le pronostic d'origine ;
 *   - « dernière avant le coup d'envoi » (en second) : la dernière révision
 *     enregistrée avant le coup d'envoi (celui du magasin, sinon celui du
 *     gel ; inconnu : seulement les révisions d'avant le jour du match).
 * La colonne `version` d'engine_picks est la RÉVISION d'un même pronostic ; la
 * version du MOTEUR est `engine_version` (étape 25), comptée à part.
 *
 * LE RÈGLEMENT (correction 2) : les faits du match lus dans le magasin
 * (matches, team_stats) par les règles de la table du jour J (dayTable.js :
 * attribué et prolongation d'après `meta`, buts à la 90e minute d'après le
 * déroulé), réglés comme au banc d'essai (bench/entrees.js, reglementDuMatch :
 * le score de la 90e minute d'un match prolongé, jamais celui de la 120e — sans
 * lui, non réglable ; les statistiques d'un match prolongé non réglables ; un
 * 0-0 de team_stats = non relevé ; un match attribué, rien), l'issue par
 * settlementRules.js (deriveActualOutcome), la règle du règlement automatique
 * (settlementService.js). Rien n'est pris au hasard : un match introuvable,
 * deux rencontres possibles, un score absent sont comptés et dits.
 *
 * LES NOTES (« les MÊMES notes que le banc ») : bench/metrics.js — les
 * tranches (TRANCHES_DIXIEMES) et leur comptage (calibrationParTranche,
 * trancheDe), les justes (tauxDeJustes), la perte log binaire de chaque
 * affirmation (perteLogBinaire), la valeur de clôture (valeurCloture). Rien
 * n'est recompté ici à la main.
 *
 * LE HASARD (correction 6) : chaque tranche dit son nombre de pronostics et de
 * matchs ; le juge de l'étape 16 (guard.js, comparer) dit si un écart
 * annoncé/réalisé dépasse ce que le hasard explique — les lignes d'un même
 * match tirées ensemble, la fourchette élargie pour le nombre de cases jugées
 * du bilan, et JAMAIS de verdict sous son minimum de 200 matchs : une tranche
 * maigre dit « trop peu de matchs », jamais un écart.
 *
 * LA VALEUR DE CLÔTURE (correction 4) : data/closingValue.js, entrée par
 * entrée. Seuls le 1N2, le plus/moins de buts et « les deux équipes
 * marquent » ont des cotes de clôture gratuites : les autres pronostics sont
 * comptés à part et l'écran le dit. Paris : les paris SIMPLES du mois (un
 * combiné n'a pas de valeur d'ensemble, comme au suivi de l'étape 11).
 *
 * LE GEL (correction 7) : l'étape « calibrationMensuelle » de l'actualisation
 * fige chaque mois écoulé — depuis le premier mois du journal gelé — UNE fois,
 * à partir du 1er du mois suivant à 6 h (heure de Paris : les matchs du
 * dernier soir sont joués et importés), sous le verrou de la passe, en rendant
 * la main au serveur (utils/travailCooperatif.js). INSERT seulement : un mois
 * figé n'est jamais recalculé ni réécrit (la base refuse un UPDATE).
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db/matchStatsDb.js';
import { indicateursDUneRencontre, faitsDUneRencontre } from './db/dayTable.js';
import { faitsDuMagasin, reglementDuMatch } from '../bench/entrees.js';
import { TRANCHES_DIXIEMES, calibrationParTranche, trancheDe, tauxDeJustes, perteLogBinaire, valeurCloture } from '../bench/metrics.js';
import { comparer } from '../bench/guard.js';
import { deriveActualOutcome } from '../core/settlement/settlementRules.js';
import { contexteDeMesure, mesurerUneEntree, entreesDesParis, RAISONS as RAISONS_DE_CLOTURE } from './closingValue.js';
import { listBets } from './repositories/betsRepository.js';
import { executerSansPause, executerEnRendantLaMain, creerPauses } from '../utils/travailCooperatif.js';
import { readJsonFile, writeJsonAtomic } from '../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================ les règles fixes

/** La forme du calcul : un mois figé garde la sienne ; un calcul qui change en prend une autre (comparable ou non, l'écran le dit). */
export const VERSION_CALIBRATION = 1;
/** Les tranches de la courbe et du tableau : les dixièmes du banc d'essai (metrics.js), [de ; a[. */
export const TRANCHES = TRANCHES_DIXIEMES;
/**
 * Le juge de l'étape 16, tel quel : 200 matchs au moins (son minimum), 1 000 tirages, 5 %, une graine fixe
 * (un bilan se rejoue au bit près). `variantes` = le nombre de cases jugées du bilan, posé au calcul.
 */
export const JUGE = Object.freeze({ minBlocs: 200, alpha: 0.05, tirages: 1000, graine: 20 });
/** Le gel du mois écoulé : le 1er du mois suivant, à partir de cette heure de Paris. */
export const HEURE_DU_GEL = 6;
/** Au plus tant de mois figés par passe (un long arrêt de l'appli se rattrape en quelques passes). */
export const MOIS_PAR_PASSE = 6;

/** Les marchés du moteur, dans l'ordre de l'écran, et leur nom pour Pierre. */
export const MARCHES = Object.freeze([
  Object.freeze({ id: 'result', libelle: 'Résultat (1N2)' }),
  Object.freeze({ id: 'totalGoals', libelle: 'Total buts' }),
  Object.freeze({ id: 'bothTeamsScore', libelle: 'Les 2 équipes marquent' }),
  Object.freeze({ id: 'teamGoals', libelle: 'Buts d’une équipe' }),
  Object.freeze({ id: 'resultAndTotal', libelle: 'Résultat + total buts' }),
  Object.freeze({ id: 'totalCorners', libelle: 'Corners du match' }),
  Object.freeze({ id: 'teamCorners', libelle: 'Corners d’une équipe' }),
  Object.freeze({ id: 'totalShots', libelle: 'Tirs du match' }),
  Object.freeze({ id: 'teamShots', libelle: 'Tirs d’une équipe' }),
  Object.freeze({ id: 'totalShotsOnTarget', libelle: 'Tirs cadrés du match' }),
  Object.freeze({ id: 'teamShotsOnTarget', libelle: 'Tirs cadrés d’une équipe' })
]);
const LIBELLE_DU_MARCHE = new Map(MARCHES.map((m) => [m.id, m.libelle]));
const RANG_DU_MARCHE = new Map(MARCHES.map((m, i) => [m.id, i]));
/** Les seuls marchés qui ont des cotes de clôture gratuites (closingValue.js, issueDe). */
export const MARCHES_AVEC_CLOTURE = Object.freeze(['result', 'totalGoals', 'bothTeamsScore']);
/** La statistique qui règle les marchés de corners et de tirs (reglementDuMatch : corners, shots, shotsOnTarget). */
const STAT_DU_MARCHE = Object.freeze({
  totalCorners: 'corners',
  teamCorners: 'corners',
  totalShots: 'shots',
  teamShots: 'shots',
  totalShotsOnTarget: 'shotsOnTarget',
  teamShotsOnTarget: 'shotsOnTarget'
});

/** Les deux lectures d'un pronostic. */
export const VUES = Object.freeze({
  premiere: 'Première valeur (le pronostic d’origine, jamais réécrit)',
  derniere: 'Dernière valeur avant le coup d’envoi'
});

/** Pourquoi un pronostic gelé n'entre pas dans le bilan : chaque raison comptée, jamais en silence. */
export const RAISONS_ECARTEES = Object.freeze({
  sansIdentifiant: 'Club reconnu par son nom seulement au gel (pas d’identifiant FotMob) : la rencontre ne se lit pas au magasin',
  sansResultat: 'Résultat absent du magasin (match reporté, pas encore importé, ou introuvable)',
  rencontreAmbigue: 'Deux rencontres possibles au magasin : aucune n’est prise au hasard',
  sansScore: 'Rencontre au magasin sans score',
  attribue: 'Match attribué sur tapis vert : rien à régler',
  prolongationSansScore90: 'Match prolongé sans le score de la 90e minute (déroulé incomplet)',
  prolongationStats: 'Match prolongé : ses corners et ses tirs couvrent 120 minutes, non réglables',
  statNonRelevee: 'Corners ou tirs non relevés au magasin (absents, ou 0 des deux côtés)',
  nonReglable: 'Aucune règle de règlement pour ce pronostic (paramètres illisibles)',
  sansProbabilite: 'Probabilité annoncée absente ou illisible',
  sansChoix: 'Aucun choix gelé',
  sansPremiere: 'Première valeur absente du journal',
  apresCoupDEnvoi: 'Enregistré après le coup d’envoi',
  heureInconnue: 'Gelé le jour du match, heure du coup d’envoi inconnue'
});

/** D'où viennent les chiffres : dit sur la page, tel quel. */
export const PROVENANCE = Object.freeze({
  pronostics: 'Pronostics du moteur gelés chaque nuit et à chaque analyse automatique (table engine_picks du magasin SQLite) : la première valeur de chaque pronostic n’est jamais réécrite.',
  resultats: 'Scores et statistiques du magasin FotMob (tables matches et team_stats), réglés comme au banc d’essai : score de la 90e minute, match attribué écarté, 0-0 de corners ou de tirs = non relevé.',
  cloture: 'Cotes gratuites archivées (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets ; tables odds_events et odds_quotes) : seuls le 1N2, le plus/moins de buts et « les deux équipes marquent » en ont.',
  paris: 'Vos paris de Mes paris (data/runtime/bets.json) : les paris simples, à la cote prise.'
});

/** Une demande qu'on refuse (mois illisible, à venir) : 400, rien n'est calculé. */
export class CalibrationInvalide extends Error {}

// ============================================================ le calendrier

const MOIS = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** « 2026-10 » : un mois lisible. */
export const moisValide = (m) => typeof m === 'string' && MOIS.test(m);

/** Le mois suivant : « 2026-12 » → « 2027-01 ». */
export function moisSuivant(mois) {
  const [a, m] = mois.split('-').map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}
/** Le mois précédent : « 2027-01 » → « 2026-12 ». */
export function moisPrecedent(mois) {
  const [a, m] = mois.split('-').map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
}
/** Le premier et le dernier jour d'un mois (jours UTC des matchs, comme engine_picks.date). */
export function bornesDuMois(mois) {
  if (!moisValide(mois)) throw new CalibrationInvalide(`Mois illisible : « ${String(mois)} » (AAAA-MM attendu).`);
  const [a, m] = mois.split('-').map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { du: `${mois}-01`, au: `${mois}-${String(dernier).padStart(2, '0')}` };
}

const FORMAT_PARIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
/** Le jour, le mois et l'heure à Paris d'un instant (c'est Paris qui décide du « 1er du mois à 6 h »). */
export function heureDeParis(instant) {
  const p = Object.fromEntries(FORMAT_PARIS.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return { mois: `${p.year}-${p.month}`, jour: Number(p.day), heure: Number(p.hour) % 24 };
}
/** Le mois en cours, à Paris. */
export const moisDeParis = (instant = Date.now()) => heureDeParis(instant).mois;

/** Un mois est ÉCOULÉ (donc à figer) dès le 1er du mois suivant à HEURE_DU_GEL h, heure de Paris. */
export function moisEcoule(mois, maintenant = Date.now()) {
  const suivant = moisSuivant(mois);
  const p = heureDeParis(maintenant);
  if (p.mois !== suivant) return p.mois > suivant;
  return p.jour > 1 || p.heure >= HEURE_DU_GEL;
}

const jourUtc = (instant) => new Date(instant).toISOString().slice(0, 10);
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ============================================================ règles pures d'un pronostic

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const probabiliteLisible = (p) => fini(p) && p >= 0 && p <= 1;

/** Les paramètres gelés (texte JSON trié, cf. gelPronostics.js) : un objet, {} sans paramètres, null illisibles. */
export function parametres(params) {
  if (params === null || params === undefined || params === '') return {};
  if (typeof params === 'object' && !Array.isArray(params)) return params;
  if (typeof params !== 'string') return null;
  try {
    const p = JSON.parse(params);
    return p !== null && typeof p === 'object' && !Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
}

/** Un instant lisible en millisecondes, ou null. */
const instant = (x) => {
  const t = Date.parse(x ?? '');
  return Number.isFinite(t) ? t : null;
};

/**
 * Les deux révisions retenues d'UN pronostic (toutes ses révisions, n'importe quel ordre) face au coup
 * d'envoi : la première valeur (révision 1, seulement si elle a été gelée avant) et la dernière gelée avant.
 * `coupDEnvoi` inconnu : seules les révisions d'avant le JOUR du match (`jour`, UTC) comptent, et celles du
 * jour même sont dites « heure inconnue ». Rend { premiere, raisonPremiere, derniere, raisonDerniere }.
 */
export function revisionsRetenues(revisions, { coupDEnvoi = null, jour }) {
  const triees = [...(revisions ?? [])].sort((a, b) => a.version - b.version);
  const ko = instant(coupDEnvoi);
  const limite = ko ?? instant(`${jour}T00:00:00.000Z`);
  const avant = (r) => {
    const t = instant(r.recordedAt);
    return t !== null && limite !== null && t < limite;
  };
  const raisonApres = ko === null ? 'heureInconnue' : 'apresCoupDEnvoi';
  const premiere = triees.find((r) => r.version === 1) ?? null;
  const retenues = triees.filter(avant);
  return {
    premiere: premiere && avant(premiere) ? premiere : null,
    raisonPremiere: !premiere ? 'sansPremiere' : avant(premiere) ? null : raisonApres,
    derniere: retenues.at(-1) ?? null,
    raisonDerniere: retenues.length ? null : raisonApres
  };
}

/**
 * Ce qui s'est passé pour UN pronostic, d'après le règlement de son match (reglementDuMatch, banc d'essai) :
 * { issue, realise } ou { raison } (une clé de RAISONS_ECARTEES). Corners et tirs : la statistique du
 * marché (non relevée ou match prolongé : non réglable) ; les autres marchés : le score de la 90e minute.
 */
export function issueDuPronostic(pick, reglement) {
  if (pick.choice === null || pick.choice === undefined || pick.choice === '') return { raison: 'sansChoix' };
  if (reglement.attribue) return { raison: 'attribue' };
  const params = parametres(pick.params);
  if (params === null) return { raison: 'nonReglable' };
  const stat = STAT_DU_MARCHE[pick.marketId] ?? null;
  let stats = null;
  let h;
  let a;
  if (stat) {
    const s = reglement.stats?.[stat] ?? null;
    if (!s) return { raison: reglement.nonReglableStats ?? 'statNonRelevee' };
    stats = { home: { [stat]: s.home }, away: { [stat]: s.away } };
    // Les buts ne règlent pas un marché de corners ou de tirs (comme au banc : h ?? 0, a ?? 0).
    h = reglement.buts?.home ?? 0;
    a = reglement.buts?.away ?? 0;
  } else {
    if (!reglement.buts) return { raison: reglement.nonReglableButs ?? 'sansScore' };
    h = reglement.buts.home;
    a = reglement.buts.away;
  }
  const issue = deriveActualOutcome({ market: pick.market, predictedLabel: pick.label, homeName: pick.homeName, awayName: pick.awayName, marketId: pick.marketId, params }, h, a, stats);
  if (issue === null || issue === undefined) return { raison: 'nonReglable' };
  return { issue, realise: issue === pick.choice };
}

/**
 * Le RÈGLEMENT d'une rencontre du magasin (une ligne de `matches` et ses deux lignes de team_stats) : les
 * faits par les règles de la table du jour J (indicateursDUneRencontre, faitsDUneRencontre — attribué,
 * prolongation, buts à la 90e minute d'après le déroulé), puis reglementDuMatch, comme au banc d'essai.
 */
export function reglementDeLaRencontre(m, stats = {}) {
  let events = null;
  try {
    const e = typeof m.events === 'string' ? JSON.parse(m.events) : m.events;
    events = Array.isArray(e) ? e : null;
  } catch {
    events = null;
  }
  const indicateurs = indicateursDUneRencontre(m.meta, m.league);
  const [dom] = faitsDUneRencontre({
    rencontre: 0,
    entree: { date: m.date, league: m.league, saison: 0, home: 0, away: 0, hg: m.hg, ag: m.ag, ...indicateurs },
    stats: { home: stats.home ?? null, away: stats.away ?? null },
    events
  });
  return reglementDuMatch(faitsDuMagasin(dom));
}

/** Le coup d'envoi noté au magasin (meta.kickoff), ou null. */
function coupDEnvoiDuMagasin(meta) {
  try {
    const m = typeof meta === 'string' ? JSON.parse(meta) : meta;
    return instant(m?.kickoff) !== null ? m.kickoff : null;
  } catch {
    return null;
  }
}

// ============================================================ les notes d'une case

/** Ce que dit une case : comptes, annoncé, réalisé, écart, justes et perte log binaire (les notes de metrics.js). */
export function resumeDeCase(lignes) {
  const n = lignes.length;
  const matchs = new Set(lignes.map((l) => l.fixtureKey)).size;
  if (!n) return { pronostics: 0, matchs: 0, annonce: null, realise: null, ecart: null, justes: 0, perteLog: null, ecretees: 0 };
  const justes = tauxDeJustes(lignes.map((l) => ({ choix: l.choice, issue: l.issue })));
  let sommeP = 0;
  let sommePerte = 0;
  let ecretees = 0;
  for (const l of lignes) {
    sommeP += l.p;
    const pl = perteLogBinaire(l.p, l.realise);
    sommePerte += pl.valeur;
    if (pl.ecretee) ecretees++;
  }
  const annonce = sommeP / n;
  return { pronostics: n, matchs, annonce, realise: justes.taux, ecart: justes.taux - annonce, justes: justes.justes, perteLog: sommePerte / n, ecretees };
}

/** Les tranches d'une case : calibrationParTranche (metrics.js) + le nombre de matchs de chaque tranche, et ses lignes. */
function tranchesDeCase(lignes) {
  const calibration = calibrationParTranche(lignes.map((l) => ({ p: l.p, realise: l.realise })), { tranches: TRANCHES });
  const parTranche = TRANCHES.map(() => []);
  for (const l of lignes) parTranche[trancheDe(l.p, TRANCHES)].push(l);
  return calibration.map((t, i) => ({
    de: t.de,
    a: t.a,
    pronostics: t.n,
    matchs: new Set(parTranche[i].map((l) => l.fixtureKey)).size,
    annonce: t.annonce,
    realise: t.realise,
    ecart: t.ecart,
    lignes: parTranche[i]
  }));
}

const nbMatchs = (lignes) => new Set(lignes.map((l) => l.fixtureKey)).size;

/** Ce que veut dire le verdict du juge pour une calibration (B = le réalisé, A = l'annoncé, plus grand = B au-dessus). */
const SENS_DU_VERDICT = Object.freeze({ retenu: 'trop-bas', 'moins-bon': 'trop-haut', 'pas-prouve': 'dans-le-hasard', 'pas-assez-de-matchs': 'trop-peu' });

/**
 * LE JUGE de l'étape 16 sur une case : chaque pronostic est une ligne { a = probabilité annoncée, b = 1 s'il
 * est arrivé, 0 sinon } ; l'écart moyen b − a est l'écart réalisé − annoncé ; les lignes d'un même match
 * restent ensemble (bloc = le match) ; `variantes` = le nombre de cases jugées du bilan. Sous le minimum de
 * matchs, le verdict « trop peu » est rendu SANS tirage (il n'y a rien à tirer).
 *   trop-haut       réalisé SOUS l'annoncé, au-delà du hasard : le moteur promet trop ;
 *   trop-bas        réalisé AU-DESSUS, au-delà du hasard : il annonce trop peu ;
 *   dans-le-hasard  l'écart peut venir du hasard ;
 *   trop-peu        pas assez de matchs pour juger.
 */
export function jugerLaCase(lignes, { variantes = 1, juge = JUGE } = {}) {
  const matchs = nbMatchs(lignes);
  if (matchs < juge.minBlocs) return { verdict: 'trop-peu', matchs, minimum: juge.minBlocs, ecart: null, fourchette: null, variantes };
  const r = comparer(
    lignes.map((l) => ({ bloc: l.fixtureKey, match: l.fixtureKey, cle: l.cle, a: l.p, b: l.realise ? 1 : 0 })),
    { mode: 'moyenne', sens: 'max', tirages: juge.tirages, graine: juge.graine, variantes: Math.max(1, variantes), alpha: juge.alpha, minBlocs: juge.minBlocs }
  );
  return { verdict: SENS_DU_VERDICT[r.verdict] ?? r.verdict, matchs: r.n.matchs, minimum: juge.minBlocs, ecart: r.gain, fourchette: r.fourchette, variantes: r.seuil.variantes };
}

/**
 * LES AGRÉGATS d'une lecture (`lignes` : un pronostic réglé chacun) : la case de tous les marchés, une par
 * marché, une par championnat, chacune avec ses tranches ; puis le juge sur toutes les cases d'au moins
 * `juge.minBlocs` matchs, avec m = leur nombre (la fourchette s'élargit pour les cases jugées ensemble).
 * Générateur : il rend la main entre deux juges (`yield`).
 */
export function* agregerLaVue(lignes, { juge = JUGE } = {}) {
  const parMarche = new Map();
  const parChampionnat = new Map();
  for (const l of lignes) {
    if (!parMarche.has(l.marketId)) parMarche.set(l.marketId, []);
    parMarche.get(l.marketId).push(l);
    const ligue = l.league ?? '—';
    if (!parChampionnat.has(ligue)) parChampionnat.set(ligue, []);
    parChampionnat.get(ligue).push(l);
  }
  // Les cases, et leurs lignes pour le juge (jamais gardées dans le bilan). Une tranche garde les comptes de
  // calibrationParTranche (posés EN DERNIER : ce sont eux qui font foi) ; justes et perte log viennent de resumeDeCase.
  const cases = [];
  const nouvelleCase = (lignesDeLaCase, base) => {
    const c = { ...resumeDeCase(lignesDeLaCase), ...base, juge: null };
    cases.push({ c, lignes: lignesDeLaCase });
    return c;
  };
  const avecTranches = (lignesDeLaCase, base) => {
    const c = nouvelleCase(lignesDeLaCase, base);
    c.tranches = tranchesDeCase(lignesDeLaCase).map(({ lignes: lt, ...t }) => nouvelleCase(lt, t));
    return c;
  };
  const global = avecTranches(lignes, {});
  yield 'agrégats';
  const marches = [...parMarche.entries()]
    .sort(([a], [b]) => (RANG_DU_MARCHE.get(a) ?? 99) - (RANG_DU_MARCHE.get(b) ?? 99) || a.localeCompare(b))
    .map(([id, ls]) => avecTranches(ls, { marche: id, libelle: LIBELLE_DU_MARCHE.get(id) ?? id }));
  yield 'agrégats';
  const championnats = [...parChampionnat.entries()]
    .map(([league, ls]) => nouvelleCase(ls, { league }))
    .sort((a, b) => b.pronostics - a.pronostics || a.league.localeCompare(b.league));
  // m = les cases qui seront vraiment jugées (assez de matchs) — toutes, montrées ou non.
  const variantes = cases.filter(({ lignes: ls }) => nbMatchs(ls) >= juge.minBlocs).length;
  for (const { c, lignes: ls } of cases) {
    c.juge = jugerLaCase(ls, { variantes, juge });
    if (c.juge.verdict !== 'trop-peu') yield 'juge';
  }
  return { global, parMarche: marches, parChampionnat: championnats, variantes };
}

// ============================================================ la valeur de clôture

const moyenne = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);
const compter = (obj, cle) => {
  obj[cle] = (obj[cle] ?? 0) + 1;
};

/** Le juge sur une valeur de clôture moyenne (a = 0, b = la valeur, plus grand = mieux) : au-dessus de zéro au-delà du hasard ? */
function jugerLaCloture(mesures, { juge = JUGE } = {}) {
  const matchs = nbMatchs(mesures);
  if (matchs < juge.minBlocs) return { verdict: 'trop-peu', matchs, minimum: juge.minBlocs, fourchette: null };
  const r = comparer(
    mesures.map((m) => ({ bloc: m.fixtureKey, match: m.fixtureKey, cle: m.cle, a: 0, b: m.valeur })),
    { mode: 'moyenne', sens: 'max', tirages: juge.tirages, graine: juge.graine, variantes: 1, alpha: juge.alpha, minBlocs: juge.minBlocs }
  );
  const verdict = r.verdict === 'retenu' ? 'positive' : r.verdict === 'moins-bon' ? 'negative' : r.verdict === 'pas-prouve' ? 'dans-le-hasard' : 'trop-peu';
  return { verdict, matchs: r.n.matchs, minimum: juge.minBlocs, fourchette: r.fourchette ? r.fourchette.map((x) => x * 100) : null };
}

/**
 * La valeur de clôture des pronostics retenus d'une lecture (`choisis` : { pick, rencontre, fixture }) : pour le
 * 1N2, le plus/moins de buts et « les deux équipes marquent », la cote juste du marché au moment du gel
 * (sa probabilité) face à la clôture. valeurCloture (metrics.js) avec, pour cote prise, la cote juste du
 * marché au moment du choix : cote × probabilité de clôture − 1 = de combien la cote juste a baissé — le
 * `clvPct` de closingValue.js, au même chiffre. Générateur (un point d'arrêt après chaque mesure).
 */
export function* clotureDesPronostics(choisis, { database, juge = JUGE } = {}) {
  const ctx = contexteDeMesure(database);
  const raisons = {};
  const mesures = [];
  let sansCoteGratuite = 0;
  let eligibles = 0;
  for (const { pick, rencontre, fixture } of choisis) {
    if (!MARCHES_AVEC_CLOTURE.includes(pick.marketId)) {
      sansCoteGratuite++;
      continue;
    }
    eligibles++;
    const entree = {
      marketId: pick.marketId,
      params: parametres(pick.params) ?? {},
      predictedOutcome: pick.choice,
      homeName: pick.homeName,
      awayName: pick.awayName,
      league: pick.league,
      commenceTime: rencontre?.coupDEnvoi ?? fixture.kickoff ?? null,
      pickAt: pick.recordedAt,
      day: pick.date,
      ...(fixture.homeId && fixture.awayId ? { idsDuMagasin: { home: fixture.homeId, away: fixture.awayId } } : {})
    };
    const r = mesurerUneEntree(entree, ctx);
    if (r.raison) compter(raisons, r.raison);
    else if (!(r.pickProb > 0 && r.pickProb < 1 && r.closeProb > 0 && r.closeProb < 1)) compter(raisons, 'marcheAbsent');
    else {
      const valeur = valeurCloture({ cotePrise: 1 / r.pickProb, probaCloture: r.closeProb });
      mesures.push({ fixtureKey: fixture.fixtureKey, cle: `${fixture.fixtureKey}|${pick.marketKey}`, marche: pick.marketId, valeur, approx: Boolean(r.approx) });
    }
    // Une mesure peut lire plusieurs relevés à froid : un point d'arrêt après chacune (siLongtemps décide).
    yield 'valeur de clôture des pronostics';
  }
  const parMarche = MARCHES_AVEC_CLOTURE.map((id) => {
    const ms = mesures.filter((m) => m.marche === id);
    return { marche: id, libelle: LIBELLE_DU_MARCHE.get(id), mesures: ms.length, moyenne: ms.length ? moyenne(ms.map((m) => m.valeur)) * 100 : null, positifs: ms.filter((m) => m.valeur > 0).length };
  });
  return {
    pronostics: eligibles + sansCoteGratuite,
    eligibles,
    sansCoteGratuite,
    mesures: mesures.length,
    moyenne: mesures.length ? moyenne(mesures.map((m) => m.valeur)) * 100 : null,
    positifs: mesures.filter((m) => m.valeur > 0).length,
    approx: mesures.filter((m) => m.approx).length,
    parMarche,
    raisons: libellesDeCloture(raisons),
    juge: jugerLaCloture(mesures, { juge })
  };
}

/** Les raisons sans valeur de clôture, avec la phrase de closingValue.js (la même partout). */
function libellesDeCloture(raisons) {
  return Object.entries(raisons)
    .map(([raison, n]) => ({ raison, libelle: RAISONS_DE_CLOTURE[raison] ?? raison, n }))
    .sort((a, b) => b.n - a.n || a.raison.localeCompare(b.raison));
}

/**
 * La valeur de clôture des PARIS de Pierre dont le match tombe dans le mois : les paris SIMPLES (un combiné
 * n'a pas de valeur d'ensemble — étape 11), valeurCloture(cote prise, probabilité de clôture) de metrics.js.
 * Le jour d'un pari : celui du match mesuré, sinon le coup d'envoi noté, sinon le jour du pari.
 * Générateur (un point d'arrêt après chaque mesure).
 */
export function* clotureDesParis({ du, au, bets, database, juge = JUGE }) {
  const ctx = contexteDeMesure(database);
  const raisons = {};
  const mesures = [];
  let paris = 0;
  let combines = 0;
  let aVenir = 0;
  const vus = new Set();
  for (const e of entreesDesParis(bets)) {
    const reference = String(e.commenceTime ?? e.pickAt ?? '').slice(0, 10);
    // Large : un ancien pari sans heure de match se mesure jusqu'à 15 jours après (closingValue.js).
    if (!reference || reference < plusJours(du, -16) || reference > au) continue;
    if (e.legsCount !== 1) {
      if (reference >= du && !vus.has(e.betId)) {
        vus.add(e.betId);
        combines++;
      }
      continue;
    }
    const r = mesurerUneEntree(e, ctx);
    // Un pari se reconnaît par ses noms dans l'annuaire (jusqu'à ~30 ms à froid) : un point d'arrêt après chacun.
    yield 'valeur de clôture des paris';
    const jour = r.date ?? reference;
    if (jour < du || jour > au) continue;
    paris++;
    if (r.raison === 'avenir') aVenir++;
    else if (r.raison) compter(raisons, r.raison);
    else if (!(e.oddsTaken > 1) || !(r.closeProb > 0 && r.closeProb < 1)) compter(raisons, 'marcheAbsent');
    else mesures.push({ fixtureKey: `${e.homeName}|${e.awayName}|${jour}`, cle: e.id, valeur: valeurCloture({ cotePrise: e.oddsTaken, probaCloture: r.closeProb }) });
  }
  return {
    paris,
    combines,
    aVenir,
    mesures: mesures.length,
    moyenne: mesures.length ? moyenne(mesures.map((m) => m.valeur)) * 100 : null,
    positifs: mesures.filter((m) => m.valeur > 0).length,
    raisons: libellesDeCloture(raisons),
    juge: jugerLaCloture(mesures, { juge })
  };
}

// ============================================================ le bilan d'un mois

const SELECTION_DES_PRONOSTICS = `SELECT fixture_key AS fixtureKey, market_key AS marketKey, version, recorded_at AS recordedAt, origin, league, date, kickoff,
         home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId, market_id AS marketId, market, params, choice, label,
         probability, engine_version AS engineVersion
  FROM engine_picks WHERE date >= ? AND date <= ? ORDER BY date, fixture_key, market_key, version`;

/**
 * Le lecteur des rencontres du magasin pour les clés « fotmob:<dom>|<ext>|<jour> » d'un mois : les rencontres
 * du mois (± 1 jour) lues UNE fois, colonnes légères seulement (index des dates) — une recherche par club
 * passait par l'index d'un club et relisait une centaine de lignes à chaque match (7 ms l'une sur la base du
 * bac) —, puis, pour la rencontre retenue (le jour exact, sinon à un jour près, jamais deux), sa colonne
 * `meta` et ses statistiques par clé primaire. Le déroulé (`events`) n'est lu que pour un match prolongé :
 * c'est lui seul qui donne le score de la 90e minute (un match non prolongé se règle sur son score).
 * Exporté pour l'essai à blanc d'une candidate (étape 25, moteurABlanc.js) : la même lecture, le même règlement.
 */
export function* lecteurDesRencontres(database, { du, au }) {
  const parClubs = new Map();
  let n = 0;
  for (const l of database
    .prepare(`SELECT match_key AS matchKey, date, league, home_id AS homeId, away_id AS awayId, home_goals AS hg, away_goals AS ag FROM matches
              WHERE date >= date(?, '-1 day') AND date <= date(?, '+1 day') AND home_id IS NOT NULL AND away_id IS NOT NULL`)
    .iterate(du, au)) {
    const cle = `${l.homeId}|${l.awayId}`;
    if (!parClubs.has(cle)) parClubs.set(cle, []);
    parClubs.get(cle).push({ ...l });
    if (++n % 200 === 0) yield 'rencontres du magasin';
  }
  const lireMeta = database.prepare('SELECT meta FROM matches WHERE match_key = ?');
  const lireDeroule = database.prepare('SELECT events FROM matches WHERE match_key = ?');
  const stats = database.prepare('SELECT side, total_shots, shots_on_goal, corner_kicks FROM team_stats WHERE match_key = ?');
  return ({ homeId, awayId, date }) => {
    const lignes = (parClubs.get(`${homeId}|${awayId}`) ?? []).filter((l) => l.date >= plusJours(date, -1) && l.date <= plusJours(date, 1));
    const exactes = lignes.filter((l) => l.date === date);
    const retenues = exactes.length ? exactes : lignes;
    if (!retenues.length) return { raison: 'sansResultat' };
    if (retenues.length > 1) return { raison: 'rencontreAmbigue' };
    const m = { ...retenues[0], meta: lireMeta.get(retenues[0].matchKey)?.meta ?? null };
    const coupDEnvoi = coupDEnvoiDuMagasin(m.meta);
    if (m.hg === null || m.hg === undefined || m.ag === null || m.ag === undefined) return { raison: 'sansScore', coupDEnvoi };
    if (indicateursDUneRencontre(m.meta, m.league).prolongation) m.events = lireDeroule.get(m.matchKey)?.events ?? null;
    const ts = stats.all(m.matchKey);
    const reglement = reglementDeLaRencontre(m, { home: ts.find((s) => s.side === 'home') ?? null, away: ts.find((s) => s.side === 'away') ?? null });
    return { matchKey: m.matchKey, date: m.date, coupDEnvoi, reglement };
  };
}

/** Une clé de match à identifiants FotMob (« fotmob:<dom>|<ext>|<jour> ») : la seule qui se lit au magasin. Exportée pour l’essai à blanc (étape 25). */
export const cleNumerique = (cle) => /^fotmob:[^|]+\|[^|]+\|\d{4}-\d{2}-\d{2}$/.test(cle ?? '');

/**
 * LES LIGNES D'UN MOIS, en générateur (il rend la main aux `yield`) : les pronostics gelés (engine_picks)
 * dont le match tombe dans le mois (jour UTC), leurs révisions retenues dans chaque lecture, et leur
 * règlement au magasin. N'écrit RIEN. Chaque pronostic gelé est, dans chaque lecture, exactement une chose :
 * à venir, écarté (sa raison) ou réglé (une ligne) — et les trois comptes retombent sur le total (le test le
 * vérifie). Rend { du, au, aujourdhui, revisions, geles, matchs, aVenir, versionsDuMoteur, origines, vues }
 * avec, pour chaque lecture, { lignes, ecartees, choisis } (`choisis` : la révision retenue de chaque
 * pronostic d'un match joué, pour la valeur de clôture).
 */
export function* lignesDuMois(mois, { database, maintenant = Date.now() } = {}) {
  const { du, au } = bornesDuMois(mois);
  const aujourdhui = jourUtc(maintenant);
  yield 'pronostics gelés';

  // 1. Les révisions du mois, par match puis par marché.
  const fixtures = new Map();
  let revisions = 0;
  for (const r of database.prepare(SELECTION_DES_PRONOSTICS).iterate(du, au)) {
    revisions++;
    let f = fixtures.get(r.fixtureKey);
    if (!f) {
      f = { fixtureKey: r.fixtureKey, date: r.date, league: r.league, homeId: r.homeId, awayId: r.awayId, kickoff: null, marches: new Map() };
      fixtures.set(r.fixtureKey, f);
    }
    if (r.kickoff && instant(r.kickoff) !== null) f.kickoff = r.kickoff;
    if (!f.marches.has(r.marketKey)) f.marches.set(r.marketKey, []);
    f.marches.get(r.marketKey).push(r);
    if (revisions % 200 === 0) yield 'pronostics gelés';
  }

  // 2. Les rencontres du magasin.
  const lire = yield* lecteurDesRencontres(database, { du, au });
  let k = 0;
  for (const f of fixtures.values()) {
    const futur = f.date > aujourdhui;
    if (futur) f.rencontre = { aVenir: true };
    else if (!cleNumerique(f.fixtureKey) || !f.homeId || !f.awayId) f.rencontre = { raison: 'sansIdentifiant' };
    else f.rencontre = lire(f);
    // Pas (encore) de résultat pour un match d'aujourd'hui : à venir, jamais « écarté ».
    if (f.rencontre.raison && !futur && f.date >= aujourdhui && (f.rencontre.raison === 'sansResultat' || f.rencontre.raison === 'sansScore')) f.rencontre = { aVenir: true, coupDEnvoi: f.rencontre.coupDEnvoi ?? null };
    if (++k % 50 === 0) yield 'rencontres du magasin';
  }

  // 3. Chaque pronostic, dans chaque lecture : à venir, écarté ou réglé.
  const vues = {
    premiere: { lignes: [], ecartees: {}, choisis: [] },
    derniere: { lignes: [], ecartees: {}, choisis: [] }
  };
  const aVenir = { pronostics: 0, matchs: 0 };
  const versionsDuMoteur = new Map();
  const origines = {};
  let geles = 0;
  for (const f of fixtures.values()) {
    if (f.rencontre.aVenir) {
      aVenir.matchs++;
      aVenir.pronostics += f.marches.size;
      geles += f.marches.size;
      continue;
    }
    for (const [marketKey, revs] of f.marches) {
      geles++;
      const r1 = revs.find((r) => r.version === 1) ?? null;
      if (r1) {
        const v = Number.isInteger(r1.engineVersion) ? r1.engineVersion : null;
        versionsDuMoteur.set(v, (versionsDuMoteur.get(v) ?? 0) + 1);
        compter(origines, r1.origin ?? 'inconnue');
      }
      const retenues = revisionsRetenues(revs, { coupDEnvoi: f.rencontre.coupDEnvoi ?? f.kickoff, jour: f.date });
      for (const [vue, pick, raisonRevision] of [
        ['premiere', retenues.premiere, retenues.raisonPremiere],
        ['derniere', retenues.derniere, retenues.raisonDerniere]
      ]) {
        const v = vues[vue];
        if (!pick) {
          compter(v.ecartees, raisonRevision);
          continue;
        }
        if (f.rencontre.raison) {
          compter(v.ecartees, f.rencontre.raison);
          continue;
        }
        // La valeur de clôture : tout pronostic gelé avant un match JOUÉ (score au magasin), même non réglable
        // ensuite (corners non relevés…). Un match reporté ou introuvable n'a pas de vraie clôture.
        v.choisis.push({ pick, rencontre: f.rencontre, fixture: f });
        if (!probabiliteLisible(pick.probability)) {
          compter(v.ecartees, 'sansProbabilite');
          continue;
        }
        const issue = issueDuPronostic(pick, f.rencontre.reglement);
        if (issue.raison) {
          compter(v.ecartees, issue.raison);
          continue;
        }
        v.lignes.push({
          cle: `${f.fixtureKey}|${marketKey}`,
          fixtureKey: f.fixtureKey,
          marketKey,
          marketId: pick.marketId,
          league: pick.league ?? f.league,
          version: pick.version,
          p: pick.probability,
          choice: pick.choice,
          issue: issue.issue,
          realise: issue.realise
        });
      }
    }
    if (++k % 50 === 0) yield 'règlement';
  }
  return { du, au, aujourdhui, revisions, geles, matchs: fixtures.size, aVenir, versionsDuMoteur, origines, vues };
}

/**
 * LE BILAN D'UN MOIS, en générateur (il rend la main aux `yield`) : les lignes du mois (lignesDuMois), leurs
 * agrégats et leurs juges, la valeur de clôture des pronostics et celle des paris de Pierre (`bets`, lus par
 * l'appelant ; `parisIllisibles` : la raison pour laquelle le carnet ne se lit pas). N'écrit RIEN.
 */
export function* travailDuBilan(mois, { database, maintenant = Date.now(), bets = [], parisIllisibles = null, juge = JUGE } = {}) {
  const debut = performance.now();
  const { du, au, aujourdhui, revisions, geles, matchs, aVenir, versionsDuMoteur, origines, vues } = yield* lignesDuMois(mois, { database, maintenant });

  // 4. Les agrégats et les juges, puis la valeur de clôture, lecture par lecture.
  const sortie = {};
  for (const vue of Object.keys(vues)) {
    const v = vues[vue];
    const agregats = yield* agregerLaVue(v.lignes, { juge });
    const cloture = yield* clotureDesPronostics(v.choisis, { database, juge });
    sortie[vue] = {
      libelle: VUES[vue],
      reglees: v.lignes.length,
      matchs: nbMatchs(v.lignes),
      ecartees: Object.entries(v.ecartees)
        .map(([raison, n]) => ({ raison, libelle: RAISONS_ECARTEES[raison] ?? raison, n }))
        .sort((a, b) => b.n - a.n || a.raison.localeCompare(b.raison)),
      global: agregats.global,
      parMarche: agregats.parMarche,
      parChampionnat: agregats.parChampionnat,
      variantes: agregats.variantes,
      cloture
    };
  }

  // 5. Les paris de Pierre (carnet illisible : dit, jamais pris pour un carnet vide).
  const paris = parisIllisibles
    ? { indisponible: parisIllisibles, paris: 0, combines: 0, aVenir: 0, mesures: 0, moyenne: null, positifs: 0, raisons: [], juge: { verdict: 'trop-peu', matchs: 0, minimum: juge.minBlocs, fourchette: null } }
    : yield* clotureDesParis({ du, au, bets, database, juge });

  return {
    version: VERSION_CALIBRATION,
    mois,
    du,
    au,
    calculeLe: new Date(maintenant).toISOString(),
    fige: false,
    figeLe: null,
    enCours: moisDeParis(maintenant) === mois,
    jusquAu: aujourdhui < au ? aujourdhui : au,
    tranches: TRANCHES.map((t) => ({ de: t.de, a: t.a })),
    juge: { minBlocs: juge.minBlocs, alpha: juge.alpha, tirages: juge.tirages, graine: juge.graine },
    pronostics: {
      revisions,
      geles,
      matchs,
      aVenir,
      versionsDuMoteur: [...versionsDuMoteur.entries()].map(([version, n]) => ({ version, pronostics: n })).sort((a, b) => (a.version ?? 0) - (b.version ?? 0)),
      origines
    },
    vues: sortie,
    paris: { cloture: paris },
    dureeMs: Math.round(performance.now() - debut)
  };
}

/** Le carnet des paris, ou la raison pour laquelle il ne se lit pas (jamais un carnet vide à sa place). */
function lireLeCarnet() {
  try {
    return { bets: listBets(), parisIllisibles: null };
  } catch (error) {
    return { bets: [], parisIllisibles: `carnet des paris illisible pour l’instant (${String(error?.message ?? error).slice(0, 200)})` };
  }
}

/** Le bilan d'un mois, d'une traite (scripts, tests). `bets` absent : le carnet de l'appli. */
export function calculerBilan(mois, { database = openDb(), maintenant = Date.now(), bets = null, juge = JUGE } = {}) {
  const carnet = bets ? { bets, parisIllisibles: null } : lireLeCarnet();
  return executerSansPause(travailDuBilan(mois, { database, maintenant, ...carnet, juge }));
}

// ============================================================ les mois figés

/** La table existe-t-elle ? Une base ouverte en lecture seule, d'avant l'étape 20, ne l'a pas : rien de figé. */
function tableExiste(database) {
  return Boolean(database.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'calibration_monthly'").get());
}

/** Le bilan figé d'un mois (tel qu'il a été figé, jamais recalculé), ou null. */
export function bilanFige(mois, { database = openDb() } = {}) {
  if (!tableExiste(database)) return null;
  const r = database.prepare('SELECT bilan FROM calibration_monthly WHERE mois = ?').get(mois);
  return r ? JSON.parse(r.bilan) : null;
}

/** Les mois figés, du plus récent au plus ancien : { mois, version, figeLe, du, au, pronostics, paris, resume }. */
export function listeDesMoisFiges({ database = openDb() } = {}) {
  if (!tableExiste(database)) return [];
  return database
    .prepare('SELECT mois, version, fige_le AS figeLe, du, au, pronostics, paris, resume FROM calibration_monthly ORDER BY mois DESC')
    .all()
    .map((r) => {
      let resume = null;
      try {
        resume = JSON.parse(r.resume);
      } catch {
        resume = null;
      }
      return { ...r, resume };
    });
}

/** Ce qu'on montre d'un bilan dans la liste des mois : la première valeur, les deux valeurs de clôture. */
export function resumeDuBilan(bilan) {
  const v = bilan?.vues?.premiere ?? null;
  const g = v?.global ?? null;
  return {
    mois: bilan?.mois ?? null,
    version: bilan?.version ?? null,
    fige: Boolean(bilan?.fige),
    figeLe: bilan?.figeLe ?? null,
    enCours: Boolean(bilan?.enCours),
    geles: bilan?.pronostics?.geles ?? 0,
    pronostics: g?.pronostics ?? 0,
    matchs: g?.matchs ?? 0,
    annonce: g?.annonce ?? null,
    realise: g?.realise ?? null,
    ecart: g?.ecart ?? null,
    perteLog: g?.perteLog ?? null,
    verdict: g?.juge?.verdict ?? null,
    cloturePronostics: { mesures: v?.cloture?.mesures ?? 0, moyenne: v?.cloture?.moyenne ?? null },
    clotureParis: { mesures: bilan?.paris?.cloture?.mesures ?? 0, moyenne: bilan?.paris?.cloture?.moyenne ?? null }
  };
}

/**
 * FIGE un mois : UNE ligne, jamais réécrite (INSERT … DO NOTHING ; la base refuse d'ailleurs tout UPDATE). Un
 * mois déjà figé garde son bilan d'origine, même si celui qu'on apporte diffère. Rend { ecrit, bilan } — le
 * bilan qui fait foi (celui de la base).
 */
export function figerLeMois(bilan, { database = openDb(), maintenant = Date.now() } = {}) {
  if (!bilan || !moisValide(bilan.mois)) throw new CalibrationInvalide('Bilan sans mois : rien n’est figé.');
  if (!moisEcoule(bilan.mois, maintenant)) throw new CalibrationInvalide(`Le mois ${bilan.mois} n’est pas écoulé : il ne se fige pas.`);
  const fige = { ...bilan, fige: true, figeLe: new Date(maintenant).toISOString(), enCours: false };
  const r = database
    .prepare(
      `INSERT INTO calibration_monthly (mois, version, fige_le, du, au, pronostics, paris, resume, bilan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(mois) DO NOTHING`
    )
    .run(fige.mois, fige.version, fige.figeLe, fige.du, fige.au, fige.pronostics?.geles ?? 0, fige.paris?.cloture?.paris ?? 0, JSON.stringify(resumeDuBilan(fige)), JSON.stringify(fige));
  const ecrit = Number(r.changes) === 1;
  return { ecrit, bilan: ecrit ? fige : bilanFige(bilan.mois, { database }) };
}

/** Le premier mois du journal gelé (le plus petit jour de match d'engine_picks), ou null s'il est vide. */
export function premierMoisDuJournal({ database = openDb() } = {}) {
  const d = database.prepare('SELECT MIN(date) AS d FROM engine_picks').get()?.d ?? null;
  return d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null;
}

/** Les mois écoulés pas encore figés, depuis le premier mois du journal, au plus `limite`. LIT seulement. */
export function moisAFiger({ database = openDb(), maintenant = Date.now(), limite = MOIS_PAR_PASSE } = {}) {
  const premier = premierMoisDuJournal({ database });
  if (!premier) return [];
  const figes = new Set(listeDesMoisFiges({ database }).map((m) => m.mois));
  const out = [];
  for (let m = premier; moisEcoule(m, maintenant) && out.length < limite; m = moisSuivant(m)) if (!figes.has(m)) out.push(m);
  return out;
}

/** Les mois qu'on peut regarder, du plus récent au plus ancien : figés, à figer (écoulés), le mois en cours. */
export function moisDisponibles({ database = openDb(), maintenant = Date.now() } = {}) {
  const enCours = moisDeParis(maintenant);
  const figes = new Map(listeDesMoisFiges({ database }).map((m) => [m.mois, m]));
  const premier = [premierMoisDuJournal({ database }), ...figes.keys()].filter(Boolean).sort()[0] ?? enCours;
  const out = [];
  for (let m = premier <= enCours ? premier : enCours; m <= enCours; m = moisSuivant(m)) {
    const f = figes.get(m);
    // « a-figer » : fini, figé à la première passe d'actualisation qui suit le 1er du mois suivant à 6 h.
    out.push({ mois: m, etat: f ? 'fige' : m === enCours ? 'en-cours' : 'a-figer', figeLe: f?.figeLe ?? null, version: f?.version ?? null });
  }
  return out.reverse();
}

// ============================================================ l'étape mensuelle

/**
 * L'ÉTAPE MENSUELLE de l'actualisation : fige chaque mois écoulé pas encore figé (au plus MOIS_PAR_PASSE),
 * dans le serveur, en rendant la main (`pauses`), sous le verrou de la passe — c'est l'appelant
 * (matchStatsAutoRefresh.js) qui le tient. Une erreur sur un mois n'en fige aucun autre après lui : elle est
 * rendue, la passe suivante reprend.
 */
export async function figerLesMoisEcoules({ database = openDb(), maintenant = Date.now(), pauses = creerPauses(), bets = null, juge = JUGE } = {}) {
  const debut = performance.now();
  const aFiger = moisAFiger({ database, maintenant });
  const figes = [];
  let erreur = null;
  // Un mois figé l'est pour toujours : sans le carnet des paris, rien n'est figé (la passe suivante réessaie).
  const carnet = !aFiger.length ? { bets: [], parisIllisibles: null } : bets ? { bets, parisIllisibles: null } : lireLeCarnet();
  if (carnet.parisIllisibles) return { aFiger, figes, erreur: `${carnet.parisIllisibles} : aucun mois figé`, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
  for (const mois of aFiger) {
    try {
      const bilan = await executerEnRendantLaMain(travailDuBilan(mois, { database, maintenant, bets: carnet.bets, juge }), pauses.siLongtemps);
      const r = figerLeMois(bilan, { database, maintenant });
      figes.push({ mois, ecrit: r.ecrit, resume: resumeDuBilan(r.bilan), dureeMs: bilan.dureeMs });
    } catch (error) {
      erreur = `${mois} : ${String(error?.message ?? error).slice(0, 300)}`;
      break;
    }
    await pauses.pause('entre deux mois');
  }
  return { aFiger, figes, erreur, dureeMs: Math.round(performance.now() - debut), ...pauses.bilan() };
}

// ============================================================ le mois en cours, PRÉPARÉ par l'actualisation

/**
 * Où l'actualisation range le bilan du mois en cours (étape 24 du plan, 14/10/2026). Avant, la route le calculait
 * à la demande, dans la requête, et le gardait dix minutes : 1,7 s de travail à chaud sur un mois de 6 500
 * pronostics réglés (6 s à froid chez Pierre, le 14/10) pour celui qui ouvrait la page, refait à chaque
 * ouverture après dix minutes — et, quand un pari du carnet tombait dans le mois, un bloc de 0,3 à 1,8 s sans
 * rendre la main (le premier club reconnu par son nom). Maintenant : l'étape « calibrationMensuelle » le
 * calcule UNE fois par jour de Paris (ou au clic « Actualiser »), en rendant la main, et l'écrit ici d'un bloc
 * (utils/atomicJson.js) ; la route et le tableau de bord du moteur ne font que LIRE ce fichier.
 */
export const FICHIER_DU_MOIS_EN_COURS = path.resolve(__dirname, '../../data/runtime/calibration-en-cours.json');
/** La forme du fichier (un fichier d'une autre forme est dit « ancien », jamais lu de travers). */
export const FORMAT_DU_MOIS_PREPARE = 1;

/**
 * Le bilan préparé du mois en cours, ou la raison pour laquelle il ne se lit pas : { etat: 'lu' | 'absent' |
 * 'illisible', prepare, erreur }. Ne lève jamais (la page doit rester debout). Ne calcule rien.
 */
export function lireLeMoisPrepare({ fichier = FICHIER_DU_MOIS_EN_COURS } = {}) {
  let prepare;
  try {
    prepare = readJsonFile(fichier, null);
  } catch (error) {
    return { etat: 'illisible', prepare: null, erreur: String(error?.message ?? error).slice(0, 300) };
  }
  if (prepare === null) return { etat: 'absent', prepare: null, erreur: null };
  const forme = prepare && typeof prepare === 'object' && moisValide(prepare.mois) && prepare.bilan && typeof prepare.bilan === 'object' && prepare.bilan.vues && typeof prepare.bilan.vues === 'object';
  if (!forme) return { etat: 'illisible', prepare: null, erreur: 'fichier de forme inconnue' };
  return { etat: 'lu', prepare, erreur: null };
}

/**
 * Faut-il (re)préparer le mois en cours ? Oui s'il n'y a pas de fichier lisible, s'il est d'une autre forme ou
 * version du calcul, d'un autre mois, ou calculé un autre jour de Paris. LIT seulement (le petit fichier).
 */
export function preparationAFaire({ fichier = FICHIER_DU_MOIS_EN_COURS, maintenant = Date.now() } = {}) {
  const { etat, prepare } = lireLeMoisPrepare({ fichier });
  if (etat !== 'lu') return { afaire: true, raison: etat === 'absent' ? 'jamais préparé' : 'fichier illisible' };
  if (prepare.format !== FORMAT_DU_MOIS_PREPARE || prepare.version !== VERSION_CALIBRATION) return { afaire: true, raison: 'autre forme du calcul' };
  if (prepare.mois !== moisDeParis(maintenant)) return { afaire: true, raison: 'autre mois' };
  const a = heureDeParis(prepare.calculeLe);
  const b = heureDeParis(maintenant);
  if (a.mois !== b.mois || a.jour !== b.jour) return { afaire: true, raison: 'calculé un autre jour' };
  return { afaire: false, raison: null };
}

/**
 * PRÉPARE le bilan du mois en cours (l'étape de la nuit, ou le clic « Actualiser ») : le même calcul que celui
 * d'un mois figé, en rendant la main au serveur (`pauses`), puis écrit d'un bloc. La base n'est que lue ; un
 * calcul en échec n'écrit rien (le fichier d'avant reste lu). Rend { mois, dureeMs, blocMaxMs, geles, reglees,
 * matchs, resume }.
 */
export async function preparerLeMoisEnCours({ database = openDb(), maintenant = Date.now(), pauses = creerPauses(), fichier = FICHIER_DU_MOIS_EN_COURS, bets = null, juge = JUGE } = {}) {
  const debut = performance.now();
  const mois = moisDeParis(maintenant);
  const carnet = bets ? { bets, parisIllisibles: null } : lireLeCarnet();
  const bilan = await executerEnRendantLaMain(travailDuBilan(mois, { database, maintenant, ...carnet, juge }), pauses.siLongtemps);
  const dureeMs = Math.round(performance.now() - debut);
  const { blocMaxMs } = pauses.bilan();
  writeJsonAtomic(fichier, { format: FORMAT_DU_MOIS_PREPARE, version: VERSION_CALIBRATION, mois, calculeLe: bilan.calculeLe, dureeMs, blocMaxMs, bilan }, { indent: 0 });
  const premiere = bilan.vues.premiere;
  return { mois, dureeMs, blocMaxMs, geles: bilan.pronostics.geles, reglees: premiere.reglees, matchs: premiere.matchs, resume: resumeDuBilan(bilan) };
}

// ============================================================ la route

/** Un pronostic gelé au moins dans ce mois (jour UTC des matchs) ? Une lecture par l'index des dates. */
function moisAvecPronostics(mois, database) {
  const { du, au } = bornesDuMois(mois);
  return Boolean(database.prepare('SELECT 1 AS x FROM engine_picks WHERE date >= ? AND date <= ? LIMIT 1').get(du, au));
}

/**
 * Le bilan d'un mois pour la route, SANS RIEN CALCULER : figé (tel quel), préparé (le mois en cours, tel que
 * l'actualisation l'a écrit), ou rien — avec la raison, que la page dit (« pas encore mesuré »). Rend { bilan,
 * preparation: { etat, … } } ; `etat` : fige · prepare · absente · illisible · ancienne · a-figer · sans-pronostic.
 */
export function bilanPourLaRoute(mois, { database = openDb(), maintenant = Date.now(), fichier = FICHIER_DU_MOIS_EN_COURS } = {}) {
  const fige = bilanFige(mois, { database });
  if (fige) return { bilan: fige, preparation: { etat: 'fige', calculeLe: fige.calculeLe ?? null, figeLe: fige.figeLe ?? null } };
  if (mois !== moisDeParis(maintenant)) {
    // Un mois fini, pas encore figé : il se fige à la première passe d'après le 1er à HEURE_DU_GEL h. Jamais calculé ici.
    return { bilan: null, preparation: { etat: moisAvecPronostics(mois, database) ? 'a-figer' : 'sans-pronostic' } };
  }
  const { etat, prepare, erreur } = lireLeMoisPrepare({ fichier });
  if (etat !== 'lu') return { bilan: null, preparation: { etat: etat === 'absent' ? 'absente' : 'illisible', erreur } };
  if (prepare.mois !== mois || prepare.format !== FORMAT_DU_MOIS_PREPARE || prepare.version !== VERSION_CALIBRATION) {
    return { bilan: null, preparation: { etat: 'ancienne', moisPrepare: prepare.mois, calculeLe: prepare.calculeLe ?? null } };
  }
  return {
    bilan: prepare.bilan,
    preparation: { etat: 'prepare', calculeLe: prepare.calculeLe ?? prepare.bilan.calculeLe ?? null, dureeMs: prepare.dureeMs ?? null, blocMaxMs: prepare.blocMaxMs ?? null }
  };
}

/**
 * Ce que rend GET /api/predictions/calibration : le bilan du mois demandé (le mois en cours par défaut) — figé,
 * ou préparé par l'actualisation, ou `null` avec sa raison (`preparation`) —, la liste des mois figés (leur
 * résumé, pour l'évolution), les mois qu'on peut regarder, le prochain gel, les règles du calcul et la
 * provenance. Lève CalibrationInvalide sur un mois illisible ou à venir. Ne calcule JAMAIS un bilan : le travail
 * lourd est celui de la nuit (étape 24 : la page s'ouvre sans rien attendre).
 */
export async function calibrationPourLaRoute({ mois = null, database = openDb(), maintenant = Date.now(), fichier = FICHIER_DU_MOIS_EN_COURS } = {}) {
  const enCours = moisDeParis(maintenant);
  const demande = mois ?? enCours;
  if (!moisValide(demande)) throw new CalibrationInvalide(`Mois illisible : « ${String(demande)} » (AAAA-MM attendu, par exemple ${enCours}).`);
  if (demande > enCours) throw new CalibrationInvalide(`Le mois ${demande} n’a pas commencé : rien à mesurer.`);
  const { bilan, preparation } = bilanPourLaRoute(demande, { database, maintenant, fichier });
  const figes = listeDesMoisFiges({ database }).map((m) => ({ ...(m.resume ?? resumeDuBilan(null)), mois: m.mois, fige: true, figeLe: m.figeLe, version: m.version }));
  return {
    mois: demande,
    moisEnCours: enCours,
    bilan,
    preparation,
    figes,
    disponibles: moisDisponibles({ database, maintenant }),
    prochainGel: { mois: enCours, le: `${moisSuivant(enCours)}-01`, heure: HEURE_DU_GEL },
    aFiger: moisAFiger({ database, maintenant }),
    version: VERSION_CALIBRATION,
    juge: { ...JUGE },
    tranches: TRANCHES.map((t) => ({ de: t.de, a: t.a })),
    marchesAvecCloture: [...MARCHES_AVEC_CLOTURE],
    provenance: PROVENANCE
  };
}

// ============================================================ le résumé du tableau de bord du moteur

/** Ce qu'on garde d'un bilan pour le tableau de bord : la lecture principale (case de tous les marchés, valeur de clôture), sans les tableaux par marché ni par championnat. */
function essentielDuBilan(bilan) {
  const v = bilan?.vues?.premiere ?? null;
  return {
    mois: bilan.mois,
    fige: Boolean(bilan.fige),
    figeLe: bilan.figeLe ?? null,
    enCours: Boolean(bilan.enCours),
    calculeLe: bilan.calculeLe ?? null,
    jusquAu: bilan.jusquAu ?? null,
    pronostics: { geles: bilan.pronostics?.geles ?? 0, aVenir: bilan.pronostics?.aVenir ?? null },
    premiere: v ? { reglees: v.reglees ?? 0, matchs: v.matchs ?? 0, global: v.global ?? null, cloture: v.cloture ? { ...v.cloture, raisons: [] } : null } : null,
    paris: { cloture: bilan.paris?.cloture ? { ...bilan.paris.cloture, raisons: [] } : null }
  };
}

/**
 * Le RÉSUMÉ de la calibration pour « Santé du moteur » (étape 24) : LIT seulement, comme la route — le mois en
 * cours tel que la nuit l'a préparé (sinon le dernier mois figé), l'essentiel de son bilan, les mois figés et la
 * raison quand il n'y a rien à montrer. Ne calcule JAMAIS un bilan.
 */
export function resumeDeLaCalibration({ database = openDb(), maintenant = Date.now(), fichier = FICHIER_DU_MOIS_EN_COURS } = {}) {
  const enCours = moisDeParis(maintenant);
  const { bilan: courant, preparation } = bilanPourLaRoute(enCours, { database, maintenant, fichier });
  const figes = listeDesMoisFiges({ database });
  const bilan = courant ?? (figes.length ? bilanFige(figes[0].mois, { database }) : null);
  return {
    moisEnCours: enCours,
    preparation,
    bilan: bilan ? essentielDuBilan(bilan) : null,
    figes: figes.map((m) => ({ ...(m.resume ?? resumeDuBilan(null)), mois: m.mois, fige: true, figeLe: m.figeLe, version: m.version })),
    prochainGel: { mois: enCours, le: `${moisSuivant(enCours)}-01`, heure: HEURE_DU_GEL },
    juge: { ...JUGE },
    version: VERSION_CALIBRATION
  };
}
