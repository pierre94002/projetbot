/**
 * DATE DE FICHIER FIGÉE pour les essais — ce n'est PAS un fichier de test.
 * Préchargée (`NODE_OPTIONS=--import <ce fichier>`) dans le sous-processus d'un
 * script d'essai : chaque fichier écrit par `fs.writeFileSync` reçoit EXACTEMENT
 * la date de modification `CM_TEST_DATE_FICHIER` (une date ISO), quelle que soit
 * l'heure à laquelle il est écrit.
 *
 * Pourquoi : plusieurs dépôts du serveur gardent leur fichier en mémoire et ne le
 * rouvrent que si sa DATE DE MODIFICATION a changé (matchAiAnalysisRepository.js,
 * seasonCalendarRepository.js, matchResultsRepository.js, engineConfig.js…). Sur un
 * disque dont l'horloge est fine (1 ms), deux écritures successives ont presque
 * toujours deux dates ; sur un disque à gros pas — Windows bat toutes les 15,6 ms
 * tant qu'aucune application n'a demandé mieux —, deux écritures rapprochées ont
 * la MÊME date, et le dépôt prend la seconde pour la première : il sert l'ancien
 * contenu. Un test qui réécrit un fichier à la main (sans passer par le dépôt)
 * doit donc faire changer sa date lui-même ; cette aide pousse le cas à
 * l'extrême — un pas infini — pour que le défaut se voie à coup sûr, et non
 * « une fois de temps en temps » (le test du budget Claude « quand le plafond
 * coupe la liste, les favoris passent d'abord » échouait ainsi).
 *
 * Ne touche que le processus qui la charge, et du disque seulement la date du
 * fichier qu'il vient d'écrire.
 */

import fs from 'node:fs';

const date = Date.parse(process.env.CM_TEST_DATE_FICHIER ?? '');
if (!Number.isFinite(date)) throw new Error('CM_TEST_DATE_FICHIER manque ou n’est pas une date ISO : l’aide de date de fichier figée ne sert à rien sans elle.');
const secondes = date / 1000;

const ecrireOrigine = fs.writeFileSync;
fs.writeFileSync = function ecrireAvecDateFigee(fichier, ...reste) {
  const retour = ecrireOrigine.call(this, fichier, ...reste);
  if (typeof fichier === 'string') {
    try {
      fs.utimesSync(fichier, secondes, secondes);
    } catch {
      // Un fichier déjà disparu : sans importance pour un essai.
    }
  }
  return retour;
};
