/**
 * verdictParMarche.js — le VERDICT PAR MARCHÉ de la page d'un match à venir (étape 9 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * La page d'un match se lit dans l'ordre d'une décision : d'abord, pour chaque
 * marché, ce que dit le moteur et ce que paient vos bookmakers. Ce fichier
 * ASSEMBLE ces lignes à partir de ce que le serveur a déjà calculé — il n'en
 * calcule aucune :
 *   - la probabilité et la cote juste : `prediction.probabilities` et `trueOdds`
 *     de l'analyse pour le 1 / N / 2, `marketPredictions` (cote juste du
 *     pronostic de chaque marché, probabilité = 1 / cote juste, comme
 *     MarketPicksBoard) pour les autres ;
 *   - la meilleure cote de vos bookmakers, son heure et la value du 1 / N / 2 :
 *     le VERDICT du moteur (`verdicts` de l'analyse, server/src/core/engine/
 *     verdictPari.js — la même source que la page Opportunités, le Repérage et
 *     Mes paris), jamais refait ici ;
 *   - pour tout autre marché, la cote que Pierre a saisie à la main (saisie
 *     express, GET /api/odds/saisies) avec la value, l'heure et la fraîcheur que
 *     le serveur lui a données : The Odds API ne relève que le 1 / N / 2.
 * Une cote, une probabilité ou une confiance qui n'existe pas est DITE
 * (« pas de cote chez vos bookmakers pour ce marché », « pas encore mesurée »),
 * jamais un tiret ni une valeur par défaut. Une cote gratuite de référence n'est
 * jamais montrée ici comme une cote de vos bookmakers.
 *
 * JavaScript pur, sans Vue ni navigateur : les tests du serveur le rejouent
 * (server/test/pageMatchDecision.test.mjs). Toute fonction qui dépend de l'heure
 * reçoit `maintenant` (ms).
 * -----------------------------------------------------------------------
 */

import { etatVerdict, etatValue, fraicheurVivante, ilYA, pourcentSigne } from './langageParis.js';
import { campsDe } from './pronosticEquipe.js';

/** Les trois issues du résultat, dans l'ordre où le moteur les range. */
export const ISSUES_DU_RESULTAT = Object.freeze(['home', 'draw', 'away']);

/**
 * Les familles de marchés après le résultat — les mêmes que MarketPicksBoard
 * (« Le match », puis buts, corners, tirs, tirs cadrés), chacune avec les
 * identifiants de marché du moteur (server/src/sports/football/markets.js).
 */
export const FAMILLES_DU_VERDICT = Object.freeze([
  Object.freeze({ cle: 'match', titre: 'Le match', ids: Object.freeze(['resultAndTotal', 'bothTeamsScore']) }),
  Object.freeze({ cle: 'buts', titre: 'Buts', ids: Object.freeze(['totalGoals', 'teamGoals']) }),
  Object.freeze({ cle: 'corners', titre: 'Corners', ids: Object.freeze(['totalCorners', 'teamCorners']) }),
  Object.freeze({ cle: 'tirs', titre: 'Tirs', ids: Object.freeze(['totalShots', 'teamShots']) }),
  Object.freeze({ cle: 'cadres', titre: 'Tirs cadrés', ids: Object.freeze(['totalShotsOnTarget', 'teamShotsOnTarget']) })
]);

/** La confiance de chaque ligne : le moteur ne la mesure pas encore (étape 38 du plan). */
export const CONFIANCE_NON_MESUREE = Object.freeze({ valeur: null, etiquette: null });

/** La cote minimale d'un pronostic de marché (markets.js, COTE_MINIMALE) : sous elle, le moteur ne pronostique pas. */
export const COTE_MINIMALE_DU_PRONOSTIC = 1.2;

// ------------------------------------------------------------- petits outils

/** Un nombre fini, ou null : jamais le 0 d'un `Number(null)`. */
const nombre = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const coteAffichee = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' && Number(x) > 1 ? Number(x).toFixed(2) : '—');

/** 0,5812 → « 58 % » : entier, comme MarketPicksBoard (la cote juste n'a que deux décimales, une décimale de plus serait fausse). */
export function pourcentageEntier(probabilite) {
  const p = nombre(probabilite);
  return p === null ? null : `${Math.round(p * 100)} %`;
}

/** La probabilité d'un pronostic de marché : 1 / sa cote juste (le moteur ne donne pas l'une sans l'autre). */
export function probabiliteDeLaCoteJuste(cote) {
  const c = nombre(cote);
  return c !== null && c > 1 ? 1 / c : null;
}

