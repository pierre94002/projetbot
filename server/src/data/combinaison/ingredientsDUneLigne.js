/**
 * ingredientsDUneLigne.js — LES INGRÉDIENTS DE LA CONFIANCE D'UNE LIGNE GELÉE, AU JOUR J, PAR ORIGINE (étape 38, lot 1a).
 * -----------------------------------------------------------------------
 * Pour une ligne gelée (engine_picks : match × marché × choix, une révision), ce que la règle de confiance lit, à partir
 * d'ENTRÉES GELÉES seulement : la ligne elle-même (source et heure des cotes, état de la compo, version du moteur), les
 * relevés payants archivés AU PLUS TARD à son `odds_at` (le palier n'a pas de colonne : il est RECONSTRUIT par
 * fairFromBookmakers, `palierReconstruit: true` — T-F10), le contrôle « à vérifier » en vigueur à `recorded_at` (sinon
 * « inconnu », compté), la case F de SA version (matchs joués avant J, jamais calibration_monthly), le résumé du modèle
 * de buts quand il existe. L'ORIGINE de la révision (nuit / analyse d'avance / coup d'envoi) est gardée : toute classe
 * se juge DANS une origine (critique, constat 1).
 * Identifiants FotMob seulement (jamais le rapprocheur souple). Ne lit jamais `probability` ni `distribution` (T-C2).
 * Pur : la lecture de la base vit dans lecteurP5.js (et, au lot 1b, dans la nuit).
 * -----------------------------------------------------------------------
 */

