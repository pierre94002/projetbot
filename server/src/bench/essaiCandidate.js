/**
 * essaiCandidate.js — L'ESSAI À BLANC d'une version candidate, prêt pour le juge (étape 25 du plan, seconde moitié, 14/10/2026).
 * -----------------------------------------------------------------------
 * Une candidate (core/engine/engineVersions.js) est calculée à blanc chaque
 * nuit à côté de la version en service (data/enregistreurs/moteurABlanc.js) :
 * pour chaque match à venir et chaque marché qu'elle change, les DEUX
 * distributions sur la même ligne (table engine_candidate_picks). Une fois les
 * matchs joués, ce fichier en fait les LIGNES APPARIÉES du juge de l'étape 16
 * (guard.js, jugerEtape) :
 *   - la révision retenue de chaque match × marché est la DERNIÈRE gelée avant
 *     le coup d'envoi (revisionsRetenues de la calibration, étape 20 : coup
 *     d'envoi du magasin, sinon celui du gel ; inconnu, seulement les
 *     révisions d'avant le jour du match) ;
 *   - le match est réglé comme la calibration et le banc d'essai (le règlement
 *     de la rencontre du magasin, issueDuPronostic : score de la 90e minute,
 *     match attribué écarté, corners ou tirs non relevés écartés) ;
 *   - chaque version est notée par LA note du banc (metrics.js, perteLog) sur
 *     SA distribution : a = la version en service, b = la candidate ; plus
 *     petit = mieux ;
 *   - seules comptent les lignes de CETTE candidate (son empreinte) calculées
 *     face à CETTE version en service (celle du début de l'essai) : une
 *     candidate modifiée ou une version en service changée recommencent
 *     l'essai, rien n'est mélangé.
 * Le juge ne voit QUE des matchs joués après le début de l'essai : le
 * lancement qu'on lui passe est celui de l'essai (lancementDeLEssai), daté du
 * jour de Paris de sa mise à blanc ; les données déjà vues (DONNEES_VUES) et
 * les variantes déclarées au registre de la mesure sont les siennes.
 *
 * L'HORIZON (l'arrêt optionnel, guard.js) : regarder chaque nuit et adopter au
 * premier « retenu » fabriquerait de fausses preuves. Le jugement qui décide
 * est donc pris UNE fois, à un horizon fixé d'avance — assez de matchs joués
 * (600 par défaut, jamais moins que le minimum du juge, 200) ET assez de jours
 * (14 par défaut, au moins 7 : plusieurs journées de championnat). Avant, la
 * carte montre les premiers chiffres, sans verdict.
 *
 * Pur : ne lit ni base ni fichier ; `lire` (la rencontre d'un match) vient de
 * l'appelant. Aucun hasard.
 * -----------------------------------------------------------------------
 */

import { perteLog } from './metrics.js';
import { issueDuPronostic, revisionsRetenues } from '../data/calibration.js';
import { horizonAtteint } from './horizonEssai.js';

/** La note du juge pour l'essai : la perte log (metrics.js), celle du banc d'essai et de la note de départ. */
export const MESURE_DE_L_ESSAI = 'perte-log';
export { HORIZON_PAR_DEFAUT, HORIZON_MINIMUM, horizonDe, horizonAtteint, lancementDeLEssai, jourParis } from './horizonEssai.js';

/** Pourquoi une ligne à blanc n'entre pas dans le jugement : chaque raison comptée, jamais en silence. */
export const RAISONS_DE_L_ESSAI = Object.freeze({
  autreEmpreinte: 'Calculée par une version précédente de la candidate (modifiée depuis)',
  autreVersionEnService: 'Calculée face à une autre version en service que celle de l’essai',
  sansDistribution: 'Une des deux distributions manque',
  issueAbsente: 'L’issue réalisée n’est pas dans la distribution (ligne illisible)',
  sansIdentifiant: 'Club reconnu par son nom seulement : la rencontre ne se lit pas au magasin',
  sansResultat: 'Résultat absent du magasin (match reporté, pas encore importé, ou introuvable)',
  rencontreAmbigue: 'Deux rencontres possibles au magasin : aucune n’est prise au hasard',
  sansScore: 'Rencontre au magasin sans score',
  attribue: 'Match attribué sur tapis vert : rien à régler',
  prolongationSansScore90: 'Match prolongé sans le score de la 90e minute',
  prolongationStats: 'Match prolongé : ses corners et ses tirs couvrent 120 minutes',
  statNonRelevee: 'Corners ou tirs non relevés au magasin',
  nonReglable: 'Aucune règle de règlement pour cette ligne',
  apresCoupDEnvoi: 'Calculée après le coup d’envoi',
  heureInconnue: 'Calculée le jour du match, heure du coup d’envoi inconnue'
});

