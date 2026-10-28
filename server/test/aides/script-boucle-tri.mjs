/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-boucle-tri.mjs <serveur de la copie>
 *
 * Étape 26 — LE TRI DU MOIS sur des données FABRIQUÉES, heure figée au 01/03/2027 à 07 h UTC. Le registre des
 * versions de la copie (écrit par le test) : v1 (20/09/2026) et v2 (10/11/2026, vos bookmakers seuls : la même
 * lignée), v3 (15/01/2027 à 09 h, un autre code : une autre lignée) ; toutes avec le modèle de buts unique. La
 * candidate de l'étape 27 reste déclarée dans le code de la copie : la place est PRISE.
 * PLANTÉS ici par SQL, octobre 2026 → février 2027, 450 matchs par mois (identifiants FotMob neufs), chacun avec
 * son score, ses corners et 9 pronostics gelés (1N2, total buts 2,5, les deux marquent, buts de chaque équipe 0,5,
 * résultat + total 2,5, corners du match 9,5, corners de chaque équipe) dont les distributions sont EXACTEMENT
 * réalisées (un mélange de 90 scores et de 90 paires de corners, chaque bloc de 90 matchs le reproduit) — sauf :
 *   - lignée A (octobre → décembre) : « les deux marquent » annoncé « oui » 0,45 pour 30/90 réalisé ;
 *   - lignée B (janvier → février) : « plus de 2,5 buts » annoncé 0,12 pour 24/90 réalisé (trop sûr de « moins »).
 * Janvier : les 180 premiers matchs gelés par v2 (autre lignée), les 270 suivants par v3 (mois PARTIEL). Novembre :
 * dix matchs ont trois révisions des « deux marquent » (une fausse avant, la vraie la veille, une fausse après le
 * coup d'envoi). Octobre : des pièges hors des 450 (sans identifiant, sans résultat, sans version, autre version,
 * sans distribution, corners non relevés, gelé après le coup d'envoi). Deux choix gelés ne sont PAS le favori de
 * leur distribution (le combiné, les corners de l'équipe qui se déplace) : la confiance juge le favori, jamais le
 * choix. Janvier est figé par la calibration AVANT décembre : il attend quand même son tour.
 * Le calcul de l'appli (moisATrier, trierLeMois, ecrireLeTri, lireLeTri, lireLeJournal) face à un SECOND CHEMIN écrit
 * ici à la main (règlement, niveau, favori, sommes ; le juge comparer pris sur les lignes brutes). Sortie : une ligne JSON.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const T = await imp('data/correction/tri.js');
const D = await imp('data/correction/depotCorrections.js');
const L = await imp('data/correction/lignee.js');
const R = await imp('data/correction/regles.js');
const { etatDesVersions, FICHIER_VERSIONS, empreinteDesReglages } = await imp('core/engine/engineVersions.js');
const { lireReglagesDuMoteur } = await imp('core/engine/engineConfig.js');
const { readJsonFile } = await imp('utils/atomicJson.js');
const { executerSansPause } = await imp('utils/travailCooperatif.js');
const { comparer } = await imp('bench/guard.js');

const sortie = { ok: true, maintenant: new Date().toISOString() };
const p4 = (x) => Number(x.toFixed(4));

// ------------------------------------------------------------ le plan : mélanges exacts

const SCORES = [['0-0', 10], ['1-0', 16], ['0-1', 12], ['2-0', 10], ['0-2', 6], ['3-0', 5], ['0-3', 1], ['1-1', 12], ['2-1', 8], ['1-2', 5], ['2-2', 3], ['3-1', 2]].flatMap(([s, n]) => Array(n).fill(s.split('-').map(Number)));
const CORNERS = [[[6, 5], 20], [[5, 3], 25], [[3, 4], 20], [[7, 4], 15], [[4, 2], 10]].flatMap(([c, n]) => Array(n).fill(c));
if (SCORES.length !== 90 || CORNERS.length !== 90) throw new Error('mélanges faux');
const part = (liste, garder) => liste.filter(garder).length / 90;
const VRAI = {
  home: part(SCORES, ([h, a]) => h > a),
  draw: part(SCORES, ([h, a]) => h === a),
  away: part(SCORES, ([h, a]) => h < a),
  plus25: part(SCORES, ([h, a]) => h + a > 2.5),
  oui: part(SCORES, ([h, a]) => h > 0 && a > 0),
  dom05: part(SCORES, ([h]) => h > 0.5),
  ext05: part(SCORES, ([, a]) => a > 0.5),
  combine: Object.fromEntries(['home', 'draw', 'away'].flatMap((r) => ['Over', 'Under'].map((t) => [`${r}${t}`, part(SCORES, ([h, a]) => (h > a ? 'home' : h === a ? 'draw' : 'away') === r && (h + a > 2.5) === (t === 'Over'))]))),
  corners95: part(CORNERS, ([h, a]) => h + a > 9.5),
  dom45: part(CORNERS, ([h]) => h > 4.5),
  ext35: part(CORNERS, ([, a]) => a > 3.5)
};
sortie.vrai = VRAI;

/** Les distributions gelées d'une lignée (« A » : « oui » annoncé 0,45 ; « B » : « plus de 2,5 » annoncé 0,12). */
function distributions(lignee, provenance) {
  const pv = provenance ? { provenance } : {};
  const ou = (p) => ({ over: p4(p), under: p4(1 - p) });
  return {
    result: { issues: { home: p4(VRAI.home), draw: p4(VRAI.draw), away: p4(VRAI.away) } },
    totalGoals: { ligne: 2.5, issues: ou(lignee === 'B' ? 0.12 : VRAI.plus25), ...pv },
    bothTeamsScore: { issues: lignee === 'A' ? { yes: 0.45, no: 0.55 } : { yes: p4(VRAI.oui), no: p4(1 - VRAI.oui) }, ...pv },
    'teamGoals:home': { equipe: 'home', ligne: 0.5, issues: ou(VRAI.dom05), ...pv },
    'teamGoals:away': { equipe: 'away', ligne: 0.5, issues: ou(VRAI.ext05), ...pv },
    resultAndTotal: { ligne: 2.5, issues: Object.fromEntries(Object.entries(VRAI.combine).map(([k, p]) => [k, p4(p)])), ...pv },
    totalCorners: { ligne: 9.5, attendu: 9.9, issues: ou(VRAI.corners95) },
    'teamCorners:home': { equipe: 'home', ligne: 4.5, attendu: 5.2, issues: ou(VRAI.dom45) },
    'teamCorners:away': { equipe: 'away', ligne: 3.5, attendu: 4, issues: ou(VRAI.ext35) }
  };
}
const MARCHES = [
  { marketKey: 'result', marketId: 'result', market: 'Résultat', params: { outcome: 'home' }, choice: 'home' },
  { marketKey: 'totalGoals', marketId: 'totalGoals', market: 'Total buts', params: { line: 2.5, side: 'under' }, choice: 'under' },
  { marketKey: 'bothTeamsScore', marketId: 'bothTeamsScore', market: 'Les 2 équipes marquent', params: { outcome: 'no' }, choice: 'no' },
  { marketKey: 'teamGoals:home', marketId: 'teamGoals', market: 'Buts — Dom', params: { line: 0.5, side: 'over', team: 'home' }, choice: 'over' },
  { marketKey: 'teamGoals:away', marketId: 'teamGoals', market: 'Buts — Ext', params: { line: 0.5, side: 'over', team: 'away' }, choice: 'over' },
  { marketKey: 'resultAndTotal', marketId: 'resultAndTotal', market: 'Résultat + Total buts', params: { key: 'awayUnder', line: 2.5 }, choice: 'awayUnder' },
  { marketKey: 'totalCorners', marketId: 'totalCorners', market: 'Total corners', params: { line: 9.5, side: 'under' }, choice: 'under' },
  { marketKey: 'teamCorners:home', marketId: 'teamCorners', market: 'Corners — Dom', params: { line: 4.5, side: 'over', team: 'home' }, choice: 'over' },
  { marketKey: 'teamCorners:away', marketId: 'teamCorners', market: 'Corners — Ext', params: { line: 3.5, side: 'under', team: 'away' }, choice: 'under' }
];
const params = (p) => JSON.stringify(Object.fromEntries(Object.entries(p).sort(([a], [b]) => a.localeCompare(b))));

/** L'issue réalisée d'un pronostic, réglée À LA MAIN (second chemin : ni calibration.js ni settlementRules.js). */
function issueALaMain(marketKey, [h, a], [ch, ca]) {
  switch (marketKey) {
    case 'result':
      return h > a ? 'home' : h === a ? 'draw' : 'away';
    case 'totalGoals':
      return h + a > 2.5 ? 'over' : 'under';
    case 'bothTeamsScore':
      return h > 0 && a > 0 ? 'yes' : 'no';
    case 'teamGoals:home':
      return h > 0.5 ? 'over' : 'under';
    case 'teamGoals:away':
      return a > 0.5 ? 'over' : 'under';
    case 'resultAndTotal':
      return `${h > a ? 'home' : h === a ? 'draw' : 'away'}${h + a > 2.5 ? 'Over' : 'Under'}`;
    case 'totalCorners':
      return ch + ca > 9.5 ? 'over' : 'under';
    case 'teamCorners:home':
      return ch > 4.5 ? 'over' : 'under';
    case 'teamCorners:away':
      return ca > 3.5 ? 'over' : 'under';
    default:
      throw new Error(marketKey);
  }
}
/** Niveau et favori À LA MAIN (second chemin). */
const REFERENCE = { result: 'home', bothTeamsScore: 'yes' };
const ORDRE = { result: ['home', 'draw', 'away'], bothTeamsScore: ['yes', 'no'], resultAndTotal: ['homeOver', 'homeUnder', 'drawOver', 'drawUnder', 'awayOver', 'awayUnder'] };
function mesuresALaMain(marketId, issues, issue) {
  let niveau;
  if (marketId === 'resultAndTotal') niveau = { a: issues.homeOver + issues.drawOver + issues.awayOver, b: issue.endsWith('Over') ? 1 : 0 };
  else {
    const k = REFERENCE[marketId] ?? 'over';
    niveau = { a: issues[k], b: issue === k ? 1 : 0 };
  }
  const ordre = ORDRE[marketId] ?? ['over', 'under'];
  let f = ordre[0];
  for (const k of ordre) if (issues[k] > issues[f]) f = k;
  return { niveau, confiance: { a: issues[f], b: issue === f ? 1 : 0 } };
}

// ------------------------------------------------------------ la plantation

const COLONNES = ['fixture_key', 'market_key', 'version', 'recorded_at', 'origin', 'match_id', 'league', 'date', 'kickoff', 'home_name', 'away_name', 'home_id', 'away_id', 'market_id', 'market', 'params', 'choice', 'label', 'probability', 'predicted_odds', 'engine_version', 'distribution', 'odds_source'];
const insPick = db.prepare(`INSERT INTO engine_picks (${COLONNES.join(', ')}) VALUES (${COLONNES.map(() => '?').join(', ')})`);
const insMatch = db.prepare(`INSERT INTO matches (match_key, match_id, date, league, home_name, away_name, home_id, away_id, fotmob_id, home_goals, away_goals, updated_at, meta)
                             VALUES (?, ?, ?, 'Ligue Essai 26', ?, ?, ?, ?, ?, ?, ?, '2027-03-01T00:00:00.000Z', ?)`);
const insStats = db.prepare('INSERT INTO team_stats (match_key, side, corner_kicks, total_shots, shots_on_goal) VALUES (?, ?, ?, NULL, NULL)');
const jourPlus = (jour, n) => new Date(Date.parse(`${jour}T00:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);
const MOIS = [
  { mois: '2026-10', jours: 31, lignee: 'A' },
  { mois: '2026-11', jours: 30, lignee: 'A' },
  { mois: '2026-12', jours: 31, lignee: 'A' },
  { mois: '2027-01', jours: 31, lignee: 'B' },
  { mois: '2027-02', jours: 28, lignee: 'B' }
];
const PROVENANCES = ['cotes-1n2-xg', 'cotes-plusmoins-xg', 'xg-seuls'];
const plan = []; // { mois, fixtureKey, date, version, score, corners, dist, compte }
let g = 0;
function planterUnMatch({ date, version, score, corners, dist, oddsSource, matchRow = true, revisions = null, cle = null, homeId = null, awayId = null, picks = MARCHES, statsCorners = null, apresLeCoupDEnvoi = false }) {
  const n = g++;
  const h = homeId ?? String(900000 + n);
  const a = awayId ?? String(950000 + n);
  const fixtureKey = cle ?? `fotmob:${h}|${a}|${date}`;
  const kickoff = `${date}T15:00:00.000Z`;
  const matchKey = `c26-${n}`;
  if (matchRow) {
    insMatch.run(matchKey, matchKey, date, `Dom ${n}`, `Ext ${n}`, h, a, null, score[0], score[1], JSON.stringify({ kickoff }));
    const [ch, ca] = statsCorners ?? corners;
    insStats.run(matchKey, 'home', ch);
    insStats.run(matchKey, 'away', ca);
  }
  for (const m of picks) {
    const d = dist === null ? null : dist[m.marketKey];
    const revs = revisions?.[m.marketKey] ?? [{ version: 1, le: apresLeCoupDEnvoi ? `${date}T16:00:00.000Z` : `${jourPlus(date, -1)}T05:00:00.000Z`, d }];
    for (const r of revs) {
      insPick.run(fixtureKey, m.marketKey, r.version, r.le, 'nuit', `c26m-${n}`, 'Ligue Essai 26', date, kickoff, `Dom ${n}`, `Ext ${n}`, cle?.startsWith('nom:') ? null : h, cle?.startsWith('nom:') ? null : a, m.marketId, m.market, params(m.params), m.choice, m.choice, 0.6, 1.67, version, r.d === null || r.d === undefined ? null : JSON.stringify(r.d), oddsSource);
    }
  }
  return { fixtureKey, h, a };
}

db.exec('BEGIN');
try {
  for (const { mois, jours, lignee } of MOIS) {
    for (let i = 0; i < 450; i++) {
      let date;
      let version;
      if (mois === '2027-01') {
        date = i < 180 ? `${mois}-${String(1 + Math.floor((i * 16) / 180)).padStart(2, '0')}` : `${mois}-${String(17 + Math.floor(((i - 180) * 15) / 270)).padStart(2, '0')}`;
        version = i < 180 ? 2 : 3;
      } else {
        date = `${mois}-${String(1 + Math.floor((i * jours) / 450)).padStart(2, '0')}`;
        version = lignee === 'B' ? 3 : mois === '2026-10' || (mois === '2026-11' && date < '2026-11-10') ? 1 : 2;
      }
      const score = SCORES[i % 90];
      const corners = CORNERS[(i * 7) % 90];
      const provenance = PROVENANCES[i % 3];
      const dist = distributions(mois === '2027-01' && i < 180 ? 'A' : lignee, provenance);
      // Novembre : dix matchs avec trois révisions des « deux marquent » — seule celle de la veille compte.
      let revisions = null;
      if (mois === '2026-11' && i < 10) {
        revisions = {
          bothTeamsScore: [
            { version: 1, le: `${jourPlus(date, -2)}T05:00:00.000Z`, d: { issues: { yes: 0.9, no: 0.1 }, provenance } },
            { version: 2, le: `${jourPlus(date, -1)}T05:00:00.000Z`, d: dist.bothTeamsScore },
            { version: 3, le: `${date}T16:00:00.000Z`, d: { issues: { yes: 0.05, no: 0.95 }, provenance } }
          ]
        };
      }
      const oddsSource = i % 2 ? 'aucune cote (modèle de buts)' : 'cotes gratuites : ESPN';
      const m = planterUnMatch({ date, version, score, corners, dist, oddsSource, revisions });
      plan.push({ mois, fixtureKey: m.fixtureKey, date, version, score, corners, dist, provenance, oddsSource, compte: mois === '2027-01' ? i >= 180 : true });
    }
  }
  // Les pièges d'octobre (hors des 450 ; un pronostic chacun, sauf mention).
  const result = [MARCHES[0]];
  const juste = distributions('A', 'cotes-1n2-xg');
  for (let k = 0; k < 3; k++) planterUnMatch({ date: '2026-10-20', version: 1, score: [1, 0], corners: [5, 5], dist: juste, oddsSource: 'cotes gratuites : ESPN', matchRow: false, cle: `nom:ligue-essai-26|dom-piege-${k}|ext-piege-${k}|2026-10-20`, picks: result });
  for (let k = 0; k < 2; k++) planterUnMatch({ date: '2026-10-21', version: 1, score: [1, 0], corners: [5, 5], dist: juste, oddsSource: 'cotes gratuites : ESPN', matchRow: false, picks: result });
  for (let k = 0; k < 4; k++) planterUnMatch({ date: '2026-10-22', version: null, score: [1, 0], corners: [5, 5], dist: juste, oddsSource: 'cotes gratuites : ESPN', picks: result });
  for (let k = 0; k < 3; k++) planterUnMatch({ date: '2026-10-23', version: 7, score: [1, 0], corners: [5, 5], dist: juste, oddsSource: 'cotes gratuites : ESPN', picks: result });
  for (let k = 0; k < 2; k++) planterUnMatch({ date: '2026-10-24', version: 1, score: [1, 0], corners: [5, 5], dist: null, oddsSource: 'cotes gratuites : ESPN', picks: result });
  planterUnMatch({ date: '2026-10-25', version: 1, score: [1, 0], corners: [5, 5], statsCorners: [0, 0], dist: juste, oddsSource: 'cotes gratuites : ESPN', picks: [MARCHES[6]] });
  planterUnMatch({ date: '2026-10-26', version: 1, score: [1, 0], corners: [5, 5], dist: juste, oddsSource: 'cotes gratuites : ESPN', picks: result, apresLeCoupDEnvoi: true });
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}
sortie.plantes = { matchs: plan.length, pronostics: db.prepare('SELECT COUNT(*) n FROM engine_picks').get().n };

// ------------------------------------------------------------ le second chemin : sommes attendues

const lignesALaMain = new Map(); // mois → famille → [{ fixtureKey, a, b } niveau / confiance]
for (const p of [...plan].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : x.fixtureKey < y.fixtureKey ? -1 : 1))) {
  if (!p.compte) continue;
  if (!lignesALaMain.has(p.mois)) lignesALaMain.set(p.mois, {});
  const parFamille = lignesALaMain.get(p.mois);
  for (const m of MARCHES) {
    const d = p.dist[m.marketKey];
    const issue = issueALaMain(m.marketKey, p.score, p.corners);
    const x = mesuresALaMain(m.marketId, d.issues, issue);
    (parFamille[m.marketId] ??= []).push({ fixtureKey: p.fixtureKey, ...x, regime: d.provenance ?? (/^aucune cote/.test(p.oddsSource) ? 'aucune-cote' : 'cotes') });
  }
}
const attendus = {};
for (const [mois, parFamille] of lignesALaMain) {
  attendus[mois] = {};
  for (const [famille, ls] of Object.entries(parFamille)) {
    for (const mesure of ['niveau', 'confiance']) {
      const sa = ls.reduce((t, l) => t + l[mesure].a, 0);
      const sb = ls.reduce((t, l) => t + l[mesure].b, 0);
      attendus[mois][`${famille}|${mesure}`] = { lignes: ls.length, matchs: new Set(ls.map((l) => l.fixtureKey)).size, ecart: (sb - sa) / ls.length };
    }
    if (R.FAMILLES_DE_BUTS.includes(famille) || famille === 'result') {
      const parRegime = {};
      for (const l of ls) {
        const r = (parRegime[l.regime] ??= { lignes: 0, matchs: new Set(), sb: 0 });
        r.lignes++;
        r.matchs.add(l.fixtureKey);
        r.sb += l.niveau.b;
      }
      attendus[mois][`regimes|${famille}`] = Object.fromEntries(Object.entries(parRegime).map(([k, r]) => [k, { lignes: r.lignes, matchs: r.matchs.size, sb: r.sb }]));
    }
  }
}
sortie.attendus = attendus;
/** Le juge sur les LIGNES BRUTES (une par pronostic, bloc = la clé du match), les mêmes options que le tri. */
function jugeALaMain(cas, moisDeLaFenetre) {
  const [famille, mesure] = cas.split('|');
  const lignes = [];
  for (const mois of moisDeLaFenetre) for (const l of lignesALaMain.get(mois)?.[famille] ?? []) lignes.push({ bloc: l.fixtureKey, match: l.fixtureKey, a: l[mesure].a, b: l[mesure].b });
  const r = comparer(lignes, { mode: 'moyenne', sens: 'max', variantes: 264, alpha: 0.05, minBlocs: 200, tirages: 1000, graine: 26 });
  return { verdict: r.verdict, gain: r.gain, ecartType: r.ecartType, fourchette: r.fourchette, lignes: r.n.lignes, matchs: r.n.matchs };
}

// ------------------------------------------------------------ le calcul de l'appli

const reglagesAvant = JSON.stringify(lireReglagesDuMoteur());
const empreinteAvant = empreinteDesReglages(lireReglagesDuMoteur().football);
const versions = readJsonFile(FICHIER_VERSIONS, null);
const place = T.placeDeLEssai(etatDesVersions());
sortie.place = place;
const figer = db.prepare("INSERT INTO calibration_monthly (mois, version, fige_le, du, au, pronostics, paris, resume, bilan) VALUES (?, 1, '2027-03-01T06:00:00.000Z', ?, ?, 0, 0, '{}', '{}')");
const figerLaCalibration = (...mois) => {
  for (const m of mois) figer.run(m, `${m}-01`, `${m}-28`);
};
const resumerLesCases = (cases) =>
  Object.fromEntries(
    cases.map((c) => [
      c.cas,
      { statut: c.statut, sens: c.sens, courant: c.courant, mois: c.mois.map((m) => m.mois), fenetre: c.fenetre, enEssai: c.enEssai, aRevoir: c.aRevoir, levier: c.levier, dit: c.dit, sensDit: c.sensDit }
    ])
  );
const tris = {};
const variantes = {};
const juges = {};
function trier(liste) {
  for (const m of liste) {
    const tri = executerSansPause(T.trierLeMois(m, { database: db, versions, enSlot: place }));
    const sansPlace = executerSansPause(T.trierLeMois(m, { database: db, versions, enSlot: null }));
    const ecrit = D.ecrireLeTri(tri, { database: db, phrase: `Tri de ${m} figé (essai).` });
    tris[m] = { ecrit: ecrit.ecrit, lignee: tri.lignee, resume: tri.resume, cases: resumerLesCases(tri.cases), regimes: tri.regimes, dureeMs: tri.dureeMs, octetsSommes: JSON.stringify(tri.sommes).length };
    variantes[m] = resumerLesCases(sansPlace.cases);
    juges[m] = Object.fromEntries(tri.cases.filter((c) => c.fenetre).map((c) => [c.cas, jugeALaMain(c.cas, c.fenetre.mois)]));
  }
}

// Janvier est figé avant décembre : il attend quand même (la fenêtre d'un mois réutilise ceux d'avant).
figerLaCalibration('2026-10', '2026-11', '2027-01');
sortie.aTrier1 = T.moisATrier({ database: db });
trier(sortie.aTrier1);
sortie.aTrier2 = T.moisATrier({ database: db });
figerLaCalibration('2026-12', '2027-02');
sortie.aTrier3Limite2 = T.moisATrier({ database: db, limite: 2 });
sortie.aTrier3 = T.moisATrier({ database: db });
trier(sortie.aTrier3);
sortie.aTrier4 = T.moisATrier({ database: db });
sortie.tris = tris;
sortie.variantes = variantes;
sortie.juges = juges;

// Le second passage : rien n'est réécrit ; la base refuse modification et effacement.
const fev = executerSansPause(T.trierLeMois('2027-02', { database: db, versions, enSlot: place }));
const second = D.ecrireLeTri({ ...fev, calculeLe: '2027-03-02T00:00:00.000Z' }, { database: db });
sortie.second = { ecrit: second.ecrit, calculeLeGarde: second.tri.calculeLe, memeCases: JSON.stringify(second.tri.cases) === JSON.stringify(fev.cases) };
const refus = (sql) => {
  try {
    db.exec(sql);
    return 'accepté';
  } catch (error) {
    return error.message;
  }
};
sortie.refus = {
  updateTri: refus("UPDATE correction_tri SET resume = '{}' WHERE mois = '2026-10'"),
  deleteTri: refus("DELETE FROM correction_tri WHERE mois = '2026-10'"),
  updateJournal: refus("UPDATE correction_journal SET phrase = 'réécrite' WHERE n = 1"),
  deleteJournal: refus('DELETE FROM correction_journal')
};
sortie.journal = D.lireLeJournal({ database: db }).map((e) => ({ n: e.n, evenement: e.evenement, source: e.source, phrase: e.phrase, mois: e.details?.mois ?? null }));
const relu = D.lireLeTri('2026-12', { database: db });
sortie.relu = { mois: relu.mois, version: relu.version, cases: resumerLesCases(relu.cases), sansSommes: !('sommes' in relu) };
sortie.listeDesTris = D.listeDesTris({ database: db }).map((t) => `${t.mois}#${t.version}`);
// La lignée et les réglages en service : jamais modifiés (copie profonde, B43).
L.sansReglagesDePari(lireReglagesDuMoteur().football);
L.empreinteDesPronostics({ code: { empreinte: 'x' }, reglages: lireReglagesDuMoteur() });
sortie.reglages = { inchanges: JSON.stringify(lireReglagesDuMoteur()) === reglagesAvant, empreinte: empreinteDesReglages(lireReglagesDuMoteur().football) === empreinteAvant, avecModeleDeButs: Boolean(lireReglagesDuMoteur().football.modeleDeButs) };
console.log(JSON.stringify(sortie));