// --------------------------------------------- une cote de vos bookmakers (1N2)

/**
 * La meilleure cote de vos bookmakers pour une issue du résultat, telle que le
 * verdict du moteur la porte : la cote qu'il a jugée, son bookmaker, l'heure de
 * son relevé et, s'il y en a un, le « juge » écarté. `null` quand le verdict
 * n'a aucune cote (issue non cotée, aucun de vos bookmakers, pas de cote).
 */
export function meilleureCoteDuVerdict(verdict, maintenant = Date.now()) {
  const cote = nombre(verdict?.cote);
  if (cote === null || cote <= 1) return null;
  const juge = verdict.offreJuge;
  return {
    cote,
    livre: verdict.bookmakerTitle ?? verdict.bookmaker ?? null,
    releveAt: verdict.releveAt ?? null,
    // La même phrase que la page Opportunités : « relevée il y a 10 min », ou ce qu'on ne sait pas.
    releve: verdict.releveAt ? `relevée ${ilYA(verdict.releveAt, maintenant)}` : 'heure du relevé inconnue',
    origine: verdict.origineReleve ?? null,
    fraicheur: verdict.fraicheur ?? null,
    source: 'The Odds API',
    juge: juge ? `${juge.bookmakerTitle ?? juge.bookmaker} paie ${coteAffichee(juge.cote)}, écarté : juge et partie` : null
  };
}

/** Pourquoi une issue du résultat n'a pas de cote chez vos bookmakers, en une ligne (la phrase complète du serveur reste au survol). */
const SANS_COTE_COURT = Object.freeze({
  'non-cote': 'Aucun de vos bookmakers ne cote cette issue',
  'non-jouable': 'Aucun de vos bookmakers ne cote ce match',
  'pas-de-cote': 'Pas de cote de marché pour ce match',
  'pas-de-reference': 'Pas de cote juste sûre pour ce match',
  incoherente: 'Cotes de vos bookmakers incohérentes',
  'coupe-circuit': 'Coupe-circuit enclenché'
});

// ------------------------------------------------- une cote saisie (autres marchés)

/** Les marchés dont une cote se saisit à la main (server/src/data/saisiesCotes.js, MARCHES_SAISIE) : « Résultat + Total buts » n'en fait pas partie. */
export const MARCHES_SAISISSABLES = Object.freeze([
  'totalGoals',
  'bothTeamsScore',
  'teamGoals',
  'totalCorners',
  'teamCorners',
  'totalShots',
  'teamShots',
  'totalShotsOnTarget',
  'teamShotsOnTarget',
  'totalCards',
  'teamCards',
  'anytimeScorer'
]);
export const estSaisissable = (marketId) => MARCHES_SAISISSABLES.includes(marketId);

/** La phrase que la page du match ajoute à la pastille d'une saisie (la même que ManualOddsEntry) : le moteur de cette ligne n'est pas encore jugé sur l'historique. */
export const precisionDeLaSaisie = (s) =>
  s?.moteur?.origine ? `Probabilité : ${s.moteur.origine}. Une value sur ce marché n'a pas encore été vérifiée sur l'historique (banc d'essai, étape 19 du plan).` : null;

/** La saisie parle-t-elle de la même issue que ce pronostic du moteur (même marché, même camp, même ligne, même côté) ? */
export function memeSelection(saisie, pronostic) {
  const p = pronostic?.params ?? {};
  const cote = p.side ?? p.outcome ?? null;
  const ligne = nombre(p.line);
  return (
    saisie?.marketId === pronostic?.marketId &&
    (saisie.sens ?? null) === cote &&
    (ligne === null || nombre(saisie.ligne) === ligne) &&
    (saisie.equipe ?? null) === (p.team ?? null)
  );
}

/**
 * La saisie à mettre en avant parmi celles d'une même issue : une cote encore
 * FRAÎCHE d'abord (une cote à rafraîchir n'est pas jouable), puis la plus haute,
 * puis la plus récente.
 */
export function meilleureSaisie(saisies, maintenant = Date.now()) {
  const fraiche = (s) => (s?.fraicheur ? fraicheurVivante(s.fraicheur, maintenant)?.etat === 'fraiche' : false);
  return (
    [...(saisies ?? [])].sort(
      (a, b) =>
        Number(fraiche(b)) - Number(fraiche(a)) ||
        (nombre(b.cote) ?? 0) - (nombre(a.cote) ?? 0) ||
        String(b.releveAt ?? '').localeCompare(String(a.releveAt ?? ''))
    )[0] ?? null
  );
}

