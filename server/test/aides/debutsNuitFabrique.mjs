/**
 * LE MAGASIN FABRIQUÉ DE LA NUIT DES DÉBUTS DE SAISON (étape 35, lot 1b, 10/11/2026) — ce n'est PAS un fichier de test.
 * Le magasin à pièges du lot 1a (debutsFabrique.magasinFabrique : saisons à cheval et civiles, Liga MX, promus, relégués,
 * nouveau venu, retour après deux ans, double identifiant…) rangé dans une base de FORME RÉELLE (matches, day_matches,
 * team_day, player_day, players, player_ratings, unavailable_daily, player_birthdates ; l'annuaire refait), avec, pour la
 * saison 2025-26, trois mouvements plantés : 2005 part de Bocage United pour Morvan Orient (vu jouer ailleurs), 2007 n'est
 * plus revu (blessé, liste FotMob du 05/09), 3099 n'est plus revu et 3015 arrive (même date de naissance, même poste : un
 * double possible) ; et un CALENDRIER de saison des matchs à venir (championnats, une coupe, un club inconnu de l'annuaire,
 * un match le jour même de la nuit, un match au-delà des 14 jours). Aucune donnée réelle.
 *
 *   NOMS, NUIT_D_ESSAI (jour de Paris 2025-09-08), SECONDE_NUIT (2025-09-14), VEILLE
 *   fabriquerLeMagasinDesDebuts(db, { rebuildRegistries })   → { rencontres }
 *   ecrireLeCalendrierDesDebuts(fichier)                      → les lignes écrites
 */

import fs from 'node:fs';
import path from 'node:path';
import { magasinFabrique } from './debutsFabrique.mjs';

export const NUIT_D_ESSAI = '2025-09-08T00:40:00.000Z';
export const JOUR_D_ESSAI = '2025-09-08';
export const VEILLE = '2025-09-07';
export const SECONDE_NUIT = '2025-09-14T00:40:00.000Z';

/** Les noms des clubs (l'annuaire ; jamais lus par la nuit, qui ne garde que des numéros). */
export const NOMS = Object.freeze({
  1: 'Ardenne Athletic', 2: 'Bocage United', 3: 'Causses City', 4: 'Dombes Rovers', 5: 'Esterel Town', 6: 'Forez Albion',
  11: 'Gatinais FC', 12: 'Hurepoix Wanderers', 13: 'Iroise County', 14: 'Jura Borough', 15: 'Kerne Villa', 16: 'Landes Harriers',
  21: 'Morvan Orient', 22: 'Nivernais Rangers', 31: 'Oland IF', 32: 'Pitea BK', 33: 'Quarken FF', 34: 'Ranea IK',
  41: 'Salta Unidos', 42: 'Tandil Juniors', 43: 'Ushuaia Sport', 44: 'Viedma Central', 51: 'Xalapa Club', 52: 'Yautepec FC',
  53: 'Zacatecas Deportivo', 54: 'Atlixco Union', 61: 'Bormio Calcio', 62: 'Cesena Vecchia', 63: 'Dolomiti 1907',
  64: 'Erice Marina', 65: 'Faenza Nuova', 66: 'Gubbio Alta', 99: 'Valletta Fabbrica'
});

/** Les rencontres du magasin à pièges, avec les mouvements plantés de la saison 2025-26. */
export function rencontresDeLaNuit() {
  const rs = magasinFabrique();
  for (const r of rs) {
    // 3099, titulaire de Causses City (3) toute la saison 2024-25 : il compte (au moins 30 % des minutes possibles)
    if (r.league === 'EPL' && r.date >= '2024-07-01' && r.date < '2025-07-01' && (r.home === 3 || r.away === 3)) {
      r.joueurs = [...r.joueurs.filter((l) => l.joueur !== 3099), { joueur: 3099, club: 3, minutes: 90, poste: 3 }];
    }
    if (r.date < '2025-07-01') continue;
    if (r.league === 'EPL') {
      // 2005 parti (vu jouer pour Morvan Orient), 2007 pas revu (blessé), 3099 pas revu
      r.joueurs = r.joueurs.filter((l) => !(l.club === 2 && (l.joueur === 2005 || l.joueur === 2007)) && l.joueur !== 3099);
    }
    if (r.league === 'Championship' && (r.home === 21 || r.away === 21) && r.date >= '2025-08-16') {
      r.joueurs = [...r.joueurs, { joueur: 2005, club: 21, minutes: 90, poste: 3 }];
    }
  }
  return rs;
}

