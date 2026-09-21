/**
 * -----------------------------------------------------------------------
 * Registre d'identités : équipes et joueurs, désignés par leur identifiant
 * FotMob plutôt que par leur nom.
 * -----------------------------------------------------------------------
 * POURQUOI. Le magasin désignait les gens et les clubs par leur NOM, et un
 * nom n'est pas une identité. Mesuré sur les 810 891 lignes de joueurs :
 *
 *   - 277 noms recouvrent PLUSIEURS hommes (19 965 lignes). « Juan Cruz »,
 *     « Víctor García » et « Liam Kelly » sont trois hommes chacun ; tout
 *     classement groupé par nom additionnait leurs statistiques.
 *   - 1 956 hommes sont ÉCLATÉS sur plusieurs orthographes (94 570 lignes) :
 *     « Yiğit Efe Demir », « Yigit Demir », « Yiğit Demir » et « Yigit Efe
 *     Demir » sont une seule personne, et ses totaux étaient coupés en
 *     quatre.
 *
 * Les deux défauts se compensaient en apparence — un classement restait
 * plausible — mais aucune ligne n'était juste. L'identifiant de la source
 * tranche les deux d'un coup : il est déjà présent sur 99,3 % des lignes.
 *
 * Côté clubs, rien n'était identifié du tout : 683 écritures pour à peine
 * plus de 500 clubs réels, « Atlético Madrid » et « Atletico Madrid » étant
 * comptés séparément. Le rapprochement se faisait par ressemblance de nom,
 * c'est-à-dire par pari (cf. utils/teamNameMatch.js).
 *
 * CE QUE CE MODULE APPORTE. Deux annuaires reconstruits depuis le magasin,
 * plus leurs tables d'alias :
 *
 *   teams / team_aliases     identifiant -> nom canonique, pays, championnat
 *   people / people_aliases  identifiant -> nom canonique, poste, club
 *
 * Ils ne contiennent AUCUNE donnée qui ne soit déjà dans le magasin : ce
 * sont des index, jamais une source. `rebuildRegistries()` les refait à
 * l'identique à partir de `matches` et `players`, et peut donc être rejoué
 * après chaque import sans précaution particulière.
 *
 * AMBIGUÏTÉ ASSUMÉE. Un alias peut désigner plusieurs identités — c'est le
 * cas de « Pedrinho », porté par cinq joueurs. Les tables d'alias ont donc
 * une clé COMPOSITE (slug, identifiant), et les fonctions de recherche
 * renvoient la liste des candidats. Prétendre le contraire reviendrait à
 * réintroduire, sous un autre nom, le défaut que ce module corrige.
 */

import { openDb } from './matchStatsDb.js';
import { slug } from '../../utils/nameIdentity.js';
// La règle de fabrication d'un identifiant appartient à la source qui les
// émet, et une seule définition doit exister : deux copies finiraient par
// diverger sur le traitement des bouchons négatifs, et le magasin
// contiendrait alors deux conventions qu'aucune jointure ne rapprocherait.
// Le provider n'a aucun effet de bord à l'import.
import { fotMobIdOf } from '../providers/fotMobProvider.js';

export { fotMobIdOf };

/**
 * Identité d'une ligne de joueur, identifiant d'abord.
 *
 * Les 5 854 lignes sans identifiant — 0,7 %, concentrées sur les feuilles
 * qu'ESPN a fournies seul — retombent sur `player_key`, qui vaut
 * `name:<slug>` et reste donc stable d'un match à l'autre. Sans ce repli,
 * ces joueurs disparaîtraient des classements au lieu d'y figurer sous leur
 * nom.
 */
export const IDENTITY_SQL = 'COALESCE(p.player_id, p.player_key)';

const now = () => new Date().toISOString();

/** Ajoute une occurrence dans un compteur, en retenant la date la plus récente. */
function compte(carte, cle, date) {
  if (cle === null || cle === undefined) return;
  const vu = carte.get(cle);
  if (vu) {
    vu.n++;
    if (date > vu.last) vu.last = date;
  } else {
    carte.set(cle, { n: 1, last: date });
  }
}

/**
 * Valeur dominante d'un compteur, selon un ordre explicite.
 *
 * `recent` d'abord pour le club — un joueur transféré cet été appartient à
 * son nouveau club, même si l'historique compte encore plus de matchs sous
 * l'ancien maillot. Fréquence d'abord pour le nom et le poste, où c'est
 * l'usage majoritaire de la source qui fait foi.
 */
