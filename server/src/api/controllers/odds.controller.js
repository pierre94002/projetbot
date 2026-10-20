import { openDb } from '../../data/db/matchStatsDb.js';
import { clubDuMagasin } from '../../data/db/oddsProfileRead.js';
import { quotesForFixture, quotesSummary, SOURCES_ECHANGE } from '../../data/db/oddsQuotesRepository.js';
import { collectUpcomingOdds, finalizeOdds, backfillProgress, FOURNISSEURS } from '../../data/providers/freeOdds.js';
import { invalidateFreeMarketOdds, NOMS_DES_SOURCES } from '../../data/freeMarketOdds.js';
import { getOddsWatchStatus } from '../../jobs/oddsWatch.js';
import { removeMargin } from '../../core/market/marginRemoval.js';
import { fixtureGaps, coverageReport } from '../../data/oddsGaps.js';
import { droppingOdds, movementForFixture } from '../../data/droppingOdds.js';
import { closingValueReport, invalidateClosingValue } from '../../data/closingValue.js';
import { ApiError, requireStringParam } from '../middlewares/errorHandler.js';

/**
 * Les cotes GRATUITES d'un match (04/10/2026) : tout ce que l'appli a relevé
 * chez ESPN, football-data.co.uk, 365Scores, Kalshi et Smarkets, par source,
 * bookmaker et marché (ouverture, pré-clôture, clôture, séries avant match
 * et en direct), avec la provenance de chaque valeur — et la probabilité
 * que ces cotes donnent, marge retirée par la méthode puissance (la même que
 * le moteur, cf. marginRemoval.js).
 */

const arrondi = (x, d = 4) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const moyenne = (liste) => (liste.length ? liste.reduce((s, x) => s + x, 0) / liste.length : null);

/** La dernière valeur d'AVANT-match d'une sélection (jamais un point du direct). */
const avantMatch = (sel) => sel.close ?? sel.snapshots.at(-1) ?? sel.preclose ?? sel.open ?? null;

/**
 * Probabilités 1N2 (et plus de 2,5 buts) tirées des cotes relevées :
 *   - bookmakers : chaque jeu complet sans marge, puis la moyenne ;
 *   - échanges (Kalshi, Smarkets) : les probabilités brutes ramenées à 100 %,
 *     pondérées par l'argent échangé ;
 * chacun avec le nombre de jeux qui l'ont fait.
 */
function probabilites(sources) {
  const jeux = [];
  const plus25 = [];
  for (const s of sources) {
    const echange = SOURCES_ECHANGE.has(s.source);
    for (const b of s.bookmakers) {
      for (const m of b.markets) {
        const valeur = (selection) => avantMatch(m.selections.find((x) => x.selection === selection) ?? { snapshots: [] });
        if (m.market === '1x2') {
          const [h, d, a] = ['home', 'draw', 'away'].map(valeur);
          if (!h || !d || !a) continue;
          if (echange) {
            const p = [h.prob ?? 1 / h.price, d.prob ?? 1 / d.price, a.prob ?? 1 / a.price];
            const total = p.reduce((x, y) => x + y, 0);
            if (!(total > 0.5 && total < 1.5)) continue;
            jeux.push({ echange: true, source: s.source, bookmaker: b.bookmaker, p: p.map((x) => x / total), poids: Math.max(1, h.volume ?? 0) });
          } else {
            const r = removeMargin([h.price, d.price, a.price]);
            if (r.anomaly) continue;
            jeux.push({ echange: false, source: s.source, bookmaker: b.bookmaker, p: r.probabilities, marge: r.overroundPercent });
          }
        }
        if (m.market === 'ou' && Math.abs(m.line - 2.5) < 1e-9 && !echange) {
          const [o, u] = ['over', 'under'].map(valeur);
          if (!o || !u) continue;
          const r = removeMargin([o.price, u.price]);
          if (!r.anomaly) plus25.push(r.probabilities[0]);
        }
      }
    }
  }
  const resume = (liste, pondere = false) => {
    if (!liste.length) return null;
    const poids = liste.map((j) => (pondere ? j.poids : 1));
    const total = poids.reduce((x, y) => x + y, 0);
    const p = [0, 1, 2].map((i) => liste.reduce((s, j, k) => s + j.p[i] * poids[k], 0) / total);
    return { home: arrondi(p[0]), draw: arrondi(p[1]), away: arrondi(p[2]), count: liste.length, books: liste.map((j) => `${j.bookmaker} · ${NOMS_DES_SOURCES[j.source] ?? j.source}`) };
  };
  const bookmakers = resume(jeux.filter((j) => !j.echange));
  const echanges = resume(jeux.filter((j) => j.echange), true);
  return {
    bookmakers,
    exchanges: echanges,
    over25: plus25.length ? { over: arrondi(moyenne(plus25)), under: arrondi(1 - moyenne(plus25)), count: plus25.length } : null,
    margins: jeux.filter((j) => !j.echange).map((j) => ({ bookmaker: j.bookmaker, source: j.source, margin: j.marge }))
  };
}

