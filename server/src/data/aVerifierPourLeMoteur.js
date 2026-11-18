/**
 * aVerifierPourLeMoteur.js — CE QUE CHAQUE PORTE JOINT AU MATCH POUR LE REFUS « À VÉRIFIER » (étape 38, lot 2a, 16/11/2026).
 * -----------------------------------------------------------------------
 * Décision de Pierre du 15/11/2026 (D5) : aucun conseil de pari sur un match « à vérifier ». La règle vit dans le moteur
 * (core/engine/verdictPari.js, sansConseilAVerifier), qui ne lit RIEN : chaque porte qui lui donne un match — la page d'un
 * match (api/controllers/analysis.controller.js), le Repérage et les Opportunités (data/screener.js, avecVerdicts),
 * l'analyse IA automatique (core/ai/autoMatchAiTrigger.js), le gel de la nuit (data/enregistreurs/gelPronostics.js) — y
 * joint `aVerifier`, préparé ICI, au même endroit pour toutes : une seule définition.
 *
 * LA DÉFINITION : le badge « à vérifier » du contrôle quotidien (data/controleQuotidien.js : un constat rouge sur une
 * rencontre d'un des deux clubs dans les 60 jours, sur le championnat, le magasin pas à jour, FotMob en panne) POUR LA
 * FAMILLE DU PARI CONSEILLÉ. Le moteur ne conseille qu'un pari sur le 1 / N / 2 : la famille est celle du marché
 * « result » (familleDuMarche) — exactement le badge que porte un pronostic 1 / N / 2 à l'écran (page du match,
 * Opportunités), et la définition que la règle mesurée au banc donne d'une ligne « à vérifier »
 * (data/combinaison/nuitDeLaCombinaison.js, controleEnVigueur : `famille: familleDuMarche(ligne.market_id)`). Un constat
 * qui ne touche que les corners, les tirs ou les cartons (les cartons « non relevés » de tout un championnat, par exemple)
 * marque le match dans le bandeau de sa page, mais ne retire pas un conseil 1 / N / 2 : ses données ne sont pas en cause.
 *
 * Une lecture qui échoue ne lève jamais et rend null (« rien à dire ») : le conseil reste celui d'avant. Le moteur, le
 * banc et les rejeux qui n'appellent pas ce fichier ne changent pas.
 * -----------------------------------------------------------------------
 */

import { preparerAVerifier, preparerAVerifierParNoms, familleDuMarche } from './controleQuotidien.js';
import { clubDuMagasin } from './db/oddsProfileRead.js';
import { openDb } from './db/matchStatsDb.js';

/** La famille du seul pari que le moteur conseille (le 1 / N / 2). */
export const FAMILLE_DU_CONSEIL = familleDuMarche('result');

/** La famille d'un marché (data/db/dailyChecks.js), redonnée ici pour les portes : le gel, les cotes saisies. */
export { familleDuMarche };

const jourDe = (x) => String(x ?? '').slice(0, 10);

/**
 * Par IDENTIFIANTS FotMob (Repérage, Opportunités, gel de la nuit) : rend ({ league, date | commenceTime, homeId, awayId })
 * → null | { raisons, texte }. L'état du contrôle est lu UNE fois. `verifier` : pour les essais (la fonction de
 * preparerAVerifier).
 */
export function preparerAVerifierDuConseil({ maintenant = Date.now(), verifier = null } = {}) {
  let regle = verifier;
  if (!regle) {
    try {
      regle = preparerAVerifier({ maintenant });
    } catch {
      regle = null;
    }
  }
  return ({ league = null, date = null, commenceTime = null, homeId = null, awayId = null } = {}) => {
    if (!regle) return null;
    try {
      return regle({ league, date: jourDe(date ?? commenceTime), homeId, awayId, famille: FAMILLE_DU_CONSEIL }) ?? null;
    } catch {
      return null;
    }
  };
}

/**
 * PAR FAMILLE (correction du 17/11/2026, après la vérification des lots d'argent) : la même lecture par IDENTIFIANTS, mais
 * pour la famille que l'APPELANT donne — celle du marché de chaque ligne gelée (le gel : chaque pronostic est jugé par la
 * famille de SON marché, comme la règle mesurée au banc, controleEnVigueur) ou celle d'une cote saisie à la main. Rend
 * ({ league, date | commenceTime, homeId, awayId }, famille) → null | { raisons, texte }. L'état du contrôle est lu UNE
 * fois. `verifier` : pour les essais. Une lecture qui échoue rend null.
 */
export function preparerAVerifierParFamille({ maintenant = Date.now(), verifier = null } = {}) {
  let regle = verifier;
  if (!regle) {
    try {
      regle = preparerAVerifier({ maintenant });
    } catch {
      regle = null;
    }
  }
  return ({ league = null, date = null, commenceTime = null, homeId = null, awayId = null } = {}, famille = FAMILLE_DU_CONSEIL) => {
    if (!regle) return null;
    try {
      return regle({ league, date: jourDe(date ?? commenceTime), homeId, awayId, famille }) ?? null;
    } catch {
      return null;
    }
  };
}

/**
 * Par NOMS (page d'un match, analyse IA automatique : le match adapté n'a que ses noms) : rend (match) → null |
 * { raisons, texte }. Correction du 17/11/2026 (vérification des lots d'argent, « à vérifier » C1) : les clubs sont
 * reconnus comme au Repérage, aux Opportunités et au gel (clubDuMagasin : « Brighton and Hove Albion » pour « Brighton &
 * Hove Albion », « Girona FC » pour « Girona », jamais une ressemblance approximative), puis la règle est lue par
 * identifiants ; avant, l'écriture exacte seule, et la page gardait le conseil d'un club écrit autrement. `verifier` : pour
 * les essais (la règle par noms, telle quelle).
 */
export function preparerAVerifierDuConseilParNoms({ maintenant = Date.now(), database = null, verifier = null } = {}) {
  if (verifier) {
    return (match) => {
      if (!match) return null;
      try {
        return verifier({ league: match.league ?? null, date: jourDe(match.commenceTime), homeName: match.home, awayName: match.away, famille: FAMILLE_DU_CONSEIL }) ?? null;
      } catch {
        return null;
      }
    };
  }
  let regle = null;
  let db = null;
  try {
    regle = preparerAVerifier({ maintenant });
    db = database ?? openDb();
  } catch {
    regle = null;
  }
  const id = (nom, league) => {
    try {
      return clubDuMagasin(nom, league, db);
    } catch {
      return null;
    }
  };
  return (match) => {
    if (!regle || !match) return null;
    try {
      return regle({ league: match.league ?? null, date: jourDe(match.commenceTime), homeId: id(match.home, match.league), awayId: id(match.away, match.league), famille: FAMILLE_DU_CONSEIL }) ?? null;
    } catch {
      return null;
    }
  };
}

/** Le match tel qu'on le donne au moteur : avec `aVerifier` s'il y a une raison, tel quel sinon (aucune clé de plus). */
export function avecAVerifierPourLeMoteur(match, aVerifier) {
  return aVerifier ? { ...match, aVerifier } : match;
}
