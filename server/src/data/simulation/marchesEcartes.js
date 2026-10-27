/**
 * marchesEcartes.js — LES MARCHÉS ET COMBINÉS ÉCARTÉS PAR LA PREUVE (étape 28 du plan, porte 1 sur football-data P2).
 * -----------------------------------------------------------------------
 * PUR : ni base, ni fichier, ni horloge. La LISTE vient de la note de la simulation (noteDeLaSimulation.js, recopiée
 * par script du passage unique de la porte 1) — jamais recopiée à la main ici :
 *   - un marché de déroulé dont la note dit `eteint: true` (f2c.marches) — au 27/10/2026 : « un but dans chaque
 *     mi-temps » (net exact −1,28 pt) et « au moins un rouge » (annoncé 21,69 %, arrivé 18,04 %) ;
 *   - tous les marchés jugés quand la note dit « non vérifié » (plus de 1 % de rencontres écartées) ;
 *   - un combiné que la note dit éteint (f3a.eteints : aucun au 27/10/2026) ;
 *   - tout, si la porte est fermée.
 * Un marché écarté n'est JAMAIS montré : ni ligne du déroulé simulé, ni jambe d'un combiné (refus en mots : « ce marché
 * a été écarté par la preuve sur 2019-2023 »). Il reste éteint en v1 ; la preuve sur les matchs de Pierre (P5) le
 * rapporte ; le rallumer demandera une variante déclarée (lancements.js), jamais un réglage.
 * Les correspondances jambe du ticket (jambes.js) → clé de la note sont un DICTIONNAIRE de tous les marchés de déroulé
 * (ce que chaque sélection mesure), pas la liste des écartés.
 * -----------------------------------------------------------------------
 */

import { NOTE_DE_LA_SIMULATION } from './noteDeLaSimulation.js';
import { ECARTS_MESURES_V } from './reglages.js';

/** Le refus d'une jambe écartée, en mots (le ticket, la page). */
export const PHRASE_DU_MARCHE_ECARTE = 'ce marché a été écarté par la preuve sur 2019-2023';
/** Le refus d'un combiné écarté, en mots. */
export const PHRASE_DU_COMBINE_ECARTE = 'ce combiné a été écarté par la preuve sur 2019-2023';
/**
 * Le refus d'un marché ou d'un combiné que la GARDE DE SÛRETÉ du jugement principal a éteint (F6 : sur vos matchs, ce
 * qu'il annonçait s'est écarté de plus de 4 points de ce qui est arrivé) — éteint SEUL, pour cette version de l'étape 28
 * (vérification du 27/10, constats 7 et 12).
 */
export const PHRASE_DU_MARCHE_ETEINT_PAR_LA_GARDE = 'ce marché a été éteint par la garde de sûreté : sur vos matchs, il s’est écarté de plus de 4 points de ce qui est arrivé';
export const PHRASE_DU_COMBINE_ETEINT_PAR_LA_GARDE = 'ce combiné a été éteint par la garde de sûreté : sur vos matchs, il s’est écarté de plus de 4 points de ce qui est arrivé';
/** Ce qui les attend : éteints en v1, rapportés par la preuve sur vos matchs, rallumés seulement par une variante déclarée. */
export const REGLE_DES_ECARTES =
  'Ils restent éteints en v1 : la preuve sur vos matchs les rapporte, sans jamais les montrer sur un match ; les rallumer demandera une variante déclarée de l’étape 28.';

const HT = { home: 0, draw: 1, away: 2 };
const MI_TEMPS = { home: 'htH', draw: 'htD', away: 'htA' };

/**
 * Les clés de la note (celles du banc et de la nuit) que mesure une sélection de déroulé (jambes.js), ou [] :
 * mi-temps 1/N/2 (htH, htD, htA) ; plus/moins 0,5 et 1,5 à la mi-temps (htO05, htO15 : les deux sens d'une ligne sont
 * le même marché) ; mi-temps/fin (htFt0..8, 1/1 = 0, 1/N = 1… 2/2 = 8) ; un but dans chaque mi-temps (deuxMiTemps05) ;
 * 2e mi-temps plus de buts (h2plusQueH1) ; premier but domicile / extérieur (premierDom, premierExt ; « aucun » = la
 * case 0-0 de la grille, pas un marché de déroulé) ; premier but avant la 30e (premierAvant30) ; l'équipe menée à la
 * mi-temps gagne (retourDom ET retourExt : l'un ou l'autre) ; au moins un rouge (rougeAuMoinsUn).
 */
