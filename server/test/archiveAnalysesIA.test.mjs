// Archive jour par jour des analyses de l'IA (server/scripts/archiver-analyses-ia.mjs) : le fichier de l'appli n'est
// jamais modifié, les jours sont ceux de Paris, rien ne se perd, seuls les jours changés sont réécrits, et le fichier
// complet se reconstitue. Tout se passe dans un dossier temporaire, avec des analyses FABRIQUÉES.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ranger, jourDeLAnalyse } from '../scripts/archiver-analyses-ia.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/archiver-analyses-ia.mjs');
const sha1 = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');

function analyse(matchId, commenceTime, extra = {}) {
  return { matchId, homeName: `Dom ${matchId}`, awayName: `Ext ${matchId}`, league: 'Essai', commenceTime, analysis: { texte: `analyse ${matchId}` }, createdAt: '2026-11-01T10:00:00.000Z', ...extra };
}

function chantier(analyses) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-archive-ia-'));
  const source = path.join(dir, 'match-ai-analyses.json');
  fs.writeFileSync(source, JSON.stringify(analyses, null, 2));
  return { dir, source, dossier: path.join(dir, 'archives') };
}

const lancer = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const lire = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

const FABRIQUEES = [
  analyse('3', '2026-11-02T23:30:00.000Z'), // 00 h 30 à Paris : le 03/11
  analyse('1', '2026-11-02T22:59:00.000Z'), // 23 h 59 à Paris : le 02/11
  analyse('2', '2026-11-02T15:00:00.000Z'),
  analyse('4', '2026-07-15T22:30:00.000Z'), // heure d'été (UTC + 2) : le 16/07 à 0 h 30
  analyse('5', null, { analysedAt: '2026-10-20T08:00:00.000Z' }), // pas de coup d'envoi : la date de l'analyse
  analyse('6', 'pas une date', { createdAt: 'non plus' }), // aucune date lisible
];

test('les jours sont ceux de Paris (heure d’hiver et d’été) ; à défaut la date de l’analyse ; sinon « sans-date »', () => {
  assert.equal(jourDeLAnalyse(FABRIQUEES[0]), '2026-11-03');
  assert.equal(jourDeLAnalyse(FABRIQUEES[1]), '2026-11-02');
  assert.equal(jourDeLAnalyse(FABRIQUEES[3]), '2026-07-16');
  assert.equal(jourDeLAnalyse(FABRIQUEES[4]), '2026-10-20');
  assert.equal(jourDeLAnalyse(FABRIQUEES[5]), 'sans-date');
});

