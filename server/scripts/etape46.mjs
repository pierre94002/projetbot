#!/usr/bin/env node
/**
 * etape46.mjs — L'ÉTAPE 0 DE LA PRÉDICTION EN DIRECT (étape 46 du plan, lot 1, partie A, 11/11/2026), dans le BAC À SABLE
 * (patron : scripts/etape39.mjs). Conception § 5.3, corrigée par la critique du 11/11 (R6, R14, R16, R35 point 3, R36
 * points 2 et 3) et par la consigne d'écriture du lot 1 (P7 : aucun regard).
 * -----------------------------------------------------------------------
 *   --restaurer --sauvegarde <gz> --bilan <json> --passe <refresh-status.json> [--cible <db>]
 *       décompresse une sauvegarde de l'appli (le .gz est seulement LU) dans le bac (banc46\base\match-stats.db par défaut),
 *       vérifie le sha256 du bilan, ouvre la copie en LECTURE SEULE (quick_check) et compte les rencontres. Exige 8 Go
 *       libres avant ; la passe de Pierre est attendue d'abord (R36 point 2) ; jamais une cible existante.
 *   --libelles [--base <db>] [--dossier <dir>]
 *       les FAITS de `live_snapshots` (aucune issue, aucune probabilité) → libelles.txt et libelles.json :
 *       les requêtes du dossier § 1.6 ; les PATRONS des libellés (chiffres → 9), sans LIMIT, avec hex, compte, plus petit et
 *       plus grand exemple, par statut (R6 point 1a) ; minute et ajout à partir de la 45e, par championnat (R6 point 1b) ;
 *       les libellés pris plus de 110 minutes après le coup d'envoi (R6 point 1c) ; la part des matchs suivis avec au moins
 *       un rouge lu, l'âge du dernier détail à chaque instantané (médiane, 75e, 90e centiles), la part des instantanés de la
 *       liste seule (R16 point 1) et la règle de R16 telle qu'écrite au projet des règles du banc (§ 7) AVANT ce mode.
 *   --mesurer-additionnel [--base <db>] [--dossier <dir>]
 *       sur la fenêtre DÉJÀ VUE 2023-07-01 → 2026-09-23 seulement (celle où PARAMS a été appris) → additionnel.json :
 *       la table RESTE_ADDITIONNEL de la conception § 2.5 (comptes q, S, reste) et, dans le même passage, les buts moyens
 *       de chaque championnat de la règle simple « championnat » (R14), rappelés vers LOI_TABLE (1,45 / 1,15 sur 30).
 *   --recopier-additionnel [--additionnel <json>]
 *       ÉCRIT les deux tables dans src/data/direct/reglagesDirect.js, entre leurs balises, PAR SCRIPT (jamais à la main),
 *       puis relit le module pour vérifier la recopie.
 *
 * LES MODES DU BANC (partie C, 12/11/2026 ; règles du banc en PROJET, critique R1, R13 à R22, R36) — à la manœuvre du
 * scellement seulement (SCR46\manoeuvre-scellement-et-passages.md), jamais sur de vraies données avant :
 *   --fixer-colonne <adoptee|non-adoptee> [--remplacer]
 *       ÉCRIT la colonne de O10 entre ses balises dans src/data/direct/declarationDuDirect.js, PAR SCRIPT, puis relit le
 *       module ; avant, tout mode qui en dépend refuse « colonne non fixée » ; refusé après le scellement.
 *   --sceller --regles <md> --documents <f1,f2,…>
 *       ÉCRIT SCELLEMENT entre ses balises dans src/data/direct/bancDuDirect.js : la colonne, les sha1 des règles, des
 *       documents qu'elles citent par sha1 et des modules scellés (bancDuDirect.js « à scellement vide »), la déclaration,
 *       le juge, les seuils, l'entrée 46 du registre de la mesure (posée AVANT, par script : R18 point 2) ; un seul sceau.
 *   --exporter --sortie <jsonl> --au <jour> --passe <json> [--de <jour>] [--base <db>]
 *       l'EXPORT (R19 entier) : les matchs de la grille de la colonne (O9, R1 point 2), par lecteurDesRencontres et
 *       issuesDuMagasin ; la ligne d'avant le coup d'envoi RÉEL (meta.kickoff ; sans lui, minuit de Paris du jour du
 *       magasin) ; la graine refaite ; les exclus comptés par raison (et nommés : graine, calculée après le coup d'envoi,
 *       ligne « service » sans version du moteur — C3) ;
 *       les rouges « not_on_pitch » comptés (R36 point 7) ; le principal de la 28 (R36 point 9) ; le sceau cité.
 *   --comptes --export <jsonl> --sha1-export <sha1> --sortie <json>
 *       les comptes d'avant le regard et l'ÉTALONNAGE de l'étage 1 (R20 point 1), SANS lire un `resultat` (T-B6) ; code 3
 *       si l'étalonnage est en écart.
 *   --banc --k <K> --regles <md> --libelles-json <json> --export <jsonl> --sha1-export <sha1> --comptes-json <json>
 *          --verrou <json> --sortie <json> --passe <json> [--rejouer-apres-correction "<raison>" [--autre-export]]
 *       le regard de SÛRETÉ (R15 point 1, dès 600 matchs, moins que T) : le verrou AVANT la première issue (T-B7) ;
 *       hors d'une copie d'essai, le verrou est banc46\verrou-surete.json et lui seul (C4, contrôlé avant tout le reste) ;
 *       un rejeu sur un AUTRE export que le dernier du verrou est refusé sans --autre-export (noté dans le verrou) ;
 *       un match dont un état réel sort de F1 est retiré de tous les jugements, nommé et compté (C11 : au-delà de 1 % des
 *       matchs ou de 20 matchs, rien n'est jugé) ;
 *       l'étalonnage de l'étage 2 (R20 point 2 : un écart → code 3, rien jugé) ; la passe de Pierre relue toutes les 50
 *       rencontres (R36 point 2) ; la table du temps additionnel contrôlée APRÈS le verrou (R36 point 6) ; ne rend que
 *       « rien de moins bon : montré, pas encore jugé » ou « moins bon : pas montré ».
 *   --preuve (les options de --banc) --avenant <md> (--verrou-surete <json> | --sans-surete)
 *       le regard de PREUVE (à T, au z de K) : le verrou de sûreté et un SECOND export, l'identité des LIGNES des matchs
 *       communs (avant le verrou ; C12 : au plus 5 matchs ET au plus 0,5 % des communs à la ligne changée sont nommés,
 *       comptés et retirés des deux côtés, au-delà refus), les écarts entre les deux exports comptés et nommés sans
 *       refus, l'avenant (le sha1 de l'export et sa date), un verrou propre, banc46\verrou-preuve.json hors d'une copie
 *       d'essai (R15 point 3, C4) ; --sans-surete : le regard unique (point 4, « faits seuls » jusque-là) — si
 *       banc46\verrou-surete.json existe, il n'est pas refusé mais DIT dans la sortie et la note (C4 point 3).
 *   --recopier <sortie> [--remplacer]
 *       ÉCRIT src/data/direct/noteDuDirect.js PAR SCRIPT (format du PROJET § 10) et garde la sortie, les règles (et
 *       l'avenant) dans test/fixtures (T-B9 refait la note à l'octet) ; une note du regard de PREUVE n'est remplacée par
 *       une sortie de sûreté qu'avec --remplacer (C9).
 *   --note-nulle
 *       ÉCRIT noteDuDirect.js avec NOTE_DU_DIRECT = null (O12 : l'interrupteur — avant le passage, ou pour éteindre).
 * Réglages d'essai (CM_ESSAI_TIRAGES, _SURETE, _T, _CRENEAUX, _ETALONNAGE=ignorer, _TRACE) : copie d'essai seulement.
 *
 * REFUS : un seul mode ; sous OneDrive ; hors du bac à sable (sauf une copie d'essai gardée par test/aides/garde.mjs) ; la
 * vraie base (config/bacASable.js : verifierBaseDuBac) ; une sortie sous OneDrive ou hors du bac ; une sortie existante
 * (jamais écrasée). Les bases ne s'ouvrent qu'en lecture seule (`new DatabaseSync(…, { readOnly: true })`, jamais
 * openDb(), qui migre le schéma). Aucun nom de club ni de joueur dans les sorties. Le résumé sur stderr, une ligne JSON
 * de bilan sur stdout.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { modeBacASable, dossierDuBac, verifierBaseDuBac, estDans, cheminReel, RACINE_BAC } from '../src/config/bacASable.js';
import { LOI_TABLE } from '../src/data/simulation/reglages.js';

const SERVEUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGLAGES = path.join(SERVEUR, 'src', 'data', 'direct', 'reglagesDirect.js');

/** La fenêtre DÉJÀ VUE (PARAMS appris dessus) : la seule où `--mesurer-additionnel` lit des buts (P7, conception § 5.6). */
const FENETRE_VUE = Object.freeze({ de: '2023-07-01', a: '2026-09-23' });
/** La place libre exigée avant une restauration (conception § 5.2). */
const PLACE_MIN = 8 * 1024 ** 3;
/** La règle de R16 telle qu'écrite au projet des règles du banc (§ 7, 11/11 21 h 15, AVANT le premier --libelles). */
const REGLE_R16 = Object.freeze({ retardMedianMin: 2, partSansRougeLu: 0.2 });

const argv = process.argv.slice(2);
const option = (nom) => {
  const i = argv.indexOf(nom);
  return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};
const drapeau = (nom) => argv.includes(nom);
const dire = (texte) => process.stderr.write(`${texte}\n`);
const sha1 = (fichier) => crypto.createHash('sha1').update(fs.readFileSync(fichier)).digest('hex');
const sousOneDrive = (p) => /[\\/]onedrive[^\\/]*([\\/]|$)/i.test(path.resolve(p));
function refuser(raison) {
  dire(`[étape 46] REFUS : ${raison}`);
  process.stdout.write(`${JSON.stringify({ refus: raison })}\n`);
  process.exit(2);
}

// ------------------------------------------------------------ garde-fous
const MODES_DE_L_ETAPE_0 = ['--restaurer', '--libelles', '--mesurer-additionnel', '--recopier-additionnel'];
const MODES_DU_BANC = ['--fixer-colonne', '--sceller', '--exporter', '--comptes', '--banc', '--preuve', '--recopier', '--note-nulle'];
const MODES = [...MODES_DE_L_ETAPE_0, ...MODES_DU_BANC];
const presents = MODES.filter(drapeau);
if (presents.length !== 1) refuser(`un seul mode : ${MODES.join(', ')}.`);
const MODE = presents[0];
if (sousOneDrive(SERVEUR)) refuser(`à lancer depuis la copie du bac (bac-a-sable\\code\\server), jamais sous OneDrive (${SERVEUR}).`);
// Une COPIE D'ESSAI : CM_TEST_DOSSIER posé ET ce script rangé DANS ce dossier (correctif C5 du 13/11 : la variable seule,
// pointée sur un dossier étranger, n'ouvre plus les réglages d'essai ni la recopie d'une sortie d'essai). Correctif R4 du
// 13/11 après-midi (constat 4 du rebanc) : le dossier doit être une copie d'isolement.mjs (« cm-tests-… ») et ce script à
// SA place dedans (<dossier>\code\server) — un dossier PARENT du script (le bac lui-même, C:\…) n'ouvre plus rien.
const DOSSIER_D_ESSAI = process.env.CM_TEST_DOSSIER ? path.resolve(process.env.CM_TEST_DOSSIER) : null;
const ESSAI = DOSSIER_D_ESSAI !== null && /^cm-tests-/.test(path.basename(DOSSIER_D_ESSAI)) && path.resolve(SERVEUR).toLowerCase() === path.join(DOSSIER_D_ESSAI, 'code', 'server').toLowerCase();
if (!modeBacASable() && !ESSAI) refuser('ce script sert au bac à sable (CM_BAC_A_SABLE=1) : l’étape 0 de la 46 ne se passe jamais chez Pierre.');
const BAC = dossierDuBac() ?? RACINE_BAC;

/** Un dossier de sortie : jamais sous OneDrive, toujours dans le bac (la copie d'essai est elle-même dans le bac). */
function dossierDeSortie() {
  const d = path.resolve(option('--dossier') ?? path.join(BAC, 'banc46'));
  if (sousOneDrive(d)) refuser(`une sortie sous OneDrive est refusée (${d}).`);
  if (!estDans(d, RACINE_BAC) && !(ESSAI && estDans(d, process.env.CM_TEST_DOSSIER))) refuser(`une sortie hors du bac est refusée (${d}).`);
  fs.mkdirSync(d, { recursive: true });
  if (!estDans(cheminReel(d), cheminReel(RACINE_BAC)) && !ESSAI) refuser(`la sortie sort du bac par une jonction (${cheminReel(d)}).`);
  return d;
}
/** Les fichiers de sortie : refusés s'ils existent déjà (jamais écrasés), vérifiés AVANT le calcul. */
function sortiesLibres(dossier, noms) {
  const chemins = noms.map((n) => path.join(dossier, n));
  for (const c of chemins) if (fs.existsSync(c)) refuser(`la sortie existe déjà (${c}) : jamais écrasée. Un autre --dossier, ou retirer l’ancienne à la main.`);
  return chemins;
}
const ecrire = (fichier, texte) => fs.writeFileSync(fichier, texte, { flag: 'wx' });

/** La base lue : --base, sinon MATCH_STATS_DB ; jamais la vraie base ; toujours dans le bac ; ouverte en LECTURE SEULE. */
function baseEnLecture() {
  const demandee = option('--base') ?? process.env.MATCH_STATS_DB ?? null;
  const v = verifierBaseDuBac(demandee);
  if (!v.ok) refuser(`base refusée : ${v.raison}.`);
  if (!fs.existsSync(v.chemin)) refuser(`base introuvable (${v.chemin}).`);
  const db = new DatabaseSync(v.chemin, { readOnly: true });
  return { db, chemin: v.chemin, octets: fs.statSync(v.chemin).size };
}

/** La passe de Pierre (lecture seule d'un refresh-status.json) : attendue à null, au plus `minutes`. */
function attendreLaPasse(fichier, minutes = Number(option('--attente-minutes') ?? 90)) {
  const t0 = performance.now();
  for (;;) {
    let running;
    try {
      running = JSON.parse(fs.readFileSync(fichier, 'utf8')).running ?? null;
    } catch (error) {
      running = `illisible : ${error.message}`;
    }
    if (running === null) return { verifiee: true, attenduS: Math.round((performance.now() - t0) / 1000) };
    if (performance.now() - t0 >= minutes * 60_000) refuser(`la passe de Pierre tourne toujours (${JSON.stringify(running).slice(0, 120)}) : rien lancé.`);
    dire(`[étape 46] la passe de Pierre tourne (${JSON.stringify(running).slice(0, 100)}) : j'attends`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000);
  }
}

