/**
 * lineupPrefetch.js — les compositions des matchs à venir, avant le coup d'envoi.
 * -----------------------------------------------------------------------
 * Gratuit, sans clé, comme le reste (FotMob). Une boucle À PART de
 * l'actualisation complète (matchStatsAutoRefresh.js) : les feuilles de
 * match terminées attendent trois heures sans problème, une composition
 * doit être fraîche à quelques minutes du coup d'envoi, donc cette boucle
 * tourne plus souvent, et ne touche à rien d'autre que sa propre table
 * (`upcoming_lineups`, cf. matchStatsDb.js) — jamais `matches`, jamais le
 * verrou partagé de l'actualisation.
 *
 * CE QUE FOTMOB NE DIT PAS. Aucun champ de sa réponse ne distingue une
 * composition officielle d'une prévision : elle peut apparaître près d'un
 * jour à l'avance pour une affiche internationale (constaté le 24/09/2026,
 * Italie-Belgique), ou seulement dans l'heure qui précède un match de
 * division inférieure. Elle peut aussi changer d'un appel à l'autre tant
 * que le coup d'envoi n'est pas donné. D'où deux choix :
 *   - le pré-chargement COMMENCE la surveillance LINEUP_PREFETCH_WINDOW_MIN
 *     avant le coup d'envoi (défaut 120 min), pour laisser le temps à une
 *     composition tardive d'apparaître ;
 *   - il continue de vérifier une composition déjà trouvée si le coup
 *     d'envoi approche (moins de 20 min), au cas où elle changerait encore ;
 *   - il ne fait JAMAIS une confiance aveugle à la première réponse : la
 *     dernière lue avant le coup d'envoi est la plus proche de la réalité,
 *     pas la première.
 *
 * CE QU'IL NE FAIT PAS : jamais d'appel payant (API-Football) ni de
 * recherche web IA. Uniquement FotMob. Le reste de la chaîne — pour un
 * championnat où FotMob ne publie vraiment rien — reste à la demande dans
 * matchEnrichment.js, comme avant.
 * -----------------------------------------------------------------------
 */

import { fetchMatchesByDate, fetchProbableLineup } from './fotMobProvider.js';
import { openDb, upsertUpcomingLineup, upcomingLineupByFotmobId, upcomingLineupByHome, pruneUpcomingLineups } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';

const MINUTE_MS = 60_000;
/** Une composition déjà trouvée n'est revérifiée que dans cette fenêtre. */
const REVERIFIE_A_L_APPROCHE_MIN = 20;
/** Pas plus d'une vérification par match dans ce délai, quoi qu'il arrive. */
const DELAI_MIN_ENTRE_DEUX_MIN = 4;
/** Lignes gardées pour ce nombre de jours révolus (diagnostic, rejouabilité). */
const PURGE_APRES_JOURS = 2;

const iso = (d) => d.toISOString().slice(0, 10);
const veille = (jour) => {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
};
const lendemain = (jour) => {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return iso(d);
};

let timer = null;

/** Faut-il (re)vérifier ce match maintenant, vu ce qu'on a déjà en magasin ? */
function aVerifier(connu, minutesAvantCoupDEnvoi) {
  if (!connu) return true;
  const depuisDerniereVerif = (Date.now() - Date.parse(connu.fetchedAt)) / MINUTE_MS;
  if (depuisDerniereVerif < DELAI_MIN_ENTRE_DEUX_MIN) return false;
  if (!connu.available) return true;
  return minutesAvantCoupDEnvoi <= REVERIFIE_A_L_APPROCHE_MIN;
}

/**
 * Une passe : les matchs dont le coup d'envoi tombe dans la fenêtre, encore
 * non commencés, vérifiés ou revérifiés selon `aVerifier`. Ne lève jamais —
 * une panne FotMob ou un match isolé en échec ne doit pas arrêter les autres.
 */
export async function runLineupPrefetch({ windowMin, database = openDb() } = {}) {
  const maintenant = new Date();
  const aujourdhui = iso(maintenant);
  const rapport = { candidates: 0, checked: 0, foundNew: 0, failed: 0 };

  let matchsDuJour;
  try {
    // La liste du lendemain aussi : un match à 23h peut tomber sur le jour
    // suivant selon la source, et surveiller les deux évite un trou pile à
    // la frontière de minuit.
    const [aj, demain] = await Promise.all([fetchMatchesByDate(aujourdhui), fetchMatchesByDate(lendemain(aujourdhui))]);
    matchsDuJour = [...aj, ...demain];
  } catch (error) {
    rapport.error = error.message;
    return rapport;
  }

  const limiteHaute = maintenant.getTime() + windowMin * MINUTE_MS;
  const candidats = matchsDuJour.filter((m) => {
    if (m.played || m.started || !m.kickoff) return false;
    const t = Date.parse(m.kickoff);
    // Une marge de 5 min en dessous de « maintenant » : un coup d'envoi
    // retardé de quelques minutes, encore « non démarré » chez la source,
    // continue d'être surveillé au lieu de sortir brutalement de la fenêtre.
    return Number.isFinite(t) && t >= maintenant.getTime() - 5 * MINUTE_MS && t <= limiteHaute;
  });
  rapport.candidates = candidats.length;

  for (const m of candidats) {
    const minutesAvant = (Date.parse(m.kickoff) - maintenant.getTime()) / MINUTE_MS;
    const connu = upcomingLineupByFotmobId(m.matchId, { database });
    if (!aVerifier(connu, minutesAvant)) continue;
    rapport.checked++;
    try {
      const resultat = await fetchProbableLineup(m.matchId);
      upsertUpcomingLineup(
        {
          fotmobId: m.matchId,
          date: m.date,
          kickoff: m.kickoff,
          league: m.leagueKey,
          homeId: m.homeId,
          awayId: m.awayId,
          homeName: m.homeName,
          awayName: m.awayName,
          payload: resultat,
          fetchedAt: new Date().toISOString()
        },
        { database }
      );
      if (resultat.available && !connu?.available) rapport.foundNew++;
    } catch (error) {
      rapport.failed++;
    }
  }

  // Purge : tout ce qui date de plus de PURGE_APRES_JOURS jours révolus.
  try {
    let limite = aujourdhui;
    for (let i = 0; i < PURGE_APRES_JOURS; i++) limite = veille(limite);
    rapport.pruned = pruneUpcomingLineups(limite, { database });
  } catch {
    // Purge non bloquante : une base verrouillée un instant n'annule pas la passe.
  }
  return rapport;
}

