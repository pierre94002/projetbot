#!/usr/bin/env node
/**
 * restore-test-db.mjs — restauration d'essai de la dernière sauvegarde.
 * -----------------------------------------------------------------------
 * Étape 1 du plan CôteMaster. Une sauvegarde qu'on n'a jamais relue n'est
 * qu'un espoir : une fois par semaine (--si-du, depuis l'étape « sauvegarde »
 * de l'actualisation), ce script
 *   1. décompresse la dernière sauvegarde dans un dossier TEMPORAIRE, à côté
 *      des sauvegardes (restauration-essai.<processus>.en-cours) — jamais sur
 *      la base vivante, jamais à côté de ses fichiers -wal/-shm ;
 *   2. vérifie qu'elle redonne la base octet pour octet (empreinte du bilan) ;
 *   3. l'ouvre en LECTURE SEULE : PRAGMA quick_check — ou integrity_check, le
 *      contrôle complet (index compris), une fois tous les 28 jours ou avec
 *      --complet — ; compte les rencontres, lit la dernière date, et compare
 *      au bilan écrit le soir de la sauvegarde ; vérifie que les index que le
 *      code crée sont tous là ;
 *   4. relit l'archive des données de l'appli (chaque fichier, son CRC) et
 *      vérifie qu'aucun secret n'y est entré ;
 *   5. supprime la copie temporaire, puis écrit son rapport dans
 *      etat-restauration.json, à côté des sauvegardes (hors OneDrive : pas
 *      de verrou).
 *
 * Sortie : une ligne JSON. Code 0 si la copie est saine (ou si l'essai n'était
 * pas dû), 1 sinon.
 *
 *   node scripts/restore-test-db.mjs [--dir <dossier>] [--si-du] [--complet] [--fichier <nom du .db.gz ou .db>]
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveDbPath, indexAttendus } from '../src/data/db/matchStatsDb.js';
import { CADENCE, estDue, joursEntre, nomTempRestauration, classerNom, MARGE_COPIE } from '../src/data/sauvegardes/planSauvegardes.js';
import * as f from '../src/data/sauvegardes/fichiersSauvegarde.js';
import { controlerCopie, retirerAnnexes, assertPasLaBaseVivante } from '../src/data/sauvegardes/controleCopie.js';

const VERSION = 1;
const HISTORIQUE = 12;
/** Une baisse plus forte du nombre de rencontres d'un essai à l'autre est signalée. */
const BAISSE_SIGNALEE = 0.01;
/** Une dernière date plus vieille que ça au jour de la sauvegarde : la base ne se met plus à jour ? */
const DERNIERE_DATE_VIEILLE_JOURS = 10;

function lireArgs(argv) {
  const avecValeur = new Set(['--dir', '--fichier']);
  const drapeaux = new Set(['--si-du', '--complet']);
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
      throw new Error(`Option inconnue : ${a}. Options : --dir <dossier>, --si-du, --complet, --fichier <nom>.`);
    }
  }
  return args;
}

const ecrire = (objet) => console.log(JSON.stringify(objet));

/** La sauvegarde à essayer : celle demandée, sinon la plus récente qui a sa base. */
function choisirSauvegarde(dossier, nom) {
  const inv = f.inventaire(dossier);
  if (nom) {
    const c = classerNom(path.basename(nom));
    const jeu = c && (c.type === 'jeu' || c.type === 'ancienne') ? inv.jeux.find((j) => j.jour === c.jour) : null;
    const fichier = jeu && Object.values(jeu.fichiers).find((x) => x.nom === path.basename(nom));
    if (!fichier || !/\.db(\.gz)?$/.test(fichier.nom)) throw new Error(`${nom} n'est pas une sauvegarde de base de ${dossier} (cotemaster-AAAA-MM-JJ.db.gz ou auto-AAAA-MM-JJ.db).`);
    return { jeu, fichier };
  }
  const jeu = inv.jeux.find(f.aUneBase);
  if (!jeu) return null;
  return { jeu, fichier: jeu.fichiers.base ?? jeu.fichiers.ancienne };
}

