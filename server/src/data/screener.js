/**
 * screener.js — l'écran de repérage (04/10/2026).
 * -----------------------------------------------------------------------
 * L'idée de Datafoot (classer les matchs à venir par marché), faite comme
 * il faut : on classe par la PROBABILITÉ DU MOTEUR, à côté de la cote du
 * marché, et on donne le contexte qu'un parieur vérifie à la main —
 * moyenne du championnat, fréquence de chaque équipe à domicile ou à
 * l'extérieur AVEC le nombre de matchs, et une estimation ramenée vers la
 * moyenne (un 5 sur 5 ne passe plus devant un 30 sur 38).
 *
 * Le moteur tourne sur chaque match à venir de la page Matchs, en arrière-
 * plan et SANS REPLI PAYANT (enrichMatchWithRealAverages, sansRepliPayant) :
 * le magasin FotMob seulement. Le résultat est gardé 30 minutes ; une
 * demande pendant le calcul reçoit l'avancement.
 *
 * Étape 8 du plan (06/10/2026) — c'est aussi l'état préparé de la page
 * « Opportunités du jour » (data/opportunities.js) :
 *   - le VERDICT du moteur sur chaque issue 1N2 (core/engine/verdictPari.js)
 *     est pris À LA LECTURE, avec la même fonction et les mêmes entrées que
 *     l'analyse d'un match (onglet « Value bets » de Mes paris, page du
 *     match) : les cotes du match gardées au calcul, l'heure de chaque cote,
 *     le réglage de fraîcheur, les réglages du moteur et le coupe-circuit du
 *     moment. Le vert du Repérage n'est plus sa propre lecture : c'est le
 *     verdict de findValueBet, « juge et partie » compris ;
 *   - le mouvement de chaque marché depuis l'ouverture (mouvements de
 *     marketMovement.js, les mêmes chiffres que les Chutes de cotes) ;
 *   - un nouveau relevé The Odds API (le fichier de l'instantané change)
 *     rend le calcul périmé : il se refait à la lecture suivante.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { openDb } from './db/matchStatsDb.js';
import { listAdaptedMatches } from './matchSources.js';
import { enrichMatchWithRealAverages } from './providers/matchEnrichment.js';
import { analyzeMatch } from '../core/engine/oddsEngine.js';
import { getEngineConfig } from '../core/engine/engineConfig.js';
import { getTiltState } from '../core/engine/tiltState.js';
import { getSport } from '../sports/index.js';
import { quotesForFixture } from './db/oddsQuotesRepository.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { livresA, probabiliteMarche, mouvements } from './marketMovement.js';
import { countsForTable, seasonsForLeague } from './db/matchStatsRead.js';
import { seasonBounds } from './providers/seasonWindows.js';
import { estJouable, coteJouable } from '../core/engine/valueFinder.js';
import { fraicheurCote } from '../core/engine/fraicheurCotes.js';
import { heuresDesCotesPayantes } from './cotesDeVosBookmakers.js';
import { lireReglageFraicheur } from './repositories/fraicheurCotesRepository.js';
import { getFixturePaths } from './repositories/fixturesRepository.js';
import { decisionDePari } from '../core/engine/verdictPari.js';
import { aUneDerniereComposition } from './db/derniereComposition.js';
import { carteDesLecteurs, avecLaCarteSurLeReperage } from './bettingMap.js';

const TTL_MS = 30 * 60 * 1000;
const JOURS = 7;
/** Une chute de cote compte à partir de 5 % (la règle de la page Chutes de cotes, droppingOdds.js). */
export const CHUTE_MIN_PCT = 5;
// Force du « retour vers la moyenne » : une équipe compte comme si elle
// avait joué en plus 8 matchs à la moyenne de son championnat.
const PRIOR_MATCHS = 8;

/**
 * Les marchés de l'écran. `issue` dit, pour un match joué vu du côté d'une
 * équipe (`pour`, `contre` : ses buts et ceux de l'adversaire), si
 * l'événement s'est produit ; `quote` est l'issue cotée correspondante.
 */
