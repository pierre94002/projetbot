/**
 * controleCopie.js — contrôler une COPIE de la base, jamais la base vivante.
 * -----------------------------------------------------------------------
 * Étape 1 du plan CôteMaster. Utilisé par scripts/backup-db.mjs (la copie
 * VACUUM INTO, avant de la compresser) et scripts/restore-test-db.mjs (la
 * copie restaurée). La copie est ouverte en LECTURE SEULE ; SQLite peut
 * poser des annexes -wal/-shm à côté d'elle, retirées ensuite — celles de la
 * copie, jamais celles de la vraie base : les deux fonctions refusent la
 * base de l'appli (et ses annexes) avant tout accès.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { VRAIE_BASE, cheminReel } from '../../config/bacASable.js';
import { resolveDbPath } from '../db/matchStatsDb.js';
import { avecReprise } from './fichiersSauvegarde.js';

const cle = (p) => (process.platform === 'win32' ? cheminReel(p).toLowerCase() : cheminReel(p));

/** Refuse la base vivante (celle de ce processus, et celle de l'appli) et ses annexes. */
export function assertPasLaBaseVivante(fichier) {
  const vivantes = [VRAIE_BASE];
  try {
    vivantes.push(resolveDbPath());
  } catch {
    // bac à sable mal réglé : la vraie base reste refusée
  }
  const f = cle(fichier);
  for (const base of vivantes) {
    for (const annexe of ['', '-wal', '-shm', '-journal']) {
      if (f === cle(`${base}${annexe}`)) throw new Error(`Refus : ${fichier} est la base vivante (ou son journal), pas une copie.`);
    }
  }
}

/**
 * Contrôle d'une copie : quick_check (ou integrity_check, `complet`), nombre
 * de rencontres, dernière date, tables et index. Rend
 * { resultat: 'ok' | 'messages…', lignes, rencontres, derniereDate, tables, index: [noms] }.
 */
export function controlerCopie(fichier, { complet = false } = {}) {
  assertPasLaBaseVivante(fichier);
  const db = new DatabaseSync(fichier, { readOnly: true });
  try {
    const lignes = db
      .prepare(complet ? 'PRAGMA integrity_check' : 'PRAGMA quick_check')
      .all()
      .map((r) => String(Object.values(r)[0]));
    const resultat = lignes.length === 1 && lignes[0] === 'ok' ? 'ok' : lignes.slice(0, 10).join(' | ').slice(0, 1000);
    const rencontres = db.prepare('SELECT COUNT(*) AS n FROM matches').get().n;
    const derniereDate = db.prepare('SELECT MAX(date) AS d FROM matches').get().d ?? null;
    const objets = db.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'").all();
    const enTete = Buffer.alloc(20);
    const fd = fs.openSync(fichier, 'r');
    try {
      fs.readSync(fd, enTete, 0, 20, 0);
    } finally {
      fs.closeSync(fd);
    }
    return {
      resultat,
      lignes: lignes.length,
      controle: complet ? 'integrity_check' : 'quick_check',
      rencontres: Number(rencontres),
      derniereDate,
      tables: objets.filter((o) => o.type === 'table').length,
      index: objets.filter((o) => o.type === 'index').map((o) => o.name).sort(),
      // Octets 18-19 de l'en-tête : 1 = journal classique, 2 = WAL.
      modeJournal: enTete[18] === 2 ? 'wal' : 'classique'
    };
  } finally {
    db.close();
  }
}

/** Retire les annexes qu'une ouverture a pu poser à côté d'une COPIE. */
export function retirerAnnexes(fichier) {
  assertPasLaBaseVivante(fichier);
  for (const annexe of ['-wal', '-shm', '-journal']) {
    const abs = `${fichier}${annexe}`;
    if (fs.existsSync(abs)) avecReprise(() => fs.rmSync(abs, { force: true }));
  }
}
