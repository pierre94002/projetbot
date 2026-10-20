/**
 * derniereComposition.js — la dernière composition alignée par un club, lue dans le magasin.
 * -----------------------------------------------------------------------
 * Tant que FotMob n'a rien publié pour un match, la page du match montre la
 * dernière composition alignée par chaque équipe (« Dernière alignée »,
 * demande de Pierre le 01/10/2026, cf. providers/lineupContext.js). La
 * recherche vit ici, dans un module de LECTURE de la base sans autre
 * dépendance, pour que la page « Opportunités du jour » (étape 8 du plan, via
 * data/screener.js) dise le même état de composition sans charger la boucle
 * des compositions ni FotMob. Lecture seule, aucun appel réseau.
 * -----------------------------------------------------------------------
 */

import { openDb } from './matchStatsDb.js';

/** Les feuilles des derniers matchs examinées, et le onze minimal pour en être une. */
export const FEUILLES_A_EXAMINER = 5;
export const TITULAIRES_MIN = 9;

/**
 * La dernière composition alignée par un club, lue dans le magasin : la
 * feuille de son dernier match joué avant `avant` qui porte un onze de départ
 * (une feuille sans composition, ça arrive selon les championnats, est
 * sautée). `null` si aucune des dernières n'en a.
 */
export function derniereFeuille(teamId, avant, database) {
  const matchs = database
    .prepare(
      `SELECT * FROM (SELECT match_key AS cle, date, league, home_name AS domicile, away_name AS exterieur,
                             home_goals AS butsDom, away_goals AS butsExt, lineups, 'home' AS side
                      FROM matches WHERE home_id = ? AND date < ? AND home_goals IS NOT NULL ORDER BY date DESC LIMIT ${FEUILLES_A_EXAMINER})
       UNION ALL
       SELECT * FROM (SELECT match_key, date, league, home_name, away_name, home_goals, away_goals, lineups, 'away'
                      FROM matches WHERE away_id = ? AND date < ? AND away_goals IS NOT NULL ORDER BY date DESC LIMIT ${FEUILLES_A_EXAMINER})
       ORDER BY date DESC`
    )
    .all(teamId, avant, teamId, avant);
  const feuille = database.prepare(
    'SELECT player_id AS id, name, shirt_number AS number, position, starter, x, y FROM players WHERE match_key = ? AND side = ? ORDER BY ord'
  );
  for (const m of matchs) {
    const joueurs = feuille.all(m.cle, m.side);
    const onze = joueurs.filter((j) => Number(j.starter) === 1);
    if (onze.length < TITULAIRES_MIN) continue;
    let cadre = {};
    try {
      cadre = JSON.parse(m.lineups || '{}')?.[m.side] ?? {};
    } catch {
      // Feuille sans formation ni entraîneur : le onze suffit.
    }
    const joueur = (j) => ({ id: j.id ?? null, name: j.name, number: j.number ?? null, position: j.position ?? null, x: j.x ?? null, y: j.y ?? null });
    return {
      team: {
        teamId,
        formation: cadre.formation ?? null,
        coach: cadre.coach ?? null,
        startXI: onze.map(joueur),
        substitutes: joueurs.filter((j) => Number(j.starter) !== 1).map(joueur)
      },
      match: { date: m.date, league: m.league, home: m.domicile, away: m.exterieur, homeGoals: m.butsDom, awayGoals: m.butsExt }
    };
  }
  return null;
}

/**
 * Le magasin a-t-il, pour ce club, une composition alignée à montrer en
 * « dernière alignée » ? La même recherche que la page du match, sans décrire
 * la composition (état de la composition dans une liste, étape 8). Ne lève
 * jamais : une feuille illisible vaut « non ».
 */
export function aUneDerniereComposition(teamId, avant, { database = openDb() } = {}) {
  if (!teamId || !avant) return false;
  try {
    return Boolean(derniereFeuille(teamId, avant, database));
  } catch {
    return false;
  }
}