/** La meilleure cote d'une ligne saisie à la main, dans la forme d'une cote de vos bookmakers. */
function coteDeLaSaisie(s, maintenant) {
  if (!s) return null;
  return {
    cote: nombre(s.cote),
    livre: s.bookmakerTitre ?? s.bookmaker ?? null,
    releveAt: s.releveAt ?? null,
    releve: s.releveAt ? `saisie ${ilYA(s.releveAt, maintenant)}` : 'heure de la saisie inconnue',
    origine: 'saisie',
    fraicheur: s.fraicheur ?? null,
    source: 'Saisie à la main',
    juge: null
  };
}

// ----------------------------------------------------------- les lignes

const AUCUN_MOTEUR = 'Le moteur ne donne pas de probabilité pour cette issue.';

/** Les lignes du résultat : une par issue, avec le verdict du serveur tel quel. */
function lignesDuResultat(result, match, maintenant) {
  const verdicts = result?.verdicts ?? null;
  const libelles = { home: `${match?.home ?? 'Domicile'} gagne`, draw: 'Match nul', away: `${match?.away ?? 'Extérieur'} gagne` };
  return ISSUES_DU_RESULTAT.map((issue) => {
    const verdict = verdicts?.[issue] ?? null;
    const probabilite = nombre(result?.prediction?.probabilities?.[issue]) ?? nombre(verdict?.probabilite);
    const coteJuste = nombre(result?.trueOdds?.[issue]) ?? nombre(verdict?.coteJuste);
    const meilleureCote = meilleureCoteDuVerdict(verdict, maintenant);
    return {
      cle: `result:${issue}`,
      groupe: 'resultat',
      marketId: 'result',
      marche: 'Résultat',
      libelle: verdict?.libelle ?? libelles[issue],
      camp: issue === 'draw' ? null : issue,
      pronostic: null,
      // Le pronostic du moteur : l'issue la plus probable du résultat.
      choisi: result?.prediction?.outcome === issue,
      probabilite,
      coteJuste,
      source: result?.prediction?.source ?? null,
      // Le verdict du moteur, tel que le serveur le donne (jamais refait ici) — null d'un serveur d'avant l'étape 8.
      verdict,
      verdictAbsent: !verdict,
      meilleureCote,
      saisie: null,
      autresSaisies: 0,
      confiance: CONFIANCE_NON_MESUREE,
      manque: meilleureCote ? null : verdict ? (SANS_COTE_COURT[verdict.etat] ?? 'Pas de cote de vos bookmakers pour cette issue') : 'Verdict du moteur indisponible : relancez demarrer-cotemaster.bat',
      manqueDetail: verdict && !meilleureCote ? (verdict.raison ?? null) : null
    };
  });
}

/** Une ligne par pronostic du moteur (hors résultat, déjà dit), avec la saisie à la main de la même issue s'il y en a une. */
function ligneDuPronostic(p, saisies, maintenant, match) {
  const memes = (saisies ?? []).filter((s) => memeSelection(s, p));
  const saisie = meilleureSaisie(memes, maintenant);
  return {
    cle: `${p.marketId}:${p.params?.team ?? ''}:${p.params?.side ?? p.params?.outcome ?? p.params?.key ?? ''}:${p.params?.line ?? ''}`,
    groupe: null,
    marketId: p.marketId,
    marche: p.market,
    libelle: p.predictedLabel,
    // L'équipe visée (pour son logo) : par les données du pronostic d'abord, jamais par le nom ; aucune pour le total, le nul ou « les deux marquent ».
    camp: campsDe(p, { home: match?.home ?? null, away: match?.away ?? null })[0] ?? null,
    pronostic: p,
    choisi: true,
    probabilite: probabiliteDeLaCoteJuste(p.predictedOdds),
    coteJuste: nombre(p.predictedOdds),
    source: null,
    verdict: null,
    verdictAbsent: false,
    meilleureCote: coteDeLaSaisie(saisie, maintenant),
    saisie,
    autresSaisies: Math.max(0, memes.length - (saisie ? 1 : 0)),
    confiance: CONFIANCE_NON_MESUREE,
    manque: saisie ? null : estSaisissable(p.marketId) ? 'Pas de cote chez vos bookmakers · à saisir' : 'Pas de cote chez vos bookmakers',
    manqueDetail: saisie
      ? null
      : estSaisissable(p.marketId)
        ? "The Odds API ne relève que le 1 / N / 2. Vue chez l'un de vos bookmakers, une cote se saisit sur la page du match (saisie express, onglet Marchés) : sa value s'affiche aussitôt face à la probabilité du moteur."
        : "Ce marché ne se relève pas chez vos bookmakers et ne se saisit pas encore : le moteur le calcule, mais aucune value ne peut s'y lire."
  };
}