const hex = (t) => Buffer.from(String(t), 'utf8').toString('hex').toUpperCase();
const pct = (x) => (x === null || !Number.isFinite(x) ? '—' : `${(100 * x).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const nb = (x) => (x === null || x === undefined ? '—' : Number(x).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
/** Le centile p (0..1) d'une liste triée, par interpolation linéaire ; null si vide. */
function centile(tries, p) {
  if (!tries.length) return null;
  const i = (tries.length - 1) * p;
  const b = Math.floor(i);
  return b + 1 < tries.length ? tries[b] + (tries[b + 1] - tries[b]) * (i - b) : tries[b];
}

// ============================================================ --restaurer
if (MODE === '--restaurer') {
  const sauvegarde = option('--sauvegarde');
  const bilanF = option('--bilan');
  const passe = option('--passe');
  if (!sauvegarde || !bilanF || !passe) refuser('--sauvegarde <gz>, --bilan <json> et --passe <refresh-status.json> sont obligatoires.');
  if (!/\.gz$/i.test(sauvegarde) || !fs.existsSync(sauvegarde)) refuser(`sauvegarde introuvable ou pas un .gz (${sauvegarde}).`);
  let bilan;
  try {
    bilan = JSON.parse(fs.readFileSync(bilanF, 'utf8'));
  } catch (error) {
    refuser(`bilan illisible (${bilanF}) : ${error.message}`);
  }
  const attendu = bilan?.base?.sha256;
  if (!/^[0-9a-f]{64}$/.test(String(attendu ?? ''))) refuser('le bilan ne porte pas le sha256 de la base (base.sha256).');
  const cible = path.resolve(option('--cible') ?? path.join(BAC, 'banc46', 'base', 'match-stats.db'));
  const v = verifierBaseDuBac(cible);
  if (!v.ok) refuser(`cible refusée : ${v.raison}.`);
  if (sousOneDrive(cible)) refuser(`une cible sous OneDrive est refusée (${cible}).`);
  for (const annexe of ['', '-wal', '-shm', '-journal']) if (fs.existsSync(`${cible}${annexe}`)) refuser(`la cible existe déjà (${cible}${annexe}) : jamais écrasée.`);
  const { decompresserGzip, placeLibre } = await import('../src/data/sauvegardes/fichiersSauvegarde.js');
  const { assertPasLaBaseVivante, controlerCopie } = await import('../src/data/sauvegardes/controleCopie.js');
  assertPasLaBaseVivante(cible);
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  const place = placeLibre(path.dirname(cible));
  if (place.libre !== null && place.libre < PLACE_MIN) refuser(`moins de 8 Go libres sur le disque du bac (${nb(place.libre / 1024 ** 3)} Go).`);
  const passeAvant = attendreLaPasse(passe);
  const t0 = performance.now();
  const gz = await decompresserGzip(sauvegarde, cible);
  if (gz.sha256 !== attendu) {
    fs.rmSync(cible, { force: true });
    refuser(`sha256 de la copie décompressée ≠ bilan (${gz.sha256} ≠ ${attendu}) : copie retirée.`);
  }
  const controle = controlerCopie(cible);
  const bilanSortie = {
    ok: controle.resultat === 'ok',
    mode: 'restaurer',
    cible,
    octets: gz.octets,
    sha256: gz.sha256,
    quickCheck: controle.resultat,
    rencontres: controle.rencontres,
    rencontresDuBilan: bilan?.base?.rencontres ?? null,
    derniereDate: controle.derniereDate,
    modeJournal: controle.modeJournal,
    passe: passeAvant,
    dureeS: Math.round((performance.now() - t0) / 100) / 10
  };
  dire(`[étape 46] restauration : ${nb(gz.octets)} octets, sha256 conforme, quick_check ${controle.resultat}, ${nb(controle.rencontres)} rencontres (bilan : ${nb(bilanSortie.rencontresDuBilan)}).`);
  process.stdout.write(`${JSON.stringify(bilanSortie)}\n`);
  process.exit(bilanSortie.ok ? 0 : 3);
}

// ============================================================ --libelles
if (MODE === '--libelles') {
  // Correctif K11 du 13/11 soir : libelleDuDirect.js (descellé depuis K3) n'est chargé QUE dans ce mode, avant tout le reste
  // (rien lu, rien écrit s'il ne se charge pas) — jamais au démarrage : un correctif du rodage qui le casserait ne ferait
  // refuser que --libelles (pas 5, avant le sceau), jamais les autres modes du script scellé.
  let libelle = null;
  try {
    libelle = await import('../src/data/direct/libelleDuDirect.js');
  } catch (error) {
    refuser(`--libelles : libelleDuDirect.js ne se charge pas (${error?.message ?? error}) : rien lu, rien écrit. Ce module n’est pas scellé (K3) : le corriger, puis relancer --libelles (avant le sceau, manœuvre pas 5).`);
  }
  const { lireLibelle, patronDuLibelle, nettoyerLibelle } = libelle;
  const dossier = dossierDeSortie();
  const [fTxt, fJson] = sortiesLibres(dossier, ['libelles.txt', 'libelles.json']);
  const { db, chemin, octets } = baseEnLecture();
  const t0 = performance.now();
  const tous = (sql, ...p) => db.prepare(sql).all(...p);
  const table = tous("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'live_snapshots'");
  if (!table.length) refuser('la base n’a pas de table live_snapshots.');

  // --- le dossier § 1.6 (les requêtes telles quelles, sauf celle des libellés : sans LIMIT, par patron, plus bas)
  const parJourEtSource = tous('SELECT date, source, COUNT(*) n, COUNT(DISTINCT fotmob_id) m FROM live_snapshots GROUP BY date, source ORDER BY date, source');
  const parTypeEtStatut = tous('SELECT kind, status, COUNT(*) n FROM live_snapshots GROUP BY kind, status ORDER BY kind, status');
  const pic = tous('SELECT substr(taken_at, 1, 15) t10, COUNT(DISTINCT fotmob_id) n FROM live_snapshots GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10');
  const enCoursSansMinute = tous("SELECT COUNT(*) n FROM live_snapshots WHERE status = 'en cours' AND minute IS NULL")[0].n;
  const parSourceEtCouverture = tous(
    'SELECT source, coverage, COUNT(*) n, SUM(home_red IS NULL) rouges_null, SUM(home_red IS NOT NULL OR away_red IS NOT NULL) rouges_lus, ' +
      'SUM(xg_home IS NOT NULL) xg, SUM(detail_at IS NOT NULL) details FROM live_snapshots GROUP BY source, coverage ORDER BY source, coverage'
  );

  // --- R6 point 1a : les PATRONS, sans LIMIT, par statut
  /** Regroupe des lignes { minute_label, status, n } par (statut, patron) : hex des formes brutes, compte, exemples extrêmes. */
  function parPatron(lignes) {
    const groupes = new Map();
    for (const r of lignes) {
      const brut = r.minute_label;
      const patron = brut === null ? '(null)' : patronDuLibelle(brut) || '(vide)';
      const cle = `${r.status}|${patron}`;
      let g = groupes.get(cle);
      if (!g) {
        g = { status: r.status, patron, type: brut === null ? 'absent' : lireLibelle(brut).type, n: 0, formes: new Map(), exemples: [] };
        groupes.set(cle, g);
      }
      g.n += r.n;
      if (brut !== null) {
        const forme = hex(String(brut).replace(/[0-9]/g, '9'));
        g.formes.set(forme, (g.formes.get(forme) ?? 0) + r.n);
        g.exemples.push(brut);
      }
    }
    const rang = (t) => {
      const l = lireLibelle(t);
      return l.type === 'minute' ? l.minute * 100 + (l.ajout ?? 0) : Number.POSITIVE_INFINITY;
    };
    return [...groupes.values()]
      .map((g) => {
        const ex = [...new Set(g.exemples)].sort((a, b) => rang(a) - rang(b) || nettoyerLibelle(a).localeCompare(nettoyerLibelle(b)));
        return {
          status: g.status,
          patron: g.patron,
          type: g.type,
          n: g.n,
          formesHex: [...g.formes.entries()].sort((a, b) => b[1] - a[1]).map(([h, n]) => ({ hex: h, n })),
          plusPetit: ex.length ? { texte: nettoyerLibelle(ex[0]), hex: hex(ex[0]) } : null,
          plusGrand: ex.length ? { texte: nettoyerLibelle(ex.at(-1)), hex: hex(ex.at(-1)) } : null
        };
      })
      .sort((a, b) => a.status.localeCompare(b.status) || b.n - a.n || a.patron.localeCompare(b.patron));
  }
  const patrons = parPatron(tous('SELECT minute_label, status, COUNT(*) n FROM live_snapshots GROUP BY minute_label, status'));

  // --- R6 point 1b : minute et ajout à partir de la 45e, par championnat
  const minutes45 = tous('SELECT league, minute, added_time, COUNT(*) n FROM live_snapshots WHERE minute >= 45 GROUP BY league, minute, added_time ORDER BY league, minute, added_time');
  const minutes45Tous = tous('SELECT minute, added_time, COUNT(*) n FROM live_snapshots WHERE minute >= 45 GROUP BY minute, added_time ORDER BY minute, added_time');

  // --- R6 point 1c : les libellés des instantanés pris plus de 110 minutes après le coup d'envoi
  const apres110 = parPatron(
    tous(
      "SELECT minute_label, status, COUNT(*) n FROM live_snapshots WHERE kickoff IS NOT NULL AND kickoff <> '' AND (julianday(taken_at) - julianday(kickoff)) * 1440 > 110 GROUP BY minute_label, status"
    )
  );

  // --- R16 point 1 : rouges lus, âge du dernier détail, part de la liste seule
  const matchs = new Map();
  const ages = [];
  let enCours = 0;
  let enCoursSansDetailEncore = 0;
  let listeSeule = 0;
  let total = 0;
  let courant = null;
  let dernierDetail = null;
  for (const r of db.prepare('SELECT fotmob_id, taken_at, detail_at, status, source, home_red, away_red FROM live_snapshots ORDER BY fotmob_id, taken_at').iterate()) {
    total++;
    if (r.source === 'liste') listeSeule++;
    if (r.fotmob_id !== courant) {
      courant = r.fotmob_id;
      dernierDetail = null;
    }
    let m = matchs.get(r.fotmob_id);
    if (!m) {
      m = { rougeLu: false, rougeVu: false, detail: false };
      matchs.set(r.fotmob_id, m);
    }
    if (r.home_red !== null || r.away_red !== null) m.rougeLu = true;
    if ((r.home_red ?? 0) > 0 || (r.away_red ?? 0) > 0) m.rougeVu = true;
    const d = r.detail_at ? Date.parse(r.detail_at) : NaN;
    if (Number.isFinite(d)) {
      m.detail = true;
      dernierDetail = dernierDetail === null ? d : Math.max(dernierDetail, d);
    }
    if (r.status === 'en cours') {
      enCours++;
      const t = Date.parse(r.taken_at);
      if (dernierDetail === null) enCoursSansDetailEncore++;
      else if (Number.isFinite(t)) ages.push((t - dernierDetail) / 60_000);
    }
  }
  ages.sort((a, b) => a - b);
  const nMatchs = matchs.size;
  const vals = [...matchs.values()];
  const rouges = {
    matchsSuivis: nMatchs,
    avecUnRougeLu: vals.filter((m) => m.rougeLu).length,
    sansRougeLu: vals.filter((m) => !m.rougeLu).length,
    avecUnRougeVu: vals.filter((m) => m.rougeVu).length,
    sansAucunDetail: vals.filter((m) => !m.detail).length,
    partSansRougeLu: nMatchs ? vals.filter((m) => !m.rougeLu).length / nMatchs : null
  };
  const agesDuDetail = {
    unite: 'minutes (≈ créneaux de jeu)',
    instantanesEnCours: enCours,
    mesures: ages.length,
    sansDetailEncore: enCoursSansDetailEncore,
    mediane: centile(ages, 0.5),
    p75: centile(ages, 0.75),
    p90: centile(ages, 0.9),
    max: ages.length ? ages.at(-1) : null
  };
  const regleR16 = {
    ecriteLe: '2026-11-11 21 h 15 (SCR46\\ecriture\\banc-regles-etape46-PROJET.md § 7), avant ce mode',
    seuils: REGLE_R16,
    retardMedianMin: agesDuDetail.mediane,
    partSansRougeLu: rouges.partSansRougeLu,
    declenchee:
      (agesDuDetail.mediane !== null && agesDuDetail.mediane > REGLE_R16.retardMedianMin) || (rouges.partSansRougeLu !== null && rouges.partSansRougeLu > REGLE_R16.partSansRougeLu),
    M: agesDuDetail.mediane
  };
  const sortie = {
    format: 1,
    mode: 'libelles',
    base: { chemin, octets },
    instantanes: total,
    listeSeule: { n: listeSeule, part: total ? listeSeule / total : null },
    dossier16: { parJourEtSource, parTypeEtStatut, pic, enCoursSansMinute, parSourceEtCouverture },
    patrons,
    minutes45: { tous: minutes45Tous, parChampionnat: minutes45 },
    apres110,
    rouges,
    agesDuDetail,
    regleR16,
    inconnus: patrons.filter((p) => p.type === 'inconnu').map((p) => ({ status: p.status, patron: p.patron, n: p.n, exemple: p.plusPetit }))
  };
  db.close();

  // --- le texte (lisible), les mêmes chiffres
  const L = [];
  L.push('# Étape 46, étape 0 — les libellés et les faits de live_snapshots (--libelles)');
  L.push(`base : ${chemin} (${nb(octets)} octets) ; ${nb(total)} instantanés, ${nb(nMatchs)} matchs suivis`);
  L.push('');
  L.push('## Patrons des libellés (nettoyés, chiffres → 9), par statut — sans LIMIT (R6 point 1a)');
  L.push('statut | patron | type lu | n | formes brutes (hex, chiffres → 9) | plus petit | plus grand');
  for (const p of patrons) L.push(`${p.status} | ${p.patron} | ${p.type} | ${p.n} | ${p.formesHex.map((f) => `${f.hex}×${f.n}`).join(' ')} | ${p.plusPetit?.texte ?? '—'} (${p.plusPetit?.hex ?? ''}) | ${p.plusGrand?.texte ?? '—'} (${p.plusGrand?.hex ?? ''})`);
  L.push('');
  L.push(`Libellés de type « inconnu » : ${sortie.inconnus.length ? sortie.inconnus.map((i) => `${i.status} « ${i.patron} » ×${i.n}`).join(' ; ') : 'aucun'}`);
  L.push('');
  L.push('## Minute et ajout à partir de la 45e (R6 point 1b) — tous championnats');
  L.push('minute | ajout | n');
  for (const r of minutes45Tous) L.push(`${r.minute} | ${r.added_time ?? 'null'} | ${r.n}`);
  L.push('');
  L.push('### Par championnat, à partir de la 90e');
  for (const r of minutes45.filter((x) => x.minute >= 90)) L.push(`${r.league ?? '(null)'} | ${r.minute} | ${r.added_time ?? 'null'} | ${r.n}`);
  L.push('');
  L.push('## Libellés des instantanés pris plus de 110 minutes après le coup d’envoi (R6 point 1c)');
  for (const p of apres110) L.push(`${p.status} | ${p.patron} | ${p.type} | ${p.n} | ${p.plusPetit?.texte ?? '—'} → ${p.plusGrand?.texte ?? '—'}`);
  L.push('');
  L.push('## Les rouges et l’âge du détail (R16 point 1)');
  L.push(`matchs suivis : ${nb(nMatchs)} ; avec au moins un rouge lu (non null) : ${nb(rouges.avecUnRougeLu)} ; sans aucun rouge lu : ${nb(rouges.sansRougeLu)} (${pct(rouges.partSansRougeLu)}) ; avec un rouge > 0 vu : ${nb(rouges.avecUnRougeVu)} ; sans aucun détail : ${nb(rouges.sansAucunDetail)}`);
  L.push(`âge du dernier détail à chaque instantané « en cours » (minutes) : médiane ${nb(agesDuDetail.mediane)}, 75e centile ${nb(agesDuDetail.p75)}, 90e centile ${nb(agesDuDetail.p90)}, max ${nb(agesDuDetail.max)} ; ${nb(agesDuDetail.mesures)} mesures, ${nb(agesDuDetail.sansDetailEncore)} instantanés sans détail encore lu`);
  L.push(`instantanés de la liste seule : ${nb(listeSeule)} sur ${nb(total)} (${pct(sortie.listeSeule.part)})`);
  L.push(`règle de R16 (écrite avant ce mode : retard médian > ${REGLE_R16.retardMedianMin} créneaux, ou plus de ${pct(REGLE_R16.partSansRougeLu)} des matchs sans rouge lu) : ${regleR16.declenchee ? 'DÉCLENCHÉE' : 'non déclenchée'} (M = ${nb(regleR16.M)})`);
  L.push('');
  L.push('## Dossier § 1.6');
  L.push(`en cours sans minute : ${nb(enCoursSansMinute)}`);
  L.push('source | couverture | n | rouges null | rouges lus | xG | détails');
  for (const r of parSourceEtCouverture) L.push(`${r.source} | ${r.coverage ?? 'null'} | ${r.n} | ${r.rouges_null} | ${r.rouges_lus} | ${r.xg} | ${r.details}`);
  L.push('type | statut | n');
  for (const r of parTypeEtStatut) L.push(`${r.kind} | ${r.status} | ${r.n}`);
  L.push('pic (dizaine de minutes UTC | matchs)');
  for (const r of pic) L.push(`${r.t10} | ${r.n}`);
  L.push('jour | source | instantanés | matchs');
  for (const r of parJourEtSource) L.push(`${r.date} | ${r.source} | ${r.n} | ${r.m}`);
  L.push('');
  ecrire(fJson, `${JSON.stringify(sortie, null, 1)}\n`);
  ecrire(fTxt, `${L.join('\n')}\n`);
  const dureeS = Math.round((performance.now() - t0) / 100) / 10;
  dire(`[étape 46] --libelles : ${nb(total)} instantanés, ${patrons.length} patrons (${sortie.inconnus.length} inconnus) ; rouges : ${pct(rouges.partSansRougeLu)} des matchs sans rouge lu ; âge médian du détail ${nb(agesDuDetail.mediane)} min ; ${dureeS} s.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'libelles', txt: fTxt, json: fJson, sha1Txt: sha1(fTxt), sha1Json: sha1(fJson), instantanes: total, patrons: patrons.length, inconnus: sortie.inconnus.length, regleR16: regleR16.declenchee, dureeS })}\n`);
  process.exit(0);
}

// ============================================================ --mesurer-additionnel

// LA TABLE du temps additionnel (conception § 2.5) : tableDuTempsAdditionnel, Q_MIN (200) et PLANCHER (0,05) vivent
// depuis la partie C dans src/data/direct/bancDuDirect.js (la même fonction, déplacée telle quelle) : --banc refait la
// même table sur P5 après le verrou (R36 point 6).

if (MODE === '--mesurer-additionnel') {
  const { tableDuTempsAdditionnel, Q_MIN, PLANCHER } = await import('../src/data/direct/bancDuDirect.js');
  const dossier = dossierDeSortie();
  const [fJson] = sortiesLibres(dossier, ['additionnel.json']);
  const { db, chemin, octets } = baseEnLecture();
  const { indicateursDUneRencontre, butsA90 } = await import('../src/data/db/dayTable.js');
  const t0 = performance.now();
  const q45 = [0];
  const q91 = [0];
  const comptes = { rencontres: 0, attribuees: 0, sansScore: 0, evenementsIllisibles: 0, incompletes: 0, retenues: 0, buts: 0, buts45x: 0, buts90x: 0, horsForme: { minutePlusDe90NonProlonge: 0, ajoutHors45Et90: 0 } };
  const ligues = new Map();
  const sql = 'SELECT date, league, home_goals hg, away_goals ag, events, meta FROM matches WHERE date >= ? AND date <= ?';
  for (const r of db.prepare(sql).iterate(FENETRE_VUE.de, FENETRE_VUE.a)) {
    comptes.rencontres++;
    const ind = indicateursDUneRencontre(r.meta, r.league);
    if (ind.attribue) {
      comptes.attribuees++;
      continue;
    }
    if (!Number.isInteger(r.hg) || !Number.isInteger(r.ag)) {
      comptes.sansScore++;
      continue;
    }
    // R14 : les buts moyens du championnat — toutes les rencontres jouées non attribuées et non prolongées (le score rangé
    // d'un match prolongé est celui de la 120e).
    if (!ind.prolongation) {
      let l = ligues.get(r.league);
      if (!l) ligues.set(r.league, (l = { matchs: 0, dom: 0, ext: 0 }));
      l.matchs++;
      l.dom += r.hg;
      l.ext += r.ag;
    }
    // § 2.5 : les buts du temps additionnel, dans les matchs à buts complets (chaque but avec sa minute et son camp).
    let events;
    try {
      events = typeof r.events === 'string' ? JSON.parse(r.events) : r.events;
    } catch {
      comptes.evenementsIllisibles++;
      continue;
    }
    if (butsA90({ hg: r.hg, ag: r.ag, prolongation: Boolean(ind.prolongation) }, events) === null) {
      comptes.incompletes++;
      continue;
    }
    comptes.retenues++;
    for (const e of events) {
      if (e?.type !== 'goal') continue;
      comptes.buts++;
      const m = Number(e.minute);
      const a = e.addedTime === null || e.addedTime === undefined ? null : Number(e.addedTime);
      if (m === 45 && Number.isInteger(a) && a >= 1) {
        q45[a] = (q45[a] ?? 0) + 1;
        comptes.buts45x++;
      } else if (m === 90 && Number.isInteger(a) && a >= 1) {
        q91[a] = (q91[a] ?? 0) + 1;
        comptes.buts90x++;
      } else if (Number.isInteger(a) && a >= 1) comptes.horsForme.ajoutHors45Et90++;
      else if (m > 90 && !ind.prolongation) comptes.horsForme.minutePlusDe90NonProlonge++;
    }
  }
  db.close();
  for (const q of [q45, q91]) for (let x = 0; x < q.length; x++) q[x] ??= 0;
  const t45 = tableDuTempsAdditionnel(q45);
  const t91 = tableDuTempsAdditionnel(q91);
  const prior = LOI_TABLE.priorMatchs;
  const championnats = {};
  for (const cle of [...ligues.keys()].sort()) {
    const l = ligues.get(cle);
    championnats[cle] = {
      matchs: l.matchs,
      domicile: (l.dom + prior * LOI_TABLE.domicile) / (l.matchs + prior),
      exterieur: (l.ext + prior * LOI_TABLE.exterieur) / (l.matchs + prior),
      brut: { domicile: l.dom / l.matchs, exterieur: l.ext / l.matchs }
    };
  }
  const sortie = {
    format: 1,
    mode: 'mesurer-additionnel',
    fenetre: FENETRE_VUE,
    base: { chemin, octets },
    mesureLe: new Date().toISOString(),
    comptes,
    tempsAdditionnel: {
      regle: 'conception § 2.5 : x* = argmax q ; S(x) = 1 pour x ≤ x*, min(S(x − 1), q(x)/q(x*)) ensuite ; reste(x) = (q(x)/2 + Σ_{y>x} q(y)) / S(x) / Σ q ; reste(x) ≤ reste(x − 1) ; X = dernier x où q(x) ≥ 200 ; plancher 0,05',
      qMin: Q_MIN,
      plancher: PLANCHER,
      premiere: { q: q45, ...t45 },
      seconde: { q: q91, ...t91 },
      note:
        'R35 point 3 : S(x) = 1 jusqu’au pic suppose qu’aucun match ne finit avant x* ; si des matchs finissent avant (par exemple 10 % avant +3), reste(x) est sous-estimé (0,616 au lieu de 0,685 dans cet exemple), moins de 0,5 % des buts du match. Formule gardée telle quelle (critique du 11/11).'
    },
    moyennes: {
      regle: `R14 : buts moyens à domicile et à l’extérieur de chaque championnat (rencontres jouées non attribuées et non prolongées), rappelés vers ${LOI_TABLE.domicile} / ${LOI_TABLE.exterieur} sur ${prior} rencontres (LOI_TABLE de data/simulation/reglages.js) ; repli ${LOI_TABLE.domicile} / ${LOI_TABLE.exterieur} pour un championnat absent`,
      priorMatchs: prior,
      repli: { domicile: LOI_TABLE.domicile, exterieur: LOI_TABLE.exterieur },
      championnats
    }
  };
  ecrire(fJson, `${JSON.stringify(sortie, null, 1)}\n`);
  const dureeS = Math.round((performance.now() - t0) / 100) / 10;
  const r91 = t91.reste.slice(1, 8).map((x) => nb(x)).join(' ; ');
  dire(`[étape 46] --mesurer-additionnel (${FENETRE_VUE.de} → ${FENETRE_VUE.a}) : ${nb(comptes.rencontres)} rencontres, ${nb(comptes.retenues)} à buts complets ; buts 45+x ${nb(comptes.buts45x)} (X = ${t45.X}), 90+x ${nb(comptes.buts90x)} (X = ${t91.X}) ; reste91 : ${r91} … ; ${Object.keys(championnats).length} championnats ; ${dureeS} s.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'mesurer-additionnel', json: fJson, sha1: sha1(fJson), rencontres: comptes.rencontres, retenues: comptes.retenues, X45: t45.X, X91: t91.X, championnats: Object.keys(championnats).length, dureeS })}\n`);
  process.exit(0);
}

// ============================================================ --recopier-additionnel

/** Le texte recopié entre les balises (déterministe : la même mesure donne les mêmes octets). */
function texteDesTables(mesure, { fichier, sha1Mesure }) {
  const ta = mesure.tempsAdditionnel;
  const reste = {
    mesure: { fichier, sha1: sha1Mesure, de: mesure.fenetre.de, a: mesure.fenetre.a, mesureLe: mesure.mesureLe, rencontres: mesure.comptes.retenues, buts45: mesure.comptes.buts45x, buts91: mesure.comptes.buts90x },
    plancher: ta.plancher,
    X45: ta.premiere.X,
    X91: ta.seconde.X,
    reste45: ta.premiere.reste,
    reste91: ta.seconde.reste
  };
  const championnats = {};
  for (const [cle, c] of Object.entries(mesure.moyennes.championnats)) championnats[cle] = { matchs: c.matchs, domicile: c.domicile, exterieur: c.exterieur };
  const moyennes = {
    mesure: { fichier, sha1: sha1Mesure, de: mesure.fenetre.de, a: mesure.fenetre.a, priorMatchs: mesure.moyennes.priorMatchs, repli: mesure.moyennes.repli },
    championnats
  };
  return {
    reste: `export const RESTE_ADDITIONNEL = geler(${JSON.stringify(reste)});`,
    moyennes: `export const MOYENNES_DES_CHAMPIONNATS = geler(${JSON.stringify(moyennes)});`
  };
}

const BALISES = Object.freeze({
  reste: ['// <RESTE_ADDITIONNEL recopié par script — ne pas modifier à la main>', '// </RESTE_ADDITIONNEL>'],
  moyennes: ['// <MOYENNES_DES_CHAMPIONNATS recopiées par script — ne pas modifier à la main>', '// </MOYENNES_DES_CHAMPIONNATS>']
});

/** Remplace ce qui est entre deux balises (chacune présente une seule fois, dans l'ordre) ; lève sinon. */
function entreBalises(texte, [debut, fin], contenu) {
  const i = texte.indexOf(debut);
  const j = texte.indexOf(fin);
  if (i < 0 || j < 0 || j < i || texte.indexOf(debut, i + 1) >= 0 || texte.indexOf(fin, j + 1) >= 0) throw new Error(`balises absentes, en double ou dans le désordre : ${debut}`);
  return `${texte.slice(0, i + debut.length)}\n${contenu}\n${texte.slice(j)}`;
}

if (MODE === '--recopier-additionnel') {
  const fichier = path.resolve(option('--additionnel') ?? path.join(BAC, 'banc46', 'additionnel.json'));
  if (!fs.existsSync(fichier)) refuser(`mesure introuvable (${fichier}) : --mesurer-additionnel d’abord.`);
  let mesure;
  try {
    mesure = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  } catch (error) {
    refuser(`mesure illisible : ${error.message}`);
  }
  if (mesure?.format !== 1 || mesure?.mode !== 'mesurer-additionnel' || mesure?.fenetre?.de !== FENETRE_VUE.de || mesure?.fenetre?.a !== FENETRE_VUE.a) refuser('ce n’est pas une mesure de --mesurer-additionnel sur la fenêtre déjà vue.');
  if (!(mesure.tempsAdditionnel?.premiere?.X > 0) || !(mesure.tempsAdditionnel?.seconde?.X > 0)) refuser('la mesure n’a pas de table (aucun x à 200 buts au moins).');
  const sha1Mesure = sha1(fichier);
  const textes = texteDesTables(mesure, { fichier: path.basename(fichier), sha1Mesure });
  const avant = fs.readFileSync(REGLAGES, 'utf8');
  let apres;
  try {
    apres = entreBalises(entreBalises(avant, BALISES.reste, textes.reste), BALISES.moyennes, textes.moyennes);
  } catch (error) {
    refuser(`reglagesDirect.js : ${error.message}`);
  }
  fs.writeFileSync(REGLAGES, apres);
  const relu = await import(`${pathToFileURL(REGLAGES).href}?recopie=${sha1Mesure}`);
  const ok =
    JSON.stringify(relu.RESTE_ADDITIONNEL.reste91) === JSON.stringify(mesure.tempsAdditionnel.seconde.reste) &&
    JSON.stringify(relu.RESTE_ADDITIONNEL.reste45) === JSON.stringify(mesure.tempsAdditionnel.premiere.reste) &&
    Object.isFrozen(relu.RESTE_ADDITIONNEL.reste91) &&
    Object.keys(relu.MOYENNES_DES_CHAMPIONNATS.championnats).length === Object.keys(mesure.moyennes.championnats).length;
  if (!ok) {
    fs.writeFileSync(REGLAGES, avant);
    refuser('la relecture du module ne redonne pas la mesure : reglagesDirect.js remis tel qu’il était.');
  }
  dire(`[étape 46] tables recopiées PAR SCRIPT dans ${REGLAGES} (X45 = ${relu.RESTE_ADDITIONNEL.X45}, X91 = ${relu.RESTE_ADDITIONNEL.X91}, ${Object.keys(relu.MOYENNES_DES_CHAMPIONNATS.championnats).length} championnats) ; mesure ${sha1Mesure}.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'recopier-additionnel', reglages: REGLAGES, sha1Reglages: sha1(REGLAGES), mesure: fichier, sha1Mesure })}\n`);
  process.exit(0);
}

// ============================================================ LES MODES DU BANC (partie C, 12/11/2026)
//
// L'ordre de la manœuvre (SCR46\manoeuvre-scellement-et-passages.md) : --fixer-colonne ; la pose du registre de la mesure
// (script à part, R18 point 2) ; --sceller ; --restaurer ; --exporter ; --comptes (l'étalonnage de l'étage 1) ; --banc
// (sûreté) et/ou --preuve ; --recopier. La partie C ne les a lancés QUE dans les essais (directBanc.test.mjs), sur des
// bases et des exports fabriqués.

const DOSSIER_DIRECT = path.join(SERVEUR, 'src', 'data', 'direct');
const FICHIER_DECLARATION = path.join(DOSSIER_DIRECT, 'declarationDuDirect.js');
const FICHIER_BANC = path.join(DOSSIER_DIRECT, 'bancDuDirect.js');
const FICHIER_NOTE = path.join(DOSSIER_DIRECT, 'noteDuDirect.js');
/** Les pièces gardées par --recopier (T-B9 refait la note depuis elles). */
const FIXTURES_DU_BANC = Object.freeze({
  surete: 'test/fixtures/banc-etape46-surete.json',
  preuve: 'test/fixtures/banc-etape46-preuve.json',
  regles: 'test/fixtures/banc-regles-etape46.md',
  avenant: 'test/fixtures/banc-avenant-etape46.md'
});
/** Les balises des deux blancs remplis par script (chacune une seule fois dans son fichier). */
const BALISES_DU_BANC = Object.freeze({
  colonne: Object.freeze(['// <COLONNE fixée par script au scellement — ne pas modifier à la main>', '// </COLONNE>']),
  scellement: Object.freeze(['// <SCELLEMENT rempli par script au scellement — ne pas modifier à la main>', '// </SCELLEMENT>'])
});
const SCELLEMENT_VIDE = 'export const SCELLEMENT = null;';
const BANC_RELATIF = 'src/data/direct/bancDuDirect.js';
/**
 * LES MODULES SCELLÉS (PROJET § 11 et § 13, plus ce que l'export et le banc importent ; chemins relatifs à server/) : 24
 * depuis le correctif K3 du 13/11 fin d'après-midi (28 depuis le correctif C2 du 13/11) — toute la fermeture des imports
 * des quatre modules qui calculent les chiffres jugés (bancDuDirect, rejeuDuDirect, calculDuDirect, declarationDuDirect),
 * dont les sept modules de core/ qui calculent (la règle simple du temps restant, la grille « ancien-81 », le modèle de
 * buts…), seulement LISTÉS pour leur sha1 ; hors du sceau : bench/trialsRegistry.js, bench/lancements.js,
 * roadmap/plan.js, utils/atomicJson.js (un essai de directBanc.test.mjs refait la fermeture et l'exige). bancDuDirect.js
 * est pris « à scellement vide » (son bloc SCELLEMENT remis à null : un fichier ne porte pas son propre sha1). Jamais
 * bench/lancements.js : le registre se repose pour l'avenant du regard de preuve (sa date) ; K et les variantes y sont
 * relus et comparés à la déclaration à chaque mode. K3 (13/11, décision de l'orchestrateur) : etatDuDirect.js,
 * memoireDuDirect.js, libelleDuDirect.js et entreesDuDirect.js NE SONT PAS scellés — le banc rejoue depuis les
 * événements du magasin et ne les importe pas (ils disent d'où part le calcul de l'écran, ils ne calculent aucun chiffre
 * jugé) ; ce script n'importe libelleDuDirect.js que DANS --libelles (import dynamique, K11), avant le sceau (pas 5).
 */
const MODULES_SCELLES = Object.freeze([
  'src/data/direct/reglagesDirect.js',
  'src/data/direct/calculDuDirect.js',
  'src/data/direct/rejeuDuDirect.js',
  BANC_RELATIF,
  'src/data/direct/declarationDuDirect.js',
  'scripts/etape46.mjs',
  'src/data/simulation/reglages.js',
  'src/data/simulation/simulationMatch.js',
  'src/data/simulation/entreesSimulation.js',
  'src/data/simulation/simulationNuit.js',
  'src/data/simulation/simulationMatchsEnfant.js',
  'src/data/simulation/simulationRead.js',
  'src/data/simulation/etatSimulation.js',
  'src/data/calibration.js',
  'src/data/db/dayTable.js',
  'src/bench/guard.js',
  'src/bench/metrics.js',
  'src/core/model/poisson.js',
  'src/core/model/dixonColes.js',
  'src/core/engine/goalModel.js',
  'src/core/engine/scorePrediction.js',
  'src/core/market/marginRemoval.js',
  'src/core/engine/noteDuModeleDeButs.js',
  'src/core/engine/motsDuModeleDeButs.js'
]);
const JOUR_MS = 24 * 3_600_000;
const jourValide = (j) => typeof j === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j) && new Date(`${j}T12:00:00Z`).toISOString().slice(0, 10) === j;
const sha1Texte = (t) => crypto.createHash('sha1').update(t).digest('hex');
const ecrireJson = (fichier, objet) => ecrire(fichier, `${JSON.stringify(objet, null, 1)}\n`);
function lireJson(fichier, quoi) {
  try {
    return JSON.parse(fs.readFileSync(fichier, 'utf8'));
  } catch (error) {
    return refuser(`${quoi} illisible (${fichier}) : ${error.message}`);
  }
}
let fraicheur = 0;
/** Un module RELU (jamais celui du cache des imports : après une écriture par script). */
const importFrais = (fichier) => import(`${pathToFileURL(fichier).href}?relu=${process.pid}-${++fraicheur}`);

// Les réglages d'ESSAI (copie d'essai SEULEMENT : refusés ailleurs, rappelés dans chaque sortie, jamais recopiés hors d'une
// copie d'essai) : tirages réduits, étalonnage ignoré, créneaux réduits, seuil de sûreté et T réduits, trace des lectures.
function nombreDEssai(nom) {
  return process.env[nom] ? Number(process.env[nom]) : null;
}
const ESSAI_REGLAGES = Object.freeze({
  tirages: nombreDEssai('CM_ESSAI_TIRAGES'),
  surete: nombreDEssai('CM_ESSAI_SURETE'),
  T: nombreDEssai('CM_ESSAI_T'),
  creneaux: process.env.CM_ESSAI_CRENEAUX ? Object.freeze(process.env.CM_ESSAI_CRENEAUX.split(',').map(Number)) : null,
  etalonnage: process.env.CM_ESSAI_ETALONNAGE === 'ignorer' ? 'ignorer' : null
});
const ESSAI_TRACE = process.env.CM_ESSAI_TRACE ?? null;
const reglagesDEssai = Object.values(ESSAI_REGLAGES).some((v) => v !== null);
if ((reglagesDEssai || ESSAI_TRACE) && !ESSAI) refuser('les réglages d’essai (CM_ESSAI_…) ne valent que dans une copie d’essai : rien lancé.');
/** La trace des lectures (T-B7 : le verrou AVANT la première issue) ; rien hors d'un essai. */
const tracer = (quoi) => {
  if (ESSAI_TRACE) fs.appendFileSync(ESSAI_TRACE, `${quoi}\n`);
};
/** Une lecture d'export tracée : « lu <quoi> : N matchs, I issues » (I = les `resultat` présents en mémoire ; T-B6, T-B7). */
const tracerLaLecture = (quoi, matchs) => tracer(`lu ${quoi} : ${matchs.length} matchs, ${matchs.filter((m) => m.resultat !== undefined).length} issues`);

/** L'heure de Paris (heures × 60 + minutes) de l'horloge du processus (patron de la 39 ; figée dans un essai). */
function minutesAParis(instant = new Date()) {
  const parties = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const v = (t) => Number(parties.find((x) => x.type === t)?.value ?? NaN);
  return v('hour') * 60 + v('minute');
}
/** Jamais un calcul long pendant la passe de nuit de Pierre (0 h 10 → 2 h 30, heure de Paris). */
function pasLaNuit() {
  const m = minutesAParis();
  if (m >= 10 && m < 150) refuser('jamais entre 0 h 10 et 2 h 30 (heure de Paris) : la passe de nuit de Pierre tourne. Relancer après 2 h 30.');
}

/** Le texte de bancDuDirect.js « à scellement vide » : c'est son sha1 qui est scellé. */
const texteAScellementVide = (texte) => entreBalises(texte, BALISES_DU_BANC.scellement, SCELLEMENT_VIDE);
function sha1DuModule(relatif) {
  const c = path.join(SERVEUR, relatif);
  if (!fs.existsSync(c)) return null;
  if (relatif !== BANC_RELATIF) return sha1(c);
  try {
    return sha1Texte(texteAScellementVide(fs.readFileSync(c, 'utf8')));
  } catch {
    return null;
  }
}
/** Le sceau : le sha1 du texte JSON de SCELLEMENT. */
const sceauDe = (S) => (S ? sha1Texte(JSON.stringify(S)) : null);

/** La colonne fixée et sa déclaration ; refus « colonne non fixée » tant que --fixer-colonne n'est pas passé. */
async function laDeclaration() {
  const D = await import('../src/data/direct/declarationDuDirect.js');
  if (D.COLONNE === null) refuser('colonne non fixée : la colonne de O10 (« adoptee » ou « non-adoptee », l’issue du verdict de l’étape 27) se fixe au scellement, PAR SCRIPT (--fixer-colonne). Rien lancé.');
  const d = D.declarationDe(D.COLONNE);
  if (!ESSAI_REGLAGES.creneaux && !ESSAI_REGLAGES.T) return { D, d };
  return { D, d: { ...d, creneaux: ESSAI_REGLAGES.creneaux ?? d.creneaux, T: ESSAI_REGLAGES.T ?? d.T } };
}

/**
 * L'entrée de la 46 au registre de la mesure (R18 point 2 : le script lit K là) : refus si elle manque, si ses variantes
 * ne sont pas celles de la colonne (mêmes identifiants, même ordre), ou si la vue de la période du banc manque.
 */
async function leRegistre(d, debutDuBanc) {
  const L = await import('../src/bench/lancements.js');
  const entree = (L.LANCEMENTS ?? []).filter((l) => l.etape === '46').at(-1) ?? null;
  if (!entree) refuser('l’étape 46 n’est pas au registre de la mesure (bench/lancements.js) : la poser d’abord, PAR SCRIPT (SCR46\\ecriture\\registre46\\poser-registre-46.mjs poser <colonne> <date de l’export>), AVANT le scellement (R18 point 2).');
  const ids = (entree.variantes ?? []).map((v) => v.id);
  const attendus = d.variantes.map((v) => v.id);
  if (JSON.stringify(ids) !== JSON.stringify(attendus)) refuser(`le registre de la mesure déclare ${ids.length} variantes (${ids.join(', ')}) ; la colonne « ${d.colonne} » en déclare ${attendus.length} (${attendus.join(', ')}) : la pose du registre ne suit pas la colonne.`);
  const vue = (entree.vues ?? []).find((v) => v.de === debutDuBanc && Array.isArray(v.pour) && v.pour.includes('direct')) ?? null;
  if (!vue?.a) refuser(`la vue de la période du banc (de ${debutDuBanc}, portée « direct ») manque à l’entrée 46 du registre de la mesure.`);
  return { K: ids.length, version: entree.version, le: entree.le ?? null, finDeLaVue: vue.a };
}

/** Le sceau en vigueur ; refus s'il manque, ou si un module scellé a changé depuis (rien n'est lu). */
async function leSceau() {
  const B = await import('../src/data/direct/bancDuDirect.js');
  const S = B.SCELLEMENT;
  if (S === null) refuser('le banc n’est pas scellé : --sceller d’abord (l’export cite le sceau ; le banc le vérifie).');
  for (const [f, attendu] of Object.entries(S.modules)) {
    const reel = sha1DuModule(f);
    if (reel !== attendu) refuser(`${f} n’a plus le sha1 scellé (${reel ?? 'absent'} ≠ ${attendu}) : un module scellé a changé, rien lu.`);
  }
  return { B, S, sceau: sceauDe(S) };
}

/** Un fichier de sortie : jamais sous OneDrive, toujours dans le bac (ou la copie d'essai), jamais écrasé. */
function fichierDeSortie(nom = '--sortie') {
  const f = option(nom);
  if (!f) refuser(`${nom} <fichier> est obligatoire.`);
  const c = path.resolve(f);
  if (sousOneDrive(c)) refuser(`une sortie sous OneDrive est refusée (${c}).`);
  if (!estDans(c, RACINE_BAC) && !(ESSAI && estDans(c, process.env.CM_TEST_DOSSIER))) refuser(`une sortie hors du bac est refusée (${c}).`);
  if (fs.existsSync(c)) refuser(`la sortie existe déjà (${c}) : jamais écrasée.`);
  fs.mkdirSync(path.dirname(c), { recursive: true });
  if (!ESSAI && !estDans(cheminReel(path.dirname(c)), cheminReel(RACINE_BAC))) refuser(`la sortie sort du bac par une jonction (${cheminReel(path.dirname(c))}).`);
  return c;
}
/** Un verrou : même règle de lieu ; il peut exister (second passage : --rejouer-apres-correction). */
function fichierDeVerrou(nom) {
  const f = option(nom);
  if (!f) refuser(`${nom} <fichier> est obligatoire (un verrou par regard).`);
  const c = path.resolve(f);
  if (sousOneDrive(c)) refuser(`un verrou sous OneDrive est refusé (${c}).`);
  if (!estDans(c, RACINE_BAC) && !(ESSAI && estDans(c, process.env.CM_TEST_DOSSIER))) refuser(`un verrou hors du bac est refusé (${c}).`);
  return c;
}
/**
 * Le verrou FIXE d'un regard : banc46\verrou-<regard>.json du bac (les noms de la manœuvre). Correctif R5 du 13/11
 * après-midi (constat 5 du rebanc) : ancré sur la RACINE du bac, plus sur le dossier du code — un seul verrou par regard
 * pour tout le bac, où que soit rangé le code scellé (une piste, la copie gelée de banc46\code-scelle).
 */
const verrouFixeDe = (regard) => path.resolve(path.join(RACINE_BAC, 'banc46', `verrou-${regard}.json`));
const memeFichierDeVerrou = (a, b) => (process.platform === 'win32' ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
/**
 * UN SEUL REGARD DE CHAQUE NOM (correctif C4 du 13/11) : hors d'une copie d'essai, le verrou d'un regard n'est accepté
 * qu'à son chemin FIXE (banc46\verrou-surete.json, banc46\verrou-preuve.json) — un autre nom de verrou ne fait plus un
 * second regard. Contrôlé AVANT tout le reste du mode (rien lu, rien écrit). Dans une copie d'essai, le chemin reste libre.
 */
function verrouAuCheminFixe(nom, regard) {
  if (ESSAI) return;
  const attendu = verrouFixeDe(regard);
  const f = option(nom);
  if (!f || !memeFichierDeVerrou(f, attendu)) refuser(`${nom} : le verrou du regard de ${regard === 'surete' ? 'sûreté' : 'preuve'} est ${attendu}, et lui seul — un seul regard de chaque nom (reçu : ${f ? path.resolve(f) : 'rien'}).`);
}
/** Un export : son sha1 vérifié AVANT toute lecture. */
function exportVerifie(nomFichier = '--export', nomSha1 = '--sha1-export') {
  const fichier = option(nomFichier);
  const attendu = option(nomSha1);
  if (!fichier || !fs.existsSync(fichier) || !attendu) refuser(`${nomFichier} <jsonl> et ${nomSha1} <sha1> sont obligatoires (l’export de --exporter et son sha1).`);
  const reel = sha1(fichier);
  if (reel !== attendu) refuser(`l’export a changé depuis son sha1 (${reel} ≠ ${attendu}) : rien lu.`);
  return { fichier: path.resolve(fichier), sha1: attendu };
}
/** L'export lu ; `sansResultat` : `resultat` retiré par le lecteur JSON lui-même (aucune issue lue). */
function lireExport(B, fichier, { sansResultat }) {
  try {
    return B.lireLExport(fs.readFileSync(fichier, 'utf8'), { sansResultat });
  } catch (error) {
    return refuser(`export illisible (${fichier}) : ${error.message}`);
  }
}

// ------------------------------------------------------------ --fixer-colonne <adoptee|non-adoptee> [--remplacer]
if (MODE === '--fixer-colonne') {
  const colonne = option('--fixer-colonne');
  const D = await import('../src/data/direct/declarationDuDirect.js');
  const B = await import('../src/data/direct/bancDuDirect.js');
  if (!D.COLONNES.includes(colonne)) refuser(`--fixer-colonne <${D.COLONNES.join(' | ')}> : colonne inconnue ou absente (${colonne ?? 'absente'}).`);
  if (B.SCELLEMENT !== null) refuser('le banc est déjà scellé : la colonne ne change plus (le sceau la porte).');
  if (D.COLONNE === colonne) {
    dire(`[étape 46] la colonne est déjà « ${colonne} » : rien écrit.`);
    process.stdout.write(`${JSON.stringify({ ok: true, mode: 'fixer-colonne', colonne, deja: true, declaration: FICHIER_DECLARATION, sha1Declaration: sha1(FICHIER_DECLARATION) })}\n`);
    process.exit(0);
  }
  if (D.COLONNE !== null && !drapeau('--remplacer')) refuser(`la colonne est déjà fixée sur « ${D.COLONNE} » : --remplacer pour la changer (avant le scellement seulement).`);
  const avant = fs.readFileSync(FICHIER_DECLARATION, 'utf8');
  let apres = null;
  try {
    apres = entreBalises(avant, BALISES_DU_BANC.colonne, `export const COLONNE = '${colonne}';`);
  } catch (error) {
    refuser(`declarationDuDirect.js : ${error.message}`);
  }
  fs.writeFileSync(FICHIER_DECLARATION, apres);
  let relu = null;
  try {
    relu = await importFrais(FICHIER_DECLARATION);
  } catch {
    relu = null;
  }
  if (!relu || relu.COLONNE !== colonne || relu.DECLARATION?.colonne !== colonne) {
    fs.writeFileSync(FICHIER_DECLARATION, avant);
    refuser('la relecture du module ne redonne pas la colonne : declarationDuDirect.js remis tel qu’il était.');
  }
  const d = relu.DECLARATION;
  dire(`[étape 46] colonne fixée PAR SCRIPT : « ${colonne} » (${d.K} variantes, z ${nb(d.z)}, tranches ${nb(d.zTranches)} ; principal ${d.principal.a} → ${d.principal.b} ; T ${nb(d.T)}).`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'fixer-colonne', colonne, declaration: FICHIER_DECLARATION, sha1Declaration: sha1(FICHIER_DECLARATION), K: d.K, variantes: d.variantes.map((v) => v.id) })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --sceller --regles <md> --documents <f1,f2,…>
if (MODE === '--sceller') {
  const { D, d } = await laDeclaration();
  if (reglagesDEssai) refuser('jamais de sceau avec des réglages d’essai (CM_ESSAI_…).');
  const B = await import('../src/data/direct/bancDuDirect.js');
  if (B.SCELLEMENT !== null) refuser(`le banc est déjà scellé (le ${B.SCELLEMENT.scelleLe}) : un sceau ne se refait pas.`);
  const regles = option('--regles');
  if (!regles || !fs.existsSync(regles)) refuser('--regles <md> est obligatoire : le document unique des règles du banc 46, écrit AVANT le regard (R18 point 1).');
  const documents = String(option('--documents') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!documents.length) refuser('--documents <f1,f2,…> est obligatoire : la conception, les décisions, la critique (R18 point 1).');
  const docs = documents.map((f) => {
    if (!fs.existsSync(f)) refuser(`document introuvable (${f}).`);
    return { nom: path.basename(f), sha1: sha1(f) };
  });
  if (new Set(docs.map((x) => x.nom)).size !== docs.length) refuser('deux documents portent le même nom.');
  const texteRegles = fs.readFileSync(regles, 'utf8');
  const manquants = docs.filter((x) => !texteRegles.includes(x.sha1));
  if (manquants.length) refuser(`les règles ne citent pas par leur sha1 : ${manquants.map((x) => `${x.nom} (${x.sha1})`).join(', ')} (R18 point 1).`);
  const registre = await leRegistre(d, D.DEBUT_DU_BANC);
  const modules = {};
  for (const f of MODULES_SCELLES) {
    const s = sha1DuModule(f);
    if (!s) refuser(`module à sceller introuvable (${f}).`);
    modules[f] = s;
  }
  const S = {
    format: 1,
    scelleLe: new Date().toISOString(),
    colonne: d.colonne,
    regles: { fichier: path.basename(regles), sha1: sha1(regles) },
    documents: Object.fromEntries(docs.map((x) => [x.nom, x.sha1])),
    modules,
    declaration: { K: d.K, z: d.z, zTranches: d.zTranches, T: d.T, creneaux: [...d.creneaux], variantes: d.variantes.map((v) => v.id), affichee: d.affichee, principal: { ...d.principal }, repliJ4c: d.repliJ4c ? { ...d.repliJ4c } : null, modele: { ...d.modele, roles: [...d.modele.roles] } },
    juge: { ...D.JUGE },
    seuils: { ...D.SEUILS },
    registre
  };
  const avant = fs.readFileSync(FICHIER_BANC, 'utf8');
  let apres = null;
  try {
    apres = entreBalises(avant, BALISES_DU_BANC.scellement, `export const SCELLEMENT = geler(${JSON.stringify(S)});`);
  } catch (error) {
    refuser(`bancDuDirect.js : ${error.message}`);
  }
  fs.writeFileSync(FICHIER_BANC, apres);
  let relu = null;
  try {
    relu = await importFrais(FICHIER_BANC);
  } catch {
    relu = null;
  }
  if (!relu || JSON.stringify(relu.SCELLEMENT) !== JSON.stringify(S) || !Object.isFrozen(relu.SCELLEMENT?.modules) || sha1DuModule(BANC_RELATIF) !== modules[BANC_RELATIF]) {
    fs.writeFileSync(FICHIER_BANC, avant);
    refuser('la relecture du module ne redonne pas le sceau : bancDuDirect.js remis tel qu’il était.');
  }
  const sceau = sceauDe(relu.SCELLEMENT);
  dire(`[étape 46] SCELLÉ PAR SCRIPT le ${S.scelleLe} : colonne « ${S.colonne} », ${Object.keys(modules).length} modules, règles ${S.regles.sha1}, ${docs.length} documents, registre (K = ${registre.K}, vue jusqu’au ${registre.finDeLaVue}) ; sceau ${sceau}.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'sceller', sceau, scelleLe: S.scelleLe, colonne: S.colonne, modules: Object.keys(modules).length, regles: S.regles, documents: S.documents, registre, banc: FICHIER_BANC, sha1Banc: sha1(FICHIER_BANC) })}\n`);
  process.exit(0);
}

/**
 * LA LIGNE DU BANC d'une rencontre : celle que le direct lirait avec l'heure RÉELLE du coup d'envoi (R19 ; le patron de
 * ligneDeService, entreesDuDirect.js : les clés de nuit par identifiants FotMob au jour UTC du coup d'envoi, la veille et le
 * lendemain ; apres_coup_d_envoi = 0, calcule_le ≤ la nuit complète et < la borne ; la veille ou le lendemain seulement à
 * heure inconnue ou à moins de 3 h), filtrée par la GRILLE de la colonne et ses RÔLES dans l'ordre (R1 point 2 : service,
 * puis la candidate de l'empreinte adoptée). La borne : `meta.kickoff` ; sans lui, minuit de Paris du jour du MAGASIN
 * (R19 point 1, la borne la plus prudente, que kickoff_connu vaille 0 ou 1).
 */
function ligneDuBanc(database, { homeId, awayId, coup, jour, grille, roles, empreinte, nuit, cleDeNuit, minuitDeParis }) {
  const borne = coup ? Date.parse(coup) : minuitDeParis(jour);
  const base = coup ? Date.parse(coup) : Date.parse(`${jour}T12:00:00Z`);
  const borneIso = new Date(borne).toISOString();
  const cles = [0, -1, 1].map((decalage) => ({ decalage, cle: cleDeNuit({ homeId, awayId, commenceTime: new Date(base + decalage * JOUR_MS).toISOString() }) }));
  if (!cles[0].cle) return { trouve: false, raison: 'sansIdentifiant' };
  const lire = database.prepare(
    'SELECT fixture_key, role, calcule_le, version, grille, engine_version, candidate_hash, lambda, mu, rho, fair, odds_source, odds_at, kickoff, kickoff_connu, date, graine FROM simulation_matchs ' +
      'WHERE fixture_key = ? AND role = ? AND grille = ? AND (? IS NULL OR candidate_hash = ?) AND apres_coup_d_envoi = 0 AND calcule_le <= ? AND calcule_le < ? ORDER BY calcule_le DESC LIMIT 1'
  );
  for (const role of roles) {
    const h = role === 'candidate' ? empreinte : null;
    for (const { decalage, cle } of cles) {
      const r = lire.get(cle, role, grille, h, h, nuit, borneIso);
      if (!r) continue;
      if (decalage !== 0) {
        const k = Date.parse(r.kickoff ?? '');
        if (!(r.kickoff_connu === 0 || (Number.isFinite(k) && Math.abs(k - base) < 3 * 3_600_000))) continue;
      }
      return { trouve: true, ...r };
    }
  }
  const apres = database.prepare(`SELECT 1 AS x FROM simulation_matchs WHERE fixture_key = ? AND grille = ? AND role IN (${roles.map(() => '?').join(', ')}) AND (apres_coup_d_envoi = 1 OR calcule_le >= ?) LIMIT 1`);
  const calculeeApres = cles.some(({ cle }) => Boolean(apres.get(cle, grille, ...roles, borneIso)));
  return { trouve: false, raison: calculeeApres ? 'calculeeApresLeCoupDEnvoi' : 'sansLigneAvantLeCoupDEnvoi' };
}

/** Un rouge noté « not_on_pitch » (R36 point 7 : compté comme un rouge, comme PARAMS l'a appris ; compté à part ici). */
const horsTerrain = (e) => e?.notOnPitch === true || String(e?.note ?? '').toLowerCase() === 'not_on_pitch';

// ------------------------------------------------------------ --exporter --sortie <jsonl> --au <jour> --passe <json> [--de <jour>] [--base <db>]
if (MODE === '--exporter') {
  const { D, d } = await laDeclaration();
  const { S, sceau } = await leSceau();
  if (S.colonne !== d.colonne) refuser(`le sceau porte la colonne « ${S.colonne} », le code « ${d.colonne} ».`);
  const de = option('--de') ?? D.DEBUT_DU_BANC;
  const au = option('--au');
  if (!jourValide(de) || de < D.DEBUT_DU_BANC) refuser(`--de ${de} : la période du banc commence le ${D.DEBUT_DU_BANC} (P5, P7) — jamais avant.`);
  if (!jourValide(au) || au < de) refuser('--au <AAAA-MM-JJ> est obligatoire (le dernier jour exporté : la date posée au registre de la mesure).');
  const passe = option('--passe');
  if (!passe) refuser('--passe <refresh-status.json> est obligatoire : la passe de Pierre est attendue avant l’export (R36 point 2).');
  const sortie = fichierDeSortie('--sortie');
  const { db, chemin, octets } = baseEnLecture();
  const manquantes = ['simulation_matchs', 'simulation_state', 'matches'].filter((t) => !db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));
  if (manquantes.length) refuser(`la base n’a pas ${manquantes.join(', ')} : ce n’est pas une copie de l’appli d’après l’étape 28.`);
  const passeAvant = attendreLaPasse(passe);
  const t0 = performance.now();
  const { lecteurDesRencontres } = await import('../src/data/calibration.js');
  const { indicateursDUneRencontre } = await import('../src/data/db/dayTable.js');
  const { issuesDuMagasin, minuitDeParis } = await import('../src/data/simulation/simulationNuit.js');
  const { graineDuMatch } = await import('../src/data/simulation/simulationMatch.js');
  const { lireEtat } = await import('../src/data/simulation/etatSimulation.js');
  const { cleDeNuit } = await import('../src/data/simulation/simulationRead.js');
  const { lireLeFair } = await import('../src/data/direct/calculDuDirect.js');
  const etat = lireEtat({ database: db });
  const nuit = etat.nuits?.matchs?.calculeLe ?? null;
  if (!nuit) refuser('aucune nuit complète des matchs dans la copie (simulation_state) : rien à exporter.');
  const { grille, roles, empreinteAdoptee } = d.modele;
  const fixtures = db
    .prepare(`SELECT DISTINCT home_id, away_id, date FROM simulation_matchs WHERE date >= ? AND date <= ? AND grille = ? AND role IN (${roles.map(() => '?').join(', ')}) AND home_id IS NOT NULL AND away_id IS NOT NULL ORDER BY date, home_id, away_id`)
    .all(de, au, grille, ...roles);
  const gen = lecteurDesRencontres(db, { du: de, au });
  let pas = gen.next();
  while (!pas.done) pas = gen.next();
  const lire = pas.value;
  const lireMatch = db.prepare('SELECT league, meta, events FROM matches WHERE match_key = ?');
  const exclus = {};
  const nommes = { graine: [], calculeeApresLeCoupDEnvoi: [], sansVersionDuMoteur: [] };
  const exclure = (raison, nom = null) => {
    exclus[raison] = (exclus[raison] ?? 0) + 1;
    if (nom && nommes[raison] && nommes[raison].length < 200) nommes[raison].push(nom);
  };
  const vues = new Set();
  const lignes = [];
  const versions = {};
  let rougesHorsTerrain = 0;
  let matchsHorsTerrain = 0;
  for (const f of fixtures) {
    const homeId = `fotmob-${String(f.home_id).replace('fotmob-', '')}`;
    const awayId = `fotmob-${String(f.away_id).replace('fotmob-', '')}`;
    const r = lire({ homeId, awayId, date: f.date });
    if (r.raison) {
      exclure(r.raison);
      continue;
    }
    if (vues.has(r.matchKey)) {
      exclure('memeRencontre');
      continue;
    }
    vues.add(r.matchKey);
    if (r.date < de || r.date > au) {
      exclure('horsDeLaFenetre');
      continue;
    }
    if (r.reglement?.attribue) {
      exclure('attribue');
      continue;
    }
    if (!r.reglement?.buts) {
      exclure('nonReglableButs');
      continue;
    }
    const m = lireMatch.get(r.matchKey);
    let events = null;
    try {
      events = typeof m?.events === 'string' ? JSON.parse(m.events) : (m?.events ?? null);
    } catch {
      events = null;
    }
    const hg90 = r.reglement.buts.home;
    const ag90 = r.reglement.buts.away;
    const iss = issuesDuMagasin({ hg: hg90, ag: ag90, events });
    if (!iss.complet) {
      exclure('chronologieIncomplete');
      continue;
    }
    if (!events.some((e) => e?.type === 'substitution')) {
      exclure('sansRemplacement');
      continue;
    }
    const l = ligneDuBanc(db, { homeId, awayId, coup: r.coupDEnvoi, jour: r.date, grille, roles, empreinte: empreinteAdoptee, nuit, cleDeNuit, minuitDeParis });
    if (!l.trouve) {
      exclure(l.raison, l.raison === 'calculeeApresLeCoupDEnvoi' ? r.matchKey : null);
      continue;
    }
    // Correctif C3 du 13/11 : une ligne « service » SANS version du moteur (registre illisible la nuit du calcul, ou
    // version pas encore notée) est exclue, comptée et nommée — sinon elle ferait refuser tout l'export (versions mêlées),
    // sans issue sous sceau. Les candidates de l'empreinte adoptée restent : elles n'ont jamais de version (R1 point 2).
    if (l.role !== 'candidate' && (l.engine_version === null || l.engine_version === undefined)) {
      exclure('sansVersionDuMoteur', `${l.fixture_key} (${l.role}, ${l.calcule_le})`);
      continue;
    }
    let attendue = null;
    try {
      attendue = graineDuMatch({ cle: l.fixture_key, role: l.role, lambda: l.lambda, mu: l.mu, rho: l.rho, version: l.version });
    } catch {
      attendue = null;
    }
    if (attendue !== l.graine) {
      exclure('graine', `${l.fixture_key} (${l.role}, ${l.calcule_le})`);
      continue;
    }
    const ind = indicateursDUneRencontre(m?.meta ?? null, m?.league ?? null);
    const ajouts = { 45: [], 91: [] };
    let hors = 0;
    for (const e of events) {
      if (e?.type === 'goal' && Number.isInteger(Number(e.addedTime)) && Number(e.addedTime) >= 1) {
        if (Number(e.minute) === 45) ajouts['45'].push(Number(e.addedTime));
        else if (Number(e.minute) === 90) ajouts['91'].push(Number(e.addedTime));
      }
      if (e?.type === 'card' && (e.card === 'red' || e.card === 'yellowred') && horsTerrain(e)) hors++;
    }
    rougesHorsTerrain += hors;
    if (hors) matchsHorsTerrain++;
    const v = String(l.engine_version ?? (l.role === 'candidate' ? 'candidate sans version' : 'inconnue'));
    versions[v] = (versions[v] ?? 0) + 1;
    lignes.push(
      JSON.stringify({
        type: 'match',
        cle: l.fixture_key,
        matchKey: r.matchKey,
        date: r.date,
        league: m?.league ?? null,
        kickoff: r.coupDEnvoi ?? null,
        ligne: {
          role: l.role,
          grille: l.grille,
          engineVersion: l.engine_version ?? null,
          candidateHash: l.candidate_hash ?? null,
          calculeLe: l.calcule_le,
          lambda: l.lambda,
          mu: l.mu,
          rho: l.rho,
          fair: lireLeFair(l.fair),
          oddsSource: l.odds_source ?? null,
          oddsAt: l.odds_at ?? null,
          kickoffConnu: l.kickoff_connu !== 0,
          version: l.version,
          graine: l.graine
        },
        resultat: { hg90, ag90, buts: iss.buts, rouges: iss.rouges, prolongation: Boolean(ind.prolongation), ajouts }
      })
    );
  }
  db.close();
  const entete = {
    type: 'entete',
    format: 1,
    quoi: 'Export du banc du direct (étape 46, lot 1) : une ligne d’avant-match par match et, à part, `resultat` (le déroulé et le score de la 90e).',
    colonne: d.colonne,
    modele: { grille, roles: [...roles], empreinteAdoptee, engineVersions: versions },
    fenetre: { de, au },
    exporteLe: new Date().toISOString(),
    base: { chemin, octets },
    nuit,
    principal28: etat.principal ?? null,
    scellement: { sha1: sceau, scelleLe: S.scelleLe },
    exclus,
    nommes,
    rougesHorsTerrain: { rouges: rougesHorsTerrain, matchs: matchsHorsTerrain, regle: 'R36 point 7 : un rouge noté not_on_pitch compte comme un rouge (PARAMS a été appris ainsi).' },
    rencontresLues: fixtures.length,
    matchs: lignes.length,
    passeDePierre: passeAvant
  };
  ecrire(sortie, `${[JSON.stringify(entete), ...lignes].join('\n')}\n`);
  const dureeS = Math.round((performance.now() - t0) / 100) / 10;
  dire(`[étape 46] --exporter (${de} → ${au}, colonne « ${d.colonne} », grille ${grille}) : ${nb(lignes.length)} matchs ; exclus ${Object.entries(exclus).map(([k, n]) => `${k} ${n}`).join(', ') || 'aucun'} ; principal de la 28 ${etat.principal ? 'rendu' : 'PAS RENDU (le banc refusera)'} ; ${dureeS} s.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'exporter', sortie, sha1: sha1(sortie), matchs: lignes.length, exclus, principal28: Boolean(etat.principal), sceau, dureeS })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --comptes --export <jsonl> --sha1-export <sha1> --sortie <json>
