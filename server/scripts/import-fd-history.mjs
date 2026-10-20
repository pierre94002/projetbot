#!/usr/bin/env node
/**
 * import-fd-history.mjs — l'historique football-data.co.uk depuis 2000, dans le BAC À SABLE.
 * -----------------------------------------------------------------------
 * Étape 13 du plan (06/10/2026). Dans l'appli de Pierre, l'import se fait
 * par le serveur lui-même (étape « historiqueFd » de l'actualisation, par
 * morceaux de 150 requêtes : un seul écrivain). Ce script sert au bac : il
 * fait tout d'une traite sur la copie de la base du bac, avec le MÊME code
 * (src/data/providers/footballDataHistory.js).
 *
 *   node scripts/import-fd-history.mjs                télécharge ce qui manque (≥ 1,5 s entre
 *                                                     deux requêtes), importe, rattache, résume
 *   node scripts/import-fd-history.mjs --budget 40    au plus 40 requêtes au site
 *   node scripts/import-fd-history.mjs --sans-reseau  seulement ce que le cache a déjà
 *   node scripts/import-fd-history.mjs --reimporter   relit TOUS les fichiers gardés, même inchangés
 *                                                     (après une correction de la lecture ; sans requête)
 *   node scripts/import-fd-history.mjs --relier       refait seulement le rattachement et le résumé
 *   node scripts/import-fd-history.mjs --resume       affiche le résumé gardé, n'écrit rien
 *
 * REFUS : hors du bac à sable, sur la vraie base (ou un autre nom de
 * celle-ci), pendant qu'un serveur a la base ouverte (« jamais pendant que le
 * serveur de développement tourne » : trois incidents de journal WAL en
 * septembre 2026), et quand le verrou d'actualisation est tenu.
 *
 * Mesures : taille de la base avant et après (fichier) et taille exacte des
 * tables de l'historique (dbstat), durée, fichiers, matchs, rattachement.
 * Le détail va sur stderr, une ligne JSON de bilan sur stdout.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { resolveDbPath, openDb, closeDb } from '../src/data/db/matchStatsDb.js';
import { modeBacASable, verifierBaseDuBac, VRAIE_BASE } from '../src/config/bacASable.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { passeHistorique, rattacherHistorique, resumeHistorique, lireResume, lireEtatImport, SOURCE_ETAT } from '../src/data/providers/footballDataHistory.js';
import { writeSourceState } from '../src/data/db/oddsQuotesRepository.js';
import { dossierCache } from '../src/data/providers/footballDataCache.js';
import { baseOccupee } from './sandbox-commun.mjs';

const argv = process.argv.slice(2);
const valeur = (option) => {
  const i = argv.indexOf(option);
  return i >= 0 ? argv[i + 1] : undefined;
};
const budget = valeur('--budget') !== undefined ? Number(valeur('--budget')) : Infinity;
const sansReseau = argv.includes('--sans-reseau');
const reimporter = argv.includes('--reimporter');
const relierSeulement = argv.includes('--relier');
const resumeSeulement = argv.includes('--resume');
const mo = (o) => (o === null || o === undefined ? '?' : `${(o / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const dire = (texte) => process.stderr.write(`${texte}\n`);

function refuser(raison) {
  dire(`[historique football-data] REFUS : ${raison}`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}

// ------------------------------------------------------------ garde-fous
if (!modeBacASable()) refuser('ce script sert au bac à sable ; dans l’appli, l’import se fait par le serveur (étape « historiqueFd » de l’actualisation).');
const base = resolveDbPath();
const v = verifierBaseDuBac(base);
if (!v.ok) refuser(`base refusée : ${v.raison}`);
if (base.toLowerCase() === VRAIE_BASE.toLowerCase()) refuser('c’est la vraie base.');
if (!fs.existsSync(base)) refuser(`la copie de la base n'existe pas (${base}).`);
if (!resumeSeulement && baseOccupee(base)) refuser(`la base ${base} est ouverte par un autre processus (un serveur du bac tourne ?) : on n'importe jamais pendant qu'un serveur tourne.`);
const detenteur = lockHolder();
if (detenteur && !detenteur.self) refuser(`le verrou d'actualisation est tenu par le processus ${detenteur.pid} depuis ${detenteur.startedAt}.`);

const database = openDb();
if (resumeSeulement) {
  process.stdout.write(`${JSON.stringify({ etat: lireEtatImport({ database }), resume: lireResume({ database }) })}\n`);
  closeDb();
  process.exit(0);
}

const debut = Date.now();
const tailleAvant = fs.statSync(base).size;
dire(`[historique football-data] base : ${base} (${mo(tailleAvant)}) ; cache des fichiers : ${dossierCache({ database })}`);

const resultat = await withRefreshLock(async () => {
  if (relierSeulement) {
    const rattachement = rattacherHistorique({ database, log: (b) => dire(`  rattachement ${b.pays} : ${b.traduits} club(s) traduit(s) sur ${b.clubs}${b.conflits ? `, ${b.conflits} conflit(s)` : ''}`) });
    const resume = resumeHistorique({ database });
    writeSourceState(SOURCE_ETAT, 'resume', { cursor: null, done: lireEtatImport({ database }).complet, detail: resume }, { database });
    return { rattachement, resume };
  }
  let n = 0;
  const bilan = await passeHistorique({
    database,
    budget,
    sansReseau,
    reimporter,
    limiteMs: Infinity,
    log: (x) => {
      if (x.statut !== undefined) {
        n++;
        if (n % 25 === 0 || x.statut !== 200) dire(`  ${x.fichier} : ${x.statut === 200 ? 'téléchargé' : x.statut === 404 ? 'absent chez le site (404)' : `échec`} (${x.requetes} requêtes)`);
      } else if (x.importe !== undefined && (x.ignorees || /new\//.test(x.fichier))) {
        dire(`  ${x.fichier} : ${x.importe} matchs importés${x.ignorees ? `, ${x.ignorees} ligne(s) ignorée(s)` : ''}`);
      }
    }
  });
  return { bilan, resume: lireResume({ database }) };
}, { stamp: false });

if (resultat?.skipped) refuser(`verrou d'actualisation : ${resultat.skipped}`);
closeDb();
const tailleApres = fs.statSync(base).size;
const r = resultat.resume ?? {};
const t = r.totaux ?? {};
const pct = (a, b) => (b ? `${((100 * a) / b).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %` : '—');
dire('');
dire(`Fichiers : ${r.fichiers?.importes ?? '?'} importés, ${r.fichiers?.absents ?? '?'} absents chez le site, ${r.fichiers?.echecs?.length ?? '?'} en échec, sur ${r.fichiers?.attendus ?? '?'} attendus.`);
dire(`Matchs : ${t.matchs} sur ${t.saisons} saisons-championnats ; clubs : ${t.clubs}, dont ${t.clubsReconnus} reconnus par le vote (identifiant FotMob).`);
dire(`Période commune avec le magasin : ${t.periode} matchs, ${t.rattachees} rattachés avec le même score (${pct(t.rattachees, t.periode)}), ${t.ecarts} score(s) différent(s), ${t.nonTraduits} club(s) non traduit(s), ${t.introuvables} introuvable(s).`);
dire(`Taille : base ${mo(tailleAvant)} -> ${mo(tailleApres)} (+${mo(tailleApres - tailleAvant)}) ; tables de l'historique (dbstat) : ${mo(r.taille?.octets)}. Durée : ${Math.round((Date.now() - debut) / 1000)} s.`);
process.stdout.write(
  `${JSON.stringify({
    base,
    dureeMs: Date.now() - debut,
    tailleAvant,
    tailleApres,
    ajoute: tailleApres - tailleAvant,
    tables: r.taille ?? null,
    bilan: resultat.bilan ? { ...resultat.bilan, resume: undefined, rattachement: undefined } : null,
    totaux: t,
    fichiers: r.fichiers ? { ...r.fichiers, absentsListe: r.fichiers.absentsListe?.length } : null
  })}\n`
);
