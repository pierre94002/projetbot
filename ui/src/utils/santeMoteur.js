/**
 * santeMoteur.js — les règles d'écran de « Santé du moteur » (étape 24 du plan, 14/10/2026). JavaScript pur,
 * sans Vue ni navigateur : les tests du serveur le rejouent (server/test/santeMoteurEcran.test.mjs) sur les
 * vraies réponses de GET /api/engine-health.
 *
 * Rien n'est calculé ici : le serveur a lu des résumés déjà écrits par les autres étapes (src/data/santeDuMoteur.js).
 * L'écran dit les mêmes mots que la vraie place de chaque information — il réutilise les règles de
 * utils/calibration.js (verdicts, écarts), utils/preuve.js (verdicts du banc), utils/controleQuotidien.js (feu
 * des données) — et ne redessine rien : la courbe annoncé / réalisé est CalibrationChart.
 *
 * Les couleurs : le feu a son vert, son orange et son rouge (« données vérifiées », « sauvegardes en ordre » : le
 * contexte des données, jamais une value de pari) ; un verdict garde le ton de sa vraie place (pas de vert pour
 * un écart de calibration ; le vert du banc d'essai n'est que « retenu »).
 */

import { FEUX, STATUTS, nombre, pluriel, quand } from './controleQuotidien.js';
import { libelleVerdict } from './preuve.js';
import { perteDite } from './banc.js';
import { moisDit, ecartDit, jugeDit, jugeDeClotureDit, VERDICTS } from './calibration.js';
import { pourcentSigne } from './langageParis.js';

/** L'icône et le nom de la page. */
export const PAGE = Object.freeze({ titre: 'Santé du moteur', icone: 'activity', section: 'history' });

/** Les mots de chaque feu (les données reprennent ceux du contrôle quotidien, déjà affichés en haut de l'appli). */
export const MOTS_DES_FEUX = Object.freeze({
  donnees: Object.freeze({ vert: FEUX.vert.libelle, orange: FEUX.orange.libelle, rouge: FEUX.rouge.libelle }),
  sauvegardes: Object.freeze({ vert: 'Sauvegardes en ordre', orange: 'Sauvegardes : à regarder', rouge: 'Sauvegardes : en défaut' }),
  budget: Object.freeze({ vert: 'Budget en ordre', orange: 'Budget : à surveiller', rouge: 'Budget dépassé' })
});

const TON_DU_FEU = Object.freeze({ vert: 'is-accent', orange: 'is-warning', rouge: 'is-danger' });
const ICONE_DU_FEU = Object.freeze({ vert: 'check', orange: 'alert', rouge: 'alert' });

/**
 * La pastille d'état d'un bloc : { texte, ton, icone }. Un bloc qui manque se dit « pas encore mesuré » (jamais
 * un tiret) ; un bloc illisible, « illisible » ; un feu, ses mots ; un bloc sans feu, « mesuré » ou « à regarder ».
 */
export function pastilleDuBloc(bloc) {
  if (!bloc) return { texte: 'pas encore lu', ton: '', icone: 'clock' };
  if (bloc.etat === 'chargement') return { texte: 'lecture en cours', ton: '', icone: 'clock' };
  if (bloc.etat === 'pas-mesure') return { texte: 'pas encore mesuré', ton: '', icone: 'clock' };
  if (bloc.etat === 'indisponible') return { texte: 'illisible', ton: 'is-warning', icone: 'alert' };
  if (bloc.feu && TON_DU_FEU[bloc.feu]) return { texte: MOTS_DES_FEUX[bloc.cle]?.[bloc.feu] ?? bloc.feu, ton: TON_DU_FEU[bloc.feu], icone: ICONE_DU_FEU[bloc.feu] };
  if (bloc.etat === 'attention') return { texte: 'à regarder', ton: 'is-warning', icone: 'alert' };
  return { texte: 'mesuré', ton: '', icone: 'check' };
}

/** Le lien d'un bloc vers sa vraie place : { to: { path, query }, libelle } ; null pour un bloc sans place (jamais un lien mort). */
export function lienDuBloc(bloc) {
  const l = bloc?.lien;
  if (!l?.chemin) return null;
  return { to: l.query ? { path: l.chemin, query: l.query } : { path: l.chemin }, libelle: l.libelle };
}

/** L'heure d'un bloc pour la pastille de provenance : un jour seul (« 2026-10-13 ») ne reçoit pas d'heure inventée. */
export function mesureDuBloc(bloc) {
  const m = bloc?.mesureLe ?? null;
  if (typeof m === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m)) return { instant: m, jourSeul: `${m.slice(8, 10)}/${m.slice(5, 7)}/${m.slice(0, 4)}` };
  return { instant: m, jourSeul: null };
}

