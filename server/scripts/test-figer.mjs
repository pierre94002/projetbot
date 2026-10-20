#!/usr/bin/env node
/**
 * test-figer.mjs — les ~200 pronostics figés de la base d'essai.
 * -----------------------------------------------------------------------
 * Étape 3 du plan CôteMaster. Calcule, avec le code ACTUEL du moteur, le
 * pronostic de chaque match cible de test/fixtures/echantillon.db (marchés,
 * probabilités, cotes justes, score, corners/tirs attendus), dans une copie
 * isolée (data/runtime vide, réseau coupé, heure figée au 05/10/2026 12 h
 * UTC — cf. test/aides/isolement.mjs), et le compare aux pronostics figés
 * de test/fixtures/pronostics-figes.json.
 *
 *   node scripts/test-figer.mjs              compare seulement : n'écrit RIEN
 *   node scripts/test-figer.mjs --refiger    écrit les pronostics d'aujourd'hui
 *
 * Le refigeage est VOLONTAIRE : seulement avec --refiger, jamais pendant un
 * test (le test compare, il n'écrit pas). On refige après avoir vérifié que
 * chaque différence listée est voulue (changement du moteur décidé), ou après
 * avoir refait la base d'essai (test-echantillon.mjs --remplacer).
 *
 * Sortie : le bilan ; code 0 si identique (ou refigé), 1 s'il y a des
 * différences sans --refiger, 2 en cas d'erreur.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import { calculerPronostics, comparer, decrire, lireFiges, contenuFiges, serialiserFiges, resumer, FICHIER_FIGES } from '../test/aides/pronostics.mjs';
import { ECHANTILLON, sha1Fichier } from '../test/aides/isolement.mjs';

const args = process.argv.slice(2);
const inconnues = args.filter((a) => a !== '--refiger');
if (inconnues.length) {
  console.error(`Option inconnue : ${inconnues.join(' ')}. Seule option : --refiger.`);
  process.exit(2);
}
const refiger = args.includes('--refiger');

try {
  const calcul = calculerPronostics();
  if (calcul.reseau) throw new Error('Un appel réseau a été tenté pendant le calcul (bloqué) : à corriger avant de figer.');
  const figes = lireFiges();
  const chiffres = resumer(calcul.resultats);
  console.log(`Calculé en ${(calcul.dureeMs / 1000).toFixed(1)} s : ${chiffres.matchs} matchs, ${chiffres.marches} pronostics de marché (${chiffres.surCotes} résultats sur cotes, ${chiffres.surStatistiques} sur statistiques ; corners/tirs pour ${chiffres.avecStats} matchs).`);

  if (figes) {
    const sha = sha1Fichier(ECHANTILLON);
    if (figes.echantillon?.sha1 !== sha) console.log("La base d'essai a changé depuis le dernier figeage : toutes les différences ci-dessous peuvent en venir.");
    const diffs = comparer(figes.pronostics, calcul.resultats);
    console.log(diffs.length ? decrire(diffs, 60) : `Identique aux pronostics figés le ${figes.figeLe}.`);
    if (!refiger) {
      if (diffs.length) console.log('Rien écrit. Pour refiger (si ces différences sont voulues) : node scripts/test-figer.mjs --refiger');
      process.exit(diffs.length ? 1 : 0);
    }
  } else if (!refiger) {
    console.log(`Aucun pronostic figé (${FICHIER_FIGES}). Pour figer : node scripts/test-figer.mjs --refiger`);
    process.exit(1);
  }

  fs.writeFileSync(FICHIER_FIGES, serialiserFiges(contenuFiges(calcul)));
  console.log(`Figé : ${FICHIER_FIGES} (${chiffres.matchs} matchs, ${chiffres.marches} pronostics de marché).`);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
