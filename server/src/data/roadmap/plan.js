/**
 * plan.js — le plan CôteMaster, écrit dans le code (étape 5 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Les 9 lots et les 49 entrées du plan (0, 1 à 5, E, 6 à 47), chacune avec son
 * nom exact, son lot, sa semaine prévue et son réglage. C'est la liste de
 * RÉFÉRENCE de la page « Feuille de route » : les numéros d'étapes ont changé
 * plusieurs fois (8 → 19 → 21 → 25 → 26 → 31 → 37 → 42 → 41 → 42 → 47), seule
 * la liste à 47 (+ 0 et E) du cahier des charges du 05/10/2026 fait foi.
 *
 * Pourquoi dans le CODE et pas dans data/runtime : le code est versionné avec
 * le reste et recopié du bac à sable vers le dépôt (sandbox-apply), alors que
 * les données d'exécution du bac ne sont JAMAIS recopiées — un plan rangé là
 * ne serait jamais arrivé dans l'appli de Pierre. Seules les notes de Pierre
 * sont des données d'exécution (cf. repositories/roadmapRepository.js).
 *
 * Ce fichier ne change que si le PLAN change (étape ajoutée, déplacée,
 * réglage revu) — jamais pour dire qu'une étape est terminée : cela, c'est
 * historique.js.
 *
 * Noms : ceux des titres du cahier des charges, tels quels (parenthèses
 * comprises : « (avant le lot 1) », « (Santé du moteur) »…). 0 et E sont
 * rangées dans le lot 1, parce que leur semaine est la première du calendrier.
 *
 * Réglages (qui construit, avec quel modèle) :
 *   A = Fable 5.1 effort max + ultracode (Fable conçoit et vérifie, Opus écrit)
 *   B = Fable 5.1 effort max pour concevoir et vérifier, Opus écrit (sans ultracode)
 *   O = Opus 5.5 effort max
 *   C = Opus 5.5 effort high
 *   S = Sonnet 5.5
 *
 * Semaines : calendrier en 12 semaines du plan, la semaine 1 commence le lundi
 * 05/10/2026. `semaine` est la semaine de départ ; `semaineFin` n'existe que
 * pour une étape qui court sur plusieurs semaines ; `precisionSemaine` dit
 * ce que le plan précise (jour de lancement, repli, ordre entre deux étapes).
 * -----------------------------------------------------------------------
 */

/** Le lundi de la semaine 1 du calendrier. */
export const DEBUT_PLAN = '2026-10-05';
export const SEMAINES_PLAN = 12;

const JOUR_MS = 86_400_000;
/** Midi UTC : jamais décalé d'un jour par un changement d'heure. */
const midi = (jour) => Date.parse(`${jour}T12:00:00Z`);

/** Le lundi (AAAA-MM-JJ) de la semaine `numero` du plan. */
export const dateDebutSemaine = (numero) => new Date(midi(DEBUT_PLAN) + (numero - 1) * 7 * JOUR_MS).toISOString().slice(0, 10);

/** Le dimanche (AAAA-MM-JJ) de la semaine `numero` du plan. */
export const dateFinSemaine = (numero) => new Date(midi(DEBUT_PLAN) + ((numero - 1) * 7 + 6) * JOUR_MS).toISOString().slice(0, 10);

/**
 * Le numéro de semaine du plan d'un jour AAAA-MM-JJ : 1 pour 05/10 → 11/10,
 * 12 pour 21/12 → 27/12 ; 0 ou moins avant le plan, 13 ou plus après.
 */
export const semaineDuJour = (jour) => Math.floor((midi(jour) - midi(DEBUT_PLAN)) / (7 * JOUR_MS)) + 1;

