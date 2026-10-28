/**
 * etatDesCorrections.js — CE QUE MONTRENT LES ÉCRANS DE LA BOUCLE DE CORRECTION, EN LECTURE SEULE (étape 26 du plan,
 * partie B, 28/10/2026) : la route GET /api/corrections et le bloc « Corrections à accepter ou refuser » de Santé du
 * moteur (data/santeDuMoteur.js).
 * -----------------------------------------------------------------------
 * Rien n'est calculé ici : des lectures de petites tables (le dernier tri figé, les propositions, le journal, le résumé
 * du mois en mots — partie D), du
 * registre des versions (etatDesVersions, la place de l'essai), du registre de la mesure (les corrections déjà
 * essayées) et de l'état du banc en cours dans ce serveur — quelques millisecondes ; jamais un tri (bug B31). Une
 * table qui ne se lit pas rend « illisible » avec sa raison, JAMAIS « aucune proposition » (bug B30). Les mots sont
 * ceux de Pierre (ni « K », ni « lignée », ni « variante ») ; jamais de vert : un écart n'est pas un gain.
 * -----------------------------------------------------------------------
 */

import { openDb } from '../db/matchStatsDb.js';
import { etatDesVersions } from '../../core/engine/engineVersions.js';
import { lireReglagesDuMoteur } from '../../core/engine/engineConfig.js';
import { compterVariantes } from '../../bench/trialsRegistry.js';
import { readRefreshStatus } from '../repositories/refreshStatusRepository.js';
import { env } from '../../config/env.js';
import { STATUTS, REGARDS_PAR_AN, SEUIL_D_AMPLEUR, MOIS_DE_LA_FENETRE, MOIS_MIN_DE_LA_FENETRE, familleDe, transitionPermise } from './regles.js';
import { lireLeTri, listeDesTris, lireLesPropositions, lireLeJournal, lireLesResumes, essaisDeResume } from './depotCorrections.js';
import { decisionDuResume } from './ficheDuMois.js';
import { etatDuFormulaire, copieProfonde, libelleDuLevier, valeurDite, nombreDit, deMois, RETRAIT_PLUS_TARD } from './propositions.js';
import { etatDeLaPlace } from './miseALEssai.js';
import { bancDeCorrectionEnCours, dernierBancDeCorrection } from './bancDesCorrections.js';

/** Les mots d'un état de proposition et leur ton (jamais le vert). `aDecider` : Pierre a un clic à faire. */
export const ETATS_DITS = Object.freeze({
  proposee: Object.freeze({ dit: 'à mesurer au banc (ou à refuser)', ton: 'attention', aDecider: true }),
  'au-banc': Object.freeze({ dit: 'mesure au banc en cours', ton: 'info', aDecider: false }),
  bancee: Object.freeze({ dit: 'à décider : mettre à l’essai ou refuser', ton: 'attention', aDecider: true }),
  'banc-impossible': Object.freeze({ dit: 'à décider (banc impossible) : mettre à l’essai ou refuser', ton: 'attention', aDecider: true }),
  acceptee: Object.freeze({ dit: 'en file pour l’essai à blanc', ton: 'info', aDecider: false }),
  'a-blanc': Object.freeze({ dit: 'à l’essai à blanc', ton: 'info', aDecider: false }),
  jugee: Object.freeze({ dit: 'jugée', ton: 'info', aDecider: false }),
  adoptee: Object.freeze({ dit: 'adoptée', ton: 'section', aDecider: false }),
  rejetee: Object.freeze({ dit: 'rejetée', ton: null, aDecider: false }),
  refusee: Object.freeze({ dit: 'refusée', ton: null, aDecider: false }),
  perimee: Object.freeze({ dit: 'périmée', ton: null, aDecider: false }),
  interrompue: Object.freeze({ dit: 'interrompue', ton: null, aDecider: false }),
  retiree: Object.freeze({ dit: 'retirée', ton: null, aDecider: false })
});
const SOURCES_DITES = Object.freeze({ regle: 'proposée par le tri', pierre: 'proposée par vous', retrait: 'retrait d’une correction' });
const VERDICTS = Object.freeze({ retenu: 'retenu', 'pas-prouve': 'pas prouvé', 'moins-bon': 'moins bon', 'pas-assez-de-matchs': 'pas assez de matchs' });

const message = (error) => String(error?.message ?? error).slice(0, 240);
const CASES_DITES = '22 cases × 12 mois';

