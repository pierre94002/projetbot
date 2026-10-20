/**
 * La base d'essai et les garde-fous des tests (étape 3 du plan).
 *   node --test test/echantillon.test.mjs        (depuis server/)
 *
 *  - test/fixtures/echantillon.db : petite (quelques Mo), saine, conforme à
 *    son manifeste, variée (compétitions, coupe et prolongations, xG ou non,
 *    cotes ou non, joueurs), et SANS secret ni donnée personnelle : seules des
 *    tables du magasin y sont remplies, aucune trace d'une clé ou d'un jeton ;
 *  - elle n'est jamais modifiée par les tests (ouverte ici en lecture seule,
 *    les autres tests travaillent sur des copies) ;
 *  - la garde des sous-processus refuse la vraie base et coupe le réseau.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ECHANTILLON, MANIFESTE_ECHANTILLON, SERVEUR, RACINE_ESSAIS, sha1Fichier } from './aides/isolement.mjs';
import { TABLES_RECOPIEES } from '../scripts/test-echantillon.mjs';
import * as bac from '../src/config/bacASable.js';

const AVANT = sha1Fichier(ECHANTILLON);
const manifeste = JSON.parse(fs.readFileSync(MANIFESTE_ECHANTILLON, 'utf8'));

function ouvrir() {
  return new DatabaseSync(ECHANTILLON, { readOnly: true });
}

test("base d'essai : petite, saine, conforme à son manifeste", () => {
  const octets = fs.statSync(ECHANTILLON).size;
  assert.ok(octets < 8 * 1024 * 1024, `${(octets / 1048576).toFixed(1)} Mo`);
  assert.equal(octets, manifeste.octets);
  assert.equal(AVANT, manifeste.sha1, 'base différente de celle que décrit echantillon.json');
  const db = ouvrir();
  try {
    assert.equal(Object.values(db.prepare('PRAGMA quick_check').get())[0], 'ok');
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'delete', 'un seul fichier, sans journal WAL');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM matches').get().n, manifeste.comptes.rencontres);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM players').get().n, manifeste.comptes.players);
    const cibles = manifeste.cibles.map((c) => c.cle);
    const presentes = db.prepare(`SELECT COUNT(*) n FROM matches WHERE match_key IN (${cibles.map(() => '?').join(',')}) AND home_goals IS NOT NULL`).get(...cibles).n;
    assert.equal(presentes, cibles.length, 'chaque cible est un match joué de la base');
  } finally {
    db.close();
  }
});

test("base d'essai : variée comme demandé", () => {
  const v = manifeste.variete;
  assert.ok(manifeste.cibles.length >= 190 && manifeste.cibles.length <= 230, `${manifeste.cibles.length} cibles`);
  assert.ok(v.competitions >= 12, `${v.competitions} compétitions`);
  assert.ok(v.avecXg >= 50 && v.sansXg >= 30, `xG : ${v.avecXg} avec, ${v.sansXg} sans`);
  assert.ok(v.avecCotes >= 100 && v.sansCotes >= 20, `cotes : ${v.avecCotes} avec, ${v.sansCotes} sans`);
  assert.ok(v.avecJoueurs >= 50, `${v.avecJoueurs} matchs avec joueurs`);
  assert.ok(v.prolongations >= 1 && v.tirsAuBut >= 5, `coupes : ${v.prolongations} prolongations, ${v.tirsAuBut} tirs au but`);
  const coupes = new Set(manifeste.cibles.filter((c) => c.fin).map((c) => c.league));
  assert.ok(coupes.has('EFL Cup') && coupes.has('DFB Pokal - Germany'));
});

test("base d'essai : aucune donnée hors magasin, aucun secret", () => {
  const db = ouvrir();
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    const remplies = tables.filter((t) => db.prepare(`SELECT EXISTS (SELECT 1 FROM "${t}") e`).get().e);
    assert.deepEqual(remplies.filter((t) => !TABLES_RECOPIEES.includes(t)), [], 'table remplie hors de la liste');
    // Aucune table des journaux de l'appli (paris, pronostics, analyses IA, réglages) : ils vivent en JSON, jamais ici.
    assert.ok(!tables.some((t) => /bet|pari|prediction|pronostic|analys|config|token|secret/i.test(t)), tables.join(', '));
    // Toutes les valeurs texte, colonne par colonne : rien qui ressemble à une clé ou un jeton.
    const motifs = [/sk-ant-/i, /api[_-]?key/i, /api_token/i, /[?&](key|token|apikey|access_token)=/i, /bearer\s+[a-z0-9]/i, /oauth/i, /password|mot de passe/i, /CLAUDE_CODE|ANTHROPIC_/];
    let valeurs = 0;
    for (const t of remplies) {
      for (const { name: c, type } of db.prepare('SELECT name, type FROM pragma_table_info(?)').all(t)) {
        if (!/TEXT|^$/i.test(type)) continue;
        for (const r of db.prepare(`SELECT "${c}" AS v FROM "${t}" WHERE "${c}" IS NOT NULL`).iterate()) {
          valeurs++;
          const s = String(r.v);
          for (const m of motifs) assert.ok(!m.test(s), `${t}.${c} contient ${m} : ${s.slice(0, 120)}`);
        }
      }
    }
    assert.ok(valeurs > 10_000, `${valeurs} valeurs lues`);
  } finally {
    db.close();
  }
});

// ------------------------------------------------------------ garde-fous

const GARDE = pathToFileURL(path.join(SERVEUR, 'test', 'aides', 'garde.mjs')).href;
function sousProcessus(code, env) {
  const propre = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CM_|MATCH_STATS_DB$|NODE_TEST)/.test(k)));
  return spawnSync(process.execPath, ['--import', GARDE, '--input-type=module', '-e', code], { env: { ...propre, ...env }, encoding: 'utf8', timeout: 30_000 });
}

test('garde des sous-processus : la vraie base est refusée avant toute ligne de code', () => {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-garde-'));
  try {
    for (const base of [bac.VRAIE_BASE, bac.VRAIE_BASE.replace(/\\/g, '/').toUpperCase(), `${bac.VRAIE_BASE}-wal`]) {
      const r = sousProcessus("console.log('APRES_LA_GARDE')", { CM_TEST_DOSSIER: tmp, MATCH_STATS_DB: base });
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(r.stderr, /REFUS/);
      assert.doesNotMatch(r.stdout, /APRES_LA_GARDE/);
    }
    // Une base hors de la copie de travail : refusée aussi.
    const dehors = sousProcessus("console.log('APRES_LA_GARDE')", { CM_TEST_DOSSIER: tmp, MATCH_STATS_DB: path.join(os.tmpdir(), 'autre.db') });
    assert.equal(dehors.status, 3);
    // Sans base désignée : refus.
    assert.equal(sousProcessus("console.log('x')", { CM_TEST_DOSSIER: tmp }).status, 3);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// Cibles qui n'atteignent rien même si la garde cassait : domaine .invalid (jamais résolu), port 9 local (rien n'y écoute).
test('garde des sous-processus : aucun appel réseau ne part, heure figée', () => {
  fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-garde-'));
  try {
    const code = `
      const essais = {};
      const essai = async (nom, f) => { try { await f(); essais[nom] = 'PARTI'; } catch (e) { essais[nom] = /Appel réseau interdit/.test(e.message) ? 'BLOQUE' : 'AUTRE ' + e.message; } };
      await essai('fetch', () => fetch('https://cotemaster.invalid/api/data/matches?date=20261005'));
      const https = await import('node:https');
      await essai('https', () => new Promise((ok, ko) => https.get('https://cotemaster.invalid/v4/sports', ok).on('error', ko)));
      const { request } = await import('node:http');
      await essai('http', () => request('http://127.0.0.1:9/'));
      const net = await import('node:net');
      await essai('net', () => net.connect(9, '127.0.0.1'));
      console.log('RES ' + JSON.stringify({ essais, maintenant: new Date().toISOString(), now: Date.now(), parse: new Date('2026-01-01T00:00:00Z').toISOString() }));`;
    const r = sousProcessus(code, { CM_TEST_DOSSIER: tmp, MATCH_STATS_DB: path.join(tmp, 'base', 'match-stats.db'), CM_TEST_MAINTENANT: '2026-10-05T12:00:00.000Z' });
    assert.equal(r.status, 0, r.stderr);
    const res = JSON.parse(r.stdout.split('RES ')[1]);
    assert.deepEqual(res.essais, { fetch: 'BLOQUE', https: 'BLOQUE', http: 'BLOQUE', net: 'BLOQUE' });
    assert.equal(res.maintenant, '2026-10-05T12:00:00.000Z');
    assert.equal(res.now, Date.parse('2026-10-05T12:00:00.000Z'));
    assert.equal(res.parse, '2026-01-01T00:00:00.000Z', 'une date explicite reste elle-même');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("la base d'essai n'est jamais modifiée par les tests (ni journal à côté)", () => {
  // Cette vérification passe en dernier dans ce fichier ; les autres fichiers
  // de test nettoient chacun leurs copies (isolement.mjs).
  assert.equal(sha1Fichier(ECHANTILLON), AVANT);
  for (const suffixe of ['-wal', '-shm', '-journal']) assert.equal(fs.existsSync(ECHANTILLON + suffixe), false, `${suffixe} à côté de la base d'essai`);
});
