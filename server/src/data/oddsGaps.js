/**
 * oddsGaps.js — ce qui MANQUE dans les cotes, dit en clair.
 * -----------------------------------------------------------------------
 * 04/10/2026, Pierre : « pour toutes les données que tu n'as pas sur les
 * cotes, il faut que tu le notifies, que je le voie dans CôteMaster ».
 *
 * Deux lectures :
 *   - fixtureGaps : pour UN match, chaque cote absente et sa raison — la
 *     source ne couvre pas la compétition, elle n'a encore rien publié, elle
 *     a cherché sans trouver (raison notée au relevé : « match introuvable »,
 *     « nom d'équipe non reconnu »…), le marché n'existe chez aucune source
 *     gratuite, pas de volumes, pas de direct, pas d'historique ;
 *   - coverageReport : pour CHAQUE compétition du magasin, ce qu'on a
 *     (cotes passées, cotes à venir, direct, volumes, et de quelle source)
 *     et ce qui manque.
 * Rien n'est inventé : une absence est dite telle qu'elle est, avec sa cause
 * quand on la connaît.
 * -----------------------------------------------------------------------
 */

import { openDb } from './db/matchStatsDb.js';
import { missesForFixture, SOURCES_ECHANGE, sqlHorsPayantes } from './db/oddsQuotesRepository.js';
import { providerCoverage } from './providers/freeOdds.js';
import { listSeasonCalendar } from './repositories/seasonCalendarRepository.js';

const JOUR_MS = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);

const MARCHES = { '1x2': 'Résultat 1 / N / 2', ou: 'Plus / moins de buts', ah: 'Handicap asiatique', btts: 'Les deux équipes marquent' };
/** Marchés que le moteur sait calculer mais qu'AUCUNE source gratuite ne cote. */
const MARCHES_SANS_SOURCE = ['Corners', 'Tirs et tirs cadrés', 'Cartons', 'Score exact'];

let cacheHistorique = { at: 0, set: null };
/** Compétitions qui ont des cotes passées au profilage (match_odds), gardé dix minutes. */
function competitionsAvecHistorique(database) {
  if (cacheHistorique.set && Date.now() - cacheHistorique.at < 600_000) return cacheHistorique.set;
  let set = new Set();
  try {
    set = new Set(database.prepare('SELECT DISTINCT m.league FROM match_odds o JOIN matches m ON m.match_key = o.match_key').all().map((r) => r.league));
  } catch {
    set = new Set();
  }
  cacheHistorique = { at: Date.now(), set };
  return set;
}

const accord = (liste, un, plusieurs) => (liste.length > 1 ? plusieurs : un);

/**
 * Les cotes absentes d'un match. `quotes` : la réponse de quotesForFixture.
 * Rend [{ category, label, source?, reason, checkedAt?, note? }] ;
 * `category` ∈ source | marche | volumes | direct | historique | francais.
 */
