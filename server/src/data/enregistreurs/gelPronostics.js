/**
 * gelPronostics.js — les pronostics du moteur, gelés (étape E du plan, correction 7).
 * -----------------------------------------------------------------------
 * Pour mesurer un jour « annoncé contre réalisé » (calibration, étape 20 ;
 * versions du moteur, étape 25), il faut le pronostic tel qu'il était AVANT
 * le match, et le premier de tous. Le journal predictions.json ne le garde
 * pas : il n'est alimenté que par le scan de Mes paris, et chaque scan
 * réécrit predictedOdds. Ici, sans Claude ni appel payant :
 *   - CHAQUE NUIT (étape « gelPronostics » de l'actualisation, sous son
 *     verrou) : le moteur tourne sur TOUS les matchs à venir de la page
 *     Matchs (listAdaptedMatches), comme le Repérage, sans repli payant ;
 *   - à CHAQUE ANALYSE automatique (d'avance et d'avant coup d'envoi,
 *     autoMatchAiTrigger.js) : le résultat du moteur déjà calculé pour
 *     l'analyse, avec la composition qu'elle a lue. Un clic manuel ne gèle
 *     rien : son résultat vient de l'écran et a pu passer par le repli payant.
 * Pour chaque marché (marketPredictions) : le choix, la probabilité (1 / la
 * cote juste), la cote minimale, la cote du marché (1N2), la source et
 * l'heure des cotes, l'état de la composition, l'empreinte des réglages du
 * moteur. La PREMIÈRE valeur de chaque pronostic n'est jamais réécrite ; les
 * suivantes sont des versions datées (cf. depot.ecrirePronostics).
 * Depuis l'étape 25 du plan (07/10/2026) : aussi le NUMÉRO DE VERSION DU
 * MOTEUR qui a fait le calcul (engineVersion de analyzeMatch, cf.
 * core/engine/engineVersions.js) et la DISTRIBUTION COMPLÈTE du marché à la
 * ligne du pronostic (toutes les issues et leur probabilité, cf.
 * sports/football/markets.js, distributionDuMarche) — ce que le juge de
 * l'étape 16 attend. Les lignes gelées avant restent « sans version ».
 *
 * Un match se reconnaît par les identifiants FotMob de ses clubs et son jour
 * (le même match vient des cotes payantes OU du calendrier, sous deux
 * identifiants d'appli différents) ; à défaut d'identifiant, par ses noms.
 * -----------------------------------------------------------------------
 */

import crypto from 'node:crypto';
import { openDb, upcomingLineupByHome } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { listAdaptedMatches } from '../matchSources.js';
import { enrichMatchWithRealAverages } from '../providers/matchEnrichment.js';
import { getFixturesStatus } from '../repositories/fixturesRepository.js';
import { analyzeMatch } from '../../core/engine/oddsEngine.js';
import { getEngineConfig } from '../../core/engine/engineConfig.js';
import { getTiltState } from '../../core/engine/tiltState.js';
import { getSport } from '../../sports/index.js';
import { mettreEnFile, vider } from './file.js';
import { compterLignes } from './depot.js';
import { iso, jourUtc, nomCle, pause } from './communs.js';

export const ORIGINES = { nuit: 'nuit', avance: 'analyse-avance', coupDEnvoi: 'analyse-coup-d-envoi' };

const arrondi = (x, d = 4) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);
/** Un nombre, ou null — jamais 0 pour une valeur absente (Number(null) vaut 0). */
const nombre = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

/** Empreinte des réglages du moteur : deux pronostics d'empreintes différentes ne viennent pas du même moteur. */
export function empreinteMoteur(config = getEngineConfig('football')) {
  return crypto.createHash('sha1').update(JSON.stringify(config ?? {})).digest('hex').slice(0, 12);
}

/** La clé d'un match : identifiants FotMob et jour, sinon compétition, noms et jour. */
export function cleDuMatch({ homeId, awayId, league, home, away, date }) {
  if (homeId && awayId) return `fotmob:${homeId}|${awayId}|${date}`;
  return `nom:${nomCle(league)}|${nomCle(home)}|${nomCle(away)}|${date}`;
}

/** La clé d'un marché : son identifiant, et l'équipe pour les marchés d'une équipe. */
export const cleDuMarche = (p) => `${p.marketId}${p.params?.team ? `:${p.params.team}` : ''}`;

/** Des paramètres comparables d'une version à l'autre (clés triées). */
const parametres = (params) => (params ? JSON.stringify(Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))) : null);

