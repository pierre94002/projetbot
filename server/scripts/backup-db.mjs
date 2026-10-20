#!/usr/bin/env node
/**
 * backup-db.mjs — la sauvegarde de chaque nuit, compressée, en rotation 7/4/12.
 * -----------------------------------------------------------------------
 * Étape 1 du plan CôteMaster. Lancée chaque nuit par l'étape « sauvegarde »
 * de l'actualisation (src/jobs/matchStatsAutoRefresh.js), DANS UN PROCESSUS À
 * PART : copier et compresser 1,7 Go prend plusieurs minutes, que le serveur
 * ne doit pas passer bloqué.
 *
 * Dans l'ordre :
 *   1. contrôles : dossier autorisé (dans le bac à sable, jamais hors du
 *      bac) ; place libre (2 × la base + 2 Go, règle inchangée) ;
 *   2. copie cohérente par VACUUM INTO — la SEULE méthode autorisée : base
 *      ouverte en LECTURE SEULE, instantané pris dans une transaction de
 *      lecture, prévu pour tourner pendant que l'appli écrit ; jamais les
 *      fichiers -wal/-shm de la base ;
 *   3. contrôle de la copie : quick_check, rencontres, dernière date ;
 *   4. compression gzip EN FLUX, ici et jamais dans le serveur →
 *      cotemaster-AAAA-MM-JJ.db.gz (jour de PARIS, pas UTC) ;
 *   5. archive des données de l'appli (data/runtime : pronostics, paris,
 *      analyses IA, réglages du moteur…), SANS secrets → .donnees.zip ;
 *   6. bilan → cotemaster-AAAA-MM-JJ.json, écrit en dernier : tailles,
 *      empreintes, rencontres, état des réglages du moteur ;
 *   7. rotation : 7 quotidiennes, 4 hebdomadaires, 12 mensuelles
 *      (src/data/sauvegardes/planSauvegardes.js). Une copie faite à la main
 *      (tout autre nom) n'est jamais touchée ;
 *   8. une fois par semaine, copie HORS DU DISQUE du jeu de la nuit vers la
 *      destination en vigueur (src/data/sauvegardes/destinationHorsDisque.js) :
 *      le choix fait dans Réglages › Sauvegardes, sinon la variable
 *      CM_SAUVEGARDE_HORS_DISQUE, sinon OneDrive s'il est détecté (une seule
 *      copie gardée là-bas), sinon aucune ; une destination neuve (choix
 *      changé) reçoit sa copie dès la nuit suivante ;
 *   9. état pour l'écran → etat-sauvegarde.json, à côté des sauvegardes
 *      (hors OneDrive : pas de verrou).
 *
 * Sortie : une ligne JSON sur stdout. Code 0 si la sauvegarde est faite.
 *
 *   node scripts/backup-db.mjs                           la sauvegarde de la nuit
 *   node scripts/backup-db.mjs --dir <dossier>           dans un autre dossier de sauvegardes
 *   node scripts/backup-db.mjs --hors-disque <dossier>   destination hors disque pour cette fois (passe devant le choix enregistré)
 *   node scripts/backup-db.mjs --hors-disque-maintenant  copie hors disque même si la semaine n'est pas passée
 *   node scripts/backup-db.mjs --hors-disque-seule       pas de nouvelle sauvegarde : copie hors disque de la dernière
 *   node scripts/backup-db.mjs --copie-seule --dir <d>   une copie .db simple, non compressée, sans rotation
 *                                                        ni archive (préparation du bac à sable)
 *   --donnees <dossier>  dossier des données de l'appli au lieu de data/runtime (essais) :
 *                        archivé, et lu pour le choix de la destination hors disque
 *   --keep N  ancienne option (jusqu'au 05/10/2026). Seule (ancien serveur
 *             pas encore relancé) : ignorée, la rotation est 7/4/12. Avec
 *             --dir (ancien sandbox-prepare) : vaut --copie-seule.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { jourParis, nomsDuJour, CADENCE, POLITIQUE, estDue, placeDisque } from '../src/data/sauvegardes/planSauvegardes.js';
import * as f from '../src/data/sauvegardes/fichiersSauvegarde.js';
import { controlerCopie, retirerAnnexes } from '../src/data/sauvegardes/controleCopie.js';
import { destinationEnVigueur } from '../src/data/sauvegardes/destinationHorsDisque.js';

const VERSION = 1;
const NIVEAU_GZIP = 6;
const HISTORIQUE = 14;

function lireArgs(argv) {
  const avecValeur = new Set(['--dir', '--hors-disque', '--keep', '--donnees']);
  const drapeaux = new Set(['--copie-seule', '--hors-disque-maintenant', '--hors-disque-seule']);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (avecValeur.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`L'option ${a} attend une valeur.`);
      args[a.slice(2)] = v;
      i++;
    } else if (drapeaux.has(a)) {
      args[a.slice(2)] = true;
    } else {
      throw new Error(`Option inconnue : ${a}. Options : --dir <dossier>, --hors-disque <dossier>, --hors-disque-maintenant, --hors-disque-seule, --copie-seule, --donnees <dossier>.`);
    }
  }
  return args;
}

const taille = (abs) => {
  try {
    return fs.statSync(abs).size;
  } catch {
    return 0;
  }
};

const ecrire = (objet) => console.log(JSON.stringify(objet));

/** VACUUM INTO depuis la base ouverte en lecture seule. */
function vacuumInto(cheminBase, cible) {
  f.gardeEcriture(cible, 'copie de la base');
  const db = new DatabaseSync(cheminBase, { readOnly: true });
  try {
    db.prepare('VACUUM INTO ?').run(cible);
  } finally {
    db.close();
  }
}

