/**
 * Étape 28 (la simulation complète) : ce que les essais PLANTENT dans une copie isolée de la base d'essai — ce n'est
 * PAS un fichier de test.
 *
 * La base d'essai n'a ni un championnat complet et cohérent (ses rencontres sont un échantillon), ni forces de buts,
 * ni calendrier : les essais des fins de saison plantent ici un championnat fabriqué, COHÉRENT par construction — une
 * table officielle dont les matchs joués sont exactement ceux du magasin avant D, la table de la saison précédente
 * (k = 2), les clubs à l'annuaire, un calendrier des journées suivantes, et les forces de buts de chaque club. Tout est
 * écrit par SQL dans la base de la COPIE (jamais une autre), avec un tirage à graine (le même à chaque passage).
 */

/** Le championnat des essais : il a des coupes rattachées (leagueCups.js), il est absent de la base d'essai. */
export const LIGUE_ESSAI = 'Ligue 2 - France';
/** Les numéros FotMob des clubs fabriqués (aucun club réel ne les porte). */
export const NUMERO0 = 990100;
const LETTRES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** mulberry32 : le même tirage à chaque passage. */
export function tirage(graine) {
  let s = graine >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Les clubs fabriqués : { numero (texte), teamId ('fotmob-…'), nom }. */
export const clubsFabriques = (n) => Array.from({ length: n }, (_, i) => ({ numero: String(NUMERO0 + i + 1), teamId: `fotmob-${NUMERO0 + i + 1}`, nom: `Essai ${LETTRES[i]}` }));

/** Le calendrier aller-retour (méthode du cercle) : journées 0..2(n−1)−1, chacune [[dom, ext], …] (indices). */
export function calendrierAllerRetour(n) {
  const tours = [];
  const autres = Array.from({ length: n - 1 }, (_, i) => i + 1);
  for (let r = 0; r < n - 1; r++) {
    const rang = [0, ...autres];
    const paires = [];
    for (let k = 0; k < n / 2; k++) {
      const a = rang[k];
      const b = rang[n - 1 - k];
      paires.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    tours.push(paires);
    autres.unshift(autres.pop());
  }
  return [...tours, ...tours.map((t) => t.map(([a, b]) => [b, a]))];
}

const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** La table officielle (lignes FotMob) des matchs joués : rang, points (3/1), différence, buts, domicile/extérieur. */
export function tableDesMatchs(clubs, matchs, { descriptions = {} } = {}) {
  const t = new Map(clubs.map((c) => [c.teamId, { teamId: c.teamId, teamName: c.nom, shortName: c.nom, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0, home: { played: 0, goalsFor: 0 }, away: { played: 0, goalsFor: 0 } }]));
  for (const m of matchs) {
    const h = t.get(m.homeId);
    const a = t.get(m.awayId);
    h.played++;
    a.played++;
    h.goalsFor += m.hg;
    h.goalsAgainst += m.ag;
    a.goalsFor += m.ag;
    a.goalsAgainst += m.hg;
    h.home.played++;
    h.home.goalsFor += m.hg;
    a.away.played++;
    a.away.goalsFor += m.ag;
    if (m.hg > m.ag) {
      h.wins++;
      a.losses++;
      h.points += 3;
    } else if (m.hg === m.ag) {
      h.draws++;
      a.draws++;
      h.points++;
      a.points++;
    } else {
      a.wins++;
      h.losses++;
      a.points += 3;
    }
  }
  const lignes = [...t.values()].map((r) => ({ ...r, goalDiff: r.goalsFor - r.goalsAgainst }));
  lignes.sort((x, y) => y.points - x.points || y.goalDiff - x.goalDiff || y.goalsFor - x.goalsFor || (x.teamId < y.teamId ? -1 : 1));
  const n = lignes.length;
  return lignes.map((r, i) => ({ ...r, rank: i + 1, description: descriptions[i + 1] ?? (i < 2 ? 'Promotion' : i < 5 ? 'Promotion qualification' : i >= n - 2 ? 'Relegation' : null) }));
}

/**
 * PLANTE un championnat cohérent dans la base `db` (celle de la copie) : `n` clubs (pair), `jouees` journées jouées
 * AVANT `jourD` (une par semaine, la dernière la veille de D), la table officielle relevée à `releveLe` (≤ l'heure de
 * la nuit), la table de la saison précédente (aller-retour complet : k = 2), les clubs à l'annuaire, et rend le
 * calendrier des `aVenir` journées suivantes (à partir de D + 1, une par semaine) au format de season-calendar.json.
 * Rend { clubs, joues: [{ matchKey, date, homeId, awayId, hg, ag }], calendrier, tours, saison }.
 */
export function planterUnChampionnat(db, { league = LIGUE_ESSAI, saison = 2026, n = 20, jouees = 3, jourD, releveLe, aVenir = 3, graine = 28, prefixe = 'essai28' }) {
  const u = tirage(graine);
  const clubs = clubsFabriques(n);
  const tours = calendrierAllerRetour(n);
  const joues = [];
  for (let r = 0; r < jouees; r++) {
    const date = plusJours(jourD, -1 - 7 * (jouees - 1 - r));
    for (const [i, j] of tours[r]) {
      const hg = Math.floor(u() * 4);
      const ag = Math.floor(u() * 3);
      joues.push({ matchKey: `${prefixe}-${league}-${r}-${i}-${j}`, date, homeId: clubs[i].teamId, awayId: clubs[j].teamId, homeName: clubs[i].nom, awayName: clubs[j].nom, hg, ag, round: r + 1 });
    }
  }
  const insererMatch = db.prepare(`INSERT OR REPLACE INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, meta)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const m of joues) insererMatch.run(m.matchKey, `stats-${m.matchKey}`, m.date, league, m.homeName, m.awayName, m.homeId, m.awayId, String(990000 + joues.indexOf(m) + graine * 1000), m.hg, m.ag, JSON.stringify({ round: String(m.round), leagueKey: 'FRA|Ligue 2' }));
  const insererTeam = db.prepare('INSERT OR REPLACE INTO teams (team_id, name, slug, league, played) VALUES (?, ?, ?, ?, ?)');
  for (const c of clubs) insererTeam.run(c.teamId, c.nom, c.nom.toLowerCase().replace(/[^a-z]+/g, '-'), league, jouees);
  const table = tableDesMatchs(clubs, joues);
  const insererTable = db.prepare('INSERT OR REPLACE INTO standings_official (league, season, table_name, ord, fetched_at, rows) VALUES (?, ?, ?, 0, ?, ?)');
  insererTable.run(league, saison, 'Ligue 2', releveLe, JSON.stringify(table));
  // La saison précédente : un aller-retour complet (2(n − 1) journées), pour k = 2.
  const precedente = clubs.map((c, i) => ({ teamId: c.teamId, teamName: c.nom, rank: i + 1, played: 2 * (n - 1), points: 60 - i, goalsFor: 40, goalsAgainst: 40, goalDiff: 0 }));
  insererTable.run(league, saison - 1, 'Ligue 2', '2026-06-01T08:00:00.000Z', JSON.stringify(precedente));
  const calendrier = [];
  for (let r = jouees; r < Math.min(tours.length, jouees + aVenir); r++) {
    const date = plusJours(jourD, 1 + 7 * (r - jouees));
    for (const [i, j] of tours[r]) {
      calendrier.push({ id: `${prefixe}-cal-${r}-${i}-${j}`, matchId: `cal-${date}-${clubs[i].nom.toLowerCase().replace(' ', '-')}-${clubs[j].nom.toLowerCase().replace(' ', '-')}`, date, league, homeName: clubs[i].nom, awayName: clubs[j].nom, status: 'scheduled', homeGoals: null, awayGoals: null, round: `Journée ${r + 1}`, source: 'fotmob', updatedAt: releveLe });
    }
  }
  return { clubs, joues, calendrier, tours, saison, table };
}

/** L'empreinte des forces de la candidate déclarée (demi-vies 35/25, remise à zéro). */
export const EMPREINTE_ESSAI = 'v1|35|25|remise-a-zero';

/**
 * PLANTE les forces de buts des clubs (une ligne de jour `jour` par club ; `seulement` : les numéros à planter) et
 * l'état des forces (`calculeLe`), pour l'empreinte `empreinte`. Sommes tirées à graine (forces entre 0,8 et 1,25).
 */
export function planterLesForces(db, { clubs, jour, calculeLe, empreinte = EMPREINTE_ESSAI, seulement = null, graine = 5, league = LIGUE_ESSAI }) {
  const u = tirage(graine);
  const inserer = db.prepare('INSERT OR REPLACE INTO forces_buts (reglages, club, jour, ligue, n, nx, sa, wa, sd, wd, sga, wga, sgd, wgd) VALUES (?, ?, ?, ?, 12, 12, ?, 10, ?, 10, ?, 10, ?, 10)');
  for (const c of clubs) {
    if (seulement && !seulement.includes(c.numero)) continue;
    const att = 8 + u() * 4.5;
    const def = 8 + u() * 4.5;
    inserer.run(empreinte, Number(c.numero), jour, league, att, def, att, def);
  }
  const etat = db.prepare('INSERT OR REPLACE INTO forces_buts_state (cle, valeur) VALUES (?, ?)');
  etat.run('version', '1');
  etat.run('empreintes', JSON.stringify([empreinte]));
  etat.run('calcule_le', calculeLe);
  etat.run('jusqua', jour);
  db.prepare("DELETE FROM forces_buts_state WHERE cle = 'en_cours'").run();
}

/** Les lignes rangées d'un championnat pour une nuit (pour comparer deux nuits à l'octet). */
export function instantaneDesSaisons(db, { league = LIGUE_ESSAI, calculeLe }) {
  return JSON.stringify({
    etat: db.prepare('SELECT * FROM saisons_etat WHERE league = ? AND calcule_le = ?').all(league, calculeLe).map(({ duree_ms, ...r }) => r),
    simulees: db.prepare('SELECT * FROM saisons_simulees WHERE league = ? AND calcule_le = ? ORDER BY table_name, team_id, loi, famille').all(league, calculeLe),
    enjeux: db.prepare('SELECT * FROM enjeux_rencontres WHERE league = ? AND calcule_le = ? ORDER BY date, home_id, away_id, loi').all(league, calculeLe)
  });
}
