/**
 * freeMarketOdds.js — les cotes gratuites d'un match à venir, pour la liste des matchs et le moteur.
 * -----------------------------------------------------------------------
 * Un match du calendrier FotMob n'avait aucune cote tant que The Odds API
 * (relevé payant, à la main) ne le couvrait pas : le moteur prédisait alors
 * avec le modèle de buts tempéré (46,4 % de résultats justes) au lieu des
 * cotes (50,3 %, mesuré le 23/09/2026). Depuis le 04/10/2026, les cotes
 * gratuites relevées par l'appli (ESPN, football-data, 365Scores, Kalshi,
 * Smarkets — voir freeOdds.js) prennent cette place.
 *
 * Elles servent à CALCULER une probabilité, jamais à parier : aucun de ces
 * bookmakers n'est jouable depuis la France (DraftKings, la bourse Betfair),
 * ou ils ne sont pas les vôtres. Chaque ligne porte donc `referenceOnly` :
 * le chercheur de value (valueFinder.js) ne la propose jamais comme pari.
 *
 * La cote affichée (odds1/oddsDraw/odds2) est la MOYENNE des bookmakers,
 * marge comprise, comme celle de The Odds API ; les prix d'échange (Kalshi,
 * Smarkets) n'y entrent que faute de bookmaker, et seulement quand assez
 * d'argent s'y est échangé pour qu'ils veuillent dire quelque chose.
 * -----------------------------------------------------------------------
 */

import { openDb } from './db/matchStatsDb.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { latestPrematch1x2, SOURCES_ECHANGE } from './db/oddsQuotesRepository.js';

export const NOMS_DES_SOURCES = {
  espn: 'ESPN',
  kalshi: 'Kalshi',
  smarkets: 'Smarkets',
  '365scores': '365Scores',
  'football-data.co.uk': 'football-data.co.uk'
};

/** Les clés que le moteur connaît déjà (paliers de valueFinder.js). */
const CLES_CONNUES = { 'Betfair Exchange': 'betfair_ex_eu', Pinnacle: 'pinnacle' };
/** En dessous, un prix d'échange tient à quelques ordres : il ne dit rien du match. */
const VOLUME_MIN_ECHANGE = 5000;
const CACHE_MS = 60_000;

const JOUR_MS = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const arrondi = (x) => Math.round(x * 1000) / 1000;
const cleDe = (b) => CLES_CONNUES[b.bookmaker] ?? `${b.source}-${b.bookmaker}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_');

let cache = { at: 0, jour: null, map: null };
/** Les dernières cotes 1x2 de tous les matchs à venir, relues au plus une fois par minute. */
function cotesAVenir(database) {
  const jour = iso(Date.now());
  if (cache.map && cache.jour === jour && Date.now() - cache.at < CACHE_MS) return cache.map;
  let map = new Map();
  try {
    map = latestPrematch1x2({ from: iso(Date.now() - JOUR_MS), to: iso(Date.now() + 60 * JOUR_MS), database });
  } catch {
    map = new Map(); // tables absentes (base ancienne) : pas de cote gratuite, rien de cassé
  }
  cache = { at: Date.now(), jour, map };
  return map;
}

/** Vide le cache : après une collecte, la liste doit voir les nouvelles cotes sans attendre. */
export function invalidateFreeMarketOdds() {
  cache = { at: 0, jour: null, map: null };
}

const clubs = new Map();
function club(nom, league, database) {
  const cle = `${league}|${nom}`;
  if (!clubs.has(cle)) {
    let id = null;
    try {
      id = clubDuMagasin(nom, league, database);
    } catch {
      id = null;
    }
    clubs.set(cle, id);
  }
  return clubs.get(cle);
}

/**
 * Les cotes gratuites d'un match à venir, au format `marketOdds` du moteur
 * (cf. oddsApiAdapter.js), ou null. `date` : le jour UTC du calendrier.
 */
export function freeMarketOddsFor({ league, date, homeName, awayName, database = openDb() }) {
  if (!league || !date || !homeName || !awayName) return null;
  const homeId = club(homeName, league, database);
  const awayId = club(awayName, league, database);
  if (!homeId || !awayId) return null;
  const map = cotesAVenir(database);
  const t = Date.parse(`${date}T00:00:00Z`);
  const livres =
    map.get(`${homeId}|${awayId}|${date}`) ?? map.get(`${homeId}|${awayId}|${iso(t - JOUR_MS)}`) ?? map.get(`${homeId}|${awayId}|${iso(t + JOUR_MS)}`) ?? null;
  return coteDuMarcheDesLivres(livres, { date });
}

/**
 * La cote du marché d'un match, au format `marketOdds` du moteur, depuis ses livres complets (la forme de
 * latestPrematch1x2 : { source, bookmaker, odds1, oddsDraw, odds2, volume, releveAt, kind, kickoff }), ou
 * null. Séparée de freeMarketOddsFor (le 13/10/2026, étape 19) pour que le banc d'essai construise les cotes
 * gratuites d'un match passé EXACTEMENT comme le moteur les lit aujourd'hui, sans recopie ; rien n'a changé
 * dans la construction. `date` : le jour UTC du match (l'heure du coup d'envoi n'est prise que ce jour-là).
 */
export function coteDuMarcheDesLivres(livres, { date = null } = {}) {
  if (!livres?.length) return null;

  // Le « maximum du marché » (football-data) est la meilleure cote de chaque issue prise chez des
  // bookmakers différents : un jeu sans marge réelle, qui gonflerait la moyenne. Écarté.
  const utiles = livres.filter((b) => b.bookmaker !== 'Maximum du marché' && (!SOURCES_ECHANGE.has(b.source) || (b.volume ?? 0) >= VOLUME_MIN_ECHANGE));
  if (!utiles.length) return null;
  const bookmakers = utiles.filter((b) => !SOURCES_ECHANGE.has(b.source));
  const base = bookmakers.length ? bookmakers : utiles;
  const moyenne = (champ) => arrondi(base.reduce((s, b) => s + b[champ], 0) / base.length);
  const releves = utiles.map((b) => b.releveAt).filter(Boolean).sort();
  // L'heure exacte du coup d'envoi, si une source la donne pour CE jour-là.
  const kickoff = utiles.map((b) => b.kickoff).find((k) => k && k.slice(0, 10) === date) ?? null;

  return {
    odds1: moyenne('odds1'),
    oddsDraw: moyenne('oddsDraw'),
    odds2: moyenne('odds2'),
    bookmakersCount: base.length,
    byBookmaker: utiles.map((b) => ({
      key: cleDe(b),
      title: `${b.bookmaker} · ${NOMS_DES_SOURCES[b.source] ?? b.source}`,
      odds1: b.odds1,
      oddsDraw: b.oddsDraw,
      odds2: b.odds2,
      referenceOnly: true,
      source: b.source,
      kind: b.kind,
      volume: b.volume ?? null,
      releveAt: b.releveAt
    })),
    source: 'gratuit',
    sources: [...new Set(utiles.map((b) => b.source))],
    releveAt: releves.at(-1) ?? null,
    kickoff
  };
}
