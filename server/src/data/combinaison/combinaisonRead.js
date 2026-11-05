/**
 * combinaisonRead.js — « AVANT DE PARIER — À BLANC » : la lecture pour la page du match (étape 38 du plan, lot 1b, partie D,
 * 04/11/2026 ; conception §7).
 * -----------------------------------------------------------------------
 * Ce que l'analyse d'un match reçoit APRÈS le moteur (analysis.controller.js, comme le contexte de la 32, les cartons de la
 * 33 et les joueurs de la 34) : le verdict n'en sait rien, l'IA ne le reçoit jamais, et une lecture qui échoue n'empêche
 * jamais l'analyse (« illisible »). Aucune requête de plus à l'ouverture de la page : le bloc voyage avec l'analyse. Les mots
 * sont assemblés par l'écran (ui/src/utils/avantDeParier.js, pur) à partir des mots scellés envoyés ici.
 * LECTURE SEULE, PAR CLÉ, SANS CALCUL : l'état de la nuit (`combinaison_etat`) et LA ligne du pronostic du résultat de ce
 * match (`combinaison_avant_match`, le moteur en service, sa dernière révision rangée gelée avant le coup d'envoi), par les
 * IDENTIFIANTS FotMob des deux clubs et le jour (jamais un nom). On n'en envoie que « ce qui manque » (ses phrases, leur
 * provenance, leur heure), l'origine et l'heure du pronostic : JAMAIS l'étiquette « sur / fragile », jamais un degré, jamais
 * une jauge — rien de cela n'est jugé (T-E1). La candidate en essai n'est jamais lue ici.
 * Le seuil et vos bookmakers se lisent sur CETTE analyse (les cotes qu'elle a reçues), comme le tableau des verdicts juste
 * au-dessus : l'ancre de la cote juste (referenceDuMatch, la règle du moteur) et le nombre de cotes de VOS bookmakers
 * (estAutorise : jamais une cote de référence). La note du banc (recopiée par script) dit ce qui a été mesuré.
 * Hors de l'empreinte du moteur ; aucun fichier du moteur ne l'importe.
 * -----------------------------------------------------------------------
 */