if (MODE === '--comptes') {
  const { d } = await laDeclaration();
  const { B, sceau } = await leSceau();
  pasLaNuit();
  const exp = exportVerifie();
  const sortie = fichierDeSortie('--sortie');
  const debut = new Date().toISOString();
  const t0 = performance.now();
  const { entete, matchs } = lireExport(B, exp.fichier, { sansResultat: true });
  tracerLaLecture('export (comptes)', matchs);
  const controle = B.controlerLExport(entete, matchs, d, { scellementSha1: sceau });
  const e1 = B.etalonnageEtage1(matchs, d);
  const comptes = B.comptesDeLExport(entete, matchs, d, { ancrages: e1.ancrages });
  const { ancrages: _ancrages, ...etalonnage } = e1;
  ecrireJson(sortie, {
    format: B.VERSION_DU_BANC,
    mode: 'comptes',
    aucunResultatLu: true,
    champsRetires: B.CHAMPS_DU_RESULTAT,
    debut,
    fin: new Date().toISOString(),
    dureeS: Math.round((performance.now() - t0) / 100) / 10,
    colonne: d.colonne,
    export: { ...exp, matchs: matchs.length, de: entete.fenetre?.de ?? null, a: entete.fenetre?.au ?? null },
    sceau,
    controle,
    etalonnage,
    comptes,
    essai: reglagesDEssai ? ESSAI_REGLAGES : null
  });
  dire(`[étape 46] comptes écrits : ${sortie} (sha1 ${sha1(sortie)}) ; ${nb(matchs.length)} matchs, aucun résultat lu ; étalonnage de l’étage 1 : ${e1.ok ? `à l’octet (${nb(e1.lectures)} lectures ; ${nb(e1.massesAuPlafond.n)} masses au plafond aux états fabriqués 9-0, 4-4, 12-1, comptées)` : `EN ÉCART (${nb(e1.nEcarts)} écarts : rien ne sera lu avant correction)`} ; refus à venir : ${controle.refus.length ? controle.refus.join(' ; ') : 'aucun'}.`);
  process.stdout.write(`${JSON.stringify({ ok: e1.ok, mode: 'comptes', sortie, sha1: sha1(sortie), matchs: matchs.length, etalonnage: e1.ok, ecarts: e1.ecarts.slice(0, 20), refus: controle.refus })}\n`);
  process.exit(e1.ok ? 0 : 3);
}