export const MARCHES = [
  { key: 'home', group: 'Résultat', label: 'Victoire à domicile', engine: (t) => t.home, quote: ['1x2', 0, 'home'], domicile: (p, c) => p > c, exterieur: (p, c) => p < c, ligue: (h, a) => h > a },
  { key: 'draw', group: 'Résultat', label: 'Match nul', engine: (t) => t.draw, quote: ['1x2', 0, 'draw'], domicile: (p, c) => p === c, exterieur: (p, c) => p === c, ligue: (h, a) => h === a },
  { key: 'away', group: 'Résultat', label: 'Victoire à l’extérieur', engine: (t) => t.away, quote: ['1x2', 0, 'away'], domicile: (p, c) => p < c, exterieur: (p, c) => p > c, ligue: (h, a) => h < a },
  { key: 'over15', group: 'Buts', label: 'Plus de 1,5 buts', engine: (t) => t.over15, quote: ['ou', 1.5, 'over'], domicile: (p, c) => p + c > 1.5, exterieur: (p, c) => p + c > 1.5, ligue: (h, a) => h + a > 1.5 },
  { key: 'over25', group: 'Buts', label: 'Plus de 2,5 buts', engine: (t) => t.over25, quote: ['ou', 2.5, 'over'], domicile: (p, c) => p + c > 2.5, exterieur: (p, c) => p + c > 2.5, ligue: (h, a) => h + a > 2.5 },
  { key: 'under25', group: 'Buts', label: 'Moins de 2,5 buts', engine: (t) => t.under25, quote: ['ou', 2.5, 'under'], domicile: (p, c) => p + c < 2.5, exterieur: (p, c) => p + c < 2.5, ligue: (h, a) => h + a < 2.5 },
  { key: 'over35', group: 'Buts', label: 'Plus de 3,5 buts', engine: (t) => t.over35, quote: ['ou', 3.5, 'over'], domicile: (p, c) => p + c > 3.5, exterieur: (p, c) => p + c > 3.5, ligue: (h, a) => h + a > 3.5 },
  { key: 'bttsYes', group: 'Les deux équipes marquent', label: 'Les deux équipes marquent', engine: (t) => t.bttsYes, quote: ['btts', 0, 'yes'], domicile: (p, c) => p > 0 && c > 0, exterieur: (p, c) => p > 0 && c > 0, ligue: (h, a) => h > 0 && a > 0 },
  { key: 'bttsNo', group: 'Les deux équipes marquent', label: 'Une équipe au moins ne marque pas', engine: (t) => t.bttsNo, quote: ['btts', 0, 'no'], domicile: (p, c) => p === 0 || c === 0, exterieur: (p, c) => p === 0 || c === 0, ligue: (h, a) => h === 0 || a === 0 }
];

const inverse = (cote) => (Number(cote) > 1 ? 1 / Number(cote) : null);

/**
 * Les probabilités du moteur par marché, lues dans `trueOdds` (cotes justes). Étape 27 : quand le modèle de buts
 * unique a calculé le match (`modeleDeButs`), les marchés de buts se lisent dans `distributions` (6 décimales) —
 * l'arrondi des cotes justes au centième (jusqu'à 0,23 point) vaudrait l'écart attendu avec le marché sur la ligne
 * 2,5, où le moteur part de la cote ; sans lui, rien ne change.
 */
function probabilitesMoteur(resultat) {
  const t = resultat?.trueOdds ?? {};
  const base = {
    home: inverse(t.home),
    draw: inverse(t.draw),
    away: inverse(t.away),
    over15: inverse(t.over15),
    over25: inverse(t.over25),
    under25: inverse(t.under25),
    over35: inverse(t.over35),
    bttsYes: inverse(t.bothTeamsScore),
    bttsNo: inverse(t.bothTeamsScoreNo)
  };
  const d = resultat?.modeleDeButs ? resultat.distributions : null;
  if (!d) return base;
  const fini = (x) => (Number.isFinite(x) ? x : null);
  return {
    ...base,
    over15: fini(d.totalGoals?.[1.5]?.over),
    over25: fini(d.totalGoals?.[2.5]?.over),
    under25: fini(d.totalGoals?.[2.5]?.under),
    over35: fini(d.totalGoals?.[3.5]?.over),
    bttsYes: fini(d.bothTeamsScore?.yes),
    bttsNo: fini(d.bothTeamsScore?.no)
  };
}