/** Le bandeau : l'heure de la lecture et sa durée. */
export function bandeauDeLaPage(reponse) {
  if (!reponse) return { lecture: 'Lecture en cours…', duree: null };
  return { lecture: `Page lue le ${quand(reponse.genereLe)}`, duree: Number.isFinite(reponse.dureeMs) ? `${Math.round(reponse.dureeMs)} ms` : null };
}

// ------------------------------------------------------------ la note face au marché

/** Les deux marchés notés FACE AU MARCHÉ (1N2, plus/moins 2,5) : la perte du moteur et du marché, l'écart, le verdict du banc (vert seulement « retenu »). */
export function dualsFaceAuMarche(note) {
  return (note?.faceAuMarche ?? []).map((d) => ({
    cle: d.cle,
    libelle: d.libelle,
    matchs: nombre(d.matchs),
    moteur: perteDite(d.moteur),
    marche: perteDite(d.marche),
    ecart: Number.isFinite(d.gainPourcent) ? pourcentSigne(d.gainPourcent, 2) : 'pas mesuré',
    verdict: libelleVerdict(d.verdict)
  }));
}

/** Face au championnat seul : { retenu, pasProuve, moinsBon } en mots. */
export function faceAuRepereDit(note) {
  const c = note?.faceAuRepere;
  if (!c || !c.total) return null;
  return `${pluriel(c.retenu, 'marché mieux', 'marchés mieux')}, ${pluriel(c.pasProuve, 'pas prouvé', 'pas prouvés')}, ${pluriel(c.moinsBon, 'moins bien', 'moins bien')} (sur ${nombre(c.total)})`;
}

/** Le dernier rejeu du banc sur cette appli, en une phrase — ou ce qu'il faut faire pour en avoir un. */
export function dernierRejeuDit(note) {
  const r = note?.dernierRejeu;
  if (!r) return 'Aucun rejeu du banc n’a tourné sur cette appli pour l’instant (il se lance depuis Historique moteur › Banc d’essai, 10 à 13 minutes).';
  const minutes = Number.isFinite(r.dureeMs) ? `, ${Math.max(1, Math.round(r.dureeMs / 60000))} min` : '';
  return `Dernier rejeu du banc sur cette appli : n° ${r.id}, fini le ${quand(r.finiLe)}${minutes}.`;
}

// ------------------------------------------------------------ l'évolution mois par mois

/** Les mois figés, du plus ancien au plus récent : une pastille chacun (mois, écart annoncé / réalisé, verdict de la calibration — jamais vert). */
export function evolutionDite(evolution) {
  return (evolution ?? []).map((m) => {
    const v = VERDICTS[m.verdict] ?? null;
    return {
      cle: m.mois,
      mois: moisDit(m.mois),
      ecart: Number.isFinite(m.ecart) ? ecartDit(m.ecart) : 'pas mesuré',
      juge: v ? v.texte : 'pas jugé',
      ton: v?.ton ?? '',
      titre: `${moisDit(m.mois)} : ${nombre(m.pronostics)} pronostics réglés sur ${nombre(m.matchs)} matchs — ${v ? v.phrase : 'pas de verdict'}`
    };
  });
}

/** La phrase quand aucun mois n'est encore figé : dit quand viendra le premier. */
export function evolutionVideDite(prochainGel) {
  const jour = typeof prochainGel?.le === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prochainGel.le) ? `${prochainGel.le.slice(8, 10)}/${prochainGel.le.slice(5, 7)}/${prochainGel.le.slice(0, 4)}` : null;
  return jour ? `Pas encore mesuré : le premier mois figé arrive le ${jour} à partir de ${prochainGel.heure ?? 6} h.` : 'Pas encore mesuré : aucun mois n’est figé pour l’instant.';
}

// ------------------------------------------------------------ la calibration et la clôture

/** Les trois chiffres de la calibration (annoncé, réalisé, écart) et le verdict du juge — les mêmes mots que le bloc d'Historique moteur. */
export function chiffresDeLaCalibration(bloc) {
  const g = bloc?.global;
  if (!g || !g.pronostics) return null;
  const fr1 = (x) => (Number.isFinite(x) ? `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %` : 'pas mesuré');
  return { annonce: fr1(g.annonce), realise: fr1(g.realise), ecart: ecartDit(g.ecart), juge: jugeDit(g.juge), pronostics: nombre(g.pronostics), matchs: nombre(g.matchs) };
}

