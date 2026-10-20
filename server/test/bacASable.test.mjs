/**
 * Garde-fou du bac à sable (src/config/bacASable.js) — test SANS serveur.
 *   node --test test/bacASable.test.mjs        (depuis server/, dans le bac ou le dépôt)
 * Aucune base n'est jamais ouverte : on vérifie des chemins, et des
 * sous-processus qui n'importent que le garde-fou (demarrageBac.js, env.js,
 * matchStatsDb.js sans l'ouvrir, les deux clients IA) — jamais le serveur.
 * Les « clés » posées ici sont fausses ; seuls des booléens sont affichés.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as bac from '../src/config/bacASable.js';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COTEMASTER = path.dirname(bac.VRAIE_BASE);
const BASE_DU_BAC = path.join(bac.RACINE_BAC, 'base', 'match-stats.db');
const DANS_LE_BAC = bac.dossierDuBac() !== null;
const silencieux = { log() {}, error() {} };
const url = (rel) => pathToFileURL(path.join(SERVEUR, rel)).href;

/** Sous-processus Node court, environnement maîtrisé (sans drapeau ni base hérités). */
function enfant(code, envEnPlus = {}) {
  const env = { ...process.env };
  for (const k of ['CM_BAC_A_SABLE', 'MATCH_STATS_DB', 'CM_BAC_ACTUALISATION', 'CM_BAC_COTES_GRATUITES', 'CM_BAC_IA_MAX']) delete env[k];
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: SERVEUR, env: { ...env, ...envEnPlus }, encoding: 'utf8', timeout: 60_000 });
  return { code: r.status, sortie: r.stdout ?? '', erreurs: r.stderr ?? '' };
}

function dossierTemporaire() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cm-garde-bac-'));
}

test('les drapeaux se lisent comme prévu', () => {
  for (const v of ['1', 'true', 'oui', 'yes', 'n\'importe quoi']) assert.equal(bac.drapeauBac(v), true, v);
  for (const v of [undefined, null, '', ' ', '0', 'false', 'non', 'off']) assert.equal(bac.drapeauBac(v), false, String(v));
  assert.equal(bac.drapeauOui('1'), true);
  assert.equal(bac.drapeauOui('peut-être'), false);
});

test('refuse la vraie base, sous toutes ses écritures', () => {
  const variantes = [
    bac.VRAIE_BASE,
    bac.VRAIE_BASE.replace(/\\/g, '/'),
    bac.VRAIE_BASE.toUpperCase(),
    path.join(COTEMASTER, '.', 'match-stats.db'),
    `${bac.RACINE_BAC}\\..\\match-stats.db`,
    `${bac.VRAIE_BASE}-wal`,
    `${bac.VRAIE_BASE}-shm`
  ];
  for (const p of variantes) {
    const v = bac.verifierBaseDuBac(p);
    assert.equal(v.ok, false, p);
    assert.match(v.raison, /VRAIE base/, p);
  }
});

test('refuse un chemin hors du bac', () => {
  const dehors = [
    path.join(COTEMASTER, 'autre.db'),
    path.join(COTEMASTER, 'sauvegardes', 'auto-2026-10-01.db'),
    `${bac.RACINE_BAC}-2\\base\\match-stats.db`, // même début de nom, autre dossier
    path.join(os.tmpdir(), 'copie.db'),
    bac.RACINE_BAC // le dossier lui-même
  ];
  for (const p of dehors) {
    const v = bac.verifierBaseDuBac(p);
    assert.equal(v.ok, false, p);
    assert.match(v.raison, /pas dans le bac/, p);
  }
  for (const vide of [undefined, '', '   ']) assert.equal(bac.verifierBaseDuBac(vide).ok, false);
});

test('accepte la copie du bac', () => {
  for (const p of [BASE_DU_BAC, BASE_DU_BAC.replace(/\\/g, '/'), path.join(bac.RACINE_BAC, 'pistes', 'essai', 'base', 'match-stats.db')]) {
    const v = bac.verifierBaseDuBac(p);
    assert.equal(v.ok, true, `${p} : ${v.raison}`);
  }
});