function controlePlace(dossier, cheminBase) {
  const tailleBase = fs.statSync(cheminBase).size;
  const place = f.placeLibre(dossier);
  return { tailleBase, total: place.total, ...placeDisque(place.libre, tailleBase) };
}

/** Une copie .db simple (préparation du bac à sable) : pas de compression, de rotation ni d'archive. */
function copieSeule({ cheminBase, dossier }) {
  const debut = Date.now();
  fs.mkdirSync(dossier, { recursive: true });
  const disque = controlePlace(dossier, cheminBase);
  if (disque.niveau === 'insuffisante') {
    ecrire({ ok: false, reason: 'espace disque insuffisant', freeBytes: disque.libre, requiredBytes: disque.requis });
    process.exitCode = 1;
    return;
  }
  const cible = path.join(dossier, `copie-${jourParis()}.db`);
  const travail = `${cible}.${process.pid}.en-cours`;
  try {
    vacuumInto(cheminBase, travail);
    const c = controlerCopie(travail);
    retirerAnnexes(travail);
    if (c.resultat !== 'ok') throw new Error(`copie invalide : ${c.resultat}`);
    f.avecReprise(() => fs.renameSync(travail, cible));
    ecrire({ ok: true, mode: 'copie-seule', file: cible, bytes: taille(cible), matches: c.rencontres, durationMs: Date.now() - debut, kept: [path.basename(cible)], removed: [] });
  } catch (error) {
    for (const x of [travail, `${travail}-wal`, `${travail}-shm`]) f.supprimerFichier(x);
    ecrire({ ok: false, reason: error.message });
    process.exitCode = 1;
  }
}

/** Ce qu'on garde d'une sauvegarde dans l'état et l'historique (pas les listes). */
function resume(bilan) {
  return {
    ok: true,
    jour: bilan.jour,
    debut: bilan.debut,
    fin: bilan.fin,
    dureeMs: bilan.dureeMs,
    fichier: bilan.base.fichier,
    octets: bilan.base.octetsCompresses,
    octetsBase: bilan.base.octets,
    rencontres: bilan.base.rencontres,
    derniereDate: bilan.base.derniereDate,
    fichierDonnees: bilan.donnees.fichier,
    octetsDonnees: bilan.donnees.octets,
    fichiersDonnees: bilan.donnees.fichiers.length,
    exclus: bilan.donnees.exclus.length,
    avertissements: bilan.donnees.avertissements.length,
    durees: bilan.durees
  };
}

/** Ce que l'état garde de la destination hors disque (jamais l'environnement entier). */
const etatHorsDisque = (reglage, precedent) => ({
  reglage: reglage.reglage,
  type: reglage.type,
  source: reglage.source,
  destination: reglage.destination,
  garder: reglage.garder,
  probleme: reglage.probleme,
  derniereTentative: precedent?.derniereTentative ?? null,
  derniereReussie: precedent?.derniereReussie ?? null
});