/** Les réglages : la lettre du plan, et ce qu'elle veut dire. */
export const REGLAGES = Object.freeze([
  Object.freeze({ code: 'A', court: 'Fable 5.1 + ultracode', detail: 'Fable 5.1 effort max + ultracode : Fable conçoit et vérifie, Opus écrit.' }),
  Object.freeze({ code: 'B', court: 'Fable 5.1 effort max', detail: 'Fable 5.1 effort max pour concevoir et vérifier, Opus écrit (sans ultracode).' }),
  Object.freeze({ code: 'O', court: 'Opus 5.5 effort max', detail: 'Opus 5.5 effort max.' }),
  Object.freeze({ code: 'C', court: 'Opus 5.5 effort high', detail: 'Opus 5.5 effort high.' }),
  Object.freeze({ code: 'S', court: 'Sonnet 5.5', detail: 'Sonnet 5.5.' })
]);
export const CODES_REGLAGE = Object.freeze(REGLAGES.map((r) => r.code));

/**
 * Les 9 lots. `objectif` : ce que le lot doit avoir prouvé, en une phrase et en
 * chiffres, tiré des critères « fini quand » des étapes du plan. Le bilan de
 * fin de lot (garder, sauter, réordonner) s'écrit dans historique.js.
 */
export const LOTS = Object.freeze(
  [
    {
      numero: 1,
      nom: 'Sécurité',
      objectif:
        'Rien ne se perd et rien ne casse en silence : une sauvegarde chaque nuit (7 jours, 4 semaines et 12 mois gardés), un bac à sable qui ne touche jamais la vraie base, tous les tests en moins d’une minute, chaque appel à Claude compté.'
    },
    {
      numero: 2,
      nom: 'Design des paris',
      objectif:
        'Un seul chiffre pour un même pari, partout : mêmes valeurs dans Opportunités, Repérage et Chutes de cotes, une cote trop vieille n’affiche plus de value, et la somme des gains réels retombe exactement sur le carnet de paris.'
    },
    {
      numero: 3,
      nom: 'Données',
      objectif:
        'Des données contrôlées et plus longues : ~600 fichiers football-data importés, plus de 95 % des matchs depuis 2023 rattachés à leur rencontre FotMob avec le même score, ~30 contrôles après chaque actualisation, des repères mesurés pour chaque championnat.'
    },
    {
      numero: 4,
      nom: 'Mesure',
      objectif:
        'Une mesure honnête avant de toucher au moteur : un banc d’essai qui rejoue au moins 2 saisons mois par mois et retrouve ~50 % de 1N2 justes par les cotes, un juge qui répond « pas prouvé » dans ~95 % des cas où rien n’a changé, une table du jour J mise à jour en moins d’une minute.'
    },
    {
      numero: 5,
      nom: 'Cœur : les buts',
      objectif:
        'Un modèle de score ancré sur le marché qui fait mieux que l’actuel (perte log et calibration) sur des matchs jamais vus, une simulation qui retrouve les marchés simples à moins d’un point près, et aucune correction du moteur sans banc d’essai, version à blanc et clic de Pierre.'
    },
    {
      numero: 6,
      nom: 'Reste du match et décision',
      objectif:
        'Chaque facteur n’entre dans les chiffres que s’il gagne au banc d’essai (avec son nombre de matchs), la combinaison finale bat le marché seul en perte log et en Brier marché par marché, et la mise juste fait mieux que la mise actuelle sur les mêmes paris simulés, plafonds respectés.'
    },
    {
      numero: 7,
      nom: 'IA',
      objectif:
        'Une IA moins chère et plus utile : au plus ~17 000 tokens par analyse d’avant-match et ~7 000 par revue d’après-match (contre 24 400 et 10 800 mesurés le 04/10), un seul appel pour le bulletin du jour et un seul pour le bilan de la semaine.'
    },
    {
      numero: 8,
      nom: 'Direct',
      objectif:
        'Des probabilités en direct meilleures qu’une simple règle de temps restant (perte log et calibration par tranche de minute, au banc d’essai), sans dépasser 1 requête par minute pour la liste du jour ni 1 toutes les 5 minutes par match.'
    },
    {
      numero: 9,
      nom: 'Recette',
      objectif:
        'Deux semaines sans panne non expliquée, une restauration d’essai réussie, un gain total mesuré au-delà du hasard (ou dit clairement s’il n’y en a pas), le régime de croisière écrit et la première revue mensuelle faite avec Pierre.'
    }
  ].map((l) => Object.freeze(l))
);

/** Une entrée du plan. */
const etape = (id, nom, lot, reglage, heures, semaine, plus = {}) => Object.freeze({ id, nom, lot, reglage, heures, semaine, ...plus });

