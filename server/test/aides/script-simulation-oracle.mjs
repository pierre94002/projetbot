/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-simulation-oracle.mjs <serveur de la copie>
 *
 * Étape 28 — T8, L'ORACLE DE LA COPIE TRONQUÉE pour la nuit des matchs (le patron de l'oracle de l'étape 27,
 * script-banc.mjs, phase « oracleButs ») :
 *   1. les lignes football-data rattachées aux rencontres de Premier League (P4b, la même plantation que l'étape 27,
 *      graine 7) reçoivent un plus/moins 2,5 d'avant-match (fd_history) et le même relevé au magasin des cotes
 *      (odds_quotes, pré-clôture de la veille) ; puis une CLÔTURE absurde à H − 5 et un relevé en DIRECT à H + 10
 *      (après la nuit de J 3 h : jamais lus par elle) ;
 *   2. le banc de l'étape 27 rejoue P4 deux fois : la CANDIDATE déclarée dans le code (CANDIDATE_EN_ESSAI, telle que la
 *      nuit la lit : configDeLaCandidate) et la version EN SERVICE ; il garde, par rencontre, les buts attendus et le
 *      1N2 de chaque analyse — les entrées du banc ;
 *   3. pour six rencontres, du plus récent au plus ancien : tout ce qui est daté du jour J ou après supprimé ; la table du
 *      jour J et l'étape « forcesButs » refaites (la table vaut « avant J ») ; la NUIT DES MATCHS à J 3 h de Paris
 *      (`maintenant` passé comme le fait la passe) sur ce match ; on lit ce qu'elle a rangé pour les deux rôles, et on
 *      rejoue simulerMatch directement avec les entrées rangées ;
 *   4. un 9-0 planté le jour J (le club qui reçoit, un autre match) : la nuit refaite range les mêmes octets.
 * L'horloge de la copie reste figée AILLEURS (MAINTENANT_FIGE, 05/10 12 h) : la table du jour J, les forces et la nuit
 * reçoivent l'heure de la passe (J 2 h 30 puis J 3 h de Paris), comme dans la passe de Pierre où l'horloge vaut cette
 * heure-là. Avec une clé de rencontre en second argument (« horloge ») : sans banc ni 9-0, cette seule rencontre —
 * le test la lance l'horloge figée À J 3 h de Paris et compare les octets rangés à ceux du premier passage.
 * Sortie : une ligne JSON ; le TEST compare (1e-6 pour les entrées, à l'octet pour les marchés et la table).
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur, cleSeule = null] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;
const { openDb, resolveDbPath, upsertMatches, deleteMatches, COLONNES_COTES_FD } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const T = await imp('data/db/dayTable.js');
const R = await imp('bench/runner.js');
const F = await imp('data/db/forcesButs.js');
const G = await imp('core/engine/goalModel.js');
const SN = await imp('data/simulation/simulationNuit.js');
const SM = await imp('data/simulation/simulationMatch.js');
const { PARAMS } = await imp('data/simulation/reglages.js');
const { lireReglagesDuMoteur } = await imp('core/engine/engineConfig.js');
const { candidateEnEssai, configDeLaCandidate } = await imp('core/engine/engineVersions.js');
const { prixFd } = await imp('bench/prix.js');
const { TEAM_COLUMNS, PLAYER_COLUMNS } = await imp('data/db/columns.js');

