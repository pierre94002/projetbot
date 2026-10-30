/**
 * lineupContext.js — la composition d'un match qui va se jouer, et ce que le
 * magasin sait de chaque joueur concerné, pour l'analyse IA d'avant coup
 * d'envoi (demande de Pierre le 01/10/2026 : « une heure avant le match […]
 * la compo du match qui va se jouer, les joueurs présents sur le terrain »).
 * -----------------------------------------------------------------------
 * Gratuit, comme la boucle des compositions (lineupPrefetch.js) : FotMob et
 * le magasin, jamais d'appel payant.
 *
 * La composition est RELUE chez FotMob à l'instant de l'analyse, jamais prise
 * dans le cache `upcoming_lineups` : la boucle ne revérifie une composition
 * déjà trouvée qu'à moins de 20 min du coup d'envoi, et celle qu'elle garde à
 * une heure peut être la prévision publiée la veille (cf. lineupPrefetch.js).
 *
 * Joueurs et clubs rapprochés par IDENTIFIANT FotMob, jamais par nom (cf.
 * identityRegistry.js : le nom fusionnait les homonymes et éclatait les
 * variantes d'orthographe). Les statistiques couvrent TOUTES les compétitions
 * de la saison en cours : un titulaire de championnat qui ne joue pas la coupe
 * reste un titulaire.
 * -----------------------------------------------------------------------
 */

import { fetchProbableLineup } from './fotMobProvider.js';
import { resolveFotMobMatchId } from './lineupPrefetch.js';
import { openDb, upsertUpcomingLineup, upcomingLineupByFotmobId } from '../db/matchStatsDb.js';
import { clubDuMagasin } from '../db/oddsProfileRead.js';
import { ageAt, infosOf, ensureSquadsBirthdates } from '../db/playerBirthdates.js';
import { currentSeason, seasonBounds } from './seasonWindows.js';
import { derniereFeuille } from '../db/derniereComposition.js';
import { forceDuOnzeDeLaComposition } from '../db/playerRatings.js';
import { ventEnKmH } from '../../utils/libellesFotmob.js';
import { lireLArbitre, homonymesDe } from '../db/refereeRead.js';

const JOUR_MS = 86_400_000;
/** En début de saison, trop peu de matchs pour savoir qui est titulaire : on remonte plus loin. */
const MATCHS_MIN_SAISON = 3;
const REPLI_JOURS = 300;
/** Titulaire habituel : au moins la moitié des matchs de l'équipe sur la période (et 2 au minimum). */
const PART_TITULAIRE_HABITUEL = 0.5;

const MOTIFS = { injury: 'blessé', suspension: 'suspendu', internationalDuty: 'en sélection' };

const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');
const isoJour = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Statistiques de la période pour une liste de joueurs, toutes compétitions. */
function statsDesJoueurs(ids, debut, fin, database) {
  if (!ids.length) return new Map();
  const rows = database
    .prepare(
      `SELECT p.player_id AS pid,
              SUM(CASE WHEN p.minutes > 0 THEN 1 ELSE 0 END) AS apps,
              SUM(CASE WHEN p.starter = 1 THEN 1 ELSE 0 END) AS starts,
              COALESCE(SUM(p.minutes), 0) AS minutes,
              COALESCE(SUM(p.goals), 0) AS goals,
              COALESCE(SUM(p.assists), 0) AS assists,
              ROUND(SUM(p.xg), 2) AS xg,
              ROUND(AVG(p.rating), 2) AS rating
       FROM players p JOIN matches m ON m.match_key = p.match_key
       WHERE p.player_id IN (${placeholders(ids.length)}) AND m.date >= ? AND m.date < ?
       GROUP BY p.player_id`
    )
    .all(...ids, debut, fin);
  return new Map(rows.map((r) => [String(r.pid), r]));
}