/** Une proposition telle que l'écran la montre : ses mots, ses chiffres, ce que Pierre peut faire. */
function vueDUneProposition(p, { etat, banc }) {
  const d = ETATS_DITS[p.etat] ?? { dit: p.etat, ton: null, aDecider: false };
  const enPlace = etat?.candidate?.id === p.id ? etat.candidate : null;
  const retenue = p.etat === 'jugee' && p.essai?.verdict === 'retenu';
  const auSommet = p.etat === 'adoptee' && etat?.enService?.numero === p.versionAdoptee;
  return {
    id: p.id,
    source: p.source,
    sourceDite: p.source === 'regle' && p.triMois ? `${SOURCES_DITES.regle} ${deMois(p.triMois)}` : SOURCES_DITES[p.source] ?? p.source,
    etat: p.etat,
    etatDit: retenue ? 'retenue : à adopter dans Réglages › Versions du moteur' : p.etat === 'jugee' && p.essai?.verdict ? `jugée : ${VERDICTS[p.essai.verdict] ?? p.essai.verdict}` : d.dit,
    ton: d.ton,
    aDecider: d.aDecider || retenue,
    etatLe: p.etatLe,
    creeLe: p.creeLe,
    levier: p.levier,
    libelle: libelleDuLevier(p.levier),
    avant: p.avant,
    apres: p.apres,
    avantDit: valeurDite(p.levier, p.avant),
    apresDit: valeurDite(p.levier, p.apres),
    marches: (p.marches ?? []).map((m) => ({ id: m, libelle: familleDe(m)?.libelle ?? m })),
    enMots: p.declaration?.enMots ?? null,
    quoi: p.declaration?.quoi ?? null,
    triMois: p.triMois,
    cas: p.cas,
    banc: p.banc ?? null,
    bancEnCours: banc?.enCours?.id === p.id ? banc.enCours : null,
    essai: p.essai ?? null,
    premiersChiffres: enPlace?.premiersChiffres ? { matchs: enPlace.premiersChiffres.matchs ?? 0, joursEcoules: enPlace.premiersChiffres.joursEcoules ?? 0, auPlusTotLe: enPlace.premiersChiffres.auPlusTotLe ?? null, horizon: enPlace.premiersChiffres.horizon ?? null } : null,
    versionAdoptee: p.versionAdoptee,
    rangFile: p.rangFile,
    actions: {
      banc: p.etat === 'proposee',
      accepter: transitionPermise(p.etat, 'acceptee') !== null,
      refuser: transitionPermise(p.etat, 'refusee') !== null,
      retirer: p.etat === 'adoptee'
    },
    retrait:
      p.etat === 'adoptee'
        ? auSommet && etat?.retour?.possible
          ? { possible: true, phrase: 'Pour la retirer tout de suite : Réglages › Versions du moteur › « Revenir à la version précédente ».' }
          : { possible: false, phrase: `La correction n’est plus la dernière version du moteur : ${RETRAIT_PLUS_TARD}.` }
        : null
  };
}

/** Le dernier tri, résumé (la légende de Santé du moteur, l'en-tête de l'onglet). */
function resumeDuDernierTri(t) {
  if (!t) return null;
  const vraisDefauts = (t.cases ?? []).filter((c) => c.statut === 'vrai-defaut').map((c) => ({ cas: c.cas, famille: c.famille, libelle: familleDe(c.famille)?.libelle ?? c.famille, mesure: c.mesure, sensDit: c.sensDit, ecart: c.fenetre?.ecart ?? null, mois: c.fenetre?.mois ?? [], levier: c.levier ?? null }));
  return {
    mois: t.mois,
    version: t.version,
    calculeLe: t.calculeLe,
    lignee: t.lignee ? { versionEnService: t.lignee.versionEnService, versions: t.lignee.versions, partiel: Boolean(t.lignee.couverture?.partiel), depuis: t.lignee.couverture?.depuis ?? null } : null,
    statuts: t.resume?.statuts ?? {},
    lignes: t.resume?.lignes ?? 0,
    matchs: t.resume?.matchs ?? 0,
    enEssai: t.resume?.enEssai ?? null,
    vraisDefauts
  };
}

/**
 * LE RÉSUMÉ DU MOIS EN MOTS (partie D), en lecture seule : le DERNIER mois trié, son résumé rangé (écrit par Claude,
 * ou rangé sans appel) ou ce qui l'attend — la règle de ficheDuMois.decisionDuResume, qui sert aussi à l'étape
 * « resumeCorrection » (son « due » et son « pourquoi »). Une table illisible rend « illisible » avec sa raison, jamais
 * « pas de résumé ». Ne lève jamais.
 */