/** Étape 27 : le régime du modèle de buts d'un match du Repérage, avec ce que la pastille de provenance dit (utils/modeleDeButs.js de l'écran). */
function butsProvenanceDe(resultat) {
  const m = resultat.modeleDeButs;
  const surCotes = resultat.prediction?.source === 'cotes';
  return {
    ...m.provenance,
    plusMoins: m.plusMoins ? { source: m.plusMoins.source ?? null, releveAt: m.plusMoins.releveAt ?? null } : null,
    poids: m.poids ?? null,
    livres: surCotes ? (resultat.prediction?.referenceBooks ?? null) : null,
    titres: surCotes ? (resultat.market?.byBookmaker ?? []).map((x) => x?.title ?? x?.key ?? null).filter(Boolean) : null,
    bookmakers: resultat.market?.bookmakersCount ?? null,
    // « défaut » : les moyennes par défaut du moteur (le championnat est inconnu du magasin) — dites telles quelles.
    ligueSource: m.statistiques?.ligue?.source ?? null
  };
}

const lireMeta = (texte) => {
  try {
    return texte ? JSON.parse(texte) : null;
  } catch {
    return null;
  }
};

/**
 * Les fréquences de la saison en cours d'un championnat : celle de la
 * ligue, et celles de chaque équipe à domicile et à l'extérieur (avec leur
 * nombre de matchs). Une lecture par championnat et par calcul.
 */
function frequencesDeLaLigue(league, database) {
  const saison = seasonsForLeague(league, { database })[0]?.season ?? null;
  if (!saison) return null;
  const [debut, fin] = seasonBounds(league, saison);
  const matchs = database
    .prepare(
      `SELECT home_id, away_id, home_goals AS hg, away_goals AS ag, meta FROM matches
       WHERE league = ? AND home_goals IS NOT NULL AND away_goals IS NOT NULL AND date >= ? AND date < ?`
    )
    .all(league, debut, fin)
    .filter((m) => countsForTable(lireMeta(m.meta)));
  if (!matchs.length) return null;

  const ligue = Object.fromEntries(MARCHES.map((m) => [m.key, matchs.filter((x) => m.ligue(x.hg, x.ag)).length / matchs.length]));
  const equipes = new Map();
  const fiche = (id) => {
    if (!equipes.has(id)) equipes.set(id, { home: { n: 0, k: {} }, away: { n: 0, k: {} } });
    return equipes.get(id);
  };
  for (const x of matchs) {
    if (x.home_id) {
      const f = fiche(String(x.home_id)).home;
      f.n++;
      for (const m of MARCHES) if (m.domicile(x.hg, x.ag)) f.k[m.key] = (f.k[m.key] ?? 0) + 1;
    }
    if (x.away_id) {
      const f = fiche(String(x.away_id)).away;
      f.n++;
      for (const m of MARCHES) if (m.exterieur(x.ag, x.hg)) f.k[m.key] = (f.k[m.key] ?? 0) + 1;
    }
  }
  return { season: saison, matches: matchs.length, ligue, equipes };
}

function contexte(freq, homeId, awayId, marche) {
  if (!freq) return null;
  const moyenne = freq.ligue[marche.key];
  const lire = (id, cote) => {
    const f = id ? freq.equipes.get(String(id))?.[cote] : null;
    if (!f?.n) return { hits: 0, n: 0, rate: null, shrunk: moyenne };
    const hits = f.k[marche.key] ?? 0;
    return { hits, n: f.n, rate: hits / f.n, shrunk: (hits + PRIOR_MATCHS * moyenne) / (f.n + PRIOR_MATCHS) };
  };
  const dom = lire(homeId, 'home');
  const ext = lire(awayId, 'away');
  return {
    leagueRate: moyenne,
    leagueMatches: freq.matches,
    home: dom,
    away: ext,
    // Les deux équipes ensemble, chacune ramenée vers la moyenne : le chiffre
    // que Datafoot montrait brut et sans nombre de matchs.
    combined: (dom.shrunk + ext.shrunk) / 2
  };
}

/**
 * La meilleure cote JOUABLE d'une issue 1N2 : la règle du moteur (estJouable,
 * cf. valueFinder.js) — vos bookmakers cochés dans Réglages, jamais une cote
 * de référence, jamais une bourse non cochée —, et la cote nette.
 */
function meilleureCoteJouable(match, issue, config) {
  const champ = { home: 'odds1', draw: 'oddsDraw', away: 'odds2' }[issue];
  if (!champ) return null;
  let meilleure = null;
  for (const b of match.marketOdds?.byBookmaker ?? []) {
    if (!estJouable(b, config)) continue;
    const cote = Number(coteJouable(b, champ));
    if (cote > 1 && (!meilleure || cote > meilleure.odds)) meilleure = { odds: cote, bookmaker: b.title ?? b.key ?? null, key: b.key ?? null };
  }
  return meilleure;
}