/**
 * LES CONTRÔLES D'AVANT LE VERROU, communs à --banc et --preuve ; aucune issue n'y est lue (l'export est lu SANS
 * `resultat`). L'ordre : la colonne, le sceau et ses modules, le registre (K, variantes, vue), --k, l'heure, les règles
 * scellées, la règle de R16, l'export (sha1 ; colonne, grille, version, sceau, principal de la 28), la vue du registre,
 * l'étalonnage de l'étage 1 (les comptes de CET export), les tailles (600 ; T), la passe.
 */
async function avantLeVerrou(regard) {
  const { D, d } = await laDeclaration();
  const { B, S, sceau } = await leSceau();
  if (S.colonne !== d.colonne) refuser(`le sceau porte la colonne « ${S.colonne} », le code « ${d.colonne} ».`);
  const registre = await leRegistre(d, D.DEBUT_DU_BANC);
  const K = Number(option('--k'));
  if (K !== registre.K || K !== d.K) refuser(`--k ${option('--k') ?? '(absent)'} : K doit valoir le nombre de variantes déclarées (${registre.K} au registre de la mesure, ${d.K} pour la colonne « ${d.colonne} »).`);
  pasLaNuit();
  const regles = option('--regles');
  if (!regles || !fs.existsSync(regles)) refuser('--regles <md> est obligatoire (les règles scellées).');
  const sha1Regles = sha1(regles);
  if (sha1Regles !== S.regles.sha1) refuser(`les règles ne sont pas celles du sceau (${sha1Regles} ≠ ${S.regles.sha1}) : rien lu.`);
  const libelles = option('--libelles-json');
  if (!libelles || !fs.existsSync(libelles)) refuser('--libelles-json <libelles.json> est obligatoire (R16 : les comptes des rouges de --libelles vont dans la note).');
  const lib = lireJson(libelles, 'libelles.json');
  if (!lib?.regleR16 || typeof lib.regleR16.declenchee !== 'boolean') refuser('libelles.json ne porte pas la règle de R16 (regleR16).');
  if (lib.regleR16.declenchee) refuser('la règle de R16 est DÉCLENCHÉE : le banc devrait prendre les rouges en retard (direct-rouges-exacts), qui n’est pas codée — retour à la séance du verdict.');
  const exp = exportVerifie();
  const { entete, matchs } = lireExport(B, exp.fichier, { sansResultat: true });
  tracerLaLecture('export (contrôles)', matchs);
  const controle = B.controlerLExport(entete, matchs, d, { scellementSha1: sceau });
  if (controle.refus.length) refuser(`${controle.refus.join(' ; ')} : rien lu.`);
  if (!(entete.fenetre?.au <= registre.finDeLaVue)) refuser(`l’export va jusqu’au ${entete.fenetre?.au}, la vue de l’étape 46 au registre de la mesure s’arrête au ${registre.finDeLaVue} : reposer le registre à la date de l’export (avenant), puis relancer.`);
  const comptes = option('--comptes-json');
  if (!comptes || !fs.existsSync(comptes)) refuser('--comptes-json <comptes.json> est obligatoire : l’étalonnage de l’étage 1 (--comptes) passe AVANT le regard (R20).');
  const cj = lireJson(comptes, 'les comptes');
  if (cj?.mode !== 'comptes' || cj?.export?.sha1 !== exp.sha1 || cj?.sceau !== sceau) refuser('les comptes ne sont pas ceux de cet export sous ce sceau : --comptes sur cet export d’abord.');
  if (cj?.etalonnage?.ok !== true) refuser(`étalonnage de l’étage 1 en écart (${cj?.etalonnage?.nEcarts ?? '?'} écarts dans les comptes) : rien n’est lu — corriger d’abord (R20), puis --comptes à nouveau.`);
  const surete = ESSAI_REGLAGES.surete ?? D.SEUILS.surete;
  if (matchs.length < surete) refuser(`moins de ${surete} matchs dans l’export (${matchs.length}) : le banc ne passe pas (l’écran reste « pas encore jugé »).`);
  if (regard === 'surete' && matchs.length >= d.T) refuser(`l’export a déjà ${matchs.length} matchs, pas moins que T = ${d.T} : seul le regard de preuve est pris (--preuve, R15 point 2).`);
  if (regard === 'preuve' && matchs.length < d.T) refuser(`moins de T = ${d.T} matchs dans l’export (${matchs.length}) : le regard de preuve attend la taille fixée d’avance (R12 point 4).`);
  const passe = option('--passe');
  if (!passe) refuser('--passe <refresh-status.json> est obligatoire : la passe de Pierre est attendue avant le calcul, puis relue toutes les 50 rencontres.');
  return { D, d, B, S, sceau, registre, K, regles: { fichier: path.resolve(regles), sha1: sha1Regles }, libelles: { fichier: path.resolve(libelles), sha1: sha1(libelles), regleR16: lib.regleR16 }, exp, entete, matchs, comptes: { fichier: path.resolve(comptes), sha1: sha1(comptes) }, passe };
}

