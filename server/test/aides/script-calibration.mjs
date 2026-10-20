/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-calibration.mjs <serveur de la copie> <phase>
 *
 * Étape 20 — la calibration et le suivi mensuel. Base = la copie de la base d'essai (2 156 rencontres
 * jusqu'au 21/09/2026, dont ~440 en septembre avec leurs statistiques, trois prolongées), heure figée au
 * 05/10/2026 12 h UTC : le mois en cours est octobre, septembre est écoulé. PLANTÉS ici par SQL :
 *   - des pronostics gelés (engine_picks) sur chaque rencontre de septembre — Résultat, Total buts 2,5,
 *     Les 2 équipes marquent, Corners de l'équipe à domicile 3,5 —, probabilités tirées par un générateur à
 *     graine ; des révisions avant le coup d'envoi (la dernière diffère de la première), après le coup
 *     d'envoi (jamais retenues), une première valeur gelée après le coup d'envoi, un match sans heure ;
 *   - les pièges : club sans identifiant, rencontre introuvable, deux rencontres possibles, jour décalé
 *     d'un jour, match attribué, corners 0-0, match prolongé AVEC un but à la 105e (90e : 1-1, final 2-1) ;
 *   - octobre : des rencontres jouées les 01-04/10 (sans statistiques), un match d'aujourd'hui pas joué, un
 *     match à venir ;
 *   - des cotes gratuites archivées (ESPN : ouverture, relevé avant le gel, clôture) pour trois rencontres ;
 *   - le carnet des paris (runtime de la copie) : simples, un combiné, un pari d'octobre à venir.
 * Les valeurs ATTENDUES sont recalculées ici par un SECOND chemin (SQL et règles écrites à la main, sans
 * calibration.js ni dayTable.js ni settlementRules.js) ; le test les compare au calcul de l'appli.
 *
 * Phases :
 *   tout    plantation, lignes et bilans de septembre et d'octobre, l'étape de la passe (gel de septembre,
 *           second passage, réécriture refusée), la route (en cours, figé, refus) ; une ligne JSON
 *   ecran   plantation, gel de septembre, puis les réponses de la route pour l'écran : octobre en cours,
 *           septembre figé, août (aucun pronostic gelé)
 */

import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { Socket } from 'node:net';
import { pathToFileURL } from 'node:url';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const C = await imp('data/calibration.js');
const db = openDb();
const sortie = { phase };

