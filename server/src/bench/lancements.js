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
    pour: Object.freeze(['tout']),
    quoi: 'Historique football-data chargé le 23/09 : choix du livre de référence (paliers — Pinnacle d’abord, sinon palier 2, sinon deux avis du palier 3, valueFinder.js —, qui est aussi la probabilité 1N2 du moteur), seuil de value de 2 % et cote maximale de 5, mesurés sur 20 914 matchs de 18 championnats rattachés au magasin, 07/2023 → 09/2026. Vu par le 1N2 (livre de référence) et par la règle de pari ; FIABILITE, MODELES_SCORE, STAT_KINDS et FACTEUR_TERRAIN n’ont pas vu cette fenêtre.'
  }),
  Object.freeze({
    id: 'apprentissage-23-09',
    de: '2024-07-01',
    a: '2025-06-30',
    pour: Object.freeze(['tout']),
    quoi: 'Saison 2024-25 : apprentissage de FIABILITE, FREQUENCES_1N2 et POIDS_MODELE_SANS_COTES (resultPrediction.js), de MODELES_SCORE (scorePrediction.js) et de STAT_KINDS (statMarkets.js) ; FACTEUR_TERRAIN et STAT_SAMPLE réglés sur 07/2024 → 09/2026 (statInputsRead.js) ; règle de pari (ci-dessus).'
  }),
  Object.freeze({
    id: 'mesures-du-23-09',
    de: '2025-07-01',
    a: '2026-09-23',
    pour: Object.freeze(['tout']),
    quoi: 'Saison 2025-26 : 13 052 matchs de vérification des constantes FIABILITE, de la méthode puissance et de la règle de value (resultPrediction.js, marginRemoval.js, valueFinder.js) ; FACTEUR_TERRAIN et STAT_SAMPLE réglés jusqu’ici.'
  })
]);

/**
 * LES PORTÉES d'une fenêtre vue (correction du 19/10/2026, après la vérification de l'étape 19) : CE QUE la
 * fenêtre a servi à régler. Une fenêtre n'est « déjà vue » que pour ce qu'elle a réglé :
 *   tout          les réglages du 23/09 (DONNEES_VUES) : vus de toutes les mesures ;
 *   moteur        un chiffre du moteur — ce que mesurent le banc d'essai (19, 25) et le juge de preuve ;
 *   statistiques  la valeur des statistiques (étape 18 : demi-vies, fenêtres, pentes) ;
 *   marche        la connaissance du marché (étape 22 : justesse et vitesse des bookmakers) ;
 *   indice        l'indice de force des équipes (étape 29, jamais lu par le moteur).
 * Une étape qui fait LIRE au moteur une grandeur apprise ailleurs (27 lisant l'indice ou une demi-vie de 18)
 * recopie ces fenêtres dans SON lancement avec `pour: ['moteur']` : c'est son lancement qui dit ce que le
 * moteur a vu. Sans cette règle, une fenêtre regardée pour l'indice étiquetait « déjà vu » les lignes du
 * MOTEUR sur 2019-2023 (la note de départ), alors qu'aucun chiffre du moteur ne les avait vues.
 */
export const PORTEES = Object.freeze(['tout', 'moteur', 'statistiques', 'marche', 'indice']);

/** Une fenêtre vaut-elle pour cette mesure ? `tout` vaut pour toutes. */
export const pourLaPortee = (pour, portee) => Array.isArray(pour) && (pour.includes(portee) || pour.includes('tout'));

/**
 * Les fenêtres « déjà vu » d'une MESURE (étape 19, corrigé le 19/10) : DONNEES_VUES (« tout »), les `vues` des
 * lancements du code dont la portée couvre la mesure (`pour`), et, pour le banc qui rejoue une candidate, les
 * vues de SA déclaration (`declaration` : { etape, version | id, vues }), quelle que soit leur portée — ce que
 * la candidate a regardé pour se construire. Chacune avec son identifiant : « 27:v1:1 » (première vue de la
 * version v1 de l'étape 27), « candidate:c1:1 ». `portee` : 'moteur' (le banc), 'statistiques' (18),
 * 'marche' (22), 'indice' (29). Pure.
 */
