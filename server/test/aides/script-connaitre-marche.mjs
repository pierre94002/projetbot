/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-connaitre-marche.mjs <serveur de la copie> <phase>
 *
 * Étape 22 — connaître le marché. Base = la copie de la base d'essai (elle n'a ni cotes archivées, ni
 * football-data, ni table du jour J) ; heure figée au 05/10/2026 12 h UTC. PLANTÉS ici par SQL :
 *   - 400 rencontres du magasin (« Ligue Essai », 2024-2025 et 2026, résultats à la 90e minute dans
 *     day_matches + team_day ; une prolongée, une attribuée) ;
 *   - leurs cotes archivées : ESPN DraftKings (ouverture, clôture), la bourse Betfair de football-data
 *     (relevé, clôture), Kalshi (probabilités du milieu du carnet), un relevé payant (The Odds API) ;
 *   - 300 lignes football-data (fd_history, « E0 » 2019-20) : moyenne, Pinnacle, Bet365, William Hill.
 * Les probabilités tirées par le générateur à graine de guard.js : le même tirage à chaque passage.
 *
 * Phase « nuit » (une ligne JSON) : avant tout calcul (lectures nulles), le premier calcul par l'étape de
 * la passe (processus à part, comme chez Pierre), la nuit suivante sans rien de neuf (« rien »), une cote
 * de plus (recalcul, les lignes de l'ancien calcul retirées), un calcul en échec (rien d'écrit, le
 * précédent reste lu), puis les lectures des étapes 23 et 31 sur une connexion EN LECTURE SEULE.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const [serveur, phase] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);
const BASE = process.env.MATCH_STATS_DB;

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(BASE).toLowerCase()) throw new Error('Base inattendue');
const K = await imp('data/marketKnowledge.js');
const job = await imp('jobs/matchStatsAutoRefresh.js');
const { generateur } = await imp('bench/guard.js');
const db = openDb();
const sortie = { phase };

