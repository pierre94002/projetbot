/**
 * UN MAGASIN FABRIQUÉ pour les essais du contexte du match (étape 32, lot 1a) — ce n'est PAS un fichier de test.
 * Exécuté DANS une copie de travail (cf. isolement.mjs), sur une base NEUVE de la copie : jamais la base du bac, jamais la
 * vraie base, et AUCUN résultat réel (règle de l'étape 32 : le banc est unique et viendra plus tard ; les essais
 * n'utilisent que des matchs fabriqués).
 *
 * Huit clubs RÉELS de venues.json (pour les stades, les distances, la pelouse et l'altitude) — six ordinaires, un sur
 * pelouse synthétique, un en altitude — jouent un championnat fabriqué (« Ligue 1 ») tous les 3 ou 4 jours pendant
 * `jours` jours, avec des coupes (« Coupe de France », et une coupe continentale à deux tours rapprochés), des coups
 * d'envoi à toutes les heures (dont 23 h 15 UTC), un match attribué, un match prolongé, un match joué ailleurs, des
 * arbitres (dont deux homonymes de pays différents et des matchs sans arbitre), des entraîneurs (un changement, un
 * intérim A → B → A, un entraîneur sans identifiant), des cartons (parfois non relevés), des déroulés (parfois
 * incomplets) et des penalties. Tout vient d'un générateur à graine : le même magasin, ligne pour ligne, à chaque fois.
 * Les tables écrites : matches, day_matches, team_day, league_day, team_style_matches ; puis les annuaires (teams,
 * team_aliases) reconstruits depuis `matches`, comme la nuit.
 */

import fs from 'node:fs';
import path from 'node:path';

const JOUR_MS = 86_400_000;
export const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

/** Générateur à graine (mulberry32). */
export function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const LIGUE = 'Ligue 1';
export const COUPE = 'Coupe de France';
export const CONTINENTALE = 'UEFA Europa League';
export const ARBITRES = Object.freeze([
  { name: 'Clément Turpin', country: 'France' },
  { name: 'Jean Dupont', country: 'France' },
  { name: 'Jean Dupont', country: 'Belgium' },
  { name: 'Anna Svensson', country: 'Sweden' },
  null
]);

/** Les huit clubs, pris dans venues.json du code (dans l'ordre des clés) : six ordinaires, un synthétique, un en altitude. */
export function clubsDuMagasin(venues) {
  const entrees = Object.entries(venues.clubs).sort(([a], [b]) => (a < b ? -1 : 1));
  const avecCoords = ([, v]) => Number.isFinite(v.lat) && Number.isFinite(v.long) && v.stade;
  const ordinaires = entrees.filter((e) => avecCoords(e) && e[1].synthetique === false && e[1].altitude === null && e[1].pays !== 'Brazil').slice(0, 6);
  const synthetique = entrees.find((e) => avecCoords(e) && e[1].synthetique === true && e[1].altitude === null);
  const altitude = entrees.find((e) => avecCoords(e) && Number(e[1].altitude) >= 2000);
  return [...ordinaires, synthetique, altitude].map(([cle, v], i) => ({ id: Number(cle.replace('fotmob-', '')), cle, nom: v.nom, stade: v.stade, synthetique: v.synthetique === true, altitude: v.altitude ?? null, rang: i }));
}

const HEURES = ['13:00', '15:00', '17:30', '19:45', '23:15', '20:00', '18:00'];

/**
 * Le calendrier fabriqué : une liste de matchs { matchKey, fotmobId, date, kickoff, league, home, away (numéros), saison }
 * — journées de championnat (méthode du cercle, aller puis retour) tous les 3 ou 4 jours, une journée de coupe de temps en
 * temps, deux tours rapprochés d'une coupe continentale. Pur.
 */
