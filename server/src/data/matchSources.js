import { adaptOddsApiMatch, indexCompetitionsByName } from './adapters/oddsApiAdapter.js';
import { adaptSampleMatch } from './adapters/sampleMatchAdapter.js';
import { adaptSeasonCalendarMatch } from './adapters/seasonCalendarAdapter.js';
import { loadOddsMatches, loadCompetitions, loadSampleMatches } from './repositories/fixturesRepository.js';
import { listSeasonCalendar } from './repositories/seasonCalendarRepository.js';
import { teamNamesLikelyMatch } from '../utils/teamNameMatch.js';

export const DATA_SOURCE_KEYS = ['odds-api', 'sample'];

/** Fenêtre autour du prochain match d'une compétition : une journée de championnat s'étale du vendredi au lundi. */
const MATCHDAY_SPAN_DAYS = 4;

const JOUR_MS = 86_400_000;
const jourDe = (iso) => String(iso ?? '').slice(0, 10);
const ecartJours = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / JOUR_MS;
/** Même affiche, même orientation : d'une date à l'autre, l'affiche inversée est le match retour. */
const memeAffiche = (entry, match) => teamNamesLikelyMatch(entry.homeName, match.home) && teamNamesLikelyMatch(entry.awayName, match.away);
const afficheInversee = (entry, match) => teamNamesLikelyMatch(entry.homeName, match.away) && teamNamesLikelyMatch(entry.awayName, match.home);

/**
 * Les matchs REPORTÉS, vus du calendrier (cf. merge-season-calendar.mjs).
 *
 * Les cotes à venir ne se relèvent qu'à la main (quota payant) : l'instantané
 * garde un match à sa date d'origine après son report, et la page Matchs le
 * disait « Terminé » une fois l'heure passée (sept rencontres de League One
 * et League Two le 26/09/2026). Un match coté est donc RETIRÉ quand le
 * calendrier le sait reporté à cette date, re-programmé depuis cette date, ou
 * — heure passée — introuvable à cette date mais attendu plus tard. Il
 * réapparaît à sa nouvelle date par le calendrier, ou par un nouveau relevé
 * de cotes, avec la mention de sa date d'origine (`postponedFrom`).
 *
 * Seules les rencontres du calendrier proches d'aujourd'hui servent (la
 * comparaison des noms coûte, l'historique de plusieurs saisons est long).
 */
function reportsDuCalendrier(calendrier) {
  const maintenant = Date.now();
  const debut = jourDe(new Date(maintenant - 45 * JOUR_MS).toISOString());
  const fin = jourDe(new Date(maintenant + 150 * JOUR_MS).toISOString());
  const parLigue = new Map();
  for (const e of calendrier) {
    if (!e.league || !e.date || e.date < debut || e.date > fin) continue;
    if (!parLigue.has(e.league)) parLigue.set(e.league, []);
    parLigue.get(e.league).push(e);
  }

  const candidats = (match) => parLigue.get(match.league) ?? [];
  const autourDe = (date, jour) => ecartJours(date, jour) <= 1;
  // Le même jour, une équipe ne joue qu'une fois : l'affiche compte dans les
  // deux sens — le calendrier et les cotes ne mettent pas toujours le même
  // club à domicile (Sheffield Wednesday - Stevenage, 26/09/2026).
  const ceJourLa = (match, jour) => candidats(match).filter((e) => autourDe(e.date, jour) && (memeAffiche(e, match) || afficheInversee(e, match)));

  return {
    masque(match) {
      const jour = jourDe(match.commenceTime);
      if (!jour) return false;
      const ceJour = ceJourLa(match, jour);
      // Reporté à cette date.
      if (ceJour.some((e) => e.status === 'postponed')) return true;
      // Re-programmé depuis cette date, vers une autre (un report d'un seul
      // jour se confondrait avec l'écart de fuseau). Les dates d'abord, les
      // noms ensuite : comparer les noms coûte, et la page se recalcule à
      // chaque affichage.
      if (candidats(match).some((e) => e.postponedFrom && autourDe(e.postponedFrom, jour) && !autourDe(e.date, jour) && memeAffiche(e, match))) return true;
      // Heure passée, absent du calendrier à cette date mais attendu plus
      // tard : déplacé sans que la source l'ait dit reporté (Doncaster -
      // Oxford, du 26/09 au 15/12).
      if (ceJour.length || Date.parse(match.commenceTime) > maintenant) return false;
      return candidats(match).some((e) => e.status !== 'finished' && e.date > jour && memeAffiche(e, match));
    },
    /** Date d'origine d'un match re-programmé, pour l'afficher à sa nouvelle date. */
    dateOrigine(match) {
      const jour = jourDe(match.commenceTime);
      return jour ? (ceJourLa(match, jour).find((e) => e.postponedFrom)?.postponedFrom ?? null) : null;
    }
  };
}