/** Les joueurs de l'équipe sur la période (par identifiant de club), du plus titularisé au moins. */
function joueursDeLEquipe(teamId, debut, fin, database) {
  const rows = database
    .prepare(
      `WITH r AS (
         SELECT match_key, 'home' AS side FROM matches WHERE home_id = ? AND date >= ? AND date < ? AND home_goals IS NOT NULL
         UNION ALL
         SELECT match_key, 'away' AS side FROM matches WHERE away_id = ? AND date >= ? AND date < ? AND away_goals IS NOT NULL
       )
       SELECT p.player_id AS pid, MAX(p.name) AS name, MAX(p.position) AS position,
              SUM(CASE WHEN p.starter = 1 THEN 1 ELSE 0 END) AS starts,
              COALESCE(SUM(p.goals), 0) AS goals,
              COALESCE(SUM(p.assists), 0) AS assists,
              (SELECT COUNT(*) FROM r) AS teamMatches
       FROM r JOIN players p ON p.match_key = r.match_key AND p.side = r.side
       WHERE p.player_id IS NOT NULL
       GROUP BY p.player_id
       ORDER BY starts DESC`
    )
    .all(teamId, debut, fin, teamId, debut, fin);
  const teamMatches = rows[0]?.teamMatches ?? Number(database.prepare(
    `SELECT (SELECT COUNT(*) FROM matches WHERE home_id = ? AND date >= ? AND date < ? AND home_goals IS NOT NULL)
          + (SELECT COUNT(*) FROM matches WHERE away_id = ? AND date >= ? AND date < ? AND away_goals IS NOT NULL) AS n`
  ).get(teamId, debut, fin, teamId, debut, fin)?.n ?? 0);
  return { teamMatches, joueurs: rows };
}

function decrireEquipe(team, league, jour, database) {
  if (!team) return null;
  const finMs = Date.parse(`${jour}T00:00:00Z`);
  let [debut] = seasonBounds(league, currentSeason(league, new Date(finMs)));
  const fin = jour;

  let effectif = team.teamId ? joueursDeLEquipe(team.teamId, debut, fin, database) : { teamMatches: 0, joueurs: [] };
  if (team.teamId && effectif.teamMatches < MATCHS_MIN_SAISON) {
    debut = isoJour(finMs - REPLI_JOURS * JOUR_MS);
    effectif = joueursDeLEquipe(team.teamId, debut, fin, database);
  }

  const onze = team.startXI ?? [];
  const banc = team.substitutes ?? [];
  const ids = [...onze, ...banc].map((j) => j.id).filter(Boolean).map(String);
  // Les absents annoncés aussi (étape 41) : la fiche compacte de l'IA met en
  // avant ceux qui ont joué cette saison. Jamais l'identifiant 0, partagé par
  // les joueurs que FotMob ne connaît pas.
  const idsAbsents = (team.unavailable ?? []).map((a) => a.id).filter((id) => id && String(id) !== '0').map(String);
  const stats = statsDesJoueurs([...new Set([...ids, ...idsAbsents])], debut, fin, database);
  // L'âge et la nationalité de chacun (01/10/2026) : ce qu'on sait de lui
  // (effectif FotMob de son club), sinon ce que publie la composition.
  const infos = infosOf([...ids, ...(team.unavailable ?? []).map((a) => a.id), ...effectif.joueurs.map((j) => j.pid)], { database });
  const info = (j) => infos.get(String(j.id ?? j.pid ?? '')) ?? null;
  const age = (j) => ageAt(info(j)?.birthDate) ?? j.age ?? null;
  const pays = (j) => ({ countryCode: info(j)?.countryCode ?? j.countryCode ?? null, countryName: info(j)?.countryName ?? j.countryName ?? null });
  const chiffres = (j) => {
    const s = j.id ? stats.get(String(j.id)) : null;
    return s ? { apps: s.apps, starts: s.starts, minutes: s.minutes, goals: s.goals, assists: s.assists, xg: s.xg, rating: s.rating } : null;
  };

  // Le poste et les chiffres de la saison d'un absent (étape 41) : lus dans
  // l'effectif et le magasin par son identifiant FotMob ; null s'il est inconnu.
  const posteEffectif = new Map(effectif.joueurs.map((j) => [String(j.pid), j.position ?? null]));
  const absents = (team.unavailable ?? []).map((a) => ({
    id: a.id ?? null,
    age: age(a),
    ...pays(a),
    name: a.name,
    reason: MOTIFS[a.type] ?? 'indisponible',
    expectedReturn: a.expectedReturn ?? null,
    position: a.id && String(a.id) !== '0' ? (posteEffectif.get(String(a.id)) ?? null) : null,
    stats: a.id && String(a.id) !== '0' ? chiffres(a) : null
  }));

  // Les titulaires habituels qui ne sont PAS dans le onze : ce qui change le
  // plus la lecture d'un match, et que la feuille seule ne dit pas.
  const dansLeOnze = new Set(onze.map((j) => String(j.id)));
  const surLeBanc = new Set(banc.map((j) => String(j.id)));
  const seuil = Math.max(2, Math.ceil(effectif.teamMatches * PART_TITULAIRE_HABITUEL));
  const habituelsAbsents = effectif.joueurs
    .filter((j) => j.starts >= seuil && !dansLeOnze.has(String(j.pid)))
    .map((j) => {
      const absent = absents.find((a) => a.id && String(a.id) === String(j.pid));
      return {
        id: j.pid ?? null,
        age: age(j),
        ...pays(j),
        name: j.name,
        position: j.position ?? null,
        starts: j.starts,
        goals: j.goals,
        assists: j.assists,
        status: surLeBanc.has(String(j.pid)) ? 'remplaçant' : absent ? absent.reason : 'absent de la feuille de match'
      };
    });

  return {
    team: team.teamName ?? null,
    teamId: team.teamId ?? null,
    formation: team.formation ?? null,
    coach: team.coach ?? null,
    // Période sur laquelle portent les statistiques des joueurs.
    statsSince: debut,
    teamMatches: effectif.teamMatches,
    startXI: onze.map((j) => ({
      id: j.id ?? null,
      name: j.name,
      number: j.number ?? null,
      position: j.position ?? null,
      age: age(j),
      ...pays(j),
      // Case sur le terrain (grille FotMob, 0 à 1) : pour dessiner la composition.
      x: j.x ?? null,
      y: j.y ?? null,
      stats: chiffres(j)
    })),
    bench: banc.map((j) => ({ id: j.id ?? null, name: j.name, number: j.number ?? null, position: j.position ?? null, age: age(j), ...pays(j), stats: chiffres(j) })),
    // Identifiants gardés pour l'affichage (photo, fiche du joueur) ;
    // compositionPourIA les retire de ce que lit l'IA.
    unavailable: absents,
    usualStartersMissing: habituelsAbsents
  };
}