async function copieHorsDisqueSiDue({ dossier, reglage, precedent, forcer, jour }) {
  const etat = etatHorsDisque(reglage, precedent);
  if (reglage.reglage !== 'configuree') return { etat, faite: null };
  // Une fois par semaine vers la même destination ; une destination neuve
  // (choix changé) ou encore jamais atteinte : dès cette nuit.
  const dejaFaiteIci = f.memeDossier(etat.derniereReussie?.destination, reglage.destination);
  if (!forcer && dejaFaiteIci && !estDue(etat.derniereReussie?.fin, CADENCE.horsDisqueJours)) return { etat, faite: null };
  const r = await f.copierHorsDisque({ dossierSauvegardes: dossier, destination: reglage.destination, garder: reglage.garder, jour, type: reglage.type, absente: reglage.probleme });
  etat.derniereTentative = r;
  if (r.statut === 'faite') etat.derniereReussie = r;
  return { etat, faite: r };
}

function inventaireEcran(dossier) {
  const inv = f.inventaire(dossier);
  return {
    manuelles: inv.manuelles,
    octetsManuelles: inv.manuelles.reduce((n, x) => n + x.octets, 0),
    autres: inv.autres.length,
    octetsAuto: inv.jeux.reduce((n, j) => n + j.octets, 0)
  };
}