const sortie = { ok: true };
const graine = 7;
const cent = (x) => Math.round(x * 100);
const cotes = (p, marge) => p.map((x) => Math.max(1.02, 1 / (x * (1 + marge))));
const trio = (v, pref, c, suffixes = ['1', 'n', '2']) => suffixes.forEach((sx, z) => (v[`${pref}_${sx}`] = c ? cent(c[z]) : null));
function mulberry(g) {
  let s = g >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function club(pays, nom) {
  db.prepare('INSERT OR IGNORE INTO fd_teams (pays, nom) VALUES (?, ?)').run(pays, nom);
  return db.prepare('SELECT id FROM fd_teams WHERE pays = ? AND nom = ?').get(pays, nom).id;
}
const COLS_FD = ['code', 'saison', 'date', 'date_fichier', 'heure', 'dom', 'ext', 'match_key', 'lien', 'bd', 'be', 'tirs_d', 'tirs_e', 'cadres_d', 'cadres_e', 'corners_d', 'corners_e', ...COLONNES_COTES_FD];
const insererFd = (v) => db.prepare(`INSERT INTO fd_history (${COLS_FD.join(', ')}) VALUES (${COLS_FD.map(() => '?').join(', ')})`).run(...COLS_FD.map((c) => v[c] ?? null));

/** La plantation de l'étape 27 (script-banc.mjs, rattacherAuMagasin), recopiée telle quelle : lien 1 sauf trois lignes de la fin. */
function rattacherAuMagasin(g = graine) {
  const u = mulberry(g + 1);
  const rencontres = db.prepare("SELECT match_key, date, home_goals, away_goals FROM matches WHERE league = 'EPL' AND date >= '2025-07-01' ORDER BY date, match_key").all();
  const dernier = rencontres.length - 1;
  rencontres.forEach((r, k0) => {
    const k = k0 === dernier - 2 ? 3 : k0 === dernier - 1 ? 4 : k0 === dernier ? 5 : k0 >= 3 && k0 <= 5 ? 6 + k0 : k0;
    const p = [0.3 + u() * 0.3, 0.25, 0];
    p[2] = 1 - p[0] - p[1];
    const v = { code: 'E0', saison: '2025-26', date: r.date, date_fichier: r.date, dom: club('ENG', `magasin dom ${k0}`), ext: club('ENG', `magasin ext ${k0}`), match_key: r.match_key, lien: k === 3 ? 2 : k === 4 ? 3 : 1, bd: r.home_goals, be: r.away_goals };
    trio(v, 'moy', cotes(p, 0.06));
    trio(v, 'moy', k === 5 ? [1.2, 2.0, 2.2] : cotes(p, 0.05), ['c1', 'cn', 'c2']);
    if (k % 2 === 0) {
      trio(v, 'pin', cotes(p, 0.03));
      trio(v, 'pin', cotes(p, 0.025), ['c1', 'cn', 'c2']);
    }
    trio(v, 'wh', cotes(p.map((x, z) => (z === 0 ? x * 0.9 : x)), 0.07));
    trio(v, 'b365', cotes(p, 0.065));
    insererFd(v);
  });
}
function entreeDe(matchKey, changements = {}) {
  const m = db.prepare('SELECT * FROM matches WHERE match_key = ?').get(matchKey);
  const parse = (t) => (t ? JSON.parse(t) : null);
  const teamStats = {};
  for (const t of db.prepare('SELECT * FROM team_stats WHERE match_key = ?').all(matchKey)) teamStats[t.side] = Object.fromEntries(TEAM_COLUMNS.map((c) => [c.key, t[c.column]]).filter(([, v]) => v !== null && v !== undefined));
  const players = { home: [], away: [] };
  for (const p of db.prepare('SELECT * FROM players WHERE match_key = ? ORDER BY side, ord').all(matchKey)) {
    const j = Object.fromEntries(PLAYER_COLUMNS.map((c) => [c.key, p[c.column]]).filter(([, v]) => v !== null && v !== undefined));
    if (j.starter !== undefined) j.starter = j.starter === 1;
    if (j.subbedIn !== undefined) j.subbedIn = j.subbedIn === 1;
    players[p.side]?.push(j);
  }
  return { date: m.date, league: m.league, homeName: m.home_name, awayName: m.away_name, homeId: m.home_id, awayId: m.away_id, fotmobId: m.fotmob_id, homeGoals: m.home_goals, awayGoals: m.away_goals, events: null, lineups: parse(m.lineups), meta: parse(m.meta), shotmap: null, sources: ['essai'], teamStats, players, ...changements };
}

// 1. La table du jour J, les lignes rattachées, le plus/moins d'avant-match (fd_history ET odds_quotes) ; clôture et direct.
await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 } });
rattacherAuMagasin();
const rattachees = db.prepare("SELECT f.id, f.match_key, m.date, m.league, m.home_name, m.away_name, m.home_id, m.away_id FROM fd_history f JOIN matches m ON m.match_key = f.match_key WHERE f.lien = 1 ORDER BY f.id").all();
const majFd = db.prepare('UPDATE fd_history SET moy_p25 = ?, moy_m25 = ? WHERE id = ?');
const evenement = db.prepare(`INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at) VALUES ('football-data.co.uk', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'essai étape 28', ?)`);
const coteOu = db.prepare(`INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price) VALUES (?, 'Moyenne du marché', 'ou', ?, 2.5, ?, '', ?, ?)`);
rattachees.forEach((r, k) => {
  const over = 160 + ((k * 7) % 45);
  const under = Math.round(100 / (1.06 - 100 / over));
  majFd.run(over, under, r.id);
  const ko = Date.parse(`${r.date}T12:00:00.000Z`);
  const veille = new Date(ko - 86_400_000).toISOString();
  const ev = Number(evenement.run(`essai:${r.match_key}`, r.league, r.date, `${r.date}T12:00:00.000Z`, r.home_name, r.away_name, r.home_id, r.away_id, r.match_key, veille).lastInsertRowid);
  coteOu.run(ev, 'over', 'preclose', veille, over / 100);
  coteOu.run(ev, 'under', 'preclose', veille, under / 100);
  // Après la nuit de J 3 h : une clôture absurde (H − 5) et un relevé en direct (H + 10) — jamais lus par la nuit.
  coteOu.run(ev, 'over', 'close', new Date(ko - 5 * 60_000).toISOString(), 3.6);
  coteOu.run(ev, 'under', 'close', new Date(ko - 5 * 60_000).toISOString(), 1.25);
  coteOu.run(ev, 'over', 'live', new Date(ko + 10 * 60_000).toISOString(), 9.5);
  coteOu.run(ev, 'under', 'live', new Date(ko + 10 * 60_000).toISOString(), 1.02);
});
sortie.plusMoinsPlantes = rattachees.length;