function dominante(carte, { recent = false, plusLong = false } = {}) {
  let meilleur = null;
  for (const [cle, v] of carte) {
    if (!meilleur) { meilleur = [cle, v]; continue; }
    const [cleMax, max] = meilleur;
    const gagne = recent
      ? (v.last > max.last || (v.last === max.last && v.n > max.n))
      : (v.n > max.n
        || (v.n === max.n && plusLong && String(cle).length > String(cleMax).length)
        || (v.n === max.n && (!plusLong || String(cle).length === String(cleMax).length) && String(cle) < String(cleMax)));
    if (gagne) meilleur = [cle, v];
  }
  return meilleur?.[0] ?? null;
}

/**
 * Reconstruit les deux annuaires depuis le magasin.
 *
 * Idempotent et complet : on efface puis on recalcule, plutôt que de tenir
 * des compteurs à jour au fil de l'eau. Un annuaire dérivé qui dérive de sa
 * source est pire que pas d'annuaire du tout.
 *
 * POURQUOI EN JAVASCRIPT et non en SQL. La première version faisait tout
 * d'une requête, avec une CTE `MATERIALIZED` sur la jointure joueurs ×
 * rencontres et trois fonctions de fenêtrage. Mesuré : 130 secondes pour la
 * seule matérialisation, avant même la première agrégation — SQLite écrit
 * les 810 891 lignes dans un fichier temporaire, puis les retrie une fois
 * par fenêtre. La même chose en une passe séquentielle, avec les rencontres
 * tenues en mémoire (19 508 lignes, négligeables), ne trie rien du tout.
 *
 * Le slug se calcule dans la même passe, ce qui supprime au passage la
 * seconde boucle d'UPDATE qu'imposait SQLite, incapable de retirer les
 * accents.
 */