/** Le verdict sur une valeur de clôture moyenne (jamais vert ; rouge seulement s'il est prouvé négatif). */
export const jugeDeCloture = (c) => jugeDeClotureDit(c?.juge);

// ------------------------------------------------------------ à vérifier

/** Les contrôles en échec, du plus grave au moins grave, avec leur statut en mots et en ton. */
export function lignesAVerifier(bloc) {
  return (bloc?.enEchec ?? []).map((c) => ({
    cle: c.cle,
    libelle: c.libelle,
    statut: STATUTS[c.statut]?.libelle ?? c.statut,
    ton: c.statut === 'rouge' ? 'is-danger' : c.statut === 'orange' || c.statut === 'erreur' ? 'is-warning' : '',
    constat: c.constat
  }));
}

/** « et N autres » quand la liste est tronquée. */
export function resteAVerifierDit(bloc) {
  const reste = (bloc?.enEchecTotal ?? 0) - (bloc?.enEchec?.length ?? 0);
  return reste > 0 ? `… et ${pluriel(reste, 'autre contrôle', 'autres contrôles')} dans Réglages.` : null;
}

// ------------------------------------------------------------ la structure qui reste quand le serveur ne répond pas

/** Où se trouve chaque information en grand (le même tableau que le serveur : LIENS de src/data/santeDuMoteur.js, comparé par un test). */
export const PLACES = Object.freeze({
  donnees: Object.freeze({ chemin: '/reglages', query: Object.freeze({ carte: 'controle-quotidien' }), libelle: 'Réglages › Contrôle quotidien des données' }),
  sauvegardes: Object.freeze({ chemin: '/reglages', query: null, libelle: 'Réglages › Sauvegardes' }),
  budget: Object.freeze({ chemin: '/reglages', query: null, libelle: 'Réglages › Budget Claude' }),
  note: Object.freeze({ chemin: '/historique-moteur', query: Object.freeze({ onglet: 'banc' }), libelle: 'Historique moteur › Banc d’essai' }),
  calibration: Object.freeze({ chemin: '/historique-moteur', query: null, libelle: 'Historique moteur › Calibration du mois' }),
  cloture: Object.freeze({ chemin: '/historique-moteur', query: null, libelle: 'Historique moteur › Calibration du mois (valeur de clôture)' }),
  aVerifier: Object.freeze({ chemin: '/reglages', query: Object.freeze({ carte: 'controle-quotidien' }), libelle: 'Réglages › Contrôle quotidien des données' }),
  versions: Object.freeze({ chemin: '/reglages', query: null, libelle: 'Réglages › Versions du moteur' }),
  corrections: Object.freeze({ chemin: '/feuille-de-route', query: null, libelle: 'Feuille de route › étape 26 (boucle de correction)' })
});

const TITRES = Object.freeze({
  donnees: 'Données',
  sauvegardes: 'Sauvegardes',
  budget: 'Budget Claude',
  note: 'Note du moteur face au marché',
  calibration: 'Annoncé face à réalisé',
  cloture: 'Valeur de clôture',
  aVerifier: 'À vérifier',
  versions: 'Versions du moteur',
  corrections: 'Corrections à accepter ou refuser'
});

/**
 * Les neuf cadres de la page quand le serveur n'a pas (encore) répondu : la structure ne bouge pas (ui/DESIGN.md).
 * `chargement` : « lecture en cours » ; sinon « illisible », avec `raison`.
 */
export function structureParDefaut({ chargement = false, raison = null } = {}) {
  const bloc = (cle) => ({
    cle,
    titre: TITRES[cle],
    etat: chargement ? 'chargement' : 'indisponible',
    feu: null,
    valeur: chargement ? 'lecture en cours…' : 'illisible pour l’instant',
    legende: null,
    phrase: chargement ? 'Les résumés se lisent…' : `Le serveur ne répond pas${raison ? ` (${raison})` : ''} : rien n’est lu pour l’instant. Le reste de l’appli n’est pas touché.`,
    source: { libelle: 'pas lu', fichier: null },
    mesureLe: null,
    action: 'lu',
    lien: PLACES[cle]
  });
  return { feux: ['donnees', 'sauvegardes', 'budget'].map(bloc), blocs: Object.fromEntries(['note', 'calibration', 'cloture', 'aVerifier', 'versions', 'corrections'].map((cle) => [cle, bloc(cle)])) };
}
