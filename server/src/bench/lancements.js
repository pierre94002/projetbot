/**
 * lancements.js — ce que le garde-fou de la mesure doit savoir, ÉCRIT DANS LE CODE (étape 16 du plan, 07/10/2026).
 * -----------------------------------------------------------------------
 * Une amélioration des chiffres ne se prouve que sur des matchs joués APRÈS
 * sa mise en service : ceux d'avant ont servi à la construire. Pour le dire,
 * le juge (guard.js, jugerEtape) a besoin de trois choses, rangées ici :
 *   - les étapes dont les chiffres doivent être prouvés (ETAPES_A_JUGER) ;
 *   - les données déjà vues de tous (DONNEES_VUES) : jamais de la preuve neuve ;
 *   - les lancements déclarés par chaque étape (LANCEMENTS) : la version mise
 *     en service, TOUTES les variantes dont on a regardé le résultat pendant
 *     la construction, et les fenêtres de données regardées.
 *
 * Pourquoi dans le CODE, comme plan.js et historique.js : les données
 * d'exécution du bac à sable ne sont JAMAIS recopiées vers l'appli de Pierre.
 * Une variante notée dans data/runtime du bac disparaîtrait à la mise en
 * service, et le juge compterait trop peu de variantes — de fausses preuves.
 * Seule la DATE de lancement vit dans data/runtime (trialsRegistry.js) : c'est
 * celle du premier démarrage de l'appli de Pierre avec ce code, notée au
 * démarrage du serveur sans que personne y pense.
 *
 * À LA FIN D'UNE ÉTAPE QUI TOUCHE AUX CHIFFRES : ajouter son entrée à
 * LANCEMENTS (et, si l'étape n'y est pas, revoir ETAPES_A_JUGER avec Pierre).
 * Un test (registreMesure.test.mjs) passe verifierLancements sur la liste.
 * -----------------------------------------------------------------------
 */

import { normaliserIdEtape } from '../data/roadmap/plan.js';

/**
 * Les étapes dont les chiffres doivent être prouvés sur des matchs joués après leur lancement
 * (proposition de la conception du 07/10/2026 : à confirmer avec Pierre).
 */
export const ETAPES_A_JUGER = Object.freeze(['26', '27', '28', '29', '30', '32', '33', '34', '35', '36', '37', '38', '39', '46', '47']);
// Exclues, et pourquoi : 8 (alignement sur un calcul déjà mesuré, pas un nouveau modèle — dit dans
// l'historique) ; 17, 18, 19, 20, 22, 23 et 24 (elles mesurent, elles ne changent pas les chiffres) ;
// 25 (la porte des versions : chaque adoption est un lancement rangé sous l'étape de la version) ;
// 41 à 45 (l'IA explique, elle n'écrit jamais un chiffre du moteur).

/**
 * Données déjà vues par tout le monde : jamais de la preuve neuve, pour aucune étape (fenêtres inclusives, jours
 * AAAA-MM-JJ). Étape 19 (banc d'essai, 13/10/2026) : trois fenêtres CONTIGUËS au lieu d'une — les constantes
 * du 23/09 ont été APPRISES sur 2024-25 et la règle de pari réglée sur l'historique football-data rattaché au
 * magasin depuis 2023 (rien de rattaché avant le 01/07/2023 pour les 18 divisions à fichier saisonnier : vérifié
 * sur la base du bac, premier rattachement le 28/07/2023). L'`id` de chaque fenêtre dit à l'écran PAR QUOI elle
 * a été vue (le banc compte ses lignes par fenêtre).
 */