/**
 * Composition à la demande, pour UN match connu par ses noms d'équipe
 * plutôt que par son identifiant FotMob (c'est le cas de tout clic dans
 * l'appli : les matchs viennent de The Odds API, dont les noms diffèrent
 * parfois de ceux de FotMob). Vérifie d'abord le magasin ; à défaut, un
 * appel FotMob immédiat — jamais de repli payant ici, c'est au SEUL appelant
 * (matchEnrichment.js) de décider d'aller plus loin.
 *
 * @returns {{available:false,reason:string}|object} le même contrat que fetchProbableLineup
 */
export async function resolveFotMobLineup({ homeName, awayName, commenceTimeIso, league, database = openDb() }) {
  const jour = String(commenceTimeIso).slice(0, 10);
  const trouve = await resolveFotMobMatchId({ homeName, awayName, commenceTimeIso, league, database });
  if (!trouve) return { available: false, reason: 'fixture_not_found' };
  const { matchId, homeId } = trouve;

  if (homeId) {
    const enCache = upcomingLineupByHome(homeId, jour, { database });
    if (enCache?.available) return enCache;
  }

  const resultat = await fetchProbableLineup(matchId).catch(() => ({ available: false, reason: 'fixture_not_found' }));
  try {
    upsertUpcomingLineup(
      { fotmobId: matchId, date: jour, kickoff: commenceTimeIso, league: league ?? null, homeId, awayId: null, homeName, awayName: awayName ?? '', payload: resultat, fetchedAt: new Date().toISOString() },
      { database }
    );
  } catch {
    // Le cache n'est qu'un confort : une écriture ratée ne doit pas priver l'appelant du résultat.
  }
  return resultat;
}

/**
 * Retrouve l'identifiant FotMob d'un match par noms d'équipe (n'importe
 * quelle source) + date, partagé par resolveFotMobLineup ci-dessus et
 * teamNewsResolver.js — la même résolution ne doit vivre qu'à un endroit.
 * `null` si le match n'est identifiable nulle part (nom non reconnu, ou
 * trop loin de la date donnée).
 *
 * @returns {{matchId:string, homeId:string|null}|null}
 */
export async function resolveFotMobMatchId({ homeName, awayName, commenceTimeIso, league, database = openDb() }) {
  const jour = String(commenceTimeIso).slice(0, 10);
  const homeId = clubDuMagasin(homeName, league ?? null, database);
  try {
    for (const j of [veille(jour), jour, lendemain(jour)]) {
      const matchs = await fetchMatchesByDate(j);
      const trouve = matchs.find(
        (m) =>
          !m.played &&
          ((homeId && m.homeId === homeId) || (!homeId && normaliser(m.homeName) === normaliser(homeName))) &&
          (!awayName || normaliser(m.awayName) === normaliser(awayName) || !m.awayName)
      );
      if (trouve) return { matchId: trouve.matchId, homeId };
    }
  } catch {
    return null;
  }
  return null;
}

function normaliser(nom) {
  return String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Démarre la boucle. Sans effet si elle tourne déjà. */
export function startLineupPrefetch({ intervalMinutes = 5, windowMinutes = 120, startupDelayMinutes = 1 } = {}) {
  if (timer) return false;
  const lancer = async () => {
    try {
      const r = await runLineupPrefetch({ windowMin: windowMinutes });
      if (r.checked || r.error) {
        console.log(
          r.error
            ? `[compositions] passe en échec : ${r.error}`
            : `[compositions] ${r.candidates} match(s) dans la fenêtre, ${r.checked} vérifié(s), ${r.foundNew} nouvelle(s) composition(s)${r.failed ? `, ${r.failed} échec(s)` : ''}.`
        );
      }
    } catch (error) {
      console.error(`[compositions] passe en échec : ${error.message}`);
    }
  };
  setTimeout(() => {
    lancer();
    timer = setInterval(lancer, intervalMinutes * MINUTE_MS);
    timer.unref?.();
  }, startupDelayMinutes * MINUTE_MS).unref?.();
  return true;
}

export function stopLineupPrefetch() {
  clearInterval(timer);
  timer = null;
}