export function fenetresDeclarees({ portee = 'moteur', declaration = null, lancements = LANCEMENTS, donneesVues = DONNEES_VUES } = {}) {
  if (!PORTEES.includes(portee) || portee === 'tout') throw new RangeError(`fenetresDeclarees : portée « ${String(portee)} » inconnue (${PORTEES.filter((p) => p !== 'tout').join(', ')}).`);
  const version = declaration ? (declaration.version ?? declaration.id ?? null) : null;
  // Une candidate déjà déclarée dans le code (même étape, même version) n'est pas comptée deux fois.
  const dejaDansLeCode = Boolean(declaration) && lancements.some((d) => d.etape === declaration.etape && d.version === version);
  return [
    ...donneesVues.map((f) => ({ id: f.id, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: null, version: null, pour: ['tout'], candidate: false })),
    ...lancements.flatMap((d) =>
      (d.vues ?? [])
        .map((f, i) => ({ id: `${d.etape}:${d.version}:${i + 1}`, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: d.etape, version: d.version, pour: [...(f.pour ?? [])], candidate: false }))
        .filter((f) => pourLaPortee(f.pour, portee))
    ),
    ...(declaration && !dejaDansLeCode
      ? (declaration.vues ?? []).map((f, i) => ({ id: `candidate:${version ?? '?'}:${i + 1}`, de: f.de, a: f.a, quoi: f.quoi ?? '', etape: declaration.etape ?? null, version, pour: Array.isArray(f.pour) ? [...f.pour] : [portee], candidate: true }))
      : [])
  ];
}

/**
 * Ce que l'étape 18 (valeur des statistiques) a REGARDÉ, pour les étapes qui liront sa demi-vie ou sa fenêtre
 * (29 ; 27 et 30 plus tard) : à recopier dans les `vues` de leur lancement, avec la portée de CE QUE l'étape
 * lectrice règle (29 : 'indice' ; 27 : 'moteur'). Le calcul y a CHOISI ; le jugement y a regardé un résultat.
 * Les jours sont ceux de PERIODES_DU_CALCUL (statValue.js, qui les ré-exporte) : un test vérifie qu'ils restent
 * égaux (ici, pas d'import : statValue.js lit ce fichier).
 */
export const VUES_DE_L_ETAPE_18 = Object.freeze([
  Object.freeze({ de: '2024-07-01', a: '2025-06-30', quoi: 'Étape 18 : demi-vies, fenêtres et pentes choisies sur le magasin (P4a).' }),
  Object.freeze({ de: '2000-07-01', a: '2019-06-30', quoi: 'Étape 18 : demi-vies, fenêtres et pentes choisies sur football-data (P1).' }),
  Object.freeze({ de: '2019-07-01', a: '2023-06-30', quoi: 'Étape 18 : fenêtres et demi-vies jugées sur football-data (P2) — une variante regardée.' })
]);

/** Les fenêtres REGARDÉES par l'étape 29 (en plus de VUES_DE_L_ETAPE_18, dont elle lit les demi-vies). teamStrength.js les ré-exporte. */
export const VUES_DE_L_ETAPE_29 = Object.freeze([
  Object.freeze({ de: '2024-07-01', a: '2025-06-30', quoi: 'Étape 29 : poids de la note et liens « écart → probabilités » appris sur le magasin (P4a).' }),
  Object.freeze({ de: '2023-01-01', a: '2024-06-30', quoi: 'Étape 29 : indice jugé face au classement corrigé xG et au classement réel sur le magasin neuf (P3) — ses variantes comptées.' }),
  Object.freeze({ de: '2025-07-01', a: '2026-10-07', quoi: 'Étape 29 : les mêmes jugements, indicatifs, sur P4b et P5 (déjà vues), jusqu’au dernier jour de la base du bac.' })
]);