export function programme(clubs, { debut = '2026-08-01', jours = 60 } = {}) {
  const n = clubs.length;
  const ids = clubs.map((c) => c.id);
  const rondes = [];
  const rotation = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const paires = [];
    for (let i = 0; i < n / 2; i++) paires.push(r % 2 ? [rotation[n - 1 - i], rotation[i]] : [rotation[i], rotation[n - 1 - i]]);
    rondes.push(paires);
    rotation.splice(1, 0, rotation.pop());
  }
  const matchs = [];
  let jour = 0;
  let ronde = 0;
  let k = 0;
  while (jour < jours) {
    const date = plusJours(debut, jour);
    const paires = rondes[ronde % rondes.length].map(([h, a]) => (Math.floor(ronde / rondes.length) % 2 ? [a, h] : [h, a]));
    paires.forEach(([home, away], i) => {
      const heure = HEURES[(k + i) % HEURES.length];
      const kickoff = `${date}T${heure}:00.000Z`;
      matchs.push({ date, kickoff, league: LIGUE, home, away });
    });
    k++;
    // Une journée de coupe nationale entre deux journées, de temps en temps ; deux tours continentaux à 3 jours d'écart.
    if (ronde % 4 === 1 && jour + 2 < jours) {
      const dc = plusJours(debut, jour + 2);
      matchs.push({ date: dc, kickoff: `${dc}T19:00:00.000Z`, league: COUPE, home: ids[(ronde + 1) % n], away: ids[(ronde + 3) % n] });
    }
    if (ronde === 5 && jour + 2 < jours) {
      const d1 = plusJours(debut, jour + 1);
      const d2 = plusJours(debut, jour + 2);
      matchs.push({ date: d1, kickoff: `${d1}T18:45:00.000Z`, league: CONTINENTALE, home: ids[0], away: ids[5] });
      matchs.push({ date: d2, kickoff: `${d2}T21:00:00.000Z`, league: CONTINENTALE, home: ids[0], away: ids[6] });
    }
    jour += ronde % 2 ? 4 : 3;
    ronde++;
  }
  matchs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kickoff < b.kickoff ? -1 : a.kickoff > b.kickoff ? 1 : a.home - b.home));
  return matchs.map((m, i) => ({ ...m, matchKey: `fab-${m.date}-${m.home}-${m.away}`, fotmobId: String(9_000_000 + i), saison: 2026 }));
}

/** L'entraîneur d'un club au jour d'un match (changement, intérim A → B → A, un sans identifiant). */
function entraineurDe(club, date, matchsDuClub) {
  const base = { nom: `Entraîneur ${club.nom}`, id: 700_000 + club.rang };
  if (club.rang === 0 && date >= '2026-08-31') return { nom: 'Nouvel Entraîneur', id: 790_001 };
  if (club.rang === 1 && (matchsDuClub === 6 || matchsDuClub === 7)) return { nom: 'Entraîneur Intérimaire', id: 790_002 };
  if (club.rang === 2) return { nom: base.nom, id: null };
  return base;
}

const poissonTire = (u, l) => {
  let k = 0;
  let p = Math.exp(-l);
  let s = p;
  const x = u();
  while (x > s && k < 9) {
    k++;
    p *= l / k;
    s += p;
  }
  return k;
};

/**
 * ÉCRIT le magasin fabriqué dans `database` (une base NEUVE de la copie). `venues` : venues.json. Rend { clubs, matchs }
 * (chaque match avec ce qui a été écrit : score, arbitre, entraîneurs, cartons, penalties, attribué, prolongation).
 */