export const DONNEES_VUES = Object.freeze([
  Object.freeze({
    id: 'regle-de-value-23-09',
    de: '2023-07-01',
    a: '2024-06-30',
    quoi: 'Historique football-data chargé le 23/09 : choix du livre de référence (paliers — Pinnacle d’abord, sinon palier 2, sinon deux avis du palier 3, valueFinder.js —, qui est aussi la probabilité 1N2 du moteur), seuil de value de 2 % et cote maximale de 5, mesurés sur 20 914 matchs de 18 championnats rattachés au magasin, 07/2023 → 09/2026. Vu par le 1N2 (livre de référence) et par la règle de pari ; FIABILITE, MODELES_SCORE, STAT_KINDS et FACTEUR_TERRAIN n’ont pas vu cette fenêtre.'
  }),
  Object.freeze({
    id: 'apprentissage-23-09',
    de: '2024-07-01',
    a: '2025-06-30',
    quoi: 'Saison 2024-25 : apprentissage de FIABILITE, FREQUENCES_1N2 et POIDS_MODELE_SANS_COTES (resultPrediction.js), de MODELES_SCORE (scorePrediction.js) et de STAT_KINDS (statMarkets.js) ; FACTEUR_TERRAIN et STAT_SAMPLE réglés sur 07/2024 → 09/2026 (statInputsRead.js) ; règle de pari (ci-dessus).'
  }),
  Object.freeze({
    id: 'mesures-du-23-09',
    de: '2025-07-01',
    a: '2026-09-23',
    quoi: 'Saison 2025-26 : 13 052 matchs de vérification des constantes FIABILITE, de la méthode puissance et de la règle de value (resultPrediction.js, marginRemoval.js, valueFinder.js) ; FACTEUR_TERRAIN et STAT_SAMPLE réglés jusqu’ici.'
  })
]);

/**
 * Étape 19 (banc d'essai) : TOUTES les fenêtres déclarées dans le code — DONNEES_VUES et les `vues` de chaque
 * lancement, de toutes les étapes, enregistré au registre ou non —, chacune avec son identifiant (« 27:v1:1 »
 * pour la première vue de la version v1 de l'étape 27). Le banc étiquette ses lignes avec elles : le juge de
 * preuve (jugerEtape) ne voit jamais l'historique, la seule garde est l'étiquette du banc. Pure.
 */
export function fenetresDeclarees({ lancements = LANCEMENTS, donneesVues = DONNEES_VUES } = {}) {
  return [
    ...donneesVues.map((f) => ({ id: f.id, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: null, version: null })),
    ...lancements.flatMap((d) => (d.vues ?? []).map((f, i) => ({ id: `${d.etape}:${d.version}:${i + 1}`, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: d.etape, version: d.version })))
  ];
}

/**
 * Les lancements déclarés par les étapes, dans l'ordre où elles sont faites. À la FIN d'une étape qui
 * touche aux chiffres : ajouter son entrée ici (version en service, ce qu'elle change, TOUTES les
 * variantes dont on a regardé le résultat pendant la construction, les fenêtres de données regardées).
 *   etape      l'identifiant du plan, tel qu'il s'écrit dans plan.js (« 27 ») ;
 *   version    un identifiant court et stable (« score-marche-v1 ») : c'est lui que porteront les
 *              pronostics (étape 25) ;
 *   quoi       une phrase simple ;
 *   le         null = la date sera celle du premier démarrage de l'appli avec ce code ; sinon
 *              AAAA-MM-JJ, seulement pour un lancement qui a eu lieu avant que le registre existe ;
 *   variantes  [{ id, quoi }] — la version retenue en fait partie (verifierLancements l'exige) : est
 *              une variante toute version des chiffres dont on a REGARDÉ le résultat face à des
 *              matchs joués (au banc, à blanc ou dans l'appli), y compris celle qu'on garde ; pas une
 *              correction de bug qui ne change aucun chiffre, ni le même réglage rejoué sur plus de
 *              matchs, ni une variante écrite et jamais évaluée ;
 *   vues       [{ de, a, quoi }] — fenêtres regardées pendant la construction (le banc), en plus de
 *              DONNEES_VUES.
 */
export const LANCEMENTS = Object.freeze([]); // vide à l'étape 16 : la première entrée sera celle de l'étape 27 (ou 26)