import { MOTS, DECISIONS_DE_PIERRE, VERSION_DE_LA_REGLE } from './reglagesCombinaison.js';
import { COMBINAISON_AU_BANC } from './noteDeLaCombinaison.js';
import { referenceDuMatch } from '../../core/engine/verdictPari.js';
import { estAutorise } from '../../core/engine/valueFinder.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const numeroDuClub = (id) => {
  const m = String(id ?? '').trim().match(/^(?:fotmob-)?([1-9]\d*)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
};
const jourDe = (x) => {
  const t = Date.parse(String(x ?? ''));
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  const j = String(x ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(j) ? j : null;
};

/** Les états de la lecture. */
export const ETATS_DE_LA_COMBINAISON = Object.freeze(['pret', 'pas-encore-calcule', 'clubs-inconnus', 'illisible']);

/** Le titre et les mots fixes de l'encadré (les mots scellés : reglagesCombinaison.MOTS, banc-regles-etape38.md §9). */
export const MOTS_DE_L_ENCADRE = Object.freeze({
  titre: 'Avant de parier — à blanc',
  rienNeManque: MOTS.rienNeManque,
  pied: MOTS.pied,
  seuilPinnacle: MOTS.seuilPinnacle,
  seuilJamais: MOTS.seuilJamais,
  livreJamais: MOTS.livreJamais,
  rienNeSAjoute: MOTS.rienNeSAjoute
});

/** Le nom à l'écran des bookmakers français (les clés du moteur). */
export const NOMS_DES_LIVRES = Object.freeze({ unibet_fr: 'Unibet', betclic_fr: 'Betclic', winamax_fr: 'Winamax', pmu_fr: 'PMU' });

/** La clé d'un pronostic gelé (gelPronostics.cleDuMatch, identifiants FotMob) : « fotmob:fotmob-<dom>|fotmob-<ext>|<jour> ». */
export const cleDuMatch = (home, away, date) => `fotmob:fotmob-${home}|fotmob-${away}|${date}`;

/** Une valeur de `combinaison_etat` (JSON) ; null si absente ; LÈVE si la base ne répond pas (l'appelant dit « illisible »). */
function valeurDeLEtat(database, cle) {
  const r = database.prepare('SELECT valeur FROM combinaison_etat WHERE cle = ?').get(cle);
  if (!r) return null;
  try {
    return JSON.parse(r.valeur);
  } catch {
    return null;
  }
}

/** LA ligne du pronostic du résultat d'un match (le service, la dernière révision rangée gelée avant le coup d'envoi), ou null. */
export function ligneDuResultat(database, cle) {
  return (
    database
      .prepare(
        `SELECT revision, origin, recorded_at, calcule_le, calcule_apres, regime, palier, odds_source, odds_at, manques, regle_version FROM combinaison_avant_match
         WHERE source = 'service' AND candidate_id = '' AND fixture_key = ? AND market_key = 'result' AND apres_coup_d_envoi = 0 ORDER BY revision DESC LIMIT 1`
      )
      .get(cle) ?? null
  );
}

/** L'ancre de la cote juste de CETTE analyse (la règle du moteur : referenceDuMatch) : pinnacle, palier2, palier3, repli, sans-cote. */
export function ancreDeLAnalyse(match, config = {}) {
  const { disponible, reference } = referenceDuMatch(match ?? {}, config ?? {});
  if (!disponible) return { ancre: 'sans-cote', basis: null };
  if (!reference) return { ancre: 'repli', basis: null };
  return { ancre: reference.basis === 'Pinnacle' ? 'pinnacle' : reference.basis === 'palier 2' ? 'palier2' : 'palier3', basis: reference.basis };
}

/** Le verdict de « rien ne s'ajoute aux cotes » sur le 1N2 (la note : 1n2-stats-residuel), ou null avant le banc. */
export function bancDuResultat(note = COMBINAISON_AU_BANC) {
  const v = note?.variantes?.find((x) => x.id === '1n2-stats-residuel') ?? null;
  if (!v) return null;
  return { variante: v.id, verdict: v.verdict, lignes: fini(v.lignes) ? v.lignes : null, fenetre: v.fenetre ?? null, periode: v.fenetre === 'P2' ? '2019-2023' : null };
}

const origineDite = (origin) => (origin === 'nuit' ? 'nuit' : origin === 'analyse-coup-d-envoi' ? 'coup-d-envoi' : origin === 'analyse-avance' ? 'avance' : 'inconnue');

/**
 * LE BLOC de l'encadré pour un match : { version, etat, raison, date, nuit, pronostic, seuil, livres, banc, mots }.
 * `match` : le match analysé (identifiants FotMob dans scoreInputs, ses cotes) ; `config` : la configuration du moteur
 * (vos bookmakers) ; `database` : la base. Ne lève jamais.
 */
export function combinaisonDuMatch({ match, database, config = {}, note = COMBINAISON_AU_BANC }) {
  const home = numeroDuClub(match?.scoreInputs?.home?.teamId ?? match?.homeId ?? null);
  const away = numeroDuClub(match?.scoreInputs?.away?.teamId ?? match?.awayId ?? null);
  const date = jourDe(match?.commenceTime);
  let seuil;
  let livres;
  try {
    const a = ancreDeLAnalyse(match, config);
    seuil = { ancre: a.ancre, basis: a.basis, mesure: a.ancre === 'pinnacle' };
  } catch {
    seuil = { ancre: null, basis: null, mesure: false };
  }
  try {
    const vos = (match?.marketOdds?.byBookmaker ?? []).filter((b) => estAutorise(b, config ?? {}));
    livres = { relevees: vos.length, vos: vos.map((b) => ({ cle: b.key, titre: b.title ?? b.key })) };
  } catch {
    livres = { relevees: null, vos: [] };
  }
  const pierre = (DECISIONS_DE_PIERRE.qH?.livres ?? []).map((cle) => ({ cle, titre: NOMS_DES_LIVRES[cle] ?? cle }));
  const base = {
    version: 1,
    regle: VERSION_DE_LA_REGLE,
    etat: 'pret',
    raison: null,
    date,
    clubs: { home, away },
    nuit: null,
    pronostic: null,
    seuil,
    livres: { ...livres, dePierre: pierre },
    banc: bancDuResultat(note),
    mots: { ...MOTS_DE_L_ENCADRE }
  };
  if (!date) return { ...base, etat: 'illisible', raison: 'date-du-match-illisible' };
  if (home === null || away === null) return { ...base, etat: 'clubs-inconnus', raison: home === null && away === null ? 'les-deux' : home === null ? 'domicile' : 'exterieur' };
  if (!database) return { ...base, etat: 'illisible', raison: 'base-absente' };
  try {
    const nuit = valeurDeLEtat(database, 'nuit');
    const enCours = valeurDeLEtat(database, 'en_cours');
    const avecNuit = { ...base, nuit: nuit?.calculeLe ? { calculeLe: nuit.calculeLe, jourD: nuit.jourD ?? null } : null };
    if (!nuit?.calculeLe || enCours) return { ...avecNuit, etat: 'pas-encore-calcule', raison: enCours ? 'nuit-en-cours' : 'premiere-nuit' };
    const ligne = ligneDuResultat(database, cleDuMatch(home, away, date));
    if (!ligne) return { ...avecNuit, etat: 'pas-encore-calcule', raison: 'match-pas-encore-range' };
    let manques = [];
    try {
      const m = JSON.parse(ligne.manques ?? '[]');
      manques = Array.isArray(m) ? m.map((x) => ({ code: x.code, explication: x.degre === null || x.degre === undefined, phrase: String(x.phrase ?? ''), source: x.source ?? null, heure: x.heure ?? null })) : [];
    } catch {
      manques = [];
    }
    return {
      ...avecNuit,
      pronostic: {
        marche: 'result',
        revision: ligne.revision,
        origine: origineDite(ligne.origin),
        recordedAt: ligne.recorded_at,
        calculeLe: ligne.calcule_le,
        calculeApres: ligne.calcule_apres === 1,
        regime: ligne.regime,
        palier: ligne.palier ?? null,
        palierReconstruit: true,
        manques
      }
    };
  } catch {
    return { ...base, etat: 'illisible', raison: 'lecture-ratee' };
  }
}
