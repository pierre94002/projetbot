/**
 * droppingOdds.js — les chutes de cotes des matchs à venir (04/10/2026).
 * -----------------------------------------------------------------------
 * Pierre a vu la page « Dropping odds » d'Oddspedia, qu'on n'a pas le droit
 * de recopier. Les mêmes chutes se calculent sur NOS relevés gratuits (ESPN,
 * football-data.co.uk, 365Scores, Kalshi, Smarkets — cf. freeOdds.js), pour
 * les compétitions que suit CôteMaster : pour chaque issue, de combien la
 * cote juste a baissé entre l'ouverture et le dernier relevé d'avant-match,
 * bookmaker par bookmaker (cf. marketMovement.js).
 *
 * Une chute dit seulement que l'issue est davantage jouée — une information
 * (composition, blessure) ou de l'argent bien informé. Ce n'est jamais un
 * pari en soi : ces bookmakers ne sont pas jouables depuis la France.
 * -----------------------------------------------------------------------
 */

import { openDb } from './db/matchStatsDb.js';
import { quotesForFixture, sqlHorsPayantes } from './db/oddsQuotesRepository.js';
import { mouvements } from './marketMovement.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { listSeasonCalendar } from './repositories/seasonCalendarRepository.js';

const JOUR_MS = 86_400_000;
const CACHE_MS = 2 * 60 * 1000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const NOMS = { espn: 'ESPN', 'football-data.co.uk': 'football-data.co.uk', '365scores': '365Scores', kalshi: 'Kalshi', smarkets: 'Smarkets' };

/**
 * Les rencontres à venir qui ont des cotes relevées, une par affiche : les
 * sources ne datent pas toutes un match du même jour (fuseaux horaires), on
 * regroupe donc par paire d'identifiants FotMob et on garde le jour le plus
 * fréquent, l'heure exacte quand une source la donne.
 */
function affichesAVenir(database, debut, fin) {
  // Les relevés GRATUITS seulement : les cotes payantes archivées (étape E)
  // ne font pas des chutes « gratuites ».
  const lignes = database
    .prepare(`SELECT source, league, date, kickoff, home_id AS homeId, away_id AS awayId, home_name AS homeName, away_name AS awayName, match_key AS matchKey
              FROM odds_events WHERE date >= ? AND date <= ? AND ${sqlHorsPayantes()}`)
    .all(debut, fin);
  const groupes = new Map();
  for (const l of lignes) {
    const cle = l.homeId && l.awayId ? `${l.homeId}|${l.awayId}` : `${l.homeName}|${l.awayName}|${l.date}`;
    const g = groupes.get(cle) ?? { homeId: l.homeId, awayId: l.awayId, homeName: l.homeName, awayName: l.awayName, leagues: new Map(), dates: new Map(), kickoff: null, sources: new Set() };
    g.leagues.set(l.league, (g.leagues.get(l.league) ?? 0) + 1);
    g.dates.set(l.date, (g.dates.get(l.date) ?? 0) + 1);
    if (l.kickoff && (!g.kickoff || l.kickoff < g.kickoff)) g.kickoff = l.kickoff;
    g.sources.add(l.source);
    groupes.set(cle, g);
  }
  const plusFrequent = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return [...groupes.values()].map((g) => ({
    homeId: g.homeId,
    awayId: g.awayId,
    homeName: g.homeName,
    awayName: g.awayName,
    league: plusFrequent(g.leagues),
    date: g.kickoff ? g.kickoff.slice(0, 10) : plusFrequent(g.dates),
    kickoff: g.kickoff,
    sources: [...g.sources]
  }));
}

/**
 * L'identifiant de la page de chaque match à venir (`cal-…`, cf.
 * findAdaptedMatch) : les rencontres du calendrier de la période, indexées
 * par les identifiants FotMob de leurs deux clubs — jamais par le nom, que
 * chaque source écrit à sa façon.
 */
function pagesDesMatchs(database, debut, fin) {
  const index = new Map();
  const ids = new Map();
  const club = (nom, league) => {
    const cle = `${league}|${nom}`;
    if (!ids.has(cle)) {
      let id = null;
      try {
        id = clubDuMagasin(nom, league, database);
      } catch {
        id = null;
      }
      ids.set(cle, id);
    }
    return ids.get(cle);
  };
  let entrees = [];
  try {
    entrees = listSeasonCalendar().filter((e) => e.matchId && e.status !== 'finished' && e.date >= debut && e.date <= fin);
  } catch {
    entrees = [];
  }
  for (const e of entrees) {
    const h = club(e.homeName, e.league);
    const a = club(e.awayName, e.league);
    if (!h || !a) continue;
    const cle = `${h}|${a}`;
    if (!index.has(cle)) index.set(cle, []);
    index.get(cle).push({ matchId: e.matchId, date: e.date });
  }
  return (homeId, awayId, date) => {
    if (!homeId || !awayId || !date) return null;
    const t = Date.parse(`${date}T12:00:00Z`);
    const proche = (index.get(`${homeId}|${awayId}`) ?? []).find((x) => Math.abs(Date.parse(`${x.date}T12:00:00Z`) - t) <= JOUR_MS);
    return proche?.matchId ?? null;
  };
}