test('ranger : un fichier par jour, trié par coup d’envoi puis identifiant, au format de l’appli ; le fichier de l’appli intact ; une deuxième fois, rien n’est réécrit', () => {
  const { dir, source, dossier } = chantier(FABRIQUEES);
  try {
    const avant = sha1(source);
    const b = ranger({ source, dossier });
    assert.equal(sha1(source), avant, 'le fichier de l’appli n’est jamais modifié');
    assert.deepEqual(fs.readdirSync(dossier).sort(), ['2026-07-16.json', '2026-10-20.json', '2026-11-02.json', '2026-11-03.json', 'sans-date.json']);
    assert.equal(b.analyses, 6);
    assert.equal(b.ecrits.length, 5);
    const jour = path.join(dossier, '2026-11-02.json');
    assert.deepEqual(lire(jour).map((a) => a.matchId), ['2', '1'], 'trié par coup d’envoi');
    assert.equal(fs.readFileSync(jour, 'utf8'), JSON.stringify(lire(jour), null, 2), 'même texte que writeJsonAtomic');
    assert.deepEqual(lire(jour)[0], FABRIQUEES[2], 'l’analyse recopiée telle quelle');
    const dates = fs.readdirSync(dossier).map((f) => fs.statSync(path.join(dossier, f)).mtimeMs);
    const b2 = ranger({ source, dossier });
    assert.equal(b2.ecrits.length, 0);
    assert.equal(b2.inchanges, 5);
    assert.deepEqual(fs.readdirSync(dossier).map((f) => fs.statSync(path.join(dossier, f)).mtimeMs), dates, 'aucun fichier touché');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('une analyse changée et une nouvelle : seuls leurs jours sont réécrits ; une analyse disparue du fichier de l’appli reste dans son jour ; aucun jour supprimé', () => {
  const { dir, source, dossier } = chantier(FABRIQUEES);
  try {
    ranger({ source, dossier });
    const juillet = fs.statSync(path.join(dossier, '2026-07-16.json')).mtimeMs;
    const suite = FABRIQUEES.filter((a) => a.matchId !== '1').map((a) => (a.matchId === '3' ? { ...a, analysis: { texte: 'après le match' } } : a));
    suite.push(analyse('7', '2026-11-03T19:00:00.000Z'));
    fs.writeFileSync(source, JSON.stringify(suite, null, 2));
    const b = ranger({ source, dossier });
    assert.deepEqual(b.ecrits.map((e) => e.jour), ['2026-11-03'], 'seul le jour du 03/11 change (le 02/11 garde l’analyse 1)');
    assert.equal(b.gardees, 1, 'l’analyse 1, absente du fichier, est gardée');
    assert.deepEqual(lire(path.join(dossier, '2026-11-02.json')).map((a) => a.matchId), ['2', '1']);
    const trois = lire(path.join(dossier, '2026-11-03.json'));
    assert.deepEqual(trois.map((a) => a.matchId), ['3', '7']);
    assert.equal(trois[0].analysis.texte, 'après le match', 'la version du fichier de l’appli remplace l’ancienne');
    assert.equal(fs.statSync(path.join(dossier, '2026-07-16.json')).mtimeMs, juillet);
    assert.equal(fs.readdirSync(dossier).length, 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--verifier n’écrit rien ; --reconstituer refait la liste complète (gardées comprises) et refuse le fichier de l’appli', () => {
  const { dir, source, dossier } = chantier(FABRIQUEES);
  try {
    const v = lancer('--source', source, '--dossier', dossier, '--verifier');
    assert.equal(v.status, 0, v.stderr);
    assert.match(v.stdout, /VÉRIFICATION/);
    assert.equal(fs.existsSync(dossier), false, 'rien d’écrit');
    assert.equal(lancer('--source', source, '--dossier', dossier).status, 0);
    fs.writeFileSync(source, JSON.stringify(FABRIQUEES.slice(1), null, 2)); // l’analyse 3 disparaît du fichier
    assert.equal(lancer('--source', source, '--dossier', dossier).status, 0);
    const sortie = path.join(dir, 'refait.json');
    const r = lancer('--source', source, '--dossier', dossier, '--reconstituer', sortie);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(lire(sortie).map((a) => a.matchId).sort(), ['1', '2', '3', '4', '5', '6'], 'rien ne se perd');
    const avant = sha1(source);
    const refus = lancer('--source', source, '--dossier', dossier, '--reconstituer', source);
    assert.equal(refus.status, 1);
    assert.match(refus.stderr, /jamais le fichier/);
    assert.equal(sha1(source), avant);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('refus sans rien écrire : fichier absent, fichier qui n’est pas une liste, analyse sans identifiant, option inconnue', () => {
  const { dir, source, dossier } = chantier(FABRIQUEES);
  try {
    assert.equal(lancer('--source', path.join(dir, 'absent.json'), '--dossier', dossier).status, 1);
    fs.writeFileSync(source, JSON.stringify({ pas: 'une liste' }));
    assert.equal(lancer('--source', source, '--dossier', dossier).status, 1);
    fs.writeFileSync(source, JSON.stringify([analyse('1', '2026-11-02T15:00:00.000Z'), { commenceTime: '2026-11-02T15:00:00.000Z' }]));
    const r = lancer('--source', source, '--dossier', dossier);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /sans identifiant/);
    assert.equal(lancer('--source', source, '--dossier', dossier, '--tout').status, 1);
    assert.equal(fs.existsSync(dossier), false, 'aucune archive écrite');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