const compter = (obj, cle, n = 1) => {
  obj[cle] = (obj[cle] ?? 0) + n;
};
const moyenne = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);

// ------------------------------------------------------------ le règlement d'une ligne

/** Le nom de marché que le règlement reconnaît pour les marchés sans paramètre (settlementRules.js). */
const MARCHE_DU_REGLEMENT = Object.freeze({ result: 'Résultat', bothTeamsScore: 'Les 2 équipes marquent', resultAndTotal: 'Résultat + Total buts' });

/**
 * L'issue RÉALISÉE d'une ligne à blanc (son marché, la ligne et l'équipe de sa distribution), d'après le règlement
 * de la rencontre — par la règle de la calibration (issueDuPronostic), jamais une règle à part. Rend { issue }
 * (une clé des issues de la distribution : home/draw/away, over/under, yes/no, homeOver…) ou { raison }.
 */
export function issueDeLaLigne({ marketId, distribution }, reglement) {
  const ligne = Number.isFinite(distribution?.ligne) ? distribution.ligne : null;
  const equipe = distribution?.equipe === 'home' || distribution?.equipe === 'away' ? distribution.equipe : null;
  const params = { ...(ligne !== null ? { line: ligne } : {}), ...(equipe ? { team: equipe } : {}) };
  const pseudo = {
    choice: '—',
    marketId,
    market: MARCHE_DU_REGLEMENT[marketId] ?? '',
    label: marketId === 'resultAndTotal' && ligne !== null ? `Plus de ${ligne} buts` : null,
    params,
    homeName: null,
    awayName: null
  };
  const r = issueDuPronostic(pseudo, reglement);
  return r.raison ? { raison: r.raison } : { issue: r.issue };
}

const lireDistribution = (texte) => {
  if (!texte) return null;
  try {
    const d = typeof texte === 'string' ? JSON.parse(texte) : texte;
    return d && typeof d === 'object' && d.issues && typeof d.issues === 'object' ? d : null;
  } catch {
    return null;
  }
};

// ------------------------------------------------------------ les lignes du juge

/**
 * LES LIGNES DE L'ESSAI. `revisions` : toutes les lignes à blanc de la candidate (pronosticsABlanc). Options :
 * `empreinte` (celle de la candidate en essai), `versionEnService` (celle du début de l'essai), `lire({ fixtureKey,
 * homeId, awayId, date })` → la rencontre du magasin ({ coupDEnvoi, reglement } ou { raison }), `aujourdhui`
 * (jour UTC : un match d'après, ou d'aujourd'hui sans résultat, est « à venir », jamais écarté).
 * Rend { lignes, ecartees, aVenir: { pronostics, matchs }, parMarche } ; chaque match × marché est exactement
 * une chose : une ligne, écarté (sa raison) ou à venir.
 */
