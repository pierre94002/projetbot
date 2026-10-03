/**
 * playerBirthdates.js — l'âge et la nationalité des joueurs (demandes de
 * Pierre le 01/10/2026 : « il me faudrait aussi les âges des joueurs », puis
 * « il me faut aussi leur nationalité »).
 * -----------------------------------------------------------------------
 * Le magasin ne connaît ni les dates de naissance ni les nationalités : on
 * les lit chez FotMob, gratuitement, et on les garde. L'effectif d'un club en
 * UNE requête (page équipe : `dateOfBirth`, `ccode`, `cname` de chaque
 * membre), relu au plus une fois par semaine (transferts) ; un joueur isolé
 * par sa page (`birthDate`, pays), retenté au bout d'un mois si FotMob n'en
 * publie rien.
 *
 * Table à part (`player_birthdates`) : l'annuaire `people` est reconstruit
 * après chaque import et perdrait ce qu'on y ajouterait. Un effectif lu
 * avant que la nationalité soit gardée (version 1) est relu une fois.
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';
import { fetchSquadBirthdates, fetchPlayerBirthdate } from '../providers/fotMobProvider.js';

const JOUR_MS = 86_400_000;
const EFFECTIF_VALIDE_JOURS = 7;
const JOUEUR_RETENTE_JOURS = 30;
/** 2 : l'effectif est gardé avec la nationalité de chacun. */
const VERSION_EFFECTIF = 2;
const estFotMob = (id) => /^fotmob-\d+$/.test(String(id ?? ''));

/** Âge révolu à une date (aujourd'hui par défaut), ou null. */
export function ageAt(birthDate, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(birthDate ?? ''));
  if (!m) return null;
  const [annee, mois, jour] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getUTCFullYear() - annee;
  if (today.getUTCMonth() + 1 < mois || (today.getUTCMonth() + 1 === mois && today.getUTCDate() < jour)) age--;
  return age >= 0 && age < 70 ? age : null;
}

/** Ce qu'on sait de ces joueurs : Map identifiant -> { birthDate, countryCode, countryName }. */
export function infosOf(ids, { database = openDb() } = {}) {
  const uniques = [...new Set(ids.filter(estFotMob).map(String))];
  const out = new Map();
  for (let i = 0; i < uniques.length; i += 500) {
    const lot = uniques.slice(i, i + 500);
    const rows = database
      .prepare(
        `SELECT player_id AS id, birth_date AS birthDate, country_code AS countryCode, country_name AS countryName
         FROM player_birthdates WHERE player_id IN (${lot.map(() => '?').join(',')})`
      )
      .all(...lot);
    for (const r of rows) out.set(r.id, { birthDate: r.birthDate ?? null, countryCode: r.countryCode ?? null, countryName: r.countryName ?? null });
  }
  return out;
}

/** Dates de naissance connues pour ces joueurs : Map identifiant -> AAAA-MM-JJ. */
export function birthdatesOf(ids, { database = openDb() } = {}) {
  const out = new Map();
  for (const [id, info] of infosOf(ids, { database })) if (info.birthDate) out.set(id, info.birthDate);
  return out;
}

function enregistrer(database, lignes, source) {
  const maintenant = new Date().toISOString();
  const ecrire = database.prepare(
    `INSERT INTO player_birthdates (player_id, birth_date, country_code, country_name, source, fetched_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET
       birth_date = COALESCE(excluded.birth_date, player_birthdates.birth_date),
       country_code = COALESCE(excluded.country_code, player_birthdates.country_code),
       country_name = COALESCE(excluded.country_name, player_birthdates.country_name),
       source = excluded.source, fetched_at = excluded.fetched_at`
  );
  database.exec('BEGIN');
  try {
    for (const { id, birthDate, countryCode, countryName } of lignes) {
      ecrire.run(id, birthDate ?? null, countryCode ?? null, countryName ?? null, source, maintenant);
    }
    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // Déjà annulée.
    }
    throw error;
  }
  return maintenant;
}

/**
 * Lit chez FotMob l'effectif d'un club si sa dernière lecture a plus d'une
 * semaine (ou date d'avant la nationalité). `true` si une lecture a eu lieu.
 * Une panne réseau n'empêche jamais l'affichage : on garde ce qu'on a.
 */