async function main() {
  const debut = new Date();
  const args = lireArgs(process.argv.slice(2));
  const cheminBase = resolveDbPath();
  const dossier = f.gardeEcriture(args.dir ?? f.dossierSauvegardesParDefaut(cheminBase), 'restauration d\'essai');
  const etats = f.cheminsEtat(dossier);
  const etat = f.lireEtat(etats.restauration) ?? {};

  // Due ? Jamais faite, dernière pas saine, ou dernière saine il y a 7 jours ou plus.
  const due = estDue(etat.derniereSaine?.fin, CADENCE.restaurationJours) || etat.derniere?.saine === false;
  if (args['si-du'] && !due) {
    ecrire({ ok: true, fait: false, raison: `pas due : dernière restauration d'essai saine le ${etat.derniereSaine.fin}`, derniereSaine: etat.derniereSaine, etat: etats.restauration });
    return;
  }
  const complet = Boolean(args.complet) || estDue(etat.dernierControleComplet?.fin, CADENCE.controleCompletJours);

  const choix = choisirSauvegarde(dossier, args.fichier);
  const temp = path.join(dossier, nomTempRestauration());
  const copie = path.join(temp, 'match-stats.db');
  const enregistrer = (rapport) => {
    const suite = { ...etat, version: VERSION, majLe: new Date().toISOString(), dossier, derniere: rapport };
    if (rapport.saine === true) suite.derniereSaine = rapport;
    if (rapport.saine === true && rapport.controle === 'integrity_check') suite.dernierControleComplet = { fin: rapport.fin, jourSauvegarde: rapport.sauvegarde?.jour, dureeMs: rapport.durees?.controleMs ?? null, resultat: 'ok' };
    suite.historique = [rapport, ...(etat.historique ?? [])].slice(0, HISTORIQUE);
    try {
      f.ecrireEtat(etats.restauration, suite);
    } catch (error) {
      console.error(`[restauration d'essai] rapport non enregistré : ${error.message}`);
    }
  };

  if (!choix) {
    const rapport = { fait: true, saine: null, debut: debut.toISOString(), fin: new Date().toISOString(), impossible: `aucune sauvegarde dans ${dossier}` };
    enregistrer(rapport);
    ecrire({ ok: false, ...rapport, etat: etats.restauration });
    process.exitCode = 1;
    return;
  }

  const { jeu, fichier } = choix;
  const source = path.join(dossier, fichier.nom);
  const compresse = fichier.nom.endsWith('.gz');
  const bilan = jeu.fichiers.bilan ? f.lireEtat(path.join(dossier, jeu.fichiers.bilan.nom), { mettreDeCote: false }) : null;
  const attendu = bilan?.base ?? null;
  const sauvegarde = { jour: jeu.jour, fichier: source, octets: fichier.octets, ancienFormat: !compresse, bilan: jeu.fichiers.bilan ? path.join(dossier, jeu.fichiers.bilan.nom) : null };
  const durees = {};
  try {
    assertPasLaBaseVivante(source);
    f.nettoyerAbandons(dossier);
    // Place : la base décompressée + 2 Go de marge.
    const tailleAttendue = attendu?.octets ?? (compresse ? f.tailleAnnonceeGzip(source) : fichier.octets) ?? 0;
    const { libre } = f.placeLibre(dossier);
    if (libre !== null && libre < tailleAttendue + MARGE_COPIE) {
      throw Object.assign(new Error(`place insuffisante : ${Math.round(libre / 1048576)} Mo libres, il en faut ${Math.round((tailleAttendue + MARGE_COPIE) / 1048576)}`), { impossible: true });
    }
    fs.mkdirSync(f.gardeEcriture(temp, 'dossier temporaire de restauration'));

    // 1. Décompression (ou copie, pour l'ancien format).
    let t = Date.now();
    const restaure = compresse ? await f.decompresserGzip(source, copie) : await f.copierAvecEmpreinte(source, copie);
    durees.decompressionMs = Date.now() - t;

    // 3. Contrôle, en lecture seule.
    t = Date.now();
    const c = controlerCopie(copie, { complet });
    durees.controleMs = Date.now() - t;
    retirerAnnexes(copie);
    const attendus = indexAttendus();
    const indexManquants = attendus.filter((n) => !c.index.includes(n));

    // 4. L'archive des données de l'appli.
    let donnees = null;
    if (jeu.fichiers.donnees) {
      t = Date.now();
      const entrees = f.lireZip(fs.readFileSync(path.join(dossier, jeu.fichiers.donnees.nom)), { garderDonnees: true });
      const secrets = f.secretsConnus();
      donnees = {
        fichier: jeu.fichiers.donnees.nom,
        fichiers: entrees.length,
        abimes: entrees.filter((e) => !e.ok).map((e) => e.nom),
        jsonInvalides: entrees.filter((e) => e.ok && /\.json$/i.test(e.nom)).filter((e) => {
          try {
            JSON.parse(e.donnees.toString('utf8').replace(/^﻿/, ''));
            return false;
          } catch {
            return true;
          }
        }).map((e) => e.nom),
        // Défense en profondeur : rien qui ressemble à un secret, ni par le nom ni par le contenu.
        interdits: entrees.filter((e) => f.exclusParNom(path.basename(e.nom)) || (e.donnees && f.contientSecret(e.donnees, secrets))).map((e) => e.nom),
        attendus: bilan?.donnees?.fichiers?.length ?? null
      };
      durees.archiveMs = Date.now() - t;
    }

    // Supprimée AVANT le rapport : un essai ne laisse jamais de copie derrière lui.
    f.viderDossierTemp(temp);

    const problemes = [];
    const avertissements = [];
    if (c.resultat !== 'ok') problemes.push(`${complet ? "contrôle d'intégrité complet" : 'contrôle rapide'} : ${c.resultat}`);
    if (attendu?.sha256 && restaure.sha256 !== attendu.sha256) problemes.push('la base restaurée ne redonne pas la base sauvegardée octet pour octet (empreinte différente du bilan)');
    if (attendu?.octets && restaure.octets !== attendu.octets) problemes.push(`${restaure.octets} octets restaurés au lieu de ${attendu.octets}`);
    if (attendu && attendu.rencontres !== undefined && c.rencontres !== attendu.rencontres) problemes.push(`${c.rencontres} rencontres au lieu des ${attendu.rencontres} comptées le soir de la sauvegarde`);
    if (attendu?.derniereDate && c.derniereDate !== attendu.derniereDate) problemes.push(`dernière date ${c.derniereDate} au lieu de ${attendu.derniereDate}`);
    if (donnees?.abimes.length) problemes.push(`archive des données : ${donnees.abimes.length} fichier(s) abîmé(s)`);
    if (donnees?.interdits.length) problemes.push(`archive des données : ${donnees.interdits.length} fichier(s) qui n'auraient jamais dû y entrer (secret)`);
    if (donnees && donnees.attendus !== null && donnees.fichiers !== donnees.attendus) problemes.push(`archive des données : ${donnees.fichiers} fichiers au lieu de ${donnees.attendus}`);
    if (!bilan) avertissements.push(compresse ? 'bilan absent : rien à quoi comparer le nombre de rencontres ni l\'empreinte' : "sauvegarde à l'ancien format : rien à quoi comparer le nombre de rencontres ni l'empreinte");
    if (!jeu.fichiers.donnees && compresse) avertissements.push('archive des données absente de ce jeu');
    if (donnees?.jsonInvalides.length) avertissements.push(`archive des données : ${donnees.jsonInvalides.length} JSON invalide(s) déjà sur le disque le soir de la sauvegarde (${donnees.jsonInvalides.slice(0, 3).join(', ')})`);
    if (indexManquants.length) avertissements.push(`index absents de la copie : ${indexManquants.join(', ')} (le serveur les recrée à son prochain démarrage)`);
    const precedente = etat.derniereSaine;
    if (precedente?.rencontres && c.rencontres < precedente.rencontres * (1 - BAISSE_SIGNALEE)) {
      avertissements.push(`baisse de ${precedente.rencontres - c.rencontres} rencontres depuis l'essai du ${precedente.fin.slice(0, 10)} (${precedente.rencontres} → ${c.rencontres})`);
    }
    if (c.derniereDate && joursEntre(c.derniereDate, jeu.jour) > DERNIERE_DATE_VIEILLE_JOURS) {
      avertissements.push(`dernière rencontre du ${c.derniereDate}, ${joursEntre(c.derniereDate, jeu.jour)} jours avant la sauvegarde : la base se met-elle encore à jour ?`);
    }

    const fin = new Date();
    durees.totalMs = fin - debut;
    const rapport = {
      fait: true,
      saine: problemes.length === 0,
      debut: debut.toISOString(),
      fin: fin.toISOString(),
      sauvegarde,
      controle: c.controle,
      resultat: c.resultat,
      rencontres: c.rencontres,
      attendues: attendu?.rencontres ?? null,
      derniereDate: c.derniereDate,
      derniereDateAttendue: attendu?.derniereDate ?? null,
      empreinte: attendu?.sha256 ? (restaure.sha256 === attendu.sha256 ? 'identique' : 'différente') : 'non vérifiable',
      octetsRestaures: restaure.octets,
      tables: c.tables,
      index: c.index.length,
      indexManquants,
      modeJournal: c.modeJournal,
      donnees,
      problemes,
      avertissements,
      durees,
      dossierTemporaire: temp,
      copieSupprimee: !fs.existsSync(temp)
    };
    enregistrer(rapport);
    ecrire({ ok: rapport.saine, ...rapport, etat: etats.restauration });
    if (!rapport.saine) process.exitCode = 1;
  } catch (error) {
    try {
      if (fs.existsSync(copie)) retirerAnnexes(copie);
      f.viderDossierTemp(temp);
    } catch {
      // retiré au prochain essai (nettoyerAbandons)
    }
    // Une panne de l'essai lui-même (place, disque plein, fichier tenu) n'est
    // pas un verdict sur la copie ; une décompression ou une ouverture qui
    // échoue, si.
    const impossible = error.impossible || ['ENOSPC', 'EBUSY', 'EPERM', 'EACCES'].includes(error.code);
    const rapport = {
      fait: true,
      saine: impossible ? null : false,
      debut: debut.toISOString(),
      fin: new Date().toISOString(),
      sauvegarde,
      ...(impossible ? { impossible: String(error.message).slice(0, 300) } : { problemes: [String(error.message).slice(0, 300)] }),
      durees,
      dossierTemporaire: temp,
      copieSupprimee: !fs.existsSync(temp)
    };
    enregistrer(rapport);
    ecrire({ ok: false, ...rapport, etat: etats.restauration });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  ecrire({ ok: false, reason: String(error.message).slice(0, 500) });
  process.exitCode = 1;
});
