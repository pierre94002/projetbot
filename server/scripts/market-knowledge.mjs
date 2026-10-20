#!/usr/bin/env node
/**
 * market-knowledge.mjs — CONNAÎTRE LE MARCHÉ (étape 22 du plan), dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * La passe de nuit de l'étape « connaitreMarche » (src/data/marketKnowledge.js, connaitreLeMarche) sur la
 * base du bac : la justesse, la vitesse, les biais et la marge de chaque bookmaker, le meilleur moment pour
 * parier de chaque championnat et la référence du 23/09, calculés dans un PROCESSUS À PART (base en lecture
 * seule), puis rangés ici dans market_knowledge_runs / market_knowledge — la mesure de ce que fera la
 * première nuit chez Pierre. Chez Pierre, le même code tourne DANS le serveur (l'actualisation) : un seul
 * écrivain.
 *
 *   node scripts/market-knowledge.mjs [--nuit] [--sur-place] [--tirages N] [--graine N] [--json]
 *
 * Par défaut, le calcul est refait même si rien n'a bougé ; --nuit : exactement l'étape de la passe (rien
 * si l'empreinte des sources n'a pas bougé depuis le dernier calcul fini). --sur-place : le calcul dans ce
 * processus, en rendant la main toutes les ~25 ms (la mesure de ce que coûterait le calcul DANS le serveur).
 *
 * REFUS : sous OneDrive, hors du bac à sable, sur la vraie base, base ouverte par un autre processus (un
 * serveur du bac tourne), verrou d'actualisation tenu. Sortie : le résumé sur stderr, une ligne JSON de
 * bilan sur stdout (durées, mémoire de ce processus et de l'enfant, plus long blocage, -wal, résumé).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE } from '../src/config/bacASable.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { connaitreLeMarche, phrasesDuResume } from '../src/data/marketKnowledge.js';
import { baseOccupee } from './sandbox-commun.mjs';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const valeur = (option) => {
  const i = argv.indexOf(option);
  return i >= 0 ? argv[i + 1] : undefined;
};
const seulementJson = argv.includes('--json');
const mo = (o) => (o === null || o === undefined ? '?' : `${(o / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const dire = (texte) => {
  if (!seulementJson) process.stderr.write(`${texte}\n`);
};
function refuser(raison) {
  process.stderr.write(`[connaître le marché] REFUS : ${raison}\n`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}

// ------------------------------------------------------------ garde-fous
if (/[\\/]onedrive[^\\/]*([\\/]|$)/i.test(SERVEUR)) refuser(`à lancer depuis la copie du bac (bac-a-sable\\code\\server), jamais sous OneDrive (${SERVEUR}). Dans l'appli, le calcul tourne dans l'actualisation du serveur.`);
if (!modeBacASable()) refuser("ce script sert au bac à sable ; dans l'appli, le calcul tourne dans l'actualisation du serveur.");
const base = resolveDbPath();
const v = verifierBaseDuBac(base);
if (!v.ok) refuser(`base refusée : ${v.raison}`);
if (base.toLowerCase() === VRAIE_BASE.toLowerCase()) refuser("c'est la vraie base.");
if (!fs.existsSync(base)) refuser(`la copie de la base n'existe pas (${base}).`);
if (baseOccupee(base)) refuser(`la base ${base} est ouverte par un autre processus (un serveur du bac tourne ?) : on n'écrit jamais pendant qu'un serveur tourne.`);
const detenteur = lockHolder();
if (detenteur && !detenteur.self) refuser(`le verrou d'actualisation est tenu par le processus ${detenteur.pid} depuis ${detenteur.startedAt} : une passe ou un serveur écrit, rien fait.`);

const options = {};
if (valeur('--graine') !== undefined) options.graine = Number(valeur('--graine'));
if (valeur('--tirages') !== undefined) options.tirages = Number(valeur('--tirages'));
const surPlace = argv.includes('--sur-place');
const nuit = argv.includes('--nuit');

const taille = (f) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return null;
  }
};
const walAvant = taille(`${base}-wal`);
dire(`[connaître le marché] base : ${base} (${mo(taille(base))}, -wal ${mo(walAvant ?? 0)})`);
const database = openDb();
const rssDepart = process.memoryUsage.rss();
const debut = performance.now();
let walMax = walAvant ?? 0;
const memoireMax = { rss: 0, tas: 0, tableaux: 0 };
const veille = setInterval(() => {
  const m = process.memoryUsage();
  memoireMax.rss = Math.max(memoireMax.rss, m.rss);
  memoireMax.tas = Math.max(memoireMax.tas, m.heapUsed);
  memoireMax.tableaux = Math.max(memoireMax.tableaux, m.arrayBuffers);
  walMax = Math.max(walMax, taille(`${base}-wal`) ?? 0);
}, 2000);
veille.unref?.();
// Le retard de la boucle d'événements de CE processus (le serveur, chez Pierre) : un battement toutes les 50 ms.
let retardMaxMs = 0;
let attendu = performance.now() + 50;
const coeur = setInterval(() => {
  const maintenant = performance.now();
  retardMaxMs = Math.max(retardMaxMs, maintenant - attendu);
  attendu = maintenant + 50;
}, 50);
coeur.unref?.();

const resultat = await withRefreshLock(() => connaitreLeMarche({ database, chemin: base, ou: 'bac', force: !nuit, aPart: !surPlace, options }), { stamp: false, nom: 'connaitre-le-marche' });
clearInterval(veille);
clearInterval(coeur);
if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
const dureeTotaleMs = Math.round(performance.now() - debut);
const rssFin = process.memoryUsage.rss();
closeDb();
const r = resultat;
if (r.mode === 'echec') dire(`ERREUR : ${r.erreur}`);
else if (r.mode === 'rien') dire(`Rien à refaire : les sources n'ont pas bougé depuis le calcul n° ${r.calcul} (${r.dureeMs} ms).`);
else {
  const b = r.bilanDuCalcul ?? {};
  dire(`Calcul n° ${r.calcul} (${r.mode}) : ${r.lignes} lignes rangées en ${Math.round(dureeTotaleMs / 100) / 10} s ; calcul ${Math.round((b.dureeMs ?? 0) / 100) / 10} s, par partie (ms) : ${JSON.stringify(b.parties)} ; rangement ${r.rangementMs} ms.`);
  dire(`Relevés : ${JSON.stringify(b.releves)} ; comptes : ${JSON.stringify(b.comptes)}.`);
  dire(surPlace ? `Sur place : le plus long moment sans rendre la main ${b.blocMaxMs ?? r.blocMaxMs} ms.` : `Calcul à part : RSS de l'enfant ${mo(b.rssMax)} au plus haut ; ce processus (le serveur, chez Pierre) n'a jamais été tenu plus de ${Math.round(retardMaxMs)} ms d'affilée (rangement : ${r.blocMaxMs} ms au plus sans rendre la main).`);
  for (const p of phrasesDuResume(r.resume ?? {})) dire(`- ${p}`);
}
const rssMax = Math.max(rssFin, memoireMax.rss);
dire(`Mémoire de ce processus : RSS ${mo(rssDepart)} au départ, ${mo(rssMax)} au plus haut (+${mo(rssMax - rssDepart)}) ; tas ${mo(memoireMax.tas)}, tableaux typés ${mo(memoireMax.tableaux)}. Journal : -wal ${mo(walMax)} au plus haut.`);
process.stdout.write(
  `${JSON.stringify({ base, dureeTotaleMs, aPart: !surPlace, retardMaxMs: Math.round(retardMaxMs), mode: r.mode, calcul: r.calcul, lignes: r.lignes ?? null, erreur: r.erreur ?? null, bilan: r.bilanDuCalcul ?? null, rangementMs: r.rangementMs ?? null, blocMaxMs: r.blocMaxMs ?? null, memoire: { rssDepart, rssMax, rssFin, releve2s: memoireMax }, journal: { walAvant, walMax }, resume: r.resume ?? null })}\n`
);
process.exit(r.mode === 'echec' ? 1 : 0);