/**
 * Le cadre du match utile à une lecture d'avant-match : stade, pelouse,
 * météo, arbitre et ses moyennes face à celles du championnat (cf. mapMeta,
 * fotMobProvider.js). Sans l'affluence ni les champs techniques.
 *
 * Correctif du 28/10/2026 (B) : le vent, que FotMob donne en mètres par
 * seconde (rangé tel quel au magasin), est converti en km/h ici — c'est ce
 * que l'IA lit (la fiche compacte, l'ancienne forme, et l'instantané gardé
 * avec l'analyse), et ses consignes disent « windSpeed en km/h ». La meta
 * reçue n'est jamais modifiée.
 */
export function cadreDuMatch(meta) {
  if (!meta) return null;
  const garder = ['round', 'stadium', 'city', 'capacity', 'surface', 'weather', 'temperature', 'windSpeed', 'precipitation', 'referee'];
  const cadre = Object.fromEntries(garder.filter((k) => meta[k] != null).map((k) => [k, meta[k]]));
  if ('windSpeed' in cadre) {
    const kmh = ventEnKmH(cadre.windSpeed);
    if (kmh === null) delete cadre.windSpeed;
    else cadre.windSpeed = kmh;
  }
  return Object.keys(cadre).length ? cadre : null;
}

/** Lit chez FotMob la page du match (composition + cadre) et la remet dans le cache des compositions. */
async function lirePageDuMatch({ homeName, awayName, commenceTimeIso, league, fotmobMatchId, database }) {
  const trouve = fotmobMatchId
    ? { matchId: fotmobMatchId, homeId: null }
    : await resolveFotMobMatchId({ homeName, awayName, commenceTimeIso, league, database }).catch(() => null);
  if (!trouve) return null;
  const page = await fetchProbableLineup(trouve.matchId).catch(() => null);
  if (!page) return null;
  const fetchedAt = new Date().toISOString();
  if (page.available) {
    try {
      // La lecture fraîche profite aussi au cache des compositions (écran du match).
      upsertUpcomingLineup(
        {
          fotmobId: trouve.matchId,
          date: String(commenceTimeIso).slice(0, 10),
          kickoff: page.meta?.kickoff ?? commenceTimeIso,
          league: league ?? null,
          homeId: page.home?.teamId ?? trouve.homeId ?? null,
          awayId: page.away?.teamId ?? null,
          homeName: page.home?.teamName ?? homeName,
          awayName: page.away?.teamName ?? awayName ?? '',
          payload: page,
          fetchedAt
        },
        { database }
      );
    } catch {
      // Le cache n'est qu'un confort.
    }
  }
  return { fotmobMatchId: String(trouve.matchId), page, fetchedAt };
}

