/**
 * ÉTAPE 40, LOT 1b (17/11/2026) — VERT OU ROUGE, AVEC LE CHIFFRE RÉEL, APRÈS LE MATCH.
 *   node --test test/ficheApresMatch.test.mjs        (depuis server/)
 *
 * 1. Le module serveur `data/fiche/ficheApresMatch.js` (ficheDuMatchJoue) sur une base FABRIQUÉE en mémoire (le schéma réel,
 *    `__testing.DDL` de matchStatsDb.js ; jamais la vraie base, jamais la base du bac) : juste, faux, non réglable et sa raison ;
 *    prolongation, tapis vert, match reporté, statistique non relevée, rencontre ambiguë, révisions, sans identifiant ; 4 lectures
 *    (5 avec prolongation), aucune écriture ; le MÊME règlement que le bilan de la fiabilité (lignesDuMois, rejoué) ; la copie de
 *    `coupDEnvoiDuMagasin` comparée à l'original À L'OCTET (calibration.js est gelé : l'exporter n'est pas permis pendant l'essai n° 3).
 * 2. La VRAIE route GET /api/match-ai-analysis/fixture dans une copie isolée (test/aides/script-fiche-apres-match.mjs) : sans
 *    `matchKey`, la réponse d'avant ; avec, la fiche ; le masque des buts ; une panne du module ne casse pas l'onglet.
 * 3. L'écran (ui/src/utils/apresLeMatch.js, neuf et pur ; AiMarketCard `reel`, MatchAiReviewPanel `fiche`, PronosticsGelesCard neuve,
 *    MatchDetailView) rendu côté serveur sur ces réponses : les mots, le vert « Juste », le rouge « Faux », le gris « Non
 *    réglable » et sa raison, jamais de vert ni de rouge pour une value, aucun avertissement de Vue ; le câblage et l'hygiène.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, espaces, reglesPures } from './aides/rendu.mjs';
import { __testing as DB } from '../src/data/db/matchStatsDb.js';
import { ficheDuMatchJoue, MOTS_FICHE_APRES_MATCH, PROVENANCE_FICHE } from '../src/data/fiche/ficheApresMatch.js';
import { lignesDuMois, RAISONS_ECARTEES } from '../src/data/calibration.js';

const lire = (...c) => fs.readFileSync(path.join(SERVEUR, ...c), 'utf8');
const lireUi = (...c) => fs.readFileSync(path.join(UI, 'src', ...c), 'utf8');
const U = await imp(path.join(UI, 'src', 'utils', 'apresLeMatch.js'));
const MAINTENANT = Date.parse('2026-11-17T08:00:00.000Z');

// ================================================================================ la base fabriquée

/** Une base NEUVE en mémoire, au schéma réel du magasin. */
function baseNeuve() {
  const db = new DatabaseSync(':memory:');
  for (const sql of DB.DDL) if (sql.startsWith('CREATE TABLE')) db.exec(sql);
  for (const sql of DB.DDL) if (!sql.startsWith('CREATE TABLE')) db.exec(sql);
  return db;
}
const H = 'fotmob-990501';
const A = 'fotmob-990502';
function match(db, { cle, date = '2026-11-10', hg = 2, ag = 1, meta = null, stats = { home: [5, 12, 4], away: [6, 9, 3] }, events = null, home = H, away = A }) {
  db.prepare('INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, meta, events) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(cle, cle, date, 'Ligue Fabriquée', 'Aldora', 'Brevik', home, away, hg, ag, JSON.stringify(meta ?? { kickoff: `${date}T15:00:00.000Z` }), events ? JSON.stringify(events) : null);
  for (const [side, s] of Object.entries(stats ?? {})) {
    if (s) db.prepare('INSERT INTO team_stats (match_key, side, corner_kicks, total_shots, shots_on_goal) VALUES (?, ?, ?, ?, ?)').run(cle, side, s[0], s[1], s[2]);
  }
}
const PICKS = [
  ['result', 'Résultat', { outcome: 'home' }, 'home', 'Aldora gagne'],
  ['totalGoals', 'Total buts', { line: 2.5, side: 'over' }, 'over', 'Plus de 2.5 buts'],
  ['bothTeamsScore', 'Les 2 équipes marquent', { outcome: 'no' }, 'no', 'Non'],
  ['teamGoals', 'Buts — Brevik', { team: 'away', line: 1.5, side: 'under' }, 'under', 'Brevik — Moins de 1.5 buts'],
  ['totalCorners', 'Total corners', { line: 9.5, side: 'over' }, 'over', 'Plus de 9.5 corners'],
  ['teamCorners', 'Corners — Aldora', { team: 'home', line: 5.5, side: 'over' }, 'over', 'Aldora — Plus de 5.5 corners'],
  ['totalShots', 'Total tirs', { line: 22.5, side: 'under' }, 'under', 'Moins de 22.5 tirs'],
  ['totalShotsOnTarget', 'Total tirs cadrés', { line: 6.5, side: 'over' }, 'over', 'Plus de 6.5 tirs cadrés']
];
function geler(db, { jour = '2026-11-10', version = 1, recordedAt = null, picks = PICKS, home = H, away = A, kickoff = `${jour}T15:00:00.000Z`, probability = 0.6, choix = null, engineVersion = 5 } = {}) {
  const ins = db.prepare(`INSERT INTO engine_picks (fixture_key, market_key, version, recorded_at, origin, league, date, kickoff, home_name, away_name, home_id, away_id,
    market_id, market, params, choice, label, probability, engine_version) VALUES (?, ?, ?, ?, 'nuit', 'Ligue Fabriquée', ?, ?, 'Aldora', 'Brevik', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const [id, market, params, choice, label] of picks) {
    ins.run(`fotmob:${home}|${away}|${jour}`, `${id}|${JSON.stringify(params)}`, version, recordedAt ?? `${jour}T05:00:00.000Z`, jour, kickoff, home, away, id, market, JSON.stringify(params), choix?.[id]?.[0] ?? choice, choix?.[id]?.[1] ?? label, probability, engineVersion);
  }
}
/** Une base comptée : chaque requête préparée est notée (le nombre de lectures, et qu'elles ne sont que des SELECT). */
function comptee(db) {
  const sql = [];
  return { sql, base: { prepare: (s) => (sql.push(s), db.prepare(s)) } };
}
const fiche = (db, matchKey, extra = {}) => ficheDuMatchJoue({ matchKey, database: db, maintenant: MAINTENANT, ...extra });
const parMarche = (f) => Object.fromEntries(f.pronostics.map((p) => [p.marketId, p]));

// ================================================================================ 1. le module serveur

test('T-B1 — un match réglé : juste ou faux par marché, comme le dit le score ou la statistique ; 4 lectures, des SELECT seulement, aucune écriture', () => {
  const db = baseNeuve();
  match(db, { cle: 'm1' });
  match(db, { cle: 'm1-autre-adversaire', away: 'fotmob-990599' }); // même club à domicile, le même jour, un autre adversaire : pas une voisine
  geler(db);
  const { sql, base } = comptee(db);
  const avant = db.prepare('SELECT total_changes() AS n').get().n;
  const f = ficheDuMatchJoue({ matchKey: 'm1', database: base, maintenant: MAINTENANT });
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n, avant, 'aucune écriture');
  assert.equal(f.etat, 'regle');
  assert.equal(f.lectures, 4);
  assert.equal(sql.length, 4);
  for (const s of sql) assert.match(s.trim(), /^SELECT\b/, s);
  assert.ok(sql.some((s) => /home_id = \?/.test(s) && /-2 day/.test(s)), 'les voisines par idx_matches_home_id, à ± 2 jours');
  assert.ok(sql.some((s) => /fixture_key IN \(\?, \?, \?\)/.test(s)), 'les trois clés');
  assert.ok(!sql.some((s) => /SELECT events/.test(s)), 'pas de déroulé sans prolongation');
  const p = parMarche(f);
  // 2-1 ; corners 5 + 6 = 11 ; tirs 12 + 9 = 21 ; cadrés 4 + 3 = 7.
  assert.deepEqual(
    Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.realise])),
    { result: true, totalGoals: true, bothTeamsScore: false, teamGoals: true, totalCorners: true, teamCorners: false, totalShots: true, totalShotsOnTarget: true }
  );
  assert.deepEqual(f.reel.buts, { home: 2, away: 1 });
  assert.deepEqual(f.reel.stats.corners, { home: 5, away: 6 });
  assert.equal(f.reel.prolongation, false);
  assert.equal(p.result.engineVersion, 5);
  assert.equal(p.result.probability, 0.6);
  assert.equal(f.provenance, PROVENANCE_FICHE);
  // Une seule valeur gelée : la première EST la dernière, rien à redire sous la ligne (CE-3).
  for (const x of f.pronostics) assert.equal(x.premiere, null, x.marketId);
});

/** La base du match prolongé de T-B2 (2-2 à la 120e, 1-1 à la 90e), reprise par T-E6 pour l'écran. */
function baseProlongee() {
  const db = baseNeuve();
  match(db, { cle: 'm2', hg: 2, ag: 2, meta: { kickoff: '2026-11-10T15:00:00.000Z', reason: 'afterextra' }, events: [{ type: 'goal', side: 'home', minute: 10 }, { type: 'goal', side: 'away', minute: 60 }, { type: 'goal', side: 'home', minute: 100 }, { type: 'goal', side: 'away', minute: 115 }] });
  geler(db);
  return db;
}
/** La base du tapis vert de T-B4 (3-0 attribué), reprise par T-E2 pour l'écran. */
function baseTapisVert() {
  const db = baseNeuve();
  match(db, { cle: 'm4', hg: 3, ag: 0, meta: { kickoff: '2026-11-10T15:00:00.000Z', reason: 'awarded_win' } });
  geler(db);
  return db;
}

test('T-B2 — match prolongé : 5 lectures (le déroulé), le score de la 90e minute règle les buts, corners et tirs non réglables avec leur raison', () => {
  const db = baseProlongee();
  const { sql, base } = comptee(db);
  const f = ficheDuMatchJoue({ matchKey: 'm2', database: base, maintenant: MAINTENANT });
  assert.equal(f.lectures, 5);
  assert.ok(sql.some((s) => /SELECT events FROM matches WHERE match_key = \?/.test(s)));
  assert.equal(f.reel.prolongation, true);
  assert.deepEqual(f.reel.buts, { home: 1, away: 1 });
  assert.deepEqual(f.reel.butsFinal, { home: 2, away: 2 });
  const p = parMarche(f);
  assert.equal(p.result.realise, false, 'nul à la 90e : « Aldora gagne » est faux');
  assert.equal(p.totalGoals.realise, false, '2 buts à la 90e : « plus de 2,5 » est faux (4 à la 120e)');
  for (const id of ['totalCorners', 'teamCorners', 'totalShots', 'totalShotsOnTarget']) {
    assert.equal(p[id].realise, null);
    assert.equal(p[id].raison, 'prolongationStats');
    assert.equal(p[id].raisonTexte, RAISONS_ECARTEES.prolongationStats);
  }
  assert.equal(U.chiffreReel(p.result, f.reel), 'Score à la 90e minute : 1-1 (match prolongé)');
  assert.equal(U.chiffreReel(p.totalGoals, f.reel), '2 buts à la 90e minute (1-1, match prolongé)');
});

test('T-B3 — match prolongé au déroulé incomplet : les buts non réglables (prolongationSansScore90), jamais le score de la 120e', () => {
  const db = baseNeuve();
  match(db, { cle: 'm3', hg: 2, ag: 2, meta: { kickoff: '2026-11-10T15:00:00.000Z', reason: 'afterpenalties' }, events: [{ type: 'goal', side: 'home', minute: 10 }] });
  geler(db);
  const f = fiche(db, 'm3');
  const p = parMarche(f);
  for (const id of ['result', 'totalGoals', 'bothTeamsScore', 'teamGoals']) assert.equal(p[id].raison, 'prolongationSansScore90', id);
  assert.equal(f.reel.buts, null);
  assert.equal(f.reel.raisonButs, 'prolongationSansScore90');
});

test('T-B4 — tapis vert : la fiche le dit, chaque pronostic « attribue », aucun juste ni faux', () => {
  const f = fiche(baseTapisVert(), 'm4');
  assert.equal(f.etat, 'attribue');
  assert.equal(f.message, MOTS_FICHE_APRES_MATCH.attribue);
  assert.equal(f.pronostics.length, PICKS.length);
  for (const p of f.pronostics) assert.deepEqual([p.realise, p.raison], [null, 'attribue']);
});

test('T-B5 — match reporté (sans score, « postponed ») : « reporte », raison sansResultat ; sans score à venir : « a-venir », rien de lu au-delà de la rencontre', () => {
  const db = baseNeuve();
  match(db, { cle: 'm5', hg: null, ag: null, meta: { kickoff: '2026-11-10T15:00:00.000Z', reason: 'postponed' }, stats: null });
  geler(db);
  // L'avis de l'IA sur ce match reporté : ni juste ni faux, la raison du bilan (CE-2).
  const entry = { homeName: 'Aldora', awayName: 'Brevik', engineSnapshot: { marketPredictions: [{ market: 'Résultat', predictedLabel: 'Aldora gagne', predictedOutcome: 'home', marketId: 'result', params: { outcome: 'home' } }] } };
  const f = fiche(db, 'm5', { entry });
  assert.equal(f.etat, 'reporte');
  assert.equal(f.message, MOTS_FICHE_APRES_MATCH.sansResultat);
  assert.equal(f.pronostics.length, PICKS.length);
  for (const p of f.pronostics) assert.equal(p.raison, 'sansResultat');
  assert.equal(f.avis.length, 1);
  assert.equal(f.avis[0].realise, null);
  assert.equal(f.avis[0].issue, null);
  assert.equal(f.avis[0].raison, 'sansResultat');
  assert.equal(f.avis[0].raisonTexte, RAISONS_ECARTEES.sansResultat);
  match(db, { cle: 'm5b', date: '2026-11-20', hg: null, ag: null, stats: null, home: 'fotmob-990503', away: 'fotmob-990504' });
  const { base } = comptee(db);
  const g = ficheDuMatchJoue({ matchKey: 'm5b', database: base, maintenant: MAINTENANT });
  assert.equal(g.etat, 'a-venir');
  assert.equal(g.lectures, 1);
  assert.deepEqual(g.pronostics, []);
  // Le jour même (MAINTENANT est le 17/11), sans score et sans raison : encore « à venir », rien de lu au-delà (CE-5).
  match(db, { cle: 'm5c', date: '2026-11-17', hg: null, ag: null, stats: null, home: 'fotmob-990505', away: 'fotmob-990506' });
  const jour = ficheDuMatchJoue({ matchKey: 'm5c', database: comptee(db).base, maintenant: MAINTENANT });
  assert.equal(jour.etat, 'a-venir');
  assert.equal(jour.message, MOTS_FICHE_APRES_MATCH.aVenir);
  assert.equal(jour.lectures, 1);
});

test('T-B6 — corners ou tirs non relevés (0-0 au magasin, ou absents) : non réglables (statNonRelevee) ; les buts se règlent', () => {
  const db = baseNeuve();
  match(db, { cle: 'm6', stats: { home: [0, null, 4], away: [0, 9, 3] } });
  geler(db);
  const p = parMarche(fiche(db, 'm6'));
  assert.equal(p.totalCorners.raison, 'statNonRelevee');
  assert.equal(p.teamCorners.raison, 'statNonRelevee');
  assert.equal(p.totalShots.raison, 'statNonRelevee');
  assert.equal(p.totalShotsOnTarget.realise, true);
  assert.equal(p.result.realise, true);
});

test('T-B7 — deux rencontres des mêmes clubs le même jour : « rencontreAmbigue », jamais une prise au hasard', () => {
  const db = baseNeuve();
  match(db, { cle: 'm7a' });
  match(db, { cle: 'm7b' });
  geler(db);
  const f = fiche(db, 'm7a');
  for (const p of f.pronostics) assert.equal(p.raison, 'rencontreAmbigue');
});

test('T-B8 — les trois clés : la veille et le lendemain se rattachent à cette rencontre, sauf si le bilan les donne à une autre rencontre plus proche', () => {
  const db = baseNeuve();
  match(db, { cle: 'm8' });
  match(db, { cle: 'm8-retour', date: '2026-11-12' });
  geler(db, { jour: '2026-11-09', picks: PICKS.slice(0, 1) });
  geler(db, { jour: '2026-11-11', picks: PICKS.slice(1, 2) }); // à un jour des deux : 2 candidates à ± 1 jour, aucune le jour même → ambiguë
  geler(db, { jour: '2026-11-12', picks: PICKS.slice(2, 3) }); // le jour même de l'autre : à l'autre
  const f = fiche(db, 'm8');
  const p = parMarche(f);
  assert.equal(p.result.realise, true, 'la veille se règle ici');
  assert.equal(p.totalGoals.raison, 'rencontreAmbigue');
  assert.equal(p.bothTeamsScore, undefined, 'le pronostic du 12 appartient à l’autre rencontre');
});

test('T-B9 — les révisions : la dernière gelée AVANT le coup d’envoi est réglée, la première dite quand elle différait, une révision d’après le coup d’envoi ignorée', () => {
  const db = baseNeuve();
  match(db, { cle: 'm9' });
  const un = PICKS.slice(0, 1);
  geler(db, { picks: un, version: 1, recordedAt: '2026-11-09T22:00:00.000Z', choix: { result: ['away', 'Brevik gagne'] } });
  geler(db, { picks: un, version: 2, recordedAt: '2026-11-10T10:00:00.000Z' });
  geler(db, { picks: un, version: 3, recordedAt: '2026-11-10T16:00:00.000Z', choix: { result: ['draw', 'Match nul'] } });
  // Même choix et même libellé, autre version (le moteur gèle chaque nuit) : la première n'est PAS redite (CE-3).
  const deux = PICKS.slice(1, 2);
  geler(db, { picks: deux, version: 1, recordedAt: '2026-11-09T22:00:00.000Z', probability: 0.55 });
  geler(db, { picks: deux, version: 2, recordedAt: '2026-11-10T10:00:00.000Z', probability: 0.6 });
  const tous = parMarche(fiche(db, 'm9'));
  const p = tous.result;
  assert.equal(p.version, 2);
  assert.equal(p.label, 'Aldora gagne');
  assert.equal(p.realise, true);
  assert.equal(p.premiere.label, 'Brevik gagne');
  assert.equal(p.premiere.realise, false);
  assert.equal(tous.totalGoals.version, 2);
  assert.equal(tous.totalGoals.realise, true);
  assert.equal(tous.totalGoals.premiere, null, 'même choix, autre version : rien à redire');
});

test('T-B10 — introuvable, sans identifiant : la phrase, aucun pronostic rattaché ; les avis de l’IA se règlent quand même sans identifiant', () => {
  const db = baseNeuve();
  assert.equal(fiche(db, 'nulle-part').etat, 'introuvable');
  assert.equal(fiche(db, '').etat, 'introuvable');
  match(db, { cle: 'm10', home: null, away: null });
  const entry = { homeName: 'Aldora', awayName: 'Brevik', engineSnapshot: { marketPredictions: [{ market: 'Résultat', predictedLabel: 'Aldora gagne', predictedOutcome: 'home', marketId: 'result', params: { outcome: 'home' } }] } };
  const f = fiche(db, 'm10', { entry });
  assert.equal(f.etat, 'sans-identifiant');
  assert.equal(f.message, MOTS_FICHE_APRES_MATCH.sansIdentifiant);
  assert.deepEqual(f.pronostics, []);
  assert.equal(f.avis[0].realise, true);
});

test('T-B11 — les avis de l’IA : chaque pronostic commenté réglé sur la même rencontre (équipe par ses paramètres)', () => {
  const db = baseNeuve();
  match(db, { cle: 'm11' });
  const entry = { homeName: 'Aldora', awayName: 'Brevik', engineSnapshot: { marketPredictions: PICKS.map(([marketId, market, params, choice, label]) => ({ market, predictedLabel: label, predictedOutcome: choice, marketId, params })) } };
  const f = fiche(db, 'm11', { entry });
  assert.equal(f.avis.length, PICKS.length);
  const parId = Object.fromEntries(f.avis.map((a) => [a.marketId, a.realise]));
  assert.deepEqual(parId, { result: true, totalGoals: true, bothTeamsScore: false, teamGoals: true, totalCorners: true, teamCorners: false, totalShots: true, totalShotsOnTarget: true });
});

test('T-B12 — le même règlement que le bilan de la fiabilité : lignesDuMois rejoué sur la même base donne les mêmes juste / faux / écartés', () => {
  const db = baseNeuve();
  match(db, { cle: 'r1' });
  match(db, { cle: 'r2', date: '2026-11-11', hg: 0, ag: 0, home: 'fotmob-990511', away: 'fotmob-990512', stats: { home: [0, 0, 0], away: [0, 0, 0] } });
  match(db, { cle: 'r3', date: '2026-11-12', hg: 1, ag: 1, home: 'fotmob-990521', away: 'fotmob-990522', meta: { kickoff: '2026-11-12T15:00:00.000Z', reason: 'afterextra' }, events: [{ type: 'goal', side: 'home', minute: 30 }, { type: 'goal', side: 'away', minute: 95 }] });
  geler(db);
  geler(db, { jour: '2026-11-11', home: 'fotmob-990511', away: 'fotmob-990512' });
  geler(db, { jour: '2026-11-12', home: 'fotmob-990521', away: 'fotmob-990522' });
  // CE-4 : des pronostics gelés SANS pourcentage, sur un 2-1 joué (r4) et sur un tapis vert (r5) : le bilan les écarte
  // (« sansProbabilite », avant même le tapis vert) ; la fiche aussi, ni juste ni faux. Mais la raison de la rencontre passe
  // avant (r6 : passé, sans score, pronostics sans pourcentage : « sansScore » des deux côtés).
  match(db, { cle: 'r4', date: '2026-11-13', home: 'fotmob-990531', away: 'fotmob-990532' });
  match(db, { cle: 'r5', date: '2026-11-14', hg: 3, ag: 0, home: 'fotmob-990541', away: 'fotmob-990542', meta: { kickoff: '2026-11-14T15:00:00.000Z', reason: 'awarded_win' } });
  geler(db, { jour: '2026-11-13', home: 'fotmob-990531', away: 'fotmob-990532', probability: null });
  geler(db, { jour: '2026-11-14', home: 'fotmob-990541', away: 'fotmob-990542', probability: null });
  match(db, { cle: 'r6', date: '2026-11-15', hg: null, ag: null, stats: null, home: 'fotmob-990551', away: 'fotmob-990552' });
  geler(db, { jour: '2026-11-15', home: 'fotmob-990551', away: 'fotmob-990552', probability: null });
  const gen = lignesDuMois('2026-11', { database: db, maintenant: MAINTENANT });
  let r = gen.next();
  while (!r.done) r = gen.next();
  const bilan = new Map(r.value.vues.derniere.lignes.map((l) => [l.cle, l.realise]));
  let regles = 0;
  const ecartesFiche = {};
  for (const cle of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
    for (const p of fiche(db, cle).pronostics) {
      const k = `${p.fixtureKey}|${p.marketKey}`;
      if (p.raison) {
        assert.equal(bilan.has(k), false, `${k} écarté des deux côtés`);
        assert.equal(p.realise, null, k);
        ecartesFiche[p.raison] = (ecartesFiche[p.raison] ?? 0) + 1;
      } else {
        assert.equal(p.realise, bilan.get(k), k);
        regles++;
      }
    }
  }
  assert.equal(regles, bilan.size);
  const ecartes = Object.values(ecartesFiche).reduce((s, n) => s + n, 0);
  assert.equal(regles + ecartes, PICKS.length * 6);
  // Raison par raison, les mêmes comptes que le bilan (sansProbabilite compris).
  assert.deepEqual(ecartesFiche, r.value.vues.derniere.ecartees);
  assert.equal(ecartesFiche.sansProbabilite, PICKS.length * 2);
  assert.equal(ecartesFiche.sansScore, PICKS.length);
  const r4 = parMarche(fiche(db, 'r4'));
  assert.equal(r4.result.realise, null, '2-1 et « Aldora gagne » sans pourcentage : ni juste ni faux');
  assert.equal(r4.result.issue, null);
  assert.equal(r4.result.raison, 'sansProbabilite');
  assert.equal(r4.result.raisonTexte, RAISONS_ECARTEES.sansProbabilite);
  assert.equal(r4.result.probability, null);
});

test('T-B13 — la copie de coupDEnvoiDuMagasin (et de `instant`) est celle de calibration.js, à l’octet ; les fonctions du règlement sont importées sans retouche', () => {
  const cal = lire('src', 'data', 'calibration.js');
  const mod = lire('src', 'data', 'fiche', 'ficheApresMatch.js');
  const bloc = (t, debut) => {
    const i = t.indexOf(debut);
    assert.ok(i >= 0, debut);
    return t.slice(i, t.indexOf('\n}', i) + 2);
  };
  assert.equal(bloc(mod, 'function coupDEnvoiDuMagasin(meta) {'), bloc(cal, 'function coupDEnvoiDuMagasin(meta) {'));
  const inst = (t) => t.slice(t.indexOf('const instant = (x) => {'), t.indexOf('};', t.indexOf('const instant = (x) => {')) + 2);
  assert.equal(inst(mod), inst(cal));
  assert.match(mod, /import \{ reglementDeLaRencontre, issueDuPronostic, revisionsRetenues, RAISONS_ECARTEES, cleNumerique, parametres \} from '\.\.\/calibration\.js';/);
  assert.match(mod, /import \{ indicateursDUneRencontre \} from '\.\.\/db\/dayTable\.js';/);
});

test('T-B14 — frontière : le module ne fait que lire (aucun INSERT, UPDATE, DELETE, REPLACE, aucun réseau) ; seul le contrôleur libre le charge, par import() dans un try', () => {
  const mod = lire('src', 'data', 'fiche', 'ficheApresMatch.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(mod, /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i);
  assert.doesNotMatch(mod, /\bfetch\(|node:http|https?:\/\/|writeFile|appendFile|\.exec\(/);
  const qui = [];
  (function marcher(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) marcher(p);
      else if (/\.m?js$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('fiche/ficheApresMatch.js')) qui.push(path.relative(path.join(SERVEUR, 'src'), p).split(path.sep).join('/'));
    }
  })(path.join(SERVEUR, 'src'));
  assert.deepEqual(qui.sort(), ['api/controllers/matchAiAnalysis.controller.js']);
  const ctrl = lire('src', 'api', 'controllers', 'matchAiAnalysis.controller.js');
  assert.doesNotMatch(ctrl, /^import[^\n]*ficheApresMatch/m, 'aucun import statique : le module ne peut pas casser le chargement de la route');
  assert.match(ctrl, /try \{\n {4}const \{ ficheDuMatchJoue \} = await import\('\.\.\/\.\.\/data\/fiche\/ficheApresMatch\.js'\);/);
  assert.match(ctrl, /export async function getForFixture\(req, res\)/);
});

// ================================================================================ 2. la vraie route, dans une copie isolée

function lancer(phase, env = {}) {
  const copie = preparerCopie({});
  try {
    // app.js charge tout le serveur, dont un import de scripts/ (merge-match-stats.mjs) : la copie les prend aussi.
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-fiche-apres-match.mjs'), { args: [phase], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false', ...env } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
// Une panne de la copie ne fait tomber que les essais de la route (T-R*), jamais ceux du module ni de l'écran.
let R;
let P;
let PANNE_DE_LA_COPIE = null;
before(() => {
  try {
    R = lancer('route', { CM_TEST_MASQUE_DES_BUTS: '1' });
    P = lancer('panne');
  } catch (e) {
    PANNE_DE_LA_COPIE = e;
  }
});
const copiePrete = () => {
  if (PANNE_DE_LA_COPIE) throw PANNE_DE_LA_COPIE;
};

test('T-R1 — sans matchKey, la réponse d’avant à l’identique (entry, predictions, experience, rien d’autre) ; avec, la même et la fiche', () => {
  copiePrete();
  assert.equal(R.sans.code, 200);
  assert.deepEqual(Object.keys(R.sans.corps).sort(), ['entry', 'experience', 'predictions']);
  assert.equal(R.avec.code, 200);
  const { fiche: f, ...reste } = R.avec.corps;
  assert.deepEqual(reste, R.sans.corps);
  assert.equal(f.etat, 'regle');
  assert.equal(f.matchKey, 'essai-40b-2026-10-04-girona-mallorca');
});

test('T-R2 — Girona - Mallorca (0-0, corners 5 + 6, tirs 12 + 10, cadrés 3 + 2) : les 15 avis de l’IA et les 15 pronostics gelés réglés comme le bilan de l’IA', () => {
  copiePrete();
  const f = R.avec.corps.fiche;
  const revues = new Map(R.avec.corps.entry.postMatchReview.marketReviews.map((r) => [r.market, r.outcome]));
  assert.equal(f.avis.length, 15);
  assert.equal(f.pronostics.length, 15);
  for (const a of f.avis) assert.equal(a.realise ? 'juste' : 'faux', revues.get(a.market), a.market);
  for (const p of f.pronostics) assert.equal(p.realise ? 'juste' : 'faux', revues.get(p.market), p.market);
  assert.deepEqual(f.reel.stats.corners, { home: 5, away: 6 });
  assert.equal(R.ecritures, 0, 'la route n’écrit rien dans la base');
  assert.deepEqual(R.fichiers, ['match-ai-analyses.json'], 'ni fichier créé ni réécrit au data/runtime');
});

test('T-R3 — le masque des buts : un match d’après le 15/11 perd ses pronostics de buts dans la fiche, la phrase du masque le dit ; corners et 1N2 restent', () => {
  copiePrete();
  const f = R.apresMasque.corps.fiche;
  if (!fs.existsSync(path.join(SERVEUR, 'src', 'data', 'masqueDesButs.js'))) {
    // Le bac à sable ne porte pas le lot 0 (aucun masque) : rien n'est caché, les trois pronostics restent.
    assert.deepEqual(f.pronostics.map((p) => p.marketId).sort(), ['result', 'totalCorners', 'totalGoals']);
    assert.equal(f.butsCaches, undefined);
    return;
  }
  assert.deepEqual(f.pronostics.map((p) => p.marketId).sort(), ['result', 'totalCorners']);
  assert.match(f.butsCaches, /^Pronostics de buts cachés depuis le 15\/11/);
  assert.equal(R.avec.corps.fiche.butsCaches, undefined, 'le match du 04/10 est d’avant le masque : rien de caché');
});

test('T-R4 — une clé inconnue : « introuvable », la phrase ; la page garde son analyse', () => {
  copiePrete();
  assert.equal(R.inconnue.code, 200);
  assert.equal(R.inconnue.corps.fiche.etat, 'introuvable');
  assert.ok(R.inconnue.corps.entry);
});

test('T-R5 — une panne du module (simulée dans la copie) ne casse pas l’onglet : 200, l’analyse, « panne » et sa raison ; sans matchKey, rien ne change', () => {
  copiePrete();
  assert.equal(P.avec.code, 200);
  assert.ok(P.avec.corps.entry?.analysis);
  assert.equal(P.avec.corps.fiche.etat, 'panne');
  assert.match(P.avec.corps.fiche.message, /panne simulée du module/);
  assert.deepEqual(P.avec.corps.fiche.pronostics, []);
  assert.deepEqual(Object.keys(P.sans.corps).sort(), ['entry', 'experience', 'predictions']);
});

// ================================================================================ 3. l'écran

test('T-E1 — les chiffres réels : « 11 corners (5 + 6) », un singulier, l’équipe nommée, le score ; rien quand la statistique manque', () => {
  const reel = { buts: { home: 2, away: 1 }, prolongation: false, stats: { corners: { home: 5, away: 6 }, shots: { home: 1, away: 0 }, shotsOnTarget: null } };
  const noms = { home: 'Aldora', away: 'Brevik' };
  assert.equal(U.chiffreReel({ marketId: 'totalCorners' }, reel, noms), '11 corners (5 + 6)');
  assert.equal(U.chiffreReel({ marketId: 'teamCorners', params: { team: 'away' } }, reel, noms), '6 corners pour Brevik');
  assert.equal(U.chiffreReel({ marketId: 'totalShots' }, reel, noms), '1 tir (1 + 0)');
  assert.equal(U.chiffreReel({ marketId: 'totalShotsOnTarget' }, reel, noms), null);
  assert.equal(U.chiffreReel({ marketId: 'result' }, reel, noms), 'Score : 2-1');
  assert.equal(U.chiffreReel({ marketId: 'totalGoals' }, reel, noms), '3 buts (2-1)');
  assert.equal(U.chiffreReel({ marketId: 'teamGoals', params: { team: 'home' } }, reel, noms), '2 buts pour Aldora (2-1)');
  assert.equal(U.chiffreReel({ marketId: 'teamGoals', params: { team: 'away' } }, reel, noms), '1 but pour Brevik (2-1)');
  assert.equal(U.chiffreReel({ marketId: 'inconnu' }, reel, noms), null);
});

test('T-E2 — reelDeLaCarte : l’avis rattaché par marché ET libellé exacts ; la note ambre seulement quand le bilan de l’IA et le magasin divergent', () => {
  const f = R.avec.corps.fiche;
  const ligne = { market: 'Total corners', pick: 'Plus de 5.5 corners', source: { marketId: 'totalCorners', params: { line: 5.5, side: 'over' } } };
  const r = U.reelDeLaCarte(ligne, f, { statut: 'correct', noms: { home: 'Girona', away: 'Mallorca' } });
  assert.deepEqual([r.cle, r.libelle, r.icone, r.chiffre, r.ecart], ['juste', 'Juste', 'check', '11 corners (5 + 6)', null]);
  const contre = U.reelDeLaCarte(ligne, f, { statut: 'incorrect' });
  assert.equal(contre.ecart, U.MOTS_APRES_MATCH.ecart('Pronostic faux', 'Juste'));
  assert.equal(U.reelDeLaCarte(ligne, f, { statut: 'pending' }).ecart, null, 'un bilan pas encore réglé ne fait pas d’écart');
  assert.equal(U.reelDeLaCarte({ ...ligne, pick: 'Moins de 5.5 corners' }, f), null, 'un autre libellé : rien, jamais le premier trouvé');
  assert.equal(U.reelDeLaCarte(ligne, null), null);
  assert.equal(U.reelDeLaCarte(ligne, P.avec.corps.fiche), null, 'fiche en panne : rien sur la carte');
  const nr = U.reelDeLaCarte({ market: 'Résultat', pick: 'Girona gagne' }, { avis: [{ market: 'Résultat', predictedLabel: 'Girona gagne', marketId: 'result', realise: null, raison: 'attribue', raisonTexte: RAISONS_ECARTEES.attribue }] }, { statut: 'correct' });
  assert.deepEqual([nr.cle, nr.libelle, nr.raison, nr.chiffre, nr.ecart], ['non-reglable', 'Non réglable', RAISONS_ECARTEES.attribue, null, null]);
  // CE-6. La fiche du tapis vert de T-B4 (3-0 sur le papier) : la carte dit « Non réglable » et sa raison, jamais le chiffre.
  const noms = { home: 'Aldora', away: 'Brevik' };
  const tv = fiche(baseTapisVert(), 'm4');
  assert.deepEqual([tv.reel.buts, tv.reel.butsFinal], [null, { home: 3, away: 0 }], 'le 3-0 attribué ne règle rien');
  const carteTv = U.reelDeLaCarte({ market: 'Résultat', pick: 'Aldora gagne' }, tv, { statut: 'correct', noms });
  assert.deepEqual([carteTv.cle, carteTv.libelle, carteTv.chiffre, carteTv.raison, carteTv.ecart], ['non-reglable', 'Non réglable', null, RAISONS_ECARTEES.attribue, null]);
  // Et quand le magasin a bien le score (2-1) mais que le pronostic ne se règle pas (clé ambiguë de T-B7) : toujours aucun
  // chiffre sous « Non réglable » (le chiffre ne dit que ce qui a réglé le pronostic).
  const db7 = baseNeuve();
  match(db7, { cle: 'm7a' });
  match(db7, { cle: 'm7b' });
  geler(db7);
  const amb = fiche(db7, 'm7a');
  assert.deepEqual(amb.reel.buts, { home: 2, away: 1 });
  for (const [market, pick] of [['Résultat', 'Aldora gagne'], ['Total corners', 'Plus de 9.5 corners']]) {
    const c = U.reelDeLaCarte({ market, pick }, amb, { statut: 'correct', noms });
    assert.deepEqual([c.cle, c.chiffre, c.raison, c.ecart], ['non-reglable', null, RAISONS_ECARTEES.rencontreAmbigue, null], market);
  }
});

test('T-E3 — pronosticsGeles : les lignes dans l’ordre des marchés, le compte, chaque état dit ; la structure ne disparaît jamais', () => {
  const v = U.pronosticsGeles(R.avec.corps.fiche, { noms: { home: 'Girona', away: 'Mallorca' } });
  assert.equal(v.lignes.length, 15);
  assert.equal(v.lignes[0].marketId, 'result');
  assert.equal(v.lignes.at(-1).marketId, 'teamShotsOnTarget');
  assert.deepEqual([v.compte.juste, v.compte.faux, v.compte.nonReglable], [12, 3, 0]);
  assert.equal(v.lignes.find((l) => l.marketId === 'totalCorners').chiffre, '11 corners (5 + 6)');
  assert.equal(v.lignes[0].version, 'moteur n° 5');
  assert.equal(v.lignes[0].pourcentage, '60 %');
  assert.equal(U.pronosticsGeles(null, { chargement: true }).etat, 'chargement');
  assert.equal(U.pronosticsGeles(null).etat, 'absente');
  assert.equal(U.pronosticsGeles(P.avec.corps.fiche).etat, 'panne');
  assert.equal(U.pronosticsGeles({ etat: 'regle', pronostics: [] }).message, U.MOTS_APRES_MATCH.aucun);
});

let rendu;
let Carte;
let Gelees;
let Panneau;
before(async () => {
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /nothing\.vue$/ });
  Carte = (await rendu.charger('/src/components/analysis/AiMarketCard.vue')).default;
  Gelees = (await rendu.charger('/src/components/analysis/PronosticsGelesCard.vue')).default;
  Panneau = (await rendu.charger('/src/components/analysis/MatchAiReviewPanel.vue')).default;
});
after(async () => {
  await rendu?.fermer();
});
const texte = (html) => espaces(html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, '’').replace(/\s+/g, ' '));

test('T-E4 — la carte d’un marché : vert « Juste » et sa coche avec le chiffre, rouge « Faux » et sa croix, gris « Non réglable » et sa raison ; l’ambre de l’écart ; rien sans la prop', options(), async () => {
  const view = { market: 'Total corners', pick: 'Plus de 5.5 corners', verdict: 'confirme', confidence: 'forte', reasoning: 'r' };
  const juste = await rendu.rendre(Carte, { view, statut: 'correct', reel: { cle: 'juste', libelle: 'Juste', icone: 'check', raison: null, chiffre: '11 corners (5 + 6)', ecart: null, titre: 't' } }, []);
  assert.deepEqual(juste.avertissements, []);
  assert.match(juste.html, /data-reel="juste"/);
  assert.match(texte(juste.html), /Juste 11 corners \(5 \+ 6\)/);
  const faux = await rendu.rendre(Carte, { view, statut: 'correct', reel: { cle: 'faux', libelle: 'Faux', icone: 'x', raison: null, chiffre: '4 corners (2 + 2)', ecart: 'écart dit', titre: 't' } }, []);
  assert.match(faux.html, /data-reel="faux"/);
  assert.match(faux.html, /class="aimc__ecart" data-ligne="ecart"/);
  const nr = await rendu.rendre(Carte, { view, reel: { cle: 'non-reglable', libelle: 'Non réglable', icone: 'minus', raison: RAISONS_ECARTEES.statNonRelevee, chiffre: null, ecart: null, titre: 't' } }, []);
  assert.match(texte(nr.html), new RegExp(`Non réglable ${RAISONS_ECARTEES.statNonRelevee.replace(/[()]/g, '.')}`));
  const sans = await rendu.rendre(Carte, { view }, []);
  assert.doesNotMatch(sans.html, /aimc__reel|aimc__ecart|data-reel/);
});

test('T-E5 — le panneau du bilan avec la fiche de la route : chaque carte de Girona - Mallorca porte son vert ou son rouge et son chiffre ; sans fiche, aucun', options(), async () => {
  const c = R.avec.corps;
  const match = { homeName: 'Girona', awayName: 'Mallorca', league: 'La Liga 2 - Spain', homeGoals: 0, awayGoals: 0, homeId: 'fotmob-7732', awayId: 'fotmob-8661' };
  const avec = await rendu.rendre(Panneau, { match, entry: c.entry, predictions: c.predictions, experience: c.experience, fiche: c.fiche }, []);
  assert.deepEqual(avec.avertissements, []);
  assert.equal([...avec.html.matchAll(/data-reel="juste"/g)].length, 12);
  assert.equal([...avec.html.matchAll(/data-reel="faux"/g)].length, 3);
  assert.match(texte(avec.html), /Juste 11 corners \(5 \+ 6\)/);
  assert.match(texte(avec.html), /Faux Score : 0-0/);
  assert.doesNotMatch(avec.html, /data-ligne="ecart"/, 'le bilan de l’IA et le magasin disent la même chose');
  assert.equal(avec.appels.length, 0);
  const sans = await rendu.rendre(Panneau, { match, entry: c.entry, predictions: c.predictions, experience: c.experience }, []);
  assert.doesNotMatch(sans.html, /data-reel=/);
});

test('T-E6 — la carte des pronostics gelés : le compte, une ligne par pronostic avec son liseré, son mot, son chiffre, la version ; la provenance ; aucun appel, aucun avertissement', options(), async () => {
  const r = await rendu.rendre(Gelees, { fiche: R.avec.corps.fiche, home: 'Girona', away: 'Mallorca', league: 'La Liga 2 - Spain', homeId: 'fotmob-7732', awayId: 'fotmob-8661' }, []);
  assert.deepEqual(r.avertissements, []);
  assert.equal(r.appels.length, 0);
  assert.match(r.html, /data-bloc="pronostics-geles" data-etat="regle"/);
  assert.equal([...r.html.matchAll(/class="pgc__ligne"/g)].length, 15);
  assert.equal([...r.html.matchAll(/data-issue="juste"/g)].length, 12);
  assert.equal([...r.html.matchAll(/data-issue="faux"/g)].length, 3);
  const t = texte(r.html);
  assert.match(t, /12 justes/);
  assert.match(t, /3 faux/);
  assert.match(t, /0 non réglable\b/);
  assert.match(t, /Total corners Plus de 5\.5 corners 60 % · moteur n° 5 · dernière valeur avant le coup d’envoi Juste 11 corners \(5 \+ 6\)/);
  assert.ok(t.includes(PROVENANCE_FICHE));
  // La fiche du match prolongé de T-B2, produite par ficheDuMatchJoue : corners et tirs en gris « Non réglable », avec la
  // raison du bilan dans .pgc__raison ; les buts réglés au score de la 90e minute (CE-1).
  const pr = await rendu.rendre(Gelees, { fiche: fiche(baseProlongee(), 'm2'), home: 'Aldora', away: 'Brevik', league: 'Ligue Fabriquée', homeId: H, awayId: A }, []);
  assert.deepEqual(pr.avertissements, []);
  assert.equal(pr.appels.length, 0);
  assert.equal([...pr.html.matchAll(/data-issue="non-reglable"/g)].length, 4);
  const raisons = [...pr.html.matchAll(/<span class="pgc__raison"[^>]*>([^<]*)<\/span>/g)].map((m) => espaces(m[1]));
  assert.deepEqual(raisons, Array(4).fill(espaces(RAISONS_ECARTEES.prolongationStats)));
  const tp = texte(pr.html);
  assert.match(tp, /Non réglable/);
  // 1-1 à la 90e : « Brevik moins de 1,5 » juste ; résultat, plus de 2,5 et « les deux ne marquent pas » faux.
  assert.match(tp, /1 juste 3 faux 4 non réglables/);
  assert.ok(tp.includes('Score à la 90e minute : 1-1 (match prolongé)'), 'le score de la 90e minute, jamais celui de la 120e');
});

test('T-E7 — la carte garde sa structure dans chaque état : chargement, absente, panne (ambre), à venir, tapis vert, buts cachés, erreur de l’onglet', options(), async () => {
  for (const [props, etat, motif] of [
    [{ fiche: null, chargement: true }, 'chargement', U.MOTS_APRES_MATCH.chargement],
    [{ fiche: null }, 'absente', U.MOTS_APRES_MATCH.absente],
    [{ fiche: P.avec.corps.fiche }, 'panne', 'panne simulée du module'],
    [{ fiche: { etat: 'a-venir', message: MOTS_FICHE_APRES_MATCH.aVenir, pronostics: [], provenance: PROVENANCE_FICHE } }, 'a-venir', MOTS_FICHE_APRES_MATCH.aVenir],
    [{ fiche: { etat: 'attribue', message: MOTS_FICHE_APRES_MATCH.attribue, pronostics: [], provenance: PROVENANCE_FICHE } }, 'attribue', MOTS_FICHE_APRES_MATCH.attribue],
    // La phrase du masque telle que la route la pose (T-R3) ; posée ici à la main : le bac ne porte pas le masque du lot 0.
    [{ fiche: { ...R.avec.corps.fiche, butsCaches: 'Pronostics de buts cachés depuis le 15/11 (essai de la carte).' } }, 'regle', 'Pronostics de buts cachés depuis le 15/11'],
    [{ fiche: null, erreur: 'Erreur réseau' }, 'erreur', 'Erreur réseau']
  ]) {
    const r = await rendu.rendre(Gelees, props, []);
    assert.deepEqual(r.avertissements, [], etat);
    assert.match(r.html, new RegExp(`data-etat="${etat}"`), etat);
    assert.ok(texte(r.html).includes(motif), `${etat} : ${motif}`);
    assert.ok(texte(r.html).includes(U.MOTS_APRES_MATCH.titreCarte), `${etat} : le titre reste`);
    assert.match(r.html, /class="pgc__provenance"/, `${etat} : la provenance reste`);
    if (etat === 'panne' || etat === 'erreur') assert.match(r.html, /<p class="(is-panne pgc__message|pgc__message is-panne)"/);
  }
});

test('T-E8 — câblage : la page d’un match joué passe matchKey au client, la fiche au panneau et à la carte neuve (onglet Analyse IA, après l’analyse)', () => {
  const page = lireUi('views', 'MatchDetailView.vue');
  assert.match(page, /import PronosticsGelesCard from '@\/components\/analysis\/PronosticsGelesCard\.vue';/);
  assert.match(page, /getForFixture\(\{ home: match\.homeName, away: match\.awayName, league: match\.league, date: match\.date, matchKey: match\.matchKey \?\? null \}\)/);
  assert.match(page, /fiche: r\.fiche \?\? null/);
  assert.match(page, /<MatchAiReviewPanel[\s\S]*?:lue-le="aiLueLe"\n {10}:fiche="ai\.fiche"\n {10}@run-post-match="runPostMatchAi"/);
  const i = page.indexOf('<PronosticsGelesCard');
  assert.ok(i > page.indexOf('<MatchAiReviewPanel') && i < page.indexOf('</template>\n  </div>\n</template>'));
  assert.equal(page.split('<PronosticsGelesCard').length, 2);
  const api = lireUi('services', 'matchAiAnalysisApi.js');
  assert.match(api, /if \(matchKey\) params\.set\('matchKey', matchKey\);/);
  const panneau = lireUi('components', 'analysis', 'MatchAiReviewPanel.vue');
  assert.match(panneau, /:reel="reelDe\(l\)"/);
  assert.match(panneau, /fiche: \{ type: Object, default: null \}/);
});

test('T-E9 — jamais de vert ni de rouge pour une value : les couleurs neuves ne suivent que le mot juste / faux ; « conseillé » reste neutre', () => {
  for (const f of [['components', 'analysis', 'PronosticsGelesCard.vue'], ['components', 'analysis', 'AiMarketCard.vue']]) {
    const src = lireUi(...f);
    const css = (src.match(/<style[^>]*>([\s\S]*?)<\/style>/) ?? ['', ''])[1];
    for (const regle of css.split('}').filter((r) => /--cm-(accent|danger)\b/.test(r))) {
      const selecteur = regle.split('{')[0];
      if (/aimc\.is-|aimc\[data-statut|aimc__statut|aimc__tenu|aimc__lecon|aimc__badge|aimc__opinion|confidence/.test(selecteur)) continue; // l'existant d'avant le lot
      assert.match(selecteur, /data-(reel|issue)='(juste|faux)'/, `${f.at(-1)} : ${selecteur.trim()}`);
    }
  }
  const gelees = lireUi('components', 'analysis', 'PronosticsGelesCard.vue');
  // Le gabarit (ce qui s'affiche) ne parle jamais de value ni de conseil ; `vue.value` (le computed) n'en est pas.
  const gabarit = gelees.split('<template>')[1].split('</template>')[0];
  assert.doesNotMatch(gabarit.replace(/\bvue\.value\b/g, ''), /\bvalue\b|conseill/i);
  assert.match(lireUi('components', 'analysis', 'AiMarketCard.vue'), /class="cm-chip is-info aimc__conseille"/);
});

test('T-E10 — hygiène des fichiers neufs et retouchés : des jetons seulement, pas de !important, polices ≥ 10 px, icônes connues, aucun code Unicode échappé, jamais toFixed', () => {
  // L'utilitaire neuf est une règle pure (aucun import) ; ficheDuPronostic.js n'est pas retouché par ce lot.
  assert.deepEqual([...reglesPures('apresLeMatch.js')], ['apresLeMatch.js']);
  assert.doesNotMatch(lireUi('utils', 'ficheDuPronostic.js'), /APRES_MATCH|reelDeLaCarte|pronosticsGeles/);
  const icones = lireUi('components', 'common', 'AppIcon.vue');
  for (const f of [['components', 'analysis', 'PronosticsGelesCard.vue'], ['components', 'analysis', 'AiMarketCard.vue'], ['components', 'analysis', 'MatchAiReviewPanel.vue'], ['utils', 'apresLeMatch.js'], ['views', 'MatchDetailView.vue']]) {
    const src = lireUi(...f);
    const nom = f.join('/');
    const css = (src.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${nom} : aucune couleur en dur`);
    assert.doesNotMatch(css, /\brgba?\(\s*\d/, `${nom} : pas de rgba en dur`);
    assert.doesNotMatch(src, /!important/, `${nom}`);
    for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 10, `${nom} : police ${m[1]}px`);
    assert.doesNotMatch(src, new RegExp(`${String.fromCharCode(92)}${String.fromCharCode(92)}u[0-9a-fA-F]{4}`), `${nom} : pas de code échappé`);
    assert.doesNotMatch(src, /toFixed\(/, nom);
    for (const m of src.matchAll(/<AppIcon[^>]*\bname="([a-zA-Z]+)"/g)) assert.match(icones, new RegExp(`\\b${m[1]}:`), `${nom} : icône ${m[1]}`);
  }
  for (const nom of ['check', 'x', 'minus']) assert.match(icones, new RegExp(`\\b${nom}:`));
  const mod = lire('src', 'data', 'fiche', 'ficheApresMatch.js');
  assert.doesNotMatch(mod, new RegExp(`${String.fromCharCode(92)}${String.fromCharCode(92)}u[0-9a-fA-F]{4}`));
});

function options() {
  return optionsDuRendu;
}