let cache = { cle: null, at: 0, valeur: null };

/**
 * Les chutes de cotes des `days` prochains jours, de la plus forte à la plus
 * faible. `minDropPct` : chute minimale de la cote juste pour figurer (5 %).
 * Chaque rencontre garde ses mouvements de plus de `minDropPct`, et la liste
 * dit aussi ce qui manque (pas de relevé, un seul relevé).
 */
export function droppingOdds({ days = 3, minDropPct = 5, force = false, database = openDb() } = {}) {
  const cle = `${days}|${minDropPct}`;
  if (!force && cache.cle === cle && Date.now() - cache.at < CACHE_MS) return cache.valeur;

  const maintenant = Date.now();
  const debut = iso(maintenant - JOUR_MS);
  const fin = iso(maintenant + days * JOUR_MS);
  let affiches = [];
  try {
    affiches = affichesAVenir(database, debut, fin);
  } catch {
    affiches = []; // tables des cotes absentes (base ancienne) : rien à mesurer
  }

  const pageDe = pagesDesMatchs(database, debut, iso(maintenant + (days + 1) * JOUR_MS));
  let avecMouvement = 0;
  let unSeulReleve = 0;
  const rencontres = [];
  const sourcesVues = new Set();
  for (const a of affiches) {
    // Avant-match seulement : une rencontre commencée sort de la liste.
    if (a.kickoff && Date.parse(a.kickoff) <= maintenant) continue;
    if (!a.kickoff && a.date < iso(maintenant)) continue;
    const fq = quotesForFixture({ homeId: a.homeId, awayId: a.awayId, homeName: a.homeName, awayName: a.awayName, date: a.date, league: a.league }, { database });
    if (!fq.count) continue;
    for (const s of fq.sources) sourcesVues.add(s.source);
    const mv = mouvements(fq, { home: a.homeName, away: a.awayName });
    if (!mv.length) {
      unSeulReleve++;
      continue;
    }
    avecMouvement++;
    const chutes = mv.filter((m) => m.dropPct >= minDropPct && m.agreeing > 0);
    if (!chutes.length) continue;
    rencontres.push({
      matchId: pageDe(a.homeId, a.awayId, a.date),
      league: a.league,
      date: a.date,
      kickoff: a.kickoff,
      homeId: a.homeId,
      awayId: a.awayId,
      homeName: a.homeName,
      awayName: a.awayName,
      sources: a.sources.map((s) => NOMS[s] ?? s),
      maxDropPct: chutes[0].dropPct,
      drops: chutes.map((m) => ({
        ...m,
        bookmakers: m.bookmakers.map((b) => ({ ...b, sourceName: NOMS[b.source] ?? b.source }))
      }))
    });
  }
  rencontres.sort((x, y) => y.maxDropPct - x.maxDropPct);

  const valeur = {
    generatedAt: new Date().toISOString(),
    days,
    minDropPct,
    fixtures: rencontres,
    coverage: {
      upcomingWithQuotes: affiches.length,
      withMovement: avecMouvement,
      singleReading: unSeulReleve,
      sources: [...sourcesVues].map((s) => NOMS[s] ?? s)
    },
    // Ce qui manque, dit en clair (règle de Pierre du 04/10/2026).
    missing: !affiches.length
      ? ["Aucune cote relevée pour les prochains jours : la collecte gratuite n'a pas encore tourné sur ce serveur (relancez CôteMaster si vous venez de le mettre à jour)."]
      : unSeulReleve && !avecMouvement
      ? ["Un seul relevé par match pour l'instant : une chute se mesure entre deux relevés, il faut attendre le suivant (toutes les 5 minutes dans les 2 h avant le coup d'envoi, une fois par jour au-delà)."]
      : []
  };
  cache = { cle, at: Date.now(), valeur };
  return valeur;
}

/** Les mouvements d'une seule rencontre (onglet « Cotes » d'un match). */
export function movementForFixture(fq, { home, away } = {}) {
  return mouvements(fq, { home, away });
}
