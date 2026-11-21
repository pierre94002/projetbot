/**
 * UN DIRECT FABRIQUÉ pour les essais de la lecture du direct (étape 46, lot 1, partie B, 12/11/2026) — ce n'est PAS un fichier
 * de test. Aucune donnée réelle : des clubs « fotmob-1… », des matchs « 47… », des bookmakers « Bookmaker A ».
 *
 *   baseDuDirect()               une base SQLite EN MÉMOIRE avec les seules tables que lit la 46 (le DDL du serveur) ;
 *   poserLaNuit(db, calculeLe)   la dernière nuit COMPLÈTE des matchs (simulation_state, clé nuit_matchs) ;
 *   poserUneLigne(db, o)         une ligne de simulation_matchs (fixture_key par cleDeNuit, comme la nuit) ;
 *   ligneFabriquee(o)            une ligne « service » telle que la rend ligneDeService (pour les essais sans base) ;
 *   listeEnJeu(o)                une ligne de la liste du jour, à la forme du lecteur FotMob du serveur ;
 *   matchSuivi(o)                une entrée de getEtatMinute().matchs, sa mémoire faite par suivre() ;
 *   etatMinute(o), statut(o)     getEtatMinute() et getLiveWatchStatus() fabriqués ; sourcesActives(em) : une boucle qui tourne ;
 *   poserUnInstantane(db, o)     une ligne de live_snapshots ;
 *   poserDesCotes(db, o)         un événement de cotes et sa série en direct (odds_events, odds_quotes).
 * Correctifs D3 (12/11/2026) : la 46 lit aussi `matches` (la fiche d'un match fini : sa page « match terminé ») et l'annuaire
 * des clubs (`teams`, `team_aliases` : l'annuaire STRICT du calendrier) —
 *   poserUneFiche(db, o)         une fiche de match terminé au magasin (matches) ;
 *   poserUnClub(db, o)           un club de l'annuaire et ses alias (teams, team_aliases) ;
 *   calendrierFabrique(o)        un calendrier de saison au format du fichier du serveur (merge-season-calendar.mjs).
 */

import { DatabaseSync } from 'node:sqlite';
import { __testing as BASE } from '../../src/data/db/matchStatsDb.js';
import { cleDeNuit } from '../../src/data/simulation/simulationRead.js';
import { suivre } from '../../src/data/direct/memoireDuDirect.js';
import { slug } from '../../src/utils/nameIdentity.js';

const iso = (t) => new Date(t).toISOString();

/** Les tables que la 46 lit (et rien d'autre) ; correctifs D3 : `matches`, `teams`, `team_aliases` ajoutées. */
export const TABLES_DU_DIRECT = Object.freeze(['simulation_matchs', 'simulation_state', 'live_snapshots', 'odds_events', 'odds_quotes', 'matches', 'teams', 'team_aliases']);

/** Une base en mémoire avec les tables (et leurs index) de TABLES_DU_DIRECT, au DDL du serveur. */
export function baseDuDirect() {
  const db = new DatabaseSync(':memory:');
  for (const s of BASE.DDL) {
    const m = String(s).match(/^\s*CREATE (?:UNIQUE )?(TABLE|INDEX) IF NOT EXISTS (\w+)(?:\s+ON\s+(\w+))?/);
    if (!m) continue;
    const cible = m[1] === 'TABLE' ? m[2] : m[3];
    if (TABLES_DU_DIRECT.includes(cible)) db.exec(s);
  }
  const presentes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const t of TABLES_DU_DIRECT) if (!presentes.includes(t)) throw new Error(`baseDuDirect : la table ${t} manque au DDL du serveur`);
  return db;
}

/** La dernière nuit COMPLÈTE des matchs (ce que lit nuitComplete). */
export function poserLaNuit(db, calculeLe) {
  db.prepare('INSERT OR REPLACE INTO simulation_state (cle, valeur) VALUES (?, ?)').run('nuit_matchs', JSON.stringify({ calculeLe, bilan: { matchs: 1 } }));
}