/** Une liste de lancements qui ne tient pas debout : le serveur le dit au démarrage, le test refuse. */
export class LancementsInvalides extends Error {}

const FORME_JOUR = /^\d{4}-\d{2}-\d{2}$/;
/** Un jour AAAA-MM-JJ qui existe (« 2026-02-30 » n'existe pas). */
export const jourValide = (j) => typeof j === 'string' && FORME_JOUR.test(j) && new Date(`${j}T12:00:00Z`).toISOString().slice(0, 10) === j;

const objetSimple = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const texte = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Vérifie une liste de lancements : étape connue du plan (écrite comme dans plan.js), version non vide
 * et unique par étape, phrase non vide, `le` null ou jour valide, variantes avec des `id` uniques et la
 * version retenue parmi elles, fenêtres valides avec `de ≤ a`. Rend true ; lève LancementsInvalides
 * avec la première faute trouvée.
 */
export function verifierLancements(liste = LANCEMENTS) {
  if (!Array.isArray(liste)) throw new LancementsInvalides('Les lancements doivent être une liste.');
  const versions = new Set();
  liste.forEach((d, i) => {
    const ou = `Lancement n° ${i + 1}`;
    if (!objetSimple(d)) throw new LancementsInvalides(`${ou} : un objet est attendu.`);
    const etape = normaliserIdEtape(d.etape);
    if (!etape || etape !== d.etape) throw new LancementsInvalides(`${ou} : étape « ${String(d.etape)} » inconnue du plan (plan.js), ou mal écrite.`);
    if (!texte(d.version)) throw new LancementsInvalides(`${ou} (étape ${etape}) : la version est vide.`);
    const cle = `${etape}|${d.version}`;
    if (versions.has(cle)) throw new LancementsInvalides(`${ou} : la version « ${d.version} » est déclarée deux fois pour l’étape ${etape}.`);
    versions.add(cle);
    if (!texte(d.quoi)) throw new LancementsInvalides(`${ou} (${d.version}) : la phrase « quoi » est vide.`);
    if (d.le !== null && d.le !== undefined && !jourValide(d.le)) throw new LancementsInvalides(`${ou} (${d.version}) : « le » doit être null ou un jour AAAA-MM-JJ (${String(d.le)}).`);
    if (!Array.isArray(d.variantes) || d.variantes.length === 0) {
      throw new LancementsInvalides(`${ou} (${d.version}) : au moins une variante est attendue — la version retenue en fait partie.`);
    }
    const ids = new Set();
    for (const v of d.variantes) {
      if (!objetSimple(v) || !texte(v.id)) throw new LancementsInvalides(`${ou} (${d.version}) : une variante sans identifiant.`);
      if (ids.has(v.id)) throw new LancementsInvalides(`${ou} (${d.version}) : la variante « ${v.id} » est déclarée deux fois.`);
      if (v.quoi !== undefined && typeof v.quoi !== 'string') throw new LancementsInvalides(`${ou} (${d.version}) : la phrase de la variante « ${v.id} » n’est pas un texte.`);
      ids.add(v.id);
    }
    if (!ids.has(d.version)) {
      throw new LancementsInvalides(`${ou} : la version retenue « ${d.version} » doit faire partie de ses variantes (elle a été évaluée elle aussi).`);
    }
    if (d.vues !== undefined && !Array.isArray(d.vues)) throw new LancementsInvalides(`${ou} (${d.version}) : « vues » doit être une liste.`);
    for (const f of d.vues ?? []) {
      if (!objetSimple(f) || !jourValide(f.de) || !jourValide(f.a)) throw new LancementsInvalides(`${ou} (${d.version}) : une fenêtre vue sans jours AAAA-MM-JJ valides.`);
      if (f.de > f.a) throw new LancementsInvalides(`${ou} (${d.version}) : une fenêtre vue commence après sa fin (${f.de} > ${f.a}).`);
    }
  });
  return true;
}