/** D'où viennent les cotes que le moteur a lues, et de quand. */
export function sourceDesCotes(match, { heureInstantanePayant = null } = {}) {
  const cotes = match?.marketOdds;
  if (cotes && match.oddsSource === 'gratuit') {
    return { oddsSource: `cotes gratuites : ${(cotes.sources ?? []).join(', ') || 'source non dite'}`, oddsAt: cotes.releveAt ?? null };
  }
  if (cotes && match.hasOdds) return { oddsSource: 'The Odds API (relevé manuel)', oddsAt: heureInstantanePayant };
  return { oddsSource: 'aucune cote (modèle de buts)', oddsAt: null };
}

/**
 * L'état de la composition : celle que l'analyse a lue (`lineups`, cf.
 * lineupContext.js), sinon le cache des compositions (sans appel réseau).
 */
export function etatDeLaCompo({ lineups = null, homeId = null, date = null, database = null } = {}) {
  if (lineups?.source === 'FotMob') return { lineupState: 'publiée (FotMob)', lineupAt: lineups.fetchedAt ?? null };
  if (lineups?.source === 'magasin') return { lineupState: 'dernière alignée (magasin)', lineupAt: null };
  if (homeId && date && database) {
    try {
      const cache = upcomingLineupByHome(homeId, date, { database });
      if (cache?.available) return { lineupState: 'publiée (FotMob)', lineupAt: cache.fetchedAt ?? null };
      if (cache) return { lineupState: 'pas encore publiée', lineupAt: cache.fetchedAt ?? null };
    } catch {
      // Cache illisible : rien de sûr à dire.
    }
  }
  return { lineupState: 'inconnue (non relue)', lineupAt: null };
}

/**
 * Étape 25 : la distribution complète d'un pronostic, en texte JSON (null si elle ne se calcule pas) —
 * la règle du sport (distributionDuMarche), jamais refaite ici.
 */
export function distributionGelee(engineResult, prediction) {
  try {
    const d = getSport('football').markets.distributionDuMarche?.(engineResult, prediction) ?? null;
    return d ? JSON.stringify(d) : null;
  } catch {
    return null;
  }
}

/** Le numéro de version du moteur d'un résultat (entier ≥ 1), sinon null : « sans version ». */
export const versionDuResultat = (engineResult) => (Number.isInteger(engineResult?.engineVersion) && engineResult.engineVersion >= 1 ? engineResult.engineVersion : null);

/** Ce qu'on gèle d'un résultat du moteur pour un match : un élément de la file « gel ». */
export function elementDuGel({ match, engineResult, origine, maintenant = Date.now(), homeId = null, awayId = null, cotes, compo, engineHash }) {
  const date = jourUtc(Date.parse(match.commenceTime));
  const fixture = {
    fixtureKey: cleDuMatch({ homeId, awayId, league: match.league, home: match.home, away: match.away, date }),
    matchId: match.matchId ?? null,
    league: match.league ?? null,
    date,
    kickoff: match.hasOdds ? match.commenceTime : null,
    homeName: match.home ?? null,
    awayName: match.away ?? null,
    homeId,
    awayId
  };
  const pronostics = (engineResult?.marketPredictions ?? []).map((p) => ({
    marketKey: cleDuMarche(p),
    marketId: p.marketId,
    market: p.market ?? null,
    params: parametres(p.params),
    choice: p.predictedOutcome ?? null,
    label: p.predictedLabel ?? null,
    probability: nombre(p.predictedOdds) > 1 ? arrondi(1 / nombre(p.predictedOdds)) : null,
    predictedOdds: nombre(p.predictedOdds),
    // La cote du marché n'existe que pour le Résultat d'un match coté.
    marketOdds: nombre(p.predictedMarketOdds),
    minOdds: nombre(p.minOdds),
    distribution: distributionGelee(engineResult, p),
    ...cotes,
    ...compo
  }));
  return { fixture, origine, recordedAt: iso(maintenant), engineHash, engineVersion: versionDuResultat(engineResult), pronostics, complet: true, ...cotes, ...compo };
}

/** Les identifiants FotMob des deux clubs (annuaire strict, jamais une ressemblance), en cache le temps d'une passe. Repris par moteurABlanc.js (étape 25). */
export function resolveur(database) {
  const cache = new Map();
  return (nom, league) => {
    const cle = `${league}|${nom}`;
    if (!cache.has(cle)) {
      let id = null;
      try {
        id = clubDuMagasin(nom, league, database);
      } catch {
        id = null;
      }
      cache.set(cle, id);
    }
    return cache.get(cle);
  };
}