export async function getFixtureOdds(req, res) {
  const home = requireStringParam(req.query.home, 'home');
  const away = requireStringParam(req.query.away, 'away');
  const league = typeof req.query.league === 'string' ? req.query.league.trim() : '';
  const instant = typeof req.query.commenceTime === 'string' ? req.query.commenceTime : typeof req.query.date === 'string' ? req.query.date : null;
  const date = instant && Number.isFinite(Date.parse(instant)) ? new Date(Date.parse(instant.length === 10 ? `${instant}T12:00:00Z` : instant)).toISOString().slice(0, 10) : null;
  if (!date) throw new ApiError(400, 'Le paramètre "commenceTime" (ou "date") est requis.');
  const matchKey = typeof req.query.matchKey === 'string' && req.query.matchKey.trim() ? req.query.matchKey.trim() : null;

  const database = openDb();
  let homeId = null;
  let awayId = null;
  if (league) {
    try {
      homeId = clubDuMagasin(home, league, database);
      awayId = clubDuMagasin(away, league, database);
    } catch {
      homeId = awayId = null;
    }
  }
  const r = quotesForFixture({ matchKey, homeId, awayId, date, homeName: home, awayName: away, league: league || null }, { database });
  // Ce qui manque, et pourquoi (04/10/2026, Pierre : « pour toutes les
  // données que tu n'as pas sur les cotes, il faut que tu le notifies »).
  const kickoff = instant && instant.length > 10 ? new Date(Date.parse(instant)).toISOString() : null;
  let missing = [];
  try {
    missing = await fixtureGaps({ league, date, kickoff, homeId, awayId, homeName: home, awayName: away, quotes: r, database });
  } catch (error) {
    missing = [{ category: 'source', label: 'Cotes gratuites', reason: `impossible de dire ce qui manque : ${String(error.message).slice(0, 160)}` }];
  }
  res.json({
    fixture: { home, away, league: league || null, date, homeId, awayId, matchKey },
    count: r.count,
    sources: r.sources.map((s) => ({ ...s, name: NOMS_DES_SOURCES[s.source] ?? s.source, exchange: SOURCES_ECHANGE.has(s.source) })),
    probabilities: r.count ? probabilites(r.sources) : null,
    // Ce qui a bougé depuis l'ouverture, bookmaker par bookmaker (cf. marketMovement.js).
    movement: r.count ? movementForFixture(r, { home, away }) : [],
    missing,
    generatedAt: new Date().toISOString()
  });
}

export function getOddsStatus(req, res) {
  const database = openDb();
  let summary = { sources: [] };
  let backfill = [];
  try {
    summary = quotesSummary({ database, withQuotes: true });
    backfill = backfillProgress({ database });
  } catch {
    // Base d'avant les cotes gratuites : rien à dire, rien de cassé.
  }
  res.json({
    providers: FOURNISSEURS.map((f) => ({ key: f.cle, name: f.nom })),
    watch: getOddsWatchStatus(),
    summary,
    backfill,
    lastManual: dernierReleve
  });
}

/** Pour chaque compétition : ce qu'on a en cotes (passées, à venir, direct, volumes) et ce qui manque. */
export async function getOddsCoverage(req, res) {
  const jours = Number(req.query.days);
  res.json(await coverageReport({ days: Number.isFinite(jours) && jours > 0 && jours <= 30 ? jours : 7, force: req.query.force === '1' }));
}

/** Les chutes de cotes des matchs à venir (cf. droppingOdds.js). */
export function getDroppingOdds(req, res) {
  const jours = Number(req.query.days);
  const chute = Number(req.query.minDrop);
  res.json(
    droppingOdds({
      days: Number.isFinite(jours) && jours > 0 && jours <= 14 ? jours : 3,
      minDropPct: Number.isFinite(chute) && chute >= 0 && chute <= 80 ? chute : 5,
      force: req.query.force === '1'
    })
  );
}

/** La valeur de clôture des pronostics du moteur ou des paris (cf. closingValue.js). */
export async function getClosingValue(req, res) {
  const scope = req.query.scope === 'bets' ? 'bets' : 'predictions';
  res.json(await closingValueReport({ scope, force: req.query.force === '1' }));
}

let releveEnCours = null;
let dernierReleve = null;

/** Relevé immédiat des cotes des trois prochains jours : gratuit, donc permis à la demande. */
export async function postOddsRefresh(req, res) {
  if (!releveEnCours) {
    releveEnCours = (async () => {
      try {
        const r = await collectUpcomingOdds({ days: 3 });
        const fin = finalizeOdds();
        invalidateFreeMarketOdds();
        invalidateClosingValue();
        dernierReleve = { at: new Date().toISOString(), ...r, finalize: fin };
        return dernierReleve;
      } finally {
        releveEnCours = null;
      }
    })();
  }
  res.json(await releveEnCours);
}
