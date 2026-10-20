#!/usr/bin/env node
/**
 * data-health.mjs — les contrôles des données et le carnet de santé.
 * -----------------------------------------------------------------------
 * Étape 12 du plan (06/10/2026). Passe le magasin en revue (doublons,
 * mauvaise compétition, manquants, chiffres impossibles, zéros « non
 * relevés », clubs et joueurs mal identifiés) et compte, championnat par
 * championnat et saison par saison, la part des matchs qui ont leurs xG,
 * tirs, corners, cartons, joueurs et compositions. NE CORRIGE RIEN : écrit un
 * état préparé, data/runtime/carnet-sante.json, que lit la carte « Carnet de
 * santé » de Réglages (GET /api/match-stats/health). La logique est dans
 * src/data/db/dataHealth.js.
 *
 *   node scripts/data-health.mjs                  passe de nuit : les rencontres
 *                                                 nouvelles ou modifiées depuis le
 *                                                 dernier contrôle (complet s'il n'y
 *                                                 a pas encore de carnet, ou plus de
 *                                                 SEUIL_NUIT rencontres à refaire)
 *   node scripts/data-health.mjs --complet        tout le magasin
 *   node scripts/data-health.mjs --complet --calendrier-fotmob
 *                                                 + les pages de compétition FotMob,
 *                                                 toutes saisons depuis 2022/2023
 *                                                 (RÉSEAU : ~340 requêtes gratuites,
 *                                                 2 à la fois, ~1 min, mesuré le 06/10/2026)
 *   --omissions <fichier|->   le rapport de l'étape « omissions » de la passe
 *                             (findFixtureGaps, saison en cours), repris sans requête
 *   --dans-la-passe           lancé par l'actualisation, qui tient DÉJÀ le verrou :
 *                             vérifié (le verrou doit être celui du processus parent)
 *   --sans-ecrire             calcule et résume, n'écrit pas le carnet
 *
 * JAMAIS PENDANT UN IMPORT NI EN PARALLÈLE : seul, le script prend le verrou
 * d'actualisation (refreshLock.js) et ne fait rien s'il est tenu ; lancé par la
 * passe, il exige que le verrou soit celui de son parent. La base est ouverte
 * en LECTURE SEULE : le contrôle n'y écrit jamais.
 *
 * RENDRE LA MAIN (retouche du 07/10/2026 au soir) : le contrôle complet
 * durait 77 s d'une traite sur la base du bac, sans jamais laisser respirer la
 * boucle d'événements de son processus. Il la laisse maintenant respirer au
 * plus toutes les 25 ms de travail (utils/travailCooperatif.js) — la lecture
 * du calendrier de saison (18 Mo) et la décision « nuit ou complet » aussi —
 * et dit le plus long moment passé sans la rendre (`blocMaxMs`, `blocMaxOu`,
 * `pauses` du bilan). Lancé par l'actualisation, il tourne dans un processus
 * à part : le serveur n'a jamais été tenu par ces 77 s ; ce qui est garanti
 * ici vaut pour le processus du contrôle et pour tout appel dans le serveur.
 *
 * Sortie : le détail sur stderr, une ligne JSON de bilan sur stdout.
 * -----------------------------------------------------------------------
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { resolveDbPath } from '../src/data/db/matchStatsDb.js';
import { controleComplet, controleDeNuit, pourquoiPasDeNuitParMorceaux } from '../src/data/db/dataHealth.js';
import { matchsEnCoursDuCalendrier } from '../src/data/db/standingsCheck.js';
import { lireCarnet, ecrireCarnet, mettreDeCote, CARNET_FILE } from '../src/data/repositories/dataHealthRepository.js';
import { withRefreshLock, lockHolder } from '../src/data/providers/refreshLock.js';
import { creerPauses, executerEnRendantLaMain, lireJsonEnDeuxTemps } from '../src/utils/travailCooperatif.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(__dirname, '../data/runtime');
const CALENDRIER = path.join(RUNTIME, 'season-calendar.json');
const RESULTATS = path.join(RUNTIME, 'match-results.json');
/** Si la base paraît vidée par rapport au carnet précédent, on n'écrit rien (journal masquant ?). */
const BAISSE_SUSPECTE = 0.5;

