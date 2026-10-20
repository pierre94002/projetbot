#!/usr/bin/env node
/**
 * sandbox-apply.mjs — recopie dans le dépôt les fichiers source changés dans
 * le bac à sable.
 * -----------------------------------------------------------------------
 * Étape 2 du plan CôteMaster ; mode d'emploi : docs/bac-a-sable.md.
 *
 *   node server/scripts/sandbox-apply.mjs [--essai]      défaut : n'écrit RIEN
 *   node server/scripts/sandbox-apply.mjs --appliquer    écrit dans le dépôt
 *   [--piste <nom>]   (essais du script lui-même : --bac <dossier> --depot <dossier>)
 *
 * Recopie exactement la liste de sandbox-diff : fichiers source modifiés ou
 * ajoutés (copiés), supprimés (retirés du dépôt). JAMAIS server\data (donc
 * jamais data\runtime), jamais un .env ni ai-config.json, jamais
 * node_modules : chaque chemin est re-contrôlé avant d'écrire.
 *
 * Refuse, avec --appliquer :
 *   - tant qu'il reste un CONFLIT (même fichier changé dans le dépôt depuis
 *     la préparation) ;
 *   - après une préparation interrompue ;
 *   - pendant une passe d'actualisation ou un import de l'appli (état « en
 *     cours » ou verrou d'un processus vivant), si des fichiers serveur sont
 *     en jeu.
 * Avant d'écrire, la version du dépôt de chaque fichier touché est gardée
 * dans recopies\<date>\avant\ (retour arrière à la main), avec journal.json.
 * Ensuite le manifeste est mis à jour : ces fichiers ne sont plus des
 * changements, et le bac peut être re-préparé.
 *
 * Le serveur de l'appli ne relit son code qu'au redémarrage
 * (demarrer-cotemaster.bat) ; l'interface, elle, se recharge d'elle-même.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import * as c from './sandbox-commun.mjs';

function passeEnCours(depot) {
  const runtime = path.join(depot, 'server', 'data', 'runtime');
  const raisons = [];
  try {
    const etat = JSON.parse(fs.readFileSync(path.join(runtime, 'refresh-status.json'), 'utf8'));
    if (etat.running && c.processusVivant(etat.running.pid)) {
      raisons.push(`actualisation en cours (pid ${etat.running.pid}, étape ${etat.running.stepLabel ?? etat.running.step ?? '?'})`);
    }
  } catch {
    // pas d'état lisible : rien à signaler
  }
  try {
    const verrou = JSON.parse(fs.readFileSync(path.join(runtime, 'espn-refresh.lock'), 'utf8'));
    if (c.processusVivant(verrou.pid)) raisons.push(`verrou d'import tenu par le pid ${verrou.pid}`);
  } catch {
    // pas de verrou
  }
  return raisons;
}

function main() {
  const { valeurs, drapeaux } = c.lireOptions(process.argv.slice(2), { avecValeur: ['piste', 'bac', 'depot'], drapeaux: ['essai', 'appliquer'] });
  if (drapeaux.has('essai') && drapeaux.has('appliquer')) throw new Error('--essai et --appliquer ne vont pas ensemble.');
  const appliquer = drapeaux.has('appliquer');
  const depot = path.resolve(valeurs.depot ?? c.DEPOT);
  const dossier = c.dossierDuBac({ bac: valeurs.bac, piste: valeurs.piste });
  c.controlerEmplacements({ depot, dossier });
  const ch = c.cheminsDuBac(dossier);
  const manifeste = c.lireManifeste(ch.manifeste);
  if (!manifeste || !fs.existsSync(ch.code)) {
    console.error(`Pas de bac préparé dans ${dossier} (manifeste.json ou code\\ absent).`);
    process.exit(2);
  }
  const interrompue = fs.existsSync(ch.marqueur);
  const { changements } = c.comparer({ depot, codeBac: ch.code, manifeste });

  // Chaque chemin re-contrôlé : seulement des sources, jamais server/data, .env, ai-config.json, node_modules.
  for (const x of changements) {
    if (c.classer(x.rel) !== 'source') throw new Error(`Chemin refusé (pas un fichier source) : ${x.rel}`);
    const dest = path.join(depot, ...x.rel.split('/'));
    if (!c.estDans(dest, depot)) throw new Error(`Chemin refusé (hors du dépôt) : ${x.rel}`);
  }
  const aRecopier = changements.filter((x) => !x.dejaIdentique && x.type !== 'supprimé');
  const aRetirer = changements.filter((x) => !x.dejaIdentique && x.type === 'supprimé');
  const identiques = changements.filter((x) => x.dejaIdentique);
  const conflits = changements.filter((x) => x.conflit);

  console.log(`Bac à sable : ${dossier} — préparé le ${manifeste.preparedAtLocal ?? c.dateLocale(manifeste.preparedAt)}`);
  console.log(`Dépôt       : ${depot}`);
  console.log(`${appliquer ? 'Recopie' : 'ESSAI (rien n\'est écrit)'} : ${aRecopier.length} à copier, ${aRetirer.length} à retirer du dépôt, ${identiques.length} déjà identique(s), ${conflits.length} conflit(s)`);
  for (const x of aRecopier) console.log(`  ${appliquer ? 'copie  ' : 'copierait'} ${x.type.padEnd(8)} ${x.rel}${x.conflit ? '   <-- CONFLIT' : ''}`);
  for (const x of aRetirer) console.log(`  ${appliquer ? 'retire ' : 'retirerait'} ${x.rel}${x.conflit ? '   <-- CONFLIT' : ''}`);

  if (!appliquer) {
    if (conflits.length) console.log('Avec ces conflits, --appliquer refuserait : réglez-les d\'abord (cf. sandbox-diff).');
    if (interrompue) console.log('La dernière préparation a été interrompue : --appliquer refuserait. Relancez sandbox-prepare.');
    console.log('Mode essai : rien n\'a été écrit. Pour recopier : node server/scripts/sandbox-apply.mjs --appliquer');
    return;
  }
  if (interrompue) throw new Error('La dernière préparation du bac a été interrompue : relancez sandbox-prepare avant de recopier.');
  if (conflits.length) {
    throw new Error(`${conflits.length} conflit(s) : le dépôt a changé ces fichiers depuis la préparation. Rien n'a été écrit ; réglez-les d'abord (cf. sandbox-diff).`);
  }
  if (!changements.length) {
    console.log('Rien à recopier.');
    return;
  }
  if ([...aRecopier, ...aRetirer].some((x) => x.rel.startsWith('server/'))) {
    const raisons = passeEnCours(depot);
    if (raisons.length) throw new Error(`L'appli travaille (${raisons.join(' ; ')}) : attendez la fin de la passe avant de toucher au code serveur. Rien n'a été écrit.`);
  }

  const maintenant = new Date();
  const dossierJournal = path.join(ch.recopies, c.horodatage(maintenant));
  const journal = { at: maintenant.toISOString(), depot, bac: dossier, operations: [] };
  const fichierJournal = path.join(dossierJournal, 'journal.json');
  c.ecrireJson(fichierJournal, journal);
  for (const x of [...aRecopier, ...aRetirer]) {
    const morceaux = x.rel.split('/');
    const dest = path.join(depot, ...morceaux);
    const src = path.join(ch.code, ...morceaux);
    // La version du dépôt d'abord, pour pouvoir revenir en arrière.
    if (fs.existsSync(dest)) {
      const avant = path.join(dossierJournal, 'avant', ...morceaux);
      fs.mkdirSync(path.dirname(avant), { recursive: true });
      c.avecReprise(() => fs.copyFileSync(dest, avant));
    }
    if (x.type === 'supprimé') {
      if (fs.existsSync(dest)) c.avecReprise(() => fs.unlinkSync(dest));
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      c.avecReprise(() => fs.copyFileSync(src, dest));
      if (c.sha1(dest) !== x.sha1Bac) throw new Error(`${x.rel} a changé dans le bac pendant la recopie : relancez sandbox-diff puis sandbox-apply. Journal : ${fichierJournal}`);
    }
    journal.operations.push({ rel: x.rel, type: x.type, sha1Avant: x.sha1Depot, sha1Apres: x.sha1Bac });
    c.ecrireJson(fichierJournal, journal);
  }

  // Le manifeste suit : bac et dépôt sont d'accord sur ces fichiers.
  for (const x of changements) {
    if (x.type === 'supprimé') delete manifeste.fichiers[x.rel];
    else manifeste.fichiers[x.rel] = { sha1: x.sha1Bac, octets: fs.statSync(path.join(ch.code, ...x.rel.split('/'))).size };
  }
  manifeste.fichiers = Object.fromEntries(Object.entries(manifeste.fichiers).sort(([a], [b]) => (a < b ? -1 : 1)));
  manifeste.recopies = [...(manifeste.recopies ?? []), { at: journal.at, journal: dossierJournal, copies: aRecopier.length, retires: aRetirer.length, dejaIdentiques: identiques.length }];
  c.ecrireJson(ch.manifeste, manifeste);

  console.log(`Recopie faite : ${aRecopier.length} copié(s), ${aRetirer.length} retiré(s). Versions précédentes du dépôt : ${path.join(dossierJournal, 'avant')}`);
  if ([...aRecopier, ...aRetirer].some((x) => x.rel.startsWith('server/'))) {
    console.log('Code serveur changé : il ne prend effet qu\'au prochain redémarrage de l\'appli (demarrer-cotemaster.bat), à faire hors d\'une passe d\'actualisation.');
  }
}

try {
  main();
} catch (error) {
  console.error(`ÉCHEC : ${error.message}`);
  process.exit(1);
}