export async function fixtureGaps({ league, date, kickoff = null, homeId = null, awayId = null, homeName = null, awayName = null, quotes = null, database = openDb() }) {
  const couverture = await providerCoverage();
  const sources = quotes?.sources ?? [];
  const presentes = new Set(sources.map((s) => s.source));
  let raisons = new Map();
  try {
    raisons = new Map(missesForFixture({ homeId, awayId, homeName, awayName, date }, { database }).map((m) => [m.source, m]));
  } catch {
    raisons = new Map();
  }
  const coup = kickoff ? Date.parse(kickoff) : Date.parse(`${date}T12:00:00Z`);
  const aVenir = !Number.isFinite(coup) || coup > Date.now();
  const gaps = [];

  // 1. Les sources, une par une.
  for (const p of couverture) {
    if (presentes.has(p.source)) continue;
    const base = { category: 'source', source: p.source, label: p.nom };
    if (!p.charge) gaps.push({ ...base, reason: 'connecteur indisponible sur ce serveur' });
    else if (!p.ligues.has(league)) gaps.push({ ...base, reason: 'ne couvre pas cette compétition' });
    else if (raisons.has(p.source)) gaps.push({ ...base, reason: raisons.get(p.source).reason, checkedAt: raisons.get(p.source).checkedAt });
    else if (aVenir) gaps.push({ ...base, reason: "pas encore de cote publiée (relevé toutes les 3 h, puis toutes les 5 min dans les 2 h avant le coup d'envoi)" });
    else gaps.push({ ...base, reason: 'aucune cote relevée pour ce match' });
  }

  // 2. Les marchés.
  const marches = new Set();
  let direct = false;
  let echange = false;
  for (const s of sources) {
    if (SOURCES_ECHANGE.has(s.source)) echange = true;
    for (const b of s.bookmakers) {
      for (const m of b.markets) {
        marches.add(m.market);
        if (m.selections.some((sel) => sel.live?.length)) direct = true;
      }
    }
  }
  for (const [cle, label] of Object.entries(MARCHES)) {
    if (marches.has(cle)) continue;
    const capables = couverture.filter((p) => p.ligues.has(league) && p.couverture?.marches?.includes(cle)).map((p) => p.nom);
    const indisponibles = couverture.filter((p) => !p.charge).map((p) => p.nom);
    gaps.push({
      category: 'marche',
      label,
      reason: !capables.length && indisponibles.length
        ? `aucune cote : connecteur${indisponibles.length > 1 ? 's' : ''} indisponible${indisponibles.length > 1 ? 's' : ''} (${indisponibles.join(', ')})`
        : capables.length
        ? `aucune cote relevée pour ce match (${capables.join(', ')} ${accord(capables, 'peut', 'peuvent')} en publier)`
        : 'aucune source gratuite ne publie ce marché pour cette compétition'
    });
  }
  for (const label of MARCHES_SANS_SOURCE) {
    gaps.push({ category: 'marche', label, reason: 'aucune source gratuite ne publie ce marché : le moteur le calcule sans cote de référence' });
  }

  // 3. L'argent misé.
  if (!echange) {
    const couvrent = couverture.filter((p) => SOURCES_ECHANGE.has(p.source) && p.ligues.has(league)).map((p) => p.nom);
    gaps.push({
      category: 'volumes',
      label: 'Argent misé (volumes)',
      reason: couvrent.length
        ? `${couvrent.join(' et ')} ${accord(couvrent, "n'a", "n'ont")} pas de marché ouvert sur ce match`
        : 'ni Kalshi ni Smarkets ne couvrent cette compétition',
      note: 'Betfair, la source de référence des volumes, est fermé aux résidents français depuis 2010 ; Polymarket est bloqué par l’ANJ.'
    });
  }

  // 4. Le direct, une fois le match commencé.
  if (!aVenir && !direct) {
    const capables = couverture.filter((p) => p.ligues.has(league) && p.couverture?.live).map((p) => p.nom);
    gaps.push({
      category: 'direct',
      label: 'Cotes en direct',
      reason: capables.length ? `aucune cote en direct relevée (${capables.join(', ')})` : 'aucune source gratuite ne publie le direct de cette compétition'
    });
  }

  // 5. L'historique de la compétition (profilage de cotes).
  if (!competitionsAvecHistorique(database).has(league)) {
    gaps.push({ category: 'historique', label: 'Cotes passées de la compétition', reason: "aucune encore : le profilage de cotes reste vide tant que le rattrapage de l'historique n'a rien rapporté" });
  }

  // 6. Les bookmakers français : l'interface retire cette ligne quand le relevé The Odds API cote le match.
  gaps.push({
    category: 'francais',
    label: 'Cotes des bookmakers français (Winamax, Betclic, Unibet, PMU)',
    reason: 'aucune source gratuite ne les publie : seul le relevé The Odds API, fait à la main, les donne'
  });
  return gaps;
}

let cacheCouverture = { at: 0, valeur: null };
const COUVERTURE_MS = 5 * 60_000;

/**
 * Pour chaque compétition du magasin : cotes passées (rencontres jouées
 * cotées / jouées, sources), cotes à venir sur `days` jours (rencontres
 * cotées / à venir, sources), direct et volumes possibles, et ce qui manque.
 */