async function sauvegardeDeNuit({ cheminBase, dossier, args }) {
  const debut = new Date();
  const jour = jourParis(debut);
  const noms = nomsDuJour(jour);
  const etats = f.cheminsEtat(dossier);
  const precedent = f.lireEtat(etats.sauvegarde) ?? {};
  const dossierDonnees = args.donnees ? path.resolve(args.donnees) : f.DOSSIER_DONNEES;
  const reglage = destinationEnVigueur({ argument: args['hors-disque'], dossierDonnees });
  fs.mkdirSync(dossier, { recursive: true });
  const abandons = f.nettoyerAbandons(dossier);
  const disque = controlePlace(dossier, cheminBase);
  const baseEtat = { chemin: cheminBase, octets: disque.tailleBase, journalOctets: taille(`${cheminBase}-wal`) };
  const travail = (nom) => path.join(dossier, `${nom}.${process.pid}.en-cours`);
  const copieDb = travail(`cotemaster-${jour}.db`);
  const temporaires = [copieDb, `${copieDb}-wal`, `${copieDb}-shm`, `${copieDb}-journal`, travail(noms.base), travail(noms.donnees)];

  const enregistrer = (etat) => {
    try {
      f.ecrireEtat(etats.sauvegarde, etat);
    } catch (error) {
      console.error(`[sauvegarde] état non enregistré : ${error.message}`);
    }
  };
  const etatCommun = (hd) => ({
    version: VERSION,
    majLe: new Date().toISOString(),
    dossier,
    base: baseEtat,
    disque: { libre: disque.libre, total: disque.total, requis: disque.requis, seuilAlerte: disque.seuilAlerte, niveau: disque.niveau },
    horsDisque: hd
  });

  try {
    if (disque.niveau === 'insuffisante') {
      const e = new Error('espace disque insuffisant');
      e.details = { freeBytes: disque.libre, requiredBytes: disque.requis };
      throw e;
    }
    // 2-3. Copie cohérente, puis contrôle de la copie.
    let t = Date.now();
    vacuumInto(cheminBase, copieDb);
    const dureeCopieMs = Date.now() - t;
    t = Date.now();
    const controle = controlerCopie(copieDb);
    retirerAnnexes(copieDb);
    const dureeControleMs = Date.now() - t;
    if (controle.resultat !== 'ok') throw new Error(`copie invalide (quick_check) : ${controle.resultat}`);

    // 4. Compression en flux, puis la copie non compressée disparaît.
    t = Date.now();
    const gz = await f.compresserGzip(copieDb, travail(noms.base), { niveau: NIVEAU_GZIP });
    const dureeCompressionMs = Date.now() - t;
    f.supprimerFichier(copieDb);

    // 5. Données de l'appli, sans secrets.
    t = Date.now();
    const donnees = f.archiverDonnees({ dossierDonnees, cible: travail(noms.donnees) });
    const dureeArchiveMs = Date.now() - t;

    // 6. Mise en place : la base, les données, puis le bilan (en dernier :
    // un jeu sans bilan à jour se voit à la restauration d'essai).
    f.avecReprise(() => fs.renameSync(travail(noms.base), path.join(dossier, noms.base)));
    f.avecReprise(() => fs.renameSync(travail(noms.donnees), path.join(dossier, noms.donnees)));
    const fin = new Date();
    const bilan = {
      version: VERSION,
      jour,
      debut: debut.toISOString(),
      fin: fin.toISOString(),
      dureeMs: fin - debut,
      methode: `VACUUM INTO (base ouverte en lecture seule), gzip niveau ${NIVEAU_GZIP} ; données de l'appli en .zip`,
      base: {
        source: cheminBase,
        fichier: noms.base,
        octets: gz.octets,
        octetsCompresses: gz.octetsCompresses,
        sha256: gz.sha256,
        sha256Gz: gz.sha256Gz,
        rencontres: controle.rencontres,
        derniereDate: controle.derniereDate,
        quickCheck: controle.resultat,
        tables: controle.tables,
        index: controle.index.length,
        modeJournal: controle.modeJournal
      },
      donnees: { fichier: noms.donnees, dossier: dossierDonnees, ...donnees },
      moteur: f.reglagesMoteur(dossierDonnees),
      durees: { copieMs: dureeCopieMs, controleMs: dureeControleMs, compressionMs: dureeCompressionMs, archiveMs: dureeArchiveMs }
    };
    f.ecrireEtat(path.join(dossier, noms.bilan), bilan);

    // 7. Rotation, seulement maintenant qu'un jeu neuf et complet existe. Une
    // vieille copie qu'on n'arrive pas à supprimer (fichier tenu) ne défait
    // pas la sauvegarde : c'est signalé, et repris la nuit suivante.
    let rotation;
    try {
      rotation = f.appliquerRotation(dossier, undefined, { proteger: [jour] });
    } catch (error) {
      const avecBase = f.inventaire(dossier).jeux.filter(f.aUneBase);
      rotation = {
        politique: POLITIQUE,
        compte: { quotidiennes: 0, hebdomadaires: 0, mensuelles: 0, jeux: avecBase.length },
        gardees: avecBase.map((j) => ({ jour: j.jour, raisons: [], octets: j.octets, ancienFormat: j.ancienFormat, fichiers: Object.values(j.fichiers).map((x) => x.nom) })),
        supprimees: [],
        incomplets: [],
        erreur: String(error.message).slice(0, 300)
      };
    }

    // 8. Hors du disque, une fois par semaine.
    const hd = await copieHorsDisqueSiDue({ dossier, reglage, precedent: precedent.horsDisque, forcer: Boolean(args['hors-disque-maintenant']), jour });

    // 9. État pour l'écran.
    const r = resume(bilan);
    const jeux = Object.fromEntries(
      rotation.gardees.map((g) => [g.jour, g.jour === jour ? { rencontres: r.rencontres, derniereDate: r.derniereDate, octetsBase: r.octetsBase, octets: r.octets, octetsDonnees: r.octetsDonnees, dureeMs: r.dureeMs, fin: r.fin } : precedent.jeux?.[g.jour] ?? null])
    );
    enregistrer({
      ...etatCommun(hd.etat),
      derniere: r,
      derniereReussie: r,
      rotation: { politique: rotation.politique, compte: rotation.compte, gardees: rotation.gardees, supprimees: rotation.supprimees, incomplets: rotation.incomplets, erreur: rotation.erreur ?? null },
      jeux,
      inventaire: inventaireEcran(dossier),
      abandonsRetires: abandons,
      historique: [r, ...(precedent.historique ?? [])].slice(0, HISTORIQUE)
    });
    ecrire({
      ok: true,
      jour,
      file: path.join(dossier, noms.base),
      bytes: gz.octetsCompresses,
      baseBytes: gz.octets,
      matches: controle.rencontres,
      lastDate: controle.derniereDate,
      durationMs: Date.now() - debut.getTime(),
      durees: bilan.durees,
      donnees: { fichier: noms.donnees, octets: donnees.octets, fichiers: donnees.fichiers.length, exclus: donnees.exclus.map((x) => `${x.fichier} (${x.raison})`), avertissements: donnees.avertissements },
      kept: rotation.gardees.map((g) => g.fichiers.find((n) => n.endsWith('.db.gz') || n.endsWith('.db')) ?? g.fichiers[0]),
      removed: rotation.supprimees,
      compte: rotation.compte,
      rotationErreur: rotation.erreur ?? null,
      horsDisque: hd.faite ?? { statut: hd.etat.reglage === 'configuree' ? 'pas-due' : hd.etat.reglage, derniereReussie: hd.etat.derniereReussie?.fin ?? null },
      disque: { libre: disque.libre, requis: disque.requis, niveau: disque.niveau },
      etat: etats.sauvegarde
    });
  } catch (error) {
    for (const x of temporaires) {
      try {
        f.supprimerFichier(x);
      } catch {
        // retiré au prochain passage (nettoyerAbandons)
      }
    }
    const echec = { ok: false, jour, debut: debut.toISOString(), fin: new Date().toISOString(), dureeMs: Date.now() - debut.getTime(), erreur: String(error.message).slice(0, 300) };
    // Un échec n'efface pas le souvenir de la dernière réussite.
    enregistrer({
      ...etatCommun(precedent.horsDisque ?? etatHorsDisque(reglage, null)),
      derniere: echec,
      derniereReussie: precedent.derniereReussie ?? null,
      rotation: precedent.rotation ?? null,
      jeux: precedent.jeux ?? {},
      inventaire: inventaireEcran(dossier),
      abandonsRetires: abandons,
      historique: [echec, ...(precedent.historique ?? [])].slice(0, HISTORIQUE)
    });
    ecrire({ ok: false, reason: echec.erreur, ...(error.details ?? {}), etat: etats.sauvegarde });
    process.exitCode = 1;
  }
}

