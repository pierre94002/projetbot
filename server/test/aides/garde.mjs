/**
 * Garde des sous-processus de test — préchargée par `node --import` dans tout
 * processus qui exécute le code du serveur sur une copie de travail (cf.
 * isolement.mjs). Ce n'est PAS un fichier de test.
 *
 *  1. AUCUN APPEL RÉSEAU : fetch, http(s), net, tls et dns lèvent une erreur
 *     (« Appel réseau interdit dans les tests »), notée sur la sortie
 *     d'erreur. Ni FotMob, ni API payante, ni Claude.
 *  2. HEURE FIGÉE : avec CM_TEST_MAINTENANT, `new Date()` et `Date.now()`
 *     rendent toujours cet instant — un calcul qui dépendrait du jour où le
 *     test tourne donnerait sinon des pronostics différents chaque jour.
 *  3. BASE : refus immédiat si MATCH_STATS_DB manque, n'est pas dans le
 *     dossier de la copie (CM_TEST_DOSSIER) ou désigne la vraie base.
 *  4. PAQUETS npm : la copie n'a pas de node_modules (jamais de jonction
 *     dans un dossier qu'on supprime ensuite) ; un paquet introuvable depuis
 *     la copie (dotenv…) est résolu depuis le serveur d'origine
 *     (CM_TEST_MODULES), en lecture seule.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { pathToFileURL } from 'node:url';

// --------------------------------------------------------------- 3. base
const VRAIE_BASE = path.join(os.homedir(), 'CoteMaster', 'match-stats.db');
const cle = (p) => path.resolve(p).toLowerCase();
const dossierCopie = process.env.CM_TEST_DOSSIER;
const base = process.env.MATCH_STATS_DB;
const refus = (raison) => {
  process.stderr.write(`[tests] REFUS : ${raison}\n`);
  process.exit(3);
};
if (!dossierCopie || !base) refus('CM_TEST_DOSSIER et MATCH_STATS_DB sont obligatoires.');
for (const suffixe of ['', '-wal', '-shm', '-journal']) {
  if (cle(base) === cle(VRAIE_BASE + suffixe)) refus(`${base} est la vraie base.`);
}
if (!cle(base).startsWith(cle(dossierCopie) + path.sep)) refus(`${base} n'est pas dans la copie de travail ${dossierCopie}.`);
try {
  // Un lien physique ou une jonction qui ramènerait à la vraie base.
  const a = fs.statSync(base, { bigint: true });
  const b = fs.statSync(VRAIE_BASE, { bigint: true });
  if (a.ino !== 0n && a.ino === b.ino && a.dev === b.dev) refus(`${base} est un autre nom de la vraie base.`);
} catch {
  // l'un des deux n'existe pas : rien à comparer
}

// ------------------------------------------------------------ 1. réseau
const tentatives = [];
function interdit(quoi) {
  return function appelInterdit(...args) {
    const cible = typeof args[0] === 'string' ? args[0] : args[0]?.href ?? args[0]?.host ?? args[0]?.hostname ?? '';
    const message = `Appel réseau interdit dans les tests (${quoi}${cible ? ` ${cible}` : ''})`;
    tentatives.push(message);
    process.stderr.write(`[tests] ${message}\n`);
    throw new Error(message);
  };
}
globalThis.fetch = async (...args) => interdit('fetch')(...args);
http.request = interdit('http.request');
http.get = interdit('http.get');
https.request = interdit('https.request');
https.get = interdit('https.get');
net.connect = interdit('net.connect');
net.createConnection = interdit('net.createConnection');
tls.connect = interdit('tls.connect');
dns.lookup = interdit('dns.lookup');
dns.resolve = interdit('dns.resolve');
dns.promises.lookup = async (...args) => interdit('dns.promises.lookup')(...args);
syncBuiltinESMExports();
process.on('exit', () => {
  if (tentatives.length) process.stderr.write(`[tests] ${tentatives.length} tentative(s) réseau bloquée(s)\n`);
});

// ------------------------------------------------------------ 2. heure
const fige = Date.parse(process.env.CM_TEST_MAINTENANT ?? '');
if (Number.isFinite(fige)) {
  const DateReelle = globalThis.Date;
  class DateFigee extends DateReelle {
    constructor(...args) {
      if (args.length === 0) super(fige);
      else super(...args);
    }
    static now() {
      return fige;
    }
  }
  globalThis.Date = DateFigee;
}

// ----------------------------------------------------------- 4. paquets
const origine = process.env.CM_TEST_MODULES;
if (origine) {
  const parent = pathToFileURL(path.join(origine, 'package.json')).href;
  const nu = (s) => !/^(\.|\/|\\|[a-z][a-z0-9+.-]*:)/i.test(s);
  registerHooks({
    resolve(specifier, context, nextResolve) {
      try {
        return nextResolve(specifier, context);
      } catch (error) {
        if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !nu(specifier)) throw error;
        return nextResolve(specifier, { ...context, parentURL: parent });
      }
    }
  });
}