export async function ensureSquadBirthdates(teamId, { database = openDb() } = {}) {
  if (!estFotMob(teamId)) return false;
  const lu = database.prepare('SELECT fetched_at AS le, version FROM team_squad_reads WHERE team_id = ?').get(String(teamId));
  if (lu && (lu.version ?? 1) >= VERSION_EFFECTIF && Date.now() - Date.parse(lu.le) < EFFECTIF_VALIDE_JOURS * JOUR_MS) return false;
  let membres;
  try {
    membres = await fetchSquadBirthdates(teamId);
  } catch {
    return false;
  }
  const le = enregistrer(database, membres, 'fotmob-effectif');
  database
    .prepare(
      'INSERT INTO team_squad_reads (team_id, fetched_at, version) VALUES (?, ?, ?) ON CONFLICT(team_id) DO UPDATE SET fetched_at = excluded.fetched_at, version = excluded.version'
    )
    .run(String(teamId), le, VERSION_EFFECTIF);
  return true;
}

/** Les effectifs de plusieurs clubs, quatre lectures à la fois. */
export async function ensureSquadsBirthdates(teamIds, { database = openDb() } = {}) {
  const file = [...new Set(teamIds.filter(estFotMob).map(String))];
  const travailleur = async () => {
    while (file.length) await ensureSquadBirthdates(file.shift(), { database });
  };
  await Promise.all(Array.from({ length: Math.min(4, file.length) }, travailleur));
}

/** Date de naissance d'un joueur : connue, sinon lue sur sa page FotMob (avec sa nationalité ; retentée au bout d'un mois). */
export async function ensurePlayerBirthdate(playerId, { database = openDb() } = {}) {
  if (!estFotMob(playerId)) return null;
  const lu = database
    .prepare('SELECT birth_date AS date, country_code AS pays, fetched_at AS le FROM player_birthdates WHERE player_id = ?')
    .get(String(playerId));
  if (lu?.date && lu?.pays) return lu.date;
  // Lu il y a moins d'un mois, même sans rien (FotMob n'en publie pas
  // toujours) : on ne redemande pas la page à chaque affichage.
  if (lu && Date.now() - Date.parse(lu.le) < JOUEUR_RETENTE_JOURS * JOUR_MS) return lu.date ?? null;
  let identite = null;
  try {
    identite = await fetchPlayerBirthdate(playerId);
  } catch {
    return lu?.date ?? null;
  }
  enregistrer(database, [{ id: String(playerId), ...identite }], 'fotmob-joueur');
  return identite?.birthDate ?? lu?.date ?? null;
}

/** Joueurs lus un par un (leur page FotMob) au plus, par demande. */
const PAGES_PAR_DEMANDE = 40;
const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * Âge et nationalité de joueurs quelconques (listes de l'interface) : les
 * effectifs de leurs clubs actuels (annuaire) sont lus si besoin, puis la
 * page de ceux qui n'y figurent pas (partis, prêtés, sans club) — quelques
 * secondes au plus en tout ; au-delà, la lecture continue pour la fois
 * suivante. Map identifiant -> { birthDate, age, countryCode, countryName }.
 */
export async function ensurePlayersInfo(ids, { database = openDb(), attenteMs = 8000 } = {}) {
  const uniques = [...new Set(ids.filter(estFotMob).map(String))].slice(0, 500);
  const sansPays = () => {
    const connus = infosOf(uniques, { database });
    return uniques.filter((id) => !connus.get(id)?.countryCode);
  };
  const debut = Date.now();
  const aChercher = uniques.length ? sansPays() : [];
  if (aChercher.length) {
    const clubs = database
      .prepare(`SELECT DISTINCT team_id AS id FROM people WHERE team_id IS NOT NULL AND player_id IN (${aChercher.map(() => '?').join(',')})`)
      .all(...aChercher)
      .map((r) => r.id);
    let effectifsLus = false;
    const lecture = ensureSquadsBirthdates(clubs, { database })
      .catch(() => {})
      .then(() => {
        effectifsLus = true;
      });
    await Promise.race([lecture, attendre(attenteMs)]);
    // Seulement une fois les effectifs lus : sinon on lirait une à une les
    // pages de joueurs que l'effectif en cours de lecture va donner.
    const reste = attenteMs - (Date.now() - debut);
    const isoles = effectifsLus ? sansPays().slice(0, PAGES_PAR_DEMANDE) : [];
    if (isoles.length && reste > 0) {
      const travailleur = async () => {
        while (isoles.length) await ensurePlayerBirthdate(isoles.shift(), { database }).catch(() => null);
      };
      await Promise.race([Promise.all(Array.from({ length: Math.min(4, isoles.length) }, travailleur)), attendre(reste)]);
    }
  }
  const out = new Map();
  for (const [id, info] of infosOf(uniques, { database })) out.set(id, { ...info, age: ageAt(info.birthDate) });
  return out;
}