export function etatDuResume({ database = null, interrupteur = env.autoAiAnalysis.enabled } = {}) {
  let dernierTri = null;
  let resume = null;
  let essais = [];
  try {
    const db = database ?? openDb();
    const t = listeDesTris({ database: db })[0] ?? null;
    if (t) {
      dernierTri = { mois: t.mois, version: t.version, calculeLe: t.calculeLe };
      resume = lireLesResumes({ database: db, mois: t.mois }).find((r) => r.version === t.version) ?? null;
      essais = essaisDeResume(t.mois, { database: db, version: t.version });
    }
  } catch (error) {
    return decisionDuResume({ illisible: message(error), interrupteur });
  }
  return decisionDuResume({ dernierTri, resume, essais, interrupteur });
}

/**
 * L'ÉTAT DES CORRECTIONS (lecture seule). Rend { disponible: true, genereLe, dernierTri, tris, propositions, aDecider,
 * aAccepter (compatibilité de Santé du moteur), place, formulaire, essais, banc, journal, resume (partie D), alerte,
 * regles } — ou
 * { disponible: false, illisible: true, raison } quand une table ne se lit pas (jamais une liste vide à la place).
 */
export function etatDesCorrections({ database = null, maintenant = Date.now(), limiteJournal = 20 } = {}) {
  const genereLe = new Date(maintenant).toISOString();
  let propositions;
  let tris;
  let dernierTri;
  let journal;
  let resume;
  try {
    const db = database ?? openDb();
    propositions = lireLesPropositions({ database: db });
    tris = listeDesTris({ database: db });
    dernierTri = tris.length ? lireLeTri(tris[0].mois, { database: db }) : null;
    journal = lireLeJournal({ database: db, limite: limiteJournal });
    resume = etatDuResume({ database: db });
  } catch (error) {
    return { disponible: false, illisible: true, genereLe, raison: `les tables de la boucle de correction ne se lisent pas : ${message(error)}` };
  }
  let etat = null;
  let versionsProbleme = null;
  try {
    etat = etatDesVersions();
  } catch (error) {
    versionsProbleme = message(error);
  }
  const place = etat ? etatDeLaPlace({ etat, propositions }) : { lisible: false, prise: true, par: null, candidate: null, auPlusTotLe: null, phrase: `Le registre des versions ne se lit pas pour l’instant (${versionsProbleme}) : rien n’est mis à l’essai.` };
  let reglages = null;
  try {
    reglages = copieProfonde(lireReglagesDuMoteur().football);
  } catch {
    reglages = null;
  }
  let essais;
  try {
    const n = compterVariantes('26');
    essais = { n, phrase: n ? `${nombreDit(n)} correction${n >= 2 ? 's' : ''} déjà essayée${n >= 2 ? 's' : ''} : chacune élargit la marge du juge.` : 'Aucune correction essayée pour l’instant.' };
  } catch (error) {
    essais = { n: null, phrase: `Le registre de la mesure ne se lit pas pour l’instant (${message(error)}).` };
  }
  let alerte = null;
  try {
    alerte = readRefreshStatus().alerts?.boucleCorrection ?? null;
  } catch {
    alerte = null;
  }
  const banc = { enCours: bancDeCorrectionEnCours(), dernier: dernierBancDeCorrection() };
  const vues = propositions.map((p) => vueDUneProposition(p, { etat, banc }));
  const aDecider = vues.filter((v) => v.aDecider);
  return {
    disponible: true,
    illisible: false,
    genereLe,
    dernierTri: resumeDuDernierTri(dernierTri),
    tris: tris.map((t) => ({ mois: t.mois, version: t.version, calculeLe: t.calculeLe, statuts: t.resume?.statuts ?? {} })),
    propositions: vues,
    aDecider: aDecider.map((v) => v.id),
    aAccepter: aDecider,
    place,
    formulaire: etatDuFormulaire({ place, reglagesEnService: reglages, propositions }),
    essais,
    banc,
    journal,
    resume,
    alerte,
    regles: {
      regards: REGARDS_PAR_AN,
      regardsDits: `${CASES_DITES} : la marge du hasard en tient compte.`,
      seuilPoints: SEUIL_D_AMPLEUR * 100,
      fenetre: `${MOIS_MIN_DE_LA_FENETRE} à ${MOIS_DE_LA_FENETRE} mois`,
      statuts: Object.fromEntries(Object.entries(STATUTS).map(([k, s]) => [k, { dit: s.dit, ton: s.ton }]))
    },
    retraitPlusTard: RETRAIT_PLUS_TARD
  };
}
