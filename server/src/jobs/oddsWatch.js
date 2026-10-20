/**
 * oddsWatch.js — les cotes gratuites autour du coup d'envoi, et le rattrapage de l'historique.
 * -----------------------------------------------------------------------
 * Une boucle À PART de l'actualisation complète (matchStatsAutoRefresh.js),
 * sur le modèle du pré-chargement des compositions (lineupPrefetch.js) :
 * l'actualisation passe toutes les trois heures, une cote doit être relevée
 * juste avant le coup d'envoi (la clôture, la cote qui prédit le mieux) et
 * pendant le match (le direct). Toutes les `intervalMinutes` (5) :
 *
 *   1. AVANT-MATCH : les rencontres du jour et du lendemain (liste FotMob,
 *      qui donne l'heure exacte et les identifiants des clubs) dont le coup
 *      d'envoi tombe dans les deux heures ; relevées toutes les 30 min, puis
 *      toutes les 5 min dans les 20 dernières — le dernier relevé avant le
 *      coup d'envoi devient la clôture (cf. freeOdds.versAvantMatch) ;
 *   2. EN DIRECT : les rencontres commencées depuis moins de 2 h 30, une
 *      fois toutes les 10 min (le direct bouge vite, la base n'a pas à
 *      garder chaque seconde) ;
 *   3. RATTRAPAGE : quand l'actualisation complète ne tourne pas, `budget`
 *      requêtes par fournisseur pour remonter l'historique (ESPN depuis
 *      2023, Kalshi 2025-26, 365Scores deux ans, football-data), puis le
 *      rattachement des rencontres jouées et le profilage.
 *
 * Gratuit, sans clé : jamais d'appel payant ici. Ne lève jamais — une source
 * muette ou une passe en échec n'arrête pas la suivante. Une passe ne
 * chevauche jamais la précédente.
 * -----------------------------------------------------------------------
 */

import { fetchMatchesByDate, FOTMOB_LEAGUES, leagueKeyMatches } from '../data/providers/fotMobProvider.js';
import { collectUpcomingOdds, collectLiveOdds, backfillOdds, finalizeOdds } from '../data/providers/freeOdds.js';
import { invalidateFreeMarketOdds } from '../data/freeMarketOdds.js';
import { isRefreshRunning } from '../data/providers/refreshLock.js';

const MINUTE_MS = 60_000;
/** Fenêtre d'avant-match surveillée. */
const AVANT_MATCH_MIN = 120;
/** Dans les 20 dernières minutes, un relevé toutes les 5 min ; avant, toutes les 30. */
const APPROCHE_MIN = 20;
const PAS_AVANT_MIN = 30;
const PAS_APPROCHE_MIN = 5;
/** Le direct : un relevé toutes les 10 min, pendant 2 h 30 après le coup d'envoi. */
const PAS_DIRECT_MIN = 10;
const DUREE_DIRECT_MIN = 150;

const iso = (t) => new Date(t).toISOString().slice(0, 10);
const LIBELLES = Object.entries(FOTMOB_LEAGUES);
/** « ENG|Premier League » -> « EPL » : la compétition du magasin, ou null si elle n'est pas suivie. */
const libelleDe = (leagueKey) => LIBELLES.find(([, matcher]) => leagueKeyMatches(matcher, leagueKey))?.[0] ?? null;

let timer = null;
let enCours = false;
/** Dernier relevé par rencontre (identifiant FotMob) : { avant, direct } en ms. */
const derniers = new Map();

const etat = {
  startedAt: null,
  intervalMinutes: null,
  lastTickAt: null,
  lastTickMs: null,
  nextTickAt: null,
  prematch: null,
  live: null,
  backfill: null,
  finalize: null,
  error: null
};

/** L'état de la boucle, pour Réglages et la provenance. */
export function getOddsWatchStatus() {
  return { ...etat, running: enCours };
}

function du(fixture, cle, pasMin, maintenant) {
  const d = derniers.get(fixture.fotmobId)?.[cle];
  return !d || maintenant - d >= pasMin * MINUTE_MS;
}

function noter(fixtures, cle, maintenant) {
  for (const f of fixtures) derniers.set(f.fotmobId, { ...(derniers.get(f.fotmobId) ?? {}), [cle]: maintenant });
}

/**
 * Une passe. `backfill` : faire aussi le rattrapage de l'historique ;
 * `budget` : requêtes par fournisseur pour ce rattrapage.
 */