/**
 * Le verrou existant (second passage) : refusé sans raison ; la raison sans verrou : refusée. Correctif C4 du 13/11 : le
 * rejeu « après correction » rejoue le MÊME export que le dernier passage du verrou ; un AUTRE export est un autre regard,
 * refusé sauf avec --autre-export (décidé à la séance), et noté dans le verrou. Rien n'est écrit ici.
 */
function preparerLeVerrou(verrou, exp) {
  const raison = option('--rejouer-apres-correction');
  if (!fs.existsSync(verrou)) {
    if (raison !== null || drapeau('--rejouer-apres-correction')) refuser('--rejouer-apres-correction sans passage précédent (aucun verrou) : rien à rejouer.');
    if (drapeau('--autre-export')) refuser('--autre-export sans passage précédent (aucun verrou) : il ne sert qu’à un rejeu après correction.');
    return { raison: null, existant: null, precedent: null, autreExport: false };
  }
  if (!raison || !raison.trim()) refuser(`le banc a DÉJÀ été passé (verrou ${verrou}) : un second passage est refusé sans --rejouer-apres-correction "<raison>".`);
  const v = lireJson(verrou, 'le verrou');
  const dernierExport = v.rejeux?.at(-1)?.export?.sha1 ?? v.export?.sha1 ?? null;
  const autreExport = Boolean(dernierExport) && dernierExport !== exp.sha1;
  if (autreExport && !drapeau('--autre-export')) refuser(`--rejouer-apres-correction rejoue le MÊME export (${dernierExport}) ; ${exp.sha1} est un autre export : un autre export est un autre regard — retour à la séance (puis --autre-export, noté dans le verrou).`);
  const derniere = v.rejeux?.at(-1)?.sortie ?? v.sortie ?? null;
  const ancienne = derniere && fs.existsSync(derniere) ? lireJson(derniere, 'la sortie précédente') : null;
  return {
    raison,
    existant: v,
    autreExport,
    precedent: {
      sortie: derniere,
      export: dernierExport,
      verdict: ancienne?.banc?.verdict ?? null,
      jugements: ancienne?.banc?.jugements?.map((x) => ({ id: x.id, verdict: x.verdict })) ?? null,
      etalonnage: ancienne?.etalonnage ? { ok: ancienne.etalonnage.ok, nEcarts: ancienne.etalonnage.nEcarts } : null
    }
  };
}
/** Le verrou posé (AVANT toute lecture d'une issue ; jamais retiré) ; un second passage s'y ajoute avec sa raison (et, C4, s'il porte sur un autre export). */
function poserLeVerrou(verrou, prep, entree) {
  if (prep.existant) fs.writeFileSync(verrou, `${JSON.stringify({ ...prep.existant, rejeux: [...(prep.existant.rejeux ?? []), { ...entree, raison: prep.raison, autreExport: prep.autreExport }] })}\n`);
  else fs.writeFileSync(verrou, `${JSON.stringify(entree)}\n`, { flag: 'wx' });
  tracer(`verrou ${entree.regard}`);
}