const u = generateur(22);
const norm = (p) => {
  const s = p[0] + p[1] + p[2];
  return p.map((x) => x / s);
};
/** Des cotes dont la méthode puissance rend EXACTEMENT p (exposant k > 1). */
const cotesDe = (p, k = 1.12) => p.map((x) => Math.round((1 / x ** (1 / k)) * 1000) / 1000);
const tirer = () => {
  const h = 0.25 + 0.4 * u();
  const d = 0.22 + 0.08 * u();
  return norm([h, d, Math.max(0.08, 1 - h - d)]);
};
const issueDe = (p) => {
  const x = u();
  return x < p[0] ? 0 : x < p[0] + p[1] ? 1 : 2;
};
const SCORES = [[2, 0], [1, 1], [0, 1]];
const jour = (base, n) => new Date(Date.parse(`${base}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function planter() {
  db.exec('BEGIN');
  // Le magasin : day_matches + team_day (camp 1 = domicile), 20 clubs.
  const dm = db.prepare('INSERT INTO day_matches (match_key, fotmob_id, date, league, saison, home, away, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const colonnesTd = ['rencontre', 'camp', 'club', 'adversaire', 'date', 'league', 'saison', 'attribue', 'prolongation', 'compte', 'coupe', 'releve', 'bp', 'bc', 'bp90', 'bc90'];
  const td = db.prepare(`INSERT INTO team_day (${colonnesTd.join(', ')}) VALUES (${colonnesTd.map(() => '?').join(', ')})`);
  const ev = db.prepare('INSERT INTO odds_events (source, source_event, league, date, kickoff, home_name, away_name, home_id, away_id, match_key, provenance, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id');
  const q = db.prepare('INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price, prob, volume, open_interest) VALUES (?, ?, \'1x2\', ?, 0, ?, ?, ?, ?, ?, NULL, NULL)');
  const SEL = ['home', 'draw', 'away'];
  const coter = (id, bookmaker, kind, prix, probs = null, seq = '', releve = '2026-10-05T10:00:00.000Z') => SEL.forEach((s, i) => q.run(id, bookmaker, s, kind, seq, releve, prix[i], probs ? probs[i] : null));
  for (let i = 0; i < 400; i++) {
    const saison = i < 200 ? 2024 : 2025;
    const date = i < 200 ? jour('2024-08-10', Math.floor(i / 2)) : jour('2025-08-10', Math.floor((i - 200) / 2));
    const mk = `essai-${i}`;
    const home = 1 + (i % 20);
    const away = 1 + ((i + 7) % 20);
    const p = tirer();
    const prolongee = i === 5;
    const attribuee = i === 6;
    // La rencontre prolongée : 1-1 à la 90e, 2-1 après prolongation (le 1N2 se règle sur le nul).
    const issue = prolongee ? 1 : issueDe(p);
    const [bp, bc] = SCORES[issue];
    const r = Number(dm.run(mk, null, date, 'Ligue Essai', saison, home, away === home ? (home % 20) + 1 : away, '2026-10-01T00:00:00.000Z').lastInsertRowid);
    td.run(r, 1, home, away, date, 'Ligue Essai', saison, attribuee ? 1 : 0, prolongee ? 1 : 0, 1, 0, 1, prolongee ? bp + 1 : bp, bc, prolongee ? bp : null, prolongee ? bc : null);
    td.run(r, 0, away, home, date, 'Ligue Essai', saison, attribuee ? 1 : 0, prolongee ? 1 : 0, 1, 0, 1, bc, prolongee ? bp + 1 : bp, prolongee ? bc : null, prolongee ? bp : null);
    const kickoff = `${date}T18:00:00.000Z`;
    const ouverture = norm(p.map((x) => x + (u() - 0.5) * 0.06));
    const e1 = ev.get('espn', `espn-${i}`, 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
    coter(e1, 'DraftKings', 'open', cotesDe(ouverture, 1.16));
    coter(e1, 'DraftKings', 'close', cotesDe(p, 1.1));
    const e2 = ev.get('football-data.co.uk', `fd-${i}`, 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
    coter(e2, 'Betfair Exchange', 'preclose', ouverture.map((x) => Math.round((1 / x) * 100) / 100));
    coter(e2, 'Betfair Exchange', 'close', p.map((x) => Math.round((0.99 / x) * 100) / 100));
    coter(e2, 'Maximum du marché', 'close', p.map((x) => Math.round((1.02 / x) * 100) / 100));
    const e3 = ev.get('kalshi', `k-${i}`, 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
    const mid = p.map((x) => Math.round(x * 1.01 * 1000) / 1000);
    coter(e3, 'Kalshi', 'close', mid.map((x) => Math.round((1 / x) * 1000) / 1000), mid);
    if (i % 10 === 0) {
      const e4 = ev.get('odds-api', `oa-${i}`, 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
      coter(e4, 'pinnacle', 'snapshot', cotesDe(p, 1.05), null, `${date}T08:00:00.000Z`, `${date}T08:00:00.000Z`);
    }
    // Pinnacle de football-data dans odds_quotes : fd_history le donne déjà — jamais pris deux fois.
    if (i < 10) coter(e2, 'Pinnacle', 'close', cotesDe(p, 1.03));
    // Un doublon : un second événement ESPN rattaché à la même rencontre (une seule cote par livre est prise).
    if (i === 1) {
      const e5 = ev.get('espn', 'espn-doublon-1', 'Ligue Essai', date, kickoff, `D${home}`, `E${away}`, null, null, mk, 'essai', '2026-10-01T00:00:00.000Z').id;
      coter(e5, 'DraftKings', 'close', cotesDe(p, 1.3));
    }
  }
  // football-data : 300 lignes E0 2019-20, 20 clubs.
  const ft = db.prepare('INSERT INTO fd_teams (id, pays, nom, team_id) VALUES (?, ?, ?, NULL)');
  for (let c = 1; c <= 20; c++) ft.run(c, 'England', `Club ${c}`);
  const colonnes = ['code', 'saison', 'date', 'date_fichier', 'dom', 'ext', 'lien', 'bd', 'be', ...['moy', 'pin', 'b365', 'wh'].flatMap((l) => ['1', 'n', '2', 'c1', 'cn', 'c2'].map((s) => `${l}_${s}`))];
  const fd = db.prepare(`INSERT INTO fd_history (${colonnes.join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})`);
  for (let i = 0; i < 300; i++) {
    const date = jour('2019-08-10', Math.floor(i / 3));
    const p = tirer();
    const issue = issueDe(p);
    const [bd, be] = SCORES[issue];
    const tot = norm(p.map((x) => x + (u() - 0.5) * 0.08));
    const c100 = (c) => c.map((x) => Math.round(x * 100));
    const livre = (k) => [...c100(cotesDe(tot, k + 0.04)), ...c100(cotesDe(p, k))];
    fd.run('E0', '2019-20', date, date, 1 + (i % 20), 1 + ((i + 3) % 20), 0, bd, be, ...livre(1.12), ...livre(1.04), ...livre(1.1), ...livre(1.14));
  }
  // Une ligne au score différent du magasin (lien = 2) : jamais une rencontre de la mesure.
  const p2 = tirer();
  const c2 = p2.map((x) => Math.round(cotesDe(p2)[p2.indexOf(x)] * 100));
  fd.run('E0', '2025-26', '2025-12-02', '2025-12-02', 1, 2, 2, 0, 0, ...[0, 1, 2, 3].flatMap(() => [...c2, ...c2]));
  db.exec('COMMIT');
}

function compter() {
  return {
    runs: db.prepare('SELECT COUNT(*) AS n FROM market_knowledge_runs').get().n,
    finis: db.prepare('SELECT COUNT(*) AS n FROM market_knowledge_runs WHERE fini_le IS NOT NULL').get().n,
    lignes: db.prepare('SELECT COUNT(*) AS n FROM market_knowledge').get().n,
    calculs: db.prepare('SELECT DISTINCT calcul FROM market_knowledge ORDER BY calcul').all().map((r) => r.calcul)
  };
}

if (phase === 'nuit') {
  const lecture = () => new DatabaseSync(BASE, { readOnly: true });
  // Avant tout calcul : les lectures rendent null, l'étape est due.
  const ro0 = lecture();
  sortie.avant = { lire: K.lireConnaissanceDuMarche({ database: ro0 }), juste: K.livreLePlusJuste({ database: ro0 }), moment: K.meilleurMomentDe({ database: ro0 }), marge: K.margeDe({ database: ro0, livre: 'fd|Pinnacle' }) };
  ro0.close();
  sortie.etapes = job.REFRESH_STEPS.map((e) => e.key);
  sortie.dueAvant = job.__testing.dueConnaitreMarche({ manuel: false, derniere: () => null }, { database: db });
  planter();
  // 0. Le chargement, tel que le processus à part le fait : rencontres, issues, livres et moments, grandes équipes.
  const { executerSansPause } = await imp('utils/travailCooperatif.js');
  const R = executerSansPause(K.chargerLesReleves(db));
  const issueDe2 = (cle) => R.matchs[R.parCle.get(cle)]?.issue ?? null;
  const parLivreMoment = {};
  for (let k = 0; k < R.n; k++) {
    const cle = `${R.livres[R.eLivre[k]].cle}|${K.__pourLesTests.LISTE_MOMENTS[R.eMoment[k]]}`;
    parLivreMoment[cle] = (parLivreMoment[cle] ?? 0) + 1;
  }
  const grandes = { 2024: 0, 2025: 0 };
  for (const m of R.matchs) if (m.cle.startsWith('essai-') && m.grande) grandes[m.saison]++;
  sortie.chargement = {
    bilan: R.bilan,
    livres: R.livres.map((l) => l.cle).sort(),
    parLivreMoment,
    prolongee: issueDe2('essai-5'),
    attribuee: issueDe2('essai-6'),
    fd: R.matchs.filter((m) => m.cle.startsWith('fd:')).length,
    pinnacleSurLeMagasin: [...Array(R.n).keys()].filter((k) => R.livres[R.eLivre[k]].cle === 'fd|Pinnacle' && R.matchs[R.eMatch[k]].cle.startsWith('essai-')).length,
    grandes
  };
  // 1. Le premier calcul, par l'étape de la passe : le calcul dans un processus à part.
  const e1 = await job.__testing.passeConnaitreMarche({ manuel: false });
  sortie.premier = { status: e1.status, summary: e1.summary, details: e1.details, comptes: compter() };
  const maintenantParis = new Date().toISOString();
  sortie.due = {
    jamais: job.__testing.dueConnaitreMarche({ manuel: false, derniere: () => null }, { database: db }),
    aujourdhui: job.__testing.dueConnaitreMarche({ manuel: false, derniere: () => maintenantParis }, { database: db }),
    hier: job.__testing.dueConnaitreMarche({ manuel: false, derniere: () => '2026-10-04T08:00:00.000Z' }, { database: db }),
    clic: job.__testing.dueConnaitreMarche({ manuel: true, derniere: () => maintenantParis }, { database: db })
  };
  // 2. La nuit suivante, rien de neuf : rien recalculé, rien écrit.
  const e2 = await job.__testing.passeConnaitreMarche({ manuel: false });
  sortie.rien = { status: e2.status, summary: e2.summary, mode: e2.details.mode, comptes: compter() };
  // 3. Une cote de plus sur une rencontre DÉJÀ connue (une clôture Caesars sur l'événement ESPN existant ; comme
  //    upsertQuotes, la date de l'événement avance — aucun compte ne bouge) : recalcul, l'ancien calcul retiré.
  const id = db.prepare("SELECT id FROM odds_events WHERE source = 'espn' AND source_event = 'espn-399'").get().id;
  db.prepare("UPDATE odds_events SET updated_at = '2026-10-05T11:00:00.000Z' WHERE id = ?").run(id);
  for (const [s, o] of [['home', 2.1], ['draw', 3.3], ['away', 3.6]]) db.prepare("INSERT INTO odds_quotes (event_id, bookmaker, market, selection, line, kind, seq, releve_at, price) VALUES (?, 'Caesars', '1x2', ?, 0, 'close', '', '2026-10-05T11:00:00.000Z', ?)").run(id, s, o);
  const e3 = await job.__testing.passeConnaitreMarche({ manuel: false });
  sortie.recalcul = { status: e3.status, mode: e3.details.mode, calcul: e3.details.calcul, comptes: compter() };
  // 4. Un calcul en échec (le processus à part ne peut pas ouvrir la base) : rien d'écrit, le précédent reste lu.
  const e4 = await K.connaitreLeMarche({ database: db, chemin: path.join(path.dirname(BASE), 'absente.db'), force: true });
  const echoue = db.prepare('SELECT fini_le, bilan FROM market_knowledge_runs WHERE id = ?').get(e4.calcul);
  sortie.echec = { mode: e4.mode, erreur: e4.erreur, finiLe: echoue.fini_le, bilan: JSON.parse(echoue.bilan), comptes: compter(), dernier: K.dernierCalcul({ database: db, avecResume: false }).id };
  // 5. Après l'échec, un calcul forcé réussi : les restes retirés, une seule série de lignes.
  const e5 = await K.connaitreLeMarche({ database: db, force: true });
  sortie.apresEchec = { mode: e5.mode, calcul: e5.calcul, comptes: compter() };
  // 6. Les lectures des étapes 23 et 31, sur une connexion EN LECTURE SEULE (une écriture lèverait).
  const ro = lecture();
  const tout = K.lireConnaissanceDuMarche({ database: ro });
  sortie.lecture = {
    calcul: tout.calcul,
    livres: tout.livres,
    comptes: Object.fromEntries(['justesse', 'vitesse', 'biais', 'marges', 'moments', 'reproduction'].map((m) => [m, tout[m].length])),
    resume: tout.resume,
    ligue: K.lireConnaissanceDuMarche({ database: ro, championnat: 'Ligue Essai' }),
    pinnacle: K.lireConnaissanceDuMarche({ database: ro, livre: 'fd|Pinnacle', mesures: ['justesse', 'marge'] }),
    pinnacleMoments: K.lireConnaissanceDuMarche({ database: ro, livre: 'fd|Pinnacle', mesures: ['moment'] }).moments.length,
    juste: K.livreLePlusJuste({ database: ro }),
    justeReleve: K.livreLePlusJuste({ database: ro, moment: 'releve' }),
    moment: K.meilleurMomentDe({ database: ro }),
    momentsFacesTous: tout.moments.filter((x) => x.portee === '*' && /^face\|[^|]+$/.test(x.cle)).length,
    momentLigue: K.meilleurMomentDe({ database: ro, championnat: 'Ligue Essai' }),
    marge: K.margeDe({ database: ro, livre: 'fd|Pinnacle' }),
    margeBourse: K.margeDe({ database: ro, livre: 'fd|Betfair Exchange' }),
    margeInconnue: K.margeDe({ database: ro, livre: 'fd|Inconnu' })
  };
  ro.close();
}

process.stdout.write(`${JSON.stringify(sortie)}\n`);
process.exit(0);