export async function runOddsWatch({ backfill = true, budget = 100, log = () => {} } = {}) {
  if (enCours) return { skipped: 'passe précédente encore en cours' };
  enCours = true;
  const debut = Date.now();
  etat.error = null;
  try {
    const maintenant = Date.now();
    const jours = [iso(maintenant), iso(maintenant + 86_400_000)];
    // Après minuit UTC, les matchs du soir américains appartiennent encore à la veille.
    if (new Date(maintenant).getUTCHours() < 6) jours.unshift(iso(maintenant - 86_400_000));
    const listes = await Promise.all(jours.map((j) => fetchMatchesByDate(j).catch(() => [])));
    const fixtures = listes
      .flat()
      .map((m) => ({
        fotmobId: m.matchId,
        league: libelleDe(m.leagueKey),
        date: m.kickoff ? iso(m.kickoff) : m.date,
        kickoff: m.kickoff,
        homeName: m.homeName,
        awayName: m.awayName,
        homeId: m.homeId,
        awayId: m.awayId,
        started: m.started,
        finished: m.finished || m.played || m.cancelled
      }))
      .filter((f) => f.league && f.kickoff && f.homeName && f.awayName && f.fotmobId && f.fotmobId !== '0');

    const avant = fixtures.filter((f) => {
      const minutes = (Date.parse(f.kickoff) - maintenant) / MINUTE_MS;
      if (f.started || minutes <= 0 || minutes > AVANT_MATCH_MIN) return false;
      return du(f, 'avant', minutes <= APPROCHE_MIN ? PAS_APPROCHE_MIN : PAS_AVANT_MIN, maintenant);
    });
    const direct = fixtures.filter((f) => {
      const depuis = (maintenant - Date.parse(f.kickoff)) / MINUTE_MS;
      if (f.finished || depuis < 0 || depuis > DUREE_DIRECT_MIN) return false;
      if (!f.started && depuis < 10) return false; // coup d'envoi retardé : encore de l'avant-match
      return du(f, 'direct', PAS_DIRECT_MIN, maintenant);
    });

    if (avant.length) {
      const r = await collectUpcomingOdds({ fixtures: avant, log });
      noter(avant, 'avant', maintenant);
      etat.prematch = { at: new Date().toISOString(), fixtures: avant.length, sources: r.sources };
    }
    if (direct.length) {
      const r = await collectLiveOdds({ fixtures: direct, log });
      noter(direct, 'direct', maintenant);
      etat.live = { at: new Date().toISOString(), fixtures: direct.length, sources: r.sources };
    }
    if (avant.length || direct.length) invalidateFreeMarketOdds();

    // Le rattrapage ne dispute jamais la base à l'actualisation complète.
    if (backfill && !isRefreshRunning()) {
      const r = await backfillOdds({ budget, log, deadline: Date.now() + 200_000 });
      etat.backfill = { at: new Date().toISOString(), sources: r.sources };
      if (r.sources.some((s) => s.written > 0)) {
        etat.finalize = { at: new Date().toISOString(), ...finalizeOdds() };
        invalidateFreeMarketOdds();
      }
    }

    // Purge des rencontres oubliées (plus vues depuis deux jours).
    for (const [id, d] of derniers) if (maintenant - Math.max(d.avant ?? 0, d.direct ?? 0) > 2 * 86_400_000) derniers.delete(id);
    return { prematch: avant.length, live: direct.length };
  } catch (error) {
    etat.error = String(error.message).slice(0, 300);
    return { error: etat.error };
  } finally {
    etat.lastTickAt = new Date().toISOString();
    etat.lastTickMs = Date.now() - debut;
    enCours = false;
  }
}

export function startOddsWatch({ intervalMinutes = 5, backfill = true, backfillBudget = 100, startupDelayMinutes = 2 } = {}) {
  if (timer) return;
  etat.startedAt = new Date().toISOString();
  etat.intervalMinutes = intervalMinutes;
  const lancer = () => {
    etat.nextTickAt = new Date(Date.now() + intervalMinutes * MINUTE_MS).toISOString();
    runOddsWatch({ backfill, budget: backfillBudget }).catch(() => {});
  };
  etat.nextTickAt = new Date(Date.now() + startupDelayMinutes * MINUTE_MS).toISOString();
  setTimeout(() => {
    lancer();
    timer = setInterval(lancer, intervalMinutes * MINUTE_MS);
  }, startupDelayMinutes * MINUTE_MS);
}

export function stopOddsWatch() {
  if (timer) clearInterval(timer);
  timer = null;
}
