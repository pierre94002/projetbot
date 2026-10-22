/**
 * bancAvantApres.js — les mots du bloc « Banc d'essai sur des matchs jamais vus (2019-2023) : avant / après » d'une
 * étape de la feuille de route (étape 27 du plan, 21/10/2026 ; RoadmapStep). Pur : rejoué par
 * server/test/modeleDeButsEcran.test.mjs.
 *
 * Le serveur a tout décidé et tout lu DANS LE CODE (server/src/data/roadmap/bancEtape27.js : la note de départ et la
 * note du modèle de buts, jamais la base) ; ici, on met en forme — virgule décimale, vrai signe moins, verdict en
 * mots — et on dit ce qui manque (« pas encore mesuré », jamais un tiret). La structure est complète même avant la
 * mesure : chaque ligne du tableau est là.
 */

import { libelleVerdict, nombreSigne } from './preuve.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const PAS_MESURE = 'pas encore mesuré';
const nombreFr = (n) => Number(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ');

/** L'erreur de prévision d'une version (perte log, 4 décimales : plus petite = mieux), ou « pas encore mesuré ». */
const perteDite = (x) => (x && fini(x.perteLog) ? x.perteLog.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : PAS_MESURE);

/** Un écart en points (réalisé − annoncé) : −0,144 → « −14,4 points ». */
function pointsDits(b) {
  const v = Math.round(b * 1000) / 10;
  const n = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${n} point${Math.abs(v) >= 2 ? 's' : ''}`;
}

const MOTS_DE_LA_CALIBRATION = Object.freeze({
  'dans-le-hasard': 'dans le hasard',
  'trop-haut': 'annonce trop haut',
  'trop-bas': 'annonce trop bas',
  'trop-peu': 'trop peu de pronostics'
});

/** La calibration du pronostic retenu d'une version : « −14,4 points (annonce trop haut) » ; ou ce qui manque. */
function calibrationDite(c) {
  if (!c || !fini(c.biais)) return 'pas encore mesurée';
  const mot = MOTS_DE_LA_CALIBRATION[c.verdict] ?? c.verdict ?? 'pas jugée';
  return `${pointsDits(c.biais)} (${mot})`;
}

/** « +7,8 % [+6,7 ; +8,9] » : le gain d'erreur de prévision de la nouvelle version, sa fourchette du hasard. */
function gainDit(j) {
  if (!j || !fini(j.gainPct)) return null;
  const f = Array.isArray(j.fourchettePct) && j.fourchettePct.every(fini) ? ` [${nombreSigne(j.fourchettePct[0])} ; ${nombreSigne(j.fourchettePct[1])}]` : '';
  return `${nombreSigne(j.gainPct)} %${f}`;
}

/**
 * Le bloc prêt pour le gabarit, ou null quand l'étape n'en a pas : { titre, entete, lignes: [{ cle, marche, avant,
 * apres, verdict: { texte, ton, icone }, gain, calibration }], pied: { libelle, texte }, phrase, reserves, etat }.
 * `mesure` : la preuve après lancement de l'étape (registre de la mesure) — un lancement noté dit l'adoption.
 */
export function blocDuBancAvantApres(bloc, mesure = null) {
  if (!bloc) return null;
  const lignes = (bloc.lignes ?? []).map((l) => ({
    cle: l.cle,
    marche: l.temoin ? `${l.marche} (témoin)` : l.marche,
    avant: perteDite(l.avant),
    apres: perteDite(l.apres),
    verdict: l.juge ? libelleVerdict(l.juge.verdict) : { texte: 'pas encore jugé', ton: '', icone: 'clock' },
    gain: gainDit(l.juge),
    calibration: l.temoin ? 'témoin : regardé, jamais jugé sur la calibration' : `${calibrationDite(l.calibration?.avant)} → ${calibrationDite(l.calibration?.apres)}`
  }));
  const nLignes = lignes.filter((l) => !l.cle?.startsWith('scoreExact')).length;
  const enBloc = gainDit(bloc.enBloc);
  const entete = bloc.mesure
    ? `${fini(bloc.matchs) ? `${nombreFr(bloc.matchs)} matchs` : 'matchs'} du ${bloc.periode?.de?.split('-').reverse().join('/') ?? '?'} au ${bloc.periode?.a?.split('-').reverse().join('/') ?? '?'}, ${bloc.prix ?? 'prix non dits'}${fini(bloc.variantes) ? ` ; ${bloc.variantes} variantes comptées par le juge` : ''}. Erreur de prévision (perte log) : plus petite = mieux.`
    : `Pas encore mesuré : le tableau se remplira au banc d’essai (${bloc.prix ?? 'prix d’avant-match'}).`;
  const lance = mesure?.lancement?.le ?? null;
  const etat = lance
    ? `Adopté : le modèle de buts unique est en service depuis le ${String(lance).split('-').reverse().join('/')} ; la preuve après lancement se lit juste dessous.`
    : 'En service comme candidate à blanc : chaque nuit, elle est calculée à côté de la version en service et jugée une seule fois, à l’horizon de l’essai (800 matchs joués et 21 jours). Adoption à venir, d’un clic dans Réglages › Versions du moteur, seulement si le juge la dit meilleure.';
  return {
    titre: bloc.titre ?? 'Banc d’essai : avant / après',
    entete,
    lignes,
    pied: {
      libelle: `Σ ${nLignes} lignes de buts`,
      texte: enBloc ? `en bloc ${enBloc} d’erreur de prévision en moins, ${libelleVerdict(bloc.enBloc?.verdict).texte} ; le score exact à part (témoin)` : 'en bloc : pas encore jugé'
    },
    phrase: bloc.phrase ?? null,
    reserves: bloc.porte1?.reserves ?? [],
    porte1: bloc.porte1 ? (bloc.porte1.franchie ? 'Porte 1 franchie au banc d’essai.' : 'Porte 1 pas franchie au banc d’essai.') : 'Porte 1 : pas encore jugée au banc d’essai.',
    etat
  };
}
