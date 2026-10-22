#!/usr/bin/env node
/**
 * forces-buts.mjs — LES FORCES DE BUTS (étape 27 du plan), dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * La passe de nuit de l'étape « forcesButs » (src/data/db/forcesButs.js, forcesDeButs) sur la base du bac : le
 * calcul dans un PROCESSUS À PART (base en lecture seule), puis le rangement ici dans forces_buts,
 * forces_buts_ligues et forces_buts_state — la mesure de ce que fera la première nuit chez Pierre. Chez Pierre,
 * le même code tourne DANS le serveur (l'actualisation) : un seul écrivain.
 *
 *   node scripts/forces-buts.mjs [--config reglages.json] [--tout] [--sur-place] [--controle-range] [--json]
 *
 * Les empreintes calculées : celles des réglages en service du bac et de la candidate en essai (comme la nuit),
 * plus celle de `--config` (des réglages de candidate posés par fichier : { modeleDeButs } ou { football: {…} }).
 * --tout : tout refaire (la différence avec la table est faite quand même : seules les lignes qui changent sont
 * réécrites). --sur-place : le calcul dans ce processus (la mesure de ce qu'il coûterait dans le serveur).
 * --controle-range : après le rangement, le contrôle anti-fuite sur les lignes RANGÉES (lues comme le moteur).
 *
 * REFUS : sous OneDrive, hors du bac à sable, sur la vraie base, base ouverte par un autre processus (un serveur
 * du bac tourne), verrou d'actualisation tenu. Sortie : le résumé sur stderr, une ligne JSON de bilan sur stdout.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE } from '../src/config/bacASable.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { forcesDeButs, empreintesDemandees, controleAntiFuiteForces, etatForcesButs, graineDuJour } from '../src/data/db/forcesButs.js';
import { lireReglagesDuMoteur } from '../src/core/engine/engineConfig.js';
import { candidatePourLeBanc } from '../src/core/engine/engineVersions.js';
import { reglagesDuModeleDeButs, empreinteDesForces } from '../src/core/engine/goalModel.js';
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
  process.stderr.write(`[forces de buts] REFUS : ${raison}\n`);
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

// Les empreintes : en service, candidate en essai, et --config.
let reglagesConfig = null;
if (valeur('--config')) {
  try {
    const lu = JSON.parse(fs.readFileSync(valeur('--config'), 'utf8'));
    reglagesConfig = lu.football ?? lu;
    reglagesDuModeleDeButs(reglagesConfig);
  } catch (error) {
    refuser(`--config illisible ou fautif : ${error.message}`);
  }
}
let candidate = null;
try {
  candidate = candidatePourLeBanc();
} catch (error) {
  refuser(`la candidate déclarée ne tient pas debout : ${error.message}`);
}
const empreintes = [...new Set([
  ...empreintesDemandees({ reglagesEnService: lireReglagesDuMoteur().football, reglagesCandidate: candidate?.reglagesCandidate ?? null }),
  ...(reglagesConfig ? [empreinteDesForces(reglagesDuModeleDeButs(reglagesConfig))] : [])
])].sort();

const taille = (f) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return null;
  }
};
const walAvant = taille(`${base}-wal`);
dire(`[forces de buts] base : ${base} (${mo(taille(base))}, -wal ${mo(walAvant ?? 0)}) ; empreintes demandées : ${empreintes.join(', ') || 'aucune'}`);
const database = openDb();
const rssDepart = process.memoryUsage.rss();
const debut = performance.now();
let walMax = walAvant ?? 0;
let rssMax = rssDepart;
const veille = setInterval(() => {
  rssMax = Math.max(rssMax, process.memoryUsage.rss());
  walMax = Math.max(walMax, taille(`${base}-wal`) ?? 0);
}, 500);
veille.unref?.();
// Le retard de la boucle d'événements de CE processus (le serveur, chez Pierre) : un battement toutes les 50 ms.
let retardMaxMs = 0;
let attendu = performance.now() + 50;
const coeur = setInterval(() => {
  const t = performance.now();
  retardMaxMs = Math.max(retardMaxMs, t - attendu);
  attendu = t + 50;
}, 50);
coeur.unref?.();

const resultat = await withRefreshLock(
  async () => {
    const r = await forcesDeButs({ empreintes, force: argv.includes('--tout'), database, chemin: base, aPart: !argv.includes('--sur-place'), maintenant: () => new Date().toISOString() });
    const retardPasse = retardMaxMs;
    let controleRange = null;
    if (argv.includes('--controle-range') && r.mode !== 'echec' && empreintes.length) {
      controleRange = empreintes.map((empreinte) => controleAntiFuiteForces({ database, graine: graineDuJour(new Date().toISOString()), empreinte }));
    }
    return { r, retardPasse, controleRange };
  },
  { stamp: false, nom: 'forces-de-buts' }
);
clearInterval(veille);
clearInterval(coeur);
if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
const { r, retardPasse, controleRange } = resultat;
const etat = etatForcesButs({ database, empreintes });
const dureeTotaleMs = Math.round(performance.now() - debut);
if (r.mode === 'echec') dire(`ERREUR : ${r.erreur}`);
else if (r.mode === 'rien') dire(`Rien à refaire : ${r.raison ?? `aucune rencontre n'a bougé depuis le calcul du ${r.calculeLe}`} (${r.dureeMs} ms).`);
else if (r.mode === 'reporte') dire(`Reporté : ${r.raison}`);
else {
  const b = r.bilanDuCalcul ?? {};
  dire(`Calcul (${r.mode}) : ${r.lignes} lignes à écrire (${r.clubs} clubs, ${r.championnats} championnats), ${r.ecrites} écrites, ${r.retirees} retirées, en ${Math.round(r.dureeMs / 100) / 10} s ; calcul ${Math.round((b.dureeMs ?? 0) / 100) / 10} s (${JSON.stringify(b.parties)}), rangement ${r.rangementMs} ms (plus longue tranche ${r.plusLongueTrancheMs} ms).`);
  dire(`Calcul : ${b.rencontres} rencontres, ${b.attribuees} attribuées écartées ; lignes calculées ${JSON.stringify(b.lignesCalculees)} ; RSS de l'enfant ${mo(b.aPart?.rssMaxOctets)} au plus haut ; ce processus (le serveur, chez Pierre) n'a jamais été tenu plus de ${Math.round(retardPasse)} ms d'affilée (rangement : ${r.blocMaxMs} ms au plus sans rendre la main).`);
  if (r.controle) dire(`Contrôle anti-fuite : ${r.controle.lignes} couples (club, J) recalculés par le second chemin, ${r.controle.ecarts.length} écart(s).`);
}
if (controleRange) for (const c of controleRange) dire(`Contrôle des lignes rangées (${c.empreinte}) : ${c.lignes} couples, ${c.ecarts.length} écart(s).`);
closeDb();
process.stdout.write(
  `${JSON.stringify({
    base,
    empreintes,
    dureeTotaleMs,
    passe: { ...r, bilanDuCalcul: undefined, bilan: r.bilanDuCalcul ?? null },
    controleRange,
    etat: { aJour: etat.aJour, empreintes: etat.empreintes, jusqua: etat.jusqua, calculeLe: etat.calculeLe, enCours: etat.enCours },
    memoire: { rssDepart, rssMax, ajoute: rssMax - rssDepart },
    journal: { walAvant, walMax },
    retardBoucleMaxMs: Math.round(retardPasse ?? 0)
  })}\n`
);
process.exit(r.mode === 'echec' ? 1 : 0);