/** La composition décrite (cf. decrireEquipe), avec l'heure de relevé. */
function composition(page, { league, commenceTimeIso, fotmobMatchId, fetchedAt, database }) {
  const jour = String(commenceTimeIso).slice(0, 10);
  return {
    source: 'FotMob',
    fotmobMatchId,
    fetchedAt,
    minutesBeforeKickoff: Math.round((Date.parse(commenceTimeIso) - Date.parse(fetchedAt)) / 60_000),
    home: decrireEquipe(page.home, league, jour, database),
    away: decrireEquipe(page.away, league, jour, database)
  };
}

/**
 * La composition relue chez FotMob, avec les joueurs décrits et le cadre du
 * match. `null` si le match n'est pas identifiable chez FotMob ou si aucun
 * onze n'est publié. `fotmobMatchId`, quand l'appelant le connaît déjà (liste
 * du jour FotMob), évite de le rechercher.
 */
export async function buildLineupContext({ homeName, awayName, commenceTimeIso, league, fotmobMatchId = null, database = openDb() }) {
  if (!commenceTimeIso) return null;
  const lu = await lirePageDuMatch({ homeName, awayName, commenceTimeIso, league, fotmobMatchId, database });
  if (!lu?.page.available) return null;
  return {
    ...composition(lu.page, { league, commenceTimeIso, fotmobMatchId: lu.fotmobMatchId, fetchedAt: lu.fetchedAt, database }),
    matchInfo: cadreDuMatch(lu.page.meta)
  };
}

// La dernière composition alignée par un club (derniereFeuille) vit dans data/db/derniereComposition.js
// depuis l'étape 8 : la page « Opportunités du jour » en lit l'état sans charger ce module.

/**
 * Tant que FotMob n'a publié aucune composition pour le match : la dernière
 * composition alignée par chaque équipe (demande de Pierre le 01/10/2026),
 * décrite comme une composition publiée — statistiques de la saison,
 * titulaires habituels absents de ce onze — avec le match d'où elle vient.
 * Les absents que FotMob annonce déjà pour CE match (`page.home.unavailable`,
 * parfois publiés avant le onze) y sont reportés : un titulaire d'alors
 * blessé aujourd'hui ne rejouera pas.
 */
function dernieresCompositions({ homeName, awayName, league, jour, page, database }) {
  const cote = (nom, cotePage) => {
    try {
      const teamId = clubDuMagasin(nom, league, database);
      const feuille = teamId ? derniereFeuille(teamId, jour, database) : null;
      if (!feuille) return null;
      const equipe = { ...feuille.team, teamName: nom, unavailable: cotePage?.unavailable ?? [] };
      return { ...decrireEquipe(equipe, league, jour, database), lastMatch: feuille.match };
    } catch (error) {
      console.warn(`[compositions] dernière composition de ${nom} illisible : ${error.message}`);
      return null;
    }
  };
  const home = cote(homeName, page?.home);
  const away = cote(awayName, page?.away);
  return home || away ? { source: 'magasin', home, away } : null;
}

/**
 * LA FORCE DU ONZE de chaque camp d'une composition décrite (étape 30 du plan, 22/10/2026) : les apports des
 * titulaires face à ceux de l'équipe habituelle, ligne par ligne, lus dans les fiches de la nuit (data/db/
 * playerRatings.js : deux lectures par clé, quelques millisecondes). Pour la PAGE DU MATCH seulement (étape 31) :
 * ni l'analyse IA (compositionPourAnalyseIA), ni le moteur ne la lisent — règle de Pierre, les compositions ne
 * servent qu'à l'écran et au commentaire. Sans fiches (jamais calculées, club sans équipe habituelle) : null ; une
 * lecture qui échoue ne casse jamais la page.
 */
export function avecForceDuOnze(compo, database) {
  if (!compo) return compo;
  const force = (equipe) => {
    if (!equipe) return equipe;
    let forceDuOnze = null;
    try {
      forceDuOnze = forceDuOnzeDeLaComposition(equipe, { database });
    } catch (error) {
      console.warn(`[compositions] force du onze illisible : ${error.message}`);
    }
    return { ...equipe, forceDuOnze };
  };
  return { ...compo, home: force(compo.home), away: force(compo.away) };
}