/**
 * Complète les matchs cotés par la PROCHAINE JOURNÉE des compétitions qui
 * n'ont aucune cote.
 *
 * Les bookmakers n'ouvrent les divisions inférieures et les marchés
 * secondaires qu'à l'approche du coup d'envoi : la Russie, la Chine, la
 * Bundesliga 2 et la Ligue 2 disparaissaient donc totalement de la page
 * Matchs pendant des semaines, alors que leur calendrier, leur classement et
 * leurs statistiques sont complets en local.
 *
 * Volontairement limité à la prochaine journée : le calendrier contient
 * jusqu'à 469 rencontres à venir pour une seule compétition, les verser
 * entières rendrait la liste inutilisable. Les compétitions DÉJÀ cotées ne
 * sont pas complétées du tout — sans quoi un même match apparaîtrait deux
 * fois, une fois avec sa cote et une fois sans.
 */
function listUpcomingCalendarMatches(calendrier, coveredLeagues, bankroll) {
  const today = new Date().toISOString().slice(0, 10);
  // Un match reporté n'a plus de date : il attend la nouvelle pour réapparaître.
  const upcoming = calendrier.filter(
    (entry) => entry.status !== 'finished' && entry.status !== 'postponed' && entry.date >= today && entry.league && !coveredLeagues.has(entry.league)
  );

  const firstDateByLeague = new Map();
  for (const entry of upcoming) {
    const known = firstDateByLeague.get(entry.league);
    if (!known || entry.date < known) firstDateByLeague.set(entry.league, entry.date);
  }

  const out = [];
  for (const entry of upcoming) {
    const first = firstDateByLeague.get(entry.league);
    const dayGap = (Date.parse(entry.date) - Date.parse(first)) / 86400000;
    if (dayGap > MATCHDAY_SPAN_DAYS) continue;
    const adapted = adaptSeasonCalendarMatch(entry, bankroll);
    if (adapted) out.push(adapted);
  }
  return out;
}

/**
 * La page Matchs range les compétitions dans l'ordre où elles arrivent. Une
 * compétition présente par ses cotes (même toutes passées) garde donc sa
 * place : sa prochaine journée, venue du calendrier, suit ses matchs cotés au
 * lieu d'être renvoyée en fin de liste — la League One et la League Two
 * passaient sinon de sous le Championship à après le championnat brésilien.
 * Les compétitions sans aucune cote restent à la suite, dans leur ordre.
 */
function rangerAvecLesCotes(priced, duCalendrier) {
  const aPlacer = new Map();
  const liguesCotees = new Set(priced.map((match) => match.league));
  for (const match of duCalendrier) {
    if (!liguesCotees.has(match.league)) continue;
    if (!aPlacer.has(match.league)) aPlacer.set(match.league, []);
    aPlacer.get(match.league).push(match);
  }
  const liste = [];
  priced.forEach((match, i) => {
    liste.push(match);
    const finDuBloc = priced[i + 1]?.league !== match.league;
    if (finDuBloc && aPlacer.has(match.league)) {
      liste.push(...aPlacer.get(match.league));
      aPlacer.delete(match.league);
    }
  });
  return [...liste, ...duCalendrier.filter((match) => !liguesCotees.has(match.league))];
}

/**
 * Point d'entrée unique pour charger et adapter les matchs d'une source de
 * données vers le contrat d'entrée du moteur. Utilisé à la fois pour la
 * navigation des matchs (UI) et pour l'exécution du pipeline complet.
 */
export function listAdaptedMatches(source, bankroll = 10000) {
  if (source === 'sample') {
    return loadSampleMatches().map((rawMatch) => adaptSampleMatch(rawMatch, bankroll));
  }
  if (source === 'odds-api') {
    const competitionsByName = indexCompetitionsByName(loadCompetitions());
    const calendrier = listSeasonCalendar({ allSeasons: true });
    const reports = reportsDuCalendrier(calendrier);
    const priced = loadOddsMatches()
      .map((rawMatch) => adaptOddsApiMatch(rawMatch, competitionsByName, bankroll))
      .filter(Boolean)
      .filter((match) => !reports.masque(match))
      .map((match) => ({ ...match, hasOdds: true, postponedFrom: reports.dateOrigine(match) }));

    // « Couverte » = des cotes À VENIR, pas seulement d'anciennes : avec un
    // relevé vieux de plusieurs jours, une compétition ne gardait que des
    // matchs passés et perdait sa prochaine journée, reports re-programmés
    // compris.
    const debutDuJour = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const covered = new Set(priced.filter((match) => Date.parse(match.commenceTime) >= debutDuJour).map((match) => match.league).filter(Boolean));
    return rangerAvecLesCotes(priced, listUpcomingCalendarMatches(calendrier, covered, bankroll));
  }
  throw new Error(`Source de données inconnue : ${source}`);
}