export async function coverageReport({ database = openDb(), days = 7, force = false } = {}) {
  if (!force && cacheCouverture.valeur && Date.now() - cacheCouverture.at < COUVERTURE_MS) return cacheCouverture.valeur;
  const couverture = await providerCoverage();
  const aujourdHui = iso(Date.now());
  const fin = iso(Date.now() + days * JOUR_MS);

  const historique = new Map(
    database
      .prepare(`SELECT m.league, COUNT(*) AS joues, COUNT(o.match_key) AS cotees FROM matches m LEFT JOIN match_odds o ON o.match_key = m.match_key
                WHERE m.home_goals IS NOT NULL GROUP BY m.league`)
      .all()
      .map((r) => [r.league, r])
  );
  const sourcesHistorique = new Map();
  for (const r of database.prepare('SELECT m.league, o.source, COUNT(*) AS n FROM match_odds o JOIN matches m ON m.match_key = o.match_key GROUP BY m.league, o.source').all()) {
    if (!sourcesHistorique.has(r.league)) sourcesHistorique.set(r.league, []);
    sourcesHistorique.get(r.league).push({ source: r.source, count: r.n });
  }

  const aVenir = new Map();
  for (const e of listSeasonCalendar({ allSeasons: true })) {
    if (e.date < aujourdHui || e.date > fin || e.status === 'finished' || e.status === 'postponed' || e.homeGoals != null || !e.league) continue;
    aVenir.set(e.league, (aVenir.get(e.league) ?? 0) + 1);
  }
  const coteesAVenir = new Map();
  const sourcesAVenir = new Map();
  try {
    // Les cotes GRATUITES seulement : les cotes payantes archivées (étape E)
    // ne disent rien de ce que couvrent les sources gratuites.
    for (const r of database
      .prepare(`SELECT league, COUNT(DISTINCT COALESCE(home_id, home_name) || '|' || COALESCE(away_id, away_name) || '|' || date) AS n FROM odds_events
                WHERE date >= ? AND date <= ? AND ${sqlHorsPayantes()} GROUP BY league`)
      .all(aujourdHui, fin)) coteesAVenir.set(r.league, r.n);
    for (const r of database.prepare(`SELECT league, source, COUNT(*) AS n FROM odds_events WHERE date >= ? AND date <= ? AND ${sqlHorsPayantes()} GROUP BY league, source`).all(aujourdHui, fin)) {
      if (!sourcesAVenir.has(r.league)) sourcesAVenir.set(r.league, []);
      sourcesAVenir.get(r.league).push({ source: r.source, count: r.n });
    }
  } catch {
    // tables absentes : aucune cote gratuite encore
  }

  const ligues = [...new Set([...historique.keys(), ...aVenir.keys()])].sort((a, b) => a.localeCompare(b, 'fr'));
  const competitions = ligues.map((league) => {
    const h = historique.get(league) ?? { joues: 0, cotees: 0 };
    const couvrent = couverture.filter((p) => p.ligues.has(league));
    const avantMatch = couvrent.filter((p) => p.couverture?.avantMatch !== false).map((p) => p.nom);
    const direct = couvrent.filter((p) => p.couverture?.live).map((p) => p.nom);
    const volumes = couvrent.filter((p) => SOURCES_ECHANGE.has(p.source)).map((p) => p.nom);
    const nbAVenir = aVenir.get(league) ?? 0;
    const nbCotees = Math.min(coteesAVenir.get(league) ?? 0, nbAVenir || Infinity);
    const manques = [];
    if (!h.cotees) manques.push('aucune cote passée (profilage impossible)');
    else if (h.joues && h.cotees / h.joues < 0.8) manques.push(`cotes passées incomplètes : ${h.cotees} rencontres sur ${h.joues}`);
    if (!avantMatch.length) manques.push('aucune source gratuite ne cote ses matchs à venir');
    else if (nbAVenir && !nbCotees) manques.push(`aucun des ${nbAVenir} matchs des ${days} prochains jours n'est encore coté`);
    else if (nbAVenir && nbCotees < nbAVenir) manques.push(`${nbAVenir - nbCotees} match(s) sur ${nbAVenir} des ${days} prochains jours sans cote`);
    if (!direct.length) manques.push('pas de cote en direct');
    if (!volumes.length) manques.push('pas de volumes (ni Kalshi ni Smarkets)');
    return {
      league,
      history: { played: h.joues, withOdds: h.cotees, sources: sourcesHistorique.get(league) ?? [] },
      upcoming: { fixtures: nbAVenir, withOdds: nbCotees, sources: sourcesAVenir.get(league) ?? [] },
      coveredBy: { prematch: avantMatch, live: direct, volumes },
      missing: manques
    };
  });

  const valeur = {
    generatedAt: new Date().toISOString(),
    days,
    providers: couverture.map((p) => ({ source: p.source, name: p.nom, loaded: p.charge, error: p.erreur, leagues: p.ligues.size, coverage: p.couverture })),
    competitions,
    totals: {
      competitions: competitions.length,
      withoutHistory: competitions.filter((c) => !c.history.withOdds).length,
      withoutPrematchSource: competitions.filter((c) => !c.coveredBy.prematch.length).length,
      withoutLive: competitions.filter((c) => !c.coveredBy.live.length).length,
      withoutVolumes: competitions.filter((c) => !c.coveredBy.volumes.length).length
    }
  };
  cacheCouverture = { at: Date.now(), valeur };
  return valeur;
}