// 2. Le banc de l'étape 27, deux fois : la candidate (telle que la nuit la lit) et la version en service.
const service = lireReglagesDuMoteur().football;
const enEssai = candidateEnEssai({});
const candidate = enEssai ? configDeLaCandidate(service, enEssai, 'football') : null;
sortie.candidate = enEssai ? { id: enEssai.id, modeleDeButs: Boolean(candidate?.modeleDeButs) } : null;
sortie.serviceAvecLeModele = Boolean(service?.modeleDeButs);
if (!candidate) throw new Error('aucune candidate en essai dans la copie : T8 demande les deux rôles');
const empreinte = G.empreinteDesForces(G.reglagesDuModeleDeButs(candidate));
async function banc(config) {
  const parMatch = new Map();
  const lignes = [];
  const rb = await R.rejouer({
    database: db,
    periodes: ['P4'],
    prix: ['fd-avant-match'],
    de: '2026-08-15',
    tirages: 100,
    minBlocs: 20,
    reproduction: false,
    config,
    surLigne: (l) => lignes.push(l),
    surAnalyse: ({ jeu, analyse, rencontre }) => {
      if (jeu !== 'fd-avant-match' || !rencontre.matchKey) return;
      const mb = analyse.modeleDeButs;
      parMatch.set(rencontre.matchKey, {
        buts: mb ? { home: mb.expectedGoals.home, away: mb.expectedGoals.away, rho: mb.rho, grille: 'modele-buts-441' } : { home: analyse.expectedGoals.home, away: analyse.expectedGoals.away, rho: config.defaultCorrelation, grille: 'ancien-81' },
        fair: analyse.distributions?.result ?? null,
        provenance: mb?.provenance?.code ?? null
      });
    }
  });
  return { rb, parMatch, lignes };
}
const vide = { rb: { bilan: { erreur: null } }, parMatch: new Map(), lignes: [] };
const bancC = cleSeule ? vide : await banc(candidate);
const bancS = cleSeule ? vide : await banc(service);
sortie.banc = cleSeule ? null : { erreurC: bancC.rb.bilan.erreur, erreurS: bancS.rb.bilan.erreur, analysesC: bancC.parMatch.size, analysesS: bancS.parMatch.size };
const lignesBanc = bancC.lignes.filter((l) => l.type === 'ligne' && l.prix === 'fd-avant-match' && l.periode === 'P4b');
const cibles = cleSeule ? [cleSeule] : [...new Set(lignesBanc.map((l) => l.matchKey))].filter(Boolean).sort().reverse().filter((_, i) => i % 9 === 0).slice(0, 6);
sortie.horlogeDuProcessus = new Date().toISOString();

