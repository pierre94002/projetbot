#!/usr/bin/env node
/**
 * sandbox-prepare.mjs — prépare (ou re-prépare) le bac à sable officiel.
 * -----------------------------------------------------------------------
 * Étape 2 du plan CôteMaster ; mode d'emploi : docs/bac-a-sable.md.
 *
 *   node server/scripts/sandbox-prepare.mjs [options]        (depuis le dépôt)
 *     --depuis-sauvegarde       base = la dernière sauvegarde de
 *                               C:\Users\<nom>\CoteMaster\sauvegardes (.db, ou
 *                               sauvegarde de nuit .db.gz décompressée et
 *                               vérifiée), au lieu d'une copie neuve de la vraie base
 *     --garder-base             ne touche pas à la base du bac (code seul)
 *     --abandonner-changements  re-prépare même si le bac contient des
 *                               changements non recopiés : ils sont d'abord
 *                               mis de côté dans changements-abandonnes\
 *     --piste <nom>             bac d'une piste parallèle :
 *                               bac-a-sable\pistes\<nom>
 *   (essais du script lui-même : --bac <dossier> --depot <dossier>
 *    --sans-base --sauvegardes <dossier> --source-base <fichier>)
 *
 * Dans l'ordre :
 *   1. refuse si le bac contient des changements de code non recopiés dans
 *      le dépôt (sandbox-diff les liste, sandbox-apply les recopie) ;
 *   2. refuse si la base du bac est encore ouverte (serveur du bac lancé) ;
 *   3. copie la base dans base\nouvelle\, après avoir vérifié qu'il reste
 *      2 × sa taille + 2 Go : copie neuve par backup-db.mjs (VACUUM INTO en
 *      LECTURE SEULE — la seule méthode autorisée sur la vraie base, prévue
 *      pour tourner pendant que l'appli écrit ; jamais ses -wal/-shm), ou
 *      copie de la dernière sauvegarde ;
 *   4. recopie le code et les données en miroir (ce qui a disparu du dépôt
 *      disparaît du bac), sans secrets ni ancien miroir JSON (cf.
 *      sandbox-commun.mjs) ;
 *   5. pose les jonctions node_modules (cmd /c mklink /J) ;
 *   6. met la nouvelle base en place : l'ancienne copie du bac et son
 *      journal sont supprimés — ceux du bac, jamais ceux de la vraie base ;
 *   7. écrit manifeste.json : sha1 de chaque fichier source, date, base.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import * as c from './sandbox-commun.mjs';
import { decompresserGzip, tailleAnnonceeGzip } from '../src/data/sauvegardes/fichiersSauvegarde.js';

function sortir(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function controlerPlace(dossier, tailleBase) {
  fs.mkdirSync(dossier, { recursive: true });
  const s = fs.statfsSync(dossier);
  const libre = s.bavail * s.bsize;
  const requis = 2 * tailleBase + 2 * 1024 ** 3;
  if (libre < requis) {
    throw new Error(`Place insuffisante sur le disque du bac : ${c.mo(libre)} libres, il faut 2 × ${c.mo(tailleBase)} + 2 Go = ${c.mo(requis)}.`);
  }
  return { libre, requis };
}

/** Vide base\nouvelle\ d'un essai interrompu : fichiers seulement, jamais récursif. */
function viderNouvelle(dossierNouvelle) {
  let entrees = [];
  try {
    entrees = fs.readdirSync(dossierNouvelle, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entrees) if (e.isFile()) c.avecReprise(() => fs.rmSync(path.join(dossierNouvelle, e.name), { force: true }));
}

function copieNeuve({ sourceBase, ch }) {
  if (!fs.existsSync(sourceBase)) throw new Error(`Base introuvable : ${sourceBase}`);
  const taille = fs.statSync(sourceBase).size;
  const place = controlerPlace(ch.dossier, taille);
  const dossierNouvelle = path.join(ch.base, 'nouvelle');
  viderNouvelle(dossierNouvelle);
  console.log(`Copie de la base (${c.mo(taille)}) par backup-db.mjs, en lecture seule — une à deux minutes…`);
  // La source est désignée explicitement : jamais une variable MATCH_STATS_DB
  // qui traînerait dans le terminal (elle pourrait viser la copie du bac).
  const env = { ...process.env, MATCH_STATS_DB: sourceBase };
  delete env.CM_BAC_A_SABLE;
  const debut = Date.now();
  // --copie-seule : une copie .db simple, ni compressée ni en rotation (depuis
  // l'étape 1, la sauvegarde de nuit est compressée).
  const r = spawnSync(process.execPath, [c.SCRIPT_SAUVEGARDE, '--dir', dossierNouvelle, '--copie-seule'], {
    cwd: path.dirname(c.ICI),
    env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  const dureeMs = Date.now() - debut;
  if (r.error) throw r.error;
  const ligne = (r.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).pop() ?? '';
  let bilan;
  try {
    bilan = JSON.parse(ligne);
  } catch {
    throw new Error(`backup-db.mjs n'a pas rendu de bilan lisible (code ${r.status}) : ${(r.stderr || r.stdout || '').slice(0, 800)}`);
  }
  if (!bilan.ok) throw new Error(`backup-db.mjs a refusé la copie : ${bilan.reason}${bilan.freeBytes ? ` (${c.mo(bilan.freeBytes)} libres, ${c.mo(bilan.requiredBytes)} requis)` : ''}`);
  return {
    nouvelle: bilan.file,
    origine: `copie neuve de ${sourceBase} par backup-db.mjs (VACUUM INTO, lecture seule ; quick_check ok)`,
    octets: bilan.bytes,
    rencontres: bilan.matches,
    dureeMs,
    dureeVacuumMs: bilan.durationMs,
    placeLibreAvant: place.libre,
    copieeLe: new Date().toISOString()
  };
}

/**
 * La sauvegarde la plus récente : une copie .db (à la main, ou à l'ancien
 * format auto-AAAA-MM-JJ.db) ou une sauvegarde de nuit compressée
 * (cotemaster-AAAA-MM-JJ.db.gz, depuis l'étape 1).
 */
function derniereSauvegarde(dossier) {
  let entrees;
  try {
    entrees = fs.readdirSync(dossier, { withFileTypes: true });
  } catch {
    throw new Error(`Dossier des sauvegardes introuvable : ${dossier}`);
  }
  return entrees
    .filter((e) => e.isFile() && (/\.db$/i.test(e.name) || /^cotemaster-\d{4}-\d{2}-\d{2}\.db\.gz$/.test(e.name)))
    .map((e) => {
      const abs = path.join(dossier, e.name);
      const st = fs.statSync(abs);
      return { abs, nom: e.name, mtimeMs: st.mtimeMs, octets: st.size, compressee: e.name.endsWith('.gz') };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0] ?? null;
}

/** Le bilan d'une sauvegarde de nuit (cotemaster-AAAA-MM-JJ.json), s'il se lit. */
function bilanDe(s) {
  try {
    return JSON.parse(fs.readFileSync(s.abs.replace(/\.db\.gz$/, '.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function copieDepuisSauvegarde({ dossierSauvegardes, ch }) {
  const s = derniereSauvegarde(dossierSauvegardes);
  if (!s) throw new Error(`Aucune sauvegarde (*.db ou cotemaster-*.db.gz) dans ${dossierSauvegardes}.`);
  if (c.memeChemin(s.abs, c.VRAIE_BASE)) throw new Error(`${s.abs} est la vraie base, pas une sauvegarde.`);
  const bilan = s.compressee ? bilanDe(s) : null;
  // Place comptée sur la base décompressée.
  const octetsBase = s.compressee ? bilan?.base?.octets ?? tailleAnnonceeGzip(s.abs) ?? s.octets * 6 : s.octets;
  const place = controlerPlace(ch.dossier, octetsBase);
  const dossierNouvelle = path.join(ch.base, 'nouvelle');
  viderNouvelle(dossierNouvelle);
  fs.mkdirSync(dossierNouvelle, { recursive: true });
  const cible = path.join(dossierNouvelle, s.nom.replace(/\.gz$/, ''));
  const brouillon = `${cible}.en-cours`;
  console.log(`Copie de la sauvegarde ${s.nom} (${c.mo(s.octets)}${s.compressee ? `, ${c.mo(octetsBase)} une fois décompressée` : ''}, du ${c.dateLocale(s.mtimeMs)})…`);
  const debut = Date.now();
  if (s.compressee) {
    const r = await decompresserGzip(s.abs, brouillon);
    if (bilan?.base?.sha256 && r.sha256 !== bilan.base.sha256) {
      fs.rmSync(brouillon, { force: true });
      throw new Error(`La sauvegarde ${s.nom} ne redonne pas la base octet pour octet (empreinte différente de son bilan).`);
    }
  } else {
    fs.copyFileSync(s.abs, brouillon);
  }
  // Contrôle sur la COPIE, en lecture seule (une sauvegarde VACUUM INTO n'a pas de journal WAL).
  let controle;
  const db = new DatabaseSync(brouillon, { readOnly: true });
  try {
    controle = {
      quickCheck: Object.values(db.prepare('PRAGMA quick_check').get())[0],
      rencontres: db.prepare('SELECT COUNT(*) AS n FROM matches').get().n
    };
  } finally {
    db.close();
  }
  for (const f of [`${brouillon}-wal`, `${brouillon}-shm`]) fs.rmSync(f, { force: true });
  if (controle.quickCheck !== 'ok') {
    fs.rmSync(brouillon, { force: true });
    throw new Error(`La copie de ${s.nom} n'est pas saine : ${controle.quickCheck}`);
  }
  fs.renameSync(brouillon, cible);
  return {
    nouvelle: cible,
    origine: `sauvegarde ${s.abs} (du ${c.dateLocale(s.mtimeMs)})${s.compressee ? ', décompressée' : ''} ; quick_check ok`,
    octets: fs.statSync(cible).size,
    rencontres: controle.rencontres,
    dureeMs: Date.now() - debut,
    placeLibreAvant: place.libre,
    copieeLe: new Date().toISOString()
  };
}

/** Met de côté, avant de les écraser, les changements non recopiés (--abandonner-changements). */
function mettreDeCote(ch, enAttente) {
  const dossier = path.join(ch.abandonnes, c.horodatage());
  for (const x of enAttente) {
    if (x.type === 'supprimé') continue;
    const dest = path.join(dossier, ...x.rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ch.code, ...x.rel.split('/')), dest);
  }
  c.ecrireJson(path.join(dossier, 'liste.json'), enAttente.map(({ rel, type }) => ({ rel, type })));
  return dossier;
}

const memeContenu = (a, b) => fs.statSync(a).size === fs.statSync(b).size && c.sha1(a) === c.sha1(b);

/** Recopie en miroir du code et des données (cf. sandbox-commun.mjs pour ce qui est exclu). */
function miroir(depot, codeBac) {
  const depuis = c.lister(depot);
  const deja = c.lister(codeBac);
  fs.mkdirSync(codeBac, { recursive: true });
  const racineReelle = c.cheminReel(codeBac);
  const surs = new Set();
  const dossierSur = (dossier) => {
    if (surs.has(dossier)) return;
    // Contrôlé AVANT de créer quoi que ce soit : une jonction posée dans le
    // bac ferait écrire ailleurs (dans le dépôt, par exemple).
    if (!c.estDans(c.cheminReel(dossier), racineReelle)) throw new Error(`${dossier} sort du bac (jonction ou lien) : rien n'y est écrit.`);
    fs.mkdirSync(dossier, { recursive: true });
    surs.add(dossier);
  };
  const bilan = { copies: 0, identiques: 0, retires: 0, source: 0, donnees: 0, octetsDonnees: 0 };
  for (const [rel, f] of depuis) {
    const cible = path.join(codeBac, ...rel.split('/'));
    if (deja.has(rel) && memeContenu(f.abs, cible)) {
      bilan.identiques++;
    } else {
      dossierSur(path.dirname(cible));
      c.avecReprise(() => fs.copyFileSync(f.abs, cible));
      bilan.copies++;
    }
    if (f.classe === 'source') bilan.source++;
    else {
      bilan.donnees++;
      bilan.octetsDonnees += fs.statSync(cible).size;
    }
  }
  // Disparu du dépôt : disparaît du bac. Un fichier à la fois, jamais récursif.
  for (const [rel, f] of deja) {
    if (depuis.has(rel)) continue;
    c.avecReprise(() => fs.unlinkSync(f.abs));
    bilan.retires++;
  }
  return bilan;
}

/** Jonctions node_modules du bac vers celles du dépôt (cmd /c mklink /J). */
function poserJonctions(depot, codeBac) {
  const resultat = {};
  for (const partie of c.PARTIES) {
    const nom = `${partie}/node_modules`;
    const lien = path.join(codeBac, partie, 'node_modules');
    const cible = path.join(depot, partie, 'node_modules');
    if (!fs.existsSync(cible)) {
      resultat[nom] = `ABSENT du dépôt (${cible}) : lancer npm install dans le dépôt, jamais dans le bac`;
      continue;
    }
    let st = null;
    try {
      st = fs.lstatSync(lien);
    } catch {
      // pas encore posée
    }
    if (st?.isSymbolicLink()) {
      const vers = fs.readlinkSync(lien);
      if (!c.memeChemin(vers, cible)) throw new Error(`${lien} est une jonction vers ${vers}, pas vers ${cible} : retirez-la (cmd /c rmdir "${lien}") puis relancez.`);
      resultat[nom] = cible;
      continue;
    }
    if (st) {
      resultat[nom] = `vrai dossier laissé tel quel (${lien}) — ne jamais lancer npm install dans le bac`;
      continue;
    }
    const r = spawnSync('cmd', ['/c', 'mklink', '/J', lien, cible], { encoding: 'utf8' });
    let pose = false;
    try {
      pose = fs.lstatSync(lien).isSymbolicLink();
    } catch {
      pose = false;
    }
    if (r.status !== 0 || !pose) throw new Error(`Jonction impossible (${lien} → ${cible}) : ${(r.stderr || r.stdout || r.error?.message || '').trim()}`);
    resultat[nom] = cible;
  }
  return resultat;
}

/** L'état d'actualisation copié peut dire « en cours » (passe de l'appli) : dans le bac, il ne l'est pas. */
function remettreEtatActualisation(codeBac) {
  const fichier = path.join(codeBac, 'server', 'data', 'runtime', 'refresh-status.json');
  try {
    const etat = JSON.parse(fs.readFileSync(fichier, 'utf8'));
    if (!etat.running) return false;
    etat.running = null;
    c.ecrireJson(fichier, etat);
    return true;
  } catch {
    return false;
  }
}

/** Remplace la base du bac par la nouvelle copie ; ne supprime que dans le bac. */
function mettreEnPlace(base, ch) {
  const finale = ch.fichierBase;
  const reelleBac = c.cheminReel(ch.dossier);
  for (const f of [finale, `${finale}-wal`, `${finale}-shm`, `${finale}-journal`]) {
    if (c.memeChemin(c.cheminReel(f), c.VRAIE_BASE) || !c.estDans(c.cheminReel(f), reelleBac)) {
      throw new Error(`Refus : ${f} n'est pas un fichier du bac.`);
    }
  }
  for (const f of [`${finale}-wal`, `${finale}-shm`, `${finale}-journal`, finale]) c.avecReprise(() => fs.rmSync(f, { force: true }));
  c.avecReprise(() => fs.renameSync(base.nouvelle, finale));
  try {
    fs.rmdirSync(path.dirname(base.nouvelle)); // base\nouvelle\, vide
  } catch {
    // pas vide : laissé
  }
  const { nouvelle, ...reste } = base;
  return { fichier: finale, ...reste };
}

async function main() {
  const { valeurs, drapeaux } = c.lireOptions(process.argv.slice(2), {
    avecValeur: ['piste', 'bac', 'depot', 'sauvegardes', 'source-base'],
    drapeaux: ['depuis-sauvegarde', 'garder-base', 'abandonner-changements', 'sans-base']
  });
  const modes = ['depuis-sauvegarde', 'garder-base', 'sans-base'].filter((d) => drapeaux.has(d));
  if (modes.length > 1) throw new Error(`Choisir une seule de ces options : ${modes.map((m) => `--${m}`).join(', ')}.`);
  const modeBase = drapeaux.has('sans-base') ? 'aucune' : drapeaux.has('garder-base') ? 'gardee' : drapeaux.has('depuis-sauvegarde') ? 'sauvegarde' : 'neuve';
  const depot = path.resolve(valeurs.depot ?? c.DEPOT);
  const dossier = c.dossierDuBac({ bac: valeurs.bac, piste: valeurs.piste });
  c.controlerEmplacements({ depot, dossier });
  const ch = c.cheminsDuBac(dossier);
  c.controlerPasDeLien(ch);
  const sourceBase = path.resolve(valeurs['source-base'] ?? c.VRAIE_BASE);
  const dossierSauvegardes = path.resolve(valeurs.sauvegardes ?? c.SAUVEGARDES);
  const debut = Date.now();

  console.log(`Bac à sable : ${dossier}`);
  console.log(`Dépôt       : ${depot}`);

  // 1. Changements non recopiés ?
  const ancien = c.lireManifeste(ch.manifeste);
  const interrompue = fs.existsSync(ch.marqueur);
  let misDeCote = null;
  if (interrompue) {
    console.log('Une préparation précédente a été interrompue : le code du bac est recopié sans comparaison.');
  } else if (fs.existsSync(ch.code)) {
    const { changements } = c.comparer({ depot, codeBac: ch.code, manifeste: ancien });
    const enAttente = changements.filter((x) => !x.dejaIdentique);
    if (enAttente.length && !drapeaux.has('abandonner-changements')) {
      const liste = enAttente.slice(0, 40).map((x) => `  ${x.type.padEnd(9)} ${x.rel}`).join('\n');
      sortir(
        `REFUS : le bac contient ${enAttente.length} changement(s) de code pas encore recopié(s) dans le dépôt :\n${liste}` +
          `${enAttente.length > 40 ? `\n  … et ${enAttente.length - 40} autre(s)` : ''}\n` +
          'Re-préparer les écraserait. Au choix :\n' +
          '  - les recopier : node server/scripts/sandbox-diff.mjs, puis node server/scripts/sandbox-apply.mjs (essai) et --appliquer ;\n' +
          '  - les abandonner : relancer avec --abandonner-changements (ils sont d\'abord mis de côté dans changements-abandonnes\\).\n' +
          'Rien n\'a été touché.'
      );
    }
    if (enAttente.length) {
      misDeCote = mettreDeCote(ch, enAttente);
      console.log(`${enAttente.length} changement(s) non recopié(s) mis de côté dans ${misDeCote}.`);
    }
  }

  // 2. Base du bac libre ?
  if ((modeBase === 'neuve' || modeBase === 'sauvegarde') && c.baseOccupee(ch.fichierBase)) {
    sortir(
      `REFUS : la base du bac (${ch.fichierBase}) est ouverte — un serveur du bac tourne encore. ` +
        'Arrêtez-le (preview_stop sur cotemaster-bac-serveur), puis relancez. Rien n\'a été touché.'
    );
  }

  // 3. Copie de la base, à côté (base\nouvelle\) : rien n'est remplacé si elle échoue.
  let base = null;
  if (modeBase === 'neuve') base = copieNeuve({ sourceBase, ch });
  else if (modeBase === 'sauvegarde') base = await copieDepuisSauvegarde({ dossierSauvegardes, ch });
  else if (modeBase === 'gardee') {
    base = ancien?.base ?? (fs.existsSync(ch.fichierBase) ? { fichier: ch.fichierBase, origine: 'gardée (origine inconnue)' } : null);
    if (!base) console.log(`Attention : --garder-base, mais le bac n'a pas de base (${ch.fichierBase}).`);
  }

  // 4 et 5. Code, données, jonctions — le marqueur signale une recopie interrompue.
  c.ecrireJson(ch.marqueur, { depuis: new Date().toISOString(), pid: process.pid });
  const bilan = miroir(depot, ch.code);
  const jonctions = poserJonctions(depot, ch.code);
  const etatRemis = remettreEtatActualisation(ch.code);

  // 6. Base en place.
  if (base?.nouvelle) base = mettreEnPlace(base, ch);

  // 7. Manifeste.
  const fichiers = {};
  for (const [rel, f] of c.lister(ch.code, { classes: ['source'] })) fichiers[rel] = { sha1: c.sha1(f.abs), octets: fs.statSync(f.abs).size };
  const maintenant = new Date();
  const manifeste = {
    version: 1,
    preparedAt: maintenant.toISOString(),
    preparedAtLocal: c.dateLocale(maintenant),
    depot,
    bac: dossier,
    piste: valeurs.piste ?? null,
    base,
    jonctions,
    donnees: { fichiers: bilan.donnees, octets: bilan.octetsDonnees },
    exclusions: c.EXCLUSIONS,
    changementsMisDeCote: misDeCote,
    recopies: [],
    historique: [...(ancien?.historique ?? []), { preparedAt: maintenant.toISOString(), base: base?.origine ?? null }].slice(-20),
    fichiers
  };
  c.ecrireJson(ch.manifeste, manifeste);
  fs.rmSync(ch.marqueur, { force: true });

  console.log('');
  console.log(`Bac à sable prêt en ${c.duree(Date.now() - debut)} : ${dossier}`);
  if (base) {
    console.log(
      `  Base      : ${base.fichier ?? ch.fichierBase} — ${base.octets ? c.mo(base.octets) : '?'}` +
        `${base.rencontres !== undefined ? `, ${base.rencontres.toLocaleString('fr-FR')} rencontres` : ''}` +
        `${base.dureeMs !== undefined && modeBase !== 'gardee' ? `, copiée en ${c.duree(base.dureeMs)}` : ''}`
    );
    console.log(`              ${base.origine}`);
  } else {
    console.log('  Base      : aucune');
  }
  console.log(`  Code      : ${bilan.source} fichiers source (sha1 au manifeste), ${bilan.donnees} fichiers de données (${c.mo(bilan.octetsDonnees)})`);
  console.log(`              ${bilan.copies} copiés, ${bilan.identiques} déjà identiques, ${bilan.retires} retirés (disparus du dépôt)`);
  for (const [nom, cible] of Object.entries(jonctions)) console.log(`  Jonction  : ${nom} → ${cible}`);
  if (etatRemis) console.log('  État d\'actualisation copié « en cours » remis à zéro dans le bac.');
  console.log(`  Manifeste : ${ch.manifeste}`);
  console.log('Lancer : preview_start cotemaster-bac-serveur puis cotemaster-bac-interface. Notice : docs/bac-a-sable.md');
}

main().catch((error) => sortir(`ÉCHEC : ${error.message}`));