/** Le passage sous verrou, commun aux deux regards : rejeu, étalonnage 2, F1, jugements, garde, temps additionnel, table. */
function passer(a, { regard, matchs, pose, verrou, prep, passeAvant, preuve = null, ecarts = null }) {
  const t0 = performance.now();
  const pauses = { relectures: 0, attenduS: 0 };
  const r = a.B.passerLeBanc({
    matchs,
    declaration: a.d,
    regard,
    ...(ESSAI_REGLAGES.tirages ? { tirages: ESSAI_REGLAGES.tirages } : {}),
    ...(ESSAI_REGLAGES.etalonnage ? { ignorerEtalonnage: true } : {}),
    // R36 point 2 : la passe de Pierre relue toutes les 50 rencontres ; si elle tourne, le banc attend (sans limite).
    auFil: () => {
      const p = attendreLaPasse(a.passe, Number.POSITIVE_INFINITY);
      pauses.relectures++;
      pauses.attenduS += p.attenduS;
    }
  });
  const roles = {};
  for (const m of matchs) roles[m.ligne?.role] = (roles[m.ligne?.role] ?? 0) + 1;
  // C1 : la version du modèle jugé est celle des lignes « service » (les candidates de l'empreinte adoptée n'en ont pas).
  const versions = [...new Set(matchs.filter((m) => m.ligne?.role !== 'candidate').map((m) => m.ligne?.engineVersion))];
  const hashes = [...new Set(matchs.map((m) => m.ligne?.candidateHash).filter(Boolean))];
  return {
    format: a.B.VERSION_DU_BANC,
    quoi: regard === 'surete' ? 'Banc du direct (étape 46, lot 1) : le regard de SÛRETÉ (R15 point 1).' : 'Banc du direct (étape 46, lot 1) : le regard de PREUVE (R15 points 2 à 4).',
    ou: ESSAI ? 'copie d’essai' : 'bac à sable',
    regard,
    premierRegard: pose,
    fin: new Date().toISOString(),
    dureeS: Math.round((performance.now() - t0) / 100) / 10,
    colonne: a.d.colonne,
    modele: { grille: a.d.modele.grille, engineVersion: versions.length === 1 ? versions[0] : versions, candidateHash: hashes.length === 1 ? hashes[0] : null },
    export: { fichier: a.exp.fichier, sha1: a.exp.sha1, matchs: matchs.length, de: a.entete.fenetre?.de ?? null, a: a.entete.fenetre?.au ?? null, roles, principal28: a.entete.principal28 ?? null, exclus: a.entete.exclus ?? null },
    comptes: a.comptes,
    passeDePierre: { avant: passeAvant, pendant: pauses },
    regles: { fichier: a.regles.fichier, sha1: a.regles.sha1, copie: FIXTURES_DU_BANC.regles },
    scellement: { sha1: a.sceau, scelleLe: a.S.scelleLe, modules: a.S.modules, documents: a.S.documents },
    registre: a.registre,
    verrou: { fichier: verrou, pose },
    rouges: { auBanc: 'a-la-minute', retardMedianCreneaux: a.libelles.regleR16.retardMedianMin ?? null, partSansRouge: a.libelles.regleR16.partSansRougeLu ?? null, libelles: { fichier: a.libelles.fichier, sha1: a.libelles.sha1 }, phrase: 'au banc, les cartons rouges sont connus à la minute ; en direct, ils arrivent quelques minutes après' },
    preuve,
    ecartsDesExports: ecarts,
    rejeu: prep.precedent ? { raison: prep.raison, autreExport: prep.autreExport, exportPrecedent: prep.precedent.export, sortiePrecedente: prep.precedent.sortie, verdictPrecedent: prep.precedent.verdict, jugementsPrecedents: prep.precedent.jugements, etalonnagePrecedent: prep.precedent.etalonnage } : null,
    essai: reglagesDEssai ? ESSAI_REGLAGES : null,
    etalonnage: r.etalonnage,
    arret: r.arret,
    banc: r.banc
  };
}