test('refuse une jonction ou un lien physique qui ramène à la vraie base', () => {
  const tmp = dossierTemporaire();
  const fauxCoteMaster = path.join(tmp, 'CoteMaster');
  const fausseVraie = path.join(fauxCoteMaster, 'match-stats.db');
  const fauxBac = path.join(tmp, 'bac');
  const jonction = path.join(fauxBac, 'base');
  fs.mkdirSync(fauxCoteMaster, { recursive: true });
  fs.writeFileSync(fausseVraie, 'vraie');
  fs.mkdirSync(fauxBac, { recursive: true });
  try {
    fs.symlinkSync(fauxCoteMaster, jonction, 'junction');
    const parJonction = bac.verifierBaseDuBac(path.join(jonction, 'match-stats.db'), { racineBac: fauxBac, vraieBase: fausseVraie });
    assert.equal(parJonction.ok, false);
    assert.match(parJonction.raison, /VRAIE base/);
    const sortie = bac.verifierBaseDuBac(path.join(jonction, 'autre.db'), { racineBac: fauxBac, vraieBase: fausseVraie });
    assert.equal(sortie.ok, false);
    assert.match(sortie.raison, /jonction ou un lien/);
    fs.linkSync(fausseVraie, path.join(fauxBac, 'dur.db'));
    const lienPhysique = bac.verifierBaseDuBac(path.join(fauxBac, 'dur.db'), { racineBac: fauxBac, vraieBase: fausseVraie });
    assert.equal(lienPhysique.ok, false);
    assert.match(lienPhysique.raison, /lien physique/);
  } finally {
    // La jonction d'abord, jamais de suppression récursive à travers elle.
    try {
      fs.rmdirSync(jonction);
    } catch {
      // pas créée
    }
    assert.equal(fs.readFileSync(fausseVraie, 'utf8'), 'vraie');
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('garde du démarrage : hors bac et sans drapeau, ne touche à rien', () => {
  const env = { ODDS_API_KEY: 'faux-pour-essai', AUTO_AI_ANALYSIS: 'true' };
  const r = bac.gardeDemarrage({ env, dossierCode: null, sortir: () => assert.fail('ne doit pas sortir'), journal: silencieux });
  assert.equal(r.actif, false);
  assert.deepEqual(env, { ODDS_API_KEY: 'faux-pour-essai', AUTO_AI_ANALYSIS: 'true' });
});

test('garde du démarrage : refus de la vraie base, du code hors bac, d\'une copie absente', () => {
  const codes = [];
  const sortir = (code) => codes.push(code);
  const tmp = dossierTemporaire();
  try {
    for (const vraie of [bac.VRAIE_BASE, bac.VRAIE_BASE.replace(/\\/g, '/').toLowerCase()]) {
      const r = bac.gardeDemarrage({ env: { CM_BAC_A_SABLE: '1', MATCH_STATS_DB: vraie }, dossierCode: bac.RACINE_BAC, sortir, journal: silencieux });
      assert.equal(r.refuse, true);
      assert.match(r.raison, /VRAIE base/);
    }
    const horsBac = bac.gardeDemarrage({ env: { CM_BAC_A_SABLE: '1', MATCH_STATS_DB: BASE_DU_BAC }, dossierCode: null, sortir, journal: silencieux });
    assert.match(horsBac.raison, /hors du bac/);
    const absente = bac.gardeDemarrage({ env: { CM_BAC_A_SABLE: '1', MATCH_STATS_DB: path.join(tmp, 'base', 'match-stats.db') }, dossierCode: tmp, sortir, journal: silencieux });
    assert.match(absente.raison, /n'existe pas/);
    assert.deepEqual(codes, [1, 1, 1, 1]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('garde du démarrage : copie du bac acceptée, environnement nettoyé', () => {
  const tmp = dossierTemporaire();
  try {
    const base = path.join(tmp, 'base', 'match-stats.db');
    fs.mkdirSync(path.dirname(base), { recursive: true });
    fs.writeFileSync(base, '');
    const env = {
      CM_BAC_A_SABLE: '1',
      MATCH_STATS_DB: base,
      ODDS_API_KEY: 'faux',
      API_FOOTBALL_KEY: 'faux',
      FOOTBALL_DATA_API_KEY: 'faux',
      SPORTMONKS_API_KEY: 'faux',
      APIFY_API_TOKEN: 'faux',
      ANTHROPIC_API_KEY: 'faux',
      CLAUDE_CODE_OAUTH_TOKEN: 'faux',
      UN_AUTRE_SERVICE_API_KEY: 'faux',
      AUTO_AI_ANALYSIS: 'true',
      MATCH_STATS_AUTO_REFRESH: 'true',
      FREE_ODDS: 'true'
    };
    const r = bac.gardeDemarrage({ env, dossierCode: tmp, sortir: () => assert.fail('ne doit pas sortir'), journal: silencieux });
    assert.equal(r.actif, true);
    assert.equal(r.refuse, undefined);
    for (const k of ['ODDS_API_KEY', 'API_FOOTBALL_KEY', 'FOOTBALL_DATA_API_KEY', 'SPORTMONKS_API_KEY', 'APIFY_API_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'UN_AUTRE_SERVICE_API_KEY']) {
      assert.equal(env[k], '', `${k} doit être vidée`);
      assert.ok(r.videes.includes(k), `${k} doit être comptée`);
    }
    assert.equal(env.AUTO_AI_ANALYSIS, 'false');
    assert.equal(env.MATCH_STATS_AUTO_REFRESH, 'false');
    assert.equal(env.FREE_ODDS, 'false');
    assert.ok(bac.estDans(env.CLAUDE_CODE_BIN, tmp) && !fs.existsSync(env.CLAUDE_CODE_BIN));
    // Rallumage explicite pour un essai.
    const essai = { CM_BAC_A_SABLE: '1', MATCH_STATS_DB: base, CM_BAC_ACTUALISATION: '1', CM_BAC_COTES_GRATUITES: 'oui' };
    bac.gardeDemarrage({ env: essai, dossierCode: tmp, sortir: () => assert.fail('ne doit pas sortir'), journal: silencieux });
    assert.equal(essai.MATCH_STATS_AUTO_REFRESH, 'true');
    assert.equal(essai.FREE_ODDS, 'true');
    assert.equal(essai.AUTO_AI_ANALYSIS, 'false');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('démarrage réel du garde-fou (sous-processus, sans serveur) : la vraie base est refusée', () => {
  const r = enfant(`await import(${JSON.stringify(url('src/config/demarrageBac.js'))}); console.log('APRES_LE_GARDE_FOU');`, {
    CM_BAC_A_SABLE: '1',
    MATCH_STATS_DB: bac.VRAIE_BASE
  });
  assert.equal(r.code, 1, r.sortie + r.erreurs);
  assert.match(r.erreurs, /DÉMARRAGE REFUSÉ/);
  assert.doesNotMatch(r.sortie, /APRES_LE_GARDE_FOU/);
});

test('démarrage réel du garde-fou sur la copie du bac : accepté, clés et IA coupées jusque dans env.js', { skip: !DANS_LE_BAC || !fs.existsSync(BASE_DU_BAC) ? 'seulement dans le bac préparé' : false }, () => {
  const code = `
    await import(${JSON.stringify(url('src/config/demarrageBac.js'))});
    const { env } = await import(${JSON.stringify(url('src/config/env.js'))});
    console.log('ETAT ' + JSON.stringify({
      cleOdds: Boolean(process.env.ODDS_API_KEY), jeton: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN),
      envOdds: Boolean(env.oddsApi.apiKey), envJeton: Boolean(env.claudeCode.oauthToken), envAnthropic: Boolean(env.anthropic.apiKey),
      ia: env.autoAiAnalysis.enabled, actualisation: env.matchStatsRefresh.enabled, cotes: env.freeOdds.enabled,
      base: process.env.MATCH_STATS_DB
    }));`;
  const r = enfant(code, { CM_BAC_A_SABLE: '1', MATCH_STATS_DB: BASE_DU_BAC.replace(/\\/g, '/'), ODDS_API_KEY: 'faux', CLAUDE_CODE_OAUTH_TOKEN: 'faux', ANTHROPIC_API_KEY: 'faux', AUTO_AI_ANALYSIS: 'true' });
  assert.equal(r.code, 0, r.sortie + r.erreurs);
  assert.match(r.sortie, /MODE BAC À SABLE/);
  const etat = JSON.parse(r.sortie.split('ETAT ')[1]);
  assert.deepEqual(
    { ...etat, base: path.resolve(etat.base) },
    { cleOdds: false, jeton: false, envOdds: false, envJeton: false, envAnthropic: false, ia: false, actualisation: false, cotes: false, base: path.resolve(BASE_DU_BAC) }
  );
});

test('resolveDbPath et openDb de la copie refusent ce qui sort du bac (aucune base ouverte)', () => {
  const tmp = dossierTemporaire();
  try {
    const horsBac = path.join(tmp, 'ne-doit-pas-exister.db');
    const code = `
      const m = await import(${JSON.stringify(url('src/data/db/matchStatsDb.js'))});
      const essai = (f) => { try { return 'ACCEPTE ' + f(); } catch (e) { return 'REFUSE ' + e.message; } };
      console.log(JSON.stringify({ resolve: essai(() => m.resolveDbPath()), open: essai(() => { m.openDb({ file: ${JSON.stringify(horsBac)} }); return 'ouverte'; }) }));`;
    const r = enfant(code, { CM_BAC_A_SABLE: '1', MATCH_STATS_DB: bac.VRAIE_BASE });
    assert.equal(r.code, 0, r.erreurs);
    const res = JSON.parse(r.sortie.trim().split(/\r?\n/).pop());
    assert.match(res.resolve, /^REFUSE .*VRAIE base/);
    assert.match(res.open, /^REFUSE .*pas dans le bac/);
    assert.equal(fs.existsSync(horsBac), false, 'openDb ne doit rien avoir créé');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('script lancé depuis la copie, sans drapeau ni MATCH_STATS_DB : la base du bac, jamais la vraie', { skip: DANS_LE_BAC ? false : 'seulement depuis la copie du bac' }, () => {
  const r = enfant(`const m = await import(${JSON.stringify(url('src/data/db/matchStatsDb.js'))}); console.log('CHEMIN ' + m.resolveDbPath());`);
  assert.equal(r.code, 0, r.erreurs);
  assert.equal(path.resolve(r.sortie.split('CHEMIN ')[1].trim()), path.resolve(BASE_DU_BAC));
});

test('appels IA refusés dans le bac, avant tout appel (Claude Code et API Anthropic)', () => {
  const code = `
    const cc = await import(${JSON.stringify(url('src/core/ai/claudeCodeClient.js'))});
    const an = await import(${JSON.stringify(url('src/core/ai/anthropicClient.js'))});
    const essai = async (f) => { try { await f(); return 'ABOUTI'; } catch (e) { return (e instanceof cc.ClaudeCodeIndisponible ? 'INDISPONIBLE ' : 'ERREUR ') + e.message; } };
    console.log(JSON.stringify({
      authentifie: cc.isClaudeCodeAuthenticated(),
      claude: await essai(() => cc.callClaudeCode({ system: 'essai', userMessage: 'essai', jsonSchema: { type: 'object' } })),
      anthropic: await essai(() => an.callAnthropicMessages({ apiKey: 'faux', model: 'x', system: 's', messages: [], maxTokens: 1 }))
    }));`;
  const r = enfant(code, { CM_BAC_A_SABLE: '1', MATCH_STATS_DB: BASE_DU_BAC, CLAUDE_CODE_OAUTH_TOKEN: 'faux', CLAUDE_CODE_BIN: path.join(os.tmpdir(), 'pas-de-claude-ici.exe') });
  assert.equal(r.code, 0, r.erreurs);
  const res = JSON.parse(r.sortie.trim().split(/\r?\n/).pop());
  assert.equal(res.authentifie, false, 'jeton vidé');
  assert.match(res.claude, /^INDISPONIBLE Bac à sable : analyses IA coupées/);
  assert.match(res.anthropic, /^ERREUR Bac à sable/);
});

test('autorisation comptée d\'analyses IA : prévue, pas branchée, et compte juste une fois branchée', () => {
  assert.equal(bac.IA_COMPTEE_BRANCHEE, false);
  const refus = bac.autorisationIaBac({ env: { CM_BAC_A_SABLE: '1', CM_BAC_IA_MAX: '12' } });
  assert.equal(refus.ok, false);
  assert.match(refus.raison, /étape 41/);
  const tmp = dossierTemporaire();
  try {
    const fichier = path.join(tmp, 'compteur-ia.json');
    const prendre = () => bac.autorisationIaBac({ env: { CM_BAC_A_SABLE: '1', CM_BAC_IA_MAX: '2' }, branchee: true, fichier });
    assert.deepEqual(prendre(), { ok: true, utilisees: 1, restantes: 1 });
    assert.deepEqual(prendre(), { ok: true, utilisees: 2, restantes: 0 });
    assert.match(prendre().raison, /épuisée/);
    assert.match(bac.compterAnalyseIa({ max: NaN, fichier }).raison, /CM_BAC_IA_MAX absent/);
    assert.equal(JSON.parse(fs.readFileSync(fichier, 'utf8')).utilisees, 2);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
