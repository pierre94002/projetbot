#!/usr/bin/env node
/**
 * build-day-table.mjs — LA TABLE DU JOUR J (étape 17 du plan), d'une traite, dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * Dans l'appli de Pierre, la table se construit et se tient à jour par le
 * serveur lui-même (étape « tableJourJ » de l'actualisation, en rendant la
 * main : un seul écrivain). Ce script sert au bac, serveur arrêté : le MÊME
 * code (src/data/db/dayTable.js), sous le même verrou, et — par défaut — en
 * rendant la main EXACTEMENT comme le serveur (setImmediate, transactions de
 * ~20 ms au plus) : ses mesures (durée, plus long blocage, mémoire) sont celles
 * de la première nuit chez Pierre. Sans jamais rendre la main (--d-une-traite),
 * Node ne peut pas faire son ménage entre deux tranches et sa mémoire monte
 * plus haut (mesuré le 12/10 : +421 Mo contre +342 avant les derniers
 * allègements), pour la même durée.
 *
 *   node scripts/build-day-table.mjs                    construction (table absente ou d'une autre version) ou nuit
 *   node scripts/build-day-table.mjs --tout             refait les faits de TOUTES les rencontres et compte ce qui
 *                                                       change : 0 attendu après une nuit ordinaire (non-dérive)
 *   node scripts/build-day-table.mjs --reconstruire     vide les cinq tables (par tranches) et refait tout, comme une
 *                                                       première construction (mesures)
 *   node scripts/build-day-table.mjs --d-une-traite     sans jamais rendre la main (transactions de 2 000 lignes
 *                                                       équipe / 20 000 lignes joueur, sans limite de temps)
 *   node scripts/build-day-table.mjs --controle 600     le contrôle anti-fuite SEUL, sur 600 lignes équipe et 600
 *                                                       lignes joueur tirées au hasard (lecture seule) ; --graine N
 *                                                       (une ouverture en lecture seule laisse un -wal vide et un
 *                                                       -shm à côté de la base : la prochaine ouverture normale les
 *                                                       range ; ne jamais les effacer ni les déplacer à la main)
 *   --json                                              la ligne de bilan seulement (sinon un résumé sur stderr)
 *
 * REFUS : sous OneDrive (une base et son journal ne s'écrivent jamais dans un
 * dossier synchronisé — comme test-echantillon.mjs), hors du bac à sable, sur
 * la vraie base, quand la base est ouverte par un autre processus (un serveur
 * du bac : « jamais pendant que le serveur tourne », trois incidents de journal
 * en septembre 2026) et quand le verrou d'actualisation est tenu (« une passe
 * ou un serveur écrit : rien fait »).
 *
 * Mesures (la ligne JSON sur stdout) : durée de chaque partie, RSS (au départ,
 * au plus haut, ajouté), taille du -wal à la fin et au plus haut, taille de la
 * base avant et après, taille de chacune des cinq tables et de l'index
 * (dbstat), et le bilan complet de dayTable.construireTableJourJ.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDbPath, openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE } from '../src/config/bacASable.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { construireTableJourJ, controleAntiFuite, etatTableJourJ } from '../src/data/db/dayTable.js';
import { baseOccupee } from './sandbox-commun.mjs';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const valeur = (option) => {
  const i = argv.indexOf(option);
  return i >= 0 ? argv[i + 1] : undefined;
};
const tout = argv.includes('--tout');
const reconstruire = argv.includes('--reconstruire');
const dUneTraite = argv.includes('--d-une-traite');
const lignesControle = valeur('--controle') !== undefined ? Number(valeur('--controle')) : null;
const graine = valeur('--graine') !== undefined ? Number(valeur('--graine')) : 1;
const seulementJson = argv.includes('--json');
const mo = (o) => (o === null || o === undefined ? '?' : `${(o / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const dire = (texte) => {
  if (!seulementJson) process.stderr.write(`${texte}\n`);
};

function refuser(raison) {
  process.stderr.write(`[table du jour J] REFUS : ${raison}\n`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}

// ------------------------------------------------------------ garde-fous
if (/[\\/]onedrive[^\\/]*([\\/]|$)/i.test(SERVEUR)) refuser(`à lancer depuis la copie du bac (bac-a-sable\\code\\server), jamais sous OneDrive (${SERVEUR}). Dans l'appli, c'est le serveur qui construit la table (étape « tableJourJ » de l'actualisation).`);
if (!modeBacASable()) refuser("ce script sert au bac à sable ; dans l'appli, la table se construit par le serveur (étape « tableJourJ » de l'actualisation).");
const base = resolveDbPath();
const v = verifierBaseDuBac(base);
if (!v.ok) refuser(`base refusée : ${v.raison}`);
if (base.toLowerCase() === VRAIE_BASE.toLowerCase()) refuser("c'est la vraie base.");
if (!fs.existsSync(base)) refuser(`la copie de la base n'existe pas (${base}).`);
if (lignesControle === null && baseOccupee(base)) refuser(`la base ${base} est ouverte par un autre processus (un serveur du bac tourne ?) : on n'écrit jamais pendant qu'un serveur tourne.`);
const detenteur = lockHolder();
if (detenteur && !detenteur.self) refuser(`le verrou d'actualisation est tenu par le processus ${detenteur.pid} depuis ${detenteur.startedAt} : une passe ou un serveur écrit, rien fait.`);

const taille = (f) => {
  try {
    return fs.statSync(f).size;
  } catch {
    return null;
  }
};
const TABLES = ['day_matches', 'team_day', 'league_day', 'player_day', 'day_state', 'idx_team_day_club', 'sqlite_autoindex_day_matches_1'];
function tailles(database) {
  const out = {};
  let total = 0;
  for (const nom of TABLES) {
    try {
      const r = database.prepare('SELECT SUM(pgsize) o, SUM(ncell) cellules FROM dbstat WHERE name = ? AND aggregate = TRUE').get(nom);
      out[nom] = r?.o ?? 0;
      total += r?.o ?? 0;
    } catch (error) {
      out[nom] = `illisible : ${error.message}`;
    }
  }
  out.total = total;
  return out;
}

const rssDepart = process.memoryUsage.rss();
const tailleAvant = taille(base);
const walAvant = taille(`${base}-wal`);
dire(`[table du jour J] base : ${base} (${mo(tailleAvant)}, -wal ${mo(walAvant ?? 0)})`);

if (lignesControle !== null) {
  // Le contrôle seul : lecture seule, aucune écriture, aucun verrou pris.
  const database = openDb({ readonly: true });
  const debut = performance.now();
  const c = controleAntiFuite({ database, lignes: lignesControle, graine });
  const dureeMs = Math.round(performance.now() - debut);
  closeDb();
  dire(`Contrôle anti-fuite : ${c.lignes} lignes recalculées depuis les tables sources (graine ${graine}), ${c.ecarts.length} écart(s), en ${Math.round(dureeMs / 100) / 10} s.`);
  for (const e of c.ecarts.slice(0, 20)) dire(`  écart : ${JSON.stringify(e)}`);
  process.stdout.write(`${JSON.stringify({ base, mode: 'controle', graine, dureeMs, lignes: c.lignes, ecarts: c.ecarts, verifiees: { equipe: c.verifiees.equipe.length, joueur: c.verifiees.joueur.length } })}\n`);
  process.exit(c.ecarts.length ? 1 : 0);
}

const database = openDb();
const etatAvant = etatTableJourJ({ database });
const tablesAvant = tailles(database);
const debut = performance.now();
const resultat = await withRefreshLock(
  () =>
    construireTableJourJ({
      database,
      tout,
      reconstruire,
      rendreLaMain: dUneTraite ? null : (fin) => setImmediate(fin),
      journal: dire
    }),
  { stamp: false }
);
if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
const dureeTotaleMs = Math.round(performance.now() - debut);
const walFin = taille(`${base}-wal`);
const tablesApres = tailles(database);
const etatApres = etatTableJourJ({ database });
const rssFin = process.memoryUsage.rss();
closeDb();
const tailleApres = taille(base);
const walApresFermeture = taille(`${base}-wal`);

const b = resultat;
const rssMax = Math.max(b.rssMaxOctets ?? 0, rssFin);
dire('');
if (b.erreur) dire(`ERREUR : ${b.erreur}`);
dire(`Mode : ${b.mode}${dUneTraite ? " (d'une traite : la main jamais rendue)" : ' (comme le serveur : la main rendue entre deux tranches)'} ; ${b.rencontres.magasin} rencontres au magasin : ${b.rencontres.nouvelles} nouvelles, ${b.rencontres.modifiees} modifiées, ${b.rencontres.disparues} disparues, ${b.rencontres.refusees.length} refusées.`);
dire(`Écrit : ${b.lignes.equipeEcrites} lignes équipe, ${b.lignes.joueurEcrites} lignes joueur (${b.lignes.joueurRetirees} retirées), ${b.lignes.ligueEcrites} journées de championnat ; « avant » : ${b.lignes.avantEquipe} équipe, ${b.lignes.avantJoueur} joueur.`);
if (b.changements) dire(`Changements (non-dérive) : ${JSON.stringify(b.changements)}`);
dire(`Durée : ${Math.round(dureeTotaleMs / 100) / 10} s ; par partie (ms) : ${JSON.stringify(b.etapesMs)} ; le plus long moment sans rendre la main : ${b.blocMaxMs} ms (${b.blocMaxOu ?? '—'}), ${b.pauses} pauses, ${b.tranches} transactions.`);
dire(`Mémoire : RSS ${mo(rssDepart)} au départ, ${mo(rssMax)} au plus haut (+${mo(rssMax - rssDepart)}).`);
dire(`Journal : -wal ${mo(walFin)} à la fin (avant fermeture), ${mo(b.walMaxOctets)} au plus haut, ${mo(walApresFermeture ?? 0)} après fermeture.`);
dire(`Base : ${mo(tailleAvant)} → ${mo(tailleApres)} (+${mo((tailleApres ?? 0) - (tailleAvant ?? 0))}) ; tables du jour J (dbstat) : ${mo(tablesApres.total)} (${Object.entries(tablesApres).filter(([k]) => k !== 'total').map(([k, o]) => `${k} ${mo(o)}`).join(', ')}).`);
if (b.controle) dire(`Contrôle anti-fuite : ${b.controle.lignes} lignes recalculées depuis les tables sources, ${b.controle.ecarts.length} écart(s).`);
process.stdout.write(
  `${JSON.stringify({
    base,
    mode: b.mode,
    dUneTraite,
    erreur: b.erreur,
    dureeTotaleMs,
    bilan: { ...b, rencontres: { ...b.rencontres, refusees: b.rencontres.refusees.length } },
    memoire: { rssDepart, rssMax, rssFin, ajoute: rssMax - rssDepart },
    journal: { walAvant, walFin, walMax: b.walMaxOctets, walApresFermeture },
    fichierBase: { avant: tailleAvant, apres: tailleApres, ajoute: (tailleApres ?? 0) - (tailleAvant ?? 0) },
    tables: { avant: tablesAvant, apres: tablesApres },
    etat: { avant: etatAvant, apres: etatApres }
  })}\n`
);
process.exit(b.erreur ? 1 : 0);