export function rebuildRegistries({ database = openDb() } = {}) {
  const db = database;
  const horodatage = now();

  // --- LECTURE : une passe sur chaque table, aucun tri -----------------
  const clubs = new Map();     // identifiant -> { noms, championnats, first, last, played }
  const rencontres = new Map(); // match_key -> camps, pour la passe joueurs

  for (const m of db.prepare('SELECT match_key, date, league, home_id, away_id, home_name, away_name FROM matches').iterate()) {
    rencontres.set(m.match_key, m);
    for (const [id, nom] of [[m.home_id, m.home_name], [m.away_id, m.away_name]]) {
      if (!id) continue;
      let c = clubs.get(id);
      if (!c) clubs.set(id, (c = { noms: new Map(), championnats: new Map(), first: m.date, last: m.date, played: 0 }));
      compte(c.noms, nom, m.date);
      compte(c.championnats, m.league, m.date);
      if (m.date < c.first) c.first = m.date;
      if (m.date > c.last) c.last = m.date;
      c.played++;
    }
  }

  const gens = new Map(); // identité -> { noms, postes, clubs, first, last, appearances }
  for (const p of db.prepare('SELECT match_key, side, player_id, player_key, name, position FROM players').iterate()) {
    const m = rencontres.get(p.match_key);
    if (!m) continue; // impossible : clé étrangère en cascade
    const pid = p.player_id ?? p.player_key;
    const clubId = p.side === 'home' ? m.home_id : m.away_id;
    let g = gens.get(pid);
    if (!g) gens.set(pid, (g = { noms: new Map(), postes: new Map(), clubs: new Map(), first: m.date, last: m.date, appearances: 0 }));
    compte(g.noms, p.name, m.date);
    compte(g.postes, p.position, m.date);
    if (clubId) compte(g.clubs, clubId, m.date);
    if (m.date < g.first) g.first = m.date;
    if (m.date > g.last) g.last = m.date;
    g.appearances++;
  }

  // --- ÉCRITURE -------------------------------------------------------
  db.exec('BEGIN IMMEDIATE');
  try {
    // --- ÉQUIPES ------------------------------------------------------
    // Le nom canonique est celui que la source emploie le plus souvent, ni
    // le premier rencontré ni le plus long : « Atlético Madrid » l'emporte
    // sur « Atletico Madrid » parce qu'il est majoritaire, et cela reste
    // vrai quand une source minoritaire écrit autrement.
    db.exec('DELETE FROM team_aliases');
    db.exec('DELETE FROM teams');
    const insEquipe = db.prepare(
      'INSERT INTO teams (team_id, name, slug, league, first_seen, last_seen, played, updated_at) VALUES (?,?,?,?,?,?,?,?)'
    );
    const insAliasEquipe = db.prepare(
      'INSERT INTO team_aliases (slug, team_id, alias, seen) VALUES (?,?,?,?)'
    );
    const nomDuClub = new Map();
    for (const [id, c] of clubs) {
      const nom = dominante(c.noms);
      nomDuClub.set(id, nom);
      // Le championnat RÉCENT, pas le plus fréquent : un promu appartient à
      // sa nouvelle division, même si son historique pèse encore l'ancienne.
      insEquipe.run(id, nom, slug(nom), dominante(c.championnats, { recent: true }), c.first, c.last, c.played, horodatage);
      for (const [alias, v] of c.noms) insAliasEquipe.run(slug(alias), id, alias, v.n);
    }

    // --- JOUEURS ------------------------------------------------------
    // Poste et club dominants précalculés ici une fois pour toutes. Les
    // déduire à chaque affichage balayait les 810 000 lignes : 12 secondes
    // par écran de classement.
    db.exec('DELETE FROM people_aliases');
    db.exec('DELETE FROM people');
    const insJoueur = db.prepare(
      'INSERT INTO people (player_id, name, slug, position, team_id, team_name, first_seen, last_seen, appearances, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    );
    const insAliasJoueur = db.prepare(
      'INSERT INTO people_aliases (slug, player_id, alias, seen) VALUES (?,?,?,?)'
    );
    for (const [pid, g] of gens) {
      // À fréquence égale, l'orthographe la plus COMPLÈTE : « Yiğit Efe
      // Demir » plutôt que « Yigit Demir », qui désignent le même homme.
      const nom = dominante(g.noms, { plusLong: true });
      const clubId = dominante(g.clubs, { recent: true });
      insJoueur.run(pid, nom, slug(nom), dominante(g.postes), clubId, clubId ? nomDuClub.get(clubId) ?? null : null,
        g.first, g.last, g.appearances, horodatage);
      for (const [alias, v] of g.noms) insAliasJoueur.run(slug(alias), pid, alias, v.n);
    }

    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* déjà annulée */ }
    throw error;
  }

  return {
    teams: db.prepare('SELECT COUNT(*) n FROM teams').get().n,
    teamAliases: db.prepare('SELECT COUNT(*) n FROM team_aliases').get().n,
    people: db.prepare('SELECT COUNT(*) n FROM people').get().n,
    peopleAliases: db.prepare('SELECT COUNT(*) n FROM people_aliases').get().n
  };
}

/**
 * Garantit que les annuaires existent avant qu'on s'y fie.
 *
 * Les classements de joueurs lisent désormais le poste et le club dans
 * `people` : un annuaire vide ne les ralentirait pas, il les viderait —
 * aucun poste, donc aucun joueur retenu par le filtre. Le magasin, lui,
 * peut avoir été rempli par un script qui ignore ce module (migration,
 * import d'une autre machine, restauration d'une sauvegarde).
 *
 * La reconstruction n'est tentée qu'une fois par processus et seulement si
 * l'annuaire est VIDE : un annuaire simplement en retard reste utilisable,
 * et le refaire à chaque lecture coûterait huit secondes pour rien. Après
 * un import, c'est à l'import d'appeler `rebuildRegistries()`.
 */
let verifie = false;
export function ensureRegistries({ database = openDb() } = {}) {
  if (verifie) return;
  verifie = true;
  const vide = database.prepare('SELECT COUNT(*) n FROM people').get().n === 0;
  const desMatchs = database.prepare('SELECT COUNT(*) n FROM players').get().n > 0;
  if (!vide || !desMatchs) return;
  console.warn("[identités] annuaire vide : reconstruction depuis le magasin…");
  const debut = Date.now();
  const bilan = rebuildRegistries({ database });
  console.warn(`[identités] ${bilan.people} joueurs, ${bilan.teams} clubs en ${Date.now() - debut} ms`);
}