/** La fin d'un passage : la sortie écrite, le résumé ; code 3 si l'étalonnage de l'étage 2 a tout arrêté (rien jugé). */
function finirLePassage(sortie, resultat, mode) {
  ecrireJson(sortie, resultat);
  if (resultat.arret) {
    dire(`[étape 46] ÉTALONNAGE EN ÉCART — rien n’est jugé, aucune note : ${resultat.etalonnage.ecarts.slice(0, 20).join(' ; ')}`);
    process.stdout.write(`${JSON.stringify({ ok: false, mode, arret: 'etalonnage', sortie, sha1: sha1(sortie), nEcarts: resultat.etalonnage.nEcarts, ecarts: resultat.etalonnage.ecarts.slice(0, 50) })}\n`);
    process.exit(3);
  }
  const b = resultat.banc;
  dire(`[étape 46] ${mode} : ${b.phrase}`);
  if (resultat.preuve?.avertissement) dire(`  ATTENTION : ${resultat.preuve.avertissement}`);
  dire(`  colonne « ${b.colonne} », K ${b.K}, z ${nb(b.z)} ; ${nb(b.n)} matchs, ${nb(b.points)} points ; variante affichée ${b.affichee}${b.principal.repliJ4c ? ' (repli de J4c)' : ''} ; F1 ${b.f1.tenu && !b.f1.nonTenuPar.length ? 'tenu' : 'NON TENU'} ; filet : ${b.filet.ecartees} lignes écartées`);
  if (b.horsF1?.n) dire(`  hors de F1 (C11) : ${b.horsF1.n} ${b.horsF1.n > 1 ? 'matchs retirés' : 'match retiré'} de tous les jugements : ${b.horsF1.matchs.slice(0, 20).map((x) => `${x.cle} (${x.ou}, masse ${x.masse})`).join(' ; ')}`);
  if (resultat.preuve?.identite?.rompues?.n) dire(`  identité des lignes (C12) : ${resultat.preuve.identite.rompues.n} sur ${resultat.preuve.identite.communs} matchs communs retirés des deux côtés : ${resultat.preuve.identite.rompues.matchs.join(', ')}`);
  for (const j of b.jugements) dire(`  ${String(j.id).padEnd(26)} ${String(j.verdict).padEnd(20)}${j.gain !== null && j.gain !== undefined ? ` gain ${j.gain} [${(j.fourchette ?? []).join(' ; ')}]` : ''}`);
  dire(`  tranches non montrées : ${b.tranchesNonMontrees.join(', ') || 'aucune'} ; familles non montrées : ${b.famillesNonMontrees.join(', ') || 'aucune'} ; paires écartées ${b.paires.ecartees.length}, à surveiller ${b.paires.aSurveiller.length} (sur ${b.paires.jugees} jugées)`);
  if (resultat.rejeu?.jugementsPrecedents) {
    dire(`  côte à côte (passage précédent → celui-ci ; raison : ${resultat.rejeu.raison}) :`);
    for (const j of b.jugements) dire(`    ${String(j.id).padEnd(26)} ${resultat.rejeu.jugementsPrecedents.find((x) => x.id === j.id)?.verdict ?? '?'} → ${j.verdict}`);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, mode, sortie, sha1: sha1(sortie), regard: b.regard, verdict: b.verdict, phrase: b.phrase, affichee: b.affichee, jugements: Object.fromEntries(b.jugements.map((j) => [j.id, j.verdict])), horsF1: b.horsF1?.n ?? 0, ...(resultat.preuve?.avertissement ? { avertissement: resultat.preuve.avertissement } : {}), ...(resultat.preuve?.identite ? { identiteRompues: resultat.preuve.identite.rompues.n } : {}) })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --banc : le regard de SÛRETÉ (dès 600 matchs, R15 point 1)
if (MODE === '--banc') {
  verrouAuCheminFixe('--verrou', 'surete');
  const a = await avantLeVerrou('surete');
  const verrou = fichierDeVerrou('--verrou');
  const sortie = fichierDeSortie('--sortie');
  const prep = preparerLeVerrou(verrou, a.exp);
  const passeAvant = attendreLaPasse(a.passe);
  const pose = new Date().toISOString();
  poserLeVerrou(verrou, prep, { pose, pid: process.pid, regard: 'surete', colonne: a.d.colonne, K: a.K, sceau: a.sceau, regles: a.regles, export: { ...a.exp, matchs: a.matchs.length }, comptes: a.comptes, sortie });
  dire(`[étape 46] verrou posé (${verrou}) à ${pose} : le regard de sûreté commence.`);
  if (sha1(a.exp.fichier) !== a.exp.sha1) refuser('l’export a changé pendant les contrôles : rien lu (le verrou reste posé ; relancer avec --rejouer-apres-correction).');
  const { matchs } = lireExport(a.B, a.exp.fichier, { sansResultat: false });
  tracerLaLecture('export (passage)', matchs);
  finirLePassage(sortie, passer(a, { regard: 'surete', matchs, pose, verrou, prep, passeAvant }), 'banc');
}

