#!/usr/bin/env node
/**
 * player-ratings.mjs — LES FICHES DES JOUEURS PAR POSTE (étape 30 du plan), dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * La passe de nuit de l'étape « fichesJoueurs » (src/data/db/playerRatings.js, fichesDesJoueurs) sur la base du
 * bac : le calcul dans un PROCESSUS À PART (base en lecture seule), puis le rangement ici dans player_ratings,
 * player_ratings_teams et player_ratings_state — la mesure de ce que fera la première nuit chez Pierre. Chez
 * Pierre, le même code tourne DANS le serveur (l'actualisation) : un seul écrivain.
 *
 *   node scripts/player-ratings.mjs [--tout] [--sur-place] [--banc] [--facteurs] [--json]
 *
 * --tout : tout refaire (la différence avec la table est faite quand même : seules les lignes qui changent sont
 * réécrites). --sur-place : le calcul dans ce processus (la mesure de ce qu'il coûterait dans le serveur).
 * --banc : APRÈS la passe, le banc de la construction (playerRatingsBanc.mesurerAuBanc : le magasin 2023-07-01 →
 * 2026-09-23 seulement, en lecture) rangé dans player_ratings_state (« banc »). --facteurs : les facteurs de
 * championnat et le repli sans xG appris sur la même fenêtre, AFFICHÉS seulement (à recopier dans les réglages).
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
import { fichesDesJoueurs, etatDesFiches } from '../src/data/db/playerRatings.js';
import { mesureABlanc, mesurerAuBanc, apprendreLesFacteurs, coefficientsDuRepli } from '../src/data/db/playerRatingsBanc.js';
import { executerSansPause } from '../src/utils/travailCooperatif.js';
import { baseOccupee } from './sandbox-commun.mjs';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const seulementJson = argv.includes('--json');
const mo = (o) => (o === null || o === undefined ? '?' : `${(o / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const dire = (texte) => {
  if (!seulementJson) process.stderr.write(`${texte}\n`);
};
function refuser(raison) {
  process.stderr.write(`[fiches des joueurs] REFUS : ${raison}\n`);
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

const taille = (f) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return null;
  }
};
const walAvant = taille(`${base}-wal`);
dire(`[fiches des joueurs] base : ${base} (${mo(taille(base))}, -wal ${mo(walAvant ?? 0)})`);
const database = openDb();

// Les facteurs et le repli : affichés seulement (lecture), jamais rangés.
if (argv.includes('--facteurs')) {
  const t0 = performance.now();
  const f = apprendreLesFacteurs({ database });
  const r = coefficientsDuRepli({ database });
  dire(`Facteurs appris sur ${f.paires} changements de championnat (${Object.keys(f.facteurs).length} championnats) ; repli sans xG : ${JSON.stringify(r)} (${Math.round(performance.now() - t0)} ms).`);
  closeDb();
  process.stdout.write(`${JSON.stringify({ base, facteurs: f.facteurs, couples: f.couples, paires: f.paires, repli: r })}\n`);
  process.exit(0);
}

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
    // La mesure à blanc ne lit que les matchs d'APRÈS le lancement de l'étape 30 : dans le bac, l'étape n'est pas lancée.
    const r = await fichesDesJoueurs({ force: argv.includes('--tout'), database, chemin: base, aPart: !argv.includes('--sur-place'), maintenant: () => new Date().toISOString(), depuis: null, mesureABlanc });
    const retardPasse = retardMaxMs;
    let banc = null;
    if (argv.includes('--banc') && r.mode !== 'echec') {
      const t0 = performance.now();
      const rapport = executerSansPause(mesurerAuBanc({ database }));
      rapport.le = new Date().toISOString();
      rapport.dureeMs = Math.round(performance.now() - t0);
      database.prepare('INSERT OR REPLACE INTO player_ratings_state (cle, valeur) VALUES (?, ?)').run('banc', JSON.stringify(rapport));
      banc = rapport;
    }
    return { r, retardPasse, banc };
  },
  { stamp: false, nom: 'fiches-joueurs' }
);
clearInterval(veille);
clearInterval(coeur);
if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
const { r, retardPasse, banc } = resultat;
const etat = etatDesFiches({ database });
const dureeTotaleMs = Math.round(performance.now() - debut);
if (r.mode === 'echec') dire(`ERREUR : ${r.erreur}`);
else if (r.mode === 'rien') dire(`Rien à refaire : la table du jour J n'a pas bougé depuis le calcul du ${r.calculeLe} (${r.dureeMs} ms).`);
else if (r.mode === 'reporte') dire(`Reporté : ${r.raison}`);
else {
  const b = r.bilanDuCalcul ?? {};
  dire(`Calcul (${r.mode}) : ${r.fiches} fiches (${b.etablies} établies), ${r.equipes} équipes habituelles ; ${r.ecrites} lignes écrites, ${r.retirees} retirées, en ${Math.round(r.dureeMs / 100) / 10} s ; calcul ${Math.round((b.dureeMs ?? 0) / 100) / 10} s (${JSON.stringify(b.parties)}), rangement ${r.rangementMs} ms (plus longue tranche ${r.plusLongueTrancheMs} ms).`);
  dire(`Calcul : ${b.rencontres} rencontres, ${b.apparitions} apparitions ; RSS de l'enfant ${mo(b.aPart?.rssMaxOctets)} au plus haut ; ce processus (le serveur, chez Pierre) n'a jamais été tenu plus de ${Math.round(retardPasse)} ms d'affilée (rangement : ${r.blocMaxMs} ms au plus sans rendre la main).`);
  if (r.controle) dire(`Contrôle anti-fuite : ${r.controle.lignes} joueurs recalculés par le second chemin, ${r.controle.ecarts.length} écart(s).`);
}
if (banc) dire(`Banc (2023-07-01 → 2026-09-23) : 1N2 clôture ${JSON.stringify(banc.jugements.cloture.gainPourcent)} % ${JSON.stringify(banc.jugements.cloture.fourchettePourcent)} (${banc.jugements.cloture.verdict}), pré-clôture ${JSON.stringify(banc.jugements.preCloture.gainPourcent)} % (${banc.jugements.preCloture.verdict}), tirs ${JSON.stringify(banc.jugements.tirs.gainPourcent)} % ${JSON.stringify(banc.jugements.tirs.fourchettePourcent)} (${banc.jugements.tirs.verdict}) ; ${Math.round(banc.dureeMs / 1000)} s.`);
closeDb();
process.stdout.write(
  `${JSON.stringify({
    base,
    dureeTotaleMs,
    passe: { ...r, bilanDuCalcul: undefined, bilan: r.bilanDuCalcul ?? null },
    banc,
    etat: { aJour: etat.aJour, jusqua: etat.jusqua, calculeLe: etat.calculeLe, enCours: etat.enCours },
    memoire: { rssDepart, rssMax, ajoute: rssMax - rssDepart },
    journal: { walAvant, walMax },
    retardBoucleMaxMs: Math.round(retardPasse ?? 0)
  })}\n`
);
process.exit(r.mode === 'echec' ? 1 : 0);