function lireArgs(argv) {
  const a = { complet: false, fotmob: false, omissions: null, dansLaPasse: false, sansEcrire: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--complet') a.complet = true;
    else if (x === '--calendrier-fotmob') a.fotmob = true;
    else if (x === '--dans-la-passe') a.dansLaPasse = true;
    else if (x === '--sans-ecrire') a.sansEcrire = true;
    else if (x === '--omissions') {
      a.omissions = argv[++i];
      if (!a.omissions) throw new Error("--omissions attend un fichier, ou « - » pour l'entrée standard.");
    } else throw new Error(`Option inconnue : ${x}`);
  }
  return a;
}

async function lireOmissions(source) {
  if (!source) return null;
  if (source === '-') {
    let texte = '';
    for await (const morceau of process.stdin) texte += morceau;
    return texte.trim() ? JSON.parse(texte) : null;
  }
  return JSON.parse(fs.readFileSync(source, 'utf8'));
}

async function controler(args) {
  const omissions = await lireOmissions(args.omissions);
  const fichierBase = resolveDbPath();
  // Lecture seule : rien n'est écrit dans la base, quoi qu'il arrive.
  const database = new DatabaseSync(fichierBase, { readOnly: true });
  try {
    const lu = lireCarnet();
    let precedent = lu.etat === 'pret' ? lu.carnet : null;
    let misDeCote = null;
    if (lu.etat === 'illisible') {
      misDeCote = args.sansEcrire ? null : mettreDeCote();
      console.error(`[carnet] carnet illisible (${lu.erreur})${misDeCote ? ` : mis de côté sous ${path.basename(misDeCote)}` : ''} ; contrôle complet.`);
    }
    const journal = (ligne) => console.error(ligne);
    const communs = { database, calendarPath: CALENDRIER, resultsPath: RESULTATS, maintenant: new Date(), journal };
    // Ce qui précède le contrôle (la décision « nuit ou complet », la lecture du calendrier) rend la main lui aussi.
    const rythme = creerPauses();
    const cooperer = (travail) => executerEnRendantLaMain(travail, rythme.siLongtemps);
    let etat = null;
    // Les matchs du calendrier pas encore terminés, d'aujourd'hui ou d'hier
    // (retouche du 12/10/2026) : le classement officiel, relevé en direct, les
    // compte déjà ; l'écart qu'ils expliquent est une information, pas une
    // anomalie (standingsCheck.js). Le calendrier est lu une fois, pour les deux
    // modes ; illisible, rien n'est mis à part (l'écart reste une anomalie).
    let calendrier = null;
    let calendrierLu = false;
    try {
      calendrier = await cooperer(lireJsonEnDeuxTemps(CALENDRIER, null, 'calendrier de saison'));
      calendrierLu = true;
    } catch (error) {
      console.error(`[carnet] calendrier de saison illisible (${String(error.message).slice(0, 160)}) : aucun écart de classement mis à part pour un match en cours.`);
    }
    const enCours = Array.isArray(calendrier) ? matchsEnCoursDuCalendrier(calendrier, { maintenant: communs.maintenant }) : null;
    // Pourquoi tout relire : demandé, pas de carnet (ou illisible), ou trop de
    // rencontres modifiées depuis le dernier contrôle (SEUIL_NUIT).
    let raison = args.complet ? 'demandé à la ligne de commande' : lu.etat === 'illisible' ? `carnet illisible : ${String(lu.erreur).slice(0, 120)}` : await cooperer(pourquoiPasDeNuitParMorceaux(database, precedent));
    if (!raison) etat = await controleDeNuit({ ...communs, precedent, omissions, enCours });
    if (!etat) {
      raison ??= 'passe de nuit impossible';
      if (!calendrierLu) calendrier = await cooperer(lireJsonEnDeuxTemps(CALENDRIER, null, 'calendrier de saison'));
      let lireCalendriersFotmob = null;
      let saisonMinFotmob = null;
      if (args.fotmob) {
        // Réseau (FotMob, gratuit) : seulement sur demande, jamais dans un test.
        // Les pages depuis la saison qui précède la première du magasin : ce
        // qu'elle a de joué est compté hors du périmètre, pas signalé.
        const { findFixtureGaps, PREMIERE_SAISON } = await import('../src/data/providers/fotMobFixtureGaps.js');
        saisonMinFotmob = PREMIERE_SAISON;
        lireCalendriersFotmob = () => findFixtureGaps({ scope: 'all', premiereSaison: PREMIERE_SAISON - 1, concurrency: 2, database });
      }
      // Le rapport d'omissions de la passe compte aussi pour un contrôle complet.
      etat = await controleComplet({ ...communs, calendrier, lireCalendriersFotmob, saisonMinFotmob, omissions, precedent, raison, enCours });
    }
    etat.base = fichierBase;
    etat.fichier = CARNET_FILE;
    const avant = precedent?.controle?.rencontresAuMagasin ?? null;
    const maintenant = etat.controle.rencontresAuMagasin;
    if (avant && maintenant < avant * BAISSE_SUSPECTE) {
      return { refus: `la base ne montre que ${maintenant} rencontres contre ${avant} au contrôle précédent (journal qui masque la base ?) : rien n'est écrit.`, ecrit: false };
    }
    if (!args.sansEcrire) ecrireCarnet(etat);
    const c = etat.controle;
    return {
      ecrit: !args.sansEcrire,
      mode: c.mode,
      raison: c.raison ?? null,
      dureeMs: c.dureeMs,
      rencontresControlees: c.rencontresControlees,
      rencontresAuMagasin: c.rencontresAuMagasin,
      saisonsRecomptees: c.saisonsRecomptees,
      anomalies: etat.anomalies.length,
      nouvellesAnomalies: c.nouvellesAnomalies,
      nouvellesErreurs: c.nouvellesErreurs ?? null,
      anomaliesLevees: c.anomaliesLevees,
      parType: Object.fromEntries(Object.entries(etat.parType).map(([k, v]) => [k, v.total])),
      totaux: { matchs: etat.totaux.matchs, moyenne: etat.totaux.moyenne, pourcent: etat.totaux.pourcent },
      fotmob: c.fotmob?.lu ? { signalees: c.fotmob.signalees, ecartees: c.fotmob.ecartees, horsPerimetre: (c.fotmob.horsPerimetre ?? []).reduce((n, x) => n + x.matchs, 0), echecs: c.fotmob.echecs?.length ?? 0 } : null,
      omissions: c.omissions,
      temps: c.temps,
      // Le plus long moment passé sans rendre la main au processus du contrôle, et où il s'est terminé.
      blocMaxMs: c.blocMaxMs ?? null,
      blocMaxOu: c.blocMaxOu ?? null,
      pauses: c.pauses ?? null,
      fichier: CARNET_FILE,
      misDeCote
    };
  } finally {
    database.close();
  }
}

const args = lireArgs(process.argv.slice(2));
let bilan;
if (args.dansLaPasse) {
  // La passe d'actualisation (le processus parent) tient le verrou : on ne le
  // reprend pas, mais on vérifie que c'est bien elle.
  const detenteur = lockHolder();
  if (!detenteur || detenteur.pid !== process.ppid) {
    bilan = { refus: `--dans-la-passe : le verrou d'actualisation n'est pas tenu par le processus parent (${detenteur ? `tenu par ${detenteur.pid}` : 'libre'}) — rien fait.`, ecrit: false };
  } else bilan = await controler(args);
} else {
  const r = await withRefreshLock(() => controler(args), { stamp: false });
  bilan = r?.skipped ? { reporte: `verrou d'actualisation tenu par un autre processus (import ou passe en cours) : rien fait.`, ecrit: false } : r;
}
console.log(JSON.stringify(bilan));
