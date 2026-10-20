/**
 * feuilleDeRoute.js — l'état de la page « Feuille de route » (étape 5 du plan).
 * -----------------------------------------------------------------------
 * Assemble, SANS rien calculer de lourd ni rien écrire :
 *   - le plan, écrit dans le code (plan.js) : 9 lots, 49 entrées, réglages,
 *     semaines prévues ;
 *   - l'historique des étapes terminées, écrit dans le code lui aussi
 *     (historique.js) : date de fin, ce qui a changé, ce qui a été mesuré,
 *     et la dernière ligne « Tests : N réussis » ;
 *   - ce qui est propre à Pierre, lu dans data/runtime/roadmap.json
 *     (roadmapRepository.js) : sa note libre sur chaque étape et, plus tard,
 *     « mise de côté » ;
 *   - l'ALERTE DE DÉRIVE du moteur (étape 25, seconde moitié), passée par la
 *     route (data/deriveMoteur.js, lireAlerteDerive : une lecture sans effet de
 *     refresh-status.json) ; absente des essais, qui ne la passent pas ;
 *   - la PREUVE APRÈS LANCEMENT (étape 16) des étapes qui touchent aux
 *     chiffres, lue dans data/runtime/registre-mesure.json
 *     (bench/trialsRegistry.js) : date de lancement, variantes essayées,
 *     dernier jugement. Le nombre de matchs jugés est celui du dernier
 *     jugement : la page n'ouvre jamais la base, elle ne peut pas compter.
 *
 * L'état d'une étape, dans cet ordre : « terminée » si l'historique a une
 * ligne pour elle ; sinon « mise de côté » si Pierre l'a choisi ; sinon « en
 * cours » si elle est dans ETAPES_EN_COURS ; sinon « à faire ».
 *
 * Aucun appel à la base, au réseau ni à Claude : ce fichier ne lit que le code,
 * le petit fichier des notes et le registre de la mesure. La page est donc ouverte tout de suite, comme
 * tous les états préparés (/api/backups, /api/recorders, /api/claude-budget).
 * -----------------------------------------------------------------------
 */

import { fileURLToPath } from 'node:url';
import { DEBUT_PLAN, SEMAINES_PLAN, LOTS, ETAPES, REGLAGES, dateDebutSemaine, dateFinSemaine, semaineDuJour } from './plan.js';
import { HISTORIQUE, ETAPES_EN_COURS, BILANS_DE_LOT } from './historique.js';
import { lireDonneesPierre, FICHIER_FEUILLE_DE_ROUTE, LONGUEUR_NOTE_MAX } from '../repositories/roadmapRepository.js';
import { etatPourFeuilleDeRoute, FICHIER_REGISTRE } from '../../bench/trialsRegistry.js';

export const ETATS = Object.freeze(['a-faire', 'en-cours', 'terminee', 'mise-de-cote']);
export const VERSION_ETAT = 1;

/** Le jour de Paris (AAAA-MM-JJ) d'un instant : c'est lui qui décide de la semaine du plan. */
const jourParis = (instant) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(instant));

const IDS = new Set(ETAPES.map((e) => e.id));

/**
 * L'état complet de la page. Les paramètres ne servent qu'aux essais :
 * `maintenant` (instant, pour la semaine du plan), `historique`, `enCours` et
 * `bilans` (à la place de ceux du code), `pierre` (à la place du fichier lu),
 * `mesure` (à la place du registre de la mesure lu), `derive` (l'alerte de dérive du moteur, ou null :
 * la route la passe, rien ne la lit ici).
 */