// 3. Pour chaque cible : la copie tronquée à J, la nuit des matchs à J 3 h de Paris, les deux rôles.
const HEURE_DE_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** L'instant où il est 3 h à Paris le jour J (la passe de nuit de Pierre), changement d'heure compris. */
function troisHeuresDeParis(jour) {
  const t0 = SN.minuitDeParis(jour);
  for (const h of [3, 2, 4]) if (HEURE_DE_PARIS.format(new Date(t0 + h * 3_600_000)) === '03:00') return t0 + h * 3_600_000;
  throw new Error(`3 h de Paris introuvable le ${jour}`);
}
const lireLignes = () =>
  Object.fromEntries(
    db
      .prepare('SELECT * FROM simulation_matchs ORDER BY role')
      .all()
      .map((r) => [r.role, { ...r, table_jointe: r.table_jointe ? Buffer.from(r.table_jointe).toString('base64') : null }])
  );
sortie.oracle = [];
let plante = 0;
for (const k of cibles) {
  const m = db.prepare('SELECT match_key, date, league, home_name, away_name, home_id, away_id FROM matches WHERE match_key = ?').get(k);
  const ligneFd = db.prepare('SELECT * FROM fd_history WHERE match_key = ? AND lien = 1').get(k);
  const autreAvant = db.prepare("SELECT match_key FROM matches WHERE league = 'EPL' AND date < ? AND home_id <> ? AND away_id <> ? ORDER BY date DESC, match_key LIMIT 1").get(m.date, m.home_id, m.home_id)?.match_key ?? null;
  const gabarit = autreAvant ? entreeDe(autreAvant) : null;
  const instant = troisHeuresDeParis(m.date);
  const passe = () => new Date(instant - 30 * 60_000).toISOString();
  deleteMatches(db.prepare('SELECT match_key FROM matches WHERE date >= ?').all(m.date).map((x) => x.match_key), { database: db });
  db.prepare('DELETE FROM simulation_matchs').run();
  await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 }, maintenant: new Date(passe()) });
  const nuitForces = await F.forcesDeButs({ empreintes: [empreinte], database: db, aPart: false, maintenant: passe });
  const mo = prixFd(ligneFd, { jeu: 'fd-avant-match' });
  const match = { matchId: k, home: m.home_name, away: m.away_name, league: m.league, commenceTime: `${m.date}T12:00:00.000Z`, sportKey: 'football', bankroll: 1000, hasOdds: true, marketOdds: { odds1: mo.odds1, oddsDraw: mo.oddsDraw, odds2: mo.odds2, bookmakersCount: mo.bookmakersCount, byBookmaker: mo.byBookmaker } };
  const nuit = await SN.simulerLesMatchsDeLaNuit({ maintenant: instant, matchs: [match], aPart: false, reglagesEnService: service, juger: false });
  const rangees = lireLignes();
  // simulerMatch appelé DIRECTEMENT avec les entrées rangées (graine refaite) : les mêmes octets ?
  const direct = {};
  for (const [role, r] of Object.entries(rangees)) {
    if (r.grille !== 'modele-buts-441') continue;
    const seed = SM.graineDuMatch({ cle: r.fixture_key, role, lambda: r.lambda, mu: r.mu, rho: r.rho });
    const ch = SM.simulerMatch({ lambda: r.lambda, mu: r.mu, grille: G.grilleDesButs(r.lambda, r.mu, r.rho), params: PARAMS, n: r.n, seed });
    direct[role] = { seed, marches: JSON.stringify(SM.marchesDesChemins(ch)), table: Buffer.from(SM.tableJointe(ch)).toString('base64') };
  }
  // 3 bis (vérification du 27/10, constat 10) : la même nuit pour une rencontre du CALENDRIER SEUL (sans cote) des deux
  // mêmes clubs, datée J + 1 (régime « sans cote » de la candidate : ses buts attendus passent par les moyennes du
  // championnat) ; rangée seule, après les lignes de la rencontre cotée (déjà lues).
  const jPlus1 = new Date(Date.parse(`${m.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const calendrierSeul = { matchId: `cal-${k}`, home: m.home_name, away: m.away_name, league: m.league, commenceTime: `${jPlus1}T12:00:00.000Z`, sportKey: 'football', bankroll: 1000, hasOdds: false };
  const lireCalendrierSeul = () => Object.fromEntries(db.prepare('SELECT * FROM simulation_matchs WHERE date = ? ORDER BY role').all(jPlus1).map((r) => [r.role, { ...r, table_jointe: r.table_jointe ? Buffer.from(r.table_jointe).toString('base64') : null }]));
  const nuitCalendrier = await SN.simulerLesMatchsDeLaNuit({ maintenant: instant, matchs: [calendrierSeul], aPart: false, reglagesEnService: service, juger: false });
  const calendrier = { date: jPlus1, nuit: { mode: nuitCalendrier.mode, erreur: nuitCalendrier.erreur ?? null, bilan: nuitCalendrier.bilan }, rangees: lireCalendrierSeul(), apresNeufZero: null };
  // 4. Un 9-0 planté le jour J : la nuit refaite range les mêmes octets.
  let neufZero = null;
  if (gabarit && !cleSeule) {
    upsertMatches([{ ...gabarit, date: m.date, fotmobId: String(990000700 + plante++), homeId: m.home_id, homeName: m.home_name, homeGoals: 9, awayGoals: 0, meta: { ...(gabarit.meta ?? {}), kickoff: `${m.date}T09:00:00.000Z` } }], { database: db });
    await T.construireTableJourJ({ database: db, rendreLaMain: null, controle: { lignes: 0 }, maintenant: new Date(passe()) });
    await F.forcesDeButs({ empreintes: [empreinte], database: db, aPart: false, maintenant: passe });
    const nuit2 = await SN.simulerLesMatchsDeLaNuit({ maintenant: instant, matchs: [match], aPart: false, reglagesEnService: service, juger: false });
    neufZero = { mode: nuit2.mode, auMagasin: db.prepare('SELECT COUNT(*) n FROM matches WHERE date = ?').get(m.date).n, lignes: lireLignes() };
    // La rencontre du calendrier seul, la nuit refaite après le 9-0 (constat 10).
    const nuitCalendrier2 = await SN.simulerLesMatchsDeLaNuit({ maintenant: instant, matchs: [calendrierSeul], aPart: false, reglagesEnService: service, juger: false });
    calendrier.apresNeufZero = { mode: nuitCalendrier2.mode, lignes: lireCalendrierSeul() };
  }
  sortie.oracle.push({
    matchKey: k,
    date: m.date,
    instant: new Date(instant).toISOString(),
    heureDeParis: HEURE_DE_PARIS.format(new Date(instant)),
    nuitForces: { mode: nuitForces.mode, ecarts: nuitForces.controle ? nuitForces.controle.ecarts.length : null },
    nuit: { mode: nuit.mode, erreur: nuit.erreur ?? null, bilan: nuit.bilan },
    banc: { candidate: bancC.parMatch.get(k) ?? null, service: bancS.parMatch.get(k) ?? null },
    rangees,
    direct,
    neufZero,
    calendrier
  });
}
console.log(JSON.stringify(sortie));