import { fairFromBookmakers } from '../../core/engine/valueFinder.js';
import { removeMargin } from '../../core/market/marginRemoval.js';
import { familleDe } from './reglesDeConfiance.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** L'origine d'une révision gelée : 'nuit', 'avance' (analyse d'avance) ou 'coup-d-envoi' (analyse au coup d'envoi). */
export function origineDe(origin) {
  if (origin === 'nuit') return 'nuit';
  if (origin === 'analyse-coup-d-envoi') return 'coup-d-envoi';
  if (origin === 'analyse-avance') return 'avance';
  return 'inconnue';
}

/** La classe de la source des cotes d'une ligne gelée : 'odds-api', 'gratuites', 'sans-cote' ou 'inconnue'. */
export function sourceDe(oddsSource) {
  const s = String(oddsSource ?? '');
  if (s.startsWith('The Odds API')) return 'odds-api';
  if (s.startsWith('cotes gratuites')) return 'gratuites';
  if (s.startsWith('aucune cote')) return 'sans-cote';
  return 'inconnue';
}

/** L'état de la compo d'une ligne gelée : 'publiee', 'derniere-alignee', 'pas-publiee' ou 'inconnue'. */
export function compoDe(lineupState) {
  const s = String(lineupState ?? '').toLowerCase();
  if (s.startsWith('publiée') || s.startsWith('publiee')) return 'publiee';
  if (s.includes('dernière') || s.includes('derniere')) return 'derniere-alignee';
  if (s.startsWith('pas encore')) return 'pas-publiee';
  return 'inconnue';
}

/**
 * LE PALIER RECONSTRUIT : les relevés payants (odds_quotes : bookmaker, selection, releve_at, price ; marché 1x2,
 * « snapshot ») AU PLUS TARD à `oddsAt` — un relevé d'après est ignoré (T-F2) —, le dernier par bookmaker et par issue,
 * puis fairFromBookmakers (les paliers du moteur). Rend { ancre: 'pinnacle'|'palier2'|'palier3'|'repli', basis, livres,
 * releveA, probabilites, dispersion } ; dispersion = max sur les issues de |p d'un avis − p du palier| (G du 1N2).
 */
export function palierDesReleves(releves, oddsAt, config = {}) {
  const parLivre = new Map();
  for (const r of releves ?? []) {
    if (!oddsAt || !r.releve_at || r.releve_at > oddsAt) continue;
    const b = parLivre.get(r.bookmaker) ?? {};
    if (!b[r.selection] || r.releve_at > b[r.selection].t) b[r.selection] = { t: r.releve_at, price: r.price };
    parLivre.set(r.bookmaker, b);
  }
  const by = [];
  let releveA = null;
  for (const [key, b] of parLivre) {
    if (!(b.home && b.draw && b.away)) continue;
    by.push({ key, title: key, odds1: b.home.price, oddsDraw: b.draw.price, odds2: b.away.price });
    for (const s of [b.home, b.draw, b.away]) if (!releveA || s.t > releveA) releveA = s.t;
  }
  const f = fairFromBookmakers(by, config);
  if (!f) return { ancre: 'repli', basis: null, livres: by.length, releveA, probabilites: null, dispersion: null };
  const ancre = f.basis === 'Pinnacle' ? 'pinnacle' : f.basis === 'palier 2' ? 'palier2' : 'palier3';
  let dispersion = 0;
  for (const k of f.keys) {
    const b = by.find((x) => x.key === k);
    const r = removeMargin([b.odds1, b.oddsDraw, b.odds2]);
    if (r.anomaly) continue;
    for (let i = 0; i < 3; i++) dispersion = Math.max(dispersion, Math.abs(r.probabilities[i] - f.probabilities[i]));
  }
  return { ancre, basis: f.basis, livres: f.keys.length, releveA, probabilites: [...f.probabilities], dispersion };
}

/**
 * LES INGRÉDIENTS D'UNE LIGNE GELÉE (pur). `ligne` : la ligne d'engine_picks (odds_source, odds_at, lineup_state,
 * lineup_at, market_id, origin, recorded_at, kickoff, engine_version) ; `releves` : les relevés payants de la rencontre
 * (identifiants FotMob + jour) ; `controle` : { etat, du, constats } en vigueur à recorded_at, ou null ; `caseF` : le
 * verdict de la case de SA version, ou null ; `resume` : { accordButs } du modèle de buts, ou null.
 */
export function ingredientsDe({ ligne, releves = [], controle = null, caseF = null, resume = null }) {
  const famille = familleDe(ligne.market_id);
  const source = sourceDe(ligne.odds_source);
  let ancre;
  let palier = null;
  if (source === 'odds-api') {
    palier = palierDesReleves(releves, ligne.odds_at);
    ancre = palier.ancre;
  } else if (source === 'gratuites') ancre = 'repli';
  else ancre = 'sans-cote';
  const ageMinutes = ligne.odds_at && ligne.recorded_at ? (Date.parse(ligne.recorded_at) - Date.parse(ligne.odds_at)) / 60000 : null;
  return {
    famille,
    origine: origineDe(ligne.origin),
    source,
    ancre,
    ancreSurUnPrix: ancre === 'pinnacle' || ancre === 'palier2' || ancre === 'palier3',
    palierReconstruit: true,
    ancreDetail: { source: source === 'odds-api' ? 'The Odds API (relevé manuel)' : source === 'gratuites' ? 'cotes gratuites' : 'aucune cote', lignes: palier?.livres ?? null, releveA: palier?.releveA ?? ligne.odds_at ?? null, basis: palier?.basis ?? null },
    probabilitesDuPalier: palier?.probabilites ?? null,
    compo: compoDe(ligne.lineup_state),
    compoA: ligne.lineup_at ?? null,
    nMin: null,
    service: true,
    aVerifier: controle ? { etat: controle.etat, du: controle.du ?? null, constats: controle.constats ?? [] } : { etat: 'inconnu', du: null, constats: [] },
    caseF,
    accord: famille === '1n2' ? (fini(palier?.dispersion) ? palier.dispersion : null) : fini(resume?.accordButs) ? resume.accordButs : null,
    fraicheur: fini(ageMinutes) ? { ageMinutes, releveA: ligne.odds_at, source: 'heure du relevé des cotes' } : null
  };
}

/**
 * La clé d'une case F (calibration de la tranche) : la VERSION du moteur × le marché × le dixième — une case d'une
 * version n'étiquette jamais une ligne d'une autre version (T-F11 ; jamais calibration_monthly, qui mélange les versions).
 */
export const cleDeLaCaseF = ({ engineVersion, marketId, dixieme }) => `${engineVersion ?? '?'}|${marketId}|${dixieme}`;

/** Le verdict de la case F d'une ligne gelée (cases : { clé → verdict }, comptées sur les matchs joués avant J), ou null. */
export function caseFDe(cases, { engineVersion, marketId, dixieme }) {
  if (engineVersion === null || engineVersion === undefined) return null;
  return cases?.[cleDeLaCaseF({ engineVersion, marketId, dixieme })] ?? null;
}