// ------------------------------------------------------------ --preuve : le regard de PREUVE (à T ; R15 points 2 à 4)
if (MODE === '--preuve') {
  const sansSurete = drapeau('--sans-surete');
  verrouAuCheminFixe('--verrou', 'preuve');
  if (!sansSurete) verrouAuCheminFixe('--verrou-surete', 'surete');
  const a = await avantLeVerrou('preuve');
  const verrou = fichierDeVerrou('--verrou');
  // L'AVENANT (R15 point 3) : limité au sha1 de l'export de ce regard et à sa date (le registre a été reposé à cette date).
  const avenantF = option('--avenant');
  if (!avenantF || !fs.existsSync(avenantF)) refuser('--avenant <md> est obligatoire : l’avenant aux règles, limité au sha1 de l’export de ce regard et à sa date (R15 point 3).');
  const texteAvenant = fs.readFileSync(avenantF, 'utf8');
  if (!texteAvenant.includes(a.exp.sha1) || !texteAvenant.includes(String(a.entete.fenetre?.au))) refuser(`l’avenant ne cite pas le sha1 de l’export (${a.exp.sha1}) et sa date (${a.entete.fenetre?.au}) : rien lu.`);
  if (path.resolve(avenantF) === a.regles.fichier) refuser('l’avenant est un document à part des règles scellées.');
  const avenant = { fichier: path.basename(avenantF), sha1: sha1(avenantF), chemin: path.resolve(avenantF), copie: FIXTURES_DU_BANC.avenant };
  let surete = null;
  let identite = null;
  let avertissement = null;
  if (sansSurete) {
    if (option('--verrou-surete')) refuser('--sans-surete et --verrou-surete ensemble : un seul chemin (R15 point 3 ou point 4).');
    // C4 point 3 (13/11) : le regard UNIQUE alors qu'un regard de sûreté a été pris n'est pas refusé (c'est la seule issue si
    // l'identité des lignes est rompue au-delà de la tolérance), mais il est DIT, dans la sortie et dans la note.
    if (fs.existsSync(verrouFixeDe('surete'))) avertissement = 'regard de preuve seul alors qu’un regard de sûreté a été pris : identité des lignes non vérifiée';
  } else {
    const vs = fichierDeVerrou('--verrou-surete');
    if (!fs.existsSync(vs)) refuser(`le verrou de sûreté est introuvable (${vs}) : le regard de preuve exige le regard de sûreté (R15 point 3), ou --sans-surete (point 4 : « faits seuls » jusqu’au regard unique).`);
    if (path.resolve(vs) === path.resolve(verrou)) refuser('le regard de preuve a son verrou PROPRE : --verrou ≠ --verrou-surete.');
    const ls = lireJson(vs, 'le verrou de sûreté');
    if (ls?.regard !== 'surete' || !ls?.export?.fichier || !ls?.export?.sha1) refuser('ce n’est pas un verrou du regard de sûreté.');
    if (ls.sceau !== a.sceau) refuser(`le regard de sûreté a été pris sous un autre sceau (${ls.sceau} ≠ ${a.sceau}) : les deux regards se prennent sous le même.`);
    if (ls.export.sha1 === a.exp.sha1) refuser('le regard de preuve exige un SECOND export (celui-ci est l’export du regard de sûreté).');
    if (!fs.existsSync(ls.export.fichier) || sha1(ls.export.fichier) !== ls.export.sha1) refuser(`le premier export a changé ou manque (${ls.export.fichier}) : l’identité des lignes ne se vérifie plus.`);
    // L'IDENTITÉ DES LIGNES des matchs communs (clé, rôle, calcule_le, λ, μ, ρ, fair) — AVANT le verrou, sans aucune issue ;
    // C12 (13/11) : au plus 5 matchs communs ET au plus 0,5 % d'entre eux à la ligne changée sont nommés, comptés et retirés
    // des DEUX côtés ; au-delà, refus.
    const premier = lireExport(a.B, ls.export.fichier, { sansResultat: true });
    tracerLaLecture('premier export (identité des lignes)', premier.matchs);
    const id = a.B.identiteDesLignes(premier.matchs, a.matchs);
    const rompues = id.rompues;
    if (!id.tolere) refuser(`identité des lignes rompue : ${rompues.length} ${rompues.length > 1 ? 'matchs communs ont' : 'match commun a'} une autre ligne d’avant-match dans le second export (${rompues.slice(0, 10).join(', ')}), au-delà de la tolérance (au plus ${id.tolerance.max} matchs et au plus ${String(id.tolerance.part * 100).replace(".", ",")} % des ${id.communs} matchs communs) : rien lu.`);
    identite = { communs: id.communs, rompues: { n: rompues.length, matchs: rompues.slice(0, 200) }, tolerance: id.tolerance, regle: 'C12 : les matchs communs dont la ligne retenue a changé entre les deux exports sont nommés, comptés et retirés des deux côtés, s’ils sont au plus 5 et au plus 0,5 % des matchs communs ; au-delà, refus.' };
    if (rompues.length) dire(`[étape 46] identité des lignes : ${rompues.length} sur ${id.communs} matchs communs à la ligne changée (tolérés, nommés, retirés des deux côtés) : ${rompues.join(', ')}.`);
    surete = { verrou: vs, sha1Verrou: sha1(vs), sortie: ls.sortie ?? null, export: { fichier: ls.export.fichier, sha1: ls.export.sha1, matchs: premier.matchs.length, de: premier.entete.fenetre?.de ?? null, a: premier.entete.fenetre?.au ?? null } };
  }
  const sortie = fichierDeSortie('--sortie');
  const prep = preparerLeVerrou(verrou, a.exp);
  const preuve = {
    chemin: avertissement ?? (sansSurete ? 'regard de preuve seul (R15 point 4 : l’écran est resté aux faits seuls jusqu’ici)' : 'après le regard de sûreté (R15 point 3)'),
    ...(avertissement ? { avertissement } : {}),
    avenant: { fichier: avenant.fichier, sha1: avenant.sha1, copie: avenant.copie },
    export: { sha1: a.exp.sha1, exporteLe: a.entete.exporteLe ?? null, de: a.entete.fenetre?.de ?? null, a: a.entete.fenetre?.au ?? null },
    surete: surete ? { verrou: path.basename(surete.verrou), sha1Verrou: surete.sha1Verrou, export: { sha1: surete.export.sha1, matchs: surete.export.matchs, de: surete.export.de, a: surete.export.a } } : null,
    identite
  };
  if (avertissement) dire(`[étape 46] ATTENTION : ${avertissement} (${verrouFixeDe('surete')} existe).`);
  const passeAvant = attendreLaPasse(a.passe);
  const pose = new Date().toISOString();
  poserLeVerrou(verrou, prep, { pose, pid: process.pid, regard: 'preuve', colonne: a.d.colonne, K: a.K, sceau: a.sceau, regles: a.regles, avenant: { chemin: avenant.chemin, sha1: avenant.sha1 }, export: { ...a.exp, matchs: a.matchs.length }, comptes: a.comptes, surete: preuve.surete, identite, ...(avertissement ? { avertissement } : {}), sortie });
  dire(`[étape 46] verrou de preuve posé (${verrou}) à ${pose} : le regard de preuve commence.`);
  if (sha1(a.exp.fichier) !== a.exp.sha1) refuser('l’export a changé pendant les contrôles : rien lu (le verrou reste posé ; relancer avec --rejouer-apres-correction).');
  const retirees = new Set(identite?.rompues?.n ? identite.rompues.matchs : []);
  const { matchs } = (() => {
    const lu = lireExport(a.B, a.exp.fichier, { sansResultat: false });
    return { matchs: retirees.size ? lu.matchs.filter((m) => !retirees.has(m.matchKey)) : lu.matchs };
  })();
  tracerLaLecture('export (passage)', matchs);
  // Les écarts entre les deux exports, COMPTÉS et NOMMÉS sans refus (R15 point 3) — sous verrou : ils portent des issues.
  let ecarts = null;
  if (surete) {
    const premier = lireExport(a.B, surete.export.fichier, { sansResultat: false }).matchs.filter((m) => !retirees.has(m.matchKey));
    tracerLaLecture('premier export (écarts)', premier);
    const p = new Map(premier.map((m) => [m.matchKey, m]));
    const s = new Set(matchs.map((m) => m.matchKey));
    const fin1 = surete.export.a ?? '';
    const apparus = matchs.filter((m) => !p.has(m.matchKey) && m.date <= fin1).map((m) => m.matchKey);
    const disparus = premier.filter((m) => !s.has(m.matchKey)).map((m) => m.matchKey);
    const changes = matchs.filter((m) => p.has(m.matchKey) && JSON.stringify(p.get(m.matchKey).resultat) !== JSON.stringify(m.resultat)).map((m) => m.matchKey);
    ecarts = {
      feuillesPublieesEnRetard: { n: apparus.length, matchs: apparus.slice(0, 200) },
      feuillesDeMatchManquantes: { n: disparus.length, matchs: disparus.slice(0, 200) },
      resultatsChanges: { n: changes.length, matchs: changes.slice(0, 200) },
      nouveauxDepuisLePremierExport: matchs.filter((m) => !p.has(m.matchKey) && m.date > fin1).length
    };
  }
  finirLePassage(sortie, passer(a, { regard: 'preuve', matchs, pose, verrou, prep, passeAvant, preuve, ecarts }), 'preuve');
}

// ------------------------------------------------------------ --recopier <sortie du passage> [--remplacer]
if (MODE === '--recopier') {
  const { d } = await laDeclaration();
  const { B, sceau } = await leSceau();
  const fichier = option('--recopier');
  if (!fichier || !fs.existsSync(fichier)) refuser('--recopier <sortie> : la sortie d’un passage du banc (--banc ou --preuve) est obligatoire.');
  const json = lireJson(fichier, 'la sortie');
  if (json?.format !== B.VERSION_DU_BANC || !json?.banc || !B.REGARDS.includes(json?.regard)) refuser('ce n’est pas une sortie du banc du direct, ou le passage s’est arrêté à l’étalonnage : aucune note (l’écran reste « pas encore jugé »).');
  if (json.essai && !ESSAI) refuser('une sortie faite avec des réglages d’essai ne se recopie jamais hors d’une copie d’essai.');
  if (json.colonne !== d.colonne) refuser(`la sortie a été faite pour la colonne « ${json.colonne} », le code est fixé sur « ${d.colonne} ».`);
  if (json.scellement?.sha1 !== sceau) refuser(`la sortie n’a pas été faite sous le sceau en vigueur (${json.scellement?.sha1 ?? 'aucun'} ≠ ${sceau}).`);
  // C9 (13/11) : la note du regard de PREUVE est protégée — une sortie du regard de sûreté ne la remplace pas sans
  // --remplacer (avant toute copie : rien n'est écrit).
  if (json.regard === 'surete' && fs.existsSync(FICHIER_NOTE)) {
    let actuelle = null;
    try {
      actuelle = (await importFrais(FICHIER_NOTE)).NOTE_DU_DIRECT ?? null;
    } catch {
      actuelle = null;
    }
    if (actuelle?.regard === 'preuve' && !drapeau('--remplacer')) refuser(`la note en vigueur est celle du regard de PREUVE (verdict « ${actuelle.verdict} », passé le ${actuelle.passeLe ?? '?'}) : une sortie du regard de sûreté ne la remplace pas sans --remplacer (C9).`);
  }
  const regles = json.regles?.fichier;
  if (!regles || !fs.existsSync(regles)) refuser(`les règles du passage sont introuvables (${regles ?? '?'}).`);
  if (sha1(regles) !== json.regles.sha1) refuser(`les règles ont changé depuis le passage (${sha1(regles)} ≠ ${json.regles.sha1}).`);
  const copies = [
    { de: path.resolve(fichier), vers: path.join(SERVEUR, FIXTURES_DU_BANC[json.regard]), sha1: sha1(fichier), unique: false },
    { de: path.resolve(regles), vers: path.join(SERVEUR, FIXTURES_DU_BANC.regles), sha1: json.regles.sha1, unique: true }
  ];
  if (json.regard === 'preuve') {
    const av = json.preuve?.avenant;
    const v = json.verrou?.fichier && fs.existsSync(json.verrou.fichier) ? lireJson(json.verrou.fichier, 'le verrou de preuve') : null;
    const chemin = (v?.rejeux?.at(-1)?.avenant ?? v?.avenant)?.chemin ?? null;
    if (!av?.sha1 || !chemin || !fs.existsSync(chemin) || sha1(chemin) !== av.sha1) refuser('l’avenant du regard de preuve est introuvable ou a changé depuis le passage.');
    copies.push({ de: chemin, vers: path.join(SERVEUR, FIXTURES_DU_BANC.avenant), sha1: av.sha1, unique: false });
  }
  for (const c of copies) {
    if (!fs.existsSync(c.vers) || sha1(c.vers) === c.sha1) continue;
    if (c.unique) refuser(`${path.relative(SERVEUR, c.vers)} existe avec d’autres règles : jamais deux règles pour un banc.`);
    if (!drapeau('--remplacer')) refuser(`${path.relative(SERVEUR, c.vers)} existe déjà avec un autre contenu : --remplacer pour la remplacer (la sortie d’origine reste dans le bac).`);
  }
  for (const c of copies) {
    fs.mkdirSync(path.dirname(c.vers), { recursive: true });
    fs.copyFileSync(c.de, c.vers);
    if (sha1(c.vers) !== c.sha1) refuser(`la copie de ${path.basename(c.de)} dans test/fixtures n’est pas identique à l’octet.`);
  }
  const note = B.aRecopier(json, { sortie: { fichier: FIXTURES_DU_BANC[json.regard], sha1: copies[0].sha1 } });
  fs.writeFileSync(FICHIER_NOTE, B.texteDeLaNote(note));
  const relue = (await importFrais(FICHIER_NOTE)).NOTE_DU_DIRECT;
  if (JSON.stringify(relue) !== JSON.stringify(note) || !Object.isFrozen(relue)) refuser('la relecture de noteDuDirect.js ne redonne pas la note.');
  dire(`[étape 46] note écrite PAR SCRIPT : ${FICHIER_NOTE} (${fs.statSync(FICHIER_NOTE).size} octets) ; regard de ${json.regard === 'surete' ? 'sûreté' : 'preuve'}, verdict « ${note.verdict} », variante ${note.variante}, modèle ${note.modele} version ${note.version} (${note.role}) ; sortie et règles gardées dans test/fixtures. Le serveur la lit à son prochain démarrage.`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'recopier', note: FICHIER_NOTE, sha1Note: sha1(FICHIER_NOTE), regard: note.regard, verdict: note.verdict, fixtures: copies.map((c) => path.relative(SERVEUR, c.vers).split(path.sep).join('/')) })}\n`);
  process.exit(0);
}

// ------------------------------------------------------------ --note-nulle : l'interrupteur (O12 : avant le passage, ou pour éteindre)
if (MODE === '--note-nulle') {
  const B = await import('../src/data/direct/bancDuDirect.js');
  let avant = null;
  if (fs.existsSync(FICHIER_NOTE)) {
    try {
      avant = (await importFrais(FICHIER_NOTE)).NOTE_DU_DIRECT ?? null;
    } catch {
      avant = 'illisible';
    }
  }
  fs.writeFileSync(FICHIER_NOTE, B.texteDeLaNote(null));
  const relue = (await importFrais(FICHIER_NOTE)).NOTE_DU_DIRECT;
  if (relue !== null) refuser('la relecture de noteDuDirect.js ne redonne pas null.');
  const eteinte = avant && typeof avant === 'object' ? { regard: avant.regard ?? null, verdict: avant.verdict ?? null, passeLe: avant.passeLe ?? null, sortie: avant.sortie?.fichier ?? null } : null;
  dire(`[étape 46] note nulle écrite PAR SCRIPT : ${FICHIER_NOTE}${eteinte ? ` — la note du regard de ${eteinte.regard} du ${eteinte.passeLe} est ÉTEINTE (pour la rallumer : --recopier de la sortie d’origine, gardée dans le bac ; sa copie : ${eteinte.sortie})` : ''} ; le serveur la lit à son prochain démarrage (serveur arrêté hors d’une passe, puis relancé).`);
  process.stdout.write(`${JSON.stringify({ ok: true, mode: 'note-nulle', note: FICHIER_NOTE, sha1Note: sha1(FICHIER_NOTE), eteinte })}\n`);
  process.exit(0);
}
