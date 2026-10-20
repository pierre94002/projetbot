#!/usr/bin/env node
/**
 * bench.mjs — LE BANC D'ESSAI (étape 19 du plan), dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * Rejoue le moteur actuel, tel quel, sur le passé (src/bench/runner.js), le
 * note marché par marché face au marché et au repère, simule les paris de sa
 * règle, apporte tout au juge de l'étape 16 et range le RÉSUMÉ dans la table
 * bench_runs de la base du bac (un INSERT au lancement, un UPDATE à la fin).
 * Chez Pierre, le même code tourne DANS le serveur (bouton « Lancer le
 * banc » de l'onglet Banc d'essai) : un seul écrivain.
 *
 *   node scripts/bench.mjs [--periodes P2,P3] [--prix fd-avant-match,gratuites-avant-match]
 *                          [--marches result,totalGoals] [--de AAAA-MM-JJ --a AAAA-MM-JJ]
 *                          [--config reglages.json] [--vues AAAA-MM-JJ:AAAA-MM-JJ,…]
 *                          [--lignes sortie.jsonl] [--graine N] [--tirages N] [--json]
 *   node scripts/bench.mjs --comparer a.jsonl b.jsonl --mesure perte-log (--variantes N | --etapes 27,28)
 *
 * Par défaut : P1 à P5 et les quatre jeux de prix (reproduction du 23/09
 * comprise) — c'est le rejeu complet du bac, 20 à 30 minutes.
 * --lignes : les lignes détaillées en JSON Lines (FORMAT_ECHANGE : un
 * en-tête, puis une ligne par match × marché × jeu de prix, et les paris),
 * pour les étapes 25 et 47 ; jamais sous OneDrive.
 * --comparer : deux fichiers d'export face à face (apparier.js), même format
 * exigé ; sans --variantes ni --etapes, pas de verdict (le nombre de
 * variantes essayées fait la fourchette).
 *
 * REFUS : sous OneDrive, hors du bac à sable, sur la vraie base, base ouverte
 * par un autre processus (un serveur du bac tourne), verrou d'actualisation
 * tenu. Pendant le rejeu, la main est rendue toutes les ~25 ms (setImmediate)
 * : sans elle, le battement du verrou se tairait et le verrou serait perdu au
 * bout de 10 minutes.
 * Sortie : le détail sur stderr, une ligne JSON de bilan sur stdout (durées
 * par partie, mémoire, plus long blocage, battements, comptes, écartées).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE, estDans } from '../src/config/bacASable.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { detecterOneDrive } from '../src/data/sauvegardes/destinationHorsDisque.js';
import { rejouer, moteurDuRejeu } from '../src/bench/runner.js';
import { ouvrirRejeu, finirRejeu } from '../src/bench/depotBanc.js';
import { comparerDesFichiers, ecrivainDEchange } from '../src/bench/apparier.js';
import { JEUX_DE_PRIX } from '../src/bench/periodes.js';
import { lireReglagesDuMoteur } from '../src/core/engine/engineConfig.js';
import { baseOccupee } from './sandbox-commun.mjs';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const valeur = (option) => {
  const i = argv.indexOf(option);
  return i >= 0 ? argv[i + 1] : undefined;
};
const liste = (option) => (valeur(option) ? valeur(option).split(',').map((s) => s.trim()).filter(Boolean) : undefined);
const seulementJson = argv.includes('--json');
const mo = (o) => (o === null || o === undefined ? '?' : `${(o / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const dire = (texte) => {
  if (!seulementJson) process.stderr.write(`${texte}\n`);
};
function refuser(raison) {
  process.stderr.write(`[banc] REFUS : ${raison}\n`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}
const sousOneDrive = (chemin) => {
  const absolu = path.resolve(chemin);
  if (/[\\/]onedrive[^\\/]*([\\/]|$)/i.test(absolu)) return true;
  const od = detecterOneDrive();
  return Boolean(od?.racine) && estDans(absolu, od.racine);
};

// ------------------------------------------------------------ --comparer
if (argv.includes('--comparer')) {
  const i = argv.indexOf('--comparer');
  const [a, b] = [argv[i + 1], argv[i + 2]];
  if (!a || !b) refuser('--comparer attend deux fichiers d’export (JSON Lines).');
  const variantes = valeur('--variantes') !== undefined ? Number(valeur('--variantes')) : null;
  const etapes = liste('--etapes') ?? null;
  try {
    const r = await comparerDesFichiers({ fichierA: a, fichierB: b, mesure: valeur('--mesure') ?? 'perte-log', variantes, etapes, graine: Number(valeur('--graine') ?? 1), tirages: Number(valeur('--tirages') ?? 1000) });
    dire(`Comparaison : ${r.paires} paires (sans paire : ${r.ecartees.sansPaire}, lignes différentes : ${r.ecartees.lignesDifferentes}) ; verdict : ${r.verdict ?? 'aucun (ni --variantes ni --etapes)'}.`);
    process.stdout.write(`${JSON.stringify(r)}\n`);
    process.exit(0);
  } catch (error) {
    refuser(error.message);
  }
}

// ------------------------------------------------------------ garde-fous
if (/[\\/]onedrive[^\\/]*([\\/]|$)/i.test(SERVEUR)) refuser(`à lancer depuis la copie du bac (bac-a-sable\\code\\server), jamais sous OneDrive (${SERVEUR}). Dans l'appli, le banc tourne dans le serveur (onglet Banc d'essai).`);
if (!modeBacASable()) refuser("ce script sert au bac à sable ; dans l'appli, le banc tourne dans le serveur (onglet Banc d'essai d'Historique moteur).");
const base = resolveDbPath();
const v = verifierBaseDuBac(base);
if (!v.ok) refuser(`base refusée : ${v.raison}`);
if (base.toLowerCase() === VRAIE_BASE.toLowerCase()) refuser("c'est la vraie base.");
if (!fs.existsSync(base)) refuser(`la copie de la base n'existe pas (${base}).`);
if (baseOccupee(base)) refuser(`la base ${base} est ouverte par un autre processus (un serveur du bac tourne ?) : on n'écrit jamais pendant qu'un serveur tourne.`);
const detenteur = lockHolder();
if (detenteur && !detenteur.self) refuser(`le verrou d'actualisation est tenu par le processus ${detenteur.pid} depuis ${detenteur.startedAt} : une passe ou un serveur écrit, rien fait.`);
const fichierLignes = valeur('--lignes') ?? null;
if (fichierLignes && sousOneDrive(fichierLignes)) refuser(`--lignes ${fichierLignes} : jamais sous OneDrive (un export de plusieurs centaines de Mo y serait envoyé à chaque écriture).`);

let config = null;
if (valeur('--config')) {
  try {
    const lu = JSON.parse(fs.readFileSync(valeur('--config'), 'utf8'));
    config = lu.football ?? lu;
  } catch (error) {
    refuser(`--config illisible : ${error.message}`);
  }
}
const vues = (liste('--vues') ?? []).map((t) => {
  const [de, a] = t.split(':');
  return { de, a, quoi: 'déclarée au lancement du banc (--vues)' };
});
const options = {
  periodes: liste('--periodes') ?? ['P1', 'P2', 'P3', 'P4', 'P5'],
  prix: liste('--prix') ?? Object.keys(JEUX_DE_PRIX),
  marches: liste('--marches'),
  de: valeur('--de') ?? null,
  a: valeur('--a') ?? null,
  config,
  vues,
  graine: Number(valeur('--graine') ?? 1),
  tirages: Number(valeur('--tirages') ?? 1000)
};
if (!options.marches) delete options.marches;

// ------------------------------------------------------------ le rejeu
const rssDepart = process.memoryUsage.rss();
const taille = (f) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return null;
  }
};
const walAvant = taille(`${base}-wal`);
dire(`[banc] base : ${base} (${mo(taille(base))}, -wal ${mo(walAvant ?? 0)})`);
const database = openDb();
const reglages = config ?? JSON.parse(JSON.stringify(lireReglagesDuMoteur().football));
const moteur = moteurDuRejeu(reglages);
const optionsRangees = { ...options, config: { empreinte: moteur.empreinteReglages, reglages } };
const debut = performance.now();
let battements = 0;
let dernierBattement = null;
let walMax = walAvant ?? 0;
const veille = setInterval(() => {
  const h = lockHolder();
  if (h?.self && h.heartbeatAt && h.heartbeatAt !== dernierBattement) {
    if (dernierBattement !== null) battements++;
    dernierBattement = h.heartbeatAt;
  }
  walMax = Math.max(walMax, taille(`${base}-wal`) ?? 0);
}, 5000);
veille.unref?.();

let id = null;
let export_ = null;
const resultat = await withRefreshLock(
  async () => {
    dernierBattement = lockHolder()?.heartbeatAt ?? null;
    id = ouvrirRejeu({ database, ou: 'bac', moteur, options: optionsRangees });
    dire(`[banc] rejeu n° ${id} — moteur ${moteur.empreinte.slice(0, 12)} (version ${moteur.version ?? 'sans version'}) ; périodes ${options.periodes.join(', ')} ; prix ${options.prix.join(', ')}.`);
    if (fichierLignes) export_ = ecrivainDEchange(fichierLignes, { moteur, options: optionsRangees });
    let derniereAnnonce = 0;
    const r = await rejouer({
      ...options,
      config: reglages,
      database,
      rendreLaMain: (fin) => setImmediate(fin),
      journal: dire,
      surLigne: export_ ? (l) => export_.ecrire(l) : null,
      avancement: ({ partie, fait, total, date }) => {
        if (performance.now() - derniereAnnonce > 30_000) {
          derniereAnnonce = performance.now();
          dire(`[banc] ${partie} : ${fait}${total ? ` / ${total}` : ''}${date ? ` (${date})` : ''}`);
        }
      }
    });
    if (export_) export_.fermer();
    finirRejeu({ database, id, bilan: { ...r.bilan, battements }, resume: r.resume });
    return r;
  },
  { stamp: false, nom: 'banc' }
);
clearInterval(veille);
if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
const dureeTotaleMs = Math.round(performance.now() - debut);
const rssFin = process.memoryUsage.rss();
closeDb();
const b = resultat.bilan;
const rssMax = Math.max(b.rssMax ?? 0, rssFin);
if (b.erreur) dire(`ERREUR : ${b.erreur}`);
dire(`Rejeu n° ${id} : ${b.rencontres.rejouees} rencontres rejouées (${b.analyses} analyses du moteur), en ${Math.round(dureeTotaleMs / 100) / 10} s ; par partie (ms) : ${JSON.stringify(b.parties)}.`);
dire(`Le plus long moment sans rendre la main : ${b.blocMaxMs} ms (${b.blocMaxOu ?? '—'}), ${b.pauses} pauses, ${battements} battements du verrou.`);
dire(`Mémoire : RSS ${mo(rssDepart)} au départ, ${mo(rssMax)} au plus haut (+${mo(rssMax - rssDepart)}). Journal : -wal ${mo(walMax)} au plus haut.`);
if (resultat.resume?.reproduction) {
  const rp = resultat.resume.reproduction;
  dire(`Reproduction du 23/09 (P4b, moyenne de clôture) : lecture directe ${rp.lectureDirecte.matchs} matchs, ${rp.lectureDirecte.justes?.toFixed(2)} % de justes, perte log ${rp.lectureDirecte.perteLog?.toFixed(4)} ; chemin du moteur ${rp.moteur.matchs} matchs (${rp.moteur.cotesIncoherentes} cotes incohérentes), écart max ${rp.moteur.maxEcartP}.`);
}
process.stdout.write(
  `${JSON.stringify({
    id,
    base,
    dureeTotaleMs,
    bilan: { ...b, battements },
    memoire: { rssDepart, rssMax, rssFin, ajoute: rssMax - rssDepart },
    journal: { walAvant, walMax },
    moteur,
    export: export_ ? { fichier: fichierLignes, lignes: export_.lignes } : null,
    reproduction: resultat.resume?.reproduction ?? null,
    juge: resultat.resume?.juge ?? null
  })}\n`
);
process.exit(b.erreur ? 1 : 0);