/**
 * L'ARBITRE DÉSIGNÉ, AU MAGASIN (étape 32 du plan, partie D) : pour l'encadré « Contexte du match » de la page du match,
 * la ligne de cet arbitre dans la table de la nuit (`contexte_arbitres`, une clé primaire « nom|pays » : ses moyennes
 * recalculées sur ses matchs relevés au magasin) et les autres arbitres du même nom (un autre pays : pas comptés). Jamais
 * les moyennes que FotMob affiche à côté de son nom. Pas de nom : null ; une lecture ratée ne casse jamais la page.
 */
export function arbitreAuMagasin(referee, database) {
  const nom = typeof referee?.name === 'string' && referee.name.trim() ? referee.name : null;
  if (!nom) return null;
  const pays = typeof referee?.country === 'string' ? referee.country : '';
  try {
    return { nom, pays, ligne: lireLArbitre({ nom, pays, database }), homonymes: homonymesDe({ nom, pays, database }) };
  } catch {
    return { nom, pays, ligne: null, homonymes: [], illisible: true };
  }
}

/**
 * Tout ce que FotMob publie d'un match à venir, pour sa page : coup d'envoi
 * exact (le calendrier ne connaît que le jour), cadre (stade, météo,
 * arbitre) et composition décrite si elle est sortie — sinon, la dernière
 * composition alignée par chaque équipe (`lastLineups`). Une seule lecture,
 * gratuite — jamais de repli payant (contrairement à resolveLiveLineups).
 */
export async function buildMatchPreview({ homeName, awayName, commenceTimeIso, league, database = openDb() }) {
  if (!commenceTimeIso) return { available: false, reason: 'no_date' };
  const lu = await lirePageDuMatch({ homeName, awayName, commenceTimeIso, league, fotmobMatchId: null, database });
  // Les effectifs des deux clubs (dates de naissance, une requête chacun,
  // au plus une fois par semaine) : l'âge de chaque joueur affiché.
  const clubs = [lu?.page?.home?.teamId, lu?.page?.away?.teamId];
  try {
    if (!clubs[0]) clubs[0] = clubDuMagasin(homeName, league, database);
    if (!clubs[1] && awayName) clubs[1] = clubDuMagasin(awayName, league, database);
    await ensureSquadsBirthdates(clubs.filter(Boolean), { database });
  } catch (error) {
    console.warn(`[compositions] âges indisponibles : ${error.message}`);
  }
  const kickoff = lu?.page.meta?.kickoff ?? null;
  // Étape 30 : la force du onze de chaque camp, pour la page du match (affichage seulement).
  const lineups = avecForceDuOnze(
    lu?.page.available ? composition(lu.page, { league, commenceTimeIso: kickoff ?? commenceTimeIso, fotmobMatchId: lu.fotmobMatchId, fetchedAt: lu.fetchedAt, database }) : null,
    database
  );
  const jour = String(kickoff ?? commenceTimeIso).slice(0, 10);
  const lastLineups = lineups ? null : avecForceDuOnze(dernieresCompositions({ homeName, awayName, league, jour, page: lu?.page, database }), database);
  if (!lu) return { available: false, reason: 'fixture_not_found', lastLineups };
  return {
    available: true,
    fotmobMatchId: lu.fotmobMatchId,
    kickoff,
    meta: lu.page.meta ?? null,
    lineups,
    lastLineups,
    // Étape 32 : l'heure de cette lecture FotMob, et l'arbitre désigné au magasin (l'encadré « Contexte du match »).
    releveLe: lu.fetchedAt ?? null,
    arbitreAuMagasin: arbitreAuMagasin(lu.page.meta?.referee, database)
  };
}

/**
 * La composition que l'IA lit avant un match, quelle que soit l'heure de
 * l'analyse (01/10/2026, Pierre : « il faut que l'IA analyse les compositions
 * d'équipe, les joueurs sur le terrain ») : celle que FotMob a publiée pour CE
 * match (`source: 'FotMob'`), sinon la dernière composition alignée par chaque
 * équipe (`source: 'magasin'`, avec `lastMatch`), et le cadre du match. Une
 * lecture FotMob, gratuite. `null` si rien n'est connu.
 */