/** Une ligne de simulation_matchs. `jourDeLaCle` : le jour (ISO) de la clé, s'il diffère du coup d'envoi (veille, lendemain). */
export function poserUneLigne(
  db,
  {
    homeId,
    awayId,
    kickoff,
    calculeLe,
    role = 'service',
    grille = 'ancien-81',
    engineVersion = 5,
    candidateHash = null,
    lambda = 1.45,
    mu = 1.15,
    rho = -0.08,
    fair = { home: 0.45, draw: 0.28, away: 0.27 },
    oddsSource = 'cotes gratuites : essai',
    oddsAt = null,
    kickoffConnu = 1,
    apres = 0,
    jourDeLaCle = null
  }
) {
  const cle = cleDeNuit({ homeId, awayId, commenceTime: jourDeLaCle ?? kickoff });
  db.prepare(
    `INSERT INTO simulation_matchs (fixture_key, role, calcule_le, version, grille, engine_version, candidate_hash, date, kickoff, kickoff_connu, home_id, away_id, lambda, mu, rho, fair, odds_source, odds_at, apres_coup_d_envoi)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(cle, role, calculeLe, grille, engineVersion, candidateHash, String(jourDeLaCle ?? kickoff).slice(0, 10), kickoff, kickoffConnu, homeId.replace('fotmob-', ''), awayId.replace('fotmob-', ''), lambda, mu, rho, fair === null ? null : JSON.stringify(fair), oddsSource, oddsAt, apres);
  return cle;
}

/** Une ligne « service » à la forme de ligneDeService (trouvée), sans base. */
export function ligneFabriquee({ homeId, awayId, kickoff, calculeLe = null, grille = 'ancien-81', engineVersion = 5, candidateHash = null, lambda = 1.45, mu = 1.15, rho = -0.08, fair = { home: 0.45, draw: 0.28, away: 0.27 }, oddsSource = 'cotes gratuites : essai', oddsAt = null }) {
  const coup = Date.parse(kickoff);
  const calcule = calculeLe ?? iso(coup - 6 * 3_600_000);
  return {
    trouve: true,
    raison: null,
    cle: cleDeNuit({ homeId, awayId, commenceTime: kickoff }),
    nuit: calcule,
    calculeLe: calcule,
    grille,
    engineVersion,
    candidateHash,
    lambda,
    mu,
    rho,
    fair,
    oddsSource,
    oddsAt,
    kickoff,
    kickoffConnu: true,
    date: kickoff.slice(0, 10),
    decalageJours: 0,
    ageAuCoupDEnvoiH: (coup - Date.parse(calcule)) / 3_600_000,
    coteAgeAuCoupDEnvoiH: oddsAt ? (coup - Date.parse(oddsAt)) / 3_600_000 : null
  };
}

/** Une ligne de la liste du jour (les champs du lecteur FotMob du serveur). */
export function listeEnJeu({
  id,
  homeId,
  awayId,
  kickoff,
  leagueKey = 'ENG|Premier League',
  homeName = 'Domicile',
  awayName = 'Exterieur',
  label = '34’',
  minute = null,
  ajout = null,
  maxTime = 90,
  h = 0,
  a = 0,
  rh = null,
  ra = null,
  halfTime = false,
  started = true,
  finished = false,
  cancelled = false
}) {
  return { matchId: String(id), leagueKey, kickoff, started, finished, cancelled, awarded: false, homeId, awayId, homeName, awayName, homeGoals: h, awayGoals: a, liveLabel: label, liveMinute: minute, liveAddedTime: ajout, liveMaxTime: maxTime, halfTime, homeRedCards: rh, awayRedCards: ra };
}

/**
 * Une entrée de getEtatMinute().matchs. `lectures` : [{ t, liste, detail, listeReelle }] rejouées par suivre() (la mémoire) ;
 * la dernière `liste` est celle de l'entrée. `memoire: false` : pas de mémoire (module de la 46 indisponible dans la boucle).
 */
export function matchSuivi({ id, homeId, awayId, kickoff, league = 'Premier League - England', leagueKey = 'ENG|Premier League', homeName = 'Domicile', awayName = 'Exterieur', rang = 3, coverage = 'xG', lectures, memoire = true }) {
  let m = null;
  let detailA = null;
  for (const l of lectures) {
    m = suivre(m, { liste: l.liste ?? null, detail: l.detail ?? null, maintenant: l.t, listeReelle: l.listeReelle !== false });
    if (l.detail) detailA = l.t;
  }
  const derniere = [...lectures].reverse().find((l) => l.liste)?.liste ?? null;
  return {
    id: String(id),
    league,
    leagueKey,
    date: kickoff.slice(0, 10),
    kickoff,
    homeId,
    awayId,
    homeName,
    awayName,
    rang,
    coverage,
    vuA: lectures.at(-1).t,
    premiereVue: lectures[0].t,
    dernierDetailA: detailA,
    liste: derniere,
    dernier: null,
    memoire: memoire ? m : null
  };
}

/** n matchs en jeu à la minute `minute` (libellé « 34’ »), lus pour de vrai 20 s avant `maintenant`, clubs fotmob-1000+2i / 1001+2i. */
export function matchsEnJeu(n, { maintenant, minute = 1, premier = 4700001, h = 0, a = 0, rang = 3, coupAvantMin = null } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const homeId = `fotmob-${1000 + 2 * i}`;
    const awayId = `fotmob-${1001 + 2 * i}`;
    const kickoff = iso(maintenant - (coupAvantMin ?? minute) * 60_000);
    const liste = listeEnJeu({ id: premier + i, homeId, awayId, kickoff, label: `${minute}’`, h, a });
    return matchSuivi({ id: premier + i, homeId, awayId, kickoff, rang, homeName: `Domicile ${i + 1}`, awayName: `Exterieur ${i + 1}`, lectures: [{ t: maintenant - 20_000, liste }] });
  });
}

/** getEtatMinute() fabriqué (sa forme exacte). */
export function etatMinute({
  maintenant,
  matchs = [],
  finis = [],
  listeFotmobA = maintenant - 20_000,
  derniereListe = listeFotmobA,
  dernierTour = { at: iso(maintenant - 20_000), listeLue: true, enDirect: matchs.length, details: 0, horsPlafond: 0, instantanes: 0, fins: 0, erreurs: 0 },
  module46 = { etat: 'charge', raison: null },
  erreurs46 = { n: 0, derniere: null },
  prochainCoupDEnvoi = null,
  suspenduJusqua = null
}) {
  return {
    v: 1,
    at: maintenant,
    module46,
    erreurs46,
    listeFotmobA,
    derniereListe,
    prochainCoupDEnvoi,
    suspenduJusqua,
    startedAt: iso(maintenant - 3_600_000),
    dernierTour,
    charge: { listesFotmob: 30, listesServies: 28, listesEnEchec: 0, tours: 60, listes: 58, details: 12, horsPlafond: 0 },
    matchs,
    finis
  };
}

/** getLiveWatchStatus() fabriqué. */
export function statut({ running = true, suspendu = false, suspenduJusqua = null, erreursConsecutives = 0, derniereErreur = null, erreur = null, dernierTour = null, startedAt = null } = {}) {
  return { running, startedAt, reglages: {}, suspendu, suspenduJusqua, erreur, derniereErreur, erreursConsecutives, enDirect: 0, dernierTour, totaux: {} };
}

/**
 * Les sources d'une boucle qui TOURNE (hors du bac, interrupteurs ouverts), pour tableauDuDirect / matchDuDirect.
 * Correctifs D2 (12/11/2026) : `calendrier` (les entrées du calendrier d'un jour, pour la page du match) VIDE par défaut —
 * jamais le vrai calendrier dans un essai ; `calendrier` et `club` se fabriquent par essai.
 * Correctif K4 (13/11, constat 4 du calcul) : `chiffresABlanc: true` — à blanc, la lecture ne rend plus les chiffres (le
 * contrôleur ne passe jamais cette option) ; les essais, eux, les lisent. T-L12 (directLecture) l'ôte pour le vérifier.
 */
export function sourcesActives(em, { statut: st = statut(), coupure = () => null, calendrier = () => [], club = null } = {}) {
  return { etatMinute: em, statut: st, coupure, bac: false, interrupteurs: { direct: true, actualisation: true }, calendrier, club, chiffresABlanc: true };
}

/** Une ligne de live_snapshots. */
export function poserUnInstantane(
  db,
  {
    fotmobId,
    takenAt,
    kind = 'direct',
    kickoff,
    date = kickoff.slice(0, 10),
    league = 'Premier League - England',
    leagueKey = 'ENG|Premier League',
    homeId,
    awayId,
    homeName = 'Domicile',
    awayName = 'Exterieur',
    status = 'en cours',
    minute = null,
    addedTime = null,
    label = null,
    h = null,
    a = null,
    rh = null,
    ra = null,
    coverage = 'xG',
    detailAt = null,
    source = 'liste'
  }
) {
  db.prepare(
    `INSERT INTO live_snapshots (fotmob_id, taken_at, kind, date, kickoff, league, league_key, home_id, away_id, home_name, away_name, status, minute, added_time, minute_label, home_goals, away_goals, home_red, away_red, xg_home, xg_away, stats, coverage, detail_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`
  ).run(String(fotmobId), takenAt, kind, date, kickoff, league, leagueKey, homeId, awayId, homeName, awayName, status, minute, addedTime, label, h, a, rh, ra, coverage, detailAt, source);
}

/**
 * Un événement de cotes et sa série EN DIRECT : `live` = { issue: [{ price, prob, releveAt }] } (kind 'live', seq = l'heure).
 * Le même (source, clubs, jour) réutilise son événement.
 */
export function poserDesCotes(db, { source = 'espn', bookmaker = 'Bookmaker A', provenance = null, homeId, awayId, date, kickoff = null, league = 'Premier League - England', market = '1x2', line = 0, live = {} }) {
  const sourceEvent = `${source}:${homeId}:${awayId}:${date}`;
  let ev = db.prepare('SELECT id FROM odds_events WHERE source = ? AND source_event = ?').get(source, sourceEvent);
  if (!ev) {
    const r = db
      .prepare('INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
      .run(source, sourceEvent, league, date, kickoff, 'Domicile', 'Exterieur', homeId, awayId, provenance, kickoff ?? `${date}T00:00:00.000Z`);
    ev = { id: Number(r.lastInsertRowid) };
  }
  const poser = db.prepare('INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price, prob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [selection, points] of Object.entries(live)) {
    for (const p of points) poser.run(ev.id, bookmaker, market, selection, line, 'live', p.releveAt, p.releveAt, p.price ?? null, p.prob ?? null);
  }
  return ev.id;
}

// ------------------------------------------------------------ correctifs D3 (12/11/2026)

/**
 * Une fiche de match TERMINÉ au magasin (`matches`) : ce que lit la page « match terminé » de l'appli (/match/<match_key>).
 * `fotmobId` null : une fiche rangée sans identifiant de match (les plus anciennes).
 */
export function poserUneFiche(db, { matchKey, date, homeId, awayId, fotmobId = null, league = 'Premier League - England', homeName = 'Domicile', awayName = 'Exterieur', homeGoals = 1, awayGoals = 0 }) {
  db.prepare('INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    matchKey,
    `stats-${matchKey}`,
    date,
    league,
    homeName,
    awayName,
    homeId,
    awayId,
    fotmobId === null ? null : String(fotmobId),
    homeGoals,
    awayGoals,
    `${date}T23:00:00.000Z`
  );
}

/** Un club de l'annuaire (`teams`) et ses alias (`team_aliases`, rangés par slug comme le fait rebuildRegistries). */
export function poserUnClub(db, { teamId, name, league = 'Premier League - England', aliases = [] }) {
  db.prepare('INSERT INTO teams (team_id, name, slug, league, played) VALUES (?, ?, ?, ?, ?)').run(teamId, name, slug(name), league, 10);
  const poser = db.prepare('INSERT INTO team_aliases (slug, team_id, alias, seen) VALUES (?, ?, ?, ?)');
  for (const alias of new Set([name, ...aliases])) poser.run(slug(alias), teamId, alias, 5);
}

/**
 * Un calendrier de saison FABRIQUÉ, au format du fichier du serveur (merge-season-calendar.mjs : un tableau,
 * JSON.stringify(…, null, 2)) : `n` entrées réparties du 01/07/2025 au 31/12/2026 (aucune le jour `jour`), plus les entrées
 * `duJour` ({ matchId, homeName, awayName, … }), le tout rangé par date. Des noms « Ville 12 », jamais un vrai club.
 * Rend { entrees, texte } (texte : 47 000 entrées ≈ 18 Mo, la taille du vrai).
 */
export function calendrierFabrique({ n = 47_000, jour, duJour = [], league = 'Ligue fabriquée' }) {
  const debut = Date.parse('2025-07-01T00:00:00.000Z');
  const jours = 549;
  const entree = (i, date, o = {}) => ({
    id: `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`,
    matchId: `cal-${date}-ville-${2 * i}-ville-${2 * i + 1}`,
    date,
    league,
    homeName: `Ville ${2 * i}`,
    awayName: `Ville ${2 * i + 1}`,
    status: date < jour ? 'finished' : 'scheduled',
    homeGoals: date < jour ? i % 4 : null,
    awayGoals: date < jour ? (i >> 2) % 3 : null,
    round: null,
    source: 'fotmob',
    updatedAt: '2026-09-21T20:02:04.653Z',
    ...o
  });
  const entrees = [];
  for (let i = 0; i < n; i++) {
    let date = new Date(debut + Math.floor((i * jours) / n) * 86_400_000).toISOString().slice(0, 10);
    if (date === jour) date = new Date(Date.parse(`${jour}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
    entrees.push(entree(i, date));
  }
  duJour.forEach((o, k) => entrees.push(entree(n + k, jour, { status: 'scheduled', homeGoals: null, awayGoals: null, ...o })));
  entrees.sort((a, b) => a.date.localeCompare(b.date));
  return { entrees, texte: JSON.stringify(entrees, null, 2) };
}
