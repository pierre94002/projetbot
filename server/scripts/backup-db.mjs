#!/usr/bin/env node
/**
 * backup-db.mjs — sauvegarde automatique et tournante de la base.
 * -----------------------------------------------------------------------
 * Écrit une copie cohérente de la base (VACUUM INTO, instantané pris dans
 * une transaction de lecture) dans %USERPROFILE%\CoteMaster\sauvegardes,
 * sous le nom auto-AAAA-MM-JJ.db, et ne garde que les `--keep` plus
 * récentes de CES copies automatiques. Les sauvegardes faites à la main
 * (tout autre nom) ne sont jamais touchées.
 *
 * Lancé une fois par semaine par l'actualisation de l'appli, dans un
 * processus à part : la copie de 1,6 Go prend une à deux minutes, que le
 * serveur ne doit pas passer bloqué. La base est ouverte en LECTURE SEULE.
 *
 * Refuse de copier s'il ne reste pas deux fois la taille de la base plus
 * 2 Go de libre sur le disque.
 *
 * Sortie : une ligne JSON sur stdout.
 *   node scripts/backup-db.mjs [--keep 2] [--dir <dossier>]
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveDbPath } from '../src/data/db/matchStatsDb.js';

const args = process.argv.slice(2);
const valeur = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] ? args[i + 1] : defaut;
};

const base = resolveDbPath();
const dossier = path.resolve(valeur('--dir', path.join(path.dirname(base), 'sauvegardes')));
const garder = Math.max(1, Number(valeur('--keep', 2)) || 2);
const PREFIXE = 'auto-';
// Nom EXACT d'une copie automatique : une copie faite à la main à partir
// d'elle (« auto-2026-09-24 - Copie.db ») n'y répond pas et n'est jamais
// supprimée.
const NOM_AUTO = /^auto-\d{4}-\d{2}-\d{2}\.db$/;

const taille = fs.statSync(base).size;
fs.mkdirSync(dossier, { recursive: true });
const libre = (() => {
  try {
    const s = fs.statfsSync(dossier);
    return s.bavail * s.bsize;
  } catch {
    return null;
  }
})();
const requis = 2 * taille + 2 * 1024 ** 3;
if (libre !== null && libre < requis) {
  console.log(JSON.stringify({ ok: false, reason: 'espace disque insuffisant', freeBytes: libre, requiredBytes: requis }));
  process.exit(0);
}

const jour = new Date().toISOString().slice(0, 10);
const cible = path.join(dossier, `${PREFIXE}${jour}.db`);
const temporaire = `${cible}.en-cours`;
const debut = Date.now();
fs.rmSync(temporaire, { force: true });
const db = new DatabaseSync(base, { readOnly: true });
try {
  db.prepare('VACUUM INTO ?').run(temporaire);
} finally {
  db.close();
}
// Contrôle rapide de la copie avant de la garder.
const copie = new DatabaseSync(temporaire, { readOnly: true });
let controle;
try {
  controle = copie.prepare('PRAGMA quick_check').get();
  const n = copie.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
  controle = { quickCheck: Object.values(controle)[0], matches: n };
} finally {
  copie.close();
}
if (controle.quickCheck !== 'ok') {
  fs.rmSync(temporaire, { force: true });
  console.log(JSON.stringify({ ok: false, reason: `copie invalide : ${controle.quickCheck}` }));
  process.exit(1);
}
// Le renommage remplace d'un bloc une copie du même jour : jamais de
// moment sans copie valide.
fs.renameSync(temporaire, cible);

// Rotation : seulement les copies automatiques, les plus anciennes d'abord.
const automatiques = fs
  .readdirSync(dossier)
  .filter((f) => NOM_AUTO.test(f))
  .sort()
  .reverse();
const supprimees = [];
for (const f of automatiques.slice(garder)) {
  fs.rmSync(path.join(dossier, f), { force: true });
  supprimees.push(f);
}

console.log(JSON.stringify({
  ok: true,
  file: cible,
  bytes: fs.statSync(cible).size,
  matches: controle.matches,
  durationMs: Date.now() - debut,
  kept: automatiques.slice(0, garder),
  removed: supprimees
}));