export function etatFeuilleDeRoute({
  maintenant = Date.now(),
  historique = HISTORIQUE,
  enCours = ETAPES_EN_COURS,
  bilans = BILANS_DE_LOT,
  pierre = lireDonneesPierre(),
  mesure = etatPourFeuilleDeRoute(),
  derive = null
} = {}) {
  const etapes = ETAPES.map((e) => {
    const lignes = historique.filter((h) => h.etape === e.id);
    const derniere = lignes.at(-1) ?? null;
    const donnees = pierre.etapes[e.id] ?? null;
    let etat = 'a-faire';
    if (lignes.length) etat = 'terminee';
    else if (donnees?.miseDeCote) etat = 'mise-de-cote';
    else if (enCours.includes(e.id)) etat = 'en-cours';
    return {
      id: e.id,
      nom: e.nom,
      lot: e.lot,
      reglage: e.reglage,
      heures: e.heures,
      semaine: { debut: e.semaine, fin: e.semaineFin ?? null, du: dateDebutSemaine(e.semaine), precision: e.precisionSemaine ?? null },
      etat,
      fin: derniere?.fin ?? null,
      heureFin: derniere?.heure ?? null,
      historique: lignes.map((h) => ({ fin: h.fin, heure: h.heure ?? null, titre: h.titre ?? null, change: h.change, mesure: h.mesure ?? null })),
      note: donnees?.note ? { texte: donnees.note, le: donnees.noteLe ?? null } : null,
      miseDeCote: donnees?.miseDeCote ?? null,
      // La preuve après lancement (étape 16) : null pour une étape qui ne touche pas aux chiffres et sans entrée au registre.
      mesure: mesure.etapes?.[e.id] ?? null
    };
  });

  const compte = (liste, etat) => liste.filter((e) => e.etat === etat).length;
  const lots = LOTS.map((lot) => {
    const siennes = etapes.filter((e) => e.lot === lot.numero);
    const terminees = compte(siennes, 'terminee');
    return {
      numero: lot.numero,
      nom: lot.nom,
      objectif: lot.objectif,
      semaines: { debut: Math.min(...siennes.map((e) => e.semaine.debut)), fin: Math.max(...siennes.map((e) => e.semaine.fin ?? e.semaine.debut)) },
      total: siennes.length,
      terminees,
      enCours: compte(siennes, 'en-cours'),
      miseDeCote: compte(siennes, 'mise-de-cote'),
      aFaire: compte(siennes, 'a-faire'),
      termine: siennes.length > 0 && terminees === siennes.length,
      bilan: bilans[lot.numero] ?? null,
      etapes: siennes
    };
  });

  const terminees = compte(etapes, 'terminee');
  const avancement = {
    total: etapes.length,
    terminees,
    enCours: compte(etapes, 'en-cours'),
    miseDeCote: compte(etapes, 'mise-de-cote'),
    aFaire: compte(etapes, 'a-faire'),
    part: etapes.length ? terminees / etapes.length : 0
  };

  // La dernière ligne de l'historique qui dit où en sont les tests.
  const ligneTests = [...historique].reverse().find((h) => h.tests) ?? null;
  const tests = ligneTests ? { ...ligneTests.tests, le: ligneTests.fin, etape: ligneTests.etape } : null;

  const jour = jourParis(maintenant);
  const numero = semaineDuJour(jour);
  const dansLePlan = numero >= 1 && numero <= SEMAINES_PLAN;

  return {
    version: VERSION_ETAT,
    genereLe: new Date(maintenant).toISOString(),
    plan: {
      debut: DEBUT_PLAN,
      semaines: SEMAINES_PLAN,
      semaineCourante: { numero, jour, du: dansLePlan ? dateDebutSemaine(numero) : null, au: dansLePlan ? dateFinSemaine(numero) : null, horsPlan: !dansLePlan }
    },
    reglages: REGLAGES,
    avancement,
    tests,
    lots,
    notes: {
      source: pierre.source,
      fichier: pierre.fichier ?? FICHIER_FEUILLE_DE_ROUTE,
      majLe: pierre.majLe,
      probleme: pierre.probleme,
      nombre: etapes.filter((e) => e.note).length,
      longueurMax: LONGUEUR_NOTE_MAX
    },
    // Des notes rangées sous une étape que le plan ne connaît (plus) : jamais effacées, jamais cachées.
    notesOrphelines: Object.entries(pierre.etapes)
      .filter(([id]) => !IDS.has(id))
      .map(([id, e]) => ({ id, note: e.note, noteLe: e.noteLe, miseDeCote: e.miseDeCote })),
    // L'alerte de dérive du moteur (étape 25) : durable, posée par l'étape « calibrationMensuelle ».
    alerteDerive: derive && typeof derive === 'object' ? derive : null,
    // Le registre du garde-fou de la mesure (étape 16) : illisible, il ne fait pas tomber la page, il le dit.
    mesureRegistre: {
      source: mesure.source,
      fichier: mesure.fichier ?? FICHIER_REGISTRE,
      probleme: mesure.probleme ?? null,
      majLe: mesure.majLe ?? null,
      nombre: mesure.nombre ?? 0
    },
    provenance: {
      plan: fileURLToPath(new URL('./plan.js', import.meta.url)),
      historique: fileURLToPath(new URL('./historique.js', import.meta.url)),
      notes: pierre.fichier ?? FICHIER_FEUILLE_DE_ROUTE,
      registre: mesure.fichier ?? FICHIER_REGISTRE
    }
  };
}
