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
 *   node scripts/test-figer.mjs --complet    étape 27 : le résultat ENTIER de analyzeMatch (empreinte
 *                                            sha1 du JSON normalisé de chaque cible, JSON entier de cinq),
 *                                            figé dans test/fixtures/moteur-complet-figes.json s'il n'y est
 *                                            pas encore, comparé sinon (--complet --refiger : réécrit)
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
import {
  calculerPronostics, comparer, decrire, lireFiges, contenuFiges, serialiserFiges, resumer, FICHIER_FIGES,
  calculerMoteurComplet, lireComplet, contenuComplet, serialiserComplet, ecartsDuComplet, FICHIER_COMPLET
} from '../test/aides/pronostics.mjs';
import { ECHANTILLON, sha1Fichier } from '../test/aides/isolement.mjs';

const args = process.argv.slice(2);
const inconnues = args.filter((a) => a !== '--refiger' && a !== '--complet');
if (inconnues.length) {
  console.error(`Option inconnue : ${inconnues.join(' ')}. Options : --refiger, --complet.`);
  process.exit(2);
}
const refiger = args.includes('--refiger');

// Étape 27 : le résultat ENTIER du moteur (figé la première fois, comparé ensuite ; --refiger pour réécrire).
if (args.includes('--complet')) {
  try {
    const calcul = calculerMoteurComplet();
    if (calcul.reseau) throw new Error('Un appel réseau a été tenté pendant le calcul (bloqué) : à corriger avant de figer.');
    const variantesDifferentes = calcul.complets.filter((c) => new Set(Object.values(c.variantes)).size !== 1);
    console.log(`Calculé en ${(calcul.dureeMs / 1000).toFixed(1)} s : ${calcul.complets.length} cibles (${calcul.complets.filter((c) => c.avecCotes).length} à cotes), ${calcul.complets.filter((c) => c.json).length} gardées en entier ; variantes d'entrée qui changent le résultat : ${variantesDifferentes.length}.`);
    const figes = lireComplet();
    if (figes && !refiger) {
      if (figes.echantillon?.sha1 !== sha1Fichier(ECHANTILLON)) console.log("La base d'essai a changé depuis le figeage : toutes les différences ci-dessous peuvent en venir.");
      const ecarts = ecartsDuComplet(figes, calcul.complets);
      console.log(ecarts.length ? `${ecarts.length} écart(s) :\n${ecarts.slice(0, 40).map((e) => `  - ${e.cle} · ${e.quoi} : ${JSON.stringify(e.avant ?? '')} → ${JSON.stringify(e.apres ?? '')}`).join('\n')}` : `Identique au résultat entier figé le ${figes.figeLe}.`);
      process.exit(ecarts.length || variantesDifferentes.length ? 1 : 0);
    }
    if (variantesDifferentes.length) throw new Error(`Rien figé : des entrées du modèle de buts posées sur le match changent déjà le résultat (${variantesDifferentes.slice(0, 5).map((c) => c.cle).join(', ')}).`);
    fs.writeFileSync(FICHIER_COMPLET, serialiserComplet(contenuComplet(calcul)));
    console.log(`Figé : ${FICHIER_COMPLET} (${calcul.complets.length} cibles).`);
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

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