export async function compositionPourAnalyseIA({ homeName, awayName, commenceTimeIso, league, fotmobMatchId = null, database = openDb() }) {
  if (!commenceTimeIso) return null;
  const lu = await lirePageDuMatch({ homeName, awayName, commenceTimeIso, league, fotmobMatchId, database });
  const matchInfo = lu?.page?.meta ? cadreDuMatch(lu.page.meta) : null;
  if (lu?.page.available) {
    return {
      ...composition(lu.page, { league, commenceTimeIso, fotmobMatchId: lu.fotmobMatchId, fetchedAt: lu.fetchedAt, database }),
      matchInfo
    };
  }
  const jour = String(lu?.page?.meta?.kickoff ?? commenceTimeIso).slice(0, 10);
  const dernieres = dernieresCompositions({ homeName, awayName, league, jour, page: lu?.page, database });
  return dernieres ? { ...dernieres, matchInfo } : null;
}

/** La clé d'un joueur dans une composition : son identifiant FotMob, sinon son nom. */
const cleJoueur = (j) => String(j?.id ?? j?.name);

/** Les clés des deux onzes de départ : { home: [...], away: [...] }. */
export function onzesDe(context) {
  return { home: (context?.home?.startXI ?? []).map(cleJoueur), away: (context?.away?.startXI ?? []).map(cleJoueur) };
}

/** Signature des deux onzes de départ, pour savoir si une composition a changé depuis l'analyse. */
export function signatureDesOnzes(context) {
  const ids = (side) => (context?.[side]?.startXI ?? []).map(cleJoueur).sort().join(',');
  return `${ids('home')}|${ids('away')}`;
}

/**
 * Les TITULAIRES HABITUELS dont la place a changé entre la composition lue
 * par une analyse (`instantane`, la composition décrite par decrireEquipe :
 * `teamMatches`, `startXI[].stats.starts`, `usualStartersMissing`) et la
 * dernière connue (`onzes` : { home: [clés], away: [clés] }, cf. onzesDe) :
 * sortis du onze, ou entrés dedans. Habituel = titularisé dans au moins la
 * moitié des matchs de l'équipe sur la période, et au moins 2 fois — la
 * règle de usualStartersMissing. Un titulaire habituel remplacé par un autre
 * compte pour DEUX (l'un sort, l'autre entre) ; un remplaçant remplacé par un
 * autre remplaçant ne compte pas. Sert au mode économe (étape 4 du plan) :
 * la reprise d'une analyse après un changement de onze n'a lieu que si au
 * moins deux titulaires habituels changent.
 *
 * @returns {Array<{ side: 'home'|'away', name: string, sens: 'sorti'|'entré' }>}
 */
export function titulairesHabituelsChanges(instantane, onzes) {
  const changes = [];
  for (const side of ['home', 'away']) {
    const equipe = instantane?.[side];
    const apres = onzes?.[side];
    if (!equipe || !Array.isArray(apres) || !apres.length) continue;
    const seuil = Math.max(2, Math.ceil(Number(equipe.teamMatches ?? 0) * PART_TITULAIRE_HABITUEL));
    const avant = new Set((equipe.startXI ?? []).map(cleJoueur));
    const maintenant = new Set(apres.map(String));
    const habituels = new Map();
    for (const j of equipe.startXI ?? []) if (Number(j?.stats?.starts ?? 0) >= seuil) habituels.set(cleJoueur(j), j.name);
    for (const j of equipe.usualStartersMissing ?? []) habituels.set(cleJoueur(j), j.name);
    for (const [cle, name] of habituels) {
      const etait = avant.has(cle);
      const est = maintenant.has(cle);
      if (etait !== est) changes.push({ side, name, sens: est ? 'entré' : 'sorti' });
    }
  }
  return changes;
}

/**
 * La composition que la boucle des compositions a relue en dernier (elle
 * revérifie toutes les 5 min à moins de 20 min du coup d'envoi), sans appel
 * réseau : `{ signature, fetchedAt, onzes }`, ou `null` si rien d'utilisable.
 */
export function derniereCompositionConnue(fotmobMatchId, { database = openDb() } = {}) {
  if (!fotmobMatchId) return null;
  const lineup = upcomingLineupByFotmobId(fotmobMatchId, { database });
  if (!lineup?.available) return null;
  return { signature: signatureDesOnzes(lineup), fetchedAt: lineup.fetchedAt ?? null, onzes: onzesDe(lineup) };
}
