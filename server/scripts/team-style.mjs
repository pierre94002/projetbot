#!/usr/bin/env node
/**
 * team-style.mjs — LES STYLES DE JEU DES ÉQUIPES ET DES ENTRAÎNEURS (étape 37 du plan), dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * La passe de nuit de l'étape « stylesDeJeu » (src/data/db/teamStyle.js, stylesDeJeu) sur la base du bac : le calcul
 * dans un PROCESSUS À PART (base en lecture seule ; la carte des tirs relue pour les seules rencontres nouvelles ou
 * changées), puis le rangement ici dans team_style_matches, team_style, coach_style et team_style_state — la mesure
 * de ce que fera la première nuit chez Pierre. Chez Pierre, le même code tourne DANS le serveur (l'actualisation) :
 * un seul écrivain.
 *
 *   node scripts/team-style.mjs [--tout] [--sur-place] [--banc] [--json]
 *
 * --tout : tout relire (la différence avec les tables est faite quand même). --sur-place : le calcul dans ce
 * processus. --banc : APRÈS la passe, le banc (teamStyleBanc.mesurerAuBanc : stabilité d'un mois sur l'autre, et duels
 * de styles sur le magasin 2023-07-01 → 2026-09-23 seulement, en LECTURE) — affiché, avec ce qu'il faut recopier dans
 * DUELS_AU_BANC (teamStyle.js) ; jamais rangé dans la base.
 *
 * REFUS : sous OneDrive, hors du bac à sable, sur la vraie base, base ouverte par un autre processus (un serveur du
 * bac tourne), verrou d'actualisation tenu. Sortie : le résumé sur stderr, une ligne JSON de bilan sur stdout.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE } from '../src/config/bacASable.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { stylesDeJeu, etatDesStyles, DUELS_AU_BANC } from '../src/data/db/teamStyle.js';
import { mesurerAuBanc } from '../src/data/db/teamStyleBanc.js';
import { baseOccupee } from './sandbox-commun.mjs';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const seulementJson = argv.includes('--json');
const mo = (o) => (o === null || o === undefined ? '?' : `${(o / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const pct = (x, d = 1) => (Number.isFinite(x) ? `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d })} %` : '?');
const dire = (texte) => {
  if (!seulementJson) process.stderr.write(`${texte}\n`);
};
function refuser(raison) {
  process.stderr.write(`[styles de jeu] REFUS : ${raison}\n`);
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
dire(`[styles de jeu] base : ${base} (${mo(taille(base))}, -wal ${mo(walAvant ?? 0)})`);
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
    const r = await stylesDeJeu({ force: argv.includes('--tout'), database, chemin: base, aPart: !argv.includes('--sur-place'), maintenant: () => new Date().toISOString() });
    return { r, retardPasse: retardMaxMs };
  },
  { stamp: false, nom: 'styles-de-jeu' }
);
clearInterval(veille);
clearInterval(coeur);
if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
const { r, retardPasse } = resultat;
const etat = etatDesStyles({ database });
const dureeTotaleMs = Math.round(performance.now() - debut);
if (r.mode === 'echec') dire(`ERREUR : ${r.erreur}`);
else if (r.mode === 'rien') dire(`Rien à refaire : aucune rencontre nouvelle ou changée depuis le calcul du ${r.calculeLe} (${r.dureeMs} ms).`);
else if (r.mode === 'reporte') dire(`Reporté : ${r.raison}`);
else {
  const b = r.bilanDuCalcul ?? {};
  dire(`Calcul (${r.mode}) : ${r.actuels} clubs et ${r.entraineurs} entraîneurs au ${r.jourActuel} (${r.styles} lignes de style) ; ${b.relues} rencontres lues ; ${r.ecrites} lignes écrites, ${r.retirees} retirées, en ${Math.round(r.dureeMs / 100) / 10} s ; calcul ${Math.round((b.dureeMs ?? 0) / 100) / 10} s (${JSON.stringify(b.parties)}), rangement ${r.rangementMs} ms (plus longue tranche ${r.plusLongueTrancheMs} ms).`);
  dire(`Répartition des clubs établis : ${JSON.stringify(b.repartition)} ; ${b.provisoires} provisoires ; ${b.homonymes} noms d'entraîneur homonymes. RSS de l'enfant ${mo(b.aPart?.rssMaxOctets)} au plus haut ; ce processus n'a jamais été tenu plus de ${Math.round(retardPasse)} ms d'affilée (rangement : ${r.blocMaxMs} ms au plus sans rendre la main).`);
  if (r.controle) dire(`Contrôle anti-fuite : ${r.controle.lignes} instantanés recalculés par le second chemin, ${r.controle.ecarts.length} écart(s).`);
}

let banc = null;
if (argv.includes('--banc') && r.mode !== 'echec') {
  const t0 = performance.now();
  const rapport = mesurerAuBanc({ database, le: new Date().toISOString().slice(0, 10) });
  rapport.dureeMs = Math.round(performance.now() - t0);
  rapport.rssMo = Math.round(process.memoryUsage.rss() / 1048576);
  const s = rapport.stabilite;
  dire(`Banc — stabilité d'un mois sur l'autre : ${pct(s.part)} des clubs établis gardent leur style (${s.paires} paires ; sans le cran ${pct(s.sansCran)} ; débuts de saison ${pct(s.debutSaison.part)} ; plus bas ${s.plusBas?.jour} ${pct(s.plusBas?.part)}).`);
  const g = rapport.duels.global;
  dire(`Banc — duels (K = ${rapport.K}, ${rapport.duels.matchs} matchs, ${rapport.duels.apprentissage} pour apprendre, ${rapport.duels.verification} pour juger) : 1N2 ${pct(g.un2.gain, 3)} [${g.un2.fourchette?.map((x) => pct(x, 3)).join(' ; ')}] ${g.un2.verdict} ; plus/moins 2,5 ${pct(g.pm.gain, 3)} [${g.pm.fourchette?.map((x) => pct(x, 3)).join(' ; ')}] ${g.pm.verdict} ; cases retenues : ${rapport.aRecopier.cases.length} (${Math.round(rapport.dureeMs / 1000)} s).`);
  const recopie = JSON.stringify({ ...rapport.aRecopier, le: undefined }) === JSON.stringify({ ...DUELS_AU_BANC, le: undefined, periode: undefined });
  dire(`DUELS_AU_BANC (teamStyle.js) ${recopie ? 'est À JOUR' : 'est À RECOPIER'} : ${JSON.stringify(rapport.aRecopier)}`);
  banc = { stabilite: rapport.stabilite, repartition: rapport.repartition, global: g, cases: rapport.duels.cases, aRecopier: rapport.aRecopier, dureeMs: rapport.dureeMs, rssMo: rapport.rssMo, durees: rapport.durees, matchs: rapport.duels.matchs, apprentissage: rapport.duels.apprentissage, verification: rapport.duels.verification };
}
closeDb();
process.stdout.write(
  `${JSON.stringify({
    base,
    dureeTotaleMs,
    passe: { ...r, bilanDuCalcul: undefined, bilan: r.bilanDuCalcul ?? null },
    banc,
    etat: { aJour: etat.aJour, jusqua: etat.jusqua, jourActuel: etat.jourActuel, calculeLe: etat.calculeLe, enCours: etat.enCours },
    memoire: { rssDepart, rssMax, ajoute: rssMax - rssDepart },
    journal: { walAvant, walMax },
    retardBoucleMaxMs: Math.round(retardPasse ?? 0)
  })}\n`
);
process.exit(r.mode === 'echec' ? 1 : 0);