export function fabriquerLeMagasin(database, { venues, debut = '2026-08-01', jours = 60, graine = 32, rebuildRegistries = null } = {}) {
  const u = generateur(graine);
  const clubs = clubsDuMagasin(venues);
  const parId = new Map(clubs.map((c) => [c.id, c]));
  const matchs = programme(clubs, { debut, jours });
  const compte = new Map();
  const insMatch = database.prepare(
    `INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, lineups, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insDay = database.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insTeam = database.prepare(
    `INSERT INTO team_day (rencontre, camp, club, adversaire, date, league, saison, attribue, prolongation, compte, coupe, releve, bp, bc, bp90, bc90,
       jaunes_p, jaunes_c, rouges_p, rouges_c, fautes_p, fautes_c) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insStyle = database.prepare('INSERT INTO team_style_matches (match_key, camp, club, adversaire, date, league, coupe, sig, coach, coach_id, carte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)');
  const insLigue = database.prepare(
    `INSERT OR REPLACE INTO league_day (league, date, l_source, l_n, l_bd, l_be, l_xg_n, l_xd, l_xe, l_cad_n, l_cd, l_ce, c_saison, c_n, c_bd, c_be)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 2026, 0, 0, 0)`
  );
  const ligues = new Map();
  const ecrits = [];
  database.exec('BEGIN');
  try {
    let jourCourant = null;
    let duJour = [];
    const publierLaLigue = () => {
      for (const m of duJour) {
        const s = ligues.get(m.league) ?? { n: 0, bd: 0, be: 0 };
        if (!m.attribue) {
          s.n++;
          s.bd += m.hg;
          s.be += m.ag;
        }
        ligues.set(m.league, s);
      }
      duJour = [];
    };
    matchs.forEach((m, i) => {
      if (m.date !== jourCourant) {
        publierLaLigue();
        jourCourant = m.date;
      }
      const H = parId.get(m.home);
      const A = parId.get(m.away);
      const cup = m.league !== LIGUE;
      const attribue = i === 11;
      const prolongation = cup && m.league === COUPE && i % 2 === 1;
      let hg = poissonTire(u, 1.5);
      let ag = poissonTire(u, 1.1);
      if (prolongation && hg !== ag) ag = hg;
      let hg90 = hg;
      let ag90 = ag;
      if (prolongation) {
        hg += 1;
      }
      const arbitre = ARBITRES[i % ARBITRES.length];
      const nh = (compte.get(m.home) ?? 0) + 1;
      const na = (compte.get(m.away) ?? 0) + 1;
      compte.set(m.home, nh);
      compte.set(m.away, na);
      const eh = entraineurDe(H, m.date, nh);
      const ea = entraineurDe(A, m.date, na);
      // Le déroulé : chaque but avec sa minute et son camp ; un penalty de temps en temps ; parfois incomplet.
      const events = [];
      const minute = () => 1 + Math.floor(u() * 89);
      for (let g = 0; g < hg; g++) events.push({ type: 'goal', side: 'home', minute: prolongation && g === hg - 1 ? 105 : minute(), detail: u() < 0.15 ? 'Penalty' : null });
      for (let g = 0; g < ag; g++) events.push({ type: 'goal', side: 'away', minute: minute(), detail: u() < 0.15 ? 'Penalty' : null });
      const deroule = i % 13 === 5 && events.length ? events.slice(1) : events;
      const releve = i % 17 !== 3;
      const jh = releve ? Math.floor(u() * 5) + (i % 7 === 0 ? 1 : 0) : null;
      const ja = releve ? Math.floor(u() * 5) + 1 : null;
      const rh = releve ? (u() < 0.1 ? 1 : 0) : null;
      const ra = releve ? (u() < 0.1 ? 1 : 0) : null;
      const fh = releve ? 8 + Math.floor(u() * 9) : null;
      const fa = releve ? 8 + Math.floor(u() * 9) : null;
      const stade = i === 23 ? 'Stade de France' : H.stade;
      const meta = {
        kickoff: m.kickoff,
        stadium: stade,
        surface: H.synthetique ? 'artificial turf' : 'grass',
        ...(arbitre ? { referee: { name: arbitre.name, country: arbitre.country, yellowCardsPerMatch: 4.4, foulsPerMatch: 22.1, matches: 12, penalties: 2, redCards: 1 } } : {}),
        temperature: 18,
        windSpeed: 4,
        weather: 'Fair',
        ...(attribue ? { awarded: true, reason: 'awarded_win' } : {}),
        ...(prolongation ? { reason: 'afterextra' } : {})
      };
      const lineups = { home: { coach: eh.nom, ...(eh.id ? { coachId: eh.id } : {}) }, away: { coach: ea.nom, ...(ea.id ? { coachId: ea.id } : {}) } };
      const maj = `${m.date}T23:59:00.000Z`;
      insMatch.run(m.matchKey, m.matchKey, m.date, m.league, H.nom, A.nom, `fotmob-${m.home}`, `fotmob-${m.away}`, m.fotmobId, hg, ag, maj, JSON.stringify(deroule), JSON.stringify(lineups), JSON.stringify(meta));
      const r = insDay.run(m.matchKey, m.fotmobId, m.date, m.league, m.saison, m.home, m.away, maj);
      const rencontre = Number(r.lastInsertRowid);
      const complet = deroule.length === hg + ag;
      const b90 = complet ? (prolongation ? [hg90, ag90] : [hg, ag]) : [null, null];
      insTeam.run(rencontre, 1, m.home, m.away, m.date, m.league, m.saison, attribue ? 1 : 0, prolongation ? 1 : 0, 1, cup ? 1 : 0, 1, hg, ag, b90[0], b90[1], jh, ja, rh, ra, fh, fa);
      insTeam.run(rencontre, 0, m.away, m.home, m.date, m.league, m.saison, attribue ? 1 : 0, prolongation ? 1 : 0, 1, cup ? 1 : 0, 1, ag, hg, b90[1], b90[0], ja, jh, ra, rh, fa, fh);
      const sig = [maj, `fotmob-${m.home}`, `fotmob-${m.away}`, m.league, m.date].join('|');
      insStyle.run(m.matchKey, 1, m.home, m.away, m.date, m.league, cup ? 1 : 0, sig, eh.nom, eh.id);
      insStyle.run(m.matchKey, 0, m.away, m.home, m.date, m.league, cup ? 1 : 0, sig, ea.nom, ea.id);
      // Les moyennes du championnat AU JOUR J (les matchs d'avant J seulement).
      const s = ligues.get(m.league) ?? { n: 0, bd: 0, be: 0 };
      insLigue.run(m.league, m.date, s.n >= 10 ? 'saison' : 'défaut', s.n, s.bd, s.be);
      duJour.push({ league: m.league, hg, ag, attribue });
      ecrits.push({ ...m, hg, ag, hg90, ag90, attribue, prolongation, arbitre, entraineurs: { home: eh, away: ea }, stade, releve, complet, rencontre });
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  if (rebuildRegistries) rebuildRegistries({ database });
  return { clubs, matchs: ecrits };
}

/**
 * Un calendrier de saison fabriqué (le fichier JSON de la nuit) : les matchs à venir de `de` à `a` entre les huit clubs
 * (leurs noms), plus `enPlus` (lignes telles quelles : un nom inconnu, un match joué pas encore au magasin…). Écrit dans
 * `fichier`. Rend les lignes.
 */
export function ecrireUnCalendrier(fichier, clubs, { de, a, enPlus = [] }) {
  const lignes = [];
  let k = 0;
  for (let d = de; d <= a; d = plusJours(d, 1)) {
    if (k % 3 === 0) {
      for (let i = 0; i < clubs.length / 2; i++) {
        const h = clubs[(i + k) % clubs.length];
        const x = clubs[(clubs.length - 1 - i + k) % clubs.length];
        if (h.id === x.id) continue;
        lignes.push({ id: `cal-${d}-${h.id}-${x.id}`, matchId: `cal-${d}-${h.id}-${x.id}`, date: d, league: LIGUE, homeName: h.nom, awayName: x.nom, status: 'scheduled', homeGoals: null, awayGoals: null, round: null, source: 'fotmob', updatedAt: `${de}T00:00:00.000Z` });
      }
    }
    k++;
  }
  lignes.push(...enPlus);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, JSON.stringify(lignes));
  return lignes;
}
