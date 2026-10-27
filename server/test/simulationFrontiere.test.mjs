/**
 * Étape 28 du plan — LA FRONTIÈRE ET LA DÉCLARATION de la simulation complète :
 *   node --test test/simulationFrontiere.test.mjs        (depuis server/)
 *
 *   B1/T12  l'empreinte du moteur du bac (écrite ici) ; rien de l'étape 28 dans l'empreinte ni atteint depuis elle ;
 *           aucun fichier de 28 sous core/ ni sports/ (toute extension) ; aucune horloge, aucun hasard non amorcé dans
 *           data/simulation ; les lecteurs et l'état reçoivent leur base ; rien dans engine-config.json ;
 *   B2      l'ordre de la nuit : simulationSaisons = sauvegarde + 1, simulationMatchs + 1, puis le carnet de l'IA ;
 *           rien de 28 avant la sauvegarde ; le contrôle quotidien dernier ; `due` jamais forcée par un clic ;
 *   B3      les enfants : les saisons en lecture seule (sans annuaire écrivain, sans écriture), les matchs sans aucune
 *           base ; tas plafonnés ; le banc jamais importé par la nuit ni une route ;
 *   T11     les minutes FotMob → créneaux (45+x en 1re mi-temps, prolongation ignorée, « avant la 30e » = créneaux 0..29),
 *           la mi-temps relevée APRÈS le créneau 45 dans la simulation, les issues de la nuit = celles du banc ;
 *   F6      le contrôle « sans effets » : les 18 marchés du bloc de v1 (= banc), multiplicateurs à 1, aucun rouge ;
 *   T14     la déclaration (lancements.js) : verifierLancements, portée « simulation », 27 variantes, jugerEtape('28')
 *           écarte l'avant-lancement et les fenêtres vues ; fenetresVues('27') et compterVariantes('27') inchangés ; et,
 *           dans un BAC SIMULÉ, le premier démarrage puis la première nuit : K = 27 au registre, 27 intacte.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SERVEUR, RACINE_ESSAIS, ECHANTILLON } from './aides/isolement.mjs';
import { preparerCopieDeBac, executerDansLeBac } from './aides/bacSimule.mjs';
import { fichiersDuMoteur, empreinteDuCode, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';
import * as LANC from '../src/bench/lancements.js';
import { jugerEtape } from '../src/bench/guard.js';
import { enregistrerLancements, fenetresVues, compterVariantes, lancementDe } from '../src/bench/trialsRegistry.js';
import * as SN from '../src/data/simulation/simulationNuit.js';
import * as BANC from '../src/data/simulation/simulationBanc.js';
import { simulerMatch, MI_TEMPS_INCONNUE } from '../src/data/simulation/simulationMatch.js';
import { PARAMS } from '../src/data/simulation/reglages.js';
import { __testing as JOB, REFRESH_STEPS } from '../src/jobs/matchStatsAutoRefresh.js';

const SRC = path.join(SERVEUR, 'src');
const SIM = path.join(SRC, 'data', 'simulation');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const fichiersDe28 = fs.readdirSync(SIM).filter((f) => f.endsWith('.js'));
function atteints(depart) {
  const vus = new Set();
  const pile = [...depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) pile.push(path.resolve(path.dirname(f), m[1]));
  }
  return vus;
}

// ------------------------------------------------------------ B1 / T12 : la frontière

test('B1 l’empreinte du moteur du bac est 16f2459db183a99576365047da98b7777687ef05 (37 fichiers) : l’étape 28 n’a créé ni retouché aucun fichier du moteur — l’essai de l’étape 27 ne recommence pas', () => {
  const code = empreinteDuCode({ rafraichir: true });
  assert.equal(code.empreinte, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(Object.keys(code.fichiers).length, 37);
});

test('T12/B1 frontière : rien de data/simulation dans l’empreinte ni atteint depuis elle ; aucun fichier de l’étape 28 sous core/ ni sports/ (ni .mjs, ni core/settlement) ; data/simulation n’écrit jamais les réglages du moteur', () => {
  const duMoteur = fichiersDuMoteur();
  assert.ok(!duMoteur.some((r) => r.startsWith('data/simulation/')));
  for (const d of MODULES_DU_MOTEUR.dossiers) assert.ok(!'data/simulation/x.js'.startsWith(`${d}/`), d);
  const graphe = [...atteints(duMoteur.map((r) => path.join(SRC, r)))].map((f) => path.relative(SRC, f).split(path.sep).join('/'));
  assert.ok(!graphe.some((r) => r.startsWith('data/simulation/') || r.endsWith('simulation.controller.js')), 'aucun fichier du moteur n’atteint la simulation');
  const sous = (d) => fs.readdirSync(path.join(SRC, d), { recursive: true }).map(String);
  for (const d of ['core', 'sports']) assert.ok(!sous(d).some((f) => /simulation|saisons?\.|jambes\.|enjeux?\./i.test(path.basename(f))), `aucun fichier de l’étape 28 sous ${d}/`);
  for (const f of fichiersDe28) {
    const code = sansCommentaires(path.join(SIM, f));
    assert.doesNotMatch(code, /engine-config|updateEngineConfig|remplacerReglagesDuMoteur|writeJsonAtomic/, `${f} : jamais les réglages du moteur`);
  }
});

test('T12/B3 aucune horloge ni hasard non amorcé dans data/simulation (« maintenant » vient de la passe) ; l’état et les lecteurs reçoivent leur base (ni openDb, ni DatabaseSync, ni fichier, ni réseau, ni variable d’environnement)', () => {
  for (const f of fichiersDe28) {
    const code = sansCommentaires(path.join(SIM, f));
    assert.doesNotMatch(code, /Date\.now|new Date\(\s*\)|Math\.random/, `${f} : horloge ou hasard`);
  }
  for (const f of ['etatSimulation.js', 'simulationRead.js']) {
    const code = sansCommentaires(path.join(SIM, f));
    for (const interdit of [/openDb/, /DatabaseSync/, /node:fs/, /readFileSync|writeFileSync/, /\bfetch\s*\(/, /process\.env/, /node:child_process/]) assert.doesNotMatch(code, interdit, `${f} : ${interdit}`);
  }
});

test('B3 les enfants : les saisons ouvrent la base EN LECTURE SEULE et n’écrivent rien (aucun INSERT, UPDATE, DELETE), sans annuaire écrivain ; les matchs n’ouvrent AUCUNE base ni fichier ; tas plafonnés (512 et 256 Mo) ; le banc jamais importé par la nuit, une route ou l’actualisation', () => {
  const saisons = sansCommentaires(path.join(SIM, 'simulationSaisonsEnfant.js'));
  assert.equal(saisons.match(/new DatabaseSync\(/g)?.length, 1);
  assert.match(saisons, /new DatabaseSync\(chemin, \{ readOnly: true \}\)/);
  assert.doesNotMatch(saisons, /\b(INSERT|UPDATE|DELETE|REPLACE INTO|CREATE TABLE|DROP)\b/);
  assert.doesNotMatch(saisons, /clubDuMagasin|ensureRegistries|openDb/);
  const matchs = sansCommentaires(path.join(SIM, 'simulationMatchsEnfant.js'));
  assert.doesNotMatch(matchs, /DatabaseSync|node:sqlite|openDb|matchStatsDb|node:fs|readJsonFile|\bchemin\b/);
  assert.deepEqual([...SN.OPTIONS_ENFANT_SAISONS], ['--max-old-space-size=512', '--max-semi-space-size=8']);
  assert.deepEqual([...SN.OPTIONS_ENFANT_MATCHS], ['--max-old-space-size=256', '--max-semi-space-size=8']);
  const nuit = sansCommentaires(path.join(SIM, 'simulationNuit.js'));
  assert.match(nuit, /execArgv: \[\.\.\.process\.execArgv, \.\.\.options\]/);
  assert.match(nuit, /commencerCalculLourd\(nom\)/);
  for (const f of ['data/simulation/simulationNuit.js', 'data/simulation/simulationRead.js', 'api/controllers/simulation.controller.js', 'api/controllers/analysis.controller.js', 'api/controllers/bets.controller.js', 'jobs/matchStatsAutoRefresh.js']) {
    assert.doesNotMatch(sansCommentaires(path.join(SRC, f)), /simulationBanc/, `${f} n’importe pas le banc`);
  }
});

// ------------------------------------------------------------ B2 : l'ordre de la nuit

test('B2 l’ordre de la nuit : … → sauvegarde → simulationSaisons → simulationMatchs → carnetIA → … → controleQuotidien (dernier) ; rien de l’étape 28 avant la sauvegarde ; le gel, la candidate à blanc et la sauvegarde gardent leur ordre', () => {
  const cles = REFRESH_STEPS.map((e) => e.key);
  const i = cles.indexOf('sauvegarde');
  assert.deepEqual(cles.slice(i, i + 4), ['sauvegarde', 'simulationSaisons', 'simulationMatchs', 'carnetIA']);
  assert.equal(cles.at(-1), 'controleQuotidien');
  assert.ok(!cles.slice(0, i).some((k) => /simulation/i.test(k)));
  assert.deepEqual(cles.filter((k) => ['gelPronostics', 'moteurABlanc', 'calibrationMensuelle', 'carteOuParier', 'sauvegarde'].includes(k)), ['gelPronostics', 'moteurABlanc', 'calibrationMensuelle', 'carteOuParier', 'sauvegarde']);
  assert.equal(cles.indexOf('moteurABlanc'), cles.indexOf('gelPronostics') + 1);
  assert.equal(cles.indexOf('sauvegarde'), cles.indexOf('carteOuParier') + 1);
});

test('B2 « due » : une fois par jour civil de Paris, ou quand la passe d’avant l’a reportée ; jamais forcée par un clic (manuel) ; les matchs avec l’interrupteur des enregistreurs', () => {
  const ctx = (derniere, details = null, manuel = false) => ({ manuel, derniere: () => derniere, derniersDetails: () => details });
  const aujourdhui = new Date().toISOString();
  const hier = new Date(Date.now() - 2 * 86_400_000).toISOString();
  assert.equal(JOB.dueSimulationSaisons(ctx(null)), true);
  assert.equal(JOB.dueSimulationSaisons(ctx(hier)), true);
  assert.equal(JOB.dueSimulationSaisons(ctx(aujourdhui)), false);
  assert.equal(JOB.dueSimulationSaisons(ctx(aujourdhui, null, true)), false, 'un clic ne la force pas');
  assert.equal(JOB.dueSimulationSaisons(ctx(aujourdhui, { reporte: true })), true, 'reportée : refaite');
  const job = sansCommentaires(path.join(SRC, 'jobs', 'matchStatsAutoRefresh.js'));
  assert.match(job, /const dueSimulationMatchs = \(ctx\) => Boolean\(env\.enregistreurs\?\.enabled\) && \(!faitAujourdhui\(ctx\.derniere\('simulationMatchs'\)\) \|\| Boolean\(ctx\.derniersDetails\?\.\('simulationMatchs'\)\?\.reporte\)\);/);
  assert.doesNotMatch(job.slice(job.indexOf('const dueSimulationSaisons'), job.indexOf('const dueSimulationSaisons') + 300), /manuel/);
});

// ------------------------------------------------------------ T11 : les minutes et la mi-temps

test('T11 les minutes FotMob → créneaux : 1 → 0, 45 → 44, 45+2 → 45 (1re mi-temps), 46 → 46, 90 → 90, 90+3 → 91 ; prolongation (105) ignorée ; « avant la 30e » = créneaux 0..29 (but noté 30’ dedans, 31’ dehors)', () => {
  assert.deepEqual([[1], [45], [45, 2], [46], [90], [90, 3], [105], [0], [null]].map(([m, a]) => SN.creneauDe(m, a)), [0, 44, 45, 46, 90, 91, -1, -1, -1]);
  const avant = (minute) => SN.issuesDuDeroule({ hg: 1, ag: 0, hHt: minute <= 45 ? 1 : 0, aHt: 0, buts: [[SN.creneauDe(minute), 0]], rouges: 0 }).premierAvant30;
  assert.equal(avant(30), 1, 'un but noté 30’ (créneau 29) compte');
  assert.equal(avant(31), 0, 'un but noté 31’ (créneau 30) non');
});

test('T11 les issues du magasin : un but à 45+2 compte à la mi-temps, un à la 46e non ; un but de prolongation (100e) ignoré, le score à la 90e retrouvé ; une minute manquante → mi-temps inconnue ; rouges et deuxièmes jaunes comptés', () => {
  const ev = [
    { type: 'goal', minute: 12, side: 'home' },
    { type: 'goal', minute: 45, addedTime: 2, side: 'away' },
    { type: 'card', minute: 50, side: 'home', card: 'yellowred' },
    { type: 'goal', minute: 46, side: 'home' },
    { type: 'goal', minute: 100, side: 'away' }
  ];
  const m = SN.issuesDuMagasin({ hg: 2, ag: 1, events: JSON.stringify(ev) });
  assert.deepEqual([m.complet, m.hHt, m.aHt, m.buts.length, m.rouges.length], [true, 1, 1, 3, 1]);
  const y = SN.issuesDuDeroule(m);
  assert.deepEqual([y.htD, y.htFt3, y.premierDom, y.premierAvant30, y.deuxMiTemps05, y.rougeAuMoinsUn], [1, 1, 1, 1, 1, 1]);
  const trou = SN.issuesDuMagasin({ hg: 1, ag: 0, events: [{ type: 'goal', minute: null, side: 'home' }] });
  assert.equal(trou.complet, false);
  assert.equal(SN.issuesDuDeroule(trou).htD, null);
});

test('T11 les issues de la nuit = celles du banc (simulationBanc.issuesDuMatch, que la nuit n’importe pas), sur 2 000 rencontres tirées', () => {
  let s = 99;
  const u = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 2000; k++) {
    const hg = Math.floor(u() * 5);
    const ag = Math.floor(u() * 5);
    const hHt = u() < 0.1 ? null : Math.floor(u() * (hg + 1));
    const aHt = hHt === null ? null : Math.floor(u() * (ag + 1));
    const buts = u() < 0.2 ? null : Array.from({ length: hg + ag }, () => [Math.floor(u() * 92), u() < 0.5 ? 0 : 1]);
    const rouges = u() < 0.3 ? Math.floor(u() * 2) : Array.from({ length: Math.floor(u() * 2) }, () => [Math.floor(u() * 92), 0]);
    const x = { hg, ag, hHt, aHt, buts, rouges };
    assert.deepEqual(SN.issuesDuDeroule(x), BANC.issuesDuMatch(x), JSON.stringify(x));
  }
});

test('T11 la mi-temps se relève APRÈS le créneau 45 dans la simulation : tous les buts tirés au créneau 45 (45+) comptent à la mi-temps', () => {
  const profil = new Array(92).fill(0);
  profil[45] = 1;
  const ch = simulerMatch({ lambda: 2.5, mu: 1.5, grille: null, params: { ...PARAMS, profil }, n: 300, seed: 11 });
  let buts = 0;
  for (let p = 0; p < ch.n; p++) {
    assert.notEqual(ch.htH[p], MI_TEMPS_INCONNUE);
    assert.equal(ch.htH[p] + ch.htA[p], ch.ftH[p] + ch.ftA[p], 'un but du 45+ est un but de 1re mi-temps');
    buts += ch.ftH[p] + ch.ftA[p];
  }
  assert.ok(buts > 500, `${buts} buts tirés`);
});

test('T11 sur la base d’essai : la mi-temps lue par la nuit (créneaux 0..45) = celle d’un second calcul écrit ici (la règle de s0 : 20 897 égales à football-data contre 1 sur le magasin), pour chaque rencontre à chronologie complète', () => {
  const db = new DatabaseSync(ECHANTILLON, { readOnly: true });
  try {
    let comparees = 0;
    for (const r of db.prepare('SELECT home_goals hg, away_goals ag, events FROM matches WHERE events IS NOT NULL AND home_goals IS NOT NULL').iterate()) {
      const ev = JSON.parse(r.events);
      const buts = ev.filter((e) => e.type === 'goal');
      if (buts.some((b) => b.minute === null || b.minute === undefined)) continue;
      const dedans = buts.filter((b) => b.minute <= 90);
      if (dedans.filter((b) => b.side === 'home').length !== r.hg || dedans.length - dedans.filter((b) => b.side === 'home').length !== r.ag) continue;
      const premiere = dedans.filter((b) => b.minute < 45 || (b.minute === 45));
      const m = SN.issuesDuMagasin({ hg: r.hg, ag: r.ag, events: ev });
      assert.equal(m.complet, true);
      assert.deepEqual([m.hHt, m.aHt], [premiere.filter((b) => b.side === 'home').length, premiere.filter((b) => b.side !== 'home').length]);
      comparees++;
    }
    assert.ok(comparees > 150, `${comparees} rencontres comparées`);
  } finally {
    db.close();
  }
});

test('les 14 combinés jugés chaque nuit = ceux du banc v2 ; les lignes d’une rencontre (grille contre produit, perte log) = celles du banc', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(SN.COMBINES_DE_LA_NUIT)), JSON.parse(JSON.stringify(BANC.COMBINES_DU_BANC)));
  for (const [lambda, mu, hg, ag] of [[1.45, 1.15, 2, 1], [0.9, 0.9, 0, 0], [2.5, 0.7, 3, 1], [1.2, 1.6, 1, 2]]) {
    const nuit = SN.lignesDUneRencontre({ fixtureKey: 'f', date: '2026-11-10', lambda, mu, rho: -0.05, hg, ag });
    const banc = BANC.lignesDesCombines({ lambda, mu, rho: -0.05, hg, ag });
    nuit.combines.forEach((c, i) => {
      assert.equal(c.nom, banc[i].nom);
      assert.equal(c.r, banc[i].r);
      assert.equal(c.pG, banc[i].pG);
      assert.equal(c.pI, banc[i].pI);
      assert.ok(Math.abs(nuit.lignes[i].a - banc[i].lI) < 1e-12 && Math.abs(nuit.lignes[i].b - banc[i].lG) < 1e-12);
    });
  }
});

test('F6, le contrôle « sans effets » : les 18 marchés du bloc de v1 (= BLOC_DEROULE du banc, tous jugés chaque nuit) ; ses réglages = ceux de la simulation, multiplicateurs à 1 et aucun rouge (la variante C de v1, déclarée)', async () => {
  const ENF = await import('../src/data/simulation/simulationMatchsEnfant.js');
  const { PARAMS } = await import('../src/data/simulation/reglages.js');
  assert.deepEqual([...SN.MARCHES_DU_CONTROLE_SANS_EFFETS], [...BANC.BLOC_DEROULE]);
  assert.ok(SN.MARCHES_DU_CONTROLE_SANS_EFFETS.every((k) => SN.MARCHES_DE_LA_NUIT.includes(k)));
  const P = ENF.PARAMS_SANS_EFFETS;
  assert.deepEqual([P.MH.length, P.MA.length, P.rougeBande.length], [PARAMS.MH.length, PARAMS.MA.length, PARAMS.rougeBande.length]);
  assert.ok(P.MH.every((x) => x === 1) && P.MA.every((x) => x === 1), 'multiplicateurs à 1');
  assert.ok(P.rougeBande.every((x) => x === 0), 'aucun rouge');
  assert.deepEqual([P.profil, P.rougeEtat, P.bandes], [PARAMS.profil, PARAMS.rougeEtat, PARAMS.bandes]);
  assert.ok(LANC.VARIANTES_DE_L_ETAPE_28.some((v) => v.id === 'sim-stratifiee-sans-effets'), 'la variante sans effets est déclarée');
});

// ------------------------------------------------------------ T14 : la déclaration

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-simulation-registre-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

test('T14 la déclaration de l’étape 28 : verifierLancements vert ; portée « simulation » ; 27 variantes uniques dont simulation-v1 en tête ; deux vues de portée « simulation » seulement (2023-07-01 → 2026-09-23 ; P2 2019-07-01 → 2023-06-30, la fenêtre de la porte 1, déclarée avant le regard) — aucune en portée « moteur » ; le: null', () => {
  assert.equal(LANC.verifierLancements(), true);
  assert.ok(LANC.PORTEES.includes('simulation'));
  const l28 = LANC.LANCEMENTS.find((l) => l.etape === '28');
  assert.deepEqual([l28.version, l28.le], ['simulation-v1', null]);
  assert.equal(l28.variantes, LANC.VARIANTES_DE_L_ETAPE_28);
  assert.equal(LANC.VARIANTES_DE_L_ETAPE_28.length, 27);
  assert.equal(new Set(LANC.VARIANTES_DE_L_ETAPE_28.map((v) => v.id)).size, 27);
  assert.equal(LANC.VARIANTES_DE_L_ETAPE_28[0].id, 'simulation-v1');
  for (const id of ['sim-poisson-exact', 'combines-produit', 'saisons-forces', 'saisons-table', 'enjeu-seuils-2-10-20', 'sim-effets-appris-2023-2025']) assert.ok(LANC.VARIANTES_DE_L_ETAPE_28.some((v) => v.id === id), id);
  assert.deepEqual(l28.vues.map((f) => [f.de, f.a, [...f.pour]]), [['2023-07-01', '2026-09-23', ['simulation']], ['2019-07-01', '2023-06-30', ['simulation']]]);
  assert.deepEqual(LANC.fenetresDeclarees({ portee: 'simulation' }).filter((f) => f.etape === '28').map((f) => [f.id, f.de, f.a]), [['28:simulation-v1:1', '2023-07-01', '2026-09-23'], ['28:simulation-v1:2', '2019-07-01', '2023-06-30']]);
  for (const portee of ['moteur', 'indice', 'joueurs', 'style', 'statistiques', 'marche']) assert.ok(!LANC.fenetresDeclarees({ portee }).some((f) => f.etape === '28'), portee);
  assert.ok(LANC.ETAPES_A_JUGER.includes('28'));
});

test('T14 le premier démarrage date le lancement de 28 au jour de Paris ; fenetresVues(\'27\') et compterVariantes(\'27\') INCHANGÉS ; compterVariantes(\'28\') = 27 ; jugerEtape(\'28\') sur des lignes fabriquées écarte l’avant-lancement et les fenêtres vues', () => {
  const fichier = path.join(DOSSIER, 'registre-t14.json');
  const avant = { f27: JSON.stringify(fenetresVues('27', { fichier })), k27: compterVariantes('27', { fichier }) };
  assert.equal(lancementDe('28', { fichier }), null, 'pas encore lancée');
  const r = enregistrerLancements({ fichier, maintenant: Date.parse('2026-11-04T23:30:00Z') });
  assert.ok(r.nouveaux.some((x) => x.etape === '28' && x.version === 'simulation-v1' && x.le === '2026-11-05'), JSON.stringify(r.nouveaux));
  assert.equal(JSON.stringify(fenetresVues('27', { fichier })), avant.f27);
  assert.equal(compterVariantes('27', { fichier }), avant.k27);
  assert.equal(compterVariantes('28', { fichier }), 27);
  assert.equal(lancementDe('28', { fichier }).le, '2026-11-05');
  // jugerEtape('28') : un lancement à date fixe AVANT la vue, pour voir les deux écarts ; lignes d'avant le lancement, dans la vue, et neuves.
  const fixe = LANC.LANCEMENTS.map((l) => (l.etape === '28' ? { ...l, le: '2023-01-15' } : l));
  const registre = { fichier: path.join(DOSSIER, 'registre-t14-fixe.json'), lancements: fixe };
  const ligne = (date, i) => ({ bloc: `m${date}-${i}`, date, a: 0.7, b: 0.69 });
  const lignes = [...['2022-12-01', '2023-01-10'].map(ligne), ...['2024-03-03', '2025-08-01', '2026-09-23'].map(ligne), ...['2026-11-10', '2026-11-11', '2026-11-12'].map(ligne)];
  const j = jugerEtape({ etape: '28', lignes, mesure: 'perte-log', maintenant: Date.parse('2026-11-20T02:00:00Z'), registre, enregistrer: false });
  assert.deepEqual(j.ecartees, { avantLancement: 2, donneesVues: 3 });
  assert.equal(j.n.lignes, 3);
  assert.equal(j.seuil.variantes, 27);
  assert.equal(j.verdict, 'pas-assez-de-matchs');
});

test('T14 dans un BAC SIMULÉ : le premier démarrage avec ce code puis la première nuit simulée — K = 27 au registre, le lancement de 28 daté du jour, fenetresVues(\'27\') et compterVariantes(\'27\') inchangés, les deux étapes ont tourné', () => {
  const copie = preparerCopieDeBac();
  try {
    const r = executerDansLeBac(copie, path.join(SERVEUR, 'test', 'aides', 'script-simulation-bac.mjs'), { timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    const s = r.json;
    assert.equal(s.bac, true, 'la copie se reconnaît dans le bac');
    assert.equal(s.avant.lancement28, null);
    assert.ok(s.demarrage.some((x) => x.etape === '28' && x.version === 'simulation-v1'));
    assert.equal(s.apres.variantes28, 27);
    assert.deepEqual(s.apres.fenetres27, s.avant.fenetres27);
    assert.equal(s.apres.variantes27, s.avant.variantes27);
    assert.equal(s.apres.lancement28.version, 'simulation-v1');
    assert.match(s.apres.lancement28.le, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(s.apres.fenetres28.find(([de, a]) => de === '2023-07-01' && a === '2026-09-23') ? 'vue' : null, 'vue');
    assert.match(s.saisons.summary, /^Fins de saison : /);
    assert.match(s.matchs.summary, /^Déroulés simulés : /);
    assert.equal(s.registre.lancements.length, 1);
  } finally {
    copie.nettoyer();
  }
});
