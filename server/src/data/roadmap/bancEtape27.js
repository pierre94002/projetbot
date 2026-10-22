/**
 * bancEtape27.js — le bloc « Banc d'essai sur des matchs jamais vus (2019-2023) : avant / après » de l'étape 27 sur
 * la feuille de route (étape 27 du plan, 21/10/2026).
 * -----------------------------------------------------------------------
 * Pur et LU DANS LE CODE, jamais dans la base : la note de départ (bench/noteDeDepart.js : la version en service au
 * banc P2, 2019-2023, prix d'avant-match de football-data) et la note du modèle de buts unique
 * (core/engine/noteDuModeleDeButs.js : la candidate au même banc, le juge de la porte 1 et la réserve acceptée). Pour
 * chaque ligne de buts et le score exact : la perte log de chaque version, le verdict du juge (apparié, même matchs),
 * la calibration du pronostic retenu de chaque version. La STRUCTURE est complète même avant la mesure : chaque ligne
 * est là, un chiffre absent vaut null (l'écran dit « pas encore mesuré »).
 * football-data n'a pas d'xG : ce banc juge le modèle « cotes + buts » ; les xG se jugent pendant l'essai à blanc.
 * -----------------------------------------------------------------------
 */

import { NOTE_DE_DEPART } from '../../bench/noteDeDepart.js';
import { NOTE_DU_MODELE_DE_BUTS } from '../../core/engine/noteDuModeleDeButs.js';
import { libelleDeLaCase } from '../../bench/libellesDesCases.js';

/** Les lignes du bloc, dans l'ordre de la carte des marchés : le total, les deux marquent, chaque équipe, le combiné, le score. */
export const LIGNES_DU_BANC_27 = Object.freeze([
  'totalGoals|0.5',
  'totalGoals|1.5',
  'totalGoals|2.5',
  'totalGoals|3.5',
  'bothTeamsScore',
  'teamGoals:home|0.5',
  'teamGoals:home|1.5',
  'teamGoals:home|2.5',
  'teamGoals:home|3.5',
  'teamGoals:away|0.5',
  'teamGoals:away|1.5',
  'teamGoals:away|2.5',
  'teamGoals:away|3.5',
  'resultAndTotal|1.5',
  'resultAndTotal|2.5',
  'resultAndTotal|3.5',
  'scoreExact'
]);

export const PHRASE_SANS_XG = 'football-data n’a pas d’xG : ce banc juge le modèle « cotes + buts » ; les xG se jugent pendant l’essai à blanc.';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const nombre = (x, d = 4) => (fini(x) ? Number(x.toFixed(d)) : null);
const perte = (c) => (c?.moteur && fini(c.moteur.perteLog) ? { perteLog: c.moteur.perteLog, matchs: c.n ?? null, justes: c.moteur.justes ?? null } : null);
const juge = (x) => (x && x.verdict ? { gainPct: nombre(x.gainPct, 3), fourchettePct: Array.isArray(x.fourchettePct) ? x.fourchettePct.map((v) => nombre(v, 3)) : null, verdict: x.verdict } : null);
const calib = (x) => (x && fini(x.biais) ? { biais: x.biais, verdict: x.verdict ?? null, pronostics: x.pronostics ?? null } : null);

/**
 * Le bloc de l'étape 27 : { titre, periode, prix, phrase, mesure, lignes: [{ cle, marche, temoin, avant, apres, juge,
 * calibration: { avant, apres } }], enBloc, porte1: { franchie, reserves }, sources }. `depart` et `modele` servent
 * aux essais (une note absente donne la structure complète, sans chiffres).
 */
export function blocDuBancEtape27({ depart = NOTE_DE_DEPART, modele = NOTE_DU_MODELE_DE_BUTS } = {}) {
  const A = depart?.depart?.P2?.marches ?? {};
  const B = modele?.marches ?? {};
  const p = modele?.porte1 ?? null;
  const l = p?.avecCotes ?? null;
  const lignes = LIGNES_DU_BANC_27.map((cle) => {
    const temoin = cle === 'scoreExact';
    return {
      cle,
      marche: libelleDeLaCase(cle),
      temoin,
      avant: perte(A[cle]),
      apres: perte(B[cle]),
      juge: temoin ? juge(p?.scoreExact?.avecCotes) : juge(l?.parLigne?.[cle]),
      calibration: temoin ? { avant: null, apres: null } : { avant: calib(l?.calibration?.enService?.parLigne?.[cle]), apres: calib(l?.calibration?.candidate?.parLigne?.[cle]) }
    };
  });
  return {
    titre: 'Banc d’essai sur des matchs jamais vus (2019-2023) : avant / après',
    periode: { de: '2019-07-01', a: '2023-06-30' },
    prix: 'cotes d’avant-match de football-data',
    phrase: PHRASE_SANS_XG,
    mesure: lignes.some((x) => x.apres),
    matchs: l?.matchs ?? null,
    variantes: p?.K ?? null,
    lignes,
    enBloc: juge(l?.enBloc),
    porte1: p ? { franchie: Boolean(p.verdict?.franchie), reserves: (p.reservesAcceptees ?? []).map((r) => r.texte) } : null,
    sources: {
      avant: depart?.rejeu?.id ? `note de départ (bench/noteDeDepart.js), rejeu n° ${depart.rejeu.id}` : 'note de départ (bench/noteDeDepart.js)',
      apres: modele?.rejeu?.id ? `note du modèle de buts (core/engine/noteDuModeleDeButs.js), rejeu n° ${modele.rejeu.id}` : 'note du modèle de buts (core/engine/noteDuModeleDeButs.js) : pas encore mesurée'
    }
  };
}