/** mulberry32 : le même tirage à chaque passage. */
function mulberry(g) {
  let s = g >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const u = mulberry(20);
const tirer = (a, b) => Math.round((a + (b - a) * u()) * 10000) / 10000;
const jourPlus = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
const plusMinutes = (iso, n) => new Date(Date.parse(iso) + n * 60_000).toISOString();

// ------------------------------------------------------------ la plantation

const COLONNES = ['fixture_key', 'market_key', 'version', 'recorded_at', 'origin', 'match_id', 'league', 'date', 'kickoff', 'home_name', 'away_name', 'home_id', 'away_id', 'market_id', 'market', 'params', 'choice', 'label', 'probability', 'predicted_odds', 'engine_version'];
const inserer = db.prepare(`INSERT INTO engine_picks (${COLONNES.join(', ')}) VALUES (${COLONNES.map(() => '?').join(', ')})`);

/** Les quatre marchés plantés sur chaque rencontre : clé, identifiant, libellés, paramètres, choix, bornes de la probabilité. */
const MARCHES = (m) => [
  { marketKey: 'result', marketId: 'result', market: 'Résultat', label: `${m.homeName} gagne`, params: { outcome: 'home' }, choice: 'home', bornes: [0.3, 0.8] },
  { marketKey: 'totalGoals', marketId: 'totalGoals', market: 'Total buts', label: 'Plus de 2.5 buts', params: { line: 2.5, side: 'over' }, choice: 'over', bornes: [0.4, 0.75] },
  { marketKey: 'bothTeamsScore', marketId: 'bothTeamsScore', market: 'Les 2 équipes marquent', label: 'Oui', params: { outcome: 'yes' }, choice: 'yes', bornes: [0.45, 0.65] },
  { marketKey: 'teamCorners:home', marketId: 'teamCorners', market: `Corners — ${m.homeName}`, label: `${m.homeName} — Plus de 3.5 corners`, params: { line: 3.5, side: 'over', team: 'home' }, choice: 'over', bornes: [0.55, 0.85] }
];
const parametres = (p) => JSON.stringify(Object.fromEntries(Object.entries(p).sort(([a], [b]) => a.localeCompare(b))));

function planterUnPronostic({ fixtureKey, date, kickoff, m, marche, version, recordedAt, p, origin = 'nuit', engineVersion = null, homeId = m.homeId, awayId = m.awayId, choice = marche.choice }) {
  inserer.run(fixtureKey, marche.marketKey, version, recordedAt, origin, `cal-${m.matchKey}`, m.league, date, kickoff, m.homeName, m.awayName, homeId, awayId, marche.marketId, marche.market, parametres(marche.params), choice, marche.label, p, p ? Math.round((1 / p) * 100) / 100 : null, engineVersion);
}

/**
 * Les pièges et les révisions, par rang dans la liste des rencontres de septembre (hors prolongées) :
 * koDecale — le coup d'envoi gelé 3 h APRÈS le vrai (une révision entre les deux n'est pas « avant ») ;
 * voisin — la même affiche rejouée le lendemain (le jour exact l'emporte, jamais « ambigu ») ;
 * sansProba — un pronostic gelé sans probabilité.
 */
const PIEGES = { attribue: 5, corners00: 6, ambigu: 7, decale: 8, sansHeure: 9, sansHeureJourMeme: 10, prolongeeA105: 12, koDecale: 14, voisin: 15, sansProba: 17 };

async function planter() {
  const septembre = db
    .prepare(`SELECT match_key AS matchKey, date, league, home_name AS homeName, away_name AS awayName, home_id AS homeId, away_id AS awayId, json_extract(meta, '$.kickoff') AS kickoff,
                     json_extract(meta, '$.reason') AS reason
              FROM matches WHERE date >= '2026-09-01' AND date <= '2026-09-30' AND home_id IS NOT NULL AND away_id IS NOT NULL AND home_goals IS NOT NULL ORDER BY date, match_key`)
    .all()
    .map((r) => ({ ...r }));
  const ordinaires = septembre.filter((m) => !m.reason);
  const rang = (m) => ordinaires.indexOf(m);
  const plantes = { septembre: septembre.length, pieges: {}, revisions: { avant: [], apres: [], premiereApres: [] } };
  db.exec('BEGIN');
  try {
    // Les pièges du magasin.
    const att = ordinaires[PIEGES.attribue];
    db.prepare("UPDATE matches SET meta = json_set(meta, '$.awarded', 1) WHERE match_key = ?").run(att.matchKey);
    const c00 = ordinaires[PIEGES.corners00];
    db.prepare('UPDATE team_stats SET corner_kicks = 0 WHERE match_key = ?').run(c00.matchKey);
    const amb = ordinaires[PIEGES.ambigu];
    db.prepare(`INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, lineups, meta, shotmap, sources)
                SELECT match_key || '-bis', match_id || '-bis', date, league, home_name, away_name, home_id, away_id, NULL, home_goals, away_goals, updated_at, events, lineups, meta, shotmap, sources FROM matches WHERE match_key = ?`).run(amb.matchKey);
    const sh = ordinaires[PIEGES.sansHeure];
    const shj = ordinaires[PIEGES.sansHeureJourMeme];
    db.prepare("UPDATE matches SET meta = json_remove(meta, '$.kickoff') WHERE match_key IN (?, ?)").run(sh.matchKey, shj.matchKey);
    const p105 = ordinaires[PIEGES.prolongeeA105];
    const deroule = [
      { type: 'goal', minute: 30, side: 'home', player: 'Essai A' },
      { type: 'goal', minute: 60, side: 'away', player: 'Essai B' },
      { type: 'goal', minute: 105, side: 'home', player: 'Essai C' }
    ];
    db.prepare("UPDATE matches SET home_goals = 2, away_goals = 1, events = ?, meta = json_set(meta, '$.reason', 'afterextra') WHERE match_key = ?").run(JSON.stringify(deroule), p105.matchKey);
    const vois = ordinaires[PIEGES.voisin];
    db.prepare(`INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, events, lineups, meta, shotmap, sources)
                SELECT match_key || '-lendemain', match_id || '-lendemain', date(date, '+1 day'), league, home_name, away_name, home_id, away_id, NULL, 4, 4, updated_at, NULL, NULL, meta, NULL, sources FROM matches WHERE match_key = ?`).run(vois.matchKey);
    plantes.pieges = Object.fromEntries(Object.entries(PIEGES).map(([k, i]) => [k, ordinaires[i].matchKey]));
    // Les clés des matchs piégés, telles que gelées (le jour décalé d'un jour pour « decale »).
    plantes.cles = Object.fromEntries(Object.entries(PIEGES).map(([k, i]) => [k, `fotmob:${ordinaires[i].homeId}|${ordinaires[i].awayId}|${k === 'decale' ? jourPlus(ordinaires[i].date, 1) : ordinaires[i].date}`]));

    // Les pronostics de septembre.
    for (const m of septembre) {
      const r = rang(m);
      const date = r === PIEGES.decale ? jourPlus(m.date, 1) : m.date;
      const fixtureKey = `fotmob:${m.homeId}|${m.awayId}|${date}`;
      const koMagasin = [PIEGES.sansHeure, PIEGES.sansHeureJourMeme].includes(r) ? null : m.kickoff;
      // Le coup d'envoi gelé : une rencontre sur deux (l'autre : celui du magasin fait foi) ; 3 h trop tard pour koDecale.
      const kickoff = r === PIEGES.koDecale ? plusMinutes(koMagasin, 180) : r % 2 === 0 ? koMagasin : null;
      const engineVersion = r % 3 === 0 ? 1 : null;
      for (const marche of MARCHES(m)) {
        const tire = tirer(...marche.bornes);
        const p1 = r === PIEGES.sansProba && marche.marketId === 'totalGoals' ? null : tire;
        if (r === PIEGES.koDecale) {
          // Une révision UNE heure après le vrai coup d'envoi (avant celui, faux, du gel) : jamais retenue.
          planterUnPronostic({ fixtureKey, date, kickoff, m, marche, version: 2, recordedAt: plusMinutes(koMagasin, 60), p: 0.98, engineVersion: 1 });
        }
        const veille = `${jourPlus(m.date, -1)}T05:00:00.000Z`;
        const premiereApres = r >= 0 && r % 13 === 3 && koMagasin;
        const v1 = premiereApres ? plusMinutes(koMagasin, 5) : r === PIEGES.sansHeureJourMeme ? `${m.date}T08:00:00.000Z` : veille;
        planterUnPronostic({ fixtureKey, date, kickoff, m, marche, version: 1, recordedAt: v1, p: p1, engineVersion });
        if (premiereApres) {
          plantes.revisions.premiereApres.push(`${fixtureKey}|${marche.marketKey}`);
          continue;
        }
        if (r >= 0 && r % 7 === 1 && koMagasin) {
          // Une révision avant le coup d'envoi : plus prudente, et pour le Résultat, un autre choix (le nul).
          const choice = marche.marketId === 'result' ? 'draw' : marche.choice;
          planterUnPronostic({ fixtureKey, date, kickoff, m, marche: { ...marche, params: marche.marketId === 'result' ? { outcome: 'draw' } : marche.params, label: marche.marketId === 'result' ? 'Match nul' : marche.label }, version: 2, recordedAt: plusMinutes(koMagasin, -60), p: Math.max(0.05, Math.round((p1 - 0.1) * 10000) / 10000), origin: 'analyse-coup-d-envoi', engineVersion: 1, choice });
          plantes.revisions.avant.push(`${fixtureKey}|${marche.marketKey}`);
        } else if (r >= 0 && r % 11 === 2 && koMagasin) {
          planterUnPronostic({ fixtureKey, date, kickoff, m, marche, version: 2, recordedAt: plusMinutes(koMagasin, 10), p: 0.99, engineVersion: 1 });
          plantes.revisions.apres.push(`${fixtureKey}|${marche.marketKey}`);
        } else if (r === PIEGES.sansHeure) {
          // Sans heure connue : une révision le jour même ne compte pas (seules celles d'avant le jour du match).
          planterUnPronostic({ fixtureKey, date, kickoff: null, m, marche, version: 2, recordedAt: `${m.date}T10:00:00.000Z`, p: 0.97, engineVersion: 1 });
        }
      }
    }
    // Club sans identifiant, rencontre introuvable.
    const exemple = ordinaires[20];
    for (const [fixtureKey, homeId, awayId] of [
      ['nom:epl|club-essai-a|club-essai-b|2026-09-10', null, null],
      ['fotmob:fotmob-999001|fotmob-999002|2026-09-10', 'fotmob-999001', 'fotmob-999002']
    ]) {
      for (const marche of MARCHES(exemple)) planterUnPronostic({ fixtureKey, date: '2026-09-10', kickoff: '2026-09-10T18:00:00.000Z', m: { ...exemple, homeName: 'Club essai A', awayName: 'Club essai B' }, marche, version: 1, recordedAt: '2026-09-09T05:00:00.000Z', p: 0.6, homeId, awayId });
    }

    // Octobre : 12 rencontres jouées du 01 au 04 et une jouée ce matin (clubs de septembre, sens inversé, sans
    // statistiques), un match d'aujourd'hui sans score, un match à venir.
    const octobre = [];
    for (let i = 0; i < 13; i++) {
      const s = ordinaires[40 + i];
      const date = i === 12 ? '2026-10-05' : `2026-10-0${1 + (i % 4)}`;
      const m = { matchKey: `${date}-essai-${i}`, date, league: s.league, homeName: s.awayName, awayName: s.homeName, homeId: s.awayId, awayId: s.homeId, kickoff: `${date}T${i === 12 ? '09' : '18'}:00:00.000Z` };
      const hg = Math.floor(u() * 4);
      const ag = Math.floor(u() * 3);
      db.prepare(`INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, home_goals, away_goals, updated_at, meta)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(m.matchKey, m.matchKey, date, m.league, m.homeName, m.awayName, m.homeId, m.awayId, hg, ag, '2026-10-05T00:00:00.000Z', JSON.stringify({ kickoff: m.kickoff }));
      octobre.push({ ...m, hg, ag });
    }
    const aujourdhui = { ...ordinaires[60], date: '2026-10-05', kickoff: '2026-10-05T18:00:00.000Z' };
    const avenir = { ...ordinaires[61], date: '2026-10-12', kickoff: '2026-10-12T18:00:00.000Z' };
    for (const m of [...octobre, aujourdhui, avenir]) {
      const fixtureKey = `fotmob:${m.homeId}|${m.awayId}|${m.date}`;
      for (const marche of MARCHES(m)) planterUnPronostic({ fixtureKey, date: m.date, kickoff: m.kickoff ?? `${m.date}T18:00:00.000Z`, m, marche, version: 1, recordedAt: `${jourPlus(m.date, -1)}T05:00:00.000Z`, p: tirer(...marche.bornes) });
    }
    plantes.octobre = { joues: octobre.map((m) => m.matchKey), aujourdhui: `fotmob:${aujourdhui.homeId}|${aujourdhui.awayId}|2026-10-05`, avenir: `fotmob:${avenir.homeId}|${avenir.awayId}|2026-10-12` };

    // Cotes gratuites archivées (ESPN) : trois rencontres ordinaires de septembre, 1N2, plus/moins 2,5 et les deux marquent.
    plantes.cotes = [];
    for (const i of [30, 31, 32]) {
      const m = ordinaires[i];
      const ko = m.kickoff;
      const veille = `${jourPlus(m.date, -1)}T05:00:00.000Z`;
      const id = Number(db.prepare(`INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at)
                                    VALUES ('espn', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'essai', ?)`).run(`essai-${i}`, m.league, m.date, ko, m.homeName, m.awayName, m.homeId, m.awayId, m.matchKey, ko).lastInsertRowid);
      const prix = {
        '1x2': {
          open: { home: 2.2 + i / 100, draw: 3.3, away: 3.3 },
          snapshot: { home: 2.1 + i / 100, draw: 3.3, away: 3.4 },
          close: { home: 1.95 + i / 100, draw: 3.4, away: 3.6 }
        },
        ou: { open: { over: 1.9, under: 1.9 }, snapshot: { over: 1.85, under: 1.95 }, close: { over: 2.05, under: 1.78 } },
        btts: { open: { yes: 1.8, no: 2.0 }, snapshot: { yes: 1.75, no: 2.05 }, close: { yes: 1.7, no: 2.12 } }
      };
      const quand = { open: plusMinutes(veille, -24 * 60), snapshot: plusMinutes(veille, -60), close: plusMinutes(ko, -5) };
      const q = db.prepare(`INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price) VALUES (?, 'DraftKings', ?, ?, ?, ?, ?, ?, ?)`);
      for (const [market, phases] of Object.entries(prix)) {
        const line = market === 'ou' ? 2.5 : 0;
        for (const [kind, sel] of Object.entries(phases)) for (const [selection, price] of Object.entries(sel)) q.run(id, market, selection, line, kind, kind === 'snapshot' ? quand.snapshot : '', quand[kind], price);
      }
      plantes.cotes.push({ fixtureKey: `fotmob:${m.homeId}|${m.awayId}|${m.date}`, matchKey: m.matchKey, homeName: m.homeName, awayName: m.awayName, league: m.league, date: m.date, prix, quand });
    }
    // Le troisième match coté a été gelé sous d'autres noms que ceux du magasin : ses identifiants FotMob (ceux du
    // gel) suffisent pour retrouver ses cotes — jamais une seconde lecture de l'annuaire par les noms.
    db.prepare("UPDATE engine_picks SET home_name = 'Club renommé A', away_name = 'Club renommé B' WHERE fixture_key = ?").run(plantes.cotes[2].fixtureKey);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  // Le carnet des paris de la copie : deux simples sur des rencontres cotées, un simple sans cote archivée, un
  // combiné, un simple d'octobre à venir, un simple d'août.
  const [c0, c1, c2] = plantes.cotes;
  const sansCote = ordinaires[33];
  const autre = ordinaires[34];
  const aout = db.prepare("SELECT home_name AS homeName, away_name AS awayName, league, json_extract(meta, '$.kickoff') AS kickoff FROM matches WHERE date = '2026-08-29' AND home_id IS NOT NULL ORDER BY match_key LIMIT 1").get();
  const jambe = (m, ko, marketId, params, odds, pick) => ({ matchId: `essai-${m.homeName}`, homeName: m.homeName, awayName: m.awayName, league: m.league, commenceTime: ko, market: marketId === 'result' ? '1N2' : 'Total buts', pick, odds, status: 'pending', marketId, params });
  const paris = [
    { id: 'pari-a', createdAt: `${jourPlus(c0.date, -1)}T06:00:00.000Z`, status: 'won', stake: 10, odds: 2.3, legs: [jambe(c0, db.prepare("SELECT json_extract(meta, '$.kickoff') AS k FROM matches WHERE match_key = ?").get(c0.matchKey).k, 'result', { outcome: 'home' }, 2.3, `${c0.homeName} gagne`)] },
    { id: 'pari-b', createdAt: `${jourPlus(c1.date, -1)}T06:00:00.000Z`, status: 'lost', stake: 10, odds: 1.95, legs: [jambe(c1, db.prepare("SELECT json_extract(meta, '$.kickoff') AS k FROM matches WHERE match_key = ?").get(c1.matchKey).k, 'totalGoals', { line: 2.5, side: 'over' }, 1.95, 'Plus de 2.5 buts')] },
    { id: 'pari-c', createdAt: `${jourPlus(sansCote.date, -1)}T06:00:00.000Z`, status: 'lost', stake: 5, odds: 2.05, legs: [jambe(sansCote, sansCote.kickoff, 'result', { outcome: 'home' }, 2.05, `${sansCote.homeName} gagne`)] },
    {
      id: 'pari-d',
      createdAt: `${jourPlus(c2.date, -1)}T06:00:00.000Z`,
      status: 'lost',
      stake: 5,
      odds: 4.1,
      legs: [jambe(c2, db.prepare("SELECT json_extract(meta, '$.kickoff') AS k FROM matches WHERE match_key = ?").get(c2.matchKey).k, 'result', { outcome: 'home' }, 2.0, `${c2.homeName} gagne`), jambe(autre, autre.kickoff, 'result', { outcome: 'home' }, 2.05, `${autre.homeName} gagne`)]
    },
    { id: 'pari-e', createdAt: '2026-10-04T09:00:00.000Z', status: 'pending', stake: 10, odds: 1.8, legs: [jambe(ordinaires[61], '2026-10-12T18:00:00.000Z', 'result', { outcome: 'home' }, 1.8, `${ordinaires[61].homeName} gagne`)] },
    { id: 'pari-f', createdAt: '2026-08-28T09:00:00.000Z', status: 'won', stake: 10, odds: 1.7, legs: [jambe(aout, aout.kickoff, 'result', { outcome: 'home' }, 1.7, `${aout.homeName} gagne`)] }
  ];
  const { writeJsonAtomic } = await imp('utils/atomicJson.js');
  const { fichierDesParis } = await imp('data/repositories/betsRepository.js');
  writeJsonAtomic(fichierDesParis(), paris);
  plantes.paris = paris.map((b) => ({ id: b.id, odds: b.odds, legs: b.legs.length, date: (b.legs[0].commenceTime ?? '').slice(0, 10) }));
  return plantes;
}

// ------------------------------------------------------------ le second chemin (l'oracle)

/**
 * Ce que DOIT donner chaque pronostic gelé d'un mois, recalculé sans le code de l'appli : la révision retenue
 * (règle écrite à la main), le règlement (SQL et règles du banc réécrites), l'issue (comparaison directe).
 */
function attendus(mois, aujourdhui = '2026-10-05') {
  const [du, au] = [`${mois}-01`, `${mois}-${mois === '2026-09' ? '30' : '31'}`];
  const picks = db.prepare('SELECT * FROM engine_picks WHERE date >= ? AND date <= ?').all(du, au);
  const parCle = new Map();
  for (const p of picks) {
    const cle = `${p.fixture_key}|${p.market_key}`;
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(p);
  }
  const out = { premiere: { lignes: {}, ecartees: {} }, derniere: { lignes: {}, ecartees: {} }, aVenir: 0, geles: parCle.size };
  const ajouter = (o, k) => (o[k] = (o[k] ?? 0) + 1);
  for (const [cle, revs] of parCle) {
    const r0 = revs[0];
    const [, ids, date] = /^(?:fotmob|nom):(.*)\|(\d{4}-\d{2}-\d{2})$/.exec(r0.fixture_key);
    // La rencontre : mêmes identifiants, jour exact sinon ± 1 jour, une seule.
    let rencontre = null;
    let raison = null;
    if (date > aujourdhui) raison = 'aVenir';
    else if (!r0.home_id || !r0.away_id || r0.fixture_key.startsWith('nom:')) raison = 'sansIdentifiant';
    else {
      const proches = db.prepare('SELECT * FROM matches WHERE home_id = ? AND away_id = ?').all(r0.home_id, r0.away_id).filter((m) => Math.abs(Date.parse(m.date) - Date.parse(date)) <= 86_400_000);
      const exactes = proches.filter((m) => m.date === date);
      const retenues = exactes.length ? exactes : proches;
      if (!retenues.length) raison = date === aujourdhui ? 'aVenir' : 'sansResultat';
      else if (retenues.length > 1) raison = 'rencontreAmbigue';
      else rencontre = retenues[0];
    }
    if (raison === 'aVenir') {
      out.aVenir++;
      continue;
    }
    const meta = rencontre ? JSON.parse(rencontre.meta ?? '{}') : {};
    const ko = rencontre ? (meta.kickoff ?? revs.find((r) => r.kickoff)?.kickoff ?? null) : (revs.find((r) => r.kickoff)?.kickoff ?? null);
    const limite = Date.parse(ko ?? `${date}T00:00:00.000Z`);
    const avant = revs.filter((r) => Date.parse(r.recorded_at) < limite).sort((a, b) => a.version - b.version);
    const v1 = revs.find((r) => r.version === 1);
    const choix = { premiere: v1 && Date.parse(v1.recorded_at) < limite ? v1 : null, derniere: avant.at(-1) ?? null };
    const raisonRevision = ko ? 'apresCoupDEnvoi' : 'heureInconnue';
    for (const vue of ['premiere', 'derniere']) {
      const pick = choix[vue];
      if (!pick) {
        ajouter(out[vue].ecartees, raisonRevision);
        continue;
      }
      if (raison) {
        ajouter(out[vue].ecartees, raison);
        continue;
      }
      if (!(typeof pick.probability === 'number' && pick.probability >= 0 && pick.probability <= 1)) {
        ajouter(out[vue].ecartees, 'sansProbabilite');
        continue;
      }
      // Le règlement, réécrit : attribué, prolongation (buts à la 90e d'après le déroulé), statistiques.
      const attribue = meta.awarded === 1 || meta.awarded === true || meta.reason === 'awarded_win' || meta.reason === 'id_reused';
      const prolonge = meta.reason === 'afterextra' || meta.reason === 'afterpenalties';
      if (attribue) {
        ajouter(out[vue].ecartees, 'attribue');
        continue;
      }
      const stat = pick.market_id === 'teamCorners';
      let h = rencontre.home_goals;
      let a = rencontre.away_goals;
      if (stat) {
        if (prolonge) {
          ajouter(out[vue].ecartees, 'prolongationStats');
          continue;
        }
        const ts = db.prepare("SELECT corner_kicks AS c FROM team_stats WHERE match_key = ? AND side = 'home'").get(rencontre.match_key);
        const te = db.prepare("SELECT corner_kicks AS c FROM team_stats WHERE match_key = ? AND side = 'away'").get(rencontre.match_key);
        if (!ts || !te || ts.c === null || te.c === null || (ts.c === 0 && te.c === 0)) {
          ajouter(out[vue].ecartees, 'statNonRelevee');
          continue;
        }
        const params = JSON.parse(pick.params);
        const issue = ts.c > params.line ? 'over' : 'under';
        out[vue].lignes[cle] = { p: pick.probability, issue, realise: issue === pick.choice, version: pick.version, marketId: pick.market_id, league: pick.league, fixtureKey: pick.fixture_key };
        continue;
      }
      if (prolonge) {
        let ev = [];
        try {
          ev = JSON.parse(rencontre.events ?? '[]') ?? [];
        } catch {
          ev = [];
        }
        const buts = (Array.isArray(ev) ? ev : []).filter((e) => e.type === 'goal');
        if (buts.length !== h + a || buts.some((b) => !Number.isFinite(Number(b.minute)) || !['home', 'away'].includes(b.side))) {
          ajouter(out[vue].ecartees, 'prolongationSansScore90');
          continue;
        }
        h = buts.filter((b) => b.side === 'home' && Number(b.minute) <= 90).length;
        a = buts.filter((b) => b.side === 'away' && Number(b.minute) <= 90).length;
      }
      const issue =
        pick.market_id === 'result' ? (h > a ? 'home' : h < a ? 'away' : 'draw')
        : pick.market_id === 'totalGoals' ? (h + a > 2.5 ? 'over' : 'under')
        : pick.market_id === 'bothTeamsScore' ? (h > 0 && a > 0 ? 'yes' : 'no')
        : null;
      out[vue].lignes[cle] = { p: pick.probability, issue, realise: issue === pick.choice, version: pick.version, marketId: pick.market_id, league: pick.league, fixtureKey: pick.fixture_key };
    }
  }
  return out;
}

/** Les lignes de l'appli, sous la même forme que l'oracle. */
function lignesDeLAppli(mois) {
  const { executerSansPause } = utils;
  const L = executerSansPause(C.lignesDuMois(mois, { database: db }));
  const forme = (v) => ({
    lignes: Object.fromEntries(v.lignes.map((l) => [l.cle, { p: l.p, issue: l.issue, realise: l.realise, version: l.version, marketId: l.marketId, league: l.league, fixtureKey: l.fixtureKey }])),
    ecartees: v.ecartees,
    choisis: v.choisis.length
  });
  return { premiere: forme(L.vues.premiere), derniere: forme(L.vues.derniere), aVenir: L.aVenir, geles: L.geles, revisions: L.revisions };
}

// ------------------------------------------------------------ requêtes Express sans réseau

async function requete(app, methode, url) {
  return new Promise((resolve, reject) => {
    const req = new http.IncomingMessage(new Socket());
    req.method = methode;
    req.url = url;
    req.headers = { host: 'essai' };
    const res = new http.ServerResponse(req);
    const morceaux = [];
    res.write = (c) => {
      morceaux.push(Buffer.from(c));
      return true;
    };
    res.end = (c) => {
      if (c) morceaux.push(Buffer.from(c));
      let rendu = null;
      try {
        rendu = JSON.parse(Buffer.concat(morceaux).toString('utf8'));
      } catch {
        // laissé à null
      }
      resolve({ code: res.statusCode, corps: rendu });
      return res;
    };
    app.handle(req, res, reject);
  });
}

const utils = await imp('utils/travailCooperatif.js');
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const ligneFigee = (mois) => db.prepare('SELECT mois, version, fige_le AS figeLe, du, au, pronostics, paris, resume, bilan FROM calibration_monthly WHERE mois = ?').get(mois) ?? null;

// ------------------------------------------------------------ les phases

if (phase === 'tout') {
  sortie.plantes = await planter();
  sortie.attendus = { septembre: attendus('2026-09'), octobre: attendus('2026-10') };
  sortie.appli = { septembre: lignesDeLAppli('2026-09'), octobre: lignesDeLAppli('2026-10') };
  const bilanSept = C.calculerBilan('2026-09', { database: db });
  const bilanOct = C.calculerBilan('2026-10', { database: db });
  sortie.bilans = { septembre: bilanSept, octobre: bilanOct };
  // Deux calculs du même mois : au bit près (graine du juge, ordre des lignes).
  sortie.rejeuIdentique = JSON.stringify({ ...C.calculerBilan('2026-09', { database: db }), calculeLe: null, dureeMs: null }) === JSON.stringify({ ...bilanSept, calculeLe: null, dureeMs: null });

  // L'étape de la passe : due, gel de septembre, puis plus rien à faire ; octobre jamais figé.
  const job = await imp('jobs/matchStatsAutoRefresh.js');
  sortie.etape = { dueAvant: job.__testing.dueCalibrationMensuelle(), aFigerAvant: C.moisAFiger({ database: db }) };
  sortie.etape.premiere = await job.__testing.passeCalibrationMensuelle({});
  sortie.etape.dueApres = job.__testing.dueCalibrationMensuelle();
  sortie.etape.seconde = await C.figerLesMoisEcoules({ database: db });
  const figee = ligneFigee('2026-09');
  sortie.figee = { ...figee, bilan: JSON.parse(figee.bilan), resume: JSON.parse(figee.resume), sha1: sha1(figee.bilan) };
  sortie.octobreFige = ligneFigee('2026-10');

  // Jamais réécrit : un pronostic de plus en septembre, un score changé — le bilan figé ne bouge pas ;
  // figerLeMois rend « pas écrit » et le bilan de la base ; un UPDATE est refusé par la base.
  const s = sortie.plantes;
  db.prepare("UPDATE matches SET home_goals = home_goals + 3 WHERE match_key = ?").run(db.prepare("SELECT match_key FROM matches WHERE date = '2026-09-20' AND home_id IS NOT NULL ORDER BY match_key LIMIT 1").get().match_key);
  inserer.run('fotmob:fotmob-888001|fotmob-888002|2026-09-12', 'result', 1, '2026-09-11T05:00:00.000Z', 'nuit', 'cal-x', 'EPL', '2026-09-12', null, 'X', 'Y', 'fotmob-888001', 'fotmob-888002', 'result', 'Résultat', '{"outcome":"home"}', 'home', 'X gagne', 0.5, 2, null);
  const recalcul = C.calculerBilan('2026-09', { database: db });
  const reFige = C.figerLeMois(recalcul, { database: db });
  sortie.jamaisReecrit = {
    recalculDiffere: recalcul.pronostics.geles !== sortie.figee.bilan.pronostics.geles,
    ecrit: reFige.ecrit,
    bilanRendu: reFige.bilan.pronostics.geles,
    sha1Apres: sha1(ligneFigee('2026-09').bilan),
    figeLeApres: ligneFigee('2026-09').figeLe
  };
  try {
    db.prepare('UPDATE calibration_monthly SET bilan = ? WHERE mois = ?').run('{}', '2026-09');
    sortie.jamaisReecrit.update = 'accepté';
  } catch (error) {
    sortie.jamaisReecrit.update = error.message;
  }
  try {
    C.figerLeMois(bilanOct, { database: db });
    sortie.jamaisReecrit.octobre = 'figé';
  } catch (error) {
    sortie.jamaisReecrit.octobre = `${error.constructor.name} : ${error.message}`;
  }
  sortie.jamaisReecrit.sha1Final = sha1(ligneFigee('2026-09').bilan);

  // La route.
  const { createApp } = await imp('app.js');
  const app = createApp();
  const defaut = await requete(app, 'GET', '/api/predictions/calibration');
  const sept = await requete(app, 'GET', '/api/predictions/calibration?mois=2026-09');
  sortie.route = {
    defaut: { code: defaut.code, mois: defaut.corps?.mois, moisEnCours: defaut.corps?.moisEnCours, fige: defaut.corps?.bilan?.fige, enCours: defaut.corps?.bilan?.enCours, figes: defaut.corps?.figes, disponibles: defaut.corps?.disponibles, prochainGel: defaut.corps?.prochainGel, aFiger: defaut.corps?.aFiger, juge: defaut.corps?.juge, provenance: defaut.corps?.provenance, geles: defaut.corps?.bilan?.pronostics?.geles },
    septembre: { code: sept.code, egalALaBase: JSON.stringify(sept.corps?.bilan) === ligneFigee('2026-09').bilan, geles: sept.corps?.bilan?.pronostics?.geles },
    illisible: await requete(app, 'GET', '/api/predictions/calibration?mois=2026-13'),
    aVenir: await requete(app, 'GET', '/api/predictions/calibration?mois=2026-12'),
    double: await requete(app, 'GET', '/api/predictions/calibration?mois=2026-09&mois=2026-10')
  };
}

if (phase === 'ecran') {
  await planter();
  await C.figerLesMoisEcoules({ database: db });
  const { createApp } = await imp('app.js');
  const app = createApp();
  // Étape 24 : la route ne calcule plus le mois en cours. Avant la préparation de la nuit, elle dit « pas encore
  // mesuré » (bilan nul, la raison dans `preparation`) ; l'étape de la nuit (ici sa préparation) l'écrit, la route le lit.
  const avantLaNuit = (await requete(app, 'GET', '/api/predictions/calibration')).corps;
  await C.preparerLeMoisEnCours({ database: db });
  sortie.reponses = {
    avantLaNuit,
    enCours: (await requete(app, 'GET', '/api/predictions/calibration')).corps,
    fige: (await requete(app, 'GET', '/api/predictions/calibration?mois=2026-09')).corps,
    vide: (await requete(app, 'GET', '/api/predictions/calibration?mois=2026-08')).corps
  };
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