const LUNDI_APRES_REMISE_A_ZERO = 'Lancée le lundi, juste après la remise à zéro du quota (vers 10 h).';

/**
 * Les 49 entrées, dans l'ordre du plan : 0, 1 à 5, E, 6 à 47. `heures` : la
 * durée de travail prévue par le cahier des charges.
 */
export const ETAPES = Object.freeze([
  // Lot 1 — Sécurité (semaine 1, 05/10)
  etape('0', 'Mise en service de ce qui est déjà construit (avant le lot 1)', 1, 'S', '1-2 h', 1),
  etape('1', 'Sauvegarde, restauration testée, entretien de la base', 1, 'C', '4-6 h', 1),
  etape('2', 'Bac à sable officiel', 1, 'C', '3-4 h', 1),
  etape('3', 'Tests automatiques', 1, 'C', '5-7 h', 1),
  etape('4', 'Budget Claude', 1, 'C', '4-6 h', 1),
  etape('5', 'Feuille de route', 1, 'S', '3-4 h', 1),
  etape('E', 'Enregistreurs (relevés qui ne se rattrapent pas)', 1, 'C', '8-12 h', 1),
  // Lot 2 — Design des paris (semaine 2, 12/10)
  etape('6', 'Langage visuel des paris + guide de lecture', 2, 'S', '3-5 h', 2),
  etape('7', 'Cotes de ses bookmakers : fraîches, archivées, saisies', 2, 'C', '6-8 h', 2),
  etape('8', 'Opportunités du jour + correction de « Meilleures chances »', 2, 'C', '5-7 h', 2, {
    precisionSemaine: 'Après la 7 et avant la 10 : les trois modifient le même écran (Mes paris).'
  }),
  etape('9', 'Page du match pour décider', 2, 'S', '4-6 h', 2),
  etape('10', 'Comparateur de bookmakers + ticket', 2, 'C', '4-6 h', 2),
  etape('11', 'Suivi des paris + garde-fous + comptes bookmakers', 2, 'C', '6-8 h', 2),
  // Lot 3 — Données (semaine 3, 19/10)
  etape('12', 'Contrôles + carnet de santé des données', 3, 'C', '6-9 h', 3),
  etape('13', 'Historique étendu football-data.co.uk + données de référence', 3, 'C', '8-12 h', 3),
  etape('14', 'Contrôle quotidien + santé des sources + plan de secours FotMob', 3, 'C', '6-9 h', 3, {
    precisionSemaine: 'Après la 15 : ses contrôles « hors repères » ont besoin des repères de chaque championnat.'
  }),
  etape('15', 'Repères de chaque championnat', 3, 'C', '6-9 h', 3),
  // Lot 4 — Mesure (de la semaine 3 à la semaine 6)
  etape('16', 'Garde-fou de la mesure', 4, 'B', '4-6 h', 3),
  etape('17', 'Table du jour J', 4, 'A', '10-14 h', 4, { precisionSemaine: LUNDI_APRES_REMISE_A_ZERO }),
  etape('18', 'Valeur de chaque statistique', 4, 'O', '6-9 h', 4),
  etape('19', "Banc d'essai", 4, 'A', '14-20 h', 5, { precisionSemaine: 'Seule ce jour-là : le lundi, juste après la remise à zéro du quota (vers 10 h).' }),
  etape('20', 'Calibration et suivi mensuel', 4, 'C', '5-7 h', 5),
  etape('21', "Carnet de notes de l'IA", 4, 'C', '4-6 h', 6),
  etape('22', 'Connaître le marché + meilleur moment pour parier', 4, 'O', '6-8 h', 5),
  etape('23', 'Où parier : carte championnat × marché', 4, 'C', '4-6 h', 6),
  etape('24', 'Tableau de bord du moteur (Santé du moteur)', 4, 'S', '4-6 h', 6),
  // Lot 5 — Cœur : les buts (de la semaine 4 à la semaine 7)
  etape('25', 'Mise à jour sans risque (versions du moteur)', 5, 'C', '5-7 h', 4, {
    semaineFin: 5,
    precisionSemaine: 'Le socle (numéro de version, version candidate à blanc, retour arrière) en semaine 4 ; l’adoption et l’alerte de dérive en semaine 5, après la 20.'
  }),
  etape('26', 'Boucle de correction', 5, 'O', '5-7 h', 7),
  etape('27', 'Modèle de score ancré sur le marché', 5, 'A', '8-10 h', 6, { precisionSemaine: LUNDI_APRES_REMISE_A_ZERO }),
  etape('28', 'Simulation complète', 5, 'A', '8-10 h', 6, {
    precisionSemaine: 'Semaine 6 si la 27 a pris moins de 35 % du quota Fable de la semaine ; sinon le lundi de la semaine 7.'
  }),
  etape('29', 'Indice de force des équipes', 5, 'O', '4-6 h', 7),
  etape('30', 'Fiches joueurs par poste', 5, 'O', '6-8 h', 7),
  etape('31', "Fiches à l'écran", 5, 'S', '5-7 h', 7),
  // Lot 6 — Reste du match et décision (de la semaine 7 à la semaine 10)
  etape('32', 'Contexte du match', 6, 'O', '3-4 h', 8),
  etape('33', 'Cartons et corners', 6, 'O', '2-3 h', 8),
  etape('34', 'Buteurs et paris sur les joueurs', 6, 'O', '3-4 h', 8),
  etape('35', "Débuts de saison et changements d'effectif", 6, 'C', '2-3 h', 8),
  etape('36', 'Coupes et matchs à part', 6, 'C', '2-3 h', 8),
  etape('37', 'Styles et entraîneurs', 6, 'C', '2-3 h', 7),
  etape('38', 'Combinaison + confiance + seuil de value', 6, 'A', '8-12 h', 9, { precisionSemaine: LUNDI_APRES_REMISE_A_ZERO }),
  etape('39', 'La mise juste', 6, 'B', '2-3 h', 9, {
    precisionSemaine: 'Semaine 9 si la 38 a pris moins de 35 % du quota Fable de la semaine ; sinon semaine 10, avec la 46.'
  }),
  etape('40', "Fiche du pronostic à l'écran", 6, 'S', '2-3 h', 9),
  // Lot 7 — IA (de la semaine 2 à la semaine 8)
  etape('41', 'Analyse IA de chaque match, compacte', 7, 'C', '3-4 h', 2),
  etape('42', 'Bulletin du jour + bilan de la semaine', 7, 'S', '2-3 h', 6),
  etape('43', 'Commentaires des matchs', 7, 'S', '1-2 h', 3),
  etape('44', "Mémoire de l'IA", 7, 'C', '3-4 h', 8),
  etape('45', "L'IA à l'écran", 7, 'S', '3-4 h', 8),
  // Lot 8 — Direct (semaine 10, 07/12)
  etape('46', 'Prédiction en direct', 8, 'B', '6-9 h', 10),
  // Lot 9 — Recette (de la semaine 10 à la semaine 12)
  etape('47', 'Recette générale + régime de croisière', 9, 'B', '8-12 h', 10, {
    semaineFin: 12,
    precisionSemaine:
      'Les contrôles commencent en semaine 10 ; séance de verdict le lundi de la semaine 11 ; fin de recette, régime de croisière et première revue mensuelle en semaine 12.'
  })
]);

export const IDS_ETAPES = Object.freeze(ETAPES.map((e) => e.id));
const parId = new Map(ETAPES.map((e) => [e.id, e]));

/** L'entrée du plan d'un identifiant déjà normalisé, ou undefined. */
export const etapeParId = (id) => parId.get(id);

/**
 * L'identifiant d'une étape tel qu'il s'écrit dans le plan (« 12 », « E »), ou
 * null : espaces retirés, « e » minuscule accepté, mais jamais « 07 » ni « 12.0 »
 * — une étape qui n'est pas dans le plan n'est pas devinée.
 */
export function normaliserIdEtape(brut) {
  if (typeof brut !== 'string' && typeof brut !== 'number') return null;
  const t = String(brut).trim();
  if (/^e$/i.test(t)) return 'E';
  return /^(0|[1-9]\d*)$/.test(t) && parId.has(t) ? t : null;
}