/** Une saisie à la main sur une ligne ou un marché que le moteur ne pronostique pas : sa propre probabilité (celle du serveur pour CETTE ligne), ou pourquoi il n'en a pas. */
function ligneDeLaSaisie(s, maintenant) {
  return {
    cle: `saisie:${s.cle}`,
    groupe: 'saisies',
    marketId: s.marketId,
    marche: s.marche,
    libelle: s.libelle,
    camp: s.equipe ?? null,
    pronostic: null,
    choisi: false,
    probabilite: nombre(s.moteur?.probabilite),
    coteJuste: nombre(s.moteur?.coteJuste),
    source: s.moteur?.origine ?? null,
    verdict: null,
    verdictAbsent: false,
    meilleureCote: coteDeLaSaisie(s, maintenant),
    saisie: s,
    autresSaisies: 0,
    confiance: CONFIANCE_NON_MESUREE,
    manque: null,
    manqueDetail: nombre(s.moteur?.probabilite) === null ? (s.moteur?.raison ?? AUCUN_MOTEUR) : null
  };
}

// ------------------------------------------------------- la lecture d'une ligne

/** L'état de la value d'une ligne, À L'HEURE QU'IL EST — celui que dit sa pastille (etatVerdict, ou etatValue pour une saisie). */
export function etatDeLaLigne(ligne, regle = null, maintenant = Date.now()) {
  if (ligne.verdict) return etatVerdict(ligne.verdict, maintenant);
  if (ligne.saisie) {
    const s = ligne.saisie;
    return etatValue({
      pourcent: nombre(s.pourcent),
      jouable: Boolean(s.jouable),
      cote: nombre(s.cote),
      regle,
      fraicheur: s.fraicheur ? fraicheurVivante(s.fraicheur, maintenant) : null
    });
  }
  return null;
}

/**
 * LE VERDICT PAR MARCHÉ d'un match : les groupes de lignes, dans l'ordre de la
 * décision — le résultat (une ligne par issue), puis chaque famille de marchés
 * du moteur, puis les cotes saisies sur ce que le moteur ne pronostique pas.
 *
 * @param {object} p
 * @param {object} p.result      l'analyse (GET /api/analysis/match/:id)
 * @param {{home?: string, away?: string}} p.match
 * @param {object|null} p.saisies  GET /api/odds/saisies?matchId= (ou null : pas lu)
 * @param {number} p.maintenant  l'instant de lecture (ms)
 * @returns {{ groupes: object[], lignes: object[], resume: object, regle: object|null, sansCotes: boolean }}
 */