export function lignesDeLEssai(revisions, { empreinte, versionEnService, lire, aujourdhui }) {
  const groupes = new Map();
  for (const r of revisions ?? []) {
    const cle = `${r.fixtureKey}|${r.marketKey}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(r);
  }
  const lignes = [];
  const ecartees = {};
  const aVenir = { pronostics: 0, matchs: new Set() };
  const rencontres = new Map();
  for (const [cle, revs] of groupes) {
    const premiere = revs[0];
    const deCetteCandidate = revs.filter((r) => r.candidateHash === empreinte);
    if (!deCetteCandidate.length) {
      compter(ecartees, 'autreEmpreinte');
      continue;
    }
    const faceAuService = deCetteCandidate.filter((r) => r.serviceVersion === versionEnService);
    if (!faceAuService.length) {
      compter(ecartees, 'autreVersionEnService');
      continue;
    }
    const futur = premiere.date > aujourdhui;
    let rencontre = rencontres.get(premiere.fixtureKey);
    if (!rencontre) {
      rencontre = futur ? { aVenir: true } : lire({ fixtureKey: premiere.fixtureKey, homeId: premiere.homeId, awayId: premiere.awayId, date: premiere.date });
      if (rencontre.raison && !futur && premiere.date >= aujourdhui && (rencontre.raison === 'sansResultat' || rencontre.raison === 'sansScore')) rencontre = { aVenir: true };
      rencontres.set(premiere.fixtureKey, rencontre);
    }
    if (rencontre.aVenir) {
      aVenir.pronostics++;
      aVenir.matchs.add(premiere.fixtureKey);
      continue;
    }
    const retenues = revisionsRetenues(
      faceAuService.map((r) => ({ ...r, version: r.revision })),
      { coupDEnvoi: rencontre.coupDEnvoi ?? faceAuService.find((r) => r.kickoff)?.kickoff ?? null, jour: premiere.date }
    );
    const r = retenues.derniere;
    if (!r) {
      compter(ecartees, retenues.raisonDerniere ?? 'heureInconnue');
      continue;
    }
    if (rencontre.raison) {
      compter(ecartees, rencontre.raison);
      continue;
    }
    const da = lireDistribution(r.serviceDistribution);
    const db = lireDistribution(r.distribution);
    if (!da || !db) {
      compter(ecartees, 'sansDistribution');
      continue;
    }
    const reglee = issueDeLaLigne({ marketId: r.marketId, distribution: db }, rencontre.reglement);
    if (reglee.raison) {
      compter(ecartees, reglee.raison);
      continue;
    }
    if (!Object.hasOwn(da.issues, reglee.issue) || !Object.hasOwn(db.issues, reglee.issue)) {
      compter(ecartees, 'issueAbsente');
      continue;
    }
    let a;
    let b;
    try {
      a = perteLog(da.issues, reglee.issue);
      b = perteLog(db.issues, reglee.issue);
    } catch {
      compter(ecartees, 'issueAbsente');
      continue;
    }
    lignes.push({ bloc: r.fixtureKey, match: r.fixtureKey, cle, date: r.date, marketId: r.marketId, issue: reglee.issue, a: a.valeur, b: b.valeur, ecreteeA: a.ecretee, ecreteeB: b.ecretee });
  }
  return { lignes, ecartees, aVenir: { pronostics: aVenir.pronostics, matchs: aVenir.matchs.size }, parMarche: parMarche(lignes) };
}

/** Par marché, dans l'ordre d'apparition : lignes, matchs, perte log moyenne de chaque version. */
export function parMarche(lignes) {
  const m = new Map();
  for (const l of lignes) {
    if (!m.has(l.marketId)) m.set(l.marketId, []);
    m.get(l.marketId).push(l);
  }
  return [...m.entries()].map(([marketId, ls]) => ({
    marketId,
    lignes: ls.length,
    matchs: new Set(ls.map((l) => l.bloc)).size,
    a: moyenne(ls.map((l) => l.a)),
    b: moyenne(ls.map((l) => l.b))
  }));
}

// ------------------------------------------------------------ ce qu'on garde d'un jugement

const nombre = (x, d = 6) => (typeof x === 'number' && Number.isFinite(x) ? Number(x.toFixed(d)) : null);

/** Les « premiers chiffres » (avant l'horizon) : comptes et moyennes, JAMAIS de verdict ni de fourchette. */
export function premiersChiffres(jugement, { essai, horizon, maintenant, reglement }) {
  const etat = horizonAtteint({ matchs: jugement?.n?.matchs ?? 0, depuis: essai.depuis, maintenant, horizon });
  return {
    calculeLe: new Date(maintenant).toISOString(),
    matchs: jugement?.n?.matchs ?? 0,
    lignes: jugement?.n?.lignes ?? 0,
    a: nombre(jugement?.a?.moyenne),
    b: nombre(jugement?.b?.moyenne),
    gainPct: nombre(jugement?.enPourcent?.gain, 3),
    horizon,
    joursEcoules: etat.jours,
    auPlusTotLe: etat.auPlusTotLe,
    aVenir: reglement.aVenir,
    ecartees: { ...reglement.ecartees, ...(jugement?.ecartees?.avantLancement ? { avantLancement: jugement.ecartees.avantLancement } : {}), ...(jugement?.ecartees?.donneesVues ? { donneesVues: jugement.ecartees.donneesVues } : {}) },
    parMarche: reglement.parMarche.map((p) => ({ ...p, a: nombre(p.a), b: nombre(p.b) }))
  };
}

/** Le jugement PRINCIPAL rangé avec la candidate (le registre de la mesure garde le jugement complet). */
export function resumeDuJugement(j, { essai, versionEnService, empreinte, reglement }) {
  return {
    le: j.le,
    principal: true,
    verdict: j.verdict,
    raison: j.raison,
    matchs: j.n?.matchs ?? 0,
    lignes: j.n?.lignes ?? 0,
    a: nombre(j.a?.moyenne),
    b: nombre(j.b?.moyenne),
    gainPct: nombre(j.enPourcent?.gain, 3),
    fourchettePct: Array.isArray(j.enPourcent?.fourchette) ? j.enPourcent.fourchette.map((x) => nombre(x, 3)) : null,
    quoi: j.enPourcent?.quoi ?? '',
    variantes: j.seuil?.variantes ?? null,
    fenetre: j.fenetre ?? null,
    lancement: j.lancement ?? null,
    ecartees: { ...reglement.ecartees, ...(j.ecartees ?? {}) },
    parMarche: reglement.parMarche.map((p) => ({ ...p, a: nombre(p.a), b: nombre(p.b) })),
    versionEnService,
    empreinte,
    essai: essai.numero ?? 1
  };
}
