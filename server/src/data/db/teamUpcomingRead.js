/**
 * teamUpcomingRead.js — les prochains matchs d'un club, lus dans le
 * calendrier de saison, pour sa page (demande de Pierre le 01/10/2026 :
 * « affiche-moi aussi le calendrier à venir »).
 * -----------------------------------------------------------------------
 * Le calendrier ne porte que des NOMS, et FotMob n'écrit pas un club de la
 * même façon d'une compétition à l'autre : « PSG » en Ligue 1 mais « Paris
 * Saint-Germain » en Ligue des champions, « Bayern Munich » en Bundesliga
 * mais « Bayern München » en coupe. On part donc de toutes les écritures du
 * club dans l'annuaire (identifiant FotMob) et de la table d'alias du projet.
 *
 * À l'inverse, deux clubs portent parfois le même nom — « Nacional » au
 * Portugal et au Paraguay, « Libertad » au Paraguay et en Équateur — : chaque
 * compétition retenue est vérifiée par l'identifiant du club qui y joue sous
 * ce nom. Jamais de rapprochement souple : il confond « Inter » et « Inter
 * Miami CF » (cf. teamNameMatch.js).
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';
import { findTeams } from './identityRegistry.js';
import { clubDuMagasin } from './oddsProfileRead.js';
import { listTeamUpcoming } from '../repositories/seasonCalendarRepository.js';
import { teamNamesEqual } from '../../utils/teamNameMatch.js';

function ecrituresDuClub(teamId, database) {
  return database
    .prepare('SELECT name AS alias FROM teams WHERE team_id = ? UNION SELECT alias FROM team_aliases WHERE team_id = ?')
    .all(teamId, teamId)
    .map((r) => r.alias);
}

/**
 * Les matchs à venir du club `name` (au libellé de `league` quand on le
 * connaît, ce qui lève l'ambiguïté des homonymes), du plus proche au plus
 * lointain, avec le camp du club (`side`). Un club absent de l'annuaire se
 * cherche par son seul nom.
 */
export function teamUpcomingFixtures(name, { league = null, from, database = openDb() } = {}) {
  const teamId = clubDuMagasin(name, league, database);
  const ecritures = [...new Set([name, ...(teamId ? ecrituresDuClub(teamId, database) : [])])];

  const noms = new Map();
  const porteLeNom = (nom) => {
    if (!noms.has(nom)) noms.set(nom, ecritures.some((e) => teamNamesEqual(nom, e)));
    return noms.get(nom);
  };
  const verdicts = new Map();
  const estLeClub = (nom, competition) => {
    if (!porteLeNom(nom)) return false;
    if (!teamId) return true;
    const cle = `${competition}\u0000${nom}`;
    if (!verdicts.has(cle)) {
      // Le club qui joue CETTE compétition sous ce nom ; s'il est inconnu (une
      // première participation), le nom ne doit appartenir à aucun autre club.
      const club = clubDuMagasin(nom, competition, database);
      verdicts.set(cle, club ? club === teamId : findTeams(nom, { database }).every((c) => c.teamId === teamId));
    }
    return verdicts.get(cle);
  };
  // Identifiants des deux clubs de chaque match, pour leurs logos (calendrier
  // de la page d'équipe, 01/10/2026) : le club lui-même est connu, chaque
  // adversaire se cherche dans la compétition du match.
  const ids = new Map();
  const idDe = (nom, competition) => {
    const cle = `${competition}\u0000${nom}`;
    if (!ids.has(cle)) {
      try {
        ids.set(cle, clubDuMagasin(nom, competition, database));
      } catch {
        ids.set(cle, null);
      }
    }
    return ids.get(cle);
  };
  return listTeamUpcoming(estLeClub, { from }).map((m) => {
    const side = estLeClub(m.homeName, m.league) ? 'home' : 'away';
    return {
      ...m,
      side,
      homeId: side === 'home' ? teamId : idDe(m.homeName, m.league),
      awayId: side === 'away' ? teamId : idDe(m.awayName, m.league)
    };
  });
}