/**
 * Range le magasin dans `db` (forme réelle, base NEUVE) ; l'annuaire refait par `rebuildRegistries` s'il est donné (sinon
 * « pas prêt » : des joueurs sans annuaire). Les feuilles `players` : celles de la saison 2025-26 d'Esterel Town (5), plus une
 * ligne SANS identifiant FotMob de 30 minutes par match (la part des minutes sans identifiant).
 */
export function fabriquerLeMagasinDesDebuts(db, { rebuildRegistries = null } = {}) {
  const rs = rencontresDeLaNuit();
  const insMatch = db.prepare(
    `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, lineups, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '{}', ?)`
  );
  const insDay = db.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insTeam = db.prepare(
    `INSERT INTO team_day (rencontre, camp, club, adversaire, date, league, saison, attribue, prolongation, compte, coupe, releve, bp, bc, bp90, bc90, xg_p, xg_c)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`
  );
  const insJoueur = db.prepare('INSERT OR REPLACE INTO player_day (joueur, date, rencontre, club, camp, joue, titulaire, entre, poste, minutes) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)');
  const insFeuille = db.prepare('INSERT INTO players (match_key, side, player_key, player_id, name, minutes) VALUES (?, ?, ?, ?, ?, ?)');
  const b = (x) => (x ? 1 : 0);
  const joueurs = new Set();
  db.exec('BEGIN');
  try {
    rs.forEach((r, i) => {
      const fotmob = String(500000 + i);
      const maj = `${r.date}T23:59:00.000Z`;
      const meta = r.attribue ? JSON.stringify({ awarded: true, reason: 'awarded_win' }) : '{}';
      insMatch.run(r.cle, r.cle, r.date, r.league, NOMS[r.home], NOMS[r.away], `fotmob-${r.home}`, `fotmob-${r.away}`, fotmob, r.buts90.dom, r.buts90.ext, maj, meta);
      const rencontre = Number(insDay.run(r.cle, fotmob, r.date, r.league, r.saison, r.home, r.away, maj).lastInsertRowid);
      r.rencontre = rencontre;
      const f = r.faitDom;
      insTeam.run(rencontre, 1, r.home, r.away, r.date, r.league, r.saison, b(r.attribue), b(r.prolongation), b(r.compte), b(r.coupe), f.bp, f.bc, f.bp90, f.bc90, f.xg_p, f.xg_c);
      insTeam.run(rencontre, 0, r.away, r.home, r.date, r.league, r.saison, b(r.attribue), b(r.prolongation), b(r.compte), b(r.coupe), f.bc, f.bp, f.bc90, f.bp90, f.xg_c, f.xg_p);
      for (const l of r.joueurs ?? []) {
        insJoueur.run(l.joueur, r.date, rencontre, l.club, l.club === r.home ? 1 : 0, l.minutes >= 90 ? 1 : 0, l.minutes >= 90 ? 0 : 1, l.poste ?? 3, l.minutes);
        joueurs.add(l.joueur);
      }
      if (r.date >= '2025-08-01' && (r.home === 5 || r.away === 5)) {
        const side = r.home === 5 ? 'home' : 'away';
        for (const l of r.joueurs.filter((x) => x.club === 5)) insFeuille.run(r.cle, side, `p${l.joueur}`, `fotmob-${l.joueur}`, `Joueur ${l.joueur}`, l.minutes);
        insFeuille.run(r.cle, side, 'sans-identifiant', null, 'Joueur sans fiche', 30);
      }
    });
    // Les fiches des joueurs de l'étape 30 (apports × 1000, en entiers) : la force de l'effectif à blanc.
    const insFiche = db.prepare(
      `INSERT INTO player_ratings (joueur, jour, apparitions, minutes, etablie, formule, facteur, apport_off, apport_def, reglages)
       VALUES (?, '2025-09-07', 10, 900, 1, 'essai', 1000, ?, ?, '{}')`
    );
    for (const j of joueurs) insFiche.run(j, ((j % 7) - 3) * 10, ((j % 5) - 2) * 10);
    // La liste FotMob des indisponibles : 2007 blessé (Bocage United), relevé le 05/09/2025.
    db.prepare("INSERT INTO unavailable_daily (day, fotmob_id, side, player_key, player_id, player_name, team_id, reason, read_at) VALUES ('2025-09-05', '900001', 'home', 'p2007', 'fotmob-2007', 'Joueur 2007', 'fotmob-2', 'injury', '2025-09-05T08:00:00.000Z')").run();
    // Les naissances : 3015 et 3099, même jour (un double possible).
    const insNaissance = db.prepare("INSERT INTO player_birthdates (player_id, birth_date, fetched_at) VALUES (?, '1999-04-12', '2025-09-01T00:00:00.000Z')");
    insNaissance.run('fotmob-3015');
    insNaissance.run('fotmob-3099');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  if (rebuildRegistries) rebuildRegistries({ database: db });
  return { rencontres: rs };
}

const ligne = (date, league, h, a, status = 'scheduled') => ({
  id: `cal-${date}-${h}-${a}`,
  matchId: `cal-${date}-${h}-${a}`,
  date,
  league,
  homeName: typeof h === 'number' ? NOMS[h] : h,
  awayName: typeof a === 'number' ? NOMS[a] : a,
  status,
  homeGoals: null,
  awayGoals: null,
  round: null,
  source: 'fotmob',
  updatedAt: '2025-09-01T00:00:00.000Z'
});

/** Le calendrier de saison des matchs à venir (le fichier JSON que lit la nuit). */
export function ecrireLeCalendrierDesDebuts(fichier) {
  const lignes = [
    ligne('2025-09-06', 'EPL', 1, 4, 'finished'),
    ligne('2025-09-08', 'Liga MX', 51, 53),
    ligne('2025-09-13', 'EPL', 1, 2),
    ligne('2025-09-13', 'EPL', 3, 4),
    ligne('2025-09-13', 'EPL', 11, 12),
    ligne('2025-09-13', 'Championship', 14, 5),
    ligne('2025-09-13', 'Championship', 6, 15),
    ligne('2025-09-13', 'Championship', 21, 22),
    ligne('2025-09-14', 'Serie A - Italy', 61, 62),
    ligne('2025-09-14', 'Serie A - Italy', 63, 64),
    ligne('2025-09-14', 'Serie A - Italy', 65, 66),
    ligne('2025-09-16', 'Championship', 'Ombres Inconnues FC', 6),
    ligne('2025-09-17', 'EFL Cup', 1, 21),
    ligne('2025-09-20', 'EPL', 2, 3),
    ligne('2025-09-20', 'EPL', 4, 11),
    ligne('2025-09-20', 'EPL', 12, 1),
    ligne('2025-09-27', 'EPL', 1, 3),
    // au-delà des 14 jours de TOUTES les nuits du script (la dernière, le 17/09, va jusqu'au 01/10), mais dans les 18 jours
    // de la liste du calendrier dès la nuit du 14/09 : seul le filtre des 14 jours de la nuit l'écarte (T-N1)
    ligne('2025-10-02', 'EPL', 2, 12)
  ];
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, JSON.stringify(lignes));
  return lignes;
}