/** Les variantes de l'indice de l'étape 29, toutes regardées (la retenue d'abord, choisie avant de regarder). teamStrengthBanc.js les ré-exporte. */
export const VARIANTES_INDICE = Object.freeze([
  Object.freeze({ id: 'indice-v1', quoi: 'Indice de force retenu : correction des adversaires, demi-vies mesurées par l’étape 18, note « tous lieux ».' }),
  Object.freeze({ id: 'indice-dom-ext', quoi: 'La note à domicile du club qui reçoit face à la note à l’extérieur du visiteur.' }),
  Object.freeze({ id: 'sans-correction', quoi: 'Sans la correction des adversaires (itération 0 : le classement brut pondéré dans le temps).' }),
  Object.freeze({ id: 'demi-vie-18', quoi: 'L’idée de départ du plan : une demi-vie de 18 matchs pour toutes les statistiques.' })
]);

/**
 * Les lancements déclarés par les étapes, dans l'ordre où elles sont faites. À la FIN d'une étape qui
 * touche aux chiffres : ajouter son entrée ici (version en service, ce qu'elle change, TOUTES les
 * variantes dont on a regardé le résultat pendant la construction, les fenêtres de données regardées).
 *   etape      l'identifiant du plan, tel qu'il s'écrit dans plan.js (« 27 ») ;
 *   version    un identifiant court et stable (« score-marche-v1 ») : c'est lui que porteront les
 *              pronostics (étape 25) ;
 *   quoi       une phrase simple ;
 *   le         null = la date sera celle du premier démarrage de l'appli avec ce code ; sinon
 *              AAAA-MM-JJ, seulement pour un lancement qui a eu lieu avant que le registre existe, ou
 *              dont la déclaration a été retenue après coup (29 : en service depuis le 14/10) ;
 *   variantes  [{ id, quoi }] — la version retenue en fait partie (verifierLancements l'exige) : est
 *              une variante toute version des chiffres dont on a REGARDÉ le résultat face à des
 *              matchs joués (au banc, à blanc ou dans l'appli), y compris celle qu'on garde ; pas une
 *              correction de bug qui ne change aucun chiffre, ni le même réglage rejoué sur plus de
 *              matchs, ni une variante écrite et jamais évaluée ;
 *   vues       [{ de, a, quoi, pour }] — fenêtres regardées pendant la construction (le banc), en plus de
 *              DONNEES_VUES ; `pour` : les PORTÉES de ce qu'elles ont réglé (au moins une, verifierLancements
 *              l'exige) — 'moteur' pour un chiffre du moteur, sinon 'statistiques', 'marche', 'indice'.
 */
export const LANCEMENTS = Object.freeze([
  // Étape 29 (14/10/2026) : l'indice de force, en service depuis le 14/10 ; il ne règle aucun chiffre du moteur
  // (portée 'indice'). Ses vues : celles de l'étape 18, dont il lit les demi-vies, puis les siennes.
  Object.freeze({
    etape: '29',
    version: 'indice-v1',
    quoi: 'Indice de force des équipes : note et statistiques corrigées de la force des adversaires, pondérées dans le temps (demi-vies de l’étape 18), au total, à domicile et à l’extérieur ; proposé aux modèles, jamais lu par le moteur.',
    le: '2026-10-14',
    variantes: VARIANTES_INDICE,
    vues: Object.freeze([...VUES_DE_L_ETAPE_18, ...VUES_DE_L_ETAPE_29].map((f) => Object.freeze({ ...f, pour: Object.freeze(['indice']) })))
  })
]);

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
      // Correction du 19/10 : chaque fenêtre dit ce qu'elle a réglé — sans portée, on ne sait pas qui l'a « déjà vue ».
      if (!Array.isArray(f.pour) || f.pour.length === 0) throw new LancementsInvalides(`${ou} (${d.version}) : la fenêtre ${f.de} → ${f.a} ne dit pas ce qu’elle a réglé (« pour » : ${PORTEES.join(', ')}).`);
      for (const p of f.pour) if (!PORTEES.includes(p)) throw new LancementsInvalides(`${ou} (${d.version}) : portée « ${String(p)} » inconnue (${PORTEES.join(', ')}).`);
      if (new Set(f.pour).size !== f.pour.length) throw new LancementsInvalides(`${ou} (${d.version}) : une portée est écrite deux fois dans la fenêtre ${f.de} → ${f.a}.`);
    }
  });
  return true;
}