export function verdictsParMarche({ result, match = {}, saisies = null, maintenant = Date.now() } = {}) {
  const lignesSaisies = saisies?.saisies ?? [];
  const pronostics = (result?.marketPredictions ?? []).filter((p) => p?.marketId !== 'result');
  const dejaDit = new Set();
  const groupes = [];

  groupes.push({ cle: 'resultat', titre: 'Résultat', soustitre: '1 / N / 2', lignes: lignesDuResultat(result, match, maintenant) });

  const pris = new Set();
  for (const f of FAMILLES_DU_VERDICT) {
    // Dans l'ordre de la famille (comme MarketPicksBoard : « Résultat + Total buts » puis « Les deux équipes marquent »), l'ordre du moteur à égalité.
    const lignes = pronostics
      .filter((p) => f.ids.includes(p.marketId))
      .sort((a, b) => f.ids.indexOf(a.marketId) - f.ids.indexOf(b.marketId))
      .map((p) => {
        pris.add(p);
        const l = ligneDuPronostic(p, lignesSaisies, maintenant, match);
        for (const s of lignesSaisies) if (memeSelection(s, p)) dejaDit.add(s.cle);
        return { ...l, groupe: f.cle };
      });
    if (lignes.length) groupes.push({ cle: f.cle, titre: f.titre, soustitre: null, lignes });
  }
  // Un pronostic qu'aucune famille ne range (marché ajouté depuis) : rien ne disparaît.
  const restants = pronostics.filter((p) => !pris.has(p));
  if (restants.length) {
    groupes.push({
      cle: 'autres',
      titre: 'Autres marchés',
      soustitre: null,
      lignes: restants.map((p) => {
        const l = ligneDuPronostic(p, lignesSaisies, maintenant, match);
        for (const s of lignesSaisies) if (memeSelection(s, p)) dejaDit.add(s.cle);
        return { ...l, groupe: 'autres' };
      })
    });
  }
  // Les cotes saisies sur une autre ligne ou un autre marché (cartons, buteur…) : leur propre probabilité, ou pourquoi il n'y en a pas.
  const autresSaisies = lignesSaisies.filter((s) => !dejaDit.has(s.cle));
  if (autresSaisies.length) {
    groupes.push({
      cle: 'saisies',
      titre: 'Autres cotes saisies à la main',
      soustitre: 'autre ligne ou autre marché que le pronostic du moteur',
      lignes: autresSaisies.map((s) => ligneDeLaSaisie(s, maintenant))
    });
  }

  const regle = saisies?.regle ?? null;
  const lignes = groupes.flatMap((g) => g.lignes);
  // Les values jouables à cette minute : vertes selon la pastille — la décision du serveur, vieillie à l'horloge —, dites une par une.
  const valeurs = lignes
    .filter((l) => etatDeLaLigne(l, regle, maintenant)?.vert)
    .map((l) => {
      const pourcent = nombre(l.verdict ? l.verdict.pourcent : l.saisie?.pourcent);
      return {
        cle: l.cle,
        libelle: l.libelle,
        pourcent,
        texte: `${l.libelle}${pourcent === null ? '' : ` ${pourcentSigne(pourcent)}`}${l.meilleureCote?.livre ? ` chez ${l.meilleureCote.livre}` : ''}`
      };
    });
  return {
    groupes,
    lignes,
    regle,
    sansCotes: result?.market?.available === false || result?.staking?.reason === 'no_market_odds',
    resume: {
      lignes: lignes.length,
      marches: new Set(lignes.map((l) => `${l.marketId}`)).size,
      vertes: valeurs.length,
      valeurs,
      saisies: lignesSaisies.length
    }
  };
}

// ------------------------------------------------------- la phrase de décision

/**
 * Quand le moteur ne conseille aucun pari : la raison, en une phrase (les raisons
 * de findValueBet / verdictPari.js ; une value « à rafraîchir » a sa propre
 * carte sur la page). Pour Pierre : ce qui manque ou ce qui bloque, jamais un
 * simple « aucun pari ».
 */
export function phraseSansPari(staking) {
  if (staking?.action === 'CIRCUIT_BREAKER_ACTIVE') {
    // Étape 11 : enclenché par un garde-fou de Pierre (perte maximale de la semaine…) — le serveur dit lequel.
    const cc = staking.coupeCircuit;
    if (cc?.motif && cc.motif !== 'manuel' && cc.texte) return `Le coupe-circuit de Réglages est enclenché (${cc.texte}) : aucun pari n'est conseillé tant qu'il l'est.`;
    return "Le coupe-circuit de Réglages est enclenché : aucun pari n'est conseillé tant qu'il l'est.";
  }
  switch (staking?.reason) {
    case 'no_market_odds':
      return 'Pas de cote de marché pour ce match : le pronostic vient des statistiques, et un pari ne se conseille que face à des cotes.';
    case 'trop_peu_de_bookmakers':
      return "Pas assez de bookmakers de référence pour fixer la cote juste de ce match : aucune value ne peut s'y lire.";
    case 'aucun_bookmaker_autorise':
      return 'Aucun de vos bookmakers ne cote ce match dans le dernier relevé : seulement des cotes de référence, qui ne servent jamais à parier.';
    case 'bookmakers_juges':
      return 'Les bookmakers qui cotent ce match ont eux-mêmes fixé la cote juste : juge et partie, aucune value possible contre eux.';
    case 'cotes_incoherentes':
      return 'Les cotes de vos bookmakers sont incomplètes ou incohérentes pour ce match, sans doute périmées : aucune value ne se lit sur elles.';
    case 'pas_de_value':
      return "Aucune value chez vos bookmakers : aucune de leurs cotes ne dépasse la cote juste de plus que le seuil du moteur.";
    case 'value_hors_limites':
      return 'Une cote paie au-dessus de la cote juste, mais hors des limites du moteur (cote trop haute, ou avantage trop beau pour être vrai) : le moteur ne la conseille pas.';
    case 'a_rafraichir':
      return 'Les cotes de ce match sont à rafraîchir : elles ne sont pas une value tant qu\'elles ne sont pas relevées de nouveau.';
    default:
      return 'Aucun pari conseillé par le moteur pour ce match.';
  }
}