export function clesDeLaJambe(jambe) {
  const p = jambe?.params ?? {};
  switch (jambe?.marketId) {
    case 'halfTimeResult':
      return MI_TEMPS[p.outcome] ? [MI_TEMPS[p.outcome]] : [];
    case 'halfTimeGoals':
      return Number(p.line) === 0.5 ? ['htO05'] : Number(p.line) === 1.5 ? ['htO15'] : [];
    case 'halfTimeFullTime':
      return p.ht in HT && p.ft in HT ? [`htFt${HT[p.ht] * 3 + HT[p.ft]}`] : [];
    case 'goalInBothHalves':
      return ['deuxMiTemps05'];
    case 'secondHalfMoreGoals':
      return ['h2plusQueH1'];
    case 'firstGoal':
      return p.team === 'home' ? ['premierDom'] : p.team === 'away' ? ['premierExt'] : [];
    case 'firstGoalBefore30':
      return ['premierAvant30'];
    case 'comeback':
      return ['retourDom', 'retourExt'];
    case 'redCard':
      return ['rougeAuMoinsUn'];
    default:
      return [];
  }
}

/**
 * LES ÉCARTÉS, lus dans la note (jamais une liste écrite ici) — et, quand on la lui passe, la GARDE DE SÛRETÉ du jugement
 * principal (`garde` : { ok, eteints: [clés de déroulé ou noms de combinés] }, conditionsDesCombines.gardeDuPrincipal) :
 * chacun de ses éteints s'ajoute aux écartés, marqué `parLaGarde: true` — un marché fautif s'éteint SEUL, le reste reste
 * montré (vérification du 27/10, constats 7 et 12). Rend { porte, date, nonVerifie, deroule: [{ cle, libelle, annonce,
 * realise, netExact, parLaGarde? }], combines: [{ nom, parLaGarde? }], regle }.
 */
export function marchesEcartes(note = NOTE_DE_LA_SIMULATION, { garde = null } = {}) {
  const f2c = note?.f2c ?? null;
  const marches = Array.isArray(f2c?.marches) ? f2c.marches : [];
  const fermee = note?.porte !== 'ouverte';
  const nonVerifie = Boolean(f2c?.parMarche?.nonVerifie);
  const juges = new Set(Array.isArray(f2c?.parMarche?.marches) ? f2c.parMarche.marches : marches.filter((m) => m.dansLaPorte).map((m) => m.cle));
  const deroule = marches
    .filter((m) => m.eteint === true || ((fermee || nonVerifie) && (juges.has(m.cle) || fermee)))
    .map((m) => ({ cle: m.cle, libelle: m.libelle, annonce: m.annonce ?? null, realise: m.realise ?? null, netExact: m.netExact ?? null }));
  const combinesEteints = new Set(Array.isArray(note?.f3a?.eteints) ? note.f3a.eteints : []);
  const combines = (Array.isArray(note?.f3a?.combines) ? note.f3a.combines : []).filter((c) => fermee || combinesEteints.has(c.nom) || c.eteint === true).map((c) => ({ nom: c.nom }));
  for (const k of Array.isArray(garde?.eteints) ? garde.eteints : []) {
    if (typeof k !== 'string' || !k) continue;
    if (COMBINES_DE_LA_PORTE.some((c) => c.nom === k)) {
      if (!combines.some((c) => c.nom === k)) combines.push({ nom: k, parLaGarde: true });
    } else if (!deroule.some((m) => m.cle === k)) {
      deroule.push({ cle: k, libelle: ECARTS_MESURES_V.marches[k]?.libelle ?? k, annonce: null, realise: null, netExact: null, parLaGarde: true });
    }
  }
  return { porte: note?.porte ?? null, date: note?.calculeeLe ?? null, nonVerifie, deroule, combines, regle: REGLE_DES_ECARTES };
}

/** La clé de déroulé est-elle écartée ? */
export const estEcarte = (cle, ecartes = marchesEcartes()) => ecartes.deroule.some((m) => m.cle === cle);