/**
 * Clubs portant ce nom, le plus employé d'abord.
 *
 * Renvoie une LISTE : « Real Madrid » n'est pas ambigu, mais « Racing » ou
 * « Arsenal » le deviennent dès qu'on suit assez de championnats. C'est à
 * l'appelant de décider quoi faire d'une ambiguïté, pas au registre de la
 * masquer en choisissant pour lui.
 */
export function findTeams(name, { database = openDb() } = {}) {
  const cle = slug(name);
  if (!cle) return [];
  // Un club par ligne, pas un ALIAS par ligne. La version qui ne groupait
  // pas rendait deux lignes pour l'Atlético Madrid — « Atlético Madrid » et
  // « Atletico Madrid », le même club — et tout appelant qui lisait cette
  // liste comme « plusieurs candidats donc ambigu » retombait sur le nom
  // exact. Cela désactivait silencieusement la recherche par identifiant
  // pour les 164 clubs que les sources écrivent de plus d'une façon,
  // c'est-à-dire précisément ceux pour lesquels elle sert.
  return database.prepare(`
    SELECT t.team_id AS teamId, t.name, t.league, t.played, SUM(a.seen) AS seen,
           GROUP_CONCAT(a.alias, ' / ') AS aliases
    FROM team_aliases a JOIN teams t ON t.team_id = a.team_id
    WHERE a.slug = ?
    GROUP BY t.team_id
    ORDER BY seen DESC, t.played DESC
  `).all(cle);
}

/** Le club de ce nom s'il est le seul, sinon null. */
export function findTeamId(name, options = {}) {
  const candidats = findTeams(name, options);
  return candidats.length === 1 ? candidats[0].teamId : null;
}

/** Joueurs portant ce nom, le plus employé d'abord. */
export function findPeople(name, { database = openDb(), league = null } = {}) {
  const cle = slug(name);
  if (!cle) return [];
  const sql = `
    SELECT p.player_id AS playerId, p.name, p.position, p.team_id AS teamId, p.team_name AS teamName,
           p.appearances, p.last_seen AS lastSeen, a.alias, a.seen
    FROM people_aliases a JOIN people p ON p.player_id = a.player_id
    WHERE a.slug = ?${league ? ' AND p.team_id IN (SELECT team_id FROM teams WHERE league = ?)' : ''}
    ORDER BY a.seen DESC, p.appearances DESC`;
  return league ? database.prepare(sql).all(cle, league) : database.prepare(sql).all(cle);
}

/** Fiche d'annuaire d'un club. */
export function teamById(teamId, { database = openDb() } = {}) {
  return database.prepare(
    'SELECT team_id AS teamId, name, slug, league, first_seen AS firstSeen, last_seen AS lastSeen, played FROM teams WHERE team_id = ?'
  ).get(teamId) ?? null;
}

/** Fiche d'annuaire d'un joueur. */
export function playerById(playerId, { database = openDb() } = {}) {
  return database.prepare(
    'SELECT player_id AS playerId, name, slug, position, team_id AS teamId, team_name AS teamName, first_seen AS firstSeen, last_seen AS lastSeen, appearances FROM people WHERE player_id = ?'
  ).get(playerId) ?? null;
}

/** Ce que les annuaires couvrent, et ce qui leur échappe encore. */
export function registryCoverage({ database = openDb() } = {}) {
  const g = (sql) => database.prepare(sql).get();
  return {
    matches: g(`SELECT COUNT(*) total,
        SUM(CASE WHEN home_id IS NOT NULL AND away_id IS NOT NULL THEN 1 ELSE 0 END) identified,
        SUM(CASE WHEN fotmob_id IS NOT NULL THEN 1 ELSE 0 END) withFotmobId FROM matches`),
    teams: g('SELECT COUNT(*) total FROM teams').total,
    players: g(`SELECT COUNT(*) rows,
        SUM(CASE WHEN player_id IS NOT NULL THEN 1 ELSE 0 END) identified FROM players`),
    people: g('SELECT COUNT(*) total FROM people').total,
    ambiguousTeamAliases: g('SELECT COUNT(*) n FROM (SELECT slug FROM team_aliases GROUP BY slug HAVING COUNT(DISTINCT team_id) > 1)').n,
    ambiguousPeopleAliases: g('SELECT COUNT(*) n FROM (SELECT slug FROM people_aliases GROUP BY slug HAVING COUNT(DISTINCT player_id) > 1)').n
  };
}
