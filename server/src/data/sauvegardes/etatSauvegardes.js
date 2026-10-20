/**
 * etatSauvegardes.js — l'état des sauvegardes tel que l'écran le montre.
 * -----------------------------------------------------------------------
 * Étape 1 du plan CôteMaster. Lit ce que les scripts ont PRÉPARÉ
 * (etat-sauvegarde.json, etat-restauration.json, à côté des sauvegardes) et
 * y ajoute quelques mesures du moment, toutes immédiates : taille de la base
 * et de son journal (simple lecture de la taille des fichiers, jamais une
 * ouverture), place libre, liste du dossier, destination hors disque en
 * vigueur (choix enregistré, variable ou OneDrive par défaut :
 * destinationHorsDisque.js) et sa vérification, sans rien écrire. Jamais de
 * calcul lourd au chargement de l'écran.
 *
 * Sert les routes /api/backups et l'étape « sauvegarde » de l'actualisation
 * (qui en tire l'alerte durable du haut de l'appli).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveDbPath } from '../db/matchStatsDb.js';
import { POLITIQUE, CADENCE, planRotation, compterParType, placeDisque, alertesSauvegarde, jourParis, joursEntre } from './planSauvegardes.js';
import * as f from './fichiersSauvegarde.js';
import { destinationEnVigueur, verifierDestination } from './destinationHorsDisque.js';

const taille = (abs) => {
  try {
    return fs.statSync(abs).size;
  } catch {
    return null;
  }
};

/** Jour (Paris) où un essai périodique redevient dû ; null s'il l'est déjà. */
function prochaine(derniere, periodeJours, maintenant) {
  if (!derniere) return null;
  const j = jourParis(derniere);
  const echeance = new Date(Date.parse(`${j}T12:00:00Z`) + periodeJours * 86_400_000).toISOString().slice(0, 10);
  return joursEntre(jourParis(maintenant), echeance) > 0 ? echeance : null;
}

/**
 * `dossier` (dossier des sauvegardes) et `donnees` (data/runtime, où vit le
 * choix de la destination hors disque) : seulement pour les essais ; sinon
 * ceux de l'appli. `environnement` : pour détecter OneDrive (essais).
 */
export function etatSauvegardes({ maintenant = new Date(), dossier: dossierImpose = null, donnees = null, environnement = process.env } = {}) {
  let cheminBase = null;
  let erreurBase = null;
  try {
    cheminBase = resolveDbPath();
  } catch (error) {
    erreurBase = error.message;
  }
  const dossier = dossierImpose ? path.resolve(dossierImpose) : cheminBase ? f.dossierSauvegardesParDefaut(cheminBase) : null;
  const fichiersEtat = dossier ? f.cheminsEtat(dossier) : null;
  const sauvegarde = fichiersEtat ? f.lireEtat(fichiersEtat.sauvegarde, { mettreDeCote: false }) : null;
  const restauration = fichiersEtat ? f.lireEtat(fichiersEtat.restauration, { mettreDeCote: false }) : null;

  const base = { chemin: cheminBase, octets: cheminBase ? taille(cheminBase) : null, journalOctets: cheminBase ? taille(`${cheminBase}-wal`) ?? 0 : null, erreur: erreurBase };
  const mesure = dossier ? f.placeLibre(fs.existsSync(dossier) ? dossier : path.dirname(dossier)) : { libre: null, total: null };
  const disque = { total: mesure.total, ...placeDisque(mesure.libre, base.octets ?? 0) };

  // La liste du dossier, telle qu'elle est maintenant, et ce que chaque
  // copie représente dans la rotation.
  const inv = dossier ? f.inventaire(dossier) : { present: false, jeux: [], manuelles: [], autres: [], travail: [], tempRestauration: [] };
  const avecBase = inv.jeux.filter(f.aUneBase);
  const plan = planRotation(avecBase.map((j) => j.jour));
  const copies = avecBase.map((j) => {
    const detail = sauvegarde?.jeux?.[j.jour] ?? null;
    return {
      jour: j.jour,
      raisons: plan.garder.get(j.jour) ?? ['à retirer à la prochaine rotation'],
      ancienFormat: j.ancienFormat,
      octets: j.octets,
      fichiers: j.fichiers,
      rencontres: detail?.rencontres ?? null,
      derniereDate: detail?.derniereDate ?? null,
      octetsBase: detail?.octetsBase ?? null
    };
  });

  // La copie hors du disque : la destination en vigueur, d'où elle vient, et
  // si elle est utilisable maintenant (rien n'est écrit pour le savoir).
  const destination = destinationEnVigueur({ ...(donnees ? { dossierDonnees: path.resolve(donnees) } : {}), environnement });
  const tailleCopie = f.tailleDernierJeu(dossier, inv);
  const hd = sauvegarde?.horsDisque ?? null;
  const reussieIci = f.memeDossier(hd?.derniereReussie?.destination, destination.destination) ? hd.derniereReussie : null;
  const horsDisque = {
    ...destination,
    presente: destination.reglage === 'configuree' ? f.destinationPresente(destination.destination) : null,
    verification:
      destination.reglage === 'configuree'
        ? verifierDestination({ type: destination.type, chemin: destination.type === 'dossier' ? destination.destination : null, environnement, dossierSauvegardes: dossier, tailleCopie, maintenant })
        : null,
    tailleCopie,
    derniereTentative: hd?.derniereTentative ?? null,
    derniereReussie: hd?.derniereReussie ?? null,
    // Une destination neuve (choix changé) reçoit sa copie dès la nuit suivante.
    prochaine: destination.reglage === 'configuree' && reussieIci ? prochaine(reussieIci.fin, CADENCE.horsDisqueJours, maintenant) : null
  };

  return {
    genereLe: maintenant.toISOString(),
    dossier,
    dossierPresent: inv.present,
    fichiersEtat,
    politique: POLITIQUE,
    cadence: CADENCE,
    base,
    disque,
    derniere: sauvegarde?.derniere ?? null,
    derniereReussie: sauvegarde?.derniereReussie ?? null,
    historique: sauvegarde?.historique ?? [],
    etatPrepareLe: sauvegarde?.majLe ?? null,
    copies,
    compte: compterParType(plan.garder),
    octetsAuto: inv.jeux.reduce((n, j) => n + j.octets, 0),
    incomplets: inv.jeux.filter((j) => !f.aUneBase(j)).map((j) => ({ jour: j.jour, fichiers: Object.values(j.fichiers).map((x) => x.nom) })),
    manuelles: inv.manuelles,
    octetsManuelles: inv.manuelles.reduce((n, x) => n + x.octets, 0),
    autres: inv.autres.map((x) => x.nom),
    enCours: inv.travail.length > 0 || inv.tempRestauration.length > 0,
    restauration: {
      derniere: restauration?.derniere ?? null,
      derniereSaine: restauration?.derniereSaine ?? null,
      dernierControleComplet: restauration?.dernierControleComplet ?? null,
      historique: (restauration?.historique ?? []).slice(0, 6),
      prochaine: prochaine(restauration?.derniereSaine?.fin, CADENCE.restaurationJours, maintenant),
      prochainControleComplet: prochaine(restauration?.dernierControleComplet?.fin, CADENCE.controleCompletJours, maintenant),
      majLe: restauration?.majLe ?? null
    },
    horsDisque,
    alertes: alertesSauvegarde({ sauvegarde, restauration, horsDisque, disque, maintenant })
  };
}