/** Une jambe écartée : { cle, libelle, phrase, parLaGarde? } (le premier marché écarté qu'elle mesure), ou null. */
export function jambeEcartee(jambe, ecartes = marchesEcartes()) {
  for (const cle of clesDeLaJambe(jambe)) {
    const m = ecartes.deroule.find((x) => x.cle === cle);
    if (m) return { cle, libelle: m.libelle, phrase: `« ${jambe?.pick ?? m.libelle} » : ${m.parLaGarde ? PHRASE_DU_MARCHE_ETEINT_PAR_LA_GARDE : PHRASE_DU_MARCHE_ECARTE}`, ...(m.parLaGarde ? { parLaGarde: true } : {}) };
  }
  return null;
}

// ------------------------------------------------------------ les 14 combinés de la porte

const J = (marketId, params) => Object.freeze({ marketId, params: Object.freeze(params) });
const UN = J('result', { outcome: 'home' });
const NUL = J('result', { outcome: 'draw' });
const DEUX = J('result', { outcome: 'away' });
const BTTS = J('bothTeamsScore', { outcome: 'yes' });
const plus = (line) => J('totalGoals', { line, side: 'over' });
const moins = (line) => J('totalGoals', { line, side: 'under' });

/**
 * Les 14 combinés jugés par la porte 1 (ceux du banc v2 et de la nuit, COMBINES_DE_LA_NUIT, que ce module n'importe pas :
 * les lecteurs restent légers ; un test vérifie qu'ils sont égaux), écrits comme des sélections du ticket.
 */
export const COMBINES_DE_LA_PORTE = Object.freeze([
  { nom: '1 & plus de 2,5', jambes: [UN, plus(2.5)] },
  { nom: '1 & moins de 2,5', jambes: [UN, moins(2.5)] },
  { nom: 'N & moins de 2,5', jambes: [NUL, moins(2.5)] },
  { nom: '2 & plus de 2,5', jambes: [DEUX, plus(2.5)] },
  { nom: '1 & les deux marquent', jambes: [UN, BTTS] },
  { nom: '2 & les deux marquent', jambes: [DEUX, BTTS] },
  { nom: 'N & les deux marquent', jambes: [NUL, BTTS] },
  { nom: 'plus de 2,5 & les deux marquent', jambes: [plus(2.5), BTTS] },
  { nom: '1 & dom. plus de 1,5', jambes: [UN, J('teamGoals', { team: 'home', line: 1.5, side: 'over' })] },
  { nom: '1 sans encaisser', jambes: [UN, J('teamGoals', { team: 'away', line: 0.5, side: 'under' })] },
  { nom: '1 & plus de 1,5', jambes: [UN, plus(1.5)] },
  { nom: '1 & plus de 2,5 & les deux marquent', jambes: [UN, plus(2.5), BTTS] },
  { nom: 'moins de 3,5 & les deux marquent', jambes: [moins(3.5), BTTS] },
  { nom: 'double chance 1N & moins de 3,5', jambes: [J('doubleChance', { outcome: 'homeDraw' }), moins(3.5)] }
].map((c) => Object.freeze({ ...c, jambes: Object.freeze(c.jambes) })));

/** La clé d'une jambe (marché et paramètres triés, les lignes en nombre) : deux écritures d'une même sélection se retrouvent. */
const cle = (j) => `${j?.marketId}|${JSON.stringify(Object.keys(j?.params ?? {}).sort().map((k) => [k, typeof j.params[k] === 'string' && /^-?\d+(\.\d+)?$/.test(j.params[k]) ? Number(j.params[k]) : j.params[k]]))}`;

/** Un combiné écarté : les jambes d'un même match forment EXACTEMENT un combiné que la note dit éteint → { nom, phrase } ; sinon null. */
export function combineEcarte(jambes, ecartes = marchesEcartes()) {
  if (!Array.isArray(jambes) || jambes.length < 2 || !ecartes.combines.length) return null;
  const voulu = [...new Set(jambes.map(cle))].sort().join('&');
  for (const { nom, parLaGarde } of ecartes.combines) {
    const c = COMBINES_DE_LA_PORTE.find((x) => x.nom === nom);
    if (c && [...new Set(c.jambes.map(cle))].sort().join('&') === voulu) return { nom, phrase: `« ${nom} » : ${parLaGarde ? PHRASE_DU_COMBINE_ETEINT_PAR_LA_GARDE : PHRASE_DU_COMBINE_ECARTE}`, ...(parLaGarde ? { parLaGarde: true } : {}) };
  }
  return null;
}