/**
 * La fraîcheur de chaque cote jouable (étape 7 du plan), jugée À LA LECTURE :
 * le tableau est gardé 30 minutes, une cote fraîche au calcul peut ne plus
 * l'être quand on le lit. L'heure de la cote vient des archives (bestOddsAt,
 * cf. cotesDeVosBookmakers.js).
 */
export function avecFraicheur(data, { maintenant = Date.now(), reglage = null } = {}) {
  if (!data?.matches) return data;
  reglage ??= lireReglageFraicheur().reglage;
  return {
    ...data,
    freshness: { reglage, evalueeLe: new Date(maintenant).toISOString() },
    matches: data.matches.map((m) => ({
      ...m,
      markets: (m.markets ?? []).map((k) =>
        k.bestOdds == null ? k : { ...k, freshness: fraicheurCote({ releveAt: k.bestOddsAt ?? null, maintenant, coupDEnvoi: m.commenceTime, heureSure: Boolean(m.exactKickoff), reglage }) }
      )
    }))
  };
}

/** La date du fichier de l'instantané The Odds API (null s'il n'existe pas) : elle change à chaque relevé payant. */
function dateDeLInstantane() {
  try {
    return fs.statSync(getFixturePaths().odds).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Le mouvement d'un marché depuis l'ouverture (cf. marketMovement.js,
 * mouvements) : les mêmes chiffres que la page Chutes de cotes, et `chute`
 * quand la cote juste a baissé d'au moins CHUTE_MIN_PCT avec au moins un
 * bookmaker dans ce sens — la règle de droppingOdds.js.
 */
function mouvementDe(liste, [market, line, issue]) {
  const m = liste.find((x) => x.market === market && Math.abs(Number(x.line) - Number(line)) < 1e-9 && x.issue === issue);
  if (!m) return null;
  return {
    dropPct: m.dropPct,
    deltaPoints: m.deltaPoints,
    fromProb: m.fromProb,
    toProb: m.toProb,
    agreeing: m.agreeing,
    bookmakersCount: m.bookmakersCount,
    exchangeOnly: m.exchangeOnly,
    fromAt: m.fromAt,
    toAt: m.toAt,
    chute: m.dropPct >= CHUTE_MIN_PCT && m.agreeing > 0
  };
}

/** Le minimum d'un match pour reprendre la décision du moteur à la lecture (verdictPari.js). */
const pourLaDecision = (m) => ({
  matchId: m.matchId,
  home: m.home,
  away: m.away,
  league: m.league,
  commenceTime: m.commenceTime,
  hasOdds: m.hasOdds,
  oddsSource: m.oddsSource ?? null,
  bankroll: m.bankroll,
  marketOdds: m.marketOdds
    ? { odds1: m.marketOdds.odds1, oddsDraw: m.marketOdds.oddsDraw, odds2: m.marketOdds.odds2, bookmakersCount: m.marketOdds.bookmakersCount ?? null, byBookmaker: m.marketOdds.byBookmaker ?? [] }
    : null
});

let etat = { data: null, computedAt: 0, computing: null, progress: null, error: null, internes: new Map(), instantane: null };

async function calculer() {
  const database = openDb();
  const maintenant = Date.now();
  const debut = Date.now();
  const instantane = dateDeLInstantane();
  const internes = new Map();
  const tous = listAdaptedMatches('odds-api').filter((m) => {
    const t = Date.parse(m.commenceTime ?? '');
    return Number.isFinite(t) && t >= maintenant - 2 * 3600_000 && t <= maintenant + JOURS * 86_400_000 && !m.postponed;
  });
  // Un match peut venir à la fois des cotes et du calendrier : un seul.
  const vus = new Set();
  const matchs = tous.filter((m) => {
    const cle = `${m.league}|${m.home}|${m.away}|${String(m.commenceTime).slice(0, 10)}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });

  etat.progress = { done: 0, total: matchs.length };
  const config = getEngineConfig('football');
  const sport = getSport('football');
  const frequences = new Map();
  const clubs = new Map();
  const club = (nom, league) => {
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
  };
  // « Dernière alignée » (étape 8) : le magasin a-t-il une composition alignée de ce club à montrer ? Une lecture par club.
  const feuilles = new Map();
  const aUneFeuille = (id, jour) => {
    if (!id) return false;
    if (!feuilles.has(id)) feuilles.set(id, aUneDerniereComposition(id, jour, { database }));
    return feuilles.get(id);
  };

  const lignes = [];
  const echecs = [];
  for (const match of matchs) {
    try {
      // Sans repli payant : le magasin FotMob, jamais API-Football.
      const enrichi = await enrichMatchWithRealAverages(match, { sansRepliPayant: true });
      const resultat = await analyzeMatch(enrichi, config, getTiltState(), sport);
      const moteur = probabilitesMoteur(resultat);
      if (!frequences.has(match.league)) {
        let f = null;
        try {
          f = frequencesDeLaLigue(match.league, database);
        } catch {
          f = null;
        }
        frequences.set(match.league, f);
      }
      const freq = frequences.get(match.league);
      const homeId = club(match.home, match.league);
      const awayId = club(match.away, match.league);
      let livres = null;
      let mouvementsDuMatch = [];
      if (homeId && awayId) {
        const fq = quotesForFixture({ homeId, awayId, date: String(match.commenceTime).slice(0, 10) }, { database });
        if (fq.count) {
          livres = livresA(fq, 'close');
          // Le mouvement de chaque marché depuis l'ouverture (étape 8) : le calcul des Chutes de cotes.
          mouvementsDuMatch = mouvements(fq, { home: match.home, away: match.away });
        }
      }
      // L'heure de chaque cote de vos bookmakers, lue dans les archives (étape 7).
      const heures = heuresDesCotesPayantes(match, { database });
      const marches = MARCHES.map((m) => {
        const engineProb = moteur[m.key];
        const [market, line, issue] = m.quote;
        const marche = livres ? probabiliteMarche(livres, market, line, issue) : null;
        const jouable = m.group === 'Résultat' ? meilleureCoteJouable(match, m.key, config) : null;
        return {
          key: m.key,
          engineProb,
          marketProb: marche?.prob ?? null,
          marketBookmakers: marche?.bookmakers ?? 0,
          marketExchangeOnly: marche?.exchange ?? false,
          gapPoints: engineProb !== null && marche ? (engineProb - marche.prob) * 100 : null,
          bestOdds: jouable?.odds ?? null,
          bestBookmaker: jouable?.bookmaker ?? null,
          bestBookmakerKey: jouable?.key ?? null,
          bestOddsAt: jouable?.key ? (heures.parBookmaker[jouable.key]?.releveAt ?? null) : null,
          bestOddsOrigin: jouable?.key ? (heures.parBookmaker[jouable.key]?.origine ?? null) : null,
          edgePct: jouable && engineProb !== null ? (engineProb * jouable.odds - 1) * 100 : null,
          context: contexte(freq, homeId, awayId, m),
          movement: mouvementDe(mouvementsDuMatch, m.quote)
        };
      });
      // Ce qu'il faut pour reprendre la décision du moteur à la lecture (le verdict de chaque issue) : les cotes
      // du match et l'heure de chacune. Gardé ici, jamais envoyé à l'écran.
      if (resultat?.market?.available) internes.set(match.matchId, { match: pourLaDecision(enrichi), heures });
      lignes.push({
        matchId: match.matchId,
        league: match.league,
        home: match.home,
        away: match.away,
        homeId,
        awayId,
        commenceTime: match.commenceTime,
        exactKickoff: Boolean(match.hasOdds),
        oddsSource: match.oddsSource ?? (match.hasOdds ? 'odds-api' : null),
        expectedGoals: resultat?.expectedGoals ?? null,
        // Étape 27 : d'où viennent les buts attendus (le régime du modèle de buts unique), seulement quand il tourne — avec
        // le VRAI fournisseur de chaque morceau pour la pastille de l'écran : les bookmakers de la cote 1N2, la source et
        // l'heure du plus/moins 2,5, la part des statistiques dans le mélange (la bulle de la colonne 2,5).
        ...(resultat?.modeleDeButs ? { butsProvenance: butsProvenanceDe(resultat) } : {}),
        // Étape 8 : la dernière composition alignée d'un des deux clubs est-elle au magasin (pour l'état de la composition) ?
        lastLineupKnown: aUneFeuille(homeId, String(match.commenceTime).slice(0, 10)) || aUneFeuille(awayId, String(match.commenceTime).slice(0, 10)),
        markets: marches
      });
    } catch (error) {
      echecs.push({ matchId: match.matchId, label: `${match.home} – ${match.away}`, error: String(error?.message ?? error).slice(0, 160) });
    }
    etat.progress = { done: etat.progress.done + 1, total: matchs.length };
    // Rendre la main au serveur entre deux matchs.
    await new Promise((fin) => setImmediate(fin));
  }

  return {
    data: {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - debut,
      days: JOURS,
      markets: MARCHES.map(({ key, group, label }) => ({ key, group, label })),
      priorMatches: PRIOR_MATCHS,
      matches: lignes,
      failures: echecs
    },
    internes,
    instantane
  };
}

/**
 * Le verdict du moteur sur chaque issue 1N2 (étape 8), pris À LA LECTURE :
 * decisionDePari (verdictPari.js) sur les cotes du match gardées au calcul,
 * avec l'heure de chaque cote, le réglage de fraîcheur, les réglages du moteur
 * et le coupe-circuit du moment — exactement ce que l'analyse d'un match
 * (route /api/analysis, onglet « Value bets » de Mes paris) donnerait au même
 * instant. Chaque marché 1N2 reçoit `verdict` ; le match, `pari` (la décision).
 */
export function avecVerdicts(data, internes, { maintenant = Date.now(), reglage = null, config = null, tiltState = null } = {}) {
  if (!data?.matches) return data;
  reglage ??= lireReglageFraicheur().reglage;
  config ??= getEngineConfig('football');
  tiltState ??= getTiltState();
  return {
    ...data,
    verdicts: { evaluesLe: new Date(maintenant).toISOString() },
    matches: data.matches.map((m) => {
      const interne = internes?.get(m.matchId);
      if (!interne) return m;
      const match = {
        ...interne.match,
        fraicheurCotes: {
          maintenant,
          coupDEnvoi: interne.match.commenceTime ?? null,
          heureSure: Boolean(interne.match.hasOdds),
          reglage,
          source: interne.heures?.fichier ? 'The Odds API (relevé manuel)' : null,
          parBookmaker: interne.heures?.parBookmaker ?? {}
        }
      };
      const { staking, verdicts } = decisionDePari(match, config, tiltState);
      return {
        ...m,
        pari: { action: staking.action, raison: staking.reason ?? null, issue: staking.outcome ?? staking.aRafraichir?.outcome ?? null },
        markets: (m.markets ?? []).map((k) => (verdicts[k.key] ? { ...k, verdict: verdicts[k.key] } : k))
      };
    })
  };
}

/**
 * L'écran de repérage. Rend tout de suite ce qui est connu (avec son âge)
 * et lance le calcul s'il n'y a rien ou si c'est trop vieux ; `force`
 * relance le calcul même récent.
 */
export function getScreener({ force = false, calculSiPerime = true, maintenant = Date.now() } = {}) {
  // Étape 23 : la carte « où parier », lue maintenant (une requête d'une ligne) ; null sans carte : rien ne change.
  // Seulement quand le Repérage a des données (un calcul fait) : sans elles, aucune base n'est ouverte ici.
  let carte = null;
  try {
    carte = etat.data ? carteDesLecteurs() : null;
  } catch {
    carte = null;
  }
  // Un nouveau relevé The Odds API depuis le calcul : les cotes de vos bookmakers ont changé, le tableau est périmé.
  const nouveauReleve = Boolean(etat.data) && etat.instantane !== dateDeLInstantane();
  const perime = !etat.data || nouveauReleve || (calculSiPerime && Date.now() - etat.computedAt > TTL_MS);
  if ((force || perime) && !etat.computing) {
    etat.error = null;
    etat.computing = calculer()
      .then(({ data, internes, instantane }) => {
        etat.data = data;
        etat.internes = internes;
        etat.instantane = instantane;
        etat.computedAt = Date.now();
      })
      .catch((error) => {
        etat.error = String(error?.message ?? error);
      })
      .finally(() => {
        etat.computing = null;
      });
  }
  const reglage = lireReglageFraicheur().reglage;
  return {
    status: etat.computing ? 'computing' : etat.error && !etat.data ? 'error' : 'ready',
    progress: etat.computing ? etat.progress : null,
    error: etat.error,
    // La fraîcheur de chaque cote jouable, jugée maintenant (lireReglageFraicheur ne lève jamais : un réglage illisible donne celui par défaut),
    // et le verdict du moteur sur chaque issue 1N2, pris maintenant (étape 8).
    data: avecLaCarteSurLeReperage(avecVerdicts(avecFraicheur(etat.data, { maintenant, reglage }), etat.internes, { maintenant, reglage }), carte)
  };
}