/** Les matchs à venir de la page Matchs, chacun une fois (un match peut venir des cotes ET du calendrier). */
export function matchsAVenir(maintenant = Date.now()) {
  const vus = new Set();
  return listAdaptedMatches('odds-api').filter((m) => {
    const t = Date.parse(m.commenceTime ?? '');
    if (!Number.isFinite(t) || t <= maintenant || m.postponed) return false;
    const cle = `${m.league}|${m.home}|${m.away}|${String(m.commenceTime).slice(0, 10)}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
}

/**
 * LE GEL DE LA NUIT : le moteur sur chaque match à venir, sans repli payant,
 * la main rendue au serveur entre deux matchs ; puis l'écriture, par tranches.
 * `dansLaPasse` : appelé par l'étape de l'actualisation, qui tient le verrou
 * (seules ces lignes-là sont écrites) ; sinon, elles attendent que le verrou
 * soit libre. `matchs` : pour les tests (sinon la page Matchs).
 */
export async function gelerLaNuit({ maintenant = Date.now(), database = openDb(), matchs = null, dansLaPasse = true } = {}) {
  const liste = matchs ?? matchsAVenir(maintenant);
  const config = getEngineConfig('football');
  const engineHash = empreinteMoteur(config);
  const sport = getSport('football');
  const club = resolveur(database);
  let heureInstantanePayant = null;
  try {
    heureInstantanePayant = getFixturesStatus().oddsLastSyncedAt ?? null;
  } catch {
    heureInstantanePayant = null;
  }
  const bilan = { matchs: liste.length, calcules: 0, pronostics: 0, echecs: 0, echantillons: [], ecrits: 0, reporte: false, erreur: null, sansIdentifiant: 0 };
  const elements = [];
  for (const match of liste) {
    try {
      const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
      // L'heure de la nuit (étape 27) : le modèle de buts ne lit rien d'après ce moment.
      const resultat = await analyzeMatch(enrichi, config, getTiltState(), sport, { maintenant });
      const homeId = club(match.home, match.league);
      const awayId = club(match.away, match.league);
      if (!homeId || !awayId) bilan.sansIdentifiant++;
      const date = jourUtc(Date.parse(match.commenceTime));
      const element = elementDuGel({
        match,
        engineResult: resultat,
        origine: ORIGINES.nuit,
        maintenant,
        homeId,
        awayId,
        cotes: sourceDesCotes(match, { heureInstantanePayant }),
        compo: etatDeLaCompo({ homeId, date, database }),
        engineHash
      });
      elements.push(element);
      bilan.calcules++;
      bilan.pronostics += element.pronostics.length;
    } catch (error) {
      bilan.echecs++;
      if (bilan.echantillons.length < 5) bilan.echantillons.push(`${match.home} - ${match.away} : ${String(error?.message ?? error).slice(0, 160)}`);
    }
    // Rendre la main au serveur entre deux matchs (le moteur est synchrone par endroits).
    await pause(0);
  }
  mettreEnFile('gel', elements);
  const r = await vider({ database, dansLaPasse, seulement: 'gel', maintenant });
  bilan.ecrits = r.ecrites;
  bilan.reporte = Boolean(r.reporte);
  bilan.erreur = r.erreur ?? null;
  // Une nuit sans match à venir (trêve) : le gel a bien tourné, l'état le dit
  // (sinon l'alerte « aucun gel depuis 30 h » se lèverait à tort).
  if (!elements.length && dansLaPasse) {
    try {
      compterLignes('gel', 0, iso(maintenant), { database, maintenant });
    } catch {
      // état seulement : la passe suivante le notera
    }
  }
  return bilan;
}

/**
 * LE GEL D'UNE ANALYSE : ce que le moteur a donné pour l'analyse automatique
 * d'un match, mis en file (écrit dès que le verrou est libre). Ne lève jamais :
 * un gel raté ne doit pas empêcher l'analyse.
 */
export function gelerAnalyse({ match, engineResult, lineups = null, origine = ORIGINES.avance, database = null, maintenant = Date.now() }) {
  try {
    if (!match?.commenceTime || !engineResult?.marketPredictions) return false;
    const base = database ?? openDb();
    const club = resolveur(base);
    const homeId = club(match.home, match.league);
    const awayId = club(match.away, match.league);
    let heureInstantanePayant = null;
    try {
      heureInstantanePayant = getFixturesStatus().oddsLastSyncedAt ?? null;
    } catch {
      heureInstantanePayant = null;
    }
    const date = jourUtc(Date.parse(match.commenceTime));
    const element = elementDuGel({
      match,
      engineResult,
      origine,
      maintenant,
      homeId,
      awayId,
      cotes: sourceDesCotes(match, { heureInstantanePayant }),
      compo: etatDeLaCompo({ lineups, homeId, date, database: base }),
      engineHash: empreinteMoteur()
    });
    mettreEnFile('gel', [element]);
    return true;
  } catch (error) {
    console.warn(`[enregistreurs] gel de l'analyse ${match?.home ?? '?'} - ${match?.away ?? '?'} impossible : ${error.message}`);
    return false;
  }
}