/** Pas de nouvelle sauvegarde : la copie hors disque du dernier jeu, tout de suite. */
async function horsDisqueSeule({ dossier, args }) {
  const etats = f.cheminsEtat(dossier);
  const precedent = f.lireEtat(etats.sauvegarde) ?? {};
  const reglage = destinationEnVigueur({ argument: args['hors-disque'], dossierDonnees: args.donnees ? path.resolve(args.donnees) : f.DOSSIER_DONNEES });
  if (reglage.reglage !== 'configuree') {
    const pourquoi = { refusee: 'refusée par le choix « Aucune »', illisible: `impossible, choix illisible (${reglage.probleme})`, 'non-configuree': 'non réglée' }[reglage.reglage] ?? reglage.reglage;
    ecrire({ ok: false, reason: `copie hors disque ${pourquoi} : choisissez la destination dans Réglages › Sauvegardes, ou passez --hors-disque <dossier>` });
    process.exitCode = 1;
    return;
  }
  const hd = await copieHorsDisqueSiDue({ dossier, reglage, precedent: precedent.horsDisque, forcer: true, jour: null });
  f.ecrireEtat(etats.sauvegarde, { ...precedent, version: VERSION, majLe: new Date().toISOString(), dossier, horsDisque: hd.etat });
  ecrire({ ok: hd.faite?.statut === 'faite', horsDisque: hd.faite, etat: etats.sauvegarde });
  if (hd.faite?.statut !== 'faite') process.exitCode = 1;
}

async function main() {
  const args = lireArgs(process.argv.slice(2));
  const cheminBase = resolveDbPath();
  // Le dossier est contrôlé AVANT tout : dans le bac à sable, jamais hors du bac.
  const dossier = f.gardeEcriture(args.dir ?? f.dossierSauvegardesParDefaut(cheminBase), 'écriture des sauvegardes');
  if (args['copie-seule'] || (args.keep !== undefined && args.dir !== undefined)) return copieSeule({ cheminBase, dossier });
  if (args['hors-disque-seule']) return horsDisqueSeule({ dossier, args });
  return sauvegardeDeNuit({ cheminBase, dossier, args });
}

main().catch((error) => {
  ecrire({ ok: false, reason: String(error.message).slice(0, 500) });
  process.exitCode = 1;
});
